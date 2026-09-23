/* Standing test — sync, instruments + presets + the tester in use (V83)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Instruments and presets travel through `records` on
   the V82 rules. Locked: 1B the tester in use is synced (a settings row), 2A the
   tester this phone is USING is never deleted from under it without asking, 3A
   the same tester set up on two phones stays as two, 4A the Add button's limit
   of 5 no longer cuts a loaded list short, 5A a new phone's untouched starter
   preset is set aside when the account's presets arrive, 6A the V82
   certificate gap is closed by ordering, 7A which PRESET is in use stays per
   phone, 8A both phones switching tester is asked about.

   AND ONE PRE-EXISTING BUG (19a). deleteInstrument() froze its details onto
   the jobs that used it, but the session encoding cache did not look at the
   instrument fields, so for every job except the open one the frozen copy never
   reached the disk. After a reopen those certificates named today's tester.
   Present since v66. Fixed in _sessionSig() (storage.js).

   Same method as 17/18: the REAL vendored library against a fake server that
   applies the PostgREST filters it is sent and reorders jsonb keys on the way
   back out. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { tick, freshApp, withInstrument, addInstrument, withSession, withItem, confirmSheet } = require('../fixture');

const LIB = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const UID_A = '11111111-1111-1111-1111-111111111111';
const T1 = '2026-09-01T10:00:00.000Z';
const T2 = '2026-09-02T10:00:00.000Z';
const T3 = '2026-09-03T10:00:00.000Z';
const INUSE = 'settings_instrument';

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
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    let body = null;
    try { body = init.body ? JSON.parse(init.body) : null; } catch { body = init.body; }
    calls.push({ url: u, method, body });
    for (const name of ['sessions', 'records']) {
      if (!u.includes('/rest/v1/' + name)) continue;
      const cloud = tables[name];
      if (method === 'GET') {
        const q = new URLSearchParams(u.split('?')[1] || '');
        let rows = cloud.slice();
        const gt = q.get('updated_at');
        if (gt && gt.startsWith('gt.')) rows = rows.filter(r => r.updated_at > gt.slice(3));
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
      for (const row of (Array.isArray(body) ? body : [])) {
        const i = cloud.findIndex(r => String(r.id) === String(row.id));
        const stored = Object.assign({}, row, { updated_at: o.pushStamp || T3 });
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
const sessRow = (doc, stamp = T2) =>
  ({ id: doc.id, doc, deleted: false, last_modified: stamp, updated_at: stamp });

const inst = (id, make, extra = {}) => Object.assign(
  { id, make, model: '', calDate: '2026-01-01', calCertNo: 'CERT-' + id, calDue: '2027-01-01' }, extra);
const preset = (id, name, items) => ({ id, name, items: items || ['Kettle', 'Toaster'] });

function syncState(app) { return JSON.parse(app.storage.getItem('pat:syncState') || 'null'); }
function held(app) { return JSON.parse(app.storage.getItem('pat:syncHeld') || '[]'); }
const findI = (app, id) => (app.state().instruments || []).find(i => i.id === id) || null;
const findP = (app, id) => (app.state().itemPresets || []).find(p => p.id === id) || null;
const findS = (app, id) => (app.state().sessions || []).find(s => String(s.id) === String(id)) || null;

/* Lists on the phone, saved, and the named ids recorded as already sent. */
function local(app, o = {}) {
  const js = JSON.stringify;
  if (o.instruments) app.run(`state.instruments = ${js(o.instruments)};`);
  if (o.active !== undefined) app.run(`state.activeInstrumentId = ${js(o.active)}; syncActiveInstrumentMirror();`);
  if (o.presets) app.run(`state.itemPresets = ${js(o.presets)}; state.activePresetId = ${js(o.activePreset || o.presets[0].id)}; syncItemTypesFromActivePreset();`);
  app.run('save();');
  app.stopTimer();
  markSent(app, o);
}

function markSent(app, o = {}) {
  const st = syncState(app) || {};
  st.userId = UID_A; st.hashV = 2;
  st.sent = st.sent || {}; st.gone = st.gone || {}; st.resend = st.resend || {};
  st.rec = st.rec || { sent: {}, gone: {}, resend: {}, pulledAt: null, kinds: '' };
  st.rec.freeze = st.rec.freeze || {};
  const h = app.fn('_syncRecordHash');
  for (const id of (o.sent || [])) {
    const i = findI(app, id), p = findP(app, id);
    if (i) st.rec.sent[id] = h('instrument', i);
    else if (p) st.rec.sent[id] = h('preset', p);
  }
  if (o.sentInUse) {
    st.rec.sent[INUSE] = h('settings', { id: INUSE, instrumentId: o.sentInUse });
    st.rec.inUse = o.sentInUse;
  }
  for (const id of (o.sentJobs || [])) {
    st.sent[id] = app.fn('syncHash')(app.fn('_syncCanonical')(findS(app, id)));
  }
  app.storage.setItem('pat:syncState', JSON.stringify(st));
}

