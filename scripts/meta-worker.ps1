param(
  [Parameter(Mandatory = $true)][ValidateSet('publish', 'reconcile')][string]$Mode,
  [Parameter(Mandatory = $true)][string]$PlanFile,
  [Parameter(Mandatory = $true)][string]$StateFile,
  [string]$MetaBusinessDir = 'D:\ElaBela\MetaBusiness',
  [string]$NodePath = 'C:\Program Files\nodejs\node.exe'
)
$ErrorActionPreference = 'Stop'
$exitCode = 1
try {
  $secretPath = Join-Path $MetaBusinessDir '.secrets\meta-access-token.protected'
  if (-not (Test-Path -LiteralPath $secretPath -PathType Leaf)) { throw 'Protected credential unavailable' }
  $secureToken = Get-Content -LiteralPath $secretPath -Raw | ConvertTo-SecureString
  $env:META_ACCESS_TOKEN = [System.Net.NetworkCredential]::new('', $secureToken).Password
  $workerPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'server\meta-worker.mjs'
  & $NodePath $workerPath '--mode' $Mode '--plan' $PlanFile '--state' $StateFile '--meta-dir' $MetaBusinessDir
  $exitCode = $LASTEXITCODE
} catch {
  [Console]::Error.WriteLine('META_WORKER_UNAVAILABLE: revisá la cuenta de Windows y el token protegido; no se repitió el envío.')
} finally {
  Remove-Item Env:META_ACCESS_TOKEN -ErrorAction SilentlyContinue
  $secureToken = $null
}
exit $exitCode
