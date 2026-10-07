-- GaGa Today / Action Messages MVP.
-- Adds non-monetary Task records while preserving all existing Daily Life data.

alter table public.gaga_daily_records
  drop constraint if exists gaga_daily_records_kind_check,
  drop constraint if exists gaga_daily_records_check1,
  drop constraint if exists gaga_daily_records_check2;

alter table public.gaga_daily_records
  add constraint gaga_daily_records_kind_check
    check (kind in ('task','income','expense','lent','borrowed','reminder','note','goal','budget','account')),
  add constraint gaga_daily_records_amount_required_check
    check (kind in ('task','reminder','note') or amount_minor > 0),
  add constraint gaga_daily_records_reminder_due_check
    check (kind <> 'reminder' or due_at is not null);

create index if not exists gaga_daily_owner_kind_due
  on public.gaga_daily_records(owner_id,kind,due_at)
  where completed = false;
