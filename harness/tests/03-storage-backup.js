/* Standing test — storage codec + backup round-trip
   (c) 2026 Peter Birchley. All rights reserved.

   Data integrity is the app's highest priority. These assertions are the ones
   that must never be allowed to go hollow. */

'use strict';

const t = require('../assert');
const { bootApp } = require('../load');
const { CANARY, freshApp, withInstrument, withSession, withItem, populated, confirmSheet, tick } = require('../fixture');

module.exports = async function run() {

  t.group('03a — key maps are symmetric', () => {
    const app = bootApp();
    for (const [fwd, rev] of [['SESSION_KEY_MAP', 'SESSION_KEY_MAP_REV'], ['ITEM_KEY_MAP', 'ITEM_KEY_MAP_REV']]) {
      const f = app.val(fwd), r = app.val(rev);
      t.ok(f && r, `${fwd} and ${rev} exist`);
      const shortNames = Object.values(f);
      t.eq(new Set(shortNames).size, shortNames.length, `${fwd} short keys are unique`);
      let ok = true;
      for (const [long, short] of Object.entries(f)) if (r[short] !== long) ok = false;
      t.ok(ok, `${rev} inverts ${fwd} exactly`);
    }
  });

  t.group('03b — session/item codec round-trips', () => {
    const app = bootApp();
    const enc = app.fn('encodeSession'), dec = app.fn('decodeSession');
    const encI = app.fn('encodeItem'), decI = app.fn('decodeItem');

    const item = { id: 'i1', assetNo: 'A-1', location: 'Kitchen', itemType: 'Kettle', notes: 'n', result: 'pass', ts: '2026-08-05T00:00:00.000Z' };
    t.deepEq(decI(encI(item)), item, 'item survives encode→decode unchanged');

    const sess = { id: 's1', name: 'J', site: 'S', engineer: 'E', date: '2026-08-05', items: [item], locked: false };
    const back = dec(enc(sess));
    t.eq(back.id, sess.id, 'session id survives');
    t.eq(back.site, sess.site, 'session site survives');

    // Additive fields ride through wholesale — that is why backupVersion stays 5
    // for additive changes (MAP rule 10). If an unknown key were dropped here,
    // every future additive field would silently vanish on save/load.
    const withNew = { ...item, someFutureField: 'keepme' };
    t.eq(decI(encI(withNew)).someFutureField, 'keepme', 'unknown item keys ride through the codec');
  });

  t.group('03c — serialise/parse survives a full save cycle', () => {
    const app = populated();
    const sessions = app.state().sessions;
    const raw = app.fn('serialiseSessions')(sessions);
    t.ok(typeof raw === 'string' && raw.length > 0, 'serialiseSessions returns a string');
    const parsed = app.fn('parseStoredSessions')(raw);
    t.eq(parsed.length, sessions.length, 'session count survives');
    t.eq(parsed[0].items.length, sessions[0].items.length, 'item count survives');
    t.eq(parsed[0].items[0].assetNo, sessions[0].items[0].assetNo, 'asset number survives');
    t.eq(parsed[0].site, sessions[0].site, 'site snapshot survives');
  });

  t.group('03d — parseStoredSessions tolerates garbage', () => {
    const app = bootApp();
    const parse = app.fn('parseStoredSessions');
    // Garbage must collapse to a safe default, never throw — a throw here is a
    // white screen on a phone with no way back in.
    for (const bad of ['', 'not json', '{}', 'null', '[1,2,3]', '{"v":99}']) {
      t.doesNotThrow(() => parse(bad), `does not throw on ${JSON.stringify(bad)}`);
      t.ok(Array.isArray(parse(bad)), `returns an array for ${JSON.stringify(bad)}`);
    }
  });

  t.group('03e — buildBackup uses long, human-readable keys', () => {
    // Backups stay human-readable even though stored data is compressed. If the
    // codec ever leaked into the backup this would catch it.
    const app = populated();
    const b = app.fn('buildBackup')();
    t.eq(b.backupVersion, 5, 'backupVersion is 5');
    t.ok(Array.isArray(b.sessions), 'sessions is an array');
    const item = b.sessions[0].items[0];
    t.ok('assetNo' in item, 'backup item uses the long key assetNo');
    t.ok('itemType' in item, 'backup item uses the long key itemType');
    t.ok(!('a' in item) && !('t' in item), 'backup item carries no short codec keys');
  });

  await t.group('03f — backup round-trip through the real restore path', async () => {
    const app = populated();
    const before = JSON.stringify(app.fn('buildBackup')());
    const beforeSessions = app.state().sessions.length;
    const beforeItems = app.state().sessions[0].items.length;

    // Wipe everything, exactly as restoring onto a fresh install would find it.
    const st = app.state();
    st.sessions = []; st.clients = []; st.sites = [];
    app.fn('save')();

    const file = new app.sandbox.File([before], 'patgo-backup.json', { type: 'application/json' });
    app.fn('restoreBackupFromFile')(file);
    await tick(5);

    t.ok(confirmSheet(app, 'yes'), 'restore raised the confirm sheet and it was wired');

    const after = app.state();
    t.eq(after.sessions.length, beforeSessions, 'session count restored');
    t.eq(after.sessions[0].items.length, beforeItems, 'item count restored');
    t.eq(after.sessions[0].items[0].assetNo, CANARY.asset, 'item data restored');
    t.eq(after.archivedStats != null, true, 'archived stats bucket restored, not left undefined');

    const round = JSON.parse(JSON.stringify(app.fn('buildBackup')()));
    const orig  = JSON.parse(before);
    t.deepEq(round.sessions, orig.sessions, 'sessions are byte-identical after a round-trip');
    t.deepEq(round.instruments, orig.instruments, 'instruments are byte-identical after a round-trip');
    t.deepEq(round.clients, orig.clients, 'clients are byte-identical after a round-trip');
  });

  await t.group('03f2 — restore validates structured fields it does not own', async () => {
    // Items ride through restore wholesale (additive, no backupVersion bump), but
    // `readings` is a STRUCTURED field other code reads, so a hand-edited or
    // corrupt backup could carry garbage into the certificate path. Found as a
    // gap by mutation M05 — the restore path had no assertion on this at all.
    const app = freshApp();
    const payload = {
      appVersion: 'V66', backupVersion: 5, exportedAt: '2026-08-01T00:00:00.000Z',
      sessions: [{
        id: 'r1', name: 'R', site: 'S', engineer: 'E', date: '2026-08-01', locked: false,
        items: [
          { id: 'ok', assetNo: '1', result: 'pass', readings: { class: 'I', earth: '0.05' } },
          { id: 'junk', assetNo: '2', result: 'pass', readings: { class: 'NOT A CLASS', earth: 42, evil: 'x' } },
          { id: 'notobj', assetNo: '3', result: 'pass', readings: 'nonsense' },
          { id: 'arr', assetNo: '4', result: 'pass', readings: ['a', 'b'] },
        ],
      }],
    };
    const file = new app.sandbox.File([JSON.stringify(payload)], 'b.json', { type: 'application/json' });
    app.fn('restoreBackupFromFile')(file);
    await tick(5);
    t.ok(confirmSheet(app, 'yes'), 'the confirm sheet was raised');

    const items = app.state().sessions[0].items;
    const byId = id => items.find(i => i.id === id);
    t.deepEq(byId('ok').readings, { class: 'I', earth: '0.05' }, 'a valid readings object is preserved');
    t.notOk('evil' in (byId('junk').readings || {}), 'an unknown readings key is stripped');
    t.notOk(byId('junk').readings && byId('junk').readings.class === 'NOT A CLASS',
      'an invalid reading class is dropped');
    t.notOk('readings' in byId('notobj'), 'a non-object readings value leaves no empty husk');
    t.notOk('readings' in byId('arr'), 'an array readings value leaves no empty husk');
  });

  await t.group('03g — cancelling the restore leaves data untouched', async () => {
    const app = populated();
    const payload = JSON.stringify(app.fn('buildBackup')());
    const st = app.state();
    st.sessions = [];
    const file = new app.sandbox.File([payload], 'b.json', { type: 'application/json' });
    app.fn('restoreBackupFromFile')(file);
    await tick(5);
    confirmSheet(app, 'no');
    t.eq(app.state().sessions.length, 0, 'dismissing the sheet applies nothing');
  });

  await t.group('03h — a non-backup file is rejected, not applied', async () => {
    const app = populated();
    const n = app.state().sessions.length;
    for (const junk of ['this is not json', '{"hello":"world"}', '[]']) {
      const file = new app.sandbox.File([junk], 'x.json', { type: 'application/json' });
      app.fn('restoreBackupFromFile')(file);
      await tick(5);
      // No confirm sheet should be raised at all for an unrecognised file.
      const raised = !!app.doc.getElementById('confirm-sheet-yes');
      if (raised) confirmSheet(app, 'no');
      t.eq(app.state().sessions.length, n, `data untouched by ${JSON.stringify(junk.slice(0, 20))}`);
    }
  });

  await t.group('03i — an older backup still restores (superset rule)', async () => {
    // A relaxed validator must be a SUPERSET of the old one. This is a
    // deliberately sparse pre-v53/v56/v59 shaped backup: no readings, no retest
    // fields, no archivedStats, no instruments.
    const app = freshApp();
    const legacy = {
      appVersion: 'V40',
      backupVersion: 5,
      exportedAt: '2026-01-01T00:00:00.000Z',
      sessions: [{
        id: 'old1', name: 'Old job', site: 'Old Site', engineer: 'Pete',
        date: '2026-01-01', locked: false,
        items: [{ id: 'oi1', assetNo: '1', location: 'Hall', itemType: 'Kettle', notes: '', result: 'pass' }],
      }],
      itemTypes: ['Kettle', 'Drill'],
      engineer: 'Pete',
    };
    const file = new app.sandbox.File([JSON.stringify(legacy)], 'old.json', { type: 'application/json' });
    app.fn('restoreBackupFromFile')(file);
    await tick(5);
    t.ok(confirmSheet(app, 'yes'), 'legacy backup raised the confirm sheet');

    const after = app.state();
    t.eq(after.sessions.length, 1, 'legacy session restored');
    t.eq(after.sessions[0].items[0].assetNo, '1', 'legacy item restored');
    t.ok(Array.isArray(after.itemPresets) && after.itemPresets.length > 0,
      'legacy itemTypes converted into a preset');
    t.ok(after.archivedStats && typeof after.archivedStats === 'object',
      'missing archivedStats yields an empty bucket, not undefined');
    t.doesNotThrow(() => app.fn('save')(), 'the restored legacy state saves cleanly');
  });

  t.group('03j — save/load survives a full cycle through localStorage', () => {
    const app = populated();
    const before = JSON.stringify(app.fn('buildBackup')());
    app.fn('save')();

    // Boot a second app on the same localStorage contents — a real app restart.
    const restarted = freshApp({ localStorage: app.storage._snapshot() });
    const after = JSON.stringify(restarted.fn('buildBackup')());

    const a = JSON.parse(before), b = JSON.parse(after);
    t.deepEq(b.sessions, a.sessions, 'sessions survive a restart');
    t.deepEq(b.instruments, a.instruments, 'instruments survive a restart');

    // KNOWN, BENIGN SHAPE ASYMMETRY — do not "fix" this assertion by deleting it.
    // ensureClient()/ensureSite() create records as {id, name}. loadClients()/
    // loadSites() add the v43 cloud-prep passthrough fields (userId,
    // lastModified) as null on read. So a client created in this session and the
    // same client after a restart are not deep-equal, even though nothing was
    // lost. Every reader treats both shapes defensively. Asserted on identity
    // instead, plus an explicit check that the extra fields are only ever the
    // two known ones — so a field genuinely going missing still fails.
    const idName = arr => arr.map(c => ({ id: c.id, name: c.name }));
    t.deepEq(idName(b.clients), idName(a.clients), 'clients survive a restart (id + name)');
    t.deepEq(idName(b.sites), idName(a.sites), 'sites survive a restart (id + name)');
    const extra = new Set();
    b.clients.forEach(c => Object.keys(c).forEach(k => { if (!['id', 'name'].includes(k)) extra.add(k); }));
    t.deepEq([...extra].sort(), ['lastModified', 'userId'],
      'the only fields load() adds to a client are the two v43 sync fields');
  });
};
