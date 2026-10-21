/* Standing test — V143: enforcement — the server refuses a locked business's uploads
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID (Peter, 21 Oct: 1A 2A 3A 4A 5A). 1A the database
   refuses a locked business's uploads — new or changed jobs, settings, photos
   and photo files — and never its reads; 2A it does so 7 days after the phone
   lock (catch-up time: 14 days after the plan ended); 3A the server keeps the
   date a paid plan lapsed and phones count the grace from it (found at the
   build: before, a phone counted from the trial's end — weeks earlier for a
   plan that had been paid — so a cancelled subscription locked at once); 4A a
   phone that hasn't read its plan for 30 days is held until it reads it once
   (comped never); 5A the app's own line when the cloud refuses, in a
   professional voice, and no more sending until a plan read says it may.

     82a  the rules, pure: the grace from the server's date (and the old rule
          without one), the 30-day hold (29 / 30 days, comped, trial, grace,
          locked, no record of a read, an unknown plan).
     82b  held: every way in refused with "Plan check needed"; the Jobs list
          line + Check now; the Account page; the Settings row; Check now
          offline and online (the lock lifts); the three plan reads (profile ×2,
          my_billing) carry lapsed_at into the record — select('*').
     82c  the REAL library against a server that refuses with patgo_plan_locked:
          the line, the Jobs list, no more sending (reads still run), Sync now
          tries once, a plan read still locked keeps it paused, paying resumes
          and sends; another account, a different error, row-level refusals.
     82g  the SQL: v143-enforcement.sql's parts; schema.sql carries every V143
          line; the 14 days = PLAN_GRACE_DAYS + 7; isolation 19a–19h;
          self-checks C1–C6.
     82e  release: V143, cache, What's new (one line), About V143 / V142 /
          V141, Check now wired; plus 81e's lasting checks (81e retired).

   Whether the SQL WORKS is proved by its own checks (C1–C6) and isolation
   19a–19h, run in the Supabase SQL editor — at V143 also against a local
   Postgres 16 stand-in (an upgraded project and a new one from schema.sql),
   with ten broken copies each caught. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { tick, freshApp, withSession, withItem } = require('../fixture');

const LIB  = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;
const DAY = 86400000;
const UID = '11111111-1111-1111-1111-111111111111';
const AUTH = 'patgo:cloudAuth:test';
const iso = (ms) => new Date(ms).toISOString();
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
// What PostgREST sends when plan_guard raises (errcode 42501 → HTTP 403).
const REFUSAL = { code: '42501', details: null, hint: 'Renew in PATGo: Settings, Account & Sync, Subscription.',
  message: 'patgo_plan_locked: this business\'s PATGo plan has ended, so the cloud is not taking changes' };

function storedSession(id = UID) {
  const life = 3600;
  return JSON.stringify({
    access_token: 'ZZACCESS143', token_type: 'bearer', expires_in: life,
    expires_at: Math.floor(Date.now() / 1000) + life, refresh_token: 'ZZREFRESH',
    user: { id, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' },
  });
}

// A pretend Supabase. srv.profile answers the profile reads, srv.billing
// my_billing; srv.refuse: 'plan' → uploads refused as the database would,
// 'rls' → a bare row-level refusal, 'other' → a server error.
function fakeServer() {
  const calls = [];
  const srv = { calls, refuse: '', profile: { plan: 'trial', trial_ends_at: iso(Date.now() + 20 * DAY), lapsed_at: null } };
  srv.billing = { plan: 'trial', trial_ends_at: iso(Date.now() + 20 * DAY), lapsed_at: null, status: null, interval: null,
    period_end: null, cancel_at_period_end: false, has_customer: false, has_subscription: false, role: 'owner', can_manage: true };
  srv.fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    let body = null;
    try { body = init.body ? JSON.parse(init.body) : null; } catch { body = init.body; }
    calls.push({ url: u, method, body });
    if (u.endsWith('/rest/v1/rpc/my_billing')) return json(srv.billing);
    if (u.includes('/rest/v1/profiles')) return json([srv.profile]);
    if (u.includes('/rest/v1/') && method !== 'GET') {
      if (srv.refuse === 'plan' && (!srv.only || u.includes('/rest/v1/' + srv.only))) return json(REFUSAL, 403);
      if (srv.refuse === 'rls') return json({ code: '42501', details: null, hint: null, message: 'new row violates row-level security policy for table "sessions"' }, 403);
      if (srv.refuse === 'other') return json({ code: 'XX000', details: null, hint: null, message: 'boom' }, 500);
      return new Response(null, { status: 201 });
    }
    if (u.includes('/rest/v1/')) return json([]);
    if (u.includes('/storage/v1/')) return json([]);
    return json({ message: 'unexpected ' + u }, 404);
  };
  srv.posts = (table = 'sessions') => calls.filter(c => c.url.includes('/rest/v1/' + table) && c.method === 'POST');
  srv.gets = (table = 'sessions') => calls.filter(c => c.url.includes('/rest/v1/' + table) && c.method === 'GET');
  return srv;
}

async function until(cond, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await tick(10);
  return cond();
}

// Signed in with the real library; booted OFFLINE so the stored plan record is
// what the phone knows (no read at boot), then online.
async function signedIn(o = {}) {
  const ls = Object.assign({ [AUTH]: storedSession(), 'pat:cloudUnlocked': '1' }, o.localStorage || {});
  const app = bootApp({ localStorage: ls, navigator: { onLine: false } });
  app.fn('load')();
  app.state = () => app.refresh('state').state;
  app.stopTimer = () => app.run('if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }');
  const srv = fakeServer();
  const sb = app.sandbox;
  for (const k of ['Headers', 'Request', 'Response', 'AbortController', 'TextEncoder',
                   'TextDecoder', 'URLSearchParams', 'URL', 'atob', 'btoa', 'Blob']) sb[k] = globalThis[k];
  if (!sb.crypto) sb.crypto = globalThis.crypto;
  sb.WebSocket = class {};
  sb.fetch = srv.fetchImpl;
  app.run(LIB);
  app.srv = srv;
  for (let k = 0; k < 100 && app.run("(state.cloud && state.cloud.status) || ''") !== 'signed-in'; k++) await tick(10);
  app.stopTimer();
  const st = app.state();
  st.welcomeSeen = true;
  st.migrationPrompt = { show: false, name: '', items: [] };
  closeSheets(app);
  app.toasts = [];
  sb.showToast = (m) => app.toasts.push(String(m));
  if (o.online !== false) app.run('navigator.onLine = true');
  return app;
}

const planRec = (o) => JSON.stringify(Object.assign({ uid: UID, plan: 'active', trialEndsAt: null, lapsedAt: null,
  lapsedSeenAt: null, serverAt: 0, checkedAt: Date.now(), shownEnded: '', shownLastDay: '' }, o));
const sheets = (app) => app.doc.body.children.filter(c => c && /bulk-sheet/.test(c.className || ''));
function closeSheets(app) {
  app.doc.body.children.slice().forEach(c => { if (c && /bulk-sheet|modal-backdrop/.test(c.className || '')) c.remove(); });
}
const act = (app, name, arg) => app.run(`ACTIONS[${JSON.stringify(name)}](${arg === undefined ? '' : JSON.stringify(arg)})`);
const rec = (app) => JSON.parse(app.sandbox.localStorage.getItem('pat:plan') || 'null');
function jobsList(app) {
  closeSheets(app);
  app.state().view = 'sessions';
  app.fn('render')();
  return html(app);
}

module.exports = async function () {
  /* ------------------------------------------------------------------ 82a */
  await t.group('82a — the rules: grace from the server’s lapse date (3A); the 30-day hold (4A)', () => {
    const app = freshApp();
    const ps = (r, now) => app.fn('planStatus')(r, now);
    const NOW = Date.parse('2026-11-20T12:00:00Z');
    const base = (o) => Object.assign({ uid: 'u', plan: 'active', checkedAt: NOW }, o);
    t.eq(app.run('PLAN_CHECK_DAYS'), 30, '30 days (4A)');

    // 3A: a plan that WAS paid (trial long over) and lapsed two days ago.
    let s = ps(base({ plan: 'lapsed', trialEndsAt: iso(NOW - 60 * DAY), lapsedAt: iso(NOW - 2 * DAY), lapsedSeenAt: NOW - DAY }), NOW);
    t.eq(s.phase, 'grace', 'a paid plan that stopped gets its grace (3A)');
    t.eq(s.endsAt, NOW - 2 * DAY, '…counted from the server’s date — not the trial’s end, not when this phone heard');
    t.eq(s.daysLeft, 5, '…5 days left of 7');
    s = ps(base({ plan: 'lapsed', trialEndsAt: iso(NOW - 60 * DAY), lapsedAt: iso(NOW - 8 * DAY) }), NOW);
    t.eq(s.phase, 'locked', '8 days after the server’s date: locked');
    s = ps(base({ plan: 'lapsed', trialEndsAt: iso(NOW - 60 * DAY), lapsedAt: '2026-11-18T12:00:00.123456+00:00' }), NOW);
    t.eq(s.phase, 'grace', 'the database’s microseconds are read (Safari)');
    // Without the server's date (a database before V143) the old rule stands —
    // which is exactly the case V143 mends: locked at once, from the trial end.
    s = ps(base({ plan: 'lapsed', trialEndsAt: iso(NOW - 60 * DAY), lapsedSeenAt: NOW - DAY }), NOW);
    t.eq(s.phase, 'locked', 'no lapsed_at: the old rule (from the trial end) — kept for an older database');
    s = ps(base({ plan: 'lapsed', trialEndsAt: null, lapsedSeenAt: NOW - DAY }), NOW);
    t.eq(s.phase, 'grace', '…and from when this phone heard, with no trial end');

    // 4A: when the plan was last read.
    t.notOk(ps(base({ checkedAt: NOW - 29 * DAY }), NOW).unchecked, '29 days since a read: fine');
    s = ps(base({ checkedAt: NOW - 30 * DAY }), NOW);
    t.ok(s.unchecked === true, '30 days: held until it reads it');
    t.eq(s.phase, 'paid', '…the phase is unchanged (the Subscription page still says what the plan is)');
    t.notOk(ps(base({ plan: 'comped', checkedAt: NOW - 90 * DAY }), NOW).unchecked, 'comped is never asked');
    s = ps(base({ plan: 'trial', trialEndsAt: iso(NOW + 20 * DAY), checkedAt: NOW - 31 * DAY }), NOW);
    t.ok(s.phase === 'trial' && s.unchecked === true, 'a trial is asked too');
    s = ps(base({ plan: 'lapsed', lapsedAt: iso(NOW - 3 * DAY), checkedAt: NOW - 31 * DAY }), NOW);
    t.ok(s.phase === 'grace' && s.unchecked === true, '…and an account in its grace');
    s = ps(base({ plan: 'lapsed', lapsedAt: iso(NOW - 20 * DAY), checkedAt: NOW - 31 * DAY }), NOW);
    t.ok(s.phase === 'locked' && !s.unchecked, 'locked says locked (Renew, not Check)');
    t.notOk(ps(base({ checkedAt: 0 }), NOW).unchecked, 'no record of a read: no hold (V127: never read, no lock)');
    s = ps(base({ plan: 'gold', checkedAt: NOW - 90 * DAY }), NOW);
    t.ok(s.phase === 'none' && !s.unchecked, 'a plan this version doesn’t know: open, not held');
    t.notOk(ps(base({ checkedAt: NOW + 2 * DAY }), NOW).unchecked, 'a read stamped in the future (clock was ahead): not held');
  });

  /* ------------------------------------------------------------------ 82b */
  await t.group('82b — held after 30 days: refused, the line, Check now; every plan read carries lapsed_at', async () => {
    const app = await signedIn({ online: false, localStorage: { 'pat:plan': planRec({ checkedAt: Date.now() - 31 * DAY }) } });
    const st = app.state();
    t.ok(app.fn('planLocked')(), 'held counts as locked');
    st.newForm.show = false;   // a phone with no jobs opens on the form (V127)
    act(app, 'new-session');
    t.eq(st.newForm.show, false, 'a new job is refused (the real tap)');
    const sh = sheets(app).pop();
    t.ok(!!sh && /Plan check needed/.test(sh.innerHTML), '…with “Plan check needed”');
    t.includes(sh && sh.innerHTML, 'hasn’t been able to confirm your PATGo plan for 30 days', '…saying why');
    t.ok(/id="choice-sheet-0"[^>]*>Check now/.test(sh && sh.innerHTML), '…Check now first');
    t.includes(sh && sh.innerHTML, 'Export everything', '…and Export everything');
    t.excludes(sh && sh.innerHTML, 'Renew', '…not Renew (nothing is owed)');

    const list = jobsList(app);
    t.includes(list, 'PATGo hasn’t been able to confirm your plan for 30 days. Connect to the internet to carry on', 'the Jobs list line');
    t.ok(/id="plan-banner-renew" data-action="plan-check">Check now/.test(list), '…with Check now');
    t.includes(list, 'plan-banner-locked', '…in the locked style');
    st.view = 'cloudAccount';
    app.fn('render')();
    t.ok(/id="cloud-plan-renew" data-action="plan-check"[^>]*>Check now/.test(html(app)), 'the Account page: Check now');
    t.eq(app.fn('billingRowStatus')(), 'Check needed', 'the Settings row');

    // Check now, no signal.
    act(app, 'plan-check');
    t.eq(app.toasts.pop(), 'No internet connection. Connect and try again.', 'offline: says so');
    t.ok(app.fn('planLocked')(), '…and stays held');
    // Check now, online: the plan read, the hold gone.
    app.run('navigator.onLine = true');
    app.srv.profile = { plan: 'active', trial_ends_at: null, lapsed_at: null };
    act(app, 'plan-check');
    await until(() => !app.fn('planLocked')());
    t.notOk(app.fn('planLocked')(), 'online: one read lifts the hold');
    t.ok(Date.now() - rec(app).checkedAt < 60000, '…the read is recorded');
    t.eq(app.toasts.pop(), 'Plan confirmed. You can carry on.', '…and says so');
    t.ok(/[?&]select=\*(&|$)/.test(decodeURIComponent(app.srv.calls.filter(c => c.url.includes('/rest/v1/profiles')).pop().url)), 'the read asks for every column (lapsed_at when the database has it)');
    closeSheets(app);
    act(app, 'new-session');
    t.eq(st.newForm.show, true, 'a new job opens again');
    st.newForm.show = false;
    t.notOk(/data-action="plan-check"/.test(jobsList(app)), 'the line has gone');

    // 3A through each real read.
    app.srv.profile = { plan: 'lapsed', trial_ends_at: iso(Date.now() - 60 * DAY), lapsed_at: iso(Date.now() - 2 * DAY) };
    await app.fn('planRefresh')();
    t.eq(rec(app).lapsedAt, app.srv.profile.lapsed_at, 'planRefresh keeps the server’s lapse date');
    t.eq(app.fn('planCurrent')().phase, 'grace', '…so a cancelled plan gets its 7 days, not an instant lock');
    app.srv.profile = { plan: 'lapsed', trial_ends_at: iso(Date.now() - 60 * DAY), lapsed_at: iso(Date.now() - 3 * DAY) };
    await app.fn('cloudCheckConnection')();
    t.eq(rec(app).lapsedAt, app.srv.profile.lapsed_at, 'the sign-in / Check connection read keeps it too');
    t.ok(/[?&]select=\*(&|$)/.test(decodeURIComponent(app.srv.calls.filter(c => c.url.includes('/rest/v1/profiles')).pop().url)), '…asking for every column');
    app.srv.billing = Object.assign({}, app.srv.billing, { plan: 'lapsed', lapsed_at: iso(Date.now() - 4 * DAY) });
    await app.fn('billingRead')();
    t.eq(rec(app).lapsedAt, app.srv.billing.lapsed_at, 'the Subscription page’s read (my_billing) keeps it too');
  });

  /* ------------------------------------------------------------------ 82c */
  await t.group('82c — the REAL library: the cloud refuses (patgo_plan_locked) → paused, reads go on, paying resumes', async () => {
    const app = await signedIn();
    const st = app.state();
    withSession(app, { site: 'ZZ143A' });
    withItem(app, { assetNo: 'ZZ143-1', result: 'pass' });
    app.stopTimer();
    // The account locked 20 days ago — as the server sees it, past the line.
    app.fn('planNote')({ plan: 'lapsed', trial_ends_at: iso(Date.now() - 60 * DAY), lapsed_at: iso(Date.now() - 20 * DAY) });
    t.eq(app.fn('planCurrent')().phase, 'locked', 'set-up: locked');
    app.srv.refuse = 'plan';
    const WORDS = app.run('SYNC_PLAN_PAUSED_WORDS');
    t.includes(WORDS, 'Cloud syncing is paused because your PATGo subscription has ended', 'the words (5A, professional)');
    t.includes(WORDS, 'remains safe on this phone and will upload automatically once you renew', '…saying nothing is lost');

    // Settle the Jobs list's cloud picture first (a failed send), so only the
    // refusal itself can redraw the list below.
    app.srv.refuse = 'other';
    await app.fn('syncPush')({});
    app.srv.refuse = 'plan';
    jobsList(app);
    t.notOk(/cloud syncing is paused/.test(html(app)), 'set-up: the Jobs list showing, not paused yet');
    const p0 = app.srv.posts().length;
    // Count the photo step (it uploads; while paused it must not run).
    app.run("var __ph = 0; var __phReal = _syncPhotosHalf; _syncPhotosHalf = function () { __ph++; return __phReal.apply(this, arguments); };");
    await app.fn('syncPush')({});
    t.eq(app.srv.posts().length, p0 + 1, 'the job was sent once');
    t.eq(st.sync.message, WORDS, 'refused: the Sync page says so, in our words — not the database’s');
    t.ok(app.fn('syncPlanRefused')(), '…and this account is paused');
    t.includes(html(app), 'Your account is locked and cloud syncing is paused. Renew to carry on', 'the Jobs list says it at once, by itself');

    await app.fn('syncPush')({});
    t.eq(app.srv.posts().length, p0 + 1, 'paused: the next automatic run sends nothing');
    t.eq(st.sync.message, WORDS, '…and keeps the line');
    const reads = app.srv.gets().length;
    await app.fn('syncPush')({ pull: true });
    t.ok(app.srv.gets().length > reads, 'reading still runs (1A: reads are never refused)');
    t.eq(app.srv.posts().length, p0 + 1, '…but nothing goes up with it');
    t.eq(app.srv.posts('records').length, 0, '…not settings either');
    t.eq(app.run('__ph'), 0, '…nor photos (the photo step never runs while paused)');
    await app.fn('syncPush')({ manual: true });
    t.eq(app.srv.posts().length, p0 + 2, 'Sync now tries once anyway (the person asked)');
    t.ok(app.fn('syncPlanRefused')(), '…and is refused again');

    // A fresh read that still says locked: stays paused.
    app.fn('planNote')({ plan: 'lapsed', trial_ends_at: iso(Date.now() - 60 * DAY), lapsed_at: iso(Date.now() - 20 * DAY) });
    t.ok(app.fn('syncPlanRefused')(), 'a plan read that still says locked: still paused');
    t.eq(app.run('!!_syncTimer'), false, '…and nothing is scheduled');
    // Paid: resumes by itself, and sends what was waiting.
    app.srv.refuse = '';
    app.fn('planNote')({ plan: 'active', trial_ends_at: null, lapsed_at: null });
    t.notOk(app.fn('syncPlanRefused')(), 'renewed: no longer paused');
    t.eq(app.run('!!_syncTimer'), true, '…a send is scheduled straight away');
    t.notOk(st.sync.message === WORDS, '…and the line has gone');
    t.notOk(/cloud syncing is paused/.test(jobsList(app)), '…from the Jobs list too');
    app.stopTimer();
    await app.fn('syncPush')({});
    t.eq(app.srv.posts().length, p0 + 3, 'the waiting job goes up');
    t.notOk(st.sync.message === WORDS, '…reported as sent');
    await app.fn('syncPush')({ pull: true });
    t.ok(app.run('__ph') > 0, '…and the photo step runs again (the count above is real)');

    // Whose pause: the account that was refused, only.
    app.run("_syncPlanRefusedUid = '22222222-2222-2222-2222-222222222222'");
    t.notOk(app.fn('syncPlanRefused')(), 'another account’s refusal does not pause this one');
    app.run("_syncPlanRefusedUid = ''");

    // A photo refused (the photo step is fail-soft) still pauses.
    app.run("_syncPhotosHalf = function () { return Promise.reject({ message: 'patgo_plan_locked: x' }); };");
    await app.fn('syncPush')({ pull: true });
    t.ok(app.fn('syncPlanRefused')(), 'a refused photo pauses too');
    app.run("_syncPhotosHalf = __phReal; _syncPlanRefusedUid = '';");

    // Any other refusal is not the plan.
    withItem(app, { assetNo: 'ZZ143-2', result: 'pass' });
    app.stopTimer();
    app.srv.refuse = 'other';
    await app.fn('syncPush')({});
    t.notOk(app.fn('syncPlanRefused')(), 'a server error is not a pause');
    t.includes(st.sync.message, 'Couldn’t send your jobs: boom', '…and says what it said');
    app.srv.refuse = 'rls';
    await app.fn('syncPush')({});
    t.notOk(app.fn('syncPlanRefused')(), 'a bare row-level refusal on a paid account is not a pause');
    // A photo FILE refused by storage's own rule carries no word of ours: the
    // plan only when this phone knows the account is locked.
    const isRefusal = app.fn('_syncIsPlanRefusal');
    const rls = { message: 'new row violates row-level security policy', statusCode: '403' };
    t.notOk(isRefusal(rls), 'storage’s refusal, paid account: not the plan');
    app.fn('planNote')({ plan: 'lapsed', trial_ends_at: null, lapsed_at: iso(Date.now() - 20 * DAY) });
    t.ok(isRefusal(rls), 'storage’s refusal, locked account: the plan');
    t.ok(isRefusal({ message: 'x', hint: 'patgo_plan_locked' }), 'the word in any part of the error counts');
    t.eq(app.fn('syncErrorMessage')(REFUSAL), WORDS, 'syncErrorMessage: our words for it');

    // Settings refused on their own (records are fail-soft) still pause.
    const b = await signedIn();
    b.fn('planNote')({ plan: 'lapsed', trial_ends_at: null, lapsed_at: iso(Date.now() - 20 * DAY) });
    b.srv.refuse = 'plan';
    b.srv.only = 'records';
    b.state().engineer = 'ZZ Engineer 143';
    b.fn('save')();
    b.stopTimer();
    await b.fn('syncPush')({ pull: true });
    t.ok(b.srv.posts('records').length >= 1, 'set-up: settings were sent');
    t.ok(b.fn('syncPlanRefused')(), 'a refusal of settings alone pauses too');
  });

  /* ------------------------------------------------------------------ 82g */
  await t.group('82g — the SQL: the lapse date, the guard, photo files; schema.sql in step; isolation 19a–19h', () => {
    const sql = read('supabase/v143-enforcement.sql');
    const schema = read('supabase/schema.sql');
    const iso2 = read('supabase/isolation-test.sql');
    t.includes(sql, 'alter table public.organisations add column if not exists lapsed_at timestamptz;', 'the business keeps the date (3A)');
    t.includes(sql, 'alter table public.profiles add column if not exists lapsed_at timestamptz;', '…and each profile a copy (what phones read)');
    t.includes(sql, "elsif old.plan is distinct from 'lapsed' and new.lapsed_at is not distinct from old.lapsed_at then\n      new.lapsed_at := now();", 'entering lapsed stamps the date');
    t.includes(sql, '  else\n    new.lapsed_at := null;\n  end if;', '…any other plan clears it');
    t.includes(sql, 'create trigger org_lapsed_at\n  before insert or update on public.organisations', '…on every change to a business');
    t.includes(sql, 'create trigger org_plan_to_members\n  after update of plan, trial_ends_at, lapsed_at on public.organisations', 'the copies carry the date…');
    t.includes(sql, '  set plan = new.plan, trial_ends_at = new.trial_ends_at, lapsed_at = new.lapsed_at\n', '…the business’s date onto its members’ profiles');
    t.includes(sql, 'set plan = o.plan, trial_ends_at = o.trial_ends_at, lapsed_at = o.lapsed_at', '…joining a business copies it too');
    t.includes(sql, "    'lapsed_at', o.lapsed_at,", 'my_billing sends it');
    t.includes(sql, 'grant select (lapsed_at) on public.organisations to authenticated;', 'phones may read it on the business');
    // The 14 days are the phone's grace plus 7 days' catch-up (2A).
    const grace = freshApp().run('PLAN_GRACE_DAYS');
    const fn = sql.slice(sql.indexOf('create or replace function public.can_upload(o uuid)'), sql.indexOf('-- Jobs, settings, photo rows'));
    const days = [...fn.matchAll(/interval '(\d+) days'/g)].map(m => Number(m[1]));
    t.deepEq(days, [grace + 7, grace + 7], 'the server’s line = PLAN_GRACE_DAYS + 7 days’ catch-up, for trials and lapsed plans (2A)');
    t.includes(fn, "when x.plan in ('active','comped') then true", 'paid and comped are never refused');
    t.includes(sql, "if auth.uid() is not null and not public.can_upload(new.org_id) then\n    raise exception 'patgo_plan_locked:", 'the guard: signed-in phones only, with the word the app knows');
    t.includes(sql, "using errcode = '42501'", '…as a refusal (403), not a server error');
    t.includes(sql, "foreach t in array array['sessions','records','photos'] loop\n    execute format('drop trigger if exists plan_guard", 'on jobs, settings and photo rows');
    t.ok('org_stamp' < 'plan_guard', '…named to fire after the business stamp (name order)');
    t.includes(sql, 'create or replace function public.can_upload_files()\nreturns boolean language sql stable security definer', 'photo files ask a helper with the owner’s rights…');
    t.eq((sql.match(/and \(select public\.can_upload_files\(\)\)\);/g) || []).length, 2, '…on adding and changing a file');
    t.includes(sql, 'grant execute on function public.can_upload_files() to authenticated;', '…which phones may call (or EVERY photo upload is refused)');
    t.includes(sql, 'revoke all on function public.can_upload(uuid), public.can_upload_files(), public.plan_guard()\n  from public, anon, authenticated;', 'the rest closed to the app');
    const body = sql.slice(sql.indexOf('-- ------------------------------------------------------------ when a paid plan lapsed (3A)'),
                           sql.indexOf('-- ------------------------------------------------------------ self-check'));
    const lines = new Set(schema.split('\n'));
    const missing = body.split('\n').filter(l => l.trim() && !lines.has(l));
    t.eq(missing.length, 0, 'schema.sql carries every V143 line' + (missing.length ? ' — first missing: ' + missing[0].trim() : ''));
    t.ok(schema.indexOf('-- ================================================================ V143') > schema.indexOf('-- ================================================================ V142'), '…after V142’s (the later definitions win)');
    for (const c of ['19a', '19b', '19c', '19d', '19e', '19f', '19g', '19h']) t.includes(iso2, "'" + c + '|', 'isolation ' + c);
    t.includes(iso2, "19a|enforcement|FAIL|run supabase/v143-enforcement.sql first", 'names the file when it has not been run');
    t.includes(iso2, "update public.organisations set plan = g, lapsed_at = lap_b where id = org_b;", 'B is put back exactly as it was');
    for (const c of ['C1', 'C2', 'C3', 'C3b', 'C4', 'C5', 'C6']) t.includes(sql, "'" + c + '|', 'self-check ' + c);
  });

  /* ------------------------------------------------------------------ 82e */
  await t.group('82e — release: V143, cache, What’s new, About; wiring; no Stripe script (81e’s lasting checks)', async () => {
    const app = freshApp();
    t.eq(app.run('APP_VERSION'), 'V143', 'APP_VERSION V143');
    t.eq(app.run('WELCOME_VERSION'), 'V143', 'What’s new rolled');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v143';", 'cache key pat-v143');
    const core = read('render-core.js');
    const at = core.indexOf('<ul class="welcome-list sheet-scroll">');
    const sheetCopy = core.slice(at, core.indexOf('</ul>', at));
    t.eq((sheetCopy.match(/<li>/g) || []).length, 1, 'What’s new: one line');
    t.includes(sheetCopy, '<li><strong>Plan checks.</strong>', '…Plan checks');
    t.includes(sheetCopy, 'at least once every 30 days', '…the 30 days');
    t.includes(sheetCopy, 'everything uploads as soon as you renew', '…and nothing is lost');
    t.includes(core, 'New here? Try the practice job.', 'setup offers the practice job');
    t.includes(core, 'You can do it again any time from Settings → Help → Tutorials.', '…and says where it lives');
    const help = read('render-help.js');
    const a = help.indexOf('<p><strong>V143</strong>'), b = help.indexOf('<p><strong>V142</strong>'), c = help.indexOf('<p><strong>V141</strong>');
    t.ok(a > -1 && b > a && c > b, 'About: V143, V142, V141');
    t.excludes(help, '<p><strong>V140</strong>', 'V140 rolled off');
    t.includes(help, 'PATGo confirms your plan online at least once every 30 days. When a subscription ends', 'About: V143’s line');
    t.includes(help, 'Cloud accounts can subscribe from Settings, paying securely through Stripe', 'About: V142’s line still there');
    t.includes(help, 'PATGo has a full privacy policy. About now sums up', 'About: V141’s line still there');
    t.includes(help, 'data-action="settings-page" data-arg="settingsTutorials"', 'About points at Tutorials');
    const prices = app.run('PLAN_PRICES');
    t.deepEq({ year: prices.year, month: prices.month }, { year: '£60 a year', month: '£6 a month' }, 'the prices shown match the pricing round (1B)');

    // Stripe-hosted (V142 5A): no Stripe or Google script anywhere in the app.
    const shipped = read('index.html') + read('plan.js') + read('cloud.js') + read('billing-done.html') + read('signin-done.html');
    t.notOk(/js\.stripe\.com|<script[^>]+stripe/i.test(shipped), 'no Stripe script in the app');
    t.notOk(/accounts\.google\.com\/gsi|<script[^>]+google/i.test(shipped), 'no Google script (V140 1A)');
    t.notOk(/billing-done\.html/.test(read('sw.js')) || /billing-done\.html/.test(read('index.html')), 'billing-done.html is not in ASSETS or index.html (only opened online)');
    t.notOk(new RegExp(String.raw`\bconfirm\(|\balert\(|\bprompt\(`).test(read('plan.js') + read('cloud.js') + read('sync.js')), 'no browser dialogs');

    // The taps: wired, guarded, harmless without plan.js (rule 6).
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
    // sync.js asks plan.js; plan.js asks sync.js — each fails soft without the other.
    const noSync = bootApp({ skip: ['sync.js'] });
    noSync.state = () => noSync.refresh('state').state;
    t.doesNotThrow(() => noSync.fn('planNote')({ plan: 'active' }), 'planNote without sync.js');
    t.eq(noSync.fn('planLineText')({ phase: 'paid' }), '', 'the plan line without sync.js');

    // 80e's lasting checks: every cloud tap from V139 and V140 wired and guarded.
    const NEW = ['cloud-google', 'cloud-google-connect', 'cloud-google-cancel', 'cloud-google-off',
                 'cloud-google-keep', 'cloud-google-disconnect',
                 'cloud-password-sign-in', 'cloud-forgot', 'cloud-use-code', 'cloud-use-password',
                 'cloud-password-open', 'cloud-password-cancel', 'cloud-password-save', 'cloud-password-toggle'];
    for (const n of NEW) t.ok(new RegExp(`'${n}':\\s*\\([^)]*\\) => \\{ if \\(typeof cloud\\w+ === 'function'\\)`).test(disp), `${n} wired, typeof-guarded`);
    const bare = bootApp({ skip: ['cloud.js'] });
    bare.state = () => bare.refresh('state').state;
    const actions = bare.run('ACTIONS');
    for (const n of NEW) t.doesNotThrow(() => actions[n]('', bare.doc.createElement('button')), `${n} harmless without cloud.js`);
    bare.state().view = 'cloudAccount';
    t.doesNotThrow(() => bare.fn('render')(), 'Account page renders without cloud.js');
    bare.state().view = 'cloudSubscription';
    t.doesNotThrow(() => bare.fn('render')(), 'the Subscription page renders without cloud.js');

    // A form never navigates: the submit that follows Sign in / Go is cancelled at #app.
    const f = bootApp({});
    f.state = () => f.refresh('state').state;
    f.sandbox.localStorage.setItem('pat:cloudUnlocked', '1');
    f.state().view = 'cloudAccount';
    f.fn('render')();
    const ev = { type: 'submit', target: f.doc.createElement('form'), defaultPrevented: false,
                 preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
    f.doc.getElementById('app').dispatchEvent(ev);
    t.ok(ev.defaultPrevented, 'a submit on the Account page is cancelled (the app does not reload)');

    // 77e's lasting checks (carried by 78e, 79e, 80e, 81e).
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
