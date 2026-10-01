/* Standing test — safe in the cloud (V91, roadmap Stage 4)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID (1A–11). A job is SAFE IN THE CLOUD when the pull has
   READ BACK a cloud copy that hashes the same as the phone's (st.conf — 1A) and
   every photo of it is known in the cloud. Phones upgrading re-read their jobs
   once (2A). Only safe jobs come off this phone, through one path that syncs
   first, asks, and re-checks at the moment of removing (3A). 🛡 on safe job
   cards (4A). Settings → Backup → Jobs on this phone (5A). The 🗑 on a card,
   signed in: remove from this phone or delete everywhere, which asks twice (6A).
   Signed in, clearing old jobs no longer needs a CSV export (7A). A tidy-up
   offer on the Jobs screen at most once a month (8A), with a photo age of its
   own (9A). Cleared jobs can be brought back (10A).

   Helpers copied from 27 (fake server with keyset paging and doc->> picks).

   ⚠ WHAT THIS FILE CANNOT PROVE. How it looks on a phone; that the Postgres
   jsonb round trip hashes the same on real hardware (the two-phone test: a job
   must show 🛡 after two syncs). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { tick, withSession, withItem, confirmSheet } = require('../fixture');

const LIB = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const UID = '11111111-1111-1111-1111-111111111111';

function storedSession() {
  return JSON.stringify({
    access_token: 'ZZACCESS', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'ZZREFRESH',
    user: { id: UID, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' },
  });
}

const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });

// PostgREST-ish: eq, gte, gt, in; order by the named column; limit; and the
// select list, including `alias:doc->>field` (text, as Postgres returns it).
function applyQuery(rows, qs) {
  const q = new URLSearchParams(qs || '');
  let out = rows.slice();
  for (const [k, v] of q) {
    if (k === 'select' || k === 'order' || k === 'limit' || k === 'on_conflict') continue;
    if (v.startsWith('eq.')) { const x = v.slice(3); out = out.filter(r => String(r[k]) === x); }
    else if (v.startsWith('gte.')) { const x = v.slice(4); out = out.filter(r => String(r[k]) >= x); }
    else if (v.startsWith('gt.')) { const x = v.slice(3); out = out.filter(r => String(r[k]) > x); }
    else if (v.startsWith('in.(')) {
      const list = v.slice(4, -1).split(',').map(s => s.replace(/^"|"$/g, ''));
      out = out.filter(r => list.includes(String(r[k])));
    }
  }
  const ord = q.get('order');
  if (ord) { const col = ord.split('.')[0]; out.sort((a, b) => String(a[col]).localeCompare(String(b[col]))); }
  if (q.get('limit')) out = out.slice(0, parseInt(q.get('limit'), 10));
  const sel = q.get('select');
  if (sel && sel !== '*') {
    const cols = sel.split(',');
    out = out.map((r) => {
      const o = {};
      for (const c of cols) {
        const m = c.match(/^(\w+):doc->>(\w+)$/);
        if (m) { const v = r.doc ? r.doc[m[2]] : undefined; o[m[1]] = (v === undefined || v === null) ? null : String(v); }
        else o[c] = r[c];
      }
      return o;
    });
  }
  return out;
}

function fakeServer() {
  const calls = [];
  const tables = { sessions: [], records: [], photos: [] };
  const files = new Map();
  let stampN = 0;
  const stamp = () => { stampN++; return '2026-09-30T10:' + String(Math.floor(stampN / 60) % 60).padStart(2, '0') + ':' + String(stampN % 60).padStart(2, '0') + '.' + String(stampN).padStart(3, '0') + 'Z'; };
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    let body = null;
    if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    else body = init.body || null;
    calls.push({ url: u, method, body });
    if (u.includes('/storage/v1/object/photos')) {
      if (method === 'DELETE') {
        const list = (body && body.prefixes) || [];
        for (const p of list) files.delete(p);
        return json(list.map(p => ({ name: p })));
      }
      const p = decodeURIComponent(u.split('/storage/v1/object/photos/')[1].split('?')[0]);
      if (method === 'GET') {
        if (!files.has(p)) return json({ message: 'not found' }, 400);
        return new Response(new Blob(['ZZFILE:' + p], { type: 'image/jpeg' }), { status: 200 });
      }
      files.set(p, true);
      return json({ Key: 'photos/' + p, Id: 'x' });
    }
    const qs = u.split('?')[1] || '';
    if (u.includes('/rest/v1/photos')) {
      if (method === 'GET') return json(applyQuery(tables.photos, qs));
      if (method === 'PATCH') {
        for (const r of applyQuery(tables.photos, qs.replace(/(^|&)select=[^&]*/, ''))) {
          const real = tables.photos.find(x => x.id === r.id);
          Object.assign(real, body, { updated_at: stamp() });
        }
        return new Response(null, { status: 204 });
      }
      for (const row of (Array.isArray(body) ? body : [body])) {
        const i = tables.photos.findIndex(r => r.id === row.id);
        const stored = Object.assign({}, i === -1 ? {} : tables.photos[i], row, { updated_at: stamp() });
        if (i === -1) tables.photos.push(stored); else tables.photos[i] = stored;
      }
      return new Response(null, { status: 201 });
    }
    for (const name of ['sessions', 'records']) {
      if (!u.includes('/rest/v1/' + name)) continue;
      if (method === 'GET') return json(applyQuery(tables[name], qs));
      const st = stamp();
      for (const row of (Array.isArray(body) ? body : [])) {
        const i = tables[name].findIndex(r => String(r.id) === String(row.id));
        const stored = Object.assign({}, row, { updated_at: st });
        if (i === -1) tables[name].push(stored); else tables[name][i] = stored;
      }
      return new Response(null, { status: 201 });
    }
    if (u.includes('/rest/v1/profiles')) return json([{ plan: 'trial', trial_ends_at: null }]);
    return json({ message: 'unexpected ' + u }, 404);
  };
  const is = (c, part, m) => c.url.includes(part) && (!m || c.method === m);
  return {
    calls, fetchImpl, tables, files, stamp,
    downloads: () => calls.filter(c => is(c, '/storage/v1/object/photos/', 'GET')),
    removes: () => calls.filter(c => is(c, '/storage/v1/object/photos', 'DELETE')),
    patches: () => calls.filter(c => is(c, '/rest/v1/photos', 'PATCH')),
    browseGets: () => calls.filter(c => is(c, '/rest/v1/photos', 'GET') && c.url.includes('order=id')),
    jobGets: () => calls.filter(c => is(c, '/rest/v1/sessions', 'GET') && c.url.includes('doc-%3E%3E')),
    // A job on ANOTHER phone, with its photos in the cloud.
    otherJob(id, doc, o = {}) {
      tables.sessions.push({ id, user_id: UID, doc: Object.assign({ id, items: [] }, doc || {}), deleted: !!o.deleted, updated_at: stamp() });
    },
    otherRow(r) {
      const row = Object.assign({ user_id: UID, bytes: 250000, thumb: false, deleted: false,
        taken_at: '2026-09-28T09:00:00.000Z', last_modified: '2026-09-28T09:00:00.000Z' }, r);
      row.storage_path = UID + '/' + row.id + '.jpg';
      row.updated_at = stamp();
      tables.photos.push(row);
      files.set(row.storage_path, true);
      if (row.thumb) files.set(UID + '/' + row.id + '_t.jpg', true);
      return row;
    },
  };
}

