# GaGa Chat

A production-ready, real-time social chat application built with **React 19 + TypeScript + Vite**. It combines instant messaging, stories, reels, live streaming, voice rooms, calls, wallet/gifting, and a full creator ecosystem — all backed by **Supabase** (primary) with **Firebase** (hosting + fallback).

---

## 🚀 Live Site

- **Primary hosting:** <https://oumagachat.web.app>
- **Custom domain:** <https://gagachat.app> (if configured)

---

## 🧱 Tech Stack

| Layer         | Technology                                                            |
| ------------- | --------------------------------------------------------------------- |
| **UI**        | React 19, TypeScript, Vite 7, Tailwind CSS 3, Framer Motion, Radix UI |
| **State**     | Zustand (global stores), React Context                                |
| **Database**  | Supabase (PostgreSQL + RLS) — primary backend                         |
| **Realtime**  | Supabase Realtime (postgres_changes)                                  |
| **Auth**      | Supabase Auth (email/OTP) + Firebase Auth fallback                    |
| **Storage**   | Cloudinary (primary) → Firebase Storage → localStorage/IndexedDB      |
| **Hosting**   | Firebase Hosting (with CDN, security headers, PWA)                    |
| **PWA**       | Service worker, offline queue, background sync, push notifications    |
| **Analytics** | Firebase Analytics, GA4, Performance Monitoring                       |
| **WebRTC**    | Live streams, voice rooms, 1:1 calls (Supabase signaling)             |

---

## 📁 Project Structure

```text
src/
├── components/        # Reusable UI components (modals, cards, features)
├── context/           # React contexts (Auth, Call)
├── hooks/             # Custom hooks (RTC, presence, typing, offline, etc.)
├── lib/               # Core libraries (firestore router, storage, supabase, webrtc)
├── pages/             # Route-level pages (Chats, Profile, Reels, Live, etc.)
├── services/          # External services (push notifications, pexels)
├── store/             # Zustand stores (auth, chat, friends, reels, etc.)
├── styles/            # Global CSS (incl. dark mode)
├── types/             # TypeScript type definitions
└── views/             # Desktop + shared views (Auth, Landing, Privacy)
```

---

## 🔐 Backend Architecture

### Database Router (`src/lib/firestore.ts`)

The app uses a **dual-backend router**. At module load it resolves which backend is active:

- **Supabase** (primary) — used when `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set.
- **Firestore** (fallback) — used if Supabase is not configured.

All stores/pages import from `@/lib/firestore` and get a uniform interface:
`getDocById`, `setDocById`, `updateDocById`, `queryCollection`, `subscribeToCollection`, etc.

### Supabase Schema

The full schema lives in `supabase_full_setup.sql` (31 tables) plus `supabase_patch2.sql` (6 tables). All tables have **Row Level Security (RLS)** enabled. Realtime is enabled for messages, chats, typing, presence, notifications, posts, reels, stories, comments, friend requests, live streams, voice rooms, and more.

> ⚠️ **Important:** The `supabase_*.sql` files must be run **once** in the Supabase SQL Editor before the app can write data. They are idempotent and safe to re-run.

### Verification

```bash
node scripts/verify-backend.mjs
```

Expect: `29 present, 0 missing` (RLS-guarded tables are expected to show errors for the anon key — that confirms the table + RLS exist).

---

## 🗄️ Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```env
# ── Supabase (primary backend) ──
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# ── Firebase (hosting, auth fallback, storage fallback) ──
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_DATABASE_URL=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=

# ── Cloudinary (primary media storage) ──
VITE_CLOUDINARY_CLOUD_NAME=
VITE_CLOUDINARY_UPLOAD_PRESET=

# ── Third-party ──
VITE_GA_MEASUREMENT_ID=
VITE_YOUTUBE_API_KEY=
VITE_TURN_*=
```

> **Tip:** The `vite.config.ts` `env-guard` plugin **fails the build** if any of the 5 core vars above are missing. Fill them in before building.

---

## 🛠️ Development

```bash
npm install        # install dependencies
npm run dev        # start dev server on http://localhost:3000
```

The dev server runs at <http://localhost:3000>.

---

## 📦 Production Build

```bash
npm run build      # tsc -b && vite build → outputs to dist/
npm run preview    # serve the production build locally
```

The build is **code-split** into vendor, feature, and page-level chunks for fast global loads.

---

## ☁️ Deployment

### Prerequisites

- Firebase CLI installed (`npm i -g firebase-tools`)
- Logged in: `firebase login`
- Project configured: `.firebaserc` → `oumagachat`

### Manual deploy

> The app is **Supabase-only** for data (PostgreSQL + RLS). Firebase is used only for static hosting.

```bash
npm run deploy          # build + deploy hosting only
npm run deploy:full     # build + deploy hosting only (alias; no Firestore/Storage rules needed)
npm run deploy:rules    # no-op — data is managed via Supabase RLS
```

### CI/CD (GitHub Actions)

A workflow at `.github/workflows/deploy.yml` automates:

1. Install dependencies
2. Lint
3. Build production bundle
4. Deploy to Firebase Hosting on push to `main`

**Required GitHub secrets:**

- `FIREBASE_SERVICE_ACCOUNT` — JSON of a Firebase service account with the Hosting Admin role.

---

## 📱 PWA & Offline

- **Service worker** (`public/sw.js`) enables installability and offline caching.
- **Offline queue** (`src/hooks/useOfflineQueue.ts`) queues messages when offline and re-sends via background sync.
- **Push notifications** via Firebase Cloud Messaging (foreground + background).
- **Auto-update** — new SW versions prompt a refresh; stale chunks trigger a cache-clear + reload.

---

## 🔒 Security

- **Firestore rules** (`firestore.rules`) — role-based access (owner, friends, admin).
- **Storage rules** (`storage.rules`) — per-kind size/content-type restrictions.
- **Supabase RLS** — every table enforces row-level security.
- **Firebase hosting headers** (`firebase.json`) — strict CSP, HSTS, X-frame/Content-Type protection.

---

## 🧪 Verification Checklist

```bash
npm run build                    # zero TS errors
npm run lint                     # clean lint
node scripts/verify-backend.mjs  # 29 present, 0 missing
```

---

## 🆘 Troubleshooting

| Symptom                                 | Fix                                                                           |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| Build fails "Missing required env vars" | Copy `.env.example` → `.env`, fill all 5 core vars                            |
| Media uploads fall back to localStorage | Add `VITE_CLOUDINARY_CLOUD_NAME` + `VITE_CLOUDINARY_UPLOAD_PRESET`            |
| PGRST205 table missing                  | Run `supabase_full_setup.sql` + `supabase_patch2.sql` in Supabase SQL Editor  |
| Auth errors                             | Ensure Supabase Auth + the `on_auth_user_created` trigger are set up          |
| Realtime not updating                   | Verify `ALTER PUBLICATION supabase_realtime ADD TABLE ...` ran for the tables |

---

## 📄 License

Private project. All rights reserved.
