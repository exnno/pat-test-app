/*!
 * PATGo PWA — cloud.js (cloud sign-in)
 * v85 (September 2026) · V139 (October 2026): password sign-in · V140: Google · V145: one owner per phone · V158: an owner never lost · V161: signed out from another device · V162: one owner decision, at sign-in and start
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 *
 * Sign-in to the cloud project chosen by config.js (CLOUD_ENV / CLOUD): email +
 * password (V139, the everyday route), Google (V140 — a signed-in account
 * connects its Google login once, then "Continue with Google" signs in), or a
 * code emailed to you (V79, still there, and how "Forgot password?" works). This file is SIGN-IN ONLY. Sending data is sync.js's job (V80: jobs,
 * one way); this file only tells it who is signed in (cloudUserId) and when a
 * sign-in has just happened.
 *
 * ⚠ OPTIONAL SUBSYSTEM (MAP rule 6). Every call INTO this file from elsewhere
 * is typeof-guarded, and boot wraps cloudBoot() in try/catch. A missing or
 * broken cloud.js must never stop the app starting or touch the fail flow.
 *
 * ⚠ OFFLINE ALWAYS (spec decision 6). With nobody signed in, this file makes
 * NO network request and does not even load the library — the app is exactly
 * what it was. When someone is signed in, the session is read from storage
 * synchronously at boot, so being offline never signs anyone out.
 *
 * ⚠ NEVER render() FROM A PROMISE WHILE AN INPUT IS FOCUSED (MAP rules 2/3).
 * Everything async lands through _cloudRepaint(), which only repaints when the
 * Account page is showing, nothing is focused and no sheet is open. Anything
 * skipped simply shows on the next render.
 *
 * WHY shouldCreateUser IS false ON SIGN-IN AND true ONLY ON "CREATE AN ACCOUNT"
 * (V144, 1A). Signing in never makes an account, so a mistyped address at sign-in
 * is told "no account" rather than quietly becoming a second, empty account.
 * Only the Create card (state.cloud.signup) asks for one. The dashboard's "Allow
 * new users to sign up" must be ON for that — and with it on, Continue with
 * Google makes an account for a Google login nobody knows (3A, accepted: the app
 * cannot stop that by itself). The access-code curtain still stands on the test
 * site until the launch switch (5A).
 *
 * ⚠ V139: WHY "FORGOT PASSWORD?" SENDS A CODE, NOT SUPABASE'S RESET LINK (2A).
 * A link in an email opens in Safari, and on an iPhone Safari and the installed
 * home-screen app keep separate storage — the reset would sign Safari in, not
 * PATGo. So Forgot = the emailed-code sign-in we already have, then "Choose a new
 * password" (updateUser) while that sign-in is minutes old. Nothing arrives in
 * the URL (detectSessionInUrl stays false). Don't "upgrade" it to
 * resetPasswordForEmail.
 *
 * ⚠ V139: A PASSWORD IS NEVER KEPT. It is read from its box at the moment of the
 * request and handed to the library — never put in state, never stored, never in
 * a backup. The phone keeps only the session the library writes (as for a code).
 * Supabase stores a salted bcrypt hash. The dashboard's "Secure password change"
 * and "Require current password" switches stay OFF (5A) — either would stop
 * Forgot (and first-time Set) from working.
 */

const CLOUD_LIB_SRC = './supabase.umd.js';
let _cloudClientPromise = null;

// The single place that decides whether this copy of the app has a cloud.
function cloudAvailable() {
  return !!(typeof CLOUD !== 'undefined' && CLOUD && CLOUD.url && CLOUD.publishableKey
            && typeof CLOUD_ENV !== 'undefined' && CLOUD_ENV !== 'off');
}

