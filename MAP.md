# PAT App — Code Map (V48)

Where each thing lives, so a feature change reads one or two small files instead
of the old monolithic `app.js`. Load order = the order below. `app.js` no longer
exists — the modular split is complete.
(c) 2026 Peter Birchley. All rights reserved.

> **This file is the index the read-discipline workflow depends on.** Read it
> first, then open only the file(s) it points to. It MUST be kept fully accurate
> every release — a stale map breaks the whole approach. If you ever open a file
> the map didn't point you to, the map is out of date: fix it.

## Load order (index.html) — 22 files (incl. 2 vendored libs)
`config.js` → `state.js` → `utils.js` → `storage.js` → `clients.js` → `sqp.js`
→ `multipick.js` → `feedback.js` → `csv.js` → `backup.js` → `session.js`
→ **`setup.js`** → **`tour.js`** → **`jspdf.umd.min.js`**
→ **`jspdf.plugin.autotable.min.js`** → **`report.js`** → **`pdfpreview.js`**
→ `render-core.js` → `render-settings.js` → `events.js` → `dispatch.js` → `boot.js`

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
`APP_VERSION` (V48); all `*_KEY` localStorage key names (incl. welcome keys,
latest `V46_WELCOME_KEY`, and the v33 first-run `ONBOARD_KEY`);
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
**v39:** `V39_WELCOME_KEY` (`pat:v39welcome`) — New Session polish welcome. No
other config change.
**v40:** `V40_WELCOME_KEY` (`pat:v40welcome`) — in-app-dialogs welcome. No other
config change.
**v41:** `V41_WELCOME_KEY` (`pat:v41welcome`) — import/restore/report error
sheets welcome. No other config change.
**v42:** `V42_WELCOME_KEY` (`pat:v42welcome`) — commercial onboarding welcome;
`DEMO_SESSION_FLAG` (`'isExample'`) — marks the opt-in example session built on
the fresh onboarding path (a harmless passthrough field). No data-model change.
**v43:** `V43_WELCOME_KEY` (`pat:v43welcome`) — calibration reminder + cloud
prep welcome; `PAT_AUTH_KEY` (`'pat:authUser'`) — mock OAuth auth state (userId,
authToken). Both additive; no backupVersion bump. **NOTE:** `V43_WELCOME_KEY`
and `state.v43WelcomeSeen` were defined but the welcome modal was never actually
wired to them (it still gates on `v42WelcomeSeen` and shows V42 copy). Left inert
and harmless — not removed, to avoid needless churn.
**v44:** `APP_VERSION` → 'V44'. No new keys; documentation/polish release.
**v45:** `APP_VERSION` → 'V45'; `V45_WELCOME_KEY` (`pat:v45welcome`) — the first
welcome key actually WIRED since V42 (V43/V44 rolled none). Rolling it freshly
also clears the long-standing "welcome modal still gates on `v42WelcomeSeen`"
debt. Onboarding-polish release; no other config change.
**v46:** `APP_VERSION` → 'V46'; `V46_WELCOME_KEY` (`pat:v46welcome`). Navigation
& UI polish release. No other config change.
**v47:** `APP_VERSION` → 'V47'; `V47_WELCOME_KEY` (`pat:v47welcome`);
`QUICK_PICK_LONGPRESS_MS` (2000) — hold duration for the entry-screen quick-pick
long-press preset switcher (single tunable constant; drop to ~600 if 2s feels
unresponsive). Long-press preset-switcher release.
**v48:** `APP_VERSION` → 'V48'; `V48_WELCOME_KEY` (`pat:v48welcome`). PATGo rebrand
release. `makeStarterReportTemplates`: the "Client summary" template's `reportTitle`
renamed 'PAT Test Summary' → 'PATGo Summary'. `makeDefaultReportSettings`: new
`showAppCredit: true` field (gates the PDF footer app-credit line; default true =
pre-v48 behaviour). No new storage key for it — rides in the reportSettings blob.
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
**v39:** `v39WelcomeSeen` (New Session polish welcome gate). No other state
change.
**v40:** `v40WelcomeSeen` (in-app-dialogs welcome gate). No other state change —
the dialog helpers are stateless transient overlays (locals in feedback.js).
**v41:** `v41WelcomeSeen` (error-sheets welcome gate). No other state change —
`openInfoSheet` is a stateless transient overlay like its siblings.
**v42:** `v42WelcomeSeen` (commercial-onboarding welcome gate); `wizardSeedDemo`
(transient step-5 example-session opt-in); `tourOpen` + `tourStep` (transient
full-screen walkthrough flags — never persisted, never in backups). The wizard
fresh path is now 6 steps (intro/path/details/branding/demo/finish); step state
stays transient.
**v45:** `v45WelcomeSeen` (the first wired welcome gate since V42). No other state
change — the onboarding polish is markup/CSS/copy only.
**v46:** `v46WelcomeSeen` (welcome gate); `sessionsScrollTop` (remembered Sessions
list offset). Transient — never persisted. The view-change detection that drives
the scroll restore lives in `render()` via a `_lastRenderedView` module variable,
not in state. No backup/codec change.
**v47:** `v47WelcomeSeen` (welcome gate); `presetSheetOpen` (entry-screen preset-
switcher bottom-sheet visibility — transient, cleared in `setView` and
`loadFormForCursor` exactly like `multiPickSheetOpen`). No backup/codec change.
**v48:** `v48WelcomeSeen` (welcome gate for the PATGo rebrand modal). No other
state change.
*Touch to:* add a new field to runtime state.

