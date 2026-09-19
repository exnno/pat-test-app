/* Standing test — the deletion ledger and record ids (V78)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Deleting a job, client or site still removes it from
   state exactly as before, but now also leaves an entry in state.tombstones
   saying what was deleted and when. Nothing in the shipped app READS that
   ledger — the sync layer will. New records get an id from newId() instead of
   uid().

   ⚠ WHY THE LEDGER IS SEPARATE, AND WHAT 14g PROTECTS. The obvious design is a
   `deleted: true` flag on the record. It was rejected because it puts the
   burden on every READ path in the app — session lists, client and site
   pickers, CSV export, report generation, SQP source lists — and the single one
   that forgets to filter shows the engineer a client they deleted. 14g is the
   anti-decay assertion: it fails if a `deleted` flag is ever written onto a
   client, site or session record, because the day that happens the read-path
   audit this design exists to avoid becomes mandatory and nobody will know.

   ⚠ WHY THESE DRIVE THE CONFIRM SHEET RATHER THAN CALLING onConfirm. Every
   delete in clients.js is wrapped in openConfirmSheet, and the ledger call is
   inside the callback. Reaching in and calling deleteClient() alone proves
   nothing — the sheet is where the wiring can break. Same rule as 13a/13b.

   ⚠ WHAT THIS FILE CANNOT PROVE. There is no server. Nothing here shows that a
   tombstone is transmitted, applied by a peer, or correctly ordered against a
   concurrent edit. It proves only that the ledger is written, bounded, durable
   across save/load, and carried through backup — which is everything the sync
   layer will depend on being true before it is written. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, populated, withSession, confirmSheet, CANARY } = require('../fixture');

function read(f) {
  return fs.readFileSync(path.join(APP_DIR, f), 'utf8');
}

/* Comments must be stripped before source-asserting — the V75/V76 lesson. The
   whole design rationale for NOT using a `deleted` flag is written in config.js
   and in this file's own header, and both name the identifier under discussion,
   so a raw search finds the explanation and reports the thing as present. */
function stripJsComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function tombstonesFor(app, kind) {
  return (app.state().tombstones || []).filter(x => x.kind === kind);
}

