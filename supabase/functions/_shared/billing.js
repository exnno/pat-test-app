// PATGo cloud — V142: paying — the shared part of the three server functions
// (c) 2026 Peter Birchley. All rights reserved.
//
// Runs on Supabase (Edge Functions, Deno). Plain JavaScript, no packages and no
// build step: Stripe and the database are reached with fetch, so every line
// that runs on the server is here to read. The app's harness (Node) imports
// this file and tests it with a pretend Stripe and a pretend database — nothing
// in it may touch Deno until a handler is actually called.
//
// THE FIVE FUNCTIONS (each folder's index.js is one line that serves one of these):
//   billing-checkout  the app's Subscribe → a Stripe payment page for the business
//   billing-portal    the app's Manage billing / Update card → Stripe's billing page
//   stripe-webhook    Stripe telling us something changed → the business's plan
//   billing-seats     V169: the seat count → Stripe, and the Owner emailed (4B)
//   billing-switch    V169: the app's Switch to yearly / monthly (3A)
//
// SECRETS (Supabase → Edge Functions → Secrets — never in this file or the repo):
//   STRIPE_SECRET_KEY      sk_test_… now, sk_live_… at launch
//   STRIPE_WEBHOOK_SECRET  whsec_… from the webhook's page in Stripe
//   STRIPE_PRICE_MONTH     price_… for £6 a month
//   STRIPE_PRICE_YEAR      price_… for £60 a year
//   STRIPE_PRICE_SEAT_MONTH price_… for £3 a month — a team seat (V169)
//   STRIPE_PRICE_SEAT_YEAR  price_… for £30 a year — a team seat (V169)
//   RESEND_API_KEY         re_… — the Owner's seat emails (V169; Resend already
//                          sends PATGo's sign-in codes). Unset = no email yet;
//                          each one waits and goes once it is set (7 days).
//   EMAIL_FROM             optional: who the seat emails are from
//                          (default: PATGo <hello@patgo.co.uk>)
//   APP_ORIGINS            optional: where the app may be, comma-separated
//                          (default: the test site, https://exnno.github.io)
// Supabase provides SUPABASE_URL and the project's own keys by itself.
//
// ⚠ Stripe is always asked for the subscription's CURRENT state before
// anything is changed (webhook): its messages can arrive late, twice or out of
// order, and acting on the message itself would let an old one undo a new one.

export const DEFAULT_ORIGINS = ['https://exnno.github.io'];
export const RETURN_PAGE = 'billing-done.html';
export const LIVE = ['trialing', 'active', 'past_due'];
// Stripe won't start a subscription with a trial ending in under 48 hours.
export const TRIAL_MIN_SECONDS = 48 * 3600 + 600;
export const SIGNATURE_TOLERANCE_SECONDS = 300;
// V169 — what a seat costs, for the Owner's email only. The PRICE charged is the
// Stripe price (STRIPE_PRICE_SEAT_*): change both together, and the app's
// config.js PLAN_PENCE.
export const PENCE = { base: { month: 600, year: 6000 }, seat: { month: 300, year: 3000 } };
export const DEFAULT_FROM = 'PATGo <hello@patgo.co.uk>';
export const ROLE_WORDS = { owner: 'Owner', team_leader: 'Team leader', engineer: 'Engineer', office: 'Office' };

// ---------------------------------------------------------------- small helpers
export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign({ 'content-type': 'application/json' }, headers),
  });
}

export function allowedOrigins(env) {
  const raw = env('APP_ORIGINS');
  const list = raw ? String(raw).split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_ORIGINS;
  return list.map((o) => o.replace(/\/+$/, ''));
}

// The browser asks first (OPTIONS) whether the app's page may call us.
export function corsHeaders(req, env) {
  const origin = req.headers.get('origin') || '';
  if (!allowedOrigins(env).includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'vary': 'origin',
  };
}