function boot(opts = {}) {
  const app = bootApp(opts);
  app.sandbox.localStorage.setItem('pat:cloudUnlocked', '1');
  app.fn('load')();
  app.state = () => app.refresh('state').state;
  app.stopTimer = () => app.run('if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }');
  app.html = () => app.doc.getElementById('app').innerHTML;
  app.toasts = [];
  app.sandbox.showToast = (m) => app.toasts.push(String(m));
  app.asked = [];
  const realConfirm = app.sandbox.openConfirmSheet;
  app.sandbox.openConfirmSheet = (o) => { app.asked.push(String(o && o.title) + ' | ' + String(o && o.message) + ' | ' + String(o && o.confirmLabel)); return realConfirm(o); };
  // The stub Image never decodes: previews made on the phone are stubbed.
  app.run("photoThumbBlob = () => Promise.resolve(new Blob(['ZZTHUMB'], { type: 'image/jpeg' }))");
  return app;
}

async function signedIn() {
  const app = boot({ localStorage: { 'patgo:cloudAuth:test': storedSession() }, navigator: { onLine: false } });
  const srv = fakeServer();
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
  await tick(5);
  // Under a full run the sign-in can take longer than a tick: wait for it (a
  // manager opened before it would rightly show phone photos only).
  for (let k = 0; k < 100 && app.run("(state.cloud && state.cloud.status) || ''") !== 'signed-in'; k++) await tick(10);
  app.stopTimer();
  // Signed in the sandbox URL is Node's, which only takes a real Blob.
  app.run("photoThumbBlob = () => new Response('ZZTHUMB').blob()");
  return app;
}

