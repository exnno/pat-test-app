# PATGo — Code Map (V60)

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

## Load order (index.html) — 21 first-party files
`config.js` → `state.js` → `utils.js` → `storage.js` → `clients.js` → `sqp.js`
→ `multipick.js` → `feedback.js` → **`bugreport.js`** → `csv.js` → `backup.js`
→ `session.js` → `setup.js` → `tour.js` → `report.js` → `pdfpreview.js`
→ `render-core.js` → `render-settings.js` → `events.js` → `dispatch.js` → `boot.js`

**v60 added `bugreport.js`**, placed immediately after `feedback.js` because it
calls `showToast`, and before everything that might want to report an error.
`index.html` now lists 21 scripts; `sw.js` ASSETS lists 23 `.js` entries
(21 first-party + 2 lazy-loaded jsPDF).

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

## config.js (~620 ln) — constants & defaults, pure data
`APP_VERSION` ('V59'); all `*_KEY` localStorage key names; the calibration/backup
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
(built-in tags for the shipped fail reasons). `DEFAULT_CSV_COLUMNS` gained five
default-hidden reading columns (`readingClass`, `readingEarth`, `readingInsulation`,
`readingLeakage`; **v55** added `readingPolarity` — 'Yes'/blank, Class I).
`SETTINGS_CATEGORIES` catTesting now lists `settingsReadings`;
`SETTINGS_PAGE_META` has its entry.

**v54 constants:** `READING_POLARITY_CLASSES` (['I']) — which classes show the
polarity checkbox (Class I only). `makeDefaultReportSettings()` gained
`showReadings` (default true) — prints reading columns on the PDF, gated at render
time by `readingsEnabled` + actual data so it's a no-op for non-readings users.
Welcome key is now `V54_WELCOME_KEY`.

**v55 constants:** Welcome key rolled to `V55_WELCOME_KEY` — superseded by v56 below.
No new structural constants — V55 added the `readingPolarity` CSV column (above)
and a PDF glyph fix in report.js; both additive.

**v59 constants (lifetime stats counter):** Welcome key rolled to
`V59_WELCOME_KEY` (`pat:v59welcome`) — **superseded by v60 above**.
`PAT_STATS_KEY` (`pat:archivedStats`) — the
persisted ARCHIVED half of the stats counter. `STATS_TYPE_MAP_MAX` (50) — cap on
how many item-type names the bucket keeps; only the top N by count survive a
write, so a typo'd type can't live in storage forever and a dropped entry can
never win "most common". `makeEmptyArchivedStats()` — factory (not a shared
object) returning `{items:0, fails:0, types:{}}`, used as both the default and
the validator's fallback. **`backupVersion` stays 5** — the bucket is additive on
the backup and missing-field-tolerant.

**v60 constants (bug report + leading zeros):** Welcome key rolled to
`V60_WELCOME_KEY` (`pat:v60welcome`). Bug report: `BUG_REPORT_EMAIL`
(`hello@patgo.co.uk`), `BUG_REPORT_TYPES` (3 × `{id,label,tag}` — the `tag` is what
lands in the email SUBJECT so an inbox sorts by type without being opened),
`BUG_REPORT_SEVERITIES` (3 × `{id,code,label}` — plain-language labels on screen,
`P1`/`P2`/`P3` codes in the subject), `BUG_REPORT_REPRO` (3 × `{id,label,text}`),
their three `*_DEFAULT`s, `BUG_REPORT_MIN_CHARS` (10 — the Send gate),
`BUG_ERROR_BUFFER_MAX` (3), `BUG_REPORT_MAX_BODY` (4000 — the mailto budget;
the DESCRIPTION is truncated against it, never the diagnostics, because the
diagnostics are the part a user cannot retype), and `makeEmptyBugDraft()`.
**`makeEmptyBugDraft()` MUST live here, not in bugreport.js** — `state.js` seeds
`state.bugDraft` from it at load time and runs long before bugreport.js is parsed;
defining it there would be a fatal boot-time `ReferenceError`. Leading zeros:
`ASSET_PAD_MAX` (12) — clamp so a hand-edited backup claiming a width of 5000
can't turn every asset number into a wall of zeros. No new storage keys →
**`backupVersion` stays 5**.

**v58 constants:** Welcome key was `V58_WELCOME_KEY` (`pat:v58welcome`).
`QUICK_PICK_LONGPRESS_MS` 2000 → **1000** (see above). `SETTINGS_CATEGORIES`
catHelp now lists `settingsGlossary` between `settingsAbout` and `settingsContact`;
`SETTINGS_PAGE_META` has its entry (📖 / 'Glossary' / a wide alias string so
settings-search finds it on 'jargon', 'terms', 'what does … mean' and on the
individual term names). No new storage keys, no data-model change →
**`backupVersion` stays 5**.

