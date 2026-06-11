/*!
 * PAT Test PWA
 * v23 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PAT Test PWA — v23 — Smart Quick Pick ==============
// Smart Quick Pick (v18): history, scoring, ordering, freeze cache, on/off.

// ---------- v18: Smart Quick Pick helpers ----------
// The learned model is a plain object: { normalisedLocation: { itemType: count } }.
// "normalised" here means lowercased + whitespace-collapsed (NOT title-cased) so
// "Server Room", "server  room" and "SERVER ROOM" all map to one bucket. Matching
// a typed location against the buckets is substring-based (Q3 = option b): the
// row reorders when the current location contains, or is contained by, a learned
// bucket key. The frequency tally drives the order; ties keep the preset order.

// Lowercase + collapse internal/edge whitespace. Empty/garbage → ''.
function normaliseSqpLocation(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Validate an arbitrary value (from localStorage or a restored backup) into a
// safe history object. Anything unexpected collapses to {}. Keys must be
// non-empty normalised strings; each value must be a { type: positive-int } map.
function normaliseSqpHistory(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  Object.keys(raw).forEach(locKey => {
    const loc = normaliseSqpLocation(locKey);
    if (!loc) return;
    const tally = raw[locKey];
    if (!tally || typeof tally !== 'object') return;
    const bucket = out[loc] || (out[loc] = {});
    Object.keys(tally).forEach(typeRaw => {
      const type = String(typeRaw || '').trim();
      const n = parseInt(tally[typeRaw], 10);
      if (type && Number.isFinite(n) && n > 0) {
        bucket[type] = (bucket[type] || 0) + n;   // sum on key-collision after normalise
      }
    });
    if (!Object.keys(bucket).length) delete out[loc];
  });
  return out;
}

function loadSqpHistory() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(SQP_HISTORY_KEY) || 'null'); } catch {}
  bumpSqpHistoryVersion();   // v23 (E6): a fresh load/restore replaces the history
  return normaliseSqpHistory(raw);
}

// Record one (location, itemType) pairing into the learned history. Called at
// the point an item is FIRST logged (saveItem append, copyLastResult append, and
// each item in multiPickFire). No-op when the feature is off, or when either
// field is blank. Does NOT call save() itself — the caller's existing save()
// persists state.sqpHistory alongside everything else.
function recordSqpUsage(location, itemType) {
  if (!state.sqpEnabled) return;
  const loc = normaliseSqpLocation(location);
  const type = String(itemType || '').trim();
  if (!loc || !type) return;
  const bucket = state.sqpHistory[loc] || (state.sqpHistory[loc] = {});
  bucket[type] = (bucket[type] || 0) + 1;
  bumpSqpHistoryVersion();   // v23 (E6): invalidate the scores memo
}

// Build (or rebuild) the entire history map from every item already in storage.
// Used to seed the model the first time the feature is enabled — so it's useful
// immediately on an existing database rather than starting empty — and by the
// "Rebuild from my data" button. Returns a fresh map; does not mutate state.
function buildSqpHistory() {
  const out = {};
  state.sessions.forEach(s => (s.items || []).forEach(it => {
    const loc = normaliseSqpLocation(it.location);
    const type = String(it.itemType || '').trim();
    if (!loc || !type) return;
    const bucket = out[loc] || (out[loc] = {});
    bucket[type] = (bucket[type] || 0) + 1;
  }));
  return out;
}

// Aggregate the learned tallies for a given typed location into a single
// { itemType: score } map. A learned bucket contributes when its key and the
// typed location have a substring relationship in EITHER direction (so typing
// "Server Room 2" matches a learned "server room", and typing "server" matches
// "server room a"). Scores from all matching buckets are summed. Returns {} when
// the location is blank or nothing matches (→ caller leaves the order untouched).
// v23 (E6): sqpScoresForLocation walks the ENTIRE learned history on every call.
// Post-v20 the freeze means it runs only when the location changes (not per
// render), so it's already cheap — but it's still an O(locations × types) sweep,
// and prev/next stepping through items at different locations can call it
// repeatedly. We add a tiny one-entry memo keyed on the normalised location plus
// a history "version" counter. The counter (_sqpHistoryVersion) is bumped by
// every function that mutates state.sqpHistory (record / build / clear / rebuild
// / restore), so the memo can never return scores computed from stale history.
let _sqpScoresMemo = { loc: null, version: -1, scores: null };
let _sqpHistoryVersion = 0;
function bumpSqpHistoryVersion() { _sqpHistoryVersion++; }

function sqpScoresForLocation(location) {
  const loc = normaliseSqpLocation(location);
  if (!loc) return {};
  if (_sqpScoresMemo.loc === loc && _sqpScoresMemo.version === _sqpHistoryVersion) {
    return _sqpScoresMemo.scores;
  }
  const scores = {};
  Object.keys(state.sqpHistory).forEach(key => {
    if (loc.includes(key) || key.includes(loc)) {
      const tally = state.sqpHistory[key];
      Object.keys(tally).forEach(type => {
        scores[type] = (scores[type] || 0) + tally[type];
      });
    }
  });
  _sqpScoresMemo = { loc, version: _sqpHistoryVersion, scores };
  return scores;
}

// v20: compose the quick-pick row with POSITIONAL stability. This replaces the
// v18.1 "learned-first" ordering, which moved matched preset buttons to the
// front and reshuffled the whole row. The new rule (Peter's request):
//
//   • Preset buttons NEVER move from their preset position. The row starts as a
//     verbatim copy of the preset.
//   • A learned type that is ALSO in the preset simply stays where it is — its
//     learned-ness costs nothing positionally; it's just one of the buttons you
//     already have, in its usual spot.
//   • A learned type NOT in the preset is "swapped in": it takes the slot of the
//     preset button with the LOWEST learned score at this location (Q3b). Preset
//     buttons you've never tested here (score 0) are displaced first; among
//     equal scores, the RIGHTMOST slot goes first so the front of the row is the
//     stickiest. Highest-scoring swap-ins claim slots first.
//   • Row size is unchanged (the preset's button count). The number of swap-ins
//     can't exceed the number of preset buttons.
//
// Result: the buttons that are always there stay put; only genuinely
// location-specific extras appear, and only by displacing the least-relevant
// preset button for this location. Returns the preset unchanged when the
// feature is off, the location is blank, or nothing was learned here.
function smartOrderedItemTypes(types, location) {
  if (!state.sqpEnabled) return types;
  const scores = sqpScoresForLocation(location);
  const learnedKeys = Object.keys(scores);
  if (!learnedKeys.length) return types;

  // Work on a copy of the preset, positions intact.
  const row = types.slice();
  const presetLower = new Set(row.map(t => t.toLowerCase()));

  // Swap-in candidates: learned types that are NOT in the preset, highest score
  // first. Object key order preserves first-seen order as a stable tiebreaker.
  const swapIns = learnedKeys
    .filter(t => !presetLower.has(t.toLowerCase()))
    .map((t, i) => ({ t, i, score: scores[t] }))
    .sort((a, b) => (b.score - a.score) || (a.i - b.i))
    .map(x => x.t);

  if (!swapIns.length) return row;   // nothing new to bring in → preset as-is

  // Rank preset slots by how displaceable they are. A slot's "defence" is the
  // learned score of its occupant at this location (0 if never tested here).
  // Lowest defence is displaced first; on a tie, the higher index (further
  // right) goes first so the front of the row stays put.
  const slots = row.map((t, idx) => ({
    idx,
    defence: scores[t] || 0
  })).sort((a, b) => (a.defence - b.defence) || (b.idx - a.idx));

  // Place each swap-in into the next most-displaceable slot.
  const n = Math.min(swapIns.length, slots.length);
  for (let k = 0; k < n; k++) {
    row[slots[k].idx] = swapIns[k];
  }
  return row;
}

// v20: temporal freeze. The composed row is cached against the normalised
// location it was built for. While the location is unchanged, the SAME row is
// returned every render — even though logging items has updated the underlying
// tallies — so the buttons never reshuffle mid-logging. The row is recomputed
// only when the location key changes (a new location typed/picked, or a session
// opened). `invalidateSqpRow()` forces a rebuild on the next call.
//
// When the feature is off this is a passthrough to the live preset (no caching
// needed — nothing reorders).
function sqpRowForLocation(types, location) {
  if (!state.sqpEnabled) return types;
  const key = normaliseSqpLocation(location);
  if (state.sqpRowKey === key && Array.isArray(state.sqpRowCache)) {
    return state.sqpRowCache;
  }
  const row = smartOrderedItemTypes(types, location);
  state.sqpRowCache = row;
  state.sqpRowKey = key;
  return row;
}

// Force the frozen row to rebuild on the next render. Called when the confirmed
// location changes and whenever the feature is toggled / history is rebuilt or
// cleared (so a stale frozen row can't outlive the data it was built from).
function invalidateSqpRow() {
  state.sqpRowCache = null;
  state.sqpRowKey = null;
}

// v18: clear the learned history to empty (a true reset). Re-enabling the
// feature, or logging new items, will repopulate it. Confirmed by the caller.
function clearSqpHistory() {
  state.sqpHistory = {};
  bumpSqpHistoryVersion();   // v23 (E6)
  invalidateSqpRow();   // v20: drop the frozen row built from the old history
  save();
  render();
  setTimeout(() => alert('Smart Quick Pick history cleared.'), 50);
}

// v18: rebuild the learned history from all current session data, replacing
// whatever was there. Confirmed by the caller.
function rebuildSqpHistory() {
  state.sqpHistory = buildSqpHistory();
  bumpSqpHistoryVersion();   // v23 (E6)
  invalidateSqpRow();   // v20: rebuild the frozen row from the new history
  save();
  render();
  const locs = Object.keys(state.sqpHistory).length;
  setTimeout(() => alert(`Smart Quick Pick history rebuilt from your data (${locs} location${locs === 1 ? '' : 's'}).`), 50);
}

// v18: toggle handler. Turning it ON for the first time on a fresh/empty history
// seeds it from existing data so it's immediately useful; turning it ON when a
// history already exists leaves that history intact. Turning it OFF keeps the
// history (so toggling back on doesn't lose the learning) but stops all
// reordering and recording.
function setSqp(enabled) {
  state.sqpEnabled = !!enabled;
  if (state.sqpEnabled && Object.keys(state.sqpHistory).length === 0) {
    state.sqpHistory = buildSqpHistory();
  }
  bumpSqpHistoryVersion();   // v23 (E6): history may have just been (re)built
  invalidateSqpRow();   // v20: build/clear the frozen row to match the new mode
  save();
  render();
}
