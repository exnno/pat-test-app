/* Standing test — move items to a new job (V101, roadmap Stage 9 part 1: split)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked: 1A Overview → Select items → Edit selected →
   "Move to a new job…", a review of what is moving, then "Are you sure?"; 2A a
   NEW job only; 3A client + site asked, the rest copied and editable (More
   details); 4A not on a locked job; 5A at least one item stays; 6A the original
   keeps its certificate number, the confirm warns when one was made; 7 photos and
   map pins move with their items — this phone's copies re-labelled, the cloud rows
   re-pointed; 8A the original records `movedOut` {itemId: jobId}, so another phone
   takes the smaller job without the "fewer items" question when the job the items
   went to is in the cloud (it comes down too); 10 always on; 11A an "· Open" pill.

   The fake server is 29's, with photo updates that APPLY (28/29 ignored them).
   ⚠ TAPS GO THROUGH #app (V67 lesson). */

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

// Overview of the active job, items at `idx` selected.
function select(app, idx) {
  app.fn('setView')('overview');
  const st = app.state();
  st.selectionMode = true;
  st.selectedIndices = idx.slice();
  app.fn('render')();
}
// The whole flow through the taps: open → client/site → Continue → Move.
function move(app, idx, client, site, more) {
  select(app, idx);
  tap(app, 'move-job-open');
  field(app, 'client', client);
  field(app, 'site', site);
  for (const k of Object.keys(more || {})) field(app, k, more[k]);
  tap(app, 'move-job-continue');
  tap(app, 'move-job-go');
  return app.state().sessions[0];
}
// A job with three items: two passes and a fail in the middle.
function threeItems(app, o = {}) {
  const sess = withSession(app, { site: o.site || 'ZZSPLITSITE', client: o.client || 'ZZSPLITCLIENT', prefix: 'ZP', engineer: 'ZZENG' });
  const a = withItem(app, { assetNo: 'ZZA1', itemType: 'Kettle', location: 'Kitchen', result: 'pass', notes: '' });
  const b = withItem(app, { assetNo: 'ZZA2', itemType: 'Drill', location: 'Workshop', result: 'fail', notes: '' });
  const c = withItem(app, { assetNo: 'ZZA3', itemType: 'Lamp', location: 'Office', result: 'pass', notes: '' });
  return { sess, a, b, c };
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

module.exports = async function () {

  /* ------------------------------------------------------------------ 38a */
  t.group('38a — the menu offers the move; a locked job and "everything" are refused (4A, 5A)', () => {
    const app = boot();
    const { sess } = threeItems(app);
    select(app, [0]);
    tap(app, 'bulk-menu-open');
    t.includes(app.html(), 'data-action="move-job-open"', 'Edit selected offers Move to a new job');
    tap(app, 'move-job-open');
    t.eq(app.state().moveJob && app.state().moveJob.step, 'form', 'one item of three: the form opens');
    t.eq(app.state().bulkEdit.menuOpen, false, 'the menu closes behind it');
    tap(app, 'move-job-close');
    t.eq(app.state().moveJob, null, '× closes it');
    t.ok(app.state().selectionMode, '… and the selection is kept');

    select(app, [0, 1, 2]);
    tap(app, 'move-job-open');
    t.eq(app.state().moveJob.step, 'blocked', 'every item selected: refused');
    t.includes(app.html(), 'At least one item must stay', '… and says why');
    tap(app, 'move-job-close');

    app.fn('startEditSession')();
    app.state().editForm.locked = true;
    app.fn('saveSessionEdits')();
    select(app, [0]);
    tap(app, 'move-job-open');
    t.eq(app.state().moveJob.step, 'blocked', 'a locked job: refused');
    t.includes(app.html(), 'Unlock it in Session settings', '… and says how');
    t.eq(app.fn('activeSession')().items.length, 3, 'nothing moved');
    t.eq(app.state().sessions.length, 1, 'no job made');
  });

  /* ------------------------------------------------------------------ 38b */
  t.group('38b — the review, a client or site required, then "Are you sure?" (1A, 6A)', () => {
    const app = boot();
    const { sess, a, b } = threeItems(app);
    select(app, [0, 1]);
    tap(app, 'move-job-open');
    const m = app.state().moveJob;
    t.eq(J(m.ids), J([String(a.id), String(b.id)]), 'the selection is captured as item ids');
    const sheet = app.html().slice(app.html().indexOf('move-job-sheet'));
    t.includes(sheet, 'Moving:', 'the review list');
    t.includes(sheet, 'ZZA1 · Kettle · Kitchen', 'each item: asset, type, location');
    t.includes(sheet, 'ZZA2', '… both of them');
    t.excludes(sheet, 'ZZA3', '… and not the one staying');
    t.eq(m.date, sess.date, 'More details: the date copied');
    t.eq(m.engineer, 'ZZENG', '… the engineer');
    t.eq(m.prefix, 'ZP', '… the prefix');
    const before = app.html();
    tap(app, 'move-job-continue');
    t.eq(app.state().moveJob.step, 'form', 'no client or site: it stays on the form');
    t.includes(app.doc.getElementById('move-job-error').textContent, 'Enter a client or a site', '… and says so in place');
    t.eq(app.html(), before, '… without repainting the sheet (MAP rule 3)');
    field(app, 'client', 'ZZNEWCLIENT');
    field(app, 'site', 'ZZNEWSITE');
    tap(app, 'move-job-continue');
    t.eq(app.state().moveJob.step, 'confirm', 'Continue: "Are you sure?"');
    const h = app.html();
    t.includes(h, 'Are you sure?', 'the confirm');
    t.includes(h, '2 items · 1 fail', 'what is moving');
    t.includes(h, 'ZZSPLITSITE', 'from which job');
    t.includes(h, 'ZZNEWCLIENT', 'to which');
    t.includes(h, '>Move 2 items<', 'the button says what it does');
    t.excludes(h, 'already been made', 'no certificate made: no warning');
    tap(app, 'move-job-back');
    t.eq(app.state().moveJob.step, 'form', 'Back returns to the form');
    t.eq(app.state().moveJob.client, 'ZZNEWCLIENT', '… with what was typed');
    sess.certNo = 'ZZC-0042';
    tap(app, 'move-job-continue');
    t.includes(app.html(), 'already been made for this job (No. ZZC-0042)', 'a certificate made: the warning (6A)');
    t.eq(app.state().sessions.length, 1, 'nothing has moved yet');
  });

  /* ------------------------------------------------------------------ 38c */
  t.group('38c — the move: a new id, the items themselves, the rest copied or left (2A, 3A, 6A, 8A)', () => {
    const app = boot();
    const { sess, a, b, c } = threeItems(app);
    const origId = String(sess.id);
    sess.notes = 'ZZJOBNOTES';
    sess.certNo = 'ZZC-7';
    sess.retestTrack = true; sess.retestMonths = 12; sess.retestContact = { status: 'booked', at: '2026-01-01T00:00:00.000Z' };
    app.fn('markSessionExported')(sess);
    app.state().undoEnabled = true;
    t.ok(app.state().lastLog, 'set-up: Undo has something to undo');
    const statsBefore = app.fn('computeAppStats')().items;
    const nj = move(app, [0, 1], 'ZZNEWCLIENT', 'ZZNEWSITE');
    const orig = job(app, origId);
    t.eq(app.state().sessions.length, 2, 'one new job');
    t.ok(nj && String(nj.id) !== origId && nj.id, 'it has its own new id');
    t.eq(J(nj.items.map(i => i.id)), J([a.id, b.id]), 'the moved items keep their ids, in order');
    t.eq(nj.items[1].result, 'fail', '… and everything on them');
    t.eq(J(orig.items.map(i => i.id)), J([c.id]), 'the original keeps the rest');
    t.eq(J(orig.movedOut), J({ [a.id]: nj.id, [b.id]: nj.id }), 'and records what moved out, and where (8A)');
    t.eq(nj.movedOut, undefined, 'the new job records nothing moved out');
    t.eq(nj.date, orig.date, 'date copied');
    t.eq(nj.engineer, 'ZZENG', 'engineer copied');
    t.eq(nj.prefix, 'ZP', 'prefix copied');
    t.eq(nj.retestTrack, true, 'retest tracking copied');
    t.eq(nj.retestMonths, 12, '… with its interval');
    t.eq(nj.retestContact, null, '… the contact status fresh');
    t.eq(nj.notes, '', 'job notes stay with the original (3A)');
    t.eq(orig.notes, 'ZZJOBNOTES', '… which keeps them');
    t.eq(nj.certNo, '', 'no certificate number (6A)');
    t.eq(orig.certNo, 'ZZC-7', 'the original keeps its number');
    t.eq(nj.locked, false, 'the new job is unlocked');
    t.notOk(nj.exportedAt, 'and not exported');
    t.eq(app.fn('exportStatus')(orig), 'modified', 'the original is marked edited since its export');
    t.eq(nj.site, app.fn('composeSiteSnapshot')('ZZNEWCLIENT', 'ZZNEWSITE'), 'its title is the new client and site');
    const cl = app.state().clients.find(x => x.name === 'ZZNEWCLIENT');
    t.ok(cl && nj.clientId === cl.id, 'the client is made and linked');
    const si = app.state().sites.find(x => x.name === 'ZZNEWSITE');
    t.ok(si && si.clientId === cl.id && nj.siteId === si.id, 'the site is made under it and linked');
    t.eq(app.state().lastLog, null, 'Undo is cleared');
    t.eq(app.state().selectionMode, false, 'selection mode ends');
    t.eq(app.state().moveJob, null, 'the sheet closes');
    t.eq(String(app.state().activeId), origId, 'the original stays on screen (11A)');
    t.eq(app.fn('computeAppStats')().items, statsBefore, 'lifetime item count unchanged');
    const offer = app.doc.getElementById('app').children.find(x => x.classList && x.classList.contains('move-offer'));
    t.ok(offer && /Moved 2 items to ZZNEWCLIENT/.test(offer.textContent), 'the "· Open" offer');
    const stored = app.storage.getItem('pat:sessions');
    t.includes(stored, String(nj.id), 'saved: the new job');
    t.includes(stored, 'movedOut', 'saved: the original\u2019s note of what moved');
    tap(app, 'move-open-new', nj.id);
    t.eq(String(app.state().activeId), String(nj.id), 'Open: the new job');
    t.eq(app.state().view, 'overview', '… on its Overview');
  });

  /* ------------------------------------------------------------------ 38d */
  t.group('38d — More details edits travel; a job changed underneath stops the move', () => {
    const app = boot();
    const { sess } = threeItems(app);
    const nj = move(app, [2], 'ZZC2', '', { date: '2026-01-15', engineer: 'ZZOTHER', name: 'ZZNAME', prefix: 'QQ' });
    t.eq(nj.date, '2026-01-15', 'the edited date');
    t.eq(nj.engineer, 'ZZOTHER', 'the edited engineer');
    t.eq(nj.name, 'ZZNAME', 'the edited name');
    t.eq(nj.prefix, 'QQ', 'the edited prefix');
    t.eq(sess.engineer, 'ZZENG', 'the original is not edited');
    t.eq(nj.siteId, '', 'client only: no site');

    const app2 = boot();
    const r = threeItems(app2);
    select(app2, [0]);
    tap(app2, 'move-job-open');
    field(app2, 'client', 'ZZX');
    tap(app2, 'move-job-continue');
    // A sync replaced the job meanwhile, without the chosen item.
    const cur = app2.fn('activeSession')();
    cur.items = cur.items.filter(i => i.id !== r.a.id);
    tap(app2, 'move-job-go');
    t.eq(app2.state().moveJob.step, 'blocked', 'at the moment of moving it checks again');
    t.includes(app2.html(), 'changed while you were choosing', '… and says why');
    t.eq(app2.state().sessions.length, 1, 'no job made');
    t.eq(app2.fn('activeSession')().items.length, 2, 'nothing moved');
    t.eq(app2.state().sessions[0].id, cur.id, 'the job left is the job that was there');
  });

  /* ------------------------------------------------------------------ 38e */
  await t.group('38e — photos are re-labelled: deleting the original keeps them (7)', async () => {
    const app = await signedOut();
    await until(() => app.state().photoMetaReady);
    const { sess, a, c } = threeItems(app);
    const pa = await photosOn(app, sess, a, 2);
    const pc = await photosOn(app, sess, c, 1);
    const nj = move(app, [0], 'ZZPHCLIENT', 'ZZPHSITE');
    const meta = app.state().photoMeta;
    t.eq(meta[pa[0]].s, String(nj.id), 'this phone\u2019s mirror: the moved photo now names the new job');
    t.eq(meta[pc[0]].s, String(sess.id), '… a photo that stayed does not');
    await tick(100);
    t.eq(await idbJob(app, pa[1]), String(nj.id), 'the photo store is re-labelled too');
    t.eq(await idbJob(app, pc[0]), String(sess.id), '… only for moved items');
    app.fn('deleteSession')(sess.id);
    await tick(60);
    t.ok(app.state().photoMeta[pa[0]] && app.state().photoMeta[pa[1]], 'the original deleted: the moved photos are still here');
    t.notOk(app.state().photoMeta[pc[0]], '… its own photo went with it');
    t.eq(app.fn('photoCountForItem')(a.id), 2, 'the moved item still counts 2 photos');
    // A store write that failed heals: label one back by hand, settle again.
    await app.run(`_photoTx('readwrite', (s) => { const q = s.get(${J(pa[0])}); q.onsuccess = () => { q.result.sessionId = 'ZZSTALE'; s.put(q.result); }; })`);
    app.state().photoMeta[pa[0]].s = 'ZZSTALE';
    const n = await app.run('photosSettleJobs()');
    t.eq(n, 1, 'photosSettleJobs re-labels what is stale (the boot heal)');
    t.eq(await idbJob(app, pa[0]), String(nj.id), '… in the store');
  });

  /* ------------------------------------------------------------------ 38f */
  await t.group('38f — signed in: the cloud rows are re-pointed; deleting the original spares them (7)', async () => {
    const app = await signedIn();
    await until(() => app.state().photoMetaReady);
    const { sess, a, c } = threeItems(app);
    const pa = await photosOn(app, sess, a, 2);
    const pc = await photosOn(app, sess, c, 1);
    app.stopTimer();
    await run(app);
    const row = (id) => app.srv.tables.photos.find(r => r.id === id);
    t.ok(row(pa[0]) && row(pa[0]).session_id === String(sess.id), 'set-up: photos up, under the original');
    const nj = move(app, [0], 'ZZCLOUDCLIENT', 'ZZCLOUDSITE');
    await tick(30);
    app.stopTimer();
    let ss = syncState(app);
    t.eq(ss.ph.sent[pa[0]].s, String(nj.id), 'straight away: the sync state names the new job');
    t.eq(ss.ph.mv[pa[0]], String(nj.id), '… and queues the cloud row');
    // The update fails once, and the row is read back still naming the old job.
    app.srv.photoPatchFail = true;
    for (const r of app.srv.tables.photos) r.updated_at = app.srv.stamp();
    await run(app);
    ss = syncState(app);
    t.eq(ss.ph.sent[pa[0]].s, String(nj.id), 'a stale row read back does not undo the move');
    t.eq(ss.ph.mv[pa[0]], String(nj.id), 'a failed update stays queued');
    app.srv.photoPatchFail = false;
    await run(app);
    ss = syncState(app);
    t.eq(row(pa[0]).session_id, String(nj.id), 'the cloud row now names the new job');
    t.eq(row(pa[1]).session_id, String(nj.id), '… both of them');
    t.eq(row(pc[0]).session_id, String(sess.id), '… the one that stayed is untouched');
    t.eq(Object.keys(ss.ph.mv).length, 0, 'the queue empties once it lands');
    t.ok(app.srv.files.has(UID + '/' + pa[0] + '.jpg'), 'the file is where it was (nothing re-uploaded)');
    const sessRow = (id) => app.srv.tables.sessions.find(r => String(r.id) === String(id));
    t.ok(sessRow(nj.id) && sessRow(nj.id).doc.items.length === 1, 'the new job is in the cloud');
    t.ok(sessRow(sess.id).doc.movedOut && sessRow(sess.id).doc.movedOut[a.id] === nj.id, 'the original\u2019s cloud copy says where the item went');
    away(app);
    app.fn('deleteSession')(sess.id);
    await tick(30);
    await run(app);
    t.eq(sessRow(sess.id).deleted, true, 'the original deleted in the cloud');
    t.eq(row(pc[0]).deleted, true, '… with its own photo');
    t.notOk(row(pa[0]).deleted, 'the moved item\u2019s photos are spared');
    t.notOk(row(pa[1]).deleted, '… both');
  });

  /* ------------------------------------------------------------------ 38g */
  // The OTHER phone: it holds the job whole; the cloud has the smaller job with
  // movedOut, and the job the items went to — dated long ago, outside the window.
  async function otherPhone() {
    const app = await signedIn();
    const r = threeItems(app);
    away(app);
    await run(app);
    const st = syncState(app);
    st.ph.sent.ZZPH9 = { s: String(r.sess.id), i: String(r.b.id) };   // a cloud photo of B this phone knows
    app.storage.setItem('pat:syncState', J(st));
    const docK = { id: 'ZZK1', site: 'ZZMOVEDTO', date: '2025-01-10', items: [r.b, r.c].map(x => JSON.parse(J(x))) };
    const docJ = Object.assign(JSON.parse(J(r.sess)), { items: [JSON.parse(J(r.a))], movedOut: { [r.b.id]: 'ZZK1', [r.c.id]: 'ZZK1' } });
    return { app, r, docK, docJ };
  }
  await t.group('38g — the other phone takes the smaller job without asking, and the job the items went to comes down (8A)', async () => {
    const { app, r, docK, docJ } = await otherPhone();
    app.srv.otherWrite('ZZK1', docK);
    app.srv.otherWrite(r.sess.id, docJ);
    await run(app);
    t.notOk(heldFor(app, r.sess.id), 'no "fewer items" question');
    t.eq(job(app, r.sess.id).items.length, 1, 'the smaller job applied');
    const k = job(app, 'ZZK1');
    t.ok(k && k.items.length === 2, 'the job they went to came down — though dated outside the 30 days');
    t.eq(J(k.items.map(i => i.id)), J([r.b.id, r.c.id]), '… with the items');
    const ss = syncState(app);
    t.eq(ss.ph.sent.ZZPH9.s, 'ZZK1', 'a known cloud photo of a moved item now names the new job');
    t.ok(app.srv.calls.some(c => c.method === 'PATCH' && c.url.includes('/rest/v1/photos') && c.body && c.body.session_id === 'ZZK1'), '… and its row is re-pointed');
  });

  /* ------------------------------------------------------------------ 38h */
  await t.group('38h — the job they went to not in the cloud yet: it asks, as before; once it arrives, it settles', async () => {
    const { app, r, docK, docJ } = await otherPhone();
    app.srv.otherWrite(r.sess.id, docJ);
    await run(app);
    const h = heldFor(app, r.sess.id);
    t.ok(h && h.reason === 'fewer-items', 'held: fewer items (the items would be on no job here)');
    t.eq(job(app, r.sess.id).items.length, 3, 'this phone keeps all three meanwhile');
    app.srv.otherWrite('ZZK1', docK);
    await run(app);
    t.notOk(heldFor(app, r.sess.id), 'it arrives: the question goes by itself');
    t.eq(job(app, r.sess.id).items.length, 1, 'the smaller job applied');
    t.ok(job(app, 'ZZK1'), 'and the new job is here');
  });

  /* ------------------------------------------------------------------ 38i */
  await t.group('38i — anything short of "every missing item moved" still asks (3A unchanged)', async () => {
    const { app, r, docK, docJ } = await otherPhone();
    delete docJ.movedOut[r.c.id];   // C is missing and not listed as moved
    app.srv.otherWrite('ZZK1', docK);
    app.srv.otherWrite(r.sess.id, docJ);
    await run(app);
    t.ok(heldFor(app, r.sess.id), 'held');
    t.eq(job(app, r.sess.id).items.length, 3, 'nothing lost');
    t.notOk(job(app, 'ZZK1'), 'nothing brought down on its account');
    const mo = app.fn('_syncMovedOut');
    t.eq(mo({ items: [{ id: 'x' }] }, { id: 'J', items: [], movedOut: { x: 'J' } }).covered, false, 'moved "to itself" is not a move');
    t.eq(mo({ items: [{ id: 'x' }] }, { id: 'J', items: [], movedOut: { x: 5 } }).covered, false, 'a malformed entry is not a move');
    t.eq(mo({ items: [{ id: 'x' }] }, { id: 'J', items: [{ id: 'x' }] }).covered, false, 'nothing missing: nothing to cover');
  });

  /* ------------------------------------------------------------------ 38j */
  t.group('38j — guards: no repaint under the sheet; movedOut is bookkeeping, and in the signature', () => {
    const app = boot();
    threeItems(app);
    select(app, [0]);
    tap(app, 'move-job-open');
    t.eq(app.fn('_syncSafeToRepaint')(), false, 'a sync never repaints under the Move sheet');
    tap(app, 'move-job-close');
    app.fn('setView')('sessions');
    t.eq(app.fn('_syncSafeToRepaint')(), true, '… and does once it is gone');
    const diff = app.fn('syncJobDiff')({ id: 'J', items: [], site: 'S' }, { id: 'J', items: [], site: 'S', movedOut: { x: 'K' } });
    t.excludes(J(diff), 'movedOut', 'the comparison sheet does not list movedOut');
    const sig = app.fn('_sessionSig');
    t.ok(sig({ id: 'J', items: [] }) !== sig({ id: 'J', items: [], movedOut: { x: 'K' } }), 'the encoding signature sees movedOut');
    t.ok(app.run('MOVED_OUT_MAX') > 0, 'movedOut is bounded');
  });
};
