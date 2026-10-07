/* Standing test — daily snapshots (V105, roadmap Stage 10 part 1, S14)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. snapshots.js keeps a copy of exactly what a backup file
   holds in its own IndexedDB database ('patgo-snapshots'), once a day on the
   first open (2A) or when the app comes back to the front, only on days the data
   changed since the newest copy (3B), seven kept (1B), photos never (4A). The
   Backup page lists them with Restore and Save as file (5B). Any restore — file
   or snapshot — first keeps a "before restore" copy, and asks if that copy is
   refused (6A). Switch defaults ON (7A), backed up, not synced; signed in or not
   (8A). A restore is one routine for both: backup.js applyBackupData().

   ⚠ WRITE FIRST, THEN PRUNE is the data-integrity rule here (42d, 42e).
   ⚠ LISTENER RULE (V67): taps go through #app's delegated handlers, and the
     reopen hook is fired through document.dispatchEvent (42i). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, populated, withItem, confirmSheet, tick, restoreFile } = require('../fixture');

function fire(app, type, el) {
  app.doc.getElementById('app').dispatchEvent({
    type, target: el, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
  });
}
function tap(app, action, arg) {
  const el = app.doc.createElement('button');
  el.dataset.action = action;
  if (arg !== undefined) el.dataset.arg = String(arg);
  fire(app, 'click', el);
}
function flip(app, action, checked) {
  const el = app.doc.createElement('input');
  el.type = 'checkbox';
  el.checked = checked;
  el.dataset.changeAction = action;
  fire(app, 'change', el);
}
// ⚠ The database opens asynchronously at boot. Seeding before it has opened
// writes into a store the stub then replaces on upgrade — await ready() first.
const ready = (app) => app.fn('snapshotsLoad')();
const store = (app) => app.sandbox.indexedDB._stores.get('snapshots') || new Map();
const today = (app) => app.run('todayISO()');
// Boot already ran the day's check on an empty phone; tests that then add jobs
// clear the guard, exactly as the next day (or a reopen after a cold start) would.
const fresh = (app) => app.run('_snapCheckedDay = null');
const daily = (app) => app.fn('snapshotsDaily')();
function dayBefore(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function seed(app, id, kind, day, sessions, sig) {
  const json = JSON.stringify({ appVersion: 'V105', backupVersion: 5, exportedAt: day + 'T08:00:00.000Z', sessions });
  store(app).set(id, { id, kind, day, takenAt: day + 'T08:00:00.000Z', sig: sig || ('seed-' + id),
    sessions: sessions.length, items: sessions.reduce((n, s) => n + s.items.length, 0), bytes: json.length * 2, json });
}
const oneJob = (id, asset) => [{ id, name: id, site: 'Seeded', engineer: 'E', date: '2026-10-01', locked: false,
  items: [{ id: id + '-i', assetNo: asset, location: 'Hall', itemType: 'Kettle', notes: '', result: 'pass' }] }];

module.exports = async function run() {

  /* ------------------------------------------------------------------ 42a */
  await t.group('42a — the switch: default ON, written both ways, backed up, restore takes a boolean only (7A)', async () => {
    const app = freshApp();
    t.eq(app.state().snapshotsEnabled, true, 'a phone that never chose has snapshots ON');
    app.state().snapshotsEnabled = false; app.fn('save')();
    t.eq(app.storage.getItem('pat:snapshots'), '0', 'save() writes OFF as 0');
    const back = freshApp({ localStorage: app.storage._snapshot() });
    t.eq(back.state().snapshotsEnabled, false, 'OFF survives a restart');
    app.state().snapshotsEnabled = true; app.fn('save')();
    t.eq(app.storage.getItem('pat:snapshots'), '1', 'save() writes ON as 1');
    const b = JSON.parse(JSON.stringify(app.fn('buildBackup')()));
    t.eq(b.snapshotsEnabled, true, 'the backup carries the switch');
    t.eq(b.backupVersion, 5, 'additive — backupVersion stays 5');
    const apply = app.fn('applyBackupData');
    apply({ sessions: [], snapshotsEnabled: false }, { markExported: false });
    t.eq(app.state().snapshotsEnabled, false, 'restore takes a boolean OFF');
    apply({ sessions: [], snapshotsEnabled: 'no' }, { markExported: false });
    t.eq(app.state().snapshotsEnabled, false, 'a non-boolean leaves the phone\u2019s own');
    apply({ sessions: [] }, { markExported: false });
    t.eq(app.state().snapshotsEnabled, false, 'an older backup without the key leaves the phone\u2019s own');
  });

  /* ------------------------------------------------------------------ 42b */
  await t.group('42b — the day\u2019s copy is exactly a backup file, taken once (2A)', async () => {
    const app = populated();
    fresh(app);
    t.eq(await daily(app), 'taken', 'a phone with a real job gets today\u2019s copy');
    const rec = store(app).get('day-' + today(app));
    t.ok(!!rec, 'stored under day-<today>');
    t.eq(rec && rec.kind, 'daily', 'kind daily');
    const parsed = JSON.parse(rec.json);
    const file = JSON.parse(JSON.stringify(app.fn('buildBackup')()));
    t.deepEq(parsed.sessions, file.sessions, 'the copy holds the jobs exactly as a backup file does');
    t.eq(parsed.backupVersion, 5, 'same backupVersion as a file');
    t.eq(rec.sessions, app.state().sessions.length, 'job count recorded');
    t.eq(rec.items, 3, 'item count recorded');
    t.notOk('photos' in parsed, 'no photos in it (4A)');
    t.eq(await daily(app), 'done', 'a second open the same day does nothing');
    fresh(app);
    t.eq(await daily(app), 'done', '…even after a cold start the same day');
    t.eq(store(app).size, 1, 'still one copy');
    t.eq(app.state().snapList.length, 1, 'the list is published for the Backup page');
    t.ok(app.state().snapBytes > 0, 'with its size');
  });

  /* ------------------------------------------------------------------ 42c */
  await t.group('42c — nothing changed since the newest copy: no new copy (3B); empty or off: none at all', async () => {
    const app = populated();
    fresh(app);
    await daily(app);
    // Make today's copy yesterday's, as if it were taken then.
    const rec = store(app).get('day-' + today(app));
    store(app).delete(rec.id);
    const y = dayBefore(today(app), 1);
    store(app).set('day-' + y, Object.assign({}, rec, { id: 'day-' + y, day: y }));
    fresh(app);
    t.eq(await daily(app), 'same', 'no change since yesterday → no copy today');
    t.eq(store(app).size, 1, 'still only yesterday\u2019s');
    // An export alone is not a change.
    app.fn('markBackupExported')();
    fresh(app);
    t.eq(await daily(app), 'same', 'exporting a backup is not a change to the work');
    withItem(app, { assetNo: 'ZZSNAP-NEW' });
    fresh(app);
    t.eq(await daily(app), 'taken', 'one more item → today\u2019s copy is taken');
    t.eq(store(app).size, 2, 'yesterday\u2019s and today\u2019s');

    const empty = freshApp();
    fresh(empty);
    t.eq(await daily(empty), 'empty', 'a phone with no jobs keeps nothing');
    t.eq(store(empty).size, 0, 'nothing written');
    const demo = freshApp();
    demo.state().sessions = [Object.assign(oneJob('demo1', '1')[0], { isExample: true })];
    fresh(demo);
    t.eq(await daily(demo), 'empty', 'the example job alone does not count');

    const off = populated();
    off.state().snapshotsEnabled = false;
    fresh(off);
    t.eq(await daily(off), 'off', 'switched off → nothing');
    t.eq(store(off).size, 0, 'nothing written');
  });

  /* ------------------------------------------------------------------ 42d */
  await t.group('42d — seven kept: the oldest goes, AFTER the new one is in (1B)', async () => {
    const app = populated();
    await ready(app);
    for (let n = 1; n <= 7; n++) seed(app, 'day-' + dayBefore(today(app), n), 'daily', dayBefore(today(app), n), oneJob('s' + n, String(n)));
    seed(app, 'before-restore', 'before', dayBefore(today(app), 9), oneJob('br', 'B'));
    fresh(app);
    t.eq(await daily(app), 'taken', 'today\u2019s taken');
    const ids = [...store(app).keys()];
    t.eq(ids.filter(id => id.startsWith('day-')).length, 7, 'seven daily copies');
    t.ok(ids.includes('day-' + today(app)), 'today\u2019s is one of them');
    t.notOk(ids.includes('day-' + dayBefore(today(app), 7)), 'the oldest has gone');
    t.ok(ids.includes('day-' + dayBefore(today(app), 6)), 'the next oldest stays');
    t.ok(ids.includes('before-restore'), 'the safety copy is not one of the seven and is never pruned');
    const list = app.state().snapList;
    t.eq(list[0].id, 'before-restore', 'listed first: the safety copy');
    t.eq(list[1].id, 'day-' + today(app), 'then newest first');
    t.eq(list.length, 8, 'eight rows');
  });

  /* ------------------------------------------------------------------ 42e */
  await t.group('42e — a refused write loses nothing, and says so (write-first)', async () => {
    const app = populated();
    await ready(app);
    for (let n = 1; n <= 7; n++) seed(app, 'day-' + dayBefore(today(app), n), 'daily', dayBefore(today(app), n), oneJob('s' + n, String(n)));
    // The phone is full: a NEW record is refused; deleting still works (as it
    // does on a real full phone). So pruning first would lose the oldest copy.
    app.run(`(() => { const real = _snapTx; window.__realSnapTx = real;
      _snapTx = (mode, work) => real(mode, (st) => {
        st.put = () => { throw Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' }); };
        return work(st);
      }); })()`);
    fresh(app);
    t.eq(await daily(app), 'failed', 'reported as failed');
    t.eq(store(app).size, 7, 'all seven older copies are still there');
    t.ok(store(app).has('day-' + dayBefore(today(app), 7)), 'including the oldest');
    t.eq(app.storage.getItem('pat:snapshotFailDay'), today(app), 'the failure day is noted');
    t.includes(app.fn('snapshotsSectionHTML')(), 'didn\'t save', 'the Backup page says so');
    t.eq(await daily(app), 'done', 'not retried on every reopen the same day');
    app.run('_snapTx = window.__realSnapTx');
    fresh(app);
    t.eq(await daily(app), 'taken', 'space back → taken');
    t.eq(app.storage.getItem('pat:snapshotFailDay'), null, 'the note clears on success');
    t.excludes(app.fn('snapshotsSectionHTML')(), 'didn\'t save', '…and leaves the page');
  });

  /* ------------------------------------------------------------------ 42f */
  await t.group('42f — any restore keeps a copy of what was there first; refused → asked (6A)', async () => {
    const app = populated();
    const before = JSON.parse(JSON.stringify(app.state().sessions));
    const incoming = { appVersion: 'V105', backupVersion: 5, exportedAt: '2026-10-01T00:00:00.000Z', sessions: oneJob('fileJob', 'F1') };
    await restoreFile(app, new app.sandbox.File([JSON.stringify(incoming)], 'b.json', { type: 'application/json' }));
    t.ok(confirmSheet(app, 'yes'), 'the restore confirm sheet is raised');
    await tick(30);
    const safe = store(app).get('before-restore');
    t.ok(!!safe, 'a "before restore" copy was kept');
    t.deepEq(JSON.parse(safe.json).sessions, before, '…holding the jobs the restore replaced');
    t.eq(app.state().sessions[0].id, 'fileJob', 'and the file was restored');
    t.ok(!!app.state().lastBackupAt, 'a FILE restore still counts as backed up');

    // The copy is refused: nothing happens until the engineer chooses.
    const app2 = populated();
    const had = app2.state().sessions[0].id;
    app2.run(`_snapTx = (mode, work) => Promise.reject(new Error('QuotaExceededError'))`);
    await restoreFile(app2, new app2.sandbox.File([JSON.stringify(incoming)], 'b.json', { type: 'application/json' }));
    confirmSheet(app2, 'yes');
    await tick(30);
    t.eq(app2.state().sessions[0].id, had, 'not restored while the copy is refused');
    t.ok(confirmSheet(app2, 'no'), 'a second sheet asks');
    t.eq(app2.state().sessions[0].id, had, 'Cancel restores nothing');
    await restoreFile(app2, new app2.sandbox.File([JSON.stringify(incoming)], 'b.json', { type: 'application/json' }));
    confirmSheet(app2, 'yes');
    await tick(30);
    t.ok(confirmSheet(app2, 'yes'), 'Restore anyway');
    t.eq(app2.state().sessions[0].id, 'fileJob', '…restores');
  });

  /* ------------------------------------------------------------------ 42g */
  await t.group('42g — restoring a snapshot: through the tap, the same apply, undoable, not "backed up" (5B, 6A)', async () => {
    const app = populated();
    const mine = JSON.parse(JSON.stringify(app.state().sessions));
    await ready(app);
    const y = dayBefore(today(app), 1);
    seed(app, 'day-' + y, 'daily', y, oneJob('yesterday', 'Y1'));
    await app.fn('snapshotsLoad')();
    app.state().lastBackupAt = null;
    tap(app, 'snapshot-restore', 'day-' + y);
    t.ok(confirmSheet(app, 'yes'), 'the tap raised the confirm sheet');
    await tick(30);
    t.eq(app.state().sessions.length, 1, 'the snapshot replaced the jobs');
    t.eq(app.state().sessions[0].id, 'yesterday', '…with its own');
    t.eq(app.state().lastBackupAt, null, 'a snapshot restore does NOT count as backed up');
    t.deepEq(JSON.parse(store(app).get('before-restore').json).sessions, mine, 'what was there is kept');
    // Undo: restore the safety copy itself.
    tap(app, 'snapshot-restore', 'before-restore');
    t.ok(confirmSheet(app, 'yes'), 'restore the safety copy');
    await tick(30);
    t.deepEq(JSON.parse(JSON.stringify(app.state().sessions)), mine, 'the undo puts the jobs back');
    t.eq(JSON.parse(store(app).get('before-restore').json).sessions[0].id, 'yesterday', '…and the safety copy now holds what the undo replaced');
    // (The stub keeps closed sheets' ids registered, so count the opens instead.)
    app.run(`(() => { window.__sheets = 0; const real = openConfirmSheet; openConfirmSheet = (o) => { window.__sheets++; return real(o); }; })()`);
    tap(app, 'snapshot-restore', 'no-such-id');
    t.eq(app.run('window.__sheets'), 0, 'a snapshot that has gone raises no confirm sheet');
    tap(app, 'snapshot-restore', 'before-restore');
    t.eq(app.run('window.__sheets'), 1, '…while one that is there does (the spy works)');
  });

  /* ------------------------------------------------------------------ 42h */
  await t.group('42h — Save as file: an ordinary backup file, UK name, not "backed up" (5B)', async () => {
    const app = populated();
    fresh(app);
    await daily(app);
    const blobs = [];
    const urlObj = app.sandbox.URL;
    const realCreate = urlObj.createObjectURL;
    urlObj.createObjectURL = (b) => { blobs.push(b); return realCreate.call(urlObj, b); };
    const anchors = [];
    const realEl = app.doc.createElement;
    app.doc.createElement = (tag) => { const el = realEl.call(app.doc, tag); if (tag === 'a') anchors.push(el); return el; };
    app.state().lastBackupAt = null;
    tap(app, 'snapshot-save', 'day-' + today(app));
    const iso = today(app).split('-');
    t.eq(anchors.length && anchors[anchors.length - 1].download, `PAT backup ${iso[2]}-${iso[1]}-${iso[0]} snapshot.json`, 'UK date, spaces, no underscores');
    const text = blobs.length ? await blobs[blobs.length - 1].text() : '';
    const parsed = (() => { try { return JSON.parse(text); } catch (e) { return null; } })();
    t.ok(parsed && Array.isArray(parsed.sessions), 'the file is a backup');
    t.deepEq(parsed && parsed.sessions, JSON.parse(JSON.stringify(app.state().sessions)), 'holding the jobs');
    t.includes(text, '\n  "', 'pretty-printed like Export backup');
    t.eq(app.state().lastBackupAt, null, 'saving a snapshot does not stamp the backup as exported');
  });

  /* ------------------------------------------------------------------ 42i */
  await t.group('42i — the Backup page and the reopen hook, through the real surfaces', async () => {
    const app = populated();
    fresh(app);
    await daily(app);
    app.state().view = 'settingsBackup';
    app.fn('render')();
    const html = app.doc.getElementById('app').innerHTML;
    t.includes(html, '<h2 class="h2">Daily snapshots</h2>', 'the section is on the Backup page');
    t.includes(html, 'id="snapshots-block"', 'with its paint-in-place target');
    t.includes(html, 'data-action="snapshot-restore" data-arg="day-' + today(app) + '"', 'a Restore button per copy');
    t.includes(html, 'data-action="snapshot-save"', 'and Save as file');
    t.includes(html, '1 snapshot · ', 'the count and size line');
    t.includes(html, 'data-change-action="snapshots-toggle"', 'the switch');
    // The switch through the delegated change handler.
    flip(app, 'snapshots-toggle', false);
    t.eq(app.state().snapshotsEnabled, false, 'switched off');
    t.eq(app.storage.getItem('pat:snapshots'), '0', 'persisted at once');
    fresh(app);
    t.eq(await daily(app), 'off', 'and no copy is taken');
    flip(app, 'snapshots-toggle', true);
    t.eq(app.storage.getItem('pat:snapshots'), '1', 'back on');

    // The reopen hook: fired through document, as the browser fires it.
    const app2 = populated();
    fresh(app2);
    app2.doc.visibilityState = 'visible';
    app2.doc.dispatchEvent({ type: 'visibilitychange' });
    await tick(40);
    t.ok(store(app2).has('day-' + today(app2)), 'coming back to the front takes the day\u2019s copy');
    const hooks = (app2.doc._listeners.visibilitychange || []).filter(fn => fn === app2.run('_snapOnVisible'));
    t.eq(hooks.length, 1, 'hooked exactly once');
  });

  /* ------------------------------------------------------------------ 42j */
  t.group('42j — wiring: optional subsystem, load order, precache, boot placement, release copy', () => {
    const idx = fs.readFileSync(path.join(APP_DIR, 'index.html'), 'utf8');
    const a = idx.indexOf('<script src="backup.js">'), b = idx.indexOf('<script src="snapshots.js">'), c = idx.indexOf('<script src="session.js">');
    t.ok(a > -1 && b > a && c > b, 'index.html: backup → snapshots → session');
    const sw = fs.readFileSync(path.join(APP_DIR, 'sw.js'), 'utf8');
    t.includes(sw, "'./snapshots.js',", 'precached');
    // V106: the four release pins (cache key, APP_VERSION, WELCOME_VERSION, welcome
    // copy) retired — 43j pins the current release.
    const boot = fs.readFileSync(path.join(APP_DIR, 'boot.js'), 'utf8');
    const probe = boot.slice(boot.indexOf('const requiredFns = ['), boot.indexOf('];', boot.indexOf('const requiredFns = [')));
    t.excludes(probe, 'snapshot', 'NOT probed — optional subsystem (MAP rule 6)');
    const call = boot.indexOf('snapshotsBoot()');
    t.ok(call > -1 && call < boot.indexOf('}   // end if (_bootLoadOK)'), 'started inside the good-load block');
    t.ok(call > boot.indexOf('photoIndexLoad()'), 'after the first render');
    const disp = fs.readFileSync(path.join(APP_DIR, 'dispatch.js'), 'utf8');
    for (const k of ['snapshot-restore', 'snapshot-save', 'snapshots-toggle']) t.includes(disp, `'${k}':`, `dispatch wires ${k}`);
    const sync = fs.readFileSync(path.join(APP_DIR, 'sync.js'), 'utf8');
    t.excludes(sync, 'snapshotsEnabled', 'the switch is not synced (about this phone)');
    // Rule 6 the other way: with snapshots.js gone the app boots and restores as before.
    const bare = freshApp({ skip: ['snapshots.js'] });
    t.eq(bare.run('typeof snapshotsBoot'), 'undefined', 'boots without snapshots.js');
    t.doesNotThrow(() => { bare.state().view = 'settingsBackup'; bare.fn('render')(); }, 'the Backup page renders without it');
    t.excludes(bare.doc.getElementById('app').innerHTML, 'Daily snapshots', '…without the section');
  });
};
