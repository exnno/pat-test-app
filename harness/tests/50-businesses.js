/* Standing test — V113: businesses in the database (Stage 11 part 2) + release
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS GUARDS. V113 is a database release: supabase/v113-organisations.sql
   (existing projects), the same statements in schema.sql (new projects), and
   new checks in isolation-test.sql. A JavaScript harness cannot run a Postgres
   rule, so these groups pin the TEXT of the decisions that matter most — each
   one a line whose loss would be silent until a team used it:
     50a  the migration: business stamp filled by the database and never moved
          on update (2A); several businesses per person, one default (3C);
          reads by role (6A); a login with work can't be deleted (10A), its
          profile and memberships can (9A); the delete guard on jobs and
          photos for Owner / Team leader / Office (12A); stamping paused the
          change-time trigger (no phone re-reads everything).
     50b  schema.sql carries every V113 line, and a new project gets the
          no-cascade tables directly.
     50c  isolation-test.sql: the role checks, B taken out of A's business
          again, and the login-delete check always undone.
     50d  the phone never sends a business stamp (2A — every app version keeps
          working because no phone knows the column exists).
     50e  (retired V114: the release pins moved to 51g.)

   ⚠ WHAT THIS FILE CANNOT PROVE. That the rules WORK. That is the job of the
   SQL files' own checks (O1–O9, run once) and isolation-test.sql (every
   release, 9a–16b). At V113 both were run against a real Postgres 16 with a
   stand-in for Supabase's auth and storage schemas, and twelve deliberately
   broken copies of the migration were each caught by them (handoff). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp, scriptOrderFromIndex } = require('../load');

const read = (...p) => fs.readFileSync(path.join(APP_DIR, ...p), 'utf8');
// Non-comment, non-blank lines, trimmed of trailing space.
const codeLines = (s) => s.split('\n').map(l => l.replace(/\s+$/, ''))
  .filter(l => l.trim() && !l.trim().startsWith('--'));

module.exports = async function () {
  const mig = read('supabase', 'v113-organisations.sql');
  const schema = read('supabase', 'schema.sql');
  const iso = read('supabase', 'isolation-test.sql');

  /* ------------------------------------------------------------------ 50a */
  await t.group('50a — v113-organisations.sql: the decisions', () => {
    // 4A / 3C: businesses and memberships; (org, person), never one per person.
    t.includes(mig, 'create table if not exists public.organisations (', 'businesses table');
    t.includes(mig, "check (role in ('owner','team_leader','engineer','office'))", 'the four roles');
    t.includes(mig, '  primary key (org_id, user_id)\n', 'membership keyed (business, person) — several per person (3C)');
    t.includes(mig, 'create unique index if not exists memberships_one_default on public.memberships (user_id) where is_default;',
      'at most ONE default business per person — not one business');
    // 9A: memberships go with the login.
    t.includes(mig, '  user_id     uuid not null references auth.users(id) on delete cascade,\n  role ',
      'a membership goes with its login (9A)');
    // 2A: the database stamps; an update never moves it.
    t.includes(mig, "create trigger org_stamp before insert or update on public.%I", 'stamp trigger on insert AND update');
    t.includes(mig, "foreach t in array array['sessions','records','photos'] loop\n    execute format('drop trigger if exists org_stamp",
      '…on jobs, records and photos');
    t.includes(mig, '  elsif old.org_id is not null then\n    new.org_id := old.org_id;\n',
      'an update keeps the stamp (a phone upsert never sends it)');
    t.includes(mig, 'new.org_id := public.default_org(new.user_id);', 'a new row gets the writer\'s default business');
    // Stamping existing rows is not a change.
    t.includes(mig, "execute format('alter table public.%I disable trigger touch_updated_at', t);",
      'stamping pauses the change-time trigger');
    t.includes(mig, "execute format('alter table public.%I enable trigger touch_updated_at', t);", '…and restores it');
    // 6A: who reads the whole business.
    t.includes(mig, "  select coalesce(public.my_role(o) in ('owner','team_leader','office'), false)\n$$;\n\n-- 12A",
      'Owner / Team leader / Office read the business; an Engineer does not');
    t.includes(mig, 'using ((user_id = (select auth.uid()) and public.my_role(org_id) is not null)',
      'your own rows only while you belong to their business');
    // 12A: the delete guard.
    t.includes(mig, "      or coalesce(public.my_role(o) in ('owner','team_leader','office'), false)\n      or (public.my_role(o) is not null and public.org_size(o) = 1)",
      'deleting from the cloud: Owner / Team leader / Office, or a business of one');
    t.includes(mig, "foreach t in array array['sessions','photos'] loop\n    execute format('drop trigger if exists wipe_guard",
      'the guard is on jobs and photos');
    // 10A: no cascade from a login to its work.
    t.includes(mig, "             and c.confdeltype <> 'r' loop", 'every cascading key is replaced…');
    t.includes(mig, "foreign key (user_id) references auth.users(id) on delete restrict'", '…by restrict');
    // Its own checks.
    for (const c of ['O1', 'O2', 'O3', 'O4', 'O5', 'O6', 'O7', 'O8', 'O9']) t.includes(mig, `'${c}|`, `self-check ${c}`);
  });

  /* ------------------------------------------------------------------ 50b */
  await t.group('50b — schema.sql: a new project gets the same', () => {
    const a = mig.indexOf('-- ------------------------------------------------------------ businesses');
    const b = mig.indexOf('-- ------------------------------------------------------------ self-check');
    t.ok(a > 0 && b > a, 'the V113 statements are found in the migration');
    const have = new Set(codeLines(schema));
    const want = codeLines(mig.slice(a, b));
    const missing = want.filter(l => !have.has(l));
    t.ok(want.length > 150, `the V113 part is read (${want.length} lines) — not an empty slice`);
    t.eq(missing.length, 0, 'every V113 line is in schema.sql' + (missing.length ? ' — first missing: ' + missing[0].trim() : ''));
    for (const tb of ['sessions', 'records', 'photos']) {
      const i = schema.indexOf(`create table if not exists public.${tb} (`);
      const line = schema.slice(i, schema.indexOf('\n', schema.indexOf('user_id', i)));
      t.includes(line, 'on delete restrict', `a new project's ${tb} can't be deleted with the login`);
    }
    t.excludes(schema, 'create policy "own sessions"', 'the pre-V113 own-rows rule is gone');
    t.excludes(schema, 'create policy "own photo files"', '…and the old photo-file rule');
    t.includes(schema, 'create trigger on_auth_user_created', 'sign-ups still make a profile (and now a business)');
  });

  /* ------------------------------------------------------------------ 50c */
  await t.group('50c — isolation-test.sql: the business checks', () => {
    for (const c of ['9a', '9b', '9c', '13a', '13b', '13c', '13d', '14a', '14b', '14c', '15a', '15b', '15c', '16a', '16b'])
      t.includes(iso, `['${c}|`, `check ${c}`);
    t.includes(iso, "foreach r in array array['engineer','office','team_leader'] loop", 'B tried as Engineer, Office and Team leader');
    for (const l of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'])
      t.includes(iso, `g || '${l}|`, `each role checks ${l}`);
    t.includes(iso, "    delete from public.memberships where org_id = org_a and user_id = b;\n",
      'B is taken out of A\'s business again (nothing left behind)');
    t.includes(iso, "      delete from auth.users where id = b;\n      raise exception 'iso-undo';",
      'the login-delete check is always undone — B is never really deleted');
    t.includes(iso, "'organisations','memberships')\n    and not c.relrowsecurity", 'check 0 covers the two new tables');
  });

  /* ------------------------------------------------------------------ 50d */
  await t.group('50d — no phone ever sends the business stamp (2A)', () => {
    const files = scriptOrderFromIndex().filter(f => !/\.min\.js$|^supabase\.umd\.js$|^pdfjs/.test(f));
    t.ok(files.length > 25 && files.includes('sync.js'), `the app's own files are read (${files.length})`);
    const hits = files.filter(f => /org_id/.test(read(f)));
    t.eq(hits.length, 0, 'no app file mentions org_id' + (hits.length ? ' — ' + hits.join(', ') : ''));
  });

  /* ------------------------------------------------------------------ 50e */
  // 50e (V113's release pins) retired at V114 — moved to 51g.
};
