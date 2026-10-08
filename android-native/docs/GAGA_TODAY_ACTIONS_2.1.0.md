# GaGa Today + Action Messages MVP

## Product goal
Make GaGa useful after the conversation ends. A chat message can become a structured daily-life action without copying text into another app.

## 2.1.0 scope
- Rename the existing Daily Life top-level tab to **Today**.
- Present the destination as **GaGa Today**.
- Add a first-class **Task** record type with optional due date and completion state.
- Extend message long-press with a **GaGa Actions** section:
  - Create task
  - Remind me
  - Create expense
  - Save as private note
- Preserve the source chat and source message identifiers so the user can return from the action to the originating conversation.
- Task/reminder due alerts use the existing WorkManager reminder pipeline.
- Existing money records, debts, goals, budgets, notes and shared shopping lists remain unchanged.

## Product principles
1. Actions must be optional; ordinary chat stays fast.
2. Creating an action never modifies or deletes the source message.
3. Personal tasks/notes/expenses are private to the account owner.
4. Shared data must be explicitly shared; no implicit sharing from a group chat.
5. The app must not infer or move money automatically.
6. Future smart extraction may suggest an action, but the user confirms before saving.

## Next increments
- Smart date/time extraction from message text.
- "Needs reply" inbox in Today.
- Events and RSVP.
- Shared tasks/lists for Smart Circles.
- Translation action.
- Expense split action.
- Safe-arrival / check-in action.
