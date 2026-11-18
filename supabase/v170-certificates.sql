-- PATGo cloud — V170: the business's certificate — its settings and its numbers
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on the test project, AFTER the V170 app files are up: Dashboard → SQL
-- Editor → New query → paste this whole file → Run. Safe to run again. A new
-- project gets the same from schema.sql (its last section).
--
-- Locked 18 Nov (R81, Peter — "0B 1A 2B 3 4A 5C 6A", then "7 … 8A"): every
-- certificate setting is the business's (1A); its Owner and Office change them
-- (2B); the cloud gives out each certificate number when the Owner, a Team leader
-- or Office makes the certificate — a connection is needed (3); the business's
-- counter starts from its Owner's own counter (4A); only Owner / Team leader /
-- Office make certificates in a business (5C); a business of one keeps the
-- phone's own counter, offline as now, and tells the cloud how far it got (8A).
--
-- Nothing else changes: no job, setting or photo is touched. The result is a
-- short table of checks. Every row must say PASS.

-- ================================================================ V170
-- The business's certificate (R81). KEEP IN STEP with supabase/v170-certificates.sql
-- (the same, plus self-checks F1–F5). Kept in step by harness 111.
--
-- One row per business: its certificate settings (the app's reportSettings,
-- WITHOUT the counter fields) and the next certificate number. Closed to the app
-- entirely — read and written only through the four functions below, which check
-- the caller's role in THAT business themselves.
--
-- ⚠ The number is handed out by a single UPDATE … RETURNING on the business's
-- row, so two people making certificates at the same moment can never get the
-- same number (the row is locked for the update). The phone formats it (prefix,
-- {year}, padding) from the same settings.
create table if not exists public.cert_settings (
  org_id      uuid primary key references public.organisations(id) on delete cascade,
  settings    jsonb not null default '{}'::jsonb,
  next_no     integer not null default 1 check (next_no >= 1),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
alter table public.cert_settings enable row level security;
revoke all on public.cert_settings from anon, authenticated;

-- The business's row, made the first time anything asks (4A): from its Owner's
-- own synced certificate settings and counter (records 'settings_report' /
-- 'settings_certcounter' — sync.js SYNC_REPORT_ID / SYNC_CERT_ID), so the first
-- business number follows on from the Owner's last one and a solo user's
-- certificate looks exactly as before. No Owner record = defaults (the app's).
create or replace function public._cert_row(o uuid)
returns public.cert_settings language plpgsql volatile security definer set search_path = '' as $$
declare r public.cert_settings; own uuid; s jsonb; n integer;
begin
  select * into r from public.cert_settings where org_id = o;
  if found then return r; end if;
  select m.user_id into own from public.memberships m where m.org_id = o and m.role = 'owner'
    order by m.created_at limit 1;
  if own is not null then
    select x.doc -> 'settings' into s from public.records x
      where x.user_id = own and x.kind = 'settings' and x.id = 'settings_report' and not x.deleted;
    select case when (x.doc ->> 'next') ~ '^[0-9]{1,9}$' then greatest((x.doc ->> 'next')::integer, 1) end
      into n from public.records x
      where x.user_id = own and x.kind = 'settings' and x.id = 'settings_certcounter' and not x.deleted;
  end if;
  if s is null or jsonb_typeof(s) <> 'object' then s := '{}'::jsonb; end if;
  insert into public.cert_settings (org_id, settings, next_no, updated_by)
    values (o, s - 'certNextNumber' - 'certSetAt', coalesce(n, 1), own)
    on conflict (org_id) do nothing;
  select * into r from public.cert_settings where org_id = o;
  return r;
end;
$$;

-- Any member: the business's certificate settings, its next number, when they
-- last changed, and what the caller may do (2B edit, 5C make). solo = a business
-- of one (8A: the phone's own counter).
create or replace function public.business_cert(o uuid)
returns table (settings jsonb, next_no integer, updated_at timestamptz,
               can_edit boolean, can_make boolean, solo boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare me text; r public.cert_settings;
begin
  me := public.my_role(o);
  if auth.uid() is null or me is null then raise exception 'patgo_cert_not_allowed' using errcode = '42501'; end if;
  r := public._cert_row(o);
  return query select r.settings, r.next_no, r.updated_at,
    me in ('owner','office'), me in ('owner','team_leader','office'), public.org_size(o) = 1;
end;
$$;

-- 2B: the Owner or Office saves the business's settings (the counter fields are
-- dropped — the number is next_no). n: a new next number (4A "the Owner can
-- change it"), null = keep. The settings must be an object; the logo makes them
-- the biggest thing here, so they are capped (≈1.5 MB of text).
create or replace function public.cert_settings_save(o uuid, s jsonb, n integer default null)
returns timestamptz language plpgsql volatile security definer set search_path = '' as $$
declare at timestamptz;
begin
  if auth.uid() is null or coalesce(public.my_role(o), '') not in ('owner','office') then
    raise exception 'patgo_cert_not_allowed' using errcode = '42501';
  end if;
  if s is null or jsonb_typeof(s) <> 'object' or octet_length(s::text) > 1500000 then
    raise exception 'patgo_cert_bad' using errcode = '22023';
  end if;
  if n is not null and (n < 1 or n > 999999999) then raise exception 'patgo_cert_bad' using errcode = '22023'; end if;
  perform public._cert_row(o);
  update public.cert_settings
     set settings = s - 'certNextNumber' - 'certSetAt',
         next_no = coalesce(n, next_no), updated_at = now(), updated_by = auth.uid()
   where org_id = o
  returning updated_at into at;
  return at;
end;
$$;

-- 3, 5C: the Owner, a Team leader or Office making a certificate takes the next
-- number. One UPDATE … RETURNING: the row lock makes it unique.
create or replace function public.cert_take(o uuid)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare got integer;
begin
  if auth.uid() is null or coalesce(public.my_role(o), '') not in ('owner','team_leader','office') then
    raise exception 'patgo_cert_not_allowed' using errcode = '42501';
  end if;
  perform public._cert_row(o);
  update public.cert_settings set next_no = next_no + 1 where org_id = o
  returning next_no - 1 into got;
  return got;
end;
$$;

-- 8A: a business of one numbered a certificate on the phone; its Owner tells the
-- cloud how far the phone's counter got, so if people join later the business's
-- numbers carry on after it. Only ever moves the counter forward.
create or replace function public.cert_seen(o uuid, n integer)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare got integer;
begin
  if auth.uid() is null or public.my_role(o) is distinct from 'owner' then
    raise exception 'patgo_cert_not_allowed' using errcode = '42501';
  end if;
  if n is null or n < 1 or n > 999999999 then raise exception 'patgo_cert_bad' using errcode = '22023'; end if;
  perform public._cert_row(o);
  update public.cert_settings set next_no = greatest(next_no, n) where org_id = o
  returning next_no into got;
  return got;
end;
$$;

revoke all on function public._cert_row(uuid) from public, anon, authenticated;
revoke all on function public.business_cert(uuid), public.cert_settings_save(uuid, jsonb, integer),
                       public.cert_take(uuid), public.cert_seen(uuid, integer) from public, anon;
grant execute on function public.business_cert(uuid), public.cert_settings_save(uuid, jsonb, integer),
                          public.cert_take(uuid), public.cert_seen(uuid, integer) to authenticated;
-- ================================================================ end V170

-- ================================================================ self-checks
drop table if exists pg_temp._v170_result;
create temp table _v170_result (n int, check_name text, result text);
insert into _v170_result
select 1, 'the business certificate table is closed to the app (functions only)',
  case when (select c.relrowsecurity from pg_class c where c.oid = 'public.cert_settings'::regclass)
        and not has_table_privilege('authenticated', 'public.cert_settings', 'select')
        and not has_table_privilege('authenticated', 'public.cert_settings', 'update')
        and not has_table_privilege('anon', 'public.cert_settings', 'select')
       then 'PASS' else 'FAIL' end
union all
select 2, 'signed-in people may call the four certificate functions; nobody signed out',
  case when has_function_privilege('authenticated', 'public.business_cert(uuid)', 'execute')
        and has_function_privilege('authenticated', 'public.cert_settings_save(uuid, jsonb, integer)', 'execute')
        and has_function_privilege('authenticated', 'public.cert_take(uuid)', 'execute')
        and has_function_privilege('authenticated', 'public.cert_seen(uuid, integer)', 'execute')
        and not has_function_privilege('anon', 'public.business_cert(uuid)', 'execute')
        and not has_function_privilege('anon', 'public.cert_take(uuid)', 'execute')
       then 'PASS' else 'FAIL' end
union all
select 3, 'the row-maker is not callable from the app',
  case when not has_function_privilege('authenticated', 'public._cert_row(uuid)', 'execute')
        and not has_function_privilege('anon', 'public._cert_row(uuid)', 'execute')
       then 'PASS' else 'FAIL' end
union all
select 4, 'every certificate function runs with a fixed, empty search path',
  case when (select bool_and(p.prosecdef and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=""%')
             from pg_proc p where p.pronamespace = 'public'::regnamespace
               and p.proname in ('_cert_row','business_cert','cert_settings_save','cert_take','cert_seen'))
       then 'PASS' else 'FAIL' end
union all
select 5, 'a closed business takes its certificate row with it',
  case when exists (select 1 from pg_constraint where conrelid = 'public.cert_settings'::regclass
                    and contype = 'f' and confdeltype = 'c')
       then 'PASS' else 'FAIL' end;
select 'F' || n as check, check_name, result from _v170_result order by n;
