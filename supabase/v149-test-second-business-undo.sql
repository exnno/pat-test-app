-- PATGo cloud — V149 testing aid, UNDO: remove "PATGo Test Team"
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Takes away what supabase/v149-test-second-business.sql made. Any job, photo or
-- record filed under the test business goes back to its maker's own (default)
-- business first — nothing is deleted — then the memberships, the business and
-- (V150) its test move records go.
-- HOW: Dashboard → SQL Editor → New query → paste this file → Run.
--
-- ⚠ The business stamp is normally never moved (the org_stamp trigger), so this
-- switches that one trigger off for the length of the move, inside one
-- transaction, and back on. Phones see the moved jobs as changed and re-read
-- them once; nothing on a phone is lost.

begin;
alter table public.sessions disable trigger org_stamp;
alter table public.records  disable trigger org_stamp;
alter table public.photos   disable trigger org_stamp;

update public.sessions x set org_id = public.default_org(x.user_id)
where x.org_id = (select id from public.organisations where name = 'PATGo Test Team');
update public.records x set org_id = public.default_org(x.user_id)
where x.org_id = (select id from public.organisations where name = 'PATGo Test Team');
update public.photos x set org_id = public.default_org(x.user_id)
where x.org_id = (select id from public.organisations where name = 'PATGo Test Team');

alter table public.sessions enable trigger org_stamp;
alter table public.records  enable trigger org_stamp;
alter table public.photos   enable trigger org_stamp;

-- V150: the test team's move records go too (a business with records can't be
-- deleted — on a real one that is the point; this is a test business).
delete from public.job_moves x
where (select id from public.organisations where name = 'PATGo Test Team') in (x.from_org, x.to_org);
delete from public.organisations where name = 'PATGo Test Team';   -- its memberships go with it
commit;

select count(*) as "test businesses left (should be 0)" from public.organisations where name = 'PATGo Test Team';