// Read supabase-js's own stored session WITHOUT loading the library. Returns
// { email } or null. Used at boot so the signed-in state (and the TEST strip)
// is right on the very first paint, online or not.
function _cloudReadStoredSession() {
  try {
    const raw = localStorage.getItem(CLOUD_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object' || !s.refresh_token) return null;
    const email = (s.user && typeof s.user.email === 'string') ? s.user.email : '';
    const id = (s.user && typeof s.user.id === 'string') ? s.user.id : '';
    // V127: when the server last issued this sign-in (its expiry less its life).
    // Server time, not the phone's — plan.js uses it so winding the phone's clock
    // back does not move the trial end. 0 when the stored session lacks either.
    const exp = Number(s.expires_at), life = Number(s.expires_in);
    const issuedAt = (isFinite(exp) && isFinite(life) && exp > 0 && life > 0) ? (exp - life) * 1000 : 0;
    return { email, id, issuedAt, google: _cloudGoogleEmail(s.user) };   // V140
  } catch {
    return null;   // unreadable = not signed in; the library will tidy it up
  }
}

// v80: the signed-in account's id, read synchronously from the stored session
// (no library, no network). sync.js uses it to tell whose sync state is on the
// phone. The id actually written to the server always comes from the library's
// live session at push time, never from here.
function cloudUserId() {
  if (!cloudAvailable() || !state.cloud || state.cloud.status !== 'signed-in') return '';
  const s = _cloudReadStoredSession();
  return s ? s.id : '';
}

// ---- V145: one owner per phone (spec 1A 2A 3A 4A 5A 7A 8A) ---------------------
// THE RULE. A phone's jobs and setup belong to ONE account — OWNER_KEY (config.js).
// The cloud cannot enforce this: a write is filed under whoever is signed in, so
// the owner's jobs sent while another account is signed in would be filed as that
// account's (found by Peter, 21 Oct, testing several accounts on one phone). So
// the phone enforces it, in three places that do not trust each other:
//   • the landing (_cloudOwnerLanding): a different account only takes the phone
//     over once the owner's work is ALL in the owner's cloud (2A: asked first);
//     otherwise it is signed straight back out, told why (1A);
//   • sync.js syncActive: no trigger fires while the signed-in account isn't
//     the owner;
//   • sync.js _syncRun: the live session's account, the one a write is filed
//     under, must be the owner — or the run stops before reading or sending.
// No owner = whoever signs in first adopts the phone (8A), as a free user's work
// has always carried across — V158: only a phone that never had one. The last
// synced account is the owner if the record is lost; a phone that had an owner
// nobody can name, or whose owner can't be saved, hands its jobs to nobody. Signing out never clears the owner (3A): the jobs
// stay, and another account takes them off only through the handover.
let _cloudOwnerMemo;   // undefined = not read yet; storage is the truth
function cloudOwner() {
  if (_cloudOwnerMemo !== undefined) return _cloudOwnerMemo;
  let o = null;
  try {
    const raw = JSON.parse(localStorage.getItem(OWNER_KEY) || 'null');
    if (raw && typeof raw === 'object' && typeof raw.id === 'string' && raw.id) {
      o = { id: raw.id, email: typeof raw.email === 'string' ? raw.email : '' };
    }
  } catch { o = null; }   // unreadable = no owner here; V152 kept a copy, which V158 reads as "uncertain"
  _cloudOwnerMemo = o;
  return o;
}
// V158 (R68, audit finding 1): the owner is held in memory BEFORE it is saved,
// so a save that fails (a full phone) can never leave this page ownerless — that
// was how a second account could adopt the jobs with no handover. false = held
// in memory only; _cloudOwnerUnsaved then retries the save at every sync check
// (cloudOwnerAllows) and sign-out, and the landing refuses a sign-in that would
// adopt a phone's jobs without a saved owner (2A) — memory alone cannot protect
// the next start.
let _cloudOwnerUnsaved = false;
function cloudOwnerSet(id, email) {
  if (!id) { _cloudOwnerMemo = undefined; _cloudOwnerUnsaved = false; try { localStorage.removeItem(OWNER_KEY); } catch {} return false; }
  _cloudOwnerMemo = { id, email: email || '' };
  try {
    localStorage.setItem(OWNER_KEY, JSON.stringify({ id, email: email || '', at: new Date().toISOString() }));
    _cloudOwnerUnsaved = false;
    return true;
  } catch { _cloudOwnerUnsaved = true; return false; }   // full: held in memory only
}
// V158: a held-in-memory owner is saved as soon as there is room.
function _cloudOwnerRetry() {
  if (!_cloudOwnerUnsaved || !_cloudOwnerMemo) return;
  cloudOwnerSet(_cloudOwnerMemo.id, _cloudOwnerMemo.email);
}
// V158: the account this phone last synced as (its sync record) — the owner
// when the owner record itself is missing or couldn't be read. Read at every
// sign-in, not only at start (V145's first run), so a phone that was A's stays
// A's whenever the record survives.
function _cloudOwnerFromSyncRecord() {
  let st = null;
  try { st = JSON.parse(localStorage.getItem(SYNC_STATE_KEY) || 'null'); } catch { st = null; }
  if (st && typeof st.userId === 'string' && st.userId) { cloudOwnerSet(st.userId, ''); return true; }
  return false;
}
// V158 (1A): the phone HAD an owner but nobody can now say who — the owner
// record, or the sync record, was unreadable and V152 set it aside (its kept
// copy is the evidence) and no account could be recovered from either. A phone
// that never had an owner leaves no such copy: the first sign-in adopts it (8A).
function _cloudOwnerUncertain() {
  if (cloudOwner()) return false;
  try {
    return localStorage.getItem(UNREADABLE_PREFIX + OWNER_KEY) !== null
      || localStorage.getItem(UNREADABLE_PREFIX + SYNC_STATE_KEY) !== null;
  } catch { return true; }   // can't look = can't be sure
}
// V158: jobs on this phone — what an adoption would hand to the new account.
function _cloudPhoneHasJobs() {
  return !!(state && Array.isArray(state.sessions) && state.sessions.length);
}
// May sync run as this account? Only the owner — or anyone on a phone with no
// owner (stamped at the landing), except while ownership is uncertain and there
// are jobs (V158), or an adoption of these jobs was refused (V162). An empty id
// never may.
function cloudOwnerAllows(uid) {
  if (!uid) return false;
  _cloudOwnerRetry();   // V158
  const o = cloudOwner();
  if (o) return o.id === uid;
  if (_cloudAdoptRefused && _cloudPhoneHasJobs()) return false;   // V162
  return !(_cloudOwnerUncertain() && _cloudPhoneHasJobs());   // V158 (1A): nobody, while uncertain
}

// ---- V162: ONE owner decision, for the sign-in AND the start (the third audit,
// finding 1). V161's start-up (_cloudOwnerFirstRun) made the SAVED LOGIN the
// owner before it read the sync record, and without V158's two refusals — so a
// phone that was A's, its owner record lost, could start up as B's with B's
// login left behind by a takeover question the app closed on. Now the landing
// (_cloudOwnerLanding) and the start (cloudBoot) both ask this, in this order:
//   1. an owner record → that's the owner;
//   2. none → the sync record's account is (V158);
//   3. still none, jobs here, and the phone HAD an owner nobody can name → no one
//      adopts them (V158 1A);
//   4. still none → this account adopts — but with jobs here only once the owner
//      is SAVED (V158 2A); held in memory alone, the next start would forget it.
// Returns '' (go on: compare against cloudOwner()) or the refusal's words.
// Nothing here touches a job; a refusal only stops the cloud.
let _cloudAdoptRefused = false;   // V162: an adoption of these jobs was refused this run
const CLOUD_OWNER_UNCERTAIN_WORDS = 'PATGo can’t tell which account this phone’s jobs belong to — the record of it couldn’t be read. ' +
  'Your jobs are safe here and you can keep working. To use the cloud on this phone, save a backup, then Reset this phone (Everything, as new).';
const CLOUD_OWNER_FULL_WORDS = 'This phone’s storage for PATGo is full, so it can’t record which account its jobs belong to. ' +
  'Your jobs are safe here and you can keep working. Back up, then clear old jobs to make room, and sign in again.';
function _cloudOwnerResolve(uid, addr) {
  if (!cloudOwner()) _cloudOwnerFromSyncRecord();          // 2. the last synced account first
  if (cloudOwner()) return '';                              // 1/2. there is an owner
  if (_cloudPhoneHasJobs() && _cloudOwnerUncertain()) {     // 3. had one nobody can name
    _cloudAdoptRefused = true;
    return CLOUD_OWNER_UNCERTAIN_WORDS;
  }
  if (!cloudOwnerSet(uid, addr) && _cloudPhoneHasJobs()) {   // 4. adopted only once saved
    _cloudOwnerMemo = null; _cloudOwnerUnsaved = false;     // the refused account is not kept
    _cloudAdoptRefused = true;
    return CLOUD_OWNER_FULL_WORDS;
  }
  _cloudAdoptRefused = false;
  return '';
}
// The owner in words. A phone stamped from its sync record (V145's first run,
// signed out) knows the account but not its address.
function cloudOwnerName(o) {
  const own = o || cloudOwner();
  return (own && own.email) || 'the account this phone belongs to';
}

// V162: this phone's jobs are held from every account — no owner, jobs here,
// and either it had an owner nobody can name (V158) or an adoption of them was
// refused this run (owner couldn't be saved). The wall stands aside for it.
function cloudOwnerHeld() {
  try {
    if (cloudOwner() || !_cloudPhoneHasJobs()) return false;
    return _cloudAdoptRefused || _cloudOwnerUncertain();
  } catch (e) { return true; }   // can't tell: keep the work reachable
}

// "3 jobs, 2 photos and other changes" — the shared words of the sign-out
// warning (4A) and the refusal (1A), from sync.js syncOwnerPending's counts.
function cloudPendingWords(p) {
  const parts = [];
  const n = (k, one, many) => (p[k] === 1 ? '1 ' + one : p[k] + ' ' + many);
  if (p.jobs) parts.push(n('jobs', 'job', 'jobs'));
  if (p.photos) parts.push(n('photos', 'photo', 'photos'));
  if (p.other) parts.push(parts.length ? 'other changes' : 'Some changes');
  const what = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : (parts[0] || 'Some changes');
  const one = parts.length === 1 && ((p.jobs === 1 && !p.photos && !p.other) || (p.photos === 1 && !p.jobs && !p.other));
  return { what, have: one ? 'hasn’t' : 'haven’t', them: one ? 'it' : 'them' };
}

// What of the owner's is on this phone and not in the owner's cloud. null when
// it cannot be counted (sync.js missing) — which counts as "not safe".
function _cloudOwnerPending(ownerId) {
  if (typeof syncOwnerPending !== 'function') return null;
  try { return syncOwnerPending(ownerId); } catch (e) { console.error(e); return null; }
}

// The login itself, gone from this phone (the sign-out's own sweep, storage
// only). _cloudForgetLogin also tells the library's copy in memory, best-effort,
// so it stops refreshing.
function _cloudSweepLogin() {
  try {
    const doomed = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(CLOUD_AUTH_STORAGE_KEY) === 0) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {}
}
function _cloudForgetLogin() {
  _cloudSweepLogin();
  if (_cloudClientPromise) _cloudClientPromise.then((c) => c.auth.signOut({ scope: 'local' })).catch(() => {});
}

// Where every sign-in lands (from _cloudSignedIn). true = the sign-in stands;
// false = it doesn't (yet): refused and signed out (1A), or the takeover is
// being asked (2A — state.cloud.handover). Synchronous: storage only.
function _cloudOwnerLanding(user, email) {
  const stored = _cloudReadStoredSession();
  const uid = (user && typeof user.id === 'string' && user.id) || (stored && stored.id) || '';
  const addr = (user && user.email) || email || '';
  if (!uid) return true;                                  // nothing to judge by: the guards still hold
  const refused = _cloudOwnerResolve(uid, addr);           // V162: shared with the start
  if (refused) return _cloudOwnerRefuse(refused);
  const o = cloudOwner();
  if (!o) return true;                                     // (unreachable: resolve adopts or refuses)
  if (o.id === uid) {
    if (addr && addr !== o.email) cloudOwnerSet(uid, addr);   // a changed address, or one learned now
    return true;
  }
  const p = _cloudOwnerPending(o.id);
  if (p && p.total === 0) {
    _cloudSet({ handover: { id: uid, email: addr, from: o.email || '' } });   // 2A: asked
    return false;
  }
  // 1A: refused. Nothing of the owner's has been read, shown or sent as this account.
  const who = cloudOwnerName(o);
  const w = p ? cloudPendingWords(p) : null;
  return _cloudOwnerRefuse(w
      ? `This phone has ${w.what.charAt(0).toLowerCase() + w.what.slice(1)} from ${who} that ${w.have} reached the cloud. ` +
        `Sign in as ${who} to send ${w.them} first — or save a backup, then Reset this phone (Everything, as new).`
      : `This phone belongs to ${who}. Sign in as ${who} first.`);
}
// The landing's refusal (V145 1A; V158's two): signed straight back out, told why.
function _cloudOwnerRefuse(message) {
  _cloudForgetLogin();
  _cloudSet({ status: 'signed-out', busy: false, plan: null, trialEndsAt: null, checkedAt: null,
    pwOpen: false, pwReset: false, pwNew: false, welcome: '', signup: false, google: '', handover: null,
    message });
  return false;
}

// Lazy library load. The UMD file defines the global `supabase` when run. It is
// in sw.js ASSETS, so once installed it loads offline like jsPDF does.
function cloudLoadLib() {
  if (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') {
    return Promise.resolve(window.supabase);
  }
  if (typeof _injectScriptOnce !== 'function') {
    return Promise.reject(new Error('script loader unavailable'));
  }
  return _injectScriptOnce(CLOUD_LIB_SRC, 'supabase').then(() => {
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('supabase library missing after load');
    }
    return window.supabase;
  });
}

