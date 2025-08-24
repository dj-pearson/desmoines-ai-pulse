@echo off
echo.
echo ================================================
echo  Syncing Both Repositories
echo ================================================
echo.

echo 🔄 Pulling latest from origin (blank-canvas-events)...
git pull origin main
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Failed to pull from origin
    pause
    exit /b 1
)
echo ✅ Successfully pulled from origin

echo.
echo 🔄 Pulling latest from upstream (desmoines-ai-pulse)...
git pull upstream main
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Failed to pull from upstream
    pause
    exit /b 1
)
echo ✅ Successfully pulled from upstream

echo.
echo 🔄 Pushing to origin (blank-canvas-events)...
git push origin main
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Failed to push to origin
    pause
    exit /b 1
)
echo ✅ Successfully pushed to origin

echo.
echo 🔄 Pushing to upstream (desmoines-ai-pulse)...
git push upstream main
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Failed to push to upstream
    pause
    exit /b 1
)
echo ✅ Successfully pushed to upstream

echo.
echo 🎉 Successfully synced both repositories!
echo.
pause
