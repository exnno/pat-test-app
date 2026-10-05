# PATGo — Code Map (V100)

Routing only: which concern lives in which file, and the cross-file couplings you
cannot discover by reading one file. Read this to decide *what to open*.
(c) 2026 Peter Birchley. All rights reserved.

> **How to use this file.** Never view it whole. `sed -n '1,120p' MAP.md` for the
> cross-cutting rules and load order, then `sed` only the entries for the files
> in scope.
>
> **This file does NOT list functions.** Use `grep -n "^function \|^const " file.js`
> — live, accurate, cheap. Function inventories were removed in the v66 doc
> restructure because they cost ~25k tokens a session and went stale.
>
> **This file does NOT explain design decisions.** Durable reasoning lives in
> comments beside the code it describes; release history lives in
> `PAThandoff_vNN.md`. This file answers one question: *where does this live?*

---

## Cross-cutting rules — read before editing anything

These caused real bugs. Each is enforced in more than one file, so none of them
is discoverable from the file you happen to be editing.

1. **Duplicate top-level `const` across two loaded files = fatal `SyntaxError`**
   that kills the whole file (caused real data loss in the refactor). Duplicate
   top-level `function` declarations are **legal and silent** — last loaded wins.
   The boot integrity guard catches the first class, nothing catches the second.

2. **`render()` is synchronous and rebuilds `#app.innerHTML` wholesale.** Never
   make it async. Async data (photos) needs an in-memory index in `state` that
   `render()` can read synchronously.

3. **The no-render rule (v60.1).** A sheet **containing inputs** must not call
   `render()` while open — it tears down the focused field and drops the
   keyboard. Mutate the DOM in place instead. A **read-only** sheet (no inputs,
   nothing focusable) MAY render. Applies to: fail sheet, bug sheet, instrument
   editor, entry screen after a scan.

4. **Read a flag BEFORE the thing that clears it.** `loadFormForCursor()` clears
   staged photos and scan flags; several callers must capture the value into a
   local first. Two shipped bugs came from this exact ordering (v62.1 photos,
   v65 scan carry-forward).

5. **Sweep BEFORE you remove.** Cascades keyed off ids (photo deletes, stats
   archiving) must run before the `splice`/`filter`, or the ids are gone and the
   dependents are orphaned.

6. **Optional subsystems fail soft.** `photos.js`, `scanner.js`, `bugreport.js`,
   `cloud.js`, `sync.js` are `typeof`-guarded and try/catch-wrapped at their boot call sites. A missing
   or broken one must never stop the app starting or break the fail flow.

7. **Instrument fields on `state` are a MIRROR, not the truth.** Never read
   `state.testerMake` / `calDate` / `calCertNo` / `calDue` to decide what a
   certificate says — use `instrumentForSession(sess)` (instruments.js). Any code
   writing a flat field must call `adoptMirrorIntoInstruments()` after.

8. **Rolling a welcome modal = change `WELCOME_VERSION` (config.js) + write the
   copy (render-core.js).** (The About *changelog* is a separate thing and lives
   in **render-help.js** from v73.) Nothing else, ever. v70 made this literally true:
   `dismissWelcome()` moved from session.js to render-core.js, so every part of
   the welcome now sits in those two files. Harness 09c pins it there. The key and the state flag have
   permanent names. Version-named identifiers here caused the V61 white screen.

9. **Feature-flag polarity.** Default-ON flags read `!== false`; default-OFF flags
   read `=== true`. Copying the wrong neighbour silently switches a feature on for
   every existing user. `SCANNER_KEY` is the only default-ON flag and the only one
   read as `!== '0'`. ⚠ `SCANNER_PAIRED_KEY` (v67) sits on the NEXT LINE in
   storage.js and is ordinary opt-in `=== '1'`. Harness-asserted both ways.

10. **`backupVersion` is 5.** Additive fields ride through encode/decode wholesale
    and do not spend a bump. Bump only for a genuinely incompatible schema change.

11. **`prompt()` / `confirm()` / `alert()` are banned** (unreliable in iOS PWAs).
    Use the `.bulk-sheet` dialogs in feedback.js.

12. **iOS keyframes.** CSS-variable `@keyframes` on freshly inserted
    `position:fixed` nodes silently fail — use literal values, inline styles,
    forced reflow, next-frame RAF.

13. **Sheet geometry is published, not assigned (v75).** `applyKeyboardInset()`
    (events.js) writes `--kb-inset` / `--sheet-max` / `--sheet-pad` /
    `--sheet-min-release` onto `<html>`; the sheet rules in styles.css read them
    with `var()` fallbacks. Nothing finds the open sheet. Two consequences:
    a sheet rule that OVERRIDES `max-height`/`min-height` opts itself OUT unless
    it also uses the var (`.bug-sheet`, `.wizard-sheet` do); and keyboard-down
    must REMOVE the properties, never set them to `0px`, or the fallback is
    shadowed and the no-keyboard case silently changes.

14. **A sheet child that can grow long must be marked `.sheet-scroll`, and
    anything BELOW it must be marked `.sheet-pin`.** The shell is capped with
    `overflow: hidden`, so an unmarked body clips instead of scrolling and takes
    whatever follows it — usually the buttons — with it. This is what broke V74's
    welcome modal and, from v33 until V76, the first-run wizard. Both halves are
    needed: the sheet is a flex column, so an unpinned sibling under a scroller is
    compressed away instead of clipped, which looks different and is just as bad.

    `.sheet-scroll` is now the ONLY sheet scroller in the stylesheet — V76 deleted
    `.wizard-body`'s private copy (it omitted `min-height: 0`, which is the whole
    defect: a flex child will not shrink below its content without it) and reduced
    `.bug-sheet-body` to its padding. Do not write a third. The only other flex
    scroller in the file is `.report-preview-view`, which is a full-screen view
    rather than a sheet.

    ⚠ `.sheet-pin` must be applied in the MARKUP, per site, never as
    `flex-shrink: 0` on the element's own class. The things needing pins include
    `.btn-primary`, `.input-big` and `.quick-grid`, all used all over the app
    outside sheets. Harness 12g fails if one of those rules grows a `flex-shrink`.

    Enforced by harness test 12: per-site assertions for the marked sites, plus
    12d, which parses the stylesheet and fails on ANY rule that declares
    `overflow-y: auto` with `flex: 1 1 auto` and no `min-height: 0` — including
    rules for sheets that do not exist yet.

15. **Banned: locking body scroll while a sheet is open.** Same family as the
    `100dvh + overflow:hidden` layout rolled back in v12.1. Harness 11i asserts
    on the shipped source, comments stripped.

16. **One hold gesture implementation, and it is `attachHoldGesture()` in
    events.js.** A hold on an interactive control needs three things that are
    each easy to omit: a 12px drift slop so a scroll starting on the element does
    not fire it, a capture-phase swallow of the ONE click that follows a fired
    hold, and touch plus mouse. Wiring `el.ontouchstart` directly at a new site
    gets one or two of the three. There is exactly one `.ontouchstart =` in the
    whole app and harness 13n fails if a second appears.

    The other implementation, `setupLongPress()` (utils.js), is pointer-based
    with no tap suppression and serves the About-title cloud reveal — a plain
    heading with no click action to swallow. Two, with that division stated, is
    the shipped state. A third is the defect; extend one of these instead.

    ⚠ A control carrying a hold must also declare `-webkit-touch-callout: none`
    and BOTH forms of `user-select: none` in styles.css, per site — iOS answers a
    hold on a text-bearing control by starting a text selection. There is no
    global rule doing this; adding a fourth hold site means adding those
    properties too. Harness 13m.

---

## Load order (index.html) — 31 first-party files

`config` → `data` → `state` → `utils` → `storage` → `clients` → `instruments` → `sqp`
→ `multipick` → `feedback` → `bugreport` → `photos` → `csv` → `backup`
→ `session` → `settings-actions` → `setup` → `tour` → `onboarding` → `report`
→ `pdfpreview` → `render-core` → `render-review` → `render-settings` → `render-help`
→ `cloud` → `sync` → `scanner` → `events` → `dispatch` → `boot`

⚠ `data` → `state` is the one adjacency in this chain that is NOT a readability
choice. `state.js` seeds `itemTypes`/`failReasons` from `DEFAULT_ITEM_TYPES` /
`DEFAULT_FAIL_REASONS` in its top-level initialiser, which runs at load, so
`data.js` must precede it. Harness 09h/09i, mutation M61.

`sw.js` ASSETS lists **34** `.js` entries: these 31 plus 3 lazy-loaded vendored
files (precached, not `<script>` tags): the jsPDF pair (report.js injects them)
and `supabase.umd.js` (cloud.js injects it, v79).
PDF.js is vendored but **not** precached (pdfpreview.js fetches it lazily).

`boot.js` runs on load and must be last. Every other position is a readability
choice, not a correctness constraint — cross-file calls resolve at call time, and
identifiers from later files (e.g. `uid`) are `typeof`-guarded where used early.

**Adding a file:** update `index.html` `<script>` chain AND `sw.js` ASSETS, and
upload the new file to GitHub **before** either of them. Also add ONE probe for
it to `bootIntegrityOK()` (boot.js) — without a probe, a file referenced but
never uploaded fails silently until a user taps something.
⚠ v71: the probe goes in `requiredFns` for a file with functions, but a
DATA-ONLY file needs a CONSTANT probe instead — top-level `const` never attaches
to `window`, so the `requiredFns` loop cannot see it whatever name you use.
Harness 09e/09f/09k/09l and mutations M54/M55/M64/M65 hold all of this.
⚠ EXCEPT an optional subsystem (rule 6): `photos.js`, `scanner.js`,
`bugreport.js`, `cloud.js`, `sync.js` are deliberately NOT probed — a probe would make a
missing optional file block boot, which is the opposite of the rule.

---

## Not shipped