**v57 constants:** Welcome key was `V57_WELCOME_KEY` (`pat:v57welcome`) —
supersedes the v56 key below. No other constant changes: V57 is a bug-fix release
(bottom-sheet scrolling + suggestion-dropdown tap reliability), all behavioural, no
new storage keys → **`backupVersion` stays 5**.

**v56 constants (Retest reminders):** Welcome key was `V56_WELCOME_KEY`
(`pat:v56welcome`) — superseded by v57 above. `RETEST_REMINDERS_KEY` ('1'|'0' master feature flag, default
off — the feature is invisible everywhere when off). `RETEST_DUE_SOON_DAYS` (60)
and `RETEST_UPCOMING_DAYS` (90) — the chase-list urgency windows (wider than
calibration's 30 because winning repeat work needs lead time). `SETTINGS_CATEGORIES`
catReports now lists `settingsRetest`; `SETTINGS_PAGE_META` has its entry. No
`makeDefaultReportSettings()` change — the retest interval is read from the existing
`retestMonths` field and captured per-session in session.js. All retest data is
additive on the session object → **`backupVersion` stays 5**.

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
Quick-pick long-press: `QUICK_PICK_LONGPRESS_MS` (**1000 since v58**, was 2000) —
how long to hold the quick-pick grid before the preset switcher opens. The two
guards against an accidental open are independent of this number and unchanged:
the 12px drift slop in events.js (a moving finger aborts the timer, so scrolling
can't fire it) and the capture-phase click swallow that eats the tap following a
fired long-press.

**Welcome key (v50 pattern):** ONLY the current welcome key is defined — now
`V60_WELCOME_KEY = 'pat:v60welcome'`. The 28 historical keys (V12…V48) were removed
in v50; they were one-release markers nothing referenced after shipping. Old keys
remain harmlessly in users' localStorage and are detected by prefix in storage.js.
Each feature release replaces this one line with its new key and passes it to
`dismissWelcome()` — v59 is the current holder.

*Touch to:* add a storage key, change a default list, edit the calculator tables,
bump the version, change report/setup defaults, or restructure Settings / add a new
settings page (edit `SETTINGS_CATEGORIES` + `SETTINGS_PAGE_META`).

## state.js (~330 ln) — the global `state` object
**v60:** `v60WelcomeSeen` (replaces `v59WelcomeSeen`). Bug-report sheet state —
`bugSheetOpen` (bool) and `bugDraft` (seeded from `makeEmptyBugDraft()` in
**config.js**, which must load first). Both are **PURELY TRANSIENT**: never saved,
never backed up, never restored, no storage key, no validator, no migration. They
exist only between opening the sheet and sending or cancelling. Asserted in the
harness against storage.js, backup.js and setup.js.
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
('pass'|'fail'), `readingsDraft` ({class,earth,insulation,leakage,**polarity** —
v54 Class I bool, default false}),
`readingsPendingResult`, `readingsPendingFailReason`. All sheet transients reset on
close and on navigation (loadFormForCursor / setView) via `closeReadingsSheetState()`.

**v59:** `archivedStats` (`{items, fails, types:{name:count}}`) — the ARCHIVED half
of the lifetime stats counter, i.e. the tallies of sessions already pruned or
deleted. Persisted via `PAT_STATS_KEY` and carried through backup/restore. The LIVE
half is deliberately NOT in state — it's recomputed from `state.sessions` on demand
by `computeAppStats()`, so it can never drift out of step with the real data.

**Welcome flag (v50 pattern):** ONLY the current `v60WelcomeSeen` is kept. Historical
`vNNWelcomeSeen` flags were removed in v50 — each was written once and never read
after its release. The first-run-wizard gate detects past welcomes via
`hasAnyLegacyWelcomeKey()` (storage.js).

**v56 Retest reminders state:** `retestRemindersEnabled` (master feature flag,
loaded from `RETEST_REMINDERS_KEY`, default off) and `retestActionSessionId` (transient
id of the session whose contacted-action sheet is open in the reminders view; null =
none, cleared on any view change in `render()`). The Sessions `sessionFilter` gained a
`'retestdue'` value. Per-session retest data (`retestTrack`, `retestMonths`,
`retestContact`) lives ON the session objects, not in top-level state — see session.js.

*Touch to:* add a new field to runtime state.

## utils.js (~250 ln) — pure helpers (no state access)
**v60 asset-number padding:** `splitAssetNo(s)` now returns `{prefix, number, width}`
— `width` is the character count of the trailing digit run as typed (`'001'` → 3).
Before v60 it returned only `{prefix, number}` and the `parseInt` threw the zeros
away, which is why typing `001` produced `2` next. Width is reported for EVERY asset
number, not just padded ones (`'12'` → 2, which pads to a no-op), so the rule stays
uniform: *pad to the previous width*. `padAssetNumber(n, width)` — pads, and **NEVER
truncates** (`100` at width 2 → `'100'`, not `'00'`); width only ever grows, because
clipping would silently produce duplicate asset numbers on a real job. Clamped to
`ASSET_PAD_MAX`. `assetPadFromInput(v)` — derives a pad width from what was typed
into New Session, returning 0 unless the value BEGINS with a zero: padding is
**opt-in by deliberate act** (`'001'` → 3, `'1'` → 0, `'0'` → 0).
`escapeHTML`, `capitalise`, `titleCase`, `formatDate`, `formatTimeShort`,
`formatTimestampCSV`, `splitAssetNo`, `csvEscape`, `csvResultLabel`, `formatBytes`;
colour helpers `hexToRgb(hex,fallback)`, `contrastColor(rgb)`, `safeHexColor(hex,
fallback)`; `setupLongPress(element, durationMs, onLongPress)` (reusable pointer-
event long-press detector, returns a cleanup fn); **v53** `normaliseItemReadings(r)`
(validate/clean an item's readings object — returns clean {class,earth,insulation,
leakage} or null; the boundary validator used on backup restore and future cloud sync.
**v54:** also carries `polarity:true` through, but ONLY when the normalised class is in
`READING_POLARITY_CLASSES` (Class I) — a stale tick on a since-changed class is dropped;
false/absent writes no key. A Class I item with only polarity ticked is retained).
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
`showAppCredit`/`showFooterLogo` via `!== false` back-compat, **v54** `showReadings`
likewise, `reportFilenamePattern`,
`signature`/`signaturePosition`, `headerColor`/`accentColor` via `safeHexColor`, and
the cert fields). Templates: `loadReportTemplates`/`saveReportTemplates`.

