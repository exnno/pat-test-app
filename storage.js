/*!
 * PAT Test PWA — storage.js (persistence layer)
 * v23 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 *
 * The localStorage boundary: the key-shortening codec, load() (with all
 * migrations), save(), and storage-usage stats. The in-memory state keeps
 * full readable keys everywhere else; compression is applied only here.
 * Backups stay human-readable (long keys) — see backup.js.
 */

// ---------- v14: Storage codec (key-shortening compression) ----------
// Reduces the on-disk size of state.sessions — by far the largest stored
// value — by replacing the long, repeated property names on every session
// and item object with one- or two-character codes before JSON.stringify,
// and expanding them back on read. With thousands of items, the repeated
// field names ("location", "assetNo", "itemType"...) are a big chunk of the
// 5 MB localStorage budget; shortening them typically saves 30–50%.
//
// IMPORTANT design choice: this is a TRANSPARENT codec applied ONLY at the
// save()/load() boundary. The in-memory state.sessions objects keep their
// full, readable property names everywhere else in the app — render code,
// CSV export, import, search etc. are all unchanged and never see short
// keys. That keeps the blast radius tiny and the data debuggable in memory.
//
// Backups (buildBackup / restoreBackupFromFile) deliberately stay in the
// FULL, human-readable long-key format — a backup should be readable and
// portable, not an opaque compressed blob. Only the localStorage copy is
// compressed.
//
// Format detection: the compressed payload is wrapped as
//   { _c: 1, s: [ ...short-key sessions... ] }
// The _c marker (compression version) lets load() tell a compressed blob
// from a legacy plain array. Anything that isn't this shape is treated as
// legacy uncompressed data and read as-is, then re-saved compressed on the
// next save() — a seamless one-way migration with no separate migration
// step and full backward compatibility with v13 and earlier stored data.

const STORAGE_CODEC_VERSION = 1;

// Session-level field map. Long name → short code.
// 'items' is handled specially (its array elements are item objects, encoded
// with ITEM_KEY_MAP). Any session field NOT listed here is passed through
// unchanged under its original name, so future additions are safe even before
// they're added to the map (they just won't be compressed until added).
const SESSION_KEY_MAP = {
  id:          'i',
  name:        'n',
  site:        's',
  engineer:    'e',
  prefix:      'p',
  date:        'd',
  startNumber: 'sn',
  locked:      'l',
  // v14 export-state fields (see below)
  exportedAt:  'xa',
  exportDirty: 'xd'
};

// Item-level field map. Long name → short code.
const ITEM_KEY_MAP = {
  id:       'i',
  assetNo:  'a',
  location: 'o',
  itemType: 't',
  notes:    'm',
  result:   'r',
  // v17: per-item timestamp (ISO string), present only on items logged while
  // Item Timestamps was enabled. Short code 'c' (captured). Absent on items
  // logged before the feature, which cost nothing — encodeWithMap drops
  // undefined values.
  ts:       'c'
};

// Build the reverse maps once.
const SESSION_KEY_MAP_REV = Object.fromEntries(
  Object.entries(SESSION_KEY_MAP).map(([k, v]) => [v, k])
);
const ITEM_KEY_MAP_REV = Object.fromEntries(
  Object.entries(ITEM_KEY_MAP).map(([k, v]) => [v, k])
);

// Encode one object using a forward map, leaving unmapped keys under their
// original name. undefined values are dropped (so absent optional fields cost
// nothing). The 'items' key on sessions is encoded recursively as items.
function encodeWithMap(obj, map, isSession) {
  const out = {};
  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const val = obj[key];
    if (val === undefined) continue;
    if (isSession && key === 'items') {
      out['it'] = Array.isArray(val) ? val.map(encodeItem) : [];
      continue;
    }
    const shortKey = map[key] || key;
    out[shortKey] = val;
  }
  return out;
}

function decodeWithMap(obj, revMap, isSession) {
  const out = {};
  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const val = obj[key];
    if (isSession && key === 'it') {
      out['items'] = Array.isArray(val) ? val.map(decodeItem) : [];
      continue;
    }
    const longKey = revMap[key] || key;
    out[longKey] = val;
  }
  return out;
}

function encodeItem(item)    { return encodeWithMap(item, ITEM_KEY_MAP, false); }
function decodeItem(item)    { return decodeWithMap(item, ITEM_KEY_MAP_REV, false); }
function encodeSession(sess) { return encodeWithMap(sess, SESSION_KEY_MAP, true); }
function decodeSession(sess) { return decodeWithMap(sess, SESSION_KEY_MAP_REV, true); }

