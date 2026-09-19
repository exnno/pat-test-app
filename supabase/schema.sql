-- PATGo cloud — schema, row-level security and storage policy
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE per Supabase project: Dashboard → SQL Editor → New query → paste
-- this whole file → Run. Safe to run again (every statement is guarded), so a
-- half-finished first run can simply be repeated.
--
-- Source of truth: PATGo_Sync_Spec_v1_2.md sections 3–4, plus two additions
-- marked [v1.2] below. The app (V79) only READS profiles; the other tables
-- are created now so the isolation test has something real to test.

-- ---------------------------------------------------------------- tables
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text not null,
  plan           text not null default 'trial'
                   check (plan in ('trial','active','lapsed','comped')),
  trial_ends_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.sessions (
  id             text not null,
  user_id        uuid not null references auth.users(id) on delete cascade,
  doc            jsonb not null,
  deleted        boolean not null default false,
  last_modified  timestamptz not null,
  updated_at     timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists sessions_user_updated on public.sessions (user_id, updated_at);

create table if not exists public.records (
  id             text not null,
  user_id        uuid not null references auth.users(id) on delete cascade,
  kind           text not null
                   check (kind in ('client','site','preset','template','instrument','settings')),
  doc            jsonb not null,
  deleted        boolean not null default false,
  last_modified  timestamptz not null,
  updated_at     timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists records_user_kind on public.records (user_id, kind, updated_at);

create table if not exists public.photos (
  id             text not null,
  user_id        uuid not null references auth.users(id) on delete cascade,
  session_id     text not null,
  item_id        text not null,
  storage_path   text not null,
  bytes          integer not null default 0,
  w              integer,
  h              integer,
  deleted        boolean not null default false,
  last_modified  timestamptz not null,
  updated_at     timestamptz not null default now(),
  primary key (user_id, id)
);

-- [v1.2] updated_at must move on EVERY update, not just insert. The sync pull
-- asks for "rows changed since X" by updated_at; a default alone only stamps
-- the first write, so later edits would never be pulled by another device.
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles','sessions','records','photos'] loop
    execute format('drop trigger if exists touch_updated_at on public.%I', t);
    execute format('create trigger touch_updated_at before update on public.%I
                    for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ------------------------------------------------ profile on every new user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, plan, trial_ends_at)
  values (new.id, new.email, 'trial', now() + interval '30 days')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users created BEFORE this file was run get their profile now.
insert into public.profiles (id, email, plan, trial_ends_at)
select id, coalesce(email, ''), 'trial', now() + interval '30 days' from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------- row-level security
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.records  enable row level security;
alter table public.photos   enable row level security;

drop policy if exists "own sessions" on public.sessions;
create policy "own sessions" on public.sessions
  for all to authenticated
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own records" on public.records;
create policy "own records" on public.records
  for all to authenticated
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own photos" on public.photos;
create policy "own photos" on public.photos
  for all to authenticated
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Profiles: readable by the owner, writable by NOBODY through the app.
-- There is deliberately no insert/update/delete policy.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select to authenticated
  using (auth.uid() = id);

-- [v1.2] Explicit grants rather than relying on project defaults, which
-- Supabase has been changing. Signed-out visitors (anon) get nothing at all;
-- signed-in users get only what the policies above then narrow to their rows.
revoke all on public.profiles, public.sessions, public.records, public.photos from anon;
revoke all on public.profiles from authenticated;
grant  select on public.profiles to authenticated;
grant  select, insert, update, delete on public.sessions, public.records, public.photos to authenticated;

-- --------------------------------------------------------------- storage
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "own photo files" on storage.objects;
create policy "own photo files" on storage.objects
  for all to authenticated
  using      (bucket_id = 'photos'
              and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'photos'
              and (storage.foldername(name))[1] = auth.uid()::text);

-- Done. Next: run supabase/isolation-test.sql and check all rows say PASS.
