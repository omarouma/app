-- Consolidate hot chat realtime policies and remove anonymous access.

drop policy if exists chat_reads_delete_own on public.chat_reads;
drop policy if exists chat_reads_upsert_own on public.chat_reads;
drop policy if exists chat_reads_select_participant on public.chat_reads;
drop policy if exists chat_reads_update_own on public.chat_reads;
create policy chat_reads_select_participant on public.chat_reads
  for select to authenticated
  using (
    user_id=(select auth.uid())
    or exists(
      select 1 from public.chats c
      where c.id=chat_reads.chat_id
        and (select auth.uid())::text=any(coalesce(c.participants,'{}'::text[]))
    )
  );
create policy chat_reads_insert_own on public.chat_reads
  for insert to authenticated with check(user_id=(select auth.uid()));
create policy chat_reads_update_own on public.chat_reads
  for update to authenticated
  using(user_id=(select auth.uid()))
  with check(user_id=(select auth.uid()));
create policy chat_reads_delete_own on public.chat_reads
  for delete to authenticated using(user_id=(select auth.uid()));
revoke all on table public.chat_reads from anon;
grant select,insert,update,delete on table public.chat_reads to authenticated;

drop policy if exists gaga_typing_write_own on public.typing;
drop policy if exists typing_upsert_own on public.typing;
drop policy if exists typing_write_own on public.typing;
drop policy if exists typing_delete_own on public.typing;
drop policy if exists typing_insert_own on public.typing;
drop policy if exists gaga_typing_select_participant on public.typing;
drop policy if exists typing_select_chat_member on public.typing;
drop policy if exists typing_select_participant on public.typing;
drop policy if exists typing_update_own on public.typing;
create policy typing_select_participant on public.typing
  for select to authenticated
  using(exists(
    select 1 from public.chats c
    where c.id=typing.chat_id
      and (select auth.uid())::text=any(coalesce(c.participants,'{}'::text[]))
  ));
create policy typing_insert_own on public.typing
  for insert to authenticated
  with check(
    user_id=(select auth.uid())
    and exists(
      select 1 from public.chats c
      where c.id=typing.chat_id
        and (select auth.uid())::text=any(coalesce(c.participants,'{}'::text[]))
    )
  );
create policy typing_update_own on public.typing
  for update to authenticated
  using(
    user_id=(select auth.uid())
    and exists(
      select 1 from public.chats c
      where c.id=typing.chat_id
        and (select auth.uid())::text=any(coalesce(c.participants,'{}'::text[]))
    )
  )
  with check(user_id=(select auth.uid()));
create policy typing_delete_own on public.typing
  for delete to authenticated using(user_id=(select auth.uid()));
revoke all on table public.typing from anon;
grant select,insert,update,delete on table public.typing to authenticated;

drop policy if exists gaga_user_devices_own on public.user_devices;
drop policy if exists user_devices_own on public.user_devices;
drop policy if exists user_devices_delete_own on public.user_devices;
drop policy if exists user_devices_insert_own on public.user_devices;
drop policy if exists user_devices_select_own on public.user_devices;
drop policy if exists user_devices_update_own on public.user_devices;
create policy user_devices_own on public.user_devices
  for all to authenticated
  using(user_id=(select auth.uid()))
  with check(user_id=(select auth.uid()));
revoke all on table public.user_devices from anon;
grant select,insert,update,delete on table public.user_devices to authenticated;
