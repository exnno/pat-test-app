-- PATGo cloud — V172: Recently deleted, and the Owner deleting a business's job
-- (c) 2026 Peter Birchley. All rights reserved.
--
-- Run ONCE on the test project, AFTER the V172 app files are up: Dashboard → SQL
-- Editor → New query → paste this whole file → Run. Safe to run again. A new
-- project gets the same from schema.sql (its last section).
--
-- Locked 19 Nov (Peter — R83 "1A 2C 3B 4A 5A 6A+B 7A", then "0 defaults, 8A 9B 10A
-- 11A 12 both"): a job deleted from the cloud goes to Recently deleted for 30 days;
-- the Owner restores it or deletes it for good sooner; then it is gone with its
-- photos. Every delete made in the Cloud tab or Cloud Storage goes this way.
--
-- ONE table (job_bin, its trail kept for good), a settings row, three triggers'
-- worth of rules and the functions the app calls. The photo FILES of a job gone
-- for good are deleted by a small Edge Function, bin-files (the handoff's deploy
-- steps): until it is set up they wait, listed. The result is a short table of
-- checks. Every row must say PASS.

-- ================================================================ V172
-- Recently deleted. KEEP IN STEP with supabase/v172-recently-deleted.sql (the
-- same, plus self-checks K1–K6). Kept in step by harness 114.
--
-- Round R83 (19 Nov, Peter): a job deleted from the cloud goes to Recently
-- deleted for 30 days (6B) — restorable by the Owner (10A), deletable for good
-- sooner by the Owner (11A); then gone for good with its photos (5A). Every
-- delete made from the Cloud tab or Cloud Storage goes this way, solo too (8A);
-- a phone's own "Delete job" is unchanged (9B). The Owner may delete anyone's job
-- in the business (V172 — a Team leader's or the Office's becomes a request the
-- Owner approves in V173).
--
-- HOW. bin_job copies the whole job (doc, fp) into job_bin, marks its photo rows
-- deleted (their FILES stay — nothing can delete them while it is binned), and
-- turns the job row into the ordinary deleted marker every phone already obeys
-- (deleted = true) — so every phone, of any version, takes it off (4A). The marker's
-- doc carries who deleted it (binnedBy / binnedRole / binnedAt) for the engineer's
-- "Removed by …" (O-e). Its trail stays in job_bin for good (doc emptied at the end).
--   ⚠ O-d: a phone that still had unsent work sends it as usual; bin_catch puts
--   it INTO the bin entry and keeps the row a marker (never live again by a push),
--   and bin_catch_photo does the same for a photo row. Nothing unsent is lost.
--   bin_restore puts the job row back live (doc and fp as kept) and its photo rows;
--   phones bring it down like any job from the cloud (O-g).
-- After 30 days (bin_purge, hourly) — or at once by bin_forget — the entry's doc
-- is emptied and its files listed for the bin-files Edge Function, which deletes
-- them with the service key (no signed-in person may delete another's files).

create table if not exists public.job_bin (
  n              bigint generated always as identity primary key,
  user_id        uuid not null,
  id             text not null,
  org_id         uuid,
  doc            jsonb,
  fp             text,
  last_modified  timestamptz,
  photos         jsonb not null default '[]'::jsonb,   -- [{"id": …, "path": …}]
  binned_at      timestamptz not null default now(),
  binned_by      uuid,
  binned_name    text not null default '',
  binned_role    text not null default '',
  purge_at       timestamptz not null default now() + interval '30 days',
  restored_at    timestamptz,
  restored_by    uuid,
  restored_name  text,
  gone_at        timestamptz,
  gone_by        uuid,
  files_left     boolean not null default false
);
-- One live entry per job (a job restored and deleted again gets a new line).
create unique index if not exists job_bin_live on public.job_bin (user_id, id)
  where restored_at is null and gone_at is null;
create index if not exists job_bin_org on public.job_bin (org_id) where restored_at is null and gone_at is null;
create index if not exists job_bin_files on public.job_bin (n) where files_left;
alter table public.job_bin enable row level security;
revoke all on public.job_bin from anon, authenticated;

-- Where the bin-files Edge Function lives (Peter fills it in once deployed —
-- the handoff says how). Empty = nothing is asked; the files wait, still counted.
create table if not exists public.bin_settings (
  id         integer primary key default 1 check (id = 1),
  files_url  text not null default ''
);
insert into public.bin_settings (id) values (1) on conflict (id) do nothing;
alter table public.bin_settings enable row level security;
revoke all on public.bin_settings from anon, authenticated;

-- Is (holder, job) in Recently deleted right now?
create or replace function public._bin_live(u uuid, j text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.job_bin b
                 where b.user_id = u and b.id = j and b.restored_at is null and b.gone_at is null)
$$;
revoke all on function public._bin_live(uuid, text) from public, anon, authenticated;

-- Who may restore or delete for good: the Owner of the entry's business — and in a
-- business of one that is its only person.
create or replace function public._bin_mine(o uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role(o) = 'owner', false)
$$;
revoke all on function public._bin_mine(uuid) from public, anon, authenticated;

-- The caller's name and role in a business, for the trail.
create or replace function public._bin_who(o uuid)
returns table (nm text, rl text) language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(btrim(m.name), ''), split_part(u.email, '@', 1), 'Someone'), m.role
  from public.memberships m join auth.users u on u.id = m.user_id
  where m.org_id = o and m.user_id = auth.uid()
$$;
revoke all on function public._bin_who(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- the delete
-- bin_job(holder, job, org) — SECURITY DEFINER (it changes a job the caller may
-- not hold); refused (raise — nothing written):
--   patgo_bin_signed_out   nobody signed in
--   patgo_bin_bad          no job named
--   patgo_bin_gone         no such job, already deleted, or already in Recently deleted
--   patgo_bin_moved        the job is no longer in the business the caller was looking at
--   patgo_bin_not_allowed  someone else's job and not the Owner of its business; or your
--                          own and the cloud's delete rule (can_wipe) says no
-- (A locked plan is refused by plan_guard, as any change is.)
-- Answer: {"photos": n, "at": stamp}.
create or replace function public.bin_job(holder uuid, job text, org uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  s record;
  nm text; rl text;
  stamp text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  ph jsonb;
begin
  if me is null then raise exception 'patgo_bin_signed_out'; end if;
  if holder is null or coalesce(job, '') = '' then raise exception 'patgo_bin_bad'; end if;
  select x.* into s from public.sessions x where x.user_id = holder and x.id = job for update;
  if not found or s.deleted or public._bin_live(holder, job) then raise exception 'patgo_bin_gone'; end if;
  if org is not null and s.org_id is distinct from org then raise exception 'patgo_bin_moved'; end if;
  if holder = me then
    if not public.can_wipe(s.org_id) then raise exception 'patgo_bin_not_allowed'; end if;
  elsif s.org_id is null or coalesce(public.my_role(s.org_id), '') <> 'owner' then
    raise exception 'patgo_bin_not_allowed';
  end if;
  select w.nm, w.rl into nm, rl from public._bin_who(s.org_id) w;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'path', p.storage_path) order by p.id), '[]'::jsonb)
    into ph from public.photos p
    where p.user_id = holder and p.session_id = job and not p.deleted;
  insert into public.job_bin (user_id, id, org_id, doc, fp, last_modified, photos,
                              binned_by, binned_name, binned_role)
  values (holder, job, s.org_id, s.doc, s.fp, s.last_modified, ph,
          me, left(coalesce(nm, 'Someone'), 80), coalesce(rl, ''));
  update public.photos p set deleted = true, last_modified = now()
    where p.user_id = holder and p.session_id = job and not p.deleted;
  update public.sessions x
     set deleted = true, fp = null, last_modified = now(),
         doc = jsonb_build_object('binnedAt', stamp, 'binnedBy', left(coalesce(nm, 'Someone'), 80), 'binnedRole', coalesce(rl, ''))
   where x.user_id = holder and x.id = job;
  return jsonb_build_object('photos', jsonb_array_length(ph), 'at', stamp);
