-- Remove unused SECURITY DEFINER RPCs from app-facing roles.
-- Android does not call these directly. Trusted server/service-role code keeps
-- access where needed.

revoke execute on function public.cache_link_preview(text,text,text,text,text) from public, anon, authenticated;
revoke execute on function public.chat_has_blocked_pair(text) from public, anon, authenticated;
revoke execute on function public.is_blocked(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.increment_post_view(uuid) from public, anon, authenticated;

grant execute on function public.cache_link_preview(text,text,text,text,text) to service_role;
grant execute on function public.chat_has_blocked_pair(text) to service_role;
grant execute on function public.is_blocked(uuid,uuid) to service_role;
grant execute on function public.increment_post_view(uuid) to service_role;