### harness/ — the committed test harness
Stub layer, load-order runner, fixtures, standing assertions, mutation runner.
NOT in `index.html`, NOT in `sw.js` ASSETS — test 01c fails if either changes.
**Touch to:** validate a release (`node harness/run.js`, `node harness/mutate.js`),
or add this release's assertions and mutations. Never delete from `tests/`.
**Coupling:** derives load order from `index.html`; source-guards `report.js`,
`csv.js` and the flat-field writers (rule 7); asserts rules 1, 8, 9, 11, 14, 15, 16.
⚠ v77: the stub's `dispatchEvent` now fires `on<type>` PROPERTY handlers as well
as `addEventListener` registrations, the way a real element does. Without it a
property-bound handler could only be tested by hand-calling it — the V67
"listener never bound" blind spot. Do not narrow it back.
⚠ Two mutations are anchored on text that ROLLS every release and abort silently
if not re-pointed: **M66** (`APP_VERSION` in config.js) and **M82** (the oldest
About changelog entry). Re-point both as part of the release, and treat a non-zero
abort count as a failed run — an aborted mutation is not a caught one.
⚠ V95: pull fixtures date their jobs with `RECENT_DATE` (fixture.js). V93's
30-day window makes a fixed date a time bomb — group 17 went red on 2 Oct with
no code change. Fixed OLD dates stay only where a test means an old job.
⚠ v88: the fake IndexedDB now completes a transaction AFTER its requests and
filters index lookups by key. Before V88 every photo READ in the harness came
back empty — no test had ever read a photo back. Do not revert either.
See `harness/README.md`.

---

## Files

### config.js (~830 ln) — constants & factories
All `*_KEY` localStorage names, `APP_VERSION`, `WELCOME_VERSION`/`WELCOME_KEY`,
tuning constants, caps, timeouts, feature-flag keys, `REPORT_COLOR_THEMES`,
`makeDefaultReportSettings()`, `makeStarterReportTemplates()`,
`makeEmptyBugDraft()`, `makeEmptyArchivedStats()`, `reportPhotoTierFor()`.
**Touch to:** add a storage key, change a tuning number, bump the version, roll a
welcome. To change a default LIST, go to data.js.
**Coupling:** ⚠ `makeEmptyBugDraft()` must live here, not bugreport.js —
`state.js` seeds from it at load time, long before bugreport.js parses.
⚠ v71: config.js loads BEFORE data.js, so nothing at this file's top level may
read a data.js name. Inside a function body is fine and is what
`makeEmptyBugDraft()` does. Harness 09j, mutation M66.
⚠ v74: `SCAN_GAP_PRESETS` values are the ONLY way to retune scanning for an
existing fleet. `saveSettings()` writes `SCAN_SPEED_KEY` on every settings save,
so every phone holds an explicit preset name and never reads
`SCAN_SPEED_DEFAULT` again — changing a DEFAULT reaches nobody but a fresh
install. Applies to any tuning value with a stored counterpart. Mutation M85.
Rules 8, 9, 10 above all originate here.

### data.js (~380 ln) — static tables and lists
Split out of config.js in V71, byte identical. Built-in defaults
(`DEFAULT_ITEM_TYPES`, `DEFAULT_FAIL_REASONS`, `DEFAULT_DESCRIPTIONS`,
`DEFAULT_CSV_COLUMNS`), the v53 reading-field tables and fail-reason tags,
`SETTINGS_CATEGORIES` + `SETTINGS_PAGE_META` (single source of truth for the
Settings hub, sub-lists, search aliases and back-nav), `SETUP_SECTIONS`, the
bug-report option lists, `PATGO_FOOTER_LOGO`, `CSA_RESISTANCE`/`CALC_LENGTHS`.
**Touch to:** change a default list, add a Settings page, retag a fail reason,
edit the calculator tables.
⚠ v85: `catCloud` holds the three cloud pages. Its visibility
and searchability are filtered in **render-settings.js**
(`settingsCategoryVisible` / `settingsPageSearchable`), its lock in **cloud.js**.
⚠ V96: groups and titles redone; view ids and category ids UNCHANGED (deep links,
SYNC_GENERAL_VIEWS, SYNC_NO_REPAINT_VIEWS untouched). Hub order is NOT the array
order: `settingsCategoriesInOrder` (render-settings.js) puts catCloud last while
locked. A page meta may carry `action` (row opens through that ACTIONS entry —
photoManager `pm-open`, jobManager `jm-open`); its visibility is
`settingsPageVisible` (render-settings.js). 33b: every SETTINGS_PAGE_META key must
sit in exactly one group. A renamed page also needs its `renderSettingsSubHeader`
title changed and the old name kept in `aliases`.
**Coupling:** ⚠ must load immediately after config.js and BEFORE state.js — see
the load-order note above. Contains NO functions, deliberately, which is why its
boot probe is a constant. Nothing here touches storage or the DOM.

### state.js (~430 ln) — the global `state` object
The single `let state = {…}` runtime shape. Persisted fields, UI transients,
in-memory caches and mirrors.
**Touch to:** add a runtime state field.
**Coupling:** transient sheet flags are cleared by `setView` and
`loadFormForCursor` (session.js) — a new transient needs adding there or it
survives navigation. Derived mirrors (`photoIndex`, `photoBytes`, the instrument
flat fields) are never saved, backed up or validated. Rule 7 applies.

