# PAT App — Code Map (V53)

Where each thing lives, so a feature change reads one or two small files instead
of the old monolithic `app.js`. Load order = the order below. `app.js` no longer
exists — the modular split is complete.
(c) 2026 Peter Birchley. All rights reserved.

> **This file is the index the read-discipline workflow depends on.** Read it
> first, then open only the file(s) it points to. It MUST be kept fully accurate
> every release — a stale map breaks the whole approach. If you ever open a file
> the map didn't point you to, the map is out of date: fix it.

> **v50 note on this document.** This map used to carry a per-version `**vNN:**`
> trail in every section (what changed in v31, v32, … v49). That history lived
> better in the handoffs, so v50 rewrote the map to describe the **current state**
> of each file rather than its release history. For "what changed when", read the
> `PAThandoff_vNN.md` docs. The map now answers one question only: *where does
> this thing live today?*

## Load order (index.html) — 20 first-party files
`config.js` → `state.js` → `utils.js` → `storage.js` → `clients.js` → `sqp.js`
→ `multipick.js` → `feedback.js` → `csv.js` → `backup.js` → `session.js`
→ `setup.js` → `tour.js` → `report.js` → `pdfpreview.js`
→ `render-core.js` → `render-settings.js` → `events.js` → `dispatch.js` → `boot.js`

`boot.js` runs the startup block and must stay **last**. Later files may call
functions defined in earlier ones; nothing executes until `boot.js` because
every other file is function declarations sharing one global scope.

**Vendored PDF libraries — both lazy-loaded, NEITHER in the startup `<script>`
chain (v51).**
- **jsPDF + autotable** (MIT, ~350 KB): in `sw.js` ASSETS (precached at install)
  but NOT in index.html's chain. `report.js` injects them on the FIRST report via
  `loadReportEngine()`, served from the precache so reports work fully offline from
  first install. (v51 moved them off the cold-start path — before v51 they loaded
  synchronously on every launch.)
- **PDF.js** (`pdfjs.min.js` + `pdfjs.worker.min.js`, Apache-2.0, ~1.5 MB): in the
  repo but NOT in index.html AND NOT in sw.js ASSETS. Fetched lazily from our own
  origin on the FIRST report PREVIEW by `pdfpreview.js`; the same-origin SW fetch
  handler auto-caches it. First preview needs a connection once; offline after.

The difference between the two: jsPDF is a *core* feature (reports) so it's
precached for guaranteed offline-from-install; PDF.js is the heavier *preview*
enhancement so its download is deferred too. Both avoid the startup parse cost.
See `THIRD-PARTY-LICENSES.txt`.

---

## config.js (~600 ln) — constants & defaults, pure data
`APP_VERSION` ('V53'); all `*_KEY` localStorage key names; the calibration/backup
tuning constants (`MULTIPICK_MAX_SLOTS`, `PRUNE_AGE_DEFAULT`, `CAL_DUE_SOON_DAYS`,
`BACKUP_REMINDER_DAYS`, `BACKUP_SNOOZE_HOURS`); SQP tuning (`SQP_PARTIAL_WEIGHT`,
`SQP_SWAP_IN_MIN`, `SQP_STAPLE_DEFENCE`); default lists (`DEFAULT_ITEM_TYPES`,
`DEFAULT_FAIL_REASONS`, `DEFAULT_DESCRIPTIONS`, `DEFAULT_CSV_COLUMNS`); calculator
tables (`CSA_RESISTANCE`, `CALC_LENGTHS`).

**v53 Test Readings constants:** `READINGS_KEY` ('1'|'0' master flag, default off);
`READING_CLASSES` (['I','II','III']) + `READING_CLASS_DEFAULT`;
`READING_FIELDS_BY_CLASS` (which of earth/insulation/leakage each class shows — the
single source of truth for "which boxes"); `READING_FIELD_META` (per-field label,
unit, and typical-PASS placeholder: earth `<0.1`Ω, insulation `≥19.99`MΩ, leakage
`<5`mA); `FAIL_REASON_TAGS_KEY` + `READING_FAIL_TAGS` (['visual','earth','insulation',
'leakage']) + `READING_FAIL_TAG_DEFAULT` ('visual') + `DEFAULT_FAIL_REASON_TAGS`
(built-in tags for the shipped fail reasons). `DEFAULT_CSV_COLUMNS` gained four
default-hidden reading columns (`readingClass`, `readingEarth`, `readingInsulation`,
`readingLeakage`). `SETTINGS_CATEGORIES` catTesting now lists `settingsReadings`;
`SETTINGS_PAGE_META` has its entry. Welcome key is `V53_WELCOME_KEY`.