// ---------- v23 (E1): per-session encoded cache ----------
// PROBLEM this solves: pre-v23, every save() re-encoded (key-shortened) EVERY
// session and EVERY item in storage, even though a single logged item changes
// only the one session you're working in. On a large database that's thousands
// of object allocations on every PASS tap — work that grows with your total
// history and makes late-in-the-day taps feel sticky.
//
// FIX: cache each session's encoded form, keyed on the session OBJECT itself via
// a WeakMap (so it's automatically dropped when a session is pruned/garbage-
// collected — no manual cleanup, no leak). On the next serialise we reuse a
// session's cached encoding UNLESS we can prove it might have changed.
//
// CORRECTNESS (why this can't silently save stale data — the one real risk):
//   1. The ACTIVE session is ALWAYS re-encoded, cache bypassed. In-place item
//      edits (items[i] = {...}) and appends happen only on the active session
//      during logging, and they keep the same `items` array reference, so this
//      blanket re-encode is what guarantees those edits are never missed.
//   2. For every OTHER session we reuse the cache only when BOTH hold:
//        • the `items` array is the SAME reference as when we cached it, AND
//        • a cheap signature over the session-level fields + item count matches.
//      The only place a non-active session is mutated is CSV import-merge, which
//      REPLACES `target.items` with a new array — changing the reference, which
//      fails check (a) and forces a re-encode. Session-level field edits change
//      the signature and fail check (b). So any change that could alter the
//      serialised output invalidates the cache. There is no dirty flag to forget
//      to set.
//
// Net effect: a save re-encodes the active session (small) instead of the whole
// database. The on-disk string is byte-for-byte identical to the pre-v23 output.
const _encodedSessionCache = new WeakMap();

// Cheap signature over everything serialiseSessions could put on disk for a
// session EXCEPT its items array contents (those are guarded by the array-
// reference identity check + the active-session always-re-encode rule). Pure
// string concatenation of primitives — no object allocation, no JSON.stringify.
function _sessionSig(s) {
  return [
    s.id, s.name, s.site, s.engineer, s.prefix, s.date,
    s.startNumber, s.locked ? 1 : 0,
    s.exportedAt || '', s.exportDirty ? 1 : 0,
    (s.items ? s.items.length : 0)
  ].join('\u0001');
}

// Serialise the sessions array for localStorage in compressed form.
// v23: reuses each session's cached encoding when provably unchanged (see above).
function serialiseSessions(sessions) {
  const activeId = state && state.activeId;
  const encoded = sessions.map(s => {
    // Reuse the cached encoding only for a NON-active session that is provably
    // unchanged. The active session always falls through to a fresh encode.
    if (s.id !== activeId) {
      const cached = _encodedSessionCache.get(s);
      if (cached && cached.itemsRef === s.items && cached.sig === _sessionSig(s)) {
        return cached.encoded;
      }
    }
    // Fresh encode + (re)cache. Refreshing the cache here — including for the
    // active session — means that once you switch away from it, its first save
    // as a non-active session already has an up-to-date entry to reuse.
    const enc = encodeSession(s);
    _encodedSessionCache.set(s, { itemsRef: s.items, sig: _sessionSig(s), encoded: enc });
    return enc;
  });
  const payload = { _c: STORAGE_CODEC_VERSION, s: encoded };
  return JSON.stringify(payload);
}

// Parse a localStorage sessions string. Handles BOTH the new compressed
// wrapper ({_c:1, s:[...]}) and the legacy plain array (v13 and earlier).
// Always returns an array of full-key session objects. On any failure,
// returns an empty array — the same fail-safe behaviour load() had before.
function parseStoredSessions(raw) {
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  // Legacy: a plain array of full-key sessions.
  if (Array.isArray(parsed)) {
    return parsed;
  }
  // Compressed wrapper.
  if (parsed && typeof parsed === 'object' && parsed._c && Array.isArray(parsed.s)) {
    return parsed.s.map(decodeSession);
  }
  // Anything else is unrecognised — treat as empty rather than risk a crash.
  return [];
}

// ---------- State ---------- (moved to state.js)


