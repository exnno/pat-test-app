# PATGo — Standing backlog

Work agreed but not yet scheduled. Carried across releases; the handoff points
here rather than restating it. Delete an item when it ships.
(c) 2026 Peter Birchley. All rights reserved.

---

## Next release

### V69 — candidate: split session.js
The highest remaining token win and the highest-risk item on this list. It is a
STRUCTURAL release: one file per release, no behaviour changes in the same
release, byte-identity check on every extracted body, no welcome modal. See
"Token efficiency" item 1 below for the seams.

The V68 styles.css index proves the pattern that makes this safe to deliver:
insert-only edits, then strip the additions back out and byte-compare against
the original. Anything that cannot be proved that way is not a structural
change and does not belong in a structural release.

### ~~V68 — in-app keypad~~ — DEAD, do not revive
The NETUM C750's double-click-trigger shortcut covers Peter's typing in the
field, which was the stated condition for this item existing at all. Confirmed
on real hardware, August 2026. The ⌨ button it would have replaced was itself
removed in V68 for the same reason: it could not work while a scanner was
connected, and the "Scanner paired" toggle already covers the disconnected case.

---

## Defects found by the harness (open)

### ~~D1. Boot integrity guard throws instead of returning false~~ — FIXED V68
Call site wrapped; a throw now counts as a failed check. ⚠ The trap that made
this survive review is recorded in `MAP.md` (boot.js entry) and in the code
comment: `typeof` is safe on an UNDECLARED identifier but NOT on a declared,
uninitialised one. Harness 02c, mutations M34/M35.

### ~~D2. `titleCase()` capitalises after an apostrophe~~ — FIXED V68
Only a single letter following an apostrophe is now skipped, so O'Brien still
capitalises. Harness 06e2, mutations M36/M37.

### ~~D3. Captured error text copied verbatim into the bug email~~ — FIXED V68
`_scrubCustomerData()` redacts known customer strings at report-build time and
FAILS CLOSED. Harness 05f/05g/05h, mutations M38/M39.

### D4. A post-boot render throw is not covered by the v16.1 net — STILL OPEN
The net wraps the *first* render at startup. A view renderer that throws later,
on navigation, propagates to the caller. Whether that reaches the user depends on
the caller — the delegated click handler may absorb it. **Confirm on-device
before treating this as a defect.** The only remaining `known()` entry.

---

## Standing lesson from V68 — a safety mechanism must be tested for its FAILURE mode

Three separate things in V68 looked correct and were not, all in the same shape:
a guard that produced the right-looking outcome via the wrong mechanism.

1. `bootIntegrityOK()` returned false correctly in every case anyone had tried —
   the one case that mattered made it throw instead.
2. The first D3 scrub redacted correctly whenever it had a term list. With no
   list it passed the raw text through, which is the case it existed for.
3. The first D1 test asserted a recovery screen appeared. It did — but the
   *wrong* recovery screen, painted by a different net downstream, so a mutation
   inverting the guard survived.

The rule: **for anything whose job is to fail safely, the test must drive the
failure, not the success.** Asserting a guard works when nothing is wrong says
nothing at all. And when two mechanisms can produce the same visible outcome,
the assertion has to name which one produced it.

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

### ~~3. Section index for styles.css~~ — SHIPPED V68
49 `@@` banner comments plus a header index block.
`grep -n '^/\* @@' styles.css` lists every section. Insert-only: proved
comment-only by stripping the banners back out and byte-comparing against the
original. ⚠ The file was NOT reordered to match the index and must not be —
several rules depend on being overridden by a later block.

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

Old `PAThandoff_vNN.md` files are already pruned — only v68 should remain. Keep
it that way: only the latest is ever read, and older ones invite expensive wrong
reads. **Remove `PAThandoff_v67.md` from the project.**

---

## Feature backlog

Consolidated here from the V66 handoff roadmap and the V61/V62 roadmap, so it
survives those documents being archived.

| Item | Status |
|---|---|
| Home-screen shortcuts | Liked ("big yes"), never scheduled. Android/desktop only — revisit if an Android tester appears |
| "Log this item ×N" | Liked in principle, shelved on UI clutter. Proposed resolution: long-press on the existing Copy-last button, so no new control competes for space |
| Weekly/batch PDF export | Parked pending a direct tester ask — good idea, but wanted from testers before committing time |
| Per-instrument "in service" toggle | Only if overdue calibration nags on a retired instrument prove annoying in practice |
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
