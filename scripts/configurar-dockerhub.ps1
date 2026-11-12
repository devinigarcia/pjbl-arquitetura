<#
.SYNOPSIS
  Grava os secrets do Docker Hub nos três repositórios que publicam imagem e dispara o CI de novo.

.DESCRIPTION
  Pede o usuário do Docker Hub e um Access Token (a digitação do token fica oculta), confere se o
  token funciona, grava DOCKERHUB_USERNAME e DOCKERHUB_TOKEN como secrets do GitHub Actions em
  pjbl-bff, pjbl-ms-produtos e pjbl-ms-pedidos e reexecuta o CI, que então publica as imagens.

  O token não é salvo em arquivo nenhum: vai direto para os secrets do GitHub (que ninguém consegue ler de volta).
  Pré-requisito: GitHub CLI logado (gh auth login).

  Como criar o token: hub.docker.com > Account settings > Personal access tokens > Generate new token,
  com permissão "Read & Write".
#>
[CmdletBinding()]
param([string] $GitHubUser = 'devinigarcia')

$ErrorActionPreference = 'Stop'
$repos = 'pjbl-bff', 'pjbl-ms-produtos', 'pjbl-ms-pedidos'

$user = (Read-Host 'Usuario do Docker Hub').Trim()
if (-not $user) { throw 'Informe o usuario do Docker Hub.' }
$secure = Read-Host -AsSecureString 'Access Token do Docker Hub (cole e tecle Enter - nao aparece na tela)'
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim() }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
if (-not $token) { throw 'O token veio vazio.' }

Write-Host 'Conferindo o token no Docker Hub...'
try {
    $body = @{ username = $user; password = $token } | ConvertTo-Json
    Invoke-RestMethod -Method Post -Uri 'https://hub.docker.com/v2/users/login' -ContentType 'application/json' -Body $body | Out-Null
    Write-Host '  token valido.' -ForegroundColor Green
}
catch {
    throw "O Docker Hub recusou esse usuario/token. Confira o nome de usuario e gere um token novo com permissao Read & Write. ($($_.Exception.Message))"
}

foreach ($repo in $repos) {
    $full = "$GitHubUser/$repo"
    & gh secret set DOCKERHUB_USERNAME --repo $full --body $user
    if ($LASTEXITCODE -ne 0) { throw "Nao consegui gravar o secret em $full" }
    & gh secret set DOCKERHUB_TOKEN --repo $full --body $token
    if ($LASTEXITCODE -ne 0) { throw "Nao consegui gravar o secret em $full" }

    # reexecuta o ultimo CI: agora o job de imagem encontra os secrets e publica
    $runId = & gh run list --repo $full --workflow CI --limit 1 --json databaseId --jq '.[0].databaseId'
    if ($runId) { & gh run rerun $runId --repo $full | Out-Null }
    Write-Host "  $repo : secrets gravados e CI reexecutado" -ForegroundColor Green
}
$token = $null

# anota o usuario (nao e segredo) para os READMEs e o PDF
$linksPath = Join-Path $PSScriptRoot '..\links.json'
if (Test-Path $linksPath) {
    $links = Get-Content -Raw $linksPath | ConvertFrom-Json
    $links.DOCKERHUB_USER = $user
    [IO.File]::WriteAllText($linksPath, ($links | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
}

Write-Host ''
Write-Host 'Pronto. Em alguns minutos as imagens aparecem em:' -ForegroundColor Green
foreach ($repo in $repos) { Write-Host "  https://hub.docker.com/r/$user/$repo" }
