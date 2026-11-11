-- PATGo cloud — V156: devices that hold up invites
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on an existing project, AFTER the V156 app files are up and AFTER
-- supabase/v155-invites.sql: Dashboard → SQL Editor → New query → paste this
-- whole file → Run. Safe to run again. A new project gets the same from schema.sql.
--
-- V156 (Teams v1 — Peter, 11 Nov, "defaults"; found running v155-invites.sql:
-- a device last used on 6 Nov on V150, still signed in, blocked every invite —
-- a changed or lost phone would do the same for up to 60 days):
--   • only devices STILL SIGNED IN count toward the old-phone check (1A). A
--     phone's report counts only while the sign-in it arrived on is still there;
--     a sign-in that never reported still counts, as before.
--   • the refusal can name the devices holding it up (2A): your own with Sign it
--     out, a teammate's named only (business_devices_behind, for Owner / Team
--     leader / Office — the people who invite).
--   • Your devices (3A): every device signed in to your account, with Sign it
--     out (my_devices, sign_out_device). Never the device you're using — that's
--     the Account page's own Sign out.
--
-- Signing out ends that sign-in: the device can't refresh it, so it is signed out
-- within the hour at most, keeping everything on it (unsent jobs are held to
-- send when that account signs in again — V145). Nothing signs out by itself.
--
-- ⚠ v151-min-version.sql and v155-invites.sql define the two old-phone checks
-- too: if either is ever run again, run this file again straight after it.
--
-- The result is a short table of checks. Every row must say PASS (V3 and V4 say
-- INCONCLUSIVE on a project with no accounts). Then run supabase/isolation-test.sql
-- as usual.

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

-- ================================================================ self-checks
drop table if exists pg_temp._v156_result;
create temp table _v156_result (n int, check_name text, result text);

do $v156$
declare
  res text[] := '{}';
  u uuid; o uuid; s1 uuid; s2 uuid; s3 uuid; k int := 0; msg text; n int; base int; ubase int;