async function signedOut() {
  const app = boot({ fetch: async () => { throw new Error('offline'); } });
  await tick(10);
  return app;
}

// A tap exactly as the browser delivers it.
function tap(app, action, arg) {
  const el = app.doc.createElement('button');
  el.dataset.action = action;
  if (arg !== undefined) el.dataset.arg = String(arg);
  app.doc.getElementById('app').dispatchEvent({
    type: 'click', target: el, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
  });
}
// A select changed, exactly as the browser delivers it.
function choose(app, action, value) {
  const el = app.doc.createElement('select');
  el.dataset.changeAction = action;
  el.value = value;
  app.doc.getElementById('app').dispatchEvent({ type: 'change', target: el, preventDefault() {}, stopPropagation() {} });
}

const syncState = (app) => JSON.parse(app.storage.getItem('pat:syncState') || 'null');
const known = (app) => ((syncState(app) || { ph: { sent: {} } }).ph.sent);
const ledger = (app) => JSON.parse(app.storage.getItem('pat:tombstones') || '[]');
async function run(app) { const r = await app.fn('syncPush')({ pull: true }); app.stopTimer(); await tick(30); return r; }
const pm = (app) => app.state().photoMgr;
// Wait for something asynchronous, up to ~2 s: a full run is slower than one file.
async function until(pred, ms = 2000) { for (let k = 0; k < ms / 10 && !pred(); k++) await tick(10); }
const looked = (app) => () => !!(app.state().photoMgr.cloud && app.state().photoMgr.cloud.ok);
// A job cleared from this phone (V80 C): the cloud keeps it and the pull never
// brings it back — today's only way a job is in the cloud but not on the phone.
function cleared(app, ids) {
  const at = new Date().toISOString();
  const cur = JSON.parse(app.storage.getItem('pat:syncPruned') || '[]');
  app.storage.setItem('pat:syncPruned', JSON.stringify(cur.concat(ids.map(id => ({ id, at })))));
}
const model = (app) => app.fn('photoMgrModel')();

async function addPhotos(app, sess, item, n, tag) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const id = await app.run(`photoAdd(${JSON.stringify(sess.id)}, ${JSON.stringify(item.id)},
      { blob: new Blob(['ZZJPEG${tag || ''}${i}'.repeat(50)], { type: 'image/jpeg' }), w: 1280, h: 960, bytes: 400 })`);
    ids.push(id);
    await tick(10);
  }
  app.stopTimer();
  return ids;
}

async function jobWithPhotos(app, site, n) {
  const sess = withSession(app, { site });
  const item = withItem(app, { assetNo: 'ZZM-' + Math.random().toString(36).slice(2, 7), result: 'fail' });
  const ids = await addPhotos(app, app.fn('activeSession')(), item, n || 1, site);
  return { sess: app.fn('activeSession')(), item, ids };
}

