# PowerShell Batch Analytics Offline Runner Script
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " RUNNING BATCH ANALYTICS & TF-IDF KEYWORD EXTRACTION " -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

Set-Location $PSScriptRoot\..
npx tsx scripts/batch_analytics_runner.ts