// Where Stripe sends the person back: only the app's own billing-done.html,
// on an address in APP_ORIGINS — never anywhere a caller names.
export function safeReturn(returnTo, env) {
  let u;
  try { u = new URL(String(returnTo || '')); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  if (!allowedOrigins(env).includes(u.origin)) return null;
  if (!u.pathname.endsWith('/' + RETURN_PAGE)) return null;
  return u.origin + u.pathname;
}

// Stripe takes form fields: {a: {b: 1}, c: [{d: 2}]} → a[b]=1&c[0][d]=2
export function formEncode(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') formEncode(v, key, out);
    else out.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(v)));
  }
  return out.join('&');
}

// ---------------------------------------------------------------- the database
function supabaseKeys(env) {
  const pick = (name) => {
    try { const o = JSON.parse(env(name) || '{}'); return o && o.default ? o.default : ''; } catch { return ''; }
  };
  return {
    url: String(env('SUPABASE_URL') || '').replace(/\/+$/, ''),
    secret: pick('SUPABASE_SECRET_KEYS') || env('SUPABASE_SERVICE_ROLE_KEY') || '',
    publishable: pick('SUPABASE_PUBLISHABLE_KEYS') || env('SUPABASE_ANON_KEY') || '',
  };
}

// A new-style key (sb_…) goes on apikey only; an old JWT key on both headers.
function keyHeaders(key) {
  return key.startsWith('sb_') ? { apikey: key } : { apikey: key, authorization: 'Bearer ' + key };
}

