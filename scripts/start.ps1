param([string]$WebUrl = '', [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$startupMutex = [System.Threading.Mutex]::new($false, 'Local\ElaBelaMedia-4317-Startup')
$hasStartupLock = $false
try {
  try { $hasStartupLock = $startupMutex.WaitOne(60000) }
  catch [System.Threading.AbandonedMutexException] { $hasStartupLock = $true }
  if (-not $hasStartupLock) { throw 'Otro inicio sigue en curso. Espera un momento y volve a abrir.' }
$nodeCommand = (Get-Command node -ErrorAction Stop).Source
$npmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
$nodeVersion = & $nodeCommand -p 'process.versions.node'
if ([version]$nodeVersion -lt [version]'24.17.0' -or [version]$nodeVersion -ge [version]'25.0.0') { throw 'ElaBela Media requiere Node 24.17 o posterior de la rama 24.' }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) {
  & $npmCommand ci --ignore-scripts
  if ($LASTEXITCODE -ne 0) { throw 'No se pudieron preparar las dependencias locales.' }
}
& $npmCommand run build
if ($LASTEXITCODE -ne 0) { throw 'La pagina no compilo. Revisa el error anterior.' }

$localDir = Join-Path $projectRoot '.local'
New-Item -ItemType Directory -Force -Path $localDir | Out-Null
$connectionFile = Join-Path $localDir 'connection.json'
$serviceUrl = 'http://127.0.0.1:4317'
$ready = $false
try { $ready = (Invoke-RestMethod -Uri "$serviceUrl/api/health" -TimeoutSec 2).ready -eq $true } catch { $ready = $false }
if (-not $ready) {
  $process = Start-Process -FilePath $nodeCommand -ArgumentList @('--import', 'tsx', 'server/index.ts') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $localDir 'server.log') -RedirectStandardError (Join-Path $localDir 'server-error.log') -PassThru
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 250
    try { $ready = (Invoke-RestMethod -Uri "$serviceUrl/api/health" -TimeoutSec 2).ready -eq $true } catch { $ready = $false }
    if ($ready) { break }
  }
}
if (-not $ready -or -not (Test-Path -LiteralPath $connectionFile)) { throw 'No se pudo conectar el servicio local de este proyecto.' }
$connection = Get-Content -LiteralPath $connectionFile -Raw | ConvertFrom-Json
$authHeaders = @{ Authorization = 'Bearer ' + $connection.token }
$bootstrap = Invoke-RestMethod -Uri "$serviceUrl/api/bootstrap" -Headers $authHeaders -TimeoutSec 5
# The process holding the service lock is authoritative. A simultaneous launcher
# can lose the claim; its short-lived child must never replace the running owner's PID.
$owner = Get-Content -LiteralPath (Join-Path $localDir 'service.lock') -Raw | ConvertFrom-Json
$ownerProcess = Get-Process -Id $owner.pid -ErrorAction Stop
if ($ownerProcess.ProcessName -ne 'node') { throw 'El propietario del servicio no coincide. No se guardo un PID.' }
$ownerAgain = Get-Content -LiteralPath (Join-Path $localDir 'service.lock') -Raw | ConvertFrom-Json
if ($ownerAgain.pid -ne $owner.pid -or $ownerAgain.nonce -ne $owner.nonce) { throw 'El servicio cambio mientras iniciaba. Volve a abrir el acceso directo.' }
$recordPath = Join-Path $localDir 'server-process.json'
$temporaryRecord = Join-Path $localDir ('server-process.' + [guid]::NewGuid().ToString('N') + '.tmp')
@{ pid = $ownerProcess.Id; startedAt = $ownerProcess.StartTime.ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $temporaryRecord -Encoding UTF8
Move-Item -LiteralPath $temporaryRecord -Destination $recordPath -Force
$localOrigin = 'http://127.0.0.1:4317'
if ($bootstrap.status.allowedOrigins -notcontains $localOrigin) {
  $localSettings = @{ allowedOrigins = @($bootstrap.status.allowedOrigins) + @($localOrigin) } | ConvertTo-Json -Compress
  Invoke-RestMethod -Method Post -Uri "$serviceUrl/api/settings" -Headers $authHeaders -ContentType 'application/json' -Body $localSettings | Out-Null
  $bootstrap = Invoke-RestMethod -Uri "$serviceUrl/api/bootstrap" -Headers $authHeaders -TimeoutSec 5
}
if (-not $WebUrl -and (Test-Path -LiteralPath (Join-Path $projectRoot '.env'))) {
  $match = Select-String -LiteralPath (Join-Path $projectRoot '.env') -Pattern '^ELABELA_WEB_URL=(.+)$' | Select-Object -First 1
  if ($match) { $WebUrl = $match.Matches[0].Groups[1].Value.Trim().Trim('"').Trim("'") }
}
$target = $serviceUrl + '/'
if ($WebUrl) {
  $web = [Uri]$WebUrl.TrimEnd('/')
  if ($web.Scheme -ne 'https' -or $web.AbsolutePath -ne '/' -or $web.Query -or $web.Fragment -or $web.UserInfo) { throw 'Usa un origen HTTPS exacto para Vercel, sin ruta, consulta ni fragmento.' }
  $origin = $web.GetLeftPart([UriPartial]::Authority)
  $origins = @($bootstrap.status.allowedOrigins) + @($origin) | Select-Object -Unique
  $settings = @{ allowedOrigins = @($origins) } | ConvertTo-Json -Compress
  Invoke-RestMethod -Method Post -Uri "$serviceUrl/api/settings" -Headers $authHeaders -ContentType 'application/json' -Body $settings | Out-Null
  $target = $origin + '/'
}
$pairLink = $target + '#pair=' + [Uri]::EscapeDataString($connection.token) + '&service=' + [Uri]::EscapeDataString($serviceUrl)
if (-not $NoBrowser) { Start-Process -FilePath $pairLink | Out-Null }
Write-Host 'ElaBela Media esta listo. El servicio seguira abierto en segundo plano.'
Write-Host 'Para cerrarlo, ejecuta scripts/stop.ps1. Tus archivos permanecen en esta carpeta.'
# Never print the pairing URL: it contains the session capability.
$pairLink = $null
$authHeaders = $null
$connection = $null
} finally {
  if ($hasStartupLock) { $startupMutex.ReleaseMutex() }
  $startupMutex.Dispose()
}
