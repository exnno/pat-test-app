/* Standing test — sync, general settings (V86)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked: 1A these travel — engineer name and the
   recording switches (one row), fail reasons + reading tags, descriptions, CSV
   columns, Multi Pick; theme, sound, haptics, scanner, sort, filters, backup
   reminders, clear-old-jobs age and the preset in use stay per phone. 2B Smart
   Quick Pick's learned history merges, highest count wins, a later clear or
   rebuild beats it. 3B descriptions merge three-way against what both phones
   last agreed, so a deletion travels and is never asked about. 4A fail
   reasons are asked when both changed. 5A first meeting of two customised
   phones asks once per differing group.

   ⚠ THE ORDER TRAP (23f). A merge run when only ONE side moved puts this
   phone's order back over the other's, and the other phone then does the same
   — a list re-sent by each phone in turn for ever. 23f proves one-sided change
   is taken as it stands; M313 is that bug.

   Same method as 17–21: the REAL vendored library against a fake server that
   applies the PostgREST filters it is sent, reorders jsonb keys, and stamps one
   time per upload batch (rule 14). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { tick } = require('../fixture');

const LIB = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const UID_A = '11111111-1111-1111-1111-111111111111';
const T1 = '2026-09-01T10:00:00.000Z';
const T2 = '2026-09-02T10:00:00.000Z';
const WORK = 'settings_work', FAILS = 'settings_fails', DESC = 'settings_descriptions';
const CSV = 'settings_csv', MP = 'settings_multipick', SQP = 'settings_sqp';

function storedSession(id = UID_A) {
  return JSON.stringify({
    access_token: 'ZZACCESS', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'ZZREFRESH',
    user: { id, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' },
  });
}

function reorderKeys(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(reorderKeys);
  const out = {};
  for (const k of Object.keys(v).reverse()) out[k] = reorderKeys(v[k]);
  return out;
}

function json(rows, status = 200) {
  return new Response(JSON.stringify(rows), { status, headers: { 'content-type': 'application/json' } });
}

function fakeServer(o = {}) {
  const calls = [];
  const tables = { sessions: (o.sessions || []).slice(), records: (o.records || []).slice() };
  let stampN = 0;
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    let body = null;
    try { body = init.body ? JSON.parse(init.body) : null; } catch { body = init.body; }
    calls.push({ url: u, method, body, len: init.body ? String(init.body).length : 0 });
    for (const name of ['sessions', 'records']) {
      if (!u.includes('/rest/v1/' + name)) continue;
      const cloud = tables[name];
      if (method === 'GET') {
        const q = new URLSearchParams(u.split('?')[1] || '');
        let rows = cloud.slice();
        const gt = q.get('updated_at');
        if (gt && gt.startsWith('gt.')) rows = rows.filter(r => r.updated_at > gt.slice(3));
        else if (gt && gt.startsWith('gte.')) rows = rows.filter(r => r.updated_at >= gt.slice(4));
        const eq = q.get('id');
        if (eq && eq.startsWith('eq.')) rows = rows.filter(r => String(r.id) === eq.slice(3));
        const kin = q.get('kind');
        if (kin && kin.startsWith('in.(')) {
          const set = kin.slice(4, -1).split(',').map(s => s.replace(/^"|"$/g, ''));
          rows = rows.filter(r => set.includes(r.kind));
        }
        rows.sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)));
        const lim = parseInt(q.get('limit') || '0', 10);
        if (lim > 0) rows = rows.slice(0, lim);
        return json(rows.map(reorderKeys));
      }
      // One stamp per upload batch, as Postgres does (rule 14).
      stampN++;
      const stamp = '2026-09-03T10:00:' + String(stampN).padStart(2, '0') + '.000Z';
      for (const row of (Array.isArray(body) ? body : [])) {
        const i = cloud.findIndex(r => String(r.id) === String(row.id));
        const stored = Object.assign({}, row, { updated_at: stamp });
        if (i === -1) cloud.push(stored); else cloud[i] = stored;
      }
      return new Response(null, { status: 201 });
    }
    if (u.includes('/rest/v1/profiles')) return json([{ plan: 'trial', trial_ends_at: null }]);
    return json({ message: 'unexpected ' + u }, 404);
  };
  const on = (table, method) => calls.filter(c => c.url.includes('/rest/v1/' + table) && c.method === method);
  return { calls, fetchImpl, tables,
    gets: (table) => on(table, 'GET'),
    posts: (table) => on(table, 'POST'),
    rows: (table) => on(table, 'POST').flatMap(c => Array.isArray(c.body) ? c.body : []) };
}

function signedIn(opts = {}) {
  const ls = Object.assign({ 'patgo:cloudAuth:test': storedSession() }, opts.localStorage || {});
  const app = bootApp({ localStorage: ls, navigator: { onLine: false } });
  app.fn('load')();
  app.state = () => app.refresh('state').state;
  app.stopTimer = () => app.run('if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }');
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
  return app;
}

const recRow = (kind, id, doc, stamp = T2, deleted = false) =>
  ({ id, kind, doc: deleted ? {} : doc, deleted, last_modified: stamp, updated_at: stamp });

function syncState(app) { return JSON.parse(app.storage.getItem('pat:syncState') || 'null'); }
function held(app) { return JSON.parse(app.storage.getItem('pat:syncHeld') || '[]'); }

const sentIds = (app) => app.srv.rows('records').map(r => r.id);
const sentRow = (app, id) => app.srv.rows('records').filter(r => r.id === id).pop() || null;
const st = (app) => app.state();
const gen = (app, id) => app.fn('_syncGeneralRecord')(id);

/* Mark this phone's CURRENT copy of general rows as what it last sent (and,
   for descriptions, what both last agreed). */
