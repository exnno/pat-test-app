-- PATGo cloud — V143: enforcement — the server stops taking a locked business's uploads
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on an existing project, BEFORE the V143 app files go up: Dashboard →
-- SQL Editor → New query → paste this whole file → Run. Safe to run again. A new
-- project gets the same from schema.sql. Phones of every version keep working
-- while a plan is live; only a business whose plan ended more than 14 days ago
-- is refused.
--
-- What it does, in plain terms (Peter, 21 Oct: 1A 2A 3A 4A 5A):
--   • 3A  The business keeps the DATE its paid plan lapsed (lapsed_at), set by
--         the database the moment the plan becomes `lapsed` — by Stripe or by
--         hand. Every profile keeps a copy, and V143 phones count the 7 days'
--         grace from it, so every phone and the server agree. (Before this, a
--         phone counted from the trial's end — weeks earlier for a plan that had
--         been paid — so a cancelled subscription locked at once, with no grace.)
--   • 1A  Once the phone lock is 7 days old (2A: the catch-up time, for work done
--         in the last days of grace out of signal), the database refuses that
--         business's uploads: new or changed jobs, settings, photos and photo
--         files. Reading is never refused — jobs still download and export, and
--         nothing already in the cloud is touched. Renewing lifts it at once.
--           trial   refused from trial_ends_at + 14 days (7 grace + 7 catch-up)
--           lapsed  refused from lapsed_at     + 14 days
--           active / comped  never
--   • The refusal carries a fixed word, patgo_plan_locked, that the app knows
--     (5A: it shows its own plain line and stops trying until the plan changes).
--   • The dashboard, this SQL editor and the server functions are never refused
--     (no signed-in person) — the same rule as the delete guard (12A).
--   • A person in two businesses: each row follows its OWN business's plan; a
--     photo FILE (whose folder names a person, not a business) follows the
--     person's default business.
--
-- The result is a short table of checks. Every row must say PASS. Then run
-- supabase/isolation-test.sql as usual (it now also checks 19a–19g).


-- ------------------------------------------------------------ when a paid plan lapsed (3A)
alter table public.organisations add column if not exists lapsed_at timestamptz;
alter table public.profiles add column if not exists lapsed_at timestamptz;

-- Entering `lapsed` stamps the moment (unless the same edit sets the date by
-- hand — testing); any other plan clears it. A business that was already lapsed
-- before V143 gets its last word from Stripe as the date (below), or now.
create or replace function public.org_lapsed_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.plan = 'lapsed' then
    if tg_op = 'INSERT' then
      new.lapsed_at := coalesce(new.lapsed_at, now());
    elsif old.plan is distinct from 'lapsed' and new.lapsed_at is not distinct from old.lapsed_at then
      new.lapsed_at := now();
    end if;
  else
    new.lapsed_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists org_lapsed_at on public.organisations;
create trigger org_lapsed_at
  before insert or update on public.organisations
  for each row execute function public.org_lapsed_at();

update public.organisations set lapsed_at = coalesce(billing_at, now())
where plan = 'lapsed' and lapsed_at is null;

-- The copies carry the date too (V142's three triggers, one column more). The
-- date never goes UP from a profile on its own: a hand edit of a profile's plan
-- still does, and the business then stamps its own date and copies it down.
create or replace function public.org_plan_to_members()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles p
  set plan = new.plan, trial_ends_at = new.trial_ends_at, lapsed_at = new.lapsed_at
  where p.id in (select m.user_id from public.memberships m where m.org_id = new.id and m.is_default)
    and (p.plan is distinct from new.plan or p.trial_ends_at is distinct from new.trial_ends_at
         or p.lapsed_at is distinct from new.lapsed_at);
  return null;
end;
$$;
drop trigger if exists org_plan_to_members on public.organisations;
create trigger org_plan_to_members
  after update of plan, trial_ends_at, lapsed_at on public.organisations
  for each row execute function public.org_plan_to_members();

create or replace function public.member_plan_copy()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_default then
    update public.profiles p
    set plan = o.plan, trial_ends_at = o.trial_ends_at, lapsed_at = o.lapsed_at
    from public.organisations o
    where p.id = new.user_id and o.id = new.org_id
      and (p.plan is distinct from o.plan or p.trial_ends_at is distinct from o.trial_ends_at
           or p.lapsed_at is distinct from o.lapsed_at);
  end if;
  return null;
end;
$$;

-- Fill every copy once (a re-run finds nothing to do).
update public.profiles p
set lapsed_at = o.lapsed_at
from public.memberships m
join public.organisations o on o.id = m.org_id
where m.user_id = p.id and m.is_default and p.lapsed_at is distinct from o.lapsed_at;

-- Phones read it: on the business (column grant, as V142) and in my_billing.
grant select (lapsed_at) on public.organisations to authenticated;

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
    'can_manage', m.role = 'owner')
  from public.memberships m
  join public.organisations o on o.id = m.org_id
  where m.user_id = auth.uid() and m.is_default
  limit 1