// One of the database's billing functions, with the secret key (service_role).
export async function rpc(deps, name, args) {
  const k = supabaseKeys(deps.env);
  const res = await deps.fetch(`${k.url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json' }, keyHeaders(k.secret)),
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`database ${name}: ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

// Who is calling: Supabase checks the person's own sign-in token for us.
export async function callerUser(req, deps) {
  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+/.test(auth)) return null;
  const k = supabaseKeys(deps.env);
  const res = await deps.fetch(`${k.url}/auth/v1/user`, {
    headers: { apikey: k.publishable, authorization: auth },
  });
  if (!res.ok) return null;
  const u = await res.json().catch(() => null);
  return u && u.id ? { id: u.id, email: u.email || '' } : null;
}

// ---------------------------------------------------------------- Stripe
export async function stripe(deps, method, path, params, idempotencyKey) {
  const headers = { authorization: 'Bearer ' + (deps.env('STRIPE_SECRET_KEY') || '') };
  let url = 'https://api.stripe.com/v1/' + path;
  let body;
  if (params && method === 'GET') url += '?' + formEncode(params);
  else if (params) { body = formEncode(params); headers['content-type'] = 'application/x-www-form-urlencoded'; }
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  const res = await deps.fetch(url, { method, headers, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data && data.error && data.error.message ? data.error.message : String(res.status);
    throw new Error('stripe ' + path + ': ' + msg);
  }
  return data;
}

// The Stripe-Signature header: t=…,v1=…[,v1=…]. HMAC-SHA256 of "t.payload".
export async function verifySignature(payload, header, secret, nowSeconds) {
  if (!header || !secret) return false;
  const parts = String(header).split(',').map((p) => p.trim().split('='));
  const t = (parts.find((p) => p[0] === 't') || [])[1];
  const sigs = parts.filter((p) => p[0] === 'v1').map((p) => p[1]);
  if (!t || !/^\d+$/.test(t) || sigs.length === 0) return false;
  if (Math.abs(nowSeconds - Number(t)) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(t + '.' + payload)));
  const hex = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
  return sigs.some((s) => timingSafeEqual(s, hex));
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// What a Stripe subscription says, in the shape the database takes. Reads both
// the older (subscription.current_period_end) and newer (on the item) places,
// and Stripe's two ways of saying "cancelled at the end".
//
// V169: a subscription has the base price and, for a team, a seat line. The
// interval and period are the BASE line's; seats = the seat line's quantity
// (0 = none). seatIds: the two seat price ids (seatPriceIds(env)).
export function subscriptionFacts(sub, seatIds = []) {
  const items = (sub && sub.items && Array.isArray(sub.items.data)) ? sub.items.data : [];
  const isSeat = (it) => !!(it && it.price && seatIds.includes(it.price.id));
  const item = items.find((it) => !isSeat(it)) || items[0] || {};
  const seats = items.filter(isSeat).reduce((n, it) => n + (Number(it.quantity) || 0), 0);
  const every = (item.price && item.price.recurring && item.price.recurring.interval)
    || (item.plan && item.plan.interval) || null;
  const periodEnd = sub.current_period_end || item.current_period_end || null;
  const cancelAt = sub.cancel_at || null;
  const ends = cancelAt || periodEnd;
  return {
    status: String(sub.status || ''),
    every: every === 'month' || every === 'year' ? every : null,
    ends: ends ? new Date(ends * 1000).toISOString() : null,
    cancelling: !!(sub.cancel_at_period_end || cancelAt),
    seats,
  };
}

// ---------------------------------------------------------------- V169: seats
export function seatPriceIds(env) {
  return [env('STRIPE_PRICE_SEAT_MONTH'), env('STRIPE_PRICE_SEAT_YEAR')].filter(Boolean);
}
export function seatPriceFor(env, every) {
  return env(every === 'year' ? 'STRIPE_PRICE_SEAT_YEAR' : 'STRIPE_PRICE_SEAT_MONTH') || '';
}

// 1A / 2A: how Stripe charges a change of seats. Monthly → the part-month goes
// on the next bill (and a credit when one is freed). Yearly → the part-year is
// charged that day ("if they join in month 10 it's pro rata for the 2 months"),
// a freed one credited. In a trial nothing is owed yet: the first bill counts
// the seats on the day.
export function seatProration(every, status) {
  if (status === 'trialing') return 'none';
  return every === 'year' ? 'always_invoice' : 'create_prorations';
}

// What to do to make Stripe's subscription carry `want` seats, at the seat
// price matching its base line's interval. Pure — tested with pretend data.
//   { act: 'none' } | { act: 'add', price, quantity } | { act: 'update', item, price?, quantity }
//   | { act: 'remove', item } — plus proration (seatProration).
export function seatPlan(sub, want, env) {
  const ids = seatPriceIds(env);
  const f = subscriptionFacts(sub, ids);
  const every = f.every || 'month';
  const price = seatPriceFor(env, every);
  const items = (sub && sub.items && Array.isArray(sub.items.data)) ? sub.items.data : [];
  const seat = items.find((it) => it && it.price && ids.includes(it.price.id));
  const n = Math.max(0, Math.floor(Number(want) || 0));
  const proration = seatProration(every, String(sub && sub.status || ''));
  if (!seat) {
    if (n === 0) return { act: 'none', every, proration };
    if (!price) return { act: 'unset', every, proration };
    return { act: 'add', price, quantity: n, every, proration };
  }
  if (n === 0) return { act: 'remove', item: seat.id, every, proration };
  const wrongPrice = !!price && seat.price.id !== price;   // the base switched interval without it
  if (!wrongPrice && Number(seat.quantity) === n) return { act: 'none', every, proration };
  const out = { act: 'update', item: seat.id, quantity: n, every, proration };
  if (wrongPrice) out.price = price;
  return out;
}

const _pounds = (p) => '£' + (p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2));

// The bill in words: "£6 + 3 × £3 = £15 a month".
export function seatBillWords(seats, every) {
  const e = every === 'year' ? 'year' : 'month';
  const n = Math.max(0, Number(seats) || 0);
  const base = PENCE.base[e], each = PENCE.seat[e];
  if (n === 0) return `${_pounds(base)} a ${e} (no paid seats)`;
  return `${_pounds(base)} + ${n} × ${_pounds(each)} = ${_pounds(base + n * each)} a ${e}`;
}

function _day(iso) {
  const ms = Date.parse(String(iso || '').replace(/(\.\d{3})\d+/, '$1'));
  if (!isFinite(ms)) return '';
  try { return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }); }
  catch { return new Date(ms).toISOString().slice(0, 10); }
}

