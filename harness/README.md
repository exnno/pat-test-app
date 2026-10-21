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
node harness/mutate.js --full M07   # the slow way: every failing group listed
```

Since the V108 harness amendment `mutate.js` takes two shortcuts that can only
stop a run sooner, never change its verdict: the mutation's own test file (named
in its `why`) runs alone first, and otherwise the suite stops after the first
failing file (`PATGO_BAIL=1`). A mutation nothing catches still runs everything.

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
| `sheets.js` | V110. Finds every bottom sheet in the app source, for group 47. |
| `sheet-register.js` | V110. The sheets with no `.sheet-scroll`, each with the reason nothing in it grows. |
| `tests/` | The standing assertions. |

---

## Extending it — the one rule that matters

**Add to `tests/`, never delete from it.** A release's own assertions become the
next release's regression cover. That is the entire point.

Adding coverage for a release:

1. Add `tests/NN-thing.js` (or a group to an existing file). `run.js` finds it.
2. **Add a matching mutation to `mutate.js`.** An assertion nobody has tried to
   break is an assertion nobody knows works. **End its `why` with the group that
   catches it**, e.g. `"(47b)"` — the runner runs that one file first, and 01k
   fails any mutation without one. Its `from` must occur exactly once in the
   file — since V130 the runner ABORTS one that doesn't (DEFENCE 3) and 01l
   fails it in the normal run, so you find out in 30 seconds, not overnight.
   A mutation aimed at `harness/mutate.js` itself starts its `from` with "\n",
   or its own definition counts as a second copy.
3. Run both. Green suite *and* zero survivors, or it isn't done.
4. **Zero ABORTS too.** An abort means the mutation's anchor text no longer
   exists, so nothing was broken and nothing was proved — it is not a pass, and
   the runner reports it separately so it cannot be read as one. Two mutations
   are anchored on text that rolls every release and will abort every time if
   nobody re-points them: **M66** (`APP_VERSION`) and **M82** (the oldest About
   changelog entry). Re-point them as part of the release, not afterwards.
   Release mutations that only need "this release's value" anchor on a stable
   prefix instead (M772 the cache key, M836 the What's new version — V114), and
   the release's own group pins the value. A behaviour test that happens to
   involve the version reads it live (49j, V114), so a roll never breaks it.
5. **A new bottom sheet:** mark the part that can grow `.sheet-scroll` (and what
   sits below it `.sheet-pin`), or add it to `sheet-register.js` with the reason
   nothing in it grows. Group 47 fails until one of the two is true.
6. **A new read of the cloud tables** (`sessions`, `records`, `photos`,
   `session_photo_counts`): give it `.eq('user_id', uid)` (an upsert:
   `onConflict: 'user_id,id'`). Group 48a fails until it does (V111, MAP rule 18).
   A test that it reads only this account's rows seeds a second account's rows in
   48's fake, which applies no rules — the widest read V113 allows (the database release, renumbered from V112).
7. **Anything about an icon (V115):** build the expected text from the app's own
   helper — `app.fn('icon')('camera') + ' 1'` — never paste an SVG or an emoji.
   ⚠ When a visible glyph changes, a NEGATIVE check on the old glyph
   (`excludes(html, '☁')`) goes on passing with nothing tested: V115 found one
   (28a) and re-aimed it at the icon's class (`ic-cloud`). Search the tests for
   the old character before calling a swap done. 52c sweeps every screen.

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
- **Asserting on the wrong thing entirely.** V111's 48d first read
  `'ZZMATEPH1' in sent` — `sent` was the helper FUNCTION, not its result, so the
  check could never fail. Its own mutation (M792) survived everything but the
  source guard, which is how it was found. The same release's 48e first let the
  sync that follows an answer re-read the right row and quietly repair a wrong
  answer (M789 survived the outcome check): stamp the row behind the cursor.

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

The repo-root `README.md` used to be a stale copy of THIS file — same document in
two places, already drifted by one release (V76's abort paragraph landed in one of
them only). V77 split them: the root README describes the app, its stack and the
release process; this one describes the harness. They are no longer duplicates and
should not be re-synced.

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
  V130 added DEFENCE 3: an anchor found MORE than once aborts too (`anchorCount`).
  Under a mutation run, 01l counts anchors on the clean tree the runner names in
  `PATGO_PRISTINE` — counted on the mutated copy, every mutation would break its
  own anchor and 01l would "catch" all of them.
- **A hung group used to hang everything (fixed V82).** An async group that
  awaits a promise that never settles gave no report and no exit, and the
  mutation runner waited on it for ever (M132, present since V79). `assert.js`
  now fails any group still running after 30s, by name, and `mutate.js` kills a
  suite after 180s and scores it caught. The full run is ~225 × 6s ≈ 25 min —
  in a tool with a per-command time limit, run it in slices with the name or
  file filter.
- **A registered input starts EMPTY (V112).** The stub registers ids from
  render()'s markup but does not read `value=` or `checked=`. A test whose
  assertion depends on what a box shows must fill it the way the browser's paint
  would (group 49's `paint()` / `paintWizard()`), and prove separately that the
  real render() does the read. Two shapes caught while building 49: flipping a
  STAND-IN element through the change delegation leaves the real box unchanged,
  so a later DOM read overrides the handler — flip the registered element itself;
  and a test that reads a missing saved blob as `null` fails by a group throw,
  not by its assertion (M811) — default to `{}` so the assertion is what fails.

- **The practice job swaps `state` (V134).** tour.js `_tutDraw()` puts the
  practice's values into the real `state` object for one synchronous draw and
  puts them back in `finally`. A test that reads `state` INSIDE a draw sees the
  practice; outside, the phone. Group 72b compares a whole practice run with
  `realOf()`, which leaves out `photoMgr.gen` / `jobMgr.gen` — every `setView`
  bumps them on the way out (Quit is a setView), so they are navigation, not the
  practice. `stepOn()` advances without the 650 ms pause a real log waits.
  The stub DOM has no tree: a test that taps the practice gives the registered
  `#tut-practice` its own `querySelector` and the target its own `contains`.
  V134.1 (group 73): the photo step shows only when its button is found, which
  the stub never does, so it passes itself on a render — 73a puts the practice
  on it directly (`toPhoto`). Free-practice taps go through `tutTap` with a
  stand-in target whose `closest()` answers the action (`freeTap`). 73's
  `stepOn` runs a look step's `run` as Next does (the asset step types the
  location); 72's runs do-steps only, as before.
  V135 (group 74): the Settings tutorials. `when` steps (Backup's Export
  everything and snapshots) pass themselves in the stub for the same reason —
  74e checks their targets are on the drawn page instead. The stub page can't
  find a node by an id set as a property: 74e catches the practice's file box
  as it is appended to `<body>`. `_tutTarget`'s row / section framing is tested
  by standing in a `#tut-practice` whose `querySelector` returns a node with
  its own `closest()`. 74c wraps the pages' real save / add / export handlers
  with counters before the runs — every one must stay at zero.
  V136 (group 75): the cloud tutorials. The harness HAS a cloud (the stub host
  maps to the test environment, status 'signed-out') — so 75c first replaces
  `cloudAvailable` with `() => false`, a copy with no cloud, or a missing
  stand-in would pass unnoticed. 75b seeds real `SYNC_HELD_KEY` / `SYNC_STATE_KEY`
  records ('ZZ Real Held Job') that must never reach a practice screen. 75a
  draws the "real" screen in a second app with `_tut` set and
  `TUT_CLOUD_STUBS` assigned onto its global — the practice's data, the real
  render function. 75's `stepOn` runs every step's `run` (look steps too —
  the history sheet's Next closes it), as Next and Skip do.
  V137 (group 76): Show me how. The guard (V112) reads the page's inputs, and
  the stub page keeps no `value="…"` from the markup — 76's `paint` fills every
  guarded input from state (as 49's `paint`), or Certificate Content's
  certificate-number boxes read empty and every tap "asks". The Sync page
  draws through the cloud lock at `render()` (the harness has no access code),
  so 76 checks Sync's own `renderCloudSync()` markup. 74a's second app now
  sets `_tut` too: the link is never drawn inside a tutorial, the one line in
  which a practice page differs from the real one (76a pins it).
  V138 (group 77): Show me how starts on the page. 77b checks the from-page
  start against a real walk from Tutorials (open, step through the `group` /
  `page` steps, compare `_tut.st.view` + `settingsCategory`) rather than a
  hard-coded page, so a walk that leaves the practice somewhere subtly
  different fails. 77d's run-through stops at `done` rather than counting: the
  Backup tutorial's `when` steps are skipped in the harness (no Export
  everything / snapshots block), as 74d allows.
  V139 (group 78): password sign-in. 78b–78d drive the REAL supabase.umd.js
  against a fake fetch (as 15f): the password grant, the `PUT /auth/v1/user`.
  The library adds empty PKCE fields (`code_challenge: null`) to that PUT on
  its own, so 78d checks that only the password carries a VALUE, not the key
  list. "The password is kept nowhere" (`kept()`) is state + every storage key
  + a backup, searched for a canary — a test of where it isn't, so M1349 puts
  it in state to prove the search looks. The stub has no form submission:
  78e fires `submit` at #app directly; the Go key → click → submit path was
  seen in Chromium (Playwright, not committed).
  V140 (group 79): Google sign-in. Three traps, all met building it:
  1. A fake access token must be real base64url — a 5-character signature
     (length ≡ 1 mod 4) makes the library refuse it ("JWT not in base64url
     format"), which reads exactly like the hand-over being dropped.
  2. Build the fake server's request record from the raw header object, not
     `new Headers(init.headers)`: if that throws, fetch rejects, the library
     retries as if the signal dropped, and the test times out with no clue.
  3. The real library takes longer than a few ms (locks, the session check):
     wait with `until(cond)`, never a fixed `tick(15)`. An "ignored" check
     instead asserts `busy` stayed false AT ONCE (an accepted hand-over sets
     it synchronously) and then waits the full SETTLE — a short wait alone
     would pass on broken code.
  `installWindow` records each `window.open` so 79b/79d can prove the window
  opened INSIDE the tap (checked before any await). The landing page's own
  script is run in a vm of its own (`landing()`), its timers held until its
  first message has been read. The real pop-up → landing page → hand-over
  round trip was run in Chromium against a stand-in Supabase (Playwright, not
  committed): 26/26, both themes.
  V141 (group 80): About → Privacy from the privacy policy. One trap: an
  element fetched by id from a drawn page is a bare stub — no attributes, no
  dataset — so a tap on it passes whatever the HTML says (a `data-action`
  written on the link would never be seen). 80a rebuilds the link from the
  DRAWN tag's own attributes and taps that; M1386 (a data-action on the link)
  is the proof. The website's privacy.html is not in the repo and nothing
  checks it — 80a pins the app's summary only.
  V142 (group 81): paying. Two things new here. (1) SERVER code is tested:
  81d `import()`s `supabase/functions/_shared/billing.js` (plain ES module,
  no Deno at import time) and runs the three handlers against a pretend
  Stripe and database (`serverDeps`) — `Request` / `Response` / WebCrypto are
  Node's own. The real Deno runtime is only exercised on Supabase. (2) The
  Stripe window is the V140 window: `installWindow` records `openedWhile`
  (`state.billing.pending` at the moment of `window.open`) — '' proves the
  window opened before the app started waiting, i.e. first in the tap.
  `_planOnVisible` returns early unless `document.visibilityState` is
  'visible' — the stub leaves it undefined, so set it on `app.doc`. The SQL's
  real behaviour (copies, comped, trial, old subscriptions, isolation 18a–18f)
  was proved against a local Postgres 16 stand-in, not here; 81g pins the text.
  V143 (group 82): enforcement. (1) A function declaration is a writable
  global in the vm, so 82c SPIES on a step by reassigning it
  (`_syncPhotosHalf = function () { __ph++; … }`) — and proves the spy counts by
  seeing it rise once the pause lifts (an always-0 counter proves nothing).
  (2) sync.js's `_syncSafetyRepaint` redraws the Jobs list whenever the cloud
  picture CHANGES — so a test of "the list redraws by itself" must settle that
  picture first (82c sends once and fails before the real test), or the safety
  repaint does the job and the line under test survives (M1475 did, until then).
  (3) The SQL was proved on a local Postgres 16 stand-in (an upgraded V142
  project and a fresh schema.sql; isolation 82 PASS + 7 INCONCLUSIVE for want of
  photos; ten broken copies each caught). It caught a real defect before ship:
  the photo-file policy called `default_org` / `can_upload`, both closed to
  `authenticated`, which refuses EVERY photo upload — hence `can_upload_files()`.

---

## What is deliberately not covered

- **The PDF path.** jsPDF is injected on demand and is deliberately absent from
  the stub environment. `report.js` is covered by source guards only.
- **Real rendering.** `innerHTML` is stored as a string, not parsed. `render()`
  is tested for "does it throw" and "did it produce markup".
- **The practice job's box (V134).** Where `#tut-ring` lands, its glide, the
  card's end of the screen and the sheet wait need real layout. Group 72g pins
  the CSS and the source; the run itself was checked in Chromium at 390×844
  and 375×667, light and dark (a Playwright script, not committed).
- **Touch interaction.** Stubbed DOM cannot reproduce pointer-then-click
  sequencing. Long-press, Quick Pick timing and scroll-drag need a real device.
- **Service worker behaviour.** Cache-first update semantics need a real browser.
- **The database rules (V113).** A Postgres policy cannot run here. Group 50
  pins the TEXT of the SQL decisions (and that schema.sql carries every V113
  line); whether the rules WORK is proved by the SQL files' own checks (O1–O9)
  and `supabase/isolation-test.sql` (9a–16b), run in the Supabase SQL editor.
  At V113 both were run against a local Postgres 16 with a stand-in for
  Supabase's `auth` and `storage` schemas (roles anon/authenticated, `auth.uid()`
  from `request.jwt.claims`, `storage.objects` + `storage.foldername`), and
  twelve broken copies of the migration were each caught by them. The stand-in
  is not committed: it is a test aid, not the real Supabase, and a pass there
  does not replace Peter's run on the test project.
  V133 did the same for `supabase/v133-cleanup.sql` (self-checks C1–C7) and
  isolation 17a–17g, with a pg_cron stand-in (a `cron.job` table and
  `cron.schedule`), a seeded scenario (reported / unreported / older phones, a
  teammate held, a photo whose file is still there) run in report and clear
  mode, and ten broken copies each caught. Group 71g pins the SQL's text.
