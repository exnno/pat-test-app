/*!
 * PATGo PWA — sync.js (cloud sync: push)
 * v80 (September 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 *
 * V80: JOBS ONLY, ONE WAY — phone → cloud. Nothing is ever read back from the
 * server and nothing on the phone is ever changed by this file. Clients, sites,
 * presets, settings and photos follow in later releases; pull arrives in V81.
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
 * focused or a sheet is open.
 */

let _syncTimer = null;          // debounce / "soon" timer
let _syncRunning = null;        // the in-flight push promise, if any
let _syncAgain = false;         // a trigger arrived mid-push: run once more
let _syncAgainForce = false;

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
  return { userId: userId || '', sent: {}, gone: {}, lastPushAt: null };
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
  if (typeof raw.lastPushAt === 'string' && !isNaN(Date.parse(raw.lastPushAt))) out.lastPushAt = raw.lastPushAt;
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
  return { total: jobs.length, upToDate, waiting: jobs.length - upToDate, lastPushAt: st.lastPushAt };
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

// ---- triggers ------------------------------------------------------------------
// Called from saveSessions() on the logging hot path: a status check and a
// timer reset, nothing more. Rapid logging keeps pushing the timer back, so a
// push happens once the engineer pauses.
function syncNoteSave() {
  if (!syncActive()) return;
  syncPushSoon(SYNC_DEBOUNCE_MS);
}

function syncPushSoon(ms) {
  if (!syncActive()) return;
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => { _syncTimer = null; syncPush(); }, Math.max(0, ms || 0));
}

// Boot: the push-on-reopen and back-online listeners, and one push shortly after
// the first paint. On a host with no cloud this registers nothing at all.
function syncBoot() {
  if (typeof cloudAvailable !== 'function' || !cloudAvailable()) return;
  try {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') return;
      syncPushSoon(SYNC_RESUME_DELAY_MS);
    });
  } catch { /* no document events: the save trigger still works */ }
  try {
    window.addEventListener('online', () => syncPushSoon(SYNC_RESUME_DELAY_MS));
  } catch { /* ditto */ }
  if (syncActive() && !_syncOffline()) syncPushSoon(SYNC_BOOT_DELAY_MS);
}

// ---- the push ------------------------------------------------------------------
// opts.force  — ignore the fingerprints and send every job ("Re-send all jobs")
// opts.manual — a button press: explain "no signal" rather than staying silent
function syncPush(opts) {
  const o = opts || {};
  if (!syncActive()) return Promise.resolve(false);
  if (_syncRunning) {
    _syncAgain = true;
    if (o.force) _syncAgainForce = true;
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
  _syncRunning = _syncRun(!!o.force)
    .then((r) => {
      state.sync.message = r.sent || r.deleted
        ? 'Sent ' + r.sent + ' job' + (r.sent === 1 ? '' : 's')
          + (r.deleted ? ' and ' + r.deleted + ' deletion' + (r.deleted === 1 ? '' : 's') : '') + '.'
        : 'Everything was already up to date.';
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
        _syncAgain = false;
        _syncAgainForce = false;
        return syncPush({ force }).then(() => ok);
      }
      return ok;
    });
  return _syncRunning;
}

function _syncRun(force) {
  return cloudClient().then((c) => c.auth.getSession().then((res) => {
    const session = res && res.data ? res.data.session : null;
    const uid = session && session.user ? session.user.id : '';
    if (!uid) { const e = new Error('not signed in'); e.syncStage = 'auth'; throw e; }
    const st = _syncStateFor(uid);
    const now = new Date().toISOString();
    const work = [];
    const live = new Set();

    for (const s of _syncSessions()) {
      const id = String(s.id);
      live.add(id);
      const json = JSON.stringify(s);
      const hash = syncHash(json);
      if (!force && st.sent[id] === hash) continue;
      work.push({ id, hash, gone: false, bytes: json.length,
        row: { id, user_id: uid, doc: JSON.parse(json), deleted: false, last_modified: now } });
    }

    // Deletions (decision 4A): the cloud copy is emptied, and the row kept as a
    // marker so other devices learn of the delete. Only for jobs this phone has
    // sent — a delete of something the server never had is not sent at all.
    for (const t of (state.tombstones || [])) {
      if (!t || t.kind !== 'session') continue;
      const id = String(t.id);
      if (live.has(id)) continue;                    // restored since: it's live
      if (!st.sent[id] && !st.gone[id]) continue;    // server never had it
      if (st.gone[id] && !force) continue;           // already sent
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
  }));
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