**v59 stats bucket:** `loadArchivedStats()` (reads `PAT_STATS_KEY`, never throws —
corrupt or absent yields a clean empty bucket) and the shared boundary validator
`normaliseArchivedStats(candidate)` — used by load AND backup-restore AND on every
write in `saveSettings`, so a bad value can neither be read in nor persisted out.
Defensive on every field: non-object/array → empty; non-finite, negative or
fractional counts → 0; `fails` clamped to `items` (keeps the displayed percentage
inside 0–100); the type map keeps only string keys with a positive count and is
capped to `STATS_TYPE_MAP_MAX`, highest counts first.

**Welcome read + wizard gate (v50 pattern):** `load` reads ONLY `V60_WELCOME_KEY` →
`state.v60WelcomeSeen`. `hasAnyLegacyWelcomeKey()` scans localStorage for any
`pat:v<n>welcome` key — used by the first-run-wizard gate to recognise a returning
user without keeping a per-version flag. The gate:
`onboardedV33Seen = explicitlyOnboarded || sessions>0 || engineerName || hasAnyLegacyWelcomeKey()`.
This is a strict superset of the old seven-flag clause, so no upgrader is ever
mistaken for a new user; a blank install has none and correctly sees the wizard.

**v56:** `load` reads `RETEST_REMINDERS_KEY` → `state.retestRemindersEnabled` (default
off); `save` writes it. Per-session retest fields need no codec change (they ride the
session object through encode/decode wholesale, like other additive fields).

*Touch to:* change how data is stored/loaded/migrated. **Data integrity zone —
always backup-round-trip after edits.** `backupVersion` is **5**.

## clients.js (~427 ln) — Clients & Sites
Data model: `loadClients`, `loadSites` (orphan sites allowed — clientId may be
empty), `seedClientsSitesFromSessions`, `clientById`, `siteById`, `sitesForClient`,
`sortedClients`, `findClientByName`, `findSiteByName`, `ensureClient`, `ensureSite`,
`clientNameForSession` (**v56** — resolves a session's client name for the retest
reminders list; '' when no distinct client),
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