function cloudClient() {
  if (!cloudAvailable()) return Promise.reject(new Error('cloud not available on this host'));
  if (_cloudClientPromise) return _cloudClientPromise;
  _cloudClientPromise = cloudLoadLib().then((lib) => lib.createClient(CLOUD.url, CLOUD.publishableKey, {
    auth: {
      storageKey: CLOUD_AUTH_STORAGE_KEY,
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,   // codes, not links — nothing arrives in the URL
    },
    global: { fetch: _cloudFetch },   // V161: every request the library makes passes _cloudFetch
  })).catch((e) => {
    _cloudClientPromise = null;    // allow a retry (e.g. first load was offline)
    throw e;
  });
  return _cloudClientPromise;
}

// ---- V161: signed out from another device (the second audit, finding 3) -------
// Signing a device out (Your devices → Sign it out, V156) deletes its sign-in at
// once; from V161 the cloud refuses every request on a sign-in that has gone —
// jobs, server functions and photo files — with the code patgo_signed_out
// (supabase/v161-signed-out.sql). It is an ERROR, never an empty answer, so
// nothing here can mistake it for "deleted". One place catches it for every
// caller (sync, business, plan, photos): the library's own fetch. The caller
// still gets its error untouched; this phone then signs itself out (1A) — the
// owner stays, so its unsent jobs wait here for that account's next sign-in
// (V145) — and says why.
const CLOUD_SIGNED_OUT_ELSEWHERE_WORDS = 'This phone was signed out from another device. Your jobs are safe here \u2014 sign in again to send them.';

function cloudSignedOutCode(text) {
  return /patgo_signed_out/.test(String(text || ''));
}

// The bearer token a request carried ('' if none is readable).
function _cloudReqToken(input, init) {
  try {
    const h = (init && init.headers) || (input && typeof input === 'object' && input.headers) || null;
    let v = '';
    if (h && typeof h.get === 'function') v = h.get('Authorization') || h.get('authorization') || '';
    else if (h && typeof h === 'object') v = h.Authorization || h.authorization || '';
    const m = /^Bearer\s+(.+)$/i.exec(String(v || ''));
    return m ? m[1] : '';
  } catch { return ''; }
}

// The access token stored for this phone's sign-in now ('' if signed out).
function _cloudStoredToken() {
  try {
    const raw = localStorage.getItem(CLOUD_AUTH_STORAGE_KEY);
    const s = raw ? JSON.parse(raw) : null;
    return (s && typeof s.access_token === 'string') ? s.access_token : '';
  } catch { return ''; }
}

function _cloudFetch(input, init) {
  return fetch(input, init).then((res) => {
    if (res && !res.ok && typeof res.clone === 'function') {
      // Only a refusal is looked at, read from a copy so the caller's is unread.
      // A refusal for a token this phone no longer holds (an old request landing
      // after signing in again) is not this sign-in's: ignored.
      const tok = _cloudReqToken(input, init);
      res.clone().text().then((t) => {
        if (!cloudSignedOutCode(t)) return;
        const now = _cloudStoredToken();
        if (!now || (tok && tok !== now)) return;
        cloudSignedOutElsewhere();
      }).catch(() => { /* unreadable body: the caller's own error stands */ });
    }
    return res;
  });
}

// 1A: signed out here at once; the jobs stay (V145); the Account page and a
// toast say why. Once only — a second refusal finds it already signed out.
function cloudSignedOutElsewhere() {
  if (!state.cloud || state.cloud.status !== 'signed-in') return false;
  _cloudForgetLogin();
  _cloudSet(_cloudSignedOutPatch(CLOUD_SIGNED_OUT_ELSEWHERE_WORDS));
  _cloudGoogleCloseWindow();
  try { if (typeof showToast === 'function') showToast('This phone was signed out from another device.'); } catch (e) { /* the Account page still says it */ }
  // ⚠ MAP rules 2/3: never repaint over typing or an open sheet — sync.js's test.
  let safe = true;
  try { if (typeof _syncSafeToRepaint === 'function') safe = _syncSafeToRepaint(); } catch (e) { safe = false; }
  if (safe) { try { render(); } catch (e) { console.error(e); } }
  return true;
}

// V145's first run, V162: the start asks the SAME question as a sign-in
// (_cloudOwnerResolve). Signed out (or a login with no readable account): the
// sync record alone can name the owner — nobody is adopted. Signed in: the
// owner record, then the sync record, then (only on a phone that never had an
// owner) the stored login adopts it — refused, as at the landing, while
// ownership is uncertain or can't be saved and there are jobs. Returns '' or
// the refusal's words. Never touches a job; offline, nothing here needs signal.
function _cloudOwnerFirstRun(stored) {
  if (!stored || !stored.id) {
    if (!cloudOwner()) _cloudOwnerFromSyncRecord();
    return '';
  }
  return _cloudOwnerResolve(stored.id, stored.email || '');
}

