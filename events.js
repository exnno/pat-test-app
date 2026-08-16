/*!
 * PATGo PWA
 * v28 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PATGo PWA — v28 — Focus-sensitive field binding ==========
//
// E3-tail (v28) finished the delegation migration: every CLICK (v25) and now
// every stateful INPUT/CHANGE handler (v28) lives in dispatch.js, attached once
// to #app and surviving re-renders. What remains here is the deliberate
// exception — the FOUR focus-sensitive fields whose behaviour depends on
// onfocus / onblur timing that delegation can't safely reproduce:
//
//   • nf-client / nf-site  — New Session client & site autocomplete
//   • f-location           — Entry location (focus-clears-field + casing on blur
//                            + Smart-Quick-Pick row rebuild on blur)
//   • f-type               — Entry item-type (casing on blur)
//
// These use the onmousedown→preventDefault suggestion-tap trick and setTimeout
// blur delays; getting that timing wrong breaks the suggestion dropdowns on iOS
// (the exact fragile area the skill warns against). So they stay as direct binds
// in bindFocusFields(), called from render() on every paint — same as the old
// bindEvents() did, just scoped to these four.
//
// The three suggestion-render helpers (renderSuggestionsOnly /
// renderNfSuggestionsOnly / renderLocationSuggestionsOnly) live here too: they
// own the .suggestions dropdowns these fields drive.

// ---------- Focus-sensitive field binding (per render) ----------
function bindFocusFields() {
  const $ = id => document.getElementById(id);

  // New Session — Client field. Tappable suggestions (v20). Focus shows the full
  // saved-client list; typing filters live; tapping a suggestion fills the field.
  // On change we also refresh the Site list so it tracks the chosen client. We
  // rebuild only the suggestion <div> so focus and any half-typed value survive.
  if ($('nf-client')) {
    $('nf-client').oninput = e => {
      state.newForm.clientId = e.target.value;
      state.nfActiveField = 'client';
      state.nfSuggestions = computeNfClientSuggestions(e.target.value);
      state.showNfSuggestions = state.nfSuggestions.length > 0;
      renderNfSuggestionsOnly('client', true);   // v70.1: typing → shrink hysteresis
    };
    $('nf-client').onfocus = e => {
      state.nfActiveField = 'client';
      state.nfSuggestions = computeNfClientSuggestions(e.target.value);
      state.showNfSuggestions = state.nfSuggestions.length > 0;
      renderNfSuggestionsOnly('client', true);   // v70.1: typing → shrink hysteresis
    };
    $('nf-client').onblur = () => {
      // Delay hiding so a tap on a suggestion registers first.
      setTimeout(() => {
        if (state.nfActiveField === 'client') {
          state.showNfSuggestions = false;
          renderNfSuggestionsOnly('client');
        }
      }, 150);
    };
  }
  if ($('nf-site')) {
    $('nf-site').oninput = e => {
      state.newForm.site = e.target.value;
      state.nfActiveField = 'site';
      state.nfSuggestions = computeNfSiteSuggestions(e.target.value);
      state.showNfSuggestions = state.nfSuggestions.length > 0;
      renderNfSuggestionsOnly('site', true);   // v70.1: typing → shrink hysteresis
    };
    $('nf-site').onfocus = e => {
      state.nfActiveField = 'site';
      state.nfSuggestions = computeNfSiteSuggestions(e.target.value);
      state.showNfSuggestions = state.nfSuggestions.length > 0;
      renderNfSuggestionsOnly('site', true);   // v70.1: typing → shrink hysteresis
    };
    $('nf-site').onblur = () => {
      setTimeout(() => {
        if (state.nfActiveField === 'site') {
          state.showNfSuggestions = false;
          renderNfSuggestionsOnly('site');
        }
      }, 150);
    };
  }

  // Entry — Location autocomplete. Keeps the v6 focus-clears-the-field behaviour
  // (so the carry-forward location doesn't get in the way when you want to type
  // something different), and feeds state.locationSuggestions from the current
  // session's existing item locations on every keystroke.
  if ($('f-location')) {
    $('f-location').oninput = e => {
      state.form.location = e.target.value;
      state.locationSuggestions = computeLocationSuggestions(e.target.value);
      state.showLocationSuggestions = state.locationSuggestions.length > 0;
      renderLocationSuggestionsOnly(true);   // v70.1: typing → shrink hysteresis
    };
    $('f-location').onfocus = e => {
      e.target.dataset.original = e.target.value;
      e.target.value = '';
      // Field is now empty → no suggestions until the user types.
      state.locationSuggestions = [];
      state.showLocationSuggestions = false;
      renderLocationSuggestionsOnly();
    };
    $('f-location').onblur = e => {
      const orig = e.target.dataset.original || '';
      const v = e.target.value.trim();
      let settled;
      if (v === '') {
        settled = orig;
      } else {
        settled = titleCase(v);
      }
      e.target.value = settled;
      state.form.location = settled;
      // v70.1: did this visit to the field actually change the location? A full
      // render() rebuilds #app.innerHTML wholesale, and doing that 150ms after blur
      // destroys whatever the engineer is mid-tap on. Tap PASS with the location
      // field focused, hold a fraction long, and the button is gone before the click
      // lands — so the tap is lost and PASS needs pressing twice. Most blurs leave
      // the location exactly as it was (focus-clears-field then restores it), and
      // those have nothing for Smart Quick Pick to rebuild, so they no longer render.
      // A pick from the dropdown re-stashes dataset.original and renders there, so it
      // correctly reads as unchanged here rather than rendering a second time.
      const locationChanged = settled !== orig;
      // Delay hiding so a click on a suggestion can register first.
      setTimeout(() => {
        state.showLocationSuggestions = false;
        // v18/v20: when Smart Quick Pick is on, the confirmed location may have
        // changed, so rebuild the FROZEN row (v20) and full-render to show it.
        // Otherwise the lightweight suggestions-only refresh is enough.
        if (state.sqpEnabled && locationChanged) { invalidateSqpRow(); render(); }
        else renderLocationSuggestionsOnly();
      }, 150);
    };
  }

  // Entry — item-type field. Live suggestions + quick-btn active sync on input;
  // casing normalisation on blur.
  if ($('f-type')) {
    $('f-type').oninput = e => {
      const val = e.target.value;
      state.form.itemType = val;
      document.querySelectorAll('.quick-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.type === val);
      });
      state.suggestions = computeSuggestions(val);
      state.showSuggestions = state.suggestions.length > 0;
      renderSuggestionsOnly(true);   // v70.1: typing → shrink hysteresis
    };
    $('f-type').onfocus = e => {
      if (e.target.value) {
        state.suggestions = computeSuggestions(e.target.value);
        state.showSuggestions = state.suggestions.length > 0;
        renderSuggestionsOnly(true);   // v70.1: typing → shrink hysteresis
      }
    };
    $('f-type').onblur = e => {
      const v = String(e.target.value || '').trim();
      if (v) {
        const cased = normaliseItemType(v);
        e.target.value = cased;
        state.form.itemType = cased;
      }
      setTimeout(() => { state.showSuggestions = false; renderSuggestionsOnly(); }, 150);
    };
  }

  // v47: long-press the quick-pick grid → open the preset switcher sheet.
  // Bound here (not via the delegated click system) because a hold is timing-
  // based and delegation can't express it. Re-bound every entry-screen paint,
  // same lifecycle as the focus fields above.
  //
  // Behaviour:
  //   • A press that's held for QUICK_PICK_LONGPRESS_MS without moving too far
  //     opens the sheet (openPresetSheet → render, which rebuilds the grid and
  //     wipes these listeners — fine, they're rebound next paint).
  //   • Decision 2A: when the long-press fires it SUPPRESSES the quick-btn's
  //     normal tap, so switching presets never also changes the selected item
  //     type. We do this by setting a flag the next click checks (capture phase),
  //     then clearing it. A genuine quick tap (released before the timer) never
  //     sets the flag, so normal taps still select as before.
  //   • Any finger movement beyond a small slop, or an early release/cancel,
  //     aborts the pending long-press.
  const grid = $('quick-grid');
  if (grid) {
    let pressTimer = null;
    let didLongPress = false;
    let startX = 0, startY = 0;
    const MOVE_SLOP = 12;   // px of finger drift allowed before we abort

    const clearTimer = () => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    };

    const startPress = (x, y) => {
      didLongPress = false;
      startX = x; startY = y;
      clearTimer();
      pressTimer = setTimeout(() => {
        pressTimer = null;
        didLongPress = true;
        openPresetSheet();   // re-renders; these handlers are rebound next paint
      }, QUICK_PICK_LONGPRESS_MS);
    };

    const moveCheck = (x, y) => {
      if (!pressTimer) return;
      if (Math.abs(x - startX) > MOVE_SLOP || Math.abs(y - startY) > MOVE_SLOP) {
        clearTimer();   // finger drifted — treat as a scroll/swipe, not a hold
      }
    };

    // Touch (primary path on the phone)
    grid.ontouchstart = e => {
      const t = e.touches && e.touches[0];
      if (t) startPress(t.clientX, t.clientY);
    };
    grid.ontouchmove = e => {
      const t = e.touches && e.touches[0];
      if (t) moveCheck(t.clientX, t.clientY);
    };
    grid.ontouchend = () => clearTimer();
    grid.ontouchcancel = () => clearTimer();

    // Mouse (desktop / dev)
    grid.onmousedown = e => startPress(e.clientX, e.clientY);
    grid.onmousemove = e => moveCheck(e.clientX, e.clientY);
    grid.onmouseup = () => clearTimer();
    grid.onmouseleave = () => clearTimer();

    // Suppress the quick-btn tap that would otherwise fire on release after a
    // long-press. Capture phase so we intercept before the delegated #app click
    // handler. Only swallows the ONE click immediately following a long-press.
    grid.addEventListener('click', e => {
      if (didLongPress) {
        e.stopPropagation();
        e.preventDefault();
        didLongPress = false;
      }
    }, true);
  }
}

// v57: scroll-drag guard for bottom sheets.
//
// Now that a long preset list scrolls (v57), a finger drag that scrolls the list
// can still end in a `click` on whichever row happened to be under the finger —
// so scrolling could silently switch the active preset. This tracks whether the
// touch that began the current gesture moved far enough to count as a scroll
// rather than a tap; the pick action consults it and ignores the click if so.
//
// `sheetDragMoved` is read by dispatch.js ('preset-sheet-pick'). It's reset on
// every touchstart, so a genuine tap (no drift) always reads false and works
// exactly as before. Mouse drags aren't tracked: desktop scrolls with a wheel or
// scrollbar and doesn't produce this failure mode.
let sheetDragMoved = false;
const SHEET_DRAG_SLOP = 10;   // px of drift before a gesture counts as a scroll

// v57.1 — suggestion pick: commit on pointerdown, then SWALLOW the trailing click.
//
// V57 moved the suggestion pick to `pointerdown` to beat the input-blur race, and
// that half worked — but a touch tap still fires a real `click` after pointerup.
// `preventDefault()` on a pointerdown does NOT cancel that click. So the commit ran,
// the list was torn down and re-rendered, and then a ghost click landed at the same
// screen point — now on whatever sits under where the option used to be. Directly
// below the type field are the Notes control and the PASS button, which is exactly
// what the field report described: taps that "jump to the note field" or "record the
// item as Pass", plus picks that seemed not to register.
//
// The fix keeps the pointerdown commit (so the pick is reliable) and adds a
// short-lived, capture-phase, one-shot global click swallow — the same technique the
// V47 long-press already uses. After a commit we arm `swallowNextClick`; the very
// next click anywhere is caught in the capture phase, cancelled, and disarms the
// guard.
//
// v70.1 — WHY THE TIMEOUT ALONE WAS NOT ENOUGH.
//
// V57.1 relied on the ghost click always arriving to disarm the guard, with a 700ms
// timeout as the only backstop. But the ghost click does NOT always arrive: if the
// finger drifts a few pixels the gesture becomes a scroll and iOS fires
// `pointercancel` with no click at all, and the commit removes the tapped node from
// the DOM before pointerup, which can leave no valid click target either. When no
// click arrives the guard stays armed for the rest of the 700ms — and the next thing
// an engineer taps after choosing a description is PASS, comfortably inside that
// window. The tap was swallowed in the capture phase and the item did not pass until
// they tapped again. That is the "sometimes it takes two taps of Pass" field report.
//
// The discriminator is pointerdown. A DELIBERATE tap always emits its own
// `pointerdown` before its `click`; the ghost click, by definition, belongs to the
// pointer sequence that already fired — no new pointerdown comes between them. So we
// disarm on any new pointerdown, in the capture phase, which runs BEFORE the
// suggestion button's own handler arms the guard (target phase) and therefore never
// disarms the tap that armed it. A real tap can now no longer be swallowed at all,
// while the ghost still is. The timeout is kept purely as a belt-and-braces disarm
// and shortened to 400ms, comfortably past any synthetic click.
let swallowNextClick = false;
let swallowClickTimer = null;
const SWALLOW_MAX_MS = 400;
function armClickSwallow() {
  swallowNextClick = true;
  if (swallowClickTimer) clearTimeout(swallowClickTimer);
  swallowClickTimer = setTimeout(() => { swallowNextClick = false; swallowClickTimer = null; }, SWALLOW_MAX_MS);
}
function disarmClickSwallow() {
  swallowNextClick = false;
  if (swallowClickTimer) { clearTimeout(swallowClickTimer); swallowClickTimer = null; }
}
function initSuggestionClickSwallow() {
  // ⚠ Order matters and is load-bearing. This capture-phase pointerdown listener
  // fires before the suggestion button's own onpointerdown (target phase), so the
  // arming tap disarms-then-arms — never the reverse. Do not move the arm call into
  // a capture-phase listener or the guard will cancel itself and the ghost click
  // will get through to PASS.
  document.addEventListener('pointerdown', () => { disarmClickSwallow(); }, true);
  document.addEventListener('click', (e) => {
    if (!swallowNextClick) return;
    disarmClickSwallow();
    e.stopPropagation();
    e.preventDefault();
  }, true);   // capture phase — intercept before the delegated #app handler
}

// Shared pointerdown handler factory for every suggestion dropdown. `apply(el)` does
// the field-specific state write; the wrapper handles the parts that are identical
// across all three lists (hold focus, arm the click swallow, commit).
function makeSuggestionCommit(apply) {
  return (e) => {
    e.preventDefault();     // hold input focus so blur doesn't tear the list down first
    armClickSwallow();      // eat the trailing ghost click before it hits PASS/Notes
    apply(e.currentTarget);
  };
}

// Bound once at boot (not per-render) on the document, using the capture phase so
// it sees the touch regardless of which sheet is open or when it was painted.
function initSheetDragGuard() {
  let sx = 0, sy = 0;
  document.addEventListener('touchstart', e => {
    const t = e.touches && e.touches[0];
    if (!t) return;
    sheetDragMoved = false;
    sx = t.clientX; sy = t.clientY;
  }, true);
  document.addEventListener('touchmove', e => {
    const t = e.touches && e.touches[0];
    if (!t) return;
    if (Math.abs(t.clientX - sx) > SHEET_DRAG_SLOP ||
        Math.abs(t.clientY - sy) > SHEET_DRAG_SLOP) {
      sheetDragMoved = true;
    }
  }, true);
}

// v70.1 — SHARED DROPDOWN PAINTER. Two stability fixes live here, both aimed at the
// same field report: "I can see the one I want but tapping it doesn't select it."
//
// 1. IDENTITY SKIP. Every one of the three helpers used to `remove()` the list node
//    and build a fresh one on EVERY keystroke, even when the filtered results were
//    unchanged. That destroys the very button the finger is travelling towards, and
//    a tap that lands mid-teardown hits nothing. We now compare the markup we are
//    about to paint against what is already on screen and leave the DOM completely
//    alone when they match. The comparison uses a property stashed on the node
//    rather than reading innerHTML back, because a browser may normalise attribute
//    order on the round trip and a false mismatch would silently defeat the whole
//    optimisation. A node built by a full render() has no stash, so it compares
//    unequal and repaints — the safe direction.
//
// 2. SHRINK HYSTERESIS. computeSuggestions() re-bands its results (descriptions
//    already used in this session sort to the top) and caps at 5, so one more
//    keystroke can drop the list from five rows to two AND reorder what survives.
//    Aim at row three, type one more letter, and by the time the finger lands row
//    three is gone — the tap falls through to empty space, or to the PASS button the
//    absolutely-positioned list was covering. So the list now GROWS immediately but
//    SHRINKS on a short delay: the row you aimed at is still there for a beat after
//    the keystroke that would have removed it. Committing a row that is a beat stale
//    is harmless — it is a real description and it is the one the engineer aimed at.
//
// Hysteresis applies to typing only. Callers pass fromTyping=true from oninput and
// onfocus; every other path (a pick, the blur hide, quick-pick in dispatch.js) omits
// it and paints instantly, so nothing that should feel immediate is delayed. The
// default is instant, which means an unconverted call site degrades to exactly the
// old behaviour rather than to a mystery delay.
const SUGGEST_SHRINK_DELAY_MS = 120;
const _suggestShrinkTimers = {};

function paintSuggestionList(key, wrap, html, wire, id, onDefer) {
  if (!wrap) return;
  // The newest paint always wins: cancel any shrink still pending for this list.
  if (_suggestShrinkTimers[key]) { clearTimeout(_suggestShrinkTimers[key]); _suggestShrinkTimers[key] = null; }

  const existing = wrap.querySelector('.suggestions');
  const currentHTML = existing ? (existing._patSuggestSrc || '') : '';
  if (existing && currentHTML === html) return;          // unchanged — do not touch the DOM
  if (!existing && !html) return;                        // nothing there, nothing to show

  const newRows = html ? (html.match(/class="suggestion-item"/g) || []).length : 0;
  const oldRows = existing ? existing.children.length : 0;
  if (onDefer && newRows < oldRows) {
    // Re-derive from live state when the timer fires rather than painting the markup
    // captured now — state may have moved on in the meantime.
    _suggestShrinkTimers[key] = setTimeout(() => { _suggestShrinkTimers[key] = null; onDefer(); }, SUGGEST_SHRINK_DELAY_MS);
    return;
  }

  if (existing) existing.remove();
  if (!html) return;
  const div = document.createElement('div');
  div.className = 'suggestions';
  if (id) div.id = id;
  div.innerHTML = html;
  div._patSuggestSrc = html;
  wrap.appendChild(div);
  wire(div);
}

// Light re-render of just the suggestions dropdown so we don't lose input focus
function renderSuggestionsOnly(fromTyping) {
  const wrap = document.querySelector('.custom-type-wrap');
  if (!wrap) return;
  const html = (state.showSuggestions && state.suggestions.length > 0)
    ? state.suggestions.map(s => `<button class="suggestion-item" data-suggest="${escapeHTML(s)}">${escapeHTML(s)}</button>`).join('')
    : '';
  paintSuggestionList('type', wrap, html, (div) => {
    div.querySelectorAll('[data-suggest]').forEach(el => {
      // v57.1: commit on pointerdown via the shared helper — see makeSuggestionCommit
      // and initSuggestionClickSwallow above. pointerdown beats the input-blur race
      // (the V57 fix); the click swallow kills the trailing ghost click that V57
      // missed (which was landing on Notes / PASS below the field).
      el.onpointerdown = makeSuggestionCommit((el) => {
        state.form.itemType = el.dataset.suggest;
        const inp = document.getElementById('f-type');
        if (inp) inp.value = el.dataset.suggest;
        state.showSuggestions = false;
        renderSuggestionsOnly();
      });
    });
  }, null, fromTyping ? () => renderSuggestionsOnly(false) : null);
}

// v20: partial refresh for the New Session Client / Site suggestion lists.
// Same trick as renderLocationSuggestionsOnly — rebuild only the .suggestions
// div inside the field's wrap so the input keeps focus and the half-typed value
// survives. `field` is 'client' or 'site'.
//
// On picking a client we ALSO refresh the site suggestions, because the site
// list depends on which client is chosen — but only if the site field happens
// to be showing its list (it usually won't be, since focus is on client).
function renderNfSuggestionsOnly(field, fromTyping) {
  const wrap = document.getElementById(`nf-${field}-wrap`);
  if (!wrap) return;
  const attr = field === 'client' ? 'data-nf-client-suggest' : 'data-nf-site-suggest';
  const datasetKey = field === 'client' ? 'nfClientSuggest' : 'nfSiteSuggest';
  const show = state.nfActiveField === field && state.showNfSuggestions && state.nfSuggestions.length > 0;
  const html = show
    ? state.nfSuggestions.map(s => `<button class="suggestion-item" ${attr}="${escapeHTML(s)}">${escapeHTML(s)}</button>`).join('')
    : '';
  // v70.1: identity skip + shrink hysteresis via the shared painter — see its notes.
  paintSuggestionList(`nf-${field}`, wrap, html, (div) => {
    div.querySelectorAll(`[${attr}]`).forEach(el => {
      // v57.1: shared pointerdown commit + ghost-click swallow (see events.js top).
      el.onpointerdown = makeSuggestionCommit((el) => {
        const picked = el.dataset[datasetKey];
        if (field === 'client') {
          state.newForm.clientId = picked;
          const inp = document.getElementById('nf-client');
          if (inp) inp.value = picked;
        } else {
          state.newForm.site = picked;
          const inp = document.getElementById('nf-site');
          if (inp) inp.value = picked;
        }
        state.showNfSuggestions = false;
        state.nfSuggestions = [];
        renderNfSuggestionsOnly(field);
      });
    });
  }, `nf-${field}-suggestions`, fromTyping ? () => renderNfSuggestionsOnly(field, false) : null);
}


// fills the field, normalises casing the same way blur would, and immediately
// clears the suggestions.
function renderLocationSuggestionsOnly(fromTyping) {
  const wrap = document.querySelector('.location-input-wrap');
  if (!wrap) return;
  const html = (state.showLocationSuggestions && state.locationSuggestions.length > 0)
    ? state.locationSuggestions.map(s => `<button class="suggestion-item" data-loc-suggest="${escapeHTML(s)}">${escapeHTML(s)}</button>`).join('')
    : '';
  // v70.1: identity skip + shrink hysteresis via the shared painter — see its notes.
  paintSuggestionList('location', wrap, html, (div) => {
    div.querySelectorAll('[data-loc-suggest]').forEach(el => {
      // v57.1: shared pointerdown commit + ghost-click swallow (see events.js top).
      el.onpointerdown = makeSuggestionCommit((el) => {
        const picked = el.dataset.locSuggest;
        state.form.location = picked;
        const inp = document.getElementById('f-location');
        if (inp) {
          inp.value = picked;
          // Clear the focus-restore stash so blur doesn't undo our pick.
          inp.dataset.original = picked;
        }
        state.showLocationSuggestions = false;
        state.locationSuggestions = [];
        // v18/v20: tapping a suggestion confirms the location, so rebuild the
        // frozen row (v20) and full-render when Smart Quick Pick is on.
        if (state.sqpEnabled) { invalidateSqpRow(); render(); }
        else renderLocationSuggestionsOnly();
      });
    });
  }, 'location-suggestions', fromTyping ? () => renderLocationSuggestionsOnly(false) : null);
}

// ===========================================================================
// v75: bottom sheets versus the on-screen keyboard
// ===========================================================================
//
// THE PROBLEM. A bottom sheet is `position: fixed` anchored to the bottom of the
// viewport. On iOS the keyboard does NOT shrink the layout viewport, only the
// VISUAL one — so a fixed element keeps its full-screen geometry and its lower
// part, including its buttons, ends up underneath the keyboard. iOS then tries to
// rescue the focused field by scrolling the document, which drags the fixed
// overlay around, while the sheet's own `overflow-y: auto` scrolls independently.
// Two scrollers plus a mispositioned overlay is what the jumping is.
//
// THE FIX. `window.visualViewport` is the only thing that knows the true visible
// rectangle. We measure it and publish three custom properties on <html>; the
// sheet CSS reads them (see the long note on `.fail-sheet, .bulk-sheet` in
// styles.css for what each one does and why a smaller `dvh` cannot substitute).
//
// ⚠ WHY THIS IS ONE DOCUMENT-LEVEL LISTENER AND NOT PER-SHEET. There are ~28
// sheet-open sites across five files. Hooking each one would be 28 chances to
// forget one — and forgetting one produces exactly the bug we are fixing, in one
// sheet only, which is the hardest possible thing to notice. Publishing to <html>
// instead means the mechanism does not need to know a sheet exists: any sheet
// that reads the properties is fixed the moment it is painted, including sheets
// that do not exist yet. Nothing here queries the DOM for an open sheet.
//
// ⚠ SAFE WHEN NO SHEET IS OPEN. The properties only appear in sheet rules, so
// writing them while the user is typing on an ordinary screen changes nothing.
// That is what lets this run unconditionally instead of being armed and disarmed.
//
// FAILS SOFT, AND THAT IS LOAD-BEARING. No visualViewport (older iOS) means we
// return before binding anything and no property is ever written, so every
// `var()` falls back and the CSS is v74's. Nothing in a sheet's ability to open,
// paint or be dismissed depends on any of this.

// Below this, the difference is the browser UI settling rather than a keyboard —
// writing pixel geometry for that would make sheets twitch during ordinary
// scrolling. iOS keyboards are several hundred px, so this is not a close call.
const KB_MIN_INSET_PX = 120;

// The sheet is capped slightly under the space that exists so it does not sit
// flush against the top of the visible area with its title touching the edge.
const KB_SHEET_MAX_RATIO = 0.94;

function applyKeyboardInset() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;

  // Keyboard height = what the visual viewport has lost from the bottom of the
  // window. offsetTop matters: when iOS scrolls the visual viewport up to reveal
  // a field, height alone under-reports and the sheet lands too low.
  const inset = Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop)));

  if (inset < KB_MIN_INSET_PX) {
    // ⚠ REMOVE, DO NOT SET TO ZERO. Removing restores the var() fallbacks —
    // 85dvh, the safe-area padding, the wizard's 72vh floor — which is the exact
    // v74 rule. Writing `0px` would instead pin real values over the top of them
    // and quietly change the no-keyboard case, which is most of the app's life.
    root.style.removeProperty('--kb-inset');
    root.style.removeProperty('--sheet-max');
    root.style.removeProperty('--sheet-pad');
    root.style.removeProperty('--sheet-min-release');
    return;
  }

  root.style.setProperty('--kb-inset', inset + 'px');
  root.style.setProperty('--sheet-max', Math.round(vv.height * KB_SHEET_MAX_RATIO) + 'px');
  // The safe-area strip is reserved for the home indicator, which is behind the
  // keyboard right now — so it is pure wasted height on the one screen that has
  // none to spare. Flatten it to the plain padding until the keyboard goes.
  root.style.setProperty('--sheet-pad', '20px');
  // Releasing the wizard's floor. See the .wizard-sheet note in styles.css.
  root.style.setProperty('--sheet-min-release', '0px');
}

// Bound once at boot, same lifecycle as initDelegation / initSheetDragGuard /
// initSuggestionClickSwallow. `scroll` is not optional alongside `resize`: iOS
// fires scroll on the visual viewport (not resize) when it shifts the view to
// reveal a focused field, and without it the sheet is correctly sized but sitting
// in the wrong place. rAF-coalesced because both can fire many times per second.
function initKeyboardInset() {
  const vv = window.visualViewport;
  if (!vv) return;
  let pending = false;
  const onChange = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; applyKeyboardInset(); });
  };
  vv.addEventListener('resize', onChange);
  vv.addEventListener('scroll', onChange);
  applyKeyboardInset();
}
