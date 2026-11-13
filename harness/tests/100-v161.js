/* Standing test — V161: a signed-out device loses cloud access at once (the second GPT audit, finding 3)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

     100a  the real library (supabase.umd.js) through cloudClient(): the cloud
           refuses a job request, then a photo file, with patgo_signed_out →
           this phone signs itself out (1A): signed-out, the words on the
           Account page, one toast, the stored sign-in gone — the owner and the
           jobs stay (V145). The caller still gets its own error. A photo-file
           refusal alone does the same (2A).
     100b  what does NOT sign out: an ordinary 401 (no code); a refusal for a
           token this phone no longer holds; a good answer; a second refusal
           (once only). The words: the Sync page, the Business page.
     100c  never repaints over typing or an open sheet (MAP rules 2/3).
     100e  the SQL's text: schema.sql carries v161-signed-out.sql's block byte
           for byte as its last section; an error never an empty answer; the run-
           out time (3A); no sign-in passes; the photo rule restrictive; the
           switch last; the undo lines; S1–S3; isolation 28a–28d.
     100f  release: V161; cache pat-v161; What's new NOT rolled (a fix release);
           About V161 / V160 / V159; cloud.js header.

   ⚠ WHAT THIS FILE CANNOT PROVE: that the database refuses. That is
   supabase/v161-signed-out.sql's own checks (S1–S3) and isolation-test.sql
   28a–28d — run at V161 against a local Postgres 16 stand-in (run twice), plus a
   14-step scenario through the real photo-file rules, with seven broken copies
   of the SQL each caught. And that the hosted Data API honours the switch: the
   real-token test on the test project (the handoff's checklist). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { freshApp, tick } = require('../fixture');

const LIB  = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const UID  = '11111111-1111-1111-1111-111111111111';
const AUTH = 'patgo:cloudAuth:test';
const OWN  = 'aaaaaaaa-0000-4000-8000-000000000001';
const TOKEN = 'ZZACCESS161';
const WORDS = 'This phone was signed out from another device. Your jobs are safe here — sign in again to send them.';
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const stored = (list, u = UID, at = Date.now()) => JSON.stringify({ u, at, list });
// What PostgREST sends for V161's pre-request refusal; what Storage sends for the photo rule.
const REFUSED_DATA = () => json({ code: 'patgo_signed_out', message: 'patgo_signed_out: this sign-in has been signed out', details: null, hint: null }, 401);
const REFUSED_FILE = () => json({ statusCode: '400', error: 'DatabaseError', message: 'patgo_signed_out' }, 400);

function storedSession(token = TOKEN) {
  const life = 3600;
  return JSON.stringify({
    access_token: token, token_type: 'bearer', expires_in: life,
    expires_at: Math.floor(Date.now() / 1000) + life, refresh_token: 'ZZREFRESH',
    user: { id: UID, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' },
  });
}

// A pretend Supabase: answers normally until told the sign-in has gone.
function fakeServer() {
  const calls = [];
  const srv = { calls, gone: false, fileGone: false, plain401: false };
  srv.fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const h = init.headers;
    const auth = h && typeof h.get === 'function' ? h.get('Authorization') : (h && (h.Authorization || h.authorization)) || '';
    calls.push({ url: u, method: init.method || 'GET', auth });
    if (u.includes('/auth/v1/logout')) return new Response(null, { status: 204 });
    if (u.includes('/storage/v1/')) {
      if (srv.fileGone || srv.gone) return REFUSED_FILE();
      return new Response('jpegbytes', { status: 200, headers: { 'content-type': 'image/jpeg' } });
    }
    if (u.includes('/rest/v1/')) {
      if (srv.gone) return REFUSED_DATA();
      if (srv.plain401) return json({ code: 'PGRST303', message: 'JWT expired' }, 401);
      if (u.endsWith('/rpc/my_businesses')) return json([{ id: OWN, name: 'Birchley Testing', role: 'owner', is_default: true, members: 1 }]);
      return (init.method || 'GET') === 'GET' ? json([]) : new Response(null, { status: 201 });
    }
    return json({ message: 'unexpected ' + u }, 404);
  };
  return srv;
}

async function signedIn(o = {}) {
  const ls = Object.assign({ [AUTH]: storedSession(), 'pat:cloudUnlocked': '1',
    'pat:owner': JSON.stringify({ id: UID, email: 'peter@example.com', at: 1 }),
    'pat:businesses': stored([{ id: OWN, name: 'Birchley Testing', role: 'owner', def: true, n: 1 }]) }, o.localStorage || {});
  const app = bootApp({ localStorage: ls, navigator: { onLine: false } });
  app.fn('load')();
  app.state = () => app.refresh('state').state;
  const srv = fakeServer();
  const sb = app.sandbox;
  for (const k of ['Headers', 'Request', 'Response', 'AbortController', 'TextEncoder',
                   'TextDecoder', 'URLSearchParams', 'URL', 'atob', 'btoa', 'Blob']) sb[k] = globalThis[k];
  if (!sb.crypto) sb.crypto = globalThis.crypto;
  sb.WebSocket = class {};
  sb.fetch = srv.fetchImpl;
  app.run(LIB);
  app.run('navigator.onLine = true');
  app.srv = srv;
  app.toasts = [];
  sb.showToast = (m) => app.toasts.push(String(m));
  app.run('if (typeof _syncTimer !== "undefined" && _syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }');
  for (let k = 0; k < 100 && app.run("(state.cloud && state.cloud.status) || ''") !== 'signed-in'; k++) await tick(10);
  const st = app.state();
  st.welcomeSeen = true;
  st.migrationPrompt = { show: false, name: '', items: [] };
  return app;
}
async function until(cond, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await tick(10);
  return cond();
}
const status = (app) => app.run("state.cloud.status");
const lsGet = (app, k) => app.run(`localStorage.getItem(${JSON.stringify(k)})`);
// A real request through the library (cloudClient → createClient → _cloudFetch).
const rpc = (app, name) => app.run(`cloudClient().then(c => c.rpc('${name}')).then(r => JSON.stringify({ data: r.data, error: r.error && { code: r.error.code, message: r.error.message } }))`);
const file = (app) => app.run(`cloudClient().then(c => c.storage.from('photos').download('${UID}/x.jpg')).then(r => r.error ? 'error' : 'ok')`);

module.exports = async function () {
  /* ------------------------------------------------------------------ 100a */
  await t.group('100a — refused as signed out (jobs, then photo files): this phone signs itself out, the jobs and owner stay (1A, 2A)', async () => {
    const app = await signedIn();
    t.eq(status(app), 'signed-in', 'signed in to start');
    t.deepEq(JSON.parse(await rpc(app, 'my_businesses')).data.length, 1, 'a good answer goes straight through');
    t.eq(status(app), 'signed-in', '…and changes nothing');
    const sent = app.srv.calls.find(c => c.url.endsWith('/rpc/my_businesses'));
    t.eq(sent.auth, 'Bearer ' + TOKEN, 'the request went through the library with this phone’s token');
    const jobsBefore = app.run('JSON.stringify(state.sessions.map(s => s.id))');

    app.srv.gone = true;
    const r = JSON.parse(await rpc(app, 'my_businesses'));
    t.eq(r.error && r.error.code, 'patgo_signed_out', 'the caller still gets its own error (the code)');
    t.eq(r.data, null, '…and no rows — never an empty answer');
    await until(() => status(app) === 'signed-out');
    t.eq(status(app), 'signed-out', '1A: signed out on this phone');
    t.eq(app.run('state.cloud.message'), WORDS, 'the Account page says why');
    t.deepEq(app.toasts, ['This phone was signed out from another device.'], 'one toast');
    t.eq(lsGet(app, AUTH), null, 'the stored sign-in is gone');
    t.eq(JSON.parse(lsGet(app, 'pat:owner')).id, UID, 'V145: the owner stays — the jobs wait for that account');
    t.eq(app.run('JSON.stringify(state.sessions.map(s => s.id))'), jobsBefore, 'the jobs on this phone untouched');
    app.fn('setView')('cloudAccount');
    t.includes(app.doc.getElementById('app').innerHTML, 'This phone was signed out from another device. Your jobs are safe here', 'the Account page shows the words');

    // 2A: a photo file refused on its own does the same.
    const p = await signedIn();
    p.srv.fileGone = true;
    t.eq(await file(p), 'error', 'a photo file on a gone sign-in: an error, not a file');
    await until(() => status(p) === 'signed-out');
    t.eq(status(p), 'signed-out', '2A: a photo-file refusal signs this phone out too');
    t.eq(p.run('state.cloud.message'), WORDS, '…with the same words');
  });

  /* ------------------------------------------------------------------ 100b */
  await t.group('100b — no sign-out for an ordinary 401, an old token, a good answer; once only; the Sync and Business words', async () => {
    const a = await signedIn();
    a.srv.plain401 = true;
    const r = JSON.parse(await rpc(a, 'my_businesses'));
    t.eq(r.error && r.error.code, 'PGRST303', 'an ordinary 401 reaches the caller');
    await tick(50);
    t.eq(status(a), 'signed-in', '…and does not sign this phone out');
    t.deepEq(a.toasts, [], '…no toast');

    // A refusal carrying a token this phone no longer holds (signed in again meanwhile).
    const b = await signedIn();
    b.srv.gone = true;
    b.run(`localStorage.setItem(${JSON.stringify(AUTH)}, ${JSON.stringify(storedSession('ZZNEWER'))})`);
    await b.run(`_cloudFetch('https://x.supabase.co/rest/v1/rpc/my_businesses', { method: 'POST', headers: { Authorization: 'Bearer ${TOKEN}' } }).then(r => r.status)`);
    await tick(50);
    t.eq(status(b), 'signed-in', 'an old token’s refusal is not this sign-in’s');
    await b.run(`_cloudFetch('https://x.supabase.co/rest/v1/rpc/my_businesses', { method: 'POST', headers: new Headers({ Authorization: 'Bearer ZZNEWER' }) }).then(r => r.status)`);
    await until(() => status(b) === 'signed-out');
    t.eq(status(b), 'signed-out', '…the current token’s refusal is (Headers read too)');

    // Once only.
    const c = await signedIn();
    c.srv.gone = true;
    await rpc(c, 'my_businesses');
    await until(() => status(c) === 'signed-out');
    t.eq(c.fn('cloudSignedOutElsewhere')(), false, 'a second refusal finds it already signed out');
    t.eq(c.toasts.length, 1, '…one toast only');

    // The words wherever the error lands.
    const e = { code: 'patgo_signed_out', message: 'patgo_signed_out: this sign-in has been signed out', status: 401 };
    t.eq(c.fn('syncErrorMessage')(e), WORDS, 'the Sync page: the words, not "sign-in has lapsed"');
    t.eq(c.fn('syncErrorMessage')({ status: 401, code: 'PGRST303', message: 'JWT expired' }),
      'Your sign-in has lapsed. Sign out and back in on the Account page.', '…an ordinary lapse unchanged');
    t.eq(c.fn('businessTeamError')(e), WORDS, 'the Business page: the words');
    t.eq(c.fn('cloudSignedOutCode')('{"code":"patgo_signed_out"}'), true, 'the code recognised');
    t.eq(c.fn('cloudSignedOutCode')('{"code":"PGRST303"}'), false, '…nothing else');
  });

  /* ------------------------------------------------------------------ 100c */
  await t.group('100c — signed out without repainting over typing or an open sheet', async () => {
    const app = await signedIn();
    app.run('globalThis.__renders = 0; const __r = render; render = function () { globalThis.__renders++; return __r.apply(this, arguments); };');
    app.run('_syncSafeToRepaint = function () { return false; };');
    t.eq(app.fn('cloudSignedOutElsewhere')(), true, 'signed out');
    t.eq(app.run('globalThis.__renders'), 0, 'not safe to repaint: no render');
    t.eq(status(app), 'signed-out', '…the state still says signed out (the next paint shows it)');
    const ok = await signedIn();
    ok.run('globalThis.__renders = 0; const __r = render; render = function () { globalThis.__renders++; return __r.apply(this, arguments); };');
    ok.fn('cloudSignedOutElsewhere')();
    t.eq(ok.run('globalThis.__renders'), 1, 'safe: one repaint');
  });

  /* ------------------------------------------------------------------ 100e */
  await t.group('100e — the SQL: schema.sql in step; an error never empty; run-out (3A); no sign-in passes; photo rule restrictive; S1–S3; isolation 28a–28d', () => {
    const mig = read('supabase/v161-signed-out.sql');
    const block = mig.slice(mig.indexOf('-- ================================================================ V161'),
      mig.indexOf('-- ================================================================ self-checks')).trimEnd();
    t.ok(block.length > 1500, 'the migration has its definition');
    t.ok(read('supabase/schema.sql').trimEnd().endsWith(block), 'a new project gets it byte for byte, as schema.sql’s last section');
    t.includes(block, "  select q.s is null\n      or exists (select 1 from auth.sessions x\n                 where x.id = q.s and (x.not_after is null or x.not_after > now()))\n",
      'no sign-in passes; otherwise it must exist and not be run out (3A)');
    t.includes(block, "    raise sqlstate 'PGRST' using\n      message = json_build_object('code', 'patgo_signed_out',", 'refused with an error and the code');
    t.includes(block, "      detail = json_build_object('status', 401)::text;", '…401');
    t.includes(block, "  if not public._request_signed_in() then raise exception 'patgo_signed_out'; end if;\n  return true;", 'photo files: raised, never a quiet false');
    t.includes(block, '  as restrictive for all to authenticated\n', '2A: photo files — a restrictive rule beside the four');
    t.includes(block, 'revoke all on function public._request_signed_in() from public, anon, authenticated;', 'the inner check closed to phones');
    t.includes(block, 'grant execute on function public.patgo_check_request() to anon, authenticated, service_role;', 'every API role runs the check');
    const sw = "alter role authenticator set pgrst.db_pre_request = 'public.patgo_check_request';\nnotify pgrst, 'reload config';";
    t.ok(block.indexOf(sw) > block.indexOf('create policy "photo files need a live sign-in"'), 'switched on last, once the check exists');
    t.includes(mig, "--   alter role authenticator reset pgrst.db_pre_request;\n--   notify pgrst, 'reload config';\n--   drop policy if exists \"photo files need a live sign-in\" on storage.objects;", 'the undo lines at the top');
    for (const c of ['S1', 'S2', 'S3']) t.includes(mig, `'${c}|`, `self-check ${c}`);
    const iso = read('supabase/isolation-test.sql');
    for (const c of ['28a', '28b', '28c', '28d']) t.includes(iso, `'${c}|`, `isolation ${c}`);
    t.includes(iso, '-- V161: CHECKS 28a–28d NEED supabase/v161-signed-out.sql RUN FIRST', 'isolation: the note at the top');
    t.includes(iso, "    -- 28d: put back.\n    delete from auth.sessions where user_agent = 'patgo-iso-test-161';\n", 'isolation: the pretend sign-in removed (28d)');
  });

  /* ------------------------------------------------------------------ 100f */
  await t.group('100f — release: V161; cache pat-v161; What’s new not rolled; About V161 / V160 / V159', () => {
    const rel = freshApp();
    t.eq(rel.run('APP_VERSION'), 'V161', 'APP_VERSION V161');
    t.eq(rel.run('WELCOME_VERSION'), 'V157', 'What’s new NOT rolled (a fix release)');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v161';", 'cache key pat-v161');
    t.eq(rel.fn('updateVersionLabel')('pat-v161'), 'V161', 'the update banner reads the key as V161');
    const help = read('render-help.js');
    const x = help.indexOf('<p><strong>V161</strong>'), y = help.indexOf('<p><strong>V160</strong>'), z = help.indexOf('<p><strong>V159</strong>');
    t.ok(x > -1 && y > x && z > y, 'About: V161, V160, V159');
    t.excludes(help, '<p><strong>V158</strong>', 'V158 rolled off');
    t.includes(help, 'loses cloud access straight away, not up to an hour later', 'About: V161’s line');
    t.includes(help, 'Joining a business checks its phones again', 'About: V160’s line still there');
    t.includes(read('cloud.js'), 'V161: signed out from another device', 'cloud.js header names V161');
  });
};
