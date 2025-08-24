Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
<<<<<<< HEAD
Write-Host " Syncing Both Repositories" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "🔄 Pulling latest from origin (blank-canvas-events)..." -ForegroundColor Yellow
try {
    git pull origin main
    if ($LASTEXITCODE -ne 0) { throw "Git pull failed" }
    Write-Host "✅ Successfully pulled from origin" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to pull from origin" -ForegroundColor Red
    Read-Host "Press Enter to continue"
    exit 1
}

Write-Host ""
Write-Host "🔄 Pulling latest from upstream (desmoines-ai-pulse)..." -ForegroundColor Yellow
try {
    git pull upstream main
    if ($LASTEXITCODE -ne 0) { throw "Git pull failed" }
    Write-Host "✅ Successfully pulled from upstream" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to pull from upstream" -ForegroundColor Red
    Read-Host "Press Enter to continue"
    exit 1
}

Write-Host ""
=======
Write-Host " Pushing to Both Repositories" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

>>>>>>> 7c3253d4d613db83e6a1442829f9251a98cdab01
Write-Host "🔄 Pushing to origin (blank-canvas-events)..." -ForegroundColor Yellow
try {
    git push origin main
    if ($LASTEXITCODE -ne 0) { throw "Git push failed" }
    Write-Host "✅ Successfully pushed to origin" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to push to origin" -ForegroundColor Red
    Read-Host "Press Enter to continue"
    exit 1
}

Write-Host ""
Write-Host "🔄 Pushing to upstream (desmoines-ai-pulse)..." -ForegroundColor Yellow
try {
    git push upstream main
    if ($LASTEXITCODE -ne 0) { throw "Git push failed" }
    Write-Host "✅ Successfully pushed to upstream" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to push to upstream" -ForegroundColor Red
    Read-Host "Press Enter to continue"
    exit 1
}

Write-Host ""
<<<<<<< HEAD
Write-Host "🎉 Successfully synced both repositories!" -ForegroundColor Green
=======
Write-Host "🎉 Successfully pushed to both repositories!" -ForegroundColor Green
>>>>>>> 7c3253d4d613db83e6a1442829f9251a98cdab01
Write-Host ""
Read-Host "Press Enter to continue"
