/* Standing test — V133: the clean-up job, part 1 (old delete markers) + the phone report
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked (17 Oct, Peter): 1A a database job, set up by
   one SQL file (supabase/v133-cleanup.sql), no server function. 2A report-only
   first: each run writes a line to cleanup_runs and clears nothing. 3A photo
   and record markers clear after 12 months; JOB markers are kept for good.
   4A phones report their version: a private id per phone + APP_VERSION, and
   the job holds back an account while any phone signed in to it has not
   reported V133+. 5A weekly, Sunday 02:17 UTC. 6A results in the dashboard;
   About line only, no What's new.

     71a  syncPhoneDue (pure): daily for one version and account; at once on a
          new version or another account; an hour's wait after a failure; a
          clock wound back makes it due.
     71b  a reading run reports once: phones, keyed on (user_id, phone_id),
          exactly three fields; the id is made once and kept; the next run the
          same day sends nothing; another account reports at once.
     71c  fail-soft: a refused report never fails or changes the run; it waits
          an hour, then tries again.
     71d  "Re-send all jobs" (a run that doesn't read) reports nothing.
     71e  the id is never in a backup or a setup file; Reset: 'account'.
     71g  the SQL: report-only, the 12-month floor, job markers kept, the
          schedule, nobody but the job's owner can run it; schema.sql carries
          every V133 line; the isolation test has 17a–17g.
     71f  release: V133, cache, What's new stays V132, About, Privacy.

   Whether the SQL WORKS is proved by the file's own checks (C1–C7) and
   isolation 17a–17g, run in the Supabase SQL editor — at V133 also against a
   local Postgres 16 stand-in, with ten broken copies each caught. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { tick, freshApp } = require('../fixture');

const LIB = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const UID = '11111111-1111-1111-1111-111111111111';
const UID2 = '22222222-2222-2222-2222-222222222222';
const J = JSON.stringify;
const HOUR = 3600000;
const DAY = 86400000;
const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');

function storedSession(uid) {
  const life = 3600;
  const exp = Math.floor(Date.now() / 1000) + life;
  return JSON.stringify({
    access_token: 'ZZACCESS', token_type: 'bearer', expires_in: life,
    expires_at: exp, refresh_token: 'ZZREFRESH',
    user: { id: uid || UID, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' },
  });
}

const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });

// A server with nothing in it, plus a phones table that can refuse.
function fakeServer() {
  const calls = [];
  const srv = { calls, phones: [], failPhones: 0 };
  srv.fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    let body = null;
    if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    calls.push({ url: u, method, body });
    if (u.includes('/rest/v1/phones')) {
      if (srv.failPhones > 0) { srv.failPhones--; return json({ message: 'ZZ relation "public.phones" does not exist' }, 404); }
      for (const row of (Array.isArray(body) ? body : [body])) {
        const i = srv.phones.findIndex(r => r.user_id === row.user_id && r.phone_id === row.phone_id);
        if (i === -1) srv.phones.push(row); else srv.phones[i] = row;
      }
      return new Response(null, { status: 201 });
    }
    if (u.includes('/rest/v1/profiles')) return json([{ plan: 'trial', trial_ends_at: null }]);
    if (u.includes('/rest/v1/')) return method === 'GET' ? json([]) : new Response(null, { status: 201 });
    if (u.includes('/storage/v1/')) return json([]);
    return json({ message: 'unexpected ' + u }, 404);
  };
  srv.reports = () => calls.filter(c => c.url.includes('/rest/v1/phones'));
  return srv;
}

async function signedIn(o = {}) {
  const ls = Object.assign({ 'patgo:cloudAuth:test': storedSession(o.uid) }, o.localStorage || {});
  const app = bootApp({ localStorage: ls, navigator: { onLine: false } });
  app.sandbox.localStorage.setItem('pat:cloudUnlocked', '1');
  app.fn('load')();
  app.state = () => app.refresh('state').state;
  app.stopTimer = () => app.run('if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }');
  const srv = o.srv || fakeServer();
  const sb = app.sandbox;
  for (const k of ['Headers', 'Request', 'Response', 'AbortController', 'TextEncoder',
                   'TextDecoder', 'URLSearchParams', 'URL', 'atob', 'btoa', 'Blob']) sb[k] = globalThis[k];
  if (!sb.crypto) sb.crypto = globalThis.crypto;
  sb.WebSocket = class {};
  sb.fetch = srv.fetchImpl;
  app.run(LIB);
  app.run('navigator.onLine = true');
  app.srv = srv;
  app.stopTimer();
  await tick(5);
  for (let k = 0; k < 100 && app.run("(state.cloud && state.cloud.status) || ''") !== 'signed-in'; k++) await tick(10);
  app.stopTimer();
  return app;
}

async function run(app, o = { pull: true }) { const r = await app.fn('syncPush')(o); app.stopTimer(); await tick(30); return r; }
const phone = (app) => JSON.parse(app.storage.getItem('pat:phone') || 'null');
const setPhone = (app, p) => app.storage.setItem('pat:phone', J(p));

module.exports = async function () {
  /* ------------------------------------------------------------------ 71a */
  await t.group('71a — when a phone reports: daily, at once on a new version or account, an hour after a failure', () => {
    const app = freshApp();
    const V = app.run('APP_VERSION');
    const now = Date.parse('2026-10-17T12:00:00.000Z');
    const due = (p, uid, n) => app.fn('syncPhoneDue')(p, uid || 'u1', n === undefined ? now : n);
    t.eq(app.run('PHONE_REPORT_MS'), DAY, 'at most daily');
    t.eq(app.run('PHONE_RETRY_MS'), HOUR, 'a failure waits an hour');
    t.ok(due({}), 'never reported → due');
    t.notOk(due({ v: V, u: 'u1', at: now - 2 * HOUR }), 'reported this version, this account, today → not due');
    t.ok(due({ v: V, u: 'u1', at: now - DAY - 1 }), 'more than a day ago → due');
    t.ok(due({ v: 'V132', u: 'u1', at: now - HOUR }), 'an update → due at once');
    t.ok(due({ v: V, u: 'u2', at: now - HOUR }), 'another account → due at once');
    t.notOk(due({ tried: now - 10 * 60000 }), 'failed ten minutes ago → not yet');
    t.ok(due({ tried: now - HOUR - 1 }), 'failed over an hour ago → again');
    t.notOk(due({ v: V, u: 'u1', at: now - 2 * DAY, tried: now - 5 * 60000 }), 'stale and a fresh failure → waits the hour');
    t.notOk(due({ v: V, u: 'u1', at: now - 5 * 60000, tried: now - 6 * 60000 }), 'a try that succeeded is not a failure');
    t.ok(due({ v: V, u: 'u1', at: now + DAY }), 'a clock wound back → due, never stuck');
    t.ok(due({ tried: now + HOUR }), 'a failure "in the future" → due');
  });

  /* ------------------------------------------------------------------ 71b */
  await t.group('71b — a reading run reports once: the phones table, three fields, one id kept', async () => {
    const app = await signedIn();
    t.eq(phone(app), null, 'nothing before the first sync');
    await run(app);
    const reps = app.srv.reports();
    t.eq(reps.length, 1, 'one report');
    t.eq(reps[0].method, 'POST', 'an upsert');
    t.includes(reps[0].url, 'on_conflict=user_id%2Cphone_id', 'keyed on (user_id, phone_id)');
    const row = Array.isArray(reps[0].body) ? reps[0].body[0] : reps[0].body;
    t.eq(Object.keys(row).sort().join(','), 'app_version,phone_id,user_id', 'exactly three fields — the database adds the rest');
    t.eq(row.user_id, UID, 'names the account');
    t.eq(row.app_version, 'V133', 'this version');
    const p = phone(app);
    t.eq(row.phone_id, p.id, 'the stored private id');
    t.ok(/^[0-9a-f-]{16,64}$/i.test(p.id), 'an id the database accepts (8–64 characters)');
    t.eq(p.v, 'V133', 'remembers the version reported');
    t.eq(p.u, UID, '…and the account');
    t.ok(typeof p.at === 'number' && Math.abs(Date.now() - p.at) < 60000, '…and when');

    await run(app);
    t.eq(app.srv.reports().length, 1, 'the next run the same day sends nothing');
    t.eq(phone(app).id, p.id, 'the id is kept');

    setPhone(app, Object.assign(phone(app), { at: Date.now() - DAY - 1000 }));
    await run(app);
    t.eq(app.srv.reports().length, 2, 'a day later it reports again');
    const row2 = app.srv.reports()[1].body;
    t.eq((Array.isArray(row2) ? row2[0] : row2).phone_id, p.id, '…with the same id');

    setPhone(app, Object.assign(phone(app), { v: 'V132' }));
    await run(app);
    t.eq(app.srv.reports().length, 3, 'after an update it reports at once');

    // Another account on this phone (signed out, someone else signed in).
    const b = await signedIn({ uid: UID2, localStorage: { 'pat:phone': J(phone(app)) } });
    await run(b);
    const rb = b.srv.reports();
    t.eq(rb.length, 1, 'another account reports at once');
    t.eq((Array.isArray(rb[0].body) ? rb[0].body[0] : rb[0].body).user_id, UID2, '…as itself');
    t.eq(phone(b).id, p.id, 'still the same phone');
  });

  /* ------------------------------------------------------------------ 71c */
  await t.group('71c — fail-soft: a refused report never fails the run; it waits an hour, then tries again', async () => {
    const ok = await signedIn();
    const good = await run(ok);
    const app = await signedIn();
    app.srv.failPhones = 1;
    let threw = null;
    let r;
    try { r = await run(app); } catch (e) { threw = e; }
    t.eq(threw, null, 'the run does not throw');
    t.eq(J(r), J(good), 'the run returns what it would have with the report working');
    t.eq(app.run("(state.sync && state.sync.error) || ''"), '', 'no error on the Sync page');
    const p = phone(app);
    t.ok(typeof p.tried === 'number', 'the try is remembered');
    t.eq(p.at, undefined, 'not marked as reported');
    await run(app);
    t.eq(app.srv.reports().length, 1, 'within the hour: not tried again');
    setPhone(app, Object.assign(p, { tried: Date.now() - HOUR - 1000 }));
    await run(app);
    t.eq(app.srv.reports().length, 2, 'after the hour: tried again');
    t.eq(phone(app).v, 'V133', '…and this time it went');
  });

  /* ------------------------------------------------------------------ 71d */
  await t.group('71d — "Re-send all jobs" (a run that does not read) reports nothing', async () => {
    const app = await signedIn();
    await run(app, { manual: true, force: true });
    t.eq(app.srv.reports().length, 0, 'no report on a send-only run');
    await run(app, { pull: true });
    t.eq(app.srv.reports().length, 1, 'the next reading run does');
  });

  /* ------------------------------------------------------------------ 71e */
  await t.group('71e — the id is never in a backup or a setup file; Reset: account', async () => {
    const app = await signedIn();
    await run(app);
    const id = phone(app).id;
    t.ok(id && id.length >= 16, 'an id exists');
    const backup = J(app.fn('buildBackup')());
    t.excludes(backup, id, 'not in a backup');
    const setup = J(app.fn('buildSetupBundle')('ZZ', { presets: true, failReasons: true, descriptions: true, report: true, engineer: true, instruments: true, csv: true, multipick: true, readings: true, scanner: true, theme: true }));
    t.excludes(setup, id, 'not in a setup file');
    t.includes(read('reset.js'), "['PHONE_KEY', PHONE_KEY, 'account']", 'Reset this phone: goes with the sign-in');
    t.eq(app.run('PHONE_KEY'), 'pat:phone', 'the key');
  });

  /* ------------------------------------------------------------------ 71g */
  await t.group('71g — the SQL: report-only, the 12-month floor, job markers kept, the schedule, closed to the app', () => {
    const sql = read('supabase/v133-cleanup.sql');
    const schema = read('supabase/schema.sql');
    const iso = read('supabase/isolation-test.sql');
    t.includes(sql, "mode         text not null default 'report' check (mode in ('report','clear'))", '2A: report-only to begin with');
    t.includes(sql, "insert into public.cleanup_settings (id) values (1) on conflict (id) do nothing;", 'running the file again keeps the mode');
    t.includes(sql, 'marker_days  integer not null default 365 check (marker_days >= 365)', '3A: 12 months, never fewer');
    t.eq(app0().run('SYNC_MARKER_DAYS'), 365, '…the same age the phones are built around');
    t.includes(sql, 'min_version  integer not null default 133 check (min_version >= 133)', '4A: V133 or later');
    t.includes(sql, 'phone_days   integer not null default 730', '4A: phones used in the last 2 years');
    const fn = sql.slice(sql.indexOf('create or replace function public.run_cleanup'), sql.indexOf('revoke all on function public.run_cleanup'));
    t.ok(fn.length > 500, 'the job found');
    t.notOk(/delete\s+from\s+public\.sessions/i.test(fn), '3A: the job never deletes jobs');
    t.ok(/delete\s+from\s+public\.records/i.test(fn) && /delete\s+from\s+public\.photos/i.test(fn), 'records and photos markers may go');
    t.includes(fn, 'clearing := (s.mode = \'clear\') and not check_only;', 'clears only in clear mode, never on a check');
    t.includes(fn, "and not exists (select 1 from storage.objects o", 'a photo marker with its file still there stays');
    t.includes(fn, 'left join public.phones p on p.user_id = ses.user_id and p.auth_session = ses.id', '4A: matched by the sign-in each report came on');
    t.includes(fn, 'and (p.user_id is null or coalesce(p.version_num, 0) < s.min_version)', '4A: never reported, or too old → held');
    t.includes(sql, "revoke all on function public.run_cleanup(boolean) from public, anon, authenticated;", 'nobody runs the job from the app');
    t.includes(sql, "revoke all on public.cleanup_runs from anon, authenticated;", 'the log is closed to the app');
    t.includes(sql, "select cron.schedule('patgo-cleanup', '17 2 * * 0', 'select public.run_cleanup()');", '5A: Sundays 02:17 UTC');
    t.includes(sql, "new.auth_session := sid::uuid;", 'the sign-in comes from the request, never the phone');
    t.includes(sql, "new.version_num := public.app_version_num(new.app_version);", 'the version number is worked out by the database');
    // schema.sql: a new project gets every V133 statement line.
    const body = sql.slice(sql.indexOf('-- ------------------------------------------------------------ the scheduler'),
                           sql.indexOf('-- ------------------------------------------------------------ self-check'));
    const missing = body.split('\n').filter(l => l.trim() && !schema.includes(l));
    t.eq(missing.length, 0, 'schema.sql carries every V133 line' + (missing.length ? ' — first missing: ' + missing[0].trim() : ''));
    for (const c of ['17a', '17b', '17c', '17d', '17e', '17f', '17g']) t.includes(iso, "'" + c + '|', 'isolation ' + c);
    t.includes(iso, "17a|phones|FAIL|run supabase/v133-cleanup.sql first", 'names the file when it has not been run');
  });

  /* ------------------------------------------------------------------ 71f */
  await t.group('71f — release: V133, cache, What’s new stays V132, About, Privacy', () => {
    const app = app0();
    t.eq(app.run('APP_VERSION'), 'V133', 'APP_VERSION V133');
    t.eq(app.run('WELCOME_VERSION'), 'V132', 'What’s new not rolled (6A)');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v133';", 'cache key pat-v133');
    const core = read('render-core.js');
    const open = core.indexOf('<ul class="welcome-list sheet-scroll">');
    const sheet = core.slice(open, core.indexOf('</ul>', open));
    t.eq((sheet.match(/<li>/g) || []).length, 1, 'V132’s one line still');
    t.includes(sheet, '<li><strong>Long company names fit.</strong>', '…long company names');
    const help = read('render-help.js');
    const a = help.indexOf('<p><strong>V133</strong>'), b = help.indexOf('<p><strong>V132</strong>'), c = help.indexOf('<p><strong>V131</strong>');
    t.ok(a > -1 && b > a && c > b, 'About: V133, V132, V131');
    t.excludes(help, '<p><strong>V130</strong>', 'V130 rolled off');
    t.excludes(help, 'Tidying up behind the scenes, and the Privacy note brought up to date.', 'V130’s line gone with it');
    t.includes(help, 'Behind the scenes: a signed-in phone now tells the cloud which version of PATGo it is running', 'About: V133’s line');
    t.includes(help, 'A long company name or address line now wraps neatly at the top of the certificate', 'About: V132’s line still there');
    t.includes(help, 'Certificates count as exported: a job whose certificate was made after locking', 'About: V131’s line still there');
    t.includes(help, 'A signed-in phone also tells the cloud which version of the app it is running.', 'Privacy says so');
  });
};

let _app0 = null;
function app0() { if (!_app0) _app0 = freshApp(); return _app0; }
