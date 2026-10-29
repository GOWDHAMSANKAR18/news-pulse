# PowerShell Sample Dataset Generator Script
Write-Host "Generating Sample News Dataset (JSON Format)..." -ForegroundColor Yellow

$sampleData = @(
    @{
        title = "Global Technology Summit Announces Breakthrough Multi-Modal AI Standards"
        category = "Technology"
        url = "https://techwire.org/ai-summit-2026"
        source = "TechWire Global"
        publishedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    },
    @{
        title = "Reserve Bank Announces Strategic Monetary Directive on Financial Liquidity"
        category = "Business"
        url = "https://financesource.org/rbi-directive"
        source = "Financial Digest"
        publishedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    },
    @{
        title = "Parliament Passes Revised Renewable Energy Infrastructure Expansion Act"
        category = "Politics"
        url = "https://politicsdaily.org/parliament-act"
        source = "National Press Wire"
        publishedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    }
)

$jsonPath = Join-Path $PSScriptRoot "..\sample_news_dataset.json"
$sampleData | ConvertTo-Json -Depth 5 | Out-File -FilePath $jsonPath -Encoding utf8

Write-Host "Created sample dataset at: $jsonPath" -ForegroundColor Green
Write-Host "Upload this file in the 'Data Import & Volume' tab in the web dashboard." -ForegroundColor Cyan
