# GaGa 2.0.31 — Daily Life MVP

Native Compose module, using the existing authenticated Supabase transport and public configuration. Firebase Admin credentials are never embedded or committed.

## Implemented scope
- Daily Life navigation hub; existing Chats, People, Calls and Me remain accessible.
- Private income and expense CRUD with BDT/USD/CNY, categories, recorded accounts, date and notes.
- Monthly income/expense summaries; monthly category or overall budget tracking. Currencies are never summed together or automatically exchanged.
- Opening account records and calculated recorded account totals; these are not custodial balances.
- Borrowed/lent records and server-validated partial repayments. Contribution operation IDs make retries idempotent, and parent-row locking prevents overspending the remaining amount.
- Savings goals with recorded contributions.
- Bills/reminders with date/time selection, complete/reopen, and private Android notifications. WorkManager is best-effort, requires connectivity to recheck server completion, and is not an exact alarm. Delivery markers prevent duplicate alerts for the same due date on the same device.
- Private notes.
- Shared shopping lists: create, add quantity-labelled items, mark purchased, search GaGa users, explicitly confirm sharing, and remove members. Owner-only membership changes, up to 20 members, refresh every 15 seconds while open.
- Private CSV export using Android's document picker; spreadsheet formula-like strings are escaped.
- Chat message actions: Save privately, Remind me, Create expense, Message info and multiple selection. Saved-message REST response now correctly decodes PostgREST's returned array.
- Removed the coin wallet UI action that directly increased the coin balance without a real funding flow.

## Backend and data preservation
Four additive tables: gaga_daily_records, gaga_daily_contributions, gaga_shopping_lists, gaga_shopping_items. No existing chat, profile, wallet or auth data is migrated or deleted. Account deletion cascades only that account's owned Daily Life records.

RLS ownership rules, explicit grants, active-session checks, immutable ownership/list identifiers, repayment bounds and owner-only sharing protect the new tables. Authenticated-only SECURITY DEFINER RPCs intentionally provide narrowly guarded atomic contributions and membership changes; they set an empty search_path and reject revoked sessions. The generic advisor warning for these authenticated RPCs is expected and not waived for unrelated existing functions.

## Verification
- supabase/tests/daily_life_rls.sql runs allow/deny tests inside a transaction and rolls back all fixture records.
- Tests cover private records across two real auth identities, impersonation denial, direct paid/owner changes, repayment retry and bounds, currency changes after repayment, sharing, member purchasing and removed-member access.
- DailyMoneyTest covers exact two-decimal parsing, invalid/negative/overflow amounts and formatting.
- Existing LiveKit/create-call Node authorization tests are included in validation.
- Android compilation and Gradle test results are recorded in the release handoff.

## Release limits
This is the agreed core Daily Life MVP, not every expansion feature discussed. Automatic translation, actual payment rails, paid subscriptions, recurring transactions, chat expense-splitting cards, business orders and appointments are not implemented here. Personal forms require an internet connection to save; entries remain in the open editor on save failure. There is no persistent offline outbox for Daily Life yet. Shopping list loading is capped at 500 lists / 1000 items per list.

Signing must use an existing private key. The uploaded 2.0.27 CI APK has certificate f3eab57a0acda4d380681056d325503180e0f7185cd8773a7887a8048e207cc2. The uploaded 2.0.30 APK has certificate c06fd3ccb3a7e66e56e6a7be8a7253db1b54afab666647d63c4e4d6de5161c57. These are different identities; a build signed with the former is not an in-place update for the latter. Do not uninstall an installed app before preserving its local data.
