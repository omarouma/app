# GaGa Chat — Project Structure

## Directory Layout

```
src/
├── App.tsx                  # Root router, lazy-loaded routes, auth guard
├── main.tsx                 # Entry point, React 19 createRoot
├── index.css                # Global styles + Tailwind base
├── i18n.ts                  # i18next initialization
│
├── components/              # Reusable UI components
│   ├── calling/             # Call UI (overlay, controls, incoming)
│   ├── features/            # Feature-specific components
│   │   ├── chat/            # ChatRoom, MessageBubble, InputBar, etc.
│   │   ├── stories/         # Story viewer/creator
│   │   ├── reels/           # Reel player/feed
│   │   ├── live/            # Live stream viewer/host UI
│   │   └── voice/           # Voice room UI
│   ├── layout/              # AppShell, BottomNav, Sidebar
│   ├── ui/                  # shadcn/ui primitives (button, dialog, etc.)
│   └── *.tsx                # Shared modals and utility components
│
├── context/
│   ├── AuthContext.tsx      # Auth state provider (Supabase session)
│   ├── CallContext.tsx      # Active call state provider
│   └── CallContextBase.ts   # Shared call context types/defaults
│
├── hooks/                   # Custom React hooks (40+ hooks)
│   ├── useChatRoom.ts       # Main chat room orchestration
│   ├── useChatLogic.ts      # Message send/receive logic
│   ├── useChatState.ts      # Chat UI state
│   ├── usePresence.ts       # Online/offline presence
│   ├── useTyping.ts         # Typing indicator pub/sub
│   ├── useOfflineQueue.ts   # Offline message queue + background sync
│   ├── useWebRTCManager.ts  # WebRTC peer connection management
│   ├── useLiveStreamRTC.ts  # Live stream WebRTC
│   ├── useVoiceRoomRTC.ts   # Voice room WebRTC
│   ├── useContentModeration.ts # Content filtering
│   ├── useMessageRateLimiter.ts # Rate limiting
│   └── ...
│
├── lib/                     # Core libraries and utilities
│   ├── firestore.ts         # Dual-backend router (Supabase primary / Firestore fallback)
│   ├── supabase.ts          # Supabase client singleton
│   ├── supabaseAuth.ts      # Auth helpers (signIn, signUp, OTP)
│   ├── supabaseDb.ts        # DB query helpers
│   ├── supabaseStorage.ts   # Storage upload helpers
│   ├── firebase.ts          # Firebase app init
│   ├── storage.ts           # Cloudinary → Firebase → localStorage fallback chain
│   ├── webrtc.ts            # WebRTC signaling via Supabase
│   ├── sanitize.ts          # Input sanitization
│   ├── utils.ts             # cn() and general utilities
│   ├── timeUtils.ts         # Date/time formatting
│   └── ...
│
├── pages/                   # Route-level page components (50+ pages)
│   ├── ChatsPage.tsx        # Chat list
│   ├── ChatRoomPage.tsx     # Individual chat
│   ├── ReelsPage.tsx        # Reels feed
│   ├── LiveStreamsPage.tsx   # Live stream list
│   ├── WalletPage.tsx       # Wallet/payments
│   ├── ProfilePage.tsx      # User profile
│   └── ...
│
├── services/                # External service integrations
│   ├── pushNotificationService.ts  # FCM push notifications
│   ├── pexelsService.ts            # Pexels stock media API
│   └── youtubeService.ts           # YouTube API
│
├── store/                   # Zustand global stores (19 stores)
│   ├── useAuthStore.ts      # Current user, session
│   ├── useChatStore.ts      # Chat list, active chat
│   ├── useMessageStore.ts   # Messages per chat
│   ├── useFriendStore.ts    # Friends, requests
│   ├── useReelStore.ts      # Reels feed
│   ├── useWalletStore.ts    # Wallet balance, transactions
│   └── ...
│
├── styles/
│   └── dark-mode.css        # Dark mode CSS variables
│
├── types/
│   └── index.ts             # All TypeScript interfaces/types (single source of truth)
│
└── views/                   # Desktop + shared full-page views
    ├── AuthView.tsx         # Login/signup UI
    ├── LandingView.tsx      # Marketing landing page
    ├── DesktopChatView.tsx  # Desktop two-panel chat layout
    └── ...

public/
├── sw.js                    # Service worker (caching, offline, push)
├── manifest.json            # PWA manifest
└── locales/en|es/           # i18n translation JSON files

scripts/
├── verify-backend.mjs       # Checks all 29 Supabase tables exist
└── fix-currency-*.mjs       # DB migration helpers
```

## Architectural Patterns

### Dual-Backend Router (`src/lib/firestore.ts`)
All data access goes through a unified interface. At module load, it detects whether `VITE_SUPABASE_URL` is set and routes to Supabase (primary) or Firestore (fallback). Stores and pages import from `@/lib/firestore` and never call backends directly.

### Zustand Stores
Each domain has its own Zustand store. Stores hold state + async actions. Components subscribe via selectors. Stores call `@/lib/firestore` (or Supabase helpers directly for complex queries).

### Hook Decomposition
Complex pages (e.g., ChatRoom) are broken into many focused hooks:
- `useChatState` → local UI state
- `useChatLogic` → send/receive
- `useChatEffects` → subscriptions/side effects
- `useChatUI` → scroll, focus
- `useChatRoom` → orchestrates all sub-hooks

### Component Layers
1. `pages/` — route entry points, minimal logic, compose views/hooks
2. `views/` — layout-level components (desktop vs mobile)
3. `components/features/` — feature-specific smart components
4. `components/ui/` — shadcn/ui primitives (pure presentational)

### Storage Fallback Chain
`Cloudinary (primary) → Firebase Storage → localStorage/IndexedDB`
Implemented in `src/lib/storage.ts`.

### Path Alias
`@/` maps to `src/` throughout the codebase (configured in `vite.config.ts` and `tsconfig`).
