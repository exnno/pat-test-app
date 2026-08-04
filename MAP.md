# PATGo — Code Map (V65)

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

## Load order (index.html) — 23 first-party files
`config.js` → `state.js` → `utils.js` → `storage.js` → `clients.js` → `sqp.js`
→ `multipick.js` → `feedback.js` → `bugreport.js` → `photos.js` → `csv.js`
→ `backup.js` → `session.js` → `setup.js` → `tour.js` → `report.js`
→ `pdfpreview.js` → `render-core.js` → `render-settings.js` → **`scanner.js`**
→ `events.js` → `dispatch.js` → `boot.js`

**v65 added `scanner.js`**, placed immediately AFTER `render-settings.js` and
BEFORE `events.js`. After the render files because a scan writes into fields
those files paint (`#f-asset`, `#sessions-search`, `#scanner-test`) and calls
`refreshSessionsListAreaOnly` / `renderScannerTestLogHTML`; before `events.js`
purely so the three document-level capture listeners (scanner keydown, sheet
drag guard, suggestion click swallow) read together. Nothing depends on the
position for correctness — every cross-file call resolves at call time — so this
is a readability choice, not a load-order constraint. `index.html` now lists
**23** scripts; `sw.js` ASSETS lists **25** `.js` entries (23 first-party + the
same 2 lazy jsPDF). **The `ASSETS` list and the `<script>` chain both changed
this release — upload `scanner.js` BEFORE `index.html`.**

**v60 added `bugreport.js`**, placed immediately after `feedback.js` because it
calls `showToast`, and before everything that might want to report an error.
`index.html` listed 21 scripts at v60; `sw.js` ASSETS listed 23 `.js` entries
(21 first-party + 2 lazy-loaded jsPDF — precached but NOT `<script>` tags, since
report.js loads them on demand).

**v62 added `photos.js`**, placed immediately after `bugreport.js`: it calls
`showToast` / `openConfirmSheet` / `openInfoSheet` (feedback.js) and `uid` is
resolved at call time, and it must load before `session.js`, `render-core.js`,
`render-settings.js`, `backup.js` and `dispatch.js`, all of which call into it.
`index.html` now lists **22** scripts; `sw.js` ASSETS lists **24** `.js` entries
(22 first-party + the same 2 jsPDF). **The `ASSETS` list and the `<script>`
chain both changed this release — upload `photos.js` BEFORE `index.html`.**

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

## config.js (~883 ln) — constants & defaults, pure data
`APP_VERSION` ('V62'); all `*_KEY` localStorage key names; the calibration/backup
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

**v64 constants (photos on the certificate):** `REPORT_PHOTO_TIERS` — the
encode ladder (≤24 → 640px/q0.65, ≤60 → 512px/q0.60, beyond → 400px/q0.55) and
`reportPhotoTierFor(count)` which picks a rung. Photos are STORED at
`PHOTO_MAX_PX` (1280) but a printed slot is ~165pt wide, so anything past ~500px
is resolution nobody sees. ⚠ **The ladder exists so a big job SHRINKS rather than
DROPS** — a fixed size plus a hard cap silently loses evidence, which is the one
thing a photo appendix must not do. `REPORT_PHOTO_HARD_MAX` (150) is the absolute
ceiling that still has to exist (past it the PDF outgrows what an iOS share sheet
will handle), and when it bites the report says so loudly on the FIRST appendix
page. `REPORT_PHOTO_COLS` (3) — matches `PHOTO_MAX_PER_ITEM`, so one item's
evidence is always one row. `makeDefaultReportSettings()` gained `showPhotos`,
**default FALSE** — opt-in, the second flag here to default off, for the same
reason as `showDuration`. No new localStorage keys → **`backupVersion` stays 5**.

**v65 constants (HID barcode scanner):** `SCANNER_KEY` (`pat:scanner`) — the
on/off flag. ⚠ **This is the ONLY feature flag in the app that DEFAULTS ON, and
the only one read as `!== '0'` rather than `=== '1'`.** That is deliberate: with
no scanner paired the feature is completely inert (the sole cost is a keydown
listener that discards everything a human types), so there is nothing to opt in
to — and defaulting it off would mean the one engineer who owns a scanner must
find a setting they have no reason to look for. The toggle exists to switch it
OFF if it ever misbehaves, and to give the test box a home.
`SCAN_MAX_CHAR_GAP_MS` (40) — the speed test, and the whole safety mechanism: a
wedge scanner emits characters ~5–20ms apart, a fast typist ~80–150ms, so 40
sits between the two. **This is the number to raise if a real scanner proves too
slow**; up to ~70 is still safe, above that it overlaps fast typing.
`SCAN_END_MS` (120) — how long a silence ends a burst, and the fallback
terminator for a scanner sending no suffix. ⚠ **These two constants cover
DIFFERENT speed bands and both matter**: typing slower than `SCAN_END_MS` never
accumulates a buffer at all (each keystroke resets it, so it dies on length),
and only typing in the 40–120ms band reaches the gap test. A test written at
130ms therefore does not exercise the speed test — v65's mutation run caught
exactly that hole in its own harness. `SCAN_MIN_LENGTH` (3) / `SCAN_MAX_LENGTH`
(64) — the maximum only rejects a runaway, not long barcodes.
`SCANNER_TEST_LOG_MAX` (5). `SETTINGS_CATEGORIES` catTesting gained
`settingsScanner`; `SETTINGS_PAGE_META` has its entry. **No new backup schema →
`backupVersion` stays 5.**

**v62 constants (photo evidence):** ⚠ *Historical — the welcome key described here
was REPLACED in v63 by the derived `WELCOME_VERSION`/`WELCOME_KEY` pair documented
above. `V62_WELCOME_KEY` no longer exists.* Welcome key was `V62_WELCOME_KEY`
(`pat:v62welcome`). `PHOTO_MAX_PER_ITEM` (3),
`PHOTO_MAX_PX` (1280), `PHOTO_JPEG_QUALITY` (0.7 — note **JPEG**, unlike the
PNG logo/signature paths: a photo has no transparency to preserve and PNG would
be several times larger), `PHOTO_BUNDLE_KIND` (`'pat-photos'`) +
`PHOTO_BUNDLE_VERSION` (1) — a DIFFERENT kind string from the backup and the
setup bundle so each file-kind guard can reject the others, and
`PHOTO_EXPORT_WARN_BYTES` (25MB — the threshold at which the export warns about
file size BEFORE the encode rather than after). No new localStorage keys →
**`backupVersion` stays 5**.

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

