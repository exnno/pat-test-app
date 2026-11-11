/* Standing test — V154: ids checked on the way in, stored values escaped in the page
   (audit finding 3)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   Peter, 8 Nov — 1A (ids, the logo and signature, and anything else the sweep
   finds, plus a permanent check) 2A (a backup file with a bad id is refused
   whole, nothing touched) 3A (a cloud job with one is never brought onto the
   phone; the Sync page says so) 4A (the database refuses one too —
   supabase/v154-safe-ids.sql, checked by hand) 5A (one already on a phone is
   kept, shown safely, never sent; the Sync page says so). Before V154 a job's
   id, an item's result, a job's date and the logo / signature went into the
   page as written, from a backup file or the cloud. What these pin:
     93a  The permanent check: no ${…} in page markup puts a stored value in
          without escapeHTML() (harness/markup-scan.js), bar the named list
          below — each entry said why, and counted exactly.
     93b  On screen: a job with a hostile id, date and result is shown as text
          on the Jobs list, the job, the entry screen, the retest list and the
          certificates list; tapping it still opens it; a logo or signature
          that isn't a picture is dropped at load, a real one kept.
     93c  2A: a backup file with a bad job or item id is refused whole — the
          sheet says so, nothing on the phone changes; every id PATGo has ever
          made passes; a logo that isn't a picture is named in the confirm and
          left out.
     93d  3A + 5A: the pull never brings a bad cloud job down (its own id or an
          item's), notes it for the Sync page, forgets it when the cloud row is
          deleted; every other way in refuses it (_syncValidDoc). A bad job on
          the phone is kept, never sent, its delete never sent; the Sync page
          says so.
     93e  V154 carried: the update banner reads its key (its release checks moved to 94e in V155).
     93f  4A: schema.sql carries v154-safe-ids.sql's rules byte for byte, and the
          app and the database use the same patterns.

   ⚠ WHAT THIS FILE CANNOT PROVE: a real browser parsing the markup (the stub
   DOM keeps innerHTML as a string) — the release's browser check does that; and
   the database rule (supabase/v154-safe-ids.sql reports its own checks). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { freshApp, tick, restoreFile, RECENT_DATE } = require('../fixture');
const { scan } = require('../markup-scan');

const LIB  = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;
const UID  = '11111111-1111-1111-1111-111111111111';

// The payloads a tampered file would carry. Each would run script if it reached
// the page as written.
const BAD_ID   = 'x" onmouseover="alert(1)';
const BAD_TAG  = '<img src=x onerror=alert(1)>';
const PNG      = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const raw = (s) => [BAD_ID, BAD_TAG, '" onerror="'].filter(p => s.indexOf(p) !== -1);

/* ---- 93a: the named exceptions — a stored-looking field that is safe as written.
   `n` is how many times it occurs; a new copy of it anywhere fails, as does an
   entry that no longer matches (the list can't go stale). */
