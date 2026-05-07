param(
  [string]$PythonExe = "python"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = Join-Path $root "..\data\deploy-logs"
$stdoutLog = Join-Path $logDir "dify-lite.stdout.log"
$stderrLog = Join-Path $logDir "dify-lite.stderr.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

Set-Location $root

& $PythonExe "run.py" 1>> $stdoutLog 2>> $stderrLog
