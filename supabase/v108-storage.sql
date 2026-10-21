-- PATGo cloud — V108: Cloud Storage (how much space each job and its photos take)
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on an existing project, BEFORE uploading any V108 file: Dashboard →
-- SQL Editor → New query → paste this whole file → Run. Safe to run again.
-- (A new project gets the same from schema.sql.)
--
-- Adds two things, both worked out BY THE DATABASE (no phone writes them, so a
-- phone on any version keeps working):
--   • sessions.doc_bytes — the size of each job's contents, as text. The
--     database stores it compressed, so the real space on disk is a bit less;
--     the app says "about".
--   • a column b on the photo-count view — the bytes of each job's photos
--     (the full-size files; the small previews are not counted).
-- The V108 Settings → Data → Cloud Storage page reads both; without them it
-- says the cloud needs this update. A V107 phone carries on as before after
-- this runs (it never asks for either).
--
-- Adding the column rewrites the jobs table once. It does NOT change any job's
-- updated_at (no trigger fires), so no phone re-reads anything — the same as
-- V93's n_items / n_fails.
--
-- The view still runs with the rights of whoever reads it (security_invoker), so
-- the photos table's own rule decides what it can add up: your photos, never
-- anyone else's. isolation-test.sql checks that (8a–8d) — run it as usual.
--
-- The result is a short table of checks. Every row must say PASS.


-- ------------------------------------------------------------ job sizes
create or replace function public.job_doc_bytes(d jsonb)
returns integer language sql immutable set search_path = '' as $$
  select coalesce(octet_length(d::text), 0)
$$;

alter table public.sessions add column if not exists doc_bytes integer
  generated always as (public.job_doc_bytes(doc)) stored;

-- ------------------------------------- photos per job, now with their bytes
-- The new column goes LAST: "create or replace view" may add columns at the end
-- but never reorder or rename the ones a V93–V107 phone already reads (n).
create or replace view public.session_photo_counts
  with (security_invoker = true) as
  select user_id, session_id, count(*)::integer as n, coalesce(sum(bytes), 0)::bigint as b
  from public.photos
  where deleted = false
  group by user_id, session_id;

revoke all on public.session_photo_counts from anon;
revoke all on public.session_photo_counts from authenticated;
grant select on public.session_photo_counts to authenticated;


-- ------------------------------------------------------------ self-check
drop table if exists pg_temp._v108_result;
create temp table _v108_result (n int, check_name text, result text);

do $v108$
declare
  u uuid; i int; j int; bb bigint; opts text[]; res text[] := '{}';
begin
  select id into u from auth.users order by created_at limit 1;
  if u is null then
    insert into _v108_result values (1, 'an account to test with', 'INCONCLUSIVE — no users yet');
    return;
  end if;
  delete from public.sessions where id like 'v108-test-%';
  delete from public.photos where id like 'v108-test-%';

  -- B1: a job's size is worked out from its contents.
  insert into public.sessions (id, user_id, doc, last_modified)
  values ('v108-test-1', u, '{"id":"v108-test-1","items":[{"result":"pass"}]}', now());
  select doc_bytes into i from public.sessions where user_id = u and id = 'v108-test-1';
  res := res || array['B1|a job''s size is worked out|' || case when i > 20 then 'PASS' else 'FAIL (' || coalesce(i::text, 'blank') || ')' end];

  -- B2: a bigger job is bigger.
  update public.sessions set doc = '{"id":"v108-test-1","items":[{"result":"pass"},{"result":"fail","notes":"a longer note"}]}'
  where user_id = u and id = 'v108-test-1';
  select doc_bytes into j from public.sessions where user_id = u and id = 'v108-test-1';
  res := res || array['B2|an edit updates the size|' || case when j > i then 'PASS' else 'FAIL (' || coalesce(i::text, 'blank') || ' then ' || coalesce(j::text, 'blank') || ')' end];

  -- B3: a deleted job (doc {}) is next to nothing, without an error.
  update public.sessions set doc = '{}', deleted = true where user_id = u and id = 'v108-test-1';
  select doc_bytes into i from public.sessions where user_id = u and id = 'v108-test-1';
  res := res || array['B3|a deleted job takes next to nothing|' || case when i <= 2 then 'PASS' else 'FAIL (' || coalesce(i::text, 'blank') || ')' end];

  -- B4: the view adds up live photos only.
  insert into public.photos (id, user_id, session_id, item_id, storage_path, bytes, last_modified, deleted)
  values ('v108-test-p1', u, 'v108-test-1', 'x', u::text || '/v108-test-p1.jpg', 1000, now(), false),
         ('v108-test-p2', u, 'v108-test-1', 'x', u::text || '/v108-test-p2.jpg', 2500, now(), false),
         ('v108-test-p3', u, 'v108-test-1', 'x', u::text || '/v108-test-p3.jpg', 9999, now(), true);
  select n, b into i, bb from public.session_photo_counts where user_id = u and session_id = 'v108-test-1';
  res := res || array['B4|photo bytes per job, deleted ones left out|' || case when i = 2 and bb = 3500 then 'PASS' else 'FAIL (' || coalesce(i::text, 'none') || ' photos, ' || coalesce(bb::text, 'none') || ' bytes)' end];

  -- B5: the view still runs with the reader's rights, not the owner's.
  select reloptions into opts from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relname = 'session_photo_counts';
  res := res || array['B5|the photo sizes obey each account''s own rule|'
                || case when 'security_invoker=true' = any(coalesce(opts, '{}')) then 'PASS' else 'FAIL (runs as its owner)' end];

  delete from public.photos where id like 'v108-test-%';
  delete from public.sessions where id like 'v108-test-%';
  insert into _v108_result
  select row_number() over (), split_part(x, '|', 1) || ' ' || split_part(x, '|', 2), split_part(x, '|', 3)
  from unnest(res) as x;
end
$v108$;

select check_name, result from _v108_result order by n;
