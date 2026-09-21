/*!
 * PATGo PWA — sync.js (cloud sync: push and pull)
 * v81 (September 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 *
 * V80: JOBS ONLY, ONE WAY — phone → cloud.
 * V81: the other direction. Jobs still, but now read back as well, so two
 * phones on one account converge. Clients, sites, presets, settings and photos
 * still do not sync — a job pulled onto a second phone will show photos it does
 * not have, which is the same as restoring a backup onto a new phone and fails
 * soft the same way.
 *
 * ⚠ THIS FILE NOW WRITES APP DATA. Through V80 it only ever read state and
 * wrote its own keys. From V81 the pull adds, replaces and deletes jobs, which
 * makes every rule below load-bearing rather than merely tidy.
 *
 * WHAT DECIDES A DISAGREEMENT (V81 decision 1A). Not timestamps. The server's
 * `last_modified` is the time a change was NOTICED (pushed), not made, and a
 * local job's `lastModified` is stamped once at creation — so neither side
 * holds an edit time to compare. The fingerprint does the job instead: if a
 * local job still hashes to what this phone last sent, this phone has nothing
 * unsent, so a differing cloud row must be the other phone's newer work and is
 * applied. If it does NOT hash to what was last sent, both sides have moved and
 * nothing is applied — see the hold rules.
 *
 * NOTHING IS EVER OVERWRITTEN BY GUESSWORK (decision 2A). A job the pull will
 * not decide on its own is HELD: the phone's copy is left exactly as it is, the
 * cursor does not advance past it, and the Sync page asks. Held rows record ids
 * and item counts only — never the cloud document. The document is re-read from
 * the server if and only if the cloud copy is the one chosen, so this file
 * never becomes a second, stale store of the engineer's work.
 *
 * THE CURSOR STOPS AT THE FIRST UNRESOLVED ROW. When anything is held, the
 * pulled-to mark is left where it was for the whole run, rather than being
 * advanced to some high-water mark with a gap behind it. The next pull re-reads
 * rows that were already applied; each one now hashes to its own fingerprint
 * and resolves as no work. Re-reading a few rows is cheap; a gap in the cursor
 * is a change that is never seen again.
 *
 * ⚠ OPTIONAL SUBSYSTEM (MAP rule 6). Every call INTO this file is
 * typeof-guarded, and boot wraps syncBoot() in try/catch. A missing or broken
 * sync.js must never stop the app starting, stop a save, or touch the fail flow.
 *
 * ⚠ SYNC OBSERVES, IT NEVER WRITES APP DATA. It reads state.sessions and
 * state.tombstones and writes ONLY its own two keys (SYNC_STATE_KEY,
 * SYNC_PRUNED_KEY). The phone stays the record of truth throughout V80.
 *
 * WHY A FINGERPRINT, NOT lastModified (V80 decision 3A). A session's
 * `lastModified` is stamped once at creation and never again, and the export
 * "dirty" flag only covers item edits on already-exported jobs. Stamping every
 * edit path would mean a dozen call sites, and the one that gets missed is a
 * change that silently never syncs. Instead this file keeps, per job, a hash of
 * exactly what it last sent; a job whose hash no longer matches goes again. No
 * edit path can be missed because none is involved. The cost: `last_modified`
 * on the server is when the change was NOTICED (the push), not when it was made.
 *
 * WHY THE HASH IS CAPTURED AT BUILD TIME. The row and its hash come from the
 * same JSON string. If the engineer edits the job while a push is in flight,
 * the recorded hash is the OLD one, so the next run sees a mismatch and sends
 * the edit. Recomputing after the upload would mark an unsent edit as sent.
 *
 * ⚠ SYNC STATE BELONGS TO ONE ACCOUNT. SYNC_STATE_KEY records whose account the
 * hashes describe. A different account on the same phone starts from nothing
 * and sends everything; nothing one account sent counts for another.
 *
 * ⚠ NEVER render() FROM A PROMISE (MAP rules 2/3). Results land through
 * _syncRepaint(), which only repaints the Sync page, and never while a field is
 * focused or a sheet is open. This is why the pull applies its changes and then
 * repaints once, rather than calling the app's own deleteSession() — that one
 * ends in save() and render(), which from inside a promise would tear down a
 * focused field mid-job.
 *
 * ⚠ THE JOB ON SCREEN IS NEVER TOUCHED (decision 7A). A cloud row for
 * state.activeId is held for the run and retried on the next one. Rewriting the
 * items of the job someone is standing in would change what is under their
 * thumb between one tap and the next.
 *
 * ⚠ THE ENCODING CACHE (spec section 6, the v69 bug). storage.js reuses a
 * session's stored encoding when the items array reference and _sessionSig()
 * are unchanged — and the sig covers item COUNT, not contents. An applied row
 * therefore REPLACES the session object rather than editing the old one in
 * place: a new object has no cache entry, so it cannot be written back from a
 * stale one. The object being replaced is invalidated anyway, because anything
 * else still holding that reference would otherwise carry the stale encoding.
 */

