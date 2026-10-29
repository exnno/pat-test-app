/* Standing test — V147: renumbering asset numbers
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID (Peter, 28–29 Oct: 7C 7b A; 1A 2A 3A 4A 5A). His shape:
   "renumber from item X to item Z sequentially starting with Y" — a new roll of
   stickers the app wasn't told about.
     7C   two ways in: Overview → Edit selected → Renumber… (the selected items,
          numbered in LOGGED order), and "Renumber from here" on a logged item.
     1A   from here: a First new number box and an Up to list, which starts on
          the last item.
     2A   the link sits under the asset box on the entry screen.
     7b A a new number already on an item OUTSIDE the block is refused, naming
          it; inside the block numbers only swap round, so they never clash.
     3A   a check sheet first, then Undo on the toast for a few seconds.
     4A   no "was" note; 5A no Settings switch; a locked job can't be renumbered.

     86a  the numbering and the plan (prefix, leading zeros, logged order, the
          clash rule, the refusals).
     86b  7C Edit selected → Renumber through the rendered buttons and #app's
          delegation: the check, the write, exported → modified, saved, locked.
     86c  2A/1A Renumber from here: the link (and where it isn't), the Up to
          list, a refused Check in place (no render), the form follows.
     86d  3A Undo, the action toast itself, and a job changed under the sheet.
     86e  the sheet belongs to one job and two screens; ids, photos and sync;
          release: V147, cache, What's new, About. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { freshApp, withSession, withItem, tick } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');

function boot(opts = {}) {
  const app = bootApp(opts);
  app.fn('load')();
  app.state = () => app.refresh('state').state;
  app.html = () => app.doc.getElementById('app').innerHTML;
  app.toasts = [];
  app.realShowToast = app.sandbox.showToast;
  app.sandbox.showToast = (m) => app.toasts.push(String(m));
  // The action toast is recorded AND left to run, so its timers and button are real.
  app.actionToasts = [];
  const real = app.sandbox.showActionToast;
  app.sandbox.showActionToast = function (msg, label, onTap, ms, onGone) {
    app.actionToasts.push({ msg: String(msg), label, onTap, ms, onGone });
    return real.apply(this, arguments);
  };
  app.renders = 0;
  const render = app.sandbox.render;
  app.sandbox.render = function () { app.renders++; return render.apply(this, arguments); };
  return app;
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
// Typing, through #app's input delegation.
function type(app, action, value) {
  const el = app.doc.createElement('input');
  el.dataset.inputAction = action;
  el.value = value;
  app.doc.getElementById('app').dispatchEvent({ type: 'input', target: el, preventDefault() {}, stopPropagation() {} });
}
// A pick from a list, through #app's change delegation.
function pick(app, action, value) {
  const el = app.doc.createElement('select');
  el.dataset.changeAction = action;
  el.value = String(value);
  app.doc.getElementById('app').dispatchEvent({ type: 'change', target: el, preventDefault() {}, stopPropagation() {} });
}
// The action on the rendered element with this id (the V67 lesson: the tap is
// read off the screen, never named by the test).
function actionOf(html, id) {
  const m = html.match(new RegExp(`id="${id}"[^>]*data-action="([^"]+)"`));
  return m ? m[1] : null;
}
// A job of `nos` asset numbers, each with its own type and location.
function job(app, nos, o = {}) {
  const sess = withSession(app, { site: o.site || 'ZZRENUMBER' });
  nos.forEach((no, k) => withItem(app, { assetNo: no, itemType: 'Type' + (k + 1), location: 'Room' + (k + 1), notes: '' }));
  return sess;
}
const numbers = (app) => app.fn('activeSession')().items.map(it => it.assetNo);

module.exports = async function () {

  /* ------------------------------------------------------------------ 86a */
  await t.group('86a — the numbering and the plan: prefix and zeros as typed, logged order, the clash rule (7b A)', () => {
    const app = boot({});
    const nums = app.fn('renumberNumbers');
    t.eq(JSON.stringify(nums('0451', 3)), JSON.stringify(['0451', '0452', '0453']), 'leading zeros carry');
    t.eq(JSON.stringify(nums('A0998', 3)), JSON.stringify(['A0998', 'A0999', 'A1000']), 'a prefix carries; the width grows, never wraps');
    t.eq(JSON.stringify(nums('  1001 ', 2)), JSON.stringify(['1001', '1002']), 'the ends are trimmed');
    t.eq(JSON.stringify(nums('00000000000000000007', 2)), JSON.stringify(['00000000000000000007', '00000000000000000008']),
      'the first number comes back exactly as typed (no ASSET_PAD_MAX cap)');
    t.eq(nums('KETTLE', 2), null, 'no number at the end: none');
    t.eq(nums('9007199254740991', 2), null, 'past what a phone counts exactly: none');

    const sess = job(app, ['0451', '0452', '0453', '0454', '0455']);
    const items = sess.items;
    const key = (i) => String(items[i].id);
    const plan = app.fn('renumberPlan');
    let p = plan(sess, [key(3), key(1)], '1001');
    t.eq(p.error, '', 'a plain plan');
    t.eq(JSON.stringify(p.rows.map(r => [r.i, r.from, r.to])), JSON.stringify([[1, '0452', '1001'], [3, '0454', '1002']]),
      'numbered in logged order, whatever order they were picked in');
    t.eq(p.rows[0].id, key(1), 'each row holds its item’s id');
    p = plan(sess, [key(0), key(1), key(2), key(3), key(4)], '0452');
    t.eq(p.error, '', 'inside the block numbers only swap round — no clash');
    t.eq(JSON.stringify(p.rows.map(r => r.to)), JSON.stringify(['0452', '0453', '0454', '0455', '0456']), '…0451–0455 become 0452–0456');
    p = plan(sess, [key(0), key(1)], '0454');
    t.includes(p.error, '0454 is already on item 4 (Type4, Room4)', 'outside the block: refused, naming the item');
    t.eq(p.rows.length, 0, '…and nothing planned');
    t.includes(plan(sess, [key(0)], '').error, 'Type the first new number', 'an empty box is refused');
    t.includes(plan(sess, [key(0)], 'ZZ').error, 'needs to end in a number', 'no number at the end is refused');
    t.includes(plan(sess, [], '1').error, 'Select the items', 'nothing chosen is refused');
    t.includes(plan(sess, ['ZZGONE'], '1').error, 'no longer in this job', 'an item that went is refused');
    t.includes(plan(sess, [key(0), key(1)], '0451').error, 'already have those numbers', 'no change at all is refused');
    sess.locked = true;
    t.includes(plan(sess, [key(0)], '1').error, 'locked', 'a locked job is refused');
    sess.locked = false;
  });

  /* ------------------------------------------------------------------ 86b */
  await t.group('86b — 7C Edit selected → Renumber, through the screen: check, write, exported, saved, locked', () => {
    const app = boot({});
    const sess = job(app, ['0451', '0452', '0453', '0454']);
    sess.exportedAt = new Date().toISOString();
    sess.exportDirty = false;
    app.fn('save')();
    const ids = sess.items.map(it => it.id);
    app.fn('setView')('overview');
    tap(app, 'enter-selection');
    tap(app, 'row-toggle', 3);   // tapped last item first (the plan's own order is pinned in 86a)
    tap(app, 'row-toggle', 1);
    tap(app, actionOf(app.html(), 'bulk-edit-menu-btn') || 'bulk-menu-open');
    let html = app.html();
    const act = actionOf(html, 'bulk-renumber-btn');
    t.eq(act, 'renumber-selected', 'Renumber… is in the Edit selected menu, wired');
    t.excludes(html, 'id="bulk-renumber-note"', '…with no locked note on an unlocked job');
    tap(app, act || 'renumber-selected');
    html = app.html();
    t.eq(app.state().bulkEdit.menuOpen, false, 'the menu gives way to the sheet');
    t.includes(html, '<h3 class="bulk-sheet-title">Renumber 2 items</h3>', 'the Renumber sheet opens for the two');
    t.includes(html, 'numbered in the order they were logged', '…saying the order');
    t.ok(/id="renumber-first"[^>]*data-input-action="renumber-first"/.test(html), 'its First new number box is wired');
    t.ok(/<form class="renumber-form"[^]*type="submit"[^>]*id="renumber-check"/.test(html), 'Check is the form’s submit (the Done key and a scanner’s Enter press it)');
    type(app, 'renumber-first', '1001');
    tap(app, actionOf(html, 'renumber-check') || 'renumber-check');
    html = app.html();
    t.eq(app.state().renumber.step, 'check', 'Check moves to the check sheet');
    t.includes(html, 'Renumber 2 items?', 'it asks');
    t.includes(html, '<li><span>Item 2</span><span>0452 → <strong>1001</strong></span></li>', 'item 2 first…');
    t.includes(html, '<li><span>Item 4</span><span>0454 → <strong>1002</strong></span></li>', '…then item 4');
    t.includes(html, 'This job has been exported, so it will show as changed.', 'an exported job says it will show as changed');
    t.eq(JSON.stringify(numbers(app)), JSON.stringify(['0451', '0452', '0453', '0454']), 'nothing changed yet');
    tap(app, actionOf(html, 'renumber-apply') || 'renumber-apply');
    t.eq(JSON.stringify(numbers(app)), JSON.stringify(['0451', '1001', '0453', '1002']), 'renumbered, in logged order');
    t.eq(JSON.stringify(app.fn('activeSession')().items.map(it => it.id)), JSON.stringify(ids), 'the same items (ids unchanged)');
    t.eq(app.state().renumber.open, false, 'the sheet closes');
    t.eq(app.state().selectionMode, false, 'the selection ends');
    t.eq(app.actionToasts.length && app.actionToasts[0].msg, 'Renumbered 2 items', 'it says how many');
    t.eq(app.actionToasts[0].label, 'Undo', '…with Undo');
    t.eq(app.actionToasts[0].ms, app.run('RENUMBER_UNDO_MS'), '…for RENUMBER_UNDO_MS');
    t.ok(app.run('RENUMBER_UNDO_MS') >= 5000, '…long enough to read and reach (a plain toast is 1.9 s)');
    t.ok(app.fn('activeSession')().exportDirty, 'an exported job is now "modified"');
    app.fn('load')();
    const back = app.state().sessions.find(s => s.id === sess.id);
    t.eq(JSON.stringify(back.items.map(it => it.assetNo)), JSON.stringify(['0451', '1001', '0453', '1002']), 'saved: a restart keeps the new numbers');

    // A locked job: Renumber greyed, with the reason; the action does nothing.
    const lk = boot({});
    const ls = job(lk, ['L1', 'L2']);
    ls.locked = true;
    lk.fn('setView')('overview');
    tap(lk, 'enter-selection');
    tap(lk, 'row-toggle', 0);
    tap(lk, 'bulk-menu-open');
    const lh = lk.html();
    t.ok(/id="bulk-renumber-btn"[^>]*disabled/.test(lh), 'locked: Renumber is greyed');
    t.includes(lh, 'Unlock the job to renumber.', '…and says why');
    tap(lk, 'renumber-selected');
    t.eq(lk.state().renumber.open, false, '…and does nothing if reached');
  });

  /* ------------------------------------------------------------------ 86c */
  await t.group('86c — 2A/1A Renumber from here: the link, the Up to list, a refused Check in place, the form follows', () => {
    const app = boot({});
    job(app, ['0451', '0452', '0453', '0454', '0455']);
    app.fn('setView')('entry');
    const st = app.state();
    t.eq(st.cursor, 5, '(on the next new item)');
    t.excludes(app.html(), 'id="renumber-from-btn"', 'no link on a new item');
    app.fn('jumpTo')(2);
    let html = app.html();
    const act = actionOf(html, 'renumber-from-btn');
    t.eq(act, 'renumber-from', 'parked on a logged item: Renumber from here, wired');
    t.ok(html.indexOf('id="f-asset"') < html.indexOf('id="renumber-from-btn"') && html.indexOf('id="renumber-from-btn"') < html.indexOf('id="f-location"'),
      '…under the asset box');
    tap(app, act || 'renumber-from');
    html = app.html();
    t.includes(html, '<h3 class="bulk-sheet-title">Renumber from item 3</h3>', 'the sheet starts at this item');
    t.includes(html, 'From Item 3 · 0453 · Type3 · Room3', '…naming it');
    const sel = html.slice(html.indexOf('id="renumber-to"'), html.indexOf('</select>'));
    t.ok(/data-change-action="renumber-to"/.test(sel), 'the Up to list is wired');
    t.eq((sel.match(/<option /g) || []).length, 3, '…from this item to the last');
    t.ok(/<option value="4" selected>Item 5 · 0455[^<]*\(last\)<\/option>/.test(sel), '…starting on the last (1A)');
    t.excludes(sel, '0452', '…never an earlier item');

    // A clash: refused in place — no render, the reason on the page.
    type(app, 'renumber-first', '0451');
    const r0 = app.renders;
    tap(app, 'renumber-check');
    t.eq(app.renders, r0, 'a refused Check does not render (MAP rule 3 — the keyboard stays up)');
    t.eq(app.state().renumber.step, 'form', '…stays on the form');
    const err = app.doc.getElementById('renumber-error');
    t.includes(err.textContent, '0451 is already on item 1 (Type1, Room1)', '…with the reason on the page');
    t.eq(err.hidden, false, '…showing');
    type(app, 'renumber-first', '100');
    t.eq(err.textContent, '', 'typing again clears it');
    t.eq(app.renders, r0, '…still without a render');

    // Up to item 4, from 1001: items 3–4 only.
    pick(app, 'renumber-to', 3);
    type(app, 'renumber-first', '1001');
    tap(app, 'renumber-check');
    html = app.html();
    t.includes(html, 'Renumber 2 items?', 'Up to item 4: two items');
    t.excludes(html, '0455 →', '…item 5 left alone');
    t.eq(app.state().form.assetNo, '0453', '(the form shows the parked item’s number)');
    tap(app, 'renumber-apply');
    t.eq(JSON.stringify(numbers(app)), JSON.stringify(['0451', '0452', '1001', '1002', '0455']), 'items 3 and 4 renumbered');
    t.eq(app.state().form.assetNo, '1001', 'the parked item’s box follows');
    t.excludes(app.html(), '<h3 class="bulk-sheet-title">Renumber', 'the sheet is gone');

    // To the end, from the new-item screen's point of view: the next number follows.
    const nx = boot({});
    job(nx, ['0451', '0452', '0453']);
    nx.fn('setView')('entry');
    t.eq(nx.state().form.assetNo, '0454', '(the box offers the next number)');
    nx.fn('jumpTo')(1);
    tap(nx, 'renumber-from');
    type(nx, 'renumber-first', '2001');
    tap(nx, 'renumber-check');
    tap(nx, 'renumber-apply');
    t.eq(JSON.stringify(numbers(nx)), JSON.stringify(['0451', '2001', '2002']), 'from item 2 to the last');
    nx.fn('jumpTo')(3);
    t.eq(nx.state().form.assetNo, '2003', 'the next number follows the new last number');
    // …and while ON the new item, its automatic number follows at once.
    const on = boot({});
    job(on, ['0451', '0452']);
    on.fn('setView')('entry');
    on.state().renumber = Object.assign(on.fn('renumberClosed')(), { open: true, kind: 'selected', sid: on.state().activeId,
      indices: on.fn('activeSession')().items.map(it => String(it.id)), first: '3001' });
    on.fn('renumberCheck')();
    on.fn('applyRenumber')();
    t.eq(on.state().form.assetNo, '3003', 'on the new item, the automatic number follows straight away');
    on.state().form.assetNo = 'ZZTYPED';
    on.state().renumber = Object.assign(on.fn('renumberClosed')(), { open: true, kind: 'selected', sid: on.state().activeId,
      indices: on.fn('activeSession')().items.map(it => String(it.id)), first: '4001' });
    on.fn('renumberCheck')();
    on.fn('applyRenumber')();
    t.eq(on.state().form.assetNo, 'ZZTYPED', '…but a number typed by hand is left alone');

    // A locked job: no link.
    const lk = boot({});
    const ls = job(lk, ['L1', 'L2']);
    ls.locked = true;
    lk.fn('setView')('entry');
    lk.fn('jumpTo')(0);
    t.excludes(lk.html(), 'id="renumber-from-btn"', 'a locked job: no link');
    tap(lk, 'renumber-from');
    t.eq(lk.state().renumber.open, false, '…and the action does nothing');
  });

  /* ------------------------------------------------------------------ 86d */
  await t.group('86d — 3A Undo; the action toast itself; a job changed under the sheet', async () => {
    const app = boot({});
    job(app, ['0451', '0452', '0453', '0454']);
    app.fn('setView')('entry');
    app.fn('jumpTo')(1);
    tap(app, 'renumber-from');
    type(app, 'renumber-first', '1001');
    tap(app, 'renumber-check');
    tap(app, 'renumber-apply');
    t.eq(JSON.stringify(numbers(app)), JSON.stringify(['0451', '1001', '1002', '1003']), '(renumbered 2–4)');
    t.ok(app.state().renumberUndo, 'Undo is on offer');
    // One changed by hand since: it keeps its number.
    app.fn('activeSession')().items[3].assetNo = 'ZZHAND';
    // The real toast's button, tapped.
    const toast = app.doc.body.children.filter(c => c.classList && c.classList.contains('toast-action')).pop();
    t.ok(toast, 'the toast is on the page, outside #app');
    const btn = toast && toast.children.find(c => c.className === 'toast-btn');
    t.eq(btn && btn.textContent, 'Undo', '…with an Undo button');
    t.notOk(toast.getAttribute('aria-hidden'), '…which VoiceOver can reach (the toast isn’t hidden)');
    btn.click();
    t.eq(JSON.stringify(numbers(app)), JSON.stringify(['0451', '0452', '0453', 'ZZHAND']), 'Undo puts the numbers back — not the one changed since');
    t.ok(app.toasts.includes('Put back 2 numbers'), '…and says how many');
    t.eq(app.state().renumberUndo, null, '…once');
    t.eq(app.state().form.assetNo, '0452', 'the parked item’s box follows back');
    app.fn('load')();
    const saved = app.state().sessions.find(s => s.id === app.state().activeId);
    t.eq(saved.items[1].assetNo, '0452', 'saved');

    // Never a number another item has taken since.
    const tk = boot({});
    job(tk, ['0451', '0452']);
    tk.fn('setView')('entry');
    tk.fn('jumpTo')(0);
    tap(tk, 'renumber-from');
    type(tk, 'renumber-first', '1001');
    tap(tk, 'renumber-check');
    tap(tk, 'renumber-apply');
    tk.fn('jumpTo')(2);   // the new item — parked on item 1, saving would overwrite it
    withItem(tk, { assetNo: '0451', itemType: 'Kettle', location: 'Hall', notes: '' });
    tk.fn('undoRenumber')();
    t.eq(JSON.stringify(numbers(tk)), JSON.stringify(['1001', '0452', '0451']), 'a number taken since is not put back (no duplicate)');

    // Undo on a job that is no longer open still reaches the disk.
    const off = boot({});
    const a = job(off, ['A1', 'A2'], { site: 'ZZJOBA' });
    off.fn('setView')('entry');
    off.fn('jumpTo')(0);
    tap(off, 'renumber-from');
    type(off, 'renumber-first', 'A11');
    tap(off, 'renumber-check');
    tap(off, 'renumber-apply');
    job(off, ['B1'], { site: 'ZZJOBB' });   // another job open now
    off.fn('save')();                        // job A's encoding cached as "A11, A12"
    off.fn('undoRenumber')();
    off.fn('load')();
    const aa = off.state().sessions.find(s => s.id === a.id);
    t.eq(JSON.stringify(aa.items.map(it => it.assetNo)), JSON.stringify(['A1', 'A2']), 'an Undo on a job not open is saved too (its encoding dropped)');

    // The toast going without the tap takes the offer with it.
    const go = boot({});
    let gone = 0, tapped = 0;
    go.fn('showActionToast')('ZZ', 'Undo', () => tapped++, 20, () => gone++);
    await tick(60);
    t.eq(gone, 1, 'timed out: the offer goes');
    t.eq(tapped, 0, '…without running');
    go.fn('showActionToast')('ZZ', 'Undo', () => tapped++, 5000, () => gone++);
    go.realShowToast('ZZNEXT');   // the real plain toast (boot put a recorder in its place)
    t.eq(gone, 2, 'pushed off by the next toast: the offer goes');
    const t3 = go.doc.body.children.filter(c => c.classList && c.classList.contains('toast-action')).pop();
    go.fn('showActionToast')('ZZ', 'Undo', () => tapped++, 5000, () => gone++);
    const t4 = go.doc.body.children.filter(c => c.classList && c.classList.contains('toast-action')).pop();
    t.ok(t4 && t4 !== t3, '(a fresh toast)');
    t4.children.find(c => c.className === 'toast-btn').click();
    t4.children.find(c => c.className === 'toast-btn').click();
    go.realShowToast('ZZAFTER');
    t.eq(gone, 2, 'tapped: not counted as gone — nor later, when the next toast comes');
    t.eq(tapped, 2, '…and it ran (a second tap is the undo’s own no-op)');

    // A job changed under the open check sheet: nothing written, back to the form.
    const ch = boot({});
    job(ch, ['0451', '0452', '0453']);
    ch.fn('setView')('overview');
    tap(ch, 'enter-selection');
    tap(ch, 'row-toggle', 0);
    tap(ch, 'row-toggle', 1);
    tap(ch, 'renumber-selected');
    type(ch, 'renumber-first', '1001');
    tap(ch, 'renumber-check');
    ch.fn('activeSession')().items[1].assetNo = 'ZZPULLED';   // a pull lands
    tap(ch, 'renumber-apply');
    t.eq(JSON.stringify(numbers(ch)), JSON.stringify(['0451', 'ZZPULLED', '0453']), 'changed under the sheet: nothing written');
    t.eq(ch.state().renumber.step, 'form', '…back to the form');
    t.includes(ch.html(), 'These items changed while this was open.', '…saying so');
    t.eq(ch.actionToasts.length, 0, '…and no Undo offered');
    tap(ch, 'renumber-check');
    tap(ch, 'renumber-apply');
    t.eq(JSON.stringify(numbers(ch)), JSON.stringify(['1001', '1002', '0453']), 'checked again, it goes through');
  });

  /* ------------------------------------------------------------------ 86e */
  await t.group('86e — one job, two screens; ids, photos and sync untouched; release: V147', () => {
    const app = boot({});
    const a = job(app, ['0451', '0452'], { site: 'ZZJOBA' });
    app.fn('setView')('entry');
    app.fn('jumpTo')(0);
    tap(app, 'renumber-from');
    t.ok(app.state().renumber.open, '(open on the entry screen)');
    app.fn('setView')('overview');
    t.includes(app.html(), 'Renumber from item 1', 'it stays up on the Overview of the same job');
    app.fn('setView')('settings');
    t.eq(app.state().renumber.open, false, 'another screen shuts it');
    app.fn('setView')('entry');
    t.excludes(app.html(), 'bulk-sheet-title">Renumber', '…and it doesn’t come back');
    app.fn('jumpTo')(0);
    tap(app, 'renumber-from');
    job(app, ['B1'], { site: 'ZZJOBB' });
    app.fn('setView')('entry');
    t.eq(app.state().renumber.open, false, 'another job open: shut');
    tap(app, 'renumber-close');
    t.eq(app.state().renumber.open, false, '× closes');

    // A long block: the check shows the first two, a gap and the last.
    const lg = boot({});
    job(lg, ['1', '2', '3', '4', '5', '6']);
    lg.fn('setView')('entry');
    lg.fn('jumpTo')(0);
    tap(lg, 'renumber-from');
    type(lg, 'renumber-first', '101');
    tap(lg, 'renumber-check');
    const lh = lg.html();
    t.includes(lh, '<li><span>Item 1</span>', 'a long block: item 1…');
    t.includes(lh, '<li><span>Item 2</span>', '…item 2…');
    t.includes(lh, '<li class="renumber-gap" aria-hidden="true">\u2026</li>', '…a gap…');
    t.includes(lh, '<li><span>Item 6</span><span>6 \u2192 <strong>106</strong></span></li>', '…and the last');
    t.excludes(lh, '<li><span>Item 4</span>', '…not every line (the sheet stays short)');
    t.includes(lh, 'Renumber 6 items?', '…counting them all');

    // Ids, photos and the sync fingerprint.
    const sy = boot({});
    const s = job(sy, ['0451', '0452']);
    const before = sy.fn('_syncCanonical')(s);
    const ids = s.items.map(it => it.id);
    sy.state().photoMeta = { p1: { s: s.id, i: ids[0] } };
    sy.fn('setView')('entry');
    sy.fn('jumpTo')(0);
    tap(sy, 'renumber-from');
    type(sy, 'renumber-first', '9001');
    tap(sy, 'renumber-check');
    tap(sy, 'renumber-apply');
    const after = sy.fn('_syncCanonical')(sy.fn('activeSession')());
    t.ok(before !== after && after.indexOf('9001') !== -1, 'the job’s sync fingerprint changes, so the next sync sends it');
    t.eq(sy.state().photoMeta.p1.i, ids[0], 'a photo still points at its item');
    t.eq(JSON.stringify(sy.fn('activeSession')().items.map(it => it.notes)), JSON.stringify(['', '']), 'no "was" note (4A)');

    // ---- release.
    const rel = freshApp();
    t.eq(rel.run('APP_VERSION'), 'V147', 'APP_VERSION V147');
    t.eq(rel.run('WELCOME_VERSION'), 'V147', 'What’s new rolled');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v147';", 'cache key pat-v147');
    const core = read('render-core.js');
    const at = core.indexOf('<ul class="welcome-list sheet-scroll">');
    const sheetCopy = core.slice(at, core.indexOf('</ul>', at));
    t.eq((sheetCopy.match(/<li>/g) || []).length, 1, 'What’s new: one line');
    t.includes(sheetCopy, '<li><strong>Renumber asset numbers.</strong>', '…renumbering');
    t.includes(sheetCopy, 'choose &ldquo;Renumber from here&rdquo;, or select items and use Edit selected &rarr; Renumber.', '…both ways in');
    const help = read('render-help.js');
    const x = help.indexOf('<p><strong>V147</strong>'), y = help.indexOf('<p><strong>V146</strong>'), z = help.indexOf('<p><strong>V145</strong>');
    t.ok(x > -1 && y > x && z > y, 'About: V147, V146, V145');
    t.excludes(help, '<p><strong>V144</strong>', 'V144 rolled off');
    t.includes(help, 'Renumber asset numbers when a new roll of stickers starts', 'About: V147’s line');
    t.includes(help, 'Tapping the description box empties it, ready for a new word, and suggestions no longer vanish', 'About: V146’s line still there');
    t.includes(help, 'A phone&rsquo;s jobs belong to one account, and are never sent into another.', 'About: V145’s line still there');
    const disp = read('dispatch.js');
    t.includes(disp, "'renumber-apply': () => applyRenumber(),", 'Renumber wired');
    t.includes(disp, "'renumber-first': (v) => {", 'the First new number box wired');
    t.includes(disp, "'renumber-to': (v) => {", 'the Up to list wired');
  });
};