Reports: `REPORT_SETTINGS_KEY`, `REPORT_DECLARATION_DEFAULT`, `REPORT_LOGO_MAX_PX`,
`REPORT_SIGNATURE_MAX_PX`, `REPORT_FILENAME_DEFAULT` + `REPORT_FILENAME_TOKENS`,
`REPORT_DEFAULT_HEADER_COLOR` + `REPORT_DEFAULT_ACCENT_COLOR` + `REPORT_COLOR_THEMES`
(5 presets), `REPORT_TEMPLATES_KEY`, `PATGO_FOOTER_LOGO` (a ~4.6 KB base64 PNG of
the app icon, embedded so the PDF footer logo renders offline);
`makeDefaultReportSettings()` (the full default report-settings object — includes
`showAppCredit:true` and `showFooterLogo:true`); `makeStarterReportTemplates()`
(2 seed templates).

Setup bundle: `SETUP_KIND`, `SETUP_BUNDLE_VERSION`, `SETUP_SECTIONS`.
Settings hub: `SETTINGS_CATEGORIES` (the six groups → page ids + icon/title/blurb)
and `SETTINGS_PAGE_META` (per-page icon/title + search `aliases`) — the single
source of truth for the two-level Settings hub, sub-lists, search and back-nav.
First-run: `ONBOARD_KEY` (`pat:onboardedV33`). Cloud prep: `PAT_AUTH_KEY`.
Quick-pick long-press: `QUICK_PICK_LONGPRESS_MS` (2000).

**Welcome key (v50):** ONLY the current welcome key is defined —
`V49_WELCOME_KEY = 'pat:v49welcome'`. The 28 historical keys (V12…V48) were removed
in v50; they were one-release markers nothing referenced after shipping. Old keys
remain harmlessly in users' localStorage and are detected by prefix in storage.js.
A future feature release replaces this one line with its new key and passes it to
`dismissWelcome()`.

*Touch to:* add a storage key, change a default list, edit the calculator tables,
bump the version, change report/setup defaults, or restructure Settings / add a new
settings page (edit `SETTINGS_CATEGORIES` + `SETTINGS_PAGE_META`).

## state.js (~318 ln) — the global `state` object
The single `let state = { ... }` runtime shape: sessions, form, view, all UI
transients, the welcome-modal gate, SQP/Multi Pick in-memory caches,
`reportSettings` + `reportSettingsError`, `reportTemplates`, the two-level Settings
nav state (`settingsCategory`, `settingsSearchQuery`), the Export/Import-Setup UI
state (`setupIncludeOpen`, `setupInclude`, `setupError`), the first-run wizard state
(`onboardedV33Seen`, `wizardStep`, `wizardPath`, `wizardSeedDemo`), the signature
pad transients (`signaturePadOpen`, `signaturePadHasInk`), the report-preview
return hook (`reportPreviewReturnSessionId`), the tour transients (`tourOpen`,
`tourStep`), the remembered Sessions scroll offset (`sessionsScrollTop`), the
preset-switcher sheet flag (`presetSheetOpen`), the bulk-edit state
(`bulkLocationDialogOpen`, `bulkLocationValue`, plus the v11 bulk-edit menu fields),
and the cloud-prep auth mirrors (`userId`, `authToken`, `authStatus`).

**v53 Test Readings state:** `readingsEnabled` (master flag), `failReasonTags`
(reason-text → tag map), `lastReadingsClass` (remembered class for the next item),
and the transient readings-sheet block: `readingsSheetOpen`, `readingsSheetMode`
('pass'|'fail'), `readingsDraft` ({class,earth,insulation,leakage}),
`readingsPendingResult`, `readingsPendingFailReason`. All sheet transients reset on
close and on navigation (loadFormForCursor / setView) via `closeReadingsSheetState()`.

**Welcome flag (v50 pattern):** ONLY the current `v53WelcomeSeen` is kept. Historical
`vNNWelcomeSeen` flags were removed in v50 — each was written once and never read
after its release. The first-run-wizard gate detects past welcomes via
`hasAnyLegacyWelcomeKey()` (storage.js).

*Touch to:* add a new field to runtime state.

## utils.js (~190 ln) — pure helpers (no state access)
`escapeHTML`, `capitalise`, `titleCase`, `formatDate`, `formatTimeShort`,
`formatTimestampCSV`, `splitAssetNo`, `csvEscape`, `csvResultLabel`, `formatBytes`;
colour helpers `hexToRgb(hex,fallback)`, `contrastColor(rgb)`, `safeHexColor(hex,
fallback)`; `setupLongPress(element, durationMs, onLongPress)` (reusable pointer-
event long-press detector, returns a cleanup fn); **v53** `normaliseItemReadings(r)`
(validate/clean an item's readings object — returns clean {class,earth,insulation,
leakage} or null; the boundary validator used on backup restore and future cloud sync).
*Touch to:* add a stateless formatting/escaping/colour helper.

