# Generate Random Restaurant Writeup Script
# This script invokes the generate-writeup edge function to create an AI writeup for a random restaurant

Write-Host "🍽️ Des Moines AI Pulse - Random Restaurant Writeup Generator" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

# Configuration
$projectUrl = Read-Host "Enter your Supabase project URL (e.g., https://xxx.supabase.co)"
$apiKey = Read-Host "Enter your Supabase Anon Key" -AsSecureString
$apiKeyPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($apiKey)
)

Write-Host ""
Write-Host "🎲 Generating writeup for random restaurant..." -ForegroundColor Yellow
Write-Host ""

try {
    $headers = @{
        "Authorization" = "Bearer $apiKeyPlain"
        "Content-Type" = "application/json"
    }

    $body = @{
        type = "restaurant"
    } | ConvertTo-Json

    $uri = "$projectUrl/functions/v1/generate-writeup"
    
    Write-Host "📡 Calling: $uri" -ForegroundColor Gray
    Write-Host ""
    
    $response = Invoke-RestMethod -Method Post `
        -Uri $uri `
        -Headers $headers `
        -Body $body `
        -TimeoutSec 60

    if ($response.success) {
        Write-Host "✅ SUCCESS!" -ForegroundColor Green
        Write-Host ""
        Write-Host "📝 Generated Writeup Details:" -ForegroundColor Cyan
        Write-Host ("-" * 70) -ForegroundColor Cyan
        Write-Host "Restaurant Name: " -NoNewline -ForegroundColor Yellow
        Write-Host $response.restaurantName
        Write-Host "Restaurant ID: " -NoNewline -ForegroundColor Yellow
        Write-Host $response.restaurantId
        Write-Host "Content Length: " -NoNewline -ForegroundColor Yellow
        Write-Host "$($response.extractedContentLength) characters extracted"
        Write-Host "Features Found: " -NoNewline -ForegroundColor Yellow
        Write-Host $response.featuresFound
        Write-Host ""
        Write-Host "📄 Generated Writeup:" -ForegroundColor Cyan
        Write-Host ("-" * 70) -ForegroundColor Cyan
        Write-Host $response.writeup -ForegroundColor White
        Write-Host ("-" * 70) -ForegroundColor Cyan
        Write-Host ""
        Write-Host "✅ Writeup has been saved to the database!" -ForegroundColor Green
    } else {
        Write-Host "❌ FAILED" -ForegroundColor Red
        Write-Host "Error: $($response.error)" -ForegroundColor Red
    }

} catch {
    Write-Host "❌ ERROR" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        Write-Host ""
        Write-Host "Details:" -ForegroundColor Yellow
        Write-Host $_.ErrorDetails.Message -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
