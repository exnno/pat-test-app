-- PATGo cloud — V92: the job fingerprint column
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on an existing project, BEFORE uploading any V92 file: Dashboard →
-- SQL Editor → New query → paste this whole file → Run. Safe to run again.
-- (A new project gets the same from schema.sql.) No policy changes.
--
-- A phone on V92 sends `fp` with every job it pushes; without the column every
-- push fails. A phone still on V91 carries on as before after this runs.
--
-- The result is a short table of checks. Every row must say PASS. It uses the
-- first account under Authentication → Users for a scratch row, and removes it.

alter table public.sessions add column if not exists fp text;

create or replace function public.sessions_fp_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.doc is distinct from old.doc and new.fp is not distinct from old.fp then
    new.fp := null;
  end if;
  return new;
end;
$$;
drop trigger if exists sessions_fp_guard on public.sessions;
create trigger sessions_fp_guard before update on public.sessions
  for each row execute function public.sessions_fp_guard();

-- ------------------------------------------------------------ self-check
drop table if exists pg_temp._fp_result;
create temp table _fp_result (n int, check_name text, result text);

do $fp$
declare
  u uuid; v text; res text[] := '{}';
begin
  select id into u from auth.users order by created_at limit 1;
  if u is null then
    insert into _fp_result values (1, 'an account to test with', 'INCONCLUSIVE — no users yet');
    return;
  end if;
  delete from public.sessions where id like 'fp-test-%';

  -- F1: a V92 write keeps the fingerprint it sent.
  insert into public.sessions (id, user_id, doc, last_modified, fp)
  values ('fp-test-1', u, '{"id":"fp-test-1","items":[]}', now(), 'ZZFP1');
  update public.sessions set doc = '{"id":"fp-test-1","items":[1]}', fp = 'ZZFP2'
  where user_id = u and id = 'fp-test-1';
  select fp into v from public.sessions where user_id = u and id = 'fp-test-1';
  res := res || array['F1|a V92 write keeps its fingerprint|' || case when v = 'ZZFP2' then 'PASS' else 'FAIL (' || coalesce(v, 'blank') || ')' end];

  -- F2: a V91 write (new doc, no fp sent) blanks it.
  update public.sessions set doc = '{"id":"fp-test-1","items":[1,2]}'
  where user_id = u and id = 'fp-test-1';
  select fp into v from public.sessions where user_id = u and id = 'fp-test-1';
  res := res || array['F2|an older phone''s write blanks the fingerprint|' || case when v is null then 'PASS' else 'FAIL (' || v || ')' end];

  -- F3: the same doc sent again without fp leaves a good fingerprint alone.
  update public.sessions set fp = 'ZZFP3' where user_id = u and id = 'fp-test-1';
  update public.sessions set doc = '{"id":"fp-test-1","items":[1,2]}', deleted = false
  where user_id = u and id = 'fp-test-1';
  select fp into v from public.sessions where user_id = u and id = 'fp-test-1';
  res := res || array['F3|an unchanged job keeps its fingerprint|' || case when v = 'ZZFP3' then 'PASS' else 'FAIL (' || coalesce(v, 'blank') || ')' end];

  delete from public.sessions where id like 'fp-test-%';
  insert into _fp_result
  select row_number() over (), split_part(x, '|', 1) || ' ' || split_part(x, '|', 2), split_part(x, '|', 3)
  from unnest(res) as x;
end
$fp$;

select check_name, result from _fp_result order by n;
