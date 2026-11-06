-- PATGo cloud — V150: moving a job to another business (Change…)
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on an existing project, BEFORE the V150 app files go up: Dashboard →
-- SQL Editor → New query → paste this whole file → Run. Safe to run again. A new
-- project gets the same from schema.sql. Older phones keep working: they never
-- move a job, and an upload naming a business is still ignored.
--
-- V150 (Peter, 5–6 Nov — 0A 1A 2A 3A 4A):
--   • move_job(): Job settings → Business → Change…. Your own job, in the cloud,
--     unlocked, no certificate number, and you belong to both businesses. Out of
--     a business you OWN it moves at once; out of a team business where you're
--     Team leader, Office or Engineer it waits for someone ELSE (Owner / Team
--     leader / Office of that business) to approve (2A). Photos move with it.
--   • job_moves: the record of every move and request (1A) — who, when, from,
--     to, and what happened. No app can write, change or delete it.
--   • cancel_job_move(): the person who asked takes a waiting request back (2A).
--   • decide_job_move(): approve or refuse. The Approve screen comes with
--     invites; until then supabase/v150-test-decide-move.sql does it by hand (4A).
--   • my_job_moves(): what a phone shows on Job settings, and how it learns that
--     a waiting move was approved.
--   • The business stamp: an upload still never changes a job's business. The
--     move is the only thing that does.
--
-- The result is a short table of checks. Every row must say PASS (M3–M5 say
-- INCONCLUSIVE on a project with fewer than two accounts). Then run
-- supabase/isolation-test.sql as usual (checks 21a–21h are V150's).

-- ------------------------------------------------- the move log (1A)
-- One row per move or request. Kept for good: no app can write, change or
-- delete a row — only the functions below, and they only ever close a WAITING
-- row (waiting → moved / refused / cancelled / dropped). No foreign key to the
-- job: the record outlives the job (7 years, like everything else).
create table if not exists public.job_moves (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete restrict,   -- the job's owner
  session_id    text not null,
  from_org      uuid not null references public.organisations(id) on delete restrict,
  to_org        uuid not null references public.organisations(id) on delete restrict,
  requested_by  uuid not null references auth.users(id) on delete restrict,
  requested_at  timestamptz not null default clock_timestamp(),
  status        text not null check (status in ('waiting','moved','refused','cancelled','dropped')),
  decided_by    uuid references auth.users(id) on delete restrict,
  decided_at    timestamptz
);
alter table public.job_moves alter column requested_at set default clock_timestamp();
create index if not exists job_moves_job on public.job_moves (user_id, session_id, requested_at);
create index if not exists job_moves_from on public.job_moves (from_org, status);
-- One waiting request per job at a time.
create unique index if not exists job_moves_one_waiting on public.job_moves (user_id, session_id) where status = 'waiting';

alter table public.job_moves enable row level security;
revoke insert, update, delete, truncate, references, trigger on public.job_moves from public, anon, authenticated;
grant select on public.job_moves to authenticated;
drop policy if exists "read job moves" on public.job_moves;
-- The job's owner, and whoever reads either business (Owner / Team leader / Office).
create policy "read job moves" on public.job_moves for select to authenticated
  using (user_id = auth.uid() or public.can_read_org(from_org) or public.can_read_org(to_org));

-- Belt and braces under the grants: a row is never deleted by a signed-in
-- person, and only a waiting row ever changes — its status and who decided.
create or replace function public.job_moves_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if auth.uid() is not null then
      raise exception 'PATGo: the move record is kept' using errcode = '42501';
    end if;
    return old;
  end if;
  if old.status <> 'waiting'
     or new.user_id is distinct from old.user_id or new.session_id is distinct from old.session_id
     or new.from_org is distinct from old.from_org or new.to_org is distinct from old.to_org
     or new.requested_by is distinct from old.requested_by or new.requested_at is distinct from old.requested_at then
    raise exception 'PATGo: the move record is kept as it was' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists job_moves_guard on public.job_moves;
create trigger job_moves_guard before update or delete on public.job_moves
  for each row execute function public.job_moves_guard();


-- ------------------------------------------------- the stamp (V150)
-- Insert: unchanged from V149 (a named business only if the writer belongs to
--         it; a photo follows its job; else the default).
-- Update: the stamp still never changes — EXCEPT the one change the move itself
--         makes (_job_move_apply below), which marks its transaction with
--         exactly which job is going where. An upload naming a business is
--         still ignored, as since V113. Settings (records) never move.
-- ⚠ The mark is a transaction-local setting no app can make (there is no way to
-- run SQL from a phone), and the destination must still be one the job's owner
-- belongs to.
create or replace function public.org_stamp()
returns trigger language plpgsql security definer set search_path = '' as $$
declare mv text; ok boolean := false;
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
  elsif old.org_id is not null and new.org_id is distinct from old.org_id then
    mv := coalesce(current_setting('patgo.job_move', true), '');
    if mv <> '' and new.org_id is not null and tg_table_name in ('sessions', 'photos') then
      if tg_table_name = 'sessions' then
        ok := mv = new.user_id::text || '/' || new.id || '/' || new.org_id::text;
      else
        -- (Only reached for photos, as above.)
        ok := mv = new.user_id::text || '/' || new.session_id || '/' || new.org_id::text;
      end if;
      ok := ok and exists (select 1 from public.memberships m where m.org_id = new.org_id and m.user_id = new.user_id);
    end if;
    if not ok then
      new.org_id := old.org_id;
    end if;
  end if;
  return new;
end;
$$;


-- ------------------------------------------------- the move (V150)
-- Someone's role in a business (any person — the helpers above ask for "me").
create or replace function public.member_role(o uuid, u uuid)
returns text language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m where m.org_id = o and m.user_id = u
$$;

-- The move itself: the job row and its photo rows, together. Never called by a
-- phone (closed below) — only by move_job and _job_move_decide.
create or replace function public._job_move_apply(u uuid, job text, o_from uuid, o_to uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform set_config('patgo.job_move', u::text || '/' || job || '/' || o_to::text, true);
  update public.sessions set org_id = o_to where user_id = u and id = job and org_id = o_from;
  get diagnostics n = row_count;
  if n <> 1 then
    perform set_config('patgo.job_move', '', true);
    raise exception 'patgo_move_gone: that job is not where it was' using errcode = 'P0002';
  end if;
  update public.photos set org_id = o_to where user_id = u and session_id = job and org_id is distinct from o_to;
  perform set_config('patgo.job_move', '', true);
  if not exists (select 1 from public.sessions where user_id = u and id = job and org_id = o_to) then
    raise exception 'patgo_move_gone: the move did not take' using errcode = 'P0002';
  end if;
end;
$$;

-- Job settings → Business → Change… (2A). Your own job, in the cloud, not
-- deleted, unlocked, no certificate number; you belong to both businesses.
-- Out of a business where you are the Owner → moved now. Otherwise (a team
-- business you're Engineer / Team leader / Office in) → a request, waiting for
-- someone ELSE (Owner / Team leader / Office of that business) to approve.
-- Returns 'moved' or 'waiting'.
create or replace function public.move_job(job text, target uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  s record;
  r_from text; r_to text;
begin
  if me is null then
    raise exception 'patgo_move_role: sign in first' using errcode = '42501';
  end if;
  select x.org_id, x.doc, x.deleted into s from public.sessions x
  where x.user_id = me and x.id = job for update;
  if not found or s.deleted then
    raise exception 'patgo_move_gone: that job is not in the cloud' using errcode = 'P0002';
  end if;
  if target is null or s.org_id = target then
    raise exception 'patgo_move_same: the job is already there' using errcode = '22023';
  end if;
  r_from := public.member_role(s.org_id, me);
  r_to := public.member_role(target, me);
  if r_from is null or r_to is null then
    raise exception 'patgo_move_both: you need to belong to both businesses' using errcode = '42501';
  end if;
  if coalesce(s.doc ->> 'locked', '') = 'true' or coalesce(s.doc ->> 'certNo', '') <> '' then
    raise exception 'patgo_move_locked: a locked or certified job stays where it is' using errcode = '22023';
  end if;
  if exists (select 1 from public.job_moves m where m.user_id = me and m.session_id = job and m.status = 'waiting') then
    raise exception 'patgo_move_waiting: this job already has a move waiting' using errcode = '22023';
  end if;
  if r_from = 'owner' then
    perform public._job_move_apply(me, job, s.org_id, target);
    insert into public.job_moves (user_id, session_id, from_org, to_org, requested_by, status, decided_by, decided_at)
    values (me, job, s.org_id, target, me, 'moved', me, clock_timestamp());
    return 'moved';
  end if;
  insert into public.job_moves (user_id, session_id, from_org, to_org, requested_by, status)
  values (me, job, s.org_id, target, me, 'waiting');
  return 'waiting';
end;
$$;

-- The person who asked takes a waiting request back. dropped = true when the
-- phone found the job locked or certified meanwhile (2A).
create or replace function public.cancel_job_move(move uuid, dropped boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare m record; st text := case when dropped then 'dropped' else 'cancelled' end;
begin
  select * into m from public.job_moves x where x.id = move for update;
  if not found or m.requested_by is distinct from auth.uid() then
    raise exception 'patgo_move_role: only the person who asked can take it back' using errcode = '42501';
  end if;
  if m.status <> 'waiting' then
    return m.status;
  end if;
  update public.job_moves set status = st, decided_by = auth.uid(), decided_at = clock_timestamp() where id = move;
  return st;
end;
$$;

-- Approve or refuse a waiting request, as person `decider` — someone ELSE who
-- is Owner / Team leader / Office of the business the job is leaving. On
-- approval it is checked again: still there, still unlocked and uncertified,
-- its owner still in both — otherwise 'dropped'. Closed to phones: they use
-- decide_job_move (below), which is this as the signed-in person. The test aid
-- (supabase/v150-test-decide-move.sql) calls it directly from the SQL Editor.
create or replace function public._job_move_decide(move uuid, approve boolean, decider uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare m record; s record;
begin
  select * into m from public.job_moves x where x.id = move for update;
  if not found or m.status <> 'waiting' then
    raise exception 'patgo_move_stale: that request is no longer waiting' using errcode = 'P0002';
  end if;
  if decider is null or decider = m.requested_by then
    raise exception 'patgo_move_self: someone else has to approve this' using errcode = '42501';
  end if;
  if coalesce(public.member_role(m.from_org, decider) in ('owner','team_leader','office'), false) is not true then
    raise exception 'patgo_move_role: only the Owner, a Team leader or the Office can decide this' using errcode = '42501';
  end if;
  if not approve then
    update public.job_moves set status = 'refused', decided_by = decider, decided_at = clock_timestamp() where id = move;
    return 'refused';
  end if;
  select x.org_id, x.doc, x.deleted into s from public.sessions x
  where x.user_id = m.user_id and x.id = m.session_id for update;
  if not found or s.deleted or s.org_id is distinct from m.from_org
     or coalesce(s.doc ->> 'locked', '') = 'true' or coalesce(s.doc ->> 'certNo', '') <> ''
     or public.member_role(m.to_org, m.user_id) is null then
    update public.job_moves set status = 'dropped', decided_by = decider, decided_at = clock_timestamp() where id = move;
    return 'dropped';
  end if;
  perform public._job_move_apply(m.user_id, m.session_id, m.from_org, m.to_org);
  update public.job_moves set status = 'moved', decided_by = decider, decided_at = clock_timestamp() where id = move;
  return 'moved';
end;
$$;

create or replace function public.decide_job_move(move uuid, approve boolean)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'patgo_move_role: sign in first' using errcode = '42501';
  end if;
  return public._job_move_decide(move, approve, auth.uid());
end;
$$;

-- The phone's view: the latest move or request for each of MY jobs, with both
-- businesses' names (a business I've since left still has its name here).
create or replace function public.my_job_moves()
returns table (id uuid, session_id text, from_org uuid, from_name text, to_org uuid, to_name text,
               status text, requested_at timestamptz, decided_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select distinct on (m.session_id)
         m.id, m.session_id, m.from_org, f.name, m.to_org, t.name, m.status, m.requested_at, m.decided_at
  from public.job_moves m
  join public.organisations f on f.id = m.from_org
  join public.organisations t on t.id = m.to_org
  where m.user_id = auth.uid()
  order by m.session_id, m.requested_at desc, m.id
$$;

revoke all on function public.member_role(uuid, uuid) from public, anon, authenticated;
revoke all on function public._job_move_apply(uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public._job_move_decide(uuid, boolean, uuid) from public, anon, authenticated;
revoke all on function public.move_job(text, uuid) from public, anon;
revoke all on function public.cancel_job_move(uuid, boolean) from public, anon;
revoke all on function public.decide_job_move(uuid, boolean) from public, anon;
revoke all on function public.my_job_moves() from public, anon;
grant execute on function public.move_job(text, uuid) to authenticated;
grant execute on function public.cancel_job_move(uuid, boolean) to authenticated;
grant execute on function public.decide_job_move(uuid, boolean) to authenticated;
grant execute on function public.my_job_moves() to authenticated;


-- ------------------------------------------------------------ self-check
drop table if exists pg_temp._v150_result;
create temp table _v150_result (n int, check_name text, result text);

do $v150$
declare
  i int; j int; k int; res text[] := '{}';
  u uuid; u2 uuid; o_def uuid; o_t uuid; got uuid; st text; mid uuid; msg text;
begin
  -- M1: the record is read-only to phones, with its rules on.
  select count(*) into i from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relname = 'job_moves' and c.relrowsecurity;
  select count(*) into j from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'job_moves'
    and grantee in ('authenticated', 'anon', 'PUBLIC') and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
  select count(*) into k from pg_policies where schemaname = 'public' and tablename = 'job_moves'
    and cmd = 'SELECT' and qual like '%user_id = auth.uid()%' and qual like '%can_read_org(from_org)%';
  i := i + k;
  select count(*) into k from pg_policies where schemaname = 'public' and tablename = 'job_moves';
  j := j + k - 1;
  res := res || array['M1|the move record: rules on, nobody writes it directly|' || case when i = 2 and j = 0 then 'PASS' else 'FAIL (' || i || ', ' || j || ')' end];

  -- M2: four calls for signed-in phones; the inner three closed to everyone.
  select count(*) into i from information_schema.role_routine_grants
  where routine_schema = 'public' and grantee = 'authenticated'
    and routine_name in ('move_job', 'cancel_job_move', 'decide_job_move', 'my_job_moves');
  select count(*) into j from information_schema.role_routine_grants
  where routine_schema = 'public' and grantee in ('anon', 'PUBLIC', 'authenticated')
    and routine_name in ('member_role', '_job_move_apply', '_job_move_decide');
  select count(*) into k from information_schema.role_routine_grants
  where routine_schema = 'public' and grantee in ('anon', 'PUBLIC')
    and routine_name in ('move_job', 'cancel_job_move', 'decide_job_move', 'my_job_moves');
  res := res || array['M2|move, cancel, decide, list: signed-in only; the inner steps closed|' || case when i = 4 and j = 0 and k = 0 then 'PASS' else 'FAIL (' || i || ', ' || j || ', ' || k || ')' end];

  -- M3–M5 on two real accounts, inside a block that is always undone.
  select m.user_id, m.org_id into u, o_def from public.memberships m where m.is_default and m.role = 'owner' limit 1;
  select m.user_id into u2 from public.memberships m where m.is_default and m.user_id <> u limit 1;
  if u is null or u2 is null then
    res := res || array['M3|a move, a request, an approval (undone)|INCONCLUSIVE (needs two accounts)'];
  else
    k := 0;
    begin
      -- A team owned by u2, with u as Engineer; u's job and its photo at home.
      insert into public.organisations (name) values ('v150 self-check') returning id into o_t;
      insert into public.memberships (org_id, user_id, role) values (o_t, u2, 'owner'), (o_t, u, 'engineer');
      insert into public.sessions (id, user_id, doc, deleted, last_modified) values ('v150-check-1', u, '{}', false, now());
      insert into public.photos (id, user_id, session_id, item_id, storage_path, deleted, last_modified)
      values ('v150-check-p', u, 'v150-check-1', 'i1', 'x', false, now());
      -- M3: u owns home → into the team at once; the photo goes too; recorded.
      perform set_config('request.jwt.claims', json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      st := public.move_job('v150-check-1', o_t);
      execute 'reset role';
      if st = 'moved'
         and exists (select 1 from public.sessions where user_id = u and id = 'v150-check-1' and org_id = o_t)
         and exists (select 1 from public.photos where user_id = u and id = 'v150-check-p' and org_id = o_t)
         and exists (select 1 from public.job_moves where user_id = u and session_id = 'v150-check-1' and status = 'moved' and from_org = o_def and to_org = o_t)
      then k := k + 1; end if;
      -- M4: back out of the team as its Engineer → waits; u can't approve it; u2 can.
      execute 'set local role authenticated';
      st := public.move_job('v150-check-1', o_def);
      select id into mid from public.job_moves where user_id = u and session_id = 'v150-check-1' and status = 'waiting';
      execute 'reset role';
      -- …and u can't approve it, even as a Team leader (who could approve anyone else's).
      update public.memberships set role = 'team_leader' where org_id = o_t and user_id = u;
      execute 'set local role authenticated';
      begin perform public.decide_job_move(mid, true); msg := 'self-approved'; exception when others then msg := ''; end;
      execute 'reset role';
      update public.memberships set role = 'engineer' where org_id = o_t and user_id = u;
      if st = 'waiting' and msg = '' and exists (select 1 from public.sessions where user_id = u and id = 'v150-check-1' and org_id = o_t) then
        perform set_config('request.jwt.claims', json_build_object('sub', u2::text, 'role', 'authenticated')::text, true);
        -- …an Engineer of the team (u2 for a moment) can't decide it either…
        update public.memberships set role = 'engineer' where org_id = o_t and user_id = u2;
        execute 'set local role authenticated';
        begin perform public.decide_job_move(mid, true); msg := 'engineer-approved'; exception when others then null; end;
        begin perform public.cancel_job_move(mid); msg := 'cancelled-by-another'; exception when others then null; end;
        execute 'reset role';
        update public.memberships set role = 'owner' where org_id = o_t and user_id = u2;
        execute 'set local role authenticated';
        if msg <> '' then raise exception 'v150-m4 %', msg; end if;
        st := public.decide_job_move(mid, true);
        execute 'reset role';
        if st = 'moved'
           and exists (select 1 from public.sessions where user_id = u and id = 'v150-check-1' and org_id = o_def)
           and exists (select 1 from public.photos where user_id = u and id = 'v150-check-p' and org_id = o_def)
        then k := k + 10; end if;
      end if;
      -- M5: an upload naming the team still never moves it; a locked job stays put;
      -- the record can't be written to directly.
      perform set_config('request.jwt.claims', json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      update public.sessions set org_id = o_t, doc = '{"locked":true}' where user_id = u and id = 'v150-check-1';
      j := 0;
      begin perform public.move_job('v150-check-1', o_t); exception when others then j := j + 1; end;
      begin update public.job_moves set status = 'refused' where id = mid; get diagnostics i = row_count; if i = 0 then j := j + 1; end if; exception when others then j := j + 1; end;
      begin delete from public.job_moves where id = mid; get diagnostics i = row_count; if i = 0 then j := j + 1; end if; exception when others then j := j + 1; end;
      execute 'reset role';
      if j = 3 and exists (select 1 from public.sessions where user_id = u and id = 'v150-check-1' and org_id = o_def) then k := k + 100; end if;
      raise exception 'v150-undo';
    exception when others then
      if sqlerrm <> 'v150-undo' then k := -1; res := res || array['M3|(error)|FAIL (' || sqlerrm || ')']; end if;
    end;
    res := res || array['M3|your own business → a team: moved at once, photos too, recorded (undone)|' || case when k >= 0 and k % 10 = 1 then 'PASS' else 'FAIL' end];
    res := res || array['M4|out of a team as Engineer: waits; only someone else who decides may approve (undone)|' || case when k >= 0 and (k / 10) % 10 = 1 then 'PASS' else 'FAIL' end];
    res := res || array['M5|an upload never moves it; locked stays; the record can''t be edited (undone)|' || case when k >= 0 and k / 100 = 1 then 'PASS' else 'FAIL' end];
  end if;

  insert into _v150_result
  select row_number() over (), split_part(x, '|', 1) || ' ' || split_part(x, '|', 2), split_part(x, '|', 3)
  from unnest(res) as x;
end
$v150$;

select check_name, result from _v150_result order by n;
