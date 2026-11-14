-- PATGo cloud — V167: Office corrections — fixing a mistake in someone else's job
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on the test project, AFTER the V167 app files are up: Dashboard → SQL
-- Editor → New query → paste this whole file → Run. Safe to run again. A new
-- project gets the same from schema.sql (its last section).
--
-- Locked 14 Nov (Peter, 1A 2C 3A 4A 5A 6A 7A 8A): the Owner, a Team leader or the
-- Office (1A) may correct another person's job — its name and site, and on each
-- item the asset number, description, location, notes, the result and the
-- readings (2C) — only once the job is locked (3A). Each change is kept in the
-- job: who, when, old → new (5A); a result or a reading needs a reason (7A). A
-- job whose certificate was made before the correction says so, to be made again
-- (4A / 8A — the job's `correctedAt` is later than its `reportAt`).
--
-- Nothing else changes: no table, no rule. ONE function, and it is the only way
-- anybody changes a job that isn't theirs: "change own" (V113) still lets each
-- person write only their own rows. The function checks everything itself
-- before it writes. The result is a short table of checks. Every row must say PASS.

-- ================================================================ V167
-- Office corrections. KEEP IN STEP with supabase/v167-corrections.sql (the same,
-- plus self-checks C1–C5). Kept in step by harness 106e.
--
-- correct_job(holder, job, org, changes, reason) — SECURITY DEFINER, because it
-- writes a row the caller doesn't hold; so everything is checked here, in this
-- order, and anything it can't fully check is refused (raise — nothing written):
--   patgo_correct_signed_out   nobody signed in
--   patgo_correct_bad          changes isn't a list of 1–100 {item?, field, from, to}
--                              of the right kinds, or a value out of range
--   patgo_correct_gone         no such job, or deleted
--   patgo_correct_moved        the job is no longer in the business the caller was looking at
--   patgo_correct_own          your own job — edited on your phone, as always
--   patgo_correct_not_allowed  not Owner / Team leader / Office of the JOB's business (1A)
--   patgo_correct_unlocked     the job isn't locked (3A)
--   patgo_correct_field        a field outside 2C's list
--   patgo_correct_changed      a `from` that no longer matches the job, or an item
--                              no longer in it — someone changed it since it was read
--   patgo_correct_nothing      every change was already so
--   patgo_correct_reason       a result or reading changed without a reason (7A), or
--                              a reason over 300 characters
-- The job's plan (V127 plan_guard) still decides whether the cloud takes changes.
-- The write blanks the fingerprint (V92 sessions_fp_guard), so every phone that
-- holds the job downloads it; a phone with no changes of its own takes it
-- quietly, one with changes is asked (V81 "both changed").
create or replace function public.correct_job(holder uuid, job text, org uuid, changes jsonb, reason text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  s record;
  d jsonb;
  its jsonb;
  c jsonb;
  f text; iid text; k text; idx integer; lim integer;
  cur jsonb; cur_t text; to_v jsonb; to_t text; was jsonb;
  done jsonb := '[]'::jsonb;
  needs boolean := false;
  why text := nullif(btrim(coalesce(reason, '')), '');
  nm text; rl text; stamp text;
begin
  if me is null then raise exception 'patgo_correct_signed_out'; end if;
  if holder is null or job is null or jsonb_typeof(changes) is distinct from 'array'
     or jsonb_array_length(changes) < 1 or jsonb_array_length(changes) > 100 then
    raise exception 'patgo_correct_bad';
  end if;
  select x.* into s from public.sessions x where x.user_id = holder and x.id = job for update;
  if not found or s.deleted then raise exception 'patgo_correct_gone'; end if;
  if org is not null and s.org_id is distinct from org then raise exception 'patgo_correct_moved'; end if;
  if holder = me then raise exception 'patgo_correct_own'; end if;
  if not public.can_read_org(s.org_id) then raise exception 'patgo_correct_not_allowed'; end if;
  d := s.doc;
  if jsonb_typeof(d) is distinct from 'object' or (d -> 'locked') is distinct from 'true'::jsonb then
    raise exception 'patgo_correct_unlocked';
  end if;
  its := case when jsonb_typeof(d -> 'items') = 'array' then d -> 'items' else '[]'::jsonb end;

  for c in select e from jsonb_array_elements(changes) e loop
    if jsonb_typeof(c) is distinct from 'object' or jsonb_typeof(c -> 'field') is distinct from 'string'
       or (c ? 'item' and jsonb_typeof(c -> 'item') not in ('string', 'null')) then
      raise exception 'patgo_correct_bad';
    end if;
    f := c ->> 'field';
    iid := c ->> 'item';
    to_v := c -> 'to';
    k := null; idx := null;
    -- 2C: which fields, and how long a value may be.
    if iid is null then
      if f not in ('name', 'site') then raise exception 'patgo_correct_field'; end if;
      cur := d -> f; lim := 200;
    else
      if f in ('assetNo', 'location', 'itemType', 'result') then lim := 200;
      elsif f = 'notes' then lim := 1000;
      elsif f in ('readings.class', 'readings.earth', 'readings.insulation', 'readings.leakage', 'readings.polarity') then
        k := substr(f, 10); lim := 40;
      else raise exception 'patgo_correct_field';
      end if;
      select (e.o - 1)::integer into idx
        from jsonb_array_elements(its) with ordinality e(v, o)
        where jsonb_typeof(e.v) = 'object' and e.v ->> 'id' = iid
        order by e.o limit 1;
      if idx is null then raise exception 'patgo_correct_changed'; end if;
      cur := case when k is null then its -> idx -> f else its -> idx -> 'readings' -> k end;
    end if;
    -- The value now must be the value the caller saw (`from`); then the new one.
    if k = 'polarity' then
      if jsonb_typeof(to_v) is distinct from 'boolean' then raise exception 'patgo_correct_bad'; end if;
      if coalesce(cur = 'true'::jsonb, false) is distinct from coalesce(c -> 'from' = 'true'::jsonb, false) then
        raise exception 'patgo_correct_changed';
      end if;
      if coalesce(cur = 'true'::jsonb, false) = (to_v = 'true'::jsonb) then continue; end if;
      was := to_jsonb(coalesce(cur = 'true'::jsonb, false));
    else
      if jsonb_typeof(to_v) is distinct from 'string' then raise exception 'patgo_correct_bad'; end if;
      cur_t := case when jsonb_typeof(cur) in ('string', 'number') then cur #>> '{}' else '' end;
      if cur_t is distinct from coalesce(case when jsonb_typeof(c -> 'from') in ('string', 'number') then c ->> 'from' end, '') then
        raise exception 'patgo_correct_changed';
      end if;
      to_t := to_v #>> '{}';
      if length(to_t) > lim then raise exception 'patgo_correct_bad'; end if;
      if f = 'result' and to_t not in ('pass', 'fail') then raise exception 'patgo_correct_bad'; end if;
      if k = 'class' and to_t not in ('', 'I', 'II', 'III') then raise exception 'patgo_correct_bad'; end if;
      if to_t = cur_t then continue; end if;
      was := to_jsonb(cur_t);
    end if;
    -- The trail names the item by its asset number as it was.
    done := done || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'item', iid, 'asset', case when idx is not null then its -> idx ->> 'assetNo' end,
      'field', f, 'from', was, 'to', to_v)));
    if iid is null then
      d := jsonb_set(d, array[f], to_v);
    elsif k is null then
      its := jsonb_set(its, array[idx::text, f], to_v);
      if f = 'result' then needs := true; end if;
    else
      needs := true;
      if jsonb_typeof(its -> idx -> 'readings') is distinct from 'object' then
        its := jsonb_set(its, array[idx::text, 'readings'], '{}'::jsonb);
      end if;
      -- An emptied reading, or polarity un-ticked, is left out — as the phone stores it.
      if to_v = 'false'::jsonb or to_v = '""'::jsonb then
        its := its #- array[idx::text, 'readings', k];
      else
        its := jsonb_set(its, array[idx::text, 'readings', k], to_v);
      end if;
    end if;
  end loop;

  if jsonb_array_length(done) = 0 then raise exception 'patgo_correct_nothing'; end if;
  if (needs and why is null) or length(coalesce(why, '')) > 300 then raise exception 'patgo_correct_reason'; end if;

  select coalesce(nullif(btrim(m.name), ''), split_part(u.email, '@', 1), 'Someone'), m.role
    into nm, rl
    from public.memberships m join auth.users u on u.id = m.user_id
    where m.org_id = s.org_id and m.user_id = me;
  stamp := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  if jsonb_typeof(d -> 'items') = 'array' then d := jsonb_set(d, '{items}', its); end if;
  d := d || jsonb_build_object('correctedAt', stamp,
    'corrections', (case when jsonb_typeof(d -> 'corrections') = 'array' then d -> 'corrections' else '[]'::jsonb end)
      || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
           'at', stamp, 'by', me, 'name', left(nm, 80), 'role', rl, 'reason', why, 'changes', done))));
  -- A CSV made before the correction no longer matches (V14's "modified since export").
  if coalesce(d ->> 'exportedAt', '') <> '' then d := d || '{"exportDirty": true}'::jsonb; end if;
  update public.sessions x set doc = d, last_modified = now() where x.user_id = holder and x.id = job;
  return jsonb_build_object('at', stamp, 'doc', d);
end;
$$;
revoke all on function public.correct_job(uuid, text, uuid, jsonb, text) from public, anon;
grant execute on function public.correct_job(uuid, text, uuid, jsonb, text) to authenticated;
-- ================================================================ end V167

-- ================================================================ self-checks
drop table if exists pg_temp._v167_result;
create temp table _v167_result (n int, check_name text, result text);
insert into _v167_result
select 1, 'the app may call it; nobody signed out may',
  case when has_function_privilege('authenticated', 'public.correct_job(uuid, text, uuid, jsonb, text)', 'execute')
        and not has_function_privilege('anon', 'public.correct_job(uuid, text, uuid, jsonb, text)', 'execute')
       then 'PASS' else 'FAIL' end
union all
select 2, 'it runs with its own rights and a pinned search path',
  case when (select prosecdef and proconfig @> array['search_path=""'] from pg_proc
             where oid = 'public.correct_job(uuid, text, uuid, jsonb, text)'::regprocedure)
       then 'PASS' else 'FAIL' end
union all
select 3, 'only the Owner, a Team leader or the Office of the job''s business; never your own; locked only',
  case when (select prosrc from pg_proc where oid = 'public.correct_job(uuid, text, uuid, jsonb, text)'::regprocedure)
            like '%if not public.can_read_org(s.org_id) then raise exception ''patgo_correct_not_allowed''%'
        and (select prosrc from pg_proc where oid = 'public.correct_job(uuid, text, uuid, jsonb, text)'::regprocedure)
            like '%if holder = me then raise exception ''patgo_correct_own''%'
        and (select prosrc from pg_proc where oid = 'public.correct_job(uuid, text, uuid, jsonb, text)'::regprocedure)
            like '%(d -> ''locked'') is distinct from ''true''::jsonb%'
       then 'PASS' else 'FAIL' end
union all
select 4, 'with nobody signed in it changes nothing', 'PASS'   -- proved below (the do block)
union all
select 5, '"change own" still lets each person write only their own jobs',
  case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sessions'
                    and policyname = 'change own sessions' and qual like '%user_id = ( SELECT auth.uid()%')
       then 'PASS' else 'FAIL' end;

-- C4, properly: called with nobody signed in, it refuses before reading anything.
do $c4$
begin
  perform public.correct_job(gen_random_uuid(), 'x', null, '[{"field":"site","from":"","to":"y"}]'::jsonb, null);
  update _v167_result set result = 'FAIL' where n = 4;
exception when others then
  if sqlerrm <> 'patgo_correct_signed_out' then update _v167_result set result = 'FAIL' where n = 4; end if;
end
$c4$;

select n as "#", check_name as "check", result from _v167_result order by n;
