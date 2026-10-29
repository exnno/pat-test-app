/* Standing test — V146: the field bug-fix release
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID (Peter, 28 Oct: 0A 1A 2A 3A 4A 5A 6A 8A; 7 → V147,
   renumbering). Field reports, each fixed where it lives:
     1A  the photo manager named cloud photos' jobs only after "Look in the
         cloud" — now it reads their names (five fields, never a photo) as it
         opens; with no signal the heading says its name comes when connected.
     2A  "Lock job" on the "Already exported" popup — locks without opening.
     3A  Job settings showed the job's "Client — Site" text in one Site box —
         now two boxes, joined on Save; the client link follows the client.
     4A  iPhone predictive text adds a space after a picked word ("printer "),
         which emptied the suggestion list. Lists match with the ends trimmed
         and runs of spaces as one; the space BETWEEN words still counts.
     5A  the description box empties when tapped, like Location; left empty it
         puts back what was there (and the Quick Pick type stays lit). Empty on
         focus also means no list pops up under the finger ("kettle", 4A).
     8A  Copy last on a FAIL carries its notes (the fail reason); a pass still
         starts blank; readings and photos are never copied.
     6A  the tutorial box glides by transform, the card slides to a new end,
         a new step's words and a new screen fade in.

     85a  1A through the real taps and the real library against a stand-in
          server: the names read on open — what it asks, what it never asks,
          nothing remembered; offline; a deleted job; leaving drops it.
     85b  2A through the rendered button and #app's delegation.
     85c  3A: the two boxes, Save, the links, the Back guard's read, the site
          suggestions following the client.
     85d  4A the matching (and two-word descriptions unchanged); 5A through the
          handlers the browser calls.
     85e  8A through the rendered Copy last button; 6A. (Release checks: V146's
          retired at V147 → 86e.) */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { CANARY, freshApp, withSession, withItem, tick } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const LIB = read('supabase.umd.js');
const UID = '11111111-1111-1111-1111-111111111111';