/* A job on the phone, stamped with a given instrument, not the open one. */
function job(app, id, instrumentId, items = 1) {
  const its = [];
  for (let i = 0; i < items; i++) its.push({ id: id + '-it' + i, assetNo: 'ZZ-' + id + '-' + i, itemType: 'Kettle', location: 'Office', result: 'pass' });
  app.run(`state.sessions.push(${JSON.stringify({ id, site: 'ZZ Site ' + id, name: '', date: '2026-09-01', items: its, instrumentId })}); saveSessions();`);
  app.stopTimer();
  return findS(app, id);
}

module.exports = async function () {
  /* ------------------------------------------------------------------ 19a */
  t.group('19a — a deleted instrument\u2019s frozen copy survives a reopen (pre-existing since v66)', () => {
    const app = freshApp();
    const doomed = withInstrument(app, { make: 'ZZ Doomed Tester', calCertNo: 'ZZ-CERT-OLD' });
    addInstrument(app, { make: 'ZZ Keeper' });
    const old = withSession(app, { site: 'ZZ Old job' }); withItem(app);
    withSession(app, { site: 'ZZ Newer job' }); withItem(app);   // the OLD job is no longer the open one
    app.fn('save')();                                             // a normal save caches its encoding
    app.fn('deleteInstrument')(doomed.id);
    t.ok(confirmSheet(app, 'yes'), 'the delete confirm was wired');
    t.eq(old.instrumentSnapshot && old.instrumentSnapshot.make, 'ZZ Doomed Tester', 'the copy is written in memory');
    app.fn('load')();
    const re = app.state().sessions.find(s => s.id === old.id);
    t.eq(re && re.instrumentSnapshot && re.instrumentSnapshot.make, 'ZZ Doomed Tester',
      'and it is still there after a reopen \u2014 it reached the disk');
    t.eq(app.fn('instrumentForSession')(re).calCertNo, 'ZZ-CERT-OLD',
      'so the old job\u2019s certificate still names the tester that tested it, not today\u2019s');
    t.ok((app.state().tombstones || []).some(x => x.kind === 'instrument' && x.id === doomed.id),
      'and the delete is in the ledger, so it can travel');
  });

  /* ------------------------------------------------------------------ 19b */
  await t.group('19b — instruments from the other phone arrive, are not sent back, and a reload is not a change', async () => {
    const app = signedIn({ server: { records: [
      recRow('instrument', 'ZZI1', inst('ZZI1', 'ZZ Remote Tester')),
    ] } });
    await app.fn('syncPull')();
    await tick(5);
    t.eq(findI(app, 'ZZI1') && findI(app, 'ZZI1').make, 'ZZ Remote Tester', 'the instrument is on the phone');
    t.eq(app.srv.rows('records').filter(r => r.id === 'ZZI1').length, 0, 'and is not pushed straight back');
    t.includes(app.storage.getItem('pat:instruments'), 'ZZ Remote Tester', 'it is on disk, not only in memory');
    t.eq(app.state().activeInstrumentId, 'ZZI1', 'a phone with no tester of its own is now using it (settled, not left blank)');
    t.eq(app.state().testerMake, 'ZZ Remote Tester', 'and the instrument mirror follows (MAP rule 7)');

    app.fn('load')();
    const before = app.srv.rows('records').filter(r => r.id === 'ZZI1').length;
    await app.fn('syncPull')();
    await tick(5);
    t.eq(app.srv.rows('records').filter(r => r.id === 'ZZI1').length, before, 'after a reload nothing is re-sent');
    t.eq(held(app).length, 0, 'and nothing is held');
  });

  /* ------------------------------------------------------------------ 19c */
  await t.group('19c — what is sent: the stored shape, a delete as a delete, nothing half-made', async () => {
    const app = signedIn();
    local(app, { instruments: [inst('ZZC1', 'ZZ Made Here'), inst('ZZC2', 'ZZ Going'), inst('ZZC3', '', { model: '' })], active: 'ZZC1' });
    await app.fn('syncPull')();
    await tick(5);
    const sent = app.srv.rows('records').find(r => r.id === 'ZZC1');
    t.eq(sent && sent.kind, 'instrument', 'an instrument is sent, filed under its kind');
    t.deepEq(sent && Object.keys(sent.doc).sort(), ['calCertNo', 'calDate', 'calDue', 'id', 'make', 'model'],
      'carrying exactly the stored fields');
    t.notOk(app.srv.rows('records').some(r => r.id === 'ZZC3'), 'an instrument with no name (a half-filled Add) is never sent');

    app.fn('deleteInstrument')('ZZC2');
    confirmSheet(app, 'yes');
    app.stopTimer();
    await app.fn('syncPull')();
    await tick(5);
    const gone = app.srv.rows('records').filter(r => r.id === 'ZZC2').pop();
    t.eq(gone && gone.deleted, true, 'a local delete goes up as a delete');
  });

  /* ------------------------------------------------------------------ 19d */
  await t.group('19d — deleted on the other phone: frozen onto jobs AFTER the jobs are read', async () => {
    // Phone A deleted ZZDI and froze it onto J1 — and had also added an item to
    // J1 first. The cloud J1 therefore carries A's item AND the frozen copy.
    const cloudJ1 = { id: 'ZZDJ1', site: 'ZZ Site ZZDJ1', name: '', date: '2026-09-01', instrumentId: 'ZZDI',
      instrumentSnapshot: { make: 'ZZ Retired', model: '', calDate: '2026-01-01', calCertNo: 'CERT-ZZDI', calDue: '2027-01-01' },
      items: [{ id: 'ZZDJ1-it0', assetNo: 'ZZ-ZZDJ1-0', itemType: 'Kettle', location: 'Office', result: 'pass' },
              { id: 'ZZDJ1-A', assetNo: 'ZZ-A-ADDED', itemType: 'Drill', location: 'Office', result: 'pass' }] };
    const app = signedIn({ server: {
      records: [recRow('instrument', 'ZZDI', null, T2, true)],
      sessions: [sessRow(cloudJ1, T2)],
    } });
    local(app, { instruments: [inst('ZZDI', 'ZZ Retired'), inst('ZZDK', 'ZZ Current')], active: 'ZZDK', sent: ['ZZDI', 'ZZDK'] });
    job(app, 'ZZDJ1', 'ZZDI');          // on both phones, clean here
    job(app, 'ZZDJ2', 'ZZDI');          // only on this phone
    markSent(app, { sentJobs: ['ZZDJ1'] });

    await app.fn('syncPull')();
    await tick(10);
    t.notOk(findI(app, 'ZZDI'), 'the instrument is gone');
    t.eq(held(app).filter(e => e.id === 'ZZDJ1').length, 0,
      'the job that arrived already frozen is NOT held as edited on both phones');
    t.eq(findS(app, 'ZZDJ1').items.length, 2, 'it took the other phone\u2019s version, extra item and all');
    t.eq(findS(app, 'ZZDJ2').instrumentSnapshot && findS(app, 'ZZDJ2').instrumentSnapshot.make, 'ZZ Retired',
      'the job only this phone had is frozen, as a local delete would');
    t.eq(app.fn('instrumentForSession')(findS(app, 'ZZDJ2')).calCertNo, 'CERT-ZZDI', 'so its certificate is unchanged');
    const up = app.srv.rows('sessions').filter(r => r.id === 'ZZDJ2').pop();
    t.eq(up && up.doc.instrumentSnapshot && up.doc.instrumentSnapshot.make, 'ZZ Retired', 'and the frozen copy is sent in the same run');
    t.deepEq(syncState(app).rec.freeze, {}, 'nothing is left owing');
    t.ok((app.state().tombstones || []).some(x => x.kind === 'instrument' && x.id === 'ZZDI'), 'the delete is in the ledger');
  });

  /* ------------------------------------------------------------------ 19e */
  await t.group('19e — copies owed by a run that died are written at the next start', async () => {
    const app = signedIn();
    local(app, { instruments: [inst('ZZEK', 'ZZ Keep')], active: 'ZZEK' });
    job(app, 'ZZEJ', 'ZZEGONE');
    job(app, 'ZZEJ2', 'ZZEK');
    const st = syncState(app);
    st.rec.freeze = { ZZEGONE: { make: 'ZZ Owed', model: '', calDate: '', calCertNo: 'ZZ-OWED', calDue: '' },
                      ZZEK: { make: 'ZZ Back Again', model: '', calDate: '', calCertNo: 'ZZ-BACK', calDue: '' } };
    app.storage.setItem('pat:syncState', JSON.stringify(st));
    app.fn('syncBoot')();
    app.stopTimer();
    t.eq(findS(app, 'ZZEJ').instrumentSnapshot && findS(app, 'ZZEJ').instrumentSnapshot.calCertNo, 'ZZ-OWED', 'the owed copy is written at boot');
    t.notOk(findS(app, 'ZZEJ2').instrumentSnapshot, 'but not for an instrument that is back on the phone (a "Keep it" answer)');
    t.deepEq(syncState(app).rec.freeze, {}, 'and cleared');
  });

  /* ------------------------------------------------------------------ 19f */
  await t.group('19f — 2A: the tester this phone is USING is not deleted without asking', async () => {
    const app = signedIn({ server: { records: [recRow('instrument', 'ZZFU', null, T2, true)] } });
    local(app, { instruments: [inst('ZZFU', 'ZZ In Use'), inst('ZZFO', 'ZZ Other')], active: 'ZZFU', sent: ['ZZFU', 'ZZFO'], sentInUse: 'ZZFU' });
    await app.fn('syncPull')();
    await tick(5);
    const h = held(app).find(e => e.id === 'ZZFU');
    t.ok(h, 'held, although this phone\u2019s copy is clean');
    t.eq(h && h.inUse, true, 'marked as the tester in use');
    t.ok(findI(app, 'ZZFU'), 'the instrument is still here');
    t.eq(app.state().activeInstrumentId, 'ZZFU', 'and still the one in use');
    const html = app.fn('renderCloudSync')();
    t.includes(html, 'Instruments &amp; presets', 'under its own heading');
    t.includes(html, 'the tester this phone is using', 'the card says why it is asking');
    t.includes(html, 'Keep it here', 'and offers to keep it');
    t.includes(html, 'Delete it here too', 'or to delete it');

    // "Keep it here": the instrument AND the choice of it go back up.
    await app.fn('syncHeldResolve')('instrument/ZZFU', 'phone');
    await tick(10);
    const back = app.srv.rows('records').filter(r => r.id === 'ZZFU').pop();
    t.eq(back && back.deleted, false, 'keeping it sends it back live');
    const use = app.srv.rows('records').filter(r => r.id === INUSE).pop();
    t.eq(use && use.doc.instrumentId, 'ZZFU', 'and sends it as the tester in use, for the account (1B)');
  });

  /* ------------------------------------------------------------------ 19g */
  await t.group('19g — 2A: "Delete it here too" moves to the next tester and freezes the jobs', async () => {
    const app = signedIn({ server: { records: [recRow('instrument', 'ZZGU', null, T2, true)] } });
    local(app, { instruments: [inst('ZZGU', 'ZZ In Use'), inst('ZZGO', 'ZZ Other')], active: 'ZZGU', sent: ['ZZGU', 'ZZGO'], sentInUse: 'ZZGU' });
    job(app, 'ZZGJ', 'ZZGU');
    markSent(app, { sentJobs: ['ZZGJ'] });
    await app.fn('syncPull')();
    await tick(5);
    t.ok(held(app).some(e => e.id === 'ZZGU'), 'held first');
    await app.fn('syncHeldResolve')('instrument/ZZGU', 'cloud');
    await tick(15);
    t.notOk(findI(app, 'ZZGU'), 'deleted on the answer');
    t.eq(app.state().activeInstrumentId, 'ZZGO', 'this phone moves to its next tester');
    t.eq(findS(app, 'ZZGJ').instrumentSnapshot && findS(app, 'ZZGJ').instrumentSnapshot.make, 'ZZ In Use',
      'the job that used it keeps a frozen copy');
    t.eq(held(app).length, 0, 'nothing left to ask');
  });

  /* ------------------------------------------------------------------ 19h */
  await t.group('19h — the instrument open in the editor is neither changed nor sent until it closes', async () => {
    const app = signedIn({ server: { records: [recRow('instrument', 'ZZHE', inst('ZZHE', 'ZZ Edited', { calDate: '2026-08-08' }))] } });
    local(app, { instruments: [inst('ZZHE', 'ZZ Edited')], active: 'ZZHE', sent: ['ZZHE'], sentInUse: 'ZZHE' });
    app.run("state.instrumentEditorId = 'ZZHE'; state.view = 'settingsInstrument';");
    await app.fn('syncPull')();
    await tick(5);
    t.eq(findI(app, 'ZZHE').calDate, '2026-01-01', 'the change waits: the open form was filled from the old copy');
    t.notOk(syncState(app).rec.pulledAt, 'the cursor stays, so it is read again');
    t.eq(app.srv.rows('records').filter(r => r.id === 'ZZHE').length, 0, 'and this phone\u2019s copy is not sent over it');
    t.eq(held(app).length, 0, 'nothing to ask \u2014 nothing has clashed');
    app.run("state.instrumentEditorId = ''; state.view = 'settingsUser';");
    await app.fn('syncPull')();
    await tick(5);
    t.eq(findI(app, 'ZZHE').calDate, '2026-08-08', 'once the editor is closed, it applies');
  });

  /* ------------------------------------------------------------------ 19i */
  t.group('19i — 4A: a list past five is never cut short; the Add button still stops at five', () => {
    const app = freshApp();
    const six = [1, 2, 3, 4, 5, 6].map(n => inst('ZZ6-' + n, 'ZZ Tester ' + n));
    app.run(`state.instruments = ${JSON.stringify(six)}; state.activeInstrumentId = 'ZZ6-1'; save();`);
    app.fn('load')();
    t.eq(app.state().instruments.length, 6, 'all six survive a reopen');
    app.fn('restoreInstrumentsFromBackup')({ instruments: six, activeInstrumentId: 'ZZ6-1' });
    t.eq(app.state().instruments.length, 6, 'and a restore');
    app.fn('addInstrument')();
    t.eq(app.state().instruments.length, 6, 'but Add still refuses a seventh');
  });

  /* ------------------------------------------------------------------ 19j */
  await t.group('19j — 1B: a phone that has never agreed takes the account\u2019s tester, even one arriving in the same read', async () => {
    // The choice was pushed BEFORE the instrument it names (earlier updated_at),
    // so it is read first. Decided last, it still finds it.
    const app = signedIn({ server: { records: [
      recRow('settings', INUSE, { id: INUSE, instrumentId: 'ZZJA' }, T1),
      recRow('instrument', 'ZZJA', inst('ZZJA', 'ZZ Account Tester'), T2),
    ] } });
    local(app, { instruments: [inst('ZZJM', 'ZZ Mine')], active: 'ZZJM', sent: [] });
    await app.fn('syncPull')();
    await tick(5);
    t.eq(app.state().activeInstrumentId, 'ZZJA', 'this phone now uses the account\u2019s tester');
    t.eq(app.state().testerMake, 'ZZ Account Tester', 'the mirror follows');
    t.includes(app.run('state.sync.message'), 'The tester in use is now ZZ Account Tester', 'and the page says so');
    t.eq(app.srv.rows('records').filter(r => r.id === INUSE).length, 0, 'nothing is sent back over it');
    t.eq(syncState(app).rec.inUse, 'ZZJA', 'and the two sides now agree');
    t.ok(findI(app, 'ZZJM'), 'this phone\u2019s own tester is kept \u2014 3A, same tester twice stays as two');
  });

  /* ------------------------------------------------------------------ 19k */
  await t.group('19k — 1B: one side switched → it wins; both switched → asked (8A)', async () => {
    // Other device switched; this phone did not.
    const a = signedIn({ server: { records: [recRow('settings', INUSE, { id: INUSE, instrumentId: 'ZZK2' })] } });
    local(a, { instruments: [inst('ZZK1', 'ZZ One'), inst('ZZK2', 'ZZ Two')], active: 'ZZK1', sent: ['ZZK1', 'ZZK2'], sentInUse: 'ZZK1' });
    await a.fn('syncPull')();
    await tick(5);
    t.eq(a.state().activeInstrumentId, 'ZZK2', 'the other device\u2019s switch is taken');

    // This phone switched; the cloud still has what they agreed.
    const b = signedIn({ server: { records: [recRow('settings', INUSE, { id: INUSE, instrumentId: 'ZZK1' }, T1)] } });
    local(b, { instruments: [inst('ZZK1', 'ZZ One'), inst('ZZK2', 'ZZ Two')], active: 'ZZK2', sent: ['ZZK1', 'ZZK2'], sentInUse: 'ZZK1' });
    await b.fn('syncPull')();
    await tick(5);
    const up = b.srv.rows('records').filter(r => r.id === INUSE).pop();
    t.eq(up && up.doc.instrumentId, 'ZZK2', 'this phone\u2019s switch is sent');

    // Both switched, to different testers.
    const c = signedIn({ server: { records: [recRow('settings', INUSE, { id: INUSE, instrumentId: 'ZZK3' })] } });
    local(c, { instruments: [inst('ZZK1', 'ZZ One'), inst('ZZK2', 'ZZ Two'), inst('ZZK3', 'ZZ Three')], active: 'ZZK2',
               sent: ['ZZK1', 'ZZK2', 'ZZK3'], sentInUse: 'ZZK1' });
    await c.fn('syncPull')();
    await tick(5);
    const h = held(c).find(e => e.kind === 'settings');
    t.ok(h, 'held');
    t.eq(c.state().activeInstrumentId, 'ZZK2', 'this phone keeps its own until answered');
    t.eq(c.srv.rows('records').filter(r => r.id === INUSE).length, 0, 'and does not send it over the other');
    const html = c.fn('renderCloudSync')();
    t.includes(html, 'Use ZZ Two', 'the card offers this phone\u2019s tester by name');
    t.includes(html, 'Use ZZ Three', 'and the other device\u2019s');
    await c.fn('syncHeldResolve')('settings/' + INUSE, 'cloud');
    await tick(10);
    t.eq(c.state().activeInstrumentId, 'ZZK3', 'choosing the other device\u2019s applies it');
  });

  /* ------------------------------------------------------------------ 19l */
  await t.group('19l — a move made for this phone (its tester was deleted) is not a switch made here', async () => {
    const app = signedIn({ server: { records: [recRow('settings', INUSE, { id: INUSE, instrumentId: 'ZZL3' })] } });
    // Agreed on ZZL1, which has since gone from this phone; it fell to ZZL2 by itself.
    local(app, { instruments: [inst('ZZL2', 'ZZ Two'), inst('ZZL3', 'ZZ Three')], active: 'ZZL2', sent: ['ZZL2', 'ZZL3'], sentInUse: 'ZZL1' });
    await app.fn('syncPull')();
    await tick(5);
    t.eq(app.state().activeInstrumentId, 'ZZL3', 'the account\u2019s choice is taken, not asked about');
    t.eq(held(app).length, 0, 'nothing held');
  });

  /* ------------------------------------------------------------------ 19m */
  await t.group('19m — while the tester in use is being asked about, this phone stays on it (2A with 1B)', async () => {
    const app = signedIn({ server: { records: [
      recRow('instrument', 'ZZMU', null, T1, true),
      recRow('settings', INUSE, { id: INUSE, instrumentId: 'ZZMO' }, T2),
    ] } });
    local(app, { instruments: [inst('ZZMU', 'ZZ In Use'), inst('ZZMO', 'ZZ Other')], active: 'ZZMU', sent: ['ZZMU', 'ZZMO'], sentInUse: 'ZZMU' });
    await app.fn('syncPull')();
    await tick(5);
    t.ok(held(app).some(e => e.id === 'ZZMU'), 'the delete is asked about');
    t.eq(app.state().activeInstrumentId, 'ZZMU', 'and the other phone\u2019s move is not taken meanwhile');
    t.eq(app.srv.rows('records').filter(r => r.id === INUSE).length, 0, 'nor is this phone\u2019s sent over it');
  });

  /* ------------------------------------------------------------------ 19m2 */
  await t.group('19m2 — a phone waiting for the account’s tester does not send its own over it', async () => {
    // A new phone (never agreed) with a tester of its own. The account's choice
    // names one this phone cannot have yet — its row is unreadable, so held.
    // Nothing unsent-looking may go up while it waits (M237).
    const app = signedIn({ server: { records: [
      recRow('instrument', 'ZZWA', { id: 'ZZWA', make: 5 }, T1),
      recRow('settings', INUSE, { id: INUSE, instrumentId: 'ZZWA' }, T2),
    ] } });
    local(app, { instruments: [inst('ZZWM', 'ZZ Own')], active: 'ZZWM', sent: [] });
    await app.fn('syncPull')();
    await tick(5);
    t.eq(app.state().activeInstrumentId, 'ZZWM', 'it stays on its own tester for now');
    t.eq(app.srv.rows('records').filter(r => r.id === INUSE).length, 0, 'and does not send that as the account’s choice');
    t.notOk(syncState(app).rec.pulledAt, 'the cursor waits, so the choice is read again');
  });

  /* ------------------------------------------------------------------ 19n */
  await t.group('19n — presets travel; which one is in use stays per phone (7A)', async () => {
    const app = signedIn({ server: { records: [
      recRow('preset', 'preset_ZZN1', preset('preset_ZZN1', 'ZZ Office', ['ZZ Kettle', 'ZZ Monitor'])),
      recRow('preset', 'preset_ZZN2', preset('preset_ZZN2', 'ZZ Site', ['ZZ Drill'])),
    ] } });
    // The preset in use is deliberately NOT the first in the list, or a pull
    // that reset it to the first would look correct (M248).
    local(app, { presets: [preset('preset_ZZNA', 'ZZ First', ['ZZ Aa']), preset('preset_ZZN0', 'ZZ Mine', ['ZZ Fridge'])],
                 activePreset: 'preset_ZZN0', sent: [] });
    await app.fn('syncPull')();
    await tick(5);
    t.ok(findP(app, 'preset_ZZN1') && findP(app, 'preset_ZZN2'), 'both presets arrive');
    t.eq(app.state().activePresetId, 'preset_ZZN0', 'the preset in use here is untouched');
    t.deepEq(app.state().itemTypes, ['ZZ Fridge'], 'and so are the buttons');
    t.notOk(app.srv.rows('records').some(r => r.kind === 'settings' && /preset/i.test(JSON.stringify(r.doc))),
      'no preset-in-use row is ever sent');
    const mine = app.srv.rows('records').find(r => r.id === 'preset_ZZN0');
    t.deepEq(mine && mine.doc.items, ['ZZ Fridge'], 'this phone\u2019s own preset is sent, buttons in order');
  });

  /* ------------------------------------------------------------------ 19o */
  await t.group('19o — the preset in use, changed or deleted elsewhere, updates the buttons', async () => {
    const app = signedIn({ server: { records: [
      recRow('preset', 'preset_ZZO1', preset('preset_ZZO1', 'ZZ Office', ['ZZ New Button'])),
      recRow('preset', 'preset_ZZO2', null, T2, true),
    ] } });
    local(app, { presets: [preset('preset_ZZO1', 'ZZ Office', ['ZZ Old Button']), preset('preset_ZZO2', 'ZZ Van'), preset('preset_ZZO3', 'ZZ Shop')],
                 activePreset: 'preset_ZZO1', sent: ['preset_ZZO1', 'preset_ZZO2', 'preset_ZZO3'] });
    await app.fn('syncPull')();
    await tick(5);
    t.deepEq(app.state().itemTypes, ['ZZ New Button'], 'an edit to the preset in use reaches the quick-pick buttons');
    t.notOk(findP(app, 'preset_ZZO2'), 'a preset deleted elsewhere goes');

    const b = signedIn({ server: { records: [recRow('preset', 'preset_ZZO5', null, T2, true)] } });
    local(b, { presets: [preset('preset_ZZO4', 'ZZ A', ['ZZ A1']), preset('preset_ZZO5', 'ZZ B', ['ZZ B1'])],
               activePreset: 'preset_ZZO5', sent: ['preset_ZZO4', 'preset_ZZO5'] });
    await b.fn('syncPull')();
    await tick(5);
    t.eq(b.state().activePresetId, 'preset_ZZO4', 'if it was the one in use, its neighbour takes over, as deletePreset does');
    t.deepEq(b.state().itemTypes, ['ZZ A1'], 'with its buttons');
  });

  /* ------------------------------------------------------------------ 19p */
  await t.group('19p — a phone\u2019s last preset is never deleted; the card offers only to keep it', async () => {
    const app = signedIn({ server: { records: [recRow('preset', 'preset_ZZP1', null, T2, true)] } });
    local(app, { presets: [preset('preset_ZZP1', 'ZZ Only One')], sent: ['preset_ZZP1'] });
    await app.fn('syncPull')();
    await tick(5);
    t.ok(findP(app, 'preset_ZZP1'), 'it stays');
    const h = held(app).find(e => e.id === 'preset_ZZP1');
    t.eq(h && h.onlyOne, true, 'held, marked as the last one');
    const html = app.fn('renderCloudSync')();
    t.includes(html, 'only preset on this phone', 'the card says why');
    t.excludes(html, 'data-action="sync-keep-cloud" data-arg="preset/preset_ZZP1"', 'and offers no delete');
  });

  /* ------------------------------------------------------------------ 19q */
  await t.group('19q — 5A: a new phone\u2019s untouched starter preset is set aside, never sent', async () => {
    const cloud = [recRow('preset', 'preset_ZZQ1', preset('preset_ZZQ1', 'ZZ Account Preset', ['ZZ Q']))];
    const app = signedIn({ server: { records: cloud.slice() } });
    const starter = app.state().itemPresets[0];
    t.eq(app.state().itemPresets.length, 1, 'a fresh install has its one starter preset');
    await app.fn('syncPull')();
    await tick(5);
    t.notOk(findP(app, starter.id), 'it is set aside once the account\u2019s presets arrive');
    t.eq(app.state().activePresetId, 'preset_ZZQ1', 'and the account\u2019s preset is in use');
    t.notOk(app.srv.rows('records').some(r => r.id === starter.id), 'the starter never went to the cloud');

    // Edited: it is the engineer's work now, and stays.
    const b = signedIn({ server: { records: cloud.slice() } });
    b.run("state.itemPresets[0].items = ['ZZ Edited']; save();");
    b.stopTimer();
    const kept = b.state().itemPresets[0].id;
    await b.fn('syncPull')();
    await tick(5);
    t.ok(findP(b, kept), 'an edited starter is kept');

    // Nothing arrived: nothing to replace it with, so it stays.
    const c = signedIn();
    const lone = c.state().itemPresets[0].id;
    await c.fn('syncPull')();
    await tick(5);
    t.ok(findP(c, lone), 'with nothing arriving, the starter stays');
  });

  /* ------------------------------------------------------------------ 19r */
  await t.group('19r — changed on both phones: the card names the fields that differ', async () => {
    const app = signedIn({ server: { records: [recRow('instrument', 'ZZRI', inst('ZZRI', 'ZZ Tester', { calDate: '2026-05-05' }))] } });
    local(app, { instruments: [inst('ZZRI', 'ZZ Tester')], active: 'ZZRI', sent: ['ZZRI'], sentInUse: 'ZZRI' });
    app.run("state.instruments[0].calDate = '2026-06-06'; save();");
    app.stopTimer();
    await app.fn('syncPull')();
    await tick(5);
    const h = held(app).find(e => e.id === 'ZZRI');
    t.eq(h && h.reason, 'both-changed', 'held');
    t.eq(findI(app, 'ZZRI').calDate, '2026-06-06', 'this phone\u2019s copy is untouched');
    const html = app.fn('renderCloudSync')();
    t.includes(html, 'Calibration date', 'the card names the field');
    t.includes(html, '2026-06-06', 'with this phone\u2019s value');
    t.includes(html, '2026-05-05', 'and the cloud\u2019s');
    t.excludes(html, 'Calibration certificate', 'and only the fields that differ');
  });

  /* ------------------------------------------------------------------ 19s */
  await t.group('19s — a settings row this version does not know is left alone, and does not stop the cursor', async () => {
    const app = signedIn({ server: { records: [recRow('settings', 'settings_zz_future', { id: 'settings_zz_future', x: 1 })] } });
    await app.fn('syncPull')();
    await tick(5);
    t.eq(held(app).length, 0, 'nothing held');
    t.eq(syncState(app).rec.pulledAt, T2, 'the cursor moves on');
    t.includes(syncState(app).rec.kinds, INUSE, 'the cursor tag names the settings ids it understood');
  });

  /* ------------------------------------------------------------------ 19t */
  await t.group('19t — no tester chosen is never sent over the other phone\u2019s', async () => {
    const app = signedIn();
    await app.fn('syncPull')();
    await tick(5);
    t.eq(app.srv.rows('records').filter(r => r.id === INUSE).length, 0, 'a phone with no instruments sends no choice');
    local(app, { instruments: [inst('ZZTI', 'ZZ First')], active: 'ZZTI' });
    await app.fn('syncPull')();
    await tick(5);
    const up = app.srv.rows('records').filter(r => r.id === INUSE).pop();
    t.eq(up && up.doc.instrumentId, 'ZZTI', 'once it has one, it is sent');
    t.eq(syncState(app).rec.inUse, 'ZZTI', 'and recorded as agreed');
  });

  /* ------------------------------------------------------------------ 19u */
  t.group('19u — repaints wait while a settings form with unsaved typing is on screen', () => {
    const app = signedIn();
    for (const v of ['settingsInstrument', 'settingsItems', 'settingsUser']) {
      app.run(`state.view = '${v}'`);
      t.eq(app.fn('_syncSafeToRepaint')(), false, v + ' is not repainted under the engineer');
    }
    app.run("state.view = 'sessions'");
    t.eq(app.fn('_syncSafeToRepaint')(), true, 'the jobs list still is');
  });

  /* ------------------------------------------------------------------ 19v */
  t.group('19v — the Sync page and the outcome line name the new lists', () => {
    const app = signedIn();
    local(app, { instruments: [inst('ZZVI', 'ZZ Page Tester')], active: 'ZZVI' });
    const html = app.fn('renderCloudSync')();
    t.includes(html, 'id="sync-list-counts"', 'instruments and presets have their own count');
    t.includes(html, 'Tester in use: <strong>ZZ Page Tester</strong>', 'and the tester in use is named');
    const out = app.fn('_syncOutcome');
    const p0 = { applied: 0, added: 0, removed: 0, held: 0 };
    const r = { applied: 1, added: 0, removed: 0, held: 0, unassigned: 0, sent: 1, deleted: 0, error: null,
      cs: { in: 0, out: 0, held: 0 }, ip: { in: 1, out: 1, held: 0 }, inUseNow: null };
    t.eq(out({ sent: 0, deleted: 0, pulled: p0, records: r }), 'Instruments & presets: 1 change brought in, 1 change sent.',
      'instrument and preset changes are not called clients and sites');
    t.includes(out({ sent: 0, deleted: 0, pulled: p0, records: Object.assign({}, r, { ip: { in: 0, out: 0, held: 1 } }) }),
      '1 instrument or preset needs you to decide', 'held ones are named for what they are');
  });

  /* ------------------------------------------------------------------ 19w */
  t.group('19w — the local delete and the remote delete freeze through ONE helper', () => {
    // Source guard: if either path grows its own copy of the freeze, they can
    // drift — the V81 shape of _syncApplyRemoteDelete duplicating deleteSession.
    const ins = fs.readFileSync(path.join(APP_DIR, 'instruments.js'), 'utf8');
    const del = ins.slice(ins.indexOf('function deleteInstrument('), ins.indexOf('function clearInstrumentDateField('));
    t.includes(del, 'freezeInstrumentOntoJobs(id, instrumentSnapshotOf(inst))', 'deleteInstrument uses the helper');
    t.includes(del, "recordTombstone('instrument', id)", 'and records the delete');
    t.ok(del.indexOf('freezeInstrumentOntoJobs') < del.indexOf('.filter(i => i.id !== id)'), 'freeze before the removal (MAP rule 5)');
    const syn = fs.readFileSync(path.join(APP_DIR, 'sync.js'), 'utf8');
    t.includes(syn, 'n += freezeInstrumentOntoJobs(id, f[id])', 'the remote path uses the same helper');
  });
};
