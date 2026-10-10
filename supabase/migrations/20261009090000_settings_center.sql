-- Settings Center V2.0 — backend structure (Master Spec §6).
--
-- Settings are split by concern instead of being crammed into one large
-- user-profile object. Each table is owner-scoped, RLS-protected and gated on an
-- active session, matching the existing chat/daily-life conventions. The local
-- DataStore (gaga_settings_center) remains the source of truth for device-only
-- preferences; these tables are the account-sync layer for preferences that must
-- follow the user across devices.
--
-- Secrets (passwords, wallet PINs, recovery codes) are deliberately NOT stored
-- here — they never belong in a settings row.

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function gaga_private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end $$;
revoke all on function gaga_private.touch_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- user_settings — general preferences, language, theme, dashboard layout
-- ---------------------------------------------------------------------------
create table if not exists public.user_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  language text not null default 'en',
  theme text not null default 'system' check (theme in ('system','light','dark')),
  dashboard_layout jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);
alter table public.user_settings enable row level security;
revoke all on public.user_settings from public, anon, authenticated;
grant select, insert, update, delete on public.user_settings to authenticated;
create policy user_settings_rw on public.user_settings for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy user_settings_session on public.user_settings as restrictive to authenticated
  using (gaga_private.session_active()) with check (gaga_private.session_active());
create trigger user_settings_touch before update on public.user_settings
  for each row execute function gaga_private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- privacy_settings — visibility rules, message/call permissions, discovery
-- ---------------------------------------------------------------------------
create table if not exists public.privacy_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  last_seen text not null default 'FRIENDS' check (last_seen in ('EVERYONE','FRIENDS','NOBODY')),
  profile_photo text not null default 'EVERYONE' check (profile_photo in ('EVERYONE','FRIENDS','NOBODY')),
  read_receipts boolean not null default true,
  message_permission text not null default 'FRIENDS' check (message_permission in ('EVERYONE','FRIENDS','NOBODY')),
  call_permission text not null default 'FRIENDS' check (call_permission in ('EVERYONE','FRIENDS','NOBODY')),
  discovery jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);
alter table public.privacy_settings enable row level security;
revoke all on public.privacy_settings from public, anon, authenticated;
grant select, insert, update, delete on public.privacy_settings to authenticated;
create policy privacy_settings_rw on public.privacy_settings for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy privacy_settings_session on public.privacy_settings as restrictive to authenticated
  using (gaga_private.session_active()) with check (gaga_private.session_active());
create trigger privacy_settings_touch before update on public.privacy_settings
  for each row execute function gaga_private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- notification_preferences — categories, quiet hours, reminder rules
-- ---------------------------------------------------------------------------
create table if not exists public.notification_preferences (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  categories jsonb not null default '{}'::jsonb,
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  reminder_rules jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);
alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from public, anon, authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated;
create policy notification_preferences_rw on public.notification_preferences for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy notification_preferences_session on public.notification_preferences as restrictive to authenticated
  using (gaga_private.session_active()) with check (gaga_private.session_active());
create trigger notification_preferences_touch before update on public.notification_preferences
  for each row execute function gaga_private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- today_preferences — dashboard cards, filters, task/reminder defaults
-- ---------------------------------------------------------------------------
create table if not exists public.today_preferences (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  cards jsonb not null default '{}'::jsonb,
  default_filter text not null default 'all',
  task_defaults jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);
alter table public.today_preferences enable row level security;
revoke all on public.today_preferences from public, anon, authenticated;
grant select, insert, update, delete on public.today_preferences to authenticated;
create policy today_preferences_rw on public.today_preferences for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy today_preferences_session on public.today_preferences as restrictive to authenticated
  using (gaga_private.session_active()) with check (gaga_private.session_active());
create trigger today_preferences_touch before update on public.today_preferences
  for each row execute function gaga_private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- action_preferences — detection scopes, suggestions, confirmation preferences
-- ---------------------------------------------------------------------------
create table if not exists public.action_preferences (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  detection_scopes jsonb not null default '{}'::jsonb,
  suggestions_enabled boolean not null default false,
  confirmation_required boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now())
);
alter table public.action_preferences enable row level security;
revoke all on public.action_preferences from public, anon, authenticated;
grant select, insert, update, delete on public.action_preferences to authenticated;
create policy action_preferences_rw on public.action_preferences for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy action_preferences_session on public.action_preferences as restrictive to authenticated
  using (gaga_private.session_active()) with check (gaga_private.session_active());
create trigger action_preferences_touch before update on public.action_preferences
  for each row execute function gaga_private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- chat_preferences — account-wide messaging defaults
-- ---------------------------------------------------------------------------
create table if not exists public.chat_preferences (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  defaults jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);
alter table public.chat_preferences enable row level security;
revoke all on public.chat_preferences from public, anon, authenticated;
grant select, insert, update, delete on public.chat_preferences to authenticated;
create policy chat_preferences_rw on public.chat_preferences for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy chat_preferences_session on public.chat_preferences as restrictive to authenticated
  using (gaga_private.session_active()) with check (gaga_private.session_active());
create trigger chat_preferences_touch before update on public.chat_preferences
  for each row execute function gaga_private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- per_chat_preferences — individual conversation overrides
