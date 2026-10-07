/*!
 * PATGo PWA
 * v70 (August 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PATGo PWA — v70 — Sessions & logic ==============
// Presets, core helpers, theme, export-state, retest reminders, pruning, form,
// validation, session/item actions, stats, duration, asset history, photo
// staging, readings sheet, bulk-edit, selection. Reads global state.
//
// v70: THIS FILE WAS SPLIT. The Settings-screen save handlers moved to
// settings-actions.js and the first-run wizard moved to onboarding.js, both
// byte identical. If you are looking for saveReportSettingsForm, setTheme,
// saveItemTypesSettings, the signature pad, the CSV column ordering, the report
// templates or anything wizard-shaped, it is in one of those two files — see
// MAP.md. What remains here is the session and item lifecycle.

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
    id: 'preset_' + newId(),
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
  recordTombstone('preset', id);   // v78: before the splice
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
    } else if (state.sessionFilter === 'remindexport') {
      // V100: the not-exported reminder's jobs (Review on its banner).
      if (!isExportReminderJob(s)) return false;
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

// ===== V100: in-app reminders (roadmap Stage 8 part 3) =====
// Three per-phone timings (state.reminders, REMINDERS_KEY — config.js) and two
// job fields: `lockedAt` (when the job was locked) and `reportAt` (when its
// certificate was last downloaded or shared). Reminders are BANNERS on the Jobs
// screen, worked out at render time from the clock — nothing is scheduled and
// nothing is stored except the × day (REMINDER_QUIET_KEY). A phone that is never
// opened is never reminded; that is what Stage 14's notifications are for.

// Every value in, a clean object out. Anything unknown falls back per field, so
// a garbage backup can never wedge a banner on or off.
function normaliseReminders(raw) {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const pick = (v, list, dflt) => { const x = String(v == null ? '' : v); return list.includes(x) ? x : dflt; };
  return {
    exportAfter: pick(r.exportAfter, REMINDER_EXPORT_CHOICES, 'off'),
    unlockedAt: pick(r.unlockedAt, REMINDER_UNLOCKED_CHOICES, 'off'),
    backupDays: pick(r.backupDays, REMINDER_BACKUP_CHOICES, String(BACKUP_REMINDER_DAYS)),
  };
}

// The backup interval in days, or 0 when switched off.
function backupReminderDays() {
  const v = normaliseReminders(state.reminders).backupDays;
  return v === 'off' ? 0 : parseInt(v, 10);
}

// The phone's own calendar day, yyyy-mm-dd. NOT todayISO(), which is the UTC day
// and would end "quiet until tomorrow" at 1 a.m. all summer.
function reminderLocalDay(ms) {
  const d = new Date(ms == null ? Date.now() : ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function _reminderQuiet() {
  let q = null;
  try { q = JSON.parse(localStorage.getItem(REMINDER_QUIET_KEY)); } catch (e) { q = null; }
  return (q && typeof q === 'object' && !Array.isArray(q)) ? q : {};
}
// × on a banner: gone for the rest of the phone's day (6A). which = 'exp' | 'unl'.
function quietReminder(which) {
  const q = _reminderQuiet();
  q[which] = reminderLocalDay();
  try { localStorage.setItem(REMINDER_QUIET_KEY, JSON.stringify(q)); } catch (e) {}
}

// A job's lock time in ms — only while it IS locked. A V99 phone unlocking a job
// leaves the field behind (it edits the job in place), so `locked` decides.
function lockedAtMs(sess) {
  if (!sess || !sess.locked || typeof sess.lockedAt !== 'string') return null;
  const ms = Date.parse(sess.lockedAt);
  return Number.isFinite(ms) ? ms : null;
}
function reportAtMs(sess) {
  if (!sess || typeof sess.reportAt !== 'string') return null;
  const ms = Date.parse(sess.reportAt);
  return Number.isFinite(ms) ? ms : null;
}

// 2B: the job's paperwork is done — a CSV export it hasn't changed since, OR a
// certificate made at or after the lock. A certificate made BEFORE locking
// doesn't count: the job could have changed between the two.
function jobPaperworkDone(sess) {
  if (exportStatus(sess) === 'exported') return true;
  const lk = lockedAtMs(sess), rp = reportAtMs(sess);
  return lk != null && rp != null && rp >= lk;
}

// When "not exported" becomes due for a job locked at lockedMs.
function exportReminderDueAt(lockedMs, mode) {
  if (mode === '1h') return lockedMs + 60 * 60 * 1000;
  if (mode === '4h') return lockedMs + 4 * 60 * 60 * 1000;
  if (mode === 'morning') {
    const d = new Date(lockedMs);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, REMINDER_MORNING_HOUR, 0, 0, 0).getTime();
  }
  return null;
}

// Is this job one the not-exported reminder is about? (Also the Jobs list's
// "Locked, not exported" filter.) Example job never; no lock time (1A) never.
function isExportReminderJob(sess, now) {
  if (!sess || sess[DEMO_SESSION_FLAG]) return false;
  const mode = normaliseReminders(state.reminders).exportAfter;
  if (mode === 'off') return false;
  const lk = lockedAtMs(sess);
  if (lk == null || jobPaperworkDone(sess)) return false;
  const due = exportReminderDueAt(lk, mode);
  return due != null && (now == null ? Date.now() : now) >= due;
}
function exportReminderJobs(now) {
  return (state.sessions || []).filter(s => isExportReminderJob(s, now));
}
// The banner: the jobs, unless × was tapped today.
function exportReminderDue(now) {
  if (_reminderQuiet().exp === reminderLocalDay(now)) return [];
  return exportReminderJobs(now);
}

// 4A: after the chosen hour, every unlocked job on this phone (not the example).
function unlockedReminderDue(now) {
  const at = normaliseReminders(state.reminders).unlockedAt;
  if (at === 'off') return [];
  const t = (now == null ? Date.now() : now);
  if (new Date(t).getHours() < parseInt(at, 10)) return [];
  if (_reminderQuiet().unl === reminderLocalDay(t)) return [];
  return (state.sessions || []).filter(s => s && !s.locked && !s[DEMO_SESSION_FLAG]);
}

// "Review" on a banner: the Jobs list, filtered to what the banner counted.
// The filter is not one of the saved choices, so a reload returns to All.
function reviewReminder(which) {
  state.sessionsSearchQuery = '';
  if (which === 'exp') { state.sessionFilter = 'remindexport'; state.lockFilter = 'all'; }
  else { state.sessionFilter = 'all'; state.lockFilter = 'unlocked'; }
}

// 2B: a certificate left the phone (downloaded or shared from the preview).
// Looked up by id at that moment — a sync may have replaced the object while
// the preview was open (sync rule 8). Written in place on a job that is often
// not the open one, so the encoding is dropped explicitly (section 6 trap; the
// signature covers reportAt as well). save() only — the preview is open.
function noteReportMade(sessionId) {
  const sess = (state.sessions || []).find(s => s && s.id === sessionId);
  if (!sess) return;
  sess.reportAt = new Date().toISOString();
  if (typeof _invalidateSessionEncoding === 'function') _invalidateSessionEncoding(sess);
  try { save(); } catch (e) {}
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
// The due MONTH is COMPUTED, never stored (single source of truth):
//   due month = month of session.date + retestMonths (V87 — was a day, see below).
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

// V87: RETEST BY MONTH (Peter, V87 spec 6/9A/11A). A retest is due for a whole
// calendar month — tested 30/09/2026 on a 12-month cycle means due September 2027.
// The chase starts on the 1st of the month BEFORE (1 August 2027): being reminded
// on 30 August about something due in September was no use. Only year+month are
// counted (monthIndexAfter, utils.js), so the pre-V87 day-of-month rollover is gone.
// Pre-V87 this was day counts (60 "due soon" / 90 "upcoming") from test date +
// months; those constants are deleted, not left unused.

// The due month as a month index (year*12 + month0), or null when not tracked.
function retestDueMonthIndex(sess) {
  if (!sess || !sess.retestTrack) return null;
  return monthIndexAfter(sess.date, Number(sess.retestMonths));
}

// Today's month index. `now` is injectable for tests.
function currentMonthIndex(now) {
  const d = now instanceof Date ? now : new Date();
  return d.getFullYear() * 12 + d.getMonth();
}

// "September 2027" for a tracked session; '' otherwise.
function retestDueLabel(sess) {
  const idx = retestDueMonthIndex(sess);
  return idx === null ? '' : formatMonthIndex(idx);
}

// Urgency bucket for a tracked session, used by the banner, the filter and the
// reminders view. The bucket NAMES are kept from v56 so the CSS classes, the
// filter and the banner need no renaming; what changed is what they mean:
//   'resolved' — engineer has booked or declined; off the active chase list.
//   'upcoming' — due NEXT month (from the 1st of the month before).  "Due next month"
//   'duesoon'  — due THIS month.                                       "Due this month"
//   'overdue'  — the due month has ended (from the 1st of the month after).
//   'later'    — tracked, but the chase hasn't started yet.
//   null       — not a tracked reminder at all.
function retestStatus(sess, now) {
  if (!sess || !sess.retestTrack) return null;
  if (sess.retestContact && (sess.retestContact.status === 'booked' || sess.retestContact.status === 'declined')) {
    return 'resolved';
  }
  const due = retestDueMonthIndex(sess);
  if (due === null) return null;
  const cur = currentMonthIndex(now);
  if (cur > due) return 'overdue';
  if (cur === due) return 'duesoon';
  if (cur === due - 1) return 'upcoming';
  return 'later';
}

// Short chip wording for a bucket (Jobs list chip and reminders view).
function retestChipLabel(status) {
  if (status === 'overdue')  return 'Retest overdue';
  if (status === 'duesoon')  return 'Retest due this month';
  if (status === 'upcoming') return 'Retest due next month';
  return '';
}

// Does a session belong on the ACTIVE chase list (banner count, reminders view,
// "Retest due" filter)? Active = tracked, unresolved, and due next month, due
// this month, or overdue (V87). 'later' and 'resolved' don't surface — they exist but stay
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
      return retestDueMonthIndex(a) - retestDueMonthIndex(b);   // earlier due month first
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
  // V91 (Stage 4, 7A): signed in, clearing old jobs is "safe in the cloud and
  // older than N months" — exported or not — and lives on the Jobs on this
  // phone screen, which syncs first and re-checks at the moment of clearing.
  // Signed out: everything below, unchanged.
  if (typeof syncActive === 'function' && syncActive() && typeof jobMgrOpen === 'function') {
    if (typeof mgrNoteReturn === 'function') mgrNoteReturn();   // V96: Back returns here
    jobMgrOpen({ tidy: true });
    return;
  }
  const candidates = prunableSessions().filter(s => s.id !== state.activeId);
  // v80 (decision 5A): while signed in to the cloud, clearing is local
  // housekeeping and the cloud keeps the job — so only a job whose LATEST
  // version is in the cloud may go; the rest wait for a push. Signed out, or
  // sync.js absent, every candidate is clearable exactly as before V80. A throw
  // falls back to that pre-V80 behaviour: the jobs are all CSV-exported, which
  // is what this page has always required before clearing.
  let targets = candidates;
  let keptForCloud = 0;
  let cloudKeepsThem = false;
  if (typeof syncPruneFilter === 'function') {
    try {
      const g = syncPruneFilter(candidates);
      if (g && Array.isArray(g.clear)) {
        targets = g.clear;
        keptForCloud = candidates.length - g.clear.length;
        cloudKeepsThem = !!g.active;
      }
    } catch (e) { console.error('Sync prune check failed; clearing as before.', e); }
  }
  if (targets.length === 0) {
    showToast(keptForCloud
      ? `${keptForCloud} old job${keptForCloud === 1 ? ' hasn\u2019t' : 's haven\u2019t'} fully reached the cloud yet (the job or its photos) \u2014 push first`
      : 'Nothing to clear');
    return;
  }
  const itemTotal = targets.reduce((n, s) => n + (s.items ? s.items.length : 0), 0);
  openConfirmSheet({
    title: 'Clear exported sessions?',
    message:
      `Clear ${targets.length} exported session${targets.length === 1 ? '' : 's'} ` +
      `(${itemTotal} item${itemTotal === 1 ? '' : 's'} in total)? ` +
      `These have all been exported to CSV and are older than ${state.pruneAgeMonths} month${state.pruneAgeMonths === 1 ? '' : 's'}. ` +
      (keptForCloud
        ? `${keptForCloud} more ${keptForCloud === 1 ? 'is' : 'are'} kept for now because the latest changes or photos haven\u2019t reached the cloud yet. `
        : '') +
      (cloudKeepsThem
        ? `This removes them from this phone. Your cloud copy keeps them.`
        : `This permanently removes them from this device and cannot be undone.`),
    confirmLabel: 'Clear',
    onConfirm: () => {
      const ids = new Set(targets.map(s => s.id));
      // v59: archive the tallies of everything about to be cleared, BEFORE the
      // filter removes them — otherwise a tidy-up would silently reduce the
      // lifetime counter. `targets` is the exact set being removed.
      archiveSessionStats(targets);
      // v62: and their photos, on the same before-the-filter rule.
      photosDeleteForSessions(Array.from(ids));
      // v80: remember which of these the cloud still holds, so the pull
      // doesn't bring them back. Not a deletion — see harness 14i / 16.
      if (typeof syncNotePruned === 'function') {
        try { syncNotePruned(Array.from(ids)); } catch (e) { console.error('Cleared-jobs note failed (non-fatal).', e); }
      }
      state.sessions = state.sessions.filter(s => !ids.has(s.id));
      save();
      render();
      showToast(`Cleared ${targets.length} session${targets.length === 1 ? '' : 's'}`);
    }
  });
}

// V91 (Stage 4): take jobs off THIS phone. The cloud and the other phones keep
// them (the job is recorded as cleared, so the pull does not bring it back).
// The CALLER has already re-checked that every id is safe in the cloud
// (syncPruneFilter, fresh) — this does no checking of its own beyond never
// touching the job on screen or the example job. Same order as the V80 clear:
// tallies and photos before the job goes (MAP rule 5), then the cleared note.
// Returns how many went.
function removeJobsFromPhone(ids) {
  const want = new Set((ids || []).map(String));
  const going = state.sessions.filter(s => s && want.has(String(s.id))
    && !(state.view === 'entry' && s.id === state.activeId) && !s[DEMO_SESSION_FLAG]);
  if (!going.length) return 0;
  const gone = new Set(going.map(s => s.id));
  archiveSessionStats(going);
  photosDeleteForSessions(Array.from(gone));
  if (typeof syncNotePruned === 'function') {
    try { syncNotePruned(Array.from(gone)); } catch (e) { console.error('Cleared-jobs note failed (non-fatal).', e); }
  }
  state.sessions = state.sessions.filter(s => !gone.has(s.id));
  if (gone.has(state.activeId)) state.activeId = null;
  // V93: the cloud tab's list was read without these (they were here): read
  // it again next time the tab opens, so they show there.
  if (state.cloudJobs) state.cloudJobs.stale = true;
  save();
  return going.length;
}

// V91 (Stage 4, 6A): the 🗑 on a job card. Signed out (or the example job) —
// unchanged: one confirm, delete. Signed in — a choice: remove from this phone
// (only when the job is safe in the cloud; otherwise the sheet says why not) or
// delete everywhere, which asks a SECOND time with a hard final button (Peter,
// V91 round: two steps to really make it safe).
function deleteSessionAsk(id) {
  const s = state.sessions.find(x => x.id === id);
  if (!s) return;
  const title = s.site || s.name || 'this job';
  const signedIn = typeof syncActive === 'function' && syncActive() && !s[DEMO_SESSION_FLAG];
  if (!signedIn) {
    openConfirmSheet({
      title: 'Delete session?',
      message: `Delete "${title}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: () => deleteSession(id)
    });
    return;
  }
  const r = (typeof syncJobsSafety === 'function') ? (syncJobsSafety(true) || { map: new Map() }).map.get(String(id)) : null;
  const canRemove = !!(r && r.safe);
  const why = r && !r.safe && typeof syncSafetyText === 'function' ? syncSafetyText(r) : '';
  const choices = [];
  if (canRemove) choices.push({ label: 'Remove from this phone', style: 'primary', onPick: () => jobsRemoveAsk([String(id)]) });
  choices.push({ label: 'Delete everywhere\u2026', style: 'danger', onPick: () => deleteEverywhereAsk(id) });
  openChoiceSheet({
    title: `\u201c${title}\u201d`,
    message: canRemove
      ? 'Remove from this phone: it stays in the cloud and on your other phones, with its photos, and you can bring it back here. Delete everywhere: it goes from this phone, your other phones and the cloud.'
      : `This job can\u2019t come off just this phone yet (${why.toLowerCase()}). Delete everywhere removes it from this phone, your other phones and the cloud.`,
    choices,
  });
}

function deleteEverywhereAsk(id) {
  const s = state.sessions.find(x => x.id === id);
  if (!s) return;
  const title = s.site || s.name || 'this job';
  const items = (s.items || []).length;
  const pc = (typeof photoCountsForSession === 'function') ? photoCountsForSession(s) : { total: 0 };
  openConfirmSheet({
    title: 'Delete everywhere \u2014 are you sure?',
    message: `\u201c${title}\u201d (${items} item${items === 1 ? '' : 's'}` +
      (pc.total ? `, ${pc.total} photo${pc.total === 1 ? '' : 's'}` : '') +
      ') will be deleted from this phone, every other phone and the cloud. It can\u2019t be brought back or undone.',
    confirmLabel: 'Yes, delete everywhere',
    onConfirm: () => deleteSession(id)
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
  state.repeatSheetOpen = false;      // v77
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
    id: newId(),
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
  state.lastLog = null;   // V94: Undo belongs to the visit that logged it
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
function tallySessions(sessions, alreadyCounted) {
  // V102: an item and its copies (a duplicated job, `copyOf`) are ONE item
  // tested, counted once however many jobs hold it — so duplicating a job and
  // then trimming each copy leaves the lifetime figures where they were.
  // `alreadyCounted` (a Set of stats keys) skips items counted elsewhere: the
  // archive hook passes the keys of the jobs that STAY.
  const out = { items: 0, fails: 0, types: {} };
  const seen = alreadyCounted ? new Set(alreadyCounted) : new Set();
  (sessions || []).forEach(sess => {
    if (!sessionCountsForStats(sess)) return;
    (sess.items || []).forEach(it => {
      if (!it) return;
      const key = statsKeyOf(it);
      if (key) { if (seen.has(key)) return; seen.add(key); }
      out.items++;
      if (it.result === 'fail') out.fails++;
      const t = (it.itemType || '').trim();
      if (t) out.types[t] = (out.types[t] || 0) + 1;
    });
  });
  return out;
}

// V102: what makes two items “the same item tested”. A copy carries `copyOf`,
// the id of the item it was first copied from (a copy of a copy keeps the
// first), so every copy shares its original's key. '' (no id at all) is never
// de-duplicated.
function statsKeyOf(it) {
  if (!it) return '';
  if (it.copyOf != null && String(it.copyOf) !== '') return String(it.copyOf);
  return it.id != null ? String(it.id) : '';
}

// V102: the stats keys held by counting jobs NOT in `going` — items still
// counted live, which a removal must not archive a second time.
function statsKeysStaying(going) {
  // By id, not object: a pull may hold a different object for the same job.
  const leaving = new Set((going || []).filter(Boolean).map(x => String(x.id)));
  const keys = new Set();
  for (const sess of (state.sessions || [])) {
    if (!sess || leaving.has(String(sess.id)) || !sessionCountsForStats(sess)) continue;
    for (const it of (sess.items || [])) { const k = statsKeyOf(it); if (k) keys.add(k); }
  }
  return keys;
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
  // V102: an item a job that stays still holds (its copy) is still counted live.
  const add = tallySessions(sessions, statsKeysStaying(sessions));
  const bucket = state.archivedStats || makeEmptyArchivedStats();
  bucket.items = (bucket.items || 0) + add.items;
  bucket.fails = (bucket.fails || 0) + add.fails;
  bucket.types = bucket.types || {};
  Object.keys(add.types).forEach(t => {
    bucket.types[t] = (bucket.types[t] || 0) + add.types[t];
  });
  state.archivedStats = bucket;
}

// V91 (Stage 4, 10A): the reverse, for a job brought BACK onto this phone after
// it was cleared (syncBringBack). Its tallies joined the archive when it left;
// now it counts live again, so they come out — never below zero (a phone
// restored from a backup may not have archived it).
function unarchiveSessionStats(sessions) {
  // V102: only what was archived comes out — an item another job here holds was
  // still counted live, so it never joined the archive.
  const sub = tallySessions(sessions, statsKeysStaying(sessions));
  const bucket = state.archivedStats || makeEmptyArchivedStats();
  bucket.items = Math.max(0, (bucket.items || 0) - sub.items);
  bucket.fails = Math.max(0, (bucket.fails || 0) - sub.fails);
  bucket.types = bucket.types || {};
  Object.keys(sub.types).forEach(t => {
    const n = (bucket.types[t] || 0) - sub.types[t];
    if (n > 0) bucket.types[t] = n; else delete bucket.types[t];
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
  // v78: ledger before the filter, on the same before-the-removal rule as the
  // two sweeps above. Only recorded when the session actually existed — a call
  // for an unknown id must not leave a tombstone for a record that never was.
  if (going.length) recordTombstone('session', id);
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
    // V99 (7A): the fail → PASS sheet's "remove" button takes the map pin too.
    // Read off the form here, before loadFormForCursor() below rebuilds it.
    if (state.form.dropPin) delete merged.pin;
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
    const appended = { id: newId(), ...item };
    sess.items.push(appended);
    savedItemId = appended.id;
    noteLastLog(sess, [appended], cleanType);   // V94: Undo
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
  // V99 (5A): offer a map pin for a fail that has none — after the repaint
  // above, which would otherwise wipe it. Switch off → mapPinOfferShow says no.
  if (result === 'fail' && savedItemId) {
    const saved = sess.items.find(it => it && it.id === savedItemId);
    if (saved && !mapPinOf(saved)) mapPinOfferShow(savedItemId);
  }
}

function passClicked() {
  // v8: belt-and-braces — UI disables the buttons when locked, but block here too.
  const sess = activeSession();
  if (sess && sess.locked) return;
  // V94 (12A): a Multi Pick tile is selected — PASS logs its sequence. Before
  // validateBeforeSave(), which would ask for an item type the tile replaces.
  if (state.form.qpTile && typeof qpTileFire === 'function') { qpTileFire(state.form.qpTile); return; }
  const err = validateBeforeSave();
  if (err) { showToast(err); return; }

  // v62 (decision 14B): photos only ever attach to a FAIL. Turning an existing
  // fail into a pass therefore gives up its photos — but never silently. The
  // confirm names the count and says plainly they cannot be recovered, because
  // the realistic route here is correcting a mis-tap, and someone who mis-tapped
  // needs to know what else that undo takes with it.
  const existing = (sess && state.cursor < sess.items.length) ? sess.items[state.cursor] : null;
  // v89: photos only in the cloud count too — they go the same way (4A/5A).
  const losing = (existing && existing.result === 'fail')
    ? ((typeof photoCountForItemAll === 'function') ? photoCountForItemAll(existing.id) : photoCountForItem(existing.id)) : 0;
  const cloudToo = (typeof syncActive === 'function' && syncActive());
  // V95 (1A, 2B): a fail changed to PASS keeps its notes, and pickFailReason()
  // wrote the fail reason INTO the notes — so a corrected mistake printed as a
  // PASS saying "Damaged plug" and confused the customer (team leaders' report).
  // Any fail with notes asks first; the big button is the safe one (remove).
  // Read from the FORM box, not the stored item: an engineer who already
  // cleared or rewrote the notes before tapping PASS is not asked again.
  const failNotes = (existing && existing.result === 'fail') ? String(state.form.notes || '').trim() : '';
  // V99 (7A): a map pin is part of what the fail says, so a fail with a pin is
  // asked about too, even with no notes.
  const failPin = (existing && existing.result === 'fail') ? mapPinOf(existing) : '';
  if (failNotes || failPin) { failToPassAsk(existing, failNotes, losing, cloudToo, failPin); return; }
  if (losing > 0) {
    openConfirmSheet({
      title: 'Change to PASS?',
      message:
        `This item is a FAIL with ${losing} photo${losing === 1 ? '' : 's'} attached. ` +
        `Changing it to PASS will delete ${losing === 1 ? 'that photo' : 'those photos'} ` +
        `from this device${cloudToo ? ' and from your cloud copy' : ''}. They can't be recovered.`,
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

// V95: the notes with every fail-reason segment taken out. pickFailReason()
// joins with ' — ' ("note — Damaged plug", or the reason alone), so split on
// that, drop any segment that IS one of the current reasons (case and spaces
// ignored), and rejoin. Returns { text, found } — found = a segment was dropped.
// A reason since renamed, or typed through "Other…", is not recognised; 2B
// still asks about those notes, offering to clear them instead.
function stripFailReasons(notes) {
  const reasons = {};
  (state.failReasons || []).forEach(r => { const k = String(r || '').trim().toLowerCase(); if (k) reasons[k] = true; });
  const parts = String(notes || '').split(' — ');
  const kept = parts.filter(p => !reasons[p.trim().toLowerCase()]);
  return { text: kept.map(p => p.trim()).filter(Boolean).join(' — '), found: kept.length !== parts.length };
}

// V95 (1A): the fail → PASS sheet. One sheet, photos included, so a fail with
// both notes and photos is asked once. Cancel changes nothing (the form keeps
// the notes; the result stays FAIL). The choice is applied to state.form.notes,
// which saveItem() reads — and to the DOM box, so the readings sheet path (which
// returns to the form) shows what will be saved.
// V99 (7A): `pin` — the item's map pin, if any. The big (remove) button takes
// it as well as the fail wording; "Keep" keeps both. A pin with no notes gets
// its own pair of buttons.
function failToPassAsk(existing, notes, losing, cloudToo, pin) {
  const strip = stripFailReasons(notes);
  const photoLine = losing > 0
    ? ` It also has ${losing} photo${losing === 1 ? '' : 's'}, which will be deleted from this device` +
      `${cloudToo ? ' and from your cloud copy' : ''}. They can't be recovered.`
    : '';
  const go = (newNotes, dropPin) => {
    state.form.notes = newNotes;
    state.form.dropPin = !!(pin && dropPin);
    const box = document.getElementById('f-notes');
    if (box) box.value = newNotes;
    if (losing > 0) photosDeleteForItem(existing.id).then(() => commitPassResult());
    else commitPassResult();
  };
  const pinTail = pin ? ' and the map pin' : '';
  const choices = !notes
    ? [{ label: 'Remove the map pin', style: 'primary', onPick: () => go('', true) },
       { label: 'Keep the map pin', style: 'secondary', onPick: () => go('', false) }]
    : strip.found
    ? [{ label: (strip.text ? 'Remove the fail reason' : 'Remove the fail reason (clears the notes)') + pinTail, style: 'primary', onPick: () => go(strip.text, true) },
       { label: pin ? 'Keep the notes and the pin' : 'Keep the notes as they are', style: 'secondary', onPick: () => go(notes, false) }]
    : [{ label: 'Clear the notes' + pinTail, style: 'primary', onPick: () => go('', true) },
       { label: pin ? 'Keep the notes and the pin' : 'Keep the notes as they are', style: 'secondary', onPick: () => go(notes, false) }];
  const pinLine = pin ? ` It has a map pin (///${pin}).` : '';
  openChoiceSheet({
    title: 'Change to PASS?',
    message: (notes ? `This item's notes say "${notes}". The certificate will print them beside a PASS.` : 'This item is a FAIL.')
      + pinLine + photoLine,
    choices
  });
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
  if (state.form.qpTile) return;   // V94: a multi-pick is passes only (FAIL is greyed)
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
    state.photoStripPhotos = _photoStripEntries(itemId, records);
    state.photoStripLoading = false;
    render();
    _photoStripFetchThumbs(itemId);
  });
}

// v89: the strip shows this phone's photos AND the item's photos that are only
// in the cloud (2A), in the order they were taken. A cloud tile carries
// `cloud: true`; its `url` is its preview once fetched (1A), '' until then.
function _photoStripEntries(itemId, records) {
  const local = (records || []).map((r) => ({
    id: r.id, url: photoObjectUrl(r.blob), bytes: r.bytes || 0, at: r.at || ''
  }));
  const cloud = (typeof photoCloudOnlyForItem === 'function' ? photoCloudOnlyForItem(itemId) : []).map((e) => ({
    id: e.id,
    url: (typeof photoThumbCached === 'function') ? photoThumbCached(e.id) : '',
    bytes: e.b || 0, at: e.a || '', cloud: true, thumb: !!e.t, busy: false
  }));
  return local.concat(cloud).sort((a, b) => String(a.at).localeCompare(String(b.at)) || String(a.id).localeCompare(String(b.id)));
}

// v89 (1A): previews come down when the strip is opened — that tap is the
// request (R17). One at a time; kept for the session (photos.js), so reopening
// costs nothing. Each arrival repaints: the strip is buttons only (MAP rule 3).
function _photoStripFetchThumbs(itemId) {
  if (typeof syncPhotoThumb !== 'function') return;
  // syncPhotoThumb() itself refuses a photo with no preview — one guard, one place.
  const want = (state.photoStripPhotos || []).filter((p) => p.cloud && !p.url).map((p) => p.id);
  want.reduce((chain, id) => chain.then(() => syncPhotoThumb(id).then((blob) => {
    if (!blob) return;
    const url = photoThumbRemember(id, blob);
    if (!state.photoStripOpen || state.photoStripItemId !== itemId) return;
    const p = (state.photoStripPhotos || []).find((x) => x.id === id);
    if (p && p.cloud && url) { p.url = url; render(); }
  })), Promise.resolve()).catch(() => { /* a missing preview just stays a cloud */ });
}

