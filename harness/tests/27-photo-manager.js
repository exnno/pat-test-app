/* Standing test — the photo manager (V90, roadmap Stage 2B, R18)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID (1A–11A). Settings → Backup → Manage photos: this
   phone's photos and the ones known in the cloud, grouped by job, with totals,
   a filter, a sort and pages of 48 (6A, 11A). "Look in the cloud" (3A) is the
   first read of what the cloud holds for jobs NOT on this phone — rows only,
   job names picked out of the job row, nothing remembered. Select (7A) → remove
   from phone (known in the cloud only), download (cloud-only photos of jobs on
   this phone — 4A), delete everywhere (9A) — never on a locked job (8A). A photo
   found by the look is made KNOWN first and then deleted by the V89 path.
   Orphans (5A) are their own group, never deleted automatically.
   Peter's addition: the Backup button says "Clear photos from this phone"
   signed in, "Delete all photos" signed out.

   ⚠ DRIVES THE REAL VENDORED LIBRARY against a fake server, as 25/26 do. This
   fake also answers keyset paging (gt + order by id) and the doc->> field
   picks the look uses on the sessions table.

   ⚠ WHAT THIS FILE CANNOT PROVE. How it looks and scrolls on a phone, and that
   another account's rows can't be read (isolation-test.sql, by hand; no policy
   changed this release). */

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

