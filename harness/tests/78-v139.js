/* Standing test — V139: password sign-in
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Stage 13's first sign-in item (Peter 20 Oct: 1A 2A
   3A 4B 5A). 1A the signed-out Account page is email + password + Sign in,
   with "Forgot password?" and "Email me a code instead" (the V79 code card,
   unchanged, with "Use a password instead"). 2A Forgot = the emailed code,
   then "Choose a new password" — never Supabase's reset LINK, which opens in
   Safari, not the installed app. 3A signed in → "Set or change password".
   4B at least 8 characters with a letter and a number (the dashboard is set
   the same: minimum 8, letters and digits). 5A no current password asked.
   The boxes sit in real <form>s so the iPhone treats them as a sign-in;
   dispatch.js cancels every submit so nothing reloads. No SQL, no storage.

     78a  the sign-in card (1A): its boxes and buttons, the form, the iPhone
          hints (username / current-password); code card ↔ password card
          through the dispatch table, the typed email carried over.
     78b  the REAL library: a password sign-in is a password grant to the
          TEST project, then the same as a code sign-in (profile read, the
          unlock remembered). The password is never kept — not in state,
          storage or a backup. Wrong password / too many tries read plainly;
          no password, no signal → no request.
     78c  Forgot (2A): a code is sent (create_user false), the code card says
          it's a reset, and a good code lands on "Choose a new password".
          Nothing ever asks the server for a reset link.
     78d  set or change (3A 4B 5A): the rule, both boxes must match, a good
          one is a PUT of the password alone (no current password, no nonce);
          the server's refusals read plainly.
     78e  release: V139, cache, What's new (one line), About V139 / V138 /
          V137; every new tap wired and harmless without cloud.js; a submit
          never navigates; plus 77e's lasting checks (77e retired).

   How it LOOKS — the cards, the Show button beside the box, both themes — was
   checked in Chromium at 390×844 dark and 375×667 light (Playwright, not
   committed). Whether the iPhone offers to SAVE the password is Safari's call
   and can only be seen on a phone (BACKLOG V139 residuals). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { tick, freshApp } = require('../fixture');

const LIB  = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;

const PW_CANARY = 'ZzPasswordCanary42';   // a typed password; must never be kept
const REFRESH = 'ZZREFRESH139';
const USER = { id: '22222222-2222-2222-2222-222222222222', email: 'peter@example.com',
               aud: 'authenticated', role: 'authenticated' };

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
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const session = () => ({ access_token: 'ZZACCESS139', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: REFRESH, user: USER });

// A fake Supabase: records every request; `over` replaces a path's answer.
function fakeServer(over = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const p = u.split('?')[0].replace(/^https:\/\/[^/]+/, '');
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: u, path: p, method: init.method || 'GET', body });
    if (over[p]) return over[p](body, u);
    if (p === '/auth/v1/token' && /grant_type=password/.test(u)) return json(session());
    if (p === '/auth/v1/otp')    return json({});
    if (p === '/auth/v1/verify') return json(session());
    if (p === '/auth/v1/user' && (init.method || 'GET') === 'PUT') return json(USER);
    if (p.startsWith('/rest/v1/profiles')) return json([{ plan: 'trial', trial_ends_at: '2026-11-19T00:00:00Z' }]);
    if (p === '/auth/v1/logout') return new Response(null, { status: 204 });
    return json({ message: 'unexpected ' + u }, 404);
  };
  return { calls, fetchImpl };
}
// A tap as the phone makes it: a click bubbling to #app with the button as target.
function tap(app, action, extra) {
  const el = app.doc.getElementById(extra && extra.id) || app.doc.createElement('button');
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
// Everything the phone keeps: state, every storage key, a backup.
function kept(app) {
  const st = app.run('JSON.stringify(state)');
  const ls = [];
  for (let i = 0; i < app.storage.length; i++) { const k = app.storage.key(i); ls.push(k + '=' + app.storage.getItem(k)); }
  const backup = JSON.stringify(app.fn('buildBackup')());
  return st + '\n' + ls.join('\n') + '\n' + backup;
}
async function signedInWithCode(app) {
  account(app);
  app.doc.getElementById('cloud-email').value = 'peter@example.com';
  await app.fn('cloudSendCode')();
  app.doc.getElementById('cloud-code').value = '123456';
  await app.fn('cloudVerifyCode')();
  await tick(5);
}

module.exports = async function () {
  /* ------------------------------------------------------------------ 78a */
  await t.group('78a — the sign-in card: email + password, Forgot, a code instead (1A)', async () => {
    const app = boot();
    account(app);
    const page = html(app);
    t.includes(page, 'id="cloud-sign-in-form"', 'the boxes sit in a form (the iPhone’s Passwords)');
    t.ok(/<input[^>]*id="cloud-email"[^>]*autocomplete="username"/.test(page), 'email box is the username');
    t.ok(/<input[^>]*id="cloud-password"[^>]*type="password"[^>]*autocomplete="current-password"/.test(page), 'password box: hidden, current-password');
    t.ok(/<button type="submit"[^>]*id="cloud-password-sign-in"[^>]*data-action="cloud-password-sign-in"/.test(page),
      'Sign in is the form’s submit button (Go on the keyboard clicks it) and a tap action');
    t.ok(/<button type="button"[^>]*data-action="cloud-forgot"/.test(page), 'Forgot password? — not a submit');
    t.ok(/<button type="button"[^>]*data-action="cloud-use-code"[^>]*>Email me a code instead</.test(page), 'Email me a code instead — not a submit');
    t.ok(/<button type="button" class="cloud-pw-toggle" data-action="cloud-password-toggle"/.test(page), 'Show / Hide beside the box');
    t.excludes(page, 'id="cloud-send-code"', 'the code button is on the other card');
    t.excludes(page, 'No password', 'the old “No password.” line is gone');

    // To the code card and back, by taps, the typed email carried each way.
    app.doc.getElementById('cloud-email').value = ' Peter@Example.com ';
    tap(app, 'cloud-use-code');
    t.eq(app.state().cloud.useCode, true, 'Email me a code instead → the code card');
    t.includes(html(app), 'id="cloud-send-code"', '…with its Email me a code button');
    t.includes(html(app), 'data-action="cloud-use-password"', '…and Use a password instead');
    t.excludes(html(app), 'id="cloud-password"', '…and no password box');
    t.eq(app.state().cloud.email, 'peter@example.com', 'the typed email came with it');
    tap(app, 'cloud-use-password');
    t.eq(app.state().cloud.useCode, false, 'Use a password instead → back');
    t.includes(html(app), 'id="cloud-password"', 'the password box is back');
    t.includes(html(app), 'value="peter@example.com"', '…and the email still filled in');

    // Show / Hide flips the box in place — no repaint (a repaint would empty it).
    const box = app.doc.getElementById('cloud-password');
    box.type = 'password';
    box.value = 'typed';
    const btn = app.doc.createElement('button');
    app.fn('cloudPasswordToggle')(btn);
    t.eq(box.type, 'text', 'Show → the password is visible');
    t.eq(btn.textContent, 'Hide', '…and the button says Hide');
    t.eq(box.value, 'typed', '…and what was typed is still there');
    app.fn('cloudPasswordToggle')(btn);
    t.eq(box.type, 'password', 'Hide → hidden again');
    t.eq(btn.textContent, 'Show', '…Show');
    t.eq(app.run('_cloudClientPromise'), null, 'none of this loaded the library');
  });

  /* ------------------------------------------------------------------ 78b */
  await t.group('78b — the REAL library: a password sign-in, then exactly as a code sign-in', async () => {
    const app = boot();
    const srv = fakeServer();
    installLibrary(app, srv.fetchImpl);
    account(app);
    app.storage.removeItem('pat:cloudUnlocked');   // the sign-in itself must remember it
    app.doc.getElementById('cloud-email').value = '  Peter@Example.com ';
    app.doc.getElementById('cloud-password').value = ' ' + PW_CANARY + ' ';
    tap(app, 'cloud-password-sign-in');
    await tick(10);
    const grant = srv.calls.find(c => c.path === '/auth/v1/token');
    t.ok(!!grant, 'a request went to /auth/v1/token');
    t.ok(grant && /grant_type=password/.test(grant.url), '…as a password grant');
    t.eq(grant && grant.url.indexOf('https://wawxhlltbddkjkuyfake.supabase.co'), 0, '…to the TEST project');
    t.eq(grant && grant.body.email, 'peter@example.com', 'email trimmed and lower-cased');
    t.eq(grant && grant.body.password, ' ' + PW_CANARY + ' ', 'the password sent exactly as typed — never trimmed');
    const st = app.state();
    t.eq(st.cloud.status, 'signed-in', 'signed in');
    t.eq(st.cloud.email, 'peter@example.com', 'as the server’s address');
    t.ok(String(app.storage.getItem('patgo:cloudAuth:test') || '').includes(REFRESH), 'the library kept the session under OUR key');
    t.ok(srv.calls.some(c => c.path.startsWith('/rest/v1/profiles')), 'followed by the profile read (the round trip)');
    t.eq(st.cloud.plan, 'trial', 'plan read back');
    t.eq(app.storage.getItem('pat:cloudUnlocked'), '1', 'the Cloud unlock remembered, as a code sign-in does');
    t.includes(html(app), 'id="cloud-test-strip"', 'TEST strip showing');
    t.excludes(kept(app), PW_CANARY, 'the password is nowhere: not in state, storage or a backup');
    await app.fn('cloudSignOut')();
    t.eq(st.cloud.status, 'signed-out', 'signs out as before');

    // Wrong password (also what an account with none set yet gets).
    const bad = boot();
    installLibrary(bad, fakeServer({ '/auth/v1/token': () => json({ code: 'invalid_credentials', error_code: 'invalid_credentials',
      msg: 'Invalid login credentials', message: 'Invalid login credentials' }, 400) }).fetchImpl);
    account(bad);
    bad.doc.getElementById('cloud-email').value = 'peter@example.com';
    bad.doc.getElementById('cloud-password').value = 'nope';
    t.notOk(await bad.fn('cloudPasswordSignIn')(), 'wrong password resolves false');
    t.includes(bad.state().cloud.message, 'email and password don’t match', 'explained plainly');
    t.includes(bad.state().cloud.message, 'Forgot password', '…and points at Forgot');
    t.eq(bad.state().cloud.status, 'signed-out', 'still signed out');
    t.eq(bad.state().cloud.busy, false, 'busy cleared');

    const busy = boot();
    installLibrary(busy, fakeServer({ '/auth/v1/token': () => json({ code: 'over_request_rate_limit', msg: 'rate limit' }, 429) }).fetchImpl);
    account(busy);
    busy.doc.getElementById('cloud-email').value = 'peter@example.com';
    busy.doc.getElementById('cloud-password').value = 'whatever1';
    await busy.fn('cloudPasswordSignIn')();
    t.includes(busy.state().cloud.message, 'Too many tries', 'rate limit: tries, not codes');

    // No password, or no signal → no request at all.
    const empty = boot();
    account(empty);
    empty.doc.getElementById('cloud-email').value = 'peter@example.com';
    empty.doc.getElementById('cloud-password').value = '';
    t.notOk(await empty.fn('cloudPasswordSignIn')(), 'no password: false');
    t.includes(empty.state().cloud.message, 'Enter your password', '…asked for');
    t.eq(empty.run('_cloudClientPromise'), null, '…and the library not even loaded');
    const off = boot({ navigator: { onLine: false } });
    account(off);
    off.doc.getElementById('cloud-email').value = 'peter@example.com';
    off.doc.getElementById('cloud-password').value = 'whatever1';
    t.notOk(await off.fn('cloudPasswordSignIn')(), 'offline: false');
    t.includes(off.state().cloud.message, 'need a signal', '…says so');
    t.eq(off.run('_cloudClientPromise'), null, '…no library, no request');
  });

  /* ------------------------------------------------------------------ 78c */
  await t.group('78c — Forgot password: an emailed code, then Choose a new password (2A)', async () => {
    const app = boot();
    const srv = fakeServer();
    installLibrary(app, srv.fetchImpl);
    account(app);
    app.doc.getElementById('cloud-email').value = 'Peter@Example.com';
    tap(app, 'cloud-forgot');
    await tick(10);
    const otp = srv.calls.find(c => c.path === '/auth/v1/otp');
    t.ok(!!otp, 'Forgot sent a code');
    t.eq(otp && otp.body.email, 'peter@example.com', '…to the typed address');
    t.eq(otp && otp.body.create_user, false, '…still never creating an account');
    const st = app.state();
    t.eq(st.cloud.status, 'code-sent', 'the code step');
    t.eq(st.cloud.forgot, true, '…remembered as a reset');
    t.includes(html(app), '<h3>Reset your password</h3>', 'the card says it is a reset');
    t.includes(html(app), 'then choose a new password', '…and what comes next');
    t.ok(/id="cloud-verify-code"[^>]*>Continue</.test(html(app)), '…its button says Continue');

    app.doc.getElementById('cloud-code').value = '654321';
    t.ok(await app.fn('cloudVerifyCode')(), 'the code signs in');
    await tick(10);
    t.eq(st.cloud.status, 'signed-in', 'signed in');
    t.eq(st.cloud.pwOpen, true, 'straight on to the new password');
    t.eq(st.cloud.pwReset, true, '…as a reset');
    t.eq(st.cloud.forgot, false, 'the reset flag spent');
    const page = html(app);
    t.includes(page, '<h3 style="margin-top:14px">Choose a new password</h3>', 'Choose a new password');
    t.includes(page, 'id="cloud-pw-reset-note"', '…with the signed-in-by-code note');
    t.ok(/id="cloud-password-cancel"[^>]*>Not now</.test(page), '…and Not now');
    t.notOk(srv.calls.some(c => /\/auth\/v1\/recover/.test(c.path)), 'nothing ever asked for a reset LINK (it would open in Safari)');
    t.includes(read('cloud.js'), 'detectSessionInUrl: false', 'and nothing is read from a link');

    // An ordinary code sign-in does NOT open the password card.
    const plain = boot();
    installLibrary(plain, fakeServer().fetchImpl);
    await signedInWithCode(plain);
    t.eq(plain.state().cloud.status, 'signed-in', 'a plain code sign-in');
    t.eq(plain.state().cloud.pwOpen, false, '…lands on the Account page as before');

    // Back to sign in clears the reset.
    const back = boot();
    installLibrary(back, fakeServer().fetchImpl);
    account(back);
    back.doc.getElementById('cloud-email').value = 'peter@example.com';
    await back.fn('cloudForgotPassword')();
    t.ok(/id="cloud-change-email"[^>]*>Back to sign in</.test(html(back)), 'the way out says Back to sign in');
    tap(back, 'cloud-change-email');
    t.eq(back.state().cloud.forgot, false, '…and spends the reset');
    t.includes(html(back), 'id="cloud-password"', '…back on the password card');
  });

  /* ------------------------------------------------------------------ 78d */
  await t.group('78d — Set or change password: the rule, the match, a PUT of the password alone (3A 4B 5A)', async () => {
    const rule = (p) => freshApp().fn('cloudPasswordProblem')(p);
    const app0 = freshApp();
    const P = app0.fn('cloudPasswordProblem');
    t.includes(P('abc123'), 'at least 8', '6 characters: too short');
    t.includes(P('abcdefg1'.slice(0, 7)), 'at least 8', '7: too short');
    t.includes(P('abcdefgh'), 'number', 'letters only: needs a number');
    t.includes(P('12345678'), 'letter', 'numbers only: needs a letter');
    t.includes(P('a1' + 'x'.repeat(71)), '72', '73 characters: too long (bcrypt’s limit)');
    t.eq(P('patgo2026'), '', '8+ with a letter and a number: fine');
    t.eq(P('a1' + 'x'.repeat(70)), '', '72 exactly: fine');
    t.eq(P('ABCDEFG9'), '', 'capitals count as letters');
    t.includes(P('éééééé99'), 'letter', 'letters are the server’s (a–z, A–Z)');
    t.eq(rule('Tr0ub4dor'), '', 'the rule is the same on any copy');

    const app = boot();
    const srv = fakeServer();
    installLibrary(app, srv.fetchImpl);
    await signedInWithCode(app);
    t.ok(/id="cloud-password-open"[^>]*>Set or change password</.test(html(app)), 'signed in: Set or change password');
    tap(app, 'cloud-password-open');
    const st = app.state();
    t.eq(st.cloud.pwOpen, true, 'opens the card');
    const page = html(app);
    t.includes(page, 'id="cloud-new-password-form"', 'in a form');
    t.ok(/<input type="email" autocomplete="username"[^>]*value="peter@example.com" hidden/.test(page), 'a hidden username box tells the iPhone whose password it is');
    t.ok(/id="cloud-new-password"[^>]*autocomplete="new-password"/.test(page), 'new-password (the iPhone can suggest a strong one)');
    t.ok(/id="cloud-new-password2"[^>]*autocomplete="new-password"/.test(page), '…both boxes');
    t.includes(page, 'Use at least 8 characters, with a letter and a number.', 'the rule is shown');
    t.excludes(page, 'urrent password', 'no current password asked (5A)');
    t.excludes(page, 'id="cloud-check"', 'the other buttons make way for the card');

    const puts = () => srv.calls.filter(c => c.path === '/auth/v1/user' && c.method === 'PUT');
    const fill = (a, b) => { app.doc.getElementById('cloud-new-password').value = a; app.doc.getElementById('cloud-new-password2').value = b; };
    fill('short1', 'short1');
    t.notOk(await app.fn('cloudPasswordSave')(), 'too short: refused');
    t.includes(st.cloud.message, 'at least 8', '…and why');
    fill('patgo2026', 'patgo2027');
    t.notOk(await app.fn('cloudPasswordSave')(), 'boxes differ: refused');
    t.includes(st.cloud.message, 'don’t match', '…and why');
    t.eq(puts().length, 0, 'no request for either');

    fill(PW_CANARY, PW_CANARY);
    tap(app, 'cloud-password-save');
    await tick(10);
    t.eq(puts().length, 1, 'a good password: one PUT /auth/v1/user');
    // The library adds empty PKCE fields (code_challenge: null) on its own; what
    // counts is that nothing but the password carries a value.
    const sent = (puts()[0] || {}).body || {};
    t.deepEq(Object.keys(sent).filter(k => sent[k] != null).sort(), ['password'], '…carrying the password alone — no current password, no nonce');
    t.eq(sent.password, PW_CANARY, '…exactly as typed');
    t.eq(st.cloud.pwOpen, false, 'the card closes');
    t.includes(st.cloud.message, 'Password saved', '…Password saved');
    t.includes(html(app), 'id="cloud-check"', 'the Account buttons are back');
    t.excludes(kept(app), PW_CANARY, 'the new password is kept nowhere either');

    // The server's refusals, plainly.
    const answers = [
      [{ code: 'same_password', error_code: 'same_password', msg: 'New password should be different from the old password.' }, 422, 'already your password'],
      [{ code: 'weak_password', error_code: 'weak_password', msg: 'Password is known to be weak and easy to guess', weak_password: { reasons: ['pwned'] } }, 422, 'known data leak'],
      [{ code: 'weak_password', error_code: 'weak_password', msg: 'Password should contain at least one character of each', weak_password: { reasons: ['characters'] } }, 422, 'turned that password down'],
      [{ code: 'over_request_rate_limit', msg: 'rate limit' }, 429, 'Too many tries'],
    ];
    for (const [body, status, says] of answers) {
      const a = boot();
      installLibrary(a, fakeServer({ '/auth/v1/user': (b) => json(body, status) }).fetchImpl);
      await signedInWithCode(a);
      a.fn('cloudPasswordOpen')();
      a.doc.getElementById('cloud-new-password').value = 'patgo2026';
      a.doc.getElementById('cloud-new-password2').value = 'patgo2026';
      t.notOk(await a.fn('cloudPasswordSave')(), `${body.code}: false`);
      t.includes(a.state().cloud.message, says, `${body.code}: “${says}”`);
      t.eq(a.state().cloud.pwOpen, true, `${body.code}: the card stays open to try again`);
    }
    // Cancel closes without a request; nothing opens it while signed out.
    const c = boot();
    installLibrary(c, fakeServer().fetchImpl);
    await signedInWithCode(c);
    c.fn('cloudPasswordOpen')();
    tap(c, 'cloud-password-cancel');
    t.eq(c.state().cloud.pwOpen, false, 'Cancel closes the card');
    const out = boot();
    account(out);
    out.fn('cloudPasswordOpen')();
    t.eq(out.state().cloud.pwOpen, false, 'signed out: nothing to set');
  });

  /* ------------------------------------------------------------------ 78e */
  await t.group('78e — release: V139, cache, What’s new, About; wiring; Tutorials (77e’s lasting checks)', async () => {
    const app = freshApp();
    t.eq(app.run('APP_VERSION'), 'V139', 'APP_VERSION V139');
    t.eq(app.run('WELCOME_VERSION'), 'V139', 'What’s new rolled');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v139';", 'cache key pat-v139');
    const core = read('render-core.js');
    const at = core.indexOf('<ul class="welcome-list sheet-scroll">');
    const sheetCopy = core.slice(at, core.indexOf('</ul>', at));
    t.eq((sheetCopy.match(/<li>/g) || []).length, 1, 'What’s new: one line');
    t.includes(sheetCopy, '<li><strong>Sign in with a password.</strong>', '…Sign in with a password');
    t.includes(core, 'New here? Try the practice job.', 'setup offers the practice job');
    t.includes(core, 'You can do it again any time from Settings → Help → Tutorials.', '…and says where it lives');
    const help = read('render-help.js');
    const a = help.indexOf('<p><strong>V139</strong>'), b = help.indexOf('<p><strong>V138</strong>'), c = help.indexOf('<p><strong>V137</strong>');
    t.ok(a > -1 && b > a && c > b, 'About: V139, V138, V137');
    t.excludes(help, '<p><strong>V136</strong>', 'V136 rolled off');
    t.includes(help, 'Cloud accounts can sign in with an email and password, set or change it on the Account page', 'About: V139’s line');
    t.includes(help, 'Show me how now starts on the page you opened it from', 'About: V138’s line still there');
    t.includes(help, 'Show me how: a link under the title of each Settings page a tutorial covers', 'About: V137’s line still there');
    t.includes(help, 'A signed-in phone also tells the cloud which version of the app it is running.', 'Privacy unchanged');
    t.includes(help, 'data-action="settings-page" data-arg="settingsTutorials"', 'About points at Tutorials');

    // Every new tap is wired, guarded, and harmless with cloud.js missing (rule 6).
    const NEW = ['cloud-password-sign-in', 'cloud-forgot', 'cloud-use-code', 'cloud-use-password',
                 'cloud-password-open', 'cloud-password-cancel', 'cloud-password-save', 'cloud-password-toggle'];
    const disp = read('dispatch.js');
    for (const n of NEW) t.ok(new RegExp(`'${n}':\\s*\\([^)]*\\) => \\{ if \\(typeof cloud\\w+ === 'function'\\)`).test(disp), `${n} wired, typeof-guarded`);
    const bare = boot({ skip: ['cloud.js'] });
    const actions = bare.run('ACTIONS');
    for (const n of NEW) t.doesNotThrow(() => actions[n]('', bare.doc.createElement('button')), `${n} harmless without cloud.js`);
    bare.state().view = 'cloudAccount';
    t.doesNotThrow(() => bare.fn('render')(), 'Account page renders without cloud.js');

    // A form never navigates: the submit that follows Sign in / Go is cancelled at #app.
    const f = boot();
    account(f);
    const ev = { type: 'submit', target: f.doc.createElement('form'), defaultPrevented: false,
                 preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
    f.doc.getElementById('app').dispatchEvent(ev);
    t.ok(ev.defaultPrevented, 'a submit on the Account page is cancelled (the app does not reload)');
    t.eq(f.state().cloud.busy, false, '…and runs nothing itself (the click did)');

    // 77e's lasting checks.
    t.eq(app.run("SETTINGS_CATEGORIES.find(c => c.id === 'catHelp').pages[0]"), 'settingsTutorials', 'Tutorials heads the Help group');
    const al = ' ' + app.run('SETTINGS_PAGE_META.settingsTutorials.aliases') + ' ';
    t.ok(/ tutorial /.test(al) && / practice /.test(al), 'search finds it by tutorial or practice');
    t.ok(/ settings /.test(al) && / instrument /.test(al) && / backup /.test(al), '…and by settings, instrument or backup (V135)');
    app.fn('setView')('settingsTutorials');
    const page = html(app);
    t.includes(page, 'data-action="open-practice"', 'the page starts the practice job');
    t.includes(page, 'Nothing you do in it is saved', '…and says nothing is kept');
    const rows = [...page.slice(0, page.indexOf('id="tutorials-cloud-list"')).matchAll(/data-action="open-tutorial" data-arg="([^"]+)"/g)].map(m => m[1]);
    t.deepEq(rows, ['engineer', 'branding', 'content', 'items', 'backup'], 'the page lists the five Settings tutorials under Setting up');
    t.includes(page, 'Nothing you do in them is saved', '…and says nothing is kept');
    t.excludes(page, 'data-action="tut-show-me-how"', 'the Tutorials page itself has no Show me how');
    t.eq(app.run('typeof TOUR_SLIDES'), 'undefined', 'the five picture slides stay retired');
    t.eq(app.run('TUT_STEPS.length'), 21, 'the practice job: 21 steps (V134.1, unchanged)');
    t.includes(read('styles.css'), '.tut-howto-row {', 'the Show me how line has its own style (V137)');
    t.includes(disp, "'tut-show-me-how': (arg) => tutShowMeHow(arg),", 'the tap is wired (V137)');
    t.includes(read('tour.js'), "const TUT_WALK_KEYS = ['group', 'page'];", 'a page tutorial skips the walk (V138)');
  });
};
