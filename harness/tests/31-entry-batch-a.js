/* Standing test — V94 field batch A, part 1: location count, Multi Pick tiles
   in Quick Pick, Undo (roadmap Stage 3; spec 1A 2A 6 7 9B 11D 12A 13A 14A 15A 16B)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID.
   • (6) The item readout says how many items of THIS job are at the form's
     location: "Item 21 (new) · 15 at this location". Repainted in place when
     the location is confirmed (no render).
   • (7, 12A, 13A) A multi-pick given a Quick Pick slot (`qp` 1|2|3) shows as a
     tile on the grid's bottom row (1 right, 2 middle, 3 left), taking a type's
     cell. Tap = select (like a type), PASS = log the whole list; FAIL greys
     while one is selected. First item takes the Asset box and the form's note.
     `qp` syncs with its multi-pick, only when set.
   • (8, 9B, 14A, 15A, 16B) ↶ Undo beside Copy last, per phone, off by default.
     Takes back the last logging action (a batch as one) after asking, only
     while those items are still last and unchanged.

   ⚠ LISTENER RULE (V67). Taps go through #app's delegated click; the location
   count is driven through the field's real onblur; the type field through its
   real oninput; the confirm through the sheet's real button. */

'use strict';

const t = require('../assert');
const { freshApp, withSession, withItem, confirmSheet, tick } = require('../fixture');

function tap(app, action, arg) {
  const el = app.doc.createElement('button');
  el.dataset.action = action;
  if (arg !== undefined) el.dataset.arg = String(arg);
  app.doc.getElementById('app').dispatchEvent({
    type: 'click', target: el, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
  });
}
const html = (app) => app.doc.getElementById('app').innerHTML;
const byId = (app, id) => app.doc.getElementById(id);

const NINE = ['Kettle', 'Lead', 'Toaster', 'Fan', 'Heater', 'Lamp', 'Drill', 'Radio', 'Charger'];

// An app on the entry screen of a fresh job, preset of nine types.
function entryApp(o = {}) {
  const app = freshApp(o.boot || {});
  const st = app.state();
  st.itemTypes = NINE.slice();
  withSession(app, { site: 'ZZV94SITE' });
  st.view = 'entry';
  if (o.multiPick) st.multiPick = app.fn('normaliseMultiPickConfig')(o.multiPick);
  app.fn('render')();
  return app;
}
function toasts(app) {
  const said = [];
  const real = app.sandbox.showToast;
  app.sandbox.showToast = (m) => { said.push(String(m)); return real(m); };
  return said;
}
const DESK = { enabled: false, slots: [
  { name: 'Desk PC', items: ['Lead', 'PC', 'Monitor'], qp: 1 },
  { name: 'Kitchen', items: ['Kettle', 'Toaster'], qp: 3 },
] };