const ALLOWED = [
  { file: 'plan.js',            expr: 'opts.id',     n: 3, why: 'a sheet id the code passes in (plan.js), never stored data' },
  { file: 'render-core.js',     expr: 't.id',        n: 1, why: 'REPORT_COLOR_THEMES — a fixed list in the code' },
  { file: 'render-core.js',     expr: 't.header',    n: 1, why: 'REPORT_COLOR_THEMES — a fixed list in the code' },
  { file: 'render-core.js',     expr: 'tl.qp',       n: 2, why: 'a whole number 1–3 (multipick.js qpTiles checks Number.isInteger)' },
  { file: 'render-core.js',     expr: 'worst.name',  n: 3, why: 'plain text for a label that is escaped where it is shown (renderCalWarningBanner)' },
  { file: 'render-help.js',     expr: 't.id',        n: 1, why: 'BUG_REPORT_TYPES — a fixed list in the code' },
  { file: 'render-help.js',     expr: 's.id',        n: 1, why: 'BUG_REPORT_SEVERITIES — a fixed list in the code' },
  { file: 'render-help.js',     expr: 'r.id',        n: 1, why: 'the bug report repro choices — a fixed list in the code' },
  { file: 'render-review.js',   expr: "sess.certNo ? ' (No. ' + sess.certNo + ')' : ''", n: 1, why: 'plain text for a note escaped where it is shown (move-job-warn)' },
  { file: 'render-review.js',   expr: "target.certNo ? ' (No. ' + target.certNo + ')' : ''", n: 1, why: 'plain text for a note escaped where it is shown (move-job-warn)' },
  { file: 'render-settings.js', expr: 'activeP.name', n: 1, why: 'a Settings row subtitle — escaped where it is shown (settingsPageRowHTML)' },
  { file: 'render-settings.js', expr: 'rs.companyName', n: 1, why: 'a Settings row subtitle — escaped where it is shown (settingsPageRowHTML)' },
  { file: 'render-settings.js', expr: 'c.email',     n: 1, why: 'a Settings row subtitle — escaped where it is shown (settingsPageRowHTML)' },
  { file: 'render-settings.js', expr: 'meta.title',  n: 1, why: 'Settings search text, never put in the page' },
  { file: 'render-settings.js', expr: 'cat.id',      n: 1, why: 'the Settings categories — a fixed list in the code' },
  { file: 'render-settings.js', expr: 't.id',        n: 1, why: 'REPORT_COLOR_THEMES — a fixed list in the code' },
  { file: 'render-settings.js', expr: 't.header',    n: 1, why: 'REPORT_COLOR_THEMES — a fixed list in the code' },
  { file: 'render-settings.js', expr: 't.accent',    n: 1, why: 'REPORT_COLOR_THEMES — a fixed list in the code' },
];

function firstParty() {
  return fs.readdirSync(APP_DIR).filter(f => f.endsWith('.js') && !/\.min\.js$|umd\.js$|^jspdf|autotable/i.test(f)).sort();
}

function scanAll(srcFor) {
  let out = [];
  for (const f of firstParty()) out = out.concat(scan(f, srcFor(f), /^render-/.test(f)));
  return out;
}

// A job PATGo never made: hostile id, date and result. Safe item ids, so the
// only thing wrong is what the page would do with it.
function hostileJob() {
  return {
    id: BAD_ID, name: 'Hostile', site: 'Depot', client: 'ACME', date: BAD_TAG, startNumber: 1, locked: false,
    retestTrack: true, retestMonths: 12,
    items: [
      { id: 'h1', assetNo: '1', location: 'Office', itemType: 'Kettle', notes: '', result: BAD_TAG },
      { id: 'h2', assetNo: '2', location: 'Office', itemType: 'Toaster', notes: '', result: 'pass' },
    ],
  };
}

function backupOf(sessions, extra) {
  return Object.assign({ app: 'PATGo', backupVersion: 5, exportedAt: new Date().toISOString(), sessions }, extra || {});
}

function fileOf(app, obj) {
  return new app.sandbox.Blob([JSON.stringify(obj)], { type: 'application/json' });
}

