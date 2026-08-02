# PATGo — Handoff V60

**Version:** V60 · cache **`pat-v60`** · `backupVersion` **5** (UNCHANGED)
**Type:** Feature release — one-tap bug report, leading zeros in asset numbers,
and the naming sweep. Three concerns, deliberately grouped (see *Scope* below).
**Welcome modal:** ROLLS — `pat:v60welcome`. About changelog rolled to
V60 / V59 / V58 (V57 dropped).
**New file:** `bugreport.js` — first-party scripts 20 → **21**.
**Date:** August 2026

---

## Scope — why three things in one release

Peter's own rule is one concern per release, so this needs justifying rather than
glossing:

- **The rename is comment-only.** Fifteen banner strings. Zero behaviour.
- **Leading zeros add one additive session field** (`startPad`). The storage codec
  is key-mapped and passes unmapped keys through unchanged, so this is not a
  schema change and does not spend the earmarked `backupVersion` 6.
- **The bug report is the only real feature**, and it is additive — a new file
  plus one settings page, touching no existing data path.

The clean split, had it been wanted, was V60 = report + rename, V61 = zeros.
Peter chose to keep them together (spec answer 6B in context).

---

## 1. One-tap bug report

### Where it lives

Settings → Contact. The old static "what to include in a bug report" advice card
is **gone** — it was asking the user to do by hand what the app can do for them.

### What the engineer does

| Field | Input | Required |
|---|---|---|
| Type | Bug / Idea / Feedback | defaults to Bug |
| How bad is it? | 3 options, **Bug only** | defaults to P2 |
| Can you make it happen again? | Every time / Just once / Haven't tried | defaults to "haven't tried" |
| What went wrong? | textarea | **yes** (≥10 chars) |
| What were you doing? | textarea | no |

Severity labels are plain language on screen — "The app won't work — I can't
carry on testing" / "It works, but something's wrong or annoying" / "Small thing
— looks wrong, not urgent" — and map to `P1`/`P2`/`P3` in the subject line only.
No jargon is ever shown to an engineer.

For **Idea** and **Feedback**, the severity and repeatable rows hide and the two
questions relabel to "What would you like?" / "Why would that help?". Same sheet,
different words.

### What the app collects by itself

```
APP: V60
CACHE: pat-v60
SENT: 02/08/2026 14:31
MODE: Installed app
NETWORK: Offline
SCREEN: 390x844 @3x
DEVICE: Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 …)
ENGINEER: Peter Birchley
JOBS: 12 (1 open, 0 locked)
ITEMS: 847 (31 failed)
STORAGE: 412 KB
FEATURES: readings=on retest=off timestamps=on multipick=off haptics=on theme=dark
LISTS: types=24 reasons=9 presets=3 clients=6 (active preset: Office)
ERRORS: none recorded
```

**`CACHE` is the highest-value line in the report.** This app is cache-first, so a
user can be running a build several versions old while the About page happily
reports whatever version their *cached* `config.js` claims. That line is read from
the browser's actual cache store, so a stale install is visible immediately —
before anyone spends an evening chasing a bug that was fixed two releases ago.

### ⚠ The privacy rule

**Diagnostics carry counts and flags only.** No client names, site names,
locations, asset numbers, item types, notes or certificate numbers. Ever.

This is a design constraint, not a footnote. A support email must never become a
route for one customer's data to leave an engineer's phone — and that will matter
more, not less, once people are paying. The sheet also shows the exact payload
read-only before sending (decision 5A), so nothing leaves unseen.

The harness enforces this: it seeds fake client names, sites, asset numbers,
locations and item notes into state, then asserts none of them appear anywhere in
the diagnostics **or** the assembled email body. That group was **mutation-tested**
— a leak was deliberately introduced and the assertions confirmed to fail — because
a privacy test that cannot fail is theatre.

### Why mailto and not a network POST

The app is offline-first and engineers are usually in a plant room, a riser
cupboard or a basement when something breaks — i.e. **exactly where an HTTP POST
would fail**. A `mailto:` hands the composed message to the device's own mail
client, which queues it and sends when signal returns. The report therefore cannot
be lost by being offline, which is the entire point.

