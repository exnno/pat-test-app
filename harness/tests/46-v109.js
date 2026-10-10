/* Standing test — V109 (housekeeping + Cloud Storage from the cloud tab —
   spec 1A 2A 3A 4A)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Jobs → ☁ In the cloud gains "☁ Cloud Storage ›" in the
   tab's top row, left of Select (2A): shown whether or not the list has been
   read and with no cloud-only jobs, hidden while ticking jobs. Back returns to
   the cloud tab. Settings → Data → Cloud Storage and Phone Storage's button stay
   (3A). The browser-tab icon is the plug on its own (favicon.ico 16/32/48) and
   the home-screen icon is the 180 px apple-touch-icon.png (4A). utils.js's dead
   setupLongPress removed (13n updated).

   Helpers are 45's (the fake server, sign-in, seed), copied as every cloud
   group does. The cloud tab's button is tapped by reading the RENDERED markup's
   data-action — not by naming the action — so a button wired to the wrong
   action fails here (the V67 lesson: drive the surface the browser uses).

   ⚠ WHAT THIS FILE CANNOT PROVE. How the icons LOOK: the plug at 16 px is
   checked by eye (post-commit checklist). This file proves the files are what
   they claim (an ICO holding 16/32/48; a 180×180 PNG), wired, and precached. */

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

// The cloud tab's top row, as drawn.
const cloudHead = (app) => { const h = app.html(); const i = h.indexOf('<div class="cloud-head">'); return i < 0 ? '' : h.slice(i, h.indexOf('</div>', i)); };
// Tap a RENDERED button: its data-action (and data-arg) are read from the markup
// on screen, then the click goes through #app's delegated listener.
function tapRendered(app, cls) {
  const h = app.html();
  const m = h.match(new RegExp('<button[^>]*class="[^"]*\\b' + cls + '\\b[^"]*"[^>]*>'));
  if (!m) return false;
  const a = m[0].match(/data-action="([^"]*)"/);
  const g = m[0].match(/data-arg="([^"]*)"/);
  if (!a) return false;
  tap(app, a[1], g ? g[1] : undefined);
  return true;
}
// An ICO's directory: [{w, h}] (0 means 256).
function icoSizes(buf) {
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return null;
  const n = buf.readUInt16LE(4), out = [];
  for (let i = 0; i < n; i++) out.push({ w: buf[6 + i * 16] || 256, h: buf[7 + i * 16] || 256 });
  return out;
}

