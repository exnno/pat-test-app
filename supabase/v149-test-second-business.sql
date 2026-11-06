-- PATGo cloud — V149 testing aid: give your main account a SECOND business
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- FOR TESTING ONLY, on the test project. Nobody can be in two businesses until
-- invites exist, so V149's "For:" choice on New job never shows. This makes:
--   • a business called "PATGo Test Team", owned by your SPARE account,
--   • your MAIN account a member of it as an Engineer (not its default — your
--     own business stays your default and keeps your plan).
-- The test business is set to `comped`, so its jobs are never refused.
--
-- HOW: run supabase/v149-business-per-job.sql first. Then Dashboard → SQL
-- Editor → New query → paste this file → change the two addresses below → Run.
-- To take it all away again: supabase/v149-test-second-business-undo.sql.
--
-- Make PRACTICE jobs for the test business, not real ones: the undo moves any
-- job filed under it back to its maker's own business, but it is still a test.

do $t$
declare
  email_main  text := 'CHANGE-ME-MAIN@example.com';    -- ← your main account
  email_spare text := 'CHANGE-ME-SPARE@example.com';   -- ← your spare account
  u_main uuid; u_spare uuid; o uuid;
begin
  select id into u_main  from auth.users where lower(email) = lower(email_main);
  select id into u_spare from auth.users where lower(email) = lower(email_spare);
  if u_main is null or u_spare is null or u_main = u_spare then
    raise exception 'Set email_main and email_spare to two DIFFERENT accounts under Authentication → Users.';
  end if;
  select id into o from public.organisations where name = 'PATGo Test Team';
  if o is null then
    insert into public.organisations (name, plan) values ('PATGo Test Team', 'comped') returning id into o;
  end if;
  insert into public.memberships (org_id, user_id, role, is_default) values (o, u_spare, 'owner', false)
  on conflict (org_id, user_id) do update set role = 'owner';
  insert into public.memberships (org_id, user_id, role, is_default) values (o, u_main, 'engineer', false)
  on conflict (org_id, user_id) do update set role = 'engineer';
  raise notice 'Done: % is now in PATGo Test Team as an Engineer.', email_main;
end
$t$;

select o.name as business, u.email, m.role, m.is_default as "default"
from public.memberships m
join public.organisations o on o.id = m.org_id
join auth.users u on u.id = m.user_id
where o.name = 'PATGo Test Team'
order by m.role;