let _syncTimer = null;          // debounce / "soon" timer
let _syncRunning = null;        // the in-flight push promise, if any
let _syncAgain = false;         // a trigger arrived mid-run: run once more
let _syncAgainForce = false;
let _syncAgainPull = false;     // v81: …and that trigger wanted a pull

// ---- gates -------------------------------------------------------------------
// Signed in, on a host with a cloud. Offline is checked separately, because
// "signed in but no signal" still matters to the prune guard.
function syncActive() {
  return typeof cloudAvailable === 'function' && cloudAvailable()
      && !!state.cloud && state.cloud.status === 'signed-in';
}

function _syncOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

// ---- fingerprint -------------------------------------------------------------
// cyrb53: a fast 53-bit string hash. Not cryptographic and doesn't need to be —
// the only question it answers is "is this the exact JSON we sent last time?"
function syncHash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + ':' + str.length.toString(36);
}

// The jobs that sync. The example job never leaves the phone.
function _syncSessions() {
  const flag = (typeof DEMO_SESSION_FLAG !== 'undefined') ? DEMO_SESSION_FLAG : 'isExample';
  return (state.sessions || []).filter(s => s && s.id != null && s.id !== '' && !s[flag]);
}

// ---- sync state (SYNC_STATE_KEY) -----------------------------------------------
// { userId, sent: {sessionId: hash}, gone: {sessionId: true}, lastPushAt }
// Whitelisting read: anything malformed collapses to an empty state, which only
// ever means "send everything again" — the safe direction.
function _syncEmpty(userId) {
  // v81: `resend` is the explicit "send this one whatever the fingerprint says"
  // set, written when a held job is resolved in the phone's favour. Without it,
  // choosing the phone's copy would have to fake a fingerprint mismatch, and a
  // fake value in the store is a value someone later reads as real.
  return { userId: userId || '', sent: {}, gone: {}, resend: {}, lastPushAt: null,
           pulledAt: null, lastPullAt: null };
}

function _syncLoad() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(SYNC_STATE_KEY) || 'null'); } catch { raw = null; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return _syncEmpty('');
  const out = _syncEmpty(typeof raw.userId === 'string' ? raw.userId : '');
  if (raw.sent && typeof raw.sent === 'object' && !Array.isArray(raw.sent)) {
    for (const k of Object.keys(raw.sent)) if (typeof raw.sent[k] === 'string') out.sent[k] = raw.sent[k];
  }
  if (raw.gone && typeof raw.gone === 'object' && !Array.isArray(raw.gone)) {
    for (const k of Object.keys(raw.gone)) if (raw.gone[k] === true) out.gone[k] = true;
  }
  if (raw.resend && typeof raw.resend === 'object' && !Array.isArray(raw.resend)) {
    for (const k of Object.keys(raw.resend)) if (raw.resend[k] === true) out.resend[k] = true;
  }
  if (typeof raw.lastPushAt === 'string' && !isNaN(Date.parse(raw.lastPushAt))) out.lastPushAt = raw.lastPushAt;
  // v81. A missing or unreadable cursor means "read the account from the
  // beginning" — the safe direction, exactly as a missing fingerprint means
  // "send it again". A phone upgrading from V80 lands here on its first run.
  if (typeof raw.pulledAt === 'string' && !isNaN(Date.parse(raw.pulledAt))) out.pulledAt = raw.pulledAt;
  if (typeof raw.lastPullAt === 'string' && !isNaN(Date.parse(raw.lastPullAt))) out.lastPullAt = raw.lastPullAt;
  return out;
}

function _syncSave(st) {
  try { localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(st)); } catch (e) {
    console.error('Sync state could not be saved (non-fatal).', e);
  }
}

// The state for THIS account, or a fresh one if the stored state is someone else's.
function _syncStateFor(userId) {
  const st = _syncLoad();
  return (userId && st.userId === userId) ? st : _syncEmpty(userId);
}

function _syncCurrentUserId() {
  return (typeof cloudUserId === 'function') ? cloudUserId() : '';
}

// ---- status (Sync page, prune guard) ---------------------------------------------
// Synchronous: hashes every job, so call it only where that's affordable (the
// Sync page render, a prune confirm) — never on the logging hot path.
function syncStatusSummary() {
  const uid = _syncCurrentUserId();
  const st = _syncStateFor(uid);
  const jobs = _syncSessions();
  let upToDate = 0;
  for (const s of jobs) {
    if (st.sent[String(s.id)] === syncHash(JSON.stringify(s))) upToDate++;
  }
  return {
    total: jobs.length, upToDate, waiting: jobs.length - upToDate,
    lastPushAt: st.lastPushAt,
    // v81
    lastPullAt: st.lastPullAt,
    held: _syncHeldLoad().length,
  };
}

