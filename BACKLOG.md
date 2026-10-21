# PATGo — Standing backlog

Work agreed but not yet scheduled. Carried across releases; the handoff points
here rather than restating it. Delete an item when it ships.
(c) 2026 Peter Birchley. All rights reserved.

---

## Next release

### Next after V139
V139 = password sign-in (Stage 13, A; Peter 20 Oct: 1A 2A 3A 4B 5A). cloud.js
`cloudPasswordSignIn` / `cloudForgotPassword` / `cloudPasswordSave`, both sign-in
routes through `_cloudSignedIn` + `_cloudAfterSignIn`; Forgot = emailed code then
"Choose a new password" (never the reset link); rule 8+ with a letter and a
number (`cloudPasswordProblem`, matches the dashboard); no current password.
render-help.js Account cards in real forms; dispatch.js `handleDelegatedSubmit`.
Harness 78 + M1344–M1357; 77e retired → 78e. No SQL.
**Next (Peter's order): B Google sign-in (Google Cloud OAuth setup first) → C
About/Privacy from the privacy terms (waits on the policy) → D Stage 13 pricing
round + Stripe account.**
**At the Supabase Pro + production move:** turn on leaked-password protection
(HaveIBeenPwned — Pro only), and set the production project's Email provider the
same as test (sign-ups off, minimum 8, letters and digits, secure password change
OFF, require current password OFF).

### V139 residuals (known, accepted)
- Not yet seen on a real iPhone: whether Safari offers to save the password
  (its call, not ours — the forms and hints are in place), Passwords autofill on
  the sign-in card, the strong-password suggestion on "New password", and Go.
- Changing the password does not sign the account's other phones out (Supabase
  keeps their sessions). Fine for testers; revisit with teams.
- No "you have no password yet" hint: the app can't tell (Supabase doesn't say).
  A hand-made account without one gets "don't match… tap Forgot password".

### Next after V138
V138 = Show me how starts on the page (V137's residuals; Peter 20 Oct: 1A 2A
3A, all defaults). tour.js: opened `fromPage`, `_tutSteps()` leaves out the walk
steps (`TUT_WALK_KEYS` = step keys `group`, `page`) and `openTutorial` runs
their `run`s first, so the practice stands exactly where the walk leaves it
(1A); a done step's `fromPage` words replace "Next up…" — Finish brings you
back to this page (2A, the six page tutorials). From Tutorials unchanged.
Scroll left alone (3A — the link is at the top). Harness 77 + M1336–M1343;
76f retired → 77e.
**Next (Peter's order, 20 Oct): A password sign-in (V139, done) → B Google
sign-in → C About/Privacy from the privacy terms (waits on the policy) → D
Stage 13 pricing round + Stripe account.**

### V138 residuals (known, accepted)
- Not yet seen on a real iPhone: a tutorial opening straight onto the page
  (the first box on the page's own control), and the new last card.
- V137's "a Settings tutorial starts on the Settings list from its page" — fixed
  (1A). V137's "the page comes back at the top" — closed, nothing to restore
  (3A: the link is at the top).
- A walk step added later to a page tutorial must use the key `group` or
  `page`, or it shows from the page too (MAP tour.js ⚠, 77a catches it).

### Next after V137
V137 = Show me how on Settings pages (Stage 12; Peter 18 Oct: 0A, all defaults
1A–6A). tour.js `tutShowMeHowHTML` / `tutShowMeHow` (a TUTORIALS entry's `page`
is the page it teaches; the Sync tutorial gained `page: 'cloudSync'`); drawn by
render-settings.js `settingsHowToHTML` on five pages and render-help.js on Sync.
Opened with `fromPage` → Finish only. Typing goes through settings-actions.js
`unsavedLeave(go, go)`; Save then the tutorial through `unsavedSaveThen` /
`_unsavedThen` (settingsBackNav takes it first). Return markers untouched.
Harness 76 + M1319–M1335; 75f retired → 76f; 74a now compares with a tutorial
open (the link is never drawn inside one).
**Next:** Stage 12's last code item is About/Privacy from the privacy terms —
waits on Peter's privacy policy. Then Stage 13 (pricing + Stripe account first;
password + Google sign-in could come forward). Testers this week.

### V137 residuals (known, accepted)
- Not yet seen on a real iPhone: the line under each title at Larger text, and
  the Save / Discard question opening the tutorial straight after.
- A Settings tutorial still starts on the Settings list even when opened from
  its page (as from Tutorials) — the walk there is part of what it teaches.
- The page comes back scrolled to the top after a tutorial (a tutorial starts
  at the top; the link is at the top too).

### Next after V136
V136 = Tutorials, part 3 — your jobs & the cloud (Stage 12; Peter 18 Oct: all
defaults 1A–9A). tour.js: three tutorials (`jobs`, `cloud`, `sync`; `group:
'cloud'`, `cloud: true`) on a pretend signed-in phone (`_tutCloudState`: three
sample jobs, five cloud-only); `_tutDraw` swaps `TUT_CLOUD_STUBS` in for the
draw so the phone's own sync records are never read; Push / Check / Bring are
the practice's own. Tutorials page: second heading (render-help.js). Backup's
Export everything card fuller. Harness 75 + M1297–M1318; 74f retired → 75f.
**Next:** Stage 12's remainder — maybe the "Show me how ›" link on each covered
Settings page (V135 10A, V136 9A deferred); About/Privacy from the privacy
terms. Testers this week: the tutorials are their first stop.

### V136 residuals (known, accepted)
- Not yet seen on a real iPhone: the asset history sheet in the practice, the
  cloud tab's selection bar at the bottom, the Sync page's long scroll to the
  held job.
- What's different? and the two answers on the held job are look-only (6A) —
  the comparison sheet needs the cloud copy, which the practice doesn't have.
- The Jobs list tutorial's reminder steps show only where the banners show
  (they always do on the practice phone; a `when` guard keeps the step honest
  if a reminder's rules change).
- A new read of the phone's sync records in the Jobs list / cloud tab / Sync
  page must join `TUT_CLOUD_STUBS` (MAP tour.js ⚠), or the practice shows it.

### Next after V135
V135 = Tutorials, part 2 — the Settings tutorials (Stage 12; Peter 18 Oct: all
defaults 1A–10A). tour.js: `TUTORIALS` (practice + engineer, branding, content,
items, backup), each its own steps; Settings ones start from
`_tutSettingsState` (a new phone), draw the real Settings pages
(`TUT_SETTINGS_VIEWS`), fill examples on tap, logo / signature pickers into the
practice only, practice-only saves, end on the result, Finish / Next tutorial.
Tutorials page lists them (render-help.js). Harness 74 + M1278–M1296; 72f, 73f
retired → 74f.
**Next (1A):** V136 — the rest a newcomer needs (own spec round): Jobs list
tabs, the cloud tab, sync, Export everything; the Tutorials page lists them.
Maybe then (10A deferred): a "Show me how ›" link on each covered Settings page.

### V135 residuals (known, accepted)
- Not yet seen on a real iPhone: the logo / signature pickers in the practice,
  the box on long Settings pages (Company & Branding and Certificate Content
  scroll to reach Save), the New preset sheet.
- Drawing a signature isn't in the tutorial (the draw pad is a separate sheet
  the practice doesn't draw) — the card says you can draw it; the step offers
  Upload image.
- Engineer & Tester ends on the sample certificate, not the New job form (the
  form shows your name but not the instrument — the certificate shows both).
- Backup & Restore's Export everything and snapshot steps show only where the
  app has them (both optional files); the step is passed otherwise.
- Settings tutorials start as a new phone, so they never show your own
  settings (4A, by design).

### Next after V134
V134 = Tutorials, part 1 — the practice job (Stage 12; Peter 18 Oct: 1A 2A 3B
4A 5A 6A 7A). tour.js rewritten: the practice draws the REAL renderSessions /
renderEntry / renderOverview from its own state (`_tutDraw`, storage refused
meanwhile, everything put back in `finally`); a blue box (`#tut-ring`) glides
between targets; 19 steps; sample certificate from `buildReportDoc` (no
`stampCertNumber`). Settings → Help → Tutorials (render-help.js), setup's
finish offers it, About points to it. The V42 picture slides retired. Harness
72 + M1240–M1261; 71f → 72f; M935, M966, M1214 retired.
**Next (1A):** V135 — the Settings tutorials (own spec round: which pages —
likely Engineer & Tester, Company & Branding, Certificate Content, Quick Pick
Items, Backup & Restore). Reuse the engine: `_tutDraw` with the real
renderSettings* functions. ⚠ Settings pages hold typing and Save guards (R37) —
the practice must never call a real save handler; their inputs are readonly in
the practice, so "do" steps there are taps only. Then V136 — the rest a
newcomer needs (Jobs list tabs, cloud tab, sync, Export everything) and the
Tutorials page grows to list them. The online tutorial / demo video (landing
page) is Peter's, non-code.

### V134.1 (hotfix, 18 Oct — Peter: 0A 1A 2A 3A 4A)
Peter's iPhone run of V134: the photo and presets steps did nothing when
tried, the page jumped at every step, and the end left a dot. Fixed in
tour.js / styles.css (dispatch.js `tut-free`): practice photos (camera, object
URLs, never stored); three example presets + a hold step (the app's own
`attachHoldGesture`) + Tap Kitchen → 21 steps; the page stays still
(`tutCardEnd` — the card moves; scroll only for a control off the screen, e.g.
PASS on an SE); no box or dim on the last step; free practice. Harness 73 +
M1262–M1277. Cache pat-v134-1; APP_VERSION / What's new unchanged.
Residuals: free practice has no typing (asset, location, notes, Other…) — a
blank location is filled with the practice's; on iPhone a home-screen app can
occasionally restart while the camera is open (as in the real app) — the
practice simply starts again; free practice's Jobs list shows only the
practice job.

### V134 residuals (known, accepted)
- Not yet seen on a real iPhone: the glide, the card at the far end, the flash
  and sound after PASS / Copy, VoiceOver reading the card (the practice screen
  itself is hidden from VoiceOver; Skip does any tap). In the checklist.
- The practice uses a new phone's settings (the starting Quick Pick items,
  readings / Smart Quick Pick / Multi Pick / Undo off) so every step works the
  same for everyone — not the engineer's own presets. By design (2A: identical
  screens, predictable steps).
- A signed-in phone may show its own cloud tabs or plan line on the practice
  Jobs list — whatever its real Jobs list shows (those read the sign-in, not the
  practice). Harmless; nothing in the practice reaches the cloud.
- The sample certificate needs the report files, which the app keeps after its
  first online start; if they can't load, step 18 says so and moves on.
- ~~The "hold Quick Pick for presets" step only shows the grid~~ — V134.1: it
  takes the hold and opens the real preset sheet.

