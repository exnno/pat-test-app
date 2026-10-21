/* Standing test — V140: Google sign-in, Connect / Disconnect Google
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Stage 13's second sign-in item, B (Peter 21 Oct: 1A
   2A 3A 4→A, 5 dropped). 1A PATGo opens its OWN window and Supabase talks to
   Google — no Google script in the app. A redirect would hand Google to
   Safari, whose storage is separate from the installed app; a window the app
   opens stays inside it. 2A "Continue with Google" heads the sign-in card.
   3A sign-ups stay off: a Google account no PATGo account knows is refused.
   4→A (Peter's main account is a Yahoo address): signed in, "Connect Google"
   links a Google login of any address (linkIdentity), shown with "Disconnect
   Google". The window comes back to signin-done.html, which hands the session
   (or the refusal) to the app and closes. Implicit flow (the library's
   default), so V139's code and password routes run exactly as before.

     79a  the cards: Continue with Google on top (a plain button, not the
          form's submit), the "or" rule; signed in: Connect Google, or the
          address + Disconnect Google; Disconnect asked in place; the waiting
          cards; the connected address read from the stored session at boot.
     79b  the REAL library: the window opens INSIDE the tap, then points at the
          TEST project's /authorize for Google (implicit — no PKCE), returning
          to signin-done.html, always picking the account; the hand-over signs
          in exactly as a password does; a second copy is ignored. And the
          landing page itself: only the sign-in keys passed, to our own origin
          only, the address wiped, the window closed.
     79c  refusals and safety: another origin, nothing waiting, Cancelled —
          all ignored; no account (3A), already connected elsewhere, linking
          switched off, cancelled, nothing sent back, the server refusing the
          session; a blocked window; no signal; too many tries.
     79d  Connect / Disconnect (4→A): linkIdentity with the session, the
          Google address shown under the Yahoo account; Disconnect asks, Keep
          it keeps; Disconnect unlinks, refreshes (so the next boot agrees);
          signing out forgets it.
     79e  release: V140 … — retired at V141; its lasting checks are 80e.

   How it LOOKS — the cards, the "or" rule, both themes — was checked in
   Chromium at 390×844 dark and 375×667 light (Playwright, not committed).
   Whether Google accepts the window inside the installed iPhone app can only
   be seen on a phone (BACKLOG V140 residuals). */

'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { tick, freshApp } = require('../fixture');

const LIB  = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;

const ORIGIN  = 'https://exnno.github.io';
const RETURN  = 'https://exnno.github.io/pat-test-app/signin-done.html';
const GOOGLE_URL = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=ZZCLIENT&state=ZZSTATE';
const REFRESH = 'ZZREFRESH140';
const GID = '33333333-3333-3333-3333-333333333333';
const YAHOO = { id: '22222222-2222-2222-2222-222222222222', email: 'peter@yahoo.co.uk',
  aud: 'authenticated', role: 'authenticated',
  identities: [{ identity_id: '44444444-4444-4444-4444-444444444444', provider: 'email',
                 identity_data: { email: 'peter@yahoo.co.uk' } }] };
const GOOGLE_IDENTITY = { identity_id: GID, id: '1122334455', provider: 'google',
  identity_data: { email: 'peter.birchley@gmail.com', email_verified: true } };
