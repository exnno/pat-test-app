/*!
 * PAT Test PWA — state.js (global application state)
 * v22 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 *
 * The single global `state` object — the in-memory shape of everything the
 * app holds at runtime. Mutated in place by feature code; never reassigned.
 * Loaded after config.js (its defaults seed several fields here).
 */

// ---------- State ----------
let state = {
  sessions: [],
  activeId: null,
  // v9: itemTypes is now derived — see activeItems(). Held in state for read-only
  // convenience by render code; never written to directly. Always sync via
  // syncItemTypesFromActivePreset() after preset edits or switches.
  itemTypes: DEFAULT_ITEM_TYPES.slice(),
  failReasons: DEFAULT_FAIL_REASONS.slice(),
  engineer: '',
  descriptions: [],
  sort: 'date_desc',
  // v15: Sessions-list filters (persisted). Both combine with Sort + each other.
  sessionFilter: 'all',   // 'all' | 'unexported' | 'exported' | 'modified'
  lockFilter: 'all',      // 'all' | 'unlocked' | 'locked'
  view: 'sessions',
  cursor: 0,
  form: { assetNo: '', location: '', itemType: '', notes: '', showNotes: false },
  newForm: { name: '', site: '', engineer: '', prefix: '', startNo: '1', show: false, clientId: '', siteId: '' },
  editForm: { name: '', site: '', engineer: '', prefix: '', date: '', locked: false },
  suggestions: [],
  showSuggestions: false,
  failModalOpen: false,
  failModalStage: 'reasons',
  failOtherText: '',
  showFailsOnly: false,
  searchQuery: '',
  // v7
  theme: 'system',                  // 'system' | 'light' | 'dark'
  hapticsEnabled: true,
  selectionMode: false,
  selectedIndices: [],              // absolute indices into sess.items
  bulkLocationDialogOpen: false,
  bulkLocationValue: '',
  updateAvailable: false,
  pendingWorker: null,              // SW that's installed and waiting
  // v8
  calcCsa: '0.75',                  // matches pat-testing-training.net default
  calcLength: 0.75,
  // v9: quick-pick presets — items only.
  // itemPresets: array of { id, name, items: [up to 9 strings] }
  // activePresetId: id of the currently selected preset
  // Selection sticks globally — changing it affects all sessions immediately.
  itemPresets: [],
  activePresetId: null,
  // v9: first-launch prompt. When migrating from v8 with a non-empty existing
  // itemTypes list, we ask the user to name the preset their existing list will
  // become. Set in load() and shown via a modal that blocks the UI.
  migrationPrompt: { show: false, name: '', items: [] },
  // v9: presets management dialog state (rename / new)
  presetDialog: { mode: null, name: '', editingId: null },   // mode: 'new' | 'rename'
  // v10: sessions list search — separate from overview's per-session searchQuery.
  // Matches against session-level fields (site, name, engineer, date) AND
  // item-level fields (assetNo, location, itemType, notes) within each session.
  // A session passes the filter if any field matches. Tapping a session that
  // only matched at the item level jumps straight to the first matched item.
  sessionsSearchQuery: '',
  // v10: per-session location autocomplete on the entry screen. Mirrors the
  // item-type suggestions pattern (state.suggestions / state.showSuggestions)
  // but the source is the active session's existing item locations only —
  // nothing is persisted globally or shared between sessions.
  locationSuggestions: [],
  showLocationSuggestions: false,
  // v20: New Session form Client / Site autocomplete. Replaces the v19 native
  // <datalist> pickers (unreliable on iOS PWA — often showed nothing). Mirrors
  // the entry-screen location pattern: a tappable .suggestions list under the
  // active field, filtered live as the user types. `nfActiveField` tracks which
  // of the two fields the list currently belongs to so the two never collide.
  nfSuggestions: [],
  showNfSuggestions: false,
  nfActiveField: null,              // 'client' | 'site' | null
  // v10: CSV import — file-pick → parse → optional conflict prompt → optional
  // summary. The two dialogs share this state object. Only one is open at a
  // time; the conflict dialog (if shown) precedes the summary dialog.
  importDialog: {
    conflictOpen: false,
    summaryOpen: false,
    pendingSession: null,         // parsed session awaiting conflict resolution
    conflictExistingId: null,     // id of the existing session that clashed
    summary: null                 // { mode, sessionName, itemCount, skipped: [{row, reason}] }
  },

  // ===== v11 additions =====

  // CSV column configuration. Loaded from localStorage on boot; defaults to a
  // deep copy of DEFAULT_CSV_COLUMNS when no saved config exists. The order of
  // this array IS the export order. Mutated via Settings → CSV Columns.
  csvColumns: DEFAULT_CSV_COLUMNS.map(c => ({ ...c })),

  // Backup-reminder timing. lastBackupAt is set by downloadBackup() after a
  // successful export, and on restoreBackupFromFile() (so users who've just
  // restored aren't immediately nagged). backupSnoozedUntil is set when the
  // user taps "Remind me later" or dismisses the banner.
  lastBackupAt: null,
  backupSnoozedUntil: null,

  // User Settings: tester type + calibration info. All optional, all free text
  // (dates use <input type="date"> so they're stored as ISO YYYY-MM-DD strings).
  // Persisted to localStorage and included in backups. v12: now also flow into
  // CSV exports via the four new default-hidden columns in DEFAULT_CSV_COLUMNS.
  // v13: tester field split into manufacturer + model — two inputs on User
  // Settings, combined back into a single space-separated value at CSV
  // export time (column id 'tester', header now "Test Instrument").
  testerMake: '',
  testerModel: '',
  calDate: '',
  calCertNo: '',
  calDue: '',

  // v13: First-launch welcome modal flag. Renamed from v12WelcomeSeen so the
  // modal fires once for everyone on update to V13.
  v13WelcomeSeen: false,

  // v14: welcome modal flag (key pat:v14welcome). v15: retained for load-time
  // completeness only — no longer gates anything.
  v14WelcomeSeen: false,

  // v15: welcome modal flag (key pat:v15welcome). v16: retained for load-time
  // completeness only — no longer gates anything.
  v15WelcomeSeen: false,

  // v16: welcome modal flag (key pat:v16welcome). v17: retained for load-time
  // completeness only — no longer gates anything.
  v16WelcomeSeen: false,

  // v17: welcome modal flag (key pat:v17welcome). v18: retained for load-time
  // completeness only — no longer gates anything.
  v17WelcomeSeen: false,

  // v18: welcome modal flag (key pat:v18welcome). Gates the V18 "what's new"
  // modal so v17 users see it once on update.
  v18WelcomeSeen: false,

  // v19: welcome modal flag (key pat:v19welcome). Gates the V19 "what's new"
  // modal so v18 users see it once on update.
  v19WelcomeSeen: false,
  // v20: welcome modal flag (key pat:v20welcome). Gates the V20 "what's new"
  // modal so v19 users see it once on update.
  v20WelcomeSeen: false,

  // v19: Clients & Sites. Two flat arrays kept in a parent/child relationship:
  //   clients — [{ id, name }]
  //   sites   — [{ id, clientId, name }]
  // Loaded via loadV11Settings(); seeded from existing sessions on first V19
  // load. Edited on the Settings → Clients page and auto-extended when the user
  // types a new client/site on the New Session form. Convenience data only —
  // sessions store their own `site` text snapshot, so these never retro-edit
  // saved work.
  clients: [],
  sites: [],

  // v19: Settings → Clients page UI state. expandedClientId tracks which client
  // row is open to show its sites; the *Dialog objects drive the add/rename
  // bottom-sheet flows (mode 'add'|'rename', the in-progress text, and which
  // record is being edited). All cleared on leaving the page (setView).
  clientsPage: {
    expandedClientId: null,
    clientDialog: { mode: null, name: '', editingId: null },   // 'add' | 'rename'
    siteDialog: { mode: null, name: '', editingId: null, clientId: null }
  },

  // v17: Sound feedback (opt-in audio confirmation). Default OFF. When ON, a
  // short Web Audio tone plays on pass/fail/copy alongside the haptic call.
  soundEnabled: false,

  // v17: Item timestamps. Default OFF. Gates both capture (stamping item.ts on
  // first save) and display (Overview HH:MM + CSV column output).
  timestampsEnabled: false,

  // v18: Smart Quick Pick. Default OFF. When ON, the entry-screen quick-pick
  // buttons are reordered (not added/removed) so the types most used at the
  // current Location come first. sqpHistory is the learned tally:
  //   { normalisedLocation: { itemType: count } }.
  // Loaded via loadSqpHistory(); seeded from existing sessions the first time
  // the feature is enabled (or rebuilt via the settings button).
  sqpEnabled: false,
  sqpHistory: {},
  // v20: SQP row stability. The composed quick-pick row is FROZEN per location:
  // it is recomputed only when the confirmed location changes (or a session
  // opens), never mid-logging — so logging a PASS no longer reshuffles the
  // buttons under the user's thumb. The cache holds the row computed for
  // `sqpRowKey` (the normalised location it was built for); render reuses it
  // whenever the current location still matches that key. Learning still happens
  // on every tap; the new tallies surface next time the location changes.
  sqpRowCache: null,        // array of item-type strings, or null = not yet built
  sqpRowKey: null,          // the normalised location sqpRowCache was built for

  // v16: Multi Pick config — GLOBAL (not per-preset). enabled gates the
  // entry-screen button; slots is an array of up to 6 { name, items:[strings] }.
  // Loaded/validated via loadMultiPickConfig() + normaliseMultiPickConfig().
  // Only slots with at least one item are kept (and shown).
  multiPick: { enabled: false, slots: [] },

  // v16: Multi Pick bottom-sheet open flag on the entry screen. Cleared on every
  // view transition (setView) and in loadFormForCursor(), same as failModalOpen.
  multiPickSheetOpen: false,

  // v14: prune-age threshold in months. Sessions that are both exported and
  // older than this are offered for pruning in the storage indicator. Loaded
  // from PRUNE_AGE_KEY; editable on the Backup & Restore page.
  pruneAgeMonths: PRUNE_AGE_DEFAULT,

  // v14: reopen warning. When the user opens a session that has already been
  // exported (clean or modified-since), and it's not locked/view-only, we
  // show a one-shot confirm-style modal warning that further edits mean
  // re-exporting. Holds the pending session id while the modal is up; null
  // when no warning is showing.
  exportWarnSessionId: null,

  // v12: Sessions-list search-jump highlight. Set to the cursor index by
  // openSession() when called with an explicit opts.cursor (i.e. the user
  // tapped an item-level search result). Captured + cleared during the next
  // renderEntry() so the CSS keyframe animation runs exactly once. null when
  // no flash is pending — the default state.
  searchJumpCursor: null,

  // Bulk-edit menu state. Replaces v10's single-purpose bulkLocationDialogOpen.
  //   menuOpen — true when the "Edit selected ▾" menu sheet is showing.
  //   mode     — null | 'location' | 'type' | 'notes' | 'delete'. The active
  //              sub-dialog. Only one is open at a time. 'location' preserves
  //              v10's bulkLocationValue path so we don't break that flow.
  //   typeValue, notesValue — text inputs for the type and notes sub-dialogs.
  //   notesMode — 'replace' | 'append'. Replace overwrites existing notes;
  //              append concatenates with '; ' separator (only when both old
  //              and new are non-empty; otherwise no separator).
  bulkEdit: {
    menuOpen: false,
    mode: null,
    typeValue: '',
    notesValue: '',
    notesMode: 'replace'
  }
};
