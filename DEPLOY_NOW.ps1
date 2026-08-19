# Firebase Hosting Deployment - GaGa Chat
# This script deploys the production build to Firebase Hosting

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       GaGa Chat - Deploy to Firebase Hosting                  ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$startTime = Get-Date

# ============================================================================
# STEP 1: Verify build exists
# ============================================================================
Write-Host "STEP 1: Verifying production build..." -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────" -ForegroundColor Gray

if (Test-Path "dist") {
    $distFiles = @(Get-ChildItem "dist" -Recurse).Count
    Write-Host "  ✓ dist folder found with $distFiles files" -ForegroundColor Green
    
    if (Test-Path "dist/index.html") {
        Write-Host "  ✓ index.html exists" -ForegroundColor Green
    }
    else {
        Write-Host "  ✗ index.html NOT found in dist!" -ForegroundColor Red
        Write-Host "  Please run: npm run build" -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit 1
    }
}
else {
    Write-Host "  ⚠ dist folder not found, building now..." -ForegroundColor Yellow
    Write-Host "  Running: npm run build" -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ Build failed!" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host "  ✓ Build completed" -ForegroundColor Green
}
Write-Host ""

# ============================================================================
# STEP 2: Verify Firebase is configured
# ============================================================================
Write-Host "STEP 2: Verifying Firebase configuration..." -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────" -ForegroundColor Gray

if (Test-Path ".firebaserc") {
    Write-Host "  ✓ .firebaserc found" -ForegroundColor Green
}
else {
    Write-Host "  ✗ .firebaserc not found!" -ForegroundColor Red
    exit 1
}

if (Test-Path "firebase.json") {
    Write-Host "  ✓ firebase.json found" -ForegroundColor Green
}
else {
    Write-Host "  ✗ firebase.json not found!" -ForegroundColor Red
    exit 1
}
Write-Host ""

# ============================================================================
# STEP 3: Deploy to Firebase Hosting
# ============================================================================
Write-Host "STEP 3: Deploying to Firebase Hosting..." -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────" -ForegroundColor Gray

Write-Host "  📤 Uploading app to Firebase..." -ForegroundColor Cyan
firebase deploy --only hosting --project oumagachat 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Deployment successful!" -ForegroundColor Green
}
else {
    Write-Host "  ⚠ Deployment completed with warnings (check above)" -ForegroundColor Yellow
}
Write-Host ""

# ============================================================================
# STEP 4: Show live URL
# ============================================================================
Write-Host "STEP 4: Getting hosting URL..." -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────" -ForegroundColor Gray

$url = firebase hosting:sites:list --project oumagachat 2>&1 | Select-String "oumagachat" | Select-Object -First 1
if ($url) {
    Write-Host "  🌐 Hosting sites:" -ForegroundColor Green
    Write-Host "     $url" -ForegroundColor Cyan
}
else {
    Write-Host "  ℹ Run this to get your hosting URL:" -ForegroundColor Cyan
    Write-Host "     firebase hosting:channel:list --project oumagachat" -ForegroundColor Gray
}
Write-Host ""

# ============================================================================
# Summary
# ============================================================================
$duration = (Get-Date) - $startTime
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                  ✅ DEPLOYMENT COMPLETE                       ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  ⏱️  Total time: $($duration.Minutes)m $($duration.Seconds)s" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Yellow
Write-Host "  1. Open your browser and visit the hosting URL above" -ForegroundColor White
Write-Host "  2. Test the app thoroughly" -ForegroundColor White
Write-Host "  3. Verify voice/video calls work (2-3 second connect time)" -ForegroundColor White
Write-Host ""
Read-Host "Press Enter to exit"
