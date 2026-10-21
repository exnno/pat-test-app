// @ts-nocheck
// PATGo cloud — V142 — stripe-webhook, ONE FILE for the Supabase dashboard editor
// (the repo keeps it as functions/stripe-webhook/index.js + functions/_shared/billing.js — same code)
// Paste over everything in the editor's index.ts. Then turn "Enforce JWT verification" OFF.

// PATGo cloud — V142: paying — the shared part of the three server functions
// (c) 2026 Peter Birchley. All rights reserved.
//
// Runs on Supabase (Edge Functions, Deno). Plain JavaScript, no packages and no
// build step: Stripe and the database are reached with fetch, so every line
// that runs on the server is here to read. The app's harness (Node) imports
// this file and tests it with a pretend Stripe and a pretend database — nothing
// in it may touch Deno until a handler is actually called.
//
// THE THREE FUNCTIONS (each folder's index.js is one line that serves one of these):
//   billing-checkout  the app's Subscribe → a Stripe payment page for the business
//   billing-portal    the app's Manage billing / Update card → Stripe's billing page
//   stripe-webhook    Stripe telling us something changed → the business's plan
//
// SECRETS (Supabase → Edge Functions → Secrets — never in this file or the repo):
//   STRIPE_SECRET_KEY      sk_test_… now, sk_live_… at launch
//   STRIPE_WEBHOOK_SECRET  whsec_… from the webhook's page in Stripe
//   STRIPE_PRICE_MONTH     price_… for £6 a month
//   STRIPE_PRICE_YEAR      price_… for £60 a year
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
export function subscriptionFacts(sub) {
  const item = sub && sub.items && sub.items.data && sub.items.data[0] || {};
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
  };
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
export function checkoutParams(ctx, every, price, back, nowSeconds) {
  const p = {
    mode: 'subscription',
    customer: ctx.stripe_customer,
    client_reference_id: ctx.org_id,
    line_items: [{ price, quantity: 1 }],
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

      if (!ctx.stripe_customer) {
        const made = await stripe(deps, 'POST', 'customers', {
          email: user.email || undefined,
          metadata: { org_id: ctx.org_id, user_id: user.id },
          preferred_locales: ['en-GB'],
        }, 'patgo-customer-' + ctx.org_id);
        ctx.stripe_customer = await rpc(deps, 'billing_set_customer', { o: ctx.org_id, cus: made.id }) || made.id;
      }
      const session = await stripe(deps, 'POST', 'checkout/sessions',
        checkoutParams(ctx, every, price, back, Math.floor(deps.now() / 1000)));
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
      const f = subscriptionFacts(sub);
      const org = (sub.metadata && sub.metadata.org_id) || target.org || null;
      const cus = typeof sub.customer === 'string' ? sub.customer : (sub.customer && sub.customer.id) || null;
      const result = await rpc(deps, 'billing_apply', {
        o: org, cus, sub: sub.id, status: f.status, every: f.every, ends: f.ends, cancelling: f.cancelling,
      });
      await rpc(deps, 'billing_event_log', { eid: event.id, etype: event.type, o: org, outcome: String(result) });
      return json({ received: true, result });
    } catch (e) {
      console.error('stripe-webhook', event.id, e && e.message);
      return json({ error: 'try again' }, 500);   // Stripe retries
    }
  };
}

// The real thing, on Supabase.
export function denoDeps() {
  return { env: (k) => Deno.env.get(k), fetch: (...a) => fetch(...a), now: () => Date.now() };
}


Deno.serve(makeWebhook(denoDeps()));
