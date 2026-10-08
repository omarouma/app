-- Pin search_path on public helper/trigger functions. Their bodies reference
-- qualified application objects or PostgreSQL built-ins, so this is behavior
-- preserving while preventing caller-controlled schema resolution.

alter function public.set_updated_at() set search_path = '';
alter function public.update_updated_at() set search_path = '';
alter function public.set_created_at() set search_path = '';
alter function public.gaga_normalize_phone(text) set search_path = '';
alter function public.gaga_normalize_email(text) set search_path = '';
alter function public.touch_user_devices_updated_at() set search_path = '';
alter function public.device_tokens_ins() set search_path = '';
alter function public.device_tokens_upd() set search_path = '';
alter function public.device_tokens_del() set search_path = '';
