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

  // Update banner — present on every view if updateAvailable
  if ($('update-refresh')) $('update-refresh').onclick = () => applyUpdate();
  if ($('update-dismiss')) $('update-dismiss').onclick = () => dismissUpdateBanner();

  // Sessions screen
  if ($('settings-btn')) $('settings-btn').onclick = () => setView('settings');
  if ($('new-session-btn')) $('new-session-btn').onclick = () => {
    state.newForm.show = true;
    if (!state.newForm.engineer && state.engineer) state.newForm.engineer = state.engineer;
    state.nfSuggestions = []; state.showNfSuggestions = false; state.nfActiveField = null;
    render();
  };
  if ($('nf-cancel')) $('nf-cancel').onclick = () => {
    // v19: clear the form on cancel so a half-filled client/site (or any other
    // field) doesn't carry into the next New Session. Engineer is re-seeded from
    // the saved default when the form is next opened.
    state.newForm = { name: '', site: '', engineer: state.engineer, prefix: '', startNo: '1', show: false, clientId: '', siteId: '' };
    state.nfSuggestions = []; state.showNfSuggestions = false; state.nfActiveField = null;
    render();
  };
  if ($('nf-submit')) $('nf-submit').onclick = () => {
    // v19: nf-client carries the typed CLIENT name; nf-site the SITE name.
    state.newForm.clientId = $('nf-client') ? $('nf-client').value : '';
    state.newForm.site = $('nf-site') ? $('nf-site').value : '';
    state.newForm.engineer = $('nf-engineer').value;
    state.newForm.name = $('nf-name').value;
    state.newForm.prefix = $('nf-prefix').value;
    state.newForm.startNo = $('nf-start').value;
    createSession();
  };
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
  if ($('import-session-btn')) $('import-session-btn').onclick = () => {
    const inp = $('import-session-file');
    if (inp) inp.click();
  };
  if ($('import-session-file')) $('import-session-file').onchange = e => {
    const file = e.target.files && e.target.files[0];
    handleImportFile(file);
    // Reset so picking the same file twice still triggers a change
    e.target.value = '';
  };

  // v10: Import conflict dialog — three actions stacked vertically.
  if ($('import-conflict-cancel')) $('import-conflict-cancel').onclick = () => cancelImportConflict();
  if ($('import-conflict-cancel2')) $('import-conflict-cancel2').onclick = () => cancelImportConflict();
  if ($('import-conflict-backdrop')) $('import-conflict-backdrop').onclick = () => cancelImportConflict();
  if ($('import-conflict-duplicate')) $('import-conflict-duplicate').onclick = () => {
    const pending = state.importDialog.pendingSession;
    const skipped = (state.importDialog.summary && state.importDialog.summary.skipped) || [];
    if (pending) commitImportedSession(pending, 'duplicate', skipped);
  };
  if ($('import-conflict-merge')) $('import-conflict-merge').onclick = () => {
    const pending = state.importDialog.pendingSession;
    const skipped = (state.importDialog.summary && state.importDialog.summary.skipped) || [];
    if (pending) commitImportedSession(pending, 'merge', skipped);
  };

  // v10: Import summary dialog — single Done button (and the × in the header).
  if ($('import-summary-done')) $('import-summary-done').onclick = () => closeImportSummary();
  if ($('import-summary-close')) $('import-summary-close').onclick = () => closeImportSummary();
  if ($('import-summary-backdrop')) $('import-summary-backdrop').onclick = () => closeImportSummary();

  // Sessions-list row events — extracted so refreshSessionsListAreaOnly() can
  // rebind without touching anything else.
  bindSessionsListAreaEvents();

  // Entry screen
  if ($('sessions-btn')) $('sessions-btn').onclick = () => setView('sessions');
  if ($('overview-btn')) $('overview-btn').onclick = () => setView('overview');
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

  document.querySelectorAll('.quick-btn').forEach(b => {
    b.onclick = () => {
      state.form.itemType = b.dataset.type;
      const inp = document.getElementById('f-type');
      if (inp) inp.value = b.dataset.type;
      document.querySelectorAll('.quick-btn').forEach(x => x.classList.toggle('active', x === b));
      state.showSuggestions = false;
      renderSuggestionsOnly();
    };
  });

  if ($('f-notes')) $('f-notes').oninput = e => state.form.notes = e.target.value;
  if ($('show-notes-btn')) $('show-notes-btn').onclick = () => { state.form.showNotes = true; render(); document.getElementById('f-notes')?.focus(); };

  if ($('pass-btn')) $('pass-btn').onclick = () => passClicked();
  if ($('fail-btn')) $('fail-btn').onclick = () => failClicked();
  if ($('copy-last-btn')) $('copy-last-btn').onclick = () => copyLastResult();
  if ($('prev-btn')) $('prev-btn').onclick = () => moveCursor(-1);
  if ($('next-btn')) $('next-btn').onclick = () => moveCursor(1);
  if ($('skip-new-btn')) $('skip-new-btn').onclick = () => skipToNew();
  if ($('del-item-btn')) $('del-item-btn').onclick = () => { if (confirm('Are you sure you want to delete this item?\n\nThis cannot be undone.')) deleteItem(state.cursor); };

  document.querySelectorAll('[data-reason]').forEach(el => {
    el.onclick = () => pickFailReason(el.dataset.reason);
  });
  if ($('fail-other-btn')) $('fail-other-btn').onclick = () => {
    state.failModalStage = 'other';
    render();
    document.getElementById('fail-other-input')?.focus();
  };
  if ($('fail-other-back')) $('fail-other-back').onclick = () => {
    state.failModalStage = 'reasons';
    state.failOtherText = '';
    render();
  };
  if ($('fail-other-input')) $('fail-other-input').oninput = e => state.failOtherText = e.target.value;
  if ($('fail-other-save')) $('fail-other-save').onclick = () => {
    const reason = state.failOtherText.trim();
    pickFailReason(reason || null);
  };
  if ($('fail-close')) $('fail-close').onclick = () => cancelFailModal();
  if ($('fail-backdrop')) $('fail-backdrop').onclick = () => cancelFailModal();

  // v16: Multi Pick — open the sheet, pick a slot, or dismiss.
  if ($('multipick-btn')) $('multipick-btn').onclick = () => {
    const sess = activeSession();
    if (sess && sess.locked) return;
    state.multiPickSheetOpen = true;
    render();
  };
  document.querySelectorAll('[data-mp-index]').forEach(el => {
    el.onclick = () => multiPickFire(parseInt(el.dataset.mpIndex, 10));
  });
  if ($('multipick-close')) $('multipick-close').onclick = () => {
    state.multiPickSheetOpen = false;
    render();
  };
  if ($('multipick-backdrop')) $('multipick-backdrop').onclick = () => {
    state.multiPickSheetOpen = false;
    render();
  };

  // Overview screen
  // Overview & Settings hub both use #back-btn — disambiguate by current view.
  // Settings hub is only reachable from sessions; Overview is only reachable from entry.
  if ($('back-btn')) $('back-btn').onclick = () => {
    if (state.view === 'overview') setView('entry');
    else if (state.view === 'settings') setView('sessions');
  };
  if ($('export-btn')) $('export-btn').onclick = () => { const s = activeSession(); if (s) shareOrDownloadCSV(s); };
  if ($('edit-session-btn')) $('edit-session-btn').onclick = () => startEditSession();
  if ($('select-mode-btn')) $('select-mode-btn').onclick = () => enterSelectionMode();
  if ($('cancel-selection-btn')) $('cancel-selection-btn').onclick = () => { exitSelectionMode(); render(); };
  if ($('select-all-visible-btn')) $('select-all-visible-btn').onclick = () => selectAllVisible();
  if ($('clear-selection-btn')) $('clear-selection-btn').onclick = () => clearSelection();

  // v11: Bulk-edit menu — selection bar button opens the menu sheet; the menu
  // options route to the four sub-flows (location reuses the v10 path).
  if ($('bulk-edit-menu-btn')) $('bulk-edit-menu-btn').onclick = () => openBulkEditMenu();
  if ($('bulk-menu-close')) $('bulk-menu-close').onclick = () => closeBulkEditMenu();
  if ($('bulk-menu-backdrop')) $('bulk-menu-backdrop').onclick = () => closeBulkEditMenu();
  document.querySelectorAll('[data-bulk-edit]').forEach(el => {
    el.onclick = () => {
      const mode = el.dataset.bulkEdit;
      if (mode === 'delete') {
        // Delete confirms inside applyBulkDelete() — no separate dialog.
        state.bulkEdit.menuOpen = false;
        applyBulkDelete();
      } else {
        openBulkEditDialog(mode);
      }
    };
  });

  // v10/v11: bulk Location dialog (reuses v10 IDs).
  if ($('bulk-cancel-btn')) $('bulk-cancel-btn').onclick = () => cancelBulkEditDialog();
  if ($('bulk-backdrop')) $('bulk-backdrop').onclick = () => cancelBulkEditDialog();
  if ($('bulk-location-input')) $('bulk-location-input').oninput = e => state.bulkLocationValue = e.target.value;
  if ($('bulk-apply-btn')) $('bulk-apply-btn').onclick = () => applyBulkLocation();

  // v11: bulk Type dialog. Quick-pick buttons fill the input; Apply commits.
  if ($('bulk-type-cancel')) $('bulk-type-cancel').onclick = () => cancelBulkEditDialog();
  if ($('bulk-type-backdrop')) $('bulk-type-backdrop').onclick = () => cancelBulkEditDialog();
  if ($('bulk-type-input')) $('bulk-type-input').oninput = e => state.bulkEdit.typeValue = e.target.value;
  if ($('bulk-type-apply')) $('bulk-type-apply').onclick = () => applyBulkType();
  document.querySelectorAll('[data-bulk-type-quick]').forEach(el => {
    el.onclick = () => {
      state.bulkEdit.typeValue = el.dataset.bulkTypeQuick;
      // Update the input value live without a full re-render to keep keyboard.
      const inp = document.getElementById('bulk-type-input');
      if (inp) inp.value = state.bulkEdit.typeValue;
    };
  });

  // v11: bulk Notes dialog. Mode radios + textarea; Apply commits.
  if ($('bulk-notes-cancel')) $('bulk-notes-cancel').onclick = () => cancelBulkEditDialog();
  if ($('bulk-notes-backdrop')) $('bulk-notes-backdrop').onclick = () => cancelBulkEditDialog();
  if ($('bulk-notes-input')) $('bulk-notes-input').oninput = e => state.bulkEdit.notesValue = e.target.value;
  if ($('bulk-notes-apply')) $('bulk-notes-apply').onclick = () => applyBulkNotes();
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
  if ($('cancel-edit-btn')) $('cancel-edit-btn').onclick = () => setView('overview');
  if ($('ef-cancel')) $('ef-cancel').onclick = () => setView('overview');
  if ($('ef-save')) $('ef-save').onclick = () => {
    state.editForm.site = $('ef-site').value;
    state.editForm.engineer = $('ef-engineer').value;
    state.editForm.name = $('ef-name').value;
    state.editForm.date = $('ef-date').value;
    state.editForm.prefix = $('ef-prefix').value;
    state.editForm.locked = $('ef-locked') ? $('ef-locked').checked : false;   // v8
    saveSessionEdits();
  };
  if ($('ef-site')) $('ef-site').oninput = e => state.editForm.site = e.target.value;
  if ($('ef-engineer')) $('ef-engineer').oninput = e => state.editForm.engineer = e.target.value;
  if ($('ef-name')) $('ef-name').oninput = e => state.editForm.name = e.target.value;
  if ($('ef-date')) $('ef-date').oninput = e => state.editForm.date = e.target.value;
  if ($('ef-prefix')) $('ef-prefix').oninput = e => state.editForm.prefix = e.target.value;
  if ($('ef-locked')) $('ef-locked').onchange = e => state.editForm.locked = e.target.checked;   // v8

  // v8: Lock banner unlock shortcut on entry screen
  if ($('lock-unlock-btn')) $('lock-unlock-btn').onclick = () => unlockActiveSession();

  // Settings hub — row taps
  document.querySelectorAll('[data-page]').forEach(el => {
    el.onclick = () => setView(el.dataset.page);
  });
  // Settings sub-pages — back button
  if ($('back-to-settings-btn')) $('back-to-settings-btn').onclick = () => setView('settings');

  // Settings sub-page save buttons
  if ($('settings-user-save')) $('settings-user-save').onclick = () => saveUserSettings();
  if ($('settings-items-save')) $('settings-items-save').onclick = () => saveItemTypesSettings();
  if ($('settings-fails-save')) $('settings-fails-save').onclick = () => saveFailReasonsSettings();
  if ($('settings-descriptions-save')) $('settings-descriptions-save').onclick = () => saveDescriptionsSettings();
  // v16: Multi Pick settings save.
  if ($('settings-multipick-save')) $('settings-multipick-save').onclick = () => saveMultiPickSettings();
  // v16: toggle's On/Off subtext updates live WITHOUT a re-render (a render here
  // would clobber any unsaved slot edits, like the CSV page). The actual value
  // is committed on Save, matching the other settings sub-pages.
  if ($('multipick-enabled')) $('multipick-enabled').onchange = e => {
    const sub = document.getElementById('multipick-enabled-sub');
    if (sub) sub.textContent = e.target.checked ? 'On' : 'Off';
  };

  // v9: Reset-to-defaults buttons
  if ($('settings-items-reset')) $('settings-items-reset').onclick = () => resetItemsToDefaults();
  if ($('settings-fails-reset')) $('settings-fails-reset').onclick = () => resetFailReasonsToDefaults();
  if ($('settings-descriptions-reset')) $('settings-descriptions-reset').onclick = () => resetDescriptionsToDefaults();

  // v18: Smart Quick Pick controls on the Quick Pick Items page. The toggle
  // commits instantly (and seeds history on first enable); the two buttons
  // confirm before acting since they replace/clear the learned data.
  if ($('sqp-toggle')) $('sqp-toggle').onchange = e => setSqp(e.target.checked);
  if ($('sqp-rebuild-btn')) $('sqp-rebuild-btn').onclick = () => {
    if (!confirm('Rebuild Smart Quick Pick history from all your current sessions?\n\nThis replaces the learned history with a fresh scan of your data.')) return;
    rebuildSqpHistory();
  };
  if ($('sqp-clear-btn')) $('sqp-clear-btn').onclick = () => {
    if (!confirm('Clear all Smart Quick Pick history?\n\nThe buttons will go back to their normal order until it learns again. Re-enabling the feature rebuilds the history from your data.')) return;
    clearSqpHistory();
  };

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
  if ($('preset-new-btn')) $('preset-new-btn').onclick = () => {
    state.presetDialog = { mode: 'new', name: '', editingId: null };
    render();
  };
  if ($('preset-rename-btn')) $('preset-rename-btn').onclick = () => {
    const p = activePreset();
    if (!p) return;
    state.presetDialog = { mode: 'rename', name: p.name, editingId: p.id };
    render();
  };
  if ($('preset-delete-btn')) $('preset-delete-btn').onclick = () => {
    const p = activePreset();
    if (!p) return;
    if (state.itemPresets.length <= 1) {
      alert('You must have at least one preset.');
      return;
    }
    if (!confirm(`Delete preset "${p.name}"?\n\nThe items in this preset will be lost. Other presets are not affected.`)) return;
    deletePreset(p.id);
    render();
  };
  if ($('preset-dialog-input')) $('preset-dialog-input').oninput = e => state.presetDialog.name = e.target.value;
  if ($('preset-dialog-cancel')) $('preset-dialog-cancel').onclick = () => {
    state.presetDialog = { mode: null, name: '', editingId: null };
    render();
  };
  if ($('preset-backdrop')) $('preset-backdrop').onclick = () => {
    state.presetDialog = { mode: null, name: '', editingId: null };
    render();
  };
  if ($('preset-dialog-confirm')) $('preset-dialog-confirm').onclick = () => {
    const name = (state.presetDialog.name || '').trim();
    if (!name) { alert('Name cannot be empty.'); return; }
    if (state.presetDialog.mode === 'new') {
      createPreset(name);
    } else if (state.presetDialog.mode === 'rename' && state.presetDialog.editingId) {
      renamePreset(state.presetDialog.editingId, name);
    }
    state.presetDialog = { mode: null, name: '', editingId: null };
    render();
  };

  // v9: first-launch migration prompt — names the user's existing item list.
  if ($('migration-prompt-input')) $('migration-prompt-input').oninput = e => state.migrationPrompt.name = e.target.value;
  if ($('migration-prompt-confirm')) $('migration-prompt-confirm').onclick = () => confirmMigrationPrompt();

  // Display settings — instant apply.
  // v8 hotfix: this used to be [data-theme] but applyTheme() ALSO sets data-theme
  // on <html>, so the selector matched <html> too. Every tap anywhere bubbled to
  // <html>, fired its onclick → setTheme → render → destroyed the tapped input
  // before iOS could focus it. Result: app-wide "taps do nothing" the moment a
  // user picked Light or Dark. Renamed the button attribute to data-set-theme to
  // remove the collision.
  document.querySelectorAll('[data-set-theme]').forEach(el => {
    el.onclick = () => setTheme(el.dataset.setTheme);
  });
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
  if ($('backup-export-btn')) $('backup-export-btn').onclick = () => downloadBackup();
  // v14: prune controls on the Backup & Restore page.
  if ($('prune-review-btn')) $('prune-review-btn').onclick = () => pruneOldSessions();
  if ($('prune-age-save')) $('prune-age-save').onclick = () => savePruneAge();
  if ($('backup-import-btn')) $('backup-import-btn').onclick = () => $('backup-import-file').click();
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

  // v8: emergency reload button on About — recovery for the rare "taps do nothing"
  // bug without needing to reinstall the PWA. localStorage data is untouched.
  if ($('about-reload-btn')) $('about-reload-btn').onclick = () => {
    if (confirm('Reload the app? Your data is safe — only the app itself reloads.')) {
      window.location.reload();
    }
  };

  // ===== v11 bindings =====

  // Backup reminder banner — Sessions list only. "Export now" runs the same
  // downloadBackup() the Backup & Restore page does (which also stamps
  // lastBackupAt and clears the snooze). "Remind me later" and × both snooze
  // for 24h.
  if ($('backup-banner-export')) $('backup-banner-export').onclick = () => {
    downloadBackup();
    render();
  };
  if ($('backup-banner-later')) $('backup-banner-later').onclick = () => {
    snoozeBackupReminder();
    render();
  };
  if ($('backup-banner-dismiss')) $('backup-banner-dismiss').onclick = () => {
    snoozeBackupReminder();
    render();
  };

  // v17 welcome modal — Continue button dismisses and stamps the flag.
  if ($('v20-welcome-dismiss')) $('v20-welcome-dismiss').onclick = () => dismissV20Welcome();

  // v14: reopen-warning modal buttons.
  if ($('reopen-warn-continue')) $('reopen-warn-continue').onclick = () => confirmReopenWarning();
  if ($('reopen-warn-cancel')) $('reopen-warn-cancel').onclick = () => cancelReopenWarning();
  if ($('reopen-warn-cancel2')) $('reopen-warn-cancel2').onclick = () => cancelReopenWarning();

  // CSV Columns settings page
  if ($('settings-csv-save')) $('settings-csv-save').onclick = () => saveCsvColumnsSettings();
  if ($('settings-csv-reset')) $('settings-csv-reset').onclick = () => resetCsvColumnsSettings();
  document.querySelectorAll('[data-csv-up]').forEach(el => {
    el.onclick = () => moveCsvColumn(el.dataset.csvUp, -1);
  });
  document.querySelectorAll('[data-csv-down]').forEach(el => {
    el.onclick = () => moveCsvColumn(el.dataset.csvDown, +1);
  });

  // v19: Clients & Sites settings page.
  if ($('client-add-btn')) $('client-add-btn').onclick = () => {
    state.clientsPage.clientDialog = { mode: 'add', name: '', editingId: null };
    state.clientsPage.siteDialog = { mode: null, name: '', editingId: null, clientId: null };
    render();
  };
  // v20: rebuild clients/sites from all sessions (non-destructive; adds only).
  if ($('clients-rebuild-btn')) $('clients-rebuild-btn').onclick = () => {
    if (!confirm('Scan all your sessions and add any clients and sites that aren\'t already listed? Nothing already here will be changed or removed.')) return;
    const added = rebuildClientsFromSessions();
    render();
    setTimeout(() => alert(
      added === 0
        ? 'Nothing new to add — every client and site from your sessions is already listed.'
        : `Added ${added} new ${added === 1 ? 'entry' : 'entries'} from your sessions.`
    ), 50);
  };
  // Expand / collapse a client to reveal its sites.
  document.querySelectorAll('[data-client-toggle]').forEach(el => {
    el.onclick = () => {
      const id = el.dataset.clientToggle;
      state.clientsPage.expandedClientId =
        state.clientsPage.expandedClientId === id ? null : id;
      render();
    };
  });
  document.querySelectorAll('[data-client-rename]').forEach(el => {
    el.onclick = () => {
      const c = clientById(el.dataset.clientRename);
      if (!c) return;
      state.clientsPage.clientDialog = { mode: 'rename', name: c.name, editingId: c.id };
      state.clientsPage.siteDialog = { mode: null, name: '', editingId: null, clientId: null };
      render();
    };
  });
  document.querySelectorAll('[data-client-delete]').forEach(el => {
    el.onclick = () => deleteClient(el.dataset.clientDelete);
  });
  document.querySelectorAll('[data-site-add]').forEach(el => {
    el.onclick = () => {
      state.clientsPage.siteDialog = { mode: 'add', name: '', editingId: null, clientId: el.dataset.siteAdd };
      state.clientsPage.clientDialog = { mode: null, name: '', editingId: null };
      render();
    };
  });
  document.querySelectorAll('[data-site-rename]').forEach(el => {
    el.onclick = () => {
      const s = siteById(el.dataset.siteRename);
      if (!s) return;
      state.clientsPage.siteDialog = { mode: 'rename', name: s.name, editingId: s.id, clientId: s.clientId };
      state.clientsPage.clientDialog = { mode: null, name: '', editingId: null };
      render();
    };
  });
  document.querySelectorAll('[data-site-delete]').forEach(el => {
    el.onclick = () => deleteSite(el.dataset.siteDelete);
  });
  // Client dialog (add / rename)
  if ($('client-dialog-input')) $('client-dialog-input').oninput = e => state.clientsPage.clientDialog.name = e.target.value;
  if ($('client-dialog-confirm')) $('client-dialog-confirm').onclick = () => {
    if (state.clientsPage.clientDialog.mode === 'add') addClientFromDialog();
    else renameClientFromDialog();
  };
  if ($('client-dialog-cancel')) $('client-dialog-cancel').onclick = () => {
    state.clientsPage.clientDialog = { mode: null, name: '', editingId: null };
    render();
  };
  if ($('client-dialog-backdrop')) $('client-dialog-backdrop').onclick = () => {
    state.clientsPage.clientDialog = { mode: null, name: '', editingId: null };
    render();
  };
  // Site dialog (add / rename)
  if ($('site-dialog-input')) $('site-dialog-input').oninput = e => state.clientsPage.siteDialog.name = e.target.value;
  if ($('site-dialog-confirm')) $('site-dialog-confirm').onclick = () => {
    if (state.clientsPage.siteDialog.mode === 'add') addSiteFromDialog();
    else renameSiteFromDialog();
  };
  if ($('site-dialog-cancel')) $('site-dialog-cancel').onclick = () => {
    state.clientsPage.siteDialog = { mode: null, name: '', editingId: null, clientId: null };
    render();
  };
  if ($('site-dialog-backdrop')) $('site-dialog-backdrop').onclick = () => {
    state.clientsPage.siteDialog = { mode: null, name: '', editingId: null, clientId: null };
    render();
  };
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
