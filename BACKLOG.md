# PATGo — Standing backlog

Work agreed but not yet scheduled. Carried across releases; the handoff points
here rather than restating it. Delete an item when it ships.
(c) 2026 Peter Birchley. All rights reserved.

---

## Token efficiency (agreed in the V66 doc restructure)

### 1. Split session.js — STRUCTURAL RELEASE, ON ITS OWN
2,940 lines, the largest file in the app and the one most tasks have to open.
Candidate seams: retest reminders, the readings sheet lifecycle, the first-run
wizard, report-settings/signature capture. Each is already self-contained.
**Rules:** one file per release, no behaviour changes in the same release, byte-
identity check on every extracted body, no welcome modal. Highest remaining win,
highest risk — take it slowly.

### 2. Split render-core.js and render-settings.js — SAME PATTERN, AFTER (1)
2,170 and 1,675 lines. Natural seams: the modal/sheet block in render-core; the
About/Glossary/Contact help pages in render-settings. Do not start until the
session.js split has shipped and survived a release in the field.

### 3. Section index for styles.css
~97KB with no read strategy and no entry in `MAP.md`, so any CSS change risks a
large blind read. Add banner comments (`/* ==== entry screen ==== */`) at each
area boundary so `grep`+`sed` works on it the way it does on the JS files, then
give it a routing entry in `MAP.md`. Cheap, no behaviour risk — good filler
alongside a small release.

### 4. Split the data tables out of config.js
66KB described as "pure data", but the big tables (glossary groups, default item
types, fail reasons, descriptions, calculator tables) sit alongside the constants,
so looking up one tuning number drags the tables along. Proposed: `config.js`
keeps constants and factories; a new `data.js` (loaded immediately after) holds
the lists. ⚠ Watch the load-order constraint — `state.js` seeds from config
factories at load time.

### 5. A persistent smoke harness
Currently rebuilt from scratch every release and deleted at delivery, so each
release rediscovers the same stub gaps. Commit a `harness/` folder (excluded from
`sw.js` ASSETS and from `index.html`) with a real stub layer — `document`,
`localStorage`, `window`, `navigator`, IndexedDB — plus the load-order runner and
the standing assertions. Each release then *extends* it instead of recreating it.
See the note below on why this is the fix.

### 6. Documentation hygiene
- Prune old `PAThandoff_vNN.md` files from the project — only the latest is read,
  and older ones invite expensive wrong reads.
- Archive `REFACTOR_PLAN_v21.md` (complete) and `PATGo_V61_V62_Roadmap.md`
  (overtaken by events).

---

## On the smoke harness specifically

The recurring harness bugs are not mainly a matter of which model writes it. They
are a design problem: a disposable harness has no stub layer to inherit, so every
release re-derives `document`, `localStorage` and IndexedDB stubs from scratch and
rediscovers the same traps — top-level `const` not attaching to the vm context,
transactions resolving the wrong shape, test data that doesn't reach the code
path being tested.

**The durable fix is item 5: build it once, properly, and commit it.** A more
capable model would help write that first version well, and it is worth using one
for the initial build — but a bulletproof harness written once and thrown away
still leaves the next release starting from nothing. Persistence is what
compounds; model choice only affects the first pass.

When that release happens, the harness should ship with: the stub layer, the
load-order runner, the standing cross-release assertions (boot guard passes on a
healthy build and fails on a broken one; backup round-trip; the bugreport privacy
rule; instrument resolution never reads `state.testerMake`), and a documented
mutation-test step, since hollow assertions have shipped before.

---

## Product backlog (not token efficiency)

- Complete the `app.patgo.co.uk` custom-domain migration once all testers have
  confirmed JSON backups. ⚠ PWA data is origin-bound — never migrate first.
- Cold-user testing: phone handed over, three appliances, one certificate, no
  intervention. Needed before any documentation or tour rebuild.
- Tight-cropped favicon set for tab legibility (deferred from V58).
- `backupVersion` bump to 6 — reserved for a genuinely incompatible schema
  change. Not yet triggered.