function catchSheets(app) {
  const got = { info: [], confirm: [] };
  const realInfo = app.sandbox.openInfoSheet, realConfirm = app.sandbox.openConfirmSheet;
  app.sandbox.openInfoSheet = (o) => { got.info.push(o); return realInfo(o); };
  app.sandbox.openConfirmSheet = (o) => { got.confirm.push(o); return realConfirm(o); };
  return got;
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

/* ---- 93d: a server that answers a pull (as 17-pull.js) ---- */
function fakeServer(rows) {
  const calls = [];
  const cloud = rows.slice();
  const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    let body = null;
    try { body = init.body ? JSON.parse(init.body) : null; } catch { body = init.body; }
    calls.push({ url: u, method, body });
    if (u.includes('/rest/v1/sessions')) {
      if (method === 'GET') {
        const q = new URLSearchParams(u.split('?')[1] || '');
        let list = cloud.slice();
        const gt = q.get('updated_at');
        if (gt && gt.startsWith('gt.')) list = list.filter(r => r.updated_at > gt.slice(3));
        else if (gt && gt.startsWith('gte.')) list = list.filter(r => r.updated_at >= gt.slice(4));
        list.sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)));
        return json(list);
      }
      for (const row of (Array.isArray(body) ? body : [])) {
        const i = cloud.findIndex(r => String(r.id) === String(row.id));
        const stored = Object.assign({}, row, { updated_at: '2026-11-08T12:00:00.000Z' });
        if (i === -1) cloud.push(stored); else cloud[i] = stored;
      }
      return new Response(null, { status: 201 });
    }
    if (u.includes('/rest/v1/profiles')) return json([{ plan: 'trial', trial_ends_at: null }]);
    if (u.endsWith('/rest/v1/rpc/my_businesses')) return json([]);
    if (u.endsWith('/rest/v1/rpc/my_job_moves')) return json([]);
    return json({ message: 'unexpected ' + u }, 404);
  };
  return {
    calls, cloud, fetchImpl,
    sent: () => calls.filter(c => c.url.includes('/rest/v1/sessions') && c.method === 'POST')
                     .flatMap(c => Array.isArray(c.body) ? c.body : []),
  };
}

