-- PATGo cloud — V166: how much is stored — your own, and a business's
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on the test project, AFTER the V166 app files are up: Dashboard → SQL
-- Editor → New query → paste this whole file → Run. Safe to run again. A new
-- project gets the same from schema.sql (its last section).
--
-- Locked 14 Nov (Peter, 1A 2A 3A 4A 5A 6A): the Cloud tab's Cloud Storage link
-- shows the figures (1A); in a business, the business's total and a line per
-- person (2A) and its biggest jobs, each opening look-only (3A) — for Owner, Team
-- leader and Office (5A). Figures only: no limit (6A), no deleting here (4A).
--
-- Nothing else changes: no table, no rule. Three functions the app may call, all
-- run with the READER's own rights (security invoker): the same row rules that
-- decide what a person may read decide what is counted — nothing more can be
-- counted than could be read. The result is a short table of checks. Every row
-- must say PASS.

-- ================================================================ V166
-- How much is stored. KEEP IN STEP with supabase/v166-storage.sql (the same, plus
-- self-checks K1–K4). Kept in step by harness 105e.
--
-- All three are SECURITY INVOKER: they add up rows the caller's own read rules
-- already let them see (V113 / V163: your own jobs in a business you're in, or
-- every job of a business you may read whole). A count, a size, and for a
-- business's biggest jobs the same few fields the business view already lists —
-- never a job's contents, never a photo.

-- Your own: every live job and photo of yours the cloud lets you read — the same
-- as Cloud Storage's own page (V108) adds up, in one small answer, for the line
-- in the Cloud tab (1A). Signed out: nothing.
create or replace function public.my_storage()
returns table (jobs integer, job_bytes bigint, photos integer, photo_bytes bigint)
language sql stable security invoker set search_path = '' as $$
  select (select count(*)::integer from public.sessions s
          where s.user_id = (select auth.uid()) and s.deleted = false),
         (select coalesce(sum(s.doc_bytes), 0)::bigint from public.sessions s
          where s.user_id = (select auth.uid()) and s.deleted = false),
         (select count(*)::integer from public.photos p
          where p.user_id = (select auth.uid()) and p.deleted = false),
         (select coalesce(sum(p.bytes), 0)::bigint from public.photos p
          where p.user_id = (select auth.uid()) and p.deleted = false)
  where (select auth.uid()) is not null
$$;
revoke all on function public.my_storage() from public, anon;
grant execute on function public.my_storage() to authenticated;

-- A business, a line per person (2A): their live jobs and photos in it, and the
-- name the latest of their jobs was logged with (a leaver is no longer a member,
-- so business_people can't name them). Only for a business the caller may read
-- whole (5A — V113's can_read_org: Owner / Team leader / Office); anyone else, an
-- Engineer included, gets no rows.
create or replace function public.business_storage(o uuid)
returns table (user_id uuid, jobs integer, job_bytes bigint, photos integer, photo_bytes bigint, engineer text)
language sql stable security invoker set search_path = '' as $$
  with j as (
    select s.user_id as u, count(*)::integer as n, coalesce(sum(s.doc_bytes), 0)::bigint as b,
           left((array_agg(nullif(btrim(s.doc->>'engineer'), '') order by s.updated_at desc)
                 filter (where nullif(btrim(s.doc->>'engineer'), '') is not null))[1], 80) as eng
    from public.sessions s
    where s.org_id = o and s.deleted = false
    group by s.user_id),
  p as (
    select ph.user_id as u, count(*)::integer as n, coalesce(sum(ph.bytes), 0)::bigint as b
    from public.photos ph
    where ph.org_id = o and ph.deleted = false
    group by ph.user_id)
  select coalesce(j.u, p.u), coalesce(j.n, 0), coalesce(j.b, 0), coalesce(p.n, 0), coalesce(p.b, 0), j.eng
  from j full join p on p.u = j.u
  where public.can_read_org(o)
  order by 1
$$;
revoke all on function public.business_storage(uuid) from public, anon;
grant execute on function public.business_storage(uuid) to authenticated;

-- A business's biggest jobs (3A): each job's size and its photos', biggest first,
-- with the fields the Cloud tab's business list already shows (V164), so a tap can
-- open it look-only. At most 50. Same rule as above: Owner / Team leader / Office.
create or replace function public.business_biggest_jobs(o uuid, lim integer default 10)
returns table (user_id uuid, id text, job_bytes bigint, photos integer, photo_bytes bigint,
               site text, name text, date text, client_id text, engineer text, locked text,
               cert_no text, items integer, fails integer)
language sql stable security invoker set search_path = '' as $$
  select s.user_id, s.id, coalesce(s.doc_bytes, 0)::bigint, pc.n, pc.b,
         s.doc->>'site', s.doc->>'name', s.doc->>'date', s.doc->>'clientId',
         left(s.doc->>'engineer', 80), s.doc->>'locked', s.doc->>'certNo', s.n_items, s.n_fails
  from public.sessions s
  cross join lateral (
    select count(*)::integer as n, coalesce(sum(ph.bytes), 0)::bigint as b
    from public.photos ph
    where ph.user_id = s.user_id and ph.session_id = s.id and ph.deleted = false) pc
  where s.org_id = o and s.deleted = false and public.can_read_org(o)
  order by coalesce(s.doc_bytes, 0) + pc.b desc, s.user_id, s.id
  limit least(greatest(coalesce(lim, 10), 1), 50)
$$;
revoke all on function public.business_biggest_jobs(uuid, integer) from public, anon;
grant execute on function public.business_biggest_jobs(uuid, integer) to authenticated;
-- ================================================================ end V166

-- ================================================================ self-checks
drop table if exists pg_temp._v166_result;
create temp table _v166_result (n int, check_name text, result text);
insert into _v166_result
select 1, 'the app may call all three; nobody signed out may',
  case when has_function_privilege('authenticated', 'public.my_storage()', 'execute')
        and has_function_privilege('authenticated', 'public.business_storage(uuid)', 'execute')
        and has_function_privilege('authenticated', 'public.business_biggest_jobs(uuid, integer)', 'execute')
        and not has_function_privilege('anon', 'public.my_storage()', 'execute')
        and not has_function_privilege('anon', 'public.business_storage(uuid)', 'execute')
        and not has_function_privilege('anon', 'public.business_biggest_jobs(uuid, integer)', 'execute')
       then 'PASS' else 'FAIL' end
union all
select 2, 'all three read with the reader''s own rights and a pinned search path',
  case when (select count(*) from pg_proc
             where oid in ('public.my_storage()'::regprocedure, 'public.business_storage(uuid)'::regprocedure,
                           'public.business_biggest_jobs(uuid, integer)'::regprocedure)
               and not prosecdef and proconfig @> array['search_path=""']) = 3
       then 'PASS' else 'FAIL' end
union all
select 3, 'a business''s figures only for those who may read it whole',
  case when (select prosrc from pg_proc where oid = 'public.business_storage(uuid)'::regprocedure)
            like '%where public.can_read_org(o)%'
        and (select prosrc from pg_proc where oid = 'public.business_biggest_jobs(uuid, integer)'::regprocedure)
            like '%and public.can_read_org(o)%'
       then 'PASS' else 'FAIL' end
union all
select 4, 'with nobody signed in they answer nothing',
  case when (select count(*) from public.my_storage()) = 0
        and (select count(*) from public.business_storage(gen_random_uuid())) = 0
        and (select count(*) from public.business_biggest_jobs(gen_random_uuid())) = 0
       then 'PASS' else 'FAIL' end;

select n as "#", check_name as "check", result from _v166_result order by n;