// One change in words, e.g. "Sam added Jo as Engineer (+1 paid seat)".
export function seatChangeWords(c) {
  const who = String(c.person || '').trim() || 'Someone';
  const by = String(c.by_name || '').trim();
  const paid = (r) => r === 'engineer' || r === 'team_leader';
  const role = (r) => ROLE_WORDS[r] || 'member';
  const self = !!c.by_user && c.by_user === c.user_id;
  if (!paid(c.role_from) && paid(c.role_to)) {
    if (!c.role_from) return (self || !by ? `${who} joined as ${role(c.role_to)}` : `${by} added ${who} as ${role(c.role_to)}`) + ' (+1 paid seat)';
    return (by ? `${by} made ${who} ${role(c.role_to)}` : `${who} was made ${role(c.role_to)}`) + ' (+1 paid seat)';
  }
  if (!c.role_to) {
    if (self) return `${who} left (−1 paid seat)`;
    return (by ? `${by} removed ${who}` : `${who}’s account was closed`) + ' (−1 paid seat)';
  }
  return (by ? `${by} made ${who} ${role(c.role_to)}` : `${who} was made ${role(c.role_to)}`) + ' — Office is free (−1 paid seat)';
}

// 4B: the Owner's email about a run's changes. d: one row of billing_seats_due.
export function seatEmail(d, every, status) {
  const biz = String(d.name || '').trim() || 'your business';
  const e = every === 'year' ? 'year' : 'month';
  const changes = Array.isArray(d.changes) ? d.changes : [];
  const lines = changes.map((c) => `• ${_day(c.at)} — ${seatChangeWords(c)}`);
  const how = status === 'trialing'
    ? `You’re in your free trial: your first payment${_day(d.period_end) ? ' on ' + _day(d.period_end) : ''} counts the paid seats you have that day.`
    : e === 'year'
      ? 'You pay yearly: for a seat added, the rest of this year is charged today; for a seat freed, the unused part is credited to your next bill.'
      : 'You pay monthly: the part of this month for a seat added or freed is added to (or taken off) your next bill.';
  const hello = String(d.owner_name || '').trim();
  const text = [
    `Hello${hello ? ' ' + hello.split(/\s+/)[0] : ''},`,
    '',
    `The paid seats in ${biz} on PATGo have changed:`,
    '',
    ...lines,
    '',
    `Paid seats now: ${d.seats}. Engineers and Team leaders are ${_pounds(PENCE.seat[e])} a ${e} each; the Owner and Office are free.`,
    `Your PATGo plan: ${seatBillWords(d.seats, e)}.`,
    how,
    '',
    'You can see your seats any time in PATGo: Settings → Account & Sync → Business. Stripe’s receipts show every charge.',
    '',
    'If you didn’t expect this, check who’s in your business on that page — your Team leaders and Office can invite Engineers too.',
    '',
    '— PATGo',
  ].join('\n');
  return { subject: `PATGo: paid seats changed in ${biz}`, text };
}

export async function sendEmail(deps, to, msg) {
  const key = deps.env('RESEND_API_KEY');
  if (!key) return { ok: false, why: 'no email key' };
  if (!to) return { ok: false, why: 'no address', final: true };
  const res = await deps.fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({ from: deps.env('EMAIL_FROM') || DEFAULT_FROM, to: [to], subject: msg.subject, text: msg.text,
                           reply_to: 'hello@patgo.co.uk' }),
  });
  if (!res.ok) return { ok: false, why: 'email ' + res.status };
  return { ok: true };
}

// ---------------------------------------------------------------- the rules
// Why a business can't start a subscription now, or null if it can.
export function checkoutRefusal(ctx) {
  if (!ctx || !ctx.org_id) return { status: 404, error: 'No business found for this account.' };
  if (ctx.role !== 'owner') return { status: 403, error: 'Only your business’s owner can subscribe.' };
  if (ctx.plan === 'comped') return { status: 409, error: 'Your account is free — there’s nothing to pay.' };
  if (ctx.stripe_subscription && LIVE.includes(ctx.status)) {
    return { status: 409, error: 'You already have a plan. Use Manage billing to change it.', manage: true };
  }
  return null;
}

