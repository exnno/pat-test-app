# PATGo — Code Map (V73)

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

6. **Optional subsystems fail soft.** `photos.js`, `scanner.js`, `bugreport.js`
   are `typeof`-guarded and try/catch-wrapped at their boot call sites. A missing
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

---

## Load order (index.html) — 29 first-party files

`config` → `data` → `state` → `utils` → `storage` → `clients` → `instruments` → `sqp`
→ `multipick` → `feedback` → `bugreport` → `photos` → `csv` → `backup`
→ `session` → `settings-actions` → `setup` → `tour` → `onboarding` → `report`
→ `pdfpreview` → `render-core` → `render-review` → `render-settings` → `render-help`
→ `scanner` → `events` → `dispatch` → `boot`

⚠ `data` → `state` is the one adjacency in this chain that is NOT a readability
choice. `state.js` seeds `itemTypes`/`failReasons` from `DEFAULT_ITEM_TYPES` /
`DEFAULT_FAIL_REASONS` in its top-level initialiser, which runs at load, so
`data.js` must precede it. Harness 09h/09i, mutation M61.

`sw.js` ASSETS lists **31** `.js` entries: these 29 plus the 2 lazy-loaded jsPDF
files (precached, not `<script>` tags — report.js injects them on demand).
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

---

## Not shipped

### harness/ — the committed test harness
Stub layer, load-order runner, fixtures, standing assertions, mutation runner.
NOT in `index.html`, NOT in `sw.js` ASSETS — test 01c fails if either changes.
**Touch to:** validate a release (`node harness/run.js`, `node harness/mutate.js`),
or add this release's assertions and mutations. Never delete from `tests/`.
**Coupling:** derives load order from `index.html`; source-guards `report.js`,
`csv.js` and the flat-field writers (rule 7); asserts rules 1, 8, 9, 11.
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

### utils.js (~250 ln) — pure helpers, no state access
Formatting, escaping, colour, asset-number splitting/padding, long-press
detector, boundary validators for item readings.
**Touch to:** add a stateless helper.
**Coupling:** none by design — nothing here reads `state`.
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

### storage.js (~755 ln) — persistence boundary
The key-shortening codec (`SESSION_KEY_MAP`, `ITEM_KEY_MAP`), `load`/`save` and
the per-area save paths, the shared boundary validators
(`normaliseReportSettings`, `normaliseArchivedStats`), storage stats.
**Touch to:** change how data is stored, loaded or migrated.
**⚠ Data-integrity zone — backup round-trip after every edit.**
⚠⚠ v69: `_encodedSessionCache` reuses a session's encoding when the items ARRAY
REFERENCE and `_sessionSig()` are unchanged — and the sig covers item COUNT, not
item CONTENTS. Anything that edits strings INSIDE existing item objects must call
`_invalidateSessionEncoding(sess)` or the stale encoding is written back and the
edit silently un-happens on reload. Only bites NON-ACTIVE sessions (the active
one always re-encodes fresh), which is why it is easy to miss in a test.
⚠ v69 (D5): `runApostropheRepair()` / `apostropheRepairUndoCount()` /
`undoApostropheRepair()` — one-time rewrite of stored locations, item types and
preset entries, latched on `REPAIR_DONE_KEY`, undo diff in `REPAIR_UNDO_KEY`.
Called from boot.js after `load()`, before the first `render()`.
**Coupling:** ⚠ ordering inside `load()`/`save()` matters and is harness-asserted
— `loadInstruments()` runs **after** the legacy tester keys (migration source);
`saveInstruments()` runs **before** writing them (a prune re-syncs the mirror).
Unlisted fields pass through the codec untouched, which is why additive fields
need no map entry. Rules 9 and 10 live here.

### clients.js (~427 ln) — clients & sites
CRUD, lookups, the site snapshot compose/split used by CSV, assign/move flows.
Orphan sites (empty clientId) are legal.
**Touch to:** change how clients/sites are stored or managed.
**Coupling:** `load()`/`save()` in storage.js call in. `splitSiteSnapshot` is
csv.js's dependency. Delete/rename confirms route through feedback.js sheets.

