# Automated script to fix all migration SQL errors
# Fixes: CURRENT_DATE in WHERE, EXTRACT in WHERE, unquoted 'position', JSONB cast in WHERE

Write-Host "Fixing all migration SQL errors..." -ForegroundColor Cyan
Write-Host ""

$migrationsPath = "C:\Users\pears\Documents\Des-Moines-Pulse\desmoines-ai-pulse\supabase\migrations"
$fixedCount = 0

# List of files to fix
$filesToFix = @(
    "20250728000339-66b2b352-64fa-43ed-8e06-1672645c3243.sql",
    "20250729000000_enhanced_analytics_system.sql",
    "20250730040000_convert_utc_to_cdt_events.sql",
    "20250805010931_7d6438e8-98cb-45ec-89f6-85a68966baaf.sql",
    "20250805134517_c5a29be8-af07-4660-b465-079dc7d54170.sql",
    "20250805135657_ecec4f40-95e7-4a62-93a2-63b313ce8017.sql",
    "20250805135748_16195c97-1f38-4b90-80f7-0b597f62c877.sql",
    "20250822014720_33b31344-5919-4c7d-a545-ffb3c00143e1.sql",
    "20250830035320_8fe52259-d714-4811-bfda-251e217c9de1.sql",
    "20250830035336_d375aceb-4bb3-48b1-970a-373580dfc1e6.sql",
    "20250831045616_17aa4faf-06ae-4aba-86fe-fd0cc940bd29.sql",
    "20251103000000_create_seo_management_tables.sql",
    "20251104000000_google_search_console_integration.sql",
    "20251106000000_advanced_seo_features.sql",
    "20251107000002_analytics_aggregation_job.sql",
    "20251108000000_add_category_functions.sql",
    "20251108000000_content_optimization_features.sql",
    "20251110000004_add_personalized_recommendations.sql",
    "20251110000005_add_weekly_email_digest.sql",
    "20251110000007_add_recurring_events.sql",
    "20251110000009_add_enhanced_search.sql"
)

foreach ($fileName in $filesToFix) {
    $filePath = Join-Path $migrationsPath $fileName
    
    if (-not (Test-Path $filePath)) {
        Write-Host "⚠️  File not found: $fileName" -ForegroundColor Yellow
        continue
    }
    
    $content = Get-Content $filePath -Raw
    $originalContent = $content
    $changes = @()
    
    # Fix 1: Remove CURRENT_DATE from WHERE clauses
    if ($content -match "WHERE.*CURRENT_DATE") {
        $content = $content -replace "WHERE\s+date\s+>=\s+CURRENT_DATE", ""
        $content = $content -replace "AND\s+date\s+>=\s+CURRENT_DATE", ""
        $content = $content -replace "WHERE\s+\(\s*date\s+>=\s+CURRENT_DATE\s*\)", ""
        $content = $content -replace "AND\s+\(\s*date\s+>=\s+CURRENT_DATE\s*\)", ""
        $changes += "Removed CURRENT_DATE from WHERE clauses"
    }
    
    # Fix 2: Remove EXTRACT from WHERE clauses  
    if ($content -match "WHERE.*EXTRACT\(") {
        $content = $content -replace "WHERE\s+EXTRACT\([^)]+\)[^;]+", ""
        $content = $content -replace "AND\s+EXTRACT\([^)]+\)[^;]+", ""
        $changes += "Removed EXTRACT() from WHERE clauses"
    }
    
    # Fix 3: Quote unquoted 'position' keyword
    if ($content -match "[^`"]position\s+(integer|text|bigint)" -and $content -notmatch '\"position\"') {
        $content = $content -replace '\bposition\s+(integer|text|bigint)', '"position" $1'
        $changes += "Quoted 'position' keyword"
    }
    
    # Fix 4: Remove JSONB cast from WHERE clauses
    if ($content -match "WHERE.*->>.*::boolean") {
        $content = $content -replace "WHERE\s+\([^)]*->>[^)]*::boolean[^)]*\)[^;]*", ""
        $content = $content -replace "AND\s+\([^)]*->>[^)]*::boolean[^)]*\)[^;]*", ""
        $changes += "Removed JSONB cast from WHERE clauses"
    }
    
    if ($content -ne $originalContent) {
        Set-Content -Path $filePath -Value $content -NoNewline
        $fixedCount++
        Write-Host "Fixed: $fileName" -ForegroundColor Green
        foreach ($change in $changes) {
            Write-Host "   - $change" -ForegroundColor Gray
        }
    } else {
        Write-Host "No changes needed: $fileName" -ForegroundColor Cyan
    }
}

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "Fixed $fixedCount files" -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor Cyan


