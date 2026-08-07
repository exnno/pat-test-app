/*!
 * PATGo PWA — state.js (global application state)
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
  sessionFilter: 'all',   // 'all' | 'unexported' | 'exported' | 'modified' | 'retestdue' (v56)
  lockFilter: 'all',      // 'all' | 'unlocked' | 'locked'
  view: 'sessions',
  // v56: Retest reminders master switch. Loaded from RETEST_REMINDERS_KEY in
  // storage.js (OFF by default). When false, the entire feature is invisible —
  // no banner, no per-session control, no reminders view, no sessions filter.
  retestRemindersEnabled: false,
  // v56: transient id of the session whose contacted-action sheet (Booked /
  // Declined / reset) is open in the reminders view; null = no sheet. Not
  // persisted — purely view state, like other *Open flags.
  retestActionSessionId: null,
  cursor: 0,
  form: { assetNo: '', location: '', itemType: '', notes: '', showNotes: false },
  newForm: { name: '', site: '', engineer: '', prefix: '', startNo: '1', show: false, clientId: '', siteId: '' },
  // v26 (Q1=A): inline validation message for the New Session form (e.g. when
  // neither client nor site is entered). '' = no error shown.
  newFormError: '',
  // v66: instrumentId added — the per-session instrument stamp, editable here.
  editForm: { name: '', site: '', engineer: '', prefix: '', date: '', locked: false, instrumentId: '' },
  suggestions: [],
  showSuggestions: false,
  failModalOpen: false,
  failModalStage: 'reasons',
  failOtherText: '',

  // ---------- v62: photo evidence (fails only) ----------
  //
  // photoIndex / photoBytes are a DERIVED IN-MEMORY MIRROR of the IndexedDB
  // photo store — item id -> how many photos it has, plus a running byte total.
  // They exist for one reason: render() is synchronous and cannot await a
  // database, but the Overview needs to draw a 📷 count on fail rows. Rebuilt
  // from the store once at boot by photoIndexLoad() and kept in step by every
  // add and delete in photos.js.
  //
  // NEVER saved to localStorage, NEVER in a backup, NEVER validated on restore.
  // They are not a source of truth — the object store is. If they were persisted
  // they could drift out of step with the real photos, which is exactly the
  // failure the v59 stats counter avoided by recomputing its live half.
  photoIndex: {},
  photoBytes: 0,

  // Photos taken DURING the fail flow, before the item exists. The item has no
  // id until saveItem() pushes it, so these are held here as
  // { blob, w, h, bytes, url } and written to the store against the new item's
  // id the moment it is saved. `url` is a tracked object URL for the thumbnail.
  //
  // PURELY TRANSIENT. Discarded — and their object URLs revoked — if the fail
  // sheet is cancelled, because nothing was ever logged.
  pendingPhotos: [],

  // The photo strip sheet (viewing/managing an existing item's photos).
  // photoStripPhotos holds { id, url, bytes, at } once loaded async; until then
  // the sheet shows its loading state. All transient, cleared on any view change.
  photoStripOpen: false,
  photoStripItemId: '',
  photoStripPhotos: [],
  photoStripLoading: false,
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

  // ---- v66: multiple test instruments ----------------------------------
  // ⚠ THE FIVE FIELDS ABOVE ARE NOW A MIRROR, NOT THE TRUTH. `instruments` is
  // the source of truth; the flat fields are refreshed from whichever entry is
  // active by syncActiveInstrumentMirror() (instruments.js) after every change,
  // so storage.js's legacy keys, old backups, old Setup files and the first-run
  // wizard all keep working untouched. Anything that writes a flat field
  // directly MUST call adoptMirrorIntoInstruments() afterwards.
  //
  //   instruments          — [{ id, make, model, calDate, calCertNo, calDue }],
  //                          capped at INSTRUMENTS_MAX. Persisted as JSON under
  //                          INSTRUMENTS_KEY.
  //   activeInstrumentId   — the one new jobs are stamped with. Persisted.
  //   instrumentEditorId   — transient: which instrument the editor screen is
  //                          bound to. NOT persisted, and its emptiness is what
  //                          lets saveInstruments() prune abandoned blank rows.
  instruments: [],
  activeInstrumentId: '',
  instrumentEditorId: '',

  // Welcome-modal "seen" flag. v50: only the CURRENT release's flag is kept; the
  // 27 historical vNNWelcomeSeen flags (v13…v48) were removed — each was written
  // once and never read again after its release. The first-run-wizard gate that
  // used to read seven of them now detects past welcomes by scanning localStorage
  // for any 'pat:v<n>welcome' key (see hasAnyLegacyWelcomeKey in storage.js), so a
  // new install still shows the WIZARD and an upgrader still shows the MODAL —
  // unchanged behaviour.
  //
  // v63: THIS PROPERTY NAME IS NOW FIXED AND MUST NEVER BE RENAMED AGAIN. It used
  // to carry the version (`v62WelcomeSeen`), which meant state.js, storage.js,
  // dispatch.js and render-core.js all had to be edited in lockstep every release
  // — one of the six coupling points behind the V61 white screen. Which release's
  // welcome is current is now a VALUE (WELCOME_VERSION in config.js), not an
  // identifier. Renaming this back to a per-version name would reintroduce the
  // exact fault V63 exists to remove.
  welcomeSeen: false,

  // v61: cross-session asset history sheet. PURELY TRANSIENT — never saved,
  // never backed up, no storage key, no validator, no migration. The sheet is
  // read-only (it has no inputs at all), so unlike the v60.1 bug sheet it is
  // perfectly safe for it to be built by a normal render(): there is no focused
  // field for a re-render to tear down.
  //   assetHistorySheetOpen — is the sheet showing
  //   assetHistoryAsset     — the asset number whose history is being shown
  assetHistorySheetOpen: false,
  assetHistoryAsset: '',

  // v59: the ARCHIVED half of the lifetime stats counter — the tallies of
  // sessions that have been pruned or deleted, so the running total doesn't fall
  // when old jobs are cleared out. { items, fails, types:{name:count} }.
  // Persisted (PAT_STATS_KEY) and carried through backup/restore. The LIVE half
  // is never stored — it's computed from state.sessions on demand by
  // computeAppStats(), so it can't drift out of step with the actual data.
  archivedStats: makeEmptyArchivedStats(),

  // v60: the bug-report sheet on Settings → Contact. PURELY TRANSIENT — never
  // saved, never backed up, never restored. It exists only between opening the
  // sheet and sending or cancelling, so there is no storage key, no validator
  // and no migration for any of it. bugDraft holds the in-progress report
  // (type/severity/repro taps plus the two typed boxes); cacheName is filled in
  // asynchronously when the sheet opens by reading the live service-worker cache.
  bugSheetOpen: false,
  bugDraft: makeEmptyBugDraft(),
  // v46: remembered Sessions-list scroll offset. Captured (in render) when
  // leaving Sessions for a session, restored when returning to Sessions. All
  // other navigation resets to the top. Transient — never persisted. The
  // view-change detection that drives this lives in render() (_lastRenderedView),
  // because state.view is set from many places, not just setView.
  sessionsScrollTop: 0,
  // v43: cloud prep. Auth state (transient — not persisted; will persist in cloud
  // phase). userId (or null if logged out), authToken (or null), authStatus
  // ('logged-out' | 'logged-in' | 'logging-in' | 'error'). Mock OAuth flow for V43.
  userId: null,
  authToken: null,
  authStatus: 'logged-out',
  // v43: cloud pages visibility. cloudPagesRevealed is a transient per-session flag
  // set by long-pressing the About title; it resets when you navigate away from About
  // but persists if you open one of the cloud pages and return. Never persisted.
  cloudPagesRevealed: false,
  // v36: saved report templates (array of {id, name, settings}). Loaded from
  // REPORT_TEMPLATES_KEY; seeded with starters on first run. Applying one copies
  // its settings snapshot over the live reportSettings.
  reportTemplates: [],
  // v35: when the user taps "Edit report settings" from the report preview, we
  // remember the session id so the Report Settings back button can return them
  // straight to a freshly-rebuilt preview instead of the settings hub. Cleared
  // once consumed. null = normal settings navigation.
  reportPreviewReturnSessionId: null,
  // v34: transient signature draw-pad state (not persisted). signaturePadOpen
  // gates the draw-pad bottom-sheet; signaturePadHasInk tracks whether at least
  // one stroke has been made (gates the pad's Save button so a blank pad can't
  // be saved). The actual signature lives on reportSettings.signature.
  signaturePadOpen: false,
  signaturePadHasInk: false,
  onboardedV33Seen: false,
  // Transient wizard nav (not persisted): which step is showing and which path
  // the user chose ('' | 'import' | 'fresh'). Reset whenever the wizard opens.
  // v42 (commercial onboarding) EXPANDS the fresh path into a multi-step guided
  // setup. Step numbering (fresh path):
  //   1 intro → 2 choose path → 3 your details (engineer + cal date)
  //   → 4 company / report branding → 5 add an example session? → 6 all set
  // The import path still jumps straight out via onboardSetupImport. wizardStep
  // is clamped against the step list, so an out-of-range value is harmless.
  // v42: wizardSeedDemo — the step-5 opt-in toggle for the example session
  // (decision 9A); transient, consumed at finish on the fresh path only.
  wizardStep: 1,
  wizardPath: '',
  wizardSeedDemo: false,

  // v42: full-screen feature walkthrough (decision 6-i). Transient — never
  // persisted, never in backups (the tour keeps no data). tourOpen gates the
  // dedicated 'tour' view; tourStep is the 0-based slide index. Opened from the
  // setup finish step ("Show me around") or replayed from About.
  tourOpen: false,
  tourStep: 0,

  // v32: two-level Settings navigation + search (transient, not persisted).
  // settingsCategory: the category id currently open (view 'settingsCategory'),
  // or null at the hub. settingsSearchQuery: the live filter text on the hub;
  // when non-empty the hub shows flat search results instead of categories.
  settingsCategory: null,
  settingsSearchQuery: '',

  // v31: Export/Import Setup transient UI state (not persisted). The Backup page
  // shows a collapsed "Choose what to include" list; this holds whether it's
  // expanded and which section ids are ticked. Seeded to all-on so the common
  // "share my whole setup" path is one tap without opening the list.
  setupIncludeOpen: false,
  setupInclude: { presets: true, report: true, csv: true, tester: true, prefs: true },
  setupError: '',


  // v30: PDF Reports configuration + company logo. Single object, loaded from
  // localStorage on boot (REPORT_SETTINGS_KEY) and seeded from
  // makeDefaultReportSettings() when absent. `enabled` is the master switch
  // gating both report entry points — default OFF for everyone. Included in
  // backups; old backups restore with defaults. See config.js for field notes.
  reportSettings: makeDefaultReportSettings(),

  // v30: Report Settings page transient UI state (cleared on leaving the page).
  // Currently just tracks a logo-too-large / load-error message to surface
  // inline under the logo control. '' = nothing to show.
  reportSettingsError: '',

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
    siteDialog: { mode: null, name: '', editingId: null, clientId: null },
    // v26 (Q3=B): assign/move a site to a client. siteId is the site being
    // moved; name holds the typed/selected target client name. When a same-name
    // clash is detected on confirm, `clash` holds { targetClientId } and the
    // sheet switches to a Merge / Keep both / Cancel choice (Q14=B).
    assignDialog: { siteId: null, name: '', clash: null }
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

  // v53: Test Readings. readingsEnabled gates the WHOLE feature (default OFF —
  // when off the app is byte-for-byte V52). failReasonTags maps a fail-reason
  // TEXT to its reading-field tag ('earth'|'insulation'|'leakage'|'visual'),
  // seeded from DEFAULT_FAIL_REASON_TAGS and editable on Settings → Fails; any
  // reason not present defaults to 'visual'. lastReadingsClass remembers the
  // class picked on the previous item so the next sheet pre-selects it (defaults
  // to READING_CLASS_DEFAULT). The readings SHEET is transient bottom-sheet
  // state: readingsSheetOpen gates it; readingsSheetMode is 'pass'|'fail' (drives
  // pre-fill vs blank and which fields show); readingsDraft holds the in-progress
  // {class, earth, insulation, leakage} text being edited; readingsPendingResult
  // and readingsPendingFailReason carry the click that opened the sheet through
  // to the commit when OK is tapped. All transient sheet fields reset on close
  // and on any view transition (setView / loadFormForCursor), same as failModal.
  readingsEnabled: false,
  failReasonTags: {},
  lastReadingsClass: READING_CLASS_DEFAULT,
  readingsSheetOpen: false,
  readingsSheetMode: 'pass',          // 'pass' | 'fail'
  readingsDraft: { class: READING_CLASS_DEFAULT, earth: '', insulation: '', leakage: '', polarity: false },
  readingsPendingResult: null,        // 'pass' | 'fail' — the result being logged
  readingsPendingFailReason: null,    // the fail reason text (fail mode only)

  // v65: HID barcode scanner. ONE persisted flag; everything else here is
  // transient and deliberately so.
  //   scannerEnabled     — the only thing saved. DEFAULT ON (see SCANNER_KEY in
  //                        config.js for why this one defaults the opposite way
  //                        to every other feature flag).
  //   scanFilledAsset    — did the asset number CURRENTLY in the form come off a
  //                        barcode? Set when a scan lands, cleared by
  //                        loadFormForCursor on every fresh form.
  //   lastLogWasScanned  — decision 6B. Did the item we just logged carry a
  //   lastScanSessionId    SCANNED asset number? If so the next asset box is left
  //                        EMPTY rather than pre-filled, because nextAssetNo()
  //                        would otherwise offer barcode + 1 — a number that
  //                        looks authoritative and is almost certainly not on any
  //                        appliance. The session id is stored alongside so the
  //                        blanking dies when you switch jobs, without every
  //                        session-opening path having to remember to clear it.
  //   scannerTestLog     — the last few bursts shown on the settings test page.
  //                        Display only; never saved, never backed up. v67 puts
  //                        REJECTED bursts in here too, with the reason.
  //
  // v67 adds two more persisted fields and one transient:
  //   scannerPaired      — "a scanner is paired right now". DEFAULT OFF. Drives
  //                        the entry screen taking focus on the asset box by
  //                        itself. Separate from scannerEnabled on purpose; see
  //                        SCANNER_PAIRED_KEY in config.js.
  //   scanSpeed          — 'strict' | 'normal' | 'relaxed'. Which gap threshold
  //                        the burst test uses.
  // v68: `scanKeyboardOn` was REMOVED along with the ⌨ escape-hatch button it
  // drove. It could not do its main job (iOS suppresses the on-screen keyboard
  // system-wide while a hardware keyboard is paired), and the working answer is
  // the "Scanner paired" setting itself. See assetFieldHTML() in render-core.js.
  scannerEnabled: true,
  scannerPaired: false,
  scanSpeed: 'normal',
  scanFilledAsset: false,
  lastLogWasScanned: false,
  lastScanSessionId: '',
  scannerTestLog: [],
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

  // v47: quick-pick preset-switcher bottom-sheet open flag on the entry screen.
  // Opened by a long-press on the quick-pick grid; lists all item-type presets so
  // the active one can be switched without going into Settings. Cleared on every
  // view transition (setView) and in loadFormForCursor(), same as the others.
  presetSheetOpen: false,

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
