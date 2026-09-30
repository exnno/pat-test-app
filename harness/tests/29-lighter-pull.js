/* Standing test — the lighter pull (V92, roadmap Stage 5 part 1, 12A)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID (1A 2A 3B 4A 5A 6B). The jobs table gains `fp`, the
   phone's fingerprint of the job, sent in the same write as the doc (2A); the
   database blanks it when a doc changes without one (a V91 phone). The pull
   reads a LIST (id, fp, deleted, updated_at) and downloads a job's contents
   only where the fingerprint cannot settle it. 🛡 comes from the fingerprint,
   read back straight after the push (4A); removal from the phone still reads
   the real contents (3B). Jobs only (5A). No welcome (6B).

   Helpers copied from 28; the fake server is 28's with the V92 sessions table
   (select honoured, jsonb re-ordering, the fp guard trigger). o.hideDocs: ids
   whose contents a doc read leaves out, as if the row vanished in between.

   ⚠ WHAT THIS FILE CANNOT PROVE. The trigger itself — supabase/v92-fingerprint.sql
   checks that in Postgres (F1–F3). That a real jsonb round trip hashes the same
   (the two-phone test: a job must show 🛡 after ONE sync). */

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
      if (method === 'PATCH') return new Response(null, { status: 204 });
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

const syncState = (app) => JSON.parse(app.storage.getItem('pat:syncState') || 'null');
async function run(app) { const r = await app.fn('syncPush')({ pull: true }); app.stopTimer(); await tick(30); return r; }
// Wait for something asynchronous, up to ~2 s: a full run is slower than one file.
async function until(pred, ms = 2000) { for (let k = 0; k < ms / 10 && !pred(); k++) await tick(10); }

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
// An edit on this phone: a new array, as the app's own edits of other jobs make.
function edit(app, id) {
  app.run(`(() => { const s = state.sessions.find(x => x.id === ${J(id)});
    s.items = s.items.concat([Object.assign({}, s.items[0], { id: 'ZZE' + Math.random().toString(36).slice(2, 7), assetNo: 'ZZEDIT' })]); })()`);
}
// The phone's fingerprint of one of its jobs, exactly as the push computes it.
const fpOf = (app, id) => app.run(`syncHash(_syncCanonical(state.sessions.find(x => String(x.id) === ${J(String(id))})))`);
// A write from another phone on V92: the doc and its correct fingerprint.
function v92Write(app, id, doc) {
  const row = app.srv.otherWrite(id, doc, { fp: 'ZZPENDING' });
  row.fp = app.run(`syncHash(_syncCanonical(${J(row.doc)}))`);
  return row;
}
const cloudRow = (app, id) => app.srv.tables.sessions.find(r => String(r.id) === String(id));
const localJob = (app, id) => app.state().sessions.find(s => String(s.id) === String(id));
const count = (list, id) => list.filter(x => x === String(id)).length;
const heldFor = (app, id) => app.fn('_syncHeldLoad')().find(e => String(e.id) === String(id) && e.kind === 'session');
const item = (id) => ({ id, assetNo: 'ZZ' + id, result: 'pass' });

