<#
.SYNOPSIS
  Regrava a connection string do MongoDB Atlas no ms-produtos (quando a senha do usuário do banco mudou).

.DESCRIPTION
  Lê a senha da área de transferência (copie no site do Atlas com o botão Copy), testa a conexão e,
  se funcionar, atualiza o secret "mongodb-uri" do Container App e reinicia o serviço.
  A senha não é mostrada nem gravada em arquivo.

.EXAMPLE
  ./atualizar-senha-mongo.ps1 -MongoHost cluster0.xxxxx.mongodb.net -MongoUser usuario_do_banco
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $MongoHost,
    [Parameter(Mandatory)] [string] $MongoUser,
    [string] $ResourceGroup = 'rg-pjbl',
    [string] $App = 'ms-produtos'
)

$ErrorActionPreference = 'Stop'
$azDir = 'C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin'
if (-not (Get-Command az -ErrorAction SilentlyContinue) -and (Test-Path $azDir)) { $env:Path = "$azDir;$env:Path" }
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Test-MongoUri([string] $uri, [bool] $quiet = $false) {
    $produtos = Join-Path $scriptDir '..\..\pjbl-ms-produtos'
    $env:PJBL_MONGO_TEST = $uri
    Push-Location $produtos
    try {
        $ErrorActionPreference = 'Continue'
        & node -e "const d=require('dns');d.setServers(['8.8.8.8','1.1.1.1']);d.promises.setServers(['8.8.8.8','1.1.1.1']);const{MongoClient}=require('mongodb');const c=new MongoClient(process.env.PJBL_MONGO_TEST,{serverSelectionTimeoutMS:20000});c.db('admin').command({ping:1}).then(()=>c.close()).then(()=>process.exit(0)).catch(e=>{console.log('   motivo: '+e.message);process.exit(1)})" 2>&1 | ForEach-Object { if (-not $quiet) { Write-Host "$_" } }
        return ($LASTEXITCODE -eq 0)
    }
    finally {
        Pop-Location
        Remove-Item Env:PJBL_MONGO_TEST -ErrorAction SilentlyContinue
    }
}

Write-Host ''
Write-Host 'Procurando a senha do MongoDB na area de transferencia...' -ForegroundColor Yellow
Write-Host 'Se ela nao estiver la, va ao site do Atlas (tela do usuario do banco) e clique, UMA vez so e nesta ordem:'
Write-Host '   1) Autogenerate Secure Password   2) Copy   3) Update User'
Write-Host ''

$mongoUri = $null
$lastTried = $null
$deadline = (Get-Date).AddMinutes(30)
while (-not $mongoUri -and (Get-Date) -lt $deadline) {
    $clip = $null
    try { $clip = Get-Clipboard -Raw -ErrorAction Stop } catch { }
    if ($clip) {
        $clip = "$clip".Trim()
        if ($clip.Length -ge 8 -and $clip.Length -le 80 -and $clip -notmatch '\s') {
            if ($clip -ne $lastTried) { Write-Host '   senha copiada detectada, testando a conexao...' }
            # sem "&" na connection string: o az no Windows passa pelo cmd.exe, que trata & como separador
            $candidate = "mongodb+srv://$([uri]::EscapeDataString($MongoUser)):$([uri]::EscapeDataString($clip))@$MongoHost/?appName=ConectaStore"
            if (Test-MongoUri $candidate ($clip -eq $lastTried)) {
                Write-Host '   conexao ok.' -ForegroundColor Green
                $mongoUri = $candidate
            }
            elseif ($clip -ne $lastTried) {
                Write-Host '   essa senha nao vale (ainda). Se acabou de gerar, clique em Update User no Atlas; sigo tentando.' -ForegroundColor DarkYellow
            }
            $lastTried = $clip
        }
    }
    $clip = $null
    if (-not $mongoUri) { Start-Sleep -Seconds 4 }
}
if (-not $mongoUri) { throw 'Nao recebi uma senha valida em 30 minutos. Rode o script de novo.' }

Write-Host "Gravando o secret no $App e reiniciando..."
# chama o Python do az direto (sem o az.cmd) para caracteres especiais da senha nao serem interpretados pelo cmd.exe
$python = 'C:\Program Files\Microsoft SDKs\Azure\CLI2\python.exe'
if (Test-Path $python) {
    & $python -IBm azure.cli containerapp secret set --name $App --resource-group $ResourceGroup --secrets "mongodb-uri=$mongoUri" --output none
}
else {
    & az containerapp secret set --name $App --resource-group $ResourceGroup --secrets "mongodb-uri=$mongoUri" --output none
}
if ($LASTEXITCODE -ne 0) { throw 'Nao consegui gravar o secret no Container App.' }
$mongoUri = $null

# Mudar uma variável de ambiente cria uma revisão nova, que já sobe lendo o secret atualizado.
# (Ambientes do tipo "Express" não aceitam "revision restart".)
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss')
& az containerapp update --name $App --resource-group $ResourceGroup --set-env-vars "CONFIG_VERSION=$stamp" --output none
if ($LASTEXITCODE -ne 0) { throw 'Nao consegui reiniciar o Container App.' }

$fqdn = & az containerapp show --name $App --resource-group $ResourceGroup --query properties.configuration.ingress.fqdn -o tsv
Write-Host "Aguardando o $App responder em https://$fqdn/health ..."
foreach ($attempt in 1..20) {
    Start-Sleep -Seconds 6
    try {
        $health = Invoke-RestMethod -Uri "https://$fqdn/health" -TimeoutSec 20
        if ($health.status -eq 'ok') {
            Write-Host "Pronto: $App no ar, banco = $($health.database)." -ForegroundColor Green
            return
        }
    }
    catch { }
}
Write-Host "O $App ainda nao respondeu. Veja os logs: az containerapp logs show --name $App --resource-group $ResourceGroup --tail 30" -ForegroundColor Red