### instruments.js (~490 ln) — test instruments & calibration
The instrument list, which is active, and **which instrument a given job's
certificate names**. Owns the three-tier resolution (`instrumentForSession`:
stamped id → frozen snapshot → active), calibration status, the mirror sync
helpers, CRUD, and its own settings/editor markup.
**Touch to:** anything about instruments, calibration status, or which instrument
a certificate names.
**Coupling:** ⚠ Rule 7. `report.js`, `csv.js` and the UI must all resolve through
`instrumentForSession()`. `deleteInstrument()` freezes `session.instrumentSnapshot`
onto referencing sessions **before** removing (rule 5).
`restoreInstrumentsFromBackup()` is shared by backup.js and setup.js and depends
on the caller having restored the flat fields first.
Renders its own screens here rather than in render-settings — deliberate, and the
editor screen is intentionally absent from `SETTINGS_CATEGORIES`.

### sqp.js (~286 ln) — Smart Quick Pick
Location→item-type learning, scoring, ordering, history persistence.
**Touch to:** change how the quick-pick row adapts to location.
**Coupling:** tuning constants in config.js. Toasts via feedback.js; confirms in
dispatch.js.

### multipick.js (~127 ln) — Multi Pick
Slot config, the batch-log fire path, settings save.
**Touch to:** change the multi-pick sheet or its settings.
**Coupling:** computes asset numbers via `nextAssetNo()` and clears the scan
carry-forward flags before `loadFormForCursor()` (rule 4).

### feedback.js (~405 ln) — toast, dialogs, haptic / flash / sound
`showToast`, the shared `.bulk-sheet` dialog builders (`openConfirmSheet`,
`openNameSheet`, `openInfoSheet`), feedback channels.
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

### photos.js (~625 ln) — photo evidence store
**The app's only IndexedDB code.** Record store, count index, image processing,
object-URL tracking, the separate photo export/import bundle.
**Touch to:** anything about photo storage, processing, or the photo export file.
**Coupling:** rule 2 — `render()` reads `photoCountForItem()` off the in-memory
index only. Rule 5 — four removal paths in session.js cascade here. Rule 6 —
everything fails soft; nothing here may break the fail flow. `sessionId` is
denormalised onto each record so deleting a job sweeps in one indexed lookup.
Photos are **not** in the JSON backup (separate file) — backup.js carries only an
informational count.

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
**Coupling:** restores through the SAME validators as `load()`
(`normaliseReportSettings`, `normaliseArchivedStats`, `normaliseItemReadings`,
`normaliseSessionRetest`, `restoreInstrumentsFromBackup`) — never write a second
validator. ⚠ Instruments restore **after** the flat fields. Boolean flags restore
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

### report.js (~700 ln) — PDF certificates
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
emit-only-if-used rule. Every `addImage` is try/caught — a bad image never blocks
a report.

### pdfpreview.js (~135 ln) — multi-page preview rasteriser
Lazy-loads vendored PDF.js, renders each page to a stacked canvas, DPR-capped,
sequential for iOS memory.
**Touch to:** change preview rasterising, the lazy load, or the PDF.js version.
**Coupling:** throws on parse failure so report.js falls back to its iframe view.

### session.js (~2160 ln) — sessions and items
Session/item lifecycle, form and cursor, validation, suggestions,
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
- Append paths (`saveItem`, `copyLastResult`, `seedDemoSession`) stamp `ts`
  unconditionally; **edit branches must never stamp** — `ts` means "first logged".
- `state.sessions` is reassigned in exactly four places: load, restore, prune,
  delete. Any new removal path needs the same hooks.
- `captureWizardStep()` is the last legacy writer of the instrument flat mirror
  and calls `adoptMirrorIntoInstruments()` (rule 7).
**Note:** `state.view` is set directly from ~14 places, so per-render concerns
(scroll reset) live in `render()` via `_lastRenderedView`, not in `setView`.

### settings-actions.js (~620 ln) — the write half of the Settings screens — NEW v70
Per-page saves, Report Settings (text, logo, filename tokens), signature capture
(draw and upload), CSV column ordering, Export/Import Setup UI handlers, the
editable list settings (item types, fail reasons, descriptions) and the
appearance/feedback toggles. Job notes, certificate-number override and report
templates live here too — saved from the same screens, same shape.
**Touch to:** change what a Settings screen SAVES. To change how one is drawn,
go to render-settings.js; to change a default, config.js.
**Coupling:** `saveReportSettingsForm()` reads the DOM, so any re-render must
call `captureReportTextInputs()` first or unsaved text is lost (dispatch.js
depends on this). `setTheme` delegates to `applyTheme` (session.js). Extracted
from session.js in v70, byte identical.

