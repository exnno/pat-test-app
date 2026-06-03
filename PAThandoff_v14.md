# PAT Test PWA — v14 Notes

**Release:** v14 (June 2026)
**Cache version:** `pat-v14`
**App version label:** `V14`
**Base:** v13 — see `PAThandoff_v13.md` for the v13 design history.

---

## What changed

Two user-requested features plus three supporting additions, all centred on
storage efficiency and export-state tracking. None of the v12.1 / v13
carry-forward items were touched (still parked — see carry-forward below).

### 1. Storage compression — key-shortening codec (Route A)

`state.sessions` is by far the largest value in localStorage, and the repeated
property names on every session and item (`location`, `assetNo`, `itemType`…)
are a big chunk of it. v14 adds a **transparent key-shortening codec** applied
only at the `save()` / `load()` boundary.

**How it works:**
- On save, each session and item object has its long property names mapped to
  one- or two-character codes (`location` → `o`, `assetNo` → `a`, etc.) before
  `JSON.stringify`.
- On load, they're expanded back to full names.
- **The in-memory `state.sessions` always uses full, readable property names.**
  Render code, CSV export, import, search — nothing else sees short keys. The
  blast radius is exactly two functions.

**Format & migration:**
- Compressed payload is wrapped as `{ _c: 1, s: [ …short-key sessions… ] }`.
  The `_c` marker (codec version) distinguishes it from a legacy plain array.
- `parseStoredSessions()` accepts **both** the new wrapper and the legacy v13
  plain array. Legacy data is read as-is and re-saved compressed on the next
  `save()` — a seamless one-way migration with **no separate migration step**.
- On any parse failure it returns `[]` — same fail-safe as the old
  `try/catch` in `load()`.

**Backups stay readable.** `buildBackup()` / `restoreBackupFromFile()`
deliberately keep the **full long-key format**. A backup should be portable and
human-readable, not an opaque blob. Only the localStorage copy is compressed.

**Measured saving:** ~26.5% on a synthetic 20-session / 2,000-item set with
realistic field values. Climbs further on data with many empty fields. (A
lossless round-trip was verified against this set during development.)

**Key maps** (in `app.js`, just before `// ---------- State ----------`):
- `SESSION_KEY_MAP` — session fields. `items` is special-cased to the key `it`
  and its elements are encoded with `ITEM_KEY_MAP`. **Any session field not in
  the map is passed through under its original name**, so future fields are
  safe even before they're added to the map (they just won't be compressed
  until added). The two new v14 export-state fields are already mapped
  (`exportedAt` → `xa`, `exportDirty` → `xd`).
- `ITEM_KEY_MAP` — item fields (`id, assetNo, location, itemType, notes,
  result`).
- `undefined` values are dropped on encode, so absent optional fields cost
  nothing.

> ⚠️ **Diagnostic note:** the live-`app.js` keyword-search deployment check is
> unaffected (that inspects code, not data). But if you inspect **stored data**
> in dev tools, sessions now show short keys. Backups remain fully readable.

### 2. Per-session export tracking

Each session can now carry two optional fields:
- `exportedAt` — ISO timestamp of the last successful **CSV** export of that
  session. Absent → never exported.
- `exportDirty` — `true` when the session has been edited since that export.
  Only meaningful when `exportedAt` is set.

Derived status via `exportStatus(sess)`:
- `'none'` — never exported (no badge)
- `'exported'` — exported, unchanged since (**✓ Exported** green badge)
- `'modified'` — exported, then edited (**✓✎ Modified since export** amber badge)

**Setting the flag:** only the per-session CSV export marks a session exported,
via `markSessionExported()` called from `shareOrDownloadCSV()` — on both the
successful-share path and the direct-download path, but **NOT** when the user
cancels the share sheet (AbortError / NotAllowedError). The backup JSON does
**not** set it.

**Clearing the flag (→ dirty):** `markSessionDirty()` is wired into every
item-mutation path:
- `saveItem()` (pass/fail and edit), `copyLastResult()`, `deleteItem()`
- all four bulk ops: `applyBulkLocation`, `applyBulkType`, `applyBulkNotes`,
  `applyBulkDelete`
- `commitImportedSession()` merge path

`markSessionDirty()` is a no-op if the session was never exported (nothing to
invalidate) or is already dirty.

**Migration:** existing sessions have neither field, so `exportStatus()`
returns `'none'` for all of them on the v14 upgrade — treated as not exported,
exactly as agreed. The fields are added lazily the first time a session is
exported or edited.

### 3. Reopen warning on already-exported sessions

