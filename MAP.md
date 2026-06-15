# PAT App — Code Map (V38)

Where each thing lives, so a feature change reads one or two small files instead
of the old monolithic `app.js`. Load order = the order below. `app.js` no longer
exists — the modular split is complete.
(c) 2026 Peter Birchley. All rights reserved.

> **This file is the index the read-discipline workflow depends on.** Read it
> first, then open only the file(s) it points to. It MUST be kept fully accurate
> every release — a stale map breaks the whole approach. If you ever open a file
> the map didn't point you to, the map is out of date: fix it.

## Load order (index.html) — 21 files (incl. 2 vendored libs)
`config.js` → `state.js` → `utils.js` → `storage.js` → `clients.js` → `sqp.js`
→ `multipick.js` → `feedback.js` → `csv.js` → `backup.js` → `session.js`
→ **`setup.js`** → **`jspdf.umd.min.js`** → **`jspdf.plugin.autotable.min.js`**
→ **`report.js`** → **`pdfpreview.js`** → `render-core.js` → `render-settings.js`
→ `events.js` → `dispatch.js` → `boot.js`

`boot.js` runs the startup block and must stay **last**. Later files may call
functions defined in earlier ones; nothing executes until `boot.js` because
every other file is function declarations sharing one global scope.

**v30:** the two vendored PDF libraries (jsPDF + autotable, MIT) load after
`session.js` and before `report.js`, which uses them. They are the first
third-party code in the app — see `THIRD-PARTY-LICENSES.txt`. They attach to
`window.jspdf` in the browser UMD build; `report.js` reads them from there.

**v38:** TWO more vendored files exist in the repo — `pdfjs.min.js` +
`pdfjs.worker.min.js` (PDF.js legacy UMD, Apache-2.0, ~1.5 MB total) — but they
are **NOT in this load order and NOT in sw.js ASSETS**. They are fetched lazily
from the app's own origin on the FIRST report preview by `pdfpreview.js`, which
IS in the chain (a small first-party loader). The lazy fetch is auto-cached by
the existing same-origin SW fetch handler into Cache Storage (separate from the
~5 MB localStorage data budget). After a cache bump they re-download once.

---

## config.js (~445 ln) — constants & defaults, pure data
`APP_VERSION` (V34); all `*_KEY` localStorage key names (incl. welcome keys,
latest `V34_WELCOME_KEY`, and the v33 first-run `ONBOARD_KEY`);
`MULTIPICK_MAX_SLOTS`, `PRUNE_AGE_DEFAULT`, `CAL_DUE_SOON_DAYS`,
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
category sub-lists, search matching, and back-navigation. **v33:**
`V33_WELCOME_KEY` + `ONBOARD_KEY` (first-run wizard "seen" flag); the `catData`
category now lists TWO pages (`settingsBackup`, `settingsSetup`) and
`settingsSetup` has its own `SETTINGS_PAGE_META` entry (Export/Import Setup is
now its own row, no longer embedded in the Backup page). **v34:**
`V34_WELCOME_KEY`; `REPORT_SIGNATURE_MAX_PX` (signature downscale cap, 400);
`makeDefaultReportSettings()` gains `signature` ('' base64 PNG) + `signaturePosition`
('left'); Report page search aliases include "signature". **v35:**
`V35_WELCOME_KEY`; `REPORT_DEFAULT_HEADER_COLOR` + `REPORT_DEFAULT_ACCENT_COLOR`
(reproduce the historic look) and `REPORT_COLOR_THEMES` (5 preset themes:
classic/navy/forest/burgundy/teal, each setting header+accent);
`makeDefaultReportSettings()` gains `headerColor` + `accentColor`; Report search
aliases include "colour theme header accent". **v36:** `V36_WELCOME_KEY`;
`REPORT_TEMPLATES_KEY`; `makeDefaultReportSettings()` gains cert fields
(`certEnabled` off, `certPrefix`, `certNextNumber`, `certPadding`);
`makeStarterReportTemplates()` (2 seed templates: Standard + Client summary, each
a full reportSettings snapshot); Report search aliases include "cert number
template preset notes".
**v38:** `V38_WELCOME_KEY` (`pat:v38welcome`) — multi-page PDF preview welcome.
No other config change (PDF.js paths are hard-coded in `pdfpreview.js`).
*Touch to:* add a storage key, change a default list, edit the calculator tables,
bump the version, change report/setup defaults, **or restructure Settings / add a
new settings page (edit `SETTINGS_CATEGORIES` + `SETTINGS_PAGE_META`)**.

