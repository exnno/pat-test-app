/* Standing test — duplicate a job (V102, roadmap Stage 9 part 2)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked: 1B Session settings → "Duplicate this job…"
   (below Save/Cancel; refused while the form has unsaved changes); 2A a sheet
   like Move's — client + site and More details pre-filled, then "Are you sure?";
   3A job notes copied; 4A photos only in the cloud fetched first, and if any
   can't be, "Duplicate without them"; 5A the copy opens; 6A always on. From the
   V101 round: 9C a full copy with NEW ids (job, items, photos), 12A photos
   copied, 13A a locked job may be duplicated. And (Peter, in the build) lifetime
   stats count an item and its copies once — `copyOf`, statsKeyOf.

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


function dfield(app, key, value) {
  const el = app.doc.createElement('input');
  el.dataset.inputAction = 'dup-job-field';
  el.dataset.arg = key;
  el.value = value;
  fire(app, 'input', el);
}
// A job with three items: two passes and a fail in the middle.
function threeItems(app, o = {}) {
  const sess = withSession(app, { site: o.site || 'ZZDUPSITE', client: o.client || 'ZZDUPCLIENT', prefix: 'ZD', engineer: 'ZZENG' });
  const a = withItem(app, { assetNo: 'ZZD1', itemType: 'Kettle', location: 'Kitchen', result: 'pass', notes: '' });
  const b = withItem(app, { assetNo: 'ZZD2', itemType: 'Drill', location: 'Workshop', result: 'fail', notes: 'ZZFAILNOTE' });
  const c = withItem(app, { assetNo: 'ZZD3', itemType: 'Lamp', location: 'Office', result: 'pass', notes: '' });
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
// Session settings of the active job.
function settings(app) { tap(app, 'edit-session'); }
// The whole flow through the taps; waits for the copy (or the sheet to settle).
async function dup(app, client, site, more) {
  settings(app);
  tap(app, 'dup-job-open');
  if (client !== undefined) dfield(app, 'client', client);
  if (site !== undefined) dfield(app, 'site', site);
  for (const k of Object.keys(more || {})) dfield(app, k, more[k]);
  tap(app, 'dup-job-continue');
  tap(app, 'dup-job-go');
  await until(() => !app.state().dupJob || app.state().dupJob.step !== 'working');
  await tick(20);
  return app.state().sessions[0];
}
const stats = (app) => { const s = app.fn('computeAppStats')(); return s ? s.items + '/' + s.fails : 'none'; };

module.exports = async function () {

  /* ------------------------------------------------------------------ 39a */
  t.group('39a — Session settings offers it, below Save; unsaved changes stop it, in place (1B)', () => {
    const app = boot();
    threeItems(app);
    settings(app);
    t.eq(app.state().view, 'editSession', 'set-up: Session settings');
    const h = app.html();
    t.includes(h, 'data-action="dup-job-open"', 'the Duplicate button is there');
    t.ok(h.indexOf('id="ef-save"') !== -1 && h.indexOf('id="ef-save"') < h.indexOf('id="ef-dup-btn"'), '… below Save');
    const el = app.doc.createElement('input');
    el.dataset.inputAction = 'ef-engineer';
    el.value = 'ZZTYPED';
    fire(app, 'input', el);
    const before = app.html();
    tap(app, 'dup-job-open');
    t.eq(app.state().dupJob, null, 'unsaved changes: no sheet');
    t.includes(app.doc.getElementById('ef-dup-error').textContent, 'Save or cancel your changes first', '… it says so');
    t.eq(app.html(), before, '… in place, without repainting the form (the typing stays)');
    t.eq(app.state().editForm.engineer, 'ZZTYPED', '… and the typing is kept');
    app.state().editForm.engineer = 'ZZENG';
    tap(app, 'dup-job-open');
    t.ok(app.state().dupJob && app.state().dupJob.step === 'form', 'nothing unsaved: the sheet opens');
    app.fn('setView')('overview');
    t.eq(app.state().dupJob, null, 'leaving the screen closes it');
  });

  /* ------------------------------------------------------------------ 39b */
  t.group('39b — the sheet: pre-filled from the job, a client or site needed, then "Are you sure?" (2A)', () => {
    const app = boot();
    const { sess } = threeItems(app);
    sess.name = 'ZZJOBNAME';
    settings(app);
    tap(app, 'dup-job-open');
    const m = app.state().dupJob;
    const parts = app.fn('splitSiteSnapshot')(sess.site);
    t.eq(m.client, parts.client, 'the client is this job\u2019s');
    t.eq(m.site, parts.site, '… and the site');
    t.ok(m.client === 'ZZDUPCLIENT' && m.site === 'ZZDUPSITE', 'set-up: both read back');
    t.eq(m.name, 'ZZJOBNAME (copy)', 'the name says copy');
    t.eq(m.date, sess.date, 'More details: the date');
    t.eq(m.engineer, 'ZZENG', '… the engineer');
    t.eq(m.prefix, 'ZD', '… the prefix');
    const sheet = app.html().slice(app.html().indexOf('dup-job-sheet'));
    t.includes(sheet, 'Copying 3 items · 1 fail', 'what is being copied');
    t.includes(sheet, 'value="ZZDUPCLIENT"', 'the client box is filled in');
    dfield(app, 'client', '');
    dfield(app, 'site', '  ');
    const before = app.html();
    tap(app, 'dup-job-continue');
    t.eq(app.state().dupJob.step, 'form', 'no client or site: it stays on the form');
    t.includes(app.doc.getElementById('dup-job-error').textContent, 'Enter a client or a site', '… says so in place');
    t.eq(app.html(), before, '… without repainting the sheet (MAP rule 3)');
    dfield(app, 'client', 'ZZOTHERCLIENT');
    tap(app, 'dup-job-continue');
    t.eq(app.state().dupJob.step, 'confirm', 'Continue: "Are you sure?"');
    const h = app.html();
    t.includes(h, '3 items · 1 fail', 'the counts');
    t.includes(h, 'ZZDUPSITE', 'from which job');
    t.includes(h, 'ZZOTHERCLIENT', 'into which');
    t.includes(h, 'its own certificate number', 'what the copy starts as');
    tap(app, 'dup-job-back');
    t.eq(app.state().dupJob.step, 'form', 'Back returns to the form');
    t.eq(app.state().dupJob.client, 'ZZOTHERCLIENT', '… with what was typed');
    t.eq(app.state().sessions.length, 1, 'nothing copied yet');
  });

  /* ------------------------------------------------------------------ 39c */
  await t.group('39c — the copy: new ids everywhere, everything on the items, the job\u2019s state fresh; it opens (9C 3A 13A 5A)', async () => {
    const app = boot();
    const { sess, a, b, c } = threeItems(app);
    const origId = String(sess.id);
    sess.notes = 'ZZJOBNOTES';
    sess.certNo = 'ZZC-9';
    sess.retestTrack = true; sess.retestMonths = 12; sess.retestContact = { status: 'booked', at: '2026-01-01T00:00:00.000Z' };
    sess.movedOut = { ZZGONE: 'ZZELSEWHERE' };
    b.readings = { earth: '0.05', ins: '>200' };
    b.mapPin = 'filled.count.soap';
    app.fn('markSessionExported')(sess);
    sess.locked = true; sess.lockedAt = '2026-10-01T09:00:00.000Z'; sess.reportAt = '2026-10-01T10:00:00.000Z';
    const clientsBefore = app.state().clients.length;
    const origJSON = J(sess);
    const nj = await dup(app);
    const orig = app.state().sessions.find(s => String(s.id) === origId);
    t.eq(app.state().sessions.length, 2, 'one new job');
    t.ok(nj.id && String(nj.id) !== origId, 'the copy has its own id');
    t.eq(nj.items.length, 3, 'every item copied');
    const oldIds = new Set([a.id, b.id, c.id].map(String));
    t.ok(nj.items.every(i => i.id && !oldIds.has(String(i.id))), 'every item has a NEW id');
    t.eq(new Set(nj.items.map(i => String(i.id))).size, 3, '… all different');
    t.eq(J(nj.items.map(i => i.copyOf)), J([a.id, b.id, c.id].map(String)), 'each remembers the item it copies (lifetime stats)');
    t.eq(J(nj.items.map(i => i.assetNo)), J(['ZZD1', 'ZZD2', 'ZZD3']), 'asset numbers the same, in order');
    t.eq(nj.items[1].result, 'fail', 'results copied');
    t.eq(nj.items[1].notes, 'ZZFAILNOTE', 'notes copied');
    t.eq(J(nj.items[1].readings), J(b.readings), 'readings copied');
    t.eq(nj.items[1].mapPin, 'filled.count.soap', 'map pins copied');
    t.eq(nj.notes, 'ZZJOBNOTES', 'job notes copied (3A)');
    t.eq(nj.locked, false, 'a locked job copies unlocked (13A)');
    t.notOk(nj.lockedAt, '… with no lock time');
    t.eq(nj.certNo, '', 'no certificate number');
    t.notOk(nj.exportedAt, 'not exported');
    t.notOk(nj.reportAt, 'no certificate made');
    t.eq(nj.movedOut, undefined, 'nothing moved out');
    t.eq(nj.retestTrack, true, 'retest tracking copied');
    t.eq(nj.retestMonths, 12, '… the interval');
    t.eq(nj.retestContact, null, '… the contact status fresh');
    t.eq(nj.site, sess.site, 'client and site unchanged: the same title');
    t.eq(nj.clientId, sess.clientId, '… the same client link');
    t.eq(nj.siteId, sess.siteId, '… the same site link');
    t.eq(app.state().clients.length, clientsBefore, '… and no new client made');
    t.eq(J(orig), origJSON, 'the original is not changed at all');
    t.eq(String(app.state().activeId), String(nj.id), 'the copy opens (5A)');
    t.eq(app.state().view, 'overview', '… on its Overview');
    t.eq(app.state().dupJob, null, 'the sheet closes');
    t.ok(app.toasts.some(x => /this is the copy/.test(x)), '… saying this is the copy');
    t.includes(app.storage.getItem('pat:sessions'), String(nj.id), 'saved');

    const app2 = boot();
    threeItems(app2);
    const nj2 = await dup(app2, 'ZZNEWCLIENT', 'ZZNEWSITE', { date: '2026-02-03', engineer: 'ZZOTHER' });
    t.eq(nj2.site, app2.fn('composeSiteSnapshot')('ZZNEWCLIENT', 'ZZNEWSITE'), 'a changed client and site: the new title');
    const cl = app2.state().clients.find(x => x.name === 'ZZNEWCLIENT');
    t.ok(cl && nj2.clientId === cl.id, '… the client made and linked');
    t.eq(nj2.date, '2026-02-03', 'the edited date');
    t.eq(nj2.engineer, 'ZZOTHER', 'the edited engineer');

    // A copy of a copy still points at the FIRST item.
    const nj3 = await dup(app2);
    t.eq(J(nj3.items.map(i => i.copyOf)), J(nj2.items.map(i => i.copyOf)), 'a copy of a copy remembers the first item');

    // A title edited in Session settings (no client in it) is kept exactly as it
    // is when the pre-filled client and site are left alone — no list entry made.
    const app4 = boot();
    const r4 = threeItems(app4);
    r4.sess.site = 'ZZHAND TYPED TITLE';
    const sitesBefore = app4.state().sites.length;
    const nj4 = await dup(app4);
    t.eq(nj4.site, 'ZZHAND TYPED TITLE', 'an edited title is copied exactly');
    t.eq(nj4.siteId, r4.sess.siteId, '… with the original\u2019s site link');
    t.eq(app4.state().sites.length, sitesBefore, '… and no site made from the title');
  });

  /* ------------------------------------------------------------------ 39d */
  await t.group('39d — photos are copied as NEW photos; deleting either job leaves the other\u2019s alone (12A)', async () => {
    const app = await signedOut();
    await until(() => app.state().photoMetaReady);
    const { sess, b, c } = threeItems(app);
    const pb = await photosOn(app, sess, b, 2);
    const pc = await photosOn(app, sess, c, 1);
    settings(app);
    tap(app, 'dup-job-open');
    tap(app, 'dup-job-continue');
    t.includes(app.html(), '3 photos (about', 'the confirm counts the photos and their size');
    t.includes(app.html(), 'take up space again', '… and says they take space again');
    tap(app, 'dup-job-go');
    await until(() => !app.state().dupJob);
    await tick(30);
    const nj = app.state().sessions[0];
    const nb = nj.items[1], nc = nj.items[2];
    t.eq(app.fn('photoCountForItem')(nb.id), 2, 'the copied fail has its 2 photos');
    t.eq(app.fn('photoCountForItem')(nc.id), 1, '… the other item its 1');
    t.eq(app.fn('photoCountForItem')(b.id), 2, 'the original still has its own');
    const meta = app.state().photoMeta;
    const copies = Object.keys(meta).filter(id => meta[id].s === String(nj.id));
    t.eq(copies.length, 3, 'three photos now belong to the copy');
    t.ok(copies.every(id => pb.indexOf(id) === -1 && pc.indexOf(id) === -1), '… each with a NEW id');
    t.ok(copies.every(id => meta[id].i === String(nb.id) || meta[id].i === String(nc.id)), '… on the copied items');
    const inStore = await app.run(`_photoTx('readonly', (s) => s.getAll()).then(r => r.result.filter(x => x.sessionId === ${J(String(nj.id))}).length)`);
    t.eq(inStore, 3, 'they are in the photo store, labelled with the copy');
    app.fn('setView')('sessions');
    app.fn('deleteSession')(sess.id);
    await tick(60);
    t.eq(app.fn('photoCountForItem')(nb.id), 2, 'the original deleted: the copy keeps its photos');
    t.notOk(app.state().photoMeta[pb[0]], '… the original\u2019s went with it');
    app.fn('deleteSession')(nj.id);
    await tick(60);
    t.eq(Object.keys(app.state().photoMeta).length, 0, 'the copy deleted too: none left');
  });

  /* ------------------------------------------------------------------ 39e */
  await t.group('39e — the photos can\u2019t be copied: no job is made, and it says why', async () => {
    const app = await signedOut();
    await until(() => app.state().photoMetaReady);
    const { sess, b } = threeItems(app);
    await photosOn(app, sess, b, 1);
    app.run('photosCopyForItems = () => Promise.resolve({ ok: false, n: 0 })');
    await dup(app);
    t.eq(app.state().sessions.length, 1, 'no copy made');
    t.eq(app.state().dupJob && app.state().dupJob.step, 'blocked', 'the sheet stays');
    t.includes(app.html(), 'short of space', '… saying why');
    t.includes(app.html(), 'Nothing was duplicated', '… and that nothing was');
    tap(app, 'dup-job-close');
    t.eq(app.state().dupJob, null, 'OK closes it');
    // The real copy is all-or-nothing: one transaction. A store that refuses
    // writes nothing at all.
    const app2 = await signedOut();
    await until(() => app2.state().photoMetaReady);
    const r = threeItems(app2);
    await photosOn(app2, r.sess, r.b, 1);
    const before = Object.keys(app2.state().photoMeta).length;
    const res = await app2.run(`(() => { const real = _photoTx; _photoTx = () => Promise.resolve({ ok: false });
      return photosCopyForItems(new Map([[${J(String(r.b.id))}, 'ZZNEWITEM']]), 'ZZNEWJOB').then(x => { _photoTx = real; return x; }); })()`);
    t.eq(res.ok, false, 'photosCopyForItems reports a refused store');
    t.eq(Object.keys(app2.state().photoMeta).length, before, '… and adds nothing to the mirror');
    t.eq(app2.fn('photoCountForItem')('ZZNEWITEM'), 0, '… or the counts');
  });

  /* ------------------------------------------------------------------ 39f */
  await t.group('39f — signed in: cloud-only photos are fetched first; offline it asks; the copy goes up as its own (4A)', async () => {
    const app = await signedIn();
    await until(() => app.state().photoMetaReady);
    const { sess, b } = threeItems(app);
    const pb = await photosOn(app, sess, b, 1);
    app.stopTimer();
    await run(app);
    await run(app);
    t.ok(app.srv.files.has(UID + '/' + pb[0] + '.jpg'), 'set-up: the photo is in the cloud');
    const gone = await app.run(`photosRemoveQuiet([${J(pb[0])}])`);
    t.eq(gone, 1, 'set-up: removed from this phone, kept in the cloud');
    t.eq(app.fn('photoCloudOnlyCountForItem')(b.id), 1, 'set-up: it is cloud-only');
    // Offline: it can't be fetched — the sheet says so and offers without.
    app.run('navigator.onLine = false');
    await dup(app);
    t.eq(app.state().dupJob && app.state().dupJob.step, 'partial', 'offline: it stops and asks');
    t.includes(app.html(), '1 photo only in the cloud couldn', '… saying how many');
    t.eq(app.state().sessions.length, 1, '… with nothing copied yet');
    tap(app, 'dup-job-back');
    t.eq(app.state().dupJob.step, 'form', 'Back returns to the form');
    // Online again: fetched first, then copied.
    app.run('navigator.onLine = true');
    tap(app, 'dup-job-continue');
    t.includes(app.html(), 'only in the cloud and will be fetched first', 'the confirm says it will fetch');
    tap(app, 'dup-job-go');
    await until(() => !app.state().dupJob, 4000);
    await tick(30);
    const nj = app.state().sessions[0];
    t.ok(nj && String(nj.id) !== String(sess.id), 'online: the copy is made');
    t.ok(app.state().photoMeta[pb[0]], 'the cloud photo was fetched onto the phone (the original\u2019s)');
    t.eq(app.fn('photoCountForItem')(nj.items[1].id), 1, 'and the copy has its own copy of it');
    app.stopTimer();
    await run(app);
    await run(app);
    const rows = app.srv.tables.photos.filter(r => r.session_id === String(nj.id) && !r.deleted);
    t.eq(rows.length, 1, 'the copy\u2019s photo goes up as a row of its own');
    t.ok(rows[0].id !== pb[0], '… with its own id');
    t.ok(app.srv.files.has(UID + '/' + rows[0].id + '.jpg'), '… and its own file');
    const orow = app.srv.tables.photos.find(r => r.id === pb[0]);
    t.eq(orow.session_id, String(sess.id), 'the original\u2019s row is untouched');
    const jrow = app.srv.tables.sessions.find(r => String(r.id) === String(nj.id));
    t.ok(jrow && jrow.doc.items.length === 3, 'the copy is in the cloud as a job of its own');

    // "Duplicate without them": the copy is made without the cloud-only photo.
    const app2 = await signedIn();
    await until(() => app2.state().photoMetaReady);
    const r2 = threeItems(app2);
    const p2 = await photosOn(app2, r2.sess, r2.b, 1);
    app2.stopTimer();
    await run(app2); await run(app2);
    await app2.run(`photosRemoveQuiet([${J(p2[0])}])`);
    app2.run('navigator.onLine = false');
    await dup(app2);
    t.eq(app2.state().dupJob && app2.state().dupJob.step, 'partial', 'set-up: asked');
    tap(app2, 'dup-job-without');
    await until(() => !app2.state().dupJob);
    await tick(20);
    const nj2 = app2.state().sessions[0];
    t.ok(String(nj2.id) !== String(r2.sess.id), '"Duplicate without them": the copy is made');
    t.eq(app2.fn('photoCountForItem')(nj2.items[1].id), 0, '… without the photo it couldn\u2019t fetch');
    t.eq(app2.fn('photoCloudOnlyCountForItem')(r2.b.id), 1, '… which the original still has, in the cloud');
  });

  /* ------------------------------------------------------------------ 39g */
  await t.group('39g — lifetime stats count an item and its copies once — copied, trimmed, deleted (Peter)', async () => {
    const app = boot();
    const { sess } = threeItems(app);
    const base = stats(app);
    t.eq(base, '3/1', 'set-up: 3 items, 1 fail');
    const nj = await dup(app);
    t.eq(stats(app), '3/1', 'duplicated: still 3 items, 1 fail');
    // The split: each job keeps what belongs to it.
    nj.items = nj.items.slice(0, 1);                 // the copy keeps the first
    sess.items = sess.items.slice(1);                // the original the other two
    t.eq(stats(app), '3/1', 'trimmed both ways: still 3');
    app.fn('setView')('sessions');
    app.fn('deleteSession')(sess.id);
    t.eq(stats(app), '3/1', 'the original deleted: 3 (its items archived)');
    app.fn('deleteSession')(nj.id);
    t.eq(stats(app), '3/1', 'both deleted: 3, all from the archive');

    // Not trimmed: deleting the original archives nothing the copy still holds.
    const app2 = boot();
    const r = threeItems(app2);
    const nj2 = await dup(app2);
    app2.fn('setView')('sessions');
    app2.fn('deleteSession')(r.sess.id);
    t.eq(J(app2.state().archivedStats.items), '0', 'the original deleted while its copy holds every item: nothing archived');
    t.eq(stats(app2), '3/1', '… and still 3');
    // Other jobs' tallies already in the archive, so a wrong subtraction shows
    // (the archive never goes below zero, which would hide it).
    app2.state().archivedStats = { items: 10, fails: 2, types: {} };
    app2.fn('unarchiveSessionStats')([JSON.parse(J(r.sess))]);
    t.eq(app2.state().archivedStats.items, 10, 'bringing it back takes out only what was archived (nothing — its copy held it all)');
    t.eq(app2.state().archivedStats.fails, 2, '… fails too');
    app2.state().archivedStats = { items: 0, fails: 0, types: {} };
    app2.fn('deleteSession')(nj2.id);
    t.eq(stats(app2), '3/1', 'then the copy deleted: 3, now from the archive');
    // Two unrelated jobs still add up.
    const app3 = boot();
    threeItems(app3);
    threeItems(app3, { site: 'ZZOTHER' });
    t.eq(stats(app3), '6/2', 'two separate jobs: 6 (no de-duplication without copyOf)');
  });

  /* ------------------------------------------------------------------ 39h */
  t.group('39h — guards: no sync repaint under the sheet; a working copy can\u2019t be closed; the new block is wired', () => {
    const app = boot();
    threeItems(app);
    settings(app);
    tap(app, 'dup-job-open');
    t.eq(app.fn('_syncSafeToRepaint')(), false, 'a sync does not repaint under the sheet');
    app.state().dupJob.step = 'working';
    tap(app, 'dup-job-close');
    t.ok(app.state().dupJob, 'a copy under way cannot be closed');
    app.fn('render')();
    t.excludes(app.html().slice(app.html().indexOf('dup-job-sheet')), 'data-action="dup-job-close"', '… and offers no close');
    app.state().dupJob = null;
    t.eq(app.fn('_syncSafeToRepaint')(), true, 'closed: repaint allowed again');
    t.eq(app.fn('statsKeyOf')({ id: 'A1', copyOf: 'Z9' }), 'Z9', 'a copy counts as its original');
    t.eq(app.fn('statsKeyOf')({ id: 'A1' }), 'A1', 'an item counts as itself');
  });
};