// V80 decision 5A. Clearing old jobs is local housekeeping and the cloud keeps
// them — but only a job whose LATEST version is in the cloud may be cleared
// while signed in, or the clear would take the only copy of an edit with it.
// Signed out: unchanged pre-V80 behaviour, every target is clearable.
function syncPruneFilter(targets) {
  const list = Array.isArray(targets) ? targets : [];
  if (!syncActive()) return { clear: list.slice(), kept: [], active: false };
  const uid = _syncCurrentUserId();
  const st = _syncLoad();
  const mine = !!uid && st.userId === uid;
  const clear = [], kept = [];
  for (const s of list) {
    const ok = mine && s && st.sent[String(s.id)] === syncHash(JSON.stringify(s));
    (ok ? clear : kept).push(s);
  }
  return { clear, kept, active: true };
}

// ---- cleared-jobs list (SYNC_PRUNED_KEY) ---------------------------------------
// Ids of jobs cleared from THIS phone that the cloud still holds, so the pull
// (V81) does not bring them straight back. Recorded only for jobs this phone has
// actually sent — anything else the server never had. No retention window: the
// cloud copy has none either. Rides in backups; merged, never replaced, on restore.
function _syncPrunedNormalise(list) {
  const out = [];
  const seen = new Set();
  if (!Array.isArray(list)) return out;
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    const id = (typeof e.id === 'string' || typeof e.id === 'number') ? String(e.id) : '';
    if (!id || seen.has(id)) continue;
    const at = (typeof e.at === 'string' && !isNaN(Date.parse(e.at))) ? e.at : new Date(0).toISOString();
    seen.add(id);
    out.push({ id, at });
  }
  return out;
}

function _syncPrunedLoad() {
  try { return _syncPrunedNormalise(JSON.parse(localStorage.getItem(SYNC_PRUNED_KEY) || '[]')); }
  catch { return []; }
}

function _syncPrunedSave(list) {
  const clean = _syncPrunedNormalise(list);
  try {
    if (clean.length) localStorage.setItem(SYNC_PRUNED_KEY, JSON.stringify(clean));
    else localStorage.removeItem(SYNC_PRUNED_KEY);
  } catch (e) { console.error('Cleared-jobs list could not be saved (non-fatal).', e); }
}

function syncNotePruned(ids) {
  const st = _syncLoad();
  const list = _syncPrunedLoad();
  const now = new Date().toISOString();
  let changed = false;
  for (const raw of (ids || [])) {
    const id = String(raw);
    if (!st.sent[id]) continue;                       // never sent: nothing to remember
    if (list.some(e => e.id === id)) continue;
    list.push({ id, at: now });
    changed = true;
  }
  if (changed) _syncPrunedSave(list);
}

// For buildBackup(). undefined when empty, so a backup from a phone that never
// synced is byte-for-byte what it was before V80.
function syncPrunedList() {
  const list = _syncPrunedLoad();
  return list.length ? list : undefined;
}

// For restore. UNION, not replace: the list's only effect is "don't download
// this again", so keeping an extra id is harmless and losing one is not.
function syncPrunedMerge(incoming) {
  const add = _syncPrunedNormalise(incoming);
  if (!add.length) return;
  const list = _syncPrunedLoad();
  const have = new Set(list.map(e => e.id));
  for (const e of add) if (!have.has(e.id)) list.push(e);
  _syncPrunedSave(list);
}

// ---- held jobs (SYNC_HELD_KEY) -------------------------------------------------
// v81 decision 2A. A job the pull will not decide on its own. The phone's copy
// is untouched; this records only enough to ask the question — the id, why, the
// job's name and the two item counts. The cloud DOCUMENT is deliberately not
// kept: a held row can sit for days, and a copy of the engineer's work stored
// against a stale decision is a second source of truth waiting to be believed.
//
// The reasons, and what each means:
//   both-changed     this phone and the cloud have both moved since the last push
//   fewer-items      the cloud copy has fewer items than this phone's (decision 3A)
//   deleted-elsewhere the cloud says deleted, but this phone has unsent changes
//   deleted-here     this phone deleted it, the cloud has it live again
//   unreadable       the cloud row did not survive the validator (decision 8A)
//
// NOT held, because they need no decision and resolve themselves: a row for the
// job on screen (decision 7A) and anything already in SYNC_PRUNED_KEY. Both are
// simply skipped for the run, which holds the cursor, and retried on the next.
function _syncHeldNormalise(list) {
  const out = [];
  const seen = new Set();
  const reasons = ['both-changed', 'fewer-items', 'deleted-elsewhere', 'deleted-here', 'unreadable'];
  if (!Array.isArray(list)) return out;
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    const id = (typeof e.id === 'string' || typeof e.id === 'number') ? String(e.id) : '';
    if (!id || seen.has(id)) continue;
    if (reasons.indexOf(e.reason) === -1) continue;
    const at = (typeof e.at === 'string' && !isNaN(Date.parse(e.at))) ? e.at : new Date(0).toISOString();
    const num = (v) => (typeof v === 'number' && isFinite(v) && v >= 0) ? Math.floor(v) : null;
    seen.add(id);
    out.push({
      id, at, reason: e.reason,
      name: typeof e.name === 'string' ? e.name : '',
      localItems: num(e.localItems),
      cloudItems: num(e.cloudItems),
    });
  }
  return out;
}

