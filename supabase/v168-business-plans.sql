-- PATGo cloud — V168: each business on its own plan (the per-business lock) + photo files by their job's business
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on the test project, AFTER the V168 app files are up: Dashboard → SQL
-- Editor → New query → paste this whole file → Run. Safe to run again. A new
-- project gets the same from schema.sql (its last section).
--
-- Locked 14 Nov (Peter, 0B 5A 6A): a job follows ITS business's plan — a
-- member's own lapsed business locks only its own jobs, and a paid team's jobs
-- carry on. The phone learns each business's plan from one new read
-- (my_business_plans). And the second audit's finding 5: a photo FILE was judged
-- by the person's MAIN business, so a member whose own business had lapsed had
-- the team's photos refused too — now judged by the photo's own job.
--
-- ⚠ Re-running supabase/v143-enforcement.sql (or anything older that makes the photo-file
-- rules) puts the old main-business rule back — run this file again after it.
--
-- Nothing else changes: no table, no row changes shape; jobs, settings and photo
-- rows are still judged by plan_guard (V143), each by its own business. The
-- result is a short table of checks. Every row must say PASS.

-- ================================================================ V168
-- Each business on its own plan (the per-business lock — Peter, 11 Nov; round
-- 14 Nov 0B 5A 6A) and the second audit's finding 5. KEEP IN STEP with
-- supabase/v168-business-plans.sql (the same, plus self-checks D1–D5). Kept in
-- step by harness 108e.
--
-- my_business_plans() — the plan of every business the caller belongs to, so the
-- phone can lock only the jobs of a business whose plan has ended (each job
-- follows ITS business — a paid seat in a team never unlocks a member's own
-- lapsed business, and the member's own lapse never locks the team's jobs). The
-- cover (V155, plan_cover) is unchanged: it still decides what the person as a
-- whole sees (the 30-day check, the account line).
create or replace function public.my_business_plans()
returns table (id uuid, plan text, trial_ends_at timestamptz, lapsed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.id, o.plan, o.trial_ends_at, o.lapsed_at
  from public.memberships m
  join public.organisations o on o.id = m.org_id
  where m.user_id = auth.uid()
  order by m.is_default desc, o.created_at, o.id
$$;
revoke all on function public.my_business_plans() from public, anon;
grant execute on function public.my_business_plans() to authenticated;

-- Photo files (finding 5): judged by the JOB's business, not the person's main
-- one. The file goes up before its photo row (v89: photo, preview, then the
-- row), so:
--   • a file whose photo row exists (a re-send, a preview after its photo) →
--     that row's business may upload;
--   • a new file → any business of the person may upload. Its ROW is what puts
--     the photo into a job, and plan_guard judges the row by its own business —
--     so a locked business's photo never reaches its job; the phone sends no
--     file for a business the cloud has refused (sync.js).
-- ⚠ Before V168 a member whose OWN business had lapsed had every photo file
-- refused — the team's too — because the rule asked about the main business.
-- ⚠ The policy runs as the signed-in person, who may not call can_upload — so
-- this helper reads with the owner's rights (the V143 lesson).
create or replace function public.can_upload_file(name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null then false
    when exists (select 1 from public.photos p
                 where p.user_id = auth.uid()
                   and p.storage_path in (name, regexp_replace(name, '_t\.jpg$', '.jpg')))
      then exists (select 1 from public.photos p
                   where p.user_id = auth.uid()
                     and p.storage_path in (name, regexp_replace(name, '_t\.jpg$', '.jpg'))
                     and public.can_upload(p.org_id))
    else exists (select 1 from public.memberships m
                 where m.user_id = auth.uid() and public.can_upload(m.org_id))
  end
$$;
revoke all on function public.can_upload_file(text) from public, anon;
grant execute on function public.can_upload_file(text) to authenticated;

drop policy if exists "add own photo files" on storage.objects;
drop policy if exists "change own photo files" on storage.objects;
create policy "add own photo files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text
              and public.can_upload_file(name));
create policy "change own photo files" on storage.objects
  for update to authenticated
  using      (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text
              and public.can_upload_file(name));
-- ================================================================ end V168

-- ================================================================ self-checks
drop table if exists pg_temp._v168_result;
create temp table _v168_result (n int, check_name text, result text);
insert into _v168_result
select 1, 'the app may read its businesses'' plans; nobody signed out may',
  case when has_function_privilege('authenticated', 'public.my_business_plans()', 'execute')
        and not has_function_privilege('anon', 'public.my_business_plans()', 'execute')
       then 'PASS' else 'FAIL' end
union all
select 2, 'both run with their own rights and a pinned search path',
  case when (select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc
             where oid in ('public.my_business_plans()'::regprocedure, 'public.can_upload_file(text)'::regprocedure))
       then 'PASS' else 'FAIL' end
union all
select 3, 'a photo file is judged by its job''s business (both file rules ask can_upload_file)',
  case when (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and policyname in ('add own photo files', 'change own photo files')
             and with_check like '%can_upload_file(name)%' and with_check not like '%can_upload_files()%') = 2
       then 'PASS' else 'FAIL' end
union all
select 4, 'with nobody signed in, no photo file may go up',
  case when public.can_upload_file('00000000-0000-0000-0000-000000000000/x.jpg') is false then 'PASS' else 'FAIL' end
union all
select 5, 'jobs, settings and photo rows are still judged by their own business (plan_guard)',
  case when (select prosrc from pg_proc where oid = 'public.plan_guard()'::regprocedure)
            like '%not public.can_upload(new.org_id)%'
        and (select count(*) from pg_trigger where tgname = 'plan_guard' and not tgisinternal) = 3
       then 'PASS' else 'FAIL' end;

select n as "#", check_name as "check", result from _v168_result order by n;