### utils.js (~265 ln) — pure helpers, no state access
Formatting, escaping, colour, asset-number splitting/padding, long-press
detector, boundary validators for item readings, `newId()`.
**Touch to:** add a stateless helper.
⚠ v78: `newId()` (crypto.randomUUID, uid()-shaped fallback) is the ONLY way a
NEW record gets an id. Minting sites: clients.js ×5, session.js ×5 (session,
items ×3, preset), storage.js ×2 (seeded presets), photos.js, instruments.js.
`uid()` (session.js) still exists and still works — which is exactly why a
revert to it is invisible. Ids already stored are never rewritten.
**Coupling:** none by design — nothing here reads `state`.
⚠ v75: `focusInSheet()` is the ONE way anything inside a bottom sheet takes
focus (`preventScroll`, try/catch fallback to bare `focus()`). Callers:
feedback.js ×2, dispatch.js (`fail-other-input`), settings-actions.js ×2.
NOT for fields outside a sheet — dispatch.js's `f-notes` is on the entry screen
and deliberately keeps a plain `focus()`. scanner.js keeps its own v67 guard.
⚠ `titleCase()` is NOT display-only: it runs on locations and item types at save
time, so its output reaches certificates and CSV exports.
⚠ v69: `repairApostropheCase()` is titleCase's INVERSE and the only function in
the app that lowercases a user-typed letter. It is guarded on the preceding word
not being all-caps (`BOB'S` is deliberate, `Bob'S` is the bug) and on a
single-letter suffix (`O'Brien` untouched). Callers: storage.js repair pass only.
⚠⚠ **THERE IS MORE THAN ONE APOSTROPHE CHARACTER.** iOS smart punctuation types
U+2019 (’), NOT U+0027 ('). v68 matched only U+0027 and was therefore broken on
every phone while passing every test — because test files are ASCII source.
`APOSTROPHES` in utils.js lists all three accepted (U+0027, U+2019, U+02BC).
Any test touching apostrophes MUST assert against U+2019, not a bare `'`.
Harness 06e2 loops all three; mutations M40/M41. Fixed v68.1.
⚠ V87: `fileSafe()` + `fileDateUK()` build EVERY file name the app writes
(report.js, csv.js `csvFilename`, backup.js, photos.js, setup.js) — spaces, not
underscores; DD-MM-YYYY. `retestMonthLabel()` / `monthIndexAfter()` /
`formatMonthIndex()` are the ONE retest-by-month arithmetic (session.js,
report.js, render-review.js). UK-only app: any locale date format names 'en-GB'
(harness 24b sweeps every first-party file).

### storage.js (~770 ln) — persistence boundary
The key-shortening codec (`SESSION_KEY_MAP`, `ITEM_KEY_MAP`), `load`/`save` and
the per-area save paths, the shared boundary validators
(`normaliseReportSettings`, `normaliseArchivedStats`), storage stats.
**Touch to:** change how data is stored, loaded or migrated.
**⚠ Data-integrity zone — backup round-trip after every edit.**
⚠ v78: the TOMBSTONE LEDGER (`state.tombstones`, TOMBSTONES_KEY) lives here —
`normaliseTombstones` / `parseTombstones` / `purgeTombstones` / `recordTombstone`,
plus TOMBSTONE_KINDS. Deleted records are kept OUT of state entirely (no
`deleted` flag on any record), so NO read path filters them — that is the design
and 14g fails if a flag ever appears. `recordTombstone()` does NOT save, and is
always called BEFORE the removal (cross-cutting rule 5). Callers: clients.js ×4
(deleteClient + its site cascade, deleteSite, resolveAssignMerge), session.js ×2
(deleteSession, deletePreset), instruments.js ×1 (deleteInstrument, v83),
settings-actions.js ×1 (deleteReportTemplate, v84). Prune deliberately does NOT record — decision C,
settled V80: clearing is local, the cloud keeps the job (sync.js remembers the
id in SYNC_PRUNED_KEY instead). sync.js READS the ledger (every synced kind).
⚠ v80: `saveSessions()` carries the ONE sync line (`syncNoteSave`, guarded and
wrapped). Every session save passes through it — keep it cheap.
⚠⚠ v69: `_encodedSessionCache` reuses a session's encoding when the items ARRAY
REFERENCE and `_sessionSig()` are unchanged — and the sig covers item COUNT, not
item CONTENTS. Anything that edits strings INSIDE existing item objects must call
`_invalidateSessionEncoding(sess)` or the stale encoding is written back and the
edit silently un-happens on reload. Only bites NON-ACTIVE sessions (the active
one always re-encodes fresh), which is why it is easy to miss in a test.
⚠ v83: `_sessionSig()` now includes `instrumentId` and the PRESENCE of
`instrumentSnapshot`. Without it, deleteInstrument's in-place freeze never reached
disk for non-active jobs (bug present v66–V82; 19a, M226). Any NEW session-level
field written in place on non-active jobs must join the sig.
⚠ v69 (D5): `runApostropheRepair()` / `apostropheRepairUndoCount()` /
`undoApostropheRepair()` — one-time rewrite of stored locations, item types and
preset entries, latched on `REPAIR_DONE_KEY`, undo diff in `REPAIR_UNDO_KEY`.
Called from boot.js after `load()`, before the first `render()`.
**Coupling:** ⚠ ordering inside `load()`/`save()` matters and is harness-asserted
— `loadInstruments()` runs **after** the legacy tester keys (migration source);
`saveInstruments()` runs **before** writing them (a prune re-syncs the mirror).
Unlisted fields pass through the codec untouched, which is why additive fields
need no map entry. Rules 9 and 10 live here.
⚠ V87 (4A): a refused write is CAUGHT, not thrown. `saveSessions()`,
`saveSettings()` (guard around `_saveSettingsWrites()`), `saveSqpHistory()`,
`saveDescriptions()` → `_noteSaveFailure()` sets `state.saveFailure`; render-core's
`renderSaveFailSheet()` shows it. Only a successful `saveSessions()` clears it
(`_noteSaveOk`). The ~40 other direct writes are caught by dispatch.js's action
catch via `_isQuotaError()`. A new saver on the logging hot path must be guarded
the same way (24e found saveSqpHistory). Also here: `checkStorageProtection()`
(S12, paints #storage-protect IN PLACE, never render) and
`storageBannerDue()`/`dismissStorageBanner()` (S13, STORAGE_BANNER_KEY).
⚠ v84: `saveReportSettings()` / `saveReportTemplates()` arm the sync trigger;
`saveSettings()` writes report settings through the plain `_writeReportSettings()`
so it never does (sync.js calls it after a pull). `reportSettings.certSetAt` =
when the counter was last typed by hand ('' never).

### clients.js (~517 ln) — clients & sites
CRUD, lookups, the site snapshot compose/split used by CSV, assign/move flows.
Orphan sites (empty clientId) are legal.
**Touch to:** change how clients/sites are stored or managed.
**Coupling:** `load()`/`save()` in storage.js call in. `splitSiteSnapshot` is
csv.js's dependency. Delete/rename confirms route through feedback.js sheets.
V98: site notes — `normaliseSiteNotes`/`withSiteNotes` are the ONE normaliser
(load, the site sheet, the Overview sheet, backup.js restore, sync.js
`_syncRecordDoc`). ⚠ The `notes` key is ABSENT when empty — never `notes: ''`
(sync rule 36; harness 35a/35b). `siteForSession` (link, then the site text) and
`siteForNames` (read-only, as startSession resolves) are read by render-review.js
(Overview card), render-core.js (New Job form), dispatch.js and session.js
(`saveSessionEdits` re-links `siteId`). report.js and csv.js must never read notes
(35k).

### instruments.js (~665 ln) — test instruments & calibration
The instrument list, which is active, and **which instrument a given job's
certificate names**. Owns the three-tier resolution (`instrumentForSession`:
stamped id → frozen snapshot → active), calibration status, the mirror sync
helpers, CRUD, and its own settings/editor markup.
**Touch to:** anything about instruments, calibration status, or which instrument
a certificate names.
**Coupling:** ⚠ Rule 7. `report.js`, `csv.js` and the UI must all resolve through
`instrumentForSession()`. `deleteInstrument()` freezes `session.instrumentSnapshot`
onto referencing sessions **before** removing (rule 5), through
`freezeInstrumentOntoJobs()` — v83: **sync.js** calls the same helper for a remote
delete; never give either path its own copy. v83: `deleteInstrument()` records an
`instrument` tombstone. `INSTRUMENTS_MAX` is the Add button's cap only; load and
restore cap at `INSTRUMENTS_STORED_MAX` (config.js, decision 4A).
`restoreInstrumentsFromBackup()` is shared by backup.js and setup.js and depends
on the caller having restored the flat fields first.
Renders its own screens here rather than in render-settings — deliberate, and the
editor screen is intentionally absent from `SETTINGS_CATEGORIES`.

### sqp.js (~286 ln) — Smart Quick Pick
Location→item-type learning, scoring, ordering, history persistence.
**Touch to:** change how the quick-pick row adapts to location.
**Coupling:** tuning constants in config.js. Toasts via feedback.js; confirms in
dispatch.js. ⚠ v86: `clearSqpHistory`/`rebuildSqpHistory` stamp `SQP_RESET_KEY`
(`markSqpReset`) — sync.js lets a later reset beat the merged counts.
v94: `unrecordSqpUsage` is `recordSqpUsage`'s reverse — called only by Undo
(session.js `undoLastLog`).

### multipick.js (~290 ln) — Multi Pick + its Quick Pick tiles (v94)
Slot config, the batch-log fire path, settings save. v94: a multi-pick's `qp`
(1|2|3) puts it on the Quick Pick grid as a tile — `qpTiles`, `qpTileSelect`,
`qpTileClear`, `qpTileFire` (PASS with a tile), `mpQpPicked` (settings clash).
**Touch to:** change the multi-pick sheet, its settings, or the tiles.
**Coupling (v94):** the tile is drawn by **render-core.js** `renderEntry` (types
sliced to 9 − tiles; CSS places tiles on row 3); selected in `state.form.qpTile`,
which `loadFormForCursor` does not rebuild (so it clears like the item type);
cleared by **dispatch.js** `quick-pick` and **events.js** f-type input / type
suggestion; **session.js** `passClicked` branches to `qpTileFire` BEFORE
`validateBeforeSave`; `failClicked` refuses. `qp` must survive the
normaliser here AND **sync.js** `_syncGeneralNormalise` / `_syncApplyGeneral` /
`_syncGeneralDiffs` (13A). Every batch path calls `noteLastLog` (Undo).
**Coupling:** computes asset numbers via `nextAssetNo()` and clears the scan
carry-forward flags before `loadFormForCursor()` (rule 4). Stamps `ts`
unconditionally since v77 — see the session.js entry.
**⚠ Not the same feature as "Log again ×N"** (session.js): Multi Pick fires a
fixed MIXED list of types as passes; ×N repeats ONE item, whatever its result.

### feedback.js (~460 ln) — toast, dialogs, haptic / flash / sound
`showToast`, the shared `.bulk-sheet` dialog builders (`openConfirmSheet`,
`openNameSheet`, `openInfoSheet`, v91 `openChoiceSheet` — two or more choices +
Cancel), feedback channels.
**Touch to:** change feedback channels, toasts, or the shared dialogs.
**Coupling:** rule 11 — every destructive confirm in the app routes here. No
state, no re-render. Loads before everything that toasts.

### bugreport.js (~330 ln) — one-tap problem reporting
Global error capture, device diagnostics, the mailto report builder.
**Touch to:** change what's collected, the report format, or the error catcher.
**⚠ THE PRIVACY RULE: diagnostics carry COUNTS AND FLAGS ONLY** — never client
names, sites, asset numbers, locations, item types, notes or cert numbers. Check
any new field against this; the harness asserts it.
**Coupling:** sheet MARKUP is `renderBugSheet()` in render-help.js — moved there
from render-settings.js in v73 (render files own markup); logic is here. Rule 3 applies to the sheet.
`initErrorCapture()` is called once from boot.js (rule 6). Known limit: boot.js
loads last, so a parse-time failure in an earlier file predates these handlers —
covered by the boot integrity guard instead.
v68: captured error TEXT is the one field the privacy rule can't cover by
construction, so `_scrubCustomerData()` redacts known customer strings at
report-build time. ⚠ It FAILS CLOSED — an incomplete term list withholds the
message rather than passing it through. Do not add a raw-text fallback.

### photos.js (~990 ln) — photo evidence store
**The app's only IndexedDB code.** Record store, count index, image processing,
object-URL tracking, the separate photo export/import bundle.
**Touch to:** anything about photo storage, processing, or the photo export file.
**Coupling:** rule 2 — `render()` reads `photoCountForItem()` off the in-memory
index only. Rule 5 — four removal paths in session.js cascade here. Rule 6 —
everything fails soft; nothing here may break the fail flow. `sessionId` is
denormalised onto each record so deleting a job sweeps in one indexed lookup.
Photos are **not** in the JSON backup (separate file) — backup.js carries only an
informational count.
⚠ v88: `state.photoMeta` (photo id → job, item, size, time) is the mirror
**sync.js** reads to upload; `photoMetaReady` gates it (and the prune guard).
Every add/delete must keep BOTH mirrors in step.
⚠ v90: `photosRemoveQuiet(ids, keepPreview)` is also the manager's "Remove from
phone" (known-in-cloud only, caller checks); notes nothing either way.
⚠ v89: cloud-only lookups (`photoCloudOnlyForItem`, `photoCountForItemAll`,
`photoCountsForSession`, `photoCloudOnlyForSession`) read **sync.js**'s
`state.photoCloud`, memoised on `photoMetaV`/`photoCloudV`/ledger — every meta
change must go through `_photoMetaPut`/`_photoMetaDrop` or reassign the object.
Shown only while signed in to `state.photoCloudUser`. Consumers: render-core.js
(jobs list, entry button), render-review.js (chip, strip), session.js (strip,
fail→pass, cap), report.js (4A prompt). `photoAddFromCloud` keeps the cloud id
(never re-uploaded); `photosRemoveQuiet` notes nothing. Engineer deletes (one photo, an
item, fail→pass) call `_photoNoteGone` → ledger kind 'photo' (storage.js
`saveTombstones`) + sync.js `syncNotePhotosGone`. `photosDeleteForSessions`,
`photosDeleteAll`, `photosClearUploaded` NEVER note (V80 C, 5A) — harness 25h/25l,
M363/M368. The wipe action (dispatch.js) branches on `syncActive()`.

### csv.js (~665 ln) — CSV build + import
Cell resolution per column, export/share/copy, import parsing and conflict flow.
**Touch to:** change CSV columns, export, or import parsing.
**Coupling:** column list from config.js; `splitSiteSnapshot` from clients.js;
instrument columns via `instrumentForSession()` (rule 7, source-guarded in the
harness). Import learns new clients/sites into clients.js.

### backup.js (~340 ln) — backup / restore
`buildBackup`, restore, the export reminder/snooze logic.
**Touch to:** change the JSON backup shape or restore path.
**⚠ Keep old-backup compatibility; bump `backupVersion` only for a genuine
incompatible change (rule 10).**
⚠ v79: NO sign-in data in a backup, ever; restore ignores a V43 `authUser`
block (harness 15d, M134).
⚠ v81: `pat:syncHeld` is NOT in backups (nor is the pull cursor) — it records a
disagreement with a server, not the engineer's work (17o).
⚠ v80: `syncPruned` rides in the backup (via sync.js `syncPrunedList`, omitted
when empty) and is MERGED on restore (`syncPrunedMerge`), never replaced. The
sync fingerprints (SYNC_STATE_KEY) are NEVER in a backup. Harness 16j.
**Coupling:** restores through the SAME validators as `load()`
(`normaliseReportSettings`, `normaliseArchivedStats`, `normaliseItemReadings`,
`normaliseSessionRetest`, `restoreInstrumentsFromBackup`, V100
`normaliseReminders` — session.js) — never write a second validator. V100: the
backup interval comes from `backupReminderDays()` ('off' silences even
"never backed up"); `BACKUP_REMINDER_DAYS` is only the default. ⚠ Instruments restore **after** the flat fields. Boolean flags restore
only when the backup actually holds a boolean (absence ≠ off).

### setup.js (~260 ln) — export/import Setup bundle
Config-only shareable bundle: presets & lists / report settings / CSV columns /
tester & calibration / app preferences.
**Touch to:** change what a shared setup carries or the bundle format.
**⚠ Config-only — must never read or write sessions, clients, sites or stats.**
**Coupling:** applies sections through the same validators as backup restore.
File-kind guard rejects a backup imported as a setup and vice versa.

### tour.js (~217 ln) — guided walkthrough
Five self-contained slides, each a static HTML/CSS mock (no live-element
coachmarks — the fragile iOS path). Transient state, never persisted.
**Touch to:** change the walkthrough slides, mocks or paging.
**Coupling:** routed as a full-screen view early in `render()`. Entry points: the
wizard finish step and About.

### report.js (~1190 ln) — PDF certificates
Lazy-loads the vendored jsPDF + AutoTable, builds the document, the preview
modal, filename tokens, share/download.
**Touch to:** change report layout/content, reading columns, orientation, or how
the PDF is previewed, shared, named or coloured.
**⚠ THE ASYNC BOUNDARY.** `buildReportDoc` is **synchronous** and has three call
sites, two of them sync. Photos (IndexedDB) are read and re-encoded once, up
front, in the async `produceReport`, and passed in. **Never make `buildReportDoc`
async and never let it touch the database.**
**⚠ The footer pass must run LAST**, after every page exists — it captures
`pageCount`. Running it earlier gives a photo report footers reading "Page 1 of 2"
on a 4-page document.
**Coupling:** rule 7 for instrument fields. Reading columns mirror the CSV
emit-only-if-used rule. v84: `stampCertNumber` skips any number already on a
job in `state.sessions` (jobs synced from the other phone included). V87: `reportDocProperties()` (pure) builds the PDF's
title/author, set right after `new JsPDF` inside the sync build; file names go
through utils `fileSafe`/`fileDateUK`; the retest line is a MONTH. Every `addImage` is try/caught — a bad image never blocks
a report.
V89: `produceReport` asks about cloud-only photos (`_reportCloudPhotoChoice`,
built on **feedback.js** `_openSheet`) BEFORE `stampCertNumber` — Cancel must
cost no number (M388) — and downloads through **sync.js** `syncPhotoDownload`.
V95: the END of the document is one of two sections — `_appendRemedialPages`
when `_remedialWanted` (it carries the photos too), else `_appendPhotoPages`.
Both draw through the shared `_photoGeom` / `_drawPhotoGroups` / omit-notice
helpers; change photo block layout there, once.
V100: the preview's Download and (successful) Share call **session.js**
`noteReportMade(session.id)` — a certificate that leaves the phone stamps the
job's `reportAt`; `shareOrDownloadReport` returns false on a cancelled share.

### pdfpreview.js (~135 ln) — multi-page preview rasteriser
Lazy-loads vendored PDF.js, renders each page to a stacked canvas, DPR-capped,
sequential for iOS memory.
**Touch to:** change preview rasterising, the lazy load, or the PDF.js version.
**Coupling:** throws on parse failure so report.js falls back to its iframe view.

### session.js (~2490 ln) — sessions and items
Session/item lifecycle, form and cursor, validation, suggestions,
⚠ V87: retest reminders are by MONTH — `retestStatus(sess, now)` buckets
('upcoming' = due next month, 'duesoon' = due this month, 'overdue' from the 1st
of the month after; names kept from v56 for the CSS/filter). No stored due date.
sorting/filtering, presets, selection + bulk edit, export state and pruning,
retest reminders, lifetime stats, asset history, testing duration, readings
sheet lifecycle, photo staging/commit.
⚠ **v70 split it.** Settings saves, report settings, signature capture, cert
numbers and templates → `settings-actions.js`. First-run wizard and demo seed →
`onboarding.js`. `dismissWelcome()` → `render-core.js`. Bodies byte identical.
**Touch to:** session and item logic changes.
**Coupling:** the busiest file in the app —
- `setView` and `loadFormForCursor` clear transient overlays; new transients must
  be added there (rules 3, 4).
- Four removal paths cascade to photos.js and two archive stats before removing
  (rule 5).
- Append paths (`saveItem`, `copyLastResult`, `repeatLastResult`, `multiPickFire`,
  `seedDemoSession`) stamp `ts` unconditionally; **edit branches must never
  stamp** — `ts` means "first logged". ⚠ v77 fixed `multiPickFire`, which was
  missed when v61 changed this rule and still gated CAPTURE on
  `state.timestampsEnabled`. The setting gates exposure only. Harness 13k,
  mutations M115/M116.
- ⚠ `repeatLastResult()` (v77, "Log again ×N") is modelled on `multiPickFire`,
  NOT on `copyLastResult` beside it: it always APPENDS (copy-last overwrites at
  the cursor, which for a batch would destroy N−1 rows), ignores the form's asset
  box, and CARRIES the source item's notes because a fail's reason lives there.
  Mutations M110–M114.
- `state.sessions` is reassigned in exactly four places: load, restore, prune,
  delete. Any new removal path needs the same hooks. v91: `removeJobsFromPhone`
  (take jobs off this phone, the cloud keeps them — stats archive, photo sweep,
  `syncNotePruned`, then filter) is the signed-in clear; callers re-check safety
  first. `unarchiveSessionStats` is its reverse (sync.js `syncBringBack`).
- v91: `deleteSessionAsk` (the 🗑 on a card, via dispatch `delete-session`) —
  signed in: **feedback.js** `openChoiceSheet` → remove from this phone
  (**settings-actions.js** `jobsRemoveAsk`) or `deleteEverywhereAsk` (second
  confirm) → `deleteSession`. `pruneOldSessions` signed in → `jobMgrOpen`.
- v94 Undo: every APPEND path (`saveItem`, `copyLastResult`,
  `repeatLastResult`, **multipick.js** `multiPickFire` / `qpTileFire`) calls
  `noteLastLog`; edit branches don't. `undoAvailable` re-checks at the tap (still
  last, unchanged — JSON snapshot). `undoLastLog` sweeps photos BEFORE the splice
  (rule 5) and calls **sqp.js** `unrecordSqpUsage`. `openSession` clears
  `state.lastLog`. A new append path must call `noteLastLog` or Undo takes back
  the item BEFORE it. v94 `locationCountInJob` feeds **render-core.js**
  `locationCountText`.
- `captureWizardStep()` is the last legacy writer of the instrument flat mirror
  and calls `adoptMirrorIntoInstruments()` (rule 7).
- V99 map pins (item field `pin`): `mapPinOf` is the one reader (**render-core**,
  **render-review**, **csv.js**, **report.js** call it); `setItemMapPin` the one
  writer (replaces the item object + `_invalidateSessionEncoding`). Never from the
  fail sheet. `failToPassAsk` drops it via `state.form.dropPin` (read in
  `saveItem` before `loadFormForCursor`); `copyLastResult` overwrite clears it.
  `mapPinResume` is called by **boot.js** before the first render;
  `mapPinOfferShow` appends into #app AFTER `refreshEntryAfterLog`.
  V99.1: `mapPinOpenW3w` opens the APP (`W3W_APP_URL`, location.href — never
  window.open, which leaves a blank panel); `_mapPinWatchLeave` offers the
  website (`mapPinOpenW3wWeb`) only if the page never hid or lost focus.
- V100 reminders (block after `unexportedSessions`): `normaliseReminders` (the one
  normaliser — storage, backup, setup, settings-actions), `backupReminderDays`
  (**backup.js** `shouldShowBackupReminder`), `isExportReminderJob` /
  `exportReminderDue` / `unlockedReminderDue` (**render-core.js**
  `renderReminderBanners`), `reviewReminder` / `quietReminder` (dispatch).
  `lockedAt` is written ONLY by `saveSessionEdits` (on the change to locked) and
  removed by it and `unlockActiveSession` — a new lock/unlock path must do the
  same. `noteReportMade` (called by **report.js** preview Download/Share) stamps
  `reportAt` by id. Both fields are in `_sessionSig` (**storage.js**). Read
  `lockedAt` only through `lockedAtMs` (ignores it on an unlocked job). The
  `remindexport` list filter is transient (storage load drops it).
  `setView` clears `state.partyOpen` / `state.egg` (**render-help.js**).
**Note:** `state.view` is set directly from ~14 places, so per-render concerns
(scroll reset) live in `render()` via `_lastRenderedView`, not in `setView`.

### settings-actions.js (~1620 ln) — the write half of the Settings screens + the photo manager (v90) + jobs on this phone (v91) + the Jobs screen's cloud tab (v93) — NEW v70
Per-page saves, Report Settings (text, logo, filename tokens), signature capture
(draw and upload), CSV column ordering, Export/Import Setup UI handlers, the
editable list settings (item types, fail reasons, descriptions) and the
appearance/feedback toggles. Job notes, certificate-number override and report
templates live here too — saved from the same screens, same shape.
⚠ v84: `applyReportTemplate` keeps the live `certNextNumber`/`certSetAt` (3A);
`captureReportTextInputs` stamps `certSetAt` only when the counter box really
changed; `deleteReportTemplate` records a `template` tombstone and saves via
save() (18r: nothing outside storage/sync calls saveSettings()).
**Touch to:** change what a Settings screen SAVES. To change how one is drawn,
go to render-settings.js; to change a default, config.js.
**Coupling:** `saveReportSettingsForm()` reads the DOM, so any re-render must
call `captureReportTextInputs()` first or unsaved text is lost (dispatch.js
depends on this). `setTheme` delegates to `applyTheme` (session.js). Extracted
from session.js in v70, byte identical.
⚠ V96: `settingsOpenCategory` (a one-page group opens its page, settingsCategory
null so Back → hub) and `mgrNoteReturn`/`mgrGoBack` (Back from Manage photos /
Jobs on this phone returns to the view that opened it; dispatch `pm-open`/`jm-open`
note it, as does session.js's tidy offer before `jobMgrOpen`).
⚠ v90: also the PHOTO MANAGER's logic (`photoMgr*`, `_pm*`): `photoMgrModel()`
(synchronous — render() calls it) merges **photos.js** `state.photoMeta`,
**sync.js** `state.photoCloud` and the in-memory look (`state.photoMgr.cloud`).
⚠ V95: `descRenameApply` edits items IN PLACE in jobs that are not open — it must
call **storage.js** `_invalidateSessionEncoding` per touched job (sync spec §6
trap, M503). Locked jobs are never touched. V95.1: `descDeleteAsk` (list only) via
**feedback.js** `openNameSheet`'s optional `onDelete` — other name sheets unchanged.
Actions reuse existing paths only: `photosRemoveQuiet(ids, true)`,
`syncPhotoDownload`, `photoDelete`/`photoDeleteCloudOnly`,
`syncPhotoKnowForDelete`. 8A: nothing on a locked job is deleted. Markup is
`renderPhotoManager()` in **render-review.js**; actions `pm-*` in **dispatch.js**;
**session.js** `setView()` calls `photoMgrLeave()` on any other view.
⚠ v91: JOBS ON THIS PHONE and the tidy-up offer (`jobMgr*`, `_jm*`, `tidy*`,
`jobsRemoveAsk`, `savePhotoAge`). `jobMgrModel()`/`tidyModel()` are synchronous
(render() calls them) over **sync.js** `syncJobsSafety`. EVERY removal goes
through `jobsRemoveAsk`: sync first when online → `syncPruneFilter` (fresh) →
v92 `syncVerifyJobs` (real contents; online only; a failed read stops) →
confirm → `syncWhenIdle` → re-check with the same map → **session.js** `removeJobsFromPhone`.
Old photos → `photosRemoveQuiet`. Offer timer TIDY_OFFER_KEY (`tidyOfferDue`/
`tidyOfferAnswered`). Markup `renderJobManager()`/`renderTidyBlock()` in
**render-review.js**; banner `renderTidyBanner()` in **render-core.js**; Phone
Storage page block (V97, was Backup) in **render-settings.js**; actions `jm-*`, `tidy-*`,
`photo-age-save` in **dispatch.js**; `setView()` calls `jobMgrLeave()`.
v93: the Cleared section is a link (`jobMgrCloudLink`, `jm-cloud-link`) to the cloud tab.
⚠ v93: THE "IN THE CLOUD" TAB (`cloudJobs*`, `_cloud*`, `jobsTabSet`,
`cloudTabActive`). `state.jobsTab` / `state.cloudJobs` (state.js, transient).
`cloudJobsLoad` → **sync.js** `syncCloudList` (memory only; kept for the session,
re-read on ⟳, a different account, or `stale` — set by **session.js**
`removeJobsFromPhone`). `cloudJobsModel()` is synchronous (render calls it):
hides jobs on the phone, search, month groups. Tap → `_cloudBring` →
`syncBringBack` → `requestOpenSession` (one job) or stays (several). The search
box is an input: `cloudJobsSearch` → `refreshCloudListAreaOnly` (render-review.js),
never render(). Markup `renderCloudJobsHTML`/`renderCloudListAreaHTML` in
**render-review.js**, drawn by **render-core.js** `renderSessions`; actions
`jobs-tab`, `cloud-*` (+ input `cloud-search`) in **dispatch.js**.

### onboarding.js (~195 ln) — first-run wizard — NEW v70
The wizard state machine (step capture, paging, fresh/import fork, theme pick,
demo toggle, finish, skip), `restartOnboarding()`, and `seedDemoSession()`.
Holds `WIZARD_LAST_STEP`.
**Touch to:** change the first-run flow. The wizard's MARKUP is render-core.js.
**Coupling:** ⚠ `captureWizardStep()` is the last legacy writer of the
instrument flat mirror and must keep calling `adoptMirrorIntoInstruments()`
(rule 7). `onboardSetupImport()` delegates to setup.js; the final step can hand
off to tour.js. Extracted from session.js in v70, byte identical.

### render-core.js (~1850 ln) — dispatcher + the logging screens
Owns `const app` and the `render()` dispatcher. Sessions list, entry screen,
empty states, welcome modal AND its `dismissWelcome()` handler (moved here
v70 — see rule 8), first-run wizard markup, signature pad, calibration banner,
retest/backup banners, asset-history sheet, import conflict/summary modals,
client/site suggestion markup, tour route.
**Touch to:** change the Sessions list, the entry screen, or any modal render()
emits. For Overview / Edit Session / Reports / Retest reminders, go to
render-review.js.
**Coupling:** `render()` calls `bindFocusFields()` (events.js) after setting
`innerHTML`. Rules 2, 3 and 8 all bite here. `refreshEntryAfterLog` must set
`_lastRenderHadModal` from live sheet state, not a constant. Sheets that hold
inputs get targeted refresh helpers; read-only sheets may render.
The **calibration banner is ONE banner** covering the worst instrument with
"+N more", never stacked.
⚠ v72: `renderEntry()` calls `renderFailPhotoStripInner()` and
`renderPhotoStripSheet()`, which now live in **render-review.js**.
⚠ v85: the dispatcher paints the three cloud views only when
`cloudPagesUnlocked()` (cloud.js); otherwise `renderCloudLocked()`. The V43 About
long-press is gone — `setupLongPress` (utils.js) now has no caller.
⚠ v93: `renderSessions()` draws the "On this phone | ☁ In the cloud" tabs when
`syncActive()`; the cloud tab returns early with **render-review.js**
`renderCloudJobsHTML()` (no banners, no new-session form there).
⚠ V100: `renderReminderBanners()` (Jobs screen, reads **session.js** reminder
logic at render — nothing scheduled); the Status filter offers `remindexport`
while the not-exported reminder is on. The welcome's top is **render-help.js**
`v100HeroHTML()`; `render()`'s finalHTML carries `renderPartyModal()` and
`renderEggSheet()` (render-help.js) and its tail calls `partyAfterRender()`.
⚠ v94: the entry screen's location count (`#loc-count`, `locationCountText`) is
repainted in place by `refreshLocationCountOnly()` from **events.js** location
blur / suggestion pick (no render). Multi Pick tiles + `failDisabled` + the
Copy last / ↶ Undo row (`state.undoEnabled`) are built here — the tile block
must read `sess.locked`, not `isLocked` (declared later: TDZ).

### render-review.js (~1130 ln) — review & manage screens — NEW v72
Overview (+ `computeVisibleOverviewItems`, `renderOverviewBodyHTML`,
`refreshOverviewBody`, `refreshOverviewSelection`), Edit Session, Retest
Reminders, the Reports hub, and the shared photo-evidence markup
(`renderFailPhotoStripInner`, `renderPhotoStripSheet`).
**Touch to:** change the Overview, edit-session, retest reminders or reports
screens, or the fail-sheet/overview photo strip.
**Coupling:** reached only through `render()`'s dispatcher — NOT through the
dispatch.js ACTIONS table, so 09d's generic guard is blind to these; 09m–09q
cover them instead. `dispatch.js` calls `refreshOverviewBody()` /
`refreshOverviewSelection()`; `session.js` calls `computeVisibleOverviewItems()`
/ `renderFailPhotoStripInner()`; `render-core.js` (renderEntry) calls both photo
helpers. Declares NO top-level bindings, so its load position is free.
`renderRetestReminders()` bounces to the sessions list when the retest feature
is off — any test of it must turn the flag on first.
v90.1: "Look in the cloud" is a small `.pm-look-link`, not a button; after a
look one line says what it found (`totals.awayN/awayJobs/orphanN` from the model).
v90: `renderPhotoManager()` (view `photoManager`, reached from Phone Storage (V97);
render-core falls back to Phone Storage if it is missing). Previews are
painted into `#pm-t-<id>` in place by settings-actions.js, not by render.
v91: `renderJobManager()` (view `jobManager`, same fallback) and
`renderTidyBlock()` (also used by render-settings.js's Phone Storage page).
v93: `renderCloudJobsHTML()`, `renderCloudListAreaHTML()` and
`refreshCloudListAreaOnly()` — the Jobs screen's cloud tab (called from
render-core.js, model in settings-actions.js).
V98: the Overview's title bar is `.header-row.header-sticky` (styles.css; both the
normal and selection headers). The site-notes card and its sheet
(`state.siteNotesSheet`, cleared by setView) are drawn here; the sheet holds an
input, so it is never re-rendered while typing (rule 3) — its text lives in state.
Boot probe: `renderOverview` in `requiredFns`.

### render-settings.js (~1377 ln) — settings screens that own a setting
The two-level Settings hub, its search, every `renderSettings*` sub-page with a
write handler behind it, `renderSettingsSubHeader()`, the earth-resistance
calculator, `renderPhotoBackupSection()` (photo FILES, inside Backup & Restore)
and `renderPhotoStorageSection()` (Manage Photos + clear, inside Phone Storage).
**Touch to:** change any Settings page that changes a setting.
**Coupling:** category structure and search aliases live in **data.js** (moved
from config.js in v71), not here. Scanner test-log markup lives in **scanner.js**
(it repaints without a render). Bug sheet logic lives in **bugreport.js**.
Instrument settings live in **instruments.js**. The stats footer reads
`computeAppStats()` (session.js) and returns `''` when null.
⚠ v73: About, Glossary, Contact, the bug-sheet markup and the cloud stubs left
for **render-help.js**, and those pages still call `renderSettingsSubHeader()`
from here. The About changelog is no longer in this file.
V100: `renderSettingsReminders()` (view `settingsReminders`, Phone & Display) and
`reminderSettingsSummary()`; labels in `REMINDER_LABELS`, values validated by
**session.js** `normaliseReminders`, written by **settings-actions.js**
`setReminder`.
⚠ v85: the hub hides the Cloud group where there is no cloud; search skips its
pages and the group paints `renderCloudLocked()` (render-help.js) until
`cloudPagesUnlocked()` (cloud.js).
⚠ V96: hub order (`settingsCategoriesInOrder`), per-page visibility
(`settingsPageVisible`, `settingsCategoryPages` — used by the list AND search),
the locked catCloud blurb (`settingsCategoryBlurb`) and the footer
(`settingsWhereDataLives`, reads `syncActive()`) live here. Opening a group is
`settingsOpenCategory` in **settings-actions.js**. Row subtitles for the three cloud pages read
`state.cloud` and `syncStatusSummary()` (sync.js), typeof-guarded.
⚠ V97: Backup & Restore (`settingsBackup`) = copies only; Phone Storage
(`settingsStorage`, `renderSettingsStorage`) = space (protection slot
`#storage-protect` painted in place by storage.js, meter, prune/tidy, ages,
photo clear). Logging Options (`settingsLogging`) = Undo + item times; item times
sync (settings_work), so the view is in `SYNC_GENERAL_VIEWS` and
`SYNC_NO_REPAINT_VIEWS` (config.js). A new page that owns a synced setting must
join both lists. Ways in: `storage-banner-open`, `save-fail-clear` (dispatch.js);
manager Back `_MGR_RETURN_VIEWS` (settings-actions.js).

### render-help.js (~633 ln) — help, about & cloud pages — NEW v73
About (+ the rolling 3-version changelog), Glossary (page + the
`GLOSSARY_GROUPS` data array), Contact, `renderBugSheet()` markup, and the three
cloud pages, reached from Settings → Cloud (v85; the About long-press is gone)
plus `renderCloudLocked()`, the access-code box shown until the phone is
unlocked. Account is real (logic in **cloud.js**); Sync is real from v80
(logic in **sync.js**); Subscription is a placeholder. v82: `renderSyncHeld()`
groups jobs and clients & sites, and `openSyncDiffSheet()` builds the read-only
comparison sheet via feedback.js `_openSheet()`. v83: a third group, instruments &
presets (`listRow`, incl. the tester-in-use card and per-field `diffs`); the Sync
page shows an instruments & presets count and the tester in use.
**Touch to:** roll the About changelog, add or reword a glossary term, change the
Contact page or the bug sheet's markup, or work on the cloud stubs.
**Coupling:** reached only through `render()`'s dispatcher — NOT through the
dispatch.js ACTIONS table, so 09d's generic guard is blind to these; 09r–09w
cover them instead. Calls `renderSettingsSubHeader()` back across the seam into
render-settings.js. `renderBugSheet()` is markup only — its logic and state are
in **bugreport.js**, and it returns `''` unless `state.bugSheetOpen`. Declares
ONE top-level binding, `GLOSSARY_GROUPS`, read only inside a function body, so
its load position is free (09u — V100's egg constants live in **config.js**, its
tap count and timer in `state`).
V100: the 100 moment (`v100HeroHTML` — also called by **render-core.js**'s welcome;
`renderPartyModal`, `partyOpen`, `partyAfterRender` — called at the end of
`render()`) and "PATGo tests itself" (`aboutTitleTapped`, `eggOpen`/`eggClose`,
`renderEggSheet`, painted in place by `_eggPaint`). Write nothing (11A). Both
overlays are added to `render()`'s finalHTML in **render-core.js**. Animation is
CSS transitions started from script (rule 12).
Boot probe: `renderSettingsAbout` in `requiredFns`.

### cloud.js (~315 ln) — cloud sign-in — NEW v79
Email-code sign-in (Supabase), session state in `state.cloud`, the TEST strip
and version tag, lazy load of `supabase.umd.js`. v85: the Cloud access code —
`cloudPagesUnlocked()`, `cloudUnlock()`, `CLOUD_UNLOCK_KEY` (config.js; per
device, never backed up), remembered on code entry and on any sign-in. Sign-in ONLY — nothing syncs.
**Touch to:** change sign-in, the Account page's behaviour, cloud errors, or add
the next cloud step (sync lives in `sync.js`, not here).
⚠ v80: `cloudUserId()` (sync reads it) and a guarded `syncPushSoon(0)` after a
successful sign-in.
**Coupling:** environment comes from **config.js** (`CLOUD_HOSTS` →
`CLOUD_ENV`/`CLOUD`, `CLOUD_AUTH_STORAGE_KEY`) — host decides, unknown = off.
Reuses `_injectScriptOnce` from **report.js**. Account page markup lives in
**render-help.js**; strip in **render-core.js** `render()`; version tag also in
**render-settings.js**; actions in **dispatch.js** (all typeof-guarded);
`cloudBoot()` in **boot.js** after `load()`, before first render.
⚠ Every async result lands through `_cloudRepaint()` — never call `render()` from
a cloud promise directly (rules 2/3). ⚠ Signed out = no library, no request;
harness 15b fails otherwise. ⚠ The server side (tables, RLS) is in
`supabase/*.sql`, NOT tested by the harness — `isolation-test.sql` every release.
Not probed at boot (optional subsystem). Harness 15a–15k, mutations M130–M141.

### sync.js (~4150 ln) — cloud sync, PUSH AND PULL — v80–v93
Jobs (sessions) both ways while signed in. Change detection is a per-job
FINGERPRINT of what was last sent (SYNC_STATE_KEY, per account) — no edit
timestamp exists, so pull compares hashes, not times. Deletes (session
tombstones) send an emptied row both directions. Prune guard
(`syncPruneFilter`) + cleared-ids list (SYNC_PRUNED_KEY). v81: pull cursor
(`st.pulledAt`), held jobs awaiting a decision (SYNC_HELD_KEY), re-send set
(`st.resend`), `syncHeldResolve`. Sync page logic.
**Touch to:** change what syncs, when, or how; add record kinds or photos.
**Coupling:** asks **cloud.js** who is signed in (`cloudAvailable`,
`cloudUserId`, `cloudClient`). Triggers: **storage.js** `saveSessions()` (one
line), **cloud.js** after sign-in, **boot.js** `syncBoot()` after `cloudBoot()`.
v81.1: EVERY trigger pulls before it pushes, the save debounce included — a push
must only ever follow a look (17m, M171). v81.2 adds two more: `syncNoteNav()`
from **dispatch.js**, on a real `state.view` change only, throttled; and an idle
backstop (`_syncIdleCheck`) that skips when hidden or offline. Prune guard/note called from **session.js** `pruneOldSessions()`;
backup hooks in **backup.js**; page markup in **render-help.js**
`renderCloudSync()` + `renderSyncHeld()`; actions `sync-push`,
`sync-resend-all`, `sync-pull`, `sync-keep-phone`, `sync-keep-cloud` in
**dispatch.js**. v81 WRITES APP DATA: adds, replaces and removes
`state.sessions`, and on a remote delete duplicates **session.js**
`deleteSession()`'s three sweeps (`archiveSessionStats`,
`photosDeleteForSessions`, `recordTombstone`) — deliberately, because
deleteSession ends in save()+render(). Keep the two in step (17f).
⚠ The hash is captured when the row is BUILT, not after upload (16f, M148).
⚠ Results land through `_syncRepaint()` — Sync page only, never over a focused
field (rules 2/3). ⚠ An applied row REPLACES the session object; it is never
edited in place (storage.js v69 encoding-cache trap, 17l, M170).
⚠ v81.2: FINGERPRINTS ARE CANONICAL (`_syncCanonical`). The `doc` column is
jsonb and Postgres re-sorts its keys, so hashing `JSON.stringify` output makes a
phone see its own pushed job as changed. The row is still SENT as
`JSON.stringify` — wire format and fingerprint are different jobs and must not
share a variable (M184). `SYNC_HASH_V` in **config.js** guards the stored
fingerprints; bump it whenever the calculation changes.
⚠ v81.2: pull results repaint the CURRENT screen (`_syncRepaintApp`), guarded by
`_syncSafeToRepaint()` and deferred to `_syncFlushRepaint()` when a field is
focused or a sheet is open. Push results still repaint only the Sync page.
⚠ v81.3: "on screen" is `state.activeId === id && state.view === 'entry'`.
activeId alone is NOT on screen — it survives going back to the jobs list (the
app remembers your last job). Leaving the job a change waits for is never
throttled in `syncNoteNav` (17x, M193, M194).
⚠ v81.4: `syncApplyWaiting()` ("Update now" on the entry screen's waiting line,
action `sync-apply-waiting`) sets `_syncAllowOpen` for ONE run and clears it
however the run ends (M195). Updates only — never deletes (M196).
⚠ v81.1: the job on screen (`state.activeId`) is JUDGED like any other — only
its APPLYING is deferred (`defer()`), and `state.sync.waiting` tells
**render-core.js** `syncWaitingBanner()` to say so. V81 skipped it before
deciding, so it was never held, so the push overwrote the other device's work.
Deciding and applying are different things; do not collapse them (17q, M180).
⚠ Held and push are mutually exclusive: nothing held is sent, and nothing in
`resend` is re-held. Break either half and the job can never sync again
(M173, M176).
⚠ v82: CLIENTS AND SITES through the `records` table (`SYNC_RECORD_KINDS`,
**config.js**). Own bookkeeping in `st.rec` (sent/gone/resend keyed by id, one
cursor, `kinds` — a changed kind list resets the cursor). `_syncRecordsHalf`
runs FIRST in a reading run only, and is fail-soft on its own: a records error
never stops jobs, and a failed records pull means no records push. Writes
`state.clients`/`state.sites` and saves via **storage.js** `saveSettings()`
directly (not save(), which would re-arm the trigger). ⚠ Hash the PROJECTION
(`_syncRecordDoc`), never the stored object — loadClients adds null fields on
reload (M198). Remote client delete does NOT cascade; `_syncTidyOrphanSites()`
moves dangling sites to Unassigned after a CLEAN pull only (4A). No trigger
change: every client/site write goes through save() → saveSessions() →
syncNoteSave, and 18r fails if anything else calls saveSettings().
⚠ v82: held entries carry `kind` (absent = job, V81). Clear/note are kind-aware;
the jobs push respects only kind 'session' holds. Page/dispatch key is
`syncHeldKey()`: bare id for a job, `client/<id>` / `site/<id>` for a record.
`syncJobDiff()` (pure, display text) + `syncHeldDiff()` (fetch on tap, action
`sync-held-diff`) → **render-help.js** `openSyncDiffSheet()`. The fetched doc is
never stored.
⚠ v83: INSTRUMENTS, PRESETS, TESTER IN USE through `records` (kinds
`instrument`, `preset`, `settings`). Writes `state.instruments` /
`state.activeInstrumentId` (then **instruments.js** `syncActiveInstrumentMirror`,
rule 7) and `state.itemPresets` (then **session.js**
`syncItemTypesFromActivePreset`, only if the preset in use changed). The
settings kind is ONE virtual row, `SYNC_INUSE_ID` (config.js), built from state
by `_syncRecordList` — every add/replace/delete path special-cases it; it is
decided LAST in a pull (`decideInUse`), agreement tracked in `st.rec.inUse`.
Cursor tag = kinds + `SYNC_SETTINGS_IDS` (`_syncRecordKindsTag`).
⚠ A remote instrument delete queues the frozen copy in `st.rec.freeze`;
`_syncFreezePending()` writes it from `_syncRun` AFTER the jobs pull (and at
`syncBoot`). Freezing earlier makes jobs the other phone already froze look
edited on both sides (19d, M231). The freeze itself is **instruments.js**
`freezeInstrumentOntoJobs()` — ONE helper for local and remote delete (19w).
⚠ `out.skip` = what the pull deferred (instrument open in the editor, a waiting
tester-in-use row); the records push skips it (M237). `_syncSafeToRepaint()`
also refuses `SYNC_NO_REPAINT_VIEWS` (config.js).
⚠ v84: REPORT SETTINGS, CERT COUNTER, TEMPLATES. Two more settings rows —
`SYNC_REPORT_ID` (report settings minus the counter, `decideReport`) and
`SYNC_CERT_ID` (the counter, `decideCert`: later `certSetAt` wins, else higher;
never held) — and kind `template` (`state.reportTemplates`). All hashed through
`_syncReportProjection` (normalised, counter stripped). 5A `_syncNothingMade`:
defaults / untouched starters / counter at 1 are never pushed while unsent.
While `state.view === 'settingsReport'` the two report rows are neither applied
nor pushed. Held cards: group 'rp' (`_syncRecordGroup(kind, id)`). Pull saves
through `_syncSaveLists()` — never `saveReportSettings()`/`saveReportTemplates()`,
which arm the trigger (21q, M292).
⚠ v86: GENERAL SETTINGS. Six more settings rows (`SYNC_GENERAL_IDS`, config.js),
each a projection (`_syncGeneralNormalise`) built fresh from state
(`_syncGeneralRecord`). WORK / FAILS / CSV / MULTIPICK: `decideGeneral` (records
rules + 5A, held with `_syncGeneralDiffs`). DESC: `decideDesc`, three-way merge
against `st.rec.descBase` (the list both last agreed — set only on equality or
after a send), never held. SQP: `decideSqp`, highest count wins, a later
`SQP_RESET_KEY` beats it, never held, never counted. ⚠ Both merged rows TAKE the
cloud's copy when only the cloud moved — merging then re-sends this phone's
order for ever (23f, M313). Open screens hold rows back (`SYNC_GENERAL_VIEWS`).
⚠ v94: the MULTIPICK row carries a slot's `qp` (Quick Pick tile) ONLY when set —
normalise, apply and diffs all three; a config with no tiles hashes as on V93.
Sync page group 'gs'. Couples to: storage.js (`readingTagForReason`,
`ensureAllCsvColumns`, `saveSettings`), sqp.js (`normaliseSqpHistory`,
`bumpSqpHistoryVersion`, `invalidateSqpRow`, `buildSqpHistory`), multipick.js
(`normaliseMultiPickConfig`), data.js defaults.
⚠ v88: PHOTOS UP, one way (`_syncPhotosHalf`, end of file). Runs LAST in a
reading run, after the jobs push; fail-soft on its own. File to Storage
(`{uid}/{photoId}.jpg`) THEN the `photos` row; `st.ph.sent[id] = {s, i}` only
after both (M355/M356). Candidates via `_syncPhotoJobs()` (reads photos.js
`state.photoMeta`): job syncs and is in `st.sent`, item still in it. Deletes:
ledger 'photo' entries + photos of jobs in `st.gone` — row marked deleted, file
removed, forgotten only after both. Prune guard (`syncPruneFilter`) also needs
every photo up (`_syncPhotosPendingByJob`).
⚠ v89: PHOTOS DOWN, rows only (`_syncPhotoRowsPull`, first step of the photos
half; own cursor `st.ph.pulledAt`, V83.1 pager shape). `st.ph.sent` now means
KNOWN in the cloud (own uploads + rows for jobs on this phone), entries
`{s, i, b?, t?, a?}`. Rows for jobs not here are skipped (R17); `st.ph.need`
(pushed by `_syncPull`'s add branch and `syncHeldResolve`) fetches them by job.
Deleted row → **photos.js** `photosRemoveQuiet` (no ledger). Deletes go to
anything known (5A), file AND `{uid}/{id}_t.jpg`. Previews: `_syncThumbUpload`
(photo → preview → row with `thumb`), `_syncThumbBackfill`. `_syncSave` points
`state.photoCloud` at `st.ph.sent` (`_syncPhotoCloudPoint`). Images come down
ONLY via `syncPhotoDownload` (session.js strip, report.js prompt); previews only
via `syncPhotoThumb` (strip open).
⚠ v90: the photo manager's two entry points (callers: **settings-actions.js**).
`syncPhotoBrowse` = "Look in the cloud": photos rows (keyset by id) + five
`doc->>` fields of jobs NOT on this phone; returns data, writes NOTHING (rule 24).
`syncPhotoKnowForDelete` adds found photos to `st.ph.sent` so the normal delete
step takes them — it waits for `_syncRunning` (a run saves its own `st` and would
overwrite it). `syncPhotoThumb(id, hint)` accepts a found row's `{t}`.
⚠ v91: SAFE IN THE CLOUD. `st.conf[jobId]` = hash of the cloud copy as the
pull last READ it (set in `_syncPull` for every valid live row; deleted/
unreadable clear it; trimmed to jobs on the phone). `SYNC_CONF_V` (config.js):
a state without it clears the jobs cursor once. `syncJobsSafety(fresh)` —
held / unsent / photos / checking / safe; `fresh=false` reuses a hash while
**storage.js** `_encodedSessionCache` reuses the encoding (reads that const and
`_sessionSig` — keep their reuse test and this one identical). `syncPruneFilter`
is now safety-based (always fresh). `syncWhenIdle(fn)`. `_syncSafetyRepaint`
after every run repaints `sessions`/`jobManager` when the safe set moved.
`syncBringBack` (reads the rows, adds through `_syncTakeRows`/`_syncTakeJob`
like a pull-add, sets conf, `ph.need`, leaves the cleared list, and — v93 —
**session.js** `unarchiveSessionStats` ONLY for jobs that were cleared).
⚠ v92: THE LIGHTER PULL. `sessions.fp` (server column + `sessions_fp_guard`
trigger in **supabase/schema.sql**) = `syncHash(_syncCanonical(doc))`, sent by the
push in the same row. `_syncPull` pages read `_SYNC_JOB_LIST_COLS` (no doc);
`needsDoc` picks rows the fp can't settle, fetched by id (`_SYNC_JOB_DOC_COLS`)
before the page is decided; a light row reaches `decide` with no doc — every
doc-reading branch must be a needsDoc "yes" (the `!doc` guards). A blank fp =
download (V91 phones). `_syncConfirmPushed` reads id+fp after the push → conf
(4A). `syncVerifyJobs(ids)` reads real docs for **settings-actions.js**
`jobsRemoveAsk`; `syncPruneFilter(targets, verified)` (3B). Records untouched.
⚠ v92.1: `_syncPushHalf` FORGETS a session tombstone (ledger + saveTombstones)
when the job is live, or its SYNC_PRUNED entry is newer — a stale tombstone
fired on Remove from phone and emptied the cloud copy. `syncNotePruned` moves
an existing entry's date on. Harness 29g–29i, M447–M451.
⚠ v93: THE WINDOW (R21/R22). A job with no local copy and no tombstone comes down
only if `_syncJobBelongs(_syncPicks(row))`: dated within SYNC_WINDOW_DAYS
(config.js), an unreadable date, or `_syncRetestDue` (**session.js**
`retestStatus`). The list carries `_SYNC_JOB_PICKS` (date, retest fields as
`doc->>`); `needsDoc` and `decide` both check it — a light row MUST keep the
picks. Nothing is stored about jobs left behind (the cloud is the list).
`_syncRetestLook` runs in `_syncRun` after the jobs pull, once per calendar
month (`st.rtMonth`), fail-soft. `syncCloudList` (replaces `syncClearedLook`)
reads `_SYNC_CLOUD_JOB_COLS` incl. server columns `n_items`/`n_fails` and the
view `session_photo_counts` (**supabase/v93-archive.sql**). Harness 30a–30i,
M452–M474.
Not probed at boot (optional subsystem). Harness 16a–16n, 17a–17z, 18a–18r,
19a–19w, 20a–20f2, 21a–21q, 23a–23l, 25a–25n, 26a–26q, 27a–27m, 28a–28i and
29a–29i and 30a–30i, mutations M142–M295, M306–M325, M355–M395, M396–M418, M419–M434, M436–M451, M452–M474.

### scanner.js (~470 ln) — HID barcode scanner
A wedge scanner pairs as a Bluetooth **keyboard** and types the barcode. This
file watches for bursts too fast to be human and routes the result. Burst state is
module-level `let`, never `state` — it is the last ~100ms of keyboard.
**Touch to:** change scan detection, timing, where scans are accepted, the
diagnostic log, or paired-mode focus.
**⚠ CHARACTER KEYS ARE NEVER `preventDefault`ed — ONLY THE TERMINATOR.** At the
moment a character arrives we don't yet know if the burst is a scan. Characters
land wherever they were going *and* are copied to the buffer; only the terminator
judges the burst, and a confirmed scan overwrites the target field **wholesale**,
cleaning up what the characters did on the way past. Do not optimise this into
swallowing keys early — it is the reason normal typing cannot break.
**⚠ OVERWRITE, NEVER APPEND** (the asset box is pre-filled).
**⚠ `e.repeat` is excluded** — a held key auto-repeats at machine speed.
**⚠ v67: TRUE MODIFIERS SKIP, EVERYTHING ELSE RESETS.** `SCAN_MODIFIER_KEYS` keys
pass through without ending the burst (a Shift keydown used to destroy a barcode
containing capitals). Any OTHER non-single-character key must still drop the
whole burst: skipping a key that did produce a character delivers a plausible
SHORT asset number, which is worse than no scan. Asymmetric on purpose.
**⚠⚠ v74: TWO TIMING CEILINGS, AND THE SECOND MUST EXCEED THE FIRST.**
`scanMaxGapMs()` judges whether the burst was fast enough; `scanEndMs()` decides
where one burst ENDS. `scanEndMs()` is DERIVED (`gap limit + SCAN_END_PAD_MS`,
floored at `SCAN_END_FLOOR_MS`) — it was a flat `SCAN_END_MS = 120` until v74 and
that silently capped every preset: above it a burst restarts on each character
and fails as "too short" instead of "too slow", so RAISING a preset made things
worse. Do not reintroduce a constant. Harness 08z/08z2/08z4, mutations M86/M87.
**⚠ v74: THE POISON WINDOW.** `_scanPoisonUntil` — after a burst is dropped by an
unreadable key, collection is refused until the keyboard is silent for a full
`scanEndMs()`, and the window SLIDES (each character re-arms it). Without it the
tail of an interrupted scan formed a plausible SHORT asset number and reached a
certificate. Armed on the unreadable-key path ONLY, never on the `_scanTarget()`
bail (which fires constantly during ordinary typing). Harness 08y–08y5,
mutations M83/M84/M88.
**⚠ v67: A REJECTED BURST MUST NOT BE SILENT.** `_scanVerdict()` returns numbers
and a reason, not a boolean, and `_scanLogBurst()` records rejections on the
settings test page — but ONLY there (`ctx.kind === 'test'`), or a human typing on
the entry screen fills the log. `_scanIntoTest()` must NOT write the log too.
**Coupling:** accepts scans in three targets only (`#f-asset`, `#sessions-search`,
`#scanner-test`) and bails everywhere else, including with any entry sheet open or
a locked job. Delivery is a targeted DOM write (rule 3). Bound once from boot.js
(rule 6). The settings PAGE is in render-settings.js; the post-scan asset
carry-forward is in session.js. `scanMaxGapMs()` resolves `state.scanSpeed`
against `SCAN_GAP_PRESETS` (config) fresh on every burst — an unknown preset must
fall back, never resolve to `undefined`.
`focusAssetForScan()` (v67, paired mode) is called by **`render()` AND
`refreshEntryAfterLog()`** in render-core.js, typeof-guarded at both. Both are
required: the second is what fixed "the scan after a PASS goes nowhere". It
routes through `_scanTarget()` so it inherits every bail-out, and it `select()`s
as well as focusing — the selection is what makes an *unrecognised* scan replace
rather than append.

### events.js (~490 ln) — focus-sensitive binding, per render
Direct binds for the four focus-sensitive fields only (`nf-client`, `nf-site`,
`f-location`, `f-type`), the three suggestion dropdowns, the two hold gestures
and the shared `attachHoldGesture()` helper behind them, the sheet drag guard,
the suggestion click swallow. Plus (v75, and NOT per-render) the keyboard-inset
publisher.
**Touch to:** change one of those four fields, their dropdowns, either hold
gesture, the drag guard, the click swallow or how sheets react to the on-screen
keyboard.
**⚠ v77: both holds go through `attachHoldGesture()`** — the quick-pick grid
(preset switcher) and `copy-last-btn` ("Log again ×N"). See cross-cutting rule 16
before adding a third; do not bind `ontouchstart` at a site.
**⚠ Suggestions commit on `pointerdown`, not `click`** (a click races the blur
teardown and iOS loses the tap), **and `armClickSwallow()` must stay** — a touch
tap still fires a ghost `click` afterwards that lands on whatever is underneath.
Don't reintroduce an `onclick` here and don't remove the swallow.
**⚠ The swallow disarms on the next `pointerdown` (v70.1)** and that ordering is
load-bearing: the document listener is capture-phase so it runs BEFORE the
button's own handler arms it. Arm from capture and the guard cancels itself.
**⚠ All three dropdowns paint through `paintSuggestionList()` (v70.1)** — identity
skip plus shrink hysteresis. `fromTyping` is passed only from `oninput`/`onfocus`;
picks, blur-hides and dispatch.js's quick-pick paint instantly.
**⚠ `initKeyboardInset()` / `applyKeyboardInset()` (v75) are the odd pair in this
file** — everything else here is per-render, these are once-at-boot and never
re-run. They bind BOTH `resize` and `scroll` on `window.visualViewport`: iOS
fires scroll, not resize, when it shifts the view to reveal a focused field, and
binding only resize leaves the sheet correctly sized in the wrong place. No
`visualViewport` → returns before binding, nothing is ever written, v74 CSS
stands. See cross-cutting rule 13 for the contract with styles.css.
**⚠ V87: `initSuggestionDismissGuards()` (once-at-boot)** closes the three lists
on a pointerdown OUTSIDE their wrap (capture, never preventDefault) and when the
visual viewport grows back past KB_MIN_INSET_PX (Android hides the keyboard
without a blur). A new dropdown joins `SUGGEST_WRAPS` or it won't close.
**Coupling:** called from `render()` and `refreshEntryAfterLog()`.
`initSheetDragGuard()`, `initSuggestionClickSwallow()`, `initKeyboardInset()`
and `initSuggestionDismissGuards()` are bound once from boot.js. `applyKeyboardInset()` is consumed entirely by
styles.css — no JS reads its output. `sheetDragMoved` is read by dispatch.js's preset picker. Both hold callbacks read
and write `state` and call `render()`. Everything else
is delegated in dispatch.js — these stay direct because focus/blur/pointer timing
can't be safely delegated.

### dispatch.js (~1100 ln) — delegated event handling
Three registries attached once to `#app` at boot: `ACTIONS` (click, ancestor-walk
by `data-action`/`data-arg`), `INPUT_ACTIONS` (`data-input-action`),
`CHANGE_ACTIONS` (`data-change-action`).
**Touch to:** add or route any delegated click / input / change handler.
**Coupling:** only the four focus-sensitive fields and the two hold gestures are
**not** here (events.js). Text-input actions must not `render()` on keystroke.
File inputs must clear `el.value` immediately or re-choosing the same file fires
nothing. `handleDelegatedClick` returns early when no ancestor carries
`data-action`, which is why plain `<a>` links work inside `#app`.
⚠ v69 (D4): the action call is wrapped — a throw inside any action (including the
`render()` it triggers) is caught here and recovered to the Sessions list. This is
the post-boot half of the v16.1 net, which covers the FIRST render only. Assert
this through `handleDelegatedClick`, never through `render()` directly.

### boot.js (~300 ln) — startup, RUNS ON LOAD, must load LAST
Service-worker registration and update banner, `bootIntegrityOK()`, the boot tail,
the crash fallback screens, the v69 one-time data repair call.
**Touch to:** change the startup sequence, the SW update banner or the integrity
guard. V99: `mapPinResume()` (session.js) runs before the first
`loadFormForCursor()`/`render()` — it may set the active job, view and cursor.
**Coupling:** the integrity guard verifies the critical cross-file functions
loaded before any storage write and skips `load()`/`render()`/`save()` if not —
this is the guard against the duplicate-`const` data-loss class (rule 1).
⚠ v70: the guard is ONE PROBE PER SCRIPT FILE, not a list of important
functions. Adding a script file means adding a probe — see "Adding a file".
⚠ v71: a data-only file gets a CONSTANT probe, not a `requiredFns` entry, and
the data.js probe must stay ABOVE the `state` check — data.js failing takes
state.js's initialiser with it, so checked the other way round the guard throws
(D1's mechanism) and the console blames the wrong file. Harness 09k/09l.
⚠ v68 (D1): `bootIntegrityOK()` CAN THROW — `typeof state` hits a TDZ binding
when config.js fails to parse. Its call site is wrapped and a throw counts as a
FAILED check. Never call it bare in an `if`; the throw escapes and the recovery
screen never paints (white screen). Two "Update needed" screens exist and read
almost identically — the guard's says "load completely", the v61.2 load() net
says "finish updating". Harness 02c depends on that wording to tell them apart.

⚠ **Two independent nets, not one.** Even if the guard were wrong, the load()
try/catch below no-ops `save()` and `render()` and paints its own screen. That
redundancy is deliberate — do not remove either on the grounds the other covers
it.
Boot tail order matters: error capture first, then delegation, drag guard, click
swallow, scanner, then `load()` → `applyTheme` → `loadFormForCursor`/`render` in a
try/catch, then `photoIndexLoad()` **after** the first paint. Every optional init
is `typeof`-guarded and wrapped (rule 6).
⚠ `_crashReportLink()` **deliberately duplicates** part of bugreport.js — these
screens appear when the app has failed to load, so they must not depend on
another file having parsed. Don't "DRY" this.

---

## Not code, but read the same way

- `styles.css` (~95KB, 3578 ln) — **has a section index as of v68.** Ordered by
  the release that added each block, NOT by screen, so one area can appear in
  several places. 49 banner lines carry the token `@@`.
  `grep -n '^/\* @@' styles.css` lists every section; `grep -n '^/\* @@ settings'`
  narrows; then `sed` the region. The index block at the top of the file lists
  all sections in file order.
  ⚠ Do NOT reorder the file to match the index — several rules depend on being
  overridden by a later block. The banners describe the order, they don't
  license changing it.
- `index.html` (~3KB) — the `<script>` chain. Small enough to read whole.
- `sw.js` (~3.5KB) — `CACHE_VERSION` + `ASSETS`. Read whole.
- `supabase.umd.js` — vendored supabase-js (MIT). NEVER read or grep it (218 KB,
  one minified line — it floods context). Exclude it: `grep --exclude=supabase.umd.js`.
- `supabase/schema.sql`, `supabase/isolation-test.sql` — server side (v79). Pasted
  into the Supabase SQL editor by hand; not loaded by the app. `schema.sql` is the
  whole server for a NEW project; `supabase/v92-fingerprint.sql` and
  `supabase/v93-archive.sql` are the paste-once changes for an existing one (they
  check themselves, F1–F3 and A1–A5). Harness 29e and 30i read them.
  ⚠ v93: `session_photo_counts` is a VIEW — it must stay `security_invoker`
  (isolation 8a–8c), or it counts every account's photos.
- `manifest.webmanifest` — icons, name, display mode.