function _syncHeldLoad() {
  try { return _syncHeldNormalise(JSON.parse(localStorage.getItem(SYNC_HELD_KEY) || '[]')); }
  catch { return []; }
}

function _syncHeldSave(list) {
  const clean = _syncHeldNormalise(list);
  try {
    if (clean.length) localStorage.setItem(SYNC_HELD_KEY, JSON.stringify(clean));
    else localStorage.removeItem(SYNC_HELD_KEY);
  } catch (e) { console.error('Held-jobs list could not be saved (non-fatal).', e); }
}

// Record (or refresh) one held job. Refreshing matters: the same row is re-read
// on every run while it is held, and the counts may have moved on either side.
function _syncHeldNote(entry) {
  const list = _syncHeldLoad().filter(e => e.id !== String(entry.id));
  list.push(Object.assign({ at: new Date().toISOString() }, entry, { id: String(entry.id) }));
  _syncHeldSave(list);
}

function _syncHeldClear(id) {
  const sid = String(id);
  const list = _syncHeldLoad();
  const out = list.filter(e => e.id !== sid);
  if (out.length !== list.length) _syncHeldSave(out);
}

// For the Sync page. Newest question first.
function syncHeldList() {
  return _syncHeldLoad().sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

// ---- the validator (decision 8A) -----------------------------------------------
// Relaxed on purpose, and deliberately NOT a schema check. Jobs gain fields
// release by release, and a phone on an older version must be able to read a row
// written by a newer one — so this asks only what the app itself cannot survive
// without: an object, the id it was filed under, and an items ARRAY, which is
// indexed unguarded all over the app. Anything else passes through untouched.
// A row that fails is held as 'unreadable' rather than dropped, so the cursor
// does not march past a row nobody ever looked at.
function _syncValidDoc(doc, id) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false;
  if (doc.id == null || String(doc.id) !== String(id)) return false;
  if (!Array.isArray(doc.items)) return false;
  return true;
}

// ---- triggers ------------------------------------------------------------------
// Called from saveSessions() on the logging hot path: a status check and a
// timer reset, nothing more. Rapid logging keeps pushing the timer back, so a
// push happens once the engineer pauses.
// ⚠ v81.1, decision 2A — this REVERSES V81's decision 6A, which had the save
// trigger push without reading first. That left a window with no open job in
// it at all: the other phone pushes, this phone edits, its five-second debounce
// fires before anything has pulled, and it overwrites work it never saw. Every
// run now reads before it writes, so a push can only ever follow a look. The
// cost is one filtered request that returns nothing almost every time — small,
// constant, and far cheaper than the failure it prevents.
function syncNoteSave() {
  if (!syncActive()) return;
  syncPushSoon(SYNC_DEBOUNCE_MS, { pull: true });
}

// opts.pull — read the cloud first, then send (sign-in, reopen, back online,
// boot, and the Sync page buttons). Without it this is the V80 push alone.
function syncPushSoon(ms, opts) {
  if (!syncActive()) return;
  const o = opts || {};
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => { _syncTimer = null; syncPush({ pull: !!o.pull }); }, Math.max(0, ms || 0));
}

// Boot: the push-on-reopen and back-online listeners, and one push shortly after
// the first paint. On a host with no cloud this registers nothing at all.
function syncBoot() {
  if (typeof cloudAvailable !== 'function' || !cloudAvailable()) return;
  try {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') return;
      syncPushSoon(SYNC_RESUME_DELAY_MS, { pull: true });
    });
  } catch { /* no document events: the save trigger still works */ }
  try {
    window.addEventListener('online', () => syncPushSoon(SYNC_RESUME_DELAY_MS, { pull: true }));
  } catch { /* ditto */ }
  if (syncActive() && !_syncOffline()) syncPushSoon(SYNC_BOOT_DELAY_MS, { pull: true });
}

// ---- applying what comes back ----------------------------------------------------
// Replace, never edit in place. See the encoding-cache note in the header: a new
// object has no cached encoding and so cannot be written back from a stale one.
// The outgoing object is invalidated too, because activeSession()'s memo and any
// closure taken before this run may still be holding that exact reference.
function _syncReplaceSession(id, oldSess, doc) {
  const i = state.sessions.indexOf(oldSess);
  if (i === -1) return false;
  _invalidateSessionEncoding(oldSess);
  state.sessions[i] = doc;
  return true;
}