end;
$$;
revoke all on function public.bin_job(uuid, text, uuid) from public, anon;
grant execute on function public.bin_job(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------- O-d: work sent late
-- A phone that held unsent work for a binned job sends it the usual way (an upsert).
-- It lands in the bin entry, and the row stays a marker: a push can never bring a
-- binned job back — only bin_restore can. ⚠ Named so it fires BEFORE
-- sessions_fp_guard and wipe_guard (same-event triggers run in name order).
create or replace function public.bin_catch()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.deleted and not new.deleted and public._bin_live(old.user_id, old.id) then
    update public.job_bin b set doc = new.doc, fp = new.fp, last_modified = new.last_modified
      where b.user_id = old.user_id and b.id = old.id and b.restored_at is null and b.gone_at is null;
    new.doc := old.doc;
    new.fp := old.fp;
    new.deleted := true;
  end if;
  return new;
end;
$$;
drop trigger if exists bin_catch on public.sessions;
create trigger bin_catch before update on public.sessions
  for each row execute function public.bin_catch();

-- The same for a photo row of a binned job (a photo taken before the job went,
-- sent after): kept in the entry, the row stays deleted, the file is kept.
create or replace function public.bin_catch_photo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not new.deleted and (tg_op = 'INSERT' or old.deleted)
     and public._bin_live(new.user_id, new.session_id) then
    update public.job_bin b
       set photos = b.photos || jsonb_build_array(jsonb_build_object('id', new.id, 'path', new.storage_path))
     where b.user_id = new.user_id and b.id = new.session_id and b.restored_at is null and b.gone_at is null
       and not exists (select 1 from jsonb_array_elements(b.photos) e where e ->> 'id' = new.id);
    new.deleted := true;
  end if;
  return new;
end;
$$;
drop trigger if exists bin_catch_photo on public.photos;
create trigger bin_catch_photo before insert or update on public.photos
  for each row execute function public.bin_catch_photo();

-- A binned job's photo files can't be deleted by anyone signed in (its own phone
-- included) — they go with the entry, by the Edge Function, or come back with it.
create or replace function public.photo_file_binned(name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.photos p
                 join public.job_bin b on b.user_id = p.user_id and b.id = p.session_id
                 where b.restored_at is null and b.gone_at is null
                   and p.storage_path in (name, regexp_replace(name, '_t\.jpg$', '.jpg')))
$$;
revoke all on function public.photo_file_binned(text) from public, anon;
grant execute on function public.photo_file_binned(text) to authenticated;
drop policy if exists "photo files in Recently deleted" on storage.objects;
create policy "photo files in Recently deleted" on storage.objects
  as restrictive for delete to authenticated
  using (bucket_id <> 'photos' or not (select public.photo_file_binned(name)));

-- ---------------------------------------------------------------- the list
-- Everything in Recently deleted that the caller may restore (the Owner of its
-- business). Newest first; at most 500.
create or replace function public.bin_list()
returns table (n bigint, user_id uuid, id text, org_id uuid, org_name text,
               site text, name text, job_date text, engineer text,
               items integer, fails integer, photos integer, cert_no text, locked boolean,
               binned_at timestamptz, binned_name text, binned_role text, by_you boolean,
               purge_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.n, b.user_id, b.id, b.org_id, coalesce(o.name, ''),
         coalesce(b.doc ->> 'site', ''), coalesce(b.doc ->> 'name', ''), coalesce(b.doc ->> 'date', ''),
         coalesce(nullif(btrim(m.name), ''), nullif(b.doc ->> 'engineer', ''), split_part(u.email, '@', 1), ''),
         public.job_item_count(b.doc),
         (select count(*)::integer from jsonb_array_elements(case when jsonb_typeof(b.doc -> 'items') = 'array' then b.doc -> 'items' else '[]'::jsonb end) e
           where e ->> 'result' = 'fail'),
         jsonb_array_length(b.photos), nullif(b.doc ->> 'certNo', ''), (b.doc -> 'locked') = 'true'::jsonb,
         b.binned_at, b.binned_name, b.binned_role, b.binned_by is not distinct from auth.uid(), b.purge_at
  from public.job_bin b
  left join public.organisations o on o.id = b.org_id
  left join public.memberships m on m.org_id = b.org_id and m.user_id = b.user_id
  left join auth.users u on u.id = b.user_id
  where b.restored_at is null and b.gone_at is null and auth.uid() is not null
    and public._bin_mine(b.org_id)
  order by b.binned_at desc, b.n desc
  limit 500
$$;
revoke all on function public.bin_list() from public, anon;
grant execute on function public.bin_list() to authenticated;

-- ---------------------------------------------------------------- restore (10A)
--   patgo_bin_signed_out / patgo_bin_gone (not in Recently deleted now) /
--   patgo_bin_not_allowed (not the Owner of its business)
-- The entry is closed FIRST, so bin_catch / bin_catch_photo let the rows back.
create or replace function public.bin_restore(entry bigint)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  b record;
  nm text; rl text;
begin
  if me is null then raise exception 'patgo_bin_signed_out'; end if;
  select x.* into b from public.job_bin x where x.n = entry for update;
  if not found or b.restored_at is not null or b.gone_at is not null or b.doc is null then
    raise exception 'patgo_bin_gone';
  end if;
  if not public._bin_mine(b.org_id) then raise exception 'patgo_bin_not_allowed'; end if;
  select w.nm, w.rl into nm, rl from public._bin_who(b.org_id) w;
  update public.job_bin x set restored_at = now(), restored_by = me, restored_name = left(coalesce(nm, 'Someone'), 80)
    where x.n = entry;
  update public.sessions x set doc = b.doc, fp = b.fp, deleted = false,
         last_modified = coalesce(b.last_modified, now())
    where x.user_id = b.user_id and x.id = b.id;
  update public.photos p set deleted = false, last_modified = now()
    where p.user_id = b.user_id and p.session_id = b.id
      and p.id in (select e ->> 'id' from jsonb_array_elements(b.photos) e);
  return jsonb_build_object('user', b.user_id, 'id', b.id);
end;
$$;
revoke all on function public.bin_restore(bigint) from public, anon;
grant execute on function public.bin_restore(bigint) to authenticated;

-- ---------------------------------------------------------------- gone for good
-- The entry's job is emptied (its trail line is kept), its photo files listed for
-- the Edge Function; the job and photo rows stay as the deleted markers phones read.
create or replace function public._bin_empty(entry bigint, who uuid)
returns void language sql volatile security definer set search_path = '' as $$
  update public.job_bin b
     set doc = null, fp = null, gone_at = now(), gone_by = who,
         files_left = jsonb_array_length(b.photos) > 0
   where b.n = entry and b.restored_at is null and b.gone_at is null
$$;
revoke all on function public._bin_empty(bigint, uuid) from public, anon, authenticated;

-- Ask the Edge Function to delete what is waiting (only if it is set up).
create or replace function public.bin_files_nudge()
returns text language plpgsql security definer set search_path = '' as $$
declare url text;
begin
  select s.files_url into url from public.bin_settings s where s.id = 1;
  if coalesce(url, '') !~ '^https://[^/]+/functions/v1/bin-files$' then return 'no address'; end if;
  if not exists (select 1 from public.job_bin b where b.files_left) then return 'nothing waiting'; end if;
  perform net.http_post(url := url, body := '{"from":"database"}'::jsonb,
                        headers := '{"content-type":"application/json"}'::jsonb);
  return 'asked';
end;
$$;
revoke all on function public.bin_files_nudge() from public, anon, authenticated;

-- 11A: the Owner deletes it for good now.
--   patgo_bin_signed_out / patgo_bin_gone / patgo_bin_not_allowed
create or replace function public.bin_forget(entry bigint)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  b record;
begin
  if me is null then raise exception 'patgo_bin_signed_out'; end if;
  select x.* into b from public.job_bin x where x.n = entry for update;
  if not found or b.restored_at is not null or b.gone_at is not null then raise exception 'patgo_bin_gone'; end if;
  if not public._bin_mine(b.org_id) then raise exception 'patgo_bin_not_allowed'; end if;
  perform public._bin_empty(entry, me);
  begin
    perform public.bin_files_nudge();
  exception when others then null;   -- the hourly run asks again
  end;
  return jsonb_build_object('photos', jsonb_array_length(b.photos));
end;
$$;
revoke all on function public.bin_forget(bigint) from public, anon;
grant execute on function public.bin_forget(bigint) to authenticated;

-- After 30 days, by itself (hourly). Returns how many were emptied.
create or replace function public.bin_purge()
returns integer language plpgsql security definer set search_path = '' as $$
declare k bigint; c integer := 0;
begin
  for k in select b.n from public.job_bin b
           where b.restored_at is null and b.gone_at is null and b.purge_at <= now()
           order by b.n limit 1000 loop
    perform public._bin_empty(k, null);
    c := c + 1;
  end loop;
  begin
    perform public.bin_files_nudge();
  exception when others then null;
  end;
  return c;
end;
$$;
revoke all on function public.bin_purge() from public, anon, authenticated;
select cron.schedule('patgo-bin', '23 * * * *', 'select public.bin_purge()');

-- The Edge Function's two calls (service key only — never the app).
create or replace function public.bin_files_due()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('n', x.n, 'paths', x.paths) order by x.n), '[]'::jsonb)
  from (select b.n, (select coalesce(jsonb_agg(p), '[]'::jsonb) from (
               select e ->> 'path' as p from jsonb_array_elements(b.photos) e where coalesce(e ->> 'path', '') <> ''
               union all
               select regexp_replace(e ->> 'path', '\.jpg$', '_t.jpg') from jsonb_array_elements(b.photos) e
                 where coalesce(e ->> 'path', '') ~ '\.jpg$') q) as paths
        from public.job_bin b where b.files_left order by b.n limit 50) x