begin
  -- V1: everything is there.
  res := res || array['V1|the device list, Your devices and Sign it out are in place|'
    || case when to_regprocedure('public._signed_in_devices(uuid)') is not null
             and to_regprocedure('public.my_devices()') is not null
             and to_regprocedure('public.business_devices_behind(uuid)') is not null
             and to_regprocedure('public.sign_out_device(uuid)') is not null
             and exists (select 1 from pg_proc p join pg_namespace x on x.oid = p.pronamespace
                         where x.nspname = 'public' and p.proname = 'org_phones_behind' and p.prosrc like '%_signed_in_devices%')
             and exists (select 1 from pg_proc p join pg_namespace x on x.oid = p.pronamespace
                         where x.nspname = 'public' and p.proname = '_user_phones_behind' and p.prosrc like '%_signed_in_devices%')
            then 'PASS' else 'FAIL' end];

  -- V2: signed in, your own devices only; signed out, nothing; the helpers are the database's.
  res := res || array['V2|phones reach devices only through the rpcs; signed out, nothing|'
    || case when has_function_privilege('authenticated', 'public.my_devices()', 'execute')
             and has_function_privilege('authenticated', 'public.sign_out_device(uuid)', 'execute')
             and has_function_privilege('authenticated', 'public.business_devices_behind(uuid)', 'execute')
             and not has_function_privilege('anon', 'public.my_devices()', 'execute')
             and not has_function_privilege('anon', 'public.sign_out_device(uuid)', 'execute')
             and not has_function_privilege('anon', 'public.business_devices_behind(uuid)', 'execute')
             and not has_function_privilege('authenticated', 'public._signed_in_devices(uuid)', 'execute')
             and not has_function_privilege('authenticated', 'public.org_phones_behind(uuid)', 'execute')
             and not has_function_privilege('authenticated', 'public._user_phones_behind(uuid)', 'execute')
             and not has_function_privilege('authenticated', 'public._my_session()', 'execute')
             and not has_table_privilege('authenticated', 'auth.sessions', 'delete')
            then 'PASS' else 'FAIL' end];

  select m.user_id, m.org_id into u, o from public.memberships m
  where m.is_default and m.role = 'owner' order by m.created_at limit 1;
  if u is null then
    res := res || array['V3|only signed-in devices count; Sign it out clears one; never your own sign-in (undone)|INCONCLUSIVE (no accounts yet)'];
  else
    -- V3: three pretend sign-ins on that account for a moment — one old phone
    -- still signed in, one old phone signed out, one sign-in that never reported.
    begin
      base := public.org_phones_behind(o);
      ubase := public._user_phones_behind(u);
      insert into auth.sessions (id, user_id, created_at, updated_at, user_agent)
        values (gen_random_uuid(), u, now(), now(), 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)') returning id into s1;
      insert into auth.sessions (id, user_id, created_at, updated_at, user_agent)
        values (gen_random_uuid(), u, now(), now(), 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)') returning id into s3;
      s2 := gen_random_uuid();   -- a sign-in that has ended: no auth.sessions row
      perform set_config('request.jwt.claims', json_build_object('sub', u::text, 'role', 'authenticated', 'session_id', s1::text)::text, true);
      insert into public.phones (user_id, phone_id, app_version) values (u, 'v156-self-check-a', 'V140');
      perform set_config('request.jwt.claims', json_build_object('sub', u::text, 'role', 'authenticated', 'session_id', s2::text)::text, true);
      insert into public.phones (user_id, phone_id, app_version) values (u, 'v156-self-check-b', 'V140');
      perform set_config('request.jwt.claims', '', true);
      -- the old phone signed in counts; the signed-out one doesn't; the never-reported one does
      if public.org_phones_behind(o) = base + 2 and public._user_phones_behind(u) = ubase + 2 then k := k + 1; end if;
      select count(*) into n from public._signed_in_devices(u) d where d.session_id = s1 and d.behind and d.kind = 'iPhone' and d.reported;
      if n = 1 then k := k + 10; end if;
      -- as that account, on the never-reported sign-in (s3)
      perform set_config('request.jwt.claims', json_build_object('sub', u::text, 'role', 'authenticated', 'session_id', s3::text)::text, true);
      execute 'set local role authenticated';
      select count(*) into n from public.my_devices() x where (x.session_id = s3 and x.this_device and not x.reported) or (x.session_id = s1 and not x.this_device);
      if n = 2 then k := k + 100; end if;
      begin perform public.sign_out_device(s3); exception when others then
        if sqlerrm like 'patgo_this_device%' then k := k + 1000; end if; end;
      if public.sign_out_device(s1) and not public.sign_out_device(s1) then k := k + 10000; end if;
      execute 'reset role';
      perform set_config('request.jwt.claims', '', true);
      if public.org_phones_behind(o) = base + 1 and not exists (select 1 from auth.sessions x where x.id = s1) then k := k + 100000; end if;
      raise exception 'v156-undo';
    exception when others then
      if sqlerrm <> 'v156-undo' then msg := sqlerrm; k := -1; end if;
    end;
    perform set_config('request.jwt.claims', '', true);
    res := res || array['V3|only signed-in devices count; Sign it out clears one; never your own sign-in (undone)|'
      || case when k = 111111 then 'PASS' else 'FAIL' || coalesce(' (' || msg || ')', ' (' || k || ')') end];
  end if;

  -- V4: nobody signs out someone else's device.
  k := 0; msg := null;
  if u is null then
    res := res || array['V4|nobody signs out someone else''s device (undone)|INCONCLUSIVE (no accounts yet)'];
  else
    begin
      insert into auth.sessions (id, user_id, created_at, updated_at) values (gen_random_uuid(), u, now(), now()) returning id into s1;
      perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      if not public.sign_out_device(s1) then k := k + 1; end if;
      begin perform public.business_devices_behind(o); exception when others then
        if sqlerrm like 'patgo_not_allowed%' then k := k + 10; end if; end;
      execute 'reset role';
      perform set_config('request.jwt.claims', '', true);
      if exists (select 1 from auth.sessions x where x.id = s1) then k := k + 100; end if;
      raise exception 'v156-undo';
    exception when others then
      if sqlerrm <> 'v156-undo' then msg := sqlerrm; k := -1; end if;
    end;
    perform set_config('request.jwt.claims', '', true);
    res := res || array['V4|nobody signs out someone else''s device (undone)|'
      || case when k = 111 then 'PASS' else 'FAIL' || coalesce(' (' || msg || ')', ' (' || k || ')') end];
  end if;

  insert into _v156_result
  select row_number() over (), split_part(x, '|', 1) || ' ' || split_part(x, '|', 2), split_part(x, '|', 3)
  from unnest(res) as x;
end
$v156$;

select check_name, result from _v156_result order by n;
