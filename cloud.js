/*!
 * PATGo PWA — cloud.js (cloud sign-in)
 * v85 (September 2026) · V139 (October 2026): password sign-in
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 *
 * Sign-in to the cloud project chosen by config.js (CLOUD_ENV / CLOUD): email +
 * password (V139, the everyday route) or a code emailed to you (V79, still there,
 * and how "Forgot password?" works). This file is SIGN-IN ONLY. Sending data is sync.js's job (V80: jobs,
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
    return { email, id, issuedAt };
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
  const stored = _cloudReadStoredSession();
  if (!stored) { state.cloud.status = 'signed-out'; return; }
  state.cloud.status = 'signed-in';
  state.cloud.email = stored.email;
  _cloudRememberUnlock();   // v85 2A: a signed-in phone never asks for the code
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  cloudClient()
    .then((c) => c.auth.getSession())
    .then((res) => {
      const session = res && res.data ? res.data.session : null;
      if (session) {
        if (session.user && session.user.email) state.cloud.email = session.user.email;
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
    if (stage === 'password' || stage === 'new-password') return 'Too many tries. Wait a few minutes, then try again.';
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
    message: '', plan: null, trialEndsAt: null, checkedAt: null, forgot: false, useCode: false });
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
      useCode: false, forgot: false, pwOpen: false, pwReset: false });   // V139
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
