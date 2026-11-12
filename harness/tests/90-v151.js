/* Standing test — V151: the minimum app version (Stage 16, Teams v1)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   Peter, 6 Nov — 0A (the minimum version before invites) 1A (the phone checks
   itself; the database refuses nothing by version) 2A (Update now) 3A (team /
   solo words) 4A (a raise for one account is the test aid). What these pin:
     90a  Reading the minimum: before anything else in a run; at most hourly,
          but at once after a start or a return to the front; a failed read
          keeps what was known (never known = no minimum); per account.
     90b  Below it: a run reads and sends nothing at all, and says so on the
          Sync page; the on-request reads and writes (the cloud tab, bring
          back, the Business page) touch nothing; a failed read never starts it
          again; a lower minimum (or another account) syncs as before.
     90c  The line: the Jobs list (both tabs) and the Sync page, team and solo
          words, nothing when the phone is new enough; Update now puts a
          waiting update in at once, else asks for one and puts it in the
          moment it arrives — only within SYNC_VERSION_LOOK_MS, never under a
          sheet.
     90d  Plumbing: the action is wired; MIN_VERSION_KEY follows the account
          (reset, takeover), is never in a backup; garbage reads as nothing.
     90e  Carried (V152: its release checks — V151, cache, About, What's
          new — moved to 91e).
     90f  The SQL's text: the setting, the raise, what a phone may call, the
          invite check counting old and unreported phones; schema.sql ends with
          exactly the V151 statements; self-checks V1–V4; isolation 22a–22e;
          the test aid touches one account.

   ⚠ WHAT THIS FILE CANNOT PROVE: that the database refuses what it should.
   That is supabase/v151-min-version.sql's own checks (V1–V4) and
   isolation-test.sql 22a–22e — run at V151 against a local Postgres 16
   stand-in (an upgraded project and a new one), eight broken copies caught. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { freshApp, tick } = require('../fixture');

const LIB  = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;
const UID = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const AUTH = 'patgo:cloudAuth:test';
const OWN  = 'aaaaaaaa-0000-4000-8000-000000000001';
const TEAM = 'aaaaaaaa-0000-4000-8000-000000000002';
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const HOUR = 3600000;
// V152: the phone's own version, read from config.js — so 'meets the minimum'
// (N) and 'too old' (N + 1) stay true in every later release.
const N = Number(/const APP_VERSION = 'V(\d+)/.exec(read('config.js'))[1]);
const TABLES = /\/rest\/v1\/(sessions|records|photos|phones|session_photo_counts)\b|\/rest\/v1\/rpc\/(my_businesses|my_job_moves|move_job)\b|\/storage\/v1\//;

function storedSession() {
  const life = 3600;
  return JSON.stringify({
    access_token: 'ZZACCESS151', token_type: 'bearer', expires_in: life,
    expires_at: Math.floor(Date.now() / 1000) + life, refresh_token: 'ZZREFRESH',
    user: { id: UID, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' },
  });
}

// A pretend Supabase. my_min_version answers srv.min (or fails: srv.minFail).
function fakeServer() {
  const calls = [];
  const srv = { calls, min: N, minFail: false };
  srv.fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    let body = null;
    if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    calls.push({ url: u, method, body });
    if (u.endsWith('/rest/v1/rpc/my_min_version')) {
      return srv.minFail ? json({ message: 'Could not find the function public.my_min_version', code: 'PGRST202' }, 404) : json(srv.min);
    }
    if (u.endsWith('/rest/v1/rpc/my_businesses')) return json([{ id: OWN, name: '', role: 'owner', is_default: true, members: 1 }]);
    if (u.endsWith('/rest/v1/rpc/my_job_moves')) return json([]);
    if (u.endsWith('/rest/v1/rpc/my_billing')) return json({ plan: 'comped', role: 'owner', can_manage: true });
    if (u.includes('/rest/v1/')) return method === 'GET' ? json([]) : new Response(null, { status: 201 });
    if (u.includes('/storage/v1/')) return json([]);
    return json({ message: 'unexpected ' + u }, 404);
  };
  srv.rpcs = (name) => calls.filter(c => c.url.endsWith('/rest/v1/rpc/' + name));
  srv.work = () => calls.filter(c => TABLES.test(c.url));
  srv.sends = () => calls.filter(c => c.method !== 'GET' && TABLES.test(c.url));
  srv.firstWork = () => calls.findIndex(c => TABLES.test(c.url));
  return srv;
}

async function signedIn(o = {}) {
  const ls = Object.assign({ [AUTH]: storedSession(), 'pat:cloudUnlocked': '1' }, o.localStorage || {});
  const app = bootApp({ localStorage: ls, navigator: { onLine: false } });
  app.fn('load')();
  app.state = () => app.refresh('state').state;
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
  stopTimer(app);
  for (let k = 0; k < 100 && app.run("(state.cloud && state.cloud.status) || ''") !== 'signed-in'; k++) await tick(10);
  const st = app.state();
  st.welcomeSeen = true;
  st.migrationPrompt = { show: false, name: '', items: [] };
  return app;
}

function stopTimer(app) {
  app.run('if (typeof _syncTimer !== "undefined" && _syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }');
}

function tap(app, action, arg) {
  const el = app.doc.createElement('button');
  el.dataset.action = action;
  if (arg !== undefined) el.dataset.arg = String(arg);
  app.doc.getElementById('app').dispatchEvent({
    type: 'click', target: el, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
  });
}

const fakeWorker = () => { const w = { sent: [], postMessage(msg) { w.sent.push(msg); } }; return w; };
const skipped = (w) => w.sent.filter(m => m && m.type === 'SKIP_WAITING').length;
const minRec = (min, u = UID, at = Date.now()) => JSON.stringify({ u, min, at });

// A phone with one job that has never been sent — so a run that may send, sends.
function withUnsentJob(app) {
  const st = app.state();
  st.sessions.unshift({ id: 'v151-job', name: 'Unsent job', site: 'Depot', date: '2026-11-06', items: [{ id: 'i1', assetNo: '1', itemType: 'Kettle', result: 'pass' }] });
  app.fn('saveSessions')();
  stopTimer(app);
}

module.exports = async function () {

  /* ------------------------------------------------------------------ 90a */
  await t.group('90a — the minimum is read before anything else; hourly, at once after a start or return; a failed read keeps what was known', async () => {
    t.eq(freshApp().run("syncAppVersionNum('V151.1')"), 151, "'V151.1' → 151 (the database's rule)");
    t.eq(freshApp().run("syncAppVersionNum('beta')"), 0, 'not a version → 0');
    t.eq(freshApp().run('syncAppVersionNum()'), N, 'this phone → its own APP_VERSION');

    const app = await signedIn();
    await app.run('syncPull()');
    const first = app.srv.calls.findIndex(c => c.url.endsWith('/rest/v1/rpc/my_min_version'));
    t.ok(first > -1, 'a run reads the minimum');
    t.ok(app.srv.firstWork() > first, '…before any work is read or sent');
    const rec = JSON.parse(app.storage.getItem('pat:minVersion'));
    t.eq(rec.u + ' ' + rec.min, UID + ' ' + N, 'kept: this account, its minimum');
    t.notOk(app.run('syncTooOld()'), 'V151 against 151: not too old');

    const n0 = app.srv.rpcs('my_min_version').length;
    await app.run('syncPull()');
    t.eq(app.srv.rpcs('my_min_version').length, n0, 'another run within the hour: not read again');

    app.run("document.visibilityState = 'visible'");
    app.doc.dispatchEvent({ type: 'visibilitychange' });
    stopTimer(app);
    await app.run('syncPull()');
    t.eq(app.srv.rpcs('my_min_version').length, n0 + 1, 'back at the front (visibilitychange through document): read again');

    // V153: the answer held in memory decides (not its stored copy) — age that.
    app.storage.setItem('pat:minVersion', minRec(N, UID, Date.now() - 2 * HOUR));
    app.run(`_syncMinHeld = { u: '${UID}', min: ${N}, at: Date.now() - 2 * ${HOUR} }`);
    await app.run('syncPull()');
    t.eq(app.srv.rpcs('my_min_version').length, n0 + 2, 'over an hour old: read again');

    // Never known, and the read fails (no SQL yet): no minimum — it syncs.
    const b = await signedIn();
    b.srv.minFail = true;
    await b.run('syncPull()');
    t.ok(b.srv.work().length > 0, 'a failed read with nothing known: the run carries on (fails open)');
    t.eq(b.storage.getItem('pat:minVersion'), null, '…and nothing is kept');

    // Known too old, then the read fails: still stopped.
    // V160: was minRec(160) — this release IS 160, so "too old" is now any number above every version to come.
    const c = await signedIn({ localStorage: { 'pat:minVersion': minRec(9999) } });
    c.srv.minFail = true;
    await c.run('syncPull()');
    t.eq(c.srv.work().length, 0, 'known too old and the read fails: still nothing read or sent');
    t.ok(c.run('syncTooOld()'), '…still too old');
  });

  /* ------------------------------------------------------------------ 90b */
  await t.group('90b — below it: nothing read, nothing sent, nothing asked for; a lower minimum or another account syncs', async () => {
    const app = await signedIn();
    app.srv.min = N + 1;
    withUnsentJob(app);
    await app.run('syncPull()');
    t.eq(app.srv.rpcs('my_min_version').length, 1, 'the minimum was read');
    t.eq(app.srv.work().length, 0, 'nothing else touched: no jobs, records, photos, phone report or businesses');
    t.ok(app.run('syncTooOld()'), 'too old');
    t.eq(app.run('state.sync.message'), app.run('SYNC_VERSION_STOPPED_WORDS'), 'the Sync page says what happened');
    t.includes(app.run('SYNC_VERSION_STOPPED_WORDS'), 'Your work is safe on this phone', '…and that the work is safe');
    await app.run('syncPush()');
    t.eq(app.srv.sends().length, 0, 'a save’s quick send: still nothing sent');

    // The on-request reads and writes.
    const before = app.srv.work().length;
    const stopped = app.run('SYNC_VERSION_STOPPED_WORDS');
    const list = await app.run('syncCloudList()');
    t.ok(!list.ok && list.error === stopped, 'the cloud tab’s list: refused on the phone, in those words');
    const back = await app.run("syncBringBack(['x'])");
    t.ok(!back.ok && back.error === stopped, 'bringing a job back: refused');
    const size = await app.run('syncCloudStorage()');
    t.ok(!size.ok && size.error === stopped, 'Cloud Storage: refused');
    await app.run('businessRefresh()');
    t.eq(app.srv.work().length, before, '…none of them, nor the Business page, asked the cloud anything');

    // Lowered again (or the phone updated): it syncs, and the job goes up.
    app.srv.min = N;
    app.run('syncMinOwe()');
    await app.run('syncPull()');
    t.notOk(app.run('syncTooOld()'), 'a lower minimum: no longer too old');
    t.ok(app.srv.sends().some(c => c.url.includes('/rest/v1/sessions')), '…and the waiting job goes up');

    // Another account's record stops nobody else.
    const b = await signedIn({ localStorage: { 'pat:minVersion': minRec(999, OTHER) } });
    t.notOk(b.run('syncTooOld()'), 'another account’s minimum: this account isn’t stopped by it');
    await b.run('syncPull()');
    t.ok(b.srv.work().length > 0, '…and it syncs');
  });

  /* ------------------------------------------------------------------ 90c */
  await t.group('90c — the line on the Jobs list and the Sync page; team and solo words; Update now', async () => {
    const ok = await signedIn();
    ok.state().view = 'sessions';
    ok.fn('render')();
    t.excludes(html(ok), 'id="version-banner"', 'new enough: no line');

    const app = await signedIn({ localStorage: { 'pat:minVersion': minRec(N + 1) } });
    const st = app.state();
    st.view = 'sessions';
    app.fn('render')();
    t.includes(html(app), 'id="version-banner"', 'too old: the line on the Jobs list');
    t.includes(html(app), 'Update PATGo to keep syncing', '…solo words');
    t.includes(html(app), 'data-action="version-update"', '…with Update now');
    t.ok(html(app).indexOf('id="version-banner"') < html(app).indexOf('jobs-tabs') || html(app).indexOf('jobs-tabs') === -1, '…above the tabs');
    st.jobsTab = 'cloud';
    app.fn('render')();
    t.includes(html(app), 'id="version-banner"', '…on the cloud tab too');
    st.jobsTab = 'phone';

    app.storage.setItem('pat:businesses', JSON.stringify({ u: UID, at: Date.now(), list: [
      { id: OWN, name: '', role: 'owner', def: true, n: 1 }, { id: TEAM, name: 'Acme', role: 'engineer', def: false, n: 3 }] }));
    app.fn('render')();
    t.includes(html(app), 'Update PATGo to keep working with your team.', 'in a team: the team words (3A)');
    app.storage.setItem('pat:businesses', JSON.stringify({ u: UID, at: Date.now(), list: [{ id: OWN, name: '', role: 'owner', def: true, n: 1 }] }));
    app.fn('render')();
    t.includes(html(app), 'Update PATGo to keep syncing', 'a business of one (a sole trader): the solo words');
    t.excludes(html(app), 'your team', '…never "your team"');

    st.view = 'cloudSync';
    app.fn('render')();
    t.includes(html(app), 'id="sync-version"', 'the Sync page leads with the line');
    t.ok(html(app).indexOf('id="sync-version"') < html(app).indexOf('Sync (test)'), '…above the page’s long introduction');

    // Update now, an update already waiting: straight in.
    st.view = 'sessions';
    app.fn('render')();
    const w = fakeWorker();
    st.updateAvailable = true;
    st.pendingWorker = w;
    tap(app, 'version-update');
    t.eq(skipped(w), 1, 'an update waiting: Update now puts it in at once');

    // Nothing waiting: it asks for one, and says so.
    const b = await signedIn({ localStorage: { 'pat:minVersion': minRec(N + 1) } });
    const bs = b.state();
    bs.view = 'sessions';
    let asked = 0;
    b.run('_updateReg = { update() { return Promise.resolve(); } }');
    b.sandbox.__count = () => { asked++; };
    b.run('_updateReg.update = function () { __count(); return Promise.resolve(); }');
    tap(b, 'version-update');
    t.eq(asked, 1, 'nothing waiting: it asks the server for the new version');
    t.includes(html(b), 'Looking for the update', '…and says it is looking');
    t.ok(/id="version-banner-update"[^>]*disabled/.test(html(b)), '…its button resting meanwhile');
    const nw = fakeWorker();
    b.fn('showUpdateBanner')(nw);
    t.eq(skipped(nw), 1, 'the update arrives while looking: in straight away');

    // Arriving later than SYNC_VERSION_LOOK_MS: the safe moment decides, as ever.
    const c = await signedIn({ localStorage: { 'pat:minVersion': minRec(N + 1) } });
    c.state().view = 'sessions';
    c.state().sync.versionLookAt = Date.now() - c.run('SYNC_VERSION_LOOK_MS') - 1000;
    c.run('_updateLastTouch = Date.now()');
    const late = fakeWorker();
    c.fn('showUpdateBanner')(late);
    t.eq(skipped(late), 0, 'arriving later: not put in by the tap');
    c.run('if (_updateTimer) { clearTimeout(_updateTimer); _updateTimer = null; }');

    // Within the window but a sheet is open: never under it.
    const d = await signedIn({ localStorage: { 'pat:minVersion': minRec(N + 1) } });
    d.state().view = 'sessions';
    d.state().sync.versionLookAt = Date.now();
    const sheet = d.doc.createElement('div');
    sheet.className = 'bulk-sheet';
    d.doc.body.appendChild(sheet);
    d.run('_updateLastTouch = Date.now()');
    const under = fakeWorker();
    d.fn('showUpdateBanner')(under);
    t.eq(skipped(under), 0, 'a sheet open: not put in under it');
    d.run('if (_updateTimer) { clearTimeout(_updateTimer); _updateTimer = null; }');
  });

  /* ------------------------------------------------------------------ 90d */
  await t.group('90d — the action is wired; the record follows the account; garbage reads as nothing', () => {
    const app = freshApp();
    t.ok(app.run("typeof ACTIONS['version-update'] === 'function'"), "dispatch: 'version-update'");
    t.eq(app.run('MIN_VERSION_KEY'), 'pat:minVersion', 'MIN_VERSION_KEY');
    t.ok(app.run("RESET_KEY_PLAN.some(k => k[0] === 'MIN_VERSION_KEY' && k[2] === 'account')"), 'Reset: it goes with the account');
    t.notOk(app.run("RESET_HANDOVER_KEEP.includes('MIN_VERSION_KEY')"), '…and a takeover clears it');
    app.storage.setItem('pat:minVersion', minRec(160));
    t.notOk(app.run("JSON.stringify(buildBackup()).includes('minVersion')"), 'never in a backup');
    for (const bad of ['nonsense', '[1,2]', '{"u":"x","min":"160"}', '{"min":160}', '{"u":"x","min":-1}']) {
      app.storage.setItem('pat:minVersion', bad);
      t.eq(app.run('JSON.stringify(_syncMinLoad())'), '{}', `garbage (${bad}) reads as nothing`);
    }
    t.eq(app.run('JSON.stringify(state.sync.versionLookAt)'), '0', 'state.sync.versionLookAt declared (0)');
    t.notOk(app.run('syncTooOld()'), 'signed out: never too old');
  });

  /* ------------------------------------------------------------------ 90e */
  // V152: the release checks (version, cache, About, What's new) moved to 91e.
  // What stays is V151's own and never rolls: its About line, while in the window
  // M1259 pins it via 91e; the Update now action stays wired (90d).
  await t.group('90e — V151 carried (release checks → 91e)', () => {
    const rel = freshApp();
    t.ok(rel.run('syncAppVersionNum()') >= 151, 'this phone is V151 or later');
    t.eq(rel.run("syncAppVersionNum('V151')"), 151, 'V151 reads as 151 (the minimum the setting started at)');
  });

  /* ------------------------------------------------------------------ 90f */
  await t.group('90f — the SQL: the setting, the raise, what a phone may call, the invite check; schema.sql; isolation; the test aid', () => {
    const mig = read('supabase/v151-min-version.sql');
    const body = mig.slice(mig.indexOf('-- ------------------------------------------------- the setting'),
                           mig.indexOf('-- ------------------------------------------------- self-checks'));
    t.ok(body.length > 3000, `the migration's statements are read (${body.length} chars)`);
    t.includes(body, "  min_version        integer not null default 151 check (min_version between 1 and 999999),", 'one setting, starting at 151');
    t.includes(body, "insert into public.app_settings (id) values (1) on conflict (id) do nothing;", '…run again, it keeps the minimum set');
    t.includes(body, "revoke all on public.app_settings, public.app_min_overrides from public, anon, authenticated;", 'neither table open to any app');
    t.includes(body, "alter table public.app_settings enable row level security;", '…RLS on the setting');
    t.includes(body, "alter table public.app_min_overrides enable row level security;", '…and on the raises');
    t.includes(body, "  select greatest(\n    coalesce((select s.min_version from public.app_settings s where s.id = 1), 0),\n    coalesce((select o.min_version from public.app_min_overrides o where o.user_id = u), 0))", 'an account’s minimum: the higher of the setting and its own raise');
    t.includes(body, "  if auth.uid() is null then\n    raise exception 'patgo_min_version: sign in first'", 'signed in only');
    t.includes(body, "  return public.app_min_version_for(auth.uid());", '…and only your own');
    t.includes(body, "     where p.seen_at > s.win and coalesce(p.version_num, 0) < m.need)", 'the invite check: a phone that reported an older version');
    t.includes(body, "       and not exists (select 1 from public.phones p\n                       where p.user_id = ses.user_id and p.auth_session = ses.id))", '…and a sign-in that never reported (unknown = too old)');
    t.includes(body, "    from public.memberships mm where mm.org_id = o", '…of the business’s members');
    for (const f of ['app_min_version_for(uuid)', 'org_phones_behind(uuid)']) {
      t.includes(body, `revoke all on function public.${f} from public, anon, authenticated;`, `${f.split('(')[0]}: closed to every app`);
    }
    t.includes(body, 'revoke all on function public.my_min_version() from public, anon;', 'my_min_version: not signed out');
    t.includes(body, 'grant execute on function public.my_min_version() to authenticated;', '…signed-in phones');
    t.excludes(body, 'plan_guard', 'the database refuses nothing by version (1A)');
    for (const c of ['V1', 'V2', 'V3', 'V4']) t.includes(mig, `array['${c}|`, `self-check ${c}`);
    t.includes(mig, "      raise exception 'v151-undo';", 'the self-check undoes what it tries');

    const schema = read('supabase/schema.sql');
    // V154: its own section follows V151's, so "ends with" became "carries" (93f pins V154's).
    t.includes(schema, body.replace(/\n*$/, '\n'), 'schema.sql carries exactly the V151 statements');
    t.ok(schema.indexOf('============ V151') > schema.indexOf('============ V150'), '…in their own section, after V150’s');

    const iso = read('supabase/isolation-test.sql');
    for (const c of ['22a', '22b', '22c', '22d', '22e']) t.includes(iso, `array['${c}|`, `isolation ${c}`);
    t.includes(iso, "run supabase/v151-min-version.sql first", '22a names the file when it hasn’t been run');

    const aid = read('supabase/v151-test-min-version.sql');
    t.includes(aid, "    insert into public.app_min_overrides (user_id, min_version, note)\n    values (u, 999999, 'V151 test aid')", 'the test aid raises ONE account (4A)');
    t.includes(aid, "    delete from public.app_min_overrides where user_id = u;", '…and undo takes the raise away');
    t.excludes(aid, 'update public.app_settings', '…never everyone’s minimum');

    const app = read('sync.js') + read('business.js');
    t.excludes(app, "rpc('org_phones_behind'", 'the app never asks the invite check (V152’s server side will)');
  });
};