$$;
revoke all on function public.bin_files_due() from public, anon, authenticated;
grant execute on function public.bin_files_due() to service_role;

create or replace function public.bin_files_done(entries bigint[])
returns integer language sql volatile security definer set search_path = '' as $$
  with d as (update public.job_bin b set files_left = false
             where b.n = any(entries) and b.files_left returning 1)
  select count(*)::integer from d
$$;
revoke all on function public.bin_files_done(bigint[]) from public, anon, authenticated;
grant execute on function public.bin_files_done(bigint[]) to service_role;
-- ================================================================ end V172

-- ================================================================ self-checks
drop table if exists pg_temp._v172_result;
create temp table _v172_result (n int, check_name text, result text);
insert into _v172_result
select 1, 'the app may call the four; nobody signed out may',
  case when has_function_privilege('authenticated', 'public.bin_job(uuid, text, uuid)', 'execute')
        and has_function_privilege('authenticated', 'public.bin_list()', 'execute')
        and has_function_privilege('authenticated', 'public.bin_restore(bigint)', 'execute')
        and has_function_privilege('authenticated', 'public.bin_forget(bigint)', 'execute')
        and not has_function_privilege('anon', 'public.bin_job(uuid, text, uuid)', 'execute')
        and not has_function_privilege('anon', 'public.bin_restore(bigint)', 'execute')
        and not has_function_privilege('anon', 'public.bin_forget(bigint)', 'execute')
        and not has_function_privilege('authenticated', 'public.bin_files_due()', 'execute')
        and not has_function_privilege('authenticated', 'public.bin_files_done(bigint[])', 'execute')
        and not has_function_privilege('authenticated', 'public.bin_purge()', 'execute')
       then 'PASS' else 'FAIL' end
