-- ============================================================================
-- Server-authoritative post engagement (likes, comments, poll votes, views)
-- ============================================================================
-- Problem
-- -------
-- The timeline wrote engagement directly onto the post row:
--
--     updateDocById(POSTS, post.id, { likes: next })
--     updateDocById(POSTS, post.id, { comments: next })
--     updateDocById(POSTS, post.id, { pollData: ... })
--     updateDocById(POSTS, post.id, { viewCount: increment(1) })
--
-- RLS policy `posts_update_own` (USING user_id = auth.uid()) rejects every
-- write where the caller is not the post author. So liking, commenting,
-- voting and view-counting on OTHER people's posts silently no-ops — the
-- core social loop is broken.
--
-- Fix
-- ---
-- Add narrow SECURITY DEFINER RPCs that mutate ONLY the engagement fields of
-- a post, always keyed off auth.uid() so a user can only add/remove their own
-- like, their own comment, their own poll vote, etc. Authorship is never
-- changed and content is never touched.
-- ============================================================================

-- ── Like / unlike ──────────────────────────────────────────────────────────
create or replace function public.toggle_post_like(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_likes text[];
  v_liked boolean;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select coalesce(likes, '{}') into v_likes
    from public.posts where id = p_post_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'post_not_found');
  end if;

  if v_me::text = any (v_likes) then
    v_likes := array_remove(v_likes, v_me::text);
    v_liked := false;
  else
    v_likes := array_append(v_likes, v_me::text);
    v_liked := true;
  end if;

  update public.posts set likes = v_likes, updated_at = now() where id = p_post_id;
  return jsonb_build_object('ok', true, 'liked', v_liked, 'count', coalesce(array_length(v_likes, 1), 0));
end;
$$;

-- ── Add comment ────────────────────────────────────────────────────────────
create or replace function public.add_post_comment(p_post_id uuid, p_content text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_comment jsonb;
  v_count integer;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_content is null or length(btrim(p_content)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'empty_comment');
  end if;
  if length(p_content) > 2000 then
    return jsonb_build_object('ok', false, 'reason', 'comment_too_long');
  end if;
  if not exists (select 1 from public.posts where id = p_post_id) then
    return jsonb_build_object('ok', false, 'reason', 'post_not_found');
  end if;

  v_comment := jsonb_build_object(
    'id', 'c_' || extract(epoch from clock_timestamp())::bigint || '_' || substr(v_me::text, 1, 8),
    'userId', v_me::text,
    'content', btrim(p_content),
    'timestamp', to_jsonb(now()),
    'likes', '[]'::jsonb
  );

  update public.posts
     set comments = coalesce(comments, '[]'::jsonb) || v_comment,
         comment_count = coalesce(comment_count, 0) + 1,
         updated_at = now()
   where id = p_post_id
   returning comment_count into v_count;

  return jsonb_build_object('ok', true, 'comment', v_comment, 'count', v_count);
end;
$$;

-- ── Delete own comment ─────────────────────────────────────────────────────
create or replace function public.delete_post_comment(p_post_id uuid, p_comment_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_comments jsonb;
  v_kept jsonb;
  v_removed integer;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select coalesce(comments, '[]'::jsonb) into v_comments
    from public.posts where id = p_post_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'post_not_found');
  end if;

  -- Only the comment author (or the post author) may delete a comment.
  select coalesce(jsonb_agg(c), '[]'::jsonb) into v_kept
    from jsonb_array_elements(v_comments) c
   where not (
     c->>'id' = p_comment_id
     and (c->>'userId' = v_me::text
          or exists (select 1 from public.posts p where p.id = p_post_id and p.user_id = v_me))
   );

  v_removed := jsonb_array_length(v_comments) - jsonb_array_length(v_kept);
  if v_removed <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed_or_not_found');
  end if;

  update public.posts
     set comments = v_kept,
         comment_count = greatest(coalesce(comment_count, 0) - v_removed, 0),
         updated_at = now()
   where id = p_post_id;

  return jsonb_build_object('ok', true, 'removed', v_removed);
end;
$$;

-- ── Poll vote ──────────────────────────────────────────────────────────────
create or replace function public.vote_post_poll(p_post_id uuid, p_option_index integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_poll jsonb;
  v_options jsonb;
  v_opt jsonb;
  v_new_options jsonb := '[]'::jsonb;
  v_i integer := 0;
  v_votes jsonb;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select poll_data into v_poll from public.posts where id = p_post_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'post_not_found');
  end if;
  if v_poll is null or jsonb_typeof(v_poll->'options') <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'no_poll');
  end if;

  v_options := v_poll->'options';
  if p_option_index < 0 or p_option_index >= jsonb_array_length(v_options) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_option');
  end if;

  for v_opt in select * from jsonb_array_elements(v_options) loop
    v_votes := coalesce(v_opt->'votes', '[]'::jsonb);
    -- Remove the caller's previous vote from every option.
    v_votes := coalesce(
      (select jsonb_agg(x) from jsonb_array_elements_text(v_votes) x where x <> v_me::text),
      '[]'::jsonb
    );
    -- Add the caller's vote to the chosen option.
    if v_i = p_option_index then
      v_votes := v_votes || to_jsonb(v_me::text);
    end if;
    v_new_options := v_new_options || jsonb_build_object(
      'id', v_opt->'id',
      'text', v_opt->'text',
      'votes', v_votes
    );
    v_i := v_i + 1;
  end loop;

  update public.posts
     set poll_data = jsonb_set(v_poll, '{options}', v_new_options),
         updated_at = now()
   where id = p_post_id;

  return jsonb_build_object('ok', true, 'optionIndex', p_option_index);
end;
$$;

-- ── View count ─────────────────────────────────────────────────────────────
create or replace function public.increment_post_view(p_post_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.posts
     set view_count = coalesce(view_count, 0) + 1
   where id = p_post_id;
$$;

-- ── Grants ─────────────────────────────────────────────────────────────────
revoke all on function public.toggle_post_like(uuid) from public, anon;
revoke all on function public.add_post_comment(uuid, text) from public, anon;
revoke all on function public.delete_post_comment(uuid, text) from public, anon;
revoke all on function public.vote_post_poll(uuid, integer) from public, anon;
revoke all on function public.increment_post_view(uuid) from public, anon;

grant execute on function public.toggle_post_like(uuid) to authenticated;
grant execute on function public.add_post_comment(uuid, text) to authenticated;
grant execute on function public.delete_post_comment(uuid, text) to authenticated;
grant execute on function public.vote_post_poll(uuid, integer) to authenticated;
grant execute on function public.increment_post_view(uuid) to authenticated;

comment on function public.toggle_post_like(uuid) is
  'Adds/removes auth.uid() from a post''s likes array. Needed because posts_update_own RLS blocks cross-user writes.';
comment on function public.add_post_comment(uuid, text) is
  'Appends a comment authored by auth.uid() to a post.';
comment on function public.delete_post_comment(uuid, text) is
  'Deletes a comment if the caller authored it or authored the post.';
comment on function public.vote_post_poll(uuid, integer) is
  'Records auth.uid()''s single-choice poll vote, replacing any prior vote.';
comment on function public.increment_post_view(uuid) is
  'Atomically increments a post''s view counter.';
