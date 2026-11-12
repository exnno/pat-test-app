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
  user_id        uuid not null references auth.users(id) on delete restrict,
  doc            jsonb not null,
  deleted        boolean not null default false,
  last_modified  timestamptz not null,
  updated_at     timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists sessions_user_updated on public.sessions (user_id, updated_at);

create table if not exists public.records (
  id             text not null,
  user_id        uuid not null references auth.users(id) on delete restrict,
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
  user_id        uuid not null references auth.users(id) on delete restrict,
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

-- V88: when each photo was taken, so another phone can show a job's photos in
-- order (V89). Safe to re-run; on an existing project paste just this line.
alter table public.photos add column if not exists taken_at timestamptz;

-- V89: a small preview ({user_id}/{photo_id}_t.jpg, same folder, same policy)
-- exists for this photo. Set only after the preview file is up, so another
-- phone can trust it. Safe to re-run; on an existing project paste just this line.
alter table public.photos add column if not exists thumb boolean not null default false;

-- V92: each job's fingerprint (the app's syncHash of the job's canonical JSON),
-- sent by the phone in the SAME write as the doc. The pull reads id + fp first
-- and downloads doc only where fp differs from the phone's copy (R17). On an
-- existing project run supabase/v92-fingerprint.sql instead (it checks itself).
alter table public.sessions add column if not exists fp text;

-- A write that changes doc WITHOUT a new fp (a phone still on V91, a hand edit
-- in the dashboard) blanks fp, so no phone ever trusts a fingerprint that no
-- longer describes the doc. Blank means "download it" — the pre-V92 behaviour.
-- (A PostgREST upsert sets only the columns it sends, so an older phone's
-- update keeps the OLD fp unless this clears it.)
create or replace function public.sessions_fp_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.doc is distinct from old.doc and new.fp is not distinct from old.fp then
    new.fp := null;
  end if;
  return new;
end;
$$;
drop trigger if exists sessions_fp_guard on public.sessions;
create trigger sessions_fp_guard before update on public.sessions
  for each row execute function public.sessions_fp_guard();

-- V93: item and fail counts for the cloud job cards, worked out BY THE
-- DATABASE from doc (no phone writes them; any version keeps working).
-- Existing projects: supabase/v93-archive.sql (the same, plus self-checks).
create or replace function public.job_item_count(d jsonb)
returns integer language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(d->'items') = 'array' then jsonb_array_length(d->'items') else 0 end
$$;
create or replace function public.job_fail_count(d jsonb)
returns integer language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(d->'items') = 'array'
              then (select count(*)::integer from jsonb_array_elements(d->'items') e
                    where e->>'result' = 'fail')
              else 0 end
$$;
alter table public.sessions add column if not exists n_items integer
  generated always as (public.job_item_count(doc)) stored;
alter table public.sessions add column if not exists n_fails integer
  generated always as (public.job_fail_count(doc)) stored;
-- V108: each job's size (its contents as text) for Settings → Data → Cloud
-- Storage. Existing projects: supabase/v108-storage.sql (plus self-checks).
create or replace function public.job_doc_bytes(d jsonb)
returns integer language sql immutable set search_path = '' as $$
  select coalesce(octet_length(d::text), 0)
$$;
alter table public.sessions add column if not exists doc_bytes integer
  generated always as (public.job_doc_bytes(doc)) stored;

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

-- V113: businesses, the business stamp and the delete guard. Existing
-- projects: supabase/v113-organisations.sql (the same, plus self-checks).

-- ------------------------------------------------------------ businesses
create table if not exists public.organisations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- (org, person) — several businesses per person are allowed (3C). is_default
-- marks the one their new rows are stamped with: at most one per person.
-- The login's memberships go with the login (9A); the business's work does not.
create table if not exists public.memberships (
  org_id      uuid not null references public.organisations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null
                check (role in ('owner','team_leader','engineer','office')),
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);
create unique index if not exists memberships_one_default on public.memberships (user_id) where is_default;
create index if not exists memberships_user on public.memberships (user_id);

do $$
declare t text;
begin
  foreach t in array array['organisations','memberships'] loop
    execute format('drop trigger if exists touch_updated_at on public.%I', t);
    execute format('create trigger touch_updated_at before update on public.%I
                    for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ------------------------------------------------- the rule helpers
-- security definer + empty search_path: they read memberships with the owner's
-- rights, so a policy never reads memberships under its OWN rules (recursion).
-- auth.uid() is the signed-in person whoever runs the function.

-- The person's default business (the stamp for their new rows).
create or replace function public.default_org(u uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select m.org_id from public.memberships m where m.user_id = u and m.is_default limit 1
$$;

-- My role in a business, or null if I don't belong to it.
create or replace function public.my_role(o uuid)
returns text language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m where m.org_id = o and m.user_id = auth.uid()
$$;

-- How many people belong to a business.
create or replace function public.org_size(o uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.memberships m where m.org_id = o
$$;

-- 6A: Owner, Team leader and Office read the whole business.
create or replace function public.can_read_org(o uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role(o) in ('owner','team_leader','office'), false)
$$;

-- 12A: who may delete from the cloud. Owner / Team leader / Office; or anyone
-- in a business of one; or the dashboard / server (no signed-in person).
create or replace function public.can_wipe(o uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is null
      or coalesce(public.my_role(o) in ('owner','team_leader','office'), false)
      or (public.my_role(o) is not null and public.org_size(o) = 1)
$$;

-- ------------------------------------------------- the business stamp (2A)
-- Added empty first (no rewrite, no trigger), filled below, then required.
alter table public.sessions add column if not exists org_id uuid references public.organisations(id) on delete restrict;
alter table public.records  add column if not exists org_id uuid references public.organisations(id) on delete restrict;
alter table public.photos   add column if not exists org_id uuid references public.organisations(id) on delete restrict;
create index if not exists sessions_org_updated on public.sessions (org_id, updated_at);
create index if not exists records_org_updated  on public.records  (org_id, updated_at);
create index if not exists photos_org_updated   on public.photos   (org_id, updated_at);
create index if not exists photos_storage_path  on public.photos   (storage_path);

-- Insert: no stamp sent (every phone) → the writer's default business.
-- Update: the stamp never changes once set (a phone's upsert never sends it).
create or replace function public.org_stamp()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.org_id is null then
      new.org_id := public.default_org(new.user_id);
      if new.org_id is null then
        raise exception 'PATGo: account % has no business', new.user_id;
      end if;
    end if;
  elsif old.org_id is not null then
    new.org_id := old.org_id;
  end if;
  return new;
end;
$$;

-- 12A: a delete from a phone is an update that sets deleted (and empties the
-- job). Refused unless can_wipe. Upserts reach this too (ON CONFLICT → UPDATE).
-- ⚠ Named so it fires AFTER org_stamp (same-event triggers run in name order).
create or replace function public.wipe_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.deleted and not old.deleted and not public.can_wipe(new.org_id) then
    raise exception 'PATGo: only the business owner, a team leader or the office can delete this from the cloud'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['sessions','records','photos'] loop
    execute format('drop trigger if exists org_stamp on public.%I', t);
    execute format('create trigger org_stamp before insert or update on public.%I
                    for each row execute function public.org_stamp()', t);
  end loop;
  foreach t in array array['sessions','photos'] loop
    execute format('drop trigger if exists wipe_guard on public.%I', t);
    execute format('create trigger wipe_guard before update on public.%I
                    for each row execute function public.wipe_guard()', t);
  end loop;
end $$;

-- ---------------------------------- every account a business of one (4A)
do $$
declare u record; o uuid;
begin
  for u in select au.id from auth.users au
           where not exists (select 1 from public.memberships m where m.user_id = au.id) loop
    insert into public.organisations default values returning id into o;
    insert into public.memberships (org_id, user_id, role, is_default) values (o, u.id, 'owner', true);
  end loop;
  -- A person with businesses but no default (only by hand): their first one.
  update public.memberships m set is_default = true
  where not exists (select 1 from public.memberships d where d.user_id = m.user_id and d.is_default)
    and m.org_id = (select f.org_id from public.memberships f where f.user_id = m.user_id
                    order by f.created_at, f.org_id limit 1);
end $$;

-- ------------------------------------------- stamp the existing rows
-- touch_updated_at is paused for this one update, so stamping is not a change
-- any phone pulls. The counts land in _v113_stamp for the self-check.
drop table if exists pg_temp._v113_stamp;
create temp table _v113_stamp (tbl text, stamped int, moved int);
do $$
declare t text; s int; mv int;
begin
  foreach t in array array['sessions','records','photos'] loop
    execute format('drop table if exists pg_temp._v113_snap');
    execute format('create temp table _v113_snap as select user_id, id, updated_at from public.%I where org_id is null', t);
    execute format('alter table public.%I disable trigger touch_updated_at', t);
    execute format('update public.%I x set org_id = m.org_id from public.memberships m
                    where m.user_id = x.user_id and m.is_default and x.org_id is null', t);
    get diagnostics s = row_count;
    execute format('alter table public.%I enable trigger touch_updated_at', t);
    execute format('select count(*) from _v113_snap n join public.%I x on x.user_id = n.user_id and x.id = n.id
                    where x.updated_at is distinct from n.updated_at', t) into mv;
    insert into _v113_stamp values (t, s, mv);
  end loop;
  drop table if exists pg_temp._v113_snap;
end $$;

alter table public.sessions alter column org_id set not null;
alter table public.records  alter column org_id set not null;
alter table public.photos   alter column org_id set not null;

-- -------------------------------- a login with work cannot be deleted (10A)
-- Was "on delete cascade": deleting a login deleted all its jobs at once.
-- Now the delete is refused while any job, record or photo row is theirs.
-- Profiles and memberships still go with the login (9A).
do $$
declare r record;
begin
  for r in select c.conname, c.conrelid::regclass as tbl from pg_constraint c
           where c.contype = 'f' and c.confrelid = 'auth.users'::regclass
             and c.conrelid in ('public.sessions'::regclass, 'public.records'::regclass, 'public.photos'::regclass)
             and c.confdeltype <> 'r' loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I foreign key (user_id) references auth.users(id) on delete restrict',
                   r.tbl, r.conname);
  end loop;
end $$;

-- ------------------------------------------------ profile on every new user
-- V113: + a business of their own, as Owner (4A).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare o uuid;
begin
  insert into public.profiles (id, email, plan, trial_ends_at)
  values (new.id, new.email, 'trial', now() + interval '30 days')
  on conflict (id) do nothing;
  if not exists (select 1 from public.memberships m where m.user_id = new.id) then
    insert into public.organisations default values returning id into o;
    insert into public.memberships (org_id, user_id, role, is_default) values (o, new.id, 'owner', true);
  end if;
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

-- Jobs, records, photos: the V113 business rules, after the storage bucket below.

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

-- V93: photos per job for the cloud job cards. security_invoker: it reads the
-- photos table with the READER's rights, so the photos read rule decides what it can
-- count. Isolation checks 8a–8d. V108: + b, the bytes of those photos (last
-- column — a view may only gain columns at the end).
create or replace view public.session_photo_counts
  with (security_invoker = true) as
  select user_id, session_id, count(*)::integer as n, coalesce(sum(bytes), 0)::bigint as b
  from public.photos
  where deleted = false
  group by user_id, session_id;
revoke all on public.session_photo_counts from anon;
revoke all on public.session_photo_counts from authenticated;
grant select on public.session_photo_counts to authenticated;

-- --------------------------------------------------------------- storage
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

-- ------------------------------------------------------ the rules (6A, 12A)
alter table public.organisations enable row level security;
alter table public.memberships   enable row level security;

-- Jobs, records, photos: read your own while you belong to the row's business,
-- or the whole business as Owner / Team leader / Office. Write only your own,
-- only into a business you belong to. Hard deletes (no phone makes them) obey
-- 12A as well; records hold no job, so their deletes are not guarded.
do $$
declare t text;
begin
  foreach t in array array['sessions','records','photos'] loop
    execute format('drop policy if exists "own %s" on public.%I', t, t);
    execute format('drop policy if exists "read %s" on public.%I', t, t);
    execute format('drop policy if exists "add own %s" on public.%I', t, t);
    execute format('drop policy if exists "change own %s" on public.%I', t, t);
    execute format('drop policy if exists "delete own %s" on public.%I', t, t);
    execute format('create policy "read %s" on public.%I for select to authenticated
      using ((user_id = (select auth.uid()) and public.my_role(org_id) is not null)
             or public.can_read_org(org_id))', t, t);
    execute format('create policy "add own %s" on public.%I for insert to authenticated
      with check (user_id = (select auth.uid()) and public.my_role(org_id) is not null)', t, t);
    execute format('create policy "change own %s" on public.%I for update to authenticated
      using      (user_id = (select auth.uid()) and public.my_role(org_id) is not null)
      with check (user_id = (select auth.uid()) and public.my_role(org_id) is not null)', t, t);
    execute format('create policy "delete own %s" on public.%I for delete to authenticated
      using (user_id = (select auth.uid()) and public.my_role(org_id) is not null'
      || case when t = 'records' then ')' else ' and public.can_wipe(org_id))' end, t, t);
  end loop;
end $$;

-- Businesses and memberships: readable, never writable through the app (no
-- team screens yet — the profiles pattern). You see your own memberships;
-- an Owner also sees everyone in their business.
drop policy if exists "read my businesses" on public.organisations;
create policy "read my businesses" on public.organisations
  for select to authenticated
  using (public.my_role(id) is not null);

drop policy if exists "read memberships" on public.memberships;
create policy "read memberships" on public.memberships
  for select to authenticated
  using (user_id = (select auth.uid()) or public.my_role(org_id) = 'owner');

revoke all on public.organisations, public.memberships from anon;
revoke all on public.organisations, public.memberships from authenticated;
grant  select on public.organisations, public.memberships to authenticated;

-- ------------------------------------------------- photo files (7A, 12A)
-- Paths unchanged: {user_id}/{photo}.jpg and its preview {user_id}/{photo}_t.jpg.
-- A file is readable by its owner, or by whoever may read its photo ROW (the
-- row carries the business stamp; a folder does not — a person can work for
-- two businesses). Deleting a file follows 12A for that row's business, or for
-- the person's default business if no row names the file.
create or replace function public.can_read_photo_file(name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.photos p
                 where p.storage_path in (name, regexp_replace(name, '_t\.jpg$', '.jpg'))
                   and public.can_read_org(p.org_id))
$$;

create or replace function public.can_wipe_photo_file(name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select bool_and(public.can_wipe(p.org_id)) from public.photos p
     where p.user_id = auth.uid()
       and p.storage_path in (name, regexp_replace(name, '_t\.jpg$', '.jpg'))),
    public.can_wipe(public.default_org(auth.uid())))
$$;

drop policy if exists "own photo files" on storage.objects;
drop policy if exists "read photo files" on storage.objects;
drop policy if exists "add own photo files" on storage.objects;
drop policy if exists "change own photo files" on storage.objects;
drop policy if exists "delete own photo files" on storage.objects;
create policy "read photo files" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos'
         and ((storage.foldername(name))[1] = (select auth.uid())::text
              or public.can_read_photo_file(name)));
create policy "add own photo files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "change own photo files" on storage.objects
  for update to authenticated
  using      (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "delete own photo files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text
         and public.can_wipe_photo_file(name));

-- ------------------------------------------------- who may call the helpers
-- Policies call these as the signed-in person; nobody signed out ever does.
-- default_org and org_size are only used inside other helpers and triggers.
revoke all on function public.default_org(uuid), public.org_size(uuid),
                       public.my_role(uuid), public.can_read_org(uuid), public.can_wipe(uuid),
                       public.can_read_photo_file(text), public.can_wipe_photo_file(text)
  from public, anon, authenticated;
grant execute on function public.my_role(uuid), public.can_read_org(uuid), public.can_wipe(uuid),
                          public.can_read_photo_file(text), public.can_wipe_photo_file(text)
  to authenticated;



-- ================================================================ V133
-- The clean-up job, part 1 (old delete markers, report-only to begin with)
-- and the phones table. Existing projects: supabase/v133-cleanup.sql (plus
-- self-checks C1–C7). Kept in step with it by harness group 71.

-- ------------------------------------------------------------ the scheduler
-- Supabase Cron (pg_cron). Same as Dashboard → Integrations → Cron → Enable.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;


-- ------------------------------------------------------------ phones (4A)
-- One row per phone per account. The phone sends user_id, phone_id and
-- app_version only; the database fills the rest, so a phone can't claim a time,
-- a sign-in or a version number it didn't report.
create table if not exists public.phones (
  user_id       uuid not null references auth.users(id) on delete cascade,
  phone_id      text not null check (char_length(phone_id) between 8 and 64),
  app_version   text not null check (char_length(app_version) <= 16),
  version_num   integer,
  auth_session  uuid,
  first_seen    timestamptz not null default now(),
  seen_at       timestamptz not null default now(),
  primary key (user_id, phone_id)
);
create index if not exists phones_session on public.phones (auth_session);

-- 'V133' → 133, 'V133.1' → 133; anything else → null (treated as too old).
create or replace function public.app_version_num(v text)
returns integer language sql immutable set search_path = '' as $$
  select nullif(substring(coalesce(v, '') from '^[Vv]([0-9]{1,6})'), '')::integer
$$;

create or replace function public.phones_stamp()
returns trigger language plpgsql set search_path = '' as $$
declare
  sid text := nullif(coalesce(current_setting('request.jwt.claims', true), ''), '')::jsonb ->> 'session_id';
begin
  new.version_num := public.app_version_num(new.app_version);
  new.seen_at := now();
  if tg_op = 'INSERT' then
    new.first_seen := now();
  else
    new.first_seen := old.first_seen;
  end if;
  -- The sign-in this report arrived on. Kept from before when a request carries
  -- none (the dashboard), never taken from what the phone sent.
  if sid ~ '^[0-9a-fA-F-]{36}$' then
    new.auth_session := sid::uuid;
  elsif tg_op = 'UPDATE' then
    new.auth_session := old.auth_session;
  else
    new.auth_session := null;
  end if;
  return new;
end $$;

drop trigger if exists phones_stamp on public.phones;
create trigger phones_stamp before insert or update on public.phones
  for each row execute function public.phones_stamp();

alter table public.phones enable row level security;
drop policy if exists "read own phones" on public.phones;
drop policy if exists "add own phones" on public.phones;
drop policy if exists "change own phones" on public.phones;
create policy "read own phones" on public.phones
  for select to authenticated using (user_id = (select auth.uid()));
create policy "add own phones" on public.phones
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "change own phones" on public.phones
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.phones from anon;
revoke delete, truncate, references, trigger on public.phones from authenticated;
grant select, insert, update on public.phones to authenticated;


-- ------------------------------------------------------------ the job's settings
-- One row. Not reachable from the app at all (no rules = no rows for anyone).
create table if not exists public.cleanup_settings (
  id           integer primary key default 1 check (id = 1),
  mode         text not null default 'report' check (mode in ('report','clear')),
  marker_days  integer not null default 365 check (marker_days >= 365),
  phone_days   integer not null default 730 check (phone_days >= 365),
  min_version  integer not null default 133 check (min_version >= 133),
  updated_at   timestamptz not null default now()
);
insert into public.cleanup_settings (id) values (1) on conflict (id) do nothing;
alter table public.cleanup_settings enable row level security;
revoke all on public.cleanup_settings from anon, authenticated;

-- One line per run (6A). Table Editor → cleanup_runs.
create table if not exists public.cleanup_runs (
  id                     bigint generated always as identity primary key,
  ran_at                 timestamptz not null default now(),
  mode                   text not null,
  cutoff                 timestamptz not null,
  accounts               integer not null default 0,
  accounts_held          integer not null default 0,
  job_markers_kept       integer not null default 0,
  record_markers         integer not null default 0,
  photo_markers          integer not null default 0,
  photo_markers_file_left integer not null default 0,
  markers_held           integer not null default 0,
  records_cleared        integer not null default 0,
  photos_cleared         integer not null default 0,
  held                   jsonb not null default '[]'::jsonb,
  note                   text not null default ''
);
alter table public.cleanup_runs enable row level security;
revoke all on public.cleanup_runs from anon, authenticated;


-- ------------------------------------------------------------ the job
-- check_only = true: a report whatever the mode (the self-check below uses it).
-- ⚠ JOB MARKERS ARE NEVER DELETED HERE (3A). There is deliberately no
-- statement that removes rows from public.sessions; the self-check and the
-- app's harness (group 71) both fail if one appears.
create or replace function public.run_cleanup(check_only boolean default false)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  s public.cleanup_settings%rowtype;
  cut timestamptz;
  win timestamptz;
  clearing boolean;
  n_acc int; n_held int; n_jobs int; n_rec int; n_ph int; n_left int; n_mheld int;
  n_rc int := 0; n_pc int := 0;
  held_list jsonb;
  run_id bigint;
begin
  select * into s from public.cleanup_settings where id = 1;
  if not found then
    insert into public.cleanup_settings (id) values (1) returning * into s;
  end if;
  cut := now() - make_interval(days => greatest(s.marker_days, 365));
  win := now() - make_interval(days => s.phone_days);
  clearing := (s.mode = 'clear') and not check_only;

  -- Who is held back (4A): an account with a sign-in used inside the window
  -- whose phone has not reported min_version or later on THAT sign-in. Then
  -- every business such an account belongs to, so a teammate's rows wait too.
  drop table if exists pg_temp._cl_held_users;
  create temp table pg_temp._cl_held_users on commit drop as
  select ses.user_id,
         count(*) filter (where p.user_id is null)::int as not_reported,
         count(*) filter (where p.user_id is not null)::int as older
  from auth.sessions ses
  left join public.phones p on p.user_id = ses.user_id and p.auth_session = ses.id
  where greatest(ses.created_at, ses.updated_at, ses.refreshed_at at time zone 'UTC') > win
    and (p.user_id is null or coalesce(p.version_num, 0) < s.min_version)
  group by ses.user_id;

  drop table if exists pg_temp._cl_held_orgs;
  create temp table pg_temp._cl_held_orgs on commit drop as
  select distinct m.org_id from public.memberships m join pg_temp._cl_held_users h on h.user_id = m.user_id;

  select count(*) into n_acc from auth.users;
  select count(*) into n_held from pg_temp._cl_held_users;
  select count(*) into n_jobs from public.sessions where deleted and updated_at < cut;

  select count(*) filter (where not hold), count(*) filter (where hold)
    into n_rec, n_mheld
  from (select (r.user_id in (select user_id from pg_temp._cl_held_users)
                or r.org_id in (select org_id from pg_temp._cl_held_orgs)) as hold
        from public.records r where r.deleted and r.updated_at < cut) x;

  select count(*) filter (where not hold and not file_left),
         count(*) filter (where not hold and file_left),
         n_mheld + count(*) filter (where hold)
    into n_ph, n_left, n_mheld
  from (select (p.user_id in (select user_id from pg_temp._cl_held_users)
                or p.org_id in (select org_id from pg_temp._cl_held_orgs)) as hold,
               exists (select 1 from storage.objects o
                       where o.bucket_id = 'photos'
                         and o.name in (p.storage_path, regexp_replace(p.storage_path, '\.jpg$', '_t.jpg'))) as file_left
        from public.photos p where p.deleted and p.updated_at < cut) x;

  select coalesce(jsonb_agg(jsonb_build_object(
           'email', coalesce(u.email, h.user_id::text),
           'phones_not_reported', h.not_reported,
           'phones_older', h.older) order by u.email), '[]'::jsonb)
    into held_list
  from pg_temp._cl_held_users h left join auth.users u on u.id = h.user_id;

  if clearing then
    delete from public.records r
    where r.deleted and r.updated_at < cut
      and r.user_id not in (select user_id from pg_temp._cl_held_users)
      and r.org_id not in (select org_id from pg_temp._cl_held_orgs);
    get diagnostics n_rc = row_count;

    delete from public.photos p
    where p.deleted and p.updated_at < cut
      and p.user_id not in (select user_id from pg_temp._cl_held_users)
      and p.org_id not in (select org_id from pg_temp._cl_held_orgs)
      and not exists (select 1 from storage.objects o
                      where o.bucket_id = 'photos'
                        and o.name in (p.storage_path, regexp_replace(p.storage_path, '\.jpg$', '_t.jpg')));
    get diagnostics n_pc = row_count;
  end if;

  insert into public.cleanup_runs (mode, cutoff, accounts, accounts_held, job_markers_kept,
                                   record_markers, photo_markers, photo_markers_file_left,
                                   markers_held, records_cleared, photos_cleared, held, note)
  values (case when check_only then 'check' else s.mode end, cut, n_acc, n_held, n_jobs,
          n_rec, n_ph, n_left, n_mheld, n_rc, n_pc, held_list,
          case when clearing then 'cleared' else 'report only — nothing cleared' end)
  returning id into run_id;
  return run_id;
end $$;

revoke all on function public.run_cleanup(boolean) from public, anon, authenticated;
revoke all on function public.phones_stamp() from public, anon, authenticated;


-- ------------------------------------------------------------ the schedule (5A)
-- Sunday 02:17 UTC. Scheduling the same name again replaces it.
select cron.schedule('patgo-cleanup', '17 2 * * 0', 'select public.run_cleanup()');

-- Done. Next: run supabase/isolation-test.sql and check all rows say PASS.


-- ================================================================ V142
-- Paying: the plan belongs to the business; Stripe's side. Existing projects:
-- supabase/v142-billing.sql (plus self-checks B1–B6). Kept in step with it by
-- harness group 81.

-- ------------------------------------------------------------ the business's plan
alter table public.organisations add column if not exists plan text not null default 'trial';
alter table public.organisations add column if not exists trial_ends_at timestamptz;
alter table public.organisations add column if not exists stripe_customer text;
alter table public.organisations add column if not exists stripe_subscription text;
alter table public.organisations add column if not exists billing_status text;
alter table public.organisations add column if not exists billing_interval text;
alter table public.organisations add column if not exists period_end timestamptz;
alter table public.organisations add column if not exists cancel_at_period_end boolean not null default false;
alter table public.organisations add column if not exists billing_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organisations_plan_check') then
    alter table public.organisations add constraint organisations_plan_check
      check (plan in ('trial','active','lapsed','comped'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organisations_interval_check') then
    alter table public.organisations add constraint organisations_interval_check
      check (billing_interval is null or billing_interval in ('month','year'));
  end if;
end $$;
create unique index if not exists organisations_stripe_customer on public.organisations (stripe_customer)
  where stripe_customer is not null;
create index if not exists organisations_stripe_subscription on public.organisations (stripe_subscription)
  where stripe_subscription is not null;

-- Once: each business takes its plan from its owner. Run again, it copies the
-- same values back (the profiles are copies of the business by then).
update public.organisations o
set plan = p.plan, trial_ends_at = p.trial_ends_at
from public.memberships m
join public.profiles p on p.id = m.user_id
where m.org_id = o.id and m.role = 'owner'
  and (o.plan is distinct from p.plan or o.trial_ends_at is distinct from p.trial_ends_at);


-- ------------------------------------------------------------ the copies on profiles
-- The business → every member whose default it is. A copy that already matches
-- is left alone, so this never loops with the trigger below.
create or replace function public.org_plan_to_members()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles p
  set plan = new.plan, trial_ends_at = new.trial_ends_at
  where p.id in (select m.user_id from public.memberships m where m.org_id = new.id and m.is_default)
    and (p.plan is distinct from new.plan or p.trial_ends_at is distinct from new.trial_ends_at);
  return null;
end;
$$;
drop trigger if exists org_plan_to_members on public.organisations;
create trigger org_plan_to_members
  after update of plan, trial_ends_at on public.organisations
  for each row execute function public.org_plan_to_members();

-- Joining a business, or changing which one is the default: the profile copies it.
create or replace function public.member_plan_copy()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_default then
    update public.profiles p
    set plan = o.plan, trial_ends_at = o.trial_ends_at
    from public.organisations o
    where p.id = new.user_id and o.id = new.org_id
      and (p.plan is distinct from o.plan or p.trial_ends_at is distinct from o.trial_ends_at);
  end if;
  return null;
end;
$$;
drop trigger if exists member_plan_copy on public.memberships;
create trigger member_plan_copy
  after insert or update of is_default, org_id on public.memberships
  for each row execute function public.member_plan_copy();

-- A plan set by hand on a profile (the old way) goes up to the person's default
-- business, and from there to every member. A copy the triggers above write
-- already matches its business, so it goes no further (no loop).
create or replace function public.profile_plan_up()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.plan is distinct from old.plan or new.trial_ends_at is distinct from old.trial_ends_at then
    update public.organisations o
    set plan = new.plan, trial_ends_at = new.trial_ends_at
    where o.id = public.default_org(new.id)
      and (o.plan is distinct from new.plan or o.trial_ends_at is distinct from new.trial_ends_at);
  end if;
  return null;
end;
$$;
drop trigger if exists profile_plan_up on public.profiles;
create trigger profile_plan_up
  after update of plan, trial_ends_at on public.profiles
  for each row execute function public.profile_plan_up();

-- A new login: its business starts the 30-day trial (V113's sign-up, plus the
-- business's own plan). The profile copies it when the membership is made.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare o uuid; ends timestamptz := now() + interval '30 days';
begin
  insert into public.profiles (id, email, plan, trial_ends_at)
  values (new.id, new.email, 'trial', ends)
  on conflict (id) do nothing;
  if not exists (select 1 from public.memberships m where m.user_id = new.id) then
    insert into public.organisations (plan, trial_ends_at) values ('trial', ends) returning id into o;
    insert into public.memberships (org_id, user_id, role, is_default) values (o, new.id, 'owner', true);
  end if;
  return new;
end;
$$;


-- ------------------------------------------------------------ who sees what
-- Members read their business's plan and Stripe status; the Stripe ids only the
-- server functions (secret key) ever see.
revoke select on public.organisations from authenticated;
grant select (id, name, created_at, updated_at, plan, trial_ends_at, billing_status,
              billing_interval, period_end, cancel_at_period_end, billing_at)
  on public.organisations to authenticated;

-- The Subscription page's one read: the signed-in person's default business.
-- can_manage: only its Owner subscribes or opens the billing page.
create or replace function public.my_billing()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'plan', o.plan,
    'trial_ends_at', o.trial_ends_at,
    'status', o.billing_status,
    'interval', o.billing_interval,
    'period_end', o.period_end,
    'cancel_at_period_end', o.cancel_at_period_end,
    'has_customer', o.stripe_customer is not null,
    'has_subscription', o.stripe_subscription is not null,
    'role', m.role,
    'can_manage', m.role = 'owner')
  from public.memberships m
  join public.organisations o on o.id = m.org_id
  where m.user_id = auth.uid() and m.is_default
  limit 1
$$;
revoke all on function public.my_billing() from public, anon;
grant execute on function public.my_billing() to authenticated;


-- ------------------------------------------------------------ the server's side
-- Called only by the server functions (Edge Functions, secret key = service_role).

-- Everything the checkout and billing-page functions need about a login.
create or replace function public.billing_context(u uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'org_id', o.id,
    'role', m.role,
    'plan', o.plan,
    'trial_ends_at', o.trial_ends_at,
    'stripe_customer', o.stripe_customer,
    'stripe_subscription', o.stripe_subscription,
    'status', o.billing_status)
  from public.memberships m
  join public.organisations o on o.id = m.org_id
  where m.user_id = u and m.is_default
  limit 1
$$;

-- Keeps the first Stripe customer made for a business (two taps at once both
-- making one: the second is told the first, and its own is never used).
create or replace function public.billing_set_customer(o uuid, cus text)
returns text language sql security definer set search_path = '' as $$
  update public.organisations
  set stripe_customer = coalesce(stripe_customer, cus)
  where id = o
  returning stripe_customer
$$;

-- What Stripe says about a subscription → the business's plan. The server
-- function always re-reads the subscription from Stripe first, so this is
-- always Stripe's latest word, whatever order its messages arrive in.
--   trialing / active / past_due          → active (still paying, or retrying)
--   canceled / unpaid / incomplete_expired / paused → lapsed, if it WAS paying;
--                                            a trial runs to its own end instead
--   incomplete                            → no change (checkout not finished)
-- A comped business keeps its plan; only Stripe's details are recorded.
-- A message about an OLD subscription never ends a newer, live one.
create or replace function public.billing_apply(
  o uuid, cus text, sub text, status text, every text,
  ends timestamptz, cancelling boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  r public.organisations%rowtype;
  live boolean := status in ('trialing','active','past_due');
  over boolean := status in ('canceled','unpaid','incomplete_expired','paused');
  next_plan text;
begin
  if o is not null then
    select * into r from public.organisations where id = o for update;
  end if;
  if r.id is null and cus is not null then
    select * into r from public.organisations where stripe_customer = cus for update;
  end if;
  if r.id is null then return 'no business'; end if;
  if r.stripe_customer is not null and cus is not null and r.stripe_customer <> cus then
    return 'another customer';
  end if;
  if r.stripe_subscription is not null and sub is distinct from r.stripe_subscription
     and not live and r.billing_status in ('trialing','active','past_due') then
    return 'old subscription';
  end if;

  next_plan := r.plan;
  if r.plan <> 'comped' then
    if live then next_plan := 'active';
    elsif over and r.plan = 'active' then next_plan := 'lapsed';
    end if;
  end if;

  update public.organisations set
    stripe_customer      = coalesce(r.stripe_customer, cus),
    stripe_subscription  = coalesce(sub, r.stripe_subscription),
    billing_status       = status,
    billing_interval     = case when every in ('month','year') then every else r.billing_interval end,
    period_end           = ends,
    cancel_at_period_end = coalesce(cancelling, false),
    billing_at           = now(),
    plan                 = next_plan
  where id = r.id;
  return 'plan ' || next_plan;
end;
$$;

-- One line per message from Stripe. Table Editor → billing_events.
create table if not exists public.billing_events (
  id           text primary key,          -- Stripe's event id (evt_…)
  type         text not null,
  org_id       uuid,
  result       text,
  received_at  timestamptz not null default now()
);
alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon, authenticated;

-- Written AFTER the change is made, so a message that failed half-way is simply
-- handled again when Stripe retries it (handling one twice changes nothing: the
-- subscription is always re-read from Stripe).
create or replace function public.billing_event_log(eid text, etype text, o uuid, outcome text)
returns void language sql security definer set search_path = '' as $$
  insert into public.billing_events (id, type, org_id, result) values (eid, etype, o, outcome)
  on conflict (id) do update set org_id = excluded.org_id, result = excluded.result, received_at = now()
$$;

revoke all on function public.billing_context(uuid), public.billing_set_customer(uuid, text),
                       public.billing_apply(uuid, text, text, text, text, timestamptz, boolean),
                       public.billing_event_log(text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.billing_context(uuid), public.billing_set_customer(uuid, text),
                          public.billing_apply(uuid, text, text, text, text, timestamptz, boolean),
                          public.billing_event_log(text, text, uuid, text)
  to service_role;
grant select, insert, update on public.billing_events to service_role;


-- ================================================================ V143
-- Enforcement: the business keeps the date its paid plan lapsed (phones count
-- the grace from it), and the database refuses a locked business's uploads 14
-- days after its plan ended (7 grace + 7 catch-up). Existing projects:
-- supabase/v143-enforcement.sql (the same, plus self-checks C1–C6). Kept in
-- step with it by harness group 82.

-- ------------------------------------------------------------ when a paid plan lapsed (3A)
alter table public.organisations add column if not exists lapsed_at timestamptz;
alter table public.profiles add column if not exists lapsed_at timestamptz;

-- Entering `lapsed` stamps the moment (unless the same edit sets the date by
-- hand — testing); any other plan clears it. A business that was already lapsed
-- before V143 gets its last word from Stripe as the date (below), or now.
create or replace function public.org_lapsed_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.plan = 'lapsed' then
    if tg_op = 'INSERT' then
      new.lapsed_at := coalesce(new.lapsed_at, now());
    elsif old.plan is distinct from 'lapsed' and new.lapsed_at is not distinct from old.lapsed_at then
      new.lapsed_at := now();
    end if;
  else
    new.lapsed_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists org_lapsed_at on public.organisations;
create trigger org_lapsed_at
  before insert or update on public.organisations
  for each row execute function public.org_lapsed_at();

update public.organisations set lapsed_at = coalesce(billing_at, now())
where plan = 'lapsed' and lapsed_at is null;

-- The copies carry the date too (V142's three triggers, one column more). The
-- date never goes UP from a profile on its own: a hand edit of a profile's plan
-- still does, and the business then stamps its own date and copies it down.
create or replace function public.org_plan_to_members()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles p
  set plan = new.plan, trial_ends_at = new.trial_ends_at, lapsed_at = new.lapsed_at
  where p.id in (select m.user_id from public.memberships m where m.org_id = new.id and m.is_default)
    and (p.plan is distinct from new.plan or p.trial_ends_at is distinct from new.trial_ends_at
         or p.lapsed_at is distinct from new.lapsed_at);
  return null;
end;
$$;
drop trigger if exists org_plan_to_members on public.organisations;
create trigger org_plan_to_members
  after update of plan, trial_ends_at, lapsed_at on public.organisations
  for each row execute function public.org_plan_to_members();

create or replace function public.member_plan_copy()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_default then
    update public.profiles p
    set plan = o.plan, trial_ends_at = o.trial_ends_at, lapsed_at = o.lapsed_at
    from public.organisations o
    where p.id = new.user_id and o.id = new.org_id
      and (p.plan is distinct from o.plan or p.trial_ends_at is distinct from o.trial_ends_at
           or p.lapsed_at is distinct from o.lapsed_at);
  end if;
  return null;
end;
$$;

-- Fill every copy once (a re-run finds nothing to do).
update public.profiles p
set lapsed_at = o.lapsed_at
from public.memberships m
join public.organisations o on o.id = m.org_id
where m.user_id = p.id and m.is_default and p.lapsed_at is distinct from o.lapsed_at;

-- Phones read it: on the business (column grant, as V142) and in my_billing.
grant select (lapsed_at) on public.organisations to authenticated;

create or replace function public.my_billing()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'plan', o.plan,
    'trial_ends_at', o.trial_ends_at,
    'lapsed_at', o.lapsed_at,
    'status', o.billing_status,
    'interval', o.billing_interval,
    'period_end', o.period_end,
    'cancel_at_period_end', o.cancel_at_period_end,
    'has_customer', o.stripe_customer is not null,
    'has_subscription', o.stripe_subscription is not null,
    'role', m.role,
    'can_manage', m.role = 'owner')
  from public.memberships m
  join public.organisations o on o.id = m.org_id
  where m.user_id = auth.uid() and m.is_default
  limit 1
$$;
revoke all on function public.my_billing() from public, anon;
grant execute on function public.my_billing() to authenticated;


-- ------------------------------------------------------------ may this business upload? (1A, 2A)
-- ⚠ 14 days = the phone's 7 days' grace (PLAN_GRACE_DAYS) + 7 days' catch-up
-- (2A). Change one and the other must move with it, or a phone that still lets
-- an engineer log would be refused — or a locked one taken from.
-- An unknown business, or a lapsed one with no date at all, is let through:
-- the membership rules already decide WHO may write; this only decides WHEN.
create or replace function public.can_upload(o uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when x.plan in ('active','comped') then true
      when x.plan = 'trial'  then x.trial_ends_at is null or now() < x.trial_ends_at + interval '14 days'
      when x.plan = 'lapsed' then x.lapsed_at is null or now() < x.lapsed_at + interval '14 days'
      else true end
    from public.organisations x where x.id = o), true)
$$;

-- Jobs, settings, photo rows: refused on the way in. ⚠ Named so it fires AFTER
-- org_stamp (same-event triggers run in name order): a new row's business is
-- only known once the stamp has filled it.
create or replace function public.plan_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.can_upload(new.org_id) then
    raise exception 'patgo_plan_locked: this business''s PATGo plan has ended, so the cloud is not taking changes'
      using errcode = '42501', hint = 'Renew in PATGo: Settings, Account & Sync, Subscription.';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['sessions','records','photos'] loop
    execute format('drop trigger if exists plan_guard on public.%I', t);
    execute format('create trigger plan_guard before insert or update on public.%I
                    for each row execute function public.plan_guard()', t);
  end loop;
end $$;

-- Photo files: the person's own folder, while their default business may upload.
-- Reading and deleting files are unchanged. ⚠ The policy runs as the signed-in
-- person, who may not call default_org or can_upload directly (closed since
-- V113) — so it asks this one helper, which reads with the owner's rights. A
-- policy calling a closed function refuses EVERY upload, paid or not (caught on
-- the V143 stand-in before it shipped).
create or replace function public.can_upload_files()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_upload(public.default_org(auth.uid()))
$$;

drop policy if exists "add own photo files" on storage.objects;
drop policy if exists "change own photo files" on storage.objects;
create policy "add own photo files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select public.can_upload_files()));
create policy "change own photo files" on storage.objects
  for update to authenticated
  using      (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select public.can_upload_files()));

revoke all on function public.can_upload(uuid), public.can_upload_files(), public.plan_guard()
  from public, anon, authenticated;
grant execute on function public.can_upload_files() to authenticated;

-- ================================================================ V149
-- Every job knows its business: a phone may name the business a NEW job is for
-- (kept only if the writer belongs to it, else the default); a photo row takes
-- its job's business; my_businesses() and set_business_name() (Owner only).
-- Existing projects: supabase/v149-business-per-job.sql (the same, plus
-- self-checks B1–B5). Kept in step with it by harness group 88. Comes AFTER
-- V113's org_stamp on purpose: this definition replaces it.

-- ------------------------------------------------- the stamp (new jobs)
-- Insert: a named business is kept only if the writer belongs to it; a photo
--         with none takes its job's; anything left gets the writer's default.
-- Update: the stamp never changes once set (unchanged from V113 — a phone's
--         upsert may name a business, and it is ignored).
-- ⚠ RLS checks the row AFTER this trigger, so a business swapped for the default
-- here is checked as the default — an old membership never turns into an error.
create or replace function public.org_stamp()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.org_id is not null and not exists (
      select 1 from public.memberships m where m.org_id = new.org_id and m.user_id = new.user_id
    ) then
      new.org_id := null;
    end if;
    -- (Only reached for photos: NEW.session_id exists on that table alone.)
    if new.org_id is null and tg_table_name = 'photos' then
      select s.org_id into new.org_id from public.sessions s
      where s.user_id = new.user_id and s.id = new.session_id;
      if new.org_id is not null and not exists (
        select 1 from public.memberships m where m.org_id = new.org_id and m.user_id = new.user_id
      ) then
        new.org_id := null;
      end if;
    end if;
    if new.org_id is null then
      new.org_id := public.default_org(new.user_id);
      if new.org_id is null then
        raise exception 'PATGo: account % has no business', new.user_id;
      end if;
    end if;
  elsif old.org_id is not null then
    new.org_id := old.org_id;
  end if;
  return new;
end;
$$;


-- ------------------------------------------------- my businesses
create or replace function public.my_businesses()
returns table (id uuid, name text, role text, is_default boolean, members integer)
language sql stable security definer set search_path = '' as $$
  select o.id, o.name, m.role, m.is_default, public.org_size(o.id)
  from public.memberships m
  join public.organisations o on o.id = m.org_id
  where m.user_id = auth.uid()
  order by m.is_default desc, o.created_at, o.id
$$;
revoke all on function public.my_businesses() from public, anon;
grant execute on function public.my_businesses() to authenticated;


-- ------------------------------------------------- naming (3A)
-- The Owner only. 1–80 characters after trimming; returns the name kept.
create or replace function public.set_business_name(o uuid, n text)
returns text language plpgsql security definer set search_path = '' as $$
declare v text := btrim(coalesce(n, ''));
begin
  if public.my_role(o) is distinct from 'owner' then
    raise exception 'PATGo: only the owner can name this business' using errcode = '42501';
  end if;
  if length(v) < 1 or length(v) > 80 then
    raise exception 'PATGo: a business name is 1 to 80 characters' using errcode = '22023';
  end if;
  update public.organisations set name = v where id = o;
  return v;
end;
$$;
revoke all on function public.set_business_name(uuid, text) from public, anon;
grant execute on function public.set_business_name(uuid, text) to authenticated;


-- ============================================================ V150
-- Moving a job to another business (Change…): the move record, the move, the
-- request and its approval. Existing projects: supabase/v150-business-move.sql
-- (the same, plus self-checks). This org_stamp replaces V149's above.

-- ------------------------------------------------- the move log (1A)
-- One row per move or request. Kept for good: no app can write, change or
-- delete a row — only the functions below, and they only ever close a WAITING
-- row (waiting → moved / refused / cancelled / dropped). No foreign key to the
-- job: the record outlives the job (7 years, like everything else).
create table if not exists public.job_moves (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete restrict,   -- the job's owner
  session_id    text not null,
  from_org      uuid not null references public.organisations(id) on delete restrict,
  to_org        uuid not null references public.organisations(id) on delete restrict,
  requested_by  uuid not null references auth.users(id) on delete restrict,
  requested_at  timestamptz not null default clock_timestamp(),
  status        text not null check (status in ('waiting','moved','refused','cancelled','dropped')),
  decided_by    uuid references auth.users(id) on delete restrict,
  decided_at    timestamptz
);
alter table public.job_moves alter column requested_at set default clock_timestamp();
create index if not exists job_moves_job on public.job_moves (user_id, session_id, requested_at);
create index if not exists job_moves_from on public.job_moves (from_org, status);
-- One waiting request per job at a time.
create unique index if not exists job_moves_one_waiting on public.job_moves (user_id, session_id) where status = 'waiting';

alter table public.job_moves enable row level security;
revoke insert, update, delete, truncate, references, trigger on public.job_moves from public, anon, authenticated;
grant select on public.job_moves to authenticated;
drop policy if exists "read job moves" on public.job_moves;
-- The job's owner, and whoever reads either business (Owner / Team leader / Office).
create policy "read job moves" on public.job_moves for select to authenticated
  using (user_id = auth.uid() or public.can_read_org(from_org) or public.can_read_org(to_org));

-- Belt and braces under the grants: a row is never deleted by a signed-in
-- person, and only a waiting row ever changes — its status and who decided.
create or replace function public.job_moves_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if auth.uid() is not null then
      raise exception 'PATGo: the move record is kept' using errcode = '42501';
    end if;
    return old;
  end if;
  if old.status <> 'waiting'
     or new.user_id is distinct from old.user_id or new.session_id is distinct from old.session_id
     or new.from_org is distinct from old.from_org or new.to_org is distinct from old.to_org
     or new.requested_by is distinct from old.requested_by or new.requested_at is distinct from old.requested_at then
    raise exception 'PATGo: the move record is kept as it was' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists job_moves_guard on public.job_moves;
create trigger job_moves_guard before update or delete on public.job_moves
  for each row execute function public.job_moves_guard();


-- ------------------------------------------------- the stamp (V150)
-- Insert: unchanged from V149 (a named business only if the writer belongs to
--         it; a photo follows its job; else the default).
-- Update: the stamp still never changes — EXCEPT the one change the move itself
--         makes (_job_move_apply below), which marks its transaction with
--         exactly which job is going where. An upload naming a business is
--         still ignored, as since V113. Settings (records) never move.
-- ⚠ The mark is a transaction-local setting no app can make (there is no way to
-- run SQL from a phone), and the destination must still be one the job's owner
-- belongs to.
create or replace function public.org_stamp()
returns trigger language plpgsql security definer set search_path = '' as $$
declare mv text; ok boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.org_id is not null and not exists (
      select 1 from public.memberships m where m.org_id = new.org_id and m.user_id = new.user_id
    ) then
      new.org_id := null;
    end if;
    -- (Only reached for photos: NEW.session_id exists on that table alone.)
    if new.org_id is null and tg_table_name = 'photos' then
      select s.org_id into new.org_id from public.sessions s
      where s.user_id = new.user_id and s.id = new.session_id;
      if new.org_id is not null and not exists (
        select 1 from public.memberships m where m.org_id = new.org_id and m.user_id = new.user_id
      ) then
        new.org_id := null;
      end if;
    end if;
    if new.org_id is null then
      new.org_id := public.default_org(new.user_id);
      if new.org_id is null then
        raise exception 'PATGo: account % has no business', new.user_id;
      end if;
    end if;
  elsif old.org_id is not null and new.org_id is distinct from old.org_id then
    mv := coalesce(current_setting('patgo.job_move', true), '');
    if mv <> '' and new.org_id is not null and tg_table_name in ('sessions', 'photos') then
      if tg_table_name = 'sessions' then
        ok := mv = new.user_id::text || '/' || new.id || '/' || new.org_id::text;
      else
        -- (Only reached for photos, as above.)
        ok := mv = new.user_id::text || '/' || new.session_id || '/' || new.org_id::text;
      end if;
      ok := ok and exists (select 1 from public.memberships m where m.org_id = new.org_id and m.user_id = new.user_id);
    end if;
    if not ok then
      new.org_id := old.org_id;
    end if;
  end if;
  return new;
end;
$$;


-- ------------------------------------------------- the move (V150)
-- Someone's role in a business (any person — the helpers above ask for "me").
create or replace function public.member_role(o uuid, u uuid)
returns text language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m where m.org_id = o and m.user_id = u
$$;

-- The move itself: the job row and its photo rows, together. Never called by a
-- phone (closed below) — only by move_job and _job_move_decide.
create or replace function public._job_move_apply(u uuid, job text, o_from uuid, o_to uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform set_config('patgo.job_move', u::text || '/' || job || '/' || o_to::text, true);
  update public.sessions set org_id = o_to where user_id = u and id = job and org_id = o_from;
  get diagnostics n = row_count;
  if n <> 1 then
    perform set_config('patgo.job_move', '', true);
    raise exception 'patgo_move_gone: that job is not where it was' using errcode = 'P0002';
  end if;
  update public.photos set org_id = o_to where user_id = u and session_id = job and org_id is distinct from o_to;
  perform set_config('patgo.job_move', '', true);
  if not exists (select 1 from public.sessions where user_id = u and id = job and org_id = o_to) then
    raise exception 'patgo_move_gone: the move did not take' using errcode = 'P0002';
  end if;
end;
$$;

-- Job settings → Business → Change… (2A). Your own job, in the cloud, not
-- deleted, unlocked, no certificate number; you belong to both businesses.
-- Out of a business where you are the Owner → moved now. Otherwise (a team
-- business you're Engineer / Team leader / Office in) → a request, waiting for
-- someone ELSE (Owner / Team leader / Office of that business) to approve.
-- Returns 'moved' or 'waiting'.
create or replace function public.move_job(job text, target uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  s record;
  r_from text; r_to text;
begin
  if me is null then
    raise exception 'patgo_move_role: sign in first' using errcode = '42501';
  end if;
  select x.org_id, x.doc, x.deleted into s from public.sessions x
  where x.user_id = me and x.id = job for update;
  if not found or s.deleted then
    raise exception 'patgo_move_gone: that job is not in the cloud' using errcode = 'P0002';
  end if;
  if target is null or s.org_id = target then
    raise exception 'patgo_move_same: the job is already there' using errcode = '22023';
  end if;
  r_from := public.member_role(s.org_id, me);
  r_to := public.member_role(target, me);
  if r_from is null or r_to is null then
    raise exception 'patgo_move_both: you need to belong to both businesses' using errcode = '42501';
  end if;
  if coalesce(s.doc ->> 'locked', '') = 'true' or coalesce(s.doc ->> 'certNo', '') <> '' then
    raise exception 'patgo_move_locked: a locked or certified job stays where it is' using errcode = '22023';
  end if;
  if exists (select 1 from public.job_moves m where m.user_id = me and m.session_id = job and m.status = 'waiting') then
    raise exception 'patgo_move_waiting: this job already has a move waiting' using errcode = '22023';
  end if;
  if r_from = 'owner' then
    perform public._job_move_apply(me, job, s.org_id, target);
    insert into public.job_moves (user_id, session_id, from_org, to_org, requested_by, status, decided_by, decided_at)
    values (me, job, s.org_id, target, me, 'moved', me, clock_timestamp());
    return 'moved';
  end if;
  insert into public.job_moves (user_id, session_id, from_org, to_org, requested_by, status)
  values (me, job, s.org_id, target, me, 'waiting');
  return 'waiting';
end;
$$;

-- The person who asked takes a waiting request back. dropped = true when the
-- phone found the job locked or certified meanwhile (2A).
create or replace function public.cancel_job_move(move uuid, dropped boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare m record; st text := case when dropped then 'dropped' else 'cancelled' end;
begin
  select * into m from public.job_moves x where x.id = move for update;
  if not found or m.requested_by is distinct from auth.uid() then
    raise exception 'patgo_move_role: only the person who asked can take it back' using errcode = '42501';
  end if;
  if m.status <> 'waiting' then
    return m.status;
  end if;
  update public.job_moves set status = st, decided_by = auth.uid(), decided_at = clock_timestamp() where id = move;
  return st;
end;
$$;

-- Approve or refuse a waiting request, as person `decider` — someone ELSE who
-- is Owner / Team leader / Office of the business the job is leaving. On
-- approval it is checked again: still there, still unlocked and uncertified,
-- its owner still in both — otherwise 'dropped'. Closed to phones: they use
-- decide_job_move (below), which is this as the signed-in person. The test aid
-- (supabase/v150-test-decide-move.sql) calls it directly from the SQL Editor.
create or replace function public._job_move_decide(move uuid, approve boolean, decider uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare m record; s record;
begin
  select * into m from public.job_moves x where x.id = move for update;
  if not found or m.status <> 'waiting' then
    raise exception 'patgo_move_stale: that request is no longer waiting' using errcode = 'P0002';
  end if;
  if decider is null or decider = m.requested_by then
    raise exception 'patgo_move_self: someone else has to approve this' using errcode = '42501';
  end if;
  if coalesce(public.member_role(m.from_org, decider) in ('owner','team_leader','office'), false) is not true then
    raise exception 'patgo_move_role: only the Owner, a Team leader or the Office can decide this' using errcode = '42501';
  end if;
  if not approve then
    update public.job_moves set status = 'refused', decided_by = decider, decided_at = clock_timestamp() where id = move;
    return 'refused';
  end if;
  select x.org_id, x.doc, x.deleted into s from public.sessions x
  where x.user_id = m.user_id and x.id = m.session_id for update;
  if not found or s.deleted or s.org_id is distinct from m.from_org
     or coalesce(s.doc ->> 'locked', '') = 'true' or coalesce(s.doc ->> 'certNo', '') <> ''
     or public.member_role(m.to_org, m.user_id) is null then
    update public.job_moves set status = 'dropped', decided_by = decider, decided_at = clock_timestamp() where id = move;
    return 'dropped';
  end if;
  perform public._job_move_apply(m.user_id, m.session_id, m.from_org, m.to_org);
  update public.job_moves set status = 'moved', decided_by = decider, decided_at = clock_timestamp() where id = move;
  return 'moved';
end;
$$;

create or replace function public.decide_job_move(move uuid, approve boolean)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'patgo_move_role: sign in first' using errcode = '42501';
  end if;
  return public._job_move_decide(move, approve, auth.uid());
end;
$$;

-- The phone's view: the latest move or request for each of MY jobs, with both
-- businesses' names (a business I've since left still has its name here).
-- V157: dropped first — V157 widens it (decided_name), and Postgres won't change a
-- function's columns in place, so a re-run would otherwise stop here. Re-running
-- this puts V150's shape back: run supabase/v157-approvals.sql again after.
drop function if exists public.my_job_moves();
create or replace function public.my_job_moves()
returns table (id uuid, session_id text, from_org uuid, from_name text, to_org uuid, to_name text,
               status text, requested_at timestamptz, decided_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select distinct on (m.session_id)
         m.id, m.session_id, m.from_org, f.name, m.to_org, t.name, m.status, m.requested_at, m.decided_at
  from public.job_moves m
  join public.organisations f on f.id = m.from_org
  join public.organisations t on t.id = m.to_org
  where m.user_id = auth.uid()
  order by m.session_id, m.requested_at desc, m.id
$$;

revoke all on function public.member_role(uuid, uuid) from public, anon, authenticated;
revoke all on function public._job_move_apply(uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public._job_move_decide(uuid, boolean, uuid) from public, anon, authenticated;
revoke all on function public.move_job(text, uuid) from public, anon;
revoke all on function public.cancel_job_move(uuid, boolean) from public, anon;
revoke all on function public.decide_job_move(uuid, boolean) from public, anon;
revoke all on function public.my_job_moves() from public, anon;
grant execute on function public.move_job(text, uuid) to authenticated;
grant execute on function public.cancel_job_move(uuid, boolean) to authenticated;
grant execute on function public.decide_job_move(uuid, boolean) to authenticated;
grant execute on function public.my_job_moves() to authenticated;


-- ============================================================ V151
-- The minimum app version: one setting (starts at 151), a raise for one account
-- (testing), what a phone reads, and the invite check V152 uses. Existing
-- projects: supabase/v151-min-version.sql (the same, plus self-checks).
-- Raise it later with:  update public.app_settings set min_version = NNN where id = 1;

-- ------------------------------------------------- the setting
create table if not exists public.app_settings (
  id                 integer primary key default 1 check (id = 1),
  min_version        integer not null default 151 check (min_version between 1 and 999999),
  invite_phone_days  integer not null default 60 check (invite_phone_days between 1 and 3650),
  updated_at         timestamptz not null default now()
);
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

-- One account's own minimum (testing; or to make one account update first).
create table if not exists public.app_min_overrides (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  min_version  integer not null check (min_version between 1 and 999999),
  note         text,
  created_at   timestamptz not null default now()
);

-- Nobody signed in reads or writes either table directly: the phone asks
-- my_min_version(). RLS on with no policies, every grant taken away.
alter table public.app_settings enable row level security;
alter table public.app_min_overrides enable row level security;
revoke all on public.app_settings, public.app_min_overrides from public, anon, authenticated;

drop trigger if exists touch_updated_at on public.app_settings;
create trigger touch_updated_at before update on public.app_settings
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------- an account's minimum
-- The higher of the setting and the account's own; 0 if the row is missing
-- (no minimum — the phone carries on).
create or replace function public.app_min_version_for(u uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select greatest(
    coalesce((select s.min_version from public.app_settings s where s.id = 1), 0),
    coalesce((select o.min_version from public.app_min_overrides o where o.user_id = u), 0))
$$;

-- What the phone reads. Signed in only.
create or replace function public.my_min_version()
returns integer language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'patgo_min_version: sign in first' using errcode = '42501';
  end if;
  return public.app_min_version_for(auth.uid());
end;
$$;

-- ------------------------------------------------- the invite check (5A)
-- How many phones in business o are too old for its members' minimum:
--   • a phone that has reported (V133+) in the last invite_phone_days with an
--     older version, and
--   • a sign-in used in that time that has never reported on that sign-in — a
--     phone before V133, or one signed in a moment ago that hasn't synced yet.
-- Invites (V152) are refused while this is above 0.
create or replace function public.org_phones_behind(o uuid)
returns integer language sql stable security definer set search_path = '' as $$
  with s as (
    select now() - make_interval(days => coalesce((select x.invite_phone_days from public.app_settings x where x.id = 1), 60)) as win
  ), m as (
    select mm.user_id, public.app_min_version_for(mm.user_id) as need
    from public.memberships mm where mm.org_id = o
  )
  select (
    (select count(*) from public.phones p join m on m.user_id = p.user_id, s
     where p.seen_at > s.win and coalesce(p.version_num, 0) < m.need)
  + (select count(*) from auth.sessions ses join m on m.user_id = ses.user_id, s
     where greatest(ses.created_at, ses.updated_at, ses.refreshed_at at time zone 'UTC') > s.win
       and not exists (select 1 from public.phones p
                       where p.user_id = ses.user_id and p.auth_session = ses.id))
  )::integer
$$;

revoke all on function public.app_min_version_for(uuid) from public, anon, authenticated;
revoke all on function public.org_phones_behind(uuid) from public, anon, authenticated;
revoke all on function public.my_min_version() from public, anon;
grant execute on function public.my_min_version() to authenticated;


-- ================================================================ V154
-- Ids and pictures PATGo never makes are refused (audit finding 3, 4A).
-- Existing projects: supabase/v154-safe-ids.sql (plus self-checks V1–V4).
-- Kept in step with it byte for byte by harness group 93f.

-- ------------------------------------------------- the patterns
create or replace function public.patgo_safe_id(t text) returns boolean
language sql immutable as $$
  select t is not null and t ~ '^[A-Za-z0-9_-]{1,80}$'
     and t not in ('__proto__', 'constructor', 'prototype')
$$;

-- An item's id inside a job's doc: missing, null, '' , a safe string, or a whole number.
create or replace function public.patgo_safe_item_id(v jsonb) returns boolean
language sql immutable as $$
  select v is null
      or jsonb_typeof(v) = 'null'
      or (jsonb_typeof(v) = 'string' and (v #>> '{}' = '' or public.patgo_safe_id(v #>> '{}')))
      or (jsonb_typeof(v) = 'number' and (v #>> '{}') ~ '^[0-9]{1,15}$')
$$;

create or replace function public.patgo_job_ok(job_id text, doc jsonb) returns boolean
language sql immutable as $$
  select public.patgo_safe_id(job_id)
     and (jsonb_typeof(doc -> 'items') is distinct from 'array'
          or not exists (
            select 1 from jsonb_array_elements(doc -> 'items') e
            where jsonb_typeof(e) = 'object' and not public.patgo_safe_item_id(e -> 'id')))
$$;

-- A logo / signature: missing, null, '', or a PNG / JPEG picture as PATGo saves it.
create or replace function public.patgo_safe_picture(v jsonb) returns boolean
language sql immutable as $$
  select v is null
      or jsonb_typeof(v) = 'null'
      or (jsonb_typeof(v) = 'string' and (v #>> '{}' = ''
          or (v #>> '{}') ~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/]*={0,2}$'))
$$;

create or replace function public.patgo_record_ok(kind text, doc jsonb) returns boolean
language sql immutable as $$
  select case
    when kind = 'settings' then public.patgo_safe_picture(doc -> 'logo') and public.patgo_safe_picture(doc -> 'signature')
    when kind = 'template' then public.patgo_safe_picture(doc -> 'settings' -> 'logo') and public.patgo_safe_picture(doc -> 'settings' -> 'signature')
    else true end
$$;

-- ------------------------------------------------- the rules (only on a clean cloud)
do $v154$
begin
  if not exists (select 1 from pg_constraint where conname = 'sessions_safe_ids' and conrelid = 'public.sessions'::regclass)
     and not exists (select 1 from public.sessions where not public.patgo_job_ok(id, doc)) then
    alter table public.sessions add constraint sessions_safe_ids check (public.patgo_job_ok(id, doc));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'records_safe_pictures' and conrelid = 'public.records'::regclass)
     and not exists (select 1 from public.records where not public.patgo_record_ok(kind, doc)) then
    alter table public.records add constraint records_safe_pictures check (public.patgo_record_ok(kind, doc));
  end if;
end
$v154$;


-- ================================================================ V155
-- Invites, roles and the people in a business (Teams v1 — Peter, 11 Nov:
-- 1A 2A 3A 4A 5A 6A 8A; names typed at invite; "a paid seat anywhere means
-- you're never locked"). Existing projects: supabase/v155-invites.sql (plus
-- self-checks V1–V5). Kept in step with it byte for byte by harness group 94f.
--
-- Memberships still have no write route from the app: every change below is an
-- rpc that checks who is asking. The invites table has no policies at all — the
-- rpcs are the only way in or out.

-- ------------------------------------------------- a name for each person (names: typed at invite)
alter table public.memberships add column if not exists name text not null default '';
do $$ begin
  alter table public.memberships add constraint memberships_name_len check (char_length(name) <= 60);
exception when duplicate_object then null; end $$;

-- ------------------------------------------------- the invites (1A, 5A)
-- One row per invite, addressed to an email address. It waits 14 days (5A);
-- one waiting invite per address per business. 'expired' is written only when
-- the same address is invited again (until then a waiting row past its date
-- simply reads as expired).
create table if not exists public.invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations(id) on delete cascade,
  email       text not null check (email = lower(btrim(email)) and char_length(email) between 3 and 254
                                   and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  name        text not null check (char_length(name) between 1 and 60),
  role        text not null check (role in ('team_leader','engineer','office')),
  invited_by  uuid references auth.users(id) on delete set null,
  status      text not null default 'waiting'
                check (status in ('waiting','joined','declined','cancelled','expired')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  decided_at  timestamptz
);
create unique index if not exists invites_one_waiting on public.invites (org_id, email) where status = 'waiting';
create index if not exists invites_email on public.invites (email) where status = 'waiting';
alter table public.invites enable row level security;
revoke all on public.invites from public, anon, authenticated;

-- ------------------------------------------------- helpers (not callable from a phone)
-- The signed-in person's email, only once the address is confirmed: an invite
-- is accepted by proving you own the address it was sent to.
create or replace function public._my_confirmed_email()
returns text language sql stable security definer set search_path = '' as $$
  select lower(btrim(u.email)) from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null
$$;

-- 3A: the joiner's own phones — the same test as org_phones_behind, for one person.
create or replace function public._user_phones_behind(u uuid)
returns integer language sql stable security definer set search_path = '' as $$
  with s as (
    select now() - make_interval(days => coalesce((select x.invite_phone_days from public.app_settings x where x.id = 1), 60)) as win,
           public.app_min_version_for(u) as need
  )
  select (
    (select count(*) from public.phones p, s
     where p.user_id = u and p.seen_at > s.win and coalesce(p.version_num, 0) < s.need)
  + (select count(*) from auth.sessions ses, s
     where ses.user_id = u
       and greatest(ses.created_at, ses.updated_at, ses.refreshed_at at time zone 'UTC') > s.win
       and not exists (select 1 from public.phones p
                       where p.user_id = ses.user_id and p.auth_session = ses.id))
  )::integer
$$;

-- 2A: which roles a person may offer. Owner: any but Owner. Team leader and
-- Office: Engineer only. Engineer: none.
create or replace function public._may_offer(o uuid, r text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case public.my_role(o)
    when 'owner' then r in ('team_leader','engineer','office')
    when 'team_leader' then r = 'engineer'
    when 'office' then r = 'engineer'
    else false end
$$;

revoke all on function public._my_confirmed_email() from public, anon, authenticated;
revoke all on function public._user_phones_behind(uuid) from public, anon, authenticated;
revoke all on function public._may_offer(uuid, text) from public, anon, authenticated;

-- ------------------------------------------------- sending, cancelling (1A, 2A, 3A, 5A)
-- Errors the phone puts into words: patgo_not_allowed, patgo_invite_email,
-- patgo_invite_name, patgo_invite_member, patgo_invite_waiting,
-- patgo_invite_many (50 waiting), patgo_phones_behind, patgo_invite_gone.
create or replace function public.invite_member(o uuid, e text, n text, r text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare em text := lower(btrim(coalesce(e, ''))); nm text := btrim(coalesce(n, '')); i uuid;
begin
  if auth.uid() is null or not public._may_offer(o, r) then raise exception 'patgo_not_allowed'; end if;
  if char_length(em) not between 3 and 254 or em !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'patgo_invite_email';
  end if;
  if char_length(nm) not between 1 and 60 then raise exception 'patgo_invite_name'; end if;
  if exists (select 1 from public.memberships m join auth.users u on u.id = m.user_id
             where m.org_id = o and lower(btrim(u.email)) = em) then
    raise exception 'patgo_invite_member';
  end if;
  -- 3A: every phone in the business on a version that may sync.
  if public.org_phones_behind(o) > 0 then raise exception 'patgo_phones_behind'; end if;
  update public.invites set status = 'expired', decided_at = now()
  where org_id = o and email = em and status = 'waiting' and expires_at <= now();
  if exists (select 1 from public.invites where org_id = o and email = em and status = 'waiting') then
    raise exception 'patgo_invite_waiting';
  end if;
  if (select count(*) from public.invites where org_id = o and status = 'waiting' and expires_at > now()) >= 50 then
    raise exception 'patgo_invite_many';
  end if;
  insert into public.invites (org_id, email, name, role, invited_by)
  values (o, em, nm, r, auth.uid()) returning id into i;
  return i;
end;
$$;

-- 2A: whoever could have sent it may cancel it (an Engineer invite: Owner,
-- Team leader, Office; any other: the Owner).
create or replace function public.cancel_invite(i uuid)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v public.invites;
begin
  select * into v from public.invites where id = i for update;
  if not found or auth.uid() is null or not public._may_offer(v.org_id, v.role) then raise exception 'patgo_not_allowed'; end if;
  if v.status <> 'waiting' then return v.status; end if;
  update public.invites set status = 'cancelled', decided_at = now() where id = i;
  return 'cancelled';
end;
$$;

-- ------------------------------------------------- answering (1A, 3A, 4A)
-- Waiting invites to my confirmed address, with the business's name and the
-- inviter's name in it.
create or replace function public.my_invites()
returns table (id uuid, business_id uuid, business_name text, role text, invited_by_name text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select v.id, v.org_id, o.name, v.role,
         coalesce((select m.name from public.memberships m where m.org_id = v.org_id and m.user_id = v.invited_by), ''),
         v.expires_at
  from public.invites v
  join public.organisations o on o.id = v.org_id
  where v.email = public._my_confirmed_email() and v.status = 'waiting' and v.expires_at > now()
    and not exists (select 1 from public.memberships m where m.org_id = v.org_id and m.user_id = auth.uid())
  order by v.created_at, v.id
$$;

-- Join. make_main: the business becomes the one new jobs go to (the joiner's
-- choice at Join). The joiner's own jobs stay in their own business (2 Nov).
-- Errors: patgo_not_allowed, patgo_invite_gone, patgo_your_phones_behind.
create or replace function public.accept_invite(i uuid, make_main boolean default false)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v public.invites; me uuid := auth.uid(); em text := public._my_confirmed_email();
begin
  select * into v from public.invites where id = i for update;
  if not found or me is null or em is null or v.email <> em then raise exception 'patgo_not_allowed'; end if;
  if v.status <> 'waiting' or v.expires_at <= now() then raise exception 'patgo_invite_gone'; end if;
  if exists (select 1 from public.memberships m where m.org_id = v.org_id and m.user_id = me) then
    update public.invites set status = 'joined', decided_at = now() where id = i;
    return 'joined';
  end if;
  -- 3A: a Team leader or Office joiner reads the team — so every phone of
  -- theirs must be one that may sync, whatever the role.
  if public._user_phones_behind(me) > 0 then raise exception 'patgo_your_phones_behind'; end if;
  insert into public.memberships (org_id, user_id, role, is_default, name)
  values (v.org_id, me, v.role, false, v.name);
  if coalesce(make_main, false) then
    update public.memberships set is_default = false where user_id = me and is_default;
    update public.memberships set is_default = true where user_id = me and org_id = v.org_id;
  end if;
  update public.invites set status = 'joined', decided_at = now() where id = i;
  return 'joined';
end;
$$;

create or replace function public.decline_invite(i uuid)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v public.invites; em text := public._my_confirmed_email();
begin
  select * into v from public.invites where id = i for update;
  if not found or em is null or v.email <> em then raise exception 'patgo_not_allowed'; end if;
  if v.status <> 'waiting' then return v.status; end if;
  update public.invites set status = 'declined', decided_at = now() where id = i;
  return 'declined';
end;
$$;

-- ------------------------------------------------- the people in a business (6A)
-- Everyone in a business sees each person's name and role; only Owner, Team
-- leader and Office see their email addresses.
create or replace function public.business_people()
returns table (business_id uuid, user_id uuid, name text, role text, is_you boolean, email text)
language sql stable security definer set search_path = '' as $$
  select m.org_id, m.user_id, m.name, m.role, m.user_id = auth.uid(),
         case when public.can_read_org(m.org_id) then u.email end
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.org_id in (select x.org_id from public.memberships x where x.user_id = auth.uid())
  order by m.org_id, (m.role = 'owner') desc, m.created_at, m.user_id
$$;

-- The invites of every business I may read (Owner, Team leader, Office):
-- waiting ones, and those answered in the last 30 days.
create or replace function public.business_invites()
returns table (id uuid, business_id uuid, email text, name text, role text, status text,
               created_at timestamptz, expires_at timestamptz, decided_at timestamptz, can_cancel boolean)
language sql stable security definer set search_path = '' as $$
  select v.id, v.org_id, v.email, v.name, v.role,
         case when v.status = 'waiting' and v.expires_at <= now() then 'expired' else v.status end,
         v.created_at, v.expires_at, v.decided_at,
         v.status = 'waiting' and v.expires_at > now() and public._may_offer(v.org_id, v.role)
  from public.invites v
  where public.can_read_org(v.org_id)
    and (v.status = 'waiting' or coalesce(v.decided_at, v.expires_at) > now() - interval '30 days')
  order by v.org_id, v.created_at desc, v.id
$$;

-- ------------------------------------------------- changing things (2A, names, 4A)
-- 2A: only the Owner changes a role, never their own, never to Owner.
create or replace function public.set_member_role(o uuid, u uuid, r text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare cur text;
begin
  if auth.uid() is null or public.my_role(o) is distinct from 'owner' or u = auth.uid()
     or r not in ('team_leader','engineer','office') then
    raise exception 'patgo_not_allowed';
  end if;
  select m.role into cur from public.memberships m where m.org_id = o and m.user_id = u for update;
  if cur is null or cur = 'owner' then raise exception 'patgo_not_allowed'; end if;
  update public.memberships set role = r where org_id = o and user_id = u;
  return r;
end;
$$;

-- Your own name in a business, 1–60 characters.
create or replace function public.set_my_member_name(o uuid, n text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare nm text := btrim(coalesce(n, ''));
begin
  if char_length(nm) not between 1 and 60 then raise exception 'patgo_invite_name'; end if;
  update public.memberships set name = nm where org_id = o and user_id = auth.uid();
  if not found then raise exception 'patgo_not_allowed'; end if;
  return nm;
end;
$$;

-- 4A / Make main: which of your businesses new jobs go to.
create or replace function public.set_main_business(o uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.my_role(o) is null then raise exception 'patgo_not_allowed'; end if;
  update public.memberships set is_default = false where user_id = auth.uid() and is_default and org_id <> o;
  update public.memberships set is_default = true where user_id = auth.uid() and org_id = o and not is_default;
  return true;
end;
$$;

-- ------------------------------------------------- a paid seat anywhere (Peter, 11 Nov)
-- The plan a person's phone goes by is the BEST of every business they belong
-- to (paid or free first; then the latest trial end or lapse), not only their
-- main business's. Each business's own uploads are still decided by its own
-- plan (can_upload). The per-business lock is its own later release.
create or replace function public.plan_cover(u uuid)
returns table (plan text, trial_ends_at timestamptz, lapsed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.plan, o.trial_ends_at, o.lapsed_at
  from public.memberships m join public.organisations o on o.id = m.org_id
  where m.user_id = u
  order by (o.plan in ('active','comped')) desc,
           case o.plan when 'trial' then coalesce(o.trial_ends_at, 'infinity'::timestamptz)
                       when 'lapsed' then coalesce(o.lapsed_at, '-infinity'::timestamptz)
                       else '-infinity'::timestamptz end desc,
           m.is_default desc, o.id
  limit 1
$$;

-- Writes the cover onto the person's profile (the copy every phone reads).
-- ⚠ patgo.plan_copy tells profile_plan_up this is a COPY: without it the cover
-- would be pushed up into the person's own business — a team's paid plan would
-- make an employee's own business paid.
create or replace function public.plan_cover_refresh(u uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare c record;
begin
  select * into c from public.plan_cover(u);
  if not found then return; end if;
  perform set_config('patgo.plan_copy', 'on', true);
  update public.profiles p
  set plan = c.plan, trial_ends_at = c.trial_ends_at, lapsed_at = c.lapsed_at
  where p.id = u
    and (p.plan is distinct from c.plan or p.trial_ends_at is distinct from c.trial_ends_at
         or p.lapsed_at is distinct from c.lapsed_at);
  perform set_config('patgo.plan_copy', '', true);
end;
$$;
revoke all on function public.plan_cover(uuid) from public, anon, authenticated;
revoke all on function public.plan_cover_refresh(uuid) from public, anon, authenticated;

-- A business's plan changes → every member's cover (not only those whose main it is).
create or replace function public.org_plan_to_members()
returns trigger language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  for u in select m.user_id from public.memberships m where m.org_id = new.id loop
    perform public.plan_cover_refresh(u);
  end loop;
  return null;
end;
$$;

-- Joining, leaving, or changing which is main → that person's cover.
create or replace function public.member_plan_copy()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform public.plan_cover_refresh(old.user_id);
  else
    perform public.plan_cover_refresh(new.user_id);
    if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
      perform public.plan_cover_refresh(old.user_id);
    end if;
  end if;
  return null;
end;
$$;
drop trigger if exists member_plan_copy on public.memberships;
create trigger member_plan_copy
  after insert or delete or update of is_default, org_id, user_id on public.memberships
  for each row execute function public.member_plan_copy();

-- A plan set by hand on a profile (the old way) still goes up to the person's
-- main business — but never a copy written by plan_cover_refresh.
create or replace function public.profile_plan_up()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('patgo.plan_copy', true), '') = 'on' then return null; end if;
  if new.plan is distinct from old.plan or new.trial_ends_at is distinct from old.trial_ends_at then
    update public.organisations o
    set plan = new.plan, trial_ends_at = new.trial_ends_at
    where o.id = public.default_org(new.id)
      and (o.plan is distinct from new.plan or o.trial_ends_at is distinct from new.trial_ends_at);
  end if;
  return null;
end;
$$;

-- my_billing: the main business's plan for the Subscription page, as before,
-- plus the cover the phone's lock goes by.
create or replace function public.my_billing()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'plan', o.plan,
    'trial_ends_at', o.trial_ends_at,
    'lapsed_at', o.lapsed_at,
    'status', o.billing_status,
    'interval', o.billing_interval,
    'period_end', o.period_end,
    'cancel_at_period_end', o.cancel_at_period_end,
    'has_customer', o.stripe_customer is not null,
    'has_subscription', o.stripe_subscription is not null,
    'role', m.role,
    'can_manage', m.role = 'owner',
    'cover', (select to_jsonb(c) from public.plan_cover(auth.uid()) c))
  from public.memberships m
  join public.organisations o on o.id = m.org_id
  where m.user_id = auth.uid() and m.is_default
  limit 1
$$;

-- Fill every cover once (a re-run finds nothing to do).
do $$
declare u uuid;
begin
  for u in select distinct m.user_id from public.memberships m loop
    perform public.plan_cover_refresh(u);
  end loop;
end $$;

-- ------------------------------------------------- who may call what
revoke all on function public.invite_member(uuid, text, text, text) from public, anon;
revoke all on function public.cancel_invite(uuid) from public, anon;
revoke all on function public.my_invites() from public, anon;
revoke all on function public.accept_invite(uuid, boolean) from public, anon;
revoke all on function public.decline_invite(uuid) from public, anon;
revoke all on function public.business_people() from public, anon;
revoke all on function public.business_invites() from public, anon;
revoke all on function public.set_member_role(uuid, uuid, text) from public, anon;
revoke all on function public.set_my_member_name(uuid, text) from public, anon;
revoke all on function public.set_main_business(uuid) from public, anon;
revoke all on function public.my_billing() from public, anon;
grant execute on function public.invite_member(uuid, text, text, text) to authenticated;
grant execute on function public.cancel_invite(uuid) to authenticated;
grant execute on function public.my_invites() to authenticated;
grant execute on function public.accept_invite(uuid, boolean) to authenticated;
grant execute on function public.decline_invite(uuid) to authenticated;
grant execute on function public.business_people() to authenticated;
grant execute on function public.business_invites() to authenticated;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.set_my_member_name(uuid, text) to authenticated;
grant execute on function public.set_main_business(uuid) to authenticated;
grant execute on function public.my_billing() to authenticated;



-- ================================================================ V156
-- Devices that hold up invites (Teams v1 — Peter, 11 Nov: 1A 2A 3A, the
-- defaults). Existing projects: supabase/v156-devices.sql (plus self-checks
-- V1–V4). Kept in step with it byte for byte by harness group 95f.
--
-- One list decides everything: _signed_in_devices(u) — every sign-in of u still
-- in auth.sessions (and not past its not_after), with the phone report that
-- arrived on it if any. "behind" is the V151/V155 test on that list: used in the
-- last invite_phone_days, and either never reported on that sign-in or reported
-- a version below u's minimum. org_phones_behind, _user_phones_behind and the
-- device lists all read it, so they can never disagree.

-- ------------------------------------------------- what kind of device (2A, 3A)
-- From the sign-in's browser line only — never anything the phone sent.
create or replace function public._device_kind(ua text)
returns text language sql immutable set search_path = '' as $$
  select case
    when ua ~* 'iphone' then 'iPhone'
    when ua ~* 'ipad' then 'iPad'
    when ua ~* 'android' then 'Android phone'
    when ua ~* 'macintosh|mac os x' then 'Mac'
    when ua ~* 'windows' then 'Windows computer'
    when ua ~* 'linux|cros' then 'Computer'
    else 'Device' end
$$;

-- ------------------------------------------------- the one list (1A)
create or replace function public._signed_in_devices(u uuid)
returns table (session_id uuid, kind text, app_version text, version_num integer,
               last_used timestamptz, reported boolean, behind boolean)
language sql stable security definer set search_path = '' as $$
  with s as (
    select now() - make_interval(days => coalesce((select x.invite_phone_days from public.app_settings x where x.id = 1), 60)) as win,
           public.app_min_version_for(u) as need
  ), d as (
    select ses.id as session_id,
           public._device_kind(ses.user_agent) as kind,
           p.app_version, p.version_num,
           greatest(ses.created_at, ses.updated_at, ses.refreshed_at at time zone 'UTC', p.seen_at) as last_used,
           (p.phone_id is not null) as reported
    from auth.sessions ses
    left join lateral (
      select ph.phone_id, ph.app_version, ph.version_num, ph.seen_at from public.phones ph
      where ph.user_id = ses.user_id and ph.auth_session = ses.id
      order by ph.seen_at desc limit 1
    ) p on true
    where ses.user_id = u
      and (ses.not_after is null or ses.not_after > now())
  )
  select d.session_id, d.kind, d.app_version, d.version_num, d.last_used, d.reported,
         (d.last_used > s.win and (not d.reported or coalesce(d.version_num, 0) < s.need)) as behind
  from d, s
$$;

-- ------------------------------------------------- the checks invites make (1A)
-- Same names and answers as V151 / V155, now counting signed-in devices only.
create or replace function public.org_phones_behind(o uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer
  from public.memberships mm, lateral public._signed_in_devices(mm.user_id) d
  where mm.org_id = o and d.behind
$$;

create or replace function public._user_phones_behind(u uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public._signed_in_devices(u) d where d.behind
$$;

revoke all on function public._device_kind(text) from public, anon, authenticated;
revoke all on function public._signed_in_devices(uuid) from public, anon, authenticated;
revoke all on function public.org_phones_behind(uuid) from public, anon, authenticated;
revoke all on function public._user_phones_behind(uuid) from public, anon, authenticated;

-- ------------------------------------------------- the sign-in this request came on
create or replace function public._my_session()
returns uuid language sql stable set search_path = '' as $$
  select case when s ~ '^[0-9a-fA-F-]{36}$' then s::uuid end
  from (select nullif(coalesce(current_setting('request.jwt.claims', true), ''), '')::jsonb ->> 'session_id' as s) x
$$;
revoke all on function public._my_session() from public, anon, authenticated;

-- ------------------------------------------------- Your devices (3A)
-- Every device signed in to my account. this_device = the one asking.
create or replace function public.my_devices()
returns table (session_id uuid, kind text, app_version text, last_used timestamptz,
               reported boolean, behind boolean, this_device boolean)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'patgo_not_allowed' using errcode = '42501'; end if;
  return query
    select d.session_id, d.kind, d.app_version, d.last_used, d.reported, d.behind,
           (d.session_id = public._my_session()) as this_device
    from public._signed_in_devices(me) d
    order by (d.session_id = public._my_session()) desc nulls last, d.last_used desc;
end $$;

-- 2A: the devices holding up an invite to business o — for the people who invite
-- (Owner / Team leader / Office). A teammate's sign-in is never handed out.
create or replace function public.business_devices_behind(o uuid)
returns table (user_id uuid, name text, is_you boolean, session_id uuid, kind text,
               app_version text, last_used timestamptz, reported boolean)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null or not public.can_read_org(o) then
    raise exception 'patgo_not_allowed' using errcode = '42501';
  end if;
  return query
    select mm.user_id,
           coalesce(nullif(btrim(mm.name), ''), lower(btrim(u.email)), '') as name,
           (mm.user_id = me) as is_you,
           case when mm.user_id = me then d.session_id end as session_id,
           d.kind, d.app_version, d.last_used, d.reported
    from public.memberships mm
    join auth.users u on u.id = mm.user_id,
    lateral public._signed_in_devices(mm.user_id) d
    where mm.org_id = o and d.behind
    order by (mm.user_id = me) desc, d.last_used desc;
end $$;

-- Sign it out (2A, 3A): ends one of MY sign-ins — never someone else's, never the
-- one asking. The device keeps its data; it can't refresh the sign-in, so it is
-- signed out within the hour at most. False = already gone.
create or replace function public.sign_out_device(s uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := auth.uid(); n integer;
begin
  if me is null then raise exception 'patgo_not_allowed' using errcode = '42501'; end if;
  if s is null then return false; end if;
  if s = public._my_session() then raise exception 'patgo_this_device'; end if;
  delete from auth.sessions x where x.id = s and x.user_id = me;
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke all on function public.my_devices() from public, anon;
revoke all on function public.business_devices_behind(uuid) from public, anon;
revoke all on function public.sign_out_device(uuid) from public, anon;
grant execute on function public.my_devices() to authenticated;
grant execute on function public.business_devices_behind(uuid) to authenticated;
grant execute on function public.sign_out_device(uuid) to authenticated;


-- ================================================================ V157
-- The Approve / Refuse screen (Teams v1 — Peter, 11 Nov: R67, 1A 2A 3A 4A 5A).
-- Existing projects: supabase/v157-approvals.sql (plus self-checks W1–W3).
-- Kept in step with it byte for byte by harness group 96f.

-- The requests waiting for me (1A 2A). Mine never: the asker can't decide their
-- own (V150 refuses it too), and a job's owner is always its asker.
create or replace function public.business_waiting_moves()
returns table (id uuid, business_id uuid, from_name text, to_org uuid, to_name text,
               asker text, job text, items integer, job_date text, requested_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.from_org, f.name, m.to_org, t.name,
         coalesce(nullif(btrim(am.name), ''), ''),
         left(coalesce(nullif(btrim(s.doc ->> 'site'), ''), nullif(btrim(s.doc ->> 'name'), ''), ''), 120),
         case when jsonb_typeof(s.doc -> 'items') = 'array' then jsonb_array_length(s.doc -> 'items') else 0 end,
         left(coalesce(s.doc ->> 'date', ''), 10),
         m.requested_at
  from public.job_moves m
  join public.organisations f on f.id = m.from_org
  join public.organisations t on t.id = m.to_org
  left join public.memberships am on am.org_id = m.from_org and am.user_id = m.requested_by
  left join public.sessions s on s.user_id = m.user_id and s.id = m.session_id
  where m.status = 'waiting'
    and m.requested_by is distinct from auth.uid()
    and m.user_id is distinct from auth.uid()
    and coalesce(public.member_role(m.from_org, auth.uid()) in ('owner','team_leader','office'), false)
  order by m.from_org, m.requested_at, m.id
$$;

-- V150's view, plus who decided (4A): their name in the business the job was
-- leaving, '' for a move the asker made themselves (out of a business they own),
-- a cancel, or someone since gone from it. The return shape grows, so it is
-- dropped and made again (the grants with it).
drop function if exists public.my_job_moves();
create function public.my_job_moves()
returns table (id uuid, session_id text, from_org uuid, from_name text, to_org uuid, to_name text,
               status text, requested_at timestamptz, decided_at timestamptz, decided_name text)
language sql stable security definer set search_path = '' as $$
  select distinct on (m.session_id)
         m.id, m.session_id, m.from_org, f.name, m.to_org, t.name, m.status, m.requested_at, m.decided_at,
         case when m.status in ('moved','refused') and m.decided_by is distinct from m.requested_by
              then coalesce(nullif(btrim(dm.name), ''), '') else '' end
  from public.job_moves m
  join public.organisations f on f.id = m.from_org
  join public.organisations t on t.id = m.to_org
  left join public.memberships dm on dm.org_id = m.from_org and dm.user_id = m.decided_by
  where m.user_id = auth.uid()
  order by m.session_id, m.requested_at desc, m.id
$$;

-- Approve / refuse, as the signed-in person — V150's, plus: a request that's no
-- longer waiting, asked by someone who may decide it, says how it ended in the
-- error's detail ('status|name|you'), so the phone can say "Already refused by
-- Sarah". Two approvers at the same moment: the second waits on V150's row lock
-- and gets V150's plain 'patgo_move_stale' (no detail) — the phone says
-- "already decided" without a name.
create or replace function public.decide_job_move(move uuid, approve boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  m record;
  who text;
begin
  if me is null then
    raise exception 'patgo_move_role: sign in first' using errcode = '42501';
  end if;
  select x.status, x.from_org, x.decided_by into m from public.job_moves x where x.id = move;
  if found and m.status <> 'waiting'
     and coalesce(public.member_role(m.from_org, me) in ('owner','team_leader','office'), false) then
    select coalesce(nullif(btrim(d.name), ''), '') into who
    from public.memberships d where d.org_id = m.from_org and d.user_id = m.decided_by;
    raise exception 'patgo_move_stale: that request is no longer waiting' using errcode = 'P0002',
      detail = m.status || '|' || coalesce(who, '') || '|' || case when m.decided_by = me then 'you' else '' end;
  end if;
  return public._job_move_decide(move, approve, me);
end;
$$;

revoke all on function public.business_waiting_moves() from public, anon;
revoke all on function public.my_job_moves() from public, anon;
revoke all on function public.decide_job_move(uuid, boolean) from public, anon;
grant execute on function public.business_waiting_moves() to authenticated;
grant execute on function public.my_job_moves() to authenticated;
grant execute on function public.decide_job_move(uuid, boolean) to authenticated;
