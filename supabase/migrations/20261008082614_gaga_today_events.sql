-- GaGa 2.2 Smart Actions: first-class Event records for GaGa Today.
-- Existing Task/Reminder/Money records remain unchanged.

alter table public.gaga_daily_records
  drop constraint if exists gaga_daily_records_kind_check,
  drop constraint if exists gaga_daily_records_amount_required_check,
  drop constraint if exists gaga_daily_records_reminder_due_check;

alter table public.gaga_daily_records
  add constraint gaga_daily_records_kind_check
    check (kind in ('task','event','income','expense','lent','borrowed','reminder','note','goal','budget','account')),
  add constraint gaga_daily_records_amount_required_check
    check (kind in ('task','event','reminder','note') or amount_minor > 0),
  add constraint gaga_daily_records_reminder_due_check
    check (kind not in ('reminder','event') or due_at is not null);
