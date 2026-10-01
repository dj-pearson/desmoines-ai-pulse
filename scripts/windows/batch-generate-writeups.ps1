# Batch Generate Multiple Random Restaurant Writeups
# This script generates writeups for multiple restaurants at once

param(
    [Parameter(Mandatory=$false)]
    [int]$Count = 5,
    
    [Parameter(Mandatory=$false)]
    [string]$Type = "restaurant",
    
    [Parameter(Mandatory=$false)]
    [int]$DelaySeconds = 3
)

Write-Host "🍽️ Des Moines AI Pulse - Batch Writeup Generator" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

# Configuration
if (-not $env:SUPABASE_URL) {
    $projectUrl = Read-Host "Enter your Supabase project URL (e.g., https://xxx.supabase.co)"
    $env:SUPABASE_URL = $projectUrl
} else {
    $projectUrl = $env:SUPABASE_URL
    Write-Host "Using Supabase URL: $projectUrl" -ForegroundColor Gray
}

if (-not $env:SUPABASE_ANON_KEY) {
    $apiKey = Read-Host "Enter your Supabase Anon Key" -AsSecureString
    $apiKeyPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($apiKey)
    )
    $env:SUPABASE_ANON_KEY = $apiKeyPlain
} else {
    $apiKeyPlain = $env:SUPABASE_ANON_KEY
    Write-Host "Using saved API key" -ForegroundColor Gray
}

Write-Host ""
Write-Host "📊 Configuration:" -ForegroundColor Yellow
Write-Host "  - Type: $Type" -ForegroundColor White
Write-Host "  - Count: $Count" -ForegroundColor White
Write-Host "  - Delay between requests: $DelaySeconds seconds" -ForegroundColor White
Write-Host ""

$headers = @{
    "Authorization" = "Bearer $apiKeyPlain"
    "Content-Type" = "application/json"
}

$body = @{
    type = $Type
} | ConvertTo-Json

$uri = "$projectUrl/functions/v1/generate-writeup"

$successCount = 0
$failCount = 0
$results = @()

Write-Host "🚀 Starting batch generation..." -ForegroundColor Cyan
Write-Host ""

for ($i = 1; $i -le $Count; $i++) {
    Write-Host "[$i/$Count] " -NoNewline -ForegroundColor Cyan
    Write-Host "Generating writeup..." -NoNewline
    
    try {
        $response = Invoke-RestMethod -Method Post `
            -Uri $uri `
            -Headers $headers `
            -Body $body `
            -TimeoutSec 60

        if ($response.success) {
            Write-Host " ✅" -ForegroundColor Green
            Write-Host "        → Restaurant: $($response.restaurantName)" -ForegroundColor White
            Write-Host "        → ID: $($response.restaurantId)" -ForegroundColor Gray
            $successCount++
            
            $results += [PSCustomObject]@{
                Index = $i
                Success = $true
                Name = $response.restaurantName
                ID = $response.restaurantId
                WriteupLength = $response.writeup.Length
            }
        } else {
            Write-Host " ❌" -ForegroundColor Red
            Write-Host "        → Error: $($response.error)" -ForegroundColor Red
            $failCount++
            
            $results += [PSCustomObject]@{
                Index = $i
                Success = $false
                Name = "N/A"
                ID = "N/A"
                Error = $response.error
            }
        }
        
    } catch {
        Write-Host " ❌" -ForegroundColor Red
        Write-Host "        → Exception: $($_.Exception.Message)" -ForegroundColor Red
        $failCount++
        
        $results += [PSCustomObject]@{
            Index = $i
            Success = $false
            Name = "N/A"
            ID = "N/A"
            Error = $_.Exception.Message
        }
    }
    
    # Delay between requests (except after the last one)
    if ($i -lt $Count) {
        Write-Host "        ⏳ Waiting $DelaySeconds seconds..." -ForegroundColor Gray
        Start-Sleep -Seconds $DelaySeconds
    }
    
    Write-Host ""
}

Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "📊 Batch Generation Complete!" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""
Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "  ✅ Successful: $successCount" -ForegroundColor Green
Write-Host "  ❌ Failed: $failCount" -ForegroundColor Red
Write-Host "  📝 Total: $Count" -ForegroundColor White
Write-Host ""

if ($successCount -gt 0) {
    Write-Host "✅ Successful Writeups:" -ForegroundColor Green
    Write-Host ("-" * 70) -ForegroundColor Gray
    
    $results | Where-Object { $_.Success } | ForEach-Object {
        Write-Host "  $($_.Index). $($_.Name)" -ForegroundColor White
        Write-Host "      ID: $($_.ID)" -ForegroundColor Gray
        Write-Host "      Length: $($_.WriteupLength) characters" -ForegroundColor Gray
        Write-Host ""
    }
}

if ($failCount -gt 0) {
    Write-Host "❌ Failed Attempts:" -ForegroundColor Red
    Write-Host ("-" * 70) -ForegroundColor Gray
    
    $results | Where-Object { -not $_.Success } | ForEach-Object {
        Write-Host "  $($_.Index). Error: $($_.Error)" -ForegroundColor Yellow
        Write-Host ""
    }
}

Write-Host "🎉 All done! Check your database for the generated writeups." -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