## storage.js (~745 ln) — persistence boundary
Codec: `STORAGE_CODEC_VERSION`, `SESSION_KEY_MAP`, `ITEM_KEY_MAP` (+ `_REV`),
`encodeWithMap`/`decodeWithMap`, `encodeItem`/`decodeItem`,
`encodeSession`/`decodeSession`, `_sessionSig`, `serialiseSessions`,
`parseStoredSessions`. Lifecycle: `load`, `loadV11Settings`, `ensureAllCsvColumns`,
`computeHistoryFromItems`. Saves: `save` (full), `saveSessions`, `saveSettings`,
`saveSqpHistory`, `saveDescriptions`. Stats: `getStorageStats`.
**v53:** `load` reads `READINGS_KEY` → `state.readingsEnabled` and calls
`loadFailReasonTags()` → `state.failReasonTags`; `save` writes both. Helpers
`loadFailReasonTags()` (validate stored tags against `READING_FAIL_TAGS`, drop
unknowns, backfill `DEFAULT_FAIL_REASON_TAGS`), `saveFailReasonTags()`, and
`readingTagForReason(reason)` (the single read path — any untagged/custom reason or
"Other…" resolves to 'visual'). `ensureAllCsvColumns()` (unchanged code) auto-backfills
the four new reading columns for existing users on next load.
Report settings: `loadReportSettings`, `saveReportSettings`, and the shared
validator `normaliseReportSettings` (coerces any candidate/garbage object to a
complete type-safe report-settings object merged over defaults — used by load AND
backup restore AND template loading; validates the include toggles incl.
`showAppCredit`/`showFooterLogo` via `!== false` back-compat, `reportFilenamePattern`,
`signature`/`signaturePosition`, `headerColor`/`accentColor` via `safeHexColor`, and
the cert fields). Templates: `loadReportTemplates`/`saveReportTemplates`.

**Welcome read + wizard gate (v50 pattern):** `load` reads ONLY `V53_WELCOME_KEY` →
`state.v53WelcomeSeen`. `hasAnyLegacyWelcomeKey()` scans localStorage for any
`pat:v<n>welcome` key — used by the first-run-wizard gate to recognise a returning
user without keeping a per-version flag. The gate:
`onboardedV33Seen = explicitlyOnboarded || sessions>0 || engineerName || hasAnyLegacyWelcomeKey()`.
This is a strict superset of the old seven-flag clause, so no upgrader is ever
mistaken for a new user; a blank install has none and correctly sees the wizard.

*Touch to:* change how data is stored/loaded/migrated. **Data integrity zone —
always backup-round-trip after edits.** `backupVersion` is **5**.

## clients.js (~427 ln) — Clients & Sites
Data model: `loadClients`, `loadSites` (orphan sites allowed — clientId may be
empty), `seedClientsSitesFromSessions`, `clientById`, `siteById`, `sitesForClient`,
`sortedClients`, `findClientByName`, `findSiteByName`, `ensureClient`, `ensureSite`,
`rebuildClientsFromSessions`, `composeSiteSnapshot`, `splitSiteSnapshot` (snapshot →
{client, site} for CSV split), `unassignedSites` + `ensureOrphanSite` +
`findOrphanSiteByName`. Settings→Clients actions: `addClientFromDialog`,
`renameClientFromDialog`, `deleteClient`, `addSiteFromDialog`, `renameSiteFromDialog`,
`deleteSite` (delete actions open `openConfirmSheet`; duplicate-name guards
`showToast`). Assign/move: `openSiteAssignDialog`, `cancelSiteAssignDialog`,
`commitSiteAssign`, `resolveAssignMerge`, `resolveAssignKeepBoth`, `finishSiteAssign`,
`nextFreeSiteName`.
*Touch to:* change how clients/sites are stored or managed.

## sqp.js (~286 ln) — Smart Quick Pick
`normaliseSqpLocation`, `sqpTokens`, `normaliseSqpHistory`, `loadSqpHistory`,
`recordSqpUsage`, `buildSqpHistory`, `bumpSqpHistoryVersion`, `sqpScoresForLocation`
(word-overlap match, exact/partial weighting), `smartOrderedItemTypes` (swap-in
floor + staple protection), `sqpRowForLocation`, `invalidateSqpRow`,
`clearSqpHistory`/`rebuildSqpHistory` (each ends with `showToast`; the confirm is in
dispatch.js), `setSqp`.
*Touch to:* change how the quick-pick row adapts to location. Tuning constants live
in config.js.

