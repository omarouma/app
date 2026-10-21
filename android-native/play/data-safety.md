# GaGa Chat — Google Play Data safety form (answers)

Package: `gagachat.app` · Release candidate: 2.8.15 (versionCode 70)
Grounded in: `hosting/public/privacy.html` (updated 17 Oct 2026), the app's
`AndroidManifest.xml` permissions, and the actual data flows in
`core/network`, `core/data`, and the Supabase backend.

**Draft for operator review, not a certified final declaration.** Complete
Play Console **App content → Data safety** only after testing the precise signed
2.8.15 package and verifying actual Firebase/Supabase/analytics data flows.
If a data type is not collected, do not declare it; if it is, declare it.
Do not silently reuse older 2.8.14 answers without checking for changes.

Before submitting, recheck especially: whether phone number is *required* for
the actual signup path, whether app diagnostics and analytics are collected,
any sharing with third-party processors, encryption in transit, account/data
deletion URL `https://gagachat.app/delete-account` (only after hosting deployment
and mailbox validation), and the retention/disclosure period. The table below
documents previous assumptions; it is not evidence of live reviewer approval.

---

## Section 1 — Data collection and security

| Question | Answer |
| --- | --- |
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (TLS for all app↔server traffic) |
| Do you provide a way for users to request that their data is deleted? | **Yes** — in-app account deletion (Settings) and email privacy@gagachat.app |
| Has your app been independently validated against a global security standard? | **No** |

---

## Section 2 — Data types

For each row: **Collected** = transmitted off device; **Shared** = sent to a third
party. "Optional" = only when the user chooses the feature. Purpose codes follow
the Play form.

### Personal info

| Data type | Collected | Shared | Optional | Purposes |
| --- | --- | --- | --- | --- |
| Name | Yes | No | No | Account management, App functionality |
| Email address | Yes | No | No | Account management, App functionality |
| Phone number | Yes | No | No | Account management, App functionality |
| User IDs | Yes | No | No | Account management, App functionality |
| Address | No | — | — | — |
| Race and ethnicity | No | — | — | — |
| Political or religious beliefs | No | — | — | — |
| Sexual orientation | No | — | — | — |
| Other info | No | — | — | — |

### Financial info

| Data type | Collected | Shared | Optional | Purposes |
| --- | --- | --- | --- | --- |
| User payment info | No | — | — | — (no live payments; wallet is a bookkeeping preview only) |
| Purchase history | No | — | — | — |
| Credit score | No | — | — | — |
| Other financial info | No | — | — | — |

### Health and fitness

| Data type | Collected | Shared | Optional | Purposes |
| --- | --- | --- | --- | --- |
| Health info | No | — | — | — |
| Fitness info | No | — | — | — |

### Messages

| Data type | Collected | Shared | Optional | Purposes |
| --- | --- | --- | --- | --- |
| Emails | No | — | — | — |
| SMS or MMS | No | — | — | — |
| In-app messages | Yes | No | No | App functionality |

### Photos and videos

| Data type | Collected | Shared | Optional | Purposes |
| --- | --- | --- | --- | --- |
| Photos | Yes | No | Yes | App functionality |
| Videos | Yes | No | Yes | App functionality |

### Audio files

| Data type | Collected | Shared | Optional | Purposes |
| --- | --- | --- | --- | --- |
| Voice or sound recordings | Yes | No | Yes | App functionality (voice notes; call audio is real-time and not stored) |
| Music files | No | — | — | — |
| Other audio files | No | — | — | — |

### Files and docs

| Data type | Collected | Shared | Optional | Purposes |
| --- | --- | --- | --- | --- |
| Files and docs | Yes | No | Yes | App functionality (documents the user chooses to send, ≤ 50 MB) |

### Calendar

| Data type | Collected | Shared | Optional | Purposes |
| --- | --- | --- | --- | --- |
| Calendar events | No | — | — | — |

### Contacts

| Data type | Collected | Shared | Optional | Purposes |
| --- | --- | --- | --- | --- |
| Contacts | Yes | No | Yes | App functionality (find friends; revocable any time) |

### App activity

| Data type | Collected | Shared | Optional | Purposes |
| --- | --- | --- | --- | --- |
| App interactions | Yes | No | No | Analytics, App functionality |
| In-app search history | No | — | — | — |
| Installed apps | No | — | — | — |
| Other user-generated content | Yes | No | Yes | App functionality (profile photo, display name, status) |
| Other actions | No | — | — | — |

### Web browsing

| Data type | Collected | Shared | Optional | Purposes |
| --- | --- | --- | --- | --- |
| Web browsing history | No | — | — | — |

### App info and performance

| Data type | Collected | Shared | Optional | Purposes |
| --- | --- | --- | --- | --- |
| Crash logs | Yes | No | No | Analytics, App functionality (stability) |
| Diagnostics | Yes | No | No | Analytics, App functionality |
| Other app performance data | No | — | — | — |

### Device or other IDs

| Data type | Collected | Shared | Optional | Purposes |
| --- | --- | --- | --- | --- |
| Device or other IDs | Yes | No | No | App functionality (FCM push token for notifications and incoming-call alerts) |

### Location

| Data type | Collected | Shared | Optional | Purposes |
| --- | --- | --- | --- | --- |
| Approximate location | Yes | No | Yes | App functionality (only when the user sends a location) |
| Precise location | Yes | No | Yes | App functionality (only when the user sends a location) |

---

## Section 3 — Notes for reviewers

- **Location** is never collected in the background and never sent automatically.
  It is captured only at the moment the user taps "Send location" and is shared
  with the chosen recipient in the chat.
- **Contacts** are read only after the user grants the permission and are used
  solely to match existing GaGa users; the user can revoke it in Android settings.
- **Camera / microphone** are used only for calls, photo capture and voice notes.
- **Push tokens** are used only to deliver notifications and incoming-call alerts.
- **No advertising SDK** and **no data sold**. Crash/analytics diagnostics exclude
  message content.
- **Photo text recognition** runs on-device with bundled models; text is sent to
  a translation service only after explicit confirmation.
- **Wallet** is a preview: no custody, no real-money transfers, no purchases. If
  that ever changes, this form must be updated before shipping.
