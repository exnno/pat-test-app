# PATGo — Standing backlog

Work agreed but not yet scheduled. Carried across releases; the handoff points
here rather than restating it. Delete an item when it ships.
(c) 2026 Peter Birchley. All rights reserved.

---

## Next release

### ~~Log again ×N + two hold-gesture fixes~~ — SHIPPED IN V77
The "Log this item ×N" item below is now built, as a hold on Copy-last exactly as
the proposed resolution said. Plus the two reported defects: the quick-pick grid
never carried the selection suppression that the About-title hold has had inline
since v43, and the "⚙ Edit presets" deep link left no return marker so Back
climbed into Settings. Both hold gestures now share `attachHoldGesture()`; harness
13n refuses a third hand-rolled one. See MAP rule 16.

⚠ Found and fixed in passing: `multiPickFire` still gated timestamp CAPTURE on
`state.timestampsEnabled`. v61 changed that rule — the setting gates exposure only
— and Multi Pick was missed at the time, so six releases of Multi Pick items
carry no `ts` for anyone with the setting off. Not recoverable retrospectively.
Harness 13k asserts both batch paths with the setting explicitly OFF, which is the
case nothing had ever driven.

### Documentation hygiene — the two READMEs — NOT SCHEDULED
`README.md` (repo root) and `harness/README.md` are near-duplicate copies of the
same harness document, and they had already drifted: V76's "zero aborts" paragraph
went into one of them only. V77 re-synced them and added the same note to both,
which is a patch on the symptom.

The root README should describe the APP — stack, deploy process, release process
— which is what the skill points at it for; the harness one should describe the
harness. Splitting them is a documentation release's job, not a feature release's,
and it wants doing before the next person edits one and not the other. Small.

### ~~Sheet-scroller audit + fix — the V75 spill-over~~ — SHIPPED IN V76
The audit ran across all 30 sheet render sites and the fix followed in the same
release. Found: three sheets whose body grows from USER DATA with no scroller
(fail-reason picker, Multi Pick, bulk Change type), one half-done (preset
switcher, list marked but the Edit button under it unpinned), three
caller-supplied copy sheets in `feedback.js`, and one genuine defect — the
first-run wizard's `.wizard-body` hand-rolled the scroller and omitted
`min-height: 0`, so it never scrolled and the shell clipped its buttons, from
v33 until V76.

Root cause recorded because it outlives the instances: there were THREE scroller
implementations (`.sheet-scroll`, `.bug-sheet-body`, `.wizard-body`), so a sheet
could opt out of the rule by accident. V76 collapsed them to one and added
`.sheet-pin` for the sibling-below half. See MAP.md rule 14.

Deliberately NOT changed, and still true: the Photos sheet carries `.sheet-scroll`
on the SHELL rather than a body child — it works only because that rule sits later
in the stylesheet than the shell's `overflow: hidden`, and its header scrolls away
with the content. Correct by coincidence. Photo count is capped so it cannot grow
unboundedly; tidy it if that sheet is ever touched for another reason.

### General sheet-markup guard — the part of the audit not built

**Not scheduled.** Harness 12d catches any CSS rule that hand-rolls a scroller
without `min-height: 0`, which covers sheets nobody has written yet. What it does
NOT catch is a new sheet whose growing body is never marked at all — there is no
rule to inspect, because the mistake is an absence.

The shape would be a source guard that parses every `.fail-sheet`/`.bulk-sheet`
block in the render files and asserts each contains either a `.sheet-scroll` child
or a body that cannot grow. That needs the markup parsed rather than grepped.

⚠ Why this was left out of V76 rather than bolted on: "can this body grow" is a
judgement about DATA, not a property visible in the markup — a `<p>` of fixed copy
and a `<p>` of caller-supplied text look identical. A guard that guesses wrong in
the permissive direction goes green while proving nothing, which is the exact
hollow-assertion shape the harness exists to prevent. It wants its own spec round,
starting with how the test decides "can grow" without being told per site.