$$;
revoke all on function public.my_billing() from public, anon;
grant execute on function public.my_billing() to authenticated;


-- ------------------------------------------------------------ may this business upload? (1A, 2A)
-- ⚠ 14 days = the phone's 7 days' grace (PLAN_GRACE_DAYS) + 7 days' catch-up
-- (2A). Change one and the other must move with it, or a phone that still lets
-- an engineer log would be refused — or a locked one taken from.
-- An unknown business, or a lapsed one with no date at all, is let through:
-- the membership rules already decide WHO may write; this only decides WHEN.
create or replace function public.can_upload(o uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when x.plan in ('active','comped') then true
      when x.plan = 'trial'  then x.trial_ends_at is null or now() < x.trial_ends_at + interval '14 days'
      when x.plan = 'lapsed' then x.lapsed_at is null or now() < x.lapsed_at + interval '14 days'
      else true end
    from public.organisations x where x.id = o), true)
$$;

-- Jobs, settings, photo rows: refused on the way in. ⚠ Named so it fires AFTER
-- org_stamp (same-event triggers run in name order): a new row's business is
-- only known once the stamp has filled it.
create or replace function public.plan_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.can_upload(new.org_id) then
    raise exception 'patgo_plan_locked: this business''s PATGo plan has ended, so the cloud is not taking changes'
      using errcode = '42501', hint = 'Renew in PATGo: Settings, Account & Sync, Subscription.';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['sessions','records','photos'] loop
    execute format('drop trigger if exists plan_guard on public.%I', t);
    execute format('create trigger plan_guard before insert or update on public.%I
                    for each row execute function public.plan_guard()', t);
  end loop;
end $$;

-- Photo files: the person's own folder, while their default business may upload.
-- Reading and deleting files are unchanged. ⚠ The policy runs as the signed-in
-- person, who may not call default_org or can_upload directly (closed since
-- V113) — so it asks this one helper, which reads with the owner's rights. A
-- policy calling a closed function refuses EVERY upload, paid or not (caught on
-- the V143 stand-in before it shipped).
create or replace function public.can_upload_files()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_upload(public.default_org(auth.uid()))
$$;

drop policy if exists "add own photo files" on storage.objects;
drop policy if exists "change own photo files" on storage.objects;
create policy "add own photo files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select public.can_upload_files()));
create policy "change own photo files" on storage.objects
  for update to authenticated
  using      (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select public.can_upload_files()));

revoke all on function public.can_upload(uuid), public.can_upload_files(), public.plan_guard()
  from public, anon, authenticated;
grant execute on function public.can_upload_files() to authenticated;


-- ------------------------------------------------------------ self-check
drop table if exists pg_temp._v143_result;
create temp table _v143_result (n int, check_name text, result text);

do $v143$
declare
  i int; j int; k int; res text[] := '{}';
  o uuid;