## multipick.js (~127 ln) — Multi Pick
`normaliseMultiPickConfig`, `loadMultiPickConfig`, `activeMultiPickSlots`,
`multiPickFire` (the "enter a location first" guard `showToast`s), `saveMultiPickSettings`.
*Touch to:* change the multi-pick bottom sheet behaviour or its settings save.

## feedback.js (~405 ln) — toast + dialogs + haptic / flash / sound
`showToast`, `confirmMigrationPrompt`; `_hapticOnce`, `haptic`, `flashEl`
(+ `FLASH_MS`, `FLASH_TINT`), `_getAudioCtx`, `_beep`, `playSound`, `feedback`
(+ `FEEDBACK_HAPTIC_COUNT`). In-app bottom-sheet dialogs replacing native
`prompt()`/`confirm()`/`alert()` (unreliable in iOS PWAs): `_openSheet(ariaLabel)`
(shared backdrop+sheet builder); `openConfirmSheet({title,message,confirmLabel,
cancelLabel,danger,onConfirm})`; `openNameSheet({title,blurb,value,placeholder,
confirmLabel,maxlength,onConfirm})`; `openInfoSheet({title,message,buttonLabel,
onClose})` (stays until tapped — no auto-dismiss, for errors). All reuse the
`.bulk-sheet` pattern, no state, no re-render.
*Touch to:* change pass/fail/copy feedback channels, toasts, or the shared dialogs.

## csv.js (~665 ln) — CSV build + import
Build/share: `csvCellValue` (adaptive client/site columns; **v53** four reading
cases — `readingClass`/`readingEarth`/`readingInsulation`/`readingLeakage` — each
emits blank when the feature is off, the column hidden, or the item has no reading;
otherwise the as-typed value), `buildCSV`,
`defaultHeaderFor`, `downloadCSV` (+ `SHARE_ICON_SVG`), `shareOrDownloadCSV`,
`copyCSV` (clipboard with textarea/`execCommand` fallback; marks exported + toasts;
wired to `copy-current`/`copy-session`). Import: `buildCsvHeaderLookup`, `parseCSV`,
`parseUkDateToIso`, `parseImportCSV` (recognises a `Client` column), `handleImportFile`,
`commitImportedSession` (learns client/site into lists), `cancelImportConflict`,
`closeImportSummary`. Import errors open `openInfoSheet`.
*Touch to:* change CSV columns, export, or import parsing.

## backup.js (~340 ln) — Backup / Restore
`buildBackup` (includes `reportSettings` + `reportTemplates`; **v53** also
`readingsEnabled` + `failReasonTags`; per-session `notes`/`certNo` and per-item
`readings` ride inside `sessions`), `downloadBackup`, `markBackupExported`,
`snoozeBackupReminder`, `shouldShowBackupReminder`, `restoreBackupFromFile`
(restores reportSettings/templates via `normaliseReportSettings`; **v53** validates
each restored item's `readings` via `normaliseItemReadings` — drops the key if junk
— and restores the readings flag + tags with the same drop-unknown/backfill-defaults
rule as load; old backups with missing fields restore to defaults). Restore confirm =
`openConfirmSheet`, success = `showToast`, the three import errors = `openInfoSheet`.
`backupVersion` stays **5** — readings are additive and missing-field-tolerant (items
ride through wholesale; an old app ignores the unknown key, a new app reads it). The
test-readings feature deliberately did NOT spend a bump; the earmarked 6 is reserved
for a genuine incompatible schema change.
*Touch to:* change the JSON backup shape or restore path. **Bump `backupVersion` only
for a genuine incompatible change; keep old-backup compatibility.**

## setup.js (~260 ln) — Export/Import Setup
Config-only shareable bundle (NOT sessions/clients/sites). `buildSetupBundle`,
`setupFilename`, `describeSetupSections`, `shareSetup`, `importSetupFromFile` (file-
kind guard: rejects a full backup imported as a setup and vice versa),
`applySetupBundle` (applies present sections via the SAME validators as backup-
restore). Five groups: presets & lists / report settings (incl. templates) / CSV
columns / tester & calibration / app preferences. Bundle marker `kind:"pat-setup"`,
`setupVersion:1`, plus a user label. All native pop-ups → info/confirm sheets +
toast.
*Touch to:* change what a shared setup carries or the bundle format. **Config-only —
must never read or write sessions.**

