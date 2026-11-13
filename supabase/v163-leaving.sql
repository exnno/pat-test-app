-- PATGo cloud — V163: leaving and removing a member
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on the test project, AFTER the V163 app files are up: Dashboard → SQL
-- Editor → New query → paste this whole file → Run. Safe to run again. A new
-- project gets the same from schema.sql (its last section).
--
-- Locked 13 Nov (Peter): 1A who removes whom = who may invite whom · 2A anyone but
-- the Owner may leave · 3B the leaver's phone clears the business's jobs the cloud
-- holds, keeps unsent ones read-only · 4C the remover sees the person's devices
-- and when each last connected, never blocked · 5B the leaver is told on a sheet ·
-- 6A a last delivery: the leaver's phone may still SEND its own jobs and photos
-- for that business — never read anyone else's — until it says it's finished, 7
-- days at most; "Cut off now" skips it.
--
-- What removal does, at once and in one transaction (_member_depart):
--   the membership row goes (R5: the login stays, the business keeps every job);
--   their waiting move requests to or from the business are dropped;
--   if it was their main business, their own (else their oldest) becomes main;
--   their lists (clients, sites, …) filed in it follow them to their main — the
--     phone holds them anyway, and left behind they would stop every later sync
--     of the lists (a row can be in one business only);
--   a departures row records it, with the last-delivery window (6A).
-- The cloud then refuses them the business's rows and photo files (V113's rules
-- and a new restrictive file rule) — except their OWN jobs and photos during the
-- window: insert and change only, never mark deleted.
--
-- The result is a short table of checks. Every row must say PASS.

-- ================================================================ V163
-- Leaving and removing (R5; locked 1A 2A 3B 4C 5B 6A). Existing projects:
-- supabase/v163-leaving.sql (the same, plus self-checks L1–L5). Kept in step by
-- harness group 102. Comes AFTER V159's org_stamp: this definition replaces it.

