-- PATGo cloud — V150 testing aid: approve or refuse a waiting move by hand
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- FOR TESTING ONLY, on the test project. The Approve / Refuse screen comes with
-- invites; until then this does what it will do. It decides the NEWEST move
-- waiting to leave "PATGo Test Team" (made by supabase/v149-test-second-business.sql),
-- as your SPARE account — the team's Owner, so someone other than the person who
-- asked, exactly as the real screen will require.
--
-- HOW: run supabase/v150-business-move.sql first. On the phone (main account),
-- in a team job: Job settings → Business → Change… → your own business → it
-- says "waiting for approval". Then Dashboard → SQL Editor → New query → paste
-- this file → change the address and, if you want to refuse, the word below → Run.
-- Then on the phone: close and reopen PATGo (or open Job settings again).

do $t$
declare
  email_spare text := 'CHANGE-ME-SPARE@example.com';   -- ← your spare account (the team's Owner)
  decision    text := 'approve';                       -- ← 'approve' or 'refuse'
  u_spare uuid; o uuid; mid uuid; st text;
begin
  if decision not in ('approve', 'refuse') then
    raise exception 'Set decision to approve or refuse.';
  end if;
  select id into u_spare from auth.users where lower(email) = lower(email_spare);
  if u_spare is null then
    raise exception 'Set email_spare to your spare account (Authentication → Users).';
  end if;
  select id into o from public.organisations where name = 'PATGo Test Team';
  if o is null then
    raise exception 'No "PATGo Test Team" — run supabase/v149-test-second-business.sql first.';
  end if;
  select m.id into mid from public.job_moves m
  where m.from_org = o and m.status = 'waiting'
  order by m.requested_at desc limit 1;
  if mid is null then
    raise exception 'Nothing is waiting. On the phone: a team job → Job settings → Business → Change….';
  end if;
  st := public._job_move_decide(mid, decision = 'approve', u_spare);
  raise notice 'Done: %.', st;
end
$t$;

-- The test team's moves, newest first. "moved" = done; "refused" = stayed put;
-- "dropped" = the job was locked or certified (or gone) by the time it was approved.
select m.session_id as job, f.name as "from", t.name as "to", m.status,
       to_char(m.requested_at, 'DD/MM/YYYY HH24:MI') as asked,
       to_char(m.decided_at, 'DD/MM/YYYY HH24:MI') as decided
from public.job_moves m
join public.organisations f on f.id = m.from_org
join public.organisations t on t.id = m.to_org
where (select id from public.organisations where name = 'PATGo Test Team') in (m.from_org, m.to_org)
order by m.requested_at desc
limit 10;
