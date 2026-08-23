# PATGo test harness

Not shipped. Not referenced by `index.html`, not listed in `sw.js` ASSETS.
GitHub Pages will serve these files, which is harmless — the app source is
already public — but nothing in the app loads them.

(c) 2026 Peter Birchley. All rights reserved.

---

## Running it

```
node harness/run.js            # every standing test
node harness/run.js 04 06      # only matching test files
node harness/mutate.js         # prove the assertions aren't hollow
node harness/mutate.js M07     # one mutation
```

`run.js` exits non-zero on any failure. `mutate.js` exits non-zero if any
mutation survives **or** any mutation fails to apply.

---

## Why this folder exists

Before it, the smoke harness was rebuilt from scratch every release and deleted
at delivery. Every release therefore re-derived the same `document`,
`localStorage` and IndexedDB stubs and rediscovered the same traps, and every
release's assertions — 177 of them in V66 — were thrown away.

Persistence is the fix. Model capability only affects the first pass; a
bulletproof harness written once and binned still leaves the next release
starting from nothing.

---

## Files

| File | What it is |
|---|---|
| `stubs.js` | The browser environment. DOM, localStorage, IndexedDB, navigator, Blob/File/FileReader, caches, URL. |
| `load.js` | Loads the app into one vm context in the real load order. Derives that order from `index.html`. |
| `assert.js` | Assertions, grouping, the report, and `known()`. |
| `fixture.js` | Standard app states, built through real app functions. |
| `run.js` | Entry point. Picks up `tests/*.js` automatically. |
| `mutate.js` | Deliberately breaks the app and checks the suite goes red. |
| `tests/` | The standing assertions. |

---

## Extending it — the one rule that matters

**Add to `tests/`, never delete from it.** A release's own assertions become the
next release's regression cover. That is the entire point.

Adding coverage for a release:

1. Add `tests/NN-thing.js` (or a group to an existing file). `run.js` finds it.
2. **Add a matching mutation to `mutate.js`.** An assertion nobody has tried to
   break is an assertion nobody knows works.
3. Run both. Green suite *and* zero survivors, or it isn't done.
4. **Zero ABORTS too.** An abort means the mutation's anchor text no longer
   exists, so nothing was broken and nothing was proved — it is not a pass, and
   the runner reports it separately so it cannot be read as one. Two mutations
   are anchored on text that rolls every release and will abort every time if
   nobody re-points them: **M66** (`APP_VERSION`) and **M82** (the oldest About
   changelog entry). Re-point them as part of the release, not afterwards.

### Before you write an assertion, ask whether it could pass on broken code

V65 shipped two assertions that tested nothing. V66 shipped four. Every one
looked green. The specific ways they were hollow:

- **The right result via the wrong mechanism.** A deleted-instrument test passed
  because deletion also blanked the mirror, so the check it claimed to make
  never ran. Construct the state directly rather than reaching it through a
  side effect.
- **Testing a path that cannot execute.** `buildReportDoc` needs jsPDF and can't
  run headlessly, so reintroducing the exact V66 defect passed 151/151. Paths
  like that get **source guards** (`04h`, `04i`, `04j`) — not a promise to test
  them properly later.
- **Never reaching the code at all.** Test data that doesn't hit the branch.

### If a test fails, suspect the harness first

Most failures during a build are harness defects, not app bugs. On the first run
of this suite, six of the eight failures were mine: `adoptMirrorIntoInstruments()`
updates in place rather than creating a second record, `deleteInstrument()` goes
through a confirm sheet, `applySetupBundle()` reconciles via
`restoreInstrumentsFromBackup()` rather than the adopt helper, and the CSV column
flag is `visible`, not `enabled`. Inspect the actual output before "fixing"
correct code.

### v77 — the stub fires `on<type>` handlers, and why that mattered

`StubElement.dispatchEvent` used to invoke only `addEventListener`
registrations. Plenty of this app binds by PROPERTY instead
(`el.ontouchstart = …`), and for those the only way to reach a handler was to
call it by hand — which is the V67 "listener was never bound" blind spot in
disguise: a handler that is written but never attached passes a hand-call and
fails on the phone. `dispatchEvent` now fires the property handler too, after the
listeners, the way a real element does. Do not narrow it back.

The V77 timer capture (`tests/13-…`) hands out **1-based** ids. The first version
returned 0 for the first timer, and `attachHoldGesture` guards its cancel with
`if (pressTimer)` — so every drift-abort silently did nothing and a correct app
went red. No browser returns 0 from `setTimeout`; a stub that does is modelling
something impossible and inventing a bug to match. That was the sixth time in
this suite a red assertion turned out to be the test's fault.

⚠ **This file and the repo-root `README.md` are near-duplicates and have already
drifted** — V76's abort paragraph landed in one of them only. Edit both, or split
them properly in a release that has documentation as its concern.

---

## `known()` — real defects, recorded not hidden

A bug that's understood but not being fixed this release goes in `known()`. It
prints under KNOWN DEFECTS, doesn't fail the run, and reports **"APPEARS FIXED,
promote to a hard assertion"** once repaired. Deleting the assertion hides a
bug; leaving it red trains everyone to ignore the suite.

---

## Traps already solved here — don't re-derive them

- **Top-level `const`/`let` do not attach to the vm context.** `ctx.state` is
  undefined even though the code works. `load.js` bridges them; `app.val(name)`
  reads them. Top-level `function` declarations *do* attach — `app.fn(name)`.
- **`state` is reassigned by `load()`.** Capturing it before `load()` gives a
  stale object. Use `app.state()`.
- **IndexedDB callbacks must fire asynchronously.** App code assigns
  `onsuccess` *after* calling `get()`. Firing synchronously means it never runs.
- **`group()` must be awaited when its body is async.** An un-awaited async
  group prints a tick having run zero assertions. `report()` now fails any empty
  group outright.
- **`innerHTML` registers element ids.** The whole `.bulk-sheet` pattern writes
  markup then calls `getElementById(...).addEventListener(...)`. Without
  registration that returns null, the wiring silently doesn't happen, and every
  sheet-driven flow is untestable while reporting green.
- **Mutation scoring.** V66's runner matched the substring `"0 failed"`, so
  `"10 failed"` scored as a pass; and a mutation that failed to apply also
  scored as a pass. Both are fixed permanently in `mutate.js` — the anchor is
  checked before every run, and the summary is matched as a whole phrase.

---

## What is deliberately not covered

- **The PDF path.** jsPDF is injected on demand and is deliberately absent from
  the stub environment. `report.js` is covered by source guards only.
- **Real rendering.** `innerHTML` is stored as a string, not parsed. `render()`
  is tested for "does it throw" and "did it produce markup".
- **Touch interaction.** Stubbed DOM cannot reproduce pointer-then-click
  sequencing. Long-press, Quick Pick timing and scroll-drag need a real device.
- **Service worker behaviour.** Cache-first update semantics need a real browser.
