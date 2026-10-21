-- PATGo cloud — V142: paying (Stage 13) — the plan belongs to the business
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on an existing project, BEFORE the server functions go on: Dashboard →
-- SQL Editor → New query → paste this whole file → Run. Safe to run again. A new
-- project gets the same from schema.sql. Phones of every version keep working:
-- they still read their plan from their own profile row, exactly as before.
--
-- What it does, in plain terms:
--   • The plan (trial / active / lapsed / comped) and the trial's end now belong
--     to the BUSINESS (V113 8A, locked at the V142 round). Every account is a
--     business of one, so nothing changes for anyone today. Each business takes
--     its plan from its owner's profile, once.
--   • Every member's profile keeps a COPY of their default business's plan, kept
--     up to date by the database. That copy is what phones read.
--   • Setting a plan by hand still works the old way: Table Editor → profiles →
--     plan = comped changes the person's business too (and so every member).
--     Changing it on organisations works as well.
--   • Stripe's side: which Stripe customer and subscription belong to the
--     business, Stripe's own status word, monthly or yearly, when the paid
--     period ends, and whether it was cancelled. Only the server functions write
--     these, with the secret key; phones can read the status, never the Stripe ids.
--   • billing_events: one line per message from Stripe (Table Editor), so you can
--     see what Stripe said and what it changed.
--   • A COMPED business is never changed by Stripe: its plan stays comped.
--   • A trial is never cut short by Stripe: a payment that fails at the very
--     start leaves the trial running to its own end.
--
-- The result is a short table of checks. Every row must say PASS. Then run
-- supabase/isolation-test.sql as usual (it now also checks 18a–18f).


