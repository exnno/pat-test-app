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
-- V93: CHECKS 8a–8c NEED supabase/v93-archive.sql RUN FIRST (8c names it if not).
-- V108: CHECK 8d NEEDS supabase/v108-storage.sql RUN FIRST (8d names it if not).
-- V113: CHECKS 9–16 NEED supabase/v113-organisations.sql RUN FIRST (9a names it
-- if not). 10d–12d need one SYNCED photo from account A (as for 4c); without one
-- they say INCONCLUSIVE. B is put into A's business as Engineer, Office and Team
-- leader in turn, then taken out again; nothing is left behind.
-- V89: CHECKS 4e/4f NEED ONE PREVIEW FROM ACCOUNT A — any photo uploaded by a
-- V89 phone has one (or wait for a V89 phone holding older photos to add them).
-- V88: CHECK 4c NEEDS ONE REAL PHOTO FROM ACCOUNT A. Before running, sign in
-- as A on a phone running V88, add a photo to a failed item, and wait until
-- Settings → Cloud → Sync shows it in the cloud. Without one, 4c and 4d say
-- INCONCLUSIVE rather than PASS.
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
  j bigint; k int;   -- V108 (8d)
  real_a text;   -- V88: one real photo file of A's, if there is one
  thumb_a text;  -- V89: one real preview file of A's, if there is one
  org_a uuid; org_b uuid; team_file text;          -- V113
  r text; g text; rn text; reads boolean;           -- V113
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
  where s.nspname = 'public' and c.relname in ('profiles','sessions','records','photos','organisations','memberships')
    and not c.relrowsecurity;
  res := res || array['0|row-level security is on for every table|'
                || case when rls_off is null then 'PASS|' else 'FAIL|off on: ' || rls_off end];

  -- V93: the photo-count view must read with the READER's rights. A view
  -- normally runs as its owner, who is not bound by "own photos".
  select case when 'security_invoker=true' = any(coalesce(c.reloptions, '{}')) then 'yes' else 'no' end
    into msg from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relname = 'session_photo_counts';
  res := res || array['8c|the photo-count view runs with the reader''s rights|'
                || case when msg = 'yes' then 'PASS|'
                        when msg is null then 'FAIL|view missing — run supabase/v93-archive.sql'
                        else 'FAIL|it runs as its owner and can count anyone''s photos' end];

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

  -- V88: and one photos row — the metadata that says which job and item a
  -- photo belongs to. Same policy shape, checked in its own right (7a–7d).
  delete from public.photos where id like 'iso-test-%';
  insert into public.photos (id, user_id, session_id, item_id, storage_path, last_modified)
  values ('iso-test-A', a, 'iso-test-A', 'iso-test-item', a::text || '/iso-test-A.jpg', now());
  -- V88: a REAL file A uploaded (not the 4a probe name), for the download check.
  select name into real_a from storage.objects
  where bucket_id = 'photos' and (storage.foldername(name))[1] = a::text
    and name <> a::text || '/iso-test.jpg'
    and name not like '%\_t.jpg'
  order by created_at desc limit 1;
  -- V89: and a real PREVIEW of A's ({id}_t.jpg), for check 4e.
  select name into thumb_a from storage.objects
  where bucket_id = 'photos' and (storage.foldername(name))[1] = a::text
    and name like '%\_t.jpg'
  order by created_at desc limit 1;

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

  -- 4c. (V88) B cannot read one of A's REAL photo files. A download through
  -- the Storage API is authorised by exactly this: B's select on the file's
  -- storage.objects row. 0 rows = B's download is refused.
  if real_a is null then
    res := res || array['4c|B cannot read A''s real photo file|INCONCLUSIVE|A has no uploaded photo yet — see the note at the top'];
  else
    begin
      select count(*) into n from storage.objects where bucket_id = 'photos' and name = real_a;
      res := res || array['4c|B cannot read A''s real photo file|'
                    || case when n = 0 then 'PASS|' || real_a else 'FAIL|B can see ' || real_a end];
    exception when others then
      res := res || array['4c|B cannot read A''s real photo file|FAIL|error instead of 0 rows: ' || sqlerrm];
    end;
  end if;

  -- 4e. (V89) B cannot read one of A's photo PREVIEWS either. Same folder, same
  -- policy — checked because V89 is the first release to write them.
  if thumb_a is null then
    res := res || array['4e|B cannot read A''s real preview file|INCONCLUSIVE|A has no preview in the cloud yet — see the note at the top'];
  else
    begin
      select count(*) into n from storage.objects where bucket_id = 'photos' and name = thumb_a;
      res := res || array['4e|B cannot read A''s real preview file|'
                    || case when n = 0 then 'PASS|' || thumb_a else 'FAIL|B can see ' || thumb_a end];
    exception when others then
      res := res || array['4e|B cannot read A''s real preview file|FAIL|error instead of 0 rows: ' || sqlerrm];
    end;
  end if;

  -- 7. (V88) The same checks on photo rows.
  begin
    select count(*) into n from public.photos where id = 'iso-test-A';
    res := res || array['7a|B cannot see A''s photo rows|'
                  || case when n = 0 then 'PASS|' else 'FAIL|B saw ' || n || ' row(s)' end];
  exception when others then
    res := res || array['7a|B cannot see A''s photo rows|FAIL|error instead of 0 rows: ' || sqlerrm];
  end;
  begin
    insert into public.photos (id, user_id, session_id, item_id, storage_path, last_modified)
    values ('iso-test-forged', a, 'x', 'x', a::text || '/forged.jpg', now());
    res := res || array['7b|B cannot write a photo row as A|FAIL|insert was accepted'];
  exception when others then
    res := res || array['7b|B cannot write a photo row as A|PASS|rejected: ' || sqlerrm];
  end;
  begin
    update public.photos set deleted = true where id = 'iso-test-A';
    get diagnostics n = row_count;
    res := res || array['7c|B cannot change A''s photo rows|'
                  || case when n = 0 then 'PASS|0 rows affected' else 'FAIL|' || n || ' row(s) changed' end];
  exception when others then
    res := res || array['7c|B cannot change A''s photo rows|PASS|rejected: ' || sqlerrm];
  end;

  -- 8. (V93) The photo-count view. B sees no count for A's job (A's photo row
  -- above belongs to job iso-test-A), and — the control — B's own photo IS
  -- counted, so a view that counts nothing at all can't pass.
  begin
    select count(*) into n from public.session_photo_counts v where v.session_id = 'iso-test-A';
    res := res || array['8a|B cannot count A''s photos|'
                  || case when n = 0 then 'PASS|' else 'FAIL|B saw a count for A''s job' end];
  exception when others then
    res := res || array['8a|B cannot count A''s photos|FAIL|' || sqlerrm];
  end;
  begin
    insert into public.photos (id, user_id, session_id, item_id, storage_path, bytes, last_modified)
    values ('iso-test-B', b, 'iso-test-B', 'x', b::text || '/iso-test-B.jpg', 1234, now());
    select coalesce(sum(v.n), 0) into n from public.session_photo_counts v where v.session_id = 'iso-test-B';
    res := res || array['8b|control: B''s own photo is counted|'
                  || case when n = 1 then 'PASS|' else 'FAIL|counted ' || n end];
  exception when others then
    res := res || array['8b|control: B''s own photo is counted|FAIL|' || sqlerrm];
  end;
  -- 8d. (V108) The same view's photo SIZES: B adds up none of A's bytes, and
  -- — the control — B's own photo (1234 bytes, 8b) IS added up. The view is
  -- read through to_jsonb so a project without v108-storage.sql run gives a
  -- named FAIL rather than stopping the whole test.
  begin
    select coalesce(sum((to_jsonb(v)->>'b')::bigint), -1) into n from public.session_photo_counts v where v.session_id = 'iso-test-A';
    select coalesce(sum((to_jsonb(v)->>'b')::bigint), 0) into j from public.session_photo_counts v where v.session_id = 'iso-test-B';
    select count(*) into k from public.session_photo_counts v where v.session_id = 'iso-test-B' and to_jsonb(v) ? 'b';
    res := res || array['8d|B cannot add up A''s photo sizes; B''s own are|'
                  || case when k = 0 then 'FAIL|photo sizes missing — run supabase/v108-storage.sql'
                          when n = -1 and j = 1234 then 'PASS|'
                          when n <> -1 then 'FAIL|B saw ' || n || ' bytes of A''s photos'
                          else 'FAIL|B''s own photo added up to ' || j end];
  exception when others then
    res := res || array['8d|B cannot add up A''s photo sizes; B''s own are|FAIL|' || sqlerrm];
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

  -- 4d. (V88) Control for 4c: A CAN see the same file, so 4c's 0 rows is the
  -- policy working and not a file that isn't there.
  if real_a is null then
    res := res || array['4d|control: A can read A''s own photo file|INCONCLUSIVE|A has no uploaded photo yet'];
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      select count(*) into n from storage.objects where bucket_id = 'photos' and name = real_a;
      res := res || array['4d|control: A can read A''s own photo file|'
                    || case when n = 1 then 'PASS|' else 'FAIL|A saw ' || n end];
    exception when others then
      res := res || array['4d|control: A can read A''s own photo file|FAIL|' || sqlerrm];
    end;
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
  end if;
  -- 4f. (V89) Control for 4e: A CAN see the same preview.
  if thumb_a is null then
    res := res || array['4f|control: A can read A''s own preview file|INCONCLUSIVE|A has no preview yet'];
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      select count(*) into n from storage.objects where bucket_id = 'photos' and name = thumb_a;
      res := res || array['4f|control: A can read A''s own preview file|'
                    || case when n = 1 then 'PASS|' else 'FAIL|A saw ' || n end];
    exception when others then
      res := res || array['4f|control: A can read A''s own preview file|FAIL|' || sqlerrm];
    end;
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
  end if;
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

  select case when deleted = false and storage_path = a::text || '/iso-test-A.jpg' then 'A' else 'changed' end
    into msg from public.photos where id = 'iso-test-A';
  res := res || array['7d|A''s photo row untouched|'
                || case when msg = 'A' then 'PASS|' else 'FAIL|' || coalesce(msg,'(gone)') end];

  -- ================================================================ V113
  -- Businesses (supabase/v113-organisations.sql). A and B are in different
  -- businesses, so every check above is the cross-business check. Below, B is
  -- placed in A's business as each role in turn, then removed again — all
  -- inside this one run, so nothing is left behind. (No photo FILES are added:
  -- Supabase won't let SQL remove them afterwards; v113's O9 checks those rules.)
  if to_regclass('public.memberships') is null then
    res := res || array['9a|business rules|FAIL|run supabase/v113-organisations.sql first'];
  else
    org_a := public.default_org(a);
    org_b := public.default_org(b);
    res := res || array['9a|A and B each have their own business|'
                  || case when org_a is not null and org_b is not null and org_a <> org_b then 'PASS|'
                          else 'FAIL|' || coalesce(org_a::text, 'A none') || ' / ' || coalesce(org_b::text, 'B none') end];
    -- A real file of A's that has its photo row (what an Owner's read goes by).
    select o.name into team_file from storage.objects o
    join public.photos p on p.storage_path = o.name and p.user_id = a and p.org_id = org_a
    where o.bucket_id = 'photos' limit 1;
    -- Seed (as admin): a job and a photo of B's, done for A's business.
    insert into public.sessions (id, user_id, org_id, doc, last_modified)
    values ('iso-test-BinA', b, org_a, '{"owner":"B for A"}', now());
    insert into public.photos (id, user_id, org_id, session_id, item_id, storage_path, last_modified)
    values ('iso-test-BinA', b, org_a, 'iso-test-BinA', 'x', b::text || '/iso-test-BinA.jpg', now());

    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    -- 9b: not a member, B can't put a row into A's business.
    begin
      insert into public.sessions (id, user_id, org_id, doc, last_modified)
      values ('iso-test-forged2', b, org_a, '{}', now());
      res := res || array['9b|B cannot put a job into A''s business|FAIL|insert was accepted'];
    exception when others then
      res := res || array['9b|B cannot put a job into A''s business|PASS|rejected: ' || sqlerrm];
    end;
    -- 9c: control — in a business of one, deleting from the cloud works as before.
    begin
      update public.sessions set deleted = true, doc = '{}' where id = 'iso-test-B' and user_id = b;
      get diagnostics n = row_count;
      res := res || array['9c|control: in a business of one, B can still delete from the cloud|'
                    || case when n = 1 then 'PASS|' else 'FAIL|' || n || ' rows' end];
    exception when others then
      res := res || array['9c|control: in a business of one, B can still delete from the cloud|FAIL|' || sqlerrm];
    end;
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    update public.sessions set deleted = false, doc = '{"owner":"B"}' where id = 'iso-test-B' and user_id = b;

    -- 10 Engineer, 11 Office, 12 Team leader.
    foreach r in array array['engineer','office','team_leader'] loop
      g := case r when 'engineer' then '10' when 'office' then '11' else '12' end;
      rn := case r when 'engineer' then 'Engineer' when 'office' then 'Office' else 'Team leader' end;
      reads := r <> 'engineer';
      insert into public.memberships (org_id, user_id, role) values (org_a, b, r)
      on conflict (org_id, user_id) do update set role = excluded.role;
      perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';

      select count(*) into n from public.sessions where id = 'iso-test-A';
      res := res || array[g || 'a|B as ' || rn || ': ' || case when reads then 'reads' else 'cannot read' end || ' A''s jobs|'
                    || case when n = (case when reads then 1 else 0 end) then 'PASS|' else 'FAIL|saw ' || n end];
      select count(*) into n from public.records where id = 'iso-test-A';
      res := res || array[g || 'b|B as ' || rn || ': ' || case when reads then 'reads' else 'cannot read' end || ' A''s records|'
                    || case when n = (case when reads then 1 else 0 end) then 'PASS|' else 'FAIL|saw ' || n end];
      select count(*) into n from public.session_photo_counts v where v.session_id = 'iso-test-A';
      res := res || array[g || 'c|B as ' || rn || ': ' || case when reads then 'counts' else 'cannot count' end || ' A''s photos|'
                    || case when n = (case when reads then 1 else 0 end) then 'PASS|' else 'FAIL|saw ' || n end];
      if team_file is null then
        res := res || array[g || 'd|B as ' || rn || ': photo files follow the read rule|INCONCLUSIVE|A has no synced photo yet — see the note at the top'];
      else
        select count(*) into n from storage.objects where bucket_id = 'photos' and name = team_file;
        res := res || array[g || 'd|B as ' || rn || ': ' || case when reads then 'reads' else 'cannot read' end || ' A''s photo files|'
                      || case when n = (case when reads then 1 else 0 end) then 'PASS|' || team_file else 'FAIL|saw ' || n end];
      end if;
      begin
        update public.sessions set doc = '{"owner":"hacked"}' where id = 'iso-test-A';
        get diagnostics n = row_count;
        res := res || array[g || 'e|B as ' || rn || ': cannot change A''s jobs|'
                      || case when n = 0 then 'PASS|0 rows affected' else 'FAIL|' || n || ' row(s) changed' end];
      exception when others then
        res := res || array[g || 'e|B as ' || rn || ': cannot change A''s jobs|PASS|rejected: ' || sqlerrm];
      end;
      begin
        update public.sessions set doc = '{"owner":"B for A","edited":true}' where id = 'iso-test-BinA' and user_id = b;
        get diagnostics n = row_count;
        res := res || array[g || 'f|control: B as ' || rn || ' can edit B''s own job for A|'
                      || case when n = 1 then 'PASS|' else 'FAIL|' || n || ' rows' end];
      exception when others then
        res := res || array[g || 'f|control: B as ' || rn || ' can edit B''s own job for A|FAIL|' || sqlerrm];
      end;
      -- 12A: deleting from the cloud in a business of more than one.
      begin
        update public.sessions set deleted = true, doc = '{}' where id = 'iso-test-BinA' and user_id = b;
        get diagnostics n = row_count;
        msg := 'accepted (' || n || ')';
      exception when others then
        msg := 'refused';
      end;
      res := res || array[g || 'g|B as ' || rn || ': ' || case when reads then 'can' else 'cannot' end || ' delete a job from the cloud|'
                    || case when (reads and msg = 'accepted (1)') or (not reads and msg = 'refused') then 'PASS|' else 'FAIL|' end || msg];
      begin
        update public.photos set deleted = true where id = 'iso-test-BinA' and user_id = b;
        get diagnostics n = row_count;
        msg := 'accepted (' || n || ')';
      exception when others then
        msg := 'refused';
      end;
      res := res || array[g || 'h|B as ' || rn || ': ' || case when reads then 'can' else 'cannot' end || ' delete a photo from the cloud|'
                    || case when (reads and msg = 'accepted (1)') or (not reads and msg = 'refused') then 'PASS|' else 'FAIL|' end || msg];
      if not reads then
        begin
          delete from public.sessions where id = 'iso-test-BinA' and user_id = b;
          get diagnostics n = row_count;
          res := res || array[g || 'i|B as ' || rn || ': cannot remove a job outright|'
                        || case when n = 0 then 'PASS|0 rows' else 'FAIL|' || n || ' removed' end];
        exception when others then
          res := res || array[g || 'i|B as ' || rn || ': cannot remove a job outright|PASS|rejected: ' || sqlerrm];
        end;
      end if;
      begin
        select count(*) into n from public.memberships where user_id = a;
        update public.memberships set role = 'owner' where org_id = org_a and user_id = b;
        get diagnostics k = row_count;
        res := res || array[g || 'j|B as ' || rn || ': cannot see A''s membership or promote B|'
                      || case when n = 0 and k = 0 then 'PASS|' else 'FAIL|saw ' || n || ', changed ' || k end];
      exception when others then
        res := res || array[g || 'j|B as ' || rn || ': cannot see A''s membership or promote B|'
                      || case when n = 0 then 'PASS|rejected: ' || sqlerrm else 'FAIL|saw ' || n end];
      end;
      execute 'reset role';
      perform set_config('request.jwt.claims', '', true);
      update public.sessions set deleted = false, doc = '{"owner":"B for A"}' where id = 'iso-test-BinA' and user_id = b;
      update public.photos set deleted = false where id = 'iso-test-BinA' and user_id = b;
    end loop;

    -- 13: A, the Owner, with B as an Engineer in A's business.
    update public.memberships set role = 'engineer' where org_id = org_a and user_id = b;
    perform set_config('request.jwt.claims', json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.sessions where id = 'iso-test-BinA';
    res := res || array['13a|A, the Owner, reads B''s job for A''s business|' || case when n = 1 then 'PASS|' else 'FAIL|saw ' || n end];
    select count(*) into n from public.sessions where id = 'iso-test-B';
    res := res || array['13b|A cannot read B''s job for B''s own business|' || case when n = 0 then 'PASS|' else 'FAIL|saw ' || n end];
    begin
      update public.sessions set doc = '{"owner":"hacked"}' where id = 'iso-test-BinA';
      get diagnostics n = row_count;
      res := res || array['13c|A cannot change B''s job (no editing others yet)|'
                    || case when n = 0 then 'PASS|0 rows affected' else 'FAIL|' || n || ' row(s) changed' end];
    exception when others then
      res := res || array['13c|A cannot change B''s job (no editing others yet)|PASS|rejected: ' || sqlerrm];
    end;
    select count(*) into n from public.memberships where org_id = org_a and user_id = b;
    select count(*) into k from public.memberships where user_id = b;
    res := res || array['13d|A sees B in A''s business, not B''s other business|'
                  || case when n = 1 and k = 1 then 'PASS|' else 'FAIL|saw ' || n || ' / ' || k end];
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);

    -- 14: B leaves A's business. The job B did for A stays A's.
    delete from public.memberships where org_id = org_a and user_id = b;
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.sessions where id in ('iso-test-BinA', 'iso-test-A');
    res := res || array['14a|after leaving, B cannot read A''s business''s jobs (even B''s own)|' || case when n = 0 then 'PASS|' else 'FAIL|saw ' || n end];
    begin
      update public.sessions set deleted = true, doc = '{}' where id = 'iso-test-BinA' and user_id = b;
      get diagnostics n = row_count;
      res := res || array['14b|after leaving, B cannot change or delete them|'
                    || case when n = 0 then 'PASS|0 rows affected' else 'FAIL|' || n || ' row(s) changed' end];
    exception when others then
      res := res || array['14b|after leaving, B cannot change or delete them|PASS|rejected: ' || sqlerrm];
    end;
    select count(*) into n from public.sessions where id = 'iso-test-B';
    res := res || array['14c|control: B''s own business carries on|' || case when n = 1 then 'PASS|' else 'FAIL|saw ' || n end];

    -- 15: nobody joins, makes or reshapes a business through the app.
    begin
      insert into public.memberships (org_id, user_id, role) values (org_a, b, 'owner');
      res := res || array['15a|B cannot add B to A''s business|FAIL|insert was accepted'];
    exception when others then
      res := res || array['15a|B cannot add B to A''s business|PASS|rejected: ' || sqlerrm];
    end;
    begin
      insert into public.organisations (name) values ('iso-test');
      res := res || array['15b|B cannot make a business|FAIL|insert was accepted'];
    exception when others then
      res := res || array['15b|B cannot make a business|PASS|rejected: ' || sqlerrm];
    end;
    begin
      update public.memberships set role = 'engineer' where user_id = b;
      get diagnostics n = row_count;
      res := res || array['15c|B cannot change B''s own role|' || case when n = 0 then 'PASS|0 rows affected' else 'FAIL|' || n || ' changed' end];
    exception when others then
      res := res || array['15c|B cannot change B''s own role|PASS|rejected: ' || sqlerrm];
    end;
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);

    -- 16: a login with work can't be deleted (B has iso-test rows right now).
    -- Tried for real, always undone — B is never actually deleted.
    begin
      delete from auth.users where id = b;
      raise exception 'iso-undo';
    exception when others then
      msg := sqlerrm;
    end;
    res := res || array['16a|a login that has jobs cannot be deleted|'
                  || case when msg = 'iso-undo' then 'FAIL|the delete was accepted (undone by this test)'
                          when msg ilike '%foreign key%' then 'PASS|refused'
                          else 'INCONCLUSIVE|' || msg end];
    select count(*) into n from public.sessions where id = 'iso-test-BinA' and user_id = b and org_id = org_a;
    res := res || array['16b|the job B did for A''s business is still there|' || case when n = 1 then 'PASS|' else 'FAIL|gone' end];
  end if;

  delete from public.sessions where id like 'iso-test-%';
  delete from public.records where id like 'iso-test-%';
  delete from public.photos where id like 'iso-test-%';
  -- (No storage cleanup: Supabase blocks SQL deletes on storage tables, and on
  -- a PASS the 4a insert never happened, so there is nothing to clean.)

  insert into _iso_result
  select row_number() over (), split_part(x, '|', 2), split_part(x, '|', 3),
         split_part(x, '|', 1) || ' · ' || split_part(x, '|', 4)
  from unnest(res) as x;
end
$iso$;

select check_name, result, detail from _iso_result order by n;
