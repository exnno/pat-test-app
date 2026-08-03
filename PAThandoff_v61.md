# PATGo — Handoff V61

**Version:** V61 · cache **`pat-v61`** · `backupVersion` **5** (UNCHANGED)
**Type:** Feature release — cross-session asset history and per-job testing time.
Two features, one concern: **derived, read-only views over data you already have.**
**Welcome modal:** ROLLS — `pat:v61welcome`. About changelog rolled to
V61 / V60 / V59 (V58 dropped).
**New files:** none. First-party scripts stay at **21**; the `sw.js` `ASSETS` list
and the `index.html` `<script>` chain are byte-identical to V60.
**Date:** August 2026

---

## Scope — and why two features is one concern this time

Peter's rule is one concern per release, and V60 bent it and produced a hotfix, so
this needs justifying rather than glossing.

Asset history and testing time are **both read-only derived views over data
already stored**. Neither adds a user-editable field. Neither adds a storage key.
Asset history writes nothing at all; testing time's only write-side change is
populating an *existing* field more often. That is the same shape as V59's stats
counter, and it is a coherent release.

**Barcode HID support was deliberately split out** (spec answer 1B) and is not in
this release. It is an input-layer change landing in the fragile iOS focus/keyboard
area, it is the one thing the stubbed-DOM harness genuinely cannot test — a wedge
scanner types at ~200 characters a second and then sends an Enter, and no harness
reproduces that — and it can only be validated by someone holding real hardware.
It gets its own deploy and its own test cycle.

---

## Decisions locked (by spec Q number)

| Q | Decision |
|---|---|
| 1 | **B** — V61 = asset history + testing time; barcode HID split to its own release |
| 2 | **A** — bottom sheet with `.sheet-scroll`, opened from the Sessions search |
| 3 | **A** — offered only when the query matches an **asset number** in 2+ jobs |
| 4 | **A** — exact match, case-insensitive, trimmed; `001` ≠ `1` (consistent with V60 decision 8A) |
| 5 | **C** — date · job · result · location · type · readings (when present) · notes |
| 6 | **A** (Peter unsure; Claude called it) — no repeat-asset chip on the entry screen this release |
| 7 | **A** — capture always; the Item Timestamps setting gates exposure only |
| 8 | **A** — the testing-time display is NOT gated by that setting |
| 9 | **A** — multi-day spans labelled, not timed |
| 10 | **Peter's variant** — CSV stays on the toggle, PDF is opt-in, Session settings always |
| 11 | **B** — PDF testing time OFF by default |

---

## 1. Cross-session asset history

### What already existed, and what was actually missing

`filteredSessions()` has matched typed text against every item's `assetNo`
(and location, item type and notes) across every session since V10. The search was
never the gap. The gap was **presentation**: a match opened its own job, so an
asset tested in three jobs meant opening three jobs and piecing the history
together by hand.

### How it's reached

Search the Sessions screen. If what you typed is an asset number found in **two or
more different jobs**, a card appears between the match count and the list:

> 🕘 **Asset 001** — Tested in 3 jobs, see the full history · **View →**

Tap it and a bottom sheet opens with every past test, newest job first. Each row
shows the date, the job, a PASS/FAIL chip, the location, the item type, the
readings and the notes. Tapping a row closes the sheet and opens that job **at
that exact item**.

### The matching rule, and why it is narrow on purpose

Three things it deliberately is **not**:

- **Not a substring match.** Typing `1` must not claim to be the history of asset
  `1024`.
- **Not zero-insensitive.** `001` and `1` stay different assets, exactly as
  `findDuplicateAssetIndex` has treated them since V60 decision 8A. The label on
  the appliance is its identity — if you typed the zeros, you meant them.
- **Not the same match as the search itself.** `filteredSessions()` also matches
  location, item type and notes. Offering "history for kettle" would be
  meaningless: a kettle is a hundred different appliances, not one. **Only asset
  numbers offer a history.**

Match is exact text, case-insensitive, trimmed. `assetHistoryCandidate()` runs on
every keystroke of the search box, so it stays a single cheap pass.

### Why this sheet is allowed to re-render (the V60.1 rule does not apply)

V60.1 established that once the bug sheet is open, nothing inside it calls
`render()`. That rule exists because **the bug sheet contains a textarea** — a tap
inside it tore down a focused input and dropped the keyboard.

