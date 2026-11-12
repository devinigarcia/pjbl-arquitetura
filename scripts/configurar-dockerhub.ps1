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

Write-Host ''
Write-Host 'Agora o TOKEN. Nao e o nome que voce deu a ele (ex.: "pjbl"):' -ForegroundColor Yellow
Write-Host 'e o codigo longo que comeca com dckr_pat_ e aparece logo depois de clicar em Generate.' -ForegroundColor Yellow
$token = $null
while (-not $token) {
    $secure = Read-Host -AsSecureString 'Cole o token (dckr_pat_...) e tecle Enter - nao aparece na tela'
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $candidate = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim() }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }

    if ($candidate.Length -lt 20 -or -not $candidate.StartsWith('dckr_pat_')) {
        Write-Host "  Isso nao parece um token (vieram $($candidate.Length) caracteres). O token comeca com dckr_pat_ . Tente de novo." -ForegroundColor Red
        continue
    }
    $token = $candidate
}

# Confere do mesmo jeito que o "docker login" faz: pedindo um token de acesso ao registro.
Write-Host 'Conferindo o token no Docker Hub...'
try {
    $basic = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${user}:${token}"))
    $uri = "https://auth.docker.io/token?service=registry.docker.io&scope=repository:$user/pjbl-bff:push,pull"
    $answer = Invoke-RestMethod -Method Get -Uri $uri -Headers @{ Authorization = "Basic $basic" }
    if (-not $answer.token) { throw 'resposta sem token' }
    Write-Host '  token valido.' -ForegroundColor Green
}
catch {
    throw "O Docker Hub recusou esse usuario/token. Confira se o usuario esta certo (e o nome da conta, nao o e-mail) e gere um token novo com permissao Read & Write. ($($_.Exception.Message))"
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
