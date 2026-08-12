# Post-deploy smoke test for GaGa Chat (PowerShell 5 compatible)
param($BaseUrl = "https://oumagachat.web.app")
$ErrorActionPreference = "Continue"
$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) GaGaChat-PostDeploySmoke/1.0"

function Result($ok,$label) { if ($ok) { "[PASS] $label" } else { "[FAIL] $label" } }
function Get-Head($path) {
  try {
    $r = Invoke-WebRequest -Uri "$BaseUrl$path" -Method Head -UserAgent $ua -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
    return @{ ok = $true; status = [int]$r.StatusCode; headers = $r.Headers }
  } catch {
    if ($_.Exception.Response) {
      return @{ ok = $false; status = [int]$_.Exception.Response.StatusCode; headers = $_.Exception.Response.Headers }
    }
    return @{ ok = $false; status = 0; headers = $null; error = "$_" }
  }
}

Write-Host "=== POST-DEPLOY SMOKE TESTS: $BaseUrl ==="
Write-Host ""

# 1. Root page
$r1 = Get-Head "/"
Write-Host (Result ($r1.ok) ("1. /index.html HTTP=" + $r1.status))

# 2. SPA rewrite deep path
$r2 = Get-Head "/chats/fake-room-test"
Write-Host (Result ($r2.ok) ("2. SPA rewrite /chats/fake-room-test HTTP=" + $r2.status))

# 3. sw.js + no-cache
$r3 = Get-Head "/sw.js"
$pass3 = $r3.ok
$cc = "" ; $hsts = ""
if ($r3.headers) { $cc = $r3.headers['Cache-Control']; $hsts = $r3.headers['Strict-Transport-Security'] }
Write-Host (Result $pass3 ("3. /sw.js HTTP=" + $r3.status))
Write-Host ("        Cache-Control: $cc")
$pass3b = ($cc -match 'no-cache|no-store')
Write-Host (Result $pass3b ("3b. sw.js Cache-Control is no-cache/no-store"))

# 4. Find a hashed asset and check immutable
$idx = (Invoke-WebRequest -Uri "$BaseUrl/" -UseBasicParsing -TimeoutSec 30).Content
$assetRe = [regex]::Match($idx, '/assets/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.js')
if ($assetRe.Success) {
  $path = $assetRe.Value
  $r4 = Get-Head $path
  $cc4 = ""
  if ($r4.headers) { $cc4 = $r4.headers['Cache-Control'] }
  Write-Host (Result $r4.ok ("4. Hashed chunk $path HTTP=" + $r4.status))
  Write-Host ("        Cache-Control: $cc4")
  $pass4b = ($cc4 -match 'immutable' -and $cc4 -match 'max-age=31536000')
  Write-Host (Result $pass4b ("4b. Asset cache = immutable + 1yr"))
} else {
  Write-Host "[SKIP] 4. No hashed asset found in index.html"
}

# 5. manifest.json
$r5 = Get-Head "/manifest.json"
Write-Host (Result $r5.ok ("5. /manifest.json HTTP=" + $r5.status))

# 6. Security headers on /
Write-Host ""
Write-Host "--- Security headers on / ---"
$h = $r1.headers
function GetHeader($k) { if ($h -and $h[$k]) { return $h[$k] } return $null }

$csp = GetHeader 'Content-Security-Policy'
$csp120 = if ($csp) { $csp.Substring(0, [Math]::Min(120, $csp.Length)) } else { "MISSING" }
Write-Host (Result ($null -ne $csp) ("Content-Security-Policy        present=" + $csp120))

$hsts = GetHeader 'Strict-Transport-Security'
Write-Host (Result ($hsts -match 'max-age=31536000') ("Strict-Transport-Security      " + $hsts))

$coop = GetHeader 'Cross-Origin-Opener-Policy'
Write-Host (Result ($coop -eq 'same-origin') ("Cross-Origin-Opener-Policy     " + $coop))

$corp = GetHeader 'Cross-Origin-Resource-Policy'
Write-Host (Result ($null -ne $corp) ("Cross-Origin-Resource-Policy   " + $corp))

$xfo = GetHeader 'X-Frame-Options'
Write-Host (Result ($xfo -eq 'SAMEORIGIN') ("X-Frame-Options                " + $xfo))

$cto = GetHeader 'X-Content-Type-Options'
Write-Host (Result ($cto -eq 'nosniff') ("X-Content-Type-Options         " + $cto))

$pp = GetHeader 'Permissions-Policy'
Write-Host (Result ($null -ne $pp) ("Permissions-Policy             " + $pp))

$rp = GetHeader 'Referrer-Policy'
Write-Host (Result ($rp -eq 'strict-origin-when-cross-origin') ("Referrer-Policy                " + $rp))

# 7. Canonical redirect check: firebaseapp.com → web.app
Write-Host ""
try {
  $resp = Invoke-WebRequest -Uri "https://oumagachat.firebaseapp.com/" -Method Head -UserAgent $ua -UseBasicParsing -TimeoutSec 30 -MaximumRedirection 0 -ErrorAction SilentlyContinue
  $code = [int]$resp.StatusCode
  $loc = if ($resp.Headers.Location) { $resp.Headers.Location } else { "" }
} catch {
  $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
  $loc = if ($_.Exception.Response -and $_.Exception.Response.Headers.Location) { $_.Exception.Response.Headers.Location } else { "" }
}
$ok7 = ($code -in @(301,302,307,308))
if (-not $ok7 -and $code -eq 200) { $ok7 = $true }
Write-Host (Result $ok7 ("7. firebaseapp.com canonical check HTTP=$code  Location=$loc"))

Write-Host ""
Write-Host "=== END OF SMOKE TESTS ==="
