/*!
 * PATGo PWA — sync.js (cloud sync: push and pull)
 * v88 (September 2026)
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
 * V84: REPORT SETTINGS, THE CERTIFICATE COUNTER AND REPORT TEMPLATES through
 * records (two more settings ids, kind 'template'). See the v84 note above
 * _syncRecordGroup: the counter never asks, "nothing made" is never pushed.
 *
 * V88: PHOTOS GO UP, one way (decision 1A; V89 brings them down, on request
 * only — decision 10A). See "photos" at the end of the file. A photo is never
 * edited, only added or deleted, so none of the fingerprint or hold machinery
 * applies: a photo is either in the cloud (st.ph.sent) or not.
 *
 * V83.1: THE PULL NO LONGER STEPS OVER ROWS. Both pagers now re-read the last
 * page's timestamp ("at or after", not "after") — see the v83.1 note at the
 * jobs pager. That makes re-reading a row this phone already knows routine,
 * so a cloud row that still equals what this phone last sent is now no work,
 * even if the phone has edited since (it used to be held as changed on both
 * sides). And every phone reads its jobs and records once from the start
 * (SYNC_PAGER_V), to pick up anything an earlier version stepped over.
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
           pulledAt: null, lastPullAt: null, hashV: SYNC_HASH_V, pagerV: SYNC_PAGER_V,
           // v82: the same bookkeeping for clients and sites, kept apart from the
           // jobs' so the two can never be confused. Keyed by record id alone,
           // which is how the server keys them (primary key user_id + id).
           // `kinds` is the SYNC_RECORD_KINDS list the cursor was read with.
           rec: _syncRecEmpty(),
           // v88: photos this phone has uploaded — {photoId: {s: sessionId,
           // i: itemId}}. Set only after BOTH the file and its row are in the
           // cloud; removed when this phone deletes the cloud copy. The job and
           // item are kept so a deleted job or item can take its cloud photos
           // with it even after they were cleared from this phone (5A).
           // v89: `sent` now means KNOWN to be in the cloud — this phone's own
           // uploads AND rows read from the photos table for jobs on this phone
           // (decision 5A: any phone that can see a cloud photo can delete it).
           // Entries may also carry b (bytes), t (1 = a preview exists, 1A) and
           // a (taken at). `pulledAt` is the photo rows' own cursor; `need` lists
           // jobs that arrived after that cursor passed their rows.
           ph: { sent: {}, pulledAt: null, need: [] },
           // V91 (Stage 4, 1A): {jobId: fingerprint of the cloud copy as the pull
           // last READ it}. Not what was sent — what was SEEN. A job is safe in
           // the cloud when this equals the phone's copy (syncJobsSafety).
           conf: {}, confV: SYNC_CONF_V };
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
  // v86: descBase — the descriptions both phones last agreed on (lower-cased),
  // or null. Like inUse, a value both sides AGREED, so it is set only when the
  // cloud is seen to equal this phone, or after this phone's copy is sent.
  return { sent: {}, gone: {}, resend: {}, pulledAt: null, kinds: '', freeze: {}, inUse: null, descBase: null };
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
    if (Array.isArray(rr.descBase)) r.descBase = rr.descBase.filter(x => typeof x === 'string');   // v86
  }
  // v88. Not a fingerprint, so hashV never clears it. Malformed entries are
  // dropped, which only ever means "upload that photo again" — an upsert of an
  // identical file: the safe direction.
  const rp = raw.ph;
  if (rp && typeof rp === 'object' && !Array.isArray(rp) && rp.sent && typeof rp.sent === 'object' && !Array.isArray(rp.sent)) {
    for (const k of Object.keys(rp.sent)) {
      const e = rp.sent[k];
      if (!(e && typeof e === 'object' && typeof e.s === 'string' && typeof e.i === 'string')) continue;
      // v89: the optional extras. Anything odd is dropped, never the entry.
      const o = { s: e.s, i: e.i };
      if (typeof e.b === 'number' && e.b > 0 && isFinite(e.b)) o.b = Math.round(e.b);
      if (e.t === 1 || e.t === true) o.t = 1;
      if (typeof e.a === 'string' && !isNaN(Date.parse(e.a))) o.a = e.a;
      out.ph.sent[k] = o;
    }
  }
  // v89. A missing cursor means "read every photo row" — rows only, and only
  // kept for jobs on this phone: the safe direction, and cheap.
  if (rp && typeof rp === 'object' && typeof rp.pulledAt === 'string' && !isNaN(Date.parse(rp.pulledAt))) out.ph.pulledAt = rp.pulledAt;
  if (rp && typeof rp === 'object' && Array.isArray(rp.need)) {
    out.ph.need = rp.need.filter(x => typeof x === 'string' && x).slice(0, 2000);
  }
  // V91: a fingerprint, so hashV drops it with the rest (a read under the old
  // hashing can't vouch for anything).
  if (raw.conf && typeof raw.conf === 'object' && !Array.isArray(raw.conf)) {
    for (const k of Object.keys(raw.conf)) if (typeof raw.conf[k] === 'string') out.conf[k] = raw.conf[k];
  }
  if (raw.hashV !== SYNC_HASH_V) { out.sent = {}; out.rec.sent = {}; out.conf = {}; }
  else out.hashV = SYNC_HASH_V;
  // v83.1 (decision 3A). Cursors written by a pager that could step over rows
  // are not trusted: both are cleared once, so the next run reads jobs and
  // records from the start. Unlike hashV nothing else is dropped — rows this
  // phone already has resolve as no work. Saved with the new pagerV by the
  // first run, so it happens once per phone (per account).
  if (raw.pagerV !== SYNC_PAGER_V) { out.pulledAt = null; out.rec.pulledAt = null; }
  // V91 (decision 2A). A state saved before V91 has never recorded what the pull
  // read, and its jobs cursor is already past the rows that would tell it. The
  // jobs cursor (only) is cleared once, so the next run reads every job back and
  // records it; rows this phone already has resolve as no work. Saved with the
  // new confV by that run, so it happens once per phone (per account).
  if (raw.confV !== SYNC_CONF_V) { out.pulledAt = null; out.conf = {}; }
  return out;
}

function _syncSave(st) {
  try { localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(st)); } catch (e) {
    console.error('Sync state could not be saved (non-fatal).', e);
  }
  _syncPhotoCloudPoint(st);
}

// v89: the UI's view of the photos known in the cloud (photos.js reads it
// synchronously for badges and the strip). Pointed at the state just saved —
// the same object, so it is never a stale copy — with a counter so photos.js
// knows to rebuild its lookup.
function _syncPhotoCloudPoint(st) {
  try {
    if (!st || !st.ph) return;
    state.photoCloud = st.ph.sent;
    state.photoCloudUser = st.userId || '';
    state.photoCloudV = (state.photoCloudV || 0) + 1;
  } catch { /* the badges simply show this phone's photos */ }
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
  // v84: report settings (the one visible row) and templates get a third line.
  // Something nobody made and never sent (5A) has nothing to send: up to date.
  let recTotal = 0, recUpToDate = 0, listTotal = 0, listUpToDate = 0, rpTotal = 0, rpUpToDate = 0, gsTotal = 0, gsUpToDate = 0;
  for (const kind of SYNC_RECORD_KINDS) {
    for (const r of _syncRecordList(kind)) {
      if (!r || r.id == null || r.id === '') continue;
      const id = String(r.id);
      // v86: the general rows count too — all but Smart Quick Pick's history,
      // which moves with every item logged (the certificate counter's rule).
      if (kind === 'settings' && id !== SYNC_REPORT_ID && !(_syncIsGeneral(id) && id !== SYNC_SQP_ID)) continue;
      const grp = _syncRecordGroup(kind, id);
      const sent = st.rec.sent[id];
      const ok = sent === _syncRecordHash(kind, r) || (!sent && (grp === 'rp' || grp === 'gs') && _syncNothingMade(kind, id, r));
      if (grp === 'cs') { recTotal++; if (ok) recUpToDate++; }
      else if (grp === 'rp') { rpTotal++; if (ok) rpUpToDate++; }
      else if (grp === 'gs') { gsTotal++; if (ok) gsUpToDate++; }
      else { listTotal++; if (ok) listUpToDate++; }
    }
  }
  // v88: photos on this phone that belong to a job that syncs (and to an item
  // still in it), and how many of those are in the cloud. null until the photo
  // mirror is loaded — the page then says nothing rather than a wrong number.
  const phJobs = _syncPhotoJobs();
  let phTotal = 0, phUp = 0, phCloudOnly = 0;
  if (phJobs) for (const id of phJobs.keys()) { phTotal++; if (st.ph.sent[id]) phUp++; }
  // v89: photos of jobs on this phone that are only in the cloud.
  if (phJobs && typeof photoCountsForSession === 'function') {
    for (const s of jobs) phCloudOnly += photoCountsForSession(s).cloud;
  }
  return {
    total: jobs.length, upToDate, waiting: jobs.length - upToDate,
    recTotal, recUpToDate, listTotal, listUpToDate, rpTotal, rpUpToDate, gsTotal, gsUpToDate,
    phReady: !!phJobs, phTotal, phUp, phCloudOnly,
    lastPushAt: st.lastPushAt,
    // v81
    lastPullAt: st.lastPullAt,
    held: _syncHeldLoad().length,
  };
}

// ---- V91 (roadmap Stage 4): safe in the cloud ---------------------------------
//
// A job is SAFE IN THE CLOUD when the cloud's copy has been SEEN to match the
// phone's (1A: st.conf, recorded by the pull's read-back of this phone's own
// push) and every photo of it on this phone is known in the cloud. That, and
// only that, lets it come off this phone (R6).
//
// Why not "the push succeeded": the fingerprint of what was SENT (st.sent) says
// what this phone tried to put there. The read-back says what is there. Today
// every pull already downloads back each job this phone pushed (the waste
// Stage 5's lighter pull removes), so the proof costs nothing extra; when the
// fingerprint column lands, conf is filled from that column instead.
//
// Reasons, in the order they are judged (the first one that applies is the one
// the engineer is told):
//   held            waiting for an answer on the Sync page
//   unsent          changes on this phone not sent yet
//   photos-unknown  the photo list hasn't been read yet (nothing is assumed)
//   photos          n photos still to upload
//   checking        sent, but the cloud copy not read back yet (next sync)
//   safe
// The example job never syncs and is left out altogether.
//
// fresh = false (display: job cards, counts, the offer) reuses a job's
// fingerprint while storage.js reuses its saved encoding — the same proof that
// nothing in it changed. fresh = true (every REMOVAL) hashes every job again.
// Returns null when not signed in: there is nothing to be safe in.
const _syncJobHashMemo = new WeakMap();

function _syncJobHash(s, fresh) {
  const cache = (typeof _encodedSessionCache !== 'undefined') ? _encodedSessionCache : null;
  if (!fresh && cache && s.id !== state.activeId) {
    const enc = cache.get(s);
    const m = _syncJobHashMemo.get(s);
    // ⚠ storage.js's own reuse test, plus identity of its cache entry: any
    // invalidation (_invalidateSessionEncoding) or re-encode makes a new entry.
    if (enc && m && m.enc === enc && enc.itemsRef === s.items && enc.sig === _sessionSig(s)) return m.hash;
    const hash = syncHash(_syncCanonical(s));
    if (enc && enc.itemsRef === s.items && enc.sig === _sessionSig(s)) _syncJobHashMemo.set(s, { enc, hash });
    return hash;
  }
  return syncHash(_syncCanonical(s));
}

function syncJobsSafety(fresh) {
  if (!syncActive()) return null;
  const uid = _syncCurrentUserId();
  const st = _syncStateFor(uid);
  const pending = (uid && st.userId === uid) ? _syncPhotosPendingByJob(st) : null;
  const held = new Set(_syncHeldLoad().filter(e => e.kind === 'session').map(e => e.id));
  const map = new Map();
  let safe = 0;
  for (const s of _syncSessions()) {
    const id = String(s.id);
    const h = _syncJobHash(s, !!fresh);
    let r;
    if (held.has(id)) r = { safe: false, why: 'held' };
    else if (st.sent[id] !== h) r = { safe: false, why: 'unsent' };
    else if (!pending) r = { safe: false, why: 'photos-unknown' };
    else if (pending.get(id)) r = { safe: false, why: 'photos', n: pending.get(id) };
    else if (st.conf[id] !== h) r = { safe: false, why: 'checking' };
    else { r = { safe: true, why: 'safe' }; safe++; }
    map.set(id, r);
  }
  return { map, safe, total: map.size };
}

// One plain line for a reason. Never shown signed out.
function syncSafetyText(r) {
  if (!r) return '';
  switch (r.why) {
    case 'safe':           return 'Safe in the cloud';
    case 'held':           return 'Waiting for your answer on the Sync page';
    case 'unsent':         return 'Latest changes not sent yet';
    case 'photos-unknown': return 'Checking its photos\u2026';
    case 'photos':         return `${r.n} photo${r.n === 1 ? '' : 's'} still to upload`;
    case 'checking':       return 'Sent \u2014 confirmed on the next sync';
    default:               return '';
  }
}

