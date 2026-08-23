/* Standing test — the hold gesture, "Log again ×N", and the preset-edit return
   marker (V77)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Three things that look unrelated and are not: two hold
   gestures now share one implementation (attachHoldGesture, events.js), the new
   one opens a batch-append sheet, and a deep link out of the older one leaves a
   marker so Back returns where the user came from.

   ⚠ THE LISTENER-WIRING RULE (V67) IS THE WHOLE REASON 13a AND 13b LOOK LIKE
   THIS. The hold is bound by PROPERTY (`el.ontouchstart = …`), not by
   addEventListener, and a property handler that is written but never assigned —
   because the element id changed, or the bind function stopped being called on
   that paint — is invisible to any test that reaches in and calls the function
   by hand. So these fire real events at the real elements the app rendered.
   The stub's dispatchEvent was extended in V77 to invoke `on<type>` handlers the
   way a real element does, specifically so this path exists.

   ⚠ 13n IS THE ASSERTION THAT DOES NOT DECAY, and it is the one to protect.
   Everything else here is per-site and goes stale as gestures are added. 13n
   fails if ANY file grows a second `ontouchstart` — that is, if someone
   hand-rolls a hold instead of calling attachHoldGesture. It is the direct
   analogue of 12d, and it exists because the app reached three sheet-scroller
   implementations by exactly this route: each one reasonable on its own.

   ⚠ WHAT THIS FILE CANNOT PROVE. There is no touch stack and no compositor.
   Nothing here shows that a real finger on a real iPhone fires these handlers in
   this order, or that the text-selection suppression works — 13m source-guards
   the CSS and says so rather than pretending to have checked a rendering. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, populated, withSession, withItem, CANARY } = require('../fixture');

function read(f) {
  return fs.readFileSync(path.join(APP_DIR, f), 'utf8');
}

/* Comments must be stripped before asserting on either source — the V75/V76
   lesson. Every rule and every block this release touched carries a comment
   NAMING the properties and identifiers under discussion (`user-select`,
   `ontouchstart`, `presetEditReturnView`), so a raw search finds the explanation
   of a deleted thing and reports it as present. */
function stripCssComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}
function stripJsComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

/* Replace setTimeout INSIDE the vm with a capture list, so a hold's threshold is
   a thing this test steps over deliberately rather than waits for. Real timers
   here would make the boundary assertions racy and slow, and — worse — would
   make "did not fire yet" indistinguishable from "never fires".

   restore() puts the real one back; several app paths (toasts, suggestion blur)
   use setTimeout for their own reasons and should not be left captured.

   ⚠ IDS ARE 1-BASED, AND THAT IS NOT COSMETIC. The first version handed out
   0 for the first timer, and attachHoldGesture guards its cancel with
   `if (pressTimer)` — so every drift-abort silently did nothing and 13c failed
   against correct app code. No real browser returns 0 from setTimeout (ids start
   at 1 everywhere), so a stub that does is modelling something that cannot
   happen and inventing a bug to go with it. Sixth time in this suite that a red
   assertion was the test's fault; trace before touching the app. */
function captureTimers(app) {
  app.run(`
    globalThis.__heldTimers = [];
    globalThis.__realSetTimeout = setTimeout;
    globalThis.__realClearTimeout = clearTimeout;
    setTimeout = function (fn, ms) {
      globalThis.__heldTimers.push({ fn: fn, ms: ms, live: true });
      return globalThis.__heldTimers.length;   /* 1-based, like a real browser */
    };
    clearTimeout = function (id) {
      var slot = globalThis.__heldTimers[id - 1];
      if (slot) { slot.live = false; return; }
      return globalThis.__realClearTimeout(id);
    };
  `);
  return {
    /* How many captured timers are still armed. */
    liveCount() {
      return app.run('globalThis.__heldTimers.filter(function (s) { return s.live; }).length');
    },
    /* Run every still-live captured timer, in order. */
    fire() {
      app.run(`
        globalThis.__heldTimers.forEach(function (s) {
          if (s.live) { s.live = false; s.fn(); }
        });
      `);
    },
    restore() {
      app.run('setTimeout = globalThis.__realSetTimeout; clearTimeout = globalThis.__realClearTimeout;');
    },
  };
}

function touch(x, y) {
  return { touches: [{ clientX: x, clientY: y }] };
}

/* Fire a touch event AT the element, through dispatchEvent — never by calling
   el.ontouchstart(...) directly. See the listener-wiring note at the top. */
function fireTouch(el, type, x, y) {
  const ev = {
    type,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() {},
    target: el,
    currentTarget: null,
    ...touch(x, y),
  };
  return el.dispatchEvent(ev);
}