## state.js (~290 ln) — the global `state` object
The single `let state = { ... }` runtime shape: sessions, form, view, all the
UI transients, welcome-modal flags, SQP/Multi Pick in-memory caches. **v30:**
`reportSettings` + `reportSettingsError` + `v30WelcomeSeen`. **v31:**
`v31WelcomeSeen`; `setupIncludeOpen` (disclosure state) + `setupInclude`
({sectionId:bool}, all true by default) + `setupError` — all transient Export/
Import Setup UI state, not persisted. **v32:** `v32WelcomeSeen`;
`settingsCategory` (the open category id, or null at the hub) + `settingsSearchQuery`
(live settings-hub search text) — transient two-level-Settings nav state. **v33:**
`v33WelcomeSeen` + `onboardedV33Seen` (persisted-flag mirrors; the latter gates the
first-run wizard) + transient `wizardStep` (1–3) and `wizardPath` ('' | 'import' |
'fresh').  **v34:** `v34WelcomeSeen`; transient `signaturePadOpen` +
`signaturePadHasInk` (draw-pad sheet visibility + whether any stroke has been
made, which gates the pad's Save button) — not persisted; the signature itself
lives on `reportSettings.signature`.  **v35:** `v35WelcomeSeen`; transient
`reportPreviewReturnSessionId` (set when "Edit report settings" is tapped in the
report preview, so the settings back/save returns to a rebuilt preview; null =
normal nav).  **v36:** `v36WelcomeSeen`; `reportTemplates` (array of {id, name,
settings} — saved full reportSettings snapshots). Per-session `notes` + `certNo`
live ON the session objects (set in createSession), not in top-level state.
**v38:** `v38WelcomeSeen` (multi-page-preview welcome gate). No other state
change — the preview's per-open transients (render token, blob/url) are locals
inside `openReportPreview`, not on global `state`.
*Touch to:* add a new field to runtime state.

## utils.js (~90 ln) — pure helpers (no state access)
`escapeHTML`, `capitalise`, `titleCase`, `formatDate`, `formatTimeShort`,
`formatTimestampCSV`, `splitAssetNo`, `csvEscape`, `csvResultLabel`, `formatBytes`.
**v35:** `hexToRgb(hex, fallback)` (→ [r,g,b] for jsPDF; safe on garbage),
`contrastColor(rgb)` (black/white text by luminance), `safeHexColor(hex, fallback)`
(validate/normalise to '#rrggbb'; 3-char shorthand only honoured when '#'-prefixed,
so a bare hex-ish word can't slip through on the import path).
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
**v33:** `load` reads `V33_WELCOME_KEY` + `ONBOARD_KEY` and computes
`state.onboardedV33Seen` — true if the key is set OR the install "looks like a
returning user" (has sessions, an engineer name, or any prior welcome flag). That
gate is what makes the first-run wizard show ONLY on a genuinely blank install;
everyone else gets the V33 welcome modal instead.
**v34:** `normaliseReportSettings` also validates `signature` (string kept else
'') + `signaturePosition` ('right' kept else 'left') — so the signature
round-trips through backup restore AND the setup bundle for free, and old
data/backups/setups backfill both fields cleanly; `load` reads `V34_WELCOME_KEY`.
**v35:** `normaliseReportSettings` also validates `headerColor` + `accentColor`
via `safeHexColor` (→ safe '#rrggbb' or default) — round-trip through backup +
setup for free, legacy data backfills the defaults; `load` reads `V35_WELCOME_KEY`.
**v36:** `normaliseReportSettings` also validates the cert fields (`certEnabled`
bool, `certPrefix` string, `certNextNumber`≥1, `certPadding` 0–10);
`loadReportTemplates`/`saveReportTemplates` (each template's `settings` validated
through `normaliseReportSettings`; seeds `makeStarterReportTemplates()` when none
stored); `load` reads `V36_WELCOME_KEY` + `state.reportTemplates`. Per-session
`notes`/`certNo` need no codec/validator work — they ride inside `sessions` and
the codec passes unknown fields through unchanged.
**v38:** `load` reads `V38_WELCOME_KEY` → `state.v38WelcomeSeen`. No codec or
backup change (PDF.js is cache-stored, never in localStorage or backups).
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
title/text), `shareOrDownloadCSV` (Web Share file-only → download fallback),
`copyCSV` (**v37.1 hotfix:** copies the CSV text to the clipboard via the async
Clipboard API with a textarea/`execCommand` fallback — added because v26's
"share file only" dropped iOS's share-sheet "Copy"; marks the session exported +
toasts; wired to `copy-current`/`copy-session`, shown as a 📋 button beside Share
on the Overview header and each sessions-list row). Import:
`buildCsvHeaderLookup`, `parseCSV`, `parseUkDateToIso`,
`parseImportCSV` (v26: recognises a `Client` column, composes snapshot),
`handleImportFile`, `commitImportedSession` (v26: learns client/site into lists),
`cancelImportConflict`, `closeImportSummary` (+ `EXPECTED_CSV_HEADER`).
*Touch to:* change CSV columns, export, or import parsing.

## backup.js (~270 ln) — Backup / Restore (v7)
`buildBackup` (v30: now includes `reportSettings`), `downloadBackup`,
`markBackupExported`, `snoozeBackupReminder`, `shouldShowBackupReminder`,
`restoreBackupFromFile` (v30: restores `reportSettings` via
`normaliseReportSettings` — old backups with no key restore to defaults, i.e.
reporting OFF). **v36:** `buildBackup` also includes `reportTemplates`; restore
rebuilds them (validated per-template) when present, else keeps the seeded
starters. Per-session `notes`/`certNo` ride inside `sessions` automatically (no
per-field work). `backupVersion` stays **5** — all v36 additions are additive and
missing-field-tolerant (same precedent as reportSettings in v30).
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
**v36:** the report section also carries `reportTemplates` (build + apply, each
validated like backup-restore), so a shared setup brings templates across too.
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
**v32:** welcome dismiss `dismissV32Welcome`. **v33: first-run wizard** —
`dismissV33Welcome`; `finishOnboarding` (sets `ONBOARD_KEY` + lands on Sessions),
`skipOnboarding`, `wizardChoosePath(path)` ('fresh'→step 3; 'import' handled by the
file input), `wizardBack`, `wizardFinishFresh` (reads the optional engineer/cal
inputs, `save()`s, then finishes), `onboardSetupImport(file)` (marks onboarded then
reuses `importSetupFromFile`), `restartOnboarding` (clears `ONBOARD_KEY`, reopens
the wizard — driven from About → "Run first-time setup again").
**v34: report signature** — `storeSignatureFromSource(src,w,h)` (shared canvas
downscale to `REPORT_SIGNATURE_MAX_PX` → PNG data URL on `reportSettings.signature`,
used by both upload and draw so they produce the identical string shape);
`handleReportSignatureFile` (upload path, mirrors `handleReportLogoFile`);
`removeReportSignature`; `setSignaturePosition('left'|'right')`; draw-pad
`openSignaturePad`/`closeSignaturePad`/`saveDrawnSignature` (reads the live
`#sig-pad-canvas`, stores via the shared path); `dismissV34Welcome`. (The pad's
pointer-drawing wiring is `initSignaturePad`/`clearSignaturePad` in render-core,
since it touches the live canvas after render.)
**v35:** `dismissV35Welcome`; `saveReportSettingsForm` now returns to the report
preview (via `reopenReportPreview`) when `reportPreviewReturnSessionId` is set
instead of the settings hub. (Report colour theme/picker handlers live in
dispatch.js; the preview quick-adjust + deep-link live in report.js.)
**v36:** `dismissV36Welcome`; `createSession` stamps new sessions with empty
`notes`+`certNo`; `saveSessionNotes(id,text)` + `setSessionCertNo(id,value)`
(manual cert override, warns on duplicate); template handlers
`applyReportTemplate` (confirm → overwrite live reportSettings),
`saveCurrentAsTemplate(name)` (new or overwrite-by-name),
`renameReportTemplate`, `deleteReportTemplate`; `captureReportTextInputs` also
reads the cert prefix/padding/next-number fields.
**v38:** `dismissV38Welcome` (sets `v38WelcomeSeen` + persists `V38_WELCOME_KEY`,
re-renders).
*Touch to:* most logic changes — session/item lifecycle, suggestions, sorting,
filtering, theme, bulk edit, settings saves, the first-run wizard, the signature,
cert numbers / job notes / report templates.

## report.js (~310 ln) — PDF reports (v30) — NEW
The PDF report builder + preview + share. `getJsPDF` (reads `window.jspdf`),
`runAutoTable`, `addMonthsFormatted` (retest date), `buildReportDoc` (logo/company
header, title, job details, tested/passed/failed totals, the appliance-register
autotable built from a COLUMN LIST, failed-row tint, footers, declaration; **v34:**
when `reportSettings.signature` is set, draws the signature image just above the
"Signed:" rule on the side given by `signaturePosition` ('left'|'right'), reserving
extra headroom and widening the footer-clearance page-break check; the blank ruled
line still prints when no signature — a bad image never blocks the report, same
try/catch guard as the logo; **v35:** the table header band fill uses
`reportSettings.headerColor` with auto-contrast text (`contrastColor`), the title
rule + totals tie-in use `accentColor`/`headerColor` via `hexToRgb`, and the
declaration Date line now prints the session test date instead of a blank rule;
**v36:** when `certEnabled` and the session has a `certNo`, prints it as the first
job-detail pair, and prints a "Notes" block from `session.notes` between the
totals and the register when non-empty),
`stampCertNumber(session)` (**v36:** assigns `session.certNo` once on first report
when cert numbers are on — `certPrefix` with `{year}` token + zero-padded
`certNextNumber`, then increments the counter and persists; no-op if disabled or
already stamped),
`reportFilename` (**v31:** builds from `reportSettings.reportFilenamePattern`
with {site}/{client}/{date}/{engineer} token substitution + sanitisation; default
pattern reproduces the exact pre-v31 name), `produceReport` (dispatch entry —
gated by `reportSettings.enabled`; friendly alert if the engine hasn't loaded),
`openReportPreview` (near-fullscreen iframe modal; **v31:** editable filename;
**v35:** a multi-page note when the doc has >1 page, a "Quick adjust" chip row
that flips `showFails`/`showCalibration`/`declaration`/`signaturePosition` and
rebuilds the PDF in place via an internal `rebuild()`, and an "Edit report
settings" deep-link that sets `reportPreviewReturnSessionId` and goes to settings;
**v38:** the single page-1-only iframe is replaced by a multi-page CANVAS view —
`renderPreviewView()` (token-guarded) calls `loadPdfJsEngine()` then
`renderPdfPagesToContainer()` (both in `pdfpreview.js`) to stack every page as a
`<canvas>` in a scrollable column; on any failure (e.g. first-ever preview while
offline) it swaps in the OLD single-page iframe + a "connect once" note, so it's
never worse than before. Called on open and after each `rebuild()`; `cleanup()`
bumps the render token so an in-flight async render is discarded),
`reopenReportPreview(sessionId)` (**v35:** rebuilds + reopens the preview, used by
the settings return hook), `triggerDownload`,
`shareOrDownloadReport` (OS share sheet → download fallback). Reuses
`splitSiteSnapshot` (clients.js), `formatDate`/`csvResultLabel`/`hexToRgb`/
`contrastColor` (utils.js), `todayISO`/`state` (session.js/state.js).
*Touch to:* change the report layout/content, add reading columns (future), or
change how the PDF is previewed/shared/named/coloured. **Uses the vendored MIT libs.**

## pdfpreview.js (~140 ln) — multi-page PDF preview engine (v38) — NEW
The lazy PDF.js loader + canvas renderer that powers the v38 multi-page preview.
`PDFJS_LIB_SRC`/`PDFJS_WORKER_SRC` (same-origin `./pdfjs.min.js` +
`./pdfjs.worker.min.js`); `pdfPreviewEngineReady()` (is `pdfjsLib` live with a
configured workerSrc); `loadPdfJsEngine()` (injects the PDF.js `<script>` ONCE —
one-shot shared promise — and points `GlobalWorkerOptions.workerSrc` at our
same-origin worker; rejects on load error so the caller can fall back, and clears
the promise so a later retry can succeed once back online);
`renderPdfPagesToContainer(blob, container)` (renders every page to a stacked
`<canvas>`, sized to container width, DPR-capped at 2×, sequential to keep iOS
peak memory low; calls `page.cleanup()`/`pdf.destroy()` as it goes; throws if the
engine isn't ready or the doc can't parse, caller catches → iframe fallback).
The two heavy PDF.js files are vendored in the repo but **not precached** (see
load-order note above + sw.js); this loader fetches them lazily from our origin
on first preview, and the SW fetch handler auto-caches them.
*Touch to:* change how the preview rasterises pages, the lazy-load behaviour, or
the PDF.js version. **Uses the vendored Apache-2.0 PDF.js files.**

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
welcome modal block. **v33:** the welcome modal is now the **V33** "What's new"
(first-run wizard + Export/Import Setup row), gated by `v33WelcomeSeen`; a separate
**first-run wizard** modal block (`wizardModal`) renders when
`!onboardedV33Seen && !migrationPrompt.show` — three bottom-sheet steps driven by
`state.wizardStep`/`wizardPath`. The two are mutually exclusive: the welcome modal
is suppressed whenever the wizard is showing, so a blank install sees the wizard
and an upgrader sees the modal. `settingsSetup` view routed in `render()`.
**v34:** welcome modal rolled to **V34** "What's new" (report signature), gated by
`v34WelcomeSeen` (still suppressed while the wizard shows); a `signaturePadModal`
bottom-sheet (canvas + Clear/Save/Cancel) renders when `state.signaturePadOpen`,
with its pointer-drawing wired by `initSignaturePad()` after `app.innerHTML` is set
(Pointer Events + `touch-action:none`; DPR-scaled backing store capped at 2×) and
`clearSignaturePad()` clearing it in place without a re-render.
**v35:** welcome modal rolled to **V35** "What's new" (report colours, preview
quick-adjust, filled date), gated by `v35WelcomeSeen`. (The report preview's
multi-page note + quick-adjust chips + settings deep-link all live in report.js's
`openReportPreview`, built directly into the DOM, not through render().)
**v36:** welcome modal rolled to **V36** "What's new" (cert numbers, job notes,
templates), gated by `v36WelcomeSeen`; `renderOverview` gains a job-details block
under the stats — a Job notes textarea (`session-notes`) and, when
`reportSettings.certEnabled`, a certificate-number input (`session-cert-no`); both
change-actions (fire on blur), hidden in selection mode and on locked sessions.
**v37:** entry-screen header back control (`sessions-btn`, `go-sessions`) now uses
the standard `‹` chevron instead of the 📁 folder glyph; the Overview non-selection
header keeps only Report (📄) + Share, and Select items + Session settings moved to
an `overview-action-row` of two text buttons (`select-mode-btn` "Select items",
`edit-session-btn` "Session settings") rendered under the stats (hidden in
selection mode; Select hidden when the session has no items).
**v38:** welcome modal rolled to **V38** "What's new" (multi-page PDF preview),
gated by `v38WelcomeSeen` (still suppressed while the wizard/migration prompt
shows). No other render-core change — the canvas preview lives in report.js/
pdfpreview.js, built directly into the DOM, not through render().
*Touch to:* change the Sessions list, Entry screen, Overview, Reports hub, the
Edit-session UI, the empty states, the welcome modal, the first-run wizard, or the
signature draw pad.
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
(Report "PDF file name" section, `renderSetupSection()`) unchanged. **v33:**
`renderSetupSection()` is no longer embedded in the Backup page — it's wrapped by
the new `renderSettingsSetup()` (its own `settingsSetup` page in the Data
category); `renderSettingsBackup` lost the embedded call. **About changelog lives
here** (`renderSettingsAbout`) — v33: V33 on top, V30 dropped; the About page also
gained a "Set up another device" card with the `restart-onboarding` button.
**v34:** `renderSettingsReport` gains a **Signature** section — preview + Draw/Upload
(or Replace/Remove when set) buttons + a left/right position segmented control,
plus the hidden `report-signature-file` input; About changelog rolled (V34 top,
V31 dropped).
**v35:** `renderSettingsReport` gains a **Colours** section — preset theme chips
(`report-theme`) + two native `<input type="color">` pickers (`report-header-color`,
`report-accent-color`); About changelog rolled (V35 top, V32 dropped).
**v36:** `renderSettingsReport` gains a **Certificate numbers** section
(`report-cert-enabled` toggle + prefix/digits/next-number inputs + a live "next
will look like" preview) and a **Templates** section (per-template Apply/Rename/
Delete rows + "Save current as template"); About changelog rolled (V36 top, V33
dropped).
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
calls `dismissV32Welcome`.
**v33:** clicks `wizard-next`, `wizard-back`, `wizard-skip`, `wizard-fresh`,
`wizard-import` (clicks the hidden `wizard-import-file` input), `wizard-finish`,
`restart-onboarding`; change `wizard-import-file` (→ `onboardSetupImport`);
`welcome-dismiss` now calls `dismissV33Welcome`.
**v34:** clicks `signature-upload` (clicks the hidden `report-signature-file`
input), `signature-remove`, `signature-position` (data-arg left|right),
`signature-draw` (opens the pad), `signature-pad-cancel`/`signature-pad-clear`/
`signature-pad-save`; change `report-signature-file` (→ `handleReportSignatureFile`);
`welcome-dismiss` now calls `dismissV34Welcome`.
**v35:** click `report-theme` (data-arg theme id → sets header+accent, saves,
re-render); changes `report-header-color` + `report-accent-color` (native colour
pickers → `safeHexColor` → save + re-render); `back-to-settings` now returns to a
rebuilt report preview when `reportPreviewReturnSessionId` is set (the preview's
"Edit settings" deep-link); `welcome-dismiss` now calls `dismissV35Welcome`.
**v36:** clicks `report-template-apply`/`report-template-rename` (prompt for
name)/`report-template-delete`/`report-template-save-new` (prompt for name);
changes `report-cert-enabled` (toggle), `session-notes` + `session-cert-no`
(Overview blur-saves via change, data-arg = session id); `welcome-dismiss` now
calls `dismissV36Welcome`. (Note: template rename/save-new use `prompt()` — a
pragmatic choice for low-frequency admin naming; a bottom-sheet input is the
"proper" iOS pattern if ever upgraded.)
**v38:** `welcome-dismiss` now calls `dismissV38Welcome`. No new actions — the
preview's canvas controls are wired directly in `openReportPreview` (report.js),
not delegated.
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
