# Root Forwarding PowerShell Run Script
$projectDir = Join-Path $PSScriptRoot "..\project"
Set-Location $projectDir
& "$projectDir\scripts\run.ps1"
