/* Standing test — V169: seat billing — £3 a month (£30 a year) per Engineer or Team leader
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   Pricing (R65 7C, 11 Nov): £6 a month including the Owner + £3 per extra Engineer
   or Team leader; Office free; yearly 10×. Round 14 Nov (R79): 1A part-month on the
   next bill, a credit on leaving; 2A a seat costs from joining / being made Engineer
   or Team leader, Office frees it; 3A anyone allowed to invite sees "+£3 a month", the
   Owner the count and total; 4A any number free in the trial, the count at
   subscribing. Round 18 Nov (R80, Peter — "1 A 2 A 3 A 4 B 5 A"): 1A the database
   writes every change down, the server puts Stripe right at once, and the database
   asks again every 10 minutes; 2A yearly: the part-year charged that day ("if they
   join in month 10 it's pro rata for the 2 months"); 3A monthly ↔ yearly inside
   PATGo ("so people can change and don't feel locked in"); 4B the Owner emailed about
   every change ("it's a money thing"); 5A founders' pricing = a Stripe discount code.

     109a  THE PHONE'S FIGURES. business_seats → memory (garbage dropped); the
           Owner's Paid seats block (count, the plan, the changes); what a seat
           costs said on the invite (role choice + the name sheet), on a role change
           and on the remove sheet — paying, in the trial, ended, comped, not read.
     109b  4B ON THE PHONE + THE NUDGE. A change someone ELSE made → the Jobs line
           until Got it (seats_seen, gone at once); your own change never; an
           Engineer never. A step that can change a seat (Join, a role change,
           Remove, Leave) asks the server function billing-seats straight after —
           with the REAL library — and an invite (no seat yet) doesn't.
     109c  THE SUBSCRIPTION PAGE (4A, 3A). The prices carry the seats; Subscribe's
           choice says them; Switch to yearly / monthly — not while a payment is
           failing or the plan is set to end; its sheet says what happens (trial,
           to yearly, to monthly); billing-switch called with the choice; a refusal
           said; the plan read again.
     109d  THE SERVER (supabase/functions/_shared/billing.js, a pretend Stripe,
           database and Resend): seatPlan (add / update / remove / none / a wrong
           interval's price swapped), seatProration (monthly next bill, yearly at
           once, the trial nothing), the checkout's seat line, the webhook recording
           Stripe's count, billing-seats end to end (Stripe put right, the email
           claimed, sent and recorded; the trial: no bill, no email; no email key:
           left to try again; Stripe failing: nothing recorded, nothing emailed),
           billing-switch (who may, both lines swapped, the plan recorded), the
           email's words, the entry files.
     109e  the SQL: schema.sql's last section in step; the trigger, the closed
           record, the server's side, the app's reads, the nudge; E1–E7; isolation
           34a–34c.
     109f  release: V169; cache pat-v169; What's new one line; About V169 / V168 / V167.

   ⚠ The database rules themselves were proved in a real Postgres (PGlite + a Supabase
   stand-in, the WHOLE schema.sql — an upgraded project with the migration twice,
   then schema.sql twice, and a new project): 41 checks each way (123 in all) —
   joining by a real invite, Office free, a role change each way, Engineer ↔ Team
   leader not noted, removal, leaving, a closed login, a closed business; the Owner's
   view and unseen count, Office's, an Engineer's; the record closed to the app and
   to anyone signed out; what's owed (trial, subscribed, Stripe changed by hand,
   comped, an old change); one run claiming, a failed email owed again; the nudge.
   Sixteen broken copies each caught. The isolation file whole: 153 PASS /
   7 photo INCONCLUSIVE / 0 FAIL. Stripe itself, Resend and a real phone: Peter's
   checklist. */

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
const UID = '11111111-1111-1111-1111-111111111111';
const AUTH = 'patgo:cloudAuth:test';
const OWN  = 'aaaaaaaa-0000-4000-8000-000000000001';
const TEAM = 'aaaaaaaa-0000-4000-8000-000000000002';
const JO   = '22222222-2222-4222-8222-222222222222';
const iso = (ms) => new Date(ms).toISOString();
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });

function storedSession() {
  const life = 3600;
  return JSON.stringify({
    access_token: 'ZZACCESS169', token_type: 'bearer', expires_in: life,
    expires_at: Math.floor(Date.now() / 1000) + life, refresh_token: 'ZZREFRESH',
    user: { id: UID, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' },
  });
}

// A change as business_seats gives it.
const ch = (o) => Object.assign({ id: 1, at: iso(Date.now() - DAY), person: 'Jo', role_from: null, role_to: 'engineer',
  by_name: 'Sam', by_you: false, self: false, seats_after: 1 }, o);
const seatRow = (o) => Object.assign({ business_id: OWN, seats: 2, plan: 'active', every: 'month', billed: true,
  period_end: iso(Date.now() + 20 * DAY), is_owner: true, changes: [], unseen: 0 }, o);

function fakeServer() {
  const calls = [];
  const srv = { calls,
    biz: [{ id: OWN, name: 'Birchley Testing', role: 'owner', is_default: true, members: 3 }],
    seats: [seatRow()],
    billing: { plan: 'active', trial_ends_at: null, lapsed_at: null, status: 'active', interval: 'month',
      period_end: iso(Date.now() + 20 * DAY), cancel_at_period_end: false, has_customer: true, has_subscription: true,
      role: 'owner', can_manage: true },
    switchResp: { status: 200, body: { ok: true, every: 'year' } },
  };
  srv.fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    let body = null;
    if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    calls.push({ url: u, method, body });
    if (u.endsWith('/rest/v1/rpc/my_businesses')) return json(srv.biz);
    if (u.endsWith('/rest/v1/rpc/my_business_plans')) return json(srv.biz.map(b => ({ id: b.id, plan: 'active', trial_ends_at: null, lapsed_at: null })));
    if (u.endsWith('/rest/v1/rpc/business_seats')) return srv.oldSql ? json({ code: 'PGRST202', message: 'not found' }, 404) : json(srv.seats);
    if (u.endsWith('/rest/v1/rpc/my_billing')) return json(Object.assign({ cover: { plan: 'active' } }, srv.billing));
    if (u.includes('/functions/v1/billing-switch')) return json(srv.switchResp.body, srv.switchResp.status);
    if (u.includes('/functions/v1/')) return json({ done: 0 });
    if (u.includes('/rest/v1/rpc/')) return json('ok');
    if (u.includes('/rest/v1/profiles')) return json([{ plan: 'active' }]);
    if (u.includes('/rest/v1/')) return method === 'GET' ? json([]) : new Response(null, { status: 201 });
    if (u.includes('/storage/v1/')) return json([]);
    return json({ message: 'unexpected ' + u }, 404);
  };
  srv.fn = (name) => calls.filter(c => c.url.includes('/functions/v1/' + name));
  srv.rpc = (name) => calls.filter(c => c.url.endsWith('/rest/v1/rpc/' + name));
  return srv;
}