Tapping a session on the Sessions list now routes through
`requestOpenSession()` instead of `openSession()` directly. If the session is
**exported (clean or modified) AND not locked**, a warning modal appears:

> **Already exported**
> You've already exported this session. If you make changes you'll need to
> export it again. *(modified variant: "…and it's been edited since…")*
> [Cancel] [Open anyway]

- **Open anyway** → `confirmReopenWarning()` proceeds to `openSession()`,
  passing through the original opts (e.g. a search-jump cursor) unchanged.
- **Cancel** / × → stays on the Sessions list.
- **Locked (view-only) sessions never prompt** — per spec. Never-exported
  sessions never prompt.
- Shown **every time** such a session is opened (no "don't show again").

State: `state.exportWarnSessionId` holds the pending id while the modal is up;
a module-level `pendingOpenOpts` carries the original opts.

### 4. "N sessions not yet exported" nudge

A small amber line at the top of the Sessions list area showing how many
sessions are **not** in a clean `'exported'` state (i.e. `'none'` or
`'modified'`), via `unexportedSessionCount()`. Hidden when the count is zero,
the list is empty, or a search is active (the search-count takes that slot).
Lives inside `renderSessionsListAreaHTML()` so it refreshes whenever the list
re-renders — including immediately after an export.

### 5. Old-session prune suggestion (manual, not automatic)

On **Backup & Restore**, inside the Storage-usage card:
- If any sessions are **exported AND older than the threshold**
  (`prunableSessions()`), a suggestion appears: *"N exported sessions older
  than X months can be cleared to free space"* with a **Review & clear…**
  button.
- The button runs `pruneOldSessions()`: a strongly-worded confirm listing the
  count, total items, and up to 8 session names, then permanently removes them.
  Nothing is deleted without confirmation. The active session is skipped as a
  guard.
- A new **Clear-old-sessions age** section below lets the user set the
  threshold in months (1–120, default 12), persisted to `pat:pruneagemonths`.

Age is measured from the session `date` (YYYY-MM-DD) against a cutoff computed
by subtracting the threshold months from today.

---

## Version, cache, welcome modal

- `APP_VERSION` → `V14`
- `CACHE_VERSION` → `pat-v14`
- New welcome modal key: `pat:v14welcome`. v13 users see the v14 modal once on
  update. The gate moved from `state.v13WelcomeSeen` to `state.v14WelcomeSeen`;
  `v13WelcomeSeen` is still loaded for completeness but no longer gates
  anything. Old `pat:v13welcome` key is orphaned and harmless.
- `dismissV13Welcome()` renamed to `dismissV14Welcome()`.
- Welcome modal text covers all five v14 changes.
- About page changelog: V14 entry added on top, V11 dropped (rolling
  three-version window — now V14 / V13 / V12).

---

## New storage keys

- `pat:v14welcome` — welcome modal seen flag.
- `pat:pruneagemonths` — prune-age threshold in months (default 12).

(The compressed sessions blob still lives under the existing `pat:sessions`
key — only its internal format changed.)

---

## Files changed (relative to v13)

- `app.js` — codec, export-state model + wiring, reopen warning, nudge, prune
  UI + logic, welcome modal + changelog, version bump.
- `styles.css` — new `.export-badge` (exported / modified), `.export-nudge`,
  `.prune-suggestion` styles; header bump.
- `sw.js` — `CACHE_VERSION` → `pat-v14`, header comment extended.
- `index.html` — unchanged.

---

## Deployment checklist

