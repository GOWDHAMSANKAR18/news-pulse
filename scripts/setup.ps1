# Root Forwarding PowerShell Setup Script
$projectDir = Join-Path $PSScriptRoot "..\project"
Set-Location $projectDir
& "$projectDir\scripts\setup.ps1"