module.exports = async function () {
  /* ------------------------------------------------------------------ 46a */
  await t.group('46a — the cloud tab shows ☁ Cloud Storage: before reading, with nothing cloud-only, left of Select; hidden while ticking; signed out never', async () => {
    const app = await signedIn();
    // Before the list is read: the tab's first state.
    app.run('state.view = "sessions"; state.jobsTab = "cloud"; state.cloudJobs = {}; render();');
    t.includes(app.html(), 'data-action="cloud-refresh">Show them', 'the tab is in its not-read-yet state');
    t.includes(cloudHead(app), 'data-action="cs-open"', 'Cloud Storage is there before the list is read');
    // Every cloud job is on this phone: no Select, the link still there.
    const here = plainJob(app, 'ZZ46ONPHONE'); away(app);
    await run(app);
    app.run('state.jobsTab = "phone";');
    await openCloud(app);
    t.ok(app.state().cloudJobs.ok, 'the list was read');
    t.includes(app.html(), 'Every job in the cloud is on this phone.', 'nothing is cloud-only');
    t.excludes(cloudHead(app), 'cloud-select-toggle', '…so no Select');
    t.includes(cloudHead(app), 'data-action="cs-open"', '…and Cloud Storage is still offered (phone jobs use cloud space too)');
    // A cloud-only job: the link sits left of Select.
    seed(app, 'ZZ46A1');
    tap(app, 'cloud-refresh');
    await until(() => app.state().cloudJobs.ok && !app.state().cloudJobs.loading && app.html().includes('ZZZZ46A1'));
    const head = cloudHead(app);
    t.includes(head, 'cloud-select-toggle', 'Select is drawn');
    t.ok(head.indexOf('data-action="cs-open"') > -1 && head.indexOf('data-action="cs-open"') < head.indexOf('cloud-select-toggle'), 'Cloud Storage comes before Select (left of it)');
    // Ticking jobs: the link goes, the selection bar is there.
    tap(app, 'cloud-select-toggle');
    t.ok(app.state().cloudJobs.selecting, 'selecting');
    t.excludes(app.html(), 'data-action="cs-open"', 'hidden while ticking jobs');
    t.includes(app.html(), 'data-action="cloud-delete"', 'the selection bar is drawn instead');
    tap(app, 'cloud-select-toggle');
    t.includes(cloudHead(app), 'data-action="cs-open"', 'back after Done');
    t.ok(String(here).length > 0, 'a phone job exists');
    // Signed out: no tab, no link.
    const out = boot();
    out.run('state.view = "sessions"; state.jobsTab = "cloud"; render();');
    t.excludes(out.html(), 'data-action="cs-open"', 'signed out: no Cloud Storage on the Jobs screen');
  });

  /* ------------------------------------------------------------------ 46b */
  await t.group('46b — tapping it opens Cloud Storage; Back returns to the cloud tab; Settings and Phone Storage still lead there (3A)', async () => {
    const app = await signedIn();
    await run(app);
    seed(app, 'ZZ46B1');
    await openCloud(app);
    t.includes(app.html(), 'ZZZZ46B1', 'the cloud tab lists the job');
    const r0 = reads(app);
    t.ok(tapRendered(app, 'cloud-storage-link'), 'the drawn button is tapped');
    await until(() => !!(app.state().cloudStore && !app.state().cloudStore.loading));
    t.eq(app.state().view, 'cloudStorage', 'Cloud Storage opens');
    t.ok(reads(app) > r0, '…and reads the figures');
    t.eq(app.state().cloudStore.ret, 'sessions', 'it notes the Jobs screen as where to go back to');
    tap(app, 'cs-back');
    t.eq(app.state().view, 'sessions', 'Back returns to the Jobs screen');
    t.eq(app.state().jobsTab, 'cloud', '…on the cloud tab');
    t.includes(app.html(), 'ZZZZ46B1', '…with its list');
    // Manage Photos from there, Back, Back: still the cloud tab.
    t.ok(tapRendered(app, 'cloud-storage-link'), 'opened again');
    await until(() => !!(app.state().cloudStore && !app.state().cloudStore.loading));
    tap(app, 'cs-photos');
    t.eq(app.state().view, 'photoManager', 'Manage Photos');
    tap(app, 'pm-back');
    t.eq(app.state().view, 'cloudStorage', 'Back → Cloud Storage');
    await until(() => !app.state().cloudStore.loading);
    tap(app, 'cs-back');
    t.eq(app.state().view, 'sessions', 'Back → the Jobs screen, not Settings');
    // 3A: the Settings way in stays.
    app.run('state.view = "settingsCategory"; state.settingsCategory = "catData"; render();');
    tap(app, 'settings-category', 'catData');
    t.includes(app.html(), 'data-page="cloudStorage"', 'Settings → Data still lists Cloud Storage');
    app.run('setView("settingsStorage")');
    t.includes(app.html(), 'id="cloud-storage-btn"', 'Phone Storage still has its button');
    tap(app, 'cs-open');
    await until(() => !!(app.state().cloudStore && !app.state().cloudStore.loading));
    tap(app, 'cs-back');
    t.eq(app.state().view, 'settingsStorage', 'opened from Phone Storage, Back returns there');
  });

  /* ------------------------------------------------------------------ 46c */
  await t.group('46c — icons: the tab icon is favicon.ico (16/32/48), the home-screen icon the 180 px PNG; both precached', () => {
    const html = fs.readFileSync(path.join(APP_DIR, 'index.html'), 'utf8');
    t.includes(html, '<link rel="icon" href="favicon.ico" sizes="16x16 32x32 48x48">', 'index.html: the tab icon is favicon.ico');
    t.includes(html, '<link rel="apple-touch-icon" href="apple-touch-icon.png">', 'index.html: the home-screen icon is the 180 px file');
    t.excludes(html, 'rel="icon" href="icon-192.png"', 'not the 192 px app icon any more');
    t.excludes(html, 'rel="apple-touch-icon" href="icon-192.png"', '…for either');
    const ico = fs.readFileSync(path.join(APP_DIR, 'favicon.ico'));
    const sizes = icoSizes(ico);
    t.ok(!!sizes, 'favicon.ico is a real ICO file');
    t.deepEq((sizes || []).map(s => s.w + 'x' + s.h).sort(), ['16x16', '32x32', '48x48'], 'holding 16, 32 and 48 px');
    const png = fs.readFileSync(path.join(APP_DIR, 'apple-touch-icon.png'));
    t.eq(png.toString('latin1', 1, 4), 'PNG', 'apple-touch-icon.png is a PNG');
    t.eq(png.readUInt32BE(16) + 'x' + png.readUInt32BE(20), '180x180', '…180 × 180 (what iOS asks for)');
    const sw = fs.readFileSync(path.join(APP_DIR, 'sw.js'), 'utf8');
    const assets = sw.slice(sw.indexOf('const ASSETS = ['), sw.indexOf('];', sw.indexOf('const ASSETS = [')));
    t.includes(assets, "'./favicon.ico'", 'sw precaches favicon.ico');
    t.includes(assets, "'./apple-touch-icon.png'", 'sw precaches apple-touch-icon.png');
    t.includes(assets, "'./icon-192.png'", 'the manifest icons stay precached');
  });

  /* ------------------------------------------------------------------ 46d */
  await t.group('46d — release: V109, cache, welcome copy, changelog; setupLongPress gone from every app file', () => {
    const app = boot();
    t.eq(app.run('APP_VERSION'), 'V109', 'APP_VERSION V109');
    t.eq(app.run('WELCOME_VERSION'), 'V109', 'welcome rolled');
    const sw = fs.readFileSync(path.join(APP_DIR, 'sw.js'), 'utf8');
    t.includes(sw, "const CACHE_VERSION = 'pat-v109';", 'cache key pat-v109');
    const core = fs.readFileSync(path.join(APP_DIR, 'render-core.js'), 'utf8');
    t.includes(core, '<strong>Cloud Storage from your jobs.</strong>', 'the welcome copy is this release’s');
    const help = fs.readFileSync(path.join(APP_DIR, 'render-help.js'), 'utf8');
    const v9 = help.indexOf('<p><strong>V109</strong>'), v8 = help.indexOf('<p><strong>V108</strong>'), v7 = help.indexOf('<p><strong>V107</strong>');
    t.ok(v9 > -1 && v8 > v9 && v7 > v8, 'About: V109, V108, V107');
    t.excludes(help, '<p><strong>V106</strong>', 'V106 rolled off');
    const files = fs.readdirSync(APP_DIR).filter(f => f.endsWith('.js') && !/\.min\.js$|^supabase\.umd\.js$/.test(f));
    const users = files.filter(f => fs.readFileSync(path.join(APP_DIR, f), 'utf8').includes('setupLongPress('));
    t.deepEq(users, [], 'no app file defines or calls setupLongPress');
  });
};
