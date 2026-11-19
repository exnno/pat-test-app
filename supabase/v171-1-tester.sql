-- PATGo cloud — V171.1: the tester for a job locked before V170 that is only in the cloud
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on the test project, AFTER the V171.1 app files are up: Dashboard → SQL
-- Editor → New query → paste this whole file → Run. Safe to run again. A new
-- project gets the same from schema.sql (its last section).
--
-- Peter's live test (19 Nov): a job locked before V170 and held only in the cloud
-- had no tester copy, and "let their phone connect" changed nothing — V170 makes the
-- copy at app start only for jobs ON that phone. Bringing the job down just for that
-- isn't wanted. So the cloud makes the copy itself, from the engineer's own saved
-- instruments, exactly as their phone would have (instruments.js testerFreeze): the
-- job's own instrument, else its saved snapshot of it, else the tester they have in
-- use. ONE function. The result is a short table of checks. Every row must say PASS.

-- ================================================================ V171.1
-- The tester for a cloud-only job. KEEP IN STEP with supabase/v171-1-tester.sql (the
-- same, plus self-checks H1–H5). Kept in step by harness 113.
--
-- cert_tester(holder, job, org) — SECURITY DEFINER (it reads and writes what the
-- caller may not hold), checks as cert_stamp (V171) and raises, writing nothing:
--   patgo_certtester_signed_out / _bad / _gone / _moved / _not_allowed / _unlocked
--   (the same meanings), and _none: the engineer has no instrument saved to the
--   cloud that it could be (nothing to copy).
-- A job that already has its copy is returned as it is (never changed — V170 6A).
-- Otherwise: the instrument the job names (doc.instrumentId, the holder's live
-- 'instrument' record) → else the job's own instrumentSnapshot → else the holder's
-- tester in use ('settings_instrument' → its instrument) → else their only
-- instrument. ⚠ Never the caller's. The copy carries `at` = the job's lockedAt (as
-- the phone's start-up copy does), and `from` says which it was.
-- The write blanks the fingerprint (V92), so the holder's phones take it quietly.
create or replace function public.cert_tester(holder uuid, job text, org uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  s record;
  d jsonb;
  inst jsonb;
  src text;
  iid text;
  n int;
begin
  if me is null then raise exception 'patgo_certtester_signed_out'; end if;
  if holder is null or job is null then raise exception 'patgo_certtester_bad'; end if;
  select x.* into s from public.sessions x where x.user_id = holder and x.id = job for update;
  if not found or s.deleted then raise exception 'patgo_certtester_gone'; end if;
  if org is not null and s.org_id is distinct from org then raise exception 'patgo_certtester_moved'; end if;
  if s.org_id is null or coalesce(public.my_role(s.org_id), '') not in ('owner','team_leader','office') then
    raise exception 'patgo_certtester_not_allowed';
  end if;
  d := s.doc;
  if jsonb_typeof(d) is distinct from 'object' or (d -> 'locked') is distinct from 'true'::jsonb then
    raise exception 'patgo_certtester_unlocked';
  end if;
  if jsonb_typeof(d -> 'tester') = 'object' then
    return jsonb_build_object('doc', d, 'from', 'job');
  end if;
  iid := case when jsonb_typeof(d -> 'instrumentId') = 'string' then nullif(d ->> 'instrumentId', '') end;
  if iid is not null then
    select r.doc into inst from public.records r
      where r.user_id = holder and r.kind = 'instrument' and r.id = iid and not r.deleted;
    if inst is not null then src := 'instrument'; end if;
    if inst is null and jsonb_typeof(d -> 'instrumentSnapshot') = 'object' then
      inst := d -> 'instrumentSnapshot'; src := 'snapshot';
    end if;
  else
    select r.doc ->> 'instrumentId' into iid from public.records r
      where r.user_id = holder and r.kind = 'settings' and r.id = 'settings_instrument' and not r.deleted;
    if nullif(iid, '') is not null then
      select r.doc into inst from public.records r
        where r.user_id = holder and r.kind = 'instrument' and r.id = iid and not r.deleted;
      if inst is not null then src := 'in use'; end if;
    end if;
    if inst is null then
      select count(*) into n from public.records r where r.user_id = holder and r.kind = 'instrument' and not r.deleted;
      if n = 1 then
        select r.doc into inst from public.records r where r.user_id = holder and r.kind = 'instrument' and not r.deleted;
        src := 'only';
      end if;
    end if;
  end if;
  if jsonb_typeof(inst) is distinct from 'object' then raise exception 'patgo_certtester_none'; end if;
  d := d || jsonb_build_object('tester', jsonb_build_object(
    'make',      case when jsonb_typeof(inst -> 'make') = 'string' then left(inst ->> 'make', 200) else '' end,
    'model',     case when jsonb_typeof(inst -> 'model') = 'string' then left(inst ->> 'model', 200) else '' end,
    'calDate',   case when jsonb_typeof(inst -> 'calDate') = 'string' then left(inst ->> 'calDate', 40) else '' end,
    'calCertNo', case when jsonb_typeof(inst -> 'calCertNo') = 'string' then left(inst ->> 'calCertNo', 200) else '' end,
    'calDue',    case when jsonb_typeof(inst -> 'calDue') = 'string' then left(inst ->> 'calDue', 40) else '' end,
    'at',        case when jsonb_typeof(d -> 'lockedAt') = 'string' then d ->> 'lockedAt'
                      else to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end));
  update public.sessions x set doc = d, last_modified = now() where x.user_id = holder and x.id = job;
  return jsonb_build_object('doc', d, 'from', src);
end;
$$;
revoke all on function public.cert_tester(uuid, text, uuid) from public, anon;
grant execute on function public.cert_tester(uuid, text, uuid) to authenticated;
-- ================================================================ end V171.1

-- ================================================================ self-checks
drop table if exists pg_temp._v1711_result;
create temp table _v1711_result (n int, check_name text, result text);
insert into _v1711_result
select 1, 'the app may call it; nobody signed out may',
  case when has_function_privilege('authenticated', 'public.cert_tester(uuid, text, uuid)', 'execute')
        and not has_function_privilege('anon', 'public.cert_tester(uuid, text, uuid)', 'execute')
       then 'PASS' else 'FAIL' end
union all
select 2, 'it runs with its own rights and a pinned search path',
  case when (select prosecdef and proconfig @> array['search_path=""'] from pg_proc
             where oid = 'public.cert_tester(uuid, text, uuid)'::regprocedure)
       then 'PASS' else 'FAIL' end
union all
select 3, 'only the Owner, a Team leader or the Office of the job''s business; locked only',
  case when (select prosrc from pg_proc where oid = 'public.cert_tester(uuid, text, uuid)'::regprocedure)
            like '%coalesce(public.my_role(s.org_id), '''') not in (''owner'',''team_leader'',''office'')%'
        and (select prosrc from pg_proc where oid = 'public.cert_tester(uuid, text, uuid)'::regprocedure)
            like '%(d -> ''locked'') is distinct from ''true''::jsonb%'
       then 'PASS' else 'FAIL' end
union all
select 4, 'with nobody signed in it changes nothing', 'PASS'   -- proved below (the do block)
union all
select 5, 'V171''s cert_stamp is in (run v171-office-certs.sql first)',
  case when to_regprocedure('public.cert_stamp(uuid, text, uuid, text, boolean)') is not null then 'PASS' else 'FAIL' end;

do $h4$
begin
  perform public.cert_tester(gen_random_uuid(), 'x', null);
  update _v1711_result set result = 'FAIL' where n = 4;
exception when others then
  if sqlerrm <> 'patgo_certtester_signed_out' then update _v1711_result set result = 'FAIL' where n = 4; end if;
end
$h4$;

select 'H' || n as check, check_name, result from _v1711_result order by n;