// V80 decision 5A, V91 (Stage 4): clearing jobs while signed in is local
// housekeeping and the cloud keeps them — so only a job SAFE IN THE CLOUD may
// go. Always fresh (every job hashed again): this is the check AT the moment of
// clearing. `kept` carries each refused job's reason.
// Signed out: unchanged pre-V80 behaviour, every target is clearable.
//
// V92 (3B): `verified` (from syncVerifyJobs) is what the cloud's REAL contents
// hash to, per job. Given, a safe job may go only if that equals its fresh hash
// — the fingerprint says the cloud has it; the contents prove it, at the one
// moment data leaves the phone. Not given (no signal), the last read stands.
function syncPruneFilter(targets, verified) {
  const list = Array.isArray(targets) ? targets : [];
  if (!syncActive()) return { clear: list.slice(), kept: [], active: false };
  const safety = syncJobsSafety(true);
  const clear = [], kept = [];
  for (const s of list) {
    let r = (s && safety) ? safety.map.get(String(s.id)) : null;
    if (r && r.safe && verified instanceof Map && verified.get(String(s.id)) !== syncHash(_syncCanonical(s))) {
      r = { safe: false, why: 'checking' };
    }
    if (r && r.safe) clear.push(s);
    else kept.push({ s, why: r ? r.why : 'unsent', r });
  }
  return { clear, kept, active: true };
}

// V92 (3B). Read the real contents of these jobs from the cloud and hash them
// — the check made before a job comes off the phone, now that the pull no
// longer downloads what it sent. Memory only: nothing is written (a run may be
// going). Resolves a Map id → hash (null: deleted, missing or unreadable), or
// null with no signal / signed out. Rejects if the cloud can't be read.
function syncVerifyJobs(ids) {
  const want = Array.from(new Set((ids || []).map(String).filter(Boolean)));
  if (!syncActive() || _syncOffline()) return Promise.resolve(null);
  const uid = _syncCurrentUserId();
  if (!uid) return Promise.resolve(null);
  const out = new Map(want.map(id => [id, null]));
  const batch = (typeof SYNC_PHOTO_NEED_BATCH === 'number') ? SYNC_PHOTO_NEED_BATCH : 50;
  return cloudClient().then((c) => {
    let chain = Promise.resolve();
    for (let k = 0; k < want.length; k += batch) {
      const chunk = want.slice(k, k + batch);
      chain = chain.then(() => c.from('sessions').select('id,doc,deleted').eq('user_id', uid).in('id', chunk))
        .then((r) => {
          if (r && r.error) throw r.error;
          for (const row of ((r && r.data) || [])) {
            const id = String(row && row.id != null ? row.id : '');
            if (!out.has(id) || row.deleted === true || !_syncValidDoc(row.doc, id)) continue;
            out.set(id, syncHash(_syncCanonical(row.doc)));
          }
        });
    }
    return chain;
  }).then(() => out);
}

// V91: a job turns safe on a run that changed nothing on screen — the read-back
// only records a fingerprint, and the last photo can go up after the jobs half.
// So after every run the set of safe jobs is compared with the last one seen,
// and the screens that show it (Jobs list, Jobs on this phone) repaint when it
// moved. Display check only (memoised fingerprints); never on another screen.
let _syncLastSafeSig = null;
function _syncSafetyRepaint() {
  try {
    const safety = syncJobsSafety(false);
    const sig = safety ? Array.from(safety.map.entries()).map(([id, r]) => id + ':' + r.why).sort().join('|') : '';
    if (sig === _syncLastSafeSig) return;
    _syncLastSafeSig = sig;
    if (state.view === 'sessions' || state.view === 'jobManager') _syncRepaintApp();
  } catch (e) { /* display only */ }
}

// Run fn once no sync run is going, in one synchronous step (a run holds its
// own copy of the sync state and the job list; see syncPhotoKnowForDelete).
function syncWhenIdle(fn) {
  const go = () => {
    if (_syncRunning) return _syncRunning.then(go, go);
    return fn();
  };
  return Promise.resolve().then(go);
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

// ---- the fingerprint column (V92, Stage 5 12A) ----------------------------------
// sessions.fp = syncHash(_syncCanonical(doc)), sent by the phone in the same
// write as the doc (2A). The database blanks it when a doc changes without one
// (a V91 phone) — supabase/schema.sql sessions_fp_guard — so a blank means
// "unknown: download it", which is exactly the pre-V92 behaviour. A stale hash
// version (SYNC_HASH_V) simply never matches and falls back the same way.
const _SYNC_JOB_LIST_COLS = 'id,fp,deleted,updated_at';
const _SYNC_JOB_DOC_COLS = 'id,doc,fp,deleted,updated_at';
function _syncFp(row) {
  return (row && typeof row.fp === 'string' && row.fp) ? row.fp : null;
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
  // v89: badges and the strip can show cloud photos from the first paint.
  try { _syncPhotoCloudPoint(_syncLoad()); } catch { /* next save does it */ }
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
      delete st.conf[id];   // V91: nothing in the cloud to vouch for it
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

    // V92 (Stage 5, 12A). A row the fingerprint settles arrives WITHOUT its doc
    // (see needsDoc below): its `fp` stands in for the hash. Every branch below
    // that reads the doc is one needsDoc sends for it; the `!doc` guards are the
    // belt to that — a light row that got here by mistake waits, never guesses.
    const light = (row.doc === undefined);
    if (light && !_syncFp(row)) { blocked = true; return; }

    // Decision 8A: anything unreadable is held, not dropped. A dropped row is a
    // row the cursor moves past and nobody ever sees again.
    if (!light && !_syncValidDoc(row.doc, id)) {
      delete st.conf[id];   // V91: an unreadable cloud copy vouches for nothing
      _syncHeldNote({ id, reason: 'unreadable', name,
        localItems: (local && Array.isArray(local.items)) ? local.items.length : null, cloudItems: null });
      blocked = true; out.held++;
      return;
    }

    const doc = light ? null : row.doc;
    const hash = light ? _syncFp(row) : syncHash(_syncCanonical(doc));
    // V91 (Stage 4, 1A). What the cloud was SEEN to hold, whatever is decided
    // below. After a push, the next pull reads the row again (the push never
    // moves the cursor), and if it matches the phone's copy the cloud has it.
    // Held rows record it too — the phone's copy then differs, so not safe.
    // V92 (2A, 3B): a light row's `fp` was written by the phone that wrote the
    // doc, in the same row write, and a doc changed without it is blanked by the
    // database (sessions_fp_guard) — so reading it is reading what the cloud
    // holds. Removal still checks the real contents (syncVerifyJobs).
    st.conf[id] = hash;

    if (!local) {
      if (tomb) {
        // Deleted here. If that delete has not reached the cloud yet, the push
        // half of this very run carries it — nothing to decide.
        if (!st.gone[id]) return;
        if (!doc) { blocked = true; return; }   // V92: needsDoc sends for it
        // It HAS reached the cloud, and the row is live again: the other phone
        // has it back. Deleting someone's work twice over is not a default.
        _syncHeldNote({ id, reason: 'deleted-here', name,
          localItems: null, cloudItems: doc.items.length });
        blocked = true; out.held++;
        return;
      }
      if (!doc) { blocked = true; return; }   // V92: needsDoc sends for it
      // A job from the other phone. Newest-first, like createSession().
      state.sessions.unshift(doc);
      st.sent[id] = hash;
      // v89: its photo rows may be behind the photo cursor already.
      st.ph.need.push(id);
      out.added++; changed = true;
      _syncHeldClear(id);
      return;
    }

    const localHash = syncHash(_syncCanonical(local));

    // Identical. Usually this phone's own push coming back to it.
    if (hash === localHash) { st.sent[id] = hash; _syncHeldClear(id); return; }

    // ⚠ v83.1. The cloud row is exactly what this phone last sent: the other
    // phone has not touched it, so there is nothing here to take — only this
    // phone moved, and the push half of this run sends it. Before V83.1 this
    // fell through to "both changed" whenever the phone had been edited since
    // its own push (push, keep logging, next run reads the push back), and the
    // job was held for a question with only one side to it. The v83.1 pager
    // re-reads the boundary rows every run, which would make that routine.
    if (hash === st.sent[id]) { _syncHeldClear(id); return; }

    if (!doc) { blocked = true; return; }   // V92: needsDoc sends for it

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

  // Keyset paging on updated_at.
  // ⚠ v83.1 (decision 2A). Postgres stamps updated_at with the time the
  // TRANSACTION started, so every row in one upload batch (up to
  // SYNC_BATCH_ROWS) carries the same timestamp. V81–V83 asked the next page
  // for rows AFTER the last one read: when a page ended part-way through a
  // batch, the rest of that batch was stepped over and the cursor moved past
  // it for good (harness 20a). Each page now starts AT the last timestamp, so
  // the boundary batch is read again in full; rows already seen in this run
  // are skipped (`seen`), and rows from earlier runs resolve as no work. The
  // guard below is now real: a full page all on one timestamp cannot move, so
  // the run stops and leaves the mark where it was. Needs more rows in one
  // transaction than SYNC_PULL_PAGE — impossible while batches are smaller.
  //
  // V92 (Stage 5, 12A — R17). Each page is a LIST: id, fingerprint, deleted,
  // updated_at — about 100 bytes a job. Before V92 every page carried every
  // doc, so each push came straight back down in full on the next pull (a
  // 300-item job after every pause in logging). needsDoc() says which rows the
  // fingerprint cannot settle; only those docs are fetched, by id, before the
  // page is decided. The rows are decided in list order either way.
  function needsDoc(row) {
    const id = String(row && row.id != null ? row.id : '');
    if (!id || pruned.has(id) || st.resend[id] || row.deleted === true) return false;
    const fp = _syncFp(row);
    if (!fp) return true;                      // written by an older phone, or blanked
    const local = (state.sessions || []).find(s => s && String(s.id) === id);
    if (!local) {
      const tomb = (state.tombstones || []).some(t => t && t.kind === 'session' && String(t.id) === id);
      return !(tomb && !st.gone[id]);          // only "our delete is on its way" needs nothing
    }
    if (fp === st.sent[id]) return false;      // only this phone moved (v83.1)
    return fp !== syncHash(_syncCanonical(local));   // identical needs nothing
  }
  function docsFor(rows) {
    const want = [];
    for (const row of rows) {
      const id = String(row && row.id != null ? row.id : '');
      if (needsDoc(row) && want.indexOf(id) === -1) want.push(id);
    }
    const got = new Map();
    const batch = (typeof SYNC_PHOTO_NEED_BATCH === 'number') ? SYNC_PHOTO_NEED_BATCH : 50;
    let chain = Promise.resolve();
    for (let k = 0; k < want.length; k += batch) {
      const chunk = want.slice(k, k + batch);
      chain = chain.then(() => c.from('sessions').select(_SYNC_JOB_DOC_COLS).eq('user_id', uid).in('id', chunk))
        .then((r) => {
          if (r && r.error) throw r.error;
          for (const d of ((r && r.data) || [])) {
            const id = String(d && d.id != null ? d.id : '');
            if (id && chunk.indexOf(id) !== -1) got.set(id, d);
          }
        });
    }
    return chain.then(() => ({ want: new Set(want), got }));
  }
  const seen = new Set();
  function page(from) {
    return c.from('sessions')
      .select(_SYNC_JOB_LIST_COLS)
      .gte('updated_at', from)
      .order('updated_at', { ascending: true })
      .limit(SYNC_PULL_PAGE)
      .then((r) => {
        if (r && r.error) throw r.error;
        const rows = (r && r.data) || [];
        const fresh = rows.filter((row) => !seen.has(String(row && row.id) + '|' + String(row && row.updated_at)));
        return docsFor(fresh).then((d) => {
          for (const row of rows) {
            const u = row && row.updated_at;
            const key = String(row && row.id) + '|' + String(u);
            if (!seen.has(key)) {
              seen.add(key);
              const id = String(row && row.id != null ? row.id : '');
              // The row as fetched may be NEWER than the listed one (or deleted
              // since): it is what the cloud holds now, so it is what is decided.
              // A doc asked for and not returned waits (blocked) for next time.
              if (d.want.has(id)) { if (d.got.has(id)) decide(d.got.get(id)); else blocked = true; }
              else decide({ id: row.id, fp: row.fp, deleted: row.deleted, updated_at: row.updated_at });
            }
            if (typeof u === 'string' && u > high) high = u;
          }
          if (rows.length < SYNC_PULL_PAGE) return;
          if (high === from) { blocked = true; return; }
          return page(high);
        });
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
    st.confV = SYNC_CONF_V;
    // V91: only jobs on this phone need vouching for. A cleared job's entry
    // would never be read again (the pull skips it) — dropped, not kept stale.
    const onPhone = new Set((state.sessions || []).map(s => String(s && s.id)));
    for (const k of Object.keys(st.conf)) if (!onPhone.has(k)) delete st.conf[k];
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
      _syncSafetyRepaint();
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
  const rp = ok ? (rr.rp || { in: 0, out: 0, held: 0 }) : null;   // v84
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

  const reps = [];
  if (ok) {
    if (rp.in) reps.push(plural(rp.in, 'change', 'changes') + ' brought in');
    if (rp.out) reps.push(plural(rp.out, 'change', 'changes') + ' sent');
  }

  const gs = ok ? (rr.gs || { in: 0, out: 0, held: 0 }) : null;   // v86
  const gens = [];
  if (ok) {
    if (gs.in) gens.push(plural(gs.in, 'change', 'changes') + ' brought in');
    if (gs.out) gens.push(plural(gs.out, 'change', 'changes') + ' sent');
  }

  let msg = bits.length ? bits.join(', ') + '.' : '';
  if (rec.length) msg += (msg ? ' ' : '') + 'Clients & sites: ' + rec.join(', ') + '.';
  if (lists.length) msg += (msg ? ' ' : '') + 'Instruments & presets: ' + lists.join(', ') + '.';
  if (reps.length) msg += (msg ? ' ' : '') + 'Report settings & templates: ' + reps.join(', ') + '.';
  if (gens.length) msg += (msg ? ' ' : '') + 'General settings: ' + gens.join(', ') + '.';
  if (ok && rr.inUseNow) msg += (msg ? ' ' : '') + 'The tester in use is now ' + rr.inUseNow + ', as chosen on your other device.';
  // v88
  const ph = r.photos || null;
  if (ph && !ph.error) {
    const pbits = [];
    if (ph.up) pbits.push(plural(ph.up, 'photo', 'photos') + ' sent');
    if (ph.gone) pbits.push(plural(ph.gone, 'photo deletion', 'photo deletions') + ' sent');
    if (ph.more) pbits.push(ph.more + ' more to send next time');
    if (ph.removed) pbits.push(plural(ph.removed, 'photo', 'photos') + ' removed here (deleted on your other device)');
    if (pbits.length) msg += (msg ? ' ' : '') + 'Photos: ' + pbits.join(', ') + '.';
  }
  if (!msg) msg = 'Everything was already up to date.';
  if (ph && ph.error) {
    msg += ' Photos couldn\u2019t be sent this time \u2014 they\u2019re safe on this phone and will be tried again.';
  }
  if (rr && rr.error) {
    msg += ' Clients, sites, instruments, presets, report settings and general settings couldn\u2019t be checked this time \u2014 they\u2019re safe on this phone and will be tried again.';
  }

  const hJobs = p.held || 0;
  const hRec = ok ? (cs.held || 0) : 0;
  const hList = ok ? (ip.held || 0) : 0;
  const hRp = ok ? (rp.held || 0) : 0;   // v84
  const hGs = ok ? (gs.held || 0) : 0;   // v86
  const kindsHeld = [hJobs, hRec, hList, hRp, hGs].filter(n => n > 0).length;
  // (Jobs plus clients-or-sites alone keeps its own V82 wording, below.)
  if (kindsHeld > 1 && !(kindsHeld === 2 && hJobs && hRec)) {
    msg += ' Several things need you to decide \u2014 see below.';
  } else if (hGs) {
    msg += ' ' + plural(hGs, 'setting needs', 'settings need') + ' you to decide \u2014 see below.';
  } else if (hRp) {
    msg += ' ' + plural(hRp, 'report setting or template needs', 'report settings or templates need') + ' you to decide \u2014 see below.';
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
        .then((r) => {
          const base = { sent: r.sent, deleted: r.deleted, pulled, records };
          // v88: photos LAST — after the jobs push, so a photo's job is in the
          // cloud before the photo is. Reading runs only (never "Re-send all
          // jobs"). Fail-soft on their own, like records: a photo that will
          // not go never stops jobs, and the run still reports what it did.
          if (!opts.pull) return base;
          return _syncPhotosHalf(c, uid, st).then(
            (ph) => Object.assign(base, { photos: ph }),
            (e) => {
              console.error('Sync: photos not sent this time (non-fatal).', e);
              return Object.assign(base, { photos: { error: true } });
            });
        });
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
        row: { id, user_id: uid, doc: JSON.parse(json), fp: hash, deleted: false, last_modified: now } });
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
        row: { id, user_id: uid, doc: {}, fp: null, deleted: true, last_modified: at } });
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
      return _syncConfirmPushed(c, uid, st, work.filter(w => !w.gone).map(w => w.id));
    }).then(() => ({ sent, deleted }));
  });
}