## tour.js (~217 ln) — guided feature walkthrough
Self-contained full-screen feature tour. Each slide renders a static HTML/CSS
**mock** with one control highlighted plus a caption (no live-element coachmarks —
the fragile iOS path we avoided). `TOUR_SLIDES` (5: sessions / quickpick / overview
/ reports / backup). Control: `openTour`, `tourNext`/`tourPrev`/`tourGoTo`,
`closeTour`. Render: `renderTour()`. State transient (`tourOpen`/`tourStep`) — never
persisted. Routed early in `render()` as a full-screen view. Entry points: the
wizard finish step and About → "Show me around".
*Touch to:* change the walkthrough slides, mocks/copy, or paging.

## report.js (~700 ln) — PDF reports — lazy-loads the vendored MIT libs
**Lazy engine load (v51):** `REPORT_JSPDF_SRC`/`REPORT_AUTOTABLE_SRC` (same-origin
paths); `reportEngineReady()` (true once `window.jspdf.jsPDF.API.autoTable` exists);
`_injectScriptOnce(src, marker)` (appends a `<script>` once, resolve on load / reject
on error, `async=false` to preserve order); `loadReportEngine()` (one-shot shared
promise — injects jsPDF THEN autotable in order, resolves when both live, rejects +
clears the promise on failure so a retry works; mirrors `loadPdfJsEngine` in
pdfpreview.js). `getJsPDF` (reads `window.jspdf`), `runAutoTable`, `addMonthsFormatted`,
`buildReportDoc` (logo/company header, title, job details, totals, the appliance-
register autotable built from a COLUMN LIST, failed-row tint, declaration, optional
signature on the side given by `signaturePosition`, header band fill from
`headerColor` with auto-contrast text, cert number + notes block when enabled; the
per-page footer prints "Generated {date} · PATGo {version}" unless
`showAppCredit===false`, and when the credit is on and `showFooterLogo!==false`
draws the embedded `PATGO_FOOTER_LOGO` to the LEFT of the credit text — subordinate
to the credit toggle; all images try/catch-guarded so a bad image never blocks the
report), `stampCertNumber(session)` (assigns `session.certNo` once on first report
when cert numbers are on), `reportFilename` (token substitution + sanitisation),
`produceReport` (**async** dispatch entry — v51: `await loadReportEngine()` with a
brief "Preparing report…" toast before building, on genuine load failure shows a
retryable info-sheet; gated by `reportSettings.enabled`; problem messages
→ `openInfoSheet`), `openReportPreview` (near-fullscreen modal; editable filename;
multi-page CANVAS view via `renderPreviewView()` → pdfpreview.js, with an old
single-page iframe fallback on any failure; a "Quick adjust" chip row that rebuilds
in place; an "Edit report settings" deep-link), `reopenReportPreview(sessionId)`,
`triggerDownload`, `shareOrDownloadReport`.
*Touch to:* change the report layout/content, add reading columns (future), or how
the PDF is previewed/shared/named/coloured.