// The same three sweeps as deleteSession(), in the same order and for the same
// reason (MAP rule 5: cascades keyed off ids must run BEFORE the removal, or the
// ids are gone and their dependents are orphaned).
//
// ⚠ NOT a call to deleteSession() itself, which ends in save() + render(). This
// runs inside a promise, where render() would tear down a focused field (MAP
// rules 2/3). The duplication is the point of harness 17f: if deleteSession
// ever grows a fourth sweep, that test fails until this grows it too.
function _syncApplyRemoteDelete(id) {
  const going = state.sessions.filter(s => s.id === id);
  if (!going.length) return false;
  archiveSessionStats(going);
  photosDeleteForSessions([id]);
  recordTombstone('session', id);
  state.sessions = state.sessions.filter(s => s.id !== id);
  return true;
}

// ---- the pull ----------------------------------------------------------------------
// Reads rows changed since the cursor and decides each one. Mutates `st` (the
// caller saves it) and counts its work into `out`. Resolves to nothing: the
// caller's push half runs immediately after, on the same state object, so a job
// applied here is already fingerprinted and is not sent straight back.
function _syncPull(c, uid, st, out) {
  const since = st.pulledAt || SYNC_PULL_EPOCH;
  const pruned = new Set(_syncPrunedLoad().map(e => e.id));
  let changed = false;   // a local job was added, replaced or removed
  let blocked = false;   // something was left undecided → the cursor stays put
  let high = since;

  function decide(row) {
    const id = String(row && row.id != null ? row.id : '');
    if (!id) { blocked = true; return; }

    // Deliberately cleared from this phone (V80 decision 5A). The cloud keeps
    // the job as an archive; bringing it back is exactly what clearing meant to
    // avoid. Resolved, not held — there is no question to ask.
    if (pruned.has(id)) return;

    // ⚠ Already answered, in the phone's favour. The row being read is stale by
    // definition — the push half of this very run replaces it. Without this the
    // pull re-raises the question it was just told the answer to, the push then
    // skips it for being held, and the job can never be sent again. Harness 17j.
    if (st.resend[id]) return;

    // ⚠ v81.1, decision 1A. V81 skipped the open job HERE, before anything was
    // decided — and the push half then sent it anyway, because a push is an
    // unconditional overwrite. Two phones editing one job silently lost the
    // other device's work (17q). The open job is now judged like any other: if
    // it clashes it is HELD, which is what stops the push touching it. Only the
    // APPLYING is deferred, at each of the three points below, because that is
    // the part that would change what is under the engineer's thumb.

    const local = (state.sessions || []).find(s => s && String(s.id) === id);
    const tomb = (state.tombstones || []).some(t => t && t.kind === 'session' && String(t.id) === id);
    const name = (local && local.site) || (row.doc && row.doc.site) || '';
    const isOpen = (id === state.activeId);

    // Decision 3A: defer, and say so on the entry screen. Returns true when the
    // caller must stop — the change waits for the engineer to leave the job.
    const defer = (kind) => {
      if (!isOpen) return false;
      blocked = true;
      out.waiting = { id, kind };
      return true;
    };

    if (row.deleted === true) {
      if (!local) {
        // Already gone here. Record that the cloud knows, so the push does not
        // send our own tombstone for it a second time.
        if (tomb || st.sent[id]) { delete st.sent[id]; st.gone[id] = true; }
        _syncHeldClear(id);
        return;
      }
      if (st.sent[id] === syncHash(JSON.stringify(local))) {
        if (defer('delete')) return;
        _syncApplyRemoteDelete(id);
        delete st.sent[id];
        st.gone[id] = true;
        out.removed++; changed = true;
        _syncHeldClear(id);
        return;
      }
      // Deleted on the other phone, edited on this one. The edit exists nowhere
      // else, so it is not being thrown away on a guess.
      _syncHeldNote({ id, reason: 'deleted-elsewhere', name,
        localItems: Array.isArray(local.items) ? local.items.length : null, cloudItems: null });
      blocked = true; out.held++;
      return;
    }

    // Decision 8A: anything unreadable is held, not dropped. A dropped row is a
    // row the cursor moves past and nobody ever sees again.
    if (!_syncValidDoc(row.doc, id)) {
      _syncHeldNote({ id, reason: 'unreadable', name,
        localItems: (local && Array.isArray(local.items)) ? local.items.length : null, cloudItems: null });
      blocked = true; out.held++;
      return;
    }

    const doc = row.doc;
    const hash = syncHash(JSON.stringify(doc));

    if (!local) {
      if (tomb) {
        // Deleted here. If that delete has not reached the cloud yet, the push
        // half of this very run carries it — nothing to decide.
        if (!st.gone[id]) return;
        // It HAS reached the cloud, and the row is live again: the other phone
        // has it back. Deleting someone's work twice over is not a default.
        _syncHeldNote({ id, reason: 'deleted-here', name,
          localItems: null, cloudItems: doc.items.length });
        blocked = true; out.held++;
        return;
      }
      // A job from the other phone. Newest-first, like createSession().
      state.sessions.unshift(doc);
      st.sent[id] = hash;
      out.added++; changed = true;
      _syncHeldClear(id);
      return;
    }

    const localHash = syncHash(JSON.stringify(local));

    // Identical. Usually this phone's own push coming back to it.
    if (hash === localHash) { st.sent[id] = hash; _syncHeldClear(id); return; }

    // Decision 1A. The local copy no longer matches what was last sent, so this
    // phone has changes of its own. Both sides moved; neither wins by default.
    if (st.sent[id] !== localHash) {
      _syncHeldNote({ id, reason: 'both-changed', name,
        localItems: local.items.length, cloudItems: doc.items.length });
      blocked = true; out.held++;
      return;
    }

    // Decision 3A. The local copy is clean, so by 1A the cloud row would apply —
    // but it has fewer items than the phone holds. Applying it would be the one
    // failure this app cannot have, whatever the cause, so it is asked about.
    if (doc.items.length < local.items.length) {
      _syncHeldNote({ id, reason: 'fewer-items', name,
        localItems: local.items.length, cloudItems: doc.items.length });
      blocked = true; out.held++;
      return;
    }

    if (defer('update')) return;
    _syncReplaceSession(id, local, doc);
    st.sent[id] = hash;
    out.applied++; changed = true;
    _syncHeldClear(id);
  }

  // Keyset paging on updated_at. If a whole page shares one timestamp the
  // cursor cannot advance past it, so the run stops and leaves the mark where
  // it was rather than stepping over rows it has not read.
  function page(from) {
    return c.from('sessions')
      .select('id,doc,deleted,last_modified,updated_at')
      .gt('updated_at', from)
      .order('updated_at', { ascending: true })
      .limit(SYNC_PULL_PAGE)
      .then((r) => {
        if (r && r.error) throw r.error;
        const rows = (r && r.data) || [];
        for (const row of rows) {
          decide(row);
          const u = row && row.updated_at;
          if (typeof u === 'string' && u > high) high = u;
        }
        if (rows.length < SYNC_PULL_PAGE) return;
        if (high === from) { blocked = true; return; }
        return page(high);
      });
  }

  return page(since).then(() => {
    // Recomputed every run, never accumulated: if the job was closed, or the
    // other device undid whatever it did, the notice must go by itself.
    state.sync.waiting = out.waiting || null;
    st.lastPullAt = new Date().toISOString();
    if (!blocked) st.pulledAt = high;
    _syncSave(st);
    if (changed) {
      // A new array reference busts activeSession()'s memo (session.js), which
      // validates on the array identity. Individual session objects keep their
      // cached encodings, so this costs one allocation, not a re-encode.
      state.sessions = state.sessions.slice();
      saveSessions();
    }
  });
}