1. ☐ Open `exnno/pat-test-app` on GitHub web UI.
2. ☐ Replace `app.js`. Commit.
3. ☐ Replace `styles.css`. Commit.
4. ☐ Replace `sw.js`. Commit. **(Cache is `pat-v14`.)**
5. ☐ `index.html` is unchanged — skip it.
6. ☐ Wait ~1 minute for GitHub Pages to redeploy.
7. ☐ On your phone: the **Update available** banner appears. Tap Refresh
   (close-open-close-open the PWA if it's stubborn).
8. ☐ Verify deploy: open the live `app.js` in an incognito window and search
   for `STORAGE_CODEC_VERSION` — present means v14 is live.

---

## Test plan

**Compression / migration (do this first, with a backup in hand)**
- ☐ **Before updating**, export a JSON backup (safety net).
- ☐ Update to v14. Existing sessions all load correctly and show the same
  items, results, locations, notes as before. (Migration happens on the first
  `save()` — adding or editing any item triggers it; or just open and close a
  session.)
- ☐ Backup & Restore → Storage usage: "Storage used" should be **lower** than
  before once a save has run (the compression kicks in on next save).
- ☐ Export a JSON backup from v14, open it in a text viewer — it's still in
  **readable long-key form** (`assetNo`, `location`, etc.), not short keys.
- ☐ Restore a v13 (or older) backup onto v14 — restores cleanly, sessions show
  as not-exported (no badge).

**Export tracking**
- ☐ A brand-new session shows **no** export badge and is counted in the
  "not yet exported" nudge.
- ☐ Export that session's CSV (share or download). Back on the Sessions list it
  now shows **✓ Exported** (green) and the nudge count drops by one.
- ☐ Open it and edit/add/delete an item (or pass/fail one). It changes to
  **✓✎ Modified since export** (amber) and the nudge count goes back up.
- ☐ Export it again → back to **✓ Exported**, nudge drops.
- ☐ Cancel the iOS share sheet instead of completing it → the badge does
  **not** change (no false "exported").
- ☐ A JSON backup export does **not** mark any session as CSV-exported.
- ☐ Bulk-edit (location / type / notes / delete) an exported session → flips to
  Modified. Import-merge into an exported session → flips to Modified.

**Reopen warning**
- ☐ Tap an **exported, unlocked** session → "Already exported" modal appears.
  Cancel → stays on list. Open anyway → opens the session.
- ☐ Tap a **modified-since-export, unlocked** session → modal shows the
  "…edited since…" wording.
- ☐ Tap a **never-exported** session → opens immediately, no modal.
- ☐ Tap a **locked** session (even if exported) → opens immediately, no modal.
- ☐ Search for an item inside an exported session and tap the result → the
  warning still fires, and after Open anyway it jumps to the matched item
  (search-jump cursor preserved through the warning).

**Prune**
- ☐ Backup & Restore → set "Clear-old-sessions age" to a small number (e.g. 1)
  and Save. If you have exported sessions older than that, the suggestion
  appears in the Storage-usage card with a count.
- ☐ Tap **Review & clear…** → confirm dialog lists count, total items, and
  names. Cancel → nothing happens. Confirm → those sessions are removed, others
  untouched, storage drops.
- ☐ Only **exported** sessions older than the threshold are offered — a
  modified-since-export or never-exported old session is **not** included.
- ☐ With no qualifying sessions, the card shows "No exported sessions older
  than N months to clear right now."

**Welcome modal**
- ☐ v13 users updating to v14 see the new modal once with five bullets.
- ☐ Tap Continue — dismisses and doesn't reappear on subsequent launches.

**General regression**
- ☐ v10–v13 regression checks from previous handoffs still pass.
- ☐ Locked-session sort-to-bottom, location-required, tester split, stronger
  delete confirm (all v13) still work.
- ☐ CSV export content unchanged (export-state lives on the session object, not
  in the CSV).

---

## Known quirks / limitations

- **Compression is key-shortening only (Route A).** LZ-string (Route B) was
  discussed and deferred — Route A alone was chosen to stay zero-dependency.
  If the storage ceiling is ever genuinely approached, Route B is the
  escalation (a single vendored MIT file; A and B stack but B alone captures
  most of the available saving since it crushes the same repetition A removes).
- **Stored data is no longer human-readable in dev tools** (short keys).
  Backups remain readable; this was a deliberate trade.
- **Export tracking is per CSV export only.** There's no notion of "which
  columns" or "to whom" — just "this session was exported to CSV at time T,
  and has/hasn't changed since."
- A successful share-sheet **resolve** counts as exported even though iOS
  doesn't tell us the final destination — there's no API to know whether the
  user actually saved/sent it. This matches the agreed definition ("the export
  action completed").

---

## Carry-forward for v15

Still parked from the v12.1 / v13 handoffs (none touched in v14):

- **Hide scrollbar visually but keep scrolling enabled** on the entry screen
  (`scrollbar-width: none` + `::-webkit-scrollbar { display:none }`).
- **Drag-to-reorder CSV columns** (currently arrow-button reorder).
- **Duplicate session.**
- **Item timestamps** (per-item test time → CSV / overview).
- **"Due today" wording polish** on the cal-due chip.

Deferred feature ideas (from earlier brainstorming, not scheduled):

- Retest date / interval per item; test readings storage (Ω / MΩ / W);
  equipment class (I / II / III); asset history lookup; barcode/QR scan; photo
  per item (needs IndexedDB); **PDF certificate export** (long-term plan).

Possible v15 follow-ons specific to v14:

- **Route B (LZ-string)** if storage pressure warrants it.
- **Bulk export** of all unexported sessions in one action (the nudge already
  surfaces the count).
- **"Exported" filter** on the Sessions search/sort.

---

© 2026 Peter Birchley. All rights reserved.
