-- PATGo cloud — V93: what a cloud job card shows (item, fail and photo counts)
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on an existing project, BEFORE uploading any V93 file: Dashboard →
-- SQL Editor → New query → paste this whole file → Run. Safe to run again.
-- (A new project gets the same from schema.sql.)
--
-- Adds two columns the DATABASE works out from each job (no phone writes them,
-- so a phone on any version keeps working), and a read-only view of how many
-- photos each job has. The V93 Jobs screen's "In the cloud" tab reads both;
-- without them it says it couldn't reach the cloud. A V92 phone carries on as
-- before after this runs.
--
-- Adding the columns rewrites the jobs table once. It does NOT change any
-- job's updated_at (no trigger fires), so no phone re-reads anything.
--
-- The view runs with the rights of whoever reads it (security_invoker), so the
-- photos table's own rule decides what it can count: your photos, never anyone
-- else's. isolation-test.sql checks that (8a–8c) — run it as usual.
--
-- The result is a short table of checks. Every row must say PASS.


-- ------------------------------------------------------------ the counts
create or replace function public.job_item_count(d jsonb)
returns integer language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(d->'items') = 'array' then jsonb_array_length(d->'items') else 0 end
$$;

create or replace function public.job_fail_count(d jsonb)
returns integer language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(d->'items') = 'array'
              then (select count(*)::integer from jsonb_array_elements(d->'items') e
                    where e->>'result' = 'fail')
              else 0 end
$$;

alter table public.sessions add column if not exists n_items integer
  generated always as (public.job_item_count(doc)) stored;
alter table public.sessions add column if not exists n_fails integer
  generated always as (public.job_fail_count(doc)) stored;

-- ------------------------------------------------- photos per job (a view)
create or replace view public.session_photo_counts
  with (security_invoker = true) as
  select user_id, session_id, count(*)::integer as n
  from public.photos
  where deleted = false
  group by user_id, session_id;

revoke all on public.session_photo_counts from anon;
revoke all on public.session_photo_counts from authenticated;
grant select on public.session_photo_counts to authenticated;


-- ------------------------------------------------------------ self-check
drop table if exists pg_temp._v93_result;
create temp table _v93_result (n int, check_name text, result text);

do $v93$
declare
  u uuid; i int; f int; opts text[]; res text[] := '{}';
begin
  select id into u from auth.users order by created_at limit 1;
  if u is null then
    insert into _v93_result values (1, 'an account to test with', 'INCONCLUSIVE — no users yet');
    return;
  end if;
  delete from public.sessions where id like 'v93-test-%';
  delete from public.photos where id like 'v93-test-%';

  -- A1: a job's counts are worked out from its contents.
  insert into public.sessions (id, user_id, doc, last_modified)
  values ('v93-test-1', u, '{"id":"v93-test-1","items":[{"result":"pass"},{"result":"fail"},{"result":"pass"}]}', now());
  select n_items, n_fails into i, f from public.sessions where user_id = u and id = 'v93-test-1';
  res := res || array['A1|a job''s item and fail counts|' || case when i = 3 and f = 1 then 'PASS' else 'FAIL (' || coalesce(i::text, 'blank') || ' items, ' || coalesce(f::text, 'blank') || ' fails)' end];

  -- A2: an edit moves them.
  update public.sessions set doc = '{"id":"v93-test-1","items":[{"result":"fail"},{"result":"fail"}]}'
  where user_id = u and id = 'v93-test-1';
  select n_items, n_fails into i, f from public.sessions where user_id = u and id = 'v93-test-1';
  res := res || array['A2|an edit updates the counts|' || case when i = 2 and f = 2 then 'PASS' else 'FAIL (' || coalesce(i::text, 'blank') || ' items, ' || coalesce(f::text, 'blank') || ' fails)' end];

  -- A3: a deleted job (doc {}) counts nothing, without an error.
  update public.sessions set doc = '{}', deleted = true where user_id = u and id = 'v93-test-1';
  select n_items, n_fails into i, f from public.sessions where user_id = u and id = 'v93-test-1';
  res := res || array['A3|a deleted job counts nothing|' || case when i = 0 and f = 0 then 'PASS' else 'FAIL' end];

  -- A4: the view counts live photos only.
  insert into public.photos (id, user_id, session_id, item_id, storage_path, last_modified, deleted)
  values ('v93-test-p1', u, 'v93-test-1', 'x', u::text || '/v93-test-p1.jpg', now(), false),
         ('v93-test-p2', u, 'v93-test-1', 'x', u::text || '/v93-test-p2.jpg', now(), false),
         ('v93-test-p3', u, 'v93-test-1', 'x', u::text || '/v93-test-p3.jpg', now(), true);
  select n into i from public.session_photo_counts where user_id = u and session_id = 'v93-test-1';
  res := res || array['A4|photos per job, deleted ones left out|' || case when i = 2 then 'PASS' else 'FAIL (' || coalesce(i::text, 'none') || ')' end];

  -- A5: the view runs with the reader's rights, not the owner's.
  select reloptions into opts from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relname = 'session_photo_counts';
  res := res || array['A5|the photo count obeys each account''s own rule|'
                || case when 'security_invoker=true' = any(coalesce(opts, '{}')) then 'PASS' else 'FAIL (runs as its owner)' end];

  delete from public.photos where id like 'v93-test-%';
  delete from public.sessions where id like 'v93-test-%';
  insert into _v93_result
  select row_number() over (), split_part(x, '|', 1) || ' ' || split_part(x, '|', 2), split_part(x, '|', 3)
  from unnest(res) as x;
end
$v93$;

select check_name, result from _v93_result order by n;
