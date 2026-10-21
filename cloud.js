/*!
 * PATGo PWA — cloud.js (cloud sign-in)
 * v85 (September 2026) · V139 (October 2026): password sign-in · V140: Google
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
 * WHY shouldCreateUser: false. The test deploy is the public GitHub Pages URL
 * that free users already have. Only accounts created by hand in the Supabase
 * dashboard can sign in; nobody can create one from the app. Flip this when
 * sign-up is meant to be open (commercial launch, REQUIRE_ACCOUNT).
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
  })).catch((e) => {
    _cloudClientPromise = null;    // allow a retry (e.g. first load was offline)
    throw e;
  });
  return _cloudClientPromise;
}

// ---- boot --------------------------------------------------------------------
// Synchronous part first (no network, no library). Then, ONLY if someone is
// signed in and the phone is online, a background check that the session is
// still good — a revoked session signs out; a network failure changes nothing.
function cloudBoot() {
  if (!cloudAvailable()) { state.cloud.status = 'off'; return; }
  _cloudGoogleListen();   // V140: ready for the Google window's answer (no network)
  const stored = _cloudReadStoredSession();
  if (!stored) { state.cloud.status = 'signed-out'; return; }
  state.cloud.status = 'signed-in';
  state.cloud.email = stored.email;
  state.cloud.google = stored.google;   // V140: the connected Google address, or ''
  _cloudRememberUnlock();   // v85 2A: a signed-in phone never asks for the code
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
    return 'That email isn\u2019t set up for the cloud test. Accounts are added by hand for now.';
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    _cloudSet({ email, message: 'Enter the email address your account was set up with.' });
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
    .then((c) => c.auth.signInWithOtp({ email, options: { shouldCreateUser: false } }))
    .then((res) => {
      if (res && res.error) {
        _cloudSet({ busy: false, message: cloudErrorMessage(res.error, 'send') });
        return false;
      }
      _cloudSet({ busy: false, status: 'code-sent',
        message: 'Code sent to ' + email + '. It can take a minute to arrive.' });
      return true;
    })
    .catch((e) => { _cloudSet({ busy: false, message: cloudErrorMessage(e, 'send') }); return false; })
    .then((ok) => { _cloudRepaint(); return ok; });
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
      _cloudSignedIn(res && res.data && res.data.user, email);
      // V139 (2A): signed in by "Forgot password?" — straight to choosing a new one.
      if (forgot) _cloudSet({ pwOpen: true, pwReset: true });
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
    google: _cloudGoogleEmail(user), googlePending: '', googleOff: false });   // V140
  _cloudRememberUnlock();   // v85 2A
}

function _cloudAfterSignIn(ok) {
  _cloudRepaint();
  // Prove the round trip straight away: read our own profile row. v80: then
  // send this phone's jobs (sync.js; optional, so guarded). v81: and read
  // the account's jobs back — signing in on a second phone is the moment
  // there is most to fetch, so this trigger pulls as well as pushes.
  if (ok) {
    return cloudCheckConnection().then(() => {
      if (typeof syncPushSoon === 'function') { try { syncPushSoon(0, { pull: true }); } catch (e) { console.error(e); } }
      return ok;
    });
  }
  return ok;
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
      _cloudSet({ busy: false, pwOpen: false, pwReset: false,
        message: 'Password saved. Next time, sign in with your email and this password.' });
      return true;
    })
    .catch((e) => { _cloudSet({ busy: false, message: cloudErrorMessage(e, 'new-password') }); return false; })
    .then((ok) => { _cloudRepaint(); return ok; });
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
      _cloudSignedIn(user, user.email || '');   // the same landing as a code or password
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
    .then((c) => c.from('profiles').select('plan, trial_ends_at').maybeSingle())
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

// Local sign-out: works offline. The library call is best-effort; the stored
// keys are removed directly regardless, so a sign-out can never fail to stick.
function cloudSignOut() {
  const finish = () => {
    try {
      const doomed = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(CLOUD_AUTH_STORAGE_KEY) === 0) doomed.push(k);
      }
      doomed.forEach((k) => localStorage.removeItem(k));
    } catch {}
    _cloudSet({ status: cloudAvailable() ? 'signed-out' : 'off', busy: false, message: 'Signed out.',
      plan: null, trialEndsAt: null, checkedAt: null,
      useCode: false, forgot: false, pwOpen: false, pwReset: false,   // V139
      google: '', googlePending: '', googleOff: false });             // V140
    _cloudGoogleCloseWindow();
    render();
  };
  if (!_cloudClientPromise) { finish(); return Promise.resolve(true); }
  return _cloudClientPromise
    .then((c) => c.auth.signOut({ scope: 'local' }))
    .catch(() => {})
    .then(() => { finish(); return true; });
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
