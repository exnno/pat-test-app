/* Standing test — bottom sheets versus the on-screen keyboard (V75)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE ACTUALLY DID. One document-level visualViewport listener
   publishes four custom properties onto <html>; the sheet CSS reads them. The
   value of that shape is that no sheet has to be found, hooked or known about —
   but it also means the mechanism is invisible from any single sheet, so these
   assertions have to drive the properties themselves.

   ⚠ WHAT THIS FILE CANNOT PROVE. There is no layout engine here. Nothing below
   demonstrates that a sheet VISUALLY clears the keyboard — only that the correct
   pixel values reach the correct properties, and that the CSS reads them. The
   visual result proves itself on a phone and nowhere else. Saying so plainly
   matters more than the assertion count: this is the "path that cannot execute
   headlessly" shape, and the honest response is to source-guard the CSS half
   rather than to write a test that looks like it checked the rendering.

   ⚠ THE LISTENER-WIRING RULE (V67). 11a fires through the visualViewport object
   itself rather than calling applyKeyboardInset(). An unbound initKeyboardInset()
   — the exact failure that hid in scanner.js for three releases — would sail
   past any test that called the handler by hand.

   ⚠ THE REMOVED-VERSUS-ZERO DISTINCTION (11c) IS THE MOST IMPORTANT ASSERTION
   HERE. Writing `0px` instead of removing the property looks identical in every
   keyboard-up test and breaks the no-keyboard case, which is most of the app's
   life. It is only visible if you assert on absence. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, tick } = require('../fixture');

const SCREEN_H = 844;   // matches the stub's window.innerHeight

/* A visualViewport that behaves like the real one: listeners, and a settable
   geometry that dispatches when it moves. */
function makeVV(height = SCREEN_H, offsetTop = 0) {
  const listeners = {};
  return {
    height,
    offsetTop,
    width: 390,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) {
      const a = listeners[type];
      if (a) listeners[type] = a.filter(f => f !== fn);
    },
    /* Move the viewport and fire the event the real object would fire. */
    _move(h, top, type = 'resize') {
      this.height = h;
      this.offsetTop = top === undefined ? this.offsetTop : top;
      (listeners[type] || []).forEach(fn => fn.call(this, { type }));
    },
    _count(type) { return (listeners[type] || []).length; },
  };
}

/* Read a custom property off <html>. '' means absent, exactly as in the DOM. */
function prop(app, name) {
  return app.doc.documentElement.style.getPropertyValue(name);
}

/* Strip /* … *\/ blocks. Needed because this app documents its own banned
   patterns in comments, so a raw search finds the warning, not a violation. */
function stripCssComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

/* Same for JS, plus whole-line // comments. Line comments are stripped ONLY when
   they start a line, so a URL's `https://` inside code survives intact. */
function stripJsComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const KB_PROPS = ['--kb-inset', '--sheet-max', '--sheet-pad', '--sheet-min-release'];