## utils.js (~90 ln) — pure helpers (no state access)
`escapeHTML`, `capitalise`, `titleCase`, `formatDate`, `formatTimeShort`,
`formatTimestampCSV`, `splitAssetNo`, `csvEscape`, `csvResultLabel`, `formatBytes`.
**v35:** `hexToRgb(hex, fallback)` (→ [r,g,b] for jsPDF; safe on garbage),
`contrastColor(rgb)` (black/white text by luminance), `safeHexColor(hex, fallback)`
(validate/normalise to '#rrggbb'; 3-char shorthand only honoured when '#'-prefixed,
so a bare hex-ish word can't slip through on the import path).
**v43:** `setupLongPress(element, durationMs, onLongPress)` — reusable long-press
detector (pointer events, default 2000ms). Returns cleanup function.
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
**v39/v40:** `load` reads `V39_WELCOME_KEY`/`V40_WELCOME_KEY` → the matching
welcome gates. No codec or backup change (`backupVersion` stays 5).
**v41:** `load` also reads `V41_WELCOME_KEY` → `state.v41WelcomeSeen`. No codec or
backup change (`backupVersion` stays 5).
**v42:** `load` also reads `V42_WELCOME_KEY` → `state.v42WelcomeSeen`. No codec or
backup change (`backupVersion` stays 5). The example session is an ordinary
session (the `isExample` marker rides through the codec as an unknown
passthrough field — confirmed by a serialise→parse round-trip in the V42 harness).
**v45:** `load` also reads `V45_WELCOME_KEY` → `state.v45WelcomeSeen` (it already
read `V43_WELCOME_KEY` though that modal was never wired). No codec or backup
change (`backupVersion` stays 5). The returning-user heuristic for the onboard
gate was left unchanged — a fresh install can't have the V45 flag, and upgraders
are already covered by the existing clauses.
**v46:** `load` also reads `V46_WELCOME_KEY` → `state.v46WelcomeSeen`. No codec or
backup change (`backupVersion` stays 5). Scroll-state fields are transient and not
loaded/saved.
**v47:** `load` also reads `V47_WELCOME_KEY` → `state.v47WelcomeSeen`. No codec or
backup change (`backupVersion` stays 5). `presetSheetOpen` is transient and not
loaded/saved.
**v48:** `load` also reads `V48_WELCOME_KEY` → `state.v48WelcomeSeen`.
`normaliseReportSettings` gains `showAppCredit` (default true via `!== false`; old
data/backups/setups without the field backfill to true — the same shared
normaliser used by the loader, backup restore, and template loading). No codec or
backup change (`backupVersion` stays 5).
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
**v40:** `deleteClient`/`deleteSite` now open `openConfirmSheet` (was native
`confirm`); the duplicate-name guards in `addClientFromDialog`/`renameClientFromDialog`/
`addSiteFromDialog`/`renameSiteFromDialog` now `showToast` (was native `alert`).
*Touch to:* change how clients/sites are stored or managed.

## sqp.js (~245 ln) — Smart Quick Pick (v18, ordering-quality pass v27)
`normaliseSqpLocation`, `sqpTokens` (v27: word-split for token matching),
`normaliseSqpHistory`, `loadSqpHistory`, `recordSqpUsage`, `buildSqpHistory`,
`bumpSqpHistoryVersion`, `sqpScoresForLocation` (v27: word-overlap match instead
of greedy substring + exact-match full / partial half weighting),
`smartOrderedItemTypes` (v27: swap-in floor `SQP_SWAP_IN_MIN` + staple protection
`SQP_STAPLE_DEFENCE`), `sqpRowForLocation`, `invalidateSqpRow`, `clearSqpHistory`,
`rebuildSqpHistory`, `setSqp`.
**v40:** `clearSqpHistory`/`rebuildSqpHistory` end with `showToast` (was native
`alert`); the confirm before each is now `openConfirmSheet` in dispatch.js.
*Touch to:* change how the quick-pick row adapts to location. v27 tuning
constants (`SQP_PARTIAL_WEIGHT`, `SQP_SWAP_IN_MIN`, `SQP_STAPLE_DEFENCE`) live in
config.js.

## multipick.js (~125 ln) — Multi Pick (v16)
`normaliseMultiPickConfig`, `loadMultiPickConfig`, `activeMultiPickSlots`,
`multiPickFire`, `saveMultiPickSettings`.
**v40:** the "enter a location first" guard in `multiPickFire` now `showToast`
(was native `alert`).
*Touch to:* change the multi-pick bottom sheet behaviour or its settings save.

## feedback.js (~370 ln) — toast + dialogs + haptic / flash / sound (v17, v40)
`showToast`, `confirmMigrationPrompt`; `_hapticOnce`, `haptic`, `flashEl`
(+ `FLASH_MS`, `FLASH_TINT`), `_getAudioCtx`, `_beep`, `playSound`,
`feedback` (+ `FEEDBACK_HAPTIC_COUNT`).
**v40:** in-app bottom-sheet dialogs that replace native `prompt()`/`confirm()`
(unreliable in iOS PWAs). `_openSheet(ariaLabel)` (shared backdrop+sheet builder
→ `{sheet, backdrop, cleanup}`); `openConfirmSheet({title, message, confirmLabel,
cancelLabel, danger=true, onConfirm})` (Cancel/confirm; `onConfirm` runs only on
confirm tap; danger→`.btn-danger`, else `.btn-primary`); `openNameSheet({title,
blurb, value, placeholder, confirmLabel, maxlength, onConfirm})` (single text
input, focus+select on open, Enter commits, empty value ignored, passes trimmed
value). All three reuse the proven `.bulk-sheet` pattern, no state, no re-render.
**v41:** `openInfoSheet({title, message, buttonLabel='OK', onClose})` — a
**stays-until-tapped** info/error sheet (the last native `alert()` replacement).
Same `.bulk-sheet` + backdrop, ONE `.btn-primary` button, and crucially **no
auto-dismiss timer** (unlike `showToast`) — an error must wait for the user. `×`/
backdrop/button all close; `onClose` (if given) runs once on any dismissal.
*Touch to:* change pass/fail/copy feedback channels, toasts, or the shared
confirm/name/info dialogs.

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
**v41:** the two import errors (parse failure via `result.error`, read error) now
open `openInfoSheet` instead of native `alert`.
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
**v40:** the restore-confirm is now `openConfirmSheet` and the success message a
`showToast` (both were native `confirm`/`alert`); the apply block moved inside the
sheet's `onConfirm` so dismissing leaves all current data untouched. The three
*import-error* alerts (bad JSON / unrecognised / read error) stay native this
release — deferred to V41's import-error info-sheet pass (a toast can't be used
for an error that must stay until read).
**v41:** those three restore errors (bad JSON / unrecognised file / read error)
now open `openInfoSheet`. No more native pop-ups in this file.
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
**v41:** the whole `importSetupFromFile` `onload` flow is now native-free — the
four errors (bad JSON / "that's a backup" / unrecognised / empty) → `openInfoSheet`,
the import confirm → `openConfirmSheet` (non-danger, "Import"), the success alert →
`showToast`, the read error → `openInfoSheet`. The apply block (`applySetupBundle`
+ `save` + toast + nav) moved inside the confirm sheet's `onConfirm`.

