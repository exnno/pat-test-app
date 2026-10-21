/* Standing test — move items into an EXISTING job (V103, roadmap Stage 9B)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked: 1A Edit selected gains "Move to another job…"
   beside V101's "Move to a new job…"; 2A the other jobs on this phone, newest
   first, locked ones greyed with why, a filter above MOVE_TO_FILTER_AT jobs;
   3A asset numbers already in the target are resolved per item — Leave it here
   (pre-selected, 3.2A) / Keep the one already there / Use this one instead / Give
   it a new number (3.1A), Apply to all at 3+, deletes happen with the move
   (3.3A); 4B every item may go; 5A warnings for either certificate and a
   different tester; 6A after the target's own items; 7A V101's "· Open" offer.
   Claude's guard (sync.js): a job items moved to counts as ready on another phone
   only once it HOLDS them (or records them moved on) — 40h.

   The helpers above the groups are 38's, copied (the fake server applies photo
   updates). ⚠ TAPS GO THROUGH #app (V67 lesson). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { tick, withSession, withItem, recentDate } = require('../fixture');

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

// jsonb does not give back the JSON it was handed: keys come back re-sorted.
// Reversing them guarantees the order differs from anything a caller built (17).
function reorderKeys(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(reorderKeys);
  const out = {};
  for (const k of Object.keys(v).reverse()) out[k] = reorderKeys(v[k]);
  return out;
}

// 28's fake, with the V92 sessions table: `select` honoured (a list read gets
// no doc), docs come back re-ordered as jsonb does, and an upsert sets ONLY the
// columns it sends (PostgREST) followed by sessions_fp_guard: a doc changed
// without a new fp blanks fp. o.docFail: doc reads answer 500.
function fakeServer() {
  const calls = [];
  const tables = { sessions: [], records: [], photos: [] };
  const files = new Map();
  let stampN = 0;
  const stamp = () => { stampN++; return '2026-09-30T11:' + String(Math.floor(stampN / 60) % 60).padStart(2, '0') + ':' + String(stampN % 60).padStart(2, '0') + '.' + String(stampN).padStart(3, '0') + 'Z'; };
  const srv = { calls, tables, files, stamp, docFail: false, afterUpsert: null, hideDocs: new Set() };
  const guard = (old, row) => {
    const merged = Object.assign({}, old || {}, row);
    if (old && JSON.stringify(old.doc) !== JSON.stringify(merged.doc) && !('fp' in row)) merged.fp = null;
    if (!old && !('fp' in row)) merged.fp = null;
    return merged;
  };
  srv.fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    let body = null;
    if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    else body = init.body || null;
    calls.push({ url: u, method, body });
    if (u.includes('/storage/v1/object/photos')) {
      if (method === 'DELETE') return json(((body && body.prefixes) || []).map(p => ({ name: p })));
      const p = decodeURIComponent(u.split('/storage/v1/object/photos/')[1].split('?')[0]);
      if (method === 'GET') return new Response(new Blob(['ZZFILE:' + p], { type: 'image/jpeg' }), { status: 200 });
      files.set(p, true);
      return json({ Key: 'photos/' + p, Id: 'x' });
    }
    const qs = u.split('?')[1] || '';
    if (u.includes('/rest/v1/photos')) {
      if (method === 'GET') return json(applyQuery(tables.photos, qs));
      if (method === 'PATCH') {
        // V101: an update APPLIES (28/29's fake ignored it): the move re-points
        // session_id, and a delete marks deleted. o.photoPatchFail → 500.
        if (srv.photoPatchFail) return json({ message: 'ZZ patch broken' }, 500);
        const hit = applyQuery(tables.photos, qs.split('&').filter(p => !p.startsWith('select=')).join('&'));
        for (const r of hit) Object.assign(r, body || {}, { updated_at: stamp() });
        return new Response(null, { status: 204 });
      }
      for (const row of (Array.isArray(body) ? body : [body])) {
        const i = tables.photos.findIndex(r => r.id === row.id);
        const stored = Object.assign({}, i === -1 ? {} : tables.photos[i], row, { updated_at: stamp() });
        if (i === -1) tables.photos.push(stored); else tables.photos[i] = stored;
      }
      return new Response(null, { status: 201 });
    }
    if (u.includes('/rest/v1/sessions')) {
      if (method === 'GET') {
        const cols = (new URLSearchParams(qs).get('select') || '').split(',');
        if (srv.docFail && cols.includes('doc')) return json({ message: 'ZZ doc read broken' }, 500);
        let rows = applyQuery(tables.sessions, qs);
        if (cols.includes('doc')) rows = rows.filter(r => !srv.hideDocs.has(String(r.id)));
        return json(rows.map(r => (r.doc ? Object.assign({}, r, { doc: reorderKeys(r.doc) }) : r)));
      }
      const st = stamp();
      for (const row of (Array.isArray(body) ? body : [])) {
        const i = tables.sessions.findIndex(r => String(r.id) === String(row.id));
        const stored = Object.assign(guard(i === -1 ? null : tables.sessions[i], row), { updated_at: st });
        if (i === -1) tables.sessions.push(stored); else tables.sessions[i] = stored;
        if (srv.afterUpsert) srv.afterUpsert(stored);
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
  // A write from another phone. o.fp: a V92 phone's fingerprint; absent: a V91 phone.
  srv.otherWrite = (id, doc, o = {}) => {
    const i = tables.sessions.findIndex(r => String(r.id) === String(id));
    const row = { id, user_id: UID, doc: Object.assign({ id, items: [] }, doc || {}), deleted: false, last_modified: stamp() };
    if ('fp' in o) row.fp = o.fp;
    const stored = Object.assign(guard(i === -1 ? null : tables.sessions[i], row), { updated_at: stamp() });
    if (i === -1) tables.sessions.push(stored); else tables.sessions[i] = stored;
    return stored;
  };
  const sel = (c) => (new URLSearchParams(c.url.split('?')[1] || '').get('select') || '').split(',');
  srv.sessGets = () => calls.filter(c => c.url.includes('/rest/v1/sessions') && c.method === 'GET');
  // Requests that carry job CONTENTS. `site:doc->>site` picks (the cleared look) are not.
  srv.docGets = () => srv.sessGets().filter(c => sel(c).includes('doc'));
  srv.docIds = () => srv.docGets().flatMap((c) => {
    const v = new URLSearchParams(c.url.split('?')[1] || '').get('id') || '';
    return v.startsWith('in.(') ? v.slice(4, -1).split(',').map(s => s.replace(/^"|"$/g, '')) : [];
  });
  srv.pageGets = () => srv.sessGets().filter(c => c.url.includes('updated_at='));
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
function field(app, key, value) {
  const el = app.doc.createElement('input');
  el.dataset.inputAction = 'move-job-field';
  el.dataset.arg = key;
  el.value = value;
  fire(app, 'input', el);
}
const syncState = (app) => JSON.parse(app.storage.getItem('pat:syncState') || 'null');
async function run(app) { const r = await app.fn('syncPush')({ pull: true }); app.stopTimer(); await tick(30); return r; }
async function until(pred, ms = 2000) { for (let k = 0; k < ms / 10 && !pred(); k++) await tick(10); }
const job = (app, id) => app.state().sessions.find(s => String(s.id) === String(id));
const heldFor = (app, id) => app.fn('_syncHeldLoad')().find(e => String(e.id) === String(id) && e.kind === 'session');
const away = (app) => app.run('state.activeId = null; state.view = "sessions";');

function select(app, idx) {
  app.fn('setView')('overview');
  const st = app.state();
  st.selectionMode = true;
  st.selectedIndices = idx.slice();
  app.fn('render')();
}
function change(app, action, arg, value) {
  const el = app.doc.createElement('input');
  el.dataset.changeAction = action;
  if (arg !== undefined) el.dataset.arg = String(arg);
  el.value = value;
  fire(app, 'change', el);
}
function typed(app, action, arg, value) {
  const el = app.doc.createElement('input');
  el.dataset.inputAction = action;
  if (arg !== undefined) el.dataset.arg = String(arg);
  el.value = value;
  fire(app, 'input', el);
}
// Overview of the active job, items at `idx` selected, the sheet open on `toId`.
function pickTo(app, idx, toId) {
  select(app, idx);
  tap(app, 'move-to-open');
  tap(app, 'move-to-pick', toId);
  return app.state().moveTo;
}
// The target K (made first: ZZT1, ZZT2 + o.clash asset numbers), then the
// active job with three items: ZZA1 pass, ZZA2 fail, ZZA3 pass.
function twoJobs(app, o = {}) {
  const k = withSession(app, { site: 'ZZTARGETSITE', client: 'ZZTARGETCLIENT', prefix: 'ZT', engineer: 'ZZENG' });
  const k1 = withItem(app, { assetNo: 'ZZT1', itemType: 'Heater', location: 'Hall', result: 'pass', notes: '' });
  const extra = (o.clash || []).map(no => withItem(app, { assetNo: no, itemType: 'Fridge', location: 'Store', result: 'pass', notes: '' }));
  const k2 = withItem(app, { assetNo: 'ZZT2', itemType: 'Fan', location: 'Hall', result: 'pass', notes: '' });
  const sess = withSession(app, { site: 'ZZSOURCESITE', client: 'ZZSOURCECLIENT', prefix: 'ZS', engineer: 'ZZENG' });
  const a = withItem(app, { assetNo: 'ZZA1', itemType: 'Kettle', location: 'Kitchen', result: 'pass', notes: '' });
  const b = withItem(app, { assetNo: 'ZZA2', itemType: 'Drill', location: 'Workshop', result: 'fail', notes: '' });
  const c = withItem(app, { assetNo: 'ZZA3', itemType: 'Lamp', location: 'Office', result: 'pass', notes: '' });
  return { k, k1, k2, extra, sess, a, b, c };
}
async function photosOn(app, sess, item, n) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    ids.push(await app.run(`photoAdd(${J(String(sess.id))}, ${J(String(item.id))},
      { blob: new Blob(['ZZJPEG${i}'.repeat(40)], { type: 'image/jpeg' }), w: 1280, h: 960, bytes: 300 })`));
    await tick(20);
  }
  return ids;
}
const idbJob = (app, photoId) => app.run(`_photoTx('readonly', (s) => s.get(${J(photoId)})).then(r => r.result ? r.result.sessionId : null)`);
const ids = (s) => J((s.items || []).map(i => String(i.id)));

module.exports = async function () {

  /* ------------------------------------------------------------------ 40a */
  t.group('40a — the menu offers it; the picker: newest first, locked greyed, a filter at 9+ (1A, 2A)', () => {
    const app = boot();
    const solo = withSession(app, { site: 'ZZSOLO', client: 'ZZC' });
    withItem(app, { assetNo: 'ZZS1' });
    select(app, [0]);
    tap(app, 'bulk-menu-open');
    t.includes(app.html(), 'data-action="move-to-open"', 'Edit selected offers Move to another job');
    t.includes(app.html(), 'data-action="move-job-open"', '… beside Move to a new job (V101 kept)');
    tap(app, 'move-to-open');
    t.eq(app.state().moveTo && app.state().moveTo.step, 'blocked', 'no other job on this phone: refused');
    t.includes(app.html(), 'Use \u201cMove to a new job\u201d instead', '… and says what to do');
    tap(app, 'move-to-close');
    t.eq(app.state().moveTo, null, '× closes it');

    const r = twoJobs(app);
    const old = job(app, solo.id); old.date = '2025-01-01';
    job(app, r.k.id).date = '2026-03-01';
    const late = withSession(app, { site: 'ZZLATER', client: 'ZZC' });
    job(app, late.id).date = '2026-09-01'; job(app, late.id).locked = true;
    app.run(`state.activeId = ${J(String(r.sess.id))}`);
    select(app, [0]);
    tap(app, 'move-to-open');
    const m = app.state().moveTo;
    t.eq(m.step, 'pick', 'a job to pick from: the picker');
    t.eq(app.state().bulkEdit.menuOpen, false, 'the menu closes behind it');
    t.eq(J(app.fn('moveToTargets')(app.fn('activeSession')()).map(s => String(s.site).split(' \u2014 ').pop())), J(['ZZLATER', 'ZZTARGETSITE', 'ZZSOLO']), 'newest first, the job itself left out');
    const h = app.html();
    t.includes(h, 'Locked \u2014 unlock it first', 'a locked job is listed, saying why');
    t.excludes(h, `data-action="move-to-pick" data-arg="${late.id}"`, '… and cannot be picked');
    t.includes(h, `data-action="move-to-pick" data-arg="${r.k.id}"`, 'an unlocked job can');
    tap(app, 'move-to-pick', late.id);
    t.eq(app.state().moveTo.step, 'pick', 'a locked job tapped anyway: nothing happens');
    t.excludes(h, 'id="move-to-filter"', 'three jobs: no filter box');
    tap(app, 'move-to-close');

    for (let i = 0; i < 6; i++) withSession(app, { site: 'ZZMANY' + i, client: 'ZZC' });
    app.run(`state.activeId = ${J(String(r.sess.id))}`);
    select(app, [0]);
    tap(app, 'move-to-open');
    t.includes(app.html(), 'id="move-to-filter"', 'nine other jobs: a filter box');
    typed(app, 'move-to-filter', undefined, 'zztarget');
    t.eq(app.state().moveTo.filter, 'zztarget', 'typing is kept');
    t.eq(app.state().moveTo.step, 'pick', '… without leaving the step');
  });

  /* ------------------------------------------------------------------ 40b */
  t.group('40b — no clash: straight to "Are you sure?", then the items move in after the target\u2019s own (6A, 7A)', () => {
    const app = boot();
    const r = twoJobs(app);
    const m = pickTo(app, [0, 2], r.k.id);
    t.eq(m.step, 'confirm', 'nothing clashes: "Are you sure?"');
    t.includes(app.html(), 'into <strong>ZZTARGETCLIENT', 'it names the job they go into');
    tap(app, 'move-to-back');
    t.eq(app.state().moveTo.step, 'pick', 'Back returns to the picker');
    tap(app, 'move-to-pick', r.k.id);
    const statsBefore = app.fn('computeAppStats')().items;
    tap(app, 'move-to-go');
    const k = job(app, r.k.id), s = job(app, r.sess.id);
    t.eq(app.fn('computeAppStats')().items, statsBefore, 'lifetime item count unchanged by a move');
    t.includes(app.storage.getItem('pat:sessions'), 'movedOut', 'saved');
    t.eq(ids(k), J([r.k1.id, r.k2.id, r.a.id, r.c.id].map(String)), 'after its own items, in the original\u2019s order, same ids');
    t.eq(ids(s), J([String(r.b.id)]), 'the original keeps the rest');
    t.eq(J(s.movedOut), J({ [r.a.id]: String(r.k.id), [r.c.id]: String(r.k.id) }), 'the original records where they went (movedOut)');
    t.eq(app.state().moveTo, null, 'the sheet closes');
    t.eq(app.state().selectionMode, false, 'selection mode ends');
    t.eq(String(app.state().activeId), String(r.sess.id), 'you stay on the original (7A)');
    const offer = app.doc.getElementById('app').children.find(x => x.classList && x.classList.contains('move-offer'));
    t.ok(offer && offer.dataset.arg === String(r.k.id), 'with the "· Open" offer, for the target');
    t.includes(offer ? offer.textContent : '', 'Moved 2 items to ZZTARGETCLIENT', '… counting what moved');
    t.eq(app.state().sessions.length, 2, 'no job made');
    t.ok(k.lastModified && s.lastModified, 'both jobs changed');

    // Moving one back: the target no longer lists it as moved out.
    app.run(`state.activeId = ${J(String(r.k.id))}`);
    k.movedOut = { [r.b.id]: 'ZZELSEWHERE' };
    const back = k.items.findIndex(i => String(i.id) === String(r.a.id));
    pickTo(app, [back], r.sess.id);
    tap(app, 'move-to-go');
    t.ok(job(app, r.sess.id).items.some(i => String(i.id) === String(r.a.id)), 'moved back');
    t.notOk(r.a.id in (job(app, r.sess.id).movedOut || {}), 'the job it came back into drops it from movedOut');
  });

  /* ------------------------------------------------------------------ 40c */
  t.group('40c — 4B: every item may go; the original is left empty, and says so first', () => {
    const app = boot();
    const r = twoJobs(app);
    pickTo(app, [0, 1, 2], r.k.id);
    t.eq(app.state().moveTo.step, 'confirm', 'everything selected is allowed into an existing job');
    t.includes(app.html(), 'will be left empty', 'the confirm says the original will be empty');
    tap(app, 'move-to-go');
    t.eq(job(app, r.sess.id).items.length, 0, 'the original is empty');
    t.ok(job(app, r.sess.id), '… and still on the phone');
    t.eq(job(app, r.k.id).items.length, 5, 'the target holds all five');
    select(app, [0]);
    t.eq(app.state().cursor, 0, 'the cursor is pulled back to the empty job\u2019s end');

    const app2 = boot();
    const r2 = twoJobs(app2);
    job(app2, r2.sess.id).locked = true;
    select(app2, [0]);
    tap(app2, 'move-to-open');
    t.eq(app2.state().moveTo.step, 'blocked', 'a locked original: refused');
  });

  /* ------------------------------------------------------------------ 40d */
  t.group('40d — a clash: side by side, "Leave it here" pre-selected; nothing left to move says so in place (3A, 3.2A)', () => {
    const app = boot();
    const r = twoJobs(app, { clash: ['ZZA2'] });
    const m = pickTo(app, [1], r.k.id);
    t.eq(m.step, 'clash', 'a number already in the target: the clash step');
    t.eq(m.clashes.length, 1, 'one clash');
    t.eq(m.clashes[0].with, String(r.extra[0].id), '… against the target\u2019s item');
    t.eq(m.clashes[0].choice, 'leave', '"Leave it here" pre-selected (3.2A)');
    const h = app.html();
    t.includes(h, 'Already in ZZTARGET', 'titled for the target');
    t.includes(h, 'Moving', 'shows the item moving');
    t.includes(h, 'Fridge', '… and the one already there');
    t.includes(h, 'value="leave" data-change-action="move-to-choice"', 'four choices as radios');
    t.excludes(h, 'value="both"', 'no "keep both"');
    const before = app.html();
    tap(app, 'move-to-continue');
    t.eq(app.state().moveTo.step, 'clash', 'Continue with nothing left to move stays');
    t.includes(app.state().moveTo.error, 'Nothing would move', '… and says why');
    t.eq(app.html(), before, '… without repainting (MAP rule 3)');
    t.eq(job(app, r.sess.id).items.length, 3, 'nothing moved');

    // Leave it here, with other items moving: they go, it stays.
    tap(app, 'move-to-close');
    pickTo(app, [0, 1], r.k.id);
    tap(app, 'move-to-continue');
    t.eq(app.state().moveTo.step, 'confirm', 'with another item moving, Continue goes on');
    tap(app, 'move-to-go');
    t.eq(ids(job(app, r.sess.id)), J([r.b.id, r.c.id].map(String)), 'the clashing item stayed');
    t.ok(job(app, r.k.id).items.some(i => String(i.id) === String(r.a.id)), 'the other one moved');
  });

  /* ------------------------------------------------------------------ 40e */
  t.group('40e — the other three choices: keep the one there, use this one instead, a new number (3.1A, 3.3A)', () => {
    // Keep the one already there: the moving item is deleted, not moved.
    let app = boot();
    let r = twoJobs(app, { clash: ['ZZA2'] });
    pickTo(app, [0, 1], r.k.id);
    change(app, 'move-to-choice', r.b.id, 'keep');
    tap(app, 'move-to-continue');
    t.includes(app.html(), '1 item will be deleted', 'the confirm says what is deleted');
    tap(app, 'move-to-go');
    let s = job(app, r.sess.id), k = job(app, r.k.id);
    t.notOk(s.items.some(i => String(i.id) === String(r.b.id)), 'keep: gone from the original');
    t.notOk(k.items.some(i => String(i.id) === String(r.b.id)), '… and not in the target');
    t.ok(k.items.some(i => String(i.id) === String(r.extra[0].id)), '… whose own item stays');
    t.notOk(r.b.id in (s.movedOut || {}), 'a deleted item is not "moved out"');
    t.ok(r.a.id in (s.movedOut || {}), '… the moved one is');

    // Use this one instead: it takes the target item's place.
    app = boot();
    r = twoJobs(app, { clash: ['ZZA2'] });
    pickTo(app, [1], r.k.id);
    change(app, 'move-to-choice', r.b.id, 'replace');
    tap(app, 'move-to-continue');
    tap(app, 'move-to-go');
    k = job(app, r.k.id);
    t.eq(ids(k), J([r.k1.id, r.b.id, r.k2.id].map(String)), 'replace: in the deleted item\u2019s place');
    t.eq(k.items.filter(i => i.assetNo === 'ZZA2').length, 1, '… the number once');

    // A new number: blank and taken are refused in place; a free one goes.
    app = boot();
    r = twoJobs(app, { clash: ['ZZA2'] });
    pickTo(app, [1], r.k.id);
    change(app, 'move-to-choice', r.b.id, 'renumber');
    tap(app, 'move-to-continue');
    t.includes(app.state().moveTo.error, 'Enter a new asset number for ZZA2', 'blank: asked for');
    typed(app, 'move-to-newno', r.b.id, 'ZZT1');
    tap(app, 'move-to-continue');
    t.includes(app.state().moveTo.error, 'ZZT1 is already in', 'a number the target holds: refused');
    t.eq(app.state().moveTo.step, 'clash', '… still on the step');
    typed(app, 'move-to-newno', r.b.id, 'ZZNEW9');
    tap(app, 'move-to-continue');
    t.includes(app.html(), 'will get a new asset number', 'the confirm says so');
    tap(app, 'move-to-go');
    const moved = job(app, r.k.id).items.find(i => String(i.id) === String(r.b.id));
    t.eq(moved && moved.assetNo, 'ZZNEW9', 'renumbered and moved');
    t.eq(job(app, r.k.id).items[job(app, r.k.id).items.length - 1].id, r.b.id, '… after the target\u2019s own');

    // Two moving items given the same new number: refused.
    app = boot();
    r = twoJobs(app, { clash: ['ZZA1', 'ZZA2'] });
    pickTo(app, [0, 1], r.k.id);
    change(app, 'move-to-choice', r.a.id, 'renumber');
    change(app, 'move-to-choice', r.b.id, 'renumber');
    typed(app, 'move-to-newno', r.a.id, 'ZZSAME');
    typed(app, 'move-to-newno', r.b.id, 'ZZSAME');
    tap(app, 'move-to-continue');
    t.includes(app.state().moveTo.error, 'used twice', 'the same new number twice: refused');
  });

  /* ------------------------------------------------------------------ 40f */
  t.group('40f — Apply to all at 3+ sets every card, in place; Back keeps the choices', () => {
    const app = boot();
    const r = twoJobs(app, { clash: ['ZZA1', 'ZZA2', 'ZZA3'] });
    pickTo(app, [0, 1, 2], r.k.id);
    const h = app.html();
    t.includes(h, 'data-action="move-to-all" data-arg="replace"', 'three clashes: Apply to all');
    const before = app.html();
    tap(app, 'move-to-all', 'replace');
    t.eq(J(app.state().moveTo.clashes.map(c => c.choice)), J(['replace', 'replace', 'replace']), 'every card set');
    t.eq(app.html(), before, '… in place, no repaint');
    tap(app, 'move-to-continue');
    t.eq(app.state().moveTo.step, 'confirm', 'on to the confirm');
    t.includes(app.html(), '3 items will be deleted', '… which counts the target\u2019s three');
    tap(app, 'move-to-back');
    t.eq(app.state().moveTo.step, 'clash', 'Back returns to the clash step');
    t.eq(app.state().moveTo.clashes[0].choice, 'replace', '… choices kept');

    const app2 = boot();
    twoJobs(app2, { clash: ['ZZA1', 'ZZA2'] });
    pickTo(app2, [0, 1], app2.state().sessions[1].id);
    t.excludes(app2.html(), 'data-action="move-to-all"', 'two clashes: no Apply to all');
  });

  /* ------------------------------------------------------------------ 40g */
  t.group('40g — the warnings: either certificate, a different tester (5A); a job changed underneath stops it', () => {
    const app = boot();
    const r = twoJobs(app);
    job(app, r.k.id).certNo = 'ZZCERT7';
    job(app, r.sess.id).reportAt = '2026-10-01T10:00:00.000Z';
    job(app, r.k.id).instrumentId = 'ZZGONE';
    job(app, r.k.id).instrumentSnapshot = { make: 'ZZOTHERTESTER', model: '' };
    pickTo(app, [0], r.k.id);
    const h = app.html();
    t.includes(h, 'already been made for ZZTARGETCLIENT', 'the target\u2019s certificate');
    t.includes(h, 'No. ZZCERT7', '… with its number');
    t.includes(h, 'already been made for this job', 'the original\u2019s certificate');
    t.includes(h, 'ZZOTHERTESTER for them', 'a different tester');
    tap(app, 'move-to-close');
    job(app, r.k.id).instrumentId = ''; delete job(app, r.k.id).instrumentSnapshot;
    pickTo(app, [0], r.k.id);
    t.excludes(app.html(), 'for them.', 'the same tester: no tester warning');

    // Changed underneath: the target locked, or a new clash, after the choices.
    tap(app, 'move-to-close');
    pickTo(app, [0], r.k.id);
    job(app, r.k.id).locked = true;
    tap(app, 'move-to-go');
    t.eq(app.state().moveTo.step, 'blocked', 'the target locked meanwhile: stopped');
    t.eq(job(app, r.sess.id).items.length, 3, 'nothing moved');
    tap(app, 'move-to-close');
    job(app, r.k.id).locked = false;
    pickTo(app, [0], r.k.id);
    job(app, r.k.id).items.push({ id: 'ZZSNEAK', assetNo: 'ZZA1', result: 'pass' });
    tap(app, 'move-to-go');
    t.eq(app.state().moveTo.step, 'blocked', 'a clash appeared meanwhile: stopped');
    t.includes(app.html(), 'changed while you were choosing', '… and says so');
    t.eq(job(app, r.sess.id).items.length, 3, 'nothing moved');

    // The clashing item vanished from the target after "keep the one there" was
    // chosen: deleting this one now would lose the only copy. Stopped.
    const app2 = boot();
    const r2 = twoJobs(app2, { clash: ['ZZA2'] });
    pickTo(app2, [0, 1], r2.k.id);
    change(app2, 'move-to-choice', r2.b.id, 'keep');
    tap(app2, 'move-to-continue');
    const kk = job(app2, r2.k.id);
    kk.items = kk.items.filter(i => String(i.id) !== String(r2.extra[0].id));
    tap(app2, 'move-to-go');
    t.eq(app2.state().moveTo.step, 'blocked', 'the clashing item gone meanwhile: stopped');
    t.ok(job(app2, r2.sess.id).items.some(i => String(i.id) === String(r2.b.id)), '… and the item is not deleted');
  });

  /* ------------------------------------------------------------------ 40h */
  await t.group('40h — photos: moved ones re-labelled, deleted ones swept (MAP rule 5)', async () => {
    const app = await signedOut();
    await until(() => app.state().photoMetaReady);
    const r = twoJobs(app, { clash: ['ZZA2'] });
    const pt = await photosOn(app, r.k, r.extra[0], 1);
    const pa = await photosOn(app, r.sess, r.a, 2);
    const pb = await photosOn(app, r.sess, r.b, 1);
    app.run(`state.activeId = ${J(String(r.sess.id))}`);
    pickTo(app, [0, 1], r.k.id);
    change(app, 'move-to-choice', r.b.id, 'replace');
    tap(app, 'move-to-continue');
    t.includes(app.html(), 'with 1 photo', 'the confirm counts the photos deleted');
    tap(app, 'move-to-go');
    await tick(120);
    const meta = app.state().photoMeta;
    t.eq(meta[pa[0]].s, String(r.k.id), 'a moved item\u2019s photo names the target');
    t.eq(await idbJob(app, pa[1]), String(r.k.id), '… in the photo store too');
    t.eq(meta[pb[0]].s, String(r.k.id), 'the replacing item\u2019s photo too');
    t.notOk(meta[pt[0]], 'the replaced item\u2019s photo is gone');
    t.eq(app.fn('photoCountForItem')(r.extra[0].id), 0, '… and counts 0');
  });

  /* ------------------------------------------------------------------ 40i */
  // The OTHER phone holds both jobs; the cloud has the smaller original first,
  // and the target's own row only later. V101 took "the target is here" as ready.
  await t.group('40i — sync: a target already here counts only once it HOLDS the items (Claude\u2019s guard, rule 39)', async () => {
    const app = await signedIn();
    const r = twoJobs(app);
    away(app);
    await run(app);
    const docJ = Object.assign(JSON.parse(J(job(app, r.sess.id))), { items: [JSON.parse(J(r.a))], movedOut: { [r.b.id]: String(r.k.id), [r.c.id]: String(r.k.id) } });
    const docK = Object.assign(JSON.parse(J(job(app, r.k.id))), { items: [r.k1, r.k2, r.b, r.c].map(x => JSON.parse(J(x))) });
    app.srv.otherWrite(r.sess.id, docJ);
    await run(app);
    const h = heldFor(app, r.sess.id);
    t.ok(h && h.reason === 'fewer-items', 'the target here does not hold them yet: the original waits');
    t.eq(job(app, r.sess.id).items.length, 3, 'this phone keeps all three meanwhile');
    app.srv.otherWrite(r.k.id, docK);
    for (let i = 0; i < 3 && (heldFor(app, r.sess.id) || job(app, r.sess.id).items.length !== 1); i++) await run(app);
    t.notOk(heldFor(app, r.sess.id), 'the target\u2019s row lands: it settles by itself');
    t.eq(job(app, r.sess.id).items.length, 1, 'the smaller original applied');
    t.eq(job(app, r.k.id).items.length, 4, 'the target holds them');

    const holds = app.fn('_syncDestHolds');
    app.run(`state.sessions.push({ id: 'ZZD', items: [{ id: 'x' }], movedOut: { y: 'ZZE', z: 'ZZD' } })`);
    t.eq(holds('ZZD', { x: 'ZZD' }), true, 'holds it: ready');
    t.eq(holds('ZZD', { y: 'ZZD' }), true, 'moved on from there (movedOut): ready, V101\u2019s one hop');
    t.eq(holds('ZZD', { z: 'ZZD' }), false, '"moved on" to itself is not');
    t.eq(holds('ZZD', { w: 'ZZD' }), false, 'neither held nor moved on: not ready');
    t.eq(holds('ZZD', { w: 'ZZOTHER' }), true, 'only the items sent to THIS job are asked about');
  });

  /* ------------------------------------------------------------------ 40j */
  t.group('40j — guards: no repaint under the sheet; leaving clears it; the new actions are wired', () => {
    const app = boot();
    const r = twoJobs(app);
    select(app, [0]);
    tap(app, 'move-to-open');
    t.eq(app.fn('_syncSafeToRepaint')(), false, 'a sync never repaints under the sheet');
    app.fn('setView')('sessions');
    t.eq(app.state().moveTo, null, 'leaving the Overview clears it');
    t.eq(app.fn('_syncSafeToRepaint')(), true, '… and repaints are allowed again');
    const src = fs.readFileSync(path.join(APP_DIR, 'dispatch.js'), 'utf8');
    for (const a of ['move-to-open', 'move-to-close', 'move-to-pick', 'move-to-all', 'move-to-continue', 'move-to-back', 'move-to-go', 'move-to-filter', 'move-to-newno', 'move-to-choice']) {
      t.includes(src, `'${a}':`, `dispatch wires ${a}`);
    }
    t.ok(r.k && app.run('MOVE_TO_FILTER_AT') === 8, 'the filter threshold is 8');
  });
};
