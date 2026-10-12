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

-- Done. Next: run supabase/isolation-test.sql and check all rows say PASS.