// ---------- Persistence ----------
function load() {
  // v14: sessions are now stored compressed (key-shortened). parseStoredSessions
  // transparently handles both the new compressed wrapper and the legacy v13
  // plain-array format, so old installs migrate seamlessly on the next save().
  state.sessions = parseStoredSessions(localStorage.getItem(STORAGE_KEY));
  state.activeId = localStorage.getItem(ACTIVE_KEY) || null;

  // v9: presets first — migration logic for users coming from v8 or earlier.
  // Three cases on first v9 load:
  //  (1) Already migrated: ITEM_PRESETS_KEY exists → just load it.
  //  (2) v8 user with custom items: ITEMS_KEY exists, no presets → trigger
  //      first-run prompt to name their list as a preset.
  //  (3) Fresh install: neither key exists → create a "Default" preset with
  //      the new built-in defaults.
  let storedPresets = null;
  try {
    storedPresets = JSON.parse(localStorage.getItem(ITEM_PRESETS_KEY) || 'null');
  } catch {}

  if (Array.isArray(storedPresets) && storedPresets.length) {
    // Case 1: already migrated.
    state.itemPresets = storedPresets;
    state.activePresetId = localStorage.getItem(ACTIVE_PRESET_KEY) || storedPresets[0].id;
    if (!state.itemPresets.find(p => p.id === state.activePresetId)) {
      // Active id no longer valid (shouldn't happen but be safe) — pick first.
      state.activePresetId = storedPresets[0].id;
    }
  } else {
    // Cases 2 and 3 — need to inspect legacy itemTypes.
    let legacyItems = null;
    try {
      legacyItems = JSON.parse(localStorage.getItem(ITEMS_KEY) || 'null');
    } catch {}
    const hasLegacyCustom = Array.isArray(legacyItems) && legacyItems.length > 0;

    if (hasLegacyCustom) {
      // Case 2: prompt user. We pre-create a preset NOW so the app remains
      // usable while the prompt sits — fall back name 'My items' if they cancel.
      // The prompt overwrites the name on confirm.
      const interim = {
        id: 'preset_' + uid(),
        name: 'My items',
        items: legacyItems.slice(0, 9)
      };
      state.itemPresets = [interim];
      state.activePresetId = interim.id;
      state.migrationPrompt = {
        show: true,
        name: '',
        items: legacyItems.slice(0, 9)
      };
    } else {
      // Case 3: fresh install.
      const defaultPreset = {
        id: 'preset_' + uid(),
        name: 'Default',
        items: DEFAULT_ITEM_TYPES.slice()
      };
      state.itemPresets = [defaultPreset];
      state.activePresetId = defaultPreset.id;
    }
  }
  syncItemTypesFromActivePreset();

  try {
    state.failReasons = JSON.parse(localStorage.getItem(FAIL_REASONS_KEY) || 'null') || DEFAULT_FAIL_REASONS.slice();
  } catch { state.failReasons = DEFAULT_FAIL_REASONS.slice(); }

  state.engineer = localStorage.getItem(ENGINEER_KEY) || '';
  state.sort = localStorage.getItem(SORT_KEY) || 'date_desc';

  // v15: load the two Sessions-list filters, validating against known values so
  // a stale/garbage key can never wedge the list into an impossible state.
  const sf = localStorage.getItem(SESSION_FILTER_KEY);
  state.sessionFilter = ['all', 'unexported', 'exported', 'modified'].includes(sf) ? sf : 'all';
  const lf = localStorage.getItem(LOCK_FILTER_KEY);
  state.lockFilter = ['all', 'unlocked', 'locked'].includes(lf) ? lf : 'all';

  // v7: theme + haptics
  const storedTheme = localStorage.getItem(THEME_KEY);
  state.theme = (storedTheme === 'light' || storedTheme === 'dark') ? storedTheme : 'system';
  const storedHaptics = localStorage.getItem(HAPTICS_KEY);
  state.hapticsEnabled = storedHaptics !== '0';   // default true; only '0' disables

  // Migration: ensure all sessions have new fields
  state.sessions.forEach(s => {
    if (s.engineer === undefined) s.engineer = '';
    if (s.prefix === undefined) s.prefix = '';
    if (s.locked === undefined) s.locked = false;   // v8
  });

  // Descriptions list — initialise from existing item history on first v4+ launch.
  // v9: fresh installs (no stored DESCRIPTIONS_KEY and no item history) now seed
  // with DEFAULT_DESCRIPTIONS so the autocomplete is useful out of the box.
  let storedDesc = null;
  try {
    storedDesc = JSON.parse(localStorage.getItem(DESCRIPTIONS_KEY) || 'null');
  } catch {}
  if (Array.isArray(storedDesc)) {
    state.descriptions = storedDesc;
  } else {
    const fromHistory = computeHistoryFromItems();
    state.descriptions = fromHistory.length ? fromHistory : DEFAULT_DESCRIPTIONS.slice();
    localStorage.setItem(DESCRIPTIONS_KEY, JSON.stringify(state.descriptions));
  }

  if (state.activeId && state.sessions.find(s => s.id === state.activeId)) {
    const sess = activeSession();
    // v13: if the active session is locked, don't auto-resume — drop the user
    // back at the Sessions list. The session itself is still there in the list
    // for them to tap into if they want; we just don't open it for them. The
    // "resume where I left off" behaviour applies only to unlocked sessions
    // (i.e. work-in-progress), which is what the user actually wants on
    // re-open. Clearing activeId here means the next save() persists the
    // cleared state — no stale "active" pointer to a locked session.
    if (sess && sess.locked) {
      state.activeId = null;
      state.view = 'sessions';
      state.newForm.show = state.sessions.length === 0;
    } else {
      state.view = 'entry';
      state.cursor = sess.items.length;
    }
  } else {
    state.activeId = null;
    state.view = 'sessions';
    state.newForm.show = state.sessions.length === 0;
  }

  // Default engineer for any new-session form shown
  if (!state.newForm.engineer && state.engineer) {
    state.newForm.engineer = state.engineer;
  }

  // v11: load new keys.
  loadV11Settings();
}

