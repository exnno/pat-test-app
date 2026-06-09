/*!
 * PAT Test PWA
 * v17 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PAT Test PWA — v17 ==============
// Storage uses localStorage — works fully offline, persists across launches.

const APP_VERSION = 'V17';

const STORAGE_KEY = 'pat:sessions';
const ACTIVE_KEY = 'pat:active';
const ITEMS_KEY = 'pat:itemtypes';        // legacy (pre-v9). Read for migration.
const FAIL_REASONS_KEY = 'pat:failreasons';
const ENGINEER_KEY = 'pat:engineer';
const DESCRIPTIONS_KEY = 'pat:descriptions';
const SORT_KEY = 'pat:sort';
const THEME_KEY = 'pat:theme';            // v7: 'system' | 'light' | 'dark'
const HAPTICS_KEY = 'pat:haptics';        // v7: '1' | '0'
const ITEM_PRESETS_KEY = 'pat:itempresets';     // v9: JSON [{id,name,items:[...]}]
const ACTIVE_PRESET_KEY = 'pat:activepreset';   // v9: preset id

// v11: new persistence keys.
//   LAST_BACKUP_KEY     — ISO timestamp of last successful JSON backup export.
//                         Drives the 7-day reminder banner on the Sessions list.
//   BACKUP_SNOOZE_KEY   — ISO timestamp until which the reminder is suppressed.
//                         Set to now + 24h when the user taps "Remind me later"
//                         or dismisses the banner.
//   CSV_COLUMNS_KEY     — JSON array of {id, header, visible} configuring the
//                         CSV export. See DEFAULT_CSV_COLUMNS below.
//   TESTER_KEY, CAL_*   — Optional tester type + calibration info shown on the
//                         User Settings page. v12 update: these now also flow
//                         through to CSV exports via four new default-hidden
//                         columns. Toggle in Settings → CSV Columns.
// v12: WELCOME_KEY renamed from pat:v11welcome → pat:v12welcome. The new modal
//                  fires for everyone again. The old key (if present in storage
//                  from v11 users) is orphaned and harmless — we don't bother
//                  cleaning it up since it's a single string-valued flag.
// v13: tester split into manufacturer + model — two new keys replace
//                  TESTER_KEY. The old key is read once during migration
//                  (loadV11Settings) and its value is dumped into
//                  testerModel (since the existing field was free-form and
//                  the model name is the more specific bit users tend to
//                  recall). Old key is then cleared. WELCOME_KEY rolled
//                  forward to pat:v13welcome for the new modal.
const LAST_BACKUP_KEY = 'pat:lastbackup';
const BACKUP_SNOOZE_KEY = 'pat:backupsnooze';
const CSV_COLUMNS_KEY = 'pat:csvcolumns';
const TESTER_KEY = 'pat:tester';            // v13: legacy. Read for migration only.
const TESTER_MAKE_KEY = 'pat:testermake';   // v13
const TESTER_MODEL_KEY = 'pat:testermodel'; // v13
const CAL_DATE_KEY = 'pat:caldate';
const CAL_CERT_KEY = 'pat:calcert';
const CAL_DUE_KEY = 'pat:caldue';
const V12_WELCOME_KEY = 'pat:v12welcome';   // v13: legacy. Not referenced; left documented.
const V13_WELCOME_KEY = 'pat:v13welcome';   // v14: legacy. Orphaned, harmless.
const V14_WELCOME_KEY = 'pat:v14welcome';   // v15: legacy. Orphaned, harmless.
const V15_WELCOME_KEY = 'pat:v15welcome';   // v16: legacy. Orphaned, harmless.
const V16_WELCOME_KEY = 'pat:v16welcome';   // v16
const V17_WELCOME_KEY = 'pat:v17welcome';   // v17

// v17: Sound feedback (opt-in audio confirmation). Stored as '1'|'0', default
// OFF ('0'). Distinct from haptics — this plays a short Web Audio tone on
// pass/fail/copy. Added because iOS 26.5 patched the <input switch> haptic
// trick the app relied on, leaving newer iPhones with no in-app vibration.
// Sound (plus the always-on visual flash) is the replacement confirmation
// channel for those devices, but it's off until the user turns it on.
const SOUNDFX_KEY = 'pat:soundfx';          // v17: '1' | '0', default '0'

// v17: Item timestamps. Stored as '1'|'0', default OFF ('0'). When ON, each
// item gets a `ts` (ISO string) stamped the moment it's first saved, shown in
// the Overview (HH:MM beneath the item type) and available as a CSV column.
// When OFF, no new stamps are written and existing ones are hidden everywhere.
// Timestamps were deliberately dropped back in v15; this is an opt-in revival,
// so existing users see no change unless they enable it.
const TIMESTAMPS_KEY = 'pat:timestamps';    // v17: '1' | '0', default '0'

// v16: Multi Pick. A single GLOBAL set of up to 6 named, ordered item-type
// sequences, plus a show/hide toggle for the entry-screen button. Stored as one
// JSON object under MULTIPICK_KEY:
//   { enabled: bool, slots: [ { name: string, items: [string, ...] }, ... ] }
// "enabled" gates the full-width Multi Pick button on the entry screen (default
// off — the feature is niche, only worth it on certain jobs). Each slot, when
// tapped, logs its items as PASS in order, auto-numbered, using the current
// Location field. Not tied to the item presets — one set shared everywhere.
// Slots with no items are dropped on save and never shown in the sheet.
const MULTIPICK_KEY = 'pat:multipick';
const MULTIPICK_MAX_SLOTS = 6;

// v15: Sessions-list filter persistence. Two independent filters that combine
// (AND) and sit beside the Sort control. Both default to 'all'.
//   SESSION_FILTER_KEY — export-state filter:
//       'all' | 'unexported' | 'exported' | 'modified'
//       ('unexported' here means status === 'none' — never exported; 'modified'
//        is its own option, distinct from 'unexported'.)
//   LOCK_FILTER_KEY    — lock-state filter: 'all' | 'unlocked' | 'locked'
const SESSION_FILTER_KEY = 'pat:sessionfilter';
const LOCK_FILTER_KEY = 'pat:lockfilter';

// v14: prune-age setting (months). Sessions that are BOTH exported AND older
// than this many months are surfaced as a prune suggestion inside the storage
// indicator on the Backup & Restore page. User-editable there. Default 12.
const PRUNE_AGE_KEY = 'pat:pruneagemonths';
const PRUNE_AGE_DEFAULT = 12;

// v12: calibration status thresholds for the User Settings chip + hub subtitle.
// CAL_DUE_SOON_DAYS — when the next-due date is within this many days from
//                     today, show an amber "Due in N days" chip.
// Anything past the due date is shown as red "Overdue · N days" regardless.
const CAL_DUE_SOON_DAYS = 30;

const BACKUP_REMINDER_DAYS = 7;
const BACKUP_SNOOZE_HOURS = 24;

// v9: built-in defaults updated to Peter's working lists. These ship with fresh
// installs and back stop the "Reset to defaults" button on each settings sub-page.
// Existing users keep whatever they have until they tap Reset.
const DEFAULT_ITEM_TYPES = [
  'Lead', 'AC Adapter', 'Battery Charger',
  'Monitor', 'PC', 'Hub',
  'Extension', 'Fan', 'Heater'
];
const DEFAULT_FAIL_REASONS = [
  'Damaged Plug',
  'Damaged Lead',
  'Damaged Casing',
  'Earth Continuity',
  'Insulation Resistance',
  'Does Not Conform To BS 1363'
];
// v9: alphabetical Item Description list — autocomplete seed for fresh installs
// and the target of the new Reset button on the Item Description List page.
// Capitalisation tightened: AC, PC, USB, TV, CCTV, CD, PAT, NAS, UPS, VoIP,
// iMac, MacBook, Wi-Fi all rendered properly.
const DEFAULT_DESCRIPTIONS = [
  'AC Adapter', 'Air Conditioner', 'Air Fryer', 'Air Purifier', 'Amplifier',
  'Angle Grinder', 'Appliance', 'Barcode Scanner', 'Battery Charger',
  'Bench Grinder', 'Bench Power Supply', 'Blender', 'Cable', 'Camera',
  'Card Reader', 'Cash Drawer', 'CCTV Monitor', 'CD Player', 'Charging Station',
  'Chromebook', 'Circular Saw', 'Clock', 'Coffee Grinder', 'Coffee Machine',
  'Compressor', 'Computer Stand', 'Control Unit', 'Cooker', 'Curling Tongs',
  'Dehumidifier', 'Desk', 'Dishwasher', 'Display', 'Docking Station', 'Drill',
  'Electric Blanket', 'Ethernet Switch', 'Extension Lead', 'Extension Reel',
  'Extractor Fan', 'Fan', 'Fog Machine', 'Food Processor', 'Freezer', 'Fridge',
  'Glue Gun', 'Hair Dryer', 'Hair Straighteners', 'Hand Dryer', 'Hand Mixer',
  'Heat Gun', 'Heater', 'Hot Plate', 'Humidifier', 'iMac',
  'Interactive Whiteboard', 'Iron', 'Jigsaw', 'Juicer', 'Kettle', 'Kettle Base',
  'Keyboard', 'Label Printer', 'Laminator', 'Laptop', 'Lead', 'Light',
  'MacBook', 'Microscope', 'Microwave', 'Mitre Saw', 'Mixer', 'Mixer Amplifier',
  'Modem', 'Monitor', 'Mouse', 'NAS Drive', 'Network Switch', 'Oscilloscope',
  'Oven', 'Paper Cutter', 'Paper Punch', 'Patch Panel', 'PAT Tester', 'PC',
  'Phone Charger', 'Photocopier', 'Portable AC', 'Portable Heater',
  'Portable Projector', 'Portable Speaker', 'Power Supply', 'Pressure Washer',
  'Printer', 'Projector', 'Pump Controller', 'Radio', 'Receipt Printer',
  'Rice Cooker', 'Router', 'Scanner', 'Screen', 'Server', 'Sewing Machine',
  'Shredder', 'Signal Generator', 'Slow Cooker', 'Smart Board', 'Soldering Iron',
  'Soundbar', 'Speaker', 'Speaker System', 'Stage Light', 'Stapler',
  'Steam Cleaner', 'Subwoofer', 'Switch', 'Tablet', 'Test Meter', 'Thin Client',
  'Till', 'Toaster', 'Tripod', 'Tumble Dryer', 'TV', 'UPS', 'USB Charger',
  'Vacuum', 'Vending Machine', 'Visualiser', 'VoIP Phone', 'Washing Machine',
  'Water Boiler', 'Water Cooler', 'Water Pump', 'Whisk', 'Wi-Fi Access Point'
];

// v11: CSV column configuration.
//   id      — internal field key, NEVER renamed by the user. Used to look up
//             the value for each row in buildCSV() and to match incoming
//             columns in parseImportCSV().
//   header  — the column heading written to the CSV. User-customisable on
//             the new CSV Columns settings page; falls back to the default
//             value if blank on save.
//   visible — when false, the column is excluded from exports entirely.
//             Imports still recognise the column by header name when present.
//
// Column order in this list IS the export order. The user can reorder, hide,
// or rename columns via Settings → CSV Columns; the canonical defaults below
// are also what the Reset button restores.
//
// Adding a new column? Append to this list with a unique id, then add a
// matching case to the value-resolver in buildCSV() and the field-binder in
// parseImportCSV(). Old user configs missing the new column will pick it up
// automatically via ensureAllCsvColumns() on next load.
const DEFAULT_CSV_COLUMNS = [
  { id: 'assetNo',     header: 'Asset ID',      visible: true  },
  { id: 'engineer',    header: 'Engineer name', visible: true  },
  { id: 'description', header: 'Description',   visible: true  },
  { id: 'site',        header: 'Site',          visible: true  },
  { id: 'location',    header: 'Location',      visible: true  },
  { id: 'date',        header: 'Date',          visible: true  },
  { id: 'result',      header: 'Result',        visible: true  },
  { id: 'notes',       header: 'Notes',         visible: true  },
  // v12: tester + calibration info, sourced from state.testerMake/Model +
  // state.calDate / state.calCertNo / state.calDue (NOT session-stamped —
  // these are current engineer-global values at export time). Default hidden
  // so existing users' exports don't suddenly grow new columns; turn on via
  // Settings → CSV Columns.
  // v13: 'tester' column now combines testerMake + testerModel (space-
  // separated, trimmed). Default header relabelled to "Test Instrument" to
  // match the User Settings copy; the column id stays 'tester' so existing
  // saved column configs migrate cleanly via ensureAllCsvColumns(). Existing
  // users who customised the header keep their customisation.
  { id: 'tester',      header: 'Test Instrument', visible: false },
  { id: 'calDate',     header: 'Cal. Date',     visible: false },
  { id: 'calCertNo',   header: 'Cal. Cert No.', visible: false },
  { id: 'calDue',      header: 'Cal. Due',      visible: false },
  // v17: per-item timestamp (date + time the item was first logged). Sourced
  // from item.ts (ISO). Default hidden so existing users' exports don't grow a
  // column. Produces blanks when the Item Timestamps setting is OFF, or for
  // items logged before timestamps were enabled. Turn the column on via
  // Settings → CSV Columns; turn capture on via Settings → Display.
  { id: 'time',        header: 'Time',          visible: false }
];

// v8: Resistance calculator — IET Code of Practice Table V1.1 nominal values.
// Earth continuity limit = (0.1 + R)Ω, where R = length × per-metre resistance.
// CSAs and lengths chosen to match pat-testing-training.net/articles/earth-limits.php
const CSA_RESISTANCE = {
  '0.5':  0.039,
  '0.75': 0.026,
  '1.0':  0.0195,
  '1.25': 0.0156,
  '1.5':  0.0133,
  '2.5':  0.008
};
const CALC_LENGTHS = [0.25, 0.5, 0.75, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
  31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50,
  51, 52];

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

// Serialise the sessions array for localStorage in compressed form.
function serialiseSessions(sessions) {
  const payload = {
    _c: STORAGE_CODEC_VERSION,
    s: sessions.map(encodeSession)
  };
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

// ---------- State ----------
let state = {
  sessions: [],
  activeId: null,
  // v9: itemTypes is now derived — see activeItems(). Held in state for read-only
  // convenience by render code; never written to directly. Always sync via
  // syncItemTypesFromActivePreset() after preset edits or switches.
  itemTypes: DEFAULT_ITEM_TYPES.slice(),
  failReasons: DEFAULT_FAIL_REASONS.slice(),
  engineer: '',
  descriptions: [],
  sort: 'date_desc',
  // v15: Sessions-list filters (persisted). Both combine with Sort + each other.
  sessionFilter: 'all',   // 'all' | 'unexported' | 'exported' | 'modified'
  lockFilter: 'all',      // 'all' | 'unlocked' | 'locked'
  view: 'sessions',
  cursor: 0,
  form: { assetNo: '', location: '', itemType: '', notes: '', showNotes: false },
  newForm: { name: '', site: '', engineer: '', prefix: '', startNo: '1', show: false },
  editForm: { name: '', site: '', engineer: '', prefix: '', date: '', locked: false },
  suggestions: [],
  showSuggestions: false,
  failModalOpen: false,
  failModalStage: 'reasons',
  failOtherText: '',
  showFailsOnly: false,
  searchQuery: '',
  // v7
  theme: 'system',                  // 'system' | 'light' | 'dark'
  hapticsEnabled: true,
  selectionMode: false,
  selectedIndices: [],              // absolute indices into sess.items
  bulkLocationDialogOpen: false,
  bulkLocationValue: '',
  updateAvailable: false,
  pendingWorker: null,              // SW that's installed and waiting
  // v8
  calcCsa: '0.75',                  // matches pat-testing-training.net default
  calcLength: 0.75,
  // v9: quick-pick presets — items only.
  // itemPresets: array of { id, name, items: [up to 9 strings] }
  // activePresetId: id of the currently selected preset
  // Selection sticks globally — changing it affects all sessions immediately.
  itemPresets: [],
  activePresetId: null,
  // v9: first-launch prompt. When migrating from v8 with a non-empty existing
  // itemTypes list, we ask the user to name the preset their existing list will
  // become. Set in load() and shown via a modal that blocks the UI.
  migrationPrompt: { show: false, name: '', items: [] },
  // v9: presets management dialog state (rename / new)
  presetDialog: { mode: null, name: '', editingId: null },   // mode: 'new' | 'rename'
  // v10: sessions list search — separate from overview's per-session searchQuery.
  // Matches against session-level fields (site, name, engineer, date) AND
  // item-level fields (assetNo, location, itemType, notes) within each session.
  // A session passes the filter if any field matches. Tapping a session that
  // only matched at the item level jumps straight to the first matched item.
  sessionsSearchQuery: '',
  // v10: per-session location autocomplete on the entry screen. Mirrors the
  // item-type suggestions pattern (state.suggestions / state.showSuggestions)
  // but the source is the active session's existing item locations only —
  // nothing is persisted globally or shared between sessions.
  locationSuggestions: [],
  showLocationSuggestions: false,
  // v10: CSV import — file-pick → parse → optional conflict prompt → optional
  // summary. The two dialogs share this state object. Only one is open at a
  // time; the conflict dialog (if shown) precedes the summary dialog.
  importDialog: {
    conflictOpen: false,
    summaryOpen: false,
    pendingSession: null,         // parsed session awaiting conflict resolution
    conflictExistingId: null,     // id of the existing session that clashed
    summary: null                 // { mode, sessionName, itemCount, skipped: [{row, reason}] }
  },

  // ===== v11 additions =====

  // CSV column configuration. Loaded from localStorage on boot; defaults to a
  // deep copy of DEFAULT_CSV_COLUMNS when no saved config exists. The order of
  // this array IS the export order. Mutated via Settings → CSV Columns.
  csvColumns: DEFAULT_CSV_COLUMNS.map(c => ({ ...c })),

  // Backup-reminder timing. lastBackupAt is set by downloadBackup() after a
  // successful export, and on restoreBackupFromFile() (so users who've just
  // restored aren't immediately nagged). backupSnoozedUntil is set when the
  // user taps "Remind me later" or dismisses the banner.
  lastBackupAt: null,
  backupSnoozedUntil: null,

  // User Settings: tester type + calibration info. All optional, all free text
  // (dates use <input type="date"> so they're stored as ISO YYYY-MM-DD strings).
  // Persisted to localStorage and included in backups. v12: now also flow into
  // CSV exports via the four new default-hidden columns in DEFAULT_CSV_COLUMNS.
  // v13: tester field split into manufacturer + model — two inputs on User
  // Settings, combined back into a single space-separated value at CSV
  // export time (column id 'tester', header now "Test Instrument").
  testerMake: '',
  testerModel: '',
  calDate: '',
  calCertNo: '',
  calDue: '',

  // v13: First-launch welcome modal flag. Renamed from v12WelcomeSeen so the
  // modal fires once for everyone on update to V13.
  v13WelcomeSeen: false,

  // v14: welcome modal flag (key pat:v14welcome). v15: retained for load-time
  // completeness only — no longer gates anything.
  v14WelcomeSeen: false,

  // v15: welcome modal flag (key pat:v15welcome). v16: retained for load-time
  // completeness only — no longer gates anything.
  v15WelcomeSeen: false,

  // v16: welcome modal flag (key pat:v16welcome). v17: retained for load-time
  // completeness only — no longer gates anything.
  v16WelcomeSeen: false,

  // v17: welcome modal flag (key pat:v17welcome). Gates the V17 "what's new"
  // modal so v16 users see it once on update.
  v17WelcomeSeen: false,

  // v17: Sound feedback (opt-in audio confirmation). Default OFF. When ON, a
  // short Web Audio tone plays on pass/fail/copy alongside the haptic call.
  soundEnabled: false,

  // v17: Item timestamps. Default OFF. Gates both capture (stamping item.ts on
  // first save) and display (Overview HH:MM + CSV column output).
  timestampsEnabled: false,

  // v16: Multi Pick config — GLOBAL (not per-preset). enabled gates the
  // entry-screen button; slots is an array of up to 6 { name, items:[strings] }.
  // Loaded/validated via loadMultiPickConfig() + normaliseMultiPickConfig().
  // Only slots with at least one item are kept (and shown).
  multiPick: { enabled: false, slots: [] },

  // v16: Multi Pick bottom-sheet open flag on the entry screen. Cleared on every
  // view transition (setView) and in loadFormForCursor(), same as failModalOpen.
  multiPickSheetOpen: false,

  // v14: prune-age threshold in months. Sessions that are both exported and
  // older than this are offered for pruning in the storage indicator. Loaded
  // from PRUNE_AGE_KEY; editable on the Backup & Restore page.
  pruneAgeMonths: PRUNE_AGE_DEFAULT,

  // v14: reopen warning. When the user opens a session that has already been
  // exported (clean or modified-since), and it's not locked/view-only, we
  // show a one-shot confirm-style modal warning that further edits mean
  // re-exporting. Holds the pending session id while the modal is up; null
  // when no warning is showing.
  exportWarnSessionId: null,

  // v12: Sessions-list search-jump highlight. Set to the cursor index by
  // openSession() when called with an explicit opts.cursor (i.e. the user
  // tapped an item-level search result). Captured + cleared during the next
  // renderEntry() so the CSS keyframe animation runs exactly once. null when
  // no flash is pending — the default state.
  searchJumpCursor: null,

  // Bulk-edit menu state. Replaces v10's single-purpose bulkLocationDialogOpen.
  //   menuOpen — true when the "Edit selected ▾" menu sheet is showing.
  //   mode     — null | 'location' | 'type' | 'notes' | 'delete'. The active
  //              sub-dialog. Only one is open at a time. 'location' preserves
  //              v10's bulkLocationValue path so we don't break that flow.
  //   typeValue, notesValue — text inputs for the type and notes sub-dialogs.
  //   notesMode — 'replace' | 'append'. Replace overwrites existing notes;
  //              append concatenates with '; ' separator (only when both old
  //              and new are non-empty; otherwise no separator).
  bulkEdit: {
    menuOpen: false,
    mode: null,
    typeValue: '',
    notesValue: '',
    notesMode: 'replace'
  }
};

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

  // v17: Sound feedback + Item timestamps. Both default OFF; only an explicit
  // '1' enables them. Anything else (absent key, '0', garbage) reads as off.
  state.soundEnabled = localStorage.getItem(SOUNDFX_KEY) === '1';
  state.timestampsEnabled = localStorage.getItem(TIMESTAMPS_KEY) === '1';

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

function save() {
  // v14: sessions stored compressed via the key-shortening codec.
  localStorage.setItem(STORAGE_KEY, serialiseSessions(state.sessions));
  localStorage.setItem(ACTIVE_KEY, state.activeId || '');
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
  // lastBackupAt + backupSnoozedUntil are written via their own helpers
  // (markBackupExported, snoozeBackupReminder) rather than here, because they
  // shouldn't update on every state change.
}

// ---------- v9: Preset helpers ----------
function activePreset() {
  return state.itemPresets.find(p => p.id === state.activePresetId) || state.itemPresets[0];
}

// Mirrors the active preset's items into state.itemTypes for read-only use by
// the rest of the app (entry screen quick-pick grid, autocomplete dedupe, etc).
// Call after every preset switch or edit.
function syncItemTypesFromActivePreset() {
  const p = activePreset();
  state.itemTypes = p ? p.items.slice() : DEFAULT_ITEM_TYPES.slice();
}

function switchPreset(id) {
  if (!state.itemPresets.find(p => p.id === id)) return;
  state.activePresetId = id;
  syncItemTypesFromActivePreset();
  save(); render();
}

function createPreset(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  const preset = {
    id: 'preset_' + uid(),
    name: trimmed,
    items: DEFAULT_ITEM_TYPES.slice()
  };
  state.itemPresets.push(preset);
  state.activePresetId = preset.id;
  syncItemTypesFromActivePreset();
  save();
  return preset;
}

function renamePreset(id, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return false;
  const p = state.itemPresets.find(x => x.id === id);
  if (!p) return false;
  p.name = trimmed;
  save();
  return true;
}

// Refuses to delete the last remaining preset — there must always be at least one.
function deletePreset(id) {
  if (state.itemPresets.length <= 1) return false;
  const idx = state.itemPresets.findIndex(p => p.id === id);
  if (idx === -1) return false;
  const wasActive = state.activePresetId === id;
  state.itemPresets.splice(idx, 1);
  if (wasActive) {
    // Pick the previous one (or first if we deleted the first).
    state.activePresetId = state.itemPresets[Math.max(0, idx - 1)].id;
    syncItemTypesFromActivePreset();
  }
  save();
  return true;
}

// ---------- v16: Multi Pick helpers ----------
// Validate an arbitrary value (from localStorage or a restored backup) into a
// safe config object. Anything unexpected collapses to { enabled:false,
// slots:[] }. Slot names are trimmed and capped; item entries are trimmed and
// blanks dropped; slots with no items are discarded. Slot count is capped at
// MULTIPICK_MAX_SLOTS.
function normaliseMultiPickConfig(raw) {
  const out = { enabled: false, slots: [] };
  if (!raw || typeof raw !== 'object') return out;
  out.enabled = !!raw.enabled;
  if (Array.isArray(raw.slots)) {
    raw.slots.forEach(s => {
      if (out.slots.length >= MULTIPICK_MAX_SLOTS) return;
      const name = (s && typeof s.name === 'string') ? s.name.trim().slice(0, 40) : '';
      const items = (s && Array.isArray(s.items))
        ? s.items.map(x => String(x || '').trim()).filter(Boolean)
        : [];
      if (items.length) out.slots.push({ name, items });
    });
  }
  return out;
}

function loadMultiPickConfig() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(MULTIPICK_KEY) || 'null'); } catch {}
  return normaliseMultiPickConfig(raw);
}

// Slots that are actually usable (have at least one item). Belt-and-braces: the
// stored config is already filtered, but a hand-edited backup could carry
// empties, so we filter again at the point of use.
function activeMultiPickSlots() {
  return (state.multiPick.slots || []).filter(s => s.items && s.items.length);
}

// Fire a multi-pick: append every item in the chosen slot as a PASS, in order,
// to the END of the active session (never overwriting the item on screen),
// auto-numbering each off the previous one and using the current Location field
// for all of them. Notes are left blank. Lands the cursor on a fresh new item
// afterwards, buzzes the copy-last haptic, and shows an "Added N items" toast.
function multiPickFire(idx) {
  const sess = activeSession();
  if (!sess) return;
  if (sess.locked) return;                       // belt-and-braces; button is disabled too
  const slot = activeMultiPickSlots()[idx];
  if (!slot || !slot.items.length) return;

  // Location is mandatory per item (v13). Multi Pick supplies the item types
  // itself, so we only need a location — applied to every inserted item. If it's
  // missing, close the sheet first so the alert clears to the entry screen with
  // the Location field in view, rather than leaving the sheet covering it.
  const cleanLocation = normaliseLocation(state.form.location);
  if (!cleanLocation) {
    state.multiPickSheetOpen = false;
    render();
    alert('Please enter a location before using Multi Pick — it\'s applied to every item it adds.');
    return;
  }

  slot.items.forEach(typeRaw => {
    const cleanType = normaliseItemType(typeRaw);
    const item = {
      id: uid(),
      assetNo: nextAssetNo(sess),   // recomputed each push off the growing list
      location: cleanLocation,
      itemType: cleanType,
      notes: '',
      result: 'pass'
    };
    // v17: stamp each item on creation, only when timestamps are enabled.
    if (state.timestampsEnabled) item.ts = new Date().toISOString();
    sess.items.push(item);
    addDescriptionIfNew(cleanType);
  });

  const n = slot.items.length;
  markSessionDirty(sess);            // v14: new entries invalidate a prior export
  state.multiPickSheetOpen = false;
  state.cursor = sess.items.length;  // drop onto a fresh new item after the batch
  loadFormForCursor();
  // v17: copy-style feedback (double-buzz / copy tone), matching its existing
  // haptic. The sheet has just closed, so flash the entry-screen Multi Pick
  // button as the visual cue.
  feedback('copy', 'multipick-btn');
  save();
  render();
  showToast(`Added ${n} item${n === 1 ? '' : 's'}`);
}

// v16: save the Multi Pick settings page. Reads the show/hide toggle and all 6
// slot rows from the live DOM in one pass. Each row's sequence input is split on
// commas; blanks dropped. Slots with no items are not stored. Matches the
// "Save = commit" model of the other settings sub-pages (the toggle persists on
// Save too, not instantly).
function saveMultiPickSettings() {
  const enabledEl = document.getElementById('multipick-enabled');
  const enabled = enabledEl ? !!enabledEl.checked : !!state.multiPick.enabled;
  const slots = [];
  document.querySelectorAll('.mp-slot').forEach(row => {
    const nameEl = row.querySelector('.mp-slot-name');
    const seqEl  = row.querySelector('.mp-slot-seq');
    const name = nameEl ? String(nameEl.value || '').trim().slice(0, 40) : '';
    const items = seqEl
      ? String(seqEl.value || '').split(',').map(s => s.trim()).filter(Boolean)
      : [];
    if (items.length) slots.push({ name, items });
  });
  state.multiPick = { enabled, slots: slots.slice(0, MULTIPICK_MAX_SLOTS) };
  save();
  setView('settings');
}

// v16: transient toast — a small auto-dismissing pill at the bottom of the
// screen. Appended directly to <body> (outside #app) so it survives the next
// render() (which rewrites #app and sweeps stray sheets/backdrops, but leaves
// .toast alone). Self-contained: replaces any existing toast, fades in, then
// removes itself after a short delay. No state needed.
let _toastTimer = null;
function showToast(message) {
  document.querySelectorAll('body > .toast').forEach(el => el.remove());
  if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.appendChild(el);
  // Force a reflow so the transition runs, then reveal.
  void el.offsetWidth;
  el.classList.add('toast-show');
  _toastTimer = setTimeout(() => {
    el.classList.remove('toast-show');
    setTimeout(() => el.remove(), 250);   // wait out the fade-out transition
    _toastTimer = null;
  }, 1900);
}

// v9: confirm the migration prompt — sets the chosen name on the interim preset
// created during load(). If name is blank we keep the placeholder 'My items'.
function confirmMigrationPrompt() {
  const name = (state.migrationPrompt.name || '').trim();
  if (name) {
    const p = activePreset();
    if (p) p.name = name;
  }
  state.migrationPrompt = { show: false, name: '', items: [] };
  save();
  render();
}

// ---------- Helpers ----------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayISO = () => new Date().toISOString().slice(0, 10);
const escapeHTML = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function activeSession() { return state.sessions.find(s => s.id === state.activeId); }
const capitalise = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

function titleCase(s) {
  return String(s || '').replace(/\b\w/g, c => c.toUpperCase());
}

function normaliseItemType(s) {
  const trimmed = String(s || '').trim();
  if (!trimmed) return '';
  const match = state.itemTypes.find(t => t.toLowerCase() === trimmed.toLowerCase());
  if (match) return match;
  return titleCase(trimmed);
}

function normaliseLocation(s) {
  return titleCase(String(s || '').trim());
}

function formatDate(iso) {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// v17: format an item timestamp (full ISO) as HH:MM in the device's local
// time, for the Overview row. Returns '' for missing/invalid input so callers
// can omit the line entirely.
function formatTimeShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// v17: format an item timestamp for CSV — full local date + time, e.g.
// "09/06/2026 14:32". The Date column is date-only, so the Time column carries
// the more precise stamp. Local time matches what the engineer saw on screen.
function formatTimestampCSV(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mo}/${yy} ${hh}:${mm}`;
}

// v12: Compute the calibration-due status from state.calDue. Returns null when
// no due date is set (so callers can skip rendering the chip/subtitle entirely)
// or a {status, days} object otherwise. days is always non-negative:
//   - 'overdue' → days past the due date (e.g. {status:'overdue', days:12})
//   - 'soon'    → days remaining until due (e.g. {status:'soon', days:7})
//   - 'ok'      → days remaining (no chip rendered for this state)
// Day count uses date-only comparison (both sides normalised to midnight) so
// the chip flips from 'soon' to 'overdue' at midnight local time, not after a
// rolling 24h window from when the user saved the date.
function calibrationStatus() {
  if (!state.calDue) return null;
  const parts = state.calDue.split('-');
  if (parts.length !== 3) return null;
  const yyyy = parseInt(parts[0], 10);
  const mm   = parseInt(parts[1], 10);
  const dd   = parseInt(parts[2], 10);
  if (!yyyy || !mm || !dd) return null;
  const due = new Date(yyyy, mm - 1, dd);
  if (isNaN(due.getTime())) return null;
  due.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - now.getTime()) / 86400000);
  if (days < 0) return { status: 'overdue', days: -days };
  if (days <= CAL_DUE_SOON_DAYS) return { status: 'soon', days };
  return { status: 'ok', days };
}

function splitAssetNo(s) {
  if (!s) return { prefix: '', number: null };
  const m = String(s).match(/^(.*?)(\d+)$/);
  if (!m) return { prefix: String(s), number: null };
  return { prefix: m[1], number: parseInt(m[2], 10) };
}
function nextAssetNo(session) {
  if (!session.items.length) {
    return (session.prefix || '') + (session.startNumber || 1);
  }
  const last = session.items[session.items.length - 1];
  const split = splitAssetNo(last.assetNo);
  if (split.number == null) {
    return (session.prefix || '') + (session.startNumber + session.items.length);
  }
  return split.prefix + (split.number + 1);
}

function getCarryForwardLocation(sess, cursor) {
  if (!sess || cursor <= 0) return '';
  const prev = sess.items[cursor - 1];
  return prev ? (prev.location || '') : '';
}

function findDuplicateAssetIndex(sess, assetNo, excludeCursor) {
  if (!assetNo) return -1;
  for (let i = 0; i < sess.items.length; i++) {
    if (i === excludeCursor) continue;
    if (sess.items[i].assetNo === assetNo) return i;
  }
  return -1;
}

function computeSuggestions(query) {
  if (!query || query.length < 1) return [];
  const q = query.toLowerCase();
  const quickLower = state.itemTypes.map(t => t.toLowerCase());
  const all = state.descriptions.filter(t => !quickLower.includes(t.toLowerCase()));
  const starts = all.filter(t => t.toLowerCase().startsWith(q) && t.toLowerCase() !== q);
  const contains = all.filter(t => !t.toLowerCase().startsWith(q) && t.toLowerCase().includes(q));
  const merged = [...starts, ...contains];

  // v12: descriptions already used in the current session sort to the top of
  // the suggestion list. Silent reorder — no visual separator or labels. The
  // typed-prefix filter above still applies; this just re-bands the filtered
  // results so session-relevant choices appear first.
  //
  // Rationale: when an engineer is testing a batch of similar items at one
  // site (e.g. 12 kettles in a kitchen), they want their previous choice for
  // this session at fingertip-reach. Global descriptions still appear, just
  // below anything they've actually used here.
  const sess = activeSession();
  const sessionUsed = new Set();
  if (sess) {
    sess.items.forEach(it => {
      const t = (it.itemType || '').toLowerCase();
      if (t) sessionUsed.add(t);
    });
  }
  const sessionFirst = [];
  const others = [];
  merged.forEach(t => {
    if (sessionUsed.has(t.toLowerCase())) sessionFirst.push(t);
    else others.push(t);
  });
  return [...sessionFirst, ...others].slice(0, 5);
}

// v10: Location autofill suggestions — sourced ONLY from the current session's
// existing item locations. Nothing is persisted globally and nothing carries
// over between sessions. Mirrors the item-type autocomplete behaviour: only
// triggers once the user has typed at least one character.
//
// Case handling: we keep distinct casings as separate entries (so "Kitchen"
// and "kitchen" both show if they both exist in the session), but dedupe
// identical strings. Sort order is alphabetical, case-insensitive.
// Cap at 5 to match the item-type list.
function computeLocationSuggestions(query) {
  if (!query || query.length < 1) return [];
  const sess = activeSession();
  if (!sess) return [];
  const q = query.toLowerCase();
  const seen = new Set();
  const distinct = [];
  sess.items.forEach(it => {
    const loc = (it.location || '').trim();
    if (!loc || seen.has(loc)) return;
    seen.add(loc);
    distinct.push(loc);
  });
  const matches = distinct.filter(l => l.toLowerCase().includes(q));
  matches.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return matches.slice(0, 5);
}

function addDescriptionIfNew(desc) {
  const trimmed = String(desc || '').trim();
  if (!trimmed) return;
  const lower = trimmed.toLowerCase();
  const exists = state.descriptions.some(d => d.toLowerCase() === lower);
  if (!exists) state.descriptions.push(trimmed);
}

function sortedSessions() {
  const arr = state.sessions.slice();
  switch (state.sort) {
    case 'date_asc':
      arr.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      break;
    case 'name_asc':
      arr.sort((a, b) => (a.site || a.name || '').localeCompare(b.site || b.name || '', undefined, { sensitivity: 'base' }));
      break;
    case 'name_desc':
      arr.sort((a, b) => (b.site || b.name || '').localeCompare(a.site || a.name || '', undefined, { sensitivity: 'base' }));
      break;
    case 'date_desc':
    default:
      arr.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      break;
  }
  // v13: stable two-tier — unlocked sessions first, locked sessions
  // afterwards, with the selected sort applied within each tier.
  // Locked sessions are read-only archives so this keeps the active
  // work-in-progress sessions at the top of the list regardless of which
  // sort the user has picked. Stable because we partition by filter(),
  // not by re-sorting on a composite key.
  const unlocked = arr.filter(s => !s.locked);
  const locked = arr.filter(s => s.locked);
  return [...unlocked, ...locked];
}

// v15: predicate for the Sessions-list control filters (Status + Lock). The two
// filters combine with AND. 'all' on either axis matches everything on that
// axis. Status maps to exportStatus():
//   'unexported' → status 'none'  (never exported — distinct from 'modified')
//   'exported'   → status 'exported'
//   'modified'   → status 'modified'
// Applied only when not searching (see renderSessionsListAreaHTML).
function sessionMatchesControlFilters(s) {
  if (state.sessionFilter !== 'all') {
    const st = exportStatus(s);
    if (state.sessionFilter === 'unexported' && st !== 'none') return false;
    if (state.sessionFilter === 'exported' && st !== 'exported') return false;
    if (state.sessionFilter === 'modified' && st !== 'modified') return false;
  }
  if (state.lockFilter === 'unlocked' && s.locked) return false;
  if (state.lockFilter === 'locked' && !s.locked) return false;
  return true;
}

// v10: Sessions-list search. Two-pass match:
//   1. Session-level fields (site, name, engineer, formatted date, raw ISO date).
//   2. Item-level fields (assetNo, location, itemType, notes) within each item.
// A session is included if either pass matches. For sessions that *only* matched
// at the item level we record the first matched item's index so the UI can:
//   • Show a "N match in items" badge under the session card
//   • Jump straight to that item when the session is opened.
// Empty query → returns all sessions with matchedItemIndex = -1 (the normal case).
function filteredSessions(sortedList, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return sortedList.map(s => ({ session: s, matchedItemIndex: -1, itemMatchCount: 0 }));
  const out = [];
  for (const s of sortedList) {
    const sessionLevelHit =
      (s.site || '').toLowerCase().includes(q) ||
      (s.name || '').toLowerCase().includes(q) ||
      (s.engineer || '').toLowerCase().includes(q) ||
      (s.date || '').toLowerCase().includes(q) ||
      formatDate(s.date).toLowerCase().includes(q);
    let firstItemHit = -1;
    let itemMatchCount = 0;
    if (Array.isArray(s.items)) {
      for (let i = 0; i < s.items.length; i++) {
        const it = s.items[i];
        if (!it) continue;
        const hit =
          (it.assetNo || '').toLowerCase().includes(q) ||
          (it.location || '').toLowerCase().includes(q) ||
          (it.itemType || '').toLowerCase().includes(q) ||
          (it.notes || '').toLowerCase().includes(q);
        if (hit) {
          if (firstItemHit === -1) firstItemHit = i;
          itemMatchCount++;
        }
      }
    }
    if (sessionLevelHit || firstItemHit !== -1) {
      out.push({
        session: s,
        // Only set the matched index if there was NO session-level hit — otherwise
        // we want the normal open behaviour (jump to end of items as usual).
        matchedItemIndex: (sessionLevelHit ? -1 : firstItemHit),
        itemMatchCount
      });
    }
  }
  return out;
}

// ---------- Theme ----------
// v7: applies user's theme choice. 'system' removes the override and lets the CSS
// media query take effect; 'light'/'dark' force the choice.
// v8 hotfix: only accept the three known values.
// v8-2: switched from data-theme attribute on <html> to a class. iOS Safari in
// PWA mode appears to have a quirk where a data-* attribute on the root element
// disrupts form-input focus delegation — selecting Light or Dark made every
// field across the app un-tappable until the PWA was reinstalled. Using a class
// instead has the same effect on the CSS variables but doesn't trigger the bug.
// We also clean up the legacy data-theme attribute if it's lingering from a
// previous version, so users updating from v8 / v8-1 recover automatically.
function applyTheme(theme) {
  const html = document.documentElement;
  html.classList.remove('theme-force-light', 'theme-force-dark');
  html.removeAttribute('data-theme');
  if (theme === 'light') {
    html.classList.add('theme-force-light');
  } else if (theme === 'dark') {
    html.classList.add('theme-force-dark');
  }
  // 'system' or anything else: no class, prefers-color-scheme media query wins.
}

// ---------- Feedback: haptics + visual flash + sound (v17) ----------
//
// Background: the app's only way to fire a haptic in an iOS PWA was the
// <input type="checkbox" switch> trick below (programmatically clicking a
// hidden switch's label, which WebKit rewarded with a selection haptic). iOS
// 26.5 patched that exact behaviour — a programmatic label click no longer
// produces a haptic; only a real user tap on the switch does. WebKit has never
// exposed navigator.vibrate, so on iOS 26.5+ there is NO programmatic haptic
// path left, and there's no version-sniff that would bring one back.
//
// v17's answer is to confirm actions through THREE channels instead of one:
//   1. Haptic — unchanged. navigator.vibrate on Android; the switch trick on
//      iOS (still works ≤26.4, a harmless no-op on 26.5+). Gated by the
//      existing Haptics setting.
//   2. Visual flash — ALWAYS on, every device. A brief colour pulse on the
//      button that was tapped (green for pass, neutral for copy/multi-pick;
//      fail keeps its own modal flow). This is the real replacement for the
//      lost iOS buzz — it needs no API, no permission, no sound.
//   3. Sound — OPT-IN, default off. A short Web Audio tone, a different one per
//      action (pass / fail / copy) so they're distinguishable on a noisy site.
//
// Call sites use feedback(kind, elId): kind is 'pass' | 'fail' | 'copy', elId
// is the id of the button to flash (optional). The old haptic(count) is kept as
// a thin shim so nothing else has to change, mapping 1→pass, 2→copy, 3→fail.

function _hapticOnce() {
  try {
    const labelEl = document.createElement('label');
    labelEl.setAttribute('aria-hidden', 'true');
    labelEl.style.display = 'none';
    const inputEl = document.createElement('input');
    inputEl.type = 'checkbox';
    inputEl.setAttribute('switch', '');
    labelEl.appendChild(inputEl);
    document.head.appendChild(labelEl);
    labelEl.click();
    document.head.removeChild(labelEl);
  } catch {}
}

// Channel 1: haptic. Unchanged behaviour, still gated by the Haptics setting.
// count: 1 = single, 2 = double, 3 = triple.
function haptic(count) {
  if (!state.hapticsEnabled) return;        // v7: respect user setting
  if (navigator.vibrate) {
    if (count === 1) navigator.vibrate(50);
    else if (count === 2) navigator.vibrate([50, 70, 50]);
    else if (count === 3) navigator.vibrate([50, 70, 50, 70, 50]);
    return;
  }
  // iOS path: works ≤26.4; a harmless no-op on 26.5+ (Apple patched it).
  _hapticOnce();
  if (count >= 2) setTimeout(_hapticOnce, 120);
  if (count >= 3) setTimeout(_hapticOnce, 240);
}

// Channel 2: visual flash. Adds a short-lived class to the named element; the
// CSS animation (styles.css .flash-pass / .flash-neutral) pulses it. Safe to
// call with a missing/disabled element — it just does nothing. The class is
// removed after the animation so it can re-fire on the next tap.
const FLASH_MS = 320;
function flashEl(elId, kind) {
  if (!elId) return;
  const el = document.getElementById(elId);
  if (!el) return;
  const cls = kind === 'pass' ? 'flash-pass' : 'flash-neutral';
  el.classList.remove('flash-pass', 'flash-neutral');
  // Force reflow so re-adding the class restarts the animation on rapid taps.
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => { el.classList.remove(cls); }, FLASH_MS);
}

// Channel 3: sound. A short Web Audio tone, opt-in (state.soundEnabled). One
// shared AudioContext, created lazily on first use (and resumed if the browser
// suspended it — common on iOS until the first user gesture, which a Pass/Fail
// tap satisfies). Distinct tone per action:
//   pass — a single bright, short, pleasant tick (high, quick decay)
//   copy — a mid double-tick (echoes the double-buzz of copy/multi-pick)
//   fail — a lower, longer, buzzier tone (clearly "not a pass")
// Tones are deliberately tiny (≤120ms total) so they never get in the way of
// fast entry. All wrapped in try/catch — audio must never break logging.
let _audioCtx = null;
function _getAudioCtx() {
  try {
    if (!_audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      _audioCtx = new AC();
    }
    if (_audioCtx.state === 'suspended' && _audioCtx.resume) {
      _audioCtx.resume();
    }
    return _audioCtx;
  } catch {
    return null;
  }
}

// Play one beep: frequency (Hz), duration (s), type, and peak gain.
function _beep(ctx, startAt, freq, dur, type, peak) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);
  // Quick attack, exponential decay — gives a clean "tick" rather than a click.
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + dur + 0.02);
}

function playSound(kind) {
  if (!state.soundEnabled) return;
  try {
    const ctx = _getAudioCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (kind === 'pass') {
      // Single bright tick.
      _beep(ctx, t, 880, 0.09, 'sine', 0.18);
    } else if (kind === 'copy') {
      // Mid double-tick.
      _beep(ctx, t,         660, 0.06, 'sine', 0.16);
      _beep(ctx, t + 0.085, 660, 0.06, 'sine', 0.16);
    } else if (kind === 'fail') {
      // Lower, longer, buzzier tone.
      _beep(ctx, t, 220, 0.18, 'sawtooth', 0.14);
    }
  } catch {}
}

// Unified entry point: fire all three channels for an action. kind is
// 'pass' | 'fail' | 'copy'; elId (optional) is the button to flash.
const FEEDBACK_HAPTIC_COUNT = { pass: 1, copy: 2, fail: 3 };
function feedback(kind, elId) {
  haptic(FEEDBACK_HAPTIC_COUNT[kind] || 1);   // channel 1 (respects Haptics setting)
  flashEl(elId, kind);                         // channel 2 (always on)
  playSound(kind);                             // channel 3 (opt-in)
}

// ---------- CSV ----------
function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// v11: result-cell wording for CSV exports only. Maps internal 'pass'/'fail'
// strings (which the app state uses everywhere — entry screen, overview,
// fail-reason notes) to the longer 'Passed'/'Failed' labels Peter prefers in
// CSVs sent to clients. The in-app UI is unchanged; this transformation is
// applied ONLY in buildCSV's value resolver below.
//
// Import recognises both spellings (pass/passed and fail/failed,
// case-insensitive), so old CSVs exported by v10 or earlier still round-trip.
function csvResultLabel(internal) {
  const v = String(internal || '').toLowerCase();
  if (v === 'pass') return 'Passed';
  if (v === 'fail') return 'Failed';
  return '';
}

// v11: resolve the value for a single CSV cell, given the column id, the
// session, and the item. Kept as a flat switch so adding new columns later
// (e.g. tester type, calibration cert) is a single-place edit.
// v12: tester / calDate / calCertNo / calDue cases added. These read from
// state.* (current engineer-global values at export time) rather than from
// the session, so the values that appear in the CSV always reflect what's
// configured in User Settings right now — same engineer, same calibration
// cert, whichever session they're exporting. If the user wants per-session
// snapshots we'd need to start stamping these onto each session at creation
// time; deferring that until there's a real need.
function csvCellValue(colId, session, item) {
  switch (colId) {
    case 'assetNo':     return item.assetNo;
    case 'engineer':    return session.engineer || '';
    case 'description': return item.itemType;
    case 'site':        return session.site;
    case 'location':    return item.location;
    case 'date':        return formatDate(session.date);
    case 'result':      return csvResultLabel(item.result);
    case 'notes':       return item.notes;
    // v12: tester + calibration columns (default-hidden).
    // v13: 'tester' now combines testerMake + testerModel into a single
    // space-separated string. Either field on its own is fine — empty
    // strings drop out via the trim, no leading/trailing whitespace.
    case 'tester':      return [state.testerMake, state.testerModel].filter(Boolean).join(' ').trim();
    case 'calDate':     return state.calDate ? formatDate(state.calDate) : '';
    case 'calCertNo':   return state.calCertNo || '';
    case 'calDue':      return state.calDue ? formatDate(state.calDue) : '';
    // v17: per-item timestamp. Blank when the Item Timestamps setting is OFF
    // (even if the column is visible), and blank for items logged before the
    // feature was enabled.
    case 'time':        return state.timestampsEnabled ? formatTimestampCSV(item.ts) : '';
    default:            return '';
  }
}

// v11: buildCSV is now driven by state.csvColumns. Order in that array IS the
// export order; columns with visible=false are skipped entirely. Header cells
// use the user-customised .header value (which falls back to the default on
// save if blank — see saveCsvColumnsSettings()).
//
// If for some reason every column is hidden (shouldn't happen — save validates
// at least one is visible), we fall back to the default header+order so an
// accidental empty config doesn't yield a totally blank file.
function buildCSV(session) {
  let cols = state.csvColumns.filter(c => c.visible);
  if (cols.length === 0) cols = DEFAULT_CSV_COLUMNS.map(c => ({ ...c }));
  const header = cols.map(c => csvEscape(c.header || defaultHeaderFor(c.id))).join(',');
  const rows = session.items.map(it =>
    cols.map(c => csvEscape(csvCellValue(c.id, session, it))).join(',')
  );
  return [header, ...rows].join('\n');
}

// Lookup the default header text for a column id — used as a last-resort
// fallback if the user-customised header is empty.
function defaultHeaderFor(id) {
  const d = DEFAULT_CSV_COLUMNS.find(x => x.id === id);
  return d ? d.header : '';
}
function downloadCSV(session) {
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + buildCSV(session)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safe = (session.site || session.name || 'session').replace(/[^a-z0-9]+/gi, '_');
  a.href = url; a.download = `PAT_${safe}_${session.date}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// v10: Inline iOS share-style glyph (square with arrow protruding from the top).
// Replaces the ⬇ unicode arrow on Export buttons. Uses currentColor so it
// inherits the surrounding button colour. Used both in the sessions list
// (.icon-btn-sm, muted) and in the overview header (.icon-btn, neutral).
const SHARE_ICON_SVG =
  '<svg class="share-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>' +
  '<line x1="12" y1="3" x2="12" y2="15"/>' +
  '<polyline points="7 8 12 3 17 8"/>' +
  '</svg>';

// v10: Share or download a session's CSV. Prefers the native share sheet via
// Web Share API (iOS Safari, modern Android Chrome) so the engineer can send
// the CSV to a colleague via Messages, Mail, AirDrop, WhatsApp, etc. — which
// pairs naturally with the new Import feature on the receiving end.
//
// Falls back to a direct download when:
//   • navigator.share is not present (desktop browsers, older mobile)
//   • navigator.canShare reports the file isn't shareable (some Android
//     versions support share but not files)
//   • The share API throws a non-Abort error
//
// If the user CANCELS the share sheet (AbortError), we do NOT fall back to a
// download — they explicitly dismissed the share, a sudden download would
// surprise them.
async function shareOrDownloadCSV(session) {
  const BOM = '\uFEFF';
  const csvText = BOM + buildCSV(session);
  const safe = (session.site || session.name || 'session').replace(/[^a-z0-9]+/gi, '_');
  const filename = `PAT_${safe}_${session.date}.csv`;

  // Feature detection — File constructor is also required for navigator.share({files})
  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare && typeof File === 'function') {
    try {
      const file = new File([csvText], filename, { type: 'text/csv' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: filename,
          text: `PAT test results: ${session.site || session.name || 'session'}`
        });
        // v14: share completed → mark this session exported (clears dirty).
        markSessionExported(session);
        save();
        render();
        return;
      }
    } catch (err) {
      // User dismissed the share sheet — respect that, no download, no export mark.
      if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) return;
      // Anything else (e.g. partial support, permission glitch) → fall through to download.
    }
  }
  downloadCSV(session);
  // v14: a direct download always counts as an export.
  markSessionExported(session);
  save();
  render();
}

// v15: Bulk-export every not-yet-cleanly-exported session (status 'none' or
// 'modified') in one action, fired from the tappable "N not yet exported"
// nudge on the Sessions list.
//
// Strategy mirrors shareOrDownloadCSV but for many files:
//   • Preferred path: a single navigator.share with ALL CSVs attached as files.
//     iOS Safari and modern Android Chrome accept multi-file shares; the user
//     picks one destination (Mail, Files, AirDrop…) for the whole batch.
//   • If the platform can't share files (desktop, older mobile) or the file set
//     is rejected by canShare, fall back to sequential downloads with a small
//     stagger (some browsers collapse rapid programmatic downloads).
//
// Export-mark rule matches single export: on a COMPLETED share or the download
// fallback, every batched session is marked exported (clears the nudge). On a
// cancelled share sheet (AbortError / NotAllowedError) NOTHING is marked — the
// user backed out, so the nudge stays exactly as it was.
//
// Per-session CSVs (one file each) are used deliberately rather than one
// concatenated file: the importer refuses multi-session CSVs, so one-file-per
// keeps every export round-trippable back through Import.
async function bulkExportUnexported() {
  const targets = unexportedSessions();
  if (targets.length === 0) return;
  const BOM = '\uFEFF';

  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare && typeof File === 'function') {
    try {
      const files = targets.map(s => {
        const safe = (s.site || s.name || 'session').replace(/[^a-z0-9]+/gi, '_');
        return new File([BOM + buildCSV(s)], `PAT_${safe}_${s.date}.csv`, { type: 'text/csv' });
      });
      if (navigator.canShare({ files })) {
        await navigator.share({
          files,
          title: `PAT export — ${targets.length} session${targets.length === 1 ? '' : 's'}`
        });
        // Share completed → mark all batched sessions exported.
        targets.forEach(markSessionExported);
        save();
        render();
        return;
      }
    } catch (err) {
      // Cancelled share sheet — respect it, mark nothing.
      if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) return;
      // Anything else → fall through to sequential downloads.
    }
  }

  // Fallback: download each CSV in turn, lightly staggered.
  for (const s of targets) {
    downloadCSV(s);
    await new Promise(r => setTimeout(r, 300));
  }
  targets.forEach(markSessionExported);
  save();
  render();
}

// ---------- v10: CSV Import ----------
// v11 update: header-name-based matching. Columns may appear in any order;
// the user may have renamed headers (via Settings → CSV Columns); columns
// they've hidden simply won't be present in their own exports. We accept all
// of these cases as long as we can still resolve the required fields.
//
// Default header names are ALWAYS recognised, so a CSV exported by an
// untouched install (or by another engineer using defaults) still imports
// regardless of the local CSV column config. The user's custom header names
// are recognised in addition to the defaults — never instead of them.
//
// Multi-session CSVs (someone manually concatenated two exports) are still
// refused — see PAThandoff_v10.md flag 1 and PAThandoff_v11.md backlog.

// v11: kept for backward compat (older release notes / handover doc reference
// this), but no longer used as a strict template. Header lookup uses
// buildCsvHeaderLookup() below.
const EXPECTED_CSV_HEADER = ['Asset ID', 'Engineer name', 'Description', 'Site', 'Location', 'Date', 'Result', 'Notes'];

// v11: build a map from (lowercased, trimmed) header text → canonical column
// id, combining the defaults with whatever the user has configured locally.
// Used by parseImportCSV() to identify columns by name in any order.
function buildCsvHeaderLookup() {
  const map = {};
  // Defaults first so they always win on collision (the user could in theory
  // rename "Notes" to "Asset ID"; we keep the default mapping authoritative).
  DEFAULT_CSV_COLUMNS.forEach(d => {
    map[d.header.toLowerCase().trim()] = d.id;
  });
  // Then user customisations — only added if they don't collide with a default.
  state.csvColumns.forEach(c => {
    const key = String(c.header || '').toLowerCase().trim();
    if (key && !(key in map)) map[key] = c.id;
  });
  return map;
}

// Parse a CSV string into an array of row arrays. Handles double-quoted fields,
// escaped quotes (""), and embedded commas/newlines inside quoted fields.
// Returns null if the input is empty or fundamentally malformed.
function parseCSV(text) {
  if (typeof text !== 'string') return null;
  // Strip BOM if present (our own exports prepend \uFEFF)
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          // Escaped quote
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    // Not in quotes
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\n' || c === '\r') {
      row.push(field);
      field = '';
      // Skip \r\n combos
      if (c === '\r' && text[i + 1] === '\n') i++;
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // Trailing field / row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Trim trailing empty rows (last newline in a file produces an empty row)
  while (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
    rows.pop();
  }
  return rows.length ? rows : null;
}

// Convert "DD/MM/YYYY" back to "YYYY-MM-DD". Returns null if not a valid date.
function parseUkDateToIso(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dd = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const yyyy = parseInt(m[3], 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const iso = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  // Round-trip sanity — catches Feb 30 etc.
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d.getTime())) return null;
  if (d.getUTCDate() !== dd || (d.getUTCMonth() + 1) !== mm || d.getUTCFullYear() !== yyyy) return null;
  return iso;
}

// Parse and validate the CSV text into a candidate session. Returns either:
//   { ok: true, session, skipped: [{row, reason}] }
//   { ok: false, error: 'message to show user' }
//
// v11: header-name-based. The first line is parsed for header text, mapped to
// column ids via buildCsvHeaderLookup(), and the resulting positional map is
// used for all subsequent rows. Required columns: Asset ID, Description,
// Site, Date, Result. Engineer, Location, and Notes are optional. If a
// required column is absent from the header, we reject the file with a clear
// message before trying to parse rows.
function parseImportCSV(text) {
  const rows = parseCSV(text);
  if (!rows || rows.length === 0) {
    return { ok: false, error: 'The CSV file is empty.' };
  }

  // Map each header cell to a column id, dropping unknowns.
  const lookup = buildCsvHeaderLookup();
  const headerCells = rows[0].map(h => String(h || '').toLowerCase().trim());
  const colIdAt = headerCells.map(h => lookup[h] || null);

  // Build positional accessors for the required + optional fields.
  const idxOf = id => {
    const i = colIdAt.indexOf(id);
    return i === -1 ? null : i;
  };
  const iAsset  = idxOf('assetNo');
  const iEng    = idxOf('engineer');
  const iDesc   = idxOf('description');
  const iSite   = idxOf('site');
  const iLoc    = idxOf('location');
  const iDate   = idxOf('date');
  const iResult = idxOf('result');
  const iNotes  = idxOf('notes');

  const missing = [];
  if (iAsset  === null) missing.push('Asset ID');
  if (iDesc   === null) missing.push('Description');
  if (iSite   === null) missing.push('Site');
  if (iDate   === null) missing.push('Date');
  if (iResult === null) missing.push('Result');
  if (missing.length) {
    return {
      ok: false,
      error:
        'This file is missing required column' + (missing.length === 1 ? '' : 's') + ': ' +
        missing.join(', ') + '.\n\n' +
        'Imports must be CSVs exported from this app. If you have hidden any of these ' +
        'columns under Settings → CSV Columns, re-enable them before exporting.'
    };
  }

  const dataRows = rows.slice(1);
  if (dataRows.length === 0) {
    return { ok: false, error: 'The CSV file has a header but no rows.' };
  }

  // First-pass scan: find canonical Site + Date from the first VALID row so a
  // single typo on row 1 doesn't reject the whole file.
  let canonicalSite = null;
  let canonicalIsoDate = null;
  let canonicalDateRaw = null;
  let canonicalEngineer = '';
  for (const r of dataRows) {
    const site = String(r[iSite] || '').trim();
    const dateRaw = String(r[iDate] || '').trim();
    const iso = parseUkDateToIso(dateRaw);
    if (site && iso) {
      canonicalSite = site;
      canonicalIsoDate = iso;
      canonicalDateRaw = dateRaw;
      canonicalEngineer = iEng !== null ? String(r[iEng] || '').trim() : '';
      break;
    }
  }
  if (!canonicalSite || !canonicalIsoDate) {
    return {
      ok: false,
      error: 'No rows in this file have both a Site and a valid Date (DD/MM/YYYY). Cannot import.'
    };
  }

  // Check uniqueness — refuse multi-session CSVs.
  const siteLower = canonicalSite.toLowerCase();
  let multiSession = false;
  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    const site = String(r[iSite] || '').trim();
    const dateRaw = String(r[iDate] || '').trim();
    if (!site || !dateRaw) continue;
    if (site.toLowerCase() !== siteLower || dateRaw !== canonicalDateRaw) {
      multiSession = true;
      break;
    }
  }
  if (multiSession) {
    return {
      ok: false,
      error:
        'This file contains rows from more than one session (different Site or Date values).\n\n' +
        'Importing combined CSVs isn\'t supported yet — please export each session separately and import them one at a time.'
    };
  }

  // Build items + collect skipped row reports.
  const items = [];
  const skipped = [];
  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    const rowNum = i + 2; // +1 for header, +1 because humans count from 1
    const assetNo  = String(r[iAsset] || '').trim();
    const desc     = String(r[iDesc] || '').trim();
    const location = iLoc !== null ? String(r[iLoc] || '').trim() : '';
    const dateRaw  = String(r[iDate] || '').trim();
    const resultRawDisplay = String(r[iResult] || '').trim();
    const resultRaw = resultRawDisplay.toLowerCase();
    const notes    = iNotes !== null ? String(r[iNotes] || '').trim() : '';

    if (!assetNo) { skipped.push({ row: rowNum, reason: 'missing Asset ID' }); continue; }
    if (!desc)    { skipped.push({ row: rowNum, reason: 'missing Description' }); continue; }
    if (!dateRaw) { skipped.push({ row: rowNum, reason: 'missing Date' }); continue; }
    if (parseUkDateToIso(dateRaw) === null) {
      skipped.push({ row: rowNum, reason: 'invalid Date format (expected DD/MM/YYYY)' });
      continue;
    }
    // v11: accept both old 'Pass'/'Fail' and new 'Passed'/'Failed' wording,
    // case-insensitive. Normalise to internal 'pass'/'fail' for storage.
    let normResult = null;
    if (resultRaw === 'pass' || resultRaw === 'passed') normResult = 'pass';
    else if (resultRaw === 'fail' || resultRaw === 'failed') normResult = 'fail';
    if (!normResult) {
      skipped.push({ row: rowNum, reason: `invalid Result "${resultRawDisplay}" (expected Passed or Failed)` });
      continue;
    }
    items.push({
      id: uid(),
      assetNo,
      location,
      itemType: desc,
      notes,
      result: normResult
    });
  }
  if (items.length === 0) {
    return {
      ok: false,
      error:
        `No importable rows found in this file.\n\n` +
        `${skipped.length} row${skipped.length === 1 ? '' : 's'} could not be parsed.`
    };
  }
  const session = {
    id: uid(),
    name: `Imported: ${canonicalSite}`,
    site: canonicalSite,
    engineer: canonicalEngineer,
    prefix: '',
    date: canonicalIsoDate,
    startNumber: 1,
    items,
    locked: false
  };
  return { ok: true, session, skipped };
}

// Trigger point: user picked a file on the Sessions screen. We parse, then
// either prompt for conflict, show a summary, or alert on error.
function handleImportFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const result = parseImportCSV(String(e.target.result || ''));
    if (!result.ok) {
      alert(result.error);
      return;
    }
    // Check for an existing session with the same Site (case-insensitive) AND
    // the same Date. If found, ask the user how to proceed.
    const incoming = result.session;
    const existing = state.sessions.find(s =>
      s && s.date === incoming.date &&
      (s.site || '').toLowerCase().trim() === (incoming.site || '').toLowerCase().trim()
    );
    if (existing) {
      state.importDialog.conflictOpen = true;
      state.importDialog.pendingSession = incoming;
      state.importDialog.conflictExistingId = existing.id;
      state.importDialog.summary = { skipped: result.skipped };  // stashed for after resolution
      render();
      return;
    }
    // No conflict — commit straight away.
    commitImportedSession(incoming, 'new', result.skipped);
  };
  reader.onerror = () => alert('Could not read that file.');
  reader.readAsText(file);
}

// Commit a parsed import into state. Mode is one of:
//   'new'       → push the parsed session as-is (no conflict)
//   'duplicate' → push as a separate session even though one already exists
//   'merge'     → append the imported items into the existing session
function commitImportedSession(incoming, mode, skipped) {
  let sessionName = incoming.site;
  let mergedInto = null;
  if (mode === 'merge' && state.importDialog.conflictExistingId) {
    const target = state.sessions.find(s => s.id === state.importDialog.conflictExistingId);
    if (target) {
      // Re-id incoming items to avoid any collision and append.
      const newItems = incoming.items.map(it => ({ ...it, id: uid() }));
      target.items = (target.items || []).concat(newItems);
      markSessionDirty(target);   // v14: merge invalidates a prior export
      mergedInto = target;
      sessionName = target.site || target.name;
    } else {
      // Existing vanished between prompt and confirm — fall through to duplicate.
      state.sessions.unshift(incoming);
    }
  } else {
    // new or duplicate — same behaviour, push to the top of the list.
    state.sessions.unshift(incoming);
  }
  state.importDialog = {
    conflictOpen: false,
    summaryOpen: true,
    pendingSession: null,
    conflictExistingId: null,
    summary: {
      mode,
      sessionName,
      itemCount: incoming.items.length,
      skipped: skipped || []
    }
  };
  // Add any new item-type descriptions to the global descriptions list so
  // autocomplete benefits from imported data immediately.
  incoming.items.forEach(it => addDescriptionIfNew(it.itemType));
  save();
  render();
}

function cancelImportConflict() {
  state.importDialog = {
    conflictOpen: false,
    summaryOpen: false,
    pendingSession: null,
    conflictExistingId: null,
    summary: null
  };
  render();
}

function closeImportSummary() {
  state.importDialog = {
    conflictOpen: false,
    summaryOpen: false,
    pendingSession: null,
    conflictExistingId: null,
    summary: null
  };
  render();
}

// ---------- Backup / Restore (v7) ----------
// Full app state -> downloadable .json file. Restore replaces all current data.
// v9: now includes itemPresets + activePresetId. Backups missing these fields
// fall back to converting the legacy itemTypes array into a single 'Default'
// preset, so old backups still restore cleanly.
// v11: bumped to backupVersion: 3. Added csvColumns, tester, calDate,
// calCertNo, calDue, and lastBackupAt. Old backups still restore — missing
// fields use defaults.
function buildBackup() {
  return {
    appVersion: APP_VERSION,
    backupVersion: 3,                         // v11 bumped from 2 → 3
    exportedAt: new Date().toISOString(),
    sessions: state.sessions,
    itemPresets: state.itemPresets,           // v9
    activePresetId: state.activePresetId,     // v9
    itemTypes: state.itemTypes,               // legacy mirror for backward compat
    failReasons: state.failReasons,
    descriptions: state.descriptions,
    engineer: state.engineer,
    sort: state.sort,
    theme: state.theme,
    hapticsEnabled: state.hapticsEnabled,
    // v11
    csvColumns: state.csvColumns,
    // v13: tester now split. Old backups (with .tester) load via the
    // legacy fallback in restoreBackupFromFile().
    testerMake: state.testerMake,
    testerModel: state.testerModel,
    calDate: state.calDate,
    calCertNo: state.calCertNo,
    calDue: state.calDue,
    // v16: Multi Pick config.
    multiPick: state.multiPick,
    // v17: feedback + timestamp settings.
    soundEnabled: state.soundEnabled,
    timestampsEnabled: state.timestampsEnabled,
    lastBackupAt: state.lastBackupAt
  };
}

function downloadBackup() {
  const payload = buildBackup();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `PAT_backup_${todayISO()}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  // v11: stamp the successful export so the 7-day reminder timer resets.
  markBackupExported();
}

// v11: stamp the current time as the "last successful export" and clear any
// active snooze. Called from downloadBackup() and from restoreBackupFromFile()
// (since restoring a backup is itself a sign the user is on top of their
// backups — no need to nag them immediately afterwards).
function markBackupExported() {
  state.lastBackupAt = new Date().toISOString();
  state.backupSnoozedUntil = null;
  localStorage.setItem(LAST_BACKUP_KEY, state.lastBackupAt);
  localStorage.removeItem(BACKUP_SNOOZE_KEY);
}

// v11: snooze the reminder for 24 hours. Called from the "Remind me later"
// button and the × dismiss control on the banner.
function snoozeBackupReminder() {
  const until = new Date(Date.now() + BACKUP_SNOOZE_HOURS * 3600 * 1000).toISOString();
  state.backupSnoozedUntil = until;
  localStorage.setItem(BACKUP_SNOOZE_KEY, until);
}

// v11: should the banner show on the Sessions list right now?
// Conditions:
//   • current view is 'sessions' AND no new-session form is open (would crowd
//     the screen);
//   • lastBackupAt is missing OR was more than BACKUP_REMINDER_DAYS ago;
//   • backupSnoozedUntil is missing or already passed.
function shouldShowBackupReminder() {
  if (state.view !== 'sessions') return false;
  if (state.newForm.show) return false;
  // Don't show on a totally empty install — nothing to back up yet.
  if (state.sessions.length === 0) return false;
  const now = Date.now();
  if (state.backupSnoozedUntil) {
    const snoozeMs = Date.parse(state.backupSnoozedUntil);
    if (!isNaN(snoozeMs) && snoozeMs > now) return false;
  }
  if (!state.lastBackupAt) return true; // never backed up
  const lastMs = Date.parse(state.lastBackupAt);
  if (isNaN(lastMs)) return true;
  const ageDays = (now - lastMs) / (1000 * 3600 * 24);
  return ageDays >= BACKUP_REMINDER_DAYS;
}

function restoreBackupFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    let data;
    try {
      data = JSON.parse(e.target.result);
    } catch (err) {
      alert('That file isn\'t a valid backup — JSON could not be read.');
      return;
    }
    if (!data || !Array.isArray(data.sessions)) {
      alert('That file isn\'t a recognised PAT Test backup. Make sure you picked a file exported from this app.');
      return;
    }
    const itemCount = data.sessions.reduce((n, s) => n + (Array.isArray(s.items) ? s.items.length : 0), 0);
    const ok = confirm(
      `Restore from backup?\n\n` +
      `This file contains:\n` +
      `• ${data.sessions.length} session${data.sessions.length === 1 ? '' : 's'}\n` +
      `• ${itemCount} item${itemCount === 1 ? '' : 's'} in total\n` +
      `• Exported ${data.exportedAt ? new Date(data.exportedAt).toLocaleString() : 'unknown date'}\n\n` +
      `This will REPLACE all current data on this device. This cannot be undone.\n\n` +
      `Continue?`
    );
    if (!ok) return;
    // Apply
    state.sessions = data.sessions;
    // v9: preset restoration. Three cases:
    //   New backup with presets → use directly.
    //   Old backup with itemTypes only → convert to a single 'Default' preset.
    //   Neither → fall back to defaults.
    if (Array.isArray(data.itemPresets) && data.itemPresets.length) {
      state.itemPresets = data.itemPresets;
      state.activePresetId = (typeof data.activePresetId === 'string'
        && data.itemPresets.find(p => p.id === data.activePresetId))
        ? data.activePresetId
        : data.itemPresets[0].id;
    } else if (Array.isArray(data.itemTypes) && data.itemTypes.length) {
      const p = { id: 'preset_' + uid(), name: 'Default', items: data.itemTypes };
      state.itemPresets = [p];
      state.activePresetId = p.id;
    } else {
      const p = { id: 'preset_' + uid(), name: 'Default', items: DEFAULT_ITEM_TYPES.slice() };
      state.itemPresets = [p];
      state.activePresetId = p.id;
    }
    syncItemTypesFromActivePreset();
    state.failReasons = Array.isArray(data.failReasons) && data.failReasons.length ? data.failReasons : DEFAULT_FAIL_REASONS.slice();
    state.descriptions = Array.isArray(data.descriptions) ? data.descriptions : [];
    state.engineer = typeof data.engineer === 'string' ? data.engineer : '';
    state.sort = typeof data.sort === 'string' ? data.sort : 'date_desc';
    if (data.theme === 'light' || data.theme === 'dark' || data.theme === 'system') {
      state.theme = data.theme;
      applyTheme(state.theme);
    }
    if (typeof data.hapticsEnabled === 'boolean') {
      state.hapticsEnabled = data.hapticsEnabled;
    }

    // v11: restore the new fields if present, otherwise leave defaults intact.
    if (Array.isArray(data.csvColumns) && data.csvColumns.length) {
      // Re-validate the same way loadV11Settings does — drop unknown ids,
      // coerce types, then backfill missing defaults.
      state.csvColumns = data.csvColumns
        .map(c => ({
          id: String(c && c.id || ''),
          header: String(c && c.header || ''),
          visible: !!(c && c.visible)
        }))
        .filter(c => c.id && DEFAULT_CSV_COLUMNS.some(d => d.id === c.id));
      ensureAllCsvColumns();
    } else {
      state.csvColumns = DEFAULT_CSV_COLUMNS.map(c => ({ ...c }));
    }
    // v13: split tester restore. New backups carry testerMake / testerModel;
    // older v11 / v12 backups carry the single .tester field — we dump that
    // into testerModel for the same reason as the localStorage migration.
    if (typeof data.testerMake === 'string' || typeof data.testerModel === 'string') {
      state.testerMake = typeof data.testerMake === 'string' ? data.testerMake : '';
      state.testerModel = typeof data.testerModel === 'string' ? data.testerModel : '';
    } else if (typeof data.tester === 'string') {
      state.testerMake = '';
      state.testerModel = data.tester;
    } else {
      state.testerMake = '';
      state.testerModel = '';
    }
    state.calDate = typeof data.calDate === 'string' ? data.calDate : '';
    state.calCertNo = typeof data.calCertNo === 'string' ? data.calCertNo : '';
    state.calDue = typeof data.calDue === 'string' ? data.calDue : '';

    // v16: Multi Pick config — validate through the same normaliser used on
    // load. Missing/old backups collapse to { enabled:false, slots:[] }.
    state.multiPick = normaliseMultiPickConfig(data.multiPick);

    // v17: feedback + timestamp settings. Booleans only; older backups without
    // these keys leave the defaults (both off) intact.
    if (typeof data.soundEnabled === 'boolean') {
      state.soundEnabled = data.soundEnabled;
    }
    if (typeof data.timestampsEnabled === 'boolean') {
      state.timestampsEnabled = data.timestampsEnabled;
    }

    state.activeId = null;
    state.view = 'sessions';
    state.cursor = 0;
    state.newForm.show = false;
    save();
    // v11: stamp the restore as a fresh backup checkpoint so we don't nag the
    // user the moment they restore from a known-good file.
    markBackupExported();
    alert(`Restored ${data.sessions.length} session${data.sessions.length === 1 ? '' : 's'} (${itemCount} item${itemCount === 1 ? '' : 's'}).`);
    render();
  };
  reader.onerror = () => alert('Could not read that file.');
  reader.readAsText(file);
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

function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

// ---------- v14: Session export-state ----------
// Each session can carry two optional fields:
//   exportedAt   — ISO timestamp of the last successful CSV export of THIS
//                  session. Absent/empty → never exported.
//   exportDirty  — true when the session has been edited since that export.
//                  Only meaningful when exportedAt is set.
//
// Derived status (exportStatus) is one of:
//   'none'     — never exported (no badge)
//   'exported' — exported and unchanged since (✓ badge)
//   'modified' — exported, then edited (✓✎ badge)
//
// Only the per-session CSV export sets exportedAt (backup JSON does NOT).
// Any change to a session's items (pass/fail, copy-last, edit, delete, bulk
// edit, import-merge) flips exportDirty true via markSessionDirty().

function exportStatus(sess) {
  if (!sess || !sess.exportedAt) return 'none';
  return sess.exportDirty ? 'modified' : 'exported';
}

// Mark a session exported "now" and clear the dirty flag. Called after a
// successful CSV export only. Does NOT call save()/render() itself — the
// caller decides, since the export path is async.
function markSessionExported(sess) {
  if (!sess) return;
  sess.exportedAt = new Date().toISOString();
  sess.exportDirty = false;
}

// Flag a session as edited-since-export. No-op if it was never exported
// (nothing to invalidate) or already marked dirty. Returns true if it
// actually changed something, so callers can decide whether to re-save.
function markSessionDirty(sess) {
  if (!sess || !sess.exportedAt) return false;
  if (sess.exportDirty) return false;
  sess.exportDirty = true;
  return true;
}

// Count sessions not in a clean 'exported' state (i.e. 'none' or 'modified').
// Drives the "N sessions not yet exported" nudge on the Sessions list.
function unexportedSessionCount() {
  return state.sessions.filter(s => exportStatus(s) !== 'exported').length;
}

// v15: the actual session objects behind that count (status 'none' or
// 'modified'), in the current display order so a batch export produces files
// in a sensible sequence. Drives the tappable bulk-export nudge.
function unexportedSessions() {
  return sortedSessions().filter(s => exportStatus(s) !== 'exported');
}

// v14: sessions eligible for pruning — exported AND older than the configured
// age threshold. Age is measured from the session date (YYYY-MM-DD). Returns
// the matching session objects (newest first by date) for the prune dialog.
function prunableSessions() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - (state.pruneAgeMonths || PRUNE_AGE_DEFAULT));
  const cutoffISO = cutoff.toISOString().slice(0, 10);
  return state.sessions
    .filter(s => exportStatus(s) === 'exported' && (s.date || '') !== '' && s.date < cutoffISO)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// v14: save a new prune-age threshold from the Backup & Restore page input.
function savePruneAge() {
  const el = document.getElementById('prune-age-input');
  if (!el) return;
  const n = parseInt(el.value, 10);
  if (!Number.isFinite(n) || n < 1 || n > 120) {
    alert('Enter a whole number of months between 1 and 120.');
    return;
  }
  state.pruneAgeMonths = n;
  save();
  render();
}

// v14: confirm and clear the prunable sessions (exported + older than the
// threshold). Lists count + total items in the confirm so the user knows
// exactly what's going. Active session is never among them (it can't be both
// exported-clean and the one being edited without the export having happened
// after the last edit — but we still guard by skipping state.activeId to be
// safe). Deletion is permanent; we strongly word the confirm.
function pruneOldSessions() {
  const targets = prunableSessions().filter(s => s.id !== state.activeId);
  if (targets.length === 0) {
    alert('Nothing to clear.');
    return;
  }
  const itemTotal = targets.reduce((n, s) => n + (s.items ? s.items.length : 0), 0);
  const names = targets.slice(0, 8).map(s => `• ${s.site || s.name} (${formatDate(s.date)})`).join('\n');
  const more = targets.length > 8 ? `\n…and ${targets.length - 8} more` : '';
  const ok = confirm(
    `Clear ${targets.length} exported session${targets.length === 1 ? '' : 's'} ` +
    `(${itemTotal} item${itemTotal === 1 ? '' : 's'} in total)?\n\n` +
    `${names}${more}\n\n` +
    `These have all been exported to CSV and are older than ${state.pruneAgeMonths} month${state.pruneAgeMonths === 1 ? '' : 's'}. ` +
    `This permanently removes them from this device and cannot be undone.\n\nContinue?`
  );
  if (!ok) return;
  const ids = new Set(targets.map(s => s.id));
  state.sessions = state.sessions.filter(s => !ids.has(s.id));
  save();
  render();
  setTimeout(() => alert(`Cleared ${targets.length} session${targets.length === 1 ? '' : 's'}.`), 50);
}

// ---------- Form helpers ----------
function loadFormForCursor() {
  const sess = activeSession();
  if (!sess) return;
  const isExisting = state.cursor < sess.items.length;
  if (isExisting) {
    const it = sess.items[state.cursor];
    state.form = {
      assetNo: it.assetNo, location: it.location, itemType: it.itemType,
      notes: it.notes, showNotes: !!it.notes
    };
  } else {
    state.form = {
      assetNo: nextAssetNo(sess),
      location: getCarryForwardLocation(sess, state.cursor),
      itemType: '',
      notes: '',
      showNotes: false
    };
  }
  state.suggestions = [];
  state.showSuggestions = false;
  // v10: location suggestions follow the same lifecycle
  state.locationSuggestions = [];
  state.showLocationSuggestions = false;
  state.failModalOpen = false;
  state.failModalStage = 'reasons';
  state.failOtherText = '';
  state.multiPickSheetOpen = false;   // v16
}

// ---------- Validation ----------
function validateBeforeSave(opts = {}) {
  const sess = activeSession();
  if (!sess) return 'No active session.';
  // v13: location is now mandatory. Same skip pattern as item type for the
  // copy-last-result path (opts.skipLocation), since that flow copies the
  // location from the previous item before this check runs.
  if (!opts.skipLocation && !state.form.location.trim()) {
    return 'Please enter a location for this item.';
  }
  if (!opts.skipItemType && !state.form.itemType.trim()) {
    return 'Please choose or enter an item type.';
  }
  const assetNo = state.form.assetNo.trim() || nextAssetNo(sess);
  const dupIdx = findDuplicateAssetIndex(sess, assetNo, state.cursor);
  if (dupIdx !== -1) {
    return `Asset number ${assetNo} already used on item ${dupIdx + 1}.`;
  }
  return null;
}

// ---------- Actions ----------
function createSession() {
  const { name, site, engineer, prefix, startNo } = state.newForm;
  if (!site.trim()) return;
  const s = {
    id: uid(),
    name: name.trim() || `Session ${state.sessions.length + 1}`,
    site: site.trim(),
    engineer: engineer.trim(),
    prefix: prefix.trim(),
    date: todayISO(),
    startNumber: parseInt(startNo, 10) || 1,
    items: [],
    locked: false   // v8
  };
  state.sessions.unshift(s);
  state.activeId = s.id;
  state.cursor = 0;
  state.view = 'entry';
  state.newForm = { name: '', site: '', engineer: state.engineer, prefix: '', startNo: '1', show: false };
  loadFormForCursor();
  save(); render();
}

function openSession(id, opts) {
  state.activeId = id;
  const s = activeSession();
  if (!s) return;
  // v10: when called from the sessions-list search with an item-level match, we
  // jump straight to that item. Otherwise default to "the next blank entry"
  // (one past the last item) as before.
  const targetCursor = (opts && typeof opts.cursor === 'number') ? opts.cursor : s.items.length;
  state.cursor = Math.max(0, Math.min(targetCursor, s.items.length));
  // v12: only set the search-jump flash when we were actually navigated here
  // via a search hit (opts.cursor present). Plain "open this session" taps
  // leave searchJumpCursor null so nothing flashes.
  if (opts && typeof opts.cursor === 'number') {
    state.searchJumpCursor = state.cursor;
  } else {
    state.searchJumpCursor = null;
  }
  state.view = 'entry';
  state.showFailsOnly = false;
  state.searchQuery = '';
  // Don't clear sessionsSearchQuery — keeps the search alive for when the user
  // navigates back to the sessions list.
  exitSelectionMode();
  loadFormForCursor();
  save(); render();
}

// v14: Reopen-warning gatekeeper. Sessions-list taps route through here rather
// than calling openSession() directly. If the session has been exported
// (clean or modified-since) AND is NOT locked, we show a one-shot warning
// that editing means re-exporting, and defer the actual open until the user
// taps Continue. Locked / view-only sessions, and never-exported sessions,
// open immediately with no warning.
//
// pendingOpts is stashed on state so the modal's Continue handler can pass the
// original opts (e.g. a search-jump cursor) through to openSession unchanged.
let pendingOpenOpts = null;
function requestOpenSession(id, opts) {
  const s = state.sessions.find(x => x.id === id);
  if (!s) return;
  const warrantsWarning = !s.locked && exportStatus(s) !== 'none';
  if (warrantsWarning) {
    state.exportWarnSessionId = id;
    pendingOpenOpts = opts || null;
    render();
    return;
  }
  openSession(id, opts);
}

// Confirm the reopen warning → proceed to open the session.
function confirmReopenWarning() {
  const id = state.exportWarnSessionId;
  const opts = pendingOpenOpts;
  state.exportWarnSessionId = null;
  pendingOpenOpts = null;
  if (id) openSession(id, opts);
  else render();
}

// Cancel the reopen warning → stay on the Sessions list.
function cancelReopenWarning() {
  state.exportWarnSessionId = null;
  pendingOpenOpts = null;
  render();
}

function deleteSession(id) {
  state.sessions = state.sessions.filter(s => s.id !== id);
  if (id === state.activeId) {
    state.activeId = null;
    state.view = 'sessions';
  }
  save(); render();
}

function saveItem(result) {
  const sess = activeSession();
  if (!sess) return;
  const err = validateBeforeSave();
  if (err) { alert(err); return; }
  const cleanLocation = normaliseLocation(state.form.location);
  const cleanType = normaliseItemType(state.form.itemType);
  const item = {
    assetNo: state.form.assetNo.trim() || nextAssetNo(sess),
    location: cleanLocation,
    itemType: cleanType,
    notes: state.form.notes.trim(),
    result
  };
  if (state.cursor < sess.items.length) {
    // v17: editing an existing item must NOT change its original timestamp —
    // ts records when the item was FIRST logged, not last touched. We spread
    // the new fields over the old item, which leaves any existing .ts intact
    // (item, above, has no ts key, so it can't overwrite it).
    sess.items[state.cursor] = { ...sess.items[state.cursor], ...item };
  } else {
    // v17: stamp the timestamp on first save, only when the setting is on.
    if (state.timestampsEnabled) item.ts = new Date().toISOString();
    sess.items.push({ id: uid(), ...item });
  }
  markSessionDirty(sess);   // v14: edits invalidate a prior export
  addDescriptionIfNew(cleanType);
  state.cursor++;
  loadFormForCursor();
  save(); render();
}

function passClicked() {
  // v8: belt-and-braces — UI disables the buttons when locked, but block here too.
  const sess = activeSession();
  if (sess && sess.locked) return;
  const err = validateBeforeSave();
  if (err) { alert(err); return; }
  feedback('pass', 'pass-btn');   // v17: haptic + green flash + (opt-in) pass tone
  saveItem('pass');
}

function failClicked() {
  const sess = activeSession();
  if (sess && sess.locked) return;
  const err = validateBeforeSave();
  if (err) { alert(err); return; }
  feedback('fail', 'fail-btn');   // v17: haptic + neutral flash + (opt-in) fail tone
  state.failModalStage = 'reasons';
  state.failOtherText = '';
  state.failModalOpen = true;
  render();
}

function pickFailReason(reasonOrNull) {
  // v9: same 3-buzz on commit as the FAIL button — fires when a quick-pick reason
  // is tapped, or when Save is tapped after typing in the Other field. Confirms
  // the fail has actually been recorded, since the visible state changes (modal
  // closes, cursor advances) can be subtle on a tired screen at the end of a job.
  // v17: also plays the fail tone (if sound on). No button flash here — the
  // Fail button sits behind the modal, so the modal closing is the visual cue.
  feedback('fail');
  if (reasonOrNull) {
    state.form.notes = state.form.notes
      ? state.form.notes + ' — ' + reasonOrNull
      : reasonOrNull;
  }
  state.failModalOpen = false;
  state.failModalStage = 'reasons';
  state.failOtherText = '';
  saveItem('fail');
}

function cancelFailModal() {
  state.failModalOpen = false;
  state.failModalStage = 'reasons';
  state.failOtherText = '';
  render();
}

function copyLastResult() {
  const sess = activeSession();
  if (!sess || sess.items.length === 0) return;
  if (sess.locked) return;   // v8
  const err = validateBeforeSave({ skipItemType: true });
  if (err) { alert(err); return; }
  feedback('copy', 'copy-last-btn');   // v17: haptic + neutral flash + (opt-in) copy tone
  const last = sess.items[sess.items.length - 1];
  const item = {
    assetNo: state.form.assetNo.trim() || nextAssetNo(sess),
    location: normaliseLocation(state.form.location),
    itemType: last.itemType,
    notes: '',
    result: last.result
  };
  if (state.cursor < sess.items.length) {
    // v17: overwrite keeps the existing item's original ts (item has no ts key).
    sess.items[state.cursor] = { ...sess.items[state.cursor], ...item };
  } else {
    // v17: stamp on first save (append), only when timestamps are enabled.
    if (state.timestampsEnabled) item.ts = new Date().toISOString();
    sess.items.push({ id: uid(), ...item });
  }
  markSessionDirty(sess);   // v14
  state.cursor++;
  loadFormForCursor();
  save(); render();
}

function deleteItem(idx) {
  const sess = activeSession();
  if (!sess) return;
  sess.items.splice(idx, 1);
  markSessionDirty(sess);   // v14
  state.cursor = Math.min(state.cursor, sess.items.length);
  // If we were in selection mode, indices may have shifted — clean up.
  if (state.selectionMode) {
    state.selectedIndices = state.selectedIndices
      .filter(i => i !== idx)
      .map(i => i > idx ? i - 1 : i);
  }
  loadFormForCursor();
  save(); render();
}

function moveCursor(delta) {
  const sess = activeSession();
  if (!sess) return;
  const next = state.cursor + delta;
  if (next < 0 || next > sess.items.length) return;
  state.cursor = next;
  loadFormForCursor();
  render();
}

function skipToNew() {
  const sess = activeSession();
  if (!sess) return;
  state.cursor = sess.items.length;
  loadFormForCursor();
  render();
}

function jumpTo(idx) {
  state.cursor = idx;
  state.view = 'entry';
  exitSelectionMode();
  loadFormForCursor();
  render();
}

function setView(v) {
  // v8: clear every modal/dialog flag on every view transition. Previously
  // bulkLocationDialogOpen was only cleared via exitSelectionMode (overview-only),
  // which left a window where the wrong navigation path could leave it true.
  state.failModalOpen = false;
  state.failModalStage = 'reasons';
  state.failOtherText = '';
  state.multiPickSheetOpen = false;   // v16
  state.bulkLocationDialogOpen = false;
  state.bulkLocationValue = '';
  // v11: also clear the new bulk-edit menu + sub-dialog state.
  state.bulkEdit.menuOpen = false;
  state.bulkEdit.mode = null;
  state.bulkEdit.typeValue = '';
  state.bulkEdit.notesValue = '';
  state.bulkEdit.notesMode = 'replace';
  // Search and selection are overview-local; clear when leaving overview.
  if (v !== 'overview') {
    state.searchQuery = '';
    exitSelectionMode();
  }
  state.view = v;
  render();
}

// ---------- Bulk-edit (v7, extended in v11) ----------
function enterSelectionMode() {
  state.selectionMode = true;
  state.selectedIndices = [];
  render();
}

function exitSelectionMode() {
  state.selectionMode = false;
  state.selectedIndices = [];
  state.bulkLocationDialogOpen = false;
  state.bulkLocationValue = '';
  // v11: clear the new bulk-edit state too.
  state.bulkEdit.menuOpen = false;
  state.bulkEdit.mode = null;
  state.bulkEdit.typeValue = '';
  state.bulkEdit.notesValue = '';
  state.bulkEdit.notesMode = 'replace';
}

function toggleSelected(idx) {
  if (state.selectedIndices.includes(idx)) {
    state.selectedIndices = state.selectedIndices.filter(i => i !== idx);
  } else {
    state.selectedIndices = [...state.selectedIndices, idx].sort((a, b) => a - b);
  }
}

function selectAllVisible() {
  const sess = activeSession();
  if (!sess) return;
  const visible = computeVisibleOverviewItems(sess).map(x => x.i);
  // Add visible to existing selection
  const set = new Set(state.selectedIndices);
  visible.forEach(i => set.add(i));
  state.selectedIndices = Array.from(set).sort((a, b) => a - b);
  render();
}

function clearSelection() {
  state.selectedIndices = [];
  render();
}

function openBulkLocationDialog() {
  if (state.selectedIndices.length === 0) return;
  state.bulkLocationDialogOpen = true;
  state.bulkLocationValue = '';
  render();
}

function applyBulkLocation() {
  const sess = activeSession();
  if (!sess) return;
  const newLoc = normaliseLocation(state.bulkLocationValue);
  if (!newLoc) {
    alert('Please enter a location.');
    return;
  }
  let count = 0;
  state.selectedIndices.forEach(i => {
    if (sess.items[i]) {
      sess.items[i].location = newLoc;
      count++;
    }
  });
  markSessionDirty(sess);   // v14
  exitSelectionMode();
  save();
  render();
  // Brief confirmation — not blocking.
  setTimeout(() => alert(`Updated location on ${count} item${count === 1 ? '' : 's'}.`), 50);
}

// ---------- v11: extended bulk-edit ----------
// The selection bar's single "Change location" button is replaced by an
// "Edit selected ▾" button that opens a menu sheet with four options:
// Location, Type, Notes, Delete. Each option opens a dedicated sub-dialog.
// State for all of this lives in state.bulkEdit (see top of file).

function openBulkEditMenu() {
  if (state.selectedIndices.length === 0) return;
  state.bulkEdit.menuOpen = true;
  state.bulkEdit.mode = null;
  render();
}

function closeBulkEditMenu() {
  state.bulkEdit.menuOpen = false;
  render();
}

// Open a specific sub-dialog. Closes the menu sheet first so we don't stack
// two bottom sheets on top of each other.
function openBulkEditDialog(mode) {
  if (state.selectedIndices.length === 0) return;
  state.bulkEdit.menuOpen = false;
  state.bulkEdit.mode = mode;
  // Reset working values so a previous run's text doesn't bleed through.
  if (mode === 'location') {
    // Re-use the v10 dialog path — set the legacy state so the existing
    // dialog renders correctly. Cleanest minimal-diff approach.
    state.bulkLocationDialogOpen = true;
    state.bulkLocationValue = '';
  } else if (mode === 'type') {
    state.bulkEdit.typeValue = '';
  } else if (mode === 'notes') {
    state.bulkEdit.notesValue = '';
    state.bulkEdit.notesMode = 'replace';
  }
  render();
}

function cancelBulkEditDialog() {
  state.bulkEdit.mode = null;
  state.bulkLocationDialogOpen = false;
  state.bulkLocationValue = '';
  state.bulkEdit.typeValue = '';
  state.bulkEdit.notesValue = '';
  state.bulkEdit.notesMode = 'replace';
  render();
}

function applyBulkType() {
  const sess = activeSession();
  if (!sess) return;
  const newType = normaliseItemType(String(state.bulkEdit.typeValue || '').trim());
  if (!newType) {
    alert('Please enter or pick an item type.');
    return;
  }
  let count = 0;
  state.selectedIndices.forEach(i => {
    if (sess.items[i]) {
      sess.items[i].itemType = newType;
      count++;
    }
  });
  markSessionDirty(sess);   // v14
  // Feed the autocomplete so future entries get it.
  addDescriptionIfNew(newType);
  exitSelectionMode();
  save();
  render();
  setTimeout(() => alert(`Updated type on ${count} item${count === 1 ? '' : 's'}.`), 50);
}

function applyBulkNotes() {
  const sess = activeSession();
  if (!sess) return;
  const text = String(state.bulkEdit.notesValue || '').trim();
  const mode = state.bulkEdit.notesMode === 'append' ? 'append' : 'replace';
  // Allow an empty value ONLY in replace mode (i.e. "clear notes on these
  // items"). In append mode an empty string is a no-op and we should bounce.
  if (!text && mode === 'append') {
    alert('Please enter some text to append.');
    return;
  }
  let count = 0;
  state.selectedIndices.forEach(i => {
    const it = sess.items[i];
    if (!it) return;
    if (mode === 'replace') {
      it.notes = text;
    } else {
      const existing = String(it.notes || '').trim();
      it.notes = existing ? `${existing}; ${text}` : text;
    }
    count++;
  });
  markSessionDirty(sess);   // v14
  exitSelectionMode();
  save();
  render();
  const verb = mode === 'replace' ? 'Replaced' : 'Appended to';
  setTimeout(() => alert(`${verb} notes on ${count} item${count === 1 ? '' : 's'}.`), 50);
}

function applyBulkDelete() {
  const sess = activeSession();
  if (!sess) return;
  const n = state.selectedIndices.length;
  if (n === 0) return;
  if (!confirm(`Delete ${n} item${n === 1 ? '' : 's'}? This can't be undone.`)) return;
  // Sort descending so splicing doesn't shift the remaining indices.
  const indices = state.selectedIndices.slice().sort((a, b) => b - a);
  indices.forEach(i => {
    if (sess.items[i]) sess.items.splice(i, 1);
  });
  markSessionDirty(sess);   // v14
  // If the cursor was past the new end, pull it back.
  if (state.cursor > sess.items.length) state.cursor = sess.items.length;
  exitSelectionMode();
  save();
  loadFormForCursor();
  render();
  setTimeout(() => alert(`Deleted ${n} item${n === 1 ? '' : 's'}.`), 50);
}

// Edit-session flow
function startEditSession() {
  const sess = activeSession();
  if (!sess) return;
  state.editForm = {
    name: sess.name || '',
    site: sess.site || '',
    engineer: sess.engineer || '',
    prefix: sess.prefix || '',
    date: sess.date || '',
    locked: !!sess.locked   // v8
  };
  state.view = 'editSession';
  render();
}

function saveSessionEdits() {
  const sess = activeSession();
  if (!sess) return;
  const { name, site, engineer, prefix, date, locked } = state.editForm;
  if (!String(site).trim()) {
    alert('Site is required.');
    return;
  }
  sess.name = String(name).trim() || sess.name;
  sess.site = String(site).trim();
  sess.engineer = String(engineer).trim();
  sess.prefix = String(prefix).trim();
  sess.date = date || sess.date;
  sess.locked = !!locked;   // v8
  state.view = 'overview';
  save(); render();
}

// v8: unlock the active session from the entry-screen banner.
// Toggling lock back on must go through the Edit Session screen — deliberate friction.
function unlockActiveSession() {
  const sess = activeSession();
  if (!sess) return;
  sess.locked = false;
  save(); render();
}

// ---------- Settings: per-page saves (v7) ----------
function saveUserSettings() {
  state.engineer = document.getElementById('settings-engineer').value.trim();
  state.newForm.engineer = state.engineer;
  // v11: tester type + calibration info. All optional. Empty strings stored
  // as empty so the UI doesn't show stale values from previous edits.
  // v13: tester now read from two separate inputs (Manufacturer + Model).
  // The legacy single 'tester' field is no longer in state — split into
  // testerMake + testerModel.
  const $tm = document.getElementById('settings-tester-make');
  const $tmod = document.getElementById('settings-tester-model');
  const $cd = document.getElementById('settings-cal-date');
  const $cc = document.getElementById('settings-cal-cert');
  const $cdu = document.getElementById('settings-cal-due');
  if ($tm) state.testerMake = $tm.value.trim();
  if ($tmod) state.testerModel = $tmod.value.trim();
  if ($cd) state.calDate = $cd.value.trim();
  if ($cc) state.calCertNo = $cc.value.trim();
  if ($cdu) state.calDue = $cdu.value.trim();
  save();
  setView('settings');
}

// v11: save the CSV column configuration. Reads the live DOM rows so the
// user's ordering, visibility checks, and renamed headers are all picked up
// in one pass.
//
// Validation:
//   • At least one column must be visible. Otherwise we'd produce CSVs with
//     just a blank line, which is useless.
//   • Empty / whitespace-only header text falls back to the default header
//     for that column id rather than erroring out — a one-character typo
//     shouldn't block the save.
function saveCsvColumnsSettings() {
  const rows = document.querySelectorAll('.csv-col-row');
  if (!rows.length) { setView('settings'); return; }
  const next = [];
  rows.forEach(row => {
    const id = row.dataset.colId;
    if (!id) return;
    const visEl = row.querySelector('.csv-col-visible');
    const hdrEl = row.querySelector('.csv-col-header');
    const visible = visEl ? !!visEl.checked : true;
    let header = hdrEl ? String(hdrEl.value || '').trim() : '';
    if (!header) header = defaultHeaderFor(id);
    next.push({ id, header, visible });
  });
  if (!next.some(c => c.visible)) {
    alert('At least one column must be visible. Tick at least one before saving.');
    return;
  }
  state.csvColumns = next;
  ensureAllCsvColumns();
  save();
  setView('settings');
}

function resetCsvColumnsSettings() {
  if (!confirm('Reset CSV columns to defaults?\n\nThis restores the original 8-column order, default header names, and shows all columns. Cannot be undone.')) return;
  state.csvColumns = DEFAULT_CSV_COLUMNS.map(c => ({ ...c }));
  save();
  render();
}

// v11: move a CSV column up or down in the list and re-render the settings
// page. We re-read the live DOM values first so any unsaved edits to header
// text or visibility don't get clobbered by the re-render.
function moveCsvColumn(id, delta) {
  // Snapshot pending edits from the DOM before mutating state, otherwise the
  // re-render below would revert anything the user has typed but not saved.
  const rows = document.querySelectorAll('.csv-col-row');
  if (rows.length) {
    const pending = [];
    rows.forEach(row => {
      const rid = row.dataset.colId;
      if (!rid) return;
      const visEl = row.querySelector('.csv-col-visible');
      const hdrEl = row.querySelector('.csv-col-header');
      pending.push({
        id: rid,
        header: hdrEl ? String(hdrEl.value || '') : '',
        visible: visEl ? !!visEl.checked : true
      });
    });
    if (pending.length === state.csvColumns.length) {
      state.csvColumns = pending;
    }
  }
  const idx = state.csvColumns.findIndex(c => c.id === id);
  if (idx === -1) return;
  const newIdx = idx + delta;
  if (newIdx < 0 || newIdx >= state.csvColumns.length) return;
  const arr = state.csvColumns;
  [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
  render();
}

// v12: dismiss the welcome modal — sets the flag in localStorage so it
// doesn't reappear, then re-renders to clear it from view. v16: writes
// pat:v16welcome so v15 users see the modal once on update.
function dismissV17Welcome() {
  state.v17WelcomeSeen = true;
  localStorage.setItem(V17_WELCOME_KEY, '1');
  render();
}

function saveItemTypesSettings() {
  const types = document.getElementById('settings-types').value
    .split('\n').map(s => s.trim()).filter(Boolean).slice(0, 9);
  // v9: writes to the currently active preset, not a global itemTypes array.
  const p = activePreset();
  if (p) {
    p.items = types.length ? types : DEFAULT_ITEM_TYPES.slice();
    syncItemTypesFromActivePreset();
  }
  save();
  setView('settings');
}

function saveFailReasonsSettings() {
  const reasons = document.getElementById('settings-reasons').value
    .split('\n').map(s => s.trim()).filter(Boolean).slice(0, 6);
  state.failReasons = reasons.length ? reasons : DEFAULT_FAIL_REASONS.slice();
  save();
  setView('settings');
}

function saveDescriptionsSettings() {
  const rawDescs = document.getElementById('settings-descriptions').value
    .split('\n').map(s => s.trim()).filter(Boolean);
  const seen = new Set();
  state.descriptions = rawDescs.filter(d => {
    const l = d.toLowerCase();
    if (seen.has(l)) return false;
    seen.add(l);
    return true;
  });
  save();
  setView('settings');
}

// v9: Reset-to-defaults helpers — overwrite the current list with the built-in
// defaults. Each prompts to confirm because they're destructive.
// Items: resets the *current preset* only, not all presets.
function resetItemsToDefaults() {
  const p = activePreset();
  if (!p) return;
  if (!confirm(`Reset preset "${p.name}" to default items?\n\nThis replaces the current list with the 9 built-in defaults. Other presets are not affected.`)) return;
  p.items = DEFAULT_ITEM_TYPES.slice();
  syncItemTypesFromActivePreset();
  save();
  render();
}

function resetFailReasonsToDefaults() {
  if (!confirm('Reset Quick Pick Fail to default reasons?\n\nThis replaces the current list with the built-in defaults.')) return;
  state.failReasons = DEFAULT_FAIL_REASONS.slice();
  save();
  render();
}

function resetDescriptionsToDefaults() {
  if (!confirm('Reset Item Description List to defaults?\n\nThis replaces the current list with the built-in defaults. Items already saved in past sessions are unaffected.')) return;
  state.descriptions = DEFAULT_DESCRIPTIONS.slice();
  save();
  render();
}

function setTheme(theme) {
  state.theme = theme;
  applyTheme(theme);
  save();
  render();   // re-render to update radio button highlights
}

function setHaptics(enabled) {
  state.hapticsEnabled = !!enabled;
  save();
  // No re-render needed — toggle visual handled by checkbox state
}

// v17: opt-in sound feedback. Flipping it on plays a sample pass tone so the
// user immediately hears what they've enabled (and it doubles as the first
// user-gesture that unlocks the AudioContext on iOS). Flipping off is silent.
function setSound(enabled) {
  state.soundEnabled = !!enabled;
  save();
  if (state.soundEnabled) playSound('pass');
}

// v17: item timestamps on/off. Gates both capture (future items) and display.
// Existing items are untouched either way — turning it on doesn't backfill old
// items, turning it off doesn't strip stamps already recorded.
function setTimestamps(enabled) {
  state.timestampsEnabled = !!enabled;
  save();
}

// ---------- Service worker + update detection (v7) ----------
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      // Check if a worker is already waiting from a previous tab/load.
      if (reg.waiting && navigator.serviceWorker.controller) {
        showUpdateBanner(reg.waiting);
      }
      // Watch for new workers becoming installed.
      reg.addEventListener('updatefound', () => {
        const installingWorker = reg.installing;
        if (!installingWorker) return;
        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // A new SW is installed AND there was already a controller — i.e. an update.
            showUpdateBanner(installingWorker);
          }
        });
      });
    }).catch(err => console.log('SW reg failed:', err));

    // When the active SW changes (after we tell it to skipWaiting), reload to use it.
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  });
}

function showUpdateBanner(worker) {
  state.updateAvailable = true;
  state.pendingWorker = worker;
  document.body.classList.add('has-update-banner');
  render();
}

function applyUpdate() {
  if (state.pendingWorker) {
    state.pendingWorker.postMessage({ type: 'SKIP_WAITING' });
    // Page will reload via controllerchange listener.
  } else {
    window.location.reload();
  }
}

function dismissUpdateBanner() {
  state.updateAvailable = false;
  document.body.classList.remove('has-update-banner');
  render();
}

// ---------- Rendering ----------
const app = document.getElementById('app');

function render() {
  // v8: DOM hygiene — defensive cleanup against the "taps do nothing" bug.
  // Symptom: across the whole app, tapping any input gives no cursor and no keyboard.
  // A fresh PWA install fixes it. The most likely cause is an orphaned modal
  // backdrop or sheet sitting in the DOM at z-index 90+, silently swallowing every
  // tap. We can't always reproduce it, so we sweep aggressively here every render:
  //   1. Strip any modal/sheet elements that ended up outside #app (where they
  //      would survive an innerHTML rewrite).
  //   2. Drop any body classes that are only meant to be transient.
  // The cost is one querySelectorAll per render — negligible.
  document.querySelectorAll(
    'body > .modal-backdrop, body > .fail-sheet, body > .bulk-sheet'
  ).forEach(el => el.remove());

  const v = state.view;
  let html = '';
  if (v === 'sessions') html = renderSessions();
  else if (v === 'entry') html = renderEntry();
  else if (v === 'overview') html = renderOverview();
  else if (v === 'editSession') html = renderEditSession();
  else if (v === 'settings') html = renderSettingsHub();
  else if (v === 'settingsUser') html = renderSettingsUser();
  else if (v === 'settingsItems') html = renderSettingsItems();
  else if (v === 'settingsFails') html = renderSettingsFails();
  else if (v === 'settingsMultiPick') html = renderSettingsMultiPick();   // v16
  else if (v === 'settingsDescriptions') html = renderSettingsDescriptions();
  else if (v === 'settingsDisplay') html = renderSettingsDisplay();
  else if (v === 'settingsBackup') html = renderSettingsBackup();
  else if (v === 'settingsCsv') html = renderSettingsCsv();   // v11
  else if (v === 'settingsCalculator') html = renderSettingsCalculator();
  else if (v === 'settingsAbout') html = renderSettingsAbout();
  else if (v === 'settingsContact') html = renderSettingsContact();

  // Update banner sits above the screen
  const banner = state.updateAvailable ? `
    <div class="update-banner" role="status">
      <span class="update-banner-text">⟳ Update available</span>
      <div class="update-banner-actions">
        <button class="update-refresh-btn" id="update-refresh">Refresh</button>
        <button class="update-dismiss-btn" id="update-dismiss" aria-label="Dismiss">×</button>
      </div>
    </div>
  ` : '';

  // v9: first-launch migration prompt — shown above everything when the user is
  // upgrading from v8 (or earlier) with a non-empty itemTypes list. Asks them to
  // name the preset their existing list will become. Uses the bulk-sheet pattern
  // (bottom sheet) like other dialogs. No close button — user must commit.
  const migrationModal = state.migrationPrompt.show ? `
    <div class="modal-backdrop" style="z-index:300"></div>
    <div class="bulk-sheet" style="z-index:301" role="dialog" aria-label="Welcome to V9">
      <div class="bulk-sheet-handle"></div>
      <div class="bulk-sheet-header">
        <span class="fail-close-spacer"></span>
        <h3 class="bulk-sheet-title">Welcome to V9</h3>
        <span class="fail-close-spacer"></span>
      </div>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:var(--text)">
        You can now save multiple Quick Pick lists as <strong>presets</strong> and switch between them.
      </p>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:var(--text)">
        Your current Quick Pick items have become your first preset. What would you like to call it?
      </p>
      <label class="label">Preset name</label>
      <input class="input" id="migration-prompt-input" value="${escapeHTML(state.migrationPrompt.name)}" placeholder="e.g. Default, My items, Office" autofocus>
      <p class="muted" style="margin:8px 0 14px;font-size:12px">You can rename or add more presets later in Settings → Quick Pick Items.</p>
      <button class="btn-primary" id="migration-prompt-confirm">Continue</button>
    </div>
  ` : '';

  // v12: one-time "what's new" modal on first launch after an update.
  // Suppressed if the v9 migration prompt is currently showing (that one
  // takes priority because it requires a name commit) or if the user has
  // already dismissed this modal.
  // v17: rolled forward — content covers the V17 feedback + timestamps changes,
  // key bumped to pat:v17welcome so v16 users see it once on update. Gate uses
  // v17WelcomeSeen.
  const welcomeModal = (state.v17WelcomeSeen || state.migrationPrompt.show) ? '' : `
    <div class="modal-backdrop" style="z-index:300"></div>
    <div class="bulk-sheet" style="z-index:301" role="dialog" aria-label="What's new in V17">
      <div class="bulk-sheet-handle"></div>
      <div class="bulk-sheet-header">
        <span class="fail-close-spacer"></span>
        <h3 class="bulk-sheet-title">What's new in V17</h3>
        <span class="fail-close-spacer"></span>
      </div>
      <ul class="welcome-list">
        <li><strong>Clearer confirmation.</strong> Every Pass, Fail and Copy now flashes the button you tapped, so you get a visual confirmation even on iPhones where newer iOS has stopped in-app vibration from working.</li>
        <li><strong>Optional sound.</strong> Turn on Sound feedback for a short tone on each action — a different one for pass, fail and copy. Find it under <strong>Settings → Display</strong>. Off by default.</li>
        <li><strong>Item timestamps.</strong> Optionally record the time each item was logged — shown in the overview and available as a CSV column. Switch it on under <strong>Settings → Display</strong>. Off by default.</li>
      </ul>
      <button class="btn-primary" id="v17-welcome-dismiss">Continue</button>
    </div>
  `;

  // v14: reopen warning modal — shown when the user taps an exported (clean or
  // modified) unlocked session on the Sessions list. Warns that editing means
  // re-exporting. Continue proceeds to open; Cancel stays on the list.
  let reopenWarnModal = '';
  if (state.exportWarnSessionId) {
    const ws = state.sessions.find(x => x.id === state.exportWarnSessionId);
    if (ws) {
      const wasModified = exportStatus(ws) === 'modified';
      const line = wasModified
        ? "You've already exported this session, and it's been edited since. If you make further changes you'll need to export it again."
        : "You've already exported this session. If you make changes you'll need to export it again.";
      reopenWarnModal = `
        <div class="modal-backdrop" style="z-index:300"></div>
        <div class="bulk-sheet" style="z-index:301" role="dialog" aria-label="Already exported">
          <div class="bulk-sheet-handle"></div>
          <div class="bulk-sheet-header">
            <span class="fail-close-spacer"></span>
            <h3 class="bulk-sheet-title">Already exported</h3>
            <button class="fail-close-btn" id="reopen-warn-cancel" aria-label="Cancel">×</button>
          </div>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:var(--text)">${escapeHTML(line)}</p>
          <div class="btn-row">
            <button class="btn-secondary" id="reopen-warn-cancel2">Cancel</button>
            <button class="btn-primary" id="reopen-warn-continue">Open anyway</button>
          </div>
        </div>
      `;
    }
  }

  app.innerHTML = banner + html + migrationModal + welcomeModal + reopenWarnModal;
  // Toggle body class for selection bar spacing
  if (state.view === 'overview' && state.selectionMode) {
    document.body.classList.add('has-selection-bar');
  } else {
    document.body.classList.remove('has-selection-bar');
  }
  // v12: previously toggled body.view-entry here for no-scroll layout.
  // v12.1: rolled back — the 100dvh + overflow:hidden approach caused issues
  // on some devices (notes textarea + keyboard pushing the PASS/FAIL row
  // off-screen, plus inconsistent dvh support). Defensive cleanup: strip the
  // class if it lingered from a previous v12 render, in case a hot-swap
  // mid-session leaves a stale body class.
  document.body.classList.remove('view-entry');
  bindEvents();
}

function renderSessions() {
  const newForm = state.newForm.show ? `
    <div class="card">
      <h2 class="h2">New session</h2>
      <label class="label">Site / client</label>
      <input class="input" id="nf-site" value="${escapeHTML(state.newForm.site)}" placeholder="e.g. Acme Ltd – Unit 4" autofocus>
      <label class="label">Engineer</label>
      <input class="input" id="nf-engineer" value="${escapeHTML(state.newForm.engineer || state.engineer)}" placeholder="Your name">
      <label class="label">Session name <span class="hint">(optional)</span></label>
      <input class="input" id="nf-name" value="${escapeHTML(state.newForm.name)}" placeholder="e.g. Annual test 2026">
      <label class="label">Asset number prefix <span class="hint">(optional, e.g. BT)</span></label>
      <input class="input" id="nf-prefix" value="${escapeHTML(state.newForm.prefix)}" placeholder="Leave blank for none">
      <label class="label">Starting asset number</label>
      <input class="input" id="nf-start" type="number" inputmode="numeric" value="${escapeHTML(state.newForm.startNo)}">
      <div class="btn-row">
        <button class="btn-secondary" id="nf-cancel">Cancel</button>
        <button class="btn-primary" id="nf-submit">Start</button>
      </div>
    </div>
  ` : `
    <div class="sessions-actions-row">
      <button class="btn-primary" id="new-session-btn">+ New session</button>
      <button class="btn-secondary" id="import-session-btn">⬆ Import (.csv)</button>
    </div>
    <input type="file" id="import-session-file" accept=".csv,text/csv" style="display:none">
  `;

  // v10: search bar above the sort row. Hidden when there are no sessions OR
  // when the new-session form is open (which dominates the screen anyway).
  // The result-count subtitle gives the user feedback when their query thins
  // out the list — important because the empty-state message otherwise looks
  // like a bug if you don't realise the search is filtering. The dynamic
  // portion (count + sort + list) is wrapped in #sessions-list-area so we can
  // refresh it on every keystroke without re-rendering the input itself,
  // which would lose focus on iOS mid-typing.
  const hasSessions = state.sessions.length > 0;
  const showSearch = hasSessions && !state.newForm.show;
  const searchRow = showSearch ? `
    <div class="sessions-search-row">
      <input type="search" class="search-input" id="sessions-search" placeholder="Search sessions and items…" value="${escapeHTML(state.sessionsSearchQuery)}" autocomplete="off">
    </div>
  ` : '';
  const sessionsListArea = `<div id="sessions-list-area">${renderSessionsListAreaHTML()}</div>`;

  // v10: Import conflict dialog — shown when the user picks a CSV whose
  // Site+Date matches an existing session. Three options stacked vertically
  // because the consequences of each differ enough that horizontal grouping
  // would invite mis-tap.
  const importConflict = state.importDialog.conflictOpen ? renderImportConflictModal() : '';
  // v10: Import summary dialog — shown after commit, lists skipped rows (if any)
  // and confirms what happened.
  const importSummary = state.importDialog.summaryOpen ? renderImportSummaryModal() : '';

  // v11: backup reminder banner — sits inline at the top of the Sessions screen
  // when no JSON backup has been exported in the last BACKUP_REMINDER_DAYS
  // days. Two actions: "Export now" runs downloadBackup() (which also stamps
  // lastBackupAt so the banner clears), and "Remind me later" snoozes for 24h.
  // The × control is equivalent to the snooze. Hidden when the new-session
  // form is open or the sessions list is empty.
  const backupBanner = shouldShowBackupReminder() ? renderBackupReminderBanner() : '';

  return `
    <div class="screen">
      <header class="header">
        <h1 class="h1">PAT Sessions</h1>
        <button class="icon-btn" id="settings-btn" aria-label="Settings">⚙</button>
      </header>
      ${backupBanner}
      ${newForm}
      ${searchRow}
      ${sessionsListArea}
      ${importConflict}
      ${importSummary}
    </div>
  `;
}

// v11: the backup-reminder banner body. Shown by renderSessions() above when
// shouldShowBackupReminder() returns true. The message adapts based on
// whether the user has ever backed up:
//   • Never → "You haven't backed up yet. Export a copy to keep your data safe."
//   • Stale → "It's been N days since your last backup."
function renderBackupReminderBanner() {
  let msg;
  if (!state.lastBackupAt) {
    msg = "You haven't exported a backup yet.";
  } else {
    const lastMs = Date.parse(state.lastBackupAt);
    const days = Math.floor((Date.now() - lastMs) / (1000 * 3600 * 24));
    msg = `It's been ${days} day${days === 1 ? '' : 's'} since your last backup.`;
  }
  return `
    <div class="backup-banner" role="status">
      <div class="backup-banner-body">
        <div class="backup-banner-text">${escapeHTML(msg)}</div>
        <div class="backup-banner-actions">
          <button class="backup-banner-action primary" id="backup-banner-export">Export now</button>
          <button class="backup-banner-action" id="backup-banner-later">Remind me later</button>
        </div>
      </div>
      <button class="backup-banner-dismiss" id="backup-banner-dismiss" aria-label="Dismiss">×</button>
    </div>
  `;
}

// v10: The dynamic portion of the Sessions screen — count + sort + list. Built
// as a separate function so we can refresh just this region on every keystroke
// in the search input without re-rendering the input itself (which would lose
// focus + keyboard on iOS).
function renderSessionsListAreaHTML() {
  const sortedAll = sortedSessions();
  const queryTrimmed = state.sessionsSearchQuery.trim();

  // v15: control filters (Status + Lock) apply ONLY when not searching — an
  // active search dominates the list, and the sort/filter controls are hidden
  // in that mode anyway. When searching, the search runs over the full set.
  const filtersActive = !queryTrimmed && (state.sessionFilter !== 'all' || state.lockFilter !== 'all');
  const controlFiltered = queryTrimmed
    ? sortedAll
    : sortedAll.filter(sessionMatchesControlFilters);
  const filtered = filteredSessions(controlFiltered, state.sessionsSearchQuery);

  const countHTML = queryTrimmed
    ? `<span class="sessions-search-count">${filtered.length} of ${sortedAll.length} session${sortedAll.length === 1 ? '' : 's'} match</span>`
    : '';

  // v15: when a control filter is narrowing the list (and we're not searching),
  // show an "X of Y shown" line so a filtered list never looks like data loss.
  const filterCountHTML = (filtersActive && sortedAll.length > 0)
    ? `<span class="sessions-search-count">${controlFiltered.length} of ${sortedAll.length} session${sortedAll.length === 1 ? '' : 's'} shown</span>`
    : '';

  // v14/v15: "N sessions not yet exported" nudge — now a tappable control that
  // bulk-exports every not-yet-cleanly-exported session (status 'none' or
  // 'modified') in one action. Count is global (independent of the active
  // filter view). Hidden when there are none, the list is empty, or while
  // searching (the search count takes the slot).
  const unexported = unexportedSessionCount();
  const nudgeHTML = (!queryTrimmed && sortedAll.length > 0 && unexported > 0)
    ? `<button type="button" class="export-nudge" id="bulk-export-btn" aria-label="Export ${unexported} not-yet-exported session${unexported === 1 ? '' : 's'}">
        <span class="export-nudge-text">${unexported} session${unexported === 1 ? '' : 's'} not yet exported</span>
        <span class="export-nudge-cta">${SHARE_ICON_SVG} Export all</span>
      </button>`
    : '';

  // Sort + filters: only show when there's >1 session AND no active search
  // (the search-result subtitle becomes the more useful contextual cue there).
  const controls = sortedAll.length > 1 && !queryTrimmed ? `
    <div class="list-controls">
      <label class="control-field">
        <span class="control-label">Sort</span>
        <select id="sort-select" class="sort-select">
          <option value="date_desc"${state.sort === 'date_desc' ? ' selected' : ''}>Date (newest)</option>
          <option value="date_asc"${state.sort === 'date_asc' ? ' selected' : ''}>Date (oldest)</option>
          <option value="name_asc"${state.sort === 'name_asc' ? ' selected' : ''}>Name (A–Z)</option>
          <option value="name_desc"${state.sort === 'name_desc' ? ' selected' : ''}>Name (Z–A)</option>
        </select>
      </label>
      <label class="control-field">
        <span class="control-label">Status</span>
        <select id="status-filter" class="sort-select">
          <option value="all"${state.sessionFilter === 'all' ? ' selected' : ''}>All</option>
          <option value="unexported"${state.sessionFilter === 'unexported' ? ' selected' : ''}>Not exported</option>
          <option value="exported"${state.sessionFilter === 'exported' ? ' selected' : ''}>Exported</option>
          <option value="modified"${state.sessionFilter === 'modified' ? ' selected' : ''}>Modified since</option>
        </select>
      </label>
      <label class="control-field">
        <span class="control-label">Lock</span>
        <select id="lock-filter" class="sort-select">
          <option value="all"${state.lockFilter === 'all' ? ' selected' : ''}>All</option>
          <option value="unlocked"${state.lockFilter === 'unlocked' ? ' selected' : ''}>Unlocked</option>
          <option value="locked"${state.lockFilter === 'locked' ? ' selected' : ''}>Locked</option>
        </select>
      </label>
    </div>
  ` : '';

  let list;
  if (sortedAll.length === 0 && !state.newForm.show) {
    list = `<p class="muted">No sessions yet. Create one to start testing.</p>`;
  } else if (queryTrimmed && filtered.length === 0) {
    list = `<p class="muted">No sessions or items match "${escapeHTML(queryTrimmed)}".</p>`;
  } else if (!queryTrimmed && sortedAll.length > 0 && filtered.length === 0) {
    // v15: there ARE sessions, but the active filters hid them all.
    list = `<p class="muted">No sessions match the current filters.</p>
      <button type="button" class="btn-tertiary" id="clear-filters-btn">Show all sessions</button>`;
  } else {
    list = filtered.map(({ session: s, matchedItemIndex, itemMatchCount }) => {
      const passes = s.items.filter(i => i.result === 'pass').length;
      const fails = s.items.filter(i => i.result === 'fail').length;
      // v8: subtle 🔒 prefix on locked sessions so they're easy to spot in the list.
      const lockMark = s.locked ? '<span class="session-lock" title="Locked">🔒</span>' : '';
      // v14: export-status badge in the meta row. 'exported' → ✓ Exported;
      // 'modified' → ✓✎ Modified since export; 'none' → no badge.
      const xStatus = exportStatus(s);
      const exportBadge = xStatus === 'exported'
        ? '<span class="export-badge exported" title="Exported">✓ Exported</span>'
        : (xStatus === 'modified'
            ? '<span class="export-badge modified" title="Edited since last export">✓✎ Modified since export</span>'
            : '');
      // v10: when the query only hit item-level fields, show how many items matched
      // and (via data-open-at) jump straight to the first match.
      const itemBadge = matchedItemIndex !== -1
        ? `<div><span class="session-match-badge">${itemMatchCount} match${itemMatchCount === 1 ? '' : 'es'} in items</span></div>`
        : '';
      const openAttr = matchedItemIndex !== -1
        ? `data-open="${s.id}" data-open-at="${matchedItemIndex}"`
        : `data-open="${s.id}"`;
      return `
        <div class="session-card${s.locked ? ' locked' : ''}">
          <div class="session-info" ${openAttr}>
            <div class="session-title">${lockMark}${escapeHTML(s.site || s.name)}</div>
            <div class="session-meta">${formatDate(s.date)} · ${s.items.length} items · <span class="pass-text">${passes} pass</span> · <span class="fail-text">${fails} fail</span></div>
            ${exportBadge ? `<div class="session-export-row">${exportBadge}</div>` : ''}
            ${itemBadge}
          </div>
          <button class="icon-btn-sm" data-export="${s.id}" aria-label="Share CSV">${SHARE_ICON_SVG}</button>
          <button class="icon-btn-sm" data-delete-session="${s.id}" aria-label="Delete">🗑</button>
        </div>
      `;
    }).join('');
  }

  return `${nudgeHTML}${countHTML}${filterCountHTML}${controls}<div>${list}</div>`;
}

// v10: Partial refresh used by the sessions-search oninput. Replaces only
// #sessions-list-area, leaves the search input intact, and rebinds row events.
function refreshSessionsListAreaOnly() {
  const wrap = document.getElementById('sessions-list-area');
  if (!wrap) return;
  wrap.innerHTML = renderSessionsListAreaHTML();
  bindSessionsListAreaEvents();
}

// v10: Conflict dialog body. Sits above the sessions list in a bulk-sheet.
function renderImportConflictModal() {
  const incoming = state.importDialog.pendingSession;
  if (!incoming) return '';
  const existing = state.sessions.find(s => s.id === state.importDialog.conflictExistingId);
  const existingItemCount = existing && Array.isArray(existing.items) ? existing.items.length : 0;
  return `
    <div class="modal-backdrop" id="import-conflict-backdrop" style="z-index:300"></div>
    <div class="bulk-sheet" style="z-index:301" role="dialog" aria-label="Session already exists">
      <div class="bulk-sheet-handle"></div>
      <div class="bulk-sheet-header">
        <span class="fail-close-spacer"></span>
        <h3 class="bulk-sheet-title">Session already exists</h3>
        <button class="fail-close-btn" id="import-conflict-cancel" aria-label="Cancel">×</button>
      </div>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:var(--text)">
        A session for <strong>${escapeHTML(incoming.site)}</strong> on <strong>${escapeHTML(formatDate(incoming.date))}</strong> already exists with ${existingItemCount} item${existingItemCount === 1 ? '' : 's'}.
      </p>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:var(--text)">
        The imported file has ${incoming.items.length} item${incoming.items.length === 1 ? '' : 's'}. How would you like to import them?
      </p>
      <div class="import-conflict-actions">
        <button class="btn-primary" id="import-conflict-duplicate">Import as duplicate (new session)</button>
        <button class="btn-secondary" id="import-conflict-merge">Merge into existing session</button>
        <button class="btn-tertiary" id="import-conflict-cancel2">Cancel import</button>
      </div>
    </div>
  `;
}

// v10: Summary dialog body. Confirms what was imported and lists any rows that
// were skipped due to validation errors. Doubles as the success confirmation
// when nothing was skipped (skipped.length === 0).
function renderImportSummaryModal() {
  const sum = state.importDialog.summary;
  if (!sum) return '';
  const modeText = sum.mode === 'merge'
    ? `Merged ${sum.itemCount} item${sum.itemCount === 1 ? '' : 's'} into <strong>${escapeHTML(sum.sessionName)}</strong>.`
    : (sum.mode === 'duplicate'
        ? `Imported ${sum.itemCount} item${sum.itemCount === 1 ? '' : 's'} as a new duplicate of <strong>${escapeHTML(sum.sessionName)}</strong>.`
        : `Imported ${sum.itemCount} item${sum.itemCount === 1 ? '' : 's'} into new session <strong>${escapeHTML(sum.sessionName)}</strong>.`);
  const skippedBlock = (sum.skipped && sum.skipped.length > 0) ? `
    <p style="margin:12px 0 4px;font-size:14px;font-weight:600;color:var(--text)">
      ${sum.skipped.length} row${sum.skipped.length === 1 ? '' : 's'} skipped:
    </p>
    <div class="import-summary-list">
      <ul>
        ${sum.skipped.map(s => `<li>Row ${s.row}: ${escapeHTML(s.reason)}</li>`).join('')}
      </ul>
    </div>
  ` : '';
  return `
    <div class="modal-backdrop" id="import-summary-backdrop" style="z-index:300"></div>
    <div class="bulk-sheet" style="z-index:301" role="dialog" aria-label="Import summary">
      <div class="bulk-sheet-handle"></div>
      <div class="bulk-sheet-header">
        <span class="fail-close-spacer"></span>
        <h3 class="bulk-sheet-title">Import complete</h3>
        <button class="fail-close-btn" id="import-summary-close" aria-label="Close">×</button>
      </div>
      <p style="margin:0;font-size:14px;line-height:1.5;color:var(--text)">${modeText}</p>
      ${skippedBlock}
      <button class="btn-primary" id="import-summary-done" style="margin-top:14px">Done</button>
    </div>
  `;
}

function renderEntry() {
  const sess = activeSession();
  if (!sess) { state.view = 'sessions'; return renderSessions(); }
  const isExisting = state.cursor < sess.items.length;
  const existing = isExisting ? sess.items[state.cursor] : null;
  const hasLast = sess.items.length > 0;

  // v12: capture and immediately clear the search-jump cursor. The CSS
  // keyframe animation runs once on mount, so we only want to emit the
  // data-search-jump attribute on this single render — subsequent renders
  // (typing, prev/next, etc.) must not re-trigger the flash. Clearing in
  // render rather than bindEvents keeps the timing tight: the attribute
  // is present in the very HTML the browser paints, the animation fires,
  // and state is already cleared by the time the user can interact.
  const flashSearchJump = (state.searchJumpCursor !== null && state.searchJumpCursor === state.cursor);
  state.searchJumpCursor = null;

  const quickButtons = state.itemTypes.map(t => `
    <button class="quick-btn ${state.form.itemType === t ? 'active' : ''}" data-type="${escapeHTML(t)}">${escapeHTML(t)}</button>
  `).join('');

  const notesBlock = state.form.showNotes
    ? `<label class="label">Notes</label>
       <textarea class="textarea" id="f-notes" rows="2" placeholder="Optional">${escapeHTML(state.form.notes)}</textarea>`
    : `<button class="notes-toggle" id="show-notes-btn">✎ Add note</button>`;

  const resultBadge = isExisting && existing.result
    ? `<span class="result-badge ${existing.result}">· ${capitalise(existing.result).toUpperCase()}</span>`
    : '';

  const suggestionsBlock = (state.showSuggestions && state.suggestions.length > 0)
    ? `<div class="suggestions">
        ${state.suggestions.map(s => `<button class="suggestion-item" data-suggest="${escapeHTML(s)}">${escapeHTML(s)}</button>`).join('')}
      </div>`
    : '';

  // v10: location autocomplete — same .suggestions block as item-type, but the
  // entries come from the current session's existing item locations only and
  // use a distinct data-* attribute so the click handler doesn't collide with
  // the item-type one.
  const locationSuggestionsBlock = (state.showLocationSuggestions && state.locationSuggestions.length > 0)
    ? `<div class="suggestions" id="location-suggestions">
        ${state.locationSuggestions.map(s => `<button class="suggestion-item" data-loc-suggest="${escapeHTML(s)}">${escapeHTML(s)}</button>`).join('')}
      </div>`
    : '';

  const lastInfo = hasLast
    ? ` (${escapeHTML(sess.items[sess.items.length - 1].itemType)} · ${capitalise(sess.items[sess.items.length - 1].result)})`
    : '';

  let failSheetInner = '';
  if (state.failModalStage === 'reasons') {
    failSheetInner = `
      <div class="fail-reasons-grid">
        ${state.failReasons.map(r => `
          <button class="fail-reason-btn" data-reason="${escapeHTML(r)}">${escapeHTML(r)}</button>
        `).join('')}
      </div>
      <button class="fail-other-btn" id="fail-other-btn">Other…</button>
    `;
  } else {
    failSheetInner = `
      <button class="fail-other-back" id="fail-other-back">‹ Back to reasons</button>
      <textarea class="fail-other-input" id="fail-other-input" placeholder="Type reason…" rows="3">${escapeHTML(state.failOtherText)}</textarea>
      <button class="fail-other-save" id="fail-other-save">Save fail</button>
    `;
  }

  const failModal = state.failModalOpen ? `
    <div class="modal-backdrop" id="fail-backdrop"></div>
    <div class="fail-sheet" role="dialog" aria-label="Why did it fail?">
      <div class="fail-sheet-handle"></div>
      <div class="fail-sheet-header">
        <span class="fail-close-spacer"></span>
        <h3 class="fail-sheet-title">Why did it fail?</h3>
        <button class="fail-close-btn" id="fail-close" aria-label="Cancel">×</button>
      </div>
      ${failSheetInner}
    </div>
  ` : '';

  const carriedHint = (!isExisting && state.form.location)
    ? '<span class="hint">(carried from last)</span>'
    : '';

  const progressRow = `
    <div class="progress-row"${flashSearchJump ? ' data-search-jump="1"' : ''}>
      <div class="progress">Item ${state.cursor + 1} ${isExisting ? `of ${sess.items.length}` : '(new)'}${resultBadge}</div>
      ${isExisting ? `<button class="del-icon-top" id="del-item-btn" aria-label="Delete item" title="Delete item">🗑</button>` : ''}
    </div>
  `;

  // v8: lock banner sits between the header and the form. When locked, save actions
  // (Pass / Fail / Copy last) are disabled. Editing existing items via the overview
  // is still possible — the lock is a soft guard against accidental new entries.
  const isLocked = !!sess.locked;
  const lockBanner = isLocked ? `
    <div class="lock-banner" role="status">
      <span class="lock-banner-text">🔒 Session locked — no new entries</span>
      <button class="lock-banner-action" id="lock-unlock-btn">Unlock</button>
    </div>
  ` : '';

  const passFailDisabled = isLocked ? 'disabled' : '';
  const copyDisabled = (!hasLast || isLocked) ? 'disabled' : '';

  // v16: Multi Pick. Full-width button at the very bottom of the entry screen,
  // shown only when the feature is enabled in Settings. Disabled (like Pass/Fail)
  // when the session is locked. Tapping opens a bottom sheet listing the
  // configured multi-picks; each logs its sequence as PASS in one go.
  // NOTE: must be built AFTER `isLocked` is declared above — the enabled branch
  // references it, and a `const` read before its declaration is a TDZ error.
  const mpEnabled = !!(state.multiPick && state.multiPick.enabled);
  const multiPickButton = mpEnabled ? `
    <button class="multipick-btn" id="multipick-btn" ${isLocked ? 'disabled' : ''}>
      ＋ Multi Pick
    </button>
  ` : '';

  let multiPickSheet = '';
  if (state.multiPickSheetOpen) {
    const slots = activeMultiPickSlots();
    const body = slots.length ? `
      <div class="multipick-list">
        ${slots.map((s, i) => {
          const seqText = s.items.join(' · ');
          const hasName = !!s.name;
          const main = hasName ? s.name : seqText;
          const sub = hasName ? seqText : `${s.items.length} item${s.items.length === 1 ? '' : 's'}`;
          return `
            <button class="multipick-option" data-mp-index="${i}">
              <span class="multipick-option-name">${escapeHTML(main)}</span>
              <span class="multipick-option-seq">${escapeHTML(sub)}</span>
            </button>
          `;
        }).join('')}
      </div>
    ` : `
      <p class="multipick-empty">No multi-picks set up yet. Add them in Settings → Multi Pick.</p>
    `;
    multiPickSheet = `
      <div class="modal-backdrop" id="multipick-backdrop"></div>
      <div class="fail-sheet multipick-sheet" role="dialog" aria-label="Multi Pick">
        <div class="fail-sheet-handle"></div>
        <div class="fail-sheet-header">
          <span class="fail-close-spacer"></span>
          <h3 class="fail-sheet-title">Multi Pick</h3>
          <button class="fail-close-btn" id="multipick-close" aria-label="Cancel">×</button>
        </div>
        <p class="multipick-sheet-hint">Each adds its items as a PASS, in order, using the current location.</p>
        ${body}
      </div>
    `;
  }

  return `
    <div class="screen">
      <header class="header-row">
        <button class="icon-btn" id="sessions-btn" aria-label="Sessions">📁</button>
        <div class="site-name">${escapeHTML(sess.site || sess.name)}</div>
        <button class="icon-btn" id="overview-btn" aria-label="Overview">▦</button>
      </header>

      ${lockBanner}
      ${progressRow}

      <label class="label">Asset number</label>
      <input class="input-big" id="f-asset" value="${escapeHTML(state.form.assetNo)}">

      <label class="label">Location ${carriedHint}</label>
      <div class="location-input-wrap">
        <input class="input-big" id="f-location" value="${escapeHTML(state.form.location)}" placeholder="e.g. Office 1">
        ${locationSuggestionsBlock}
      </div>

      <label class="label">Item type</label>
      <div class="quick-grid">${quickButtons}</div>
      <div class="custom-type-wrap">
        <input class="input" id="f-type" value="${escapeHTML(state.form.itemType)}" placeholder="…or type custom" autocomplete="off" style="margin-top:8px">
        ${suggestionsBlock}
      </div>

      ${notesBlock}

      <div class="pass-fail-row">
        <button class="pass-btn" id="pass-btn" ${passFailDisabled}><span class="icon">✓</span>PASS</button>
        <button class="fail-btn" id="fail-btn" ${passFailDisabled}><span class="icon">✗</span>FAIL</button>
      </div>

      <button class="copy-last-btn" id="copy-last-btn" ${copyDisabled}>
        ⎘ Copy last result${lastInfo}
      </button>

      <div class="nav-row">
        <button class="nav-btn" id="prev-btn" ${state.cursor === 0 ? 'disabled' : ''}>‹ Prev</button>
        <button class="nav-btn" id="skip-new-btn" ${!isExisting ? 'disabled' : ''}>⏭ New</button>
        <button class="nav-btn" id="next-btn" ${state.cursor >= sess.items.length ? 'disabled' : ''}>Next ›</button>
      </div>

      ${multiPickButton}

      ${failModal}
      ${multiPickSheet}
    </div>
  `;
}

function computeVisibleOverviewItems(sess) {
  const q = state.searchQuery.trim().toLowerCase();
  return sess.items
    .map((it, i) => ({ it, i }))
    .filter(x => state.showFailsOnly ? x.it.result === 'fail' : true)
    .filter(x => {
      if (!q) return true;
      const it = x.it;
      return (it.assetNo || '').toLowerCase().includes(q)
          || (it.location || '').toLowerCase().includes(q)
          || (it.itemType || '').toLowerCase().includes(q)
          || (it.notes || '').toLowerCase().includes(q);
    });
}

function renderOverviewBodyHTML(sess) {
  const visible = computeVisibleOverviewItems(sess);
  if (visible.length === 0) {
    let msg;
    if (state.searchQuery.trim()) msg = 'No items match your search.';
    else if (state.showFailsOnly) msg = 'No fails in this session.';
    else msg = 'No items recorded yet.';
    return `<p class="muted">${msg}</p>`;
  }
  const sel = state.selectionMode;
  const checkColHead = sel ? `<th class="th"></th>` : '';
  return `<div class="table-wrap">
    <table class="table">
      <thead><tr>
        ${checkColHead}
        <th class="th">#</th><th class="th">Location</th><th class="th">Item</th><th class="th">Result</th><th class="th"></th>
      </tr></thead>
      <tbody>
        ${visible.map(({ it, i }) => {
          const checked = sel && state.selectedIndices.includes(i);
          const checkCol = sel
            ? `<td class="td td-check"><input type="checkbox" data-select="${i}" ${checked ? 'checked' : ''}></td>`
            : '';
          const actionCol = sel
            ? `<td class="td td-action"></td>`
            : `<td class="td td-action" data-del-item="${i}">🗑</td>`;
          const rowAttr = sel ? `data-row-toggle="${i}"` : `data-jump="${i}"`;
          const rowClass = sel && checked ? 'tr selected' : 'tr';
          // v17: when timestamps are on, show HH:MM subtly beneath the item
          // type. Items logged before the feature have no ts → no line, so the
          // column doesn't get a stray blank gap.
          const timeLine = (state.timestampsEnabled && it.ts)
            ? `<div class="item-time">${escapeHTML(formatTimeShort(it.ts))}</div>`
            : '';
          return `
            <tr class="${rowClass}" ${rowAttr}>
              ${checkCol}
              <td class="td">${escapeHTML(it.assetNo)}</td>
              <td class="td">${escapeHTML(it.location)}</td>
              <td class="td">${escapeHTML(it.itemType)}${timeLine}</td>
              <td class="td td-result ${it.result || ''}">${capitalise(it.result || '')}</td>
              ${actionCol}
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

function renderOverview() {
  const sess = activeSession();
  if (!sess) { state.view = 'sessions'; return renderSessions(); }
  const passes = sess.items.filter(i => i.result === 'pass').length;
  const fails = sess.items.filter(i => i.result === 'fail').length;

  const filterRow = sess.items.length > 0 ? `
    <div class="overview-filters">
      <input type="search" class="search-input" id="overview-search" placeholder="Search asset, location, item, notes…" value="${escapeHTML(state.searchQuery)}" autocomplete="off">
      <label class="filter-toggle">
        <input type="checkbox" id="fails-only-toggle" ${state.showFailsOnly ? 'checked' : ''}>
        <span>Show fails only</span>
      </label>
    </div>
  ` : '';

  // Header changes in selection mode
  let header;
  if (state.selectionMode) {
    const n = state.selectedIndices.length;
    header = `
      <header class="header-row">
        <button class="icon-btn" id="cancel-selection-btn" aria-label="Cancel selection">✕</button>
        <div class="site-name">${n} selected</div>
        <span style="width:40px"></span>
      </header>
    `;
  } else {
    const showSelectBtn = sess.items.length > 0;
    header = `
      <header class="header-row">
        <button class="icon-btn" id="back-btn" aria-label="Back">‹</button>
        <div class="site-name">Overview</div>
        <div class="header-actions">
          ${showSelectBtn ? `<button class="icon-btn" id="select-mode-btn" aria-label="Select items" title="Select items">☑</button>` : ''}
          <button class="icon-btn" id="edit-session-btn" aria-label="Edit session">✎</button>
          <button class="icon-btn" id="export-btn" aria-label="Share CSV">${SHARE_ICON_SVG}</button>
        </div>
      </header>
    `;
  }

  const selectAllRow = state.selectionMode ? `
    <div class="select-all-row">
      <button id="select-all-visible-btn">Select all visible</button>
      <button id="clear-selection-btn">Clear</button>
    </div>
  ` : '';

  // v11: selection bar now shows "Edit selected ▾" instead of "Change location"
  // directly. Tapping it opens the bulk-edit menu sheet with four options:
  // Location, Type, Notes, Delete. The location flow still uses the existing
  // v10 bulkLocationDialogOpen path so we don't regress that codepath; the
  // other three are new and live entirely in state.bulkEdit.
  const selectionBar = state.selectionMode ? `
    <div class="selection-bar">
      <span class="selection-bar-count">${state.selectedIndices.length} selected</span>
      <button class="selection-bar-action" id="bulk-edit-menu-btn" ${state.selectedIndices.length === 0 ? 'disabled' : ''}>Edit selected ▾</button>
    </div>
  ` : '';

  // v11: bulk-edit menu sheet. Four options stacked vertically. Delete is
  // styled as a destructive action (red) and sits at the bottom to put more
  // distance between it and the safer edits above it.
  const bulkMenu = state.bulkEdit.menuOpen ? `
    <div class="modal-backdrop" id="bulk-menu-backdrop"></div>
    <div class="bulk-sheet" role="dialog" aria-label="Edit selected items">
      <div class="bulk-sheet-handle"></div>
      <div class="bulk-sheet-header">
        <span class="fail-close-spacer"></span>
        <h3 class="bulk-sheet-title">Edit ${state.selectedIndices.length} item${state.selectedIndices.length === 1 ? '' : 's'}</h3>
        <button class="fail-close-btn" id="bulk-menu-close" aria-label="Cancel">×</button>
      </div>
      <div class="bulk-menu-actions">
        <button class="bulk-menu-btn" data-bulk-edit="location">Change location</button>
        <button class="bulk-menu-btn" data-bulk-edit="type">Change type</button>
        <button class="bulk-menu-btn" data-bulk-edit="notes">Change notes</button>
        <button class="bulk-menu-btn danger" data-bulk-edit="delete">Delete selected</button>
      </div>
    </div>
  ` : '';

  // v10/v11: location dialog — reuses the v10 path. Opened via the bulk-edit
  // menu (mode === 'location' OR legacy bulkLocationDialogOpen).
  const bulkDialog = state.bulkLocationDialogOpen ? `
    <div class="modal-backdrop" id="bulk-backdrop"></div>
    <div class="bulk-sheet" role="dialog" aria-label="Change location">
      <div class="bulk-sheet-handle"></div>
      <div class="bulk-sheet-header">
        <span class="fail-close-spacer"></span>
        <h3 class="bulk-sheet-title">Change location for ${state.selectedIndices.length} item${state.selectedIndices.length === 1 ? '' : 's'}</h3>
        <button class="fail-close-btn" id="bulk-cancel-btn" aria-label="Cancel">×</button>
      </div>
      <input class="input-big" id="bulk-location-input" value="${escapeHTML(state.bulkLocationValue)}" placeholder="New location" autofocus style="margin-bottom:14px">
      <button class="btn-primary" id="bulk-apply-btn">Apply to ${state.selectedIndices.length} item${state.selectedIndices.length === 1 ? '' : 's'}</button>
    </div>
  ` : '';

  // v11: bulk-edit Type dialog. Shows the active preset's quick-picks above a
  // free-text input — same pattern as the entry screen but laid out for a
  // bottom sheet. Tapping a quick-pick fills the input.
  const typeQuickButtons = (state.itemTypes || []).map(t =>
    `<button class="quick-btn" data-bulk-type-quick="${escapeHTML(t)}">${escapeHTML(t)}</button>`
  ).join('');
  const bulkTypeDialog = state.bulkEdit.mode === 'type' ? `
    <div class="modal-backdrop" id="bulk-type-backdrop"></div>
    <div class="bulk-sheet" role="dialog" aria-label="Change item type">
      <div class="bulk-sheet-handle"></div>
      <div class="bulk-sheet-header">
        <span class="fail-close-spacer"></span>
        <h3 class="bulk-sheet-title">Change type for ${state.selectedIndices.length} item${state.selectedIndices.length === 1 ? '' : 's'}</h3>
        <button class="fail-close-btn" id="bulk-type-cancel" aria-label="Cancel">×</button>
      </div>
      <div class="quick-grid" style="margin-bottom:10px">${typeQuickButtons}</div>
      <input class="input-big" id="bulk-type-input" value="${escapeHTML(state.bulkEdit.typeValue)}" placeholder="…or type custom" autocomplete="off" style="margin-bottom:14px">
      <button class="btn-primary" id="bulk-type-apply">Apply to ${state.selectedIndices.length} item${state.selectedIndices.length === 1 ? '' : 's'}</button>
    </div>
  ` : '';

  // v11: bulk-edit Notes dialog. Two-mode (radio): Replace overwrites all
  // selected items' notes; Append concatenates the new text after a "; "
  // separator. Empty text is allowed only in Replace mode (clears notes).
  const bulkNotesDialog = state.bulkEdit.mode === 'notes' ? `
    <div class="modal-backdrop" id="bulk-notes-backdrop"></div>
    <div class="bulk-sheet" role="dialog" aria-label="Change notes">
      <div class="bulk-sheet-handle"></div>
      <div class="bulk-sheet-header">
        <span class="fail-close-spacer"></span>
        <h3 class="bulk-sheet-title">Change notes for ${state.selectedIndices.length} item${state.selectedIndices.length === 1 ? '' : 's'}</h3>
        <button class="fail-close-btn" id="bulk-notes-cancel" aria-label="Cancel">×</button>
      </div>
      <div class="bulk-notes-mode">
        <label class="bulk-notes-mode-opt">
          <input type="radio" name="bulk-notes-mode" value="replace" ${state.bulkEdit.notesMode !== 'append' ? 'checked' : ''}>
          <span><strong>Replace</strong> — overwrite existing notes</span>
        </label>
        <label class="bulk-notes-mode-opt">
          <input type="radio" name="bulk-notes-mode" value="append" ${state.bulkEdit.notesMode === 'append' ? 'checked' : ''}>
          <span><strong>Append</strong> — add to existing notes (separated by " ; ")</span>
        </label>
      </div>
      <textarea class="input" id="bulk-notes-input" rows="3" placeholder="${state.bulkEdit.notesMode === 'append' ? 'Text to append' : 'New notes (leave empty to clear)'}" style="margin-bottom:14px">${escapeHTML(state.bulkEdit.notesValue)}</textarea>
      <button class="btn-primary" id="bulk-notes-apply">Apply to ${state.selectedIndices.length} item${state.selectedIndices.length === 1 ? '' : 's'}</button>
    </div>
  ` : '';

  const stats = `<div class="progress">${sess.items.length} items · <span class="pass-text">${passes} pass</span> · <span class="fail-text">${fails} fail</span>${sess.engineer ? ' · ' + escapeHTML(sess.engineer) : ''}</div>`;

  return `
    <div class="screen">
      ${header}
      ${stats}
      ${state.selectionMode ? '' : filterRow}
      ${selectAllRow}
      <div class="overview-body">${renderOverviewBodyHTML(sess)}</div>
      ${selectionBar}
      ${bulkMenu}
      ${bulkDialog}
      ${bulkTypeDialog}
      ${bulkNotesDialog}
    </div>
  `;
}

function refreshOverviewBody() {
  const sess = activeSession();
  if (!sess) return;
  const wrap = document.querySelector('.overview-body');
  if (!wrap) return;
  wrap.innerHTML = renderOverviewBodyHTML(sess);
  bindOverviewBodyEvents();
}

function bindOverviewBodyEvents() {
  document.querySelectorAll('[data-jump]').forEach(el => {
    el.onclick = () => jumpTo(parseInt(el.dataset.jump, 10));
  });
  document.querySelectorAll('[data-del-item]').forEach(el => {
    el.onclick = (e) => { e.stopPropagation(); if (confirm('Are you sure you want to delete this item?\n\nThis cannot be undone.')) deleteItem(parseInt(el.dataset.delItem, 10)); };
  });
  document.querySelectorAll('[data-row-toggle]').forEach(el => {
    el.onclick = (e) => {
      // Avoid double-toggling when the checkbox itself is clicked
      if (e.target && e.target.tagName === 'INPUT') return;
      toggleSelected(parseInt(el.dataset.rowToggle, 10));
      render();
    };
  });
  document.querySelectorAll('[data-select]').forEach(el => {
    el.onchange = () => {
      toggleSelected(parseInt(el.dataset.select, 10));
      render();
    };
  });
}

// v10: Bind events for everything inside #sessions-list-area. Called both from
// bindEvents() on initial render and from refreshSessionsListAreaOnly() after
// each keystroke in the sessions search input.
function bindSessionsListAreaEvents() {
  const $ = id => document.getElementById(id);
  if ($('sort-select')) $('sort-select').onchange = e => {
    state.sort = e.target.value;
    save();
    refreshSessionsListAreaOnly();
  };
  // v15: Status + Lock filters. Both persist and re-render just the list area.
  if ($('status-filter')) $('status-filter').onchange = e => {
    state.sessionFilter = e.target.value;
    save();
    refreshSessionsListAreaOnly();
  };
  if ($('lock-filter')) $('lock-filter').onchange = e => {
    state.lockFilter = e.target.value;
    save();
    refreshSessionsListAreaOnly();
  };
  // v15: reset both filters from the filtered-empty state.
  if ($('clear-filters-btn')) $('clear-filters-btn').onclick = () => {
    state.sessionFilter = 'all';
    state.lockFilter = 'all';
    save();
    refreshSessionsListAreaOnly();
  };
  // v15: tappable nudge → bulk-export all not-yet-cleanly-exported sessions.
  if ($('bulk-export-btn')) $('bulk-export-btn').onclick = () => bulkExportUnexported();
  document.querySelectorAll('[data-open]').forEach(el => {
    el.onclick = () => {
      const id = el.dataset.open;
      // v10: if the card was rendered with data-open-at (search-mode item-level
      // match), jump straight to that item rather than the default "new entry"
      // position at end-of-list.
      if (el.dataset.openAt !== undefined && el.dataset.openAt !== '') {
        const idx = parseInt(el.dataset.openAt, 10);
        requestOpenSession(id, { cursor: idx });   // v14: warning gatekeeper
      } else {
        requestOpenSession(id);                     // v14: warning gatekeeper
      }
    };
  });
  document.querySelectorAll('[data-export]').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      const s = state.sessions.find(x => x.id === el.dataset.export);
      // v10: native share sheet first (iOS/Android), falls back to download.
      if (s) shareOrDownloadCSV(s);
    };
  });
  document.querySelectorAll('[data-delete-session]').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      const s = state.sessions.find(x => x.id === el.dataset.deleteSession);
      if (s && confirm(`Delete "${s.site || s.name}"? This cannot be undone.`)) deleteSession(el.dataset.deleteSession);
    };
  });
}

function renderEditSession() {
  const lockChecked = state.editForm.locked ? 'checked' : '';
  return `
    <div class="screen">
      <header class="header-row">
        <button class="icon-btn" id="cancel-edit-btn" aria-label="Cancel">‹</button>
        <div class="site-name">Edit session</div>
        <span style="width:40px"></span>
      </header>
      <div class="card">
        <label class="label">Site / client</label>
        <input class="input" id="ef-site" value="${escapeHTML(state.editForm.site)}">
        <label class="label">Engineer</label>
        <input class="input" id="ef-engineer" value="${escapeHTML(state.editForm.engineer)}">
        <label class="label">Session name</label>
        <input class="input" id="ef-name" value="${escapeHTML(state.editForm.name)}">
        <label class="label">Date</label>
        <input class="input input-date" id="ef-date" type="date" value="${escapeHTML(state.editForm.date)}">
        <label class="label">Asset number prefix</label>
        <input class="input" id="ef-prefix" value="${escapeHTML(state.editForm.prefix)}">

        <!-- v8: lock toggle. When on, Pass/Fail/Copy on the entry screen are disabled.
             Bulk edit and item delete from the overview still work, so mistakes can be
             corrected without unlocking the whole session. -->
        <div class="lock-toggle-row">
          <div class="lock-toggle-text">
            <div class="lock-toggle-title">🔒 Lock session</div>
            <div class="lock-toggle-sub">Prevents new entries from the test screen. Edits via the overview still work.</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="ef-locked" ${lockChecked}>
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="btn-row">
          <button class="btn-secondary" id="ef-cancel">Cancel</button>
          <button class="btn-primary" id="ef-save">Save</button>
        </div>
      </div>
    </div>
  `;
}

// ===== Settings hub & sub-pages (v7) =====

function renderSettingsHub() {
  // Each row leads to a focused sub-page. The subtitle gives a one-glance count or status.
  // v9: subtitle on Items row now shows the active preset name + count.
  const activeP = activePreset();
  const itemCount = activeP ? activeP.items.length : 0;
  const presetCount = state.itemPresets.length;
  const itemSummary = activeP
    ? `${escapeHTML(activeP.name)} · ${itemCount} quick-pick${itemCount === 1 ? '' : 's'}${presetCount > 1 ? ` · ${presetCount} presets` : ''}`
    : 'No preset selected';
  const failSummary = state.failReasons.length === 1 ? '1 quick-pick' : `${state.failReasons.length} quick-picks`;
  // v16: Multi Pick summary — count of configured slots + on/off state.
  const mpSlots = activeMultiPickSlots().length;
  const mpSummary = mpSlots === 0
    ? (state.multiPick.enabled ? 'On · none set up yet' : 'Off')
    : `${state.multiPick.enabled ? 'On' : 'Off'} · ${mpSlots} multi-pick${mpSlots === 1 ? '' : 's'}`;
  const descSummary = state.descriptions.length === 1 ? '1 description' : `${state.descriptions.length} descriptions`;
  const themeSummary = state.theme === 'system' ? 'System' : (state.theme === 'dark' ? 'Dark' : 'Light');
  const hapticsSummary = state.hapticsEnabled ? 'Haptics on' : 'Haptics off';
  // v17: surface the two opt-in extras only when on, to keep the subtitle short
  // by default. e.g. "System · Haptics on · Sound on · Times on".
  const displayExtras = [];
  if (state.soundEnabled) displayExtras.push('Sound on');
  if (state.timestampsEnabled) displayExtras.push('Times on');
  const displaySummary = [themeSummary, hapticsSummary, ...displayExtras].join(' · ');
  // v11: CSV summary — how many columns are visible vs total, plus whether
  // they've been customised away from defaults.
  const visibleCsv = state.csvColumns.filter(c => c.visible).length;
  const totalCsv = state.csvColumns.length;
  const csvCustomised = state.csvColumns.some((c, i) => {
    const d = DEFAULT_CSV_COLUMNS[i];
    return !d || d.id !== c.id || d.header !== c.header || d.visible !== c.visible;
  });
  const csvSummary = `${visibleCsv} of ${totalCsv} column${totalCsv === 1 ? '' : 's'} visible${csvCustomised ? ' · customised' : ''}`;

  // v12: User Settings subtitle picks up calibration-due status. The base
  // text is the engineer name (or "Engineer name" placeholder); we append
  // " · Cal overdue (N days)" or " · Cal due in N days" when there's
  // something to flag. 'ok' (more than 30 days off) and missing dates
  // produce no suffix — the row stays clean by default.
  const calSt = calibrationStatus();
  let userSubtitle = state.engineer ? state.engineer : 'Engineer name';
  if (calSt && calSt.status === 'overdue') {
    userSubtitle += ` · Cal overdue (${calSt.days} day${calSt.days === 1 ? '' : 's'})`;
  } else if (calSt && calSt.status === 'soon') {
    // v15: when the due date is today (days === 0), "due in 0 days" reads
    // awkwardly — say "due today" instead.
    userSubtitle += calSt.days === 0
      ? ' · Cal due today'
      : ` · Cal due in ${calSt.days} day${calSt.days === 1 ? '' : 's'}`;
  }

  const rows = [
    { id: 'settingsUser', icon: '👤', title: 'User Settings', sub: userSubtitle },
    { id: 'settingsItems', icon: '⚡', title: 'Quick Pick Items', sub: itemSummary },
    { id: 'settingsFails', icon: '⚠️', title: 'Quick Pick Fail', sub: failSummary },
    { id: 'settingsMultiPick', icon: '🧰', title: 'Multi Pick', sub: mpSummary },   // v16
    { id: 'settingsDescriptions', icon: '📝', title: 'Item Description List', sub: descSummary },
    { id: 'settingsDisplay', icon: '🎨', title: 'Display Settings', sub: displaySummary },
    { id: 'settingsCsv', icon: '📊', title: 'CSV Columns', sub: csvSummary },   // v11
    { id: 'settingsBackup', icon: '💾', title: 'Backup & Restore', sub: 'Export or import all data' },
    { id: 'settingsCalculator', icon: '🧮', title: 'Resistance Calculator', sub: 'Earth continuity limit' },
    { id: 'settingsAbout', icon: 'ℹ️', title: 'About', sub: 'About this app' },
    { id: 'settingsContact', icon: '✉️', title: 'Contact', sub: 'Get in touch' }
  ];

  return `
    <div class="screen">
      <header class="header-row">
        <button class="icon-btn" id="back-btn" aria-label="Back">‹</button>
        <div class="site-name">Settings</div>
        <span style="width:40px"></span>
      </header>
      <div class="settings-list">
        ${rows.map(r => `
          <button class="settings-row" data-page="${r.id}">
            <span class="settings-row-icon">${r.icon}</span>
            <div class="settings-row-text">
              <div class="settings-row-title">${escapeHTML(r.title)}</div>
              <div class="settings-row-sub">${escapeHTML(r.sub)}</div>
            </div>
            <span class="settings-row-chevron">›</span>
          </button>
        `).join('')}
      </div>
      <p class="settings-footer">PAT Test ${APP_VERSION} · © 2026 Peter Birchley<br>Data stored on this device only</p>
    </div>
  `;
}

function renderSettingsSubHeader(title) {
  return `
    <header class="header-row">
      <button class="icon-btn" id="back-to-settings-btn" aria-label="Back">‹</button>
      <div class="site-name">${escapeHTML(title)}</div>
      <span style="width:40px"></span>
    </header>
  `;
}

function renderSettingsUser() {
  // v12: build the calibration-due chip if a due date is set and is either
  // overdue or within CAL_DUE_SOON_DAYS. Placed in the label for the "Next
  // calibration due" field so it sits visually next to the date input that
  // drives it. Empty string when there's nothing to flag (no date set, or
  // 'ok' status).
  const calSt = calibrationStatus();
  let calChip = '';
  if (calSt && calSt.status === 'overdue') {
    calChip = ` <span class="cal-chip overdue">Overdue · ${calSt.days} day${calSt.days === 1 ? '' : 's'}</span>`;
  } else if (calSt && calSt.status === 'soon') {
    // v15: "Due today" when the due date is today (days === 0).
    calChip = calSt.days === 0
      ? ` <span class="cal-chip soon">Due today</span>`
      : ` <span class="cal-chip soon">Due in ${calSt.days} day${calSt.days === 1 ? '' : 's'}</span>`;
  }

  return `
    <div class="screen">
      ${renderSettingsSubHeader('User Settings')}
      <div class="settings-section">
        <h2 class="h2">Engineer name</h2>
        <p class="muted">Used as the default for new sessions and shown on exported CSVs.</p>
        <input class="input" id="settings-engineer" value="${escapeHTML(state.engineer)}" placeholder="Your name">
      </div>

      <!-- v11: tester type + calibration info. All optional. Stored locally
           and included in JSON backups. v12 update: exports to CSV via four
           default-hidden columns under Settings → CSV Columns. v13: tester
           split into Manufacturer + Model — combined back into a single
           space-separated value at CSV export time. -->
      <div class="settings-section">
        <h2 class="h2">Test instrument</h2>
        <p class="muted">The make and model of your PAT tester, if you'd like to record it. Combined as a single value on the CSV export when the "Test Instrument" column is enabled in Settings → CSV Columns.</p>

        <label class="label">Manufacturer</label>
        <input class="input" id="settings-tester-make" value="${escapeHTML(state.testerMake)}" placeholder="e.g. Megger, Seaward, Kewtech">

        <label class="label">Model</label>
        <input class="input" id="settings-tester-model" value="${escapeHTML(state.testerModel)}" placeholder="e.g. PAT250, Apollo 600, KT77">
      </div>

      <div class="settings-section">
        <h2 class="h2">Calibration</h2>
        <p class="muted">Calibration details for your tester. All optional. v12: exports to CSV when the matching columns are enabled in Settings → CSV Columns.</p>

        <label class="label">Last calibration date</label>
        <input class="input" id="settings-cal-date" type="date" value="${escapeHTML(state.calDate)}">

        <label class="label">Certificate number</label>
        <input class="input" id="settings-cal-cert" value="${escapeHTML(state.calCertNo)}" placeholder="e.g. CAL-2026-0142">

        <label class="label">Next calibration due${calChip}</label>
        <input class="input" id="settings-cal-due" type="date" value="${escapeHTML(state.calDue)}">
      </div>

      <button class="btn-primary" id="settings-user-save" style="margin-top:24px">Save</button>
    </div>
  `;
}

function renderSettingsItems() {
  const presets = state.itemPresets;
  const active = activePreset();
  const presetOptions = presets.map(p =>
    `<option value="${escapeHTML(p.id)}"${p.id === state.activePresetId ? ' selected' : ''}>${escapeHTML(p.name)}</option>`
  ).join('');
  const canDelete = presets.length > 1;
  const presetCount = presets.length;
  const presetSummary = presetCount === 1 ? '1 preset' : `${presetCount} presets`;

  // v9: presets dialog (rename / new) — uses the existing bulk-sheet bottom-sheet
  // pattern so it visually matches the bulk-edit-location dialog and the fail
  // picker. One input, two buttons.
  const dialog = state.presetDialog;
  const dialogModal = (dialog.mode === 'new' || dialog.mode === 'rename') ? `
    <div class="modal-backdrop" id="preset-backdrop"></div>
    <div class="bulk-sheet" role="dialog" aria-label="${dialog.mode === 'new' ? 'New preset' : 'Rename preset'}">
      <div class="bulk-sheet-handle"></div>
      <div class="bulk-sheet-header">
        <span class="fail-close-spacer"></span>
        <h3 class="bulk-sheet-title">${dialog.mode === 'new' ? 'New preset' : 'Rename preset'}</h3>
        <button class="fail-close-btn" id="preset-dialog-cancel" aria-label="Cancel">×</button>
      </div>
      <label class="label">Name</label>
      <input class="input" id="preset-dialog-input" value="${escapeHTML(dialog.name)}" placeholder="e.g. Workshop, Office, Site visit" autofocus>
      <button class="btn-primary" id="preset-dialog-confirm" style="margin-top:14px">${dialog.mode === 'new' ? 'Create' : 'Save'}</button>
    </div>
  ` : '';

  return `
    <div class="screen">
      ${renderSettingsSubHeader('Quick Pick Items')}

      <!-- v9: Presets picker. Switching here changes which list is edited below
           and which 9 items appear on the entry screen. Selection sticks
           globally until changed again. -->
      <div class="settings-section">
        <h2 class="h2">Preset</h2>
        <p class="muted">${escapeHTML(presetSummary)}. The selected preset is what shows on the entry screen.</p>
        <select class="input" id="settings-preset-select">${presetOptions}</select>
        <div class="preset-actions-row">
          <button class="preset-action-btn" id="preset-new-btn">＋ New</button>
          <button class="preset-action-btn" id="preset-rename-btn">✎ Rename</button>
          <button class="preset-action-btn preset-action-danger" id="preset-delete-btn"${canDelete ? '' : ' disabled'}>🗑 Delete</button>
        </div>
      </div>

      <div class="settings-section">
        <h2 class="h2">Items in "${escapeHTML(active ? active.name : '')}"</h2>
        <p class="muted">One per line. Up to 9. Appear as quick-tap buttons on the entry screen.</p>
        <textarea class="textarea" id="settings-types" style="min-height:240px">${escapeHTML((active ? active.items : []).join('\n'))}</textarea>
      </div>

      <div class="btn-row" style="margin-top:24px">
        <button class="btn-secondary" id="settings-items-reset">↺ Reset to defaults</button>
        <button class="btn-primary" id="settings-items-save">Save</button>
      </div>

      ${dialogModal}
    </div>
  `;
}

function renderSettingsFails() {
  return `
    <div class="screen">
      ${renderSettingsSubHeader('Quick Pick Fail')}
      <div class="settings-section">
        <h2 class="h2">Fail reasons</h2>
        <p class="muted">One per line. Up to 6. Shown when you tap FAIL.</p>
        <textarea class="textarea" id="settings-reasons" style="min-height:200px">${escapeHTML(state.failReasons.join('\n'))}</textarea>
      </div>
      <div class="btn-row" style="margin-top:24px">
        <button class="btn-secondary" id="settings-fails-reset">↺ Reset to defaults</button>
        <button class="btn-primary" id="settings-fails-save">Save</button>
      </div>
    </div>
  `;
}

function renderSettingsMultiPick() {
  const enabled = !!(state.multiPick && state.multiPick.enabled);
  const slots = state.multiPick.slots || [];

  // Always render MULTIPICK_MAX_SLOTS fixed rows, pre-filled from the stored
  // slots in order. Empty rows save as empty and are dropped on save. This keeps
  // the editor predictable (no add/remove buttons to fiddle with on mobile).
  const slotRows = [];
  for (let i = 0; i < MULTIPICK_MAX_SLOTS; i++) {
    const s = slots[i] || { name: '', items: [] };
    const seqValue = (s.items || []).join(', ');
    slotRows.push(`
      <div class="mp-slot">
        <div class="mp-slot-head">Multi-pick ${i + 1}</div>
        <input class="input mp-slot-name" value="${escapeHTML(s.name || '')}" placeholder="Name (optional) — e.g. Desk PC setup">
        <input class="input mp-slot-seq" value="${escapeHTML(seqValue)}" placeholder="Lead, AC Adapter, Lead, PC, Lead, Monitor">
      </div>
    `);
  }

  return `
    <div class="screen">
      ${renderSettingsSubHeader('Multi Pick')}

      <div class="settings-section">
        <h2 class="h2">Multi Pick button</h2>
        <p class="muted">Multi Pick logs a fixed list of items as PASS, in order, with a single tap — handy on jobs with lots of identical setups, and easy to leave off when you don't need it.</p>
        <div class="toggle-row">
          <div class="toggle-row-text">
            <div class="toggle-row-title">Show on entry screen</div>
            <div class="toggle-row-sub" id="multipick-enabled-sub">${enabled ? 'On' : 'Off'}</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="multipick-enabled" ${enabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="settings-section">
        <h2 class="h2">Your multi-picks</h2>
        <p class="muted">For each one, type the item types you want logged, <strong>separated by commas</strong>, in the order they should be added. Add a name to label the button, or leave it blank to show the list itself. Leave a multi-pick's items blank to hide it. Up to ${MULTIPICK_MAX_SLOTS}.</p>
        <div class="mp-example">Example — items <strong>Lead, AC Adapter, Lead, PC, Lead, Monitor</strong> log six passes in that order, each on whatever location is in the entry screen's Location field.</div>
        ${slotRows.join('')}
      </div>

      <button class="btn-primary" id="settings-multipick-save" style="margin-top:24px">Save</button>
    </div>
  `;
}

function renderSettingsDescriptions() {
  return `
    <div class="screen">
      ${renderSettingsSubHeader('Item Description List')}
      <div class="settings-section">
        <h2 class="h2">Saved descriptions</h2>
        <p class="muted">Item types you've typed into the custom field. Edit to fix typos for future autocomplete (won't change items already saved). Add new lines to seed autocomplete with common items.</p>
        <textarea class="textarea" id="settings-descriptions" style="min-height:280px">${escapeHTML(state.descriptions.join('\n'))}</textarea>
      </div>
      <div class="btn-row" style="margin-top:24px">
        <button class="btn-secondary" id="settings-descriptions-reset">↺ Reset to defaults</button>
        <button class="btn-primary" id="settings-descriptions-save">Save</button>
      </div>
    </div>
  `;
}

function renderSettingsDisplay() {
  const themes = [
    { key: 'system', label: 'System', sub: 'Match device appearance' },
    { key: 'light', label: 'Light', sub: '' },
    { key: 'dark', label: 'Dark', sub: '' }
  ];
  return `
    <div class="screen">
      ${renderSettingsSubHeader('Display Settings')}
      <div class="settings-section">
        <h2 class="h2">Theme</h2>
        <p class="muted">Choose how the app looks.</p>
        <div class="theme-options">
          ${themes.map(t => `
            <button class="theme-option" data-set-theme="${t.key}">
              <span class="theme-option-radio ${state.theme === t.key ? 'checked' : ''}"></span>
              <span class="theme-option-label">${escapeHTML(t.label)}</span>
              ${t.sub ? `<span class="theme-option-sub">${escapeHTML(t.sub)}</span>` : ''}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="settings-section">
        <h2 class="h2">Haptics</h2>
        <p class="muted">Vibration on pass, fail, and copy actions. Turn off if you find it distracting or if it's too aggressive on your device.</p>
        <p class="muted" style="margin-top:8px">Note: iPhones on iOS 26.5 or later no longer allow apps like this one to trigger vibration from the web. On those phones the on-screen flash still confirms every action, and you can switch on Sound feedback below for an audible cue.</p>
        <div class="toggle-row">
          <div class="toggle-row-text">
            <div class="toggle-row-title">Haptic feedback</div>
            <div class="toggle-row-sub">${state.hapticsEnabled ? 'On' : 'Off'}</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="haptics-toggle" ${state.hapticsEnabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="settings-section">
        <h2 class="h2">Sound feedback</h2>
        <p class="muted">Play a short tone on pass, fail, and copy actions — a different tone for each. Useful where vibration isn't available (newer iPhones) or when you want an audible confirmation. Off by default.</p>
        <div class="toggle-row">
          <div class="toggle-row-text">
            <div class="toggle-row-title">Sound on pass / fail / copy</div>
            <div class="toggle-row-sub">${state.soundEnabled ? 'On' : 'Off'}</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="sound-toggle" ${state.soundEnabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="settings-section">
        <h2 class="h2">Item timestamps</h2>
        <p class="muted">Record the time each item was first logged. When on, the time shows beneath the item in a session's overview, and a Time column becomes available for CSV export (switch it on under Settings → CSV Columns). Items logged while this is off have no time recorded. Off by default.</p>
        <div class="toggle-row">
          <div class="toggle-row-text">
            <div class="toggle-row-title">Record item times</div>
            <div class="toggle-row-sub">${state.timestampsEnabled ? 'On' : 'Off'}</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="timestamps-toggle" ${state.timestampsEnabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>
  `;
}

function renderSettingsBackup() {
  const stats = getStorageStats();
  const barClass = stats.pct >= 90 ? 'danger' : (stats.pct >= 70 ? 'warn' : '');
  // v14: prune suggestion — sessions exported AND older than the threshold.
  const prunable = prunableSessions();
  const ageMonths = state.pruneAgeMonths || PRUNE_AGE_DEFAULT;
  const pruneBlock = prunable.length > 0 ? `
          <div class="prune-suggestion">
            <p class="prune-suggestion-text">${prunable.length} exported session${prunable.length === 1 ? '' : 's'} older than ${ageMonths} month${ageMonths === 1 ? '' : 's'} can be cleared to free space.</p>
            <button class="backup-action-btn" id="prune-review-btn">Review &amp; clear…</button>
          </div>
  ` : `<p class="muted" style="margin-top:10px;font-size:12px">No exported sessions older than ${ageMonths} month${ageMonths === 1 ? '' : 's'} to clear right now.</p>`;
  return `
    <div class="screen">
      ${renderSettingsSubHeader('Backup & Restore')}
      <div class="settings-section">
        <h2 class="h2">Backup</h2>
        <p class="muted">Save a complete copy of all sessions and settings as a single JSON file. Keep it somewhere safe — it's the only safety net if the browser ever clears its data.</p>
        <button class="backup-action-btn primary" id="backup-export-btn">⬇ Export backup (.json)</button>
      </div>

      <div class="settings-section">
        <h2 class="h2">Restore</h2>
        <p class="muted">Import a previously exported backup file. <strong>This will replace all current data on this device.</strong> You'll be asked to confirm before anything is overwritten.</p>
        <input type="file" id="backup-import-file" accept="application/json,.json" style="display:none">
        <button class="backup-action-btn danger" id="backup-import-btn">⬆ Import backup (.json)</button>
      </div>

      <div class="settings-section">
        <h2 class="h2">Storage usage</h2>
        <div class="storage-card">
          <div class="storage-stat"><span class="storage-stat-label">Sessions</span><span class="storage-stat-value">${stats.sessions}</span></div>
          <div class="storage-stat"><span class="storage-stat-label">Items recorded</span><span class="storage-stat-value">${stats.items.toLocaleString()}</span></div>
          <div class="storage-stat"><span class="storage-stat-label">Storage used</span><span class="storage-stat-value">${formatBytes(stats.bytes)}</span></div>
          <div class="storage-stat"><span class="storage-stat-label">Approx. limit</span><span class="storage-stat-value">~5 MB</span></div>
          <div class="storage-bar-wrap"><div class="storage-bar ${barClass}" style="width:${stats.pct}%"></div></div>
          <p class="muted" style="margin-top:10px;font-size:12px">Browsers cap local data at around 5 MB. Export a backup and clear old sessions before you get close to the limit.</p>
          ${pruneBlock}
        </div>
      </div>

      <div class="settings-section">
        <h2 class="h2">Clear-old-sessions age</h2>
        <p class="muted">When a session has been exported and is older than this, it'll be offered for clearing above. Nothing is ever deleted without your confirmation.</p>
        <label class="label">Age in months</label>
        <input class="input" id="prune-age-input" type="number" inputmode="numeric" min="1" max="120" value="${ageMonths}">
        <div class="btn-row">
          <button class="btn-primary" id="prune-age-save">Save</button>
        </div>
      </div>
    </div>
  `;
}

// ---------- v11: CSV Columns settings page ----------
// Controls the column order, visibility, and header text used by buildCSV().
// Layout for each row: ↑ button, ↓ button, visibility checkbox, header text
// input, plus a "(default: X)" hint when the header has been customised. The
// up/down arrows are the primary reorder mechanism — they work reliably on
// iOS PWA where drag-and-drop is unreliable. The list re-renders on every
// arrow tap (via moveCsvColumn), which preserves user-edited but not yet
// saved header text by reading the DOM first.
//
// Save validates that at least one column is visible. Reset restores the
// defaults via resetCsvColumnsSettings().
//
// Changes here only affect exports; the in-app screens (entry, overview,
// edit) are unaffected by column hiding / renaming.
function renderSettingsCsv() {
  const cols = state.csvColumns;
  const rowsHtml = cols.map((c, i) => {
    const isFirst = i === 0;
    const isLast = i === cols.length - 1;
    const def = defaultHeaderFor(c.id);
    const hint = (c.header && c.header !== def)
      ? `<span class="csv-col-default-hint">Default: ${escapeHTML(def)}</span>`
      : '';
    return `
      <div class="csv-col-row" data-col-id="${escapeHTML(c.id)}">
        <div class="csv-col-row-top">
          <div class="csv-col-arrows">
            <button class="csv-col-arrow" data-csv-up="${escapeHTML(c.id)}" ${isFirst ? 'disabled' : ''} aria-label="Move up">▲</button>
            <button class="csv-col-arrow" data-csv-down="${escapeHTML(c.id)}" ${isLast ? 'disabled' : ''} aria-label="Move down">▼</button>
          </div>
          <label class="csv-col-vis-label">
            <input type="checkbox" class="csv-col-visible" ${c.visible ? 'checked' : ''}>
            <span>Show</span>
          </label>
        </div>
        <label class="label csv-col-header-label">Header text</label>
        <input class="input csv-col-header" value="${escapeHTML(c.header || def)}" placeholder="${escapeHTML(def)}">
        ${hint}
      </div>
    `;
  }).join('');

  return `
    <div class="screen">
      ${renderSettingsSubHeader('CSV Columns')}
      <div class="settings-section">
        <p class="muted" style="margin-top:0">Customise the columns on exported CSV files. Reorder with the arrows, untick "Show" to hide a column entirely, or edit the header text. These changes only affect the exported file — the app screens are unchanged.</p>
        <div class="csv-cols-list">${rowsHtml}</div>
      </div>

      <button class="btn-primary" id="settings-csv-save" style="margin-top:8px">Save</button>
      <button class="btn-secondary" id="settings-csv-reset" style="margin-top:8px;width:100%">Reset to defaults</button>
    </div>
  `;
}

function computeEarthLimit(csaKey, lengthM) {
  const r = CSA_RESISTANCE[csaKey];
  if (r === undefined) return null;
  const limit = 0.1 + (lengthM * r);
  return limit;
}

function formatLengthOption(m) {
  // Show whole-metre values without decimals, sub-metre with the fractional value.
  return Number.isInteger(m) ? `${m} m` : `${m} m`;
}

function renderSettingsCalculator() {
  const csaOptions = Object.keys(CSA_RESISTANCE).map(k =>
    `<option value="${k}"${state.calcCsa === k ? ' selected' : ''}>${k} mm²</option>`
  ).join('');

  const lengthOptions = CALC_LENGTHS.map(L =>
    `<option value="${L}"${Number(state.calcLength) === L ? ' selected' : ''}>${formatLengthOption(L)}</option>`
  ).join('');

  const limit = computeEarthLimit(state.calcCsa, Number(state.calcLength));
  const limitText = limit === null ? '—' : `${limit.toFixed(2)} Ω`;
  const r = CSA_RESISTANCE[state.calcCsa];
  const workings = r === undefined ? '' :
    `(0.1 + (${state.calcLength} × ${r})) Ω`;

  return `
    <div class="screen">
      ${renderSettingsSubHeader('Resistance Calculator')}

      <div class="settings-section">
        <h2 class="h2">Earth Continuity Limit</h2>
        <p class="muted">For a Class I appliance, the earth continuity limit is (0.1 + R) Ω, where R is the resistance of the protective conductor in the supply cable. Values from IET Code of Practice Table V1.1.</p>

        <label class="label">CSA (cable cross-section)</label>
        <select class="input" id="calc-csa">${csaOptions}</select>

        <label class="label">Length</label>
        <select class="input" id="calc-length">${lengthOptions}</select>

        <div class="calc-result-card">
          <div class="calc-result-label">Earth limit</div>
          <div class="calc-result-value">${limitText}</div>
          <div class="calc-result-formula">${workings}</div>
        </div>
      </div>

      <div class="info-card" style="margin-top:20px">
        <p class="muted">High readings are often down to test procedure rather than the appliance — contact resistance on the plug, test-lead resistance not nulled, or fortuitous contact with unearthed metalwork. Clean the earth pin, null the leads, and use the high-current (hard) test where possible.</p>
      </div>
    </div>
  `;
}

function renderSettingsAbout() {
  return `
    <div class="screen">
      ${renderSettingsSubHeader('About')}
      <div class="info-card">
        <h2>PAT Test ${APP_VERSION}</h2>
        <p>A fast, offline-first portable appliance testing app for working PAT engineers. Built around speed of data entry — pass/fail decisions in two taps, no fighting the interface.</p>
        <p>Your data stays on your device. Nothing is uploaded, no account needed, no signal required once installed.</p>
        <h3>Status</h3>
        <p>The app is currently in active testing. Features and refinements ship regularly. If something breaks, behaves oddly, or you've got an idea for what's next, get in touch via the Contact page.</p>
        <h3>Privacy</h3>
        <p>All test records, settings, and saved descriptions live in your phone or browser's local storage. The app makes no network calls after the initial install. Backups are stored only where you choose to save them.</p>
      </div>

      <!-- v8: emergency reload — for the rare case where the app stops responding to
           taps. A reload clears any in-memory weirdness without losing data. -->
      <div class="info-card">
        <h3>If the app stops responding</h3>
        <p class="muted">If taps stop registering anywhere in the app, tap Reload below. Your sessions and settings are not affected — only the app itself reloads.</p>
        <button class="backup-action-btn" id="about-reload-btn" style="margin-top:8px">⟳ Reload app</button>
      </div>

      <!-- v8: rolling 3-version changelog. v17: rolled forward — V17 on top, V14 dropped. -->
      <div class="info-card">
        <h3>What's new</h3>

        <p><strong>V17</strong> · June 2026</p>
        <p class="muted">Every Pass, Fail and Copy now flashes the button you tapped, giving a clear visual confirmation — useful on newer iPhones where iOS has stopped apps like this one from using vibration. You can also turn on Sound feedback for a short tone on each action, with a different tone for pass, fail and copy (under Settings → Display, off by default). And there's a new option to record the time each item was logged: switch on Item timestamps under Settings → Display to show times in a session's overview and to add a Time column to CSV export. Both new options are off by default, so nothing changes unless you turn them on.</p>

        <p><strong>V16</strong> · June 2026</p>
        <p class="muted">New Multi Pick feature. Define your own lists of items — say a lead, adapter and monitor for a desk PC — and log the whole list as passes with a single tap, in the order you set, all on the current location. Build up to six of these under Settings → Multi Pick, name them however you like, and show or hide the entry-screen button with a toggle. It's off by default, since it's only worth it on certain jobs.</p>

        <p><strong>V15</strong> · June 2026</p>
        <p class="muted">The "not yet exported" line on the Sessions list is now a button — tap it to share every session that still needs exporting in one action. New filters sit beside Sort: narrow the list by export status (not exported, exported, or modified since export) and by locked or unlocked, with your choices remembered between visits. A calibration date that falls on today now reads "Due today" rather than "Due in 0 days". The on-screen scrollbar is now hidden while scrolling works exactly as before.</p>
      </div>

      <div class="info-card">
        <p class="muted">© 2026 Peter Birchley. All rights reserved.</p>
      </div>
    </div>
  `;
}

function renderSettingsContact() {
  return `
    <div class="screen">
      ${renderSettingsSubHeader('Contact')}
      <div class="info-card">
        <h2>Get in touch</h2>
        <p>Feedback, bug reports, and feature requests are all welcome. Tell us what you're testing, where the app slowed you down, and what would have made it faster.</p>

        <h3>Email</h3>
        <p class="muted">[contact email — to be added]</p>

        <h3>Web</h3>
        <p class="muted">[website — to be added]</p>

        <h3>Support hours</h3>
        <p class="muted">[support hours — to be added]</p>
      </div>
      <div class="info-card">
        <h3>What to include in a bug report</h3>
        <p>If something's gone wrong, the more of this you can include the better:</p>
        <p class="muted">• What you were trying to do<br>• What happened instead<br>• Your phone model and OS version<br>• The app version (currently ${APP_VERSION})<br>• Any error messages on screen</p>
      </div>
    </div>
  `;
}

// ---------- Event binding ----------
function bindEvents() {
  const $ = id => document.getElementById(id);

  // Update banner — present on every view if updateAvailable
  if ($('update-refresh')) $('update-refresh').onclick = () => applyUpdate();
  if ($('update-dismiss')) $('update-dismiss').onclick = () => dismissUpdateBanner();

  // Sessions screen
  if ($('settings-btn')) $('settings-btn').onclick = () => setView('settings');
  if ($('new-session-btn')) $('new-session-btn').onclick = () => {
    state.newForm.show = true;
    if (!state.newForm.engineer && state.engineer) state.newForm.engineer = state.engineer;
    render();
  };
  if ($('nf-cancel')) $('nf-cancel').onclick = () => { state.newForm.show = false; render(); };
  if ($('nf-submit')) $('nf-submit').onclick = () => {
    state.newForm.site = $('nf-site').value;
    state.newForm.engineer = $('nf-engineer').value;
    state.newForm.name = $('nf-name').value;
    state.newForm.prefix = $('nf-prefix').value;
    state.newForm.startNo = $('nf-start').value;
    createSession();
  };
  if ($('nf-site')) $('nf-site').oninput = e => state.newForm.site = e.target.value;
  if ($('nf-engineer')) $('nf-engineer').oninput = e => state.newForm.engineer = e.target.value;
  if ($('nf-name')) $('nf-name').oninput = e => state.newForm.name = e.target.value;
  if ($('nf-prefix')) $('nf-prefix').oninput = e => state.newForm.prefix = e.target.value;
  if ($('nf-start')) $('nf-start').oninput = e => state.newForm.startNo = e.target.value;

  if ($('sort-select')) $('sort-select').onchange = e => {
    state.sort = e.target.value;
    save();
    render();
  };

  // v10: Sessions list search — partial refresh on input so focus is preserved.
  // The sort-select inside #sessions-list-area gets rebuilt every keystroke
  // (the area is replaced wholesale), so its onchange handler is rebound in
  // bindSessionsListAreaEvents() below.
  if ($('sessions-search')) {
    $('sessions-search').oninput = e => {
      state.sessionsSearchQuery = e.target.value;
      refreshSessionsListAreaOnly();
    };
  }

  // v10: Import button — opens the (hidden) file picker, then handleImportFile
  // takes over once a file is chosen.
  if ($('import-session-btn')) $('import-session-btn').onclick = () => {
    const inp = $('import-session-file');
    if (inp) inp.click();
  };
  if ($('import-session-file')) $('import-session-file').onchange = e => {
    const file = e.target.files && e.target.files[0];
    handleImportFile(file);
    // Reset so picking the same file twice still triggers a change
    e.target.value = '';
  };

  // v10: Import conflict dialog — three actions stacked vertically.
  if ($('import-conflict-cancel')) $('import-conflict-cancel').onclick = () => cancelImportConflict();
  if ($('import-conflict-cancel2')) $('import-conflict-cancel2').onclick = () => cancelImportConflict();
  if ($('import-conflict-backdrop')) $('import-conflict-backdrop').onclick = () => cancelImportConflict();
  if ($('import-conflict-duplicate')) $('import-conflict-duplicate').onclick = () => {
    const pending = state.importDialog.pendingSession;
    const skipped = (state.importDialog.summary && state.importDialog.summary.skipped) || [];
    if (pending) commitImportedSession(pending, 'duplicate', skipped);
  };
  if ($('import-conflict-merge')) $('import-conflict-merge').onclick = () => {
    const pending = state.importDialog.pendingSession;
    const skipped = (state.importDialog.summary && state.importDialog.summary.skipped) || [];
    if (pending) commitImportedSession(pending, 'merge', skipped);
  };

  // v10: Import summary dialog — single Done button (and the × in the header).
  if ($('import-summary-done')) $('import-summary-done').onclick = () => closeImportSummary();
  if ($('import-summary-close')) $('import-summary-close').onclick = () => closeImportSummary();
  if ($('import-summary-backdrop')) $('import-summary-backdrop').onclick = () => closeImportSummary();

  // Sessions-list row events — extracted so refreshSessionsListAreaOnly() can
  // rebind without touching anything else.
  bindSessionsListAreaEvents();

  // Entry screen
  if ($('sessions-btn')) $('sessions-btn').onclick = () => setView('sessions');
  if ($('overview-btn')) $('overview-btn').onclick = () => setView('overview');
  if ($('f-asset')) $('f-asset').oninput = e => state.form.assetNo = e.target.value;

  if ($('f-location')) {
    // v10: location autocomplete. We keep the v6 focus-clears-the-field behaviour
    // (so the carry-forward location doesn't get in the way when you want to type
    // something different), and additionally feed state.locationSuggestions from
    // the current session's existing item locations on every keystroke.
    $('f-location').oninput = e => {
      state.form.location = e.target.value;
      state.locationSuggestions = computeLocationSuggestions(e.target.value);
      state.showLocationSuggestions = state.locationSuggestions.length > 0;
      renderLocationSuggestionsOnly();
    };
    $('f-location').onfocus = e => {
      e.target.dataset.original = e.target.value;
      e.target.value = '';
      // Field is now empty → no suggestions until the user types.
      state.locationSuggestions = [];
      state.showLocationSuggestions = false;
      renderLocationSuggestionsOnly();
    };
    $('f-location').onblur = e => {
      const v = e.target.value.trim();
      if (v === '') {
        const orig = e.target.dataset.original || '';
        e.target.value = orig;
        state.form.location = orig;
      } else {
        const cased = titleCase(v);
        e.target.value = cased;
        state.form.location = cased;
      }
      // Delay hiding so a click on a suggestion can register first.
      setTimeout(() => {
        state.showLocationSuggestions = false;
        renderLocationSuggestionsOnly();
      }, 150);
    };
  }

  if ($('f-type')) {
    $('f-type').oninput = e => {
      const val = e.target.value;
      state.form.itemType = val;
      document.querySelectorAll('.quick-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.type === val);
      });
      state.suggestions = computeSuggestions(val);
      state.showSuggestions = state.suggestions.length > 0;
      renderSuggestionsOnly();
    };
    $('f-type').onfocus = e => {
      if (e.target.value) {
        state.suggestions = computeSuggestions(e.target.value);
        state.showSuggestions = state.suggestions.length > 0;
        renderSuggestionsOnly();
      }
    };
    $('f-type').onblur = e => {
      const v = String(e.target.value || '').trim();
      if (v) {
        const cased = normaliseItemType(v);
        e.target.value = cased;
        state.form.itemType = cased;
      }
      setTimeout(() => { state.showSuggestions = false; renderSuggestionsOnly(); }, 150);
    };
  }

  document.querySelectorAll('.quick-btn').forEach(b => {
    b.onclick = () => {
      state.form.itemType = b.dataset.type;
      const inp = document.getElementById('f-type');
      if (inp) inp.value = b.dataset.type;
      document.querySelectorAll('.quick-btn').forEach(x => x.classList.toggle('active', x === b));
      state.showSuggestions = false;
      renderSuggestionsOnly();
    };
  });

  if ($('f-notes')) $('f-notes').oninput = e => state.form.notes = e.target.value;
  if ($('show-notes-btn')) $('show-notes-btn').onclick = () => { state.form.showNotes = true; render(); document.getElementById('f-notes')?.focus(); };

  if ($('pass-btn')) $('pass-btn').onclick = () => passClicked();
  if ($('fail-btn')) $('fail-btn').onclick = () => failClicked();
  if ($('copy-last-btn')) $('copy-last-btn').onclick = () => copyLastResult();
  if ($('prev-btn')) $('prev-btn').onclick = () => moveCursor(-1);
  if ($('next-btn')) $('next-btn').onclick = () => moveCursor(1);
  if ($('skip-new-btn')) $('skip-new-btn').onclick = () => skipToNew();
  if ($('del-item-btn')) $('del-item-btn').onclick = () => { if (confirm('Are you sure you want to delete this item?\n\nThis cannot be undone.')) deleteItem(state.cursor); };

  document.querySelectorAll('[data-reason]').forEach(el => {
    el.onclick = () => pickFailReason(el.dataset.reason);
  });
  if ($('fail-other-btn')) $('fail-other-btn').onclick = () => {
    state.failModalStage = 'other';
    render();
    document.getElementById('fail-other-input')?.focus();
  };
  if ($('fail-other-back')) $('fail-other-back').onclick = () => {
    state.failModalStage = 'reasons';
    state.failOtherText = '';
    render();
  };
  if ($('fail-other-input')) $('fail-other-input').oninput = e => state.failOtherText = e.target.value;
  if ($('fail-other-save')) $('fail-other-save').onclick = () => {
    const reason = state.failOtherText.trim();
    pickFailReason(reason || null);
  };
  if ($('fail-close')) $('fail-close').onclick = () => cancelFailModal();
  if ($('fail-backdrop')) $('fail-backdrop').onclick = () => cancelFailModal();

  // v16: Multi Pick — open the sheet, pick a slot, or dismiss.
  if ($('multipick-btn')) $('multipick-btn').onclick = () => {
    const sess = activeSession();
    if (sess && sess.locked) return;
    state.multiPickSheetOpen = true;
    render();
  };
  document.querySelectorAll('[data-mp-index]').forEach(el => {
    el.onclick = () => multiPickFire(parseInt(el.dataset.mpIndex, 10));
  });
  if ($('multipick-close')) $('multipick-close').onclick = () => {
    state.multiPickSheetOpen = false;
    render();
  };
  if ($('multipick-backdrop')) $('multipick-backdrop').onclick = () => {
    state.multiPickSheetOpen = false;
    render();
  };

  // Overview screen
  // Overview & Settings hub both use #back-btn — disambiguate by current view.
  // Settings hub is only reachable from sessions; Overview is only reachable from entry.
  if ($('back-btn')) $('back-btn').onclick = () => {
    if (state.view === 'overview') setView('entry');
    else if (state.view === 'settings') setView('sessions');
  };
  if ($('export-btn')) $('export-btn').onclick = () => { const s = activeSession(); if (s) shareOrDownloadCSV(s); };
  if ($('edit-session-btn')) $('edit-session-btn').onclick = () => startEditSession();
  if ($('select-mode-btn')) $('select-mode-btn').onclick = () => enterSelectionMode();
  if ($('cancel-selection-btn')) $('cancel-selection-btn').onclick = () => { exitSelectionMode(); render(); };
  if ($('select-all-visible-btn')) $('select-all-visible-btn').onclick = () => selectAllVisible();
  if ($('clear-selection-btn')) $('clear-selection-btn').onclick = () => clearSelection();

  // v11: Bulk-edit menu — selection bar button opens the menu sheet; the menu
  // options route to the four sub-flows (location reuses the v10 path).
  if ($('bulk-edit-menu-btn')) $('bulk-edit-menu-btn').onclick = () => openBulkEditMenu();
  if ($('bulk-menu-close')) $('bulk-menu-close').onclick = () => closeBulkEditMenu();
  if ($('bulk-menu-backdrop')) $('bulk-menu-backdrop').onclick = () => closeBulkEditMenu();
  document.querySelectorAll('[data-bulk-edit]').forEach(el => {
    el.onclick = () => {
      const mode = el.dataset.bulkEdit;
      if (mode === 'delete') {
        // Delete confirms inside applyBulkDelete() — no separate dialog.
        state.bulkEdit.menuOpen = false;
        applyBulkDelete();
      } else {
        openBulkEditDialog(mode);
      }
    };
  });

  // v10/v11: bulk Location dialog (reuses v10 IDs).
  if ($('bulk-cancel-btn')) $('bulk-cancel-btn').onclick = () => cancelBulkEditDialog();
  if ($('bulk-backdrop')) $('bulk-backdrop').onclick = () => cancelBulkEditDialog();
  if ($('bulk-location-input')) $('bulk-location-input').oninput = e => state.bulkLocationValue = e.target.value;
  if ($('bulk-apply-btn')) $('bulk-apply-btn').onclick = () => applyBulkLocation();

  // v11: bulk Type dialog. Quick-pick buttons fill the input; Apply commits.
  if ($('bulk-type-cancel')) $('bulk-type-cancel').onclick = () => cancelBulkEditDialog();
  if ($('bulk-type-backdrop')) $('bulk-type-backdrop').onclick = () => cancelBulkEditDialog();
  if ($('bulk-type-input')) $('bulk-type-input').oninput = e => state.bulkEdit.typeValue = e.target.value;
  if ($('bulk-type-apply')) $('bulk-type-apply').onclick = () => applyBulkType();
  document.querySelectorAll('[data-bulk-type-quick]').forEach(el => {
    el.onclick = () => {
      state.bulkEdit.typeValue = el.dataset.bulkTypeQuick;
      // Update the input value live without a full re-render to keep keyboard.
      const inp = document.getElementById('bulk-type-input');
      if (inp) inp.value = state.bulkEdit.typeValue;
    };
  });

  // v11: bulk Notes dialog. Mode radios + textarea; Apply commits.
  if ($('bulk-notes-cancel')) $('bulk-notes-cancel').onclick = () => cancelBulkEditDialog();
  if ($('bulk-notes-backdrop')) $('bulk-notes-backdrop').onclick = () => cancelBulkEditDialog();
  if ($('bulk-notes-input')) $('bulk-notes-input').oninput = e => state.bulkEdit.notesValue = e.target.value;
  if ($('bulk-notes-apply')) $('bulk-notes-apply').onclick = () => applyBulkNotes();
  document.querySelectorAll('input[name="bulk-notes-mode"]').forEach(el => {
    el.onchange = e => {
      state.bulkEdit.notesMode = e.target.value === 'append' ? 'append' : 'replace';
      // Update the placeholder live without a full re-render.
      const ta = document.getElementById('bulk-notes-input');
      if (ta) ta.placeholder = state.bulkEdit.notesMode === 'append'
        ? 'Text to append'
        : 'New notes (leave empty to clear)';
    };
  });

  if ($('overview-search')) $('overview-search').oninput = e => {
    state.searchQuery = e.target.value;
    refreshOverviewBody();
  };
  if ($('fails-only-toggle')) $('fails-only-toggle').onchange = e => {
    state.showFailsOnly = e.target.checked;
    refreshOverviewBody();
  };
  bindOverviewBodyEvents();

  // Edit-session screen
  if ($('cancel-edit-btn')) $('cancel-edit-btn').onclick = () => setView('overview');
  if ($('ef-cancel')) $('ef-cancel').onclick = () => setView('overview');
  if ($('ef-save')) $('ef-save').onclick = () => {
    state.editForm.site = $('ef-site').value;
    state.editForm.engineer = $('ef-engineer').value;
    state.editForm.name = $('ef-name').value;
    state.editForm.date = $('ef-date').value;
    state.editForm.prefix = $('ef-prefix').value;
    state.editForm.locked = $('ef-locked') ? $('ef-locked').checked : false;   // v8
    saveSessionEdits();
  };
  if ($('ef-site')) $('ef-site').oninput = e => state.editForm.site = e.target.value;
  if ($('ef-engineer')) $('ef-engineer').oninput = e => state.editForm.engineer = e.target.value;
  if ($('ef-name')) $('ef-name').oninput = e => state.editForm.name = e.target.value;
  if ($('ef-date')) $('ef-date').oninput = e => state.editForm.date = e.target.value;
  if ($('ef-prefix')) $('ef-prefix').oninput = e => state.editForm.prefix = e.target.value;
  if ($('ef-locked')) $('ef-locked').onchange = e => state.editForm.locked = e.target.checked;   // v8

  // v8: Lock banner unlock shortcut on entry screen
  if ($('lock-unlock-btn')) $('lock-unlock-btn').onclick = () => unlockActiveSession();

  // Settings hub — row taps
  document.querySelectorAll('[data-page]').forEach(el => {
    el.onclick = () => setView(el.dataset.page);
  });
  // Settings sub-pages — back button
  if ($('back-to-settings-btn')) $('back-to-settings-btn').onclick = () => setView('settings');

  // Settings sub-page save buttons
  if ($('settings-user-save')) $('settings-user-save').onclick = () => saveUserSettings();
  if ($('settings-items-save')) $('settings-items-save').onclick = () => saveItemTypesSettings();
  if ($('settings-fails-save')) $('settings-fails-save').onclick = () => saveFailReasonsSettings();
  if ($('settings-descriptions-save')) $('settings-descriptions-save').onclick = () => saveDescriptionsSettings();
  // v16: Multi Pick settings save.
  if ($('settings-multipick-save')) $('settings-multipick-save').onclick = () => saveMultiPickSettings();
  // v16: toggle's On/Off subtext updates live WITHOUT a re-render (a render here
  // would clobber any unsaved slot edits, like the CSV page). The actual value
  // is committed on Save, matching the other settings sub-pages.
  if ($('multipick-enabled')) $('multipick-enabled').onchange = e => {
    const sub = document.getElementById('multipick-enabled-sub');
    if (sub) sub.textContent = e.target.checked ? 'On' : 'Off';
  };

  // v9: Reset-to-defaults buttons
  if ($('settings-items-reset')) $('settings-items-reset').onclick = () => resetItemsToDefaults();
  if ($('settings-fails-reset')) $('settings-fails-reset').onclick = () => resetFailReasonsToDefaults();
  if ($('settings-descriptions-reset')) $('settings-descriptions-reset').onclick = () => resetDescriptionsToDefaults();

  // v9: preset switching, creation, rename, delete on the Quick Pick Items page.
  // Switching is via the dropdown — onchange because we want commit-on-blur,
  // not change-as-you-arrow (which would fire a render on every option).
  //
  // v10: confirm-on-switch guard. Previously the textarea was a pure draft
  // buffer — typing then switching presets silently discarded the edits. Now
  // we compare the textarea content against the active preset's stored items;
  // if it differs, we confirm. On cancel, the dropdown is reverted to the
  // current active preset. On confirm, the edits ARE still discarded — same as
  // before — but at least the user gave informed consent. Auto-save-on-switch
  // would be the alternative; we picked confirm because it matches the broader
  // "Save = commit" model used across every other settings sub-page.
  if ($('settings-preset-select')) $('settings-preset-select').onchange = e => {
    const newId = e.target.value;
    const currentP = activePreset();
    const ta = document.getElementById('settings-types');
    if (ta && currentP) {
      const storedItems = (currentP.items || []).join('\n');
      // Tolerate trailing whitespace differences (e.g. trailing newline from
      // the textarea) but otherwise demand exact match.
      const taValueNorm = ta.value.replace(/\s+$/, '');
      const storedNorm = storedItems.replace(/\s+$/, '');
      if (taValueNorm !== storedNorm) {
        const ok = confirm(
          `You have unsaved changes to "${currentP.name}".\n\n` +
          `Switch presets and discard the changes?`
        );
        if (!ok) {
          // Revert dropdown to the still-active preset.
          e.target.value = state.activePresetId;
          return;
        }
      }
    }
    switchPreset(newId);
  };
  if ($('preset-new-btn')) $('preset-new-btn').onclick = () => {
    state.presetDialog = { mode: 'new', name: '', editingId: null };
    render();
  };
  if ($('preset-rename-btn')) $('preset-rename-btn').onclick = () => {
    const p = activePreset();
    if (!p) return;
    state.presetDialog = { mode: 'rename', name: p.name, editingId: p.id };
    render();
  };
  if ($('preset-delete-btn')) $('preset-delete-btn').onclick = () => {
    const p = activePreset();
    if (!p) return;
    if (state.itemPresets.length <= 1) {
      alert('You must have at least one preset.');
      return;
    }
    if (!confirm(`Delete preset "${p.name}"?\n\nThe items in this preset will be lost. Other presets are not affected.`)) return;
    deletePreset(p.id);
    render();
  };
  if ($('preset-dialog-input')) $('preset-dialog-input').oninput = e => state.presetDialog.name = e.target.value;
  if ($('preset-dialog-cancel')) $('preset-dialog-cancel').onclick = () => {
    state.presetDialog = { mode: null, name: '', editingId: null };
    render();
  };
  if ($('preset-backdrop')) $('preset-backdrop').onclick = () => {
    state.presetDialog = { mode: null, name: '', editingId: null };
    render();
  };
  if ($('preset-dialog-confirm')) $('preset-dialog-confirm').onclick = () => {
    const name = (state.presetDialog.name || '').trim();
    if (!name) { alert('Name cannot be empty.'); return; }
    if (state.presetDialog.mode === 'new') {
      createPreset(name);
    } else if (state.presetDialog.mode === 'rename' && state.presetDialog.editingId) {
      renamePreset(state.presetDialog.editingId, name);
    }
    state.presetDialog = { mode: null, name: '', editingId: null };
    render();
  };

  // v9: first-launch migration prompt — names the user's existing item list.
  if ($('migration-prompt-input')) $('migration-prompt-input').oninput = e => state.migrationPrompt.name = e.target.value;
  if ($('migration-prompt-confirm')) $('migration-prompt-confirm').onclick = () => confirmMigrationPrompt();

  // Display settings — instant apply.
  // v8 hotfix: this used to be [data-theme] but applyTheme() ALSO sets data-theme
  // on <html>, so the selector matched <html> too. Every tap anywhere bubbled to
  // <html>, fired its onclick → setTheme → render → destroyed the tapped input
  // before iOS could focus it. Result: app-wide "taps do nothing" the moment a
  // user picked Light or Dark. Renamed the button attribute to data-set-theme to
  // remove the collision.
  document.querySelectorAll('[data-set-theme]').forEach(el => {
    el.onclick = () => setTheme(el.dataset.setTheme);
  });
  if ($('haptics-toggle')) $('haptics-toggle').onchange = e => {
    setHaptics(e.target.checked);
    // Re-render so the "On"/"Off" sub-text updates
    render();
  };
  // v17: sound + timestamps toggles. Both re-render to refresh their On/Off
  // sub-text, matching the haptics row.
  if ($('sound-toggle')) $('sound-toggle').onchange = e => {
    setSound(e.target.checked);
    render();
  };
  if ($('timestamps-toggle')) $('timestamps-toggle').onchange = e => {
    setTimestamps(e.target.checked);
    render();
  };

  // Backup & Restore
  if ($('backup-export-btn')) $('backup-export-btn').onclick = () => downloadBackup();
  // v14: prune controls on the Backup & Restore page.
  if ($('prune-review-btn')) $('prune-review-btn').onclick = () => pruneOldSessions();
  if ($('prune-age-save')) $('prune-age-save').onclick = () => savePruneAge();
  if ($('backup-import-btn')) $('backup-import-btn').onclick = () => $('backup-import-file').click();
  if ($('backup-import-file')) $('backup-import-file').onchange = e => {
    const file = e.target.files && e.target.files[0];
    restoreBackupFromFile(file);
    // Reset so picking the same file twice still triggers
    e.target.value = '';
  };

  // v8: Resistance calculator — re-render the page on change so the result and
  // formula text update. The dropdowns themselves don't lose focus on iOS because
  // the user has already committed their selection by the time onchange fires.
  if ($('calc-csa')) $('calc-csa').onchange = e => {
    state.calcCsa = e.target.value;
    render();
  };
  if ($('calc-length')) $('calc-length').onchange = e => {
    state.calcLength = Number(e.target.value);
    render();
  };

  // v8: emergency reload button on About — recovery for the rare "taps do nothing"
  // bug without needing to reinstall the PWA. localStorage data is untouched.
  if ($('about-reload-btn')) $('about-reload-btn').onclick = () => {
    if (confirm('Reload the app? Your data is safe — only the app itself reloads.')) {
      window.location.reload();
    }
  };

  // ===== v11 bindings =====

  // Backup reminder banner — Sessions list only. "Export now" runs the same
  // downloadBackup() the Backup & Restore page does (which also stamps
  // lastBackupAt and clears the snooze). "Remind me later" and × both snooze
  // for 24h.
  if ($('backup-banner-export')) $('backup-banner-export').onclick = () => {
    downloadBackup();
    render();
  };
  if ($('backup-banner-later')) $('backup-banner-later').onclick = () => {
    snoozeBackupReminder();
    render();
  };
  if ($('backup-banner-dismiss')) $('backup-banner-dismiss').onclick = () => {
    snoozeBackupReminder();
    render();
  };

  // v17 welcome modal — Continue button dismisses and stamps the flag.
  if ($('v17-welcome-dismiss')) $('v17-welcome-dismiss').onclick = () => dismissV17Welcome();

  // v14: reopen-warning modal buttons.
  if ($('reopen-warn-continue')) $('reopen-warn-continue').onclick = () => confirmReopenWarning();
  if ($('reopen-warn-cancel')) $('reopen-warn-cancel').onclick = () => cancelReopenWarning();
  if ($('reopen-warn-cancel2')) $('reopen-warn-cancel2').onclick = () => cancelReopenWarning();

  // CSV Columns settings page
  if ($('settings-csv-save')) $('settings-csv-save').onclick = () => saveCsvColumnsSettings();
  if ($('settings-csv-reset')) $('settings-csv-reset').onclick = () => resetCsvColumnsSettings();
  document.querySelectorAll('[data-csv-up]').forEach(el => {
    el.onclick = () => moveCsvColumn(el.dataset.csvUp, -1);
  });
  document.querySelectorAll('[data-csv-down]').forEach(el => {
    el.onclick = () => moveCsvColumn(el.dataset.csvDown, +1);
  });
}

// Light re-render of just the suggestions dropdown so we don't lose input focus
function renderSuggestionsOnly() {
  const wrap = document.querySelector('.custom-type-wrap');
  if (!wrap) return;
  const existing = wrap.querySelector('.suggestions');
  if (existing) existing.remove();
  if (state.showSuggestions && state.suggestions.length > 0) {
    const div = document.createElement('div');
    div.className = 'suggestions';
    div.innerHTML = state.suggestions.map(s => `<button class="suggestion-item" data-suggest="${escapeHTML(s)}">${escapeHTML(s)}</button>`).join('');
    wrap.appendChild(div);
    div.querySelectorAll('[data-suggest]').forEach(el => {
      el.onmousedown = (e) => { e.preventDefault(); };
      el.onclick = () => {
        state.form.itemType = el.dataset.suggest;
        const inp = document.getElementById('f-type');
        if (inp) inp.value = el.dataset.suggest;
        state.showSuggestions = false;
        renderSuggestionsOnly();
      };
    });
  }
}

// v10: Same partial-refresh trick for the location autofill. Lives inside
// .location-input-wrap rather than .custom-type-wrap. Tapping a suggestion
// fills the field, normalises casing the same way blur would, and immediately
// clears the suggestions.
function renderLocationSuggestionsOnly() {
  const wrap = document.querySelector('.location-input-wrap');
  if (!wrap) return;
  const existing = wrap.querySelector('.suggestions');
  if (existing) existing.remove();
  if (state.showLocationSuggestions && state.locationSuggestions.length > 0) {
    const div = document.createElement('div');
    div.className = 'suggestions';
    div.id = 'location-suggestions';
    div.innerHTML = state.locationSuggestions.map(s => `<button class="suggestion-item" data-loc-suggest="${escapeHTML(s)}">${escapeHTML(s)}</button>`).join('');
    wrap.appendChild(div);
    div.querySelectorAll('[data-loc-suggest]').forEach(el => {
      // preventDefault on mousedown so the blur on the input doesn't fire
      // before the click handler — without this, blur restores the original
      // value and the click never lands.
      el.onmousedown = (e) => { e.preventDefault(); };
      el.onclick = () => {
        const picked = el.dataset.locSuggest;
        state.form.location = picked;
        const inp = document.getElementById('f-location');
        if (inp) {
          inp.value = picked;
          // Clear the focus-restore stash so blur doesn't undo our pick.
          inp.dataset.original = picked;
        }
        state.showLocationSuggestions = false;
        state.locationSuggestions = [];
        renderLocationSuggestionsOnly();
      };
    });
  }
}

// ---------- Boot ----------
load();
applyTheme(state.theme);
// v16.1: boot-level safety net. A throw inside render() (e.g. a screen-specific
// bug like the v16 entry-screen TDZ error) used to leave #app permanently
// blank — and because the service worker serves the cached build, a plain
// reload didn't clear it. Now, if the initial render fails, we drop the
// active-session pointer and fall back to the Sessions list; if even that
// fails, we show a minimal reload prompt. The app can no longer get stuck on a
// blank screen, whatever future bug might slip through.
try {
  loadFormForCursor();
  render();
} catch (e) {
  console.error('Initial render failed; falling back to Sessions list.', e);
  try {
    state.activeId = null;
    state.view = 'sessions';
    state.multiPickSheetOpen = false;
    state.failModalOpen = false;
    render();
  } catch (e2) {
    console.error('Sessions fallback also failed.', e2);
    const appEl = document.getElementById('app');
    if (appEl) {
      appEl.innerHTML =
        '<div style="padding:24px;font-family:system-ui,-apple-system,sans-serif;color:#111;line-height:1.5">' +
        '<h2 style="margin:0 0 8px">Something went wrong</h2>' +
        '<p style="margin:0 0 16px">The app hit an error while loading. Your saved data is safe. Tap Reload to try again.</p>' +
        '<button onclick="location.reload()" style="padding:12px 18px;font-size:16px;font-weight:700;background:#2563eb;color:#fff;border:none;border-radius:10px">Reload</button>' +
        '</div>';
    }
  }
}
registerServiceWorker();
