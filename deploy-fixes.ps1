# Deploy fixes for blank page and logo issues
# This script commits and pushes all fixes to production

Write-Host "Deploying fixes for blank page and logo..." -ForegroundColor Cyan
Write-Host ""

# Add all changes
Write-Host "Adding changes..." -ForegroundColor Yellow
git add public/_headers public/_redirects src/components/Header.tsx

# Show what will be committed
Write-Host ""
Write-Host "Changes to be committed:" -ForegroundColor Yellow
git status --short

# Commit with descriptive message
Write-Host ""
Write-Host "Committing changes..." -ForegroundColor Yellow
git commit -m "Fix: Resolve blank page and lazy loading errors

- Update CSP headers to allow Google Fonts and Tag Manager
- Fix _redirects to serve static assets correctly (prevents JS chunks from redirecting to HTML)
- Update header logo to use DMI-Logo-Header.png
- Fixes 'SyntaxError: expected expression, got <' errors
- Fixes Content Security Policy violations"

# Push to origin
Write-Host ""
Write-Host "Pushing to origin..." -ForegroundColor Yellow
git push origin main

Write-Host ""
Write-Host "✅ Deploy complete!" -ForegroundColor Green
Write-Host ""
Write-Host "⚠️  IMPORTANT: After deployment completes:" -ForegroundColor Yellow
Write-Host "1. Clear your browser cache and service worker" -ForegroundColor White
Write-Host "2. Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)" -ForegroundColor White
Write-Host "3. Check that your logo appears in the header" -ForegroundColor White
Write-Host "4. Verify no console errors about lazy loading" -ForegroundColor White
Write-Host ""

