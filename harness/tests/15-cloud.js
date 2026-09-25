/* Standing test — cloud sign-in (V79)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. cloud.js adds email-code sign-in to a Supabase
   project chosen by HOSTNAME (config.js CLOUD_HOSTS). Nothing about a job,
   client, site or setting leaves the phone. The V43 mock sign-in is retired:
   backups no longer carry sign-in details and restore ignores old ones.

   ⚠ WHY 15f DRIVES THE REAL VENDORED LIBRARY. A test that stubs supabase-js
   proves only that cloud.js calls the stub the way the stub expects. Here the
   actual supabase.umd.js runs inside the app's vm context against a fake
   `fetch`, so the assertions are on the HTTP requests the library really
   makes — including `create_user: false`, which is the whole reason nobody can
   create an account from the public test URL.

   ⚠ WHY BOOT IS OBSERVED THROUGH opts.fetch. "Signed out = no network" is a
   claim about boot.js, and boot has finished before a test body can install a
   spy. The spy has to be in the environment from the first line.

   ⚠ WHAT THIS FILE CANNOT PROVE. Row-level security. That lives in Postgres
   and is proved by supabase/isolation-test.sql, run by hand every release and
   recorded in the handoff. Nothing here is evidence that one engineer cannot
   read another's rows. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { tick, CANARY } = require('../fixture');

const LIB = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');

function boot(opts = {}) {
  const app = bootApp(opts);
  app.state = () => app.refresh('state').state;
  // V85: the cloud pages paint only once the phone is past the access code.
  // This file tests the pages themselves, so every boot here is unlocked; the
  // code box is group 22's subject. (Seeded after boot: the check is live.)
  app.sandbox.localStorage.setItem('pat:cloudUnlocked', '1');
  return app;
}

/* A stored session exactly as supabase-js writes it (the shape the library
   reads back). The refresh token is a canary so leakage checks can find it. */
const REFRESH_CANARY = 'ZZREFRESHTOKENCANARY';
function storedSession(email = 'peter@example.com') {
  return JSON.stringify({
    access_token: 'ZZACCESS',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: REFRESH_CANARY,
    user: { id: '11111111-1111-1111-1111-111111111111', email, aud: 'authenticated', role: 'authenticated' },
  });
}

/* Give the sandbox what a browser has and the stub layer does not, then run
   the vendored library in it exactly as the lazy <script> would. */
function installLibrary(app, fetchImpl) {
  const sb = app.sandbox;
  // ⚠ Overwritten unconditionally: the stub layer's URL is a minimal fake for
  // object URLs, and supabase-js rejects the project URL through it.
  for (const k of ['Headers', 'Request', 'Response', 'AbortController', 'TextEncoder',
                   'TextDecoder', 'URLSearchParams', 'URL', 'atob', 'btoa']) {
    sb[k] = globalThis[k];
  }
  if (!sb.crypto) sb.crypto = globalThis.crypto;
  sb.WebSocket = class {};            // realtime is constructed, never connected
  sb.fetch = fetchImpl;
  app.run(LIB);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/* A fake Supabase: records every request, answers the four endpoints V79 uses. */
function fakeServer(overrides = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: u, method: init.method || 'GET', body });
    if (overrides[u.split('?')[0].replace(/^https:\/\/[^/]+/, '')]) {
      return overrides[u.split('?')[0].replace(/^https:\/\/[^/]+/, '')](body);
    }
    if (u.includes('/auth/v1/otp'))    return jsonResponse({});
    if (u.includes('/auth/v1/verify')) {
      return jsonResponse({
        access_token: 'ZZACCESS', token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: REFRESH_CANARY,
        user: { id: '11111111-1111-1111-1111-111111111111', email: 'peter@example.com',
                aud: 'authenticated', role: 'authenticated' },
      });
    }
    if (u.includes('/rest/v1/profiles')) return jsonResponse([{ plan: 'trial', trial_ends_at: '2026-10-19T00:00:00Z' }]);
    if (u.includes('/auth/v1/logout'))  return new Response(null, { status: 204 });
    return jsonResponse({ message: 'unexpected ' + u }, 404);
  };
  return { calls, fetchImpl };
}