## bugreport.js (~330 ln) — one-tap problem reporting (v60, NEW FILE)
Three concerns, deliberately in one file because they only exist for each other.
**Error capture:** `_bugErrors` (module-level `let`, IN MEMORY ONLY — never written
to storage, so it cannot grow, corrupt a save or leak into a backup),
`recordBugError(kind,msg,source,line)` (defensive throughout — it runs from a global
error handler, so a throw in here would be an error inside the error handler),
`initErrorCapture()` (binds `window.onerror` + `unhandledrejection`; called ONCE from
`boot.js`, guarded there on `typeof` and wrapped in try/catch so it can never stop
the app starting), `bugErrorSummary()`. KNOWN LIMIT: boot.js loads last, so a
PARSE-time failure in an earlier file predates these handlers — that class is covered
by the boot integrity guard's own screen instead.
**Diagnostics:** `_bugStorageKB()`, `_bugDisplayMode()` (installed PWA vs browser tab),
`refreshBugCacheName()` (async — reads the LIVE service-worker cache name off the
device; the single most valuable line in a report, because a cache-first PWA can serve
a build several versions old while About shows whatever its *cached* config claims),
`collectDiagnostics()` (ordered `[KEY, value]` pairs), `diagnosticsText()`.
**⚠ THE PRIVACY RULE — the reason this file reads as it does: diagnostics carry
COUNTS AND FLAGS ONLY.** No client names, site names, asset numbers, locations, item
types, notes or cert numbers. A support email must never be a route for a customer's
data to leave an engineer's phone. If you add a field, check it against that rule
first — the smoke harness asserts it (and is mutation-tested to prove the assertion
can fail).
**The report:** `openBugSheet`/`closeBugSheet`, `setBugType`/`setBugSeverity`/
`setBugRepro` (taps — these DO render), `setBugField` (typing — deliberately does NOT
render, or the textarea would lose its caret; it syncs the Send button's `disabled`
directly via `_syncBugSendButton()` instead), `bugDescriptionReady()`,
`bugSubjectLine()` (`[PATGo BUG P1] V60 — first 40 chars`), `bugBodyText()`,
`sendBugReport()` (mailto — NOT a network POST, because the app is offline-first and
engineers are usually somewhere with no signal when something breaks; the mail client
queues it), `copyBugReport()` (clipboard fallback, same textarea/`execCommand`
technique as `copyCSV`).
*Touch to:* change what's collected, the report format, the severity/type options, or
the error catcher. The SHEET MARKUP is not here — it's `renderBugSheet()` in
render-settings.js (render files own markup).

## csv.js (~665 ln) — CSV build + import
Build/share: `csvCellValue` (adaptive client/site columns; **v53** four reading
cases — `readingClass`/`readingEarth`/`readingInsulation`/`readingLeakage` — each
emits blank when the feature is off, the column hidden, or the item has no reading;
otherwise the as-typed value; **v55** a fifth case `readingPolarity` — emits 'Yes'
when a Class I item recorded a polarity tick, blank otherwise), `buildCSV`,
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
rule as load; old backups with missing fields restore to defaults. **v54:** the same
`normaliseItemReadings` pass now also carries the Class I `polarity` tick through —
additive, so older backups without it restore unchanged. **v56:** the restore loop also
calls `normaliseSessionRetest(s)` per session — coerces/strips the retest fields
(`retestTrack`/`retestMonths`/`retestContact`) so a hand-edited backup can't carry
garbage; pre-v56 sessions without the fields are untouched). Restore confirm =
`openConfirmSheet`, success = `showToast`, the three import errors = `openInfoSheet`.
`backupVersion` stays **5** — readings (incl. v54 polarity) AND v56 retest fields are
additive and missing-field-tolerant (items/sessions ride through wholesale; an old app
ignores the unknown key, a new app reads it). The readings feature, v54's polarity and
v56's retest fields deliberately did NOT spend a bump; the earmarked 6 is reserved
for a genuine incompatible schema change.
**v59:** `buildBackup` carries `archivedStats`; the restore path sets
`state.archivedStats = normaliseArchivedStats(data.archivedStats)` through the SAME
storage.js validator as load. Restore means restore — the counter returns to exactly
what it was when the backup was taken, so live + archived stays self-consistent
instead of desyncing. A pre-v59 backup has no such key and correctly yields an empty
bucket (the total then reflects exactly the sessions in that backup). Additive and
missing-field-tolerant → **`backupVersion` stays 5**.
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
**v59 note:** the archived stats bucket is deliberately **NOT** in the setup bundle.
Export Setup is config-only, and the stats are derived from job data — a shared setup
must never carry another engineer's totals.
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
pdfpreview.js). `getJsPDF` (reads `window.jspdf`), `pdfSafe(v)` (**v55** — swaps the
few WinAnsi-incompatible glyphs that previously misprinted on the certificate: Ω→Ohms,
MΩ→MOhms, ≥→`>=`, ≤→`<=`, ✓→Yes; applied to the autotable head + body only, so the
on-screen sheet and CSV keep the real Unicode symbols), `runAutoTable`, `addMonthsFormatted`,
`buildReportDoc` (**v54:** opens by computing the reading columns and choosing page
ORIENTATION before creating the doc — see below; then) logo/company header, title,
job details, totals, the appliance-register autotable built from a COLUMN LIST,
failed-row tint, declaration, optional
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