// ---- boot --------------------------------------------------------------------
// Synchronous part first (no network, no library). Then, ONLY if someone is
// signed in and the phone is online, a background check that the session is
// still good — a revoked session signs out; a network failure changes nothing.
function cloudBoot() {
  if (!cloudAvailable()) { state.cloud.status = 'off'; return; }
  cloudWallTestFromUrl();   // V148 (1A): ?wall / ?wall=off — before the first paint
  _cloudGoogleListen();   // V140: ready for the Google window's answer (no network)
  const stored = _cloudReadStoredSession();
  const refused = _cloudOwnerFirstRun(stored);   // V145; V162: the landing's own rules
  if (!stored) { state.cloud.status = 'signed-out'; return; }
  // V162: the saved login may not adopt these jobs (ownership uncertain, or the
  // owner can't be saved) — signed out, told why, exactly as at a sign-in. The
  // jobs stay and the app works offline as ever; only the cloud waits.
  if (refused) { _cloudOwnerRefuse(refused); return; }
  // V145: a login that isn't the owner's (the app closed while the takeover was
  // being asked) is not kept — nothing has been sent as it. Signed out, told why.
  const own = cloudOwner();
  if (own && stored.id && own.id !== stored.id) {
    _cloudForgetLogin();
    state.cloud.status = 'signed-out';
    state.cloud.message = `Signed out — this phone belongs to ${cloudOwnerName(own)}.`;
    return;
  }
  state.cloud.status = 'signed-in';
  state.cloud.email = stored.email;
  state.cloud.google = stored.google;   // V140: the connected Google address, or ''
  _cloudRememberUnlock();   // v85 2A: a signed-in phone never asks for the code
  // V145: straight after a takeover's restart — the new account's next step.
  if (typeof resetTakeCarry === 'function') {
    try { const carry = resetTakeCarry(); if (carry) cloudHandoverLanded(carry); } catch (e) { console.error(e); }
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  cloudClient()
    .then((c) => c.auth.getSession())
    .then((res) => {
      const session = res && res.data ? res.data.session : null;
      if (session) {
        if (session.user && session.user.email) state.cloud.email = session.user.email;
        if (session.user) state.cloud.google = _cloudGoogleEmail(session.user);   // V140
      } else if (!res || !res.error) {
        // The library looked and found no usable session (refresh token
        // revoked or expired) and has already cleared it. Signed out.
        state.cloud.status = 'signed-out';
      }
      _cloudRepaint();
    })
    .catch(() => { /* offline or library failed to load: stay as we were */ });
}

// ---- UI plumbing -------------------------------------------------------------
function _cloudOnAccountPage() {
  return state.view === 'cloudAccount';
}

function _cloudRepaint() {
  if (!_cloudOnAccountPage()) return;
  try {
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
    if (document.querySelector('body > .bulk-sheet, body > .fail-sheet, body > .modal-backdrop')) return;
  } catch { /* no DOM to inspect — fall through */ }
  render();
}

function _cloudSet(patch) {
  Object.assign(state.cloud, patch);
}

function _cloudInputValue(id) {
  const el = document.getElementById(id);
  return el && typeof el.value === 'string' ? el.value : '';
}

function _cloudOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

// Plain-language error lines. Supabase error objects carry `code` (newer) and
// `status`; messages vary between versions, so codes are checked first.
function cloudErrorMessage(err, stage) {
  const code = err && (err.code || err.error_code) || '';
  const status = err && err.status;
  const msg = String(err && err.message || '');
  if (err && (err.name === 'AuthRetryableFetchError' || status === 0 || /fetch|network/i.test(msg))) {
    return 'Couldn\u2019t reach the server. Check your signal and try again.';
  }
  if (status === 429 || /rate.?limit/i.test(code + ' ' + msg)) {
    // V139: a password route is "tries", not "codes requested".
    if (stage === 'password' || stage === 'new-password' || stage === 'google') return 'Too many tries. Wait a few minutes, then try again.';
    return 'Too many codes requested. Wait a few minutes, then try again.';
  }
  if (stage === 'password' && (code === 'invalid_credentials' || /invalid login credentials/i.test(msg))) {
    // Also what an account with no password yet gets — hence the Forgot pointer.
    return 'That email and password don\u2019t match. Try again, or tap Forgot password.';
  }
  if (stage === 'password' && (code === 'email_not_confirmed' || /not confirmed/i.test(msg))) {
    return 'That account hasn\u2019t been confirmed yet. Use Email me a code instead.';
  }
  if (stage === 'new-password') {
    if (code === 'same_password' || /should be different/i.test(msg)) {
      return 'That\u2019s already your password \u2014 nothing to change.';
    }
    if (code === 'weak_password' || /weak/i.test(msg)) {
      const reasons = (err && err.reasons) || [];
      if (reasons.indexOf('pwned') !== -1 || /pwned|leak/i.test(msg)) {
        return 'That password has turned up in a known data leak. Choose a different one.';
      }
      return 'The server turned that password down. ' + CLOUD_PASSWORD_HINT;
    }
    if (code === 'reauthentication_needed' || /reauthenticat/i.test(msg)) {
      return 'For safety, sign out, sign back in with an emailed code, then set the password straight away.';
    }
    if (err && err.name === 'AuthSessionMissingError') {
      return 'You\u2019ve been signed out. Sign in again, then set the password.';
    }
  }
  if (stage === 'google') {
    // V140. What comes back from the Google window is the redirect's error_code
    // (or `error`) and error_description; the library's own errors carry code.
    const both = code + ' ' + msg;
    if (/signup_disabled|signups? not allowed/i.test(both)) {
      // 3A: sign-ups stay off, so a Google account no PATGo account knows is refused.
      return 'There\u2019s no PATGo account for that Google account. Sign in with your email and password, then use Connect Google on this page.';
    }
    if (/identity_already_exists|already linked|already.*another user/i.test(both)) {
      return 'That Google account is already connected to a different PATGo account.';
    }
    if (/manual_linking_disabled|manual linking/i.test(both)) {
      return 'Connecting Google isn\u2019t switched on for the cloud yet.';
    }
    if (/provider_disabled|provider is not enabled|unsupported provider/i.test(both)) {
      return 'Google sign-in isn\u2019t switched on for the cloud yet.';
    }
    if (/single_identity_not_deletable/i.test(both)) {
      return 'Google can\u2019t be disconnected \u2014 it\u2019s the only way into this account.';
    }
    if (/access_denied|cancel/i.test(both)) return 'Google sign-in was cancelled.';
    if (err && err.name === 'AuthSessionMissingError') return 'You\u2019ve been signed out. Sign in again, then try Google.';
  }
  if (stage === 'send' && (code === 'otp_disabled' || /signups? not allowed/i.test(msg))) {
    // V144: sign-in never makes an account (1A) — point at the Create card.
    return 'There\u2019s no PATGo account for that email. Check the spelling, or tap Create an account.';
  }
  if (stage === 'signup') {
    // V144: the dashboard's "Allow new users to sign up" is off.
    if (code === 'signup_disabled' || code === 'otp_disabled' || /signups? not allowed/i.test(msg)) {
      return 'New accounts can\u2019t be made just yet. Please try again later.';
    }
    if (code === 'email_address_invalid' || /email address.*invalid|invalid.*email/i.test(msg)) {
      return 'That email address wasn\u2019t accepted. Check it and try again.';
    }
  }
  if (stage === 'verify' && (code === 'otp_expired' || /expired|invalid/i.test(msg))) {
    return 'That code didn\u2019t work \u2014 it may have expired. Use the newest email, or send a new code.';
  }
  return 'Something went wrong' + (msg ? ': ' + msg : '.');
}

// ---- actions (dispatch.js) ---------------------------------------------------
function cloudSendCode() {
  if (!cloudAvailable() || state.cloud.busy) return Promise.resolve(false);
  const typed = _cloudInputValue('cloud-email').trim().toLowerCase();
  const email = typed || state.cloud.email || '';
  const create = !!state.cloud.signup;   // V144: only the Create card makes an account
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    _cloudSet({ email, message: create ? 'Enter your email address.' : 'Enter the email address your account was set up with.' });
    render();
    return Promise.resolve(false);
  }
  if (_cloudOffline()) {
    _cloudSet({ email, message: 'You need a signal to sign in. Everything else works offline as normal.' });
    render();
    return Promise.resolve(false);
  }
  _cloudSet({ email, busy: true, message: '' });
  render();
  return cloudClient()
    .then((c) => c.auth.signInWithOtp({ email, options: cloudCodeOptions(create) }))
    .then((res) => {
      if (res && res.error) {
        _cloudSet({ busy: false, message: cloudErrorMessage(res.error, create ? 'signup' : 'send') });
        return false;
      }
      _cloudSet({ busy: false, status: 'code-sent',
        message: 'Code sent to ' + email + '. It can take a minute to arrive.' });
      return true;
    })
    .catch((e) => { _cloudSet({ busy: false, message: cloudErrorMessage(e, create ? 'signup' : 'send') }); return false; })
    .then((ok) => { _cloudRepaint(); return ok; });
}

// V144: what the emailed-code request asks for. Signing in: never make an
// account. Creating (1A): make one, and (4A) record when the Terms and Privacy
// Policy were agreed — Supabase keeps `data` on the account it MAKES (user
// metadata) and ignores it for an address that already has one. The phone's
// clock, so a date, not proof of time; the account's own created_at is the
// server's. Google can't carry it (no `data` on that route) — residual.
function cloudCodeOptions(create) {
  if (!create) return { shouldCreateUser: false };
  return { shouldCreateUser: true, data: { terms_accepted_at: new Date().toISOString() } };
}

// V144: was this account made just now? Both times are the SERVER's, so the
// phone's clock can't fool it: an address confirmed within moments of this
// sign-in is a new account (an emailed code confirms a new address as it signs
// it in; Google confirms it as it makes it). An account that already existed was
// confirmed long before. One that was started and never finished (code never
// entered) is confirmed now — and rightly counts as new: it has no password yet.
function cloudIsNewAccount(user) {
  if (!user || typeof user !== 'object') return false;
  const cut = (v) => Date.parse(String(v || '').replace(/(\.\d{3})\d+/, '$1'));   // Safari: ms only
  const conf = cut(user.email_confirmed_at || user.confirmed_at);
  const last = cut(user.last_sign_in_at);
  if (!isFinite(conf) || !isFinite(last)) return false;
  return Math.abs(last - conf) <= CLOUD_NEW_ACCOUNT_MS;
}

function cloudVerifyCode() {
  if (!cloudAvailable() || state.cloud.busy || state.cloud.status !== 'code-sent') return Promise.resolve(false);
  const token = _cloudInputValue('cloud-code').replace(/\D/g, '');
  if (token.length < 6 || token.length > 10) {
    _cloudSet({ message: 'Enter the code from the email \u2014 numbers only.' });
    render();
    return Promise.resolve(false);
  }
  if (_cloudOffline()) {
    _cloudSet({ message: 'You need a signal to sign in. Everything else works offline as normal.' });
    render();
    return Promise.resolve(false);
  }
  const email = state.cloud.email;
  _cloudSet({ busy: true, message: '' });
  render();
  return cloudClient()
    .then((c) => c.auth.verifyOtp({ email, token, type: 'email' }))
    .then((res) => {
      if (res && res.error) {
        _cloudSet({ busy: false, message: cloudErrorMessage(res.error, 'verify') });
        return false;
      }
      const forgot = !!state.cloud.forgot;
      const creating = !!state.cloud.signup;   // V144
      const user = res && res.data && res.data.user;
      const stands = _cloudSignedIn(user, email);
      // V139 (2A): signed in by "Forgot password?" — straight to choosing a new one.
      // V144 (2A): a NEW account isn't finished until it has a password — the
      // card has no Cancel. An address that already had an account just signs
      // in: nobody's password is replaced from the Create card.
      const after = {};
      if (forgot) Object.assign(after, { pwOpen: true, pwReset: true });
      if (creating) {
        if (cloudIsNewAccount(user)) Object.assign(after, { pwOpen: true, pwReset: false, pwNew: true, welcome: 'due' });
        else after.welcome = 'had';   // said after the plan read (it clears the line)
      }
      // V145: a takeover being asked carries them through its reload (cloudHandoverGo).
      if (stands) _cloudSet(after);
      else if (state.cloud.handover) state.cloud.handover.after = after;
      return true;
    })
    .catch((e) => { _cloudSet({ busy: false, message: cloudErrorMessage(e, 'verify') }); return false; })
    .then(_cloudAfterSignIn);
}

