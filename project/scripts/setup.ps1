# PowerShell Setup Script for Big Data News Analytics Platform
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " REAL-TIME BIG DATA NEWS ANALYTICS PLATFORM - SETUP " -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

Set-Location $PSScriptRoot\..

Write-Host "`n1. Checking Node.js Environment..." -ForegroundColor Yellow
$nodeVer = node -v
Write-Host "Node version: $nodeVer" -ForegroundColor Green

Write-Host "`n2. Installing Project Dependencies..." -ForegroundColor Yellow
npm install

Write-Host "`n3. Verifying Environment File (.env)..." -ForegroundColor Yellow
if (-not (Test-Path .env)) {
    Copy-Item .env.example .env
    Write-Host "Created .env file from .env.example" -ForegroundColor Green
} else {
    Write-Host ".env configuration present." -ForegroundColor Green
}

Write-Host "`nSetup complete! Run .\scripts\run.ps1 to start the platform." -ForegroundColor Green