## pdfpreview.js (~135 ln) — multi-page PDF preview engine — uses vendored PDF.js
`PDFJS_LIB_SRC`/`PDFJS_WORKER_SRC` (same-origin); `pdfPreviewEngineReady()`;
`loadPdfJsEngine()` (injects the PDF.js `<script>` ONCE via a shared promise, points
`GlobalWorkerOptions.workerSrc` at our same-origin worker, rejects on load error so
the caller can fall back, clears the promise so a retry can succeed once back online);
`renderPdfPagesToContainer(blob, container)` (renders every page to a stacked
`<canvas>`, DPR-capped at 2×, sequential to keep iOS peak memory low; cleans up as it
goes; throws on parse failure → caller's iframe fallback). The two heavy PDF.js files
are vendored but **not precached**; this loader fetches them lazily on first preview.
*Touch to:* change how the preview rasterises pages, the lazy-load, or the PDF.js
version.

## session.js (~2140 ln) — sessions, items & most logic
Presets: `activePreset`, `syncItemTypesFromActivePreset`, `switchPreset`,
`createPreset`, `renamePreset`, `deletePreset`, and the entry-screen long-press
switcher `openPresetSheet`/`closePresetSheet`/`switchPresetFromSheet` (switch only,
never logs). Core helpers: `uid`, `todayISO`, `activeSession`, `normaliseItemType`,
`normaliseLocation`, `calibrationStatus`, `nextAssetNo`, `getCarryForwardLocation`,
`findDuplicateAssetIndex`, `computeSuggestions`, `computeLocationSuggestions`,
`addDescriptionIfNew`, `sortedSessions`, `sessionMatchesControlFilters`,
`filteredSessions`. Theme: `applyTheme`. Export-state: `exportStatus`,
`markSessionExported`, `markSessionDirty`, `unexportedSessionCount`,
`unexportedSessions`, `prunableSessions`, `savePruneAge`, `pruneOldSessions`. Form:
`loadFormForCursor`. Validation: `validateBeforeSave`. Session/item actions:
`createSession` (stamps empty `notes`+`certNo`), `openSession`, `requestOpenSession`,
`confirmReopenWarning`, `cancelReopenWarning`, `deleteSession`, `saveItem`
(**v53** takes an optional `readings` arg — attached to the item only when the
feature is on and the object is non-empty; off-path item shape is byte-identical to
v52; on edit, a now-empty readings reconciles the stale key off),
`passClicked` (**v53** when readings on, opens the readings sheet in 'pass' mode
instead of committing — the PASS tap still fires first), `failClicked`,
`pickFailReason` (**v53** when readings on, opens the sheet in 'fail' mode carrying
the reason instead of committing), `cancelFailModal`, `copyLastResult`,
**v53 readings sheet lifecycle:** `openReadingsSheet(mode, failReason)` (builds the
draft — pass mode pre-fills class-applicable placeholders, fail mode leaves blank,
re-opening an item pre-fills from its stored readings), `setReadingsClass(cls)`
(re-derives visible fields; re-seeds placeholders for pass mode, preserving
user-edited values), `setReadingsField(field, value)` (live text write, no render),
`commitReadingsSheet()` (builds the readings object from applicable+filled fields and
calls `saveItem`; remembers `lastReadingsClass`), `cancelReadingsSheet()`,
`closeReadingsSheetState()` (resets all sheet transients; called on commit/cancel and
from loadFormForCursor/setView).
`deleteItem`, `moveCursor`, `skipToNew`, `jumpTo`, `setView`. Selection + bulk edit:
`enterSelectionMode`, `exitSelectionMode`, `toggleSelected`, `selectAllVisible`,
`clearSelection`, `applyBulkLocation`, `openBulkEditMenu`, `closeBulkEditMenu`,
`openBulkEditDialog`, `cancelBulkEditDialog`, `applyBulkType`, `applyBulkNotes`,
`applyBulkDelete`. (NB: the bulk-location dialog is opened via the v11 bulk-edit
menu `mode==='location'` path — the old standalone `openBulkLocationDialog` was
**removed in v50** as dead; `state.bulkLocationDialogOpen` and `applyBulkLocation`
remain, driven by that path + the `bulk-location-apply` action.) Edit-session:
`startEditSession`, `saveSessionEdits`, `unlockActiveSession`. Settings saves/resets:
`saveUserSettings`, `saveCsvColumnsSettings`, `resetCsvColumnsSettings`,
`moveCsvColumn`, `saveItemTypesSettings`, `saveFailReasonsSettings`,
`saveDescriptionsSettings`, `resetItemsToDefaults`, `resetFailReasonsToDefaults`,
`resetDescriptionsToDefaults`, `setTheme`, `setHaptics`, `setSound`, `setTimestamps`.
Report settings: `captureReportTextInputs`, `saveReportSettingsForm` (returns to the
report preview when `reportPreviewReturnSessionId` is set), `handleReportLogoFile`.
Report signature: `storeSignatureFromSource`, `handleReportSignatureFile`,
`removeReportSignature`, `setSignaturePosition`, `openSignaturePad`/`closeSignaturePad`/
`saveDrawnSignature`. Cert/notes/templates: `saveSessionNotes`, `setSessionCertNo`,
`applyReportTemplate`, `saveCurrentAsTemplate`, `renameReportTemplate`,
`deleteReportTemplate`. Export/Import-Setup UI: `toggleSetupIncludeOpen`,
`setSetupInclude`, `startShareSetup`, `insertReportFilenameToken`. First-run wizard:
`finishOnboarding`, `skipOnboarding`, `wizardChoosePath`, `wizardBack`,
`captureWizardStep`, `wizardNextStep`, `wizardPickTheme`, `wizardToggleDemo`,
`wizardFinishFresh`, `seedDemoSession`, `onboardSetupImport`, `restartOnboarding`.

**Welcome dismiss (v50):** the 17 near-identical `dismissVNNWelcome` functions were
replaced by ONE `dismissWelcome(seenFlag, key)` — sets `state[seenFlag]=true`,
persists `key`, re-renders. The `welcome-dismiss` action (dispatch.js) calls it with
`('v49WelcomeSeen', V49_WELCOME_KEY)`. A future feature release passes its own pair.

`setView` clears transient overlays on every transition (fail sheet, multi-pick
sheet, bulk-edit menus, client dialogs, the New Session form, `presetSheetOpen`).
**Note:** `state.view` is set directly from ~14 places, so per-render concerns
(scroll reset) live in `render()` via `_lastRenderedView`, NOT in `setView`.
*Touch to:* most logic changes — session/item lifecycle, suggestions, sorting,
filtering, theme, bulk edit, settings saves, the wizard/onboarding, the example
seed, the signature, cert numbers / job notes / report templates, the welcome
dismiss.

## render-core.js (~1720 ln) — main screens
Owns `const app = document.getElementById('app')` and the `render()` dispatcher
(rebuilds `#app.innerHTML` on every interaction; scroll-to-top + the Sessions scroll
restore live here via `_lastRenderedView`; **v53** the view router includes
`settingsReadings`). Sessions: `renderSessions`,
`renderSessionsListAreaHTML`, `refreshSessionsListAreaOnly`,
`renderBackupReminderBanner`. New-session form suggestions: `computeNfClientSuggestions`,
`computeNfSiteSuggestions`, `nfSuggestionsHTML`. Import modals:
`renderImportConflictModal`, `renderImportSummaryModal`. Entry: `renderEntry`
(**v53** builds the **readings sheet** when `readingsSheetOpen` — class-selector row
drives which measurement inputs render: pass mode shows all class-applicable fields
pre-filled, fail mode shows only the box the reason's tag points at, or none for a
visual/Other reason; reuses the `.fail-sheet` shell),
`refreshEntryAfterLog`. Overview: `computeVisibleOverviewItems`, `renderOverviewBodyHTML`,
`renderOverview` (Produce Report button when reporting on), `refreshOverviewBody`,
`refreshOverviewSelection`. Edit: `renderEditSession`. Reports hub: `renderReports`.
Shared: `emptyStateHTML(icon,title,body,actionLabel,actionName)`;
`refreshSettingsHubBodyOnly` (live settings search). The **welcome modal** block
(**v53** gates on `v53WelcomeSeen`; suppressed while the migration prompt or first-run
wizard is up; shows the PATGo icon; dismissed via the shared `welcome-dismiss`
action → `dismissWelcome`). The **first-run wizard** modal block (`wizardModal`,
renders when `!onboardedV33Seen && !migrationPrompt.show` — the 6-step commercial
onboarding). The **signature pad** modal (`signaturePadModal`, pointer-drawing wired
by `initSignaturePad()`/`clearSignaturePad()` after `app.innerHTML` is set). The
calibration warning banner. The tour view is routed here but lives in tour.js.
`render()` calls `bindFocusFields()` (events.js).
*Touch to:* change the Sessions list, Entry screen (incl. readings sheet), Overview,
Reports hub, Edit-session UI, empty states, the welcome modal, the first-run wizard,
the signature pad, the calibration banner, or the tour route.

## render-settings.js (~1305 ln) — settings screens
Two-level Settings. `renderSettingsHub` (category list from `SETTINGS_CATEGORIES` +
search box), `renderSettingsHubBodyHTML` (search results across all pages OR the
category list; re-rendered alone by `refreshSettingsHubBodyOnly` so the search box
keeps focus), `renderSettingsCategory`, `settingsPageSubtitle(pageId)`,
`settingsPageRowHTML(pageId, context)`, `renderSettingsSubHeader` + each
`renderSettings*` sub-page (User, Items, Fails, Readings, MultiPick, Descriptions,
Display, Backup, Csv, Clients, Report, Calculator, About, Contact, Setup) + calculator
helpers. **v53** `renderSettingsReadings` is the Test Readings page (single master
toggle `readings-toggle`, default off, persists instantly + re-renders; on-only help
text). `renderSettingsFails` (**v53**) shows per-reason tag `<select>`s
(`fail-reason-tag`, data-reason carries the reason text) BELOW the reasons textarea,
only when `readingsEnabled` — the tag decides which reading box a fail shows.
`renderSettingsReport` carries the Signature, Colours, Certificate-numbers,
Templates and "What to include" sections (the include toggles include
`report-show-appcredit` and the nested `report-show-footerlogo`). `renderSettingsItems`
carries the `.settings-tip` note about the entry-screen long-press preset switcher.
`renderSetupSection()` is wrapped by `renderSettingsSetup()` (its own page in the
Data category). **The About changelog lives here** (`renderSettingsAbout`) — a rolling
3-version window; v53 shows V53/V52/V51. The About page also has the "Set up another
device" (`restart-onboarding`) and "Show me around" (`open-tour`) cards, and a
long-press hidden menu on the title revealing three cloud-prep stub pages
(`renderCloudAccount`, `renderCloudSync`, `renderCloudSubscription` — mock data, for
the PAT Cloud phase).
*Touch to:* change any Settings page; the category structure (edit config.js, not
here); search aliases (config); or roll the About changelog.

## events.js (~342 ln) — focus-sensitive field binding (per-render)
`bindFocusFields()` — direct `oninput`/`onfocus`/`onblur` binds for the FOUR focus-
sensitive fields only: `nf-client`, `nf-site` (New Session autocomplete),
`f-location` (focus-clears-field + casing-on-blur + SQP row rebuild), `f-type`
(casing-on-blur). Plus the suggestion re-render helpers (`renderSuggestionsOnly`,
`renderNfSuggestionsOnly`, `renderLocationSuggestionsOnly`) that own the
`.suggestions` dropdowns (the `onmousedown→preventDefault` tap trick). Also binds the
**long-press gesture** on `#quick-grid` (arms a `QUICK_PICK_LONGPRESS_MS` timer; 12px
drift slop or early release aborts; on fire calls `openPresetSheet()` and a capture-
phase click handler swallows the one following tap). Everything else is delegated in
dispatch.js. Called from `render()` and `refreshEntryAfterLog()`.
*Touch to:* change one of the four autocomplete/casing fields, their dropdowns, or
the quick-pick long-press gesture. These stay direct because focus/blur timing can't
be safely delegated (the fragile iOS area).

## dispatch.js (~949 ln) — delegated event handling
The full delegated event system + three action registries, attached once to `#app`
at boot via `initDelegation`:
- **Clicks:** `ACTIONS` + `registerActions` + `handleDelegatedClick` (ancestor-walk
  by `data-action`/`data-arg`).
- **Input:** `INPUT_ACTIONS` + `registerInputActions` + `handleDelegatedInput`
  (routed by `data-input-action`).
- **Change:** `CHANGE_ACTIONS` + `registerChangeActions` + `handleDelegatedChange`
  (routed by `data-change-action`). `_fieldValue(el)` resolves checkbox/radio→checked
  else value.
Covers every screen's clicks/inputs/changes: session/item lifecycle, navigation,
selection + bulk edit, settings saves/toggles, report actions (incl.
`report-show-appcredit` + `report-show-footerlogo`), the report colour/theme/template
handlers, signature actions, Export/Import-Setup actions, the first-run wizard
actions, the tour actions, the preset-switcher sheet actions, and the destructive
confirms routed through `openConfirmSheet`/`openNameSheet`/`openInfoSheet`/`showToast`
(no native pop-ups remain anywhere in the app). **v53** adds the readings-sheet
actions (`readings-set-class`, `readings-commit`, `readings-cancel`), the reading-field
input actions (`f-reading-earth`/`-insulation`/`-leakage`), and two change actions
(`readings-toggle` — master flag, persists + renders; `fail-reason-tag` — writes the
reason→tag map and saves). The preset-switch-on-change reverts
`el.value` synchronously then opens `openConfirmSheet` (the last native `confirm`,
removed).

**Welcome dismiss (v50):** `'welcome-dismiss': () => dismissWelcome('v49WelcomeSeen',
V49_WELCOME_KEY)` — was a per-version `dismissVNNWelcome()` call; now the one
parameterised helper.
*Touch to:* add/route any delegated click/input/change handler. Only the four focus-
sensitive fields + the quick-pick long-press are NOT here (see events.js).

## boot.js (~146 ln) — startup, RUNS ON LOAD, must load LAST
Service worker: `registerServiceWorker`, `showUpdateBanner`, `applyUpdate`,
`dismissUpdateBanner`. Boot integrity guard `bootIntegrityOK()` verifies the critical
cross-file functions (`load`, `save`, `render`, `applyTheme`, `initDelegation`,
`loadFormForCursor`, `loadMultiPickConfig`, `loadClients`, `loadSites`,
`composeSiteSnapshot`) all loaded before any storage write; if not it shows an
"Update needed" reload prompt and SKIPS load()/render()/save() (guards the duplicate-
const data-loss class). Boot tail: the guard's else-branch runs `load()`,
`applyTheme(state.theme)`, then the crash-fallback `try { loadFormForCursor();
render(); } catch …`; `registerServiceWorker()` runs regardless.
*Touch to:* change startup sequence, the SW update banner, or the integrity guard.
The crash fallback that prevents a permanent blank screen lives here.
