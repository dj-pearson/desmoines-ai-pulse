# Deploy ChatGPT Plugin Integration
# This script deploys the Supabase edge functions and validates the configuration

Write-Host "Deploying Des Moines Insider ChatGPT Plugin Integration" -ForegroundColor Cyan
Write-Host ""

# Check if Supabase CLI is installed
Write-Host "Checking prerequisites..." -ForegroundColor Yellow
try {
    $supabaseVersion = supabase --version
    Write-Host "[OK] Supabase CLI installed: $supabaseVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Supabase CLI not found. Please install it first:" -ForegroundColor Red
    Write-Host "   npm install -g supabase" -ForegroundColor White
    exit 1
}

Write-Host ""

# Deploy Edge Functions
Write-Host "Deploying Edge Functions..." -ForegroundColor Yellow

Write-Host "  Deploying api-events function..." -ForegroundColor White
supabase functions deploy api-events
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to deploy api-events" -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] api-events deployed successfully" -ForegroundColor Green

Write-Host "  Deploying api-restaurants function..." -ForegroundColor White
supabase functions deploy api-restaurants
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to deploy api-restaurants" -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] api-restaurants deployed successfully" -ForegroundColor Green

Write-Host ""

# Check if OpenAPI spec needs updating
Write-Host "Checking configuration..." -ForegroundColor Yellow

$openapiContent = Get-Content "public/openapi.yaml" -Raw
if ($openapiContent -match "YOUR_SUPABASE_PROJECT_ID") {
    Write-Host "[WARNING] OpenAPI spec still contains placeholder" -ForegroundColor Red
    Write-Host "   Please update 'YOUR_SUPABASE_PROJECT_ID' in public/openapi.yaml" -ForegroundColor Yellow
    Write-Host "   with your actual Supabase project ID" -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host "[OK] OpenAPI spec configured" -ForegroundColor Green
}

# Validate JSON files
Write-Host "Validating configuration files..." -ForegroundColor Yellow

try {
    $manifest = Get-Content "public/.well-known/ai-plugin.json" -Raw | ConvertFrom-Json
    Write-Host "  [OK] ai-plugin.json is valid JSON" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] ai-plugin.json has invalid JSON syntax" -ForegroundColor Red
    Write-Host "     Error: $_" -ForegroundColor Red
}

Write-Host ""

# Display next steps
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "   1. Update YOUR_SUPABASE_PROJECT_ID in public/openapi.yaml" -ForegroundColor White
Write-Host "   2. Deploy static files: git add . && git commit -m 'Add ChatGPT plugin' && git push" -ForegroundColor White
Write-Host "   3. Test endpoints:" -ForegroundColor White
Write-Host "      - https://YOUR_PROJECT.supabase.co/functions/v1/api-events?limit=5" -ForegroundColor Gray
Write-Host "      - https://YOUR_PROJECT.supabase.co/functions/v1/api-restaurants?limit=5" -ForegroundColor Gray
Write-Host "   4. Verify manifest: https://desmoinesinsider.com/.well-known/ai-plugin.json" -ForegroundColor White
Write-Host "   5. Register plugin at: https://chat.openai.com" -ForegroundColor White
Write-Host ""
Write-Host "Full documentation: CHATGPT_INTEGRATION_GUIDE.md" -ForegroundColor Cyan
Write-Host ""
