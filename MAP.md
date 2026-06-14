# PAT App — Code Map (V32)

Where each thing lives, so a feature change reads one or two small files instead
of the old monolithic `app.js`. Load order = the order below. `app.js` no longer
exists — the modular split is complete.
(c) 2026 Peter Birchley. All rights reserved.

> **This file is the index the read-discipline workflow depends on.** Read it
> first, then open only the file(s) it points to. It MUST be kept fully accurate
> every release — a stale map breaks the whole approach. If you ever open a file
> the map didn't point you to, the map is out of date: fix it.

## Load order (index.html) — 20 files (incl. 2 vendored libs)
`config.js` → `state.js` → `utils.js` → `storage.js` → `clients.js` → `sqp.js`
→ `multipick.js` → `feedback.js` → `csv.js` → `backup.js` → `session.js`
→ **`setup.js`** → **`jspdf.umd.min.js`** → **`jspdf.plugin.autotable.min.js`**
→ **`report.js`** → `render-core.js` → `render-settings.js` → `events.js`
→ `dispatch.js` → `boot.js`

`boot.js` runs the startup block and must stay **last**. Later files may call
functions defined in earlier ones; nothing executes until `boot.js` because
every other file is function declarations sharing one global scope.

**v30:** the two vendored PDF libraries (jsPDF + autotable, MIT) load after
`session.js` and before `report.js`, which uses them. They are the first
third-party code in the app — see `THIRD-PARTY-LICENSES.txt`. They attach to
`window.jspdf` in the browser UMD build; `report.js` reads them from there.

---

## config.js (~440 ln) — constants & defaults, pure data
`APP_VERSION` (V32); all `*_KEY` localStorage key names (incl. welcome keys,
latest `V32_WELCOME_KEY`); `MULTIPICK_MAX_SLOTS`, `PRUNE_AGE_DEFAULT`, `CAL_DUE_SOON_DAYS`,
`BACKUP_REMINDER_DAYS`, `BACKUP_SNOOZE_HOURS`; v27 SQP tuning;
`DEFAULT_ITEM_TYPES`, `DEFAULT_FAIL_REASONS`, `DEFAULT_DESCRIPTIONS`,
`DEFAULT_CSV_COLUMNS`; `CSA_RESISTANCE`, `CALC_LENGTHS`. **v30:**
`REPORT_SETTINGS_KEY`, `REPORT_DECLARATION_DEFAULT`, `REPORT_LOGO_MAX_PX`,
`makeDefaultReportSettings()`. **v31:** `V31_WELCOME_KEY`;
`REPORT_FILENAME_DEFAULT` + `REPORT_FILENAME_TOKENS`; `SETUP_KIND`,
`SETUP_BUNDLE_VERSION`, `SETUP_SECTIONS`. **v32:** `V32_WELCOME_KEY`;
`SETTINGS_CATEGORIES` (the six Settings groups → which page ids each contains,
plus icon/title/blurb) and `SETTINGS_PAGE_META` (per-page icon/title + search
`aliases`) — the single source of truth for the two-level Settings hub, the
category sub-lists, search matching, and back-navigation.
*Touch to:* add a storage key, change a default list, edit the calculator tables,
bump the version, change report/setup defaults, **or restructure Settings / add a
new settings page (edit `SETTINGS_CATEGORIES` + `SETTINGS_PAGE_META`)**.

## state.js (~280 ln) — the global `state` object
The single `let state = { ... }` runtime shape: sessions, form, view, all the
UI transients, welcome-modal flags, SQP/Multi Pick in-memory caches. **v30:**
`reportSettings` + `reportSettingsError` + `v30WelcomeSeen`. **v31:**
`v31WelcomeSeen`; `setupIncludeOpen` (disclosure state) + `setupInclude`
({sectionId:bool}, all true by default) + `setupError` — all transient Export/
Import Setup UI state, not persisted. **v32:** `v32WelcomeSeen`;
`settingsCategory` (the open category id, or null at the hub) + `settingsSearchQuery`
(live settings-hub search text) — transient two-level-Settings nav state.
*Touch to:* add a new field to runtime state.

