/* Standing test — Cloud Storage (V108, roadmap Stage 5 part 3 second half —
   spec 1A 2A 3A 4A 5A 6A)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Settings → Data → Cloud Storage (1A, signed in only):
   the account's jobs, photos and total in the cloud, figures only (2A); its
   CLOUD_STORAGE_TOP (10) biggest jobs, job + photos, jobs on this phone included
   and marked (3A); Select → Delete… for jobs NOT on this phone, through V107's
   review, word and sync (4A); Manage Photos (5A); read on every open, ⟳ (6A).
   sync.js syncCloudStorage reads three LISTS: id + doc_bytes for every live job,
   the photo-count view with b, and the cloud tab's columns for the biggest only.

   Helpers are 44's, with the fake extended: doc_bytes (the JSON's byte length —
   the real column is doc::text, a little longer, which no assertion depends on),
   the view's b, and srv.noV108 (the database before the V108 SQL).

   ⚠ WHAT THIS FILE CANNOT PROVE. Postgres itself: that the generated column and
   the view are right and that the view obeys each account's rule — the V108 SQL's
   own self-checks (B1–B5) and isolation-test.sql 8d cover those. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { tick, withSession, withItem } = require('../fixture');

const LIB = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const UID = '11111111-1111-1111-1111-111111111111';
const J = JSON.stringify;

function storedSession() {
  return JSON.stringify({
    access_token: 'ZZACCESS', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'ZZREFRESH',
    user: { id: UID, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' },
  });
}

const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });

// 30's filter: eq, gte, gt, in, order, limit, select (incl. alias:doc->>field).
// With keepRefs the matched row OBJECTS come back (for PATCH), not copies.
function applyQuery(rows, qs, keepRefs) {
  const q = new URLSearchParams(qs || '');
  let out = rows.slice();
  for (const [k, v] of q) {
    if (k === 'select' || k === 'order' || k === 'limit' || k === 'on_conflict' || k === 'columns') continue;
    const val = (r) => { const m = k.match(/^doc->>(\w+)$/); if (!m) return r[k]; const x = r.doc ? r.doc[m[1]] : undefined; return (x === undefined || x === null) ? null : String(x); };
    if (v.startsWith('eq.')) { const x = v.slice(3); out = out.filter(r => String(val(r)) === x); }
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
  if (keepRefs) return out;
  const sel = q.get('select');
  if (sel && sel !== '*') {
    const cols = sel.split(',');
    out = out.map((r) => {
      const o = {};
      for (const c of cols) {
        const m = c.match(/^(\w+):doc->>(\w+)$/);
        const m2 = c.match(/^(\w+):doc->(\w+)->>(\w+)$/);
        const items = (r.doc && Array.isArray(r.doc.items)) ? r.doc.items : [];
        if (m) { const x = r.doc ? r.doc[m[2]] : undefined; o[m[1]] = (x === undefined || x === null) ? null : String(x); }
        else if (m2) { const p = r.doc ? r.doc[m2[2]] : undefined; const x = (p && typeof p === 'object') ? p[m2[3]] : undefined; o[m2[1]] = (x === undefined || x === null) ? null : String(x); }
        else if (c === 'n_items') o[c] = items.length;
        else if (c === 'n_fails') o[c] = items.filter(i => i && i.result === 'fail').length;
        else if (c === 'doc_bytes') o[c] = Buffer.byteLength(JSON.stringify(r.doc || {}));   // V108
        else o[c] = r[c];
      }
      return o;
    });
  }
  return out;
}

function reorderKeys(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(reorderKeys);
  const out = {};
  for (const k of Object.keys(v).reverse()) out[k] = reorderKeys(v[k]);
  return out;
}

function fakeServer() {
  const calls = [];
  const tables = { sessions: [], records: [], photos: [] };
  const files = new Map();
  let stampN = 0;
  const stamp = () => { stampN++; return '2026-10-09T11:' + String(Math.floor(stampN / 60) % 60).padStart(2, '0') + ':' + String(stampN % 60).padStart(2, '0') + '.' + String(stampN).padStart(3, '0') + 'Z'; };
  const srv = { calls, tables, files, stamp, failPatch: 0, onCall: null, noV108: false };
  const guard = (old, row) => {
    const merged = Object.assign({}, old || {}, row);
    if (old && JSON.stringify(old.doc) !== JSON.stringify(merged.doc) && !('fp' in row)) merged.fp = null;
    if (!old && !('fp' in row)) merged.fp = null;
    return merged;
  };
  const patch = (rows, qs, body) => {
    const hit = applyQuery(rows, qs, true);
    const st = stamp();
    for (const r of hit) {
      const merged = guard(r, body);
      Object.keys(r).forEach(k => delete r[k]);
      Object.assign(r, merged, { updated_at: st });
    }
    const sel = new URLSearchParams(qs).get('select');
    if (!sel) return new Response(null, { status: 204 });
    return json(hit.map(r => { const o = {}; for (const c of sel.split(',')) o[c] = r[c]; return o; }));
  };
  srv.fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    let body = null;
    if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    else body = init.body || null;
    const call = { url: u, method, body };
    calls.push(call);
    if (srv.onCall) srv.onCall(call);
    if (u.includes('/storage/v1/object/photos')) {
      if (method === 'DELETE') {
        const names = (body && body.prefixes) || [];
        for (const p of names) files.delete(p);
        return json(names.map(p => ({ name: p })));
      }
      const p = decodeURIComponent(u.split('/storage/v1/object/photos/')[1].split('?')[0]);
      if (method === 'GET') return new Response(new Blob(['ZZFILE:' + p], { type: 'image/jpeg' }), { status: 200 });
      files.set(p, true);
      return json({ Key: 'photos/' + p, Id: 'x' });
    }
    const qs = u.split('?')[1] || '';
    // V108: no V108 SQL run → asking for doc_bytes or b is "column does not exist".
    if (srv.noV108 && ((u.includes('/rest/v1/sessions') && /select=[^&]*doc_bytes/.test(decodeURIComponent(u)))
        || (u.includes('/rest/v1/session_photo_counts') && /select=[^&]*,b(,|&|$)/.test(decodeURIComponent(u))))) {
      return json({ code: '42703', message: 'column sessions.doc_bytes does not exist', details: null, hint: null }, 400);
    }
    if (u.includes('/rest/v1/session_photo_counts')) {
      const m = new Map();
      for (const p of tables.photos) if (!p.deleted) {
        const k = String(p.session_id), e = m.get(k) || { n: 0, b: 0 };
        e.n += 1; e.b += Number(p.bytes) || 0; m.set(k, e);
      }
      return json(applyQuery(Array.from(m.entries()).map(([session_id, e]) => ({ user_id: UID, session_id, n: e.n, b: e.b })), qs));
    }
    if (u.includes('/rest/v1/photos')) {
      if (method === 'GET') return json(applyQuery(tables.photos, qs));
      if (method === 'PATCH') return patch(tables.photos, qs, body);
      for (const row of (Array.isArray(body) ? body : [body])) {
        const i = tables.photos.findIndex(r => r.id === row.id);
        const stored = Object.assign({}, i === -1 ? {} : tables.photos[i], row, { updated_at: stamp() });
        if (i === -1) tables.photos.push(stored); else tables.photos[i] = stored;
      }
      return new Response(null, { status: 201 });
    }
    if (u.includes('/rest/v1/sessions')) {
      if (method === 'GET') {
        const rows = applyQuery(tables.sessions, qs);
        return json(rows.map(r => (r.doc ? Object.assign({}, r, { doc: reorderKeys(r.doc) }) : r)));
      }
      if (method === 'PATCH') {
        if (srv.failPatch > 0) { srv.failPatch--; return json({ message: 'ZZ update refused' }, 500); }
        return patch(tables.sessions, qs, body);
      }
      const st = stamp();
      for (const row of (Array.isArray(body) ? body : [])) {
        const i = tables.sessions.findIndex(r => String(r.id) === String(row.id));
        const stored = Object.assign(guard(i === -1 ? null : tables.sessions[i], row), { updated_at: st });
        if (i === -1) tables.sessions.push(stored); else tables.sessions[i] = stored;
      }
      return new Response(null, { status: 201 });
    }
    if (u.includes('/rest/v1/records')) {
      if (method === 'GET') return json(applyQuery(tables.records, qs));
      const st = stamp();
      for (const row of (Array.isArray(body) ? body : [])) {
        const i = tables.records.findIndex(r => String(r.id) === String(row.id));
        const stored = Object.assign({}, row, { updated_at: st });
        if (i === -1) tables.records.push(stored); else tables.records[i] = stored;
      }
      return new Response(null, { status: 201 });
    }
    if (u.includes('/rest/v1/profiles')) return json([{ plan: 'trial', trial_ends_at: null }]);
    return json({ message: 'unexpected ' + u }, 404);
  };
  srv.patches = (table) => calls.filter(c => c.method === 'PATCH' && c.url.includes('/rest/v1/' + table));
  srv.row = (id) => tables.sessions.find(r => String(r.id) === String(id));
  srv.photo = (id) => tables.photos.find(r => String(r.id) === String(id));
  return srv;
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
  app.run("photoThumbBlob = () => Promise.resolve(new Blob(['ZZTHUMB'], { type: 'image/jpeg' }))");
  return app;
}

// o.srv: share a fake with another phone (the same account, two phones).
async function signedIn(o = {}) {
  const app = boot({ localStorage: { 'patgo:cloudAuth:test': storedSession() }, navigator: { onLine: false } });
  const srv = o.srv || fakeServer();
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
  for (let k = 0; k < 100 && app.run("(state.cloud && state.cloud.status) || ''") !== 'signed-in'; k++) await tick(10);
  app.stopTimer();
  app.run("photoThumbBlob = () => new Response('ZZTHUMB').blob()");
  return app;
}

const syncState = (app) => JSON.parse(app.storage.getItem('pat:syncState') || 'null');
async function run(app) { const r = await app.fn('syncPush')({ pull: true }); app.stopTimer(); await tick(30); return r; }
async function until(pred, ms = 2000) { for (let k = 0; k < ms / 10 && !pred(); k++) await tick(10); }
const idle = (app) => until(() => app.run('!_syncRunning'));
async function del(app, ids) { const r = await app.fn('syncCloudDelete')(ids); app.stopTimer(); await idle(app); app.stopTimer(); await tick(20); return r; }

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
const sheetHTML = (app) => {
  const s = app.doc.querySelectorAll('.bulk-sheet');
  return s.length ? s[s.length - 1].innerHTML : '';
};
function typeWord(app, word) {
  const inp = app.doc.getElementById('cloud-del-input');
  inp.value = word;
  inp.dispatchEvent({ type: 'input', target: inp, preventDefault() {}, stopPropagation() {} });
  return inp;
}

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
function monthsAgo(n) { const d = new Date(); d.setDate(15); d.setMonth(d.getMonth() - n); return ymd(d); }

// A job only in the cloud (old: outside the 30-day window, so no pull brings it).
function seed(app, id, doc, o = {}) {
  const full = Object.assign({ id, site: 'ZZ' + id, date: monthsAgo(6), items: [{ id: id + '-i1', assetNo: 'A1', result: 'pass' }] }, doc || {});
  const row = { id, user_id: UID, doc: full, deleted: false, last_modified: '2026-01-01T00:00:00.000Z',
    fp: app.run(`syncHash(_syncCanonical(${J(full)}))`), updated_at: o.at || app.srv.stamp() };
  app.srv.tables.sessions.push(row);
  return row;
}
// Its photos in the cloud: rows and both files.
function seedPhotos(app, sid, n, tag) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const id = 'ZZP' + (tag || sid) + i;
    app.srv.tables.photos.push({ id, user_id: UID, session_id: sid, item_id: sid + '-i1', storage_path: UID + '/' + id + '.jpg',
      bytes: 1000 + i, thumb: true, deleted: false, last_modified: '2026-01-01T00:00:00.000Z', updated_at: app.srv.stamp() });
    app.srv.files.set(UID + '/' + id + '.jpg', true);
    app.srv.files.set(UID + '/' + id + '_t.jpg', true);
    ids.push(id);
  }
  return ids;
}
const pruned = (app) => JSON.parse(app.storage.getItem('pat:syncPruned') || '[]').map(e => e.id);
const tombs = (app, kind) => (app.state().tombstones || []).filter(x => x.kind === kind).map(x => String(x.id));
const onPhone = (app, id) => app.state().sessions.some(s => String(s.id) === String(id));
const lifetime = (app) => { const s = app.fn('computeAppStats')(); return s ? s.items : 0; };
function plainJob(app, site) {
  withSession(app, { site });
  withItem(app, { assetNo: 'ZZS-' + Math.random().toString(36).slice(2, 7), result: 'pass' });
  const s = app.fn('activeSession')();
  app.stopTimer();
  return String(s.id);
}
const away = (app) => app.run('state.activeId = null; state.view = "sessions";');
async function openCloud(app) {
  app.run('state.view = "sessions"; render();');
  tap(app, 'jobs-tab', 'cloud');
  await until(() => !!(app.state().cloudJobs && (app.state().cloudJobs.ok || app.state().cloudJobs.error)));
}


const docBytes = (app, id) => Buffer.byteLength(JSON.stringify(app.srv.row(id).doc));
const reads = (app) => app.srv.calls.filter(c => c.method === 'GET' && decodeURIComponent(c.url).includes('select=id,doc_bytes')).length;
async function openStore(app) {
  tap(app, 'cs-open');
  await until(() => !!(app.state().cloudStore && !app.state().cloudStore.loading));
  await tick(5);
}
// Photos with chosen sizes (seedPhotos makes ~1 KB each).
function seedBig(app, sid, bytes, tag) {
  const id = 'ZZBIG' + (tag || sid);
  app.srv.tables.photos.push({ id, user_id: UID, session_id: sid, item_id: sid + '-i1', storage_path: UID + '/' + id + '.jpg',
    bytes, thumb: true, deleted: false, last_modified: '2026-01-01T00:00:00.000Z', updated_at: app.srv.stamp() });
  app.srv.files.set(UID + '/' + id + '.jpg', true);
  return id;
}

module.exports = async function () {
  /* ------------------------------------------------------------------ 45a */
  await t.group('45a — the read: totals of live jobs and live photos; biggest first by job + photos; names only for the biggest', async () => {
    const app = await signedIn();
    const here = plainJob(app, 'ZZHERE'); away(app);
    await run(app);
    seed(app, 'ZZA1', { site: 'ZZSMALLDOC' });
    seed(app, 'ZZA2', { site: 'ZZBIGDOC', notes: 'x'.repeat(5000) });
    seed(app, 'ZZA3', { site: 'ZZPHOTOS', certNo: 'ZZC-345', locked: true });
    const gone = seed(app, 'ZZGONE'); gone.deleted = true; gone.doc = {};
    seedBig(app, 'ZZA3', 90000);
    seedPhotos(app, 'ZZA1', 2);                       // 1000 + 1001
    const dead = seedBig(app, 'ZZA1', 77777, 'DEAD'); app.srv.photo(dead).deleted = true;
    seedBig(app, 'ZZNOJOB', 500);                     // a photo with no live job
    const res = await app.fn('syncCloudStorage')();
    t.ok(res.ok, 'resolves ok');
    t.eq(res.jobs.n, 4, 'four live jobs (the deleted one left out)');
    const want = ['ZZA1', 'ZZA2', 'ZZA3', here].reduce((n, id) => n + docBytes(app, id), 0);
    t.eq(res.jobs.bytes, want, 'job bytes are the sum of each live job’s size');
    t.eq(res.photos.n, 4, 'four live photos (the deleted one left out, the one with no job counted)');
    t.eq(res.photos.bytes, 90000 + 1000 + 1001 + 500, 'photo bytes likewise');
    t.eq(J(res.top.map(j => j.id).slice(0, 2)), J(['ZZA3', 'ZZA2']), 'biggest first, photos included (job + photos)');
    const a3 = res.top[0];
    t.eq(a3.photos, 1, 'its photo count');
    t.eq(a3.photoBytes, 90000, 'its photo bytes');
    t.eq(a3.bytes, docBytes(app, 'ZZA3'), 'its own size');
    t.eq(a3.total, a3.bytes + 90000, 'total = job + photos');
    t.eq(a3.site, 'ZZPHOTOS', 'named from the list columns');
    t.eq(a3.certNo, 'ZZC-345', 'with its certificate');
    t.eq(a3.locked, true, '…and locked');
    t.eq(a3.items, 1, 'and its item count');
    t.ok(res.top.some(j => j.id === here), 'a job on this phone is in the list too (3A)');
    t.notOk(res.top.some(j => j.id === 'ZZGONE'), 'never a deleted job');
    const sizeReads = app.srv.calls.filter(c => c.method === 'GET' && c.url.includes('/rest/v1/sessions') && decodeURIComponent(c.url).includes('select=id,doc_bytes'));
    const cols = (c) => (new URL(c.url).searchParams.get('select') || '').split(',');
    t.ok(sizeReads.length >= 1 && sizeReads.every(c => J(cols(c)) === J(['id', 'doc_bytes'])), 'the size read asks for the id and size only — never contents (R17)');
    const named = app.srv.calls.filter(c => c.method === 'GET' && c.url.includes('/rest/v1/sessions') && decodeURIComponent(c.url).includes('n_items'));
    t.ok(named.length >= 1 && named.every(c => !cols(c).includes('doc')), 'naming the biggest never asks for contents either');
    t.ok(!app.srv.calls.some(c => c.method === 'GET' && c.url.includes('/storage/v1/object')), 'never downloads a photo');
    t.notOk(onPhone(app, 'ZZA3'), 'nothing came onto this phone');
  });

  /* ------------------------------------------------------------------ 45b */
  await t.group('45b — only the CLOUD_STORAGE_TOP biggest are named; equal sizes keep a stable order', async () => {
    const app = await signedIn();
    await run(app);
    for (let k = 10; k < 22; k++) seed(app, 'ZZB' + k, { site: 'ZZS' });
    const res = await app.fn('syncCloudStorage')();
    t.eq(res.jobs.n, 12, 'all twelve counted');
    t.eq(res.top.length, 10, 'ten named (3A)');
    t.eq(res.top[0].id, 'ZZB10', 'equal sizes: by id');
    t.eq(res.top[9].id, 'ZZB19', '…in order');
    const named = app.srv.calls.filter(c => c.method === 'GET' && decodeURIComponent(c.url).includes('n_items') && decodeURIComponent(c.url).includes('id=in.('));
    t.eq(named.length, 1, 'one request names them');
  });

  /* ------------------------------------------------------------------ 45c */
  await t.group('45c — more than a page of jobs and of photo rows: every page is read', async () => {
    const app = await signedIn();
    await run(app);
    const page = app.run('SYNC_CLOUD_PAGE');
    const n = page + 5;
    for (let k = 0; k < n; k++) {
      const id = 'ZZP' + String(k).padStart(5, '0');
      app.srv.tables.sessions.push({ id, user_id: UID, doc: { id, site: 's' }, deleted: false, last_modified: '2026-01-01T00:00:00.000Z', fp: null, updated_at: '2026-01-01T00:00:00.000Z' });
      app.srv.tables.photos.push({ id: 'ZZQ' + k, user_id: UID, session_id: id, item_id: 'x', storage_path: 'p', bytes: 10, deleted: false, updated_at: '2026-01-01T00:00:00.000Z' });
    }
    const res = await app.fn('syncCloudStorage')();
    t.ok(res.ok, 'ok');
    t.eq(res.jobs.n, n, 'every job counted, past the first page');
    t.eq(res.photos.n, n, 'every photo row counted, past the first page');
    t.eq(res.photos.bytes, n * 10, 'and their bytes');
    t.notOk(res.capped, 'not capped');
  });

  /* ------------------------------------------------------------------ 45d */
  await t.group('45d — no V108 SQL on the cloud: said plainly with the fix; offline: nothing asked', async () => {
    const app = await signedIn();
    await run(app);
    seed(app, 'ZZD1');
    app.srv.noV108 = true;
    const res = await app.fn('syncCloudStorage')();
    t.notOk(res.ok, 'not ok');
    t.ok(res.needsUpdate, 'needsUpdate');
    t.includes(res.error, 'needs a small update', 'a plain message, not the database’s');
    t.eq(res.jobs.n, 0, 'no half figures');
    app.run('state.view = "settingsCategory"');
    await openStore(app);
    t.includes(app.html(), 'id="cs-needs-update"', 'the page names the one-off update');
    t.includes(app.html(), 'data-action="cs-refresh"', 'with Try again');
    app.srv.noV108 = false;
    app.run('navigator.onLine = false');
    const before = app.srv.calls.length;
    const off = await app.fn('syncCloudStorage')();
    t.ok(off.offline, 'offline');
    t.eq(app.srv.calls.length, before, 'nothing asked');
  });

  /* ------------------------------------------------------------------ 45e */
  await t.group('45e — the page: Settings → Data row (signed in only), totals, the list marked ☁ / on this phone, Manage Photos, Phone Storage link', async () => {
    const app = await signedIn();
    const here = plainJob(app, 'ZZONPHONE'); away(app);
    await run(app);
    seed(app, 'ZZE1', { site: 'ZZCLOUDONLY' });
    seedBig(app, 'ZZE1', 2500000);
    app.run('state.view = "settingsCategory"; state.settingsCategory = "catData"; render();');
    tap(app, 'settings-category', 'catData');
    t.includes(app.html(), 'data-page="cloudStorage"', 'Data lists Cloud Storage when signed in (1A)');
    const dh = app.html();
    t.ok(dh.indexOf('data-page="settingsStorage"') < dh.indexOf('data-page="cloudStorage"'), '…after Phone Storage');
    await openStore(app);
    t.eq(app.state().view, 'cloudStorage', 'it opens');
    const h = app.html();
    t.includes(h, 'id="cs-totals"', 'the totals');
    t.includes(h, '☁ In the cloud', 'the overall total');
    t.includes(h, 'about 2.38 MB', 'sizes in MB, said as about');
    t.eq(app.fn('cloudBytesText')(3 * 1024 * 1024 * 1024), '3.00 GB', 'past 1 GB: GB');
    t.eq(app.fn('cloudBytesText')(2048), '2.0 KB', 'small: as the phone says it');
    t.excludes(h, 'storage-bar', 'no limit or bar (2A)');
    t.includes(h, 'ZZCLOUDONLY', 'the biggest job is named');
    t.ok(h.indexOf('ZZCLOUDONLY') < h.indexOf('ZZONPHONE'), 'biggest first');
    const card = (id) => { const i = h.indexOf('data-id="' + id + '"'); return h.slice(i, h.indexOf('</div>\n        </div>', i)); };
    t.includes(card(here), 'on this phone', 'a phone job says so');
    t.includes(card('ZZE1'), 'session-cloud', 'a cloud-only job has ☁');
    t.includes(h, 'data-action="cs-photos"', 'Manage Photos (5A)');
    t.includes(h, 'data-action="cs-select-toggle"', 'Select');
    // Phone Storage links across.
    app.run('setView("settingsStorage")');
    t.includes(app.html(), 'data-action="cs-open"', 'Phone Storage links to Cloud Storage');
    // Signed out: no row, and the view falls back.
    const out = boot();
    out.run('state.view = "settingsCategory"; state.settingsCategory = "catData"; render();');
    tap(out, 'settings-category', 'catData');
    t.excludes(out.html(), 'data-page="cloudStorage"', 'signed out: no Cloud Storage row');
    out.run('state.view = "cloudStorage"; render();');
    t.includes(out.html(), 'Phone Storage', 'signed out on the view: Phone Storage instead, never blank');
  });

  /* ------------------------------------------------------------------ 45f */
  await t.group('45f — Select ticks only jobs NOT on this phone (4A); a job that arrives on the phone after it was ticked is never offered for deleting', async () => {
    const app = await signedIn();
    const here = plainJob(app, 'ZZF-HERE'); away(app);
    await run(app);
    seed(app, 'ZZF1', { site: 'ZZF1SITE', notes: 'x'.repeat(3000) });
    seed(app, 'ZZF2', { site: 'ZZF2SITE', notes: 'x'.repeat(2000) });
    await openStore(app);
    tap(app, 'cs-select-toggle');
    t.includes(app.html(), 'data-action="cs-delete" disabled', 'Delete… grey with nothing ticked');
    tap(app, 'cs-tap', here);
    t.notOk(!!app.state().cloudStore.selected[here], 'a phone job is not ticked');
    t.ok(app.toasts.some(x => /on this phone/.test(x)), '…and says where to delete it');
    tap(app, 'cs-tap', 'ZZF1');
    t.ok(!!app.state().cloudStore.selected.ZZF1, 'a cloud job ticks');
    t.excludes(app.html(), 'data-action="cs-delete" disabled', 'Delete… live');
    // ZZF2 ticked, then brought onto this phone before Delete….
    tap(app, 'cs-tap', 'ZZF2');
    await app.fn('syncBringBack')(['ZZF2']); app.stopTimer(); await idle(app); app.stopTimer();
    t.ok(onPhone(app, 'ZZF2'), 'set-up: ZZF2 is on the phone now');
    t.eq(J(app.fn('cloudStoreModel')().selected), J(['ZZF1']), 'the model drops it from the selection');
    tap(app, 'cs-delete');
    const sh = sheetHTML(app);
    t.includes(sh, 'ZZF1SITE', 'the review names the cloud job');
    t.excludes(sh, 'ZZF2SITE', '…never the one now on the phone');
    t.includes(sh, 'with the photos', 'the photo counts are known here (the view was read), so it says “the photos”');
    app.doc.getElementById('cloud-del-no').click();
  });

  /* ------------------------------------------------------------------ 45g */
  await t.group('45g — Delete… uses V107’s review and delete; the figures are read again; the cloud tab’s list loses it too', async () => {
    const app = await signedIn();
    await run(app);
    seed(app, 'ZZG1', { site: 'ZZG1SITE' });
    seed(app, 'ZZG2', { site: 'ZZG2SITE' });
    seedBig(app, 'ZZG1', 400000);
    await openCloud(app);
    t.ok(app.state().cloudJobs.jobs.some(j => j.id === 'ZZG1'), 'set-up: the cloud tab has it');
    app.run('state.view = "settingsCategory"');
    await openStore(app);
    const totalBefore = app.fn('cloudStoreModel')().total;
    tap(app, 'cs-select-toggle');
    tap(app, 'cs-tap', 'ZZG1');
    tap(app, 'cs-delete');
    const sh = sheetHTML(app);
    t.includes(sh, 'Delete from the cloud', 'V107’s review sheet');
    t.includes(sh, 'ZZG1SITE', 'naming the job');
    t.includes(sh, 'No copy is kept', 'saying no copy is kept');
    t.includes(sh, '📷 1', 'with its photo');
    const r0 = reads(app);
    app.doc.getElementById('cloud-del-yes').click();
    await until(() => app.srv.row('ZZG1').deleted === true);
    await idle(app); app.stopTimer();
    await until(() => reads(app) > r0 && !app.state().cloudStore.loading);
    await tick(5);
    t.eq(app.srv.row('ZZG1').deleted, true, 'deleted from the cloud');
    t.eq(app.srv.row('ZZG2').deleted, false, 'the other job untouched');
    t.ok(reads(app) > r0, 'the figures are read again');
    t.notOk(app.state().cloudStore.top.some(j => j.id === 'ZZG1'), 'it leaves the biggest jobs');
    t.ok(app.fn('cloudStoreModel')().total < totalBefore - 300000, 'the total drops (its photo too)');
    t.notOk(app.state().cloudStore.selecting, 'Select mode ends');
    t.ok(app.toasts.some(x => /Deleted 1 job from the cloud with 1 photo/.test(x)), 'the toast says what went');
    t.notOk(app.state().cloudJobs.jobs.some(j => j.id === 'ZZG1'), 'the cloud tab’s list loses it without a re-read');
  });

  /* ------------------------------------------------------------------ 45h */
  await t.group('45h — DELETE typed at 5+ or a certificate; a wrong word deletes nothing, on the sheet and in the action itself', async () => {
    const app = await signedIn();
    await run(app);
    seed(app, 'ZZHC', { site: 'ZZCERT', certNo: 'ZZC-808', locked: true });
    for (let k = 1; k <= 5; k++) seed(app, 'ZZH' + k, { site: 'ZZH' + k });
    await openStore(app);
    tap(app, 'cs-select-toggle');
    tap(app, 'cs-tap', 'ZZHC');
    tap(app, 'cs-delete');
    let sh = sheetHTML(app);
    t.includes(sh, 'ZZC-808', 'the certificate is named');
    t.includes(sh, 'cloud-del-input', 'the word box');
    typeWord(app, 'DELET');
    app.doc.getElementById('cloud-del-yes').click();
    await tick(20);
    t.eq(app.srv.row('ZZHC').deleted, false, 'a part of the word: nothing deleted');
    app.doc.getElementById('cloud-del-no').click();
    // The action's own check: a caller that skips the sheet's.
    const was = app.run('openCloudDeleteSheet');
    app.sandbox.openCloudDeleteSheet = (o, onYes) => { app.sandbox.__ret = onYes('nope'); };
    app.fn('cloudStoreDeleteSelected')();
    await tick(20);
    t.eq(app.run('__ret'), false, 'the action refuses a wrong word itself');
    t.eq(app.srv.row('ZZHC').deleted, false, '…and nothing is deleted');
    app.sandbox.openCloudDeleteSheet = was;
    // Five plain jobs: the word too.
    tap(app, 'cs-select-toggle'); tap(app, 'cs-select-toggle');
    for (let k = 1; k <= 5; k++) tap(app, 'cs-tap', 'ZZH' + k);
    tap(app, 'cs-delete');
    sh = sheetHTML(app);
    t.includes(sh, 'cloud-del-input', 'five jobs: the word box (4B)');
    typeWord(app, ' delete ');
    app.doc.getElementById('cloud-del-yes').click();
    await until(() => app.srv.row('ZZH5').deleted === true);
    await idle(app); app.stopTimer();
    t.ok([1, 2, 3, 4, 5].every(k => app.srv.row('ZZH' + k).deleted === true), 'typed: all five go');
  });

  /* ------------------------------------------------------------------ 45i */
  await t.group('45i — getting around: Back returns where it came from; Manage Photos returns to it and reads again; another account’s figures are never shown', async () => {
    const app = await signedIn();
    await run(app);
    seed(app, 'ZZI1');
    app.run('state.view = "settingsCategory"; state.settingsCategory = "catData"; render();');
    await openStore(app);
    t.eq(app.state().cloudStore.ret, 'settingsCategory', 'notes where it was opened');
    const r0 = reads(app);
    tap(app, 'cs-photos');
    t.eq(app.state().view, 'photoManager', 'Manage Photos opens');
    tap(app, 'pm-back');
    t.eq(app.state().view, 'cloudStorage', 'Back from Manage Photos lands on Cloud Storage');
    await until(() => reads(app) > r0 && !app.state().cloudStore.loading);
    t.ok(reads(app) > r0, '…and reads the figures again (photos may have gone)');
    tap(app, 'cs-back');
    t.eq(app.state().view, 'settingsCategory', 'Back returns to Data');
    // Opened again: it reads again (6A).
    const r1 = reads(app);
    await openStore(app);
    t.ok(reads(app) > r1, 'every open reads (6A)');
    // Another account's figures.
    app.run('state.cloudStore.uid = "ZZOTHER"; state.cloudStore.jobs = { n: 98765, bytes: 1 }; state.view = "settingsCategory";');
    tap(app, 'cs-open');
    t.excludes(app.html(), '98,765', 'figures from another account are never drawn, not even while reading');
    await until(() => !app.state().cloudStore.loading);
  });

  /* ------------------------------------------------------------------ 45j */
  await t.group('45j — release: V108, cache, welcome copy, changelog, dispatch, constant, SQL files', async () => {
    const app = boot();
    t.eq(app.run('APP_VERSION'), 'V108', 'APP_VERSION V108');
    t.eq(app.run('WELCOME_VERSION'), 'V108', 'welcome rolled');
    t.eq(app.run('CLOUD_STORAGE_TOP'), 10, 'ten biggest (3A)');
    const sw = fs.readFileSync(path.join(APP_DIR, 'sw.js'), 'utf8');
    t.includes(sw, "const CACHE_VERSION = 'pat-v108';", 'cache key pat-v108');
    const core = fs.readFileSync(path.join(APP_DIR, 'render-core.js'), 'utf8');
    t.includes(core, '<strong>See your cloud space.</strong>', 'the welcome copy is this release’s');
    const help = fs.readFileSync(path.join(APP_DIR, 'render-help.js'), 'utf8');
    const v8 = help.indexOf('<p><strong>V108</strong>'), v7 = help.indexOf('<p><strong>V107</strong>'), v6 = help.indexOf('<p><strong>V106</strong>');
    t.ok(v8 > -1 && v7 > v8 && v6 > v7, 'About: V108, V107, V106');
    t.excludes(help, '<p><strong>V105</strong>', 'V105 rolled off');
    const disp = fs.readFileSync(path.join(APP_DIR, 'dispatch.js'), 'utf8');
    for (const a of ['cs-open', 'cs-back', 'cs-refresh', 'cs-select-toggle', 'cs-tap', 'cs-delete', 'cs-photos']) t.includes(disp, `'${a}':`, 'dispatch wires ' + a);
    const sql = fs.readFileSync(path.join(APP_DIR, 'supabase', 'v108-storage.sql'), 'utf8');
    t.includes(sql, 'add column if not exists doc_bytes integer', 'v108-storage.sql adds doc_bytes');
    t.includes(sql, 'as n, coalesce(sum(bytes), 0)::bigint as b', '…and b, after n (a view gains columns only at the end)');
    t.includes(sql, 'security_invoker = true', '…keeping the reader’s rights');
    const schema = fs.readFileSync(path.join(APP_DIR, 'supabase', 'schema.sql'), 'utf8');
    t.includes(schema, 'add column if not exists doc_bytes integer', 'schema.sql: a new project gets it too');
    t.includes(schema, 'as n, coalesce(sum(bytes), 0)::bigint as b', 'schema.sql: the view too');
    const iso = fs.readFileSync(path.join(APP_DIR, 'supabase', 'isolation-test.sql'), 'utf8');
    t.includes(iso, "'8d|B cannot add up A''s photo sizes; B''s own are|'", 'isolation-test.sql checks the sizes (8d)');
  });
};