module.exports = async function run() {

  /* ------------------------------------------------------------------ 31a */
  await t.group('31a — the location count rides the item readout (6)', async () => {
    const app = entryApp();
    const st = app.state();
    t.excludes(html(app), 'at this location', 'blank location: no count shown');

    withItem(app, { assetNo: '1', location: 'Office 1', itemType: 'Kettle' });
    withItem(app, { assetNo: '2', location: 'office  1 ', itemType: 'Lead' });
    withItem(app, { assetNo: '3', location: 'Kitchen', itemType: 'Fan' });
    st.form.location = 'OFFICE 1';
    app.fn('render')();
    t.includes(html(app), 'Item 4 (new)<span class="loc-count" id="loc-count"> · 2 at this location</span>',
      'new item: "· 2 at this location" — case and spaces ignored, other rooms not counted');

    st.cursor = 0; app.fn('loadFormForCursor')(); app.fn('render')();
    t.includes(html(app), 'Item 1 of 3', 'existing item readout as before');
    t.includes(html(app), ' · 2 at this location', 'existing item: the count includes itself');

    st.cursor = 3; app.fn('loadFormForCursor')(); app.fn('render')();   // carried "Kitchen"
    // Through the field's REAL blur handler, SQP off → no render, in-place count.
    const loc = byId(app, 'f-location');
    t.ok(loc && typeof loc.onblur === 'function', 'the location field has its blur handler (precondition)');
    loc.dataset.original = 'Kitchen';
    loc.value = 'office 1';
    const before = html(app);
    loc.onblur({ target: loc });
    await tick(200);
    t.eq(byId(app, 'loc-count').textContent, ' · 2 at this location', 'confirming a new location repaints the count in place');
    t.eq(html(app), before, '…without re-rendering the screen');
    loc.dataset.original = 'office 1'; loc.value = 'Store';
    loc.onblur({ target: loc });
    await tick(200);
    t.eq(byId(app, 'loc-count').textContent, ' · 0 at this location', 'a new room reads 0');
    t.eq(app.fn('locationCountInJob')(app.fn('activeSession')(), '   '), null, 'whitespace-only location → null (nothing shown)');
  });

  /* ------------------------------------------------------------------ 31b */
  t.group('31b — the multi-pick config keeps a valid, unclashing tile slot (7, 13A)', () => {
    const app = freshApp();
    const norm = app.fn('normaliseMultiPickConfig');
    const c = norm({ enabled: true, slots: [
      { name: 'A', items: ['x'], qp: 2 },
      { name: 'B', items: ['y'], qp: 2 },       // clash: first wins
      { name: 'C', items: ['z'], qp: 7 },       // out of range
      { name: 'D', items: ['w'], qp: '1' },     // string from a <select>
      { name: 'E', items: ['v'] },
    ] });
    t.eq(c.slots.map(s => s.qp === undefined ? '-' : s.qp).join(','), '2,-,-,1,-', 'clash → first wins; out of range dropped; "1" accepted');
    t.notOk('qp' in c.slots[4], 'an unassigned multi-pick has NO qp key (V93 shape)');
    const st = app.state();
    st.multiPick = c;
    t.eq(app.fn('qpTiles')().map(x => x.qp + ':' + x.slot.name).join(' '), '1:D 2:A', 'qpTiles: assigned ones, by slot number');

    // Settings page: picking a slot clears it from every other row.
    const mk = (id, v) => { const el = app.doc.register(id, 'select'); el.classList.add('mp-slot-qp'); el.value = v; return el; };
    const a = mk('zzqp-a', '1'), b = mk('zzqp-b', '2'), c2 = mk('zzqp-c', '');
    c2.value = '1';
    app.fn('mpQpPicked')(c2);
    t.eq([a.value, b.value, c2.value].join('|'), '|2|1', 'choosing slot 1 on one row clears it from the row that had it');
  });

  /* ------------------------------------------------------------------ 31c */
  t.group('31c — tiles on the grid: bottom row, the preset fills the rest (7)', () => {
    const plain = entryApp();
    const h0 = html(plain);
    t.excludes(h0, 'qp-tile', 'nothing assigned: no tiles');
    t.eq((h0.match(/data-action="quick-pick"/g) || []).length, 9, 'nothing assigned: all nine types, as before');

    const app = entryApp({ multiPick: DESK });
    const h = html(app);
    t.eq((h.match(/data-action="quick-pick"/g) || []).length, 7, 'two tiles: seven types');
    t.excludes(h, 'data-arg="Radio"', 'the preset\u2019s last types are the ones that drop off');
    t.includes(h, 'class="quick-btn qp-tile qp-tile-1 " data-action="qp-tile" data-arg="1">', 'slot 1 tile, enabled on a new item');
    t.includes(h, 'qp-tile-3', 'slot 3 tile');
    t.includes(h, '＋</span>Desk PC', 'the tile shows the multi-pick\u2019s name with ＋');

    withItem(app, { assetNo: '1', location: 'Office', itemType: 'Kettle' });
    const st = app.state();
    st.cursor = 0; app.fn('loadFormForCursor')(); app.fn('render')();
    t.includes(html(app), 'data-arg="1" disabled>', 'on an existing item the tiles are greyed');
    st.cursor = 1; app.fn('loadFormForCursor')();
    app.fn('activeSession')().locked = true; app.fn('render')();
    t.includes(html(app), 'data-arg="1" disabled>', 'on a locked job the tiles are greyed (and it renders — no TDZ)');
  });

  /* ------------------------------------------------------------------ 31d */
  t.group('31d — a tile selects like a type; FAIL greys; a type or typing swaps back (12A)', () => {
    const app = entryApp({ multiPick: DESK });
    const st = app.state();
    st.form.itemType = 'Kettle';
    tap(app, 'qp-tile', 1);
    t.eq(st.form.qpTile, 1, 'tap → the tile is selected');
    t.eq(st.form.itemType, '', '…and the item type cleared (the tile replaces it)');
    t.eq(byId(app, 'fail-btn').disabled, true, 'FAIL greyed in place');
    app.fn('render')();
    t.includes(html(app), 'class="fail-btn" id="fail-btn" data-action="log-fail" disabled', 'a render keeps FAIL greyed');
    t.includes(html(app), 'qp-tile-1 active', 'a render keeps the tile highlighted');

    tap(app, 'quick-pick', 'Lead');
    t.notOk(st.form.qpTile, 'tapping a type deselects the tile');
    t.eq(byId(app, 'fail-btn').disabled, false, '…and FAIL is back');

    tap(app, 'qp-tile', 3);
    app.fn('render')();
    const ft = byId(app, 'f-type');
    ft.oninput({ target: { value: 'Mixer' } });
    t.notOk(st.form.qpTile, 'typing in the custom box deselects the tile (through the field\u2019s real oninput)');
    t.eq(st.form.itemType, 'Mixer', '…and the typed type stands');

    tap(app, 'qp-tile', 1);
    const n = app.fn('activeSession')().items.length;
    tap(app, 'log-fail');
    t.eq(app.fn('activeSession')().items.length, n, 'FAIL with a tile selected logs nothing');
    t.notOk(st.failModalOpen, '…and opens no fail sheet');
  });

  /* ------------------------------------------------------------------ 31e */
  await t.group('31e — PASS with a tile logs the whole list, exactly like an item (12A)', async () => {
    const app = entryApp({ multiPick: DESK });
    const st = app.state();
    st.sqpEnabled = true; st.sqpHistory = {};
    st.readingsEnabled = true;
    const said = toasts(app);

    tap(app, 'qp-tile', 1);
    st.form.location = '';
    tap(app, 'log-pass');
    t.eq(app.fn('activeSession')().items.length, 0, 'no location → nothing logged');
    t.includes(said.join('|'), 'location', '…and it says so');

    st.form.location = 'Office 2';
    st.form.assetNo = 'ABC-007';
    st.form.notes = 'Under desk';
    tap(app, 'log-pass');
    const items = app.fn('activeSession')().items;
    t.eq(items.map(i => i.itemType).join(','), 'Lead,PC,Monitor', 'the whole list, in order (types cased as the app cases them)');
    t.eq(items.map(i => i.assetNo).join(','), 'ABC-007,ABC-008,ABC-009', 'first takes the Asset box; the rest number on');
    t.eq(items.map(i => i.notes).join('|'), 'Under desk||', 'the note goes on the first item only');
    t.ok(items.every(i => i.result === 'pass' && i.location === 'Office 2' && i.ts && i.id), 'all PASS, the location, stamped, with ids');
    t.eq(new Set(items.map(i => i.id)).size, 3, 'three distinct ids');
    t.notOk(st.readingsSheetOpen, 'no readings sheet, even with Test Readings on');
    t.notOk(st.form.qpTile, 'the tile is cleared after logging, like a type');
    t.eq(st.cursor, 3, 'lands on the next new item');
    t.eq(st.sqpHistory['office 2'] && st.sqpHistory['office 2'].Monitor, 1, 'Smart Quick Pick learns each item');
    t.includes(said.join('|'), 'Added 3 items — Desk PC', 'toast names the batch');
    const saved = app.storage.getItem('pat:sessions') || '';
    t.includes(saved, 'ABC-009', 'saved to storage');
    // The batch is ONE undo (the tile's own noteLastLog, not the item before it).
    app.fn('setUndo')(true);
    t.ok(app.fn('undoAvailable')(), 'Undo is live after a tile batch');
    t.eq(st.lastLog && st.lastLog.ids.length, 3, '…for all three items, as one');
    t.eq(st.lastLog && st.lastLog.label, 'Desk PC', '…named by the multi-pick');
    app.fn('setUndo')(false);

    // Duplicate asset number: the usual check.
    tap(app, 'qp-tile', 3);
    st.form.assetNo = 'ABC-007';
    tap(app, 'log-pass');
    t.eq(app.fn('activeSession')().items.length, 3, 'a duplicate asset number stops the batch');
    t.includes(said.join('|'), 'already used', '…with the usual message');
  });

  /* ------------------------------------------------------------------ 31f */
  t.group('31f — sync: the tile travels with its multi-pick, only when set (13A)', () => {
    const app = freshApp();
    const N = (raw) => app.fn('_syncGeneralNormalise')('settings_multipick', raw);
    const plain = N({ enabled: true, slots: [{ name: 'A', items: ['x'] }] });
    t.eq(JSON.stringify(plain), '{"id":"settings_multipick","enabled":true,"slots":[{"name":"A","items":["x"]}]}',
      'no tile → exactly V93\u2019s row shape (nobody\u2019s row looks changed by the upgrade)');
    const tiled = N({ enabled: true, slots: [{ name: 'A', items: ['x'], qp: 2 }] });
    t.eq(tiled.slots[0].qp, 2, 'a tile is carried in the row');

    const st = app.state();
    t.ok(app.fn('_syncApplyGeneral')('settings_multipick', { id: 'settings_multipick', enabled: false, slots: [{ name: 'B', items: ['y'], qp: 3 }] }), 'applied');
    t.eq(st.multiPick.slots[0].qp, 3, 'applying the cloud\u2019s row keeps its tile');
    t.ok(app.fn('_syncApplyGeneral')('settings_multipick', { id: 'settings_multipick', enabled: false, slots: [{ name: 'B', items: ['y'] }] }), 'applied again');
    t.notOk('qp' in st.multiPick.slots[0], '…and a row without one leaves none (V93-shaped)');

    const d = app.fn('_syncGeneralDiffs')('settings_multipick',
      { enabled: false, slots: [{ name: 'B', items: ['y'], qp: 1 }] },
      { enabled: false, slots: [{ name: 'B', items: ['y'] }] });
    t.ok(d.some(x => /Quick Pick 1/.test(x.here)), 'a tile-only difference is shown on a held card');
  });

  /* ------------------------------------------------------------------ 31g */
  await t.group('31g — Undo: off by default; asks; removes the last log; reverses learning (8, 14A, 16B)', async () => {
    const off = entryApp();
    t.eq(off.state().undoEnabled, false, 'off by default');
    t.excludes(html(off), 'undo-btn', 'off: no Undo button');
    t.includes(html(off), '⎘ Copy last result', 'off: Copy last as before');

    const app = entryApp();
    const st = app.state();
    tap(app, 'nothing');   // no-op
    app.fn('setUndo')(true);
    t.eq(app.storage.getItem('pat:undo'), '1', 'switched on, stored per phone');
    app.fn('render')();
    t.includes(html(app), 'id="undo-btn" data-action="undo-last" aria-label="Undo the last item logged" disabled', 'on: Undo shown, greyed with nothing to undo');
    t.includes(html(app), '⎘ Copy last', 'Copy last shortened beside it');

    st.sqpEnabled = true; st.sqpHistory = {};
    withItem(app, { assetNo: '1', location: 'Hall', itemType: 'Kettle' });
    withItem(app, { assetNo: '2', location: 'Hall', itemType: 'Lead' });
    app.fn('render')();
    t.excludes(html(app), 'Undo the last item logged" disabled', 'after a log: Undo live');
    t.eq(st.form.assetNo, '3', 'the next box shows the automatic number (precondition)');

    let asked = '';
    const realC = app.sandbox.openConfirmSheet;
    app.sandbox.openConfirmSheet = (o) => { asked = String(o.message); return realC(o); };
    tap(app, 'undo-last');
    t.eq(asked, 'Remove item 2 — Lead, PASS?', 'asks first, naming the item');
    t.eq(app.fn('activeSession')().items.length, 2, 'nothing removed before the answer');
    confirmSheet(app);
    const items = app.fn('activeSession')().items;
    t.eq(items.map(i => i.itemType).join(','), 'Kettle', 'the last item is gone, the one before kept');
    // ⚠ Not "is the count falsy" — a zero husk is falsy too (M498 survived that).
    t.ok(!!st.sqpHistory.hall && !('Lead' in st.sqpHistory.hall), 'Smart Quick Pick learning reversed — no zero husk left');
    t.eq(st.sqpHistory.hall && st.sqpHistory.hall.Kettle, 1, '…the earlier item\u2019s learning untouched');
    t.eq(st.form.assetNo, '2', '9B: the form stays on the new item; the untouched automatic number goes back');
    t.excludes(app.storage.getItem('pat:sessions') || '', '"Lead"', 'saved');
    t.notOk(app.fn('undoAvailable')(), 'one level only: nothing more to undo');

    // A typed asset number is left alone.
    withItem(app, { assetNo: '2', location: 'Hall', itemType: 'Fan' });
    st.form.assetNo = 'TYPED-1';
    app.fn('undoLastLog')();
    t.eq(st.form.assetNo, 'TYPED-1', 'a number the engineer typed is left alone');

    // Batches: Log again ×3 and the Multi Pick button are undone as one.
    st.form.location = 'Hall';
    app.fn('repeatLastResult')(3);
    t.eq(app.fn('activeSession')().items.length, 4, 'Log again added three (precondition)');
    app.fn('undoAsk')();
    t.includes(asked, 'Remove items 2–4 (Log again: Kettle)?', 'a batch is named as one');
    confirmSheet(app);
    t.eq(app.fn('activeSession')().items.length, 1, 'Log again ×3 undone as one');
    st.multiPick = app.fn('normaliseMultiPickConfig')({ enabled: true, slots: [{ name: 'Desk', items: ['Lead', 'PC'] }] });
    app.fn('multiPickFire')(0);
    app.fn('undoLastLog')();
    t.eq(app.fn('activeSession')().items.length, 1, 'a Multi Pick batch undone as one');

    // Stale records never remove anything.
    withItem(app, { assetNo: '5', location: 'Hall', itemType: 'Radio' });
    app.fn('activeSession')().items[1].notes = 'edited since';
    t.notOk(app.fn('undoAvailable')(), 'an item edited since → no undo');
    withItem(app, { assetNo: '6', location: 'Hall', itemType: 'Radio' });
    app.fn('activeSession')().locked = true;
    t.notOk(app.fn('undoAvailable')(), 'a locked job → no undo');
    app.fn('activeSession')().locked = false;
    const keep = app.fn('activeSession')().id;
    withSession(app, { site: 'ZZOTHER' });
    app.fn('openSession')(keep);
    t.notOk(app.fn('undoAvailable')(), 'leaving and reopening the job forgets it');
    withItem(app, { assetNo: '7', location: 'Hall', itemType: 'Radio' });
    app.fn('setUndo')(false);
    t.notOk(app.fn('undoAvailable')(), 'switched off → no undo');
  });

  /* ------------------------------------------------------------------ 31h */
  await t.group('31h — undoing a fail takes its photos the way deleteItem does (MAP rule 5)', async () => {
    const app = entryApp();
    const st = app.state();
    app.fn('setUndo')(true);
    withItem(app, { assetNo: '1', location: 'Yard', itemType: 'Drill', result: 'fail' });
    const id = app.fn('activeSession')().items[0].id;
    const swept = [];
    let itemsAtSweep = -1;
    const real = app.sandbox.photosDeleteForItem;
    app.sandbox.photosDeleteForItem = (x) => { swept.push(x); itemsAtSweep = app.fn('activeSession')().items.length; return real(x); };
    app.fn('undoLastLog')();
    t.eq(swept.join(','), id, 'the fail\u2019s photos are swept');
    t.eq(itemsAtSweep, 1, '…BEFORE the item is removed');
    t.eq(app.fn('activeSession')().items.length, 0, 'the fail is gone');
    await tick(5);
  });

  /* ------------------------------------------------------------------ 31i */
  t.group('31i — the Undo switch: backups and setup exports carry it; garbage reads off', () => {
    const app = freshApp({ localStorage: { 'pat:undo': 'yes' } });
    t.eq(app.state().undoEnabled, false, 'garbage in storage → off');
    const on = freshApp({ localStorage: { 'pat:undo': '1' } });
    t.eq(on.state().undoEnabled, true, "'1' → on");
    const src = require('fs').readFileSync(require('path').join(require('../load').APP_DIR, 'backup.js'), 'utf8');
    t.includes(src, 'undoEnabled: state.undoEnabled,', 'the backup carries it');
    t.includes(src, "if (typeof data.undoEnabled === 'boolean') {", '…and restore takes only a boolean');
  });
};