// The Stripe payment page's settings. 3A: subscribing during the trial keeps
// the rest of it — the first payment is taken the day the trial would end.
// V169 (4A): the seats on the day of subscribing go on as a second line.
export function checkoutParams(ctx, every, price, back, nowSeconds, seatPrice) {
  const seats = Math.max(0, Math.floor(Number(ctx.seats) || 0));
  const p = {
    mode: 'subscription',
    customer: ctx.stripe_customer,
    client_reference_id: ctx.org_id,
    line_items: seats > 0 && seatPrice ? [{ price, quantity: 1 }, { price: seatPrice, quantity: seats }] : [{ price, quantity: 1 }],
    allow_promotion_codes: 'true',            // founders' codes (V142 round, 2)
    locale: 'en-GB',
    success_url: back + '?result=paid',
    cancel_url: back + '?result=cancelled',
    metadata: { org_id: ctx.org_id, every },
    subscription_data: { metadata: { org_id: ctx.org_id } },
  };
  if (ctx.plan === 'trial' && ctx.trial_ends_at) {
    const end = Math.floor(Date.parse(String(ctx.trial_ends_at).replace(/(\.\d{3})\d+/, '$1')) / 1000);
    if (isFinite(end) && end - nowSeconds >= TRIAL_MIN_SECONDS) p.subscription_data.trial_end = end;
  }
  return p;
}

// The subscription a Stripe message is about, and the business if it says.
export function eventTarget(event) {
  const o = event && event.data && event.data.object || {};
  if (o.object === 'subscription') return { sub: o.id, org: (o.metadata && o.metadata.org_id) || null };
  if (o.object === 'checkout.session') {
    return { sub: typeof o.subscription === 'string' ? o.subscription : (o.subscription && o.subscription.id) || null,
             org: o.client_reference_id || (o.metadata && o.metadata.org_id) || null };
  }
  if (o.object === 'invoice') {
    const s = o.subscription || (o.parent && o.parent.subscription_details && o.parent.subscription_details.subscription);
    return { sub: typeof s === 'string' ? s : (s && s.id) || null, org: null };
  }
  return { sub: null, org: null };
}

// ---------------------------------------------------------------- the handlers
// deps: { env: (name) => string, fetch, now: () => ms }

async function readBody(req) {
  try { return await req.json(); } catch { return {}; }
}

export function makeCheckout(deps) {
  return async (req) => {
    const cors = corsHeaders(req, deps.env);
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405, cors);
    try {
      const user = await callerUser(req, deps);
      if (!user) return json({ error: 'Please sign in again.' }, 401, cors);
      const body = await readBody(req);
      const every = body.every === 'month' ? 'month' : body.every === 'year' ? 'year' : null;
      if (!every) return json({ error: 'Choose monthly or yearly.' }, 400, cors);
      const back = safeReturn(body.returnTo, deps.env);
      if (!back) return json({ error: 'This copy of the app can’t take payments.' }, 400, cors);
      const price = deps.env(every === 'year' ? 'STRIPE_PRICE_YEAR' : 'STRIPE_PRICE_MONTH');
      if (!price) return json({ error: 'Payments aren’t set up yet.' }, 503, cors);

      const ctx = await rpc(deps, 'billing_context', { u: user.id });
      const no = checkoutRefusal(ctx);
      if (no) return json({ error: no.error, manage: !!no.manage }, no.status, cors);
      const seatPrice = seatPriceFor(deps.env, every);
      if (Number(ctx.seats) > 0 && !seatPrice) return json({ error: 'Team seats aren’t set up yet.' }, 503, cors);

      if (!ctx.stripe_customer) {
        const made = await stripe(deps, 'POST', 'customers', {
          email: user.email || undefined,
          metadata: { org_id: ctx.org_id, user_id: user.id },
          preferred_locales: ['en-GB'],
        }, 'patgo-customer-' + ctx.org_id);
        ctx.stripe_customer = await rpc(deps, 'billing_set_customer', { o: ctx.org_id, cus: made.id }) || made.id;
      }
      const session = await stripe(deps, 'POST', 'checkout/sessions',
        checkoutParams(ctx, every, price, back, Math.floor(deps.now() / 1000), seatPrice));
      return json({ url: session.url }, 200, cors);
    } catch (e) {
      console.error('billing-checkout', e && e.message);
      return json({ error: 'Couldn’t reach the payment page. Try again in a moment.' }, 502, cors);
    }
  };
}