// V139: the one place a sign-in lands, by code or by password — both routes must
// do exactly the same afterwards, so they share it rather than keep two copies
// in step. The address shown is the one the server returned, falling back to
// the one typed.
function _cloudSignedIn(user, email) {
  _cloudSet({ busy: false, status: 'signed-in', email: (user && user.email) || email,
    message: '', plan: null, trialEndsAt: null, checkedAt: null, forgot: false, useCode: false,
    google: _cloudGoogleEmail(user), googlePending: '', googleOff: false,   // V140
    signup: false, pwNew: false, welcome: '', handover: null });          // V144, V145
  _cloudRememberUnlock();   // v85 2A
  return _cloudOwnerLanding(user, email);   // V145: true = the sign-in stands
}

function _cloudAfterSignIn(ok) {
  _cloudRepaint();
  // V145: refused (1A) or being asked (2A) — no profile read, no sync, no welcome.
  if (state.cloud.status !== 'signed-in' || state.cloud.handover) return ok;
  // Prove the round trip straight away: read our own profile row. v80: then
  // send this phone's jobs (sync.js; optional, so guarded). v81: and read
  // the account's jobs back — signing in on a second phone is the moment
  // there is most to fetch, so this trigger pulls as well as pushes.
  if (ok) {
    return cloudCheckConnection().then(() => {
      if (typeof syncPushSoon === 'function') { try { syncPushSoon(0, { pull: true }); } catch (e) { console.error(e); } }
      cloudMaybeWelcome();   // V144 (6A): a Google-made account — the plan has just been read (or 'had': the line)
      return ok;
    });
  }
  return ok;
}

// ---- V144: Create an account (spec 1A 2A 3A 4A 5A) ------------------------------
// The Create card is the sign-in card's twin: the same email box (whatever is
// typed carries over), the same code step, the same landing. state.cloud.signup
// is what makes the code request create (cloudCodeOptions) and the code step
// finish with "Choose a password".
function cloudSignupOpen() {
  if (state.cloud.busy) return;
  const typed = _cloudInputValue('cloud-email').trim().toLowerCase();
  _cloudSet({ signup: true, useCode: false, forgot: false, message: '', email: typed || state.cloud.email || '' });
  render();
}
function cloudSignupClose() {
  if (state.cloud.busy) return;
  const typed = _cloudInputValue('cloud-email').trim().toLowerCase();
  _cloudSet({ signup: false, forgot: false, message: '', status: state.cloud.status === 'code-sent' ? 'signed-out' : state.cloud.status,
    email: typed || state.cloud.email || '' });
  render();
}
function cloudSignupSend() {
  if (!state.cloud.signup) return Promise.resolve(false);
  _cloudSet({ forgot: false });
  return cloudSendCode();
}

// 6A: the welcome, once, to an account made just now — after its password is
// saved (email) or once its plan has been read (Google). The sheet and its words
// are plan.js's (planShowWelcome); optional, so guarded (MAP rule 6). Never over
// another sheet or with the password card still to finish.
function cloudMaybeWelcome() {
  const c = state.cloud;
  // An address that already had an account (Create card): one line, no sheet.
  // Said here, after the plan read — cloudCheckConnection clears the line.
  if (c.welcome === 'had' && c.status === 'signed-in' && !c.busy) {
    _cloudSet({ welcome: '', message: 'You already had a PATGo account with that email \u2014 you\u2019re signed in.' });
    _cloudRepaint();
    return false;
  }
  if (c.welcome !== 'due' || c.status !== 'signed-in' || c.pwOpen || c.busy) return false;
  if (typeof planShowWelcome !== 'function') return false;
  try { if (document.querySelector('body > .bulk-sheet, body > .fail-sheet, body > .modal-backdrop')) return false; } catch (e) { /* no DOM */ }
  _cloudSet({ welcome: 'shown' });
  try { const a = document.activeElement; if (a && typeof a.blur === 'function') a.blur(); } catch (e) { /* nothing focused */ }
  try { planShowWelcome(); } catch (e) { console.error(e); }
  return true;
}

// ---- V139: password sign-in (spec 1A–5A, 4B) ------------------------------------
// The rule the dashboard is set to as well (Auth → Email: minimum 8, "letters and
// digits"), checked here first so a refusal reads plainly before any request.
// Only on CHOOSING a password — signing in never judges one (an older, weaker
// password still signs in; the server decides). ASCII letters/digits only,
// because those are the sets the server counts. 72 is bcrypt's limit; the
// server refuses longer.
const CLOUD_PASSWORD_HINT = 'Use at least 8 characters, with a letter and a number.';
function cloudPasswordProblem(pw) {
  const p = String(pw || '');
  if (p.length < 8) return 'Use at least 8 characters.';
  if (p.length > 72) return 'Use 72 characters or fewer.';
  if (!/[A-Za-z]/.test(p)) return 'Add at least one letter.';
  if (!/[0-9]/.test(p)) return 'Add at least one number.';
  return '';
}

function cloudPasswordSignIn() {
  if (!cloudAvailable() || state.cloud.busy) return Promise.resolve(false);
  const typed = _cloudInputValue('cloud-email').trim().toLowerCase();
  const email = typed || state.cloud.email || '';
  const password = _cloudInputValue('cloud-password');   // never trimmed, never kept
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    _cloudSet({ email, forgot: false, message: 'Enter the email address your account was set up with.' });
    render();
    return Promise.resolve(false);
  }
  if (!password) {
    _cloudSet({ email, forgot: false, message: 'Enter your password \u2014 or tap Forgot password.' });
    render();
    return Promise.resolve(false);
  }
  if (_cloudOffline()) {
    _cloudSet({ email, message: 'You need a signal to sign in. Everything else works offline as normal.' });
    render();
    return Promise.resolve(false);
  }
  _cloudSet({ email, forgot: false, busy: true, message: '' });
  render();
  return cloudClient()
    .then((c) => c.auth.signInWithPassword({ email, password }))
    .then((res) => {
      if (res && res.error) {
        _cloudSet({ busy: false, message: cloudErrorMessage(res.error, 'password') });
        return false;
      }
      _cloudSignedIn(res && res.data && res.data.user, email);
      return true;
    })
    .catch((e) => { _cloudSet({ busy: false, message: cloudErrorMessage(e, 'password') }); return false; })
    .then(_cloudAfterSignIn);
}

// 2A: Forgot = the emailed-code sign-in, remembered as a reset so the code step
// says so and a successful code opens "Choose a new password".
function cloudForgotPassword() {
  if (!cloudAvailable() || state.cloud.busy) return Promise.resolve(false);
  _cloudSet({ forgot: true });
  return cloudSendCode();
}

// The two sign-in cards share the email box; whatever is typed carries over.
function _cloudSwitchCard(useCode) {
  const typed = _cloudInputValue('cloud-email').trim().toLowerCase();
  _cloudSet({ useCode, forgot: false, message: '', email: typed || state.cloud.email || '' });
  render();
}
function cloudUseCode() { _cloudSwitchCard(true); }
function cloudUsePassword() { _cloudSwitchCard(false); }

// 3A: Account → "Set or change password". 5A: no current password asked.
function cloudPasswordOpen() {
  if (state.cloud.status !== 'signed-in' || state.cloud.busy) return;
  _cloudSet({ pwOpen: true, pwReset: false, message: '' });
  render();
}
function cloudPasswordCancel() {
  if (state.cloud.pwNew) return;   // V144 (2A): a new account's password can't be skipped
  _cloudSet({ pwOpen: false, pwReset: false, message: '' });
  render();
}

function cloudPasswordSave() {
  if (!cloudAvailable() || state.cloud.busy || state.cloud.status !== 'signed-in' || !state.cloud.pwOpen) {
    return Promise.resolve(false);
  }
  const pw = _cloudInputValue('cloud-new-password');
  const again = _cloudInputValue('cloud-new-password2');
  const problem = cloudPasswordProblem(pw) || (pw !== again ? 'The two passwords don\u2019t match. Type it again in both boxes.' : '');
  if (problem) {
    _cloudSet({ message: problem });
    render();
    return Promise.resolve(false);
  }
  if (_cloudOffline()) {
    _cloudSet({ message: 'You need a signal to set a password.' });
    render();
    return Promise.resolve(false);
  }
  _cloudSet({ busy: true, message: '' });
  render();
  return cloudClient()
    .then((c) => c.auth.updateUser({ password: pw }))
    .then((res) => {
      if (res && res.error) {
        _cloudSet({ busy: false, message: cloudErrorMessage(res.error, 'new-password') });
        return false;
      }
      const isNew = !!state.cloud.pwNew;
      _cloudSet({ busy: false, pwOpen: false, pwReset: false, pwNew: false,
        message: isNew ? 'Your account is ready. Next time, sign in with your email and this password.'
                       : 'Password saved. Next time, sign in with your email and this password.' });
      return true;
    })
    .catch((e) => { _cloudSet({ busy: false, message: cloudErrorMessage(e, 'new-password') }); return false; })
    .then((ok) => { _cloudRepaint(); if (ok) cloudMaybeWelcome(); return ok; });
}