async function until(cond, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await tick(10);
  return cond();
}

// Signed in with the real library; the sheets captured (their options kept).
async function signedIn(o = {}) {
  const app = bootApp({ localStorage: { [AUTH]: storedSession(), 'pat:cloudUnlocked': '1' }, navigator: { onLine: false } });
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
  app.toasts = [];
  sb.showToast = (m) => app.toasts.push(String(m));
  app.sheets = [];
  for (const k of ['openChoiceSheet', 'openConfirmSheet', 'openNameSheet', 'openInfoSheet']) {
    sb[k] = (opts) => { app.sheets.push(Object.assign({ kind: k }, opts)); };
  }
  app.run('navigator.onLine = true');
  await tick(5);
  return app;
}

// The businesses and the seats as read (no cloud round trip needed).
function setBiz(app, list, seats) {
  app.sandbox.localStorage.setItem('pat:businesses', JSON.stringify({ u: UID, at: Date.now(), list: list || [
    { id: OWN, name: 'Birchley Testing', role: 'owner', def: true, n: 3 },
  ] }));
  app.fn('businessSeatsFromRows')(UID, seats || [seatRow()]);
}
function setTeam(app, people) {
  app.fn('businessTeamFromRows')(UID, people || [
    { business_id: OWN, user_id: UID, name: 'Peter', role: 'owner', is_you: true, email: 'p@x.co' },
    { business_id: OWN, user_id: JO, name: 'Jo', role: 'engineer', is_you: false, email: 'jo@x.co' },
  ], []);
}

let _B = null;
async function server() {
  if (!_B) _B = await import(path.join(APP_DIR, 'supabase/functions/_shared/billing.js'));
  return _B;
}
const ENV = {
  SUPABASE_URL: 'https://zz.supabase.co',
  SUPABASE_SECRET_KEYS: '{"default":"sb_secret_ZZ"}',
  SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_ZZ"}',
  STRIPE_SECRET_KEY: 'sk_test_ZZ', STRIPE_PRICE_MONTH: 'price_month', STRIPE_PRICE_YEAR: 'price_year',
  STRIPE_PRICE_SEAT_MONTH: 'price_seat_month', STRIPE_PRICE_SEAT_YEAR: 'price_seat_year',
  STRIPE_WEBHOOK_SECRET: 'whsec_ZZ', RESEND_API_KEY: 're_ZZ',
};
const item = (id, price, quantity, interval) => ({ id, price: { id: price, recurring: { interval } }, quantity, current_period_end: 1800000000 });
const subOf = (o = {}) => Object.assign({ id: 'sub_1', status: 'active', customer: 'cus_1', metadata: { org_id: 'org1' },
  items: { data: [item('si_base', 'price_month', 1, 'month')] } }, o);
const due = (o = {}) => Object.assign({ org_id: 'org1', name: 'Birchley Testing', plan: 'active', status: 'active', every: 'month',
  period_end: iso(Date.now() + 20 * DAY), subscription: 'sub_1', billable: true, seats: 1, seats_billed: 0,
  owner_email: 'owner@x.co', owner_name: 'Peter Birchley', owner_id: 'u-owner',
  changes: [{ id: 7, at: iso(Date.now()), user_id: 'u-jo', person: 'Jo', role_from: null, role_to: 'engineer', by_user: 'u-sam', by_name: 'Sam', seats_after: 1 }] }, o);

// A pretend Stripe, database and Resend for the seat and switch functions.
function deps(o = {}) {
  const calls = [];
  const env = Object.assign({}, ENV, o.env || {});
  let sub = o.sub || subOf();
  const fetch = async (url, init = {}) => {
    const body = init.body;
    calls.push({ url, method: init.method || 'GET', body, headers: init.headers || {} });
    if (url.endsWith('/auth/v1/user')) return (init.headers.authorization === 'Bearer good') ? json({ id: 'u1', email: 'p@x.co' }) : json({}, 401);
    if (url.endsWith('/rpc/billing_seats_due')) return json(o.due || [due()]);
    if (url.endsWith('/rpc/billing_seats_told')) return json(o.claim !== undefined ? o.claim : JSON.parse(body).ids);
    if (url.endsWith('/rpc/billing_seats_result')) return new Response(null, { status: 204 });
    if (url.endsWith('/rpc/billing_seats_record')) return new Response(null, { status: 204 });
    if (url.endsWith('/rpc/billing_context')) return json(Object.assign({ org_id: 'org1', role: 'owner', plan: 'active',
      stripe_customer: 'cus_1', stripe_subscription: 'sub_1', status: 'active', every: 'month', cancelling: false, seats: 1 }, o.ctx || {}));
    if (url.endsWith('/rpc/billing_apply')) return json('plan active');
    if (url.startsWith('https://api.resend.com/')) return o.resendDown ? json({ message: 'no' }, 500) : json({ id: 'em_1' });
    if (o.stripeDown && url.includes('api.stripe.com')) return json({ error: { message: 'down' } }, 500);
    if (url.includes('/v1/subscription_items')) return json({ id: 'si_seat' });
    if (url.includes('/v1/subscriptions/') && (init.method || 'GET') === 'POST') {
      sub = Object.assign({}, sub, { items: { data: sub.items.data.map(it => Object.assign({}, it, { price: { id: 'price_year', recurring: { interval: 'year' } } })) } });
      return json(sub);
    }
    if (url.includes('/v1/subscriptions/')) return json(sub);
    return json({ error: { message: 'unexpected ' + url } }, 500);
  };
  return { calls, env: (k) => env[k], fetch, now: () => Date.now() };
}
const form = (s) => Object.fromEntries(String(s || '').split('&').filter(Boolean).map(p => p.split('=').map(decodeURIComponent)));
const req = (body, o = {}) => new Request('https://zz.supabase.co/functions/v1/f', {
  method: o.method || 'POST',
  headers: { authorization: o.auth || 'Bearer good', origin: 'https://exnno.github.io', 'content-type': 'application/json' },
  body: o.method === 'OPTIONS' ? undefined : JSON.stringify(body || {}),
});

