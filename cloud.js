/*!
 * PATGo PWA — cloud.js (cloud sign-in)
 * v80 (September 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 *
 * Email-code sign-in to the cloud project chosen by config.js (CLOUD_ENV /
 * CLOUD). This file is SIGN-IN ONLY. Sending data is sync.js's job (V80: jobs,
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
    return { email, id };
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
    return 'Too many codes requested. Wait a few minutes, then try again.';
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
      const user = res && res.data && res.data.user;
      _cloudSet({ busy: false, status: 'signed-in', email: (user && user.email) || email,
        message: '', plan: null, trialEndsAt: null, checkedAt: null });
      return true;
    })
    .catch((e) => { _cloudSet({ busy: false, message: cloudErrorMessage(e, 'verify') }); return false; })
    .then((ok) => {
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
    });
}

function cloudChangeEmail() {
  _cloudSet({ status: 'signed-out', busy: false, message: '' });
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
      plan: null, trialEndsAt: null, checkedAt: null });
    render();
  };
  if (!_cloudClientPromise) { finish(); return Promise.resolve(true); }
  return _cloudClientPromise
    .then((c) => c.auth.signOut({ scope: 'local' }))
    .catch(() => {})
    .then(() => { finish(); return true; });
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
