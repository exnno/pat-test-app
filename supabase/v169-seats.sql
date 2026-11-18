-- PATGo cloud — V169: seat billing — £3 a month (£30 a year) per Engineer or Team leader
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on the test project, AFTER the V169 app files are up and BEFORE the
-- two new server functions go on: Dashboard → SQL Editor → New query → paste this
-- whole file → Run. Safe to run again. A new project gets the same from
-- schema.sql (its last section).
--
-- Locked 14 Nov (1A–4A) and 18 Nov (R80, Peter — "1 A 2 A 3 A 4 B 5 A"): a seat
-- costs from joining or being made Engineer / Team leader, Office frees it; a
-- monthly plan's part-month goes on the next bill, a yearly plan's part-year is
-- charged that day (2A — "if they join in month 10 it's pro rata for the 2
-- months"), a credit when someone leaves; free in the trial, the count at
-- subscribing; the Owner is emailed about every change (4B — "it's a money
-- thing"); monthly ↔ yearly from inside PATGo (3A).
--
-- What it does: writes down every paid-seat change (seat_changes — Table Editor),
-- gives the server function what it needs to put Stripe right and tell the
-- Owner, gives the app the seat figures (business_seats), and asks the server
-- function to run every 10 minutes while anything is owed.
--
-- AFTER running it, set the server function's address once (the deploy
-- checklist has the exact line):
--   update public.billing_settings set seats_url = 'https://<project>.supabase.co/functions/v1/billing-seats';
--
-- ⚠ Re-running supabase/v142-billing.sql (or older) puts back a billing_context without
-- the seats — run this file again after it.
--
-- Nothing else changes: no job, setting or photo is touched. The result is a
-- short table of checks. Every row must say PASS.

-- ================================================================ V169
-- Seat billing (Teams v1; R65 7C; round 14 Nov 1A–4A, 18 Nov R80 1A 2A 3A 4B 5A).
-- KEEP IN STEP with supabase/v169-seats.sql (the same, plus self-checks E1–E7).
-- Kept in step by harness 109e.
--
-- A PAID SEAT is a member who is Engineer or Team leader. The Owner is in the
-- £6 base; Office is free. The business pays £3 a month (£30 a year) per paid
-- seat, from joining or being made Engineer / Team leader (2A).
--
-- The DATABASE is the truth about who has a seat. Every change to it — joining,
-- a role change, a removal, leaving, a login closed — is written down here
-- (seat_changes, by a trigger on memberships, so no route can miss it). A server
-- function (supabase/functions — billing-seats) then makes Stripe's seat count
-- match and emails the business's Owner (4B). It is started by the phone that
-- made the change, straight away, and by the database itself every 10 minutes
-- while anything is owed (seats_nudge, pg_cron + pg_net) — so a phone that lost
-- its signal at the wrong moment is caught up within minutes, never missed.
-- Joining is never held up waiting for Stripe.
--
-- ⚠ Nothing here talks to Stripe or sends email: only the server function, with
-- the secret key, does. The app reads seat figures through business_seats()
-- only; the Stripe side (seats_billed, the log's email results) stays closed.

-- ------------------------------------------------------------ the business's side
-- seats_billed: how many seats Stripe's subscription has (the webhook and the
-- seats function write it; null = no subscription / not known yet).
-- seats_seen_at: when the Owner last tapped Got it on the in-app note (4B).
alter table public.organisations add column if not exists seats_billed integer;
alter table public.organisations add column if not exists seats_seen_at timestamptz;

-- Where the seats function lives, for the database's own 10-minute nudge. One
-- row; set once per project (the deploy checklist says how). Blank = the nudge
-- does nothing (the phone's nudge still works).
create table if not exists public.billing_settings (
  id         integer primary key default 1 check (id = 1),
  seats_url  text not null default ''
);
insert into public.billing_settings (id) values (1) on conflict (id) do nothing;
alter table public.billing_settings enable row level security;
revoke all on public.billing_settings from anon, authenticated;

-- One line per paid-seat change. Kept (Table Editor → seat_changes): it is the
-- record of what the Owner was told and why the bill moved. No foreign key on
-- org_id: the record outlives a business that is closed.
create table if not exists public.seat_changes (
  id           bigint generated always as identity primary key,
  org_id       uuid not null,
  at           timestamptz not null default now(),
  user_id      uuid,                       -- whose seat
  person       text not null default '',   -- their name then
  role_from    text,                       -- null = wasn't in the business
  role_to      text,                       -- null = not in it any more
  by_user      uuid,                       -- who did it (null = the dashboard / a closed login)
  by_name      text not null default '',
  seats_after  integer not null,
  emailed_at   timestamptz,                -- the Owner told (or nothing to tell)
  email_result text
);
create index if not exists seat_changes_org on public.seat_changes (org_id, at desc);
create index if not exists seat_changes_untold on public.seat_changes (org_id) where emailed_at is null;
alter table public.seat_changes enable row level security;
revoke all on public.seat_changes from anon, authenticated;

create or replace function public.paid_role(r text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(r in ('engineer','team_leader'), false)
$$;

create or replace function public.paid_seats(o uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.memberships m where m.org_id = o and public.paid_role(m.role)
$$;

-- The trigger: a membership made, its role changed, or it gone. Only a change
-- in PAID-ness is written (Engineer ↔ Team leader costs the same).
create or replace function public.seat_note()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  o uuid := coalesce(new.org_id, old.org_id);
  who uuid := coalesce(new.user_id, old.user_id);
  rf text := case when tg_op = 'INSERT' then null else old.role end;
  rt text := case when tg_op = 'DELETE' then null else new.role end;
  me uuid := auth.uid();
  nm text; byn text := '';
begin
  if public.paid_role(rf) = public.paid_role(rt) then return null; end if;
  -- a business being closed takes its memberships with it: nothing to bill
  if not exists (select 1 from public.organisations x where x.id = o) then return null; end if;
  -- their name in the business; else the start of their email (a login being
  -- closed is gone from auth.users by now — the name is all there is)
  nm := btrim(coalesce(case when tg_op = 'DELETE' then old.name else new.name end, ''));
  if nm = '' then select split_part(u.email, '@', 1) into nm from auth.users u where u.id = who; end if;
  if me is not null then
    select coalesce(nullif(btrim(m.name), ''), split_part(u.email, '@', 1), '')
      into byn
      from auth.users u left join public.memberships m on m.user_id = u.id and m.org_id = o
      where u.id = me;
  end if;
  insert into public.seat_changes (org_id, user_id, person, role_from, role_to, by_user, by_name, seats_after)
  values (o, who, left(coalesce(nm, ''), 80), rf, rt, me, left(coalesce(byn, ''), 80), public.paid_seats(o));
  return null;
end;
$$;
drop trigger if exists seat_note on public.memberships;
create trigger seat_note after insert or update of role or delete on public.memberships
  for each row execute function public.seat_note();

-- ------------------------------------------------------------ the server's side
-- Billed = a live Stripe subscription that isn't comped. Only then does a seat
-- cost anything (4A: free in the trial until subscribing; comped never pays).
create or replace function public._seats_billable(o public.organisations)
returns boolean language sql stable set search_path = '' as $$
  select o.plan <> 'comped' and o.stripe_subscription is not null
     and coalesce(o.billing_status in ('trialing','active','past_due'), false)
$$;

-- What the seats function has to do: businesses whose Stripe count is out of
-- step, or with a change nobody has told the Owner about (last 7 days — an
-- older one is past news; the count is still put right).
create or replace function public.billing_seats_due()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(j order by j ->> 'org_id'), '[]'::jsonb) from (
    select jsonb_build_object(
      'org_id', o.id,
      'name', o.name,
      'plan', o.plan,
      'status', o.billing_status,
      'every', o.billing_interval,
      'period_end', o.period_end,
      'subscription', o.stripe_subscription,
      'billable', public._seats_billable(o),
      'seats', public.paid_seats(o.id),
      'seats_billed', o.seats_billed,
      'owner_email', (select u.email from public.memberships m join auth.users u on u.id = m.user_id
                      where m.org_id = o.id and m.role = 'owner' limit 1),
      'owner_name', (select m.name from public.memberships m where m.org_id = o.id and m.role = 'owner' limit 1),
      'owner_id', (select m.user_id from public.memberships m where m.org_id = o.id and m.role = 'owner' limit 1),
      'changes', coalesce((select jsonb_agg(jsonb_build_object(
            'id', c.id, 'at', c.at, 'user_id', c.user_id, 'person', c.person,
            'role_from', c.role_from, 'role_to', c.role_to,
            'by_user', c.by_user, 'by_name', c.by_name, 'seats_after', c.seats_after) order by c.id)
          from public.seat_changes c
          where c.org_id = o.id and c.emailed_at is null and c.at > now() - interval '7 days'), '[]'::jsonb)) as j
    from public.organisations o
    where (public._seats_billable(o) and o.seats_billed is distinct from public.paid_seats(o.id))
       or exists (select 1 from public.seat_changes c
                  where c.org_id = o.id and c.emailed_at is null and c.at > now() - interval '7 days')
    order by o.id
    limit 50
  ) s
$$;

-- What Stripe's subscription now says (the seats function after changing it, and
-- the webhook after every message — Stripe re-read first, so always its latest).
create or replace function public.billing_seats_record(o uuid, cus text, n integer)
returns void language sql security definer set search_path = '' as $$
  update public.organisations
  set seats_billed = case when n is null or n < 0 then null else n end
  where (o is not null and id = o) or (o is null and cus is not null and stripe_customer = cus)
$$;

-- The Owner told about these changes (or nothing to tell: no bill). Returns the
-- ids it marked — the seats function CLAIMS them this way before emailing, so two
-- runs at once (the phone's nudge and the database's) never send two emails.
create or replace function public.billing_seats_told(o uuid, ids bigint[], outcome text)
returns setof bigint language sql security definer set search_path = '' as $$
  update public.seat_changes
  set emailed_at = now(), email_result = left(coalesce(outcome, ''), 200)
  where org_id = o and id = any(ids) and emailed_at is null
  returning id
$$;

-- How the email went. retry = it didn't go: let the next run try again.
create or replace function public.billing_seats_result(o uuid, ids bigint[], outcome text, retry boolean)
returns void language sql security definer set search_path = '' as $$
  update public.seat_changes
  set email_result = left(coalesce(outcome, ''), 200),
      emailed_at = case when retry then null else emailed_at end
  where org_id = o and id = any(ids)
$$;

-- Everything the checkout, billing-page and switch functions need about a login
-- (V142), plus the seats and how it pays now.
create or replace function public.billing_context(u uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'org_id', o.id,
    'role', m.role,
    'plan', o.plan,
    'trial_ends_at', o.trial_ends_at,
    'stripe_customer', o.stripe_customer,
    'stripe_subscription', o.stripe_subscription,
    'status', o.billing_status,
    'every', o.billing_interval,
    'cancelling', o.cancel_at_period_end,
    'seats', public.paid_seats(o.id))
  from public.memberships m
  join public.organisations o on o.id = m.org_id
  where m.user_id = u and m.is_default
  limit 1
$$;

revoke all on function public.paid_seats(uuid), public._seats_billable(public.organisations),
                       public.billing_seats_due(), public.billing_seats_record(uuid, text, integer),
                       public.billing_seats_told(uuid, bigint[], text),
                       public.billing_seats_result(uuid, bigint[], text, boolean), public.billing_context(uuid)
  from public, anon, authenticated;
grant execute on function public.billing_seats_due(), public.billing_seats_record(uuid, text, integer),
                          public.billing_seats_told(uuid, bigint[], text),
                          public.billing_seats_result(uuid, bigint[], text, boolean), public.billing_context(uuid)
  to service_role;

-- ------------------------------------------------------------ the database's own nudge
-- Every 10 minutes: if anything is owed AND the seats function's address is set,
-- ask it to run (pg_net — the request goes after this transaction, never holds it).
create extension if not exists pg_net;
create or replace function public.seats_nudge()
returns text language plpgsql security definer set search_path = '' as $$
declare url text;
begin
  select s.seats_url into url from public.billing_settings s where s.id = 1;
  if coalesce(url, '') !~ '^https://[^/]+/functions/v1/billing-seats$' then return 'no address'; end if;
  if jsonb_array_length(public.billing_seats_due()) = 0 then return 'nothing owed'; end if;
  perform net.http_post(url := url, body := '{"from":"database"}'::jsonb,
                        headers := '{"content-type":"application/json"}'::jsonb);
  return 'asked';
end;
$$;
revoke all on function public.seats_nudge() from public, anon, authenticated;
select cron.schedule('patgo-seats', '*/10 * * * *', 'select public.seats_nudge()');

-- ------------------------------------------------------------ the app's side
-- The seats of every business I may invite into (Owner, Team leader, Office —
-- 3A: the invite sheet says what a seat costs). The Owner also gets the changes
-- (last 30 days, newest first, at most 20) and how many were made by someone
-- else since they last tapped Got it (4B's in-app note).
create or replace function public.business_seats()
returns table (business_id uuid, seats integer, plan text, every text, billed boolean,
               period_end timestamptz, is_owner boolean, changes jsonb, unseen integer)
language sql stable security definer set search_path = '' as $$
  select o.id, public.paid_seats(o.id), o.plan, o.billing_interval, public._seats_billable(o),
         o.period_end, m.role = 'owner',
         case when m.role = 'owner' then coalesce((
           select jsonb_agg(jsonb_build_object('id', c.id, 'at', c.at, 'person', c.person,
                    'role_from', c.role_from, 'role_to', c.role_to, 'by_name', c.by_name,
                    'by_you', c.by_user is not distinct from auth.uid(),
                    'self', c.by_user is not distinct from c.user_id,
                    'seats_after', c.seats_after) order by c.id desc)
           from (select * from public.seat_changes c2 where c2.org_id = o.id and c2.at > now() - interval '30 days'
                 order by c2.id desc limit 20) c), '[]'::jsonb) else '[]'::jsonb end,
         case when m.role = 'owner' then (
           select count(*)::integer from public.seat_changes c
           where c.org_id = o.id and c.at > now() - interval '30 days'
             and c.by_user is distinct from auth.uid()
             and c.at > coalesce(o.seats_seen_at, '-infinity'::timestamptz)) else 0 end
  from public.memberships m
  join public.organisations o on o.id = m.org_id
  where m.user_id = auth.uid() and m.role in ('owner','team_leader','office')
  order by m.is_default desc, o.created_at, o.id
$$;

-- 4B: the Owner tapped Got it.
create or replace function public.seats_seen(o uuid)
returns text language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.my_role(o) is distinct from 'owner' then raise exception 'patgo_not_allowed'; end if;
  update public.organisations set seats_seen_at = now() where id = o;
  return 'seen';
end;
$$;
revoke all on function public.business_seats(), public.seats_seen(uuid) from public, anon;
grant execute on function public.business_seats(), public.seats_seen(uuid) to authenticated;
-- ================================================================ end V169

-- ================================================================ self-checks
drop table if exists pg_temp._v169_result;
create temp table _v169_result (n int, check_name text, result text);
insert into _v169_result
select 1, 'the seat record and the function address are closed to the app',
  case when (select bool_and(c.relrowsecurity) from pg_class c
             where c.oid in ('public.seat_changes'::regclass, 'public.billing_settings'::regclass))
        and not has_table_privilege('authenticated', 'public.seat_changes', 'select')
        and not has_table_privilege('anon', 'public.seat_changes', 'select')
        and not has_table_privilege('authenticated', 'public.billing_settings', 'select')
        and not has_column_privilege('authenticated', 'public.organisations', 'seats_billed', 'select')
       then 'PASS' else 'FAIL' end
union all
select 2, 'every membership change is looked at (joining, a role change, leaving)',
  case when exists (select 1 from pg_trigger where tgname = 'seat_note' and not tgisinternal
                    and tgrelid = 'public.memberships'::regclass)
       then 'PASS' else 'FAIL' end
union all
select 3, 'only the server functions may read what is owed or record Stripe''s count',
  case when not has_function_privilege('authenticated', 'public.billing_seats_due()', 'execute')
        and not has_function_privilege('authenticated', 'public.billing_seats_record(uuid, text, integer)', 'execute')
        and not has_function_privilege('authenticated', 'public.billing_seats_told(uuid, bigint[], text)', 'execute')
        and not has_function_privilege('authenticated', 'public.billing_seats_result(uuid, bigint[], text, boolean)', 'execute')
        and not has_function_privilege('authenticated', 'public.seats_nudge()', 'execute')
        and has_function_privilege('service_role', 'public.billing_seats_due()', 'execute')
       then 'PASS' else 'FAIL' end
union all
select 4, 'the app may read its seats and say Got it; nobody signed out may',
  case when has_function_privilege('authenticated', 'public.business_seats()', 'execute')
        and has_function_privilege('authenticated', 'public.seats_seen(uuid)', 'execute')
        and not has_function_privilege('anon', 'public.business_seats()', 'execute')
        and not has_function_privilege('anon', 'public.seats_seen(uuid)', 'execute')
       then 'PASS' else 'FAIL' end
union all
select 5, 'all run with their own rights and a pinned search path',
  case when (select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc
             where oid in ('public.seat_note()'::regprocedure, 'public.paid_seats(uuid)'::regprocedure,
                           'public.billing_seats_due()'::regprocedure, 'public.business_seats()'::regprocedure,
                           'public.seats_seen(uuid)'::regprocedure, 'public.seats_nudge()'::regprocedure,
                           'public.billing_context(uuid)'::regprocedure))
       then 'PASS' else 'FAIL' end
union all
select 6, 'a paid seat is an Engineer or a Team leader — never the Owner or Office',
  case when public.paid_role('engineer') and public.paid_role('team_leader')
        and not public.paid_role('owner') and not public.paid_role('office') and not public.paid_role(null)
       then 'PASS' else 'FAIL' end
union all
select 7, 'the database asks the seats function every 10 minutes while anything is owed',
  case when exists (select 1 from cron.job where jobname = 'patgo-seats' and schedule = '*/10 * * * *'
                    and command like '%seats_nudge()%')
       then 'PASS' else 'FAIL' end;

select n as "#", check_name as "check", result from _v169_result order by n;
