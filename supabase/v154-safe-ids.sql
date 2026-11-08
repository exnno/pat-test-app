-- PATGo cloud — V154: the database refuses ids and pictures PATGo never makes
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on an existing project, AFTER the V154 app files are up: Dashboard →
-- SQL Editor → New query → paste this whole file → Run. Safe to run again. A new
-- project gets the same from schema.sql.
--
-- V154 (audit finding 3 — Peter, 8 Nov: 4A). A job's id, an item's id, the
-- company logo and the signature go into the page. PATGo only ever makes ids of
-- letters, digits and hyphens (or underscores), and only ever saves the logo and
-- signature as a PNG picture (data:image/png;base64,…). From V154 the phone
-- refuses anything else on the way in; this makes the cloud refuse it too, from
-- ANY phone or anything else talking to the database — so once Teams exists, a
-- teammate's job can't carry script onto your screen, whatever app wrote it.
--   • sessions: the job's id and every item's id (an item may have no id)
--   • records: the report settings' and each report template's logo and
--     signature ('' = none)
-- The pattern is the SAME as the app's (utils.js safeId / safePicture) —
-- change one, change both.
--
-- ⚠ It first checks every row already in the cloud. If any fails, it ADDS
-- NOTHING and the table below lists them (an account's email and the job's id).
-- Nothing is changed or deleted. Such a row can only come from a tampered backup
-- restored before V154; open PATGo V154 signed in as that account — a bad logo is
-- dropped and the next sync sends the clean copy; a bad job is never synced
-- again, and can be deleted on the phone — then run this file again.
--
-- The result is a short table of checks. Every row must say PASS (V4 says
-- INCONCLUSIVE on a project with no accounts). Then run
-- supabase/isolation-test.sql as usual.

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

-- ------------------------------------------------- self-checks
drop table if exists pg_temp._v154_result;
create temp table _v154_result (n int, check_name text, result text);

do $v154c$
declare
  res text[] := '{}';
  u uuid; k int := 0; msg text; nbad int;
begin
  -- V1: the patterns say yes to everything PATGo makes, no to the rest.
  res := res || array['V1|the patterns: PATGo''s ids and pictures pass, nothing else|'
    || case when public.patgo_safe_id('mh2x0k3abcd1')                                   -- uid()
             and public.patgo_safe_id('0f8b6c1e-2d3a-4b5c-9d8e-7f6a5b4c3d2e')            -- newId()
             and public.patgo_safe_id('tutorial-0f8b6c1e-2d3a-4b5c-9d8e-7f6a5b4c3d2e')   -- a practice job
             and not public.patgo_safe_id('x" onmouseover="alert(1)')
             and not public.patgo_safe_id('<img src=x>')
             and not public.patgo_safe_id('a b')
             and not public.patgo_safe_id('')
             and not public.patgo_safe_id('__proto__')
             and public.patgo_job_ok('job1', '{"items":[{"id":"i1"},{"id":null},{"id":""},{"assetNo":"3"},{"id":17},5]}')
             and public.patgo_job_ok('job1', '{}')
             and not public.patgo_job_ok('job1', '{"items":[{"id":"i1"},{"id":"<b>"}]}')
             and not public.patgo_job_ok('job1', '{"items":[{"id":{"x":1}}]}')
             and public.patgo_record_ok('settings', '{"logo":"data:image/png;base64,iVBORw0KGgo=","signature":""}')
             and public.patgo_record_ok('settings', '{"engineer":"Pete"}')
             and public.patgo_record_ok('client', '{"logo":"anything — not a picture field"}')
             and not public.patgo_record_ok('settings', '{"logo":"x\" onerror=\"alert(1)"}')
             and not public.patgo_record_ok('settings', '{"signature":"javascript:alert(1)"}')
             and not public.patgo_record_ok('template', '{"settings":{"logo":"data:image/svg+xml;base64,PHN2Zz4="}}')
            then 'PASS' else 'FAIL' end];

  -- V2 / V3: every row already in the cloud passes, and the rule is on.
  select count(*) into nbad from public.sessions where not public.patgo_job_ok(id, doc);
  res := res || array['V2|jobs: every row in the cloud passes, and the database refuses a bad id|'
    || case when nbad = 0 and exists (select 1 from pg_constraint where conname = 'sessions_safe_ids' and convalidated)
            then 'PASS' else 'FAIL (' || nbad || ' row' || case when nbad = 1 then '' else 's' end || ' listed below — nothing added)' end];
  select count(*) into nbad from public.records where not public.patgo_record_ok(kind, doc);
  res := res || array['V3|pictures: every logo and signature in the cloud passes, and the database refuses a bad one|'
    || case when nbad = 0 and exists (select 1 from pg_constraint where conname = 'records_safe_pictures' and convalidated)
            then 'PASS' else 'FAIL (' || nbad || ' row' || case when nbad = 1 then '' else 's' end || ' listed below — nothing added)' end];

  -- V4: as a real account — a good job goes in, a bad id and a bad logo are refused (all undone).
  select m.user_id into u from public.memberships m where m.is_default order by m.created_at limit 1;
  if u is null then
    res := res || array['V4|an account: a good job saves; a bad id and a bad logo are refused (undone)|INCONCLUSIVE (no accounts yet)'];
  else
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      insert into public.sessions (id, user_id, doc, last_modified) values ('v154-check-good', u, '{"items":[{"id":"i1"}]}', now());
      k := k + 1;
      begin
        insert into public.sessions (id, user_id, doc, last_modified) values ('v154 check"bad', u, '{}', now());
      exception when check_violation then k := k + 10;
      end;
      begin
        insert into public.sessions (id, user_id, doc, last_modified) values ('v154-check-item', u, '{"items":[{"id":"<b>"}]}', now());
      exception when check_violation then k := k + 100;
      end;
      begin
        insert into public.records (id, user_id, kind, doc, last_modified) values ('v154-check-rec', u, 'settings', '{"logo":"javascript:x"}', now());
      exception when check_violation then k := k + 1000;
      end;
      execute 'reset role';
      raise exception 'v154-undo';
    exception when others then
      if sqlerrm <> 'v154-undo' then msg := sqlerrm; k := -1; end if;
    end;
    res := res || array['V4|an account: a good job saves; a bad id and a bad logo are refused (undone)|'
      || case when k = 1111 then 'PASS'
              when msg is null and not exists (select 1 from pg_constraint where conname = 'sessions_safe_ids')
                then 'FAIL (no rule yet — see V2 / V3)'
              else 'FAIL' || coalesce(' (' || msg || ')', ' (' || k || ')') end];
  end if;

  insert into _v154_result
  select row_number() over (), split_part(x, '|', 1) || ' ' || split_part(x, '|', 2), split_part(x, '|', 3)
  from unnest(res) as x;

  -- Any row that stopped a rule being added, by account (nothing is changed).
  insert into _v154_result
  select 100 + row_number() over (), 'job ' || s.id || ' — ' || coalesce(p.email, s.user_id::text), 'FAILS (a job or item id PATGo didn''t make)'
  from public.sessions s left join public.profiles p on p.id = s.user_id
  where not public.patgo_job_ok(s.id, s.doc)
  limit 50;
  insert into _v154_result
  select 200 + row_number() over (), r.kind || ' ' || r.id || ' — ' || coalesce(p.email, r.user_id::text), 'FAILS (a logo or signature that isn''t a picture)'
  from public.records r left join public.profiles p on p.id = r.user_id
  where not public.patgo_record_ok(r.kind, r.doc)
  limit 50;
end
$v154c$;

select check_name, result from _v154_result order by n;
