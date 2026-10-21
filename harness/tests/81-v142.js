/* Standing test — V142: paying — Subscribe, Manage billing, the plan on the business
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Stage 13, paying (Peter 21 Oct: pricing 1B £6 / £60,
   2 founders' deals by code or comped, 3A monthly + yearly, 4A 30-day trial no
   card, 5A Stripe-hosted pages, 6A no part refunds, 7A team pricing later, 8 no
   VAT; build 0A paying end to end now — enforcement next, 1A the app's own
   choice, yearly first, 2A the Subscription page always shows the plan and
   Renew now opens the same choice, 3A paying in the trial keeps the rest of it,
   4A a failed payment: Update card while Stripe retries, 5A monthly ↔ yearly on
   Stripe's page, 6A Stripe test mode first, 7A the server functions go on
   through the Supabase connection). Found at the build: Settings already had a
   Subscription page (a placeholder since v43) — the plan lives there; the
   Account page names the plan and links to it.

     81a  the Subscription page as drawn, for every state (no cloud, signed out,
          checking / no signal, trial, yearly / monthly, trialing, cancelled, a
          failed payment, comped, a team member, ended); the Account page's plan
          line + Subscription ›; the Settings row's word.
     81b  the REAL library: Subscribe → the choice, yearly first → the window
          opens INSIDE the tap → our server function with the person's sign-in
          and this copy's billing-done.html → the window goes to Stripe. Already
          subscribed → the billing page, same window. Refusals, a blocked window,
          no signal. Renew now = the same choice. Manage billing / Update card.
     81c  the way back: billing-done.html itself (only three results, our own
          origin, address wiped, closes); the app takes it once, from its own
          origin, only while waiting; "paid" re-reads until the database says
          paid — and the lock lifts; cancelled; back with the window closed.
     81d  the server functions (supabase/functions/_shared/billing.js, run here
          against a pretend Stripe and database): the signature check, who may
          pay, the payment page's settings (trial kept, codes, return address),
          the customer made once, the billing page, the webhook re-reading
          Stripe, both kinds of Supabase key, the entry files.
     81g  the SQL: the plan on the business, the copies, comped and trials kept,
          old subscriptions ignored, the Stripe side closed to the app;
          schema.sql carries every V142 line; isolation 18a–18f.
     81e  release: V142, cache, What's new (one line), About V142 / V141 /
          V140, the four taps wired, no Stripe script; plus 80e's lasting
          checks (80e retired).

   Whether the SQL WORKS is proved by its own checks (B1–B6) and isolation
   18a–18f, run in the Supabase SQL editor — at V142 also against a local
   Postgres 16 stand-in (an upgraded project and a new one from schema.sql),
   with eight broken copies each caught. How it LOOKS was checked in Chromium
   at 390×844 dark and 375×667 light (Playwright, not committed). Stripe's own
   pages, and the real round trip on an iPhone, are Peter's checklist. */

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
const DAY = 86400000;
const UID = '11111111-1111-1111-1111-111111111111';
const AUTH = 'patgo:cloudAuth:test';
const ORIGIN = 'https://exnno.github.io';
const RETURN = 'https://exnno.github.io/pat-test-app/billing-done.html';
const CHECKOUT_URL = 'https://checkout.stripe.com/c/pay/cs_test_ZZ1';
const PORTAL_URL = 'https://billing.stripe.com/p/session/test_ZZ1';
const iso = (ms) => new Date(ms).toISOString();
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });

function storedSession(email = 'peter@example.com') {
  const life = 3600;
  return JSON.stringify({
    access_token: 'ZZACCESS142', token_type: 'bearer', expires_in: life,
    expires_at: Math.floor(Date.now() / 1000) + life, refresh_token: 'ZZREFRESH',
    user: { id: UID, email, aud: 'authenticated', role: 'authenticated' },
  });
}
function info(o = {}) {
  return Object.assign({ plan: 'trial', trial_ends_at: iso(Date.now() + 20 * DAY), status: null, interval: null,
    period_end: null, cancel_at_period_end: false, has_customer: false, has_subscription: false,
    role: 'owner', can_manage: true }, o);
}

// A pretend Supabase with the billing functions. srv.billing is what my_billing
// answers; srv.checkout / srv.portal answer the two server functions.
function fakeServer() {
  const calls = [];
  const srv = { calls, billing: info() };
  srv.checkout = () => json({ url: CHECKOUT_URL });
  srv.portal = () => json({ url: PORTAL_URL });
  srv.fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    let body = null;
    if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    let auth = '';
    const h = init.headers || {};
    const entries = typeof h.forEach === 'function' ? (() => { const a = []; h.forEach((v, k) => a.push([k, v])); return a; })() : Object.entries(h);
    for (const [k, v] of entries) if (String(k).toLowerCase() === 'authorization') auth = String(v);
    calls.push({ url: u, method, body, auth });
    if (u.endsWith('/rest/v1/rpc/my_billing')) return json(srv.billing);
    if (u.endsWith('/functions/v1/billing-checkout')) return srv.checkout(body);
    if (u.endsWith('/functions/v1/billing-portal')) return srv.portal(body);
    if (u.includes('/rest/v1/profiles')) return json([{ plan: srv.billing.plan, trial_ends_at: srv.billing.trial_ends_at }]);
    if (u.includes('/rest/v1/')) return method === 'GET' ? json([]) : new Response(null, { status: 201 });
    if (u.includes('/storage/v1/')) return json([]);
    return json({ message: 'unexpected ' + u }, 404);
  };
  srv.fnCalls = (name) => calls.filter(c => c.url.endsWith('/functions/v1/' + name));
  return srv;
}

function installWindow(app, { blocked = false } = {}) {
  const opened = [];
  app.sandbox.open = (url, target) => {
    if (blocked) return null;
    const w = { url, target, closed: false, location: { href: url },
      openedWhile: app.run("state.billing ? state.billing.pending : ''"),
      document: { title: '', body: { innerHTML: '' } }, close() { this.closed = true; } };
    opened.push(w);
    return w;
  };
  return opened;
}

async function until(cond, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await tick(10);
  return cond();
}

async function signedIn(o = {}) {
  const ls = Object.assign({ [AUTH]: storedSession(), 'pat:cloudUnlocked': '1' }, o.localStorage || {});
  const app = bootApp({ localStorage: ls, navigator: { onLine: false } });
  app.fn('load')();
  app.state = () => app.refresh('state').state;
  const srv = o.srv || fakeServer();
  const sb = app.sandbox;
  for (const k of ['Headers', 'Request', 'Response', 'AbortController', 'TextEncoder',
                   'TextDecoder', 'URLSearchParams', 'URL', 'atob', 'btoa', 'Blob']) sb[k] = globalThis[k];
  if (!sb.crypto) sb.crypto = globalThis.crypto;
  sb.WebSocket = class {};
  sb.fetch = srv.fetchImpl;
  app.run(LIB);
  app.run('navigator.onLine = true');
  app.srv = srv;
  app.run('if (typeof _syncTimer !== "undefined" && _syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }');
  for (let k = 0; k < 100 && app.run("(state.cloud && state.cloud.status) || ''") !== 'signed-in'; k++) await tick(10);
  const st = app.state();
  st.welcomeSeen = true;
  st.migrationPrompt = { show: false, name: '', items: [] };
  closeSheets(app);
  app.opened = installWindow(app, o);
  return app;
}

