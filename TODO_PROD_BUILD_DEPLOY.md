# Production Build & Deploy — Task Tracking

## Steps
- [x] Analyze current state (prior session partial implementation)
- [x] Step 1: Fix `Logo.tsx` — add `withWordmark` prop
- [x] Step 2: Add share-count display to `TimelineCard.tsx`
- [x] Step 3: Update OG/Twitter share image to 512px logo in `index.html` + `LandingView.tsx`
- [x] Step 4: Verify Timeline feed ad interleaving + share handling
- [x] Step 5: Update `TODO_PROD_IMPROVEMENTS.md` completed items
- [x] Step 6: Run `npm run build` (verify passes)
- [x] Step 7: Deploy to Firebase Hosting

## Verified Complete (from prior session)
- [x] `public/logo.svg` (512x512 brand logo)
- [x] `public/favicon.svg`
- [x] `public/logo-512.png`
- [x] `src/lib/share.ts` (WhatsApp/FB/X/Telegram/LinkedIn/email/native)
- [x] `src/pages/PostPage.tsx` (dynamic OG meta + share modal)
- [x] Routes `/post/:id` and `/share` wired in `App.tsx`
- [x] `GoogleAd.tsx` reads AdSense slots from env + mock fallback
- [x] `deploy.yml` includes AdSense secrets
- [x] `.env` has VITE_ADSENSE_* vars