The asset-history sheet is **read-only. No inputs, no textarea, nothing
focusable.** There is no caret and no keyboard for a re-render to lose, so
`openAssetHistory` / `closeAssetHistory` calling `render()` is correct and safe.
The harness asserts the sheet markup contains no `<input>` or `<textarea>`, so if
anyone ever adds a field here that assertion fires and this reasoning gets
revisited rather than silently invalidated.

### Limits

- Capped at **60 rows** (`ASSET_HISTORY_MAX_ROWS`); the sheet says when it has
  trimmed and reports the true total.
- A deleted job disappears from history — it is a live read over
  `state.sessions`, not an archive.

---

## 2. Testing time

### Where it shows

| Where | Behaviour |
|---|---|
| **Session settings** | **Always**, whenever it can be computed. Not gated on any setting (Q8A). |
| **PDF certificate** | Opt-in. Report settings → What to include → Testing time. **OFF by default.** |
| **CSV Time column** | Unchanged — still gated by the Item Timestamps setting. |

Off by default on the PDF because a certificate is client-facing, and "this job
took 3h 12m" tells a customer how fast you worked. Adding that to everyone's
existing certificate without asking would be a silent change to their output.

### How it's computed

**Earliest to latest `ts` across every item that has one** — not first array
element to last. This is not defensive over-engineering; it is correct in three
real cases where indexing `[0]` and `[n-1]` is wrong:

- items can be edited and re-ordered, so array position is not chronology;
- a CSV import brings in items with no `ts` at all, which must be skipped rather
  than treated as time zero;
- jobs straddling this release have some stamped items and some bare ones.

Unparseable `ts` values (a hand-edited backup) are skipped rather than allowed to
poison the span.

**Fewer than two timestamped items → no figure, and the line is omitted
entirely.** Same omit-don't-print-zero contract as `computeAppStats()` in V59.

### The multi-day rule

A job reopened two days later has a raw elapsed time of ~26 hours, which is a
worse answer than no answer. Past one calendar day it reads **"spread across N
days"**.

**N is days *worked*, not calendar span.** A job logged on the 10th and the 12th
says **2 days**, not 3 — nothing was logged on the 11th, so claiming three would
overstate the work. This was checked against real output during the build rather
than assumed; the harness asserts both the right answer and the wrong one.

### Honest labelling

The screen says *"From the first item logged to the last. It includes any breaks,
so it is not time on tools."* A long lunch inflates the figure and the app says so
rather than letting the number imply a precision it doesn't have.

---

## 3. ⚠ THE DATA-LAYER CHANGE — read this one properly

**`item.ts` is now stamped on every item's first log, unconditionally.**

Before V61, the Item Timestamps setting gated **both capture and display**, and
the code documented an explicit off-path guarantee: with the setting off, no `ts`
was ever written and the stored item shape was byte-for-byte what it had been
before timestamps existed.

**That guarantee is now deliberately gone.** The roadmap asked for this to be
documented plainly at the point of the change rather than left to look like it
slipped through quietly, so the full note lives in `config.js` beside the
constants, is repeated at both stamping sites in `session.js`, and the old
`setTimestamps` comment describing the previous behaviour has been rewritten
because it now describes behaviour the app no longer has.

**The setting now gates exposure only** — the CSV Time column and the per-item
time line in the Overview. Both of those still read `state.timestampsEnabled` and
are untouched.

**Why:** a derived figure nobody can see unless they found and enabled an
unrelated setting years ago is not a feature. Capture is cheap — `ts` is
codec-mapped to a single character (`'c'`) in storage.js, so roughly 30 bytes an
item, about 30 KB per thousand items against a 5 MB budget. And it compounds:
every day capture is on is another day of history to compute from.

**The consequence worth knowing.** Someone who has always had Item Timestamps off
and later switches it on will find the CSV Time column populated for everything
logged **since V61**, not only from the moment they flipped it. That is an
improvement, but it looks like the setting acted retrospectively. It is called out
in the welcome copy, the About changelog and the Item Timestamps settings copy
itself rather than left to surprise anyone.

**The edit branches still never stamp.** `ts` means "first logged", not "last
touched" — the edit paths spread new fields over the old item precisely so an
existing `ts` survives. Asserted in the harness.

**Three stamping sites changed:** `saveItem`, `copyLastResult`, `seedDemoSession`.

---

## New / changed functions