union all
select 2, 'Recently deleted can''t be read or changed directly by anyone signed in',
  case when (select relrowsecurity from pg_class where oid = 'public.job_bin'::regclass)
        and not has_table_privilege('authenticated', 'public.job_bin', 'select')
        and not has_table_privilege('authenticated', 'public.job_bin', 'update')
        and not has_table_privilege('anon', 'public.job_bin', 'select')
       then 'PASS' else 'FAIL' end
union all
select 3, 'someone else''s job: the Owner only; your own: the cloud''s delete rule',
  case when (select prosrc from pg_proc where oid = 'public.bin_job(uuid, text, uuid)'::regprocedure)
            like '%coalesce(public.my_role(s.org_id), '''') <> ''owner''%'
        and (select prosrc from pg_proc where oid = 'public.bin_job(uuid, text, uuid)'::regprocedure)
            like '%not public.can_wipe(s.org_id)%'
       then 'PASS' else 'FAIL' end
union all
select 4, 'a push can''t bring a deleted job back (the two catches are in)',
  case when exists (select 1 from pg_trigger where tgname = 'bin_catch' and tgrelid = 'public.sessions'::regclass)
        and exists (select 1 from pg_trigger where tgname = 'bin_catch_photo' and tgrelid = 'public.photos'::regclass)
       then 'PASS' else 'FAIL' end
union all
select 5, 'its photo files can''t be deleted while it waits',
  case when exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                    and policyname = 'photo files in Recently deleted' and permissive = 'RESTRICTIVE')
       then 'PASS' else 'FAIL' end
union all
select 6, 'with nobody signed in it changes nothing', 'PASS';   -- proved below

-- K6, properly: called with nobody signed in, each refuses before reading anything.
do $k6$
begin
  begin
    perform public.bin_job(gen_random_uuid(), 'x', null);
    update _v172_result set result = 'FAIL' where n = 6;
  exception when others then
    if sqlerrm <> 'patgo_bin_signed_out' then update _v172_result set result = 'FAIL' where n = 6; end if;
  end;
  begin
    perform public.bin_restore(0);
    update _v172_result set result = 'FAIL' where n = 6;
  exception when others then
    if sqlerrm <> 'patgo_bin_signed_out' then update _v172_result set result = 'FAIL' where n = 6; end if;
  end;
  begin
    perform public.bin_forget(0);
    update _v172_result set result = 'FAIL' where n = 6;
  exception when others then
    if sqlerrm <> 'patgo_bin_signed_out' then update _v172_result set result = 'FAIL' where n = 6; end if;
  end;
end
$k6$;

select 'K' || n as check, check_name, result from _v172_result order by n;
