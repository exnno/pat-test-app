-- PATGo cloud — V165: which of my businesses hold someone else's jobs
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on the test project, AFTER the V165 app files are up: Dashboard → SQL
-- Editor → New query → paste this whole file → Run. Safe to run again. A new
-- project gets the same from schema.sql (its last section).
--
-- Locked 14 Nov (Peter, 1A): the Cloud tab's "Showing" picker offers a business
-- whenever it holds anyone else's jobs — even with one member left (someone
-- removed, their jobs kept). A business that is only ever yours stays without it.
--
-- Nothing else changes: no table, no rule. One function the app may call.
-- The result is a short table of checks. Every row must say PASS.

-- ================================================================ V165
-- Which of my businesses hold someone else's jobs. KEEP IN STEP with
-- supabase/v165-business-jobs.sql (the same, plus self-checks J1–J3). Kept in
-- step by harness 104e.
--
-- V164's business view offered a business only while it had two or more members.
-- Found in Peter's live test (14 Nov): remove the only other person and the
-- business has one member but still holds their jobs — and the Owner had no way
-- to see them. The phone can't tell that from the member count, so the cloud
-- says it: for each business the caller may read whole (Owner / Team leader /
-- Office — V113's can_read_org), whether it holds a job that isn't the caller's
-- own. A yes or no only — no job, no person, no count. An Engineer gets no row.
create or replace function public.business_others_jobs()
returns table (business_id uuid, others boolean)
language sql stable security definer set search_path = '' as $$
  select m.org_id,
         exists (select 1 from public.sessions s
                 where s.org_id = m.org_id
                   and s.user_id <> (select auth.uid())
                   and s.deleted = false)
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.role in ('owner', 'team_leader', 'office')
$$;
revoke all on function public.business_others_jobs() from public, anon;
grant execute on function public.business_others_jobs() to authenticated;
-- ================================================================ end V165

-- ================================================================ self-checks
drop table if exists pg_temp._v165_result;
create temp table _v165_result (n int, check_name text, result text);
insert into _v165_result
select 1, 'the app may call business_others_jobs; nobody signed out may',
  case when has_function_privilege('authenticated', 'public.business_others_jobs()', 'execute')
        and not has_function_privilege('anon', 'public.business_others_jobs()', 'execute')
       then 'PASS' else 'FAIL' end
union all
select 2, 'it answers only for businesses the caller may read whole',
  case when (select prosrc from pg_proc where oid = 'public.business_others_jobs()'::regprocedure)
            like '%m.role in (''owner'', ''team_leader'', ''office'')%'
        and (select prosrc from pg_proc where oid = 'public.business_others_jobs()'::regprocedure)
            like '%m.user_id = (select auth.uid())%'
       then 'PASS' else 'FAIL' end
union all
select 3, 'with nobody signed in it answers nothing',
  case when (select count(*) from public.business_others_jobs()) = 0 then 'PASS' else 'FAIL' end;

select n as "#", check_name as "check", result from _v165_result order by n;
