-- PATGo cloud — V149: every job knows its business
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on an existing project, BEFORE the V149 app files go up: Dashboard →
-- SQL Editor → New query → paste this whole file → Run. Safe to run again. A new
-- project gets the same from schema.sql. Every app version keeps working: older
-- phones never name a business, and get the default exactly as before.
--
-- Found at the V148 round: V113 stamps a new job with the writer's DEFAULT
-- business. Once someone belongs to two businesses (their own, and a team they
-- work for), every job they make would be filed under the default, whoever it
-- was for — and the stamp never moves. V149 (Peter, 2 and 5 Nov — 0A 1A 3A 4A):
--   • A phone may name the business a NEW job is for. The database keeps it only
--     if the writer belongs to that business; anything else (an older phone that
--     names none, a business the writer has since left) gets the default, as
--     before. Changing an existing job's business is still refused here — that
--     is V150's deliberate, recorded move, with approval out of a team.
--   • A photo row takes its JOB's business (a phone never names one for a
--     photo), so a team job's photos are the team's. A photo whose job row is
--     not in the cloud gets the default, as before (phones send a job's photos
--     only after the job itself).
--   • my_businesses(): the signed-in person's businesses — name, their role, the
--     default, how many people — for the phone's "For:" choice and its Business
--     page.
--   • set_business_name(): the Owner names their business (3A). Nobody else, and
--     only through this — the table itself stays read-only to the app.
--   • Clients, sites, presets and the rest stay on the default business (4A).
--
-- The result is a short table of checks. Every row must say PASS. Then run
-- supabase/isolation-test.sql as usual (checks 20a–20h are V149's).


-- ------------------------------------------------- the stamp (new jobs)
-- Insert: a named business is kept only if the writer belongs to it; a photo
--         with none takes its job's; anything left gets the writer's default.
-- Update: the stamp never changes once set (unchanged from V113 — a phone's
--         upsert may name a business, and it is ignored).
-- ⚠ RLS checks the row AFTER this trigger, so a business swapped for the default
-- here is checked as the default — an old membership never turns into an error.
create or replace function public.org_stamp()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.org_id is not null and not exists (
      select 1 from public.memberships m where m.org_id = new.org_id and m.user_id = new.user_id
    ) then
      new.org_id := null;
    end if;
    -- (Only reached for photos: NEW.session_id exists on that table alone.)
    if new.org_id is null and tg_table_name = 'photos' then
      select s.org_id into new.org_id from public.sessions s
      where s.user_id = new.user_id and s.id = new.session_id;
      if new.org_id is not null and not exists (
        select 1 from public.memberships m where m.org_id = new.org_id and m.user_id = new.user_id
      ) then
        new.org_id := null;
      end if;
    end if;
    if new.org_id is null then
      new.org_id := public.default_org(new.user_id);
      if new.org_id is null then
        raise exception 'PATGo: account % has no business', new.user_id;
      end if;
    end if;
  elsif old.org_id is not null then
    new.org_id := old.org_id;
  end if;
  return new;
end;
$$;


-- ------------------------------------------------- my businesses
create or replace function public.my_businesses()
returns table (id uuid, name text, role text, is_default boolean, members integer)
language sql stable security definer set search_path = '' as $$
  select o.id, o.name, m.role, m.is_default, public.org_size(o.id)
  from public.memberships m
  join public.organisations o on o.id = m.org_id
  where m.user_id = auth.uid()
  order by m.is_default desc, o.created_at, o.id
$$;
revoke all on function public.my_businesses() from public, anon;
grant execute on function public.my_businesses() to authenticated;


-- ------------------------------------------------- naming (3A)
-- The Owner only. 1–80 characters after trimming; returns the name kept.
create or replace function public.set_business_name(o uuid, n text)
returns text language plpgsql security definer set search_path = '' as $$
declare v text := btrim(coalesce(n, ''));
begin
  if public.my_role(o) is distinct from 'owner' then
    raise exception 'PATGo: only the owner can name this business' using errcode = '42501';
  end if;
  if length(v) < 1 or length(v) > 80 then
    raise exception 'PATGo: a business name is 1 to 80 characters' using errcode = '22023';
  end if;
  update public.organisations set name = v where id = o;
  return v;
end;
$$;
revoke all on function public.set_business_name(uuid, text) from public, anon;
grant execute on function public.set_business_name(uuid, text) to authenticated;


-- ------------------------------------------------------------ self-check
drop table if exists pg_temp._v149_result;
create temp table _v149_result (n int, check_name text, result text);

do $v149$
declare
  i int; j int; k int; res text[] := '{}';
  u uuid; o_def uuid; o_other uuid; got uuid;
begin
  -- B1: the stamp checks membership and lets photos follow their job.
  select count(*) into i from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.proname = 'org_stamp'
    and p.prosrc like '%m.org_id = new.org_id and m.user_id = new.user_id%'
    and p.prosrc like '%s.id = new.session_id%';
  res := res || array['B1|the stamp keeps only a business the writer belongs to; photos follow their job|' || case when i = 1 then 'PASS' else 'FAIL' end];

  -- B2: the two functions are open to signed-in phones and closed to the signed-out.
  select count(*) into i from information_schema.role_routine_grants
  where routine_schema = 'public' and grantee = 'authenticated'
    and routine_name in ('my_businesses', 'set_business_name');
  select count(*) into j from information_schema.role_routine_grants
  where routine_schema = 'public' and grantee in ('anon', 'PUBLIC')
    and routine_name in ('my_businesses', 'set_business_name');
  res := res || array['B2|my_businesses and set_business_name: signed-in only|' || case when i = 2 and j = 0 then 'PASS' else 'FAIL (' || i || ', ' || j || ')' end];

  -- B3–B5 on a real account, inside a block that is always undone.
  select m.user_id, m.org_id into u, o_def from public.memberships m where m.is_default limit 1;
  if u is null then
    res := res || array['B3|a named business, a stranger''s, none (undone)|INCONCLUSIVE (no accounts yet)'];
  else
    k := 0;
    begin
      insert into public.organisations (name) values ('v149 self-check') returning id into o_other;
      -- B3: a business the writer is NOT in → the default.
      insert into public.sessions (id, user_id, doc, deleted, last_modified, org_id)
      values ('v149-check-1', u, '{}', false, now(), o_other);
      select org_id into got from public.sessions where user_id = u and id = 'v149-check-1';
      if got = o_def then k := k + 1; end if;
      -- B4: once a member, the named business is kept…
      insert into public.memberships (org_id, user_id, role) values (o_other, u, 'engineer');
      insert into public.sessions (id, user_id, doc, deleted, last_modified, org_id)
      values ('v149-check-2', u, '{}', false, now(), o_other);
      select org_id into got from public.sessions where user_id = u and id = 'v149-check-2';
      if got = o_other then k := k + 10; end if;
      -- …a photo of that job follows it…
      insert into public.photos (id, user_id, session_id, item_id, storage_path, deleted, last_modified)
      values ('v149-check-p', u, 'v149-check-2', 'i1', 'x', false, now());
      select org_id into got from public.photos where user_id = u and id = 'v149-check-p';
      if got = o_other then k := k + 100; end if;
      -- …and an update naming another never moves it (B5).
      update public.sessions set org_id = o_def, doc = '{"x":1}' where user_id = u and id = 'v149-check-2';
      select org_id into got from public.sessions where user_id = u and id = 'v149-check-2';
      if got = o_other then k := k + 1000; end if;
      raise exception 'v149-undo';
    exception when others then
      if sqlerrm <> 'v149-undo' then k := -1; res := res || array['B3|(error)|FAIL (' || sqlerrm || ')']; end if;
    end;
    res := res || array['B3|a business the writer isn''t in → the default (undone)|' || case when k >= 0 and k % 10 = 1 then 'PASS' else 'FAIL' end];
    res := res || array['B4|a member''s named business is kept, and its photos follow (undone)|' || case when k >= 0 and (k / 10) % 100 = 11 then 'PASS' else 'FAIL' end];
    res := res || array['B5|an update never moves the stamp (undone)|' || case when k >= 0 and k / 1000 = 1 then 'PASS' else 'FAIL' end];
  end if;

  insert into _v149_result
  select row_number() over (), split_part(x, '|', 1) || ' ' || split_part(x, '|', 2), split_part(x, '|', 3)
  from unnest(res) as x;
end
$v149$;

select check_name, result from _v149_result order by n;
