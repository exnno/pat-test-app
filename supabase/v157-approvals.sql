-- PATGo cloud — V157: the Approve / Refuse screen
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on an existing project, AFTER the V157 app files are up and AFTER
-- supabase/v156-devices.sql: Dashboard → SQL Editor → New query → paste this
-- whole file → Run. Safe to run again. A new project gets the same from schema.sql.
--
-- V157 (Teams v1 — Peter, 11 Nov, R67: 1A 2A 3A 4A 5A, the defaults):
--   • business_waiting_moves(): the requests waiting for ME to decide — moves out
--     of a business where I'm the Owner, a Team leader or the Office, asked for
--     by someone else — with who asked, the job (site / name, item count, date)
--     and both businesses' names (the one it's going to may not be mine) (1A 2A).
--   • my_job_moves() also says WHO decided a move or refusal (4A) — their name in
--     the business the job was leaving.
--   • decide_job_move() on a request that's no longer waiting says how it ended
--     and who decided, so a second approver hears "Already refused by Sarah".
-- Nothing else changes: approving and refusing are V150's (_job_move_decide),
-- with its re-check on approval (locked / certified / gone → 'dropped'). No new
-- table or column; refusing takes no reason (3A); nothing expires (5A).
--
-- The result is a short table of checks. Every row must say PASS (W3 says
-- INCONCLUSIVE on a project with no business of two or more people). Then run
-- supabase/isolation-test.sql as usual.

-- ================================================================ V157
-- The Approve / Refuse screen (Teams v1 — Peter, 11 Nov: R67, 1A 2A 3A 4A 5A).
-- Existing projects: supabase/v157-approvals.sql (plus self-checks W1–W3).
-- Kept in step with it byte for byte by harness group 96f.

