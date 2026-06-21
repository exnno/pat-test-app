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
  state.presetSheetOpen = false;      // v47
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
    // v18: learn this (location, type) pairing on first log (pass OR fail — a
    // failed item still belongs to that location). No-op when SQP is off.
    recordSqpUsage(cleanLocation, cleanType);
  }
  markSessionDirty(sess);   // v14: edits invalidate a prior export
  addDescriptionIfNew(cleanType);
  state.cursor++;
  loadFormForCursor();
  // v19 (efficiency item 4): on the entry screen with no modal open (the state
  // after any save — pass, fail-commit, or edit-overwrite), use the lightweight
  // entry-only refresh. refreshEntryAfterLog() falls back to full render() if we
  // are somehow not on the entry screen, so this is always safe.
  // v23 (E2): hot path — write the sessions blob plus only the two cold keys this
  // function can touch on append (learned SQP history, descriptions). Skips the
  // ~21 other unchanged settings keys a full save() would rewrite every tap.
  saveSessions(); saveSqpHistory(); saveDescriptions();
  refreshEntryAfterLog();
}

function passClicked() {
  // v8: belt-and-braces — UI disables the buttons when locked, but block here too.
  const sess = activeSession();
  if (sess && sess.locked) return;
  const err = validateBeforeSave();
  if (err) { showToast(err); return; }
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
    // v17: stamp on first save (append), only when timestamps are enabled.
    if (state.timestampsEnabled) item.ts = new Date().toISOString();
    sess.items.push({ id: uid(), ...item });
    // v18: learn the copied (location, type) pairing as a fresh log.
    recordSqpUsage(item.location, item.itemType);
  }
  markSessionDirty(sess);   // v14
  state.cursor++;
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

// v12: dismiss the welcome modal — sets the flag in localStorage so it
// doesn't reappear, then re-renders to clear it from view. v19: writes
// pat:v19welcome so v18 users see the modal once on update.
function dismissV19Welcome() {
  state.v19WelcomeSeen = true;
  localStorage.setItem(V19_WELCOME_KEY, '1');
  render();
}

// v26: dismiss the V26 "what's new" modal. Writes pat:v26welcome so users see
// it once on update.
function dismissV26Welcome() {
  state.v26WelcomeSeen = true;
  localStorage.setItem(V26_WELCOME_KEY, '1');
  render();
}

// v30: dismiss the V30 "what's new" modal. Writes pat:v30welcome so users see
// it once on update.
function dismissV30Welcome() {
  state.v30WelcomeSeen = true;
  localStorage.setItem(V30_WELCOME_KEY, '1');
  render();
}

function dismissV31Welcome() {
  state.v31WelcomeSeen = true;
  localStorage.setItem(V31_WELCOME_KEY, '1');
  render();
}

function dismissV32Welcome() {
  state.v32WelcomeSeen = true;
  localStorage.setItem(V32_WELCOME_KEY, '1');
  render();
}

function dismissV33Welcome() {
  state.v33WelcomeSeen = true;
  localStorage.setItem(V33_WELCOME_KEY, '1');
  render();
}

function dismissV34Welcome() {
  state.v34WelcomeSeen = true;
  localStorage.setItem(V34_WELCOME_KEY, '1');
  render();
}

function dismissV35Welcome() {
  state.v35WelcomeSeen = true;
  localStorage.setItem(V35_WELCOME_KEY, '1');
  render();
}

function dismissV36Welcome() {
  state.v36WelcomeSeen = true;
  localStorage.setItem(V36_WELCOME_KEY, '1');
  render();
}

function dismissV38Welcome() {
  state.v38WelcomeSeen = true;
  localStorage.setItem(V38_WELCOME_KEY, '1');
  render();
}

function dismissV39Welcome() {
  state.v39WelcomeSeen = true;
  localStorage.setItem(V39_WELCOME_KEY, '1');
  render();
}

function dismissV40Welcome() {
  state.v40WelcomeSeen = true;
  localStorage.setItem(V40_WELCOME_KEY, '1');
  render();
}

function dismissV41Welcome() {
  state.v41WelcomeSeen = true;
  localStorage.setItem(V41_WELCOME_KEY, '1');
  render();
}

function dismissV42Welcome() {
  state.v42WelcomeSeen = true;
  localStorage.setItem(V42_WELCOME_KEY, '1');
  render();
}

// v45: the first welcome modal wired since V42 (V43/V44 rolled none). Marks the
// V45 modal seen and persists the flag. Tying the gate/dismiss freshly to V45
// also clears the long-standing "modal still keys off v42WelcomeSeen" debt.
function dismissV45Welcome() {
  state.v45WelcomeSeen = true;
  localStorage.setItem(V45_WELCOME_KEY, '1');
  render();
}

function dismissV46Welcome() {
  state.v46WelcomeSeen = true;
  localStorage.setItem(V46_WELCOME_KEY, '1');
  render();
}

function dismissV49Welcome() {
  state.v49WelcomeSeen = true;
  localStorage.setItem(V49_WELCOME_KEY, '1');
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
  if (calEl && calEl.value) state.calDate = calEl.value;
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
  const stamp = state.timestampsEnabled ? new Date().toISOString() : undefined;
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

// v17: item timestamps on/off. Gates both capture (future items) and display.
// Existing items are untouched either way — turning it on doesn't backfill old
// items, turning it off doesn't strip stamps already recorded.
function setTimestamps(enabled) {
  state.timestampsEnabled = !!enabled;
  save();
}