### Next after V133
V133 = the clean-up job, part 1 (Stage 12; Peter 17 Oct: 1A 2A 3A 4A 5A 6A).
supabase/v133-cleanup.sql: `phones` table (own rows only), `cleanup_settings`
(mode report|clear, marker_days ≥ 365, phone_days 730, min_version 133),
`cleanup_runs` (one line per run), `run_cleanup(check_only)` (security
definer, never deletes from sessions), pg_cron "patgo-cleanup" Sun 02:17 UTC.
Phone: sync.js `_syncPhoneReport` (PHONE_KEY). Harness 71 + M1224–M1239.
**D and E dropped for good** (Peter 17 Oct: "done enough … a fringe
feature") — not offered again unless he asks.
**Next:** Peter opens the cloud to a few testers (week of 19 Oct) while other
bits are built. Still to come for the clean-up job: R8 lapsed-account deletion
(after billing) and R7 7-year retention (nothing until 2033) — both need photo
FILES removed, which SQL can't do (Supabase blocks storage deletes from SQL):
that part is a server function. Then Stage 13 Stripe (pricing, Stripe account
first).

### V133 residuals (known, accepted)
- Held-back rule is by sign-in: a phone OLDER than V128 that was signed OUT
  when markers were cleared, and signs back in later, could send a deleted
  client/site/photo row back once. Nobody runs pre-V128 now; testers start on
  V133+. Job markers are never cleared, so jobs are not affected.
- A sign-in idle for more than 2 years (phone_days) no longer holds its
  account. V128+ phones protect themselves (the stale-phone check) anyway.
- Peter's own old browser sign-ins (Mac tests, Guest windows) hold his account
  until they report V133 or are signed out — the cleanup_runs line names the
  account. Harmless in report mode.
- Stage 16 carry: the minimum-version check before the first invite can now
  read `phones` (V133+ phones report; older ones show as "not reported").
- The job's notice "schema pg_temp does not exist, skipping" on a fresh
  connection is cosmetic.

### Next after V132
V132 = C — a long company name / address on the certificate's top-right
block (V119.1 residual). Checked first: it overflowed (wide logo: name past
~53 chars hit the logo; no logo: past ~72 ran off the page). Peter 16 Oct:
1A wrap onto right-aligned lines, title moves down; 2A room measured against
the logo actually drawn. report.js header band only. Harness group 70 (real
jsPDF) + M1215–M1223; 69f → 70f; M1176, M1212, M1213 retired. Welcome rolled.
**Next:** D (more focus stand-ins) and E (the 21 status banners) stay parked
for Peter's real-iPhone VoiceOver run-through. Then the clean-up job (server)
and Stage 13 Stripe.

### V132 residuals (known, accepted)
- A very long name AND address make the header taller, so the title and the
  details move down the page (1A — nothing is shrunk). Ordinary headers are
  unchanged.
- The company name / address fields still have no length limit; with wrapping
  none is needed.

### Next after V131
V131 = A — certificates count as exported (Peter 16 Oct: 1A 2A 3A 4A 5A, plus
the undo he asked for in the same round: 6B 7A 8A 9A). session.js
`jobDoneStatus` / `jobIsDone` (clean CSV OR certificate after locking — the
reminder's `jobPaperworkDone`) drive the nudge, badges and Status filter; the
nudge shows the jobs ('notdone', transient) — `bulkExportUnexported` retired;
"Mark as not exported" on the "Already exported" pop-up (CSV mark only).
Pruning and the pop-up stay CSV-only. Harness group 69 + M1191–M1214; 68f →
69f; M1154, M1175, M1190 retired. Welcome rolled.
C shipped V132 (above).

### V131 residuals (known, accepted)
- A certificate made BEFORE locking still doesn't count (1A — the reminder's
  rule). Lock, then make the certificate. An unlocked job with a certificate
  shows "Reopened since certificate" even if it was never locked — the phone
  can't tell the two apart (unlocking drops the lock time).
- A job locked before V100 has no lock time, so its certificate never counts:
  export its CSV, or unlock and lock it again and remake the certificate.
- "Mark as not exported" is only on the "Already exported" message (6B), which
  shows for an UNLOCKED job with a CSV export. A locked job exported by mistake
  shows ✓ Exported until it is unlocked and opened.
- The export mark, lock time and certificate time ride the job to the cloud
  (the whole job is sent), so a job's ✓ follows it to another phone — and
  "Mark as not exported" is a change to the job: signed in, the next sync sends
  it, as an export does.
- "Still to export" is a transient filter, like "Locked, not exported": a
  reload returns to All.

### Next after V130
V130 = housekeeping + an honest Privacy note — the stragglers round, part 1
(Peter 16 Oct: order "housekeeping + B, then A, then C; leave D and E";
spec 1B 2A 3A 4A 5A). DEFENCE 3: mutate.js `anchorCount` — the runner aborts
an anchor found other than exactly once; 01l checks every anchor in the
normal run (on the clean tree via `PATGO_PRISTINE`), 01m guards the runner.
PAT_AUTH_KEY and ICONS_CLASSIC_KEY gone (config, load(), reset rows); 15e and
53b pin that nothing names them. `_MGR_RETURN_VIEWS` without settingsBackup.
About → Privacy rewritten (4A). Photos sheet: scroller on its body, buttons
pinned. Harness group 68 + M1177–M1190; M135, M873, M1107 retired; 67f → 68f;
M82 drops 15j. No welcome (5A).
**Next: V131 = A — certificates count as exported** for the Jobs list's
"N jobs not yet exported" line and the ✓ badges (V100 residual; Peter works by
PDF). Own spec round — the main question is what tapping the nudge does now
(today it bulk-exports CSVs). **Then C** — a long company name / address on
the certificate's top-right block (V119.1 residual): check first, fix only if
it overflows. Parked (Peter, 16 Oct): D (more focus stand-ins) and E (the 21
status banners) — wait for Peter's real-iPhone VoiceOver run-through.
Then the clean-up job (server) and Stage 13 Stripe.

### V130 residuals (known, accepted)
- The Privacy note is a stopgap (4A): it says nothing about where the cloud
  is held or for how long — the privacy + processor terms replace it.
- A phone that somehow skipped V79–V129 keeps its old mock-key or emoji-switch
  entry in storage for good. Inert: nothing names them; Factory reset removes
  every key regardless. No real phone is in that state.
- A mutation aimed at harness/mutate.js must start its `from` with "\n" (MAP
  harness note) — its own definition is otherwise a second copy and it aborts.
- The Photos sheet change is visible only with enough photos to scroll: the
  title now stays put and the two buttons stay below the photos.
- Found in V130's per-file run, PRE-EXISTING (survives on V129 too): M433
  (removal does not sync first) SURVIVED — 28d counted pull page requests, and
  a background sync started by the test's own edit lands one during the wait.
  28d now proves ORDER (the pull's page before the job's check read); M433
  caught. If Peter's V128/V129 sweeps showed it, this is why.

### Next after V129
V129 = VoiceOver's leftovers from V123 (Peter 15 Oct: 0B, then 1A 2A 3A 4A —
"finish off the straggly bits so we are tidy before server code and stripe").
feedback.js `FOCUS_STAND_INS` / `focusStandIn` / `focusControl` (MAP rule 24);
report.js quick-adjust chips wired by id, focus back after `rebuild(qaAction)`;
aria-pressed on six pick-one groups (+ `_applyBugSheetDOM` in place). Harness
group 67 + M1156–M1176; 66f split (release checks → 67f); M1072, M1137 retired.
Next (Peter, 15 Oct): a STRAGGLERS round — gather the small open items from the
residual lists below into one short queue and let Peter pick which are worth a
release, before the clean-up job (server) and Stage 13 Stripe. V123's
VoiceOver leftovers are closed by V129 (its residuals list below is history).

### V129 residuals (known, accepted)
- Not yet heard with VoiceOver on a real iPhone by Claude: the harness proves
  where focus goes and what is pressed; headless Chromium proved the chips and
  the form heading take focus with no scroll and no console errors. Peter's
  run-through (4A) covers V123 and V129 together.
- Stand-ins exist for + New job and its Cancel only. Any other control that
  swaps itself for something else on the same screen still lands on the screen
  title; add it to `FOCUS_STAND_INS` when found.
- The sort / status / lock filters are native lists (select) — VoiceOver reads
  their value already; untouched.
- Own certificate colours (no theme matching): no theme chip pressed — correct,
  none is chosen.

### Next after V128
V128 = the stale-phone check (Stage 12, the clean-up job's phone side; Peter
14 Oct: 0A 1A 2A 3A 4A 5A). sync.js section "the stale-phone check" (MAP rule
27); snapshots.js `snapshotBeforeCloudCheck`. Harness group 66 +
M1109–M1154; 65f split (release checks → 66f); M1060, M1106 retired; nine
anchors re-aimed (M149 M164 M205 M207 M208 M265 M266 M376 M463); fixtures in
17 18 19 20 21 23 38 write up-to-date states (fixture.js `syncCurrent`).
Next candidates: the clean-up job itself (server — an Edge Function on a
schedule; own spec round, with the questions below); Stage 13 Stripe (needs a
Stripe account and a price from Peter); V123's VoiceOver leftovers; Tutorials
(PN); About/Privacy once the terms exist.
For the clean-up job's spec round (raised by V128):
- It must never clear a marker younger than SYNC_MARKER_DAYS (365) — the
  phone's 274-day check depends on it. Keep the number in config.js and the
  server job together.
- R7 (7-year retention): to a stale phone, a row removed for age looks
  deleted, so an unchanged job that old would be removed from the phone too.
  Decide whether retention should reach phones (probably yes — 7 years) or
  leave a marker instead of removing the row.
- A phone that knows nothing in the cloud (a restored backup on a new sign-in,
  a reset sync state) re-sends every job it holds; after markers are cleared,
  a deleted job comes back without a question (today its marker asks). Options:
  keep job markers for good (they are ~200 bytes), or refuse such uploads
  server-side.

### V128 residuals (known, accepted)
- An account whose EVERY row was deleted elsewhere over a year ago reads as an
  empty list, which the check treats as a failed read: that phone's sync waits
  with "That check couldn't finish". Way out: Reset this phone (sync starts
  fresh). Rare by construction; safer than believing an empty answer.
- A photo still on this phone whose cloud row is gone stays noted as in the
  cloud (1A: nothing removed from the phone, never re-sent). It shows as safe.
- A job gone from the cloud while open on screen waits until it is left, like
  any delete arriving (7A).
- A run held open by a question uses the check it made up to an hour earlier.
- The server job does not exist yet, so on today's servers the check only
  ever finds rows missing for some other reason (none expected). Proven
  against the fake server and in a browser, not on a real iPhone or real
  Supabase — the keyset paging relies on Postgres ordering text the same way
  for ORDER BY and `>` (it does, by one collation).