**v54 reading columns + orientation (top of `buildReportDoc`):** reading columns are
gated three ways — `state.readingsEnabled` AND `reportSettings.showReadings!==false`
AND at least one item actually carries that reading (emit-only-if-used, mirroring the
CSV rule). Columns, in order after Result: `Class`, `Earth Continuity (Ω)`,
`Insulation Resistance (MΩ)`, `Leakage (mA)`, `Polarity` (prints `✓` for a ticked
Class I item, blank otherwise; column appears only when some item ticked it). `Notes`
stays rightmost. The column count then drives orientation: base cols (4 + Notes) plus
reading cols; **>6 total → landscape**, else portrait. So a readings-off or clean job
is byte-identical to v53 and stays portrait; a full Class I job goes landscape
automatically. `columnStyles` keeps reading cols compact + centred (Class/Polarity
38pt, numeric 66pt) so long headers wrap rather than crush Description/Location. All
header/details/totals layout is width-relative (`pageW`/`margin`), so landscape needed
no header rework. NOTE: Ω/MΩ/✓/≥ render in jsPDF's standard font at a fallback glyph
width (acceptable in short header/cell text; pre-existing for ≥ since v53).
*Touch to:* change the report layout/content, adjust reading columns or the
orientation threshold, or how
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
**v60 leading zeros:** `nextAssetNo` pads via three paths — first item of a job pads
`startNumber` to `session.startPad`; a normal increment pads to the width of the
PREVIOUS item's own digits (so hand-typed padding mid-job is followed); a non-numeric
last item falls back to `startNumber + items.length` at `startPad`. `startPad` is
**absent on every pre-v60 session**, so `padAssetNumber` sees `undefined`, treats it
as width 0, and returns the number unchanged — **old jobs behave exactly as before,
no migration needed**. `createSession` records `startPad: assetPadFromInput(startNo)`.
`findDuplicateAssetIndex` is **deliberately unchanged** (decision 8A): `'001'` and
`'1'` remain DIFFERENT asset numbers, because the label on the appliance is the
identity — if you typed the zeros, you meant them.
`findDuplicateAssetIndex`, `computeSuggestions`, `computeLocationSuggestions`,
`addDescriptionIfNew`, `sortedSessions`, `sessionMatchesControlFilters`,
`filteredSessions`. **v59 lifetime stats counter:** `sessionCountsForStats(sess)` (excludes the
demo/example session — `DEMO_SESSION_FLAG` — from BOTH halves, so a new user who
accepted the example job doesn't start inflated and deleting it later archives
nothing); `tallySessions(sessions)` (PURE — returns `{items, fails, types}` for an
array of sessions; shared by the live count and the archive hook so the two can
never disagree about what counts); `archiveSessionStats(sessions)` (folds the
tallies of sessions ABOUT TO BE REMOVED into `state.archivedStats` — **must be
called before they're filtered out**, and is deliberately paired with a removal
rather than being a general helper, because calling it twice for one session would
double-count); and `computeAppStats()` (the display figure — live + archived,
returns `{items, fails, failRate (1dp string), topType}` or **null** when there's
nothing to show, so the caller omits the line rather than printing "0 tested";
ties on most-common break alphabetically so the winner is stable between renders).
**The two hooks are the whole feature:** `deleteSession` archives the session
before filtering it out, and `pruneOldSessions`'s `onConfirm` archives `targets`
before removing them. Both already call `save()` immediately after, which persists
the bucket via `saveSettings` — no new save path. There are exactly FOUR places
`state.sessions` is reassigned (load, restore, prune, delete); the latter two are
these hooks, so no removal path is unaccounted for. Item-level deletes are
deliberately NOT archived — that's correcting a mis-entry, not history leaving.
Theme: `applyTheme`. Export-state: `exportStatus`,
`markSessionExported`, `markSessionDirty`, `unexportedSessionCount`,
`unexportedSessions`, `prunableSessions`, `savePruneAge`, `pruneOldSessions`.
**v56 Retest reminders (commercial chase list):** `defaultRetestMonths()` (reads the
global `reportSettings.retestMonths`, falls back to 12), `retestDueDate(sess)` /
`retestDaysUntil(sess)` (compute due date = session.date + captured months; days from
today, negative = overdue), `retestStatus(sess)` (→ 'resolved'|'overdue'|'duesoon'|
'upcoming'|'later'|null), `isRetestActive(sess)` (on the active chase list = overdue/
duesoon/upcoming and unresolved), `activeRetestReminders()` (filtered + sorted most-
urgent-first) / `activeRetestCount()`, and the mutators `retestFlag(id)` (captures the
interval at flag time), `retestUnflag(id)` (clears all three fields), `retestSetMonths(
id, m)` (clamped 1–120), `retestSetContact(id, status)` ('booked'|'declined'|null —
both non-null statuses resolve it off the list), plus the restore guard
`normaliseSessionRetest(sess)` (called from backup.js — coerces/strips garbage, mirrors
normaliseItemReadings). Per-session fields: `retestTrack` (bool), `retestMonths` (int),
`retestContact` ({status, at}|null). Form:
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
re-opening an item pre-fills from its stored readings; **v54** also restores the
`polarity` tick), `setReadingsClass(cls)`
(re-derives visible fields; re-seeds placeholders for pass mode, preserving
user-edited values; **v54** clears `polarity` when the new class isn't in
`READING_POLARITY_CLASSES`), `setReadingsField(field, value)` (live text write, no
render), **v54** `toggleReadingsPolarity()` (flips the draft polarity bool — DOES
render, since it's a tap not typing; guarded to Class I so it can't tick a
non-polarity class), `commitReadingsSheet()` (builds the readings object from
applicable+filled fields and calls `saveItem`; **v54** appends `polarity:true` only
when class is Class I AND ticked; remembers `lastReadingsClass`),
`cancelReadingsSheet()`,
`closeReadingsSheetState()` (resets all sheet transients incl. polarity; called on
commit/cancel and from loadFormForCursor/setView).
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
persists `key`, re-renders. The `welcome-dismiss` action (dispatch.js) calls it with the current pair —
`('v60WelcomeSeen', V60_WELCOME_KEY)` as of v60. Each feature release passes its own.

