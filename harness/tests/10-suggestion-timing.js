/* Standing test — suggestion dropdown tap timing (v70.1 repair)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHY THIS FILE EXISTS. The suggestion dropdowns had been patched twice (V57,
   V57.1) with ZERO assertions covering them, and V70 still shipped two live
   races in the same code:

     • the ghost-click swallow could stay armed when no ghost click arrived, and
       then ate the engineer's next real tap — usually PASS, hence the field
       report of Pass needing two presses;
     • the list was torn down and rebuilt on every keystroke, and re-filtered
       under the finger, so a tap could land where a row used to be.

   Both are TIMING faults, so everything here drives the real surfaces —
   document-level dispatch for the swallow, the actual paint helpers for the
   list — rather than calling the fixed functions directly. Asserting that
   armClickSwallow() sets a flag would have been green against the broken code:
   the flag was never the bug, the failure to CLEAR it was.

   ⚠ The listener-wiring rule (V67): at least one assertion must go through the
   surface the browser actually uses. 10a dispatches through `document` for
   exactly that reason — an unbound initSuggestionClickSwallow() would sail past
   any test that called the handler by hand. */

'use strict';

const t = require('../assert');
const { freshApp, tick } = require('../fixture');

/* A pointer/click event shaped the way the stub dispatcher expects. */
function ev(type) {
  return {
    type,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() {},
    target: null,
    currentTarget: null,
  };
}

/* Fire an event at the document and report whether a capture listener killed it. */
function atDocument(app, type) {
  const e = ev(type);
  app.doc.dispatchEvent(e);
  return e.defaultPrevented;
}

/* Stand up the entry screen's item-type wrapper as a real element in the tree,
   so document.querySelector('.custom-type-wrap') finds it exactly as it would
   after a render(). Also registers #f-type, which the commit path writes into. */
function typeField(app) {
  const wrap = app.doc.createElement('div');
  wrap.setAttribute('class', 'custom-type-wrap');
  app.doc.body.appendChild(wrap);
  const inp = app.doc.register('f-type', 'input');
  inp.value = '';
  return { wrap, inp };
}

function rows(wrap) {
  const list = wrap.querySelector('.suggestions');
  return list ? list.children.length : 0;
}

