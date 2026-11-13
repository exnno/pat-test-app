/* (c) 2026 Peter Birchley. All rights reserved.
   harness/tests/97-v158.js — V158: a phone's jobs stay with their account (R68 1A 2A;
   the second GPT audit's finding 1, reproduced on V156 and V157 before the fix).

     97a  the owner is held in memory BEFORE it is saved: a failed save keeps it,
          returns false, and the save is retried at every sync check and at
          sign-out once there is room.
     97b  a phone with jobs whose owner can't be saved (full): the sign-in is
          refused (2A) — through the real sign-in taps, A then B on the same page,
          nothing sent, the login gone, no owner kept; with no jobs the sign-in
          stands, held in memory; then the restart.
     97c  ownership uncertain (V152 kept a copy of an unreadable owner or sync
          record, and no account can be named): nobody adopts the jobs (1A) — the
          landing refuses, the sync guard refuses; with no jobs the first sign-in
          adopts; with a readable sync record that account is the owner; the
          landing reads the sync record itself; a never-owned phone still adopted
          (8A); the restart.
     97d  V158's About line; cloud.js header (V159: the release checks → 98d).

   ⚠ WHAT THIS FILE CANNOT PROVE: a real iPhone's storage filling up (Safari's
   quota). The post-commit checklist covers what can be checked by hand. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { tick, freshApp, withSession, withItem, restoreFile } = require('../fixture');

const LIB  = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;
const DAY = 86400000;
const AUTH = 'patgo:cloudAuth:test';
const A = { id: '11111111-1111-1111-1111-111111111111', email: 'a@example.com' };
const B = { id: '22222222-2222-2222-2222-222222222222', email: 'b@example.com' };
const T3 = '2026-09-03T10:00:00.000Z';

const iso = (ms) => new Date(ms).toISOString();
function user(who, fresh) {
  const now = Date.now();
  const made = fresh ? now - 20000 : now - 200 * DAY;
  return { id: who.id, email: who.email, aud: 'authenticated', role: 'authenticated',
    created_at: iso(made), email_confirmed_at: iso(made), confirmed_at: iso(made),
    last_sign_in_at: iso(fresh ? now - 19000 : now - 1000),
    identities: [{ identity_id: 'ii-' + who.id, provider: 'email', identity_data: { email: who.email } }] };
}
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const jwt = (u) => b64u({ alg: 'HS256', typ: 'JWT' }) + '.' +
  b64u({ sub: u.id, email: u.email, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated', role: 'authenticated' }) + '.ZZSIGN';
const session = (u) => ({ access_token: jwt(u), token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'ZZREFRESH-' + u.id, user: u });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const storedFor = (who) => JSON.stringify(session(user(who)));

// A stand-in Supabase that knows WHO each request is from (the bearer token)
// and files every write under that account, as the real database does.
function fakeServer(who, over = {}) {
  const calls = [];
  const tables = { sessions: [], records: [] };
  const tokenOf = (init) => {
    let h = init.headers || {};
    try { h = new Headers(h); } catch { /* plain object */ }
    const a = (typeof h.get === 'function') ? h.get('Authorization') : (h.Authorization || h.authorization);
    const tok = String(a || '').replace(/^Bearer /, '');
    try { return JSON.parse(Buffer.from(tok.split('.')[1], 'base64').toString()).sub || ''; } catch { return ''; }
  };
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const p = u.split('?')[0].replace(/^https:\/\/[^/]+/, '');
    const method = init.method || 'GET';
    let body = null;
    try { body = init.body ? JSON.parse(init.body) : null; } catch { body = init.body; }
    const as = tokenOf(init);
    calls.push({ url: u, path: p, method, body, as });
    if (over[method + ' ' + p]) return over[method + ' ' + p](body, u);
    if (p === '/auth/v1/otp') return json({});
    if (p === '/auth/v1/verify') return json(session(who.user));
    if (p === '/auth/v1/token') return json(session(who.user));
    if (p === '/auth/v1/user') return json(who.user);
    if (p === '/auth/v1/logout') return new Response(null, { status: 204 });
    if (p.startsWith('/rest/v1/profiles')) return json([{ plan: 'trial', trial_ends_at: iso(Date.now() + 20 * DAY), lapsed_at: null }]);
    for (const name of ['sessions', 'records']) {
      if (p !== '/rest/v1/' + name) continue;
      const cloud = tables[name];
      if (method === 'GET') {
        const q = new URLSearchParams(u.split('?')[1] || '');
        let rows = cloud.filter(r => r.user_id === as);
        const id = q.get('id');
        if (id && id.startsWith('eq.')) rows = rows.filter(r => String(r.id) === id.slice(3));
        if (id && id.startsWith('in.(')) { const set = id.slice(4, -1).split(',').map(s => s.replace(/^"|"$/g, '')); rows = rows.filter(r => set.includes(String(r.id))); }
        const gt = q.get('updated_at');
        if (gt && gt.startsWith('gt.')) rows = rows.filter(r => r.updated_at > gt.slice(3));
        const lim = parseInt(q.get('limit') || '0', 10);
        if (lim > 0) rows = rows.slice(0, lim);
        return json(rows);
      }
      for (const row of (Array.isArray(body) ? body : [])) {
        const stored = Object.assign({}, row, { user_id: as, updated_at: T3 });   // filed under the TOKEN's account
        const i = cloud.findIndex(r => r.user_id === as && String(r.id) === String(row.id));
        if (i === -1) cloud.push(stored); else cloud[i] = stored;
      }
      return new Response(null, { status: 201 });
    }
    if (p.startsWith('/rest/v1/') || p.startsWith('/storage/v1/')) return method === 'GET' ? json([]) : new Response(null, { status: 201 });
    return json({ message: 'unexpected ' + u }, 404);
  };
  const restAs = (id) => calls.filter(c => c.path.startsWith('/rest/v1/') && c.as === id);
  const sentJobs = (id) => tables.sessions.filter(r => r.user_id === id && !r.deleted).map(r => String(r.id));
  return { calls, fetchImpl, tables, restAs, sentJobs, over };
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
function tap(app, action, arg) {
  const el = app.doc.createElement('button');
  el.dataset.action = action;
  if (arg !== undefined) el.dataset.arg = String(arg);
  app.doc.getElementById('app').dispatchEvent({
    type: 'click', target: el, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
  });
}
function account(app) { app.state().view = 'cloudAccount'; app.fn('render')(); }
const sheets = (app) => app.doc.body.children.filter(c => c && /bulk-sheet/.test(c.className || ''));
const owner = (app) => JSON.parse(app.storage.getItem('pat:owner') || 'null');
const idle = (app) => app.run('_syncRunning === null && _syncTimer === null') && !app.state().sync.busy && !app.state().cloud.busy;
const stopTimers = (app) => app.run('if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }');

