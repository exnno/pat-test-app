-- PATGo cloud — V133: the clean-up job, part 1 (Stage 12) — old delete markers
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on an existing project: Dashboard → SQL Editor → New query → paste
-- this whole file → Run. Safe to run again (it keeps whatever mode the job is
-- in). A new project gets the same from schema.sql. Phones that have not
-- updated yet keep working: the version report is the only new thing they send.
--
-- What it does, in plain terms:
--   • Every delete leaves a small "deleted" row (a marker) so a phone that was
--     away learns of it. This adds a job that clears old markers, run by the
--     database itself every Sunday at 02:17 UTC (3:17am summer time, 2:17am
--     winter time) (1A, 5A).
--   • REPORT ONLY to begin with (2A). Each run writes one line to the
--     cleanup_runs table saying what it WOULD clear and clears nothing. Open it
--     in Table Editor → cleanup_runs. To let it clear for real, later, run:
--         update public.cleanup_settings set mode = 'clear' where id = 1;
--     (and 'report' puts it back). Nothing qualifies before September 2027.
--   • Which markers (3A): photo markers and client / site / preset / template /
--     tester markers older than 12 months. JOB markers are KEPT FOR GOOD — a
--     restored old backup would otherwise quietly send a deleted job back. The
--     12 months can be raised, never lowered: the database refuses less than 365
--     days, the age phones are built around (config.js SYNC_MARKER_DAYS).
--   • A photo marker whose photo file is somehow still in storage is left alone
--     and counted, so no file is ever left without its row.
--   • Phones report their version (4A). Each phone keeps a private id and, when
--     it syncs, writes "this phone, this version" to the phones table; the
--     database adds the time and which sign-in it came from. An account's
--     markers are held back while ANY phone signed in to it (used in the last 2
--     years) has not reported V133 or later — including one that has never
--     reported at all. The line in cleanup_runs names such accounts.
--   • Nobody can reach any of this from the app except their own phones' rows.
--
-- The result is a short table of checks. Every row must say PASS. Then run
-- supabase/isolation-test.sql as usual (it now also checks the phones table).


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


-- ------------------------------------------------------------ self-check
drop table if exists pg_temp._v133_result;
create temp table _v133_result (n int, check_name text, result text);

do $v133$
declare
  u uuid; i int; j int; k int; s text; r bigint; res text[] := '{}';
  sid uuid := gen_random_uuid();
begin
  -- C1: the phones table keeps each account to its own rows.
  select count(*) into i from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('phones','cleanup_settings','cleanup_runs') and c.relrowsecurity;
  select count(*) into j from pg_policies
  where schemaname = 'public' and tablename = 'phones'
    and policyname in ('read own phones','add own phones','change own phones');
  select count(*) into k from pg_policies
  where schemaname = 'public' and tablename in ('cleanup_settings','cleanup_runs');
  res := res || array['C1|phones: own rows only; the job''s tables closed to the app|'
                || case when i = 3 and j = 3 and k = 0 then 'PASS'
                        else 'FAIL (' || i || ' of 3 protected, ' || j || ' of 3 rules, ' || k || ' rules on the job''s tables)' end];

  -- C2: nobody can run the job from the app.
  res := res || array['C2|the job can''t be started from the app|'
                || case when not has_function_privilege('anon', 'public.run_cleanup(boolean)', 'execute')
                         and not has_function_privilege('authenticated', 'public.run_cleanup(boolean)', 'execute')
                        then 'PASS' else 'FAIL' end];

  -- C3: it is scheduled.
  select count(*) into i from cron.job where jobname = 'patgo-cleanup' and schedule = '17 2 * * 0' and active;
  res := res || array['C3|scheduled: Sundays 02:17 UTC|' || case when i = 1 then 'PASS' else 'FAIL (not scheduled)' end];

  -- C4: report-only and the 12-month floor.
  select mode, marker_days into s, i from public.cleanup_settings where id = 1;
  begin
    update public.cleanup_settings set marker_days = 364 where id = 1;
    j := 1;
    raise exception 'v133-undo';
  exception when others then
    if sqlerrm = 'v133-undo' then j := 1; else j := 0; end if;
  end;
  res := res || array['C4|markers kept at least 12 months; mode|'
                || case when i >= 365 and j = 0 then 'PASS (' || i || ' days; mode: ' || s
                          || case when s = 'report' then ' — nothing is cleared' else ' — CLEARING' end || ')'
                        else 'FAIL (' || i || ' days; less than 365 ' || case when j = 1 then 'was accepted' else 'refused' end || ')' end];

  -- C5: job markers are never deleted — no statement in the job removes jobs.
  select count(*) into i from pg_proc
  where proname = 'run_cleanup' and pronamespace = 'public'::regnamespace
    and prosrc ~* 'delete\s+from\s+public\.sessions';
  res := res || array['C5|job markers are kept for good|' || case when i = 0 then 'PASS' else 'FAIL (the job deletes jobs)' end];

  -- C6: a phone's report is stamped by the database. Tried for real inside a
  -- block that is always undone.
  select id into u from auth.users order by created_at limit 1;
  if u is null then
    res := res || array['C6|a phone''s report is stamped by the database|INCONCLUSIVE — no users yet'];
  else
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', u::text, 'role', 'authenticated', 'session_id', sid::text)::text, true);
      insert into public.phones (user_id, phone_id, app_version, version_num, auth_session, seen_at)
      values (u, 'v133-check-phone', 'V133.1', 1, gen_random_uuid(), now() - interval '9 years');
      select count(*) into i from public.phones
      where user_id = u and phone_id = 'v133-check-phone'
        and version_num = 133 and auth_session = sid and seen_at > now() - interval '1 minute';
      s := case when i = 1 then 'PASS' else 'FAIL (the phone''s own values were kept)' end;
      raise exception 'v133-undo';
    exception when others then
      if sqlerrm <> 'v133-undo' then s := 'FAIL (' || sqlerrm || ')'; end if;
    end;
    perform set_config('request.jwt.claims', '', true);
    res := res || array['C6|a phone''s report is stamped by the database|' || s];
  end if;

  -- C7: a trial run, report only whatever the mode — its line is in cleanup_runs.
  r := public.run_cleanup(true);
  select 'PASS (' || accounts || ' accounts, ' || accounts_held || ' held back; would clear '
         || (record_markers + photo_markers) || ' markers; ' || job_markers_kept || ' old job markers kept)'
    into s from public.cleanup_runs where id = r;
  res := res || array['C7|a trial run (clears nothing)|' || coalesce(s, 'FAIL (no line written)')];

  insert into _v133_result
  select row_number() over (), split_part(x, '|', 1) || ' ' || split_part(x, '|', 2), split_part(x, '|', 3)
  from unnest(res) as x;
end
$v133$;

select check_name, result from _v133_result order by n;
