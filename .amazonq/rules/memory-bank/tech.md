# GaGa Chat — Technology Stack

## Core Languages & Runtimes
- TypeScript ~5.9.3 (strict mode)
- React 19.2 + React DOM 19.2
- Node.js (ESM modules, `"type": "module"` in package.json)

## Build & Tooling
| Tool | Version | Role |
|------|---------|------|
| Vite | ^7.2.4 | Dev server + production bundler |
| TypeScript | ~5.9.3 | Type checking (`tsc -b && vite build`) |
| ESLint | ^10.8.0 | Linting (typescript-eslint + react-hooks + react-refresh) |
| PostCSS + Autoprefixer | ^8.5.6 | CSS processing |
| rollup-plugin-visualizer | ^7.0.1 | Bundle analysis → `stats.html` |

## UI & Styling
| Library | Version | Role |
|---------|---------|------|
| Tailwind CSS | ^3.4.19 | Utility-first CSS |
| tailwind-merge | ^3.6.0 | Conditional class merging (`cn()`) |
| class-variance-authority | ^0.7.1 | Component variant system |
| Radix UI | various | Accessible headless primitives (full suite) |
| Framer Motion | ^12.40.0 | Animations |
| Lucide React | ^0.562.0 | Icon library |
| shadcn/ui | (via components.json) | Pre-built component patterns on Radix |
| next-themes | ^0.4.6 | Dark/light theme switching |
| sonner | ^2.0.7 | Toast notifications |
| vaul | ^1.1.2 | Drawer component |

## State Management
- Zustand ^5.0.14 — global stores (19 stores)
- React Context — Auth, Call contexts
- react-hook-form ^7.79.0 + @hookform/resolvers + zod ^4.4.3 — form state + validation

## Backend & Data
| Service | SDK | Role |
|---------|-----|------|
| Supabase | @supabase/supabase-js ^2.110.2 | Primary DB (PostgreSQL + RLS), Auth, Realtime, Storage |
| Firebase | firebase ^12.15.0 | Hosting, Auth fallback, Storage fallback, Analytics, FCM |

## Routing
- react-router-dom ^7.18.2 (v7 API)

## Media & Rich Content
- Cloudinary — primary media upload (via REST, no SDK)
- embla-carousel-react ^8.6.0 — carousels
- react-virtuoso ^4.18.11 — virtualized lists
- recharts ^2.15.4 — analytics charts
- qrcode ^1.5.4 — QR code generation
- date-fns ^4.4.0 — date formatting

## Internationalization
- i18next ^26.3.6 + react-i18next ^17.0.11
- i18next-browser-languagedetector + i18next-http-backend
- Translations in `public/locales/en/` and `public/locales/es/`

## PWA
- Custom service worker: `public/sw.js`
- Web App Manifest: `public/manifest.json`
- Background sync, push notifications via FCM
- Offline queue: `src/hooks/useOfflineQueue.ts`

## WebRTC
- Native browser WebRTC APIs
- Supabase Realtime as signaling channel
- Hooks: `useWebRTCManager`, `useLiveStreamRTC`, `useVoiceRoomRTC`

## Analytics
- Firebase Analytics + GA4 (`VITE_GA_MEASUREMENT_ID`)
- Firebase Performance Monitoring
- Custom hooks: `useFirebaseAnalytics`, `useGATracking`

## Deployment
- Firebase Hosting (CDN, security headers, PWA)
- Firebase project: `oumagachat`
- CI/CD: GitHub Actions (`.github/workflows/deploy.yml`)
- Build output: `dist/` (code-split, hashed assets)

## Key Dev Commands
```bash
npm run dev          # Vite dev server → http://localhost:3000
npm run build        # tsc -b && vite build → dist/
npm run lint         # ESLint check
npm run lint:fix     # ESLint auto-fix
npm run preview      # Serve dist/ locally (port 4173)
npm run deploy       # build + firebase deploy --only hosting
node scripts/verify-backend.mjs  # Verify 29 Supabase tables
```

## Environment Variables (required for production build)
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
# Optional:
VITE_CLOUDINARY_CLOUD_NAME
VITE_CLOUDINARY_UPLOAD_PRESET
VITE_GA_MEASUREMENT_ID
VITE_YOUTUBE_API_KEY
VITE_TURN_*
```

## Path Alias
`@/` → `src/` (configured in `vite.config.ts` resolve.alias and `tsconfig.app.json`)

## Build Configuration Notes
- `manualChunks`: each `node_modules` package gets its own chunk
- `sourcemap: 'hidden'` — source maps generated but not referenced in output
- `target: 'es2020'`
- `minify: 'esbuild'`
- Env-guard plugin throws at build time if any of the 8 required vars are missing (production only)