### Next after V127
V127 = your plan: trial end, grace, the lock (Stage 12, R8 phone side; Peter
14 Oct: 0A 2A 3A 4A 5B 6 8B 9A 10A 11A). New optional file plan.js; the gate
on every way to start a job, log a test or make a certificate (MAP rule 26).
Harness group 65 + M1073–M1108; 64f → 65f; M1030 (V124's About line) and
M1071 (V126's welcome) retired.
Decided for launch (Peter, 14 Oct — roadmap): the product site requires an
account AND a subscription, through Cloudflare; the free GitHub site is
removed or made private. Those close the two holes below.
Next candidates: Renew to a payment page (Stage 13 — Stripe; set
PLAN_RENEW_URL, and the webhook sets `active`/`lapsed`); server-side refusal of
a lapsed account's uploads (RLS — with Stage 13); the account-required gate on
the product site + sign-up (launch release); V123's VoiceOver leftovers;
Tutorials (PN). Outstanding (Peter): Supabase Pro + production project, ICO
fee, privacy + processor terms.

### V127 residuals (known, accepted)
- Signing out removes the lock (no account, no plan), and the free site needs
  no account. Closed at launch, not before (Peter's launch plan above).
- The phone enforces it; the database does not yet. A locked phone still syncs
  (on purpose: nothing new can be logged, and the cloud copy stays current);
  a modified copy of the app could log and upload. Stage 13 adds the server
  side.
- Locked also refuses EDITING an item through the entry screen (saveItem is
  the backstop for both). Job settings edits, deletes, moves to an existing
  job, CSV import and Restore are not refused — they are the engineer's own
  records coming and going.
- No sheet at the moment of locking: the Jobs list line says it, and any
  refused tap explains. The logging screen itself shows no line — opening a
  job looks normal until a button is tapped.
- The start-up sheet waits for a quiet Jobs list: a phone with no jobs opens on
  the New job form, so its sheet shows at the next return to the front.
- Renewing lifts the lock at the next plan read: every start online, back to
  the front after 6 hours, sign-in, or Settings → Cloud → Check connection.
  Until Stripe, that is Peter setting the plan in Supabase.
- A phone that has never read its plan (signed in on V126, offline since) has
  no record and no lock until its first read online.
- Not run on a real iPhone by Claude. Renew's email uses the same mailto
  route as the problem report (proven on iOS).

### Next after V126
V126 = a first visit never reloads itself (Stage 12; Peter 14 Oct, 0A 1A 2B).
The V125 residual below, fixed: a service-worker takeover reloads only a page
that loaded under a worker or asked for the update (boot.js
`updateShouldReload`); sw.js still claims. One-line What's new (2B). Harness
group 64 + M1061–M1072; 63f → 64f (exportall's standing checks kept as 63g);
M992 retired; the service-worker stub now records and dispatches listeners
(`opts.navigator.swController` = loaded under a worker). Next candidates
(unchanged): lapse handling (R8 — needs an SQL decision on what "lapsed" means
before Stripe: the app only reads `plan` / `trial_ends_at`); V123's VoiceOver
leftovers; Tutorials (PN). Outstanding (Peter): Supabase Pro + production
project, ICO fee, privacy + processor terms.

### V126 residuals (known, accepted)
- Not run on a real iPhone by Claude. Headless Chromium with a real service
  worker: V125 navigated twice on a first visit, V126 once (controlled, no
  console errors); Refresh after an update on a first-visit page reloaded into
  it; an update put in from a second tab reloaded both tabs.
- A first-visit page left open while ANOTHER tab puts an update in is not
  reloaded (it never loaded under a worker and never asked). It keeps running
  the page it fetched from the network; its next open is on the new version.
  Two tabs of a brand-new install, one updating within the same visit — rare.

### Next after V125
V125 = Export everything (Stage 12; Peter 14 Oct, 0A 1A 2A 3A 4A 5A 6A).
Settings → Backup & Restore, top: one zip of everything on THIS phone — backup,
a CSV per job, the certificates already made (same numbers, none issued), the
photo file (tick, on), Read me. Not "exported" (5A); a completed save resets
the backup reminder. New file exportall.js (optional). Harness group 63 +
M1032–M1060; 62f → 63f; M968 retired; group 08's clock leak fixed. **V125 is
the first release delivered by V124's self-update** — the deploy step is "open
the app on the Jobs list and leave it a few seconds". Next candidates: lapse
handling (R8 — the warning and export offer; the deletion itself is the
scheduled clean-up job, server code); V123's VoiceOver leftovers; Tutorials
(PN). Outstanding (Peter): Supabase Pro + production project, ICO fee, privacy
+ processor terms.

### V125 residuals (known, accepted)
- Not run on a real iPhone by Claude. Headless Chromium made a real zip with
  real jsPDF certificates (see the handoff); the Files app, the share sheet and
  iPhone memory are Peter's checklist.
- The photo file is built whole in memory, as Export photos always has been. A
  phone with a very large photo store could run short: untick photos and use
  Export photos on its own; a streamed photo folder could come later.
- Certificates are rebuilt from the job and the report settings as they are
  NOW. A job edited after its certificate went to the client comes out as it is
  now, with its old number. Said in the Read me.
- Certificates show only the photos on this phone (4A); cloud-only photos are
  not fetched.
- Store-only zip, no Zip64: past 4 GB or 65,535 files it refuses ("Couldn't
  make the file") rather than writing a broken one. Far beyond any real phone.
- A big file may be too large to email — the ready sheet says to save it to
  Files or a cloud drive.
- ✅ FIXED V126. Found in the V125 browser check, PRE-EXISTING (not V125): on the very first
  visit the new worker's `clients.claim()` fires `controllerchange`, and
  boot.js reloads the page once (~1 s in, during the setup wizard). Harmless so
  far — nothing is typed yet — but a fresh install shouldn't reload. Fix idea:
  only reload on `controllerchange` when the page already had a controller
  (or after a SKIP_WAITING we sent). Its own small release; needs a spec line.

### Next after V124
V124 = friendlier updates (Stage 12; Peter 14 Oct, 0A 1A 2A 3A 4A). The app
looks for a new version on launch, on every return to the front (once a minute
at most) and hourly while in use (riding a touch — no timer); it puts the
update in by itself only at the safe moment on the Jobs list (MAP rule 25),
elsewhere the banner names the version and the engineer taps Refresh. No
switch (4A). Harness group 62 + M993–M1030; 61f → 62f; M955 retired. **From
V125 the deploy step is "open the app on the Jobs list and leave it a few
seconds"** — V124 itself arrives the old way. Next candidates: "Export
everything" (backup + every CSV + every certificate PDF — the base for lapse
handling, R8); V123's VoiceOver leftovers. Outstanding (Peter): Supabase Pro +
production project, ICO fee, privacy + processor terms.

### V124 residuals (known, accepted)
- Not seen on a real iPhone by Claude. The harness proves when it looks and
  when it reloads; headless Chromium proved the real worker answers its version
  and the banner names it (see the handoff). What iOS does on return from the
  background is Peter's checklist from V125 on.
- GitHub Pages' CDN keeps a file for ~10 minutes, so a look in the first
  minutes after a commit can still be told "nothing new". The deploy wait stays.
- × hides the banner until the next update is found or the app reloads; the
  update itself still goes in at the safe moment (2A).
- A search typed on the Jobs list blocks the self-update until it is cleared
  (nothing typed is ever thrown away) — the banner still shows.
- If SKIP_WAITING is sent and the reload never comes (the worker died), the
  safe moment won't try again this app session; Refresh still works.
- Harness: group 08's fake clock (`Date.now` replaced for the scanner tests)
  is never put back, so every later group runs on it — found when 62's "never
  touched" (0) read as 2 s ago. 62 and boot.js now treat 0 as never; group 08
  should restore the real clock (its own small harness fix, no app change).
  **Fixed V125**: group 08 restores the real `Date.now` (try/finally); 63a checks.

### Next after V123
V123 = VoiceOver keeps its place — focus after a redraw (V120 4A; Peter 14 Oct,
1A 2A 3A 4A). Same screen → the tapped control; new screen → its title
(#screen-title, MAP rule 24); sheet opens → its title; closes → its opener;
anything that logs → the screen title, never the button (2A). Quick Pick and
Multi Pick tiles carry aria-pressed (4A). Harness group 61 + M969–M992;
60f → 61f. **Stage 12's accessibility work is complete.** Outstanding (Peter):
Supabase Pro + production project, ICO fee, privacy + processor terms.

### V123 residuals (known, accepted)
- Not checked with VoiceOver on a real iPhone by Claude: the harness proves
  where focus goes; headless Chromium proved no ring after a tap, a ring for a
  keyboard Tab, no scroll jump, no console errors. Peter's checklist covers
  VoiceOver itself. If iOS reads the title but not "Logged: …" after PASS, the
  next step is a longer announcer delay (60ms now).
- + New job opens the form in place and its button goes, so VoiceOver lands on
  the Jobs title (control gone → heading), not on the form's "New job" heading.
  One swipe down. Could special-case later.
- The certificate preview's quick-adjust chips rebuild the preview in place
  (report.js rebuild), outside render(): focus is not put back on the chip.
- Other pick-one buttons (status filters, segment switches other than Text
  size) still show their chosen state by colour only — 4B, not taken.
- Android Chrome focuses a tapped button natively; a REFUSED PASS (no type or
  location) leaves focus on PASS there, as before V123 (no redraw happens).
- A redraw nobody tapped for, with nothing focused before it (a sync, a
  timer), leaves VoiceOver where it is — deliberately.

### Next after V122
V122 = Sessions are now called Jobs — the V114 4B rename (Peter 14 Oct,
1A 2A 3A 4A 5A). Every visible word says job; list "Jobs", "+ New job",
"Job settings" (button and screen); nameless jobs "Job N", saved names left
alone; "session" kept as a hidden search word + one Glossary line. Code names,
storage keys and the cloud table unchanged (MAP rule 23). Harness group 60 +
M956–M968; M907 retired. **Next: V123 focus after redraw** (V120 4A — agreed
14 Oct to follow straight on; the screen headings it lands on are now final).
Outstanding (Peter): Supabase Pro + production project, ICO fee, privacy +
processor terms.

### V122 residuals (known, accepted)
- Jobs already saved as "Session N" keep that name (4A) — it shows on the
  list, the certificate and the CSV file name. Rename by hand in Job settings.
- Code comments still say session in many places (not visible; left alone).
- The About changelog's V122 line and the What's new sheet say "Sessions are
  now called Jobs" — allowed history (60a ALLOW, 51e EXPLAINS); the About line
  rolls off at V125, and 51e's allowance should go with it.

### Next after V121
V121 = the accessibility pass, part 4 of 4 — the last: text size (Peter 14 Oct,
1A 2A 3A 4A 5A). Settings → Theme & Sound → Text size: Standard / Large /
Larger (100/115/130%); Standard identical to V120 (px → rem proved
byte-for-byte). Pinch-zoom left off (4A). Harness group 59 + M937–M955; 58f's
release lines → 59f; M897 retired. **The accessibility pass is done.** Next
candidates: the focus-after-redraw release (V120 4A) if wanted before launch;
the Jobs rename (4B). Outstanding (Peter): Supabase Pro + production project,
ICO fee, privacy + processor terms.

### V121 residuals (known, accepted)
- Not seen on a real iPhone by Claude: measured in a headless phone-sized
  browser (see the handoff's entry-screen check). Peter's checklist covers it.
- Five symbols stay fixed (the ticks on job/photo tiles, the photo ✕, the
  polarity box) — they sit in fixed-size circles.
- The iPhone's own Settings → Larger Text is not followed (1A chose the in-app
  setting; 1C "Match my iPhone" was the offered alternative if wanted later).
- Pinch-zoom still blocked (4A). If ever allowed: the notes box and two
  other 15px fields must go to 16px first or iOS zooms on every tap into them.
- Fixed-height boxes (date fields 44px, icon buttons 40–44px) don't grow; text
  inside them grows. Measured fine at Larger on the screens checked.

### Next after V120
V120 = the accessibility pass, part 3: screen readers (Peter 13 Oct, 1A 2A 3A
4A 5A). Invisible to sighted use (Peter asked; confirmed). One announcer
(#sr-announcer) speaks every pop-up; one item logged speaks "Logged: Kettle,
pass. Item 14."; 74 unnamed fields named; the job-select ticks read; en-GB.
Harness group 58 + M917–M936; 56e and 57d's release lines → 58f; M916
retired. **Next: V121 text size and zoom** (fixed px + `user-scalable=no`), the
last of the pass. Outstanding (Peter): Supabase Pro + production project, ICO
fee, privacy + processor terms.

### V120 residuals (known, accepted)
- **Focus after a redraw (4A, backlogged):** most taps rebuild #app, so
  VoiceOver's cursor goes back to the top of the screen. Fixing it means
  putting focus back on the tapped control or the screen heading on every
  render — touches nearly every screen; its own release, after V121.
- Not checked with VoiceOver on a real iPhone by Claude — the harness proves
  the markup and the announcer's timing, not what iOS reads. Peter's checklist
  covers it; if the polite announcer is not read on logging, the next step is
  a longer delay before the text lands (60ms now), not role="alert".
- The 21 role="status" banners rendered inside #app (backup, reminders, lock,
  calibration…) are unchanged. They are rebuilt with the screen, so VoiceOver
  may read them on arrival or not at all; they were not reported.
- The 143 existing aria-labels were not re-audited one by one — the V120 sweep
  (58e) checks every FIELD has a name, not that every existing label is apt.
- Batches speak only the existing pop-up ("Added 5 items — Desk PC setup",
  "Added 3 more") — no type or result detail (2A covered single items).
- The Quick Pick buttons' selected state (which type is chosen) is shown by
  colour only; not in 3A's scope (fields + ticks). Candidate for the focus
  release.
- Tour example screens: role="img" with "Example screen: <slide title>"; their
  pretend fields are excluded from 58e by class (tour-input).

### V119.1 hotfix (13 Oct, Peter 1B 2B 3A 4B)
CSV Site column always just the site (1B); certificate details wrap in their
column (3A); file name {site} unchanged (2B). Cache pat-v119-1 only. Harness
group 57 + M910–M916. **V120 is still the screen-reader pass** (4B), then V121
text size.
Residuals: with the Client column hidden (default) the client is not in a CSV
at all, and re-importing that file makes a site with no client (1B, accepted —
show the Client column to keep it). A single unbroken word wider than its
column is split mid-word by jsPDF (rare). The company name/address block at the
top right of the certificate was not changed — not reported, not checked for
very long text.

### Next after V119
V119 = the accessibility pass, part 2: coloured words (Peter 13 Oct, 1A 2A
3A 4A 5A 6A 7A). The pass is now four releases (1A): contrast greys (V118),
coloured words (V119), **screen-reader announcements and labels (V120), then
text size and zoom (V121).** Words have their own shades (--pass-word /
--fail-word / --accent-word); buttons, icons and borders keep --pass / --fail
/ --accent (2A, 3A). Harness group 56 + M898–M909; 55e → 56e. The six V118
known defects are gone (55d no longer measures button colours as text). No
welcome (6A). Outstanding (Peter): Supabase Pro + production project, ICO fee,
privacy + processor terms.

### V119 residuals (known, accepted)
- Icons and large display text keep the brand colours (3A): the dark Settings
  icons are 3.98:1 on cards (icons need 3:1). Listed in harness 56's
  BRAND_KEPT; a new icon on a brand colour must be added there or 56c fails.
- Light green words on the yellow warning card are the tightest pair, ~5.0:1
  (fine). Dark red and blue are tightest on the grey note box / blue tint, 4.63.
- The PASS button itself (V118 4C) is unchanged: dark 2.28:1, accepted.
- Text size (fixed px, user-scalable=no) — V121, last of the pass.
- ~~M82's 15j tag (V118 residual) still stands~~ — dropped V130.

### Next after V118
V118 = the accessibility pass, part 1: contrast (Peter 13 Oct, 1A 2A 3A 4C 5A
6A, then A). Both greys pass 4.5:1 on every text surface in both themes (light
#545c6b / #656e7c, dark #bcc6d5 / #a2aebe); the PASS button left (4C); no
welcome (5A); harness group 55 measures every text colour from the live
stylesheet (6A); M891–M897; 54e → 55e. **Next: the rest of the pass (2A) —
screen-reader announcements and labels, then text size and zoom — plus the
coloured words below (A: "V119").** ⚠ For V119's round: the coloured words
are contrast and the announcements are markup — one concern each says two
releases; offer the split. Outstanding (Peter): Supabase Pro + production
project, ICO fee, privacy + processor terms.

### V118 residuals (known, accepted)
- ~~Coloured words short of 4.5:1~~ — FIXED V119 (word shades, group 56).
- The PASS button itself (4C): white on green is 3.30:1 light (passes for its
  large bold label) and 2.28:1 dark (doesn't). Accepted by Peter.
- ~~`var(--muted)` used twice, never defined~~ — FIXED V119 (5A, now --text-muted).
- Text size: every font size is fixed px (302 of them) and index.html's viewport
  has `user-scalable=no`, so neither the iPhone's Larger Text nor pinch-zoom
  works. That is the last release of the pass (the entry screen's room is the
  risk).
- ~~M82's tags say 15j, but 15j cannot see its break~~ — TAG DROPPED V130 (09w and
  the release group catch it).

### Next after V117
V117 = the Settings page split (Peter 12 Oct, 1A 2A 3A 4B 5B): Report Settings
→ Company & Branding + Certificate Content; Quick Pick Items left alone (2A); the
preview's Edit report settings still opens the first half (3A); a short welcome
anyway (4B); the Logging group's 8 rows left as they are (5B — offered as a
second group split, declined). Harness group 54 + 21r, M879–M890; 51g retired;
53d → 54e. **Next: the rest of Stage 12.** Outstanding (Peter): Supabase Pro +
production project, ICO fee, privacy + processor terms (and the About/Privacy
wording from them).

### V117 residuals (known, accepted)
- The certificate preview's "Edit report settings" and the Reports list's
  settings button both open Company & Branding (3A); what to include is one row
  further, on Certificate Content.
- The Logging group still has 8 rows (5B). If it grows again, the split offered
  in the V117 round was: Quick Pick & Lists / Testing Tools.
- The two halves share the Save button's id and action (settings-report-save);
  49a counts it twice on purpose.

### V116 residuals (known, accepted)
- ~~`ICONS_CLASSIC_KEY` stays in config.js only for load()'s delete~~ — REMOVED V130
  (2A), with PAT_AUTH_KEY, both reset rows and both clean-ups; 53b / 15e pin it.
- 52c's "the sweep can see an emoji" control now swaps icon() for a stand-in
  (it used the switch). Same proof, no app code needed for it.

### Earlier: V115
V115 = line icons app-wide (spec 8A 9A 12A 13A 14B, round 1A 2A 3A 4A): one new
file icons.js + icon(name); every emoji used as an icon is a Lucide line icon;
Settings icons in --accent; button rule applied; banners icon-first outside the
escaped words; empty states grey, wizard blue; temporary Classic emoji switch;
welcome rolled; harness 52, M851–M872.
V116 removed the Classic emoji switch (above).

### V115 residuals (known, accepted)
- ~~Classic emoji icons (14B) approximate~~ — moot: switch removed in V116.
- Delete buttons not on the spec's list stay plain words: the photo strip's
  small Delete on each thumbnail, Overview's "Delete selected", and red final
  confirms (as the rule says). Trash added to In the cloud's Delete… and Manage
  Photos' preview Delete, the same kind as the listed ones.
- The share glyph is Lucide's current share (path drawn slightly differently
  from the v10 copy) — same shape at phone size.
- Descriptions draws a pencil per row (~140 small SVGs, ~45 KB of markup on that
  page). Fine on a phone; if it ever feels slow, one shared <symbol> + <use> is
  the fix, not a return to emoji.
- The walkthrough (tour) mock screens follow the new icons, including the
  backup mock's arrows.
- Plain-text places keep characters by design: PDF certificate (polarity ✓ →
  "Yes" on the PDF), CSV, copied/emailed text, tooltips, confirm messages.

### ~~V115 — line icons across the whole app~~ — SHIPPED IN V115 (locked spec kept below for reference)
Decisions: 8A line icons replace emoji used as icons, whole app, own release ·
9A/12A Lucide (ISC; keep its licence notice in the icons file) · 10A V114 changed
no icons · 13A Settings-list icons in --accent (#2563eb / #3b82f6) · 14B a
"Classic emoji" switch in Theme & Sound for V115 ONLY — remove at V116 unless
someone needs it.
Build: one new file (icons.js) holding the SVGs used + one helper (icon(name));
every icon goes through it, so 14B is the helper choosing emoji vs SVG. Icons
take currentColor. Button words never change meaning; icons aria-hidden. The
existing SHARE_ICON_SVG (csv.js) is already Lucide-style — fold it in. New file
→ index.html + sw.js ASSETS, load order before render files.
Button rule (from the V114 round): icon only where it helps spot the action —
upload = export/share/upload, download = import/download, cloud-download =
from the cloud, trash-2 = delete/remove/clear, rotate-ccw = reset to defaults,
rotate-cw = rebuild/run again, refresh-cw = refresh/reload; a button that opens
another page shows that page's icon + chevron-right; everything else plain
words; red final-confirm buttons plain. Changes vs today: "＋ New" → "+ New";
"✎ Rename" → plain; CSV Columns Reset gains its icon; Backup & Restore and photo
export/import arrows swapped (export = upload, import = download); Jobs on This
Phone / Manage Photos (×2) / Retest Reminders / Account buttons gain ›; Clients'
three Delete + Report templates Delete + Manage Photos / Cloud Storage Delete gain
trash; Manage Photos "Download" gains cloud-download; "Save current settings as
template…" loses its icon (💾 is Backup's); "Remove from phone" stays plain.
Swap list (emoji → Lucide), from the "PATGo Icon Sets" comparison page:
Pages: ☁️ cloud · 👤 user · ⚡ zap · ⚠️ triangle-alert · 🔬 gauge · 🧰 layers ·
📝 list · 🏷️ scan-barcode · 📄 file-text · 📊 table · 🏢 building-2 · 🔔 bell ·
🎨 palette · ⏰ alarm-clock · ⚙️ settings · 🧮 calculator · 💾 database (Data
group) / save (Backup & Restore) · 📦 hard-drive · 🧹 eraser · 🖼 images ·
🛡 shield-check · 🔁 arrow-left-right · ℹ️ info · 📖 book-open · ✉️ mail ·
🔄 refresh-cw · 💳 credit-card.
Actions: ⬆ upload · ⬇ download · ☁ cloud-download · 🗑 trash-2 · ↺ rotate-ccw ·
↻ rotate-cw · ✎ pencil · ✍ signature · ＋ plus · ↶ undo-2 · ⎘ copy ·
📋 clipboard-list · 📷 camera · 📍 map-pin · 🔍 search · ⏭ skip-forward · share.
Marks: 🔒 lock · ✓ check · ✗ ✕ x · 🕘 history · ⏱ timer · 💡 lightbulb ·
▦ layout-grid · 📱 📲 smartphone. One-offs: 🐞 bug · 🧭 compass · ✨ sparkles ·
🎉 party-popper. Chevrons: ‹ chevron-left · › chevron-right · ▾ ⌄ ▼ chevron-down
· ▲ chevron-up. Stay as text: → in sentences, ≤ ≥ Ω, ● ○ (bug sheet dot);
PASS/FAIL colours unchanged.
Spec round (12 Oct, Peter "1A 2A 3A 4A"): 1A icon at the start of a banner or
note, same colour as the words (toasts had none); 2A empty states large line
icon, soft grey; 3A wizard large line icons in PATGo blue; 4A "Classic emoji
icons" with "Shows the emoji the app used before V115. Temporary — it goes in a
later update unless you need it."

### ~~Settings pages too crowded — split before launch~~ — DONE V117 (Report Settings split; Quick Pick Items left, 2A)
Report Settings (long: company, logo, colours, file name, numbers, templates,
what to include, retest, declaration, signature) and Quick Pick Items (presets +
items + Smart Quick Pick). Structural release of its own (no behaviour change),
next — V117 (Peter, V116 3A), before launch. 5A: Smart Quick Pick's switch stays with Quick Pick
Items whatever the split.

### V114 residuals (known, accepted)
- ~~The app outside Settings still says session in places~~ — DONE V122 (every
  visible word says job; Settings, the Glossary and 51b followed).
- ~~About → Privacy still says the app makes no network calls~~ — STOPGAP V130 (4A):
  honest about the cloud copy and the update check; the terms still replace it.
- The About changelog's V112 line says "Edit session" — history, left as written;
  it rolls off at V115.
- Data defaults (item types, fail reasons, CSV column headers) keep their Title
  Case — they are the engineer's own lists and certificate text, not Settings
  headings.

### From the V113 round (Peter, 11 Oct) — for Stage 16/17, not before
- **Office editing.** Owner, Team leader and Office will need to EDIT others'
  jobs. Not in V113 (6A): it arrives with the audit trail (Stage 17), as one
  more rule; nothing in V113's structure changes for it.
- **Engineer mistakes.** Engineers can't delete from the cloud in a team (12A).
  Peter: "if they make a mistake with a job we may have to think about that" —
  an engineer can still edit their own job (fix items, remove items); only
  wiping the whole job / a photo is refused. Stage 16 decides what the phone
  does when refused (likely: off this phone only, cloud copy kept, the owner
  told) and whether a single photo removed mid-job counts as a wipe.
- **Assigned, pre-filled jobs.** Peter envisages office / team leader / owner
  creating jobs, part pre-populated, and assigning them to engineers — the
  roadmap's Stage 17 "office-prepared jobs". Needs: a job created by one person
  for another (today a row's writer is its owner — `user_id`), so the spec round
  decides whose `user_id` an assigned job carries and how the engineer gets to
  write to it.
- **Leavers (R5).** A leaver's membership is ended, never their login deleted
  (they may have their own business — 3C). Their phone still holds local copies
  of the business's jobs and its sync will be refused for them: Stage 16 decides
  what that phone does.

### From the V112 browser test (11 Oct) — backlogged at 6A
- **About / Privacy wording is out of date.** About says "Nothing is uploaded,
  no account needed"; Privacy says "The app makes no network calls after the
  initial install". Both untrue for a signed-in (sync) user. Write the final
  wording from the privacy + processor terms (outstanding), not twice
  (render-help.js, settings About).
- **CSV import "Merge into existing session" appends every row, duplicates and
  all** (csv.js `commitImportedSession`): importing the same file twice doubles
  the job, with repeated asset numbers on the certificate. At least warn ("N of
  these match items already in this job").
- Smaller, seen in the same test (not specced): the job card's "3 fail" wraps to
  a second line at 375 px; copying the CSV to the clipboard marks a job
  "Exported"; the branding step's company placeholder reads "e.g. Birchley PAT
  Services"; the merge does not update the job's `lastModified`; tapping outside
  the Site notes sheet discards typed notes without asking (2B, not taken);
  Settings Save buttons sit at the bottom of long pages (1C — fold into the
  settings menu redo).

### V113 residuals (known, accepted)
- Only the database knows about businesses. The phone has no team screens, no
  "working for…" choice (Stage 16), and every person has exactly one business.
- A refused cloud delete (an Engineer in a business of more than one) has no
  phone handling yet: the sync would report an error each run. Cannot happen
  until Stage 16 adds a second member.
- An Engineer can still empty their own job by EDITING it (remove its items);
  only the delete itself is guarded. Edits of that kind are the audit trail's
  job (Stage 17).
- Records (clients, sites, presets…) are not delete-guarded: they are the
  person's own lists until Stage 16 makes clients and sites the business's.
- A photo FILE's delete is judged by its photo row's business, or the person's
  default business when no row names it (paths carry no business). Fine while
  everyone has one business; revisit with "working for…".
- The isolation test does not add photo files (Supabase won't let SQL remove
  them), so the file DELETE guard is checked by v113's O9 (the rule is there)
  and was proved in a local Postgres, not by isolation-test.sql.
- Each read rule calls a small database function per row. Fine at today's
  volumes; Stage 12/13 should measure a big account's pull on Pro.
- A login with no work left still leaves its (now empty) business behind when
  deleted — harmless; Stage 12's clean-up job can remove empty businesses.

### V112 residuals (known, accepted)
- The guard covers the on-screen Back arrow only. Leaving by "Refresh" on the
  update banner, or the app being closed, still drops unsaved typing (a
  standalone PWA has no browser Back; nothing else leaves these pages).
- On Report Settings the template sheets, logo and signature save instantly as
  before; Discard keeps them (they are already saved). Discard re-reads saved
  settings, so it also drops any in-memory-only report change made elsewhere
  before the page was opened (none known).
- Multi Pick's Quick Pick tile pickers are compared as shown; a value fixed up by
  the page's own clash rule (`mpQpPicked`) counts as a change, which it is.
- Group 49 fills boxes as the browser would (the stub does not parse values);
  the paint wiring itself is proved by 49b and by M797.

### V111 residuals (known, accepted)
- ⚠ A phone that never updates past V110 still reads owner-blind. Harmless
  while every business has one member; once Stage 16 lets a second member in,
  an Owner's V110 phone would pull the team's jobs as its own. Stage 16 (or
  Stage 13) needs a minimum-version check before the first invite.
- Upserts are checked for `onConflict: 'user_id,id'` only; that the row
  carries `user_id: uid` is left to the rules' write check (V113 keeps writes
  own-only, so a wrong owner is refused, not stored).
- 48 proves the phone against a server that applies NO rules (the widest read).
  The V113 rules themselves are proved only by `isolation-test.sql`.
- Photo FILES are fetched by path `{uid}/…` — already this account's own; no
  filter needed, and none is checked.

### V110 residuals (known, accepted)
- Every mutation now names its group (01k) — all 376 untagged ones were proved
  by running the named file alone with the break in place. Timed: the named file
  alone takes under a second for most (median 0.8 s, 90% under 2.5 s). Slowest:
  M132 (15x), ~60 s, because group 15 waits out timeouts — still no slower than
  the whole suite. M133 is tagged 15c, not the 45 file the search found first
  (45 catches it only by timing out, 3+ minutes).
- The register's reasons are a person's reading of the markup; 47 only checks
  each sheet has one. A listed sheet that later gains a list or user text passes
  until someone re-reads its reason (the register's header says so).
- The sheet finder reads `${var}` and helper calls one way only; a sheet whose
  scroller lives in a variable assigned in ANOTHER function would read as
  unmarked (fails safe — 47b goes red, it never goes green wrongly).
- Re-anchoring moved three mutations onto the copy their names describe
  (M150 the job upload, M263 the jobs pager, M300 the code box). The copies they
  used to break are now broken by nothing: `syncVerifyJobs`' error check
  (sync.js) and `settingsCategoryBlurb`'s locked line (render-settings.js);
  the records pager's dedupe is still M264's.
- ~~DEFENCE 3 (the runner refusing a repeated anchor) is still not built~~ — BUILT
  V130 (1B): runner aborts, 01l checks every anchor in the normal run.

### V109 residuals (known, accepted)
- The tab icon is checked by eye only (46c proves the file holds 16/32/48 and is
  wired and precached, not how it looks).
- The new home-screen icon reaches only phones that add PATGo to the home screen
  afresh; existing installs keep the icon they were given.
- `patgo-mark-128.png` (uploaded with the icon set, July) is not used by the app;
  left in place — it may serve the landing page.

### V108 residuals (known, accepted)
- Not yet tested on real phones or against the real database. The V108 SQL's own
  checks (B1–B5) and isolation 8d cover the server side.
- Sizes are approximate: a job is measured as its text (`doc::text`, the database
  stores it compressed); photos at full size, previews (~10 KB each) not counted;
  the deleted-marker rows (~200 bytes each) not counted.
- Photos with no live job (a crash mid-delete, a phone that never synced again)
  count in the photo total but belong to no job in the list; Manage Photos →
  Look in the cloud → "Photos with no job" finds them.
- Biggest jobs are judged by the job plus its photos; a job brought onto the phone
  since the read moves to "on this phone" at once (worked out at draw time).
- Reads every open: ~50 bytes a job + one row per job with photos. At SYNC_CLOUD_MAX
  (20,000 jobs) it says the totals are from the first 20,000.
- A delete from Cloud Storage re-reads after the follow-up sync run; if that run
  fails to remove the photos, the figures still count them (honest), and the next
  run removes them.
- ~~Placement: a link from the cloud tab~~ — DONE in V109 (2A, 3A: both ways in).
- Harness 25l failed once while the mutation probe ran under heavy load (M753's
  run; the same mutation re-run alone: 45i only). Green on every plain run —
  a timing sensitivity to watch in the full sweep.

### V107 residuals (known, accepted)
- Not yet tested on real phones (two-phone: delete on one, the other syncs).
- Order is rows first, photos second. A closed app or lost signal in the moment
  between the job update and the bookkeeping leaves that job's photos in the
  cloud with no job; Manage Photos → Look in the cloud → "Photos with no job"
  lists them for Delete everywhere.
- A phone that had CHANGED a deleted job and answers "keep this phone's copy"
  keeps its items, not its photos — the cloud photos were deleted, and that
  phone's rows pull removes its local copies as it does after any delete
  everywhere today.
- The review's counts come from the list as last read (⟳ Refresh re-reads).
- Deleted jobs and photos leave a small "deleted" marker row each (~200 bytes)
  so phones that were offline learn of it — see "Cloud — clear old delete
  markers" below.

### Cloud — "Save a backup file of these first" before a cloud delete (V107 5B — backlog only, NOT on the roadmap)
Peter, V107 round: put in the backlog, not the roadmap, so it doesn't delay
launch. A button on the cloud delete review that downloads the chosen jobs and
saves them as a backup file. Needs every job's contents downloaded (egress, R17)
and a backup writer for jobs that aren't on the phone.

### Cloud — clear old delete markers (Peter's question, V107 round) — belongs in Stage 12's clean-up job
Every delete leaves a marker row (jobs: emptied doc, deleted true; photos: the row,
deleted true — the files themselves are removed). ~200 bytes each; 10,000 ≈ 2 MB,
against 500 MB free / 8 GB Pro. They exist so a phone that was offline learns of
a delete; removed too early, that phone keeps its copy and could send it back.
Plan: Stage 12's scheduled clean-up job (already server code for R7/R8) also
removes markers older than ~12 months, AND phones gain a guard — one that hasn't
synced for longer than that re-checks every job it holds against the cloud
instead of trusting its fingerprints. Not a version of its own.

### From the V106 harness amendment (8 Oct) — carried in at V107
- ~~11 mutations anchor on text that occurs more than once~~ — RE-ANCHORED IN
  V110 (5B). ~~Still open: make the runner abort on a non-unique anchor
  (DEFENCE 3)~~ — BUILT V130 (1B).
- ~~The 10 s preview guard in _syncThumbUpload (sync.js) has no test of its own~~ —
  TESTED V130 (68d, M1186–M1188).
- ~~Option: mutate.js stops each suite at the first failure~~ — DONE as the V108
  harness amendment (10 Oct): bail after the first failing test file, plus the
  mutation's own test file run first. Measured: V108's 24 mutations ~20 min → 28 s;
  an older batch without group hints (M30x) 6.5 min → 1.9 min. `--full` keeps
  the old behaviour. ~~Further speed-up: add the test group to the `why` of the
  ~380 older mutations~~ — DONE IN V110 (see V110 residuals for the ones left).
- Option: move run-mutations.sh into harness/ so it versions with the repo.

### V106 residuals (known, accepted)
- Reset is local only. A signed-in phone after "Clear my work" is a fresh phone
  to sync: the last 30 days (and retests being chased) come back with clients and
  sites; older jobs stay in the cloud until opened. Removing work from the CLOUD
  is Stage 5 part 3.
- Settings that sync (presets, instruments, report setup, templates, tester in
  use) come back after "Clear work and settings" while signed in — said on the
  confirm. Per-phone settings (theme, sound, switches) do not.
- Claude's calls at the build: certificate numbering kept at the settings level
  includes prefix and padding, not only the counter; the cloud access code goes
  only at "Everything"; the RESET box is not focused on open (the keyboard would
  cover the overview).
- Reset deletes the two IndexedDB databases it knows (photos, snapshots) by
  name. A future database must be added to reset.js by hand — MAP rule 17.
- deleteDatabase at boot can be "blocked" by a connection still open elsewhere
  (another tab). The live page has already emptied both stores, so only empty
  databases can linger; they go once the other tab closes.
- Not tested on a real iPhone: the reload after the reset, and typing RESET with
  iOS auto-capitals (any case is accepted either way).

### V105 residuals (known, accepted)
- Restoring (a file or a snapshot) while signed in goes through sync exactly as
  restoring a backup file always has — V105 changes nothing there and did not
  re-test it. By the fingerprint rules (sync.js header) a restored job that
  differs from what this phone last sent reads as this phone's own change; jobs
  made after the copy and already in the cloud are not removed from it. Snapshots
  are aimed at phones that never sign in. V106's reset sidesteps the question by
  wiping the sync bookkeeping (a reset phone is a fresh phone); restores do not.
- A snapshot is taken on the first open of the (UTC) day — `todayISO()`, as the
  storage banner — so between midnight and 1am in summer it counts as yesterday.
- Snapshots live inside the app: deleting PATGo from the home screen, or the phone
  clearing its storage, takes them too. They don't stop the backup reminder.
- The safety copy is taken even with Daily snapshots switched off (Claude's call,
  flagged at the build) — say if the switch should cover it too.

### V104 residuals (known, accepted)
- A V103 phone doesn't carry the readings check settings in the settings_work
  row: if it saves its settings, the other phone's switch and earth limit go back
  to the defaults (on, 0.15 Ω). Test phones, upgraded together.
- The check runs on the readings sheet only (6A). Items already saved over a
  limit aren't marked on Review — backlog below if wanted.
- Earth is checked against one ceiling, not 0.1 Ω + R for the item's actual lead
  (2A). A per-item lead picker (length + size → exact limit) is backlog.
- "Change to FAIL" carries every reading typed on the PASS sheet, so a fail whose
  reason shows one box still saves the others (as typed, as the pass would have).
- Comma decimals ("0,5") are not read — silent, never guessed.

### V103 residuals (known, accepted)
- A V102 or older phone still treats a target job already on it as ready (no
  `_syncDestHolds`): if the original lands before the target, the moved items are
  briefly missing there until the target's row arrives. Test phones, upgraded
  together.
- Deletes from the clash step ("Keep the one already there" / "Use this one
  instead") look like ordinary deletes to another phone: if it holds the job
  whole, it may ask the "fewer items" question once, as deleting by hand does.
- An empty original after a merge (4B) stays on the Jobs list until deleted by
  hand; it still has its certificate number and `movedOut`.
- Asset numbers are matched exactly, as the per-job duplicate check always has
  (no trimming or case-folding).

### V102 residuals (known, accepted)
- A V101 phone shows a duplicated job's items twice in its own lifetime count
  (it doesn't read `copyOf`). Test phones only, upgraded together.
- Cloud-only photos fetched for a duplicate stay on the phone under the ORIGINAL
  too (that is how they are copied); clear them from the photo manager if space
  matters.
- CSV "Import as duplicate" (v30s) makes items without `copyOf`, so its copies
  still count twice — pre-existing, unchanged.
- Asset numbers repeat across the original and the copy until one is trimmed (S4
  is not built; the same-job duplicate check is per job).

### V101 residuals (known, accepted)
- A phone on V100 or older treats a moved-out job as before: the "fewer items"
  question. Answering "keep this phone's copy" puts the moved items back into the
  original, so they exist in two jobs and share photos by item id. Test phones
  only, upgraded together.
- A phone that applied a moved-out job while the job the items went to was
  CLEARED from it (on the cleared list) leaves those items in the cloud only —
  reached from the ☁ tab, as any cleared job.
- Photo rows of moved items on ANOTHER phone's IndexedDB are re-labelled when that
  phone applies the moved-out job (photosSettleJobs after a changed pull) — or at
  its next start-up. A phone still holding the original whole (held question)
  keeps them under the original until answered.
- `movedOut` keeps entries until the item comes back into the job; bounded at
  MOVED_OUT_MAX (5000) per job, oldest first.
- Lifetime stats are unchanged by a move; asset history (V61) shows each item under
  the job that now holds it.
- Stage 14 / Teams: a job made by a move has no `lockedAt` or `reportAt` (it was
  never locked or certified); the original keeps its own.

### V100 residuals (known, accepted)
- Reminders are worked out when the Jobs screen is drawn. A phone left open on
  the Jobs screen past the time shows the banner at the next repaint, not on the
  minute. Notifications while closed are Stage 14.
- (Closed V131: the "not yet exported" line, badges and Status filter now
  count a certificate made after locking, as the reminder does.)
- A V99 phone that RE-locks a job doesn't stamp a new lock time (it keeps an old
  one left from an earlier lock, or none). Test phones only, upgraded together.
- A certificate made BEFORE locking doesn't count (a job could change in between)
  — make it again after locking, or export the CSV.
- "Locked, not exported" is a transient filter: a reload returns to All.
- The 100 moment's sparks and the egg's steps are CSS transitions started from
  script (MAP rule 12); only a real iPhone proves they play. If they don't, the
  finished picture still shows.

### V99 residuals (known, accepted)
- How iOS asks for permission is not involved (no GPS), but how a home-screen app
  returns from Safari/what3words is: if iOS keeps the app alive, the sheet is
  simply still open; if it reloads, `mapPinResume` reopens it. Only a real phone
  proves both.
- V99.1: the what3words app is opened by its own link. Unproven on a phone:
  whether iOS asks "Open in what3words?" first (harmless — it counts as
  leaving), and what a phone WITHOUT the app shows (expected: nothing, then the
  website offer after 2.5 s).
- The Paste button relies on iOS's own "Paste" bubble; if the phone refuses,
  the app says "Long-press the box and choose Paste".
- 5A risk accepted: the offer covers the job title for ~4 s (nothing to tap there).
- A pin kept on a PASS (fail → PASS, Keep) shows on the Overview and in the CSV
  but never prints (Remedial actions lists fails only).
- A V98 phone that EDITS a pinned item keeps the pin (whole-item spread). A V98
  phone receiving a CSV row with Map pin shown keeps the column (unknown ids are
  kept) and exports it blank — harmless.
- The hidden Map pin column's POSITION does not sync while hidden.

### V98 residuals (known, accepted)
- The sticky Overview bar sits under the "new version" banner when that shows
  (rare, cosmetic).
- Jobs whose site text was edited BEFORE V98 keep their old site link, so they
  show the old site's notes until the site text is edited again.
- 5A: a V97 phone that edits a site sends it back without its notes and V98
  phones take that. Test phones only — upgrade both together.

### S10 readings check — SCHEDULED V104 (Peter has his CoP copy, V102 round; was parked at V96)
Spec drafted at the V96 round, not answered: 1 leakage 5 mA all classes (5th ed.)
vs 3.5 mA; 2 earth with the cord unknown — warn above 0.5 Ω (A) / 0.3 Ω (B) / no
check (C); 3 PASS sheet only vs also FAIL; 4 warning sheet with Log as FAIL (tagged
reason) / Keep PASS / Change the reading vs warning only; 5 note a kept PASS or
not; 6 switch: none / synced in settings_work (rule 36) / per phone; 7 symbols
(<, >, ≥) warn only when definitely outside. Limits found from training/maker
sources: insulation Class I ≥1 MΩ, Class II ≥2 MΩ, Class III 0.25 MΩ (least sure);
earth (0.1 + R) Ω with tolerance leeway, older kit up to 0.5 Ω; leakage 5 mA.
Peter to confirm against the book (and whether the 4th-ed 0.3 MΩ heating figure
survives). Readings off → no check. The switch lands in Logging → Test Readings.

### Settings redo part 3 (Stage 7) — the look pass — DONE V114 (wording + capitals); icons → V115; page splits → backlog above
V97 did part 2 (Backup & Restore split, Phone Storage, Logging Options, About copy).
Left: emoji icons and casing inside pages (e.g. "Clear photos from this phone",
section headings), and whether Smart Quick Pick on/off should leave Quick Pick
Items. Not chosen yet — Peter decides whether it is worth a release.
Other crowded pages seen, not split: Report Settings (long), Quick Pick Items
(presets + items + SQP).

### V97 residuals (known, accepted)
- Phone Storage's row subtitle reads getStorageStats() each time the Data list or
  search draws it — same figure the Jobs banner reads; cheap at today's sizes.
- ~~33f still opens the photo manager from Backup & Restore~~ — FIXED V130 (3A): 33f
  opens from Phone Storage; settingsBackup left `_MGR_RETURN_VIEWS` (68b).

### Visual inspection tick (PN) — postponed at V94 (11D)
Peter worried it would harm the entry screen. Placements offered at the V94 round:
A a chip on the Asset number label line (recommended — no new space); B hold PASS
for "Pass — visual only" (hidden, passes only); C mark items afterwards in Overview
select mode (no entry-screen change; could add to A); D per item type in the preset
(automatic, but edges towards S9). If revived: 4A (a "Visual only" certificate
column only when used + a hidden CSV column, import reads it) and 5A (PASS skips the
readings sheet) were the proposals. Stored as an item field only when ticked.

### V95 residuals (known, accepted)
- The fail → PASS sheet recognises a fail reason only as it is NOW in the fail
  reasons list; a reason since renamed, or typed through "Other…", is offered as
  "Clear the notes" instead (2B asks either way).
- A description fix changes jobs on this phone only. A job only in the cloud keeps
  the old spelling until it is brought down and fixed again.
- Smart Quick Pick history keeps the old spelling (renaming its keys would fight
  the highest-count merge); the new spelling learns from scratch.
- A V94 phone opening Report settings after a V95 phone switched remedial on shows
  "Other settings: Different" on a held card (it has no label for the field).
- Bulk "change to PASS" does not exist (1A, Peter: not needed); every fail → PASS
  change is one item and one sheet.

### V94 residuals (known, accepted)
- Undo of a fail whose staged photos are still being written (a tap within a
  moment of saving) could leave that photo without its item. The confirm sheet
  makes this a two-tap race; not seen in the harness.
- A V93 phone that SAVES Multi Pick settings sends the row without tiles and every
  V94 phone takes it (13A, accepted — test phones only).
- Smart Quick Pick: an undo's decrement can be outvoted by the merge when both
  phones moved (highest count wins) — harmless.
- The location count can wrap the item readout onto two lines on a narrow phone
  with the 🗑 showing (accepted at the spec round).
- ~~S4 is V95~~ — not built; see "S4" in the feature backlog (V95 round).

### V93 residuals (known, accepted)
- Search, asset history (V61) and the certificate-number skip see jobs on this
  phone only. The synced counter is the real guard against reused numbers.
  Stage 3's "asset ID already used" (S4) will need the cloud.
- A fresh phone's lifetime stats count only what is on it.
- A tracked job brought down by the retest look and removed again comes back the
  next month while its chase is on (until booked or declined) — by design.
- The cloud list is read whole on opening the tab (8A, ~200 bytes a job); at
  SYNC_CLOUD_MAX (20,000) it stops and says so.
- A job's date is editable; the window uses it as stored.
- Storage view and permanent cloud delete: Stage 5 part 3 (optional, not chosen at V94).

### V92.1 (fixed — data loss)
- A job shown 🛡, removed from the phone, was emptied in the cloud by a stale
  session tombstone (job once deleted here, then brought back). Fixed in the
  push. Cloud copies emptied before V92.1 are not recoverable (Free tier, no
  backups) unless a phone or a JSON backup still holds them.
- V93 checked the paths that read absence: tombstones (the window skips jobs
  deleted here; Bring back of one live elsewhere lets rule 32 forget it), photo
  rows (rule 24 via `_syncTakeJob`), held entries (none for jobs left in the
  cloud), `conf` (trimmed as before), stats (cleared only).

### V92 residuals (known, accepted)
- A row with a BLANK fingerprint at the cursor's boundary (the newest batch,
  re-read every run by the V83.1 pager) is downloaded again each run until any
  newer row is written. Only rows written by a V91 phone are blank; the first
  V92 push moves the boundary past them. Before V92 every boundary row came down
  every run.
- 🛡 from the list trusts the fingerprint the writing phone sent (2A, 3B). The
  contents are compared only at removal. A jsonb round trip that altered a doc
  would show as safe until someone tried to remove it — then it stays.
- Existing rows keep a blank fingerprint until they next change (no backfill);
  blank only means "download it if it's read".
- The removal check downloads each job being removed (3B) — a large tidy-up of
  many jobs is one download of each, once.

### V91 residuals (known, accepted)
- No signal: removal trusts the last read-back (3A). A job deleted everywhere on
  another phone since then is removed here too — which is what that phone asked.
- A job brought back whose instrument was deleted since prints the tester in
  use (same as any job pulled from another phone — V83 tier 3).
- Bring back lists cleared jobs by name only; no item count (it would mean
  downloading the job).
- A cleared job's `st.conf` entry is dropped on the next pull; its photos stay
  known (`ph.sent`), so the photo manager still shows them as in the cloud.
- Signed-out users see the V91 welcome sheet, which says nothing changed for them.

### V90 residuals (known, accepted)
- "Look in the cloud" reads rows and job names only while the manager is open;
  nothing is kept, so every look reads again (3A). Accounts over 20,000 photos
  see the first 20,000 (said on screen).
- Before a phone's first sync on an account the manager shows phone photos only
  (same rule as V89's badges).
- Photos of a job not on this phone can be seen and deleted, not downloaded (4A)
  — they come with their job in Stage 5.
- A photo found by the look and deleted is removed on the next sync, not at
  once. Offline, it waits like any other delete.
- Local previews are made one at a time on the phone (canvas); a big page on an
  old phone fills in over a few seconds. A photo that won't decode stays a 📷.
- No "remove photos older than X" offer — goes with Stage 4's clear-old-jobs
  offer (O4, Peter 10A).
- Harness: 25a waited one tick for the photo store and failed twice under a full
  run while building V90; it now waits up to a second (harness defect, not app).

### V89 residuals (known, accepted)
- A phone keeps photo records only for jobs it holds. A job brought back by a
  path other than the pull or "Use the cloud's copy" (none today; Stage 5's
  archive will be one) must push its id onto `st.ph.need`, or its photos stay
  unseen until the next full read.
- Previews are made on the phone from the stored photo. Photos cleared from
  every phone before V89 get one only after someone downloads them.
- A photo the phone can't decode gets no preview; retried next session only.
- A V88 phone on the account: uploads without previews, deletes only what it
  uploaded, never removes a copy deleted elsewhere. Test phones only.
- Download on mobile data is not limited (iPhone can't say whether it's on
  Wi-Fi); the tile and the certificate prompt show the size first.
- Turning Photos ON from the report preview's quick-adjust chip does not ask
  about cloud photos; it prints what is on the phone (the prompt runs at
  "Produce report").
- The Sync page's photo line counts photos of jobs on this phone only.

### V88 residuals (known, accepted)
- ~~A phone deletes only the cloud photos IT uploaded~~ — V89 (5A): any phone
  that knows a cloud photo can delete it. A job deleted while NO phone knows its
  photos still leaves them — Stage 5's review-and-delete path is the tidy-up.
- Uploads happen only while the app is open (web apps can't upload closed), on
  any signal: an iPhone won't say whether it's on Wi-Fi.
- A V87 phone on the same account neither uploads photos nor deletes them.
  Test phones only; both go to V88.
- A photo whose job is held for a decision waits until the question is answered.
- Photo mirror unreadable (IndexedDB broken): while signed in, nothing can be
  cleared as old. Sign out to clear, or fix the store.
- Photo deletes write the ledger directly (`saveTombstones`); a refused write is
  logged and the entry rides the next save().

### V87 residuals (known, accepted)
- Android description list (field report): fixed on the likeliest cause — the
  keyboard hid without a blur — NOT reproduced on hardware. If it recurs, get
  the phone model/Android version and what was on screen.
- Date pickers (`<input type="date">`) display in the phone's own format; the
  app cannot change that. Stored and printed dates are UK.
- Refused writes: sessions/settings/SQP/descriptions savers are guarded; the
  other ~40 direct writes are covered only when they happen inside a TAP (the
  dispatcher's catch). Writes from timers or async paths (sync pull saves,
  photo callbacks, reminder stamps) still throw to the console — the next tap's
  save shows the sheet. Guard any new hot-path saver explicitly.
- Storage % counts UTF-16 (2 bytes/char) against ~5 MB — conservative on
  browsers that count characters. Unchanged from v11.
- Protection status is asked fresh each launch, never stored.
- Day-first file names don't sort by date in a folder (Peter's choice, V87).

### Cloud track — V93: fresh phone + the cloud tab; next field batch A
V78 ledger → V79 sign-in → V80 push → V81–V81.4 pull → V82 clients + sites →
V83 instruments + presets + tester in use → V83.1 pager fix → V84 report
settings + templates + certificate counter → V85 the cloud pages moved to
Settings → Cloud (code 1111, remembered per phone) → **V86** general settings
(engineer + switches, fail reasons, descriptions, CSV, Multi Pick, Smart Quick
Pick history) → V87 field release → **V88** photos UP (one way, isolation 4c/4d +
7a–7d) → **V89** photos DOWN, only when asked (rows, previews, ☁ tiles,
certificate prompt, deletes from any phone; isolation 4e/4f) → **V90** the
photo manager (Settings → Backup → Manage photos: phone + cloud, Look in the
cloud, remove from phone, download, delete everywhere, orphans; no SQL) →
**V91** safe in the cloud (read-back fingerprint, 🛡, Jobs on this phone, remove
/ bring back, tidy-up offer, two-step delete everywhere; no SQL) → **V92** the
lighter pull (`sessions.fp`) → **V93** the 30-day window, the monthly retest look
and the Jobs screen's ☁ In the cloud tab (counts columns + photo-count view;
isolation 8a–8c). Next (roadmap v4.6): Stage 5 part 3 (storage view / permanent
delete) if wanted, then field batch A.
Every cloud release runs `supabase/isolation-test.sql` (all PASS) before
promotion to `Release` — all PASS at V84 incl. 6a–6d. V85 changed no SQL.

### Cloud — V85 residuals (known, accepted)
- The access code is readable in public source (config.js). A curtain for free
  users on the shared test address, not protection — that stays
  `shouldCreateUser: false` + RLS. Remove the code at commercial launch.
- Free users on the GitHub Pages address now SEE a "Cloud" row (1A); it asks
  for a code they don't have. Accepted by Peter at V85.
- ~~`setupLongPress` (utils.js) has no caller~~ — REMOVED in V109 (13n now
  guards that it stays gone).

### Cloud — V86 residuals (known, accepted)
- Two phones that both change the descriptions list's ORDER (not its contents)
  before syncing: this phone's order wins the merge. Contents are never lost.
- A description edited in Settings (same text, different spelling) is a removal
  plus an addition to the merge, like any other.
- Smart Quick Pick history merges by the higher count, so counts converge on the
  busier phone rather than adding up. It is a ranking hint, not a tally.
- A clear or rebuild on a phone that is signed OUT is still stamped, so it wins
  on the next sign-in. Restoring a backup is not a reset.
- Setup import and backup restore replace fail reasons, descriptions, CSV and
  Multi Pick wholesale; with the other phone unchanged that simply goes up.
- A V85 phone ignores the six new rows (unknown settings ids) — it neither
  receives nor sends them until it updates.

### Cloud — V89 photos down must carry these (next)
- Nothing downloads automatically (R17 / 10A): pull photo ROWS only (no image),
  show "N photos in the cloud" on the job / strip, fetch on a tap.
- Read the photos table by cursor (rule 10, rule 14 multi-page); a deleted row
  removes the local photo; a row for an item not in the job is ignored.
- What a report does with a photo not downloaded (spec round question).
- Photos cleared locally (5A) come back only on request, never on open.
- Footprint measured at V88: 13 photos = 3.22 MB (~250 KB each).

### Cloud — V84 residuals (known, accepted)
- Two phones BOTH offline stamping a certificate at the same moment can issue
  the same number: the stamp only skips numbers on jobs the phone already has.
  The counter row is written by a plain upsert (no SQL change), so a slower
  phone can briefly put a lower number in the cloud; the next run of the
  further-on phone puts it back (21i). A server-side "max" would need SQL.
- Setup import and backup restore replace the template list wholesale without
  tombstones, so a template dropped that way comes back from the cloud on the
  next read. Delete it in the app to make it stick.
- An untouched starter template deleted on a phone that has never sent it,
  while the cloud does not have it either, stays on the other phones.
- A phone still on V83 applying a template still rewinds its own counter (the
  fix is V84). Once it updates, the higher cloud number wins, so no harm lasts.
- Report settings the cloud has from a NEWER version keep their extra fields
  here (`normaliseReportSettings` carries unknown keys through) — so an older
  V84 phone editing them does not strip anything. Opposite of clients (below).

### Cloud — V83 residuals (known, accepted)
- A job whose instrument is not on this phone and has no frozen copy still
  prints the tester in use (tier 3). V83 closes it by order — instruments read
  before jobs — leaving only a held instrument or a phone still on V82 (6A).
- Rare false question: a job the other phone edited AND froze, whose freeze
  happened while it was open on screen here (deferred) or while the jobs read
  failed, can come back as changed on both. It is asked, never lost.
- A blank instrument that jobs reference (kept by pruneBlankInstruments) is
  never sent — nameless records are unreadable by design.
- Same tester / same "Default" preset made on two phones separately = two
  entries to tidy by hand (3A; 5A only covers an untouched starter).
- (V83.1) Commit-order window: `updated_at` is when a write STARTED, not when it
  committed. A write that starts first but commits after a later one could be
  stepped over by a phone reading in between. Needs two of one account's
  devices writing within milliseconds of each other while a third reads.
  Accepted; revisit (read a few seconds behind the mark) only if ever seen.
- (V83.1) A read stops without moving if more rows share one timestamp than a
  page holds (200). Impossible while upload batches are 25 rows; the compound
  (updated_at, id) cursor is the fix if batches ever grow.

### Cloud — an older phone strips fields it doesn't know (V82 note)
Records sync a projection (`_syncRecordDoc`). A later version that adds a client
field must add it there AND in loadClients/loadSites; until every phone has
that version, an older phone that EDITS the record sends it back without the
field. Receiving is harmless. Worth remembering before adding anything to a
client (address, contact).

### Cloud — photos on a second device (V81 note; V88 up; V89 down on request — CLOSED)
A job pulled onto a second device now shows its photos as ☁ tiles with previews;
each comes down on a tap. Offline, or signed out, it still fails soft.

### ~~Cloud — permanent delete of cleared jobs (Peter, V80 spec)~~ — SHIPPED IN V107
Cloud tab → Select → Delete…; drops the id from SYNC_PRUNED_KEY as planned below.
Clearing old jobs leaves them in the cloud archive (5A). Peter wants a way to
delete them from the cloud too, at some point. Pull now exists, so the blocker
is gone — what is still missing is a view of what the cloud holds. Would send an
emptied deleted row, as a job delete does, and must also drop the id from
SYNC_PRUNED_KEY or the row is skipped for ever.

### Cloud — sync timestamps are "noticed", not "edited" (V80 note, closed V81)
`last_modified` on the server is the push time, because sessions have no edit
timestamp. V81 does NOT compare them: the fingerprint decides instead, so the
stamp is display only. Keep the note — anything added later that reaches for a
timestamp comparison is reaching for a value that does not mean what it says.

### Harness — three mutation anchors were stale through V78
M66/M82 (rolling anchors) and M110 (the V77 data-loss mutation, broken by
V78's uid()→newId()) all aborted in V78 and proved nothing. Re-pointed in V79;
15j now fails the suite if M66/M82 aren't re-pointed. Lesson: run the FULL
mutate every release (detached — it outlasts one 300 s command).


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

### ~~Documentation hygiene — the two READMEs~~ — SHIPPED IN V77
`README.md` (repo root) was a stale copy of `harness/README.md` — the same
document in two places, already drifted by one release (V76's "zero aborts"
paragraph landed in one of them only). The root README now describes the APP:
what it does, the stack and why there is no build step, repo layout and load
order, how to run it and the harness, the release checklist and the deploy order.
`harness/README.md` keeps the harness. They are different documents now and must
not be re-synced.

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
→ TIDIED V130: the scroller is the body, the buttons are pinned (68c, M1184–M1185).

### ~~General sheet-markup guard — the part of the audit not built~~ — SHIPPED IN V110
Built as harness 47 + `harness/sheets.js` + `harness/sheet-register.js`. 44
sheets found; 25 scroll, 19 registered with reasons, 1 gap fixed (Log again's
notes preview). The spec notes below are kept for the reasoning.


**V110 — spec LOCKED at the V109 round (Peter, 10 Oct: defaults).** Split from the
housekeeping release (1A) so it rides alone.
- 5A: a REGISTER in the harness. The guard finds every sheet (`.bulk-sheet` /
  `.fail-sheet` markup, `_openSheet(` callers); each must use `.sheet-scroll` or be
  named in the register with a one-line reason ("two buttons, fixed wording"). A
  new sheet fails the run until someone decides. No app file changes for the
  guard itself. (Not B — a marker attribute on ~25 sheets in six files; not C — a
  "builds a list" guess, which misses caller text.)
- 6A: a real gap it finds (a body that can grow, no scroller) is fixed in V110 when
  the fix is only adding the existing `.sheet-scroll` class; each named in the
  handoff and the test checklist. Anything bigger → its own release.
- Rough first pass at the V109 round: ~45 sheet sites, about half with no scroller
  in their markup — most expected to be fixed confirms. Harness 12d catches any CSS rule that hand-rolls a scroller
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
- Readings check, from V104: mark already-saved PASS items with a reading
  outside its limit on Review (6B, not taken); a lead picker on the readings sheet
  so earth is checked against the exact 0.1 Ω + R (2C, not taken).

Consolidated here from the V66 handoff roadmap and the V61/V62 roadmap, so it
survives those documents being archived.

| Item | Status |
|---|---|
| Home-screen shortcuts | Liked ("big yes"), never scheduled. Android/desktop only — revisit if an Android tester appears |
| ~~"Log this item ×N"~~ | **SHIPPED V77.** Built exactly as the proposed resolution said — a hold on Copy-last, no new control. Counts +2/+3/+5/+10 or a custom number capped at 20 |
| Weekly/batch PDF export | Parked pending a direct tester ask — good idea, but wanted from testers before committing time |
| Per-instrument "in service" toggle | Only if overdue calibration nags on a retired instrument prove annoying in practice |
| ~~Sheet-scroller audit~~ | **SHIPPED V76.** The general sheet-markup guard followed in V110 |
| S4 asset ID already used at this site | **Very low priority, considered not needed (Peter, V95 round).** Peter gives every item a new number, and the same-job duplicate check already blocks repeats within a job. If a customer who numbers each site from 1 asks: a phone-only check against same-site jobs in the last 30 days needs no SQL (V95 round option B); a cloud-wide check would need a generated `asset_nos` column |
| Scan into other fields (location, item type) | **Liked, not a priority (Peter, V102 round).** Raised implicitly by V67. Currently a scan is refused when any other text field has focus (the deliberate V65 "known limit"). Only worth revisiting if Peter starts labelling locations |

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
- `backupVersion` bump to 6 — reserved for a genuinely incompatible schema
  change. Not yet triggered.
