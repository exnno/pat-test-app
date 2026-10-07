/* Standing test — Reset this phone (V106, roadmap Stage 10 part 2)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. reset.js: three levels (1A) — work (jobs, clients &
   sites 2A, photos, snapshots, learned history, reminders, sync bookkeeping),
   + settings (certificate numbering kept, 8B), + everything (sign-in, access
   code, counter). Local only: nothing is deleted from the cloud. A typed RESET
   confirms (7A) on a sheet that lists what is deleted and what is kept, warns
   with a count when jobs aren't safe in the cloud (4A) and says no copy is kept
   (6A). Two passes: the live page wipes and reloads; boot finishes the wipe
   BEFORE load().

   ⚠ 43a is the release's long-term value: every storage key in config.js must be
     classified in RESET_KEY_PLAN, so the factory-reset list cannot silently go
     stale again (it was a hand-kept BACKLOG list from V81.1 to V105).
   ⚠ 43b–43d plant a PATGo Scan key ('scan:'): the test host shares an origin with
     it, and a reset must never touch another app's data.
   ⚠ LISTENER RULE (V67): the level buttons are tapped through #app's delegated
     handler, and the typed word arrives through the input's own 'input' event. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { freshApp, populated, withSession, withItem, tick } = require('../fixture');

const LIB = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const UID_A = '11111111-1111-1111-1111-111111111111';
const T2 = '2026-09-02T10:00:00.000Z';
const T3 = '2026-09-03T10:00:00.000Z';
const SCAN = { 'scan:records': '[{"id":"ZZSCAN"}]', 'scan:engineer': 'ZZ Scan Engineer' };
const AUTH = 'patgo:cloudAuth:test';

function fire(app, type, el) {
  app.doc.getElementById('app').dispatchEvent({
    type, target: el, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
  });
}
function tap(app, action, arg) {
  const el = app.doc.createElement('button');
  el.dataset.action = action;
  if (arg !== undefined) el.dataset.arg = String(arg);
  fire(app, 'click', el);
}
function typeWord(app, word) {
  const inp = app.doc.getElementById('reset-sheet-input');
  inp.value = word;
  inp.dispatchEvent({ type: 'input', target: inp, preventDefault() {}, stopPropagation() {} });
  return inp;
}
const keys = (app) => app.storage._snapshot ? Object.keys(app.storage._snapshot()) : [];
const has = (app, k) => app.storage.getItem(k) !== null;
const sheetHTML = (app) => {
  const s = app.doc.querySelectorAll('.bulk-sheet');
  return s.length ? s[s.length - 1].innerHTML : '';
};

/* A phone with work, settings and a sign-in, plus another app's keys. */
function busyPhone() {
  const app = populated();
  app.run(`ensureClient('ZZ Reset Client'); state.engineer = 'ZZ Reset Engineer';
    state.reportSettings.enabled = true; state.reportSettings.companyName = 'ZZ Co';
    state.reportSettings.certEnabled = true; state.reportSettings.certPrefix = 'BPS-';
    state.reportSettings.certNextNumber = 42; state.reportSettings.certPadding = 4;
    state.soundEnabled = true; save(); saveReportSettings();`);
  for (const [k, v] of Object.entries(SCAN)) app.storage.setItem(k, v);
  app.storage.setItem(AUTH, '{"ZZ":"token"}');
  app.storage.setItem('pat:cloudUnlocked', '1');
  app.storage.setItem('pat:syncState', '{"userId":"ZZ"}');
  app.storage.setItem('pat:tombstones', '[{"kind":"session","id":"ZZ","at":"x"}]');
  app.storage.setItem('pat:v64welcome', '1');   // an old per-version key the plan doesn't list
  return app;
}
// What the phone looks like after the next start-up.
const reboot = (app) => freshApp({ localStorage: app.storage._snapshot() });