`setView` clears transient overlays on every transition (fail sheet, multi-pick
sheet, bulk-edit menus, client dialogs, the New Session form, `presetSheetOpen`).
**Note:** `state.view` is set directly from ~14 places, so per-render concerns
(scroll reset) live in `render()` via `_lastRenderedView`, NOT in `setView`.
*Touch to:* most logic changes — session/item lifecycle, suggestions, sorting,
filtering, theme, bulk edit, settings saves, the wizard/onboarding, the example
seed, the signature, cert numbers / job notes / report templates, the welcome
dismiss.

## render-core.js (~1830 ln) — main screens
Owns `const app = document.getElementById('app')` and the `render()` dispatcher
(rebuilds `#app.innerHTML` on every interaction; scroll-to-top + the Sessions scroll
restore live here via `_lastRenderedView`; **v53** the view router includes
`settingsReadings`; **v58** adds `settingsGlossary`; **v56** adds `retestReminders` + `settingsRetest`, and clears the
transient `retestActionSessionId` on any non-reminders view). Sessions: `renderSessions`,
`renderSessionsListAreaHTML` (**v56** the session row shows a 🔔 retest chip when the
feature is on and the session is on the active chase list; the Status filter gains a
"Retest due" option, feature-gated), `refreshSessionsListAreaOnly`,
`renderBackupReminderBanner`, **v56** `renderRetestBanner` (Sessions banner — only when
feature on AND ≥1 active reminder; reuses `.cal-banner` styling; separates overdue from
due-soon in the count; "View" → reminders view). New-session form suggestions:
`computeNfClientSuggestions`,
`computeNfSiteSuggestions`, `nfSuggestionsHTML`. Import modals:
`renderImportConflictModal`, `renderImportSummaryModal`. Entry: `renderEntry`
(**v53** builds the **readings sheet** when `readingsSheetOpen` — class-selector row
drives which measurement inputs render: pass mode shows all class-applicable fields
pre-filled, fail mode shows only the box the reason's tag points at, or none for a
visual/Other reason; reuses the `.fail-sheet` shell),
`refreshEntryAfterLog`. Overview: `computeVisibleOverviewItems`, `renderOverviewBodyHTML`,
`renderOverview` (Produce Report button when reporting on), `refreshOverviewBody`,
`refreshOverviewSelection`. Edit: `renderEditSession` (**v56** when the feature is on,
adds the per-session retest control — a flag toggle + interval input + computed due
date + the booked/declined status line; instant-apply, not part of the editForm draft).
Reports hub: `renderReports`. **v56 Retest reminders view:** `renderRetestReminders`
(the client/site-centric chase list, most-urgent-first, each row tappable to open the
session, with a ✓ action opening the contacted-action sheet: Rebooked / Declined / stop
reminding; defence-bounces to Sessions when the feature is off).
Shared: `emptyStateHTML(icon,title,body,actionLabel,actionName)`;
`refreshSettingsHubBodyOnly` (live settings search). The **welcome modal** block
(**v60** gates on `v60WelcomeSeen`; suppressed while the migration prompt or first-run
wizard is up; shows the PATGo icon; dismissed via the shared `welcome-dismiss`
action → `dismissWelcome`). **v57:** the preset sheet's list carries
`.sheet-scroll` (styles.css) — the class that makes a long list scroll inside the
capped sheet shell instead of growing off the top of the screen. The **first-run wizard** modal block (`wizardModal`,
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
Display, Backup, Csv, Clients, Report, Retest, Calculator, About, **Glossary**, Contact,
Setup) + calculator helpers. **v56** `renderSettingsRetest` is the Retest Reminders page (master toggle
`retest-reminders-toggle`, default off, persists instantly + re-renders; on-only
how-it-works text + the honest "in-app, not push" note + a "View N reminders" jump
when any are active; `settingsPageSubtitle` shows Off / On · N due). **v53** `renderSettingsReadings` is the Test Readings page (single master
toggle `readings-toggle`, default off, persists instantly + re-renders; on-only help
text). `renderSettingsFails` (**v53**) shows per-reason tag `<select>`s
(`fail-reason-tag`, data-reason carries the reason text) BELOW the reasons textarea,
only when `readingsEnabled` — the tag decides which reading box a fail shows.
`renderSettingsReport` carries the Signature, Colours, Certificate-numbers,
Templates and "What to include" sections (the include toggles include
`report-show-appcredit` and the nested `report-show-footerlogo`). `renderSettingsItems`
carries the `.settings-tip` note about the entry-screen long-press preset switcher.
`renderSetupSection()` is wrapped by `renderSettingsSetup()` (its own page in the
Data category). **v59** `renderStatsFooterHTML()` — the lifetime stats line under the Settings hub
footer (`renderSettingsHub` appends it). Reads `computeAppStats()` (session.js) and
returns **`''`** when that's null, so a blank install shows nothing rather than
"0 tested"; the "Most common" clause is also dropped when no item carries a type.
Item types are `escapeHTML`-ed. Styled `.settings-footer .settings-stats`.
**v58** `GLOSSARY_GROUPS` (a top-level `const` in this file — five groups: Testing /
Test Readings / Jobs & sessions / Output / Data, each an array of `[term, definition]`
pairs) and `renderSettingsGlossary()`, which maps it to `<dl class="glossary-list">`
blocks. Static and read-only: no state, no actions, no storage, nothing in dispatch.
The terms are DATA rather than hand-written HTML so adding one is a single line and the
markup can't drift between entries; `settingsPageSubtitle('settingsGlossary')` counts
the array so the row subtitle can never disagree with the page. NOTE: `GLOSSARY_GROUPS`
is declared BELOW `settingsPageSubtitle` in this file — fine, because subtitles are only
computed at render time (after every file has executed), never at load time. **v58**
`renderSettingsContact` carries the real details — a `mailto:` link to
`hello@patgo.co.uk` and a `target="_blank" rel="noopener noreferrer"` link to
`https://www.patgo.co.uk` (displayed as `patgo.co.uk`), both `.contact-link` for a
finger-sized hit area; the placeholder "Support hours" block was removed. Plain `<a>`
elements are safe inside `#app` because `handleDelegatedClick` returns early when no
ancestor carries `data-action`, leaving the link's default behaviour intact.
**v60** `renderSettingsContact` replaced the old static "what to include in a bug
report" advice card with a **Report a problem** button (`data-action="bug-open"`) and
a privacy line. `renderBugSheet()` (also here) is the sheet MARKUP — all its logic
lives in bugreport.js. Two rendering rules before editing it: the type/severity/repro
rows use `data-action` and DO trigger a full re-render (a tap has no caret to lose);
the two `<textarea>`s use `data-input-action` and do NOT re-render, which is why the
Send button's disabled state is synced on the element by `_syncBugSendButton()` rather
than falling out of a render pass. Everything user-typed goes through `escapeHTML`,
including the diagnostics preview (asserted in the harness).
**The About changelog lives here** (`renderSettingsAbout`) — a rolling
3-version window; v60 shows V60/V59/V58 (V57 dropped). The About page also has the "Set up another
device" (`restart-onboarding`) and "Show me around" (`open-tour`) cards, and a
long-press hidden menu on the title revealing three cloud-prep stub pages
(`renderCloudAccount`, `renderCloudSync`, `renderCloudSubscription` — mock data, for
the PAT Cloud phase).
*Touch to:* change any Settings page; add or reword a glossary term (edit
`GLOSSARY_GROUPS` — one line per term, nothing else needs changing); the contact
details; the category structure (edit config.js, not here); search aliases (config);
or roll the About changelog.

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