// ---- a stand-in server (the shape group 27 uses) --------------------------
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
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
  let n = 0;
  const stamp = () => { n++; return '2026-10-28T10:00:' + String(n % 60).padStart(2, '0') + '.' + String(n).padStart(3, '0') + 'Z'; };
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    let body = null;
    if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    calls.push({ url: u, method, body });
    if (u.includes('/storage/v1/object/photos')) {
      if (method === 'GET') return new Response(new Blob(['ZZFILE'], { type: 'image/jpeg' }), { status: 200 });
      if (method === 'DELETE') return json([]);
      return json({ Key: 'photos/x', Id: 'x' });
    }
    const qs = u.split('?')[1] || '';
    for (const name of ['photos', 'sessions', 'records']) {
      if (!u.includes('/rest/v1/' + name)) continue;
      if (method === 'GET') return json(applyQuery(tables[name], qs));
      if (method === 'PATCH') return new Response(null, { status: 204 });
      for (const row of (Array.isArray(body) ? body : [body])) {
        if (!row) continue;
        const i = tables[name].findIndex(r => String(r.id) === String(row.id));
        const stored = Object.assign({}, i === -1 ? {} : tables[name][i], row, { updated_at: stamp() });
        if (i === -1) tables[name].push(stored); else tables[name][i] = stored;
      }
      return new Response(null, { status: 201 });
    }
    if (u.includes('/rest/v1/profiles')) return json([{ plan: 'trial', trial_ends_at: null }]);
    return json({ message: 'unexpected ' + u }, 404);
  };
  const is = (c, part, m) => c.url.includes(part) && (!m || c.method === m);
  return {
    calls, fetchImpl, tables,
    browseGets: () => calls.filter(c => is(c, '/rest/v1/photos', 'GET') && c.url.includes('order=id')),
    nameGets: () => calls.filter(c => is(c, '/rest/v1/sessions', 'GET') && /site(%3A|:)doc-%3E%3E/.test(c.url)),
    images: () => calls.filter(c => is(c, '/storage/v1/object/photos/', 'GET') && !c.url.includes('_t.jpg')),
  };
}
function storedSession() {
  return JSON.stringify({
    access_token: 'ZZACCESS', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'ZZREFRESH',
    user: { id: UID, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' },
  });
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
  for (let k = 0; k < 100 && app.run("(state.cloud && state.cloud.status) || ''") !== 'signed-in'; k++) await tick(10);
  app.stopTimer();
  app.run("photoThumbBlob = () => new Response('ZZTHUMB').blob()");
  return app;
}
async function until(pred, ms = 2000) { for (let k = 0; k < ms / 10 && !pred(); k++) await tick(10); }
async function run(app) { const r = await app.fn('syncPush')({ pull: true }); app.stopTimer(); await tick(30); return r; }
async function addPhotos(app, sess, item, n, tag) {
  for (let i = 0; i < n; i++) {
    await app.run(`photoAdd(${JSON.stringify(sess.id)}, ${JSON.stringify(item.id)},
      { blob: new Blob(['ZZJPEG${tag || ''}${i}'.repeat(50)], { type: 'image/jpeg' }), w: 1280, h: 960, bytes: 400 })`);
    await tick(10);
  }
  app.stopTimer();
}
// A job off this phone, its photos still known to be in the cloud — the state
// "Remove from this phone" leaves (V80 C: recorded as cleared, not deleted).
function offPhone(app, id) {
  const st = app.state();
  st.sessions = st.sessions.filter(s => String(s.id) !== String(id));
  if (st.activeId === id) st.activeId = null;
  const cur = JSON.parse(app.storage.getItem('pat:syncPruned') || '[]');
  app.storage.setItem('pat:syncPruned', JSON.stringify(cur.concat([{ id, at: new Date().toISOString() }])));
  for (const pid of Object.keys(st.photoMeta || {})) if (String(st.photoMeta[pid].s) === String(id)) delete st.photoMeta[pid];
  st.photoMetaV = (st.photoMetaV || 0) + 1;
  app.fn('save')();
}

// A tap exactly as the browser delivers it, through #app's delegation.
function tap(app, action, arg) {
  const el = app.doc.createElement('button');
  el.dataset.action = action;
  if (arg !== undefined) el.dataset.arg = String(arg);
  app.doc.getElementById('app').dispatchEvent({
    type: 'click', target: el, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
  });
}
// Typing, as the browser delivers it, through #app's input delegation.
function type(app, action, value) {
  const el = app.doc.createElement('input');
  el.dataset.inputAction = action;
  el.value = value;
  app.doc.getElementById('app').dispatchEvent({ type: 'input', target: el, preventDefault() {}, stopPropagation() {} });
}
// The action on the rendered element with this id (the V67 lesson: the tap is
// read off the screen, never named by the test).
function actionOf(html, id) {
  const m = html.match(new RegExp(`id="${id}"[^>]*data-action="([^"]+)"`));
  return m ? m[1] : null;
}

module.exports = async function () {

  /* ------------------------------------------------------------------ 85a */
  await t.group('85a — 1A: the photo manager names a job not on this phone as it opens (nothing remembered)', async () => {
    const app = await signedIn();
    // A job on the phone, and one whose photos went up before it came off it.
    const here = withSession(app, { site: 'ZZHERE' });
    const hereItem = withItem(app, { assetNo: 'ZZH-1', result: 'fail' });
    await addPhotos(app, app.fn('activeSession')(), hereItem, 1, 'here');
    const away = withSession(app, { site: 'ZZAWAY' });
    const awayItem = withItem(app, { assetNo: 'ZZA-1', result: 'fail' });
    await addPhotos(app, app.fn('activeSession')(), awayItem, 2, 'away');
    for (let k = 0; k < 4; k++) await run(app);   // photos go up a few a run
    const knownAway = () => Object.values(app.state().photoCloud || {}).filter(e => String(e.s) === String(away.id)).length;
    t.eq(knownAway(), 2, '(both of the away job’s photos are known to be in the cloud)');
    offPhone(app, away.id);
    t.notOk(app.state().sessions.some(s => String(s.id) === String(away.id)), '(the job really is off this phone)');

    const knownBefore = JSON.stringify(app.state().photoCloud);
    const names0 = app.srv.nameGets().length;
    tap(app, 'pm-open');
    await until(() => !!(app.state().photoMgr.names && app.state().photoMgr.names.ok));
    app.stopTimer(); await tick(20);
    t.eq(app.state().view, 'photoManager', 'the manager opens');
    t.eq(app.srv.nameGets().length - names0, 1, 'opening read the away job’s name — once');
    const q = decodeURIComponent(app.srv.nameGets().slice(-1)[0].url);
    t.includes(q, 'site:doc->>site', '…picked out of the job row');
    t.notOk(/select=[^&]*(^|,)doc(,|&|$)/.test(q), '…the job document itself never comes down');
    t.includes(q, String(away.id), '…for the job off this phone');
    t.excludes(q, String(here.id), '…never for a job on this phone');
    t.includes(q, 'user_id=eq.' + UID, '…this account only');
    t.eq(app.srv.browseGets().length, 0, 'the whole cloud look is still a tap (3A, R17)');
    t.eq(app.srv.images().length, 0, 'no photo came down');
    const g = app.fn('photoMgrModel')().allGroups.find(x => x.key === String(away.id));
    t.ok(!!g && !g.onPhone, 'the away job’s photos are shown');
    t.includes(g && g.title, 'ZZAWAY', '…under its own name');
    t.notOk(g && g.unnamed, '…named, not "a job not on this phone"');
    t.eq(g && g.photos.length, 2, '…both photos');
    t.includes(app.html(), 'ZZAWAY', 'the screen shows the name');
    t.excludes(app.html(), 'A job not on this phone', 'and not the old heading');
    t.eq(JSON.stringify(app.state().photoCloud), knownBefore, 'nothing read is remembered (rule 24)');

    // Leaving drops it.
    tap(app, 'pm-back'); await tick(5);
    t.eq(app.state().photoMgr.names, null, 'leaving the screen drops the names');

    // No signal: nothing asked; the heading says when the name comes.
    app.run('navigator.onLine = false');
    const names1 = app.srv.nameGets().length;
    tap(app, 'pm-open'); await tick(30);
    t.eq(app.srv.nameGets().length, names1, 'no signal: nothing is asked');
    const g2 = app.fn('photoMgrModel')().allGroups.find(x => x.key === String(away.id));
    t.ok(!!g2 && g2.unnamed, 'the job is unnamed');
    t.eq(g2 && g2.title, 'A job not on this phone', '…with the old heading');
    t.includes(app.html(), 'its name shows when you’re connected', '…which says its name comes with signal');
    tap(app, 'pm-back'); await tick(5);

    // A job deleted in the cloud since: its photos have no job (5A, as the look).
    app.run('navigator.onLine = true');
    const row = app.srv.tables.sessions.find(r => String(r.id) === String(away.id));
    t.ok(!!row, '(the cloud holds the job)');
    if (row) row.deleted = true;
    tap(app, 'pm-open');
    await until(() => !!(app.state().photoMgr.names && app.state().photoMgr.names.ok));
    app.stopTimer(); await tick(20);
    const orph = app.fn('photoMgrModel')().allGroups.find(x => x.orphan);
    t.ok(!!orph && orph.photos.length === 2, 'a job deleted in the cloud: its photos are "Photos with no job"');
  });

  /* ------------------------------------------------------------------ 85b */
  await t.group('85b — 2A: Lock job on the "Already exported" popup', () => {
    const app = boot({});
    const sess = withSession(app, { site: 'ZZLOCKME' });
    withItem(app, { assetNo: 'ZZL-1' });
    sess.exportedAt = new Date().toISOString();
    sess.exportDirty = false;
    app.fn('save')();
    app.fn('setView')('sessions');
    const before = app.state().activeId;
    const statusBefore = app.fn('exportStatus')(sess);
    app.fn('requestOpenSession')(sess.id);
    let html = app.html();
    t.includes(html, 'Already exported', 'the popup is up');
    t.includes(html, 'Lock job', 'it offers Lock job');
    const act = actionOf(html, 'reopen-warn-lock');
    t.eq(act, 'reopen-lock', 'the button is wired to its action');
    tap(app, act || 'reopen-lock');
    const s = app.state().sessions.find(x => x.id === sess.id);
    t.ok(s.locked, 'the job is locked');
    t.ok(typeof s.lockedAt === 'string' && !isNaN(Date.parse(s.lockedAt)), '…with its lock time (V100)');
    t.eq(app.state().exportWarnSessionId, null, 'the popup closes');
    html = app.html();
    t.excludes(html, 'id="reopen-warn-lock"', '…and is gone from the screen');
    t.eq(app.state().view, 'sessions', 'still on the Jobs list — not opened');
    t.eq(app.state().activeId, before, '…the job wasn’t opened');
    t.ok(app.toasts.includes('Job locked'), 'it says so');
    t.eq(statusBefore, 'exported', '(it was exported)');
    t.eq(app.fn('exportStatus')(s), statusBefore, 'the export mark is untouched');
    // Saved: a fresh load still has it locked.
    app.fn('load')();   // read back from storage, as a restart does
    const s2 = (app.state().sessions || []).find(x => x.id === sess.id);
    t.ok(s2 && s2.locked, 'saved: the lock survives a restart');
    // Locked now, the job opens without the popup.
    app.fn('requestOpenSession')(sess.id);
    t.eq(app.state().exportWarnSessionId, null, 'a locked job opens without the popup');
  });

  /* ------------------------------------------------------------------ 85c */
  await t.group('85c — 3A: Job settings has Client and Site boxes, joined on Save', () => {
    const app = boot({});
    const other = app.fn('ensureClient')('ZZOTHERCLIENT');
    app.fn('ensureSite')(other.id, 'ZZOTHERSITE');
    const sess = withSession(app, { client: CANARY.client, site: 'ZZSITEA' });
    t.eq(sess.site, CANARY.client + ' — ZZSITEA', '(the job holds "Client — Site")');
    app.fn('startEditSession')();
    const f = app.state().editForm;
    t.eq(f.client, CANARY.client, 'the client in its own box');
    t.eq(f.site, 'ZZSITEA', '…and the site in its own — not the two combined');
    t.notOk(app.fn('editFormDirty')(sess), 'untouched, nothing to save');
    const html = app.html();
    t.ok(/id="ef-client"[^>]*value="ZZCANARYCLIENT"/.test(html), 'the Client box shows the client');
    t.ok(/id="ef-site"[^>]*value="ZZSITEA"/.test(html), 'the Site box shows only the site');
    t.ok(html.indexOf('id="ef-client"') < html.indexOf('id="ef-site"'), 'Client comes first, as on the New Job form');
    t.includes(html, '<datalist id="ef-client-list"><option value="ZZCANARYCLIENT"></option>', 'the client suggestions');
    t.includes(html, '<option value="ZZOTHERCLIENT"></option>', '…every saved client');
    t.ok(/<datalist id="ef-site-list">[^]*ZZSITEA[^]*<\/datalist>/.test(html), 'the site suggestions are the client’s');
    t.notOk(/<datalist id="ef-site-list">[^<]*(<option[^>]*><\/option>)*[^<]*<option value="ZZOTHERSITE">/.test(html.slice(html.indexOf('<datalist id="ef-site-list">'), html.indexOf('</datalist>', html.indexOf('<datalist id="ef-site-list">')))), '…not another client’s');

    // Typing a client: the site suggestions follow it, in place.
    type(app, 'ef-client', 'ZZOTHERCLIENT');
    t.eq(app.state().editForm.client, 'ZZOTHERCLIENT', 'typing a client goes in the draft');
    const dl = app.doc.getElementById('ef-site-list');
    t.ok(dl && /ZZOTHERSITE/.test(dl.innerHTML) && !/ZZSITEA/.test(dl.innerHTML), 'the site suggestions are now that client’s');

    // The Back guard reads both boxes off the page. The draft is put back
    // first, so only the page's box can bring the new client in (M1581: the
    // typing above had already set it — the read proved nothing).
    app.state().editForm.client = CANARY.client;
    app.doc.getElementById('ef-client').value = 'ZZOTHERCLIENT';
    app.doc.getElementById('ef-site').value = 'ZZOTHERSITE';
    app.fn('captureEditSessionForm')();
    t.eq(app.state().editForm.client, 'ZZOTHERCLIENT', 'the page’s client box is read');
    t.ok(app.fn('editFormDirty')(sess), 'a changed client is a change');
    app.fn('saveSessionEdits')();
    let s = app.fn('activeSession')();
    t.eq(s.site, 'ZZOTHERCLIENT — ZZOTHERSITE', 'Save joins them back, as a new job is built');
    t.eq(s.clientId, other.id, 'the client link follows the client');
    t.eq(s.siteId, app.fn('findSiteByName')(other.id, 'ZZOTHERSITE').id, '…and the site link the site (V98)');

    // A client that isn't saved: this job only — the Clients list unchanged.
    const nClients = app.state().clients.length;
    app.fn('startEditSession')();
    app.state().editForm.client = 'ZZNEWCLIENT';
    app.state().editForm.site = 'ZZNEWSITE';
    app.fn('saveSessionEdits')();
    s = app.fn('activeSession')();
    t.eq(s.site, 'ZZNEWCLIENT — ZZNEWSITE', 'a new client and site go on this job');
    t.eq(s.clientId, '', '…with no client link');
    t.eq(app.state().clients.length, nClients, '…and nothing is added to the Clients list');

    // No client: just the site, as a site-only job is.
    app.fn('startEditSession')();
    app.state().editForm.client = '';
    app.state().editForm.site = 'ZZLONE';
    app.fn('saveSessionEdits')();
    t.eq(app.fn('activeSession')().site, 'ZZLONE', 'no client: just the site');
    app.fn('startEditSession')();
    t.eq(app.state().editForm.client, '', 'a site-only job opens with an empty Client box');
    t.eq(app.state().editForm.site, 'ZZLONE', '…and its site');

    // The site is still required.
    app.state().editForm.client = 'ZZOTHERCLIENT';
    app.state().editForm.site = '  ';
    app.fn('saveSessionEdits')();
    t.ok(app.toasts.includes('Site is required'), 'no site: Save says so');
    t.eq(app.fn('activeSession')().site, 'ZZLONE', '…and nothing changes');
  });

  /* ------------------------------------------------------------------ 85d */
  await t.group('85d — 4A the lists ignore a stray space (two-word descriptions unchanged); 5A the box clears on tap', () => {
    const app = boot({});
    withSession(app, { site: 'ZZSUGG' });
    const st = app.state();
    st.descriptions = ['Printer', 'Printer/Scanner', 'Label Printer', 'Kettle Base', 'Kettle Lead'];
    st.itemTypes = ['Kettle', 'Lead', 'Monitor'];
    const cs = (q) => app.fn('computeSuggestions')(q);
    t.eq(app.fn('suggestKey')('  Kettle   Base '), 'kettle base', 'the key: lower case, ends trimmed, runs of spaces as one');
    t.ok(cs('printer').length > 0, '"printer" finds the printers');
    t.deepEq(cs('printer '), cs('printer'), '"printer " (iPhone’s space) finds exactly the same');
    t.deepEq(cs(' printer'), cs('printer'), '…and a leading space too');
    t.deepEq(cs('kettle b'), ['Kettle Base'], 'the space between words still counts: "kettle b" → Kettle Base only');
    t.deepEq(cs('kettle  b'), ['Kettle Base'], '…a doubled space is one');
    t.deepEq(cs('kettleb'), [], '…and no space is not a space');
    t.deepEq(cs('label print'), ['Label Printer'], 'a two-word description is found by its two words');
    t.deepEq(cs('   '), [], 'spaces alone: no list');
    // Location, client and site lists match the same way.
    withItem(app, { assetNo: 'ZZS-1', location: 'Kitchen' });
    withItem(app, { assetNo: 'ZZS-2', location: 'Main Office' });
    t.deepEq(app.fn('computeLocationSuggestions')('kitchen '), ['Kitchen'], 'location: "kitchen " finds Kitchen');
    t.deepEq(app.fn('computeLocationSuggestions')('main  off'), ['Main Office'], 'location: a doubled space is one');
    t.ok(app.fn('computeNfClientSuggestions')(CANARY.client.toLowerCase() + ' ').includes(CANARY.client), 'client: a trailing space still finds it');
    t.ok(app.fn('computeNfSiteSuggestions')('zzsugg ').includes('ZZSUGG'), 'site: a trailing space still finds it');

    // 5A — through the handlers the browser calls (bindFocusFields wires them).
    const inp = app.doc.register('f-type', 'input');
    app.fn('bindFocusFields')();
    t.eq(typeof inp.onfocus, 'function', 'the description box is wired for focus');
    st.form.itemType = 'Kettle';
    inp.value = 'Kettle';
    inp.onfocus({ target: inp });
    t.eq(inp.value, '', 'tapping the box empties it, like Location');
    t.eq(app.state().form.itemType, 'Kettle', '…the Quick Pick type is still chosen');
    t.notOk(app.state().showSuggestions, '…and no list pops up under the finger');
    inp.onblur({ target: inp });
    t.eq(inp.value, 'Kettle', 'tapping away with it empty puts it back');
    t.eq(app.state().form.itemType, 'Kettle', '…unchanged');
    // Type, delete it all, tap away: what was there comes back, in state too.
    inp.onfocus({ target: inp });
    inp.value = 'ket'; inp.oninput({ target: inp });
    t.eq(app.state().form.itemType, 'ket', '(typing goes in as it always did)');
    inp.value = ''; inp.oninput({ target: inp });
    inp.onblur({ target: inp });
    t.eq(inp.value, 'Kettle', 'typed then deleted: tapping away puts it back');
    t.eq(app.state().form.itemType, 'Kettle', '…in the form too');
    // A typed word replaces it (casing as before).
    inp.onfocus({ target: inp });
    inp.value = 'label printer'; inp.oninput({ target: inp });
    inp.onblur({ target: inp });
    t.eq(app.state().form.itemType, 'Label Printer', 'a typed description replaces it, cased on the way out');
    // A description typed and left (not logged): tapping again clears for a new word.
    inp.onfocus({ target: inp });
    t.eq(inp.value, '', 'tapping again clears it for the next word');
    inp.onblur({ target: inp });
    t.eq(inp.value, 'Label Printer', '…and it comes back if nothing is typed');
  });

  /* ------------------------------------------------------------------ 85e */
  await t.group('85e — 8A Copy last carries a fail’s reason; 6A the tutorial motion', async () => {
    // ---- 8A, through the rendered Copy last button.
    const app = boot({});
    withSession(app, { site: 'ZZCOPY' });
    withItem(app, { assetNo: 'ZZC-1', itemType: 'Kettle', notes: 'Lead damaged', result: 'fail' });
    const st = app.state();
    st.view = 'entry';
    st.form.location = 'Kitchen';
    st.form.assetNo = '';
    app.fn('render')();
    const act = actionOf(app.html(), 'copy-last-btn');
    t.eq(act, 'copy-last', 'Copy last is on the screen, wired');
    tap(app, act || 'copy-last');
    let items = app.fn('activeSession')().items;
    let copy = items[items.length - 1];
    t.eq(items.length, 2, 'Copy last logged a copy');
    t.eq(copy.result, 'fail', '…a fail');
    t.eq(copy.notes, 'Lead damaged', '…with the fail’s reason');
    t.notOk('readings' in copy, '…and no readings (they belong to the item)');
    withItem(app, { assetNo: 'ZZC-3', itemType: 'Lamp', notes: 'Cable tidied', result: 'pass' });
    app.state().form.location = 'Kitchen';
    app.state().form.assetNo = '';
    app.fn('render')();
    tap(app, actionOf(app.html(), 'copy-last-btn') || 'copy-last');
    items = app.fn('activeSession')().items;
    copy = items[items.length - 1];
    t.eq(copy.result, 'pass', 'copying a pass…');
    t.eq(copy.notes, '', '…still starts with blank notes');

    // ---- 6A: the card slides to a new end; same end, it stays; reduced motion, nothing moves.
    const tut = boot({});
    tut.fn('openPractice')('sessions');
    const card = tut.doc.createElement('div');
    tut.run('_tut.cardEnd = "bottom"');
    tut.sandbox.__card = card;
    tut.run('_tutCardAt(__card, "top")');
    t.ok(card.classList.contains('tut-card-top') && !card.classList.contains('tut-card-bottom'), 'the card goes to the top');
    t.eq(card.style.opacity, '0', 'a new end: it starts hidden…');
    t.includes(card.style.transform, 'translateY(-' + tut.run('TUT_SLIDE_PX') + 'px)', '…just above its place (sliding down from the top)');
    await tick(30);
    t.eq(card.style.opacity, '1', '…then fades in');
    t.eq(card.style.transform, 'translateX(-50%)', '…and slides into place');
    t.includes(card.style.transition, 'opacity ' + tut.run('TUT_CARD_MS') + 'ms', '…over TUT_CARD_MS');
    t.eq(tut.run('_tut.cardSlid'), tut.run('state.tourStep'), 'the step knows its card slid (its words don’t fade twice)');
    card.style.transition = 'ZZSTILL';
    tut.run('_tutCardAt(__card, "top")');
    t.eq(card.style.transition, 'ZZSTILL', 'the same end again: the card stays put');
    const calm = boot({ matchMedia: { '(prefers-reduced-motion: reduce)': true } });
    calm.fn('openPractice')('sessions');
    const card2 = calm.doc.createElement('div');
    calm.sandbox.__card = card2;
    calm.run('_tut.cardEnd = "bottom"; _tutCardAt(__card, "top")');
    t.ok(card2.classList.contains('tut-card-top'), 'reduced motion: the card still goes to its end');
    t.eq(card2.style.opacity || '', '', '…but nothing fades or slides');
    const tourSrc = read('tour.js');
    t.includes(tourSrc, "ring.style.transform = 'translate3d(' + Math.round(r.left - pad) + 'px, ' + Math.round(r.top - pad) + 'px, 0)';", 'the box is placed by transform');
    t.excludes(tourSrc, 'ring.style.top =', '…never by top/left (the whole dimmed screen redrew every frame)');
    t.includes(tourSrc, "if (newScreen) _tutFadeIn(document.getElementById('tut-practice'), 'none', 'none', TUT_SCREEN_MS);", 'a new screen fades up');
    t.includes(tourSrc, "if (_tut.shownStep != null && _tut.cardSlid !== state.tourStep) {", 'a step’s words fade in when its card stayed put');
    t.includes(tourSrc, 'void el.offsetHeight;', 'fades start from a drawn first frame (the skill’s iOS rule)');
    const css = read('styles.css');
    t.includes(css, '  will-change: transform;\n  transition: transform 350ms', 'the box is its own layer');

    // ---- release: V146's checks retired at V147 → 86e.
  });
};
