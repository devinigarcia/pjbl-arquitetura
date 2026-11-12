<#
.SYNOPSIS
  Apaga TUDO o que o deploy-azure.ps1 criou (o resource group inteiro). Não tem volta.

.DESCRIPTION
  Use depois da apresentação/correção, para não deixar recurso consumindo crédito.
  O script mostra o que existe no grupo e só apaga se você digitar o nome dele.
#>
[CmdletBinding()]
param([string] $ResourceGroup = 'rg-pjbl')

$ErrorActionPreference = 'Stop'

$exists = & az group exists --name $ResourceGroup
if ($exists -ne 'true') { Write-Host "O resource group $ResourceGroup não existe. Nada a fazer."; return }

Write-Host "Recursos em ${ResourceGroup}:" -ForegroundColor Yellow
& az resource list --resource-group $ResourceGroup --query '[].{nome:name, tipo:type}' --output table

Write-Host ''
Write-Host 'ATENÇÃO: isso apaga o banco SQL (com os pedidos), a fila, os containers, a Function e o gateway.' -ForegroundColor Red
Write-Host 'O cluster do MongoDB Atlas e as imagens do Docker Hub não são afetados.'
$typed = Read-Host "Para confirmar, digite o nome do resource group ($ResourceGroup)"
if ($typed -ne $ResourceGroup) { Write-Host 'Cancelado. Nada foi apagado.'; return }

& az group delete --name $ResourceGroup --yes --no-wait
Write-Host 'Exclusão iniciada (leva alguns minutos para terminar).'
Write-Host 'Obs.: o API Management fica em "soft delete" por 48h; se for recriar com o mesmo nome antes disso, rode:'
Write-Host '  az apim deletedservice list   e   az apim deletedservice purge --service-name <nome> --location <região>'
