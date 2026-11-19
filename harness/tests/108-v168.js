/* Standing test — V168: each business on its own plan (the per-business lock) + the second audit's finding 5
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   Peter, 11 Nov: "nobody with a paid seat in any business may be locked; a member's
   own lapsed solo business should lock only its own jobs". Round 14 Nov: 0B (seat
   billing is V169), 5A (New job greys a business whose plan has ended), 6A (the
   pop-ups only for a business you own that matters here; otherwise a quiet line on
   that business's jobs). Finding 5: one business's refusal paused the whole account;
   photo files were judged by the main business.

     108a  THE RULES. A business's own plan (my_business_plans → each stored business's
           p / te / la; garbage collapses). Someone in ONE business: the account's
           record, exactly as before. Two or more: each job by ITS business — the
           team's job logs while the own business is locked, and the other way round;
           a business whose plan isn't known falls back to the account; the 30-day
           hold (the account's) holds every business. The gates: logging, a
           certificate; the sheet names the business and says who renews.
     108b  NEW JOB (5A). The For list greys an ended business with a line; it starts
           on an open one; Start makes the job there; every business ended → New
           job refused at the tap.
     108c  THE NUDGES (6A). The Jobs list line and the sheets only for a business you
           OWN that matters here (jobs on this phone, or other people); a member's
           ended team, or an idle own business: no line, no sheet — the job's own
           quiet line on its Overview instead. A non-main business: Business page.
     108d  THE CLOUD, PER BUSINESS (finding 5) — the REAL library against a server
           that refuses only the lapsed business: its jobs, settings and photos wait;
           the team's go; the line names it; a plan read that renews it sends what
           waited; Sync now tries everything once; another account's refusal is not
           this one's.
     108e  the SQL: v168-business-plans.sql's parts; schema.sql's last section in
           step; D1–D5; isolation 33a–33c and 19e's photo row.
     108f  V168's About line; plan.js / sync.js / business.js name V168 (V169: the
           release checks → 109f).

   ⚠ The database rules themselves were proved in a real Postgres (PGlite + a Supabase
   stand-in, the WHOLE schema.sql: an upgraded project and a new one, the migration
   and schema twice; 60 checks; eight broken copies each caught — the ninth, the
   signed-in check, is belt-and-braces: with nobody signed in no membership matches
   either). The isolation file whole: 150 PASS / 7 INCONCLUSIVE / 0 FAIL. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { tick, freshApp, withItem } = require('../fixture');

const LIB  = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;
const DAY = 86400000;
const UID = '11111111-1111-1111-1111-111111111111';
const AUTH = 'patgo:cloudAuth:test';
const OWN  = 'aaaaaaaa-0000-4000-8000-000000000001';
const TEAM = 'aaaaaaaa-0000-4000-8000-000000000002';
const iso = (ms) => new Date(ms).toISOString();
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const REFUSAL = { code: '42501', details: null, hint: 'Renew in PATGo: Settings, Account & Sync, Subscription.',
  message: 'patgo_plan_locked: this business\'s PATGo plan has ended, so the cloud is not taking changes' };
const LAPSED = () => ({ plan: 'lapsed', trial_ends_at: iso(Date.now() - 90 * DAY), lapsed_at: iso(Date.now() - 20 * DAY) });
const GRACE  = () => ({ plan: 'lapsed', trial_ends_at: iso(Date.now() - 90 * DAY), lapsed_at: iso(Date.now() - 2 * DAY) });
const ACTIVE = () => ({ plan: 'active', trial_ends_at: null, lapsed_at: null });

function storedSession(id = UID) {
  const life = 3600;
  return JSON.stringify({
    access_token: 'ZZACCESS168', token_type: 'bearer', expires_in: life,
    expires_at: Math.floor(Date.now() / 1000) + life, refresh_token: 'ZZREFRESH',
    user: { id, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' },
  });
}

// A pretend Supabase that judges each row by ITS business, as plan_guard does.
// srv.biz: the businesses (my_businesses); srv.plan: each business's plan
// (my_business_plans); srv.shut: businesses the database refuses. A job with no
// org_id is the main business's (OWN). Photo rows follow their job's business;
// photo files: a known photo by its row's business, a new one if any business is open.
function fakeServer() {
  const calls = [];
  const tables = { sessions: [], records: [], photos: [] };
  const files = new Set();
  const srv = { calls, tables, files, shut: new Set(), oldSql: false,
    biz: [
      { id: OWN, name: '', role: 'owner', is_default: true, members: 1 },
      { id: TEAM, name: 'Acme Testing Ltd', role: 'engineer', is_default: false, members: 3 },
    ],
    plan: { [OWN]: ACTIVE(), [TEAM]: ACTIVE() },
    profile: ACTIVE(),
  };
  const orgOfJob = (id) => { const r = tables.sessions.find(x => String(x.id) === String(id)); return r ? (r.org_id || OWN) : OWN; };
  srv.fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    let body = null;
    if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    else body = init.body || null;
    calls.push({ url: u, method, body });
    if (u.endsWith('/rest/v1/rpc/my_businesses')) return json(srv.biz);
    if (u.endsWith('/rest/v1/rpc/my_business_plans')) {
      if (srv.oldSql) return json({ code: 'PGRST202', message: 'Could not find the function public.my_business_plans' }, 404);
      return json(srv.biz.filter(b => b.id !== srv.omit).map(b => Object.assign({ id: b.id }, srv.plan[b.id])));
    }
    if (u.endsWith('/rest/v1/rpc/my_billing')) return json(Object.assign({ role: 'owner', can_manage: true, cover: srv.profile }, srv.profile));
    if (u.includes('/rest/v1/rpc/')) return json([]);
    if (u.includes('/rest/v1/profiles')) return json([srv.profile]);
    if (u.includes('/storage/v1/object/photos')) {
      if (method === 'DELETE') return json([]);
      const p = decodeURIComponent(u.split('/storage/v1/object/photos/')[1].split('?')[0]);
      const pid = p.split('/')[1].replace(/(_t)?\.jpg$/, '');
      const row = tables.photos.find(r => r.id === pid);
      const ok = row ? !srv.shut.has(orgOfJob(row.session_id)) : srv.biz.some(b => !srv.shut.has(b.id));
      if (!ok) return json({ statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' }, 400);
      files.add(p);
      return json({ Key: 'photos/' + p, Id: 'x' });
    }
    for (const name of ['sessions', 'records', 'photos']) {
      if (!u.includes('/rest/v1/' + name)) continue;
      if (method === 'GET') return json(tables[name]);
      const rows = Array.isArray(body) ? body : [body];
      const orgs = rows.map(r => name === 'sessions' ? (r.org_id || OWN) : name === 'photos' ? orgOfJob(r.session_id) : OWN);
      if (orgs.some(o => srv.shut.has(o))) return json(REFUSAL, 403);   // one refused row fails its batch
      if (method === 'PATCH') return new Response(null, { status: 204 });
      for (const row of rows) {
        const i = tables[name].findIndex(r => String(r.id) === String(row.id));
        if (i === -1) tables[name].push(Object.assign({}, row)); else tables[name][i] = Object.assign({}, row);
      }
      return new Response(null, { status: 201 });
    }
    if (u.includes('/storage/v1/')) return json([]);
    if (u.includes('/rest/v1/')) return method === 'GET' ? json([]) : new Response(null, { status: 201 });   // phones, etc.
    return json({ message: 'unexpected ' + u }, 404);
  };
  srv.posts = (table) => calls.filter(c => c.method === 'POST' && c.url.includes('/rest/v1/' + table + '?'));
  srv.sentJobs = () => tables.sessions.map(r => String(r.id));
  srv.uploads = () => calls.filter(c => c.method === 'POST' && c.url.includes('/storage/v1/object/photos/') && !/_t\.jpg/.test(c.url));
  return srv;
}

function closeSheets(app) {
  app.doc.body.children.slice().forEach(c => { if (c && /bulk-sheet|modal-backdrop/.test(c.className || '')) c.remove(); });
}
const sheets = (app) => app.doc.body.children.filter(c => c && /bulk-sheet/.test(c.className || ''));
const sheetText = (app) => sheets(app).map(s => s.innerHTML).join('\n');

async function until(cond, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await tick(10);
  return cond();
}

// Signed in with the real library, booted offline (what the phone knows), then
// online. o.biz = false: no stored businesses (someone in one).
async function signedIn(o = {}) {
  const ls = Object.assign({ [AUTH]: storedSession(), 'pat:cloudUnlocked': '1' }, o.localStorage || {});
  const app = bootApp({ localStorage: ls, navigator: { onLine: false } });
  app.fn('load')();
  app.state = () => app.refresh('state').state;
  app.stopTimer = () => app.run('if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }');
  const srv = o.srv || fakeServer();
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
  app.run('navigator.onLine = true');
  await tick(5);
  return app;
}

// The account's record (the cover) and the stored businesses with their plans.
const NAMES = { [OWN]: '', [TEAM]: 'Acme Testing Ltd' };
function setPlans(app, plans, o = {}) {
  app.fn('planNote')(o.cover || ACTIVE());
  if (o.checkedAt) {
    const r = JSON.parse(app.sandbox.localStorage.getItem('pat:plan'));
    r.checkedAt = o.checkedAt;
    app.sandbox.localStorage.setItem('pat:plan', JSON.stringify(r));
  }
  const list = (o.list || [
    { id: OWN, role: 'owner', def: true, n: 1 },
    { id: TEAM, role: 'engineer', def: false, n: 3 },
  ]).map(b => {
    const p = plans[b.id];
    const x = Object.assign({ name: NAMES[b.id] || '' }, b);
    if (p) { x.p = p.plan; x.te = p.trial_ends_at; x.la = p.lapsed_at; }
    return x;
  });
  app.sandbox.localStorage.setItem('pat:businesses', JSON.stringify({ u: UID, at: Date.now(), list }));
}

// A job made straight onto the phone (no gate), for business `biz` ('' = main).
function job(app, site, biz) {
  const st = app.state();
  const id = 'zz-' + site;
  const s = { id, name: 'Job ' + site, site, clientId: '', siteId: '', engineer: 'Pat', prefix: '', date: '2026-11-14',
    startNumber: 1, items: [], locked: false };
  if (biz) s.businessId = biz;
  st.sessions.push(s);
  st.activeId = id;
  app.fn('save')();
  return s;
}

module.exports = async function () {
  /* ------------------------------------------------------------------ 108a */
  await t.group('108a — each job by its own business’s plan (two or more); one business as before; the gates name the business', async () => {
    const app = await signedIn();
    const load = app.fn('businessLoad');
    // The stored shape: a plan PATGo knows and dates as text; anything else dropped.
    app.sandbox.localStorage.setItem('pat:businesses', JSON.stringify({ u: UID, at: 1, list: [
      { id: OWN, role: 'owner', def: true, n: 1, p: 'lapsed', te: 'x', la: iso(Date.now()) },
      { id: TEAM, role: 'engineer', n: 3, p: 'gold', te: iso(Date.now()) },
    ] }));
    const l = load().list;
    t.eq(l[0].p, 'lapsed', 'a known plan kept');
    t.eq(l[0].te, null, '…a date that isn’t one collapses to none');
    t.ok(typeof l[0].la === 'string', '…a real date kept');
    t.notOk('p' in l[1], 'an unknown plan is “not known”');

    // ONE business: the account's record decides, whatever the business says.
    setPlans(app, { [OWN]: LAPSED() }, { list: [{ id: OWN, role: 'owner', def: true, n: 1 }] });
    t.eq(app.fn('planStatusFor')({ businessId: '' }).phase, 'paid', 'one business: the account (paid) decides, as before');
    t.ok(app.fn('planGate')(null), 'the account gate: open');

    // TWO: the employee — own business lapsed 20 days ago, the team paid; the cover paid.
    setPlans(app, { [OWN]: LAPSED(), [TEAM]: ACTIVE() });
    const pf = app.fn('planStatusFor');
    t.eq(pf('').phase, 'locked', 'the main (own) business: locked');
    t.eq(pf(TEAM).phase, 'paid', 'the team: paid');
    t.eq(pf({ businessId: TEAM }).phase, 'paid', '…a job of the team');
    t.eq(pf({}).phase, 'locked', 'a job naming none is the main business’s');
    t.eq(app.fn('planCurrent')().phase, 'paid', 'the account (the cover) is still paid — a paid seat anywhere');
    t.ok(app.fn('planLockedFor')(OWN), 'planLockedFor: own');
    t.notOk(app.fn('planLockedFor')(TEAM), 'planLockedFor: team');

    // The gates: the team's job logs; the own business's job doesn't.
    const tj = job(app, 'ZZTEAM', TEAM);
    withItem(app, { assetNo: 'ZZ168-T1' });
    t.eq(app.fn('activeSession')().items.length, 1, 'a test logged on the team’s job');
    t.eq(sheets(app).length, 0, '…no sheet');
    job(app, 'ZZOWN', '');
    withItem(app, { assetNo: 'ZZ168-O1' });
    t.eq(app.fn('activeSession')().items.length, 0, 'the own business’s job: refused');
    const s1 = sheetText(app);
    t.includes(s1, 'Renew to carry on', 'the Owner is asked to renew');
    t.includes(s1, 'Your business’s PATGo plan has ended, so logging tests, starting jobs and making certificates for its jobs are paused until you renew.', '…naming the business, its jobs only');
    t.includes(s1, 'Jobs for your other businesses carry on as normal.', '…and the others carry on');
    t.includes(s1, 'Renew now', '…Renew now (it is the main business)');
    closeSheets(app);
    for (const fn of ['passClicked', 'failClicked', 'copyLastResult']) {
      app.fn(fn)();
      t.ok(sheets(app).length >= 1, fn + ': refused on the own business’s job');
      closeSheets(app);
    }
    app.run(`produceReport(${JSON.stringify(tj.id)})`);
    await tick(5);
    t.notOk(/Renew to carry on|plan has ended/.test(sheetText(app)), 'a certificate for the team’s job is not stopped by the plan');
    closeSheets(app);
    app.run("produceReport('zz-ZZOWN')");
    await tick(5);
    t.includes(sheetText(app), 'Renew to carry on', 'a certificate for the own business’s job: refused');
    closeSheets(app);

    // The member: the TEAM's plan ended, the own business paid.
    setPlans(app, { [OWN]: ACTIVE(), [TEAM]: LAPSED() });
    app.state().activeId = tj.id;
    withItem(app, { assetNo: 'ZZ168-T2' });
    t.eq(app.fn('activeSession')().items.length, 1, 'the team’s plan ended: its job refused');
    const s2 = sheetText(app);
    t.includes(s2, 'Acme Testing Ltd’s plan has ended', 'the sheet names the team');
    t.includes(s2, '— the business owner looks after it', '…and who renews');
    t.includes(s2, 'Check now', '…Check now, not Renew');
    t.excludes(s2, 'Renew now', '…no Renew now');
    closeSheets(app);
    app.state().activeId = 'zz-ZZOWN';
    withItem(app, { assetNo: 'ZZ168-O2' });
    t.eq(app.fn('activeSession')().items.length, 1, '…and the own business’s job logs');

    // An own business that isn't main: the way to renew is the Business page.
    setPlans(app, { [OWN]: LAPSED(), [TEAM]: ACTIVE() }, { list: [
      { id: OWN, role: 'owner', def: false, n: 1 }, { id: TEAM, role: 'engineer', def: true, n: 3 }] });
    app.state().activeId = 'zz-ZZOWN';
    app.state().sessions.find(s => s.id === 'zz-ZZOWN').businessId = OWN;
    app.fn('passClicked')();
    const s3 = sheetText(app);
    t.includes(s3, 'make it your main business on the Business page, then renew it on the Subscription page', 'a non-main own business: how to renew it');
    t.ok(/>Business page<\/button>/.test(s3), '…its button');
    closeSheets(app);

    // Not known: the account decides. Held for 30 days: every business.
    setPlans(app, { [OWN]: LAPSED() });
    t.eq(pf(TEAM).phase, 'paid', 'a business whose plan isn’t known: the account’s (paid)');
    setPlans(app, { [OWN]: ACTIVE(), [TEAM]: ACTIVE() }, { checkedAt: Date.now() - 31 * DAY });
    t.ok(pf(TEAM).unchecked, 'not checked for 30 days: the team held too');
    app.state().activeId = tj.id;
    app.fn('passClicked')();
    t.includes(sheetText(app), 'Plan check needed', '…with the check sheet');
    closeSheets(app);
  });

  /* ------------------------------------------------------------------ 108b */
  await t.group('108b — New job: an ended business greyed with a line, the form starts on an open one, Start makes it there (5A)', async () => {
    const app = await signedIn();
    setPlans(app, { [OWN]: LAPSED(), [TEAM]: ACTIVE() });
    app.fn('setView')('sessions');
    app.run("ACTIONS['new-session']()");
    t.eq(sheets(app).length, 0, 'New job opens (the team is open)');
    const h = html(app);
    t.includes(h, `<option value="${OWN}" disabled>Your business — plan ended</option>`, 'the own business greyed out, said why');
    t.includes(h, `<option value="${TEAM}" selected>Acme Testing Ltd (Engineer)</option>`, '…the team picked');
    t.includes(h, 'id="nf-business-shut">Your business — its plan has ended, so new jobs can’t start there until it’s renewed.</p>', '…and one line');
    t.eq(app.fn('businessNewJobTarget')(), TEAM, 'the target: the team');
    app.state().newForm.businessId = OWN;   // a stale pick
    t.eq(app.fn('businessForInitial')(), TEAM, 'never an ended one first');
    const st = app.state();
    st.newForm.clientId = 'ZZ Client'; st.newForm.site = 'ZZ168 Site'; st.newForm.engineer = 'Pat';
    st.newForm.businessId = TEAM;
    app.fn('createSession')();
    const s = app.fn('activeSession')();
    t.ok(s && s.site.indexOf('ZZ168 Site') !== -1, 'Start made the job');
    t.eq(s.businessId, TEAM, '…for the team');
    // Picked the ended one anyway (the form was open when it ended): Start refuses.
    st.newForm.show = true; st.newForm.clientId = 'ZZ Client'; st.newForm.site = 'ZZ168 Other'; st.newForm.businessId = OWN;
    const n0 = st.sessions.length;
    setPlans(app, { [OWN]: LAPSED(), [TEAM]: LAPSED() });
    app.fn('createSession')();
    t.eq(st.sessions.length, n0, 'every business ended: Start refuses');
    t.includes(sheetText(app), 'Renew to carry on', '…saying so');
    closeSheets(app);
    st.newForm.show = false;
    app.run("ACTIONS['new-session']()");
    t.notOk(app.state().newForm.show, 'every business ended: New job doesn’t open');
    t.ok(sheets(app).length >= 1, '…the sheet says why');
    closeSheets(app);
    // Every business ended: none greyed (Start says why instead).
    app.fn('setView')('sessions');
    app.state().newForm.show = true;
    app.fn('render')();
    t.includes(html(app), 'id="nf-business"', 'set-up: New job on screen');
    t.excludes(html(app), '— plan ended</option>', 'all ended: nothing greyed — Start explains');
    // One business only: no For list at all (as before).
    setPlans(app, { [OWN]: ACTIVE() }, { list: [{ id: OWN, role: 'owner', def: true, n: 1 }] });
    app.fn('render')();
    t.excludes(html(app), 'id="nf-business"', 'one business: no For');
  });

  /* ------------------------------------------------------------------ 108c */
  await t.group('108c — the line and sheets only for a business you own that matters here; otherwise the job’s quiet line (6A)', async () => {
    const app = await signedIn();
    const jobsList = () => { closeSheets(app); app.state().view = 'sessions'; app.fn('render')(); return html(app); };
    // The employee: own business ended 2 days ago (grace), idle — no jobs of it here.
    setPlans(app, { [OWN]: GRACE(), [TEAM]: ACTIVE() });
    job(app, 'ZZT', TEAM);
    t.excludes(jobsList(), 'id="plan-banner"', 'an idle own business: no Jobs list line');
    t.eq(app.fn('planMaybePrompt')(), '', '…and no sheet');
    t.eq(app.fn('planNagBusiness')(), null, '…nothing to nag about');
    // A job of it on this phone: it matters.
    job(app, 'ZZO', '');
    const h = jobsList();
    t.includes(h, 'Your business’s plan has ended. Logging on its jobs locks in', 'a job of it here: the line, by name');
    t.includes(h, 'data-action="plan-renew">Renew now</button>', '…Renew now (the main business)');
    app.state().newForm.show = false;   // (the empty Jobs list opened New job)
    t.eq(app.fn('planMaybePrompt')(), 'ended', 'the sheet once');
    t.includes(sheetText(app), 'Your business’s plan has ended', '…naming it');
    t.includes(sheetText(app), 'Jobs for your other businesses carry on.', '…and the others carry on');
    closeSheets(app);
    t.eq(app.fn('planMaybePrompt')(), '', '…and not again');
    // Its job carries the quiet line; the team's doesn't.
    app.state().activeId = 'zz-ZZO';
    app.fn('setView')('overview');
    t.includes(html(app), 'id="plan-job-line">Your business’s plan has ended — renew it to carry on. Logging on this job locks in', 'the job’s own line');
    app.state().activeId = 'zz-ZZT';
    app.fn('setView')('overview');
    t.excludes(html(app), 'plan-job-line', 'the team’s job: none');

    // The member: the TEAM's plan ended — no Jobs list line, no sheet; its jobs say so.
    setPlans(app, { [OWN]: ACTIVE(), [TEAM]: LAPSED() });
    t.excludes(jobsList(), 'id="plan-banner"', 'a team you’re an Engineer in: no Jobs list line');
    t.eq(app.fn('planMaybePrompt')(), '', '…no sheet');
    app.state().activeId = 'zz-ZZT';
    app.fn('setView')('overview');
    t.includes(html(app), 'Acme Testing Ltd’s plan has ended, so this job is locked for logging and certificates — the business owner looks after it.', 'its job: the quiet line');

    // The Owner of a team (others in it) with no jobs here: it matters.
    const b = await signedIn();
    setPlans(b, { [OWN]: GRACE(), [TEAM]: ACTIVE() }, { list: [
      { id: OWN, role: 'owner', def: true, n: 4 }, { id: TEAM, role: 'engineer', def: false, n: 3 }] });
    closeSheets(b); b.state().view = 'sessions'; b.fn('render')();
    t.includes(html(b), 'Your business’s plan has ended.', 'a team you own: the line though no jobs are here');
    // A non-main own business: the Business page, not Renew.
    setPlans(b, { [OWN]: LAPSED(), [TEAM]: ACTIVE() }, { list: [
      { id: OWN, role: 'owner', def: false, n: 4 }, { id: TEAM, role: 'engineer', def: true, n: 3 }] });
    b.fn('render')();
    t.includes(html(b), 'data-arg="cloudBusiness">Business page</button>', 'not the main business: Business page');
    b.state().view = 'cloudAccount'; b.fn('render')();
    t.includes(html(b), 'id="cloud-plan-renew" data-action="settings-page" data-arg="cloudBusiness"', '…the Account page too');
  });

  /* ------------------------------------------------------------------ 108d */
  await t.group('108d — the cloud per business (finding 5): the refused business waits, the team syncs; named; renewing sends what waited', async () => {
    const app = await signedIn();
    const srv = app.srv;
    const st = app.state();
    setPlans(app, {});   // the businesses known, their plans not yet
    const read = await app.fn('businessRead')(await app.run('cloudClient()'), UID);
    t.ok(read, 'set-up: the businesses read (their plans with them)');
    t.eq(app.fn('businessList')().map(b => b.p).join(','), 'active,active', '…each business’s plan stored');
    srv.omit = TEAM;
    await app.fn('businessPlansRead')(await app.run('cloudClient()'), UID);
    t.notOk('p' in app.fn('businessList')().find(x => x.id === TEAM), 'a business missing from the answer: its plan forgotten (the account decides)');
    srv.omit = '';
    await app.fn('businessPlansRead')(await app.run('cloudClient()'), UID);
    app.stopTimer();
    const teamJob = job(app, 'ZZTEAM', TEAM);
    withItem(app, { assetNo: 'ZZ168-T1' });
    const ownJob = job(app, 'ZZOWN', '');
    withItem(app, { assetNo: 'ZZ168-O1' });
    app.stopTimer();
    // The own business lapses — the server refuses it; the phone reads its plan.
    srv.plan[OWN] = LAPSED();
    srv.shut.add(OWN);
    await app.fn('businessPlansRead')(await app.run('cloudClient()'), UID);
    t.eq(app.fn('planStatusFor')('').phase, 'locked', 'set-up: the own business locked on the phone too');
    app.stopTimer();

    await app.fn('syncPush')({});
    app.stopTimer();
    t.ok(srv.sentJobs().includes(teamJob.id), 'the team’s job went up');
    t.notOk(srv.sentJobs().includes(ownJob.id), 'the own business’s job: refused');
    t.ok(app.fn('syncPlanRefusedFor')(''), '…its business is noted as refused');
    t.notOk(app.fn('syncPlanRefusedFor')(TEAM), '…the team is not');
    t.notOk(app.run('_syncPausedAll()'), '…so the account is not paused whole (finding 5)');
    t.includes(st.sync.message, 'Cloud syncing is paused for your own business’s jobs because its plan has ended. Everything else is syncing', 'the Sync page names it');
    const jobPosts = srv.posts('sessions');
    t.ok(jobPosts.every(p => new Set((Array.isArray(p.body) ? p.body : [p.body]).map(r => r.org_id || OWN)).size === 1), 'one business per batch');

    // The next run: the refused business waits; the team keeps syncing; settings (the main business's) wait.
    const ownPosts = () => srv.posts('sessions').filter(p => (Array.isArray(p.body) ? p.body : [p.body]).some(r => r.id === ownJob.id)).length;
    const o0 = ownPosts();
    st.activeId = teamJob.id;
    withItem(app, { assetNo: 'ZZ168-T2' });
    st.engineer = 'ZZ Engineer 168';
    app.fn('save')();
    app.stopTimer();
    const rec0 = srv.posts('records').length;
    await app.fn('syncPush')({ pull: true });
    app.stopTimer();
    t.eq(ownPosts(), o0, 'the own business’s job isn’t tried again');
    t.eq(srv.tables.sessions.find(r => r.id === teamJob.id).doc.items.length, 2, 'the team’s new test went up');
    t.eq(srv.posts('records').length, rec0, 'settings (the main business’s) wait');

    // Photos: the team's goes; the own business's waits. (No picture decoding
    // here — previews would wait their 10 seconds.)
    app.run('photoThumbBlob = function () { return Promise.resolve(null); }');
    await tick(5);
    const addPhoto = async (sid, iid) => app.run(`photoAdd(${JSON.stringify(sid)}, ${JSON.stringify(iid)},
      { blob: new Blob(['ZZJPEG168'.repeat(50)], { type: 'image/jpeg' }), w: 1280, h: 960, bytes: 400 })`);
    const ph1 = await addPhoto(teamJob.id, teamJob.items[0].id);
    const ph2 = await addPhoto(ownJob.id, ownJob.items[0].id);
    await tick(20); app.stopTimer();
    await app.fn('syncPush')({ pull: true });
    t.eq(app.run('!!_syncTimer'), false, 'nothing queued for the waiting photo (it isn’t counted as more to send)');
    app.stopTimer();
    t.ok(srv.files.has(UID + '/' + ph1 + '.jpg'), 'the team job’s photo went up');
    t.ok(srv.tables.photos.some(r => r.id === ph1), '…with its row');
    t.notOk(srv.uploads().some(c => c.url.includes(ph2)), 'the own business’s photo isn’t even tried');

    // Sync now: everything tried once.
    const o1 = ownPosts();
    await app.fn('syncPush')({ manual: true });
    app.stopTimer();
    t.eq(ownPosts(), o1 + 1, 'Sync now tries the refused business once (the person asked)');
    t.ok(app.fn('syncPlanRefusedFor')(''), '…refused again');

    // Another account's refusal is not this one's.
    app.run("var __u = _syncPlanRefusedUid; _syncPlanRefusedUid = '22222222-2222-2222-2222-222222222222'");
    t.notOk(app.fn('syncPlanRefusedFor')(''), 'another account’s refusal does not hold this one');
    app.run('_syncPlanRefusedUid = __u');

    // A plan read that still says ended: still waiting. Renewed: everything goes.
    app.fn('planNote')(ACTIVE());   // the account read (paid — the cover)
    t.ok(app.fn('syncPlanRefusedFor')(''), 'a plan read while it’s still ended: still waiting');
    t.eq(app.run('!!_syncTimer'), false, '…nothing sent for it');
    srv.plan[OWN] = ACTIVE();
    srv.shut.delete(OWN);
    await app.fn('businessPlansRead')(await app.run('cloudClient()'), UID);
    t.notOk(app.fn('syncPlanRefused')(), 'renewed: nothing waits');
    t.eq(app.run('!!_syncTimer'), true, '…a send is scheduled at once');
    t.excludes(st.sync.message, 'Cloud syncing is paused for', '…the line has gone');
    app.stopTimer();
    await app.fn('syncPush')({ pull: true });
    app.stopTimer();
    t.ok(srv.sentJobs().includes(ownJob.id), 'the own business’s job goes up');
    t.ok(srv.posts('records').length > rec0, '…the settings');
    await app.fn('syncPush')({ pull: true });
    app.stopTimer();
    t.ok(srv.tables.photos.some(r => r.id === ph2), '…and its photo');

    // The team refused, the main business open: the main's settings still go.
    srv.plan[TEAM] = LAPSED(); srv.shut.add(TEAM);
    await app.fn('businessPlansRead')(await app.run('cloudClient()'), UID);
    st.activeId = ownJob.id; withItem(app, { assetNo: 'ZZ168-O2' }); app.stopTimer();
    // (the team's job can't take a test now — the phone locks it — so change it by hand)
    st.sessions.find(s => s.id === teamJob.id).name = 'ZZ renamed'; app.fn('save')(); app.stopTimer();
    await app.fn('syncPush')({ pull: true });
    app.stopTimer();
    t.ok(app.fn('syncPlanRefusedFor')(TEAM), 'the team refused');
    t.eq(srv.tables.sessions.find(r => r.id === ownJob.id).doc.items.length, 2, '…the own business still syncs');
    t.includes(st.sync.message, 'Cloud syncing is paused for Acme Testing Ltd’s jobs', '…named');

    // Sync now with the own business refused again (its job already in the cloud):
    // its photos are tried until the first is refused — then the rest wait.
    srv.plan[TEAM] = ACTIVE(); srv.shut.delete(TEAM);
    await app.fn('businessPlansRead')(await app.run('cloudClient()'), UID);
    app.stopTimer();
    srv.shut.add(OWN);
    const ph3 = await addPhoto(ownJob.id, ownJob.items[0].id);
    const ph4 = await addPhoto(ownJob.id, ownJob.items[0].id);
    await tick(20); app.stopTimer();
    const u1 = srv.uploads().length;
    await app.fn('syncPush')({ manual: true, pull: true });
    app.stopTimer();
    const tried = srv.uploads().slice(u1).filter(c => c.url.includes(ph3) || c.url.includes(ph4)).length;
    t.eq(tried, 1, 'Sync now: one of the refused business’s photos tried, the next waits');
    t.notOk(srv.tables.photos.some(r => r.id === ph3 || r.id === ph4), '…neither row taken');
    t.ok(app.fn('syncPlanRefusedFor')(''), '…its business noted');
    t.notOk(app.fn('syncPlanRefusedFor')(TEAM), '…the team still free (the refusal was the photo’s own business, not everything)');

    // A business refused in THIS run holds its photos in this run too, and its
    // waiting photos never crowd out another business's (a round takes 25).
    const d = await signedIn();
    const dv = d.srv;
    setPlans(d, {});
    await d.fn('businessRead')(await d.run('cloudClient()'), UID);
    d.run('photoThumbBlob = function () { return Promise.resolve(null); }');
    const dOwn = job(d, 'ZZDOWN', ''); withItem(d, { assetNo: 'ZZ168-D1' });
    const dTeam = job(d, 'ZZDTEAM', TEAM); withItem(d, { assetNo: 'ZZ168-D2' });
    d.stopTimer();
    await d.fn('syncPush')({ pull: true }); d.stopTimer();
    t.ok(dv.sentJobs().includes(dOwn.id) && dv.sentJobs().includes(dTeam.id), 'set-up: both jobs in the cloud');
    await tick(5);
    const addTo = async (sj, i = 0) => d.run(`photoAdd(${JSON.stringify(sj.id)}, ${JSON.stringify(sj.items[i].id)},
      { blob: new Blob(['ZZJPEG168D'.repeat(50)], { type: 'image/jpeg' }), w: 1280, h: 960, bytes: 400 })`);
    d.state().activeId = dOwn.id;
    for (let k = 2; k <= 9; k++) withItem(d, { assetNo: 'ZZ168-D1-' + k });
    d.stopTimer();
    await d.fn('syncPush')({ pull: true }); d.stopTimer();
    const many = [];
    for (let k = 0; k < 27; k++) many.push(await addTo(dOwn, Math.floor(k / 3)));
    t.eq(many.filter(Boolean).length, 27, 'set-up: 27 photos on the own business’s job');
    await tick(20);
    const teamPh = await addTo(dTeam);
    await tick(20); d.stopTimer();
    dv.plan[OWN] = LAPSED(); dv.shut.add(OWN);   // ended — the phone doesn't know yet
    d.state().sessions.find(x => x.id === dOwn.id).name = 'ZZ renamed'; d.fn('save')(); d.stopTimer();
    await d.fn('syncPush')({ pull: true }); d.stopTimer();
    t.ok(d.fn('syncPlanRefusedFor')(''), 'the job refused this run');
    t.eq(dv.uploads().filter(c => many.some(id => c.url.includes(id))).length, 0, '…none of its photos tried in the same run');
    t.ok(dv.files.has(UID + '/' + teamPh + '.jpg'), '…and the team’s photo went up, though 27 older ones wait (a round takes 25)');

    // Every plan read (planRefresh: the app start, back to the front) brings each business's plan.
    srv.plan[TEAM] = GRACE();
    t.eq(app.fn('businessList')().find(x => x.id === TEAM).p, 'active', 'set-up: the phone has the team as paid');
    await app.fn('planRefresh')();
    t.eq(app.fn('businessList')().find(x => x.id === TEAM).p, 'lapsed', 'a plan read brings each business’s plan with it');

    // A database without the V168 read: the account's plan decides, nothing breaks.
    const c = await signedIn();
    c.srv.oldSql = true;
    setPlans(c, {});
    t.eq(await c.fn('businessPlansRead')(await c.run('cloudClient()'), UID), false, 'no V168 SQL: the read changes nothing');
    t.eq(c.fn('planStatusFor')(TEAM).phase, 'paid', '…the account decides');
  });

  /* ------------------------------------------------------------------ 108e */
  await t.group('108e — the SQL: schema.sql in step; my_business_plans; photo files by the job’s business; D1–D5; isolation 33a–33c, 19e', () => {
    const mig = read('supabase/v168-business-plans.sql');
    const end = '-- ================================================================ end V168\n';
    const block = mig.slice(mig.indexOf('-- ================================================================ V168\n'), mig.indexOf(end) + end.length);
    t.ok(block.length > 2000, 'the migration has its definitions');
    // V169: no longer the LAST section (V169's follows — 109e); still whole, and
    // nothing after it redefines its two functions or the photo-file rules.
    const sch = read('supabase/schema.sql');
    t.ok(sch.includes(block), 'a new project gets them byte for byte');
    t.ok(!/function public\.(my_business_plans|can_upload_file)\(|own photo files/.test(sch.slice(sch.indexOf(block) + block.length)), '…and no later section redefines them');
    t.includes(block, "  where m.user_id = auth.uid()\n  order by m.is_default desc, o.created_at, o.id", 'my_business_plans: only the caller’s businesses');
    t.includes(block, "revoke all on function public.my_business_plans() from public, anon;", '…nobody signed out');
    t.eq((block.match(/language sql stable security definer set search_path = '' as \$\$/g) || []).length, 2, 'both with their own rights, a pinned search path');
    t.includes(block, "p.storage_path in (name, regexp_replace(name, '_t\\.jpg$', '.jpg'))\n                     and public.can_upload(p.org_id))", 'a known photo’s file (or preview): its row’s business');
    t.includes(block, "where m.user_id = auth.uid() and public.can_upload(m.org_id))", 'a new file: any of the person’s businesses that may upload');
    t.eq((block.match(/and public\.can_upload_file\(name\)\);/g) || []).length, 2, 'both file rules ask it');
    t.excludes(block, 'can_upload_files()', '…not the main business any more');
    for (const n of ['1', '2', '3', '4', '5']) t.includes(mig, `select ${n}, '`, 'self-check D' + n);
    const iso = read('supabase/isolation-test.sql');
    for (const g of ['33a', '33b', '33c']) t.includes(iso, `res := res || array['${g}|`, 'isolation ' + g);
    t.includes(iso, "33a|B reads the plan of each of B''s businesses, and no other|FAIL|run supabase/v168-business-plans.sql first", '…33a names the file');
    t.includes(iso, "insert into storage.objects (bucket_id, name) values ('photos', b::text || '/iso-test-v143-f.jpg');", '19e: the file of a photo row of the lapsed business');
    t.excludes(iso, "values ('photos', b::text || '/iso-test-v143.jpg');", '…not a new file (taken while B is in an open business)');
  });

  /* ------------------------------------------------------------------ 108f */
  // V169: the release checks moved to 109f; this keeps V168's own lines.
  // V171: V168's About line rolled off (the window is V171 / V170 / V169).
  await t.group('108f — plan.js / sync.js / business.js name V168', () => {
    t.includes(read('plan.js'), '// ---- V168: each business on its own plan', 'plan.js names V168');
    t.includes(read('sync.js'), "// V168 (finding 5): WHICH businesses the cloud refused", 'sync.js names V168');
    t.includes(read('business.js'), "// V168: each of my businesses' own plan", 'business.js names V168');
  });
};
