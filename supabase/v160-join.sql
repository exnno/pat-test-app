-- PATGo cloud — V160: Join rechecks the business's phones
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on an existing project, AFTER the V160 app files are up:
-- Dashboard → SQL Editor → New query → paste this whole file → Run. Safe to run
-- again. A new project gets the same from schema.sql.
--
-- V160 (the second GPT audit, finding 4 — Peter, 12 Nov: R68; the V160 round
-- 1A 2A 3A 4A, the defaults). An invite checks the business's phones when it is
-- SENT (V155) — up to 14 days before anyone joins. Join now checks them again at
-- the moment of joining:
--   • the joiner's own phones first, as V155 (1A: they can fix that themselves);
--   • then every signed-in device of everyone in the business — the same test
--     an invite makes (org_phones_behind). Any behind → refused with
--     patgo_team_phones_behind; nothing changes and the invite stays waiting.
--   • every role, Office too (4A).
-- The joiner isn't in the business yet, so they are told THAT a phone is behind,
-- never which one (2A). Nothing is recorded for the business (3A).
-- This guards the moment of joining only; V161 is the lasting protection.
-- No new table or column.
--
-- ⚠ Re-running supabase/v155-invites.sql or v159-office.sql puts their older
-- accept_invite back: run this file again after either.
--
-- The result is a short table of checks. Every row must say PASS. Then run
-- supabase/isolation-test.sql as usual (27a–27c are this release's).

-- ================================================================ V160
-- Join rechecks the business's phones (the second audit, finding 4 — Peter,
-- 12 Nov: R68, V160 round 1A–4A). Existing projects: supabase/v160-join.sql
-- (plus self-checks J1–J2). Kept in step with it byte for byte by harness group 99e.

-- V159's Join (Office never made main), plus: the business's phones checked
-- again now, after the joiner's own (1A), for every role (4A). An existing
-- member's Join is still just marked joined — they're already in.
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
  -- V160: and every phone in the business, again — the invite's own check ran
  -- when it was sent, perhaps days ago. The invite stays waiting.
  if public.org_phones_behind(v.org_id) > 0 then raise exception 'patgo_team_phones_behind'; end if;
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

revoke all on function public.accept_invite(uuid, boolean) from public, anon;
grant execute on function public.accept_invite(uuid, boolean) to authenticated;
-- ================================================================ self-checks
drop table if exists pg_temp._v160_result;
create temp table _v160_result (n int, check_name text, result text);

do $v160$
declare res text[] := '{}';
begin
  -- J1: Join checks both: the joiner's phones, then the business's; Office kept.
  res := res || array['J1|Join checks your phones, then the business''s, and still never makes Office main|'
    || case when exists (select 1 from pg_proc p join pg_namespace x on x.oid = p.pronamespace
                         where x.nspname = 'public' and p.proname = 'accept_invite'
                           and p.prosrc like '%patgo_your_phones_behind%patgo_team_phones_behind%insert into public.memberships%'
                           and p.prosrc like '%v.role <> ''office''%')
            then 'PASS' else 'FAIL' end];
  -- J2: only a signed-in person may Join; the phone checks stay closed to phones.
  res := res || array['J2|only a signed-in person can Join; the phone checks are closed to phones|'
    || case when has_function_privilege('authenticated', 'public.accept_invite(uuid,boolean)', 'execute')
             and not has_function_privilege('anon', 'public.accept_invite(uuid,boolean)', 'execute')
             and not has_function_privilege('authenticated', 'public.org_phones_behind(uuid)', 'execute')
             and not has_function_privilege('authenticated', 'public._user_phones_behind(uuid)', 'execute')
            then 'PASS' else 'FAIL' end];
  insert into _v160_result select row_number() over (), split_part(x, '|', 1) || ' · ' || split_part(x, '|', 2),
    split_part(x, '|', 3) || case when split_part(x, '|', 4) <> '' then ' · ' || split_part(x, '|', 4) else '' end
  from unnest(res) as x;
end
$v160$;

select check_name, result from _v160_result order by n;
