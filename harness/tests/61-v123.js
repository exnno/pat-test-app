/* Standing test — V123: where VoiceOver lands after a redraw (V120 4A)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked (14 Oct, Peter "1A 2A 3A 4A"):
   render() rebuilds #app, so VoiceOver's cursor fell back to the top of the
   screen after nearly every tap. Now, at the end of every redraw
   (feedback.js focusAfterRender):
   1A  On for everyone, invisibly: focus moves without scrolling, and a heading
       shows no ring ([tabindex="-1"]:focus in styles.css).
   2A  Anything that LOGS (PASS, FAIL, Copy last, Log again, a tile, Multi Pick)
       ends on the screen heading — never back on the button, which a scanner's
       Enter or a space in a barcode could press again.
   3A  A sheet that opens → its title; a sheet that closes → the control that
       opened it. A sheet that put the cursor in a box keeps it there.
   4A  Quick Pick buttons and Multi Pick tiles carry aria-pressed.
   Otherwise: same screen → the tapped control; new screen → its heading
   (#screen-title); a control that has gone → the heading. Never a text field.

     61a  every screen draws exactly ONE #screen-title heading, focusable by
          script only; a real move between screens through render() lands on it.
     61b  the decision (feedback.js), on a hand-built tree: same screen → the
          control (by id; by data-action + data-arg + position); gone, disabled
          or a text field → the heading; checkbox allowed; no tap → leave alone;
          what held focus before a redraw is put back; a stale tap is ignored.
     61c  2A through the REAL paths: saveItem, refreshEntryAfterLog,
          noteLastLog → render; a log button is never the target, not even
          after a cancelled fail sheet; paired scanner mode still wins.
     61d  3A: a sheet's title takes focus, a field already focused keeps it;
          closing returns to the opener — through openConfirmSheet's real
          buttons and through a render-drawn sheet coming and going.
     61e  4A: aria-pressed in the drawn grid and in every in-place repaint
          (quick-pick through handleDelegatedClick, f-type typing, tiles).
     61f  release: V123, What’s new rolled, cache, changelog. (60f → 61f.)
     61g  wiring (source): the calls sit where they must — render() notes focus
          before its sweep and decides before focusAssetForScan(); dispatch
          notes taps and changes; EVERY sheet appended to <body> reports itself
          opened; preventScroll; the CSS.

   ⚠ 61a IS A SWEEP. A new view needs a screen title carrying
   id="screen-title" (renderSettingsSubHeader gives one for free), or it fails.
   ⚠ 61g IS A SWEEP. A new function that appends a sheet to <body> must call
   focusSheetOpened(sheet) after it is wired, or it fails. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, withSession, withItem } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;

/* A fresh app past every first-run sheet, with the focus bookkeeping zeroed. */
function ready(opts) {
  const app = freshApp(opts);
  const st = app.state();
  st.welcomeSeen = true;
  st.onboardedV33Seen = true;
  st.migrationPrompt = { show: false, name: '', items: [] };
  app.run('_focusTap = null; _focusBefore = null; _focusOpener = null; _focusSheetWasOpen = false; _focusLastView = null; _focusLogged = false;');
  return app;
}

/* A button in the (real, appended) body tree. */
function btn(app, attrs) {
  const el = app.doc.createElement(attrs.tag || 'button');
  for (const k of Object.keys(attrs)) if (k !== 'tag' && k !== 'disabled') el.setAttribute(k, attrs[k]);
  if (attrs.disabled) el.disabled = true;
  app.doc.body.appendChild(el);
  return el;
}

/* Every view render() can draw — read from its own dispatcher, so a new one
   joins the sweep without anybody listing it. */
function allViews() {
  const src = read('render-core.js');
  const a = src.indexOf('function render() {');
  const b = src.indexOf('\n}\n', a);
  return [...new Set([...src.slice(a, b).matchAll(/v === '([a-zA-Z]+)'/g)].map(m => m[1]))];
}

