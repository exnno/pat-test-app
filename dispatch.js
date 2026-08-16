/*!
 * PATGo PWA
 * v28 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PATGo PWA — v25 — Delegated dispatch (E3) ==============
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
  // v69 (D4): the post-boot half of the v16.1 safety net.
  //
  // v16.1 wraps the FIRST render only. Every render after that happens inside an
  // action called from here, and this call used to be bare — so a throw in a view
  // renderer escaped to the browser with nothing to catch it.
  //
  // What that actually looked like, which is milder than it sounds and is why it
  // went unreported: render() builds the entire HTML string and assigns
  // #app.innerHTML in ONE statement at the end, so a throw while building leaves
  // the previous screen intact. The tap simply did nothing.
  //
  // The real damage is the mismatch. The action has usually already written
  // state.view before calling render(), so state now says 'overview' while the
  // screen still shows the entry form — and the NEXT tap runs overview actions
  // against entry-screen markup. Recovering to the Sessions list is the same
  // move v16.1 makes: a known-good screen that always renders, so state and
  // screen agree again.
  try {
    fn(arg, el, e);
  } catch (err) {
    console.error('Action "' + name + '" threw; recovering to the Sessions list.', err);
    try {
      state.multiPickSheetOpen = false;
      state.failModalOpen = false;
      state.view = 'sessions';
      render();
      if (typeof showToast === 'function') showToast('Something went wrong — back to your jobs');
    } catch (e2) {
      console.error('Recovery render also failed.', e2);
    }
  }
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
  // v61: cross-session asset history. The sheet is read-only, so open/close can
  // render() freely — there is no focused field to tear down (contrast the v60.1
  // bug sheet rule, which exists because that sheet contains a textarea).
  'asset-history-open':  (arg) => openAssetHistory(arg),
  'asset-history-close': () => closeAssetHistory(),
  'asset-history-row':   (arg) => openAssetHistoryRow(arg),

  // v62: photo evidence. The two *-pick actions just click the hidden file
  // input (same pattern as report-logo-pick); the file itself arrives through
  // the change registry below.
  'fail-photo-pick':    () => { const inp = document.getElementById('fail-photo-file'); if (inp) inp.click(); },
  'fail-photo-remove':  (arg) => removePendingPhoto(parseInt(arg, 10)),
  'photo-strip-open':   (arg) => openPhotoStrip(arg),
  'photo-strip-close':  () => closePhotoStrip(),
  'photo-strip-add':    () => { const inp = document.getElementById('photo-strip-file'); if (inp) inp.click(); },
  'photo-delete':       (arg) => deletePhotoFromStrip(arg),
  'photo-export':       () => downloadPhotoBundle(),
  'photo-import':       () => { const inp = document.getElementById('photo-import-file'); if (inp) inp.click(); },
  'photo-wipe':         () => {
    const n = photoStatsSync().count;
    openConfirmSheet({
      title: 'Delete all photos?',
      message:
        `This permanently deletes all ${n} photo${n === 1 ? '' : 's'} from this device. ` +
        `Your jobs, items and results are not affected. ` +
        `If you haven't exported them, they can't be recovered.`,
      confirmLabel: 'Delete all',
      onConfirm: () => {
        photosDeleteAll().then((removed) => {
          render();
          showToast(`Deleted ${removed} photo${removed === 1 ? '' : 's'}`);
        });
      }
    });
  },

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
  'copy-session': (arg, el, e) => {   // v37.1
    e.stopPropagation();
    const s = state.sessions.find(x => x.id === arg);
    if (s) copyCSV(s);
  },
  'delete-session': (arg, el, e) => {
    e.stopPropagation();
    const s = state.sessions.find(x => x.id === arg);
    if (!s) return;
    openConfirmSheet({
      title: 'Delete session?',
      message: `Delete "${s.site || s.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: () => deleteSession(arg)
    });
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
  'delete-current-item': () => openConfirmSheet({
    title: 'Delete item?',
    message: 'Are you sure you want to delete this item? This cannot be undone.',
    confirmLabel: 'Delete',
    onConfirm: () => deleteItem(state.cursor)
  }),

  // Lock banner shortcut
  'unlock-session': () => unlockActiveSession(),

  // Fail sheet
  'fail-reason': (arg) => pickFailReason(arg),
  // v75: focusInSheet, not a bare focus() — this field lives in the fail sheet.
  // (The 'show-notes' handler above is deliberately NOT converted: f-notes is on
  // the entry screen, not inside a sheet, so it has no fixed overlay to drag.)
  'fail-other': () => { state.failModalStage = 'other'; render(); focusInSheet(document.getElementById('fail-other-input')); },
  'fail-other-back': () => { state.failModalStage = 'reasons'; state.failOtherText = ''; render(); },
  'fail-other-save': () => { const reason = state.failOtherText.trim(); pickFailReason(reason || null); },
  'fail-cancel': () => cancelFailModal(),

  // v53: Test Readings sheet (opened from passClicked / pickFailReason when the
  // feature is on). Class selector, commit, and cancel.
  'readings-set-class': (arg) => setReadingsClass(arg),
  'readings-toggle-polarity': () => toggleReadingsPolarity(),
  'readings-commit': () => commitReadingsSheet(),
  'readings-cancel': () => cancelReadingsSheet(),

  // Multi Pick sheet
  'multipick-open': () => { const sess = activeSession(); if (sess && sess.locked) return; state.multiPickSheetOpen = true; render(); },
  'multipick-fire': (arg) => multiPickFire(parseInt(arg, 10)),
  'multipick-close': () => { state.multiPickSheetOpen = false; render(); },

  // v47: quick-pick preset switcher sheet (opened by long-press on the grid;
  // the open is in events.js via openPresetSheet, not a click action).
  'preset-sheet-close': () => closePresetSheet(),
  // v57: the list scrolls now, so a drag that scrolls it can still end in a click
  // on a row. If the gesture drifted (sheetDragMoved, events.js) it was a scroll,
  // not a tap — ignore it rather than silently switching the preset. A real tap
  // never drifts, so this is invisible in normal use.
  'preset-sheet-pick': (arg) => { if (sheetDragMoved) return; switchPresetFromSheet(arg); },
  // Shortcut to the Settings preset page. Close the sheet, then navigate to the
  // Quick Pick Items settings page (which hosts the preset dropdown/editor).
  'preset-sheet-edit': () => { state.presetSheetOpen = false; setView('settingsItems'); }
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
  'copy-current': () => { const s = activeSession(); if (s) copyCSV(s); },   // v37.1
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
  'delete-item': (arg) => openConfirmSheet({
    title: 'Delete item?',
    message: 'Are you sure you want to delete this item? This cannot be undone.',
    confirmLabel: 'Delete',
    onConfirm: () => deleteItem(parseInt(arg, 10))
  }),
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
    // v35: if we arrived at Report Settings via the preview's "Edit settings"
    // deep-link, going back returns straight to a freshly-rebuilt preview.
    if (state.reportPreviewReturnSessionId && state.view === 'settingsReport') {
      const sid = state.reportPreviewReturnSessionId;
      state.reportPreviewReturnSessionId = null;
      setView('reports');   // a sensible underlay behind the preview overlay
      // v64: async now (it may need to read photos before rebuilding the preview).
      reopenReportPreview(sid).catch(() => {});
      return;
    }
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
    // v42: preserve the wizard's company-name field across this re-render when
    // logo removal happens during first-run onboarding.
    if (!state.onboardedV33Seen && typeof captureWizardStep === 'function') captureWizardStep();
    state.reportSettings.logo = '';
    state.reportSettingsError = '';
    saveReportSettings();
    render();
  },
  'produce-report': (arg) => { produceReport(arg).catch(() => {}); },

  // v56: Retest reminders nav + chase-list actions. open-retest-reminders is
  // defence-checked against the master switch (entry points are already hidden
  // when off). The action sheet sets/clears a transient session id and re-renders.
  'open-retest-reminders': () => { if (state.retestRemindersEnabled) setView('retestReminders'); else setView('settings'); },
  'retest-action-open': (arg) => { state.retestActionSessionId = arg; render(); },
  'retest-action-close': () => { state.retestActionSessionId = null; render(); },
  'retest-mark-booked': (arg) => { retestSetContact(arg, 'booked'); state.retestActionSessionId = null; render(); },
  'retest-mark-declined': (arg) => { retestSetContact(arg, 'declined'); state.retestActionSessionId = null; render(); },
  'retest-untrack': (arg) => { retestUnflag(arg); state.retestActionSessionId = null; render(); },

  // v36: report templates (apply/rename/delete/save-new). v40: rename and
  // save-new use the in-app name sheet (openNameSheet); delete uses the confirm
  // sheet — native prompt()/confirm() are unreliable in iOS PWAs.
  'report-template-apply': (arg) => applyReportTemplate(arg),
  'report-template-rename': (arg) => {
    const tpl = (state.reportTemplates || []).find(t => t.id === arg);
    if (!tpl) return;
    openNameSheet({
      title: 'Rename template',
      blurb: 'Give this report template a name.',
      value: tpl.name,
      confirmLabel: 'Rename',
      onConfirm: (name) => {
        const clash = (state.reportTemplates || []).find(
          t => t.id !== arg && t.name.toLowerCase() === name.toLowerCase()
        );
        if (clash) {
          openConfirmSheet({
            title: 'Name already used',
            message: `Another template is already called "${clash.name}". Use this name anyway? Both will share the name.`,
            confirmLabel: 'Use it',
            danger: false,
            onConfirm: () => renameReportTemplate(arg, name)
          });
          return;
        }
        renameReportTemplate(arg, name);
      }
    });
  },
  'report-template-delete': (arg) => {
    const tpl = (state.reportTemplates || []).find(t => t.id === arg);
    if (!tpl) return;
    openConfirmSheet({
      title: 'Delete template?',
      message: `Delete the "${tpl.name}" template? This can't be undone.`,
      confirmLabel: 'Delete',
      onConfirm: () => deleteReportTemplate(arg)
    });
  },
  'report-template-save-new': () => {
    openNameSheet({
      title: 'Save as template',
      blurb: 'Save your current report settings as a named template you can re-apply later.',
      placeholder: 'e.g. Standard certificate',
      confirmLabel: 'Save',
      onConfirm: (name) => {
        const clash = (state.reportTemplates || []).find(
          t => t.name.toLowerCase() === name.toLowerCase()
        );
        if (clash) {
          openConfirmSheet({
            title: 'Overwrite template?',
            message: `A template called "${clash.name}" already exists. Overwrite it with your current report settings?`,
            confirmLabel: 'Overwrite',
            onConfirm: () => saveCurrentAsTemplate(name)
          });
          return;
        }
        saveCurrentAsTemplate(name);
      }
    });
  },

  // v35: report colour theme (preset). Sets both header + accent, persists, and
  // re-renders so the swatches + colour inputs reflect the choice. Captures text
  // inputs first so an unsaved company name/title survives the re-render.
  'report-theme': (arg) => {
    const theme = REPORT_COLOR_THEMES.find(t => t.id === arg);
    if (!theme) return;
    captureReportTextInputs();
    state.reportSettings.headerColor = theme.header;
    state.reportSettings.accentColor = theme.accent;
    saveReportSettings();
    render();
  },

  // v34: report signature (draw or upload) + position + remove + pad controls.
  'signature-upload': () => { const inp = document.getElementById('report-signature-file'); if (inp) inp.click(); },
  'signature-remove': () => removeReportSignature(),
  'signature-position': (arg) => setSignaturePosition(arg),
  'signature-draw': () => openSignaturePad(),
  'signature-pad-cancel': () => closeSignaturePad(),
  'signature-pad-clear': () => clearSignaturePad(),
  'signature-pad-save': () => saveDrawnSignature(),

  // v31: PDF filename token chip — inserts {site}/{client}/{date}/{engineer}.
  'report-filename-token': (arg) => insertReportFilenameToken(arg),

  // v31: Export/Import Setup (on the Backup page).
  'setup-share': () => startShareSetup(),
  'setup-include-toggle-open': () => toggleSetupIncludeOpen(),
  'setup-import': () => { const f = document.getElementById('setup-import-file'); if (f) f.click(); },

  // Sub-page Save / Reset buttons
  'settings-user-save': () => saveUserSettings(),

  // v66: test instruments. All CRUD lives in instruments.js; these are pure
  // routing. `instrument-clear-date` is the ONLY one that does not re-render —
  // it is a targeted DOM write, because re-rendering the editor would throw away
  // every other unsaved field on the screen (the v60.1 rule).
  'instrument-add': () => addInstrument(),
  'instrument-open': (arg) => openInstrumentEditor(arg),
  'instrument-editor-close': () => closeInstrumentEditor(),
  'instrument-save': () => saveInstrumentFromEditor(),
  'instrument-delete': (arg) => deleteInstrument(arg),
  'instrument-make-active': (arg) => setActiveInstrument(arg),
  'instrument-clear-date': (arg) => clearInstrumentDateField(arg),
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
  'sqp-rebuild': () => openConfirmSheet({
    title: 'Rebuild history?',
    message: 'Rebuild Smart Quick Pick history from all your current sessions? This replaces the learned history with a fresh scan of your data.',
    confirmLabel: 'Rebuild',
    danger: false,
    onConfirm: () => rebuildSqpHistory()
  }),
  'sqp-clear': () => openConfirmSheet({
    title: 'Clear history?',
    message: 'Clear all Smart Quick Pick history? The buttons go back to their normal order until it learns again. Re-enabling the feature rebuilds the history from your data.',
    confirmLabel: 'Clear',
    onConfirm: () => clearSqpHistory()
  }),

  // Preset management
  'preset-new': () => { state.presetDialog = { mode: 'new', name: '', editingId: null }; render(); },
  'preset-rename': () => { const p = activePreset(); if (!p) return; state.presetDialog = { mode: 'rename', name: p.name, editingId: p.id }; render(); },
  'preset-delete': () => {
    const p = activePreset();
    if (!p) return;
    if (state.itemPresets.length <= 1) { showToast('You must keep at least one preset'); return; }
    openConfirmSheet({
      title: 'Delete preset?',
      message: `Delete preset "${p.name}"? The items in this preset will be lost. Other presets are not affected.`,
      confirmLabel: 'Delete',
      onConfirm: () => { deletePreset(p.id); render(); }
    });
  },
  'preset-dialog-cancel': () => { state.presetDialog = { mode: null, name: '', editingId: null }; render(); },
  'preset-dialog-confirm': () => {
    const name = (state.presetDialog.name || '').trim();
    if (!name) { showToast('Name cannot be empty'); return; }
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
  // v69 (D5): put the pre-repair spellings back. Confirmed first — it rewrites
  // saved data, same as the repair did, and the user is choosing to reintroduce
  // strings the app considers wrong. render() runs inside undoApostropheRepair's
  // caller here rather than in the function itself, keeping storage.js free of
  // UI calls.
  'repair-undo': () => {
    const n = apostropheRepairUndoCount();
    if (!n) return;
    openConfirmSheet({
      title: 'Undo the correction?',
      message: `This puts back the original spelling of ${n} location${n === 1 ? '' : 's'} and item type${n === 1 ? '' : 's'}, including the stray capitals after apostrophes. This cannot be reversed afterwards.`,
      confirmLabel: 'Put them back',
      onConfirm: () => {
        const restored = undoApostropheRepair();
        render();
        showToast(`Restored ${restored} original spelling${restored === 1 ? '' : 's'}`);
      }
    });
  },
  'prune-review': () => pruneOldSessions(),
  'prune-age-save': () => savePruneAge(),
  'backup-import': () => { const f = document.getElementById('backup-import-file'); if (f) f.click(); },
  'about-reload': () => openConfirmSheet({
    title: 'Reload the app?',
    message: 'Your data is safe — only the app itself reloads.',
    confirmLabel: 'Reload',
    danger: false,
    onConfirm: () => window.location.reload()
  }),

  'wizard-next': () => wizardNextStep(),
  'wizard-back': () => wizardBack(),
  'wizard-skip': () => skipOnboarding(),
  'wizard-fresh': () => wizardChoosePath('fresh'),
  'wizard-import': () => { const f = document.getElementById('wizard-import-file'); if (f) f.click(); },
  'wizard-theme': (arg) => wizardPickTheme(arg),
  'wizard-finish': () => wizardFinishFresh(false),
  'wizard-finish-tour': () => wizardFinishFresh(true),
  'restart-onboarding': () => restartOnboarding(),

  // v42: feature walkthrough (full-screen tour)
  'tour-next': () => tourNext(),
  'tour-prev': () => tourPrev(),
  'tour-goto': (arg) => tourGoTo(arg),
  'tour-skip': () => closeTour(),
  'open-tour': () => openTour(),

  // v43: cloud prep pages (long-press on About title reveals these)
  'open-cloud-page': (arg) => {
    if (arg === 'account') state.view = 'cloudAccount';
    else if (arg === 'sync') state.view = 'cloudSync';
    else if (arg === 'subscription') state.view = 'cloudSubscription';
    render();
  },
  'cloud-sign-out': () => {
    state.userId = null;
    state.authToken = null;
    state.authStatus = 'logged-out';
    localStorage.removeItem(PAT_AUTH_KEY);
    state.view = 'cloudAccount';
    save();
    render();
  },
  'cloud-sync-now': () => {
    // Mock sync: just stamp lastBackupAt for now
    state.lastBackupAt = new Date().toISOString();
    save();
    render();
    showToast('Sync complete');
  },
  'cloud-upgrade': () => {
    showToast('Upgrade plans coming soon');
  },

  // v43: calibration reminder (Update button on the Sessions-screen cal banner)
  'edit-cal-date': () => {
    state.view = 'settingsUser';
    render();
  },
  'backup-banner-export': () => { downloadBackup(); render(); },
  'backup-banner-later': () => { snoozeBackupReminder(); render(); },
  'backup-banner-dismiss': () => { snoozeBackupReminder(); render(); },

  // Welcome + reopen-warning modals
  // v63: both arguments are now permanent — the fixed flag name and the derived
  // key from config.js. This line no longer changes when a welcome is rolled.
  'welcome-dismiss': () => dismissWelcome('welcomeSeen', WELCOME_KEY),

  // v60: bug report sheet (Settings -> Contact). The three setters re-render
  // (taps, no caret to lose); the two textareas are input actions below.
  'bug-open': () => openBugSheet(),
  'bug-close': () => closeBugSheet(),
  'bug-set-type': (arg) => setBugType(arg),
  'bug-set-severity': (arg) => setBugSeverity(arg),
  'bug-set-repro': (arg) => setBugRepro(arg),
  'bug-send': () => sendBugReport(),
  'bug-copy': () => copyBugReport(),
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
  'clients-rebuild': () => openConfirmSheet({
    title: 'Add from sessions?',
    message: 'Scan all your sessions and add any clients and sites that aren\'t already listed? Nothing already here will be changed or removed.',
    confirmLabel: 'Scan & add',
    danger: false,
    onConfirm: () => {
      const added = rebuildClientsFromSessions();
      render();
      showToast(added === 0
        ? 'Nothing new — all already listed'
        : `Added ${added} new ${added === 1 ? 'entry' : 'entries'}`);
    }
  }),
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

  // v53: Test Readings sheet — measurement fields (stored as-typed; no render on
  // each keystroke so the input keeps focus, same as fail-other).
  'f-reading-earth': (v) => setReadingsField('earth', v),
  'f-reading-insulation': (v) => setReadingsField('insulation', v),
  'f-reading-leakage': (v) => setReadingsField('leakage', v),

  // v60: bug report free text. No render on keystroke (same reason as the
  // readings fields and fail-other -- the textarea would lose the caret).
  // setBugField syncs the Send button's disabled state directly instead.
  'bug-desc': (v) => setBugField('description', v),
  'bug-context': (v) => setBugField('context', v),

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
  // v56: per-session retest interval. Instant-apply (not editForm draft); persists
  // via retestSetMonths which clamps 1–120 and ignores partial/invalid input, so
  // mid-typing keystrokes are safe. No re-render — that would lose focus on iOS.
  'ef-retest-months': (v) => {
    const sess = activeSession();
    if (sess) retestSetMonths(sess.id, v);
  },

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
  // v33: setup import launched from the first-run wizard. Marks onboarding
  // complete then reuses importSetupFromFile (via onboardSetupImport).
  'wizard-import-file': (v, el) => {
    const file = el.files && el.files[0];
    onboardSetupImport(file);
    el.value = '';
  },
  // v42: step-5 example-session opt-in (decision 9A). In-memory only; consumed at
  // finish on the fresh path. No re-render needed (the checkbox holds its own
  // visual state), so just record the value.
  'wizard-seed-demo': (checked) => { wizardToggleDemo(checked); },

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

  // v56: per-session retest flag (instant-apply). Flagging captures the interval
  // from the global default; unflagging clears all retest fields. Re-render so the
  // interval input + due date (or the plain toggle) appear/disappear immediately.
  // v66: the per-session instrument stamp. Draft-only — it writes editForm and
  // is committed by saveSessionEdits(), exactly like the other ef-* fields. No
  // render: it is a <select>, so the browser already shows the new choice.
  'ef-instrument': (v) => { state.editForm.instrumentId = String(v || ''); },

  'ef-retest-toggle': (checked) => {
    const sess = activeSession();
    if (!sess) return;
    if (checked) retestFlag(sess.id); else retestUnflag(sess.id);
    render();
  },

  // v56: master switch for the whole retest-reminders feature. Persists instantly.
  // When turning OFF, also reset the Sessions "Retest due" filter back to 'all' so
  // the now-hidden filter can't leave the list stuck showing nothing. Re-render so
  // the banner, filter option, per-session control and help text all update.
  'retest-reminders-toggle': (checked) => {
    state.retestRemindersEnabled = checked;
    if (!checked && state.sessionFilter === 'retestdue') state.sessionFilter = 'all';
    save();
    render();
  },

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

  // v53: Test Readings master toggle. Persists instantly (like sqp-toggle) and
  // re-renders so the on-only help text and the Fails-page tag selectors appear/
  // disappear immediately. Off = the entry screen reverts to the one-tap flow.
  'readings-toggle': (checked) => {
    state.readingsEnabled = !!checked;
    localStorage.setItem(READINGS_KEY, state.readingsEnabled ? '1' : '0');
    render();
  },

  // v65: barcode scanner master toggle. Persists instantly (same pattern as
  // sqp-toggle / readings-toggle) and re-renders so the test box and the
  // troubleshooting notes appear or disappear straight away. Turning it off also
  // drops the "Scan or type" placeholder from the entry screen's asset box.
  'scanner-toggle': (checked) => {
    state.scannerEnabled = !!checked;
    localStorage.setItem(SCANNER_KEY, state.scannerEnabled ? '1' : '0');
    render();
  },

  // v67: scanner paired mode. Persists instantly, same pattern as above, and
  // re-renders so the speed picker and the explanation appear or disappear.
  // Turning it ON is what makes the entry screen focus the asset box by itself,
  // so it also changes a screen the engineer is not currently looking at — the
  // settings copy is explicit about that.
  'scanner-paired-toggle': (checked) => {
    state.scannerPaired = !!checked;
    localStorage.setItem(SCANNER_PAIRED_KEY, state.scannerPaired ? '1' : '0');
    render();
  },

  // v67: burst speed preset. Validated against the whitelist before it is
  // stored — a value outside SCAN_GAP_PRESETS would resolve to an undefined
  // threshold and reject every scan, which is the exact silent failure this
  // release exists to remove. No re-render: the <select> already shows the new
  // value, the threshold is read fresh on the next burst, and re-rendering would
  // only cost the page its scroll position.
  'scan-speed': (value) => {
    if (!Object.prototype.hasOwnProperty.call(SCAN_GAP_PRESETS, value)) return;
    state.scanSpeed = value;
    localStorage.setItem(SCAN_SPEED_KEY, value);
    showToast('Scan speed set to ' + value + ' (' + SCAN_GAP_PRESETS[value] + 'ms)');
  },

  // v53: per-fail-reason tag selector (Quick Pick Fail page, shown only when
  // readings are on). Reads the reason text off the element's data-reason and
  // the chosen tag off its value; writes the map and persists. No re-render — the
  // <select> already shows the new value, and nothing else on the page depends
  // on it until the next fail.
  'fail-reason-tag': (value, el) => {
    const reason = el && el.dataset ? el.dataset.reason : '';
    if (!reason) return;
    if (READING_FAIL_TAGS.indexOf(value) === -1) return;
    if (!state.failReasonTags || typeof state.failReasonTags !== 'object') state.failReasonTags = {};
    state.failReasonTags[reason] = value;
    saveFailReasonTags();
  },

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
  'report-show-readings':    (checked) => { captureReportTextInputs(); state.reportSettings.showReadings = checked; render(); },
  'report-declaration':      (checked) => { captureReportTextInputs(); state.reportSettings.declaration = checked; render(); },
  'report-show-appcredit':   (checked) => { captureReportTextInputs(); state.reportSettings.showAppCredit = checked; render(); },
  'report-show-footerlogo':  (checked) => { captureReportTextInputs(); state.reportSettings.showFooterLogo = checked; render(); },
  // v61: testing time on the certificate. Opt-in — defaults off (decision Q11B).
  'report-show-duration':    (checked) => { captureReportTextInputs(); state.reportSettings.showDuration = checked; render(); },
  // v64: photographic evidence appendix. Opt-in — defaults off (decision Q6A),
  // for the same reason as showDuration: it changes a client-facing certificate.
  'report-show-photos':      (checked) => { captureReportTextInputs(); state.reportSettings.showPhotos = checked; render(); },
  'report-retest-enabled':   (checked) => { captureReportTextInputs(); state.reportSettings.retestEnabled = checked; render(); },
  // v36: certificate-numbers master toggle. Capture cert text inputs first so an
  // unsaved prefix/counter survives the re-render that enables/disables the
  // fields. Persists instantly so the Overview cert field appears/hides too.
  'report-cert-enabled': (checked) => {
    captureReportTextInputs();
    state.reportSettings.certEnabled = checked;
    saveReportSettings();
    render();
  },
  // v36: session-level fields edited on the Overview (fire on blur via change).
  'session-notes': (v, el) => { saveSessionNotes(el.dataset.arg, v); },
  'session-cert-no': (v, el) => { setSessionCertNo(el.dataset.arg, v); },
  'report-logo-file': (v, el) => {
    const file = el.files && el.files[0];
    el.value = '';
    handleReportLogoFile(file);
  },
  // v62: photo evidence. el.value is cleared immediately in both, so choosing
  // the SAME file twice in a row still fires a change event — without it, a
  // retaken photo with an identical filename would silently do nothing.
  'fail-photo-file': (v, el) => {
    const file = el.files && el.files[0];
    el.value = '';
    addPendingPhotoFromFile(file);
  },
  'photo-strip-file': (v, el) => {
    const file = el.files && el.files[0];
    el.value = '';
    addPhotoToItemFromFile(file);
  },
  'photo-import-file': (v, el) => {
    const file = el.files && el.files[0];
    el.value = '';
    importPhotosFromFile(file);
  },
  // v35: custom colour pickers. The value is the chosen hex; persist instantly
  // and re-render so the theme-chip "active" highlight updates. Capture text
  // inputs first so unsaved company name/title survive.
  'report-header-color': (v) => {
    captureReportTextInputs();
    state.reportSettings.headerColor = safeHexColor(v, REPORT_DEFAULT_HEADER_COLOR);
    saveReportSettings();
    render();
  },
  'report-accent-color': (v) => {
    captureReportTextInputs();
    state.reportSettings.accentColor = safeHexColor(v, REPORT_DEFAULT_ACCENT_COLOR);
    saveReportSettings();
    render();
  },
  'report-signature-file': (v, el) => {   // v34
    const file = el.files && el.files[0];
    el.value = '';
    handleReportSignatureFile(file);
  },

  // Resistance calculator selects — re-render to update the result/formula
  'calc-csa': (v) => { state.calcCsa = v; render(); },
  'calc-length': (v) => { state.calcLength = Number(v); render(); },

  // Quick Pick preset switcher — confirm-on-switch guard (was the big handler).
  // v41: native confirm() replaced with the in-app confirm sheet. The async
  // sheet can't revert the <select> on cancel the way the synchronous native
  // confirm did, so we revert the dropdown to the still-active preset FIRST
  // (synchronously, so it never visibly jumps), then ask. On confirm we run the
  // real switch; on cancel the dropdown is already back where it belongs.
  'preset-switch': (v, el) => {
    const newId = v;
    const currentP = activePreset();
    const ta = document.getElementById('settings-types');
    if (ta && currentP) {
      const storedItems = (currentP.items || []).join('\n');
      const taValueNorm = ta.value.replace(/\s+$/, '');
      const storedNorm = storedItems.replace(/\s+$/, '');
      if (taValueNorm !== storedNorm) {
        el.value = state.activePresetId;   // revert immediately — no visible flip
        openConfirmSheet({
          title: 'Discard unsaved changes?',
          message: `You have unsaved changes to \u201c${currentP.name}\u201d. Switch presets and discard the changes?`,
          confirmLabel: 'Discard & switch',
          onConfirm: () => switchPreset(newId)
        });
        return;
      }
    }
    switchPreset(newId);
  }
});
