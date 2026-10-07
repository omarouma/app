-- Remove legacy invite policies that exposed every invite-enabled chat to
-- every authenticated user. Current Android group membership uses the secured
-- group-member flow and does not query chats by invite_code.
drop policy if exists chats_select_by_invite on public.chats;
drop policy if exists chats_join_by_invite on public.chats;

-- Remove exact duplicate permissive participant policies.
drop policy if exists chats_insert_participant on public.chats;
drop policy if exists gaga_chats_insert_participant on public.chats;
drop policy if exists gaga_chats_select_participant on public.chats;
drop policy if exists gaga_chats_update_participant on public.chats;