### onboarding.js (~195 ln) — first-run wizard — NEW v70
The wizard state machine (step capture, paging, fresh/import fork, theme pick,
demo toggle, finish, skip), `restartOnboarding()`, and `seedDemoSession()`.
Holds `WIZARD_LAST_STEP`.
**Touch to:** change the first-run flow. The wizard's MARKUP is render-core.js.
**Coupling:** ⚠ `captureWizardStep()` is the last legacy writer of the
instrument flat mirror and must keep calling `adoptMirrorIntoInstruments()`
(rule 7). `onboardSetupImport()` delegates to setup.js; the final step can hand
off to tour.js. Extracted from session.js in v70, byte identical.

### render-core.js (~1620 ln) — dispatcher + the logging screens
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

### render-review.js (~690 ln) — review & manage screens — NEW v72
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
Boot probe: `renderOverview` in `requiredFns`.

### render-settings.js (~1377 ln) — settings screens that own a setting
The two-level Settings hub, its search, every `renderSettings*` sub-page with a
write handler behind it, `renderSettingsSubHeader()`, the earth-resistance
calculator, and `renderPhotoBackupSection()` (which paints inside the Backup
page).
**Touch to:** change any Settings page that changes a setting.
**Coupling:** category structure and search aliases live in **data.js** (moved
from config.js in v71), not here. Scanner test-log markup lives in **scanner.js**
(it repaints without a render). Bug sheet logic lives in **bugreport.js**.
Instrument settings live in **instruments.js**. The stats footer reads
`computeAppStats()` (session.js) and returns `''` when null.
⚠ v73: About, Glossary, Contact, the bug-sheet markup and the cloud stubs left
for **render-help.js**, and those pages still call `renderSettingsSubHeader()`
from here. The About changelog is no longer in this file.

### render-help.js (~408 ln) — help, about & cloud-prep — NEW v73
About (+ the rolling 3-version changelog), Glossary (page + the
`GLOSSARY_GROUPS` data array), Contact, `renderBugSheet()` markup, and the three
cloud-prep stub pages revealed by a long-press on the About title.
**Touch to:** roll the About changelog, add or reword a glossary term, change the
Contact page or the bug sheet's markup, or work on the cloud stubs.
**Coupling:** reached only through `render()`'s dispatcher — NOT through the
dispatch.js ACTIONS table, so 09d's generic guard is blind to these; 09r–09w
cover them instead. Calls `renderSettingsSubHeader()` back across the seam into
render-settings.js. `renderBugSheet()` is markup only — its logic and state are
in **bugreport.js**, and it returns `''` unless `state.bugSheetOpen`. Declares
ONE top-level binding, `GLOSSARY_GROUPS`, read only inside a function body, so
its load position is free.
Boot probe: `renderSettingsAbout` in `requiredFns`.

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

### events.js (~400 ln) — focus-sensitive binding, per render
Direct binds for the four focus-sensitive fields only (`nf-client`, `nf-site`,
`f-location`, `f-type`), the three suggestion dropdowns, the quick-pick long-press
gesture, the sheet drag guard, the suggestion click swallow.
**Touch to:** change one of those four fields, their dropdowns, the long-press, the
drag guard or the click swallow.
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
**Coupling:** called from `render()` and `refreshEntryAfterLog()`.
`initSheetDragGuard()` and `initSuggestionClickSwallow()` are bound once from
boot.js. `sheetDragMoved` is read by dispatch.js's preset picker. Everything else
is delegated in dispatch.js — these stay direct because focus/blur/pointer timing
can't be safely delegated.

### dispatch.js (~1100 ln) — delegated event handling
Three registries attached once to `#app` at boot: `ACTIONS` (click, ancestor-walk
by `data-action`/`data-arg`), `INPUT_ACTIONS` (`data-input-action`),
`CHANGE_ACTIONS` (`data-change-action`).
**Touch to:** add or route any delegated click / input / change handler.
**Coupling:** only the four focus-sensitive fields and the quick-pick long-press
are **not** here (events.js). Text-input actions must not `render()` on keystroke.
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
guard.
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
- `manifest.webmanifest` — icons, name, display mode.
