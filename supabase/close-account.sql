-- PATGo cloud — close an account
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- What the privacy policy promises: a closure request is emailed to hello@ or
-- peter@ FROM the address the account signs in with; we confirm, delete the
-- account's cloud data within 30 days, and say when it's done. Phones are
-- never touched. This file is the deleting part.
--
-- THE STEPS, IN ORDER
--  1. Check the request came from the sign-in address itself. If not, reply
--     to the sign-in address asking them to confirm from there. Nothing else.
--  2. Reply: "Got it — your account will be closed within 30 days. If you want
--     a copy, use Export everything on your phone before then."
--     (From the Stripe release on: cancel their subscription in Stripe now.)
--  3. LOOK. Dashboard → SQL Editor → New query → paste this whole file →
--     change the email on the `who` line below → Run. It changes NOTHING.
--     Every line should read OK ("to delete" on the photo files line is fine).
--     Note the "login id" line. Any STOP: see WHEN IT STOPS below.
--  4. PHOTO FILES. Dashboard → Storage → photos → the folder named with the
--     login id from step 3 → tick it → Delete. (Skip if the look said 0 files.)
--     Photo files can only be removed there — SQL can't delete them.
--  5. DELETE. Run this file again with `mode` changed from 'look' to
--     'delete'. Every line must read OK and the last line must say
--     "Nothing left". If any line says STOP, nothing was deleted at all —
--     bring the output to the next chat.
--  6. Email them: "Your PATGo account and its cloud data have now been
--     deleted. Anything on your phone is still there until you delete it."
--  7. Keep a note for your own records: the email address, the date of the
--     request and the date it was done. Nothing else about them.
--
-- WHAT IT DELETES (mode 'delete'), all in one go — if any step fails, the
-- whole thing is undone and nothing is deleted:
--  · every job, record and photo row of the login, live or deleted-marker;
--  · its business, when it is the business's only member (every account today);
--  · the login itself, which takes its profile, phone rows and membership.
--
-- WHEN IT STOPS INSTEAD (nothing deleted):
--  · no login has that email;
--  · photo files are still in Storage (step 4 not done yet);
--  · the login is in a business with other members, or another person's rows
--    are in its business — that's a team account (Stage 16): a leaver keeps
--    their login and the business keeps their jobs, so this needs a decision,
--    not this file.

drop table if exists pg_temp._close;
create temp table _close (n int, what text, result text);

do $close$
declare
  who  text := 'CHANGE-ME@example.com';   -- ← the account's sign-in email
  mode text := 'look';                    -- ← 'look' changes nothing; 'delete' closes the account

  u uuid; v_plan text;
  n_jobs int; n_records int; n_photo_rows int; n_files int; n_phones int;
  n_orgs int; n_shared int; n_others int; n_left int;
  stop boolean := false;
