/* Standing test — delete jobs from the cloud (V107, roadmap Stage 5 part 3 —
   spec 1A 2A 3A 4B 5A 6A 7A)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. The Jobs screen's ☁ In the cloud tab gains a Delete…
   button in Select mode (2A, ticked one at a time — 7A). A review sheet names
   every job with its counts and certificate, says other phones lose it too and
   no copy is kept (5A); "Yes, delete N jobs for good" (R20). DELETE must be
   typed at CLOUD_DELETE_TYPE_AT (5) or more, or when any has a certificate
   (4B). Jobs with a certificate may be deleted (3A). Always on (6A).
   sync.js syncCloudDelete: photo ROWS read, the job rows emptied and marked
   deleted by an UPDATE (live rows only), then — only for the jobs the cloud
   took — the jobs forgotten here (sent, conf, resend, held, cleared list), their
   photos made known and tombstoned (the V89 ledger deletes rows and files on
   the next run), and this phone's copies swept. All under the run lock.

   Helpers are 30's, with the fake extended: PATCH (supabase-js update) applies
   its body to the rows its filters match and answers the `select` it asks for;
   one fake can serve two phones (o.srv).

   ⚠ WHAT THIS FILE CANNOT PROVE. Postgres itself: that the UPDATE passes the
   sessions rule (it is the same "for all … auth.uid() = user_id" rule every
   push already uses) and fires touch_updated_at (schema.sql), so other phones'
   cursors see the row. The two-phone test on real phones covers both. */

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
  const stamp = () => { stampN++; return '2026-10-08T11:' + String(Math.floor(stampN / 60) % 60).padStart(2, '0') + ':' + String(stampN % 60).padStart(2, '0') + '.' + String(stampN).padStart(3, '0') + 'Z'; };
  const srv = { calls, tables, files, stamp, failPatch: 0, onCall: null };
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
    if (u.includes('/rest/v1/session_photo_counts')) {
      const m = new Map();
      for (const p of tables.photos) if (!p.deleted) m.set(String(p.session_id), (m.get(String(p.session_id)) || 0) + 1);
      return json(applyQuery(Array.from(m.entries()).map(([session_id, n]) => ({ user_id: UID, session_id, n })), qs));
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

module.exports = async function () {
  /* ------------------------------------------------------------------ 44a */
  await t.group('44a — a cloud-only job: its row is emptied and marked deleted, the next run deletes its photo rows and both files', async () => {
    const app = await signedIn();
    await run(app);
    seed(app, 'ZZA1', { certNo: 'ZZC-001', locked: true });
    seed(app, 'ZZA2');
    const ph = seedPhotos(app, 'ZZA1', 2);
    const keep = seedPhotos(app, 'ZZA2', 1);
    const res = await del(app, ['ZZA1']);
    t.ok(res.ok, 'resolves ok');
    t.eq(res.deleted, 1, 'one job deleted');
    t.eq(res.photos, 2, '…with its two photos');
    t.eq(J(res.ids), J(['ZZA1']), 'names the job the cloud took');
    const row = app.srv.row('ZZA1');
    t.eq(row.deleted, true, 'the row is marked deleted');
    t.eq(J(row.doc), '{}', 'its contents are emptied (the same row a delete everywhere sends)');
    t.eq(row.fp, null, 'no fingerprint');
    t.eq(app.srv.row('ZZA2').deleted, false, 'the other job is untouched');
    t.eq(app.srv.tables.sessions.filter(r => r.id === 'ZZA1').length, 1, 'updated in place, never a second row');
    t.ok(ph.every(id => tombs(app, 'photo').includes(id)), 'each photo is on the delete ledger');
    await run(app);
    t.ok(ph.every(id => app.srv.photo(id).deleted === true), 'after a run: the photo rows are marked deleted');
    t.ok(ph.every(id => !app.srv.files.has(UID + '/' + id + '.jpg') && !app.srv.files.has(UID + '/' + id + '_t.jpg')), '…and both files of each are gone');
    t.eq(app.srv.photo(keep[0]).deleted, false, 'the other job’s photo is untouched');
    t.ok(app.srv.files.has(UID + '/' + keep[0] + '.jpg'), '…and its file');
    t.ok(ph.every(id => !syncState(app).ph.sent[id]), 'known no more once deleted');
    t.notOk(onPhone(app, 'ZZA1'), 'nothing came down onto this phone');
  });

  /* ------------------------------------------------------------------ 44b */
  await t.group('44b — a job cleared from this phone: forgotten here (sent, cleared list) so the pull treats its deleted row as nothing; stats stay', async () => {
    const app = await signedIn();
    const id = plainJob(app, 'ZZCLEARED');
    away(app);
    await run(app);
    t.ok(!!syncState(app).sent[id], 'set-up: sent');
    app.fn('removeJobsFromPhone')([id]);
    app.stopTimer();
    await tick(10);
    t.ok(pruned(app).includes(id), 'set-up: on the cleared list');
    const before = lifetime(app);
    const res = await del(app, [id]);
    t.eq(res.deleted, 1, 'deleted from the cloud');
    t.notOk(!!syncState(app).sent[id], 'this phone no longer counts it as sent');
    t.notOk(pruned(app).includes(id), 'it leaves the cleared list (else its deleted row is skipped for ever)');
    t.notOk(tombs(app, 'session').includes(id), 'no job tombstone — nothing for the push to send');
    t.notOk(!!syncState(app).gone[id], 'no gone mark — a job that comes back live keeps its photos');
    const ups = () => app.srv.calls.filter(c => c.method === 'POST' && c.url.includes('/rest/v1/sessions')
      && Array.isArray(c.body) && c.body.some(r => String(r.id) === id)).length;
    const upsBefore = ups();
    await run(app);
    t.eq(ups(), upsBefore, 'the next run sends nothing for it');
    t.eq(app.fn('_syncHeldLoad')().length, 0, 'and asks nothing');
    t.notOk(onPhone(app, id), 'it stays off the phone');
    t.eq(lifetime(app), before, 'lifetime stats unchanged (its tallies stay archived)');
  });

  /* ------------------------------------------------------------------ 44c */
  await t.group('44c — a job ON this phone is never deleted from here (its own 🗑 does that)', async () => {
    const app = await signedIn();
    const id = plainJob(app, 'ZZHERE');
    away(app);
    await run(app);
    seed(app, 'ZZC2');
    const res = await del(app, [id, 'ZZC2']);
    t.eq(res.skipped, 1, 'the job on this phone is skipped');
    t.eq(res.deleted, 1, 'the cloud-only one goes');
    t.eq(app.srv.row(id).deleted, false, 'the phone’s job is untouched in the cloud');
    t.ok(onPhone(app, id), '…and on the phone');
    t.ok(!!syncState(app).sent[id], '…and still counted as sent');
  });

  /* ------------------------------------------------------------------ 44d */
  await t.group('44d — other phones: an unchanged copy goes on its next sync; a changed copy asks first, never lost', async () => {
    const a = await signedIn();
    const b = await signedIn({ srv: a.srv });
    const same = plainJob(b, 'ZZSAME'); away(b);
    const changed = plainJob(b, 'ZZCHANGED'); away(b);
    await run(b);
    // Both now old and off phone A (A never brought them down).
    t.ok(!!a.srv.row(same) && !!a.srv.row(changed), 'set-up: both in the cloud');
    b.run(`(() => { const s = state.sessions.find(x => x.id === ${J(changed)});
      s.items = s.items.concat([Object.assign({}, s.items[0], { id: 'ZZE1', assetNo: 'ZZEDIT' })]); state.sessions = state.sessions.slice(); })()`);
    const res = await del(a, [same, changed]);
    t.eq(res.deleted, 2, 'phone A deletes both from the cloud');
    await run(b);
    t.notOk(onPhone(b, same), 'phone B: the unchanged job goes');
    t.ok(onPhone(b, changed), 'phone B: the job it changed stays…');
    const held = b.fn('_syncHeldLoad')().find(e => e.id === changed);
    t.eq(held && held.reason, 'deleted-elsewhere', '…and asks ("deleted on another phone")');
  });

  /* ------------------------------------------------------------------ 44e */
  await t.group('44e — the cloud refuses the update: nothing is marked, no photo touched, the error is said', async () => {
    const app = await signedIn();
    await run(app);
    seed(app, 'ZZE1');
    const ph = seedPhotos(app, 'ZZE1', 2);
    const sentBefore = J(syncState(app).ph.sent);
    app.srv.failPatch = 1;
    const res = await del(app, ['ZZE1']);
    t.notOk(res.ok, 'not ok');
    t.ok(!!res.error, 'an error to show');
    t.eq(res.deleted, 0, 'nothing deleted');
    t.eq(app.srv.row('ZZE1').deleted, false, 'the job is still live');
    t.ok(ph.every(id => !tombs(app, 'photo').includes(id)), 'no photo on the delete ledger');
    t.eq(J(syncState(app).ph.sent), sentBefore, 'no photo made known');
    await run(app);
    t.ok(ph.every(id => app.srv.photo(id).deleted === false && app.srv.files.has(UID + '/' + id + '.jpg')), 'after a run the photos are all still there');
  });

  /* ------------------------------------------------------------------ 44f */
  await t.group('44f — a job deleted elsewhere since the list was read: counted as already gone, its photos left alone', async () => {
    const app = await signedIn();
    await run(app);
    seed(app, 'ZZF1');
    const ph = seedPhotos(app, 'ZZF1', 1);
    const r = app.srv.row('ZZF1');
    r.deleted = true;   // another phone got there first (its photos' own deletes still on their way)
    seed(app, 'ZZF2');
    const res = await del(app, ['ZZF1', 'ZZF2']);
    t.eq(res.deleted, 1, 'one deleted');
    t.eq(res.missing, 1, 'one already gone');
    t.ok(res.ok, 'ok');
    t.ok(!tombs(app, 'photo').includes(ph[0]), 'the photo of the job this phone did NOT delete is not on its ledger');
  });

  /* ------------------------------------------------------------------ 44g */
  await t.group('44g — the run lock: a trigger during the delete waits for it, then runs; with no trigger a run still follows', async () => {
    const app = await signedIn();
    await run(app);
    seed(app, 'ZZG1');
    seedPhotos(app, 'ZZG1', 1);
    const start = app.srv.calls.length;
    let fired = false;
    app.srv.onCall = (c) => {
      if (fired || c.method !== 'GET' || !c.url.includes('/rest/v1/photos') || !/session_id=in/.test(c.url)) return;
      fired = true;
      app.fn('syncPush')({ pull: true });   // a trigger arrives mid-delete
    };
    const res = await app.fn('syncCloudDelete')(['ZZG1']);
    app.srv.onCall = null;
    app.stopTimer();
    t.ok(fired, 'set-up: the trigger arrived while the delete was reading');
    const calls = app.srv.calls.slice(start);
    const first = calls.findIndex(c => c.url.includes('/rest/v1/photos') && /session_id=in/.test(c.url));
    const patch = calls.findIndex(c => c.method === 'PATCH' && c.url.includes('/rest/v1/sessions'));
    t.ok(first > -1 && patch > first, 'set-up: read, then the update');
    const between = calls.slice(first + 1, patch).filter(c => !(c.url.includes('/rest/v1/photos') && /session_id=in/.test(c.url)));
    t.eq(between.length, 0, 'nothing else reached the cloud between the delete’s read and its update');
    t.eq(res.deleted, 1, 'the delete finished');
    await until(() => app.srv.calls.slice(start + patch + 1).some(c => c.method === 'GET' && c.url.includes('/rest/v1/sessions') && c.url.includes('updated_at=')));
    app.stopTimer();
    t.ok(app.srv.calls.slice(start + patch + 1).some(c => c.method === 'GET' && c.url.includes('/rest/v1/sessions') && c.url.includes('updated_at=')), 'the waiting trigger ran afterwards, with its pull');
    await idle(app); app.stopTimer();

    // No trigger: the photo deletes still go, without waiting for one.
    seed(app, 'ZZG2');
    const ph = seedPhotos(app, 'ZZG2', 1);
    await app.fn('syncCloudDelete')(['ZZG2']);
    app.stopTimer();
    await until(() => app.srv.photo(ph[0]).deleted === true);
    app.stopTimer();
    t.eq(app.srv.photo(ph[0]).deleted, true, 'a run follows the delete by itself and removes the photos');
  });

  /* ------------------------------------------------------------------ 44h */
  await t.group('44h — copies of the job’s photos left on this phone are swept (a copy here would stop the cloud delete)', async () => {
    const app = await signedIn();
    await run(app);
    seed(app, 'ZZH1');
    const ph = seedPhotos(app, 'ZZH1', 1);
    // A leftover copy on the phone with the same id (cleared-job leftovers).
    await app.run(`photoAddFromCloud({ id: ${J(ph[0])}, s: 'ZZH1', i: 'ZZH1-i1', b: 6 }, new Blob(['ZZLEFT'], { type: 'image/jpeg' }))`);
    await tick(10);
    t.ok(!!(app.state().photoMeta || {})[ph[0]], 'set-up: a copy on this phone');
    await del(app, ['ZZH1']);
    t.notOk(!!(app.state().photoMeta || {})[ph[0]], 'the phone copy is gone');
    await run(app);
    t.eq(app.srv.photo(ph[0]).deleted, true, 'so the cloud photo is deleted on the next run');
  });

  /* ------------------------------------------------------------------ 44i */
  await t.group('44i — the cloud tab: Delete… in Select, the review names every job and certificate, DELETE typed at 5+ or any certificate, checked again on the tap', async () => {
    const app = await signedIn();
    await run(app);
    for (let k = 1; k <= 5; k++) seed(app, 'ZZI' + k, { site: 'ZZSITE' + k });
    seed(app, 'ZZICERT', { site: 'ZZCERTSITE', certNo: 'ZZC-777', locked: true });
    seed(app, 'ZZILOCK', { site: 'ZZLOCKSITE', locked: true });
    seedPhotos(app, 'ZZI1', 2);
    await openCloud(app);
    t.ok(app.state().cloudJobs.ok, 'set-up: the list read');
    const ov = (ids) => app.fn('cloudDeleteOverview')(ids);
    t.notOk(ov(['ZZI1', 'ZZI2', 'ZZI3', 'ZZI4']).needWord, '4 plain jobs: no word');
    t.ok(ov(['ZZI1', 'ZZI2', 'ZZI3', 'ZZI4', 'ZZI5']).needWord, '5 jobs: the word');
    t.ok(ov(['ZZICERT']).needWord, 'one job with a certificate: the word');
    t.ok(ov(['ZZILOCK']).needWord, 'a locked job without a number counts as certificated');
    t.eq(J(ov(['ZZICERT', 'ZZI1']).certs), J(['ZZC-777']), 'certificate numbers listed');
    t.eq(ov(['ZZI1']).photos, 2, 'photo count from the list');
    const m = app.fn('cloudDeleteConfirmMatches');
    t.ok(m(' delete '), 'any case, trimmed');
    t.notOk(m('DELET'), 'not a part');

    // The bar, through the real surface.
    tap(app, 'cloud-select-toggle');
    t.includes(app.html(), 'data-action="cloud-delete"', 'Select shows Delete…');
    t.includes(app.html(), 'data-action="cloud-delete" disabled', '…greyed with nothing ticked');
    tap(app, 'cloud-tap', 'ZZI1');
    t.excludes(app.html(), 'data-action="cloud-delete" disabled', 'one ticked: live');

    // One plain job: no word box, the button names the job count, works.
    tap(app, 'cloud-delete');
    let sh = sheetHTML(app);
    t.includes(sh, 'Delete from the cloud', 'the review sheet opens');
    t.includes(sh, 'ZZSITE1', 'it names the job');
    t.includes(sh, '2 photos', 'and its photos');
    t.includes(sh, 'No copy is kept', 'says no copy is kept (5A)');
    t.includes(sh, 'any other phone', 'says other phones lose it too');
    t.excludes(sh, 'cloud-del-input', 'no word box for one plain job');
    t.includes(sh, 'Yes, delete this job for good', 'the final button says so (R20)');
    app.doc.getElementById('cloud-del-yes').click();
    await until(() => app.srv.row('ZZI1').deleted === true);
    await idle(app); app.stopTimer();
    t.eq(app.srv.row('ZZI1').deleted, true, 'deleted');
    t.notOk(app.state().cloudJobs.jobs.some(j => j.id === 'ZZI1'), 'it drops off the list without reading it again');
    t.notOk(app.state().cloudJobs.selecting, 'Select mode ends');
    t.ok(app.toasts.some(x => /Deleted 1 job from the cloud with 2 photos/.test(x)), 'a toast says what went');

    // A certificated job: the warning and the word.
    tap(app, 'cloud-select-toggle');
    tap(app, 'cloud-tap', 'ZZICERT');
    tap(app, 'cloud-delete');
    sh = sheetHTML(app);
    t.includes(sh, 'ZZC-777', 'the certificate is named');
    t.includes(sh, 'deletes your record', 'and what that means');
    t.includes(sh, 'cloud-del-input', 'the word box is there');
    t.includes(sh, 'id="cloud-del-yes" style="flex:1" disabled', 'the button starts grey');
    const yes = app.doc.getElementById('cloud-del-yes');
    typeWord(app, 'DELET');
    t.ok(yes.disabled, 'still grey on a part');
    const open = () => app.doc.querySelectorAll('.cloud-del-sheet').length;
    t.eq(open(), 1, 'set-up: one review sheet open');
    yes.click();   // a disabled attribute is a hint, not a guard
    await tick(30);
    t.eq(open(), 1, 'a tap with the wrong word leaves the sheet open');
    t.eq(app.srv.row('ZZICERT').deleted, false, '…and deletes nothing');
    typeWord(app, 'delete');
    t.notOk(yes.disabled, 'lit once typed');
    yes.click();
    t.eq(open(), 0, 'the right word closes it');
    await until(() => app.srv.row('ZZICERT').deleted === true);
    await idle(app); app.stopTimer();
    t.eq(app.srv.row('ZZICERT').deleted, true, 'then it goes');

    // The logic re-checks the word itself, whatever the sheet does.
    let captured = null;
    const real = app.sandbox.openCloudDeleteSheet;
    app.sandbox.openCloudDeleteSheet = (o, onYes) => { captured = { o, onYes }; };
    tap(app, 'cloud-select-toggle');
    tap(app, 'cloud-tap', 'ZZILOCK');
    tap(app, 'cloud-delete');
    app.sandbox.openCloudDeleteSheet = real;
    t.ok(!!captured && captured.o.needWord, 'set-up: the sheet was asked for, with the word');
    t.eq(captured.onYes('nope'), false, 'a wrong word is refused by the action itself');
    await tick(30);
    t.eq(app.srv.row('ZZILOCK').deleted, false, '…and nothing is deleted');
  });

  /* ------------------------------------------------------------------ 44j */
  await t.group('44j — V107 constants and dispatch', async () => {
    // V108: the release pins (APP_VERSION, WELCOME_VERSION, cache key, welcome
    // copy, changelog order) retired — 45j pins the current release.
    const app = boot();
    t.eq(app.run('CLOUD_DELETE_WORD'), 'DELETE', 'the word');
    t.eq(app.run('CLOUD_DELETE_TYPE_AT'), 5, 'typed from 5 jobs (4B)');
    const disp = fs.readFileSync(path.join(APP_DIR, 'dispatch.js'), 'utf8');
    t.includes(disp, "'cloud-delete':", 'dispatch wires cloud-delete');
  });
};
