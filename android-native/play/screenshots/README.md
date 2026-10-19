# Phone screenshots

Play requires **2–8 phone screenshots**, each between 320 px and 3840 px on the
long edge, with an aspect ratio between 16:9 and 9:16.

These must be **real captures of the release build** — not mock-ups, not
placeholder art, and not the component-preview images the instrumented tests
produce (those are engineering visual checks, not store art).

## How to capture

1. Install the release build on a device or emulator and sign in to a test
   account with a little sample content (a few chats, one call, a filled
   profile).
2. Run the helper:

   ```bash
   bash android-native/ci/capture_store_screenshots.sh
   ```

   It walks through the screens Play expects — Chats, Chat room, Call, Profile,
   Settings, Today — and saves 1080×1920 PNGs here.

Suggested set (pick 4–6):

| File | Screen | What it should show |
| --- | --- | --- |
| `01-chats.png` | Chats | Conversation list with unread badges and the filter chips |
| `02-chatroom.png` | Chat room | A real conversation with text, a photo and a location card |
| `03-call.png` | Call | The in-call screen or the call history |
| `04-profile.png` | Me | Avatar, name, badges and the profile actions |
| `05-settings.png` | Settings | The searchable settings hub |
| `06-today.png` | Today | The daily dashboard with tasks and reminders |

## Rules

- Use a **test account** with non-sensitive sample data. Do not capture real
  users' names, numbers, photos or locations.
- Use the **release build** and the real theme (light or dark) — do not
  recolour or retouch the UI.
- Keep the status bar clean (full battery, no notifications) for a tidy grid.
- Do not add marketing frames, arrows or captions that misrepresent the UI.
