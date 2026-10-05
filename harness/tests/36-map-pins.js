/* Standing test — map pins for fails (V99, roadmap Stage 8 part 2)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked: 1A what3words only, pasted (no GPS; the app
   cannot turn a position into words without a paid key); 2A called "Map pin";
   3A its own item field `pin`, absent when none; 4A added to a SAVED item only,
   never inside the fail sheet (the iOS reload trap); 5A a short offer after a
   fail is logged; 6A 📍 on the Overview, a hidden-by-default CSV column, printed
   with the fail under Remedial actions as a link; 7A fail → PASS: the remove
   button takes the pin too; 8A the switch is per phone, off by default; 9A the
   switch only hides the ways of adding — pins on items always show.
   Claude's calls: the offer sits at the top, clear of PASS/FAIL; a reload while
   in what3words reopens the sheet (MAP_PIN_OPEN_KEY); a hidden, untouched Map
   pin column is left out of the synced CSV row (rule 36).

   ⚠ TAPS AND TYPING GO THROUGH #app (V67 lesson), as in 22, 33, 34 and 35. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, withSession, withItem, tick } = require('../fixture');

const WORDS = 'filled.count.soap';
const src = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');

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
function type(app, action, value) {
  const el = app.doc.createElement('input');
  el.dataset.inputAction = action;
  el.value = value;
  fire(app, 'input', el);
}
function toggle(app, action, checked) {
  const el = app.doc.createElement('input');
  el.type = 'checkbox';
  el.dataset.changeAction = action;
  el.checked = checked;
  fire(app, 'change', el);
}

function boot(opts = {}) {
  const app = freshApp(opts);
  app.html = () => app.doc.getElementById('app').innerHTML;
  return app;
}

// A job with one saved FAIL (cursor back on it, as after ‹ Prev), switch as given.
function failJob(o = {}) {
  const app = o.app || boot(o.boot || {});
  if (o.on !== false) toggle(app, 'map-pin-enabled', true);
  withSession(app, { site: 'ZZPINSITE' });
  const it = withItem(app, { assetNo: 'ZZF1', itemType: 'Drill', result: 'fail', notes: o.notes ?? '' });
  const st = app.state();
  st.cursor = 0;
  app.fn('loadFormForCursor')();
  app.fn('render')();
  return { app, it };
}
const item0 = (app) => app.fn('activeSession')().items[0];
const offers = (app) => app.doc.getElementById('app').children.filter(c => c.classList && c.classList.contains('map-pin-offer'));

module.exports = async function () {

  /* ------------------------------------------------------------------ 36a */
  t.group('36a — the three words are found in whatever is pasted (1A)', () => {
    const app = boot();
    const n = app.fn('normaliseW3w');
    t.eq(n('///Filled.Count.Soap'), WORDS, 'slashes and capitals');
    t.eq(n(WORDS), WORDS, 'the bare words');
    t.eq(n('https://w3w.co/filled.count.soap'), WORDS, 'a w3w.co link');
    t.eq(n('https://what3words.com/filled.count.soap'), WORDS, 'a what3words.com link');
    t.eq(n('My location: ///filled.count.soap https://w3w.co/filled.count.soap'), WORDS, 'the app\u2019s share text');
    t.eq(n('It is at ///filled.count.soap.'), WORDS, 'a full stop ending the sentence');
    t.eq(n('https://what3words.com'), '', 'the bare site is not an address');
    t.eq(n('filled.count'), '', 'two words are not');
    t.eq(n('a.b.c.d'), '', 'nor four');
    t.eq(n('///a.b.c.d'), '', 'nor four after slashes');
    t.eq(n(''), '', 'nothing is nothing');
    t.eq(app.fn('w3wUrl')('///' + WORDS), 'https://what3words.com/' + WORDS, 'the link for a pin');
    t.eq(app.fn('w3wUrl')('junk'), '', 'no link for junk');
  });

  /* ------------------------------------------------------------------ 36b */
  t.group('36b — the switch: per phone, off by default, hides only the adding (8A, 9A)', () => {
    const off = boot();
    t.eq(off.state().mapPinEnabled, false, 'off by default');
    const { app: a2 } = failJob({ on: false });
    t.excludes(a2.html(), 'entry-pin-btn', 'off: no 📍 on a fail');
    const { app } = failJob();
    t.eq(app.storage.getItem('pat:mapPin'), '1', 'on is saved as \u20181\u2019');
    t.includes(app.html(), 'id="entry-pin-btn"', 'on: 📍 on the saved fail');
    t.includes(app.html(), '📍 Add map pin', 'saying Add map pin');
    t.includes(app.html(), 'entry-aux-row', 'sharing the photo button\u2019s row');
    const garbage = boot({ localStorage: { 'pat:mapPin': 'yes' } });
    t.eq(garbage.state().mapPinEnabled, false, 'garbage in storage → off');
    const on = boot({ localStorage: { 'pat:mapPin': '1' } });
    t.eq(on.state().mapPinEnabled, true, "'1' → on");
    const b = JSON.stringify(app.fn('buildBackup')());
    t.includes(b, '"mapPinEnabled":true', 'the backup carries it');
    t.includes(src('backup.js'), "if (typeof data.mapPinEnabled === 'boolean') {", '…and restore takes only a boolean');
    t.includes(src('setup.js'), "if (typeof pr.mapPinEnabled === 'boolean') state.mapPinEnabled = pr.mapPinEnabled;", 'setup exports carry it too');
    t.ok(!/mapPin/.test(src('sync.js').slice(src('sync.js').indexOf('function _syncGeneralRecord'), src('sync.js').indexOf('function _syncGeneralDefault'))), 'not in any synced settings row');
  });

  /* ------------------------------------------------------------------ 36c */
  t.group('36c — open, paste, save; junk is refused; empty removes (3A)', () => {
    const { app, it } = failJob();
    const before = item0(app);
    tap(app, 'map-pin-open', it.id);
    t.ok(app.state().mapPinSheet && app.state().mapPinSheet.itemId === it.id, 'the sheet opens on that item');
    t.includes(app.html(), 'id="map-pin-input"', 'with a box');
    t.includes(app.html(), 'Open what3words', 'and the way to what3words');
    type(app, 'map-pin-text', 'not words');
    tap(app, 'map-pin-save');
    t.ok(app.state().mapPinSheet, 'junk: the sheet stays open');
    t.ok(!('pin' in item0(app)), 'and nothing is saved');
    type(app, 'map-pin-text', 'https://w3w.co/Filled.Count.Soap');
    tap(app, 'map-pin-save');
    t.eq(app.state().mapPinSheet, null, 'three words: the sheet closes');
    t.eq(item0(app).pin, WORDS, 'the pin is saved, cleaned');
    t.ok(item0(app) !== before, 'the item object is REPLACED (v69 encoding trap)');
    const stored = JSON.stringify(app.fn('serialiseSessions')(app.state().sessions));
    t.includes(stored, WORDS, 'and reaches storage');
    t.ok(!/filled\.count\.soap/.test(item0(app).notes || ''), 'never written into the notes (3A)');
    app.fn('render')();
    t.includes(app.html(), '///' + WORDS, 'the button now shows the address');
    tap(app, 'map-pin-open', it.id);
    t.includes(app.html(), 'id="map-pin-remove"', 'an existing pin can be removed');
    tap(app, 'map-pin-remove');
    t.ok(!('pin' in item0(app)), 'removed — the key is absent, not empty');
  });

  /* ------------------------------------------------------------------ 36d */
  t.group('36d — never in the fail sheet; the button only on a saved item (4A)', () => {
    const app = boot();
    toggle(app, 'map-pin-enabled', true);
    withSession(app);
    const st = app.state();
    st.form.assetNo = 'ZZN1'; st.form.itemType = 'Kettle'; st.form.location = 'ZZLOC';
    app.fn('failClicked')();
    t.ok(st.failModalOpen, 'the fail sheet is open');
    t.excludes(app.html(), 'map-pin', 'and has no map pin in it');
    const r = src('render-core.js');
    const sheet = r.slice(r.indexOf('const failModal = state.failModalOpen'), r.indexOf('const carriedHint'));
    t.excludes(sheet, 'map-pin', 'source: the fail sheet markup never offers one');
    app.fn('cancelFailModal')();
    t.excludes(app.html(), 'entry-pin-btn', 'a new (unsaved) item has no 📍');
  });

  /* ------------------------------------------------------------------ 36e */
  await t.group('36e — the offer after a fail: top of the screen, switch on only (5A)', async () => {
    const app = boot();
    toggle(app, 'map-pin-enabled', true);
    withSession(app);
    const it = withItem(app, { result: 'fail', notes: '' });
    const o = offers(app);
    t.eq(o.length, 1, 'one offer after the fail');
    t.eq(o[0] && o[0].getAttribute('data-arg'), it.id, 'naming the item just logged');
    t.eq(o[0] && o[0].getAttribute('data-action'), 'map-pin-offer', 'tappable through #app');
    tap(app, 'map-pin-offer', it.id);
    t.ok(app.state().mapPinSheet && app.state().mapPinSheet.itemId === it.id, 'a tap opens the sheet for it');
    t.eq(offers(app).length, 0, 'and the offer goes');
    tap(app, 'map-pin-cancel');
    withItem(app, { result: 'pass', notes: '' });
    t.eq(offers(app).length, 0, 'no offer after a PASS');
    const off = boot();
    withSession(off);
    withItem(off, { result: 'fail', notes: '' });
    t.eq(offers(off).length, 0, 'switch off: no offer');
    const css = src('styles.css');
    const rule = css.slice(css.indexOf('.map-pin-offer {'), css.indexOf('}', css.indexOf('.map-pin-offer {')));
    t.includes(rule, 'top: calc(env(safe-area-inset-top', 'pinned to the TOP');
    t.excludes(rule, 'bottom:', 'never at the bottom, where PASS / FAIL are');
    t.includes(src('session.js'), '_mapPinOfferTimer = setTimeout(mapPinOfferHide, MAP_PIN_OFFER_MS);', 'and it times out');
  });

  /* ------------------------------------------------------------------ 36f */
  t.group('36f — switch off: pins already saved still show, export and can be removed (9A)', () => {
    const { app, it } = failJob();
    app.fn('setItemMapPin')(app.fn('activeSession')().id, it.id, WORDS);
    toggle(app, 'map-pin-enabled', false);
    app.fn('render')();
    t.includes(app.html(), 'id="entry-pin-btn"', 'the 📍 button still shows on an item WITH a pin');
    app.fn('setView')('overview');
    t.includes(app.html(), 'class="pin-chip"', 'the Overview marks it');
    const st = app.state();
    st.csvColumns.find(c => c.id === 'mapPin').visible = true;
    const csv = app.fn('buildCSV')(app.fn('activeSession')());
    t.includes(csv, 'Map pin', 'the column, when switched on');
    t.includes(csv, '///' + WORDS, 'carries the pin whatever the switch says');
  });

  /* ------------------------------------------------------------------ 36g */
  t.group('36g — fail → PASS: the big button takes the pin, Keep keeps it (7A)', () => {
    const reason = boot().state().failReasons[0];
    const setup = (notes) => {
      const { app, it } = failJob({ notes });
      app.fn('setItemMapPin')(app.fn('activeSession')().id, it.id, WORDS);
      app.state().cursor = 0; app.fn('loadFormForCursor')();
      app.__sheets = [];
      const real = app.sandbox.openChoiceSheet;
      app.sandbox.openChoiceSheet = (o) => { app.__sheets.push(o); return real(o); };
      app.fn('passClicked')();
      return app;
    };
    let app = setup(reason);
    let sh = app.__sheets[0];
    t.ok(sh, 'a fail with notes and a pin asks');
    t.includes(sh ? sh.message : '', '///' + WORDS, 'naming the pin');
    t.includes(sh ? sh.choices[0].label : '', 'and the map pin', 'the big button says it takes the pin');
    sh.choices[0].onPick();
    t.eq(item0(app).result, 'pass', 'now a PASS');
    t.ok(!('pin' in item0(app)), 'and the pin is gone');

    app = setup(reason);
    app.__sheets[0].choices[1].onPick();
    t.eq(item0(app).pin, WORDS, 'Keep the notes and the pin keeps it');

    app = setup('');
    sh = app.__sheets[0];
    t.ok(sh, 'a pin with NO notes is still asked about');
    t.eq(sh ? sh.choices[0].label : '', 'Remove the map pin', 'its own button');
    sh.choices[0].onPick();
    t.ok(!('pin' in item0(app)) && item0(app).result === 'pass', 'which removes it');
  });

  /* ------------------------------------------------------------------ 36h */
  t.group('36h — a reload while in what3words reopens the sheet', () => {
    const { app, it } = failJob();
    let opened = null;
    app.sandbox.open = (u) => { opened = u; return null; };
    const sid = app.fn('activeSession')().id;
    tap(app, 'map-pin-open', it.id);
    tap(app, 'map-pin-w3w');
    t.eq(app.sandbox.location.href, 'w3w://show?currentlocation', 'the what3words APP opens, by its own link (V99.1)');
    t.eq(opened, null, 'no browser panel (V99.1: the blank-panel bug)');
    const note = JSON.parse(app.storage.getItem('pat:mapPinOpen') || 'null');
    t.ok(note && note.s === sid && note.i === it.id, 'the item is noted BEFORE leaving');

    const ls = {};
    for (const k of ['pat:sessions', 'pat:mapPin', 'pat:mapPinOpen']) ls[k] = app.storage.getItem(k);
    const back = boot({ localStorage: ls });
    t.ok(back.fn('mapPinResume')(), 'boot finds the note');
    t.eq(back.state().view, 'entry', 'opens the job');
    t.eq(back.state().cursor, 0, 'on that item');
    t.ok(back.state().mapPinSheet && back.state().mapPinSheet.itemId === it.id, 'with the sheet open');
    t.includes(src('boot.js').slice(0, src('boot.js').indexOf('loadFormForCursor();\n  render();')), 'mapPinResume()', 'boot.js calls it before the first form and paint');

    tap(app, 'map-pin-cancel');
    t.eq(app.storage.getItem('pat:mapPinOpen'), null, 'closing the sheet forgets the note');

    ls['pat:mapPinOpen'] = JSON.stringify({ s: sid, i: it.id, at: Date.now() - 3 * 3600 * 1000 });
    const stale = boot({ localStorage: ls });
    t.ok(!stale.fn('mapPinResume')(), 'an old note is ignored');
    t.eq(stale.storage.getItem('pat:mapPinOpen'), null, 'and forgotten');
    ls['pat:mapPinOpen'] = '{broken';
    const broken = boot({ localStorage: ls });
    t.ok(!broken.fn('mapPinResume')(), 'a broken note is ignored');

    tap(app, 'map-pin-open', it.id);
    tap(app, 'map-pin-w3w');
    app.fn('setView')('overview');
    t.eq(app.state().mapPinSheet, null, 'leaving the screen closes the sheet');
    t.eq(app.storage.getItem('pat:mapPinOpen'), null, 'and forgets the note');
  });

  /* ------------------------------------------------------------------ 36i */
  t.group('36i — sync: the CSV row keeps its V98 shape; the pin rides the job (rule 36)', () => {
    const app = boot();
    const norm = (cols) => app.fn('_syncGeneralNormalise')('settings_csv', { columns: cols });
    const h = (d) => app.fn('syncHash')(app.fn('_syncCanonical')(d));
    const v98 = app.state().csvColumns.filter(c => c.id !== 'mapPin');
    t.ok(app.state().csvColumns.some(c => c.id === 'mapPin' && !c.visible), 'an upgraded phone gains the column, hidden');
    t.eq(h(norm(app.state().csvColumns)), h(norm(v98)), 'and its CSV row hashes exactly as on V98 — nothing re-sent');
    t.eq(h(app.fn('_syncGeneralDefault')('settings_csv')), h(norm(v98)), 'the default row too (5A "nothing made" unchanged)');
    const shown = app.state().csvColumns.map(c => c.id === 'mapPin' ? Object.assign({}, c, { visible: true }) : c);
    t.ok(h(norm(shown)) !== h(norm(v98)), 'switching it ON is a real change, and is sent');
    t.ok(norm(shown).columns.some(c => c.id === 'mapPin'), 'carrying the column');

    const { app: a2, it } = failJob();
    const sess = a2.fn('activeSession')();
    const before = a2.fn('syncHash')(a2.fn('_syncCanonical')(sess));
    a2.fn('setItemMapPin')(sess.id, it.id, WORDS);
    const after = a2.fn('syncHash')(a2.fn('_syncCanonical')(a2.fn('activeSession')()));
    t.ok(before !== after, 'a pin changes the job\u2019s fingerprint — an ordinary job edit, pushed');
  });

  /* ------------------------------------------------------------------ 36j */
  t.group('36j — CSV import brings pins back; junk cells are ignored', () => {
    const { app, it } = failJob();
    const sess = app.fn('activeSession')();
    app.fn('setItemMapPin')(sess.id, it.id, WORDS);
    app.state().csvColumns.find(c => c.id === 'mapPin').visible = true;
    const csv = app.fn('buildCSV')(app.fn('activeSession')());
    const parsed = app.fn('parseImportCSV')(csv);
    t.ok(parsed && parsed.ok, 'the export imports');
    const items = parsed && parsed.session ? parsed.session.items : [];
    t.eq(items[0] && items[0].pin, WORDS, 'with its pin');
    const junk = csv.replace('///' + WORDS, 'nowhere');
    const p2 = app.fn('parseImportCSV')(junk);
    const it2 = p2 && p2.session ? p2.session.items[0] : null;
    t.ok(it2 && !('pin' in it2), 'a cell that is not three words gives no pin');
  });

  /* ------------------------------------------------------------------ 36k */
  t.group('36k — printed with the fail under Remedial actions, as a link (6A)', () => {
    const app = boot();
    const st = app.state();
    const sess = { id: 'ZZREM', items: [
      { id: 'i1', assetNo: 'P1', itemType: 'Kettle', location: 'Office', result: 'pass', notes: '', pin: 'pass.item.pin' },
      { id: 'i2', assetNo: 'F1', itemType: 'Drill', location: 'Store', result: 'fail', notes: 'Damaged plug', pin: WORDS },
      { id: 'i3', assetNo: 'F2', itemType: 'Lead', location: 'Store', result: 'fail', notes: 'Cut cable', pin: 'index.home.raft' },
    ] };
    st.reportSettings = app.fn('normaliseReportSettings')({ showRemedial: true });
    const fake = () => {
      const d = {
        pages: 1, texts: [], links: [], tables: [], images: 0, lastAutoTable: null,
        internal: { pageSize: { getWidth: () => 595, getHeight: () => 842 }, getNumberOfPages: () => d.pages },
        addPage() { d.pages++; }, setPage() {},
        setFontSize() {}, setFont() {}, setTextColor() {}, setFillColor() {}, setDrawColor() {}, setLineWidth() {},
        rect() {}, addImage() { d.images++; },
        text(x) { d.texts.push([].concat(x).join(' ')); },
        textWithLink(x, _a, _b, o) { d.texts.push(String(x)); d.links.push(o && o.url); },
        link(_x, _y, _w, _h, o) { d.links.push(o && o.url); },
        getTextWidth() { return 40; },
        splitTextToSize(s) { return [String(s)]; },
        autoTable(o) { d.tables.push(o); d.lastAutoTable = { finalY: 200 }; },
      };
      return d;
    };
    let d = fake();
    app.fn('_appendRemedialPages')(d, sess, null, 40, [0, 0, 0]);
    const tb = d.tables[0];
    t.eq(tb.head[0][4], 'Map pin', 'the fail list gains a Map pin column');
    t.eq(tb.body[0][4], '///' + WORDS, 'with the address');
    t.ok(typeof tb.didDrawCell === 'function', 'and makes each a link');
    tb.didDrawCell({ section: 'body', column: { index: 4 }, row: { index: 0 }, cell: { x: 0, y: 0, width: 10, height: 10 } });
    t.eq(d.links[0], 'https://what3words.com/' + WORDS, 'to its what3words page');
    t.eq(tb.body.length, 2, 'fails only — a pin on a PASS never prints');

    const photo = { dataUrl: 'data:image/jpeg;base64,AA', w: 10, h: 10 };
    d = fake();
    app.fn('_appendRemedialPages')(d, sess, { groups: [{ item: sess.items[2], photos: [photo] }], total: 1, printed: 1, omitted: 0 }, 40, [0, 0, 0]);
    t.ok(d.texts.includes('///index.home.raft'), 'a photographed fail prints its pin under its caption');
    t.ok(d.links.includes('https://what3words.com/index.home.raft'), 'as a link');

    d = fake();
    app.fn('_appendRemedialPages')(d, { id: 'Z', items: [{ id: 'x', assetNo: 'F9', itemType: 'Iron', location: 'L', result: 'fail', notes: 'n' }] }, null, 40, [0, 0, 0]);
    t.eq(d.tables[0].head[0].length, 4, 'no pins in the job → no extra column');

    d = fake();
    app.fn('_appendPhotoPages')(d, sess, { groups: [{ item: sess.items[2], photos: [photo] }], total: 1, printed: 1, omitted: 0 }, 40, [0, 0, 0]);
    t.ok(!d.texts.some(x => x.includes('index.home.raft')), 'the plain photo pages (remedial off) do not print pins');
  });

  /* ------------------------------------------------------------------ 36m */
  await t.group('36m — V99.1: the app by its own link; the website only if the app never opened', async () => {
    const mk = () => {
      const { app, it } = failJob();
      app.__opened = [];
      app.sandbox.open = (u) => { app.__opened.push(u); return null; };
      tap(app, 'map-pin-open', it.id);
      return app;
    };
    const stay = mk();     // the app is not installed: PATGo never loses focus
    const gone = mk();     // the app opened: PATGo hid
    const asked = mk();    // iOS asked "Open in what3words?" — focus left
    const vcBefore = (gone.doc._listeners.visibilitychange || []).length;
    tap(stay, 'map-pin-w3w');
    tap(gone, 'map-pin-w3w');
    tap(asked, 'map-pin-w3w');
    gone.doc.visibilityState = 'hidden';
    (gone.doc._listeners.visibilitychange || []).forEach(fn => fn({ type: 'visibilitychange' }));
    asked.sandbox.window.dispatchEvent({ type: 'blur' });
    t.ok(!stay.state().mapPinSheet.noApp, 'nothing is offered straight away');
    await tick(2700);
    t.ok(stay.state().mapPinSheet && stay.state().mapPinSheet.noApp, 'still here after the wait → the website is offered');
    stay.fn('render')();
    t.includes(stay.html(), 'id="map-pin-web"', 'as a button in the sheet');
    t.includes(stay.html(), 'tap <strong>Done</strong> to come back', 'saying how to get back from the panel');
    t.eq(stay.__opened.length, 0, 'the website never opens by itself');
    tap(stay, 'map-pin-w3w-web');
    t.eq(stay.__opened[0], 'https://what3words.com/', 'only when asked');
    t.ok(!gone.state().mapPinSheet.noApp, 'the app opened (PATGo hid) → no website offer');
    t.ok(!asked.state().mapPinSheet.noApp, 'iOS asked first (focus left) → no website offer');
    t.eq((gone.doc._listeners.visibilitychange || []).length, vcBefore, 'the watchers are removed afterwards');
  });

  /* ------------------------------------------------------------------ 36l */
  t.group('36l — copy last over an item clears its pin, as it clears the notes', () => {
    const { app, it } = failJob();
    const sess = app.fn('activeSession')();
    app.fn('setItemMapPin')(sess.id, it.id, WORDS);
    withItem(app, { assetNo: 'ZZP2', result: 'pass', notes: '' });
    app.state().cursor = 0; app.fn('loadFormForCursor')();
    app.fn('copyLastResult')();
    t.ok(!('pin' in item0(app)), 'the overwritten item has no pin');
    t.ok(tick, 'tick available');
  });
};
