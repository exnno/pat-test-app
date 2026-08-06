# PATGo — Standing backlog

Work agreed but not yet scheduled. Carried across releases; the handoff points
here rather than restating it. Delete an item when it ships.
(c) 2026 Peter Birchley. All rights reserved.

---

## Next release

### V68 — candidate: in-app keypad (only if the scanner shortcut isn't enough)
V67 shipped a ⌨ button that lifts PATGo's own `inputmode="none"` suppression on
the asset box. It cannot raise the iOS keyboard while a scanner is connected —
iOS hides the software keyboard system-wide whenever a hardware keyboard is
paired, and no web API overrides that. Platform limit, not a defect.

The free answer, and the one to try FIRST: the NETUM C750 pops the iOS keyboard
on a **double-click of its trigger button**, and there is a command barcode in
the manual that does the same. Works in every app. If that covers Peter's
typing (notes, "other" fail reasons, descriptions), this item dies here.

If it doesn't, the only thing fully under our control is a **custom in-app
keypad** — a tappable QWERTY sheet writing into the focused field. Real build,
own release, do not bolt it onto anything else.
⚠ Carry into that session:
- `.bulk-sheet` is the reliable modal pattern (MAP rule 11 — no `prompt()`).
- A sheet containing inputs must NOT `render()` while open (MAP rule 3).
- The fields that actually need it are notes and the fail "other" box, not the
  asset box — scope to those before building a general keyboard.

### D1 is the other standing candidate
Fold it into whatever V68 turns out to be, unless that release is large. It was
labelled a V67 candidate and deliberately left out: V67's scope was locked to
scanner work and D1 is a boot-path change.

---

## Defects found by the harness (open)

### D1. Boot integrity guard throws instead of returning false — WHITE SCREEN
**Still open after V67** — deliberately deferred, not forgotten. It was labelled
"Fix in V67" in the harness `known()` list; V67's scope was locked to scanner
work and this is a boot-path change, so it did not go in. The `known()` note
should be re-labelled when it does ship.
If `config.js` is missing or stale, `state.js` throws while evaluating
`let state = {…}`, leaving `state` permanently in the temporal dead zone.
`bootIntegrityOK()` then throws on its own `typeof state === 'undefined'` line —
`typeof` is safe on an *undeclared* identifier, but `state` here is declared and
uninitialised. `if (!bootIntegrityOK())` at `boot.js:155` is unwrapped, so the
throw escapes and the "Update needed" recovery screen never paints. Blank screen,
no message, no crash-report link. The V61 failure class through a different door.

Fix, one line:
```js
let _ok = false;
try { _ok = bootIntegrityOK(); } catch (e) { _ok = false; }
if (!_ok) { …recovery screen… }
```
⚠ The comment in `boot.js` currently asserts that `typeof` never throws here.
Correct it in the same edit or the trap gets reintroduced.

### D2. `titleCase()` capitalises after an apostrophe
`utils.js` uses `/\b\w/g`, and an apostrophe is a word boundary, so a location
typed as "Bob's Office" is stored and printed as "Bob'S Office". Reaches
certificates and CSV exports. ⚠ The behaviour is *correct* for names like
O'Brien, so the fix must skip only a trailing single letter (the possessive),
not all apostrophes.

### D3. Captured error text is copied verbatim into the bug email
If a runtime error message interpolates a client or site name, it reaches the
support email despite the privacy rule. Low likelihood, real. Scrub or truncate.

### D4. A post-boot render throw is not covered by the v16.1 net
The net wraps the *first* render at startup. A view renderer that throws later,
on navigation, propagates to the caller. Whether that reaches the user depends on
the caller — the delegated click handler may absorb it. **Confirm on-device
before treating this as a defect.**

---

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

### 1. Split session.js — STRUCTURAL RELEASE, ON ITS OWN
2,972 lines, the largest file and the one most tasks have to open. Candidate
seams: retest reminders, the readings sheet lifecycle, the first-run wizard,
report-settings/signature capture. Each is already self-contained.
**Rules:** one file per release, no behaviour changes in the same release,
byte-identity check on every extracted body, no welcome modal. Highest remaining
win, highest risk — take it slowly. The harness now covers the session flows
(`tests/06`), which makes this materially safer than it was.

### 2. Split render-core.js and render-settings.js — SAME PATTERN, AFTER (1)
2,213 and 1,688 lines. Natural seams: the modal/sheet block in render-core; the
About/Glossary/Contact help pages in render-settings. Do not start until the
session.js split has shipped and survived a release in the field.

### 3. Section index for styles.css
~97KB with no read strategy and no entry in `MAP.md`, so any CSS change risks a
large blind read. Add banner comments (`/* ==== entry screen ==== */`) at each
area boundary so `grep`+`sed` works on it the way it does on the JS files, then
give it a routing entry in `MAP.md`. Cheap, no behaviour risk, but it edits a
cached asset so it needs a cache bump — good filler alongside a small release.

### 4. Split the data tables out of config.js
66KB described as "pure data", but the big tables (glossary groups, default item
types, fail reasons, descriptions, calculator tables) sit alongside the constants,
so looking up one tuning number drags the tables along. Proposed: `config.js`
keeps constants and factories; a new `data.js` (loaded immediately after) holds
the lists. ⚠ Watch the load-order constraint — `state.js` seeds from config
factories at load time.

### ~~5. A persistent smoke harness~~ — SHIPPED
`harness/` — stub layer, load-order runner, fixtures, 345 standing assertions
across 7 test files, and a 20-mutation runner. Each release now **extends** it
rather than recreating it. See `harness/README.md`.

### 6. Documentation hygiene — PETER'S ACTION
Remove from the Claude project:
- `REFACTOR_PLAN_v21.md` (complete, ~11KB)
- `PATGo_V61_V62_Roadmap.md` (overtaken; everything still live from it is
  consolidated below, so nothing is lost by deleting it)

Old `PAThandoff_vNN.md` files are already pruned — only v66 remains. Keep it that
way: only the latest is ever read, and older ones invite expensive wrong reads.

---

## Feature backlog

Consolidated here from the V66 handoff roadmap and the V61/V62 roadmap, so it
survives those documents being archived.

| Item | Status |
|---|---|
| Home-screen shortcuts | Liked ("big yes"), never scheduled. Android/desktop only — revisit if an Android tester appears |
| "Log this item ×N" | Liked in principle, shelved on UI clutter. Proposed resolution: long-press on the existing Copy-last button, so no new control competes for space |
| Weekly/batch PDF export | Parked pending a direct tester ask — good idea, but wanted from testers before committing time |
| Camera barcode scanning | Conditional on the HID path actually being used. V67 made it work on real hardware, so the evidence starts accumulating now — decide after a few real jobs, not before |
| Per-instrument "in service" toggle | Only if overdue calibration nags on a retired instrument prove annoying in practice |
| Scan into other fields (location, item type) | Raised implicitly by V67. Currently a scan is refused when any other text field has focus (the deliberate V65 "known limit"). Only worth revisiting if Peter starts labelling locations |

### Discussed and NOT proceeding
Kept so these don't get re-raised and re-argued from scratch.

| Idea | Why not |
|---|---|
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
