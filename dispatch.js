/*!
 * PAT Test PWA
 * v25.1 (June 2026)
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

let _delegationInited = false;
function initDelegation() {
  if (_delegationInited) return;       // idempotent — attach exactly once
  const app = document.getElementById('app');
  if (!app) return;
  app.addEventListener('click', handleDelegatedClick);
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
  'open-settings': () => setView('settings'),
  'new-session': () => {
    state.newForm.show = true;
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
  'back-to-settings': () => setView('settings'),

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
  'welcome-dismiss': () => dismissV20Welcome(),
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
