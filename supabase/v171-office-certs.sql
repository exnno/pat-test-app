-- PATGo cloud — V171: Office makes the certificate for a job held only in the cloud
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on the test project, AFTER the V171 app files are up: Dashboard → SQL
-- Editor → New query → paste this whole file → Run. Safe to run again. A new
-- project gets the same from schema.sql (its last section).
--
-- Locked 19 Nov (Peter — "1A 2A 3A 4A 5A 6B 7B", then "8 A B C"): the Owner, a
-- Team leader or the Office of a job's business makes its certificate from the
-- cloud — someone else's job, or their own held only in the cloud (1A); only once
-- it is locked (2A); the signature is the business's (3A); its photos come down
-- for that certificate only (4A); the engineer's phone is told who made it and
-- when (5A).
--
-- Nothing else changes: no table, no rule. ONE function. The number itself still
-- comes from cert_take (V170) — or, for a business of one, from the phone's own
-- counter (V170 8A) — and this writes it onto the job, which the person holding it
-- may not be. The function checks everything itself before it writes. The result
-- is a short table of checks. Every row must say PASS.

-- ================================================================ V171
-- Office makes the certificate. KEEP IN STEP with supabase/v171-office-certs.sql
-- (the same, plus self-checks G1–G5). Kept in step by harness 112.
--
-- cert_stamp(holder, job, org, cert, made) — SECURITY DEFINER, because it writes
-- a job the caller may not hold; so everything is checked here, in this order, and
-- anything it can't fully check is refused (raise — nothing written):
--   patgo_certstamp_signed_out   nobody signed in
--   patgo_certstamp_bad          no job named; a number that isn't 1–60 printable
--                                characters; neither a number nor "made"
--   patgo_certstamp_gone         no such job, or deleted
--   patgo_certstamp_moved        the job is no longer in the business the caller was looking at
--   patgo_certstamp_not_allowed  not Owner / Team leader / Office of the JOB's business
--                                (V170 5C — the same roles that take a number)
--   patgo_certstamp_unlocked     the job isn't locked (2A)
-- cert: the number to give the job (from cert_take, formatted on the phone). ⚠ A
-- job that already has a number KEEPS it (V170 assign-once): the answer carries
-- the job's own number, which is the one to print — so two people making the same
-- job's certificate at once print the same number (the second's take is unused).
-- made: the certificate has left the caller's device (Download or Share — V100
-- 2B): the job's reportAt is stamped, which clears "make it again" after a
-- correction (V167 4A) and the engineer's not-exported reminder, and certMade
-- says who made it (5A — shown on the engineer's Overview). A business with
-- certificate numbers switched off makes certificates with no number: "made"
-- alone is then the whole call, and certMade's `no` is null.
-- The job's plan (V127 plan_guard) still decides whether the cloud takes changes.
-- The write blanks the fingerprint (V92 sessions_fp_guard), so the holder's
-- phones download it at their next sync.
create or replace function public.cert_stamp(holder uuid, job text, org uuid, cert text default null, made boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  s record;
  d jsonb;
  have text;
  no text := nullif(btrim(coalesce(cert, '')), '');
  nm text; rl text; stamp text;
  changed boolean := false;
begin
  if me is null then raise exception 'patgo_certstamp_signed_out'; end if;
  if holder is null or job is null or (no is null and made is not true)
     or (no is not null and no !~ '^[^[:cntrl:]]{1,60}$') then
    raise exception 'patgo_certstamp_bad';
  end if;
  select x.* into s from public.sessions x where x.user_id = holder and x.id = job for update;
  if not found or s.deleted then raise exception 'patgo_certstamp_gone'; end if;
  if org is not null and s.org_id is distinct from org then raise exception 'patgo_certstamp_moved'; end if;
  if s.org_id is null or coalesce(public.my_role(s.org_id), '') not in ('owner','team_leader','office') then
    raise exception 'patgo_certstamp_not_allowed';
  end if;
  d := s.doc;
  if jsonb_typeof(d) is distinct from 'object' or (d -> 'locked') is distinct from 'true'::jsonb then
    raise exception 'patgo_certstamp_unlocked';
  end if;
  have := case when jsonb_typeof(d -> 'certNo') = 'string' then nullif(btrim(d ->> 'certNo'), '') end;
  if have is null and no is not null then
    d := d || jsonb_build_object('certNo', no);
    have := no;
    changed := true;
  end if;
  if made is true then
    select coalesce(nullif(btrim(m.name), ''), split_part(u.email, '@', 1), 'Someone'), m.role
      into nm, rl
      from public.memberships m join auth.users u on u.id = m.user_id
      where m.org_id = s.org_id and m.user_id = me;
    stamp := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    d := d || jsonb_build_object('reportAt', stamp,
      'certMade', jsonb_build_object('at', stamp, 'by', me, 'name', left(coalesce(nm, 'Someone'), 80),
                                     'role', rl, 'no', have));
    changed := true;
  end if;
  if changed then
    update public.sessions x set doc = d, last_modified = now() where x.user_id = holder and x.id = job;
  end if;
  return jsonb_build_object('certNo', have, 'at', stamp, 'doc', d);
end;
$$;
revoke all on function public.cert_stamp(uuid, text, uuid, text, boolean) from public, anon;
grant execute on function public.cert_stamp(uuid, text, uuid, text, boolean) to authenticated;
-- ================================================================ end V171

-- ================================================================ self-checks
drop table if exists pg_temp._v171_result;
create temp table _v171_result (n int, check_name text, result text);
insert into _v171_result
select 1, 'the app may call it; nobody signed out may',
  case when has_function_privilege('authenticated', 'public.cert_stamp(uuid, text, uuid, text, boolean)', 'execute')
        and not has_function_privilege('anon', 'public.cert_stamp(uuid, text, uuid, text, boolean)', 'execute')
       then 'PASS' else 'FAIL' end
union all
select 2, 'it runs with its own rights and a pinned search path',
  case when (select prosecdef and proconfig @> array['search_path=""'] from pg_proc
             where oid = 'public.cert_stamp(uuid, text, uuid, text, boolean)'::regprocedure)
       then 'PASS' else 'FAIL' end
union all
select 3, 'only the Owner, a Team leader or the Office of the job''s business; locked only',
  case when (select prosrc from pg_proc where oid = 'public.cert_stamp(uuid, text, uuid, text, boolean)'::regprocedure)
            like '%coalesce(public.my_role(s.org_id), '''') not in (''owner'',''team_leader'',''office'')%'
        and (select prosrc from pg_proc where oid = 'public.cert_stamp(uuid, text, uuid, text, boolean)'::regprocedure)
            like '%(d -> ''locked'') is distinct from ''true''::jsonb%'
       then 'PASS' else 'FAIL' end
union all
select 4, 'with nobody signed in it changes nothing', 'PASS'   -- proved below (the do block)
union all
select 5, 'the V170 number-taker is in (the number comes from it)',
  case when to_regprocedure('public.cert_take(uuid)') is not null then 'PASS' else 'FAIL' end;

-- G4, properly: called with nobody signed in, it refuses before reading anything.
do $g4$
begin
  perform public.cert_stamp(gen_random_uuid(), 'x', null, 'X-1', false);
  update _v171_result set result = 'FAIL' where n = 4;
exception when others then
  if sqlerrm <> 'patgo_certstamp_signed_out' then update _v171_result set result = 'FAIL' where n = 4; end if;
end
$g4$;

select 'G' || n as check, check_name, result from _v171_result order by n;
