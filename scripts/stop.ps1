$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$recordPath = Join-Path $projectRoot '.local/server-process.json'
if (-not (Test-Path -LiteralPath $recordPath)) { Write-Host 'No hay un servicio iniciado por este acceso directo.'; exit 0 }
$record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
$serviceProcess = Get-Process -Id $record.pid -ErrorAction SilentlyContinue
if (-not $serviceProcess) { Write-Host 'El servicio ya esta cerrado.'; exit 0 }
$startedAt = $serviceProcess.StartTime.ToUniversalTime().Ticks
$recordedStart = ([datetime]$record.startedAt).ToUniversalTime().Ticks
if ($serviceProcess.ProcessName -ne 'node' -or $startedAt -ne $recordedStart) { throw 'El PID corresponde a otro proceso. No se cerro nada.' }
$connectionPath = Join-Path $projectRoot '.local/connection.json'
if (Test-Path -LiteralPath $connectionPath) {
  $connection = Get-Content -LiteralPath $connectionPath -Raw | ConvertFrom-Json
  $headers = @{ Authorization = 'Bearer ' + $connection.token }
  try {
    $state = Invoke-RestMethod -Uri 'http://127.0.0.1:4317/api/shutdown' -Method Post -ContentType 'application/json' -Body '{}' -Headers $headers -TimeoutSec 10
  } catch { throw 'No se pudo solicitar el cierre seguro. Revisa el servicio; no se detuvo ningun proceso.' }
  $connection = $null
  $headers = $null
  if ($state.activeJobs -gt 0) {
    Write-Host 'Cierre solicitado. No se aceptan nuevos trabajos; el servicio se cerrara al terminar los que ya estaban activos.'
  } else {
    Write-Host 'Cierre seguro solicitado al servicio. No se forzo ningun proceso.'
  }
} else { throw 'Falta la conexion local para solicitar un cierre autenticado. No se detuvo ningun proceso.' }