module.exports = async function () {
  /* ------------------------------------------------------------------ 109a */
  await t.group('109a — the phone’s figures: the Owner’s Paid seats; what a seat costs on the invite, a role change and Remove', async () => {
    const app = await signedIn();
    // The read: garbage dropped, the Owner's changes kept, an Engineer's none.
    const got = app.fn('businessSeatsFromRows')(UID, [
      seatRow({ changes: [ch({ id: 3 }), ch({ id: 2, role_to: 'boss' }), 'x'], unseen: 1 }),
      seatRow({ business_id: 'not-an-id' }),
      seatRow({ business_id: TEAM, is_owner: false, plan: 'gold', every: 'week', seats: -4, unseen: 9 }),
    ]);
    t.eq(got.list.length, 2, 'a row without a real business id is dropped');
    t.eq(got.list[0].changes.length, 1, 'a change naming a role PATGo hasn’t got is dropped');
    t.eq(got.list[1].plan, '', '…an unknown plan is “not known”');
    t.eq(got.list[1].every, '', '…an unknown interval too');
    t.eq(got.list[1].seats, 0, '…a count that isn’t one is 0');
    t.eq(got.list[1].unseen, 0, 'unseen is only ever the Owner’s');

    // The words.
    t.eq(app.fn('businessBillWords')(2, 'month'), '£6 + 2 × £3 = £12 a month', 'the plan: £6 + 2 × £3 = £12 a month');
    t.eq(app.fn('businessBillWords')(3, 'year'), '£60 + 3 × £30 = £150 a year', '…yearly');
    t.eq(app.fn('businessBillWords')(0, 'month'), '£6 a month', '…no seats: the base');
    const w = app.fn('businessSeatChangeWords');
    t.eq(w({ person: 'Jo', from: null, to: 'engineer', by: 'Sam' }), 'Sam added Jo as Engineer (+1 paid seat)', 'added by someone');
    t.eq(w({ person: 'Jo', from: null, to: 'engineer', by: 'Jo', self: true }), 'Jo joined as Engineer (+1 paid seat)', 'joined (their own invite accepted)');
    t.eq(w({ person: 'Jo', from: 'office', to: 'team_leader', byYou: true }), 'You made Jo Team leader (+1 paid seat)', 'made a paid role by you');
    t.eq(w({ person: 'Jo', from: 'engineer', to: 'office', by: 'Sam' }), 'Sam made Jo Office — Office is free (−1 paid seat)', 'made Office');
    t.eq(w({ person: 'Jo', from: 'engineer', to: null, by: 'Sam' }), 'Sam removed Jo (−1 paid seat)', 'removed');
    t.eq(w({ person: 'Jo', from: 'engineer', to: null, self: true, by: 'Jo' }), 'Jo left (−1 paid seat)', 'left');
    t.eq(w({ person: 'Jo', from: 'engineer', to: null }), 'Jo’s account was closed (−1 paid seat)', 'a closed login');

    // The Business page: the Owner's block.
    setBiz(app, null, [seatRow({ seats: 2, changes: [ch({ id: 5, by_you: true, person: 'Kim', role_to: 'team_leader' }), ch({ id: 4 })] })]);
    setTeam(app);
    app.state().view = 'cloudBusiness';
    app.fn('render')();
    let h = html(app);
    t.includes(h, 'Paid seats: 2 — Engineers and Team leaders at £3 a month each. You and Office are free.', 'the count, what each costs, who is free (3A)');
    t.includes(h, 'Your plan: £6 + 2 × £3 = £12 a month.', 'the total');
    t.includes(h, 'You added Kim as Team leader (+1 paid seat)', 'the changes, newest first');
    t.ok(h.indexOf('You added Kim') < h.indexOf('Sam added Jo'), '…in order');
    t.includes(h, 'Each change is emailed to you too.', 'the email said (4B)');
    setBiz(app, null, [seatRow({ seats: 1, plan: 'trial', billed: false, every: null })]);
    app.fn('render')();
    t.includes(html(app), 'Seats are free in your trial. When you subscribe: £6 + 1 × £3 = £9 a month (or £60 + 1 × £30 = £90 a year).', 'the trial: free now, what it will be (4A)');
    setBiz(app, null, [seatRow({ plan: 'comped', billed: false })]);
    app.fn('render')();
    t.includes(html(app), 'Free — seats included.', 'comped: free');
    setBiz(app, null, [seatRow({ every: 'year', seats: 3 })]);
    app.fn('render')();
    t.includes(html(app), 'Your plan: £60 + 3 × £30 = £150 a year.', 'yearly');
    // Not the Owner: no block.
    setBiz(app, [{ id: OWN, name: 'Birchley Testing', role: 'team_leader', def: true, n: 3 }], [seatRow({ is_owner: false, changes: [] })]);
    app.fn('render')();
    t.excludes(html(app), 'Paid seats:', 'a Team leader sees no count or total (the Owner’s)');

    // 3A: inviting says what a seat costs — the role choice and the name sheet.
    setBiz(app, null, [seatRow({ every: 'month' })]);
    app.sheets = [];
    app.fn('businessInviteStart')(OWN);
    const labels = app.sheets[0].choices.map(c => c.label);
    t.eq(labels[0], 'Engineer — logs their own jobs · +£3 a month', 'Engineer: +£3 a month');
    t.eq(labels[1], 'Team leader — logs jobs and sees the whole team’s · +£3 a month', 'Team leader: +£3 a month');
    t.eq(labels[2], 'Office — sees the whole team’s jobs, doesn’t log · free', 'Office: free');
    app.sheets[0].choices[0].onPick();
    t.includes(app.sheets[1].blurb, 'When they accept, a £3 a month seat is added to your plan straight away', 'the name sheet says it, from joining (2A; V169.1 words — 110a)');
    app.sheets = [];
    app.fn('businessInviteStart')(OWN);
    app.sheets[0].choices[2].onPick();
    t.notOk(/paid seat/.test(app.sheets[1].blurb), 'Office: no seat line');
    setBiz(app, null, [seatRow({ every: 'year' })]);
    app.sheets = [];
    app.fn('businessInviteStart')(OWN);
    t.eq(app.sheets[0].choices[0].label, 'Engineer — logs their own jobs · +£30 a year', 'yearly: +£30 a year');
    setBiz(app, null, [seatRow({ plan: 'trial', billed: false, every: null })]);
    app.sheets = [];
    app.fn('businessInviteStart')(OWN);
    t.eq(app.sheets[0].choices[0].label, 'Engineer — logs their own jobs · free in the trial, then £3 a month', 'the trial: free, then £3 a month (4A)');
    setBiz(app, null, [seatRow({ plan: 'comped', billed: false })]);
    app.sheets = [];
    app.fn('businessInviteStart')(OWN);
    t.eq(app.sheets[0].choices[0].label, 'Engineer — logs their own jobs', 'comped: nothing said');
    setBiz(app, null, []);
    app.sheets = [];
    app.fn('businessInviteStart')(OWN);
    t.eq(app.sheets[0].choices[0].label, 'Engineer — logs their own jobs · +£3 a month', 'not read (an older project, no signal): the usual price');
    // A Team leader inviting (Engineer only) — straight to the name sheet, with the cost.
    setBiz(app, [{ id: OWN, name: 'Birchley Testing', role: 'team_leader', def: true, n: 3 }], [seatRow({ is_owner: false })]);
    app.sheets = [];
    app.fn('businessInviteStart')(OWN);
    t.eq(app.sheets[0].kind, 'openNameSheet', 'a Team leader: Engineer only, the name sheet');
    t.includes(app.sheets[0].blurb, 'When they accept, a £3 a month seat is added to Birchley Testing’s plan straight away', '…saying what the seat costs (3A — anyone allowed to invite)');

    // A role change (2A) and Remove (1A).
    setBiz(app, null, [seatRow({ every: 'month' })]);
    setTeam(app, [
      { business_id: OWN, user_id: UID, name: 'Peter', role: 'owner', is_you: true },
      { business_id: OWN, user_id: JO, name: 'Jo', role: 'office', is_you: false },
    ]);
    app.sheets = [];
    app.fn('businessRoleStart')(OWN + ':' + JO);
    t.deepEq(app.sheets[0].choices.map(c => c.label), [
      'Engineer — logs their own jobs · +£3 a month',
      'Team leader — logs jobs and sees the whole team’s · +£3 a month',
    ], 'Office → a paid role: +£3 a month');
    setTeam(app);
    app.sheets = [];
    app.fn('businessRoleStart')(OWN + ':' + JO);
    t.deepEq(app.sheets[0].choices.map(c => c.label), [
      'Team leader — logs jobs and sees the whole team’s',
      'Office — sees the whole team’s jobs, doesn’t log · frees a seat (−£3 a month)',
    ], 'Engineer → Team leader: same price, nothing said; → Office: frees a seat');
    app.sheets = [];
    app.fn('businessRemoveStart')(OWN + ':' + JO);
    await until(() => app.sheets.length > 0);
    t.includes(app.sheets[0].message, 'It frees a paid seat (−£3 a month); the unused part is credited to your next bill.', 'Remove: frees a seat, the unused part credited (1A)');
    setBiz(app, null, [seatRow({ plan: 'trial', billed: false })]);
    app.sheets = [];
    app.fn('businessRemoveStart')(OWN + ':' + JO);
    await until(() => app.sheets.length > 0);
    t.includes(app.sheets[0].message, 'It frees a paid seat. ', '…in the trial: no money said');
  });

  /* ------------------------------------------------------------------ 109b */
  await t.group('109b — 4B on the phone: someone else’s change on the Jobs list until Got it; the nudge after a seat step (the real library)', async () => {
    const app = await signedIn();
    setBiz(app, null, [seatRow({ seats: 2, unseen: 1, changes: [ch({ id: 9, by_you: false })] })]);
    app.state().view = 'sessions';
    app.fn('render')();
    let h = html(app);
    t.includes(h, 'id="seat-banner"', 'a change someone else made: the Jobs line');
    t.includes(h, 'Birchley Testing: Sam added Jo as Engineer (+1 paid seat). Your plan is now £6 + 2 × £3 = £12 a month.', '…saying who, what and the plan now');
    t.includes(h, 'data-action="settings-page" data-arg="cloudBusiness">See</button>', '…See opens the Business page');
    t.includes(h, 'data-action="biz-seats-seen">Got it</button>', '…Got it');
    app.srv.calls.length = 0;
    app.fn('businessSeatsSeen')();
    t.excludes(html(app), 'id="seat-banner"', 'Got it: gone at once');
    t.ok(await until(() => app.srv.rpc('seats_seen').length === 1), '…and the cloud told (seats_seen)');
    t.deepEq(app.srv.rpc('seats_seen')[0].body, { o: OWN }, '…for that business');
    // Several changes: counted; your own: never; an Engineer's business: never.
    setBiz(app, null, [seatRow({ unseen: 2, changes: [ch({ id: 3 }), ch({ id: 2, person: 'Kim' }), ch({ id: 1, by_you: true })] })]);
    app.fn('render')();
    t.includes(html(app), 'Birchley Testing: 2 changes to paid seats. The Business page has them.', 'two changes: counted');
    setBiz(app, null, [seatRow({ unseen: 0, changes: [ch({ id: 3, by_you: true })] })]);
    app.fn('render')();
    t.excludes(html(app), 'id="seat-banner"', 'your own change: no line (you know)');
    // Your own newest change never stands in for someone else's (the count is of theirs).
    setBiz(app, null, [seatRow({ unseen: 1, changes: [ch({ id: 5, by_you: true, person: 'Kim', role_to: 'team_leader' }), ch({ id: 4 })] })]);
    app.fn('render')();
    t.includes(html(app), 'Birchley Testing: Sam added Jo as Engineer (+1 paid seat).', 'your own change skipped: theirs is the one said');
    // Only the unseen ones: one unseen of two others' → the one, not "2 changes".
    setBiz(app, null, [seatRow({ unseen: 1, changes: [ch({ id: 5, person: 'Kim' }), ch({ id: 4 })] })]);
    app.fn('render')();
    t.includes(html(app), 'Birchley Testing: Sam added Kim as Engineer (+1 paid seat).', 'only the unseen change — an older, seen one isn’t counted');
    setBiz(app, null, [seatRow({ is_owner: false, unseen: 4, changes: [ch()] })]);
    app.fn('render')();
    t.excludes(html(app), 'id="seat-banner"', 'not the Owner: no line');
    setBiz(app, null, [seatRow({ plan: 'trial', billed: false, unseen: 1, changes: [ch()] })]);
    app.fn('render')();
    t.includes(html(app), 'Seats are free until you subscribe.', 'the trial: no money said');
    t.includes(read('render-core.js'), "      ${leftBanner}\n      ${seatBanner}\n      ${tabs}", 'the line sits with the other business lines on the Jobs list');

    // The nudge — the real library's functions.invoke after each seat step.
    setBiz(app);
    setTeam(app);
    const call = app.fn('_bizCall');
    for (const [name, args] of [['accept_invite', { i: JO, make_main: false }], ['set_member_role', { o: OWN, u: JO, r: 'office' }],
                                ['remove_member', { o: OWN, u: JO, deliver: true }], ['leave_business', { o: OWN }]]) {
      app.srv.calls.length = 0;
      await call(name, args);
      t.ok(await until(() => app.srv.fn('billing-seats').length === 1), `${name}: billing-seats asked straight after`);
      t.eq(app.srv.fn('billing-seats')[0].method, 'POST', '…a POST');
    }
    app.srv.calls.length = 0;
    await call('invite_member', { o: OWN, e: 'x@y.co', n: 'X', r: 'engineer' });
    await tick(30);
    t.eq(app.srv.fn('billing-seats').length, 0, 'an invite (no seat until they join): not asked');
    // A refused step: never.
    const real = app.srv.fetchImpl;
    app.sandbox.fetch = async (u, i) => String(u).endsWith('/rpc/remove_member') ? json({ message: 'patgo_not_allowed' }, 400) : real(u, i);
    app.srv.calls.length = 0;
    await call('remove_member', { o: OWN, u: JO, deliver: true });
    await tick(30);
    t.eq(app.srv.fn('billing-seats').length, 0, 'a refused step: not asked');
    app.sandbox.fetch = real;
    // The function failing never stops anything (fire and forget).
    app.sandbox.fetch = async (u, i) => String(u).includes('/functions/v1/') ? Promise.reject(new Error('no signal')) : real(u, i);
    t.notEq(await call('accept_invite', { i: JO, make_main: false }), null, 'billing-seats unreachable: the step still succeeds');
    app.sandbox.fetch = real;
    // The read: with the businesses; an older project's missing function leaves none.
    app.srv.calls.length = 0;
    const c = await app.run('cloudClient()');
    await app.fn('businessRead')(c, UID);
    t.eq(app.srv.rpc('business_seats').length, 1, 'business_seats read with the businesses');
    app.srv.oldSql = true;
    app.fn('businessSeatsFromRows')(UID, []);
    t.eq(await app.fn('businessSeatsRead')(c, UID), false, 'a project without the V169 SQL: no figures, nothing breaks');
  });

  /* ------------------------------------------------------------------ 109c */
  await t.group('109c — the Subscription page: the seats in the prices (4A); Switch to yearly / monthly (3A)', async () => {
    const app = await signedIn();
    setBiz(app, null, [seatRow({ seats: 2 })]);
    t.eq(app.fn('billingPriceWords')('month', 2), '£12 a month (£6 + 2 seats × £3)', 'monthly with seats');
    t.eq(app.fn('billingPriceWords')('year', 1), '£90 a year (£60 + 1 seat × £30)', 'yearly with one');
    t.eq(app.fn('billingPriceWords')('year', 0), '£60 a year', 'no seats: as before');
    await app.fn('billingRead')();
    t.ok(app.srv.rpc('business_seats').length >= 1, 'the page’s read takes the seats too');
    let v = app.fn('billingView')();
    t.eq(v.kind, 'subscribed', 'subscribed');
    t.eq(v.title, 'Monthly — £12 a month (£6 + 2 seats × £3)', 'the plan with its seats');
    t.deepEq(v.actions, ['toYear', 'manage'], 'monthly: Switch to yearly, then Manage billing');
    app.state().view = 'cloudSubscription';
    app.fn('render')();
    t.includes(html(app), 'data-action="billing-switch" ', 'the switch button is drawn');
    t.includes(html(app), 'Switch to yearly — two months free</button>', '…saying so');
    app.srv.billing.interval = 'year';
    await app.fn('billingRead')();
    t.deepEq(app.fn('billingView')().actions, ['toMonth', 'manage'], 'yearly: Switch to monthly');
    app.srv.billing.status = 'past_due';
    await app.fn('billingRead')();
    t.excludes(app.fn('billingView')().actions, 'toMonth', 'a failing payment: no switch (Update card first)');
    app.srv.billing.status = 'active'; app.srv.billing.cancel_at_period_end = true;
    await app.fn('billingRead')();
    t.excludes(app.fn('billingView')().actions, 'toMonth', 'set to end: no switch');
    app.srv.billing.cancel_at_period_end = false; app.srv.billing.interval = 'month';
    await app.fn('billingRead')();

    // The sheet.
    app.sheets = [];
    t.ok(app.fn('billingSwitchStart')(), 'Switch opens a sheet');
    let s = app.sheets[0];
    t.eq(s.title, 'Switch to yearly?', 'to yearly');
    t.includes(s.message, 'Your plan becomes £120 a year (£60 + 2 seats × £30), from today — two months free.', '…the new price with the seats');
    t.includes(s.message, 'Stripe takes the year now, less what’s left of this month, which is credited.', '…what is charged');
    app.srv.billing.interval = 'year';
    await app.fn('billingRead')();
    app.sheets = [];
    app.fn('billingSwitchStart')();
    t.includes(app.sheets[0].message, 'What’s left of your year is kept as credit and pays your monthly bills until it runs out', 'to monthly: the credit kept');
    app.srv.billing.status = 'trialing'; app.srv.billing.interval = 'month';
    await app.fn('billingRead')();
    app.sheets = [];
    app.fn('billingSwitchStart')();
    t.includes(app.sheets[0].message, 'Nothing is charged until your first payment on', 'in the trial: nothing charged now');
    // Confirm → billing-switch with the choice, then the plan read again.
    app.srv.calls.length = 0;
    await app.fn('billingSwitch')('year');
    const sw = app.srv.fn('billing-switch');
    t.eq(sw.length, 1, 'billing-switch called');
    t.deepEq(sw[0].body, { every: 'year' }, '…with the choice');
    t.ok(app.srv.rpc('my_billing').length >= 1, '…then the plan read again');
    t.eq(app.state().billing.message, 'Switched to yearly. Thank you!', '…and said');
    app.srv.switchResp = { status: 409, body: { error: 'Your plan is set to end. Turn it back on in Manage billing first, then switch.' } };
    app.srv.calls.length = 0;
    await app.fn('billingSwitch')('month');
    t.deepEq(app.srv.fn('billing-switch')[0].body, { every: 'month' }, 'to monthly: sent as month');
    t.eq(app.state().billing.message, 'Your plan is set to end. Turn it back on in Manage billing first, then switch.', 'a refusal: the server’s words');
    t.eq(app.state().billing.pending, '', '…and nothing left waiting');
    // Subscribe's choice carries the seats (4A: the count on the day).
    app.srv.billing = Object.assign(app.srv.billing, { plan: 'trial', status: null, has_subscription: false, trial_ends_at: iso(Date.now() + 10 * DAY) });
    await app.fn('billingRead')();
    app.sheets = [];
    app.fn('billingSubscribe')();
    t.deepEq(app.sheets[0].choices.map(c => c.label), ['£120 a year (£60 + 2 seats × £30) — two months free', '£12 a month (£6 + 2 seats × £3)'], 'Subscribe: the prices with the seats');
    t.includes(app.sheets[0].message, 'With your 2 paid seats (Engineers and Team leaders).', '…said');
    setBiz(app, null, [seatRow({ seats: 0 })]);
    app.sheets = [];
    app.fn('billingSubscribe')();
    t.deepEq(app.sheets[0].choices.map(c => c.label), ['£60 a year — two months free', '£6 a month'], 'no seats: as before');
  });

  /* ------------------------------------------------------------------ 109d */
  await t.group('109d — the server: seats to Stripe (1A 2A), the Owner emailed (4B), monthly ↔ yearly (3A)', async () => {
    const B = await server();
    const env = (k) => ENV[k];
    // seatProration — 1A / 2A.
    t.eq(B.seatProration('month', 'active'), 'create_prorations', 'monthly: the part-month on the next bill (1A)');
    t.eq(B.seatProration('year', 'active'), 'always_invoice', 'yearly: the part-year charged that day (2A)');
    t.eq(B.seatProration('year', 'trialing'), 'none', 'the trial: nothing owed yet');
    // seatPlan.
    t.deepEq(B.seatPlan(subOf(), 2, env), { act: 'add', price: 'price_seat_month', quantity: 2, every: 'month', proration: 'create_prorations' }, 'no seat line: added at the monthly seat price');
    t.eq(B.seatPlan(subOf(), 0, env).act, 'none', 'no seats wanted, none there: nothing');
    const withSeats = (q, price = 'price_seat_month', base = 'price_month', every = 'month') =>
      subOf({ items: { data: [item('si_base', base, 1, every), item('si_seat', price, q, every)] } });
    t.deepEq(B.seatPlan(withSeats(2), 3, env), { act: 'update', item: 'si_seat', quantity: 3, every: 'month', proration: 'create_prorations' }, 'more: the quantity changed');
    t.eq(B.seatPlan(withSeats(3), 3, env).act, 'none', 'in step: nothing');
    t.deepEq(B.seatPlan(withSeats(1), 0, env), { act: 'remove', item: 'si_seat', every: 'month', proration: 'create_prorations' }, 'none left: the line removed');
    t.deepEq(B.seatPlan(withSeats(2, 'price_seat_month', 'price_year', 'year'), 2, env),
      { act: 'update', item: 'si_seat', quantity: 2, every: 'year', proration: 'always_invoice', price: 'price_seat_year' }, 'the base yearly, the seats monthly: the seat price put right');
    t.eq(B.seatPlan(subOf(), 1, (k) => k.startsWith('STRIPE_PRICE_SEAT') ? '' : ENV[k]).act, 'unset', 'no seat price set: said, never guessed');
    // subscriptionFacts reads the BASE line, counts the seats.
    const f = B.subscriptionFacts(withSeats(4, 'price_seat_year', 'price_year', 'year'), B.seatPriceIds(env));
    t.eq(f.every, 'year', 'facts: the interval from the base line');
    t.eq(f.seats, 4, '…the seats from the seat line');
    const swapped = subOf({ items: { data: [item('si_seat', 'price_seat_month', 2, 'month'), item('si_base', 'price_year', 1, 'year')] } });
    t.eq(B.subscriptionFacts(swapped, B.seatPriceIds(env)).every, 'year', '…whichever order Stripe lists them');

    // The checkout's seat line (4A: the count on the day).
    const now = Math.floor(Date.now() / 1000);
    const ctx = { org_id: 'org1', plan: 'lapsed', stripe_customer: 'cus_1', seats: 3 };
    t.deepEq(B.checkoutParams(ctx, 'year', 'price_year', 'https://r/billing-done.html', now, 'price_seat_year').line_items,
      [{ price: 'price_year', quantity: 1 }, { price: 'price_seat_year', quantity: 3 }], 'checkout: the base and 3 seats');
    t.deepEq(B.checkoutParams(Object.assign({}, ctx, { seats: 0 }), 'year', 'price_year', 'https://r/billing-done.html', now, 'price_seat_year').line_items,
      [{ price: 'price_year', quantity: 1 }], '…no seats: the base alone');
    let d = deps({ ctx: { plan: 'trial', stripe_subscription: null, status: null, seats: 2 }, env: { STRIPE_PRICE_SEAT_MONTH: '' } });
    t.eq((await B.makeCheckout(d)(req({ every: 'month', returnTo: 'https://exnno.github.io/pat-test-app/billing-done.html' }))).status, 503, 'seats but no seat price set up: 503, never subscribed without them');

    // billing-seats end to end: a yearly business, Jo joined → Stripe + the email.
    d = deps({ sub: subOf({ items: { data: [item('si_base', 'price_year', 1, 'year')] } }) });
    let res = await B.makeSeats(d)(req({}));
    t.eq(res.status, 200, 'billing-seats: 200');
    const add = d.calls.find(c => c.url.endsWith('/v1/subscription_items'));
    t.ok(add, 'Stripe: the seat line added');
    t.deepEq(form(add.body), { subscription: 'sub_1', price: 'price_seat_year', quantity: '1', proration_behavior: 'always_invoice' }, '…yearly seat, charged that day (2A)');
    t.eq(add.headers['idempotency-key'], 'patgo-seats-org1-add-1-7', '…once (an idempotency key from the change)');
    t.deepEq(JSON.parse(d.calls.find(c => c.url.endsWith('/rpc/billing_seats_record')).body), { o: 'org1', cus: null, n: 1 }, 'the count Stripe now has recorded');
    const claim = d.calls.filter(c => c.url.endsWith('/rpc/billing_seats_told'));
    t.deepEq(JSON.parse(claim[0].body), { o: 'org1', ids: [7], outcome: 'sending' }, 'the change claimed before emailing (two runs never send two)');
    const mail = d.calls.find(c => c.url === 'https://api.resend.com/emails');
    t.ok(mail, 'the Owner emailed (4B)');
    const m = JSON.parse(mail.body);
    t.deepEq(m.to, ['owner@x.co'], '…to the business’s Owner');
    t.eq(m.from, 'PATGo <hello@mail.patgo.co.uk>', '…from hello@mail.patgo.co.uk (V169.1: Resend’s verified domain)');
    t.eq(mail.headers.authorization, 'Bearer re_ZZ', '…with the Resend key from the secrets');
    t.eq(m.subject, 'PATGo: paid seats changed in Birchley Testing', '…a plain subject');
    t.includes(m.text, 'Sam added Jo as Engineer (+1 paid seat)', '…who, what');
    t.includes(m.text, 'Your PATGo plan: £60 + 1 × £30 = £90 a year.', '…the plan now');
    t.includes(m.text, 'for a seat added, the rest of this year is charged today', '…how it’s charged (2A)');
    t.deepEq(JSON.parse(d.calls.find(c => c.url.endsWith('/rpc/billing_seats_result')).body), { o: 'org1', ids: [7], outcome: 'sent', retry: false }, '…and recorded as sent');
    // Monthly: the next bill.
    d = deps();
    await B.seatsRun(d);
    t.eq(form(d.calls.find(c => c.url.endsWith('/v1/subscription_items')).body).proration_behavior, 'create_prorations', 'monthly: the next bill (1A)');
    t.includes(JSON.parse(d.calls.find(c => c.url === 'https://api.resend.com/emails').body).text, 'You pay monthly: the part of this month', '…said so');
    // In step already (a second run): Stripe only read; nothing claimed twice.
    d = deps({ sub: withSeats(1), claim: [] });
    await B.seatsRun(d);
    t.notOk(d.calls.some(c => c.url.includes('/v1/subscription_items')), 'in step: Stripe not changed');
    t.notOk(d.calls.some(c => c.url.startsWith('https://api.resend.com/')), 'claimed by another run: no second email');
    // The trial (not subscribed): nothing on a bill — told "no bill", no email, Stripe untouched.
    d = deps({ due: [due({ billable: false, subscription: null, plan: 'trial', status: null })] });
    await B.seatsRun(d);
    t.notOk(d.calls.some(c => c.url.includes('api.stripe.com')), 'the trial: Stripe untouched (4A)');
    t.notOk(d.calls.some(c => c.url.startsWith('https://api.resend.com/')), '…no email');
    t.deepEq(JSON.parse(d.calls.find(c => c.url.endsWith('/rpc/billing_seats_told')).body), { o: 'org1', ids: [7], outcome: 'no bill' }, '…told: no bill');
    // No email key yet: left to try again.
    d = deps({ env: { RESEND_API_KEY: '' } });
    await B.seatsRun(d);
    t.deepEq(JSON.parse(d.calls.find(c => c.url.endsWith('/rpc/billing_seats_result')).body), { o: 'org1', ids: [7], outcome: 'no email key', retry: true }, 'no email key: owed again (sent once it’s set)');
    d = deps({ resendDown: true });
    await B.seatsRun(d);
    t.eq(JSON.parse(d.calls.find(c => c.url.endsWith('/rpc/billing_seats_result')).body).retry, true, 'Resend refusing: owed again');
    d = deps({ due: [due({ owner_email: null })] });
    await B.seatsRun(d);
    t.deepEq(JSON.parse(d.calls.find(c => c.url.endsWith('/rpc/billing_seats_result')).body), { o: 'org1', ids: [7], outcome: 'no address', retry: false }, 'no Owner address: recorded, not tried for ever');
    // Stripe failing: nothing recorded, nothing emailed — the next run tries again.
    const quiet = console.error; console.error = () => {};
    try {
      d = deps({ stripeDown: true });
      const out = await B.seatsRun(d);
      t.eq(out[0].error, 'try again', 'Stripe failing: that business waits');
      t.notOk(d.calls.some(c => c.url.endsWith('/rpc/billing_seats_record')), '…its count not recorded');
      t.notOk(d.calls.some(c => c.url.startsWith('https://api.resend.com/')), '…and nobody emailed about a bill that didn’t change');
      // One failing never stops the next.
      d = deps({ due: [due({ org_id: 'orgX', subscription: 'sub_bad' }), due({ org_id: 'org2' })] });
      const f2 = d.fetch;
      d.fetch = async (u, i) => String(u).includes('/v1/subscriptions/sub_bad') ? json({ error: { message: 'no such' } }, 404) : f2(u, i);
      const two = await B.seatsRun(d);
      t.eq(two[1].email, 'sent', 'one business failing never stops the next');
    } finally { console.error = quiet; }
    // Anyone may call it — it takes no orders.
    d = deps();
    await B.makeSeats(d)(req({ seats: 99, org: 'other' }, { auth: 'Bearer bad' }));
    t.eq(form(d.calls.find(c => c.url.endsWith('/v1/subscription_items')).body).quantity, '1', 'billing-seats takes no orders: the DATABASE’s count, whoever calls');
    t.eq((await B.makeSeats(deps())(req(null, { method: 'OPTIONS' }))).status, 200, 'the app’s pre-check answered');

    // The webhook records Stripe's count.
    t.includes(read('supabase/functions/_shared/billing.js'), "await rpc(deps, 'billing_seats_record', { o: org, cus, n: LIVE.includes(f.status) ? f.seats : null });", 'the webhook records Stripe’s seat count (a change on Stripe’s own site is put back)');

    // The email's words.
    const e = B.seatEmail(due({ seats: 0, changes: [{ id: 1, at: iso(Date.now()), user_id: 'u', by_user: 'u', person: 'Kim', role_from: 'team_leader', role_to: null }] }), 'month', 'active');
    t.includes(e.text, 'Kim left (−1 paid seat)', 'email: left');
    t.includes(e.text, 'Your PATGo plan: £6 a month (no paid seats).', '…none left');
    t.includes(B.seatEmail(due(), 'month', 'trialing').text, 'You’re in your free trial: your first payment on', 'email in a subscribed trial: the first payment counts the seats');
    t.includes(e.text, 'Hello Peter,', '…to the Owner by first name');

    // billing-switch (3A).
    t.eq(B.switchRefusal({ org_id: 'o', role: 'engineer' }, 'year').status, 403, 'switch: the Owner only');
    t.eq(B.switchRefusal({ org_id: 'o', role: 'owner', plan: 'comped' }, 'year').status, 409, '…not comped');
    t.eq(B.switchRefusal({ org_id: 'o', role: 'owner', plan: 'trial', stripe_subscription: null }, 'year').status, 409, '…not without a plan');
    t.eq(B.switchRefusal({ org_id: 'o', role: 'owner', plan: 'active', stripe_subscription: 's', status: 'active', cancelling: true }, 'year').status, 409, '…not set to end');
    t.eq(B.switchRefusal({ org_id: 'o', role: 'owner', plan: 'active', stripe_subscription: 's', status: 'active', every: 'year' }, 'year').status, 409, '…not to what it is');
    t.eq(B.switchRefusal({ org_id: 'o', role: 'owner', plan: 'active', stripe_subscription: 's', status: 'active', every: 'month' }, 'year'), null, 'monthly → yearly: yes');
    const p = B.switchParams(withSeats(2), 'year', env);
    t.deepEq(p.items, [{ id: 'si_base', price: 'price_year' }, { id: 'si_seat', price: 'price_seat_year' }], 'both lines moved together');
    t.eq(p.proration_behavior, 'always_invoice', '…at once, the unused time credited');
    t.eq(B.switchParams(Object.assign(withSeats(2), { status: 'trialing' }), 'year', env).proration_behavior, 'none', '…in the trial: nothing charged');
    d = deps({ sub: withSeats(2) });
    res = await B.makeSwitch(d)(req({ every: 'year' }));
    t.eq(res.status, 200, 'billing-switch: 200');
    t.deepEq(await res.json(), { ok: true, every: 'year' }, '…yearly now');
    const up = form(d.calls.find(c => c.method === 'POST' && c.url.endsWith('/v1/subscriptions/sub_1')).body);
    t.eq(up['items[0][price]'], 'price_year', '…Stripe: the base yearly');
    t.eq(up['items[1][price]'], 'price_seat_year', '…the seats yearly');
    t.ok(d.calls.some(c => c.url.endsWith('/rpc/billing_apply')), '…the plan recorded at once (the webhook says the same later)');
    t.eq((await B.makeSwitch(deps())(req({ every: 'year' }, { auth: 'Bearer bad' }))).status, 401, 'not signed in: 401');
    t.eq((await B.makeSwitch(deps({ ctx: { role: 'office' } }))(req({ every: 'year' }))).status, 403, 'not the Owner: 403');
    t.eq((await B.makeSwitch(deps())(req({ every: 'week' }))).status, 400, 'an unknown choice: 400');
    t.eq((await B.makeSwitch(deps({ env: { STRIPE_PRICE_SEAT_YEAR: '' } }))(req({ every: 'year' }))).status, 503, 'no seat price set up: 503, nothing changed');

    // The entry files and the secrets.
    for (const [fn, maker] of [['billing-seats', 'makeSeats'], ['billing-switch', 'makeSwitch']]) {
      const src = read(`supabase/functions/${fn}/index.js`);
      t.includes(src, `import { ${maker}, denoDeps } from '../_shared/billing.js';`, `${fn}: the shared code`);
      t.includes(src, `Deno.serve(${maker}(denoDeps()));`, `${fn}: served`);
    }
    const shared = read('supabase/functions/_shared/billing.js');
    t.notOk(/^import /m.test(shared), 'the shared file still imports nothing');
    t.notOk(/re_[A-Za-z0-9]{12,}|sk_(test|live)_[A-Za-z0-9]{6,}/.test(shared), 'no key written in it');
    t.includes(shared, 'export const PENCE = { base: { month: 600, year: 6000 }, seat: { month: 300, year: 3000 } };', 'the server’s prices…');
    t.includes(read('config.js'), 'const PLAN_PENCE = { base: { month: 600, year: 6000 }, seat: { month: 300, year: 3000 } };', '…match the app’s (R65 7C)');
  });

  /* ------------------------------------------------------------------ 109e */
  await t.group('109e — the SQL: schema.sql in step; the record, the server’s side, the app’s reads, the nudge; E1–E7; isolation 34a–34c', () => {
    const mig = read('supabase/v169-seats.sql');
    const end = '-- ================================================================ end V169\n';
    const block = mig.slice(mig.indexOf('-- ================================================================ V169\n'), mig.indexOf(end) + end.length);
    t.ok(block.length > 6000, 'the migration has its definitions');
    t.includes(read('supabase/schema.sql'), block.trimEnd(), 'a new project gets them byte for byte (V170: no longer the last section — 111e)');
    t.includes(block, "select coalesce(r in ('engineer','team_leader'), false)", 'a paid seat: Engineer or Team leader');
    t.includes(block, 'create trigger seat_note after insert or update of role or delete on public.memberships', 'every membership change looked at — no route can miss one');
    t.includes(block, 'if public.paid_role(rf) = public.paid_role(rt) then return null; end if;', '…only a change in paid-ness written');
    t.includes(block, 'revoke all on public.seat_changes from anon, authenticated;', 'the record closed to the app');
    t.includes(block, "select o.plan <> 'comped' and o.stripe_subscription is not null", 'billed only on a live, not-comped subscription');
    t.includes(block, "and c.at > now() - interval '7 days'", 'an untold change over a week old is past news');
    t.includes(block, '  where org_id = o and id = any(ids) and emailed_at is null\n  returning id', 'a run claims its changes (no second email)');
    t.includes(block, "if coalesce(url, '') !~ '^https://[^/]+/functions/v1/billing-seats$' then return 'no address'; end if;", 'the nudge only ever calls the seats function');
    t.includes(block, "select cron.schedule('patgo-seats', '*/10 * * * *', 'select public.seats_nudge()');", 'every 10 minutes');
    t.includes(block, "where m.user_id = auth.uid() and m.role in ('owner','team_leader','office')", 'the figures for those who may invite (an Engineer: none)');
    t.includes(block, "case when m.role = 'owner' then coalesce((", '…the changes for the Owner only');
    t.includes(block, "and c.by_user is distinct from auth.uid()", '…unseen = someone else’s');
    t.includes(block, "if auth.uid() is null or public.my_role(o) is distinct from 'owner' then raise exception 'patgo_not_allowed'; end if;", 'Got it: the Owner only');
    t.includes(block, "grant execute on function public.business_seats(), public.seats_seen(uuid) to authenticated;", 'the app’s two reads granted');
    t.includes(block, "    'seats', public.paid_seats(o.id))", 'billing_context carries the seats (the checkout’s count)');
    for (let n = 1; n <= 7; n++) t.ok(new RegExp('^select ' + n + ", '", 'm').test(mig), `self-check E${n}`);
    const iso2 = read('supabase/isolation-test.sql');
    for (const k of ['34a', '34b', '34c']) t.includes(iso2, `['${k}|`, `isolation ${k}`);
    t.includes(iso2, 'delete from public.seat_changes where id > max169;', '…the test’s seat lines removed (never emailed or billed)');
  });

  /* ------------------------------------------------------------------ 109f */
  await t.group('109f — V169’s About line; business.js / plan.js name V169 (V170: the release checks → 111f)', () => {
    const help = read('render-help.js');
    t.excludes(help, '<p><strong>V169</strong>', 'V169’s About line rolled off (V172)');
    t.includes(read('business.js'), '// V169 — seat billing (Teams v1; R65 7C; 14 Nov 1A–4A; 18 Nov R80 1A 2A 3A 4B 5A)', 'business.js names V169');
    t.includes(read('plan.js'), '// ---- V169 (3A): monthly ↔ yearly from inside PATGo', 'plan.js names V169');
  });
};

// V169.1: group 110 reuses these.
module.exports.helpers = { signedIn, setBiz, setTeam, seatRow, fakeServer, until, server, deps, due, ENV, OWN, UID, JO, json, DAY, iso };