// ---- the push ------------------------------------------------------------------
// opts.force  — ignore the fingerprints and send every job ("Re-send all jobs")
// opts.manual — a button press: explain "no signal" rather than staying silent
// opts.pull   — v81: read the cloud first (sign-in, reopen, back online, boot,
//               and the Sync page buttons — never the save debounce)
function syncPush(opts) {
  const o = opts || {};
  if (!syncActive()) return Promise.resolve(false);
  if (_syncRunning) {
    _syncAgain = true;
    if (o.force) _syncAgainForce = true;
    if (o.pull) _syncAgainPull = true;
    return _syncRunning;
  }
  if (_syncOffline()) {
    if (o.manual) {
      state.sync.message = 'No signal right now. Your jobs are safe on this phone and will be sent when you\u2019re back online.';
      _syncRepaint();
    }
    return Promise.resolve(false);
  }
  state.sync.busy = true;
  state.sync.message = '';
  _syncRepaint();
  _syncRunning = _syncRun({ force: !!o.force, pull: !!o.pull })
    .then((r) => {
      state.sync.message = _syncOutcome(r);
      return true;
    }, (e) => {
      state.sync.message = syncErrorMessage(e);
      return false;
    })
    .then((ok) => {
      state.sync.busy = false;
      _syncRunning = null;
      _syncRepaint();
      if (_syncAgain) {
        const force = _syncAgainForce;
        const pull = _syncAgainPull;
        _syncAgain = false;
        _syncAgainForce = false;
        _syncAgainPull = false;
        return syncPush({ force, pull }).then(() => ok);
      }
      return ok;
    });
  return _syncRunning;
}

// v81: "Check for updates" — a pull followed by the usual push.
function syncPull(opts) {
  const o = opts || {};
  return syncPush({ manual: o.manual !== false, force: !!o.force, pull: true });
}

