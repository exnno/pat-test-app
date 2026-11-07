/* Standing test — V152: saved data that can't be read (audit finding 1)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   Peter, 6 Nov — 1C (every stored key) 2B (set it aside — copied, checked, then
   moved off its key — and start; when that can't be done safely, stop on its own
   screen). Before V152 an unreadable value read as "nothing stored": PATGo opened
   as a new phone and the next save wrote over the real data — signed in, with no
   tap at all (the pull / retest look saves a few seconds after start). What
   these pin:
     91a  Every stored key is classified (JSON with its shape / text / not ours),
          and a normal phone sets NOTHING aside: a busy phone, a signed-in one,
          blank and 'null' values, old plain-list jobs and compressed jobs.
     91b  Unreadable values (broken JSON, the wrong shape, a job that isn't an
          object, an unknown codec) are copied byte for byte, the copy checked,
          and only then moved off their key; PATGo starts; every later save —
          logging, settings, a second start — leaves the copy byte-identical.
     91c  The automatic write: signed in, the pull brings a job down and saves —
          the kept copy is still byte-identical (the path the audit named).
     91d  2B's fallback: no room for a copy, an earlier different copy, a value
          that won't move — nothing changed, nothing left half-done, save() and
          render() neutralised, the stop screen's Save a copy holds the bytes.
          load() refuses unreadable jobs by itself (the backstop).
     91e  Release: V152, cache pat-v152 (the label reads it), About V152 / V151 /
          V150, What's new not rolled (still V150's).
     91f  What the engineer sees: the Jobs banner (phone tab only; Show me, ×),
          the Backup page section (words, Save a copy, Delete), Reset and a
          takeover clear the copies, a backup never carries them.

   ⚠ WHAT THIS FILE CANNOT PROVE: how a real iPhone behaves when its storage is
   genuinely full (the harness throws on demand), and how the stop screen looks
   — that is the browser check (headless Chrome, V152 handoff). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { populated, freshApp, withSession, withItem, tick } = require('../fixture');
const archive = require('./30-cloud-archive');

const LIB  = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const UID  = '11111111-1111-1111-1111-111111111111';
const AUTH = 'patgo:cloudAuth:test';
const P    = 'pat:unreadable:';

// Broken jobs as a phone could hold them: a cut-off write, the wrong shape, a
// job that isn't an object, a codec this PATGo doesn't know.
const BAD_JOBS = '{"_c":1,"s":[{"i":"ZZREAL1","n":"Real job","it":[{"a":"A1"}]}';
const BAD_SHAPES = {
  'cut off':          BAD_JOBS,
  'not JSON':         'ZZ not json at all',
  'an object':        '{"v":99}',
  'a list of numbers':'[1,2,3]',
  'unknown codec':    '{"_c":7,"s":[{"i":"x"}]}',
  'a job that is null': '{"_c":1,"s":[null]}',
};

function storedSession() {
  return JSON.stringify({
    access_token: 'ZZACCESS152', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'ZZREFRESH',
    user: { id: UID, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' },
  });
}

// Boot with a seeded phone; `before` runs on the storage BEFORE boot.js does.
function bootWith(ls, before) {
  const app = bootApp({ localStorage: ls || {}, runBoot: false });
  if (before) before(app);
  app.run(read('boot.js'));
  app.state = () => app.refresh('state').state;
  app.html = () => app.doc.getElementById('app').innerHTML;
  return app;
}

// A busy phone's whole localStorage, as a plain object (for a reboot).
function dump(app) {
  const out = {};
  const ls = app.storage;
  for (let i = 0; i < ls.length; i++) { const k = ls.key(i); out[k] = ls.getItem(k); }
  return out;
}

function keysWith(app, prefix) {
  const out = [];
  const ls = app.storage;
  for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k.indexOf(prefix) === 0) out.push(k); }
  return out.sort();
}

function tap(app, action, arg) {
  const el = app.doc.createElement('button');
  el.dataset.action = action;
  if (arg !== undefined) el.dataset.arg = String(arg);
  app.doc.getElementById('app').dispatchEvent({
    type: 'click', target: el, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
  });
}

// Files the app hands over (an <a download> and the Blob behind it).
function catchFiles(app) {
  const got = { anchors: [], blobs: [] };
  const urlObj = app.sandbox.URL;
  const realCreate = urlObj.createObjectURL;
  urlObj.createObjectURL = (b) => { got.blobs.push(b); return realCreate.call(urlObj, b); };
  const realEl = app.doc.createElement;
  app.doc.createElement = (tag) => { const el = realEl.call(app.doc, tag); if (tag === 'a') got.anchors.push(el); return el; };
  return got;
}

async function signedInWith(ls) {
  const srv = archive.fakeServer();
  const app = bootWith(Object.assign({ [AUTH]: storedSession(), 'pat:cloudUnlocked': '1' }, ls || {}), (a) => {
    a.run('navigator.onLine = false');
  });
  const sb = app.sandbox;
  for (const k of ['Headers', 'Request', 'Response', 'AbortController', 'TextEncoder',
                   'TextDecoder', 'URLSearchParams', 'URL', 'atob', 'btoa']) sb[k] = globalThis[k];
  if (!sb.crypto) sb.crypto = globalThis.crypto;
  sb.WebSocket = class {};
  sb.fetch = srv.fetchImpl;
  app.run(LIB);
  app.run('navigator.onLine = true');
  app.srv = srv;
  app.stopTimer = () => app.run('if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }');
  app.stopTimer();
  for (let k = 0; k < 100 && app.run("(state.cloud && state.cloud.status) || ''") !== 'signed-in'; k++) await tick(10);
  app.stopTimer();
  return app;
}

module.exports = async function () {

  /* ------------------------------------------------------------------ 91a */
  await t.group('91a — every stored key is classified; a normal phone sets nothing aside', () => {
    const app = freshApp();
    const plan = app.run('RESET_KEY_PLAN').map(r => r[0]);
    const json = app.run('STORE_JSON').map(r => r[0]);
    const text = app.run('STORE_TEXT');
    const other = app.run('STORE_OTHER');
    const all = json.concat(text, other);
    t.deepEq(plan.filter(k => all.indexOf(k) === -1), [], 'every key in RESET_KEY_PLAN is classified (a new key must be)');
    t.deepEq(all.filter(k => plan.indexOf(k) === -1), [], '…and nothing classified that isn’t a real key');
    t.eq(all.length, new Set(all).size, 'no key in two lists');
    t.ok(app.run('STORE_JSON.every(r => r[1] === globalThis.eval(r[0]))'), 'every JSON row carries its constant’s live value');
    t.ok(app.run("STORE_JSON.every(r => ['sessions', 'array', 'object'].includes(r[2]) && typeof r[3] === 'string' && r[3])"), 'every JSON row has a shape and plain words');

    // The writers agree with the lists: JSON keys are written as JSON, text keys never.
    const src = fs.readdirSync(APP_DIR).filter(f => /\.js$/.test(f) && !/\.min\.js$|^supabase\.umd\.js$|^pdfjs/.test(f))
      .map(f => read(f)).join('\n');
    const writesJson = (k) => new RegExp('setItem\\(\\s*' + k + '\\s*,\\s*(JSON\\.stringify|serialiseSessions)').test(src);
    t.deepEq(text.filter(writesJson), [], 'no text key is ever written as JSON');
    t.deepEq(json.filter(k => k !== 'ITEMS_KEY' && !writesJson(k)), [], 'every JSON key (bar the legacy item list, never written now) is written as JSON');

    // A busy phone: nothing unreadable, nothing set aside, on save and on restart.
    const busy = populated();
    busy.fn('save')();
    t.deepEq(busy.run('storeUnreadableKeys().map(b => b.key)'), [], 'a busy phone: every stored value reads');
    const again = bootWith(dump(busy));
    t.deepEq(keysWith(again, P), [], 'restarted: nothing set aside');
    t.eq(again.state().sessions.length, busy.run('state.sessions.length'), '…and every job loaded');
    t.eq(again.storage.getItem('pat:unreadable'), null, '…and no note');

    // Blank and 'null' are "nothing stored", never unreadable.
    const blank = bootWith({ 'pat:sessions': '', 'pat:clients': 'null', 'pat:reportsettings': 'null', 'pat:instruments': '' });
    t.deepEq(keysWith(blank, P), [], 'blank and null values: nothing set aside');
    t.eq(blank.state().sessions.length, 0, '…an empty phone, as before');

    // Old plain-list jobs (v13) and compressed jobs both load.
    const legacy = bootWith({ 'pat:sessions': JSON.stringify([{ id: 'ZZOLD1', name: 'Old job', items: [{ id: 'i1', assetNo: 'A1', result: 'pass' }] }]) });
    t.deepEq(keysWith(legacy, P), [], 'old plain-list jobs: nothing set aside');
    t.eq(legacy.state().sessions.length && legacy.state().sessions[0].id, 'ZZOLD1', '…and they load');
    const compressed = bootWith({ 'pat:sessions': JSON.stringify({ _c: 1, s: [{ i: 'ZZNEW1', n: 'New job', it: [{ i: 'i1', a: 'A1', r: 'pass' }] }] }) });
    t.deepEq(keysWith(compressed, P), [], 'compressed jobs: nothing set aside');
    t.eq(compressed.state().sessions.length && compressed.state().sessions[0].id, 'ZZNEW1', '…and they load');

    // A signed-in phone's account and sync records read too.
    const acct = freshApp();
    for (const [k, v] of [['pat:syncState', '{"userId":"u","sent":{}}'], ['pat:syncPruned', '[]'], ['pat:syncHeld', '[]'],
      ['pat:businesses', '{"u":"u","at":1,"list":[]}'], ['pat:jobMoves', '{"u":"u","at":1,"list":[]}'],
      ['pat:minVersion', '{"u":"u","min":151,"at":1}']]) acct.storage.setItem(k, v);
    t.deepEq(acct.run('storeUnreadableKeys().map(b => b.key)'), [], 'sync, business and minimum records read');
  });

  /* ------------------------------------------------------------------ 91b */
  await t.group('91b — unreadable values: copied byte for byte, checked, moved off; every later save leaves the copy alone', () => {
    for (const [what, bad] of Object.entries(BAD_SHAPES)) {
      const app = bootWith({ 'pat:sessions': bad, 'pat:engineer': 'ZZ Engineer' });
      t.eq(app.storage.getItem(P + 'pat:sessions'), bad, `${what}: the copy is byte-identical`);
      t.eq(app.storage.getItem('pat:sessions') === bad, false, `${what}: and it is off its own key`);
      t.eq(app.state().engineer, 'ZZ Engineer', `${what}: PATGo started (the rest of the phone loaded)`);
    }

    // Several at once; settings too (1C).
    const BAD_CLIENTS = '[{"id":"c1","name":"ZZ Client"';
    const BAD_SITES = '{"not":"a list"}';
    const BAD_REPORT = '["wrong shape"]';
    const app = bootWith({ 'pat:sessions': BAD_JOBS, 'pat:clients': BAD_CLIENTS, 'pat:sites': BAD_SITES, 'pat:reportsettings': BAD_REPORT });
    t.deepEq(keysWith(app, P), [P + 'pat:clients', P + 'pat:reportsettings', P + 'pat:sessions', P + 'pat:sites'], 'all four kept');
    const note = JSON.parse(app.storage.getItem('pat:unreadable'));
    t.deepEq(note.keys.slice().sort(), ['pat:clients', 'pat:reportsettings', 'pat:sessions', 'pat:sites'], 'the note names them');
    t.eq(note.seen, false, '…not yet seen');
    t.ok(/^\d{4}-\d{2}-\d{2}T/.test(note.at), '…with when');
    t.eq(app.run("state.view"), 'sessions', 'PATGo opens on the Jobs list');
    t.ok(app.html().length > 0, '…painted');

    // Every later write: logging a job, settings, a full save, a restart.
    withSession(app, { name: 'ZZ After' });
    withItem(app, { assetNo: 'ZZAFTER-1', result: 'pass' });
    app.fn('save')();
    app.fn('saveSessions')();
    app.fn('saveSettings')();
    const kept = { 'pat:sessions': BAD_JOBS, 'pat:clients': BAD_CLIENTS, 'pat:sites': BAD_SITES, 'pat:reportsettings': BAD_REPORT };
    for (const [k, v] of Object.entries(kept)) t.eq(app.storage.getItem(P + k), v, `after logging and saving: ${k}'s copy byte-identical`);
    t.includes(app.storage.getItem('pat:sessions'), 'ZZAFTER-1', 'the new work saved to its own key');
    const again = bootWith(dump(app));
    for (const [k, v] of Object.entries(kept)) t.eq(again.storage.getItem(P + k), v, `restarted: ${k}'s copy byte-identical`);
    t.eq(again.state().sessions.length, 1, 'restarted: the new job loads; nothing set aside again');
    t.eq(JSON.parse(again.storage.getItem('pat:unreadable')).keys.length, 4, '…and the note is unchanged');

    // A copy already there and identical (a start that stopped before the move): carry on.
    const half = bootWith({ 'pat:sessions': BAD_JOBS, [P + 'pat:sessions']: BAD_JOBS });
    t.eq(half.storage.getItem('pat:sessions'), null, 'an identical copy already kept: the original moves off');
    t.eq(half.storage.getItem(P + 'pat:sessions'), BAD_JOBS, '…the copy untouched');
  });

  /* ------------------------------------------------------------------ 91c */
  await t.group('91c — signed in, the pull brings a job down and saves by itself: the kept copy is untouched', async () => {
    const app = await signedInWith({ 'pat:sessions': BAD_JOBS });
    t.eq(app.storage.getItem(P + 'pat:sessions'), BAD_JOBS, 'kept at start');
    archive.seed(app, 'ZZDUE152', { date: archive.monthsAgo(12), retestTrack: true, retestMonths: 12 });
    await app.fn('syncPush')({ pull: true });
    app.stopTimer();
    await tick(30);
    t.ok(app.state().sessions.some(s => s.id === 'ZZDUE152'), 'the pull brought the job down (and saved)');
    t.includes(app.storage.getItem('pat:sessions') || '', 'ZZDUE152', '…to the jobs key');
    t.eq(app.storage.getItem(P + 'pat:sessions'), BAD_JOBS, 'the kept copy: byte-identical');
  });

  /* ------------------------------------------------------------------ 91d */
  await t.group('91d — when it can’t be kept safely: nothing changed, nothing half-done, nothing saved; the stop screen', async () => {
    // No room for a copy.
    const full = bootWith({ 'pat:sessions': BAD_JOBS, 'pat:clients': '[{"id":"c1"', 'pat:engineer': 'ZZ' }, (a) => {
      const ls = a.storage, real = ls.setItem;
      ls.setItem = function (k, v) {
        if (String(k).indexOf(P) === 0 && String(k).indexOf('pat:clients') !== -1) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
        return real.call(this, k, v);
      };
    });
    t.eq(full.storage.getItem('pat:sessions'), BAD_JOBS, 'no room: the jobs untouched, byte for byte');
    t.eq(full.storage.getItem('pat:clients'), '[{"id":"c1"', '…the clients too');
    t.deepEq(keysWith(full, P), [], '…and no copy left behind (the one made is taken back)');
    t.eq(full.storage.getItem('pat:unreadable'), null, '…no note');
    full.fn('save')();
    full.run('try { saveSessions = saveSessions; } catch (e) {}');
    t.eq(full.storage.getItem('pat:sessions'), BAD_JOBS, 'save() does nothing (neutralised)');
    t.includes(full.html(), 'Some saved data couldn’t be read', 'the stop screen');
    t.includes(full.html(), 'your jobs and your clients', '…naming what');
    t.includes(full.html(), 'Nothing has been changed or deleted.', '…saying nothing changed');
    t.includes(full.html(), 'id="boot-unreadable-save"', '…with Save a copy');
    t.excludes(full.html(), 'didn’t finish updating', '…not the update screen (Reload would only come back)');
    t.includes(full.html(), 'color:#111;background:#fff;', '…dark text on its own white (the theme never ran — found in the browser check)');
    t.eq((read('boot.js').match(/color:#111;background:#fff;min-height:100vh/g) || []).length, 4, 'every start-up screen carries its own background');
    full.fn('render')();
    t.includes(full.html(), 'Some saved data couldn’t be read', 'render() can’t paint over it');
    const files = catchFiles(full);
    full.doc.getElementById('boot-unreadable-save').click();
    t.eq(files.anchors.length && /^PATGo unreadable data \d{2}-\d{2}-\d{4}\.json$/.test(files.anchors[0].download), true, 'Save a copy: a file, UK date, no underscores');
    const saved = files.blobs.length ? JSON.parse(await files.blobs[0].text()) : {};
    t.eq(saved.values && saved.values['pat:sessions'], BAD_JOBS, '…holding the jobs exactly as stored');
    t.eq(saved.values && saved.values['pat:clients'], '[{"id":"c1"', '…and the clients');

    // A copy that doesn't come back the same (a phone that truncates): never trusted.
    const liar = bootWith({ 'pat:sessions': BAD_JOBS }, (a) => {
      const ls = a.storage, real = ls.setItem;
      ls.setItem = function (k, v) { if (String(k).indexOf(P) === 0) v = String(v).slice(0, 10); return real.call(this, k, v); };
    });
    t.eq(liar.storage.getItem('pat:sessions'), BAD_JOBS, 'a copy that doesn\u2019t match: the jobs untouched');
    t.deepEq(keysWith(liar, P), [], '…the wrong copy taken back');
    t.includes(liar.html(), 'Some saved data couldn\u2019t be read', '…the stop screen');

    // An earlier, different copy in the way.
    const way = bootWith({ 'pat:sessions': BAD_JOBS, [P + 'pat:sessions']: 'ZZ an older copy' });
    t.eq(way.storage.getItem('pat:sessions'), BAD_JOBS, 'an earlier copy in the way: the jobs untouched');
    t.eq(way.storage.getItem(P + 'pat:sessions'), 'ZZ an older copy', '…the earlier copy untouched');
    t.includes(way.html(), 'Some saved data couldn’t be read', '…the stop screen');

    // A value that won't move: the copies made stay (an original may be gone already).
    const stuck = bootWith({ 'pat:sessions': BAD_JOBS, 'pat:sites': '{"x":1}' }, (a) => {
      const ls = a.storage, real = ls.removeItem;
      ls.removeItem = function (k) { if (k === 'pat:sites') return; return real.call(this, k); };
    });
    t.eq(stuck.storage.getItem(P + 'pat:sessions'), BAD_JOBS, 'a value that won’t move: the copy already made stays');
    t.eq(stuck.storage.getItem(P + 'pat:sites'), '{"x":1}', '…both copies stay');
    t.eq(stuck.storage.getItem('pat:sites'), '{"x":1}', '…the stuck one untouched');
    t.includes(stuck.html(), 'Some saved data couldn’t be read', '…the stop screen');

    // The backstop: load() alone refuses unreadable jobs.
    const back = freshApp();
    back.storage.setItem('pat:sessions', BAD_JOBS);
    let err = null;
    try { back.fn('load')(); } catch (e) { err = e; }
    t.ok(err && Array.isArray(err.storeUnreadable) && err.storeUnreadable[0].key === 'pat:sessions', 'load() alone throws, naming the jobs');
    t.eq(back.storage.getItem('pat:sessions'), BAD_JOBS, '…and changes nothing');
    t.eq(back.fn('parseStoredSessions')(BAD_JOBS).length, 0, 'parseStoredSessions stays tolerant (03d) — load() is what refuses');
  });

  /* ------------------------------------------------------------------ 91e */
  await t.group('91e — release: V152; cache pat-v152; About V152 / V151 / V150; no What’s new', () => {
    const rel = freshApp();
    t.eq(rel.run('APP_VERSION'), 'V152', 'APP_VERSION V152');
    t.eq(rel.run('WELCOME_VERSION'), 'V150', 'What’s new not rolled (still V150’s)');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v152';", 'cache key pat-v152');
    t.eq(rel.fn('updateVersionLabel')('pat-v152'), 'V152', 'the update banner reads the key as V152');
    t.eq(rel.fn('updateVersionLabel')('pat-v152-1'), 'V152.1', '…and a hotfix key as V152.1');
    const core = read('render-core.js');
    const at = core.indexOf('<ul class="welcome-list sheet-scroll">');
    const sheetCopy = core.slice(at, core.indexOf('</ul>', at));
    t.eq((sheetCopy.match(/<li>/g) || []).length, 1, 'What’s new: V150’s one line');
    t.includes(sheetCopy, '<li><strong>Move a job to another business.</strong> For anyone who works for more than one business:', '…moving a job');
    t.includes(sheetCopy, 'Working for just one business? Nothing changes.</li>', '…and nothing changes for everyone else');
    const help = read('render-help.js');
    const x = help.indexOf('<p><strong>V152</strong>'), y = help.indexOf('<p><strong>V151</strong>'), z = help.indexOf('<p><strong>V150</strong>');
    t.ok(x > -1 && y > x && z > y, 'About: V152, V151, V150');
    t.excludes(help, '<p><strong>V149</strong>', 'V149 rolled off');
    t.includes(help, 'Behind the scenes: if PATGo ever can&rsquo;t read something saved on this phone', 'About: V152’s line');
    t.includes(help, 'Behind the scenes: the cloud can now ask for a newer PATGo before a phone syncs.', 'About: V151’s line still there');
    t.includes(help, 'Move a job to another business: Job settings &rarr; Business &rarr; Change&hellip;', 'About: V150’s line still there');
  });

  /* ------------------------------------------------------------------ 91f */
  await t.group('91f — the Jobs banner, the Backup page, Reset, a takeover, backups', async () => {
    const app = bootWith({ 'pat:sessions': BAD_JOBS, 'pat:reportsettings': '["x"]' });
    app.run('state.welcomeSeen = true; state.migrationPrompt = { show: false, name: "", items: [] }; state.view = "sessions"; render();');
    t.includes(app.html(), 'unreadable-banner', 'the Jobs list: the banner');
    t.includes(app.html(), 'PATGo couldn’t read your jobs and your certificate settings when it opened.', '…in plain words');
    t.includes(app.html(), 'get your work back from a daily snapshot or a backup', '…jobs: how to get them back');
    tap(app, 'unreadable-open');
    t.eq(app.run('state.view'), 'settingsBackup', 'Show me: the Backup page');
    const page = app.html();
    t.includes(page, 'id="unreadable-section"', 'the Backup page: the section');
    t.ok(page.indexOf('id="unreadable-section"') < page.indexOf('id="export-all-btn"'), '…at the top');
    t.includes(page, 'Data PATGo couldn’t read', '…its heading');
    t.ok(/When PATGo opened on \d{2}\/\d{2}\/\d{4}, it couldn’t read your jobs and your certificate settings\./.test(page), '…when (UK date) and what');
    t.includes(page, 'restore your most recent daily snapshot or backup below', '…the way back');

    const files = catchFiles(app);
    tap(app, 'unreadable-save');
    const saved = files.blobs.length ? JSON.parse(await files.blobs[0].text()) : {};
    t.eq(saved.values && saved.values['pat:sessions'], BAD_JOBS, 'Save a copy: the jobs exactly as stored');
    t.eq(saved.values && saved.values['pat:reportsettings'], '["x"]', '…and the settings');

    // × hides the banner, across a restart, until something new is set aside.
    app.run('state.view = "sessions"; render();');
    tap(app, 'unreadable-dismiss');
    t.excludes(app.html(), 'unreadable-banner', '× hides it');
    const again = bootWith(dump(app));
    again.run('state.welcomeSeen = true; state.migrationPrompt = { show: false, name: "", items: [] }; state.view = "sessions"; render();');
    t.excludes(again.html(), 'unreadable-banner', '…and it stays hidden after a restart');
    const more = dump(again); more['pat:clients'] = '[{"id":';
    const third = bootWith(more);
    third.run('state.welcomeSeen = true; state.migrationPrompt = { show: false, name: "", items: [] }; state.view = "sessions"; render();');
    t.includes(third.html(), 'unreadable-banner', 'something new set aside: it shows again');
    t.includes(third.html(), 'your jobs, your clients and your certificate settings', '…naming all three');

    // Settings only: the standard-setup words, no "get your work back".
    const setOnly = bootWith({ 'pat:failreasons': '{"x":1}' });
    setOnly.run('state.welcomeSeen = true; state.migrationPrompt = { show: false, name: "", items: [] }; state.view = "sessions"; render();');
    t.includes(setOnly.html(), 'PATGo went back to its standard setup for it.', 'settings only: the standard-setup words');
    t.excludes(setOnly.html(), 'get your work back', '…not the jobs words');

    // Not on the cloud tab (it is this phone's).
    const core = read('render-core.js');
    const cloudBranch = core.slice(core.indexOf('if (cloudTab) {'), core.indexOf('if (cloudTab) {') + 300);
    t.excludes(cloudBranch, 'unreadableBanner', 'the cloud tab doesn’t carry it');

    // Delete the kept copy: asked first, then gone. (Booted last: the stub
    // document registers sheet ids on the newest page only.)
    const del = bootWith(dump(third));
    del.run('state.welcomeSeen = true; state.migrationPrompt = { show: false, name: "", items: [] }; state.view = "settingsBackup"; render();');
    tap(del, 'unreadable-delete');
    const yes = del.doc.getElementById('confirm-sheet-yes');
    t.ok(!!yes, 'Delete asks first');
    if (yes) yes.click();
    t.deepEq(keysWith(del, P), [], 'deleted: the copies are gone');
    t.eq(del.storage.getItem('pat:unreadable'), null, '…and the note');
    del.run('render();');
    t.excludes(del.html(), 'id="unreadable-section"', '…and the section');

    // Reset (work level), a takeover, and backups.
    const r = bootWith({ 'pat:sessions': BAD_JOBS });
    t.ok(r.run("_resetWipeLocal('work').includes('pat:unreadable:pat:sessions')"), 'Clear my work removes the kept copy');
    t.eq(r.storage.getItem('pat:unreadable'), null, '…and the note');
    const h = bootWith({ 'pat:sessions': BAD_JOBS });
    h.run('_resetWipeLocal(RESET_HANDOVER)');
    t.deepEq(keysWith(h, P), [], 'a takeover removes it (the last owner’s data)');
    const b = bootWith({ 'pat:sessions': BAD_JOBS });
    t.excludes(JSON.stringify(b.run('buildBackup()')), 'Real job', 'never in a backup');
    t.eq(b.run("RESET_KEY_PLAN.find(r => r[0] === 'UNREADABLE_KEY')[2]"), 'work', 'Reset plan: the note is work');
  });
};