// v11: dedicated loader for the v11 storage keys. Kept out of load() proper so
// the existing migration logic stays compact. Called once from load() and once
// from restoreBackupFromFile() after the backup has been applied.
function loadV11Settings() {
  // CSV column config — JSON array. ensureAllCsvColumns() backfills any new
  // default columns that didn't exist when the user's config was saved,
  // appending them to the end. This makes future column additions safe.
  try {
    const stored = JSON.parse(localStorage.getItem(CSV_COLUMNS_KEY) || 'null');
    if (Array.isArray(stored) && stored.length) {
      state.csvColumns = stored
        .map(c => ({
          id: String(c && c.id || ''),
          header: String(c && c.header || ''),
          visible: !!(c && c.visible)
        }))
        .filter(c => c.id && DEFAULT_CSV_COLUMNS.some(d => d.id === c.id));
    } else {
      state.csvColumns = DEFAULT_CSV_COLUMNS.map(c => ({ ...c }));
    }
  } catch {
    state.csvColumns = DEFAULT_CSV_COLUMNS.map(c => ({ ...c }));
  }
  ensureAllCsvColumns();

  // Backup timing
  state.lastBackupAt = localStorage.getItem(LAST_BACKUP_KEY) || null;
  state.backupSnoozedUntil = localStorage.getItem(BACKUP_SNOOZE_KEY) || null;

  // Tester + calibration.
  // v13: tester field split into make + model. Load the two new keys; if
  // neither has a stored value but the legacy pat:tester key does, migrate
  // the legacy value into testerModel (since users tended to put the
  // specific model name there — "PAT420", "Apollo 600" — sometimes with
  // make prefixed) and clear the old key so we don't migrate twice.
  // Cautious migration: don't try to auto-split on whitespace, that
  // mangles values like "Seaward Apollo 600". The V13 welcome modal flags
  // the change so the user knows to split it themselves on next edit.
  state.testerMake = localStorage.getItem(TESTER_MAKE_KEY) || '';
  state.testerModel = localStorage.getItem(TESTER_MODEL_KEY) || '';
  if (!state.testerMake && !state.testerModel) {
    const legacyTester = localStorage.getItem(TESTER_KEY);
    if (legacyTester) {
      state.testerModel = legacyTester;
      localStorage.removeItem(TESTER_KEY);
    }
  }
  state.calDate = localStorage.getItem(CAL_DATE_KEY) || '';
  state.calCertNo = localStorage.getItem(CAL_CERT_KEY) || '';
  state.calDue = localStorage.getItem(CAL_DUE_KEY) || '';

  // v15: welcome modal flag — key bumped to pat:v15welcome so v14 users see the
  // v15 modal once on update. v13/v14 flags kept loaded for completeness but no
  // longer gate the modal.
  // v16: key bumped again to pat:v16welcome; v15WelcomeSeen now load-only.
  state.v13WelcomeSeen = localStorage.getItem(V13_WELCOME_KEY) === '1';
  state.v14WelcomeSeen = localStorage.getItem(V14_WELCOME_KEY) === '1';
  state.v15WelcomeSeen = localStorage.getItem(V15_WELCOME_KEY) === '1';
  state.v16WelcomeSeen = localStorage.getItem(V16_WELCOME_KEY) === '1';
  state.v17WelcomeSeen = localStorage.getItem(V17_WELCOME_KEY) === '1';
  state.v18WelcomeSeen = localStorage.getItem(V18_WELCOME_KEY) === '1';
  state.v19WelcomeSeen = localStorage.getItem(V19_WELCOME_KEY) === '1';
  state.v26WelcomeSeen = localStorage.getItem(V26_WELCOME_KEY) === '1';

  // v17: Sound feedback + Item timestamps. Both default OFF; only an explicit
  // '1' enables them. Anything else (absent key, '0', garbage) reads as off.
  state.soundEnabled = localStorage.getItem(SOUNDFX_KEY) === '1';
  state.timestampsEnabled = localStorage.getItem(TIMESTAMPS_KEY) === '1';

  // v18: Smart Quick Pick. Flag defaults OFF; history is validated defensively
  // so a corrupt key can never wedge the entry screen (falls back to {}).
  state.sqpEnabled = localStorage.getItem(SQP_ENABLED_KEY) === '1';
  state.sqpHistory = loadSqpHistory();

  // v19: Clients & Sites. Validate defensively (any garbage collapses to []),
  // then seed from existing sessions if BOTH lists are empty — i.e. the first
  // V19 load on an install that has sessions but no client/site data yet. The
  // seed is idempotent: once anything exists in either list it never re-runs,
  // so a user who deletes all their clients on purpose isn't re-seeded.
  state.clients = loadClients();
  state.sites = loadSites();
  if (state.clients.length === 0 && state.sites.length === 0) {
    seedClientsSitesFromSessions();   // writes via save() only if it adds anything
  }

  // v16: Multi Pick config. Validated defensively so a corrupt/garbage key can
  // never wedge the entry screen — falls back to { enabled:false, slots:[] }.
  state.multiPick = loadMultiPickConfig();

  // v14: prune-age setting (months). Clamp to a sane 1–120 range; fall back
  // to the default on anything non-numeric.
  const storedPruneAge = parseInt(localStorage.getItem(PRUNE_AGE_KEY) || '', 10);
  state.pruneAgeMonths = (Number.isFinite(storedPruneAge) && storedPruneAge >= 1 && storedPruneAge <= 120)
    ? storedPruneAge
    : PRUNE_AGE_DEFAULT;
}

