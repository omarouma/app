# GaGa Signature Features Roadmap

## Product position
**GaGa — Chat. Organize. Get Things Done.**

GaGa should let a user begin with an ordinary conversation and complete the related real-life action without leaving the conversation.

The product should not differentiate mainly through commodity messenger features such as stickers or GIFs. Those remain parity features. Differentiation comes from structured daily-life actions built directly into chat.

---

# Current baseline

## 1. GaGa Today — PARTIAL / FOUNDATION LIVE
Already present:
- Top-level GaGa Today experience.
- Tasks.
- Reminders with Android due alerts.
- Private notes.
- Expenses/income/debt/goals/budgets/accounts.
- Shared shopping lists.
- Message-created Task / Reminder / Expense / Private Note records.
- Source chat/message linkage for actions.

Still required:
- Needs Reply inbox.
- Calendar/events.
- Upcoming calls/classes.
- Bills and deliveries.
- Important-people shortcuts.
- Live-location status card.
- Poll/group activity card.
- Today priority scoring and grouping.

Target experience:
- Greeting.
- Needs reply.
- Due today.
- Upcoming.
- Money/debt.
- Active live location.
- Missed calls / call back.
- Group/class activity.

## 2. Action Messages — PARTIAL / FOUNDATION LIVE
Already present on message long press:
- Create Task.
- Remind Me.
- Create Expense.
- Save as Private Note.

Add:
- Translate.
- Event.
- Poll.
- Shared List.
- Split Bill.
- Location Plan.
- Service Request.
- Add Contact / Call phone number.
- Save document / summarize / translate document.

### Smart context detector
A local deterministic detector should run first. It must never perform an action automatically.

Candidate detections:
- Date/time -> Reminder / Event.
- Money amount/currency -> Expense / Split.
- Location/address/map URL -> Navigate / ETA / Live Location / Arrive Reminder.
- Phone number -> Call / Add Contact.
- Question in group -> Poll.
- File/document -> Save / Translate / Summarize.
- Task language ("please send", "need to", "remember") -> Task suggestion.

All suggestions require user confirmation.

## 3. GaGa Circles — NEW SYSTEM
Extend generic groups with a circle type:

- FAMILY
- FRIENDS
- CLASS
- WORK
- BUSINESS

Do not fork chat transport. Circle type changes tools/modules shown around the same secure group chat.

### Family Circle
- Live location.
- SOS.
- Safe-arrival check-in.
- Shared shopping list.
- Family reminders.
- Shared expenses.
- Important family documents.

### Friends Circle
- Polls.
- Events.
- Shared expenses / bill split.
- Shared location.
- Plans and reminders.

### Class Circle
- Assignments.
- Class schedule.
- Announcements.
- Polls.
- Notes/files.
- Study reminders.
- Translation.

### Work Circle
- Tasks.
- Deadlines.
- Meetings.
- Files.
- Approvals.
- Announcements.

### Business Circle
- Customer/team mode.
- Quick replies.
- Order/service status.
- Catalog.
- Appointments.
- Invoice/payment link integration.
- Customer labels.

### Backend additions
- circle_type on group metadata.
- circle_settings.
- circle_modules or feature flags.
- Optional circle_events/tasks/announcements where existing Daily Life records are not sufficient.
- Access controlled by existing group membership/admin RPCs.

## 4. Bangla–English–Chinese Bridge — NEW SYSTEM
Current app UI supports English, Bengali and Chinese, but UI localization is not message translation.

Build:
- One-tap Translate in message Action Bar.
- Detect source language.
- Translate between bn / en / zh.
- Store translation as local/account cache, not as a mutation of original message.
- Show original / translated toggle.
- Voice note -> speech-to-text -> translation.
- Optional translated subtitle during voice playback.
- Image/document text extraction -> translate.
- Copy translated text.

