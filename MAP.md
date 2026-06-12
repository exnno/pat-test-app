# PAT App — Code Map (V22)

Where each thing lives, so a feature change reads one or two small files instead
of a 5,700-line `app.js`. Load order = the order below. `app.js` no longer
exists — the modular split is complete.
(c) 2026 Peter Birchley. All rights reserved.

> **V22 status:** refactor complete. The remaining `app.js` has been split into
> eleven single-concern files (`clients` → `boot`) and deleted. No behaviour,
> visual, storage, codec or backup change in V21 or V22 — pure code relocation.

## Load order (index.html) — 15 files
`config.js` → `state.js` → `utils.js` → `storage.js` → `clients.js` → `sqp.js`
→ `multipick.js` → `feedback.js` → `csv.js` → `backup.js` → `session.js`
→ `render-core.js` → `render-settings.js` → `events.js` → `boot.js`

`boot.js` runs the startup block and must stay **last**. Later files may call
functions defined in earlier ones; nothing executes until `boot.js` because
every other file is function declarations sharing one global scope.

---

## config.js (~270 ln) — constants & defaults, pure data
`APP_VERSION`; all `*_KEY` localStorage key names; `MULTIPICK_MAX_SLOTS`,
`PRUNE_AGE_DEFAULT`, `CAL_DUE_SOON_DAYS`, `BACKUP_REMINDER_DAYS`,
`BACKUP_SNOOZE_HOURS`; `DEFAULT_ITEM_TYPES`, `DEFAULT_FAIL_REASONS`,
`DEFAULT_DESCRIPTIONS`, `DEFAULT_CSV_COLUMNS`; `CSA_RESISTANCE`, `CALC_LENGTHS`.
*Touch to:* add a storage key, change a default list, edit the calculator tables,
bump the version label.

## state.js (~245 ln) — the global `state` object
The single `let state = { ... }` runtime shape: sessions, form, view, all the
UI transients, welcome-modal flags, SQP/Multi Pick in-memory caches.
*Touch to:* add a new field to runtime state.

## utils.js (~90 ln) — pure helpers (no state access)
`escapeHTML`, `capitalise`, `titleCase`, `formatDate`, `formatTimeShort`,
`formatTimestampCSV`, `splitAssetNo`, `csvEscape`, `csvResultLabel`, `formatBytes`.
*Touch to:* add a stateless formatting/escaping helper.

## storage.js (~480 ln) — persistence boundary
Codec: `STORAGE_CODEC_VERSION`, `SESSION_KEY_MAP`, `ITEM_KEY_MAP` (+ `_REV`),
`encodeWithMap`/`decodeWithMap`, `encode/decodeItem`, `encode/decodeSession`,
`serialiseSessions`, `parseStoredSessions`. Lifecycle: `load`, `loadV11Settings`,
`ensureAllCsvColumns`, `computeHistoryFromItems`, `save`, `getStorageStats`.
*Touch to:* change how data is stored/loaded/migrated. **Data integrity zone —
always backup-round-trip after edits.**

## clients.js (~340 ln) — Clients & Sites (v19, extended v26)
Data model: `loadClients`, `loadSites` (v26: orphan sites allowed — clientId may
be empty), `seedClientsSitesFromSessions`, `clientById`, `siteById`,
`sitesForClient`, `sortedClients`, `findClientByName`, `findSiteByName`,
`ensureClient`, `ensureSite`, `rebuildClientsFromSessions`, `composeSiteSnapshot`,
`splitSiteSnapshot` (v26: snapshot → {client, site} for CSV split),
`unassignedSites` + `ensureOrphanSite` + `findOrphanSiteByName` (v26: clientless
sites). Settings→Clients page actions: `addClientFromDialog`,
`renameClientFromDialog`, `deleteClient`, `addSiteFromDialog`,
`renameSiteFromDialog`, `deleteSite`. v26 assign/move (Q3=B/Q14=B):
`openSiteAssignDialog`, `cancelSiteAssignDialog`, `commitSiteAssign`,
`resolveAssignMerge`, `resolveAssignKeepBoth`, `finishSiteAssign`,
`nextFreeSiteName`.
*Touch to:* change how clients/sites are stored or managed.

## sqp.js (~225 ln) — Smart Quick Pick (v18)
`normaliseSqpLocation`, `normaliseSqpHistory`, `loadSqpHistory`,
`recordSqpUsage`, `buildSqpHistory`, `sqpScoresForLocation`,
`smartOrderedItemTypes`, `sqpRowForLocation`, `invalidateSqpRow`,
`clearSqpHistory`, `rebuildSqpHistory`, `setSqp`.
*Touch to:* change how the quick-pick row adapts to location.

## multipick.js (~125 ln) — Multi Pick (v16)
`normaliseMultiPickConfig`, `loadMultiPickConfig`, `activeMultiPickSlots`,
`multiPickFire`, `saveMultiPickSettings`.
*Touch to:* change the multi-pick bottom sheet behaviour or its settings save.

## feedback.js (~260 ln) — toast + haptic / flash / sound (v17)
`showToast`, `confirmMigrationPrompt`; `_hapticOnce`, `haptic`, `flashEl`
(+ `FLASH_MS`, `FLASH_TINT`), `_getAudioCtx`, `_beep`, `playSound`,
`feedback` (+ `FEEDBACK_HAPTIC_COUNT`).
*Touch to:* change pass/fail/copy feedback channels or toasts.

