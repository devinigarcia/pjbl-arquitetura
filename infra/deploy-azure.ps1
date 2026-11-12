<#
.SYNOPSIS
  Sobe toda a parte Azure do Conecta Store. Pode rodar quantas vezes quiser (idempotente).

.DESCRIPTION
  Cria, nesta ordem:
    1. Resource group
    2. Storage Account + fila "order-events" (a mesma conta serve de AzureWebJobsStorage da Function)
    3. Azure SQL (servidor + banco na oferta gratuita serverless) + regra de firewall para serviços Azure
    4. Ambiente do Azure Container Apps
    5. ms-produtos e ms-pedidos (imagens do Docker Hub)
    6. Function App (Flex Consumption, Node 22) + publicação do código
    7. BFF (imagem do Docker Hub)
    8. API Management Consumption (gateway) - via gateway/azure-apim/configurar-apim.ps1
  No final grava links.json (só URLs, nenhum segredo) e mostra o que falta fazer.

  Segredos: a senha do SQL, as chaves internas e o segredo do gateway são GERADOS a cada execução
  e vão direto para os recursos (secrets do Container Apps / app settings). Nada é impresso nem salvo
  em arquivo do repositório. A connection string do MongoDB Atlas é pedida de forma oculta.

  Pré-requisitos: Azure CLI logado (az login), imagens já publicadas no Docker Hub, Node 22+.

.EXAMPLE
  ./deploy-azure.ps1 -DockerHubUser meuusuario

.EXAMPLE
  ./deploy-azure.ps1 -DockerHubUser meuusuario -PublisherEmail eu@exemplo.com -Location eastus2 -MinReplicas 1
#>
[CmdletBinding()]
param(
    # Usuário do Docker Hub onde estão as imagens. Só é dispensável com -OnlyBase.
    [string] $DockerHubUser,
    # E-mail de contato do API Management. Se nao for informado, usa o e-mail da conta logada na Azure.
    [string] $PublisherEmail,
    [string] $Location = 'brazilsouth',
    # Algumas assinaturas de estudante só liberam certas regiões; estes dois permitem variar só um serviço.
    [string] $FunctionLocation,
    [string] $ApimLocation,
    [string] $ResourceGroup = 'rg-pjbl',
    [string] $ImageTag = 'v1',
    # Sufixo dos nomes que precisam ser únicos no mundo. Por padrão sai do id da assinatura.
    [string] $Suffix,
    # 0 = os containers "dormem" sem uso (mais barato). Use 1 no dia da apresentação para não ter espera.
    [ValidateRange(0, 1)] [int] $MinReplicas = 0,
    # Pasta do projeto da Function (padrão: a pasta pjbl-function ao lado deste repositório)
    [string] $FunctionProjectPath,
    # Cria só a base que não depende das imagens nem do MongoDB (resource group, fila, Azure SQL e
    # ambiente do Container Apps) e para. Rodar de novo sem o switch continua de onde parou.
    [switch] $OnlyBase,
    [switch] $SkipFunctionCode,
    [switch] $SkipGateway
)

$ErrorActionPreference = 'Stop'
# Azure CLI recém-instalado pode ainda não estar no PATH deste terminal
$azDir = 'C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin'
if (-not (Get-Command az -ErrorAction SilentlyContinue) -and (Test-Path $azDir)) { $env:Path = "$azDir;$env:Path" }
if (-not $OnlyBase -and -not $DockerHubUser) { throw 'Informe -DockerHubUser (ou use -OnlyBase para criar só a base).' }
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $FunctionProjectPath) { $FunctionProjectPath = Join-Path $scriptDir '..\..\pjbl-function' }
if (-not $FunctionLocation) { $FunctionLocation = $Location }
if (-not $ApimLocation) { $ApimLocation = $Location }

# ------------------------------------------------------------------ utilidades
function Invoke-Az {
    $output = & az @args
    if ($LASTEXITCODE -ne 0) { throw "Falhou: az $($args -join ' ')" }
    return $output
}

function Test-AzResource {
    # true se o comando "az ... show" encontrar o recurso
    # No PowerShell 5.1, redirecionar o stderr de um programa externo com ErrorActionPreference = Stop
    # vira exceção. Aqui o "não encontrado" é uma resposta esperada, então baixamos para Continue.
    $ErrorActionPreference = 'Continue'
    & az @args --output none 2>&1 | Out-Null
    return ($LASTEXITCODE -eq 0)
}