// V92 (4A). Straight after a push, read back the fingerprint of just the jobs
// sent (id + fp, a few bytes each) so 🛡 comes in the same sync, not the next
// one. Rule 26 holds: `conf` is set only from what was READ, and only where the
// cloud row still carries exactly what this phone sent — another phone's write
// in between, or a write that never landed, leaves the job "checking" for the
// next pull to settle. Fail-soft: a failed read costs nothing but the wait.
function _syncConfirmPushed(c, uid, st, ids) {
  if (!ids.length) return Promise.resolve();
  const batch = (typeof SYNC_PHOTO_NEED_BATCH === 'number') ? SYNC_PHOTO_NEED_BATCH : 50;
  let n = 0;
  let chain = Promise.resolve();
  for (let k = 0; k < ids.length; k += batch) {
    const chunk = ids.slice(k, k + batch);
    chain = chain.then(() => c.from('sessions').select('id,fp,deleted').eq('user_id', uid).in('id', chunk))
      .then((r) => {
        if (r && r.error) throw r.error;
        for (const row of ((r && r.data) || [])) {
          const id = String(row && row.id != null ? row.id : '');
          const fp = _syncFp(row);
          if (!id || chunk.indexOf(id) === -1 || row.deleted === true || !fp) continue;
          if (fp === st.sent[id]) { st.conf[id] = fp; n++; }
        }
      });
  }
  return chain.then(() => { if (n) _syncSave(st); },
    (e) => { console.error('Sync: sent, confirmed on the next sync (non-fatal).', e); });
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

// ---- v84: report settings, the certificate counter, report templates -----------------
//   settings/SYNC_REPORT_ID — the live report settings as ONE row (4A), everything
//     except the certificate counter. Held when changed on both sides, like any
//     record; the card lists what differs and never stores an image (rule 7).
//     While Report settings is open nothing is applied or sent: its toggles
//     change state before Save, and its Save writes every field back.
//   settings/SYNC_CERT_ID — the counter alone (2A). Never asked about: a later
//     hand-typed set (certSetAt) wins, else the higher number. It can therefore
//     only go backwards when someone deliberately types a lower one.
//     stampCertNumber (report.js) also skips any number a job here already has.
//   template — one row per template, a full report identity minus the counter
//     (3A). The two starters share their ids on every install, so they are one
//     record (5A).
//   5A for both: "nothing made" (untouched starter, default settings, a counter
//     at 1 never set) is never pushed while unsent, a phone holding only that
//     takes the account's copy without asking, and a cloud copy that is only
//     that gives way to this phone's own.

// Which heading a kind sits under on the Sync page: 'cs' clients & sites,
// 'ip' instruments & presets (the tester in use with them), v84 'rp' report
// settings & templates (the two report settings rows with them).
function _syncRecordGroup(kind, id) {
  if (kind === 'client' || kind === 'site') return 'cs';
  if (kind === 'template') return 'rp';
  if (kind === 'settings' && (String(id) === SYNC_REPORT_ID || String(id) === SYNC_CERT_ID)) return 'rp';
  if (kind === 'settings' && _syncIsGeneral(id)) return 'gs';   // v86: general settings
  return 'ip';
}

// v84: what a report settings object syncs as — normalised (so the two ends
// compare like with like and a reload is never a change) and without the
// counter, which travels on its own row.
function _syncReportProjection(settings) {
  const n = (typeof normaliseReportSettings === 'function')
    ? normaliseReportSettings(settings)
    : Object.assign({}, (settings && typeof settings === 'object') ? settings : {});
  delete n.certNextNumber;
  delete n.certSetAt;
  return n;
}

function _syncReportRecord() {
  return { id: SYNC_REPORT_ID, settings: state.reportSettings };
}

function _syncCertRecord() {
  const rs = state.reportSettings || {};
  return { id: SYNC_CERT_ID, next: rs.certNextNumber, setAt: rs.certSetAt };
}

function _syncCertDoc(r) {
  const x = r || {};
  const n = parseInt(x.next, 10);
  return { id: SYNC_CERT_ID, next: (Number.isFinite(n) && n >= 1) ? n : 1,
    setAt: (typeof x.setAt === 'string' && !isNaN(Date.parse(x.setAt))) ? x.setAt : '' };
}

// v84 5A: the two built-in templates, exactly as a fresh install makes them.
function _syncIsStarterTemplate(rec) {
  if (!rec || typeof makeStarterReportTemplates !== 'function') return false;
  const id = String(rec.id);
  const s = makeStarterReportTemplates().find(x => x.id === id);
  return !!s && _syncRecordHash('template', s) === _syncRecordHash('template', rec);
}

function _syncIsDefaultReport(settings) {
  if (typeof makeDefaultReportSettings !== 'function') return false;
  return syncHash(_syncCanonical(_syncReportProjection(settings)))
    === syncHash(_syncCanonical(_syncReportProjection(makeDefaultReportSettings())));
}

// v84 5A: holds nothing anyone made. Only ever asked of an UNSENT record.
function _syncNothingMade(kind, id, rec) {
  if (kind === 'template') return _syncIsStarterTemplate(rec);
  if (kind !== 'settings') return false;
  if (String(id) === SYNC_REPORT_ID) return _syncIsDefaultReport(rec && rec.settings);
  if (String(id) === SYNC_CERT_ID) { const d = _syncCertDoc(rec); return d.next === 1 && !d.setAt; }
  if (_syncIsGeneral(id)) return _syncGeneralNothingMade(id, rec);   // v86
  return false;
}

// ---- v86: general settings (spec 8.4.4) -----------------------------------------------
// Six settings rows, all built fresh from state (like the tester-in-use row):
//   WORK, FAILS, CSV, MULTIPICK — the records rules: taken when only the other
//     phone changed, ASKED when both did (4A, 5A), the card naming what differs.
//   DESC — merged, never asked (3B). Three-way: anything both phones last agreed
//     on (rs.descBase) that one side has since removed is removed; anything
//     either side added is kept. So a deleted typo stays deleted, and typing it
//     again later brings it back — it is simply new to both. No base (a new
//     phone, or first meeting): a plain union.
//   SQP — merged, never asked (2B): the higher count per location and item
//     type, unless one side cleared or rebuilt later (SQP_RESET_KEY) — then
//     that side's history wins outright. Not counted on the Sync page: it moves
//     with every item logged, like the certificate counter.
//   5A for all six: out-of-the-box settings are never sent while unsent, a phone
//   holding only those takes the account's without asking, and a cloud copy that
//   is only those gives way.
// Every row is a PROJECTION (_syncGeneralNormalise), used for this phone's copy
// and the cloud's alike, so a reload is never a change (the 18b rule).

function _syncIsGeneral(id) { return SYNC_GENERAL_IDS.indexOf(String(id)) !== -1; }

// True while a screen that owns this row is open (SYNC_GENERAL_VIEWS).
function _syncGeneralOpen(id) {
  const v = SYNC_GENERAL_VIEWS[String(id)];
  return !!v && v.indexOf(state.view) !== -1;
}

function _syncSqpResetAt() {
  try {
    const v = localStorage.getItem(SQP_RESET_KEY) || '';
    return (v && !isNaN(Date.parse(v))) ? v : '';
  } catch { return ''; }
}

function _syncFailTagDefault(reason) {
  const d = (typeof DEFAULT_FAIL_REASON_TAGS !== 'undefined' && DEFAULT_FAIL_REASON_TAGS) ? DEFAULT_FAIL_REASON_TAGS[reason] : null;
  return (typeof d === 'string') ? d : 'visual';
}

// One shape for both ends. Anything malformed collapses to a safe value, as the
// app's own loaders do on reload.
function _syncGeneralNormalise(id, raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const sid = String(id);
  const str = (v) => typeof v === 'string' ? v.trim() : '';
  const strList = (v) => Array.isArray(v) ? v.map(x => str(x == null ? '' : String(x))).filter(Boolean) : [];
  if (sid === SYNC_WORK_ID) {
    return { id: sid, engineer: str(r.engineer), timestamps: r.timestamps === true, readings: r.readings === true,
             sqp: r.sqp === true, retest: r.retest === true };
  }
  if (sid === SYNC_FAILS_ID) {
    const reasons = strList(r.reasons);
    const tags = {};
    const src = (r.tags && typeof r.tags === 'object' && !Array.isArray(r.tags)) ? r.tags : {};
    const ok = (typeof READING_FAIL_TAGS !== 'undefined') ? READING_FAIL_TAGS : [];
    for (const reason of reasons) {
      const t = src[reason];
      tags[reason] = (typeof t === 'string' && ok.indexOf(t) !== -1) ? t : _syncFailTagDefault(reason);
    }
    return { id: sid, reasons, tags };
  }
  if (sid === SYNC_DESC_ID) {
    const seen = new Set(), list = [];
    for (const d of strList(r.list)) {
      const k = d.toLowerCase();
      if (!seen.has(k)) { seen.add(k); list.push(d); }
    }
    return { id: sid, list };
  }
  if (sid === SYNC_CSV_ID) {
    const columns = (Array.isArray(r.columns) ? r.columns : [])
      .filter(c => c && typeof c === 'object' && typeof c.id === 'string' && c.id)
      .map(c => ({ id: c.id, header: typeof c.header === 'string' ? c.header : '', visible: c.visible !== false }));
    return { id: sid, columns };
  }
  if (sid === SYNC_MULTIPICK_ID) {
    const m = (typeof normaliseMultiPickConfig === 'function') ? normaliseMultiPickConfig(r) : { enabled: false, slots: [] };
    return { id: sid, enabled: !!m.enabled, slots: (m.slots || []).map(s => ({ name: String(s.name || ''), items: (s.items || []).map(String) })) };
  }
  if (sid === SYNC_SQP_ID) {
    const history = (typeof normaliseSqpHistory === 'function') ? normaliseSqpHistory(r.history) : {};
    const resetAt = (typeof r.resetAt === 'string' && !isNaN(Date.parse(r.resetAt))) ? r.resetAt : '';
    return { id: sid, history, resetAt };
  }
  return null;
}

// This phone's copy of a row, from state.
function _syncGeneralRecord(id) {
  const sid = String(id);
  if (sid === SYNC_WORK_ID) {
    return _syncGeneralNormalise(sid, { engineer: state.engineer, timestamps: !!state.timestampsEnabled,
      readings: !!state.readingsEnabled, sqp: !!state.sqpEnabled, retest: !!state.retestRemindersEnabled });
  }
  if (sid === SYNC_FAILS_ID) {
    const reasons = Array.isArray(state.failReasons) ? state.failReasons : [];
    const tags = {};
    for (const reason of reasons) {
      tags[String(reason).trim()] = (typeof readingTagForReason === 'function') ? readingTagForReason(reason) : _syncFailTagDefault(reason);
    }
    return _syncGeneralNormalise(sid, { reasons, tags });
  }
  if (sid === SYNC_DESC_ID) return _syncGeneralNormalise(sid, { list: state.descriptions });
  if (sid === SYNC_CSV_ID) return _syncGeneralNormalise(sid, { columns: state.csvColumns });
  if (sid === SYNC_MULTIPICK_ID) return _syncGeneralNormalise(sid, state.multiPick);
  if (sid === SYNC_SQP_ID) return _syncGeneralNormalise(sid, { history: state.sqpHistory, resetAt: _syncSqpResetAt() });
  return null;
}

// The out-of-the-box value of each row (5A).
function _syncGeneralDefault(id) {
  const sid = String(id);
  if (sid === SYNC_WORK_ID) return _syncGeneralNormalise(sid, {});
  if (sid === SYNC_FAILS_ID) {
    const reasons = (typeof DEFAULT_FAIL_REASONS !== 'undefined') ? DEFAULT_FAIL_REASONS : [];
    return _syncGeneralNormalise(sid, { reasons, tags: {} });
  }
  if (sid === SYNC_DESC_ID) return _syncGeneralNormalise(sid, { list: (typeof DEFAULT_DESCRIPTIONS !== 'undefined') ? DEFAULT_DESCRIPTIONS : [] });
  if (sid === SYNC_CSV_ID) return _syncGeneralNormalise(sid, { columns: (typeof DEFAULT_CSV_COLUMNS !== 'undefined') ? DEFAULT_CSV_COLUMNS : [] });
  if (sid === SYNC_MULTIPICK_ID) return _syncGeneralNormalise(sid, {});
  if (sid === SYNC_SQP_ID) return _syncGeneralNormalise(sid, {});
  return null;
}

function _syncGeneralHash(id, rec) {
  return syncHash(_syncCanonical(_syncGeneralNormalise(id, rec)));
}

// 5A. Descriptions: an empty list counts too (a phone that never had any).
function _syncGeneralNothingMade(id, rec) {
  const sid = String(id);
  const h = _syncGeneralHash(sid, rec);
  if (h === _syncGeneralHash(sid, _syncGeneralDefault(sid))) return true;
  if (sid === SYNC_DESC_ID) return _syncGeneralNormalise(sid, rec).list.length === 0;
  return false;
}

// 8A for the six rows: what the app cannot load without trouble is held (or,
// for the two merged rows, overwritten by this phone's own copy).
function _syncGeneralValid(id, doc) {
  const sid = String(id);
  const bool = (v) => v === undefined || typeof v === 'boolean';
  const arr = (v) => Array.isArray(v);
  const obj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  if (sid === SYNC_WORK_ID) {
    return (doc.engineer === undefined || typeof doc.engineer === 'string')
      && ['timestamps', 'readings', 'sqp', 'retest'].every(k => bool(doc[k]));
  }
  // There must always be at least one fail reason (saveFailsSettings refuses none).
  if (sid === SYNC_FAILS_ID) return arr(doc.reasons) && doc.reasons.some(x => typeof x === 'string' && x.trim()) && (doc.tags === undefined || obj(doc.tags));
  if (sid === SYNC_DESC_ID) return arr(doc.list) && doc.list.every(x => typeof x === 'string');
  if (sid === SYNC_CSV_ID) return arr(doc.columns) && doc.columns.length > 0 && doc.columns.every(c => obj(c) && typeof c.id === 'string');
  if (sid === SYNC_MULTIPICK_ID) return (doc.slots === undefined || arr(doc.slots)) && bool(doc.enabled);
  if (sid === SYNC_SQP_ID) return (doc.history === undefined || obj(doc.history)) && (doc.resetAt === undefined || typeof doc.resetAt === 'string');
  return false;
}

// Take the cloud's copy of a row. Replaced, never edited in place.
function _syncApplyGeneral(id, doc) {
  const sid = String(id);
  const d = _syncGeneralNormalise(sid, doc);
  if (!d) return false;
  if (sid === SYNC_WORK_ID) {
    const sqpBefore = !!state.sqpEnabled;
    state.engineer = d.engineer;
    state.timestampsEnabled = d.timestamps;
    state.readingsEnabled = d.readings;
    state.retestRemindersEnabled = d.retest;
    state.sqpEnabled = d.sqp;
    // setSqp()'s side effects, without its save()/render(): switching on with no
    // history seeds it from the jobs; the frozen row is rebuilt for the new mode.
    if (d.sqp !== sqpBefore && typeof invalidateSqpRow === 'function') {
      if (d.sqp && (!state.sqpHistory || !Object.keys(state.sqpHistory).length) && typeof buildSqpHistory === 'function') {
        state.sqpHistory = buildSqpHistory();
      }
      if (typeof bumpSqpHistoryVersion === 'function') bumpSqpHistoryVersion();
      invalidateSqpRow();
    }
    return true;
  }
  if (sid === SYNC_FAILS_ID) {
    state.failReasons = d.reasons.slice();
    state.failReasonTags = Object.assign({}, state.failReasonTags || {}, d.tags);
    return true;
  }
  if (sid === SYNC_DESC_ID) { state.descriptions = d.list.slice(); return true; }
  if (sid === SYNC_CSV_ID) {
    state.csvColumns = d.columns.map(c => Object.assign({}, c));
    if (typeof ensureAllCsvColumns === 'function') ensureAllCsvColumns();   // a column this version has and the sender didn't
    return true;
  }
  if (sid === SYNC_MULTIPICK_ID) { state.multiPick = { enabled: d.enabled, slots: d.slots.map(s => ({ name: s.name, items: s.items.slice() })) }; return true; }
  if (sid === SYNC_SQP_ID) {
    state.sqpHistory = d.history;
    try { if (d.resetAt) localStorage.setItem(SQP_RESET_KEY, d.resetAt); } catch { /* ignore */ }
    // ⚠ The version bump only: the frozen Quick Pick row is NOT invalidated, so
    // a sync never reshuffles the buttons under the engineer's thumb mid-job. The
    // new history is used from the next location change.
    if (typeof bumpSqpHistoryVersion === 'function') bumpSqpHistoryVersion();
    return true;
  }
  return false;
}

// 3B: the three-way merge. `base` is the lower-cased list both phones last
// agreed on, or null (never agreed: a union). Order: this phone's first, then
// anything new from the cloud in the cloud's order. This phone's spelling wins
// where both have the same description in different case.
function _syncMergeDescriptions(base, local, cloud) {
  const B = new Set(Array.isArray(base) ? base : []);
  const key = (s) => String(s).toLowerCase();
  const L = new Set(local.map(key)), C = new Set(cloud.map(key));
  const out = [], seen = new Set();
  for (const s of local) {
    const k = key(s);
    if (seen.has(k) || (B.has(k) && !C.has(k))) continue;   // removed on the other phone
    seen.add(k); out.push(s);
  }
  for (const s of cloud) {
    const k = key(s);
    if (seen.has(k) || (B.has(k) && !L.has(k))) continue;   // removed on this phone
    seen.add(k); out.push(s);
  }
  return out;
}

// 2B: the higher count per location and item type.
function _syncMergeSqp(a, b) {
  const out = {};
  for (const src of [a || {}, b || {}]) {
    for (const loc of Object.keys(src)) {
      const bucket = out[loc] || (out[loc] = {});
      const t = src[loc] || {};
      for (const type of Object.keys(t)) {
        const n = t[type];
        if (typeof n === 'number' && n > (bucket[type] || 0)) bucket[type] = n;
      }
    }
  }
  return out;
}

// The card's "what differs", in plain words. Lists are shown as short joined text.
function _syncGeneralDiffs(id, local, doc) {
  const sid = String(id);
  const L = _syncGeneralNormalise(sid, local), C = _syncGeneralNormalise(sid, doc);
  const clip = (v) => { const x = String(v == null ? '' : v); return x.length > 80 ? x.slice(0, 79) + '\u2026' : x; };
  const onOff = (v) => v ? 'On' : 'Off';
  const out = [];
  const add = (label, a, b) => { if (a !== b) out.push({ label, here: clip(a), cloud: clip(b) }); };
  if (sid === SYNC_WORK_ID) {
    add('Engineer name', L.engineer, C.engineer);
    add('Item times', onOff(L.timestamps), onOff(C.timestamps));
    add('Test readings', onOff(L.readings), onOff(C.readings));
    add('Smart Quick Pick', onOff(L.sqp), onOff(C.sqp));
    add('Retest reminders', onOff(L.retest), onOff(C.retest));
  } else if (sid === SYNC_FAILS_ID) {
    add('Fail reasons', L.reasons.join(', '), C.reasons.join(', '));
    const tagText = (x) => x.reasons.map(r => r + ': ' + x.tags[r]).join(', ');
    if (L.reasons.join('\n') === C.reasons.join('\n')) add('Reading tags', tagText(L), tagText(C));
  } else if (sid === SYNC_CSV_ID) {
    const vis = (x) => x.columns.filter(c => c.visible).map(c => c.header || c.id).join(', ');
    add('Columns shown', vis(L), vis(C));
    if (!out.length) out.push({ label: 'Column order or names', here: 'Different', cloud: 'Different' });
  } else if (sid === SYNC_MULTIPICK_ID) {
    add('Multi Pick', onOff(L.enabled), onOff(C.enabled));
    const slots = (x) => x.slots.map(s => s.name + ' (' + s.items.join(', ') + ')').join('; ');
    add('Multi Picks', slots(L), slots(C));
  }
  return out;
}

const _SYNC_GENERAL_NAMES = {
  settings_work: 'Engineer name & recording switches', settings_fails: 'Fail reasons',
  settings_descriptions: 'Descriptions', settings_csv: 'CSV columns',
  settings_multipick: 'Multi Pick', settings_sqp: 'Smart Quick Pick history',
};
function syncGeneralName(id) { return _SYNC_GENERAL_NAMES[String(id)] || 'Setting'; }

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
  if (kind === 'settings') {
    const out = (typeof findInstrument === 'function') ? [_syncInUseRecord()] : [];
    // v84: the report settings row and the certificate counter.
    if (state.reportSettings && typeof state.reportSettings === 'object') out.push(_syncReportRecord(), _syncCertRecord());
    // v86: the six general-settings rows.
    for (const gid of SYNC_GENERAL_IDS) { const g = _syncGeneralRecord(gid); if (g) out.push(g); }
    return out;
  }
  if (kind === 'template') return Array.isArray(state.reportTemplates) ? state.reportTemplates : [];
  return [];
}