// Show / Hide. Flips the boxes in place — a render() would empty them, and a
// password is never held anywhere it could be painted back from.
function cloudPasswordToggle(btn) {
  const ids = ['cloud-password', 'cloud-new-password', 'cloud-new-password2'];
  let showing = false;
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.type = el.type === 'password' ? 'text' : 'password';
    showing = el.type === 'text';
  });
  if (btn) {
    btn.textContent = showing ? 'Hide' : 'Show';
    try { btn.setAttribute('aria-pressed', showing ? 'true' : 'false'); } catch {}
  }
}

// ---- V140: Google — Continue with Google, Connect / Disconnect (spec 1A 2A 3A, 4→A) --
// ⚠ WHY A POP-UP WINDOW, NOT A REDIRECT. Sending the app itself off to Google
// on an iPhone hands Google to Safari, and Safari and the installed home-screen
// app keep SEPARATE storage: Safari would end up signed in, PATGo not. A window
// the app opens itself (window.open) stays inside the home-screen app (Apple,
// WWDC23), so it returns to OUR landing page, signin-done.html, which hands
// what Google sent back to this page and closes. The session is then set HERE,
// in the app's own storage. Nothing arrives in the app's own URL —
// detectSessionInUrl stays false.
//
// ⚠ THE WINDOW MUST OPEN INSIDE THE TAP. iOS blocks a window opened after any
// wait, so _cloudGoogleStart opens a blank one synchronously and only points it
// at Google once the library has given the address.
//
// ⚠ IMPLICIT FLOW ON PURPOSE. The client is the library's default ("implicit"):
// the landing page receives the session in its #fragment and passes it on. The
// PKCE flow would keep a verifier in storage and change how the code and
// password routes run; implicit leaves V139's routes exactly as they were. The
// fragment never reaches a server, the landing page wipes it at once, and the
// hand-over is only accepted from our own origin while a Google tap is waiting.
//
// 4→A (Peter, 21 Oct): a Google address need not match the PATGo email.
// "Connect Google" (signed in) links it with linkIdentity — the Supabase
// dashboard's "Allow manual linking" must be ON. 3A: sign-ups stay off, so a
// Google account no PATGo account knows is refused (signup_disabled). A Google
// address that matches an account's email signs in to it directly.
const CLOUD_GOOGLE_RETURN_PAGE = 'signin-done.html';
const CLOUD_GOOGLE_MSG = 'patgo-google-return';   // the landing page sends this type
let _cloudGoogleWindow = null;
let _cloudGoogleListening = false;

// Where Google comes back to: the landing page beside index.html, wherever this
// copy is served from. Must be in Supabase → Auth → URL Configuration → Redirect URLs.
function cloudGoogleReturnUrl() {
  try { return location.origin + location.pathname.replace(/[^/]*$/, '') + CLOUD_GOOGLE_RETURN_PAGE; }
  catch { return ''; }
}

// The Google address connected to an account (from a user object), or ''.
function _cloudGoogleEmail(user) {
  const ids = user && Array.isArray(user.identities) ? user.identities : [];
  const g = ids.find((i) => i && i.provider === 'google');
  if (!g) return '';
  const d = g.identity_data || {};
  return String(d.email || g.email || 'your Google account');
}

function _cloudGoogleListen() {
  if (_cloudGoogleListening) return;
  _cloudGoogleListening = true;
  try { window.addEventListener('message', _cloudGoogleOnMessage); } catch { /* no window */ }
  // Second route in, for when iOS gives the window no opener to post to. Same
  // origin, same storage — exactly the case where the hand-over can work.
  try {
    if (typeof BroadcastChannel === 'function') {
      const ch = new BroadcastChannel(CLOUD_GOOGLE_MSG);
      ch.onmessage = _cloudGoogleOnMessage;
    }
  } catch { /* fine: postMessage is the main route */ }
}

function _cloudGoogleOnMessage(e) {
  if (!e || !e.data || e.data.type !== CLOUD_GOOGLE_MSG) return;
  try { if (e.origin !== location.origin) return; } catch { return; }
  // cloudGoogleReturn ignores it unless a Google tap is waiting and nothing is
  // in flight — so a Cancelled tap, or the second copy (postMessage AND the
  // channel both deliver), does nothing.
  cloudGoogleReturn(e.data.params);
}

function _cloudGoogleOpenWindow() {
  let w = null;
  try { w = window.open('about:blank', '_blank'); } catch { w = null; }
  if (w) {
    try {
      w.document.title = 'PATGo';
      w.document.body.innerHTML = '<p style="font:16px -apple-system,system-ui,sans-serif;padding:24px">Opening Google…</p>';
    } catch { /* not ours to write to — fine */ }
  }
  return w;
}

function _cloudGoogleCloseWindow() {
  const w = _cloudGoogleWindow;
  _cloudGoogleWindow = null;
  try { if (w && !w.closed) w.close(); } catch {}
}

function _cloudGoogleFinish(message) {
  _cloudGoogleCloseWindow();
  _cloudSet({ busy: false, googlePending: '', message: message || '' });
  _cloudRepaint();
}

function cloudGoogleSignIn() { return _cloudGoogleStart('signin'); }
function cloudGoogleConnect() { return _cloudGoogleStart('link'); }

function _cloudGoogleStart(kind) {
  if (!cloudAvailable() || state.cloud.busy || state.cloud.googlePending) return Promise.resolve(false);
  const signedIn = state.cloud.status === 'signed-in';
  if (kind === 'link' ? !signedIn : signedIn) return Promise.resolve(false);
  if (_cloudOffline()) {
    _cloudSet({ message: 'You need a signal to use Google. Everything else works offline as normal.' });
    render();
    return Promise.resolve(false);
  }
  const w = _cloudGoogleOpenWindow();   // ⚠ synchronously, inside the tap
  if (!w) {
    _cloudSet({ message: 'Your phone blocked the Google window. Try again — or sign in with your email and password.' });
    render();
    return Promise.resolve(false);
  }
  _cloudGoogleWindow = w;
  _cloudGoogleListen();
  _cloudSet({ googlePending: kind, googleOff: false, message: '' });
  render();
  const options = { redirectTo: cloudGoogleReturnUrl(), skipBrowserRedirect: true,
                    queryParams: { prompt: 'select_account' } };   // always let them pick the account
  return cloudClient()
    .then((c) => (kind === 'link'
      ? c.auth.linkIdentity({ provider: 'google', options })
      : c.auth.signInWithOAuth({ provider: 'google', options })))
    .then((res) => {
      const url = res && res.data && res.data.url;
      if ((res && res.error) || !url) throw (res && res.error) || new Error('no Google address');
      if (state.cloud.googlePending !== kind) return false;   // Cancelled while we waited
      w.location.href = url;
      return true;
    })
    .catch((e) => { _cloudGoogleFinish(cloudErrorMessage(e, 'google')); return false; });
}

// What the landing page handed back: the session (#access_token, #refresh_token)
// or Google's / Supabase's refusal (error, error_code, error_description).
function cloudGoogleReturn(params) {
  const kind = state.cloud.googlePending;
  if (!cloudAvailable() || !kind || state.cloud.busy) return Promise.resolve(false);
  _cloudGoogleCloseWindow();
  const p = params && typeof params === 'object' ? params : {};
  if (p.error || p.error_code) {
    _cloudGoogleFinish(cloudErrorMessage({ code: String(p.error_code || p.error || ''),
      message: String(p.error_description || '') }, 'google'));
    return Promise.resolve(false);
  }
  if (typeof p.access_token !== 'string' || typeof p.refresh_token !== 'string' || !p.access_token || !p.refresh_token) {
    _cloudGoogleFinish('Google didn’t send a sign-in back. Try again.');
    return Promise.resolve(false);
  }
  _cloudSet({ busy: true, message: '' });
  _cloudRepaint();
  return cloudClient()
    .then((c) => c.auth.setSession({ access_token: p.access_token, refresh_token: p.refresh_token }))
    .then((res) => {
      if (res && res.error) throw res.error;
      const user = res && res.data ? res.data.user : null;
      if (!user) throw new Error('no account came back');
      if (kind === 'link') {
        const google = _cloudGoogleEmail(user);
        _cloudSet({ busy: false, googlePending: '', google,
          message: google ? 'Google connected. Next time, you can sign in with Continue with Google.'
                          : 'Google didn’t connect. Try again.' });
        _cloudRepaint();
        return 'linked';
      }
      const stands = _cloudSignedIn(user, user.email || '');   // the same landing as a code or password
      // V144 (3A): with sign-ups on, a Google login nobody knew has just been
      // made an account. No password is asked for — Google is its way in.
      if (cloudIsNewAccount(user)) {
        if (stands) _cloudSet({ welcome: 'due' });
        else if (state.cloud.handover) state.cloud.handover.after = { welcome: 'due' };   // V145
      }
      return true;
    })
    .catch((e) => { _cloudSet({ busy: false, googlePending: '', message: cloudErrorMessage(e, 'google') }); return false; })
    .then((r) => (r === 'linked' ? true : _cloudAfterSignIn(r)));
}

