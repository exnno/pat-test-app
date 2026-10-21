-- PATGo cloud — V113: businesses (Stage 11 part 2, the database)
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on an existing project: Dashboard → SQL Editor → New query → paste
-- this whole file → Run. Safe to run again. (A new project gets the same from
-- schema.sql.) Nothing on any phone changes: every app version keeps working.
--
-- What it does, in plain terms:
--   • Every account becomes a business of one, with that person as Owner (4A).
--     New sign-ups get the same. The business name is blank — the company name
--     the reports print still lives in Report settings.
--   • Every job, record and photo row is stamped with the business it belongs
--     to (2A). The DATABASE fills the stamp from the writer's default business —
--     phones never send it — and an update never changes it. Stamping existing
--     rows does not count as a change, so no phone re-reads anything.
--   • A person may belong to several businesses (3C) — e.g. Owner of their own
--     and Engineer in someone else's. One of them is their default, and new rows
--     are stamped with it. Choosing "working for…" on the phone is Stage 16.
--   • Who reads what (6A): Owner, Team leader and Office read the whole
--     business's jobs, records and photos; an Engineer reads their own. Everyone
--     changes only their own, and only while they belong to the business the row
--     is stamped with — someone who leaves can no longer read or change the
--     business's jobs. (Editing other people's work comes with the audit trail.)
--   • Deleting from the cloud (12A): in a business with more than one person,
--     only the Owner, a Team leader or the Office can delete a job or a photo
--     from the cloud. In a business of one — everyone today — nothing changes.
--   • A login that still has jobs, records or photos can no longer be deleted
--     (5A, 10A): Authentication → Users → Delete user gives an error instead of
--     wiping their work. A login with nothing left goes with its profile and
--     memberships (9A).
--   • Photo files follow the photo rows' read rule (7A); folders unchanged.
--
-- The result is a short table of checks. Every row must say PASS. Then run
-- supabase/isolation-test.sql as usual (it now also checks the business rules).


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

-- ----------------------------------- new sign-ups: profile + business (4A)
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


-- ------------------------------------------------------------ self-check
drop table if exists pg_temp._v113_result;
create temp table _v113_result (n int, check_name text, result text);

do $v113$
declare
  u uuid; o uuid; o2 uuid; i int; j int; k int; s text; res text[] := '{}';