const J = JSON.stringify;
function plainJob(app, site, date) {
  withSession(app, { site });
  withItem(app, { assetNo: 'ZZS-' + Math.random().toString(36).slice(2, 7), result: 'pass' });
  const s = app.fn('activeSession')();
  if (date) app.run(`state.sessions.find(x => x.id === ${J(s.id)}).date = ${J(date)}`);
  app.stopTimer();
  return String(s.id);
}
const away = (app) => app.run('state.activeId = null; state.view = "sessions";');
function why(app, id) {
  const s = app.fn('syncJobsSafety')(true);
  const r = s && s.map.get(String(id));
  return r ? r.why : null;
}
const onPhone = (app, id) => app.state().sessions.some(s => String(s.id) === String(id));
const pruned = (app) => JSON.parse(app.storage.getItem('pat:syncPruned') || '[]').map(e => e.id);
// An edit on this phone: a new array, as the app's own edits of other jobs make.
function edit(app, id) {
  app.run(`(() => { const s = state.sessions.find(x => x.id === ${J(id)});
    s.items = s.items.concat([Object.assign({}, s.items[0], { id: 'ZZE' + Math.random().toString(36).slice(2, 7), assetNo: 'ZZEDIT' })]); })()`);
}
const sessGets = (app) => app.srv.calls.filter(c => c.url.includes('/rest/v1/sessions') && c.method === 'GET');
function recordChoices(app) {
  app.choices = [];
  const real = app.sandbox.openChoiceSheet;
  app.sandbox.openChoiceSheet = (o) => { app.choices.push(o); return real(o); };
}
const clickChoice = (app, i) => { const b = app.doc.getElementById('choice-sheet-' + i); if (!b) return false; b.click(); return true; };

