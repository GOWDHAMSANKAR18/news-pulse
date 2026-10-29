# PowerShell Provider Health & Connectivity Checker
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " CHECKING NEWS PROVIDER ENDPOINT CONNECTIVITY " -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

$headers = @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) NewsPulse/1.0" }

# Read .env if present
$envFile = Join-Path $PSScriptRoot "..\.env"
$gnewsKey = ""
$guardianKey = ""
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match "^\s*VITE_GNEWS_API_KEY\s*=\s*(.+)$") { $gnewsKey = $matches[1].Trim() }
        if ($_ -match "^\s*VITE_GUARDIAN_API_KEY\s*=\s*(.+)$") { $guardianKey = $matches[1].Trim() }
    }
}

# 1. GDELT DOC API
Write-Host "`nTesting GDELT DOC API v2 (Timeout: 20s)..." -ForegroundColor Yellow
try {
    $gdelt = Invoke-RestMethod -Uri "https://api.gdeltproject.org/api/v2/doc/doc?query=technology&mode=artlist&maxrecords=5&format=json" -Headers $headers -TimeoutSec 20
    if ($gdelt.articles -and $gdelt.articles.Count -gt 0) {
        Write-Host "[SUCCESS] GDELT API Online. Retrieved $($gdelt.articles.Count) articles." -ForegroundColor Green
    } else {
        Write-Host "[NOTICE] GDELT API returned 0 articles (query succeeded, no matching records)." -ForegroundColor Cyan
    }
} catch {
    Write-Host "[NOTICE] GDELT API response notice: $_" -ForegroundColor Yellow
}

# 2. GNews API
Write-Host "`nTesting GNews API..." -ForegroundColor Yellow
if ($gnewsKey) {
    try {
        $gnews = Invoke-RestMethod -Uri "https://gnews.io/api/v4/top-headlines?category=general&lang=en&max=5&apikey=$gnewsKey" -Headers $headers -TimeoutSec 15
        if ($gnews.articles -and $gnews.articles.Count -gt 0) {
            Write-Host "[SUCCESS] GNews API Online. Retrieved $($gnews.articles.Count) articles." -ForegroundColor Green
        } else {
            Write-Host "[NOTICE] GNews API returned 0 articles." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "[NOTICE] GNews API response notice: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "[NOT CONFIGURED] VITE_GNEWS_API_KEY is not set in .env" -ForegroundColor Gray
}

# 3. The Guardian Open API
Write-Host "`nTesting The Guardian Open API..." -ForegroundColor Yellow
if ($guardianKey -and $guardianKey -ne "test") {
    try {
        $guardian = Invoke-RestMethod -Uri "https://content.guardianapis.com/search?q=world&page-size=5&api-key=$guardianKey" -Headers $headers -TimeoutSec 15
        Write-Host "[SUCCESS] The Guardian API Online. Retrieved $($guardian.response.results.Count) articles." -ForegroundColor Green
    } catch {
        Write-Host "[NOTICE] The Guardian API notice: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "[NOT CONFIGURED] Not configured - add a valid Guardian API key to .env to enable this provider." -ForegroundColor Gray
}

# 4. RSS Proxy Endpoint
Write-Host "`nTesting RSS Feed Aggregator..." -ForegroundColor Yellow
try {
    $rss = Invoke-RestMethod -Uri "https://api.rss2json.com/v1/api.json?rss_url=https://techcrunch.com/feed/" -Headers $headers -TimeoutSec 12
    Write-Host "[SUCCESS] RSS Aggregator Online. Retrieved $($rss.items.Count) articles." -ForegroundColor Green
} catch {
    Write-Host "[NOTICE] RSS Aggregator response notice: $_" -ForegroundColor Yellow
}

Write-Host "`nProvider connectivity check complete." -ForegroundColor Green
