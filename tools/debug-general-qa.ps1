[CmdletBinding()]
param(
    [string]$Query = "",
    [string]$Project = "",
    [string]$CollectionId = "",
    [ValidateSet("concise", "detailed", "evidence")]
    [string]$Focus = "evidence",
    [string]$BaseUrl = "http://127.0.0.1:8088/api",
    [switch]$IncludeRequest,
    [switch]$Interactive,
    [string]$SaveDir = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function New-DebugPayload {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CurrentQuery
    )

    return [ordered]@{
        query         = $CurrentQuery
        project       = $Project
        collection_id = $CollectionId
        focus         = $Focus
        user          = "codex-debug-user"
    }
}

function Save-DebugArtifacts {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RequestJson,
        [Parameter(Mandatory = $true)]
        [string]$ResponseJson
    )

    if ([string]::IsNullOrWhiteSpace($SaveDir)) {
        return
    }

    if (-not (Test-Path -LiteralPath $SaveDir)) {
        New-Item -ItemType Directory -Path $SaveDir | Out-Null
    }

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $requestPath = Join-Path $SaveDir "$timestamp-request.json"
    $responsePath = Join-Path $SaveDir "$timestamp-response.json"
    [System.IO.File]::WriteAllText($requestPath, $RequestJson, [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::WriteAllText($responsePath, $ResponseJson, [System.Text.UTF8Encoding]::new($false))
    Write-Host "Saved request: $requestPath"
    Write-Host "Saved response: $responsePath"
}

function Invoke-GeneralQaDebug {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CurrentQuery
    )

    $payload = New-DebugPayload -CurrentQuery $CurrentQuery
    $requestJson = $payload | ConvertTo-Json -Depth 12
    $uri = "$BaseUrl/scenes/general"

    $startedAt = Get-Date
    try {
        $response = Invoke-RestMethod -Uri $uri -Method Post -ContentType "application/json; charset=utf-8" -Body $requestJson
        $durationMs = [math]::Round(((Get-Date) - $startedAt).TotalMilliseconds, 2)
        $responseJson = $response | ConvertTo-Json -Depth 20

        if ($IncludeRequest -or $Interactive) {
            Write-Host ""
            Write-Host "===== REQUEST ====="
            Write-Host $requestJson
            Write-Host ""
            Write-Host "===== RESPONSE ====="
            Write-Host $responseJson
            Write-Host ""
            Write-Host ("DurationMs: {0}" -f $durationMs)
        } else {
            Write-Output $responseJson
        }

        Save-DebugArtifacts -RequestJson $requestJson -ResponseJson $responseJson
    } catch {
        $message = $_.Exception.Message
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
            $message = $_.ErrorDetails.Message
        }
        Write-Error "Backend request failed: $message"
    }
}

if ($Interactive -or [string]::IsNullOrWhiteSpace($Query)) {
    Write-Host "General QA backend debug mode"
    Write-Host "BaseUrl: $BaseUrl"
    Write-Host "Project: $Project"
    Write-Host "CollectionId: $CollectionId"
    Write-Host "Focus: $Focus"
    Write-Host "Press Enter on an empty line to exit."

    while ($true) {
        $currentQuery = Read-Host "Query"
        if ([string]::IsNullOrWhiteSpace($currentQuery)) {
            break
        }
        Invoke-GeneralQaDebug -CurrentQuery $currentQuery
    }
} else {
    Invoke-GeneralQaDebug -CurrentQuery $Query
}
