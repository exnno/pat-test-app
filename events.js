/*!
 * PAT Test PWA
 * v22 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PAT Test PWA — v22 — Events ==============
// bindEvents() + the suggestion re-render helpers.

// ---------- Event binding ----------
function bindEvents() {
  const $ = id => document.getElementById(id);

  // Update banner — present on every view if updateAvailable.
  // v25 (E3): #update-refresh (update-refresh) and #update-dismiss
  // (update-dismiss) are delegated via data-action in dispatch.js.

  // Sessions screen
  // v25 (E3): #settings-btn (open-settings), #new-session-btn (new-session) and
  // #import-session-btn (import-session) are now delegated via data-action in
  // dispatch.js. #nf-cancel (nf-cancel) and #nf-submit (nf-submit) are delegated
  // too. The new-session FORM's stateful field handlers stay below.
  // v20: Client field — tappable suggestions (replaces the v19 <datalist>).
  // Focus shows the full saved-client list; typing filters it live; tapping a
  // suggestion fills the field. On every change we also refresh the Site list
  // so it tracks the chosen client. We rebuild only the suggestion <div> (not
  // the whole form) so focus and any half-typed value are preserved.
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
  if ($('nf-name')) $('nf-name').oninput = e => state.newForm.name = e.target.value;
  if ($('nf-prefix')) $('nf-prefix').oninput = e => state.newForm.prefix = e.target.value;
  if ($('nf-start')) $('nf-start').oninput = e => state.newForm.startNo = e.target.value;

  if ($('sort-select')) $('sort-select').onchange = e => {
    state.sort = e.target.value;
    save();
    render();
  };

  // v10: Sessions list search — partial refresh on input so focus is preserved.
  // The sort-select inside #sessions-list-area gets rebuilt every keystroke
  // (the area is replaced wholesale), so its onchange handler is rebound in
  // bindSessionsListAreaEvents() below.
  if ($('sessions-search')) {
    $('sessions-search').oninput = e => {
      state.sessionsSearchQuery = e.target.value;
      refreshSessionsListAreaOnly();
    };
  }

  // v10: Import button — opens the (hidden) file picker, then handleImportFile
  // takes over once a file is chosen.
  // v25 (E3): #import-session-btn click is delegated (import-session). The file
  // input's onchange is a change event — stays here.
  if ($('import-session-file')) $('import-session-file').onchange = e => {
    const file = e.target.files && e.target.files[0];
    handleImportFile(file);
    // Reset so picking the same file twice still triggers a change
    e.target.value = '';
  };

  // v10: Import conflict + summary dialogs are delegated (import-conflict-cancel,
  // import-conflict-duplicate, import-conflict-merge, import-summary-done) in
  // dispatch.js.

  // Sessions-list row events — extracted so refreshSessionsListAreaOnly() can
  // rebind without touching anything else.
  bindSessionsListAreaEvents();

  // Entry screen
  // v25 (E3): #sessions-btn (go-sessions) and #overview-btn (go-overview) are
  // delegated. #f-asset below is a text field — stays here.
  if ($('f-asset')) $('f-asset').oninput = e => state.form.assetNo = e.target.value;

  if ($('f-location')) {
    // v10: location autocomplete. We keep the v6 focus-clears-the-field behaviour
    // (so the carry-forward location doesn't get in the way when you want to type
    // something different), and additionally feed state.locationSuggestions from
    // the current session's existing item locations on every keystroke.
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

  // v25 (E3): quick-pick buttons are delegated (quick-pick) in dispatch.js.

  if ($('f-notes')) $('f-notes').oninput = e => state.form.notes = e.target.value;
  // v25 (E3): #show-notes-btn (show-notes), the log/nav buttons (log-pass,
  // log-fail, copy-last, cursor-prev, cursor-next, skip-new,
  // delete-current-item), the fail sheet (fail-reason, fail-other,
  // fail-other-back, fail-other-save, fail-cancel) and the Multi Pick sheet
  // (multipick-open, multipick-fire, multipick-close) are all delegated.
  // #fail-other-input below is a text field — stays here.
  if ($('fail-other-input')) $('fail-other-input').oninput = e => state.failOtherText = e.target.value;

  // Overview screen
  // v25 (E3): #back-btn (overview-back), #export-btn (export-current),
  // #edit-session-btn (edit-session), #select-mode-btn (enter-selection),
  // #cancel-selection-btn (cancel-selection), #select-all-visible-btn
  // (select-all-visible) and #clear-selection-btn (clear-selection) are delegated.

  // v11: Bulk-edit menu — selection-bar button, menu close/backdrop, and the
  // four mode buttons are delegated (bulk-menu-open, bulk-menu-close,
  // bulk-edit-mode) in dispatch.js.

  // v10/v11: bulk Location dialog — cancel/backdrop/apply delegated (bulk-cancel,
  // bulk-location-apply). The text input's oninput stays here.
  if ($('bulk-location-input')) $('bulk-location-input').oninput = e => state.bulkLocationValue = e.target.value;

  // v11: bulk Type dialog — cancel/backdrop/apply and the quick-pick buttons are
  // delegated (bulk-cancel, bulk-type-apply, bulk-type-quick). The text input
  // oninput stays here.
  if ($('bulk-type-input')) $('bulk-type-input').oninput = e => state.bulkEdit.typeValue = e.target.value;

  // v11: bulk Notes dialog — cancel/backdrop/apply delegated (bulk-cancel,
  // bulk-notes-apply). The textarea oninput + the mode radios (change) stay here.
  if ($('bulk-notes-input')) $('bulk-notes-input').oninput = e => state.bulkEdit.notesValue = e.target.value;
  document.querySelectorAll('input[name="bulk-notes-mode"]').forEach(el => {
    el.onchange = e => {
      state.bulkEdit.notesMode = e.target.value === 'append' ? 'append' : 'replace';
      // Update the placeholder live without a full re-render.
      const ta = document.getElementById('bulk-notes-input');
      if (ta) ta.placeholder = state.bulkEdit.notesMode === 'append'
        ? 'Text to append'
        : 'New notes (leave empty to clear)';
    };
  });

  if ($('overview-search')) $('overview-search').oninput = e => {
    state.searchQuery = e.target.value;
    refreshOverviewBody();
  };
  if ($('fails-only-toggle')) $('fails-only-toggle').onchange = e => {
    state.showFailsOnly = e.target.checked;
    refreshOverviewBody();
  };
  bindOverviewBodyEvents();

  // Edit-session screen
  // v25 (E3): #cancel-edit-btn + #ef-cancel (edit-cancel) and #ef-save
  // (edit-save) are delegated. The ef-* field handlers below stay.
  if ($('ef-site')) $('ef-site').oninput = e => state.editForm.site = e.target.value;
  if ($('ef-engineer')) $('ef-engineer').oninput = e => state.editForm.engineer = e.target.value;
  if ($('ef-name')) $('ef-name').oninput = e => state.editForm.name = e.target.value;
  if ($('ef-date')) $('ef-date').oninput = e => state.editForm.date = e.target.value;
  if ($('ef-prefix')) $('ef-prefix').oninput = e => state.editForm.prefix = e.target.value;
  if ($('ef-locked')) $('ef-locked').onchange = e => state.editForm.locked = e.target.checked;   // v8

  // v8: Lock banner unlock shortcut on entry screen
  // v25 (E3): #lock-unlock-btn is delegated (unlock-session) in dispatch.js.

  // Settings hub + sub-pages
  // v25 (E3): row taps ([data-page] → settings-page), the back button
  // (back-to-settings), every Save/Reset button across the sub-pages, and the
  // Smart Quick Pick rebuild/clear buttons are delegated in dispatch.js. The
  // stateful toggles/selects below stay here (change events, out of v25 scope).
  if ($('multipick-enabled')) $('multipick-enabled').onchange = e => {
    const sub = document.getElementById('multipick-enabled-sub');
    if (sub) sub.textContent = e.target.checked ? 'On' : 'Off';
  };
  if ($('sqp-toggle')) $('sqp-toggle').onchange = e => setSqp(e.target.checked);

  // v9: preset switching, creation, rename, delete on the Quick Pick Items page.
  // Switching is via the dropdown — onchange because we want commit-on-blur,
  // not change-as-you-arrow (which would fire a render on every option).
  //
  // v10: confirm-on-switch guard. Previously the textarea was a pure draft
  // buffer — typing then switching presets silently discarded the edits. Now
  // we compare the textarea content against the active preset's stored items;
  // if it differs, we confirm. On cancel, the dropdown is reverted to the
  // current active preset. On confirm, the edits ARE still discarded — same as
  // before — but at least the user gave informed consent. Auto-save-on-switch
  // would be the alternative; we picked confirm because it matches the broader
  // "Save = commit" model used across every other settings sub-page.
  if ($('settings-preset-select')) $('settings-preset-select').onchange = e => {
    const newId = e.target.value;
    const currentP = activePreset();
    const ta = document.getElementById('settings-types');
    if (ta && currentP) {
      const storedItems = (currentP.items || []).join('\n');
      // Tolerate trailing whitespace differences (e.g. trailing newline from
      // the textarea) but otherwise demand exact match.
      const taValueNorm = ta.value.replace(/\s+$/, '');
      const storedNorm = storedItems.replace(/\s+$/, '');
      if (taValueNorm !== storedNorm) {
        const ok = confirm(
          `You have unsaved changes to "${currentP.name}".\n\n` +
          `Switch presets and discard the changes?`
        );
        if (!ok) {
          // Revert dropdown to the still-active preset.
          e.target.value = state.activePresetId;
          return;
        }
      }
    }
    switchPreset(newId);
  };
  if ($('preset-dialog-input')) $('preset-dialog-input').oninput = e => state.presetDialog.name = e.target.value;
  // v25 (E3): #preset-new-btn, #preset-rename-btn, #preset-delete-btn,
  // #preset-dialog-cancel, #preset-backdrop and #preset-dialog-confirm are
  // delegated (preset-new / preset-rename / preset-delete / preset-dialog-cancel
  // / preset-dialog-confirm) in dispatch.js.

  // v9: first-launch migration prompt — names the user's existing item list.
  if ($('migration-prompt-input')) $('migration-prompt-input').oninput = e => state.migrationPrompt.name = e.target.value;
  // v25 (E3): #migration-prompt-confirm is delegated (migration-confirm).

  // Display settings — theme buttons ([data-set-theme] → set-theme) are delegated
  // in dispatch.js. (v8 note retained: the attribute is data-set-theme, NOT
  // data-theme, to avoid the <html data-theme> selector collision that caused an
  // app-wide "taps do nothing" bug.) The toggles below stay (change events).
  if ($('haptics-toggle')) $('haptics-toggle').onchange = e => {
    setHaptics(e.target.checked);
    // Re-render so the "On"/"Off" sub-text updates
    render();
  };
  // v17: sound + timestamps toggles. Both re-render to refresh their On/Off
  // sub-text, matching the haptics row.
  if ($('sound-toggle')) $('sound-toggle').onchange = e => {
    setSound(e.target.checked);
    render();
  };
  if ($('timestamps-toggle')) $('timestamps-toggle').onchange = e => {
    setTimestamps(e.target.checked);
    render();
  };

  // Backup & Restore
  // v25 (E3): #backup-export-btn (backup-export), #prune-review-btn
  // (prune-review), #prune-age-save (prune-age-save), #backup-import-btn
  // (backup-import) and #about-reload-btn (about-reload) are delegated. The file
  // input's onchange stays here.
  if ($('backup-import-file')) $('backup-import-file').onchange = e => {
    const file = e.target.files && e.target.files[0];
    restoreBackupFromFile(file);
    // Reset so picking the same file twice still triggers
    e.target.value = '';
  };

  // v8: Resistance calculator — re-render the page on change so the result and
  // formula text update. The dropdowns themselves don't lose focus on iOS because
  // the user has already committed their selection by the time onchange fires.
  if ($('calc-csa')) $('calc-csa').onchange = e => {
    state.calcCsa = e.target.value;
    render();
  };
  if ($('calc-length')) $('calc-length').onchange = e => {
    state.calcLength = Number(e.target.value);
    render();
  };

  // ===== v11 bindings =====
  // v25 (E3): the backup reminder banner (backup-banner-export / -later /
  // -dismiss), the welcome modal (welcome-dismiss) and the reopen-warning modal
  // (reopen-continue / reopen-cancel) are all delegated in dispatch.js.

  // CSV Columns settings page
  // v25 (E3): #settings-csv-save (settings-csv-save), #settings-csv-reset
  // (settings-csv-reset), and the [data-csv-up]/[data-csv-down] reorder arrows
  // (csv-up / csv-down) are delegated in dispatch.js.

  // v19: Clients & Sites settings page.
  // v25 (E3): #client-add-btn (client-add), #clients-rebuild-btn
  // (clients-rebuild), the [data-client-*]/[data-site-*] row controls
  // (client-toggle / client-rename / client-delete / site-add / site-rename /
  // site-delete), and the dialog confirm/cancel/backdrop buttons
  // (client-dialog-confirm / client-dialog-cancel / site-dialog-confirm /
  // site-dialog-cancel) are all delegated. The two dialog text inputs stay here.
  if ($('client-dialog-input')) $('client-dialog-input').oninput = e => state.clientsPage.clientDialog.name = e.target.value;
  if ($('site-dialog-input')) $('site-dialog-input').oninput = e => state.clientsPage.siteDialog.name = e.target.value;
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
