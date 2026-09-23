/*!
 * PATGo PWA — sync.js (cloud sync: push and pull)
 * v83 (September 2026)
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
 * V82: CLIENTS AND SITES as well, through the `records` table, on exactly the
 * rules jobs follow — fingerprints decide, anything not applied is held, a push
 * only ever follows a pull. See "records" below for the three places they
 * differ (no open-record deferral, no item-count guard, and the Unassigned
 * tidy-up of decision 4A). Held entries now carry a `kind`; an entry written by
 * V81 has none and reads as a job. And the Sync page can now show what actually
 * differs between the two copies of a held job (syncJobDiff / syncHeldDiff).
 *
 * V83: INSTRUMENTS, PRESETS and THE TESTER IN USE, through the same `records`
 * machinery. What is new, and why, is in the "v83" notes beside the code; the
 * short version:
 *   • a tester deleted on the other phone freezes its details onto this phone's
 *     jobs, as a local delete does — but AFTER the jobs have been read, so jobs
 *     that arrive already frozen are not mistaken for jobs edited here too;
 *   • the tester this phone is using is never deleted from under it without
 *     asking (decision 2A);
 *   • which tester is in use travels as a settings row (decision 1B), applied
 *     last, and a phone that has never sent one takes the account's;
 *   • a new phone's untouched starter preset is set aside when the account's
 *     presets arrive (decision 5A). Which PRESET is in use stays per phone (7A).
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
let _syncLastNavPull = 0;       // v81.2: throttles the navigation trigger
let _syncLastRunAt = 0;         // v81.2: when a run last finished, for the backstop
let _syncAllowOpen = null;      // v81.4: the one open job the engineer asked to update

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
           pulledAt: null, lastPullAt: null, hashV: SYNC_HASH_V,
           // v82: the same bookkeeping for clients and sites, kept apart from the
           // jobs' so the two can never be confused. Keyed by record id alone,
           // which is how the server keys them (primary key user_id + id).
           // `kinds` is the SYNC_RECORD_KINDS list the cursor was read with.
           rec: _syncRecEmpty() };
}

// v83: two more fields.
//   freeze — instruments deleted on the other phone whose details are still to be
//            frozen onto this phone's jobs: {instrumentId: {make, model, …}}.
//            This phone's OWN copy of the instrument, taken as it is removed —
//            never the cloud document. Written by the records pull, emptied by
//            _syncFreezePending() once the jobs have been read. See there.
//   inUse  — the tester-in-use value both sides last agreed on (sent, or
//            applied): an instrument id, '' for none, null for never. It is
//            what tells a switch made HERE from one made for this phone when the
//            agreed tester was deleted (decision 1B). This phone's own value.
function _syncRecEmpty() {
  return { sent: {}, gone: {}, resend: {}, pulledAt: null, kinds: '', freeze: {}, inUse: null };
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
  // v81.2: fingerprints written before canonical hashing mean nothing now, so
  // they are dropped rather than left to mismatch for ever. Costs one re-send of
  // every job, once. `gone` survives — a delete already sent is still sent.
  // v82: records bookkeeping. Absent (every phone upgrading from V81) or
  // malformed collapses to empty, which means "read everything and send
  // everything" — the safe direction, exactly as for jobs.
  const rr = raw.rec;
  if (rr && typeof rr === 'object' && !Array.isArray(rr)) {
    const r = out.rec;
    const strMap = (m, dst) => { if (m && typeof m === 'object' && !Array.isArray(m)) for (const k of Object.keys(m)) if (typeof m[k] === 'string') dst[k] = m[k]; };
    const trueMap = (m, dst) => { if (m && typeof m === 'object' && !Array.isArray(m)) for (const k of Object.keys(m)) if (m[k] === true) dst[k] = true; };
    strMap(rr.sent, r.sent);
    trueMap(rr.gone, r.gone);
    trueMap(rr.resend, r.resend);
    if (typeof rr.pulledAt === 'string' && !isNaN(Date.parse(rr.pulledAt))) r.pulledAt = rr.pulledAt;
    if (typeof rr.kinds === 'string') r.kinds = rr.kinds;
    // v83. A frozen copy is only ever five short strings; anything else is
    // garbage and is dropped rather than written onto a job.
    if (rr.freeze && typeof rr.freeze === 'object' && !Array.isArray(rr.freeze)) {
      for (const k of Object.keys(rr.freeze)) {
        const f = rr.freeze[k];
        if (!f || typeof f !== 'object' || Array.isArray(f)) continue;
        const ok = ['make', 'model', 'calDate', 'calCertNo', 'calDue'].every(x => f[x] === undefined || typeof f[x] === 'string');
        if (ok) r.freeze[k] = f;
      }
    }
    if (typeof rr.inUse === 'string') r.inUse = rr.inUse;
  }
  if (raw.hashV !== SYNC_HASH_V) { out.sent = {}; out.rec.sent = {}; }
  else out.hashV = SYNC_HASH_V;
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
    if (st.sent[String(s.id)] === syncHash(_syncCanonical(s))) upToDate++;
  }
  // v82: clients and sites, counted together — the page shows one line for them.
  // v83: instruments and presets get a second line. The tester-in-use row is
  // counted in neither: it is not something on either list, and a count that
  // includes an invisible row is a count nobody can check.
  let recTotal = 0, recUpToDate = 0, listTotal = 0, listUpToDate = 0;
  for (const kind of SYNC_RECORD_KINDS) {
    if (kind === 'settings') continue;
    const cs = _syncRecordGroup(kind) === 'cs';
    for (const r of _syncRecordList(kind)) {
      if (!r || r.id == null || r.id === '') continue;
      const ok = st.rec.sent[String(r.id)] === _syncRecordHash(kind, r);
      if (cs) { recTotal++; if (ok) recUpToDate++; }
      else { listTotal++; if (ok) listUpToDate++; }
    }
  }
  return {
    total: jobs.length, upToDate, waiting: jobs.length - upToDate,
    recTotal, recUpToDate, listTotal, listUpToDate,
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
    const ok = mine && s && st.sent[String(s.id)] === syncHash(_syncCanonical(s));
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
// v82: entries carry a `kind` — 'session', 'client' or 'site'. An entry with no
// kind was written by V81 and is a job. Uniqueness is kind + id. A client or site
// entry also carries the NAMES on each side (localName / cloudName, and for a
// site the client it sits under, localParent / cloudParent) so the card can show
// the difference without a tap (decision 7A). That is a deliberate, narrow
// loosening of the rule above: a name is all a client IS, it is refreshed every
// time the row is re-read, and answering still re-reads the cloud — so what is
// APPLIED is never the stored copy. Jobs still store counts only.
// A parent of '' means "no client"; null means "a client this phone doesn't have".
//
// v83: instruments, presets and the tester in use. Same two name fields, plus:
//   diffs  — for a record changed on both sides, the fields that differ, as
//            short display text: [{label, here, cloud}]. The 7A loosening again,
//            for the same reasons and no further: a few clipped strings,
//            refreshed on every re-read, never what is applied. Without it an
//            instrument whose calibration date changed on both phones would be
//            a card saying "changed" and nothing else (Peter, V82 3A).
//   inUse  — an instrument deleted elsewhere that this phone is USING (2A).
//   onlyOne — a preset deleted elsewhere that is this phone's last (there must
//            always be one), so the card offers only "Keep it".
//
// NOT held, because they need no decision and resolve themselves: a row for the
// job on screen (decision 7A) and anything already in SYNC_PRUNED_KEY. Both are
// simply skipped for the run, which holds the cursor, and retried on the next.
function _syncHeldNormalise(list) {
  const out = [];
  const seen = new Set();
  const reasons = ['both-changed', 'fewer-items', 'deleted-elsewhere', 'deleted-here', 'unreadable'];
  const kinds = ['session'].concat(SYNC_RECORD_KINDS);
  if (!Array.isArray(list)) return out;
  const num = (v) => (typeof v === 'number' && isFinite(v) && v >= 0) ? Math.floor(v) : null;
  const txt = (v) => (typeof v === 'string') ? v.slice(0, 200) : null;
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    const id = (typeof e.id === 'string' || typeof e.id === 'number') ? String(e.id) : '';
    const kind = (e.kind === undefined) ? 'session' : e.kind;   // V81 entries: jobs
    if (!id || kinds.indexOf(kind) === -1) continue;
    if (reasons.indexOf(e.reason) === -1) continue;
    // A client has no items, so the item-count guard can never hold one.
    if (kind !== 'session' && e.reason === 'fewer-items') continue;
    const key = kind + '\u0000' + id;
    if (seen.has(key)) continue;
    const at = (typeof e.at === 'string' && !isNaN(Date.parse(e.at))) ? e.at : new Date(0).toISOString();
    seen.add(key);
    const entry = {
      id, kind, at, reason: e.reason,
      name: typeof e.name === 'string' ? e.name : '',
    };
    if (kind === 'session') {
      entry.localItems = num(e.localItems);
      entry.cloudItems = num(e.cloudItems);
    } else {
      entry.localName = txt(e.localName);
      entry.cloudName = txt(e.cloudName);
      if (kind === 'site') {
        entry.localParent = txt(e.localParent);
        entry.cloudParent = txt(e.cloudParent);
      }
      if (Array.isArray(e.diffs)) {
        const d = [];
        for (const f of e.diffs.slice(0, 8)) {
          if (!f || typeof f !== 'object' || typeof f.label !== 'string') continue;
          d.push({ label: f.label.slice(0, 40), here: txt(f.here), cloud: txt(f.cloud) });
        }
        if (d.length) entry.diffs = d;
      }
      if (kind === 'instrument' && e.inUse === true) entry.inUse = true;
      if (kind === 'preset' && e.onlyOne === true) entry.onlyOne = true;
    }
    out.push(entry);
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
// v82: kind-aware. An entry without a kind is a job, so every V81 call site
// (which passes none) keeps meaning exactly what it meant.
function _syncHeldNote(entry) {
  const kind = entry.kind || 'session';
  const id = String(entry.id);
  const list = _syncHeldLoad().filter(e => !(e.id === id && e.kind === kind));
  list.push(Object.assign({ at: new Date().toISOString() }, entry, { id, kind }));
  _syncHeldSave(list);
}

function _syncHeldClear(id, kind) {
  const sid = String(id);
  const k = kind || 'session';
  const list = _syncHeldLoad();
  const out = list.filter(e => !(e.id === sid && e.kind === k));
  if (out.length !== list.length) _syncHeldSave(out);
}

// v82: one string that names a held entry on the page and in dispatch. A job
// keeps its bare id — exactly what V81 put in data-arg — and a client or site
// is "kind/id". No job id can start with "client/" or "site/": they are
// newId() values or older base-36 uids, neither of which contains a slash.
function syncHeldKey(e) {
  return (!e || !e.kind || e.kind === 'session') ? String(e && e.id) : e.kind + '/' + String(e.id);
}

function _syncParseHeldKey(key) {
  const s = String(key == null ? '' : key);
  const slash = s.indexOf('/');
  if (slash > 0 && SYNC_RECORD_KINDS.indexOf(s.slice(0, slash)) !== -1) {
    return { kind: s.slice(0, slash), id: s.slice(slash + 1) };
  }
  return { kind: 'session', id: s };
}

// For the Sync page. Newest question first.
function syncHeldList() {
  return _syncHeldLoad().sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

// ---- canonical JSON (v81.2, decision 3A) ---------------------------------------
// ⚠ The `doc` column is jsonb, and jsonb does NOT store the JSON it was given —
// Postgres re-sorts object keys and drops whitespace. So a job comes back with a
// different key ORDER, JSON.stringify produces a different string, and the
// fingerprint does not match: a phone sees its OWN pushed job as changed and
// applies it back over itself. On the job open on screen that showed up as
// "changes from your other device are waiting" when nothing had come from the
// other device at all (Peter, V81.1 testing). Worse, if the local copy happened
// to be dirty at that moment it read as a real clash and asked a question nobody
// needed to answer.
//
// Hashing therefore goes through here, both ends, so the hash depends on CONTENT
// and never on key order. Not JSON.stringify with a replacer: the sort has to be
// recursive, and nested objects are where the reordering actually bites.
//
// ⚠ The harness missed this because the fake server handed back the object it was
// given. It now reorders keys on the way out (17s).
function _syncCanonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(_syncCanonical).join(',') + ']';
  const keys = Object.keys(v).filter(k => v[k] !== undefined && typeof v[k] !== 'function').sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + _syncCanonical(v[k])).join(',') + '}';
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

// v81.2, decision 2D. A screen change is a moment the engineer might be
// expecting the other phone's work, so it is the primary trigger — throttled,
// because tapping between jobs is not a reason to hammer the server. Called
// from dispatch.js only when state.view actually CHANGED, not on every tap.
function syncNoteNav() {
  if (!syncActive()) return;
  const now = Date.now();
  // v81.3 (decision 1A). Leaving the job a change is waiting for is the exact
  // moment it becomes applicable, so that one screen change is never throttled.
  // Without this the engineer usually left within 20s of arriving — the arrival
  // itself was a navigation read — and the throttle swallowed the one read that
  // mattered. Close-and-reopen appeared to fix it only because reopening is a
  // different trigger that the throttle never covered.
  const w = state.sync && state.sync.waiting;
  const released = !!w && !(state.view === 'entry' && String(state.activeId) === String(w.id));
  if (!released && now - _syncLastNavPull < SYNC_NAV_THROTTLE_MS) return;
  _syncLastNavPull = now;
  syncPushSoon(0, { pull: true });
}

// …and the backstop, for standing still. Fires only if nothing has run in
// SYNC_IDLE_MS, so an engineer who is navigating or logging never triggers it
// and the radio is left alone. Also the last resort for a repaint that was
// owed while a field was focused.
function _syncIdleCheck() {
  _syncFlushRepaint();
  if (!syncActive() || _syncOffline()) return;
  try { if (document.visibilityState === 'hidden') return; } catch { /* no document */ }
  if (Date.now() - _syncLastRunAt < SYNC_IDLE_MS) return;
  syncPushSoon(0, { pull: true });
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
  // v83: copies owed by a run that never finished (app closed between reading
  // the records and reading the jobs). Late is better than a wrong certificate.
  try { _syncFreezePending(_syncLoad()); } catch (e) { console.error('Sync: pending instrument copies not written (non-fatal).', e); }
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
  // v81.2: a repaint owed while a field was focused takes the moment it blurs.
  try {
    document.addEventListener('focusout', () => setTimeout(_syncFlushRepaint, 0));
  } catch { /* the idle check below still flushes it */ }
  try {
    setInterval(_syncIdleCheck, SYNC_IDLE_CHECK_MS);
  } catch { /* no timers: navigation and saving still trigger reads */ }
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
    // ⚠ v81.3 (decision 1A). "Open" means ON SCREEN — that job's entry screen —
    // not merely the current job. state.activeId deliberately survives going
    // back to the jobs list (the app remembers your last job), so V81.1/V81.2
    // kept deferring a change the engineer had already walked away from, and it
    // only released when a DIFFERENT job was opened. The protection exists for
    // the keyboard and the half-typed asset number, which only exist here.
    const isOpen = (id === state.activeId && state.view === 'entry');

    // Decision 3A: defer, and say so on the entry screen. Returns true when the
    // caller must stop — the change waits for the engineer to leave the job.
    const defer = (kind) => {
      if (!isOpen) return false;
      // v81.4. The engineer tapped "Update now" for THIS job, so the change is
      // theirs to have, not something landing under their thumb uninvited.
      // Updates only: a delete applied to the job being viewed would pull the
      // screen out from under them, so a delete still waits for them to leave
      // even if the row turned into one between the tap and the read (M196).
      if (kind === 'update' && _syncAllowOpen === id) return false;
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
      if (st.sent[id] === syncHash(_syncCanonical(local))) {
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
    const hash = syncHash(_syncCanonical(doc));

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

    const localHash = syncHash(_syncCanonical(local));

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
    const waitingBefore = JSON.stringify(state.sync.waiting || null);
    state.sync.waiting = out.waiting || null;
    const waitingMoved = JSON.stringify(state.sync.waiting || null) !== waitingBefore;
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
    // v81.2: the screen, not just the Sync page. Done here rather than at the
    // end of the whole run because the push half never changes local data —
    // waiting until then would only delay what is already true.
    if (changed || waitingMoved) _syncRepaintApp();
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
      _syncLastRunAt = Date.now();
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
// v82: clients and sites get their own short sentence, after the jobs one.
function _syncOutcome(r) {
  const p = r.pulled || { applied: 0, added: 0, removed: 0, held: 0 };
  const rr = r.records || null;
  const bits = [];
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const got = p.added + p.applied;
  if (got) bits.push('Brought in ' + plural(got, 'job', 'jobs'));
  if (p.removed) bits.push('removed ' + plural(p.removed, 'job deleted on your other device', 'jobs deleted on your other device'));
  if (r.sent) bits.push((bits.length ? 'sent ' : 'Sent ') + plural(r.sent, 'job', 'jobs'));
  if (r.deleted) bits.push((bits.length ? 'sent ' : 'Sent ') + plural(r.deleted, 'deletion', 'deletions'));

  // v83: the records counts come split by heading (cs / ip). A result without
  // the split — V82's shape — is all clients and sites.
  const ok = rr && !rr.error;
  const cs = ok ? (rr.cs || { in: rr.added + rr.applied + rr.removed, out: rr.sent + rr.deleted, held: rr.held || 0 }) : null;
  const ip = ok ? (rr.ip || { in: 0, out: 0, held: 0 }) : null;
  const rec = [];
  if (ok) {
    const inN = cs.in;
    const outN = cs.out;
    if (inN) rec.push(plural(inN, 'change', 'changes') + ' brought in');
    if (outN) rec.push(plural(outN, 'change', 'changes') + ' sent');
    if (rr.unassigned) rec.push(plural(rr.unassigned, 'site', 'sites') + ' moved to Unassigned because the client was deleted on your other device');
  }
  const lists = [];
  if (ok) {
    if (ip.in) lists.push(plural(ip.in, 'change', 'changes') + ' brought in');
    if (ip.out) lists.push(plural(ip.out, 'change', 'changes') + ' sent');
  }

  let msg = bits.length ? bits.join(', ') + '.' : '';
  if (rec.length) msg += (msg ? ' ' : '') + 'Clients & sites: ' + rec.join(', ') + '.';
  if (lists.length) msg += (msg ? ' ' : '') + 'Instruments & presets: ' + lists.join(', ') + '.';
  if (ok && rr.inUseNow) msg += (msg ? ' ' : '') + 'The tester in use is now ' + rr.inUseNow + ', as chosen on your other device.';
  if (!msg) msg = 'Everything was already up to date.';
  if (rr && rr.error) {
    msg += ' Clients, sites, instruments and presets couldn\u2019t be checked this time \u2014 they\u2019re safe on this phone and will be tried again.';
  }

  const hJobs = p.held || 0;
  const hRec = ok ? (cs.held || 0) : 0;
  const hList = ok ? (ip.held || 0) : 0;
  if (hList && (hJobs || hRec)) {
    msg += ' Several things need you to decide \u2014 see below.';
  } else if (hList) {
    msg += ' ' + plural(hList, 'instrument or preset needs', 'instruments or presets need') + ' you to decide \u2014 see below.';
  } else if (hJobs && hRec) {
    msg += ' Some jobs and some clients or sites need you to decide \u2014 see below.';
  } else if (hJobs) {
    msg += ' ' + plural(hJobs, 'job needs', 'jobs need') + ' you to decide \u2014 see below.';
  } else if (hRec) {
    msg += ' ' + plural(hRec, 'client or site needs', 'clients or sites need') + ' you to decide \u2014 see below.';
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
    // v82: clients and sites go FIRST, so a job that arrives in this run finds
    // its client already here. Only on a run that reads (rule 4) — so never on
    // "Re-send all jobs", which is jobs only. Fail-soft: see _syncRecordsHalf.
    const recs = opts.pull ? _syncRecordsHalf(c, uid, st) : Promise.resolve(null);
    return recs.then((records) => {
      const first = opts.pull ? _syncPull(c, uid, st, pulled) : Promise.resolve();
      // v83: instruments deleted on the other phone are frozen onto this phone's
      // jobs HERE — after the jobs were read, before they are sent. See the v83
      // note on records. Failed read or not, the copies are written: a job left
      // pointing at an instrument that is gone prints today's tester.
      const freeze = () => { _syncFreezePending(st); };
      return first
        .then(freeze, (e) => { freeze(); throw e; })
        .then(() => _syncPushHalf(c, uid, st, !!opts.force))
        .then((r) => ({ sent: r.sent, deleted: r.deleted, pulled, records }));
    });
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
    // v82: jobs only — a held client says nothing about any job.
    const heldIds = new Set(_syncHeldLoad().filter(e => e.kind === 'session').map(e => e.id));

    for (const s of _syncSessions()) {
      const id = String(s.id);
      live.add(id);
      if (heldIds.has(id)) continue;
      // ⚠ v81.2: the row is sent as JSON.stringify (that is the wire format), but
      // the FINGERPRINT is canonical — the two are different jobs and must not
      // share a variable. Hashing `json` here is what V81.2 first shipped by
      // mistake: every pull then disagreed with every push, for every job.
      const json = JSON.stringify(s);
      const hash = syncHash(_syncCanonical(s));
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

// ---- records: clients and sites (V82) ------------------------------------------------
// The same machine as jobs, pointed at the `records` table. Every rule in the
// header holds here too: the fingerprint decides, nothing is applied on a guess,
// anything not applied is HELD, the cursor stops at the first unresolved row,
// and a push only ever follows a pull (records are only touched on a run that
// reads — "Re-send all jobs" is jobs only and never sends them).
//
// Where records DIFFER from jobs, and why:
//   • No open-record deferral. A client is never "under the engineer's thumb" the
//     way the job on its entry screen is. Every dialog that edits one looks it up
//     by id at the moment it saves, and an applied row REPLACES the object, so a
//     rename sheet open across a pull simply saves over the new copy — the
//     engineer's later tap wins, which is what they meant.
//   • No item-count guard. There are no items.
//   • Decision 4A. A client deleted on the other phone does NOT cascade to its
//     sites here. The phone that deleted it tombstoned every child site IT had,
//     and those arrive as their own deletes. A site it never had — made on this
//     phone — falls to Unassigned in the tidy-up at the end of a clean pull. It
//     is never deleted on the strength of something the other phone never saw.
//
// ⚠ WHAT SYNCS IS A PROJECTION, not the stored object. loadClients() adds
// `userId: null` and `lastModified: null` to every record on reload, and a record
// made mid-session has neither key — so hashing the stored object would change
// a record's fingerprint across a close and reopen with nothing edited, and a
// phone would see its own work as a clash. The projection is the fields that
// MEAN something (id, name, and a site's clientId), names trimmed the way
// loadClients() trims them.
// ⚠ A LATER VERSION THAT ADDS A FIELD must add it here AND in loadClients /
// loadSites. Until every phone is on that version, an older phone that edits
// the record will send it back without the new field — its projection cannot
// carry what it does not know about. Fields it merely RECEIVES are harmless:
// the cloud row is hashed through the same projection, so an unknown field is
// invisible to it rather than a difference that can never be settled.

// ---- v83: instruments, presets and the tester in use ---------------------------------
// Same machine again. What each adds, beyond "another list":
//
//   instrument — a delete from the other phone freezes the instrument's details
//     onto this phone's jobs, exactly as deleteInstrument() does, through the SAME
//     helper (freezeInstrumentOntoJobs, instruments.js). ⚠ The freeze waits until
//     the JOBS have been read (_syncFreezePending, called from _syncRun). The
//     phone that deleted the instrument froze its own copies of those jobs, and
//     they arrive in this run already carrying the copy. Freezing here first
//     would make every one of them look edited on this phone too, and any the
//     other phone had also changed would be held as a clash nobody made.
//     Decision 2A: the tester this phone is using is never deleted without
//     asking. The one open in the editor is never replaced or deleted under it
//     (its Save writes every field back).
//   preset — which preset is in use is per phone (decision 7A), so presets
//     travel and the choice does not. A delete never takes a phone's last one.
//     Decision 5A: a new phone's untouched starter "Default" is set aside when
//     the account's presets arrive.
//   settings — ONE row, SYNC_INUSE_ID: which tester is in use (decision 1B). Not
//     a list: _syncRecordList builds it fresh from state each time, and every
//     path that would add to, replace in or delete from a list special-cases it.

// Which heading a kind sits under on the Sync page: 'cs' clients & sites,
// 'ip' instruments & presets (the tester in use with them).
function _syncRecordGroup(kind) {
  return (kind === 'client' || kind === 'site') ? 'cs' : 'ip';
}

// What the records cursor was read WITH. Kinds and settings ids both: adding
// either reads the account from the beginning (see SYNC_SETTINGS_IDS).
function _syncRecordKindsTag() {
  return SYNC_RECORD_KINDS.join(',') + '|' + SYNC_SETTINGS_IDS.join(',');
}

function _syncInUseRecord() {
  return { id: SYNC_INUSE_ID, instrumentId: String(state.activeInstrumentId || '') };
}

// The instrument new jobs are actually stamped with, as far as the rest of the
// app is concerned — activeInstrument() already falls back from a stale id.
function _syncInUseId() {
  const a = (typeof activeInstrument === 'function') ? activeInstrument() : null;
  return a ? String(a.id) : '';
}

function _syncInstrumentName(id) {
  const i = (id && typeof findInstrument === 'function') ? findInstrument(String(id)) : null;
  return i ? instrumentDisplayName(i) : null;
}

function _syncRecordList(kind) {
  if (kind === 'client') return state.clients || [];
  if (kind === 'site') return state.sites || [];
  if (kind === 'instrument') return Array.isArray(state.instruments) ? state.instruments : [];
  if (kind === 'preset') return Array.isArray(state.itemPresets) ? state.itemPresets : [];
  if (kind === 'settings') return (typeof findInstrument === 'function') ? [_syncInUseRecord()] : [];
  return [];
}

function _syncRecordSetList(kind, list) {
  if (kind === 'client') state.clients = list;
  else if (kind === 'site') state.sites = list;
  else if (kind === 'instrument') state.instruments = list;
  else if (kind === 'preset') state.itemPresets = list;
  // 'settings' is not a list — see the v83 note above.
}

function _syncRecordDoc(kind, rec) {
  const r = rec || {};
  const t = (v) => typeof v === 'string' ? v.trim() : '';
  if (kind === 'client') return { id: String(r.id), name: String(r.name || '').trim() };
  if (kind === 'site') return { id: String(r.id), clientId: String(r.clientId || ''), name: String(r.name || '').trim() };
  // v83. Exactly what makeInstrument() stores, so a stored instrument hashes the
  // same as its own projection and a reload is never a change (the 18b rule).
  if (kind === 'instrument') {
    const d = (v) => (typeof normaliseInstrumentDate === 'function') ? normaliseInstrumentDate(v) : t(v);
    return { id: String(r.id), make: t(r.make), model: t(r.model), calDate: d(r.calDate),
             calCertNo: t(r.calCertNo), calDue: d(r.calDue) };
  }
  // Item order is the button order, so it is part of what a preset IS.
  if (kind === 'preset') {
    return { id: String(r.id), name: t(r.name),
             items: Array.isArray(r.items) ? r.items.map(x => String(x == null ? '' : x)) : [] };
  }
  if (kind === 'settings') return { id: String(r.id), instrumentId: String(r.instrumentId || '') };
  return null;
}

function _syncRecordHash(kind, rec) {
  return syncHash(_syncCanonical(_syncRecordDoc(kind, rec)));
}

// The local shape, as loadClients()/loadSites() would build it. The two
// passthrough fields are carried over from the record being replaced.
function _syncRecordFromDoc(kind, doc, old) {
  const d = _syncRecordDoc(kind, doc);
  // v83: instruments and presets have no passthrough fields — the projection IS
  // the stored shape.
  if (kind !== 'client' && kind !== 'site') return d;
  d.userId = (old && typeof old.userId === 'string') ? old.userId : null;
  d.lastModified = (old && typeof old.lastModified === 'string') ? old.lastModified : null;
  return d;
}

// Decision 8A for records: what the app cannot survive without. loadClients()
// drops a nameless record on the next reload, so a nameless row applied now
// would vanish later and read as a delete. It is held instead.
function _syncValidRecord(kind, doc, id) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false;
  if (doc.id == null || String(doc.id) !== String(id)) return false;
  const str = (v) => v === undefined || v === null || typeof v === 'string';
  // v83. An instrument with no make and no model would show as "Unnamed
  // instrument" for ever — the editor refuses to save one, so the pull refuses
  // to apply one. It also keeps the half-filled result of an Add button off the
  // wire: the push skips anything that fails here.
  if (kind === 'instrument') {
    if (!['make', 'model', 'calDate', 'calCertNo', 'calDue'].every(k => str(doc[k]))) return false;
    return !!(String(doc.make || '').trim() || String(doc.model || '').trim());
  }
  // A preset is a name and one to nine buttons (saveItemTypesSettings).
  if (kind === 'preset') {
    if (typeof doc.name !== 'string' || !doc.name.trim()) return false;
    if (!Array.isArray(doc.items) || !doc.items.length || doc.items.length > 9) return false;
    return doc.items.every(x => typeof x === 'string' && x.trim());
  }
  if (kind === 'settings') {
    return SYNC_SETTINGS_IDS.indexOf(String(id)) !== -1 && typeof doc.instrumentId === 'string';
  }
  if (typeof doc.name !== 'string' || !doc.name.trim()) return false;
  if (kind === 'site' && doc.clientId != null && typeof doc.clientId !== 'string') return false;
  return true;
}

// '' — no client; null — a client id this phone doesn't have.
function _syncClientNameOf(clientId) {
  const id = String(clientId || '');
  if (!id) return '';
  const c = (state.clients || []).find(x => x && String(x.id) === id);
  return c ? c.name : null;
}

function _syncRecordHeldEntry(kind, id, reason, local, doc) {
  // v83: instruments are named the way the app names them everywhere else, and
  // the tester-in-use row by the testers it points at on each side (null: one
  // this phone doesn't have).
  if (kind === 'instrument' || kind === 'settings') {
    const nm = (r) => {
      if (!r || typeof r !== 'object') return null;
      if (kind === 'settings') return typeof r.instrumentId === 'string' ? (_syncInstrumentName(r.instrumentId) || (r.instrumentId ? null : '')) : null;
      return instrumentDisplayName(_syncRecordDoc('instrument', r));
    };
    const ln = nm(local);
    const cn = (doc && typeof doc === 'object') ? nm(doc) : null;
    const e = { id, kind, reason, name: kind === 'settings' ? 'Tester in use' : (ln || cn || ''), localName: ln, cloudName: cn };
    if (reason === 'both-changed' && local && doc) e.diffs = _syncRecordDiffs(kind, local, doc);
    return e;
  }
  const e = { id, kind, reason,
    name: (local && local.name) || (doc && typeof doc.name === 'string' ? doc.name : '') || '',
    localName: local ? String(local.name || '') : null,
    cloudName: (doc && typeof doc.name === 'string') ? doc.name : null };
  if (kind === 'preset' && reason === 'both-changed' && local && doc) e.diffs = _syncRecordDiffs(kind, local, doc);
  if (kind === 'site') {
    e.localParent = local ? _syncClientNameOf(local.clientId) : null;
    e.cloudParent = (doc && typeof doc.name === 'string') ? _syncClientNameOf(doc.clientId) : null;
  }
  return e;
}

// v83: what differs between the two copies of a held instrument or preset, as
// display text for the card. Only the fields that differ; '' shows as blank.
function _syncRecordDiffs(kind, local, doc) {
  const L = _syncRecordDoc(kind, local), C = _syncRecordDoc(kind, doc);
  const clip = (v) => { const x = String(v == null ? '' : v); return x.length > 80 ? x.slice(0, 79) + '\u2026' : x; };
  const fields = kind === 'instrument'
    ? [['make', 'Make'], ['model', 'Model'], ['calDate', 'Calibration date'],
       ['calCertNo', 'Calibration certificate'], ['calDue', 'Calibration due']]
    : [['name', 'Name'], ['items', 'Buttons']];
  const out = [];
  for (const [k, label] of fields) {
    const a = Array.isArray(L[k]) ? L[k].join(', ') : L[k];
    const b = Array.isArray(C[k]) ? C[k].join(', ') : C[k];
    if (a !== b) out.push({ label, here: clip(a), cloud: clip(b) });
  }
  return out;
}

// v83: point this phone at another tester. Only ever at one it has, or at none
// when it has none: an id this phone cannot resolve would stamp new jobs with
// something every certificate falls straight through (tier 3).
function _syncApplyInUse(instrumentId) {
  const want = String(instrumentId || '');
  if (typeof findInstrument !== 'function') return false;
  if (want ? !findInstrument(want) : instrumentList().length) return false;
  state.activeInstrumentId = want;
  syncActiveInstrumentMirror();
  return true;
}

// Replace, never edit in place — same habit as jobs, and it means nothing that
// captured the old object can write stale fields back over the new one.
function _syncReplaceRecord(kind, old, doc) {
  if (kind === 'settings') return _syncApplyInUse(doc && doc.instrumentId);
  const list = _syncRecordList(kind);
  const i = list.indexOf(old);
  if (i === -1) return false;
  const next = list.slice();
  next[i] = _syncRecordFromDoc(kind, doc, old);
  _syncRecordSetList(kind, next);
  return true;
}

// Ledger first, then the removal (MAP rule 5), exactly as deleteClient() and
// deleteSite() do. ⚠ Deliberately NO site cascade for a client — see 4A above.
//
// v83: `rs` (the records bookkeeping) is where an instrument's frozen copy waits
// for the jobs to be read — see _syncFreezePending. A preset is never a phone's
// last (deletePreset refuses too), and if it was the one in use the same
// neighbour deletePreset() would pick takes over. Which TESTER is in use after
// an instrument goes is settled by _syncSettleLists, once, at the end.
function _syncApplyRecordDelete(kind, id, rs) {
  const list = _syncRecordList(kind);
  const old = list.find(r => r && String(r.id) === id);
  if (!old || kind === 'settings') return false;
  if (kind === 'preset' && list.length <= 1) return false;
  if (kind === 'instrument' && rs && typeof instrumentSnapshotOf === 'function') {
    rs.freeze[id] = instrumentSnapshotOf(old);
  }
  recordTombstone(kind, id);
  const idx = list.indexOf(old);
  const next = list.filter(r => r !== old);
  _syncRecordSetList(kind, next);
  if (kind === 'preset' && state.activePresetId === id) {
    state.activePresetId = next[Math.max(0, idx - 1)].id;
  }
  return true;
}

// v83: the frozen copies the records pull set aside, written onto this phone's
// jobs now that the jobs have been read (see the v83 note above for why not
// sooner). Also run at boot, for a run that died between the two. An instrument
// that is back on the phone by now (a "Keep it" answer) needs no copy.
// Returns how many jobs were written to.
function _syncFreezePending(st) {
  const f = st && st.rec && st.rec.freeze;
  if (!f) return 0;
  const ids = Object.keys(f);
  if (!ids.length) return 0;
  let n = 0;
  for (const id of ids) {
    const back = (typeof findInstrument === 'function') && findInstrument(id);
    if (!back && typeof freezeInstrumentOntoJobs === 'function') n += freezeInstrumentOntoJobs(id, f[id]);
    delete f[id];
  }
  _syncSave(st);
  if (n) {
    state.sessions = state.sessions.slice();
    saveSessions();
  }
  return n;
}

// v83 decision 5A. A new phone's own starter preset, if that is all it has: the
// built-in "Default", never edited, never sent. It holds nothing anyone made,
// and without this every new phone would arrive with a spare "Default".
function _syncIsUntouchedStarter(p) {
  if (!p || p.name !== 'Default' || !Array.isArray(p.items)) return false;
  if (typeof DEFAULT_ITEM_TYPES === 'undefined' || p.items.length !== DEFAULT_ITEM_TYPES.length) return false;
  return p.items.every((x, i) => x === DEFAULT_ITEM_TYPES[i]);
}

function _syncStarterPreset(rs) {
  const ps = state.itemPresets || [];
  if (ps.length !== 1 || !ps[0] || !ps[0].id) return null;
  const id = String(ps[0].id);
  if (rs.sent[id] || rs.gone[id] || rs.resend[id]) return null;
  return _syncIsUntouchedStarter(ps[0]) ? id : null;
}

// Only once the account's presets have actually arrived, and only if it is still
// untouched. No ledger entry: it never reached the server, so there is nothing
// for the other phone to be told.
function _syncDropStarter(id) {
  const ps = state.itemPresets || [];
  const p = ps.find(x => x && String(x.id) === id);
  if (!p || ps.length < 2 || !_syncIsUntouchedStarter(p)) return false;
  state.itemPresets = ps.filter(x => x !== p);
  if (state.activePresetId === id) state.activePresetId = state.itemPresets[0].id;
  return true;
}

function _syncActivePresetSig() {
  const p = (typeof activePreset === 'function' && (state.itemPresets || []).length) ? activePreset() : null;
  return p ? String(p.id) + '\u0001' + JSON.stringify(p.items || []) : '';
}

// v83: after the lists changed, make "in use" point at something that exists —
// the same fallbacks loadInstruments() and load() apply at startup — and refresh
// what depends on it: the instrument mirror (MAP rule 7) and, only if the preset
// in use actually changed, the quick-pick buttons (which rebuilds the Smart Quick
// Pick row, so it is not done for nothing). Returns true if either moved.
function _syncSettleLists(presetBefore) {
  let moved = false;
  if (typeof instrumentList === 'function') {
    const list = instrumentList();
    if (!list.some(i => i.id === state.activeInstrumentId)) {
      const next = list.length ? list[0].id : '';
      if ((state.activeInstrumentId || '') !== next) moved = true;
      state.activeInstrumentId = next;
    }
    if (typeof syncActiveInstrumentMirror === 'function') syncActiveInstrumentMirror();
  }
  const ps = state.itemPresets || [];
  if (ps.length && !ps.some(p => p.id === state.activePresetId)) { state.activePresetId = ps[0].id; moved = true; }
  if (ps.length && typeof syncItemTypesFromActivePreset === 'function' && _syncActivePresetSig() !== presetBefore) {
    syncItemTypesFromActivePreset();
    moved = true;
  }
  return moved;
}

// Decision 4A. After a CLEAN pull only: a site whose client is not on this phone
// goes to Unassigned rather than sitting invisible (the Clients page shows a
// site under its client or under Unassigned, and a dangling one under neither).
// Skipped on a held run, because the missing client may be the very thing
// waiting on a decision, and a held site is left exactly as it is.
function _syncTidyOrphanSites() {
  const clientIds = new Set((state.clients || []).map(c => c && String(c.id)));
  const heldSites = new Set(_syncHeldLoad().filter(e => e.kind === 'site').map(e => e.id));
  let moved = 0;
  const next = (state.sites || []).map((s) => {
    if (!s || !s.clientId || clientIds.has(String(s.clientId)) || heldSites.has(String(s.id))) return s;
    moved++;
    return Object.assign({}, s, { clientId: '' });
  });
  if (moved) state.sites = next;
  return moved;
}

function _syncPullRecords(c, uid, st, out) {
  const rs = st.rec;
  // A new kind means a new version is reading for the first time: start from
  // the beginning, or every row of that kind already behind the cursor would
  // never be seen. See SYNC_RECORD_KINDS in config.js.
  const kindsTag = _syncRecordKindsTag();
  if (rs.kinds !== kindsTag) { rs.pulledAt = null; rs.kinds = kindsTag; }
  const since = rs.pulledAt || SYNC_PULL_EPOCH;
  let changed = false;
  let blocked = false;
  let high = since;
  // v83
  const late = [];                                   // settings rows: decided last
  const starter = _syncStarterPreset(rs);            // 5A, judged before anything arrives
  let presetsAdded = 0;
  const presetBefore = _syncActivePresetSig();
  const editing = String(state.instrumentEditorId || '');

  function decide(row) {
    const id = String(row && row.id != null ? row.id : '');
    const kind = String(row && row.kind || '');
    if (!id || SYNC_RECORD_KINDS.indexOf(kind) === -1) { blocked = true; return; }

    // v83: the tester in use points AT an instrument, which may be further down
    // this very read. So it is decided after every other row (decideInUse). A
    // settings row this version does not know is a newer version's: nothing to
    // apply or ask, and the cursor tag makes sure it is read again once known.
    if (kind === 'settings') {
      if (SYNC_SETTINGS_IDS.indexOf(id) !== -1) late.push(row);
      return;
    }

    // Answered in this phone's favour; the push half of this run replaces it.
    if (rs.resend[id]) return;

    const grp = _syncRecordGroup(kind);
    const local = _syncRecordList(kind).find(r => r && String(r.id) === id) || null;
    const tomb = (state.tombstones || []).some(t => t && t.kind === kind && String(t.id) === id);
    const hold = (reason, doc, extra) => {
      _syncHeldNote(Object.assign(_syncRecordHeldEntry(kind, id, reason, local, doc), extra || {}));
      blocked = true; out.held++; out[grp].held++;
    };
    // v83: the instrument open in the editor. Its form was filled from this
    // phone's copy and its Save writes EVERY field back, so a change applied
    // underneath it would be quietly reverted by the Save tap — calibration date
    // and all. Judged like anything else (a clash is still held); only applying
    // waits, and the push leaves it alone, until the editor closes (rule 6).
    const deferEditor = () => {
      if (kind !== 'instrument' || id !== editing) return false;
      blocked = true; out.skip[id] = true;
      return true;
    };
    const inUse = (kind === 'instrument' && id === _syncInUseId()) ? { inUse: true } : null;

    if (row.deleted === true) {
      if (!local) {
        if (tomb || rs.sent[id]) { delete rs.sent[id]; rs.gone[id] = true; }
        _syncHeldClear(id, kind);
        return;
      }
      if (rs.sent[id] === _syncRecordHash(kind, local)) {
        // v83 decision 2A: the tester this phone is using is not deleted from
        // under it on the strength of the other phone, clean copy or not.
        if (inUse) { hold('deleted-elsewhere', null, inUse); return; }
        // There must always be a preset. Asked, not skipped (rule 5).
        if (kind === 'preset' && _syncRecordList('preset').length <= 1) {
          hold('deleted-elsewhere', null, { onlyOne: true });
          return;
        }
        if (deferEditor()) return;
        _syncApplyRecordDelete(kind, id, rs);
        delete rs.sent[id];
        rs.gone[id] = true;
        out.removed++; out[grp].in++; changed = true;
        _syncHeldClear(id, kind);
        return;
      }
      hold('deleted-elsewhere', null, inUse);
      return;
    }

    if (!_syncValidRecord(kind, row.doc, id)) { hold('unreadable', null); return; }

    const hash = _syncRecordHash(kind, row.doc);

    if (!local) {
      if (tomb) {
        if (!rs.gone[id]) return;          // our delete goes up in this run
        hold('deleted-here', row.doc);
        return;
      }
      _syncRecordSetList(kind, _syncRecordList(kind).concat([_syncRecordFromDoc(kind, row.doc, null)]));
      rs.sent[id] = hash;
      out.added++; out[grp].in++; changed = true;
      if (kind === 'preset') presetsAdded++;
      _syncHeldClear(id, kind);
      return;
    }

    const localHash = _syncRecordHash(kind, local);
    if (hash === localHash) { rs.sent[id] = hash; _syncHeldClear(id, kind); return; }
    if (rs.sent[id] !== localHash) { hold('both-changed', row.doc); return; }

    if (deferEditor()) return;
    _syncReplaceRecord(kind, local, row.doc);
    rs.sent[id] = hash;
    out.applied++; out[grp].in++; changed = true;
    _syncHeldClear(id, kind);
  }

  // v83 decision 1B: which tester is in use. A pointer, so the fingerprint alone
  // cannot say who moved: `rs.inUse` is the value both sides last agreed on.
  //   same on both sides                     → nothing to do
  //   a question is open about the tester
  //     this phone is using                  → wait (2A: it stays on it until
  //                                            answered, whatever the other
  //                                            phone moved to meanwhile)
  //   the cloud is what both last agreed     → only this phone moved: ours goes up
  //   the other side has none chosen         → ours goes up; nothing to take
  //   it names a tester not on this phone    → wait for it to arrive
  //   this phone switched since they agreed  → both switched: ask (8A)
  //   otherwise                              → take it. That includes a phone
  //                                            that has never agreed anything (a
  //                                            new phone takes the account's),
  //                                            and one whose agreed tester was
  //                                            deleted, which moved by itself.
  function decideInUse(row) {
    const id = SYNC_INUSE_ID, kind = 'settings';
    if (typeof findInstrument !== 'function') return;   // instruments.js absent
    if (rs.resend[id]) return;
    if (row.deleted === true) return;        // no version ever deletes it
    const local = _syncInUseRecord();
    const hold = (reason, doc) => {
      _syncHeldNote(_syncRecordHeldEntry(kind, id, reason, local, doc));
      blocked = true; out.held++; out.ip.held++;
    };
    const wait = () => { blocked = true; out.skip[id] = true; };
    if (!_syncValidRecord(kind, row.doc, id)) { hold('unreadable', null); return; }
    const hash = _syncRecordHash(kind, row.doc);
    const want = String(row.doc.instrumentId);
    const mine = local.instrumentId;
    if (hash === _syncRecordHash(kind, local)) {
      rs.sent[id] = hash; rs.inUse = want; _syncHeldClear(id, kind);
      return;
    }
    if (mine && _syncHeldLoad().some(e => e.kind === 'instrument' && e.id === mine)) { wait(); return; }
    // The cloud still holds what the two sides last agreed: the other device has
    // not moved, so the difference is this phone's switch, and the push sends it.
    // (Without this a switch made on ONE phone was asked about as if both had
    // switched — harness 19k.)
    if (hash === rs.sent[id]) return;
    if (!want) return;
    if (!findInstrument(want)) { wait(); return; }
    const agreed = rs.inUse;
    if (agreed !== null && mine !== agreed && findInstrument(agreed)) { hold('both-changed', row.doc); return; }
    _syncApplyInUse(want);
    rs.sent[id] = hash;
    rs.inUse = want;
    out.applied++; out.ip.in++; changed = true;
    out.inUseNow = _syncInstrumentName(want);
    _syncHeldClear(id, kind);
  }

  // One request for every kind, one cursor, paged exactly as jobs are.
  function page(from) {
    return c.from('records')
      .select('id,kind,doc,deleted,last_modified,updated_at')
      .in('kind', SYNC_RECORD_KINDS)
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
    // v83, in this order: the starter preset goes once the account's presets
    // are here (5A); "in use" is settled against the lists as they now stand;
    // THEN the tester-in-use row, which may name an instrument just added.
    if (starter && presetsAdded && _syncDropStarter(starter)) changed = true;
    if (_syncSettleLists(presetBefore)) changed = true;
    for (const row of late) decideInUse(row);
    if (!blocked) {
      const moved = _syncTidyOrphanSites();
      if (moved) { out.unassigned += moved; changed = true; }
      rs.pulledAt = high;
    }
    _syncSave(st);
    if (changed) {
      // storage.js save() is saveSessions() + saveSettings(); only the second
      // holds clients and sites, and the first would re-arm the sync timer for
      // nothing. The push half of this same run sends anything tidied above.
      // v83: instruments and presets are saveSettings() too.
      if (typeof saveSettings === 'function') saveSettings();
      _syncRepaintApp();
    }
  });
}

function _syncPushRecords(c, uid, st, out) {
  const rs = st.rec;
  const now = new Date().toISOString();
  const work = [];
  // Held is the only state the push respects (rule 5): nothing held is sent.
  const held = new Set(_syncHeldLoad().filter(e => e.kind !== 'session').map(e => e.id));

  const skip = out.skip || {};
  for (const kind of SYNC_RECORD_KINDS) {
    const live = new Set();
    for (const r of _syncRecordList(kind)) {
      if (!r || r.id == null || r.id === '') continue;
      const id = String(r.id);
      live.add(id);
      if (held.has(id)) continue;
      // v83: what the pull deferred this run (the instrument open in the editor,
      // a tester-in-use row that waits) is not settled, so it is not sent either:
      // sending would settle it on the server in this phone's favour.
      if (skip[id]) continue;
      const doc = _syncRecordDoc(kind, r);
      // v83: no tester chosen is not a choice to send over the other phone's.
      if (kind === 'settings' && !doc.instrumentId) { delete rs.resend[id]; continue; }
      // Never send what the other phone would have to hold as unreadable.
      if (!_syncValidRecord(kind, doc, id)) continue;
      // ⚠ Wire and fingerprint are separate jobs (M184): send the JSON, hash the
      // canonical form. Captured together, at build time, for the reason the
      // header gives for jobs.
      const json = JSON.stringify(doc);
      const hash = syncHash(_syncCanonical(doc));
      if (!rs.resend[id] && rs.sent[id] === hash) continue;
      work.push({ id, hash, gone: false, bytes: json.length, grp: _syncRecordGroup(kind),
        inUse: kind === 'settings' ? doc.instrumentId : undefined,
        row: { id, user_id: uid, kind, doc: JSON.parse(json), deleted: false, last_modified: now } });
    }
    for (const t of (state.tombstones || [])) {
      if (!t || t.kind !== kind) continue;
      const id = String(t.id);
      if (held.has(id) || live.has(id)) continue;
      if (!rs.sent[id] && !rs.gone[id] && !rs.resend[id]) continue;   // server never had it
      if (rs.gone[id] && !rs.resend[id]) continue;                     // already sent
      const at = (typeof t.at === 'string' && !isNaN(Date.parse(t.at))) ? t.at : now;
      work.push({ id, hash: null, gone: true, bytes: 64, grp: _syncRecordGroup(kind),
        row: { id, user_id: uid, kind, doc: {}, deleted: true, last_modified: at } });
    }
  }

  // Records are small, but a first sign-in sends every one of them at once.
  const batches = [];
  let cur = [], size = 0;
  for (const w of work) {
    if (cur.length && (cur.length >= SYNC_BATCH_ROWS || size + w.bytes > SYNC_BATCH_BYTES)) {
      batches.push(cur); cur = []; size = 0;
    }
    cur.push(w); size += w.bytes;
  }
  if (cur.length) batches.push(cur);

  let chain = Promise.resolve();
  for (const batch of batches) {
    chain = chain
      .then(() => c.from('records').upsert(batch.map(w => w.row), { onConflict: 'user_id,id' }))
      .then((r) => {
        if (r && r.error) throw r.error;
        for (const w of batch) {
          delete rs.resend[w.id];
          if (w.gone) { delete rs.sent[w.id]; rs.gone[w.id] = true; out.deleted++; }
          else { rs.sent[w.id] = w.hash; delete rs.gone[w.id]; out.sent++; }
          if (w.inUse !== undefined) rs.inUse = w.inUse;   // v83: now agreed
          if (out[w.grp]) out[w.grp].out++;
        }
        _syncSave(st);
      });
  }
  return chain;
}

// Pull then push, as one unit, and FAIL-SOFT on its own: a problem with the
// records table must never stop jobs syncing — jobs are the engineer's work,
// clients are a convenience list. The error is reported on the Sync page and
// the next run tries again. ⚠ The push is chained AFTER the pull, so a failed
// pull means no push (rule 4).
function _syncRecordsHalf(c, uid, st) {
  // v83: `cs` / `ip` split the same counts by Sync-page heading; `skip` is what
  // the pull deferred this run; `inUseNow` names a tester taken from the cloud.
  const out = { applied: 0, added: 0, removed: 0, held: 0, unassigned: 0, sent: 0, deleted: 0, error: null,
    cs: { in: 0, out: 0, held: 0 }, ip: { in: 0, out: 0, held: 0 }, skip: {}, inUseNow: null };
  return _syncPullRecords(c, uid, st, out)
    .then(() => _syncPushRecords(c, uid, st, out))
    .then(() => out, (e) => { out.error = e || new Error('records'); return out; });
}

// ---- "Update now" (v81.4) -----------------------------------------------------------
// The button on the entry screen's "changes waiting" line. Reverses V81.3's 2B
// after real use: opening a job to that message, the instinct was to reach for a
// button, not to back out and come in again.
//
// The allowance is ONE-OFF and cleared however the run ends. Left standing, it
// would quietly apply every later change to that job while it is open — which is
// the very thing decision 7A exists to prevent (M195).
function syncApplyWaiting() {
  const w = state.sync && state.sync.waiting;
  if (!w || w.kind !== 'update' || !syncActive()) return Promise.resolve(false);
  _syncAllowOpen = String(w.id);
  const clear = (v) => { _syncAllowOpen = null; return v; };
  return syncPush({ manual: true, pull: true }).then(clear, (e) => { clear(); throw e; });
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
//
// v82: `id` is a held KEY (syncHeldKey) — a job's bare id, as V81 sent, or
// "client/<id>" / "site/<id>" for a record, which _syncHeldResolveRecord
// answers on the same two terms.
function syncHeldResolve(id, choice) {
  const parsed = _syncParseHeldKey(id);
  const sid = parsed.id;
  if (!syncActive()) return Promise.resolve(false);
  const entry = _syncHeldLoad().find(e => e.id === sid && e.kind === parsed.kind);
  if (!entry) return Promise.resolve(false);
  if (choice !== 'phone' && choice !== 'cloud') return Promise.resolve(false);
  if (parsed.kind !== 'session') return _syncHeldResolveRecord(parsed.kind, sid, choice, String(id));

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
          st.sent[sid] = syncHash(_syncCanonical(row.doc));
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

// v82: the same two answers for a client or site.
//   'phone' — nothing local changes; the record (or its delete) is re-sent.
//   'cloud' — the row is re-read NOW and applied as it stands. The names on the
//             card were for reading; they are never what gets applied.
function _syncHeldResolveRecord(kind, sid, choice, key) {
  state.sync.resolving = key;
  state.sync.message = '';
  _syncRepaint();
  const done = (msg) => {
    state.sync.resolving = null;
    if (msg) state.sync.message = msg;
    _syncRepaint();
  };
  const what = { site: 'site', instrument: 'instrument', preset: 'preset', settings: 'setting' }[kind] || 'client';

  if (choice === 'phone') {
    const st = _syncStateFor(_syncCurrentUserId());
    st.rec.resend[sid] = true;
    delete st.rec.gone[sid];
    // v83 decision 2A: keeping the tester this phone is USING, after the other
    // phone deleted it, means it is still the one in use — for the account
    // (1B), so the other phone gets it back as its tester in use as well.
    if (kind === 'instrument' && sid === _syncInUseId()) st.rec.resend[SYNC_INUSE_ID] = true;
    _syncSave(st);
    _syncHeldClear(sid, kind);
    done('');
    return syncPush({ manual: true, pull: true }).then(() => true);
  }

  return cloudClient()
    .then((c) => c.from('records').select('id,kind,doc,deleted,last_modified,updated_at')
      .eq('id', sid).limit(1)
      .then((r) => {
        if (r && r.error) throw r.error;
        const row = (r && r.data && r.data[0]) || null;
        const st = _syncStateFor(_syncCurrentUserId());
        const rs = st.rec;
        if (!row || String(row.kind || '') !== kind) {
          _syncHeldClear(sid, kind);
          _syncSave(st);
          done('That ' + what + ' is no longer in the cloud, so this phone\u2019s copy has been kept.');
          return true;
        }
        const local = _syncRecordList(kind).find(x => x && String(x.id) === sid) || null;
        const presetBefore = _syncActivePresetSig();
        if (row.deleted === true) {
          // v83: a phone's last preset stays — there must always be one.
          if (local && !_syncApplyRecordDelete(kind, sid, rs)) {
            done('That\u2019s the only preset on this phone, so it has been kept. Add another preset first if you want this one gone.');
            return false;
          }
          delete rs.sent[sid];
          rs.gone[sid] = true;
        } else if (_syncValidRecord(kind, row.doc, sid)) {
          if (local) {
            // v83: a tester in use this phone doesn't have (yet) is not taken.
            if (!_syncReplaceRecord(kind, local, row.doc) && kind === 'settings') {
              done('That tester isn\u2019t on this phone yet, so nothing has been changed. Check for updates, then try again.');
              return false;
            }
          }
          else _syncRecordSetList(kind, _syncRecordList(kind).concat([_syncRecordFromDoc(kind, row.doc, null)]));
          rs.sent[sid] = _syncRecordHash(kind, row.doc);
          if (kind === 'settings') rs.inUse = String(row.doc.instrumentId);
          delete rs.gone[sid];
        } else {
          done('That cloud copy still can\u2019t be read, so nothing has been changed. Choose this phone\u2019s copy to replace it.');
          return false;
        }
        // v83: "in use" pointed at what now exists; an instrument delete's
        // frozen copies wait in `rs` for the run below to read the jobs first.
        _syncSettleLists(presetBefore);
        if (typeof saveSettings === 'function') saveSettings();
        _syncSave(st);
        _syncHeldClear(sid, kind);
        done('');
        return syncPush({ manual: true, pull: true }).then(() => true);
      }))
    .catch((e) => {
      done(syncErrorMessage(e));
      return false;
    });
}

// ---- "What's different?" (v82, decisions 5A and 6A) ------------------------------------
// A plain comparison of the two copies of a held job, for READING. It changes
// nothing, stores nothing, and is thrown away when the sheet closes: the cloud
// copy is fetched on the tap, compared, shown, and dropped — the held list
// still keeps counts only (rule 7).
//
// Items are matched by their own id. An item with no id (older data) is matched
// by position instead, which is the best available and is labelled no
// differently — those jobs predate the question this answers.
//
// Everything returned is display text, so the sheet only has to escape it.
// null for a value means "different, but not something a line can show"
// (readings, a frozen instrument copy), and the sheet says just that.
function syncJobDiff(local, cloud) {
  const L = local || {}, C = cloud || {};
  const blankish = (v) => v === undefined || v === null || v === '';
  const same = (a, b) => (blankish(a) && blankish(b)) || _syncCanonical(a) === _syncCanonical(b);
  const clip = (t) => { const x = String(t).replace(/\s+/g, ' ').trim(); return x.length > 60 ? x.slice(0, 59) + '\u2026' : x; };
  const when = (v) => { const d = new Date(v); return isNaN(d.getTime()) ? clip(v) : d.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  const fmt = (v, key) => {
    if (blankish(v)) return '(blank)';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (typeof v === 'number') return String(v);
    if (typeof v !== 'string') return null;
    if (key === 'result') return clip(v.charAt(0).toUpperCase() + v.slice(1));
    if (key === 'ts') return when(v);
    return clip(v);
  };

  // ---- the job's own details
  const JOB = { name: 'Job name', site: 'Site', engineer: 'Engineer', date: 'Date',
    prefix: 'Asset prefix', startNumber: 'Start number', startPad: 'Number padding',
    locked: 'Locked', instrumentId: 'Instrument', instrumentSnapshot: 'Instrument details',
    clientId: 'Client in your list', siteId: 'Site in your list' };
  const SKIP = { id: 1, items: 1, exportedAt: 1, exportDirty: 1 };
  const jobVal = (key, v) => {
    if (key === 'instrumentId') {
      if (blankish(v)) return '(none)';
      const inst = (typeof findInstrument === 'function') ? findInstrument(v) : null;
      return inst && typeof instrumentDisplayName === 'function' ? clip(instrumentDisplayName(inst)) : 'an instrument not on this phone';
    }
    if (key === 'clientId') { const n = _syncClientNameOf(v); return n === '' ? '(none)' : (n === null ? 'a client not on this phone' : clip(n)); }
    if (key === 'siteId') {
      if (blankish(v)) return '(none)';
      const st = (state.sites || []).find(x => x && String(x.id) === String(v));
      return st ? clip(st.name) : 'a site not on this phone';
    }
    return fmt(v, key);
  };
  const details = [];
  let otherJob = false;
  const jobKeys = Array.from(new Set(Object.keys(L).concat(Object.keys(C))));
  for (const key of Object.keys(JOB)) {
    if (!same(L[key], C[key])) details.push({ label: JOB[key], here: jobVal(key, L[key]), cloud: jobVal(key, C[key]) });
  }
  for (const key of jobKeys) {
    if (JOB[key] || SKIP[key]) continue;
    if (!same(L[key], C[key])) otherJob = true;
  }
  const exp = (s) => s.exportedAt ? ('Exported' + (s.exportDirty ? ', changed since' : '')) : 'Not exported';
  if (exp(L) !== exp(C)) details.push({ label: 'Export', here: exp(L), cloud: exp(C) });
  if (otherJob) details.push({ label: 'Other job details', here: null, cloud: null });

  // ---- items
  const ITEM = { assetNo: 'Asset ID', itemType: 'Item', location: 'Location', result: 'Result',
    notes: 'Notes', readings: 'Readings', ts: 'Time logged' };
  const label = (it) => {
    const bits = [it.assetNo, it.itemType, it.location].map(x => (x == null ? '' : String(x).trim())).filter(Boolean);
    return bits.length ? clip(bits.join(' \u00b7 ')) : 'An item with no asset number';
  };
  const keyed = (items) => {
    const m = new Map();
    (Array.isArray(items) ? items : []).forEach((it, i) => {
      if (!it || typeof it !== 'object') return;
      let k = (it.id != null && it.id !== '') ? 'i:' + String(it.id) : 'n:' + i;
      while (m.has(k)) k += '+';
      m.set(k, it);
    });
    return m;
  };
  const LI = keyed(L.items), CI = keyed(C.items);
  const onlyHere = [], onlyCloud = [], changed = [];
  let unchanged = 0;
  for (const [k, it] of LI) {
    if (!CI.has(k)) { onlyHere.push(label(it)); continue; }
    const other = CI.get(k);
    const fields = [];
    let otherItem = false;
    for (const f of Object.keys(ITEM)) {
      if (!same(it[f], other[f])) fields.push({ label: ITEM[f], here: fmt(it[f], f), cloud: fmt(other[f], f) });
    }
    for (const f of new Set(Object.keys(it).concat(Object.keys(other)))) {
      if (f === 'id' || ITEM[f]) continue;
      if (!same(it[f], other[f])) otherItem = true;
    }
    if (otherItem) fields.push({ label: 'Other details', here: null, cloud: null });
    if (fields.length) changed.push({ label: label(it), fields });
    else unchanged++;
  }
  for (const [k, it] of CI) if (!LI.has(k)) onlyCloud.push(label(it));

  return {
    details, onlyHere, onlyCloud, changed, unchanged,
    hereCount: LI.size, cloudCount: CI.size,
    none: !details.length && !onlyHere.length && !onlyCloud.length && !changed.length,
  };
}

// The tap. Fetches the cloud copy of ONE held job, compares, opens the sheet.
// Needs signal, as answering does. The fetched document goes into the diff and
// nowhere else.
function syncHeldDiff(id) {
  const sid = String(id);
  if (!syncActive()) return Promise.resolve(false);
  const entry = _syncHeldLoad().find(e => e.kind === 'session' && e.id === sid);
  if (!entry) return Promise.resolve(false);
  if (_syncOffline()) {
    state.sync.message = 'No signal right now. Comparing needs the cloud copy \u2014 try again when you\u2019re back online.';
    _syncRepaint();
    return Promise.resolve(false);
  }
  state.sync.diffing = sid;
  state.sync.message = '';
  _syncRepaint();
  // ⚠ Clear the busy flag and repaint BEFORE opening the sheet: an open sheet
  // blocks every repaint (_syncSafeToRepaint), so the button would otherwise
  // say "Checking…" until something else happened to repaint the page.
  const done = (msg) => {
    state.sync.diffing = null;
    if (msg) state.sync.message = msg;
    _syncRepaint();
  };
  return cloudClient()
    .then((c) => c.from('sessions').select('id,doc,deleted,updated_at').eq('id', sid).limit(1))
    .then((r) => {
      if (r && r.error) throw r.error;
      const row = (r && r.data && r.data[0]) || null;
      const local = (state.sessions || []).find(s => s && String(s.id) === sid) || null;
      if (!row || row.deleted === true) { done('The cloud no longer has a copy of that job to compare with.'); return false; }
      if (!local) { done('This phone no longer has that job to compare with.'); return false; }
      if (!_syncValidDoc(row.doc, sid)) { done('The cloud copy of that job can\u2019t be read, so it can\u2019t be compared.'); return false; }
      const diff = syncJobDiff(local, row.doc);
      done('');
      if (typeof openSyncDiffSheet === 'function') openSyncDiffSheet(entry, diff);
      return true;
    })
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
// ⚠ MAP rules 2/3. Repainting over a focused field tears the keyboard down on
// iOS mid-entry, and repainting under an open sheet pulls it out from under the
// thumb. Both checks, one place, used by every repaint this file does.
function _syncSafeToRepaint() {
  // v83: three settings screens hold unsaved typing in fields that are not
  // focused — the instrument editor, the preset buttons, the user page (whose
  // instrument list a pull can now change). Repainting them would throw that
  // typing away (MAP rule 3), so the repaint is owed until the engineer leaves.
  if (SYNC_NO_REPAINT_VIEWS.indexOf(state.view) !== -1) return false;
  try {
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return false;
    if (document.querySelector('body > .bulk-sheet, body > .fail-sheet, body > .modal-backdrop')) return false;
  } catch { /* no DOM to inspect — nothing unsafe to be over */ }
  return true;
}

// Push results: the Sync page only, because nothing else shows them.
function _syncRepaint() {
  if (state.view !== 'cloudSync') return;
  if (!_syncSafeToRepaint()) return;
  render();
}

// v81.2, decision 1A. Pull results: whatever is on screen, because a pull adds
// jobs, removes them and raises banners on screens that are not the Sync page.
//
// ⚠ Until V81.2 this did not exist, and the ONLY repaint was the Sync page one
// above. Everything worked and almost nothing showed: a deleted job sat in the
// list, the waiting banner never appeared, and Peter had to tap between jobs to
// force a render the app should have done. Correct state that never reaches the
// screen is indistinguishable from a broken app.
//
// If it is not safe right now, remember and take the next safe moment rather
// than dropping it — that is what _syncFlushRepaint() is for.
let _syncRepaintWanted = false;

function _syncRepaintApp() {
  if (!_syncSafeToRepaint()) { _syncRepaintWanted = true; return; }
  _syncRepaintWanted = false;
  render();
}

// The next safe moment: a field blurred, a sheet closed, or the idle check came
// round. Cheap and does nothing unless a repaint is actually owed.
function _syncFlushRepaint() {
  if (!_syncRepaintWanted) return;
  if (!_syncSafeToRepaint()) return;
  _syncRepaintWanted = false;
  render();
}