module.exports = async function () {
  /* ------------------------------------------------------------------ 14a */
  t.group('14a — deleting a job leaves a tombstone and removes the job', () => {
    const app = populated();
    const sess = app.fn('activeSession')();
    const id = sess.id;

    t.eq((app.state().tombstones || []).length, 0, 'a fresh app has an empty ledger');

    app.fn('deleteSession')(id);

    t.eq(app.state().sessions.filter(s => s.id === id).length, 0, 'the job is gone from state');
    const marks = tombstonesFor(app, 'session');
    t.eq(marks.length, 1, 'exactly one session tombstone was written');
    t.eq(marks[0].id, id, 'it names the deleted job');
    t.ok(!isNaN(Date.parse(marks[0].at)), 'it carries a parseable timestamp');
  });

  /* ------------------------------------------------------------------ 14b */
  t.group('14b — deleting an unknown job writes nothing', () => {
    const app = populated();
    const before = (app.state().tombstones || []).length;

    app.fn('deleteSession')('no-such-session-id');

    t.eq((app.state().tombstones || []).length, before,
      'a delete for an id that was never there leaves no tombstone');
  });

  /* ------------------------------------------------------------------ 14c */
  t.group('14c — deleting a client tombstones the client AND its sites', () => {
    const app = freshApp();
    app.fn('ensureClient')('ZZCANARYCLIENT');
    const client = app.state().clients.find(c => c.name === 'ZZCANARYCLIENT');
    app.fn('ensureSite')(client.id, 'ZZCANARYSITE-A');
    app.fn('ensureSite')(client.id, 'ZZCANARYSITE-B');
    const siteIds = app.state().sites.filter(s => s.clientId === client.id).map(s => s.id);
    t.ok(siteIds.length >= 2, 'the client has the sites that were added to it');

    app.fn('deleteClient')(client.id);
    t.ok(confirmSheet(app, 'yes'), 'the confirm sheet was open and was driven through the button');

    t.eq(app.state().clients.filter(c => c.id === client.id).length, 0, 'the client is gone');
    t.eq(app.state().sites.filter(s => s.clientId === client.id).length, 0, 'its sites are gone');

    const clientMarks = tombstonesFor(app, 'client');
    t.eq(clientMarks.length, 1, 'one client tombstone');
    t.eq(clientMarks[0].id, client.id, 'naming the deleted client');

    const siteMarks = tombstonesFor(app, 'site').map(m => m.id).sort();
    t.deepEq(siteMarks, siteIds.slice().sort(),
      'EVERY child site is tombstoned too — a cascade that only marks the parent leaves the children to come back');
  });

  /* ------------------------------------------------------------------ 14d */
  t.group('14d — cancelling the confirm sheet writes no tombstone', () => {
    const app = freshApp();
    app.fn('ensureClient')('ZZCANARYCLIENT');
    const client = app.state().clients.find(c => c.name === 'ZZCANARYCLIENT');

    app.fn('deleteClient')(client.id);
    t.ok(confirmSheet(app, 'no'), 'the confirm sheet was open');

    t.eq(app.state().clients.filter(c => c.id === client.id).length, 1, 'the client survives');
    t.eq((app.state().tombstones || []).length, 0,
      'and nothing was marked deleted — the ledger must sit INSIDE onConfirm, not beside it');
  });

  /* ------------------------------------------------------------------ 14e */
  t.group('14e — re-deleting an id updates its timestamp, never appends', () => {
    const app = freshApp();
    app.fn('recordTombstone')('session', 'dup-id');
    const first = app.state().tombstones[0].at;
    app.fn('recordTombstone')('session', 'dup-id');

    t.eq(app.state().tombstones.length, 1, 'still one entry, not two');
    t.ok(app.state().tombstones[0].at >= first, 'and its timestamp moved forward, not back');

    app.fn('recordTombstone')('nonsense-kind', 'x');
    app.fn('recordTombstone')('session', '');
    t.eq(app.state().tombstones.length, 1,
      'an unknown kind and an empty id are both refused');
  });

  /* ------------------------------------------------------------------ 14f */
  t.group('14f — the ledger is bounded, and survives save/load and backup', () => {
    const app = freshApp();
    const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    const purged = app.fn('purgeTombstones')([
      { kind: 'session', id: 'ancient', at: old },
      { kind: 'session', id: 'fresh',   at: recent },
      { kind: 'session', id: 'broken',  at: 'not-a-date' },
    ]);
    const ids = purged.map(p => p.id).sort();
    t.deepEq(ids, ['broken', 'fresh'],
      'entries past the window are dropped, and an unparseable date is KEPT — losing a tombstone resurrects a record');

    app.state().tombstones = [{ kind: 'client', id: 'keep-me', at: recent }];
    app.fn('save')();
    app.fn('load')();
    t.eq(tombstonesFor(app, 'client').length, 1, 'the ledger round-trips through save() and load()');

    const backup = app.fn('buildBackup')();
    t.ok(Array.isArray(backup.tombstones), 'the backup carries a tombstones array');
    t.eq(backup.tombstones.length, 1, 'with the entry in it');
    t.eq(backup.backupVersion, 5,
      'and backupVersion is UNCHANGED — this is an additive, missing-field-tolerant field');
  });

  /* ------------------------------------------------------------------ 14g */
  t.group('14g — no `deleted` flag has crept onto a record (anti-decay)', () => {
    for (const f of ['clients.js', 'session.js', 'storage.js', 'backup.js']) {
      const src = stripJsComments(read(f));
      t.ok(!/\.deleted\s*=\s*true/.test(src),
        `${f} does not stamp a deleted flag onto a record`);
      t.ok(!/deleted:\s*true/.test(src),
        `${f} does not construct a record carrying deleted: true`);
    }
  });

  /* ------------------------------------------------------------------ 14h */
  t.group('14h — every removal path records before it removes', () => {
    const clients = stripJsComments(read('clients.js'));
    const session = stripJsComments(read('session.js'));

    /* Ordering, not presence. A recordTombstone() call placed AFTER the filter
       reads an id that is still in scope and looks correct, but for deleteClient
       the child sites have already gone — so the cascade silently marks nothing.
       These compare source positions rather than trusting that the call exists. */
    const beforeFilter = (src, mark, removal) => {
      const m = src.indexOf(mark);
      const r = src.indexOf(removal);
      return m !== -1 && r !== -1 && m < r;
    };

    t.ok(beforeFilter(clients, "recordTombstone('client', clientId)",
      'state.clients = state.clients.filter(c => c.id !== clientId)'),
      'deleteClient marks the client before the filter');
    t.ok(beforeFilter(clients, "if (s.clientId === clientId) recordTombstone('site', s.id)",
      'state.sites = state.sites.filter(s => s.clientId !== clientId)'),
      'and sweeps its sites before they are unreachable');
    t.ok(beforeFilter(clients, "recordTombstone('site', siteId)",
      'state.sites = state.sites.filter(s => s.id !== siteId)'),
      'deleteSite marks before the filter');
    t.ok(beforeFilter(session, "recordTombstone('session', id)",
      'state.sessions = state.sessions.filter(s => s.id !== id)'),
      'deleteSession marks before the filter');
    t.ok(beforeFilter(session, "recordTombstone('preset', id)",
      'state.itemPresets.splice(idx, 1)'),
      'deletePreset marks before the splice');

    t.ok(/recordTombstone\('site', site\.id\)/.test(clients),
      'the assign-merge path marks the site it drops — a merge is a delete to every other device');
  });

  /* ------------------------------------------------------------------ 14i */
  t.group('14i — prune is deliberately NOT a tombstone (V78 decision C)', () => {
    const app = populated();
    const sess = withSession(app, { site: 'ZZCANARYPRUNE' });
    const st = app.state();
    const target = st.sessions.find(s => s.id === sess.id);
    target.date = '2020-01-01';
    const before = (st.tombstones || []).length;

    const ids = new Set([target.id]);
    st.sessions = st.sessions.filter(s => !ids.has(s.id));
    app.fn('save')();

    t.eq((app.state().tombstones || []).length, before,
      'clearing old sessions from this device is local housekeeping and must not delete them everywhere');

    const src = stripJsComments(read('session.js'));
    const pruneAt = src.indexOf('state.sessions = state.sessions.filter(s => !ids.has(s.id))');
    const window = src.slice(Math.max(0, pruneAt - 600), pruneAt);
    t.ok(pruneAt !== -1, 'the prune path is still where this test thinks it is');
    t.ok(!/recordTombstone/.test(window),
      'and no tombstone call has been added to it — revisit this in the sync release, not before');
  });

  /* ------------------------------------------------------------------ 14j */
  t.group('14j — newId is used for new records and old ids are untouched', () => {
    const src = stripJsComments(read('utils.js'));
    t.ok(/const newId =/.test(src), 'newId exists in utils.js');
    t.ok(/randomUUID/.test(src), 'and reaches for crypto.randomUUID');
    t.ok(/Date\.now\(\)\.toString\(36\)/.test(src),
      'with the uid() shape kept inline as a fallback rather than calling uid() across files');

    /* newId is a top-level `const`, so the harness cannot resolve it by name the
       way it resolves a function declaration — asserting on its BEHAVIOUR here is
       not possible without changing how it is declared, and this file will not
       reshape shipped code to suit a test. What CAN be checked, and is the thing
       that actually decays, is that every site which mints an id calls it. */
    for (const f of ['clients.js', 'session.js', 'storage.js', 'photos.js', 'instruments.js']) {
      const src = stripJsComments(read(f));
      t.ok(!/\buid\(\)/.test(src),
        `${f} mints no new record id through uid() any more`);
    }
    t.ok(/\bnewId\(\)/.test(stripJsComments(read('clients.js'))),
      'clients and sites are minted with newId');
    t.ok(/\bnewId\(\)/.test(stripJsComments(read('session.js'))),
      'sessions, items and presets are minted with newId');

    /* The migration promise: nothing rewrites ids that already exist. If any file
       ever maps over stored records reassigning id, this fails. */
    for (const f of ['storage.js', 'backup.js']) {
      const s = stripJsComments(read(f));
      t.ok(!/\.id\s*=\s*newId\(\)/.test(s),
        `${f} never reassigns an existing record's id`);
    }
  });
};