// One plain line for the Sync page. Held jobs are named last and never as a
// number alone — "1 needs a decision" with nothing else said reads as an error.
function _syncOutcome(r) {
  const p = r.pulled || { applied: 0, added: 0, removed: 0, held: 0 };
  const bits = [];
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const got = p.added + p.applied;
  if (got) bits.push('Brought in ' + plural(got, 'job', 'jobs'));
  if (p.removed) bits.push('removed ' + plural(p.removed, 'job deleted on your other device', 'jobs deleted on your other device'));
  if (r.sent) bits.push((bits.length ? 'sent ' : 'Sent ') + plural(r.sent, 'job', 'jobs'));
  if (r.deleted) bits.push((bits.length ? 'sent ' : 'Sent ') + plural(r.deleted, 'deletion', 'deletions'));
  let msg = bits.length ? bits.join(', ') + '.' : 'Everything was already up to date.';
  if (p.held) {
    msg += ' ' + plural(p.held, 'job needs', 'jobs need') + ' you to decide \u2014 see below.';
  }
  return msg;
}

// v81: pull first, then push, over ONE state object (spec section 5). The order
// is load-bearing in both directions — a job applied by the pull is
// fingerprinted before the push looks at it, so it is not sent straight back,
// and a delete recorded here is sent in the same run.
function _syncRun(o) {
  const opts = o || {};
  return cloudClient().then((c) => c.auth.getSession().then((res) => {
    const session = res && res.data ? res.data.session : null;
    const uid = session && session.user ? session.user.id : '';
    if (!uid) { const e = new Error('not signed in'); e.syncStage = 'auth'; throw e; }
    const st = _syncStateFor(uid);
    const pulled = { applied: 0, added: 0, removed: 0, held: 0, waiting: null };
    const first = opts.pull ? _syncPull(c, uid, st, pulled) : Promise.resolve();
    return first
      .then(() => _syncPushHalf(c, uid, st, !!opts.force))
      .then((r) => ({ sent: r.sent, deleted: r.deleted, pulled }));
  }));
}

function _syncPushHalf(c, uid, st, force) {
  return Promise.resolve().then(() => {
    const now = new Date().toISOString();
    const work = [];
    const live = new Set();
    // ⚠ v81. A held job is a question that has not been answered, and sending
    // this phone's copy would answer it — on the server, silently, in this
    // phone's favour, before anyone was asked. Found by harness 17k: without
    // this, choosing "use the cloud copy" fetched back what the push had just
    // overwritten it with. Nothing held moves in either direction until the
    // engineer says which copy wins; resolving clears the hold first, so the
    // answer is still sent immediately.
    const heldIds = new Set(_syncHeldLoad().map(e => e.id));

    for (const s of _syncSessions()) {
      const id = String(s.id);
      live.add(id);
      if (heldIds.has(id)) continue;
      const json = JSON.stringify(s);
      const hash = syncHash(json);
      // v81: `resend` is set when a held job was resolved in the phone's
      // favour — the cloud copy is to be overwritten even though nothing local
      // changed since the last push.
      if (!force && !st.resend[id] && st.sent[id] === hash) continue;
      work.push({ id, hash, gone: false, bytes: json.length,
        row: { id, user_id: uid, doc: JSON.parse(json), deleted: false, last_modified: now } });
    }

    // Deletions (decision 4A): the cloud copy is emptied, and the row kept as a
    // marker so other devices learn of the delete. Only for jobs this phone has
    // sent — a delete of something the server never had is not sent at all.
    for (const t of (state.tombstones || [])) {
      if (!t || t.kind !== 'session') continue;
      const id = String(t.id);
      if (heldIds.has(id)) continue;                 // awaiting a decision
      if (live.has(id)) continue;                    // restored since: it's live
      if (!st.sent[id] && !st.gone[id] && !st.resend[id]) continue;  // server never had it
      if (st.gone[id] && !force && !st.resend[id]) continue;          // already sent
      const at = (typeof t.at === 'string' && !isNaN(Date.parse(t.at))) ? t.at : now;
      work.push({ id, hash: null, gone: true, bytes: 64,
        row: { id, user_id: uid, doc: {}, deleted: true, last_modified: at } });
    }

    // Batches by size as well as count: one long job can be hundreds of KB.
    const batches = [];
    let cur = [], size = 0;
    for (const w of work) {
      if (cur.length && (cur.length >= SYNC_BATCH_ROWS || size + w.bytes > SYNC_BATCH_BYTES)) {
        batches.push(cur); cur = []; size = 0;
      }
      cur.push(w); size += w.bytes;
    }
    if (cur.length) batches.push(cur);

    let sent = 0, deleted = 0;
    let chain = Promise.resolve();
    for (const batch of batches) {
      chain = chain
        .then(() => c.from('sessions').upsert(batch.map(w => w.row), { onConflict: 'user_id,id' }))
        .then((r) => {
          if (r && r.error) throw r.error;
          // Record each batch as it lands, so a failure part-way loses nothing
          // already sent and the retry sends only what's left.
          for (const w of batch) {
            delete st.resend[w.id];
            if (w.gone) { delete st.sent[w.id]; st.gone[w.id] = true; deleted++; }
            else { st.sent[w.id] = w.hash; delete st.gone[w.id]; sent++; }
          }
          _syncSave(st);
        });
    }
    return chain.then(() => {
      st.lastPushAt = now;
      _syncSave(st);
      return { sent, deleted };
    });
  });
}