## csv.js (~600 ln) — CSV build + import (v10/v11, split v26)
Build/share: `csvCellValue` (v26: `client` column + adaptive `site` column — full
snapshot when Client hidden, site-only when shown), `buildCSV`, `defaultHeaderFor`,
`downloadCSV` (+ `SHARE_ICON_SVG`; v26: share payload no longer carries
title/text). Import: `buildCsvHeaderLookup`, `parseCSV`, `parseUkDateToIso`,
`parseImportCSV` (v26: recognises a `Client` column, composes snapshot),
`handleImportFile`, `commitImportedSession` (v26: learns client/site into lists),
`cancelImportConflict`, `closeImportSummary` (+ `EXPECTED_CSV_HEADER`).
*Touch to:* change CSV columns, export, or import parsing.

## backup.js (~265 ln) — Backup / Restore (v7)
`buildBackup`, `downloadBackup`, `markBackupExported`, `snoozeBackupReminder`,
`shouldShowBackupReminder`, `restoreBackupFromFile`.
*Touch to:* change the JSON backup shape or restore path. **Bump `backupVersion`
if the shape changes; keep old-backup compatibility.**

## session.js (~1270 ln) — sessions, items & most logic
Presets (`activePreset`, `switchPreset`, `createPreset`, …); core helpers
(`uid`, `todayISO`, `activeSession`, `normaliseItemType`, `normaliseLocation`,
`calibrationStatus`, `nextAssetNo`, `getCarryForwardLocation`,
`findDuplicateAssetIndex`, `computeSuggestions`, `computeLocationSuggestions`,
`addDescriptionIfNew`, `sortedSessions`, `sessionMatchesControlFilters`,
`filteredSessions`); theme (`applyTheme`); export-state (`exportStatus`,
`markSessionExported`, `markSessionDirty`, `unexportedSessions*`,
`prunableSessions`, `savePruneAge`, `pruneOldSessions`); form
(`loadFormForCursor`); validation (`validateBeforeSave`); actions
(`createSession`, `openSession`, `requestOpenSession`, `deleteSession`,
`saveItem`, `passClicked`, `failClicked`, `pickFailReason`, `copyLastResult`,
`deleteItem`, `moveCursor`, `skipToNew`, `jumpTo`, `setView`, …); bulk-edit &
selection (`enterSelectionMode`, `toggleSelected`, `applyBulk*`, …);
per-page settings saves (`saveUserSettings`, `saveCsvColumnsSettings`,
`moveCsvColumn`, `saveItemTypesSettings`, `resetItemsToDefaults`, `setTheme`,
`setHaptics`, `setSound`, `setTimestamps`, `dismissV19Welcome`,
`dismissV20Welcome`, …).
*Touch to:* most logic changes — session/item lifecycle, suggestions, sorting,
filtering, theme, bulk edit, settings saves. The stranded accessors live here
now (moved from app.js in V22, as planned).

## render-core.js (~1130 ln) — main screens
Owns `const app = document.getElementById('app')`. `render()` dispatcher;
`renderSessions`, `renderEntry`, `renderOverview`, `renderEditSession` and their
partial refreshes (`refreshEntryAfterLog`, `refreshSessionsListAreaOnly`,
`refreshOverviewBody`, `bindOverviewBodyEvents`, `bindSessionsListAreaEvents`,
`renderSessionsListAreaHTML`, `renderBackupReminderBanner`, import modals, the
new-session client/site suggestion helpers).
*Touch to:* change the Sessions list, Entry screen, Overview, or Edit-session UI.

## render-settings.js (~785 ln) — settings screens
`renderSettingsHub`, `renderSettingsSubHeader`, and every `renderSettings*`
sub-page (User, Items, Fails, MultiPick, Descriptions, Display, Backup, Csv,
Clients, Calculator, About, Contact) + calculator helpers (`computeEarthLimit`,
`formatLengthOption`). **About changelog lives here** (`renderSettingsAbout`).
*Touch to:* change any Settings page or roll the About changelog.

## events.js (~805 ln) — event binding
`bindEvents()` (the big per-render rebind) + suggestion re-render helpers
(`renderSuggestionsOnly`, `renderNfSuggestionsOnly`, `renderLocationSuggestionsOnly`).
*Touch to:* wire up a new tappable control (paired with its render file).
**Carry-forward E3 lives here** — delegated listeners would shrink this.

## boot.js (~145 ln) — startup, RUNS ON LOAD, must load LAST
Service worker: `registerServiceWorker`, `showUpdateBanner`, `applyUpdate`,
`dismissUpdateBanner`. v26 boot integrity guard: `bootIntegrityOK()` verifies the
critical cross-file functions all loaded before any storage write; if not, it
shows an "Update needed" reload prompt and SKIPS load()/render()/save() (guards
the v26-era duplicate-const data-loss class). Boot tail: the guard's else-branch
runs `load()`, `applyTheme(state.theme)`, the crash-fallback
`try { loadFormForCursor(); render(); } catch …`; `registerServiceWorker()` runs
regardless.
*Touch to:* change startup sequence, the SW update banner, or the integrity
guard. The crash fallback that prevents a permanent blank screen lives here.