**v57 / v57.1 — dropdown tap reliability.** All three suggestion dropdowns
(`renderSuggestionsOnly`, `renderNfSuggestionsOnly`, `renderLocationSuggestionsOnly`)
**commit the pick on `pointerdown`**, via the shared `makeSuggestionCommit(apply)`
factory (`el.onpointerdown = makeSuggestionCommit(el => {...})`). This replaced the
old `onmousedown→preventDefault` + `onclick` pair, which raced the input's blur
(list torn down on a 150ms timer) and on iOS sometimes lost the tap.
**v57.1 completes the fix:** `pointerdown`'s `preventDefault()` does NOT cancel the
`click` that a touch tap still fires afterwards, so V57 left a *ghost click* that
landed on whatever sat under the option after the re-render (Notes / PASS below the
field) — the "jumps to note / records Pass" regression. `makeSuggestionCommit` now
also calls `armClickSwallow()`, and `initSuggestionClickSwallow()` (bound once at
boot) is a one-shot capture-phase document click listener that cancels that single
ghost click and disarms (700ms auto-disarm failsafe). Same technique as the V47
long-press swallow. **Don't reintroduce an `onclick` here, and don't remove the
click swallow.**

**v57 — bottom-sheet scroll-drag guard.** `sheetDragMoved` (top-level `let`),
`SHEET_DRAG_SLOP` (10px) and `initSheetDragGuard()` — called ONCE from `boot.js`
(not per-render), it binds capture-phase `touchstart`/`touchmove` on `document` and
tracks whether the current gesture drifted far enough to be a scroll rather than a
tap. Read by dispatch.js's `preset-sheet-pick`, which ignores the click if so —
because now that the preset list scrolls (v57), a scroll-drag could otherwise end in
a click on whichever row was under the finger and silently switch the preset.
`touchstart` resets the flag, so a genuine tap always reads false.