// v11: Ensure state.csvColumns contains every column defined in
// DEFAULT_CSV_COLUMNS, in case the user's saved config was written when fewer
// columns existed. Missing columns are appended at the end with their defaults
// (including default visibility) so they're discoverable rather than silently
// hidden.
function ensureAllCsvColumns() {
  const have = new Set(state.csvColumns.map(c => c.id));
  DEFAULT_CSV_COLUMNS.forEach(d => {
    if (!have.has(d.id)) {
      state.csvColumns.push({ ...d });
    }
  });
}

function computeHistoryFromItems() {
  const set = new Set();
  state.sessions.forEach(s => s.items.forEach(it => {
    if (it.itemType) set.add(it.itemType);
  }));
  return Array.from(set);
}

// v23 (E2): save() is split into a HOT path and a COLD path.
//
// Pre-v23, every save() wrote ~25 separate localStorage keys — the sessions blob
// PLUS every settings key (presets, fail reasons, theme, CSV columns, calibration,
// Multi Pick, SQP, clients…) — even when you'd only logged one item and none of
// those settings had changed. Writing 23 unchanged keys on every PASS tap is pure
// waste.
//
//   • saveSessions()  — the HOT path: the two things that actually change when you
//                       log/edit an item (the sessions blob + the active pointer).
//   • saveSettings()  — the COLD path: everything else, written only when a setting
//                       actually changes.
//   • save()          — unchanged behaviour: calls BOTH. Every existing caller keeps
//                       working exactly as before; only the genuinely hot loggers
//                       were repointed at saveSessions() (passClicked, failClicked,
//                       copyLastResult, saveItem, deleteItem, multiPickFire).
//
// Nothing on disk changes: save() still writes the full set. The win is that the
// hot loggers now skip the 23 cold writes.

// HOT: session data only. Called on every logged/edited/deleted item.
function saveSessions() {
  // v14: sessions stored compressed via the key-shortening codec.
  // v23: serialiseSessions reuses cached encodings for unchanged sessions.
  localStorage.setItem(STORAGE_KEY, serialiseSessions(state.sessions));
  localStorage.setItem(ACTIVE_KEY, state.activeId || '');
}