// A phone, signed out, with the library against `srv`. who.user is whoever the
// server signs in next.
function phone(ls) {
  const who = { user: user(A) };
  const app = bootApp({ localStorage: ls || {} });
  app.state = () => app.refresh('state').state;
  app.storage.setItem('pat:cloudUnlocked', '1');
  app.who = who;
  app.srv = fakeServer(who);
  installLibrary(app, app.srv.fetchImpl);
  return app;
}
async function signIn(app, who) {
  app.who.user = user(who);
  account(app);
  app.doc.getElementById('cloud-email').value = who.email;
  app.doc.getElementById('cloud-password').value = 'pass1234';
  tap(app, 'cloud-password-sign-in');
  await until(() => !app.state().cloud.busy && app.state().cloud.status !== 'signed-out' || !!app.state().cloud.message);
  await tick(30);
  await until(() => idle(app));
  await tick(20);
}
// The next start-up of this phone, offline — boot.js runs once, as on a phone.
function restart(app) {
  const next = bootApp({ localStorage: app.storage._snapshot(), navigator: { onLine: false } });
  next.state = () => next.refresh('state').state;
  return next;
}
async function syncNow(app) {
  stopTimers(app);
  await app.fn('syncWhenIdle')(() => app.fn('syncPush')({ pull: true }));
  await until(() => idle(app));
}
// A's phone: signed in as A, one job logged and SENT, then signed out.
async function aSynced() {
  const app = phone();
  await until(() => app.state().photoMetaReady === true);
  await signIn(app, A);
  const job = withSession(app, { client: 'ZZ Owner Client' });
  withItem(app, { assetNo: 'ZZA-1' });
  await syncNow(app);
  app.jobA = String(job.id);
  await app.fn('cloudSignOut')();
  stopTimers(app);
  return app;
}

// V158: the phone's storage refuses the owner record (as a full phone does).
function fullForOwner(app) {
  const real = app.storage.setItem.bind(app.storage);
  app.storage.setItem = (k, v) => { if (k === 'pat:owner') throw new Error('QuotaExceededError'); return real(k, v); };
  return () => { app.storage.setItem = real; };
}
const memo = (app) => app.run('_cloudOwnerMemo === undefined ? "unread" : JSON.stringify(_cloudOwnerMemo)');
const KEPT = 'pat:unreadable:pat:owner';