function cloudGoogleCancel() {
  _cloudGoogleCloseWindow();
  _cloudSet({ googlePending: '', message: '' });
  render();
}

// Disconnect: ask in place (no dialog — banned), then unlink.
function cloudGoogleDisconnectAsk() {
  if (state.cloud.status !== 'signed-in' || state.cloud.busy || !state.cloud.google) return;
  _cloudSet({ googleOff: true, message: '' });
  render();
}
function cloudGoogleDisconnectKeep() {
  _cloudSet({ googleOff: false, message: '' });
  render();
}
function cloudGoogleDisconnect() {
  if (!cloudAvailable() || state.cloud.busy || state.cloud.status !== 'signed-in' || !state.cloud.googleOff) {
    return Promise.resolve(false);
  }
  if (_cloudOffline()) {
    _cloudSet({ message: 'You need a signal to disconnect Google.' });
    render();
    return Promise.resolve(false);
  }
  _cloudSet({ busy: true, message: '' });
  render();
  return cloudClient()
    .then((c) => c.auth.getUserIdentities().then((res) => {
      if (res && res.error) throw res.error;
      const ids = (res && res.data && res.data.identities) || [];
      const g = ids.find((i) => i && i.provider === 'google');
      if (!g) return null;   // already gone elsewhere — the end state is the same
      return c.auth.unlinkIdentity(g).then((r) => {
        if (r && r.error) throw r.error;
        // Refresh, so the stored session (read at boot) no longer lists Google.
        return c.auth.refreshSession().catch(() => null);
      });
    }))
    .then(() => {
      _cloudSet({ busy: false, googleOff: false, google: '',
        message: 'Google disconnected. Sign in with your email and password from now on.' });
      return true;
    })
    .catch((e) => { _cloudSet({ busy: false, message: cloudErrorMessage(e, 'google') }); return false; })
    .then((ok) => { _cloudRepaint(); return ok; });
}

function cloudChangeEmail() {
  // V144: from the Create card's code step this goes back to the Create card
  // (state.cloud.signup is left as it is).
  _cloudSet({ status: 'signed-out', busy: false, message: '', forgot: false });
  render();
}

// Reads the signed-in user's own profile row. This is the end-to-end proof that
// sign-in, the key, and the row-level security policy all agree: RLS allows an
// engineer to read exactly one profile — their own.
function cloudCheckConnection() {
  if (!cloudAvailable() || state.cloud.status !== 'signed-in' || state.cloud.busy) return Promise.resolve(false);
  if (_cloudOffline()) {
    _cloudSet({ message: 'No signal right now. You\u2019re still signed in.' });
    _cloudRepaint();
    return Promise.resolve(false);
  }
  _cloudSet({ busy: true, message: '' });
  _cloudRepaint();
  return cloudClient()
    .then((c) => c.from('profiles').select('*').maybeSingle())   // V143: * — carries lapsed_at once the database has it
    .then((res) => {
      if (res && res.error) {
        _cloudSet({ busy: false, message: cloudErrorMessage(res.error, 'check') });
        return false;
      }
      const row = res ? res.data : null;
      if (!row) {
        _cloudSet({ busy: false, message: 'Signed in, but no profile was found. The database setup may be incomplete.' });
        return false;
      }
      _cloudSet({ busy: false, plan: row.plan || null, trialEndsAt: row.trial_ends_at || null,
        checkedAt: new Date().toISOString(), message: '' });
      // V127: the plan read here (sign-in, Check connection) is the plan.js record.
      try { if (typeof planNote === 'function') planNote(row); } catch (e) { /* optional — rule 6 */ }
      return true;
    })
    .catch((e) => { _cloudSet({ busy: false, message: cloudErrorMessage(e, 'check') }); return false; })
    .then((ok) => { _cloudRepaint(); return ok; });
}

// Everything a sign-out resets (cloudSignOut, and V161's signed out from another
// device), with the line the Account page shows.
function _cloudSignedOutPatch(message) {
  return { status: cloudAvailable() ? 'signed-out' : 'off', busy: false, message,
    plan: null, trialEndsAt: null, checkedAt: null,
    useCode: false, forgot: false, pwOpen: false, pwReset: false,   // V139
    google: '', googlePending: '', googleOff: false,                // V140
    signup: false, pwNew: false, welcome: '',                       // V144
    handover: null, signingOut: false };                            // V145
}

// Local sign-out: works offline. The library call is best-effort; the stored
// keys are removed directly regardless, so a sign-out can never fail to stick.
function cloudSignOut() {
  const finish = () => {
    _cloudSweepLogin();
    _cloudSet(_cloudSignedOutPatch('Signed out.'));
    _cloudGoogleCloseWindow();
    render();
  };
  if (!_cloudClientPromise) { finish(); return Promise.resolve(true); }
  return _cloudClientPromise
    .then((c) => c.auth.signOut({ scope: 'local' }))
    .catch(() => {})
    .then(() => { finish(); return true; });
}

// ---- V145: signing out (4A) and the takeover (2A) ------------------------------
// The Sign out button. One last sync first (online), so the warning only shows for
// what genuinely couldn't go; then, if anything of this account's is still not in
// its cloud, it is said — Stay signed in / Sign out anyway. Signing out anyway
// loses nothing: the jobs stay on this phone under its owner (3A) and send at the
// owner's next sign-in here, and no other account can take the phone until then.
function cloudSignOutAsk() {
  if (!cloudAvailable() || state.cloud.busy || state.cloud.status !== 'signed-in') return Promise.resolve(false);
  const uid = cloudUserId();
  _cloudOwnerRetry();   // V158: a held owner saved before the login goes
  const canSend = !_cloudOffline() && typeof syncPush === 'function' && typeof syncWhenIdle === 'function'
    && typeof syncActive === 'function' && syncActive();
  let send = Promise.resolve();
  if (canSend) {
    _cloudSet({ busy: true, signingOut: true, message: '' });
    _cloudRepaint();
    send = Promise.race([
      syncWhenIdle(() => syncPush({ pull: true })).catch(() => null),
      new Promise((res) => setTimeout(res, CLOUD_SIGNOUT_SYNC_MS)),
    ]);
  }
  return send.then(() => {
    _cloudSet({ busy: false, signingOut: false });
    if (state.cloud.status !== 'signed-in') return false;   // signed out meanwhile (a revoked login)
    const p = _cloudOwnerPending(uid);
    if (p && p.total === 0) return cloudSignOut();
    _cloudRepaint();
    cloudSignOutWarn(p);
    return false;
  });
}

function cloudSignOutWarn(p) {
  const who = state.cloud.email || cloudOwnerName();
  const w = p ? cloudPendingWords(p) : { what: 'Some changes', have: 'haven’t' };
  const words = `${w.what} ${w.have} been sent to ${who}’s cloud yet. If you sign out they stay safely ` +
    `on this phone and send next time you sign in as ${who}. Until then, no other account can sign in on this phone.`;
  if (typeof openChoiceSheet !== 'function') return false;
  try { const a = document.activeElement; if (a && typeof a.blur === 'function') a.blur(); } catch (e) { /* nothing focused */ }
  openChoiceSheet({
    title: 'Not everything has reached the cloud',
    message: words,
    noCancel: true,   // × and the backdrop = Stay signed in
    choices: [
      { label: 'Stay signed in', style: 'primary', onPick: () => {} },
      { label: 'Sign out anyway', style: 'danger', onPick: () => { cloudSignOut(); } },
    ],
  });
  return true;
}

// 2A, "Use this account here". The owner's work was all in its cloud when asked —
// counted again now, because the phone was usable meanwhile (a job logged since
// would otherwise go with the wipe). Then reset.js's handover: everything that
// follows the account comes off the phone (5A), this phone's own preferences stay,
// the new account becomes the owner, and the app restarts clean for it.
function cloudHandoverGo() {
  const h = state.cloud.handover;
  if (!h || state.cloud.status !== 'signed-in' || state.cloud.busy) return Promise.resolve(false);
  if (typeof resetHandover !== 'function') return cloudHandoverCancel();   // reset.js missing: the phone stays
  const o = cloudOwner();
  const p = o ? _cloudOwnerPending(o.id) : { total: 0 };
  if (!p || p.total > 0) {
    // Something of the owner's is unsent after all: refused, in words (1A).
    _cloudSet({ handover: null });
    _cloudOwnerLanding({ id: h.id, email: h.email }, h.email);
    render();
    return Promise.resolve(false);
  }
  _cloudSet({ busy: true, message: '' });
  render();
  return resetHandover({ id: h.id, email: h.email }, h.after || null);
}

