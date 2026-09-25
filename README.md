# PATGo

A portable appliance testing (PAT) app for field engineers. Offline-first
progressive web app, built to be used one-handed on an iPhone in a plant room
with no signal.

**Live:** <https://exnno.github.io/pat-test-app>
**Landing page:** <https://patgo.co.uk> · `hello@patgo.co.uk`

(c) 2026 Peter Birchley. All rights reserved. See `LICENSE.txt` — this is
proprietary source, published so it can be served, not for reuse.

---

## What it does

Log a job, log items against it as pass or fail, and produce the paperwork.
Everything works in aeroplane mode; nothing needs an account.

- Sessions (jobs) against a client and site, with asset numbering and retest dates
- Quick Pick — up to nine one-tap item types, switchable presets, and Smart Quick
  Pick, which learns what gets logged where
- Multi Pick for a fixed mixed sequence; "Log again ×N" for a run of the same item
- A fail flow with reasons, optional test readings, and photo evidence
- PDF certificates and CSV export/import
- Backup and restore to a file, and an Export/Import Setup bundle for a new phone
- Bluetooth HID barcode scanner support (keyboard-wedge mode)

`FEATURES.md` is the full reference — one `##` section per capability and per
release. Don't read it whole: `grep -n '^## ' FEATURES.md`, then `sed` the section.

---

## Stack

Deliberately plain. **No build step, no framework, no bundler, no `package.json`**
in the shipped app — the files in the repo root are the files the browser loads.

| | |
|---|---|
| Language | Vanilla HTML / CSS / JavaScript |
| Persistence | `localStorage` for all records; IndexedDB for photo blobs |
| Offline | Service worker (`sw.js`) precaching every asset |
| PDF | jsPDF 3.0.3 + jsPDF-AutoTable 5.0.2, vendored and self-hosted (MIT) |
| PDF preview | PDF.js 3.11.174 legacy UMD, vendored, lazy-loaded (Apache-2.0) |
| Cloud | supabase-js 2.116.0 UMD, vendored, lazy-loaded (MIT) — invite-only, test host only. Syncs both ways: jobs, clients, sites, instruments, presets, the tester in use, report settings, report templates and the certificate counter (V79–V84). Photos and general settings not yet |
| Hosting | `main` → GitHub Pages (test); `Release` → Cloudflare (the product) |
| Tests | `harness/` — Node, no dependencies |

Third-party licences are reproduced in `THIRD-PARTY-LICENSES.txt`.

The no-build choice is load-bearing rather than nostalgic: the deployed artefact
is readable, a fix can be made from a phone through the GitHub web UI, and there
is no toolchain to rot between releases.

---

## Repo layout

```
index.html            script tags, in a load order that matters
config.js … boot.js   31 first-party modules (see below)
styles.css            one stylesheet, ordered by release, banner-indexed
sw.js                 service worker + the precache ASSETS list
manifest.webmanifest  PWA manifest
icon-192.png  icon-512.png
jspdf.*.min.js        vendored PDF engine — precached, not <script>-tagged
supabase.umd.js       vendored cloud client — precached, not <script>-tagged
supabase/             server SQL: schema.sql (run once), isolation-test.sql (every release)
harness/              the committed test harness — NOT shipped
MAP.md  FEATURES.md  BACKLOG.md
PAThandoff_vNN.md     the canonical state block for the current release
```

### Load order — 31 files, and it is not arbitrary

```
config → data → state → utils → storage → clients → instruments → sqp
→ multipick → feedback → bugreport → photos → csv → backup → session
→ settings-actions → setup → tour → onboarding → report → pdfpreview
→ render-core → render-review → render-settings → render-help
→ cloud → sync → scanner → events → dispatch → boot
```

`data` → `state` is the one adjacency that is a hard dependency rather than a
readability choice: `state.js` seeds itself from `data.js` constants in a
top-level initialiser that runs at load. `boot.js` must be last — it runs on load.

`sw.js` ASSETS lists **34** `.js` entries: these 31 plus the two jsPDF files and
`supabase.umd.js`, which are precached but injected on demand rather than
script-tagged.

**`MAP.md` is the routing table** — which file owns what, plus the cross-cutting
rules that no single file makes discoverable. Read it before editing anything.

---

## Working on it

Nothing to install to run the app. Serve the repo root over HTTP — a service
worker will not register over `file://` — and open it:

