# Production Improvements — Task Tracking

## Status: IN PROGRESS

### 1. Logo Quality & Visibility

- [x] Fix `src/config/env.ts` indentation + add AdSense env vars
- [x] Update `src/components/Logo.tsx` to use crisp `public/logo.svg`
- [x] Add `public/favicon.svg` + improve apple-touch-icon/favicon references
- [x] Update `index.html` OG/Twitter share image to a proper 512px brand asset
- [x] Update `manifest.json` screenshots + icon purposes

### 2. Advertising Section

- [x] Wire `GoogleAd.tsx` to read real AdSense slot IDs from `env`
- [x] Integrate `AdBanner`/`AdBannerCarousel` into Timeline feed (mock + real with fallback)
- [x] Add "Ad" disclosure + accessibility
- [x] Update `deploy.yml` with AdSense secrets (DONE)

### 3. Social Sharing

- [x] Enhance share modal: WhatsApp, Facebook, X, Telegram, Messenger + Web Share API
- [x] Add OG meta tags on `PostPage.tsx` for rich previews
- [x] Make app URL configurable via `VITE_APP_URL`

### 4. Timeline / Feed

- [x] Improve ad interleaving between posts
- [x] Add share count display on `TimelineCard`
- [x] Richer engagement polish

### 5. Production Build & Deployment

- [x] Verify `npm run build` passes
- [x] Update `README.md` with deployment + AdSense config
- [x] Verify `preview:prod` works

## Follow-up

- Run `npm run build` to verify no TypeScript errors
- Run `npm run lint`
- Manual verification of feed, share modal, logo rendering