function markSent(app, ids) {
  const s = syncState(app) || {};
  s.userId = UID_A; s.hashV = 2;
  s.sent = s.sent || {}; s.gone = s.gone || {}; s.resend = s.resend || {};
  s.rec = s.rec || { sent: {}, gone: {}, resend: {}, pulledAt: null, kinds: '' };
  s.rec.freeze = s.rec.freeze || {};
  for (const id of ids) {
    s.rec.sent[id] = app.fn('_syncGeneralHash')(id, gen(app, id));
    if (id === DESC) s.rec.descBase = gen(app, id).list.map(x => x.toLowerCase());
  }
  app.storage.setItem('pat:syncState', JSON.stringify(s));
}

function run(app) { return app.fn('syncPull')().then(() => tick(5)); }
const genRow = (id, doc, stamp) => recRow('settings', id, Object.assign({ id }, doc), stamp);

module.exports = async function () {
  /* ------------------------------------------------------------------ 23a */
  await t.group('23a — a fresh phone sends none of its out-of-the-box settings, and is up to date', async () => {
    const app = signedIn();
    await run(app);
    const ids = sentIds(app);
    for (const id of [WORK, FAILS, DESC, CSV, MP, SQP]) t.eq(ids.includes(id), false, `${id} not sent (nothing made)`);
    const sum = app.fn('syncStatusSummary')();
    t.eq(sum.gsTotal, 5, 'five general rows counted (Smart Quick Pick history is not)');
    t.eq(sum.gsUpToDate, 5, 'all up to date: nothing to send');
    t.includes(syncState(app).rec.kinds, WORK, 'the cursor tag carries the new ids, so the account is re-read once');
  });

  /* ------------------------------------------------------------------ 23b */
  await t.group('23b — an untouched phone takes the account\u2019s engineer and switches without asking', async () => {
    const app = signedIn();
    app.srv.tables.records.push(genRow(WORK, { engineer: 'ZZ Peter B', timestamps: true, readings: true, sqp: false, retest: true }));
    await run(app);
    t.eq(st(app).engineer, 'ZZ Peter B', 'engineer name arrived');
    t.eq(st(app).timestampsEnabled, true, 'item times on');
    t.eq(st(app).readingsEnabled, true, 'test readings on');
    t.eq(st(app).retestRemindersEnabled, true, 'retest reminders on');
    t.eq(held(app).length, 0, 'nothing asked');
    t.eq(app.storage.getItem('pat:engineer'), 'ZZ Peter B', 'on disk, not only in memory');
    t.eq(app.storage.getItem('pat:readingsenabled'), '1', 'the readings switch on disk');
    t.eq(sentIds(app).includes(WORK), false, 'not sent straight back');
    app.fn('load')();
    await run(app);
    t.eq(sentIds(app).includes(WORK), false, 'after a reload it is still not a change');
  });

  /* ------------------------------------------------------------------ 23c */
  await t.group('23c — fail reasons customised on both phones: asked once, card says what differs, answers work', async () => {
    const app = signedIn();
    app.run(`state.failReasons = ['ZZ Cracked plug', 'ZZ Burnt']; saveSettings();`);
    app.srv.tables.records.push(genRow(FAILS, { reasons: ['ZZ Frayed lead'], tags: { 'ZZ Frayed lead': 'visual' } }));
    await run(app);
    const h = held(app).find(e => e.id === FAILS);
    t.ok(!!h, 'held');
    t.eq(h && h.reason, 'both-changed', 'as changed on both');
    t.ok(h && (h.diffs || []).some(d => d.label === 'Fail reasons' && d.here.includes('ZZ Cracked plug') && d.cloud.includes('ZZ Frayed lead')),
      'the card lists both lists');
    t.eq(st(app).failReasons.join('|'), 'ZZ Cracked plug|ZZ Burnt', 'nothing changed here');
    t.eq(sentIds(app).includes(FAILS), false, 'nothing held is sent');
    app.fn('setView')('cloudSync');
    app.storage.setItem('pat:cloudUnlocked', '1');
    app.fn('render')();
    t.includes(app.doc.getElementById('app').innerHTML, 'id="sync-held-general"', 'under its own "General settings" heading');
    await app.fn('syncHeldResolve')(app.fn('syncHeldKey')(h), 'cloud');
    await tick(5);
    t.eq(st(app).failReasons.join('|'), 'ZZ Frayed lead', '"Use the cloud\u2019s" took the cloud list');
    t.eq(held(app).filter(e => e.id === FAILS).length, 0, 'question cleared');
  });

  /* ------------------------------------------------------------------ 23d */
  await t.group('23d — changed only on the other phone: CSV columns, Multi Pick and fail tags are taken', async () => {
    const app = signedIn();
    app.run(`state.failReasons = ['ZZ Earth fault']; state.failReasonTags['ZZ Earth fault'] = 'earth'; state.multiPick = { enabled: true, slots: [{ name: 'ZZ Desk', items: ['PC', 'Monitor'] }] }; saveSettings();`);
    markSent(app, [FAILS, CSV, MP]);
    const cols = JSON.parse(app.run('JSON.stringify(state.csvColumns)'));
    cols[0].visible = !cols[0].visible;
    app.srv.tables.records.push(genRow(CSV, { columns: cols }));
    app.srv.tables.records.push(genRow(FAILS, { reasons: ['ZZ Earth fault'], tags: { 'ZZ Earth fault': 'insulation' } }));
    app.srv.tables.records.push(genRow(MP, { enabled: true, slots: [{ name: 'ZZ Kitchen', items: ['Kettle', 'Toaster'] }] }));
    await run(app);
    t.eq(st(app).csvColumns[0].visible, cols[0].visible, 'CSV column change taken');
    t.eq(app.fn('readingTagForReason')('ZZ Earth fault'), 'insulation', 'a reading-tag change travels with the reasons');
    t.eq(st(app).multiPick.slots[0].name, 'ZZ Kitchen', 'Multi Pick taken');
    t.eq(held(app).length, 0, 'nothing asked');
  });

  /* ------------------------------------------------------------------ 23e */
  await t.group('23e — descriptions merge: deletions travel, additions from both kept, never asked', async () => {
    const app = signedIn();
    app.run(`state.descriptions = ['ZZ Kettel', 'ZZ Kettle', 'ZZ Toaster']; saveSettings();`);
    markSent(app, [DESC]);
    // Here: the typo deleted, a new one logged. There: something else logged.
    app.run(`state.descriptions = ['ZZ Kettle', 'ZZ Toaster', 'ZZ Heater']; saveSettings();`);
    app.srv.tables.records.push(genRow(DESC, { list: ['ZZ Kettel', 'ZZ Kettle', 'ZZ Toaster', 'ZZ Fan'] }));
    await run(app);
    const list = st(app).descriptions;
    t.eq(list.includes('ZZ Kettel'), false, 'the typo deleted here stays deleted');
    t.ok(list.includes('ZZ Heater') && list.includes('ZZ Fan'), 'both phones\u2019 additions kept');
    t.eq(held(app).filter(e => e.id === DESC).length, 0, 'never asked');
    const up = sentRow(app, DESC);
    t.ok(!!up && up.doc.list.includes('ZZ Fan') && !up.doc.list.includes('ZZ Kettel'), 'the merged list went up');
    t.eq((syncState(app).rec.descBase || []).includes('zz fan'), true, 'what both now agree on is remembered after the send');

    // The other way round: deleted THERE, while this phone kept logging.
    const b = signedIn();
    b.run(`state.descriptions = ['ZZ Drill', 'ZZ Dril']; saveSettings();`);
    markSent(b, [DESC]);
    b.run(`state.descriptions = ['ZZ Drill', 'ZZ Dril', 'ZZ Saw']; saveSettings();`);
    b.srv.tables.records.push(genRow(DESC, { list: ['ZZ Drill'] }));
    await run(b);
    t.eq(st(b).descriptions.includes('ZZ Dril'), false, 'a delete on the other phone sticks although this one changed its list');
    t.eq(st(b).descriptions.includes('ZZ Saw'), true, 'and this phone\u2019s new one survives');

    // Typed again later: new to both, so it comes back.
    const c = signedIn();
    c.run(`state.descriptions = ['ZZ Drill']; saveSettings();`);
    markSent(c, [DESC]);
    c.run(`state.descriptions = ['ZZ Drill', 'ZZ Dril']; saveSettings();`);
    c.srv.tables.records.push(genRow(DESC, { list: ['ZZ Drill', 'ZZ Plane'] }));
    await run(c);
    t.eq(st(c).descriptions.includes('ZZ Dril'), true, 'typing a deleted description again brings it back');
  });

  /* ------------------------------------------------------------------ 23f */
  await t.group('23f — one-sided change is taken as it stands: no order ping-pong', async () => {
    const app = signedIn();
    app.run(`state.descriptions = ['ZZ A', 'ZZ B', 'ZZ C']; saveSettings();`);
    markSent(app, [DESC]);
    app.srv.tables.records.push(genRow(DESC, { list: ['ZZ C', 'ZZ A', 'ZZ B'] }));
    await run(app);
    t.eq(st(app).descriptions.join('|'), 'ZZ C|ZZ A|ZZ B', 'the other phone\u2019s order taken');
    t.eq(sentIds(app).includes(DESC), false, 'and nothing sent back');
    await run(app);
    t.eq(sentIds(app).includes(DESC), false, 'still nothing on the next run');
  });

  /* ------------------------------------------------------------------ 23g */
  await t.group('23g — Smart Quick Pick history: higher count wins; a later clear beats it; never counted', async () => {
    const app = signedIn();
    app.run(`state.sqpHistory = { 'zz kitchen': { Kettle: 5, Toaster: 1 } }; saveSettings();`);
    markSent(app, [SQP]);
    app.run(`state.sqpHistory = { 'zz kitchen': { Kettle: 6, Toaster: 1 } }; saveSettings();`);
    app.srv.tables.records.push(genRow(SQP, { history: { 'zz kitchen': { Kettle: 5, Toaster: 4 }, 'zz office': { PC: 2 } }, resetAt: '' }));
    await run(app);
    const h = st(app).sqpHistory;
    t.eq(h['zz kitchen'] && h['zz kitchen'].Kettle, 6, 'this phone\u2019s higher count kept');
    t.eq(h['zz kitchen'] && h['zz kitchen'].Toaster, 4, 'the other phone\u2019s higher count taken');
    t.eq(!!h['zz office'], true, 'a location learned elsewhere arrives');
    t.eq(held(app).length, 0, 'never asked');
    t.excludes(app.run('state.sync.message') || '', 'General settings', 'not reported as a settings change');

    const r = signedIn();
    r.run(`state.sqpHistory = { 'zz kitchen': { Kettle: 9 } }; saveSettings();`);
    r.srv.tables.records.push(genRow(SQP, { history: { 'zz yard': { Mower: 1 } }, resetAt: '2026-09-20T10:00:00.000Z' }));
    await run(r);
    t.eq(!!st(r).sqpHistory['zz kitchen'], false, 'a clear on the other phone beats counts here');
    t.eq(r.storage.getItem('pat:sqpResetAt'), '2026-09-20T10:00:00.000Z', 'and its time is remembered');

    const c = signedIn();
    c.run(`state.sqpHistory = { 'zz kitchen': { Kettle: 3 } }; saveSettings(); clearSqpHistory();`);
    t.ok(!!c.storage.getItem('pat:sqpResetAt'), 'clearing the history here stamps the reset');
    t.excludes(JSON.stringify(c.fn('buildBackup')()), 'sqpResetAt', 'the reset time is never in a backup');
  });

  /* ------------------------------------------------------------------ 23h */
  await t.group('23h — with a settings page open, its row is neither applied nor sent', async () => {
    const app = signedIn();
    app.run(`state.failReasons = ['ZZ Mine']; saveSettings();`);
    markSent(app, [FAILS]);
    app.srv.tables.records.push(genRow(FAILS, { reasons: ['ZZ Theirs'], tags: {} }));
    app.fn('setView')('settingsFails');
    await run(app);
    t.eq(st(app).failReasons.join('|'), 'ZZ Mine', 'not applied while Fail reasons is open');
    t.eq(held(app).length, 0, 'and not a question either — only the other phone moved');
    app.run(`state.failReasons = ['ZZ Unsaved']`);
    await run(app);
    t.eq(sentIds(app).includes(FAILS), false, 'nothing sent from the open page');
    app.run(`state.failReasons = ['ZZ Mine']`);
    app.fn('setView')('settings');
    await run(app);
    t.eq(st(app).failReasons.join('|'), 'ZZ Theirs', 'applied once the page is left');

    // Nothing new in the cloud at all: the push alone must still wait.
    const q = signedIn();
    q.run(`state.failReasons = ['ZZ Saved']; saveSettings();`);
    markSent(q, [FAILS]);
    q.srv.tables.records.push(genRow(FAILS, { reasons: ['ZZ Saved'], tags: {} }));
    q.fn('setView')('settingsFails');
    q.run(`state.failReasons = ['ZZ Half typed']`);
    await run(q);
    t.eq(sentIds(q).includes(FAILS), false, 'an edit on the open page is not sent, even with nothing to read');
    q.fn('setView')('settings');
    await run(q);
    t.eq(sentIds(q).includes(FAILS), true, 'and goes once the page is left (control)');
  });

  /* ------------------------------------------------------------------ 23i */
  await t.group('23i — per-phone settings stay per phone; a reading tag set here goes up', async () => {
    const app = signedIn();
    app.run(`state.theme = 'dark'; state.hapticsEnabled = false; state.scannerEnabled = false; state.engineer = 'ZZ Me'; saveSettings();`);
    app.run(`state.failReasons = ['ZZ Tagme']; state.failReasonTags['ZZ Tagme'] = 'leakage'; saveSettings();`);
    await run(app);
    const f = sentRow(app, FAILS);
    t.eq(f && f.doc.tags && f.doc.tags['ZZ Tagme'], 'leakage', 'the reading tag chosen here travels with the reason');
    const all = JSON.stringify(app.srv.rows('records'));
    t.includes(all, 'ZZ Me', 'the engineer name went (control)');
    for (const k of ['theme', 'haptics', 'scanner', 'sort', 'pruneAge', 'soundEnabled']) {
      t.excludes(all, `"${k}`, `no ${k} field in anything sent`);
    }
    const b = signedIn();
    b.run(`state.theme = 'light'; saveSettings();`);
    b.srv.tables.records.push(genRow(WORK, { engineer: 'ZZ Other', timestamps: false, readings: false, sqp: false, retest: false, theme: 'dark' }));
    await run(b);
    t.eq(st(b).theme, 'light', 'a stray theme field in a cloud row changes nothing');
  });

  /* ------------------------------------------------------------------ 23j */
  t.group('23j — the switches that save outside save() still reach the sync trigger', () => {
    const app = signedIn();
    const actions = app.run('CHANGE_ACTIONS');   // both are change-event handlers
    app.stopTimer();
    actions['readings-toggle'](true);
    t.ok(app.run('_syncTimer !== null'), 'readings switch arms the trigger');
    app.stopTimer();
    app.run(`state.failReasons = ['ZZ Tagged']`);
    actions['fail-reason-tag']('earth', { dataset: { reason: 'ZZ Tagged' } });
    t.ok(app.run('_syncTimer !== null'), 'a reading-tag change arms the trigger');
    app.stopTimer();
  });

  /* ------------------------------------------------------------------ 23k */
  await t.group('23k — two customised phones meet: one question per group that differs, nothing lost', async () => {
    const app = signedIn();
    app.run(`state.engineer = 'ZZ Here'; state.multiPick = { enabled: true, slots: [{ name: 'ZZ One', items: ['PC'] }] }; saveSettings();`);
    app.srv.tables.records.push(genRow(WORK, { engineer: 'ZZ There', timestamps: false, readings: false, sqp: false, retest: false }));
    app.srv.tables.records.push(genRow(MP, { enabled: true, slots: [{ name: 'ZZ Two', items: ['Fan'] }] }));
    await run(app);
    const ids = held(app).map(e => e.id).sort();
    t.eq(ids.join(','), [MP, WORK].sort().join(','), 'asked about each group that differs, once');
    t.ok((held(app).find(e => e.id === WORK).diffs || []).some(d => d.label === 'Engineer name'), 'the card names the engineer difference');
    t.eq(st(app).engineer, 'ZZ Here', 'nothing changed here meanwhile');
    t.eq(app.fn('syncStatusSummary')().held, 2, 'the Sync page counts two waiting');
  });

  /* ------------------------------------------------------------------ 23l */
  await t.group('23l — more than one page of rows, one stamp per batch: the settings row still arrives (rule 14)', async () => {
    const app = signedIn();
    // Three upload batches, one stamp each — the settings row in the last one,
    // sharing its stamp with the clients around the page boundary.
    const stampOf = (i) => ['2026-09-01T10:00:00.000Z', '2026-09-01T10:00:01.000Z', '2026-09-01T10:00:02.000Z'][Math.floor(i / 100)];
    for (let i = 0; i < 205; i++) {
      app.srv.tables.records.push(recRow('client', 'zzc' + i, { id: 'zzc' + i, name: 'ZZ Client ' + i }, stampOf(i)));
    }
    app.srv.tables.records.push(genRow(CSV, { columns: JSON.parse(app.run('JSON.stringify(state.csvColumns.map((c, i) => Object.assign({}, c, { header: i === 0 ? "ZZ Ref" : c.header })))')) }, stampOf(204)));
    await run(app);
    t.eq(st(app).clients.length, 205, 'every client on both pages arrived');
    t.eq(st(app).csvColumns[0].header, 'ZZ Ref', 'the settings row sharing the boundary stamp arrived too');
  });
};
