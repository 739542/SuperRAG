param()

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$indexPath = Join-Path $root "index.html"

if (-not (Test-Path $indexPath -PathType Leaf)) {
  Write-Host "index.html not found." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Opening the first version prototype..." -ForegroundColor Green
Write-Host $indexPath -ForegroundColor Cyan
Write-Host ""

Start-Process $indexPath