const sheets = (app) => app.doc.body.children.filter(c => c && /bulk-sheet/.test(c.className || ''));
function closeSheets(app) {
  app.doc.body.children.slice().forEach(c => { if (c && /bulk-sheet|modal-backdrop/.test(c.className || '')) c.remove(); });
}
const act = (app, name, arg) => app.run(`ACTIONS[${JSON.stringify(name)}](${arg === undefined ? '' : JSON.stringify(arg)})`);
// The page drawn from a billing record set by hand (81a: no network).
function page(app, inf, extra = {}) {
  const st = app.state();
  st.billing = Object.assign({ uid: UID, info: inf, reading: false, readAt: Date.now(), error: '', message: '',
                               pending: '', confirming: false }, extra);
  st.view = 'cloudSubscription';
  app.fn('render')();
  return html(app);
}
// What billing-done.html sends, arriving the way the browser delivers it.
function handBack(app, result, origin = ORIGIN) {
  app.sandbox.dispatchEvent({ type: 'message', origin, data: { type: 'patgo-billing-return', result } });
}
// Run the REAL landing page's script in a window of its own.
function landing(search) {
  const pageSrc = read('billing-done.html');
  const src = pageSrc.slice(pageSrc.indexOf('<script>') + 8, pageSrc.indexOf('</script>'));
  const posted = [], channel = [], replaced = [], timers = [];
  const el = { textContent: '' };
  const win = {
    location: { search, origin: ORIGIN, pathname: '/pat-test-app/billing-done.html' },
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
  const said = el.textContent;
  timers.splice(0).forEach((fn) => fn());
  return { posted, channel, replaced, said, win };
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
  STRIPE_WEBHOOK_SECRET: 'whsec_ZZ',
};
// A pretend Stripe + database for the server functions.
function serverDeps(o = {}) {
  const calls = [];
  const env = Object.assign({}, ENV, o.env || {});
  const ctx = Object.assign({ org_id: 'org1', role: 'owner', plan: 'trial', trial_ends_at: iso(Date.now() + 20 * DAY),
    stripe_customer: null, stripe_subscription: null, status: null }, o.ctx || {});
  const sub = o.sub || { id: 'sub_1', status: 'active', customer: 'cus_1', metadata: { org_id: 'org1' },
    cancel_at_period_end: false, items: { data: [{ price: { recurring: { interval: 'year' } }, current_period_end: 1800000000 }] } };
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body, headers: init.headers || {} });
    if (url.endsWith('/auth/v1/user')) return (init.headers.authorization === 'Bearer good') ? json({ id: 'u1', email: 'p@example.com' }) : json({}, 401);
    if (url.endsWith('/rpc/billing_context')) return json(o.noCtx ? null : ctx);
    if (url.endsWith('/rpc/billing_set_customer')) return json(o.storedCustomer || 'cus_new');
    if (url.endsWith('/rpc/billing_apply')) return o.dbDown ? json({ message: 'down' }, 503) : json('plan active');
    if (url.endsWith('/rpc/billing_event_log')) return new Response(null, { status: 204 });
    if (url.endsWith('/v1/customers')) return json({ id: 'cus_new' });
    if (url.endsWith('/v1/checkout/sessions')) return json({ url: CHECKOUT_URL });
    if (url.endsWith('/v1/billing_portal/sessions')) return json({ url: PORTAL_URL });
    if (url.includes('/v1/subscriptions/')) return json(sub);
    return json({ error: { message: 'unexpected ' + url } }, 500);
  };
  return { calls, env: (k) => env[k], fetch, now: () => o.now || Date.now() };
}
const req = (body, o = {}) => new Request('https://zz.supabase.co/functions/v1/f', {
  method: o.method || 'POST',
  headers: Object.assign({ authorization: o.auth || 'Bearer good', origin: o.origin || ORIGIN, 'content-type': 'application/json' }, o.headers || {}),
  body: o.method === 'OPTIONS' ? undefined : JSON.stringify(body || {}),
});
const form = (s) => Object.fromEntries(String(s || '').split('&').filter(Boolean).map(p => p.split('=').map(decodeURIComponent)));
async function sign(payload, secret, t) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(t + '.' + payload)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
}