function New-RandomSecret([int] $length = 40) {
    # só letras e números: passa sem problema por connection string, YAML e linha de comando
    $alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'.ToCharArray()
    $bytes = New-Object byte[] $length
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return -join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
}

function ConvertTo-PlainText([securestring] $secure) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function Write-Utf8File([string] $path, [string] $content) {
    [IO.File]::WriteAllText($path, $content, (New-Object Text.UTF8Encoding($false)))
}

function Step([string] $text) { Write-Host ''; Write-Host "== $text" -ForegroundColor Cyan }

function Publish-ContainerApp {
    <#
      Cria ou atualiza um Container App a partir de uma definição completa.
      A definição vai num arquivo (JSON é YAML válido) porque connection strings têm caracteres
      como & e % que a linha de comando do Windows estraga. O arquivo é apagado logo depois.
    #>
    param(
        [string] $Name, [string] $Image, [int] $Port,
        [hashtable] $Env = @{},        # variáveis comuns
        [hashtable] $Secrets = @{},    # nome-do-secret -> valor
        [hashtable] $SecretEnv = @{}   # VARIAVEL -> nome-do-secret
    )

    $envList = @()
    foreach ($key in ($Env.Keys | Sort-Object)) { $envList += @{ name = $key; value = [string] $Env[$key] } }
    foreach ($key in ($SecretEnv.Keys | Sort-Object)) { $envList += @{ name = $key; secretRef = $SecretEnv[$key] } }

    $secretList = @()
    foreach ($key in ($Secrets.Keys | Sort-Object)) { $secretList += @{ name = $key; value = [string] $Secrets[$key] } }

    $definition = @{
        location   = $Location
        properties = @{
            managedEnvironmentId = $script:environmentId
            configuration        = @{
                activeRevisionsMode = 'Single'
                ingress             = @{ external = $true; targetPort = $Port; transport = 'auto'; allowInsecure = $false }
                secrets             = $secretList
            }
            template             = @{
                containers = @(@{
                        name      = $Name
                        image     = $Image
                        resources = @{ cpu = 0.25; memory = '0.5Gi' }
                        env       = $envList
                        probes    = @(@{
                                type                = 'Readiness'
                                httpGet             = @{ path = '/health'; port = $Port }
                                initialDelaySeconds = 3
                                periodSeconds       = 10
                                timeoutSeconds      = 5
                            })
                    })
                # no máximo 1 réplica: é um projeto de faculdade e o relay do outbox do ms-pedidos não deve rodar duplicado
                scale      = @{ minReplicas = $MinReplicas; maxReplicas = 1 }
            }
        }
    }

    $file = Join-Path $script:workDir "$Name.yaml"
    Write-Utf8File $file ($definition | ConvertTo-Json -Depth 20)
    try {
        if (Test-AzResource containerapp show --name $Name --resource-group $ResourceGroup) {
            Write-Host "   atualizando $Name..."
            Invoke-Az containerapp update --name $Name --resource-group $ResourceGroup --yaml $file --output none
        }
        else {
            Write-Host "   criando $Name..."
            Invoke-Az containerapp create --name $Name --resource-group $ResourceGroup --yaml $file --output none
        }
    }
    finally { Remove-Item -Force $file -ErrorAction SilentlyContinue }
}

# ------------------------------------------------------------------ checagens iniciais
Step 'Conferindo o ambiente'
if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw 'Azure CLI não encontrado. Instale com: winget install Microsoft.AzureCLI  (e depois rode az login)'
}
$account = Invoke-Az account show --output json | ConvertFrom-Json
Write-Host "   assinatura: $($account.name)"
$subscriptionId = $account.id
if (-not $PublisherEmail) { $PublisherEmail = $account.user.name }
if (-not $Suffix) { $Suffix = ($subscriptionId -replace '-', '').Substring(0, 6).ToLower() }

$names = @{
    storage     = "stpjbl$Suffix"
    sqlServer   = "sql-pjbl-$Suffix"
    sqlDatabase = 'pjbl-pedidos'
    environment = 'cae-pjbl'
    function    = "func-pjbl-$Suffix"
    apim        = "apim-pjbl-$Suffix"
}
$sqlAdmin = 'pjbladmin'
$queueName = 'order-events'