Privacy:
- Original messages must not be sent to an external translation provider silently.
- Show cloud-processing disclosure if translation is not on-device.
- Never replace the original stored message.

## 5. GaGa Safe — PARTIAL
Already present:
- One-time location sharing.
- Live location.
- Time-limited live sharing.
- Stop-sharing control.

Add:
- Emergency contacts.
- SOS Circle.
- Timed check-in ("Check on me in 30 min").
- "I reached safely".
- Arrival reminder/geofence-like workflow.
- Share live location + battery/time remaining.
- Escalation if check-in expires.
- Clear cancellation and privacy controls.

No background emergency action should be triggered without an explicit user setup.

## 6. GaGa Lite — PARTIAL
Already present:
- Offline message queue and retry.
- WorkManager sync.
- Media auto-download controls.
- Wi-Fi / Always / Never media policy.
- Image compression path.
- Background upload worker.

Add explicit **Lite Mode**:
- Text first.
- Disable automatic media download.
- Lower thumbnail/video quality.
- Aggressive image compression.
- Delay large uploads until Wi-Fi (optional).
- Reduce presence/typing refresh frequency.
- Lower call video resolution / prefer audio.
- Battery-aware background sync.
- Data-usage counter.
- True resumable/chunked large-file upload.

Important: current background retry is not the same as a byte-range/chunk resumable transfer. Do not label it "resumable upload" until chunk/session recovery exists.

---

# GaGa Action Bar

Long-press message:

**Reply · React · Forward · Translate · Task · Reminder · Event · Save · Split · More**

Context-aware ordering:

- Date/time -> Event, Reminder first.
- Money -> Split, Expense first.
- Address/location -> Map, ETA, Live Location, Arrival Reminder.
- Phone -> Call, Add Contact.
- Question in group -> Poll.
- Document -> Save, Translate, Summarize.
- Ordinary text -> Reply, Task, Reminder, Translate.

The action bar should remain fast and never make network calls merely by opening it.

---

# GaGa Today target dashboard

Example layout:

## Good morning
- Needs reply
- Due today
- Upcoming
- Money
- Safety
- Calls
- Circle activity

Example cards:
- 3 messages need your reply.
- Meeting with supplier — 11:30.
- Send quotation to Karim.
- Rahim owes you BDT 1,250.
- Family live location active — 18 min.
- Delivery arriving today.
- Assignment due tomorrow.
- Missed call — Call back.
- Class Circle has a new poll.

Every card must deep-link to the exact chat/action.

---

# Release plan

## 2.2 — Smart Actions + Today
Priority:
1. Smart local action detector.
2. Needs Reply.
3. Event records + Android calendar handoff.
4. Split expense calculator (record only; no payment movement).
5. Location Action Bar actions.
6. Today priority dashboard.

## 2.3 — Circles + Safe
1. Circle types.
2. Circle-specific tool tray.
3. Family Safe features.
4. Class assignments/announcements.
5. Work tasks/approvals.
6. Business quick replies/catalog foundation.

## 2.4 — Language Bridge + Lite
1. Message translation bn/en/zh.
2. Voice transcription + translation.
3. Image/document translation.
4. Lite Mode.
5. Data usage.
6. Chunked/resumable uploads.

---

# Non-negotiable architecture rules

1. Chat remains the source interaction layer; structured actions are linked records.
2. Never mutate the original message to represent a translation/task/event.
3. User confirmation is required before creating structured actions from detected text.
4. Circle type extends the current group model; it must not create a second chat transport.
5. Private Today records stay owner-only unless explicitly shared.
6. Location/SOS sharing is opt-in, time-bounded where appropriate, and revocable.
7. Lite Mode must reduce real network/data use, not just hide media UI.
8. Translation must disclose cloud processing if an external provider receives message content.
9. Payment/split features may record balances before regulated payment capability exists; they must not imply GaGa holds/transfers money.
10. New features require two-account/device verification where sharing, privacy or permissions are involved.