## utils.js (~90 ln) — pure helpers (no state access)
`escapeHTML`, `capitalise`, `titleCase`, `formatDate`, `formatTimeShort`,
`formatTimestampCSV`, `splitAssetNo`, `csvEscape`, `csvResultLabel`, `formatBytes`.
*Touch to:* add a stateless formatting/escaping helper.

## storage.js (~640 ln) — persistence boundary
Codec: `STORAGE_CODEC_VERSION`, `SESSION_KEY_MAP`, `ITEM_KEY_MAP` (+ `_REV`),
`encodeWithMap`/`decodeWithMap`, `encodeItem`/`decodeItem`,
`encodeSession`/`decodeSession`, `_sessionSig`, `serialiseSessions`,
`parseStoredSessions`. Lifecycle: `load`, `loadV11Settings`,
`ensureAllCsvColumns`, `computeHistoryFromItems`. Saves: `save` (full),
`saveSessions`, `saveSettings`, `saveSqpHistory`, `saveDescriptions`. Stats:
`getStorageStats`. **v30:** `loadReportSettings` + `normaliseReportSettings`
(shared validator used by load AND backup restore — coerces any
candidate/garbage object to a complete type-safe report-settings object merged
over defaults) + `saveReportSettings`; `saveSettings` now also persists report
settings. **v31:** `normaliseReportSettings` also validates
`reportFilenamePattern` (non-empty kept, else default — old data/backups backfill
the new field); `load` reads `V31_WELCOME_KEY` (and **v32:** `V32_WELCOME_KEY`).
*Touch to:* change how data is stored/loaded/migrated. **Data integrity zone —
always backup-round-trip after edits.**

## clients.js (~405 ln) — Clients & Sites (v19, extended v26)
Data model: `loadClients`, `loadSites` (v26: orphan sites allowed — clientId may
be empty), `seedClientsSitesFromSessions`, `clientById`, `siteById`,
`sitesForClient`, `sortedClients`, `findClientByName`, `findSiteByName`,
`ensureClient`, `ensureSite`, `rebuildClientsFromSessions`, `composeSiteSnapshot`,
`splitSiteSnapshot` (v26: snapshot → {client, site} for CSV split),
`unassignedSites` + `ensureOrphanSite` + `findOrphanSiteByName` (v26: clientless
sites). Settings→Clients page actions: `addClientFromDialog`,
`renameClientFromDialog`, `deleteClient`, `addSiteFromDialog`,
`renameSiteFromDialog`, `deleteSite`. v26 assign/move (Q3=B/Q14=B):
`openSiteAssignDialog`, `cancelSiteAssignDialog`, `commitSiteAssign`,
`resolveAssignMerge`, `resolveAssignKeepBoth`, `finishSiteAssign`,
`nextFreeSiteName`.
*Touch to:* change how clients/sites are stored or managed.

## sqp.js (~245 ln) — Smart Quick Pick (v18, ordering-quality pass v27)
`normaliseSqpLocation`, `sqpTokens` (v27: word-split for token matching),
`normaliseSqpHistory`, `loadSqpHistory`, `recordSqpUsage`, `buildSqpHistory`,
`bumpSqpHistoryVersion`, `sqpScoresForLocation` (v27: word-overlap match instead
of greedy substring + exact-match full / partial half weighting),
`smartOrderedItemTypes` (v27: swap-in floor `SQP_SWAP_IN_MIN` + staple protection
`SQP_STAPLE_DEFENCE`), `sqpRowForLocation`, `invalidateSqpRow`, `clearSqpHistory`,
`rebuildSqpHistory`, `setSqp`.
*Touch to:* change how the quick-pick row adapts to location. v27 tuning
constants (`SQP_PARTIAL_WEIGHT`, `SQP_SWAP_IN_MIN`, `SQP_STAPLE_DEFENCE`) live in
config.js.

