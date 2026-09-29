/* Standing test — sync, report settings + certificate counter + report templates (V84)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked: 1A the certificate side only (report settings,
   the counter, templates); 2A the counter is its own row, a later hand-typed
   set wins else the higher number, never asked, and stamping skips any number
   a job here already has; 3A templates never carry or apply the counter; 4A
   report settings are ONE row, logo and signature included; 5A \"nothing
   made\" (defaults, untouched starters, a counter at 1 never set) is never
   pushed while unsent, gives way to the account's, and a cloud copy that is
   only that gives way to this phone's.

   AND ONE PRE-EXISTING BUG (21a). Applying a template rewound the certificate
   counter to wherever it stood when the template was saved (the \"Standard\"
   starter: to 1), so the next certificates reused numbers already issued.
   Present since v36.

   Same method as 17–20: the REAL vendored library against a fake server that
   applies the PostgREST filters it is sent and reorders jsonb keys on the way
   back out. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { tick, freshApp, withSession, withItem, confirmSheet } = require('../fixture');

const LIB = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const UID_A = '11111111-1111-1111-1111-111111111111';
const T1 = '2026-09-01T10:00:00.000Z';
const T2 = '2026-09-02T10:00:00.000Z';
const REPORT = 'settings_report';
const CERT = 'settings_certcounter';
const LOGO = 'data:image/png;base64,ZZLOGO' + 'A'.repeat(200);
const LOGO2 = 'data:image/png;base64,ZZOTHERLOGO' + 'B'.repeat(200);

function storedSession(id = UID_A) {
  return JSON.stringify({
    access_token: 'ZZACCESS', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'ZZREFRESH',
    user: { id, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' },
  });
}

function reorderKeys(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(reorderKeys);
  const out = {};
  for (const k of Object.keys(v).reverse()) out[k] = reorderKeys(v[k]);
  return out;
}

function json(rows, status = 200) {
  return new Response(JSON.stringify(rows), { status, headers: { 'content-type': 'application/json' } });
}

function fakeServer(o = {}) {
  const calls = [];
  const tables = { sessions: (o.sessions || []).slice(), records: (o.records || []).slice() };
  let stampN = 0;
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    let body = null;
    try { body = init.body ? JSON.parse(init.body) : null; } catch { body = init.body; }
    calls.push({ url: u, method, body, len: init.body ? String(init.body).length : 0 });
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
        const kin = q.get('kind');
        if (kin && kin.startsWith('in.(')) {
          const set = kin.slice(4, -1).split(',').map(s => s.replace(/^"|"$/g, ''));
          rows = rows.filter(r => set.includes(r.kind));
        }
        rows.sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)));
        const lim = parseInt(q.get('limit') || '0', 10);
        if (lim > 0) rows = rows.slice(0, lim);
        return json(rows.map(reorderKeys));
      }
      // One stamp per upload batch, as Postgres does (rule 14).
      stampN++;
      const stamp = '2026-09-03T10:00:' + String(stampN).padStart(2, '0') + '.000Z';
      for (const row of (Array.isArray(body) ? body : [])) {
        const i = cloud.findIndex(r => String(r.id) === String(row.id));
        const stored = Object.assign({}, row, { updated_at: stamp });
        if (i === -1) cloud.push(stored); else cloud[i] = stored;
      }
      return new Response(null, { status: 201 });
    }
    if (u.includes('/rest/v1/profiles')) return json([{ plan: 'trial', trial_ends_at: null }]);
    return json({ message: 'unexpected ' + u }, 404);
  };
  const on = (table, method) => calls.filter(c => c.url.includes('/rest/v1/' + table) && c.method === method);
  return { calls, fetchImpl, tables,
    gets: (table) => on(table, 'GET'),
    posts: (table) => on(table, 'POST'),
    rows: (table) => on(table, 'POST').flatMap(c => Array.isArray(c.body) ? c.body : []) };
}

function signedIn(opts = {}) {
  const ls = Object.assign({ 'patgo:cloudAuth:test': storedSession() }, opts.localStorage || {});
  const app = bootApp({ localStorage: ls, navigator: { onLine: false } });
  app.fn('load')();
  app.state = () => app.refresh('state').state;
  app.stopTimer = () => app.run('if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }');
  const srv = fakeServer(opts.server || {});
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

const recRow = (kind, id, doc, stamp = T2, deleted = false) =>
  ({ id, kind, doc: deleted ? {} : doc, deleted, last_modified: stamp, updated_at: stamp });

function syncState(app) { return JSON.parse(app.storage.getItem('pat:syncState') || 'null'); }
function held(app) { return JSON.parse(app.storage.getItem('pat:syncHeld') || '[]'); }
const rs = (app) => app.state().reportSettings;
const tpl = (app, id) => (app.state().reportTemplates || []).find(x => x.id === id) || null;

/* The account's report settings, as another phone would have sent them. */
function cloudSettings(app, patch) {
  return JSON.parse(app.run(`JSON.stringify(Object.assign(makeDefaultReportSettings(), ${JSON.stringify(patch || {})}))`));
}
function reportRow(app, patch, stamp) {
  const settings = cloudSettings(app, patch);
  delete settings.certNextNumber;
  return recRow('settings', REPORT, { id: REPORT, settings }, stamp);
}
const certRow = (next, setAt = '', stamp) => recRow('settings', CERT, { id: CERT, next, setAt }, stamp);
function tplRow(app, id, name, patch, stamp) {
  const settings = cloudSettings(app, patch);
  delete settings.certNextNumber;
  return recRow('template', id, { id, name, settings }, stamp);
}

