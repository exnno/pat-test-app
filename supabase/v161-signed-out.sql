-- PATGo cloud — V161: a signed-out device loses cloud access at once
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on an existing project, AFTER the V161 app files are up:
-- Dashboard → SQL Editor → New query → paste this whole file → Run. Safe to run
-- again. A new project gets the same from schema.sql.
--
-- V161 (the second GPT audit, finding 3 — Peter, 12 Nov: R68 4A; the V161 round
-- 1A 2A 3A, the defaults). Signing a device out (Account → Your devices → Sign
-- it out, V156) deletes its sign-in; but the access token that device already
-- holds kept working until it ran out — up to an hour (4A: it stays 1 hour).
-- Now every cloud request checks the sign-in it came on still exists:
--   • jobs, records and every server function (the Data API): a check that runs
--     before each request (PostgREST's pre-request). A request on a sign-in that
--     is gone — or past its own "use until" time (3A) — is REFUSED with an error,
--     patgo_signed_out (401). Never an empty answer: an old phone could read
--     "no rows" as "deleted".
--   • photo files (2A): the pre-request doesn't cover Storage, so the same check
--     is one extra RESTRICTIVE rule on storage.objects. It sits beside the four
--     photo-file rules (so re-running an older file can't remove it) and refuses
--     with an error too.
--   • a request that carries no sign-in at all — the server, the dashboard, the
--     isolation test — passes.
-- The app (V161) then signs that phone out itself and holds its jobs (1A).
-- The billing pages ask Supabase's sign-in server who you are, which already
-- refuses a sign-in that has gone. No new table or column.
--
-- ⚠ UNDO (if the cloud refuses everyone after this): paste these three lines into
-- a new query and Run —
--   alter role authenticator reset pgrst.db_pre_request;
--   notify pgrst, 'reload config';
--   drop policy if exists "photo files need a live sign-in" on storage.objects;
--
-- The result is a short table of checks. Every row must say PASS. Then run
-- supabase/isolation-test.sql as usual (28a–28d are this release's).

-- ================================================================ V161
-- A signed-out device loses cloud access at once (the second audit, finding 3 —
-- Peter, 12 Nov: R68 4A, V161 round 1A–3A). Existing projects:
-- supabase/v161-signed-out.sql (plus self-checks S1–S3). Kept in step with it
-- byte for byte by harness group 100e.

-- true = this request may go on. No sign-in on the request (the server, the
-- dashboard, the tests: _my_session() is null) passes; otherwise its sign-in
-- must still exist and not be past its own "use until" time (3A).
create or replace function public._request_signed_in()
returns boolean language sql stable security definer set search_path = '' as $$
  select q.s is null
      or exists (select 1 from auth.sessions x
                 where x.id = q.s and (x.not_after is null or x.not_after > now()))
  from (select public._my_session() as s) q
$$;
revoke all on function public._request_signed_in() from public, anon, authenticated;

-- The Data API's check before every request (1A, 2A). An error, never an empty
-- answer; the app reads the code patgo_signed_out.
create or replace function public.patgo_check_request()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._request_signed_in() then
    raise sqlstate 'PGRST' using
      message = json_build_object('code', 'patgo_signed_out',
        'message', 'patgo_signed_out: this sign-in has been signed out')::text,
      -- V162: PostgREST needs BOTH status and headers here, or it answers 500
      -- PGRST121 and the phone never hears patgo_signed_out (third audit, 2).
      detail = json_build_object('status', 401, 'headers', json_build_object())::text;
  end if;
end;
$$;
revoke all on function public.patgo_check_request() from public;
grant execute on function public.patgo_check_request() to anon, authenticated, service_role;

-- Photo files (2A): the same check, raised — never a quiet "no file".
create or replace function public.patgo_files_signed_in()
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._request_signed_in() then raise exception 'patgo_signed_out'; end if;
  return true;
end;
$$;
revoke all on function public.patgo_files_signed_in() from public, anon;
grant execute on function public.patgo_files_signed_in() to authenticated;

drop policy if exists "photo files need a live sign-in" on storage.objects;
create policy "photo files need a live sign-in" on storage.objects
  as restrictive for all to authenticated
  using ((select public.patgo_files_signed_in()))
  with check ((select public.patgo_files_signed_in()));

-- Switched on last, once the check exists.
alter role authenticator set pgrst.db_pre_request = 'public.patgo_check_request';
notify pgrst, 'reload config';
-- ================================================================ self-checks
drop table if exists pg_temp._v161_result;
create temp table _v161_result (n int, check_name text, result text);

do $v161$
declare res text[] := '{}'; cfg text[]; live uuid := gen_random_uuid(); gone uuid := gen_random_uuid();
  me uuid; e_gone text; e_none text; e_live text; e_old text; f_gone text; f_live text;
begin
  -- S1: the check is switched on, and is the right one.
  select rolconfig into cfg from pg_roles where rolname = 'authenticator';
  res := res || array['S1|every cloud request is checked first (the pre-request is on)|'
    || case when 'pgrst.db_pre_request=public.patgo_check_request' = any(coalesce(cfg, '{}'))
             and exists (select 1 from pg_proc p join pg_namespace x on x.oid = p.pronamespace
                         where x.nspname = 'public' and p.proname = 'patgo_check_request')
            then 'PASS' else 'FAIL' end];
  -- S2: what it lets through. A pretend sign-in (removed again below).
  select id into me from auth.users order by created_at limit 1;
  if me is null then
    res := res || array['S2|a gone or run-out sign-in is refused; a live one and the server pass|INCONCLUSIVE|no account yet'];
  else
    insert into auth.sessions (id, user_id, created_at, updated_at, user_agent)
      values (live, me, now(), now(), 'patgo-v161-check');
    perform set_config('request.jwt.claims', json_build_object('sub', me::text, 'role', 'authenticated', 'session_id', gone::text)::text, true);
    begin perform public.patgo_check_request(); e_gone := 'passed'; exception when others then e_gone := sqlstate || ' ' || sqlerrm; end;
    begin perform public.patgo_files_signed_in(); f_gone := 'passed'; exception when others then f_gone := sqlerrm; end;
    perform set_config('request.jwt.claims', json_build_object('sub', me::text, 'role', 'authenticated', 'session_id', live::text)::text, true);
    begin perform public.patgo_check_request(); e_live := 'passed'; exception when others then e_live := sqlerrm; end;
    begin perform public.patgo_files_signed_in(); f_live := 'passed'; exception when others then f_live := sqlerrm; end;
    perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
    begin perform public.patgo_check_request(); e_none := 'passed'; exception when others then e_none := sqlerrm; end;
    update auth.sessions set not_after = now() - interval '1 minute' where id = live;
    perform set_config('request.jwt.claims', json_build_object('sub', me::text, 'role', 'authenticated', 'session_id', live::text)::text, true);
    begin perform public.patgo_check_request(); e_old := 'passed'; exception when others then e_old := sqlstate || ' ' || sqlerrm; end;
    perform set_config('request.jwt.claims', '', true);
    delete from auth.sessions where id = live;
    res := res || array['S2|a gone or run-out sign-in is refused; a live one and the server pass|'
      || case when e_gone like 'PGRST %patgo_signed_out%' and f_gone like 'patgo_signed_out%'
               and e_live = 'passed' and f_live = 'passed' and e_none = 'passed' and e_old like 'PGRST %patgo_signed_out%'
              then 'PASS' else 'FAIL|' || concat_ws(' / ', e_gone, f_gone, e_live, f_live, e_none, e_old) end];
  end if;
  -- S3: photo files carry the rule; the inner check is closed to phones.
  res := res || array['S3|photo files need a live sign-in too; the inner check is closed to phones|'
    || case when exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                         and policyname = 'photo files need a live sign-in' and permissive = 'RESTRICTIVE'
                         and cmd = 'ALL' and roles = '{authenticated}')
             and has_function_privilege('authenticated', 'public.patgo_check_request()', 'execute')
             and has_function_privilege('anon', 'public.patgo_check_request()', 'execute')
             and not has_function_privilege('authenticated', 'public._request_signed_in()', 'execute')
             and not has_function_privilege('anon', 'public.patgo_files_signed_in()', 'execute')
            then 'PASS' else 'FAIL' end];
  insert into _v161_result select row_number() over (), split_part(x, '|', 1) || ' · ' || split_part(x, '|', 2),
    split_part(x, '|', 3) || case when split_part(x, '|', 4) <> '' then ' · ' || split_part(x, '|', 4) else '' end
  from unnest(res) as x;
end
$v161$;

select check_name, result from _v161_result order by n;
