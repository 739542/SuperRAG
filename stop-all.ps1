param()

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dockerDir = Join-Path $root "dify\docker"
$dockerConfigDir = Join-Path $root ".docker-config"
$pidFile = Join-Path $root "data\deploy-logs\dify-lite-launcher.pid"

function Write-Step([string]$Message, [string]$Color = "Cyan") {
  Write-Host $Message -ForegroundColor $Color
}

$env:DOCKER_CONFIG = $dockerConfigDir

Write-Host ""
Write-Step "== Stop full stack ==" "Green"

if (Test-Path $pidFile -PathType Leaf) {
  $pidText = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
  if ($pidText -match '^\d+$') {
    $proc = Get-Process -Id ([int]$pidText) -ErrorAction SilentlyContinue
    if ($proc) {
      Write-Step "Stopping dify-lite launcher PID $pidText ..." "Yellow"
      Stop-Process -Id ([int]$pidText) -Force
    }
  }
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

if (Test-Path $dockerDir -PathType Container) {
  Write-Step "Stopping Dify Docker stack..." "Yellow"
  Push-Location $dockerDir
  try {
    & docker compose down
  } finally {
    Pop-Location
  }
}

Write-Host ""
Write-Step "All stop commands finished." "Green"