function _syncRecordSetList(kind, list) {
  if (kind === 'client') state.clients = list;
  else if (kind === 'site') state.sites = list;
  else if (kind === 'instrument') state.instruments = list;
  else if (kind === 'preset') state.itemPresets = list;
  else if (kind === 'template') state.reportTemplates = list;
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
  if (kind === 'settings') {
    const sid = String(r.id);
    if (sid === SYNC_REPORT_ID) return { id: sid, settings: _syncReportProjection(r.settings) };
    if (sid === SYNC_CERT_ID) return _syncCertDoc(r);
    if (_syncIsGeneral(sid)) return _syncGeneralNormalise(sid, r);   // v86
    return { id: sid, instrumentId: String(r.instrumentId || '') };
  }
  if (kind === 'template') return { id: String(r.id), name: t(r.name), settings: _syncReportProjection(r.settings) };
  return null;
}

function _syncRecordHash(kind, rec) {
  return syncHash(_syncCanonical(_syncRecordDoc(kind, rec)));
}

// The local shape, as loadClients()/loadSites() would build it. The two
// passthrough fields are carried over from the record being replaced.
function _syncRecordFromDoc(kind, doc, old) {
  const d = _syncRecordDoc(kind, doc);
  // v84: a template is stored as loadReportTemplates() makes it (normalised,
  // so the counter fields come back as defaults — never applied, 3A).
  if (kind === 'template') return { id: d.id, name: d.name, settings: normaliseReportSettings(d.settings) };
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
  const obj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  if (kind === 'settings') {
    const sid = String(id);
    if (SYNC_SETTINGS_IDS.indexOf(sid) === -1) return false;
    if (sid === SYNC_REPORT_ID) return obj(doc.settings);
    if (sid === SYNC_CERT_ID) return Number.isInteger(doc.next) && doc.next >= 1 && str(doc.setAt);
    if (_syncIsGeneral(sid)) return _syncGeneralValid(sid, doc);   // v86
    return typeof doc.instrumentId === 'string';
  }
  // v84: a template is a name and a settings object; the normaliser makes any
  // settings object safe, exactly as loadReportTemplates() does on reload.
  if (kind === 'template') {
    if (typeof doc.name !== 'string' || !doc.name.trim()) return false;
    return obj(doc.settings);
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
  // v84: the report settings row. No names — the card lists what differs.
  // v86: general settings — named by group, the card lists what differs.
  if (kind === 'settings' && _syncIsGeneral(id)) {
    const e = { id, kind, reason, name: syncGeneralName(id), localName: null, cloudName: null };
    if (reason === 'both-changed' && local && doc) e.diffs = _syncGeneralDiffs(id, local, doc);
    return e;
  }
  if (kind === 'settings' && String(id) === SYNC_REPORT_ID) {
    const e = { id, kind, reason, name: 'Report settings', localName: null, cloudName: null };
    if (reason === 'both-changed' && local && doc) e.diffs = _syncRecordDiffs(kind, local, doc);
    return e;
  }
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
  if ((kind === 'preset' || kind === 'template') && reason === 'both-changed' && local && doc) e.diffs = _syncRecordDiffs(kind, local, doc);
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
  // v84: report settings and templates. Images are described, never copied —
  // a held entry must not become a store of the cloud document (rule 7).
  if (kind === 'template' || kind === 'settings') {
    const out = [];
    if (kind === 'template' && L.name !== C.name) out.push({ label: 'Name', here: clip(L.name), cloud: clip(C.name) });
    return out.concat(_syncReportDiffs(L.settings || {}, C.settings || {}, clip));
  }
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

// v84: the report fields that differ, most telling first, in plain words.
function _syncReportDiffs(a, b, clip) {
  const labels = [
    ['enabled', 'Reports switched on'], ['companyName', 'Company name'], ['companyAddress', 'Company address'],
    ['logo', 'Logo'], ['signature', 'Signature'], ['reportTitle', 'Report title'],
    ['certEnabled', 'Certificate numbers'], ['certPrefix', 'Certificate prefix'], ['certPadding', 'Certificate number digits'],
    ['declaration', 'Declaration'], ['declarationText', 'Declaration wording'], ['signaturePosition', 'Signature position'],
    ['headerColor', 'Header colour'], ['accentColor', 'Accent colour'],
    ['retestEnabled', 'Retest date'], ['retestMonths', 'Retest period (months)'],
    ['showEngineer', 'Show engineer'], ['showInstrument', 'Show instrument'], ['showCalibration', 'Show calibration'],
    ['showFails', 'Show fails'], ['showReadings', 'Show readings'], ['showDuration', 'Show testing time'],
    ['showPhotos', 'Show photos'], ['showAppCredit', 'App credit'], ['showFooterLogo', 'Footer logo'],
    ['reportFilenamePattern', 'File name'],
  ];
  const known = new Set(labels.map(x => x[0]));
  const same = (x, y) => syncHash(_syncCanonical(x === undefined ? null : x)) === syncHash(_syncCanonical(y === undefined ? null : y));
  const show = (k, v, other) => {
    if (k === 'logo' || k === 'signature') return v ? (other ? 'An image' : 'Image') : '';
    if (typeof v === 'boolean') return v ? 'On' : 'Off';
    return clip(v);
  };
  const out = [];
  for (const [k, label] of labels) {
    if (same(a[k], b[k])) continue;
    const here = show(k, a[k], false);
    let cloud = show(k, b[k], false);
    if ((k === 'logo' || k === 'signature') && a[k] && b[k]) cloud = 'A different image';
    out.push({ label, here, cloud });
  }
  // A field a newer version added: said to differ, not shown.
  const extra = Object.keys(Object.assign({}, a, b)).some(k => !known.has(k) && !same(a[k], b[k]));
  if (extra) out.push({ label: 'Other settings', here: 'Different', cloud: 'Different' });
  return out;
}

// v84: take the cloud's report settings, keeping this phone's counter — that
// row travels separately and is settled on its own rules (2A).
function _syncApplyReport(doc) {
  if (typeof normaliseReportSettings !== 'function') return false;
  const keep = normaliseReportSettings(state.reportSettings);
  const next = normaliseReportSettings(doc && doc.settings);
  next.certNextNumber = keep.certNextNumber;
  next.certSetAt = keep.certSetAt;
  state.reportSettings = next;
  return true;
}

// v84: take the cloud's counter. Replaced, not edited in place.
function _syncApplyCert(doc) {
  const d = _syncCertDoc(doc);
  state.reportSettings = Object.assign({}, state.reportSettings, { certNextNumber: d.next, certSetAt: d.setAt });
  return true;
}

// v84: everything a records change can touch. saveSettings() holds the lists,
// the ledger and the in-use pointers; report settings and templates have
// their own keys.
// ⚠ Never through saveReportSettings()/saveReportTemplates(): those arm the
// sync trigger (V84), and a pull must not re-arm itself — the push half of this
// same run sends anything that needs sending. saveSettings() writes report
// settings with the plain writer (_writeReportSettings); templates are written
// here directly.
function _syncSaveLists() {
  if (typeof saveSettings === 'function') saveSettings();
  if (typeof REPORT_TEMPLATES_KEY !== 'undefined') {
    localStorage.setItem(REPORT_TEMPLATES_KEY, JSON.stringify(state.reportTemplates || []));
  }
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
  if (kind === 'settings') {
    const sid = String((doc && doc.id != null) ? doc.id : (old && old.id));
    if (sid === SYNC_REPORT_ID) return _syncApplyReport(doc);
    if (sid === SYNC_CERT_ID) return _syncApplyCert(doc);
    if (_syncIsGeneral(sid)) return _syncApplyGeneral(sid, doc);   // v86
    return _syncApplyInUse(doc && doc.instrumentId);
  }
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
  // v84: Report settings open — its toggles are already in state, unsaved.
  const reportOpen = state.view === 'settingsReport';

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

    const grp = _syncRecordGroup(kind, id);
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
      // v84 5A: an untouched starter template this phone never sent goes quietly.
      if (rs.sent[id] === _syncRecordHash(kind, local)
          || (kind === 'template' && !rs.sent[id] && _syncIsStarterTemplate(local))) {
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
        if (!rs.gone[id]) {
          // Our delete goes up in this run. v84: a starter template shares its
          // id across installs, so the cloud can hold one this phone deleted
          // without ever sending — marked, or the push would think the server
          // never had it and the delete would never travel.
          if (kind === 'template' && !rs.sent[id] && !rs.resend[id]) rs.sent[id] = hash;
          return;
        }
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
    // v83.1: the cloud is what this phone last sent — only this phone moved,
    // and the push sends it. See the same line for jobs.
    if (hash === rs.sent[id]) { _syncHeldClear(id, kind); return; }
    // v84 5A, for the shared-id starter templates: a cloud copy nobody changed
    // gives way to this phone's (ours goes up); an untouched copy here takes
    // the cloud's without asking.
    const fresh = kind === 'template' && !rs.sent[id];
    if (fresh && _syncIsStarterTemplate(row.doc)) { _syncHeldClear(id, kind); return; }
    const takeIt = fresh && _syncIsStarterTemplate(local);
    if (!takeIt && rs.sent[id] !== localHash) { hold('both-changed', row.doc); return; }

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

  // v84 4A/5A: the report settings row. The records rules, plus 5A: a phone
  // holding only the defaults takes the account's without asking, and a cloud
  // copy that is only the defaults gives way. Applying (never judging) waits
  // while Report settings is open.
  function decideReport(row) {
    const id = SYNC_REPORT_ID, kind = 'settings';
    if (typeof normaliseReportSettings !== 'function' || !state.reportSettings) return;
    if (rs.resend[id]) return;
    if (row.deleted === true) return;        // no version ever deletes it
    const local = _syncReportRecord();
    const hold = (reason, doc) => {
      _syncHeldNote(_syncRecordHeldEntry(kind, id, reason, local, doc));
      blocked = true; out.held++; out.rp.held++;
    };
    if (!_syncValidRecord(kind, row.doc, id)) { hold('unreadable', null); return; }
    const hash = _syncRecordHash(kind, row.doc);
    const localHash = _syncRecordHash(kind, local);
    if (hash === localHash) { rs.sent[id] = hash; _syncHeldClear(id, kind); return; }
    if (hash === rs.sent[id]) { _syncHeldClear(id, kind); return; }
    const fresh = !rs.sent[id];
    if (fresh && _syncIsDefaultReport(row.doc.settings)) { _syncHeldClear(id, kind); return; }
    const takeIt = fresh && _syncIsDefaultReport(local.settings);
    if (!takeIt && rs.sent[id] !== localHash) { hold('both-changed', row.doc); return; }
    if (reportOpen) { blocked = true; out.skip[id] = true; return; }
    _syncApplyReport(row.doc);
    rs.sent[id] = hash;
    out.applied++; out.rp.in++; changed = true;
    _syncHeldClear(id, kind);
  }

  // v84 2A: the certificate counter. Never held, never asked, never counted as
  // a change on the Sync page. A later hand-typed set wins; otherwise the higher
  // number. Losing means ours goes up in this run's push.
  function decideCert(row) {
    const id = SYNC_CERT_ID, kind = 'settings';
    if (!state.reportSettings || row.deleted === true) return;
    if (!_syncValidRecord(kind, row.doc, id)) { delete rs.sent[id]; return; }
    const cloud = _syncCertDoc(row.doc);
    const mine = _syncCertDoc(_syncCertRecord());
    const hash = _syncRecordHash(kind, cloud);
    if (hash === _syncRecordHash(kind, mine)) { rs.sent[id] = hash; return; }
    const cloudWins = (cloud.setAt !== mine.setAt) ? cloud.setAt > mine.setAt : cloud.next > mine.next;
    if (!cloudWins) { delete rs.sent[id]; return; }
    if (reportOpen) { blocked = true; out.skip[id] = true; return; }
    _syncApplyCert(cloud);
    rs.sent[id] = hash;
    changed = true;
  }

  // v86: engineer name & switches, fail reasons, CSV columns, Multi Pick. The
  // records rules plus 5A (decideReport's shape); applying waits while a screen
  // that owns the row is open (SYNC_GENERAL_VIEWS), and so does judging a clash
  // alone. A clash is still judged and held while the screen is open.
  function decideGeneral(row, id) {
    const kind = 'settings';
    if (rs.resend[id]) return;
    if (row.deleted === true) return;        // no version ever deletes it
    const local = _syncGeneralRecord(id);
    const hold = (reason, doc) => {
      _syncHeldNote(_syncRecordHeldEntry(kind, id, reason, local, doc));
      blocked = true; out.held++; out.gs.held++;
    };
    if (!_syncValidRecord(kind, row.doc, id)) { hold('unreadable', null); return; }
    const hash = _syncGeneralHash(id, row.doc);
    const localHash = _syncGeneralHash(id, local);
    if (hash === localHash) { rs.sent[id] = hash; _syncHeldClear(id, kind); return; }
    if (hash === rs.sent[id]) { _syncHeldClear(id, kind); return; }
    const fresh = !rs.sent[id];
    if (fresh && _syncGeneralNothingMade(id, row.doc)) { _syncHeldClear(id, kind); return; }
    const takeIt = fresh && _syncGeneralNothingMade(id, local);
    if (!takeIt && rs.sent[id] !== localHash) { hold('both-changed', row.doc); return; }
    if (_syncGeneralOpen(id)) { blocked = true; out.skip[id] = true; return; }
    _syncApplyGeneral(id, row.doc);
    rs.sent[id] = hash;
    out.applied++; out.gs.in++; changed = true;
    _syncHeldClear(id, kind);
  }

  // v86 3B: descriptions. Never held — merged against what both last agreed on.
  function decideDesc(row) {
    const id = SYNC_DESC_ID;
    if (rs.resend[id] || row.deleted === true) return;
    if (!_syncValidRecord('settings', row.doc, id)) { delete rs.sent[id]; return; }   // ours replaces it
    const cloud = _syncGeneralNormalise(id, row.doc);
    const local = _syncGeneralRecord(id);
    const hash = _syncGeneralHash(id, cloud);
    const keys = (d) => d.list.map(x => x.toLowerCase());
    if (hash === _syncGeneralHash(id, local)) { rs.sent[id] = hash; rs.descBase = keys(local); return; }
    if (hash === rs.sent[id]) return;                          // only this phone moved: ours goes up
    if (_syncGeneralOpen(id)) { blocked = true; out.skip[id] = true; return; }
    const fresh = !rs.sent[id];
    if (fresh && _syncGeneralNothingMade(id, cloud)) return;   // 5A: the cloud's is only defaults
    // Only the other phone moved (this phone's copy is what it last sent), or
    // this phone holds nothing it made (5A): take the cloud's as it stands.
    // ⚠ Merging here instead would put this phone's ORDER back over the other
    // phone's, which would then do the same — two phones re-sending the same
    // list in turn for ever. A merge happens only when both really moved.
    let next;
    if (rs.sent[id] === _syncGeneralHash(id, local) || (fresh && _syncGeneralNothingMade(id, local))) next = cloud.list;
    else next = _syncMergeDescriptions(rs.descBase, local.list, cloud.list);
    const merged = _syncGeneralNormalise(id, { list: next });
    if (_syncGeneralHash(id, merged) !== _syncGeneralHash(id, local)) {
      _syncApplyGeneral(id, merged);
      out.gs.in++; changed = true;
    }
    if (_syncGeneralHash(id, merged) === hash) { rs.sent[id] = hash; rs.descBase = keys(merged); }
    else delete rs.sent[id];                                   // the merge goes up this run
  }

  // v86 2B: Smart Quick Pick's learned history. Never held, never counted.
  function decideSqp(row) {
    const id = SYNC_SQP_ID;
    if (rs.resend[id] || row.deleted === true) return;
    if (!_syncValidRecord('settings', row.doc, id)) { delete rs.sent[id]; return; }
    const cloud = _syncGeneralNormalise(id, row.doc);
    const local = _syncGeneralRecord(id);
    const hash = _syncGeneralHash(id, cloud);
    if (hash === _syncGeneralHash(id, local)) { rs.sent[id] = hash; return; }
    if (hash === rs.sent[id]) return;
    if (!rs.sent[id] && _syncGeneralNothingMade(id, cloud)) return;
    // A deliberate clear or rebuild beats counts, whichever side made it later.
    if (cloud.resetAt !== local.resetAt) {
      if (cloud.resetAt > local.resetAt) { _syncApplyGeneral(id, cloud); rs.sent[id] = hash; changed = true; }
      else delete rs.sent[id];
      return;
    }
    // Only the other phone moved: take its copy as it stands (see decideDesc).
    if (rs.sent[id] === _syncGeneralHash(id, local)) { _syncApplyGeneral(id, cloud); rs.sent[id] = hash; changed = true; return; }
    const merged = _syncGeneralNormalise(id, { history: _syncMergeSqp(local.history, cloud.history), resetAt: local.resetAt });
    if (_syncGeneralHash(id, merged) !== _syncGeneralHash(id, local)) { _syncApplyGeneral(id, merged); changed = true; }
    if (_syncGeneralHash(id, merged) === hash) rs.sent[id] = hash;
    else delete rs.sent[id];
  }

  // One request for every kind, one cursor, paged exactly as jobs are —
  // including the v83.1 re-read of the boundary timestamp. See the jobs pager.
  const seen = new Set();
  function page(from) {
    return c.from('records')
      .select('id,kind,doc,deleted,last_modified,updated_at')
      .in('kind', SYNC_RECORD_KINDS)
      .gte('updated_at', from)
      .order('updated_at', { ascending: true })
      .limit(SYNC_PULL_PAGE)
      .then((r) => {
        if (r && r.error) throw r.error;
        const rows = (r && r.data) || [];
        for (const row of rows) {
          const u = row && row.updated_at;
          const key = String(row && row.id) + '|' + String(u);
          if (!seen.has(key)) { seen.add(key); decide(row); }
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
    for (const row of late) {
      const sid = String(row.id);
      if (sid === SYNC_REPORT_ID) decideReport(row);
      else if (sid === SYNC_CERT_ID) decideCert(row);
      else if (sid === SYNC_DESC_ID) decideDesc(row);     // v86
      else if (sid === SYNC_SQP_ID) decideSqp(row);       // v86
      else if (_syncIsGeneral(sid)) decideGeneral(row, sid);
      else decideInUse(row);
    }
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
      // v84: report settings and templates are their own keys.
      _syncSaveLists();
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
  const reportOpen = state.view === 'settingsReport';   // v84: unsaved toggles
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
      if (reportOpen && (id === SYNC_REPORT_ID || id === SYNC_CERT_ID)) continue;
      // v86: a general-settings row whose screen is open waits until it closes.
      if (kind === 'settings' && _syncGeneralOpen(id)) continue;
      const doc = _syncRecordDoc(kind, r);
      // v83: no tester chosen is not a choice to send over the other phone's.
      if (kind === 'settings' && id === SYNC_INUSE_ID && !doc.instrumentId) { delete rs.resend[id]; continue; }
      // v84 5A: nothing anyone made, and never sent — nothing to send.
      if (!rs.sent[id] && !rs.resend[id] && _syncNothingMade(kind, id, r)) continue;
      // Never send what the other phone would have to hold as unreadable.
      if (!_syncValidRecord(kind, doc, id)) continue;
      // ⚠ Wire and fingerprint are separate jobs (M184): send the JSON, hash the
      // canonical form. Captured together, at build time, for the reason the
      // header gives for jobs.
      const json = JSON.stringify(doc);
      const hash = syncHash(_syncCanonical(doc));
      if (!rs.resend[id] && rs.sent[id] === hash) continue;
      // v84: the counter moves with every report — sent, but not reported as a change.
      // v86: so is Smart Quick Pick's history, with every item logged.
      work.push({ id, hash, gone: false, bytes: json.length,
        grp: (id === SYNC_CERT_ID || id === SYNC_SQP_ID) ? null : _syncRecordGroup(kind, id),
        inUse: (kind === 'settings' && id === SYNC_INUSE_ID) ? doc.instrumentId : undefined,
        descBase: (kind === 'settings' && id === SYNC_DESC_ID) ? doc.list.map(x => x.toLowerCase()) : undefined,
        row: { id, user_id: uid, kind, doc: JSON.parse(json), deleted: false, last_modified: now } });
    }
    for (const t of (state.tombstones || [])) {
      if (!t || t.kind !== kind) continue;
      const id = String(t.id);
      if (held.has(id) || live.has(id)) continue;
      if (!rs.sent[id] && !rs.gone[id] && !rs.resend[id]) continue;   // server never had it
      if (rs.gone[id] && !rs.resend[id]) continue;                     // already sent
      const at = (typeof t.at === 'string' && !isNaN(Date.parse(t.at))) ? t.at : now;
      work.push({ id, hash: null, gone: true, bytes: 64, grp: _syncRecordGroup(kind, id),
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
          if (w.descBase !== undefined) rs.descBase = w.descBase;   // v86: likewise
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
    cs: { in: 0, out: 0, held: 0 }, ip: { in: 0, out: 0, held: 0 }, rp: { in: 0, out: 0, held: 0 },
    gs: { in: 0, out: 0, held: 0 },   // v86: general settings
    skip: {}, inUseNow: null };
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
          else { state.sessions.unshift(row.doc); st.ph.need.push(sid); }   // v89: its photo rows
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
  const what = { site: 'site', instrument: 'instrument', preset: 'preset', settings: 'setting', template: 'template' }[kind] || 'client';

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
          if (kind === 'settings' && sid === SYNC_INUSE_ID) rs.inUse = String(row.doc.instrumentId);
          delete rs.gone[sid];
        } else {
          done('That cloud copy still can\u2019t be read, so nothing has been changed. Choose this phone\u2019s copy to replace it.');
          return false;
        }
        // v83: "in use" pointed at what now exists; an instrument delete's
        // frozen copies wait in `rs` for the run below to read the jobs first.
        _syncSettleLists(presetBefore);
        _syncSaveLists();
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
  const when = (v) => { const d = new Date(v); return isNaN(d.getTime()) ? clip(v) : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
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

// ---- photos (V88) ------------------------------------------------------------------
// One way, phone → cloud. The image goes to Storage at {user_id}/{photo_id}.jpg
// (decision 8A — the path the storage policy checks), then its row goes to the
// `photos` table. ORDER IS DECISION 2A: file first, row second, so a row in the
// cloud always means the file is there too. V89's other phone may trust a row.
//
// Only photos of a job the cloud already has (st.sent), whose item is still in
// that job. The example job's photos never go (it never goes). A photo whose
// item was deleted is left alone — it will be swept with the item.
//
// DELETES (decision 4A). Two sources, one path:
//   • ledger entries of kind 'photo' (photos.js _photoNoteGone): the engineer
//     deleted a photo, an item, or changed a fail to a pass;
//   • jobs the cloud knows are deleted (st.gone): this phone takes the photos IT
//     uploaded for them. A phone only ever deletes what it put there — it holds
//     no list of anyone else's uploads, and V88 never reads the photos table.
// Either way the row is marked deleted (the marker V89's pull will read) and
// the file is removed. Only photos this phone uploaded are touched, and only
// after both succeed is the photo forgotten, so a half-done delete is retried.
// Clearing old jobs and \"Delete all photos\" never come here (V80 C, 5A).
//
// ⚠ Nothing here renders or writes app data. It reads state.photoMeta (the
// in-memory mirror photos.js keeps) and state.tombstones, and writes only
// st.ph — saved after every photo, so a run cut short loses nothing it did.
//
// V89 (photos DOWN, on request only — 10A, R17). What changed:
//   • Rows come down, images don't. The photos table is read by its own cursor
//     (st.ph.pulledAt; rules 10 and 14 — the jobs pager's shape). A live row for
//     a job on this phone is remembered in st.ph.sent, which now means KNOWN to
//     be in the cloud, whoever uploaded it. Rows for jobs not on this phone are
//     not kept (R17); when such a job arrives later, st.ph.need fetches its rows.
//   • A deleted row takes this phone's copy (photos.js photosRemoveQuiet — no
//     ledger entry: the delete is already in the cloud).
//   • ⚠ Rule 21 becomes "a phone deletes only what it KNOWS is in the cloud"
//     (decision 5A: any phone that can see a cloud photo can delete it).
//   • Previews (1A): {user_id}/{photo_id}_t.jpg, made on the phone. For a new
//     photo: file, then preview, then the row with thumb = true — a row that
//     says thumb means both files are there (2A extended). Photos already up
//     get one later (backfill, a few per run) while their image is on a phone.
//     A photo that never gets a preview is still a photo: nothing waits on it.
//   • Images come down only through syncPhotoDownload() (a tap), previews only
//     through syncPhotoThumb() (the strip being opened).

function _syncPhotoPath(uid, id) {
  return uid + '/' + id + '.jpg';
}

// v89 (1A): the preview sits beside the photo, in the same folder, so the same
// storage policy (and the same isolation check) covers it.
function _syncThumbPath(uid, id) {
  return uid + '/' + id + '_t.jpg';
}

// photoId → sessionId for every photo on this phone that is eligible to be in
// the cloud: its job syncs (not the example) and its item is still in that job.
// A photo written before sessionId was recorded is matched by its item. null
// until the mirror is known to be complete (photoMetaReady).
function _syncPhotoJobs() {
  if (!state.photoMetaReady) return null;
  const meta = state.photoMeta || {};
  const itemJob = new Map();
  for (const s of _syncSessions()) {
    for (const it of (s.items || [])) if (it && it.id != null) itemJob.set(String(it.id), String(s.id));
  }
  const out = new Map();
  for (const id of Object.keys(meta)) {
    const m = meta[id];
    const job = itemJob.get(m.i);
    if (!job) continue;                         // item gone, or not a syncing job
    if (m.s && m.s !== job) continue;           // recorded against a different job
    out.set(id, job);
  }
  return out;
}

// sessionId → how many of its photos are not in the cloud yet. null when the
// mirror isn't loaded (the prune guard then clears nothing).
function _syncPhotosPendingByJob(st) {
  const jobs = _syncPhotoJobs();
  if (!jobs) return null;
  const out = new Map();
  for (const [id, job] of jobs) if (!st.ph.sent[id]) out.set(job, (out.get(job) || 0) + 1);
  return out;
}

// For photos.js _photoNoteGone: an item was deleted (or a fail became a pass).
// Photos of it this phone uploaded but no longer holds (cleared, 5A) get a
// ledger entry too, so their cloud copies go with the item.
function syncNotePhotosGone(itemIds) {
  const want = new Set((itemIds || []).map(String).filter(Boolean));
  if (!want.size) return;
  const uid = _syncCurrentUserId();
  if (!uid) return;
  const st = _syncLoad();
  if (st.userId !== uid) return;
  for (const id of Object.keys(st.ph.sent)) {
    if (want.has(st.ph.sent[id].i)) recordTombstone('photo', id);
  }
}

// For the \"Delete all photos\" sheet (5A): the photos safe in the cloud for the
// account signed in now. One read of the sync state, however many photos.
function syncPhotosUploadedIds() {
  const uid = _syncCurrentUserId();
  if (!uid) return new Set();
  const st = _syncLoad();
  return st.userId === uid ? new Set(Object.keys(st.ph.sent)) : new Set();
}

// v89: read the photos table — ROWS only (R17). Remembers live rows for jobs on
// this phone; a deleted row forgets the photo and removes this phone's copy.
// Mutates st.ph and counts into `out`; the caller saves.
const _SYNC_PHOTO_COLS = 'id,session_id,item_id,bytes,thumb,taken_at,deleted,updated_at';

function _syncPhotoRowsPull(c, uid, st, out) {
  const ph = st.ph;
  const local = new Set(_syncSessions().map(s => String(s.id)));
  const meta = state.photoMeta || {};
  const drop = [];
  let known = false;       // what this phone knows changed → the badges repaint
  let blocked = false;

  function decide(row) {
    const id = String(row && row.id != null ? row.id : '');
    if (!id) return;
    if (row.deleted === true) {
      if (ph.sent[id]) { delete ph.sent[id]; known = true; }
      if (meta[id] && drop.indexOf(id) === -1) drop.push(id);
      return;
    }
    const job = String(row.session_id != null ? row.session_id : '');
    const item = String(row.item_id != null ? row.item_id : '');
    if (!job || !item) return;
    const had = ph.sent[id];
    // R17: a job not on this phone keeps its rows in the cloud. (A photo this
    // phone uploaded stays known even if its job was cleared here — V88 5A.)
    if (!had && !local.has(job)) return;
    const e = { s: job, i: item };
    const b = Number(row.bytes);
    if (b > 0 && isFinite(b)) e.b = Math.round(b);
    if (row.thumb === true || (had && had.t)) e.t = 1;
    if (typeof row.taken_at === 'string' && !isNaN(Date.parse(row.taken_at))) e.a = row.taken_at;
    else if (had && had.a) e.a = had.a;
    if (!had || had.s !== e.s || had.i !== e.i || had.b !== e.b || had.t !== e.t || had.a !== e.a) known = true;
    ph.sent[id] = e;
  }

  // 1. Jobs that arrived after the cursor passed their rows. Skipped on a phone
  //    that has never read the table: the full read below covers them.
  const need = ph.pulledAt ? Array.from(new Set(ph.need)).filter(id => local.has(id)) : [];
  const batch = (typeof SYNC_PHOTO_NEED_BATCH === 'number') ? SYNC_PHOTO_NEED_BATCH : 50;
  let chain = Promise.resolve();
  for (let i = 0; i < need.length; i += batch) {
    const chunk = need.slice(i, i + batch);
    chain = chain.then(() => c.from('photos').select(_SYNC_PHOTO_COLS).in('session_id', chunk).eq('deleted', false))
      .then((r) => {
        if (r && r.error) throw r.error;
        for (const row of ((r && r.data) || [])) decide(row);
      });
  }

  // 2. Everything changed since the cursor. The V83.1 pager: each page starts AT
  //    the last stamp, rows already seen this run are skipped (rules 10, 14).
  const since = ph.pulledAt || SYNC_PULL_EPOCH;
  let high = since;
  const seen = new Set();
  function page(from) {
    return c.from('photos')
      .select(_SYNC_PHOTO_COLS)
      .gte('updated_at', from)
      .order('updated_at', { ascending: true })
      .limit(SYNC_PULL_PAGE)
      .then((r) => {
        if (r && r.error) throw r.error;
        const rows = (r && r.data) || [];
        for (const row of rows) {
          const u = row && row.updated_at;
          const key = String(row && row.id) + '|' + String(u);
          if (!seen.has(key)) { seen.add(key); decide(row); }
          if (typeof u === 'string' && u > high) high = u;
        }
        if (rows.length < SYNC_PULL_PAGE) return;
        if (high === from) { blocked = true; return; }
        return page(high);
      });
  }

  return chain.then(() => page(since)).then(() => {
    ph.need = [];
    if (!drop.length) return;
    return photosRemoveQuiet(drop).then((n) => {
      if (n < 0) { blocked = true; return; }     // store refused: read these again next run
      out.removed += n;
      if (n) known = true;
      // The strip may be showing one of them. It is buttons only, so a repaint
      // is allowed (MAP rule 3); the tile simply goes.
      if (state.photoStripOpen && Array.isArray(state.photoStripPhotos)) {
        const gone = new Set(drop);
        state.photoStripPhotos = state.photoStripPhotos.filter((p) => !gone.has(p.id));
      }
    });
  }).then(() => {
    if (!blocked) ph.pulledAt = high;
    _syncSave(st);
    if (known) _syncRepaintApp();
  });
}

// v89 (1A). Upload one preview. Resolves true only if it is in the cloud.
function _syncThumbUpload(c, uid, id, blob) {
  if (typeof photoThumbBlob !== 'function' || !blob) return Promise.resolve(false);
  // A picture that never finishes decoding must not hold up the photo itself:
  // after 10 seconds there is simply no preview (the photo's row says so).
  let timer = null;
  const made = Promise.race([
    photoThumbBlob(blob),
    new Promise((res) => { timer = setTimeout(() => res(null), 10000); }),
  ]).then((v) => { if (timer) clearTimeout(timer); return v; });
  return made.then((tb) => {
    if (!tb) return false;
    return c.storage.from('photos').upload(_syncThumbPath(uid, id), tb, { contentType: 'image/jpeg', upsert: true })
      .then((r) => !(r && r.error), () => false);
  }).catch(() => false);
}

function _syncPhotosHalf(c, uid, st) {
  const out = { up: 0, gone: 0, more: 0, removed: 0, thumbs: 0 };
  return Promise.resolve().then(() => {
    // The mirror isn't loaded yet (boot) — nothing is known. Next run.
    if (!state.photoMetaReady) { out.skipped = true; return out; }

    // 0. v89: rows down first, so deletes made elsewhere are known before this
    //    phone decides what to send.
    return _syncPhotoRowsPull(c, uid, st, out).then(() => {
      const meta = state.photoMeta || {};
      const now = new Date().toISOString();

      // 1. Deletes: they are small, and they free space before uploads use it.
      //    v89: anything KNOWN to be in the cloud (5A), not only this phone's own.
      const del = [];
      const seen = new Set();
      for (const t of (state.tombstones || [])) {
        if (!t || t.kind !== 'photo') continue;
        const id = String(t.id);
        if (seen.has(id)) continue;
        if (meta[id]) continue;                    // on this phone again (restored): live
        if (!st.ph.sent[id]) continue;             // not known to be in the cloud
        seen.add(id); del.push(id);
      }
      for (const id of Object.keys(st.ph.sent)) {
        if (seen.has(id)) continue;
        if (st.gone[st.ph.sent[id].s]) { seen.add(id); del.push(id); }
      }
      let chain = Promise.resolve();
      for (let i = 0; i < del.length; i += SYNC_PHOTO_DELETE_BATCH) {
        const chunk = del.slice(i, i + SYNC_PHOTO_DELETE_BATCH);
        chain = chain
          .then(() => c.from('photos').update({ deleted: true, last_modified: now })
            .eq('user_id', uid).in('id', chunk))
          .then((r) => { if (r && r.error) throw r.error; })
          // v89: the preview goes with the photo. Removing one that was never
          // made is not an error.
          .then(() => c.storage.from('photos').remove(
            chunk.map(id => _syncPhotoPath(uid, id)).concat(chunk.map(id => _syncThumbPath(uid, id)))))
          .then((r) => {
            if (r && r.error) throw r.error;
            for (const id of chunk) { delete st.ph.sent[id]; out.gone++; }
            _syncSave(st);
          });
      }

      // 2. Uploads, oldest first, a few per run (SYNC_PHOTOS_PER_RUN).
      return chain.then(() => {
        const jobs = _syncPhotoJobs() || new Map();
        const cands = [];
        for (const [id, job] of jobs) {
          if (st.ph.sent[id]) continue;
          if (!st.sent[job] || st.gone[job]) continue;   // job not in the cloud (yet)
          cands.push({ id, job, m: meta[id] });
        }
        cands.sort((a, b) => String(a.m.at).localeCompare(String(b.m.at)) || a.id.localeCompare(b.id));
        const take = cands.slice(0, SYNC_PHOTOS_PER_RUN);
        out.more = cands.length - take.length;
        let up = Promise.resolve();
        for (const cand of take) {
          up = up.then(() => photoBlob(cand.id)).then((blob) => {
            // Deleted while the run was going, or unreadable: skip, don't fail.
            if (!blob || !(state.photoMeta || {})[cand.id]) return null;
            const path = _syncPhotoPath(uid, cand.id);
            const m = cand.m;
            const at = (m.at && !isNaN(Date.parse(m.at))) ? m.at : null;
            let thumb = false;
            return c.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
              .then((r) => {
                if (r && r.error) throw r.error;
                // v89 (1A): the preview after the photo, before the row.
                return _syncThumbUpload(c, uid, cand.id, blob).then((ok) => { thumb = ok; });
              })
              .then(() => c.from('photos').upsert({
                id: cand.id, user_id: uid, session_id: cand.job, item_id: m.i,
                storage_path: path, bytes: m.b || (blob.size || 0),
                w: m.w || null, h: m.h || null, taken_at: at, thumb,
                deleted: false, last_modified: new Date().toISOString(),
              }, { onConflict: 'user_id,id' }))
              .then((r) => {
                if (r && r.error) throw r.error;
                const e = { s: cand.job, i: m.i };
                const b = m.b || blob.size || 0;
                if (b > 0) e.b = b;
                if (thumb) e.t = 1;
                if (at) e.a = at;
                st.ph.sent[cand.id] = e;
                out.up++;
                _syncSave(st);
              });
          });
        }
        return up;
      }).then(() => _syncThumbBackfill(c, uid, st, out)).then(() => {
        // More waiting (a backlog, or the first run after an update): take the
        // next round shortly rather than waiting for the two-minute backstop.
        if (out.more > 0 || out.thumbsMore > 0) { try { syncPushSoon(SYNC_RESUME_DELAY_MS, { pull: true }); } catch { /* next trigger will do */ } }
        return out;
      });
    });
  });
}

// v89 (1A): previews for photos already in the cloud without one, while the
// image is on this phone (uploaded before V89, or downloaded here). Best effort:
// a failure stops the round quietly and is tried next run — a preview is a
// convenience, never a reason to report photos as not sent.
const _syncThumbGaveUp = new Set();   // images that will not decode, this session

function _syncThumbBackfill(c, uid, st, out) {
  const meta = state.photoMeta || {};
  const gone = new Set();
  for (const t of (state.tombstones || [])) if (t && t.kind === 'photo') gone.add(String(t.id));
  const cands = Object.keys(st.ph.sent).filter((id) =>
    !st.ph.sent[id].t && meta[id] && !gone.has(id) && !_syncThumbGaveUp.has(id) && !st.gone[st.ph.sent[id].s]);
  const cap = (typeof SYNC_THUMBS_PER_RUN === 'number') ? SYNC_THUMBS_PER_RUN : 50;
  const take = cands.slice(0, cap);
  out.thumbsMore = cands.length - take.length;
  let stop = false;
  let chain = Promise.resolve();
  for (const id of take) {
    chain = chain.then(() => {
      if (stop) return null;
      return photoBlob(id).then((blob) => {
        if (!blob) return null;
        return _syncThumbUpload(c, uid, id, blob).then((ok) => {
          if (!ok) { _syncThumbGaveUp.add(id); return null; }
          return c.from('photos').update({ thumb: true, last_modified: new Date().toISOString() })
            .eq('user_id', uid).eq('id', id)
            .then((r) => {
              if (r && r.error) { stop = true; return; }
              if (st.ph.sent[id]) { st.ph.sent[id].t = 1; out.thumbs++; _syncSave(st); }
            });
        });
      }).catch(() => { stop = true; });
    });
  }
  return chain.then(() => { if (stop) out.thumbsMore = 0; });
}

// ---- v89: on request (10A) ------------------------------------------------------------
// The only two ways an image comes down. Both read state.photoCloud — the list
// the pull keeps — and never the table itself.

// A preview, for the strip. Null when there isn't one, or no signal, or signed
// out: the tile then shows a plain cloud.
// V90: `hint` is a row the photo manager read with "Look in the cloud" — a photo
// of a job not on this phone, so not known here (rule 24). Its own `t` says
// whether a preview exists; nothing about it is remembered.
function syncPhotoThumb(photoId, hint) {
  const id = String(photoId || '');
  const e = (state.photoCloud || {})[id] || ((hint && hint.t) ? hint : null);
  if (!id || !e || !e.t || !syncActive() || _syncOffline()) return Promise.resolve(null);
  const uid = _syncCurrentUserId();
  if (!uid || state.photoCloudUser !== uid) return Promise.resolve(null);
  return cloudClient()
    .then((c) => c.storage.from('photos').download(_syncThumbPath(uid, id)))
    .then((r) => (r && !r.error && r.data) ? r.data : null)
    .catch(() => null);
}

// Full photos onto this phone. One at a time (a phone, a canvas each, mobile
// data). `onStep(done, total)` after each. Resolves {got, failed, offline,
// notReady}; a failure never stops the rest.
function syncPhotoDownload(ids, onStep) {
  const list = Array.from(new Set((ids || []).map(String).filter(Boolean)));
  const res = { got: 0, failed: 0, offline: false, notReady: false };
  if (!list.length) return Promise.resolve(res);
  if (!syncActive() || _syncOffline()) { res.offline = true; res.failed = list.length; return Promise.resolve(res); }
  // Until the store has been read, "not on this phone" isn't known yet.
  if (!state.photoMetaReady) { res.notReady = true; res.failed = list.length; return Promise.resolve(res); }
  const uid = _syncCurrentUserId();
  if (!uid || state.photoCloudUser !== uid) { res.offline = true; res.failed = list.length; return Promise.resolve(res); }
  let done = 0;
  const step = () => { done++; if (typeof onStep === 'function') { try { onStep(done, list.length); } catch { /* progress only */ } } };
  return cloudClient().then((c) => {
    let chain = Promise.resolve();
    for (const id of list) {
      chain = chain.then(() => {
        const e = (state.photoCloud || {})[id];
        if (state.photoMeta && state.photoMeta[id]) { step(); return null; }   // already here
        if (!e) { res.failed++; step(); return null; }
        return c.storage.from('photos').download(_syncPhotoPath(uid, id))
          .then((r) => {
            if (!r || r.error || !r.data) { res.failed++; return null; }
            return photoAddFromCloud({ id, s: e.s, i: e.i, b: e.b, a: e.a }, r.data)
              .then((ok) => { if (ok) res.got++; else res.failed++; });
          }, () => { res.failed++; })
          .then(step);
      });
    }
    return chain;
  }).then(() => {
    // A photo downloaded without a preview in the cloud gets one on the next
    // run (the backfill) — "made the first time one is downloaded" (1A).
    if (res.got) { try { syncNoteSave(); } catch { /* next trigger */ } }
    return res;
  }, () => { res.failed = list.length - res.got; return res; });
}

// ---- V90: the photo manager's cloud read (R18) -------------------------------
//
// "Look in the cloud" (3A). The first read of what the cloud holds for jobs NOT
// on this phone: the photos table, ROWS only — never an image (R17) — and, for
// the jobs those rows belong to, five fields picked out of the job row
// (doc->>…), never the job itself. Roughly 200 bytes a photo.
//
// ⚠ Nothing read here is remembered. It is not added to st.ph.sent (rule 24:
// knowing is scoped to what the phone holds) and never saved — the manager keeps
// it in memory until it closes, and the next look reads again. The one exception
// is a photo the engineer chooses to delete: see syncPhotoKnowForDelete.
//
// Keyset paging by id (gt + order + limit): stable while rows are added, and no
// offsets. Resolves { ok, offline, error, rows: [{id,s,i,b,t,a}], jobs, asked, capped }.
const _SYNC_BROWSE_COLS = 'id,session_id,item_id,bytes,thumb,taken_at';
const _SYNC_BROWSE_JOB_COLS = 'id,deleted,site:doc->>site,name:doc->>name,date:doc->>date,clientId:doc->>clientId,locked:doc->>locked';

function syncPhotoBrowse() {
  const res = { ok: false, offline: false, error: '', rows: [], jobs: {}, asked: [], capped: false };
  if (!syncActive() || _syncOffline()) { res.offline = true; return Promise.resolve(res); }
  const uid = _syncCurrentUserId();
  if (!uid) { res.offline = true; return Promise.resolve(res); }
  const size = (typeof SYNC_BROWSE_PAGE === 'number') ? SYNC_BROWSE_PAGE : 1000;
  const max = (typeof SYNC_BROWSE_MAX === 'number') ? SYNC_BROWSE_MAX : 20000;
  const batch = (typeof SYNC_PHOTO_NEED_BATCH === 'number') ? SYNC_PHOTO_NEED_BATCH : 50;
  return cloudClient().then((c) => {
    function page(after) {
      let q = c.from('photos').select(_SYNC_BROWSE_COLS).eq('user_id', uid).eq('deleted', false);
      if (after) q = q.gt('id', after);
      return q.order('id', { ascending: true }).limit(size).then((r) => {
        if (r && r.error) throw r.error;
        const got = (r && r.data) || [];
        for (const row of got) {
          const id = String(row && row.id != null ? row.id : '');
          const s = String(row && row.session_id != null ? row.session_id : '');
          const i = String(row && row.item_id != null ? row.item_id : '');
          if (!id || !s || !i) continue;
          const e = { id, s, i, b: 0, t: row.thumb === true, a: '' };
          const b = Number(row.bytes);
          if (b > 0 && isFinite(b)) e.b = Math.round(b);
          if (typeof row.taken_at === 'string' && !isNaN(Date.parse(row.taken_at))) e.a = row.taken_at;
          res.rows.push(e);
        }
        if (got.length < size) return;
        if (res.rows.length >= max) { res.capped = true; return; }
        const last = got[got.length - 1];
        return page(String(last && last.id != null ? last.id : ''));
      });
    }
    return page('').then(() => {
      // The names of the jobs NOT on this phone (the manager names the rest from
      // the phone). A job missing from the answer, or deleted, leaves its photos
      // with no job (5A) — the manager says so; nothing is decided here.
      const local = new Set((state.sessions || []).map(s => String(s && s.id)));
      const want = Array.from(new Set(res.rows.map(e => e.s))).filter(id => !local.has(id));
      res.asked = want;   // a job asked about and not answered has no job (5A)
      let chain = Promise.resolve();
      for (let k = 0; k < want.length; k += batch) {
        const chunk = want.slice(k, k + batch);
        chain = chain.then(() => c.from('sessions').select(_SYNC_BROWSE_JOB_COLS).eq('user_id', uid).in('id', chunk))
          .then((r) => {
            if (r && r.error) throw r.error;
            for (const j of ((r && r.data) || [])) {
              const id = String(j && j.id != null ? j.id : '');
              if (!id) continue;
              const str = (v) => (typeof v === 'string') ? v : '';
              res.jobs[id] = {
                deleted: j.deleted === true,
                site: str(j.site), name: str(j.name), date: str(j.date), clientId: str(j.clientId),
                locked: j.locked === true || j.locked === 'true',
              };
            }
          });
      }
      return chain;
    }).then(() => { res.ok = true; return res; });
  }).catch((e) => {
    res.error = (typeof syncErrorMessage === 'function') ? syncErrorMessage(e) : 'Couldn\u2019t reach the cloud.';
    res.rows = []; res.jobs = {}; res.asked = [];
    return res;
  });
}

// V90: a photo the manager found with "Look in the cloud" and the engineer
// chose to delete everywhere. It becomes KNOWN first, then goes through the one
// delete path V89 built (a 'photo' ledger entry; the next run marks the row,
// removes both files, then forgets it) — so it retries like any other delete and
// survives the app closing or losing signal.
//
// ⚠ Written only while no run is going: a run holds its own copy of the sync
// state and saves it, which would overwrite this. Waits, then writes in one
// synchronous step (nothing can start a run in between). Resolves the number
// added. `list` = [{id, s, i, b?, t?, a?}].
function syncPhotoKnowForDelete(list) {
  const uid = _syncCurrentUserId();
  const want = (list || []).filter(e => e && e.id && e.s && e.i);
  if (!uid || !want.length) return Promise.resolve(0);
  const go = () => {
    if (_syncRunning) return _syncRunning.then(go, go);
    const st = _syncLoad();
    if (st.userId !== uid) return 0;
    let n = 0;
    for (const e of want) {
      const id = String(e.id);
      if (st.ph.sent[id]) continue;
      const o = { s: String(e.s), i: String(e.i) };
      if (typeof e.b === 'number' && e.b > 0 && isFinite(e.b)) o.b = Math.round(e.b);
      if (e.t) o.t = 1;
      if (typeof e.a === 'string' && e.a && !isNaN(Date.parse(e.a))) o.a = e.a;
      st.ph.sent[id] = o;
      n++;
    }
    if (n) _syncSave(st);
    return n;
  };
  return Promise.resolve(go());
}

// ---- V91 (Stage 4, 10A): cleared from this phone, and bringing one back ------
//
// Jobs cleared from this phone (SYNC_PRUNED_KEY) stay in the cloud and on the
// other phones, but the pull never brings them back — that is what clearing
// meant. V91 makes clearing easier, so it also makes it undoable.
//
// syncClearedLook(): the NAMES of the cleared jobs, on a tap — five fields picked
// out of each job row (doc->>…), never the job itself (R17), exactly as V90's
// look does. Memory only (rule 25): nothing is written. Resolves
// { ok, offline, error, jobs: [{id, site, name, date, clientId, locked, at}],
//   gone } — gone = cleared jobs the cloud no longer holds (deleted elsewhere).
function syncClearedLook() {
  const res = { ok: false, offline: false, error: '', jobs: [], gone: 0 };
  if (!syncActive() || _syncOffline()) { res.offline = true; return Promise.resolve(res); }
  const uid = _syncCurrentUserId();
  if (!uid) { res.offline = true; return Promise.resolve(res); }
  const local = new Set((state.sessions || []).map(s => String(s && s.id)));
  const list = _syncPrunedLoad().filter(e => !local.has(e.id));
  const at = new Map(list.map(e => [e.id, e.at]));
  const want = list.map(e => e.id);
  if (!want.length) { res.ok = true; return Promise.resolve(res); }
  const batch = (typeof SYNC_PHOTO_NEED_BATCH === 'number') ? SYNC_PHOTO_NEED_BATCH : 50;
  const seen = new Set();
  return cloudClient().then((c) => {
    let chain = Promise.resolve();
    for (let k = 0; k < want.length; k += batch) {
      const chunk = want.slice(k, k + batch);
      chain = chain.then(() => c.from('sessions').select(_SYNC_BROWSE_JOB_COLS).eq('user_id', uid).in('id', chunk))
        .then((r) => {
          if (r && r.error) throw r.error;
          for (const j of ((r && r.data) || [])) {
            const id = String(j && j.id != null ? j.id : '');
            if (!id || !at.has(id)) continue;
            seen.add(id);
            if (j.deleted === true) continue;
            const str = (v) => (typeof v === 'string') ? v : '';
            res.jobs.push({ id, site: str(j.site), name: str(j.name), date: str(j.date), clientId: str(j.clientId),
              locked: j.locked === true || j.locked === 'true', at: at.get(id) || '' });
          }
        });
    }
    return chain;
  }).then(() => {
    res.gone = want.length - res.jobs.length;
    res.jobs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    res.ok = true;
    return res;
  }).catch((e) => {
    res.error = (typeof syncErrorMessage === 'function') ? syncErrorMessage(e) : 'Couldn\u2019t reach the cloud.';
    res.jobs = []; res.gone = 0;
    return res;
  });
}

// Bring cleared jobs back onto this phone: each job's row is read (the one
// download a return needs), checked like any pulled job, and added exactly as
// the pull adds a job from the other phone — plus:
//   • it leaves the cleared list, so the pull treats it as an ordinary job;
//   • st.conf records the read (it is safe in the cloud the moment it lands);
//   • st.ph.need, so its photo rows come with it (rule 24);
//   • its tallies leave the archived stats they joined when it was cleared
//     (unarchiveSessionStats), or the lifetime counter would count it twice.
// ⚠ The write waits for any run and happens in one synchronous step
// (syncWhenIdle): a run holds the job list and the sync state. A job already
// back on the phone by then is only taken off the cleared list.
// Resolves { ok, offline, error, got, missing }.
function syncBringBack(ids) {
  const want = Array.from(new Set((ids || []).map(String).filter(Boolean)));
  const res = { ok: false, offline: false, error: '', got: 0, missing: 0 };
  if (!want.length) { res.ok = true; return Promise.resolve(res); }
  if (!syncActive() || _syncOffline()) { res.offline = true; return Promise.resolve(res); }
  const uid = _syncCurrentUserId();
  if (!uid) { res.offline = true; return Promise.resolve(res); }
  const batch = (typeof SYNC_PHOTO_NEED_BATCH === 'number') ? SYNC_PHOTO_NEED_BATCH : 50;
  const rows = [];
  return cloudClient().then((c) => {
    let chain = Promise.resolve();
    for (let k = 0; k < want.length; k += batch) {
      const chunk = want.slice(k, k + batch);
      chain = chain.then(() => c.from('sessions').select('id,doc,deleted').eq('user_id', uid).in('id', chunk))
        .then((r) => { if (r && r.error) throw r.error; for (const row of ((r && r.data) || [])) rows.push(row); });
    }
    return chain;
  }).then(() => syncWhenIdle(() => {
    const st = _syncLoad();
    if (st.userId !== uid) { res.error = 'Signed in as someone else now.'; return res; }
    const local = new Set((state.sessions || []).map(s => String(s && s.id)));
    const back = new Set();
    const added = [];
    for (const row of rows) {
      const id = String(row && row.id != null ? row.id : '');
      if (!id || want.indexOf(id) === -1 || back.has(id)) continue;
      if (local.has(id)) { back.add(id); continue; }
      if (row.deleted === true || !_syncValidDoc(row.doc, id)) continue;
      const doc = row.doc;
      const hash = syncHash(_syncCanonical(doc));
      state.sessions.unshift(doc);
      st.sent[id] = hash;
      st.conf[id] = hash;
      delete st.gone[id];
      st.ph.need.push(id);
      _syncHeldClear(id);
      added.push(doc);
      back.add(id);
    }
    res.missing = want.length - back.size;
    if (back.size) _syncPrunedSave(_syncPrunedLoad().filter(e => !back.has(e.id)));
    if (added.length) {
      if (typeof unarchiveSessionStats === 'function') { try { unarchiveSessionStats(added); } catch (e) { console.error('Stats not adjusted (non-fatal).', e); } }
      _syncSave(st);
      // A new array reference busts activeSession()'s memo, as in the pull.
      state.sessions = state.sessions.slice();
      saveSessions();
      if (typeof saveSettings === 'function') { try { saveSettings(); } catch (e) { console.error(e); } }
    }
    res.got = added.length;
    res.ok = true;
    return res;
  })).catch((e) => {
    res.error = (typeof syncErrorMessage === 'function') ? syncErrorMessage(e) : 'Couldn\u2019t reach the cloud.';
    return res;
  });
}