function storedSession() {
  return JSON.stringify({
    access_token: 'ZZACCESS154', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'ZZREFRESH',
    user: { id: UID, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' },
  });
}

async function signedIn(rows, sessions) {
  const ls = { 'patgo:cloudAuth:test': storedSession(), 'pat:cloudUnlocked': '1' };
  const app = bootApp({ localStorage: ls, navigator: { onLine: false } });
  app.fn('load')();
  app.state = () => app.refresh('state').state;
  const srv = fakeServer(rows || []);
  const sb = app.sandbox;
  for (const k of ['Headers', 'Request', 'Response', 'AbortController', 'TextEncoder',
                   'TextDecoder', 'URLSearchParams', 'URL', 'atob', 'btoa', 'Blob']) sb[k] = globalThis[k];
  if (!sb.crypto) sb.crypto = globalThis.crypto;
  sb.WebSocket = class {};
  sb.fetch = srv.fetchImpl;
  app.run(LIB);
  app.run('navigator.onLine = true');
  app.srv = srv;
  app.stop = () => app.run('if (typeof _syncTimer !== "undefined" && _syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }');
  app.stop();
  for (let k = 0; k < 100 && app.run("(state.cloud && state.cloud.status) || ''") !== 'signed-in'; k++) await tick(10);
  const st = app.state();
  st.welcomeSeen = true;
  st.migrationPrompt = { show: false, name: '', items: [] };
  if (sessions) { st.sessions = sessions.concat(st.sessions || []); app.fn('saveSessions')(); app.stop(); }
  return app;
}

function cloudRow(id, doc, at, deleted) {
  return { id, doc: deleted ? {} : doc, deleted: !!deleted, last_modified: at, updated_at: at };
}
function cloudDoc(id, itemIds) {
  return { id, site: 'Cloud ' + id.slice(0, 6), name: '', date: RECENT_DATE, startNumber: 1, locked: false,
    items: itemIds.map((iid, i) => ({ id: iid, assetNo: String(i + 1), location: 'L', itemType: 'Kettle', notes: '', result: 'pass' })) };
}
const syncSt = (app) => JSON.parse(app.storage.getItem('pat:syncState') || 'null') || {};

module.exports = async function () {

  /* ------------------------------------------------------------------ 93a */
  await t.group('93a — the permanent check: no stored value in page markup without escapeHTML (bar the named list)', () => {
    const hits = scanAll(read);
    const key = (f, e) => f + '|' + e;
    const counts = new Map();
    for (const h of hits) counts.set(key(h.file, h.expr), (counts.get(key(h.file, h.expr)) || 0) + 1);
    const allowed = new Map(ALLOWED.map(a => [key(a.file, a.expr), a]));
    const unlisted = hits.filter(h => !allowed.has(key(h.file, h.expr))).map(h => `${h.file}:${h.line} ${h.hits.join(',')} — \${${h.expr}}`);
    t.deepEq(unlisted, [], 'every stored value in markup goes through escapeHTML() — escape it, or (only if it truly is not stored data) list it here with why');
    const off = ALLOWED.filter(a => (counts.get(key(a.file, a.expr)) || 0) !== a.n)
      .map(a => `${a.file} ${a.expr}: listed ${a.n}, found ${counts.get(key(a.file, a.expr)) || 0}`);
    t.deepEq(off, [], 'each named exception occurs exactly as often as listed (a new raw copy fails; a stale entry fails)');
    t.ok(ALLOWED.every(a => a.why && a.why.length > 10), 'every exception says why');
    // The scan itself: it sees the forms V154 fixed (the V153 shapes, inline).
    const probe = [
      '`<a data-arg="${s.id}">`', '`<td class="${it.result}">${capitalise(it.result)}</td>`',
      '`<div>${formatDate(s.date)}</div>`', '`<img src="${rs.logo}">`', '`data-arg="${sess.id}"`',
    ];
    for (const p of probe) t.ok(scan('probe.js', p).length >= 1, 'the scan sees ' + p);
    const fine = [
      '`<a data-arg="${escapeHTML(s.id)}">`', '`<b>${s.items.length}</b>`', '`<b class="${s.locked ? \'x\' : \'\'}">`',
      '`<b>${escapeHTML(formatDate(s.date))}</b>`', '`<b>${s.id === d.id ? \'on\' : \'\'}</b>`',
    ];
    for (const p of fine) t.eq(scan('probe.js', p).length, 0, 'and passes ' + p);
  });

  /* ------------------------------------------------------------------ 93b */
  await t.group('93b — on screen: a hostile id, date and result are text; tapping still opens the job; logos', async () => {
    const app = freshApp();
    const st = app.refresh('state').state;
    st.welcomeSeen = true;
    st.migrationPrompt = { show: false, name: '', items: [] };
    st.retestRemindersEnabled = true;
    st.reportSettings.enabled = true;
    st.sessions.unshift(hostileJob());
    app.run('render()');

    app.run('state.view = "sessions"; render();');
    const list = html(app);
    t.includes(list, 'Depot', 'the Jobs list shows the job');
    t.deepEq(raw(list), [], 'the Jobs list: nothing from the job reaches the page as markup');
    t.includes(list, 'data-arg="x&quot; onmouseover=&quot;alert(1)"', '…its id is escaped in the buttons');
    t.includes(list, '&lt;img src=x onerror=alert(1)&gt;', '…its date shown as text');

    tap(app, 'open-session', BAD_ID);   // what a browser hands back: the decoded id
    t.eq(app.run('state.activeId'), BAD_ID, 'tapping it opens THAT job (the escaped attribute reads back as the id)');

    app.run('state.view = "overview"; render();');
    const ov = html(app);
    t.includes(ov, 'Kettle', 'the job screen shows its items');
    t.deepEq(raw(ov), [], 'the job screen: nothing reaches the page as markup (result, id)');

    app.run('state.view = "entry"; state.cursor = 0; loadFormForCursor(); render();');
    t.deepEq(raw(html(app)), [], 'the entry screen on the hostile item: its result badge is text');
    app.run('state.cursor = 2; loadFormForCursor(); render();');
    t.deepEq(raw(html(app)), [], 'the entry screen after it: "Copy last" names its result as text');

    const rr = app.fn('renderRetestReminders')();
    t.deepEq(raw(rr), [], 'the retest list: nothing reaches the page as markup');
    const rp = app.fn('renderReports')();
    t.includes(rp, 'Depot', 'the certificates list shows the job');
    t.deepEq(raw(rp), [], 'the certificates list: nothing reaches the page as markup');

    // The logo and signature, at load.
    const pick = (ls) => { const a = bootApp({ localStorage: ls }); a.fn('load')(); return a.refresh('state').state.reportSettings; };
    const bad = pick({ 'pat:reportsettings': JSON.stringify({ enabled: true, logo: 'x" onerror="alert(1)', signature: 'javascript:alert(1)' }) });
    t.eq(bad.logo, '', 'a logo that isn’t a picture is left out at load');
    t.eq(bad.signature, '', '…and a signature');
    const good = pick({ 'pat:reportsettings': JSON.stringify({ enabled: true, logo: PNG, signature: PNG }) });
    t.eq(good.logo, PNG, 'a real logo (canvas PNG) is kept');
    t.eq(good.signature, PNG, '…and a real signature');
    t.eq(app.fn('safePicture')('data:image/jpeg;base64,/9j/4AAQ'), 'data:image/jpeg;base64,/9j/4AAQ', 'a JPEG is a picture too');
    t.eq(app.fn('safePicture')('data:image/svg+xml;base64,PHN2Zz4='), '', 'an SVG is not (it can carry script)');
    t.eq(app.fn('safePicture')(PNG + '"'), '', 'nor a picture with anything after it');
  });

  /* ------------------------------------------------------------------ 93c */
  await t.group('93c — 2A: a backup with a bad id is refused whole; every real id passes; an odd logo is named', async () => {
    const good = (id, items) => ({ id, name: 'J', site: 'S', date: '2026-11-01', items });
    // Refused: a bad job id, and (separately) a bad item id.
    for (const [label, sessions] of [
      ['a job id', [good('aaaa1111bbbb2', [{ id: 'i1', result: 'pass' }]), hostileJob()]],
      ['an item id', [good('aaaa1111bbbb3', [{ id: BAD_TAG, result: 'pass' }])]],
      ['a job that is not an object', [good('aaaa1111bbbb4', []), 'nonsense']],
    ]) {
      const app = freshApp();
      const before = app.storage.getItem('pat:sessions');
      const jobs = app.refresh('state').state.sessions.length;
      const got = catchSheets(app);
      const shown = await restoreFile(app, fileOf(app, backupOf(sessions)));
      t.ok(shown, label + ': a sheet appears');
      t.eq(got.confirm.length, 0, label + ': nothing is asked — no "Restore from backup?"');
      t.eq(got.info.length && got.info[0].title, 'This backup can’t be restored', label + ': it says it can’t be restored');
      t.includes(got.info.length ? got.info[0].message : '', 'Nothing on this phone has been changed', label + ': …and that nothing changed');
      t.eq(app.storage.getItem('pat:sessions'), before, label + ': the saved jobs are untouched');
      t.eq(app.refresh('state').state.sessions.length, jobs, label + ': …and the jobs in memory');
    }
    {
      const app = freshApp();
      const got = catchSheets(app);
      await restoreFile(app, fileOf(app, backupOf([good('a', []), good('b', []), hostileJob()])));
      t.includes(got.info.length ? got.info[0].message : '', '1 of its 3 jobs has details PATGo didn’t make', 'it counts the bad jobs');
    }
    // Every id PATGo has ever made passes.
    {
      const app = freshApp();
      const got = catchSheets(app);
      const ids = [app.run('uid()'), app.run('newId()'), 'tutorial-' + app.run('newId()'), 'v153-job', 1730000000000];
      const sessions = ids.map((id, k) => good(id, [{ id: app.run('uid()'), result: 'pass' }, { result: 'fail' }, { id: null, result: 'pass' }, { id: '', result: 'pass' }]));
      await restoreFile(app, fileOf(app, backupOf(sessions)));
      t.eq(got.info.length, 0, 'uid(), newId(), a practice id, a hyphenated id, a number, items with no id: not refused');
      t.eq(got.confirm.length, 1, '…the usual "Restore from backup?" is asked');
      t.excludes(got.confirm.length ? got.confirm[0].message : '', 'logo', '…with no word about a logo');
    }
    t.eq(freshApp().fn('safeId')('__proto__'), false, 'the three Object names are refused (they would be object keys)');
    // A logo that isn't a picture: named before anything is replaced, then left out.
    {
      const app = freshApp();
      const got = catchSheets(app);
      const data = backupOf([good('okjob1', [{ id: 'i1', result: 'pass' }])],
        { reportSettings: { enabled: true, logo: 'x" onerror="alert(1)', signature: PNG, companyName: 'ACME' } });
      await restoreFile(app, fileOf(app, data));
      t.eq(got.info.length, 0, 'an odd logo does not refuse the backup');
      t.includes(got.confirm.length ? got.confirm[0].message : '', 'Its company logo or signature isn’t a picture PATGo can use, so it will be left out.', 'the confirm says it will be left out');
      app.fn('applyBackupData')(data, { markExported: false });
      const rs = app.refresh('state').state.reportSettings;
      t.eq(rs.logo, '', 'restored: no logo');
      t.eq(rs.signature, PNG, '…the real signature kept');
      t.eq(rs.companyName, 'ACME', '…and the rest of the settings');
    }
    {
      const app = freshApp();
      const got = catchSheets(app);
      await restoreFile(app, fileOf(app, backupOf([good('okjob2', [])], { reportTemplates: [{ id: 't1', name: 'T', settings: { logo: 'javascript:x' } }] })));
      t.includes(got.confirm.length ? got.confirm[0].message : '', 'left out', 'a template’s odd logo is named too');
    }
  });

  /* ------------------------------------------------------------------ 93d */
  await t.group('93d — 3A + 5A: a bad cloud job never comes down; a bad job here is never sent; the Sync page says so', async () => {
    const T1 = '2026-11-08T09:00:00.000Z', T2 = '2026-11-08T10:00:00.000Z';
    const rows = [
      cloudRow('cloudok1', cloudDoc('cloudok1', ['c1', 'c2']), T1),
      cloudRow(BAD_ID, cloudDoc(BAD_ID, ['c3']), T1),
      cloudRow('cloudbaditem', cloudDoc('cloudbaditem', ['c4', BAD_TAG]), T1),
    ];
    const app = await signedIn(rows);
    await app.fn('syncPull')();
    await tick(5);
    app.stop();
    const ids = app.state().sessions.map(s => String(s.id));
    t.ok(ids.includes('cloudok1'), 'the good cloud job comes down');
    t.ok(!ids.includes(BAD_ID), 'a cloud job with a bad id does not');
    t.ok(!ids.includes('cloudbaditem'), '…nor one with a bad item id');
    t.deepEq(Object.keys(syncSt(app).bad || {}).sort(), [BAD_ID, 'cloudbaditem'].sort(), 'both noted for the Sync page');
    t.eq((app.fn('_syncHeldLoad')() || []).length, 0, 'nothing held — there is no copy worth choosing');
    t.ok(syncSt(app).pulledAt >= T1, 'the cursor moved on (a held row would stop it)');
    t.eq(app.fn('_syncValidDoc')(cloudDoc(BAD_ID, []), BAD_ID), false, 'every other way in refuses it: a bad job id');
    t.eq(app.fn('_syncValidDoc')(cloudDoc('fine1', ['ok', BAD_TAG]), 'fine1'), false, '…a bad item id');
    t.eq(app.fn('_syncValidDoc')(cloudDoc('fine2', ['ok']), 'fine2'), true, '…and still takes a good one');

    app.run('state.view = "cloudSync"; render();');
    const page = app.fn('renderCloudSync')();
    t.includes(page, 'id="sync-bad-cloud"', 'the Sync page: the line');
    t.includes(page, '2 jobs in the cloud couldn’t be brought down safely', '…in plain words');
    t.excludes(page, 'id="sync-bad-here"', '…and no "on this phone" line');

    // Deleted in the cloud: forgotten.
    app.srv.cloud.push(cloudRow(BAD_ID, null, T2, true));
    await app.fn('syncPull')();
    await tick(5);
    app.stop();
    t.deepEq(Object.keys(syncSt(app).bad || {}), ['cloudbaditem'], 'a bad row deleted in the cloud is forgotten');
    t.includes(app.fn('renderCloudSync')(), '1 job in the cloud couldn’t be brought down safely', '…the line counts what is left');

    // 5A: a bad job already on this phone.
    const here = hostileJob();
    const app2 = await signedIn([], [here, { id: 'okhere1', name: 'Fine', site: 'Fine', date: RECENT_DATE, items: [{ id: 'f1', assetNo: '1', itemType: 'Kettle', result: 'pass' }] }]);
    await app2.fn('syncPull')();
    await tick(5);
    app2.stop();
    const sent = app2.srv.sent().map(r => String(r.id));
    t.ok(sent.includes('okhere1'), 'the good job here is sent');
    t.ok(!sent.includes(BAD_ID), 'the bad job here is never sent');
    t.ok(app2.state().sessions.some(s => s.id === BAD_ID), '…and is kept on the phone');
    const pg = app2.fn('renderCloudSync')();
    t.includes(pg, '1 job on this phone isn’t sent to the cloud', 'the Sync page says so');
    t.includes(pg, 'It stays safe on this phone.', '…and that it is safe');
    t.eq(app2.fn('syncStatusSummary')().total, 1, 'it is not counted as waiting to send');
    // Its delete is never sent either (even if the cloud were thought to have it).
    const st2 = syncSt(app2);
    st2.sent[BAD_ID] = 'pretend';
    app2.storage.setItem('pat:syncState', JSON.stringify(st2));
    app2.run(`state.sessions = state.sessions.filter(s => s.id !== ${JSON.stringify(BAD_ID)}); state.tombstones = (state.tombstones || []).concat([{ kind: 'session', id: ${JSON.stringify(BAD_ID)}, at: new Date().toISOString() }]); saveSessions();`);
    app2.stop();
    const before = app2.srv.sent().length;
    await app2.fn('syncPull')();
    await tick(5);
    app2.stop();
    t.eq(app2.srv.sent().slice(before).filter(r => String(r.id) === BAD_ID).length, 0, 'its delete is never sent');
  });

  /* ------------------------------------------------------------------ 93f */
  await t.group('93f — 4A: the database rule — schema.sql in step with v154-safe-ids.sql, the same patterns as the app', () => {
    const mig = read('supabase/v154-safe-ids.sql');
    const block = mig.slice(mig.indexOf('-- ------------------------------------------------- the patterns'),
      mig.indexOf('-- ------------------------------------------------- self-checks')).trimEnd();
    t.ok(block.length > 1000, 'the migration has its patterns and rules');
    t.includes(read('supabase/schema.sql'), block, 'a new project gets them byte for byte (schema.sql)');
    const app = freshApp();
    t.eq(app.run('SAFE_ID_RE.source'), '^[A-Za-z0-9_-]{1,80}$', 'the app’s id pattern…');
    t.includes(mig, "t ~ '^[A-Za-z0-9_-]{1,80}$'", '…is the database’s');
    t.includes(mig, "('__proto__', 'constructor', 'prototype')", '…refusing the same three names');
    t.eq(app.run('SAFE_PICTURE_RE.source'), '^data:image\\/(png|jpeg);base64,[A-Za-z0-9+/]*={0,2}$', 'the app’s picture pattern…');
    t.includes(mig, "'^data:image/(png|jpeg);base64,[A-Za-z0-9+/]*={0,2}$'", '…is the database’s');
    t.includes(mig, "add constraint sessions_safe_ids check (public.patgo_job_ok(id, doc))", 'jobs: the rule');
    t.includes(mig, "add constraint records_safe_pictures check (public.patgo_record_ok(kind, doc))", 'pictures: the rule');
    t.includes(mig, 'and not exists (select 1 from public.sessions where not public.patgo_job_ok(id, doc)) then', '…each added only over a clean cloud');
  });

  /* ------------------------------------------------------------------ 93e */
  await t.group('93e — V154 carried (release checks → 94e)', () => {
    const rel = freshApp();
    t.eq(rel.fn('updateVersionLabel')('pat-v154'), 'V154', 'the update banner reads pat-v154 as V154');
    t.eq(rel.fn('updateVersionLabel')('pat-v154-1'), 'V154.1', '…and a hotfix key as V154.1');
  });
};
