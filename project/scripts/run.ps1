# PowerShell Launch Script for Big Data News Analytics Platform
Write-Host "Starting Big Data News Analytics Platform Web Server..." -ForegroundColor Green
Set-Location $PSScriptRoot\..
npm run dev
