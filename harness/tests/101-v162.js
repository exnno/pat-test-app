/* Standing test — V162: one owner decision at sign-in AND start; the signed-out refusal parses (the third GPT audit, findings 1 and 2)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

     101a  THE START (finding 1). Each case is a real phone start (boot.js runs
           once, offline) on storage built through the real app: a job logged,
           then the owner record damaged or removed, a sync record, another
           account's saved login (a takeover question the app closed on).
             1. A's jobs, owner record damaged, A's sync record, B's login →
                A is the owner, B is signed out, B may not sync, jobs intact.
             2. jobs, owner record damaged, no sync record, B's login → nobody
                adopts (uncertain): B signed out, told why, nobody may sync.
             3. owner record missing, A's sync record, B's login → A, as 1.
             4. the owner record can't be saved at the start, jobs here, B's
                login → B is not adopted (V158 2A at the start too).
             5. the right owner restarting — and A restarting after its owner
                record was damaged — stays signed in, may sync.
             6. a phone that never had an owner: the saved login adopts it
                (8A) — with jobs, and with none; and a full phone with no jobs.
           Then THE SAME QUESTION at the sign-in landing, on the same storage,
           gets the same answer in every case (101a's last part): the one
           decision (_cloudOwnerResolve) can't drift between the two again.
     101b  offline work is never walled off: where an account is required
           (the launch wall), a phone whose jobs are held from every account
           (cases 2 and 4) opens on its Jobs list, its jobs workable; a phone
           that never had an owner is still walled (V148 3A, unchanged).
     101c  THE HTTP BOUNDARY (finding 2). The refusal the SHIPPED SQL raises
           (schema.sql's own text, built as Postgres builds it), turned into an
           HTTP answer by a line-for-line port of PostgREST's own parser
           (harness/pgrst-raise.js), sent through the REAL library and the real
           _cloudFetch: a live sign-in, then revoked while its access token is
           still unexpired → 401 patgo_signed_out → this phone signs out, says
           why, keeps its jobs and owner. V161's text through the same boundary
           → 500 PGRST121, and the phone does NOT sign out (the audit's
           reproduction, kept as the guard). An ordinary 401, and the refusal
           for an older token after signing in again, sign nobody out.
     101e  the SQL: schema.sql, v161-signed-out.sql and v162-signed-out-fix.sql
           carry the same function; all three parse to 401 patgo_signed_out;
           the corrective migration's checks; the port itself against
           PostgREST's own wording.
     101f  release: V162; cache pat-v162; What's new NOT rolled (a fix release);
           About V162 / V161 / V160; cloud.js header.

   ⚠ WHAT THIS FILE CANNOT PROVE: the hosted PostgREST and Auth. 101c crosses a
   ported parser, not the server: at V162 the port and the SQL were checked
   against a real Postgres (PGlite 0.5.16 — the bytes match), the corrective
   migration run three times there, and its S3 seen to FAIL on V161's detail.
   The live check is the handoff's real-token test on the test project. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { freshApp, withSession, withItem, tick } = require('../fixture');
const P    = require('../pgrst-raise');

const LIB  = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const AUTH = 'patgo:cloudAuth:test';
const A = { id: '11111111-1111-1111-1111-111111111111', email: 'a@example.com' };
const B = { id: '22222222-2222-2222-2222-222222222222', email: 'b@example.com' };
const KEPT = 'pat:unreadable:pat:owner';
const SIGNED_OUT_WORDS = 'This phone was signed out from another device. Your jobs are safe here — sign in again to send them.';
const UNCERTAIN = 'PATGo can’t tell which account this phone’s jobs belong to';
const FULL = 'storage for PATGo is full, so it can’t record which account its jobs belong to';

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const jwt = (who, sid) => b64u({ alg: 'HS256', typ: 'JWT' }) + '.' +
  b64u({ sub: who.id, email: who.email, session_id: sid || 'ses-' + who.id, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated', role: 'authenticated' }) + '.ZZSIGN';
// A saved login, its access token still an hour from running out.
const login = (who, token) => JSON.stringify({ access_token: token || jwt(who), token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'ZZREFRESH-' + who.id,
  user: { id: who.id, email: who.email, aud: 'authenticated', role: 'authenticated' } });
const syncRec = (who) => JSON.stringify({ userId: who.id, sent: {} });
const owner = (app) => { try { return JSON.parse(app.storage.getItem('pat:owner') || 'null'); } catch { return 'unreadable'; } };
const jobsOf = (app) => JSON.stringify(app.refresh('state').state.sessions.map(s => [s.id, s.client, (s.items || []).map(i => i.assetNo)]));

// Storage holding one real job (built through the app), then changed by `mut`.
function storageWithJob(mut) {
  const base = freshApp({ navigator: { onLine: false } });
  withSession(base, { client: 'ZZ A Client' });
  withItem(base, { assetNo: 'ZZA-1' });
  const ls = base.storage._snapshot();
  const jobs = jobsOf(base);
  if (mut) mut(ls);
  return { ls, jobs };
}
// A real start: boot.js runs once, offline. fullOwner: the owner record can't be saved.
function start(ls, o = {}) {
  const app = bootApp({ localStorage: ls, navigator: { onLine: false }, runBoot: false, search: o.search || '' });
  if (o.fullOwner) {
    const real = app.storage.setItem.bind(app.storage);
    app.storage.setItem = (k, v) => { if (k === 'pat:owner') throw new Error('QuotaExceededError'); return real(k, v); };
  }
  app.run(read('boot.js'));
  app.state = () => app.refresh('state').state;
  app.run('if (typeof _syncTimer !== "undefined" && _syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }');
  return app;
}
const ownerId = (app) => { const o = app.fn('cloudOwner')(); return o ? o.id : null; };
const allows = (app, who) => app.fn('cloudOwnerAllows')(who.id);

// The sign-in landing asked on the same storage (no login stored), offline.
function landingVerdict(ls, who, o = {}) {
  const copy = Object.assign({}, ls); delete copy[AUTH];
  const app = start(copy, o);
  const ok = app.fn('_cloudOwnerLanding')({ id: who.id, email: who.email }, who.email);
  return { ok, owner: ownerId(app), allows: allows(app, who) };
}

// ---- 101c: a signed-in phone, the real library against a server that answers
// the Data API through the PostgREST port.
function fakeServer(raise) {
  const srv = { calls: [], gone: false, plain401: false, raise };
  srv.fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const h = init.headers;
    const auth = h && typeof h.get === 'function' ? h.get('Authorization') : (h && (h.Authorization || h.authorization)) || '';
    srv.calls.push({ url: u, auth });
    if (u.includes('/auth/v1/logout')) return new Response(null, { status: 204 });
    if (u.includes('/rest/v1/')) {
      // PostgREST runs the pre-request first: a gone sign-in → the SQL's RAISE.
      if (srv.gone) return P.pgrstRaiseFetchResponse(srv.raise.message, srv.raise.detail);
      if (srv.plain401) return new Response(JSON.stringify({ code: 'PGRST303', message: 'JWT expired', details: null, hint: null }), { status: 401, headers: { 'content-type': 'application/json' } });
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 404 });
  };
  return srv;
}
async function signedIn(raise) {
  const { ls } = storageWithJob((s) => {
    s[AUTH] = login(A); s['pat:cloudUnlocked'] = '1';
    s['pat:owner'] = JSON.stringify({ id: A.id, email: A.email, at: 1 });
    s['pat:syncState'] = syncRec(A);
  });
  const app = bootApp({ localStorage: ls, navigator: { onLine: false } });
  app.state = () => app.refresh('state').state;
  const srv = fakeServer(raise);
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
const status = (app) => app.run('state.cloud.status');
const rpc = (app) => app.run(`cloudClient().then(c => c.rpc('my_businesses')).then(r => JSON.stringify({ status: r.status, code: r.error && r.error.code }))`);

module.exports = async function () {
  /* ------------------------------------------------------------------ 101a */
  const cases = [];
  await t.group('101a — the start asks the sign-in’s own question: the sync record first, nobody adopts uncertain or unsaveable jobs, the right owner and a new phone as ever', () => {
    // 1. A's jobs, owner damaged, A's sync record, B's saved login.
    const c1 = storageWithJob((ls) => { ls['pat:owner'] = '{not json'; ls['pat:syncState'] = syncRec(A); ls[AUTH] = login(B); });
    const p1 = start(c1.ls);
    t.ok(p1.storage.getItem(KEPT) !== null, '1: the damaged owner record was set aside (V152)');
    t.eq(ownerId(p1), A.id, '1: A — the account it last synced as — is the owner (THE audit’s finding: it was B)');
    t.eq(status(p1), 'signed-out', '1: B’s saved login does not stand');
    t.eq(p1.storage.getItem(AUTH), null, '…and is gone from the phone');
    t.includes(p1.run('state.cloud.message'), 'this phone belongs to', '…told whose phone it is');
    t.notOk(allows(p1, B), '1: B may not sync it');
    t.ok(allows(p1, A), '…A may');
    t.eq(jobsOf(p1), c1.jobs, '1: the jobs are intact');
    cases.push(['1', c1.ls, {}, B]);

    // 2. jobs, owner damaged, NO sync record, B's saved login: uncertain.
    const c2 = storageWithJob((ls) => { ls['pat:owner'] = '{not json'; delete ls['pat:syncState']; ls[AUTH] = login(B); });
    const p2 = start(c2.ls);
    t.eq(ownerId(p2), null, '2: nobody is the owner — nobody can be named');
    t.eq(status(p2), 'signed-out', '2: B is not adopted (it was, the audit’s second reproduction)');
    t.eq(p2.storage.getItem(AUTH), null, '…B’s login gone');
    t.includes(p2.run('state.cloud.message'), UNCERTAIN, '…told why');
    t.notOk(allows(p2, B), '2: B may not sync');
    t.notOk(allows(p2, A), '…nor anybody');
    t.eq(owner(p2), null, '2: no owner record written');
    t.eq(jobsOf(p2), c2.jobs, '2: the jobs are intact');
    cases.push(['2', c2.ls, {}, B]);

    // 3. owner record MISSING (not damaged), A's sync record, B's saved login.
    const c3 = storageWithJob((ls) => { delete ls['pat:owner']; ls['pat:syncState'] = syncRec(A); ls[AUTH] = login(B); });
    const p3 = start(c3.ls);
    t.eq(ownerId(p3), A.id, '3: missing record — A from the sync record');
    t.eq(owner(p3) && owner(p3).id, A.id, '…and saved again');
    t.eq(status(p3), 'signed-out', '3: B is signed out');
    t.notOk(allows(p3, B), '3: B may not sync');
    t.eq(jobsOf(p3), c3.jobs, '3: the jobs are intact');
    cases.push(['3', c3.ls, {}, B]);

    // 4. the owner record can't be saved at the start; jobs; no owner, no sync record.
    const c4 = storageWithJob((ls) => { delete ls['pat:owner']; delete ls['pat:syncState']; ls[AUTH] = login(B); });
    const p4 = start(c4.ls, { fullOwner: true });
    t.eq(ownerId(p4), null, '4: B is not adopted on an owner held only in memory (V158 2A, now at the start)');
    t.eq(status(p4), 'signed-out', '4: B signed out');
    t.eq(p4.storage.getItem(AUTH), null, '…B’s login gone, so the next start can’t adopt either');
    t.includes(p4.run('state.cloud.message'), FULL, '…told why');
    t.notOk(allows(p4, B), '4: B may not sync');
    t.notOk(allows(p4, A), '…nor anybody, this run');
    t.eq(jobsOf(p4), c4.jobs, '4: the jobs are intact');
    const p4b = start(p4.storage._snapshot());
    t.eq(status(p4b), 'signed-out', '4: the next start (room again): still signed out, nobody adopted');
    t.eq(ownerId(p4b), null, '…no owner');
    cases.push(['4', c4.ls, { fullOwner: true }, B]);

    // 5. the right owner restarts; and A restarts after its own record was damaged.
    const c5 = storageWithJob((ls) => { ls['pat:owner'] = JSON.stringify({ id: A.id, email: A.email, at: 1 }); ls['pat:syncState'] = syncRec(A); ls[AUTH] = login(A); });
    const p5 = start(c5.ls);
    t.eq(status(p5), 'signed-in', '5: the owner restarting stays signed in (offline)');
    t.eq(ownerId(p5), A.id, '…A');
    t.ok(allows(p5, A), '…and may sync');
    t.ok(p5.storage.getItem(AUTH) !== null, '…its login kept');
    t.eq(jobsOf(p5), c5.jobs, '5: the jobs are intact');
    cases.push(['5', c5.ls, {}, A]);
    const c5b = storageWithJob((ls) => { ls['pat:owner'] = '{not json'; ls['pat:syncState'] = syncRec(A); ls[AUTH] = login(A); });
    const p5b = start(c5b.ls);
    t.eq(status(p5b), 'signed-in', '5: A, its owner record damaged but its sync record readable: still signed in');
    t.eq(ownerId(p5b), A.id, '…A recovered as the owner');
    t.ok(allows(p5b, A), '…may sync');
    cases.push(['5b', c5b.ls, {}, A]);

    // 6. never owned: the saved login adopts it (8A), jobs and all.
    const c6 = storageWithJob((ls) => { delete ls['pat:owner']; delete ls['pat:syncState']; ls[AUTH] = login(B); });
    const p6 = start(c6.ls);
    t.notOk(p6.fn('_cloudOwnerUncertain')(), '6: never owned — not uncertain');
    t.eq(status(p6), 'signed-in', '6: first-time adoption still works');
    t.eq(owner(p6) && owner(p6).id, B.id, '…B is the owner, saved');
    t.ok(allows(p6, B), '…and may sync');
    t.eq(jobsOf(p6), c6.jobs, '6: the jobs are intact');
    cases.push(['6', c6.ls, {}, B]);
    // No jobs, owner unreadable: nothing to protect — adopted (V158, unchanged).
    const e = freshApp({ navigator: { onLine: false } }).storage._snapshot();
    e['pat:owner'] = '{not json'; e[AUTH] = login(B);
    const p6b = start(e);
    t.eq(status(p6b), 'signed-in', '6: no jobs, record unreadable: B’s login stands');
    t.eq(ownerId(p6b), B.id, '…B owns it');
    // No jobs, can't be saved: held in memory, the login stands (V158, unchanged).
    const f = freshApp({ navigator: { onLine: false } }).storage._snapshot();
    f[AUTH] = login(B);
    const p6c = start(f, { fullOwner: true });
    t.eq(status(p6c), 'signed-in', '6: no jobs, owner can’t be saved: the login stands');
    t.eq(ownerId(p6c), B.id, '…held in memory');
    t.notOk(allows(p6c, A), '…so nobody else may sync');
  });

  await t.group('101a — the landing and the start give the same answer, case for case (one decision, no drift)', () => {
    for (const [name, ls, o, who] of cases) {
      const atStart = start(ls, o);
      const startOk = status(atStart) === 'signed-in';
      const land = landingVerdict(ls, who, o);
      t.eq(land.ok, startOk, `case ${name}: the landing ${startOk ? 'lets in' : 'refuses'} ${who === A ? 'A' : 'B'}, as the start did`);
      t.eq(land.owner, ownerId(atStart), `case ${name}: …the same owner`);
      t.eq(land.allows, allows(atStart, who), `case ${name}: …the same sync verdict`);
    }
    // The start no longer adopts by itself: it goes through the shared decision.
    const src = read('cloud.js');
    const fr = src.slice(src.indexOf('function _cloudOwnerFirstRun('), src.indexOf('// ---- boot ----'));
    t.includes(fr, '_cloudOwnerResolve(stored.id', 'the start asks _cloudOwnerResolve');
    t.excludes(fr, 'cloudOwnerSet(', 'the start never sets an owner itself');
    const land = src.slice(src.indexOf('function _cloudOwnerLanding('), src.indexOf('function _cloudOwnerRefuse('));
    t.includes(land, '_cloudOwnerResolve(uid, addr)', 'the landing asks it too');
  });

  /* ------------------------------------------------------------------ 101b */
  await t.group('101b — held jobs are never walled off; a never-owned phone still is', () => {
    const html = (app) => { app.state().view = 'sessions'; app.fn('render')(); return app.doc.getElementById('app').innerHTML; };
    const walled = (h) => h.indexOf('id="account-wall"') !== -1;
    const c2 = storageWithJob((ls) => { ls['pat:owner'] = '{not json'; delete ls['pat:syncState']; ls[AUTH] = login(B); });
    const p2 = start(c2.ls, { search: '?wall' });
    t.ok(p2.fn('cloudWallOn')(), 'an account is required here');
    t.notOk(p2.fn('cloudWallShows')(), 'case 2 (uncertain, jobs): no wall');
    t.ok(p2.fn('cloudOwnerHeld')(), '…the jobs are held from every account');
    const h2 = html(p2);
    t.notOk(walled(h2), '…the Jobs list draws');
    t.includes(h2, 'ZZ A Client', '…with the job on it, workable offline');
    const again = start(p2.storage._snapshot(), { search: '?wall' });
    t.notOk(again.fn('cloudWallShows')(), 'case 2, the next start: still no wall (it rests on the kept copy, not memory)');
    const c4 = storageWithJob((ls) => { delete ls['pat:owner']; delete ls['pat:syncState']; ls[AUTH] = login(B); });
    const p4 = start(c4.ls, { fullOwner: true, search: '?wall' });
    t.notOk(p4.fn('cloudWallShows')(), 'case 4 (owner can’t be saved, jobs): no wall this run');
    t.includes(html(p4), 'ZZ A Client', '…the job reachable');
    // V148 3A unchanged: an old install with jobs and no owner, nothing refused.
    const old = storageWithJob((ls) => { delete ls['pat:owner']; delete ls['pat:syncState']; });
    const po = start(old.ls, { search: '?wall' });
    t.ok(po.fn('cloudWallShows')(), 'a never-owned phone with jobs is still walled (V148 3A)');
    t.notOk(po.fn('cloudOwnerHeld')(), '…its jobs are not held');
  });

  /* ------------------------------------------------------------------ 101c */
  const shipped = P.pgrstRaiseOf(read('supabase/schema.sql'), 'patgo_check_request');
  const v161 = { message: shipped.message, detail: P.sqlJsonText("json_build_object('status', 401)::text") };
  await t.group('101c — the HTTP boundary: the shipped SQL’s refusal, through PostgREST’s parser, the real library and _cloudFetch', async () => {
    // A live sign-in, its access token an hour from running out.
    const app = await signedIn(shipped);
    for (let k = 0; k < 100 && status(app) !== 'signed-in'; k++) await tick(10);
    t.eq(status(app), 'signed-in', 'a valid sign-in to start');
    t.eq(JSON.parse(await rpc(app)).status, 200, 'its Data API request goes through');
    const jobs = jobsOf(app);
    const exp = JSON.parse(app.storage.getItem(AUTH)).expires_at;
    // Revoked (Your devices → Sign it out) while that token is still unexpired.
    app.srv.gone = true;
    t.ok(exp * 1000 > Date.now() + 30 * 60000, 'the access token is still unexpired');
    const r = JSON.parse(await rpc(app));
    t.eq(r.status, 401, 'HTTP 401 — not 500');
    t.eq(r.code, 'patgo_signed_out', 'the caller gets the real code, patgo_signed_out');
    t.eq(app.srv.calls[app.srv.calls.length - 1].auth, 'Bearer ' + JSON.parse(app.storage.getItem(AUTH) || login(A)).access_token,
      '…sent on this phone’s own token');
    await until(() => status(app) === 'signed-out');
    t.eq(status(app), 'signed-out', 'this phone signs itself out');
    t.eq(app.run('state.cloud.message'), SIGNED_OUT_WORDS, '…and the Account page says why');
    t.deepEq(app.toasts, ['This phone was signed out from another device.'], '…one toast');
    t.eq(app.storage.getItem(AUTH), null, 'the saved login is gone');
    t.eq(owner(app) && owner(app).id, A.id, 'the owner stays (V145)');
    t.eq(jobsOf(app), jobs, 'the jobs are intact');

    // V161's text through the same boundary: the audit's reproduction.
    const old = await signedIn(v161);
    for (let k = 0; k < 100 && status(old) !== 'signed-in'; k++) await tick(10);
    old.srv.gone = true;
    const ro = JSON.parse(await rpc(old));
    t.eq(ro.status, 500, 'V161’s detail ({"status":401} alone): HTTP 500');
    t.eq(ro.code, 'PGRST121', '…PGRST121, not patgo_signed_out');
    await tick(60);
    t.eq(status(old), 'signed-in', '…so the phone never signed out (the defect this release fixes)');

    // An ordinary 401 signs nobody out.
    const plain = await signedIn(shipped);
    for (let k = 0; k < 100 && status(plain) !== 'signed-in'; k++) await tick(10);
    plain.srv.plain401 = true;
    t.eq(JSON.parse(await rpc(plain)).status, 401, 'an ordinary 401 (JWT expired)');
    await tick(60);
    t.eq(status(plain), 'signed-in', '…does not sign out');

    // A delayed refusal for an OLDER token, landing after this phone signed in
    // again on a new one: not this sign-in's — ignored.
    const late = await signedIn(shipped);
    for (let k = 0; k < 100 && status(late) !== 'signed-in'; k++) await tick(10);
    const oldTok = JSON.parse(late.storage.getItem(AUTH)).access_token;
    const res = P.pgrstRaiseFetchResponse(shipped.message, shipped.detail);
    late.storage.setItem(AUTH, login(A, jwt(A, 'ses-newer')));   // signed in again meanwhile
    late.sandbox.fetch = async () => res;
    await late.run('_cloudFetch')('https://x.supabase.co/rest/v1/rpc/my_businesses', { headers: { Authorization: 'Bearer ' + oldTok } });
    await tick(60);
    t.eq(res.status, 401, 'the older token’s refusal is a real 401 patgo_signed_out…');
    t.eq(status(late), 'signed-in', '…but it signs the newer sign-in out of nothing');
    t.ok(late.storage.getItem(AUTH) !== null, '…its login kept');
  });

  /* ------------------------------------------------------------------ 101e */
  await t.group('101e — the SQL: one function in three files; each parses to 401 patgo_signed_out; the corrective migration; the port', () => {
    const fn = (sql) => { const a = sql.lastIndexOf('create or replace function public.patgo_check_request('); return sql.slice(a, sql.indexOf('$$;', sql.indexOf('$$', a) + 2) + 3); };
    const files = ['supabase/schema.sql', 'supabase/v161-signed-out.sql', 'supabase/v162-signed-out-fix.sql'];
    const mig = read('supabase/v162-signed-out-fix.sql');
    for (const f of files) {
      const sql = read(f);
      t.eq(fn(sql), fn(mig), `${f}: the same patgo_check_request, byte for byte`);
      const r = P.pgrstRaiseOf(sql, 'patgo_check_request');
      const h = P.pgrstRaiseResponse(r.message, r.detail);
      t.eq(h.status, 401, `${f}: PostgREST answers 401`);
      t.eq(h.body.code, 'patgo_signed_out', `${f}: …code patgo_signed_out`);
    }
    t.includes(mig, "grant execute on function public.patgo_check_request() to anon, authenticated, service_role;", 'the migration keeps the grants');
    t.excludes(mig, 'pgrst.db_pre_request =', 'the migration does not touch the switch');
    for (const s of ['S1|the pre-request is still on|', "S2|the refusal''s message parses", "S3|the refusal''s detail parses: status 401 AND headers"]) t.includes(mig, s, 'self-check ' + s.slice(0, 2));
    t.includes(mig, "jsonb_typeof(d -> 'headers') = 'object'", 'S3 checks headers is an object, as PostgREST does');
    // The port against PostgREST's own words (Error.hs).
    const bad = P.pgrstRaiseResponse('{"code":"x","message":"y"}', '{"status" : 401}');
    t.eq(bad.status, 500, 'port: detail without headers → 500');
    t.eq(bad.body.code, 'PGRST121', '…PGRST121');
    t.eq(bad.body.hint, "DETAIL must be a JSON object with obligatory keys: 'status', 'headers' and optional key: 'status_text'.", '…PostgREST’s own hint');
    t.eq(P.pgrstRaiseResponse('{"code":"x","message":"y"}', null).body.details, 'DETAIL is missing in the RAISE statement', 'port: no detail');
    t.eq(P.pgrstRaiseResponse('{"code":"x"}', '{"status":401,"headers":{}}').status, 500, 'port: message without "message" → 500');
    t.eq(P.pgrstRaiseResponse('{"code":"x","message":"y"}', '{"status":402,"headers":{"X-A":"b"}}').headers['X-A'], 'b', 'port: headers carried');
    t.eq(P.sqlJsonText("json_build_object('status', 401, 'headers', json_build_object())::text"), '{"status" : 401, "headers" : {}}', 'Postgres’s json text, as PGlite printed it');
  });

  /* ------------------------------------------------------------------ 101f */
  await t.group('101f — release: V162; cache pat-v162; What’s new not rolled; About V162 / V161 / V160', () => {
    const rel = freshApp();
    t.eq(rel.run('APP_VERSION'), 'V162', 'APP_VERSION V162');
    t.eq(rel.run('WELCOME_VERSION'), 'V157', 'What’s new NOT rolled (a fix release)');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v162';", 'cache key pat-v162');
    t.eq(rel.fn('updateVersionLabel')('pat-v162'), 'V162', 'the update banner reads the key as V162');
    const help = read('render-help.js');
    const x = help.indexOf('<p><strong>V162</strong>'), y = help.indexOf('<p><strong>V161</strong>'), z = help.indexOf('<p><strong>V160</strong>');
    t.ok(x > -1 && y > x && z > y, 'About: V162, V161, V160');
    t.excludes(help, '<p><strong>V159</strong>', 'V159 rolled off');
    t.includes(help, 'no longer starts up signed in as a different account', 'About: V162’s line');
    t.includes(read('cloud.js'), 'V162: one owner decision, at sign-in and start', 'cloud.js header names V162');
  });
};