module.exports = async function () {
  /* ------------------------------------------------------------------ 27a */
  await t.group('27a — signed out: the Backup page offers Manage photos; the button still says Delete; phone photos only', async () => {
    const app = await signedOut();
    const { sess, ids } = await jobWithPhotos(app, 'ZZOUT', 2);
    app.fn('setView')('settingsBackup');
    const html = app.html();
    t.includes(html, 'data-action="pm-open"', 'a Manage photos button on the Backup page');
    t.includes(html, '🗑 Delete all photos', 'signed out the wipe button says Delete — it really deletes');
    t.excludes(html, 'Clear photos from this phone', '…not Clear');
    tap(app, 'pm-open');
    // Previews are made one at a time; under a full run give the round time.
    for (let k = 0; k < 100 && !ids.every(id => !!app.fn('photoThumbCached')(id)); k++) await tick(10);
    t.eq(app.state().view, 'photoManager', 'the manager opens');
    const m = model(app);
    t.notOk(m.vis, 'signed out: no cloud view');
    t.eq(m.totals.phoneN, 2, 'the phone total counts this phone\u2019s photos');
    t.eq(m.groups.length, 1, 'one job');
    t.includes(m.groups[0].title, 'ZZOUT', '…named by its site, as the jobs list names it');
    t.eq(m.groups[0].key, String(sess.id), '…keyed by its job');
    const out = app.html();
    t.excludes(out, 'Look in the cloud', 'no cloud look signed out');
    t.excludes(out, 'data-change-action="pm-filter"', 'no filter signed out (only one kind of photo)');
    t.includes(out, 'data-change-action="pm-sort"', 'the sort is there');
    t.ok(ids.every(id => !!app.fn('photoThumbCached')(id)), 'previews were made on the phone for the tiles on screen');
    tap(app, 'pm-back'); await tick(5);
    t.eq(app.state().view, 'settingsBackup', 'Back returns to the Backup page');
  });

  /* ------------------------------------------------------------------ 27b */
  await t.group('27b — signed in: Clear on the Backup button; the model sorts phone, uploaded, not uploaded and cloud-only', async () => {
    const app = await signedIn();
    const a = await jobWithPhotos(app, 'ZZIN', 2);
    await run(app);                                  // both go up
    const b = await jobWithPhotos(app, 'ZZNEW', 1);  // not sent yet (no run)
    app.srv.otherRow({ id: 'ZZCLOUD1', session_id: String(a.sess.id), item_id: String(a.item.id), thumb: true });
    await run(app);
    const localNotUp = await addPhotos(app, b.sess, b.item, 1, 'late');
    app.run('navigator.onLine = false');   // no run: the late photo stays not uploaded
    app.fn('setView')('settingsBackup');
    t.includes(app.html(), '🗑 Clear photos from this phone', 'signed in the wipe button says Clear');
    tap(app, 'pm-open'); await tick(40);
    const m = model(app);
    t.ok(m.vis, 'signed in: the cloud view');
    const e = (id) => m.byId.get(id);
    t.ok(e(a.ids[0]).local && e(a.ids[0]).cloud, 'an uploaded photo is on the phone AND in the cloud');
    t.ok(e(localNotUp[0]).local && !e(localNotUp[0]).cloud, 'a photo not uploaded yet is on the phone only');
    t.ok(!e('ZZCLOUD1').local && e('ZZCLOUD1').src === 'known', 'a known cloud photo shows as cloud only');
    app.run('navigator.onLine = true');
    t.eq(m.totals.cloudAll, false, 'before a look the cloud total says it covers jobs on this phone');
    t.includes(app.html(), '(jobs on this phone)', '…in words');
    choose(app, 'pm-filter', 'cloud'); await tick(10);
    t.eq(model(app).total, 1, 'Cloud only: one photo');
    choose(app, 'pm-filter', 'notup'); await tick(10);
    t.ok(model(app).groups.every(g => g.shown.every(x => x.local && !x.cloud)), 'Not uploaded yet: only those');
    choose(app, 'pm-filter', 'phone'); await tick(10);
    t.ok(model(app).groups.every(g => g.shown.every(x => x.local)), 'On this phone: only those');
    choose(app, 'pm-filter', 'rubbish'); await tick(10);
    t.eq(pm(app).filter, 'all', 'a value nobody offered collapses to All');
    t.includes(app.html(), '☁ Cloud only', 'the tile badge says cloud only');
    t.includes(app.html(), 'Not uploaded', 'the tile badge says not uploaded');
    tap(app, 'pm-back'); tap(app, 'pm-open');   // online now: previews
    await until(() => app.srv.downloads().some(c => c.url.includes('ZZCLOUD1_t.jpg')));
    t.ok(app.srv.downloads().some(c => c.url.includes('ZZCLOUD1_t.jpg')), 'the cloud photo\u2019s preview came down for its tile');
    t.notOk(app.srv.downloads().some(c => c.url.includes('ZZCLOUD1.jpg')), '…never the photo itself');
  });

  /* ------------------------------------------------------------------ 27c */
  await t.group('27c — opening reads nothing from the cloud; Look in the cloud reads rows and job names only, remembers nothing (3A, R17)', async () => {
    const app = await signedIn();
    const mine = await jobWithPhotos(app, 'ZZMINE', 1);
    await run(app);
    cleared(app, ['ZZJOB-AWAY', 'ZZJOB-DEL', 'ZZJOB-NEVER']);
    app.srv.otherJob('ZZJOB-AWAY', { site: 'ZZAWAY SITE', date: '2026-08-01', locked: false });
    app.srv.otherRow({ id: 'ZZAWAY1', session_id: 'ZZJOB-AWAY', item_id: 'it1', thumb: true, bytes: 111 });
    app.srv.otherRow({ id: 'ZZAWAY2', session_id: 'ZZJOB-AWAY', item_id: 'it2', thumb: false, bytes: 222 });
    app.srv.otherJob('ZZJOB-DEL', {}, { deleted: true });
    app.srv.otherRow({ id: 'ZZORPH1', session_id: 'ZZJOB-DEL', item_id: 'x' });
    app.srv.otherRow({ id: 'ZZORPH2', session_id: 'ZZJOB-NEVER', item_id: 'y' });
    const before = app.srv.calls.length;
    tap(app, 'pm-open'); await tick(30);
    t.eq(app.srv.browseGets().length, 0, 'opening the manager reads nothing from the cloud');
    t.eq(app.srv.jobGets().length, 0, '…and no job names');
    t.includes(app.html(), 'class="pm-look-link" data-action="pm-look">Look in the cloud', 'Look in the cloud is a small link (V90.1)');
    t.excludes(app.html(), 'Nothing extra', 'no result line before a look');
    const knownBefore = JSON.stringify(known(app));
    tap(app, 'pm-look'); await until(looked(app)); await tick(40);
    t.ok(app.srv.browseGets().length >= 1, 'the look read the photos table');
    const q = decodeURIComponent(app.srv.browseGets()[0].url);
    t.includes(q, 'select=id,session_id,item_id,bytes,thumb,taken_at', '…rows only, never the storage path');
    t.includes(q, 'deleted=eq.false', '…live rows only');
    t.includes(q, 'user_id=eq.' + UID, '…this account only');
    const jq = app.srv.jobGets().map(c => decodeURIComponent(c.url)).join(' ');
    t.includes(jq, 'site:doc->>site', 'job names are picked out of the job row');
    t.notOk(/select=[^&]*(^|,)doc(,|&|$)/.test(jq), '…the job document itself never comes down');
    t.excludes(jq, String(mine.sess.id), 'jobs on this phone are not asked about');
    t.eq(app.srv.downloads().filter(c => !c.url.includes('_t.jpg')).length, 0, 'no image came down');
    t.eq(JSON.stringify(known(app)), knownBefore, 'nothing the look read is remembered (rule 24)');
    const m = model(app);
    const away = m.allGroups.find(g => g.key === 'ZZJOB-AWAY');
    t.notOk(app.state().sessions.some(s => String(s.id) === 'ZZJOB-AWAY'), '(the job really is not on this phone)');
    t.ok(!!away && !away.onPhone, 'photos of a job not on this phone are shown');
    t.eq(away && away.title, 'ZZAWAY SITE', '…named from the cloud');
    t.eq(away && away.photos.length, 2, '…both photos');
    const orph = m.allGroups.find(g => g.orphan);
    t.ok(!!orph, 'photos with no job get their own group (5A)');
    t.eq(orph && orph.photos.map(e => e.id).sort().join(), 'ZZORPH1,ZZORPH2', '…a deleted job and a job never in the cloud');
    t.eq(m.allGroups[m.allGroups.length - 1].orphan, true, '…at the bottom');
    t.ok(m.totals.cloudAll, 'after a look the cloud total covers everything');
    t.eq(m.totals.cloudN, 5, '…every live row');
    t.ok(app.srv.downloads().some(c => c.url.includes('ZZAWAY1_t.jpg')), 'a found photo\u2019s preview comes down for its tile');
    t.notOk(app.srv.downloads().some(c => c.url.includes('ZZAWAY2')), 'none requested where there is no preview');
    t.includes(app.html(), 'Photos with no job', 'the orphan group is named');
    t.includes(app.html(), 'Found 2 photos from 1 job not on this phone \u00b7 2 photos with no job', 'the result line says what the look found (V90.1)');
    t.includes(app.html(), 'data-action="pm-look">Look again', '…with a Look again link');
    // Leaving drops the look; coming back reads nothing until asked.
    tap(app, 'pm-back'); await tick(5);
    t.eq(pm(app).cloud, null, 'leaving the screen drops what the look read');
    const gets = app.srv.browseGets().length;
    tap(app, 'pm-open'); await tick(20);
    t.eq(app.srv.browseGets().length, gets, 'reopening reads nothing until asked');
    void before;
  });

  /* ------------------------------------------------------------------ 27d */
  await t.group('27d — the look pages by id (keyset) past a full page', async () => {
    const app = await signedIn();
    const n = app.run('SYNC_BROWSE_PAGE') + 3;
    for (let i = 0; i < n; i++) {
      app.srv.tables.photos.push({ id: 'ZZK' + String(i).padStart(5, '0'), user_id: UID, session_id: 'ZZJOB-K', item_id: 'k', bytes: 1, thumb: false, deleted: false, updated_at: 'x' });
    }
    cleared(app, ['ZZJOB-K']);
    app.srv.otherJob('ZZJOB-K', { site: 'ZZKEY' });
    await run(app);   // the phone has synced once (before that, cloud photos are never shown — V89)
    const gets0 = app.srv.browseGets().length;
    tap(app, 'pm-open'); await tick(20);
    tap(app, 'pm-look'); await until(looked(app)); await tick(40);
    t.eq(app.srv.browseGets().length - gets0, 2, 'two requests');
    t.includes(decodeURIComponent(app.srv.browseGets()[gets0 + 1].url), 'id=gt.ZZK' + String(n - 4).padStart(5, '0'), 'the second starts after the last id of the first');
    t.eq(pm(app).cloud.rows.length, n, 'every row was read, none twice');
    t.eq(model(app).groups[0].shown.length, app.run('PHOTO_MGR_PAGE'), 'one page of tiles is shown (11A)');
    t.includes(app.html(), 'Show more (' + (n - app.run('PHOTO_MGR_PAGE')) + ' more)', 'with how many more');
    tap(app, 'pm-more'); await tick(20);
    t.eq(model(app).groups[0].shown.length, app.run('PHOTO_MGR_PAGE') * 2, 'Show more adds a page');
  });

  /* ------------------------------------------------------------------ 27e */
  await t.group('27e — Select: tiles tick; a job heading takes the whole job, beyond the page (7A)', async () => {
    const app = await signedOut();
    const page = app.run('PHOTO_MGR_PAGE');
    const sess = withSession(app, { site: 'ZZSEL' });
    for (let k = 0; k < Math.ceil((page + 4) / 3); k++) {
      const item = withItem(app, { assetNo: 'ZZS' + k, result: 'fail' });
      await addPhotos(app, app.fn('activeSession')(), item, 3, 's' + k);
    }
    tap(app, 'pm-open');   // let the whole round finish
    await until(() => model(app).groups[0].shown.every(e => !!app.fn('photoThumbCached')(e.id)), 4000); await tick(100);
    const everyPhoto = model(app).allGroups[0].photos;
    const made = everyPhoto.filter(e => !!app.fn('photoThumbCached')(e.id)).length;
    t.eq(made, page, 'previews are made only for the tiles on screen (one page), not the whole job');
    const first = model(app).groups[0].shown[0].id;
    tap(app, 'pm-tile', first); await tick(5);
    t.ok(!!pm(app).preview, 'outside Select a tap opens the preview');
    tap(app, 'pm-preview-close'); await tick(5);
    t.eq(pm(app).preview, null, 'closed');
    tap(app, 'pm-select-toggle'); await tick(5);
    tap(app, 'pm-tile', first); await tick(5);
    t.ok(pm(app).selected[first], 'in Select a tap ticks the tile');
    t.includes(app.html(), '1 selected', 'the bar counts it');
    tap(app, 'pm-tile', first); await tick(5);
    t.notOk(pm(app).selected[first], 'a second tap unticks it');
    tap(app, 'pm-select-job', String(sess.id)); await tick(5);
    const total = model(app).allGroups[0].photos.length;
    t.ok(total > page, '(the job is longer than one page)');
    t.eq(Object.keys(pm(app).selected).length, total, 'the heading ticks every photo in the job, shown or not');
    tap(app, 'pm-select-job', String(sess.id)); await tick(5);
    t.eq(Object.keys(pm(app).selected).length, 0, 'again: all untick');
    tap(app, 'pm-tile', first); await tick(5);
    t.includes(app.html(), 'data-action="pm-delete"', 'signed out the bar offers Delete…');
    t.excludes(app.html(), 'data-action="pm-remove"', '…and nothing about the cloud');
    tap(app, 'pm-select-toggle'); await tick(5);
    t.eq(Object.keys(pm(app).selected).length, 0, 'Done clears the selection');
  });

  /* ------------------------------------------------------------------ 27f */
  await t.group('27f — Remove from phone: only photos known in the cloud; nothing noted; the cloud untouched', async () => {
    const app = await signedIn();
    const a = await jobWithPhotos(app, 'ZZREM', 2);
    await run(app);
    const late = await addPhotos(app, a.sess, a.item, 1, 'late');
    app.run('navigator.onLine = false');   // remove from phone needs no signal; and no run uploads the late one
    tap(app, 'pm-open'); await tick(40);
    await until(() => a.ids.every(id => !!app.fn('photoThumbCached')(id)));
    tap(app, 'pm-select-toggle');
    [...a.ids, ...late].forEach(id => tap(app, 'pm-tile', id));
    const patches = app.srv.patches().length, removes = app.srv.removes().length, led = ledger(app).length;
    tap(app, 'pm-remove'); await tick(5);
    t.ok(confirmSheet(app, 'yes'), 'asks first'); await until(() => !app.state().photoMgr.busy); await tick(20);
    const meta = app.state().photoMeta;
    t.ok(a.ids.every(id => !meta[id]), 'the uploaded photos left this phone');
    t.ok(!!meta[late[0]], 'the one not in the cloud yet stayed');
    t.eq(ledger(app).length, led, 'nothing noted as deleted');
    t.eq(app.srv.patches().length, patches, 'no row touched in the cloud');
    t.eq(app.srv.removes().length, removes, 'no file removed from the cloud');
    t.ok(a.ids.every(id => !!known(app)[id]), 'still known in the cloud');
    t.ok(a.ids.every(id => !!app.fn('photoThumbCached')(id)), 'their previews are kept (no re-download to see them)');
    const m = model(app);
    t.ok(a.ids.every(id => m.byId.get(id) && !m.byId.get(id).local), 'they now show as cloud only');
    t.includes(app.toasts.join(), 'Removed 2 photos', 'says how many');
  });

  /* ------------------------------------------------------------------ 27g */
  await t.group('27g — Delete everywhere: phone, known and found photos all go by the ledger; a locked job is refused (8A, 9A)', async () => {
    const app = await signedIn();
    const a = await jobWithPhotos(app, 'ZZDEL', 1);
    await run(app);
    app.srv.otherRow({ id: 'ZZKNOWN', session_id: String(a.sess.id), item_id: String(a.item.id), thumb: true });
    await run(app);
    const lk = await jobWithPhotos(app, 'ZZLOCKED', 1);
    await run(app);
    app.run(`state.sessions.find(s => String(s.id) === ${JSON.stringify(String(lk.sess.id))}).locked = true`);
    cleared(app, ['ZZJOB-F', 'ZZJOB-FL']);
    app.srv.otherJob('ZZJOB-F', { site: 'ZZFOUND' });
    app.srv.otherRow({ id: 'ZZFOUND1', session_id: 'ZZJOB-F', item_id: 'f1', thumb: true });
    app.srv.otherJob('ZZJOB-FL', { site: 'ZZFOUNDLOCK', locked: true });
    app.srv.otherRow({ id: 'ZZFOUNDL', session_id: 'ZZJOB-FL', item_id: 'f2' });
    tap(app, 'pm-open'); await tick(30);
    tap(app, 'pm-look'); await until(looked(app)); await tick(40);
    tap(app, 'pm-select-toggle');
    for (const id of [a.ids[0], 'ZZKNOWN', lk.ids[0], 'ZZFOUND1', 'ZZFOUNDL']) tap(app, 'pm-tile', id);
    t.eq(model(app).byId.get('ZZFOUND1').src, 'browse', '(the found photo really was found by the look, not known)');
    tap(app, 'pm-delete'); await tick(5);
    const msg = app.asked.join(' ');
    t.includes(msg, 'Delete 3 photos everywhere?', 'the confirm names the count, everywhere (9A)');
    t.includes(msg, 'every phone', '…says every phone loses them');
    t.includes(msg, 'can\u2019t be undone', '…and that it can\u2019t be undone');
    t.includes(msg, '2 photos on locked jobs are left alone', '…and what is left alone (8A)');
    t.includes(msg, 'Delete 3 photos', 'the button repeats the count');
    t.ok(confirmSheet(app, 'yes'), 'confirmed'); await until(() => !app.state().photoMgr.busy); await tick(20);
    const led = ledger(app).filter(x => x.kind === 'photo').map(x => x.id);
    t.ok(led.includes(String(a.ids[0])) && led.includes('ZZKNOWN') && led.includes('ZZFOUND1'), 'all three in the ledger');
    t.notOk(led.includes(String(lk.ids[0])) || led.includes('ZZFOUNDL'), 'locked jobs\u2019 photos are not');
    t.notOk(app.state().photoMeta[a.ids[0]], 'the phone\u2019s copy went');
    t.ok(!!app.state().photoMeta[lk.ids[0]], 'the locked job\u2019s photo is still on the phone');
    t.ok(!!known(app).ZZFOUND1, 'the found photo was made known first');
    await run(app);
    const row = (id) => app.srv.tables.photos.find(r => r.id === id);
    t.eq(row('ZZFOUND1').deleted, true, 'the next run marked the found photo\u2019s row deleted');
    t.eq(row('ZZKNOWN').deleted, true, '…the known one\u2019s');
    t.eq(row(String(a.ids[0])).deleted, true, '…and the phone photo\u2019s');
    t.notOk(app.srv.files.has(UID + '/ZZFOUND1.jpg') || app.srv.files.has(UID + '/ZZFOUND1_t.jpg'), 'both files went');
    t.notOk(known(app).ZZFOUND1, 'then it is forgotten');
    t.eq(row('ZZFOUNDL').deleted, false, 'the locked job\u2019s cloud photo is untouched');
    t.ok(app.srv.files.has(UID + '/ZZFOUNDL.jpg'), '…file and all');
  });

  /* ------------------------------------------------------------------ 27h */
  await t.group('27h — a found photo is made known only once no sync is running (a run would overwrite it)', async () => {
    const app = await signedIn();
    await jobWithPhotos(app, 'ZZWAIT', 1);
    await run(app);
    app.run('globalThis.__zzRelease = null; _syncRunning = new Promise(r => { globalThis.__zzRelease = r; })');
    const p = app.run("syncPhotoKnowForDelete([{ id: 'ZZW1', s: 'ZZJOB-W', i: 'w', b: 5, t: true, a: '2026-09-01T00:00:00.000Z' }])");
    await tick(10);
    t.notOk(known(app).ZZW1, 'nothing written while a run holds the sync state');
    app.run('_syncRunning = null; globalThis.__zzRelease(true)');
    const n = await p; await tick(5);
    t.eq(n, 1, 'written once it finished');
    const e = known(app).ZZW1;
    t.eq(e && e.s, 'ZZJOB-W', '…with its job'); t.eq(e && e.t, 1, '…its preview flag'); t.eq(e && e.b, 5, '…its size');
    t.eq(app.state().photoCloud.ZZW1 && app.state().photoCloud.ZZW1.s, 'ZZJOB-W', 'the screen\u2019s view follows');
  });

  /* ------------------------------------------------------------------ 27i */
  await t.group('27i — Download: cloud-only photos of jobs on this phone; a found photo\u2019s job is not here, so it is not downloaded', async () => {
    const app = await signedIn();
    const a = await jobWithPhotos(app, 'ZZDOWN', 1);
    await run(app);
    app.srv.otherRow({ id: 'ZZDL1', session_id: String(a.sess.id), item_id: String(a.item.id) });
    await run(app);
    cleared(app, ['ZZJOB-X']);
    app.srv.otherJob('ZZJOB-X', { site: 'ZZX' });
    app.srv.otherRow({ id: 'ZZX1', session_id: 'ZZJOB-X', item_id: 'x' });
    tap(app, 'pm-open'); await tick(30);
    tap(app, 'pm-look'); await until(looked(app)); await tick(40);
    tap(app, 'pm-select-toggle');
    tap(app, 'pm-tile', 'ZZDL1'); tap(app, 'pm-tile', 'ZZX1');
    tap(app, 'pm-download'); await until(() => !app.state().photoMgr.busy); await tick(20);
    t.ok(!!app.state().photoMeta.ZZDL1, 'the photo of a job on this phone came down');
    t.notOk(app.state().photoMeta.ZZX1, 'the photo of a job not on this phone did not');
    t.notOk(app.srv.downloads().some(c => c.url.includes('/ZZX1.jpg')), '…not even asked for');
    t.includes(app.toasts.join(), 'aren\u2019t on this phone', 'says why one was left');
    t.notOk(pm(app).selected.ZZDL1, 'the downloaded one leaves the selection');
    t.notOk(pm(app).busy, 'no longer busy');
  });

  /* ------------------------------------------------------------------ 27j */
  await t.group('27j — the preview: what it is, where it is, and no delete on a locked job', async () => {
    const app = await signedIn();
    const a = await jobWithPhotos(app, 'ZZPREV', 1);
    await run(app);
    tap(app, 'pm-open'); await tick(30);
    tap(app, 'pm-tile', a.ids[0]); await tick(20);
    let html = app.html();
    t.includes(html, 'On this phone and in the cloud', 'says where it is');
    t.includes(html, 'data-action="pm-remove" data-arg="' + a.ids[0] + '"', 'offers Remove from phone for this one photo');
    t.includes(html, 'Delete everywhere', 'offers Delete everywhere');
    tap(app, 'pm-preview-close'); await tick(5);
    app.run(`state.sessions.find(s => String(s.id) === ${JSON.stringify(String(a.sess.id))}).locked = true`);
    tap(app, 'pm-tile', a.ids[0]); await tick(20);
    html = app.html();
    t.includes(html, 'This job is locked', 'a locked job says so');
    t.excludes(html, 'data-action="pm-delete"', '…and offers no delete');
    const led = ledger(app).length;
    tap(app, 'pm-delete', a.ids[0]); await tick(10);
    t.eq(ledger(app).length, led, 'a delete reaching it anyway is refused');
    t.includes(app.toasts.join(), 'locked', '…and says why');
  });

  /* ------------------------------------------------------------------ 27k */
  await t.group('27k — signed out, delete is phone only and says so; no cloud call is possible', async () => {
    const app = await signedOut();
    const a = await jobWithPhotos(app, 'ZZDOUT', 2);
    tap(app, 'pm-open'); await tick(20);
    tap(app, 'pm-select-toggle'); tap(app, 'pm-select-job', String(a.sess.id));
    tap(app, 'pm-delete'); await tick(5);
    const msg = app.asked.join(' ');
    t.includes(msg, 'Delete 2 photos?', 'no "everywhere" signed out');
    t.includes(msg, 'from this phone', '…it is this phone only');
    t.ok(confirmSheet(app, 'yes')); await until(() => !app.state().photoMgr.busy); await tick(20);
    t.eq(Object.keys(app.state().photoMeta).length, 0, 'both deleted');
    t.eq(model(app).total, 0, 'nothing left');
    t.includes(app.html(), 'No photos yet', 'the empty state');
  });

  /* ------------------------------------------------------------------ 27l */
  await t.group('27l — no signal: Look in the cloud asks nothing and says so', async () => {
    const app = await signedIn();
    await run(app);
    tap(app, 'pm-open'); await tick(20);
    app.run('navigator.onLine = false');
    tap(app, 'pm-look'); await tick(30);
    t.eq(app.srv.browseGets().length, 0, 'no request');
    t.includes(app.toasts.join(), 'No signal', 'a plain no-signal message');
    t.eq(pm(app).cloud, null, 'nothing pretends to have been read');
    const direct = await app.run('syncPhotoBrowse()');
    t.ok(direct.offline && !direct.ok && direct.rows.length === 0, 'the read itself refuses offline');
  });

  /* ------------------------------------------------------------------ 27m */
  await t.group('27m — a row the look finds for a job ON this phone is left to the pull (rule 24)', async () => {
    const app = await signedIn();
    const a = await jobWithPhotos(app, 'ZZHERE', 1);
    await run(app);
    // Another phone adds a photo to this job; this phone has not pulled since.
    app.srv.otherRow({ id: 'ZZHERE2', session_id: String(a.sess.id), item_id: String(a.item.id) });
    // Opened and looked WITHOUT a navigation tap, so no run reads the row first.
    app.fn('photoMgrOpen')(); await tick(10);
    app.fn('photoMgrLook')(); await until(looked(app)); await tick(20);
    t.notOk(known(app).ZZHERE2, '(not known yet: no run has read it)');
    t.ok(pm(app).cloud.rows.some(r => r.id === 'ZZHERE2'), '(the look did read the row)');
    t.notOk(model(app).byId.has('ZZHERE2'), 'not shown as a found photo: the pull brings it, with a Download that works');
    t.includes(app.html(), 'Nothing extra', 'a look that finds nothing beyond this phone says so (V90.1)');
    await run(app);
    const e = model(app).byId.get('ZZHERE2');
    t.ok(e && e.src === 'known' && e.onPhone, 'after the next run it is there, known, on its job');
  });
};
