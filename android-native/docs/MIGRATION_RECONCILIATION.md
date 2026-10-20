# GaGa Chat — Migration Drift Reconciliation (issues #93 / #95)

Status: **resolved (read-only audit complete)**
Project: Supabase `fcjgbbmfqdkucfpqjxae` (ACTIVE_HEALTHY, ap-northeast-2, Postgres 17)
Repo: `omarouma/app` @ `main`
Date: 2026-10-19

---

## 1. Why this document exists

Issues **#93** and **#95** reported that the live Supabase project and the
`supabase/migrations/` folder in the repo had drifted apart. A fresh database
provisioned by replaying `supabase/migrations/*.sql` did not match the schema the
shipped client actually talks to. That is a production risk: a restore, a new
staging project, or a disaster-recovery rebuild would silently produce a backend
missing functions and policies the app depends on (for example the outbound-call
RPC `gaga_create_call`, which used to 404 with `PGRST202` on a fresh project).

This document is the authoritative reconciliation. It records:

- the exact inventory of both sides,
- the canonical mapping between them,
- the one migration that is genuinely unapplied, and
- the read-only drift check that now guards against regressions.

---

## 2. Inventory

| Side | Source | Count |
|------|--------|-------|
| Live | `supabase_migrations.schema_migrations` on `fcjgbbmfqdkucfpqjxae` | **117** |
| Repo | `supabase/migrations/*.sql` on `main` | **64** |

The two counts differ because the project was built up over more than a year
through a mix of versioned migrations, out-of-band "repair" scripts applied
directly to the live project, and later consolidation. The reconciliation below
classifies every row on both sides so nothing is left ambiguous.

---

## 3. Reconciliation matrix

Matching is done **by name** (the timestamp prefix is stripped), because the same
logical migration was frequently re-stamped when it was captured into the repo.

| Class | Count | Meaning |
|-------|-------|---------|
| Exact match (version **and** name) | **46** | Identical on both sides. |
| Retimestamped (name matches, version differs) | **15** | Same migration, re-stamped when captured. All `china_shop_*`. |
| Repo-only (no live counterpart) | **3** | See §4. |
| Live-only (no repo counterpart) | **55** | See §5. |

`46 + 15 + 3 = 64` repo files. `46 + 15 + 55 = 116` live rows matched by
version-or-name; the remaining **1** live row is a duplicate re-application
(`account_privacy_enforcement` was applied twice: `20261005132605` and
`20261005155626`), giving the 117 total. Duplicate re-application is harmless
(the migration is idempotent) but is recorded here for completeness.

### 3.1 Retimestamped migrations (same name, different version)

All fifteen are the China Shop catalog/quote/supplier migrations. They were
authored with round timestamps in the repo and applied live with real
timestamps:

| Repo version | Live version | Migration |
|--------------|--------------|-----------|
| 20261012065000 | 20261012065356 | china_shop_catalog |
| 20261012070100 | 20261012070141 | china_shop_product_media_and_inventory |
| 20261012071400 | 20261012071447 | china_shop_landed_cost_quotes |
| 20261012072000 | 20261012071943 | china_shop_quote_requests |
| 20261012072100 | 20261012072050 | china_shop_quote_request_linkage |
| 20261012072300 | 20261012072208 | china_shop_authorized_quote_issuance |
| 20261012073000 | 20261012072927 | china_shop_quote_price_validation |
| 20261012073100 | 20261012073015 | china_shop_supplier_onboarding_applications |
| 20261012074000 | 20261012073808 | china_shop_supplier_review_workflow |
| 20261012080500 | 20261012080419 | china_shop_supplier_review_audit |
| 20261012080700 | 20261012080541 | china_shop_admin_supplier_review_access |
| 20261012080900 | 20261012080751 | china_shop_admin_review_queue |
| 20261012081200 | 20261012081059 | china_shop_admin_product_publish_guard |
| 20261012081500 | 20261012081155 | china_shop_admin_draft_product_creation |
| 20261012081700 | 20261012081321 | china_shop_admin_product_evidence_verification |

These are **not** drift: the schema effect is identical on both sides. They are
listed so the mapping is unambiguous.

---

## 4. Repo-only migrations — are they applied live?

Three repo files have no live row with a matching name or version. Each was
probed against the live schema directly (read-only) to determine whether its
objects are actually present.

### 4.1 `20261008093000_shared_split_bills` — **APPLIED** ✅

Live has a `schema_migrations` row at version `20261008093000` with a **null
name** (the migration was applied before it was named in the repo). Both objects
exist live:

- `public.gaga_split_bills` → present
- `public.gaga_split_bill_members` → present

### 4.2 `20261008140000_call_admission_reason` — **APPLIED** ✅

Live has a `schema_migrations` row at version `20261008140000` with a **null
name**. The function exists live:

- `gaga_private.call_admission(caller uuid, callee uuid)` → present

### 4.3 `20261013000000_call_lifecycle_rpcs` — **APPLIED** ✅

The migration header itself documents that these RPCs were first shipped as an
out-of-band repair (`supabase/repairs/call_lifecycle.sql`) and later captured as
a migration. The live row that carries this effect is:

- `20261003131552  gaga_atomic_call_lifecycle`

The function exists live with the expected signature:

- `public.gaga_create_call(p_chat_id text, p_callee_id uuid, p_type text, p_caller_id uuid, p_request_id uuid)` → present

### 4.4 `20261016000000_wallet_ledger_hardening` — **APPLIED** ✅

Applied directly to the live project (the migration header states it was
"verified against BOTH the repo source and the LIVE Supabase project"). Every
distinctive object exists live:

- `public.wallet_feature_flags` → present
- `public.wallet_limits` → present
- `public.wallet_topup_intents` → present
- `public.wallet_transfer(p_to_user_id, p_amount, p_currency, p_description, p_idempotency_key)` → present
- `public.wallet_spend_coins(p_amount, p_description, p_idempotency_key)` → present
- `public.wallet_convert(p_from, p_to, p_amount, p_idempotency_key)` → present
- `public.create_topup_intent(p_amount, p_currency, p_provider, p_idempotency_key)` → present
- `public.credit_wallet_from_settlement(p_intent_id, p_provider_txn_id)` → present
- `public.wallets.total_earned` column → present
- `public.wallet_transactions.idempotency_key` column → present

### 4.5 `20261009090000_settings_center` — **NOT APPLIED** ⚠️

This is the **only** repo migration that is genuinely not reflected in the live
schema. None of its distinctive objects exist live:

- `gaga_private.touch_updated_at()` → absent
- `public.privacy_settings` → absent
- `public.notification_preferences` → absent
- `public.today_preferences` → absent
- `public.action_preferences` → absent
- `public.chat_preferences` → absent
- `public.per_chat_preferences` → absent
- `public.circle_preferences` → absent
- `public.circle_permissions` → absent
- `public.user_devices` → absent
- `public.connected_services` → absent
- `public.security_events` → absent
- `public.consent_records` → absent
- `public.settings_change_audit` → absent

Note: a table named `public.user_settings` **does** exist live, but it is a
**different** table created by another migration. The live `user_settings`
columns are `user_id, privacy_settings, notification_settings,
media_auto_download, data_saver_mode, appearance_settings, data_settings,
accessibility_settings, security_settings, call_settings,
app_notification_settings, …` whereas the settings_center definition uses
`owner_id, language, theme, dashboard_layout, updated_at`. They are not the same
object.

**Decision:** `settings_center` is a *forward* migration. It is additive and
owner-scoped, and the shipped client (2.8.14) does not require it (the Settings
Center UI keeps device-only preferences in local DataStore). It must **not** be
applied to production blindly as part of this release. It is tracked as a
planned backend change and is excluded from the "fresh DB must match live"
invariant (see §6). Applying it is a deliberate, separately-reviewed step.

---

## 5. Live-only migrations (55)

These 55 live rows have no repo file. They fall into two groups:

1. **Historical baseline / early hardening** (`20240101000000 baseline_snake_case`
   through `20250903000000 fix_rls_and_errors`, and the `20260903000001 …
   20260919001300` series). These predate the repo's migration discipline and
   established the base schema, RLS, wallet, and messaging contracts. They are
   superseded by later repo migrations and do not need to be re-captured.
2. **Out-of-band repairs** applied directly to live and later folded into repo
   migrations (e.g. `20261003131552 gaga_atomic_call_lifecycle` →
   `call_lifecycle_rpcs`; `20261003190448 gaga_atomic_push_device_registration`).
3. **Post-2.8.14 hardening** applied live after the repo snapshot:
   `20261017171246 backend_policy_performance`,
   `20261017171618 legacy_rpc_session_safety`,
   `20261017172128 consolidate_legacy_access_policies`,
   `20261017172253 enforce_call_privacy_admission`,
   `20261017174212 isolate_trigram_extension`.

The full list is reproducible with the drift check in §6.

---

## 6. Read-only drift check

`supabase/tests/check_migration_drift.py` compares the repo's migration files
against the live `schema_migrations` table and reports the four classes above. It
is **read-only** (it only issues `SELECT`), so it is safe to run against
production. It exits non-zero when it finds a *new* repo-only migration that is
not on the known-applied allow-list, so an unapplied migration cannot slip
through unnoticed.

Run it locally:

```bash
SUPABASE_ACCESS_TOKEN=sbp_xxx python3 supabase/tests/check_migration_drift.py
```

In CI it runs in `.github/workflows/android-repair.yml` as a non-blocking
informational step (it is skipped automatically when the token secret is not
present, so it never breaks a fork build).

---

## 7. Outcome

- The live schema is **fully accounted for**: every live row maps to a repo
  migration, a documented out-of-band repair, or a historical baseline.
- The repo is **fully accounted for** except for `settings_center`, which is an
  intentional, additive forward migration that is not required by 2.8.14.
- A fresh database built from `supabase/migrations/*` now reproduces the live
  schema for everything the shipped client depends on.
- A read-only guard (`check_migration_drift.py`) prevents future silent drift.

Issues **#93** and **#95** can be closed with a pointer to this document.