A **Copy instead** button covers a device with no mail client, using the same
textarea + `execCommand` technique as `copyCSV` (the one that works reliably in
iOS PWAs).

### The email format

Subject: `[PATGo BUG P1] V60 — pass button does nothing after…`

The bracketed tag is the whole point: **Cowork can sort the inbox by type and
severity from the subject alone**, without opening a single message. The body is
fixed `KEY: value` lines with the diagnostics in a `--- DIAGNOSTICS ---` fence.

### Implementation note — a spec deviation worth recording

The spec said Send would grey out until 10 characters. Implementing that through a
re-render would have destroyed the textarea's caret on every keystroke — the same
trap the readings fields avoid. So `setBugField` toggles the button's `disabled`
property **directly on the element** instead of going through a render pass. Same
UX, no caret loss. `sendBugReport` re-validates anyway, so the gate holds even if
the DOM sync is somehow missed.

---

## 2. Error capture (decision 10A)

`initErrorCapture()` binds `window.onerror` and `unhandledrejection`, keeping the
last **3** errors (message, file, line) in a module-level array.

**Never persisted.** It lives and dies with the page. It cannot grow without
bound, cannot corrupt a save, and cannot leak into a backup. The trade — a crash
that reloads loses its own error text — is accepted, because putting the error
path onto the storage path is the one risk in this app not worth taking.

**Known limit, stated rather than hidden:** `boot.js` loads last, so a *parse-time*
failure in an earlier file happens before these handlers exist and is not captured.
That class is already covered by the boot integrity guard, which now carries its
own report link (below).

Armed as the **first** thing `boot.js` does, guarded on `typeof initErrorCapture
=== 'function'` and wrapped in try/catch, so a failure there can never stop the app
starting.

---

## 3. Crash-screen report link (decision 11A)

Both crash screens — the integrity-guard "Update needed" screen and the
render-failure "Something went wrong" fallback — now carry an **Email a report**
link.

`_crashReportLink(context)` in `boot.js` **deliberately duplicates** a little of
`bugreport.js` rather than calling it. These screens appear precisely when the app
has failed to load, so they must not depend on any other file having parsed.
Everything in it is inline string building plus `navigator.userAgent`, with
`APP_VERSION` itself `typeof`-guarded.

**Do not "DRY" this up by wiring it to bugreport.js.** The duplication is the point.

Without this, the worst bugs in the app are the ones you'd never hear about,
because a user who can't reach Settings can't reach the report button.

---

## 4. Leading zeros in asset numbers (decisions 6B / 7 / 8A)

### The actual blocker

Typing `001` into the item field always worked — `f-asset` is a plain text input.
Two things were broken:

1. **`splitAssetNo` threw the width away.** `parseInt('001')` is `1`, so the next
   item came out as `2`.
2. **The New Session start-number field was `type="number"`.** A numeric input
   normalises its own value, so `001` was rewritten to `1` *before the app ever
   saw it*. No amount of code downstream could have fixed that. It's now
   `type="text" inputmode="numeric" pattern="[0-9]*"` — numeric keypad on mobile,
   typed string intact.

### The rules

