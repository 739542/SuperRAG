param(
  [int]$BackendPort = 8088,
  [string]$BackendHost = "127.0.0.1",
  [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root "dify-lite"
$backendEntry = Join-Path $backendDir "run.py"
$backendStarter = Join-Path $backendDir "start-backend.ps1"
$logDir = Join-Path $root "data\deploy-logs"
$stdoutLog = Join-Path $logDir "dify-lite.stdout.log"
$stderrLog = Join-Path $logDir "dify-lite.stderr.log"
$pidFile = Join-Path $logDir "dify-lite-launcher.pid"
$healthUrl = "http://${BackendHost}:${BackendPort}/api/health"
$frontendUrl = "http://${BackendHost}:${BackendPort}/"

function Write-Step([string]$Message, [string]$Color = "Cyan") {
  Write-Host $Message -ForegroundColor $Color
}

function Test-BackendHealth {
  param([string]$Url)

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
      return $true
    }
  } catch {
    return $false
  }

  return $false
}

function Resolve-PythonCommand {
  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python) {
    return @{
      FilePath = $python.Source
      Display = $python.Source
    }
  }

  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    return @{
      FilePath = $py.Source
      Display = "$($py.Source) -3"
      UsePyLauncher = $true
    }
  }

  throw "Python was not found. Please install Python 3 or add it to PATH."
}

if (-not (Test-Path $backendEntry -PathType Leaf)) {
  throw "Backend entry not found: $backendEntry"
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

Write-Host ""
Write-Step "== One-click deploy ==" "Green"
Write-Step "Root: $root"
Write-Step "Backend health: $healthUrl"

$backendReady = Test-BackendHealth -Url $healthUrl

if ($backendReady) {
  Write-Step "Backend is already running." "Green"
} else {
  $pythonCommand = Resolve-PythonCommand
  Write-Step "Starting dify-lite with $($pythonCommand.Display) ..." "Yellow"

  $runCommand = "cd /d `"$backendDir`" && `"$($pythonCommand.FilePath)`" run.py 1>> `"$stdoutLog`" 2>> `"$stderrLog`""
  if ($pythonCommand.UsePyLauncher) {
    $runCommand = "cd /d `"$backendDir`" && `"$($pythonCommand.FilePath)`" -3 run.py 1>> `"$stdoutLog`" 2>> `"$stderrLog`""
  }

  $launcher = Start-Process `
    -FilePath "cmd.exe" `
    -ArgumentList @("/c", $runCommand) `
    -WindowStyle Hidden `
    -PassThru

  Set-Content -Path $pidFile -Value $launcher.Id

  $maxAttempts = 45
  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    Start-Sleep -Seconds 1
    if (Test-BackendHealth -Url $healthUrl) {
      $backendReady = $true
      break
    }
    Write-Step "Waiting for backend... ($attempt/$maxAttempts)" "DarkYellow"
  }
}

if (-not $backendReady) {
  Write-Host ""
  Write-Step "Backend failed to become healthy." "Red"
  Write-Step "Check logs:" "Red"
  Write-Step "  STDOUT: $stdoutLog" "Red"
  Write-Step "  STDERR: $stderrLog" "Red"
  Write-Step "Try running manually: cd dify-lite; python run.py" "Red"
  exit 1
}

Write-Host ""
Write-Step "Backend is ready." "Green"
Write-Step "API: $healthUrl"
Write-Step "Frontend: $frontendUrl"
Write-Step "Logs: $stdoutLog"

if (-not $NoOpen) {
  Write-Step "Opening frontend..." "Green"
  Start-Process $frontendUrl
}

Write-Host ""
Write-Step "Deploy finished." "Green"
