-- PATGo cloud — two-account isolation test
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run EVERY RELEASE, before promoting main → Release. Record the result in
-- the handoff. The JavaScript test harness cannot test a Postgres policy;
-- this is the only thing that does.
--
-- HOW: Dashboard → SQL Editor → New query → paste this file → change the two
-- email addresses on the next two lines → Run. Every row of the result must
-- say PASS. Any FAIL: do not promote, and bring the output to the next chat.
--
-- It signs in as account B (by impersonation — no email needed), tries to see
-- and change account A's data, and records what happened. It cleans up after
-- itself: nothing is left behind in either account. (Only if check 4a FAILS
-- is a test file record left in storage — the detail column says where.)

drop table if exists pg_temp._iso_result;
create temp table _iso_result (n int, check_name text, result text, detail text);

do $iso$
declare
  email_a text := 'CHANGE-ME-A@example.com';   -- ← account A (e.g. your own)
  email_b text := 'CHANGE-ME-B@example.com';   -- ← account B (a second address)
  a uuid; b uuid;
  n int; ok boolean; msg text; plan_after text;
  res text[] := '{}';
  rls_off text;
begin
  select id into a from auth.users where lower(email) = lower(email_a);
  select id into b from auth.users where lower(email) = lower(email_b);
  if a is null or b is null or a = b then
    raise exception 'Set email_a and email_b at the top to two DIFFERENT accounts that exist under Authentication → Users.';
  end if;

  -- Structural: RLS switched on for every table.
  select string_agg(c.relname, ', ') into rls_off
  from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relname in ('profiles','sessions','records','photos')
    and not c.relrowsecurity;
  res := res || array['0|row-level security is on for all four tables|'
                || case when rls_off is null then 'PASS|' else 'FAIL|off on: ' || rls_off end];

  -- Seed one row belonging to A (as the admin role, which bypasses RLS).
  delete from public.sessions where id like 'iso-test-%';
  insert into public.sessions (id, user_id, doc, last_modified)
  values ('iso-test-A', a, '{"owner":"A"}', now());
  -- V84: and one records row. Since V83 records hold instrument calibration
  -- data, since V84 report settings (company, logo, signature) — same policy
  -- shape as sessions, checked in its own right.
  delete from public.records where id like 'iso-test-%';
  insert into public.records (id, user_id, kind, doc, last_modified)
  values ('iso-test-A', a, 'instrument', '{"owner":"A"}', now());

  -- Become B.
  perform set_config('request.jwt.claims',
    json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- Control: B CAN write and read B's own row. Proves the policies are
  -- working, not just refusing everything.
  begin
    insert into public.sessions (id, user_id, doc, last_modified)
    values ('iso-test-B', b, '{"owner":"B"}', now());
    select count(*) into n from public.sessions where id = 'iso-test-B';
    res := res || array['C|control: B can write and read B''s own session|'
                  || case when n = 1 then 'PASS|' else 'FAIL|B saw ' || n || ' of own rows' end];
  exception when others then
    res := res || array['C|control: B can write and read B''s own session|FAIL|' || sqlerrm];
  end;

  -- 1. B cannot see A's session (0 rows, no error).
  begin
    select count(*) into n from public.sessions where id = 'iso-test-A';
    res := res || array['1|B cannot see A''s sessions|'
                  || case when n = 0 then 'PASS|' else 'FAIL|B saw ' || n || ' row(s)' end];
  exception when others then
    res := res || array['1|B cannot see A''s sessions|FAIL|error instead of 0 rows: ' || sqlerrm];
  end;

  -- 2. B cannot insert a row stamped with A's id (catches a missing WITH CHECK).
  begin
    insert into public.sessions (id, user_id, doc, last_modified)
    values ('iso-test-forged', a, '{"owner":"forged"}', now());
    res := res || array['2|B cannot write a row as A|FAIL|insert was accepted'];
  exception when others then
    res := res || array['2|B cannot write a row as A|PASS|rejected: ' || sqlerrm];
  end;

  -- 3. B cannot change A's session.
  begin
    update public.sessions set doc = '{"owner":"hacked"}' where id = 'iso-test-A';
    get diagnostics n = row_count;
    res := res || array['3|B cannot change A''s sessions|'
                  || case when n = 0 then 'PASS|0 rows affected' else 'FAIL|' || n || ' row(s) changed' end];
  exception when others then
    res := res || array['3|B cannot change A''s sessions|PASS|rejected: ' || sqlerrm];
  end;

  -- 6. (V84) The same three checks on records.
  begin
    select count(*) into n from public.records where id = 'iso-test-A';
    res := res || array['6a|B cannot see A''s records|'
                  || case when n = 0 then 'PASS|' else 'FAIL|B saw ' || n || ' row(s)' end];
  exception when others then
    res := res || array['6a|B cannot see A''s records|FAIL|error instead of 0 rows: ' || sqlerrm];
  end;
  begin
    insert into public.records (id, user_id, kind, doc, last_modified)
    values ('iso-test-forged', a, 'settings', '{"owner":"forged"}', now());
    res := res || array['6b|B cannot write a record as A|FAIL|insert was accepted'];
  exception when others then
    res := res || array['6b|B cannot write a record as A|PASS|rejected: ' || sqlerrm];
  end;
  begin
    update public.records set doc = '{"owner":"hacked"}' where id = 'iso-test-A';
    get diagnostics n = row_count;
    res := res || array['6c|B cannot change A''s records|'
                  || case when n = 0 then 'PASS|0 rows affected' else 'FAIL|' || n || ' row(s) changed' end];
  exception when others then
    res := res || array['6c|B cannot change A''s records|PASS|rejected: ' || sqlerrm];
  end;

  -- 4. Storage: B cannot put a file in A's photo folder, and B cannot list
  --    anything in anyone else's folder. (A download test needs a real
  --    uploaded photo; that arrives with photo sync — see the handoff.)
  -- ⚠ PASS only if the refusal is OUR row-level security policy. Supabase
  -- puts its own guards on storage tables (e.g. it blocks SQL deletes), so
  -- "some error" would prove nothing. Anything else is INCONCLUSIVE.
  -- The insert is inside this sub-block; on PASS it never happened. On FAIL
  -- it did, and is left in place because Supabase forbids deleting storage
  -- rows by SQL — delete iso-test.jpg in Storage → photos by hand.
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('photos', a::text || '/iso-test.jpg', b);
    res := res || array['4a|B cannot write into A''s photo folder|FAIL|insert was accepted — also delete ' || a::text || '/iso-test.jpg under Storage → photos'];
  exception when others then
    if sqlerrm ilike '%row-level security%' then
      res := res || array['4a|B cannot write into A''s photo folder|PASS|rejected by RLS'];
    else
      res := res || array['4a|B cannot write into A''s photo folder|INCONCLUSIVE|blocked by something other than RLS: ' || sqlerrm];
    end if;
  end;
  begin
    select count(*) into n from storage.objects
    where bucket_id = 'photos' and (storage.foldername(name))[1] <> b::text;
    res := res || array['4b|B sees no photo files outside B''s folder|'
                  || case when n = 0 then 'PASS|' else 'FAIL|B saw ' || n || ' file(s)' end];
  exception when others then
    res := res || array['4b|B sees no photo files outside B''s folder|FAIL|' || sqlerrm];
  end;

  -- 5. B cannot change B's own plan (no update route on profiles at all).
  begin
    update public.profiles set plan = 'comped' where id = b;
    get diagnostics n = row_count;
    ok := (n = 0); msg := n || ' row(s) affected';
  exception when others then
    ok := true; msg := 'rejected: ' || sqlerrm;
  end;

  -- Back to admin: confirm the plan really is unchanged, then clean up.
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select plan into plan_after from public.profiles where id = b;
  res := res || array['5|B cannot change own plan|'
                || case when ok and coalesce(plan_after,'') <> 'comped'
                        then 'PASS|' || msg else 'FAIL|' || msg || ', plan now ' || coalesce(plan_after,'(no profile)') end];

  select doc->>'owner' into msg from public.sessions where id = 'iso-test-A';
  res := res || array['3b|A''s session content untouched|'
                || case when msg = 'A' then 'PASS|' else 'FAIL|content now ' || coalesce(msg,'(gone)') end];

  select doc->>'owner' into msg from public.records where id = 'iso-test-A';
  res := res || array['6d|A''s record content untouched|'
                || case when msg = 'A' then 'PASS|' else 'FAIL|content now ' || coalesce(msg,'(gone)') end];

  delete from public.sessions where id like 'iso-test-%';
  delete from public.records where id like 'iso-test-%';
  -- (No storage cleanup: Supabase blocks SQL deletes on storage tables, and on
  -- a PASS the 4a insert never happened, so there is nothing to clean.)

  insert into _iso_result
  select row_number() over (), split_part(x, '|', 2), split_part(x, '|', 3),
         split_part(x, '|', 1) || ' · ' || split_part(x, '|', 4)
  from unnest(res) as x;
end
$iso$;

select check_name, result, detail from _iso_result order by n;