module.exports = async function () {
  /* ------------------------------------------------------------------ 29a */
  await t.group('29a — this phone\u2019s own jobs: sent with a fingerprint, safe in the same sync, never downloaded back (2A, 4A)', async () => {
    const app = await signedIn();
    const id = plainJob(app, 'ZZLIGHT1');
    away(app);
    await run(app);
    t.eq(cloudRow(app, id).fp, fpOf(app, id), 'the job goes up with the phone\u2019s fingerprint of it, in the same write (2A)');
    t.eq(why(app, id), 'safe', 'its fingerprint is read straight back: safe in the same sync (4A)');
    t.eq(app.srv.docGets().length, 0, 'nothing was downloaded to decide it');
    const pages = app.srv.pageGets().length;
    await run(app); await run(app);
    t.ok(app.srv.pageGets().length > pages, 'later syncs still read the list (the push is re-read at the cursor)');
    t.eq(app.srv.docGets().length, 0, '…and download none of the job\u2019s contents (R17 — before V92, the whole job every time)');
    edit(app, id);
    await run(app);
    t.eq(cloudRow(app, id).fp, fpOf(app, id), 'edited: the new fingerprint goes up with the new contents');
    t.eq(why(app, id), 'safe', '…and it is safe again in the same sync');
    t.eq(app.srv.docGets().length, 0, 'still nothing downloaded');

    // Another phone writes the row between this phone's push and its read-back.
    const b = plainJob(app, 'ZZHIJACK');
    away(app);
    app.srv.afterUpsert = (stored) => {
      if (String(stored.id) !== b) return;
      stored.doc = Object.assign({}, stored.doc, { site: 'ZZOTHERPHONE' });
      stored.fp = 'ZZOTHERFP';
    };
    await run(app);
    app.srv.afterUpsert = null;
    t.eq(why(app, b), 'checking', 'the cloud row no longer says what this phone sent: not safe (rule 26 — the read decides, not the write)');
    await run(app);
    t.ok(app.srv.docIds().includes(b), 'the next sync downloads it, since the fingerprint can\u2019t settle it');
    t.eq(localJob(app, b).site, 'ZZOTHERPHONE', '…and takes the other phone\u2019s version (this phone had nothing unsent)');
    t.eq(why(app, b), 'safe', '…which is then safe: vouched for by the contents it read');
  });

  /* ------------------------------------------------------------------ 29b */
  await t.group('29b — another phone\u2019s jobs: downloaded once when they change, by id; a clash is still held with both counts', async () => {
    const app = await signedIn();
    v92Write(app, 'ZZOTHER1', { site: 'ZZFROMB', items: [item('ZZI1')] });
    await run(app);
    t.ok(onPhone(app, 'ZZOTHER1'), 'another phone\u2019s job arrives');
    t.eq(count(app.srv.docIds(), 'ZZOTHER1'), 1, 'its contents came down once, asked for by id');
    t.eq(why(app, 'ZZOTHER1'), 'safe', 'and it is safe: what came down is what the cloud holds');
    await run(app);
    t.eq(count(app.srv.docIds(), 'ZZOTHER1'), 1, 'the next sync downloads nothing (its fingerprint matches)');
    v92Write(app, 'ZZOTHER1', { site: 'ZZFROMB', items: [item('ZZI1'), item('ZZI2')] });
    await run(app);
    t.eq(localJob(app, 'ZZOTHER1').items.length, 2, 'the other phone\u2019s edit arrives');
    t.eq(count(app.srv.docIds(), 'ZZOTHER1'), 2, '…downloaded because its fingerprint changed');
    edit(app, 'ZZOTHER1');
    v92Write(app, 'ZZOTHER1', { site: 'ZZFROMB', items: [item('ZZI1'), item('ZZI2'), item('ZZI3'), item('ZZI4')] });
    await run(app);
    const h = heldFor(app, 'ZZOTHER1');
    t.eq(h && h.reason, 'both-changed', 'changed on both phones: held, never applied on a guess');
    t.eq(h && h.cloudItems, 4, '…with the cloud\u2019s item count (read from the downloaded contents)');
    t.eq(localJob(app, 'ZZOTHER1').items.length, 3, '…and this phone\u2019s copy untouched');
  });

  /* ------------------------------------------------------------------ 29c */
  await t.group('29c — a phone still on V91 writes no fingerprint: the database blanks it and V92 falls back to downloading', async () => {
    const app = await signedIn();
    app.srv.otherWrite('ZZOLD1', { site: 'ZZV91PHONE', items: [item('ZZO1')] });
    t.eq(cloudRow(app, 'ZZOLD1').fp, null, 'an older phone\u2019s new job has no fingerprint');
    await run(app);
    t.ok(onPhone(app, 'ZZOLD1'), 'it still arrives — blank means download it');
    t.ok(app.srv.docIds().includes('ZZOLD1'), '…by reading its contents');

    const id = plainJob(app, 'ZZMINE');
    away(app);
    await run(app);
    t.ok(cloudRow(app, id).fp, 'this phone\u2019s job is in the cloud with a fingerprint');
    const doc = JSON.parse(JSON.stringify(cloudRow(app, id).doc));
    doc.items = doc.items.concat([item('ZZFROMV91')]);
    app.srv.otherWrite(id, doc);          // no fp sent: the guard blanks it
    t.eq(cloudRow(app, id).fp, null, 'the older phone edits it: the fingerprint is blanked, not left describing the old contents');
    const n = localJob(app, id).items.length;
    await run(app);
    t.eq(localJob(app, id).items.length, n + 1, 'the older phone\u2019s edit arrives on this phone, not missed');
    t.eq(why(app, id), 'safe', 'and it is safe: vouched for by the contents read');
    await run(app);
    t.eq(cloudRow(app, id).fp, null, 'nothing was pushed back just to stamp a fingerprint on it');
  });

  /* ------------------------------------------------------------------ 29d */
  await t.group('29d — taking a job off the phone reads its real contents from the cloud first (3B)', async () => {
    const app = await signedIn();
    const a = plainJob(app, 'ZZVER1', '2020-01-01');
    away(app);
    await run(app);
    t.eq(why(app, a), 'safe', 'safe by its fingerprint');
    const before = app.srv.docIds().length;
    await app.fn('jobsRemoveAsk')([a]);
    await until(() => app.asked.some(x => x.startsWith('Remove 1 job')));
    t.ok(app.srv.docIds().slice(before).includes(a), 'before asking, the job\u2019s contents are read from the cloud');
    confirmSheet(app);
    await until(() => !onPhone(app, a));
    app.stopTimer();
    t.notOk(onPhone(app, a), 'they match: it comes off the phone');

    // The cloud's contents no longer match, though its fingerprint still does.
    const b = plainJob(app, 'ZZVER2', '2020-01-01');
    away(app);
    await run(app);
    const row = cloudRow(app, b);
    row.doc = Object.assign({}, row.doc, { site: 'ZZDIFFERENT' });
    t.eq(why(app, b), 'safe', 'the fingerprint still says safe');
    const asked = app.asked.length;
    await app.fn('jobsRemoveAsk')([b]);
    await until(() => app.toasts.some(x => x.includes('take it off this phone yet')));
    t.ok(onPhone(app, b), 'the contents differ: it stays on the phone');
    t.eq(app.asked.length, asked, '…and the removal is not even offered');

    // The contents can't be read: nothing comes off.
    const c = plainJob(app, 'ZZVER3', '2020-01-01');
    away(app);
    await run(app);
    app.srv.docFail = true;
    await app.fn('jobsRemoveAsk')([c]);
    await until(() => app.toasts.some(x => x.includes('Couldn\u2019t check with the cloud')));
    app.srv.docFail = false;
    t.includes(app.toasts.join('|'), 'Couldn\u2019t check with the cloud', 'a failed check says so');
    t.ok(onPhone(app, c), '…and the job stays');
    t.eq(app.asked.length, asked, '…without asking');

    // No signal: the last sync stands, and the confirm says so.
    app.run('navigator.onLine = false');
    const n = app.srv.docIds().length;
    await app.fn('jobsRemoveAsk')([c]);
    t.ok(app.asked.some(x => x.includes('checked against the last sync')), 'no signal: the confirm says what it checked against');
    t.eq(app.srv.docIds().length, n, '…and nothing was read');
    confirmSheet(app);
    await until(() => !onPhone(app, c));
    t.notOk(onPhone(app, c), 'it comes off the phone');
    app.run('navigator.onLine = true');
  });

  /* ------------------------------------------------------------------ 29f */
  await t.group('29f — a job whose contents don\u2019t come back holds the cursor, and arrives on a later sync (rule 10)', async () => {
    const app = await signedIn();
    await run(app);
    const mark = syncState(app).pulledAt;
    app.srv.otherWrite('ZZHIDE', { site: 'ZZHIDDEN', items: [item('ZZH1')] });
    app.srv.hideDocs.add('ZZHIDE');
    await run(app);
    t.notOk(onPhone(app, 'ZZHIDE'), 'its contents didn\u2019t come: it isn\u2019t added on a guess');
    t.eq(syncState(app).pulledAt, mark, '…and the cursor stays where it was, so it is read again');
    app.srv.hideDocs.clear();
    await run(app);
    t.ok(onPhone(app, 'ZZHIDE'), 'the next sync brings it');
  });

  /* ------------------------------------------------------------------ 29e */
  await t.group('29e — the SQL: an fp column and its guard, in schema.sql and the paste-once file; the list read carries no doc', async () => {
    const rd = (f) => fs.readFileSync(path.join(APP_DIR, 'supabase', f), 'utf8');
    for (const f of ['schema.sql', 'v92-fingerprint.sql']) {
      const sql = rd(f);
      t.includes(sql, 'alter table public.sessions add column if not exists fp text;', f + ': the column, safe to re-run');
      t.includes(sql, 'if new.doc is distinct from old.doc and new.fp is not distinct from old.fp then\n    new.fp := null;',
        f + ': a doc changed without a new fingerprint blanks it');
      t.includes(sql, 'create trigger sessions_fp_guard before update on public.sessions', f + ': the guard runs on every update');
    }
    const mig = rd('v92-fingerprint.sql');
    t.excludes(mig.replace(/--[^\n]*/g, ''), 'policy', 'the paste-once file changes no policy');
    t.includes(mig, 'F2|an older phone', '…and checks the guard itself');
    const app = await signedOut();
    const cols = String(app.run('_SYNC_JOB_LIST_COLS')).split(',');
    t.notOk(cols.includes('doc'), 'the pull\u2019s list read asks for no contents');
    t.ok(cols.includes('fp') && cols.includes('updated_at') && cols.includes('deleted'), '…only id, fingerprint, deleted and the stamp');
  });
};
