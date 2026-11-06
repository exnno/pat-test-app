-- PATGo cloud — V151: the minimum app version
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on an existing project, BEFORE the V151 app files go up: Dashboard →
-- SQL Editor → New query → paste this whole file → Run. Safe to run again (it
-- keeps the minimum you set). A new project gets the same from schema.sql.
--
-- V151 (Peter, 6 Nov — 0A 1A 2A 3A 4A):
--   • app_settings: ONE row. min_version is the oldest PATGo a phone may sync
--     with. It starts at 151. A phone on V151 or later below it stops syncing
--     and says "Update PATGo …" (its work stays safe on the phone). Raise it
--     when a release needs every phone on it — that release's deploy steps give
--     the one line:
--        update public.app_settings set min_version = 152 where id = 1;
--     ⚠ Only ever raise it to a version that is ALREADY live, or no phone can
--     update to meet it.
--   • app_min_overrides: raises the minimum for ONE account only — the test
--     aid (supabase/v151-test-min-version.sql) uses it on your spare account
--     (4A). An account's minimum is the higher of the two.
--   • my_min_version(): what a signed-in phone reads (on start, on coming back
--     to the front, and before syncing — at most hourly).
--   • org_phones_behind(): for invites (V152) — how many phones in a business
--     are too old. Counts a member's phone that reported an older version in
--     the last 60 days, and a sign-in used in the last 60 days that has never
--     reported at all (unknown counts as too old). Not callable from the app.
--   • The database does NOT refuse old phones' uploads (1A): a phone checks
--     itself, and invites check the business's phones.
--
-- The result is a short table of checks. Every row must say PASS (V3 says
-- INCONCLUSIVE on a project with no accounts). Then run
-- supabase/isolation-test.sql as usual (checks 22a–22e are V151's).

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

-- ------------------------------------------------- self-checks
drop table if exists pg_temp._v151_result;
create temp table _v151_result (n int, check_name text, result text);

do $v151$
declare
  res text[] := '{}';
  u uuid; o uuid; base int; k int := 0; got int; msg text;
begin
  -- V1: the setting is there, one row, a sensible minimum.
  res := res || array['V1|the setting: one row, minimum ' || coalesce((select min_version::text from public.app_settings where id = 1), '?') || '|'
    || case when (select count(*) from public.app_settings) = 1
             and (select min_version from public.app_settings where id = 1) >= 1
             and (select relrowsecurity from pg_class where oid = 'public.app_settings'::regclass)
             and (select relrowsecurity from pg_class where oid = 'public.app_min_overrides'::regclass)
            then 'PASS' else 'FAIL' end];

  -- V2: who may call what.
  res := res || array['V2|phones read their minimum signed in; nobody else calls the rest|'
    || case when has_function_privilege('authenticated', 'public.my_min_version()', 'execute')
             and not has_function_privilege('anon', 'public.my_min_version()', 'execute')
             and not has_function_privilege('authenticated', 'public.app_min_version_for(uuid)', 'execute')
             and not has_function_privilege('authenticated', 'public.org_phones_behind(uuid)', 'execute')
             and not has_table_privilege('authenticated', 'public.app_settings', 'select')
             and not has_table_privilege('authenticated', 'public.app_settings', 'update')
             and not has_table_privilege('authenticated', 'public.app_min_overrides', 'insert')
             and not has_table_privilege('anon', 'public.app_settings', 'select')
            then 'PASS' else 'FAIL' end];

  select m.user_id, m.org_id into u, o from public.memberships m where m.is_default order by m.created_at limit 1;
  if u is null then
    res := res || array['V3|an account reads its own minimum; a raise for it wins (undone)|INCONCLUSIVE (no accounts yet)'];
    res := res || array['V4|the invite check counts an old phone, not a new one (undone)|INCONCLUSIVE (no accounts yet)'];
  else
    begin
      -- V3: as that account — the setting, then its own raise.
      perform set_config('request.jwt.claims', json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      got := public.my_min_version();
      execute 'reset role';
      if got = (select min_version from public.app_settings where id = 1) then k := k + 1; end if;
      insert into public.app_min_overrides (user_id, min_version, note) values (u, 999999, 'v151 self-check')
        on conflict (user_id) do update set min_version = excluded.min_version;
      execute 'set local role authenticated';
      got := public.my_min_version();
      execute 'reset role';
      if got = 999999 then k := k + 10; end if;
      delete from public.app_min_overrides where user_id = u;
      -- V4: an old phone counts, the same phone updated doesn't.
      base := public.org_phones_behind(o);
      insert into public.phones (user_id, phone_id, app_version) values (u, 'v151-self-check-phone', 'V140');
      if public.org_phones_behind(o) = base + 1 then k := k + 100; end if;
      update public.phones set app_version = 'V' || (select min_version from public.app_settings where id = 1)
        where user_id = u and phone_id = 'v151-self-check-phone';
      if public.org_phones_behind(o) = base then k := k + 1000; end if;
      raise exception 'v151-undo';
    exception when others then
      if sqlerrm <> 'v151-undo' then msg := sqlerrm; k := -1; end if;
    end;
    res := res || array['V3|an account reads its own minimum; a raise for it wins (undone)|'
      || case when k >= 0 and k % 100 = 11 then 'PASS' else 'FAIL' || coalesce(' (' || msg || ')', '') end];
    res := res || array['V4|the invite check counts an old phone, not a new one (undone)|'
      || case when k >= 0 and k / 100 = 11 then 'PASS' else 'FAIL' || coalesce(' (' || msg || ')', '') end];
  end if;

  insert into _v151_result
  select row_number() over (), split_part(x, '|', 1) || ' ' || split_part(x, '|', 2), split_part(x, '|', 3)
  from unnest(res) as x;
end
$v151$;

select check_name, result from _v151_result order by n;
