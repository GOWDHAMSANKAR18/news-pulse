# Root Forwarding PowerShell Load Sample Data Script
$projectDir = Join-Path $PSScriptRoot "..\project"
Set-Location $projectDir
& "$projectDir\scripts\load_sample_data.ps1"