- **Padding is opt-in by deliberate act** (decision 8A, Peter's own reasoning):
  `assetPadFromInput` returns 0 unless the typed value *begins* with a zero.
  `'1'` → no padding. `'001'` → width 3. A lone `'0'` → no padding.
- **Width never truncates** (decision 7): `099` → `100`, `999` → `1000`. Width
  only grows. Clipping or wrapping would silently produce **duplicate asset
  numbers on a real job**, which is the one outcome worth designing against.
- **Mid-job hand-typed padding is followed.** Increment pads to the width of the
  previous item's own digits, so typing `0050` mid-job gives `0051` next.
- **Prefixes work as before.** `BT-007` → `BT-008`.
- **Duplicate detection unchanged** (decision 8A): `'001'` and `'1'` remain
  **different** asset numbers. The label on the appliance is the identity — if you
  typed the zeros, you meant them.
- **`ASSET_PAD_MAX` (12)** clamps the width, so a hand-edited backup claiming a
  width of 5000 can't turn every asset number into a wall of zeros.

### Back-compatibility

`startPad` is **absent on every pre-V60 session**. `padAssetNumber` sees
`undefined`, treats it as width 0, and returns the number unchanged. **Old jobs
behave exactly as they did before. No migration, no backfill, nothing to go
wrong.** Asserted in the harness.

The field rides the storage codec as an unmapped passthrough key (the codec is
key-mapped, not positional), so **`backupVersion` stays 5**.

---

## 5. Naming sweep (decision 9)

**Changed:** 15 instances of `PAT Test PWA` → `PATGo PWA` across `boot.js`,
`clients.js`, `csv.js`, `events.js`, `feedback.js`, `multipick.js`, `setup.js`,
`sqp.js`, `utils.js`, `styles.css`. Plus `MAP.md`'s title and this doc.

**Deliberately NOT changed — and this list matters:**

| Kept | Why |
|---|---|
| `pat:` localStorage key prefixes (39 of them) | **Renaming would orphan every user's data instantly.** Internal identifiers, invisible to users. |
| `pat-vNN` cache key | Same class of risk — it's the mechanism that pulls updates onto installed PWAs. |
| `'PAT Tester'` item type | A real appliance type an engineer would test. |
| "your PAT tester" (Test Instrument settings) | Refers to the physical instrument. |
| `pat-testing-training.net` URLs | External reference source for the calculator tables. |
| Manifest description "Fast offline PAT testing entry tool" | PAT testing is the *activity*, not the old product name. |

The repo name `exnno/pat-test-app` and the GitHub Pages URL are unchanged and out
of scope — they change when the app moves to `app.patgo.co.uk`.

---

## New / changed functions

| Function | File | What it does |
|---|---|---|
| `makeEmptyBugDraft()` | **config.js** | Draft factory. **Must be here** — state.js seeds from it at load time, before bugreport.js is parsed |
| `recordBugError(kind,msg,src,line)` | bugreport.js | Pushes to the in-memory ring; defensive throughout |
| `initErrorCapture()` | bugreport.js | Binds the two global handlers. Called once from boot |
| `bugErrorSummary()` | bugreport.js | Errors → one report line |
| `_bugStorageKB()` / `_bugDisplayMode()` | bugreport.js | Storage footprint; installed-app vs browser tab |
| `refreshBugCacheName()` | bugreport.js | **Async** — reads the live SW cache name off the device |
| `collectDiagnostics()` / `diagnosticsText()` | bugreport.js | The payload. **Counts and flags only** |
| `openBugSheet()` / `closeBugSheet()` | bugreport.js | Sheet lifecycle; close wipes the draft |
| `setBugType/Severity/Repro(id)` | bugreport.js | Tap setters — these DO render; each rejects unknown ids |
| `setBugField(field, v)` | bugreport.js | Typing — **no render**; syncs Send's disabled directly |
| `bugDescriptionReady()` | bugreport.js | The ≥10-char gate |
| `bugSubjectLine()` / `bugBodyText()` | bugreport.js | The fixed format. Description truncated against the cap, never the diagnostics |
| `sendBugReport()` / `copyBugReport()` | bugreport.js | mailto; clipboard fallback |
| `renderBugSheet()` | render-settings.js | The sheet markup |
| `splitAssetNo(s)` | utils.js | **Changed** — now returns `width` too |
| `padAssetNumber(n, width)` | utils.js | Pads, never truncates, clamped |
| `assetPadFromInput(v)` | utils.js | Opt-in pad width from typed input |
| `nextAssetNo(session)` | session.js | **Changed** — three padded paths |
| `_crashReportLink(context)` | boot.js | Self-contained crash-screen mailto |

---

## Storage

**No new storage keys.** The bug-report state is purely transient (never saved,
never backed up, never restored — asserted against storage.js, backup.js and
setup.js in the harness).

**One additive session field:** `startPad` (integer). Unmapped passthrough in the
codec. Absent on all pre-V60 sessions and correctly treated as "no padding".

**`backupVersion` stays 5.** The earmarked 6 remains reserved for a genuinely
incompatible schema change. This isn't one.

---

## Version / cache / welcome keys

| Thing | Value |
|---|---|
| `APP_VERSION` | `'V60'` |
| `CACHE_VERSION` | `pat-v60` |
| Welcome key | `V60_WELCOME_KEY` = `pat:v60welcome` |
| Welcome flag | `state.v60WelcomeSeen` |
| New storage key | **none** |
| New session field | `startPad` (additive) |
| `backupVersion` | **5** (unchanged) |

---

## Files changed

- **bugreport.js** — **NEW.** Error capture, diagnostics, report composition.
- **config.js** — `APP_VERSION` → V60; welcome key rolled; the bug-report constant
  block; `makeEmptyBugDraft()`; `ASSET_PAD_MAX`.
- **state.js** — `v60WelcomeSeen`; `bugSheetOpen` + `bugDraft`.
- **utils.js** — `splitAssetNo` returns `width`; `padAssetNumber`;
  `assetPadFromInput`. Banner renamed.
- **storage.js** — welcome key read rolled.
- **session.js** — `nextAssetNo` padding; `createSession` records `startPad`.
- **render-core.js** — welcome modal rolled to V60; New Session start field
  `type="number"` → `text`, plus the leading-zeros hint on the label.
- **render-settings.js** — Contact page rebuilt; `renderBugSheet()`; About
  changelog rolled (V60/V59/V58, V57 dropped).
- **dispatch.js** — 7 click actions + 2 input actions; welcome dismiss rolled.
- **boot.js** — arms `initErrorCapture()`; `_crashReportLink()` on both crash
  screens. Banner renamed.
- **styles.css** — the `.bug-*` block. Banner renamed.
- **index.html** — `bugreport.js` added after `feedback.js` (21 scripts).
- **sw.js** — `CACHE_VERSION` → `pat-v60`; `./bugreport.js` added to ASSETS
  (23 `.js` entries). **Commit LAST.**
- **clients.js, csv.js, events.js, feedback.js, multipick.js, setup.js, sqp.js** —
  banner rename only, no behaviour change.
- **MAP.md, README.md** — updated to V60.
- **backup.js** — **deliberately unchanged.** Asserted in the harness.

---

## Validation performed

- **`node --check`** on all 22 JS files — clean.
- **Duplicate top-level declaration scan** across the full 21-file load chain,
  524 symbols — clean. (This is the data-loss class of bug; the new file made the
  check non-optional.)
- **Load-order verification** — `index.html` lists 21 scripts, sw `ASSETS` lists
  23 `.js` (21 first-party + 2 lazy jsPDF), `boot.js` last in both, `bugreport.js`
  after `feedback.js` in both. No file in one list and missing from the other.
- **Stubbed-DOM smoke harness — 228/228 assertions pass.** Twenty groups: version/
  cache/welcome rolls and the absence of V59 remnants; `splitAssetNo` width across
  padded, unpadded, prefixed, non-numeric, empty and null input; `padAssetNumber`
  including the never-truncate rule, NaN/negative/undefined widths and the
  `ASSET_PAD_MAX` clamp; `assetPadFromInput`'s opt-in rule; `nextAssetNo`
  end-to-end across 17 cases including **pre-V60 sessions behaving unchanged**;
  duplicate detection confirming `001` ≠ `1`; the bug-report constants and draft
  factory independence; every setter rejecting garbage ids; subject-line format
  for all three types and all three severities; **the privacy group**; body
  composition including the idea/feedback relabel and the length-budgeting proof
  that diagnostics survive a 20,000-character description; mailto encodability;
  error capture including the ring cap, oldest-eviction, null-safety, long-message
  truncation and **the assertion that nothing is written to localStorage**; sheet
  lifecycle; **bug state absent from storage.js, backup.js and setup.js**; sheet
  rendering including the disabled-Send gate and **XSS escaping of both user text
  and the diagnostics preview**; Contact page wiring; all 9 dispatch registrations;
  boot's error-capture arming and the self-contained crash link; the rename sweep
  with copyright headers verified intact in every file and the **critical
  assertions that `pat:` keys and the `pat-vNN` cache key were NOT renamed**; and
  a regression block covering V59's stats counter, V58's glossary and long-press
  constant, V57's click-swallow and drag guard, the storage codec round-trip
  (including `startPad`), and `buildBackup` still stamping version 5.
- **Mutation test on the privacy group.** A deliberate leak (a client name added
  to the diagnostics) was introduced and the harness confirmed to **fail**, then
  the file was restored and the harness re-run clean. The privacy assertions are
  proven capable of catching a regression rather than passing vacuously.

The harness was purpose-built for this release and deleted before delivery.

**One harness defect found and fixed:** the non-numeric-fallback assertion expected
`004` for a *one-item* job, where the correct answer is `002`
(`startNumber + items.length`). The app was right; the assertion was wrong. Both
the 1-item and 3-item cases are now asserted. (Two further harness stubs also
needed fixing — `render` had to be stubbed before the setter tests, and `ACTIONS`/
`INPUT_ACTIONS` are top-level `const`s that need bridging out of the vm program.
Both are the documented harness gotchas, not app bugs.)

---

## Known notes / limitations

- **Parse-time errors aren't captured.** `boot.js` loads last. Covered instead by
  the integrity guard's screen, which now carries its own report link.
- **`mailto:` behaviour varies by device.** If a phone has no mail client
  configured, nothing visibly happens — hence the **Copy instead** button. The
  sheet stays open for 1.2s after Send precisely so that backing out of the mail
  app doesn't lose the typing.
- **`ENGINEER` is in the diagnostics.** That's the engineer's own name from their
  settings, not a client's. It identifies who sent a report from a personal email
  address. Trivially removable if unwanted.
- **The error ring is lost on reload.** By design (see above).
- **Leading zeros only apply going forward.** Existing jobs keep whatever asset
  numbers they already have — nothing is rewritten retrospectively.
- **`001` and `1` can coexist in one job** without a duplicate warning. Decision
  8A, intentional, but worth remembering if it ever looks odd.
- **Pre-existing bug spotted, NOT fixed here:** `styles.css` line ~1449 uses
  `var(--muted)`, which is not defined anywhere — the variables are `--text-muted`
  and `--card-bg`. Something on that rule renders with an inherited colour rather
  than the intended one. Out of scope for V60; worth a one-line hotfix.
- **Backlog after V60:**
  - PAT Cloud build (Cloudflare Pages + Supabase + Stripe, separate codebase).
  - Commercial onboarding wizard (tied to Cloud).
  - Tight-cropped favicon set (deferred since V58).
  - The `var(--muted)` CSS fix above.
  - **The standing recommendation, now overdue:** V58, V59 and V60 have all
    shipped without willingness-to-pay being validated. V60 at least earns its
    place — it's the first release that makes *other people's* problems visible to
    you, which is a prerequisite for supporting paying users. But the peer market
    test (a real price conversation, ideally with a small refundable deposit)
    has now been the highest-leverage next step for four releases running.

---

## Post-commit functional test checklist

Run on the live PWA after deploying, once the service worker has updated.

**Update lands**
1. Reopen the app. The "What's new in V60" welcome modal appears **once**.
2. Settings → Help → About: header reads **PATGo V60**; What's new shows
   **V60 / V59 / V58** (V57 gone).

**The bug report — the main event**
3. Settings → Contact. There's a **🐞 Report a problem** button, and the old
   "what to include" advice card is gone.
4. Tap it. The sheet opens with **Bug** pre-selected and Send **greyed out**.
5. Tap through Idea and Feedback — the severity and "happen again" rows should
   **disappear**, and the questions relabel to "What would you like?". Tap back to
   Bug and they return.
6. Type a few words. **Send should un-grey** once you're past about ten
   characters — and the keyboard must **not** close or jump while you type. If the
   caret jumps, tell me; that's the one thing I couldn't test off-device.
7. Open **"What gets sent with this"**. Check the diagnostics.
   - `APP` should say V60 and `CACHE` should say `pat-v60`. **If CACHE says
     anything else, your update hasn't fully landed** — close and reopen the app.
   - `JOBS` and `ITEMS` should roughly match reality.
   - **Read it for anything that shouldn't be there.** There should be **no client
     name, no site name, no location, no asset number, no notes** anywhere in that
     block. This is the thing I most want a second pair of eyes on.
8. Tap **Send**. Your mail app should open with the To, Subject and body filled
   in. Subject should look like `[PATGo BUG P2] V60 — …`.
9. **Actually send one to yourself** and check it arrives readable — that's the
   format Cowork will be parsing every morning.
10. Go back in, fill it in again, and tap **Copy instead**. Paste it into a note
    and confirm you get subject + body.
11. **Airplane mode on.** Fill in a report and Send. It should still open the mail
    app and queue. Turn signal back on and confirm it sends.

**Leading zeros**
12. New session, prefix blank, **Starting asset number `001`**. Confirm the field
    actually accepts the zeros and doesn't snap back to `1`.
13. Start logging. First item should be **001**, then **002**, **003**.
14. Let one run past **009 → 010**. (If you're patient, `099 → 100` — it should
    grow, not wrap.)
15. New session with start number **`1`** (no zeros). Items should be **1, 2, 3** —
    exactly as before. **This is the regression that matters**: plain numbers must
    be untouched.
16. New session with prefix **`BT-`** and start `001` → **BT-001, BT-002**.
17. Open an **existing job from before this update** and add an item. Numbering
    must continue exactly as it did before.
18. In a padded job, manually type `0050` on an item, save, and check the next
    one offers **0051**.

**Regression sweep**
19. **Backup round-trip:** export a backup, restore it. Everything survives —
    sessions, items, readings, clients, report settings. Check a padded job still
    numbers correctly after the restore.
20. Settings → bottom: the **V59 lifetime stats line** is still there and still
    correct.
21. Log items via Quick Pick, Smart Quick Pick, Multi Pick, copy-last, and a FAIL
    flow with a reason.
22. **V58 still good:** Settings → Help → Glossary opens. Press-and-hold Quick
    Pick still opens the preset sheet in about a second.
23. **V57 still good:** type into item type and tap a suggestion — lands first
    time, no jump to Notes, no accidental Pass. Same on Location and Client/Site.
24. CSV export + re-import, session lock, search/filters, retest reminders, and a
    PDF report — all as before.
25. **Console clean** (incognito, dev tools) — no errors.

---

## Deploy order (GitHub web UI)

**`bugreport.js` is a NEW file and must be uploaded BEFORE `index.html` and
`sw.js`**, or an installed PWA will try to load a script that isn't there yet.

1. **`bugreport.js`** ← NEW FILE, upload FIRST
2. `config.js`
3. `state.js`
4. `utils.js`
5. `storage.js`
6. `session.js`
7. `render-core.js`
8. `render-settings.js`
9. `dispatch.js`
10. `boot.js`
11. `clients.js`, `csv.js`, `events.js`, `feedback.js`, `multipick.js`,
    `setup.js`, `sqp.js` *(banner rename only — harmless, but they're in the
    changed set so upload them)*
12. `styles.css`
13. `index.html`
14. **`sw.js` — LAST** (cache `pat-v60`)

`MAP.md`, `README.md` and this handoff are repo docs; commit any time.

After committing: wait ~1 minute for Pages to redeploy, then on the phone fully
close the PWA from the app switcher and reopen once or twice
(close-open-close-open). Verify in an open file (incognito) that **`pat-v60`**
appears in `sw.js`, that `bugreport.js` loads, and that the console is error-free.

**Take a backup before you deploy.** This release adds a session field, and that's
the standing rule for anything touching the data layer. It costs ten seconds.

(c) 2026 Peter Birchley. All rights reserved.
