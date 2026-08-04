/*!
 * PATGo PWA — storage.js (persistence layer)
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

// v50: returns true if localStorage holds ANY historical "what's new" welcome
// key (pattern 'pat:v<number>welcome'). Used by the first-run-wizard gate to
// recognise a returning user without keeping a state flag per version. Cheap —
// localStorage on this app holds well under a hundred keys. Defensive: any
// access error (private-mode quirks etc.) returns false so a blank install is
// never wrongly treated as onboarded.
function hasAnyLegacyWelcomeKey() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /^pat:v\d+welcome$/.test(k)) return true;
    }
  } catch {
    // ignore — treat as "no welcome key seen"
  }
  return false;
}

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

  // Welcome modal flag. Only the CURRENT welcome (V49) gates the modal, so only
  // its key is read. v50: the 27 historical per-version flag reads (v13…v48) were
  // removed — they were write-once "seen" markers that nothing consumed once their
  // release had passed. Old keys remain harmlessly in users' localStorage; the
  // returning-user heuristic below detects them by prefix, so upgraders are still
  // recognised without keeping a flag per version.
  //
  // v63: reads the DERIVED key (config.js) behind a typeof guard. This single
  // line is where the V61 white screen actually happened: it referenced a
  // version-named constant, and when config.js was a release behind, that
  // identifier did not exist. An undeclared identifier throws a ReferenceError,
  // it threw here inside load(), and nothing above caught it.
  //
  // Two things now make that impossible. The name `WELCOME_KEY` is fixed forever,
  // so config.js and storage.js cannot go out of step on it. And `typeof` on an
  // undeclared identifier is safe and never throws, so even config.js failing to
  // load at all degrades to a missed modal instead of a dead app.
  //
  // The fallback is deliberately TRUE (suppress the modal), not false. If the key
  // is missing we also cannot PERSIST a dismissal — dismissWelcome would have
  // nothing valid to write — so showing it would produce a modal that returns on
  // every single launch. An undismissable modal is a trap; a missed "what's new"
  // is a non-event. Fail towards the harmless one.
  try {
    state.welcomeSeen = (typeof WELCOME_KEY === 'string')
      ? localStorage.getItem(WELCOME_KEY) === '1'
      : true;
  } catch (e) {
    state.welcomeSeen = true;
  }

  // v59: archived half of the lifetime stats counter (tallies of pruned/deleted
  // sessions). Absent on every pre-v59 install, which correctly yields an empty
  // bucket — an upgrader's counter starts from whatever sessions they still have
  // and becomes a true running total from here on.
  state.archivedStats = loadArchivedStats();

  // v56: Retest reminders master switch. OFF unless the user has explicitly
  // turned it on (key holds '1'). Absent / anything else = off, so a fresh
  // install and every existing upgrading user start with the feature invisible.
  state.retestRemindersEnabled = localStorage.getItem(RETEST_REMINDERS_KEY) === '1';

  // v43: cloud prep. Load mock auth state (userId, authToken from PAT_AUTH_KEY).
  // This will persist in the cloud phase; for now it's a passthrough field that
  // survives backup/restore. Defaults to logged-out (null userId/authToken).
  try {
    const authData = JSON.parse(localStorage.getItem(PAT_AUTH_KEY) || 'null');
    if (authData && typeof authData === 'object' && authData.userId) {
      state.userId = authData.userId;
      state.authToken = authData.authToken || null;
      state.authStatus = 'logged-in';
    }
  } catch {
    // Corrupt auth key — default to logged-out
    state.userId = null;
    state.authToken = null;
    state.authStatus = 'logged-out';
  }

  // v33: first-run wizard gate. onboardedV33Seen is set true once the wizard is
  // completed OR skipped. We treat the install as "already onboarded" (so the
  // wizard never shows) if EITHER the flag is set, OR this is clearly a returning
  // user — they already have sessions, an engineer name, or have dismissed any
  // earlier welcome modal. That last clause means existing users upgrading are
  // never shown the wizard; they get the current welcome modal instead. The
  // wizard is reserved for a genuinely blank install. (render-core reads
  // state.onboardedV33Seen to decide.)
  // v50: the "dismissed an earlier modal" test used to read seven retained
  // per-version flags (v18…v32). Those flags are gone; we now detect the same
  // thing — and more thoroughly — by scanning localStorage for ANY historical
  // 'pat:v<n>welcome' key. This is a strict superset of the old clause (it also
  // catches v33…v48 dismissers), so no upgrader is ever mistaken for a new user,
  // while a genuinely blank install still has none and correctly sees the wizard.
  const explicitlyOnboarded = localStorage.getItem(ONBOARD_KEY) === '1';
  const seenAnyWelcome = hasAnyLegacyWelcomeKey();
  const looksLikeReturningUser =
    state.sessions.length > 0 ||
    !!state.engineer ||
    seenAnyWelcome;
  state.onboardedV33Seen = explicitlyOnboarded || looksLikeReturningUser;

  // v17: Sound feedback + Item timestamps. Both default OFF; only an explicit
  // '1' enables them. Anything else (absent key, '0', garbage) reads as off.
  state.soundEnabled = localStorage.getItem(SOUNDFX_KEY) === '1';
  state.timestampsEnabled = localStorage.getItem(TIMESTAMPS_KEY) === '1';

  // v18: Smart Quick Pick. Flag defaults OFF; history is validated defensively
  // so a corrupt key can never wedge the entry screen (falls back to {}).
  state.sqpEnabled = localStorage.getItem(SQP_ENABLED_KEY) === '1';
  state.sqpHistory = loadSqpHistory();

  // v53: Test Readings. Flag defaults OFF (only '1' enables). The fail-reason
  // tag map is loaded and validated defensively: any stored tag that isn't one
  // of READING_FAIL_TAGS is dropped, then the built-in defaults backfill any
  // shipped reason the user hasn't overridden. A reason with no entry at all
  // (e.g. a custom one) is treated as 'visual' at read time by readingTagForReason().
  state.readingsEnabled = localStorage.getItem(READINGS_KEY) === '1';
  state.failReasonTags = loadFailReasonTags();

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

  // v30: PDF Reports settings. Loaded defensively — any corrupt/garbage key
  // collapses to defaults so a bad value can never wedge boot. We merge stored
  // values over a fresh defaults object so a backup/store written by an older or
  // partial writer still gains any field added later (same forward-compat idea
  // as ensureAllCsvColumns). enabled stays whatever was stored (default false).
  state.reportSettings = loadReportSettings();
  state.reportTemplates = loadReportTemplates();   // v36
}

// v59: read the archived stats bucket. Never throws — a corrupt or absent key
// yields a clean empty bucket, so the stats line degrades to "live sessions
// only" rather than breaking the Settings screen.
function loadArchivedStats() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(PAT_STATS_KEY) || 'null');
  } catch (e) {
    stored = null;
  }
  return normaliseArchivedStats(stored);
}

// v59: coerce any candidate object (from localStorage OR a restored backup) into
// a clean archived-stats bucket. Shared by load AND backup-restore so both paths
// enforce identical shape — the same contract normaliseReportSettings honours.
//
// Defensive on every field, because this number is cosmetic and must NEVER be
// able to break a screen or poison a save:
//   • non-object / null / array          → empty bucket
//   • non-finite, negative or fractional  → 0
//   • fails > items                       → clamped to items (an impossible
//     state; clamping keeps the displayed percentage inside 0–100)
//   • types: only string keys with a valid positive count survive; the map is
//     capped to STATS_TYPE_MAP_MAX entries, keeping the highest counts.
function normaliseArchivedStats(stored) {
  const out = makeEmptyArchivedStats();
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return out;

  const cleanInt = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.floor(n);
  };

  out.items = cleanInt(stored.items);
  out.fails = cleanInt(stored.fails);
  if (out.fails > out.items) out.fails = out.items;

  const types = stored.types;
  if (types && typeof types === 'object' && !Array.isArray(types)) {
    const pairs = Object.keys(types)
      .filter(k => typeof k === 'string' && k.trim() !== '')
      .map(k => [k, cleanInt(types[k])])
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, STATS_TYPE_MAP_MAX);
    pairs.forEach(([k, n]) => { out.types[k] = n; });
  }
  return out;
}

// v30: validate + merge stored report settings over defaults. Returns an
// independent object. Never throws.
function loadReportSettings() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(REPORT_SETTINGS_KEY) || 'null');
  } catch (e) {
    stored = null;
  }
  return normaliseReportSettings(stored);
}

// v30: coerce any candidate object (from localStorage OR a restored backup) into
// a complete, type-safe report-settings object merged over the defaults. A
// null/garbage input returns clean defaults. Shared by load + restore so both
// paths enforce identical shape and forward-compat (new fields backfill).
function normaliseReportSettings(stored) {
  const defaults = makeDefaultReportSettings();
  if (!stored || typeof stored !== 'object') return defaults;
  const out = { ...defaults, ...stored };
  out.enabled         = stored.enabled === true;
  out.showEngineer    = stored.showEngineer !== false;
  out.showInstrument  = stored.showInstrument !== false;
  out.showCalibration = stored.showCalibration !== false;
  out.showFails       = stored.showFails !== false;
  // v54: readings on the PDF. Default true — old data/backups without the field
  // backfill to "on". Gated at render time by readingsEnabled + actual data, so
  // a true value is harmless for anyone not using the readings feature.
  out.showReadings    = stored.showReadings !== false;
  // v48: app credit in PDF footer. Default true — old data/backups without the
  // field backfill to the pre-v48 behaviour (credit shown).
  out.showAppCredit   = stored.showAppCredit !== false;
  // v49: PATGo footer logo. Default true (Q1) — old data/backups without the
  // field backfill to "shown". Subordinate to showAppCredit at render time
  // (report.js), but stored independently so the user's preference is preserved
  // even while the credit line is temporarily off.
  out.showFooterLogo  = stored.showFooterLogo !== false;
  // v61: testing time on the PDF. Note the `=== true` — this is the ONLY "show"
  // flag here that defaults OFF (decision Q11=B), so it must NOT use the
  // `!== false` pattern its neighbours use. A settings blob saved before v61 has
  // no such key, and `undefined === true` is false, so every existing user's
  // certificate is byte-identical until they deliberately switch it on.
  out.showDuration    = stored.showDuration === true;
  out.declaration     = stored.declaration !== false;
  out.retestEnabled   = stored.retestEnabled === true;
  const rm = parseInt(stored.retestMonths, 10);
  out.retestMonths    = (Number.isFinite(rm) && rm >= 1 && rm <= 120) ? rm : null;
  out.companyName     = typeof stored.companyName === 'string' ? stored.companyName : '';
  out.companyAddress  = typeof stored.companyAddress === 'string' ? stored.companyAddress : '';
  out.logo            = typeof stored.logo === 'string' ? stored.logo : '';
  // v34: signature is a base64 data URL string like logo (empty if none). The
  // position is constrained to 'left'|'right', anything else falls back to left.
  out.signature       = typeof stored.signature === 'string' ? stored.signature : '';
  out.signaturePosition = (stored.signaturePosition === 'right') ? 'right' : 'left';
  // v35: report colours — normalise to a safe '#rrggbb' or fall back to the
  // default look. Old data/backups/setups without these fields backfill cleanly.
  out.headerColor     = safeHexColor(stored.headerColor, REPORT_DEFAULT_HEADER_COLOR);
  out.accentColor     = safeHexColor(stored.accentColor, REPORT_DEFAULT_ACCENT_COLOR);
  // v36: certificate numbers. certEnabled defaults OFF; prefix is free text; the
  // counter + padding are sane positive integers (garbage → defaults).
  out.certEnabled     = stored.certEnabled === true;
  out.certPrefix      = typeof stored.certPrefix === 'string' ? stored.certPrefix : '';
  const cnn = parseInt(stored.certNextNumber, 10);
  out.certNextNumber  = (Number.isFinite(cnn) && cnn >= 1) ? cnn : 1;
  const cpd = parseInt(stored.certPadding, 10);
  out.certPadding     = (Number.isFinite(cpd) && cpd >= 0 && cpd <= 10) ? cpd : 4;
  out.reportTitle     = (typeof stored.reportTitle === 'string' && stored.reportTitle.trim())
    ? stored.reportTitle : defaults.reportTitle;
  out.declarationText = typeof stored.declarationText === 'string'
    ? stored.declarationText : defaults.declarationText;
  // v31: filename pattern. A non-empty string is kept as-is (tokens are resolved
  // and the result sanitised at build time, so any text is safe here); empty,
  // missing, or non-string falls back to the default pattern.
  out.reportFilenamePattern = (typeof stored.reportFilenamePattern === 'string'
    && stored.reportFilenamePattern.trim())
    ? stored.reportFilenamePattern : defaults.reportFilenamePattern;
  if (out.retestEnabled && out.retestMonths === null) out.retestEnabled = false;
  return out;
}

// v30: persist report settings as one JSON blob.
function saveReportSettings() {
  localStorage.setItem(REPORT_SETTINGS_KEY, JSON.stringify(state.reportSettings || makeDefaultReportSettings()));
}

// v36: report templates. Each template is { id, name, settings } where settings
// is a full reportSettings snapshot (C1=B), normalised through the same shared
// validator so a hand-edited/corrupt entry can't poison the live settings when
// applied. Returns a clean array; never throws. Seeds the starters when nothing
// is stored yet (first run after upgrade).
function loadReportTemplates() {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(REPORT_TEMPLATES_KEY) || 'null'); }
  catch (e) { stored = null; }
  if (!Array.isArray(stored)) return makeStarterReportTemplates();
  const clean = stored
    .filter(t => t && typeof t === 'object')
    .map(t => ({
      id: (typeof t.id === 'string' && t.id) ? t.id : ('tpl_' + Math.random().toString(36).slice(2, 9)),
      name: (typeof t.name === 'string' && t.name.trim()) ? t.name.trim() : 'Untitled template',
      settings: normaliseReportSettings(t.settings)
    }));
  return clean;
}

function saveReportTemplates() {
  localStorage.setItem(REPORT_TEMPLATES_KEY, JSON.stringify(state.reportTemplates || []));
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
  // v56: retest reminders master switch.
  localStorage.setItem(RETEST_REMINDERS_KEY, state.retestRemindersEnabled ? '1' : '0');
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
  // v53: Test Readings on/off flag + fail-reason tag map. The readings DATA
  // itself lives on items inside `sessions` (saved via saveSessions), so the
  // hot logging path needs no change — only this flag and the tag map (both
  // set in Settings, which calls full save()) are written here.
  localStorage.setItem(READINGS_KEY, state.readingsEnabled ? '1' : '0');
  localStorage.setItem(FAIL_REASON_TAGS_KEY, JSON.stringify(state.failReasonTags || {}));
  // v19: Clients & Sites (readable long-key arrays).
  localStorage.setItem(CLIENTS_KEY, JSON.stringify(state.clients || []));
  localStorage.setItem(SITES_KEY, JSON.stringify(state.sites || []));
  // v59: archived stats bucket. Written through the same validator that reads
  // it, so a bad in-memory value can never be persisted — and the type map is
  // capped here as well as on read, which is what actually stops it growing.
  localStorage.setItem(PAT_STATS_KEY, JSON.stringify(normaliseArchivedStats(state.archivedStats)));
  // v30: PDF report settings (single blob incl. logo).
  saveReportSettings();
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

// v53: Test Readings — fail-reason tag store. Tags are kept in their OWN map
// (keyed by reason text) rather than on the failReasons string array, so the
// existing array shape, its backup/setup serialisation, and old restores are
// all unchanged. loadFailReasonTags validates every stored value against
// READING_FAIL_TAGS (drop unknowns), then backfills the shipped defaults for any
// reason the user hasn't explicitly set.
function loadFailReasonTags() {
  let stored = {};
  try {
    const raw = JSON.parse(localStorage.getItem(FAIL_REASON_TAGS_KEY) || 'null');
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) stored = raw;
  } catch {}
  const out = {};
  // Seed defaults first, then let any valid stored override win.
  Object.keys(DEFAULT_FAIL_REASON_TAGS).forEach(reason => {
    out[reason] = DEFAULT_FAIL_REASON_TAGS[reason];
  });
  Object.keys(stored).forEach(reason => {
    const tag = stored[reason];
    if (typeof tag === 'string' && READING_FAIL_TAGS.indexOf(tag) !== -1) {
      out[reason] = tag;
    }
  });
  return out;
}
function saveFailReasonTags() {
  localStorage.setItem(FAIL_REASON_TAGS_KEY, JSON.stringify(state.failReasonTags || {}));
}
// v53: resolve a fail reason's tag. Any reason with no explicit entry — every
// custom reason the user adds, and "Other…" free text — is 'visual' (no
// electrical box on the fail sheet). This is the single read path used by the
// fail flow and the Settings → Fails UI.
function readingTagForReason(reason) {
  const t = state.failReasonTags && state.failReasonTags[reason];
  return (typeof t === 'string' && READING_FAIL_TAGS.indexOf(t) !== -1) ? t : READING_FAIL_TAG_DEFAULT;
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
