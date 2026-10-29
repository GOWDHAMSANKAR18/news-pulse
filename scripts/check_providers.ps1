# Root Forwarding PowerShell Check Providers Script
$projectDir = Join-Path $PSScriptRoot "..\project"
Set-Location $projectDir
& "$projectDir\scripts\check_providers.ps1"