module.exports = async function () {

  /* ---------------------------------------------------------------------
     10a — the swallow is wired at boot, and an armed guard really swallows.
     Without this the rest of the file could pass against a guard nobody bound.
     --------------------------------------------------------------------- */
  await t.group('10a — the click swallow is bound at boot and swallows when armed', async () => {
    const app = freshApp();

    t.notOk(atDocument(app, 'click'), 'an ordinary click is untouched when the guard is idle');

    app.fn('armClickSwallow')();
    t.ok(atDocument(app, 'click'), 'once armed, the next click is cancelled at the document');

    // One-shot: the swallow must not persist past the click it ate.
    t.notOk(atDocument(app, 'click'), 'the guard disarms itself after swallowing one click');
  });

  /* ---------------------------------------------------------------------
     10b — THE V70.1 FIX. A deliberate tap emits its own pointerdown before its
     click; a ghost click does not. So a new pointerdown must disarm the guard.

     Against V70 this group goes red: the guard survived the pointerdown and
     cancelled the engineer's PASS tap.
     --------------------------------------------------------------------- */
  await t.group('10b — a deliberate tap after a pick is never swallowed', async () => {
    const app = freshApp();

    app.fn('armClickSwallow')();
    atDocument(app, 'pointerdown');           // the engineer starts a fresh tap
    t.notOk(atDocument(app, 'click'), 'a real tap that follows a pick reaches its target');

    // The ghost click — no pointerdown of its own — must still be eaten, or the
    // fix has simply disabled the guard and reopened the V57.1 bug.
    app.fn('armClickSwallow')();
    t.ok(atDocument(app, 'click'), 'a click with no pointerdown of its own is still swallowed');

    // Two taps in a row, both genuine, both must land.
    app.fn('armClickSwallow')();
    atDocument(app, 'pointerdown');
    t.notOk(atDocument(app, 'click'), 'first genuine tap lands');
    atDocument(app, 'pointerdown');
    t.notOk(atDocument(app, 'click'), 'second genuine tap lands too');
  });

  /* ---------------------------------------------------------------------
     10c — the arming tap must not disarm itself.

     The capture-phase pointerdown listener fires BEFORE the suggestion button's
     own onpointerdown, so the order is disarm-then-arm. If anyone ever moves the
     arm call into a capture-phase listener that order inverts, the guard cancels
     itself, and the ghost click lands on PASS again. This drives the real button
     handler rather than calling armClickSwallow() by hand, which is the only way
     to observe the ordering at all.
     --------------------------------------------------------------------- */
  await t.group('10c — a real suggestion tap leaves the guard armed', async () => {
    const app = freshApp();
    const st = app.state();
    const { wrap } = typeField(app);

    st.suggestions = ['Kettle', 'Kettle Lead'];
    st.showSuggestions = true;
    app.fn('renderSuggestionsOnly')();

    const btn = wrap.querySelector('.suggestions').children[0];
    t.eq(typeof btn.onpointerdown, 'function', 'the suggestion row is wired for pointerdown');

    // Browser order: document capture first, then the target handler.
    atDocument(app, 'pointerdown');
    const down = ev('pointerdown');
    down.currentTarget = btn;
    btn.onpointerdown(down);

    t.ok(down.defaultPrevented, 'the pick holds input focus by cancelling the pointerdown');
    t.eq(app.state().form.itemType, 'Kettle', 'the pick committed on pointerdown, not on click');
    t.ok(atDocument(app, 'click'), 'the trailing ghost click is still swallowed after a real pick');
  });

  /* ---------------------------------------------------------------------
     10d — identity skip. Repainting an unchanged list must not replace the node
     the finger is travelling towards.

     Asserting the row COUNT here would be vacuous — it is 2 either way. The node
     identity is the whole point, so that is what is asserted.
     --------------------------------------------------------------------- */
  await t.group('10d — an unchanged list is left alone in the DOM', async () => {
    const app = freshApp();
    const st = app.state();
    const { wrap } = typeField(app);

    st.suggestions = ['Kettle', 'Kettle Lead'];
    st.showSuggestions = true;
    app.fn('renderSuggestionsOnly')();
    const first = wrap.querySelector('.suggestions');
    const firstRow = first.children[0];
    t.ok(first, 'the list painted');

    app.fn('renderSuggestionsOnly')();
    t.eq(wrap.querySelector('.suggestions'), first, 'repainting identical results reuses the same list node');
    t.eq(wrap.querySelector('.suggestions').children[0], firstRow, 'and the same row node — the tap target survives');

    st.suggestions = ['Kettle', 'Toaster'];
    app.fn('renderSuggestionsOnly')();
    t.notEq(wrap.querySelector('.suggestions'), first, 'a genuinely changed list does repaint');
    t.eq(rows(wrap), 2, 'and shows the new results');
  });

  /* ---------------------------------------------------------------------
     10e — shrink hysteresis. Growth is immediate; narrowing waits a beat so the
     row the engineer aimed at is still under the finger when it lands.
     --------------------------------------------------------------------- */
  await t.group('10e — a narrowing list holds its rows for a beat', async () => {
    const app = freshApp();
    const st = app.state();
    const { wrap } = typeField(app);

    st.suggestions = ['Kettle', 'Kettle Lead', 'Kitchen Radio', 'Kiln'];
    st.showSuggestions = true;
    app.fn('renderSuggestionsOnly')(true);
    t.eq(rows(wrap), 4, 'typing paints the full filtered list');

    // One more keystroke narrows it to a single match.
    st.suggestions = ['Kiln'];
    app.fn('renderSuggestionsOnly')(true);
    t.eq(rows(wrap), 4, 'the shrink does not land immediately — the aimed-at row is still there');

    await tick(200);
    t.eq(rows(wrap), 1, 'the shrink lands a beat later');

    // Growth must never be delayed, or the list feels broken while typing back.
    st.suggestions = ['Kettle', 'Kettle Lead', 'Kiln'];
    app.fn('renderSuggestionsOnly')(true);
    t.eq(rows(wrap), 3, 'growth paints immediately');

    // And a pending shrink must re-derive from live state, not replay stale markup.
    st.suggestions = ['Kettle'];
    app.fn('renderSuggestionsOnly')(true);
    st.suggestions = ['Kettle', 'Toaster'];
    await tick(200);
    t.eq(rows(wrap), 2, 'the deferred paint reads state as it is when it fires');
  });

  /* ---------------------------------------------------------------------
     10f — hysteresis is for typing ONLY. A pick and the blur-hide must clear the
     list instantly, or the dropdown visibly lingers over PASS after selection.
     --------------------------------------------------------------------- */
  await t.group('10f — picking and hiding are instant, not deferred', async () => {
    const app = freshApp();
    const st = app.state();
    const { wrap, inp } = typeField(app);

    st.suggestions = ['Kettle', 'Kettle Lead'];
    st.showSuggestions = true;
    app.fn('renderSuggestionsOnly')(true);
    t.eq(rows(wrap), 2, 'list is up');

    const btn = wrap.querySelector('.suggestions').children[0];
    const down = ev('pointerdown');
    down.currentTarget = btn;
    btn.onpointerdown(down);

    t.eq(rows(wrap), 0, 'the list clears the moment the pick commits');
    t.eq(inp.value, 'Kettle', 'and the field carries the picked description');

    // The blur-hide path: state goes false, default (non-typing) call is instant.
    st.suggestions = ['Kettle', 'Kettle Lead'];
    st.showSuggestions = true;
    app.fn('renderSuggestionsOnly')();
    t.eq(rows(wrap), 2, 'list is up again');
    st.showSuggestions = false;
    app.fn('renderSuggestionsOnly')();
    t.eq(rows(wrap), 0, 'the blur hide is not delayed by the shrink guard');
  });

  /* ---------------------------------------------------------------------
     10g — the location blur no longer full-renders when nothing changed.

     render() rebuilds #app.innerHTML wholesale (MAP rule 2). Doing that 150ms
     after blur destroys whatever the engineer is mid-tap on — the second
     mechanism behind "PASS needed two presses". Most visits to the location
     field leave it unchanged, and those must not render.
     --------------------------------------------------------------------- */
  await t.group('10g — an unchanged location does not trigger a full re-render', async () => {
    const app = freshApp();
    const st = app.state();
    st.sqpEnabled = true;

    const loc = app.doc.register('f-location', 'input');
    app.run('globalThis.__renderCount = 0; globalThis.render = function () { globalThis.__renderCount++; };');
    app.fn('bindFocusFields')();
    t.eq(typeof loc.onblur, 'function', 'the location field is wired for blur');

    // Visit the field and leave it exactly as it was.
    loc.dataset.original = 'Kitchen';
    loc.value = 'Kitchen';
    loc.onblur({ target: loc });
    await tick(250);
    t.eq(app.run('globalThis.__renderCount'), 0, 'leaving the location untouched costs no render');
    t.eq(app.state().form.location, 'Kitchen', 'and the location is still correct');

    // Focus-clears-field then restore: value comes back empty, original stands.
    loc.dataset.original = 'Kitchen';
    loc.value = '';
    loc.onblur({ target: loc });
    await tick(250);
    t.eq(app.run('globalThis.__renderCount'), 0, 'the empty-field restore path costs no render either');
    t.eq(app.state().form.location, 'Kitchen', 'the stashed original is restored');

    // A genuine change must still rebuild the Smart Quick Pick row.
    loc.dataset.original = 'Kitchen';
    loc.value = 'hallway';
    loc.onblur({ target: loc });
    await tick(250);
    t.eq(app.run('globalThis.__renderCount'), 1, 'a real location change still renders');
    t.eq(app.state().form.location, 'Hallway', 'and is title-cased as before');
  });

  /* ---------------------------------------------------------------------
     10h — the other two dropdowns went through the same painter. If a future
     edit converts only the item-type list, this catches it.
     --------------------------------------------------------------------- */
  await t.group('10h — location and New Session lists share the painter', async () => {
    const app = freshApp();
    const st = app.state();

    const locWrap = app.doc.createElement('div');
    locWrap.setAttribute('class', 'location-input-wrap');
    app.doc.body.appendChild(locWrap);
    app.doc.register('f-location', 'input');

    st.locationSuggestions = ['Kitchen', 'Hallway', 'Landing'];
    st.showLocationSuggestions = true;
    app.fn('renderLocationSuggestionsOnly')(true);
    const locList = locWrap.querySelector('.suggestions');
    t.eq(rows(locWrap), 3, 'the location list paints');
    app.fn('renderLocationSuggestionsOnly')(true);
    t.eq(locWrap.querySelector('.suggestions'), locList, 'an unchanged location list is not replaced');
    st.locationSuggestions = ['Kitchen'];
    app.fn('renderLocationSuggestionsOnly')(true);
    t.eq(rows(locWrap), 3, 'the location list holds its rows through a shrink');
    await tick(200);
    t.eq(rows(locWrap), 1, 'then narrows');

    const nfWrap = app.doc.register('nf-client-wrap');
    st.nfActiveField = 'client';
    st.nfSuggestions = ['Acme Ltd', 'Anvil Co', 'Apex Care'];
    st.showNfSuggestions = true;
    app.fn('renderNfSuggestionsOnly')('client', true);
    const nfList = nfWrap.querySelector('.suggestions');
    t.eq(rows(nfWrap), 3, 'the client list paints');
    app.fn('renderNfSuggestionsOnly')('client', true);
    t.eq(nfWrap.querySelector('.suggestions'), nfList, 'an unchanged client list is not replaced');
    st.nfSuggestions = ['Acme Ltd'];
    app.fn('renderNfSuggestionsOnly')('client', true);
    t.eq(rows(nfWrap), 3, 'the client list holds its rows through a shrink');
    await tick(200);
    t.eq(rows(nfWrap), 1, 'then narrows');
  });
};