/* This phone's report settings, saved to disk. */
function localReport(app, patch) {
  app.run(`state.reportSettings = Object.assign(normaliseReportSettings(state.reportSettings), ${JSON.stringify(patch)}); saveReportSettings();`);
  app.stopTimer();
}

function markSent(app, ids) {
  const st = syncState(app) || {};
  st.userId = UID_A; st.hashV = 2;
  st.sent = st.sent || {}; st.gone = st.gone || {}; st.resend = st.resend || {};
  st.rec = st.rec || { sent: {}, gone: {}, resend: {}, pulledAt: null, kinds: '' };
  st.rec.freeze = st.rec.freeze || {};
  const h = app.fn('_syncRecordHash');
  for (const id of ids) {
    if (id === REPORT) st.rec.sent[id] = h('settings', { id: REPORT, settings: rs(app) });
    else if (id === CERT) st.rec.sent[id] = h('settings', { id: CERT, next: rs(app).certNextNumber, setAt: rs(app).certSetAt });
    else st.rec.sent[id] = h('template', tpl(app, id));
  }
  app.storage.setItem('pat:syncState', JSON.stringify(st));
}

const sentIds = (app) => app.srv.rows('records').map(r => r.id);

module.exports = async function () {
  /* ------------------------------------------------------------------ 21a */
  t.group('21a — applying a template keeps the certificate counter (pre-existing since v36)', () => {
    const app = freshApp();
    app.run(`state.reportSettings.certEnabled = true; state.reportSettings.certNextNumber = 7; saveReportSettings();`);
    app.fn('saveCurrentAsTemplate')('ZZ Old identity');
    app.run(`state.reportSettings.certNextNumber = 42; state.reportSettings.companyName = 'ZZ Now'; saveReportSettings();`);
    const old = app.state().reportTemplates.find(x => x.name === 'ZZ Old identity');
    app.fn('applyReportTemplate')(old.id);
    t.ok(confirmSheet(app, 'yes'), 'the apply confirm was wired');
    t.eq(app.state().reportSettings.certNextNumber, 42, 'the counter stays where it was, not rewound to 7');
    t.eq(app.state().reportSettings.companyName, '', 'while everything else the template holds is applied');
    t.includes(app.storage.getItem('pat:reportsettings'), '"certNextNumber":42', 'and that is what reached the disk');
    app.fn('applyReportTemplate')('tpl_standard');
    t.ok(confirmSheet(app, 'yes'), 'the starter\u2019s confirm was wired');
    t.eq(app.state().reportSettings.certNextNumber, 42, 'the \u201cStandard\u201d starter no longer resets it to 1');
    // Source-guarded: the sandbox's clock and random source make the two id
    // shapes indistinguishable by value.
    const src = fs.readFileSync(path.join(APP_DIR, 'settings-actions.js'), 'utf8');
    const fn = src.slice(src.indexOf('function saveCurrentAsTemplate('), src.indexOf('function renameReportTemplate(')).replace(/\/\/[^\n]*/g, '');
    t.ok(/'tpl_' \+ newId\(\)/.test(fn) && !/Math\.random/.test(fn), 'a new template gets a real id (newId), not a short random one');
  });

  /* ------------------------------------------------------------------ 21b */
  t.group('21b — stamping skips a number a job here already has', () => {
    const app = freshApp();
    app.run(`state.reportSettings.certEnabled = true; state.reportSettings.certPrefix = 'ZZ-'; state.reportSettings.certNextNumber = 5; saveReportSettings();`);
    const a = withSession(app, { site: 'ZZ Pulled job' }); withItem(app);
    app.run(`state.sessions.find(s => s.id === ${JSON.stringify(a.id)}).certNo = 'ZZ-0005';`);
    const b = withSession(app, { site: 'ZZ Pulled job 2' }); withItem(app);
    app.run(`state.sessions.find(s => s.id === ${JSON.stringify(b.id)}).certNo = 'ZZ-0006';`);
    const c = withSession(app, { site: 'ZZ New job' }); withItem(app);
    const sess = app.state().sessions.find(s => s.id === c.id);
    app.fn('stampCertNumber')(sess);
    t.eq(app.state().sessions.find(s => s.id === c.id).certNo, 'ZZ-0007', 'the two numbers already on jobs are stepped over');
    t.eq(app.state().reportSettings.certNextNumber, 8, 'and the counter continues after the one used');
    const d = withSession(app, { site: 'ZZ Clean' }); withItem(app);
    app.fn('stampCertNumber')(app.state().sessions.find(s => s.id === d.id));
    t.eq(app.state().sessions.find(s => s.id === d.id).certNo, 'ZZ-0008', 'a free number is used as it stands');
  });

  /* ------------------------------------------------------------------ 21c */
  t.group('21c — a counter typed in by hand is marked as a deliberate set; a re-render is not', () => {
    const app = freshApp();
    app.run(`state.reportSettings.certEnabled = true; state.reportSettings.certNextNumber = 30; setView('settingsReport'); render();`);
    const input = app.doc.getElementById('report-cert-next');
    t.ok(!!input, 'the counter box is on the page');
    input.value = '30';                                  // what the page shows
    app.fn('captureReportTextInputs')();
    t.notOk(app.state().reportSettings.certSetAt, 'capturing an unchanged box does not count as a set (toggles do this)');
    input.value = '1';
    app.fn('captureReportTextInputs')();
    t.eq(app.state().reportSettings.certNextNumber, 1, 'the typed number is taken');
    t.ok(!isNaN(Date.parse(app.state().reportSettings.certSetAt)), 'and the moment it was set is recorded');
  });

  /* ------------------------------------------------------------------ 21d */
  await t.group('21d — a fresh phone sends nothing it did not make, and says it is up to date', async () => {
    const app = signedIn();
    await app.fn('syncPull')();
    await tick(5);
    const ids = sentIds(app);
    t.eq(ids.filter(i => i === REPORT || i === CERT || i === 'tpl_standard' || i === 'tpl_summary').length, 0,
      'no default report settings, counter at 1, or untouched starter goes up');
    const sum = app.fn('syncStatusSummary')();
    t.eq(sum.rpTotal, 3, 'the page counts the report settings and the two starters');
    t.eq(sum.rpUpToDate, 3, 'and calls them up to date \u2014 there is nothing to send');
    const req = app.srv.gets('records')[0];
    t.includes(decodeURIComponent(req.url), 'template', 'the records read asks for templates');
  });

  /* ------------------------------------------------------------------ 21e */
  await t.group('21e — an untouched phone takes the account\u2019s report settings without asking, keeping its own counter', async () => {
    const app = signedIn();
    app.srv.tables.records.push(reportRow(app, { enabled: true, companyName: 'ZZ Birchley PAT', logo: LOGO }));
    app.run(`state.reportSettings.certNextNumber = 1;`);
    await app.fn('syncPull')();
    await tick(5);
    t.eq(rs(app).companyName, 'ZZ Birchley PAT', 'the company name arrived');
    t.eq(rs(app).enabled, true, 'reports are switched on here too');
    t.eq(rs(app).logo, LOGO, 'the logo arrived whole');
    t.eq(held(app).length, 0, 'nothing was asked');
    t.includes(app.storage.getItem('pat:reportsettings'), 'ZZ Birchley PAT', 'it is on disk, not only in memory');
    t.eq(sentIds(app).filter(i => i === REPORT).length, 0, 'and it is not sent straight back');
    app.fn('load')();
    await app.fn('syncPull')();
    await tick(5);
    t.eq(sentIds(app).filter(i => i === REPORT).length, 0, 'after a reload it is still not a change');
  });

  /* ------------------------------------------------------------------ 21f */
  await t.group('21f — two phones branded separately: asked once, and the card never stores an image', async () => {
    const app = signedIn();
    localReport(app, { enabled: true, companyName: 'ZZ Here Ltd', logo: LOGO });
    app.srv.tables.records.push(reportRow(app, { enabled: true, companyName: 'ZZ There Ltd', logo: LOGO2 }));
    await app.fn('syncPull')();
    await tick(5);
    const h = held(app).find(e => e.id === REPORT);
    t.ok(!!h && h.reason === 'both-changed', 'held as changed on both');
    t.eq(rs(app).companyName, 'ZZ Here Ltd', 'nothing on the phone changed');
    t.eq(sentIds(app).filter(i => i === REPORT).length, 0, 'and nothing was sent over the other phone\u2019s');
    const labels = (h && h.diffs || []).map(d => d.label);
    t.ok(labels.includes('Company name') && labels.includes('Logo'), 'the card names what differs');
    const logo = (h.diffs || []).find(d => d.label === 'Logo');
    t.eq(logo && logo.cloud, 'A different image', 'an image is described, not shown');
    t.excludes(app.storage.getItem('pat:syncHeld'), 'data:image', 'no image data is stored in the held list (rule 7)');
    t.eq(syncState(app).rec.pulledAt, null, 'the cursor did not move past it');
  });

  /* ------------------------------------------------------------------ 21g */
  await t.group('21g — a cloud copy that is only the defaults gives way to this phone\u2019s', async () => {
    const app = signedIn();
    localReport(app, { enabled: true, companyName: 'ZZ Mine' });
    app.srv.tables.records.push(reportRow(app, {}));
    await app.fn('syncPull')();
    await tick(5);
    t.eq(held(app).length, 0, 'nothing asked');
    const up = app.srv.rows('records').filter(r => r.id === REPORT);
    t.eq(up.length, 1, 'this phone\u2019s settings went up');
    t.eq(up[0] && up[0].doc.settings.companyName, 'ZZ Mine', 'with its own company name');
    t.eq(up[0] && up[0].doc.settings.certNextNumber, undefined, 'and without the counter (it has its own row)');
  });

  /* ------------------------------------------------------------------ 21h */
  await t.group('21h — changed on the other phone applies; both changed is asked; each answer does what it says', async () => {
    const app = signedIn();
    localReport(app, { enabled: true, companyName: 'ZZ Agreed', certNextNumber: 12 });
    markSent(app, [REPORT]);
    app.srv.tables.records.push(reportRow(app, { enabled: true, companyName: 'ZZ Renamed There' }));
    await app.fn('syncPull')();
    await tick(5);
    t.eq(rs(app).companyName, 'ZZ Renamed There', 'a clean phone takes the other phone\u2019s change');
    t.eq(rs(app).certNextNumber, 12, 'and keeps its own counter');

    localReport(app, { companyName: 'ZZ Edited Here' });
    const at = app.srv.tables.records.findIndex(r => r.id === REPORT);
    app.srv.tables.records[at] = reportRow(app, { enabled: true, companyName: 'ZZ Edited There' }, '2026-09-04T10:00:00.000Z');
    await app.fn('syncPull')();
    await tick(5);
    t.ok(held(app).some(e => e.id === REPORT && e.reason === 'both-changed'), 'both changed: held');
    const before = syncState(app).rec.inUse;
    await app.fn('syncHeldResolve')('settings/' + REPORT, 'cloud');
    await tick(5);
    t.eq(rs(app).companyName, 'ZZ Edited There', '\u201cUse the cloud\u2019s\u201d takes it');
    t.eq(rs(app).certNextNumber, 12, 'still keeping this phone\u2019s counter');
    t.eq(syncState(app).rec.inUse, before, 'and the tester-in-use bookkeeping is untouched');
    t.eq(held(app).filter(e => e.id === REPORT).length, 0, 'the question is gone');
  });

  /* ------------------------------------------------------------------ 21i */
  await t.group('21i — the counter: never asked; a later hand-set wins, else the higher number', async () => {
    const app = signedIn();
    localReport(app, { certNextNumber: 10 });
    app.srv.tables.records.push(certRow(25));
    await app.fn('syncPull')();
    await tick(5);
    t.eq(rs(app).certNextNumber, 25, 'the other phone is further on: taken');
    t.eq(held(app).length, 0, 'never asked');

    const app2 = signedIn();
    localReport(app2, { certNextNumber: 40 });
    markSent(app2, [CERT]);                                   // this phone last sent 40…
    app2.srv.tables.records.push(certRow(33));                // …and a slower phone overwrote it with 33
    await app2.fn('syncPull')();
    await tick(5);
    t.eq(rs(app2).certNextNumber, 40, 'this phone is further on: kept');
    const up = app2.srv.rows('records').filter(r => r.id === CERT);
    t.eq(up.length && up[up.length - 1].doc.next, 40, 'and sent back up over the lower number');

    const app3 = signedIn();
    localReport(app3, { certNextNumber: 90 });
    app3.srv.tables.records.push(certRow(1, '2026-09-02T09:00:00.000Z'));
    await app3.fn('syncPull')();
    await tick(5);
    t.eq(rs(app3).certNextNumber, 1, 'a number deliberately reset on the other phone is taken, though lower');

    const app4 = signedIn();
    localReport(app4, { certNextNumber: 3, certSetAt: '2026-09-05T09:00:00.000Z' });
    app4.srv.tables.records.push(certRow(70, '2026-09-01T09:00:00.000Z'));
    await app4.fn('syncPull')();
    await tick(5);
    t.eq(rs(app4).certNextNumber, 3, 'this phone\u2019s later deliberate set beats a higher number');
    const up4 = app4.srv.rows('records').filter(r => r.id === CERT);
    t.eq(up4.length && up4[up4.length - 1].doc.next, 3, 'and goes up');
  });

  /* ------------------------------------------------------------------ 21j */
  await t.group('21j — with Report settings open, nothing is applied under it and nothing unsaved is sent', async () => {
    // (a) Just open, nothing changed here. A change applied now would be
    // written back over by the page's Save, so it waits for the page to close.
    const app = signedIn();
    localReport(app, { enabled: true, companyName: 'ZZ Before', certNextNumber: 5 });
    markSent(app, [REPORT, CERT]);
    app.run(`setView('settingsReport'); render();`);
    app.srv.tables.records.push(reportRow(app, { enabled: true, companyName: 'ZZ From There' }), certRow(50));
    await app.fn('syncPull')();
    await tick(5);
    t.eq(held(app).length, 0, 'nothing here changed, so nothing is asked');
    t.eq(rs(app).companyName, 'ZZ Before', 'the open page\u2019s settings are not replaced');
    t.eq(rs(app).certNextNumber, 5, 'nor the counter it shows');
    t.eq(syncState(app).rec.pulledAt, null, 'the cursor waits');
    app.run(`setView('settings');`);
    app.stopTimer();
    await app.fn('syncPull')();
    await tick(5);
    t.eq(rs(app).companyName, 'ZZ From There', 'once the page is left, the change applies');
    t.eq(rs(app).certNextNumber, 50, 'and the counter follows');

    // (b) A toggle flipped on the open page, not yet saved, nothing in the cloud.
    const app2 = signedIn();
    localReport(app2, { enabled: true, companyName: 'ZZ Saved', certNextNumber: 5 });
    markSent(app2, [REPORT, CERT]);
    app2.run(`setView('settingsReport'); render(); state.reportSettings.showFails = false; state.reportSettings.certNextNumber = 6;`);
    await app2.fn('syncPull')();
    await tick(5);
    t.eq(sentIds(app2).filter(i => i === REPORT || i === CERT).length, 0, 'the unsaved state is not sent');
    app2.run(`setView('settings');`);
    app2.stopTimer();
    await app2.fn('syncPull')();
    await tick(5);
    t.eq(sentIds(app2).filter(i => i === REPORT).length, 1, 'once the page is left, it goes');
  });

  /* ------------------------------------------------------------------ 21k */
  await t.group('21k — templates travel: add, delete both ways, starters as one record', async () => {
    const app = signedIn();
    app.srv.tables.records.push(tplRow(app, 'tpl_zzremote', 'ZZ Remote Template', { companyName: 'ZZ R' }));
    const std = tplRow(app, 'tpl_standard', 'Standard', { enabled: true, companyName: 'ZZ Edited Standard' });
    app.srv.tables.records.push(std);
    await app.fn('syncPull')();
    await tick(5);
    t.eq(tpl(app, 'tpl_zzremote') && tpl(app, 'tpl_zzremote').name, 'ZZ Remote Template', 'a template made elsewhere arrives');
    t.eq(tpl(app, 'tpl_standard').settings.companyName, 'ZZ Edited Standard', 'an untouched starter takes the account\u2019s edit');
    t.eq(held(app).length, 0, 'without a question');
    t.includes(app.storage.getItem('pat:reporttemplates'), 'ZZ Remote Template', 'on disk');

    app.fn('deleteReportTemplate')('tpl_zzremote');
    t.ok((app.state().tombstones || []).some(x => x.kind === 'template' && x.id === 'tpl_zzremote'), 'a delete is in the ledger');
    t.includes(app.storage.getItem('pat:tombstones'), 'tpl_zzremote', 'and the ledger reached the disk');
    app.stopTimer();
    await app.fn('syncPull')();
    await tick(5);
    const del = app.srv.rows('records').filter(r => r.id === 'tpl_zzremote' && r.deleted === true);
    t.eq(del.length, 1, 'the delete goes up');

    // A starter deleted here, never sent, while the cloud holds it.
    const app2 = signedIn();
    app2.srv.tables.records.push(tplRow(app2, 'tpl_summary', 'Client summary', { companyName: 'ZZ Summary There' }));
    app2.fn('deleteReportTemplate')('tpl_summary');
    app2.stopTimer();
    await app2.fn('syncPull')();
    await tick(5);
    await app2.fn('syncPull')();
    await tick(5);
    t.eq(app2.srv.rows('records').filter(r => r.id === 'tpl_summary' && r.deleted === true).length, 1,
      'a starter deleted here reaches the cloud as a delete, though this phone never sent it');

    // The cloud holds only an untouched starter; this phone edited its own.
    const app3 = signedIn();
    app3.run(`state.reportTemplates.find(x => x.id === 'tpl_standard').settings.companyName = 'ZZ Mine'; saveReportTemplates();`);
    app3.stopTimer();
    const plain = app3.run(`JSON.stringify(makeStarterReportTemplates()[0])`);
    const p = JSON.parse(plain); delete p.settings.certNextNumber;
    app3.srv.tables.records.push(recRow('template', 'tpl_standard', p));
    await app3.fn('syncPull')();
    await tick(5);
    t.eq(held(app3).length, 0, 'an untouched cloud starter is not a clash');
    const up = app3.srv.rows('records').filter(r => r.id === 'tpl_standard');
    t.eq(up.length && up[0].doc.settings.companyName, 'ZZ Mine', 'this phone\u2019s edit goes up');

    const h = app3.fn('_syncRecordHash');
    const a = JSON.parse(plain), b = JSON.parse(plain);
    a.settings.certNextNumber = 3; b.settings.certNextNumber = 900;
    t.eq(h('template', a), h('template', b), 'a template\u2019s counter is not part of what it is (3A)');
  });

  /* ------------------------------------------------------------------ 21l */
  await t.group('21l — templates changed on both sides are asked, under their own heading', async () => {
    const app = signedIn();
    app.run(`state.reportTemplates.push({ id: 'tpl_zzboth', name: 'ZZ Both', settings: normaliseReportSettings({ companyName: 'ZZ A' }) }); saveReportTemplates();`);
    app.stopTimer();
    markSent(app, ['tpl_zzboth']);
    app.run(`state.reportTemplates.find(x => x.id === 'tpl_zzboth').name = 'ZZ Both (here)'; saveReportTemplates();`);
    app.stopTimer();
    app.srv.tables.records.push(tplRow(app, 'tpl_zzboth', 'ZZ Both', { companyName: 'ZZ B' }));
    await app.fn('syncPull')();
    await tick(5);
    const h = held(app).find(e => e.id === 'tpl_zzboth');
    t.ok(!!h && h.reason === 'both-changed', 'held');
    const labels = (h && h.diffs || []).map(d => d.label);
    t.ok(labels.includes('Name') && labels.includes('Company name'), 'the card names the name and the setting that differ');
    app.run(`state.cloud = Object.assign({}, state.cloud || {}, { status: 'signed-in' }); state.cloudPage = 'sync';`);
    const html = app.fn('renderSyncHeld')(app.state().sync || {});
    t.includes(html, 'sync-held-reports', 'it sits under its own heading');
    t.includes(html, 'Report template', 'labelled as a report template');
  });

  /* ------------------------------------------------------------------ 21m */
  await t.group('21m — the Sync page message: report changes counted, the counter never', async () => {
    const app = signedIn();
    localReport(app, { enabled: true, companyName: 'ZZ Msg', certNextNumber: 30 });
    app.srv.tables.records.push(certRow(20));                // ours is further on: both go up
    await app.fn('syncPull')();
    await tick(5);
    t.eq(sentIds(app).filter(i => i === REPORT || i === CERT).length, 2, 'the settings and the counter both went up');
    const msg = String(app.run('state.sync.message') || '');
    t.includes(msg, 'Report settings & templates: 1 change sent.', 'only the settings are reported as a change');

    const app2 = signedIn();
    localReport(app2, { enabled: true, companyName: 'ZZ Quiet', certNextNumber: 9 });
    markSent(app2, [REPORT]);
    app2.srv.tables.records.push(certRow(50));               // the other phone is further on
    await app2.fn('syncPull')();
    await tick(5);
    t.eq(rs(app2).certNextNumber, 50, 'the counter came in');
    t.excludes(String(app2.run('state.sync.message') || ''), 'Report settings', 'and is not reported as a change');
  });

  /* ------------------------------------------------------------------ 21n */
  await t.group('21n — more than one page of templates, stamped one per batch, all arrive (rule 14)', async () => {
    const app = signedIn();
    const rows = [];
    for (let i = 0; i < 230; i++) {
      const stamp = '2026-09-02T10:' + String(Math.floor(i / 25)).padStart(2, '0') + ':00.000Z';
      rows.push(tplRow(app, 'tpl_zzp' + i, 'ZZ Page ' + i, {}, stamp));
    }
    rows.push(reportRow(app, { enabled: true, companyName: 'ZZ Last Row' }, '2026-09-02T10:09:00.000Z'));
    app.srv.tables.records.push(...rows);
    await app.fn('syncPull')();
    await tick(5);
    const got = app.state().reportTemplates.filter(x => /^tpl_zzp/.test(x.id)).length;
    t.eq(got, 230, 'every template arrived');
    t.eq(rs(app).companyName, 'ZZ Last Row', 'and the report settings row after them');
    t.ok(app.srv.gets('records').length >= 2, 'it took more than one page');
  });

  /* ------------------------------------------------------------------ 21o */
  await t.group('21o — a full-size logo and signature go up in batches the server will take', async () => {
    const app = signedIn();
    const big = 'data:image/png;base64,' + 'Q'.repeat(300000);
    const sig = 'data:image/png;base64,' + 'S'.repeat(120000);
    localReport(app, { enabled: true, companyName: 'ZZ Big', logo: big, signature: sig });
    app.run(`for (let i = 0; i < 3; i++) state.reportTemplates.push({ id: 'tpl_zzbig' + i, name: 'ZZ Big ' + i, settings: normaliseReportSettings(state.reportSettings) }); saveReportTemplates();`);
    app.stopTimer();
    await app.fn('syncPull')();
    await tick(5);
    const posts = app.srv.posts('records');
    const limit = app.val('SYNC_BATCH_BYTES');
    t.ok(posts.every(p => p.len <= limit + 1000 || (Array.isArray(p.body) && p.body.length === 1)),
      'no upload is over the batch size unless it is one row on its own');
    const ids = sentIds(app);
    t.ok(ids.includes(REPORT) && ['tpl_zzbig0', 'tpl_zzbig1', 'tpl_zzbig2'].every(i => ids.includes(i)), 'and every one of them went');
    const r = app.srv.tables.records.find(x => x.id === REPORT);
    t.eq(r && r.doc.settings.logo.length, big.length, 'the logo arrived in the cloud whole');
  });

  /* ------------------------------------------------------------------ 21p */
  t.group('21p — the deliberate-set time survives backup and reload; older data reads as never set', () => {
    const app = freshApp();
    app.run(`state.reportSettings.certSetAt = '2026-09-05T09:00:00.000Z'; saveReportSettings();`);
    app.fn('load')();
    t.eq(app.state().reportSettings.certSetAt, '2026-09-05T09:00:00.000Z', 'kept across a reload');
    const n = app.fn('normaliseReportSettings');
    t.eq(n({ certNextNumber: 4 }).certSetAt, '', 'a pre-V84 blob has no set time');
    t.eq(n({ certSetAt: 'garbage' }).certSetAt, '', 'garbage collapses to never');
    const bk = JSON.parse(JSON.stringify(app.fn('buildBackup')()));
    t.eq(bk.reportSettings && bk.reportSettings.certSetAt, '2026-09-05T09:00:00.000Z', 'it rides in the backup');
    t.ok(app.fn('normaliseTombstones')([{ kind: 'template', id: 'tpl_x', at: T1 }]).length === 1, 'the ledger accepts a template delete');
  });

  /* ------------------------------------------------------------------ 21q */
  t.group('21q — report saves reach the sync trigger; the pull never re-arms itself', () => {
    const app = signedIn();
    app.run(`_syncTimer = null;`);
    app.fn('saveReportSettings')();
    t.ok(app.run('!!_syncTimer'), 'saving report settings arms a sync');
    app.stopTimer();
    app.fn('saveReportTemplates')();
    t.ok(app.run('!!_syncTimer'), 'saving templates arms a sync');
    app.stopTimer();
    app.run(`_syncSaveLists();`);
    t.notOk(app.run('!!_syncTimer'), 'what the pull saves does not arm another run');
  });
};
