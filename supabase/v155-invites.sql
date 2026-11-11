-- PATGo cloud — V155: invites, roles and the people in a business
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on an existing project, AFTER the V155 app files are up: Dashboard →
-- SQL Editor → New query → paste this whole file → Run. Safe to run again. A new
-- project gets the same from schema.sql.
--
-- V155 (Teams v1 — Peter, 11 Nov):
--   • invites by email address, waiting for that address to sign in (1A); an
--     invite lasts 14 days, one waiting per address per business (5A)
--   • Owner offers Team leader / Engineer / Office; Team leader and Office offer
--     Engineer only; only the Owner changes a role (2A)
--   • refused while any phone in the business, or any phone of the joiner's, is
--     below the minimum app version (3A)
--   • joining keeps the joiner's jobs where they are; "make it my main
--     business" is the joiner's choice at Join, and Make main later (4A)
--   • everyone sees names and roles; Owner, Team leader and Office also see
--     email addresses and invites (6A); each person's name in a business
--   • a paid seat anywhere means never locked: a phone goes by the best plan of
--     every business its person belongs to (the profile's copy, and my_billing's
--     'cover'); each business's own uploads still follow its own plan.
--
-- The result is a short table of checks. Every row must say PASS (V3–V5 say
-- INCONCLUSIVE on a project with no accounts; V4 also when one of that
-- account's phones is below the minimum). Then run supabase/isolation-test.sql
-- as usual.

-- ================================================================ V155
-- Invites, roles and the people in a business (Teams v1 — Peter, 11 Nov:
-- 1A 2A 3A 4A 5A 6A 8A; names typed at invite; "a paid seat anywhere means
-- you're never locked"). Existing projects: supabase/v155-invites.sql (plus
-- self-checks V1–V5). Kept in step with it byte for byte by harness group 94f.
--
-- Memberships still have no write route from the app: every change below is an
-- rpc that checks who is asking. The invites table has no policies at all — the
-- rpcs are the only way in or out.

-- ------------------------------------------------- a name for each person (names: typed at invite)
alter table public.memberships add column if not exists name text not null default '';
do $$ begin
  alter table public.memberships add constraint memberships_name_len check (char_length(name) <= 60);
exception when duplicate_object then null; end $$;

-- ------------------------------------------------- the invites (1A, 5A)
-- One row per invite, addressed to an email address. It waits 14 days (5A);
-- one waiting invite per address per business. 'expired' is written only when
-- the same address is invited again (until then a waiting row past its date
-- simply reads as expired).
create table if not exists public.invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations(id) on delete cascade,
  email       text not null check (email = lower(btrim(email)) and char_length(email) between 3 and 254
                                   and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  name        text not null check (char_length(name) between 1 and 60),
  role        text not null check (role in ('team_leader','engineer','office')),
  invited_by  uuid references auth.users(id) on delete set null,
  status      text not null default 'waiting'
                check (status in ('waiting','joined','declined','cancelled','expired')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  decided_at  timestamptz
);
create unique index if not exists invites_one_waiting on public.invites (org_id, email) where status = 'waiting';
create index if not exists invites_email on public.invites (email) where status = 'waiting';
alter table public.invites enable row level security;
revoke all on public.invites from public, anon, authenticated;

-- ------------------------------------------------- helpers (not callable from a phone)
-- The signed-in person's email, only once the address is confirmed: an invite
-- is accepted by proving you own the address it was sent to.
create or replace function public._my_confirmed_email()
returns text language sql stable security definer set search_path = '' as $$
  select lower(btrim(u.email)) from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null
$$;

-- 3A: the joiner's own phones — the same test as org_phones_behind, for one person.
create or replace function public._user_phones_behind(u uuid)
returns integer language sql stable security definer set search_path = '' as $$
  with s as (
    select now() - make_interval(days => coalesce((select x.invite_phone_days from public.app_settings x where x.id = 1), 60)) as win,
           public.app_min_version_for(u) as need
  )
  select (
    (select count(*) from public.phones p, s
     where p.user_id = u and p.seen_at > s.win and coalesce(p.version_num, 0) < s.need)
  + (select count(*) from auth.sessions ses, s
     where ses.user_id = u
       and greatest(ses.created_at, ses.updated_at, ses.refreshed_at at time zone 'UTC') > s.win
       and not exists (select 1 from public.phones p
                       where p.user_id = ses.user_id and p.auth_session = ses.id))
  )::integer
$$;

-- 2A: which roles a person may offer. Owner: any but Owner. Team leader and
-- Office: Engineer only. Engineer: none.
create or replace function public._may_offer(o uuid, r text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case public.my_role(o)
    when 'owner' then r in ('team_leader','engineer','office')
    when 'team_leader' then r = 'engineer'
    when 'office' then r = 'engineer'
    else false end
$$;

revoke all on function public._my_confirmed_email() from public, anon, authenticated;
revoke all on function public._user_phones_behind(uuid) from public, anon, authenticated;
revoke all on function public._may_offer(uuid, text) from public, anon, authenticated;

-- ------------------------------------------------- sending, cancelling (1A, 2A, 3A, 5A)
-- Errors the phone puts into words: patgo_not_allowed, patgo_invite_email,
-- patgo_invite_name, patgo_invite_member, patgo_invite_waiting,
-- patgo_invite_many (50 waiting), patgo_phones_behind, patgo_invite_gone.
create or replace function public.invite_member(o uuid, e text, n text, r text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare em text := lower(btrim(coalesce(e, ''))); nm text := btrim(coalesce(n, '')); i uuid;
begin
  if auth.uid() is null or not public._may_offer(o, r) then raise exception 'patgo_not_allowed'; end if;
  if char_length(em) not between 3 and 254 or em !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'patgo_invite_email';
  end if;
  if char_length(nm) not between 1 and 60 then raise exception 'patgo_invite_name'; end if;
  if exists (select 1 from public.memberships m join auth.users u on u.id = m.user_id
             where m.org_id = o and lower(btrim(u.email)) = em) then
    raise exception 'patgo_invite_member';
  end if;
  -- 3A: every phone in the business on a version that may sync.
  if public.org_phones_behind(o) > 0 then raise exception 'patgo_phones_behind'; end if;
  update public.invites set status = 'expired', decided_at = now()
  where org_id = o and email = em and status = 'waiting' and expires_at <= now();
  if exists (select 1 from public.invites where org_id = o and email = em and status = 'waiting') then
    raise exception 'patgo_invite_waiting';
  end if;
  if (select count(*) from public.invites where org_id = o and status = 'waiting' and expires_at > now()) >= 50 then
    raise exception 'patgo_invite_many';
  end if;
  insert into public.invites (org_id, email, name, role, invited_by)
  values (o, em, nm, r, auth.uid()) returning id into i;
  return i;
end;
$$;

-- 2A: whoever could have sent it may cancel it (an Engineer invite: Owner,
-- Team leader, Office; any other: the Owner).
create or replace function public.cancel_invite(i uuid)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v public.invites;
begin
  select * into v from public.invites where id = i for update;
  if not found or auth.uid() is null or not public._may_offer(v.org_id, v.role) then raise exception 'patgo_not_allowed'; end if;
  if v.status <> 'waiting' then return v.status; end if;
  update public.invites set status = 'cancelled', decided_at = now() where id = i;
  return 'cancelled';
end;
$$;

-- ------------------------------------------------- answering (1A, 3A, 4A)
-- Waiting invites to my confirmed address, with the business's name and the
-- inviter's name in it.
create or replace function public.my_invites()
returns table (id uuid, business_id uuid, business_name text, role text, invited_by_name text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select v.id, v.org_id, o.name, v.role,
         coalesce((select m.name from public.memberships m where m.org_id = v.org_id and m.user_id = v.invited_by), ''),
         v.expires_at
  from public.invites v
  join public.organisations o on o.id = v.org_id
  where v.email = public._my_confirmed_email() and v.status = 'waiting' and v.expires_at > now()
    and not exists (select 1 from public.memberships m where m.org_id = v.org_id and m.user_id = auth.uid())
  order by v.created_at, v.id
$$;

-- Join. make_main: the business becomes the one new jobs go to (the joiner's
-- choice at Join). The joiner's own jobs stay in their own business (2 Nov).
-- Errors: patgo_not_allowed, patgo_invite_gone, patgo_your_phones_behind.
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
  if coalesce(make_main, false) then
    update public.memberships set is_default = false where user_id = me and is_default;
    update public.memberships set is_default = true where user_id = me and org_id = v.org_id;
  end if;
  update public.invites set status = 'joined', decided_at = now() where id = i;
  return 'joined';
end;
$$;

create or replace function public.decline_invite(i uuid)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v public.invites; em text := public._my_confirmed_email();
begin
  select * into v from public.invites where id = i for update;
  if not found or em is null or v.email <> em then raise exception 'patgo_not_allowed'; end if;
  if v.status <> 'waiting' then return v.status; end if;
  update public.invites set status = 'declined', decided_at = now() where id = i;
  return 'declined';
end;
$$;

-- ------------------------------------------------- the people in a business (6A)
-- Everyone in a business sees each person's name and role; only Owner, Team
-- leader and Office see their email addresses.
create or replace function public.business_people()
returns table (business_id uuid, user_id uuid, name text, role text, is_you boolean, email text)
language sql stable security definer set search_path = '' as $$
  select m.org_id, m.user_id, m.name, m.role, m.user_id = auth.uid(),
         case when public.can_read_org(m.org_id) then u.email end
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.org_id in (select x.org_id from public.memberships x where x.user_id = auth.uid())
  order by m.org_id, (m.role = 'owner') desc, m.created_at, m.user_id
$$;

-- The invites of every business I may read (Owner, Team leader, Office):
-- waiting ones, and those answered in the last 30 days.
create or replace function public.business_invites()
returns table (id uuid, business_id uuid, email text, name text, role text, status text,
               created_at timestamptz, expires_at timestamptz, decided_at timestamptz, can_cancel boolean)
language sql stable security definer set search_path = '' as $$
  select v.id, v.org_id, v.email, v.name, v.role,
         case when v.status = 'waiting' and v.expires_at <= now() then 'expired' else v.status end,
         v.created_at, v.expires_at, v.decided_at,
         v.status = 'waiting' and v.expires_at > now() and public._may_offer(v.org_id, v.role)
  from public.invites v
  where public.can_read_org(v.org_id)
    and (v.status = 'waiting' or coalesce(v.decided_at, v.expires_at) > now() - interval '30 days')
  order by v.org_id, v.created_at desc, v.id
$$;

-- ------------------------------------------------- changing things (2A, names, 4A)
-- 2A: only the Owner changes a role, never their own, never to Owner.
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
  return r;
end;
$$;

-- Your own name in a business, 1–60 characters.
create or replace function public.set_my_member_name(o uuid, n text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare nm text := btrim(coalesce(n, ''));
begin
  if char_length(nm) not between 1 and 60 then raise exception 'patgo_invite_name'; end if;
  update public.memberships set name = nm where org_id = o and user_id = auth.uid();
  if not found then raise exception 'patgo_not_allowed'; end if;
  return nm;
end;
$$;

-- 4A / Make main: which of your businesses new jobs go to.
create or replace function public.set_main_business(o uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.my_role(o) is null then raise exception 'patgo_not_allowed'; end if;
  update public.memberships set is_default = false where user_id = auth.uid() and is_default and org_id <> o;
  update public.memberships set is_default = true where user_id = auth.uid() and org_id = o and not is_default;
  return true;
end;
$$;

-- ------------------------------------------------- a paid seat anywhere (Peter, 11 Nov)
-- The plan a person's phone goes by is the BEST of every business they belong
-- to (paid or free first; then the latest trial end or lapse), not only their
-- main business's. Each business's own uploads are still decided by its own
-- plan (can_upload). The per-business lock is its own later release.
create or replace function public.plan_cover(u uuid)
returns table (plan text, trial_ends_at timestamptz, lapsed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.plan, o.trial_ends_at, o.lapsed_at
  from public.memberships m join public.organisations o on o.id = m.org_id
  where m.user_id = u
  order by (o.plan in ('active','comped')) desc,
           case o.plan when 'trial' then coalesce(o.trial_ends_at, 'infinity'::timestamptz)
                       when 'lapsed' then coalesce(o.lapsed_at, '-infinity'::timestamptz)
                       else '-infinity'::timestamptz end desc,
           m.is_default desc, o.id
  limit 1
$$;

-- Writes the cover onto the person's profile (the copy every phone reads).
-- ⚠ patgo.plan_copy tells profile_plan_up this is a COPY: without it the cover
-- would be pushed up into the person's own business — a team's paid plan would
-- make an employee's own business paid.
create or replace function public.plan_cover_refresh(u uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare c record;
begin
  select * into c from public.plan_cover(u);
  if not found then return; end if;
  perform set_config('patgo.plan_copy', 'on', true);
  update public.profiles p
  set plan = c.plan, trial_ends_at = c.trial_ends_at, lapsed_at = c.lapsed_at
  where p.id = u
    and (p.plan is distinct from c.plan or p.trial_ends_at is distinct from c.trial_ends_at
         or p.lapsed_at is distinct from c.lapsed_at);
  perform set_config('patgo.plan_copy', '', true);
end;
$$;
revoke all on function public.plan_cover(uuid) from public, anon, authenticated;
revoke all on function public.plan_cover_refresh(uuid) from public, anon, authenticated;

-- A business's plan changes → every member's cover (not only those whose main it is).
create or replace function public.org_plan_to_members()
returns trigger language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  for u in select m.user_id from public.memberships m where m.org_id = new.id loop
    perform public.plan_cover_refresh(u);
  end loop;
  return null;
end;
$$;

-- Joining, leaving, or changing which is main → that person's cover.
create or replace function public.member_plan_copy()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform public.plan_cover_refresh(old.user_id);
  else
    perform public.plan_cover_refresh(new.user_id);
    if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
      perform public.plan_cover_refresh(old.user_id);
    end if;
  end if;
  return null;
end;
$$;
drop trigger if exists member_plan_copy on public.memberships;
create trigger member_plan_copy
  after insert or delete or update of is_default, org_id, user_id on public.memberships
  for each row execute function public.member_plan_copy();

-- A plan set by hand on a profile (the old way) still goes up to the person's
-- main business — but never a copy written by plan_cover_refresh.
create or replace function public.profile_plan_up()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('patgo.plan_copy', true), '') = 'on' then return null; end if;
  if new.plan is distinct from old.plan or new.trial_ends_at is distinct from old.trial_ends_at then
    update public.organisations o
    set plan = new.plan, trial_ends_at = new.trial_ends_at
    where o.id = public.default_org(new.id)
      and (o.plan is distinct from new.plan or o.trial_ends_at is distinct from new.trial_ends_at);
  end if;
  return null;
end;
$$;

-- my_billing: the main business's plan for the Subscription page, as before,
-- plus the cover the phone's lock goes by.
create or replace function public.my_billing()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'plan', o.plan,
    'trial_ends_at', o.trial_ends_at,
    'lapsed_at', o.lapsed_at,
    'status', o.billing_status,
    'interval', o.billing_interval,
    'period_end', o.period_end,
    'cancel_at_period_end', o.cancel_at_period_end,
    'has_customer', o.stripe_customer is not null,
    'has_subscription', o.stripe_subscription is not null,
    'role', m.role,
    'can_manage', m.role = 'owner',
    'cover', (select to_jsonb(c) from public.plan_cover(auth.uid()) c))
  from public.memberships m
  join public.organisations o on o.id = m.org_id
  where m.user_id = auth.uid() and m.is_default
  limit 1
$$;

-- Fill every cover once (a re-run finds nothing to do).
do $$
declare u uuid;
begin
  for u in select distinct m.user_id from public.memberships m loop
    perform public.plan_cover_refresh(u);
  end loop;
end $$;

-- ------------------------------------------------- who may call what
revoke all on function public.invite_member(uuid, text, text, text) from public, anon;
revoke all on function public.cancel_invite(uuid) from public, anon;
revoke all on function public.my_invites() from public, anon;
revoke all on function public.accept_invite(uuid, boolean) from public, anon;
revoke all on function public.decline_invite(uuid) from public, anon;
revoke all on function public.business_people() from public, anon;
revoke all on function public.business_invites() from public, anon;
revoke all on function public.set_member_role(uuid, uuid, text) from public, anon;
revoke all on function public.set_my_member_name(uuid, text) from public, anon;
revoke all on function public.set_main_business(uuid) from public, anon;
revoke all on function public.my_billing() from public, anon;
grant execute on function public.invite_member(uuid, text, text, text) to authenticated;
grant execute on function public.cancel_invite(uuid) to authenticated;
grant execute on function public.my_invites() to authenticated;
grant execute on function public.accept_invite(uuid, boolean) to authenticated;
grant execute on function public.decline_invite(uuid) to authenticated;
grant execute on function public.business_people() to authenticated;
grant execute on function public.business_invites() to authenticated;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.set_my_member_name(uuid, text) to authenticated;
grant execute on function public.set_main_business(uuid) to authenticated;
grant execute on function public.my_billing() to authenticated;


-- ================================================================ self-checks
drop table if exists pg_temp._v155_result;
create temp table _v155_result (n int, check_name text, result text);

do $v155$
declare
  res text[] := '{}';
  u uuid; o uuid; t uuid; i uuid; k int := 0; msg text; got text; p0 text; op0 text; n int;
begin
  -- V1: everything is there.
  res := res || array['V1|the invites table, the people, the rpcs and the cover are in place|'
    || case when to_regclass('public.invites') is not null
             and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'memberships' and column_name = 'name')
             and to_regprocedure('public.invite_member(uuid,text,text,text)') is not null
             and to_regprocedure('public.accept_invite(uuid,boolean)') is not null
             and to_regprocedure('public.business_people()') is not null
             and to_regprocedure('public.plan_cover_refresh(uuid)') is not null
             and exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                         where s.nspname = 'public' and p.proname = 'profile_plan_up' and p.prosrc like '%patgo.plan_copy%')
            then 'PASS' else 'FAIL' end];

  -- V2: nobody reads or writes invites but through the rpcs; the helpers are the database's own.
  res := res || array['V2|phones reach invites only through the rpcs; signed out, nothing|'
    || case when not has_table_privilege('authenticated', 'public.invites', 'select')
             and not has_table_privilege('authenticated', 'public.invites', 'insert')
             and not has_table_privilege('authenticated', 'public.invites', 'update')
             and not has_table_privilege('anon', 'public.invites', 'select')
             and not has_table_privilege('authenticated', 'public.memberships', 'insert')
             and not has_table_privilege('authenticated', 'public.memberships', 'update')
             and has_function_privilege('authenticated', 'public.invite_member(uuid,text,text,text)', 'execute')
             and not has_function_privilege('anon', 'public.invite_member(uuid,text,text,text)', 'execute')
             and not has_function_privilege('anon', 'public.accept_invite(uuid,boolean)', 'execute')
             and not has_function_privilege('anon', 'public.business_people()', 'execute')
             and not has_function_privilege('authenticated', 'public.plan_cover_refresh(uuid)', 'execute')
             and not has_function_privilege('authenticated', 'public._user_phones_behind(uuid)', 'execute')
             and not has_function_privilege('authenticated', 'public._my_confirmed_email()', 'execute')
            then 'PASS' else 'FAIL' end];

  select m.user_id, m.org_id into u, o from public.memberships m
  where m.is_default and m.role = 'owner' order by m.created_at limit 1;
  if u is null then
    res := res || array['V3|a paid seat anywhere: the cover, never pushed into the person''s own business (undone)|INCONCLUSIVE (no accounts yet)'];
    res := res || array['V4|an Owner invites; the same address twice is refused; nobody else can accept it (undone)|INCONCLUSIVE (no accounts yet)'];
    res := res || array['V5|the people: the Owner sees names, roles and addresses (undone)|INCONCLUSIVE (no accounts yet)'];
  else
    -- V3: put the account into a paid business of its own for a moment.
    begin
      select plan into p0 from public.profiles where id = u;
      select plan into op0 from public.organisations where id = o;
      insert into public.organisations (name, plan) values ('v155 self-check', 'comped') returning id into t;
      insert into public.memberships (org_id, user_id, role, is_default, name) values (t, u, 'engineer', false, 'Self check');
      select plan into got from public.profiles where id = u;
      if got = 'comped' and (select plan from public.organisations where id = o) is not distinct from op0 then k := k + 1; end if;
      delete from public.memberships where org_id = t and user_id = u;
      select plan into got from public.profiles where id = u;
      if got is not distinct from (select c.plan from public.plan_cover(u) c) then k := k + 10; end if;
      raise exception 'v155-undo';
    exception when others then
      if sqlerrm <> 'v155-undo' then msg := sqlerrm; k := -1; end if;
    end;
    res := res || array['V3|a paid seat anywhere: the cover, never pushed into the person''s own business (undone)|'
      || case when k = 11 then 'PASS' else 'FAIL' || coalesce(' (' || msg || ')', ' (' || k || ')') end];

    -- V4: as that Owner.
    k := 0; msg := null;
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      begin
        i := public.invite_member(o, ' V155-Self-Check@Example.invalid ', 'Self check', 'engineer');
        k := k + 1;
      exception when others then
        if sqlerrm like 'patgo_phones_behind%' then msg := 'phones'; else raise; end if;
      end;
      if msg is null then
        begin perform public.invite_member(o, 'v155-self-check@example.invalid', 'Again', 'office'); exception when others then
          if sqlerrm like 'patgo_invite_waiting%' then k := k + 10; end if; end;
        begin perform public.accept_invite(i, false); exception when others then
          if sqlerrm like 'patgo_not_allowed%' then k := k + 100; end if; end;
        begin perform public.invite_member(o, 'not an address', 'Someone', 'engineer'); exception when others then
          if sqlerrm like 'patgo_invite_email%' then k := k + 1000; end if; end;
        select count(*) into n from public.business_invites() x where x.id = i and x.email = 'v155-self-check@example.invalid' and x.can_cancel;
        if n = 1 then k := k + 10000; end if;
      end if;
      execute 'reset role';
      raise exception 'v155-undo';
    exception when others then
      if sqlerrm <> 'v155-undo' then msg := sqlerrm; k := -1; end if;
    end;
    res := res || array['V4|an Owner invites; the same address twice is refused; nobody else can accept it (undone)|'
      || case when msg = 'phones' then 'INCONCLUSIVE (a phone of this account is below the minimum — update it)'
              when k = 11111 then 'PASS' else 'FAIL' || coalesce(' (' || msg || ')', ' (' || k || ')') end];

    -- V5: the Owner sees themselves, with an address.
    perform set_config('request.jwt.claims', json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.business_people() x where x.business_id = o and x.is_you and x.role = 'owner' and x.email is not null;
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    res := res || array['V5|the people: the Owner sees names, roles and addresses (undone)|' || case when n = 1 then 'PASS' else 'FAIL' end];
  end if;

  insert into _v155_result
  select row_number() over (), split_part(x, '|', 1) || ' ' || split_part(x, '|', 2), split_part(x, '|', 3)
  from unnest(res) as x;
end
$v155$;

select check_name, result from _v155_result order by n;