**v61 constants (asset history + testing time):** Welcome key rolled to
`V61_WELCOME_KEY` (`pat:v61welcome`) — supersedes the v60 key above.
Asset history: `ASSET_HISTORY_MIN_JOBS` (2 — how many DIFFERENT jobs must contain
an asset number before the Sessions search offers its history; one job you can
just open, two is where piecing it together by hand starts to hurt) and
`ASSET_HISTORY_MAX_ROWS` (60 — cap so a pathological case can't build a wall of
DOM inside a bottom sheet; the sheet says when it has trimmed).
Testing time: `DURATION_MULTIDAY_MIN_DAYS` (2) and `DURATION_MIN_MS` (60000).
`makeDefaultReportSettings()` gained **`showDuration` — DEFAULT `false`**, the
only "show" flag on that object that defaults off (decision Q11B: the
certificate is client-facing, and how long a job took is the engineer's business
before it is the customer's).

**⚠ THE CAPTURE/EXPOSURE SPLIT — the one thing to read before touching
`item.ts`.** config.js carries the full note at the constants; the short version:
before v61 the Item Timestamps setting gated BOTH capture and display, and the
code documented an off-path guarantee that nothing was written at all. **That
guarantee is deliberately gone as of v61.** `ts` is now stamped on every item's
first log unconditionally; the setting gates EXPOSURE only (the CSV Time column
and the per-item time line in the Overview). Capture is cheap — `ts` is
codec-mapped to a single character, roughly 30 bytes an item — and it compounds,
because a derived figure is worthless without history to derive it from. No new
storage keys → **`backupVersion` stays 5**.

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

**Welcome key (v63 pattern — DERIVED, read this before rolling a welcome):**
Two constants, and the ONLY place a welcome roll now touches:
`WELCOME_VERSION` (a plain string, currently `'V62'`) and
`WELCOME_KEY = 'pat:' + WELCOME_VERSION.toLowerCase() + 'welcome'`.

⚠ **To roll a welcome modal: change `WELCOME_VERSION` here and write the new copy
in render-core.js. That is the entire job — no other file changes, ever.**

`WELCOME_VERSION` is deliberately NOT derived from `APP_VERSION`, because most
releases bump the version WITHOUT shipping a welcome (hotfixes, structural
releases like V63 itself). Deriving from `APP_VERSION` would re-show the last
modal to everyone who had already dismissed it, every release.

**Why this exists (v63).** Up to v62 the key was a version-NAMED identifier
(`V62_WELCOME_KEY`) written into SIX files — config, storage, state, dispatch,
boot and render-core — all of which had to roll in lockstep. One landing late or
served from a stale cache meant storage.js referenced an identifier config.js no
longer declared, which threw a `ReferenceError` inside `load()` with nothing to
catch it: **the V61 white screen**. The identifier names are now fixed forever and
only a string VALUE changes, and a wrong value cannot throw. The 28 historical
keys (V12…V48) removed in v50 remain harmlessly in users' localStorage and are
still detected by prefix in storage.js.

*Touch to:* add a storage key, change a default list, edit the calculator tables,
bump the version, change report/setup defaults, or restructure Settings / add a new
settings page (edit `SETTINGS_CATEGORIES` + `SETTINGS_PAGE_META`).

## state.js (~408 ln) — the global `state` object
**v65 (barcode scanner):** `scannerEnabled` — the ONLY persisted field of the
five, default ON (see `SCANNER_KEY`). `scanFilledAsset` — did the asset number
currently in the form come off a barcode? Set when a scan lands, cleared by
`loadFormForCursor` on every fresh form. `lastLogWasScanned` + `lastScanSessionId`
— **decision 6B**: did the item just logged carry a SCANNED number? If so the
next asset box is left EMPTY rather than pre-filled, because `nextAssetNo()`
would otherwise offer barcode + 1 — a number that looks authoritative and is
almost certainly not on any appliance. ⚠ **The session id is stored alongside on
purpose**: it scopes the blanking to one job, so switching jobs restores the
counter without every session-opening path having to remember to clear a flag.
`scannerTestLog` — display only, never saved, never backed up.

**v63:** `welcomeSeen` — the welcome flag's PERMANENT name (was `v62WelcomeSeen`). ⚠ **Never rename this back to a per-version name**; that was one of the six coupling points behind the V61 white screen.

**v62 (photo evidence):**
`photoIndex` (`{ [itemId]: count }`) and `photoBytes` — a **DERIVED IN-MEMORY
MIRROR** of the IndexedDB store, rebuilt at boot by `photoIndexLoad()` and kept
in step by every add and delete in photos.js. They exist because `render()` is
SYNCHRONOUS and the Overview must draw a photo count without awaiting a
database. **Never saved, never backed up, never validated on restore** — the
object store is the source of truth; persisting the mirror would let it drift,
exactly what v59's stats counter avoided by recomputing its live half.
`pendingPhotos` — photos taken in the fail sheet BEFORE the item exists (it has
no id until `saveItem` pushes it), held as `{blob,w,h,bytes,url}` and written on
save. `photoStripOpen` / `photoStripItemId` / `photoStripPhotos` /
`photoStripLoading` — the strip sheet. All PURELY TRANSIENT, cleared by both
`setView` and `loadFormForCursor`, with object URLs revoked on the way out.

**v61:** `v61WelcomeSeen` (replaces `v60WelcomeSeen`). Asset-history sheet state —
`assetHistorySheetOpen` (bool) and `assetHistoryAsset` (the asset number being
shown). **PURELY TRANSIENT**: never saved, never backed up, no storage key, no
validator, no migration; cleared by `setView` on any view change. Asserted in the
harness against storage.js, backup.js, setup.js and csv.js.
**Why this sheet MAY re-render, unlike the v60.1 bug sheet:** it is read-only —
no inputs, no textarea, nothing focusable — so there is no caret or keyboard for
a `render()` to tear down. The v60.1 rule is specific to sheets containing
fields, not a blanket ban.

**v60:** `v60WelcomeSeen` (replaced by v61 above). Bug-report sheet state —
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

**Welcome flag (v63 pattern):** ONE fixed property, `welcomeSeen`. It carries no
version and never changes name again — which release's welcome is current is a
VALUE (`WELCOME_VERSION`, config.js), not an identifier. Historical
`vNNWelcomeSeen` flags were removed in v50. The first-run-wizard gate detects past
welcomes via `hasAnyLegacyWelcomeKey()` (storage.js), whose `pat:v<n>welcome`
regex still matches the derived key.

**v56 Retest reminders state:** `retestRemindersEnabled` (master feature flag,
loaded from `RETEST_REMINDERS_KEY`, default off) and `retestActionSessionId` (transient
id of the session whose contacted-action sheet is open in the reminders view; null =
none, cleared on any view change in `render()`). The Sessions `sessionFilter` gained a
`'retestdue'` value. Per-session retest data (`retestTrack`, `retestMonths`,
`retestContact`) lives ON the session objects, not in top-level state — see session.js.

*Touch to:* add a new field to runtime state.

## utils.js (~250 ln) — pure helpers (no state access)
**v61:** `formatDurationShort(ms)` — plain-language elapsed time ("3h 12m",
"47m", "under a minute"). Never shows seconds. PURE: formats a number it has
already been told is worth showing; the DECISION about whether a duration exists
at all lives in `sessionDuration()` (session.js).

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
**v65:** `load()` reads `state.scannerEnabled = localStorage.getItem(SCANNER_KEY)
!== '0'` — ⚠ **note the inverted comparison**; absent and garbage both mean ON,
only an explicit `'0'` means off. `save()` writes `'1'`/`'0'` **explicitly**
rather than omitting the key when on, because an omitted key would read back as
on and switching the feature off would silently not persist.

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

**Welcome read + wizard gate (v63 pattern):** `load` reads the DERIVED
`WELCOME_KEY` → `state.welcomeSeen`, behind a `typeof` guard in a try/catch.
**This is the exact line that produced the V61 white screen** — it referenced a
version-named constant, and when config.js was a release behind, that identifier
did not exist and the `ReferenceError` killed `load()`. Two things now prevent it:
the name is fixed forever so the files cannot go out of step, and `typeof` on an
undeclared identifier never throws.

⚠ **The fallback is `true` (suppress the modal), not `false`, and that is
deliberate.** If the key is missing we also cannot PERSIST a dismissal, so showing
the modal would produce one that returns on every launch. An undismissable modal
is a trap; a missed "what's new" is a non-event. `hasAnyLegacyWelcomeKey()` scans localStorage for any
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
**v65:** `multiPickFire` clears `lastLogWasScanned` / `lastScanSessionId` before
`loadFormForCursor()`. It computes every asset number itself from `nextAssetNo()`
and never reads the form, so the counter is authoritative again after a batch —
without this the next box would be left blank on the strength of a scan that
happened before it.
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
**The report:** `openBugSheet`/`closeBugSheet` (these DO render — they add/remove the
sheet), `setBugType`/`setBugSeverity`/`setBugRepro`, `setBugField`,
`bugDescriptionReady()`, `_applyBugSheetDOM()`, `_syncBugSendButton()`,
`bugSubjectLine()` (`[PATGo BUG P1] V60 — first 40 chars`), `bugBodyText()`,
`sendBugReport()` (mailto — NOT a network POST, because the app is offline-first and
engineers are usually somewhere with no signal when something breaks; the mail client
queues it), `copyBugReport()` (clipboard fallback, same textarea/`execCommand`
technique as `copyCSV`).
**⚠ v60.1 — THE RULE FOR THIS SHEET: once it is open, NOTHING inside it calls
`render()`.** Open and close do; everything in between mutates the DOM in place via
`_applyBugSheetDOM()`, which reflects the whole draft onto the live sheet (active
classes across all three button groups driven by `data-arg`, the severity radio
glyphs, the `.bug-hidden` toggles on `#bug-severity-block`/`#bug-repro-block`, the
`#bug-q1`/`#bug-q2` label text, and Send's disabled state). The v60 build called
`render()` from the three tap setters on the reasoning that "a tap has no caret to
lose" — **wrong: the tap has none, but the TEXTAREA ABOVE IT does**, so every tap
tore down a focused input and dropped the keyboard. Same class as the V57 dropdown
bug. Add a control here? Wire it through `_applyBugSheetDOM()`.
*Touch to:* change what's collected, the report format, the severity/type options, or
the error catcher. The SHEET MARKUP is not here — it's `renderBugSheet()` in
render-settings.js (render files own markup).

**v64 note (storage.js):** `normaliseReportSettings` gained
`out.showPhotos = stored.showPhotos === true;` — the SECOND `=== true` flag here,
for exactly the reason spelled out below for `showDuration`. Also mutation-tested:
flipping it to `!== false` fails three assertions, led by *"an OLD backup with no
showPhotos restores to OFF"*.

**v61 note (storage.js):** `normaliseReportSettings` gained
`out.showDuration = stored.showDuration === true;` — **note the `=== true`**. Every
neighbouring flag uses `!== false` because they default ON; this one defaults OFF,
so a settings blob saved before v61 (which has no such key) must backfill to
false. Copying the neighbours' pattern here would silently switch the row on for
every existing user's certificate. The harness mutation-tests exactly this.
The `time` CSV case and the Overview time line still read
`state.timestampsEnabled` — that is the exposure gate, and it is correct that it
survived v61 untouched.

## photos.js (~625 ln) — photo evidence store (v62, NEW FILE)
**The app's ONLY IndexedDB code.** Everything that touches the database is here,
so the async surface is one contained boundary instead of being smeared across
session.js and the render files.

**Why IndexedDB and not localStorage:** localStorage is a ~5MB SYNCHRONOUS
string store. One 1280px JPEG is ~200KB and base64 inflates it by a third —
three photos on twenty fails would exhaust the budget the sessions blob lives
in, and take the sessions blob down with it.

⚠ **THE SYNCHRONOUS-RENDER PROBLEM.** `render()` cannot await a database, but the
Overview draws a photo count. Hence the in-memory count index in `state`
(`photoIndex`/`photoBytes`). **If you add a render path needing photo data, add
it to the index — do NOT make `render()` async.**

Record shape `{id, itemId, sessionId, blob, w, h, bytes, at}`, two non-unique
indexes (`itemId`, `sessionId`). **`sessionId` is denormalised deliberately** so
deleting a job sweeps its photos in one indexed lookup without needing the
session's items, which by then may already be gone.

Availability + db: `photosSupported()` (sync, safe from `render()`),
`openPhotoDb()` (memoised; resolves a db **or null**, never rejects),
`_photoTx(mode, fn)`.
⚠ **`_photoTx` always resolves `{ok, result}`, never a bare value.** An earlier
version returned the request result with a `fallback` on failure, which made "the
transaction failed" indistinguishable from "this batch issued several requests
and has no single result" — so **every** multi-delete read as a failure and
silently skipped its index update, leaving stale counts on screen until restart.
`oncomplete` is the only success signal. Caught by the smoke harness; keep the
two signals separate.
**v64 reads/encode for the PDF:** `photosForSession(sessionId)` — every photo for
one job, oldest first, via the DENORMALISED `sessionId` index (the reason that
field exists). `photoPrintDataUrl(blob, maxPx, quality)` — re-encodes ONE stored
photo down to print size and returns a **data URL** (what jsPDF's `addImage`
takes), same canvas recipe as `processPhotoFile` but sourced from a Blob via an
object URL that it revokes itself. **Deliberately NOT routed through
`photoObjectUrl`** — that tracker is for URLs handed to the UI and revoked on
sheet close; this one lives for milliseconds. Both resolve empty/null on failure.
Index: `photoIndexLoad()` (rebuild from the store — called once from boot),
`photoCountForItem(itemId)` (**the only thing `render()` may call**),
`photoStatsSync()`, `_photoIndexAdd`/`_photoIndexRemove`.
Processing: `processPhotoFile(file)` — FileReader → `<img>` → canvas, the same
recipe proven on iOS since v34 by `handleReportLogoFile` (session.js), with two
deliberate differences: **JPEG** output and the much larger `PHOTO_MAX_PX` cap.
Fills white first, so a transparent PNG source doesn't flatten to black.
Writes/reads/deletes: `photoAdd` (re-checks the cap so a double-tap can't beat
it), `photosForItem`, `photoDelete`, `photosDeleteForItem`, `photosDeleteForItems`
(bulk-delete path, sequential — forty parallel transactions on a phone is a
memory spike for no gain), `photosDeleteForSessions`, `photosDeleteAll`.
Object URLs: `photoObjectUrl` / `photoReleaseObjectUrls` — **every** URL handed
to the UI is tracked here and revoked on close. Nothing else in the app should
call `createObjectURL` on a photo blob.
Persistence: `photoRequestPersistence()` — `navigator.storage.persist()`, called
on the FIRST photo ever added (not at boot: asking before the user has shown
intent produces a needless desktop prompt).
Export/import (decision 7A): `_photoBlobToBase64`, `_photoBase64ToBlob` (via
`atob`, **not** `fetch` — must work offline inside a cached page),
`buildPhotoBundle`, `downloadPhotoBundle` (warns on size BEFORE the encode),
`importPhotosFromFile` (kind-guarded; re-runs `photoIndexLoad()` afterwards
rather than counting writes, because `put()` over an existing id REPLACES and
counting would over-report a re-import).

**FAILURE POSTURE: everything here fails SOFT.** Photos are evidence, not core
data. No IndexedDB, a blocked open, or a throw → callers get null/0/empty, the
photo UI hides itself, and logging works exactly as before. **Nothing in this
file may break the fail flow.**
*Touch to:* anything about photo storage, processing, or the photo export file.

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
**v65:** `buildBackup` carries `scannerEnabled`; the restore applies it **only
when the backup actually holds a boolean**. ⚠ **The `typeof` guard is the whole
point**: absence says nothing about the engineer's preference, so an old backup
must leave the loaded value alone rather than being read as "off" (asserted both
ways — an old backup neither turns it off nor forces it on).

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
**v62 (photos):** `buildBackup` carries `photoCount` — **INFORMATIONAL ONLY**.
Photos are a SEPARATE export file (see photos.js); the backup never carries
image data. It needs no photo bookkeeping at all because photo records key off
`item.id` and item ids already ride inside `sessions`, so a photo file re-links
itself after a restore with no help from the backup format. The restore path
shows an info sheet when `photoCount > 0` and the device has none, so nobody
assumes their backup carried their photos. Additive and missing-field-tolerant
→ **`backupVersion` stays 5**.
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
**v64 photographic evidence appendix.** ⚠ **THE ASYNC BOUNDARY — read this before
touching the report path.** Photos live in IndexedDB (async); `buildReportDoc` is
SYNCHRONOUS and has three call sites, two of them sync (the preview's `rebuild()`
and `reopenReportPreview`). So photos are read and re-encoded ONCE, up front, in
the already-async `produceReport`, and passed in as a second argument.
**`buildReportDoc` never touches the database. Do not make it async.**
- `_reportPhotoCache` (+ `_emptyPhotoData`, `_setReportPhotoCache`) — one job's
  worth of `{groups:[{item, photos:[{dataUrl,w,h}]}], total, printed, omitted,
  hitCap}`. `buildReportDoc(session, photoData)` falls back to the cache when
  called with no argument, but ONLY when `_reportPhotoCache.sessionId` matches —
  so another job can never inherit these photos.
- `collectReportPhotos(session)` — reads, groups by item **in register order**
  (a photo whose item was deleted has nothing to caption it and is skipped),
  picks the tier from the total, then encodes **sequentially** (parallel canvas
  encodes are a memory spike on a phone) with a counting toast past 8 photos.
  Never rejects; resolves empty on any failure.
- `ensureReportPhotos(session)` — cache-or-collect, used by the quick-adjust chip
  and `reopenReportPreview` so toggling off/on never re-encodes.
- `_photoAppendixWanted(data)`, `_appendPhotoPages(doc, session, data, margin,
  headerRgb)` — the drawing. Square slots, aspect-fitted, item heading + notes,
  page-break aware. Every `addImage` try/caught (house rule: a bad image never
  blocks a report), and the whole call is wrapped in `buildReportDoc`.
- ⚠ **THE FOOTER PASS MOVED, and it had to.** It used to run BEFORE the
  declaration block, capturing `pageCount` too early — a declaration pushed onto a
  fresh page got no footer and the others said "of N" on an N+1 page document. Add
  photo pages after it and that is wrong on *every* photo report. It now runs
  **last**, once the document is complete. `reopenReportPreview` is **async** as of
  v64; its dispatch caller swallows the promise. Mutation-tested: restoring the old
  order gives a 4-page report two footers reading "Page 1 of 2".

**v61 testing time on the certificate:** one optional row in the job-details
block, gated TWO ways — `rs.showDuration === true` (opt-in, default OFF) AND
`sessionDuration(session)` returning non-null. A report from a user who hasn't
opted in is byte-identical to v60.

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

## session.js (~2940 ln) — sessions, items & most logic
**v65 (decision 6B — the asset box after a scanned log).** Three touch points,
all pure state, no cross-file dependency (deliberately — `saveItem` is the hot
logging path and must not gain a call into `scanner.js` that could throw if that
file failed to load):
- `loadFormForCursor()` new-item branch computes
  `afterScan = state.lastLogWasScanned && state.lastScanSessionId === sess.id`
  and uses `assetNo: afterScan ? '' : nextAssetNo(sess)`. It also clears
  `state.scanFilledAsset` on **both** branches — a fresh form has not been
  scanned into yet however it was built.
- `saveItem()` sets `lastLogWasScanned` / `lastScanSessionId` from
  `state.scanFilledAsset` ⚠ **immediately BEFORE `loadFormForCursor()`**, which
  clears the source flag. Same ordering trap as the v62.1 staged-photos bug: read
  it before the thing that wipes it.
- `copyLastResult()` does the same, because it also takes its asset number from
  the form (`state.form.assetNo.trim() || nextAssetNo(sess)`), so a scanned
  number can be logged through that path too.

**Why blank rather than increment:** `nextAssetNo()` increments the LAST item's
trailing digits, so after scanning `PAT-004821` it offers `PAT-004822` — fine
when numbers are hand-typed and sequential, wrong when they come off labels.
**There is deliberately NO hard stop** (spec decision): an empty box still logs,
falling back to the counter exactly as it always has. The placeholder carries the
message instead.

**v62 (photo evidence) — the UI lifecycle around photos.js:**
Staging: `addPendingPhotoFromFile` (cap-checked before AND after the async gap),
`removePendingPhoto`, `discardPendingPhotos`, `refreshFailPhotoStrip`.
⚠ **`refreshFailPhotoStrip` does a TARGETED DOM WRITE into `#fail-photo-strip`,
not a `render()`** — the v60.1 rule. The photo button is on BOTH fail-sheet
stages (an "Other…" fail is exactly the unusual kind worth photographing), and
the Other stage holds a textarea a full render would tear down.
Commit: `commitPendingPhotos(sessionId, itemId, result, staged)` — called from
`saveItem` AFTER the save (the item must exist before anything points at its
id). Fire-and-forget; discards rather than attaching if `result !== 'fail'` or
there's no id. `saveItem` captures `savedItemId` in BOTH branches.
⚠ **`staged` is passed IN, and `saveItem` captures it into a local BEFORE calling
`loadFormForCursor()`.** This is not stylistic. `loadFormForCursor()` calls
`discardPendingPhotos()`, and it runs *earlier in `saveItem`* than the commit
does — so in v62.0, where the commit read `state.pendingPhotos` itself, the array
was always empty by the time it looked and **every photo on every logged fail was
silently dropped**. Do not reintroduce the read.
Strip sheet: `openPhotoStrip`, `closePhotoStripState`, `closePhotoStrip`,
`addPhotoToItemFromFile`, `deletePhotoFromStrip`.
**Decision 14B:** `passClicked` was SPLIT — it now runs the confirm when an
existing FAIL with photos is being turned into a PASS, and `commitPassResult()`
holds the actual commit so the confirm can resume it. The delete runs BEFORE the
result change: if the delete fails the pass still records, because an item with
a stale photo is a far smaller problem than a result the engineer believes they
changed and didn't.
⚠ **FOUR removal paths carry the photo cascade, and every one sweeps BEFORE the
splice/filter** (same ordering rule as v59's `archiveSessionStats` — afterwards
the ids are gone and the photos are orphaned with nothing pointing at them):
`deleteItem` → `photosDeleteForItem`; `applyBulkDelete` → `photosDeleteForItems`;
`deleteSession` and `pruneOldSessions` → `photosDeleteForSessions`.
`setView` and `loadFormForCursor` both clear staged photos and the strip.

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
**v61 testing time:** `sessionDuration(sess)` — PURE, returns `null` when there is
nothing worth showing (fewer than two timestamped items) so the caller omits the
whole line rather than printing "0m", same contract as `computeAppStats()`.
Otherwise returns `{multiDay, days, ms, text}`. **The span is EARLIEST-to-LATEST
`ts`, not first-array-element to last** — items can be edited and re-ordered, a
CSV import brings in items with no `ts` at all, and jobs straddling v61 have some
stamped items and some bare ones; a min/max scan is correct in all three cases and
indexing `[0]`/`[n-1]` is wrong in all three. A span crossing calendar days
returns "spread across N days" instead of a misleading elapsed figure, where
**N is DAYS WORKED, not calendar span** (a job on the 10th and 12th says 2, not 3
— nothing was logged on the 11th). Unparseable `ts` values are skipped, not
allowed to poison the span.

**v61 cross-session asset history:** `assetHistoryCandidate(query)` — does this
query match an asset number in `ASSET_HISTORY_MIN_JOBS`+ DIFFERENT jobs? Returns
`{assetNo, jobCount}` or null. **Deliberately NOT the same match as
`filteredSessions()`**, which also matches location, item type and notes: offering
"history for kettle" would be meaningless, because a kettle is a hundred
appliances, not one. Match is EXACT text, case-insensitive and trimmed — not a
substring (typing `1` must not claim to be the history of asset `1024`) and not
zero-insensitive (`001` and `1` stay different assets, exactly as
`findDuplicateAssetIndex` has treated them since v60 decision 8A). Runs on every
keystroke of the Sessions search, so it stays one cheap pass.
`assetHistoryFor(assetNo)` — `{rows, total}`, newest job first, capped at
`ASSET_HISTORY_MAX_ROWS` with `total` reporting the truth so the sheet can say it
trimmed. Each row carries `{sessionId, sessionTitle, date, index, item}`.
Sheet lifecycle: `openAssetHistory`/`closeAssetHistory` (these DO `render()` — the
sheet is read-only, so there is nothing focusable to lose) and
`openAssetHistoryRow(arg)` (parses `"sessionId|index"`, closes the sheet, hands
off to `requestOpenSession` so the edited-since-export warning still applies).
All PURE reads over `state.sessions` — nothing here writes, saves or migrates, which
is why the whole feature needed no storage work and no `backupVersion` bump.

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
`resetDescriptionsToDefaults`, `setTheme`, `setHaptics`, `setSound`, `setTimestamps` (**v61: this no longer gates
capture** — see the capture/exposure note under config.js. It now controls the CSV
Time column and the Overview per-item time line only).
**v61 `ts` is stamped unconditionally in the two append paths** — `saveItem` and
`copyLastResult` — plus `seedDemoSession`. The EDIT branches must never stamp:
`ts` means "first logged", not "last touched", and they spread the new fields over
the old item precisely so an existing `ts` survives.
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
persists `key`, re-renders. **v63:** its two arguments are now permanent (`'welcomeSeen'`, `WELCOME_KEY`), so neither this function nor its caller changes when a welcome is rolled. The `welcome-dismiss` action (dispatch.js) calls it with that fixed pair —
`('v60WelcomeSeen', V60_WELCOME_KEY)` as of v60. Each feature release passes its own.

`setView` clears transient overlays on every transition (fail sheet, multi-pick
sheet, bulk-edit menus, client dialogs, the New Session form, `presetSheetOpen`,
**v61** the asset-history sheet).
**Note:** `state.view` is set directly from ~14 places, so per-render concerns
(scroll reset) live in `render()` via `_lastRenderedView`, NOT in `setView`.
*Touch to:* most logic changes — session/item lifecycle, suggestions, sorting,
filtering, theme, bulk edit, settings saves, the wizard/onboarding, the example
seed, the signature, cert numbers / job notes / report templates, the welcome
dismiss.

## render-core.js (~2170 ln) — main screens
**v65:** welcome modal copy is the V65 scanner text. `renderEntry()`'s `#f-asset`
gains `placeholder="Scan or type"` **only when `state.scannerEnabled`** — the
placeholder is what tells the engineer why the box is empty after a scanned log
(decision 6B), so it would be misleading with the feature off. Router gained
`settingsScanner` → `renderSettingsScanner()`.

**v63:** the modal gates on the fixed `state.welcomeSeen` and its heading derives from `WELCOME_VERSION` (config.js); the dead `id="v62-welcome-dismiss"` was removed (nothing referenced it). This file was the SIXTH and quietest member of the old version-named coupling — it read `state.v62WelcomeSeen`, so a stale copy never crashed, it just read `undefined`, which is falsy, and showed the modal on every render forever. Only `WELCOME_VERSION` and the copy below it change when a welcome is rolled.

**v62:** welcome modal copy is the V62 photo-evidence text. `renderFailPhotoStripInner()`
— the fail sheet's photo row contents; rendered BOTH inside the sheet AND on its
own by session.js's targeted DOM update, so it must stay self-contained and
produce valid markup with no surrounding context. `renderPhotoStripSheet()` —
the view/manage sheet, injected into BOTH the entry screen and the Overview;
buttons only, **no inputs**, so unlike the fail sheet it MAY be rebuilt by
`render()` (the v60.1 no-render rule is specific to sheets holding fields).
`renderOverviewBodyHTML` gains the 📷 count chip on fail rows, read
SYNCHRONOUSLY via `photoCountForItem` — in selection mode it renders as an inert
span so a tap toggles the row rather than opening a sheet.
**v62.1:** `renderEntry` gains `entryPhotoRow` (`.entry-photo-btn`) — the
decision-13A route into an existing fail's photos from the entry form. v62.0
shipped the strip sheet on this screen but **no trigger for it**, so the photos
were stored and unreachable. It shows at a count of zero too, so tapping back
into a fail logged without a photo still lets you add one.
⚠ `refreshEntryAfterLog` sets `_lastRenderHadModal = !!state.photoStripOpen`, not
the hard-coded `false` it carried since v24 — the entry screen can now hold a
sheet, and a stale `false` would stop a later `render()` sweeping it.

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
**v61 asset history:** `renderSessionsListAreaHTML` builds the offer card (class
`.asset-history-card`) between the match count and the list — it appears ONLY when
`assetHistoryCandidate()` returns a hit, so a search for a site, a location or an
item type never offers a "history". `renderAssetHistorySheet()` (this file) is the
sheet: `.fail-sheet` shell + `.sheet-scroll` list, one tappable row per past
instance carrying `data-arg="sessionId|index"`. Rows show date, job, result chip,
location, item type, readings (gated on `state.readingsEnabled` AND the item
actually carrying them, mirroring the CSV/PDF rule) and notes — the fail reason
rides in notes for free, so it needs no special case. Everything user-typed goes
through `escapeHTML`. **The sheet contains no inputs**, which is why a plain
`render()` on open/close is safe here.
**v61 testing time:** `renderEditSession` (Session settings) carries the
`.session-duration-row` block — always shown when `sessionDuration()` returns
non-null, deliberately NOT gated on the Item Timestamps setting (decision Q8A),
and omitted entirely otherwise.

Shared: `emptyStateHTML(icon,title,body,actionLabel,actionName)`;
`refreshSettingsHubBodyOnly` (live settings search). The **welcome modal** block
(**v61** gates on `v61WelcomeSeen`; suppressed while the migration prompt or first-run
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

## render-settings.js (~1675 ln) — settings screens
**v65:** `renderSettingsScanner()` — the new Barcode Scanner page (Testing
Setup). Two jobs: the off switch, and a **live test box**. The test box is the
more important of the two and is the answer to the discoverability problem a
wedge scanner creates — there is no on-screen button and nothing to press, so
without it the only way to find out whether a scanner works is to try it on a
real job. It takes a scan anywhere on the page (no need to tap in first) and
shows the raw text plus a character count, which is how a scanner adding a prefix
or clipping a digit becomes visible rather than mysterious. The test box and the
troubleshooting notes are hidden entirely when the toggle is off. Glossary gained
a **Barcode scanner** term. About changelog rolled to V65/V64/V63 (V62 dropped).
⚠ The log markup itself is `renderScannerTestLogHTML()` in **scanner.js**, not
here — that file owns the data and repaints the log directly without a render.

**v64:** Report settings → What to include gains the `report-show-photos` toggle
(+ an on-only plain-language note about shrinking and the 150 ceiling). About
changelog rolled to V64/V63/V62 (V61 dropped).

**v62:** `renderPhotoBackupSection()` — the Photos block on the Backup page
(export / import / delete-all), which hides itself entirely when the device
can't store photos rather than offering buttons that can't work. Its copy is
deliberately blunt that photos are NOT in the backup: the most damaging possible
misunderstanding here is someone discovering that only after losing the phone.
The Storage-usage card gains a Photos line, reported SEPARATELY and deliberately
**not** fed into the percentage bar — photos live in IndexedDB, not the ~5MB
localStorage budget the bar measures, so rolling them in would make the bar lie
in both directions. About changelog rolled to V62/V61/V60 (V59 dropped).

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
**v61** `renderSettingsReport`'s "What to include" section gained the
`report-show-duration` toggle (Testing time). It is the one toggle there that
defaults OFF. `renderSettingsDisplay`'s Item timestamps copy was rewritten to
describe the new capture/exposure split honestly — including the consequence that
switching the setting on now reveals times for everything logged since v61, not
only from the moment it was switched. The About changelog rolled to
**V61 / V60 / V59** (V58 dropped).

**v60** `renderSettingsContact` replaced the old static "what to include in a bug
report" advice card with a **Report a problem** button (`data-action="bug-open"`) and
a privacy line. `renderBugSheet()` (also here) is the sheet MARKUP — all its logic
lives in bugreport.js. **v60.1:** it paints the sheet ONCE, on open; nothing inside it
re-renders. The severity and repeatable blocks are therefore **always rendered**,
wrapped in `#bug-severity-block`/`#bug-repro-block` and hidden with `.bug-hidden`
rather than omitted, so a type change has nothing to rebuild. The two question labels
wrap their text in `#bug-q1`/`#bug-q2` **spans** so `textContent` can't clobber the
`(optional)` hint beside q2. Everything user-typed goes through `escapeHTML`,
including the diagnostics preview (asserted in the harness).
**The About changelog lives here** (`renderSettingsAbout`) — a rolling
3-version window; v61 shows V61/V60/V59 (V58 dropped). The About page also has the "Set up another
device" (`restart-onboarding`) and "Show me around" (`open-tour`) cards, and a
long-press hidden menu on the title revealing three cloud-prep stub pages
(`renderCloudAccount`, `renderCloudSync`, `renderCloudSubscription` — mock data, for
the PAT Cloud phase).
*Touch to:* change any Settings page; add or reword a glossary term (edit
`GLOSSARY_GROUPS` — one line per term, nothing else needs changing); the contact
details; the category structure (edit config.js, not here); search aliases (config);
or roll the About changelog.

## scanner.js (~300 ln) — HID barcode scanner (v65, NEW FILE)
`initScanner()` (bound ONCE from boot.js — capture-phase `keydown` on
`document`), `handleScannerKeydown`, `_scanTarget`, `_scanLooksLikeScan`,
`_scanReset`, `_scanTimeoutCommit`, `applyScan`, `_scanIntoAsset`,
`_scanIntoSearch`, `_scanIntoTest`, `_scanFlash`, `_scanClock`,
`renderScannerTestLogHTML`. Burst state (`_scanChars`, `_scanGapMax`,
`_scanLastTs`, `_scanTimer`, `_scanSwallowEnterUntil`, `_scannerBound`) is
module-level `let`, **not** `state` — it is the last ~100ms of keyboard, and must
never be persisted, backed up, or survive a render.

**What a HID scanner actually is.** Not a camera and not an API: it pairs with
the phone as a Bluetooth KEYBOARD and TYPES the barcode, usually followed by
Enter. There is no permission to grant and no button to press. This file listens
to the keyboard, notices bursts far too fast to be human, and puts the result in
the right box. Nothing else in the app knows a scanner exists.

⚠ **CHARACTER KEYS ARE NEVER `preventDefault`ed — ONLY THE TERMINATOR.** This is
the single most important thing in the file and the reason it cannot break normal
typing. At the moment each character arrives we do not yet know whether the burst
will turn out to be a scan, so swallowing it would be a guess. Characters are
allowed to land wherever they were going AND copied into the buffer in parallel;
only on the terminator (or the silence timeout) is the burst judged, and if it
was a scan the target field is overwritten **wholesale**, which cleans up
whatever the characters did on the way past. If it wasn't a scan, nothing
happened at all. **Do not "optimise" this into swallowing keys early.**

⚠ **OVERWRITE, NEVER APPEND.** The asset box is pre-filled when a scan arrives,
so writing over the field rather than into it is the entire point — otherwise
every scan reads `001PAT-004821` (asserted; the mutation costs 12 assertions).

⚠ **`e.repeat` is excluded explicitly.** A held key auto-repeats at ~30ms, which
is machine-speed and would otherwise sail straight through the timing test. It is
the only non-scanner source of a fast burst.

**Where scans are accepted (decision 2B):** entry screen → `#f-asset`; Sessions
list → `#sessions-search` (which gets the v61 cross-session asset history card
for free); Barcode Scanner settings page → `#scanner-test`. `_scanTarget()`
returns null — and the burst is dropped, the keystroke untouched — everywhere
else, while ANY entry-screen sheet is open (all five flags are checked; `#f-asset`
is still in the DOM underneath them), on a locked job, while the welcome panel /
first-run wizard / migration prompt is up, and when the feature is off.

**KNOWN LIMIT, accepted at spec time:** if the cursor is in some OTHER text field
(Location, Item type, Notes), `_scanTarget()` bails entirely and the characters
type into that field as they normally would. Hijacking a field the engineer had
deliberately focused would be worse than the occasional barcode landing in the
Location box, which is visible and one clear-and-retype to fix. Focus in the
target field itself is fine — we still take over, so behaviour is identical
whether or not they tapped the box first.

Entry-screen delivery is a **TARGETED DOM WRITE, not a `render()`** (the v60.1
rule) — a render on every scan would rebuild the entry screen fifty times a job
and take the cursor with it. Acknowledgement is a CSS glow (`.scan-flash`,
literal rgba **not** `var()`s, per the iOS keyframes history), deliberately not a
toast: fifty toasts on a fifty-item job is noise and the scanner has its own
beeper. Toasts are reserved for the duplicate warning (decision 4B), which fires
at SCAN time rather than at save, because that is when the engineer is still
stood at the appliance and can look at the label again.

*Touch to:* change scan detection, timing, where scans are accepted, or the
settings test log. **Don't** put the settings PAGE here (render-settings.js) or
the 6B carry-forward here (session.js).

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

## dispatch.js (~1100 ln) — delegated event handling
**v62 actions.** Clicks: `fail-photo-pick`, `fail-photo-remove`,
`photo-strip-open`, `photo-strip-close`, `photo-strip-add`, `photo-delete`,
`photo-export`, `photo-import`, `photo-wipe`. Changes: `fail-photo-file`,
`photo-strip-file`, `photo-import-file` — all three clear `el.value` immediately
so re-choosing the SAME file fires a change event (without it, a retaken photo
with an identical filename silently does nothing). **v63 supersedes the next sentence:** `welcome-dismiss` no longer rolls at all. Historically it rolled to
`v62WelcomeSeen` / `V62_WELCOME_KEY`.

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
**v61:** clicks `asset-history-open`, `asset-history-close`, `asset-history-row`;
change action `report-show-duration`.
**v65:** change action `scanner-toggle` — writes `SCANNER_KEY` instantly and
`render()`s, so the test box and troubleshooting notes appear/disappear at once
and the entry screen's placeholder follows. Same shape as `sqp-toggle` /
`readings-toggle`. **No click actions were added** — the scanner has no on-screen
control by design.
**v64:** change action `report-show-photos` (opt-in photo appendix). The
`back-to-settings` deep-link now calls `reopenReportPreview(sid).catch(() => {})`
— that function became async in v64 because returning from Report Settings may
have just switched the appendix on.
**Welcome dismiss (v50, decoupled v63):**
`'welcome-dismiss': () => dismissWelcome('welcomeSeen', WELCOME_KEY)` — both
arguments are permanent, so this line no longer changes when a welcome is rolled.
*Touch to:* add/route any delegated click/input/change handler. Only the four focus-
sensitive fields + the quick-pick long-press are NOT here (see events.js).

## boot.js (~283 ln) — startup, RUNS ON LOAD, must load LAST
**v63:** the integrity guard's constant check now targets the fixed `WELCOME_KEY` and **never needs rolling again** — the old "roll it here too" warning is gone. Retargeting it was the point: while it named a version, a stale boot.js checked the PREVIOUS release's name, passed happily, and `load()` threw anyway — so the guard was a sixth coupled file rather than a fix. It is kept because it is still a cheap probe for "did config.js parse at all".
The boot tail calls `photoIndexLoad()` **AFTER** the first `render()`, then
repaints only if photos were actually found — deliberately after, because it is
async and the app must never wait on a database to paint its first screen, and
because photos are evidence, not core data: it is `typeof`-guarded and wrapped,
so a missing or failing `photos.js` can never stop the app starting.

Service worker: `registerServiceWorker`, `showUpdateBanner`, `applyUpdate`,
`dismissUpdateBanner`. Boot integrity guard `bootIntegrityOK()` verifies the critical
cross-file functions (`load`, `save`, `render`, `applyTheme`, `initDelegation`,
`loadFormForCursor`, `loadMultiPickConfig`, `loadClients`, `loadSites`,
`composeSiteSnapshot`) all loaded before any storage write; if not it shows an
"Update needed" reload prompt and SKIPS load()/render()/save() (guards the duplicate-
const data-loss class). Boot tail: the guard's else-branch runs `load()`,
`applyTheme(state.theme)`, then the crash-fallback `try { loadFormForCursor();
render(); } catch …`; `registerServiceWorker()` runs regardless.
**v65:** the boot tail also calls `initScanner()` (scanner.js) right after
`initSuggestionClickSwallow()` — the third document-level capture listener, same
once-at-boot lifecycle. ⚠ **`typeof`-guarded and wrapped in try/catch**, like
`initErrorCapture()` and `photoIndexLoad()`: a missing or broken `scanner.js`
must never stop the app starting, and the worst case is that scans stop being
recognised and asset numbers get typed by hand exactly as before v65.
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
