@echo off
REM ZEGO Call Fix - Deployment Script
REM Run this file to deploy the fix to production

echo.
echo ========================================
echo ZEGO Call Deadlock Fix - Deployment
echo ========================================
echo.

REM Step 1: Check git status
echo STEP 1: Checking git status...
git status
echo.

REM Step 2: Build verification
echo STEP 2: Building the project...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Build failed! Check errors above.
    pause
    exit /b 1
)
echo Build successful!
echo.

REM Step 3: Git commit
echo STEP 3: Staging and committing changes...
git add src\components\calling\CallOverlay.tsx src\hooks\useWebRTCManager.ts src\hooks\useZegoCall.ts
git commit -m "Fix ZEGO call deadlock - decouple container from join state"
echo.

REM Step 4: Push to main
echo STEP 4: Pushing to main branch...
git push origin main
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Git push failed! Check credentials or connection.
    pause
    exit /b 1
)
echo Push successful!
echo.

REM Step 5: Deploy to Firebase
echo STEP 5: Deploying to Firebase...
call npm run deploy:hosting
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Firebase deployment failed! Check credentials.
    pause
    exit /b 1
)
echo Deployment successful!
echo.

echo ========================================
echo Deployment Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Visit your deployed URL
echo 2. Test voice calls between two users
echo 3. Verify calls connect in 2-3 seconds
echo 4. Check browser console for errors (F12)
echo.
pause
