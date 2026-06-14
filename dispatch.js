/*!
 * PAT Test PWA
 * v28 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PAT Test PWA — v25 — Delegated dispatch (E3) ==============
//
// WHY THIS EXISTS
// Pre-v25, bindEvents() re-attached ~160 per-element handlers on EVERY render
// (getElementById(...).onclick = ...). That repeats work that scales with screen
// complexity, and it's the part of the codebase most prone to a quiet "this
// button stopped working" bug (miss one rebind and a control goes dead).
//
// E3 replaces the CLICK half of that with delegation: ONE click listener on #app,
// attached ONCE at boot. Every clickable control carries a `data-action` label
// (and optional `data-arg`); the listener walks up from whatever was tapped to
// the nearest [data-action], looks the name up in ACTIONS, and runs it. Buttons
// can't lose their wiring on render because there's nothing to re-wire.
//
// SCOPE (v25, decided Q2=A): CLICK actions only. The stateful field handlers
// (oninput / onchange / onblur / onfocus on live text inputs, checkboxes, radios)
// stay as direct bindings in bindEvents() for now — collapsing those is a clean
// follow-on. So bindEvents() doesn't disappear in v25; it SHRINKS as each screen's
// click handlers migrate here.
//
// MIGRATION (Q1=A): screen by screen, infrastructure added ALONGSIDE the old
// bindings so the app is fully working at every step. As a screen's clicks move
// here, their lines leave bindEvents(). Order: (1) Sessions list ← this step,
// then Entry, Overview+selection, Edit-session, Settings, modals/sheets.
//
// HOW AN ACTION IS WRITTEN
//   markup:  <button data-action="open-session" data-arg="s_123">…</button>
//   here:    'open-session': (arg, el, e) => requestOpenSession(arg)
// `arg` is the data-arg string (or ''); `el` is the [data-action] element; `e` is
// the raw event (use e.stopPropagation() where a parent also has an action).

// The action registry. Filled in screen-by-screen across the v25 migration.
const ACTIONS = {};

// Register a batch of actions. Later registrations override earlier ones for the
// same key (we never rely on that, but it keeps registration order-independent).
function registerActions(map) {
  Object.keys(map).forEach(k => { ACTIONS[k] = map[k]; });
}

// The single delegated click handler. Attached once to #app by initDelegation().
function handleDelegatedClick(e) {
  // Find the nearest ancestor (including the target) that carries data-action.
  // v25 hotfix: start from e.target, but it can be a TEXT NODE (a tap landing on
  // the button's label text). Text nodes have no .dataset and, in some engines,
  // no .parentElement — only .parentNode. Walk via parentNode and skip any node
  // that isn't an element (nodeType 1) so the search reaches the real button.
  let el = e.target;
  while (el && el !== document.body) {
    if (el.nodeType === 1 && el.dataset && el.dataset.action) break;
    el = el.parentNode;
  }
  if (!el || el.nodeType !== 1 || !el.dataset || !el.dataset.action) return;
  const name = el.dataset.action;
  const fn = ACTIONS[name];
  if (!fn) return;            // unknown action → ignore (old direct binding, if any, still ran)
  const arg = el.dataset.arg !== undefined ? el.dataset.arg : '';
  fn(arg, el, e);
}

// ---------------------------------------------------------------------------
// v28 (E3-tail): the INPUT and CHANGE half of delegation.
//
// v25 delegated CLICK. v28 finishes the job by delegating the stateful field
// handlers too — the oninput / onchange writes that used to be re-attached on
// every render by bindEvents(). Same idea, two more listeners on #app:
//   • `input`  events → INPUT_ACTIONS, routed by data-input-action
//   • `change` events → CHANGE_ACTIONS, routed by data-change-action
// Both bubble, so one listener each on #app catches every field, and (like the
// click system) controls can't lose their wiring on render.
//
// Handlers receive (value, el, e): `value` is el.value for text/select, or
// el.checked for checkboxes — resolved here so handlers don't each repeat it.
//
// NOT migrated (deliberately, Q2=A): the four focus-sensitive fields
// (f-location, f-type, nf-client, nf-site). Their oninput/onfocus/onblur use
// focus-clears-field, casing-on-blur, SQP-row rebuild, and the
// onmousedown→preventDefault suggestion-tap trick — timing that focus/blur
// delegation would put at risk. Those stay as direct binds in bindFocusFields()
// (events.js). Pure value-writes and side-effecting toggles/selects live here.

const INPUT_ACTIONS = {};
const CHANGE_ACTIONS = {};

function registerInputActions(map) {
  Object.keys(map).forEach(k => { INPUT_ACTIONS[k] = map[k]; });
}
function registerChangeActions(map) {
  Object.keys(map).forEach(k => { CHANGE_ACTIONS[k] = map[k]; });
}

// Resolve the value a handler cares about: checkbox/radio → checked, else value.
function _fieldValue(el) {
  if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
  return el.value;
}

function handleDelegatedInput(e) {
  const el = e.target;
  if (!el || el.nodeType !== 1 || !el.dataset || !el.dataset.inputAction) return;
  const fn = INPUT_ACTIONS[el.dataset.inputAction];
  if (!fn) return;
  fn(_fieldValue(el), el, e);
}

function handleDelegatedChange(e) {
  const el = e.target;
  if (!el || el.nodeType !== 1 || !el.dataset || !el.dataset.changeAction) return;
  const fn = CHANGE_ACTIONS[el.dataset.changeAction];
  if (!fn) return;
  fn(_fieldValue(el), el, e);
}

let _delegationInited = false;
function initDelegation() {
  if (_delegationInited) return;       // idempotent — attach exactly once
  const app = document.getElementById('app');
  if (!app) return;
  app.addEventListener('click', handleDelegatedClick);
  app.addEventListener('input', handleDelegatedInput);    // v28 (E3-tail)
  app.addEventListener('change', handleDelegatedChange);  // v28 (E3-tail)
  _delegationInited = true;
}

// ---------------------------------------------------------------------------
// STEP 1 — Sessions list (the Sessions screen + its list area)
// Migrated from bindEvents() and bindSessionsListAreaEvents(). These are all
// pure click actions; the sort/status/lock <select> onchange handlers stay in
// bindSessionsListAreaEvents() (they're change events, out of v25 scope).
// ---------------------------------------------------------------------------
registerActions({
  // Sessions screen header / new-session form (click parts only).
  'open-settings': () => { state.settingsCategory = null; state.settingsSearchQuery = ''; setView('settings'); },
  'new-session': () => {
    state.newForm.show = true;
    state.newFormError = '';
    if (!state.newForm.engineer && state.engineer) state.newForm.engineer = state.engineer;
    state.nfSuggestions = []; state.showNfSuggestions = false; state.nfActiveField = null;
    render();
  },

  // Import flow buttons.
  'import-session': () => { const inp = document.getElementById('import-session-file'); if (inp) inp.click(); },

  // Sessions list area — row open / per-card export / per-card delete.
  'open-session': (arg, el) => {
    if (el.dataset.openAt !== undefined && el.dataset.openAt !== '') {
      requestOpenSession(arg, { cursor: parseInt(el.dataset.openAt, 10) });
    } else {
      requestOpenSession(arg);
    }
  },
  'export-session': (arg, el, e) => {
    e.stopPropagation();
    const s = state.sessions.find(x => x.id === arg);
    if (s) shareOrDownloadCSV(s);
  },
  'delete-session': (arg, el, e) => {
    e.stopPropagation();
    const s = state.sessions.find(x => x.id === arg);
    if (s && confirm(`Delete "${s.site || s.name}"? This cannot be undone.`)) deleteSession(arg);
  },
  'clear-session-filters': () => {
    state.sessionFilter = 'all';
    state.lockFilter = 'all';
    save();
    refreshSessionsListAreaOnly();
  },
  'bulk-export-unexported': () => bulkExportUnexported()
});

// ---------------------------------------------------------------------------
// STEP 2 — Entry screen (nav, log buttons, quick-pick, notes toggle, the fail
// sheet, the Multi Pick sheet, and the New Session form's Cancel/Start). All
// click actions. The form's text-field oninput/focus/blur handlers stay in
// bindEvents() (change/input — out of v25 scope).
// ---------------------------------------------------------------------------
registerActions({
  // Top-nav
  'go-sessions': () => setView('sessions'),
  'go-overview': () => setView('overview'),

  // New Session form (click parts). Start reads the field values at click time,
  // exactly as the old #nf-submit handler did.
  'nf-cancel': () => {
    state.newForm = { name: '', site: '', engineer: state.engineer, prefix: '', startNo: '1', show: false, clientId: '', siteId: '' };
    state.newFormError = '';
    state.nfSuggestions = []; state.showNfSuggestions = false; state.nfActiveField = null;
    render();
  },
  'nf-submit': () => {
    const $ = id => document.getElementById(id);
    state.newForm.clientId = $('nf-client') ? $('nf-client').value : '';
    state.newForm.site = $('nf-site') ? $('nf-site').value : '';
    state.newForm.engineer = $('nf-engineer').value;
    state.newForm.name = $('nf-name').value;
    state.newForm.prefix = $('nf-prefix').value;
    state.newForm.startNo = $('nf-start').value;
    createSession();
  },

  // Quick-pick item-type buttons. data-arg carries the type.
  'quick-pick': (arg, el) => {
    state.form.itemType = arg;
    const inp = document.getElementById('f-type');
    if (inp) inp.value = arg;
    document.querySelectorAll('.quick-btn').forEach(x => x.classList.toggle('active', x === el));
    state.showSuggestions = false;
    renderSuggestionsOnly();
  },

  // Notes toggle
  'show-notes': () => { state.form.showNotes = true; render(); document.getElementById('f-notes')?.focus(); },

  // Log actions
  'log-pass': () => passClicked(),
  'log-fail': () => failClicked(),
  'copy-last': () => copyLastResult(),
  'cursor-prev': () => moveCursor(-1),
  'cursor-next': () => moveCursor(1),
  'skip-new': () => skipToNew(),
  'delete-current-item': () => { if (confirm('Are you sure you want to delete this item?\n\nThis cannot be undone.')) deleteItem(state.cursor); },

  // Lock banner shortcut
  'unlock-session': () => unlockActiveSession(),

  // Fail sheet
  'fail-reason': (arg) => pickFailReason(arg),
  'fail-other': () => { state.failModalStage = 'other'; render(); document.getElementById('fail-other-input')?.focus(); },
  'fail-other-back': () => { state.failModalStage = 'reasons'; state.failOtherText = ''; render(); },
  'fail-other-save': () => { const reason = state.failOtherText.trim(); pickFailReason(reason || null); },
  'fail-cancel': () => cancelFailModal(),

  // Multi Pick sheet
  'multipick-open': () => { const sess = activeSession(); if (sess && sess.locked) return; state.multiPickSheetOpen = true; render(); },
  'multipick-fire': (arg) => multiPickFire(parseInt(arg, 10)),
  'multipick-close': () => { state.multiPickSheetOpen = false; render(); }
});

// ---------------------------------------------------------------------------
// STEP 3 — Overview screen: header, selection mode, the bulk-edit menu and its
// four sub-dialogs (location / type / notes / delete), and the overview body
// rows (jump / delete-item / row-toggle / checkbox). All clicks. The dialogs'
// text inputs + the notes-mode radios stay as direct binds (input/change).
//
// Note on row resolution: the 🗑 delete cell and the checkbox both sit INSIDE
// the row's [data-action="row-toggle"]. Nearest-ancestor resolution means a tap
// on 🗑 fires delete-item (not row-toggle), so the old stopPropagation is no
// longer needed. The checkbox's own state change is handled by its direct
// onchange (out of scope); but a CLICK on it would bubble to row-toggle and
// double-toggle — so row-toggle ignores clicks whose original target is an INPUT,
// exactly as the old handler did.
// ---------------------------------------------------------------------------
registerActions({
  // Header. #back-btn is shared with the Settings hub — disambiguate by view,
  // exactly as the old handler did.
  'overview-back': () => {
    if (state.view === 'overview') setView('entry');
    else if (state.view === 'settings') setView('sessions');
  },
  'export-current': () => { const s = activeSession(); if (s) shareOrDownloadCSV(s); },
  'edit-session': () => startEditSession(),
  'enter-selection': () => enterSelectionMode(),
  'cancel-selection': () => { exitSelectionMode(); render(); },
  'select-all-visible': () => selectAllVisible(),
  'clear-selection': () => clearSelection(),

  // Bulk-edit menu
  'bulk-menu-open': () => openBulkEditMenu(),
  'bulk-menu-close': () => closeBulkEditMenu(),
  'bulk-edit-mode': (arg) => {
    if (arg === 'delete') {
      state.bulkEdit.menuOpen = false;
      applyBulkDelete();
    } else {
      openBulkEditDialog(arg);
    }
  },

  // Bulk Location / Type / Notes dialogs (click parts)
  'bulk-cancel': () => cancelBulkEditDialog(),
  'bulk-location-apply': () => applyBulkLocation(),
  'bulk-type-apply': () => applyBulkType(),
  'bulk-type-quick': (arg) => {
    state.bulkEdit.typeValue = arg;
    const inp = document.getElementById('bulk-type-input');
    if (inp) inp.value = arg;
  },
  'bulk-notes-apply': () => applyBulkNotes(),

  // Overview body rows
  'jump-to-item': (arg) => jumpTo(parseInt(arg, 10)),
  'delete-item': (arg) => { if (confirm('Are you sure you want to delete this item?\n\nThis cannot be undone.')) deleteItem(parseInt(arg, 10)); },
  'row-toggle': (arg, el, e) => {
    if (e.target && e.target.tagName === 'INPUT') return;   // checkbox handles itself
    toggleSelected(parseInt(arg, 10));
    refreshOverviewSelection();
  }
});

// ---------------------------------------------------------------------------
// STEP 4 — Edit-session screen. Cancel (×2) and Save. Save reads the form field
// values at click time, exactly as the old #ef-save handler did. The ef-* field
// oninput/onchange handlers stay in bindEvents().
// ---------------------------------------------------------------------------
registerActions({
  'edit-cancel': () => setView('overview'),
  'edit-save': () => {
    const $ = id => document.getElementById(id);
    state.editForm.site = $('ef-site').value;
    state.editForm.engineer = $('ef-engineer').value;
    state.editForm.name = $('ef-name').value;
    state.editForm.date = $('ef-date').value;
    state.editForm.prefix = $('ef-prefix').value;
    state.editForm.locked = $('ef-locked') ? $('ef-locked').checked : false;   // v8
    saveSessionEdits();
  }
});

// ---------------------------------------------------------------------------
// STEP 5+6 — Settings pages, cross-cutting modals/banners, and the Clients &
// Sites page. All remaining CLICK handlers. Stateful inputs/toggles/selects
// (oninput/onchange) and the focus-sensitive suggestion dropdowns
// (data-suggest / data-loc-suggest / data-nf-*-suggest, which rely on
// onmousedown→preventDefault to beat input blur) stay as direct binds.
// ---------------------------------------------------------------------------
registerActions({
  // Update banner (present on any view)
  'update-refresh': () => applyUpdate(),
  'update-dismiss': () => dismissUpdateBanner(),

  // Settings hub + sub-page nav. data-page carries the target view.
  'settings-page': (arg) => setView(arg),
  // v32: open a category sub-list from the hub.
  'settings-category': (arg) => { state.settingsCategory = arg; setView('settingsCategory'); },
  // v32: back from a setting page returns to its category (if opened from one),
  // back from a category returns to the hub. setView is also used directly when
  // jumping to a page from a flat search result (settingsCategory stays null →
  // back goes to the hub, which is correct: there's no category context).
  'back-to-settings': () => {
    if (state.view === 'settingsCategory') {
      state.settingsCategory = null;
      setView('settings');
    } else if (state.settingsCategory) {
      setView('settingsCategory');
    } else {
      setView('settings');
    }
  },

  // v30: Reports hub nav + actions. open-reports is defence-checked against the
  // master switch (the button is already hidden when off, this is a backstop).
  'open-reports': () => { if (state.reportSettings.enabled) setView('reports'); else setView('settings'); },
  'settings-report-save': () => saveReportSettingsForm(),
  'report-logo-pick': () => { const inp = document.getElementById('report-logo-file'); if (inp) inp.click(); },
  'report-logo-remove': () => {
    state.reportSettings.logo = '';
    state.reportSettingsError = '';
    saveReportSettings();
    render();
  },
  'produce-report': (arg) => produceReport(arg),

  // v31: PDF filename token chip — inserts {site}/{client}/{date}/{engineer}.
  'report-filename-token': (arg) => insertReportFilenameToken(arg),

  // v31: Export/Import Setup (on the Backup page).
  'setup-share': () => startShareSetup(),
  'setup-include-toggle-open': () => toggleSetupIncludeOpen(),
  'setup-import': () => { const f = document.getElementById('setup-import-file'); if (f) f.click(); },

  // Sub-page Save / Reset buttons
  'settings-user-save': () => saveUserSettings(),
  'settings-items-save': () => saveItemTypesSettings(),
  'settings-fails-save': () => saveFailReasonsSettings(),
  'settings-descriptions-save': () => saveDescriptionsSettings(),
  'settings-multipick-save': () => saveMultiPickSettings(),
  'settings-items-reset': () => resetItemsToDefaults(),
  'settings-fails-reset': () => resetFailReasonsToDefaults(),
  'settings-descriptions-reset': () => resetDescriptionsToDefaults(),
  'settings-csv-save': () => saveCsvColumnsSettings(),
  'settings-csv-reset': () => resetCsvColumnsSettings(),

  // Smart Quick Pick buttons (confirm before acting)
  'sqp-rebuild': () => {
    if (!confirm('Rebuild Smart Quick Pick history from all your current sessions?\n\nThis replaces the learned history with a fresh scan of your data.')) return;
    rebuildSqpHistory();
  },
  'sqp-clear': () => {
    if (!confirm('Clear all Smart Quick Pick history?\n\nThe buttons will go back to their normal order until it learns again. Re-enabling the feature rebuilds the history from your data.')) return;
    clearSqpHistory();
  },

  // Preset management
  'preset-new': () => { state.presetDialog = { mode: 'new', name: '', editingId: null }; render(); },
  'preset-rename': () => { const p = activePreset(); if (!p) return; state.presetDialog = { mode: 'rename', name: p.name, editingId: p.id }; render(); },
  'preset-delete': () => {
    const p = activePreset();
    if (!p) return;
    if (state.itemPresets.length <= 1) { alert('You must have at least one preset.'); return; }
    if (!confirm(`Delete preset "${p.name}"?\n\nThe items in this preset will be lost. Other presets are not affected.`)) return;
    deletePreset(p.id);
    render();
  },
  'preset-dialog-cancel': () => { state.presetDialog = { mode: null, name: '', editingId: null }; render(); },
  'preset-dialog-confirm': () => {
    const name = (state.presetDialog.name || '').trim();
    if (!name) { alert('Name cannot be empty.'); return; }
    if (state.presetDialog.mode === 'new') createPreset(name);
    else if (state.presetDialog.mode === 'rename' && state.presetDialog.editingId) renamePreset(state.presetDialog.editingId, name);
    state.presetDialog = { mode: null, name: '', editingId: null };
    render();
  },

  // First-launch migration prompt
  'migration-confirm': () => confirmMigrationPrompt(),

  // Theme (data-set-theme carries the value)
  'set-theme': (arg) => setTheme(arg),

  // Backup & Restore + prune + about
  'backup-export': () => downloadBackup(),
  'prune-review': () => pruneOldSessions(),
  'prune-age-save': () => savePruneAge(),
  'backup-import': () => { const f = document.getElementById('backup-import-file'); if (f) f.click(); },
  'about-reload': () => { if (confirm('Reload the app? Your data is safe — only the app itself reloads.')) window.location.reload(); },

  // Backup reminder banner
  'backup-banner-export': () => { downloadBackup(); render(); },
  'backup-banner-later': () => { snoozeBackupReminder(); render(); },
  'backup-banner-dismiss': () => { snoozeBackupReminder(); render(); },

  // Welcome + reopen-warning modals
  'welcome-dismiss': () => dismissV32Welcome(),
  'reopen-continue': () => confirmReopenWarning(),
  'reopen-cancel': () => cancelReopenWarning(),

  // Import conflict / summary dialogs
  'import-conflict-cancel': () => cancelImportConflict(),
  'import-conflict-duplicate': () => {
    const pending = state.importDialog.pendingSession;
    const skipped = (state.importDialog.summary && state.importDialog.summary.skipped) || [];
    if (pending) commitImportedSession(pending, 'duplicate', skipped);
  },
  'import-conflict-merge': () => {
    const pending = state.importDialog.pendingSession;
    const skipped = (state.importDialog.summary && state.importDialog.summary.skipped) || [];
    if (pending) commitImportedSession(pending, 'merge', skipped);
  },
  'import-summary-done': () => closeImportSummary(),

  // CSV column reorder (data-arg carries the column id)
  'csv-up': (arg) => moveCsvColumn(arg, -1),
  'csv-down': (arg) => moveCsvColumn(arg, +1),

  // Clients & Sites page
  'client-add': () => {
    state.clientsPage.clientDialog = { mode: 'add', name: '', editingId: null };
    state.clientsPage.siteDialog = { mode: null, name: '', editingId: null, clientId: null };
    render();
  },
  'clients-rebuild': () => {
    if (!confirm('Scan all your sessions and add any clients and sites that aren\'t already listed? Nothing already here will be changed or removed.')) return;
    const added = rebuildClientsFromSessions();
    render();
    setTimeout(() => alert(
      added === 0
        ? 'Nothing new to add — every client and site from your sessions is already listed.'
        : `Added ${added} new ${added === 1 ? 'entry' : 'entries'} from your sessions.`
    ), 50);
  },
  'client-toggle': (arg) => {
    state.clientsPage.expandedClientId = state.clientsPage.expandedClientId === arg ? null : arg;
    render();
  },
  'client-rename': (arg) => {
    const c = clientById(arg);
    if (!c) return;
    state.clientsPage.clientDialog = { mode: 'rename', name: c.name, editingId: c.id };
    state.clientsPage.siteDialog = { mode: null, name: '', editingId: null, clientId: null };
    render();
  },
  'client-delete': (arg) => deleteClient(arg),
  'site-add': (arg) => {
    state.clientsPage.siteDialog = { mode: 'add', name: '', editingId: null, clientId: arg };
    state.clientsPage.clientDialog = { mode: null, name: '', editingId: null };
    render();
  },
  'site-rename': (arg) => {
    const s = siteById(arg);
    if (!s) return;
    state.clientsPage.siteDialog = { mode: 'rename', name: s.name, editingId: s.id, clientId: s.clientId };
    state.clientsPage.clientDialog = { mode: null, name: '', editingId: null };
    render();
  },
  'site-delete': (arg) => deleteSite(arg),
  // v26 (Q3=B): assign/move a site to a client.
  'site-assign': (arg) => openSiteAssignDialog(arg),
  'site-assign-confirm': () => {
    const inp = document.getElementById('assign-dialog-input');
    state.clientsPage.assignDialog.name = inp ? inp.value : '';
    commitSiteAssign();
  },
  'site-assign-merge': () => resolveAssignMerge(),
  'site-assign-keepboth': () => resolveAssignKeepBoth(),
  'site-assign-cancel': () => cancelSiteAssignDialog(),
  'client-dialog-confirm': () => {
    if (state.clientsPage.clientDialog.mode === 'add') addClientFromDialog();
    else renameClientFromDialog();
  },
  'client-dialog-cancel': () => { state.clientsPage.clientDialog = { mode: null, name: '', editingId: null }; render(); },
  'site-dialog-confirm': () => {
    if (state.clientsPage.siteDialog.mode === 'add') addSiteFromDialog();
    else renameSiteFromDialog();
  },
  'site-dialog-cancel': () => { state.clientsPage.siteDialog = { mode: null, name: '', editingId: null, clientId: null }; render(); }
});

// ===========================================================================
// v28 (E3-tail) — INPUT actions (oninput → data-input-action)
// All migrated verbatim from bindEvents(). These are simple value-writes plus a
// handful that refresh a partial area. The four focus-sensitive fields are NOT
// here (see bindFocusFields() in events.js).
// ===========================================================================
registerInputActions({
  // New Session form — plain field writes
  'nf-name': (v) => { state.newForm.name = v; },
  'nf-prefix': (v) => { state.newForm.prefix = v; },
  'nf-start': (v) => { state.newForm.startNo = v; },

  // Migration prompt (first launch)
  'migration-name': (v) => { state.migrationPrompt.name = v; },

  // Sessions list search — partial refresh so focus is preserved
  'sessions-search': (v) => {
    state.sessionsSearchQuery = v;
    refreshSessionsListAreaOnly();
  },

  // v32: Settings hub search — partial refresh so the search box keeps focus
  'settings-search': (v) => {
    state.settingsSearchQuery = v;
    refreshSettingsHubBodyOnly();
  },

  // Entry screen
  'f-asset': (v) => { state.form.assetNo = v; },
  'f-notes': (v) => { state.form.notes = v; },

  // Fail sheet — "other" reason free text
  'fail-other': (v) => { state.failOtherText = v; },

  // Overview search — partial refresh
  'overview-search': (v) => {
    state.searchQuery = v;
    refreshOverviewBody();
  },

  // Bulk-edit dialogs
  'bulk-location': (v) => { state.bulkLocationValue = v; },
  'bulk-type': (v) => { state.bulkEdit.typeValue = v; },
  'bulk-notes': (v) => { state.bulkEdit.notesValue = v; },

  // Edit-session form
  'ef-site': (v) => { state.editForm.site = v; },
  'ef-engineer': (v) => { state.editForm.engineer = v; },
  'ef-name': (v) => { state.editForm.name = v; },
  'ef-date': (v) => { state.editForm.date = v; },
  'ef-prefix': (v) => { state.editForm.prefix = v; },

  // Settings dialogs
  'preset-name': (v) => { state.presetDialog.name = v; },
  'client-name': (v) => { state.clientsPage.clientDialog.name = v; },
  'site-name': (v) => { state.clientsPage.siteDialog.name = v; }
});

// ===========================================================================
// v28 (E3-tail) — CHANGE actions (onchange → data-change-action)
// Toggles, selects and radios. Several re-render to refresh sub-text or the
// affected area, exactly as the old direct handlers did. Includes the three
// sessions-list <select>s and the overview checkbox that previously lived in
// render-core.js (bindSessionsListAreaEvents / bindOverviewBodyEvents).
// ===========================================================================
registerChangeActions({
  // Sessions list area — sort / status / lock filters (were in render-core.js).
  // Each persists and refreshes just the list area.
  'sessions-sort': (v) => { state.sort = v; save(); refreshSessionsListAreaOnly(); },
  'status-filter': (v) => { state.sessionFilter = v; save(); refreshSessionsListAreaOnly(); },
  'lock-filter': (v) => { state.lockFilter = v; save(); refreshSessionsListAreaOnly(); },

  // Import / backup file pickers (the change fires when a file is chosen)
  'import-file': (v, el) => {
    const file = el.files && el.files[0];
    handleImportFile(file);
    el.value = '';   // reset so re-picking the same file fires again
  },
  'backup-import-file': (v, el) => {
    const file = el.files && el.files[0];
    restoreBackupFromFile(file);
    el.value = '';
  },

  // v31: Export/Import Setup. The include toggles update in-memory (no full
  // re-render needed — the checkbox shows its own state). The import file picker
  // reads a setup bundle and applies config-only sections.
  'setup-include-toggle': (checked, el) => { setSetupInclude(el.dataset.arg, checked); },
  'setup-import-file': (v, el) => {
    const file = el.files && el.files[0];
    importSetupFromFile(file);
    el.value = '';
  },

  // Overview — fails-only toggle + the per-row selection checkbox
  // (checkbox was in render-core.js bindOverviewBodyEvents).
  'fails-only': (checked) => { state.showFailsOnly = checked; refreshOverviewBody(); },
  'row-select': (checked, el) => {
    toggleSelected(parseInt(el.dataset.arg, 10));
    refreshOverviewSelection();
  },

  // Bulk-notes mode radios — update the textarea placeholder live
  'bulk-notes-mode': (v, el) => {
    state.bulkEdit.notesMode = el.value === 'append' ? 'append' : 'replace';
    const ta = document.getElementById('bulk-notes-input');
    if (ta) ta.placeholder = state.bulkEdit.notesMode === 'append'
      ? 'Text to append'
      : 'New notes (leave empty to clear)';
  },

  // Edit-session locked checkbox
  'ef-locked': (checked) => { state.editForm.locked = checked; },

  // Display settings toggles — each re-renders to refresh its On/Off sub-text
  'haptics': (checked) => { setHaptics(checked); render(); },
  'sound': (checked) => { setSound(checked); render(); },
  'timestamps': (checked) => { setTimestamps(checked); render(); },

  // Multi Pick enabled — live sub-text update (no full render, matches old)
  'multipick-enabled': (checked) => {
    const sub = document.getElementById('multipick-enabled-sub');
    if (sub) sub.textContent = checked ? 'On' : 'Off';
  },

  // Smart Quick Pick on/off
  'sqp-toggle': (checked) => setSqp(checked),

  // v30: Report Settings toggles. The master switch and logo persist instantly
  // (the master gates other screens; logo is a discrete pick). The rest update
  // in-memory and re-render so dependent UI (retest-months enable, "Passes only"
  // sub-text) reflects immediately; they commit to storage on Save. Re-rendering
  // preserves unsaved text inputs because saveReportSettingsForm reads the DOM —
  // but a toggle re-render would DISCARD unsaved text fields, so for the
  // non-instant toggles we capture the current text inputs into state first.
  'report-enabled': (checked) => {
    captureReportTextInputs();
    state.reportSettings.enabled = checked;
    saveReportSettings();   // instant — gates Reports button on other screens
    render();
  },
  'report-show-engineer':    (checked) => { captureReportTextInputs(); state.reportSettings.showEngineer = checked; render(); },
  'report-show-instrument':  (checked) => { captureReportTextInputs(); state.reportSettings.showInstrument = checked; render(); },
  'report-show-calibration': (checked) => { captureReportTextInputs(); state.reportSettings.showCalibration = checked; render(); },
  'report-show-fails':       (checked) => { captureReportTextInputs(); state.reportSettings.showFails = checked; render(); },
  'report-declaration':      (checked) => { captureReportTextInputs(); state.reportSettings.declaration = checked; render(); },
  'report-retest-enabled':   (checked) => { captureReportTextInputs(); state.reportSettings.retestEnabled = checked; render(); },
  'report-logo-file': (v, el) => {
    const file = el.files && el.files[0];
    el.value = '';
    handleReportLogoFile(file);
  },

  // Resistance calculator selects — re-render to update the result/formula
  'calc-csa': (v) => { state.calcCsa = v; render(); },
  'calc-length': (v) => { state.calcLength = Number(v); render(); },

  // Quick Pick preset switcher — confirm-on-switch guard (was the big handler).
  'preset-switch': (v, el) => {
    const newId = v;
    const currentP = activePreset();
    const ta = document.getElementById('settings-types');
    if (ta && currentP) {
      const storedItems = (currentP.items || []).join('\n');
      const taValueNorm = ta.value.replace(/\s+$/, '');
      const storedNorm = storedItems.replace(/\s+$/, '');
      if (taValueNorm !== storedNorm) {
        const ok = confirm(
          `You have unsaved changes to "${currentP.name}".\n\n` +
          `Switch presets and discard the changes?`
        );
        if (!ok) {
          el.value = state.activePresetId;   // revert dropdown to still-active preset
          return;
        }
      }
    }
    switchPreset(newId);
  }
});
