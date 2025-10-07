# Test ChatGPT Plugin Integration
# This script validates all components of the ChatGPT integration

Write-Host "Testing Des Moines Insider ChatGPT Plugin Integration" -ForegroundColor Cyan
Write-Host ""

$errors = 0
$warnings = 0

# Function to test URL accessibility
function Test-Url {
    param($url, $description)
    try {
        $response = Invoke-WebRequest -Uri $url -Method Get -TimeoutSec 10 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-Host "  [OK] $description - 200" -ForegroundColor Green
            return $true
        } else {
            Write-Host "  [WARN] $description - Status: $($response.StatusCode)" -ForegroundColor Yellow
            $script:warnings++
            return $false
        }
    } catch {
        Write-Host "  [ERROR] $description - Failed" -ForegroundColor Red
        Write-Host "     Error: $($_.Exception.Message)" -ForegroundColor Red
        $script:errors++
        return $false
    }
}

# Test 1: Check static files exist locally
Write-Host "Step 1: Checking local files..." -ForegroundColor Yellow

$files = @(
    "public/.well-known/ai-plugin.json",
    "public/openapi.yaml",
    "supabase/functions/api-events/index.ts",
    "supabase/functions/api-restaurants/index.ts",
    "CHATGPT_INTEGRATION_GUIDE.md",
    "CHATGPT_PLUGIN_SUMMARY.md"
)

foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "  [OK] $file exists" -ForegroundColor Green
    } else {
        Write-Host "  [ERROR] $file missing" -ForegroundColor Red
        $errors++
    }
}

Write-Host ""

# Test 2: Validate JSON files
Write-Host "Step 2: Validating JSON syntax..." -ForegroundColor Yellow

try {
    $manifest = Get-Content "public/.well-known/ai-plugin.json" -Raw | ConvertFrom-Json
    Write-Host "  [OK] ai-plugin.json - Valid JSON" -ForegroundColor Green
    
    # Check required fields
    if ($manifest.name_for_human -and $manifest.name_for_model -and $manifest.api.url) {
        Write-Host "  [OK] ai-plugin.json - All required fields present" -ForegroundColor Green
    } else {
        Write-Host "  [WARN] ai-plugin.json - Missing required fields" -ForegroundColor Yellow
        $warnings++
    }
} catch {
    Write-Host "  [ERROR] ai-plugin.json - Invalid JSON" -ForegroundColor Red
    Write-Host "     Error: $_" -ForegroundColor Red
    $errors++
}

Write-Host ""

# Test 3: Check for placeholders
Write-Host "Step 3: Checking for placeholders..." -ForegroundColor Yellow

$openapiContent = Get-Content "public/openapi.yaml" -Raw
if ($openapiContent -match "YOUR_SUPABASE_PROJECT_ID") {
    Write-Host "  [WARN] OpenAPI spec contains placeholder 'YOUR_SUPABASE_PROJECT_ID'" -ForegroundColor Yellow
    Write-Host "     Update this before deployment!" -ForegroundColor Yellow
    $warnings++
} else {
    Write-Host "  [OK] No placeholders found in OpenAPI spec" -ForegroundColor Green
}

$manifestContent = Get-Content "public/.well-known/ai-plugin.json" -Raw
if ($manifestContent -match "info@desmoinesinsider.com") {
    Write-Host "  [OK] Contact email configured" -ForegroundColor Green
} else {
    Write-Host "  [WARN] Contact email may need updating" -ForegroundColor Yellow
    $warnings++
}

Write-Host ""

# Test 4: Test Supabase connection (optional - requires env vars)
Write-Host "Step 4: Testing Supabase connection..." -ForegroundColor Yellow

$supabaseUrl = $env:SUPABASE_URL
if ($supabaseUrl) {
    Write-Host "  [OK] SUPABASE_URL environment variable found" -ForegroundColor Green
    
    # Test events API
    $eventsUrl = "$supabaseUrl/functions/v1/api-events?limit=1"
    Write-Host "  Testing: $eventsUrl" -ForegroundColor Gray
    Test-Url $eventsUrl "Events API"
    
    # Test restaurants API
    $restaurantsUrl = "$supabaseUrl/functions/v1/api-restaurants?limit=1"
    Write-Host "  Testing: $restaurantsUrl" -ForegroundColor Gray
    Test-Url $restaurantsUrl "Restaurants API"
} else {
    Write-Host "  [WARN] SUPABASE_URL not set - skipping API tests" -ForegroundColor Yellow
    Write-Host "     Set with: `$env:SUPABASE_URL='https://your-project.supabase.co'" -ForegroundColor Gray
    $warnings++
}

Write-Host ""

# Test 5: Test production URLs (if deployed)
Write-Host "Step 5: Testing production URLs..." -ForegroundColor Yellow

$productionTests = @(
    @{
        url = "https://desmoinesinsider.com/.well-known/ai-plugin.json"
        description = "Plugin manifest"
    },
    @{
        url = "https://desmoinesinsider.com/openapi.yaml"
        description = "OpenAPI specification"
    }
)

foreach ($test in $productionTests) {
    Test-Url $test.url $test.description
}

Write-Host ""

# Test 6: Validate OpenAPI spec structure
Write-Host "Step 6: Validating OpenAPI structure..." -ForegroundColor Yellow

$openapiLines = Get-Content "public/openapi.yaml"
$hasInfo = $openapiLines | Where-Object { $_ -match "^info:" }
$hasServers = $openapiLines | Where-Object { $_ -match "^servers:" }
$hasPaths = $openapiLines | Where-Object { $_ -match "^paths:" }
$hasComponents = $openapiLines | Where-Object { $_ -match "^components:" }

if ($hasInfo) {
    Write-Host "  [OK] 'info' section present" -ForegroundColor Green
} else {
    Write-Host "  [ERROR] 'info' section missing" -ForegroundColor Red
    $errors++
}

if ($hasServers) {
    Write-Host "  [OK] 'servers' section present" -ForegroundColor Green
} else {
    Write-Host "  [ERROR] 'servers' section missing" -ForegroundColor Red
    $errors++
}

if ($hasPaths) {
    Write-Host "  [OK] 'paths' section present" -ForegroundColor Green
} else {
    Write-Host "  [ERROR] 'paths' section missing" -ForegroundColor Red
    $errors++
}

if ($hasComponents) {
    Write-Host "  [OK] 'components' section present" -ForegroundColor Green
} else {
    Write-Host "  [ERROR] 'components' section missing" -ForegroundColor Red
    $errors++
}

Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Gray
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Gray

if ($errors -eq 0 -and $warnings -eq 0) {
    Write-Host "[SUCCESS] All tests passed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your ChatGPT plugin integration is ready!" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor White
    Write-Host "  1. Deploy functions: .\deploy-chatgpt-plugin.ps1" -ForegroundColor Gray
    Write-Host "  2. Push to production: git push" -ForegroundColor Gray
    Write-Host "  3. Register at: https://chat.openai.com" -ForegroundColor Gray
} elseif ($errors -eq 0) {
    Write-Host "[WARNING] Tests passed with $warnings warning(s)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Review warnings above before deployment" -ForegroundColor Yellow
} else {
    Write-Host "[FAILED] Tests failed with $errors error(s) and $warnings warning(s)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please fix errors before deployment" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "For detailed information, see:" -ForegroundColor Cyan
Write-Host "  - CHATGPT_PLUGIN_SUMMARY.md - Overview and quick start" -ForegroundColor White
Write-Host "  - CHATGPT_INTEGRATION_GUIDE.md - Complete documentation" -ForegroundColor White
Write-Host ""
