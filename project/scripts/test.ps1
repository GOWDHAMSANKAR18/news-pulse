# PowerShell Automated Test Runner Script
Write-Host "Running Big Data Pipeline Automated Test Suite..." -ForegroundColor Yellow
Set-Location $PSScriptRoot\..
npx tsx src/__tests__/pipeline.test.ts