// Re-read the strip from the store (what is on screen is what is persisted).
function _photoStripReload(itemId) {
  photoReleaseObjectUrls();
  return photosForItem(itemId).then((records) => {
    if (!state.photoStripOpen || state.photoStripItemId !== itemId) return;
    state.photoStripPhotos = _photoStripEntries(itemId, records);
    state.photoStripLoading = false;
    render();
    _photoStripFetchThumbs(itemId);
  });
}

// v89 (2A): bring photos down onto this phone — one tile, or "Download all".
function downloadStripPhotos(ids) {
  const itemId = state.photoStripItemId;
  const want = (ids || []).filter(Boolean);
  if (!itemId || !want.length || typeof syncPhotoDownload !== 'function') return;
  const busy = new Set(want);
  if ((state.photoStripPhotos || []).some((p) => busy.has(p.id) && p.busy)) return;   // already going
  (state.photoStripPhotos || []).forEach((p) => { if (busy.has(p.id)) p.busy = true; });
  render();
  syncPhotoDownload(want).then((res) => {
    if (res.offline) showToast('No signal \u2014 the photo is safe in the cloud. Try again when you\u2019re connected.');
    else if (res.notReady) showToast('Photos are still loading \u2014 try again in a moment');
    else if (res.failed) showToast(`Couldn\u2019t download ${res.failed} photo${res.failed === 1 ? '' : 's'}. Try again later.`);
    if (!state.photoStripOpen || state.photoStripItemId !== itemId) return null;
    return _photoStripReload(itemId);
  });
}

