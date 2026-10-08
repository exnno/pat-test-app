/* Standing test — photos DOWN, on request only (V89)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID (1A 2A 3A 4A 5A). Rows come down, images don't (R17):
   a phone learns which photos are in the cloud from the photos table (its own
   cursor), keeping rows only for jobs it holds. A preview goes up beside each
   photo (1A: photo, preview, row). A cloud-only photo shows as a ☁ tile and
   comes down on a tap (2A); badges and the jobs list count it (3A); the
   certificate asks first (4A). Any phone that knows a cloud photo can delete
   it, and a delete made elsewhere removes this phone's copy (5A).

   ⚠ DRIVES THE REAL VENDORED LIBRARY against a fake server, as 25 does. This
   fake also answers GETs on the photos table (filters, order, limit — the
   pager is exercised for real) and storage downloads.

   ⚠ WHAT THIS FILE CANNOT PROVE. That another account cannot read the previews:
   supabase/isolation-test.sql 4e/4f, by hand. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { tick, withSession, withItem, confirmSheet, RECENT_DATE } = require('../fixture');

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

// PostgREST-ish filters: eq, gte, in; order by updated_at; limit.
function applyQuery(rows, qs) {
  const q = new URLSearchParams(qs || '');
  let out = rows.slice();
  for (const [k, v] of q) {
    if (k === 'select' || k === 'order' || k === 'limit' || k === 'on_conflict') continue;
    if (v.startsWith('eq.')) { const x = v.slice(3); out = out.filter(r => String(r[k]) === x); }
    else if (v.startsWith('gte.')) { const x = v.slice(4); out = out.filter(r => String(r[k]) >= x); }
    else if (v.startsWith('in.(')) {
      const list = v.slice(4, -1).split(',').map(s => s.replace(/^"|"$/g, ''));
      out = out.filter(r => list.includes(String(r[k])));
    }
  }
  if (q.get('order')) out.sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)));
  if (q.get('limit')) out = out.slice(0, parseInt(q.get('limit'), 10));
  return out;
}

function fakeServer(o = {}) {
  const calls = [];
  const tables = { sessions: [], records: [], photos: [] };
  const files = new Map();
  const fail = new Set(o.fail || []);
  let stampN = 0;
  const stamp = () => { stampN++; return '2026-09-29T11:' + String(Math.floor(stampN / 60)).padStart(2, '0') + ':' + String(stampN % 60).padStart(2, '0') + '.000Z'; };
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
        if (fail.has('download') || !files.has(p)) return json({ message: 'not found' }, 400);
        return new Response(new Blob(['ZZFILE:' + p], { type: 'image/jpeg' }), { status: 200 });
      }
      files.set(p, true);
      return json({ Key: 'photos/' + p, Id: 'x' });
    }
    const qs = u.split('?')[1] || '';
    if (u.includes('/rest/v1/photos')) {
      if (method === 'GET') return json(applyQuery(tables.photos, qs));
      if (method === 'PATCH') {
        for (const r of applyQuery(tables.photos, qs)) Object.assign(r, body, { updated_at: stamp() });
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
    calls, fetchImpl, tables, files, fail, stamp,
    downloads: () => calls.filter(c => is(c, '/storage/v1/object/photos/', 'GET')),
    uploads: () => calls.filter(c => is(c, '/storage/v1/object/photos/', 'POST')),
    removes: () => calls.filter(c => is(c, '/storage/v1/object/photos', 'DELETE')),
    patches: () => calls.filter(c => is(c, '/rest/v1/photos', 'PATCH')),
    rowPosts: () => calls.filter(c => is(c, '/rest/v1/photos', 'POST')),
    rowGets: () => calls.filter(c => is(c, '/rest/v1/photos', 'GET')),
    // A photo the OTHER phone put in the cloud.
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
  return app;
}

async function signedIn(opts = {}) {
  const ls = Object.assign({ 'patgo:cloudAuth:test': storedSession() }, opts.localStorage || {});
  const app = boot({ localStorage: ls, navigator: { onLine: false } });
  const srv = fakeServer(opts.server || {});
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
  return app;
}

// A tap exactly as the browser delivers it (group 22's shape).
function tap(app, action, arg) {
  const el = app.doc.createElement('button');
  el.dataset.action = action;
  if (arg !== undefined) el.dataset.arg = String(arg);
  app.doc.getElementById('app').dispatchEvent({
    type: 'click', target: el, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
  });
}

const syncState = (app) => JSON.parse(app.storage.getItem('pat:syncState') || 'null');
const known = (app) => ((syncState(app) || { ph: { sent: {} } }).ph.sent);
const ledger = (app) => JSON.parse(app.storage.getItem('pat:tombstones') || '[]');
async function run(app) { const r = await app.fn('syncPush')({ pull: true }); app.stopTimer(); await tick(20); return r; }

// This phone holds a job with one failed item, already in the cloud.
async function jobWithFail(app, site) {
  const sess = withSession(app, { site: site || 'ZZDOWN' });
  const item = withItem(app, { assetNo: 'ZZD-' + Math.random().toString(36).slice(2, 7), result: 'fail' });
  app.stopTimer();
  await run(app);
  return { sess: app.fn('activeSession')(), item };
}

module.exports = async function () {
  /* ------------------------------------------------------------------ 26a */
  await t.group('26a — rows down: kept for jobs on this phone only; no image comes down by itself (R17)', async () => {
    const app = await signedIn();
    const { sess, item } = await jobWithFail(app);
    app.srv.otherRow({ id: 'ZZC1', session_id: String(sess.id), item_id: String(item.id), thumb: true, bytes: 240000 });
    app.srv.otherRow({ id: 'ZZC2', session_id: 'ZZ-NOT-ON-THIS-PHONE', item_id: 'x' });
    await run(app);
    const k = known(app);
    t.ok(!!k.ZZC1, 'a photo of a job on this phone is now known to be in the cloud');
    t.eq(k.ZZC1 && k.ZZC1.s, String(sess.id), '…with its job');
    t.eq(k.ZZC1 && k.ZZC1.i, String(item.id), '…its item');
    t.eq(k.ZZC1 && k.ZZC1.b, 240000, '…its size');
    t.eq(k.ZZC1 && k.ZZC1.t, 1, '…and that it has a preview');
    t.ok(k.ZZC1 && typeof k.ZZC1.a === 'string', '…and when it was taken');
    t.notOk(k.ZZC2, 'a photo of a job NOT on this phone is not kept (R17)');
    t.ok(typeof syncState(app).ph.pulledAt === 'string', 'the photo rows have their own cursor');
    t.eq(app.srv.downloads().length, 0, 'no image and no preview came down on a run');
    t.notOk(app.state().photoMeta.ZZC1, 'nothing was added to the photo store');
  });

  /* ------------------------------------------------------------------ 26b */
  await t.group('26b — badges, the entry button and the jobs list count cloud photos (3A)', async () => {
    const app = await signedIn();
    const { sess, item } = await jobWithFail(app, 'ZZBADGE');
    app.srv.otherRow({ id: 'ZZB1', session_id: String(sess.id), item_id: String(item.id) });
    await run(app);
    t.eq(app.fn('photoCountForItemAll')(item.id), 1, 'the item counts its cloud photo');
    t.eq(app.fn('photoCloudOnlyCountForItem')(item.id), 1, '…as cloud-only');
    t.eq(app.fn('photoCountForItem')(item.id), 0, 'this phone holds none of them');
    app.fn('setView')('overview'); app.fn('render')();
    t.includes(app.html(), '📷 1 ☁', 'the Overview chip shows the cloud mark');
    app.fn('setView')('sessions'); app.fn('render')();
    t.includes(app.html(), '📷 1 (1 in cloud)', 'the jobs list shows photos after pass/fail');
    const pc = app.fn('photoCountsForSession')(sess);
    t.eq(pc.total, 1, 'job total'); t.eq(pc.cloud, 1, 'job cloud-only'); t.eq(pc.cloudBytes, 250000, 'job cloud-only size');

    // Signed out: this phone's photos only, and nothing on the card.
    app.run("state.cloud.status = 'signed-out'");
    t.eq(app.fn('photoCountForItemAll')(item.id), 0, 'signed out: cloud photos are not counted');
    app.fn('render')();
    t.excludes(app.html(), '📷 1', 'signed out: nothing on the card');
    app.run("state.cloud.status = 'signed-in'");
    // Another account's list, before its first run: never shown.
    app.run("state.photoCloudUser = 'someone-else'; state.photoCloudV++");
    t.eq(app.fn('photoCountForItemAll')(item.id), 0, 'a list belonging to another account is not shown');
  });

  /* ------------------------------------------------------------------ 26c */
  await t.group('26c — the strip: cloud tiles; previews come down only when it is opened, only if they exist', async () => {
    const app = await signedIn();
    const { sess, item } = await jobWithFail(app, 'ZZSTRIP');
    app.srv.otherRow({ id: 'ZZS1', session_id: String(sess.id), item_id: String(item.id), thumb: true, taken_at: '2026-09-28T09:00:00.000Z' });
    app.srv.otherRow({ id: 'ZZS2', session_id: String(sess.id), item_id: String(item.id), thumb: false, taken_at: '2026-09-28T09:01:00.000Z' });
    await run(app);
    t.eq(app.srv.downloads().length, 0, 'nothing downloaded before the strip is opened');
    tap(app, 'photo-strip-open', item.id);
    await tick(40);
    const tiles = app.state().photoStripPhotos;
    t.eq(tiles.length, 2, 'both cloud photos are tiles');
    t.ok(tiles.every(p => p.cloud), '…marked as in the cloud');
    const got = app.srv.downloads().map(c => c.url);
    t.eq(got.length, 1, 'exactly one preview fetched');
    t.includes(got[0], UID + '/ZZS1_t.jpg', '…the one that exists');
    t.notOk(got.some(u => u.includes('ZZS2')), 'no request for a photo without a preview, and no full image');
    t.ok(!!tiles.find(p => p.id === 'ZZS1').url, 'the preview is shown');
    const html = app.html();
    t.includes(html, 'data-action="photo-download"', 'a cloud tile downloads on a tap');
    t.includes(html, 'Download all (2', '"Download all" with the count');
    tap(app, 'photo-strip-close'); tap(app, 'photo-strip-open', item.id);
    await tick(40);
    t.eq(app.srv.downloads().length, 1, 'reopening costs nothing: the preview was kept');
  });

  /* ------------------------------------------------------------------ 26d */
  await t.group('26d — a tap downloads it; it keeps its id, counts as on the phone and never goes up again', async () => {
    const app = await signedIn();
    app.run('photoThumbBlob = () => Promise.resolve(null)');   // Node cannot decode an image; without this the 10 s guard in _syncThumbUpload is waited out for real (same outcome: no preview)
    const { sess, item } = await jobWithFail(app, 'ZZDL');
    app.srv.otherRow({ id: 'ZZD1', session_id: String(sess.id), item_id: String(item.id) });
    await run(app);
    tap(app, 'photo-strip-open', item.id); await tick(30);
    tap(app, 'photo-download', 'ZZD1'); await tick(60);
    t.ok(app.srv.downloads().some(c => c.url.includes(UID + '/ZZD1.jpg')), 'the full photo came down');
    const m = app.state().photoMeta.ZZD1;
    t.ok(!!m, 'it is in this phone\u2019s store under the SAME id');
    t.eq(m && m.i, String(item.id), '…against its item');
    t.eq(m && m.s, String(sess.id), '…and its job');
    t.eq(app.fn('photoCountForItem')(item.id), 1, 'counted as on the phone');
    t.eq(app.fn('photoCloudOnlyCountForItem')(item.id), 0, 'no longer cloud-only');
    const tile = app.state().photoStripPhotos.find(p => p.id === 'ZZD1');
    t.ok(tile && !tile.cloud, 'the strip now shows it as a photo on the phone');
    const upsBefore = app.srv.uploads().filter(c => c.url.includes('/ZZD1.jpg')).length;
    await run(app);
    t.eq(app.srv.uploads().filter(c => c.url.includes('/ZZD1.jpg')).length, upsBefore, 'the next run does not upload it back');
    t.notOk(app.srv.rowPosts().some(c => JSON.stringify(c.body).includes('ZZD1')), '…nor its row');
  });

  /* ------------------------------------------------------------------ 26e */
  await t.group('26e — no signal: nothing is attempted, and the engineer is told', async () => {
    const app = await signedIn();
    const { sess, item } = await jobWithFail(app, 'ZZOFF');
    app.srv.otherRow({ id: 'ZZO1', session_id: String(sess.id), item_id: String(item.id) });
    await run(app);
    tap(app, 'photo-strip-open', item.id); await tick(30);
    const toasts = [];
    app.sandbox.showToast = (m) => toasts.push(String(m));
    app.run('navigator.onLine = false');
    tap(app, 'photo-download', 'ZZO1'); await tick(30);
    t.eq(app.srv.downloads().filter(c => c.url.includes('ZZO1.jpg')).length, 0, 'no download attempted');
    t.includes(toasts.join(), 'No signal', 'a plain "no signal" message');
    t.notOk(app.state().photoMeta.ZZO1, 'nothing changed on the phone');
    t.ok(app.state().photoStripPhotos.find(p => p.id === 'ZZO1').cloud, 'the tile is still a cloud tile');
  });

  /* ------------------------------------------------------------------ 26f */
  await t.group('26f — deleted on the other phone: this phone\u2019s copy goes, quietly (nothing sent back)', async () => {
    const app = await signedIn();
    const { sess, item } = await jobWithFail(app, 'ZZRDEL');
    const row = app.srv.otherRow({ id: 'ZZR1', session_id: String(sess.id), item_id: String(item.id) });
    await run(app);
    await app.fn('syncPhotoDownload')(['ZZR1']); await tick(20);
    t.ok(!!app.state().photoMeta.ZZR1, 'downloaded first');
    Object.assign(row, { deleted: true, updated_at: app.srv.stamp() });
    const patchesBefore = app.srv.patches().length;
    await run(app);
    t.notOk(app.state().photoMeta.ZZR1, 'this phone\u2019s copy is removed');
    t.eq(app.fn('photoCountForItemAll')(item.id), 0, 'the item has no photos now');
    t.notOk(known(app).ZZR1, 'no longer known to be in the cloud');
    t.notOk(ledger(app).some(e => e.kind === 'photo' && e.id === 'ZZR1'), 'no ledger entry: the delete is already in the cloud');
    t.eq(app.srv.patches().length, patchesBefore, 'nothing is sent back');
    t.includes(app.state().sync.message, 'removed here', 'the run says so');
  });

  /* ------------------------------------------------------------------ 26g */
  await t.group('26g — deleting a cloud-only photo here deletes it in the cloud, preview and all (5A)', async () => {
    const app = await signedIn();
    const { sess, item } = await jobWithFail(app, 'ZZLDEL');
    app.srv.otherRow({ id: 'ZZL1', session_id: String(sess.id), item_id: String(item.id), thumb: true });
    app.srv.otherRow({ id: 'ZZL2', session_id: String(sess.id), item_id: String(item.id) });
    await run(app);
    tap(app, 'photo-strip-open', item.id); await tick(30);
    const asked = [];
    const real = app.sandbox.openConfirmSheet;
    app.sandbox.openConfirmSheet = (o) => { asked.push(String(o && o.message)); return real(o); };
    tap(app, 'photo-delete', 'ZZL1');
    t.includes(asked.join(), 'only in your cloud copy', 'the confirm says where it is');
    t.ok(confirmSheet(app), 'confirmed');
    t.notOk(app.state().photoStripPhotos.some(p => p.id === 'ZZL1'), 'the tile goes at once');
    t.ok(ledger(app).some(e => e.kind === 'photo' && e.id === 'ZZL1'), 'the delete is in the saved ledger');
    await run(app);
    t.eq(app.srv.tables.photos.find(r => r.id === 'ZZL1').deleted, true, 'the row is marked deleted');
    const prefixes = app.srv.removes().flatMap(c => (c.body && c.body.prefixes) || []);
    t.ok(prefixes.includes(UID + '/ZZL1.jpg'), 'the photo file is removed');
    t.ok(prefixes.includes(UID + '/ZZL1_t.jpg'), '…and its preview');
    t.notOk(known(app).ZZL1, 'forgotten once the delete landed');
    t.eq(app.srv.tables.photos.find(r => r.id === 'ZZL2').deleted, false, 'the other photo is untouched');
  });

  /* ------------------------------------------------------------------ 26h */
  await t.group('26h — deleting the item, or the job, takes photos the other phone uploaded (5A)', async () => {
    const app = await signedIn();
    const { sess, item } = await jobWithFail(app, 'ZZITEM');
    app.srv.otherRow({ id: 'ZZI1', session_id: String(sess.id), item_id: String(item.id) });
    await run(app);
    app.fn('deleteItem')(0);
    if (app.doc.getElementById('confirm-sheet-yes')) confirmSheet(app);
    await tick(30); app.stopTimer();
    await run(app);
    t.eq(app.srv.tables.photos.find(r => r.id === 'ZZI1').deleted, true, 'item deleted here → the other phone\u2019s photo of it is deleted');

    const j2 = await jobWithFail(app, 'ZZJOB');
    app.srv.otherRow({ id: 'ZZJ1', session_id: String(j2.sess.id), item_id: String(j2.item.id) });
    await run(app);
    app.fn('deleteSession')(j2.sess.id);
    if (app.doc.getElementById('confirm-sheet-yes')) confirmSheet(app);
    await tick(30); app.stopTimer();
    await run(app);
    t.eq(app.srv.tables.photos.find(r => r.id === 'ZZJ1').deleted, true, 'job deleted here → its photos from the other phone go too');
    t.notOk(app.srv.files.has(UID + '/ZZJ1.jpg'), '…file and all');
  });

  /* ------------------------------------------------------------------ 26i */
  await t.group('26i — a new photo goes up with its preview: photo, then preview, then the row (1A)', async () => {
    const app = await signedIn();
    app.run("photoThumbBlob = () => Promise.resolve(new Blob(['ZZTHUMB'], { type: 'image/jpeg' }))");
    const { sess, item } = await jobWithFail(app, 'ZZTHUP');
    const id = await app.run(`photoAdd(${JSON.stringify(sess.id)}, ${JSON.stringify(item.id)},
      { blob: new Blob(['ZZJPEG'.repeat(50)], { type: 'image/jpeg' }), w: 1280, h: 960, bytes: 300 })`);
    await tick(20); app.stopTimer();
    await run(app);
    const iPhoto = app.srv.calls.findIndex(c => c.method === 'POST' && c.url.includes('/' + id + '.jpg'));
    const iThumb = app.srv.calls.findIndex(c => c.method === 'POST' && c.url.includes('/' + id + '_t.jpg'));
    const iRow = app.srv.calls.findIndex(c => c.method === 'POST' && c.url.includes('/rest/v1/photos') && JSON.stringify(c.body).includes(id));
    t.ok(iPhoto !== -1, 'the photo went up');
    t.ok(iThumb > iPhoto, 'the preview after the photo');
    t.ok(iRow > iThumb, 'the row after both');
    t.eq(app.srv.tables.photos.find(r => r.id === id).thumb, true, 'the row says it has a preview');
    t.eq(known(app)[id].t, 1, 'remembered with its preview');

    // A preview that can't be made never holds the photo up.
    const app2 = await signedIn();
    app2.run('photoThumbBlob = () => Promise.resolve(null)');
    const j = await jobWithFail(app2, 'ZZTHNONE');
    const id2 = await app2.run(`photoAdd(${JSON.stringify(j.sess.id)}, ${JSON.stringify(j.item.id)},
      { blob: new Blob(['ZZJPEG'.repeat(50)], { type: 'image/jpeg' }), w: 1280, h: 960, bytes: 300 })`);
    await tick(20); app2.stopTimer();
    await run(app2);
    const r2 = app2.srv.tables.photos.find(r => r.id === id2);
    t.ok(!!r2, 'no preview: the photo and its row still go');
    t.eq(r2 && r2.thumb, false, '…saying there is no preview');
  });

  /* ------------------------------------------------------------------ 26j */
  await t.group('26j — photos already up without a preview get one later, from a phone holding the image', async () => {
    const app = await signedIn();
    app.run('photoThumbBlob = () => Promise.resolve(null)');   // as V88: none made
    const { sess, item } = await jobWithFail(app, 'ZZBACK');
    const id = await app.run(`photoAdd(${JSON.stringify(sess.id)}, ${JSON.stringify(item.id)},
      { blob: new Blob(['ZZJPEG'.repeat(50)], { type: 'image/jpeg' }), w: 1280, h: 960, bytes: 300 })`);
    await tick(20); app.stopTimer();
    await run(app);
    t.eq(app.srv.tables.photos.find(r => r.id === id).thumb, false, 'up without a preview');
    app.run("photoThumbBlob = () => Promise.resolve(new Blob(['ZZTHUMB'], { type: 'image/jpeg' })); _syncThumbGaveUp.clear()");
    await run(app);
    t.ok(app.srv.files.has(UID + '/' + id + '_t.jpg'), 'the preview is uploaded');
    t.ok(app.srv.patches().some(c => c.url.includes(id) && c.body && c.body.thumb === true), 'the row is updated to say so');
    t.eq(app.srv.tables.photos.find(r => r.id === id).thumb, true, 'row: thumb = true');
    t.eq(known(app)[id].t, 1, 'remembered');
    const before = app.srv.uploads().length;
    await run(app);
    t.eq(app.srv.uploads().length, before, 'not made again');
  });

  /* ------------------------------------------------------------------ 26k */
  await t.group('26k — a job arriving after the cursor passed its photo rows fetches them by job', async () => {
    const app = await signedIn();
    await jobWithFail(app, 'ZZHERE');                  // sets the cursors
    const jid = 'ZZ-ARRIVES-LATER';
    app.srv.otherRow({ id: 'ZZK1', session_id: jid, item_id: 'ZZK-ITEM' });
    await run(app);
    t.notOk(known(app).ZZK1, 'its job is not here yet: the row is not kept');
    app.srv.tables.sessions.push({ id: jid, user_id: UID, deleted: false, last_modified: '2026-09-29T09:00:00.000Z',
      updated_at: app.srv.stamp(),
      doc: { id: jid, site: 'ZZLATE', date: RECENT_DATE, items: [{ id: 'ZZK-ITEM', assetNo: 'K1', result: 'fail' }] } });
    await run(app);
    t.ok(app.state().sessions.some(s => s.id === jid), 'the job arrived');
    t.ok(app.srv.rowGets().some(c => /session_id=in\./.test(c.url) && c.url.includes(jid)), 'its photo rows were fetched by job');
    t.ok(!!known(app).ZZK1, 'and its photo is now known');
    t.eq(syncState(app).ph.need.length, 0, 'the list is emptied once read');

    // A phone that has never read the table reads it all, so no by-job fetch.
    const fresh = await signedIn();
    fresh.srv.tables.sessions.push({ id: jid, user_id: UID, deleted: false, last_modified: '2026-09-29T09:00:00.000Z',
      updated_at: fresh.srv.stamp(), doc: { id: jid, site: 'ZZLATE', date: RECENT_DATE, items: [{ id: 'ZZK-ITEM', assetNo: 'K1', result: 'fail' }] } });
    fresh.srv.otherRow({ id: 'ZZK2', session_id: jid, item_id: 'ZZK-ITEM' });
    // V94: wait for the photo mirror rather than trust signedIn()'s 5 ms — this
    // assertion flaked under a loaded full run (noted at V93). Same fix as 16i.
    for (let i = 0; i < 100 && !fresh.state().photoMetaReady; i++) await tick(5);
    await run(fresh);
    t.notOk(fresh.srv.rowGets().some(c => /session_id=in\./.test(c.url)), 'fresh phone: one full read, no by-job fetch');
    t.ok(!!known(fresh).ZZK2, 'and the photo is known');
  });

  /* ------------------------------------------------------------------ 26l */
  await t.group('26l — the certificate asks before building; Cancel stamps no number (4A)', async () => {
    const app = await signedIn();
    app.run('photoThumbBlob = () => Promise.resolve(null)');   // Node cannot decode an image; without this the 10 s guard in _syncThumbUpload is waited out for real (same outcome: no preview)
    const { sess, item } = await jobWithFail(app, 'ZZCERT');
    app.srv.otherRow({ id: 'ZZP1', session_id: String(sess.id), item_id: String(item.id), bytes: 1200000 });
    await run(app);
    app.run(`state.reportSettings.enabled = true; state.reportSettings.showPhotos = true; state.reportSettings.certEnabled = true;
      reportEngineReady = () => true; buildReportDoc = () => ({}); window.__built = 0; openReportPreview = () => { window.__built++; };
      // The stub Image never decodes, so the print re-encode would wait for ever;
      // the appendix is not what this group tests (a real browser always answers).
      collectReportPhotos = async (s) => _emptyPhotoData(s ? s.id : null);
      (() => { const o = _openSheet; _openSheet = function (a) { const r = o(a); window.__lastSheet = r.sheet; return r; }; })();`);
    let p = app.fn('produceReport')(sess.id);
    await tick(10);
    t.ok(!!app.doc.getElementById('rcp-download'), 'asked, with Download and continue');
    t.ok(!!app.doc.getElementById('rcp-without'), '…Without it');
    t.includes(app.run('window.__lastSheet.innerHTML'), 'only in the cloud (about 1.', 'the question names the size');
    app.doc.getElementById('rcp-cancel').click();
    await p; await tick(10);
    t.notOk(app.fn('activeSession')().certNo, 'Cancel: no certificate number used');
    t.eq(app.run('window.__built'), 0, 'Cancel: no report');

    p = app.fn('produceReport')(sess.id); await tick(10);
    app.doc.getElementById('rcp-download').click();
    await p; await tick(30);
    t.ok(app.srv.downloads().some(c => c.url.includes('/ZZP1.jpg')), 'Download: the photo came down first');
    t.ok(!!app.state().photoMeta.ZZP1, '…and stays on the phone');
    t.eq(app.run('window.__built'), 1, 'then the report was built');
    t.ok(!!app.fn('activeSession')().certNo, 'with its number');

    // Offline: no Download button to fail.
    app.srv.otherRow({ id: 'ZZP2', session_id: String(sess.id), item_id: String(item.id) });
    await run(app);
    app.run('navigator.onLine = false');
    p = app.fn('produceReport')(sess.id); await tick(10);
    // (The stub keeps ids registered after a sheet closes, so ask the sheet itself.)
    t.excludes(app.run('window.__lastSheet.innerHTML'), 'rcp-download', 'offline: Download is not offered');
    t.includes(app.run('window.__lastSheet.innerHTML'), 'no signal', '…and it says why');
    app.doc.getElementById('rcp-without').click();
    await p; await tick(10);
    t.eq(app.run('window.__built'), 2, 'Without them: the report is built');
    t.notOk(app.state().photoMeta.ZZP2, '…with nothing downloaded');
  });

  /* ------------------------------------------------------------------ 26m */
  await t.group('26m — the photo pager reads more than one page at the boundary stamp (rules 10, 14)', async () => {
    const app = await signedIn();
    const { sess, item } = await jobWithFail(app, 'ZZPAGE');
    const page = app.run('SYNC_PULL_PAGE');
    const a = '2026-09-29T12:00:00.000Z', b = '2026-09-29T12:00:01.000Z';
    for (let i = 0; i < page - 50; i++) app.srv.tables.photos.push({ id: 'ZZPG' + i, user_id: UID, session_id: String(sess.id), item_id: String(item.id), bytes: 1, deleted: false, thumb: false, updated_at: a });
    for (let i = page - 50; i < page + 50; i++) app.srv.tables.photos.push({ id: 'ZZPG' + i, user_id: UID, session_id: String(sess.id), item_id: String(item.id), bytes: 1, deleted: false, thumb: false, updated_at: b });
    await run(app);
    const k = known(app);
    const n = Object.keys(k).filter(id => id.startsWith('ZZPG')).length;
    t.eq(n, page + 50, 'every row across the page boundary is read, none stepped over');
    t.eq(syncState(app).ph.pulledAt, b, 'the cursor sits at the last stamp');
  });

  /* ------------------------------------------------------------------ 26n */
  t.group('26n — the stored list: extras kept when sound, dropped when not; the entry never lost', () => {
    const app = boot({});
    app.storage.setItem('pat:syncState', JSON.stringify({
      userId: 'u', hashV: app.run('SYNC_HASH_V'), pagerV: app.run('SYNC_PAGER_V'),
      ph: { sent: {
        good: { s: 'j', i: 'i', b: 1000, t: 1, a: '2026-09-28T09:00:00.000Z' },
        v88: { s: 'j', i: 'i' },
        junk: { s: 'j', i: 'i', b: 'big', t: 'yes', a: 'someday' },
        bad: { s: 1, i: 'i' },
      }, pulledAt: '2026-09-29T10:00:00.000Z', need: ['j1', 3, '', 'j2'] },
    }));
    const st = app.fn('_syncLoad')();
    t.eq(JSON.stringify(st.ph.sent.good), JSON.stringify({ s: 'j', i: 'i', b: 1000, t: 1, a: '2026-09-28T09:00:00.000Z' }), 'a sound entry keeps its extras');
    t.eq(JSON.stringify(st.ph.sent.v88), JSON.stringify({ s: 'j', i: 'i' }), 'a V88 entry loads unchanged');
    t.eq(JSON.stringify(st.ph.sent.junk), JSON.stringify({ s: 'j', i: 'i' }), 'odd extras are dropped, not the photo');
    t.notOk(st.ph.sent.bad, 'an entry without its job and item is dropped (as V88)');
    t.eq(st.ph.pulledAt, '2026-09-29T10:00:00.000Z', 'the cursor survives');
    t.eq(st.ph.need.join(), 'j1,j2', 'only job ids survive in the to-fetch list');
    const empty = app.fn('_syncEmpty')('u');
    t.ok(empty.ph.pulledAt === null && Array.isArray(empty.ph.need), 'a fresh state reads everything');
  });

  /* ------------------------------------------------------------------ 26o */
  await t.group('26o — the per-item cap counts cloud photos too', async () => {
    const app = await signedIn();
    const { sess, item } = await jobWithFail(app, 'ZZCAP');
    const cap = app.run('PHOTO_MAX_PER_ITEM');
    for (let i = 0; i < cap; i++) app.srv.otherRow({ id: 'ZZCAP' + i, session_id: String(sess.id), item_id: String(item.id) });
    await run(app);
    const id = await app.run(`photoAdd(${JSON.stringify(sess.id)}, ${JSON.stringify(item.id)},
      { blob: new Blob(['ZZJPEG'], { type: 'image/jpeg' }), w: 10, h: 10, bytes: 6 })`);
    t.eq(id, null, 'an item with the maximum in the cloud takes no more');
    tap(app, 'photo-strip-open', item.id); await tick(30);
    t.includes(app.html(), 'photo maximum reached', 'the strip says so');
  });

  /* ------------------------------------------------------------------ 26p */
  await t.group('26p — signed out, nothing about the cloud shows and nothing is fetched', async () => {
    const calls = [];
    const app = boot({ fetch: async (u) => { calls.push(String(u)); throw new Error('offline'); } });
    await tick(5);
    const sess = withSession(app, { site: 'ZZOUTLIST' });
    const item = withItem(app, { assetNo: 'ZZO1', result: 'fail' });
    await app.run(`photoAdd(${JSON.stringify(sess.id)}, ${JSON.stringify(item.id)},
      { blob: new Blob(['ZZJPEG'], { type: 'image/jpeg' }), w: 10, h: 10, bytes: 6 })`);
    await tick(20);
    app.fn('setView')('sessions'); app.fn('render')();
    t.includes(app.html(), '📷 1</span>', 'the jobs list shows this phone\u2019s photo count');
    t.excludes(app.html(), 'in cloud', 'with no cloud wording');
    t.eq(calls.length, 0, 'no network request');
  });

  /* ------------------------------------------------------------------ 26q */
  t.group('26q — SQL: the preview column; isolation checks for a real preview', () => {
    const schema = fs.readFileSync(path.join(APP_DIR, 'supabase', 'schema.sql'), 'utf8');
    t.ok(/alter table public\.photos add column if not exists thumb boolean not null default false/.test(schema), 'schema adds thumb, safe to re-run');
    const iso = fs.readFileSync(path.join(APP_DIR, 'supabase', 'isolation-test.sql'), 'utf8');
    t.includes(iso, "4e|B cannot read A''s real preview file", 'check 4e');
    t.includes(iso, "4f|control: A can read A''s own preview file", 'check 4f (its control)');
    t.ok(/real_a[\s\S]{0,400}not like '%\\_t\.jpg'/.test(iso), '4c\u2019s real photo is never a preview');
    const src = fs.readFileSync(path.join(APP_DIR, 'sync.js'), 'utf8');
    t.includes(src, "uid + '/' + id + '_t.jpg'", 'previews sit in the owner\u2019s folder (the same storage policy)');
  });
};