## multipick.js (~125 ln) — Multi Pick (v16)
`normaliseMultiPickConfig`, `loadMultiPickConfig`, `activeMultiPickSlots`,
`multiPickFire`, `saveMultiPickSettings`.
*Touch to:* change the multi-pick bottom sheet behaviour or its settings save.

## feedback.js (~260 ln) — toast + haptic / flash / sound (v17)
`showToast`, `confirmMigrationPrompt`; `_hapticOnce`, `haptic`, `flashEl`
(+ `FLASH_MS`, `FLASH_TINT`), `_getAudioCtx`, `_beep`, `playSound`,
`feedback` (+ `FEEDBACK_HAPTIC_COUNT`).
*Touch to:* change pass/fail/copy feedback channels or toasts.

## csv.js (~600 ln) — CSV build + import (v10/v11, split v26)
Build/share: `csvCellValue` (v26: `client` column + adaptive `site` column — full
snapshot when Client hidden, site-only when shown), `buildCSV`, `defaultHeaderFor`,
`downloadCSV` (+ `SHARE_ICON_SVG`; v26: share payload no longer carries
title/text). Import: `buildCsvHeaderLookup`, `parseCSV`, `parseUkDateToIso`,
`parseImportCSV` (v26: recognises a `Client` column, composes snapshot),
`handleImportFile`, `commitImportedSession` (v26: learns client/site into lists),
`cancelImportConflict`, `closeImportSummary` (+ `EXPECTED_CSV_HEADER`).
*Touch to:* change CSV columns, export, or import parsing.

## backup.js (~270 ln) — Backup / Restore (v7)
`buildBackup` (v30: now includes `reportSettings`), `downloadBackup`,
`markBackupExported`, `snoozeBackupReminder`, `shouldShowBackupReminder`,
`restoreBackupFromFile` (v30: restores `reportSettings` via
`normaliseReportSettings` — old backups with no key restore to defaults, i.e.
reporting OFF). `backupVersion` stays **5** (reportSettings is purely additive).
*Touch to:* change the JSON backup shape or restore path. **Bump `backupVersion`
if the shape changes; keep old-backup compatibility.**

## setup.js (~250 ln) — Export/Import Setup (v31) — NEW
Config-only shareable bundle (NOT sessions/clients/sites). `buildSetupBundle`
(reads `SETUP_SECTIONS` from config; includes only ticked sections),
`setupFilename`, `describeSetupSections`, `shareSetup` (OS share sheet → download
fallback, mirrors shareOrDownloadReport), `importSetupFromFile` (FileReader +
**file-kind guard**: rejects a full backup imported as a setup, and vice versa —
a setup never touches sessions, so the guard is the only thing preventing a
mis-import from looking destructive), `applySetupBundle` (applies present
sections via the SAME validators as backup-restore: preset-restore logic,
`normaliseReportSettings`, CSV column re-validation + `ensureAllCsvColumns`,
`normaliseMultiPickConfig`, `applyTheme`). Five user-facing groups: presets &
lists / report settings / CSV columns / tester & calibration / app preferences.
Deliberately excludes `sqpHistory` (device-specific). Bundle marker `kind:
"pat-setup"`, `setupVersion:1`, plus a user-given `label`. Reuses `uid`,
`syncItemTypesFromActivePreset`, `todayISO` (session.js).
*Touch to:* change what a shared setup carries, the import/merge behaviour, or
the bundle format. **Config-only — must never read or write sessions.**