module.exports = async function () {
  /* ------------------------------------------------------------------ 81a */
  await t.group('81a — the Subscription page for every state; the Account line; the Settings row (2A)', async () => {
    const app = await signedIn();
    const end = Date.now() + 20 * DAY;
    const d = (ms) => app.fn('_planDate')(ms);
    let p = page(app, info({ trial_ends_at: iso(end) }));
    t.includes(p, 'id="cloud-subscription-page"', 'the real page');
    t.includes(p, '<h3 id="billing-title">Free trial</h3>', 'trial: says so');
    t.includes(p, `Your free trial ends on ${d(end)}. Subscribe now and you keep the rest of your free days.`, '…when it ends, and that paying now keeps the rest (3A)');
    t.includes(p, 'data-action="billing-subscribe"', '…Subscribe');
    t.excludes(p, 'data-action="billing-manage"', '…no Manage billing (nothing to manage)');
    t.includes(p, 'Payments are handled by Stripe — PATGo never sees your card details.', 'the Stripe note');
    t.ok(/<a href="https:\/\/www\.patgo\.co\.uk\/terms\.html#refunds" id="billing-terms" target="_blank" rel="noopener noreferrer">Cancelling and refunds<\/a>/.test(p), '…with the terms’ refunds section, in the browser');

    const pe = Date.now() + 300 * DAY;
    p = page(app, info({ plan: 'active', status: 'active', interval: 'year', period_end: iso(pe), has_customer: true, has_subscription: true }));
    t.includes(p, '<h3 id="billing-title">Yearly — £60 a year</h3>', 'yearly: the plan and its price');
    t.includes(p, `Renews on ${d(pe)}.`, '…when it renews');
    t.includes(p, 'data-action="billing-manage"', '…Manage billing');
    t.excludes(p, 'data-action="billing-subscribe"', '…no Subscribe');
    p = page(app, info({ plan: 'active', status: 'active', interval: 'month', period_end: iso(pe), has_customer: true, has_subscription: true }));
    t.includes(p, '<h3 id="billing-title">Monthly — £6 a month</h3>', 'monthly: the plan and its price');
    p = page(app, info({ plan: 'active', status: 'trialing', interval: 'year', period_end: iso(end), has_customer: true, has_subscription: true }));
    t.includes(p, `Free until ${d(end)}, when the first payment is taken.`, 'subscribed in the trial: free until it ends (3A)');
    p = page(app, info({ plan: 'active', status: 'active', interval: 'year', period_end: iso(pe), cancel_at_period_end: true, has_customer: true, has_subscription: true }));
    t.includes(p, `Cancelled — your plan runs until ${d(pe)}.`, 'cancelled: runs to the end of what was paid (6A)');
    t.includes(p, 'data-action="billing-manage"', '…Manage billing (to change their mind)');
    p = page(app, info({ plan: 'active', status: 'past_due', interval: 'year', period_end: iso(pe), has_customer: true, has_subscription: true }));
    t.includes(p, 'Your last payment didn’t go through.', 'a failed payment: says so (4A)');
    const card = p.indexOf('data-action="billing-card"'), man = p.indexOf('data-action="billing-manage"');
    t.ok(card > -1 && man > card, '…Update card first, then Manage billing');
    t.ok(/<button class="btn-primary" id="billing-card"/.test(p), '…Update card is the main button');
    p = page(app, info({ plan: 'comped' }));
    t.includes(p, '<h3 id="billing-title">Free</h3>', 'comped: Free');
    t.includes(p, 'nothing is charged', '…nothing charged');
    t.excludes(p, 'data-action="billing-subscribe"', '…never Subscribe');
    p = page(app, info({ plan: 'active', role: 'engineer', can_manage: false }));
    t.includes(p, 'Your business’s owner looks after its plan.', 'a team member: the owner pays');
    t.excludes(p, 'data-action="billing-subscribe"', '…no Subscribe');
    t.excludes(p, 'data-action="billing-manage"', '…no Manage billing');
    p = page(app, info({ plan: 'lapsed', status: 'canceled', has_customer: true, has_subscription: true }));
    t.includes(p, '<h3 id="billing-title">Plan ended</h3>', 'ended: says so');
    t.includes(p, 'data-action="billing-subscribe"', '…Subscribe again');
    t.includes(p, 'data-action="billing-manage"', '…and Manage billing (old invoices)');
    p = page(app, null, { error: 'offline' });
    t.includes(p, 'No signal right now — your plan will show when you’re back online.', 'not read, no signal: says so');
    p = page(app, null);
    t.includes(p, 'Checking your plan…', 'not read yet: checking');
    p = page(app, info(), { pending: 'checkout' });
    t.includes(p, 'Continue in the Stripe window, then come back here.', 'waiting: says where to look');
    t.includes(p, 'data-action="billing-cancel-wait"', '…with Cancel');
    t.excludes(p, 'data-action="billing-subscribe"', '…and nothing to tap twice');
    p = page(app, info(), { message: 'You’re subscribed. <b>' });
    t.includes(p, 'id="billing-msg" role="status">You’re subscribed. &lt;b&gt;</p>', 'a message: spoken, escaped');

    // Signed out, and no cloud at all.
    const out = freshApp({ localStorage: { 'pat:cloudUnlocked': '1' } });
    out.state().view = 'cloudSubscription';
    out.fn('render')();
    t.includes(html(out), 'Sign in to see your plan.', 'signed out: sign in first');
    t.includes(html(out), 'data-action="settings-page" data-arg="cloudAccount"', '…with the way to Account');
    const off = freshApp({ hostname: 'localhost', localStorage: { 'pat:cloudUnlocked': '1' } });
    t.eq(off.fn('billingView')().kind, 'off', 'no cloud: paying is off');
    t.includes(off.fn('renderCloudSubscription')(), 'Paying isn\'t available on this copy of the app.', '…and the page says so');

    // The Account page names the plan and leads here.
    const st = app.state();
    Object.assign(st.cloud, { plan: 'trial', trialEndsAt: iso(end) });
    st.view = 'cloudAccount';
    app.fn('render')();
    const a = html(app);
    t.includes(a, `Plan: <strong>Free trial</strong> &middot; ends ${d(end)}`, 'Account: the plan in words, UK date');
    t.includes(a, 'id="cloud-plan-open" data-action="settings-page" data-arg="cloudSubscription"', '…and Subscription ›');
    st.cloud.plan = 'comped';
    app.fn('render')();
    t.includes(html(app), 'Plan: <strong>Free</strong>', 'comped: Free');

    // The Settings row.
    const word = () => app.fn('billingRowStatus')();
    st.billing.info = info({ plan: 'active', interval: 'year' });
    app.storage.setItem('pat:plan', JSON.stringify({ uid: UID, plan: 'active', trialEndsAt: null, checkedAt: Date.now() }));
    t.eq(word(), 'Yearly', 'row: Yearly');
    app.storage.setItem('pat:plan', JSON.stringify({ uid: UID, plan: 'trial', trialEndsAt: iso(end), checkedAt: Date.now() }));
    t.eq(word(), 'Free trial', 'row: Free trial');
    app.storage.setItem('pat:plan', JSON.stringify({ uid: UID, plan: 'trial', trialEndsAt: iso(Date.now() - 10 * DAY), checkedAt: Date.now() }));
    t.eq(word(), 'Locked — renew', 'row: Locked — renew');
    app.storage.setItem('pat:plan', JSON.stringify({ uid: UID, plan: 'comped', checkedAt: Date.now() }));
    t.eq(word(), 'Free', 'row: Free');
    st.view = 'settingsCategory';
    st.settingsCategory = 'catCloud';
    app.fn('render')();
    t.ok(/data-page="cloudSubscription"[\s\S]*?Free/.test(html(app)), 'the Subscription row says the plan (Free)');
  });

  /* ------------------------------------------------------------------ 81b */
  await t.group('81b — Subscribe → the choice → the window inside the tap → our server → Stripe (1A, 2A)', async () => {
    const app = await signedIn();
    app.srv.billing = info();
    await app.fn('billingRead')();   // as the page does when it opens
    act(app, 'billing-subscribe');
    const sh = sheets(app).pop();
    t.ok(!!sh && /Choose your plan/.test(sh.innerHTML), 'Subscribe → the choice');
    t.includes(sh.innerHTML, '£60 a year — two months free', '…yearly first, with two months free');
    t.ok(/class="btn-primary" id="choice-sheet-0"[^>]*>£60 a year/.test(sh.innerHTML), '…as the main button');
    t.includes(sh.innerHTML, 'id="choice-sheet-1" style="width:100%">£6 a month', '…then monthly');
    t.includes(sh.innerHTML, 'Your free trial carries on — the first payment is taken on', 'in the trial: says the free days are kept (3A)');
    t.includes(sh.innerHTML, 'PATGo never sees your card', '…and that Stripe takes the card');
    t.eq(app.opened.length, 0, 'nothing opened yet');
    app.doc.getElementById('choice-sheet-0').click();
    t.eq(app.opened.length, 1, 'picking opens ONE window');
    t.eq(app.opened[0].url, 'about:blank', '…at once, blank — inside the tap (iOS)');
    t.eq(app.opened[0].openedWhile, '', '…before anything else happened');
    await until(() => app.opened[0].location.href !== 'about:blank');
    const c = app.srv.fnCalls('billing-checkout');
    t.eq(c.length, 1, 'our server function asked once');
    t.deepEq(c[0].body, { every: 'year', returnTo: RETURN }, '…for yearly, returning to this copy’s billing-done.html');
    t.eq(c[0].auth, 'Bearer ZZACCESS142', '…as the person signed in');
    t.eq(app.opened[0].location.href, CHECKOUT_URL, 'the window goes to Stripe’s payment page');
    t.eq(app.state().billing.pending, 'checkout', 'and the app waits for it');
    t.notOk(/stripe\.com/.test(String(app.sandbox.location.href)), 'the app itself never leaves');

    // Monthly.
    const m = await signedIn();
    act(m, 'billing-subscribe');
    m.doc.getElementById('choice-sheet-1').click();
    await until(() => m.srv.fnCalls('billing-checkout').length === 1);
    t.eq(m.srv.fnCalls('billing-checkout')[0].body.every, 'month', 'monthly asks for monthly');

    // Already subscribed (another phone): the billing page instead, same window.
    const s = await signedIn();
    s.srv.checkout = () => json({ error: 'You already have a plan. Use Manage billing to change it.', manage: true }, 409);
    act(s, 'billing-subscribe');
    s.doc.getElementById('choice-sheet-0').click();
    await until(() => s.opened[0].location.href !== 'about:blank');
    t.eq(s.srv.fnCalls('billing-portal').length, 1, 'already paying → our billing-page function');
    t.eq(s.opened.length, 1, '…in the same window');
    t.eq(s.opened[0].location.href, PORTAL_URL, '…which goes to Stripe’s billing page');

    // A refusal says why, and closes the window.
    const r = await signedIn();
    r.srv.checkout = () => json({ error: 'Only your business’s owner can subscribe.' }, 403);
    act(r, 'billing-subscribe');
    r.doc.getElementById('choice-sheet-0').click();
    await until(() => r.opened[0].closed);
    t.ok(r.opened[0].closed, 'refused → the window closes');
    t.eq(r.state().billing.message, 'Only your business’s owner can subscribe.', '…and the reason shows');
    t.eq(r.state().billing.pending, '', '…nothing waiting');
    // A reply that isn't a Stripe page is never followed.
    const x = await signedIn();
    x.srv.checkout = () => json({ url: 'https://evil.example.com/pay' });
    act(x, 'billing-subscribe');
    x.doc.getElementById('choice-sheet-0').click();
    await until(() => x.opened[0].closed);
    t.ok(x.opened[0].closed && x.opened[0].location.href === 'about:blank', 'only a Stripe address is ever opened');
    // A blocked window.
    const bl = await signedIn({ blocked: true });
    act(bl, 'billing-subscribe');
    bl.doc.getElementById('choice-sheet-0').click();
    await tick(30);
    t.eq(bl.state().billing.message, 'Your phone blocked the Stripe window. Try again.', 'blocked window: says so');
    t.eq(bl.srv.fnCalls('billing-checkout').length, 0, '…and asks nothing');
    // No signal.
    const off = await signedIn();
    off.run('navigator.onLine = false');
    act(off, 'billing-subscribe');
    t.eq(sheets(off).filter(x2 => /Choose your plan/.test(x2.innerHTML)).length, 0, 'no signal: no choice');
    t.eq(off.opened.length, 0, '…no window');

    // Renew now (the lock's sheets, the Jobs line) = the same choice (2A).
    const rn = await signedIn();
    act(rn, 'plan-renew');
    t.ok(sheets(rn).some(x2 => /Choose your plan/.test(x2.innerHTML)), 'Renew now → the same choice');
    t.notOk(/^mailto:/.test(String(rn.sandbox.location.href)), '…not an email');
    rn.state().billing.info = info({ plan: 'active', status: 'past_due', has_customer: true, has_subscription: true });
    closeSheets(rn);
    act(rn, 'plan-renew');
    await until(() => rn.srv.fnCalls('billing-portal').length === 1);
    t.deepEq(rn.srv.fnCalls('billing-portal')[0].body, { returnTo: RETURN, flow: 'card' }, 'a failed payment: Renew now → straight to the card form (4A)');

    // Manage billing, Update card.
    const mg = await signedIn();
    act(mg, 'billing-manage');
    await until(() => mg.opened.length && mg.opened[0].location.href !== 'about:blank');
    t.deepEq(mg.srv.fnCalls('billing-portal')[0].body, { returnTo: RETURN }, 'Manage billing → our billing-page function');
    t.eq(mg.opened[0].location.href, PORTAL_URL, '…Stripe’s billing page (monthly ↔ yearly there, 5A)');
    t.eq(mg.state().billing.pending, 'portal', '…waiting for it');
    act(mg, 'billing-manage');
    t.eq(mg.opened.length, 1, 'a second tap while waiting does nothing');
    const cd = await signedIn();
    act(cd, 'billing-card');
    await until(() => cd.srv.fnCalls('billing-portal').length === 1);
    t.eq(cd.srv.fnCalls('billing-portal')[0].body.flow, 'card', 'Update card → the card form');
  });

  /* ------------------------------------------------------------------ 81c */
  await t.group('81c — the way back: billing-done.html; taken once, own origin, only while waiting; paid → the database', async () => {
    // The landing page itself.
    const paid = landing('?result=paid');
    t.eq(paid.posted.length, 1, 'paid: tells the app that opened it');
    t.deepEq(paid.posted[0].msg, { type: 'patgo-billing-return', result: 'paid' }, '…the result only');
    t.eq(paid.posted[0].target, ORIGIN, '…to our own origin only');
    t.deepEq(paid.channel[0], { type: 'patgo-billing-return', result: 'paid' }, '…and on the channel');
    t.deepEq(paid.replaced, ['/pat-test-app/billing-done.html'], 'the address is wiped');
    t.eq(paid.said, 'Payment done — going back to PATGo…', 'says so');
    t.eq(paid.win.closedCalls, 1, 'closes itself');
    t.eq(landing('?result=cancelled').posted[0].msg.result, 'cancelled', 'cancelled: says cancelled');
    t.eq(landing('?result=portal').posted[0].msg.result, 'portal', 'back from the billing page: portal');
    t.eq(landing('?result=<script>').posted[0].msg.result, '', 'anything else: nothing');
    t.notOk(/plan|active|cus_|sub_/.test(read('billing-done.html').slice(read('billing-done.html').indexOf('<script>'))), 'it carries no plan and no Stripe id');

    // The app.
    const app = await signedIn();
    app.srv.billing = info();
    act(app, 'billing-subscribe');
    app.doc.getElementById('choice-sheet-0').click();
    await until(() => app.opened[0].location.href === CHECKOUT_URL);
    handBack(app, 'paid', 'https://evil.example.com');
    await tick(20);
    t.eq(app.state().billing.pending, 'checkout', 'another origin: ignored');
    // Stripe's message reaches the database a moment later.
    app.srv.billing = info();
    let reads = 0;
    const real = app.srv.fetchImpl;
    app.sandbox.fetch = async (u, init) => {
      if (String(u).endsWith('/rest/v1/rpc/my_billing') && ++reads === 2) app.srv.billing = info({ plan: 'active', status: 'trialing', interval: 'year', has_customer: true, has_subscription: true });
      return real(u, init);
    };
    app.run('BILLING_CONFIRM_DELAYS[1] = 20; BILLING_CONFIRM_DELAYS[2] = 20;');
    handBack(app, 'paid');
    t.ok(app.opened[0].closed, 'paid: the window closes');
    t.eq(app.state().billing.message, 'Payment done — confirming with Stripe…', '…"confirming"');
    await until(() => app.state().billing.message === 'You’re subscribed. Thank you!');
    t.eq(app.state().billing.message, 'You’re subscribed. Thank you!', '…then, once the DATABASE says so, subscribed');
    t.ok(reads >= 2, '…read again until it did');
    t.eq(JSON.parse(app.storage.getItem('pat:plan')).plan, 'active', 'the plan record says active — the lock lifts at once');
    const r0 = reads;
    handBack(app, 'paid');
    await tick(60);
    t.eq(reads, r0, 'a second copy (the channel) does nothing — no re-read');
    t.eq(app.state().billing.message, 'You’re subscribed. Thank you!', '…and the message stands');

    // A lock lifts the moment paying is confirmed.
    const lk = await signedIn({ localStorage: { 'pat:plan': JSON.stringify({ uid: UID, plan: 'trial', trialEndsAt: iso(Date.now() - 10 * DAY), checkedAt: Date.now() }) } });
    t.ok(lk.fn('planLocked')(), '(locked to begin with)');
    lk.srv.billing = info({ plan: 'active', status: 'active', interval: 'year', has_customer: true, has_subscription: true });
    await lk.fn('billingRead')();
    t.notOk(lk.fn('planLocked')(), 'paid → unlocked, no restart');

    // Cancelled on Stripe's page.
    const cn = await signedIn();
    act(cn, 'billing-subscribe');
    cn.doc.getElementById('choice-sheet-0').click();
    await until(() => cn.opened[0].location.href === CHECKOUT_URL);
    handBack(cn, 'cancelled');
    t.eq(cn.state().billing.message, 'No payment was taken.', 'cancelled: no payment taken');
    // Nothing waiting (listening, but the tap was cancelled): a stray message does nothing.
    const st2 = await signedIn();
    act(st2, 'billing-manage');
    act(st2, 'billing-cancel-wait');
    await tick(30);
    const r1 = st2.srv.calls.filter(c => c.url.endsWith('/rpc/my_billing')).length;
    handBack(st2, 'paid');
    await tick(60);
    t.eq(st2.state().billing.message, '', 'nothing waiting: ignored — no "payment done"');
    t.eq(st2.state().billing.confirming, false, '…nothing confirming');
    t.eq(st2.srv.calls.filter(c => c.url.endsWith('/rpc/my_billing')).length, r1, '…and nothing read');
    // Back to the app with the window closed by hand: stop waiting, read.
    const vb = await signedIn();
    act(vb, 'billing-manage');
    await until(() => vb.opened[0].location.href === PORTAL_URL);
    vb.opened[0].closed = true;
    vb.doc.visibilityState = 'visible';
    const before = vb.srv.calls.filter(c => c.url.endsWith('/rpc/my_billing')).length;
    vb.fn('_planOnVisible')();
    t.eq(vb.state().billing.pending, '', 'window closed by hand: no longer waiting');
    await until(() => vb.srv.calls.filter(c => c.url.endsWith('/rpc/my_billing')).length > before);
    t.ok(vb.srv.calls.filter(c => c.url.endsWith('/rpc/my_billing')).length > before, '…and the plan is read');
    // Cancel while waiting.
    const cw = await signedIn();
    act(cw, 'billing-manage');
    act(cw, 'billing-cancel-wait');
    t.ok(cw.opened[0].closed, 'Cancel closes the window');
    t.eq(cw.state().billing.pending, '', '…and stops waiting');
    // Opening the page reads the plan.
    const op = await signedIn();
    op.fn('setView')('cloudSubscription');
    await until(() => op.srv.calls.some(c => c.url.endsWith('/rest/v1/rpc/my_billing')));
    t.ok(op.srv.calls.some(c => c.url.endsWith('/rest/v1/rpc/my_billing')), 'opening the page reads the plan (every time)');
    await until(() => /Free trial/.test(html(op)));
    t.includes(html(op), '<h3 id="billing-title">Free trial</h3>', '…and shows it');
  });

  /* ------------------------------------------------------------------ 81d */
  await t.group('81d — the server functions: signature, who may pay, the payment page, the webhook', async () => {
    const B = await server();
    const now = Math.floor(Date.now() / 1000);
    // The signature (Stripe-Signature: t=…,v1=…).
    const payload = '{"id":"evt_1"}';
    const good = await sign(payload, 'whsec_ZZ', now);
    t.ok(await B.verifySignature(payload, `t=${now},v1=${good}`, 'whsec_ZZ', now), 'a good signature passes');
    t.ok(await B.verifySignature(payload, `t=${now},v1=${'0'.repeat(64)},v1=${good}`, 'whsec_ZZ', now), '…among several');
    t.notOk(await B.verifySignature(payload, `t=${now},v1=${good}`, 'whsec_OTHER', now), 'another secret fails');
    t.notOk(await B.verifySignature(payload + ' ', `t=${now},v1=${good}`, 'whsec_ZZ', now), 'a changed message fails');
    t.notOk(await B.verifySignature(payload, `t=${now - 301},v1=${await sign(payload, 'whsec_ZZ', now - 301)}`, 'whsec_ZZ', now), 'an old one fails (5 minutes)');
    t.notOk(await B.verifySignature(payload, '', 'whsec_ZZ', now), 'no signature fails');
    t.notOk(await B.verifySignature(payload, `t=${now},v1=${good}`, '', now), 'no secret set fails');

    // Who may pay.
    t.eq(B.checkoutRefusal({ org_id: 'o', role: 'owner', plan: 'trial' }), null, 'the owner on a trial may');
    t.eq(B.checkoutRefusal({ org_id: 'o', role: 'engineer', plan: 'trial' }).status, 403, 'not the owner: no');
    t.eq(B.checkoutRefusal({ org_id: 'o', role: 'owner', plan: 'comped' }).status, 409, 'comped: no');
    t.ok(B.checkoutRefusal({ org_id: 'o', role: 'owner', plan: 'active', stripe_subscription: 's', status: 'past_due' }).manage, 'already paying: the billing page instead');
    t.eq(B.checkoutRefusal({ org_id: 'o', role: 'owner', plan: 'lapsed', stripe_subscription: 's', status: 'canceled' }), null, 'ended: may subscribe again');
    t.eq(B.checkoutRefusal(null).status, 404, 'no business: no');

    // The payment page's settings.
    const ctx = { org_id: 'org1', plan: 'trial', trial_ends_at: iso((now + 20 * 86400) * 1000), stripe_customer: 'cus_1' };
    const p = B.checkoutParams(ctx, 'year', 'price_year', RETURN, now);
    t.eq(p.mode, 'subscription', 'a subscription');
    t.deepEq(p.line_items, [{ price: 'price_year', quantity: 1 }], 'one of the chosen price');
    t.eq(p.allow_promotion_codes, 'true', 'founders’ codes can be typed (round 2)');
    t.eq(p.locale, 'en-GB', 'in UK English');
    t.eq(p.success_url, RETURN + '?result=paid', 'back to billing-done.html, paid');
    t.eq(p.cancel_url, RETURN + '?result=cancelled', '…or cancelled');
    t.eq(p.subscription_data.trial_end, now + 20 * 86400, 'in the trial: the first payment the day it ends (3A)');
    t.eq(p.subscription_data.metadata.org_id, 'org1', 'the subscription names the business');
    t.eq(B.checkoutParams(Object.assign({}, ctx, { trial_ends_at: iso((now + 86400) * 1000) }), 'year', 'p', RETURN, now).subscription_data.trial_end, undefined, 'under 48 hours left: paid at once (Stripe’s minimum)');
    t.eq(B.checkoutParams(Object.assign({}, ctx, { plan: 'lapsed' }), 'month', 'p', RETURN, now).subscription_data.trial_end, undefined, 'ended: no free days');
    t.eq(B.formEncode({ a: { b: 1 }, c: [{ d: 'x y' }], e: undefined }), 'a%5Bb%5D=1&c%5B0%5D%5Bd%5D=x%20y', 'Stripe’s form fields');

    // Where Stripe may send people back: only this copy's billing-done.html.
    const env = (k) => ENV[k];
    t.eq(B.safeReturn(RETURN, env), RETURN, 'the test site’s page: yes');
    t.eq(B.safeReturn(RETURN + '?x=1#y', env), RETURN, '…without anything added');
    t.eq(B.safeReturn('https://evil.example.com/billing-done.html', env), null, 'another site: no');
    t.eq(B.safeReturn('http://exnno.github.io/pat-test-app/billing-done.html', env), null, 'not https: no');
    t.eq(B.safeReturn('https://exnno.github.io/pat-test-app/index.html', env), null, 'another page: no');
    t.eq(B.safeReturn(RETURN, (k) => k === 'APP_ORIGINS' ? 'https://app.patgo.co.uk' : ENV[k]), null, 'APP_ORIGINS decides');

    // billing-checkout end to end.
    let d = serverDeps();
    let res = await B.makeCheckout(d)(req({ every: 'year', returnTo: RETURN }));
    t.eq(res.status, 200, 'checkout: 200');
    t.eq((await res.json()).url, CHECKOUT_URL, '…Stripe’s page');
    t.eq(res.headers.get('access-control-allow-origin'), ORIGIN, '…to the app’s own origin');
    const user = d.calls.find(c => c.url.endsWith('/auth/v1/user'));
    t.eq(user.headers.authorization, 'Bearer good', 'the person’s sign-in is checked by Supabase');
    t.eq(user.headers.apikey, 'sb_publishable_ZZ', '…with the publishable key');
    const ctxCall = d.calls.find(c => c.url.endsWith('/rpc/billing_context'));
    t.deepEq(ctxCall.headers, { 'content-type': 'application/json', apikey: 'sb_secret_ZZ' }, 'the database with the SECRET key, on apikey only (a new key is not a JWT)');
    t.deepEq(JSON.parse(ctxCall.body), { u: 'u1' }, '…for that person');
    const cust = d.calls.find(c => c.url.endsWith('/v1/customers'));
    t.eq(cust.headers['idempotency-key'], 'patgo-customer-org1', 'a Stripe customer made once per business');
    t.eq(form(cust.body)['metadata[org_id]'], 'org1', '…naming the business');
    t.deepEq(JSON.parse(d.calls.find(c => c.url.endsWith('/rpc/billing_set_customer')).body), { o: 'org1', cus: 'cus_new' }, '…and kept');
    const sess = form(d.calls.find(c => c.url.endsWith('/v1/checkout/sessions')).body);
    t.eq(sess.customer, 'cus_new', 'the payment page for that customer');
    t.eq(sess['line_items[0][price]'], 'price_year', '…yearly');
    t.eq(d.calls.find(c => c.url.includes('api.stripe.com')).headers.authorization, 'Bearer sk_test_ZZ', 'Stripe with the secret key from the secrets');
    // Two taps at once: the database keeps the first customer; the second is told it.
    d = serverDeps({ storedCustomer: 'cus_first' });
    await B.makeCheckout(d)(req({ every: 'month', returnTo: RETURN }));
    t.eq(form(d.calls.find(c => c.url.endsWith('/v1/checkout/sessions')).body).customer, 'cus_first', 'a second customer is never used');
    d = serverDeps({ ctx: { stripe_customer: 'cus_old', plan: 'lapsed' } });
    await B.makeCheckout(d)(req({ every: 'month', returnTo: RETURN }));
    t.notOk(d.calls.some(c => c.url.endsWith('/v1/customers')), 'an existing customer is reused');
    // Refusals.
    t.eq((await B.makeCheckout(serverDeps())(req({ every: 'year', returnTo: RETURN }, { auth: 'Bearer bad' }))).status, 401, 'not signed in: 401');
    t.eq((await B.makeCheckout(serverDeps())(req({ every: 'week', returnTo: RETURN }))).status, 400, 'an unknown interval: 400');
    t.eq((await B.makeCheckout(serverDeps())(req({ every: 'year', returnTo: 'https://evil.example.com/billing-done.html' }))).status, 400, 'a foreign return address: 400');
    d = serverDeps({ ctx: { role: 'engineer' } });
    res = await B.makeCheckout(d)(req({ every: 'year', returnTo: RETURN }));
    t.eq(res.status, 403, 'not the owner: 403');
    t.notOk(d.calls.some(c => c.url.includes('api.stripe.com')), '…and Stripe is never asked');
    res = await B.makeCheckout(serverDeps({ ctx: { plan: 'active', stripe_subscription: 'sub_1', status: 'active', stripe_customer: 'cus_1' } }))(req({ every: 'year', returnTo: RETURN }));
    t.eq(res.status, 409, 'already paying: 409');
    t.eq((await res.json()).manage, true, '…telling the app to open the billing page');
    t.eq((await B.makeCheckout(serverDeps({ env: { STRIPE_PRICE_YEAR: '' } }))(req({ every: 'year', returnTo: RETURN }))).status, 503, 'no price set up: 503');
    res = await B.makeCheckout(serverDeps())(req(null, { method: 'OPTIONS' }));
    t.eq(res.status, 200, 'the browser’s pre-check: answered');
    t.eq(res.headers.get('access-control-allow-headers'), 'authorization, x-client-info, apikey, content-type', '…with the headers supabase-js sends');
    res = await B.makeCheckout(serverDeps())(req(null, { method: 'OPTIONS', origin: 'https://evil.example.com' }));
    t.eq(res.headers.get('access-control-allow-origin'), null, '…but not for another site');

    // billing-portal.
    d = serverDeps({ ctx: { stripe_customer: 'cus_1' } });
    res = await B.makePortal(d)(req({ returnTo: RETURN, flow: 'card' }));
    t.eq((await res.json()).url, PORTAL_URL, 'billing page: Stripe’s');
    const ps = form(d.calls.find(c => c.url.endsWith('/v1/billing_portal/sessions')).body);
    t.eq(ps.customer, 'cus_1', '…for the business’s customer');
    t.eq(ps.return_url, RETURN + '?result=portal', '…back to billing-done.html');
    t.eq(ps['flow_data[type]'], 'payment_method_update', 'Update card → the card form (4A)');
    t.eq((await B.makePortal(serverDeps())(req({ returnTo: RETURN }))).status, 409, 'no customer yet: 409');
    t.eq((await B.makePortal(serverDeps({ ctx: { role: 'office', stripe_customer: 'cus_1' } }))(req({ returnTo: RETURN }))).status, 403, 'not the owner: 403');

    // The webhook: re-reads the subscription from Stripe, then the database.
    const ev = (o) => JSON.stringify(Object.assign({ id: 'evt_9', type: 'customer.subscription.updated',
      data: { object: { object: 'subscription', id: 'sub_1', status: 'canceled', metadata: { org_id: 'org1' } } } }, o));
    const hook = async (deps, body, sig) => B.makeWebhook(deps)(new Request('https://zz/functions/v1/stripe-webhook',
      { method: 'POST', headers: { 'stripe-signature': sig || `t=${now},v1=${await sign(body, 'whsec_ZZ', now)}` }, body }));
    d = serverDeps();
    res = await hook(d, ev());
    t.eq(res.status, 200, 'webhook: 200');
    t.ok(d.calls.some(c => c.method === 'GET' && c.url.endsWith('/v1/subscriptions/sub_1')), '…Stripe is asked for the subscription as it is NOW');
    const ap = JSON.parse(d.calls.find(c => c.url.endsWith('/rpc/billing_apply')).body);
    t.deepEq(ap, { o: 'org1', cus: 'cus_1', sub: 'sub_1', status: 'active', every: 'year', ends: new Date(1800000000 * 1000).toISOString(), cancelling: false },
      '…and ITS word is applied, not the message’s (the message said canceled)');
    t.deepEq(JSON.parse(d.calls.find(c => c.url.endsWith('/rpc/billing_event_log')).body), { eid: 'evt_9', etype: 'customer.subscription.updated', o: 'org1', outcome: 'plan active' }, '…then logged');
    t.ok(d.calls.findIndex(c => c.url.endsWith('/rpc/billing_apply')) < d.calls.findIndex(c => c.url.endsWith('/rpc/billing_event_log')), '…after the change, so a failure is simply retried');
    t.eq((await hook(serverDeps(), ev(), `t=${now},v1=${'0'.repeat(64)}`)).status, 400, 'a bad signature: 400, nothing done');
    d = serverDeps();
    res = await hook(d, ev({ type: 'customer.created', data: { object: { object: 'customer', id: 'cus_1' } } }));
    t.eq((await res.json()).result, 'ignored', 'no subscription in it: ignored');
    t.notOk(d.calls.some(c => c.url.includes('/rpc/')), '…the database untouched');
    const quiet = console.error; console.error = () => {};
    try { t.eq((await hook(serverDeps({ dbDown: true }), ev())).status, 500, 'the database refusing: 500, so Stripe tries again'); }
    finally { console.error = quiet; }
    // Each kind of message finds its subscription.
    t.deepEq(B.eventTarget({ data: { object: { object: 'checkout.session', subscription: 'sub_2', client_reference_id: 'org2' } } }), { sub: 'sub_2', org: 'org2' }, 'checkout finished: its subscription and business');
    t.deepEq(B.eventTarget({ data: { object: { object: 'invoice', subscription: 'sub_3' } } }), { sub: 'sub_3', org: null }, 'an invoice (older Stripe)');
    t.deepEq(B.eventTarget({ data: { object: { object: 'invoice', parent: { subscription_details: { subscription: 'sub_4' } } } } }), { sub: 'sub_4', org: null }, 'an invoice (newer Stripe)');
    // What a subscription says, in Stripe's older and newer shapes.
    const f1 = B.subscriptionFacts({ status: 'active', current_period_end: 1800000000, cancel_at_period_end: true, items: { data: [{ plan: { interval: 'month' } }] } });
    t.deepEq(f1, { status: 'active', every: 'month', ends: new Date(1800000000 * 1000).toISOString(), cancelling: true }, 'older shape');
    const f2 = B.subscriptionFacts({ status: 'trialing', cancel_at: 1700000000, items: { data: [{ price: { recurring: { interval: 'year' } }, current_period_end: 1800000000 }] } });
    t.deepEq(f2, { status: 'trialing', every: 'year', ends: new Date(1700000000 * 1000).toISOString(), cancelling: true }, 'newer shape: the end on the item, cancel_at');

    // A legacy key goes on both headers; the entry files.
    d = serverDeps({ env: { SUPABASE_SECRET_KEYS: '', SUPABASE_SERVICE_ROLE_KEY: 'eyJLEGACY' } });
    await B.makeCheckout(d)(req({ every: 'year', returnTo: RETURN }));
    t.deepEq(d.calls.find(c => c.url.endsWith('/rpc/billing_context')).headers, { 'content-type': 'application/json', apikey: 'eyJLEGACY', authorization: 'Bearer eyJLEGACY' }, 'a legacy key: both headers');
    for (const [fn, maker] of [['billing-checkout', 'makeCheckout'], ['billing-portal', 'makePortal'], ['stripe-webhook', 'makeWebhook']]) {
      const src = read(`supabase/functions/${fn}/index.js`);
      t.includes(src, `import { ${maker}, denoDeps } from '../_shared/billing.js';`, `${fn}: the shared code`);
      t.includes(src, `Deno.serve(${maker}(denoDeps()));`, `${fn}: served`);
    }
    const shared = read('supabase/functions/_shared/billing.js');
    t.notOk(/^import /m.test(shared), 'the shared file imports nothing (no packages)');
    t.notOk(/sk_(test|live)_[A-Za-z0-9]{6,}|whsec_[A-Za-z0-9]{6,}|sb_secret_[A-Za-z0-9]{6,}/.test(shared), 'no secret is written in it');
  });

  /* ------------------------------------------------------------------ 81g */
  await t.group('81g — the SQL: the plan on the business, the copies, Stripe’s word, closed to the app', () => {
    const sql = read('supabase/v142-billing.sql');
    const schema = read('supabase/schema.sql');
    const iso2 = read('supabase/isolation-test.sql');
    t.includes(sql, "alter table public.organisations add column if not exists plan text not null default 'trial';", 'the plan on the business (8A)');
    t.includes(sql, "check (plan in ('trial','active','lapsed','comped'))", '…the same four plans as profiles');
    t.includes(sql, 'create trigger org_plan_to_members\n  after update of plan, trial_ends_at on public.organisations', 'the business → its members’ profiles (what phones read)');
    t.includes(sql, 'create trigger member_plan_copy\n  after insert or update of is_default, org_id on public.memberships', 'joining or changing default copies it');
    t.includes(sql, 'create trigger profile_plan_up\n  after update of plan, trial_ends_at on public.profiles', 'a plan set by hand on a profile still works (comped)');
    t.includes(sql, "insert into public.organisations (plan, trial_ends_at) values ('trial', ends) returning id into o;", 'a new login’s business starts the trial');
    const fn = sql.slice(sql.indexOf('create or replace function public.billing_apply'), sql.indexOf('-- One line per message from Stripe'));
    t.includes(fn, "if r.plan <> 'comped' then", 'comped is never changed by Stripe');
    t.includes(fn, "elsif over and r.plan = 'active' then next_plan := 'lapsed';", 'lapsed only if it WAS paying — a trial runs to its own end');
    t.includes(fn, "and not live and r.billing_status in ('trialing','active','past_due') then\n    return 'old subscription';", 'an old subscription never ends a newer live one');
    t.includes(sql, 'revoke select on public.organisations from authenticated;', 'whole-row reads of businesses closed…');
    t.ok(/grant select \(id, name, created_at, updated_at, plan, trial_ends_at, billing_status,\s+billing_interval, period_end, cancel_at_period_end, billing_at\)\s+on public\.organisations to authenticated;/.test(sql), '…reopened without the Stripe ids');
    t.includes(sql, "'can_manage', m.role = 'owner'", 'only the owner manages billing');
    t.includes(sql, 'from public, anon, authenticated;\ngrant execute on function public.billing_context(uuid)', 'the server’s functions closed to the app');
    t.includes(sql, '  to service_role;', '…open to the secret key');
    t.includes(sql, 'revoke all on public.billing_events from anon, authenticated;', 'the Stripe log closed to the app');
    const body = sql.slice(sql.indexOf("-- ------------------------------------------------------------ the business's plan"),
                           sql.indexOf('-- ------------------------------------------------------------ self-check'));
    const schemaLines = new Set(schema.split('\n'));
    const missing = body.split('\n').filter(l => l.trim() && !schemaLines.has(l));
    t.eq(missing.length, 0, 'schema.sql carries every V142 line' + (missing.length ? ' — first missing: ' + missing[0].trim() : ''));
    for (const c of ['18a', '18b', '18c', '18d', '18e', '18f']) t.includes(iso2, "'" + c + '|', 'isolation ' + c);
    t.includes(iso2, "18a|billing|FAIL|run supabase/v142-billing.sql first", 'names the file when it has not been run');
    for (const c of ['B1', 'B2', 'B3', 'B4', 'B5', 'B6']) t.includes(sql, "'" + c + '|', 'self-check ' + c);
  });

  /* ------------------------------------------------------------------ 81e */
  await t.group('81e — release: V142, cache, What’s new, About; wiring; no Stripe script (80e’s lasting checks)', async () => {
    const app = freshApp();
    t.eq(app.run('APP_VERSION'), 'V142', 'APP_VERSION V142');
    t.eq(app.run('WELCOME_VERSION'), 'V142', 'What’s new rolled');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v142';", 'cache key pat-v142');
    const core = read('render-core.js');
    const at = core.indexOf('<ul class="welcome-list sheet-scroll">');
    const sheetCopy = core.slice(at, core.indexOf('</ul>', at));
    t.eq((sheetCopy.match(/<li>/g) || []).length, 1, 'What’s new: one line');
    t.includes(sheetCopy, '<li><strong>Subscriptions.</strong>', '…Subscriptions');
    t.includes(sheetCopy, 'Settings &rarr; Account &amp; Sync &rarr; Subscription', '…and says where');
    t.includes(core, 'New here? Try the practice job.', 'setup offers the practice job');
    t.includes(core, 'You can do it again any time from Settings → Help → Tutorials.', '…and says where it lives');
    const help = read('render-help.js');
    const a = help.indexOf('<p><strong>V142</strong>'), b = help.indexOf('<p><strong>V141</strong>'), c = help.indexOf('<p><strong>V140</strong>');
    t.ok(a > -1 && b > a && c > b, 'About: V142, V141, V140');
    t.excludes(help, '<p><strong>V139</strong>', 'V139 rolled off');
    t.includes(help, 'Cloud accounts can subscribe from Settings, paying securely through Stripe', 'About: V142’s line');
    t.includes(help, 'PATGo has a full privacy policy. About now sums up', 'About: V141’s line still there');
    t.includes(help, 'Cloud accounts can sign in with Google. Connect your Google account once', 'About: V140’s line still there');
    t.includes(help, 'data-action="settings-page" data-arg="settingsTutorials"', 'About points at Tutorials');
    const prices = app.run('PLAN_PRICES');
    t.deepEq({ year: prices.year, month: prices.month }, { year: '£60 a year', month: '£6 a month' }, 'the prices shown match the pricing round (1B)');

    // Stripe-hosted (5A): no Stripe or Google script anywhere in the app.
    const shipped = read('index.html') + read('plan.js') + read('cloud.js') + read('billing-done.html') + read('signin-done.html');
    t.notOk(/js\.stripe\.com|<script[^>]+stripe/i.test(shipped), 'no Stripe script in the app (5A)');
    t.notOk(/accounts\.google\.com\/gsi|<script[^>]+google/i.test(shipped), 'no Google script (V140 1A)');
    t.notOk(/billing-done\.html/.test(read('sw.js')) || /billing-done\.html/.test(read('index.html')), 'billing-done.html is not in ASSETS or index.html (only opened online)');
    t.notOk(new RegExp(String.raw`\bconfirm\(|\balert\(|\bprompt\(`).test(read('plan.js') + read('cloud.js')), 'no browser dialogs');

    // The four new taps: wired, guarded, harmless without plan.js (rule 6).
    const disp = read('dispatch.js');
    const NEWB = ['billing-subscribe', 'billing-manage', 'billing-card', 'billing-cancel-wait'];
    for (const n of NEWB) t.ok(new RegExp(`'${n}':\\s*\\(\\) => \\{ if \\(typeof billing\\w+ === 'function'\\)`).test(disp), `${n} wired, typeof-guarded`);
    const noPlan = bootApp({ skip: ['plan.js'] });
    noPlan.state = () => noPlan.refresh('state').state;
    const actsP = noPlan.run('ACTIONS');
    for (const n of NEWB) t.doesNotThrow(() => actsP[n]('', noPlan.doc.createElement('button')), `${n} harmless without plan.js`);
    noPlan.state().view = 'cloudSubscription';
    t.doesNotThrow(() => noPlan.fn('render')(), 'the Subscription page renders without plan.js');
    t.doesNotThrow(() => noPlan.fn('setView')('cloudSubscription'), '…and opens without it');

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

    // 77e's lasting checks (carried by 78e, 79e, 80e).
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
