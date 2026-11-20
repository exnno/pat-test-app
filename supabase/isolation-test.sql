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
-- V172: CHECKS 37a–37c NEED supabase/v172-recently-deleted.sql RUN FIRST (37a names
-- it if not). With A's job in A's own business, B outside it and then B made a Team
-- leader there can't delete it, see A's Recently deleted, restore it or delete it for
-- good; A (the Owner) deletes it — the job row becomes a marker, the whole job kept in
-- Recently deleted — and restores it; then B's place is put back and the test job,
-- its Recently deleted lines and seat lines removed (one transaction).
-- V171: CHECKS 36a–36c NEED supabase/v171-office-certs.sql RUN FIRST (36a names
-- it if not). With A's locked job in A's own business, B outside it and then B made
-- an Engineer there can't put a certificate number on it; B made Office puts the
-- number and "made by B" on it, and A's unlocked job is refused; then B's place is
-- put back and the test jobs and seat lines removed (one transaction).
-- V170: CHECKS 35a–35c NEED supabase/v170-certificates.sql RUN FIRST (35a names
-- it if not). B outside A's business can't read or number A's certificates; B made
-- an Engineer can't take a number; B made Office takes two numbers in a row (never
-- the same) and may save the settings; then A's settings, counter and B's place are
-- put back and the test's seat lines removed (one transaction).
-- V169: CHECKS 34a–34c NEED supabase/v169-seats.sql RUN FIRST (34a names it if
-- not). The seat record is closed to B; B made an Engineer in A's business is
-- written down as a paid seat that A (the Owner) sees and B (an Engineer) doesn't;
-- then everything is put back and the test's seat lines removed — the seats
-- function never sees them (one transaction), so nobody is emailed or billed.
-- V168: CHECKS 33a–33c NEED supabase/v168-business-plans.sql RUN FIRST (33a names
-- it if not). B reads each of B's businesses' plans and nobody else's; with B in
-- A's business and B's own business made to look lapsed, the photo file of a job
-- of B's own business is refused while a new file is still taken (A's business may
-- upload) — asked of the rule, nothing uploaded; then everything is put back.
-- 19e now uploads the file of a photo row of B's lapsed business (V168: a file is
-- judged by its photo's job).
-- V167: CHECKS 32a–32c NEED supabase/v167-corrections.sql RUN FIRST (32a names
-- it if not). B is put into A's business as Engineer with a locked job; A corrects
-- it (kept with A's name); B can't correct A's job, as an Engineer or once out of
-- the business; then everything is removed.
-- V166: CHECKS 31a–31c NEED supabase/v166-storage.sql RUN FIRST (31a names it
-- if not). A job and a photo of B's are left in A's business with B no longer a
-- member: A sees B's line and job in the business's storage figures; B sees
-- nothing of A's business, nor as an Engineer there; then everything is removed.
-- V93: CHECKS 8a–8c NEED supabase/v93-archive.sql RUN FIRST (8c names it if not).
-- V108: CHECK 8d NEEDS supabase/v108-storage.sql RUN FIRST (8d names it if not).
-- V163: CHECKS 29a–29e NEED supabase/v163-leaving.sql RUN FIRST (29a names it
-- if not). B is put into A's business as Engineer with a test job there; A
-- removes B (cut off now); B can no longer read or change that job, and a new
-- job naming A's business is refused (never filed in B's own); B sees the
-- departure; A still has the job; then everything is removed. B's main business
-- is checked unchanged.
-- V161: CHECKS 28a–28d NEED supabase/v161-signed-out.sql RUN FIRST (28a names it
-- if not). B's requests on a sign-in that has been signed out are refused with
-- an error — the check before every request (28a) and photo files (28b); a live
-- pretend sign-in of B's passes and still can't see A's files (28c); the pretend
-- sign-in is removed (28d).
-- V160: CHECKS 27a–27c NEED supabase/v160-join.sql RUN FIRST (27a names it
-- if not). A invites B as Engineer; a pretend old sign-in of A's is added; B's
-- Join is refused and the invite stays waiting; the sign-in is removed and B
-- joins; then B is taken out and the invite removed. B's main business is
-- checked unchanged. 27a–27b say INCONCLUSIVE while a real phone of A's or B's
-- is below the minimum app version (update it and run again).
-- V159: CHECKS 26a–26e NEED supabase/v159-office.sql RUN FIRST (26a names it
-- if not). B is put into A's business as Office and tries to start a job there,
-- move one in and make it main; then B is taken out and B's test job removed.
-- B's main business is checked unchanged. Nothing is left behind.
-- V157: CHECKS 25a–25e NEED supabase/v157-approvals.sql RUN FIRST (25a names
-- it if not). B is put into A's business as Engineer with a test job there and
-- asks to move it out; A sees it and refuses; then B is taken out and the job and
-- its record removed. Nothing is left behind.
-- V156: CHECKS 24a–24e NEED supabase/v156-devices.sql RUN FIRST (24a names it
-- if not). A pretend sign-in of A's is added for the test and removed (24e);
-- B only tries.
-- V155: CHECKS 23a–23h NEED supabase/v155-invites.sql RUN FIRST (23a names it
-- if not). A invites B as Engineer; B joins, is made Team leader, tries what it
-- mustn't; then B is taken out and every invite removed. B's main business, name
-- and plan are put back as they were. 23a–23f say INCONCLUSIVE while a phone of
-- A's or B's is below the minimum app version (update it and run again).
-- V151: CHECKS 22a–22e NEED supabase/v151-min-version.sql RUN FIRST (22a names
-- it if not). Nothing is changed: B only tries.
-- V150: CHECKS 21a–21h NEED supabase/v150-business-move.sql RUN FIRST (21a names
-- it if not). B is put into A's business as Engineer, moves a test job in and out
-- (A approves), then everything is taken away again; nothing is left behind.
-- V149: CHECKS 20a–20h NEED supabase/v149-business-per-job.sql RUN FIRST (20a names
-- it if not). B is put into A's business as Engineer and taken out again; B's
-- business name is put back as it was. Nothing is left behind.
-- V143: CHECKS 19a–19h NEED supabase/v143-enforcement.sql RUN FIRST (19a names it
-- if not). B's business is made to look lapsed 20 days ago while B tries every
-- kind of upload, then put back exactly as it was (19h). On a PASS nothing is
-- left behind (19e: only if it FAILS is a test file left in B's photo folder).
-- V142: CHECKS 18a–18f NEED supabase/v142-billing.sql RUN FIRST (18a names it
-- if not). Nothing is changed: B only tries.
-- V133: CHECKS 17a–17g NEED supabase/v133-cleanup.sql RUN FIRST (17a names it
-- if not). Test phone rows are removed afterwards.
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
  n int; ok boolean; msg text; plan_after text; plan_before text; plan_try text;
  j bigint; k int;   -- V108 (8d)
  real_a text;   -- V88: one real photo file of A's, if there is one
  thumb_a text;  -- V89: one real preview file of A's, if there is one
  org_a uuid; org_b uuid; team_file text;          -- V113
  r text; g text; rn text; reads boolean;           -- V113
  res text[] := '{}';
  rls_off text;
  lap_b timestamptz; lap_seen timestamptz;          -- V143
  min0 int; ovr0 bigint; got_min int;              -- V151
  inv uuid; inv2 uuid; def_b uuid; plan_b text; skip155 text;   -- V155
  dev_a uuid; devs_a uuid[];                        -- V156
  mv157 uuid; det157 text;                          -- V157
  sid161 uuid; e161 text; f161 text;               -- V161
  e163 text; d163 text;                             -- V163
  own_a uuid; own_b uuid; in168 boolean; g168 text; lap168 timestamptz; f168 boolean; t168 boolean;   -- V168
  r169 text; max169 bigint; own169 int; eng169 int; den169 boolean;                                  -- V169
  r170 text; max170 bigint; had170 boolean; s170 jsonb; nx170 int; t1 int; t2 int; den170 boolean; eng170 boolean; -- V170
  r171 text; max171 bigint; c171 text; -- V171
  r172 text; max172 bigint; c172 text; e172 bigint; -- V172
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
  -- V149 fix (Peter, 6 Nov): B's plan is read FIRST and B tries a DIFFERENT one
  -- (comped, or active if B is already comped). Before, the check tried comped
  -- and failed whenever B was comped all along — a refusal looked like a leak.
  select plan into plan_before from public.profiles where id = b;   -- as B: B may read its own
  plan_try := case when plan_before = 'comped' then 'active' else 'comped' end;
  begin
    update public.profiles set plan = plan_try where id = b;
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
                || case when ok and plan_before is not null and plan_after is not distinct from plan_before
                        then 'PASS|' || msg || ' (tried ' || plan_try || ', still ' || plan_before || ')'
                        else 'FAIL|' || msg || ', tried ' || coalesce(plan_try, '?') || ', was '
                             || coalesce(plan_before, '(no profile)') || ', now ' || coalesce(plan_after, '(no profile)') end];

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
    -- V149: the stamp keeps a named business only for a member, so B is a member
    -- while the seed goes in, then leaves — B's jobs done for A, as a leaver's.
    insert into public.memberships (org_id, user_id, role) values (org_a, b, 'engineer')
    on conflict (org_id, user_id) do nothing;
    insert into public.sessions (id, user_id, org_id, doc, last_modified)
    values ('iso-test-BinA', b, org_a, '{"owner":"B for A"}', now());
    insert into public.photos (id, user_id, org_id, session_id, item_id, storage_path, last_modified)
    values ('iso-test-BinA', b, org_a, 'iso-test-BinA', 'x', b::text || '/iso-test-BinA.jpg', now());
    delete from public.memberships where org_id = org_a and user_id = b;

    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    -- 9b: not a member, B can't put a row into A's business. V149: a job naming
    -- a business its writer isn't in is filed under the writer's own instead —
    -- refused (before V149) or landed in B's own (V149) are both a PASS.
    begin
      insert into public.sessions (id, user_id, org_id, doc, last_modified)
      values ('iso-test-forged2', b, org_a, '{}', now());
      execute 'reset role';
      select count(*) into n from public.sessions where id = 'iso-test-forged2' and user_id = b and org_id = org_a;
      res := res || array['9b|B cannot put a job into A''s business|' || case when n = 0 then 'PASS|filed under B''s own (V149)' else 'FAIL|it is in A''s business' end];
      delete from public.sessions where id = 'iso-test-forged2' and user_id = b;
      perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
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
        -- (V150 fix: a business B OWNS may rightly show B its members — e.g. the V149
        -- test aid's PATGo Test Team with A as Engineer; those are left out.)
        select count(*) into n from public.memberships m where m.user_id = a
          and m.org_id not in (select o.org_id from public.memberships o where o.user_id = b and o.role = 'owner');
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


  -- V133: the phones table (4A) and the clean-up job's own tables.
  if to_regclass('public.phones') is null then
    res := res || array['17a|phones|FAIL|run supabase/v133-cleanup.sql first'];
  else
    delete from public.phones where phone_id like 'iso-test-%';
    insert into public.phones (user_id, phone_id, app_version) values (a, 'iso-test-phone-A', 'V133');
    select mode into g from public.cleanup_settings where id = 1;
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    -- 17a control: B can report B's own phone.
    begin
      insert into public.phones (user_id, phone_id, app_version) values (b, 'iso-test-phone-B', 'V133');
      update public.phones set app_version = 'V134' where user_id = b and phone_id = 'iso-test-phone-B';
      select count(*) into n from public.phones where phone_id = 'iso-test-phone-B';
      res := res || array['17a|control: B can report and read B''s own phone|' || case when n = 1 then 'PASS|' else 'FAIL|saw ' || n end];
    exception when others then
      res := res || array['17a|control: B can report and read B''s own phone|FAIL|' || sqlerrm];
    end;
    -- 17b: B cannot see A's phones.
    select count(*) into n from public.phones where user_id = a;
    res := res || array['17b|B cannot see A''s phones|' || case when n = 0 then 'PASS|' else 'FAIL|saw ' || n end];
    -- 17c: B cannot report a phone as A.
    begin
      insert into public.phones (user_id, phone_id, app_version) values (a, 'iso-test-forged', 'V999');
      res := res || array['17c|B cannot report a phone as A|FAIL|insert was accepted'];
    exception when others then
      res := res || array['17c|B cannot report a phone as A|PASS|rejected'];
    end;
    -- 17d: B cannot change or remove A's phone (or even B's own: no delete route).
    begin
      update public.phones set app_version = 'V999' where user_id = a;
      get diagnostics n = row_count;
      delete from public.phones where phone_id like 'iso-test-phone-%';
      get diagnostics k = row_count;
      res := res || array['17d|B cannot change A''s phone; nobody deletes phones from the app|'
                    || case when n = 0 and k = 0 then 'PASS|0 rows affected' else 'FAIL|' || n || ' changed, ' || k || ' deleted' end];
    exception when others then
      res := res || array['17d|B cannot change A''s phone; nobody deletes phones from the app|PASS|rejected: ' || sqlerrm];
    end;
    -- 17e: the job's settings and its run log are closed to the app.
    begin
      select count(*) into n from public.cleanup_runs;
      msg := 'read ' || n || ' line(s)';
      ok := false;
    exception when others then
      ok := true; msg := 'rejected';
    end;
    begin
      update public.cleanup_settings set mode = 'clear';
      get diagnostics n = row_count;
      ok := ok and n = 0;
    exception when others then
      null;
    end;
    res := res || array['17e|the clean-up job''s settings and log are closed to the app|' || case when ok then 'PASS|' || msg else 'FAIL|' || msg end];
    -- 17f: nobody can start the job from the app.
    begin
      perform public.run_cleanup(true);
      res := res || array['17f|B cannot start the clean-up job|FAIL|it ran'];
    exception when others then
      res := res || array['17f|B cannot start the clean-up job|PASS|refused'];
    end;
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    select count(*) into n from public.cleanup_settings where id = 1 and mode is not distinct from g;
    select count(*) into k from public.phones where user_id = a and phone_id = 'iso-test-phone-A' and app_version = 'V133';
    res := res || array['17g|A''s phone and the job''s mode are unchanged|'
                  || case when k = 1 and n = 1 then 'PASS|mode: ' || coalesce(g, '?') else 'FAIL|' || case when k <> 1 then 'A''s phone changed' else 'the mode changed' end end];
    delete from public.phones where phone_id like 'iso-test-%';
  end if;

  -- ================================================================ V142
  -- Paying: the plan on the business, Stripe's side closed to the app.
  if to_regprocedure('public.my_billing()') is null then
    res := res || array['18a|billing|FAIL|run supabase/v142-billing.sql first'];
  else
    org_a := public.default_org(a);
    org_b := public.default_org(b);
    select plan into g from public.organisations where id = org_a;
    select plan into rn from public.organisations where id = org_b;
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    -- 18a control: B reads B's own plan.
    begin
      r := public.my_billing()->>'plan';
      res := res || array['18a|control: B reads B''s own plan|' || case when r is not distinct from rn then 'PASS|' || coalesce(r, '?') else 'FAIL|read ' || coalesce(r, 'nothing') end];
    exception when others then
      res := res || array['18a|control: B reads B''s own plan|FAIL|' || sqlerrm];
    end;
    -- 18b: the Stripe ids are never readable from the app, even B's own.
    begin
      select count(stripe_customer) into n from public.organisations where id = org_b;
      res := res || array['18b|B cannot read the Stripe ids|FAIL|read them'];
    exception when others then
      res := res || array['18b|B cannot read the Stripe ids|PASS|rejected'];
    end;
    -- 18c: B cannot see A's business or its plan.
    begin
      select count(*) into n from public.organisations where id = org_a;
      res := res || array['18c|B cannot see A''s business|' || case when n = 0 then 'PASS|' else 'FAIL|saw it' end];
    exception when others then
      res := res || array['18c|B cannot see A''s business|PASS|rejected'];
    end;
    -- 18d: B cannot change a plan — the business's or the profile's copy.
    k := 0;
    begin
      update public.organisations set plan = 'comped' where id in (org_a, org_b);
      get diagnostics n = row_count; k := k + n;
    exception when others then null;
    end;
    begin
      update public.profiles set plan = 'comped' where id in (a, b);
      get diagnostics n = row_count; k := k + n;
    exception when others then null;
    end;
    res := res || array['18d|B cannot change any plan|' || case when k = 0 then 'PASS|' else 'FAIL|' || k || ' changed' end];
    -- 18e: the server's side (secret key only) is closed to the app.
    k := 0;
    begin perform public.billing_apply(org_b, 'cus_iso', 'sub_iso', 'active', 'year', now(), false); k := k + 1; exception when others then null; end;
    begin perform public.billing_context(a); k := k + 1; exception when others then null; end;
    begin perform public.billing_set_customer(org_b, 'cus_iso'); k := k + 1; exception when others then null; end;
    begin perform public.billing_event_log('evt_iso', 'iso', org_b, 'iso'); k := k + 1; exception when others then null; end;
    begin select count(*) into n from public.billing_events; k := k + 1; exception when others then null; end;
    res := res || array['18e|B cannot reach the server''s billing side|' || case when k = 0 then 'PASS|5 refused' else 'FAIL|' || k || ' of 5 allowed' end];
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    -- 18f: nothing changed.
    select count(*) into n from public.organisations where (id = org_a and plan is not distinct from g)
                                                       or (id = org_b and plan is not distinct from rn);
    select count(*) into k from public.organisations where id in (org_a, org_b) and stripe_customer = 'cus_iso';
    res := res || array['18f|A''s and B''s plans are unchanged|' || case when n = 2 and k = 0 then 'PASS|' else 'FAIL|' || n || ' of 2 unchanged' end];
  end if;

  -- ================================================================ V143
  -- Enforcement: a locked business's uploads are refused; reading never is.
  if to_regprocedure('public.can_upload(uuid)') is null then
    res := res || array['19a|enforcement|FAIL|run supabase/v143-enforcement.sql first'];
  else
    org_b := public.default_org(b);
    select plan, lapsed_at into g, lap_b from public.organisations where id = org_b;
    -- 19a control: B reads B's own lapse date, the same as the business's.
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      select lapsed_at into lap_seen from public.profiles where id = b;
      res := res || array['19a|control: B reads B''s own lapse date|' || case when lap_seen is not distinct from lap_b then 'PASS|' || coalesce(lap_seen::text, 'none (not lapsed)') else 'FAIL|read ' || coalesce(lap_seen::text, 'nothing') end];
    exception when others then
      res := res || array['19a|control: B reads B''s own lapse date|FAIL|' || sqlerrm];
    end;
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    -- One job of B's (written as the dashboard, never refused), then B's
    -- business made to look lapsed 20 days ago.
    insert into public.sessions (id, user_id, doc, last_modified) values ('iso-test-v143', b, '{"items":[]}', now());
    -- V168: and a photo row of that job (its business is B's), for 19e.
    insert into public.photos (id, user_id, session_id, item_id, storage_path, last_modified, org_id)
    values ('iso-test-v143-f', b, 'iso-test-v143', 'i1', b::text || '/iso-test-v143-f.jpg', now(), org_b);
    update public.organisations set plan = 'lapsed', lapsed_at = now() - interval '20 days' where id = org_b;
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    -- 19b: a new job.
    begin
      insert into public.sessions (id, user_id, doc, last_modified) values ('iso-test-v143-new', b, '{}', now());
      res := res || array['19b|a locked business cannot add a job|FAIL|accepted'];
    exception when others then
      res := res || array['19b|a locked business cannot add a job|' || case when sqlerrm like 'patgo_plan_locked%' then 'PASS|refused' else 'FAIL|refused, but not by the plan: ' || sqlerrm end];
    end;
    -- 19c: a change to a job already in the cloud.
    begin
      update public.sessions set doc = '{"items":[1]}' where user_id = b and id = 'iso-test-v143';
      get diagnostics n = row_count;
      res := res || array['19c|…nor change one already in the cloud|' || case when n = 0 then 'FAIL|not reached (0 rows)' else 'FAIL|accepted' end];
    exception when others then
      res := res || array['19c|…nor change one already in the cloud|' || case when sqlerrm like 'patgo_plan_locked%' then 'PASS|refused' else 'FAIL|' || sqlerrm end];
    end;
    -- 19d: settings and a photo row.
    k := 0;
    begin
      insert into public.records (id, user_id, kind, doc, last_modified) values ('iso-test-v143', b, 'client', '{}', now());
    exception when others then if sqlerrm like 'patgo_plan_locked%' then k := k + 1; end if;
    end;
    begin
      insert into public.photos (id, user_id, session_id, item_id, storage_path, last_modified)
      values ('iso-test-v143', b, 'iso-test-v143', 'i1', b::text || '/iso-test-v143.jpg', now());
    exception when others then if sqlerrm like 'patgo_plan_locked%' then k := k + 1; end if;
    end;
    res := res || array['19d|…nor send settings or a photo|' || case when k = 2 then 'PASS|2 refused' else 'FAIL|' || k || ' of 2 refused' end];
    -- 19e: the photo FILE of that job's photo, in B's own folder. (V168: a file
    -- is judged by its photo's job — a new file with no photo row yet by any of
    -- B's businesses, which 33b checks without uploading anything.)
    begin
      insert into storage.objects (bucket_id, name) values ('photos', b::text || '/iso-test-v143-f.jpg');
      res := res || array['19e|…nor upload a photo file|FAIL|accepted — remove photos/' || b::text || '/iso-test-v143-f.jpg by hand'];
    exception when others then
      res := res || array['19e|…nor upload a photo file|PASS|refused'];
    end;
    -- 19f: reading is never refused.
    select count(*) into n from public.sessions where user_id = b and id = 'iso-test-v143';
    res := res || array['19f|a locked business still reads its jobs|' || case when n = 1 then 'PASS|' else 'FAIL|read ' || n end];
    -- 19g: B cannot get round it — its plan and date are not B's to change, and
    -- the rule itself is not B's to call.
    k := 0;
    begin update public.organisations set plan = 'active', lapsed_at = null where id = org_b; get diagnostics n = row_count; k := k + n; exception when others then null; end;
    begin update public.profiles set lapsed_at = now() where id = b; get diagnostics n = row_count; k := k + n; exception when others then null; end;
    begin perform public.can_upload(org_b); k := k + 1; exception when others then null; end;
    res := res || array['19g|B cannot undo its own lock|' || case when k = 0 then 'PASS|3 refused' else 'FAIL|' || k || ' allowed' end];
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    -- 19h: B's business exactly as it was, and B's copy with it.
    update public.organisations set plan = g, lapsed_at = lap_b where id = org_b;
    select count(*) into n from public.organisations where id = org_b and plan is not distinct from g and lapsed_at is not distinct from lap_b;
    select count(*) into k from public.profiles where id = b and plan is not distinct from g and lapsed_at is not distinct from lap_b;
    res := res || array['19h|B''s plan and lapse date are put back|' || case when n = 1 and k = 1 then 'PASS|' || g else 'FAIL|business ' || n || ', profile ' || k end];
  end if;

  -- ========================================================== V149 (20a–20h)
  -- Every job knows its business. B names A's business on a new job while NOT a
  -- member (→ B's own), then as A's Engineer (→ A's, its photo too); an update
  -- naming B's own never moves it; B can't name A's business, A can (put back).
  if to_regprocedure('public.my_businesses()') is null then
    res := res || array['20a|business per job|FAIL|run supabase/v149-business-per-job.sql first'];
  else
    org_a := public.default_org(a);
    org_b := public.default_org(b);
    select name into g from public.organisations where id = org_a;
    select name into msg from public.organisations where id = org_b;   -- put back at 20h
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    -- 20a: not a member — the named business is not kept.
    begin
      insert into public.sessions (id, user_id, doc, last_modified, org_id)
      values ('iso-test-v149-1', b, '{"v149":1}', now(), org_a);
      execute 'reset role';
      select count(*) into n from public.sessions where id = 'iso-test-v149-1' and user_id = b and org_id = org_b;
      res := res || array['20a|B naming A''s business (not a member) gets B''s own|' || case when n = 1 then 'PASS|' else 'FAIL|stamped elsewhere' end];
    exception when others then
      execute 'reset role';
      res := res || array['20a|B naming A''s business (not a member) gets B''s own|FAIL|' || sqlerrm];
    end;
    perform set_config('request.jwt.claims', '', true);
    -- 20b–20d: B as A's Engineer.
    insert into public.memberships (org_id, user_id, role) values (org_a, b, 'engineer')
    on conflict (org_id, user_id) do update set role = excluded.role;
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      insert into public.sessions (id, user_id, doc, last_modified, org_id)
      values ('iso-test-v149-2', b, '{"v149":2}', now(), org_a);
      insert into public.photos (id, user_id, session_id, item_id, storage_path, last_modified)
      values ('iso-test-v149-p', b, 'iso-test-v149-2', 'i1', b::text || '/iso-test-v149-p.jpg', now());
      update public.sessions set doc = '{"v149":3}', org_id = org_b where id = 'iso-test-v149-2' and user_id = b;
      execute 'reset role';
      select count(*) into n from public.sessions where id = 'iso-test-v149-2' and user_id = b and org_id = org_a;
      select count(*) into k from public.photos where id = 'iso-test-v149-p' and user_id = b and org_id = org_a;
      res := res || array['20b|B (A''s Engineer) naming A''s business keeps it|' || case when n = 1 then 'PASS|' else 'FAIL|not kept' end];
      res := res || array['20c|…its photo follows the job, not B''s default|' || case when k = 1 then 'PASS|' else 'FAIL|not followed' end];
      select count(*) into n from public.sessions where id = 'iso-test-v149-2' and doc->>'v149' = '3' and org_id = org_a;
      res := res || array['20d|…and an update naming B''s own never moves it|' || case when n = 1 then 'PASS|' else 'FAIL|moved' end];
    exception when others then
      execute 'reset role';
      res := res || array['20b|B (A''s Engineer) naming A''s business keeps it|FAIL|' || sqlerrm];
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    -- 20e: B's list shows both, B's own first (the default).
    begin
      -- (V150 fix: only A's and B's own count — other businesses, e.g. the V149 test
      -- aid's PATGo Test Team, may be listed too.)
      select count(*) into n from public.my_businesses() x where x.id in (org_a, org_b);
      select count(*) into k from public.my_businesses() x where x.id = org_a and x.role = 'engineer' and not x.is_default;
      res := res || array['20e|B''s businesses: two, A''s as Engineer|' || case when n = 2 and k = 1 then 'PASS|' else 'FAIL|' || n || ' listed' end];
    exception when others then
      res := res || array['20e|B''s businesses: two, A''s as Engineer|FAIL|' || sqlerrm];
    end;
    -- 20f: an Engineer cannot name A's business; nor write the table directly.
    k := 0;
    begin perform public.set_business_name(org_a, 'iso-test-v149'); k := k + 1; exception when others then null; end;
    begin update public.organisations set name = 'iso-test-v149' where id = org_a; get diagnostics n = row_count; k := k + n; exception when others then null; end;
    res := res || array['20f|B (Engineer) cannot rename A''s business|' || case when k = 0 then 'PASS|refused' else 'FAIL|' || k || ' allowed' end];
    -- 20g: B CAN name B's own (control), put back below.
    begin
      perform public.set_business_name(org_b, ' iso-test-v149 ');
      execute 'reset role';
      select count(*) into n from public.organisations where id = org_b and name = 'iso-test-v149';
      res := res || array['20g|control: an Owner names their own business (trimmed)|' || case when n = 1 then 'PASS|' else 'FAIL|not named' end];
    exception when others then
      execute 'reset role';
      res := res || array['20g|control: an Owner names their own business (trimmed)|FAIL|' || sqlerrm];
    end;
    perform set_config('request.jwt.claims', '', true);
    -- 20h: everything put back — B out of A's business, names as they were.
    delete from public.photos where id = 'iso-test-v149-p' and user_id = b;
    delete from public.memberships where org_id = org_a and user_id = b;
    select name into rn from public.organisations where id = org_a;
    update public.organisations set name = coalesce(msg, '') where id = org_b;
    select count(*) into n from public.memberships where org_id = org_a and user_id = b;
    select count(*) into k from public.organisations where id = org_b and name is not distinct from coalesce(msg, '');
    res := res || array['20h|B out of A''s business; A''s name untouched, B''s put back|' || case when n = 0 and k = 1 and rn is not distinct from g then 'PASS|' else 'FAIL|' || n || ' left, A''s name ' || coalesce(rn, '?') || ', B''s ' || k end];
  end if;

  -- ========================================================== V150 (21a–21h)
  -- Moving a job (Change…). B's own job goes into A's business (B is A's
  -- Engineer) at once; out again it waits; B can't approve it or write the
  -- record; A (Owner) approves; B can't move A's job, or into a business B isn't
  -- in, or a locked job. Everything put back (21h).
  if to_regprocedure('public.move_job(text,uuid)') is null then
    res := res || array['21a|moving a job|FAIL|run supabase/v150-business-move.sql first'];
  elsif not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                    where s.nspname = 'public' and p.proname = 'org_stamp' and p.prosrc like '%patgo.job_move%') then
    res := res || array['21a|moving a job|FAIL|the business stamp is an older one — run supabase/v150-business-move.sql again'];
  else
    org_a := public.default_org(a);
    org_b := public.default_org(b);
    delete from public.job_moves where session_id like 'iso-test-%';
    insert into public.memberships (org_id, user_id, role) values (org_a, b, 'engineer')
    on conflict (org_id, user_id) do update set role = excluded.role;
    insert into public.sessions (id, user_id, doc, last_modified) values ('iso-test-v150-1', b, '{"v150":1}', now());
    insert into public.photos (id, user_id, session_id, item_id, storage_path, last_modified)
    values ('iso-test-v150-p', b, 'iso-test-v150-1', 'i1', b::text || '/iso-test-v150-p.jpg', now());
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    -- 21a: out of B's own business (B is its Owner) → moved at once, photo too.
    begin
      msg := public.move_job('iso-test-v150-1', org_a);
      execute 'reset role';
      select count(*) into n from public.sessions where id = 'iso-test-v150-1' and user_id = b and org_id = org_a;
      select count(*) into k from public.photos where id = 'iso-test-v150-p' and user_id = b and org_id = org_a;
      res := res || array['21a|B moves B''s own job into A''s business: at once, photo too|' || case when msg = 'moved' and n = 1 and k = 1 then 'PASS|' else 'FAIL|' || coalesce(msg, '?') || ', job ' || n || ', photo ' || k end];
    exception when others then
      execute 'reset role';
      res := res || array['21a|B moves B''s own job into A''s business: at once, photo too|FAIL|' || sqlerrm];
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    -- 21b: back out of A's business as its Engineer → waits; the job stays.
    begin
      msg := public.move_job('iso-test-v150-1', org_b);
      select count(*) into n from public.sessions where id = 'iso-test-v150-1' and org_id = org_a;
      res := res || array['21b|…out of A''s business as Engineer: it waits, the job stays|' || case when msg = 'waiting' and n = 1 then 'PASS|' else 'FAIL|' || coalesce(msg, '?') || ', ' || n end];
    exception when others then
      res := res || array['21b|…out of A''s business as Engineer: it waits, the job stays|FAIL|' || sqlerrm];
    end;
    -- 21c: B can't approve B's own request, nor write the record directly.
    k := 0;
    select id into team_file from (select x.id::text as id from public.job_moves x where x.session_id = 'iso-test-v150-1' and x.status = 'waiting') y;
    begin perform public.decide_job_move(team_file::uuid, true); k := k + 1; exception when others then null; end;
    begin update public.job_moves set status = 'moved' where id = team_file::uuid; get diagnostics n = row_count; k := k + n; exception when others then null; end;
    begin delete from public.job_moves where id = team_file::uuid; get diagnostics n = row_count; k := k + n; exception when others then null; end;
    begin insert into public.job_moves (user_id, session_id, from_org, to_org, requested_by, status)
          values (b, 'iso-test-v150-1', org_a, org_b, b, 'moved'); k := k + 1; exception when others then null; end;
    execute 'reset role';
    select count(*) into n from public.sessions where id = 'iso-test-v150-1' and org_id = org_a;
    res := res || array['21c|B can''t approve B''s own request or write the record|' || case when k = 0 and n = 1 then 'PASS|refused' else 'FAIL|' || k || ' allowed' end];
    -- 21d: B takes it back, asks again; A (Owner) approves → back in B's, photo too.
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      g := public.cancel_job_move(team_file::uuid);
      msg := public.move_job('iso-test-v150-1', org_b);
      select x.id::text into team_file from public.job_moves x where x.session_id = 'iso-test-v150-1' and x.status = 'waiting';
      execute 'reset role';
      perform set_config('request.jwt.claims', json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      begin perform public.cancel_job_move(team_file::uuid); g := 'A cancelled B''s request'; exception when others then null; end;
      rn := public.decide_job_move(team_file::uuid, true);
      execute 'reset role';
      select count(*) into n from public.sessions where id = 'iso-test-v150-1' and org_id = org_b;
      select count(*) into k from public.photos where id = 'iso-test-v150-p' and org_id = org_b;
      res := res || array['21d|B cancels and asks again; A can''t cancel it but approves: back in B''s, photo too|' || case when g = 'cancelled' and msg = 'waiting' and rn = 'moved' and n = 1 and k = 1 then 'PASS|' else 'FAIL|' || coalesce(g, '?') || ', ' || coalesce(msg, '?') || ', ' || coalesce(rn, '?') || ', job ' || n || ', photo ' || k end];
    exception when others then
      execute 'reset role';
      res := res || array['21d|B cancels and asks again; A (Owner) approves: back in B''s, photo too|FAIL|' || sqlerrm];
    end;
    -- 21e: B can't move A's job, nor into a business B isn't in.
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    k := 0;
    begin perform public.move_job('iso-test-A', org_b); k := k + 1; exception when others then null; end;
    begin perform public.move_job('iso-test-v150-1', gen_random_uuid()); k := k + 1; exception when others then null; end;
    execute 'reset role';
    select count(*) into n from public.sessions where id = 'iso-test-A' and user_id = a and org_id = org_a;
    res := res || array['21e|B can''t move A''s job, or into a business B isn''t in|' || case when k = 0 and n = 1 then 'PASS|refused' else 'FAIL|' || k || ' allowed' end];
    -- 21f: A (Owner) reads the record of moves through A's business; B's list
    -- has B's job only; A's own list has none (B's job is not A's).
    perform set_config('request.jwt.claims', json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.job_moves where session_id = 'iso-test-v150-1';
    select count(*) into k from public.my_job_moves() x where x.session_id like 'iso-test-%';   -- A's real moves aside
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into j from public.my_job_moves() x where x.session_id = 'iso-test-v150-1' and x.status = 'moved';
    execute 'reset role';
    res := res || array['21f|A sees the moves through A''s business; each list is its own jobs|' || case when n = 3 and k = 0 and j = 1 then 'PASS|' else 'FAIL|' || n || ' seen, A ' || k || ', B ' || j end];
    -- 21g: a locked job stays where it is.
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.sessions set doc = '{"v150":2,"locked":true}' where id = 'iso-test-v150-1' and user_id = b;
    begin
      perform public.move_job('iso-test-v150-1', org_a);
      execute 'reset role';
      res := res || array['21g|a locked job stays where it is|FAIL|moved'];
    exception when others then
      execute 'reset role';
      select count(*) into n from public.sessions where id = 'iso-test-v150-1' and org_id = org_b;
      res := res || array['21g|a locked job stays where it is|' || case when n = 1 and sqlerrm like 'patgo_move_locked%' then 'PASS|refused' else 'FAIL|' || sqlerrm end];
    end;
    perform set_config('request.jwt.claims', '', true);
    -- 21h: put back — B out of A's business, the test job, photo and record gone.
    delete from public.job_moves where session_id like 'iso-test-%';
    delete from public.photos where id = 'iso-test-v150-p' and user_id = b;
    delete from public.sessions where id = 'iso-test-v150-1' and user_id = b;
    delete from public.memberships where org_id = org_a and user_id = b;
    select count(*) into n from public.memberships where org_id = org_a and user_id = b;
    select count(*) into k from public.job_moves where session_id like 'iso-test-%';
    res := res || array['21h|B out of A''s business; nothing left behind|' || case when n = 0 and k = 0 then 'PASS|' else 'FAIL|' || n || ' membership, ' || k || ' records left' end];
  end if;

  -- ------------------------------------------------- V151: the minimum app version
  if to_regclass('public.app_settings') is null or to_regprocedure('public.my_min_version()') is null then
    res := res || array['22a|the minimum app version|FAIL|run supabase/v151-min-version.sql first'];
  else
    select min_version into min0 from public.app_settings where id = 1;
    select count(*) into ovr0 from public.app_min_overrides;
    -- 22a (control): B reads B's own minimum — the setting, B having no raise of its own.
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      got_min := public.my_min_version();
      execute 'reset role';
      res := res || array['22a|control: B reads B''s own minimum|' || case when got_min = public.app_min_version_for(b) then 'PASS|' || got_min else 'FAIL|' || coalesce(got_min::text, 'nothing') end];
    exception when others then
      execute 'reset role';
      res := res || array['22a|control: B reads B''s own minimum|FAIL|' || sqlerrm];
    end;
    -- 22b: B can't read the setting or anyone's raise directly.
    execute 'set local role authenticated';
    k := 0;
    begin perform 1 from public.app_settings; exception when others then k := k + 1; end;
    begin perform 1 from public.app_min_overrides; exception when others then k := k + 1; end;
    execute 'reset role';
    res := res || array['22b|B can''t read the setting or anyone''s raise directly|' || case when k = 2 then 'PASS|2 refused' else 'FAIL|' || (2 - k) || ' readable' end];
    -- 22c: B can't change the minimum — the setting, its own, or A's.
    execute 'set local role authenticated';
    k := 0;
    begin update public.app_settings set min_version = 1 where id = 1; get diagnostics n = row_count; if n = 0 then k := k + 1; end if; exception when others then k := k + 1; end;
    begin insert into public.app_min_overrides (user_id, min_version) values (b, 1); exception when others then k := k + 1; end;
    begin insert into public.app_min_overrides (user_id, min_version) values (a, 999999); exception when others then k := k + 1; end;
    execute 'reset role';
    res := res || array['22c|B can''t change the minimum (the setting, B''s, A''s)|' || case when k = 3 then 'PASS|3 refused' else 'FAIL|' || (3 - k) || ' accepted' end];
    -- 22d: B can't ask the database's own questions; signed out, nobody reads a minimum.
    execute 'set local role authenticated';
    k := 0;
    begin perform public.app_min_version_for(a); exception when others then k := k + 1; end;
    begin perform public.org_phones_behind(org_a); exception when others then k := k + 1; end;
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    execute 'set local role anon';
    begin perform public.my_min_version(); exception when others then k := k + 1; end;
    execute 'reset role';
    res := res || array['22d|B can''t ask about A or A''s business; signed out, no minimum|' || case when k = 3 then 'PASS|3 refused' else 'FAIL|' || (3 - k) || ' answered' end];
    -- 22e (admin): nothing changed.
    select count(*) into n from public.app_min_overrides;
    res := res || array['22e|the minimum and the raises are as they were|' || case when (select min_version from public.app_settings where id = 1) = min0 and n = ovr0 then 'PASS|' || min0 else 'FAIL|setting ' || (select min_version from public.app_settings where id = 1) || ', raises ' || n end];
  end if;

  -- ------------------------------------------------- V155: invites and roles (23a–23h)
  if to_regprocedure('public.invite_member(uuid,text,text,text)') is null then
    res := res || array['23a|invites|FAIL|run supabase/v155-invites.sql first'];
  else
    org_a := public.default_org(a);
    def_b := public.default_org(b);
    select plan into plan_b from public.profiles where id = b;
    delete from public.invites where org_id = org_a and email = (select lower(btrim(email)) from auth.users where id = b);
    delete from public.memberships where org_id = org_a and user_id = b;
    skip155 := null;
    -- 23a: A (Owner) invites B's address as Engineer.
    perform set_config('request.jwt.claims', json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      inv := public.invite_member(org_a, email_b, 'Iso Test B', 'engineer');
      execute 'reset role';
      res := res || array['23a|A (Owner) invites B as Engineer|PASS|'];
    exception when others then
      execute 'reset role';
      if sqlerrm like 'patgo_phones_behind%' then skip155 := 'a phone in A''s business is below the minimum app version';
      else res := res || array['23a|A (Owner) invites B as Engineer|FAIL|' || sqlerrm]; skip155 := 'see 23a'; end if;
    end;
    if skip155 is not null then
      if skip155 <> 'see 23a' then
        res := res || array['23a|A (Owner) invites B as Engineer|INCONCLUSIVE|' || skip155];
      end if;
      res := res || array['23b|B can''t read or write invites, or invite into A''s business|INCONCLUSIVE|' || skip155];
    else
      -- 23b: B can't touch invites directly, can't invite into A's business, and
      -- (not yet a member) sees none of A's people or invites.
      perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      k := 0;
      begin perform 1 from public.invites; exception when others then k := k + 1; end;
      begin update public.invites set status = 'joined' where id = inv; exception when others then k := k + 1; end;
      begin insert into public.memberships (org_id, user_id, role) values (org_a, b, 'owner'); exception when others then k := k + 1; end;
      begin perform public.invite_member(org_a, 'iso-test-155@example.invalid', 'X', 'engineer'); exception when others then k := k + 1; end;
      begin perform public.set_member_role(org_a, b, 'team_leader'); exception when others then k := k + 1; end;
      select count(*) into n from public.business_people() x where x.business_id = org_a;
      select count(*) + n into n from public.business_invites() x where x.business_id = org_a;
      execute 'reset role';
      res := res || array['23b|B can''t read or write invites, or invite into A''s business|' || case when k = 5 and n = 0 then 'PASS|5 refused, nothing seen' else 'FAIL|' || (5 - k) || ' allowed, ' || n || ' seen' end];
    end if;
    -- 23c: B sees the invite and joins (A's business not made main).
    if skip155 is null then
      perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      begin
        select count(*) into n from public.my_invites() x where x.id = inv;
        msg := public.accept_invite(inv, false);
        execute 'reset role';
        res := res || array['23c|B sees the invite and joins as Engineer; B''s main business unchanged|'
          || case when n = 1 and msg = 'joined' and public.member_role(org_a, b) = 'engineer' and public.default_org(b) = def_b then 'PASS|' else 'FAIL|' || n || ', ' || coalesce(msg, '?') end];
      exception when others then
        execute 'reset role';
        if sqlerrm like 'patgo_your_phones_behind%' then skip155 := 'a phone of B''s is below the minimum app version';
          res := res || array['23c|B sees the invite and joins as Engineer; B''s main business unchanged|INCONCLUSIVE|' || skip155];
        else res := res || array['23c|B sees the invite and joins as Engineer; B''s main business unchanged|FAIL|' || sqlerrm]; skip155 := 'see 23c'; end if;
      end;
    else
      res := res || array['23c|B sees the invite and joins as Engineer; B''s main business unchanged|INCONCLUSIVE|' || skip155];
    end if;
    if skip155 is null then
      -- 23d: B as Engineer: no invites, no roles, no addresses, no invite list.
      perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      k := 0;
      begin perform public.invite_member(org_a, 'iso-test-155@example.invalid', 'X', 'engineer'); exception when others then k := k + 1; end;
      begin perform public.set_member_role(org_a, b, 'team_leader'); exception when others then k := k + 1; end;
      begin perform public.set_member_role(org_a, a, 'engineer'); exception when others then k := k + 1; end;
      select count(*) into n from public.business_people() x where x.business_id = org_a and x.email is not null;
      select count(*) + n into n from public.business_invites() x where x.business_id = org_a;
      select count(*) into j from public.business_people() x where x.business_id = org_a;
      execute 'reset role';
      res := res || array['23d|B as Engineer: can''t invite or change roles; sees names, not addresses or invites|'
        || case when k = 3 and n = 0 and j >= 2 then 'PASS|' || j || ' people' else 'FAIL|' || (3 - k) || ' allowed, ' || n || ' addresses/invites seen' end];
      -- 23e: A makes B Team leader; B may offer Engineer only, and now sees addresses.
      perform set_config('request.jwt.claims', json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      msg := public.set_member_role(org_a, b, 'team_leader');
      execute 'reset role';
      perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      k := 0;
      begin perform public.invite_member(org_a, 'iso-test-155@example.invalid', 'X', 'office'); exception when others then k := k + 1; end;
      begin perform public.set_member_role(org_a, a, 'engineer'); exception when others then k := k + 1; end;
      begin inv2 := public.invite_member(org_a, 'iso-test-155@example.invalid', 'X', 'engineer'); exception when others then inv2 := null; end;
      select count(*) into n from public.business_people() x where x.business_id = org_a and x.email is not null;
      execute 'reset role';
      res := res || array['23e|B as Team leader: offers Engineer only, can''t change A; sees addresses|'
        || case when msg = 'team_leader' and k = 2 and inv2 is not null and n >= 2 then 'PASS|' else 'FAIL|' || coalesce(msg, '?') || ', ' || (2 - k) || ' allowed, invite ' || coalesce(inv2::text, 'refused') || ', ' || n || ' addresses' end];
      -- 23f: B can't accept or decline an invite that isn't B's; Make main only for B's own businesses.
      perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      k := 0;
      begin perform public.accept_invite(inv2, false); exception when others then k := k + 1; end;
      begin perform public.decline_invite(inv2); exception when others then k := k + 1; end;
      begin perform public.set_main_business(gen_random_uuid()); exception when others then k := k + 1; end;
      execute 'reset role';
      res := res || array['23f|B can''t answer someone else''s invite, or make a stranger business main|' || case when k = 3 then 'PASS|3 refused' else 'FAIL|' || (3 - k) || ' allowed' end];
    else
      res := res || array['23d|B as Engineer: can''t invite or change roles; sees names, not addresses or invites|INCONCLUSIVE|' || skip155];
      res := res || array['23e|B as Team leader: offers Engineer only, can''t change A; sees addresses|INCONCLUSIVE|' || skip155];
      res := res || array['23f|B can''t answer someone else''s invite, or make a stranger business main|INCONCLUSIVE|' || skip155];
    end if;
    -- 23g: signed out, nothing.
    perform set_config('request.jwt.claims', '', true);
    execute 'set local role anon';
    k := 0;
    begin perform public.my_invites(); exception when others then k := k + 1; end;
    begin perform public.business_people(); exception when others then k := k + 1; end;
    begin perform public.invite_member(org_a, 'iso-test-155@example.invalid', 'X', 'engineer'); exception when others then k := k + 1; end;
    execute 'reset role';
    res := res || array['23g|signed out: no invites, people or inviting|' || case when k = 3 then 'PASS|3 refused' else 'FAIL|' || (3 - k) || ' answered' end];
    -- 23h: put back — B out of A's business, the test invites gone, B's main and plan as before.
    delete from public.memberships where org_id = org_a and user_id = b;
    delete from public.invites where org_id = org_a
      and email in ((select lower(btrim(email)) from auth.users where id = b), 'iso-test-155@example.invalid');
    if public.default_org(b) is distinct from def_b then
      update public.memberships set is_default = false where user_id = b and is_default;
      update public.memberships set is_default = true where user_id = b and org_id = def_b;
    end if;
    select count(*) into n from public.memberships where org_id = org_a and user_id = b;
    select count(*) into k from public.invites where org_id = org_a and email = 'iso-test-155@example.invalid';
    res := res || array['23h|B out of A''s business; B''s main and plan as before; nothing left behind|'
      || case when n = 0 and k = 0 and public.default_org(b) = def_b and (select plan from public.profiles where id = b) is not distinct from plan_b
              then 'PASS|' else 'FAIL|' || n || ' membership, ' || k || ' invites, plan ' || coalesce((select plan from public.profiles where id = b), '?') end];
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- ------------------------------------------------- V156: devices (24a–24e)
  if to_regprocedure('public.my_devices()') is null then
    res := res || array['24a|devices|FAIL|run supabase/v156-devices.sql first'];
  else
    -- A pretend sign-in of A's for the length of the test (removed in 24e).
    delete from auth.sessions where user_agent = 'patgo-iso-test-156';
    insert into auth.sessions (id, user_id, created_at, updated_at, user_agent)
      values (gen_random_uuid(), a, now(), now(), 'patgo-iso-test-156') returning id into dev_a;
    -- 24a: B's list is B's own — none of A's sign-ins.
    select coalesce(array_agg(s.id), '{}') into devs_a from auth.sessions s where s.user_id = a;
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.my_devices() x where x.session_id = any(devs_a);
    execute 'reset role';
    res := res || array['24a|B''s Your devices lists none of A''s|' || case when n = 0 then 'PASS|' else 'FAIL|' || n || ' of A''s seen' end];
    -- 24b: B can't sign out A's device.
    execute 'set local role authenticated';
    begin ok := public.sign_out_device(dev_a); exception when others then ok := false; end;
    execute 'reset role';
    res := res || array['24b|B can''t sign out A''s device|'
      || case when not ok and exists (select 1 from auth.sessions where id = dev_a) then 'PASS|refused, still signed in' else 'FAIL|A''s sign-in ended' end];
    -- 24c: B (not in A's business) can't see the devices holding A's business up.
    execute 'set local role authenticated';
    k := 0;
    begin perform public.business_devices_behind(org_a); exception when others then k := k + 1; end;
    execute 'reset role';
    res := res || array['24c|B can''t see the devices of A''s business|' || case when k = 1 then 'PASS|refused' else 'FAIL|answered' end];
    -- 24d: signed out, nothing.
    perform set_config('request.jwt.claims', '', true);
    execute 'set local role anon';
    k := 0;
    begin perform public.my_devices(); exception when others then k := k + 1; end;
    begin perform public.sign_out_device(dev_a); exception when others then k := k + 1; end;
    begin perform public.business_devices_behind(org_a); exception when others then k := k + 1; end;
    execute 'reset role';
    res := res || array['24d|signed out: no devices, no signing out|' || case when k = 3 then 'PASS|3 refused' else 'FAIL|' || (3 - k) || ' answered' end];
    -- 24e: put back.
    delete from auth.sessions where user_agent = 'patgo-iso-test-156';
    res := res || array['24e|the test sign-in is gone; nothing left behind|'
      || case when not exists (select 1 from auth.sessions where user_agent = 'patgo-iso-test-156') then 'PASS|' else 'FAIL|' end];
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- ------------------------------------------------- V157: approvals (25a–25e)
  if to_regprocedure('public.business_waiting_moves()') is null then
    res := res || array['25a|approvals|FAIL|run supabase/v157-approvals.sql first'];
  else
    org_a := public.default_org(a);
    org_b := public.default_org(b);
    delete from public.job_moves where session_id like 'iso-test-%';
    insert into public.memberships (org_id, user_id, role) values (org_a, b, 'engineer')
    on conflict (org_id, user_id) do update set role = excluded.role;
    insert into public.sessions (id, user_id, doc, last_modified, org_id)
    values ('iso-test-v157-1', b, '{"site":"Isolation test","items":[{"id":1}]}', now(), org_a);
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      msg := public.move_job('iso-test-v157-1', org_b);
      -- 25a: B (the asker, an Engineer in A's business) sees no request to decide — not even B's own.
      select count(*) into n from public.business_waiting_moves() w where w.job = 'Isolation test';
      execute 'reset role';
      select x.id into mv157 from public.job_moves x where x.session_id = 'iso-test-v157-1' and x.status = 'waiting';
      res := res || array['25a|B asks to move B''s job out of A''s business; B''s approvals list doesn''t have it|' || case when msg = 'waiting' and n = 0 and mv157 is not null then 'PASS|' else 'FAIL|' || coalesce(msg, '?') || ', ' || n || ' seen' end];
    exception when others then
      execute 'reset role';
      res := res || array['25a|B asks to move B''s job out of A''s business; B''s approvals list doesn''t have it|FAIL|' || sqlerrm];
    end;
    -- 25b: A (the Owner) sees it, with the job's words.
    perform set_config('request.jwt.claims', json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.business_waiting_moves() w where w.id = mv157 and w.job = 'Isolation test' and w.items = 1 and w.to_org = org_b;
    execute 'reset role';
    res := res || array['25b|A (Owner) sees B''s request to decide|' || case when n = 1 then 'PASS|' else 'FAIL|' || n || ' seen' end];
    -- 25c: B can't decide it; A refuses it; B's own record says refused; asked
    -- again, A hears it was A.
    k := 0;
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin perform public.decide_job_move(mv157, true); k := k + 1; exception when others then null; end;
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      g := public.decide_job_move(mv157, false);
      begin perform public.decide_job_move(mv157, true); det157 := 'answered'; exception when others then
        get stacked diagnostics det157 = pg_exception_detail; end;
      execute 'reset role';
    exception when others then
      execute 'reset role';
      g := sqlerrm;
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select x.status into rn from public.my_job_moves() x where x.session_id = 'iso-test-v157-1';
    execute 'reset role';
    select count(*) into n from public.sessions where id = 'iso-test-v157-1' and org_id = org_a;
    res := res || array['25c|B can''t decide B''s own; A refuses; B''s record says so; asked again, it was A|'
      || case when k = 0 and g = 'refused' and rn = 'refused' and n = 1 and det157 like 'refused|%|you' then 'PASS|'
              else 'FAIL|' || k || ' allowed, ' || coalesce(g, '?') || ', ' || coalesce(rn, '?') || ', ' || coalesce(det157, '?') end];
    -- 25d: signed out, nothing.
    perform set_config('request.jwt.claims', '', true);
    execute 'set local role anon';
    k := 0;
    begin perform public.business_waiting_moves(); exception when others then k := k + 1; end;
    begin perform public.my_job_moves(); exception when others then k := k + 1; end;
    begin perform public.decide_job_move(mv157, true); exception when others then k := k + 1; end;
    execute 'reset role';
    res := res || array['25d|signed out: no approvals list, no record, no deciding|' || case when k = 3 then 'PASS|3 refused' else 'FAIL|' || (3 - k) || ' answered' end];
    -- 25e: put back.
    delete from public.job_moves where session_id like 'iso-test-%';
    delete from public.sessions where id = 'iso-test-v157-1' and user_id = b;
    delete from public.memberships where org_id = org_a and user_id = b;
    select count(*) into n from public.memberships where org_id = org_a and user_id = b;
    select count(*) into k from public.job_moves where session_id like 'iso-test-%';
    res := res || array['25e|B out of A''s business; nothing left behind|' || case when n = 0 and k = 0 then 'PASS|' else 'FAIL|' || n || ' membership, ' || k || ' records left' end];
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- ------------------------------------------------- V159: Office never holds a job (26a–26e)
  if not exists (select 1 from pg_proc p join pg_namespace x on x.oid = p.pronamespace
                 where x.nspname = 'public' and p.proname = 'move_job' and p.prosrc like '%patgo_move_office%') then
    res := res || array['26a|Office never holds a job|FAIL|run supabase/v159-office.sql first'];
  else
    org_a := public.default_org(a);
    org_b := public.default_org(b);
    insert into public.memberships (org_id, user_id, role) values (org_a, b, 'office')
    on conflict (org_id, user_id) do update set role = excluded.role;
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    -- 26a: B (Office in A's business) sends a new job naming A's business — it lands in B's own.
    begin
      insert into public.sessions (id, user_id, doc, last_modified, org_id)
      values ('iso-test-v159-1', b, '{"site":"Isolation test","items":[{"id":1}]}', now(), org_a);
      execute 'reset role';
      select count(*) into n from public.sessions where id = 'iso-test-v159-1' and user_id = b and org_id = org_b;
      res := res || array['26a|B (Office in A''s business) starts a job naming it; it lands in B''s own|' || case when n = 1 then 'PASS|' else 'FAIL|not in B''s own business' end];
    exception when others then
      execute 'reset role';
      res := res || array['26a|B (Office in A''s business) starts a job naming it; it lands in B''s own|FAIL|' || sqlerrm];
    end;
    -- 26b: B can't move it into A's business.
    execute 'set local role authenticated';
    begin msg := public.move_job('iso-test-v159-1', org_a); exception when others then msg := sqlerrm; end;
    execute 'reset role';
    select count(*) into n from public.sessions where id = 'iso-test-v159-1' and org_id = org_a;
    res := res || array['26b|B can''t move a job into A''s business|' || case when msg like 'patgo_move_office%' and n = 0 then 'PASS|' else 'FAIL|' || coalesce(msg, '?') end];
    -- 26c: B can't make A's business main; B's main is unchanged.
    execute 'set local role authenticated';
    begin perform public.set_main_business(org_a); msg := 'allowed'; exception when others then msg := sqlerrm; end;
    execute 'reset role';
    res := res || array['26c|B can''t make A''s business main; B''s main unchanged|' || case when msg = 'patgo_main_office' and public.default_org(b) = org_b then 'PASS|' else 'FAIL|' || coalesce(msg, '?') end];
    -- 26d: phones can't reach the main-business helper.
    execute 'set local role authenticated';
    begin perform public._main_off_office(b); msg := 'answered'; exception when others then msg := 'refused'; end;
    execute 'reset role';
    res := res || array['26d|the main-business helper is closed to phones|' || case when msg = 'refused' then 'PASS|' else 'FAIL|answered' end];
    -- 26e: put back.
    delete from public.sessions where id = 'iso-test-v159-1' and user_id = b;
    delete from public.memberships where org_id = org_a and user_id = b;
    select count(*) into n from public.memberships where org_id = org_a and user_id = b;
    select count(*) into k from public.sessions where id = 'iso-test-v159-1';
    res := res || array['26e|B out of A''s business; nothing left behind|' || case when n = 0 and k = 0 and public.default_org(b) = org_b then 'PASS|' else 'FAIL|' || n || ' membership, ' || k || ' jobs left' end];
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- ------------------------------------------------- V160: Join rechecks the business's phones (27a–27c)
  if not exists (select 1 from pg_proc p join pg_namespace x on x.oid = p.pronamespace
                 where x.nspname = 'public' and p.proname = 'accept_invite' and p.prosrc like '%patgo_team_phones_behind%') then
    res := res || array['27a|Join rechecks the business''s phones|FAIL|run supabase/v160-join.sql first'];
  else
    org_a := public.default_org(a);
    org_b := public.default_org(b);
    delete from public.memberships where org_id = org_a and user_id = b;
    delete from public.invites where org_id = org_a and email = (select lower(btrim(email)) from auth.users where id = b);
    delete from auth.sessions where user_agent = 'patgo-iso-test-160';
    skip155 := null;
    -- A invites B as Engineer while A's business is up to date.
    perform set_config('request.jwt.claims', json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      inv := public.invite_member(org_a, email_b, 'Iso Test B', 'engineer');
      execute 'reset role';
    exception when others then
      execute 'reset role';
      if sqlerrm like 'patgo_phones_behind%' then skip155 := 'a phone in A''s business is already below the minimum app version';
      else skip155 := 'the invite failed: ' || sqlerrm; end if;
    end;
    if skip155 is not null then
      res := res || array['27a|B''s Join refused while a phone in A''s business is older; invite still waiting|INCONCLUSIVE|' || skip155];
    else
      -- Then A signs in an old phone (a pretend sign-in that never reported — removed in 27c).
      insert into auth.sessions (id, user_id, created_at, updated_at, user_agent)
        values (gen_random_uuid(), a, now(), now(), 'patgo-iso-test-160');
      -- 27a: B's Join is refused for the business's phones; nothing changes.
      perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      begin msg := public.accept_invite(inv, true); exception when others then msg := sqlerrm; end;
      execute 'reset role';
      if msg like 'patgo_your_phones_behind%' then
        skip155 := 'a phone of B''s is below the minimum app version';
        res := res || array['27a|B''s Join refused while a phone in A''s business is older; invite still waiting|INCONCLUSIVE|' || skip155];
      else
        res := res || array['27a|B''s Join refused while a phone in A''s business is older; invite still waiting|'
          || case when msg like 'patgo_team_phones_behind%' and public.member_role(org_a, b) is null
                   and (select status from public.invites where id = inv) = 'waiting' and public.default_org(b) = org_b
                  then 'PASS|' else 'FAIL|' || coalesce(msg, '?') end];
      end if;
      -- 27b: the old phone signed out — B can join (not made main).
      delete from auth.sessions where user_agent = 'patgo-iso-test-160';
      if skip155 is null then
        perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
        execute 'set local role authenticated';
        begin msg := public.accept_invite(inv, false); exception when others then msg := sqlerrm; end;
        execute 'reset role';
        res := res || array['27b|the old phone signed out: B joins; B''s main business unchanged|'
          || case when msg = 'joined' and public.member_role(org_a, b) = 'engineer' and public.default_org(b) = org_b then 'PASS|' else 'FAIL|' || coalesce(msg, '?') end];
      else
        res := res || array['27b|the old phone signed out: B joins; B''s main business unchanged|INCONCLUSIVE|' || skip155];
      end if;
    end if;
    -- 27c: put back.
    delete from auth.sessions where user_agent = 'patgo-iso-test-160';
    delete from public.memberships where org_id = org_a and user_id = b;
    delete from public.invites where org_id = org_a and email = (select lower(btrim(email)) from auth.users where id = b);
    select count(*) into n from public.memberships where org_id = org_a and user_id = b;
    select count(*) into k from auth.sessions where user_agent = 'patgo-iso-test-160';
    select count(*) + k into k from public.invites where org_id = org_a and email = (select lower(btrim(email)) from auth.users where id = b);
    res := res || array['27c|B out of A''s business; no invite or pretend sign-in left|' || case when n = 0 and k = 0 and public.default_org(b) = org_b then 'PASS|' else 'FAIL|' || n || ' membership, ' || k || ' left' end];
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- ------------------------------------------------- V161: a signed-out device loses cloud access at once (28a–28d)
  if not exists (select 1 from pg_proc p join pg_namespace x on x.oid = p.pronamespace
                 where x.nspname = 'public' and p.proname = 'patgo_check_request') then
    res := res || array['28a|a signed-out sign-in is refused before every request|FAIL|run supabase/v161-signed-out.sql first'];
  else
    delete from auth.sessions where user_agent = 'patgo-iso-test-161';
    -- 28a: B on a sign-in that no longer exists — refused with an error.
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated', 'session_id', gen_random_uuid()::text)::text, true);
    execute 'set local role authenticated';
    begin perform public.patgo_check_request(); e161 := 'passed'; exception when others then e161 := sqlstate || ' ' || sqlerrm; end;
    -- 28b: photo files on that sign-in — refused, never a quiet "no file".
    if real_a is not null then
      begin select count(*) into n from storage.objects where bucket_id = 'photos' and name = real_a; f161 := 'read ' || n;
      exception when others then f161 := sqlerrm; end;
    else
      begin perform public.patgo_files_signed_in(); f161 := 'passed'; exception when others then f161 := sqlerrm; end;
    end if;
    execute 'reset role';
    res := res || array['28a|a signed-out sign-in is refused before every request|'
      || case when e161 like 'PGRST %patgo_signed_out%' then 'PASS|' else 'FAIL|' || coalesce(e161, '?') end];
    res := res || array['28b|a signed-out sign-in can''t touch photo files (an error, not "no file")|'
      || case when f161 like 'patgo_signed_out%' and exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                and policyname = 'photo files need a live sign-in' and permissive = 'RESTRICTIVE')
              then 'PASS|' || case when real_a is null then 'checked without a real file of A''s' else '' end
              else 'FAIL|' || coalesce(f161, '?') end];
    -- 28c: a live sign-in of B's passes — and still sees none of A's files.
    sid161 := gen_random_uuid();
    insert into auth.sessions (id, user_id, created_at, updated_at, user_agent)
      values (sid161, b, now(), now(), 'patgo-iso-test-161');
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated', 'session_id', sid161::text)::text, true);
    execute 'set local role authenticated';
    begin perform public.patgo_check_request(); e161 := 'passed'; exception when others then e161 := sqlerrm; end;
    begin select count(*) into n from storage.objects where bucket_id = 'photos' and name = coalesce(real_a, '-'); f161 := 'read ' || n;
    exception when others then f161 := sqlerrm; end;
    execute 'reset role';
    res := res || array['28c|a live sign-in passes, and still can''t see A''s files|'
      || case when e161 = 'passed' and f161 = 'read 0' then 'PASS|' else 'FAIL|' || coalesce(e161, '?') || ' / ' || coalesce(f161, '?') end];
    -- 28d: put back.
    delete from auth.sessions where user_agent = 'patgo-iso-test-161';
    select count(*) into k from auth.sessions where user_agent = 'patgo-iso-test-161';
    res := res || array['28d|no pretend sign-in left|' || case when k = 0 then 'PASS|' else 'FAIL|' || k || ' left' end];
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- ------------------------------------------------- V163: leaving and removing (29a–29e)
  if not exists (select 1 from pg_proc p join pg_namespace x on x.oid = p.pronamespace
                 where x.nspname = 'public' and p.proname = 'remove_member') then
    res := res || array['29a|A removes B from A''s business|FAIL|run supabase/v163-leaving.sql first'];
  else
    org_a := public.default_org(a);
    org_b := public.default_org(b);
    delete from public.sessions where id = 'iso-test-v163-1' and user_id = b;
    delete from public.departures where org_id = org_a and user_id = b;
    delete from public.memberships where org_id = org_a and user_id = b;
    insert into public.memberships (org_id, user_id, role, is_default) values (org_a, b, 'engineer', false);
    insert into public.sessions (id, user_id, doc, last_modified, org_id)
      values ('iso-test-v163-1', b, '{}'::jsonb, now(), org_a);
    -- 29a: A removes B, cut off now.
    perform set_config('request.jwt.claims', json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin e163 := public.remove_member(org_a, b, false); exception when others then e163 := sqlerrm; end;
    execute 'reset role';
    res := res || array['29a|A removes B from A''s business; B''s main business unchanged|'
      || case when e163 = 'removed' and public.member_role(org_a, b) is null and public.default_org(b) = org_b
               and exists (select 1 from public.departures where org_id = org_a and user_id = b)
              then 'PASS|' else 'FAIL|' || coalesce(e163, '?') end];
    -- 29b: B can't read or change the job, and a new one naming A's business is refused.
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.sessions where id = 'iso-test-v163-1';
    begin update public.sessions set doc = '{"x":1}'::jsonb where id = 'iso-test-v163-1' and user_id = b; get diagnostics k = row_count;
    exception when others then k := -1; end;
    begin insert into public.sessions (id, user_id, doc, last_modified, org_id) values ('iso-test-v163-2', b, '{}'::jsonb, now(), org_a); d163 := 'inserted';
    exception when others then d163 := sqlerrm; end;
    execute 'reset role';
    res := res || array['29b|B can''t read or change the job; a new job naming A''s business is refused|'
      || case when n = 0 and k <= 0 and d163 like 'patgo_left_business%' then 'PASS|'
              else 'FAIL|read ' || n || ', changed ' || k || ', new: ' || coalesce(d163, '?') end];
    -- 29c: B sees the departure, with the job; and can't remove anyone there.
    execute 'set local role authenticated';
    select count(*) into n from public.my_departures() where business_id = org_a and 'iso-test-v163-1' = any(jobs) and kind = 'removed';
    begin perform public.remove_member(org_a, a); e163 := 'answered'; exception when others then e163 := sqlerrm; end;
    execute 'reset role';
    res := res || array['29c|B sees the departure and its job; B can''t remove anyone there|'
      || case when n = 1 and e163 like 'patgo_%' then 'PASS|' else 'FAIL|' || n || ' / ' || coalesce(e163, '?') end];
    -- 29d: A still has B's job.
    perform set_config('request.jwt.claims', json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.sessions where id = 'iso-test-v163-1' and user_id = b;
    execute 'reset role';
    res := res || array['29d|A''s business keeps B''s job|' || case when n = 1 then 'PASS|' else 'FAIL|' || n end];
    -- 29e: put back.
    delete from public.sessions where id in ('iso-test-v163-1', 'iso-test-v163-2') and user_id = b;
    delete from public.departures where org_id = org_a and user_id = b;
    delete from public.memberships where org_id = org_a and user_id = b;
    select count(*) into n from public.departures where org_id = org_a and user_id = b;
    select count(*) into k from public.sessions where id like 'iso-test-v163-%';
    res := res || array['29e|B out of A''s business; nothing left behind|' || case when n = 0 and k = 0 and public.default_org(b) = org_b then 'PASS|' else 'FAIL|' || n || ' departure, ' || k || ' jobs left' end];
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- ------------------------------------------------- V165: a business holding someone else's jobs (30a–30c)
  if not exists (select 1 from pg_proc p join pg_namespace x on x.oid = p.pronamespace
                 where x.nspname = 'public' and p.proname = 'business_others_jobs') then
    res := res || array['30a|A is told A''s business holds someone else''s job|FAIL|run supabase/v165-business-jobs.sql first'];
  else
    org_a := public.default_org(a);
    -- A job of B's left in A's business, B no longer a member (as after a removal).
    delete from public.sessions where id = 'iso-test-v165-1' and user_id = b;
    delete from public.memberships where org_id = org_a and user_id = b;
    insert into public.memberships (org_id, user_id, role, is_default) values (org_a, b, 'engineer', false);
    insert into public.sessions (id, user_id, doc, last_modified, org_id)
      values ('iso-test-v165-1', b, '{}'::jsonb, now(), org_a);
    delete from public.memberships where org_id = org_a and user_id = b;
    -- 30a: A (the Owner) is told yes for A's business.
    perform set_config('request.jwt.claims', json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.business_others_jobs() where business_id = org_a and others;
    execute 'reset role';
    res := res || array['30a|A is told A''s business holds someone else''s job|' || case when n = 1 then 'PASS|' else 'FAIL|' || n end];
    -- 30b: B, not a member, is told nothing about A's business.
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.business_others_jobs() where business_id = org_a;
    execute 'reset role';
    res := res || array['30b|B is told nothing about A''s business|' || case when n = 0 then 'PASS|' else 'FAIL|' || n end];
    -- 30c: as an Engineer in A's business B is still told nothing about it.
    insert into public.memberships (org_id, user_id, role, is_default) values (org_a, b, 'engineer', false);
    execute 'set local role authenticated';
    select count(*) into n from public.business_others_jobs() where business_id = org_a;
    execute 'reset role';
    delete from public.sessions where id = 'iso-test-v165-1' and user_id = b;
    delete from public.memberships where org_id = org_a and user_id = b;
    select count(*) into k from public.sessions where id like 'iso-test-v165-%';
    res := res || array['30c|an Engineer is told nothing; nothing left behind|' || case when n = 0 and k = 0 then 'PASS|' else 'FAIL|' || n || ' / ' || k || ' left' end];
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- ------------------------------------------------- V166: how much a business stores (31a–31c)
  if not exists (select 1 from pg_proc p join pg_namespace x on x.oid = p.pronamespace
                 where x.nspname = 'public' and p.proname = 'business_storage') then
    res := res || array['31a|A sees what A''s business stores, B''s line and job included|FAIL|run supabase/v166-storage.sql first'];
  else
    org_a := public.default_org(a);
    -- A job and a photo of B's left in A's business, B no longer a member.
    delete from public.photos where id = 'iso-test-v166-p1' and user_id = b;
    delete from public.sessions where id = 'iso-test-v166-1' and user_id = b;
    delete from public.memberships where org_id = org_a and user_id = b;
    insert into public.memberships (org_id, user_id, role, is_default) values (org_a, b, 'engineer', false);
    insert into public.sessions (id, user_id, doc, last_modified, org_id)
      values ('iso-test-v166-1', b, '{"site":"iso-test-v166"}'::jsonb, now(), org_a);
    insert into public.photos (id, user_id, session_id, item_id, storage_path, bytes, last_modified, org_id)
      values ('iso-test-v166-p1', b, 'iso-test-v166-1', 'i1', b::text || '/iso-test-v166-p1.jpg', 4321, now(), org_a);
    delete from public.memberships where org_id = org_a and user_id = b;
    -- 31a: A (the Owner) sees B's line and B's job among the biggest.
    perform set_config('request.jwt.claims', json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.business_storage(org_a) where user_id = b and jobs >= 1 and photos >= 1 and photo_bytes >= 4321;
    select count(*) into k from public.business_biggest_jobs(org_a, 50) where user_id = b and id = 'iso-test-v166-1';
    execute 'reset role';
    res := res || array['31a|A sees what A''s business stores, B''s line and job included|' || case when n = 1 and k = 1 then 'PASS|' else 'FAIL|' || n || ' / ' || k end];
    -- 31b: B, not a member, sees nothing of A's business — and B's own total leaves it out.
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.business_storage(org_a);
    select count(*) into k from public.business_biggest_jobs(org_a, 50);
    execute 'reset role';
    res := res || array['31b|B sees nothing of A''s business|' || case when n = 0 and k = 0 then 'PASS|' else 'FAIL|' || n || ' / ' || k end];
    -- 31c: as an Engineer in A's business B still sees nothing of it; put back.
    insert into public.memberships (org_id, user_id, role, is_default) values (org_a, b, 'engineer', false);
    execute 'set local role authenticated';
    select count(*) into n from public.business_storage(org_a);
    select count(*) + n into n from public.business_biggest_jobs(org_a, 50);
    execute 'reset role';
    delete from public.photos where id = 'iso-test-v166-p1' and user_id = b;
    delete from public.sessions where id = 'iso-test-v166-1' and user_id = b;
    delete from public.memberships where org_id = org_a and user_id = b;
    select count(*) into k from public.sessions where id like 'iso-test-v166-%';
    select count(*) + k into k from public.photos where id like 'iso-test-v166-%';
    res := res || array['31c|an Engineer sees nothing of the business''s storage; nothing left behind|' || case when n = 0 and k = 0 then 'PASS|' else 'FAIL|' || n || ' / ' || k || ' left' end];
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- ------------------------------------------------- V167: correcting someone else's job (32a–32c)
  if not exists (select 1 from pg_proc p join pg_namespace x on x.oid = p.pronamespace
                 where x.nspname = 'public' and p.proname = 'correct_job') then
    res := res || array['32a|A corrects B''s locked job in A''s business, the change kept with A''s name|FAIL|run supabase/v167-corrections.sql first'];
  else
    org_a := public.default_org(a);
    -- B, an Engineer in A's business, with a locked job there; A's own locked job.
    delete from public.sessions where id in ('iso-test-v167-1', 'iso-test-v167-2');
    delete from public.memberships where org_id = org_a and user_id = b;
    insert into public.memberships (org_id, user_id, role, is_default) values (org_a, b, 'engineer', false);
    insert into public.sessions (id, user_id, doc, last_modified, org_id) values
      ('iso-test-v167-1', b, '{"id":"iso-test-v167-1","site":"iso B","locked":true,"items":[]}'::jsonb, now(), org_a),
      ('iso-test-v167-2', a, '{"id":"iso-test-v167-2","site":"iso A","locked":true,"items":[]}'::jsonb, now(), org_a);
    -- 32a: A (the Owner) corrects B's job.
    perform set_config('request.jwt.claims', json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.correct_job(b, 'iso-test-v167-1', org_a, '[{"field":"site","from":"iso B","to":"iso B fixed"}]'::jsonb, null);
    exception when others then null;
    end;
    execute 'reset role';
    select count(*) into n from public.sessions where id = 'iso-test-v167-1' and user_id = b
      and doc->>'site' = 'iso B fixed' and doc->'corrections'->0->>'by' = a::text;
    res := res || array['32a|A corrects B''s locked job in A''s business, the change kept with A''s name|' || case when n = 1 then 'PASS|' else 'FAIL|' || n end];
    -- 32b: B, an Engineer there, can't correct A's job.
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.correct_job(a, 'iso-test-v167-2', org_a, '[{"field":"site","from":"iso A","to":"by B"}]'::jsonb, null);
    exception when others then null;
    end;
    execute 'reset role';
    select count(*) into n from public.sessions where id = 'iso-test-v167-2' and doc->>'site' = 'iso A' and not (doc ? 'corrections');
    res := res || array['32b|an Engineer can''t correct someone else''s job|' || case when n = 1 then 'PASS|' else 'FAIL|' || n end];
    -- 32c: B, no longer a member, can't either; put back.
    delete from public.memberships where org_id = org_a and user_id = b;
    execute 'set local role authenticated';
    begin
      perform public.correct_job(a, 'iso-test-v167-2', null, '[{"field":"site","from":"iso A","to":"by B"}]'::jsonb, null);
    exception when others then null;
    end;
    execute 'reset role';
    select count(*) into n from public.sessions where id = 'iso-test-v167-2' and doc->>'site' = 'iso A';
    delete from public.sessions where id in ('iso-test-v167-1', 'iso-test-v167-2');
    select count(*) into k from public.sessions where id like 'iso-test-v167-%';
    res := res || array['32c|someone outside the business can''t correct its jobs; nothing left behind|' || case when n = 1 and k = 0 then 'PASS|' else 'FAIL|' || n || ' / ' || k || ' left' end];
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- ------------------------------------------------- V168: each business on its own plan (33a–33c)
  if to_regprocedure('public.my_business_plans()') is null or to_regprocedure('public.can_upload_file(text)') is null then
    res := res || array['33a|B reads the plan of each of B''s businesses, and no other|FAIL|run supabase/v168-business-plans.sql first'];
  else
    -- Each person's OWN business (where they're the Owner), whatever is main.
    select m.org_id into own_a from public.memberships m where m.user_id = a and m.role = 'owner' order by m.is_default desc limit 1;
    select m.org_id into own_b from public.memberships m where m.user_id = b and m.role = 'owner' order by m.is_default desc limit 1;
    -- 33a: B reads the plans of B's businesses — each one's own plan — and nothing else.
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      select count(*) into n from public.my_business_plans() x
      where not exists (select 1 from public.organisations o where o.id = x.id and o.plan is not distinct from x.plan
                          and o.lapsed_at is not distinct from x.lapsed_at and o.trial_ends_at is not distinct from x.trial_ends_at);
      select count(*) into k from public.my_business_plans();
      execute 'reset role';
      select count(*) - k into j from public.memberships where user_id = b;
      res := res || array['33a|B reads the plan of each of B''s businesses, and no other|' || case when n = 0 and j = 0 and k > 0 then 'PASS|' || k || ' business(es)' else 'FAIL|' || n || ' wrong, ' || j || ' missing' end];
    exception when others then
      execute 'reset role';
      res := res || array['33a|B reads the plan of each of B''s businesses, and no other|FAIL|' || sqlerrm];
    end;
    perform set_config('request.jwt.claims', '', true);
    if own_a is null or own_b is null or own_a = own_b or not public.can_upload(own_a) then
      res := res || array['33b|B''s own business ended: a photo of its job refused, a new file still taken (B is in A''s)|INCONCLUSIVE|A''s own business must be able to upload (on its trial or paid) — check A''s plan'];
    else
      -- B in A's business (as Engineer, unless already in it); B's own business
      -- made to look lapsed 20 days ago; a job of B's own business with a photo row.
      in168 := exists (select 1 from public.memberships where org_id = own_a and user_id = b);
      if not in168 then insert into public.memberships (org_id, user_id, role, is_default) values (own_a, b, 'engineer', false); end if;
      select plan, lapsed_at into g168, lap168 from public.organisations where id = own_b;
      delete from public.photos where id = 'iso-test-v168';
      delete from public.sessions where id = 'iso-test-v168';
      insert into public.sessions (id, user_id, doc, last_modified, org_id) values ('iso-test-v168', b, '{"items":[]}', now(), own_b);
      insert into public.photos (id, user_id, session_id, item_id, storage_path, last_modified, org_id)
      values ('iso-test-v168', b, 'iso-test-v168', 'i1', b::text || '/iso-test-v168.jpg', now(), own_b);
      update public.organisations set plan = 'lapsed', lapsed_at = now() - interval '20 days' where id = own_b;
      -- 33b: asked as B (the rule itself — nothing is uploaded).
      perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      begin
        f168 := public.can_upload_file(b::text || '/iso-test-v168.jpg');
        t168 := public.can_upload_file(b::text || '/iso-test-v168-new.jpg');
      exception when others then f168 := null; t168 := null;
      end;
      execute 'reset role';
      perform set_config('request.jwt.claims', '', true);
      res := res || array['33b|B''s own business ended: a photo of its job refused, a new file still taken (B is in A''s)|'
        || case when f168 is false and t168 is true then 'PASS|' else 'FAIL|its photo ' || coalesce(f168::text, 'error') || ', a new file ' || coalesce(t168::text, 'error') end];
      -- 33c: everything put back.
      update public.organisations set plan = g168, lapsed_at = lap168 where id = own_b;
      delete from public.photos where id = 'iso-test-v168';
      delete from public.sessions where id = 'iso-test-v168';
      if not in168 then delete from public.memberships where org_id = own_a and user_id = b; end if;
      select count(*) into n from public.organisations where id = own_b and plan is not distinct from g168 and lapsed_at is not distinct from lap168;
      select count(*) into k from public.memberships where org_id = own_a and user_id = b;
      res := res || array['33c|B''s plan, lapse date and memberships are put back; nothing left behind|'
        || case when n = 1 and (k = 1) = in168 and not exists (select 1 from public.sessions where id = 'iso-test-v168')
                then 'PASS|' || g168 else 'FAIL|plan ' || n || ', in A''s ' || k end];
    end if;
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- ------------------------------------------------- V169: seat billing (34a–34c)
  if to_regprocedure('public.business_seats()') is null or to_regclass('public.seat_changes') is null then
    res := res || array['34a|the seat record is closed to B; B reads no seat figures of A''s business|FAIL|run supabase/v169-seats.sql first'];
  else
    select m.org_id into own_a from public.memberships m where m.user_id = a and m.role = 'owner' order by m.is_default desc limit 1;
    select coalesce(max(id), 0) into max169 from public.seat_changes;
    r169 := public.member_role(own_a, b);
    -- 34a: as B — the record is closed, and B reads nothing an Owner reads of A's business.
    perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform 1 from public.seat_changes limit 1;
      den169 := false;
    exception when insufficient_privilege then den169 := true;
    end;
    select count(*) into n from public.business_seats() x where x.business_id = own_a and (x.is_owner or jsonb_array_length(x.changes) > 0);
    execute 'reset role';
    res := res || array['34a|the seat record is closed to B; B reads no seat figures of A''s business|' || case when den169 and n = 0 then 'PASS|' else 'FAIL|record closed ' || den169 || ', owner rows ' || n end];
    if own_a is null or r169 = 'owner' then
      res := res || array['34b|B made an Engineer in A''s business: a paid seat, A sees it, B (Engineer) doesn''t|INCONCLUSIVE|A has no business of A''s own apart from B'];
    else
      -- 34b: B made an Engineer in A's business → a paid seat, noted; A sees it, B doesn't.
      if r169 is null then
        insert into public.memberships (org_id, user_id, role, name) values (own_a, b, 'engineer', 'iso B');
      elsif r169 = 'office' then
        update public.memberships set role = 'engineer' where org_id = own_a and user_id = b;
      end if;
      select count(*) into own169 from public.seat_changes c
        where c.id > max169 and c.org_id = own_a and c.user_id = b and c.role_to in ('engineer','team_leader');
      if r169 in ('engineer','team_leader') then own169 := 1; end if;   -- already a paid seat: nothing new to note
      perform set_config('request.jwt.claims', json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      select count(*) into n from public.business_seats() x where x.business_id = own_a and x.is_owner and x.seats >= 1;
      perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
      select count(*) into eng169 from public.business_seats() x where x.business_id = own_a;
      execute 'reset role';
      res := res || array['34b|B made an Engineer in A''s business: a paid seat, A sees it, B (Engineer) doesn''t|'
        || case when own169 = 1 and n = 1 and eng169 = 0 then 'PASS|' else 'FAIL|noted ' || own169 || ', A ' || n || ', B ' || eng169 end];
      -- 34c: put back, and the test's seat lines removed (one transaction — never billed or emailed).
      if r169 is null then delete from public.memberships where org_id = own_a and user_id = b;
      elsif r169 = 'office' then update public.memberships set role = 'office' where org_id = own_a and user_id = b;
      end if;
      delete from public.seat_changes where id > max169;
      select count(*) into k from public.memberships where org_id = own_a and user_id = b;
      res := res || array['34c|B''s place in A''s business put back; no test seat line left|'
        || case when (k = 1) = (r169 is not null) and public.member_role(own_a, b) is not distinct from r169
                     and not exists (select 1 from public.seat_changes where id > max169)
                then 'PASS|' else 'FAIL|member ' || k end];
    end if;
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- ------------------------------------------------- V170: the business's certificate (35a–35c)
  if to_regprocedure('public.cert_take(uuid)') is null or to_regclass('public.cert_settings') is null then
    res := res || array['35a|B can''t read or number A''s certificates from outside or as an Engineer|FAIL|run supabase/v170-certificates.sql first'];
  else
    select m.org_id into own_a from public.memberships m where m.user_id = a and m.role = 'owner' order by m.is_default desc limit 1;
    r170 := public.member_role(own_a, b);
    select coalesce(max(id), 0) into max170 from public.seat_changes;
    select true, c.settings, c.next_no into had170, s170, nx170 from public.cert_settings c where c.org_id = own_a;
    had170 := coalesce(had170, false);
    if own_a is null or r170 = 'owner' then
      res := res || array['35a|B can''t read or number A''s certificates from outside or as an Engineer|INCONCLUSIVE|A has no business of A''s own apart from B'];
    else
      -- 35a: B as Engineer in A's business (put there for the test if not a member) —
      -- the table closed; no number taken; no settings saved.
      if r170 is null then insert into public.memberships (org_id, user_id, role, name) values (own_a, b, 'engineer', 'iso B');
      else update public.memberships set role = 'engineer' where org_id = own_a and user_id = b;
      end if;
      perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      begin perform 1 from public.cert_settings limit 1; den170 := false;
      exception when insufficient_privilege then den170 := true; end;
      begin perform public.cert_take(own_a); eng170 := false;
      exception when others then eng170 := (sqlerrm like 'patgo_cert_not_allowed%'); end;
      begin perform public.cert_settings_save(own_a, '{}'::jsonb, null); eng170 := false;
      exception when others then eng170 := eng170 and (sqlerrm like 'patgo_cert_not_allowed%'); end;
      execute 'reset role';
      res := res || array['35a|B can''t read or number A''s certificates from outside or as an Engineer|'
        || case when den170 and eng170 then 'PASS|' else 'FAIL|table closed ' || den170 || ', engineer refused ' || eng170 end];
      -- 35b: B made Office — two numbers in a row, never the same; may save the settings.
      update public.memberships set role = 'office' where org_id = own_a and user_id = b;
      perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      t1 := public.cert_take(own_a);
      t2 := public.cert_take(own_a);
      begin perform public.cert_settings_save(own_a, coalesce(s170, '{}'::jsonb), null); ok := true;
      exception when others then ok := false; end;
      execute 'reset role';
      res := res || array['35b|B as Office takes two numbers in a row (different) and may save the settings|'
        || case when t2 = t1 + 1 and ok then 'PASS|' || t1 || ', ' || t2 else 'FAIL|numbers ' || coalesce(t1::text, '-') || ', ' || coalesce(t2::text, '-') || ', save ' || ok end];
      -- 35c: everything put back.
      if r170 is null then delete from public.memberships where org_id = own_a and user_id = b;
      else update public.memberships set role = r170 where org_id = own_a and user_id = b;
      end if;
      if had170 then update public.cert_settings set settings = s170, next_no = nx170 where org_id = own_a;
      else delete from public.cert_settings where org_id = own_a;
      end if;
      delete from public.seat_changes where id > max170;
      select count(*) into k from public.memberships where org_id = own_a and user_id = b;
      res := res || array['35c|A''s certificate settings and counter, and B''s place, put back|'
        || case when (k = 1) = (r170 is not null) and public.member_role(own_a, b) is not distinct from r170
                     and (not had170 or exists (select 1 from public.cert_settings where org_id = own_a and next_no = nx170))
                     and (had170 or not exists (select 1 from public.cert_settings where org_id = own_a))
                then 'PASS|' else 'FAIL|member ' || k end];
    end if;
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- ------------------------------------------------- V171: Office makes the certificate (36a–36c)
  if to_regprocedure('public.cert_stamp(uuid, text, uuid, text, boolean)') is null then
    res := res || array['36a|an Engineer can''t put a certificate on someone else''s job, nor anyone outside|FAIL|run supabase/v171-office-certs.sql first'];
  else
    select m.org_id into own_a from public.memberships m where m.user_id = a and m.role = 'owner' order by m.is_default desc limit 1;
    r171 := public.member_role(own_a, b);
    select coalesce(max(id), 0) into max171 from public.seat_changes;
    if own_a is null or r171 = 'owner' then
      res := res || array['36a|an Engineer can''t put a certificate on someone else''s job, nor anyone outside|INCONCLUSIVE|A has no business of A''s own apart from B'];
    else
      -- A's locked job and A's unlocked job in A's own business; B outside it first.
      delete from public.sessions where id in ('iso-test-v171-1', 'iso-test-v171-2');
      insert into public.sessions (id, user_id, doc, last_modified, org_id) values
        ('iso-test-v171-1', a, '{"id":"iso-test-v171-1","site":"iso A","locked":true,"items":[]}'::jsonb, now(), own_a),
        ('iso-test-v171-2', a, '{"id":"iso-test-v171-2","site":"iso A open","locked":false,"items":[]}'::jsonb, now(), own_a);
      -- 36a: B outside, then B an Engineer there — both refused, nothing written.
      -- (B already in A's business: the outside half is skipped, B's role kept and put back.)
      perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
      c171 := '';
      if r171 is null then
        execute 'set local role authenticated';
        begin perform public.cert_stamp(a, 'iso-test-v171-1', null, 'ISO-1', true); c171 := 'outside took';
        exception when others then c171 := case when sqlerrm like 'patgo_certstamp_not_allowed%' then '' else 'outside ' || sqlerrm end; end;
        execute 'reset role';
        insert into public.memberships (org_id, user_id, role, name) values (own_a, b, 'engineer', 'iso B');
      else
        update public.memberships set role = 'engineer' where org_id = own_a and user_id = b;
      end if;
      execute 'set local role authenticated';
      begin perform public.cert_stamp(a, 'iso-test-v171-1', own_a, 'ISO-1', true); c171 := c171 || ' engineer took';
      exception when others then if sqlerrm not like 'patgo_certstamp_not_allowed%' then c171 := c171 || ' engineer ' || sqlerrm; end if; end;
      execute 'reset role';
      select count(*) into n from public.sessions where id = 'iso-test-v171-1' and user_id = a
        and not (doc ? 'certNo') and not (doc ? 'certMade');
      res := res || array['36a|an Engineer can''t put a certificate on someone else''s job, nor anyone outside|'
        || case when c171 = '' and n = 1 then 'PASS|' else 'FAIL|' || c171 || ' / ' || n end];
      -- 36b: B made Office — the number and "made by B" on A's locked job; A's unlocked job refused.
      update public.memberships set role = 'office' where org_id = own_a and user_id = b;
      execute 'set local role authenticated';
      begin perform public.cert_stamp(a, 'iso-test-v171-1', own_a, 'ISO-1', true); c171 := '';
      exception when others then c171 := 'locked ' || sqlerrm; end;
      begin perform public.cert_stamp(a, 'iso-test-v171-2', own_a, 'ISO-2', false); c171 := c171 || ' unlocked took';
      exception when others then if sqlerrm not like 'patgo_certstamp_unlocked%' then c171 := c171 || ' unlocked ' || sqlerrm; end if; end;
      execute 'reset role';
      select count(*) into n from public.sessions where id = 'iso-test-v171-1' and user_id = a
        and doc->>'certNo' = 'ISO-1' and doc->'certMade'->>'by' = b::text and doc->>'reportAt' = doc->'certMade'->>'at';
      select count(*) into k from public.sessions where id = 'iso-test-v171-2' and not (doc ? 'certNo');
      res := res || array['36b|B as Office puts the number and "made by B" on A''s locked job; an unlocked job refused|'
        || case when c171 = '' and n = 1 and k = 1 then 'PASS|' else 'FAIL|' || c171 || ' / ' || n || ' / ' || k end];
      -- 36c: everything put back.
      if r171 is null then delete from public.memberships where org_id = own_a and user_id = b;
      else update public.memberships set role = r171 where org_id = own_a and user_id = b;
      end if;
      delete from public.sessions where id in ('iso-test-v171-1', 'iso-test-v171-2');
      delete from public.seat_changes where id > max171;
      select count(*) into k from public.sessions where id like 'iso-test-v171-%';
      res := res || array['36c|A''s test jobs gone and B''s place put back|'
        || case when k = 0 and public.member_role(own_a, b) is not distinct from r171 then 'PASS|' else 'FAIL|' || k || ' left' end];
    end if;
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- ------------------------------------------------- V172: Recently deleted (37a–37c)
  if to_regprocedure('public.bin_job(uuid, text, uuid)') is null then
    res := res || array['37a|nobody but the Owner deletes, sees, restores or empties A''s job|FAIL|run supabase/v172-recently-deleted.sql first'];
  else
    select m.org_id into own_a from public.memberships m where m.user_id = a and m.role = 'owner' order by m.is_default desc limit 1;
    r172 := public.member_role(own_a, b);
    select coalesce(max(id), 0) into max172 from public.seat_changes;
    if own_a is null or r172 = 'owner' then
      res := res || array['37a|nobody but the Owner deletes, sees, restores or empties A''s job|INCONCLUSIVE|A has no business of A''s own apart from B'];
    else
      delete from public.job_bin where id = 'iso-test-v172-1';
      delete from public.sessions where id = 'iso-test-v172-1';
      insert into public.sessions (id, user_id, doc, last_modified, org_id) values
        ('iso-test-v172-1', a, '{"id":"iso-test-v172-1","site":"iso A bin","locked":true,"items":[]}'::jsonb, now(), own_a);
      -- 37a: B outside, then a Team leader — can't delete it; then A deletes it and
      -- B (still a Team leader) can't see, restore or empty it.
      perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
      c172 := '';
      if r172 is null then
        execute 'set local role authenticated';
        begin perform public.bin_job(a, 'iso-test-v172-1', null); c172 := 'outside deleted';
        exception when others then c172 := case when sqlerrm like 'patgo_bin_not_allowed%' then '' else 'outside ' || sqlerrm end; end;
        execute 'reset role';
        insert into public.memberships (org_id, user_id, role, name) values (own_a, b, 'team_leader', 'iso B');
      else
        update public.memberships set role = 'team_leader' where org_id = own_a and user_id = b;
      end if;
      execute 'set local role authenticated';
      begin perform public.bin_job(a, 'iso-test-v172-1', own_a); c172 := c172 || ' leader deleted';
      exception when others then if sqlerrm not like 'patgo_bin_not_allowed%' then c172 := c172 || ' leader ' || sqlerrm; end if; end;
      execute 'reset role';
      perform set_config('request.jwt.claims', json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      begin perform public.bin_job(a, 'iso-test-v172-1', own_a);
      exception when others then c172 := c172 || ' owner ' || sqlerrm; end;
      execute 'reset role';
      select x.n into e172 from public.job_bin x where x.id = 'iso-test-v172-1' and x.user_id = a and x.restored_at is null and x.gone_at is null;
      perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      select count(*) into n from public.bin_list() x where x.id = 'iso-test-v172-1';
      if n <> 0 then c172 := c172 || ' leader sees it'; end if;
      begin perform public.bin_restore(e172); c172 := c172 || ' leader restored';
      exception when others then if sqlerrm not like 'patgo_bin_not_allowed%' then c172 := c172 || ' restore ' || sqlerrm; end if; end;
      begin perform public.bin_forget(e172); c172 := c172 || ' leader emptied';
      exception when others then if sqlerrm not like 'patgo_bin_not_allowed%' then c172 := c172 || ' forget ' || sqlerrm; end if; end;
      begin select count(*) into n from public.job_bin; c172 := c172 || ' table open';
      exception when others then null; end;
      execute 'reset role';
      select count(*) into n from public.sessions s join public.job_bin x on x.user_id = s.user_id and x.id = s.id
        where s.id = 'iso-test-v172-1' and s.user_id = a and s.deleted and x.n = e172 and x.doc->>'site' = 'iso A bin' and x.gone_at is null;
      res := res || array['37a|nobody but the Owner deletes, sees, restores or empties A''s job|'
        || case when c172 = '' and n = 1 then 'PASS|' else 'FAIL|' || c172 || ' / ' || n end];
      -- 37b: A sees it in Recently deleted and restores it.
      perform set_config('request.jwt.claims', json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      c172 := '';
      select count(*) into k from public.bin_list() x where x.n = e172;
      begin perform public.bin_restore(e172);
      exception when others then c172 := 'restore ' || sqlerrm; end;
      execute 'reset role';
      select count(*) into n from public.sessions where id = 'iso-test-v172-1' and user_id = a and not deleted and doc->>'site' = 'iso A bin';
      res := res || array['37b|A (the Owner) sees it in Recently deleted and puts it back|'
        || case when c172 = '' and k = 1 and n = 1 then 'PASS|' else 'FAIL|' || c172 || ' / ' || k || ' / ' || n end];
      -- 37c: everything put back.
      if r172 is null then delete from public.memberships where org_id = own_a and user_id = b;
      else update public.memberships set role = r172 where org_id = own_a and user_id = b;
      end if;
      delete from public.job_bin where id = 'iso-test-v172-1';
      delete from public.sessions where id = 'iso-test-v172-1';
      delete from public.seat_changes where id > max172;
      select count(*) into k from public.sessions where id like 'iso-test-v172-%';
      res := res || array['37c|A''s test job and its Recently deleted lines gone, B''s place put back|'
        || case when k = 0 and public.member_role(own_a, b) is not distinct from r172 then 'PASS|' else 'FAIL|' || k || ' left' end];
    end if;
  end if;
  perform set_config('request.jwt.claims', '', true);

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