## session.js (~1320 ln) — sessions, items & most logic
Presets (`activePreset`, `syncItemTypesFromActivePreset`, `switchPreset`,
`createPreset`, `renamePreset`, `deletePreset`); core helpers (`uid`, `todayISO`,
`activeSession`, `normaliseItemType`, `normaliseLocation`, `calibrationStatus`,
`nextAssetNo`, `getCarryForwardLocation`, `findDuplicateAssetIndex`,
`computeSuggestions`, `computeLocationSuggestions`, `addDescriptionIfNew`,
`sortedSessions`, `sessionMatchesControlFilters`, `filteredSessions`); theme
(`applyTheme`); export-state (`exportStatus`, `markSessionExported`,
`markSessionDirty`, `unexportedSessionCount`, `unexportedSessions`,
`prunableSessions`, `savePruneAge`, `pruneOldSessions`); form
(`loadFormForCursor`); validation (`validateBeforeSave`); session/item actions
(`createSession`, `openSession`, `requestOpenSession`, `confirmReopenWarning`,
`cancelReopenWarning`, `deleteSession`, `saveItem`, `passClicked`, `failClicked`,
`pickFailReason`, `cancelFailModal`, `copyLastResult`, `deleteItem`, `moveCursor`,
`skipToNew`, `jumpTo`, `setView`); selection + bulk edit (`enterSelectionMode`,
`exitSelectionMode`, `toggleSelected`, `selectAllVisible`, `clearSelection`,
`openBulkLocationDialog`, `applyBulkLocation`, `openBulkEditMenu`,
`closeBulkEditMenu`, `openBulkEditDialog`, `cancelBulkEditDialog`, `applyBulkType`,
`applyBulkNotes`, `applyBulkDelete`); edit-session (`startEditSession`,
`saveSessionEdits`, `unlockActiveSession`); settings saves/resets
(`saveUserSettings`, `saveCsvColumnsSettings`, `resetCsvColumnsSettings`,
`moveCsvColumn`, `saveItemTypesSettings`, `saveFailReasonsSettings`,
`saveDescriptionsSettings`, `resetItemsToDefaults`, `resetFailReasonsToDefaults`,
`resetDescriptionsToDefaults`, `setTheme`, `setHaptics`, `setSound`,
`setTimestamps`); **v30 report settings** (`captureReportTextInputs`,
`saveReportSettingsForm`, `handleReportLogoFile` — logo read + canvas-downscale
to `REPORT_LOGO_MAX_PX` + base64 store); welcome dismiss (`dismissV19Welcome`,
`dismissV26Welcome`, `dismissV30Welcome`, **`dismissV31Welcome`**). **v31:**
report filename pattern captured in `captureReportTextInputs`; Export/Import
Setup UI handlers (`toggleSetupIncludeOpen`, `setSetupInclude`, `startShareSetup`
— builds the name bottom-sheet then calls `shareSetup`) and
`insertReportFilenameToken` (token-chip → filename field insert at caret).
*Touch to:* most logic changes — session/item lifecycle, suggestions, sorting,
filtering, theme, bulk edit, settings saves.