-- ------------------------------------------------------------ the business's plan
alter table public.organisations add column if not exists plan text not null default 'trial';
alter table public.organisations add column if not exists trial_ends_at timestamptz;
alter table public.organisations add column if not exists stripe_customer text;
alter table public.organisations add column if not exists stripe_subscription text;
alter table public.organisations add column if not exists billing_status text;
alter table public.organisations add column if not exists billing_interval text;
alter table public.organisations add column if not exists period_end timestamptz;
alter table public.organisations add column if not exists cancel_at_period_end boolean not null default false;
alter table public.organisations add column if not exists billing_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organisations_plan_check') then
    alter table public.organisations add constraint organisations_plan_check
      check (plan in ('trial','active','lapsed','comped'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organisations_interval_check') then
    alter table public.organisations add constraint organisations_interval_check
      check (billing_interval is null or billing_interval in ('month','year'));
  end if;
end $$;
create unique index if not exists organisations_stripe_customer on public.organisations (stripe_customer)
  where stripe_customer is not null;
create index if not exists organisations_stripe_subscription on public.organisations (stripe_subscription)
  where stripe_subscription is not null;

-- Once: each business takes its plan from its owner. Run again, it copies the
-- same values back (the profiles are copies of the business by then).
update public.organisations o
set plan = p.plan, trial_ends_at = p.trial_ends_at
from public.memberships m
join public.profiles p on p.id = m.user_id
where m.org_id = o.id and m.role = 'owner'
  and (o.plan is distinct from p.plan or o.trial_ends_at is distinct from p.trial_ends_at);


-- ------------------------------------------------------------ the copies on profiles
-- The business → every member whose default it is. A copy that already matches
-- is left alone, so this never loops with the trigger below.
create or replace function public.org_plan_to_members()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles p
  set plan = new.plan, trial_ends_at = new.trial_ends_at
  where p.id in (select m.user_id from public.memberships m where m.org_id = new.id and m.is_default)
    and (p.plan is distinct from new.plan or p.trial_ends_at is distinct from new.trial_ends_at);
  return null;
end;
$$;
drop trigger if exists org_plan_to_members on public.organisations;
create trigger org_plan_to_members
  after update of plan, trial_ends_at on public.organisations
  for each row execute function public.org_plan_to_members();

-- Joining a business, or changing which one is the default: the profile copies it.
create or replace function public.member_plan_copy()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_default then
    update public.profiles p
    set plan = o.plan, trial_ends_at = o.trial_ends_at
    from public.organisations o
    where p.id = new.user_id and o.id = new.org_id
      and (p.plan is distinct from o.plan or p.trial_ends_at is distinct from o.trial_ends_at);
  end if;
  return null;
end;
$$;
drop trigger if exists member_plan_copy on public.memberships;
create trigger member_plan_copy
  after insert or update of is_default, org_id on public.memberships
  for each row execute function public.member_plan_copy();

-- A plan set by hand on a profile (the old way) goes up to the person's default
-- business, and from there to every member. A copy the triggers above write
-- already matches its business, so it goes no further (no loop).
create or replace function public.profile_plan_up()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.plan is distinct from old.plan or new.trial_ends_at is distinct from old.trial_ends_at then
    update public.organisations o
    set plan = new.plan, trial_ends_at = new.trial_ends_at
    where o.id = public.default_org(new.id)
      and (o.plan is distinct from new.plan or o.trial_ends_at is distinct from new.trial_ends_at);
  end if;
  return null;
end;
$$;
drop trigger if exists profile_plan_up on public.profiles;
create trigger profile_plan_up
  after update of plan, trial_ends_at on public.profiles
  for each row execute function public.profile_plan_up();

-- A new login: its business starts the 30-day trial (V113's sign-up, plus the
-- business's own plan). The profile copies it when the membership is made.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare o uuid; ends timestamptz := now() + interval '30 days';
begin
  insert into public.profiles (id, email, plan, trial_ends_at)
  values (new.id, new.email, 'trial', ends)
  on conflict (id) do nothing;
  if not exists (select 1 from public.memberships m where m.user_id = new.id) then
    insert into public.organisations (plan, trial_ends_at) values ('trial', ends) returning id into o;
    insert into public.memberships (org_id, user_id, role, is_default) values (o, new.id, 'owner', true);
  end if;
  return new;
end;
$$;


-- ------------------------------------------------------------ who sees what
-- Members read their business's plan and Stripe status; the Stripe ids only the
-- server functions (secret key) ever see.
revoke select on public.organisations from authenticated;
grant select (id, name, created_at, updated_at, plan, trial_ends_at, billing_status,
              billing_interval, period_end, cancel_at_period_end, billing_at)
  on public.organisations to authenticated;

-- The Subscription page's one read: the signed-in person's default business.
-- can_manage: only its Owner subscribes or opens the billing page.
create or replace function public.my_billing()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'plan', o.plan,
    'trial_ends_at', o.trial_ends_at,
    'status', o.billing_status,
    'interval', o.billing_interval,
    'period_end', o.period_end,
    'cancel_at_period_end', o.cancel_at_period_end,
    'has_customer', o.stripe_customer is not null,
    'has_subscription', o.stripe_subscription is not null,
    'role', m.role,
    'can_manage', m.role = 'owner')
  from public.memberships m
  join public.organisations o on o.id = m.org_id
  where m.user_id = auth.uid() and m.is_default
  limit 1
$$;
revoke all on function public.my_billing() from public, anon;
grant execute on function public.my_billing() to authenticated;


-- ------------------------------------------------------------ the server's side
-- Called only by the server functions (Edge Functions, secret key = service_role).

-- Everything the checkout and billing-page functions need about a login.
create or replace function public.billing_context(u uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'org_id', o.id,
    'role', m.role,
    'plan', o.plan,
    'trial_ends_at', o.trial_ends_at,
    'stripe_customer', o.stripe_customer,
    'stripe_subscription', o.stripe_subscription,
    'status', o.billing_status)
  from public.memberships m
  join public.organisations o on o.id = m.org_id
  where m.user_id = u and m.is_default
  limit 1
$$;

-- Keeps the first Stripe customer made for a business (two taps at once both
-- making one: the second is told the first, and its own is never used).
create or replace function public.billing_set_customer(o uuid, cus text)
returns text language sql security definer set search_path = '' as $$
  update public.organisations
  set stripe_customer = coalesce(stripe_customer, cus)
  where id = o
  returning stripe_customer
$$;

-- What Stripe says about a subscription → the business's plan. The server
-- function always re-reads the subscription from Stripe first, so this is
-- always Stripe's latest word, whatever order its messages arrive in.
--   trialing / active / past_due          → active (still paying, or retrying)
--   canceled / unpaid / incomplete_expired / paused → lapsed, if it WAS paying;
--                                            a trial runs to its own end instead
--   incomplete                            → no change (checkout not finished)
-- A comped business keeps its plan; only Stripe's details are recorded.
-- A message about an OLD subscription never ends a newer, live one.
create or replace function public.billing_apply(
  o uuid, cus text, sub text, status text, every text,
  ends timestamptz, cancelling boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  r public.organisations%rowtype;
  live boolean := status in ('trialing','active','past_due');
  over boolean := status in ('canceled','unpaid','incomplete_expired','paused');
  next_plan text;
begin
  if o is not null then
    select * into r from public.organisations where id = o for update;
  end if;
  if r.id is null and cus is not null then
    select * into r from public.organisations where stripe_customer = cus for update;
  end if;
  if r.id is null then return 'no business'; end if;
  if r.stripe_customer is not null and cus is not null and r.stripe_customer <> cus then
    return 'another customer';
  end if;
  if r.stripe_subscription is not null and sub is distinct from r.stripe_subscription
     and not live and r.billing_status in ('trialing','active','past_due') then
    return 'old subscription';
  end if;

  next_plan := r.plan;
  if r.plan <> 'comped' then
    if live then next_plan := 'active';
    elsif over and r.plan = 'active' then next_plan := 'lapsed';
    end if;
  end if;

  update public.organisations set
    stripe_customer      = coalesce(r.stripe_customer, cus),
    stripe_subscription  = coalesce(sub, r.stripe_subscription),
    billing_status       = status,
    billing_interval     = case when every in ('month','year') then every else r.billing_interval end,
    period_end           = ends,
    cancel_at_period_end = coalesce(cancelling, false),
    billing_at           = now(),
    plan                 = next_plan
  where id = r.id;
  return 'plan ' || next_plan;
end;
$$;

-- One line per message from Stripe. Table Editor → billing_events.
create table if not exists public.billing_events (
  id           text primary key,          -- Stripe's event id (evt_…)
  type         text not null,
  org_id       uuid,
  result       text,
  received_at  timestamptz not null default now()
);
alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon, authenticated;

-- Written AFTER the change is made, so a message that failed half-way is simply
-- handled again when Stripe retries it (handling one twice changes nothing: the
-- subscription is always re-read from Stripe).
create or replace function public.billing_event_log(eid text, etype text, o uuid, outcome text)
returns void language sql security definer set search_path = '' as $$
  insert into public.billing_events (id, type, org_id, result) values (eid, etype, o, outcome)
  on conflict (id) do update set org_id = excluded.org_id, result = excluded.result, received_at = now()
$$;

revoke all on function public.billing_context(uuid), public.billing_set_customer(uuid, text),
                       public.billing_apply(uuid, text, text, text, text, timestamptz, boolean),
                       public.billing_event_log(text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.billing_context(uuid), public.billing_set_customer(uuid, text),
                          public.billing_apply(uuid, text, text, text, text, timestamptz, boolean),
                          public.billing_event_log(text, text, uuid, text)
  to service_role;
grant select, insert, update on public.billing_events to service_role;


-- ------------------------------------------------------------ self-check
drop table if exists pg_temp._v142_result;
create temp table _v142_result (n int, check_name text, result text);

do $v142$
declare
  i int; j int; k int; res text[] := '{}';
  u uuid; o uuid;
begin
  -- B1: every business has a plan, and every profile matches its default business.
  select count(*) into i from public.organisations where plan is null;
  select count(*) into j from public.profiles p
    join public.memberships m on m.user_id = p.id and m.is_default
    join public.organisations o on o.id = m.org_id
    where p.plan is distinct from o.plan or p.trial_ends_at is distinct from o.trial_ends_at;
  res := res || array['B1|every profile matches its business''s plan|' || case when i = 0 and j = 0 then 'PASS' else 'FAIL (' || i || ' without a plan, ' || j || ' out of step)' end];

  -- B2: the three copy triggers are in place.
  select count(*) into i from pg_trigger
  where tgname in ('org_plan_to_members','member_plan_copy','profile_plan_up') and not tgisinternal;
  res := res || array['B2|the plan is copied both ways|' || case when i = 3 then 'PASS' else 'FAIL (' || i || ' of 3 triggers)' end];

  -- B3: a change on a business reaches its member's profile, and a hand edit on
  -- the profile reaches the business — tried on a real business, then put back.
  select m.user_id, m.org_id into u, o from public.memberships m where m.is_default limit 1;
  if u is null then
    res := res || array['B3|the copies follow a change|PASS (no accounts yet)'];
  else
    begin
      update public.organisations set plan = 'comped' where id = o and plan <> 'comped';
      select count(*) into i from public.profiles where id = u and plan = 'comped';
      update public.profiles set plan = 'lapsed' where id = u;
      select count(*) into j from public.organisations where id = o and plan = 'lapsed';
      raise exception 'v142-undo';
    exception when others then
      if sqlerrm <> 'v142-undo' then i := -1; j := -1; end if;
    end;
    res := res || array['B3|the copies follow a change (undone)|' || case when i = 1 and j = 1 then 'PASS' else 'FAIL (' || i || ', ' || j || ')' end];
  end if;

  -- B4: phones cannot see the Stripe ids, and cannot run the server's functions.
  select count(*) into i from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'organisations' and grantee = 'authenticated'
    and privilege_type = 'SELECT' and column_name in ('stripe_customer','stripe_subscription');
  select count(*) into j from information_schema.role_routine_grants
  where routine_schema = 'public' and grantee in ('authenticated','anon','PUBLIC')
    and routine_name in ('billing_context','billing_set_customer','billing_apply','billing_event_log');
  res := res || array['B4|the Stripe side is closed to the app|' || case when i = 0 and j = 0 then 'PASS' else 'FAIL (' || i || ' id columns, ' || j || ' functions open)' end];

  -- B5: billing_apply's rules, on a throwaway business (undone).
  begin
    insert into public.organisations (plan, trial_ends_at) values ('trial', now() + interval '20 days') returning id into o;
    perform public.billing_apply(o, 'cus_v142check', 'sub_1', 'incomplete_expired', 'month', null, false);
    select count(*) into i from public.organisations where id = o and plan = 'trial';      -- a trial is never cut short
    perform public.billing_apply(o, 'cus_v142check', 'sub_1', 'trialing', 'year', now() + interval '20 days', false);
    select count(*) into j from public.organisations where id = o and plan = 'active' and billing_interval = 'year';
    perform public.billing_apply(o, 'cus_v142check', 'sub_0', 'canceled', 'month', null, false);   -- an old one
    select count(*) into k from public.organisations where id = o and plan = 'active' and stripe_subscription = 'sub_1';
    perform public.billing_apply(o, 'cus_v142check', 'sub_1', 'canceled', 'year', now(), false);
    select count(*) + k * 10 + j * 100 + i * 1000 into k from public.organisations where id = o and plan = 'lapsed';
    update public.organisations set plan = 'comped' where id = o;
    perform public.billing_apply(o, 'cus_v142check', 'sub_2', 'active', 'month', now(), false);
    select k * 10 + count(*) into k from public.organisations where id = o and plan = 'comped' and billing_status = 'active';
    raise exception 'v142-undo';
  exception when others then
    if sqlerrm <> 'v142-undo' then k := -1; end if;
  end;
  res := res || array['B5|Stripe''s word → the plan (trial kept, old ones ignored, comped kept)|' || case when k = 11111 then 'PASS' else 'FAIL (' || k || ')' end];

  -- B6: a new login's business starts the 30-day trial and its profile matches.
  select count(*) into i from pg_proc where proname = 'handle_new_user' and prosrc like '%insert into public.organisations (plan, trial_ends_at)%';
  res := res || array['B6|a new login''s business starts the trial|' || case when i = 1 then 'PASS' else 'FAIL' end];

  insert into _v142_result
  select row_number() over (), split_part(x, '|', 1) || ' ' || split_part(x, '|', 2), split_part(x, '|', 3)
  from unnest(res) as x;
end
$v142$;

select check_name, result from _v142_result order by n;
