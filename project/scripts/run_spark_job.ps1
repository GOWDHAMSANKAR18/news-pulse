# PowerShell Apache Spark Big Data Job Runner
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host " LAUNCHING APACHE SPARK (PySpark) ANALYTICS PIPELINE     " -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Cyan

Set-Location $PSScriptRoot\..
python scripts/spark_news_analytics.py

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[SUCCESS] Apache Spark job executed cleanly! Summary saved to project/data/spark_output/spark_summary.json" -ForegroundColor Green
} else {
    Write-Host "`n[WARNING] Apache Spark job encountered an error during execution." -ForegroundColor Yellow
}