module.exports = async function () {
  /* ------------------------------------------------------------------ 28a */
  await t.group('28a — safe means the cloud copy was READ BACK and matches (1A; V92 4A: in the same sync)', async () => {
    const app = await signedIn();
    const id = plainJob(app, 'ZZSAFE1');
    away(app);
    t.eq(why(app, id), 'unsent', 'a new job: its changes aren\u2019t sent');
    // V92 (4A): the fingerprint is read back straight after the push, so the
    // job is safe in the SAME sync. A push whose read-back never comes is still
    // not safe — 16i (a server that answers every read with nothing) and 29a.
    await run(app);
    t.eq(why(app, id), 'safe', 'pushed and its fingerprint read straight back: safe in the same sync (V92 4A)');
    t.ok(syncState(app).conf[id], 'the cloud copy\u2019s fingerprint is recorded as SEEN');
    edit(app, id);
    t.eq(why(app, id), 'unsent', 'edited on this phone: not safe any more');
    await run(app);
    t.eq(why(app, id), 'safe', '…sent again and read back: safe again');
    await run(app);
    t.eq(why(app, id), 'safe', '…and it stays safe');
    t.eq(app.fn('syncSafetyText')({ why: 'checking' }), 'Sent \u2014 confirmed on the next sync', 'the reason in plain words');
    const out = await signedOut();
    plainJob(out, 'ZZSAFEOUT');
    t.eq(out.fn('syncJobsSafety')(true), null, 'signed out: there is nothing to be safe in');
  });

  /* ------------------------------------------------------------------ 28b */
  await t.group('28b — 🛡 on a safe job card, appearing by itself after the read-back; an in-place change takes it away at once (4A)', async () => {
    const app = await signedIn();
    const id = plainJob(app, 'ZZSHIELD');
    away(app);
    app.fn('render')();
    t.excludes(app.html(), 'title="Safe in the cloud"', 'not sent yet: no 🛡');
    await run(app);
    // Nothing on screen changed in that run (a push changes no job), so only
    // the safety repaint can have drawn it. V92 (4A): in the same sync.
    t.includes(app.html(), 'title="Safe in the cloud"', 'the 🛡 appears after the read-back, without another repaint');
    t.excludes(app.html().split('title="Safe in the cloud"')[0].slice(-200), '\u2601', '…and it is not the ☁ (which means only in the cloud)');
    // In place, same array — as storage.js's own cache test sees it.
    app.run(`state.sessions.find(x => x.id === ${J(id)}).items.push({ id: 'ZZINPLACE', assetNo: 'ZZIP', result: 'pass' })`);
    app.fn('render')();
    t.excludes(app.html(), 'title="Safe in the cloud"', 'changed in place: the 🛡 goes at once (the display memo follows storage\u2019s reuse test)');
  });

  /* ------------------------------------------------------------------ 28c */
  await t.group('28c — a phone upgrading to V91 reads its jobs back once (2A)', async () => {
    const app = await signedIn();
    const id = plainJob(app, 'ZZUPGRADE');
    away(app);
    await run(app); await run(app);
    t.eq(why(app, id), 'safe', 'safe to start with');
    // What a V90 phone saved: no confV, no conf, and a cursor past every row.
    const st = syncState(app);
    delete st.confV; delete st.conf;
    st.pulledAt = '2026-12-31T00:00:00.000Z';
    app.storage.setItem('pat:syncState', JSON.stringify(st));
    t.eq(why(app, id), 'checking', 'a state saved before V91 vouches for nothing');
    await run(app);
    const urls = sessGets(app).map(c => decodeURIComponent(c.url));
    t.ok(urls.some(u => u.includes('updated_at=gte.1970-01-01')), 'the jobs are read from the beginning');
    t.eq(why(app, id), 'safe', 'one run later it is safe again');
    t.eq(syncState(app).confV, 1, 'saved with the new version…');
    const n = sessGets(app).length;
    await run(app);
    const later = sessGets(app).slice(n).map(c => decodeURIComponent(c.url));
    t.notOk(later.some(u => u.includes('updated_at=gte.1970-01-01')), '…so it happens once, not every run');
  });

  /* ------------------------------------------------------------------ 28d */
  await t.group('28d — Jobs on this phone: only safe jobs can be picked; it syncs first, asks, and the cloud keeps them (3A, 5A, 7A)', async () => {
    const app = await signedIn();
    const a = plainJob(app, 'ZZREMA', '2020-01-01');
    const b = plainJob(app, 'ZZREMB', '2020-02-01');
    away(app);
    await run(app); await run(app);
    edit(app, b);
    app.fn('setView')('settingsBackup');
    const bk = app.html();
    t.includes(bk, 'data-action="jm-open"', 'the Backup page has Jobs on this phone');
    t.excludes(bk, 'No exported sessions', 'signed in: not the CSV-export wording (7A)');
    t.includes(bk, 'data-action="tidy-jobs"', 'the old safe job is offered, exported or not');
    tap(app, 'jm-open');
    t.eq(app.state().view, 'jobManager', 'it opens');
    const html = app.html();
    t.includes(html, 'Safe in the cloud', 'a safe job says so');
    t.includes(html, 'Latest changes not sent yet', 'the other says why not');
    tap(app, 'jm-select-toggle');
    tap(app, 'jm-tap', b);
    t.notOk(app.state().jobMgr.selected[b], 'a job not safe yet can\u2019t be picked');
    t.includes(app.toasts.join('|'), 'not sent yet', '…and the toast says why');
    tap(app, 'jm-tap', a);
    t.ok(app.state().jobMgr.selected[a], 'a safe job can');
    // V92: the removal also reads the job's contents (3B) — a jobs request too,
    // so "synced first" is proved by the PULL's page request, not any request.
    const pages = () => sessGets(app).filter(c => c.url.includes('updated_at=')).length;
    const getsBefore = pages();
    const tombs = ledger(app).length;
    tap(app, 'jm-remove');
    await until(() => app.asked.some(x => x.startsWith('Remove 1 job from this phone?')));
    app.stopTimer();
    t.ok(pages() > getsBefore, 'it synced first (3A)');
    const msg = app.asked.find(x => x.startsWith('Remove 1 job'));
    t.includes(msg, 'stays in the cloud and on your other phones', 'the confirm says the cloud keeps it');
    t.includes(msg, 'bring it back', '…and that it can come back');
    confirmSheet(app);
    await until(() => !onPhone(app, a));
    app.stopTimer();
    t.notOk(onPhone(app, a), 'the safe job is off this phone');
    t.ok(onPhone(app, b), 'the other stays');
    t.ok(pruned(app).includes(a), 'it is recorded as cleared, so the pull leaves it in the cloud');
    t.eq(ledger(app).length, tombs, 'and it is NOT a deletion');
    await run(app);
    const row = app.srv.tables.sessions.find(r => r.id === a);
    t.ok(row && !row.deleted, 'the cloud still holds it');
    t.notOk(onPhone(app, a), 'and the next sync does not bring it back');
  });

  /* ------------------------------------------------------------------ 28e */
  await t.group('28e — the check is made again at the moment of removing (3A)', async () => {
    const app = await signedIn();
    const c = plainJob(app, 'ZZRECHECK', '2020-01-01');
    away(app);
    await run(app); await run(app);
    app.run('navigator.onLine = false');   // no sync first: the sheet opens at once
    await app.fn('jobsRemoveAsk')([c]);
    t.ok(app.asked.some(x => x.startsWith('Remove 1 job')), 'asked');
    t.ok(app.asked.some(x => x.includes('checked against the last sync')), 'with no signal it says what it checked against');
    edit(app, c);                            // changed while the sheet was open
    confirmSheet(app);
    await tick(20); app.stopTimer();
    t.ok(onPhone(app, c), 'a job that changed while the sheet was open stays');
    t.includes(app.toasts.join('|'), 'changed while you were deciding', '…and the toast says so');
  });

  /* ------------------------------------------------------------------ 28f */
  await t.group('28f — 🗑 signed in: remove from this phone, or delete everywhere in two steps (6A)', async () => {
    const app = await signedIn();
    recordChoices(app);
    const d = plainJob(app, 'ZZDELTWO');
    const f = plainJob(app, 'ZZREMOVEONE');
    const e = plainJob(app, 'ZZNOTSENT');
    away(app);
    await run(app); await run(app);
    edit(app, e);                            // e: changed since it was sent
    app.run('navigator.onLine = false');
    tap(app, 'delete-session', d);
    const sheet = app.choices[app.choices.length - 1];
    t.eq(sheet.choices.map(x => x.label).join('|'), 'Remove from this phone|Delete everywhere\u2026', 'a safe job: both choices');
    t.includes(sheet.message, 'your other phones and the cloud', 'the sheet names where delete everywhere reaches');
    clickChoice(app, 1);
    t.ok(onPhone(app, d), 'picking Delete everywhere deletes nothing yet');
    const second = app.asked[app.asked.length - 1];
    t.includes(second, 'Delete everywhere \u2014 are you sure?', 'a second, harder confirm (Peter, V91 round)');
    t.includes(second, 'every other phone and the cloud', '…naming every phone and the cloud');
    t.includes(second, 'Yes, delete everywhere', '…with a button that says so');
    confirmSheet(app);
    t.notOk(onPhone(app, d), 'only then is it deleted');
    t.ok(ledger(app).some(x => x.kind === 'session' && String(x.id) === d), 'as a real deletion (the ledger carries it everywhere)');

    tap(app, 'delete-session', e);
    const s2 = app.choices[app.choices.length - 1];
    t.eq(s2.choices.map(x => x.label).join('|'), 'Delete everywhere\u2026', 'a job not safe yet: no Remove from this phone');
    t.includes(s2.message, 'latest changes not sent yet', '…and the sheet says why');
    app.doc.getElementById('choice-sheet-no').click();

    tap(app, 'delete-session', f);
    clickChoice(app, 0);
    await until(() => app.asked.some(x => x.startsWith('Remove 1 job')));
    const tombs = ledger(app).length;
    confirmSheet(app);
    await until(() => !onPhone(app, f));
    app.stopTimer();
    t.notOk(onPhone(app, f), 'Remove from this phone takes it off this phone');
    t.eq(ledger(app).length, tombs, '…without deleting it anywhere');

    const out = await signedOut();
    const g = plainJob(out, 'ZZOUTDEL');
    out.run('state.activeId = null; state.view = "sessions";');
    const asked = [];
    const real = out.sandbox.openConfirmSheet;
    out.sandbox.openConfirmSheet = (o) => { asked.push(String(o.title)); return real(o); };
    tap(out, 'delete-session', g);
    t.eq(asked[0], 'Delete session?', 'signed out: the one confirm, unchanged');
  });

  /* ------------------------------------------------------------------ 28g */
  await t.group('28g — cleared jobs: listed in the cloud tab (V93), then Bring back — safe at once, photos follow, stats not doubled (10A)', async () => {
    const app = await signedIn();
    const g = plainJob(app, 'ZZBRINGBACK', '2020-01-01');
    withItem(app, { assetNo: 'ZZBB2', result: 'fail' });
    away(app);
    await run(app); await run(app);
    const itemsBefore = app.fn('computeAppStats')().items;
    await app.fn('jobsRemoveAsk')([g]);
    confirmSheet(app);
    await until(() => !onPhone(app, g));
    app.stopTimer();
    t.eq(app.fn('computeAppStats')().items, itemsBefore, 'removed: the lifetime count is unchanged (archived)');
    // V93 (7A): Jobs on this phone's Cleared section is a link to the Jobs
    // screen's cloud tab — one path. The cleared job is listed there.
    app.fn('jobMgrOpen')();
    t.includes(app.html(), 'data-action="jm-cloud-link"', 'Jobs on this phone points to the cloud tab (V93 7A)');
    const n = sessGets(app).length;
    tap(app, 'jm-cloud-link');
    await until(() => !!(app.state().cloudJobs && app.state().cloudJobs.ok));
    const cl = app.state().cloudJobs;
    const listed = cl.jobs.filter(j => j.id === g);
    t.eq(listed.length, 1, 'the cleared job is listed in the cloud tab');
    t.includes(listed[0].site, 'ZZBRINGBACK', '…by its name');
    const look = sessGets(app).slice(n).map(c => decodeURIComponent(c.url));
    t.ok(look.length && look.every(u => !/select=id,doc[,&]/.test(u)), 'the list never downloads the job itself (R17)');
    t.includes(app.html(), 'data-action="cloud-tap"', 'with a tap to bring it back');
    tap(app, 'cloud-tap', g);
    await until(() => onPhone(app, g));
    app.stopTimer();
    t.ok(onPhone(app, g), 'it is back on this phone');
    t.notOk(pruned(app).includes(g), 'and off the cleared list');
    const st = syncState(app);
    t.ok(st.conf[g] && st.conf[g] === st.sent[g], 'it was read, so it is known to match the cloud');
    t.eq(why(app, g), 'safe', '…safe at once');
    t.ok(st.ph.need.includes(g), 'its photo rows are asked for on the next sync (rule 24)');
    t.eq(app.fn('computeAppStats')().items, itemsBefore, 'the lifetime count is not doubled');
    await run(app);
    t.ok(onPhone(app, g), 'the next sync leaves it here');
    t.eq(why(app, g), 'safe', '…still safe');
  });

  /* ------------------------------------------------------------------ 28h */
  await t.group('28h — the tidy-up offer: old safe jobs and old cloud photos, once a month at most (8A, 9A)', async () => {
    const app = await signedIn();
    const old = plainJob(app, 'ZZTIDYOLD', '2020-01-01');
    const { ids } = await jobWithPhotos(app, 'ZZTIDYNEW', 2);
    away(app);
    await run(app); await run(app);
    app.run(`state.photoMeta[${J(ids[0])}].at = '2025-01-01T00:00:00.000Z'`);
    // An old photo NOT in the cloud is never offered.
    app.run('navigator.onLine = false');
    const newSess = app.state().sessions.find(s => String(s.site).includes('ZZTIDYNEW'));
    const notUp = await addPhotos(app, newSess, newSess.items[0], 1, 'NOTUP');
    app.run(`state.photoMeta[${J(notUp[0])}].at = '2025-01-01T00:00:00.000Z'`);
    const m = app.fn('tidyModel')(true);
    t.eq(m.jobs.map(s => String(s.id)).join(','), old, 'the old safe job is offered');
    t.eq(m.photos.join(','), ids[0], 'only the old photo known in the cloud is offered');
    app.fn('setView')('sessions');
    t.includes(app.html(), 'Tidy up this phone?', 'the offer shows on the Jobs screen');
    tap(app, 'tidy-dismiss');
    t.excludes(app.html(), 'Tidy up this phone?', 'Not now hides it');
    const stamp = app.storage.getItem('pat:tidyOfferDay');
    t.ok(/^\d{4}-\d{2}-\d{2}$/.test(stamp || ''), '…and stamps the day');
    const daysAgo = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
    app.storage.setItem('pat:tidyOfferDay', daysAgo(10));
    app.fn('render')();
    t.excludes(app.html(), 'Tidy up this phone?', 'ten days later: still quiet');
    app.storage.setItem('pat:tidyOfferDay', daysAgo(31));
    app.fn('render')();
    t.includes(app.html(), 'Tidy up this phone?', 'a month later: offered again');
    tap(app, 'tidy-photos');
    t.ok(app.asked.some(x => x.startsWith('Remove 1 photo from this phone?')), 'Remove old photos asks first');
    confirmSheet(app);
    await until(() => !app.state().photoMeta[ids[0]]);
    t.notOk(app.state().photoMeta[ids[0]], 'the old photo is off this phone');
    t.ok(known(app)[ids[0]], '…and still known in the cloud');
    t.ok(app.state().photoMeta[notUp[0]], 'the photo not in the cloud stays');
    // The photo age (9A), from the Backup page.
    app.fn('setView')('settingsBackup');
    const inp = app.doc.getElementById('photo-age-input');
    t.ok(inp, 'signed in, the Backup page has the photo age');
    inp.value = '6';
    tap(app, 'photo-age-save');
    t.eq(app.state().photoAgeMonths, 6, 'saved');
    t.eq(app.storage.getItem('pat:photoAgeMonths'), '6', '…per phone');
  });

  /* ------------------------------------------------------------------ 28j */
  // V91.1. Source guard — a service worker's install can't run headlessly here.
  await t.group('28j — the service worker fills a new cache from the server, never the browser cache (V91.1)', () => {
    const sw = fs.readFileSync(path.join(APP_DIR, 'sw.js'), 'utf8');
    const install = sw.slice(sw.indexOf("addEventListener('install'"), sw.indexOf("addEventListener('activate'"));
    t.ok(install.length > 0, 'the install handler is found');
    t.includes(install, "new Request(url, { cache: 'reload' })", 'every file is fetched with cache: reload');
    t.excludes(install, 'cache.addAll(ASSETS)', 'never the plain list (which may come from the HTTP cache)');
  });

  /* ------------------------------------------------------------------ 28i */
  await t.group('28i — signed out nothing changes: no shield, no offer, no Jobs on this phone, the old clear', async () => {
    const app = await signedOut();
    plainJob(app, 'ZZOUT1', '2020-01-01');
    app.run('state.activeId = null; state.view = "sessions";');
    app.fn('render')();
    t.excludes(app.html(), 'session-safe', 'no 🛡');
    t.excludes(app.html(), 'Tidy up', 'no offer');
    app.fn('setView')('settingsBackup');
    const html = app.html();
    t.excludes(html, 'data-action="jm-open"', 'no Jobs on this phone');
    t.excludes(html, 'photo-age-input', 'no photo age');
    t.includes(html, 'When a session has been exported', 'the old clear-old wording');
    app.fn('jobMgrOpen')();
    t.includes(app.html(), 'Sign in to the cloud', 'a stray visit says why there is nothing');
  });
};
