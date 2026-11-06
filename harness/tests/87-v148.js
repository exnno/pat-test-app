/* Standing test — V148: the launch switch
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID (Peter, 2 Nov: 1A 2A 3A 4A 5A, all defaults; plus his
   question "with 148 live essentially nothing changes?" — so 4A only applies
   where the wall is on). Built now, dormant: the product address needs an
   account, but it has no cloud until the Pro project exists, and no cloud = no
   wall. The test site never walls anyone; a phone opened at ?wall sees it.
     1A  where: REQUIRE_ACCOUNT.prod only (config.js); ?wall / ?wall=off per phone.
     2A  the wall is its own first screen — Create an account (big), Sign in —
         then V144's own cards, shared with the Account page.
     3A  a phone already holding jobs is told they go up at sign-in, and can
         save a copy first (Export everything) without an account.
     4A  ⚠ PETER'S RULE: no lack of signal may sign anyone out or stop them
         working. A phone WITH an owner is never walled — signed out, lapsed,
         revoked, offline. Where the wall is on, its plan follows the owner
         (signing out gets round no lock) and a line asks it to sign in again.
     5A  the access code stays on the test site, never shown where the wall is on.

     87a  where the switch is on: the environments, no cloud = no wall, ?wall
          and ?wall=off through a real start-up, the curtain (5A).
     87b  the wall through the real render and taps (2A 3A): the start, the
          cards, Back, offline, the jobs on the phone and Save a copy first,
          one screen title, the update banner and the safe moment.
     87c  Peter's rule (4A): an owner is never walled — signed out, a restart
          with no signal, a login the stand-in server refuses to refresh or
          can't reach (the REAL library); a new account finishes its password
          on the wall, and then the wall goes.
     87d  4A the plan follows the owner where the wall is on — locked or
          unchecked, signed out, the way on is Sign in; on the test site
          nothing changed (signed out = no plan, as V147).
     87e  (V149: its release checks moved to 88e.) The Account page uses the shared cards; reset and takeover keep the
          ?wall key right; wiring; release: V148, cache, no What's new, About.
          Plus 86e's release checks (86e keeps its lasting ones). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { freshApp, withSession, withItem, tick } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const LIB  = read('supabase.umd.js');
const DAY = 86400000;
const AUTH = 'patgo:cloudAuth:test';
const PROD = 'pat-test-app.peterbirchley.workers.dev';
const A = { id: '11111111-1111-1111-1111-111111111111', email: 'a@example.com' };
const iso = (ms) => new Date(ms).toISOString();

function boot(opts = {}) {
  const app = bootApp(opts);
  app.fn('load')();
  app.state = () => app.refresh('state').state;
  app.html = () => app.doc.getElementById('app').innerHTML;
  app.draw = () => { app.fn('render')(); return app.html(); };
  app.toasts = [];
  app.sandbox.showToast = (m) => app.toasts.push(String(m));
  return app;
}
// A tap exactly as the browser delivers it, through #app's delegation.
function tap(app, action, arg) {
  const el = app.doc.createElement('button');
  el.dataset.action = action;
  if (arg !== undefined) el.dataset.arg = String(arg);
  app.doc.getElementById('app').dispatchEvent({
    type: 'click', target: el, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
  });
}
// The action on the rendered element with this id — read off the screen, never
// named by the test (the V67 lesson).
function actionOf(html, id) {
  const m = html.match(new RegExp(`id="${id}"[^>]*data-action="([^"]+)"`));
  return m ? m[1] : null;
}
function tapId(app, id) {
  const html = app.html();
  const a = actionOf(html, id);
  if (!a) throw new Error('harness: no button #' + id + ' on screen');
  const arg = (html.match(new RegExp(`id="${id}"[^>]*data-arg="([^"]*)"`)) || [])[1];
  tap(app, a, arg);
}
const owned = (who) => JSON.stringify({ id: who.id, email: who.email, at: iso(Date.now() - 50 * DAY) });
const sheetsText = (app) => app.doc.body.children
  .filter(c => c && /bulk-sheet/.test(c.className || '')).map(c => c.innerHTML || '').join('\n');
const walled = (html) => html.indexOf('id="account-wall"') !== -1;

// ---- the real library against a stand-in server (87c) -----------------------
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
function user(who) {
  const made = Date.now() - 200 * DAY;
  return { id: who.id, email: who.email, aud: 'authenticated', role: 'authenticated',
    created_at: iso(made), email_confirmed_at: iso(made), confirmed_at: iso(made), last_sign_in_at: iso(Date.now() - DAY),
    identities: [{ identity_id: 'ii-' + who.id, provider: 'email', identity_data: { email: who.email } }] };
}
// A stored sign-in whose access token has EXPIRED, so the library must refresh
// it — the moment a server can say the login is gone.
function expiredSession(who) {
  const exp = Math.floor(Date.now() / 1000) - 600;
  const jwt = b64u({ alg: 'HS256', typ: 'JWT' }) + '.' + b64u({ sub: who.id, email: who.email, exp, aud: 'authenticated', role: 'authenticated' }) + '.ZZSIGN';
  return JSON.stringify({ access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: exp,
    refresh_token: 'ZZREFRESH-' + who.id, user: user(who) });
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
async function until(cond, ms = 4000) {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await tick(10);
  return cond();
}
// A phone whose owner is A, holding one job, wall switched on (?wall), started
// with the library in place so the boot check really runs against `fetchImpl`.
async function ownerPhoneBooting(fetchImpl, nav) {
  const ls = { 'pat:owner': owned(A), [AUTH]: expiredSession(A), 'pat:wallTest': '1', 'pat:cloudUnlocked': '1' };
  const app = bootApp({ localStorage: ls, runBoot: false, navigator: nav || {} });
  app.state = () => app.refresh('state').state;
  app.html = () => app.doc.getElementById('app').innerHTML;
  app.draw = () => { app.fn('render')(); return app.html(); };
  app.fn('load')();
  withSession(app, { client: 'ZZ Owner Client' });
  withItem(app, { assetNo: 'ZZA-1' });
  app.fn('save')();
  app.calls = [];
  installLibrary(app, async (url, init = {}) => { app.calls.push(String(url)); return fetchImpl(String(url), init); });
  app.run(read('boot.js'));
  return app;
}

module.exports = async function () {

  /* ------------------------------------------------------------------ 87a */
  await t.group('87a — 1A where the switch is on: the product only, no cloud = no wall, ?wall per phone; 5A the curtain', () => {
    const rq = boot({}).run('JSON.stringify(REQUIRE_ACCOUNT)');
    t.eq(rq, JSON.stringify({ prod: true, test: false }), 'REQUIRE_ACCOUNT: the product, not the test site');

    // The test site, a fresh phone: no wall, the curtain as V147.
    const ts = boot({});
    t.eq(ts.fn('cloudWallOn')(), false, 'test site: the switch is off');
    t.eq(ts.fn('cloudWallShows')(), false, '…no wall');
    t.ok(!walled(ts.draw()), '…and the Jobs list draws as before');
    t.eq(ts.fn('cloudPagesUnlocked')(), false, '5A: the access code still stands on the test site');

    // The product today: no Pro project, so no cloud — and no wall.
    const pr = boot({ hostname: PROD });
    t.eq(pr.run('CLOUD_ENV'), 'prod', 'the product address is the prod environment');
    t.eq(pr.fn('cloudAvailable')(), false, '…with no cloud until the Pro project exists');
    t.eq(pr.fn('cloudWallOn')(), false, 'no cloud = no wall (nothing to sign in to)');
    t.ok(!walled(pr.draw()), '…so the product site is unchanged today');

    // The product once its keys are in: a fresh phone meets the wall.
    pr.run("CLOUD.url = 'https://zzprod.supabase.co'; CLOUD.publishableKey = 'sb_publishable_ZZ';");
    pr.state().cloud.status = 'signed-out';
    t.eq(pr.fn('cloudWallOn')(), true, 'with keys: the product needs an account');
    t.ok(walled(pr.draw()), '…a phone with no owner sees the wall');
    t.eq(pr.fn('cloudPagesUnlocked')(), true, '5A: and never the access code');

    // ?wall through a REAL start-up (boot.js → cloudBoot), then ?wall=off.
    const w = boot({ search: '?wall' });
    t.eq(w.storage.getItem('pat:wallTest'), '1', 'opened at ?wall: remembered on this phone');
    t.ok(w.fn('cloudWallOn')() && walled(w.draw()), '…and the test site shows this phone the wall');
    const off = boot({ search: '?wall=off', localStorage: { 'pat:wallTest': '1' } });
    t.eq(off.storage.getItem('pat:wallTest'), null, '?wall=off forgets it');
    t.ok(!walled(off.draw()), '…and the wall goes');
    const keep = boot({ localStorage: { 'pat:wallTest': '1' } });
    t.ok(walled(keep.draw()), 'a later start with no ?wall keeps it (per phone, for good)');

    const parse = w.fn('cloudWallTestFromUrl');
    const ls = w.storage;
    t.eq(parse('?x=1&wall'), true, '?x=1&wall counts');
    t.eq(parse('?wall=0'), false, '?wall=0 turns it off');
    t.eq(ls.getItem('pat:wallTest'), null, '…(and forgets it)');
    t.eq(parse('?walls=1'), null, 'a different word is left alone');
    t.eq(parse(''), null, 'no query: nothing said');
    t.eq(parse('?wall#x'), true, 'a hash after it still counts');
  });

  /* ------------------------------------------------------------------ 87b */
  await t.group('87b — 2A 3A the wall: the start, the cards, Back, offline, jobs on the phone, one title, updates', () => {
    const app = boot({ search: '?wall' });
    let h = app.draw();
    t.ok(walled(h), 'the wall is drawn');
    t.excludes(h, '>Jobs</h1>', 'nothing of the app behind it');
    t.eq((h.match(/id="screen-title"/g) || []).length, 1, 'exactly one screen title to land on (V123)');
    t.includes(h, '>Welcome to PATGo</h1>', 'the welcome');
    t.eq(actionOf(h, 'wall-create'), 'wall-create', '2A: Create an account…');
    t.includes(h, 'class="btn-primary wall-create"', '…is the big button');
    t.includes(h, 'Free for 30 days &mdash; no card needed.', '…free for 30 days, no card');
    t.eq(actionOf(h, 'wall-sign-in'), 'wall-sign-in', '…and Sign in');
    t.excludes(h, 'id="wall-jobs"', 'a fresh phone: no jobs line');
    t.excludes(h, 'id="wall-offline"', 'with signal: no offline note');

    tapId(app, 'wall-create');
    h = app.html();
    t.includes(h, 'id="cloud-signup-card"', 'Create → V144’s own Create card');
    t.eq(actionOf(h, 'wall-back'), 'wall-back', '…with Back');
    t.ok(walled(h), '…still on the wall');
    tapId(app, 'wall-back');
    t.includes(app.html(), 'id="wall-create"', 'Back → the start again');
    tapId(app, 'wall-sign-in');
    h = app.html();
    t.includes(h, 'id="cloud-sign-in-form"', 'Sign in → V139’s sign-in card');
    t.includes(h, 'id="cloud-signup-open"', '…with its own way to Create');
    t.eq(app.state().cloud.signup, false, '…not the create mode');
    app.state().cloud.status = 'code-sent';
    app.state().cloud.email = 'zz@example.com';
    h = app.draw();
    t.includes(h, 'id="cloud-verify-code"', 'the code step shows on the wall');
    t.excludes(h, 'id="wall-back"', '…with no Back (the card has its own way out)');

    // 3A: an old install with jobs.
    const old = boot({ search: '?wall' });
    withSession(old, { client: 'ZZ One' }); withItem(old, { assetNo: 'Z1' });
    withSession(old, { client: 'ZZ Two' }); withItem(old, { assetNo: 'Z2' });
    old.state().view = 'sessions';
    h = old.draw();
    t.ok(walled(h), 'a phone with jobs and no owner is walled too');
    t.includes(h, 'Your 2 jobs on this phone go up to your account when you sign in.', '3A: it says its jobs go up at sign-in');
    t.eq(actionOf(h, 'wall-save-copy'), 'export-all', '…and Save a copy first is Export everything');
    let opened = 0;
    old.sandbox.exportAllOpen = () => { opened++; };
    tapId(old, 'wall-save-copy');
    t.eq(opened, 1, '…which opens without an account');
    t.eq(old.state().sessions.length, 2, 'the jobs are untouched');
    const one = boot({ search: '?wall' });
    withSession(one, { client: 'ZZ Solo' });
    t.includes(one.draw(), 'The job on this phone goes up', 'one job: said in the singular');

    // Offline: a fresh phone can't sign in yet — it says so.
    const off = boot({ search: '?wall', navigator: { onLine: false } });
    t.includes(off.draw(), 'You&rsquo;ll need signal to sign in the first time.', 'no signal: the wall says signal is needed the first time');

    // The update banner, and the safe moment.
    const up = boot({ search: '?wall' });
    up.state().updateAvailable = true;
    up.state().updateVersion = 'V149';
    h = up.draw();
    t.includes(h, 'PATGo V149 is ready', 'a walled phone still sees the update banner');
    t.ok(h.indexOf('class="update-banner"') < h.indexOf('id="account-wall"'), '…above the wall');
    up.state().pendingWorker = {};
    up.state().view = 'sessions';
    t.eq(up.fn('updateSafeMoment')(), true, 'the wall’s start is a safe moment to update');
    tapId(up, 'wall-create');
    t.eq(up.fn('updateSafeMoment')(), false, 'past it (someone typing) it is not');

    // After the wall, first-run setup must not promise "no account" (found in
    // the browser check); the test site keeps V147's words.
    const ob = boot({ search: '?wall', localStorage: { 'pat:owner': owned(A) } });
    Object.assign(ob.state().cloud, { status: 'signed-in', email: A.email });
    ob.state().onboardedV33Seen = false;
    ob.state().wizardStep = 1;
    h = ob.draw();
    t.includes(h, 'your jobs are kept safe in your account.', 'where an account is required, setup says so');
    t.excludes(h, 'no account, no signal needed', '…not "no account"');
    const ot = boot({});
    ot.state().onboardedV33Seen = false;
    ot.state().wizardStep = 1;
    t.includes(ot.draw(), 'Everything stays on this phone — no account, no signal needed.', 'the test site: V147’s words');
  });

  /* ------------------------------------------------------------------ 87c */
  await t.group('87c — Peter’s rule (4A): an owner is never walled — signed out, no signal, a refused or unreachable login', async () => {
    // Signed out, with an owner, wall on: it works on and says so.
    const so = boot({ search: '?wall', localStorage: { 'pat:owner': owned(A) } });
    withSession(so, { client: 'ZZ Owner Client' }); withItem(so, { assetNo: 'ZZA-1' });
    so.state().view = 'sessions';
    let h = so.draw();
    t.eq(so.fn('cloudWallShows')(), false, 'an owner signed out: no wall');
    t.ok(!walled(h), '…the Jobs list as normal');
    t.includes(h, 'id="signed-out-banner"', '…with the signed-out line');
    t.includes(h, 'Signed out &mdash; sign in to send your jobs to the cloud. Everything still works on this phone.', '…in its words');
    t.eq(actionOf(h, 'signed-out-sign-in'), 'settings-page', 'Sign in goes…');
    tapId(so, 'signed-out-sign-in');
    t.eq(so.state().view, 'cloudAccount', '…to the Account page');
    h = so.html();
    t.includes(h, 'id="cloud-sign-in-form"', '…its sign-in card, no access code');
    t.eq(so.fn('planGate')(), true, 'logging carries on (no plan read yet: fails open, as V127)');

    // A restart with no signal: nothing changes, nothing is asked of the network.
    const offline = await ownerPhoneBooting(async () => { throw new TypeError('Load failed'); }, { onLine: false });
    await tick(50);
    t.eq(offline.calls.length, 0, 'no signal: the start-up asks the network nothing');
    t.eq(offline.state().cloud.status, 'signed-in', '…and stays signed in');
    t.ok(!walled(offline.html()), '…no wall');
    t.eq(offline.state().sessions.length, 1, '…the job still there');

    // Signal, but the server can't be reached: the library keeps the login.
    const unreach = await ownerPhoneBooting(async () => { throw new TypeError('Load failed'); });
    await until(() => unreach.calls.length > 0);
    await tick(80);
    t.ok(unreach.calls.some(u => /\/auth\/v1\/token/.test(u)), 'a server out of reach: the library tried to refresh');
    t.eq(unreach.state().cloud.status, 'signed-in', '…and nothing was signed out');
    unreach.fn('render')();
    t.ok(!walled(unreach.html()), '…no wall');

    // Signal, and the server REFUSES the login (revoked): whatever the app
    // decides about the sign-in, the owner is never walled and keeps working.
    const refused = await ownerPhoneBooting(async (u) => {
      if (/\/auth\/v1\/token/.test(u)) return new Response(JSON.stringify({ code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }), { status: 400, headers: { 'content-type': 'application/json' } });
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    await until(() => refused.calls.some(u => /\/auth\/v1\/token/.test(u)));
    await tick(120);
    refused.fn('render')();
    t.ok(refused.calls.some(u => /\/auth\/v1\/token/.test(u)), 'a refused login: the server was asked and said no');
    t.ok(!walled(refused.html()), '…no wall for the owner');
    t.deepEq(JSON.parse(refused.storage.getItem('pat:owner')).id, A.id, '…the owner unchanged');
    t.eq(refused.state().sessions.length, 1, '…the job untouched');
    t.eq(refused.fn('planGate')(), true, '…and logging carries on');
    // …and once the app does count it signed out, it says so and still works.
    refused.state().cloud.status = 'signed-out';
    refused.state().view = 'sessions';
    h = refused.draw();
    t.ok(!walled(h), 'counted as signed out: still no wall');
    t.includes(h, 'id="signed-out-banner"', '…just the line asking to sign in again');

    // A brand-new account choosing its password finishes on the wall (V144 2A),
    // then the wall goes.
    const nw = boot({ search: '?wall', localStorage: { 'pat:owner': owned(A) } });
    Object.assign(nw.state().cloud, { status: 'signed-in', email: A.email, pwOpen: true, pwNew: true });
    h = nw.draw();
    t.ok(walled(h), 'a new account choosing its password: still the wall');
    t.includes(h, 'id="cloud-new-password-form"', '…showing only Choose a password');
    t.excludes(h, 'id="cloud-sign-out"', '…nothing else of the Account page');
    nw.state().cloud.pwOpen = false;
    nw.state().cloud.pwNew = false;
    t.ok(!walled(nw.draw()), 'password saved: the wall goes');

    // And with no owner, being signed in is enough — the wall fails open.
    const ss = boot({ search: '?wall' });
    ss.state().cloud.status = 'signed-in';
    t.eq(ss.fn('cloudWallShows')(), false, 'signed in with no owner stamp (a full phone): no wall');
  });

  /* ------------------------------------------------------------------ 87d */
  await t.group('87d — 4A the plan follows the owner where the wall is on; on the test site nothing changed', () => {
    const locked = JSON.stringify({ uid: A.id, plan: 'lapsed', trialEndsAt: null, lapsedAt: iso(Date.now() - 30 * DAY),
      lapsedSeenAt: null, serverAt: 0, checkedAt: Date.now() - DAY, shownEnded: 'x', shownLastDay: 'x' });

    // Wall on: signed out gets round nothing.
    const w = boot({ search: '?wall', localStorage: { 'pat:owner': owned(A), 'pat:plan': locked } });
    t.eq(w.fn('cloudSignedOutOwner')(), true, 'a signed-out owner where the wall is on');
    t.ok(w.fn('planLocked')(), 'the owner’s lapsed plan still locks this phone');
    t.eq(w.fn('planGate')(), false, '…logging refused');
    t.includes(sheetsText(w), '>Sign in<', '…and the sheet’s way on is Sign in');
    w.state().view = 'sessions';
    const h = w.draw();
    t.includes(h, 'Your account is locked.', 'the Jobs list says it is locked');
    t.eq(actionOf(h, 'plan-banner-renew'), 'settings-page', '…its button signs in');
    t.excludes(h, 'id="signed-out-banner"', '…one line, not two');

    const unchecked = JSON.stringify({ uid: A.id, plan: 'trial', trialEndsAt: iso(Date.now() + 300 * DAY), lapsedAt: null,
      lapsedSeenAt: null, serverAt: 0, checkedAt: Date.now() - 31 * DAY, shownEnded: '', shownLastDay: '' });
    const u = boot({ search: '?wall', localStorage: { 'pat:owner': owned(A), 'pat:plan': unchecked } });
    t.ok(u.fn('planLocked')(), 'not read for 30 days: held, signed out too (V143 4A)');
    t.includes(u.fn('planLineText')(u.fn('planCurrent')()), 'Sign in to carry on', '…and told to sign in');

    // Someone else's record on this phone is never this owner's.
    const other = JSON.stringify(Object.assign(JSON.parse(locked), { uid: '99999999-9999-9999-9999-999999999999' }));
    const o = boot({ search: '?wall', localStorage: { 'pat:owner': owned(A), 'pat:plan': other } });
    t.eq(o.fn('planGate')(), true, 'a record for another account: no lock');

    // The test site (no ?wall): exactly V147 — signed out, no plan, no line.
    const ts = boot({ localStorage: { 'pat:owner': owned(A), 'pat:plan': locked } });
    t.eq(ts.fn('cloudSignedOutOwner')(), false, 'test site: not a "signed-out owner"');
    t.eq(ts.fn('planRecord')(), null, '…signed out has no plan, as V147');
    t.eq(ts.fn('planGate')(), true, '…logging carries on');
    ts.state().view = 'sessions';
    const th = ts.draw();
    t.excludes(th, 'id="signed-out-banner"', '…no signed-out line');
    t.excludes(th, 'id="plan-banner"', '…no plan line');
  });

  /* ------------------------------------------------------------------ 87e */
  await t.group('87e — the shared cards; reset and takeover; wiring', () => {
    const help = read('render-help.js');
    const acct = help.slice(help.indexOf('function renderCloudAccount()'), help.indexOf('function cloudPasswordFormHTML('));
    t.includes(acct, 'const pwCard = c.pwOpen ? cloudPasswordFormHTML(c, msg, dis, busy) : `', 'the Account page draws the password form from the shared helper…');
    t.includes(acct, 'body = cloudSignedOutCardsHTML(c, msg, dis, busy);', '…and the signed-out cards');
    const wallSrc = help.slice(help.indexOf('function renderAccountWall()'));
    t.includes(wallSrc, 'cloudSignedOutCardsHTML(c, msg, dis, busy)', 'the wall uses the same cards');
    t.includes(wallSrc, 'cloudPasswordFormHTML(c, msg, dis, busy)', '…and the same password form');

    // The cards, drawn: the wall's and the Account page's are one markup.
    const app = boot({ search: '?wall' });
    tapId(app, 'wall-create');
    const wallCard = app.html().match(/<form class="cloud-form" id="cloud-signup-form"[\s\S]*?<\/form>/)[0];
    app.state().view = 'cloudAccount';
    app.state().cloud.status = 'signed-out';
    app.state().cloud.signup = true;
    const acctHtml = app.fn('renderCloudAccount')();
    t.includes(acctHtml, wallCard, 'the Create card on the wall is the Account page’s, character for character');

    // Reset and takeover.
    const plan = app.run("JSON.stringify(RESET_KEY_PLAN.filter(r => r[0] === 'WALL_TEST_KEY'))");
    t.eq(plan, JSON.stringify([['WALL_TEST_KEY', 'pat:wallTest', 'account']]), 'the ?wall key: cleared only by Everything, as new');
    t.ok(app.run("RESET_HANDOVER_KEEP.indexOf('WALL_TEST_KEY') !== -1"), '…and kept by a takeover (the phone’s own)');

    // Wiring.
    const disp = read('dispatch.js');
    t.includes(disp, "'wall-create':  () => { if (typeof cloudWallCreate === 'function') cloudWallCreate(); },", 'Create wired');
    t.includes(disp, "'wall-sign-in': () => { if (typeof cloudWallSignIn === 'function') cloudWallSignIn(); },", 'Sign in wired');
    t.includes(disp, "'wall-back':    () => { if (typeof cloudWallBack === 'function') cloudWallBack(); },", 'Back wired');
    t.includes(read('cloud.js'), "  cloudWallTestFromUrl();   // V148 (1A): ?wall / ?wall=off — before the first paint", 'the start-up reads ?wall');

    // Without cloud.js the app draws as normal (MAP rule 6).
    const bare = boot({ search: '?wall', skip: ['cloud.js'], tolerateLoadErrors: true });
    let ok = true; let h2 = '';
    try { h2 = bare.draw(); } catch (e) { ok = false; }
    t.ok(ok && !walled(h2), 'no cloud.js: no wall, no crash');
    // V149: the release checks moved to 88e.
  });
};
