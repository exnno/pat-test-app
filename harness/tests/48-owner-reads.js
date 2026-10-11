/* Standing test — V111: every cloud read names its owner (Stage 11, 1A) + release
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS GUARDS. Seven reads of the cloud tables relied on the database
   rules ALONE to return only this account's rows: the jobs, records and photo
   pulls, the photo rows of a job that arrived late, and the three one-row reads
   behind a held job/record (Use the cloud copy, Compare). From Stage 11's
   business rules (V112) an Owner, Team leader or Office login may READ other
   members' rows, so each read now says .eq('user_id', uid) itself. Without it
   a teammate's job would come onto this phone as this account's own — and ids
   are unique per account only, so a teammate's job with the same id would land
   on top of yours.

   48a reads the source: every .from() of sessions / records / photos /
   session_photo_counts in every app file filters by user_id (reads, updates)
   or upserts on (user_id, id). A new read without it fails until fixed. The
   chain reader is checked against an independent plain count, so it cannot
   pass by finding nothing.
   48b–48e run the real sync against a fake server that does NOT apply the
   rules — it returns every account's rows, as the V113 rules will for an
   Owner — seeded with a teammate's rows that would do damage if read: a
   delete of a job with your job's id, a later edit of your client, photo rows
   on your job's id, a first-in-table copy of a held job. Helpers are 45's,
   with the fake keyed on (user_id, id) like the real primary key.

   ⚠ WHAT THIS FILE CANNOT PROVE. The rules themselves (V113's SQL — the database release, renumbered from V112 — and
   isolation-test.sql do). Reads in vendored code (supabase.umd.js) are out of
   scope; cloud.js reads profiles by the login's own id, which no team rule
   widens. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp, scriptOrderFromIndex } = require('../load');
const { tick, withSession, withItem } = require('../fixture');

const LIB  = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const UID  = '11111111-1111-1111-1111-111111111111';
const MATE = '22222222-2222-2222-2222-222222222222';   // a teammate, same business
const J = JSON.stringify;
const TABLES = ['sessions', 'records', 'photos', 'session_photo_counts'];

/* ---------------------------------------------------------- source reader */
// From just after `.from('x')`, read the method chain: `.name(args)` links,
// skipping whitespace and comments, until .then/.catch/.finally or anything
// that isn't a link. Strings and nested brackets inside args are respected.
function readChain(src, pos) {
  const links = [];
  const n = src.length;
  const skip = () => {
    for (;;) {
      while (pos < n && /\s/.test(src[pos])) pos++;
      if (src.startsWith('//', pos)) { while (pos < n && src[pos] !== '\n') pos++; continue; }
      if (src.startsWith('/*', pos)) { pos = src.indexOf('*/', pos) + 2; continue; }
      return;
    }
  };
  for (;;) {
    skip();
    if (src[pos] !== '.') break;
    const m = /^\.([A-Za-z_$][\w$]*)\s*\(/.exec(src.slice(pos, pos + 80));
    if (!m) break;
    if (/^(then|catch|finally)$/.test(m[1])) break;
    let i = pos + m[0].length, depth = 1, q = null;
    const start = i;
    while (i < n && depth > 0) {
      const ch = src[i];
      if (q) { if (ch === '\\') i++; else if (ch === q) q = null; }
      else if (ch === '\'' || ch === '"' || ch === '`') q = ch;
      else if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth--;
      i++;
    }
    links.push({ name: m[1], args: src.slice(start, i - 1) });
    pos = i;
  }
  return links;
}

function appFiles() {
  return scriptOrderFromIndex().filter(f => !/\.min\.js$|^supabase\.umd\.js$|^pdfjs/.test(f));
}

// Every table call in every app file: { file, line, table, links, kind }.
function tableCalls() {
  const out = [];
  for (const file of appFiles()) {
    const src = fs.readFileSync(path.join(APP_DIR, file), 'utf8');
    const re = /(\bstorage\s*)?\.from\(\s*'([a-z_]+)'\s*\)/g;
    let m;
    while ((m = re.exec(src))) {
      if (m[1] || !TABLES.includes(m[2])) continue;
      const links = readChain(src, m.index + m[0].length);
      const names = links.map(l => l.name);
      const kind = names.includes('upsert') ? 'upsert' : names.includes('update') ? 'update'
        : names.includes('delete') ? 'delete' : names.includes('insert') ? 'insert' : 'select';
      out.push({ file, line: src.slice(0, m.index).split('\n').length, table: m[2], links, kind });
    }
  }
  return out;
}
const named = (c) => c.links.some(l => l.name === 'eq' && /^\s*'user_id'\s*,/.test(l.args));

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
        const k = p.user_id + '|' + String(p.session_id), e = m.get(k) || { user_id: p.user_id, session_id: String(p.session_id), n: 0, b: 0 };
        e.n += 1; e.b += Number(p.bytes) || 0; m.set(k, e);
      }
      return json(applyQuery(Array.from(m.values()), qs));
    }
    if (u.includes('/rest/v1/photos')) {
      if (method === 'GET') return json(applyQuery(tables.photos, qs));
      if (method === 'PATCH') return patch(tables.photos, qs, body);
      for (const row of (Array.isArray(body) ? body : [body])) {
        const i = tables.photos.findIndex(r => r.id === row.id && r.user_id === row.user_id);
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
        const i = tables.sessions.findIndex(r => String(r.id) === String(row.id) && r.user_id === row.user_id);
        const stored = Object.assign(guard(i === -1 ? null : tables.sessions[i], row), { updated_at: st });
        if (i === -1) tables.sessions.push(stored); else tables.sessions[i] = stored;
      }
      return new Response(null, { status: 201 });
    }
    if (u.includes('/rest/v1/records')) {
      if (method === 'GET') return json(applyQuery(tables.records, qs));
      const st = stamp();
      for (const row of (Array.isArray(body) ? body : [])) {
        const i = tables.records.findIndex(r => String(r.id) === String(row.id) && r.user_id === row.user_id);
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
const onPhone = (app, id) => app.state().sessions.some(s => String(s.id) === String(id));
const jobOf = (app, id) => app.state().sessions.find(s => String(s.id) === String(id));
const held = (app) => JSON.parse(app.storage.getItem('pat:syncHeld') || '[]');
const gets = (app, table) => app.srv.calls.filter(c => c.method === 'GET' && c.url.includes('/rest/v1/' + table + '?')).map(c => decodeURIComponent(c.url));
const pad = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };

function plainJob(app, site) {
  withSession(app, { site });
  withItem(app, { assetNo: 'ZZS-' + Math.random().toString(36).slice(2, 7), result: 'pass' });
  const s = app.fn('activeSession')();
  app.stopTimer();
  return String(s.id);
}
// A row in someone's name. A job doc carries today's date, so the 30-day window takes it.
function mateJob(app, id, o = {}) {
  const doc = Object.assign({ id, site: 'ZZMATE ' + id, date: today(), items: [{ id: id + '-mi', assetNo: 'M1', result: 'pass' }] }, o.doc || {});
  const row = { id, user_id: o.user || MATE, doc: o.deleted ? {} : doc, deleted: !!o.deleted, fp: o.deleted ? null : app.run(`syncHash(_syncCanonical(${J(doc)}))`),
    last_modified: '2026-10-10T00:00:00.000Z', updated_at: o.at || app.srv.stamp() };
  if (o.first) app.srv.tables.sessions.unshift(row); else app.srv.tables.sessions.push(row);
  return row;
}
function mateRecord(app, id, name, o = {}) {
  const row = { id, user_id: o.user || MATE, kind: 'client', doc: { id, name }, deleted: false,
    last_modified: '2026-10-10T00:00:00.000Z', updated_at: o.at || app.srv.stamp() };
  if (o.first) app.srv.tables.records.unshift(row); else app.srv.tables.records.push(row);
  return row;
}
function matePhoto(app, id, sid, o = {}) {
  app.srv.tables.photos.push({ id, user_id: MATE, session_id: sid, item_id: sid + '-mi', storage_path: MATE + '/' + id + '.jpg',
    bytes: 4321, thumb: true, deleted: false, last_modified: '2026-10-10T00:00:00.000Z', updated_at: o.at || app.srv.stamp() });
}

module.exports = async function () {

  /* ------------------------------------------------------------------ 48a */
  await t.group('48a — every read of the cloud tables names its owner (1A)', () => {
    const calls = tableCalls();
    // The reader is checked by an independent plain count: every `.from('table')`
    // that is not storage.from is one call found. A reader that lost its place
    // would find fewer and pass 48a while proving nothing.
    let plain = 0;
    for (const file of appFiles()) {
      const src = fs.readFileSync(path.join(APP_DIR, file), 'utf8');
      for (const tb of TABLES) {
        plain += src.split(".from('" + tb + "')").length - 1;
        plain -= src.split("storage.from('" + tb + "')").length - 1;
      }
    }
    t.eq(calls.length, plain, `the chain reader found every table call (${plain})`);
    t.ok(calls.length >= 29, 'and the app still reads the cloud tables (29 calls at V111)');
    t.ok(calls.every(c => c.links.length >= 1), 'every call has a chain to read');
    const reads = calls.filter(c => c.kind === 'select' || c.kind === 'update' || c.kind === 'delete');
    const blind = reads.filter(c => !named(c)).map(c => `${c.file}:${c.line} ${c.table}`);
    t.deepEq(blind, [], 'every read, update and delete filters by user_id (never the rules alone)');
    const ups = calls.filter(c => c.kind === 'upsert');
    t.ok(ups.length >= 3, 'the three upserts are found (jobs, records, photos)');
    const loose = ups.filter(c => !c.links.some(l => l.name === 'upsert' && /onConflict:\s*'user_id,id'/.test(l.args))).map(c => `${c.file}:${c.line}`);
    t.deepEq(loose, [], 'every upsert lands on (user_id, id) — the row is this account’s');
    t.eq(calls.filter(c => c.kind === 'insert').length, 0, 'no plain insert (it would have no owner check here)');
    // The seven V111 reads, by their own lines, so a refactor that moves one is seen.
    const sync = fs.readFileSync(path.join(APP_DIR, 'sync.js'), 'utf8');
    for (const s of [
      ".select(_SYNC_JOB_LIST_COLS)\n      .eq('user_id', uid)",
      ".select('id,kind,doc,deleted,last_modified,updated_at')\n      .eq('user_id', uid)",
      ".select(_SYNC_PHOTO_COLS)\n      .eq('user_id', uid)",
      ".select(_SYNC_PHOTO_COLS).eq('user_id', uid).in('session_id', chunk)",
    ]) t.includes(sync, s, 'V111 read present: ' + s.split('\n')[0].trim());
    t.eq(sync.split(".eq('user_id', _syncCurrentUserId()).eq('id', sid)").length - 1, 3, 'the three one-row held reads name the owner');
  });

  /* ------------------------------------------------------------------ 48b */
  await t.group('48b — the jobs pull: a teammate’s jobs never reach this phone', async () => {
    const app = await signedIn();
    const mine = plainJob(app, 'ZZ MY JOB');
    await run(app);
    t.ok(app.srv.tables.sessions.some(r => r.id === mine && r.user_id === UID), 'precondition: my job is in the cloud, in my name');
    // The teammate deleted THEIR job that has my job's id, and logged another.
    mateJob(app, mine, { deleted: true });
    mateJob(app, 'ZZMATEJOB');
    await run(app);
    t.ok(onPhone(app, mine), 'my job stays on this phone — a teammate’s delete of the same id is not mine');
    t.eq(held(app).length, 0, '…and nothing is held as “deleted elsewhere”');
    t.notOk(onPhone(app, 'ZZMATEJOB'), 'the teammate’s other job does not come down as mine');
    t.ok(app.srv.tables.sessions.some(r => r.id === mine && r.user_id === UID && r.deleted === false), 'and my cloud copy is untouched');
    const list = gets(app, 'sessions').filter(u => u.includes('updated_at=gte'));
    t.ok(list.length >= 2 && list.every(u => u.includes('user_id=eq.' + UID)), 'every jobs-list read asks for this account by name');
  });

  /* ------------------------------------------------------------------ 48c */
  await t.group('48c — the records pull: a teammate’s clients never reach this phone', async () => {
    const app = await signedIn();
    mateRecord(app, 'ZZCL', 'ZZ My Client', { user: UID });
    await run(app);
    const name = () => ((app.state().clients || []).find(c => String(c.id) === 'ZZCL') || {}).name;
    t.eq(name(), 'ZZ My Client', 'precondition: my client came down');
    mateRecord(app, 'ZZCL', 'ZZ Mate Client');       // same id, later
    mateRecord(app, 'ZZCLMATE', 'ZZ Mate Only');
    await run(app);
    t.eq(name(), 'ZZ My Client', 'my client keeps its name — a teammate’s record with the same id is not mine');
    t.notOk((app.state().clients || []).some(c => String(c.id) === 'ZZCLMATE'), 'the teammate’s other client does not come down');
    const recs = gets(app, 'records').filter(u => u.includes('updated_at=gte'));
    t.ok(recs.length >= 2 && recs.every(u => u.includes('user_id=eq.' + UID)), 'every records read asks for this account by name');
  });

  /* ------------------------------------------------------------------ 48d */
  await t.group('48d — the photo rows: a teammate’s photos on a same-id job are not this phone’s', async () => {
    const app = await signedIn();
    const mine = plainJob(app, 'ZZ PHOTO JOB');
    await run(app);
    // The pager: a photo row on the teammate's job with my job's id.
    matePhoto(app, 'ZZMATEPH1', mine);
    await run(app);
    const sent = () => (syncState(app).ph || {}).sent || {};
    t.notOk('ZZMATEPH1' in sent(), 'the photo pull does not take a teammate’s row as one of my job’s photos');
    // The late-job read (st.ph.need): rows older than the cursor, asked for by job.
    matePhoto(app, 'ZZMATEPH2', mine, { at: '2026-01-01T00:00:00.000Z' });
    const st = syncState(app);
    st.ph.need = [mine];
    app.storage.setItem('pat:syncState', J(st));
    const before = gets(app, 'photos').length;
    await run(app);
    const byJob = gets(app, 'photos').slice(before).filter(u => u.includes('session_id=in.'));
    t.ok(byJob.length >= 1, 'precondition: the late-job read ran');
    t.notOk('ZZMATEPH2' in sent(), 'the late-job read does not take a teammate’s row either');
    t.ok(byJob.every(u => u.includes('user_id=eq.' + UID)), '…and asks for this account by name');
  });

  /* ------------------------------------------------------------------ 48e */
  await t.group('48e — held answers read this account’s copy, not a teammate’s with the same id', async () => {
    const app = await signedIn();
    const mine = plainJob(app, 'ZZ HELD JOB');
    await run(app);
    // My cloud copy moves on (another of my phones); a teammate's same-id job,
    // which they have deleted, sits FIRST in the table, where a read by id alone
    // finds it: Compare would say my copy is gone, and Use the cloud copy would
    // delete my job.
    const row = app.srv.tables.sessions.find(r => r.id === mine && r.user_id === UID);
    row.doc = Object.assign({}, row.doc, { site: 'ZZ MY CLOUD COPY' });
    row.fp = null; row.updated_at = app.srv.stamp();
    mateJob(app, mine, { first: true, deleted: true });
    const at = '2026-10-10T09:00:00.000Z';
    app.storage.setItem('pat:syncHeld', J([{ id: mine, at, reason: 'both-changed', name: 'ZZ HELD JOB', localItems: 1, cloudItems: 1 }]));
    app.state().sync.message = '';
    await app.fn('syncHeldDiff')(mine);
    await tick(10);
    t.excludes(String(app.state().sync.message || ''), 'no longer has a copy', 'Compare finds my cloud copy, not the teammate’s deleted one');
    app.run("document.querySelectorAll('.bulk-sheet, .sheet-backdrop').forEach(el => el.remove())");
    await app.fn('syncHeldResolve')(mine, 'cloud');
    app.stopTimer(); await tick(20);
    t.ok(onPhone(app, mine), 'Use the cloud copy keeps my job (the teammate’s delete is not mine)');
    t.eq((jobOf(app, mine) || {}).site, 'ZZ MY CLOUD COPY', '…and takes MY cloud copy');
    // A held client the same way.
    mateRecord(app, 'ZZHC', 'ZZ My Held Client', { user: UID });
    await run(app);
    // My cloud copy changed, stamped BEFORE the cursor, so the sync that follows
    // the answer does not read it again and quietly put right a wrong answer.
    Object.assign(app.srv.tables.records.find(r => r.id === 'ZZHC' && r.user_id === UID),
      { doc: { id: 'ZZHC', name: 'ZZ My Cloud Client' }, updated_at: '2026-01-01T00:00:00.000Z' });
    mateRecord(app, 'ZZHC', 'ZZ Mate Held Client', { first: true });
    app.storage.setItem('pat:syncHeld', J([{ id: 'ZZHC', kind: 'client', at, reason: 'both-changed', name: 'c', localName: 'a', cloudName: 'b' }]));
    await app.fn('syncHeldResolve')('client/ZZHC', 'cloud');
    app.stopTimer(); await tick(20);
    t.eq(((app.state().clients || []).find(c => String(c.id) === 'ZZHC') || {}).name, 'ZZ My Cloud Client', 'a held client takes MY cloud copy');
    const one = gets(app, 'sessions').concat(gets(app, 'records')).filter(u => /[?&]id=eq\./.test(u));
    t.ok(one.length >= 3 && one.every(u => u.includes('user_id=eq.' + UID)), 'every one-row read asks for this account by name');
  });

  // 48f (V111 release pins) moved to 49k in V112, as 47f moved to 48f.
};
