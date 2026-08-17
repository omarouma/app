# ZEGO Call Fix - Deployment Script (PowerShell)
# Run this file to deploy the fix to production

Write-Host ""
Write-Host "========================================"
Write-Host "ZEGO Call Deadlock Fix - Deployment"
Write-Host "========================================"
Write-Host ""

# Step 1: Check git status
Write-Host "STEP 1: Checking git status..." -ForegroundColor Cyan
git status
Write-Host ""

# Step 2: Build verification
Write-Host "STEP 2: Building the project..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Build failed! Check errors above." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "Build successful!" -ForegroundColor Green
Write-Host ""

# Step 3: Git commit
Write-Host "STEP 3: Staging and committing changes..." -ForegroundColor Cyan
git add src\components\calling\CallOverlay.tsx src\hooks\useWebRTCManager.ts src\hooks\useZegoCall.ts
git commit -m "Fix ZEGO call deadlock - decouple container from join state"
Write-Host ""

# Step 4: Push to main
Write-Host "STEP 4: Pushing to main branch..." -ForegroundColor Cyan
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Git push failed! Check credentials or connection." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "Push successful!" -ForegroundColor Green
Write-Host ""

# Step 5: Deploy to Firebase
Write-Host "STEP 5: Deploying to Firebase..." -ForegroundColor Cyan
npm run deploy:hosting
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Firebase deployment failed! Check credentials." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "Deployment successful!" -ForegroundColor Green
Write-Host ""

Write-Host "========================================"
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "========================================"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Visit your deployed URL"
Write-Host "2. Test voice calls between two users"
Write-Host "3. Verify calls connect in 2-3 seconds"
Write-Host "4. Check browser console for errors (F12)"
Write-Host ""
Read-Host "Press Enter to exit"