## tour.js (~210 ln) — guided feature walkthrough (v42) — NEW
The self-contained, full-screen feature tour (decision 6-i). It does NOT overlay
the live app or measure/point at real elements (the fragile iOS coachmark path we
avoided); instead each slide renders a static HTML/CSS **mock** of a screen with
one control highlighted (`.tour-hl`) plus a caption — built from the `.tour-*`
classes in styles.css, which reuse the app's colour variables. `TOUR_SLIDES`
(5 slides: sessions / quickpick / overview / reports / backup, each `{key, title,
caption, mock()}`). Control: `openTour` (sets `state.tourOpen` + `view='tour'`),
`tourNext`/`tourPrev`/`tourGoTo` (paging, clamped; advancing past the last slide
finishes), `closeTour` (drops the flags, `setView('sessions')`). Render:
`renderTour()` (the whole screen — counter, mock stage, caption, dot indicator,
back/next nav). All state transient (`state.tourOpen`/`tourStep`) — never
persisted, never in backups. Routed early in render-core's `render()` as a
full-screen view that owns `#app` (no banner/modals). Reuses `escapeHTML`
(utils), `setView`/`render` (session/render-core).
*Touch to:* change the walkthrough slides, their mocks/copy, or paging. Entry
points: the wizard finish step ("Show me around") and About ("Show me around the
app again").
**v45:** no tour.js change. The tour's slide-to-slide "jump" (caption/nav shifting
as each mock's height varied) was fixed in **styles.css** alone — `.tour-stage`
now has a fixed `min-height` and centres the mock, so the caption below it no
longer moves. Markup and slide content unchanged.

## session.js (~1320 ln) — sessions, items & most logic
Presets (`activePreset`, `syncItemTypesFromActivePreset`, `switchPreset`,
`createPreset`, `renamePreset`, `deletePreset`, **v47** `openPresetSheet`/
`closePresetSheet`/`switchPresetFromSheet` — the entry-screen long-press preset
switcher: open/close the bottom sheet and switch the active preset from it
(switch only, never logs; no unsaved-edit guard needed since the entry screen has
no preset-editing textarea)); core helpers (`uid`, `todayISO`,
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
**v39:** `dismissV39Welcome` (sets `v39WelcomeSeen` + persists `V39_WELCOME_KEY`).
`setView` now also closes the New Session form on every view transition (clears
`newForm.show`/`newFormError`/the nf-suggestion flags) — same dialog-clearing
discipline it already applies to the fail sheet, multi-pick sheet, bulk-edit
menus and client dialogs; fixes the form lingering open after navigating away
and back to Sessions.
**v46:** scroll-on-navigation does NOT live here. `state.view` is set from ~14
places (`setView` is only one — `openSession`/`createSession`/`jumpTo`/
`editSession` set it directly), so the behaviour lives in `render()`, the one
funnel they all call. See render-core notes.
**v40:** `dismissV40Welcome` (sets `v40WelcomeSeen` + persists `V40_WELCOME_KEY`).
Native `prompt()`/`confirm()`/`alert()` removed from the routine flows in favour
of `openConfirmSheet`/`openNameSheet`/`showToast` (feedback.js). Restructured to
async sheets (work moved into `onConfirm`): `pruneOldSessions`, `applyBulkDelete`,
`resetCsvColumnsSettings`, `setSessionCertNo` (dupe-warn), `applyReportTemplate`,
`resetItemsToDefaults`, `resetFailReasonsToDefaults`, `resetDescriptionsToDefaults`.
Success/validation messages (`applyBulkLocation`/`applyBulkType`/`applyBulkNotes`
results, `savePruneAge`, `validateBeforeSave` errors via `saveItem`/edit paths,
site-required, retest-period, column-visibility) now `showToast`. Template
save/rename confirmations live in dispatch.js (which opens the name sheet); these
functions just do the data write + a success toast.
**v41:** `dismissV41Welcome` (sets `v41WelcomeSeen` + persists `V41_WELCOME_KEY`).
No other session.js change.
**v42:** `dismissV42Welcome`. **First-run wizard rebuilt for commercial
onboarding** (fresh path now 6 steps: intro → path → details → branding → example
session? → all-set). `captureWizardStep` (saves the current step's engineer/cal/
company inputs to state on every transition so paging never loses input);
`wizardNextStep` (3→4→5→6, clamped); `wizardBack` (step-3 back returns to the path
chooser); `wizardPickTheme(id)` (step-4 report colour from `REPORT_COLOR_THEMES`);
`wizardToggleDemo(on)` (step-5 opt-in); `wizardFinishFresh(withTour)` (captures,
seeds the demo if opted in, `save()`s, finishes, optionally `openTour()`);
`seedDemoSession()` (builds ONE `isExample`-flagged session with 5 items / 1 fail,
mirroring `saveItem`'s item shape — fresh path only). `onboardSetupImport`/
`finishOnboarding`/`skipOnboarding`/`restartOnboarding` also reset `wizardSeedDemo`.
`ONBOARD_KEY` unchanged (`pat:onboardedV33`) so prior-onboarded upgraders aren't
re-onboarded. `handleReportLogoFile` (and the logo-remove handler in dispatch)
now also call `captureWizardStep` when onboarding is in progress, so the
company-name field survives the logo re-render.
**v45:** `dismissV45Welcome` (sets `v45WelcomeSeen` + persists `V45_WELCOME_KEY`)
— the first wired dismiss handler since `dismissV42Welcome`. No other session.js
change; the wizard copy/layout polish is in render-core + styles.
**v46:** `dismissV46Welcome` (sets `v46WelcomeSeen` + persists `V46_WELCOME_KEY`),
mirroring the V45 handler. (Scroll behaviour lives in render-core, not session.js.)
**v47:** `dismissV47Welcome` (sets `v47WelcomeSeen` + persists `V47_WELCOME_KEY`);
the three preset-switcher helpers (listed in the Presets group above);
`setView` + `loadFormForCursor` now also clear `state.presetSheetOpen`.
**v48:** `dismissV47Welcome` renamed → `dismissV48Welcome` (sets `v48WelcomeSeen`
+ persists `V48_WELCOME_KEY`); only referenced by the `welcome-dismiss` action.
*Touch to:* most logic changes — session/item lifecycle, suggestions, sorting,
filtering, theme, bulk edit, settings saves, the first-run wizard / onboarding,
the example-session seed, the signature, cert numbers / job notes / report
templates.

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
totals and the register when non-empty; **v48:** the page footer's left line is
"Generated {date} · PATGo {version}" by default, but reads just "Generated {date}"
when `reportSettings.showAppCredit === false`),
`stampCertNumber(session)` (**v36:** assigns `session.certNo` once on first report
when cert numbers are on — `certPrefix` with `{year}` token + zero-padded
`certNextNumber`, then increments the counter and persists; no-op if disabled or
already stamped),
`reportFilename` (**v31:** builds from `reportSettings.reportFilenamePattern`
with {site}/{client}/{date}/{engineer} token substitution + sanitisation; default
pattern reproduces the exact pre-v31 name), `produceReport` (dispatch entry —
gated by `reportSettings.enabled`; **v41:** the four problem messages — session
not found, engine-not-loaded-yet, build error, and the in-preview rebuild error —
now open `openInfoSheet` instead of native `alert`),
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
No native pop-ups remain here as of v41 (all four → `openInfoSheet`).

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
**v39:** welcome modal rolled to **V39** "What's new" (New Session polish), gated
by `v39WelcomeSeen`. Also: the New Session Client `<input>` (`nf-client`) lost its
`autofocus` attribute — it no longer steals focus on render, so the saved-clients
suggestion dropdown only opens when the user actually taps the field.
**v40:** welcome modal rolled to **V40** "What's new" (in-app dialogs replacing
native pop-ups), gated by `v40WelcomeSeen` (still suppressed while the wizard/
migration prompt shows). No other render-core change — the new confirm/name sheets
are built imperatively in feedback.js, not through render().
**v41:** welcome modal rolled to **V41** "What's new" (import/restore/report error
sheets), gated by `v41WelcomeSeen` (same wizard/migration suppression). Dismiss
button id `v41-welcome-dismiss`. No other render-core change.
**v42:** welcome modal rolled to **V42** "What's new" (commercial onboarding),
gated by `v42WelcomeSeen` (still suppressed while the wizard/migration prompt
shows — so upgraders see the modal, new installs see the wizard). The **first-run
wizard block rebuilt** for the 6-step fresh path (intro → path → details →
branding → example-session opt-in → all-set; the branding step reuses the report
logo input + colour-theme chips, the all-set step offers the walkthrough). Also:
`render()` routes the new full-screen **`tour`** view FIRST (before banners/
modals) — `app.innerHTML = renderTour()` and return, since the tour owns the whole
screen. Dismiss button id `v42-welcome-dismiss`.
**v43:** `renderCalWarningBanner()` — tester-calibration warning shown ONLY on
the **Sessions** screen (called inside `renderSessions()`, next to the
backup-reminder banner). Keys off `state.calDue` (the "Cal. Due" date, distinct
from `state.calDate` the cert date): returns `''` when no date, when the date is
unparseable, or when it is healthy (> `CAL_DUE_SOON_DAYS` = 30 days out), so a
healthy tester adds zero markup. Yellow `cal-due-soon` within 30 days, red
`cal-overdue` when past; an "Update" button (`edit-cal-date`) jumps to
Settings → User. **NOTE:** there is NO entry-screen calibration banner and NO
login/sign-in page — the V43 first build briefly added both, and both were
removed before release. Boot goes straight to Sessions; do not reintroduce
either. The V43 welcome modal was never wired (the modal still gates on
`v42WelcomeSeen` and shows V42 copy) — left as-is, harmless; see config.js notes.
**v44:** documentation/polish release — no render-core behaviour change. About
changelog rolled to V44/V43/V42. No welcome modal.
**v45:** **welcome modal RE-WIRED and rolled to V45** — gate now keys off
`v45WelcomeSeen` (was still on `v42WelcomeSeen`), dismiss button id
`v45-welcome-dismiss`, fresh "What's new in V45" copy. This is the first wired
modal since V42 and clears that inherited debt. **First-run wizard polished**
(copy/layout only, no new steps): each step now has an emoji header
(`.wizard-icon`); the fresh path (steps 3–6) shows non-interactive progress DOTS
(`.wizard-dots`/`-dot`/`-dot-on`) instead of "Step N of 6" text while steps 1–2
keep the simple `.wizard-steps` label; every step is split into a scrolling
`.wizard-body` + a pinned `.wizard-foot` (the action buttons) so the
Continue/Back/Skip controls no longer jump as you page between steps of different
heights; the finish step's tour card is restyled (`.wizard-finish-tour-title` +
`-sub`) with the walkthrough as the clear primary action and a muted
`.wizard-replay-note` ("replay from Settings → About"). All wizard handlers/actions
unchanged — purely presentational.
**v46:** **welcome modal rolled to V46** — gate keys off `v46WelcomeSeen`, dismiss
id `v46-welcome-dismiss`, fresh "What's new in V46" copy. **Scroll-on-navigation
is implemented here**, via a module-level `_lastRenderedView` tracker (alongside
`_lastRenderHadModal`). At the TOP of `render()` it compares the view about to be
drawn against the one drawn last render — this catches every transition because
all ~14 `state.view =` sites end by calling `render()` (capturing it in `setView`
missed `openSession` et al., which was the V46 first-cut bug). Rules: leaving the
Sessions list for an in-session view (entry/overview/editSession) reads the live
list `scrollTop` into `state.sessionsScrollTop` (read BEFORE `app.innerHTML` is
overwritten) AND tops the new page; returning to Sessions from an in-session view
restores that offset (applied at the END of render, after the list HTML exists);
any other genuine change tops out; same-view re-renders (logging, toggles,
dialogs, wizard/tour paging) do nothing. The `_pendingScrollTop` local carries the
decision from top to bottom of the function; `_lastRenderedView` is recorded last
from the final `state.view` (so a 935/1216 `!sess` bounce to sessions is handled).
The tour early-return also records `_lastRenderedView`. `refreshEntryAfterLog`
stays entry→entry so it intentionally leaves the tracker untouched and never
scrolls. **Tap-outside-to-close** added to three sheets whose backdrops previously
did nothing — welcome (`welcome-dismiss`), reopen-warning (`reopen-cancel`),
signature pad (`signature-pad-cancel`) — by putting the existing cancel action on
the `.modal-backdrop`. The wizard and v9 migration prompt backdrops are
deliberately left inert (forced-input flows must not be dismissed by a mis-tap).
**v47:** **welcome modal rolled to V47** — gate keys off `v47WelcomeSeen`, dismiss
id `v47-welcome-dismiss`, fresh "What's new in V47" copy. The entry-screen
quick-pick grid gains `id="quick-grid"` (the long-press gesture hook bound in
events.js). New **preset-switcher sheet** built in `renderEntry` (`presetSheet`,
rendered when `state.presetSheetOpen`): a `.fail-sheet preset-switch-sheet`
listing every `state.itemPresets` entry as a `.preset-switch-option` (active one
gets `.active` + a ✓), a name + item-preview subtitle, an "Edit presets" footer
(`preset-sheet-edit`), and a backdrop/✕ that close via `preset-sheet-close`. It
contains `fail-sheet` + `modal-backdrop`, so the existing `_lastRenderHadModal`
HTML-scan sweep tears it down on the next render automatically (no sweep-selector
change needed).
**v48:** welcome modal **rolled to V48** (PATGo rebrand) — gates off
`v48WelcomeSeen`, dismiss id `v48-welcome-dismiss`, aria-label "What's new in V48",
fresh rebrand copy (name/icon change + the new report-credit toggle). The
first-run wizard step 1 heading "Welcome to PAT Test" → "Welcome to PATGo".
*Touch to:* change the Sessions list, Entry screen, Overview, Reports hub, the
Edit-session UI, the empty states, the welcome modal, the first-run wizard, the
signature draw pad, the calibration warning banner, or the full-screen
walkthrough route (the tour itself lives in tour.js).
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
**v39:** About changelog rolled (V39 top, V36 dropped) — no other settings change.
**v41:** About changelog rolled (V41 top, V38 dropped; now lists V41/V40/V39) — no
other settings change.
**v42:** About changelog rolled (V42 top, V39 dropped; now lists V42/V41/V40); the
About page gains a **"Show me around"** card with the `open-tour` button (replays
the walkthrough), alongside the existing "Run first-time setup again".
**v43:** About changelog rolled (V43 top, V40 dropped; now lists V43/V42/V41) and
gains a **long-press hidden menu** (2-sec press on the title reveals cloud pages);
three new cloud-prep pages (not wired to main nav yet, revealed via long-press):
`renderCloudAccount` (mock user email, login timestamp, sign-out button),
`renderCloudSync` (sync status, last-synced timestamp, "Sync now" button),
`renderCloudSubscription` (plan/usage info, upgrade button). All three are stubs
with mock data for now; will integrate real cloud backend in the PAT Cloud phase.
**v45:** About changelog rolled (V45 top, V42 dropped; now lists V45/V44/V43). No
other settings change — the "Set up another device" and "Show me around" cards are
unchanged.
**v46:** About changelog rolled (V46 top, V43 dropped; now lists V46/V45/V44). No
other settings change.
**v47:** About changelog rolled (V47 top, V44 dropped; now lists V47/V46/V45). The
Quick Pick Items page (`renderSettingsItems`) gains a `.settings-tip` note in the
Preset section explaining the entry-screen long-press preset switcher (there is no
on-screen hint on the entry screen by design — decision 6B).
**v48:** About changelog rolled (V48 top, V45 dropped; now lists V48/V47/V46). The
Reports settings page (`renderSettings` reports section) gains a `report-show-appcredit`
toggle in "What to include" (wired in dispatch via `registerChangeActions` →
`CHANGE_ACTIONS`, persisted by the Reports Save button like its sibling toggles).
Brand strings → PATGo: About-row subtitle (`settingsAbout` subtitle), settings
footer, and About-page `#about-title` heading (the secret cloud-scaffold long-press
target is unaffected — only the visible text changed).
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
**v47:** `bindFocusFields` also binds a **long-press gesture** on `#quick-grid`
(the entry-screen quick-pick button grid). A timing-based hold can't go through
the delegated click system, so it's a direct bind here, re-applied every entry
paint like the focus fields. Touch/mouse start arms a `QUICK_PICK_LONGPRESS_MS`
(config, 2000) timer; finger drift beyond a 12px slop, or an early release/cancel,
aborts it; on fire it calls `openPresetSheet()` and sets a `didLongPress` flag
that a capture-phase `click` handler on the grid uses to swallow the one
follow-up tap (decision 2A — a preset switch must not also select that button's
item type). A normal quick tap never sets the flag, so quick-pick selection is
unchanged.

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
**v39:** `welcome-dismiss` now calls `dismissV39Welcome`. No new actions.
**v40:** `welcome-dismiss` now calls `dismissV40Welcome`. Template handlers
rewired to the in-app sheets (feedback.js): `report-template-rename`/`-save-new`
open `openNameSheet` (save-new warns via `openConfirmSheet` on a duplicate name;
rename warns on a name already used by another template), `report-template-delete`
opens `openConfirmSheet`. Destructive clicks now open `openConfirmSheet` instead
of native `confirm`: `delete-session`, `delete-current-item`, `delete-item`,
`sqp-rebuild`, `sqp-clear`, `preset-delete`, `about-reload`, `clients-rebuild`
(its result message → `showToast`); `preset-delete`'s "keep at least one preset"
and `preset-dialog-confirm`'s "name cannot be empty" guards → `showToast`. NOT
converted (deferred to V41's import-error pass): the preset-switch-on-change
`confirm` in `handleDelegatedChange` — it must revert the `<select>` synchronously
on cancel, which the async sheet can't do without a visible dropdown flip; left
native and flagged.
**v41:** `welcome-dismiss` now calls `dismissV41Welcome`. The deferred
`preset-switch` confirm is now resolved: on an unsaved-changes switch it reverts
`el.value` to `state.activePresetId` **synchronously first** (so the dropdown
never visibly jumps), THEN opens `openConfirmSheet` ("Discard & switch") whose
`onConfirm` runs `switchPreset(newId)`. This removes the last native `confirm` in
the app. No other dispatch change.
**v42:** `welcome-dismiss` now calls `dismissV42Welcome`. Wizard actions rewired
for the 6-step flow: `wizard-next` → `wizardNextStep`, plus new clicks
`wizard-theme` (data-arg theme id → `wizardPickTheme`), `wizard-finish` →
`wizardFinishFresh(false)`, `wizard-finish-tour` → `wizardFinishFresh(true)`;
change `wizard-seed-demo` (step-5 opt-in → `wizardToggleDemo`). Branding step
reuses the existing `report-logo-pick`/`report-logo-remove`/`report-logo-file`
actions (logo-remove now captures the wizard company field first). New tour
clicks: `tour-next`/`tour-prev`/`tour-goto` (data-arg index)/`tour-skip`, and
`open-tour` (the About replay button).
**v45:** `welcome-dismiss` now calls `dismissV45Welcome` (was `dismissV42Welcome`).
No other dispatch change — the wizard polish added no new actions (dots are
non-interactive, the body/foot split and emoji headers are markup only).
**v46:** `welcome-dismiss` now calls `dismissV46Welcome`. No new actions — the
tap-outside-to-close sheets reuse their existing `welcome-dismiss` / `reopen-cancel`
/ `signature-pad-cancel` actions, now also placed on the backdrops in render-core.
**v47:** `welcome-dismiss` now calls `dismissV47Welcome`. Three new click actions
for the preset-switcher sheet: `preset-sheet-close` (→ `closePresetSheet`),
`preset-sheet-pick` (data-arg = preset id → `switchPresetFromSheet`),
`preset-sheet-edit` (closes the sheet, then `setView('settingsItems')` to the
Quick Pick Items page). The sheet is OPENED from events.js (`openPresetSheet`, via
the long-press gesture), not from a click action.
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
