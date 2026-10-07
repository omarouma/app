-- Client code does not call this SECURITY DEFINER RPC. Leaving it executable
-- by authenticated users allowed an arbitrary signed-in account to insert a
-- notification for any target user when p_from_id was omitted. Server/service
-- access is retained while direct client execution is removed.

revoke execute on function public.create_notification(uuid,text,text,text,uuid,jsonb) from authenticated;
