/*!
 * PAT Test PWA
 * v28 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PAT Test PWA — v28 — Focus-sensitive field binding ==========
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
      renderNfSuggestionsOnly('client');
    };
    $('nf-client').onfocus = e => {
      state.nfActiveField = 'client';
      state.nfSuggestions = computeNfClientSuggestions(e.target.value);
      state.showNfSuggestions = state.nfSuggestions.length > 0;
      renderNfSuggestionsOnly('client');
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
      renderNfSuggestionsOnly('site');
    };
    $('nf-site').onfocus = e => {
      state.nfActiveField = 'site';
      state.nfSuggestions = computeNfSiteSuggestions(e.target.value);
      state.showNfSuggestions = state.nfSuggestions.length > 0;
      renderNfSuggestionsOnly('site');
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
      renderLocationSuggestionsOnly();
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
      const v = e.target.value.trim();
      if (v === '') {
        const orig = e.target.dataset.original || '';
        e.target.value = orig;
        state.form.location = orig;
      } else {
        const cased = titleCase(v);
        e.target.value = cased;
        state.form.location = cased;
      }
      // Delay hiding so a click on a suggestion can register first.
      setTimeout(() => {
        state.showLocationSuggestions = false;
        // v18/v20: when Smart Quick Pick is on, the confirmed location may have
        // changed, so rebuild the FROZEN row (v20) and full-render to show it.
        // Otherwise the lightweight suggestions-only refresh is enough.
        if (state.sqpEnabled) { invalidateSqpRow(); render(); }
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
      renderSuggestionsOnly();
    };
    $('f-type').onfocus = e => {
      if (e.target.value) {
        state.suggestions = computeSuggestions(e.target.value);
        state.showSuggestions = state.suggestions.length > 0;
        renderSuggestionsOnly();
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

// Light re-render of just the suggestions dropdown so we don't lose input focus
function renderSuggestionsOnly() {
  const wrap = document.querySelector('.custom-type-wrap');
  if (!wrap) return;
  const existing = wrap.querySelector('.suggestions');
  if (existing) existing.remove();
  if (state.showSuggestions && state.suggestions.length > 0) {
    const div = document.createElement('div');
    div.className = 'suggestions';
    div.innerHTML = state.suggestions.map(s => `<button class="suggestion-item" data-suggest="${escapeHTML(s)}">${escapeHTML(s)}</button>`).join('');
    wrap.appendChild(div);
    div.querySelectorAll('[data-suggest]').forEach(el => {
      el.onmousedown = (e) => { e.preventDefault(); };
      el.onclick = () => {
        state.form.itemType = el.dataset.suggest;
        const inp = document.getElementById('f-type');
        if (inp) inp.value = el.dataset.suggest;
        state.showSuggestions = false;
        renderSuggestionsOnly();
      };
    });
  }
}

// v20: partial refresh for the New Session Client / Site suggestion lists.
// Same trick as renderLocationSuggestionsOnly — rebuild only the .suggestions
// div inside the field's wrap so the input keeps focus and the half-typed value
// survives. `field` is 'client' or 'site'.
//
// On picking a client we ALSO refresh the site suggestions, because the site
// list depends on which client is chosen — but only if the site field happens
// to be showing its list (it usually won't be, since focus is on client).
function renderNfSuggestionsOnly(field) {
  const wrap = document.getElementById(`nf-${field}-wrap`);
  if (!wrap) return;
  const existing = wrap.querySelector('.suggestions');
  if (existing) existing.remove();
  if (state.nfActiveField !== field || !state.showNfSuggestions || !state.nfSuggestions.length) return;

  const attr = field === 'client' ? 'data-nf-client-suggest' : 'data-nf-site-suggest';
  const datasetKey = field === 'client' ? 'nfClientSuggest' : 'nfSiteSuggest';
  const div = document.createElement('div');
  div.className = 'suggestions';
  div.id = `nf-${field}-suggestions`;
  div.innerHTML = state.nfSuggestions.map(s => `<button class="suggestion-item" ${attr}="${escapeHTML(s)}">${escapeHTML(s)}</button>`).join('');
  wrap.appendChild(div);
  div.querySelectorAll(`[${attr}]`).forEach(el => {
    // preventDefault on mousedown so the input's blur doesn't fire and hide the
    // list before the click lands.
    el.onmousedown = (e) => { e.preventDefault(); };
    el.onclick = () => {
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
    };
  });
}


// fills the field, normalises casing the same way blur would, and immediately
// clears the suggestions.
function renderLocationSuggestionsOnly() {
  const wrap = document.querySelector('.location-input-wrap');
  if (!wrap) return;
  const existing = wrap.querySelector('.suggestions');
  if (existing) existing.remove();
  if (state.showLocationSuggestions && state.locationSuggestions.length > 0) {
    const div = document.createElement('div');
    div.className = 'suggestions';
    div.id = 'location-suggestions';
    div.innerHTML = state.locationSuggestions.map(s => `<button class="suggestion-item" data-loc-suggest="${escapeHTML(s)}">${escapeHTML(s)}</button>`).join('');
    wrap.appendChild(div);
    div.querySelectorAll('[data-loc-suggest]').forEach(el => {
      // preventDefault on mousedown so the blur on the input doesn't fire
      // before the click handler — without this, blur restores the original
      // value and the click never lands.
      el.onmousedown = (e) => { e.preventDefault(); };
      el.onclick = () => {
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
      };
    });
  }
}