module.exports = async function () {
  /* ------------------------------------------------------------------ 97a */
  await t.group('97a — the owner is held in memory before it is saved; the save retried when there is room', async () => {
    const app = freshApp({ navigator: { onLine: false } });
    const room = fullForOwner(app);
    t.eq(app.fn('cloudOwnerSet')(A.id, A.email), false, 'a save that fails says so');
    t.eq(owner(app), null, '…nothing stored');
    t.eq(app.fn('cloudOwner')() && app.fn('cloudOwner')().id, A.id, '…but the owner is held in memory (THE audit’s finding: it was lost)');
    t.notOk(app.fn('cloudOwnerAllows')(B.id), 'so another account may not sync this phone');
    t.ok(app.fn('cloudOwnerAllows')(A.id), '…the owner may');
    room();
    t.eq(owner(app), null, 'room again — not saved until something checks');
    app.fn('cloudOwnerAllows')(A.id);
    t.eq(owner(app) && owner(app).id, A.id, 'the next sync check saves it');
    t.eq(app.run('_cloudOwnerUnsaved'), false, '…and stops retrying');
    // Sign-out retries too (offline: no sync run to do it).
    const so = freshApp({ localStorage: { [AUTH]: storedFor(A) }, navigator: { onLine: false } });
    so.storage.removeItem('pat:owner');
    const r2 = fullForOwner(so);
    so.fn('cloudOwnerSet')(A.id, A.email);
    r2();
    so.state().cloud.status = 'signed-in';
    so.state().cloud.busy = false;
    await so.fn('cloudSignOutAsk')();
    t.eq(owner(so) && owner(so).id, A.id, 'Sign out saves a held owner before the login goes');
    // Clearing still clears.
    t.eq(so.fn('cloudOwnerSet')('', ''), false, 'an empty id clears');
    t.eq(memo(so), 'unread', '…memory too');
  });

  /* ------------------------------------------------------------------ 97b */
  await t.group('97b — owner can’t be saved: with jobs the sign-in is refused (2A), A then B, nothing sent; no jobs → held in memory; the restart', async () => {
    const app = phone();
    await until(() => app.state().photoMetaReady === true);
    withSession(app, { client: 'ZZ Free Client' });
    withItem(app, { assetNo: 'ZZF-1' });
    stopTimers(app);
    const jobs = JSON.stringify(app.state().sessions);
    const room = fullForOwner(app);
    await signIn(app, A);
    t.eq(app.state().cloud.status, 'signed-out', '2A: A is signed straight back out');
    t.eq(app.storage.getItem(AUTH), null, '…A’s login is gone from the phone');
    t.includes(app.state().cloud.message, 'storage for PATGo is full, so it can’t record which account its jobs belong to', '…told why');
    t.includes(app.state().cloud.message, 'Your jobs are safe here and you can keep working. Back up, then clear old jobs to make room, and sign in again.', '…and what to do');
    t.eq(app.fn('cloudOwner')(), null, 'the refused account is not kept as the owner');
    t.eq(app.srv.restAs(A.id).length, 0, 'nothing read or sent as A');
    await signIn(app, B);
    t.eq(app.state().cloud.status, 'signed-out', 'then B, same page: refused too (the audit’s A → B)');
    t.eq(app.srv.sentJobs(B.id).length + app.srv.restAs(B.id).length, 0, '…nothing read or sent as B');
    t.eq(JSON.stringify(app.state().sessions), jobs, 'the jobs are intact on the phone');
    // The restart: nobody adopted it, no login kept.
    const next = restart(app);
    t.eq(next.state().cloud.status, 'signed-out', 'restart: signed out');
    t.eq(owner(next), null, '…no owner was ever recorded');
    // Room again: the first sign-in adopts it, saved (8A, as always).
    room();
    await signIn(app, A);
    t.eq(app.state().cloud.status, 'signed-in', 'room again: A signs in');
    t.eq(owner(app) && owner(app).id, A.id, '…and the owner is saved');
    stopTimers(app);

    // No jobs: nothing to hand over — the sign-in stands, the owner held in memory.
    const empty = phone();
    await until(() => empty.state().photoMetaReady === true);
    const room2 = fullForOwner(empty);
    await signIn(empty, A);
    t.eq(empty.state().cloud.status, 'signed-in', 'no jobs: A’s sign-in stands');
    t.eq(owner(empty), null, '…not saved (full)');
    t.eq(empty.fn('cloudOwner')() && empty.fn('cloudOwner')().id, A.id, '…held in memory');
    t.notOk(empty.fn('cloudOwnerAllows')(B.id), '…so B may not sync this phone');
    stopTimers(empty);
    room2();
    const back = restart(empty);
    t.eq(owner(back) && owner(back).id, A.id, 'restart with room: the stored login makes A the owner (V145 first run)');
  });

  /* ------------------------------------------------------------------ 97c */
  await t.group('97c — ownership uncertain: nobody adopts the jobs (1A); no jobs → adopted; a sync record names the owner; 8A still', async () => {
    // An unreadable owner record, never synced, a job on the phone.
    const ls = { 'pat:owner': '{not json' };
    const app = phone(ls);
    await until(() => app.state().photoMetaReady === true);
    t.ok(app.storage.getItem(KEPT) !== null, 'V152 kept a copy of the unreadable owner record');
    t.eq(app.fn('cloudOwner')(), null, '…so there is no owner to read');
    withSession(app, { client: 'ZZ Whose Client' });
    withItem(app, { assetNo: 'ZZW-1' });
    stopTimers(app);
    t.ok(app.fn('_cloudOwnerUncertain')(), 'uncertain: it had an owner nobody can name');
    t.notOk(app.fn('cloudOwnerAllows')(A.id), 'the sync guard lets nobody sync it');
    t.notOk(app.fn('cloudOwnerAllows')(B.id), '…anybody');
    await signIn(app, B);
    t.eq(app.state().cloud.status, 'signed-out', '1A: B is refused');
    t.includes(app.state().cloud.message, 'PATGo can’t tell which account this phone’s jobs belong to', '…told why');
    t.includes(app.state().cloud.message, 'save a backup, then Reset this phone (Everything, as new)', '…and the way out');
    t.eq(app.storage.getItem(AUTH), null, '…the login gone');
    t.eq(app.srv.sentJobs(B.id).length + app.srv.restAs(B.id).length, 0, '…nothing read or sent');
    t.eq(app.fn('cloudOwner')(), null, 'still nobody’s');
    const next = restart(app);
    t.ok(next.fn('_cloudOwnerUncertain')(), 'restart: still uncertain (the kept copy stays until Delete)');
    t.notOk(next.fn('cloudOwnerAllows')(B.id), '…still nobody may sync it');

    // The same, but no jobs: nothing to protect — the first sign-in adopts it.
    const bare = phone({ 'pat:owner': '{not json' });
    await until(() => bare.state().photoMetaReady === true);
    await signIn(bare, B);
    t.eq(bare.state().cloud.status, 'signed-in', 'uncertain, no jobs: B’s sign-in stands');
    t.eq(owner(bare) && owner(bare).id, B.id, '…and B owns it now');
    stopTimers(bare);

    // An unreadable owner record, but a readable sync record: that account is the owner.
    const synced = freshApp({ localStorage: { 'pat:owner': '{not json', 'pat:syncState': JSON.stringify({ userId: A.id, sent: {} }) }, navigator: { onLine: false } });
    t.eq(owner(synced) && owner(synced).id, A.id, 'a readable sync record: the account it last sent to owns it');
    t.notOk(synced.fn('_cloudOwnerUncertain')(), '…not uncertain');
    // The landing reads the sync record itself (not only at start).
    const land = freshApp({ localStorage: { 'pat:syncState': JSON.stringify({ userId: A.id, sent: {} }) }, navigator: { onLine: false } });
    land.storage.removeItem('pat:owner');
    land.run('_cloudOwnerMemo = undefined');
    withSession(land, { client: 'ZZ Land Client' });
    t.eq(land.fn('_cloudOwnerLanding')({ id: B.id, email: B.email }, B.email), false, 'the landing: no owner record, sync record A → B is not adopted');
    t.eq(land.fn('cloudOwner')() && land.fn('cloudOwner')().id, A.id, '…A is the owner');

    // Never owned (no kept copy, no sync record): the first sign-in adopts, jobs and all (8A).
    const free = freshApp({ navigator: { onLine: false } });
    withSession(free, { client: 'ZZ Free Client' });
    t.notOk(free.fn('_cloudOwnerUncertain')(), 'never owned: not uncertain');
    t.eq(free.fn('_cloudOwnerLanding')({ id: B.id, email: B.email }, B.email), true, '8A: the first sign-in adopts it');
    t.eq(owner(free) && owner(free).id, B.id, '…saved');
  });

  /* ------------------------------------------------------------------ 97d */
  // V159: the release checks moved to 98d; this keeps V158's own About line.
  await t.group('97d — V158’s About line; cloud.js header', () => {
    const help = read('render-help.js');
    // V161: V158's About line rolled off (100f checks it's gone).
    t.includes(read('cloud.js'), 'V158: an owner never lost', 'cloud.js header names V158');
  });
};