const withGoogle = (u) => Object.assign({}, u, { identities: u.identities.concat([GOOGLE_IDENTITY]) });

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
// A token the library can read the expiry from (it never checks a signature).
const jwt = (user) => b64u({ alg: 'HS256', typ: 'JWT' }) + '.' +
  b64u({ sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated', role: 'authenticated' }) + '.ZZSIGN';
const session = (user) => ({ access_token: jwt(user), token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: REFRESH, user });

function boot(opts = {}) {
  const app = bootApp(opts);
  app.state = () => app.refresh('state').state;
  app.sandbox.localStorage.setItem('pat:cloudUnlocked', '1');   // as 15: past the access code
  return app;
}
function installLibrary(app, fetchImpl) {
  const sb = app.sandbox;
  for (const k of ['Headers', 'Request', 'Response', 'AbortController', 'TextEncoder',
                   'TextDecoder', 'URLSearchParams', 'URL', 'atob', 'btoa']) sb[k] = globalThis[k];
  if (!sb.crypto) sb.crypto = globalThis.crypto;
  sb.WebSocket = class {};
  sb.fetch = fetchImpl;
  app.run(LIB);
}
// The window PATGo opens. `opened` records each window.open, and what the app
// state was AT THAT MOMENT — the proof it happened inside the tap.
function installWindow(app, { blocked = false } = {}) {
  const opened = [];
  app.sandbox.open = (url, target) => {
    if (blocked) return null;
    const w = { url, target, closed: false, location: { href: url },
      document: { title: '', body: { innerHTML: '' } },
      close() { this.closed = true; } };
    opened.push(w);
    return w;
  };
  return opened;
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// A fake Supabase: records every request; `over` replaces a path's answer.
// `who` is the user /auth/v1/user answers with (it changes as identities do).
function fakeServer(over = {}, who = { user: YAHOO }) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const p = u.split('?')[0].replace(/^https:\/\/[^/]+/, '');
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    // The library's header object can hold values Headers() refuses, so read the
    // one we need by hand — a throw here would look like a dropped signal.
    let auth = '';
    for (const [k, v] of Object.entries(init.headers || {})) if (k.toLowerCase() === 'authorization') auth = String(v);
    calls.push({ url: u, path: p, method, body, auth });
    const key = method + ' ' + p;
    if (over[key]) return over[key](body, u);
    if (over[p]) return over[p](body, u);
    if (p === '/auth/v1/token' && /grant_type=password/.test(u)) return json(session(YAHOO));
    if (p === '/auth/v1/token' && /grant_type=refresh_token/.test(u)) return json(session(who.user));
    if (p === '/auth/v1/user' && method === 'GET') return json(who.user);
    if (p === '/auth/v1/user/identities/authorize') return json({ url: GOOGLE_URL });
    if (p.startsWith('/auth/v1/user/identities/') && method === 'DELETE') {
      // The server forgets that login: /user and a refreshed session stop listing it.
      who.user = Object.assign({}, who.user, { identities: (who.user.identities || []).filter(i => !p.endsWith('/' + i.identity_id)) });
      return json({});
    }
    if (p.startsWith('/rest/v1/profiles')) return json([{ plan: 'trial', trial_ends_at: '2026-11-19T00:00:00Z' }]);
    if (p === '/auth/v1/logout') return new Response(null, { status: 204 });
    return json({ message: 'unexpected ' + u }, 404);
  };
  return { calls, fetchImpl };
}
// A tap as the phone makes it: a click bubbling to #app with the button as target.
function tap(app, action) {
  const el = app.doc.createElement('button');
  el.dataset.action = action;
  app.doc.getElementById('app').dispatchEvent({
    type: 'click', target: el, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
  });
  return el;
}
// What signin-done.html sends, arriving the way the browser delivers it.
function handBack(app, params, origin = ORIGIN) {
  app.sandbox.dispatchEvent({ type: 'message', origin, data: { type: 'patgo-google-return', params } });
}
// Wait for the real library (locks, the session check) — up to 3 s — rather
// than a fixed few ms. An "ignored" check waits the full SETTLE instead, and
// first checks the one thing an accepted hand-over does at once (busy).
async function until(cond, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await tick(10);
  return cond();
}
const SETTLE = 300;
function account(app) {
  app.state().view = 'cloudAccount';
  app.fn('render')();
}
async function signedInWithPassword(app) {
  account(app);
  app.doc.getElementById('cloud-email').value = 'peter@yahoo.co.uk';
  app.doc.getElementById('cloud-password').value = 'patgo2026';
  await app.fn('cloudPasswordSignIn')();
  await until(() => !app.state().cloud.busy);
  await tick(SETTLE);
}
// Run the REAL landing page's script in a window of its own.
function landing(hash, search = '') {
  const page = read('signin-done.html');
  const src = page.slice(page.indexOf('<script>') + 8, page.indexOf('</script>'));
  const posted = [], channel = [], replaced = [], timers = [];
  const el = { textContent: '' };
  const win = {
    location: { hash, search, origin: ORIGIN, pathname: '/pat-test-app/signin-done.html' },
    history: { replaceState(a, b, url) { replaced.push(url); } },
    document: { getElementById: () => el },
    opener: { closed: false, postMessage(msg, target) { posted.push({ msg, target }); } },
    BroadcastChannel: class { postMessage(m) { channel.push(m); } close() {} },
    URLSearchParams,
    closedCalls: 0,
    close() { win.closedCalls++; },
    setTimeout: (fn) => { timers.push(fn); },
  };
  win.window = win;
  vm.runInNewContext(src, win);
  const said = el.textContent;                      // before the timers run
  timers.splice(0).forEach((fn) => fn());
  return { posted, channel, replaced, el, said, win };
}

module.exports = async function () {
  /* ------------------------------------------------------------------ 79a */
  await t.group('79a — the cards: Continue with Google, Connect / Disconnect Google, the waiting cards', async () => {
    const app = boot();
    account(app);
    const page = html(app);
    const g = page.indexOf('id="cloud-google"');
    t.ok(g > -1, 'signed out: Continue with Google');
    t.ok(g < page.indexOf('id="cloud-email"') && g < page.indexOf('id="cloud-password"'), '…at the top of the card, above email and password (2A)');
    t.ok(/<button type="button"[^>]*id="cloud-google" data-action="cloud-google"[^>]*>Continue with Google</.test(page),
      '…a plain button — Go on the keyboard must still mean Sign in, never Google');
    t.includes(page, '<p class="cloud-or" aria-hidden="true"><span>or</span></p>', 'an "or" rule between them');
    t.ok(/<button type="submit"[^>]*id="cloud-password-sign-in"/.test(page), 'Sign in is still the one submit');
    tap(app, 'cloud-use-code');
    t.excludes(html(app), 'id="cloud-google"', 'the code card stays as it was');
    t.eq(app.run('_cloudClientPromise'), null, 'none of this loaded the library');

    // Signed in, nothing connected → Connect Google, between password and Sign out.
    const s = app.state();
    Object.assign(s.cloud, { status: 'signed-in', email: 'peter@yahoo.co.uk', useCode: false });
    account(app);
    let p2 = html(app);
    const c = p2.indexOf('id="cloud-google-connect"');
    t.ok(c > p2.indexOf('id="cloud-password-open"') && c < p2.indexOf('id="cloud-sign-out"'),
      'signed in: Connect Google, after Set or change password, before Sign out');
    t.excludes(p2, 'id="cloud-google-off"', '…and no Disconnect');

    // Connected → the address, and Disconnect Google.
    s.cloud.google = 'peter.<b>@gmail.com';
    account(app);
    p2 = html(app);
    t.includes(p2, 'id="cloud-google-email">Google: <strong>peter.&lt;b&gt;@gmail.com</strong>', 'connected: the Google address (escaped)');
    t.includes(p2, 'data-action="cloud-google-off"', '…with Disconnect Google');
    t.excludes(p2, 'id="cloud-google-connect"', '…and no Connect');

    // Disconnect is asked in place — no dialog.
    tap(app, 'cloud-google-off');
    t.eq(s.cloud.googleOff, true, 'Disconnect Google → asks first');
    p2 = html(app);
    t.includes(p2, 'id="cloud-google-off-note">Disconnect <strong>peter.&lt;b&gt;@gmail.com</strong>?', '…naming the address');
    t.includes(p2, 'data-action="cloud-google-disconnect"', '…Disconnect');
    t.includes(p2, 'data-action="cloud-google-keep"', '…Keep it');
    tap(app, 'cloud-google-keep');
    t.eq(s.cloud.googleOff, false, 'Keep it → back as it was');
    t.eq(s.cloud.google, 'peter.<b>@gmail.com', '…still connected');

    // The waiting cards.
    s.cloud.googlePending = 'link';
    account(app);
    t.includes(html(app), 'Continue in the Google window, then come back here.', 'connecting: says where to look');
    t.includes(html(app), 'data-action="cloud-google-cancel"', '…with Cancel');
    Object.assign(s.cloud, { status: 'signed-out', googlePending: 'signin' });
    account(app);
    const w = html(app);
    t.includes(w, 'id="cloud-google-waiting"', 'signing in: the waiting card');
    t.includes(w, '<h3>Continue in the Google window</h3>', '…says where to look');
    t.excludes(w, 'id="cloud-password"', '…in place of the sign-in card');
    t.includes(w, 'data-action="cloud-google-cancel"', '…with Cancel');

    // At boot the connected address comes from the stored session — no network.
    const stored = boot({ localStorage: { 'patgo:cloudAuth:test': JSON.stringify(session(withGoogle(YAHOO))) },
                          navigator: { onLine: false } });
    t.eq(stored.state().cloud.status, 'signed-in', 'a stored session boots signed in');
    t.eq(stored.state().cloud.google, 'peter.birchley@gmail.com', '…with its Google address, read from storage');
    const plain = boot({ localStorage: { 'patgo:cloudAuth:test': JSON.stringify(session(YAHOO)) }, navigator: { onLine: false } });
    t.eq(plain.state().cloud.google, '', 'no Google identity → none shown');
  });

  /* ------------------------------------------------------------------ 79b */
  await t.group('79b — the REAL library: Continue with Google, the hand-over, and the landing page', async () => {
    const app = boot();
    const srv = fakeServer({}, { user: withGoogle(YAHOO) });
    installLibrary(app, srv.fetchImpl);
    const opened = installWindow(app);
    account(app);
    tap(app, 'cloud-google');
    t.eq(opened.length, 1, 'the tap opened the window — before any wait (iOS blocks a later one)');
    t.eq(opened[0] && opened[0].url, 'about:blank', '…blank at first');
    t.eq(app.state().cloud.googlePending, 'signin', 'waiting for Google');
    t.includes(html(app), 'id="cloud-google-waiting"', '…and the card says so');
    await tick(10);
    const href = String(opened[0].location.href);
    const u = new URL(href);
    t.eq(u.origin + u.pathname, 'https://wawxhlltbddkjkuyfake.supabase.co/auth/v1/authorize', 'then pointed at the TEST project’s /authorize');
    t.eq(u.searchParams.get('provider'), 'google', '…for Google');
    t.eq(u.searchParams.get('redirect_to'), RETURN, '…coming back to signin-done.html beside the app');
    t.eq(u.searchParams.get('prompt'), 'select_account', '…always letting you pick the account');
    t.eq(u.searchParams.get('code_challenge'), null, '…the implicit flow (no PKCE verifier kept)');
    t.notOk(srv.calls.some(c => c.path.startsWith('/auth/v1/user')), 'nothing sent to the server yet');
    app.storage.removeItem('pat:cloudUnlocked');   // the sign-in itself must remember it

    // The landing page hands the session back — twice (postMessage AND the channel).
    const access = jwt(YAHOO);
    handBack(app, { access_token: access, refresh_token: REFRESH, token_type: 'bearer', expires_in: '3600' });
    handBack(app, { access_token: access, refresh_token: REFRESH, token_type: 'bearer', expires_in: '3600' });
    const st = app.state();
    await until(() => st.cloud.status === 'signed-in' && st.cloud.plan === 'trial');
    await tick(SETTLE);
    t.eq(srv.calls.filter(c => c.path === '/auth/v1/user' && c.method === 'GET').length, 1, 'one session check — the second copy ignored');
    t.eq(st.cloud.status, 'signed-in', 'signed in');
    t.eq(st.cloud.email, 'peter@yahoo.co.uk', '…as the PATGo account, whatever Google’s address');
    t.eq(st.cloud.google, 'peter.birchley@gmail.com', '…and Google shown as connected');
    t.eq(st.cloud.googlePending, '', 'no longer waiting');
    t.ok(opened[0].closed, 'the Google window closed');
    t.ok(String(app.storage.getItem('patgo:cloudAuth:test') || '').includes(REFRESH), 'the session kept under OUR key, in the app’s own storage');
    t.ok(srv.calls.some(c => c.path.startsWith('/rest/v1/profiles')), 'followed by the profile read, as any sign-in');
    t.eq(st.cloud.plan, 'trial', 'plan read back');
    t.eq(app.storage.getItem('pat:cloudUnlocked'), '1', 'the Cloud unlock remembered');
    t.includes(html(app), 'id="cloud-test-strip"', 'TEST strip showing');
    t.includes(html(app), 'id="cloud-google-email"', 'the Account page shows the Google address');
    t.includes(read('cloud.js'), 'detectSessionInUrl: false', 'and nothing is ever read from the app’s own address');
    handBack(app, { access_token: access, refresh_token: REFRESH });
    t.eq(st.cloud.busy, false, 'a late copy after signing in: not taken up');
    await tick(SETTLE);
    t.eq(srv.calls.filter(c => c.path === '/auth/v1/user').length, 1, '…and asks the server nothing');

    // The landing page itself.
    const L = landing('#access_token=AAA&refresh_token=RRR&expires_in=3600&token_type=bearer&provider_token=GGG&provider_refresh_token=PPP');
    t.eq(L.posted.length, 1, 'landing page: posts to the app that opened it');
    t.eq(L.posted[0] && L.posted[0].target, ORIGIN, '…to our own origin only, never “*”');
    const sent = L.posted[0] ? L.posted[0].msg : {};
    t.eq(sent.type, 'patgo-google-return', '…as the type the app listens for');
    t.deepEq(Object.keys(sent.params || {}).sort(), ['access_token', 'expires_in', 'refresh_token', 'token_type'], '…passing only the sign-in keys (no Google tokens)');
    t.eq(sent.params.access_token, 'AAA', '…exactly as received');
    t.eq(L.channel.length, 1, '…and on the channel too, for when there is no opener');
    t.deepEq(L.replaced, ['/pat-test-app/signin-done.html'], 'the tokens wiped from the address at once');
    t.ok(L.win.closedCalls >= 1, 'the window closes itself');
    const E = landing('', '?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance');
    t.eq(E.posted[0] && E.posted[0].msg.params.error_code, 'signup_disabled', 'a refusal in the query is passed on too');
    t.includes(E.said, 'Google didn’t finish', 'and the page says it didn’t finish');
    t.includes(L.said, 'going back to PATGo', 'a good one says it’s going back');
    t.includes(L.el.textContent, 'You can close this window', 'and if the window can’t close itself, says what to do');
    t.includes(read('signin-done.html'), '(c) 2026 Peter Birchley. All rights reserved.', 'landing page carries the copyright line');
  });

  /* ------------------------------------------------------------------ 79c */
  await t.group('79c — refusals and safety: wrong origin, nothing waiting, Cancel, the server’s refusals', async () => {
    // Nothing waiting: a hand-over is ignored, no request.
    const idle = boot();
    const isrv = fakeServer();
    installLibrary(idle, isrv.fetchImpl);
    account(idle);
    handBack(idle, { access_token: jwt(YAHOO), refresh_token: REFRESH });
    t.eq(idle.state().cloud.busy, false, 'nothing waiting: a hand-over is not taken up');
    await tick(SETTLE);
    t.eq(idle.state().cloud.status, 'signed-out', '…signs nobody in');
    t.eq(isrv.calls.length, 0, '…and asks the server nothing');

    // Another origin is ignored even while waiting; Cancel then stops listening.
    const app = boot();
    const srv = fakeServer();
    installLibrary(app, srv.fetchImpl);
    const opened = installWindow(app);
    account(app);
    tap(app, 'cloud-google');
    await tick(5);
    handBack(app, { access_token: jwt(YAHOO), refresh_token: REFRESH }, 'https://evil.example');
    t.eq(app.state().cloud.busy, false, 'another origin: not taken up');
    await tick(SETTLE);
    t.eq(app.state().cloud.status, 'signed-out', '…signs nobody in');
    t.notOk(srv.calls.some(c => c.path === '/auth/v1/user'), '…and asks the server nothing');
    t.eq(app.state().cloud.googlePending, 'signin', '…still waiting for the real one');
    tap(app, 'cloud-google-cancel');
    t.eq(app.state().cloud.googlePending, '', 'Cancel stops waiting');
    t.ok(opened[0].closed, '…and closes the window');
    t.includes(html(app), 'id="cloud-password"', '…back to the sign-in card');
    handBack(app, { access_token: jwt(YAHOO), refresh_token: REFRESH });
    t.eq(app.state().cloud.busy, false, 'after Cancel, a late hand-over is not taken up');
    await tick(SETTLE);
    t.eq(app.state().cloud.status, 'signed-out', '…signs nobody in');
    t.notOk(srv.calls.some(c => c.path === '/auth/v1/user'), '…no request');

    // What comes back as a refusal, plainly.
    const refusals = [
      [{ error: 'access_denied', error_code: 'signup_disabled', error_description: 'Signups not allowed for this instance' }, 'no PATGo account for that Google account'],
      [{ error: 'server_error', error_code: 'identity_already_exists', error_description: 'Identity is already linked to another user' }, 'already connected to a different PATGo account'],
      [{ error: 'invalid_request', error_code: 'manual_linking_disabled', error_description: 'Manual linking is disabled' }, 'Connecting Google isn’t switched on'],
      [{ error: 'validation_failed', error_code: 'provider_disabled', error_description: 'Unsupported provider: provider is not enabled' }, 'Google sign-in isn’t switched on'],
      [{ error: 'access_denied', error_description: 'The user cancelled' }, 'was cancelled'],
      [{ token_type: 'bearer' }, 'didn’t send a sign-in back'],
    ];
    for (const [params, says] of refusals) {
      const a = boot();
      const s = fakeServer();
      installLibrary(a, s.fetchImpl);
      const w = installWindow(a);
      account(a);
      tap(a, 'cloud-google');
      await tick(5);
      handBack(a, params);
      await tick(5);
      const tag = params.error_code || params.error || 'no tokens';
      t.includes(a.state().cloud.message, says, `${tag}: “${says}”`);
      t.eq(a.state().cloud.status, 'signed-out', `${tag}: still signed out`);
      t.eq(a.state().cloud.googlePending, '', `${tag}: no longer waiting`);
      t.ok(w[0] && w[0].closed, `${tag}: window closed`);
      t.notOk(s.calls.some(c => c.path === '/auth/v1/user'), `${tag}: no session asked for`);
    }
    t.includes(freshApp().fn('cloudErrorMessage')({ code: 'signup_disabled', message: '' }, 'google'),
      'Sign in with your email and password, then use Connect Google', '3A: says how to get Google working');

    // The server turns the session down.
    const bad = boot();
    const bsrv = fakeServer({ 'GET /auth/v1/user': () => json({ code: 'bad_jwt', msg: 'invalid JWT' }, 401) });
    installLibrary(bad, bsrv.fetchImpl);
    installWindow(bad);
    account(bad);
    tap(bad, 'cloud-google');
    await tick(5);
    handBack(bad, { access_token: jwt(YAHOO), refresh_token: REFRESH });
    t.eq(bad.state().cloud.busy, true, 'the hand-over is taken up');
    await until(() => !bad.state().cloud.busy);
    t.eq(bad.state().cloud.status, 'signed-out', 'server refuses the session: still signed out');
    t.eq(bad.state().cloud.busy, false, '…not stuck busy');
    t.eq(bad.state().cloud.googlePending, '', '…not stuck waiting');
    t.ok(bad.state().cloud.message.length > 0, '…and says something');
    t.eq(bad.storage.getItem('patgo:cloudAuth:test'), null, '…and keeps no session');

    // A blocked window, no signal, too many tries.
    const blocked = boot();
    installWindow(blocked, { blocked: true });
    account(blocked);
    t.notOk(await blocked.fn('cloudGoogleSignIn')(), 'window blocked: false');
    t.includes(blocked.state().cloud.message, 'blocked the Google window', '…says so');
    t.eq(blocked.state().cloud.googlePending, '', '…not left waiting');
    t.eq(blocked.run('_cloudClientPromise'), null, '…library not even loaded');
    const off = boot({ navigator: { onLine: false } });
    const offWin = installWindow(off);
    account(off);
    t.notOk(await off.fn('cloudGoogleSignIn')(), 'offline: false');
    t.includes(off.state().cloud.message, 'need a signal', '…says so');
    t.eq(offWin.length, 0, '…and opens no window');
    t.includes(freshApp().fn('cloudErrorMessage')({ status: 429, message: 'rate limit' }, 'google'), 'Too many tries', 'rate limit: tries, not codes');

    // Each route only where it belongs.
    const si = boot();
    const siWin = installWindow(si);
    Object.assign(si.state().cloud, { status: 'signed-in', email: 'peter@yahoo.co.uk' });
    t.notOk(await si.fn('cloudGoogleSignIn')(), 'signed in: Continue with Google does nothing');
    const so = boot();
    const soWin = installWindow(so);
    account(so);
    t.notOk(await so.fn('cloudGoogleConnect')(), 'signed out: Connect Google does nothing');
    t.eq(siWin.length + soWin.length, 0, '…no window for either');
  });

  /* ------------------------------------------------------------------ 79d */
  await t.group('79d — Connect / Disconnect Google under a different email (4→A)', async () => {
    const who = { user: YAHOO };
    const app = boot();
    const srv = fakeServer({}, who);
    installLibrary(app, srv.fetchImpl);
    const opened = installWindow(app);
    await signedInWithPassword(app);
    const st = app.state();
    t.eq(st.cloud.status, 'signed-in', 'signed in with the Yahoo password');
    t.eq(st.cloud.google, '', '…no Google yet');
    const profiles0 = srv.calls.filter(c => c.path.startsWith('/rest/v1/profiles')).length;

    tap(app, 'cloud-google-connect');
    t.eq(opened.length, 1, 'Connect Google opened the window inside the tap');
    t.eq(st.cloud.googlePending, 'link', '…waiting to connect');
    await tick(10);
    const ask = srv.calls.find(c => c.path === '/auth/v1/user/identities/authorize');
    t.ok(!!ask, 'asked the server for a linking address (linkIdentity)');
    t.ok(ask && /^Bearer /.test(ask.auth), '…as the signed-in account');
    const q = ask ? new URL(ask.url).searchParams : new URLSearchParams();
    t.eq(q.get('provider'), 'google', '…for Google');
    t.eq(q.get('redirect_to'), RETURN, '…coming back to signin-done.html');
    t.eq(q.get('skip_http_redirect'), 'true', '…as an address, not a redirect');
    t.eq(opened[0].location.href, GOOGLE_URL, 'the window pointed at the address it gave');
    t.notOk(srv.calls.some(c => c.path === '/authorize' || c.path === '/auth/v1/authorize'), 'not a sign-in');

    who.user = withGoogle(YAHOO);   // what the server now says about the account
    handBack(app, { access_token: jwt(YAHOO), refresh_token: REFRESH });
    await until(() => !st.cloud.busy && !st.cloud.googlePending);
    await tick(SETTLE);
    t.eq(st.cloud.status, 'signed-in', 'still signed in');
    t.eq(st.cloud.email, 'peter@yahoo.co.uk', '…as the Yahoo account');
    t.eq(st.cloud.google, 'peter.birchley@gmail.com', '…with the Gmail connected');
    t.includes(st.cloud.message, 'Google connected', '…said plainly');
    t.eq(st.cloud.googlePending, '', 'no longer waiting');
    t.ok(opened[0].closed, 'window closed');
    t.eq(srv.calls.filter(c => c.path.startsWith('/rest/v1/profiles')).length, profiles0, 'connecting is not a new sign-in (no second round trip)');
    t.includes(html(app), 'Google: <strong>peter.birchley@gmail.com</strong>', 'the Account page shows it');

    // Disconnect: only after asking.
    t.notOk(await app.fn('cloudGoogleDisconnect')(), 'Disconnect without asking first does nothing');
    t.notOk(srv.calls.some(c => c.method === 'DELETE'), '…no request');
    tap(app, 'cloud-google-off');
    const getsBefore = srv.calls.filter(c => c.path === '/auth/v1/user' && c.method === 'GET').length;
    tap(app, 'cloud-google-disconnect');
    await until(() => !st.cloud.busy);
    t.ok(srv.calls.filter(c => c.path === '/auth/v1/user' && c.method === 'GET').length > getsBefore, 'read the account’s logins');
    const del = srv.calls.find(c => c.method === 'DELETE');
    t.eq(del && del.path, '/auth/v1/user/identities/' + GID, 'unlinked exactly the Google login');
    t.ok(srv.calls.some(c => /grant_type=refresh_token/.test(c.url)), 'then refreshed the session');
    t.eq(st.cloud.google, '', 'Google no longer shown');
    t.eq(st.cloud.googleOff, false, 'the question closes');
    t.includes(st.cloud.message, 'Google disconnected', '…said plainly');
    t.includes(html(app), 'id="cloud-google-connect"', 'Connect Google is back');
    const kept = JSON.parse(app.storage.getItem('patgo:cloudAuth:test') || '{}');
    t.eq(app.fn('_cloudGoogleEmail')(kept.user), '', 'the stored session agrees, so the next boot shows no Google');
    t.eq(st.cloud.status, 'signed-in', 'still signed in throughout');

    // Signing out forgets the connected address on screen.
    st.cloud.google = 'peter.birchley@gmail.com';
    await app.fn('cloudSignOut')();
    t.eq(st.cloud.google, '', 'signing out forgets it');
    t.eq(st.cloud.googlePending, '', '…and anything waiting');
  });

  // 79e retired at V141 → 80e (the release checks move with each release).
};