-- ---------------------------------------------------------------------------
create table if not exists public.per_chat_preferences (
  chat_id text not null references public.chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (chat_id, user_id)
);
create index if not exists idx_per_chat_preferences_user on public.per_chat_preferences(user_id);
alter table public.per_chat_preferences enable row level security;
revoke all on public.per_chat_preferences from public, anon, authenticated;
grant select, insert, update, delete on public.per_chat_preferences to authenticated;
create policy per_chat_preferences_rw on public.per_chat_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy per_chat_preferences_session on public.per_chat_preferences as restrictive to authenticated
  using (gaga_private.session_active()) with check (gaga_private.session_active());

-- ---------------------------------------------------------------------------
-- circle_preferences — Circle-specific notification and display options
-- ---------------------------------------------------------------------------
create table if not exists public.circle_preferences (
  circle_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (circle_id, user_id)
);
create index if not exists idx_circle_preferences_user on public.circle_preferences(user_id);
alter table public.circle_preferences enable row level security;
revoke all on public.circle_preferences from public, anon, authenticated;
grant select, insert, update, delete on public.circle_preferences to authenticated;
create policy circle_preferences_rw on public.circle_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy circle_preferences_session on public.circle_preferences as restrictive to authenticated
  using (gaga_private.session_active()) with check (gaga_private.session_active());

-- ---------------------------------------------------------------------------
-- circle_permissions — membership roles and enforceable authorization
-- ---------------------------------------------------------------------------
create table if not exists public.circle_permissions (
  circle_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member','guest')),
  permissions jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (circle_id, user_id)
);
create index if not exists idx_circle_permissions_user on public.circle_permissions(user_id);
alter table public.circle_permissions enable row level security;
revoke all on public.circle_permissions from public, anon, authenticated;
-- Read-only for the member; role changes are performed by privileged RPCs.
grant select on public.circle_permissions to authenticated;
create policy circle_permissions_read on public.circle_permissions for select to authenticated
  using (user_id = (select auth.uid()) and gaga_private.session_active());

-- ---------------------------------------------------------------------------
-- user_devices — device sessions, trust status and synchronization
-- ---------------------------------------------------------------------------
create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_name text not null default 'Unknown device',
  platform text not null default 'android',
  last_active_at timestamptz not null default timezone('utc', now()),
  trusted boolean not null default false,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists idx_user_devices_user on public.user_devices(user_id, last_active_at desc);
alter table public.user_devices enable row level security;
revoke all on public.user_devices from public, anon, authenticated;
grant select, insert, update, delete on public.user_devices to authenticated;
create policy user_devices_rw on public.user_devices for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy user_devices_session on public.user_devices as restrictive to authenticated
  using (gaga_private.session_active()) with check (gaga_private.session_active());

-- ---------------------------------------------------------------------------
-- connected_services — authorized integration metadata and revoked/active status
-- ---------------------------------------------------------------------------
create table if not exists public.connected_services (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  service text not null,
  status text not null default 'active' check (status in ('active','revoked','expired')),
  scopes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz
);
create index if not exists idx_connected_services_user on public.connected_services(user_id, status);
alter table public.connected_services enable row level security;
revoke all on public.connected_services from public, anon, authenticated;
grant select, insert, update, delete on public.connected_services to authenticated;
create policy connected_services_rw on public.connected_services for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy connected_services_session on public.connected_services as restrictive to authenticated
  using (gaga_private.session_active()) with check (gaga_private.session_active());

-- ---------------------------------------------------------------------------
-- security_events — sign-ins, important changes and device revocations
-- ---------------------------------------------------------------------------
create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists idx_security_events_user on public.security_events(user_id, created_at desc);
alter table public.security_events enable row level security;
revoke all on public.security_events from public, anon, authenticated;
-- Append-only from the client; reads are owner-scoped.
grant select, insert on public.security_events to authenticated;
create policy security_events_read on public.security_events for select to authenticated
  using (user_id = (select auth.uid()) and gaga_private.session_active());
create policy security_events_insert on public.security_events for insert to authenticated
  with check (user_id = (select auth.uid()) and gaga_private.session_active());

-- ---------------------------------------------------------------------------
-- consent_records — consent status and timestamps for optional processing
-- ---------------------------------------------------------------------------
create table if not exists public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null,
  granted boolean not null default false,
  recorded_at timestamptz not null default timezone('utc', now())
);
create index if not exists idx_consent_records_user on public.consent_records(user_id, purpose, recorded_at desc);
alter table public.consent_records enable row level security;
revoke all on public.consent_records from public, anon, authenticated;
grant select, insert on public.consent_records to authenticated;
create policy consent_records_read on public.consent_records for select to authenticated
  using (user_id = (select auth.uid()) and gaga_private.session_active());
create policy consent_records_insert on public.consent_records for insert to authenticated
  with check (user_id = (select auth.uid()) and gaga_private.session_active());

-- ---------------------------------------------------------------------------
-- settings_change_audit — sensitive setting changes and diagnostics
-- ---------------------------------------------------------------------------
create table if not exists public.settings_change_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  setting_key text not null,
  old_value jsonb,
  new_value jsonb,
  changed_at timestamptz not null default timezone('utc', now())
);
create index if not exists idx_settings_change_audit_user on public.settings_change_audit(user_id, changed_at desc);
alter table public.settings_change_audit enable row level security;
revoke all on public.settings_change_audit from public, anon, authenticated;
grant select, insert on public.settings_change_audit to authenticated;
create policy settings_change_audit_read on public.settings_change_audit for select to authenticated
  using (user_id = (select auth.uid()) and gaga_private.session_active());
create policy settings_change_audit_insert on public.settings_change_audit for insert to authenticated
  with check (user_id = (select auth.uid()) and gaga_private.session_active());