module.exports = async function () {
  /* ------------------------------------------------------------------ 15a */
  t.group('15a — the host decides the environment, and unknown means OFF', () => {
    const cases = [
      ['exnno.github.io', 'test', true],
      ['pat-test-app.peterbirchley.workers.dev', 'prod', false],   // product: no keys yet
      ['localhost', 'off', false],
      ['app.patgo.co.uk', 'off', false],                           // never set up
      ['exnno.github.io.evil.example', 'off', false],
    ];
    for (const [host, env, avail] of cases) {
      const app = boot({ hostname: host });
      t.eq(app.run('CLOUD_ENV'), env, `${host} → CLOUD_ENV ${env}`);
      t.eq(app.fn('cloudAvailable')(), avail, `${host} → cloudAvailable() ${avail}`);
      t.eq(app.state().cloud.status, avail ? 'signed-out' : 'off',
        `${host} → boot status ${avail ? 'signed-out' : 'off'}`);
      if (!avail) t.eq(app.run('CLOUD.url'), '', `${host} → no project URL reachable`);
    }
    // The storage key carries the environment, so a test session can never be
    // read as a production one.
    t.eq(boot().run('CLOUD_AUTH_STORAGE_KEY'), 'patgo:cloudAuth:test', 'session key is per-environment');
  });

  /* ------------------------------------------------------------------ 15b */
  await t.group('15b — signed out, boot makes NO request and loads NO library', async () => {
    const calls = [];
    const app = boot({ fetch: async (u) => { calls.push(String(u)); throw new Error('offline'); } });
    await tick(5);
    t.eq(app.state().cloud.status, 'signed-out', 'test host, nobody signed in');
    t.eq(calls.length, 0, 'boot made no network request');
    t.eq(app.run('_cloudClientPromise'), null, 'library was never requested');
    t.excludes(app.doc.getElementById('app').innerHTML, 'cloud-test-strip', 'no TEST strip for a signed-out user');
  });

  /* ------------------------------------------------------------------ 15c */
  await t.group('15c — signed in + offline: still signed in, TEST marked, no request', async () => {
    const calls = [];
    const app = boot({
      localStorage: { 'patgo:cloudAuth:test': storedSession('peter@example.com') },
      navigator: { onLine: false },
      fetch: async (u) => { calls.push(String(u)); throw new Error('offline'); },
    });
    await tick(5);
    const st = app.state();
    t.eq(st.cloud.status, 'signed-in', 'stored session read synchronously at boot');
    t.eq(st.cloud.email, 'peter@example.com', 'email taken from the stored session');
    t.eq(calls.length, 0, 'offline boot made no request');
    t.eq(app.run('_cloudClientPromise'), null, 'offline boot did not load the library');
    t.includes(app.doc.getElementById('app').innerHTML, 'id="cloud-test-strip"', 'TEST strip on the first paint');
    t.eq(app.fn('cloudVersionTag')(), ' TEST', 'version string carries TEST');
    // Sign-out with the library never loaded (offline all along) must still
    // remove the session — the direct-removal fallback in cloudSignOut().
    await app.fn('cloudSignOut')();
    t.eq(app.storage.getItem('patgo:cloudAuth:test'), null, 'offline sign-out removed the stored session');
    t.eq(st.cloud.status, 'signed-out', 'offline sign-out took effect');
    // The same session on a host with no cloud shows nothing.
    const other = boot({ hostname: 'localhost', localStorage: { 'patgo:cloudAuth:test': storedSession() } });
    t.eq(other.state().cloud.status, 'off', 'no cloud host ignores a stored test session');
    t.excludes(other.doc.getElementById('app').innerHTML, 'cloud-test-strip', 'and shows no strip');
  });

  /* ------------------------------------------------------------------ 15d */
  await t.group('15d — backups never carry sign-in; restore never signs anyone in', async () => {
    const app = boot({ localStorage: { 'patgo:cloudAuth:test': storedSession() }, navigator: { onLine: false } });
    const text = JSON.stringify(app.fn('buildBackup')());
    t.excludes(text, REFRESH_CANARY, 'backup does not contain the refresh token');
    t.excludes(text, 'ZZACCESS', 'backup does not contain the access token');
    t.excludes(text, 'authUser', 'backup has no authUser field at all');
    t.excludes(text, 'patgo:cloudAuth', 'backup does not name the session key');

    // An old (V43–V78) backup carrying the mock block, restored onto a
    // signed-OUT phone, must leave it signed out and write no credential.
    const fresh = boot();
    const old = JSON.parse(JSON.stringify(fresh.fn('buildBackup')()));
    old.authUser = { userId: 'ZZMOCKUSER', authToken: 'ZZMOCKTOKEN', loginTime: '2026-01-01T00:00:00Z' };
    const file = new fresh.sandbox.File([JSON.stringify(old)], 'old.json', { type: 'application/json' });
    fresh.fn('restoreBackupFromFile')(file);
    await tick(5);
    const yes = fresh.doc.getElementById('confirm-sheet-yes');
    t.ok(!!yes, 'restore raised its confirm sheet');
    if (yes) yes.click();
    await tick(5);
    const st = fresh.state();
    t.eq(st.cloud.status, 'signed-out', 'still signed out after restoring an old backup');
    t.eq(fresh.storage.getItem('pat:authUser'), null, 'mock key not written back');
    t.eq(fresh.storage.getItem('patgo:cloudAuth:test'), null, 'no session invented');
    t.notOk('userId' in st && st.userId, 'no mock userId resurrected on state');
  });

  /* ------------------------------------------------------------------ 15e */
  t.group('15e — the V43 mock key is deleted at load', () => {
    const app = boot({ localStorage: { 'pat:authUser': JSON.stringify({ userId: 'ZZMOCK', authToken: 'ZZTOK' }) } });
    t.eq(app.storage.getItem('pat:authUser'), null, 'pat:authUser removed on boot');
    t.eq(app.state().cloud.status, 'signed-out', 'and it did not sign anyone in');
  });

  /* ------------------------------------------------------------------ 15f */
  await t.group('15f — the REAL library: send code → verify → profile → sign out', async () => {
    const app = boot();
    const srv = fakeServer();
    installLibrary(app, srv.fetchImpl);
    const st = app.state();
    st.view = 'cloudAccount';
    app.fn('render')();

    const emailEl = app.doc.getElementById('cloud-email');
    t.ok(!!emailEl, 'signed-out Account page shows an email field');
    emailEl.value = '  Peter@Example.com ';
    t.ok(await app.fn('cloudSendCode')(), 'send-code resolved true');
    const otp = srv.calls.find(c => c.url.endsWith('/auth/v1/otp'));
    t.ok(!!otp, 'a request went to /auth/v1/otp');
    t.eq(otp && otp.url.indexOf('https://wawxhlltbddkjkuyfake.supabase.co'), 0, 'to the TEST project');
    t.eq(otp && otp.body.email, 'peter@example.com', 'email trimmed and lower-cased');
    t.eq(otp && otp.body.create_user, false, 'create_user is false — nobody can sign up from the app');
    t.eq(st.cloud.status, 'code-sent', 'page moved to the code step');
    t.ok(!!app.doc.getElementById('cloud-code'), 'code field painted');
    // V85 2A: forget the unlock the boot helper seeded, so the check after
    // sign-out can only pass if the SIGN-IN itself remembered it. (The code
    // field's value is read before the page next repaints.)
    app.storage.removeItem('pat:cloudUnlocked');

    app.doc.getElementById('cloud-code').value = '123 456';
    t.ok(await app.fn('cloudVerifyCode')(), 'verify resolved true');
    await tick(5);
    const ver = srv.calls.find(c => c.url.endsWith('/auth/v1/verify'));
    t.eq(ver && ver.body.token, '123456', 'code sent digits-only');
    t.eq(ver && ver.body.type, 'email', 'verified as an email OTP');
    t.eq(st.cloud.status, 'signed-in', 'signed in');
    const saved = app.storage.getItem('patgo:cloudAuth:test');
    t.ok(saved && saved.includes(REFRESH_CANARY), 'the library persisted the session under OUR key');
    t.ok(srv.calls.some(c => c.url.includes('/rest/v1/profiles')), 'sign-in was followed by a profile read');
    t.eq(st.cloud.plan, 'trial', 'plan read back from the profile row');
    t.includes(app.doc.getElementById('app').innerHTML, 'id="cloud-test-strip"', 'TEST strip now showing');

    t.ok(await app.fn('cloudSignOut')(), 'sign-out resolved');
    t.eq(st.cloud.status, 'signed-out', 'signed out');
    t.eq(app.storage.getItem('patgo:cloudAuth:test'), null, 'session removed from storage');
    t.excludes(app.doc.getElementById('app').innerHTML, 'id="cloud-test-strip"', 'strip gone');
    t.eq(app.storage.getItem('pat:cloudUnlocked'), '1', 'the sign-in remembered the Cloud unlock; signing out kept it (V85 2A)');
  });

  /* ------------------------------------------------------------------ 15g */
  await t.group('15g — failures read as plain language', async () => {
    const app = boot();
    const srv = fakeServer({
      '/auth/v1/otp': () => jsonResponse({ code: 'otp_disabled', error_code: 'otp_disabled',
                                            msg: 'Signups not allowed for otp' }, 422),
    });
    installLibrary(app, srv.fetchImpl);
    const st = app.state();
    st.view = 'cloudAccount';
    app.fn('render')();
    app.doc.getElementById('cloud-email').value = 'stranger@example.com';
    t.notOk(await app.fn('cloudSendCode')(), 'unknown email: send resolves false');
    t.includes(st.cloud.message, 'isn\u2019t set up', 'unknown email explained');
    t.eq(st.cloud.status, 'signed-out', 'stays on the email step');
    t.eq(st.cloud.busy, false, 'busy cleared after a failure');

    const app2 = boot();
    installLibrary(app2, async () => { throw new TypeError('Failed to fetch'); });
    app2.state().view = 'cloudAccount';
    app2.fn('render')();
    app2.doc.getElementById('cloud-email').value = 'peter@example.com';
    t.notOk(await app2.fn('cloudSendCode')(), 'network failure: send resolves false');
    t.includes(app2.state().cloud.message, 'reach the server', 'no-signal explained');

    const app3 = boot();
    app3.state().view = 'cloudAccount';
    app3.fn('render')();
    app3.doc.getElementById('cloud-email').value = 'not-an-email';
    t.notOk(await app3.fn('cloudSendCode')(), 'bad address rejected before any request');
    t.eq(app3.run('_cloudClientPromise'), null, 'and the library was not even loaded');
  });

  /* ------------------------------------------------------------------ 15h */
  t.group('15h — async results never repaint over a focused field', () => {
    const app = boot();
    const st = app.state();
    st.view = 'cloudAccount';
    app.fn('render')();
    const appEl = app.doc.getElementById('app');
    const field = app.doc.getElementById('cloud-email');
    // Registered stub elements are all DIVs (see stubs.js); in a browser this
    // is an <input>. Give it the tag it really has.
    field.tagName = 'INPUT';
    field.focus();
    appEl.innerHTML = 'ZZSENTINEL';
    app.fn('_cloudRepaint')();
    t.eq(appEl.innerHTML, 'ZZSENTINEL', 'no render while an input has focus');
    field.blur();
    app.fn('_cloudRepaint')();
    t.includes(appEl.innerHTML, 'cloud-account-page', 'renders once focus has gone');
    st.view = 'entry';
    appEl.innerHTML = 'ZZSENTINEL';
    app.fn('_cloudRepaint')();
    t.eq(appEl.innerHTML, 'ZZSENTINEL', 'never repaints a screen other than Account');
  });

  /* ------------------------------------------------------------------ 15i */
  t.group('15i — the app boots and every cloud tap is a no-op without cloud.js', () => {
    const app = boot({ skip: ['cloud.js'] });
    t.ok(app.doc.getElementById('app').innerHTML.length > 0, 'first screen painted without cloud.js');
    const actions = app.run('typeof ACTIONS !== "undefined" ? ACTIONS : null');
    t.ok(!!actions, 'dispatch table reachable');
    for (const a of ['cloud-send-code', 'cloud-verify-code', 'cloud-change-email', 'cloud-check', 'cloud-sign-out']) {
      t.doesNotThrow(() => actions[a](), `${a} is harmless with cloud.js missing`);
    }
    app.state().view = 'cloudAccount';
    t.doesNotThrow(() => app.fn('render')(), 'Account page renders with cloud.js missing');
  });

  /* ------------------------------------------------------------------ 15k */
  t.group('15k — the lazy library is shipped and precached', () => {
    const { swAssetScripts, readConst } = require('../load');
    const src = readConst('cloud.js', 'CLOUD_LIB_SRC');
    const file = String(src || '').replace(/^\.\//, '');
    t.ok(fs.existsSync(path.join(APP_DIR, file)), `${file} exists in the repo`);
    t.ok(swAssetScripts().includes(file), `${file} is in sw.js ASSETS (works offline after an update)`);
    t.includes(LIB.slice(0, 300), 'MIT', 'vendored file keeps its licence notice');
  });

  /* ------------------------------------------------------------------ 15j */
  t.group('15j — the two rolling mutation anchors point at THIS release', () => {
    // V78 shipped with M66 and M82 still anchored on V77 / V75, so both aborted
    // and proved nothing. This makes the next miss a red run instead.
    const mut = fs.readFileSync(path.join(APP_DIR, 'harness', 'mutate.js'), 'utf8');
    const cfg = fs.readFileSync(path.join(APP_DIR, 'config.js'), 'utf8');
    const rh  = fs.readFileSync(path.join(APP_DIR, 'render-help.js'), 'utf8');
    const ver = (cfg.match(/const APP_VERSION = '([^']+)'/) || [])[1];
    t.includes(mut, `from: "const APP_VERSION = '${ver}';"`, `M66 anchored on APP_VERSION ${ver}`);
    // v81.3: dotted versions, as 09w was widened at v81.1. This pattern survived
    // two hotfixes only because an undotted entry was still at the bottom of the
    // changelog; the first release where every entry is dotted, it found none.
    const entries = rh.match(/<p><strong>V\d+(?:\.\d+)?<\/strong> &middot; [A-Za-z]+ \d{4}<\/p>/g) || [];
    const oldest = entries[entries.length - 1] || '(none)';
    t.includes(mut, `from: '        ${oldest}'`, `M82 anchored on the oldest changelog entry (${oldest})`);
  });
};