// 2A, Cancel: the phone stays its owner's; the account that asked is signed out.
function cloudHandoverCancel() {
  if (!state.cloud.handover) return Promise.resolve(false);
  const who = cloudOwnerName();
  return cloudSignOut().then(() => {
    _cloudSet({ message: `Signed out. This phone stays ${who}’s.` });
    render();
    return true;
  });
}

// After a takeover's restart (boot): what the new account was in the middle of —
// a new account's password card (V144 2A), its welcome — carried through the
// reload by reset.js, for this account only.
function cloudHandoverLanded(carry) {
  if (!carry || typeof carry !== 'object' || state.cloud.status !== 'signed-in') return false;
  if (carry.id !== cloudUserId()) return false;
  const a = carry.after || {};
  const patch = {};
  if (a.pwOpen) Object.assign(patch, { pwOpen: true, pwReset: !!a.pwReset, pwNew: !!a.pwNew });
  if (a.welcome === 'due' || a.welcome === 'had') patch.welcome = a.welcome;
  patch.message = `Signed in as ${state.cloud.email || carry.email || 'your account'}. Your jobs and setup are coming down from the cloud.`;
  _cloudSet(patch);
  state.view = 'cloudAccount';
  // The plan read the sign-in would have made, then the welcome (after it, as V144).
  if (!_cloudOffline()) {
    Promise.resolve().then(() => cloudCheckConnection()).then(() => cloudMaybeWelcome()).catch(() => {});
  }
  return true;
}

// ---- v85: the access code in front of the Cloud group (decisions 1A/2A) -------
// A curtain, not a lock — see CLOUD_UNLOCK_KEY in config.js for why that is
// acceptable. Open when: this copy has a cloud AND (signed in now, OR the code
// was entered / an account signed in on this phone before). Signing out does NOT
// close it again (2A). With no cloud it is always closed, so the group is never
// shown (render-settings.js settingsCategoryVisible).
function cloudPagesUnlocked() {
  if (!cloudAvailable()) return false;
  if (state.cloud && state.cloud.status === 'signed-in') return true;
  if (cloudWallOn()) return true;   // V148 (5A): where an account is required there is no curtain
  try { return localStorage.getItem(CLOUD_UNLOCK_KEY) === '1'; } catch { return false; }
}

function _cloudRememberUnlock() {
  try { localStorage.setItem(CLOUD_UNLOCK_KEY, '1'); } catch { /* private mode: asks again next time */ }
}

// The Unlock button on the code box. Runs from a tap, so render() is safe here
// (the same shape as cloudSendCode's validation messages). Digits only, so a
// phone keyboard's stray space or a pasted "1111 " still counts.
function cloudUnlock() {
  if (!cloudAvailable()) return false;
  const typed = _cloudInputValue('cloud-access-code').replace(/\D/g, '');
  if (typed !== CLOUD_ACCESS_CODE) {
    state.cloudCodeMessage = typed ? "That code isn't right." : 'Enter the access code.';
    render();
    return false;
  }
  _cloudRememberUnlock();
  state.cloudCodeMessage = '';
  render();
  return true;
}

// ---- V148: the launch switch (spec 1A 2A 3A 4A 5A) ------------------------------
// THE RULE (Peter's, 22 Oct): no lack of signal may ever sign an engineer out or
// stop them working. So the wall is decided ONLY from what this phone holds —
// never a network answer — and it is only ever for a phone with NO owner (V145).
// A phone with an owner works on whatever its login does: lapsed, revoked,
// signed out, no signal. Where the wall is on, that phone's plan follows its
// owner instead (plan.js planRecord, 4A), so signing out gets round nothing.
//   • cloudWallOn    — this copy needs an account: the environment says so
//                      (REQUIRE_ACCOUNT, config.js — the product only) or this
//                      phone opened ?wall (1A). No cloud = never.
//   • cloudWallShows — the wall is up now: no owner and nobody signed in, or a
//                      brand-new account still choosing its password (V144 2A
//                      can't be skipped, so it finishes on the wall).
// Everything here fails OPEN: a throw means no wall.
function _cloudWallTest() {
  try { return localStorage.getItem(WALL_TEST_KEY) === '1'; } catch (e) { return false; }
}

// 1A: ?wall turns the test wall on for this phone, ?wall=off (or 0 / no) turns
// it off. Anything else in the address is left alone. Returns true / false when
// the address said, null when it didn't.
function cloudWallTestFromUrl(search) {
  let q = '';
  try { q = String(search != null ? search : ((typeof location !== 'undefined' && location && location.search) || '')); } catch (e) { q = ''; }
  const m = q.match(/[?&]wall(?:=([^&#]*))?(?=&|#|$)/);
  if (!m) return null;
  const off = /^(off|0|no|false)$/i.test(decodeURIComponent(m[1] || ''));
  try {
    if (off) localStorage.removeItem(WALL_TEST_KEY);
    else localStorage.setItem(WALL_TEST_KEY, '1');
  } catch (e) { /* private mode: the wall just doesn't stick */ }
  return !off;
}

function cloudWallOn() {
  try {
    if (!cloudAvailable()) return false;
    const envOn = typeof REQUIRE_ACCOUNT === 'object' && REQUIRE_ACCOUNT !== null
      && REQUIRE_ACCOUNT[CLOUD_ENV] === true;
    return envOn || _cloudWallTest();
  } catch (e) { return false; }
}

function cloudWallShows() {
  try {
    if (!cloudWallOn()) return false;
    const c = state.cloud || {};
    if (c.status === 'signed-in') return !!(c.pwOpen && c.pwNew);
    if (cloudOwner()) return false;
    // V162: never over jobs no account may take — the phone HAD an owner nobody
    // can name, or this run refused to adopt them. The wall's way in is a
    // sign-in that would be refused, so it would lock the engineer out of their
    // own work (Peter's rule, 22 Oct). They work on, signed out, told why.
    if (cloudOwnerHeld()) return false;
    return true;
  } catch (e) { return false; }
}

// 4A: a phone that has an owner, where the wall is on, with nobody signed in —
// it keeps working (never walled) and is asked to sign in again.
function cloudSignedOutOwner() {
  try {
    return cloudWallOn() && !!cloudOwner() && !!state.cloud && state.cloud.status !== 'signed-in';
  } catch (e) { return false; }
}

// 4A: the Jobs list line for that phone (render-core.js renderSessions). The
// plan line, when there is one, comes first and carries the Sign in button
// itself (plan.js) — so this shows only when that has nothing to say.
function cloudSignedOutBannerHTML() {
  if (!cloudSignedOutOwner()) return '';
  return `
    <div class="backup-banner" id="signed-out-banner">
      <div class="backup-banner-body">
        <div class="backup-banner-text" id="signed-out-banner-text">${icon('cloud')} Signed out &mdash; sign in to send your jobs to the cloud. Everything still works on this phone.</div>
        <div class="backup-banner-actions">
          <button class="backup-banner-action primary" id="signed-out-sign-in" data-action="settings-page" data-arg="cloudAccount">Sign in</button>
        </div>
      </div>
    </div>
  `;
}

// 2A: the wall's two buttons. The cards themselves are V144's (render-help.js),
// so the wall and the Account page can never drift apart.
function cloudWallCreate() {
  if (state.cloud.busy) return;
  state.wallStage = 'cards';
  _cloudSet({ signup: true, useCode: false, forgot: false, message: '' });
  render();
}
function cloudWallSignIn() {
  if (state.cloud.busy) return;
  state.wallStage = 'cards';
  _cloudSet({ signup: false, useCode: false, forgot: false, message: '' });
  render();
}
function cloudWallBack() {
  if (state.cloud.busy) return;
  state.wallStage = 'start';
  _cloudSet({ signup: false, useCode: false, forgot: false, message: '',
    status: state.cloud.status === 'code-sent' ? 'signed-out' : state.cloud.status });
  render();
}

// ---- render helpers (render-core / render-help / render-settings) ------------
// The TEST marker (decision 3A): shown ONLY while signed in to the test cloud,
// so free users on the same URL who never sign in never see it.
function cloudIsTestSignedIn() {
  return typeof CLOUD_ENV !== 'undefined' && CLOUD_ENV === 'test'
      && state.cloud && state.cloud.status === 'signed-in';
}

function cloudTestStripHTML() {
  return cloudIsTestSignedIn()
    ? '<div class="cloud-test-strip" id="cloud-test-strip" role="note">TEST &middot; signed in to the cloud test</div>'
    : '';
}

function cloudVersionTag() {
  return cloudIsTestSignedIn() ? ' TEST' : '';
}