Write-Host '   registrando provedores de recurso (pode demorar na primeira vez)...'
foreach ($provider in 'Microsoft.App', 'Microsoft.OperationalInsights', 'Microsoft.Sql', 'Microsoft.Storage', 'Microsoft.Web', 'Microsoft.ApiManagement') {
    Invoke-Az provider register --namespace $provider --wait --output none
}
Invoke-Az extension add --name containerapp --upgrade --only-show-errors --output none

$mongoUri = $env:MONGODB_URI
if ($OnlyBase) { $mongoUri = 'mongodb://nao-usado-no-modo-base' }
if (-not $mongoUri) {
    $mongoUri = ConvertTo-PlainText (Read-Host -AsSecureString 'Connection string do MongoDB Atlas (mongodb+srv://...) - a digitação fica oculta')
}
if ($mongoUri -notmatch '^mongodb(\+srv)?://') { throw 'A connection string do MongoDB precisa começar com mongodb:// ou mongodb+srv://' }

# Segredos novos a cada execução (todos os serviços são atualizados juntos, então continuam combinando).
$sqlPassword = (New-RandomSecret 28) + 'aZ9'
$produtosKey = New-RandomSecret
$pedidosKey = New-RandomSecret
$gatewaySecret = New-RandomSecret

$script:workDir = Join-Path ([IO.Path]::GetTempPath()) ("pjbl-deploy-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $script:workDir | Out-Null

try {
    # -------------------------------------------------------------- 1. resource group
    Step "1/8 Resource group $ResourceGroup ($Location)"
    Invoke-Az group create --name $ResourceGroup --location $Location --output none

    # -------------------------------------------------------------- 2. storage + fila
    Step "2/8 Storage Account $($names.storage) e fila $queueName"
    if (-not (Test-AzResource storage account show --name $names.storage --resource-group $ResourceGroup)) {
        Invoke-Az storage account create --name $names.storage --resource-group $ResourceGroup --location $Location `
            --sku Standard_LRS --kind StorageV2 --min-tls-version TLS1_2 --allow-blob-public-access false --output none
    }
    $storageConnection = Invoke-Az storage account show-connection-string --name $names.storage --resource-group $ResourceGroup --query connectionString -o tsv
    Invoke-Az storage queue create --name $queueName --connection-string $storageConnection --output none

    # -------------------------------------------------------------- 3. Azure SQL
    Step "3/8 Azure SQL $($names.sqlServer) / $($names.sqlDatabase) (oferta gratuita)"
    if (Test-AzResource sql server show --name $names.sqlServer --resource-group $ResourceGroup) {
        Invoke-Az sql server update --name $names.sqlServer --resource-group $ResourceGroup --admin-password $sqlPassword --output none
    }
    else {
        Invoke-Az sql server create --name $names.sqlServer --resource-group $ResourceGroup --location $Location `
            --admin-user $sqlAdmin --admin-password $sqlPassword --output none
    }
    # 0.0.0.0 é o jeito de dizer "permitir serviços do Azure" (os Container Apps saem por IPs da Azure)
    Invoke-Az sql server firewall-rule create --resource-group $ResourceGroup --server $names.sqlServer `
        --name AllowAzureServices --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0 --output none
    if (-not (Test-AzResource sql db show --name $names.sqlDatabase --server $names.sqlServer --resource-group $ResourceGroup)) {
        # --use-free-limit é o que torna o banco gratuito; AutoPause garante que nunca vira cobrança
        Invoke-Az sql db create --name $names.sqlDatabase --server $names.sqlServer --resource-group $ResourceGroup `
            --edition GeneralPurpose --family Gen5 --capacity 2 --compute-model Serverless `
            --use-free-limit true --free-limit-exhaustion-behavior AutoPause `
            --backup-storage-redundancy Local --yes --output none
    }
    $sqlConnection = "Server=tcp:$($names.sqlServer).database.windows.net,1433;Database=$($names.sqlDatabase);" +
    "User ID=$sqlAdmin;Password=$sqlPassword;Encrypt=true;TrustServerCertificate=false;Connection Timeout=60"

    # -------------------------------------------------------------- 4. ambiente de Container Apps
    Step "4/8 Ambiente do Container Apps $($names.environment)"
    if (-not (Test-AzResource containerapp env show --name $names.environment --resource-group $ResourceGroup)) {
        Invoke-Az containerapp env create --name $names.environment --resource-group $ResourceGroup --location $Location --output none
    }
    $environment = Invoke-Az containerapp env show --name $names.environment --resource-group $ResourceGroup --output json | ConvertFrom-Json
    $script:environmentId = $environment.id
    $domain = $environment.properties.defaultDomain
    $urls = @{
        produtos = "https://ms-produtos.$domain"
        pedidos  = "https://ms-pedidos.$domain"
        bff      = "https://bff.$domain"
    }

    if ($OnlyBase) {
        Step 'Base pronta'
        Write-Host '   resource group, fila, Azure SQL e ambiente do Container Apps criados.'
        Write-Host "   dominio dos apps: $domain"
        Write-Host '   Rode de novo sem -OnlyBase (e com -DockerHubUser) para criar os serviços.'
        return
    }

    # -------------------------------------------------------------- 5. microserviços
    Step '5/8 Microserviços (imagens do Docker Hub)'
    Publish-ContainerApp -Name 'ms-produtos' -Image "docker.io/$DockerHubUser/pjbl-ms-produtos:$ImageTag" -Port 3001 `
        -Env @{ PORT = 3001; DB_DRIVER = 'mongo'; MONGODB_DB = 'pjbl_produtos'; CORS_ORIGIN = '*'; LOG_LEVEL = 'info'; PUBLIC_URL = $urls.produtos } `
        -Secrets @{ 'mongodb-uri' = $mongoUri; 'internal-api-key' = $produtosKey } `
        -SecretEnv @{ MONGODB_URI = 'mongodb-uri'; INTERNAL_API_KEY = 'internal-api-key' }

    Publish-ContainerApp -Name 'ms-pedidos' -Image "docker.io/$DockerHubUser/pjbl-ms-pedidos:$ImageTag" -Port 3002 `
        -Env @{ PORT = 3002; DB_DRIVER = 'sql'; QUEUE_NAME = $queueName; OUTBOX_INTERVAL_MS = 3000; CORS_ORIGIN = '*'; LOG_LEVEL = 'info'; PUBLIC_URL = $urls.pedidos } `
        -Secrets @{ 'sql-connection-string' = $sqlConnection; 'queue-connection-string' = $storageConnection; 'internal-api-key' = $pedidosKey } `
        -SecretEnv @{ SQL_CONNECTION_STRING = 'sql-connection-string'; QUEUE_CONNECTION_STRING = 'queue-connection-string'; INTERNAL_API_KEY = 'internal-api-key' }

    # -------------------------------------------------------------- 6. Function App
    Step "6/8 Function App $($names.function) (Flex Consumption, Node 22)"
    if (-not (Test-AzResource functionapp show --name $names.function --resource-group $ResourceGroup)) {
        Invoke-Az functionapp create --name $names.function --resource-group $ResourceGroup --storage-account $names.storage `
            --flexconsumption-location $FunctionLocation --runtime node --runtime-version 22 --output none
    }
    Invoke-Az functionapp config appsettings set --name $names.function --resource-group $ResourceGroup --settings `
        "PRODUTOS_API_URL=$($urls.produtos)" "PRODUTOS_API_KEY=$produtosKey" "ORDER_EVENTS_QUEUE=$queueName" --output none

    if (-not $SkipFunctionCode) {
        $functionProject = (Resolve-Path $FunctionProjectPath).Path
        Write-Host "   empacotando o código de $functionProject ..."
        Push-Location $functionProject
        try {
            & npm ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw 'npm ci falhou no pjbl-function' }
            & npm run build; if ($LASTEXITCODE -ne 0) { throw 'build do pjbl-function falhou' }
        }
        finally { Pop-Location }

        # pacote só com o que roda em produção: dist + host.json + dependências sem as de desenvolvimento
        $stage = Join-Path $script:workDir 'function'
        New-Item -ItemType Directory -Path $stage | Out-Null
        Copy-Item -Recurse (Join-Path $functionProject 'dist') $stage
        Copy-Item (Join-Path $functionProject 'host.json'), (Join-Path $functionProject 'package.json'), (Join-Path $functionProject 'package-lock.json') $stage
        Push-Location $stage
        try {
            & npm ci --omit=dev --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw 'npm ci --omit=dev falhou' }
            # tar do Windows gera zip com barras normais (o Compress-Archive do PowerShell 5 usa "\" e quebra no Linux)
            & tar.exe -a -c -f ..\function.zip *; if ($LASTEXITCODE -ne 0) { throw 'não consegui gerar o zip da Function' }
        }
        finally { Pop-Location }
        Invoke-Az functionapp deployment source config-zip --name $names.function --resource-group $ResourceGroup `
            --src (Join-Path $script:workDir 'function.zip') --output none
    }
    $functionHost = Invoke-Az functionapp show --name $names.function --resource-group $ResourceGroup --query defaultHostName -o tsv
    $urls.function = "https://$functionHost"
    $functionKey = Invoke-Az functionapp keys list --name $names.function --resource-group $ResourceGroup --query functionKeys.default -o tsv

    # -------------------------------------------------------------- 7. BFF
    Step '7/8 BFF'
    $gatewayApiUrl = "https://$($names.apim).azure-api.net/conecta"
    Publish-ContainerApp -Name 'bff' -Image "docker.io/$DockerHubUser/pjbl-bff:$ImageTag" -Port 3000 `
        -Env @{
        PORT = 3000; PRODUTOS_API_URL = $urls.produtos; PEDIDOS_API_URL = $urls.pedidos; FUNCTION_URL = "$($urls.function)/api"
        # 30s: o banco gratuito pode levar um tempo para "acordar" na primeira chamada
        UPSTREAM_TIMEOUT_MS = 30000; CORS_ORIGIN = '*'; LOG_LEVEL = 'info'; PUBLIC_URL = $urls.bff; GATEWAY_URL = $gatewayApiUrl
    } `
        -Secrets @{ 'produtos-api-key' = $produtosKey; 'pedidos-api-key' = $pedidosKey; 'function-key' = $functionKey; 'gateway-secret' = $gatewaySecret } `
        -SecretEnv @{ PRODUTOS_API_KEY = 'produtos-api-key'; PEDIDOS_API_KEY = 'pedidos-api-key'; FUNCTION_KEY = 'function-key'; GATEWAY_SECRET = 'gateway-secret' }

    # -------------------------------------------------------------- 8. API Gateway
    $urls.gateway = $gatewayApiUrl
    if (-not $SkipGateway) {
        Step "8/8 API Gateway $($names.apim)"
        $secureSecret = ConvertTo-SecureString $gatewaySecret -AsPlainText -Force
        $gateway = & (Join-Path $scriptDir '..\gateway\azure-apim\configurar-apim.ps1') `
            -ResourceGroup $ResourceGroup -ApimName $names.apim -Location $ApimLocation -BffUrl $urls.bff `
            -PublisherEmail $PublisherEmail -GatewaySecret $secureSecret
        $urls.gateway = ($gateway | Select-Object -Last 1).ApiUrl
    }

    # -------------------------------------------------------------- links.json (sem segredos)
    $linksPath = Join-Path $scriptDir '..\links.json'
    $links = [ordered]@{}
    if (Test-Path $linksPath) {
        (Get-Content -Raw $linksPath | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $links[$_.Name] = $_.Value }
    }
    $links['DOCKERHUB_USER'] = $DockerHubUser
    $links['URL_GATEWAY'] = $urls.gateway
    $links['URL_BFF'] = $urls.bff
    $links['URL_MS_PRODUTOS'] = $urls.produtos
    $links['URL_MS_PEDIDOS'] = $urls.pedidos
    $links['URL_FUNCTION'] = $urls.function
    Write-Utf8File $linksPath ($links | ConvertTo-Json)

    Step 'Pronto'
    Write-Host "   API Gateway : $($urls.gateway)"
    Write-Host "   BFF         : $($urls.bff)/docs"
    Write-Host "   ms-produtos : $($urls.produtos)/docs"
    Write-Host "   ms-pedidos  : $($urls.pedidos)/docs   (eventos: /events/docs)"
    Write-Host "   Function    : $($urls.function)/api/docs"
    Write-Host ''
    Write-Host '   links.json atualizado. Próximos passos:'
    Write-Host '     1. no repositório do front, defina a variável VITE_API_URL e o secret VITE_API_KEY (ver README) e rode o deploy'
    Write-Host '     2. preencha URL_FRONTEND e URL_VIDEO no links.json'
    Write-Host '     3. node scripts/preencher-links.mjs   e   node scripts/seed.mjs'
}
finally {
    # arquivos temporários podem conter segredos em texto puro
    Remove-Item -Recurse -Force -Path $script:workDir -ErrorAction SilentlyContinue
    $mongoUri = $null; $sqlPassword = $null; $sqlConnection = $null; $storageConnection = $null
}
