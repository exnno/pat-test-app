/*!
 * PATGo PWA
 * v23 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PATGo PWA — v23 — Sessions & logic ==============
// Presets, core helpers, theme, export-state, form, validation, session/item
// actions, bulk-edit, selection, per-page settings saves. Reads global state.

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
  // v20: the frozen SQP row is built from state.itemTypes, so a preset switch or
  // edit must rebuild it. Cheap no-op when the feature is off.
  invalidateSqpRow();
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

// ---------- v47: entry-screen preset switcher (long-press) ----------
// The quick-pick grid on the entry screen long-presses to a bottom sheet that
// lists every item-type preset, so the active one can be switched without going
// into Settings. It only switches the active preset (which 9 buttons show); it
// does not log anything. Because the entry screen has no preset-editing textarea
// (that lives only on the Settings page), there are never unsaved preset edits to
// guard here — so switchPreset can be called directly, unlike the Settings
// dropdown which must run the discard-changes confirm first.
function openPresetSheet() {
  const sess = activeSession();
  if (!sess) return;
  // Only meaningful when there's more than one preset to choose between, but we
  // still open it for a single preset (it shows the one, ticked) so the gesture
  // never feels dead. No harm either way.
  state.presetSheetOpen = true;
  render();
}

function closePresetSheet() {
  state.presetSheetOpen = false;
  render();
}

// Switch to the chosen preset and close the sheet. Switches only — never fires
// items. A no-op (just closes) if the id is unknown or already active.
function switchPresetFromSheet(id) {
  state.presetSheetOpen = false;
  if (!id || id === state.activePresetId) { render(); return; }
  if (!state.itemPresets.find(p => p.id === id)) { render(); return; }
  switchPreset(id);   // switchPreset already calls save() + render()
}

// ---------- Helpers ----------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayISO = () => new Date().toISOString().slice(0, 10);
// v23 (E5): activeSession() is called many times per render and per logged item.
// Pre-v23 each call did a fresh linear .find() over the whole sessions array.
// Now we memoise the result, validating the cache against BOTH the current
// activeId AND the sessions array reference. Any operation that changes which
// session is active (openSession, createSession unshift, deleteSession, prune,
// import) either reassigns state.activeId or replaces/reorders state.sessions —
// either of which busts the cache, so a stale object can never be returned. On a
// miss we re-find and re-cache. Returns undefined when there's no active session,
// exactly as before.
let _activeSessionCache = { id: null, sessionsRef: null, session: undefined };
function activeSession() {
  if (_activeSessionCache.id === state.activeId &&
      _activeSessionCache.sessionsRef === state.sessions) {
    return _activeSessionCache.session;
  }
  const found = state.sessions.find(s => s.id === state.activeId);
  _activeSessionCache = {
    id: state.activeId,
    sessionsRef: state.sessions,
    session: found
  };
  return found;
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




// v66: calibrationStatus() MOVED to instruments.js and parameterised as
// calibrationStatusFor(instrument). The zero-argument name still exists there as
// a thin wrapper over the ACTIVE instrument, so every existing caller reads the
// same. ⚠ Do not reintroduce a copy here — two function declarations of the same
// name across files is legal JavaScript (last one loaded silently wins), so this
// class of duplication does NOT show up as a syntax error the way a duplicate
// const does. It would just quietly shadow the real one.

// v60: leading zeros now survive (decision 6B). Three paths, each padded:
//   • First item of a job    → pad startNumber to session.startPad (the width the
//                              engineer typed into New Session — '001' → 3).
//   • Normal increment       → pad to the width of the PREVIOUS item's own digits,
//                              so the padding follows what's actually on the labels
//                              even if it was typed by hand mid-job.
//   • Non-numeric last item  → fall back to the job's startPad, since there is no
//                              previous width to copy.
// startPad is absent on every pre-v60 session, so padAssetNumber gets undefined,
// treats it as width 0, and returns the number unchanged — old jobs behave
// exactly as they did before. No migration needed.
function nextAssetNo(session) {
  const pad = session.startPad;
  if (!session.items.length) {
    return (session.prefix || '') + padAssetNumber(session.startNumber || 1, pad);
  }
  const last = session.items[session.items.length - 1];
  const split = splitAssetNo(last.assetNo);
  if (split.number == null) {
    return (session.prefix || '') + padAssetNumber(session.startNumber + session.items.length, pad);
  }
  return split.prefix + padAssetNumber(split.number + 1, split.width);
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
    // v56: "Retest due" is an alternative status filter — show only sessions on
    // the active chase list. Independent of export status; only meaningful when
    // the feature is on (the option isn't offered otherwise).
    if (state.sessionFilter === 'retestdue') {
      if (!isRetestActive(s)) return false;
    } else {
      const st = exportStatus(s);
      if (state.sessionFilter === 'unexported' && st !== 'none') return false;
      if (state.sessionFilter === 'exported' && st !== 'exported') return false;
      if (state.sessionFilter === 'modified' && st !== 'modified') return false;
    }
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

// ===== v56: Retest reminders (commercial chase list) =====
// A reminder is the commercial engineer's prompt to ring a customer and rebook
// the testing job. It is per-session opt-in: a session carries reminder data ONLY
// because the engineer flagged it. Fields on a flagged session:
//   retestTrack   — true once flagged. Absent/false = not a reminder (the default).
//   retestMonths  — the interval (months) CAPTURED at flag time from the global
//                   report-settings default, so changing the default later never
//                   silently moves existing due dates. Editable per session.
//   retestContact — null while outstanding, or { status, at } once the engineer
//                   has acted: status 'booked' (rebooked — job won) or 'declined'
//                   (lost the job / customer gone). Either resolves the reminder
//                   off the active chase list. `at` is an ISO timestamp.
// The due date itself is COMPUTED, never stored (single source of truth):
//   dueISO = session.date + retestMonths.
// All fields are additive — they ride through backup/restore wholesale and need
// no backupVersion bump. normaliseSessionRetest() (below) is the restore guard.

// Read the global default retest interval (months) to seed a newly-flagged
// session. Falls back to 12 when reports/retest aren't configured — a sane PAT
// annual cycle — so flagging always produces a usable due date.
function defaultRetestMonths() {
  const rs = state.reportSettings;
  const m = rs && Number(rs.retestMonths);
  return (Number.isFinite(m) && m >= 1 && m <= 120) ? m : 12;
}

// Add `months` calendar months to an ISO yyyy-mm-dd date; return a Date at local
// midnight, or null if the input is unusable. Mirrors report.js addMonthsFormatted
// but returns a Date object for day-math (that one returns a DD/MM/YYYY string).
function retestDueDate(sess) {
  if (!sess || !sess.retestTrack) return null;
  const iso = sess.date;
  const months = Number(sess.retestMonths);
  if (!iso || !Number.isFinite(months)) return null;
  const parts = String(iso).split('-');
  if (parts.length !== 3) return null;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + months);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Whole days from today (local midnight) to a session's retest due date.
// Negative = overdue. null when the session isn't a tracked reminder.
function retestDaysUntil(sess) {
  const due = retestDueDate(sess);
  if (!due) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due - today) / (1000 * 3600 * 24));
}

// Urgency bucket for a tracked session, used by the banner, the filter and the
// reminders view. Returns one of:
//   'resolved' — engineer has booked or declined; off the active chase list.
//   'overdue'  — due date has passed.
//   'duesoon'  — due within RETEST_DUE_SOON_DAYS (the "ring them now" band).
//   'upcoming' — due within RETEST_UPCOMING_DAYS (shown, but quiet — lead time).
//   'later'    — tracked, but further out than the upcoming window.
//   null       — not a tracked reminder at all.
function retestStatus(sess) {
  if (!sess || !sess.retestTrack) return null;
  if (sess.retestContact && (sess.retestContact.status === 'booked' || sess.retestContact.status === 'declined')) {
    return 'resolved';
  }
  const days = retestDaysUntil(sess);
  if (days === null) return null;
  if (days < 0) return 'overdue';
  if (days <= RETEST_DUE_SOON_DAYS) return 'duesoon';
  if (days <= RETEST_UPCOMING_DAYS) return 'upcoming';
  return 'later';
}

// Does a session belong on the ACTIVE chase list (banner count, reminders view,
// "Retest due" filter)? Active = tracked, unresolved, and within the upcoming
// window or overdue. 'later' and 'resolved' don't surface — they exist but stay
// quiet so the list is only ever the work worth doing now.
function isRetestActive(sess) {
  const st = retestStatus(sess);
  return st === 'overdue' || st === 'duesoon' || st === 'upcoming';
}

// All sessions on the active chase list, most-urgent first (overdue before
// due-soon before upcoming; within a bucket, earliest due date first). Drives the
// reminders view and the banner count. Only meaningful when the feature is on.
function activeRetestReminders() {
  if (!state.retestRemindersEnabled) return [];
  const rank = { overdue: 0, duesoon: 1, upcoming: 2 };
  return state.sessions
    .filter(isRetestActive)
    .sort((a, b) => {
      const ra = rank[retestStatus(a)], rb = rank[retestStatus(b)];
      if (ra !== rb) return ra - rb;
      const da = retestDaysUntil(a), db = retestDaysUntil(b);
      return da - db;   // earlier due (smaller / more negative) first
    });
}

// Count for the Sessions banner. 0 → no banner.
function activeRetestCount() {
  return activeRetestReminders().length;
}

// Flag a session as a reminder to chase. Captures the interval from the global
// default at flag time (so it's stable). No-op if already tracked. Persists.
function retestFlag(sessId) {
  const sess = state.sessions.find(s => s.id === sessId);
  if (!sess || sess.retestTrack) return;
  sess.retestTrack = true;
  sess.retestMonths = defaultRetestMonths();
  sess.retestContact = null;
  save();
}

// Remove a session from reminders entirely (the "this was never mine to chase /
// I don't want reminding" escape hatch). Clears all three fields so no husk
// remains. Persists.
function retestUnflag(sessId) {
  const sess = state.sessions.find(s => s.id === sessId);
  if (!sess) return;
  delete sess.retestTrack;
  delete sess.retestMonths;
  delete sess.retestContact;
  save();
}

// Update the captured interval for one tracked session (e.g. a 6-month cycle for
// a high-risk site). Clamped 1–120; out-of-range is ignored. Persists.
function retestSetMonths(sessId, months) {
  const sess = state.sessions.find(s => s.id === sessId);
  if (!sess || !sess.retestTrack) return;
  const m = Number(months);
  if (!Number.isFinite(m) || m < 1 || m > 120) return;
  sess.retestMonths = Math.round(m);
  save();
}

// Resolve a reminder: 'booked' (rebooked the job) or 'declined' (lost it / gone).
// Both drop it off the active chase list. Stamps the time so the reminders view
// can show "Booked on …". Passing null clears the resolution (back to outstanding).
// Persists.
function retestSetContact(sessId, status) {
  const sess = state.sessions.find(s => s.id === sessId);
  if (!sess || !sess.retestTrack) return;
  if (status === 'booked' || status === 'declined') {
    sess.retestContact = { status, at: new Date().toISOString() };
  } else {
    sess.retestContact = null;
  }
  save();
}

// Restore guard (called from backup.js, mirroring normaliseItemReadings). A
// hand-edited or corrupt backup could carry garbage in the retest fields, and
// other code reads them structurally, so coerce to safe shapes or strip:
//   • retestTrack truthy → keep as real boolean true; else strip all three.
//   • retestMonths → valid 1–120 integer, else fall back to the global default.
//   • retestContact → keep only a well-formed {status:'booked'|'declined', at},
//     otherwise null (outstanding). Unknown statuses collapse to null.
// Sessions with no retest fields (any pre-v56 backup) are left untouched.
function normaliseSessionRetest(sess) {
  if (!sess || typeof sess !== 'object') return;
  if (!sess.retestTrack) {
    // Not tracked — make sure no stray partial fields linger.
    delete sess.retestTrack;
    delete sess.retestMonths;
    delete sess.retestContact;
    return;
  }
  sess.retestTrack = true;
  const m = Number(sess.retestMonths);
  sess.retestMonths = (Number.isFinite(m) && m >= 1 && m <= 120) ? Math.round(m) : defaultRetestMonths();
  const c = sess.retestContact;
  if (c && typeof c === 'object' && (c.status === 'booked' || c.status === 'declined')) {
    sess.retestContact = { status: c.status, at: typeof c.at === 'string' ? c.at : new Date().toISOString() };
  } else {
    sess.retestContact = null;
  }
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
    showToast('Enter a whole number of months (1–120)');
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
    showToast('Nothing to clear');
    return;
  }
  const itemTotal = targets.reduce((n, s) => n + (s.items ? s.items.length : 0), 0);
  openConfirmSheet({
    title: 'Clear exported sessions?',
    message:
      `Clear ${targets.length} exported session${targets.length === 1 ? '' : 's'} ` +
      `(${itemTotal} item${itemTotal === 1 ? '' : 's'} in total)? ` +
      `These have all been exported to CSV and are older than ${state.pruneAgeMonths} month${state.pruneAgeMonths === 1 ? '' : 's'}. ` +
      `This permanently removes them from this device and cannot be undone.`,
    confirmLabel: 'Clear',
    onConfirm: () => {
      const ids = new Set(targets.map(s => s.id));
      // v59: archive the tallies of everything about to be cleared, BEFORE the
      // filter removes them — otherwise a tidy-up would silently reduce the
      // lifetime counter. `targets` is the exact set being removed.
      archiveSessionStats(targets);
      // v62: and their photos, on the same before-the-filter rule.
      photosDeleteForSessions(Array.from(ids));
      state.sessions = state.sessions.filter(s => !ids.has(s.id));
      save();
      render();
      showToast(`Cleared ${targets.length} session${targets.length === 1 ? '' : 's'}`);
    }
  });
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
    // v65 (decision 6B): if the item we just logged carried a SCANNED asset
    // number, leave this box EMPTY instead of pre-filling it. nextAssetNo()
    // increments the last item's trailing digits, so after a scan of
    // 'PAT-004821' it would offer 'PAT-004822' — arithmetic on someone else's
    // label, which looks like an answer and almost certainly isn't on any
    // appliance. Blank plus the "Scan or type" placeholder says what it is.
    // The session id must match, so the blanking dies when you switch jobs.
    const afterScan = state.lastLogWasScanned && state.lastScanSessionId === sess.id;
    state.form = {
      assetNo: afterScan ? '' : nextAssetNo(sess),
      location: getCarryForwardLocation(sess, state.cursor),
      itemType: '',
      notes: '',
      showNotes: false
    };
  }
  // v65: a fresh form has not been scanned into yet, whichever branch built it.
  state.scanFilledAsset = false;
  // v67: the keyboard escape hatch is per-item. Having typed one asset number by
  // hand should not silently leave the next fifty in typing mode — the engineer
  // would be back to the keyboard covering PASS/FAIL with no idea why.
  state.scanKeyboardOn = false;
  state.suggestions = [];
  state.showSuggestions = false;
  // v10: location suggestions follow the same lifecycle
  state.locationSuggestions = [];
  state.showLocationSuggestions = false;
  state.failModalOpen = false;
  state.failModalStage = 'reasons';
  state.failOtherText = '';
  state.multiPickSheetOpen = false;   // v16
  state.presetSheetOpen = false;      // v47
  closeReadingsSheetState();          // v53
  discardPendingPhotos();             // v62
  closePhotoStripState();             // v62
  // v20: the loaded item may carry a different location, so the frozen SQP row
  // must rebuild for it. Cheap no-op when the feature is off.
  invalidateSqpRow();
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
  const { name, engineer, prefix, startNo } = state.newForm;

  // v19: resolve the Client and Site fields. The form carries the typed text in
  // state.newForm.site (now repurposed as the SITE text) plus the chosen client
  // name in a dedicated field. We ensure both exist in the lists (creating them
  // if the user typed something new — the auto-learn half of the feature), then
  // store BOTH structured references (clientId/siteId) AND a combined text
  // snapshot on the session so CSV, search, and old-session compatibility are
  // untouched.
  const clientName = String(state.newForm.clientId || '').trim();   // holds the typed client NAME
  const siteName = String(state.newForm.site || '').trim();         // holds the typed site NAME

  // v26 (Q1=A): a session now needs at LEAST ONE of Client or Site (previously
  // Site was mandatory). Neither → block with a gentle inline message rather
  // than a silent return, so the user knows why nothing happened.
  if (!clientName && !siteName) {
    state.newFormError = 'Enter a client or a site to start the session.';
    render();
    return;
  }
  state.newFormError = '';

  // Resolve structured refs, creating list entries for anything newly typed:
  //   • client + site → client created, site created under it (as before)
  //   • client only   → client created, no site (Q3: a site can be added later)
  //   • site only     → orphan site created with no client (Q2=A); it lands in
  //                     the Unassigned group and can be assigned to a client later
  let clientRec = null;
  let siteRec = null;
  if (clientName && siteName) {
    clientRec = ensureClient(clientName);
    if (clientRec) siteRec = ensureSite(clientRec.id, siteName);
  } else if (clientName) {
    clientRec = ensureClient(clientName);
  } else {
    siteRec = ensureOrphanSite(siteName);
  }

  const snapshot = composeSiteSnapshot(clientName, siteName);

  const now = new Date().toISOString();
  const s = {
    id: uid(),
    name: name.trim() || `Session ${state.sessions.length + 1}`,
    site: snapshot,                              // combined text snapshot (back-compat)
    clientId: clientRec ? clientRec.id : '',     // v19: structured refs (convenience)
    siteId: siteRec ? siteRec.id : '',
    engineer: engineer.trim(),
    prefix: prefix.trim(),
    date: todayISO(),
    startNumber: parseInt(startNo, 10) || 1,
    // v60: the digit width the engineer actually typed into New Session, so
    // '001' starts the job at 001 rather than 1. Stored as a plain integer
    // alongside startNumber rather than making startNumber a string — the
    // number stays a number for every existing consumer (increment, CSV import,
    // the codec), and this is a purely additive field the storage codec passes
    // through unmapped. Only recorded when zeros were actually typed; a plain
    // '1' stores nothing, so the default behaviour is unpadded (decision 8A).
    startPad: assetPadFromInput(startNo),
    // v66: stamp the instrument in use at the moment the job is created, so its
    // certificate always names the tester that actually did the work — even
    // after recalibration or a change of instrument. Empty when the user has no
    // instruments saved, which resolves to "whichever is active" exactly as
    // every pre-v66 session does.
    instrumentId: state.activeInstrumentId || '',
    items: [],
    locked: false,  // v8
    // v36: optional job-level notes (printed on the report when non-empty) and
    // the assigned certificate number (stamped once on first report when cert
    // numbers are enabled; reused thereafter). Both additive — old sessions
    // simply lack them and backfill as empty.
    notes: '',
    certNo: '',
    // v43: cloud prep. Sync metadata (userId for ownership, lastModified timestamp,
    // syncedAt for cloud sync checkpoints). All passthrough for now — old sessions
    // backfill with null/defaults. userId is set on actual cloud login.
    userId: null,
    lastModified: now,
    syncedAt: null
  };
  state.sessions.unshift(s);
  state.activeId = s.id;
  state.cursor = 0;
  state.view = 'entry';
  state.newForm = { name: '', site: '', engineer: state.engineer, prefix: '', startNo: '1', show: false, clientId: '', siteId: '' };
  state.newFormError = '';
  state.nfSuggestions = []; state.showNfSuggestions = false; state.nfActiveField = null;
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

// ---------------------------------------------------------------------------
// v59: lifetime stats counter
//
// Two halves. The LIVE half is counted from state.sessions every time it's
// needed — never stored, so it can't drift from the actual data. The ARCHIVED
// half (state.archivedStats) holds the tallies of sessions that have already
// left the app via prune or delete. Displayed figure = live + archived.
//
// The demo/example session is excluded from BOTH halves, so a brand-new user who
// accepted the example job doesn't start with inflated numbers, and deleting it
// later doesn't archive its tallies either.
// ---------------------------------------------------------------------------

// Should this session count towards the stats at all?
function sessionCountsForStats(sess) {
  return !!sess && !sess[DEMO_SESSION_FLAG];
}

// Tally one array of sessions into { items, fails, types }. Pure — no state
// access, no mutation of the input. Used by BOTH halves (the live count and the
// archive hook), so the two can never disagree about what counts.
function tallySessions(sessions) {
  const out = { items: 0, fails: 0, types: {} };
  (sessions || []).forEach(sess => {
    if (!sessionCountsForStats(sess)) return;
    (sess.items || []).forEach(it => {
      if (!it) return;
      out.items++;
      if (it.result === 'fail') out.fails++;
      const t = (it.itemType || '').trim();
      if (t) out.types[t] = (out.types[t] || 0) + 1;
    });
  });
  return out;
}

// Fold a set of sessions that are ABOUT TO BE REMOVED into the archived bucket.
// MUST be called BEFORE the sessions are filtered out of state.sessions — it
// reads their items. Does not save; both callers already call save() straight
// after, which persists the bucket via saveSettings().
//
// Only ever called from the two removal paths (deleteSession, pruneOldSessions).
// Calling it twice for the same session would double-count, which is why it is
// deliberately NOT a general-purpose helper — it is paired with a removal.
function archiveSessionStats(sessions) {
  const add = tallySessions(sessions);
  const bucket = state.archivedStats || makeEmptyArchivedStats();
  bucket.items = (bucket.items || 0) + add.items;
  bucket.fails = (bucket.fails || 0) + add.fails;
  bucket.types = bucket.types || {};
  Object.keys(add.types).forEach(t => {
    bucket.types[t] = (bucket.types[t] || 0) + add.types[t];
  });
  state.archivedStats = bucket;
}

// The figure shown under the Settings hub footer. Returns null when there is
// nothing to show, so the caller can omit the line entirely rather than render
// "0 tested".
// → { items, fails, failRate (string, 1dp), topType (string|'') }
function computeAppStats() {
  const live = tallySessions(state.sessions);
  const arch = normaliseArchivedStats(state.archivedStats);

  const items = live.items + arch.items;
  if (items === 0) return null;

  const fails = Math.min(live.fails + arch.fails, items);

  const types = { ...arch.types };
  Object.keys(live.types).forEach(t => {
    types[t] = (types[t] || 0) + live.types[t];
  });
  // Ties broken alphabetically so the displayed winner is stable between renders
  // rather than flipping on object key order.
  const topType = Object.keys(types)
    .sort((a, b) => types[b] - types[a] || a.localeCompare(b))[0] || '';

  return {
    items,
    fails,
    failRate: (items === 0 ? 0 : (fails / items) * 100).toFixed(1),
    topType
  };
}

// ============== PATGo PWA — v61 — Testing time ==============
// How long a job took, derived entirely from item timestamps. Nothing new is
// stored: `ts` is an existing field that v61 simply populates on every item
// instead of only when a setting was on (see config.js).
//
// PURE — reads a session, returns an object or null, touches no state and saves
// nothing. Same shape of contract as computeAppStats(): return null when there
// is nothing worth showing, and let the caller omit the whole line rather than
// print a meaningless "0m".
//
// THE SPAN IS EARLIEST-TO-LATEST, NOT FIRST-ELEMENT-TO-LAST. This matters and is
// not defensive over-engineering:
//   • items can be edited and re-ordered, so array position is not chronology;
//   • a CSV import brings in items with no `ts` at all, which must be skipped
//     rather than treated as time zero;
//   • jobs that straddle v61 have some stamped items and some bare ones.
// Scanning for min/max is correct in all three cases; indexing [0] and [n-1] is
// wrong in all three.
//
// Returns:
//   null                                   — fewer than two timestamped items
//   { multiDay:true,  days:N }             — the span crosses calendar days
//   { multiDay:false, ms:N, text:'3h 12m' } — a single day's elapsed time
function sessionDuration(sess) {
  if (!sess || !Array.isArray(sess.items)) return null;
  let min = null, max = null, stamped = 0;
  const dayKeys = {};
  for (const it of sess.items) {
    if (!it || !it.ts) continue;
    const t = Date.parse(it.ts);
    if (!Number.isFinite(t)) continue;   // garbage ts in a hand-edited backup
    stamped++;
    if (min === null || t < min) min = t;
    if (max === null || t > max) max = t;
    // Local calendar day, not UTC — an engineer finishing at 00:30 has worked
    // into the next day by their own reckoning, and by their phone's.
    const d = new Date(t);
    dayKeys[`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`] = true;
  }
  // One stamp gives a span of zero, which is not a duration — it's one item.
  if (stamped < 2 || min === null || max === null) return null;

  const days = Object.keys(dayKeys).length;
  if (days >= DURATION_MULTIDAY_MIN_DAYS) {
    // A job reopened two days later has a raw elapsed time of ~26 hours, which
    // is a worse answer than no answer. Say what actually happened instead
    // (decision Q9A).
    //
    // `days` is DAYS WORKED, not calendar span — deliberately. A job logged on
    // the 10th and the 12th reports "2 days", not "3": nothing was logged on the
    // 11th, so claiming three days would overstate the work. Counting distinct
    // stamped days is the only figure here that is true of every job, including
    // one picked up again a month later.
    return { multiDay: true, days, ms: max - min, text: `spread across ${days} days` };
  }
  const ms = max - min;
  return { multiDay: false, days: 1, ms, text: formatDurationShort(ms) };
}

// ============== PATGo PWA — v61 — Cross-session asset history ==============
// Searching the Sessions screen has matched item asset numbers across every
// session since v10 — that part was never the gap. The gap was PRESENTATION: a
// match opened its own job, so an asset tested in three jobs meant opening three
// jobs and piecing the history together by hand. These two functions build the
// consolidated view.
//
// Both are PURE reads over state.sessions. Nothing here writes, saves or
// migrates anything, which is why this whole feature needed no storage work and
// no backupVersion bump.

// Does this asset number appear on items in ASSET_HISTORY_MIN_JOBS or more
// DIFFERENT jobs? Returns the canonical asset number to offer history for, or
// null. Called on every keystroke of the Sessions search, so it stays a cheap
// single pass and bails as soon as it can.
//
// ⚠ ASSET NUMBERS ONLY (decision Q3A) — deliberately NOT the same match as
// filteredSessions(), which also matches location, item type and notes. Offering
// "history for kettle" would be meaningless: kettle is not an asset, it's a
// hundred different appliances. The history card only appears when the thing you
// typed identifies ONE physical item.
function assetHistoryCandidate(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return null;
  const jobIds = {};
  let canonical = '';
  for (const s of state.sessions) {
    if (!s || !Array.isArray(s.items)) continue;
    for (const it of s.items) {
      if (!it) continue;
      const a = (it.assetNo || '').trim();
      // Q4A: exact text, case-insensitive and trimmed. NOT a substring match —
      // typing "1" must not claim to be the history of asset "1024". And NOT
      // zero-insensitive: '001' and '1' stay different assets, exactly as
      // findDuplicateAssetIndex has treated them since v60 (decision 8A). The
      // label on the appliance is its identity; if you typed the zeros, you
      // meant them.
      if (a && a.toLowerCase() === q) {
        jobIds[s.id] = true;
        if (!canonical) canonical = a;   // first seen wins the display casing
      }
    }
  }
  const jobCount = Object.keys(jobIds).length;
  return jobCount >= ASSET_HISTORY_MIN_JOBS ? { assetNo: canonical, jobCount } : null;
}

// Every past instance of one asset number, newest first, with everything the
// history sheet needs to render a row and jump to the original item.
// Returns { rows, total } — `total` is the true count so the sheet can say when
// it has trimmed to ASSET_HISTORY_MAX_ROWS.
function assetHistoryFor(assetNo) {
  const q = (assetNo || '').trim().toLowerCase();
  if (!q) return { rows: [], total: 0 };
  const rows = [];
  for (const s of state.sessions) {
    if (!s || !Array.isArray(s.items)) continue;
    for (let i = 0; i < s.items.length; i++) {
      const it = s.items[i];
      if (!it) continue;
      if ((it.assetNo || '').trim().toLowerCase() !== q) continue;
      rows.push({
        sessionId: s.id,
        sessionTitle: s.site || s.name || 'Untitled job',
        date: s.date || '',
        index: i,
        item: it
      });
    }
  }
  // Newest job first. Ties (two jobs the same day) fall back to nothing in
  // particular, which is fine — same-day ordering carries no information.
  rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const total = rows.length;
  return { rows: rows.slice(0, ASSET_HISTORY_MAX_ROWS), total };
}

// Sheet lifecycle. The sheet is READ-ONLY — no inputs, no typing, nothing
// focusable to lose — so a plain render() on open and close is safe here. (The
// v60.1 rule about never re-rendering an open sheet exists because the bug sheet
// contains a textarea; that hazard genuinely does not apply to this one.)
function openAssetHistory(assetNo) {
  const a = (assetNo || '').trim();
  if (!a) return;
  state.assetHistoryAsset = a;
  state.assetHistorySheetOpen = true;
  render();
}

function closeAssetHistory() {
  state.assetHistorySheetOpen = false;
  state.assetHistoryAsset = '';
  render();
}

// Jump from a history row to the original item in its own job. `arg` arrives as
// "sessionId|itemIndex" from the row's data-arg.
function openAssetHistoryRow(arg) {
  const bits = String(arg || '').split('|');
  const id = bits[0];
  const idx = parseInt(bits[1], 10);
  if (!id) return;
  state.assetHistorySheetOpen = false;
  state.assetHistoryAsset = '';
  // requestOpenSession handles the "edited since export" warning for us, and
  // carries the cursor through if the user confirms it.
  requestOpenSession(id, Number.isFinite(idx) ? { cursor: idx } : undefined);
}

function deleteSession(id) {
  // v59: fold this session's tallies into the archived stats BEFORE it goes, so
  // the lifetime counter doesn't fall when a job is deleted. Must run before the
  // filter below — it reads the session's items.
  const going = state.sessions.filter(s => s.id === id);
  if (going.length) archiveSessionStats(going);
  // v62: sweep every photo belonging to this job. Records carry sessionId as
  // well as itemId precisely so this is one indexed lookup and does NOT depend
  // on the session's items still being reachable.
  if (going.length) photosDeleteForSessions([id]);
  state.sessions = state.sessions.filter(s => s.id !== id);
  if (id === state.activeId) {
    state.activeId = null;
    state.view = 'sessions';
  }
  save(); render();
}

function saveItem(result, readings) {
  const sess = activeSession();
  if (!sess) return;
  const err = validateBeforeSave();
  if (err) { showToast(err); return; }
  const cleanLocation = normaliseLocation(state.form.location);
  const cleanType = normaliseItemType(state.form.itemType);
  const item = {
    assetNo: state.form.assetNo.trim() || nextAssetNo(sess),
    location: cleanLocation,
    itemType: cleanType,
    notes: state.form.notes.trim(),
    result
  };
  // v53: attach test readings when the feature is on and a non-empty object was
  // supplied (from the readings sheet). When the feature is off, `readings` is
  // never passed, so the item shape is byte-for-byte the pre-v53 shape — the
  // off-path guarantee. We normalise here too (belt and braces) so an all-blank
  // draft never writes an empty husk; a null result simply omits the key.
  if (state.readingsEnabled && readings) {
    const clean = normaliseItemReadings(readings);
    if (clean) item.readings = clean;
  }
  // v62: we need the id of whichever item this call ends up writing, so any
  // photos staged during the fail flow can be attached to it. Both branches set
  // it — the edit branch reuses the existing id, the append branch mints one.
  let savedItemId = '';
  // ⚠ v62.1 BUG FIX — TAKE THE STAGED PHOTOS NOW, NOT LATER.
  // `loadFormForCursor()` runs below (before the save block) and calls
  // discardPendingPhotos() as part of clearing transient entry state. That wiped
  // state.pendingPhotos before commitPendingPhotos() ever ran, so a fail logged
  // with photos silently committed none of them: no chip, nothing in the store.
  // Reading them into a LOCAL here makes the commit independent of anything that
  // clears state in between. Revoking the object URLs does not invalidate the
  // Blobs, so the captured entries stay usable.
  const stagedPhotos = (state.pendingPhotos || []).slice();
  if (state.cursor < sess.items.length) {
    // v17: editing an existing item must NOT change its original timestamp —
    // ts records when the item was FIRST logged, not last touched. We spread
    // the new fields over the old item, which leaves any existing .ts intact
    // (item, above, has no ts key, so it can't overwrite it).
    // v53: if the feature is on but this edit produced no readings object, we
    // must not leave a stale one behind — spread first, then reconcile the key.
    const merged = { ...sess.items[state.cursor], ...item };
    if (state.readingsEnabled && !item.readings) delete merged.readings;
    sess.items[state.cursor] = merged;
    savedItemId = merged.id || '';
  } else {
    // v17: stamp on first save (append only) — ts means "first logged", never
    // "last touched", which is why the edit branch above must not set it.
    // v61: capture is now UNCONDITIONAL. It used to be gated on
    // state.timestampsEnabled; that setting now gates EXPOSURE only (the CSV
    // Time column). See the capture/exposure note in config.js — this is the
    // line that changed, and it was a deliberate decision, not a slip.
    item.ts = new Date().toISOString();
    const appended = { id: uid(), ...item };
    sess.items.push(appended);
    savedItemId = appended.id;
    // v18: learn this (location, type) pairing on first log (pass OR fail — a
    // failed item still belongs to that location). No-op when SQP is off.
    recordSqpUsage(cleanLocation, cleanType);
  }
  markSessionDirty(sess);   // v14: edits invalidate a prior export
  addDescriptionIfNew(cleanType);
  state.cursor++;
  // v65 (decision 6B): remember whether THIS item's asset number came off a
  // barcode, because loadFormForCursor() — called on the very next line — uses
  // it to decide whether to pre-fill the next box or leave it empty. It must be
  // read before that call, since loadFormForCursor clears scanFilledAsset.
  state.lastLogWasScanned = !!state.scanFilledAsset;
  state.lastScanSessionId = state.lastLogWasScanned ? sess.id : '';
  loadFormForCursor();
  // v19 (efficiency item 4): on the entry screen with no modal open (the state
  // after any save — pass, fail-commit, or edit-overwrite), use the lightweight
  // entry-only refresh. refreshEntryAfterLog() falls back to full render() if we
  // are somehow not on the entry screen, so this is always safe.
  // v23 (E2): hot path — write the sessions blob plus only the two cold keys this
  // function can touch on append (learned SQP history, descriptions). Skips the
  // ~21 other unchanged settings keys a full save() would rewrite every tap.
  saveSessions(); saveSqpHistory(); saveDescriptions();
  // v62: attach any photos staged during the fail flow to the item just written.
  // Deliberately AFTER the save above — the item must exist in the sessions blob
  // before anything points at its id. Async and fire-and-forget: it repaints
  // itself when the writes land, and a photo-store failure cannot affect the
  // item that has already been saved.
  commitPendingPhotos(sess.id, savedItemId, result, stagedPhotos);
  refreshEntryAfterLog();
}

function passClicked() {
  // v8: belt-and-braces — UI disables the buttons when locked, but block here too.
  const sess = activeSession();
  if (sess && sess.locked) return;
  const err = validateBeforeSave();
  if (err) { showToast(err); return; }

  // v62 (decision 14B): photos only ever attach to a FAIL. Turning an existing
  // fail into a pass therefore gives up its photos — but never silently. The
  // confirm names the count and says plainly they cannot be recovered, because
  // the realistic route here is correcting a mis-tap, and someone who mis-tapped
  // needs to know what else that undo takes with it.
  const existing = (sess && state.cursor < sess.items.length) ? sess.items[state.cursor] : null;
  const losing = (existing && existing.result === 'fail') ? photoCountForItem(existing.id) : 0;
  if (losing > 0) {
    openConfirmSheet({
      title: 'Change to PASS?',
      message:
        `This item is a FAIL with ${losing} photo${losing === 1 ? '' : 's'} attached. ` +
        `Changing it to PASS will delete ${losing === 1 ? 'that photo' : 'those photos'} ` +
        `from this device. They can't be recovered.`,
      confirmLabel: 'Change and delete',
      onConfirm: () => {
        // Delete first, THEN commit the result change. If the delete fails the
        // pass still records — an item carrying a stale photo is a far smaller
        // problem than a result the engineer thinks they changed and didn't.
        photosDeleteForItem(existing.id).then(() => commitPassResult());
      }
    });
    return;
  }
  commitPassResult();
}

// The PASS commit itself, split out of passClicked so the v62 photo confirm can
// resume it once the user agrees. Nothing else calls this.
function commitPassResult() {
  const sess = activeSession();
  if (!sess) return;
  // v53: when Test Readings is on, PASS no longer commits immediately — it opens
  // the readings sheet (pass mode) so the engineer can confirm/edit the numbers.
  // The PASS tap still happens first (muscle memory intact); the sheet is a
  // confirm-with-numbers, not a gate. When the feature is off, this whole branch
  // is skipped and PASS commits in one tap exactly as before.
  if (state.readingsEnabled) {
    feedback('pass', 'pass-btn');
    openReadingsSheet('pass', null);
    return;
  }
  feedback('pass', 'pass-btn');   // v17: haptic + green flash + (opt-in) pass tone
  saveItem('pass');
}

function failClicked() {
  const sess = activeSession();
  if (sess && sess.locked) return;
  const err = validateBeforeSave();
  if (err) { showToast(err); return; }
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
  // v53: when Test Readings is on, the fail reason drives a readings step before
  // commit. The reason's tag decides which single box the sheet shows (earth /
  // insulation / leakage), or — for a visual-tagged reason or "Other…" (null) —
  // no electrical box at all, in which case the sheet still appears so the class
  // can be recorded, but with no measurement fields. Off-path: commit as before.
  if (state.readingsEnabled) {
    openReadingsSheet('fail', reasonOrNull || null);
    return;
  }
  saveItem('fail');
}

function cancelFailModal() {
  state.failModalOpen = false;
  state.failModalStage = 'reasons';
  state.failOtherText = '';
  // v62: nothing was logged, so any photo staged in the sheet is discarded and
  // its object URL released. Staged photos are never written to the store until
  // the item they belong to actually exists.
  discardPendingPhotos();
  render();
}

// ---------- v62: photo evidence — staging, commit, and the strip sheet ----------
//
// Photos attach to FAILS ONLY (decision 15A). Two routes reach the store:
//
//   1. DURING the fail flow, from the fail sheet, before the item exists. The
//      item has no id until saveItem() pushes it, so photos are STAGED in
//      state.pendingPhotos and written the moment the item is saved.
//   2. AFTER the fact, from the photo strip on an already-logged fail, where
//      the item id is known and the write is immediate.
//
// Everything that talks to IndexedDB is in photos.js; this section is the UI
// lifecycle around it.

// Stage a photo chosen from the fail sheet. The cap is checked here for the
// message and again inside photoAdd() at commit time, so neither a double-tap
// nor a slow device can push a fourth photo past it.
function addPendingPhotoFromFile(file) {
  if (!file) return;
  const cap = PHOTO_MAX_PER_ITEM;
  if (state.pendingPhotos.length >= cap) {
    showToast(`Up to ${cap} photos per item`);
    return;
  }
  processPhotoFile(file).then((processed) => {
    if (!processed) { showToast('Could not read that photo'); return; }
    if (state.pendingPhotos.length >= cap) return;   // re-check after the async gap
    processed.url = photoObjectUrl(processed.blob);
    state.pendingPhotos.push(processed);
    refreshFailPhotoStrip();
  });
}

// Drop one staged photo before it has been committed.
function removePendingPhoto(index) {
  const photo = state.pendingPhotos[index];
  if (!photo) return;
  state.pendingPhotos.splice(index, 1);
  refreshFailPhotoStrip();
}

// Discard every staged photo and release its object URL. Called when the fail
// sheet is cancelled, on any view change, and after a successful commit.
function discardPendingPhotos() {
  if (!state.pendingPhotos || !state.pendingPhotos.length) {
    state.pendingPhotos = [];
    return;
  }
  state.pendingPhotos = [];
  photoReleaseObjectUrls();
}

// ⚠ TARGETED DOM UPDATE, NOT render() — this is the v60.1 rule.
//
// The fail sheet's "Other…" stage contains a TEXTAREA. v60.1 established that a
// full render() while a sheet holds a focused field tears the field down and
// drops the keyboard, and the photo button is deliberately available on BOTH
// stages (an unusual "Other" fail is exactly the kind worth photographing), so
// this path can and will run with that textarea live. Rewriting only the strip
// container leaves the textarea, its value and its caret completely untouched.
//
// The render() below is a fallback for the case where the sheet isn't painted —
// it cannot fire while the sheet is open, which is the only time it would hurt.
function refreshFailPhotoStrip() {
  const strip = document.getElementById('fail-photo-strip');
  if (strip && typeof renderFailPhotoStripInner === 'function') {
    strip.innerHTML = renderFailPhotoStripInner();
    return;
  }
  render();
}

// Write the staged photos against the item saveItem() has just written.
// Fire-and-forget by design: the item is already saved, and a photo-store
// failure must never propagate back into the logging path.
// ⚠ `staged` is passed IN by the caller, deliberately. It used to read
// state.pendingPhotos itself, which broke in v62.0 because saveItem's
// loadFormForCursor() clears that array before this ever runs. The list must be
// captured at the top of saveItem and handed over. Do not reintroduce the read.
function commitPendingPhotos(sessionId, itemId, result, staged) {
  const list = (staged && staged.length) ? staged : [];
  if (!list.length) return;

  // Belt and braces on decision 15A. Staged photos can only be produced by the
  // fail sheet, so a non-fail result here means something unexpected happened;
  // discard rather than quietly attaching evidence to a pass.
  if (result !== 'fail' || !itemId) { discardPendingPhotos(); return; }

  // Make sure nothing is left staged — the thumbnails are about to be replaced
  // by the committed count.
  state.pendingPhotos = [];

  // First photo ever added is where we ask for persistent storage (decision 9A)
  // — at the point the user has demonstrably chosen to keep photos, not at boot.
  if (photoStatsSync().count === 0) photoRequestPersistence();

  list.reduce(
    (chain, processed) => chain.then(() => photoAdd(sessionId, itemId, processed)),
    Promise.resolve()
  ).then(() => {
    photoReleaseObjectUrls();
    // Repaint so the Overview chip and the entry screen reflect the new count.
    render();
  }).catch(() => {
    photoReleaseObjectUrls();
  });
}

// ---------- the photo strip sheet (viewing an existing item's photos) ----------

// Open the strip for one item. Loads the blobs asynchronously and paints a
// loading state first, so a slow disk never blocks the tap.
function openPhotoStrip(itemId) {
  if (!itemId) return;
  state.photoStripOpen = true;
  state.photoStripItemId = itemId;
  state.photoStripPhotos = [];
  state.photoStripLoading = true;
  render();
  photosForItem(itemId).then((records) => {
    // The sheet may have been closed, or another item opened, while we waited.
    if (!state.photoStripOpen || state.photoStripItemId !== itemId) return;
    state.photoStripPhotos = records.map((r) => ({
      id: r.id,
      url: photoObjectUrl(r.blob),
      bytes: r.bytes || 0,
      at: r.at || ''
    }));
    state.photoStripLoading = false;
    render();
  });
}

// Clear the strip's state and release its object URLs. Separate from
// closePhotoStrip() so the view-change paths can reset without a render.
function closePhotoStripState() {
  if (!state.photoStripOpen && !(state.photoStripPhotos || []).length) {
    state.photoStripOpen = false;
    state.photoStripItemId = '';
    state.photoStripPhotos = [];
    state.photoStripLoading = false;
    return;
  }
  state.photoStripOpen = false;
  state.photoStripItemId = '';
  state.photoStripPhotos = [];
  state.photoStripLoading = false;
  photoReleaseObjectUrls();
}

// The strip is READ-MOSTLY — buttons only, no inputs, nothing focusable — so
// like the v61 asset-history sheet it MAY call render(). The v60.1 no-render
// rule is specific to sheets containing fields.
function closePhotoStrip() {
  closePhotoStripState();
  render();
}

// Add a photo to an already-logged fail, straight from the strip.
function addPhotoToItemFromFile(file) {
  const itemId = state.photoStripItemId;
  if (!file || !itemId) return;
  if (photoCountForItem(itemId) >= PHOTO_MAX_PER_ITEM) {
    showToast(`Up to ${PHOTO_MAX_PER_ITEM} photos per item`);
    return;
  }
  const sess = activeSession();
  state.photoStripLoading = true;
  render();
  processPhotoFile(file).then((processed) => {
    if (!processed) {
      state.photoStripLoading = false;
      showToast('Could not read that photo');
      render();
      return;
    }
    if (photoStatsSync().count === 0) photoRequestPersistence();
    return photoAdd(sess ? sess.id : '', itemId, processed).then((id) => {
      if (!id) { showToast('Could not save that photo'); }
      // Reload the strip from the store rather than patching it in memory, so
      // what is on screen is always what is actually persisted.
      photoReleaseObjectUrls();
      state.photoStripPhotos = [];
      return photosForItem(itemId).then((records) => {
        state.photoStripPhotos = records.map((r) => ({
          id: r.id, url: photoObjectUrl(r.blob), bytes: r.bytes || 0, at: r.at || ''
        }));
        state.photoStripLoading = false;
        render();
      });
    });
  });
}

// Delete one photo from the strip, with a confirm — a photo is evidence and a
// mis-tap on a small thumbnail row is easy.
function deletePhotoFromStrip(photoId) {
  if (!photoId) return;
  const itemId = state.photoStripItemId;
  openConfirmSheet({
    title: 'Delete photo?',
    message: "This removes the photo from this device permanently. It can't be recovered.",
    confirmLabel: 'Delete',
    onConfirm: () => {
      photoDelete(photoId).then(() => {
        const gone = state.photoStripPhotos.find((p) => p.id === photoId);
        if (gone && gone.url) { try { URL.revokeObjectURL(gone.url); } catch {} }
        state.photoStripPhotos = state.photoStripPhotos.filter((p) => p.id !== photoId);
        // Nothing left — close the sheet rather than leave an empty shell open.
        if (!state.photoStripPhotos.length) { closePhotoStrip(); return; }
        render();
      });
      void itemId;
    }
  });
}

// ---------- v53: Test Readings sheet ----------
// The readings sheet is the confirm-with-numbers step shown after PASS (pass
// mode) or after a fail reason is picked (fail mode), only when the feature is
// on. It reuses the .fail-sheet bottom-sheet pattern (the reliable iOS PWA
// modal). A class selector at the top drives which measurement rows show; the
// chosen class is remembered for the next item (state.lastReadingsClass).
//
//   PASS mode  — show every field applicable to the class, PRE-FILLED with the
//                class-appropriate typical-pass placeholder (editable). One OK
//                commits. (The visual inspection is implied by PASS — not stored
//                separately, per the locked spec.)
//   FAIL mode  — show ONLY the single box the chosen reason's tag points at
//                (earth/insulation/leakage), BLANK. A visual-tagged reason or
//                "Other…" shows no measurement box (class only). OK commits.
//
// When EDITING an existing item that already has readings, we pre-fill the draft
// from those stored readings instead of the pass placeholders, so re-opening an
// item doesn't silently overwrite recorded values with defaults.
function openReadingsSheet(mode, failReason) {
  const sess = activeSession();
  if (!sess) return;
  const isExisting = state.cursor < sess.items.length;
  const existing = isExisting ? sess.items[state.cursor] : null;
  const existingReadings = (existing && existing.readings) ? existing.readings : null;

  // Class: prefer the existing item's recorded class, else the last-used class.
  const cls = (existingReadings && existingReadings.class) || state.lastReadingsClass || READING_CLASS_DEFAULT;
  const draft = { class: cls, earth: '', insulation: '', leakage: '', polarity: false };

  if (existingReadings) {
    // Re-opening an item with readings: show exactly what was stored.
    ['earth', 'insulation', 'leakage'].forEach(k => {
      if (typeof existingReadings[k] === 'string') draft[k] = existingReadings[k];
    });
    // v54: polarity (Class I checkbox) — restore the stored tick if present.
    draft.polarity = existingReadings.polarity === true;
  } else if (mode === 'pass') {
    // Fresh PASS: pre-fill the applicable fields with their typical-pass values.
    (READING_FIELDS_BY_CLASS[cls] || []).forEach(k => {
      const meta = READING_FIELD_META[k];
      if (meta) draft[k] = meta.passPlaceholder;
    });
  }
  // Fresh FAIL: leave measurement fields blank (recording the actual reading).

  state.readingsSheetMode = mode;
  state.readingsPendingResult = (mode === 'fail') ? 'fail' : 'pass';
  state.readingsPendingFailReason = (mode === 'fail') ? (failReason || null) : null;
  state.readingsDraft = draft;
  state.readingsSheetOpen = true;
  render();
}

// v53: change the class while the sheet is open. Switching class re-derives the
// visible fields. On a fresh PASS we re-seed placeholders for the new class's
// fields (so switching I→II doesn't leave a stale earth value the new class
// can't show); any field the user has already edited away from its placeholder
// is preserved. We keep it simple and predictable: re-seed only the fields that
// are still at their previous placeholder, blank the ones the new class drops.
function setReadingsClass(cls) {
  if (READING_CLASSES.indexOf(cls) === -1) return;
  const d = state.readingsDraft || { class: cls, earth: '', insulation: '', leakage: '', polarity: false };
  const prevCls = d.class;
  d.class = cls;
  if (state.readingsSheetMode === 'pass') {
    const nowFields = READING_FIELDS_BY_CLASS[cls] || [];
    ['earth', 'insulation', 'leakage'].forEach(k => {
      const meta = READING_FIELD_META[k];
      const prevPlaceholder = meta ? meta.passPlaceholder : '';
      if (nowFields.indexOf(k) === -1) {
        // Field doesn't apply to the new class — clear it.
        d[k] = '';
      } else if (!d[k] || d[k] === prevPlaceholder) {
        // Field applies and is empty or still at its default — (re)seed it.
        d[k] = prevPlaceholder;
      }
      // else: user typed a custom value — keep it.
    });
  }
  // v54: polarity only applies to Class I (READING_POLARITY_CLASSES). If the new
  // class doesn't support it, clear the tick so a stale Class I polarity can't
  // ride out on a now-Class-II/III item.
  if (READING_POLARITY_CLASSES.indexOf(cls) === -1) d.polarity = false;
  state.lastReadingsClass = cls;
  state.readingsDraft = d;
  render();
}

// v53: live-update a single reading field as the user types in the sheet. Bound
// via data-input-action in events.js. Stored as-typed (trimmed at commit).
function setReadingsField(field, value) {
  if (['earth', 'insulation', 'leakage'].indexOf(field) === -1) return;
  if (!state.readingsDraft) state.readingsDraft = { class: state.lastReadingsClass || READING_CLASS_DEFAULT, earth: '', insulation: '', leakage: '', polarity: false };
  state.readingsDraft[field] = value;
  // No render — the input already holds the text; re-rendering would steal focus.
}

// v54: toggle the Class I polarity checkbox on the readings sheet. Unlike the
// numeric fields this DOES re-render (it's a tap, not typing — no focus to
// lose, and the checkbox visual needs to flip). Guarded to polarity-eligible
// classes so it can never set a tick on a Class II/III draft even if the action
// somehow fires while the control is hidden.
function toggleReadingsPolarity() {
  if (!state.readingsDraft) state.readingsDraft = { class: state.lastReadingsClass || READING_CLASS_DEFAULT, earth: '', insulation: '', leakage: '', polarity: false };
  const cls = state.readingsDraft.class;
  if (READING_POLARITY_CLASSES.indexOf(cls) === -1) return;
  state.readingsDraft.polarity = !state.readingsDraft.polarity;
  render();
}

// v53: OK on the readings sheet — build the readings object (only fields that
// apply to the chosen class AND were actually filled in) and commit via saveItem.
// Readings are optional even when the feature is on (locked decision): an
// all-blank sheet commits a pass/fail with just the class (or nothing) — never
// blocked. lastReadingsClass is remembered for the next item.
function commitReadingsSheet() {
  const draft = state.readingsDraft || {};
  const cls = (READING_CLASSES.indexOf(draft.class) !== -1) ? draft.class : READING_CLASS_DEFAULT;
  const applicable = READING_FIELDS_BY_CLASS[cls] || [];
  const readings = { class: cls };
  applicable.forEach(k => {
    const v = (typeof draft[k] === 'string') ? draft[k].trim() : '';
    if (v) readings[k] = v;
  });
  // v54: polarity — write true only when the class supports it AND it's ticked.
  // Absent/false otherwise (kept off the object entirely so a clean item stays
  // byte-identical to the v53 shape; emit-only-if-used everywhere downstream).
  if (READING_POLARITY_CLASSES.indexOf(cls) !== -1 && draft.polarity === true) {
    readings.polarity = true;
  }
  state.lastReadingsClass = cls;

  const result = state.readingsPendingResult || 'pass';
  // Close the sheet BEFORE saving — saveItem → loadFormForCursor clears transient
  // entry state, and refreshEntryAfterLog re-renders the entry screen without it.
  closeReadingsSheetState();
  saveItem(result, readings);
  // saveItem persists + refreshes; nothing else to do.
}

// v53: cancel the readings sheet. The PASS/FAIL was NOT committed — we return to
// the entry screen with the form intact so the engineer can retry or change the
// result. (For a fail, the reason that was appended to notes in pickFailReason
// stays on the form; cancelling readings doesn't unwind that text — the engineer
// can clear it if they back out entirely. Kept simple deliberately.)
function cancelReadingsSheet() {
  closeReadingsSheetState();
  render();
}

// v53: reset all transient readings-sheet state. Called on commit, on cancel,
// and from loadFormForCursor()/setView() so navigating away never leaves the
// sheet half-open (same discipline as failModalOpen / multiPickSheetOpen).
function closeReadingsSheetState() {
  state.readingsSheetOpen = false;
  state.readingsSheetMode = 'pass';
  state.readingsPendingResult = null;
  state.readingsPendingFailReason = null;
  state.readingsDraft = { class: state.lastReadingsClass || READING_CLASS_DEFAULT, earth: '', insulation: '', leakage: '', polarity: false };
}


function copyLastResult() {
  const sess = activeSession();
  if (!sess || sess.items.length === 0) return;
  if (sess.locked) return;   // v8
  const err = validateBeforeSave({ skipItemType: true });
  if (err) { showToast(err); return; }
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
    // v17: stamp on first save (append). v61: unconditional — see saveItem and
    // the capture/exposure note in config.js. Copy-last is a genuine first log
    // of a new item, so it stamps exactly like any other.
    item.ts = new Date().toISOString();
    sess.items.push({ id: uid(), ...item });
    // v18: learn the copied (location, type) pairing as a fresh log.
    recordSqpUsage(item.location, item.itemType);
  }
  markSessionDirty(sess);   // v14
  state.cursor++;
  // v65 (decision 6B): copy-last takes its asset number from the form too
  // (`state.form.assetNo.trim() || nextAssetNo(sess)` above), so a scanned
  // number can be logged through this path and the same carry-forward applies.
  state.lastLogWasScanned = !!state.scanFilledAsset;
  state.lastScanSessionId = state.lastLogWasScanned ? sess.id : '';
  loadFormForCursor();
  // v19 (efficiency item 4): lightweight entry-only refresh (see saveItem).
  // v23 (E2): hot path — sessions blob plus the one cold key this can touch on
  // append (learned SQP history). copyLastResult never adds a new description
  // (it reuses the previous item's type), so descriptions can't change here.
  saveSessions(); saveSqpHistory();
  refreshEntryAfterLog();
}

function deleteItem(idx) {
  const sess = activeSession();
  if (!sess) return;
  // v62: sweep this item's photos BEFORE the splice — afterwards its id is gone
  // and the photos would be orphaned in IndexedDB with nothing pointing at them.
  // Same before-the-removal ordering rule as v59's archiveSessionStats().
  const going = sess.items[idx];
  if (going && going.id) photosDeleteForItem(going.id);
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
  // v23 (E2): hot path — deleting an item changes only the sessions blob; no
  // settings key is touched, so saveSessions() alone is correct here.
  saveSessions(); render();
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
  state.presetSheetOpen = false;      // v47
  closeReadingsSheetState();          // v53
  discardPendingPhotos();             // v62
  closePhotoStripState();             // v62
  // v67: the asset-box keyboard escape hatch. It only exists on the entry
  // screen, so leaving it must not leave the flag set — coming back would show
  // a typing-mode field with no memory of having asked for one.
  state.scanKeyboardOn = false;
  // v61: the asset-history sheet lives on the Sessions screen; leaving that
  // screen must not leave it armed to reappear on the way back.
  state.assetHistorySheetOpen = false;
  state.assetHistoryAsset = '';
  state.bulkLocationDialogOpen = false;
  state.bulkLocationValue = '';
  // v11: also clear the new bulk-edit menu + sub-dialog state.
  state.bulkEdit.menuOpen = false;
  state.bulkEdit.mode = null;
  state.bulkEdit.typeValue = '';
  state.bulkEdit.notesValue = '';
  state.bulkEdit.notesMode = 'replace';
  // v19: clear the Clients page add/rename sheets on any view change so an open
  // dialog can't leak across pages. The expanded-client accordion can persist
  // harmlessly.
  state.clientsPage.clientDialog = { mode: null, name: '', editingId: null };
  state.clientsPage.siteDialog = { mode: null, name: '', editingId: null, clientId: null };
  // v39: close the New Session form on any view change too. Previously its open
  // flag (newForm.show) persisted, so navigating away and back to Sessions left
  // the form still showing. This mirrors the nf-cancel reset, keeping it in step
  // with the rest of the dialog-clearing this function already does.
  state.newForm.show = false;
  state.newFormError = '';
  state.nfSuggestions = []; state.showNfSuggestions = false; state.nfActiveField = null;
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

function applyBulkLocation() {
  const sess = activeSession();
  if (!sess) return;
  const newLoc = normaliseLocation(state.bulkLocationValue);
  if (!newLoc) {
    showToast('Please enter a location');
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
  showToast(`Updated location on ${count} item${count === 1 ? '' : 's'}`);
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
    showToast('Please enter or pick an item type');
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
  showToast(`Updated type on ${count} item${count === 1 ? '' : 's'}`);
}

function applyBulkNotes() {
  const sess = activeSession();
  if (!sess) return;
  const text = String(state.bulkEdit.notesValue || '').trim();
  const mode = state.bulkEdit.notesMode === 'append' ? 'append' : 'replace';
  // Allow an empty value ONLY in replace mode (i.e. "clear notes on these
  // items"). In append mode an empty string is a no-op and we should bounce.
  if (!text && mode === 'append') {
    showToast('Please enter some text to append');
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
  showToast(`${verb} notes on ${count} item${count === 1 ? '' : 's'}`);
}

function applyBulkDelete() {
  const sess = activeSession();
  if (!sess) return;
  const n = state.selectedIndices.length;
  if (n === 0) return;
  openConfirmSheet({
    title: 'Delete items?',
    message: `Delete ${n} item${n === 1 ? '' : 's'}? This can't be undone.`,
    confirmLabel: 'Delete',
    onConfirm: () => {
      // Sort descending so splicing doesn't shift the remaining indices.
      const indices = state.selectedIndices.slice().sort((a, b) => b - a);
      // v62: collect the ids and sweep their photos BEFORE splicing — reading
      // them afterwards would be reading items that no longer exist.
      const goingIds = indices.map(i => sess.items[i] && sess.items[i].id).filter(Boolean);
      if (goingIds.length) photosDeleteForItems(goingIds);
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
      showToast(`Deleted ${n} item${n === 1 ? '' : 's'}`);
    }
  });
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
    locked: !!sess.locked,   // v8
    instrumentId: sess.instrumentId || ''   // v66
  };
  state.view = 'editSession';
  render();
}

function saveSessionEdits() {
  const sess = activeSession();
  if (!sess) return;
  const { name, site, engineer, prefix, date, locked, instrumentId } = state.editForm;
  if (!String(site).trim()) {
    showToast('Site is required');
    return;
  }
  sess.name = String(name).trim() || sess.name;
  sess.site = String(site).trim();
  // v19: clientId/siteId refs are convenience-only and never drive display, CSV,
  // or search (the `site` text snapshot does). We intentionally leave them as set
  // at creation — editing the site text here won't and needn't update them.
  sess.engineer = String(engineer).trim();
  sess.prefix = String(prefix).trim();
  sess.date = date || sess.date;
  sess.locked = !!locked;   // v8
  // v66: the per-session instrument stamp (decision 2A).
  // ⚠ The snapshot describes the PREVIOUS stamp and nothing else, so it is
  // dropped whenever the stamp actually changes — unconditionally. An earlier
  // draft only dropped it when the new id resolved to a live instrument; that
  // guard turned out to protect nothing reachable (the only way to keep a dead
  // id is to leave the stamp alone, which this branch already skips) while
  // leaving orphaned data behind when the user chose "whichever I'm using now".
  // Mutation testing is what surfaced it — the guard could be deleted with every
  // assertion still green.
  const newInstId = String(instrumentId || '');
  if (newInstId !== String(sess.instrumentId || '')) {
    sess.instrumentId = newInstId;
    delete sess.instrumentSnapshot;
  }
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
  // v66: the tester make/model and calibration inputs are GONE from this page —
  // they moved to the per-instrument editor (renderSettingsInstrument in
  // instruments.js), which saves itself. The five flat state fields are now a
  // mirror of the active instrument and must never be written from here, or the
  // next syncActiveInstrumentMirror() would overwrite the write anyway.
  save();
  setView('settings');
}

// ---------- v30: Report Settings ----------

// Read the report-settings text inputs currently in the DOM into state. Used
// before any toggle-driven re-render so unsaved text isn't lost, and as the
// first half of the Save handler. Guards each lookup so it's safe to call when
// some fields aren't present.
function captureReportTextInputs() {
  const rs = state.reportSettings;
  const name = document.getElementById('report-company-name');
  const addr = document.getElementById('report-company-address');
  const title = document.getElementById('report-title');
  const decl = document.getElementById('report-declaration-text');
  const months = document.getElementById('report-retest-months');
  const fnpat = document.getElementById('report-filename-pattern');
  const certPrefix = document.getElementById('report-cert-prefix');
  const certPad = document.getElementById('report-cert-padding');
  const certNext = document.getElementById('report-cert-next');
  if (name) rs.companyName = name.value.trim();
  if (addr) rs.companyAddress = addr.value.replace(/\s+$/, '');
  if (title) rs.reportTitle = title.value.trim() || 'Portable Appliance Test Report';
  if (decl) rs.declarationText = decl.value.trim();
  if (fnpat) rs.reportFilenamePattern = fnpat.value.trim() || REPORT_FILENAME_DEFAULT;
  // v36: certificate-number fields.
  if (certPrefix) rs.certPrefix = certPrefix.value;
  if (certPad) {
    const p = parseInt(certPad.value, 10);
    rs.certPadding = (Number.isFinite(p) && p >= 0 && p <= 10) ? p : rs.certPadding;
  }
  if (certNext) {
    const nx = parseInt(certNext.value, 10);
    rs.certNextNumber = (Number.isFinite(nx) && nx >= 1) ? nx : rs.certNextNumber;
  }
  if (months) {
    const m = parseInt(months.value, 10);
    rs.retestMonths = (Number.isFinite(m) && m >= 1 && m <= 120) ? m : null;
  }
}

// Save handler for the Report Settings page. Captures the text inputs (toggles
// are already live in state) and persists. If retest is on but no valid month
// value was entered, we turn retest off rather than print a meaningless date.
function saveReportSettingsForm() {
  captureReportTextInputs();
  const rs = state.reportSettings;
  if (rs.retestEnabled && rs.retestMonths == null) {
    rs.retestEnabled = false;
    showToast('Retest needs a period in months (1–120) — left off for now');
  }
  saveReportSettings();
  // v35: if we came from the report preview's "Edit settings" deep-link, Save
  // returns straight to a freshly-rebuilt preview instead of the settings hub.
  if (state.reportPreviewReturnSessionId) {
    const sid = state.reportPreviewReturnSessionId;
    state.reportPreviewReturnSessionId = null;
    setView('reports');
    reopenReportPreview(sid);
    return;
  }
  setView('settings');
}

// Logo upload: read the chosen image, downscale its longest edge to
// REPORT_LOGO_MAX_PX via a canvas, and store the result as a base64 data URL on
// reportSettings.logo. Runs entirely in the browser (no network). Errors surface
// inline via state.reportSettingsError. Capture text inputs first so an in-
// progress edit survives the post-load re-render.
function handleReportLogoFile(file) {
  state.reportSettingsError = '';
  if (!file) return;
  if (!/^image\/(png|jpeg)$/.test(file.type)) {
    state.reportSettingsError = 'Please choose a PNG or JPEG image.';
    render();
    return;
  }
  captureReportTextInputs();
  // v42: if the logo is being added during first-run onboarding, also capture the
  // wizard's own company-name field so it survives this handler's render().
  if (!state.onboardedV33Seen && typeof captureWizardStep === 'function') captureWizardStep();
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxPx = (typeof REPORT_LOGO_MAX_PX === 'number') ? REPORT_LOGO_MAX_PX : 600;
        let { width, height } = img;
        if (width > maxPx || height > maxPx) {
          const scale = maxPx / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const cx = canvas.getContext('2d');
        cx.drawImage(img, 0, 0, width, height);
        // PNG preserves logo transparency; JPEG sources still export fine as PNG.
        state.reportSettings.logo = canvas.toDataURL('image/png');
        state.reportSettingsError = '';
        saveReportSettings();
      } catch (err) {
        state.reportSettingsError = 'Could not process that image. Try a different file.';
      }
      render();
    };
    img.onerror = () => { state.reportSettingsError = 'Could not read that image.'; render(); };
    img.src = e.target.result;
  };
  reader.onerror = () => { state.reportSettingsError = 'Could not read that file.'; render(); };
  reader.readAsDataURL(file);
}

// ---------- v34: report signature (draw OR upload) ----------
// Shared store path. Takes a source <img> or <canvas>, downscales the longest
// edge to REPORT_SIGNATURE_MAX_PX, and stores a PNG data URL on
// reportSettings.signature. Both the upload handler and the draw-pad save call
// this so a drawn and an uploaded signature obey the same size cap and end up
// as the identical string shape (which is what makes backup/setup round-trip
// "for free"). Returns true on success.
function storeSignatureFromSource(src, srcW, srcH) {
  try {
    const maxPx = (typeof REPORT_SIGNATURE_MAX_PX === 'number') ? REPORT_SIGNATURE_MAX_PX : 400;
    let width = srcW, height = srcH;
    if (width > maxPx || height > maxPx) {
      const scale = maxPx / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const cx = canvas.getContext('2d');
    cx.drawImage(src, 0, 0, width, height);
    state.reportSettings.signature = canvas.toDataURL('image/png');
    state.reportSettingsError = '';
    saveReportSettings();
    return true;
  } catch (err) {
    state.reportSettingsError = 'Could not process that signature. Try again.';
    return false;
  }
}

// Upload path — mirrors handleReportLogoFile exactly.
function handleReportSignatureFile(file) {
  state.reportSettingsError = '';
  if (!file) return;
  if (!/^image\/(png|jpeg)$/.test(file.type)) {
    state.reportSettingsError = 'Please choose a PNG or JPEG image.';
    render();
    return;
  }
  captureReportTextInputs();
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => { storeSignatureFromSource(img, img.width, img.height); render(); };
    img.onerror = () => { state.reportSettingsError = 'Could not read that image.'; render(); };
    img.src = e.target.result;
  };
  reader.onerror = () => { state.reportSettingsError = 'Could not read that file.'; render(); };
  reader.readAsDataURL(file);
}

// Remove the stored signature.
function removeReportSignature() {
  captureReportTextInputs();
  state.reportSettings.signature = '';
  saveReportSettings();
  render();
}

// Position toggle ('left' | 'right').
function setSignaturePosition(pos) {
  captureReportTextInputs();
  state.reportSettings.signaturePosition = (pos === 'right') ? 'right' : 'left';
  saveReportSettings();
  render();
}

// ----- Draw pad -----
// Open/close the bottom-sheet pad. Opening captures any in-progress text edits
// first (the pad triggers a re-render) and resets the ink flag.
function openSignaturePad() {
  captureReportTextInputs();
  state.signaturePadOpen = true;
  state.signaturePadHasInk = false;
  render();
}
function closeSignaturePad() {
  state.signaturePadOpen = false;
  state.signaturePadHasInk = false;
  render();
}

// Save whatever has been drawn. Reads the live pad canvas, trims nothing (keeps
// it simple + reliable), stores via the shared path, then closes the sheet.
// Guarded by signaturePadHasInk in the UI so this is only reachable with strokes.
function saveDrawnSignature() {
  const canvas = document.getElementById('sig-pad-canvas');
  if (!canvas) { closeSignaturePad(); return; }
  // The canvas backing store may be DPR-scaled; storeSignatureFromSource copies
  // it through its own downscale so the saved PNG respects REPORT_SIGNATURE_MAX_PX.
  const ok = storeSignatureFromSource(canvas, canvas.width, canvas.height);
  state.signaturePadOpen = false;
  state.signaturePadHasInk = false;
  if (!ok) { render(); return; }
  render();
}
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
    showToast('Tick at least one column before saving');
    return;
  }
  state.csvColumns = next;
  ensureAllCsvColumns();
  save();
  setView('settings');
}

function resetCsvColumnsSettings() {
  openConfirmSheet({
    title: 'Reset CSV columns?',
    message: 'This restores the original 8-column order, default header names, and shows all columns. Cannot be undone.',
    confirmLabel: 'Reset',
    onConfirm: () => {
      state.csvColumns = DEFAULT_CSV_COLUMNS.map(c => ({ ...c }));
      save();
      render();
      showToast('CSV columns reset');
    }
  });
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

// v50: ONE parameterised welcome-dismiss, replacing the 17 near-identical
// dismissVNNWelcome functions that had accumulated since v12. Sets the seen
// flag in state and persists the matching key so the modal never reappears,
// then re-renders to clear it from view. The current welcome is V49; future
// feature releases pass their own (flag, key) pair and reuse this function.
function dismissWelcome(seenFlag, key) {
  state[seenFlag] = true;
  localStorage.setItem(key, '1');
  render();
}

// ---------- v36: job notes, certificate override, report templates ----------

// Save the per-session job note (from the Overview text area). Persists and
// re-renders. Empty is fine (clears the note).
function saveSessionNotes(sessionId, text) {
  const s = state.sessions.find(x => x.id === sessionId);
  if (!s) return;
  s.notes = String(text || '').trim();
  save();
}

// Manual certificate-number override (A3). Sets the session's certNo to a
// user-supplied value; warns (but allows) if it duplicates another session's.
// Empty clears it (so the next report re-stamps from the counter).
function setSessionCertNo(sessionId, value) {
  const s = state.sessions.find(x => x.id === sessionId);
  if (!s) return;
  const v = String(value || '').trim();
  const commit = () => { s.certNo = v; save(); render(); };
  if (v) {
    const dupe = state.sessions.some(x => x.id !== sessionId && x.certNo === v);
    if (dupe) {
      openConfirmSheet({
        title: 'Duplicate certificate number',
        message: `Certificate number "${v}" is already used by another session. Use it anyway?`,
        confirmLabel: 'Use it',
        danger: false,
        onConfirm: commit
      });
      return;
    }
  }
  commit();
}

// Apply a saved template (C1=B: a full reportSettings snapshot). Overwrites the
// live reportSettings — including branding — so we confirm first, naming the
// template. The applied snapshot is re-normalised defensively.
function applyReportTemplate(templateId) {
  const tpl = (state.reportTemplates || []).find(t => t.id === templateId);
  if (!tpl) return;
  openConfirmSheet({
    title: 'Apply template?',
    message: `Apply the "${tpl.name}" template? This replaces your current report settings (including logo, signature and colours).`,
    confirmLabel: 'Apply',
    danger: false,
    onConfirm: () => {
      state.reportSettings = normaliseReportSettings(tpl.settings);
      saveReportSettings();
      render();
      showToast(`Applied "${tpl.name}"`);
    }
  });
}

// Save the CURRENT live reportSettings as a new named template, or overwrite an
// existing one of the same name. Prompts for a name via a bottom-sheet-free
// simple prompt fallback is avoided — name is passed in from the UI handler.
function saveCurrentAsTemplate(name) {
  const nm = String(name || '').trim();
  if (!nm) return;
  const snapshot = normaliseReportSettings(state.reportSettings);
  const existing = (state.reportTemplates || []).find(t => t.name.toLowerCase() === nm.toLowerCase());
  if (existing) {
    existing.settings = snapshot;
  } else {
    state.reportTemplates.push({
      id: 'tpl_' + Math.random().toString(36).slice(2, 9),
      name: nm,
      settings: snapshot
    });
  }
  saveReportTemplates();
  render();
  showToast(existing ? `Updated "${nm}"` : `Saved "${nm}"`);
}

function renameReportTemplate(templateId, name) {
  const tpl = (state.reportTemplates || []).find(t => t.id === templateId);
  const nm = String(name || '').trim();
  if (!tpl || !nm) return;
  tpl.name = nm;
  saveReportTemplates();
  render();
  showToast('Template renamed');
}

// v40: delete the template (no native confirm here — the confirm sheet in
// dispatch.js gates this; this is the data operation only).
function deleteReportTemplate(templateId) {
  const tpl = (state.reportTemplates || []).find(t => t.id === templateId);
  if (!tpl) return;
  state.reportTemplates = state.reportTemplates.filter(t => t.id !== templateId);
  saveReportTemplates();
  render();
  showToast('Template deleted');
}

// ---------- First-run wizard (v33; commercial onboarding rebuilt in v42) ----------
// Shown only on a genuinely blank install (gated in storage.load via
// state.onboardedV33Seen). v42 turns the old 3-step screen into a proper guided
// commercial setup, FRESH path:
//   1 intro → 2 choose path → 3 your details → 4 company / report branding
//   → 5 add an example session? → 6 all set (offer the walkthrough)
// The IMPORT path still jumps straight out (onboardSetupImport). Skippable at
// every step. Completing or skipping sets ONBOARD_KEY so it never returns.
// ONBOARD_KEY is unchanged (pat:onboardedV33) so an upgrading user who already
// passed the old wizard is NOT re-onboarded.
const WIZARD_LAST_STEP = 6;   // fresh-path final step (the "all set" screen)

// Capture whatever the CURRENT step's inputs hold into state, so paging back and
// forward (or finishing) never loses what was typed. Called before any step
// transition. Each lookup is guarded, so it is safe on any step.
function captureWizardStep() {
  const nameEl = document.getElementById('wizard-engineer');
  const calEl  = document.getElementById('wizard-caldate');
  const coEl   = document.getElementById('wizard-company');
  if (nameEl) {
    state.engineer = (nameEl.value || '').trim();
    state.newForm.engineer = state.engineer;
  }
  // v66: the wizard is a LEGACY WRITER of the flat mirror — it still sets
  // state.calDate directly, so it must push that into the instruments list or
  // the next sync silently discards it.
  if (calEl && calEl.value) {
    state.calDate = calEl.value;
    if (typeof adoptMirrorIntoInstruments === 'function') adoptMirrorIntoInstruments();
  }
  if (coEl && state.reportSettings) state.reportSettings.companyName = coEl.value.trim();
}

// Mark onboarding finished (completed or skipped) and drop into the app.
function finishOnboarding() {
  state.onboardedV33Seen = true;
  localStorage.setItem(ONBOARD_KEY, '1');
  state.wizardStep = 1;
  state.wizardPath = '';
  state.wizardSeedDemo = false;
  state.view = 'sessions';
  render();
}

// Skip from any step — same as finishing, no data captured beyond what the user
// already committed on earlier steps (their typed name/company survive because
// each step is captured on transition; a skip just stops asking for more).
function skipOnboarding() {
  finishOnboarding();
}

// Step 2 records the chosen path; "import" opens the picker (handled in dispatch
// via the hidden input), "fresh" advances into the guided setup at step 3.
function wizardChoosePath(path) {
  state.wizardPath = path;
  if (path === 'fresh') {
    state.wizardStep = 3;
    render();
  }
  // 'import' is handled by the file input in dispatch; nothing to render here.
}

// Forward one step on the fresh path (steps 3→4→5→6). Captures the current
// step's inputs first. Step 6 is the terminal "all set" screen — wizardNext from
// there is not wired (finish/tour buttons take over).
function wizardNextStep() {
  captureWizardStep();
  if (state.wizardStep < WIZARD_LAST_STEP) state.wizardStep += 1;
  render();
}

function wizardBack() {
  captureWizardStep();
  if (state.wizardStep <= 1) return;
  // From step 3 (first fresh step) back lands on the path chooser (step 2) and
  // clears the chosen path so the chooser shows fresh. From any later fresh step
  // just step back one.
  if (state.wizardStep === 3) {
    state.wizardStep = 2;
    state.wizardPath = '';
  } else {
    state.wizardStep -= 1;
  }
  render();
}

// Step 5 toggle: include an example session on finish (decision 9A).
function wizardToggleDemo(on) {
  state.wizardSeedDemo = !!on;
}

// Apply the branding theme chip on step 4 (reuses the report colour themes). In
// memory only here; persisted by save() at finish. Captures the company-name
// input first so it survives the re-render the chip selection triggers.
function wizardPickTheme(themeId) {
  captureWizardStep();
  const theme = (typeof REPORT_COLOR_THEMES !== 'undefined' ? REPORT_COLOR_THEMES : [])
    .find(t => t.id === themeId);
  if (theme && state.reportSettings) {
    state.reportSettings.headerColor = theme.header;
    state.reportSettings.accentColor = theme.accent;
  }
  render();
}

// Finish the FRESH guided setup. Captures the final step, persists everything,
// optionally seeds the example session, then either opens the walkthrough (7A:
// "Show me around") or drops the user on the Sessions list. `withTour` true =>
// open the tour after onboarding completes.
function wizardFinishFresh(withTour) {
  captureWizardStep();
  // Seed the example session BEFORE finishing so it exists when we land/tour.
  if (state.wizardSeedDemo) seedDemoSession();
  save();                 // persists engineer, calDate, reportSettings (branding)
  finishOnboarding();     // sets ONBOARD_KEY, resets wizard, view = sessions, renders
  if (withTour) openTour();
}

// Setup import launched from the wizard. Reuses the standard importSetupFromFile
// (validate, confirm, apply, save), but marks onboarding complete first so the
// user lands in the app rather than the wizard after import. Only called once a
// file is actually chosen (cancelling the OS picker leaves onboarding pending).
function onboardSetupImport(file) {
  if (!file) return;
  state.onboardedV33Seen = true;
  localStorage.setItem(ONBOARD_KEY, '1');
  state.wizardStep = 1;
  state.wizardPath = '';
  state.wizardSeedDemo = false;
  importSetupFromFile(file);   // handles confirm/apply/save/render itself
}

// "Run first-time setup again" (Help). Clears the flag and reopens the wizard.
function restartOnboarding() {
  state.onboardedV33Seen = false;
  localStorage.removeItem(ONBOARD_KEY);
  state.wizardStep = 1;
  state.wizardPath = '';
  state.wizardSeedDemo = false;
  render();
}

// ---------- v42: example (demo) session seed ----------
// Builds ONE clearly-labelled example session so a brand-new fresh install isn't
// empty on first open (decision 9A). It is an ordinary session in every respect
// — same shape as createSession() produces — plus the DEMO_SESSION_FLAG marker
// (a harmless passthrough field the codec/CSV/report/backup ignore) so the UI
// can label it "Example" and the user knows it is safe to delete. Items mirror
// the saveItem() shape exactly ({id, assetNo, location, itemType, notes,
// result, ts?}) so Overview, CSV and reports all render it like real data.
function seedDemoSession() {
  const eng = (state.engineer || '').trim();
  // v61: the demo items stamp unconditionally too, so the example job matches
  // the shape of real data (and so a brand-new user's first look at the Session
  // settings screen shows a testing time rather than a gap).
  const stamp = new Date().toISOString();
  const now = new Date().toISOString();
  const mk = (assetNo, location, itemType, result, notes) => {
    const it = { id: uid(), assetNo, location, itemType, notes: notes || '', result };
    if (stamp) it.ts = stamp;
    return it;
  };
  const s = {
    id: uid(),
    name: 'Example job',
    site: 'Example Client — Example Site',
    clientId: '',
    siteId: '',
    engineer: eng,
    prefix: '',
    date: todayISO(),
    startNumber: 1,
    items: [
      mk('001', 'Kitchen', 'Kettle', 'pass'),
      mk('002', 'Kitchen', 'Toaster', 'pass'),
      mk('003', 'Office', 'Monitor', 'pass'),
      mk('004', 'Office', 'Extension lead', 'fail', 'Damaged outer sheath'),
      mk('005', 'Office', 'Desk lamp', 'pass')
    ],
    locked: false,
    notes: 'This is an example session to show how the app works. Delete it any time.',
    certNo: '',
    [DEMO_SESSION_FLAG]: true,
    // v43: sync metadata for demo session
    userId: null,
    lastModified: now,
    syncedAt: null
  };
  state.sessions.unshift(s);
  // No activeId/cursor change and no nav — the user lands on the Sessions list
  // (or the tour) and can tap in when ready. saveSessions runs via save() in the
  // finish path.
}

// ---------- v31: Export/Import Setup UI handlers ----------

// Toggle the "Choose what to include" disclosure on the Backup page.
function toggleSetupIncludeOpen() {
  state.setupIncludeOpen = !state.setupIncludeOpen;
  state.setupError = '';
  render();
}

// Tick/untick one include section. `on` comes from the checkbox.
function setSetupInclude(sectionId, on) {
  if (!state.setupInclude) state.setupInclude = {};
  state.setupInclude[sectionId] = !!on;
  state.setupError = '';
  // No full re-render needed (the checkbox reflects itself), but keep state and
  // the disclosure open. A light re-render keeps the markup authoritative.
}

// Insert a filename token into the report filename pattern field at the caret
// (falls back to appending). Updates state so a subsequent render keeps it.
function insertReportFilenameToken(token) {
  const inp = document.getElementById('report-filename-pattern');
  if (!inp) return;
  const start = (typeof inp.selectionStart === 'number') ? inp.selectionStart : inp.value.length;
  const end = (typeof inp.selectionEnd === 'number') ? inp.selectionEnd : inp.value.length;
  const v = inp.value;
  inp.value = v.slice(0, start) + token + v.slice(end);
  // Keep the field's settings in step so Save (which reads the DOM) is correct.
  state.reportSettings.reportFilenamePattern = inp.value.trim() || REPORT_FILENAME_DEFAULT;
  // Restore caret just after the inserted token.
  const pos = start + token.length;
  try { inp.focus(); inp.setSelectionRange(pos, pos); } catch (e) {}
}

// Share setup. Builds a default name from the company name (if set) and opens a
// small bottom sheet to confirm/edit it, then shares. At least one section must
// be ticked. Built directly in the DOM (like the report preview) so it overlays
// without a view change and works reliably in the iOS PWA.
function startShareSetup() {
  const inc = state.setupInclude || {};
  const anyOn = SETUP_SECTIONS.some(s => inc[s.id]);
  if (!anyOn) {
    state.setupError = 'Pick at least one thing to include before sharing.';
    state.setupIncludeOpen = true;
    render();
    return;
  }
  state.setupError = '';
  const company = (state.reportSettings && state.reportSettings.companyName || '').trim();
  const defaultName = company ? `${company} setup` : 'PAT setup';

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.style.zIndex = '300';
  const sheet = document.createElement('div');
  sheet.className = 'bulk-sheet';
  sheet.style.zIndex = '301';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Name this setup');
  const included = SETUP_SECTIONS.filter(s => inc[s.id]).map(s => s.label);
  sheet.innerHTML = `
    <div class="bulk-sheet-handle"></div>
    <div class="bulk-sheet-header">
      <span class="fail-close-spacer"></span>
      <h3 class="bulk-sheet-title">Name this setup</h3>
      <button class="fail-close-btn" id="setup-name-cancel" aria-label="Cancel">×</button>
    </div>
    <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:var(--text-muted)">Give this setup a name so it's easy to recognise when importing it later.</p>
    <input class="input" id="setup-name-input" value="${escapeHTML(defaultName)}" autocapitalize="on" autocomplete="off" maxlength="60">
    <p style="margin:12px 0 4px;font-size:12px;color:var(--text-muted)">Includes: ${escapeHTML(included.join(', '))}</p>
    <button class="btn-primary" id="setup-name-share" style="margin-top:12px">Share</button>
  `;

  function cleanup() { backdrop.remove(); sheet.remove(); }
  backdrop.addEventListener('click', cleanup);
  document.getElementById && document.body.appendChild(backdrop);
  document.body.appendChild(sheet);
  const cancelBtn = document.getElementById('setup-name-cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', cleanup);
  const shareBtn = document.getElementById('setup-name-share');
  if (shareBtn) shareBtn.addEventListener('click', async () => {
    const inp = document.getElementById('setup-name-input');
    const label = inp ? inp.value.trim() : defaultName;
    cleanup();
    await shareSetup(label || defaultName, state.setupInclude);
  });
  const nameInput = document.getElementById('setup-name-input');
  if (nameInput) { try { nameInput.focus(); nameInput.select(); } catch (e) {} }
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
  openConfirmSheet({
    title: 'Reset preset?',
    message: `Reset preset "${p.name}" to default items? This replaces the current list with the 9 built-in defaults. Other presets are not affected.`,
    confirmLabel: 'Reset',
    onConfirm: () => {
      p.items = DEFAULT_ITEM_TYPES.slice();
      syncItemTypesFromActivePreset();
      save();
      render();
      showToast('Preset reset to defaults');
    }
  });
}

function resetFailReasonsToDefaults() {
  openConfirmSheet({
    title: 'Reset fail reasons?',
    message: 'Reset Quick Pick Fail to the built-in default reasons? This replaces the current list.',
    confirmLabel: 'Reset',
    onConfirm: () => {
      state.failReasons = DEFAULT_FAIL_REASONS.slice();
      save();
      render();
      showToast('Fail reasons reset');
    }
  });
}

function resetDescriptionsToDefaults() {
  openConfirmSheet({
    title: 'Reset descriptions?',
    message: 'Reset the Item Description List to the built-in defaults? This replaces the current list. Items already saved in past sessions are unaffected.',
    confirmLabel: 'Reset',
    onConfirm: () => {
      state.descriptions = DEFAULT_DESCRIPTIONS.slice();
      save();
      render();
      showToast('Descriptions reset');
    }
  });
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

// v17: item timestamps on/off.
// v61: this NO LONGER GATES CAPTURE. `ts` is now stamped on every item's first
// log regardless of this flag (see saveItem and the note in config.js); the flag
// gates EXPOSURE only — the Time line under an item in the Overview, and the
// Time column in the CSV. Existing items are untouched either way: turning it on
// doesn't backfill anything, turning it off doesn't strip stamps already
// recorded. Nothing here needed to change for v61 — this comment did, because
// the old one now describes behaviour the app no longer has.
function setTimestamps(enabled) {
  state.timestampsEnabled = !!enabled;
  save();
}