module.exports = async function run() {

  /* ------------------------------------------------------------------ 61a */
  await t.group('61a — every screen has one heading to land on; a move lands there', () => {
    const app = ready();
    withSession(app);
    withItem(app);
    const views = allViews();
    t.ok(views.length >= 35, `the dispatcher’s views were found (${views.length})`);
    const bad = [];
    for (const v of views) {
      const st = app.state();
      st.view = v;
      if (v === 'tour') { st.tourOpen = true; st.tourStep = 0; }
      app.fn('render')();
      const h = html(app);
      const n = (h.match(/id="screen-title"/g) || []).length;
      const tag = (h.match(/<[^>]*id="screen-title"[^>]*>/) || [''])[0];
      const ok = n === 1 && /tabindex="-1"/.test(tag) &&
        (/^<h[12]\b/.test(tag) || (/role="heading"/.test(tag) && /aria-level="1"/.test(tag)));
      if (!ok) bad.push(`${v} (drew ${app.state().view}): ${n} ${tag}`);
      if (v === 'tour') st.tourOpen = false;
    }
    t.deepEq(bad, [], 'each view draws exactly one #screen-title: a heading, tabindex -1');

    // Through the real dispatcher: a move between screens with nothing tapped.
    const app2 = ready();
    app2.fn('setView')('sessions'); app2.fn('render')();
    app2.doc.activeElement = null;
    app2.fn('setView')('settings'); app2.fn('render')();
    t.eq(app2.doc.activeElement, app2.doc.getElementById('screen-title'), 'Jobs → Settings: the Settings heading has focus');
    t.includes(html(app2), '<div class="site-name" id="screen-title" role="heading" aria-level="1" tabindex="-1">Settings</div>', '… which is the Settings title');
    app2.fn('setView')('sessions'); app2.fn('render')();
    t.eq(app2.doc.activeElement, app2.doc.getElementById('screen-title'), 'and back: the Jobs heading');
    t.includes(html(app2), '<h1 class="h1" id="screen-title" tabindex="-1">Jobs</h1>', '… the Jobs title');
  });

  /* ------------------------------------------------------------------ 61b */
  await t.group('61b — the decision: control, heading, or leave alone', () => {
    const app = ready();
    const F = (n) => app.fn(n);
    const st = app.state();
    st.view = 'settingsDisplay';
    const head = app.doc.register('screen-title');
    F('focusAfterRender')();                       // seeds the last view

    // By data-action + data-arg + position: three alike, the second tapped.
    const a = [1, 2, 3].map(() => btn(app, { 'data-action': 'x-toggle', 'data-arg': 'k' }));
    F('focusNoteTap')(a[1]);
    a.forEach(x => x.remove());
    const b = [1, 2, 3].map(() => btn(app, { 'data-action': 'x-toggle', 'data-arg': 'k' }));
    t.eq(F('focusAfterRender')(), 'control', 'same screen: back on the control');
    t.eq(app.doc.activeElement, b[1], '… the SECOND of three alike, as tapped');
    b.forEach(x => x.remove());

    // By id.
    const idOld = app.doc.register('x-id-btn', 'button');
    F('focusNoteTap')(idOld);
    const idNew = app.doc.register('x-id-btn', 'button');
    t.eq(F('focusAfterRender')(), 'control', 'by id: the control');
    t.eq(app.doc.activeElement, idNew, '… the redrawn one');

    // Gone → heading.
    const gone = btn(app, { 'data-action': 'x-delete', 'data-arg': '7' });
    F('focusNoteTap')(gone);
    gone.remove();
    t.eq(F('focusAfterRender')(), 'heading', 'the control has gone: the heading');
    t.eq(app.doc.activeElement, head, '… #screen-title');
    t.eq(head.getAttribute('tabindex'), '-1', '… made focusable by script only');

    // Disabled → heading.
    const dis = btn(app, { 'data-action': 'x-save', disabled: true });
    F('focusNoteTap')(dis);
    t.eq(F('focusAfterRender')(), 'heading', 'disabled now: the heading');
    dis.remove();

    // A text field is never a target (keyboard).
    const txt = btn(app, { tag: 'input', type: 'text', id: 'x-text', 'data-change-action': 'x-name' });
    app.doc.register('x-text', 'input').setAttribute('type', 'text');
    F('focusNoteTap')(txt);
    t.eq(F('focusAfterRender')(), 'heading', 'a text box: the heading instead');
    t.notEq(app.doc.activeElement && app.doc.activeElement.id, 'x-text', '… the box is NOT focused');
    txt.remove();

    // A switch (checkbox) is fine.
    const cbOld = btn(app, { tag: 'input', type: 'checkbox', 'data-change-action': 'x-flag' });
    F('focusNoteTap')(cbOld);
    cbOld.remove();
    const cb = btn(app, { tag: 'input', type: 'checkbox', 'data-change-action': 'x-flag' });
    t.eq(F('focusAfterRender')(), 'control', 'a switch: back on it');
    t.eq(app.doc.activeElement, cb, '… the redrawn switch');
    cb.remove();

    // No tap, nothing focused before: VoiceOver is left alone.
    app.doc.activeElement = null;
    F('focusBeforeRender')();
    t.eq(F('focusAfterRender')(), 'none', 'a redraw nobody asked for: left alone');
    t.eq(app.doc.activeElement, null, '… nothing focused');

    // What held focus before the redraw is put back (a sync, a timer).
    const was = btn(app, { 'data-action': 'x-refresh' });
    was.focus();
    F('focusBeforeRender')();
    was.remove();
    const now = btn(app, { 'data-action': 'x-refresh' });
    t.eq(F('focusAfterRender')(), 'control', 'no tap, but something was focused: put back');
    t.eq(app.doc.activeElement, now, '… on the redrawn control');
    now.remove();

    // A tap whose action did not redraw cannot steer a later redraw.
    const quick = btn(app, { 'data-action': 'x-quick' });
    F('focusNoteTap')(quick);
    app.run('_focusTap.at -= 5000');
    app.doc.activeElement = null;
    F('focusBeforeRender')();
    t.eq(F('focusAfterRender')(), 'none', 'a tap 5 s old: ignored');
    quick.remove();
  });

  /* ------------------------------------------------------------------ 61c */
  await t.group('61c — logging lands on the heading, never the button (2A)', () => {
    const app = ready();
    withSession(app);
    app.fn('render')();
    t.eq(app.state().view, 'entry', 'on the test screen');
    app.doc.activeElement = null;
    withItem(app);                                 // the real saveItem path
    t.eq(app.doc.activeElement, app.doc.getElementById('screen-title'), 'saveItem: the screen heading has focus');

    // refreshEntryAfterLog alone (an overwrite takes this path): the heading
    // even though the tapped control is still on screen.
    t.includes(html(app), 'id="show-notes-btn"', 'the Notes button is on the screen');
    app.fn('focusNoteTap')(app.doc.getElementById('show-notes-btn'));
    app.fn('refreshEntryAfterLog')();
    t.eq(app.doc.activeElement, app.doc.getElementById('screen-title'), 'refreshEntryAfterLog: the heading, not the tapped control');

    // noteLastLog then a full render() (Multi Pick, Log again): the heading.
    app.fn('focusNoteTap')(app.doc.getElementById('show-notes-btn'));
    const sess = app.fn('activeSession')();
    app.fn('noteLastLog')(sess, [sess.items[0]], 'batch');
    app.fn('render')();
    t.eq(app.doc.activeElement, app.doc.getElementById('screen-title'), 'noteLastLog → render(): the heading');
    // …and without a log, the same tap would have gone back to the control.
    app.fn('focusNoteTap')(app.doc.getElementById('show-notes-btn'));
    app.fn('render')();
    t.eq(app.doc.activeElement, app.doc.getElementById('show-notes-btn'), 'control check: no log → back on the Notes button');

    // A log button is never the target, even on a redraw of the same screen.
    const pass = app.doc.register('pass-btn', 'button');
    pass.setAttribute('data-action', 'log-pass');
    app.fn('focusNoteTap')(pass);
    app.fn('render')();
    t.notEq(app.doc.activeElement, app.doc.getElementById('pass-btn'), 'a tap on PASS: focus is not left on PASS');
    t.eq(app.doc.activeElement, app.doc.getElementById('screen-title'), '… the heading');
    t.deepEq(app.run('FOCUS_LOG_ACTIONS'), ['log-pass', 'log-fail', 'copy-last', 'multipick-fire'], 'the four logging actions');

    // FAIL opens its sheet; cancelling it does not return to FAIL.
    const F = (n) => app.fn(n);
    const fail = app.doc.register('fail-btn', 'button');
    fail.setAttribute('data-action', 'log-fail');
    F('focusNoteTap')(fail);
    const sheet = btn(app, { class: 'fail-sheet' });
    F('focusAfterRender')();                       // the sheet opened
    sheet.remove();
    app.doc.register('fail-btn', 'button').setAttribute('data-action', 'log-fail');
    t.eq(F('focusAfterRender')(), 'heading', 'fail sheet cancelled: the heading, not FAIL');

    // Paired scanner mode still ends in the asset box.
    const p = ready({ localStorage: { 'pat:scannerPaired': '1' } });
    withSession(p);
    p.fn('render')();
    p.doc.activeElement = null;
    withItem(p);
    t.eq(p.doc.activeElement, p.doc.getElementById('f-asset'), 'paired: after a log the asset box has the cursor');
  });

  /* ------------------------------------------------------------------ 61d */
  await t.group('61d — sheets: title on open, back to the opener on close (3A)', () => {
    const app = ready();
    const F = (n) => app.fn(n);
    app.state().view = 'settingsBackup';
    app.doc.register('screen-title');
    F('focusAfterRender')();

    // A body sheet's title takes focus.
    const sh = btn(app, { tag: 'div', class: 'bulk-sheet' });
    const title = app.doc.createElement('h3');
    title.setAttribute('class', 'bulk-sheet-title');
    sh.appendChild(title);
    t.eq(F('focusSheetOpened')(sh), 'sheet', 'a sheet opened: its title');
    t.eq(app.doc.activeElement, title, '… has focus');
    t.eq(title.getAttribute('tabindex'), '-1', '… focusable by script only');
    F('focusSheetClosed')(); sh.remove();

    // A sheet that already put the cursor in a box keeps it.
    const sh2 = btn(app, { tag: 'div', class: 'bulk-sheet' });
    const t2 = app.doc.createElement('h3'); t2.setAttribute('class', 'bulk-sheet-title'); sh2.appendChild(t2);
    const box = app.doc.createElement('input'); box.setAttribute('type', 'text'); sh2.appendChild(box);
    box.focus();
    t.eq(F('focusSheetOpened')(sh2), 'kept', 'a box already has the cursor: kept');
    t.eq(app.doc.activeElement, box, '… still in the box');
    sh2.remove(); F('focusSheetClosed')();

    // The real confirm sheet: opened from a control, cancelled → back on it.
    const opener = app.doc.register('x-opener', 'button');
    opener.setAttribute('data-action', 'x-ask');
    F('focusNoteTap')(opener);
    F('openConfirmSheet')({ title: 'Delete job?', message: 'Gone for good.', onConfirm() {} });
    t.ok(app.doc.getElementById('confirm-sheet-no'), 'the confirm sheet is up');
    app.doc.activeElement = null;
    app.doc.getElementById('confirm-sheet-no').click();
    t.eq(app.doc.activeElement, opener, 'Cancel: back on the control that opened it');

    // Confirmed, and the opener is gone (a delete): the heading.
    const op2 = btn(app, { 'data-action': 'x-del', 'data-arg': '9' });
    F('focusNoteTap')(op2);
    // As a real delete does: remove the row, then redraw the screen.
    F('openConfirmSheet')({ title: 'Delete job?', onConfirm() { op2.remove(); app.fn('render')(); } });
    app.doc.getElementById('confirm-sheet-yes').click();
    t.eq(app.doc.activeElement, app.doc.getElementById('screen-title'), 'confirmed and the row is gone: the heading');

    // A sheet render() draws: opened by a tap, closed by the next redraw.
    const tap = app.doc.register('x-open-sheet', 'button');
    tap.setAttribute('data-action', 'x-sheet');
    F('focusNoteTap')(tap);
    const rs = btn(app, { tag: 'div', class: 'bulk-sheet' });
    const rt = app.doc.createElement('h3'); rt.setAttribute('class', 'bulk-sheet-title'); rs.appendChild(rt);
    t.eq(F('focusAfterRender')(), 'sheet', 'a drawn sheet appeared: its title');
    t.eq(app.doc.activeElement, rt, '… has focus');
    // A tap inside it that repaints it: back on that control, not the title.
    const inner = app.doc.createElement('button'); inner.setAttribute('data-action', 'x-chip'); inner.setAttribute('data-arg', 'b');
    rs.appendChild(inner);
    F('focusNoteTap')(inner);
    t.eq(F('focusAfterRender')(), 'control', 'repainted with the sheet still up: the tapped chip');
    rs.remove();
    const back = app.doc.register('x-open-sheet', 'button');
    t.eq(F('focusAfterRender')(), 'control', 'the sheet went: back on its opener');
    t.eq(app.doc.activeElement, back, '… the redrawn opener');
  });

  /* ------------------------------------------------------------------ 61e */
  await t.group('61e — Quick Pick says which is selected (4A)', () => {
    const app = ready();
    withSession(app);
    const st = app.state();
    const first = st.itemTypes[0];
    st.form.itemType = first;
    app.fn('render')();
    const h = html(app);
    t.includes(h, `class="quick-btn active" aria-pressed="true" data-action="quick-pick" data-arg="${first}"`, 'drawn: the chosen type is pressed');
    t.ok(/aria-pressed="false" data-action="quick-pick"/.test(h), 'drawn: the others are not');

    // In place, through the real click dispatcher.
    const k = btn(app, { class: 'quick-btn', 'aria-pressed': 'true', 'data-action': 'quick-pick', 'data-arg': 'Kettle', 'data-type': 'Kettle' });
    const d = btn(app, { class: 'quick-btn', 'aria-pressed': 'false', 'data-action': 'quick-pick', 'data-arg': 'Drill', 'data-type': 'Drill' });
    app.fn('handleDelegatedClick')({ target: d });
    t.eq(d.getAttribute('aria-pressed'), 'true', 'tap Drill: Drill pressed');
    t.eq(k.getAttribute('aria-pressed'), 'false', '… Kettle not');
    t.eq(app.run('_focusTap && _focusTap.action'), 'quick-pick', 'the tap was noted for the redraw');

    // Typing in the type box.
    const ft = app.doc.getElementById('f-type');
    t.ok(ft && typeof ft.oninput === 'function', 'the type box is bound');
    ft.oninput({ target: { value: 'Kettle' } });
    t.eq(k.getAttribute('aria-pressed'), 'true', 'typed Kettle: Kettle pressed');
    t.eq(d.getAttribute('aria-pressed'), 'false', '… Drill not');

    // Tiles: qpTileSyncDom, and qpTileSelect clearing the types.
    const tile = btn(app, { class: 'qp-tile', 'aria-pressed': 'false', 'data-arg': '1' });
    st.form.qpTile = 1;
    app.fn('qpTileSyncDom')();
    t.eq(tile.getAttribute('aria-pressed'), 'true', 'tile chosen: pressed');
    st.form.qpTile = null;
    app.fn('qpTileSyncDom')();
    t.eq(tile.getAttribute('aria-pressed'), 'false', 'tile cleared: not pressed');
    const src = read('multipick.js');
    t.includes(src, "document.querySelectorAll('.quick-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });",
      'qpTileSelect: choosing a tile un-presses every type');

    // The change dispatcher notes a switch or list too.
    withSession(app, { site: 'Second site' });     // the sort list shows with two jobs
    st.view = 'sessions'; app.fn('render')();
    const sort = app.doc.getElementById('sort-select');
    sort.setAttribute('data-change-action', 'sessions-sort');
    sort.value = 'name';
    app.fn('handleDelegatedChange')({ target: sort });
    t.eq(app.run('_focusTap && _focusTap.id'), 'sort-select', 'a change is noted for the redraw too');
  });

  /* ------------------------------------------------------------------ 61f */
  await t.group('61f — release: V123, What’s new rolled, cache, changelog', () => {
    const app = freshApp();
    t.eq(app.run('APP_VERSION'), 'V123', 'APP_VERSION V123');
    t.eq(app.run('WELCOME_VERSION'), 'V123', 'What’s new rolled to V123');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v123';", 'cache key pat-v123');
    const core = read('render-core.js');
    t.includes(core, '<li><strong>VoiceOver keeps your place.</strong>', 'V123’s What’s new: the focus');
    t.includes(core, "<li><strong>Quick Pick says what's chosen.</strong>", 'V123’s What’s new: selected state');
    t.includes(core, '<li><strong>Nothing changes on screen.</strong>', 'V123’s What’s new: invisible');
    t.excludes(core, '<li><strong>Sessions are now called Jobs.</strong>', 'V122’s sheet copy gone');
    const help = read('render-help.js');
    const a = help.indexOf('<p><strong>V123</strong>'), b = help.indexOf('<p><strong>V122</strong>'), c = help.indexOf('<p><strong>V121</strong>');
    t.ok(a > -1 && b > a && c > b, 'About: V123, V122, V121');
    t.excludes(help, '<p><strong>V120</strong>', 'V120 rolled off');
    t.includes(help, 'VoiceOver keeps your place: after a tap', 'About: V123’s line');
    t.includes(help, 'Sessions are now called Jobs everywhere in the app', 'About: V122’s line still there');
    t.includes(help, 'Bigger text if you want it: Settings', 'About: V121’s line still there');
  });

  /* ------------------------------------------------------------------ 61g */
  await t.group('61g — wiring: every call where it must be (source)', () => {
    const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const core = strip(read('render-core.js'));
    const r = core.slice(core.indexOf('function render() {'), core.indexOf('\n}\n', core.indexOf('function render() {')));
    const before = r.indexOf('focusBeforeRender()'), sweep = r.indexOf("'body > .modal-backdrop");
    t.ok(before > -1 && before < sweep, 'render(): focus noted BEFORE the modal sweep tears it down');
    const after = r.lastIndexOf('focusAfterRender()'), scan = r.indexOf('focusAssetForScan()');
    t.ok(after > -1 && after < scan, 'render(): focus decided BEFORE focusAssetForScan (paired mode wins)');
    t.ok(r.indexOf('focusAfterRender()') < r.indexOf("const finalHTML"), 'render(): the tour’s early return decides too');
    const ref = core.slice(core.indexOf('function refreshEntryAfterLog()'), core.indexOf('\n}\n', core.indexOf('function refreshEntryAfterLog()')));
    t.ok(ref.indexOf('focusBeforeRender()') > -1 && ref.indexOf('focusBeforeRender()') < ref.indexOf('app.innerHTML'), 'refreshEntryAfterLog: noted before the rewrite');
    t.ok(ref.indexOf("focusAfterRender('logged')") > -1 && ref.indexOf("focusAfterRender('logged')") < ref.indexOf('focusAssetForScan()'), "refreshEntryAfterLog: 'logged', before focusAssetForScan");

    const disp = strip(read('dispatch.js'));
    const click = disp.slice(disp.indexOf('function handleDelegatedClick'), disp.indexOf('function handleDelegatedInput'));
    t.ok(click.indexOf('focusNoteTap(el)') > -1 && click.indexOf('focusNoteTap(el)') < click.indexOf('fn(arg, el, e)'), 'click: the tap noted before the action runs');
    const chg = disp.slice(disp.indexOf('function handleDelegatedChange'), disp.indexOf('let _delegationInited'));
    t.ok(chg.indexOf('focusNoteTap(el)') > -1 && chg.indexOf('focusNoteTap(el)') < chg.indexOf('fn(_fieldValue(el), el, e)'), 'change: noted before the action runs');

    t.includes(strip(read('session.js')), "if (typeof focusMarkLogged === 'function') focusMarkLogged();", 'noteLastLog marks a log');

    // SWEEP: every function that appends a sheet to <body> reports it opened.
    const missing = [];
    for (const f of ['feedback.js', 'reset.js', 'report.js', 'render-review.js', 'render-help.js', 'settings-actions.js']) {
      const src = strip(read(f));
      const re = /document\.body\.appendChild\(sheet\)/g;
      let m;
      while ((m = re.exec(src))) {
        const fnStart = src.lastIndexOf('\nfunction ', m.index);
        const fnEnd = src.indexOf('\n}\n', m.index);
        const body = src.slice(fnStart, fnEnd);
        if (!/focusSheetOpened\(sheet\)/.test(body)) missing.push(`${f} ${src.slice(fnStart + 10, src.indexOf('(', fnStart))}`);
      }
    }
    t.deepEq(missing, [], 'every body sheet calls focusSheetOpened(sheet)');
    const fb = strip(read('feedback.js'));
    t.ok(/function _openSheet[\s\S]*?sheet\.remove\(\);\s*focusSheetClosed\(\);/.test(fb), '_openSheet’s cleanup calls focusSheetClosed');
    t.includes(strip(read('settings-actions.js')), "if (typeof focusSheetClosed === 'function') focusSheetClosed();", 'the setup-name sheet’s own cleanup does too');
    t.includes(fb, 'el.focus({ preventScroll: true })', 'focus never scrolls');
    t.includes(read('styles.css'), '[tabindex="-1"]:focus { outline: none; }', 'no ring round a heading');
  });
};
