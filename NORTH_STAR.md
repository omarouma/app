# GaGa — North-Star Goal (PERMANENT)

> **This is the owner's standing target for GaGa. It must be remembered and
> applied to EVERY future change, build and decision. Never lose sight of it.**

## The goal

**GaGa must be BETTER than WhatsApp and Messenger — a true global competitor,
not a clone.**

Every feature, every screen, every millisecond of performance and every pixel of
polish is judged against one question:

> *"Is this at least as good as WhatsApp/Messenger — and ideally better?"*

## What "better" means (the bar we hold ourselves to)

1. **Performance** — faster cold start, smoother scrolling, smaller download than
   both. (Already: 5.6 MB universal APK, GPU-accelerated WebView, R8-shrunk.)
2. **Reliability** — messages never lost, never duplicated, never out of order;
   calls connect fast and never get stuck; works on flaky networks and offline.
3. **Privacy & security** — end-to-end encryption, no token leakage, secure
   session handling, transparent data practices.
4. **Feature parity+** — everything WhatsApp/Messenger has (text, media, voice,
   video, groups, calls, status/stories, reactions, replies, search, backup,
   multi-device) **plus** differentiators they lack.
5. **Design & UX** — clean, modern, fast, accessible, dark mode, 85+ languages,
   works on low-end devices and old Android (5.1+).
6. **Global readiness** — universal APK, all ABIs, all locales, Play-Store-ready.

## Differentiators to win on (where we can beat them)

- **AI built-in** (GaGa AI assistant, smart replies, translation, summarization).
- **Rewards / wallet** (GaGa Rewards, in-app wallet) — engagement they don't have.
- **Premium tier** with clear value.
- **Openness** — no lock-in, cross-platform, transparent.
- **Speed & lightness** — a fraction of their install size and RAM footprint.

## Non-negotiables

- Native Android APK/AAB is the product. **Never** ship or prioritise a web-app
  version as the deliverable.
- Firebase (Auth + FCM) + Supabase (Postgres/RLS/Realtime/Storage/Edge) + GitHub
  are the backbone — keep all three wired and working.
- Every release is signed, verified, and pushed to GitHub.

## How this is enforced

- This file is the reference for scope and quality decisions.
- `todo.md` for each work session must trace back to this goal.
- When in doubt, choose the option that makes GaGa *better than WhatsApp/Messenger*.