-- The requests waiting for me (1A 2A). Mine never: the asker can't decide their
-- own (V150 refuses it too), and a job's owner is always its asker.
create or replace function public.business_waiting_moves()
returns table (id uuid, business_id uuid, from_name text, to_org uuid, to_name text,
               asker text, job text, items integer, job_date text, requested_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.from_org, f.name, m.to_org, t.name,
         coalesce(nullif(btrim(am.name), ''), ''),
         left(coalesce(nullif(btrim(s.doc ->> 'site'), ''), nullif(btrim(s.doc ->> 'name'), ''), ''), 120),
         case when jsonb_typeof(s.doc -> 'items') = 'array' then jsonb_array_length(s.doc -> 'items') else 0 end,
         left(coalesce(s.doc ->> 'date', ''), 10),
         m.requested_at
  from public.job_moves m
  join public.organisations f on f.id = m.from_org
  join public.organisations t on t.id = m.to_org
  left join public.memberships am on am.org_id = m.from_org and am.user_id = m.requested_by
  left join public.sessions s on s.user_id = m.user_id and s.id = m.session_id
  where m.status = 'waiting'
    and m.requested_by is distinct from auth.uid()
    and m.user_id is distinct from auth.uid()
    and coalesce(public.member_role(m.from_org, auth.uid()) in ('owner','team_leader','office'), false)
  order by m.from_org, m.requested_at, m.id
$$;

-- V150's view, plus who decided (4A): their name in the business the job was
-- leaving, '' for a move the asker made themselves (out of a business they own),
-- a cancel, or someone since gone from it. The return shape grows, so it is
-- dropped and made again (the grants with it).
drop function if exists public.my_job_moves();
create function public.my_job_moves()
returns table (id uuid, session_id text, from_org uuid, from_name text, to_org uuid, to_name text,
               status text, requested_at timestamptz, decided_at timestamptz, decided_name text)
language sql stable security definer set search_path = '' as $$
  select distinct on (m.session_id)
         m.id, m.session_id, m.from_org, f.name, m.to_org, t.name, m.status, m.requested_at, m.decided_at,
         case when m.status in ('moved','refused') and m.decided_by is distinct from m.requested_by
              then coalesce(nullif(btrim(dm.name), ''), '') else '' end
  from public.job_moves m
  join public.organisations f on f.id = m.from_org
  join public.organisations t on t.id = m.to_org
  left join public.memberships dm on dm.org_id = m.from_org and dm.user_id = m.decided_by
  where m.user_id = auth.uid()
  order by m.session_id, m.requested_at desc, m.id
$$;

-- Approve / refuse, as the signed-in person — V150's, plus: a request that's no
-- longer waiting, asked by someone who may decide it, says how it ended in the
-- error's detail ('status|name|you'), so the phone can say "Already refused by
-- Sarah". Two approvers at the same moment: the second waits on V150's row lock
-- and gets V150's plain 'patgo_move_stale' (no detail) — the phone says
-- "already decided" without a name.
create or replace function public.decide_job_move(move uuid, approve boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  m record;
  who text;
begin
  if me is null then
    raise exception 'patgo_move_role: sign in first' using errcode = '42501';
  end if;
  select x.status, x.from_org, x.decided_by into m from public.job_moves x where x.id = move;
  if found and m.status <> 'waiting'
     and coalesce(public.member_role(m.from_org, me) in ('owner','team_leader','office'), false) then
    select coalesce(nullif(btrim(d.name), ''), '') into who
    from public.memberships d where d.org_id = m.from_org and d.user_id = m.decided_by;
    raise exception 'patgo_move_stale: that request is no longer waiting' using errcode = 'P0002',
      detail = m.status || '|' || coalesce(who, '') || '|' || case when m.decided_by = me then 'you' else '' end;
  end if;
  return public._job_move_decide(move, approve, me);
end;
$$;

revoke all on function public.business_waiting_moves() from public, anon;
revoke all on function public.my_job_moves() from public, anon;
revoke all on function public.decide_job_move(uuid, boolean) from public, anon;
grant execute on function public.business_waiting_moves() to authenticated;
grant execute on function public.my_job_moves() to authenticated;
grant execute on function public.decide_job_move(uuid, boolean) to authenticated;

-- ================================================================ self-checks
drop table if exists pg_temp._v157_result;
create temp table _v157_result (n int, check_name text, result text);

do $v157$
declare
  res text[] := '{}';
  o uuid; own uuid; eng uuid; other uuid; mv uuid; k int := 0; msg text; n int; st text; det text;
begin
  -- W1: everything is there.
  res := res || array['W1|the approvals list, who decided and the second-approver answer are in place|'
    || case when to_regprocedure('public.business_waiting_moves()') is not null
             and exists (select 1 from pg_proc p join pg_namespace x on x.oid = p.pronamespace
                         where x.nspname = 'public' and p.proname = 'my_job_moves' and 'decided_name' = any(p.proargnames))
             and exists (select 1 from pg_proc p join pg_namespace x on x.oid = p.pronamespace
                         where x.nspname = 'public' and p.proname = 'decide_job_move' and p.prosrc like '%detail = m.status%')
            then 'PASS' else 'FAIL' end];

  -- W2: signed in only.
  res := res || array['W2|phones reach these only signed in|'
    || case when has_function_privilege('authenticated', 'public.business_waiting_moves()', 'execute')
             and has_function_privilege('authenticated', 'public.my_job_moves()', 'execute')
             and has_function_privilege('authenticated', 'public.decide_job_move(uuid, boolean)', 'execute')
             and not has_function_privilege('anon', 'public.business_waiting_moves()', 'execute')
             and not has_function_privilege('anon', 'public.my_job_moves()', 'execute')
             and not has_function_privilege('anon', 'public.decide_job_move(uuid, boolean)', 'execute')
            then 'PASS' else 'FAIL' end];

  -- W3: a business of two or more: its Owner and someone else in it.
  select m.org_id, m.user_id into o, own from public.memberships m
  where m.role = 'owner' and exists (select 1 from public.memberships x where x.org_id = m.org_id and x.user_id <> m.user_id)
  order by m.created_at limit 1;
  if o is null then
    res := res || array['W3|the Owner sees a waiting move, refuses it, the asker hears who; asked again, it says (undone)|INCONCLUSIVE (no business of two or more yet)'];
  else
    select x.user_id into eng from public.memberships x where x.org_id = o and x.user_id <> own order by x.created_at limit 1;
    select x.org_id into other from public.memberships x where x.user_id = eng and x.org_id <> o order by x.created_at limit 1;
    begin
      -- a pretend job of the member's, in the Owner's business, with a waiting request out of it
      if other is null then other := public.default_org(eng); end if;
      if other is null or other = o then raise exception 'v157-skip'; end if;
      insert into public.sessions (id, user_id, doc, last_modified, org_id)
        values ('v157-self-check', eng, '{"site":"Self check – Unit 1","items":[{"id":1},{"id":2}],"date":"2026-11-11"}', now(), o);
      insert into public.job_moves (user_id, session_id, from_org, to_org, requested_by, status)
        values (eng, 'v157-self-check', o, other, eng, 'waiting') returning id into mv;
      -- as the Owner: listed, with the job's words
      perform set_config('request.jwt.claims', json_build_object('sub', own::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      select count(*) into n from public.business_waiting_moves() w
      where w.id = mv and w.job = 'Self check – Unit 1' and w.items = 2 and w.job_date = '2026-11-11' and w.business_id = o and w.to_org = other;
      if n = 1 then k := k + 1; end if;
      execute 'reset role';
      -- as the asker: not listed
      perform set_config('request.jwt.claims', json_build_object('sub', eng::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      select count(*) into n from public.business_waiting_moves() w where w.id = mv;
      if n = 0 then k := k + 10; end if;
      execute 'reset role';
      -- the Owner refuses; the asker's view names who
      perform set_config('request.jwt.claims', json_build_object('sub', own::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      if public.decide_job_move(mv, false) = 'refused' then k := k + 100; end if;
      -- asked again: it says how it ended, and that it was me
      begin perform public.decide_job_move(mv, true); exception when others then
        get stacked diagnostics det = pg_exception_detail;
        if sqlerrm like 'patgo_move_stale%' and det like 'refused|%|you' then k := k + 1000; end if; end;
      execute 'reset role';
      -- the name expected, read as the database (not as the asker)
      select coalesce(nullif(btrim(d.name), ''), '') into det from public.memberships d where d.org_id = o and d.user_id = own;
      perform set_config('request.jwt.claims', json_build_object('sub', eng::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      select x.status, x.decided_name into st, msg from public.my_job_moves() x where x.session_id = 'v157-self-check';
      if st = 'refused' and msg = coalesce(det, '') then k := k + 10000; end if;
      execute 'reset role';
      msg := null;
      raise exception 'v157-undo';
    exception when others then
      if sqlerrm = 'v157-skip' then k := -2;
      elsif sqlerrm <> 'v157-undo' then msg := sqlerrm; k := -1; end if;
    end;
    perform set_config('request.jwt.claims', '', true);
    res := res || array['W3|the Owner sees a waiting move, refuses it, the asker hears who; asked again, it says (undone)|'
      || case when k = 11111 then 'PASS' when k = -2 then 'INCONCLUSIVE (the other person has no business of their own)'
              else 'FAIL' || coalesce(' (' || msg || ')', ' (' || k || ')') end];
  end if;

  insert into _v157_result
  select row_number() over (), split_part(x, '|', 1) || ' ' || split_part(x, '|', 2), split_part(x, '|', 3)
  from unnest(res) as x;
end
$v157$;

select check_name, result from _v157_result order by n;
