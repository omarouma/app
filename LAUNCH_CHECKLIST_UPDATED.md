# GaGa Chat — Launch Checklist (Updated)
> Last updated: 2026-07-03
> ✅ = Done in code | 🔧 = Needs manual action | ⬜ = Optional/later

---

## WHAT WAS JUST FIXED IN CODE

| # | File | Fix |
|---|------|-----|
| 1 | `src/services/pushNotificationService.ts` | VAPID key reads `VITE_FIREBASE_VAPID_KEY` (was `VITE_VAPID_PUBLIC_KEY`) |
| 2 | `firestore.indexes.json` | Collection names corrected to snake_case matching COLLECTIONS constants (`friend_requests`, `blocked_users`, `call_history`, `live_streams`, `broadcast_lists`, `user_reports`) |
| 3 | `firestore.rules` | Collection names corrected to snake_case; notifications `create` now allows any authenticated user (needed for wallet/friend-request cross-user notifications); groups use `participants` + `createdBy`; added `qr_sessions` + `voice_rooms` rules |
| 4 | `public/manifest.json` | `background_color` + `theme_color` → `#00C300` / `#ffffff` (brand colors for PWA install) |
| 5 | `index.html` | `theme-color` meta → `#00C300` |
| 6 | `public/robots.txt` | Removed incorrect `Disallow` for public routes (`/contacts`, `/calls`, `/timeline`); kept only truly private routes |
| 7 | `public/sitemap.xml` | Fixed `/creator-center` → `/creators` (matches actual App.tsx route) |
| 8 | `src/main.tsx` | Canonical redirect now allows `oumagachat.web.app` + `oumagachat.firebaseapp.com` — app no longer redirects itself into a loop on Firebase Hosting |
| 9 | `firebase.json` | Added `oumagachat.web.app` to CSP `connect-src` |
| 10 | `.env` | Added comment for `VITE_FIREBASE_VAPID_KEY` explaining where to get it |
| 11 | `package.json` | Added `deploy:rules` and `deploy:hosting` scripts; `deploy:full` now deploys hosting + firestore + storage |

---

## PHASE 1: Firebase Console — Manual Steps Required

### 1.1 Firestore Database
- 🔧 Go to https://console.firebase.google.com/project/oumagachat → Firestore Database → Create database → Production mode → `asia-southeast1`

### 1.2 Deploy Rules & Indexes (run these commands)
```bash
cd "F:\OumaGa\Production Ready app\GaGa Chat\app"
firebase deploy --only firestore:rules,firestore:indexes,storage
```
✅ `firestore.rules` — ready (snake_case collection names, correct auth rules)
✅ `firestore.indexes.json` — ready (all indexes use correct collection names)
✅ `storage.rules` — ready

### 1.3 Authentication
- 🔧 Firebase Console → Authentication → Sign-in method → Enable **Email/Password**
- 🔧 Enable **Google** sign-in (add SHA-1 if needed for Android later)
- 🔧 Settings → Authorized domains → confirm `oumagachat.web.app` is listed

### 1.4 Firebase Storage
- 🔧 Firebase Console → Storage → Get started → Production mode → `asia-southeast1`

### 1.5 Push Notifications (VAPID Key)
- 🔧 Firebase Console → Project Settings → Cloud Messaging → Web Push certificates → Generate key pair
- 🔧 Copy the key → paste into `.env` as `VITE_FIREBASE_VAPID_KEY=<your_key>`
- 🔧 Rebuild: `npm run build`

---

## PHASE 2: Deploy

```bash
# Full deploy (build + hosting + firestore + storage)
npm run deploy:full

# Or step by step:
npm run build
firebase deploy --only hosting
firebase deploy --only firestore:rules,firestore:indexes,storage
```

### Verify after deploy
- Open https://oumagachat.web.app
- DevTools → Application → Service Workers → registered ✓
- DevTools → Application → Manifest → valid ✓
- DevTools → Console → no errors ✓

---

## PHASE 3: Custom Domain (gagachat.app)

- 🔧 Firebase Console → Hosting → Add custom domain → `gagachat.app`
- 🔧 Add DNS records at your domain registrar (Firebase will show you the exact records)
- 🔧 Wait for SSL certificate provisioning (~24h)
- ✅ `main.tsx` already redirects `oumagachat.web.app` → `gagachat.app` once custom domain is live

---

## PHASE 4: Monetization — What Needs Code vs Manual

### Payment (bKash / Stripe)
- ⬜ `src/store/usePremiumStore.ts` → replace mock `upgradePlan()` with real payment API call
- ⬜ For bKash: contact https://developer.bka.sh/ for Merchant API credentials
- ⬜ For Stripe: `npm install @stripe/stripe-js` → create checkout session

### Ads
- ⬜ Replace mock ads in `src/lib/mockAds.ts` with real AdSense `<ins>` tags or Ad Manager
- ⬜ Sign up at https://www.google.com/adsense

### Coins Purchase Flow
- ⬜ Add a "Buy Coins" page that triggers bKash/Stripe → on success → `earnCoins(userId, amount)`

---

## PHASE 5: Quick Commands

```bash
# Dev server
npm run dev

# Build only
npm run build

# Deploy hosting only (fastest)
npm run deploy:hosting

# Deploy everything (build + all Firebase services)
npm run deploy:full

# Deploy rules/indexes only (no rebuild needed)
npm run deploy:rules

# Check Firebase login
firebase projects:list
```

---

## REMAINING MANUAL CHECKLIST

| Task | Status |
|------|--------|
| Create Firestore database in Firebase Console | 🔧 |
| Enable Email/Password auth | 🔧 |
| Enable Google auth | 🔧 |
| Create Firebase Storage bucket | 🔧 |
| Generate VAPID key → add to .env | 🔧 |
| Run `npm run deploy:full` | 🔧 |
| Test sign-up at oumagachat.web.app | 🔧 |
| Add custom domain gagachat.app | ⬜ |
| Set up bKash/Stripe payment | ⬜ |
| Set up Google AdSense | ⬜ |
| Submit to Google Search Console | ⬜ |
| Share on social media | ⬜ |