**session.js**
- `sessionDuration(sess)` — PURE. `null`, or `{multiDay, days, ms, text}`.
- `assetHistoryCandidate(query)` — PURE. `null`, or `{assetNo, jobCount}`.
- `assetHistoryFor(assetNo)` — PURE. `{rows, total}`, newest first, capped.
- `openAssetHistory(assetNo)` / `closeAssetHistory()` / `openAssetHistoryRow(arg)`
  — sheet lifecycle; `arg` is `"sessionId|index"`.
- `setView` also clears the two sheet transients.
- `setTimestamps` — unchanged code, rewritten comment.

**utils.js**
- `formatDurationShort(ms)` — `"3h 12m"` / `"47m"` / `"under a minute"`.

**render-core.js**
- `renderAssetHistorySheet()` — the sheet markup.
- `renderSessionsListAreaHTML` — the offer card.
- `renderEditSession` — the `.session-duration-row` block.
- Welcome modal rolled to V61.

**render-settings.js**
- `report-show-duration` toggle in "What to include".
- Item timestamps settings copy rewritten.
- About changelog rolled.

**report.js** — one optional `Testing time` row in the job-details block.
**dispatch.js** — 3 click actions, 1 change action, welcome dismiss rolled.
**storage.js** — `out.showDuration = stored.showDuration === true;`

---

## Storage

**No new keys. `backupVersion` stays 5.**

- The asset-history sheet state (`assetHistorySheetOpen`, `assetHistoryAsset`) is
  purely transient — never saved, never backed up, no key, no validator, no
  migration. Asserted absent from storage.js, backup.js, setup.js and csv.js.
- `showDuration` is an additive field on the existing `reportSettings` blob, which
  already rides backup and setup wholesale.
- `ts` is an existing field, simply populated more often.

**⚠ One line that matters more than it looks:**

```js
out.showDuration = stored.showDuration === true;
```

Every neighbouring flag in `normaliseReportSettings` uses `!== false`, because they
all default ON. This one defaults OFF, so a settings blob saved before V61 (which
has no such key) must backfill to `false`. **Copying the neighbours' pattern here
would silently switch the row on for every existing user's certificate.** The
harness mutation-tests exactly this.

---

## Version / cache / welcome keys

| Thing | Value |
|---|---|
| `APP_VERSION` | `V61` |
| `CACHE_VERSION` | `pat-v61` |
| Welcome key | `pat:v61welcome` (`V61_WELCOME_KEY`, `state.v61WelcomeSeen`) |
| `backupVersion` | **5** — unchanged |
| First-party scripts | 21 — unchanged, `ASSETS` list untouched |

---

## Files changed

`config.js`, `state.js`, `utils.js`, `storage.js`, `session.js`, `render-core.js`,
`render-settings.js`, `dispatch.js`, `report.js`, `styles.css`, `index.html`,
`sw.js` — plus `MAP.md`, `README.md` and this handoff.

**`index.html` changed for one reason only:** it has **never carried the copyright
header**, despite the standing rule that every code file does. The harness caught
it. One comment line added below the doctype; zero behaviour change.

**`README.md` also had drift fixed:** its load-order line never picked up
`bugreport.js` when V60 added it. Corrected.

---

## Validation

- **`node --check`** on all 21 JS files — clean.
- **Duplicate top-level declaration scan** across every loaded file — clean. (This
  is the fatal `SyntaxError` class that caused real data loss during the refactor.)
- **Load-order verification** — `index.html` and the `sw.js` `ASSETS` list agree,
  `boot.js` last, 21 scripts, unchanged from V60.
- **205-assertion stubbed-DOM smoke harness**, purpose-built and deleted before
  delivery. Groups: release mechanics and copyright headers; `formatDurationShort`
  across every branch; `sessionDuration` including out-of-order arrays, mixed
  stamped/unstamped items, garbage timestamps, sub-minute and multi-day spans;
  unconditional capture asserted both by source inspection and by logging a live
  item with the setting off; the exposure gates confirmed still in place; the full
  matching-rule set (substring, superstring, zero-sensitivity, case, site/type/
  location/notes all correctly declining to offer a history); ordering, the row
  cap and malformed-session defence; sheet lifecycle and `setView` clearing;
  the persistence boundary (nothing written to localStorage by opening the sheet);
  `showDuration` defaulting off and backfilling off; dispatch registrations; render
  output including XSS escaping of notes, locations, job titles and the asset
  number itself; and a regression block covering V60 leading zeros, V59 stats, the
  storage codec round-trip carrying `ts`, `buildBackup` still stamping version 5,
  V58's glossary and long-press constant, the V60.1 no-render rule on the bug
  sheet, V57's click swallow and drag guard, and the boot integrity guard.