// ---- answering a held job ----------------------------------------------------------
// Two answers, and only two, because there are only two copies: keep this
// phone's, or take the cloud's.
//
//   'phone' — nothing local changes. The job is marked for re-sending, so the
//             next push overwrites the cloud row with what is here. If the job
//             was deleted here, the delete is re-sent instead.
//   'cloud' — the row is re-read from the server and applied as it stands, past
//             every guard, because a person has just looked at it and decided.
//             The document was never stored locally (see SYNC_HELD_KEY), so
//             this is the one place it is fetched.
//
// Either way the run that follows advances the cursor: whichever copy won, the
// two sides now agree, and the row resolves as no work next time round.
function syncHeldResolve(id, choice) {
  const sid = String(id);
  if (!syncActive()) return Promise.resolve(false);
  const entry = _syncHeldLoad().find(e => e.id === sid);
  if (!entry) return Promise.resolve(false);
  if (choice !== 'phone' && choice !== 'cloud') return Promise.resolve(false);

  state.sync.resolving = sid;
  state.sync.message = '';
  _syncRepaint();

  const done = (msg) => {
    state.sync.resolving = null;
    if (msg) state.sync.message = msg;
    _syncRepaint();
  };

  if (choice === 'phone') {
    const uid = _syncCurrentUserId();
    const st = _syncStateFor(uid);
    st.resend[sid] = true;
    delete st.gone[sid];
    _syncSave(st);
    _syncHeldClear(sid);
    done('');
    return syncPush({ manual: true, pull: true }).then(() => true);
  }

  return cloudClient()
    .then((c) => c.from('sessions').select('id,doc,deleted,last_modified,updated_at')
      .eq('id', sid).limit(1)
      .then((r) => {
        if (r && r.error) throw r.error;
        const row = (r && r.data && r.data[0]) || null;
        const uid = _syncCurrentUserId();
        const st = _syncStateFor(uid);
        if (!row) {
          // Gone from the server between the question and the answer. Nothing
          // to apply; the phone's copy simply stands.
          _syncHeldClear(sid);
          _syncSave(st);
          done('That job is no longer in the cloud, so this phone\u2019s copy has been kept.');
          return true;
        }
        const local = (state.sessions || []).find(s => s && String(s.id) === sid);
        if (row.deleted === true) {
          if (local) _syncApplyRemoteDelete(sid);
          delete st.sent[sid];
          st.gone[sid] = true;
        } else if (_syncValidDoc(row.doc, sid)) {
          if (local) _syncReplaceSession(sid, local, row.doc);
          else state.sessions.unshift(row.doc);
          st.sent[sid] = syncHash(JSON.stringify(row.doc));
        } else {
          done('That cloud copy still can\u2019t be read, so nothing has been changed. Choose this phone\u2019s copy to replace it.');
          return false;
        }
        state.sessions = state.sessions.slice();
        saveSessions();
        _syncSave(st);
        _syncHeldClear(sid);
        done('');
        return syncPush({ manual: true, pull: true }).then(() => true);
      }))
    .catch((e) => {
      done(syncErrorMessage(e));
      return false;
    });
}

function syncErrorMessage(err) {
  const status = err && err.status;
  const code = String(err && (err.code || '') || '');
  const msg = String(err && err.message || '');
  if (err && err.syncStage === 'auth') return 'Your sign-in has lapsed. Sign out and back in on the Account page.';
  if (status === 0 || /fetch|network/i.test(msg) || (err && err.name === 'AuthRetryableFetchError')) {
    return 'Couldn\u2019t reach the server. Your jobs are safe on this phone \u2014 try again when you have signal.';
  }
  if (status === 401 || /jwt|PGRST30/i.test(code + ' ' + msg)) {
    return 'Your sign-in has lapsed. Sign out and back in on the Account page.';
  }
  return 'Couldn\u2019t send your jobs' + (msg ? ': ' + msg : '.') + ' They\u2019re safe on this phone.';
}

// ---- UI plumbing -----------------------------------------------------------------
function _syncRepaint() {
  if (state.view !== 'cloudSync') return;
  try {
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
    if (document.querySelector('body > .bulk-sheet, body > .fail-sheet, body > .modal-backdrop')) return;
  } catch { /* no DOM to inspect — fall through */ }
  render();
}
