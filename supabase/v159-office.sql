-- PATGo cloud — V159: Office never holds a job
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on an existing project, AFTER the V159 app files are up:
-- Dashboard → SQL Editor → New query → paste this whole file → Run. Safe to run
-- again. A new project gets the same from schema.sql.
--
-- V159 (the second GPT audit, finding 2 — Peter, 12 Nov: R68 3A; R69; the V159
-- round 1A 2A 3A 4A, the defaults). Office sees, approves and exports; Office
-- never HOLDS a job (R69: an assigned job will be created in the ENGINEER's name
-- — a deliberate, separate route, not a loosening of these rules).
--   • A job (or photo) an Office member sends naming that business for the FIRST
--     time is filed in their main business instead — as for a non-member (1A).
--     A job already there carries on (3A): updates to your own rows still land.
--   • Moving a job INTO a business where you're Office is refused; a waiting
--     request whose asker has since become Office there is dropped on approval.
--   • An Office business can't be your main one: Make main refuses it, Join
--     ignores "make it main" for an Office invite, and changing someone to Office
--     in their main business makes their own business main again.
--   • A one-off fix-up for anyone whose main business is already an Office one.
-- No new table or column.
--
-- ⚠ Re-running supabase/v150-business-move.sql or v155-invites.sql puts their
-- older versions of these functions back: run this file again after either.
--
-- The result is a short table of checks. Every row must say PASS. Then run
-- supabase/isolation-test.sql as usual (26a–26e are this release's).

-- ================================================================ V159
-- Office never holds a job (the second audit, finding 2 — Peter, 12 Nov: R68 3A,
-- R69, V159 round 1A–4A). Existing projects: supabase/v159-office.sql (plus
-- self-checks O1–O4). Kept in step with it byte for byte by harness group 98e.

-- Uploads (1A). V150's org_stamp, plus: a job or photo row ARRIVING (insert)
-- with a business where its holder is Office is filed as if it named none —
-- the holder's main business; a photo then follows its job. The update path is
-- V150's unchanged, so a job already in that business stays and carries on (3A),
-- and an upsert of it (insert-then-update) is put back by the update path. Only
-- jobs and photos: the account's own records don't belong to a business's work.
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
    -- V159: Office never holds a job.
    if new.org_id is not null and tg_table_name in ('sessions', 'photos')
       and public.member_role(new.org_id, new.user_id) = 'office' then
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

-- V150's move_job, plus: never INTO a business where you're Office. (Moving a
-- job you hold out of one is V150's: it asks someone else there to approve.)
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
  if r_to = 'office' then
    raise exception 'patgo_move_office: as Office you don''t hold jobs there' using errcode = '42501';
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

-- V150's decision, plus: an approval drops a request whose asker is now Office
-- in the business it was going to (they were changed while it waited).
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
     or public.member_role(m.to_org, m.user_id) is null
     or public.member_role(m.to_org, m.user_id) = 'office' then
    update public.job_moves set status = 'dropped', decided_by = decider, decided_at = clock_timestamp() where id = move;
    return 'dropped';
  end if;
  perform public._job_move_apply(m.user_id, m.session_id, m.from_org, m.to_org);
  update public.job_moves set status = 'moved', decided_by = decider, decided_at = clock_timestamp() where id = move;
  return 'moved';
end;
$$;

-- A person's main business is never one where they're Office: if it is, their
-- own business (the one they own) becomes main — else the oldest one they're
-- not Office in. Everyone owns their own business from sign-up, so there is
-- always one; if somehow not, nothing changes (their main stays as it was).
-- Never called by a phone (closed below).
create or replace function public._main_off_office(u uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare cur uuid; tgt uuid;
begin
  select m.org_id into cur from public.memberships m
  where m.user_id = u and m.is_default and m.role = 'office';
  if cur is null then return; end if;
  select m.org_id into tgt from public.memberships m
  where m.user_id = u and m.role <> 'office'
  order by (m.role = 'owner') desc, m.created_at, m.org_id limit 1;
  if tgt is null then return; end if;
  update public.memberships set is_default = false where user_id = u and org_id = cur;
  update public.memberships set is_default = true where user_id = u and org_id = tgt;
end;
$$;

-- V155's Join, plus: "make it main" is ignored for an Office invite.
create or replace function public.accept_invite(i uuid, make_main boolean default false)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v public.invites; me uuid := auth.uid(); em text := public._my_confirmed_email();
begin
  select * into v from public.invites where id = i for update;
  if not found or me is null or em is null or v.email <> em then raise exception 'patgo_not_allowed'; end if;
  if v.status <> 'waiting' or v.expires_at <= now() then raise exception 'patgo_invite_gone'; end if;
  if exists (select 1 from public.memberships m where m.org_id = v.org_id and m.user_id = me) then
    update public.invites set status = 'joined', decided_at = now() where id = i;
    return 'joined';
  end if;
  -- 3A: a Team leader or Office joiner reads the team — so every phone of
  -- theirs must be one that may sync, whatever the role.
  if public._user_phones_behind(me) > 0 then raise exception 'patgo_your_phones_behind'; end if;
  insert into public.memberships (org_id, user_id, role, is_default, name)
  values (v.org_id, me, v.role, false, v.name);
  if coalesce(make_main, false) and v.role <> 'office' then
    update public.memberships set is_default = false where user_id = me and is_default;
    update public.memberships set is_default = true where user_id = me and org_id = v.org_id;
  end if;
  update public.invites set status = 'joined', decided_at = now() where id = i;
  return 'joined';
end;
$$;

-- V155's Change role, plus: someone changed to Office whose main business this
-- was gets their own business back as main (4A's words say so on the phone).
create or replace function public.set_member_role(o uuid, u uuid, r text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare cur text;
begin
  if auth.uid() is null or public.my_role(o) is distinct from 'owner' or u = auth.uid()
     or r not in ('team_leader','engineer','office') then
    raise exception 'patgo_not_allowed';
  end if;
  select m.role into cur from public.memberships m where m.org_id = o and m.user_id = u for update;
  if cur is null or cur = 'owner' then raise exception 'patgo_not_allowed'; end if;
  update public.memberships set role = r where org_id = o and user_id = u;
  if r = 'office' then perform public._main_off_office(u); end if;
  return r;
end;
$$;

-- V155's Make main, plus: never a business where you're Office.
create or replace function public.set_main_business(o uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.my_role(o) is null then raise exception 'patgo_not_allowed'; end if;
  if public.my_role(o) = 'office' then raise exception 'patgo_main_office'; end if;
  update public.memberships set is_default = false where user_id = auth.uid() and is_default and org_id <> o;
  update public.memberships set is_default = true where user_id = auth.uid() and org_id = o and not is_default;
  return true;
end;
$$;

revoke all on function public._main_off_office(uuid) from public, anon, authenticated;

-- The one-off fix-up: anyone whose main business is already one where they're
-- Office (Join with "make it main", Make main, or changed to Office) gets their
-- own back. Safe to run again: nobody is left to fix.
do $fix$
declare u uuid;
begin
  for u in select m.user_id from public.memberships m where m.is_default and m.role = 'office' loop
    perform public._main_off_office(u);
  end loop;
end $fix$;
-- ================================================================ self-checks
drop table if exists pg_temp._v159_result;
create temp table _v159_result (n int, check_name text, result text);

do $v159$
declare res text[] := '{}'; n int;
begin
  -- O1: the rules are in place.
  res := res || array['O1|uploads, moves, approvals, Join, Change role and Make main all know about Office|'
    || case when exists (select 1 from pg_proc p join pg_namespace x on x.oid = p.pronamespace
                         where x.nspname = 'public' and p.proname = 'org_stamp' and p.prosrc like '%V159: Office never holds a job%')
             and exists (select 1 from pg_proc p join pg_namespace x on x.oid = p.pronamespace
                         where x.nspname = 'public' and p.proname = 'move_job' and p.prosrc like '%patgo_move_office%')
             and exists (select 1 from pg_proc p join pg_namespace x on x.oid = p.pronamespace
                         where x.nspname = 'public' and p.proname = '_job_move_decide' and p.prosrc like '%m.user_id) = ''office''%')
             and exists (select 1 from pg_proc p join pg_namespace x on x.oid = p.pronamespace
                         where x.nspname = 'public' and p.proname = 'accept_invite' and p.prosrc like '%v.role <> ''office''%')
             and exists (select 1 from pg_proc p join pg_namespace x on x.oid = p.pronamespace
                         where x.nspname = 'public' and p.proname = 'set_member_role' and p.prosrc like '%_main_off_office(u)%')
             and exists (select 1 from pg_proc p join pg_namespace x on x.oid = p.pronamespace
                         where x.nspname = 'public' and p.proname = 'set_main_business' and p.prosrc like '%patgo_main_office%')
            then 'PASS' else 'FAIL' end];
  -- O2: phones can't call the fix-up helper.
  res := res || array['O2|the main-business helper is closed to phones|'
    || case when not has_function_privilege('authenticated', 'public._main_off_office(uuid)', 'execute')
             and not has_function_privilege('anon', 'public._main_off_office(uuid)', 'execute')
            then 'PASS' else 'FAIL' end];
  -- O3: nobody's main business is one where they're Office.
  select count(*) into n from public.memberships m where m.is_default and m.role = 'office';
  res := res || array['O3|nobody''s main business is one where they''re Office|'
    || case when n = 0 then 'PASS' else 'FAIL|' || n || ' left' end];
  -- O4: everyone still has a main business.
  select count(*) into n from auth.users u
  where exists (select 1 from public.memberships m where m.user_id = u.id)
    and not exists (select 1 from public.memberships m where m.user_id = u.id and m.is_default);
  res := res || array['O4|everyone in a business still has a main one|'
    || case when n = 0 then 'PASS' else 'FAIL|' || n || ' without' end];
  insert into _v159_result select row_number() over (), split_part(x, '|', 1) || ' · ' || split_part(x, '|', 2),
    split_part(x, '|', 3) || case when split_part(x, '|', 4) <> '' then ' · ' || split_part(x, '|', 4) else '' end
  from unnest(res) as x;
end
$v159$;

select check_name, result from _v159_result order by n;
