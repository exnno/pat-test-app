-- PATGo cloud — V162: the signed-out refusal reaches the phone as a 401
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on a project that already ran supabase/v161-signed-out.sql, AFTER the
-- V162 app files are up: Dashboard → SQL Editor → New query → paste this whole
-- file → Run. Safe to run again. A new project gets the same from schema.sql.
--
-- WHY (the third GPT audit, finding 2 — confirmed against PostgREST's source:
-- src/library/PostgREST/Error.hs, instance FromJSON PgRaiseErrDetails, which
-- reads "status" AND "headers" as REQUIRED, v12.0.0 to today). V161's check
-- raised its refusal with detail {"status":401} only. PostgREST could not parse
-- that, so instead of 401 / patgo_signed_out it answered 500 / PGRST121 — the
-- request was still refused, but the phone never saw patgo_signed_out, so it
-- did not sign itself out or say why. The fix is one field: "headers": {}.
--
-- Nothing else changes: the same check, the same switch, the same photo rule.
-- The result is a short table of checks. Every row must say PASS.

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

notify pgrst, 'reload schema';

-- ================================================================ self-checks
drop table if exists pg_temp._v162_result;
create temp table _v162_result (n int, check_name text, result text);

do $v162$
declare gone uuid := gen_random_uuid(); st text; msg text; det text; m jsonb; d jsonb; cfg text[];
  res text[] := '{}';
begin
  -- S1: the check is still the one switched on.
  select rolconfig into cfg from pg_roles where rolname = 'authenticator';
  res := res || array['S1|the pre-request is still on|'
    || case when 'pgrst.db_pre_request=public.patgo_check_request' = any(coalesce(cfg, '{}')) then 'PASS' else 'FAIL' end];
  -- S2/S3: raise it for a sign-in that doesn't exist and read back EXACTLY what
  -- PostgREST receives: the message and the detail, each parsed as PostgREST
  -- parses them (message: code + message; detail: status + headers, both required).
  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated', 'session_id', gone::text)::text, true);
  begin
    perform public.patgo_check_request();
    st := 'passed';
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text, det = pg_exception_detail;
  end;
  perform set_config('request.jwt.claims', '', true);
  begin m := msg::jsonb; exception when others then m := null; end;
  begin d := det::jsonb; exception when others then d := null; end;
  res := res || array['S2|the refusal''s message parses: code patgo_signed_out|'
    || case when st = 'PGRST' and m ->> 'code' = 'patgo_signed_out' and m ? 'message' then 'PASS'
            else 'FAIL|' || coalesce(st, '?') || ' ' || coalesce(msg, '') end];
  res := res || array['S3|the refusal''s detail parses: status 401 AND headers (else PostgREST answers 500 PGRST121)|'
    || case when d is not null and jsonb_typeof(d -> 'status') = 'number' and (d ->> 'status')::int = 401
                 and jsonb_typeof(d -> 'headers') = 'object' then 'PASS'
            else 'FAIL|' || coalesce(det, 'no detail') end];
  insert into _v162_result
    select i, split_part(r, '|', 2), split_part(r, '|', 3) || coalesce(nullif('  ' || split_part(r, '|', 4), '  '), '')
    from unnest(res) with ordinality as u(r, i);
end;
$v162$;

select n as "#", check_name as "check", result from _v162_result order by n;