export function makePortal(deps) {
  return async (req) => {
    const cors = corsHeaders(req, deps.env);
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405, cors);
    try {
      const user = await callerUser(req, deps);
      if (!user) return json({ error: 'Please sign in again.' }, 401, cors);
      const body = await readBody(req);
      const back = safeReturn(body.returnTo, deps.env);
      if (!back) return json({ error: 'This copy of the app can’t take payments.' }, 400, cors);
      const ctx = await rpc(deps, 'billing_context', { u: user.id });
      if (!ctx || !ctx.org_id) return json({ error: 'No business found for this account.' }, 404, cors);
      if (ctx.role !== 'owner') return json({ error: 'Only your business’s owner can manage billing.' }, 403, cors);
      if (!ctx.stripe_customer) return json({ error: 'There’s no billing yet — subscribe first.' }, 409, cors);
      const params = { customer: ctx.stripe_customer, return_url: back + '?result=portal', locale: 'en-GB' };
      // 4A: "Update card" goes straight to the card form.
      if (body.flow === 'card') params.flow_data = { type: 'payment_method_update' };
      const session = await stripe(deps, 'POST', 'billing_portal/sessions', params);
      return json({ url: session.url }, 200, cors);
    } catch (e) {
      console.error('billing-portal', e && e.message);
      return json({ error: 'Couldn’t open the billing page. Try again in a moment.' }, 502, cors);
    }
  };
}

export function makeWebhook(deps) {
  return async (req) => {
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    const payload = await req.text();
    const ok = await verifySignature(payload, req.headers.get('stripe-signature'),
      deps.env('STRIPE_WEBHOOK_SECRET'), Math.floor(deps.now() / 1000));
    if (!ok) return json({ error: 'bad signature' }, 400);
    let event;
    try { event = JSON.parse(payload); } catch { return json({ error: 'bad payload' }, 400); }
    const target = eventTarget(event);
    if (!target.sub) return json({ received: true, result: 'ignored' });
    try {
      const sub = await stripe(deps, 'GET', 'subscriptions/' + encodeURIComponent(target.sub));
      const f = subscriptionFacts(sub, seatPriceIds(deps.env));
      const org = (sub.metadata && sub.metadata.org_id) || target.org || null;
      const cus = typeof sub.customer === 'string' ? sub.customer : (sub.customer && sub.customer.id) || null;
      const result = await rpc(deps, 'billing_apply', {
        o: org, cus, sub: sub.id, status: f.status, every: f.every, ends: f.ends, cancelling: f.cancelling,
      });
      // V169: what Stripe's subscription now carries — the seats function puts it
      // right if it isn't the database's count (a change made on Stripe's own site).
      if (/^plan /.test(String(result))) {
        await rpc(deps, 'billing_seats_record', { o: org, cus, n: LIVE.includes(f.status) ? f.seats : null });
      }
      await rpc(deps, 'billing_event_log', { eid: event.id, etype: event.type, o: org, outcome: String(result) });
      return json({ received: true, result });
    } catch (e) {
      console.error('stripe-webhook', event.id, e && e.message);
      return json({ error: 'try again' }, 500);   // Stripe retries
    }
  };
}