// COLD: all settings/config keys. Called when a setting changes (and by save()).
function saveSettings() {
  // v9: legacy ITEMS_KEY no longer written; ITEM_PRESETS_KEY + ACTIVE_PRESET_KEY are
  // the source of truth. Backup/restore still uses the same logic.
  localStorage.setItem(ITEM_PRESETS_KEY, JSON.stringify(state.itemPresets));
  localStorage.setItem(ACTIVE_PRESET_KEY, state.activePresetId || '');
  localStorage.setItem(FAIL_REASONS_KEY, JSON.stringify(state.failReasons));
  localStorage.setItem(ENGINEER_KEY, state.engineer);
  localStorage.setItem(DESCRIPTIONS_KEY, JSON.stringify(state.descriptions));
  localStorage.setItem(SORT_KEY, state.sort);
  // v15: Sessions-list filters.
  localStorage.setItem(SESSION_FILTER_KEY, state.sessionFilter);
  localStorage.setItem(LOCK_FILTER_KEY, state.lockFilter);
  localStorage.setItem(THEME_KEY, state.theme);
  localStorage.setItem(HAPTICS_KEY, state.hapticsEnabled ? '1' : '0');
  // v11
  localStorage.setItem(CSV_COLUMNS_KEY, JSON.stringify(state.csvColumns));
  // v13: split tester keys; legacy TESTER_KEY is not written.
  localStorage.setItem(TESTER_MAKE_KEY, state.testerMake);
  localStorage.setItem(TESTER_MODEL_KEY, state.testerModel);
  localStorage.setItem(CAL_DATE_KEY, state.calDate);
  localStorage.setItem(CAL_CERT_KEY, state.calCertNo);
  localStorage.setItem(CAL_DUE_KEY, state.calDue);
  // v14: prune-age setting.
  localStorage.setItem(PRUNE_AGE_KEY, String(state.pruneAgeMonths));
  // v16: Multi Pick config (single JSON object).
  localStorage.setItem(MULTIPICK_KEY, JSON.stringify(state.multiPick));
  // v17: Sound feedback + Item timestamps settings.
  localStorage.setItem(SOUNDFX_KEY, state.soundEnabled ? '1' : '0');
  localStorage.setItem(TIMESTAMPS_KEY, state.timestampsEnabled ? '1' : '0');
  // v18: Smart Quick Pick flag + learned history.
  localStorage.setItem(SQP_ENABLED_KEY, state.sqpEnabled ? '1' : '0');
  localStorage.setItem(SQP_HISTORY_KEY, JSON.stringify(state.sqpHistory || {}));
  // v19: Clients & Sites (readable long-key arrays).
  localStorage.setItem(CLIENTS_KEY, JSON.stringify(state.clients || []));
  localStorage.setItem(SITES_KEY, JSON.stringify(state.sites || []));
  // lastBackupAt + backupSnoozedUntil are written via their own helpers
  // (markBackupExported, snoozeBackupReminder) rather than here, because they
  // shouldn't update on every state change.
}

// Full save — sessions + settings. Unchanged behaviour for every existing caller.
function save() {
  saveSessions();
  saveSettings();
}

// v23 (E2): targeted single-key writers. The hot loggers (saveItem,
// copyLastResult) occasionally mutate ONE cold key on append — the learned SQP
// history and/or the descriptions list. Rather than fall back to a full save()
// (and rewrite all 23 cold keys) just to persist one of them, they call the
// matching targeted writer. This keeps the hot path to: sessions (always) + at
// most the one or two cold keys that genuinely changed.
function saveSqpHistory() {
  localStorage.setItem(SQP_HISTORY_KEY, JSON.stringify(state.sqpHistory || {}));
}
function saveDescriptions() {
  localStorage.setItem(DESCRIPTIONS_KEY, JSON.stringify(state.descriptions));
}


// ---------- Storage usage (v7) ----------
function getStorageStats() {
  let bytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key) || '';
      // localStorage strings are UTF-16 internally → ~2 bytes per char
      bytes += (key.length + value.length) * 2;
    }
  } catch {}
  const items = state.sessions.reduce((n, s) => n + (s.items ? s.items.length : 0), 0);
  const sessions = state.sessions.length;
  // Most browsers cap localStorage at ~5MB
  const approxCap = 5 * 1024 * 1024;
  const pct = Math.min(100, Math.round((bytes / approxCap) * 100));
  return { bytes, items, sessions, pct };
}