**Mutation-tested four ways** — each deliberate break confirmed to make the
harness fail, then the code restored and re-run clean:

| Mutation | Caught by |
|---|---|
| Re-gate `ts` capture on the setting (the V60 behaviour) | 3 assertions |
| `showDuration` using the neighbours' `!== false` | 4 assertions |
| Exact asset match relaxed to substring | 2 assertions |
| Zero-insensitive matching (violating V60 decision 8A) | 5 assertions |

**Six harness defects found and fixed during the build** — worth recording,
because the pattern holds: a failing assertion is usually the harness, but not
always, and the two that weren't were the ones worth finding.

- `Number(null)` is `0`, a legitimate zero-length span — "under a minute" was the
  correct output and the assertion was wrong.
- A row-count regex matched the same element twice.
- A malformed placeholder line left in while drafting.
- `renderSessions()` doesn't build the welcome modal — `render()` does; and the
  real `render()` needed `window.scrollTo` stubbed.
- **The multi-day assertion expected 3 days where the correct answer is 2.** This
  one was checked against real output rather than assumed, because "obviously the
  test is wrong" is exactly the reasoning that produced the V60.1 hotfix.
- **`index.html` really was missing its copyright header** — a genuine standing-rule
  violation the harness caught, not a harness fault.

---

## Known notes / limitations

- **Testing time is blank on almost every existing job.** Capture only starts at
  V61 for anyone who had Item Timestamps off, so historical jobs have no figure
  and the line simply doesn't appear. It fills in from here.
- **A job started before V61 and continued after** shows a duration covering only
  the new items. Unavoidable and harmless.
- **Testing time includes breaks.** First item to last, not time on tools. The UI
  says so.
- **Asset history is a live read.** Delete or prune a job and it leaves the
  history — there is no archive, unlike V59's stats bucket.
- **`001` and `1` have separate histories**, by design (Q4A / V60 8A). Worth
  remembering if it ever looks odd.
- **The repeat-asset chip on the entry screen was NOT built** (Q6A). Peter was
  unsure; the call was made on a layout risk spotted during the spec: a chip
  appearing under the asset field pushes PASS and FAIL down at the exact moment a
  thumb is heading for them. Doing it properly needs a reserved-height slot and a
  debounced DOM-only update that never calls `render()` — the same hazard class as
  V60.1. **It pairs naturally with the barcode release**, where it earns much more:
  scan an asset and the phone tells you it failed last March.
- **Still open from V60:** `styles.css` uses `var(--muted)` in one rule, which is
  undefined (the variables are `--text-muted` and `--card-bg`). Deliberately NOT
  fixed here — it wasn't in the spec and this release had no business touching
  unrelated CSS. Still a one-line hotfix whenever wanted.

### Backlog after V61

- **Barcode HID support** — the split-out V61 item. Small, but needs real hardware
  to validate.
- **Photo evidence (IndexedDB)** — confirmed highest priority; deserves its own
  dedicated spec session, being the first persistence mechanism beyond
  localStorage.
- The repeat-asset entry-screen chip (pair with barcode).
- PAT Cloud build (Cloudflare Pages + Supabase + Stripe, separate codebase).
- Commercial onboarding wizard (tied to Cloud).
- Tight-cropped favicon set (deferred since V58).
- The `var(--muted)` CSS fix.
- **The standing recommendation, now five releases old:** V58, V59, V60 and V61
  have all shipped without willingness-to-pay being validated. Peter is running
  the price conversation and tutorial material in parallel, which is the right
  answer — this is a marker, not a nag.

---

## Post-commit functional test checklist

Run on the live PWA after deploying, once the service worker has updated.

**Update lands**
1. Reopen the app. The "What's new in V61" welcome modal appears **once**.
2. Settings → Help → About: header reads **PATGo V61**; What's new shows
   **V61 / V60 / V59** (V58 gone).

**Asset history — the main event**
3. You need an asset number tested in **two or more jobs**. If you haven't got one,
   make one: log asset `001` in a new job, then start a second job and log `001`
   again.
4. Sessions → search box → type that asset number. A **🕘 Asset … tested in N
   jobs** card should appear above the list.