```
python3 -m http.server 8000
```

The tests need Node, and nothing else:

```
node harness/run.js            # every standing assertion
node harness/run.js 04 06      # only matching test files
node harness/mutate.js         # prove the assertions aren't hollow
node harness/mutate.js M07     # one mutation
```

`run.js` exits non-zero on any failure. `mutate.js` exits non-zero if any
mutation survives **or** fails to apply. Both must be clean before a release, and
**an aborted mutation is not a caught one**. See `harness/README.md`.

### Before changing anything

1. Read `MAP.md`'s cross-cutting rules, then the current `PAThandoff_vNN.md`.
2. **Fetch the live repo and byte-compare.** The source of truth is what is
   deployed, not what a document says about it. Code wins over docs.
3. Establish a green harness baseline *first*, so a red result later is
   attributable to the change.

Rule 1 in `MAP.md` is the one that has caused real data loss: a duplicate
top-level `const` across two loaded files is a `SyntaxError` that kills the whole
file, after which the app can save defaults over good config. Duplicate top-level
`function` declarations are legal and silent — last loaded wins. Scan for both
before delivering:

```
grep -hoE "^(const|let|function) [A-Za-z_$][A-Za-z0-9_$]*" *.js \
  | sed -E 's/^(const|let|function) //' | sort | uniq -d

for f in *.js; do node --check "$f" || echo "FAIL $f"; done
```

---

## Releasing

Versions are sequential integers — `V77`, `V78` — with a matching cache tag
(`pat-v78`). One focused concern per release; structural refactors ship
separately from behaviour changes.

**Every release:**

- `APP_VERSION` (config.js) and `CACHE_VERSION` (sw.js) bumped together
- `WELCOME_VERSION` plus the modal copy in `render-core.js`, on any feature or
  behaviour release
- About changelog rolled — three versions, oldest dropped (`render-help.js`)
- `MAP.md` accurate, `FEATURES.md` gains a section, `BACKLOG.md` reconciled
- New assertions in `harness/tests/`, and **a matching mutation for each**
- Re-point the release-anchored mutations **M66** and **M82**, or they abort
- A new `PAThandoff_vNN.md`, including the post-commit test checklist
- From v79: `supabase/isolation-test.sql` run in the test project, all PASS,
  result recorded in the handoff — before any promotion to `Release`

`backupVersion` bumps only for a genuinely incompatible schema change — additive
fields ride through the codec and never spend a bump. It is its own event and is
never bundled with a feature release.

### Deploy

Commit through the GitHub web UI, in this order:

1. Any **new** files first
2. Changed modules
3. `index.html` before `sw.js`
4. **`sw.js` LAST** — it carries the cache tag, and committing it is what triggers
   the cache bust for every installed PWA

Deploying `sw.js` early publishes a new cache pointing at files that have not
landed yet. Afterwards, wait about a minute, fully close the PWA from the app
switcher, and reopen it twice.

### Promotion to the product (`Release` branch, from v79)

`main` is the test deploy (GitHub Pages). `Release` is the product (Cloudflare).
Every change lands on `main` first as above and is checked there. Promotion is a
pull request, done in the GitHub web UI:

1. **Pull requests** → **New pull request**
2. **base: `Release`** ← **compare: `main`** (base is where it's going)
3. **Create pull request**, give it the version as a title, **Create**
4. **Merge pull request** → **Confirm merge**. Never delete the branch.

Cloudflare rebuilds from `Release` within a minute or two. Never commit directly
to `Release` — everything goes through `main`, so the two can't drift apart.
Branch names are case-sensitive: it is `Release`, capital R.

### Hotfixes

Bump the cache key only, not `APP_VERSION`. Amend the existing handoff rather
than writing a new one.

---

## Related

- **PATGo Scan** (`exnno/patgoscan`) — a separate barcode-first app for one
  client's audit workflow. Explicitly no merge-back; anything shared is
  hand-rebuilt from a spec.
- **PATGo cloud** — the same codebase with a sync layer added (`sync.js`,
  `cloud.js`, `supabase/`; the architecture spec is kept outside the repo).
  V79 sign-in, V80 push, V81 pull, then one group of records per release —
  V84 reached report settings and templates. Signed out, or on any host not
  listed in `CLOUD_HOSTS`, the app is exactly the offline app it always was.
