# Script to test all migration files for SQL errors
# This will help identify problematic migrations before pushing to Supabase

Write-Host "Testing all migration files for common SQL errors..." -ForegroundColor Cyan
Write-Host ""

$migrationsPath = "C:\Users\pears\Documents\Des-Moines-Pulse\desmoines-ai-pulse\supabase\migrations"
$migrationFiles = Get-ChildItem "$migrationsPath\*.sql" | Sort-Object Name

$errorCount = 0
$errors = @()

foreach ($file in $migrationFiles) {
    $content = Get-Content $file.FullName -Raw
    $hasError = $false
    $fileErrors = @()
    
    # Check for CURRENT_DATE in WHERE clause
    if ($content -match "WHERE.*CURRENT_DATE") {
        $fileErrors += "❌ Uses CURRENT_DATE in WHERE clause (not IMMUTABLE)"
        $hasError = $true
    }
    
    # Check for EXTRACT in WHERE clause
    if ($content -match "WHERE.*EXTRACT\(") {
        $fileErrors += "❌ Uses EXTRACT() in WHERE clause (not IMMUTABLE)"
        $hasError = $true
    }
    
    # Check for JSONB casting in WHERE clause
    if ($content -match "WHERE.*->>.*::boolean") {
        $fileErrors += "❌ Uses JSONB cast in WHERE clause (not IMMUTABLE)"
        $hasError = $true
    }
    
    # Check for unquoted 'position' keyword
    if ($content -match "[^`"]position\s+(integer|text|bigint)" -and $content -notmatch '\"position\"') {
        $fileErrors += "❌ Uses unquoted 'position' keyword (reserved word)"
        $hasError = $true
    }
    
    # Check for missing semicolons at end of statements
    if ($content -match "CREATE.*\n\s*CREATE" -and $content -notmatch ";\s*CREATE") {
        $fileErrors += "⚠️  Possible missing semicolon between CREATE statements"
        $hasError = $true
    }
    
    if ($hasError) {
        $errorCount++
        $errors += [PSCustomObject]@{
            File = $file.Name
            Errors = $fileErrors
        }
        
        Write-Host "❌ $($file.Name)" -ForegroundColor Red
        foreach ($err in $fileErrors) {
            Write-Host "   $err" -ForegroundColor Yellow
        }
        Write-Host ""
    } else {
        Write-Host "✅ $($file.Name)" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "Total files tested: $($migrationFiles.Count)" -ForegroundColor White
Write-Host "Files with errors: $errorCount" -ForegroundColor $(if ($errorCount -eq 0) { "Green" } else { "Red" })
Write-Host ""

if ($errorCount -gt 0) {
    Write-Host "Files with errors:" -ForegroundColor Red
    foreach ($err in $errors) {
        Write-Host "  - $($err.File)" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "Recommendation: Fix these errors before pushing migrations" -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "✅ All migration files passed basic validation!" -ForegroundColor Green
    exit 0
}