begin
  if mode not in ('look', 'delete') then
    raise exception 'PATGo: mode must be ''look'' or ''delete''';
  end if;

  select id into u from auth.users where lower(email) = lower(trim(who));
  if u is null then
    insert into _close values (1, 'login', 'STOP — no login has the email ' || who);
    return;
  end if;
  insert into _close values (1, 'login id', 'OK — ' || u::text);

  select plan into v_plan from public.profiles where id = u;
  insert into _close values (2, 'plan', 'OK — ' || coalesce(v_plan, '(no profile)'));

  select count(*) into n_jobs       from public.sessions where user_id = u;
  select count(*) into n_records    from public.records  where user_id = u;
  select count(*) into n_photo_rows from public.photos   where user_id = u;
  select count(*) into n_phones     from public.phones   where user_id = u;
  select count(*) into n_files      from storage.objects
    where bucket_id = 'photos' and (storage.foldername(name))[1] = u::text;
  insert into _close values
    (3, 'jobs (incl. deleted markers)',   'OK — ' || n_jobs),
    (4, 'records (incl. deleted markers)','OK — ' || n_records),
    (5, 'photo rows',                     'OK — ' || n_photo_rows),
    (6, 'phones',                         'OK — ' || n_phones);

  if n_files > 0 then
    insert into _close values (7, 'photo files in Storage',
      case when mode = 'delete' then 'STOP — ' else 'to delete — ' end
      || n_files || ' in Storage → photos → ' || u::text || ' (step 4)');
    if mode = 'delete' then stop := true; end if;
  else
    insert into _close values (7, 'photo files in Storage', 'OK — 0');
  end if;

  -- Businesses: every one this login belongs to must be its alone.
  select count(*) into n_orgs from public.memberships where user_id = u;
  select count(*) into n_shared from public.memberships m
    where m.user_id = u
      and exists (select 1 from public.memberships o where o.org_id = m.org_id and o.user_id <> u);
  select (select count(*) from public.sessions s join public.memberships m on m.org_id = s.org_id
            where m.user_id = u and s.user_id <> u)
       + (select count(*) from public.records r join public.memberships m on m.org_id = r.org_id
            where m.user_id = u and r.user_id <> u)
       + (select count(*) from public.photos p join public.memberships m on m.org_id = p.org_id
            where m.user_id = u and p.user_id <> u)
    into n_others;
  if n_shared > 0 or n_others > 0 then
    insert into _close values (8, 'businesses', 'STOP — a team account: '
      || n_shared || ' business(es) with other members, ' || n_others
      || ' row(s) from other people. Not for this file (Stage 16).');
    stop := true;
  else
    insert into _close values (8, 'businesses', 'OK — ' || n_orgs || ', this login''s alone');
  end if;

  -- Rows stamped with a business this login isn't a member of (left a team).
  select (select count(*) from public.sessions s where s.user_id = u
            and not exists (select 1 from public.memberships m where m.user_id = u and m.org_id = s.org_id))
       + (select count(*) from public.records r where r.user_id = u
            and not exists (select 1 from public.memberships m where m.user_id = u and m.org_id = r.org_id))
       + (select count(*) from public.photos p where p.user_id = u
            and not exists (select 1 from public.memberships m where m.user_id = u and m.org_id = p.org_id))
    into n_left;
  if n_left > 0 then
    insert into _close values (9, 'work for other businesses', 'STOP — ' || n_left
      || ' row(s) belong to a business this login has left. They are that business''s (R5). Not for this file.');
    stop := true;
  else
    insert into _close values (9, 'work for other businesses', 'OK — none');
  end if;

  if mode = 'look' then
    insert into _close values (10, 'mode look', case when stop then 'STOP — see above'
      else 'OK — nothing changed. Delete the photo files (step 4) if any, then run again with mode ''delete''.' end);
    return;
  end if;

  if stop then
    insert into _close values (10, 'mode delete', 'STOP — nothing was deleted');
    return;
  end if;

  -- Deleting. One transaction: any error undoes all of it.
  delete from public.photos   where user_id = u;
  delete from public.records  where user_id = u;
  delete from public.sessions where user_id = u;
  delete from public.organisations o
    where o.id in (select m.org_id from public.memberships m where m.user_id = u);
  delete from auth.users where id = u;   -- profile, phones, memberships go with it

  if exists (select 1 from auth.users where id = u)
     or exists (select 1 from public.profiles where id = u)
     or exists (select 1 from public.sessions where user_id = u)
     or exists (select 1 from public.records  where user_id = u)
     or exists (select 1 from public.photos   where user_id = u)
     or exists (select 1 from public.phones   where user_id = u)
     or exists (select 1 from public.memberships where user_id = u) then
    raise exception 'PATGo: something was left behind — nothing has been deleted';
  end if;
  insert into _close values (10, 'mode delete',
    'OK — Nothing left. ' || n_jobs || ' jobs, ' || n_records || ' records, '
    || n_photo_rows || ' photo rows, ' || n_orgs || ' business, the login. Send the step 6 email.');
end
$close$;

select n as "#", what, result from _close order by n;
