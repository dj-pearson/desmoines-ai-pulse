@echo off
echo.
echo ================================================
echo  Pushing to Both Repositories
echo ================================================
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
echo 🎉 Successfully pushed to both repositories!
echo.
pause
