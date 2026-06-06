[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Query,
    [string]$Project = "",
    [string]$CollectionId = "",
    [ValidateSet("concise", "detailed", "evidence")]
    [string]$Focus = "evidence",
    [switch]$IncludeFinal
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$python = if (Test-Path "E:\Dify\dify-lite\.venv\Scripts\python.exe") {
    "E:\Dify\dify-lite\.venv\Scripts\python.exe"
} else {
    "python"
}

$arguments = @(
    "E:\Dify\tools\debug-general-qa-raw-llm.py",
    "--query", $Query
)

if (-not [string]::IsNullOrWhiteSpace($Project)) {
    $arguments += @("--project", $Project)
}

if (-not [string]::IsNullOrWhiteSpace($CollectionId)) {
    $arguments += @("--collection-id", $CollectionId)
}

$arguments += @("--focus", $Focus)

if ($IncludeFinal) {
    $arguments += "--include-final"
}

& $python @arguments
