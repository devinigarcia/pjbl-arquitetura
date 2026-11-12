<#
.SYNOPSIS
  Cria (ou atualiza) o API Gateway do projeto no Azure API Management - camada Consumption.

.DESCRIPTION
  Pode rodar quantas vezes quiser: cada passo confere se o recurso já existe.
    1. cria a instância do APIM (Consumption não tem custo fixo; o primeiro milhão de chamadas/mês é gratuito)
    2. guarda o segredo do BFF como Named Value secreto
    3. importa a API a partir do OpenAPI do BFF
    4. aplica a policy (CORS, rate limit, x-gateway-secret)
    5. cria a subscription "microfrontend" (a chave que o front envia)

  O deploy-azure.ps1 chama este script no final, mas ele também funciona sozinho.

.EXAMPLE
  ./configurar-apim.ps1 -ResourceGroup rg-pjbl -ApimName apim-pjbl-ab12cd -Location brazilsouth `
      -BffUrl https://bff.exemplo.azurecontainerapps.io -PublisherEmail aluno@exemplo.com
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $ResourceGroup,
    [Parameter(Mandatory)] [string] $ApimName,
    [Parameter(Mandatory)] [string] $Location,
    [Parameter(Mandatory)] [string] $BffUrl,
    [Parameter(Mandatory)] [string] $PublisherEmail,
    [string] $PublisherName = 'Conecta Store - PJBL',
    [string] $ApiId = 'conecta-store',
    [string] $ApiPath = 'conecta',
    # Segredo que o gateway envia ao BFF. Se não for informado, é lido de forma oculta.
    [securestring] $GatewaySecret
)

$ErrorActionPreference = 'Stop'
$apiVersion = '2022-08-01'
# Azure CLI recém-instalado pode ainda não estar no PATH deste terminal
$azDir = 'C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin'
if (-not (Get-Command az -ErrorAction SilentlyContinue) -and (Test-Path $azDir)) { $env:Path = "$azDir;$env:Path" }

function Invoke-Az {
    # Roda o az e para o script se der erro (o PowerShell não faz isso sozinho com programas externos).
    $output = & az @args
    if ($LASTEXITCODE -ne 0) { throw "Falhou: az $($args -join ' ')" }
    return $output
}

function Test-Az {
    # true se o comando do az terminar com sucesso; o erro (ex.: recurso não existe) é esperado e fica em silêncio.
    # No PowerShell 5.1, redirecionar o stderr com ErrorActionPreference = Stop vira exceção, por isso o Continue.
    $ErrorActionPreference = 'Continue'
    & az @args --output none 2>&1 | Out-Null
    return ($LASTEXITCODE -eq 0)
}

function ConvertTo-PlainText([securestring] $secure) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function Write-JsonFile([string] $path, $object) {
    # UTF-8 sem BOM: o az não aceita BOM em arquivos passados com @arquivo
    $json = $object | ConvertTo-Json -Depth 20
    [IO.File]::WriteAllText($path, $json, (New-Object Text.UTF8Encoding($false)))
}

if (-not $GatewaySecret) {
    $GatewaySecret = Read-Host -AsSecureString 'Segredo do gateway (o mesmo valor de GATEWAY_SECRET do BFF)'
}

$BffUrl = $BffUrl.TrimEnd('/')
$subscriptionId = Invoke-Az account show --query id -o tsv
$apimResource = "/subscriptions/$subscriptionId/resourceGroups/$ResourceGroup/providers/Microsoft.ApiManagement/service/$ApimName"
$management = "https://management.azure.com$apimResource"
$workDir = Join-Path ([IO.Path]::GetTempPath()) ("pjbl-apim-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $workDir | Out-Null

try {
    # ---------- 1. instância ----------
    Write-Host "[1/5] API Management '$ApimName' (Consumption)..." -ForegroundColor Cyan
    if (-not (Test-Az apim show --name $ApimName --resource-group $ResourceGroup)) {
        Write-Host '      criando - costuma levar de 2 a 5 minutos...'
        Invoke-Az apim create --name $ApimName --resource-group $ResourceGroup --location $Location `
            --publisher-email $PublisherEmail --publisher-name $PublisherName --sku-name Consumption --output none
    }
    $gatewayUrl = Invoke-Az apim show --name $ApimName --resource-group $ResourceGroup --query gatewayUrl -o tsv

    # ---------- 2. named value com o segredo ----------
    Write-Host '[2/5] Named Value secreto bff-gateway-secret...' -ForegroundColor Cyan
    $namedValueFile = Join-Path $workDir 'named-value.json'
    Write-JsonFile $namedValueFile @{
        properties = @{ displayName = 'bff-gateway-secret'; value = (ConvertTo-PlainText $GatewaySecret); secret = $true }
    }
    Invoke-Az rest --method put --uri "$management/namedValues/bff-gateway-secret?api-version=$apiVersion" `
        --body "@$namedValueFile" --output none
    # o named value é criado de forma assíncrona; espera ficar disponível antes de usar na policy
    foreach ($attempt in 1..20) {
        if (Test-Az rest --method get --uri "$management/namedValues/bff-gateway-secret?api-version=$apiVersion") { break }
        Start-Sleep -Seconds 3
    }

    # ---------- 3. importa a API a partir do OpenAPI do BFF ----------
    Write-Host "[3/5] Importando a API a partir de $BffUrl/openapi.json ..." -ForegroundColor Cyan
    $specFile = Join-Path $workDir 'openapi.json'
    $spec = $null
    foreach ($attempt in 1..6) {
        try { $spec = Invoke-WebRequest -Uri "$BffUrl/openapi.json" -UseBasicParsing -TimeoutSec 60; break }
        catch { Write-Host "      BFF ainda acordando (tentativa $attempt de 6)..."; Start-Sleep -Seconds 10 }
    }
    if (-not $spec) { throw "Não consegui baixar $BffUrl/openapi.json. O BFF está no ar?" }
    [IO.File]::WriteAllText($specFile, $spec.Content, (New-Object Text.UTF8Encoding($false)))

    Invoke-Az apim api import --resource-group $ResourceGroup --service-name $ApimName `
        --api-id $ApiId --path $ApiPath --display-name 'Conecta Store BFF' `
        --specification-format OpenApiJson --specification-path $specFile `
        --service-url $BffUrl --protocols https --subscription-required true `
        --subscription-key-header-name 'Ocp-Apim-Subscription-Key' --subscription-key-query-param-name 'subscription-key' `
        --output none

    # ---------- 4. policy ----------
    Write-Host '[4/5] Aplicando a policy (CORS, rate limit, x-gateway-secret)...' -ForegroundColor Cyan
    # ReadAllText em vez de Get-Content: no PowerShell 5.1 o texto do Get-Content vem com propriedades
    # extras e o ConvertTo-Json entra em laço tentando serializá-las.
    $policyXml = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'policy.xml'))
    $policyFile = Join-Path $workDir 'policy.json'
    Write-JsonFile $policyFile @{ properties = @{ format = 'rawxml'; value = $policyXml } }
    # --output-file: a resposta desta chamada vem com BOM e o az no Windows falha ao tentar mostrá-la na tela
    Invoke-Az rest --method put --uri "$management/apis/$ApiId/policies/policy?api-version=$apiVersion" `
        --body "@$policyFile" --output-file (Join-Path $workDir 'policy-resposta.txt')

    # ---------- 5. subscription do front ----------
    Write-Host '[5/5] Subscription "microfrontend"...' -ForegroundColor Cyan
    $subscriptionFile = Join-Path $workDir 'subscription.json'
    Write-JsonFile $subscriptionFile @{
        properties = @{ displayName = 'Microfrontend Conecta Store'; scope = "/apis/$ApiId"; state = 'active' }
    }
    Invoke-Az rest --method put --uri "$management/subscriptions/microfrontend?api-version=$apiVersion" `
        --body "@$subscriptionFile" --output none

    $apiUrl = "$gatewayUrl/$ApiPath"
    Write-Host ''
    Write-Host 'API Gateway pronto.' -ForegroundColor Green
    Write-Host "  URL para o front (VITE_API_URL): $apiUrl"
    Write-Host '  A chave do front NÃO é impressa aqui. Para ver/copiar:'
    Write-Host "    az rest --method post --uri `"$management/subscriptions/microfrontend/listSecrets?api-version=$apiVersion`" --query primaryKey -o tsv"
    Write-Host '  Teste rápido (deve dar 401 sem chave e 200 com chave):'
    Write-Host "    curl -i $apiUrl/aggregated-data"
    Write-Host "    curl -i -H `"Ocp-Apim-Subscription-Key: <chave>`" $apiUrl/aggregated-data"

    # devolve os dados para quem chamou (deploy-azure.ps1)
    return [pscustomobject]@{ GatewayUrl = $gatewayUrl; ApiUrl = $apiUrl; ManagementUri = $management; ApiVersion = $apiVersion }
}
finally {
    # os arquivos temporários têm o segredo em texto puro; apaga sempre
    Remove-Item -Recurse -Force -Path $workDir -ErrorAction SilentlyContinue
}
