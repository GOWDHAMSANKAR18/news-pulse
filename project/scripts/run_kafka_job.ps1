# PowerShell Apache Kafka Streaming Job Runner
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host " LAUNCHING APACHE KAFKA REAL-TIME STREAMING PIPELINE    " -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Cyan

Set-Location $PSScriptRoot\..
python scripts/kafka_news_producer_consumer.py

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[SUCCESS] Apache Kafka stream executed cleanly! Output saved to project/data/kafka_output/kafka_summary.json" -ForegroundColor Green
} else {
    Write-Host "`n[WARNING] Apache Kafka pipeline encountered an issue during execution." -ForegroundColor Yellow
}