## report.js (~310 ln) — PDF reports (v30) — NEW
The PDF report builder + preview + share. `getJsPDF` (reads `window.jspdf`),
`runAutoTable`, `addMonthsFormatted` (retest date), `buildReportDoc` (logo/company
header, title, job details, tested/passed/failed totals, the appliance-register
autotable built from a COLUMN LIST, failed-row tint, footers, declaration),
`reportFilename` (**v31:** builds from `reportSettings.reportFilenamePattern`
with {site}/{client}/{date}/{engineer} token substitution + sanitisation; default
pattern reproduces the exact pre-v31 name), `produceReport` (dispatch entry —
gated by `reportSettings.enabled`; friendly alert if the engine hasn't loaded),
`openReportPreview` (near-fullscreen iframe modal; **v31:** an editable filename
field, seeded from the pattern, used for share/download), `triggerDownload`,
`shareOrDownloadReport` (OS share sheet → download fallback). Reuses
`splitSiteSnapshot` (clients.js), `formatDate`/`csvResultLabel` (utils.js),
`todayISO`/`state` (session.js/state.js).
*Touch to:* change the report layout/content, add reading columns (future), or
change how the PDF is previewed/shared/named. **Uses the vendored MIT libs.**

## render-core.js (~1100 ln) — main screens
Owns `const app = document.getElementById('app')`. `render()` dispatcher.
Sessions: `renderSessions`, `renderSessionsListAreaHTML`,
`refreshSessionsListAreaOnly`, `renderBackupReminderBanner`. New-session form
suggestions: `computeNfClientSuggestions`, `computeNfSiteSuggestions`,
`nfSuggestionsHTML`. Import modals: `renderImportConflictModal`,
`renderImportSummaryModal`. Entry: `renderEntry`, `refreshEntryAfterLog`.
Overview: `computeVisibleOverviewItems`, `renderOverviewBodyHTML`,
`renderOverview` (v30: "Produce Report" 📄 button in header when
`reportSettings.enabled`), `refreshOverviewBody`, `refreshOverviewSelection`. Edit: `renderEditSession`. **v30:** `renderReports` (the top-level Reports hub).
**v32:** `emptyStateHTML(icon,title,body,actionLabel,actionName)` — the shared
empty-state block used on Sessions (no sessions → "Start your first session"
button), Overview (genuinely-empty session, no button), Clients (in
render-settings), and Reports hub (no sessions); `refreshSettingsHubBodyOnly`
(partial re-render of the settings hub body for live search, alongside
`refreshSessionsListAreaOnly`); `settingsCategory` view routed in `render()`; the
welcome modal block is now the **V32** "What's new" (settings restructure +
search), gated by `v32WelcomeSeen`.
*Touch to:* change the Sessions list, Entry screen, Overview, Reports hub, the
Edit-session UI, the empty states, or the welcome modal.
**v29:** the two no-op binder shells left from V28
(`bindSessionsListAreaEvents`, `bindOverviewBodyEvents`) and their last call
sites in `refreshSessionsListAreaOnly` / `refreshOverviewBody` were deleted —
all those events have been delegated in `dispatch.js` since V25/V28. render()
calls `bindFocusFields()` (events.js) for the four focus-sensitive fields.

## render-settings.js (~1050 ln) — settings screens
**v32: two-level Settings.** `renderSettingsHub` is now a list of CATEGORIES
(from `SETTINGS_CATEGORIES` in config.js) plus a search box; `renderSettingsHubBodyHTML`
builds the body (search results across all pages, OR the category list) and is
re-rendered alone by `refreshSettingsHubBodyOnly` (render-core) so the search box
keeps focus while typing. `renderSettingsCategory` shows one category's pages +
a muted blurb (helper text); back → hub. `settingsPageSubtitle(pageId)` computes
the live count/status line for a page row (was inline in the old flat hub);
`settingsPageRowHTML(pageId, context)` renders a page row (context = category
name, shown in search results). `renderSettingsSubHeader` + every `renderSettings*`
sub-page (User, Items, Fails, MultiPick, Descriptions, Display, Backup, Csv,
Clients, Report, Calculator, About, Contact) + calculator helpers. v31 bits
(Report "PDF file name" section, `renderSetupSection()` on Backup) unchanged.
**About changelog lives here** (`renderSettingsAbout`) — v32: V32 on top, V29
dropped, cards reordered (intro → what's new → privacy → reload utility → ©).
The Clients empty state uses the shared `emptyStateHTML` (render-core).
*Touch to:* change any Settings page; the category structure (edit
`SETTINGS_CATEGORIES`/`SETTINGS_PAGE_META` in **config.js**, not here); search
matching (aliases live in config); or roll the About changelog.

## events.js (~290 ln) — focus-sensitive field binding (per-render)
`bindFocusFields()` — direct `oninput`/`onfocus`/`onblur` binds for the **four**
focus-sensitive fields only: `nf-client`, `nf-site` (New Session autocomplete),
`f-location` (focus-clears-field + casing-on-blur + SQP row rebuild), `f-type`
(casing-on-blur). Plus the suggestion re-render helpers (`renderSuggestionsOnly`,
`renderNfSuggestionsOnly`, `renderLocationSuggestionsOnly`) that own the
`.suggestions` dropdowns these fields drive (they use the
`onmousedown→preventDefault` tap trick).
*Touch to:* change one of the four autocomplete/casing fields or their dropdowns.
**v28 (E3-tail):** every other stateful input/change handler moved to delegation
in `dispatch.js`; `bindEvents()` is gone — its non-focus handlers are now
`data-input-action`/`data-change-action`. These four stay direct because
focus/blur timing can't be safely delegated (the fragile iOS area). Called from
render() and refreshEntryAfterLog() in render-core.js.

## dispatch.js (~600 ln) — delegated event handling (V25 clicks, V28 input/change)
The full delegated event system + three action registries, all attached once to
`#app` at boot via `initDelegation`:
- **Clicks (V25):** `ACTIONS` + `registerActions` + `handleDelegatedClick`
  (ancestor-walk by `data-action`/`data-arg`).
- **Input (V28 E3-tail):** `INPUT_ACTIONS` + `registerInputActions` +
  `handleDelegatedInput` (routed by `data-input-action`). The ~20 plain
  value-write fields + the two search fields (partial refresh).
- **Change (V28 E3-tail):** `CHANGE_ACTIONS` + `registerChangeActions` +
  `handleDelegatedChange` (routed by `data-change-action`). All toggles/selects/
  radios + the two file pickers, the overview row checkbox (`row-select`), the
  sessions-list sort/status/lock selects (moved out of render-core.js), and the
  preset-switch confirm-on-switch dropdown.
- `_fieldValue(el)` resolves checkbox/radio→checked else value, passed as the
  handler's first arg.
**v30:** report actions added — clicks `open-reports`, `produce-report`,
`settings-report-save`, `report-logo-pick`, `report-logo-remove`; changes
`report-enabled` (master, persists instantly + re-render), the five include
toggles + `report-retest-enabled` (in-memory + re-render; each calls
`captureReportTextInputs` first so unsaved text survives the re-render), and the
`report-logo-file` picker. `welcome-dismiss` now calls `dismissV30Welcome`.
**v31:** clicks `report-filename-token` (chip insert), `setup-share`,
`setup-include-toggle-open`, `setup-import`; changes `setup-include-toggle` (per
section), `setup-import-file` (→ `importSetupFromFile`); `welcome-dismiss` now
calls `dismissV31Welcome`.
**v32:** clicks `settings-category` (open a category sub-list); `back-to-settings`
is now level-aware (page → its category, category → hub); `open-settings` resets
`settingsCategory`/`settingsSearchQuery` so the hub opens clean; input
`settings-search` (live filter → `refreshSettingsHubBodyOnly`); `welcome-dismiss`
now calls `dismissV32Welcome`.
*Touch to:* add/route any delegated click/input/change handler. Only the four
focus-sensitive fields are NOT here (see `bindFocusFields` in events.js).

## boot.js (~145 ln) — startup, RUNS ON LOAD, must load LAST
Service worker: `registerServiceWorker`, `showUpdateBanner`, `applyUpdate`,
`dismissUpdateBanner`. v26 boot integrity guard: `bootIntegrityOK()` verifies the
critical cross-file functions all loaded before any storage write; if not, it
shows an "Update needed" reload prompt and SKIPS load()/render()/save() (guards
the v26-era duplicate-const data-loss class). Boot tail: the guard's else-branch
runs `load()`, `applyTheme(state.theme)`, the crash-fallback
`try { loadFormForCursor(); render(); } catch …`; `registerServiceWorker()` runs
regardless.
*Touch to:* change startup sequence, the SW update banner, or the integrity
guard. The crash fallback that prevents a permanent blank screen lives here.