// V169 — billing-seats. Started by the phone that changed a seat (straight away)
// and by the database every 10 minutes while anything is owed (seats_nudge). It
// takes no orders from the caller: it only ever makes Stripe match the
// DATABASE's count and tells the Owner what the database wrote down, so being
// called too often, or by anyone, changes nothing (Deployed with "Verify JWT"
// OFF, like the webhook). Each business on its own: one that fails waits for the
// next run and never stops the others.
export async function seatsRun(deps) {
  const due = await rpc(deps, 'billing_seats_due', {});
  const out = [];
  for (const d of Array.isArray(due) ? due : []) {
    const r = { org: d.org_id, stripe: 'not billed', email: '' };
    try {
      let live = false, every = d.every, status = d.status;
      if (d.billable && d.subscription) {
        const sub = await stripe(deps, 'GET', 'subscriptions/' + encodeURIComponent(d.subscription));
        live = LIVE.includes(sub.status);
        status = sub.status;
        if (live) {
          const plan = seatPlan(sub, d.seats, deps.env);
          every = plan.every;
          const last = (d.changes || []).reduce((m, c) => Math.max(m, Number(c.id) || 0), 0);
          const key = `patgo-seats-${d.org_id}-${plan.act}-${d.seats}-${last}`;
          if (plan.act === 'unset') throw new Error('seat price not set');
          if (plan.act === 'add') {
            await stripe(deps, 'POST', 'subscription_items', { subscription: sub.id, price: plan.price,
              quantity: plan.quantity, proration_behavior: plan.proration }, key);
          } else if (plan.act === 'update') {
            await stripe(deps, 'POST', 'subscription_items/' + encodeURIComponent(plan.item),
              { quantity: plan.quantity, price: plan.price, proration_behavior: plan.proration }, key);
          } else if (plan.act === 'remove') {
            await stripe(deps, 'DELETE', 'subscription_items/' + encodeURIComponent(plan.item),
              { proration_behavior: plan.proration }, key);
          }
          r.stripe = plan.act === 'none' ? 'in step' : plan.act + ' ' + d.seats;
        }
        await rpc(deps, 'billing_seats_record', { o: d.org_id, cus: null, n: live ? d.seats : null });
      }
      const ids = (d.changes || []).map((c) => c.id);
      if (ids.length) {
        if (!live) {
          // 4A: free in the trial (and comped never pays) — nothing on a bill to tell.
          await rpc(deps, 'billing_seats_told', { o: d.org_id, ids, outcome: 'no bill' });
          r.email = 'no bill';
        } else {
          const claimed = await rpc(deps, 'billing_seats_told', { o: d.org_id, ids, outcome: 'sending' });
          const mine = Array.isArray(claimed) ? claimed.map(Number) : [];
          if (mine.length) {
            const msg = seatEmail(Object.assign({}, d, { changes: d.changes.filter((c) => mine.includes(Number(c.id))) }), every, status);
            let sent;
            try { sent = await sendEmail(deps, d.owner_email, msg); } catch (e) { sent = { ok: false, why: 'email failed' }; }
            await rpc(deps, 'billing_seats_result', { o: d.org_id, ids: mine,
              outcome: sent.ok ? 'sent' : sent.why, retry: !sent.ok && !sent.final });
            r.email = sent.ok ? 'sent' : sent.why;
          }
        }
      }
    } catch (e) {
      console.error('billing-seats', d.org_id, e && e.message);
      r.error = 'try again';
    }
    out.push(r);
  }
  return out;
}

export function makeSeats(deps) {
  return async (req) => {
    const cors = corsHeaders(req, deps.env);
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405, cors);
    try {
      const done = await seatsRun(deps);
      return json({ done: done.length, results: done.map((r) => ({ stripe: r.stripe, email: r.email, error: r.error })) }, 200, cors);
    } catch (e) {
      console.error('billing-seats', e && e.message);
      return json({ error: 'try again' }, 500, cors);
    }
  };
}