function fireClick(el) {
  const ev = {
    type: 'click',
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() {},
    target: el,
    currentTarget: null,
  };
  // dispatchEvent returns false when preventDefault was called — which is
  // exactly what the capture-phase swallow does.
  return el.dispatchEvent(ev);
}

/* Paint the entry screen and hand back the two controls that carry a hold. */
function entryControls(app) {
  app.fn('setView')('entry');
  return {
    grid: app.doc.getElementById('quick-grid'),
    copy: app.doc.getElementById('copy-last-btn'),
  };
}

module.exports = async function () {

  const eventsSrc   = read('events.js');
  const utilsSrc    = read('utils.js');
  const cssSrc      = read('styles.css');
  const coreSrc     = read('render-core.js');
  const dispatchSrc = read('dispatch.js');
  const sessionSrc  = read('session.js');

  const liveCss     = stripCssComments(cssSrc);
  const liveEvents  = stripJsComments(eventsSrc);

  await t.group('13a — holding the quick-pick grid opens the preset sheet, through the element', () => {
    const app = populated();
    const { grid } = entryControls(app);
    t.ok(grid, 'the entry screen painted a quick-pick grid to hold');

    const timers = captureTimers(app);
    fireTouch(grid, 'touchstart', 100, 200);

    // The gate: a press that has not yet been held long enough must do nothing.
    // Without this the next assertion would pass for a handler that opened the
    // sheet on touchstart, which is a different (and much worse) feature.
    t.eq(app.state().presetSheetOpen, false, 'touchstart alone does not open it');
    t.ok(timers.liveCount() >= 1, 'a hold timer was armed BY the dispatched event');

    timers.fire();
    t.eq(app.state().presetSheetOpen, true, 'the sheet opened once the hold elapsed');
    timers.restore();
  });

  await t.group('13b — holding Copy last result opens the ×N sheet', () => {
    const app = populated();
    const { copy } = entryControls(app);
    t.ok(copy, 'the entry screen painted a Copy-last button to hold');

    const timers = captureTimers(app);
    fireTouch(copy, 'touchstart', 40, 600);
    t.eq(app.state().repeatSheetOpen, false, 'touchstart alone does not open it');

    timers.fire();
    t.eq(app.state().repeatSheetOpen, true, 'the ×N sheet opened once the hold elapsed');

    // And the sheet it opened is a real one, not just a flag: the markup has to
    // reach the painted screen or the flag is decoration.
    app.fn('render')();
    const html = app.doc.getElementById('app').innerHTML;
    t.includes(html, 'data-action="repeat-fire"', 'the sheet painted its count buttons');
    t.includes(html, 'id="repeat-custom"', 'the sheet painted its custom box');
    timers.restore();
  });

  await t.group('13c — finger drift aborts a pending hold at both sites', () => {
    for (const which of ['grid', 'copy']) {
      const app = populated();
      const els = entryControls(app);
      const el = els[which];
      const timers = captureTimers(app);

      fireTouch(el, 'touchstart', 100, 200);
      fireTouch(el, 'touchmove', 100, 260);   // 60px — well past the 12px slop
      timers.fire();

      const flag = which === 'grid' ? 'presetSheetOpen' : 'repeatSheetOpen';
      t.eq(app.state()[flag], false, `${which}: a drifted press did not fire the hold`);
      timers.restore();
    }

    // Not hollow: prove the same gesture WITHOUT the drift does fire, so the
    // assertions above are testing the slop and not a broken fixture.
    const app = populated();
    const { grid } = entryControls(app);
    const timers = captureTimers(app);
    fireTouch(grid, 'touchstart', 100, 200);
    fireTouch(grid, 'touchmove', 100, 205);   // 5px — inside the slop
    timers.fire();
    t.eq(app.state().presetSheetOpen, true, 'a press that barely moves still fires');
    timers.restore();
  });

  await t.group('13d — a fired hold swallows exactly one following click', () => {
    const app = populated();
    const { copy } = entryControls(app);
    const timers = captureTimers(app);

    // Baseline: with no hold, a click is not interfered with. This is what makes
    // the swallow assertion mean something — an implementation that prevented
    // every click would pass the next line and fail this one.
    t.eq(fireClick(copy), true, 'an ordinary tap is not swallowed');

    fireTouch(copy, 'touchstart', 40, 600);
    timers.fire();
    fireTouch(copy, 'touchend', 40, 600);

    t.eq(fireClick(copy), false, 'the click following a fired hold IS swallowed');
    t.eq(fireClick(copy), true, 'only ONE click is swallowed, not every click after');
    timers.restore();
  });

  await t.group('13e — the hold is refused when Copy-last is not usable', () => {
    // A locked job. The tap path is disabled by the attribute; a hold is not a
    // click and the attribute alone would not stop it, so this is a real guard
    // rather than a restatement of the markup.
    const locked = populated();
    entryControls(locked);
    locked.fn('activeSession')().locked = true;
    let timers = captureTimers(locked);
    fireTouch(locked.doc.getElementById('copy-last-btn'), 'touchstart', 40, 600);
    timers.fire();
    t.eq(locked.state().repeatSheetOpen, false, 'a locked job refuses the hold');
    timers.restore();

    // An empty job — there is no last item to make copies of.
    const empty = freshApp();
    withSession(empty);
    entryControls(empty);
    const copy = empty.doc.getElementById('copy-last-btn');
    timers = captureTimers(empty);
    fireTouch(copy, 'touchstart', 40, 600);
    timers.fire();
    t.eq(empty.state().repeatSheetOpen, false, 'an empty job refuses the hold');
    timers.restore();
  });

  await t.group('13f — the batch APPENDS and never overwrites the item under the cursor', () => {
    // ⚠ This is the difference from copyLastResult() that matters most.
    // Copy-last overwrites when the cursor is parked mid-list; a batch doing the
    // same would destroy N-1 existing rows silently, and the user's only signal
    // would be a count that did not go up as far as they expected.
    const app = populated();
    const sess = app.fn('activeSession')();
    const before = sess.items.length;
    const midAsset = sess.items[1].assetNo;
    const midType  = sess.items[1].itemType;

    app.state().cursor = 1;                 // parked on an existing item
    app.state().form.location = CANARY.location;
    app.fn('repeatLastResult')(3);

    const after = app.fn('activeSession')();
    t.eq(after.items.length, before + 3, 'exactly three items were added');
    t.eq(after.items[1].assetNo, midAsset, 'the item under the cursor kept its asset number');
    t.eq(after.items[1].itemType, midType, 'the item under the cursor was not overwritten');
    t.eq(app.state().cursor, after.items.length, 'the cursor landed on a fresh new item');
  });

  await t.group('13g — every copy is auto-numbered, and the form asset box is ignored', () => {
    const app = populated();
    app.state().form.location = CANARY.location;
    // A number sitting in the box, as it would be after a scan. Copy-last would
    // use it; a batch must not, or all N copies would collide on one number.
    app.state().form.assetNo = 'ZZSCANNED-9999';
    app.state().scanFilledAsset = true;

    const before = app.fn('activeSession')().items.length;
    app.fn('repeatLastResult')(3);
    const items = app.fn('activeSession')().items;
    const added = items.slice(before);

    t.eq(added.length, 3, 'three copies were appended');
    t.deepEq(added.filter(i => i.assetNo === 'ZZSCANNED-9999'), [],
      'not one copy took the number from the form');
    const nums = added.map(i => i.assetNo);
    t.eq(new Set(nums).size, 3, 'the three copies have three distinct asset numbers');

    // The scan carry-forward must be cleared, or the next entry's asset box is
    // blanked on the strength of a scan from before the batch.
    t.eq(app.state().lastLogWasScanned, false, 'the scan carry-forward was cleared');
    t.eq(app.state().lastScanSessionId, '', 'and its session id with it');
  });

  await t.group('13h — type, result AND notes are carried from the source item', () => {
    // The notes half is the V77 decision and the reason the sheet previews what
    // it is about to copy: a fail's REASON lives in notes (pickFailReason appends
    // it there), so a batch of fails with blank notes is unusable on a
    // certificate. copyLastResult blanks notes; this deliberately does not.
    const app = freshApp();
    withSession(app);
    withItem(app, { itemType: 'Extension Lead', notes: 'Failed earth continuity', result: 'fail' });
    app.state().form.location = CANARY.location;

    app.fn('repeatLastResult')(2);
    const items = app.fn('activeSession')().items;
    const added = items.slice(1);

    t.eq(added.length, 2, 'two copies were appended');
    for (const it of added) {
      t.eq(it.result, 'fail', 'the copy carries the source result');
      t.eq(it.itemType, 'Extension Lead', 'the copy carries the source item type');
      t.eq(it.notes, 'Failed earth continuity', 'the copy carries the source notes — the fail reason survives');
    }
  });

  await t.group('13i — the count is clamped at both ends', () => {
    const max = Number(read('config.js').match(/const REPEAT_MAX_N = (\d+);/)[1]);
    t.ok(max >= 2 && max <= 100, 'the cap is a sane number to be testing against');

    const app = populated();
    app.state().form.location = CANARY.location;
    const before = app.fn('activeSession')().items.length;
    app.fn('repeatLastResult')(999);
    t.eq(app.fn('activeSession')().items.length, before + max,
      'an absurd count clamps to the cap rather than burying the job');

    // The low end. A zero, a negative or a NaN must add NOTHING — this path
    // appends, so a wrong answer here is data the user has to go and delete.
    for (const bad of [0, -5, NaN, undefined, 'lots']) {
      const a2 = populated();
      a2.state().form.location = CANARY.location;
      const n0 = a2.fn('activeSession')().items.length;
      a2.fn('repeatLastResult')(bad);
      t.eq(a2.fn('activeSession')().items.length, n0, `a count of ${String(bad)} added nothing`);
    }
  });

  await t.group('13j — location comes from the form and is mandatory', () => {
    const app = populated();
    app.state().form.location = '';       // engineer has moved on and not typed one
    app.state().repeatSheetOpen = true;
    const before = app.fn('activeSession')().items.length;

    app.fn('repeatLastResult')(3);

    t.eq(app.fn('activeSession')().items.length, before, 'nothing was logged without a location');
    t.eq(app.state().repeatSheetOpen, false,
      'the sheet closed first, so the toast clears to the Location field rather than sitting over it');

    // And with one, it is the FORM's location that lands on the copies — not the
    // source item's, which is the whole point of asking for it.
    app.state().form.location = 'ZZMOVEDON';
    app.fn('repeatLastResult')(2);
    const added = app.fn('activeSession')().items.slice(before);
    t.eq(added.length, 2, 'the retry logged');
    // Compare against what the app's OWN normaliser makes of the typed string.
    // Hard-coding the cased result here would be asserting my guess at
    // normaliseLocation's behaviour rather than that the form value was used.
    const expected = app.fn('normaliseLocation')('ZZMOVEDON');
    t.deepEq([...new Set(added.map(i => i.location))], [expected],
      'every copy took the one location from the form');
    t.notEq(expected, CANARY.location, 'and that is not the source item\'s location');
  });

  await t.group('13k — every batch item is timestamped, whatever the display setting says', () => {
    // ⚠ THE v61 RULE, and a defect this release fixed. From v61 `ts` is captured
    // on EVERY item's first log and the setting gates EXPOSURE only. saveItem and
    // copyLastResult were converted; multiPickFire was MISSED and still gated
    // capture, so Multi Pick items logged with the setting off carried no
    // timestamp at all and a job's testing time read short. Both batch paths are
    // asserted with the setting explicitly OFF, which is the case that failed.
    const app = populated();
    app.state().timestampsEnabled = false;
    app.state().form.location = CANARY.location;

    const before = app.fn('activeSession')().items.length;
    app.fn('repeatLastResult')(2);
    for (const it of app.fn('activeSession')().items.slice(before)) {
      t.ok(!!it.ts, 'a ×N copy is stamped with timestamps switched off');
    }

    const app2 = populated();
    app2.state().timestampsEnabled = false;
    app2.state().form.location = CANARY.location;
    app2.state().multiPick = { enabled: true, slots: [{ name: 'Desk', items: ['Lead', 'Monitor'] }] };
    const b2 = app2.fn('activeSession')().items.length;
    app2.fn('multiPickFire')(0);
    const mpAdded = app2.fn('activeSession')().items.slice(b2);
    t.eq(mpAdded.length, 2, 'Multi Pick added its two items');
    for (const it of mpAdded) {
      t.ok(!!it.ts, 'a Multi Pick item is stamped with timestamps switched off');
    }
  });

  await t.group('13l — the preset-edit return marker is set, consumed, and cannot go stale', () => {
    const app = populated();
    app.fn('setView')('entry');
    app.state().presetSheetOpen = true;

    // Through the real action table, the way a tap arrives.
    app.run('ACTIONS["preset-sheet-edit"]()');
    t.eq(app.state().view, 'settingsItems', 'the deep link landed on Quick Pick Items');
    t.eq(app.state().presetEditReturnView, 'entry',
      'the marker survived setView — it is set BEFORE the call and setView spares this target');

    app.run('ACTIONS["back-to-settings"]()');
    t.eq(app.state().view, 'entry', 'Back returned to the entry screen, not the Settings hub');
    t.eq(app.state().presetEditReturnView, null, 'the marker was consumed');

    // The staleness guard, which is the half that is easy to omit. Reaching the
    // same page later by an ordinary route must NOT fire a leftover marker.
    const app2 = populated();
    app2.fn('setView')('entry');
    app2.run('ACTIONS["preset-sheet-edit"]()');
    t.eq(app2.state().presetEditReturnView, 'entry', 'precondition: armed');
    app2.fn('setView')('settings');            // walked away without using Back
    t.eq(app2.state().presetEditReturnView, null, 'navigating away disarmed it');
    app2.fn('setView')('settingsItems');       // arrived again, the ordinary way
    app2.run('ACTIONS["back-to-settings"]()');
    t.eq(app2.state().view, 'settings',
      'Back from an ordinarily-reached page still goes to Settings');
  });

  await t.group('13m — both hold sites suppress text selection', () => {
    // ⚠ Source guard, and it is honest about being one: there is no touch stack
    // here and nothing below demonstrates that iOS stops raising the callout. It
    // demonstrates that the two properties are declared on the two controls that
    // carry a hold, which is the part that can be checked and the part that was
    // missing for four years on the grid.
    for (const sel of ['.quick-btn', '.copy-last-btn']) {
      const rules = liveCss.split('}').filter(b => b.includes(sel + ' {'));
      const body = rules.join('}');
      t.includes(body, 'user-select: none', `${sel} suppresses selection`);
      t.includes(body, '-webkit-touch-callout: none', `${sel} suppresses the iOS callout`);
      t.includes(body, '-webkit-user-select: none',
        `${sel} carries the -webkit- prefix, without which iOS ignores it`);
    }
  });

  await t.group('13n — there is ONE hold implementation for interactive controls', () => {
    // ⚠ THIS IS THE ASSERTION THAT DOES NOT DECAY. It knows nothing about which
    // controls have a hold, so a gesture added in five releases' time is covered
    // by it without anyone remembering this file. The failure it catches is a
    // fourth site hand-rolling the timer, the 12px slop and the tap swallow —
    // which is exactly how the app arrived at three sheet-scroller
    // implementations before V76, each one reasonable on its own.
    const appFiles = fs.readdirSync(APP_DIR).filter(f => f.endsWith('.js'));
    const offenders = [];
    let total = 0;
    for (const f of appFiles) {
      const hits = (stripJsComments(read(f)).match(/\.ontouchstart\s*=/g) || []).length;
      total += hits;
      if (hits > 0 && f !== 'events.js') offenders.push(f);
    }
    t.ok(total >= 1, 'the guard found a touchstart binding to inspect');
    t.deepEq(offenders, [], 'no file outside events.js binds touchstart itself');
    t.eq(total, 1, 'there is exactly one touchstart binding in the whole app');

    // And it is inside the shared helper, not loose in the bind function.
    t.includes(liveEvents, 'function attachHoldGesture(', 'the shared helper exists');
    const helper = liveEvents.slice(liveEvents.indexOf('function attachHoldGesture('));
    t.includes(helper, '.ontouchstart =', 'the one binding lives inside the helper');

    // Both sites go through it rather than around it.
    t.includes(liveEvents, "attachHoldGesture($('quick-grid')", 'the grid uses the helper');
    t.includes(liveEvents, "attachHoldGesture(copyBtn", 'Copy-last uses the helper');

    // The other implementation, deliberately left alone: setupLongPress serves
    // the About-title reveal, is pointer-based and has no tap to swallow. Two
    // with a stated division is the shipped state; a THIRD is the defect.
    t.includes(utilsSrc, 'function setupLongPress(', 'the pointer-based helper is still the only other one');
    const pointerBinds = (stripJsComments(utilsSrc).match(/addEventListener\('pointerdown'/g) || []).length;
    t.eq(pointerBinds, 1, 'and it binds pointerdown in exactly one place');
  });

  await t.group('13o — the ×N sheet is wired end to end', () => {
    // Every action the markup names must exist in the table. A data-action with
    // no handler is silent: the button paints, the tap does nothing, and no
    // assertion above would notice because they all call the function directly.
    for (const action of ['repeat-close', 'repeat-fire', 'repeat-fire-custom']) {
      t.includes(coreSrc, `data-action="${action}"`, `the sheet emits ${action}`);
      t.includes(dispatchSrc, `'${action}':`, `${action} has a handler`);
    }
    // And the flag is cleared on navigation, like every other sheet flag — or a
    // sheet left open would reappear over an unrelated screen.
    t.includes(stripJsComments(sessionSrc), 'state.repeatSheetOpen = false;',
      'the sheet flag is cleared on view change');
  });
};
