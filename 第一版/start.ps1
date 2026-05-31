param()

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $root
$backendRoot = Join-Path $projectRoot "dify-lite"
$indexPath = Join-Path $root "index.html"
$backendRun = Join-Path $backendRoot "run.py"
$pythonExe = Join-Path $backendRoot ".venv\Scripts\python.exe"
$backendPort = 8088

if (-not (Test-Path $indexPath -PathType Leaf)) {
  Write-Host "index.html not found." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $backendRun -PathType Leaf)) {
  Write-Host "dify-lite backend not found." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $pythonExe -PathType Leaf)) {
  $pythonExe = "python"
}

try {
  $expectedPythonPath = (Resolve-Path $pythonExe -ErrorAction Stop).Path
} catch {
  $expectedPythonPath = ""
}

function Get-BackendListenerProcess {
  $listener = Get-NetTCPConnection -LocalPort $backendPort -ErrorAction SilentlyContinue |
    Where-Object { $_.State -eq "Listen" } |
    Select-Object -First 1

  if (-not $listener) {
    return $null
  }

  return Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
}

function Test-IsExpectedBackend($process) {
  if (-not $process) {
    return $false
  }

  $runsBackend = $process.CommandLine -and ($process.CommandLine -match "run\.py")
  if (-not $runsBackend) {
    return $false
  }

  if (-not $expectedPythonPath) {
    return $true
  }

  $samePython = $process.ExecutablePath -and ($process.ExecutablePath -ieq $expectedPythonPath)
  if ($samePython) {
    return $true
  }

  $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $($process.ParentProcessId)" -ErrorAction SilentlyContinue
  if (-not $parent) {
    return $false
  }

  $parentSamePython = $parent.ExecutablePath -and ($parent.ExecutablePath -ieq $expectedPythonPath)
  $parentRunsBackend = $parent.CommandLine -and ($parent.CommandLine -match "run\.py")
  return $parentSamePython -and $parentRunsBackend
}

function Stop-StaleProjectBackends($exceptProcessId) {
  if (-not $expectedPythonPath) {
    return
  }

  Get-CimInstance Win32_Process |
    Where-Object {
      $_.ExecutablePath -and
      ($_.ExecutablePath -ieq $expectedPythonPath) -and
      $_.CommandLine -and
      ($_.CommandLine -match "run\.py") -and
      ($_.ProcessId -ne $exceptProcessId)
    } |
    ForEach-Object {
      Write-Host "Stopping stale project backend process PID $($_.ProcessId) ..." -ForegroundColor Yellow
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

$listenerProcess = Get-BackendListenerProcess

if ($listenerProcess -and -not (Test-IsExpectedBackend $listenerProcess)) {
  Write-Host "Port $backendPort is occupied by a stale backend process PID $($listenerProcess.ProcessId)." -ForegroundColor Yellow
  Write-Host "Stopping it so the project backend can start from: $backendRoot" -ForegroundColor Yellow
  Stop-Process -Id $listenerProcess.ProcessId -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  $listenerProcess = Get-BackendListenerProcess
}

if ($listenerProcess -and (Test-IsExpectedBackend $listenerProcess)) {
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$backendPort/api/health" -Method GET -TimeoutSec 2
    Write-Host "Project backend is already running on http://127.0.0.1:$backendPort" -ForegroundColor Green
  } catch {
    Write-Host "Backend process exists but health check failed; restarting ..." -ForegroundColor Yellow
    Stop-Process -Id $listenerProcess.ProcessId -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    $listenerProcess = $null
  }
}

if (-not $listenerProcess) {
  Stop-StaleProjectBackends 0
  Write-Host "Starting Dify Lite backend on http://127.0.0.1:$backendPort ..." -ForegroundColor Yellow
  Start-Process -FilePath $pythonExe -ArgumentList "run.py" -WorkingDirectory $backendRoot -WindowStyle Hidden
  Start-Sleep -Seconds 3
}

Write-Host ""
Write-Host "Opening the first version prototype..." -ForegroundColor Green
Write-Host $indexPath -ForegroundColor Cyan
Write-Host ""

Start-Process $indexPath