### ~~V75 — bottom sheets versus the on-screen keyboard~~ — SHIPPED
Sheets now measure `window.visualViewport` and publish four custom properties to
`<html>` which the sheet CSS reads, so no sheet has to be found or hooked.
`.bug-sheet` and `.wizard-sheet` had to opt in explicitly (they override the
shell's caps) — and the wizard's `min-height: 72vh` FLOOR was the sharper trap of
the two. Keyboard-down removes the properties rather than zeroing them, which is
what preserves the `var()` fallbacks. `focusInSheet()` closes the `preventScroll`
gap the scanner had documented since V67. Body-scroll lock deliberately NOT done
(v12.1 ban). Welcome modal scroller folded in. See FEATURES.md and
PAThandoff_v75.md. Harness 11a–11m, mutations M89–M96.

### ~~V74 — scanner timing and the poison window~~ — SHIPPED
Both scanner items from the PATGo Scan findings file. The poison window
(`_scanPoisonUntil`) stops the tail of an interrupted burst being read as a scan
of its own; the end-of-burst boundary became derived (`scanEndMs()`) instead of a
flat `SCAN_END_MS = 120`, which had been silently capping every preset. Presets
40/60/90 → 60/90/150. See FEATURES.md and PAThandoff_v74.md.

### The structural queue is CLOSED as of V73
V70 session.js ✓, V71 config.js ✓, V72 render-core.js ✓, V73 render-settings.js ✓.
Peter's V70 instruction — every structural release before any new feature — is
now discharged. Features from here.

⚠ One honest note for whoever picks this up: `session.js` is now the largest file
in the app at ~2,160 lines, larger than anything that was split. It was NOT
scheduled, deliberately — Peter's call at V73 was to close the queue and move to
features. Raise it again only if a session.js change becomes painful in
practice, and never fold it into a feature release.

### ~~V73 — split render-settings.js~~ — SHIPPED
369 lines / 21 KB out to `render-help.js`: About (+ the rolling changelog),
Glossary (+ `GLOSSARY_GROUPS`), Contact, the bug-sheet markup and the three
cloud-prep stubs. `render-settings.js` 1,746 → 1,377 lines, 103 KB → 81 KB
(−21%). Byte identical, proved by reassembly (SHA-256 match against V72).
⚠ The seam split the Settings screens by whether they OWN a setting: everything
in render-help.js is read-only reference with no write handler behind it. That
is the line to keep if either file is ever split again.
⚠ Coupling created, one-way and invisible from either file alone: every page in
render-help.js calls `renderSettingsSubHeader()`, which stayed in
render-settings.js. Mutation M79 covers the silent-duplicate hazard.
⚠ The About changelog moved. It is in **render-help.js** now, and README's
release-process line was corrected to say so.
Harness 09r–09w, mutations M76–M82. M66 and M73 had to be re-pointed — both were
anchored on lines this release moved, and both correctly ABORTED rather than
passing.

### ~~V72 — split render-core.js~~ — SHIPPED
658 lines / 36 KB out to `render-review.js` (Overview + its body/refresh
helpers, Edit Session, Retest Reminders, Reports hub, shared photo markup).
`render-core.js` 2,278 → 1,620 lines, 125 KB → 88 KB (−29%). Byte identical,
proved by reassembly (SHA-256 match against the shipped V71 file).
⚠ `render()` was NOT edited — that was the whole point of picking this seam, and
MAP rule 2 survives untouched. The one edit to render-core.js outside the
extraction was its banner comment.
⚠ The coupling this created runs BOTH ways: `renderEntry()` stayed in
render-core.js and calls the two photo helpers that left. Harness 09m–09q,
mutations M69–M75.

### ~~V71 — split the data tables out of config.js~~ — SHIPPED
285 lines / 24 KB out to `data.js`, byte identical, proved by reassembly.
`config.js` 1,086 → 831 lines, 71 KB → 49 KB. Two seams named in the old plan
were deliberately NOT taken: `makeDefaultReportSettings()` and
`makeStarterReportTemplates()` stayed, because config keeps its factories.
⚠ The load-order constraint turned out to be the whole risk of the release:
`data.js` must sit between `config.js` and `state.js`. Harness 09g–09l,
mutations M61–M68.

### ~~V70 — split session.js~~ — SHIPPED
807 lines out (27%): `settings-actions.js` (604) and `onboarding.js` (193),
plus `dismissWelcome()` to render-core.js. Byte-identity proved by reassembly.
`session.js` 2,972 → 2,162 lines.

### ~~V68 — in-app keypad~~ — DEAD, do not revive
The NETUM C750's double-click-trigger shortcut covers Peter's typing in the
field, which was the stated condition for this item existing at all. Confirmed
on real hardware, August 2026. The ⌨ button it would have replaced was itself
removed in V68 for the same reason: it could not work while a scanner was
connected, and the "Scanner paired" toggle already covers the disconnected case.

---

## Defects found by the harness — ALL CLOSED as of V69

### ~~D1. Boot integrity guard throws instead of returning false~~ — FIXED V68
Call site wrapped; a throw now counts as a failed check. ⚠ The trap that made
this survive review is recorded in `MAP.md` (boot.js entry) and in the code
comment: `typeof` is safe on an UNDECLARED identifier but NOT on a declared,
uninitialised one. Harness 02c, mutations M34/M35.

### ~~D2. `titleCase()` capitalises after an apostrophe~~ — FIXED V68.1
V68's fix matched only the ASCII apostrophe (U+0027) and so did nothing on a
real phone, where iOS smart punctuation types U+2019. V68.1 accepts U+0027,
U+2019 and U+02BC, and preserves whichever the user typed.
Harness 06e2 (loops all three), mutations M36/M37/M40/M41.
⚠ Pre-V68.1 stored values are NOT repaired — see D5.

### ~~D3. Captured error text copied verbatim into the bug email~~ — FIXED V68
`_scrubCustomerData()` redacts known customer strings at report-build time and
FAILS CLOSED. Harness 05f/05g/05h, mutations M38/M39.

### ~~D4. A post-boot render throw is not covered by the v16.1 net~~ — FIXED V69
Closed by reading rather than by an on-device repro, which was never obtainable:
reproducing it needs a render bug you do not already have. `handleDelegatedClick`
called the action bare, so a throw escaped. It never showed as a blank screen —
`render()` assigns `#app.innerHTML` in ONE statement at the end, so a throw while
building leaves the old screen up and the tap just does nothing. The damage was
the mismatch: the action had already set `state.view`, so state and screen
disagreed and the next tap ran the wrong screen's actions. Now caught and
recovered to the Sessions list. Harness 07i, mutations M50/M51.
⚠ The `known()` list is now EMPTY. Keep it that way, or find out why not.

### ~~D5. Locations and item types saved before V68.1 are still mangled~~ — FIXED V69
One-time repair pass over item locations, item types and preset entries, run at
boot after `load()` and latched on `REPAIR_DONE_KEY`. `repairApostropheCase()`
is guarded two ways: the word before the apostrophe must not be all-caps
(`BOB'S OFFICE` is deliberate and survives), and the suffix must be a single
letter (`O'Brien`, `Sant'Angelo` untouched). Undo is a diff of changed strings
in `REPAIR_UNDO_KEY`, surfaced as a button on the Backup page.
Harness 06e3–06e6, mutations M42–M49.

⚠ A real file backup could NOT be taken before the rewrite: `downloadBackup()`
fires a synthetic anchor click, which needs a user gesture and on iOS opens the
share sheet — nothing silent is possible at boot. The on-device undo diff plus
tripping the existing 7-day backup reminder is the substitute. **Any future
data-rewrite release faces the same constraint — do not spec an automatic file
export, it cannot be built.**

---

## Standing lesson from V69 — the shared cache that made the repair a no-op

The V69 repair edits strings INSIDE existing item objects. `serialiseSessions()`
reuses a cached encoding when the items array reference and `_sessionSig()` are
unchanged — and the sig covers item COUNT, not item CONTENTS. All three checks
passed, so the repaired data would have been written back from the stale
encoding and the entire release would have silently un-happened on reload.

Two things generalise:

> **An in-place edit to nested data does not invalidate a cache keyed on the
> container.** Before editing anything below the level a cache is keyed at, find
> out what is memoising it.

And the harder half — the first test of this passed against the broken code,
because the repaired job was the ACTIVE one, and the active session always
re-encodes fresh. The immune case looked like the normal case:

> **When a mechanism has a fast path and a cached path, a test that only
> exercises the fast path proves nothing about the cached one.** Name which path
> the fixture is on. At boot the repair walks every job while at most one is
> active, so old jobs — the cached path — are the real case.

A third, from the same run: `StubElement` had no `nodeType`, and
`handleDelegatedClick` bails on `el.nodeType === 1`. Every delegated-click test
written against a constructed element returned before reaching the action and
passed in both directions. Fixed in `stubs.js`. This is the third instance of
the "path that cannot execute headlessly" shape — check for it by mutation, not
by reading.

## Standing lesson from V68 — test the CHARACTER THE DEVICE SENDS, and the failure mode

V68 shipped a `titleCase()` fix for the apostrophe bug with 421 green assertions
and a mutation suite behind it. It did not work on a single iPhone. iOS smart
punctuation types U+2019 (’); the fix matched only U+0027 ('). Every test was a
JavaScript string literal in an ASCII source file, so every test used the one
character the device never produces. **The tests and the app agreed with each
other and both were wrong about reality.**

The rule, and it is stronger than "drive the real path":

> **Where input comes from a device, the test must use the bytes the device
> actually sends — not the bytes that are convenient to type in a source file.**

Applies beyond apostrophes: smart quotes (“ ”), en/em dashes inserted by
autocorrect, non-breaking spaces pasted from other apps, and the scanner's own
character set. If a value can arrive from a keyboard, a paste or a scanner,
at least one assertion must use the real-world encoding of it.

The second half of the V68 lesson still stands, and the two are the same shape —
a check that agrees with itself while missing the real case:

1. `bootIntegrityOK()` returned false correctly in every case anyone tried —
   the one case that mattered made it throw instead.
2. The first D3 scrub redacted correctly whenever it had a term list. With no
   list it passed the raw text through, which is the case it existed for.
3. The first D1 test asserted a recovery screen appeared. It did — but the
   *wrong* one, painted by a different net, so an inverting mutation survived.

> **For anything whose job is to fail safely, the test must drive the FAILURE,
> not the success.** And when two mechanisms can produce the same visible
> outcome, the assertion has to name which one produced it.

## Standing lesson from V67 — hardware features need hardware

V65's scanner support was specced, built, validated and shipped without a device
ever touching it, and it did not work at all. The harness had no keydown coverage
whatsoever, so nothing went red. The failure was invisible from the outside — a
rejected burst and an unpaired scanner look identical — which is why it presented
as three unrelated bugs and took a release to diagnose.

Two rules out of it, both already applied:
1. **A mechanism that can reject must be able to say why.** Any future
   silent-discard path (timing, validation, a guard that bails) needs a
   diagnostic surface before it ships, not after a user reports it.
2. **Do not ship a hardware-dependent feature as "done" without the hardware.**
   Ship it flagged as unvalidated, and say so in the handoff.

---

## Token efficiency (agreed in the V66 doc restructure)

### ~~1. Split session.js~~ — SHIPPED V70
See the V70 entry above for the method, which is the template for items 2 and 4.
Two seams the original plan named were NOT used and are still available if
session.js needs splitting again: retest reminders (~185 ln) and the readings
sheet lifecycle (~160 ln). Both are genuinely session logic and coupled to
sorting/filtering, which is why the settings/onboarding tail went first instead.

### ~~2. Split render-core.js and render-settings.js~~ — SHIPPED V72 / V73
render-core.js: 2,278 → 1,620 lines (V72). `const app` and the `render()`
dispatcher stayed put and render() was not edited at all, which is what made a
658-line move safe in one release.
render-settings.js: 1,746 → 1,377 lines (V73), the help screens out to
render-help.js. One file per release; no behaviour change folded in alongside.
The whole token-efficiency splitting programme is complete.

### ~~3. Section index for styles.css~~ — SHIPPED V68
49 `@@` banner comments plus a header index block.
`grep -n '^/\* @@' styles.css` lists every section. Insert-only: proved
comment-only by stripping the banners back out and byte-comparing against the
original. ⚠ The file was NOT reordered to match the index and must not be —
several rules depend on being overridden by a later block.

### ~~4. Split the data tables out of config.js~~ — SHIPPED V71
See the V71 entry above. Two corrections to what this item used to say, kept
because both were wrong in ways that would have cost time:
- It listed "glossary groups" among config.js's big tables. `GLOSSARY_GROUPS`
  has always lived in `render-settings.js` — it is part of the V73 split, not
  this one.
- The load-order warning named the wrong dependency. `state.js` does not seed
  from config's FACTORIES at load; it seeds `itemTypes`/`failReasons` from the
  default LISTS, which is exactly what moved. That is what made the ordering
  load-bearing rather than cosmetic.

### ~~5. A persistent smoke harness~~ — SHIPPED
`harness/` — stub layer, load-order runner, fixtures, 345 standing assertions
across 7 test files, and a 20-mutation runner. Each release now **extends** it
rather than recreating it. See `harness/README.md`.

### ~~6. Documentation hygiene~~ — DONE
`REFACTOR_PLAN_v21.md`, `PATGo_V61_V62_Roadmap.md` and `PAThandoff_v67.md` are
all out of the project.

Old `PAThandoff_vNN.md` files are already pruned — only the latest should remain.
Keep it that way: only the latest is ever read, and older ones invite expensive
wrong reads. **Remove `PAThandoff_v70.md` from the project once V71 is deployed.**

---

## Feature backlog

Consolidated here from the V66 handoff roadmap and the V61/V62 roadmap, so it
survives those documents being archived.

| Item | Status |
|---|---|
| Home-screen shortcuts | Liked ("big yes"), never scheduled. Android/desktop only — revisit if an Android tester appears |
| ~~"Log this item ×N"~~ | **SHIPPED V77.** Built exactly as the proposed resolution said — a hold on Copy-last, no new control. Counts +2/+3/+5/+10 or a custom number capped at 20 |
| Weekly/batch PDF export | Parked pending a direct tester ask — good idea, but wanted from testers before committing time |
| Per-instrument "in service" toggle | Only if overdue calibration nags on a retired instrument prove annoying in practice |
| ~~Sheet-scroller audit~~ | **SHIPPED V76.** The general sheet-markup guard, the part deliberately not built, is still open above |
| Scan into other fields (location, item type) | Raised implicitly by V67. Currently a scan is refused when any other text field has focus (the deliberate V65 "known limit"). Only worth revisiting if Peter starts labelling locations |

### Discussed and NOT proceeding
Kept so these don't get re-raised and re-argued from scratch.

| Idea | Why not |
|---|---|
| Camera barcode scanning | **Decided against, V68.** Holding the camera open to decode barcodes is continuous processing on a device already running a full day in the field, and the battery cost is real, not theoretical. The HID scanner path works on real hardware and costs the phone nothing. Revisit only if a tester without a scanner asks for it directly |
| Site-level default presets | Overlaps what Smart Quick Pick already does. Auto-apply can silently change buttons on a one-off visit to a familiar site |
| Client-facing report permalinks | Sending a file is simpler and matches what people expect from a certificate |
| Cross-device history / sync | No local equivalent is possible — there is no "other device" for a single-phone PWA. Cloud-only |

Revisit any of these only if tester feedback, a repeated request, or Cloud
starting changes the calculus — don't rebuild the reasoning from nothing.

---

## Product backlog (not features, not token efficiency)

- Complete the `app.patgo.co.uk` custom-domain migration once all testers have
  confirmed JSON backups. ⚠ PWA data is origin-bound — never migrate first.
- Cold-user testing: phone handed over, three appliances, one certificate, no
  intervention. Needed before any documentation or tour rebuild.
- Tight-cropped favicon set for tab legibility (deferred from V58).
- `backupVersion` bump to 6 — reserved for a genuinely incompatible schema
  change. Not yet triggered.