create table if not exists public.departures (
  org_id         uuid not null references public.organisations(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  kind           text not null check (kind in ('removed', 'left')),
  role           text not null,
  by_user        uuid,
  by_name        text not null default '',
  at             timestamptz not null default now(),
  deliver_until  timestamptz,
  primary key (org_id, user_id)
);
alter table public.departures enable row level security;
revoke all on public.departures from public, anon, authenticated;

-- During u's last delivery to o: gone from o, the window still open.
create or replace function public._delivering_for(o uuid, u uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select o is not null and u is not null
     and not exists (select 1 from public.memberships m where m.org_id = o and m.user_id = u)
     and exists (select 1 from public.departures d
                 where d.org_id = o and d.user_id = u and d.deliver_until > now())
$$;
create or replace function public._delivering(o uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public._delivering_for(o, auth.uid())
$$;
-- May I hold rows in o: a member, or delivering to it.
create or replace function public.may_hold(o uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.my_role(o) is not null or public._delivering(o)
$$;
revoke all on function public._delivering_for(uuid, uuid), public._delivering(uuid)
  from public, anon, authenticated;
revoke all on function public.may_hold(uuid) from public, anon;
grant execute on function public.may_hold(uuid) to authenticated;

-- ------------------------------------------------- jobs and photos: the window
-- V113's rules, with may_hold for read / add / change. Records keep V113's: a
-- leaver's lists follow them (above). Delete is unchanged (members only). During
-- the window a row may not be marked deleted — a leaver delivers, never wipes.
do $$
declare t text;
begin
  foreach t in array array['sessions','photos'] loop
    execute format('drop policy if exists "read %s" on public.%I', t, t);
    execute format('drop policy if exists "add own %s" on public.%I', t, t);
    execute format('drop policy if exists "change own %s" on public.%I', t, t);
    execute format('create policy "read %s" on public.%I for select to authenticated
      using ((user_id = (select auth.uid()) and public.may_hold(org_id))
             or public.can_read_org(org_id))', t, t);
    execute format('create policy "add own %s" on public.%I for insert to authenticated
      with check (user_id = (select auth.uid())
                  and (public.my_role(org_id) is not null or (public.may_hold(org_id) and not deleted)))', t, t);
    execute format('create policy "change own %s" on public.%I for update to authenticated
      using      (user_id = (select auth.uid()) and public.may_hold(org_id))
      with check (user_id = (select auth.uid())
                  and (public.my_role(org_id) is not null or (public.may_hold(org_id) and not deleted)))', t, t);
  end loop;
end $$;

-- ------------------------------------------------- the stamp
-- V159's org_stamp, plus: a named business is kept on insert for someone
-- delivering to it (6A — a job started before removal and never sent lands where
-- it was made, never in the leaver's own business); and a leaver's lists may move
-- to their main once, under _member_depart's mark.
create or replace function public.org_stamp()
returns trigger language plpgsql security definer set search_path = '' as $$
declare mv text; ok boolean := false;
begin
  if tg_op = 'INSERT' then
    -- V163: a job or photo naming a business you've LEFT, outside the last
    -- delivery, is refused — never quietly filed in your own business (the phone
    -- then learns it has left: the refusal makes it ask).
    if new.org_id is not null and tg_table_name in ('sessions', 'photos')
       and not exists (select 1 from public.memberships m where m.org_id = new.org_id and m.user_id = new.user_id)
       and exists (select 1 from public.departures d where d.org_id = new.org_id and d.user_id = new.user_id)
       and not public._delivering_for(new.org_id, new.user_id) then
      raise exception 'patgo_left_business: you are no longer in this business' using errcode = '42501';
    end if;
    if new.org_id is not null and not exists (
      select 1 from public.memberships m where m.org_id = new.org_id and m.user_id = new.user_id
    ) and not (tg_table_name in ('sessions', 'photos') and public._delivering_for(new.org_id, new.user_id)) then
      new.org_id := null;
    end if;
    -- V159: Office never holds a job.
    if new.org_id is not null and tg_table_name in ('sessions', 'photos')
       and public.member_role(new.org_id, new.user_id) = 'office' then
      new.org_id := null;
    end if;
    -- (Only reached for photos: NEW.session_id exists on that table alone.)
    if new.org_id is null and tg_table_name = 'photos' then
      select s.org_id into new.org_id from public.sessions s
      where s.user_id = new.user_id and s.id = new.session_id;
      if new.org_id is not null and not exists (
        select 1 from public.memberships m where m.org_id = new.org_id and m.user_id = new.user_id
      ) and not public._delivering_for(new.org_id, new.user_id) then
        if exists (select 1 from public.departures d where d.org_id = new.org_id and d.user_id = new.user_id) then
          raise exception 'patgo_left_business: you are no longer in this business' using errcode = '42501';
        end if;
        new.org_id := null;
      end if;
    end if;
    if new.org_id is null then
      new.org_id := public.default_org(new.user_id);
      if new.org_id is null then
        raise exception 'PATGo: account % has no business', new.user_id;
      end if;
    end if;
  elsif old.org_id is not null and new.org_id is distinct from old.org_id then
    mv := coalesce(current_setting('patgo.job_move', true), '');
    if mv <> '' and new.org_id is not null and tg_table_name in ('sessions', 'photos') then
      if tg_table_name = 'sessions' then
        ok := mv = new.user_id::text || '/' || new.id || '/' || new.org_id::text;
      else
        -- (Only reached for photos, as above.)
        ok := mv = new.user_id::text || '/' || new.session_id || '/' || new.org_id::text;
      end if;
      ok := ok and exists (select 1 from public.memberships m where m.org_id = new.org_id and m.user_id = new.user_id);
    end if;
    -- V163: a leaver's lists follow them to their main business, once.
    if not ok and tg_table_name = 'records' and new.org_id is not null then
      ok := coalesce(current_setting('patgo.lists_follow', true), '') = new.user_id::text || '/' || new.org_id::text
        and exists (select 1 from public.memberships m where m.org_id = new.org_id and m.user_id = new.user_id);
    end if;
    if not ok then
      new.org_id := old.org_id;
    end if;
  end if;
  return new;
end;
$$;

-- ------------------------------------------------- photo files of a business you've left
-- Restrictive, so no other file rule can widen it: a file whose photo row is
-- yours, in a business you no longer belong to and aren't delivering to, can't be
-- read, changed or deleted by you. The business still reads it (can_read_photo_file).
create or replace function public.photo_file_departed(name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.photos p
                 where p.user_id = auth.uid()
                   and p.storage_path in (name, regexp_replace(name, '_t\.jpg$', '.jpg'))
                   and not public.may_hold(p.org_id))
$$;
revoke all on function public.photo_file_departed(text) from public, anon;
grant execute on function public.photo_file_departed(text) to authenticated;
drop policy if exists "photo files of a business you have left" on storage.objects;
create policy "photo files of a business you have left" on storage.objects
  as restrictive for all to authenticated
  using (bucket_id <> 'photos' or not (select public.photo_file_departed(name)))
  with check (bucket_id <> 'photos' or not (select public.photo_file_departed(name)));

-- ------------------------------------------------- the one way out
-- u leaves o (kind 'removed' by someone else, 'left' by themselves). Everything
-- in one transaction; the caller has already been checked.
create or replace function public._member_depart(o uuid, u uuid, k text, by uuid, deliver boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.memberships; tgt uuid; nm text;
begin
  select * into m from public.memberships where org_id = o and user_id = u for update;
  if not found then raise exception 'patgo_member_gone'; end if;
  if m.role = 'owner' then raise exception 'patgo_not_allowed'; end if;
  nm := coalesce((select nullif(x.name, '') from public.memberships x where x.org_id = o and x.user_id = by), '');
  -- Their waiting requests to or from it (V150 would drop them on approval).
  update public.job_moves set status = 'dropped', decided_at = clock_timestamp()
  where user_id = u and status = 'waiting' and (from_org = o or to_org = o);
  delete from public.memberships where org_id = o and user_id = u;
  if m.is_default then
    select x.org_id into tgt from public.memberships x where x.user_id = u
    order by (x.role = 'owner') desc, (x.role = 'office'), x.created_at, x.org_id limit 1;
    if tgt is not null then
      update public.memberships set is_default = true where user_id = u and org_id = tgt;
    end if;
  end if;
  tgt := public.default_org(u);
  if tgt is not null then
    perform set_config('patgo.lists_follow', u::text || '/' || tgt::text, true);
    update public.records set org_id = tgt where user_id = u and org_id = o;
    perform set_config('patgo.lists_follow', '', true);
  end if;
  insert into public.departures (org_id, user_id, kind, role, by_user, by_name, at, deliver_until)
  values (o, u, k, m.role, by, nm, now(), case when deliver then now() + interval '7 days' end)
  on conflict (org_id, user_id) do update
    set kind = excluded.kind, role = excluded.role, by_user = excluded.by_user,
        by_name = excluded.by_name, at = excluded.at, deliver_until = excluded.deliver_until;
end;
$$;
revoke all on function public._member_depart(uuid, uuid, text, uuid, boolean) from public, anon, authenticated;

-- Remove someone (1A: whoever may invite their role; never yourself, never the
-- Owner). deliver = 6A's last delivery (the sheet's default); false = Cut off now.
create or replace function public.remove_member(o uuid, u uuid, deliver boolean default true)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := auth.uid(); r text;
begin
  if me is null or u is null or u = me then raise exception 'patgo_not_allowed'; end if;
  r := public.member_role(o, u);
  if r is null then raise exception 'patgo_member_gone'; end if;
  if not public._may_offer(o, r) then raise exception 'patgo_not_allowed'; end if;
  perform public._member_depart(o, u, 'removed', me, coalesce(deliver, true));
  return 'removed';
end;
$$;

-- Leave (2A: anyone but the Owner). Your own phone delivers, then finishes.
create or replace function public.leave_business(o uuid)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := auth.uid(); r text;
begin
  if me is null then raise exception 'patgo_not_allowed'; end if;
  r := public.my_role(o);
  if r is null then raise exception 'patgo_member_gone'; end if;
  if r = 'owner' then raise exception 'patgo_owner_leave'; end if;
  perform public._member_depart(o, me, 'left', me, true);
  return 'left';
end;
$$;

-- 4C: the person's signed-in devices and when each was last used — for the
-- remove sheet. Only for someone the caller may remove.
create or replace function public.member_devices(o uuid, u uuid)
returns table (kind text, app_version text, last_used timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare r text := public.member_role(o, u);
begin
  if auth.uid() is null or r is null or u = auth.uid() or not public._may_offer(o, r) then
    raise exception 'patgo_not_allowed';
  end if;
  return query select d.kind, d.app_version, d.last_used from public._signed_in_devices(u) d
               order by d.last_used desc nulls last;
end;
$$;

-- The businesses I've left and not rejoined: what my phone needs to know (5B),
-- the jobs of mine the cloud holds there (3B — exact, not the phone's guess), and
-- whether my last delivery is open (6A).
create or replace function public.my_departures()
returns table (business_id uuid, business_name text, kind text, at timestamptz,
               by_name text, deliver boolean, deliver_until timestamptz, jobs text[])
language sql stable security definer set search_path = '' as $$
  select d.org_id, coalesce(o.name, ''), d.kind, d.at, d.by_name,
         coalesce(d.deliver_until > now(), false), d.deliver_until,
         coalesce((select array_agg(s.id order by s.id) from public.sessions s
                   where s.user_id = d.user_id and s.org_id = d.org_id), '{}')
  from public.departures d
  left join public.organisations o on o.id = d.org_id
  where d.user_id = auth.uid()
    and not exists (select 1 from public.memberships m where m.org_id = d.org_id and m.user_id = d.user_id)
  order by d.at desc
$$;

-- 6A: my phone has sent what it could — the window closes now.
create or replace function public.finish_delivery(o uuid)
returns boolean language sql volatile security definer set search_path = '' as $$
  update public.departures set deliver_until = null
  where org_id = o and user_id = auth.uid() and deliver_until is not null
  returning true
$$;

revoke all on function public.remove_member(uuid, uuid, boolean), public.leave_business(uuid),
  public.member_devices(uuid, uuid), public.my_departures(), public.finish_delivery(uuid)
  from public, anon;
grant execute on function public.remove_member(uuid, uuid, boolean), public.leave_business(uuid),
  public.member_devices(uuid, uuid), public.my_departures(), public.finish_delivery(uuid)
  to authenticated;

notify pgrst, 'reload schema';
-- ================================================================ end V163

-- ================================================================ self-checks
drop table if exists pg_temp._v163_result;
create temp table _v163_result (n int, check_name text, result text);
insert into _v163_result
select 1, 'departures table locked (RLS on, no grants to the app)',
  case when (select relrowsecurity from pg_class where oid = 'public.departures'::regclass)
        and not has_table_privilege('authenticated', 'public.departures', 'select')
        and not has_table_privilege('authenticated', 'public.departures', 'insert')
       then 'PASS' else 'FAIL' end
union all
select 2, 'jobs and photos rules use may_hold (the last delivery)',
  case when (select count(*) from pg_policies where schemaname = 'public' and tablename in ('sessions','photos')
               and policyname in ('read sessions','add own sessions','change own sessions','read photos','add own photos','change own photos')
               and coalesce(qual, '') || coalesce(with_check, '') like '%may_hold%') = 6
       then 'PASS' else 'FAIL' end
union all
select 3, 'the photo file rule for a business you have left is restrictive',
  case when exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                      and policyname = 'photo files of a business you have left' and permissive = 'RESTRICTIVE')
       then 'PASS' else 'FAIL' end
union all
select 4, 'the app may call remove / leave / devices / departures / finish, not the helpers',
  case when has_function_privilege('authenticated', 'public.remove_member(uuid, uuid, boolean)', 'execute')
        and has_function_privilege('authenticated', 'public.leave_business(uuid)', 'execute')
        and has_function_privilege('authenticated', 'public.member_devices(uuid, uuid)', 'execute')
        and has_function_privilege('authenticated', 'public.my_departures()', 'execute')
        and has_function_privilege('authenticated', 'public.finish_delivery(uuid)', 'execute')
        and not has_function_privilege('authenticated', 'public._member_depart(uuid, uuid, text, uuid, boolean)', 'execute')
        and not has_function_privilege('authenticated', 'public._delivering_for(uuid, uuid)', 'execute')
        and not has_function_privilege('anon', 'public.my_departures()', 'execute')
       then 'PASS' else 'FAIL' end
union all
select 5, 'org_stamp keeps a delivering job in its business; lists follow under the mark',
  case when (select prosrc from pg_proc where oid = 'public.org_stamp()'::regprocedure) like '%_delivering_for(new.org_id, new.user_id)%'
        and (select prosrc from pg_proc where oid = 'public.org_stamp()'::regprocedure) like '%patgo.lists_follow%'
       then 'PASS' else 'FAIL' end;

select n as "#", check_name as "check", result from _v163_result order by n;