function downloadStripPhotosAll() {
  downloadStripPhotos((state.photoStripPhotos || []).filter((p) => p.cloud).map((p) => p.id));
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
  if (((typeof photoCountForItemAll === 'function') ? photoCountForItemAll(itemId) : photoCountForItem(itemId)) >= PHOTO_MAX_PER_ITEM) {
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
      return _photoStripReload(itemId);
    });
  });
}

// Delete one photo from the strip, with a confirm — a photo is evidence and a
// mis-tap on a small thumbnail row is easy.
function deletePhotoFromStrip(photoId) {
  if (!photoId) return;
  const itemId = state.photoStripItemId;
  // v89 (5A): a photo only in the cloud is deleted from there.
  const tile = (state.photoStripPhotos || []).find((p) => p.id === photoId);
  if (tile && tile.cloud) {
    openConfirmSheet({
      title: 'Delete photo?',
      message: "This photo is only in your cloud copy. Deleting it removes it from there. It can't be recovered.",
      confirmLabel: 'Delete',
      onConfirm: () => {
        photoDeleteCloudOnly(photoId);
        state.photoStripPhotos = state.photoStripPhotos.filter((p) => p.id !== photoId);
        if (!state.photoStripPhotos.length) { closePhotoStrip(); return; }
        render();
      }
    });
    return;
  }
  openConfirmSheet({
    title: 'Delete photo?',
    // v88: signed in, the cloud copy goes too (decision 4A).
    message: ((typeof syncActive === 'function' && syncActive())
      ? "This deletes the photo from this device and from your cloud copy. It can't be recovered."
      : "This removes the photo from this device permanently. It can't be recovered."),
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

// ---------- V99: map pin (Stage 8 part 2, spec 1A–9A) ----------
// A fail's what3words address, pasted (1A), stored on the ITEM as `pin`
// ('word.word.word', absent when none — 3A). Added only to a SAVED item (4A):
// the fail sheet holds its reason and staged photos in memory until the fail is
// saved, so switching to what3words from inside it could lose the whole fail if
// iOS reloads the app. From a saved item the worst a reload can lose is the
// paste — and MAP_PIN_OPEN_KEY + mapPinResume() reopen the sheet even then.
// The switch (state.mapPinEnabled, per phone — 8A) gates only the WAYS OF
// ADDING one; a pin on an item always shows, exports and prints (9A).

// The item's pin, normalised ('' for none). Anything malformed — a hand-edited
// backup, a row from a later version — reads as no pin rather than as junk.
function mapPinOf(item) {
  if (!item || typeof item.pin !== 'string' || !item.pin) return '';
  return (typeof normaliseW3w === 'function') ? normaliseW3w(item.pin) : '';
}

function _mapPinTarget(sessionId, itemId) {
  const sess = state.sessions.find(s => s && s.id === sessionId);
  if (!sess || !Array.isArray(sess.items) || !itemId) return null;
  const idx = sess.items.findIndex(it => it && it.id === itemId);
  if (idx === -1) return null;
  return { sess, idx, item: sess.items[idx] };
}

// Set or clear an item's pin. The item OBJECT is replaced (never edited in place)
// and the job's cached encoding dropped — the v69 trap (sync spec section 6): the
// encoding signature covers the item COUNT, not item contents. Returns null when
// the item is gone, false when nothing changed, true when it did.
function setItemMapPin(sessionId, itemId, words) {
  const t = _mapPinTarget(sessionId, itemId);
  if (!t) return null;
  const clean = (typeof normaliseW3w === 'function') ? normaliseW3w(words) : '';
  if (clean === mapPinOf(t.item) && (clean || !('pin' in t.item))) return false;
  const copy = { ...t.item };
  if (clean) copy.pin = clean; else delete copy.pin;
  t.sess.items[t.idx] = copy;
  if (typeof _invalidateSessionEncoding === 'function') _invalidateSessionEncoding(t.sess);
  markSessionDirty(t.sess);
  return true;
}

function _mapPinForgetOpen() {
  try { localStorage.removeItem(MAP_PIN_OPEN_KEY); } catch (e) { /* ignore */ }
}

function openMapPinSheet(sessionId, itemId) {
  const t = _mapPinTarget(sessionId, itemId);
  if (!t) return;
  mapPinOfferHide();
  const pin = mapPinOf(t.item);
  state.mapPinSheet = { sessionId, itemId, text: pin ? '///' + pin : '' };
  render();
}

function closeMapPinSheet() {
  state.mapPinSheet = null;
  _mapPinForgetOpen();
  render();
}

// The sheet's message line, written in place (the sheet has an input — MAP
// rule 3: no render() while it is open).
function _mapPinSheetMessage(text) {
  const el = (typeof document !== 'undefined') ? document.getElementById('map-pin-error') : null;
  if (el) el.textContent = text || '';
}

// Save: three words → set; an empty box → remove; anything else → say so and
// keep the sheet open with the typing intact.
function saveMapPinSheet() {
  const sh = state.mapPinSheet;
  if (!sh) return;
  const raw = String(sh.text || '').trim();
  const words = normaliseW3w(raw);
  if (raw && !words) {
    _mapPinSheetMessage('That isn\u2019t three words. Copy them from what3words \u2014 e.g. ///filled.count.soap');
    return;
  }
  const changed = setItemMapPin(sh.sessionId, sh.itemId, words);
  state.mapPinSheet = null;
  _mapPinForgetOpen();
  if (changed === null) { render(); showToast('That item is no longer in this job'); return; }
  if (changed) saveSessions();
  render();
  if (changed) showToast(words ? 'Map pin saved' : 'Map pin removed');
}

function removeMapPinFromSheet() {
  const sh = state.mapPinSheet;
  if (!sh) return;
  sh.text = '';
  saveMapPinSheet();
}

// "Open what3words": remember which item's sheet is open FIRST (iOS may reload
// the app while it is in the background — MAP_PIN_OPEN_KEY), then leave. The
// sheet stays open: if the app is not reloaded the engineer comes back to it.
function mapPinOpenW3w() {
  const sh = state.mapPinSheet;
  if (!sh) return;
  try {
    localStorage.setItem(MAP_PIN_OPEN_KEY, JSON.stringify({
      s: sh.sessionId, i: sh.itemId, at: Date.now(), t: String(sh.text || '').slice(0, 200)
    }));
  } catch (e) { /* a full phone: the sheet still works, it just can't come back after a reload */ }
  // V99.1: the APP, by its own link — no browser panel in between. The page is
  // not replaced: an app link either opens the app or does nothing.
  _mapPinWatchLeave(sh);
  try { window.location.href = W3W_APP_URL; } catch (e) { /* nothing to open with */ }
}

// V99.1: did the tap leave PATGo? Leaving = the page hid, or the window lost
// focus (iOS's own "Open in what3words?" question takes focus too). If neither
// has happened W3W_APP_WAIT_MS later, what3words is not on this phone: the sheet
// offers the website instead (state, so a repaint keeps it; written in place
// because the sheet has an input — MAP rule 3).
let _mapPinLeaveTimer = null;
function _mapPinWatchLeave(sh) {
  if (_mapPinLeaveTimer) { clearTimeout(_mapPinLeaveTimer); _mapPinLeaveTimer = null; }
  let left = false;
  const onLeave = () => { if (document.visibilityState === 'hidden') left = true; };
  const onHide = () => { left = true; };
  try {
    document.addEventListener('visibilitychange', onLeave);
    window.addEventListener('blur', onHide);
    window.addEventListener('pagehide', onHide);
  } catch (e) { /* no events: the timer alone decides */ }
  _mapPinLeaveTimer = setTimeout(() => {
    _mapPinLeaveTimer = null;
    try {
      document.removeEventListener('visibilitychange', onLeave);
      window.removeEventListener('blur', onHide);
      window.removeEventListener('pagehide', onHide);
    } catch (e) { /* ignore */ }
    if (left || state.mapPinSheet !== sh) return;
    sh.noApp = true;
    const el = (typeof document !== 'undefined') ? document.getElementById('map-pin-noapp') : null;
    if (el) el.innerHTML = mapPinNoAppHTML();
  }, W3W_APP_WAIT_MS);
}

// V99.1: the website, only when the app didn't open. Still window.open (the
// panel's Done button brings you back) — said so on the button's line.
function mapPinOpenW3wWeb() {
  if (!state.mapPinSheet) return;
  try { window.open(W3W_HOME_URL, '_blank', 'noopener'); } catch (e) { /* nothing to open with */ }
}

// The Paste button. iOS shows its own "Paste" bubble first; refusing it, or a
// browser with no clipboard read, falls back to a plain instruction. The box
// is written in place (no render — the sheet has an input).
function mapPinPaste() {
  const sh = state.mapPinSheet;
  if (!sh) return;
  const fallback = () => showToast('Long-press the box and choose Paste');
  let p = null;
  try { p = (navigator.clipboard && navigator.clipboard.readText) ? navigator.clipboard.readText() : null; } catch (e) { p = null; }
  if (!p || typeof p.then !== 'function') { fallback(); return; }
  p.then((text) => {
    if (state.mapPinSheet !== sh) return;   // closed meanwhile
    const words = normaliseW3w(text);
    const shown = words ? '///' + words : String(text || '').trim().slice(0, 200);
    sh.text = shown;
    const box = document.getElementById('map-pin-input');
    if (box) box.value = shown;
    _mapPinSheetMessage(words || !shown ? '' : 'That isn\u2019t three words. Copy them from what3words \u2014 e.g. ///filled.count.soap');
  }).catch(fallback);
}

// Boot, BEFORE the first loadFormForCursor()/render(): the app was reloaded
// while the engineer was in what3words. Reopen the job's entry screen on that
// item with the sheet open. A locked job too (a pin can be added to one, like
// notes) — load() will have dropped it as the resume target. Stale or broken
// → forgotten. Returns true when it reopened.
function mapPinResume() {
  let o = null;
  try { o = JSON.parse(localStorage.getItem(MAP_PIN_OPEN_KEY) || 'null'); } catch (e) { o = null; }
  if (!o) { _mapPinForgetOpen(); return false; }
  const fresh = typeof o.at === 'number' && Date.now() - o.at >= 0 && Date.now() - o.at <= MAP_PIN_OPEN_MAX_MS;
  const t = (fresh && typeof o.s === 'string' && typeof o.i === 'string') ? _mapPinTarget(o.s, o.i) : null;
  if (!t) { _mapPinForgetOpen(); return false; }
  state.activeId = t.sess.id;
  state.view = 'entry';
  state.cursor = t.idx;
  state.mapPinSheet = { sessionId: t.sess.id, itemId: t.item.id, text: typeof o.t === 'string' ? o.t : '' };
  return true;
}

// 5A: straight after a fail is logged, "📍 Add map pin" for a few seconds — at
// the TOP of the screen, away from PASS / FAIL, so a tap meant for the next
// item cannot land on it. A DOM node inside #app (so the delegated click
// reaches it), added after the entry repaint; the next repaint removes it, as
// does the timer. Switch off → never shown.
let _mapPinOfferTimer = null;
function mapPinOfferHide() {
  if (_mapPinOfferTimer) { clearTimeout(_mapPinOfferTimer); _mapPinOfferTimer = null; }
  try { document.querySelectorAll('.map-pin-offer').forEach(el => el.remove()); } catch (e) { /* no DOM */ }
}
function mapPinOfferShow(itemId) {
  if (!state.mapPinEnabled || !itemId) return false;
  const app = (typeof document !== 'undefined') ? document.getElementById('app') : null;
  if (!app) return false;
  mapPinOfferHide();
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'map-pin-offer';
  el.setAttribute('data-action', 'map-pin-offer');
  el.setAttribute('data-arg', itemId);
  el.textContent = '\uD83D\uDCCD Add map pin';
  app.appendChild(el);
  _mapPinOfferTimer = setTimeout(mapPinOfferHide, MAP_PIN_OFFER_MS);
  return true;
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
    // V99: the overwrite clears the notes, so it clears the map pin too.
    sess.items[state.cursor] = { ...sess.items[state.cursor], ...item };
    delete sess.items[state.cursor].pin;
  } else {
    // v17: stamp on first save (append). v61: unconditional — see saveItem and
    // the capture/exposure note in config.js. Copy-last is a genuine first log
    // of a new item, so it stamps exactly like any other.
    item.ts = new Date().toISOString();
    const pushed = { id: newId(), ...item };
    sess.items.push(pushed);
    // v18: learn the copied (location, type) pairing as a fresh log.
    recordSqpUsage(item.location, item.itemType);
    noteLastLog(sess, [pushed], item.itemType);   // V94: Undo
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

// ---------- v77: "Log again ×N" ----------
// Hold the Copy-last button → a sheet asking how many MORE copies to add. This
// exists for a run of genuinely identical items (ten identical desk lamps in one
// room), where tapping Copy last ten times is the only alternative.
//
// It is modelled on multiPickFire(), NOT on copyLastResult(), and the three
// places it deliberately differs from Copy-last are the whole design:
//
//   • It always APPENDS to the end of the session. Copy-last will overwrite the
//     item under the cursor when the cursor is parked mid-list; a batch that did
//     that would destroy N-1 existing rows silently. Appending can always be
//     undone by deleting rows; overwriting cannot.
//   • It ignores the form's asset box and numbers every copy off nextAssetNo(),
//     recomputed each push so the numbers run on. Copy-last takes a scanned or
//     typed number for its single item, which has no meaning for a batch — the
//     scan carry-forward is cleared afterwards for the same reason Multi Pick
//     clears it.
//   • It carries the source item's NOTES across, where Copy-last blanks them.
//     Copy-last blanking is defensible for one item; for a batch it is not,
//     because a fail's reason lives in the notes (pickFailReason appends it
//     there) and a run of fails with no reason is unusable on a certificate.
//     The sheet previews the notes it is about to duplicate, so the case where
//     copying them is wrong — an item-specific pass note — is visible before the
//     user commits rather than being decided for them by a rule.
//
// Location comes from the FORM and is mandatory, exactly as in Multi Pick: the
// engineer may have moved on since the last item, and the form is what they can
// see. Item type and result come from the last item.
function repeatLastResult(n) {
  const sess = activeSession();
  if (!sess || sess.items.length === 0) return;
  if (sess.locked) return;   // belt-and-braces; the button is disabled too

  // Clamp rather than reject. The presets can't be out of range and the custom
  // box is already capped in the markup, so anything arriving outside 1..MAX is
  // a hand-edited DOM or a future caller, and silently doing nothing would be
  // the worse failure — this path appends, so a clamp cannot destroy anything.
  const count = Math.floor(Number(n));
  if (!isFinite(count) || count < 1) return;
  const total = Math.min(count, REPEAT_MAX_N);

  const cleanLocation = normaliseLocation(state.form.location);
  if (!cleanLocation) {
    // Close first so the toast clears to the entry screen with the Location box
    // in view, rather than leaving the sheet sitting over the field it names.
    state.repeatSheetOpen = false;
    render();
    showToast('Enter a location first — it applies to every copy');
    return;
  }

  const last = sess.items[sess.items.length - 1];
  const cleanType = normaliseItemType(last.itemType);
  const added = [];   // V94: for Undo

  for (let i = 0; i < total; i++) {
    const item = {
      id: newId(),
      assetNo: nextAssetNo(sess),   // recomputed each push off the growing list
      location: cleanLocation,
      itemType: cleanType,
      notes: last.notes || '',
      result: last.result
    };
    // v61: every item is stamped on first log, always. The setting gates EXPOSURE
    // only (see config.js). Copy-last and saveItem both stamp unconditionally.
    item.ts = new Date().toISOString();
    sess.items.push(item);
    added.push(item);
    // v18: each copy is a genuine fresh log of this (location, type) pairing.
    recordSqpUsage(cleanLocation, cleanType);
  }
  noteLastLog(sess, added, `Log again: ${cleanType}`);   // V94: one Undo for the batch

  markSessionDirty(sess);             // v14: new entries invalidate a prior export
  state.repeatSheetOpen = false;
  state.cursor = sess.items.length;   // land on a fresh new item after the batch
  // Every asset number here came from nextAssetNo(), never from the form, so the
  // counter is authoritative again. Leaving the scan carry-forward armed would
  // blank the next asset box on the strength of a scan from before the batch.
  state.lastLogWasScanned = false;
  state.lastScanSessionId = '';
  loadFormForCursor();
  feedback('copy', 'copy-last-btn');  // same cue as the gesture's own button
  // v23 (E2): hot path. The type is copied from an existing item, so it is
  // already in the description list — no saveDescriptions() needed here (same
  // reasoning as copyLastResult, and unlike Multi Pick which invents types).
  saveSessions(); saveSqpHistory();
  render();
  showToast(`Added ${total} more`);
}

// ============== V94 — Undo (8, 9B, 14A, 15A, 16B) ==============
// ↶ Undo sits beside Copy last when switched on (per phone, off by default). It
// removes the most recent LOGGING action — one new item, or a whole batch (Log
// again ×N, Multi Pick, a Multi Pick tile) — one level only. Edits to existing
// items are never undoable.
//
// WHAT IS RECORDED. state.lastLog = { sessionId, ids, sigs, sqp, label }: the ids
// of the items that action appended, and a JSON snapshot of each. Memory only:
// a reload, or opening any job, forgets it.
//
// ⚠ IT IS CHECKED AT THE MOMENT OF THE TAP, not trusted from when it was noted
// (undoAvailable). Those items must still be the LAST ones in the open job, in
// order, and unchanged — an edit, a delete, another log after them, or a lock
// greys the button. A stale record must never remove items the engineer has
// since worked on.
//
// WHAT IT REVERSES. The items (their photos first — MAP rule 5), and Smart Quick
// Pick's learning, only if the log recorded any. Lifetime stats need nothing:
// they are worked out from the jobs. A new description the item added stays in
// the list. The frozen Quick Pick row is NOT rebuilt (no reshuffle under the
// thumb). Certificate numbers are never touched by logging.
function noteLastLog(sess, items, label) {
  if (!sess || !Array.isArray(items) || !items.length) return;
  state.lastLog = {
    sessionId: sess.id,
    ids: items.map(it => it.id),
    sigs: items.map(it => JSON.stringify(it)),
    sqp: !!state.sqpEnabled,          // recordSqpUsage() no-ops while it is off
    label: String(label || '')
  };
}

function undoAvailable() {
  if (!state.undoEnabled) return false;
  const L = state.lastLog;
  const sess = activeSession();
  if (!L || !sess || sess.id !== L.sessionId || sess.locked) return false;
  const n = L.ids.length;
  const items = sess.items || [];
  if (!n || items.length < n) return false;
  for (let i = 0; i < n; i++) {
    const it = items[items.length - n + i];
    if (!it || it.id !== L.ids[i] || JSON.stringify(it) !== L.sigs[i]) return false;
  }
  return true;
}

// 14A: ask first — the button sits beside Copy last, and a mis-tap there would
// otherwise delete a real item.
function undoAsk() {
  if (!undoAvailable()) {
    showToast('Nothing to undo');
    if (typeof refreshEntryAfterLog === 'function') refreshEntryAfterLog();
    return;
  }
  const L = state.lastLog;
  const sess = activeSession();
  const n = L.ids.length;
  const first = sess.items.length - n + 1;
  const going = sess.items.slice(-n);
  let message;
  if (n === 1) {
    const it = going[0];
    message = `Remove item ${first} — ${it.itemType || 'item'}, ${String(it.result || '').toUpperCase()}?`;
  } else {
    message = `Remove items ${first}–${first + n - 1}${L.label ? ` (${L.label})` : ''}?`;
  }
  const photos = going.reduce((t, it) => t + ((it.result === 'fail' && it.id)
    ? ((typeof photoCountForItemAll === 'function') ? photoCountForItemAll(it.id)
      : (typeof photoCountForItem === 'function') ? photoCountForItem(it.id) : 0)
    : 0), 0);
  if (photos) message += ` ${photos === 1 ? 'Its photo' : `Its ${photos} photos`} will be deleted too.`;
  openConfirmSheet({
    title: 'Undo?',
    message,
    confirmLabel: n === 1 ? 'Remove it' : `Remove ${n} items`,
    onConfirm: undoLastLog
  });
}

function undoLastLog() {
  // Checked again: the job may have changed while the sheet was open (a sync).
  if (!undoAvailable()) { showToast('Nothing to undo — the job has changed'); refreshEntryAfterLog(); return; }
  const L = state.lastLog;
  const sess = activeSession();
  const n = L.ids.length;
  const start = sess.items.length - n;
  const going = sess.items.slice(start);
  const onNew = state.cursor >= sess.items.length;
  const autoBefore = nextAssetNo(sess);

  // Photos BEFORE the splice (MAP rule 5) — the same path deleteItem() uses,
  // which also sends the delete to the cloud for any already uploaded.
  if (typeof photosDeleteForItem === 'function') {
    going.forEach(it => { if (it.id) { try { photosDeleteForItem(it.id); } catch (e) {} } });
  }
  if (L.sqp && typeof unrecordSqpUsage === 'function') {
    going.forEach(it => unrecordSqpUsage(it.location, it.itemType));
  }
  sess.items.splice(start, n);
  markSessionDirty(sess);
  state.lastLog = null;

  if (onNew) {
    // 9B: the form stays on the next new item as it is — except an untouched
    // automatic asset number, which goes back with the items it followed.
    state.cursor = sess.items.length;
    if (state.form.assetNo === autoBefore) state.form.assetNo = nextAssetNo(sess);
  } else if (state.cursor >= start) {
    state.cursor = sess.items.length;
    loadFormForCursor();
  }
  saveSessions();
  if (L.sqp) saveSqpHistory();
  refreshEntryAfterLog();
  showToast(n === 1 ? 'Undone — item removed' : `Undone — ${n} items removed`);
}

// V94 (6): how many items in THIS job are at the location on the form — shown
// in the item readout ("Item 21 (new) · 15 at this location"). Matched the way
// an engineer reads it: case, outer spaces and doubled spaces don't count.
// null when the location is blank (the readout then shows nothing).
function locationKey(loc) {
  return String(loc || '').trim().replace(/\s+/g, ' ').toLowerCase();
}
function locationCountInJob(sess, location) {
  const key = locationKey(location);
  if (!sess || !key) return null;
  let n = 0;
  (sess.items || []).forEach(it => { if (locationKey(it.location) === key) n++; });
  return n;
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
  state.repeatSheetOpen = false;      // v77
  // v77: the preset-edit return marker is the one flag here that must NOT be
  // cleared unconditionally — it is set immediately BEFORE setView('settingsItems')
  // and would erase itself on the way in. So it survives a transition TO that page
  // and dies on any transition away from it, which means it cannot still be armed
  // if the user later reaches Quick Pick Items by another route (hub, category,
  // settings search). Clearing on arrival-elsewhere rather than only on
  // consumption is deliberate: consumption alone would leave it set if the user
  // left the page by a path that never reads it.
  if (v !== 'settingsItems') state.presetEditReturnView = null;
  closeReadingsSheetState();          // v53
  discardPendingPhotos();             // v62
  closePhotoStripState();             // v62
  // V90: leaving the photo manager drops its selection, preview and cloud look.
  if (v !== 'photoManager' && typeof photoMgrLeave === 'function') photoMgrLeave();
  if (v !== 'jobManager' && typeof jobMgrLeave === 'function') jobMgrLeave();   // V91
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
  state.siteNotesSheet = null;   // V98: the Overview's site-notes sheet
  state.dupJob = null;           // V102: the Duplicate sheet (a copy under way still finishes)
  // V99: leaving the screen closes the map pin sheet and forgets the reload note.
  if (state.mapPinSheet) { state.mapPinSheet = null; _mapPinForgetOpen(); }
  // V100: the replayed 100 moment and "PATGo tests itself" belong to About.
  state.partyOpen = false;
  if (state.egg && state.egg.timer) clearTimeout(state.egg.timer);
  state.egg = null;
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
  state.moveJob = null;   // V101
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

// ---------- V101: move selected items to a new job (roadmap Stage 9, split) ----------
// Locked: 1A Overview → Select items → Edit selected → "Move to a new job…",
// with a review of what is moving and an "Are you sure?" step; 2A a NEW job only
// (an existing job is BACKLOG); 3A the sheet asks client + site, everything else
// copied and editable under More details; 4A not on a locked job; 5A at least one
// item stays; 6A the original keeps its certificate number, the confirm warns when
// a certificate was already made; 7 photos and map pins move with their items;
// 8A the original records what moved out, and where (`movedOut`); 10 always on
// (Peter — an exception to R30); 11A stay on the original, "· Open" offer.
//
// ⚠ ITEMS MOVE, THEY ARE NOT COPIED. Item ids are unchanged, so each id is still
// in exactly ONE job: photos are found and deleted by item id alone (photos.js
// photosDeleteForItem), so a copy with the same ids would share — and delete —
// the original's photos. That is V102's problem (duplicate mints new ids).
//
// ⚠ PHOTOS ARE RE-LABELLED. A photo also carries its job (IndexedDB `sessionId`,
// sync's st.ph.sent[id].s, the cloud row's session_id), and deleting or clearing a
// job sweeps photos BY THAT LABEL. Left alone, deleting the original would take
// the moved items' photos with it. photosSettleJobs() re-labels this phone's
// copies (a photo belongs to the one job holding its item); syncNoteMoved() tells
// the sync state, which re-points the cloud rows at the next sync.
//
// The selection is captured as item IDS when the sheet opens: on the Overview the
// pull may replace the job object underneath (it defers only the entry screen),
// and indices would then point at different items.

function moveJobBlockReason(sess, ids) {
  if (!sess) return 'This job is no longer on this phone.';
  if (sess.locked) return 'This job is locked. Unlock it in Session settings first, then move the items.';
  const n = (ids || []).length;
  if (!n) return 'Select the items to move first.';
  if (n >= (sess.items || []).length) {
    return 'At least one item must stay in this job. To change the client or site of the whole job, use Session settings.';
  }
  return '';
}

function openMoveJob() {
  const sess = activeSession();
  if (!sess) return;
  const ids = state.selectedIndices
    .map(i => sess.items[i] && sess.items[i].id)
    .filter(id => id != null)
    .map(String);
  state.bulkEdit.menuOpen = false;
  const why = moveJobBlockReason(sess, ids);
  state.moveJob = why
    ? { step: 'blocked', why, ids: [], from: sess.id }
    : {
        step: 'form', ids, from: sess.id,
        client: '', site: '',
        name: sess.name || '',
        date: sess.date || todayISO(),
        engineer: sess.engineer || '',
        instrumentId: sess.instrumentId || '',
        prefix: sess.prefix || '',
        error: ''
      };
  render();
}

function closeMoveJob() {
  state.moveJob = null;
  render();
}

// Field edits arrive here from data-input-action (no render — MAP rule 3).
function setMoveJobField(field, value) {
  const m = state.moveJob;
  if (!m || m.step !== 'form') return;
  if (['client', 'site', 'name', 'date', 'engineer', 'instrumentId', 'prefix'].indexOf(field) === -1) return;
  m[field] = String(value == null ? '' : value);
}

// The items still selected for the move, looked up by id in the job as it is NOW.
function _moveJobItems(sess, ids) {
  const want = new Set((ids || []).map(String));
  return (sess && Array.isArray(sess.items)) ? sess.items.filter(it => it && want.has(String(it.id))) : [];
}

function moveJobSummary(sess, ids) {
  const items = _moveJobItems(sess, ids);
  let fails = 0, photos = 0, pins = 0;
  for (const it of items) {
    if (it.result === 'fail') fails++;
    photos += (typeof photoCountForItemAll === 'function') ? photoCountForItemAll(it.id)
      : ((typeof photoCountForItem === 'function') ? photoCountForItem(it.id) : 0);
    if (mapPinOf(it)) pins++;
  }
  return { n: items.length, fails, photos, pins, items };
}

function moveJobContinue() {
  const m = state.moveJob;
  if (!m || m.step !== 'form') return;
  const client = String(m.client || '').trim();
  const site = String(m.site || '').trim();
  if (!client && !site) {
    // No render: the sheet holds typing (MAP rule 3). Say it in place.
    m.error = 'Enter a client or a site for the new job.';
    try { const el = document.getElementById('move-job-error'); if (el) el.textContent = m.error; } catch (e) { /* no DOM */ }
    return;
  }
  m.error = '';
  m.step = 'confirm';
  render();
}

function moveJobBack() {
  const m = state.moveJob;
  if (!m || m.step !== 'confirm') return;
  m.step = 'form';
  render();
}

// The title a job shows on the Jobs list — for the confirm and the offer.
function moveJobTitle(clientName, siteName) {
  return composeSiteSnapshot(String(clientName || '').trim(), String(siteName || '').trim());
}

function moveItemsToNewJob() {
  const m = state.moveJob;
  if (!m || m.step !== 'confirm') return;
  const sess = activeSession();
  if (!sess || String(sess.id) !== String(m.from)) { closeMoveJob(); return; }
  const moving = _moveJobItems(sess, m.ids);
  // ⚠ Re-checked at the moment of moving: a sync may have changed the job since
  // the sheet opened. Anything other than exactly what was reviewed → stop.
  const why = moveJobBlockReason(sess, m.ids) ||
    (moving.length !== m.ids.length ? 'This job changed while you were choosing. Check the items and try again.' : '');
  if (why) { state.moveJob = { step: 'blocked', why, ids: [], from: sess.id }; render(); return; }

  const clientName = String(m.client || '').trim();
  const siteName = String(m.site || '').trim();
  if (!clientName && !siteName) { m.step = 'form'; m.error = 'Enter a client or a site for the new job.'; render(); return; }
  // Same resolution as createSession(): list entries made for anything new.
  let clientRec = null, siteRec = null;
  if (clientName && siteName) {
    clientRec = ensureClient(clientName);
    if (clientRec) siteRec = ensureSite(clientRec.id, siteName);
  } else if (clientName) {
    clientRec = ensureClient(clientName);
  } else {
    siteRec = ensureOrphanSite(siteName);
  }

  const now = new Date().toISOString();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(m.date || '')) ? m.date : (sess.date || todayISO());
  const job = {
    id: newId(),
    name: String(m.name || '').trim() || `Session ${state.sessions.length + 1}`,
    site: moveJobTitle(clientName, siteName),
    clientId: clientRec ? clientRec.id : '',
    siteId: siteRec ? siteRec.id : '',
    engineer: String(m.engineer || '').trim(),
    prefix: String(m.prefix || '').trim(),
    date,
    startNumber: sess.startNumber || 1,
    instrumentId: String(m.instrumentId || ''),
    items: moving,
    locked: false,
    notes: '',          // 3A: job notes belong to the job they were written for
    certNo: '',         // 6A: its own number, the first time its certificate is made
    userId: null,
    lastModified: now,
    syncedAt: null
  };
  if (sess.startPad) job.startPad = sess.startPad;
  // A frozen tester copy only means something for the tester it froze.
  if (sess.instrumentSnapshot && job.instrumentId === String(sess.instrumentId || '')) {
    job.instrumentSnapshot = JSON.parse(JSON.stringify(sess.instrumentSnapshot));
  }
  // Retest tracking and interval carry; the contact status starts fresh.
  if (sess.retestTrack) { job.retestTrack = true; job.retestMonths = sess.retestMonths; job.retestContact = null; }
  normaliseSessionRetest(job);

  // The original: fewer items, and a note of where they went (8A). An id that has
  // since come back into this job is no longer "moved out".
  const goingIds = new Set(moving.map(it => String(it.id)));
  const keep = sess.items.filter(it => !(it && goingIds.has(String(it.id))));
  const out = {};
  const prev = (sess.movedOut && typeof sess.movedOut === 'object' && !Array.isArray(sess.movedOut)) ? sess.movedOut : {};
  const stays = new Set(keep.map(it => String(it && it.id)));
  for (const k of Object.keys(prev)) if (!stays.has(k) && typeof prev[k] === 'string') out[k] = prev[k];
  for (const id of goingIds) { delete out[id]; out[id] = job.id; }
  const keys = Object.keys(out);
  if (keys.length > MOVED_OUT_MAX) for (const k of keys.slice(0, keys.length - MOVED_OUT_MAX)) delete out[k];
  sess.items = keep;
  sess.movedOut = out;
  markSessionDirty(sess);
  sess.lastModified = now;
  _invalidateSessionEncoding(sess);

  state.sessions.unshift(job);
  state.sessions = state.sessions.slice();
  state.lastLog = null;   // Undo belongs to items that are still where they were logged
  if (state.cursor > sess.items.length) state.cursor = sess.items.length;
  exitSelectionMode();
  state.moveJob = null;

  // Photos: this phone's copies now, the cloud at the next sync (7).
  const moved = {};
  for (const id of goingIds) moved[id] = job.id;
  if (typeof photosSettleJobs === 'function') { try { photosSettleJobs(); } catch (e) { console.error('photosSettleJobs failed', e); } }
  if (typeof syncNoteMoved === 'function') {
    try { Promise.resolve(syncNoteMoved(moved)).catch((e) => console.error('syncNoteMoved failed', e)); }
    catch (e) { console.error('syncNoteMoved failed', e); }
  }

  save();
  loadFormForCursor();
  render();
  moveOfferShow(job.id, moving.length, job.site);
}

// 11A: the original stays on screen; a short offer opens the new job.
let _moveOfferTimer = null;
function moveOfferHide() {
  if (_moveOfferTimer) { clearTimeout(_moveOfferTimer); _moveOfferTimer = null; }
  try { document.querySelectorAll('.move-offer').forEach(el => el.remove()); } catch (e) { /* no DOM */ }
}
function moveOfferShow(jobId, n, title) {
  const app = (typeof document !== 'undefined') ? document.getElementById('app') : null;
  if (!app || !jobId) return false;
  moveOfferHide();
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'move-offer';
  el.setAttribute('data-action', 'move-open-new');
  el.setAttribute('data-arg', jobId);
  el.textContent = `Moved ${n} item${n === 1 ? '' : 's'} to ${title || 'a new job'} \u00b7 Open`;
  app.appendChild(el);
  _moveOfferTimer = setTimeout(moveOfferHide, MOVE_OFFER_MS);
  return true;
}
function openMovedJob(id) {
  moveOfferHide();
  const s = (state.sessions || []).find(x => x && String(x.id) === String(id));
  if (!s) return;
  state.activeId = s.id;
  state.lastLog = null;
  state.cursor = s.items.length;
  loadFormForCursor();
  save();
  setView('overview');
}

// ---------- V102: duplicate a job (roadmap Stage 9 part 2) ----------
// Locked: 1B in Session settings ("Duplicate this job…", below Save/Cancel); 2A
// a sheet like Move's — client + site and More details pre-filled from this job,
// editable, then "Are you sure?" with the counts; 3A job notes copied; 4A photos
// only in the cloud are fetched first, and if any can't be, the sheet says how
// many and offers "Duplicate without them"; 5A the copy opens; 6A always on.
// 9C (V101 round) a FULL copy with new ids for the job, every item and every
// photo; 12A photos copied; 13A a locked job may be duplicated (the copy is not).
//
// ⚠ NEW ITEM IDS, ALWAYS. Photos are found and deleted by item id alone (V101's
// warning above): a copy sharing ids would share — and delete — the original's
// photos, and photosSettleJobs would find each id in two jobs and settle neither.
//
// ⚠ PHOTOS FIRST, THE JOB LAST. photosCopyForItems is one transaction (all or
// nothing); the job is only made once it has succeeded, and made whatever the
// sheet is doing by then — the copy was confirmed, and photos with no job would
// be the worse leftover. The items are copied BEFORE the photos, from the job as
// it is at that moment, so the copy's items and its photos always agree.
//
// Not copied: the certificate number (its own the first time it is made), the
// lock and lock time, export/certificate state, `movedOut`, the retest contact
// status. Everything on the items is copied as it is — results, readings, notes,
// times, map pins — and asset numbers stay the same.
//
// The sheet sits on the Session settings screen, which holds a Save/Cancel form:
// it opens only when nothing there is unsaved, or the edits would be lost behind
// it (the red line says so, in place — no render, MAP rule 3).

function dupJobBlockReason(sess) {
  if (!sess) return 'This job is no longer on this phone.';
  return '';
}

// Anything typed into Session settings and not saved yet.
function editFormDirty(sess) {
  const f = state.editForm;
  if (!sess || !f) return false;
  return String(f.name || '') !== String(sess.name || '') ||
    String(f.site || '') !== String(sess.site || '') ||
    String(f.engineer || '') !== String(sess.engineer || '') ||
    String(f.prefix || '') !== String(sess.prefix || '') ||
    String(f.date || '') !== String(sess.date || '') ||
    !!f.locked !== !!sess.locked ||
    String(f.instrumentId || '') !== String(sess.instrumentId || '');
}

function openDupJob() {
  const sess = activeSession();
  if (!sess) return;
  if (editFormDirty(sess)) {
    try { const el = document.getElementById('ef-dup-error'); if (el) el.textContent = 'Save or cancel your changes first.'; } catch (e) { /* no DOM */ }
    return;
  }
  const why = dupJobBlockReason(sess);
  const parts = splitSiteSnapshot(sess.site || '');
  state.dupJob = why
    ? { step: 'blocked', why, from: sess.id }
    : {
        step: 'form', from: sess.id,
        client: parts.client, site: parts.site,
        client0: parts.client, site0: parts.site,   // unchanged → the original's own links
        name: (sess.name ? sess.name + ' (copy)' : ''),
        date: sess.date || todayISO(),
        engineer: sess.engineer || '',
        instrumentId: sess.instrumentId || '',
        prefix: sess.prefix || '',
        error: '', failed: 0, skipCloud: false
      };
  render();
}

function closeDupJob() {
  const m = state.dupJob;
  if (m && m.step === 'working') return;   // nothing to cancel half-way
  state.dupJob = null;
  render();
}

// Field edits arrive here from data-input-action (no render — MAP rule 3).
function setDupJobField(field, value) {
  const m = state.dupJob;
  if (!m || m.step !== 'form') return;
  if (['client', 'site', 'name', 'date', 'engineer', 'instrumentId', 'prefix'].indexOf(field) === -1) return;
  m[field] = String(value == null ? '' : value);
}

// What the copy will hold: items, fails, photos (on this phone and only in the
// cloud) and roughly how much space the photos take.
function dupJobSummary(sess) {
  const out = { n: 0, fails: 0, photos: 0, cloud: 0, bytes: 0 };
  if (!sess || !Array.isArray(sess.items)) return out;
  const ids = new Set();
  for (const it of sess.items) {
    if (!it) continue;
    out.n++;
    if (it.result === 'fail') out.fails++;
    if (it.id != null) ids.add(String(it.id));
    out.photos += (typeof photoCountForItem === 'function') ? photoCountForItem(it.id) : 0;
  }
  const meta = state.photoMeta || {};
  for (const id of Object.keys(meta)) if (meta[id] && ids.has(String(meta[id].i))) out.bytes += meta[id].b || 0;
  const cloud = (typeof photoCloudOnlyForSession === 'function') ? photoCloudOnlyForSession(sess) : [];
  out.cloud = cloud.length;
  out.photos += cloud.length;
  for (const e of cloud) out.bytes += e.b || 0;
  return out;
}

function dupJobContinue() {
  const m = state.dupJob;
  if (!m || m.step !== 'form') return;
  if (!String(m.client || '').trim() && !String(m.site || '').trim()) {
    m.error = 'Enter a client or a site for the copy.';
    try { const el = document.getElementById('dup-job-error'); if (el) el.textContent = m.error; } catch (e) { /* no DOM */ }
    return;
  }
  m.error = '';
  m.step = 'confirm';
  render();
}

function dupJobBack() {
  const m = state.dupJob;
  if (!m || (m.step !== 'confirm' && m.step !== 'partial')) return;
  m.step = 'form';
  m.skipCloud = false;
  render();
}

// Progress, written in place: the working step has no buttons, but a repaint
// per photo would be pointless churn.
function _dupJobProgress(text) {
  try { const el = document.getElementById('dup-job-progress'); if (el) el.textContent = text; } catch (e) { /* no DOM */ }
}

// The Duplicate button (and "Duplicate without them"). Resolves when done, for
// the harness; the app ignores the promise.
function duplicateJob(skipCloud) {
  const m = state.dupJob;
  if (!m || (m.step !== 'confirm' && m.step !== 'partial')) return Promise.resolve(false);
  const sess = (state.sessions || []).find(s => s && String(s.id) === String(m.from));
  if (!sess) { state.dupJob = { step: 'blocked', why: dupJobBlockReason(null), from: m.from }; render(); return Promise.resolve(false); }
  if (skipCloud) m.skipCloud = true;
  const cloud = m.skipCloud ? [] : ((typeof photoCloudOnlyForSession === 'function') ? photoCloudOnlyForSession(sess) : []);
  m.step = 'working';
  render();
  // 4A: fetched first. syncPhotoDownload answers "failed" for all of them when
  // signed out or offline, so the one question covers every reason.
  const fetch = (cloud.length && typeof syncPhotoDownload === 'function')
    ? syncPhotoDownload(cloud.map(e => e.id), (done, all) => _dupJobProgress(`Fetching photos from the cloud\u2026 ${done} of ${all}`))
    : Promise.resolve({ got: 0, failed: 0 });
  return Promise.resolve(fetch).then((res) => {
    if (res && res.failed > 0) {
      if (state.dupJob !== m) return false;   // the sheet went: nothing was copied
      m.step = 'partial';
      m.failed = res.failed;
      render();
      return false;
    }
    return _dupJobCommit(m);
  }).catch((e) => { console.error('duplicateJob failed', e); return _dupJobFail(m); });
}

function _dupJobFail(m, why) {
  if (state.dupJob === m) {
    state.dupJob = { step: 'blocked', from: m.from,
      why: why || 'The copy could not be made. Nothing was duplicated \u2014 try again.' };
    render();
  }
  return false;
}

function _dupJobCommit(m) {
  const sess = (state.sessions || []).find(s => s && String(s.id) === String(m.from));
  if (!sess) return _dupJobFail(m, dupJobBlockReason(null));
  _dupJobProgress('Copying\u2026');
  // The items, now: new ids, everything else as it is.
  const itemMap = new Map();
  const items = (sess.items || []).filter(Boolean).map((it) => {
    const c = JSON.parse(JSON.stringify(it));
    c.id = newId();
    // Lifetime stats count an item and its copies once (statsKeyOf).
    if (it.id != null && (it.copyOf == null || String(it.copyOf) === '')) c.copyOf = String(it.id);
    if (it.id != null) itemMap.set(String(it.id), c.id);
    return c;
  });
  // The job's own fields, from the same moment.
  const src = JSON.parse(JSON.stringify(sess));
  const jobId = newId();
  const copyPhotos = (typeof photosCopyForItems === 'function')
    ? photosCopyForItems(itemMap, jobId) : Promise.resolve({ ok: true, n: 0 });
  return copyPhotos.then((r) => {
    if (!r || !r.ok) {
      return _dupJobFail(m, 'The photos could not be copied \u2014 this phone may be short of space. Nothing was duplicated.');
    }
    const job = _dupJobBuild(m, src, jobId, items);
    state.sessions.unshift(job);
    state.sessions = state.sessions.slice();
    if (state.dupJob === m) {
      // 5A: open the copy.
      state.dupJob = null;
      state.activeId = job.id;
      state.lastLog = null;
      state.cursor = job.items.length;
      loadFormForCursor();
      save();
      setView('overview');
      showToast('Duplicated \u2014 this is the copy');
    } else {
      save();
      showToast(`Duplicated ${job.site || job.name || 'the job'}`);
    }
    return job;
  });
}

// The copy's job record. `src` is the original as it was when copying began.
function _dupJobBuild(m, src, jobId, items) {
  const clientName = String(m.client || '').trim();
  const siteName = String(m.site || '').trim();
  let site, clientId = '', siteId = '';
  if (clientName === String(m.client0 || '').trim() && siteName === String(m.site0 || '').trim()) {
    // Unchanged: exactly the original's title and links — never a new list entry
    // made from a title that was edited in Session settings.
    site = src.site || '';
    clientId = src.clientId || '';
    siteId = src.siteId || '';
  } else {
    // Same resolution as createSession() / the move.
    let clientRec = null, siteRec = null;
    if (clientName && siteName) {
      clientRec = ensureClient(clientName);
      if (clientRec) siteRec = ensureSite(clientRec.id, siteName);
    } else if (clientName) {
      clientRec = ensureClient(clientName);
    } else {
      siteRec = ensureOrphanSite(siteName);
    }
    site = moveJobTitle(clientName, siteName);
    clientId = clientRec ? clientRec.id : '';
    siteId = siteRec ? siteRec.id : '';
  }
  const now = new Date().toISOString();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(m.date || '')) ? m.date : (src.date || todayISO());
  const job = {
    id: jobId,
    name: String(m.name || '').trim() || `Session ${state.sessions.length + 1}`,
    site,
    clientId,
    siteId,
    engineer: String(m.engineer || '').trim(),
    prefix: String(m.prefix || '').trim(),
    date,
    startNumber: src.startNumber || 1,
    instrumentId: String(m.instrumentId || ''),
    items,
    locked: false,              // 13A: a locked job may be copied; the copy is open
    notes: src.notes || '',     // 3A
    certNo: '',                 // its own number, the first time it is made
    userId: null,
    lastModified: now,
    syncedAt: null
  };
  if (src.startPad) job.startPad = src.startPad;
  if (src.instrumentSnapshot && job.instrumentId === String(src.instrumentId || '')) {
    job.instrumentSnapshot = JSON.parse(JSON.stringify(src.instrumentSnapshot));
  }
  if (src.retestTrack) { job.retestTrack = true; job.retestMonths = src.retestMonths; job.retestContact = null; }
  normaliseSessionRetest(job);
  return job;
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
  // v19: clientId/siteId refs are convenience-only and never drive display, CSV,
  // or search (the `site` text snapshot does).
  // V98: the site link now decides whose SITE NOTES a job shows, so a changed
  // site text re-links the job to the saved site it now names ('' when it names
  // none — siteForSession() then falls back to the text). Nothing is created, and
  // an unchanged text leaves the link alone (a site renamed in Clients & Sites
  // keeps its old jobs). The text changes in the same step, so _sessionSig()
  // sees the edit; the explicit invalidate covers siteId, which it doesn't list.
  const newSite = String(site).trim();
  if (newSite !== String(sess.site || '').trim()) {
    const parts = splitSiteSnapshot(newSite);
    const linked = siteForNames(parts.client, parts.site);
    sess.siteId = linked ? linked.id : '';
    if (typeof _invalidateSessionEncoding === 'function') _invalidateSessionEncoding(sess);
  }
  sess.site = newSite;
  sess.engineer = String(engineer).trim();
  sess.prefix = String(prefix).trim();
  sess.date = date || sess.date;
  // V100 (1A): the lock TIME. Stamped only on the change to locked; removed on
  // unlock, so it is absent unless the job is locked (sync rule 36). Re-saving a
  // job that was already locked keeps its time.
  const wasLocked = !!sess.locked;
  sess.locked = !!locked;   // v8
  if (sess.locked && !wasLocked) sess.lockedAt = new Date().toISOString();
  else if (!sess.locked) delete sess.lockedAt;
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
  delete sess.lockedAt;   // V100
  save(); render();
}