*Touch to:* change one of the four autocomplete/casing fields, their dropdowns, the
quick-pick long-press gesture, the sheet drag guard, or the suggestion click-swallow.
These stay direct because focus/blur/pointer timing can't be safely delegated (the
fragile iOS area).

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
reason→tag map and saves). **v56** adds the retest actions: clicks
`open-retest-reminders`, `retest-action-open`/`-close`, `retest-mark-booked`/
`-mark-declined`, `retest-untrack`; the input action `ef-retest-months` (instant-apply
per-session interval, no render); and the change actions `ef-retest-toggle` (flag/unflag
the active session + render) and `retest-reminders-toggle` (master switch; on OFF also
resets a stuck `retestdue` filter to `all`). The preset-switch-on-change reverts
`el.value` synchronously then opens `openConfirmSheet` (the last native `confirm`,
removed).

**v57** `preset-sheet-pick` now short-circuits on `sheetDragMoved` (events.js) so a
scroll-drag inside the now-scrollable preset list can't switch the preset by accident.

**v60 bug report:** clicks `bug-open`, `bug-close`, `bug-set-type`,
`bug-set-severity`, `bug-set-repro`, `bug-send`, `bug-copy`; input actions
`bug-desc` and `bug-context` (no render on keystroke — same reason as the readings
fields and `fail-other`).
**Welcome dismiss (v50):** `'welcome-dismiss': () => dismissWelcome('v60WelcomeSeen',
V60_WELCOME_KEY)` — was a per-version `dismissVNNWelcome()` call; now the one
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
**v57:** the boot tail also calls `initSheetDragGuard()` (events.js) right after
`initDelegation()` — same once-at-boot lifecycle, document-level capture listeners
that survive every `innerHTML` rewrite. **v57.1:** also calls
`initSuggestionClickSwallow()` (events.js) alongside it — the one-shot ghost-click
guard for suggestion picks.
**v60:** the boot tail arms `initErrorCapture()` (bugreport.js) as its FIRST action,
guarded on `typeof` and wrapped in try/catch so a failure there can never stop the app
starting. Also `_crashReportLink(context)` — a self-contained "Email a report" link
added to BOTH crash screens (the integrity-guard screen and the render-failure
fallback). It **deliberately duplicates** a little of bugreport.js rather than calling
it: these screens appear precisely when the app has failed to load, so they must not
depend on any other file having parsed. Everything in it is inline string building plus
`navigator.userAgent`, with `APP_VERSION` itself `typeof`-guarded. **Don't "DRY" this
by wiring it to bugreport.js** — the duplication is the point.
*Touch to:* change startup sequence, the SW update banner, or the integrity guard.
The crash fallback that prevents a permanent blank screen lives here.