// V169 (3A) — billing-switch: monthly ↔ yearly from the app, the base and the
// seats together (Stripe's own billing page can't change a plan with two lines).
// At once, the unused time credited (always_invoice); in the trial nothing is
// owed yet, so nothing is charged. Only the Owner; never a cancelled plan
// (turn it back on first) — Stripe would carry the cancellation over anyway.
export function switchRefusal(ctx, every) {
  if (!ctx || !ctx.org_id) return { status: 404, error: 'No business found for this account.' };
  if (ctx.role !== 'owner') return { status: 403, error: 'Only your business’s owner can change the plan.' };
  if (ctx.plan === 'comped') return { status: 409, error: 'Your account is free — there’s nothing to change.' };
  if (!ctx.stripe_subscription || !LIVE.includes(ctx.status)) return { status: 409, error: 'There’s no plan to change — subscribe first.' };
  if (ctx.cancelling) return { status: 409, error: 'Your plan is set to end. Turn it back on in Manage billing first, then switch.' };
  if (ctx.every === every) return { status: 409, error: every === 'year' ? 'You’re already on yearly.' : 'You’re already on monthly.' };
  return null;
}

export function switchParams(sub, every, env) {
  const ids = seatPriceIds(env);
  const items = (sub && sub.items && Array.isArray(sub.items.data)) ? sub.items.data : [];
  const base = env(every === 'year' ? 'STRIPE_PRICE_YEAR' : 'STRIPE_PRICE_MONTH');
  const seat = seatPriceFor(env, every);
  return {
    items: items.map((it) => ({ id: it.id, price: it.price && ids.includes(it.price.id) ? seat : base })),
    proration_behavior: sub.status === 'trialing' ? 'none' : 'always_invoice',
    metadata: { org_id: (sub.metadata && sub.metadata.org_id) || undefined, switched_to: every },
  };
}

export function makeSwitch(deps) {
  return async (req) => {
    const cors = corsHeaders(req, deps.env);
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405, cors);
    try {
      const user = await callerUser(req, deps);
      if (!user) return json({ error: 'Please sign in again.' }, 401, cors);
      const body = await readBody(req);
      const every = body.every === 'month' ? 'month' : body.every === 'year' ? 'year' : null;
      if (!every) return json({ error: 'Choose monthly or yearly.' }, 400, cors);
      if (!deps.env(every === 'year' ? 'STRIPE_PRICE_YEAR' : 'STRIPE_PRICE_MONTH') || !seatPriceFor(deps.env, every)) {
        return json({ error: 'Payments aren’t set up yet.' }, 503, cors);
      }
      const ctx = await rpc(deps, 'billing_context', { u: user.id });
      const no = switchRefusal(ctx, every);
      if (no) return json({ error: no.error }, no.status, cors);
      const sub = await stripe(deps, 'GET', 'subscriptions/' + encodeURIComponent(ctx.stripe_subscription));
      if (!LIVE.includes(sub.status)) return json({ error: 'There’s no plan to change — subscribe first.' }, 409, cors);
      const now = await stripe(deps, 'POST', 'subscriptions/' + encodeURIComponent(sub.id), switchParams(sub, every, deps.env),
        `patgo-switch-${ctx.org_id}-${every}-${sub.items && sub.items.data && sub.items.data.map((i) => i.id + ':' + (i.price && i.price.id)).join(',')}`);
      // Stripe's answer is its latest word on the subscription — recorded now, so
      // the page shows it at once (the webhook says the same a moment later).
      const f = subscriptionFacts(now, seatPriceIds(deps.env));
      const cus = typeof now.customer === 'string' ? now.customer : (now.customer && now.customer.id) || null;
      await rpc(deps, 'billing_apply', { o: ctx.org_id, cus, sub: now.id, status: f.status, every: f.every,
        ends: f.ends, cancelling: f.cancelling });
      await rpc(deps, 'billing_seats_record', { o: ctx.org_id, cus: null, n: f.seats });
      return json({ ok: true, every: f.every }, 200, cors);
    } catch (e) {
      console.error('billing-switch', e && e.message);
      return json({ error: 'Couldn’t change your plan. Try again in a moment — nothing has changed.' }, 502, cors);
    }
  };
}

// The real thing, on Supabase.
export function denoDeps() {
  return { env: (k) => Deno.env.get(k), fetch: (...a) => fetch(...a), now: () => Date.now() };
}

// (c) 2026 Peter Birchley. All rights reserved.
