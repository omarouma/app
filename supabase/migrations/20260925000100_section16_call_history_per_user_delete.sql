-- ═══════════════════════════════════════════════════════════════════════════
-- Section 16 — Calls Screen & Call History
-- Per-user soft delete for call history.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Previously, deleting a call from history performed a hard DELETE on the
-- shared call_history row, which removed the record for BOTH participants.
-- That is a correctness bug: one user's "delete" silently erased the other
-- user's call log entry.
--
-- We now track a per-user "deleted_by" list. Deleting a call appends the
-- acting user's id to this array; the client filters out any call whose
-- deleted_by contains the current user. The row is retained for the other
-- participant(s) and for moderation/audit purposes.

ALTER TABLE public.call_history
  ADD COLUMN IF NOT EXISTS deleted_by TEXT[] DEFAULT '{}';

-- GIN index so "calls not deleted by me" membership checks stay fast.
CREATE INDEX IF NOT EXISTS idx_call_history_deleted_by
  ON public.call_history USING GIN (deleted_by);

-- Backfill NULLs to empty arrays so array ops behave predictably.
UPDATE public.call_history SET deleted_by = '{}' WHERE deleted_by IS NULL;