begin
  -- O1: every account has a default business, as Owner.
  select count(*) into i from auth.users au
  where not exists (select 1 from public.memberships m where m.user_id = au.id and m.is_default);
  select count(*) into j from auth.users;
  res := res || array['O1|every account is in a business, with a default|'
                || case when i = 0 then 'PASS (' || j || ' accounts)' else 'FAIL (' || i || ' without)' end];

  -- O2: every row carries the stamp, and the stamp is required.
  select (select count(*) from public.sessions where org_id is null)
       + (select count(*) from public.records where org_id is null)
       + (select count(*) from public.photos where org_id is null) into i;
  select count(*) into j from information_schema.columns
  where table_schema = 'public' and table_name in ('sessions','records','photos')
    and column_name = 'org_id' and is_nullable = 'NO';
  res := res || array['O2|every job, record and photo is stamped with its business|'
                || case when i = 0 and j = 3 then 'PASS' else 'FAIL (' || i || ' unstamped, ' || j || ' of 3 required)' end];

  -- O3: stamping was not a change (no phone re-reads anything).
  select coalesce(sum(stamped), 0), coalesce(sum(moved), 0) into i, j from _v113_stamp;
  res := res || array['O3|stamping did not count as a change|'
                || case when j = 0 then 'PASS (' || i || ' rows stamped this run)' else 'FAIL (' || j || ' rows'' change time moved)' end];

  select id into u from auth.users order by created_at limit 1;
  if u is null then
    res := res || array['O4|a new job is stamped by the database|INCONCLUSIVE — no users yet'];
  else
    delete from public.sessions where id like 'v113-test-%';
    -- O4: a row sent without a stamp (every phone) gets the default business.
    insert into public.sessions (id, user_id, doc, last_modified)
    values ('v113-test-1', u, '{"id":"v113-test-1"}', now());
    select org_id into o from public.sessions where user_id = u and id = 'v113-test-1';
    res := res || array['O4|a new job is stamped by the database|'
                  || case when o is not null and o = public.default_org(u) then 'PASS' else 'FAIL' end];

    -- O5: an update can't move a row to another business.
    insert into public.organisations (name) values ('v113-test') returning id into o2;
    update public.sessions set org_id = o2, doc = '{"id":"v113-test-1","x":1}' where user_id = u and id = 'v113-test-1';
    select org_id into o from public.sessions where user_id = u and id = 'v113-test-1';
    res := res || array['O5|an update keeps the stamp|'
                  || case when o = public.default_org(u) then 'PASS' else 'FAIL (moved)' end];
    delete from public.sessions where id like 'v113-test-%';
    delete from public.organisations where id = o2;
  end if;

  -- O6: deleting a login with work is refused; its profile and memberships go with it.
  select count(*) into i from pg_constraint c
  where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and c.confdeltype = 'r'
    and c.conrelid in ('public.sessions'::regclass, 'public.records'::regclass, 'public.photos'::regclass);
  select count(*) into j from pg_constraint c
  where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and c.confdeltype = 'c'
    and c.conrelid in ('public.profiles'::regclass, 'public.memberships'::regclass);
  select count(*) into k from pg_constraint c
  where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and c.confdeltype = 'c'
    and c.conrelid in ('public.sessions'::regclass, 'public.records'::regclass, 'public.photos'::regclass);
  res := res || array['O6|a login with work can''t be deleted|'
                || case when i = 3 and j = 2 and k = 0 then 'PASS' else 'FAIL (' || i || ' of 3 protected, ' || k || ' still cascade)' end];

  -- O7: a new sign-up gets a business. Tried for real inside a block that is
  -- always undone; if this project won't let SQL add a login, the function's
  -- text is checked instead.
  begin
    u := gen_random_uuid();
    insert into auth.users (id, email) values (u, 'v113-check@example.invalid');
    select count(*) into i from public.memberships where user_id = u and is_default and role = 'owner';
    s := case when i = 1 then 'PASS' else 'FAIL (no business made)' end;
    raise exception 'v113-undo';
  exception when others then
    if sqlerrm <> 'v113-undo' then
      select case when prosrc like '%public.memberships%' then 'PASS (checked the sign-up function; a test login isn''t allowed here)'
                  else 'FAIL (sign-up function not updated)' end
        into s from pg_proc where proname = 'handle_new_user' and pronamespace = 'public'::regnamespace;
    end if;
  end;
  res := res || array['O7|a new sign-up gets a business of their own|' || s];

  -- O8: the rules are in place.
  select count(*) into i from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('organisations','memberships','sessions','records','photos')
    and c.relrowsecurity;
  select count(*) into j from pg_policies
  where schemaname = 'public' and tablename in ('sessions','records','photos')
    and policyname ~ '^(read|add own|change own|delete own) (sessions|records|photos)$';
  select count(*) into k from pg_policies
  where schemaname = 'public' and tablename in ('sessions','records','photos') and policyname ~ '^own ';
  res := res || array['O8|the business rules are in place|'
                || case when i = 5 and j = 12 and k = 0 then 'PASS' else 'FAIL (' || i || ' of 5 protected, ' || j || ' of 12 rules, ' || k || ' old)' end];

  -- O9: the delete guard is on jobs and photos; photo files have the new rules.
  select count(*) into i from pg_trigger
  where tgname = 'wipe_guard' and not tgisinternal
    and tgrelid in ('public.sessions'::regclass, 'public.photos'::regclass);
  select count(*) into j from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname in ('read photo files','add own photo files','change own photo files','delete own photo files');
  select count(*) into k from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname = 'own photo files';
  res := res || array['O9|deleting from the cloud is guarded; photo files follow the rules|'
                || case when i = 2 and j = 4 and k = 0 then 'PASS' else 'FAIL (' || i || ' of 2 guards, ' || j || ' of 4 file rules)' end];

  insert into _v113_result
  select row_number() over (), split_part(x, '|', 1) || ' ' || split_part(x, '|', 2), split_part(x, '|', 3)
  from unnest(res) as x;
end
$v113$;

select check_name, result from _v113_result order by n;
