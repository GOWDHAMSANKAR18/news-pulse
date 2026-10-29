# Root Forwarding PowerShell Batch Analytics Script
$projectDir = Join-Path $PSScriptRoot "..\project"
Set-Location $projectDir
& "$projectDir\scripts\batch_analytics.ps1"
