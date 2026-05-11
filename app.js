/*!
 * PAT Test PWA
 * v10 (May 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PAT Test PWA — v10 ==============
// Storage uses localStorage — works fully offline, persists across launches.

const APP_VERSION = 'V10';

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
  }
};

// ---------- Persistence ----------
function load() {
  try {
    state.sessions = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { state.sessions = []; }
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
    state.view = 'entry';
    const sess = activeSession();
    state.cursor = sess.items.length;
  } else {
    state.activeId = null;
    state.view = 'sessions';
    state.newForm.show = state.sessions.length === 0;
  }

  // Default engineer for any new-session form shown
  if (!state.newForm.engineer && state.engineer) {
    state.newForm.engineer = state.engineer;
  }
}

function computeHistoryFromItems() {
  const set = new Set();
  state.sessions.forEach(s => s.items.forEach(it => {
    if (it.itemType) set.add(it.itemType);
  }));
  return Array.from(set);
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.sessions));
  localStorage.setItem(ACTIVE_KEY, state.activeId || '');
  // v9: legacy ITEMS_KEY no longer written; ITEM_PRESETS_KEY + ACTIVE_PRESET_KEY are
  // the source of truth. Backup/restore still uses the same logic.
  localStorage.setItem(ITEM_PRESETS_KEY, JSON.stringify(state.itemPresets));
  localStorage.setItem(ACTIVE_PRESET_KEY, state.activePresetId || '');
  localStorage.setItem(FAIL_REASONS_KEY, JSON.stringify(state.failReasons));
  localStorage.setItem(ENGINEER_KEY, state.engineer);
  localStorage.setItem(DESCRIPTIONS_KEY, JSON.stringify(state.descriptions));
  localStorage.setItem(SORT_KEY, state.sort);
  localStorage.setItem(THEME_KEY, state.theme);
  localStorage.setItem(HAPTICS_KEY, state.hapticsEnabled ? '1' : '0');
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
  return [...starts, ...contains].slice(0, 5);
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
  return arr;
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

// ---------- Haptics ----------
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

function haptic(count) {
  if (!state.hapticsEnabled) return;        // v7: respect user setting
  if (navigator.vibrate) {
    if (count === 1) navigator.vibrate(50);
    else if (count === 2) navigator.vibrate([50, 70, 50]);
    else if (count === 3) navigator.vibrate([50, 70, 50, 70, 50]);
    return;
  }
  _hapticOnce();
  if (count >= 2) setTimeout(_hapticOnce, 120);
  if (count >= 3) setTimeout(_hapticOnce, 240);
}

// ---------- CSV ----------
function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function buildCSV(session) {
  const header = ['Asset ID', 'Engineer name', 'Description', 'Site', 'Location', 'Date', 'Result', 'Notes'];
  const rows = session.items.map(it => [
    it.assetNo,
    session.engineer || '',
    it.itemType,
    session.site,
    it.location,
    formatDate(session.date),
    capitalise(it.result || ''),
    it.notes
  ].map(csvEscape).join(','));
  return [header.join(','), ...rows].join('\n');
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
        return;
      }
    } catch (err) {
      // User dismissed the share sheet — respect that, no download.
      if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) return;
      // Anything else (e.g. partial support, permission glitch) → fall through to download.
    }
  }
  downloadCSV(session);
}

// ---------- v10: CSV Import ----------
// Strict format only — must match this app's export exactly:
//   Header line: Asset ID,Engineer name,Description,Site,Location,Date,Result,Notes
//   All rows must share the same Site AND Date (single session per file).
// Anything that doesn't match is rejected with a clear message.
//
// Multi-session CSVs (someone manually concatenated two exports) are refused
// for v10 — see PAThandoff_v10.md "v10 flags" for future work.

const EXPECTED_CSV_HEADER = ['Asset ID', 'Engineer name', 'Description', 'Site', 'Location', 'Date', 'Result', 'Notes'];

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
function parseImportCSV(text) {
  const rows = parseCSV(text);
  if (!rows || rows.length === 0) {
    return { ok: false, error: 'The CSV file is empty.' };
  }
  // Header check — must match exactly, in order
  const header = rows[0].map(h => String(h || '').trim());
  if (header.length !== EXPECTED_CSV_HEADER.length
      || header.some((h, i) => h !== EXPECTED_CSV_HEADER[i])) {
    return {
      ok: false,
      error:
        'This file doesn\'t match the expected format.\n\n' +
        'Imports must be CSVs exported from this app, with columns in the order:\n' +
        EXPECTED_CSV_HEADER.join(', ')
    };
  }
  const dataRows = rows.slice(1);
  if (dataRows.length === 0) {
    return { ok: false, error: 'The CSV file has a header but no rows.' };
  }
  // First-pass scan: find canonical Site + Date. We grab them from the first
  // VALID row (with a parseable date) so a single typo on row 1 doesn't reject
  // the whole file. If no row has both, we bail.
  let canonicalSite = null;
  let canonicalIsoDate = null;
  let canonicalDateRaw = null;
  let canonicalEngineer = '';
  for (const r of dataRows) {
    const site = String(r[3] || '').trim();
    const dateRaw = String(r[5] || '').trim();
    const iso = parseUkDateToIso(dateRaw);
    if (site && iso) {
      canonicalSite = site;
      canonicalIsoDate = iso;
      canonicalDateRaw = dateRaw;
      canonicalEngineer = String(r[1] || '').trim();
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
    const site = String(r[3] || '').trim();
    const dateRaw = String(r[5] || '').trim();
    // Skip rows with no site or no date — they'll be flagged as skipped below.
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
  // Build items + collect skipped row reports
  const items = [];
  const skipped = [];
  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    const rowNum = i + 2; // +1 for header, +1 because humans count from 1
    const assetNo = String(r[0] || '').trim();
    const desc = String(r[2] || '').trim();
    const location = String(r[4] || '').trim();
    const dateRaw = String(r[5] || '').trim();
    const resultRaw = String(r[6] || '').trim().toLowerCase();
    const notes = String(r[7] || '').trim();
    // Skip a row if any of these are wrong; collect reason for the summary.
    if (!assetNo) { skipped.push({ row: rowNum, reason: 'missing Asset ID' }); continue; }
    if (!desc)    { skipped.push({ row: rowNum, reason: 'missing Description' }); continue; }
    if (!dateRaw) { skipped.push({ row: rowNum, reason: 'missing Date' }); continue; }
    if (parseUkDateToIso(dateRaw) === null) {
      skipped.push({ row: rowNum, reason: 'invalid Date format (expected DD/MM/YYYY)' });
      continue;
    }
    if (resultRaw !== 'pass' && resultRaw !== 'fail') {
      skipped.push({ row: rowNum, reason: `invalid Result "${String(r[6] || '').trim()}" (expected Pass or Fail)` });
      continue;
    }
    items.push({
      id: uid(),
      assetNo,
      location,
      itemType: desc,
      notes,
      result: resultRaw
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
function buildBackup() {
  return {
    appVersion: APP_VERSION,
    backupVersion: 2,                         // v9 bumped from 1 → 2
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
    hapticsEnabled: state.hapticsEnabled
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
    state.activeId = null;
    state.view = 'sessions';
    state.cursor = 0;
    state.newForm.show = false;
    save();
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
}

// ---------- Validation ----------
function validateBeforeSave(opts = {}) {
  const sess = activeSession();
  if (!sess) return 'No active session.';
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
  state.view = 'entry';
  state.showFailsOnly = false;
  state.searchQuery = '';
  // Don't clear sessionsSearchQuery — keeps the search alive for when the user
  // navigates back to the sessions list.
  exitSelectionMode();
  loadFormForCursor();
  save(); render();
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
    sess.items[state.cursor] = { ...sess.items[state.cursor], ...item };
  } else {
    sess.items.push({ id: uid(), ...item });
  }
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
  haptic(1);
  saveItem('pass');
}

function failClicked() {
  const sess = activeSession();
  if (sess && sess.locked) return;
  const err = validateBeforeSave();
  if (err) { alert(err); return; }
  haptic(3);
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
  haptic(3);
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
  haptic(2);
  const last = sess.items[sess.items.length - 1];
  const item = {
    assetNo: state.form.assetNo.trim() || nextAssetNo(sess),
    location: normaliseLocation(state.form.location),
    itemType: last.itemType,
    notes: '',
    result: last.result
  };
  if (state.cursor < sess.items.length) {
    sess.items[state.cursor] = { ...sess.items[state.cursor], ...item };
  } else {
    sess.items.push({ id: uid(), ...item });
  }
  state.cursor++;
  loadFormForCursor();
  save(); render();
}

function deleteItem(idx) {
  const sess = activeSession();
  if (!sess) return;
  sess.items.splice(idx, 1);
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
  state.bulkLocationDialogOpen = false;
  state.bulkLocationValue = '';
  // Search and selection are overview-local; clear when leaving overview.
  if (v !== 'overview') {
    state.searchQuery = '';
    exitSelectionMode();
  }
  state.view = v;
  render();
}

// ---------- Bulk-edit (v7) ----------
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
  exitSelectionMode();
  save();
  render();
  // Brief confirmation — not blocking.
  setTimeout(() => alert(`Updated location on ${count} item${count === 1 ? '' : 's'}.`), 50);
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
  save();
  setView('settings');
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
  else if (v === 'settingsDescriptions') html = renderSettingsDescriptions();
  else if (v === 'settingsDisplay') html = renderSettingsDisplay();
  else if (v === 'settingsBackup') html = renderSettingsBackup();
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

  app.innerHTML = banner + html + migrationModal;
  // Toggle body class for selection bar spacing
  if (state.view === 'overview' && state.selectionMode) {
    document.body.classList.add('has-selection-bar');
  } else {
    document.body.classList.remove('has-selection-bar');
  }
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

  return `
    <div class="screen">
      <header class="header">
        <h1 class="h1">PAT Sessions</h1>
        <button class="icon-btn" id="settings-btn" aria-label="Settings">⚙</button>
      </header>
      ${newForm}
      ${searchRow}
      ${sessionsListArea}
      ${importConflict}
      ${importSummary}
    </div>
  `;
}

// v10: The dynamic portion of the Sessions screen — count + sort + list. Built
// as a separate function so we can refresh just this region on every keystroke
// in the search input without re-rendering the input itself (which would lose
// focus + keyboard on iOS).
function renderSessionsListAreaHTML() {
  const sortedAll = sortedSessions();
  const filtered = filteredSessions(sortedAll, state.sessionsSearchQuery);
  const queryTrimmed = state.sessionsSearchQuery.trim();

  const countHTML = queryTrimmed
    ? `<span class="sessions-search-count">${filtered.length} of ${sortedAll.length} session${sortedAll.length === 1 ? '' : 's'} match</span>`
    : '';

  // Sort control: only show when there's >1 session AND no active search filter
  // (the search-result subtitle becomes the more useful contextual cue).
  const sortControl = sortedAll.length > 1 && !queryTrimmed ? `
    <div class="sort-row">
      <span class="sort-label">Sort by</span>
      <select id="sort-select" class="sort-select">
        <option value="date_desc"${state.sort === 'date_desc' ? ' selected' : ''}>Date (newest)</option>
        <option value="date_asc"${state.sort === 'date_asc' ? ' selected' : ''}>Date (oldest)</option>
        <option value="name_asc"${state.sort === 'name_asc' ? ' selected' : ''}>Name (A–Z)</option>
        <option value="name_desc"${state.sort === 'name_desc' ? ' selected' : ''}>Name (Z–A)</option>
      </select>
    </div>
  ` : '';

  let list;
  if (sortedAll.length === 0 && !state.newForm.show) {
    list = `<p class="muted">No sessions yet. Create one to start testing.</p>`;
  } else if (queryTrimmed && filtered.length === 0) {
    list = `<p class="muted">No sessions or items match "${escapeHTML(queryTrimmed)}".</p>`;
  } else {
    list = filtered.map(({ session: s, matchedItemIndex, itemMatchCount }) => {
      const passes = s.items.filter(i => i.result === 'pass').length;
      const fails = s.items.filter(i => i.result === 'fail').length;
      // v8: subtle 🔒 prefix on locked sessions so they're easy to spot in the list.
      const lockMark = s.locked ? '<span class="session-lock" title="Locked">🔒</span>' : '';
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
            ${itemBadge}
          </div>
          <button class="icon-btn-sm" data-export="${s.id}" aria-label="Share CSV">${SHARE_ICON_SVG}</button>
          <button class="icon-btn-sm" data-delete-session="${s.id}" aria-label="Delete">🗑</button>
        </div>
      `;
    }).join('');
  }

  return `${countHTML}${sortControl}<div>${list}</div>`;
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
    <div class="progress-row">
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

      ${failModal}
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
          return `
            <tr class="${rowClass}" ${rowAttr}>
              ${checkCol}
              <td class="td">${escapeHTML(it.assetNo)}</td>
              <td class="td">${escapeHTML(it.location)}</td>
              <td class="td">${escapeHTML(it.itemType)}</td>
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

  const selectionBar = state.selectionMode ? `
    <div class="selection-bar">
      <span class="selection-bar-count">${state.selectedIndices.length} selected</span>
      <button class="selection-bar-action" id="bulk-edit-loc-btn" ${state.selectedIndices.length === 0 ? 'disabled' : ''}>Change location</button>
    </div>
  ` : '';

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

  const stats = `<div class="progress">${sess.items.length} items · <span class="pass-text">${passes} pass</span> · <span class="fail-text">${fails} fail</span>${sess.engineer ? ' · ' + escapeHTML(sess.engineer) : ''}</div>`;

  return `
    <div class="screen">
      ${header}
      ${stats}
      ${state.selectionMode ? '' : filterRow}
      ${selectAllRow}
      <div class="overview-body">${renderOverviewBodyHTML(sess)}</div>
      ${selectionBar}
      ${bulkDialog}
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
    el.onclick = (e) => { e.stopPropagation(); if (confirm('Delete this item?')) deleteItem(parseInt(el.dataset.delItem, 10)); };
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
  document.querySelectorAll('[data-open]').forEach(el => {
    el.onclick = () => {
      const id = el.dataset.open;
      // v10: if the card was rendered with data-open-at (search-mode item-level
      // match), jump straight to that item rather than the default "new entry"
      // position at end-of-list.
      if (el.dataset.openAt !== undefined && el.dataset.openAt !== '') {
        const idx = parseInt(el.dataset.openAt, 10);
        openSession(id, { cursor: idx });
      } else {
        openSession(id);
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
  const descSummary = state.descriptions.length === 1 ? '1 description' : `${state.descriptions.length} descriptions`;
  const themeSummary = state.theme === 'system' ? 'System' : (state.theme === 'dark' ? 'Dark' : 'Light');
  const hapticsSummary = state.hapticsEnabled ? 'Haptics on' : 'Haptics off';
  const displaySummary = `${themeSummary} · ${hapticsSummary}`;

  const rows = [
    { id: 'settingsUser', icon: '👤', title: 'User Settings', sub: state.engineer ? state.engineer : 'Engineer name' },
    { id: 'settingsItems', icon: '⚡', title: 'Quick Pick Items', sub: itemSummary },
    { id: 'settingsFails', icon: '⚠️', title: 'Quick Pick Fail', sub: failSummary },
    { id: 'settingsDescriptions', icon: '📝', title: 'Item Description List', sub: descSummary },
    { id: 'settingsDisplay', icon: '🎨', title: 'Display Settings', sub: displaySummary },
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
  return `
    <div class="screen">
      ${renderSettingsSubHeader('User Settings')}
      <div class="settings-section">
        <h2 class="h2">Engineer name</h2>
        <p class="muted">Used as the default for new sessions and shown on exported CSVs.</p>
        <input class="input" id="settings-engineer" value="${escapeHTML(state.engineer)}" placeholder="Your name">
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
    </div>
  `;
}

function renderSettingsBackup() {
  const stats = getStorageStats();
  const barClass = stats.pct >= 90 ? 'danger' : (stats.pct >= 70 ? 'warn' : '');
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
        </div>
      </div>
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

      <!-- v8: rolling 3-version changelog. v10: rolled forward — V10 on top, V7 dropped. -->
      <div class="info-card">
        <h3>What's new</h3>

        <p><strong>V10</strong> · May 2026</p>
        <p class="muted">Import sessions from a CSV file sent by another engineer. Share button on session export now opens the native share sheet (Messages, Mail, AirDrop, WhatsApp) instead of saving straight to Files. Search bar on the Sessions list matches site, engineer, date and items within each session — tap a result to jump straight to the matching item. Location field now autofills from other locations used in the same session. Confirm prompt before discarding unsaved changes when switching Quick Pick presets.</p>

        <p><strong>V9</strong> · May 2026</p>
        <p class="muted">Quick Pick presets — save multiple named lists and switch between them on the Quick Pick Items page. Reset-to-defaults buttons on Items, Fails, and Item Description List pages. Updated built-in defaults to reflect real PAT work. Haptic feedback on fail-reason taps and the Other Save button. Backup/restore extended to include presets.</p>

        <p><strong>V8</strong> · May 2026</p>
        <p class="muted">Lock-session toggle to prevent accidental new entries (with overview-edit override). Working earth continuity calculator under Settings. Date field on Edit Session sized to match other fields. Fix for the "taps do nothing" bug after switching theme to Light or Dark.</p>
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
  if ($('del-item-btn')) $('del-item-btn').onclick = () => { if (confirm('Delete this item?')) deleteItem(state.cursor); };

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
  if ($('bulk-edit-loc-btn')) $('bulk-edit-loc-btn').onclick = () => openBulkLocationDialog();
  if ($('bulk-cancel-btn')) $('bulk-cancel-btn').onclick = () => { state.bulkLocationDialogOpen = false; render(); };
  if ($('bulk-backdrop')) $('bulk-backdrop').onclick = () => { state.bulkLocationDialogOpen = false; render(); };
  if ($('bulk-location-input')) $('bulk-location-input').oninput = e => state.bulkLocationValue = e.target.value;
  if ($('bulk-apply-btn')) $('bulk-apply-btn').onclick = () => applyBulkLocation();

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

  // Backup & Restore
  if ($('backup-export-btn')) $('backup-export-btn').onclick = () => downloadBackup();
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
loadFormForCursor();
render();
registerServiceWorker();
