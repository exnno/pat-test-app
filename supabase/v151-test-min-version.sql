-- PATGo cloud — V151 testing aid: make PATGo say "Update PATGo" on ONE account
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- FOR TESTING ONLY, on the test project. Raises the minimum app version for
-- your SPARE account alone (4A) — everyone else, testers included, carries on
-- syncing. Then on a phone signed in as the spare account, PATGo stops syncing
-- and shows the Update PATGo line; "undo" puts it back.
--
-- HOW: run supabase/v151-min-version.sql first. Then Dashboard → SQL Editor →
-- New query → paste this file → change the address below (and the word, to
-- undo) → Run. On the phone: close PATGo fully and reopen it (it reads the
-- minimum on every start and every return to the front).

do $t$
declare
  email_spare text := 'CHANGE-ME-SPARE@example.com';   -- ← your spare account
  action      text := 'raise';                         -- ← 'raise' (needs updating) or 'undo'
  u uuid;
begin
  if action not in ('raise', 'undo') then
    raise exception 'Set action to raise or undo.';
  end if;
  select id into u from auth.users where lower(email) = lower(email_spare);
  if u is null then
    raise exception 'Set email_spare to your spare account (Authentication → Users).';
  end if;
  if to_regclass('public.app_min_overrides') is null then
    raise exception 'Run supabase/v151-min-version.sql first.';
  end if;
  if action = 'raise' then
    -- 999999: no real version is that high, so "Update now" finds nothing to
    -- install — the line stays until you run this again with 'undo'.
    insert into public.app_min_overrides (user_id, min_version, note)
    values (u, 999999, 'V151 test aid')
    on conflict (user_id) do update set min_version = excluded.min_version, note = excluded.note;
  else
    delete from public.app_min_overrides where user_id = u;
  end if;
  raise notice 'Done: the spare account''s minimum is now %.', public.app_min_version_for(u);
end
$t$;

-- Where things stand: the setting, and every account with a raise of its own.
select 'everyone' as who, min_version as minimum from public.app_settings where id = 1
union all
select coalesce(au.email, o.user_id::text), o.min_version
from public.app_min_overrides o left join auth.users au on au.id = o.user_id;