5. Tap it. The sheet opens listing every job it appears in, **newest first**, each
   with date, job name, PASS/FAIL, location and item type.
6. **Tap a row.** It should close the sheet and open that job **at that item** —
   check the asset number on screen matches the row you tapped.
7. Go back and search a **site name** (e.g. "Acme"), then an **item type** (e.g.
   "Kettle"). **Neither should offer a history card.** That's the rule working.
8. Search a partial number — if you have asset `1024`, search `10`. **No card.**
9. If you use padded numbers: confirm searching `001` and searching `1` give
   **different** results. They're different assets on purpose.
10. If you use **Test Readings**: confirm the readings show on the history rows.
    Turn the feature off in Settings and confirm they vanish from the sheet.
11. Open the sheet, then navigate away to Settings and back to Sessions. **The
    sheet must not still be open.**

**Testing time**
12. Open a job with several items logged today → **Session settings**. There should
    be a **⏱ Testing time** line with a figure and a note that it includes breaks.
13. Open an **old job from before this update**. There should be **no testing time
    line at all** — not "0m". (Unless you already had Item Timestamps on.)
14. Log two items a couple of minutes apart in a new job, then check Session
    settings shows a sensible small figure.
15. **The multi-day case:** open a job you logged on a previous day and add an item
    to it today. Session settings should say **"spread across 2 days"**, not a
    number of hours.

**Testing time on the certificate**
16. Produce a report for a job **without** touching Report settings. There should
    be **no** Testing time row. This is the regression that matters — nobody's
    existing certificate should change.
17. Settings → Report settings → **What to include** → switch **Testing time** on.
18. Produce the report again. Testing time should now appear in the job details
    block alongside Test date and Engineer.
19. Produce a report for an **old job with no timestamps** with the toggle still
    on. The row should be **absent**, not blank or zero.

**Timestamps — the data-layer change**
20. Check Settings → Display → **Item timestamps** is however you normally have it.
    **Leave it off** if it's off.
21. Log a few items, then check testing time appears in Session settings anyway.
    That's unconditional capture working.
22. Now turn Item timestamps **on**. Open a job's Overview — the per-item times
    should show for everything logged since this update.
23. Settings → CSV Columns → enable the **Time** column, export a CSV, and check
    times are populated. Turn Item timestamps back **off**, export again, and
    confirm the Time column is **blank**. The setting still controls what you
    export.

**Regression sweep**
24. **Backup round-trip:** export a backup, restore it. Everything survives —
    sessions, items, readings, clients, report settings. Check your Testing time
    PDF toggle survived, and that asset history still works after the restore.
25. Log items via Quick Pick, Smart Quick Pick, Multi Pick, copy-last, and a FAIL
    flow with a reason.
26. **V60 still good:** Settings → Contact → Report a problem. Type into "What went
    wrong?", leave the keyboard up, then tap Idea / Bug / a severity. **The form
    must not rebuild and the keyboard must not drop.** Also: new session starting
    at `001` still numbers `002`, `003`.
27. **V59 still good:** Settings → bottom: the lifetime stats line is still there.
28. **V58 still good:** Settings → Help → Glossary opens. Press-and-hold Quick Pick
    opens the preset sheet in about a second.
29. **V57 still good:** type into item type and tap a suggestion — lands first time,
    no jump to Notes, no accidental Pass.
30. CSV export + re-import, session lock, search/filters, retest reminders, and a
    PDF report — all as before.
31. **Console clean** (incognito, dev tools) — no errors.

---

## Deploy order (GitHub web UI)

**No new files this release**, so nothing needs uploading ahead of `index.html`.
`sw.js` still goes last.

1. `config.js`
2. `state.js`
3. `utils.js`
4. `storage.js`
5. `session.js`
6. `report.js`
7. `render-core.js`
8. `render-settings.js`
9. `dispatch.js`
10. `styles.css`
11. `index.html`
12. **`sw.js` — LAST** (cache `pat-v61`)

`MAP.md`, `README.md` and this handoff are repo docs; commit any time.

After committing: wait ~1 minute for Pages to redeploy, then on the phone fully
close the PWA from the app switcher and reopen once or twice
(close-open-close-open). Verify in an open file (incognito) that **`pat-v61`**
appears in `sw.js` and that the console is error-free.

**Take a backup before you deploy.** This release changes when item timestamps are
written, and that's the standing rule for anything touching the data layer. It
costs ten seconds.

(c) 2026 Peter Birchley. All rights reserved.
