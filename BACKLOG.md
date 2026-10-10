# PATGo — Standing backlog

Work agreed but not yet scheduled. Carried across releases; the handoff points
here rather than restating it. Delete an item when it ships.
(c) 2026 Peter Birchley. All rights reserved.

---

## Next release

### Next after V108
Stage 5 part 3 complete (V107 cloud delete, V108 Cloud Storage). Next: the
housekeeping release (favicon set, remove dead `setupLongPress`, the sheet-markup
guard). Full order: roadmap v4.21.

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
- Placement: roadmap v4.20 had planned this view "from the cloud tab, not
  Settings"; Peter chose Settings → Data at the round (1A). Option if wanted: a
  "Cloud Storage" link on the cloud tab (one line, no new logic).
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
- 11 mutations anchor on text that occurs more than once in their file: M16,
  M116, M127, M150 (8×), M200 (3×), M263, M268 (3×), M300, M547, M580, M586.
  All caught, but each may break a different copy than its author meant (M407's
  fault). Own harness release: re-anchor each, and make the runner abort on a
  non-unique anchor (DEFENCE 3), as it already aborts on a missing one. (V107's
  first draft briefly made M150 10× and M401 2× — caught by the anchor scan and
  rewritten; that scan is the only guard until DEFENCE 3 exists.)
- The 10 s preview guard in _syncThumbUpload (sync.js) has no test of its own.
- ~~Option: mutate.js stops each suite at the first failure~~ — DONE as the V108
  harness amendment (10 Oct): bail after the first failing test file, plus the
  mutation's own test file run first. Measured: V108's 24 mutations ~20 min → 28 s;
  an older batch without group hints (M30x) 6.5 min → 1.9 min. `--full` keeps
  the old behaviour. Further speed-up available: add the test group to the `why`
  of the ~380 older mutations that don't name one (they then get the 1-file path).
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
- The existing "N jobs not yet exported" line and the ✓ badges still mean CSV
  only; only the new reminder counts a certificate (2B scope). Peter works by
  PDF — a candidate follow-up: let the line/badges count certificates too.
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

### Settings redo part 3 (Stage 7) — the look pass — SCHEDULED, first of Stage 12 (Peter, V102 round)
V97 did part 2 (Backup & Restore split, Phone Storage, Logging Options, About copy).
Left: emoji icons and casing inside pages (e.g. "Clear photos from this phone",
section headings), and whether Smart Quick Pick on/off should leave Quick Pick
Items. Not chosen yet — Peter decides whether it is worth a release.
Other crowded pages seen, not split: Report Settings (long), Quick Pick Items
(presets + items + SQP).

### V97 residuals (known, accepted)
- Phone Storage's row subtitle reads getStorageStats() each time the Data list or
  search draws it — same figure the Jobs banner reads; cheap at today's sizes.
- 33f still opens the photo manager from Backup & Restore (no button there now; the
  action still works and settingsBackup stays in the return list).

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
- `setupLongPress` (utils.js) has no caller since the About long-press went.
  Dead code — remove in a structural release, not a feature one (13x source-
  guards that it exists; update that test with the removal).

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

### General sheet-markup guard — the part of the audit not built

**Scheduled (Peter, V102 round)** in the housekeeping release with the favicon set
and removing `setupLongPress`; needs its own short spec round. Harness 12d catches any CSS rule that hand-rolls a scroller
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
| ~~Sheet-scroller audit~~ | **SHIPPED V76.** The general sheet-markup guard, the part deliberately not built, is still open above |
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
- Tight-cropped favicon set for tab legibility (deferred from V58) — SCHEDULED in
  the housekeeping release (Peter, V102 round).
- `backupVersion` bump to 6 — reserved for a genuinely incompatible schema
  change. Not yet triggered.
