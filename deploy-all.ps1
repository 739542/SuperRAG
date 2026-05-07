param(
  [string]$BackendHost = "127.0.0.1",
  [int]$DifyWebPort = 3000,
  [int]$DifyApiPort = 5001,
  [int]$WeaviatePort = 8080,
  [int]$LitePort = 8088,
  [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dockerDir = Join-Path $root "dify\docker"
$dockerConfigDir = Join-Path $root ".docker-config"
$backendDir = Join-Path $root "dify-lite"
$backendEntry = Join-Path $backendDir "run.py"
$backendStarter = Join-Path $backendDir "start-backend.ps1"
$frontendEntry = Join-Path $root "frontend\index.html"
$logDir = Join-Path $root "data\deploy-logs"
$stdoutLog = Join-Path $logDir "dify-lite.stdout.log"
$stderrLog = Join-Path $logDir "dify-lite.stderr.log"
$pidFile = Join-Path $logDir "dify-lite-launcher.pid"
$liteHealthUrl = "http://${BackendHost}:${LitePort}/api/health"
$difyWebUrl = "http://${BackendHost}:${DifyWebPort}"
$difyApiUrl = "http://${BackendHost}:${DifyApiPort}"
$weaviateUrl = "http://${BackendHost}:${WeaviatePort}"

function Write-Step([string]$Message, [string]$Color = "Cyan") {
  Write-Host $Message -ForegroundColor $Color
}

function Test-BackendHealth {
  param([string]$Url)

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300)
  } catch {
    return $false
  }
}

function Test-TcpPort {
  param(
    [string]$Host,
    [int]$Port
  )

  $client = $null
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect($Host, $Port, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne(1500, $false)) {
      return $false
    }
    $client.EndConnect($iar) | Out-Null
    return $true
  } catch {
    return $false
  } finally {
    if ($client) {
      $client.Close()
    }
  }
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

function Wait-ForPort {
  param(
    [string]$Name,
    [string]$Host,
    [int]$Port,
    [int]$MaxAttempts = 120
  )

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    if (Test-TcpPort -Host $Host -Port $Port) {
      Write-Step "$Name is ready on ${Host}:$Port" "Green"
      return
    }
    Write-Step "Waiting for $Name... ($attempt/$MaxAttempts)" "DarkYellow"
    Start-Sleep -Seconds 1
  }

  throw "$Name did not become ready on ${Host}:$Port."
}

function Start-DifyLite {
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null

  if (Test-BackendHealth -Url $liteHealthUrl) {
    Write-Step "dify-lite is already running." "Green"
    return
  }

  $pythonCommand = Resolve-PythonCommand
  Write-Step "Starting dify-lite with $($pythonCommand.Display) ..." "Yellow"

  $argList = @(
    "-NoExit",
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $backendStarter,
    "-PythonExe", $pythonCommand.FilePath
  )

  if ($pythonCommand.UsePyLauncher) {
    $argList = @(
      "-NoExit",
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-Command", "Set-Location '$backendDir'; py -3 run.py 1>> '$stdoutLog' 2>> '$stderrLog'"
    )
  }

  $launcher = Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList $argList `
    -WindowStyle Minimized `
    -PassThru

  Set-Content -Path $pidFile -Value $launcher.Id

  for ($attempt = 1; $attempt -le 60; $attempt++) {
    if (Test-BackendHealth -Url $liteHealthUrl) {
      Write-Step "dify-lite is ready." "Green"
      return
    }
    Write-Step "Waiting for dify-lite... ($attempt/60)" "DarkYellow"
    Start-Sleep -Seconds 1
  }

  throw "dify-lite failed to become healthy. Check $stdoutLog and $stderrLog."
}

if (-not (Test-Path $dockerDir -PathType Container)) {
  throw "Docker compose directory not found: $dockerDir"
}
if (-not (Test-Path $backendEntry -PathType Leaf)) {
  throw "Backend entry not found: $backendEntry"
}
if (-not (Test-Path $backendStarter -PathType Leaf)) {
  throw "Backend starter not found: $backendStarter"
}
if (-not (Test-Path $frontendEntry -PathType Leaf)) {
  throw "Frontend entry not found: $frontendEntry"
}

New-Item -ItemType Directory -Force -Path $dockerConfigDir | Out-Null
$env:DOCKER_CONFIG = $dockerConfigDir

Write-Host ""
Write-Step "== Full-stack deploy ==" "Green"
Write-Step "Root: $root"
Write-Step "Docker config: $dockerConfigDir"

$null = & docker --version
$null = & docker compose version

Write-Step "Starting Dify Docker stack..." "Yellow"
Push-Location $dockerDir
try {
  & docker compose up -d
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose up -d failed."
  }
} finally {
  Pop-Location
}

Write-Step "Waiting for Dify services..." "Yellow"
Wait-ForPort -Name "Dify Web" -Host $BackendHost -Port $DifyWebPort -MaxAttempts 180
Wait-ForPort -Name "Dify API" -Host $BackendHost -Port $DifyApiPort -MaxAttempts 180
Wait-ForPort -Name "Weaviate" -Host $BackendHost -Port $WeaviatePort -MaxAttempts 180

Start-DifyLite

Write-Host ""
Write-Step "Full stack is ready." "Green"
Write-Step "Dify Web: $difyWebUrl"
Write-Step "Dify API: $difyApiUrl"
Write-Step "Weaviate: $weaviateUrl"
Write-Step "dify-lite: $liteHealthUrl"
Write-Step "Frontend file: $frontendEntry"

if (-not $NoOpen) {
  Write-Step "Opening Dify Web..." "Green"
  Start-Process $difyWebUrl
  Write-Step "Opening frontend..." "Green"
  Start-Process $frontendEntry
}

Write-Host ""
Write-Step "Deploy finished." "Green"
