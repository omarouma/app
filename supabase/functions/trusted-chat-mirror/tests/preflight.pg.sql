\set ON_ERROR_STOP on
-- Ephemeral CI PostgreSQL 17 only. The contract outbox test created public.chats.
-- Disable the mirror before replacing synthetic records.
update gaga_private.firebase_mirror_settings set enabled=false where singleton=true;
truncate table public.chats;

create schema if not exists auth;
create table auth.users (id uuid primary key);
create table public.users (id uuid primary key);
create table public.groups (id uuid primary key, participants text[] not null);
create table public.group_members (group_id uuid not null, user_id uuid not null);

insert into auth.users (id) values
('11111111-1111-4111-8111-111111111111'),
('22222222-2222-4222-8222-222222222222'),
('33333333-3333-4333-8333-333333333333');
insert into public.users select id from auth.users;

insert into public.chats (id,type,participants,updated_at) values
('preflight-clean','direct',array[
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222'],now()),
('preflight-orphan','direct',array[
  '11111111-1111-4111-8111-111111111111',
  '44444444-4444-4444-8444-444444444444'],now()),
('preflight-duplicate','direct',array[
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111'],now()),
('preflight-solo','direct',array['22222222-2222-4222-8222-222222222222'],now()),
('55555555-5555-4555-8555-555555555555','group',array[
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222'],now());

insert into public.groups (id,participants) values
('55555555-5555-4555-8555-555555555555',array[
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222']);
insert into public.group_members (group_id,user_id) values
('55555555-5555-4555-8555-555555555555',
 '11111111-1111-4111-8111-111111111111'),
('55555555-5555-4555-8555-555555555555',
 '22222222-2222-4222-8222-222222222222');