/* ---- the signed-in round trip (43h): the real library against a fake server ---- */
function json(rows, status = 200) {
  return new Response(JSON.stringify(rows), { status, headers: { 'content-type': 'application/json' } });
}
function fakeServer(seed = {}) {
  const calls = [];
  const tables = { sessions: (seed.sessions || []).map(r => Object.assign({}, r)), records: (seed.records || []).map(r => Object.assign({}, r)) };
  const fetchImpl = async (url, init = {}) => {
    const u = String(url); const method = init.method || 'GET';
    let body = null; try { body = init.body ? JSON.parse(init.body) : null; } catch { body = init.body; }
    calls.push({ url: u, method, body });
    for (const name of ['sessions', 'records']) {
      if (!u.includes('/rest/v1/' + name)) continue;
      const cloud = tables[name];
      if (method === 'GET') {
        const q = new URLSearchParams(u.split('?')[1] || '');
        let rows = cloud.slice();
        const gt = q.get('updated_at');
        if (gt && gt.startsWith('gt.')) rows = rows.filter(r => r.updated_at > gt.slice(3));
        else if (gt && gt.startsWith('gte.')) rows = rows.filter(r => r.updated_at >= gt.slice(4));
        const eq = q.get('id');
        if (eq && eq.startsWith('eq.')) rows = rows.filter(r => String(r.id) === eq.slice(3));
        const inn = q.get('id');
        if (inn && inn.startsWith('in.(')) { const set = inn.slice(4, -1).split(',').map(s => s.replace(/^"|"$/g, '')); rows = rows.filter(r => set.includes(String(r.id))); }
        const kin = q.get('kind');
        if (kin && kin.startsWith('in.(')) { const set = kin.slice(4, -1).split(',').map(s => s.replace(/^"|"$/g, '')); rows = rows.filter(r => set.includes(r.kind)); }
        rows.sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)));
        const lim = parseInt(q.get('limit') || '0', 10);
        if (lim > 0) rows = rows.slice(0, lim);
        return json(rows);
      }
      for (const row of (Array.isArray(body) ? body : [])) {
        const i = cloud.findIndex(r => String(r.id) === String(row.id));
        const stored = Object.assign({}, row, { updated_at: T3 });
        if (i === -1) cloud.push(stored); else cloud[i] = stored;
      }
      return new Response(null, { status: 201 });
    }
    if (u.includes('/rest/v1/profiles')) return json([{ plan: 'trial', trial_ends_at: null }]);
    return json([]);
  };
  const posted = (table) => calls.filter(c => c.url.includes('/rest/v1/' + table) && c.method === 'POST')
    .flatMap(c => Array.isArray(c.body) ? c.body : []);
  return { calls, fetchImpl, tables, posted };
}
function storedSession() {
  return JSON.stringify({
    access_token: 'ZZACCESS', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'ZZREFRESH',
    user: { id: UID_A, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' },
  });
}
function signedIn(ls, server) {
  const app = bootApp({ localStorage: Object.assign({ [AUTH]: storedSession() }, ls || {}), navigator: { onLine: false } });
  app.fn('load')();
  app.state = () => app.refresh('state').state;
  app.stopTimer = () => app.run('if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }');
  const srv = fakeServer(server || {});
  const sb = app.sandbox;
  for (const k of ['Headers', 'Request', 'Response', 'AbortController', 'TextEncoder',
                   'TextDecoder', 'URLSearchParams', 'URL', 'atob', 'btoa']) sb[k] = globalThis[k];
  if (!sb.crypto) sb.crypto = globalThis.crypto;
  sb.WebSocket = class {};
  sb.fetch = srv.fetchImpl;
  app.run(LIB);
  app.run('navigator.onLine = true');
  app.srv = srv;
  app.stopTimer();
  return app;
}

module.exports = async function run() {

  /* ------------------------------------------------------------------ 43a */
  t.group('43a — every storage key is classified for the reset; the plan names real keys', () => {
    const app = freshApp();
    const cfg = fs.readFileSync(path.join(APP_DIR, 'config.js'), 'utf8');
    const declared = [...cfg.matchAll(/^const ([A-Z0-9_]+_KEY) = /gm)].map(m => m[1]);
    const plan = app.val('RESET_KEY_PLAN') || app.run('RESET_KEY_PLAN');
    t.ok(Array.isArray(plan) && plan.length > 50, 'the plan is a real list');
    const named = new Set(plan.map(r => r[0]));
    const missing = declared.filter(k => k !== 'RESET_PENDING_KEY' && !named.has(k));
    t.deepEq(missing, [], 'every *_KEY in config.js has a row (a new key must be classified here)');
    t.notOk(named.has('RESET_PENDING_KEY'), 'the marker is the reset\u2019s own, removed last');
    t.eq(plan.length, named.size, 'no key is listed twice');
    t.ok(plan.every(r => ['work', 'settings', 'account'].includes(r[2])), 'every row has a level');
    t.ok(plan.every(r => app.run(r[0]) === r[1]), 'every row carries its constant\u2019s live value');
    const lvl = (k) => (plan.find(r => r[0] === k) || [])[2];
    for (const k of ['STORAGE_KEY', 'CLIENTS_KEY', 'SITES_KEY', 'TOMBSTONES_KEY', 'SYNC_STATE_KEY', 'SYNC_PRUNED_KEY',
                     'SYNC_HELD_KEY', 'SQP_RESET_KEY', 'STORAGE_BANNER_KEY', 'TIDY_OFFER_KEY', 'MAP_PIN_OPEN_KEY',
                     'REMINDER_QUIET_KEY', 'SNAPSHOT_FAIL_KEY']) t.eq(lvl(k), 'work', `${k} goes with the work (roadmap list)`);
    for (const k of ['PHOTO_AGE_KEY', 'UNDO_KEY', 'MAP_PIN_KEY', 'REMINDERS_KEY', 'SNAPSHOTS_KEY', 'REPORT_SETTINGS_KEY'])
      t.eq(lvl(k), 'settings', `${k} goes with the settings`);
    t.eq(lvl('CLOUD_UNLOCK_KEY'), 'account', 'the access code goes only with everything');
    t.eq(lvl('CLOUD_AUTH_STORAGE_KEY'), 'account', 'and the sign-in');
  });

  /* ------------------------------------------------------------------ 43b */
  t.group('43b — Clear my work: work gone, settings and sign-in kept, another app untouched', () => {
    const app = busyPhone();
    app.fn('_resetWipeLocal')('work');
    for (const k of ['pat:sessions', 'pat:clients', 'pat:sites', 'pat:tombstones', 'pat:syncState', 'pat:archivedStats'])
      t.notOk(has(app, k), `${k} removed`);
    for (const k of ['pat:engineer', 'pat:reportsettings', 'pat:instruments', 'pat:itempresets', 'pat:soundfx', 'pat:v64welcome'])
      t.ok(has(app, k), `${k} kept`);
    t.ok(has(app, AUTH), 'still signed in');
    t.ok(has(app, 'pat:cloudUnlocked'), 'access code kept');
    for (const k of Object.keys(SCAN)) t.eq(app.storage.getItem(k), SCAN[k], `${k} (PATGo Scan) untouched`);
    const b = reboot(app);
    t.eq(b.state().sessions.length, 0, 'next start: no jobs');
    t.eq(b.state().clients.length, 0, 'no clients');
    t.eq(b.state().engineer, 'ZZ Reset Engineer', 'the engineer name is still there');
    t.eq(b.state().reportSettings.companyName, 'ZZ Co', 'and the report setup');
    t.eq(b.state().onboardedV33Seen, true, 'no first-time setup at this level');
  });

  /* ------------------------------------------------------------------ 43c */
  t.group('43c — Clear work and settings: as new, still signed in, certificate numbering kept (8B)', () => {
    const app = busyPhone();
    const cert = app.fn('_resetCertKeep')();
    app.fn('_resetWipeLocal')('settings', cert);
    const left = keys(app).filter(k => k.indexOf('pat:') === 0);
    t.deepEq(left.sort(), ['pat:cloudUnlocked', 'pat:reportsettings'], 'only the access code and the numbering remain of PATGo\u2019s own');
    t.ok(has(app, AUTH), 'still signed in');
    for (const k of Object.keys(SCAN)) t.eq(app.storage.getItem(k), SCAN[k], `${k} (PATGo Scan) untouched`);
    const b = reboot(app);
    const rs = b.state().reportSettings;
    t.eq(rs.certNextNumber, 42, 'the counter carries on');
    t.eq(rs.certPrefix, 'BPS-', 'with its prefix');
    t.eq(rs.certEnabled, true, 'still switched on');
    t.eq(rs.companyName, '', 'but the rest of the report setup is back to new');
    t.eq(rs.enabled, false, '(reports themselves are off, as on a new install)');
    t.eq(b.state().engineer, '', 'engineer name gone');
    t.eq(b.state().soundEnabled, false, 'switches back to their defaults');
    t.eq(b.state().onboardedV33Seen, false, 'the first-time setup shows');
  });

  /* ------------------------------------------------------------------ 43d */
  t.group('43d — Everything, as new: every PATGo key gone, sign-in included; another app untouched', () => {
    const app = busyPhone();
    app.fn('_resetWipeLocal')('everything');
    t.deepEq(keys(app).filter(k => k.indexOf('pat:') === 0 || k.indexOf('patgo:') === 0), [], 'nothing of PATGo\u2019s left');
    for (const k of Object.keys(SCAN)) t.eq(app.storage.getItem(k), SCAN[k], `${k} (PATGo Scan) untouched`);
    const b = reboot(app);
    t.eq(b.state().reportSettings.certNextNumber, 1, 'numbering starts again');
    t.notOk(has(b, AUTH), 'signed out: the sign-in is gone from this phone');
    t.eq(b.fn('_resetWipeLocal')('nonsense').length, 0, 'an unknown level deletes nothing');
  });

  /* ------------------------------------------------------------------ 43e */
  await t.group('43e — the real path: tap a level, the sheet, typed RESET, two passes', async () => {
    const app = busyPhone();
    await tick(20);
    app.sandbox.indexedDB._stores.set('photos', new Map([['ZZP', { id: 'ZZP', itemId: 'x', sessionId: 'y', bytes: 10 }]]));
    app.sandbox.indexedDB._stores.set('snapshots', new Map([['ZZS', { id: 'ZZS' }]]));
    app.fn('setView')('settingsReset');
    tap(app, 'reset-open', 'work');
    const yes = app.doc.getElementById('reset-sheet-yes');
    t.ok(yes, 'a level opens its confirm sheet');
    t.includes(sheetHTML(app), 'id="reset-sheet-yes" style="flex:1" disabled', 'Reset starts greyed out');
    yes.click(); await tick(5);
    t.ok(has(app, 'pat:sessions'), 'tapping Reset with an empty box does nothing');
    typeWord(app, 'RESE');
    t.eq(yes.disabled, true, 'a near miss keeps it grey');
    typeWord(app, ' reset ');
    t.eq(yes.disabled, false, 'RESET in any case, spaces trimmed, lights it');
    app.doc.getElementById('reset-sheet-no').click();
    t.ok(has(app, 'pat:sessions'), 'Cancel: nothing changed');

    tap(app, 'reset-open', 'work');
    typeWord(app, 'RESET');
    const before = app.sandbox.location._reloads;
    // What the stores hold at the moment the page goes: the clear must have
    // FINISHED by then, not merely started (the reload ends the page).
    const loc = app.sandbox.location, idb = app.sandbox.indexedDB;
    // ⚠ The stub applies a clear() the moment it is called; a real one lands only
    // when its request completes. Defer it a macrotask here, or an un-awaited
    // clear looks finished and this assertion could never fail (M724).
    for (const n of ['photos', 'snapshots']) {
      const m = idb._stores.get(n);
      if (m) m.clear = function () { setTimeout(() => Map.prototype.clear.call(m), 0); };
    }
    loc.reload = function () { loc._reloads++; loc._atReload = ['photos', 'snapshots'].map(n => (idb._stores.get(n) || new Map()).size); };
    app.doc.getElementById('reset-sheet-yes').click();
    for (let i = 0; i < 40 && app.sandbox.location._reloads === before; i++) await tick(10);
    t.eq(app.sandbox.location._reloads, before + 1, 'the page reloads itself');
    t.deepEq(loc._atReload, [0, 0], 'only once both stores are empty');
    t.notOk(has(app, 'pat:sessions'), 'pass 1: the live page already wiped the jobs');
    t.ok(has(app, 'pat:resetPending'), 'and left the marker for pass 2');
    t.eq((app.sandbox.indexedDB._stores.get('photos') || new Map()).size, 0, 'photos cleared');
    t.eq((app.sandbox.indexedDB._stores.get('snapshots') || new Map()).size, 0, 'snapshots cleared (6A: no copy)');
    // Anything in memory trying to write back after the wipe is a no-op.
    app.state().sessions.push({ id: 'ZZLATE', items: [] });
    app.run('save(); saveSessions();');
    t.notOk(has(app, 'pat:sessions'), 'save() is neutralised: memory cannot write the jobs back');
    // A late sync writing its bookkeeping back is caught by pass 2.
    app.storage.setItem('pat:syncState', '{"userId":"ZZLATE"}');
    const b = reboot(app);
    t.notOk(has(b, 'pat:resetPending'), 'pass 2 (boot): the marker is removed');
    t.notOk(has(b, 'pat:syncState'), 'and what was written back in between is wiped again');
    t.eq(b.state().sessions.length, 0, 'load() starts on a clean phone');
    t.deepEq(b.sandbox.indexedDB._deleted.slice().sort(), ['patgo-photos', 'patgo-snapshots'], 'both databases deleted at boot');
    t.eq(b.state().engineer, 'ZZ Reset Engineer', 'settings kept at this level');
    for (const k of Object.keys(SCAN)) t.eq(b.storage.getItem(k), SCAN[k], `${k} (PATGo Scan) untouched`);
  });

  /* ------------------------------------------------------------------ 43f */
  t.group('43f — the boot pass: runs before load(), and a marker it can\u2019t read deletes nothing', () => {
    const app = busyPhone();
    app.storage.setItem('pat:resetPending', JSON.stringify({ level: 'settings', cert: { certNextNumber: 7 } }));
    const b = reboot(app);
    t.eq(b.state().sessions.length, 0, 'the wipe ran before load() read the jobs');
    t.eq(b.state().engineer, '', 'settings level honoured');
    t.eq(b.state().reportSettings.certNextNumber, 7, 'with the numbering the marker carried');

    const c = busyPhone();
    c.storage.setItem('pat:resetPending', '{not json');
    const d = reboot(c);
    t.ok(d.state().sessions.length > 0, 'a garbage marker: jobs untouched');
    t.notOk(has(d, 'pat:resetPending'), '…and the marker is dropped');
    const e = busyPhone();
    e.storage.setItem('pat:resetPending', JSON.stringify({ level: 'all' }));
    const f = reboot(e);
    t.ok(f.state().sessions.length > 0, 'an unknown level: jobs untouched');
  });

  /* ------------------------------------------------------------------ 43g */
  t.group('43g — the overview says what goes and what stays, per level (Peter\u2019s ask)', () => {
    const app = busyPhone();
    app.run(`state.snapList = [{id:'a'},{id:'b'}];`);
    const work = app.fn('resetOverview')('work');
    t.ok(work.gone.some(s => /All 1 job on this phone/.test(s)), 'work: the jobs, counted');
    t.ok(work.gone.some(s => /^2 clients and 1 site$/.test(s)), 'clients and sites, counted (2A)');
    t.ok(work.gone.some(s => /All 2 daily snapshots/.test(s)), 'the snapshots, counted');
    t.ok(work.kept.some(s => /^Your settings:/.test(s)), 'settings listed as kept');
    t.notOk(work.notes.some(s => /first-time setup/.test(s)), 'no first-time setup at the work level');
    t.includes(work.final, 'No copy is kept', '6A said plainly');
    const set = app.fn('resetOverview')('settings');
    t.ok(set.gone.some(s => /^All your settings:/.test(s)), 'settings: settings listed as deleted');
    t.ok(set.kept.some(s => s.includes('BPS-0042')), 'the next certificate number is shown as kept (8B)');
    const all = app.fn('resetOverview')('everything');
    t.ok(all.gone.some(s => /numbering starts again at 1/.test(s)), 'everything: the counter goes');
    t.ok(all.kept.some(s => /exactly as it was when first installed/.test(s)), 'and nothing is kept');
    t.ok(all.notes.some(s => /Nothing is deleted from your cloud account/.test(s)), 'cloud untouched, said');

    app.run(`state.cloud = Object.assign({}, state.cloud, { status: 'signed-in', email: 'zz<b>@example.com' });
             syncJobsSafety = function () { return { total: 3, safe: 1, map: new Map() }; };`);
    const si = app.fn('resetOverview')('work');
    t.ok(si.kept.some(s => s.includes('You stay signed in as zz<b>@example.com')), 'signed in: the account is named as kept');
    t.ok(si.notes.some(s => /last 30 days/.test(s)), 'and what comes back on the next sync is explained');
    t.includes(si.warn, '2 jobs have changes', '4A: the warning carries the count');
    const sa = app.fn('resetOverview')('everything');
    t.ok(sa.gone.some(s => s.includes('Your sign-in on this phone (zz<b>@example.com)')), 'everything: the sign-in is listed as deleted');
    app.fn('resetOpen')('work');
    const html = sheetHTML(app);
    t.includes(html, 'zz&lt;b&gt;@example.com', 'the sheet escapes what it shows');
    t.excludes(html, 'zz<b>', '…never raw');
    t.includes(html, 'Deleted from this phone', 'the sheet has the deleted list');
    t.includes(html, '>Kept<', 'and the kept list');
    t.includes(html, 'id="reset-sheet-warn"', 'and the warning, first');
    app.run('syncJobsSafety = function () { return { total: 3, safe: 3, map: new Map() }; };');
    t.eq(app.fn('resetOverview')('work').warn, '', 'all safe: no warning');
  });

  /* ------------------------------------------------------------------ 43h */
  await t.group('43h — signed in, Clear my work: nothing deleted in the cloud, nothing held, the work comes back', async () => {
    const app = signedIn();
    withSession(app, { client: 'ZZ Cloud Client', site: 'ZZ Cloud Site' });
    withItem(app, { assetNo: 'ZZC-1' });
    withSession(app, { client: 'ZZ Old Client', site: 'ZZ Old Site', name: 'ZZ Old Job' });
    withItem(app, { assetNo: 'ZZC-OLD' });
    app.run(`activeSession().date = '2025-06-01'; save();`);   // well outside the 30 days, no retest
    app.run(`state.itemPresets.push({ id: 'preset_ZZMINE', name: 'ZZ Mine', items: ['ZZ Kettle'] }); save();`);
    app.stopTimer();
    await app.fn('syncPull')(); await tick(5);
    await app.fn('syncPull')(); await tick(5);   // a second run: confirmed, nothing more to send
    const jobId = String(app.state().sessions.find(s => s.name !== 'ZZ Old Job').id);
    const oldId = String(app.state().sessions.find(s => s.name === 'ZZ Old Job').id);
    t.ok(app.srv.tables.sessions.some(r => String(r.id) === oldId), 'setup: the old job is in the cloud too');
    t.ok(app.srv.tables.sessions.some(r => String(r.id) === jobId), 'setup: the job is in the cloud');
    t.ok(app.srv.tables.records.some(r => r.id === 'preset_ZZMINE'), 'setup: the preset is in the cloud');

    app.fn('_resetWipeLocal')('work');
    const tables = JSON.parse(JSON.stringify(app.srv.tables));
    const ls = app.storage._snapshot();
    delete ls[AUTH];
    const b = signedIn(ls, tables);
    t.eq(b.state().sessions.length, 0, 'after the reset: an empty phone');
    await b.fn('syncPull')(); await tick(5);
    await b.fn('syncPull')(); await tick(5);
    t.eq(b.srv.posted('sessions').filter(r => r.deleted).length, 0, 'no job deletion is ever sent');
    t.eq(b.srv.posted('records').filter(r => r.deleted).length, 0, 'no client, site or preset deletion either');
    t.ok(b.srv.tables.sessions.some(r => String(r.id) === jobId && !r.deleted), 'the job is still in the cloud');
    t.ok(b.state().sessions.some(s => String(s.id) === jobId), 'and, recent, it came back to the phone (R21)');
    t.notOk(b.state().sessions.some(s => String(s.id) === oldId), 'the old job stays in the cloud, as the confirm says');
    t.ok(b.srv.tables.sessions.some(r => String(r.id) === oldId && !r.deleted), '…and is still there');
    t.ok(b.state().clients.some(c => c.name === 'ZZ Cloud Client'), 'the client came back');
    t.eq(JSON.parse(b.storage.getItem('pat:syncHeld') || '[]').length, 0, 'nothing is held for an answer');
    t.eq(b.state().itemPresets.filter(p => p.id === 'preset_ZZMINE').length, 1, 'the kept preset is not doubled');
  });

  /* ------------------------------------------------------------------ 43i */
  t.group('43i — the page: last in Data, three levels through #app, the backup first (5A)', () => {
    const app = populated();
    const cat = app.run("SETTINGS_CATEGORIES.find(c => c.id === 'catData').pages");
    t.eq(cat[cat.length - 1], 'settingsReset', 'the last row in Data (9A)');
    t.ok(app.fn('settingsPageVisible')('settingsReset'), 'visible');
    t.includes(app.run("SETTINGS_PAGE_META.settingsReset.aliases"), 'factory', 'search finds it as "factory"');
    app.fn('setView')('settingsReset');
    const html = app.doc.getElementById('app').innerHTML;
    for (const lv of ['work', 'settings', 'everything'])
      t.includes(html, `data-action="reset-open" data-arg="${lv}"`, `the ${lv} level is a button`);
    t.includes(html, 'data-action="backup-export"', 'Save a backup file first');
    t.excludes(html, 'reset-photos-btn', 'no photo note without photos');
    app.run("state.photoIndex = { x: 1 }; photoStatsSync = function () { return { count: 3, bytes: 9 }; };");
    app.fn('render')();
    t.includes(app.doc.getElementById('app').innerHTML, 'To keep your 3 photos', 'photos: the note says they are not in the file');
    tap(app, 'reset-open', 'everything');
    t.includes(sheetHTML(app), 'Reset this phone completely?', 'a level button opens its sheet through the real surface');
  });

  /* ------------------------------------------------------------------ 43j */
  t.group('43j — wiring and release: optional subsystem, load order, boot placement, V106', () => {
    const idx = fs.readFileSync(path.join(APP_DIR, 'index.html'), 'utf8');
    const a = idx.indexOf('<script src="snapshots.js">'), b = idx.indexOf('<script src="reset.js">'), c = idx.indexOf('<script src="session.js">');
    t.ok(a > -1 && b > a && c > b, 'index.html: snapshots → reset → session');
    const sw = fs.readFileSync(path.join(APP_DIR, 'sw.js'), 'utf8');
    t.includes(sw, "'./reset.js',", 'precached');
    t.includes(sw, "const CACHE_VERSION = 'pat-v106';", 'cache key pat-v106');
    const boot = fs.readFileSync(path.join(APP_DIR, 'boot.js'), 'utf8');
    const probe = boot.slice(boot.indexOf('const requiredFns = ['), boot.indexOf('];', boot.indexOf('const requiredFns = [')));
    t.excludes(probe, 'reset', 'NOT probed — optional subsystem (MAP rule 6)');
    const call = boot.indexOf('resetRunPending()');
    t.ok(call > boot.indexOf('_bootIntegrity = bootIntegrityOK()'), 'after the integrity check');
    t.ok(call > -1 && call < boot.indexOf('  load();'), 'before load()');
    const app = freshApp();
    t.eq(app.run('APP_VERSION'), 'V106', 'APP_VERSION V106');
    t.eq(app.run('WELCOME_VERSION'), 'V106', 'welcome rolled');
    const core = fs.readFileSync(path.join(APP_DIR, 'render-core.js'), 'utf8');
    t.includes(core, '<strong>Reset this phone.</strong>', 'the welcome copy is this release\u2019s');
    const rjs = fs.readFileSync(path.join(APP_DIR, 'reset.js'), 'utf8');
    t.excludes(rjs, 'localStorage.clear(', 'never a blanket clear (the origin is shared)');
    // Rule 6 the other way: no reset.js — boots, no row, and a waiting marker deletes nothing.
    const busy = busyPhone();
    busy.storage.setItem('pat:resetPending', JSON.stringify({ level: 'everything' }));
    const bare = freshApp({ skip: ['reset.js'], localStorage: busy.storage._snapshot() });
    t.eq(bare.run('typeof resetRunPending'), 'undefined', 'boots without reset.js');
    t.ok(bare.state().sessions.length > 0, 'and a waiting reset deletes nothing (the safe direction)');
    t.notOk(bare.fn('settingsPageVisible')('settingsReset'), 'no row');
    t.doesNotThrow(() => { bare.state().view = 'settingsReset'; bare.fn('render')(); }, 'a stale route still paints');
    t.includes(bare.doc.getElementById('app').innerHTML, 'Backup &amp; Restore', '…Backup & Restore instead');
  });
};
