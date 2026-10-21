/* Standing test — V144: sign-up — creating an account from the app
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID (Peter, 21 Oct: 0A 1A 2A 3A 4A 5A, 6A 7A 8A). 0A sign-up
   only — the launch switch (an account required, the curtain out, the free
   site retired) is the next release; 1A Create an account: email → an emailed
   code → choose a password, and SIGN-IN never makes an account; 2A the
   password can't be skipped; 3A with sign-ups on, Continue with Google makes an
   account for a new Google login (accepted — the app can't stop it alone); 4A
   one line agreeing to the Terms and the Privacy Policy, the date kept on the
   account (email route); 5A the access-code curtain stays on the test site;
   6A a welcome sheet once an account is made, saying the trial's end; 7A the
   Account page says the days left from day one; 8A a thank-you sheet once a
   payment is confirmed — or the next time a read says paid.

     83a  the cards: the sign-in card offers Create; the Create card (form,
          Google, the email box, the Terms line from config, the trial words);
          moving between them carries the email; the code step's words.
     83b  the REAL library, by email: the code request creates only from the
          Create card (create_user, the Terms date); a new account → "Choose a
          password" with no way out → saved → ready, and the welcome with the
          server's end date, once; an address that already had an account just
          signs in (no password replaced, no welcome); the refusals in words.
     83c  Google: a new Google login → the welcome after the plan is read (no
          password asked); an old one → nothing; cloudIsNewAccount, pure.
     83d  the days left (pure + the Account line) and the thank-you: owed from
          a paid return, kept through a re-read, shown once on the Subscription
          page or later on the Jobs list, never without a payment or while not
          paid; the monthly / yearly words.
     83e  release: V144, cache, What's new (two lines), About V144 / V143 /
          V142, the new taps wired and guarded; plus 82e's lasting checks (82e
          retired). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { tick, freshApp } = require('../fixture');

const LIB  = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();
const ORIGIN  = 'https://exnno.github.io';
const GOOGLE_URL = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=ZZCLIENT&state=ZZSTATE';
const REFRESH = 'ZZREFRESH144';

// A brand-new account: its address confirmed moments before this sign-in (the
// server's own times, with Postgres's microseconds). An old one: long before.
function newUser(email = 'new@example.com', id = '55555555-5555-5555-5555-555555555555') {
  const now = Date.now();
  return { id, email, aud: 'authenticated', role: 'authenticated',
    created_at: iso(now - 3 * 60000).replace('Z', '123+00:00'),
    email_confirmed_at: iso(now - 20000).replace('Z', '456+00:00'),
    confirmed_at: iso(now - 20000).replace('Z', '456+00:00'),
    last_sign_in_at: iso(now - 19000).replace('Z', '789+00:00'),
    identities: [{ identity_id: 'ii-' + id, provider: 'email', identity_data: { email } }] };
}
function oldUser(email = 'peter@example.com', id = '22222222-2222-2222-2222-222222222222') {
  const now = Date.now();
  return { id, email, aud: 'authenticated', role: 'authenticated',
    created_at: iso(now - 200 * DAY), email_confirmed_at: iso(now - 200 * DAY), confirmed_at: iso(now - 200 * DAY),
    last_sign_in_at: iso(now - 1000),
    identities: [{ identity_id: 'ii-' + id, provider: 'email', identity_data: { email } }] };
}
const withGoogle = (u) => Object.assign({}, u, { identities: [{ identity_id: 'gg-' + u.id, provider: 'google',
  identity_data: { email: u.email, email_verified: true } }] });

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const jwt = (user) => b64u({ alg: 'HS256', typ: 'JWT' }) + '.' +
  b64u({ sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated', role: 'authenticated' }) + '.ZZSIGN';
const session = (user) => ({ access_token: jwt(user), token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: REFRESH, user });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function boot(opts = {}) {
  const app = bootApp(opts);
  app.state = () => app.refresh('state').state;
  app.sandbox.localStorage.setItem('pat:cloudUnlocked', '1');   // past the access code (5A: it stays)
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
// A fake Supabase. who.user is the account the server signs in (verify, the
// Google session check, a password save); `over` replaces a path's answer.
function fakeServer(who, over = {}) {
  const calls = [];
  // Not today + 30 on purpose: a welcome that ignored the server's date would
  // show 30 days, not 28 — so the words prove which date they came from.
  const ends = iso(Date.now() + 28 * DAY + 6 * 3600000);
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const p = u.split('?')[0].replace(/^https:\/\/[^/]+/, '');
    const method = init.method || 'GET';
    let body = null;
    try { body = init.body ? JSON.parse(init.body) : null; } catch { body = init.body; }
    calls.push({ url: u, path: p, method, body });
    if (over[method + ' ' + p]) return over[method + ' ' + p](body, u);
    if (over[p]) return over[p](body, u);
    if (p === '/auth/v1/otp')    return json({});
    if (p === '/auth/v1/verify') return json(session(who.user));
    if (p === '/auth/v1/token' && /grant_type=password/.test(u)) return json(session(who.user));
    if (p === '/auth/v1/token' && /grant_type=refresh_token/.test(u)) return json(session(who.user));
    if (p === '/auth/v1/user' && method === 'PUT') return json(who.user);
    if (p === '/auth/v1/user' && method === 'GET') return json(who.user);
    if (p === '/auth/v1/authorize') return json({ url: GOOGLE_URL });
    if (p.startsWith('/rest/v1/profiles')) return json([{ plan: 'trial', trial_ends_at: ends, lapsed_at: null }]);
    if (p === '/rest/v1/rpc/my_billing') return json(who.billing || { plan: 'trial', trial_ends_at: ends });
    if (p.startsWith('/rest/v1/')) return method === 'GET' ? json([]) : new Response(null, { status: 201 });
    if (p.startsWith('/storage/v1/')) return json([]);
    if (p === '/auth/v1/logout') return new Response(null, { status: 204 });
    return json({ message: 'unexpected ' + u }, 404);
  };
  return { calls, fetchImpl, ends };
}
async function until(cond, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await tick(10);
  return cond();
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
function account(app) {
  app.state().view = 'cloudAccount';
  app.fn('render')();
}
const sheets = (app) => app.doc.body.children.filter(c => c && /bulk-sheet/.test(c.className || ''));
const sheetById = (app, id) => sheets(app).find(s => s.id === id) || null;
function closeSheets(app) {
  app.doc.body.children.slice().forEach(c => { if (c && /bulk-sheet|modal-backdrop/.test(c.className || '')) c.remove(); });
}
function installWindow(app) {
  const opened = [];
  app.sandbox.open = (url, target) => {
    const w = { url, target, closed: false, location: { href: url }, document: { title: '', body: { innerHTML: '' } },
      close() { this.closed = true; } };
    opened.push(w);
    return w;
  };
  return opened;
}
function handBack(app, params) {
  app.sandbox.dispatchEvent({ type: 'message', origin: ORIGIN, data: { type: 'patgo-google-return', params } });
}
const planRec = (o) => JSON.stringify(Object.assign({ uid: '22222222-2222-2222-2222-222222222222', plan: 'trial',
  trialEndsAt: iso(Date.now() + 20 * DAY), lapsedAt: null, lapsedSeenAt: null, serverAt: 0, checkedAt: Date.now(),
  shownEnded: '', shownLastDay: '' }, o));
const stored = (id) => JSON.stringify({ access_token: 'ZZACCESS144', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'ZZREFRESH',
  user: { id, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' } });
const rec = (app) => JSON.parse(app.sandbox.localStorage.getItem('pat:plan') || 'null');

// Create an account by email, through the taps and the real library, up to the
// code step: open the Create card, type the address, tap Create account.
async function createByEmail(app, email) {
  account(app);
  tap(app, 'cloud-signup-open');
  app.doc.getElementById('cloud-email').value = email;
  tap(app, 'cloud-signup-send');
  await until(() => !app.state().cloud.busy);
}
async function enterCode(app) {
  app.doc.getElementById('cloud-code').value = '123456';
  tap(app, 'cloud-verify-code');
  await until(() => app.state().cloud.status === 'signed-in' && !app.state().cloud.busy && app.state().cloud.plan === 'trial');
  await tick(50);
}

module.exports = async function () {
  /* ------------------------------------------------------------------ 83a */
  await t.group('83a — the cards: Create an account offered; the Create card; the code step’s words (1A 4A)', async () => {
    const app = boot();
    account(app);
    const page = html(app);
    t.includes(page, 'id="cloud-signup-offer"', 'the sign-in page offers an account');
    t.ok(/<button type="button" class="btn-primary" id="cloud-signup-open" data-action="cloud-signup-open"[^>]*>Create an account</.test(page),
      '…with a Create an account button (not a submit of the sign-in form)');
    t.includes(page, 'try everything free for 30 days', '…and says the trial is 30 days');
    t.ok(page.indexOf('id="cloud-signup-offer"') > page.indexOf('</form>'), '…below the sign-in form, not inside it');

    app.doc.getElementById('cloud-email').value = 'Carried@Example.com';
    tap(app, 'cloud-signup-open');
    const st = app.state();
    t.eq(st.cloud.signup, true, 'the tap opens the Create card');
    t.eq(st.cloud.email, 'carried@example.com', '…carrying the typed email over (lower case)');
    const c = html(app);
    t.includes(c, 'id="cloud-signup-form"', 'the Create card is a form (Go on the keyboard sends it)');
    t.includes(c, '<h3>Create your account</h3>', '…titled Create your account');
    t.includes(c, 'Free for 30 days &mdash; no card needed.', '…saying 30 days free, no card');
    t.ok(/<button type="button"[^>]*id="cloud-signup-google" data-action="cloud-google"/.test(c), 'Continue with Google heads it (3A: it makes an account too)');
    t.ok(/<input[^>]*id="cloud-email"[^>]*autocomplete="email"[^>]*value="carried@example\.com"/.test(c), 'the email box (autocomplete email), carried');
    t.excludes(c, 'id="cloud-password"', 'no password yet — that comes after the code (1A)');
    t.ok(/<button type="submit"[^>]*id="cloud-signup-send" data-action="cloud-signup-send"[^>]*>Create account</.test(c), 'Create account is the submit');
    t.ok(/<button type="button"[^>]*id="cloud-signup-close" data-action="cloud-signup-close"[^>]*>I already have an account</.test(c), 'I already have an account goes back');
    t.excludes(c, 'id="cloud-sign-in-form"', 'the sign-in form is not shown with it');
    // 4A: the agreement line, linked from config — one place for each address.
    t.includes(c, 'id="cloud-signup-terms">By creating an account you agree to PATGo&rsquo;s', 'the agreement line');
    t.includes(c, `<a href="${app.run('TERMS_URL')}" id="cloud-signup-terms-link" target="_blank" rel="noopener noreferrer">Terms of Service</a>`, '…linking the Terms (TERMS_URL)');
    t.includes(c, `<a href="${app.run('PRIVACY_URL')}" id="cloud-signup-privacy-link" target="_blank" rel="noopener noreferrer">Privacy Policy</a>`, '…and the Privacy Policy (PRIVACY_URL)');
    t.ok(c.indexOf('id="cloud-signup-terms"') < c.indexOf('id="cloud-signup-send"'), '…above the Create button');

    app.doc.getElementById('cloud-email').value = 'Back@Example.com';
    tap(app, 'cloud-signup-close');
    t.eq(st.cloud.signup, false, 'I already have an account: back to Sign in');
    t.eq(st.cloud.email, 'back@example.com', '…carrying the email back');
    t.includes(html(app), 'id="cloud-sign-in-form"', '…the sign-in form again');

    // The code step, while creating.
    st.cloud.signup = true;
    st.cloud.status = 'code-sent';
    st.cloud.email = 'new@example.com';
    app.fn('render')();
    const code = html(app);
    t.includes(code, '<h3>Check your email</h3>', 'code step (creating): Check your email');
    t.includes(code, 'Enter it to make your account.', '…saying what the code is for');
    t.ok(/id="cloud-verify-code"[^>]*>Continue</.test(code), '…and Continue, not Sign in');
    tap(app, 'cloud-change-email');
    t.eq(st.cloud.signup, true, 'Use a different email from there: back to the Create card');
    t.includes(html(app), 'id="cloud-signup-form"', '…showing it');
    st.cloud.signup = false; st.cloud.status = 'code-sent'; app.fn('render')();
    t.ok(/id="cloud-verify-code"[^>]*>Sign in</.test(html(app)), 'an ordinary sign-in code step still says Sign in');

    // The taps go through #app's delegation and are guarded (MAP rule 6).
    const disp = read('dispatch.js');
    for (const n of ['cloud-signup-open', 'cloud-signup-close', 'cloud-signup-send']) {
      t.ok(new RegExp(`'${n}':\\s*\\(\\) => \\{ if \\(typeof cloud\\w+ === 'function'\\)`).test(disp), `${n} wired, typeof-guarded`);
    }
  });

  /* ------------------------------------------------------------------ 83b */
  await t.group('83b — the REAL library, by email: creates only from Create; a password before the welcome; an old account just signs in (1A 2A 4A 6A)', async () => {
    // Sign-in never creates (1A) — the Create card's absence decides.
    {
      const app = boot();
      const who = { user: oldUser() };
      const srv = fakeServer(who);
      installLibrary(app, srv.fetchImpl);
      account(app);
      app.doc.getElementById('cloud-email').value = 'peter@example.com';
      await app.fn('cloudSendCode')();
      const otp = srv.calls.find(c => c.path === '/auth/v1/otp');
      t.eq(otp && otp.body.create_user, false, 'sign-in: create_user false');
      t.eq(otp && otp.body.data && otp.body.data.terms_accepted_at, undefined, '…and no Terms date sent');
      // The sign-in path told "no account" points at Create.
      const app2 = boot();
      installLibrary(app2, fakeServer(who, { '/auth/v1/otp': () => json({ code: 'otp_disabled', error_code: 'otp_disabled',
        msg: 'Signups not allowed for otp', message: 'Signups not allowed for otp' }, 422) }).fetchImpl);
      account(app2);
      app2.doc.getElementById('cloud-email').value = 'stranger@example.com';
      await app2.fn('cloudSendCode')();
      t.includes(app2.state().cloud.message, 'There’s no PATGo account for that email. Check the spelling, or tap Create an account.', 'an unknown email at sign-in: pointed at Create');
    }

    // A new account, end to end.
    const app = boot();
    const who = { user: newUser() };
    const srv = fakeServer(who);
    installLibrary(app, srv.fetchImpl);
    const st = app.state();
    const before = Date.now();
    await createByEmail(app, 'New@Example.com');
    const otp = srv.calls.find(c => c.path === '/auth/v1/otp');
    t.ok(!!otp, 'Create account asks for a code');
    t.eq(otp && otp.body.email, 'new@example.com', '…for the address typed');
    t.eq(otp && otp.body.create_user, true, '…allowed to make the account (1A)');
    const agreed = Date.parse(otp && otp.body.data && otp.body.data.terms_accepted_at);
    t.ok(isFinite(agreed) && agreed >= before - 1000 && agreed <= Date.now() + 1000, '…carrying the date the Terms were agreed (4A)');
    t.eq(st.cloud.status, 'code-sent', 'the code step');
    t.eq(st.cloud.signup, true, '…still creating');
    // Send a new code from the code step: still creating.
    tap(app, 'cloud-send-code');
    await until(() => !st.cloud.busy);
    const otps = srv.calls.filter(c => c.path === '/auth/v1/otp');
    t.eq(otps.length, 2, 'Send a new code: asked again');
    t.eq(otps[1] && otps[1].body.create_user, true, '…still creating');

    await enterCode(app);
    t.eq(st.cloud.status, 'signed-in', 'the code made and signed in the account');
    t.eq(st.cloud.signup, false, '…the Create card done with');
    t.eq(st.cloud.pwOpen, true, 'straight to choosing a password (2A)');
    t.eq(st.cloud.pwNew, true, '…as a NEW account');
    t.eq(st.cloud.welcome, 'due', 'the welcome waits for the password');
    t.eq(sheets(app).length, 0, '…not shown yet');
    const pg = html(app);
    t.includes(pg, '<h3 style="margin-top:14px">Choose a password</h3>', 'the card: Choose a password');
    t.includes(pg, 'One last step: choose a password to sign in with next time.', '…one last step');
    t.excludes(pg, 'id="cloud-password-cancel"', '…with no Cancel or Not now (2A)');
    t.excludes(pg, 'id="cloud-sign-out"', '…and nothing else to tap away to');
    t.ok(/id="cloud-password-save"[^>]*>Save and finish</.test(pg), '…Save and finish');
    tap(app, 'cloud-password-cancel');
    t.eq(st.cloud.pwOpen, true, 'the Cancel action can’t close it either');
    t.ok(srv.calls.some(c => c.path.startsWith('/rest/v1/profiles')), 'the plan was read meanwhile (as any sign-in)');

    // A weak password is refused before any request.
    app.doc.getElementById('cloud-new-password').value = 'short1';
    app.doc.getElementById('cloud-new-password2').value = 'short1';
    tap(app, 'cloud-password-save');
    await tick(20);
    const puts = () => srv.calls.filter(c => c.path === '/auth/v1/user' && c.method === 'PUT');
    t.eq(puts().length, 0, 'a short password: nothing sent');
    t.eq(st.cloud.pwOpen, true, '…still asking');
    app.doc.getElementById('cloud-new-password').value = 'patgo2026';
    app.doc.getElementById('cloud-new-password2').value = 'patgo2026';
    tap(app, 'cloud-password-save');
    await until(() => !st.cloud.busy && !st.cloud.pwOpen);
    t.eq(puts().length, 1, 'a good password: saved on the server');
    t.eq(puts()[0] && puts()[0].body.password, 'patgo2026', '…that password');
    t.eq(st.cloud.pwNew, false, 'the account is finished');
    t.includes(st.cloud.message, 'Your account is ready.', '…and says so');
    t.ok(!/patgo2026/.test(app.run('JSON.stringify(state)')), 'the password is not kept in state');

    // 6A: the welcome, with the SERVER's trial end.
    const w = sheetById(app, 'plan-welcome');
    t.ok(!!w, 'the welcome sheet shows');
    t.eq(st.cloud.welcome, 'shown', '…once');
    const wh = w ? w.innerHTML : '';
    t.includes(wh, 'Welcome to PATGo', '…Welcome to PATGo');
    t.includes(wh, '<strong>Thanks for joining!</strong>', '…thanks for joining');
    const endWords = app.fn('_planDate')(Date.parse(srv.ends));
    t.includes(wh, `Your free trial runs for <strong>28 days, until ${endWords}</strong>.`, '…the days and the end date the SERVER gave the account, UK style');
    t.includes(wh, 'no card is needed', '…no card');
    t.includes(wh, 'Settings → Account &amp; Sync → Subscription (£6 a month or £60 a year). Subscribing early keeps the rest of your trial.', '…where to subscribe, the prices, and that paying early loses nothing');
    t.ok(/id="plan-welcome-ok"[^>]*>Start using PATGo</.test(wh), '…Start using PATGo');
    t.ok(/id="plan-welcome-second"[^>]*>See plans</.test(wh), '…See plans');
    app.doc.getElementById('plan-welcome-second').click();
    t.eq(sheets(app).length, 0, 'See plans closes it…');
    t.eq(st.view, 'cloudSubscription', '…and opens the Subscription page');
    t.eq(app.fn('cloudMaybeWelcome')(), false, 'never shown twice');
    // No plan read at all (signal lost at that very moment): PLAN_TRIAL_DAYS from now.
    const bare = freshApp();
    bare.fn('planShowWelcome')();
    const bw = sheetById(bare, 'plan-welcome');
    t.includes(bw ? bw.innerHTML : '', `<strong>30 days, until ${bare.fn('_planDate')(Date.now() + 30 * DAY)}</strong>`, 'no plan read: 30 days from today (PLAN_TRIAL_DAYS)');
    // Signing out mid-way forgets the sign-up.
    Object.assign(st.cloud, { signup: true, pwNew: true, pwOpen: true, welcome: 'due' });
    await app.fn('cloudSignOut')();
    t.deepEq([st.cloud.signup, st.cloud.pwNew, st.cloud.welcome], [false, false, ''], 'signing out forgets the sign-up, the new password card and the welcome');

    // An address that already had an account (1A): it just signs in.
    const old = boot();
    const oldWho = { user: oldUser() };
    const osrv = fakeServer(oldWho);
    installLibrary(old, osrv.fetchImpl);
    await createByEmail(old, 'peter@example.com');
    await enterCode(old);
    const ost = old.state();
    t.eq(ost.cloud.status, 'signed-in', 'an existing account on the Create card: signed in');
    t.eq(ost.cloud.pwOpen, false, '…no password forced on it (nobody’s password replaced)');
    t.eq(ost.cloud.welcome, '', '…no welcome');
    t.includes(ost.cloud.message, 'You already had a PATGo account with that email', '…and it says so');
    t.eq(sheets(old).length, 0, '…no sheet');
    t.eq(osrv.calls.filter(c => c.path === '/auth/v1/user' && c.method === 'PUT').length, 0, '…nothing changed on the server');

    // The refusals, in words.
    const off = boot();
    installLibrary(off, fakeServer(who, { '/auth/v1/otp': () => json({ code: 'signup_disabled', error_code: 'signup_disabled',
      msg: 'Signups not allowed for this instance', message: 'Signups not allowed for this instance' }, 422) }).fetchImpl);
    await createByEmail(off, 'new@example.com');
    t.eq(off.state().cloud.message, 'New accounts can’t be made just yet. Please try again later.', 'sign-ups switched off: said plainly');
    t.eq(off.state().cloud.status, 'signed-out', '…still on the Create card');
    t.eq(off.state().cloud.signup, true, '…');
    const bad = boot();
    installLibrary(bad, fakeServer(who, { '/auth/v1/otp': () => json({ code: 'email_address_invalid', error_code: 'email_address_invalid',
      msg: 'Email address "x@y.zz" is invalid', message: 'Email address "x@y.zz" is invalid' }, 400) }).fetchImpl);
    await createByEmail(bad, 'x@y.zz');
    t.eq(bad.state().cloud.message, 'That email address wasn’t accepted. Check it and try again.', 'an address the server refuses: said plainly');
    const typo = boot();
    installLibrary(typo, fakeServer(who).fetchImpl);
    await createByEmail(typo, 'not-an-email');
    t.eq(typo.state().cloud.message, 'Enter your email address.', 'no proper address: asked for one, nothing sent');
    const offline = boot({ navigator: { onLine: false } });
    const offSrv = fakeServer(who);
    installLibrary(offline, offSrv.fetchImpl);
    await createByEmail(offline, 'new@example.com');
    t.includes(offline.state().cloud.message, 'You need a signal', 'offline: says a signal is needed');
    t.eq(offSrv.calls.length, 0, '…and sends nothing');
  });

  /* ------------------------------------------------------------------ 83c */
  await t.group('83c — Google makes an account (3A): the welcome after the plan is read, no password asked; cloudIsNewAccount', async () => {
    const app = boot();
    const who = { user: withGoogle(newUser('fresh@gmail.com')) };
    const srv = fakeServer(who);
    installLibrary(app, srv.fetchImpl);
    const opened = installWindow(app);
    account(app);
    tap(app, 'cloud-signup-open');
    tap(app, 'cloud-google');
    t.eq(opened.length, 1, 'Continue with Google from the Create card opens the window in the tap');
    await tick(10);
    handBack(app, { access_token: jwt(who.user), refresh_token: REFRESH, token_type: 'bearer', expires_in: '3600' });
    const st = app.state();
    await until(() => st.cloud.status === 'signed-in' && !st.cloud.busy && st.cloud.plan === 'trial');
    await until(() => sheets(app).length > 0, 500);
    t.eq(st.cloud.status, 'signed-in', 'signed in as the new account');
    t.eq(st.cloud.pwOpen, false, 'no password asked — Google is its way in');
    t.ok(!!sheetById(app, 'plan-welcome'), 'the welcome shows, once the plan has been read');
    t.eq(st.cloud.welcome, 'shown', '…once');
    t.includes(sheetById(app, 'plan-welcome').innerHTML, `until ${app.fn('_planDate')(Date.parse(srv.ends))}`, '…with the server’s date');

    const old = boot();
    const owho = { user: withGoogle(oldUser('peter.birchley@gmail.com')) };
    installLibrary(old, fakeServer(owho).fetchImpl);
    installWindow(old);
    account(old);
    tap(old, 'cloud-google');
    await tick(10);
    handBack(old, { access_token: jwt(owho.user), refresh_token: REFRESH });
    await until(() => old.state().cloud.status === 'signed-in' && !old.state().cloud.busy && old.state().cloud.plan === 'trial');
    await tick(50);
    t.eq(sheets(old).length, 0, 'an account Google already knew: no welcome');
    t.eq(old.state().cloud.welcome, '', '…none due');

    // Pure: the server's two times, never the phone's clock.
    const f = boot();
    const isNew = f.fn('cloudIsNewAccount');
    t.ok(isNew(newUser()), 'confirmed moments before the sign-in: new');
    t.notOk(isNew(oldUser()), 'confirmed long before: not new');
    const T = Date.parse('2026-10-21T10:00:00Z');
    const u = (conf, last) => ({ email_confirmed_at: iso(T + conf), last_sign_in_at: iso(T + last) });
    t.ok(isNew(u(0, 5 * 60000)), 'five minutes apart: new (the line)');
    t.notOk(isNew(u(0, 5 * 60000 + 1000)), 'a second over: not new');
    t.ok(isNew({ confirmed_at: iso(T), last_sign_in_at: iso(T + 1000) }), 'confirmed_at when email_confirmed_at is missing');
    t.notOk(isNew({ last_sign_in_at: iso(T) }), 'never confirmed: not new');
    t.notOk(isNew({ email_confirmed_at: iso(T) }), 'no sign-in time: not new');
    t.notOk(isNew(null), 'no user: not new');
    // Safari (older WebKit) refuses fractions longer than milliseconds — as
    // plan.js's _planTime notes. Node reads them, so act as Safari for this.
    f.run("var __dp = Date.parse; Date.parse = function (s) { return /\\.\\d{4,}/.test(String(s)) ? NaN : __dp(s); };");
    try {
      t.ok(isNew({ email_confirmed_at: '2026-10-21T10:00:00.123456+00:00', last_sign_in_at: '2026-10-21T10:00:30.654321+00:00' }),
        'the database’s microseconds read, even as Safari parses dates');
    } finally { f.run('Date.parse = __dp;'); }
    t.eq(f.run('CLOUD_NEW_ACCOUNT_MS'), 5 * 60000, 'CLOUD_NEW_ACCOUNT_MS is five minutes');
  });

  /* ------------------------------------------------------------------ 83d */
  await t.group('83d — the days left (7A) and the thank-you (8A): owed from a paid return, kept, shown once, never unpaid', async () => {
    const app = freshApp();
    const left = app.fn('planTrialDaysLeft');
    const N = Date.parse('2026-10-21T12:00:00Z');
    t.eq(left(iso(N + 30 * DAY), N), 30, '30 days out: 30');
    t.eq(left(iso(N + 26 * DAY - 3600000), N), 26, 'a part day counts as a day');
    t.eq(left(iso(N + 1000), N), 1, 'moments left: 1');
    t.eq(left(iso(N - 1000), N), 0, 'ended: 0');
    t.eq(left('', N), null, 'no date: null');
    t.eq(left('2026-11-20T11:00:00.123456+00:00', N), 30, 'the database’s microseconds read');

    // The Account page (signed in, a trial 26 days out).
    const UID = '22222222-2222-2222-2222-222222222222';
    const acc = freshApp({ localStorage: { 'patgo:cloudAuth:test': stored(UID), 'pat:cloudUnlocked': '1' } });
    const st = acc.state();
    const end = Date.now() + 26 * DAY - 3600000;
    Object.assign(st.cloud, { status: 'signed-in', plan: 'trial', trialEndsAt: iso(end) });
    st.view = 'cloudAccount';
    acc.fn('render')();
    t.includes(html(acc), `Plan: <strong>Free trial</strong> &middot; <span id="cloud-trial-left">26 days left (ends ${acc.fn('_planDate')(end)})</span>`,
      'Account: Free trial · 26 days left (ends date)');
    st.cloud.trialEndsAt = iso(Date.now() + 3600000); acc.fn('render')();
    t.includes(html(acc), '1 day left (ends', 'one day: “1 day left”');
    st.cloud.trialEndsAt = iso(Date.now() - DAY); acc.fn('render')();
    t.includes(html(acc), '<span id="cloud-trial-left">ended ', 'after the end: “ended date”');
    Object.assign(st.cloud, { plan: 'active', trialEndsAt: iso(Date.now() + 5 * DAY) }); acc.fn('render')();
    t.excludes(html(acc), 'cloud-trial-left', 'paid: no days left shown');
    // 7A: the Jobs list stays quiet for most of the trial.
    acc.sandbox.localStorage.setItem('pat:plan', planRec({ uid: UID, plan: 'trial', trialEndsAt: iso(Date.now() + 26 * DAY) }));
    t.eq(acc.fn('planLineText')(acc.fn('planCurrent')()), '', 'the Jobs list: nothing 26 days out (7A)');

    // 8A: the thank-you.
    const pay = freshApp({ localStorage: { 'patgo:cloudAuth:test': stored(UID), 'pat:cloudUnlocked': '1',
      'pat:plan': planRec({ uid: UID, plan: 'trial' }) } });
    const pst = pay.state();
    pst.welcomeSeen = true;
    pst.migrationPrompt = { show: false, name: '', items: [] };
    const b = pay.fn('_bill')();
    b.pending = 'checkout';
    b.info = { plan: 'active', interval: 'year' };
    pay.run('billingRead = function () { return Promise.resolve(true); }');   // the read itself is V142's (81c)
    pst.view = 'cloudSubscription';
    pay.fn('billingReturned')('paid');
    t.eq(rec(pay).thanksDue, true, 'a paid return: a thank-you owed, in the plan record');
    pay.fn('planNote')({ plan: 'trial', trial_ends_at: iso(Date.now() + 20 * DAY) });
    t.eq(rec(pay).thanksDue, true, '…kept through a plan read (Stripe hasn’t told us yet)');
    t.eq(pay.fn('planMaybeThank')(true), '', '…not shown while the plan still reads unpaid');
    pay.fn('planNote')({ plan: 'active', trial_ends_at: null });
    await until(() => !!sheetById(pay, 'plan-thanks'), 500);
    const th = sheetById(pay, 'plan-thanks');
    t.ok(!!th, 'paid: the thank-you shows on the Subscription page (the confirm loop)');
    t.includes(th ? th.innerHTML : '', 'Thank you for subscribing!', '…Thank you for subscribing!');
    t.includes(th ? th.innerHTML : '', 'You’re on <strong>PATGo yearly — £60 a year</strong>.', '…naming the plan');
    t.includes(th ? th.innerHTML : '', 'your jobs, certificates and cloud backup', '…everything carries on');
    t.includes(th ? th.innerHTML : '', 'Manage your plan, card and invoices any time from Settings → Account &amp; Sync → Subscription.', '…and where to manage it');
    t.ok(/id="plan-thanks-ok"[^>]*>Done</.test(th ? th.innerHTML : ''), '…Done');
    t.eq(rec(pay).thanksDue, undefined, '…and is no longer owed');
    pay.doc.getElementById('plan-thanks-ok').click();
    t.eq(sheets(pay).length, 0, 'Done closes it');
    t.eq(pay.fn('planMaybeThank')(true), '', 'never twice');
    t.eq(pay.fn('planShowThanks')('month') && sheetById(pay, 'plan-thanks').innerHTML.includes('PATGo monthly — £6 a month'), true, 'monthly: its own words');
    closeSheets(pay);

    // Missed on the page (Stripe slow, or the app closed): the Jobs list, later.
    const later = freshApp({ localStorage: { 'patgo:cloudAuth:test': stored(UID), 'pat:cloudUnlocked': '1',
      'pat:plan': planRec({ uid: UID, plan: 'active', trialEndsAt: null, thanksDue: true }) } });
    const lst = later.state();
    lst.welcomeSeen = true;
    lst.migrationPrompt = { show: false, name: '', items: [] };
    if (lst.newForm) lst.newForm.show = false;   // an empty phone opens the New Job form
    closeSheets(later);
    lst.view = 'cloudAccount';
    t.eq(later.fn('planMaybeThank')(false), '', 'away from the Jobs list: waits');
    lst.view = 'sessions';
    later.fn('render')();
    closeSheets(later);
    t.eq(later.fn('planMaybePrompt')(), 'thanks', 'on the Jobs list: the owed thank-you, first');
    t.ok(!!sheetById(later, 'plan-thanks'), '…shown');
    t.includes(sheetById(later, 'plan-thanks').innerHTML, 'You’re subscribed to PATGo.', '…plain words when the interval isn’t known');
    t.eq(rec(later).thanksDue, undefined, '…and settled');

    // Or the Subscription page: its own read says paid → the thank-you there.
    const sub = freshApp({ localStorage: { 'patgo:cloudAuth:test': stored(UID), 'pat:cloudUnlocked': '1',
      'pat:plan': planRec({ uid: UID, plan: 'trial', thanksDue: true }) } });
    const sst = sub.state();
    if (sst.newForm) sst.newForm.show = false;
    closeSheets(sub);
    sst.cloud.status = 'signed-in';
    sub.run("cloudClient = function () { return Promise.resolve({ rpc: function () { return Promise.resolve({ data: { plan: 'active', interval: 'month', trial_ends_at: null, lapsed_at: null } }); } }); };");
    sst.view = 'cloudSubscription';
    await sub.fn('billingRead')();
    await tick(5);
    const sth = sheetById(sub, 'plan-thanks');
    t.ok(!!sth, 'the Subscription page’s own read finds it paid: the thank-you');
    t.includes(sth ? sth.innerHTML : '', 'PATGo monthly — £6 a month', '…for the monthly plan');

    // Never without a payment, never while not paid.
    const none = freshApp({ localStorage: { 'patgo:cloudAuth:test': stored(UID), 'pat:cloudUnlocked': '1',
      'pat:plan': planRec({ uid: UID, plan: 'active', trialEndsAt: null }) } });
    none.state().view = 'sessions';
    if (none.state().newForm) none.state().newForm.show = false;
    closeSheets(none);
    t.eq(none.fn('planMaybeThank')(false), '', 'paid but never thanked for a payment here: nothing (comped, or paid on another phone)');
    const lapsed = freshApp({ localStorage: { 'patgo:cloudAuth:test': stored(UID), 'pat:cloudUnlocked': '1',
      'pat:plan': planRec({ uid: UID, plan: 'lapsed', thanksDue: true }) } });
    lapsed.state().view = 'sessions';
    if (lapsed.state().newForm) lapsed.state().newForm.show = false;
    closeSheets(lapsed);
    t.eq(lapsed.fn('planMaybeThank')(false), '', 'owed but the plan reads lapsed: not shown');
    const cancelled = freshApp({ localStorage: { 'patgo:cloudAuth:test': stored(UID), 'pat:cloudUnlocked': '1',
      'pat:plan': planRec({ uid: UID, plan: 'trial' }) } });
    const cb = cancelled.fn('_bill')();
    cb.pending = 'checkout';
    cancelled.run('billingRead = function () { return Promise.resolve(true); }');
    cancelled.fn('billingReturned')('cancelled');
    t.eq(rec(cancelled).thanksDue, undefined, 'a cancelled checkout owes nothing');
    t.notOk(/thanksDue/.test(JSON.stringify(cancelled.fn('buildBackup')())), 'the owed thank-you never goes in a backup (the plan record never does)');
  });

  /* ------------------------------------------------------------------ 83e */
  await t.group('83e — release: V144, cache, What’s new, About; wiring; no Stripe script (82e’s lasting checks)', async () => {
    const app = freshApp();
    t.eq(app.run('APP_VERSION'), 'V144', 'APP_VERSION V144');
    t.eq(app.run('WELCOME_VERSION'), 'V144', 'What’s new rolled');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v144';", 'cache key pat-v144');
    const core = read('render-core.js');
    const at = core.indexOf('<ul class="welcome-list sheet-scroll">');
    const sheetCopy = core.slice(at, core.indexOf('</ul>', at));
    t.eq((sheetCopy.match(/<li>/g) || []).length, 2, 'What’s new: two lines');
    t.includes(sheetCopy, '<li><strong>Create an account.</strong>', '…Create an account');
    t.includes(sheetCopy, 'by email or with Google, and try everything free for 30 days &mdash; no card needed.', '…how, and the 30 days');
    t.includes(sheetCopy, '<li><strong>Your trial at a glance.</strong>', '…the trial at a glance');
    t.includes(sheetCopy, 'subscribing ends with a proper thank-you', '…and the thank-you');
    t.includes(core, 'New here? Try the practice job.', 'setup offers the practice job');
    t.includes(core, 'You can do it again any time from Settings → Help → Tutorials.', '…and says where it lives');
    const help = read('render-help.js');
    const a = help.indexOf('<p><strong>V144</strong>'), b = help.indexOf('<p><strong>V143</strong>'), c = help.indexOf('<p><strong>V142</strong>');
    t.ok(a > -1 && b > a && c > b, 'About: V144, V143, V142');
    t.excludes(help, '<p><strong>V141</strong>', 'V141 rolled off');
    t.includes(help, 'You can create your own cloud account from Settings, by email or with Google, with a 30-day free trial', 'About: V144’s line');
    t.includes(help, 'PATGo confirms your plan online at least once every 30 days. When a subscription ends', 'About: V143’s line still there');
    t.includes(help, 'Cloud accounts can subscribe from Settings, paying securely through Stripe', 'About: V142’s line still there');
    t.includes(help, 'data-action="settings-page" data-arg="settingsTutorials"', 'About points at Tutorials');
    const prices = app.run('PLAN_PRICES');
    t.deepEq({ year: prices.year, month: prices.month }, { year: '£60 a year', month: '£6 a month' }, 'the prices shown match the pricing round (1B)');
    t.eq(app.run('PLAN_TRIAL_DAYS'), 30, 'PLAN_TRIAL_DAYS 30…');
    t.includes(read('supabase/schema.sql'), "ends timestamptz := now() + interval '30 days';", '…the same 30 days the server gives a new account (handle_new_user)');
    t.includes(read('styles.css'), '.plan-happy-body {', 'the welcome / thank-you sheets have their style');

    // Stripe-hosted (V142 5A): no Stripe or Google script anywhere in the app.
    const shipped = read('index.html') + read('plan.js') + read('cloud.js') + read('billing-done.html') + read('signin-done.html');
    t.notOk(/js\.stripe\.com|<script[^>]+stripe/i.test(shipped), 'no Stripe script in the app');
    t.notOk(/accounts\.google\.com\/gsi|<script[^>]+google/i.test(shipped), 'no Google script (V140 1A)');
    t.notOk(/billing-done\.html/.test(read('sw.js')) || /billing-done\.html/.test(read('index.html')), 'billing-done.html is not in ASSETS or index.html (only opened online)');
    t.notOk(new RegExp(String.raw`\bconfirm\(|\balert\(|\bprompt\(`).test(read('plan.js') + read('cloud.js') + read('sync.js')), 'no browser dialogs');

    // The taps: wired, guarded, harmless without plan.js / cloud.js (rule 6).
    const disp = read('dispatch.js');
    const NEWB = ['billing-subscribe', 'billing-manage', 'billing-card', 'billing-cancel-wait', 'plan-check'];
    t.includes(disp, "'plan-check': () => { if (typeof planCheckNow === 'function') planCheckNow(); },", 'Check now wired, typeof-guarded (V143)');
    for (const n of NEWB.slice(0, 4)) t.ok(new RegExp(`'${n}':\\s*\\(\\) => \\{ if \\(typeof billing\\w+ === 'function'\\)`).test(disp), `${n} wired, typeof-guarded`);
    const noPlan = bootApp({ skip: ['plan.js'] });
    noPlan.state = () => noPlan.refresh('state').state;
    const actsP = noPlan.run('ACTIONS');
    for (const n of NEWB) t.doesNotThrow(() => actsP[n]('', noPlan.doc.createElement('button')), `${n} harmless without plan.js`);
    noPlan.state().view = 'cloudSubscription';
    t.doesNotThrow(() => noPlan.fn('render')(), 'the Subscription page renders without plan.js');
    t.doesNotThrow(() => noPlan.fn('setView')('cloudSubscription'), '…and opens without it');
    noPlan.state().view = 'sessions';
    t.doesNotThrow(() => noPlan.fn('render')(), 'the Jobs list renders without plan.js');
    // V144: without plan.js a made account just carries on (no welcome to show).
    Object.assign(noPlan.state().cloud, { status: 'signed-in', welcome: 'due', pwOpen: false, busy: false });
    t.eq(noPlan.fn('cloudMaybeWelcome')(), false, 'no plan.js: no welcome, no error (rule 6)');
    noPlan.state().cloud.trialEndsAt = new Date(Date.now() + 9 * DAY).toISOString();
    noPlan.state().cloud.plan = 'trial';
    noPlan.state().view = 'cloudAccount';
    t.doesNotThrow(() => noPlan.fn('render')(), 'the Account page renders a trial without plan.js');
    const noSync = bootApp({ skip: ['sync.js'] });
    noSync.state = () => noSync.refresh('state').state;
    t.doesNotThrow(() => noSync.fn('planNote')({ plan: 'active' }), 'planNote without sync.js');
    t.eq(noSync.fn('planLineText')({ phase: 'paid' }), '', 'the plan line without sync.js');

    // Every cloud tap from V139, V140 and V144 wired and guarded.
    const NEW = ['cloud-google', 'cloud-google-connect', 'cloud-google-cancel', 'cloud-google-off',
                 'cloud-google-keep', 'cloud-google-disconnect',
                 'cloud-password-sign-in', 'cloud-forgot', 'cloud-use-code', 'cloud-use-password',
                 'cloud-password-open', 'cloud-password-cancel', 'cloud-password-save', 'cloud-password-toggle',
                 'cloud-signup-open', 'cloud-signup-close', 'cloud-signup-send'];
    for (const n of NEW) t.ok(new RegExp(`'${n}':\\s*\\([^)]*\\) => \\{ if \\(typeof cloud\\w+ === 'function'\\)`).test(disp), `${n} wired, typeof-guarded`);
    const bare = bootApp({ skip: ['cloud.js'] });
    bare.state = () => bare.refresh('state').state;
    const actions = bare.run('ACTIONS');
    for (const n of NEW) t.doesNotThrow(() => actions[n]('', bare.doc.createElement('button')), `${n} harmless without cloud.js`);
    bare.state().view = 'cloudAccount';
    t.doesNotThrow(() => bare.fn('render')(), 'Account page renders without cloud.js');
    bare.state().view = 'cloudSubscription';
    t.doesNotThrow(() => bare.fn('render')(), 'the Subscription page renders without cloud.js');

    // A form never navigates: the submit that follows Sign in / Create / Go is cancelled at #app.
    const f = bootApp({});
    f.state = () => f.refresh('state').state;
    f.sandbox.localStorage.setItem('pat:cloudUnlocked', '1');
    f.state().view = 'cloudAccount';
    f.fn('render')();
    const ev = { type: 'submit', target: f.doc.createElement('form'), defaultPrevented: false,
                 preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
    f.doc.getElementById('app').dispatchEvent(ev);
    t.ok(ev.defaultPrevented, 'a submit on the Account page is cancelled (the app does not reload)');

    // 77e's lasting checks (carried by 78e … 82e).
    t.eq(app.run("SETTINGS_CATEGORIES.find(c => c.id === 'catHelp').pages[0]"), 'settingsTutorials', 'Tutorials heads the Help group');
    const al = ' ' + app.run('SETTINGS_PAGE_META.settingsTutorials.aliases') + ' ';
    t.ok(/ tutorial /.test(al) && / practice /.test(al), 'search finds it by tutorial or practice');
    t.ok(/ settings /.test(al) && / instrument /.test(al) && / backup /.test(al), '…and by settings, instrument or backup (V135)');
    app.fn('setView')('settingsTutorials');
    const pg = html(app);
    t.includes(pg, 'data-action="open-practice"', 'the page starts the practice job');
    t.includes(pg, 'Nothing you do in it is saved', '…and says nothing is kept');
    const rows = [...pg.slice(0, pg.indexOf('id="tutorials-cloud-list"')).matchAll(/data-action="open-tutorial" data-arg="([^"]+)"/g)].map(m => m[1]);
    t.deepEq(rows, ['engineer', 'branding', 'content', 'items', 'backup'], 'the page lists the five Settings tutorials under Setting up');
    t.includes(pg, 'Nothing you do in them is saved', '…and says nothing is kept');
    t.excludes(pg, 'data-action="tut-show-me-how"', 'the Tutorials page itself has no Show me how');
    t.eq(app.run('typeof TOUR_SLIDES'), 'undefined', 'the five picture slides stay retired');
    t.eq(app.run('TUT_STEPS.length'), 21, 'the practice job: 21 steps (V134.1, unchanged)');
    t.includes(read('styles.css'), '.tut-howto-row {', 'the Show me how line has its own style (V137)');
    t.includes(disp, "'tut-show-me-how': (arg) => tutShowMeHow(arg),", 'the tap is wired (V137)');
    t.includes(read('tour.js'), "const TUT_WALK_KEYS = ['group', 'page'];", 'a page tutorial skips the walk (V138)');
  });
};