begin
  -- C1: every profile carries its business's lapse date.
  select count(*) into i from public.profiles p
    join public.memberships m on m.user_id = p.id and m.is_default
    join public.organisations o on o.id = m.org_id
    where p.lapsed_at is distinct from o.lapsed_at;
  select count(*) into j from public.organisations where plan = 'lapsed' and lapsed_at is null;
  res := res || array['C1|every profile carries its business''s lapse date|' || case when i = 0 and j = 0 then 'PASS' else 'FAIL (' || i || ' out of step, ' || j || ' lapsed without a date)' end];

  -- C2: the guard on all three tables, and the date stamp on businesses.
  select count(*) into i from pg_trigger t join pg_class c on c.oid = t.tgrelid
  where t.tgname = 'plan_guard' and not t.tgisinternal and c.relname in ('sessions','records','photos');
  select count(*) into j from pg_trigger where tgname = 'org_lapsed_at' and not tgisinternal;
  res := res || array['C2|the upload guard is on jobs, settings and photos|' || case when i = 3 and j = 1 then 'PASS' else 'FAIL (' || i || ' of 3 guards, ' || j || ' of 1 stamp)' end];

  -- C3: the date follows the plan, on a throwaway business (undone).
  begin
    insert into public.organisations (plan, trial_ends_at) values ('active', now() - interval '60 days') returning id into o;
    update public.organisations set plan = 'lapsed' where id = o;
    select count(*) into i from public.organisations where id = o and lapsed_at > now() - interval '1 minute';
    update public.organisations set lapsed_at = now() - interval '20 days' where id = o;    -- a hand-set date is kept
    select count(*) into j from public.organisations where id = o and lapsed_at < now() - interval '19 days';
    update public.organisations set plan = 'active' where id = o;
    select count(*) into k from public.organisations where id = o and lapsed_at is null;
    raise exception 'v143-undo';
  exception when others then
    if sqlerrm <> 'v143-undo' then i := -1; j := -1; k := -1; end if;
  end;
  res := res || array['C3|lapsing stamps the date; paying again clears it (undone)|' || case when i = 1 and j = 1 and k = 1 then 'PASS' else 'FAIL (' || i || ', ' || j || ', ' || k || ')' end];

  -- C3b: the date reaches the member's own profile — what phones read (undone).
  select m.org_id into o from public.memberships m where m.is_default limit 1;
  if o is null then
    res := res || array['C3b|the date reaches each member''s profile|PASS (no accounts yet)'];
  else
    begin
      update public.organisations set plan = 'lapsed', lapsed_at = now() - interval '3 days' where id = o;
      select count(*) into i from public.profiles p join public.memberships m on m.user_id = p.id and m.is_default
        where m.org_id = o and p.lapsed_at < now() - interval '2 days';
      update public.organisations set plan = 'active' where id = o;
      select count(*) into j from public.profiles p join public.memberships m on m.user_id = p.id and m.is_default
        where m.org_id = o and p.lapsed_at is null;
      raise exception 'v143-undo';
    exception when others then
      if sqlerrm <> 'v143-undo' then i := -1; j := -1; end if;
    end;
    res := res || array['C3b|the date reaches each member''s profile (undone)|' || case when i > 0 and j = i then 'PASS' else 'FAIL (' || i || ', ' || j || ')' end];
  end if;

  -- C4: who may upload, by plan and date (throwaway businesses, undone).
  begin
    k := 0;
    insert into public.organisations (plan, trial_ends_at) values ('trial', now() - interval '13 days') returning id into o;
    if public.can_upload(o) then k := k + 1; end if;                         -- trial, inside 14 days: yes
    update public.organisations set trial_ends_at = now() - interval '15 days' where id = o;
    if not public.can_upload(o) then k := k + 10; end if;                    -- trial, past 14: no
    update public.organisations set plan = 'active' where id = o;
    if public.can_upload(o) then k := k + 100; end if;                       -- paid: yes
    update public.organisations set plan = 'lapsed', lapsed_at = now() - interval '13 days' where id = o;
    if public.can_upload(o) then k := k + 1000; end if;                      -- lapsed 13 days: yes
    update public.organisations set lapsed_at = now() - interval '15 days' where id = o;
    if not public.can_upload(o) then k := k + 10000; end if;                 -- lapsed 15 days: no
    update public.organisations set plan = 'comped' where id = o;
    if public.can_upload(o) then k := k + 100000; end if;                    -- comped: yes
    raise exception 'v143-undo';
  exception when others then
    if sqlerrm <> 'v143-undo' then k := -1; end if;
  end;
  res := res || array['C4|who may upload: trial / paid / lapsed / comped, 14-day line (undone)|' || case when k = 111111 then 'PASS' else 'FAIL (' || k || ')' end];

  -- C5: the photo-file policy's helper is open to the signed-in (or every
  -- photo upload is refused); the rest is closed to the app and to the signed-out.
  select count(*) into i from information_schema.role_routine_grants
  where routine_schema = 'public' and routine_name = 'can_upload_files' and grantee = 'authenticated';
  select count(*) into j from information_schema.role_routine_grants
  where routine_schema = 'public' and (grantee in ('anon','PUBLIC')
    or (grantee = 'authenticated' and routine_name <> 'can_upload_files'))
    and routine_name in ('can_upload','can_upload_files','plan_guard');
  res := res || array['C5|the photo-file helper is open to signed-in phones, the rest closed|' || case when i = 1 and j = 0 then 'PASS' else 'FAIL (' || i || ', ' || j || ')' end];

  -- C6: photo files follow the plan too.
  select count(*) into i from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname in ('add own photo files','change own photo files') and with_check like '%can_upload_files%';
  res := res || array['C6|photo files follow the plan|' || case when i = 2 then 'PASS' else 'FAIL (' || i || ' of 2 policies)' end];

  insert into _v143_result
  select row_number() over (), split_part(x, '|', 1) || ' ' || split_part(x, '|', 2), split_part(x, '|', 3)
  from unnest(res) as x;
end
$v143$;

select check_name, result from _v143_result order by n;