module.exports = async function () {

  const css        = fs.readFileSync(path.join(APP_DIR, 'styles.css'), 'utf8');
  const eventsSrc  = fs.readFileSync(path.join(APP_DIR, 'events.js'), 'utf8');
  const utilsSrc   = fs.readFileSync(path.join(APP_DIR, 'utils.js'), 'utf8');
  const bootSrc    = fs.readFileSync(path.join(APP_DIR, 'boot.js'), 'utf8');
  const coreSrc    = fs.readFileSync(path.join(APP_DIR, 'render-core.js'), 'utf8');
  const dispatchSrc= fs.readFileSync(path.join(APP_DIR, 'dispatch.js'), 'utf8');
  const feedbackSrc= fs.readFileSync(path.join(APP_DIR, 'feedback.js'), 'utf8');
  const setActSrc  = fs.readFileSync(path.join(APP_DIR, 'settings-actions.js'), 'utf8');

  await t.group('11a — the viewport listener is BOUND at boot, not just written', async () => {
    const vv = makeVV();
    const app = freshApp({ visualViewport: vv });

    t.ok(vv._count('resize') >= 1, 'a resize listener was attached to visualViewport');
    t.ok(vv._count('scroll') >= 1, 'a scroll listener was attached to visualViewport');

    // Keyboard opens: 844 → 508 visible.
    vv._move(508, 0, 'resize');
    await tick();

    t.eq(prop(app, '--kb-inset'), '336px', 'the keyboard height reached <html> THROUGH the event');
    t.ok(prop(app, '--sheet-max') !== '', 'a sheet cap was published alongside it');
  });

  await t.group('11b — no visualViewport: nothing is ever written, and boot survives', async () => {
    const app = freshApp();   // stub has no visualViewport by default

    t.ok(app.errors.length === 0, 'the app booted with no visualViewport at all');
    for (const p of KB_PROPS) {
      t.eq(prop(app, p), '', `${p} was never written on the fail-soft path`);
    }
    // The fallbacks in the CSS are the entire safety net on this path, so the
    // no-keyboard rule must still be the v74 rule.
    t.includes(css, 'max-height: var(--sheet-max, 85dvh)', 'the shell still falls back to 85dvh');
  });

  await t.group('11c — keyboard down REMOVES the properties (never sets them to zero)', async () => {
    const vv = makeVV();
    const app = freshApp({ visualViewport: vv });

    vv._move(508, 0, 'resize');       // up
    await tick();
    t.eq(prop(app, '--kb-inset'), '336px', 'precondition: the properties are set while the keyboard is up');

    vv._move(SCREEN_H, 0, 'resize');  // down again
    await tick();

    for (const p of KB_PROPS) {
      t.eq(prop(app, p), '', `${p} was REMOVED, not pinned to a value, once the keyboard closed`);
    }
    // Guard against the specific wrong fix: the assertions above pass for a
    // removed property and fail for '0px', which is the whole point.
    t.notEq(prop(app, '--kb-inset'), '0px', 'the no-keyboard state is absence, not 0px');
  });

  await t.group('11d — a small viewport change is NOT treated as a keyboard', async () => {
    const vv = makeVV();
    const app = freshApp({ visualViewport: vv });

    // Browser chrome settling — tens of px, not hundreds. Writing pixel geometry
    // for this would make every sheet twitch during ordinary scrolling.
    vv._move(SCREEN_H - 60, 0, 'resize');
    await tick();

    t.eq(prop(app, '--kb-inset'), '', 'a 60px change left the properties alone');

    vv._move(SCREEN_H - 400, 0, 'resize');
    await tick();
    t.eq(prop(app, '--kb-inset'), '400px', 'a 400px change is recognised as the keyboard');
  });

  await t.group('11e — offsetTop is part of the measurement, not an afterthought', async () => {
    const vv = makeVV();
    const app = freshApp({ visualViewport: vv });

    // iOS shifts the visual viewport UP to reveal a focused field. height alone
    // then under-reports the inset and the sheet lands too low — partially back
    // under the keyboard, which reads as "the fix didn't work" rather than as a
    // maths error. This assertion fails if offsetTop is dropped from the sum.
    vv._move(508, 90, 'resize');
    await tick();

    t.eq(prop(app, '--kb-inset'), '246px', 'inset = innerHeight - (height + offsetTop)');
    t.notEq(prop(app, '--kb-inset'), '336px', 'it is NOT the naive innerHeight - height');
  });

  await t.group('11f — the scroll event drives it too, not only resize', async () => {
    const vv = makeVV();
    const app = freshApp({ visualViewport: vv });

    // iOS fires scroll (not resize) on the visual viewport when it shifts to
    // reveal a field. Bind resize only and the sheet is correctly SIZED but
    // sitting in the wrong PLACE — one of the two halves of the original bug.
    vv._move(508, 60, 'scroll');
    await tick();

    t.eq(prop(app, '--kb-inset'), '276px', 'a scroll-only change still republished the inset');
  });

  await t.group('11g — the cap is real pixels, smaller than the screen', async () => {
    const vv = makeVV();
    const app = freshApp({ visualViewport: vv });

    vv._move(508, 0, 'resize');
    await tick();

    const max = parseInt(prop(app, '--sheet-max'), 10);
    t.ok(Number.isFinite(max), 'the cap is a number of pixels');
    t.ok(max <= 508, 'the cap does not exceed the space that actually exists');
    t.ok(max < SCREEN_H, 'the cap is smaller than the screen — a dvh could not be');
    t.ok(max > 400, 'the cap is not so small that the sheet is uselessly squashed');

    t.eq(prop(app, '--sheet-pad'), '20px', 'the safe-area strip is flattened while the keyboard is up');
    t.eq(prop(app, '--sheet-min-release'), '0px', "the wizard's height floor is released");
  });

  await t.group('11h — the CSS actually reads every property that is published', () => {
    // Publishing a property nothing consumes is a silent no-op, and the JS half
    // of this release cannot detect it. This is the seam.
    t.includes(css, 'bottom: var(--kb-inset, 0px)', 'the shell is anchored by --kb-inset');
    t.includes(css, 'max-height: var(--sheet-max, 85dvh)', 'the shell cap reads --sheet-max');
    t.includes(css, 'var(--sheet-pad,', 'the shell padding reads --sheet-pad');
    t.includes(css, 'max-height: var(--sheet-max, 88vh)', 'the bug sheet cap participates');
    t.includes(css, 'min-height: var(--sheet-min-release, 72vh)', "the wizard's floor participates");
    t.includes(css, 'max-height: var(--sheet-max, 92vh)', "the wizard's cap participates");
    t.includes(css, 'overscroll-behavior: contain', 'the shell contains overscroll');
  });

  await t.group('11i — the body-scroll-lock ban is still held', () => {
    // Banned since v12.1: `100dvh + overflow:hidden` trapped content behind the
    // keyboard and had to be rolled back. It is the obvious fourth part of this
    // fix and it must stay unwritten. This asserts on the SHIPPED source, so it
    // catches a future release reintroducing it as much as this one.
    //
    // ⚠ COMMENTS MUST BE STRIPPED FIRST, and this cost a false failure the first
    // time it ran. The ban is DOCUMENTED in three places in styles.css (the
    // v12.1 post-mortem, the .fail-sheet note, one more) — so a raw substring
    // search for '100dvh' matches the warning against reintroducing it and
    // reports the app as broken for describing its own rule. Strip, then assert
    // on a live declaration.
    t.excludes(stripCssComments(css), '100dvh', 'the banned 100dvh layout has not returned as a live rule');

    const jsAll = [eventsSrc, bootSrc, coreSrc, dispatchSrc].map(stripJsComments).join('\n');
    t.excludes(jsAll, 'body.style.overflow', 'no JS locks body scroll');
    t.excludes(jsAll, 'body.style.position', 'no JS pins the body');

    // Not hollow: prove the stripped text still contains live CSS, so a future
    // change to the stripper cannot quietly turn the three checks above into
    // assertions against an empty string.
    t.includes(stripCssComments(css), '.fail-sheet, .bulk-sheet', 'the stripper left the live rules intact');
  });

  await t.group('11j — focusInSheet exists, prevents the scroll, and falls back', async () => {
    const app = freshApp();
    const focusInSheet = app.fn('focusInSheet');

    let seen = null;
    const good = { focus(opts) { seen = opts; } };
    focusInSheet(good);
    t.ok(seen && seen.preventScroll === true, 'focus was called with preventScroll');

    // Older WebKit THROWS on the options object rather than ignoring it. Failing
    // back to v74's bare focus() beats failing to focus at all — a field that
    // never takes focus is a dead form.
    let bare = 0;
    const picky = {
      focus(opts) { if (opts) throw new TypeError('no options here'); bare++; },
    };
    t.doesNotThrow(() => focusInSheet(picky), 'a throwing focus(options) does not escape');
    t.eq(bare, 1, 'it fell back to a bare focus()');

    t.doesNotThrow(() => focusInSheet(null), 'a missing element is a no-op, not a throw');
  });

  await t.group('11k — the five sheet focus sites route through the helper', () => {
    // The gap this closes: scanner.js has had preventScroll with its reasoning
    // since v67 and the sheets never inherited it. A source guard is the right
    // shape — these are one-line handlers whose only observable effect in a
    // headless run is which function they call.
    t.includes(feedbackSrc, 'focusInSheet(inp)', 'feedback.js name sheet routes through the helper');
    t.excludes(feedbackSrc, 'inp.focus()', 'feedback.js has no bare focus() left');
    t.includes(dispatchSrc, "focusInSheet(document.getElementById('fail-other-input'))", 'the fail sheet routes through the helper');
    t.includes(setActSrc, 'focusInSheet(inp)', 'the filename token insert routes through the helper');
    t.includes(setActSrc, 'focusInSheet(nameInput)', 'the share-setup name sheet routes through the helper');

    // ⚠ f-notes is on the ENTRY SCREEN, not in a sheet. Converting it would be
    // wrong: there is no fixed overlay for the document scroll to drag, and
    // suppressing the reveal-scroll there could hide the field behind the
    // keyboard. Pinned so a future tidy-up does not "finish the job".
    t.includes(dispatchSrc, "getElementById('f-notes')?.focus()", 'f-notes deliberately keeps its plain focus');

    // scanner.js keeps its own v67 guard; the helper did not replace it.
    const scannerSrc = fs.readFileSync(path.join(APP_DIR, 'scanner.js'), 'utf8');
    t.includes(scannerSrc, 'preventScroll', 'focusAssetForScan still prevents the scroll');
  });

  await t.group('11l — the welcome modal can always be dismissed', () => {
    // V74's failure: the list had no scroller, so the shell's 85dvh cap clipped
    // it and took the Continue button with it. Unreadable AND undismissable.
    t.includes(coreSrc, 'class="welcome-list sheet-scroll"', 'the welcome list is a designated scroller');
    t.includes(coreSrc, 'class="btn-primary welcome-continue"', 'the Continue button is classed for pinning');
    t.includes(css, '.welcome-continue', 'a rule exists for the pinned button');
    t.includes(utilsSrc, 'function focusInSheet', 'the helper lives in utils.js');

    // The dismiss action itself must still be wired, or none of the above helps.
    t.includes(coreSrc, 'data-action="welcome-dismiss"', 'the dismiss action is still on the button');
  });

  await t.group('11m — the boot call is present and unguarded', () => {
    // events.js is NOT an optional subsystem (it owns initDelegation too), so a
    // typeof guard here would only hide which line noticed a missing file.
    t.includes(bootSrc, 'initKeyboardInset();', 'boot calls initKeyboardInset');
    t.excludes(bootSrc, "typeof initKeyboardInset === 'function'", 'it is not typeof-guarded');
    t.includes(eventsSrc, 'function initKeyboardInset', 'the initialiser lives in events.js');
  });
};
