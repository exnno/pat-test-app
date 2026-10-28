/* Standing test — V145: one owner per phone
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID (Peter, 22 Oct: 1A 2A 3A 4A 5A 7A 8A; 6 → the stats
   follow the account, its own release). The bug (Peter, 21 Oct, several
   accounts on one phone): sign out → the jobs stay → sign in as a DIFFERENT
   account → they upload into that account's cloud. A phone's jobs and setup now
   belong to ONE account (OWNER_KEY). 1A another account signing in while the
   owner has unsent work is signed straight back out, told why; 2A when the
   owner's work is all in its cloud it is asked first, and "Use … here" wipes
   the owner's things off the phone (a reset level); 3A signing out keeps the
   jobs; 4A the Sign out button sends the last changes first and warns if
   anything is still unsent; 5A the takeover keeps this phone's own
   preferences; 7A a backup records its account — refused across accounts, an
   old one asked first; 8A a phone with no owner is adopted by the first sign-in.

   ⚠ Every proof that matters goes through the REAL taps and the REAL library
   against a stand-in server that files each write under the token's account —
   so "nothing was sent as B" is read off the wire, not off a helper.

     84a  the stamp and the guards: first run (signed in / synced before / never),
          cloudOwnerAllows, syncActive, _syncRun refusing a live session that
          isn't the owner (nothing read, nothing sent), boot dropping a login
          that isn't the owner's.
     84b  syncOwnerPending (what of the owner's isn't in its cloud): jobs, setup,
          held, deletes, photos, bookkeeping that isn't the owner's; the words.
     84c  the takeover through the taps: refused with unsent work (1A) — nothing
          sent as B, the jobs intact, A signs back in and they send; all safe →
          asked (2A), nothing read or sent meanwhile; Cancel; a job logged while
          asking → refused at Use; Use → the wipe, B the owner, A's stats kept
          aside, the restart lands B on the Account page; a new account's
          password card carried through it.
     84d  signing out (4A): the last sync first, then out with nothing to say;
          offline / a failed send → the warning, Stay signed in, Sign out anyway
          (the jobs stay, the owner stays).
     84e  backups (7A), the takeover's keep list (5A), the reset levels and the
          owner; wiring; plus 83e's lasting checks (83e retired). V146: its
          release checks (V145, cache, What's new, About) moved to 85e. */

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

module.exports = async function () {
  /* ------------------------------------------------------------------ 84a */
  await t.group('84a — the stamp and the guards: first run, cloudOwnerAllows, syncActive, _syncRun, boot (8A)', async () => {
    // First run, signed in: the account on the phone owns it.
    const s1 = freshApp({ localStorage: { [AUTH]: storedFor(A) }, navigator: { onLine: false } });
    t.deepEq(owner(s1) && { id: owner(s1).id, email: owner(s1).email }, { id: A.id, email: A.email }, 'first run, signed in: stamped with that account');
    // First run, signed out, synced before: the account it last sent to.
    const s2 = freshApp({ localStorage: { 'pat:syncState': JSON.stringify({ userId: B.id, sent: {} }) }, navigator: { onLine: false } });
    t.eq(owner(s2) && owner(s2).id, B.id, 'first run, signed out: the account its sync record sent to');
    t.eq(owner(s2).email, '', '…whose address it doesn’t know');
    t.eq(s2.fn('cloudOwnerName')(), 'the account this phone belongs to', '…so the words say so');
    // Never synced: no owner — the first sign-in adopts it.
    const s3 = freshApp({ navigator: { onLine: false } });
    t.eq(owner(s3), null, 'never synced, signed out: no owner yet');
    t.ok(s3.fn('cloudOwnerAllows')(B.id), 'with no owner, any account may (8A)');
    t.notOk(s3.fn('cloudOwnerAllows')(''), '…never an empty id');

    // Owner A: A may, B may not.
    t.ok(s1.fn('cloudOwnerAllows')(A.id), 'the owner may sync');
    t.notOk(s1.fn('cloudOwnerAllows')(B.id), 'another account may not');
    t.ok(s1.fn('syncActive')(), 'signed in as the owner: sync is on');
    s1.fn('cloudOwnerSet')(B.id, B.email);
    t.notOk(s1.fn('syncActive')(), 'signed in as anyone else: sync is off — no trigger fires');
    t.eq(JSON.parse(s1.storage.getItem('pat:owner')).email, B.email, 'cloudOwnerSet writes the key');

    // _syncRun itself, with the live library session B on a phone owned by A —
    // the last guard, which holds even if syncActive were bypassed.
    const app = phone({ [AUTH]: storedFor(B), 'pat:owner': JSON.stringify({ id: A.id, email: A.email }) });
    t.eq(app.state().cloud.status, 'signed-out', 'boot: a stored login that isn’t the owner’s is not kept');
    t.eq(app.storage.getItem(AUTH), null, '…its keys are gone');
    t.includes(app.state().cloud.message, 'this phone belongs to a@example.com', '…and the Account page says why');
    app.storage.setItem(AUTH, storedFor(B));      // as if a login slipped through
    app.state().cloud.status = 'signed-in';
    let err = null;
    await app.fn('_syncRun')({ pull: true }).catch((e) => { err = e; });
    t.eq(err && err.syncStage, 'owner', '_syncRun refuses a session that isn’t the owner’s');
    t.eq(app.srv.restAs(B.id).length, 0, '…before reading or sending anything');
    t.eq(app.fn('syncErrorMessage')(err), 'This phone belongs to another account, so nothing was sent.', '…in words');
  });

  /* ------------------------------------------------------------------ 84b */
  await t.group('84b — syncOwnerPending: what of the owner’s isn’t in its cloud; the words', async () => {
    const app = await aSynced();
    const P = () => app.fn('syncOwnerPending')(A.id);
    t.deepEq(P(), { jobs: 0, photos: 0, other: 0, total: 0 }, 'after a full sync: nothing pending');
    // Bookkeeping that isn't the owner's counts nothing as sent.
    const other = app.fn('syncOwnerPending')(B.id);
    t.ok(other.jobs >= 1 && other.total >= 1, 'bookkeeping that isn’t this owner’s: every job counts');
    // A new job.
    const extra = withSession(app, { client: 'ZZ Owner Client' });
    withItem(app, { assetNo: 'ZZA-2' });
    t.eq(P().jobs, 1, 'a job logged since: 1 job');
    t.eq(P().total, 1, '…and nothing else (same client)');
    app.state().sessions = app.state().sessions.filter(x => x !== extra); app.fn('save')();
    t.eq(P().total, 0, '…gone again: nothing');
    // An edit to the sent job.
    const s = app.state().sessions.find(x => String(x.id) === app.jobA);
    const was = s.items[0].notes;
    s.items[0].notes = 'ZZ edited'; app.fn('save')();
    t.eq(P().jobs, 1, 'an edit to a sent job: 1 job');
    s.items[0].notes = was; app.fn('save')();
    // Setup: a new client.
    app.fn('ensureClient')('ZZ Brand New Client'); app.fn('save')();
    t.ok(P().other >= 1, 'a new client: other changes');
    t.eq(P().jobs, 0, '…not a job');
    // Held on the Sync page.
    const st0 = JSON.parse(app.storage.getItem('pat:syncState'));
    app.storage.setItem('pat:syncHeld', JSON.stringify([{ id: 'ZZHELD', kind: 'client', at: T3, reason: 'both-changed' }]));
    const before = P().other;
    app.storage.setItem('pat:syncHeld', '[]');
    t.eq(before - P().other, 1, 'a held record counts');
    app.storage.setItem('pat:syncHeld', JSON.stringify([{ id: app.jobA, at: T3, reason: 'both-changed' }]));
    t.ok(P().jobs >= 1, 'a held job counts');
    app.storage.setItem('pat:syncHeld', '[]');
    // A delete the cloud hasn't heard of.
    const base = P().other;
    app.state().tombstones.push({ kind: 'session', id: 'ZZGONE', at: T3 });
    st0.sent.ZZGONE = 'x'; app.storage.setItem('pat:syncState', JSON.stringify(st0));
    t.eq(P().other - base, 1, 'an unsent delete counts');
    app.state().tombstones.pop();
    // A photo of a sent job not yet up.
    const item = s.items[0];
    app.state().photoMeta = Object.assign({}, app.state().photoMeta, { ZZPHOTO: { i: String(item.id), s: app.jobA } });
    t.eq(P().photos, 1, 'a photo not yet up: 1 photo');
    const known = P();
    app.state().photoMetaReady = false;
    const unknown = P();
    t.eq(unknown.photos, 0, 'the photo index still loading…');
    t.eq(unknown.other - known.other, 1, '…counts as one more change, never as safe');
    app.state().photoMetaReady = true;
    delete app.state().photoMeta.ZZPHOTO;

    // The words.
    const W = (p) => app.fn('cloudPendingWords')(p);
    t.deepEq(W({ jobs: 1, photos: 0, other: 0 }), { what: '1 job', have: 'hasn’t', them: 'it' }, '1 job hasn’t … it');
    t.deepEq(W({ jobs: 3, photos: 2, other: 0 }), { what: '3 jobs and 2 photos', have: 'haven’t', them: 'them' }, '3 jobs and 2 photos');
    t.eq(W({ jobs: 3, photos: 2, other: 4 }).what, '3 jobs, 2 photos and other changes', '…and other changes');
    t.eq(W({ jobs: 0, photos: 0, other: 2 }).what, 'Some changes', 'only setup: Some changes');
    t.eq(W({ jobs: 0, photos: 1, other: 0 }).have, 'hasn’t', '1 photo hasn’t');
  });

  /* ------------------------------------------------------------------ 84c */
  await t.group('84c — the takeover through the taps: refused (1A), asked (2A), Cancel, Use, the restart', async () => {
    // ---- 1A: A has an unsent job; B signs in.
    const app = await aSynced();
    withSession(app, { client: 'ZZ Owner Client' });
    withItem(app, { assetNo: 'ZZA-UNSENT' });
    stopTimers(app);
    const unsentId = String(app.fn('activeSession')().id);
    const jobsBefore = JSON.stringify(app.state().sessions);
    const restB0 = app.srv.restAs(B.id).length;
    await signIn(app, B);
    t.eq(app.state().cloud.status, 'signed-out', '1A: B is signed straight back out');
    t.eq(app.storage.getItem(AUTH), null, '…B’s login is gone from the phone');
    t.includes(app.state().cloud.message, 'This phone has 1 job from a@example.com that hasn’t reached the cloud.', '…told why, naming the owner and the count');
    t.includes(app.state().cloud.message, 'Sign in as a@example.com to send it first', '…and what to do');
    await tick(50);
    t.eq(app.srv.restAs(B.id).length - restB0, 0, 'NOTHING was read or sent as B (on the wire)');
    t.eq(app.srv.sentJobs(B.id).length, 0, 'B’s cloud holds none of A’s jobs');
    t.eq(JSON.stringify(app.state().sessions), jobsBefore, 'A’s jobs are intact on the phone');
    t.eq(owner(app).id, A.id, 'the phone is still A’s');
    // A signs back in: they send.
    await signIn(app, A);
    t.eq(app.state().cloud.status, 'signed-in', 'A signs back in');
    await syncNow(app);
    t.ok(app.srv.sentJobs(A.id).includes(unsentId), '…and the held job goes up, as A');
    t.eq(app.srv.sentJobs(B.id).length, 0, '…never as B');
    await app.fn('cloudSignOut')();
    stopTimers(app);

    // ---- 2A: everything safe now; B signs in → asked, nothing read or sent.
    app.state().archivedStats = { items: 7, fails: 2, types: { ZZKettle: 7 } };
    app.fn('save')();
    const restB1 = app.srv.restAs(B.id).length;
    await signIn(app, B);
    t.eq(app.state().cloud.status, 'signed-in', '2A: B is signed in…');
    t.eq(app.state().cloud.handover && app.state().cloud.handover.id, B.id, '…and asked to take the phone over');
    t.notOk(app.fn('syncActive')(), '…with sync off meanwhile');
    t.eq(app.srv.restAs(B.id).length - restB1, 0, '…and nothing read or sent as B (no profile read, no sync)');
    account(app);
    const page = html(app);
    t.includes(page, 'id="cloud-handover"', 'the Account page shows the question');
    t.includes(page, 'This phone has a@example.com&rsquo;s jobs and setup &mdash; all safe in a@example.com&rsquo;s cloud.', '…in the agreed words');
    t.includes(page, 'To use b@example.com here they come off this phone; a@example.com gets them back by signing in again.', '…both halves');
    t.ok(/id="cloud-handover-go" data-action="cloud-handover-go"[^>]*>Use b@example\.com here</.test(page), 'Use b@example.com here');
    t.includes(page, 'id="cloud-handover-cancel" data-action="cloud-handover-cancel"', 'and Cancel');
    t.excludes(page, 'id="cloud-sign-out"', 'not the signed-in card');
    // Cancel.
    tap(app, 'cloud-handover-cancel');
    await until(() => app.state().cloud.status === 'signed-out');
    t.eq(app.state().cloud.status, 'signed-out', 'Cancel signs B out');
    t.includes(app.state().cloud.message, 'This phone stays a@example.com’s.', '…saying the phone stays A’s');
    t.eq(app.storage.getItem(AUTH), null, '…B’s login gone');
    t.eq(owner(app).id, A.id, '…the owner unchanged');
    t.eq(app.state().cloud.handover, null, '…the question gone');

    // A job logged while the question is up → refused at Use.
    await signIn(app, B);
    const meanwhile = withSession(app, { client: 'ZZ Owner Client' });
    stopTimers(app);
    const n = app.state().sessions.length;
    tap(app, 'cloud-handover-go');
    await tick(20);
    t.eq(app.state().cloud.status, 'signed-out', 'a job logged while asking: Use refuses (counted again)');
    t.includes(app.state().cloud.message, 'This phone has 1 job from a@example.com', '…in words');
    t.eq(app.state().sessions.length, n, '…and nothing was wiped');
    t.eq(app.sandbox.location._reloads, 0, '…no restart');
    app.state().sessions = app.state().sessions.filter(x => x !== meanwhile); app.fn('save')();
    stopTimers(app);

    // Use b@example.com here.
    await signIn(app, B);
    t.ok(!!app.state().cloud.handover, 'asked again (all safe once more)');
    app.storage.setItem('pat:theme', 'dark');
    app.storage.setItem('scan:records', '[{"id":"ZZSCAN"}]');
    tap(app, 'cloud-handover-go');
    await until(() => app.sandbox.location._reloads > 0, 6000);
    t.eq(app.sandbox.location._reloads, 1, 'Use: the app restarts');
    t.eq(owner(app) && owner(app).id, B.id, 'B owns the phone');
    t.eq(app.storage.getItem('pat:sessions'), null, 'A’s jobs are off the phone');
    t.eq(app.storage.getItem('pat:clients'), null, '…A’s clients');
    t.eq(app.storage.getItem('pat:syncState'), null, '…A’s sync record');
    t.eq(app.storage.getItem('pat:plan'), null, '…A’s plan record');
    t.eq(app.storage.getItem('pat:archivedStats'), null, '…A’s stats');
    t.deepEq(JSON.parse(app.storage.getItem('pat:ownerStats'))[A.id], { items: 7, fails: 2, types: { ZZKettle: 7 } },
      '…kept aside under A, for when A signs in here again');
    t.eq(app.storage.getItem('pat:theme'), 'dark', 'this phone’s look stays (5A)');
    t.eq(app.storage.getItem('scan:records'), '[{"id":"ZZSCAN"}]', 'another app’s keys untouched');
    t.ok(!!app.storage.getItem(AUTH), 'B’s login stays');
    t.ok(JSON.parse(app.storage.getItem('pat:resetPending')).level === 'handover', 'the restart finishes the handover');

    // The restart.
    const next = restart(app);
    t.eq(next.storage.getItem('pat:resetPending'), null, 'the restart finished it');
    t.eq(owner(next).id, B.id, '…B the owner');
    t.eq(next.state().cloud.status, 'signed-in', '…B signed in');
    t.eq(next.state().sessions.length, 0, '…no jobs of A’s');
    t.eq(next.state().view, 'cloudAccount', '…on the Account page');
    t.includes(next.state().cloud.message, 'Signed in as b@example.com. Your jobs and setup are coming down from the cloud.', '…saying what happens next');
    t.ok(next.fn('syncActive')(), '…and B syncs');
    // A's figures come back if A takes the phone back.
    next.fn('_resetStashStats')(B.id);
    next.fn('_resetWipeLocal')('handover');
    next.fn('_resetAfterWipe')({ level: 'handover', owner: { id: A.id, email: A.email } });
    t.deepEq(JSON.parse(next.storage.getItem('pat:archivedStats')), { items: 7, fails: 2, types: { ZZKettle: 7 } },
      'A taking it back: A’s lifetime figures return');

    // A NEW account made on A's (safe) phone: its password card survives the restart.
    const n2 = await aSynced();
    n2.who.user = user(B, true);
    account(n2);
    tap(n2, 'cloud-signup-open');
    n2.doc.getElementById('cloud-email').value = B.email;
    tap(n2, 'cloud-signup-send');
    await until(() => !n2.state().cloud.busy);
    n2.doc.getElementById('cloud-code').value = '123456';
    tap(n2, 'cloud-verify-code');
    await until(() => !!n2.state().cloud.handover);
    t.ok(!!n2.state().cloud.handover, 'a new account on someone else’s phone: asked first');
    t.notOk(n2.state().cloud.pwOpen, '…no password card over the question');
    t.eq(n2.state().cloud.handover.after && n2.state().cloud.handover.after.pwNew, true, '…its password step carried');
    tap(n2, 'cloud-handover-go');
    await until(() => n2.sandbox.location._reloads > 0, 6000);
    const n3 = restart(n2);
    t.eq(n3.state().cloud.pwOpen && n3.state().cloud.pwNew, true, 'after the restart: Choose a password, no way out');
    t.eq(n3.state().cloud.welcome, 'due', '…and the welcome still to come');
    t.eq(n3.state().view, 'cloudAccount', '…on the Account page');
  });

  /* ------------------------------------------------------------------ 84d */
  await t.group('84d — signing out (4A): the last sync first; the warning; Stay; Sign out anyway', async () => {
    const app = phone();
    await until(() => app.state().photoMetaReady === true);
    await signIn(app, A);
    withSession(app, { client: 'ZZ Owner Client' });
    withItem(app, { assetNo: 'ZZA-LAST' });
    const id = String(app.fn('activeSession')().id);
    stopTimers(app);
    account(app);
    tap(app, 'cloud-sign-out');
    t.eq(app.state().cloud.signingOut, true, 'Sign out: the last changes are sent first');
    t.includes(html(app), 'Sending your last changes…', '…and the button says so');
    await until(() => app.state().cloud.status === 'signed-out', 6000);
    t.ok(app.srv.sentJobs(A.id).includes(id), 'the job went up, as A');
    t.eq(app.state().cloud.status, 'signed-out', '…then signed out');
    t.eq(sheets(app).length, 0, '…with nothing to warn about');
    t.eq(owner(app).id, A.id, 'the phone stays A’s (3A)');
    t.ok(app.state().sessions.some(s => String(s.id) === id), '…and the jobs stay on it');

    // Offline, with something new: the warning.
    await signIn(app, A);
    withSession(app, { client: 'ZZ Owner Client' });
    withItem(app, { assetNo: 'ZZA-OFF' });
    stopTimers(app);
    app.run('navigator.onLine = false');
    account(app);
    const posted = app.srv.calls.length;
    tap(app, 'cloud-sign-out');
    await until(() => sheets(app).length > 0);
    t.eq(app.srv.calls.length, posted, 'offline: no send tried');
    const sh = sheets(app)[sheets(app).length - 1];
    t.includes(sh.innerHTML, 'Not everything has reached the cloud', 'the warning');
    t.includes(sh.innerHTML, '1 job hasn’t been sent to a@example.com’s cloud yet. If you sign out they stay safely on this phone and send next time you sign in as a@example.com. Until then, no other account can sign in on this phone.', '…in the agreed words');
    t.ok(/id="choice-sheet-0"[^>]*>Stay signed in</.test(sh.innerHTML) && /class="btn-primary" id="choice-sheet-0"/.test(sh.innerHTML), 'Stay signed in, the main button');
    t.ok(/class="btn-danger" id="choice-sheet-1"[^>]*>Sign out anyway</.test(sh.innerHTML), 'Sign out anyway');
    t.excludes(sh.innerHTML, 'choice-sheet-no', 'no third Cancel button');
    t.eq(app.state().cloud.status, 'signed-in', 'still signed in while it asks');
    app.doc.getElementById('choice-sheet-0').click();
    t.eq(app.state().cloud.status, 'signed-in', 'Stay signed in: stays');
    t.eq(sheets(app).length, 0, '…sheet closed');
    tap(app, 'cloud-sign-out');
    await until(() => sheets(app).length > 0);
    app.doc.getElementById('choice-sheet-1').click();
    await until(() => app.state().cloud.status === 'signed-out');
    t.eq(app.state().cloud.status, 'signed-out', 'Sign out anyway: signed out');
    t.eq(owner(app).id, A.id, '…the phone still A’s');
    t.ok(app.state().sessions.some(s => (s.items || []).some(it => it.assetNo === 'ZZA-OFF')), '…the unsent job still on it');

    // Online, but the send fails: the warning too.
    app.run('navigator.onLine = true');
    await signIn(app, A);
    app.srv.calls.length = 0;
    app.srv.over['POST /rest/v1/sessions'] = () => json({ message: 'boom' }, 500);
    const bad = app.srv;
    withSession(app, { client: 'ZZ Owner Client' });
    stopTimers(app);
    account(app);
    tap(app, 'cloud-sign-out');
    await until(() => sheets(app).length > 0, 6000);
    t.ok(bad.calls.some(c => c.path === '/rest/v1/sessions' && c.method === 'POST'), 'a send was tried');
    t.ok(sheets(app).length > 0 && /Not everything has reached the cloud/.test(sheets(app)[sheets(app).length - 1].innerHTML),
      'it failed: the warning shows');
    t.eq(app.state().cloud.status, 'signed-in', '…still signed in');
  });

  /* ------------------------------------------------------------------ 84e */
  await t.group('84e — backups (7A), the keep list (5A), the reset levels; 83e’s lasting checks', async () => {
    // ---- 7A backups.
    const own = freshApp({ localStorage: { [AUTH]: storedFor(A) }, navigator: { onLine: false } });
    t.deepEq(own.fn('buildBackup')().owner, { id: A.id, email: A.email }, 'a backup records its account (id and address only)');
    t.eq(own.fn('buildBackup')().backupVersion, 5, '…additive: backupVersion stays 5');
    const free = freshApp({ navigator: { onLine: false } });
    t.eq(free.fn('buildBackup')().owner, undefined, 'a phone with no owner: no account recorded');
    const V = (app, data) => app.fn('backupRestoreVerdict')(data);
    t.deepEq(V(own, { sessions: [], owner: { id: A.id, email: A.email } }), { ok: true, adopt: null }, 'same account: as ever');
    t.eq(V(own, { sessions: [], owner: { id: B.id, email: B.email } }).refuse,
      'This backup belongs to b@example.com — sign in as that account to restore it.', 'a different account: refused, in words');
    t.deepEq(V(own, { sessions: [] }), { ask: true, email: A.email }, 'no account recorded: asked, naming the account');
    t.deepEq(V(free, { sessions: [], owner: { id: B.id, email: B.email } }), { ok: true, adopt: { id: B.id, email: B.email } }, 'a phone with no account: becomes the backup’s');
    t.deepEq(V(free, { sessions: [] }), { ok: true, adopt: null }, 'old backup, no account anywhere: as ever');

    // Through the real file restore. (⚠ The stub registers sheet ids with the
    // LAST document made — so the phone is made here, just before its sheets.)
    const ownF = freshApp({ localStorage: { [AUTH]: storedFor(A) }, navigator: { onLine: false } });
    const file = (data) => new ownF.sandbox.Blob([JSON.stringify(data)], { type: 'application/json' });
    const job = { id: 'ZZB1', name: 'ZZ Backup Job', date: '2026-10-01', items: [{ id: 'ZZI1', assetNo: 'ZZB-1', result: 'pass' }] };
    ownF.doc.body.children.slice().forEach(c => c.remove && /bulk-sheet|modal-backdrop/.test(c.className || '') && c.remove());
    await restoreFile(ownF, file({ sessions: [job], owner: { id: B.id, email: B.email } }));
    const last = () => { const s = ownF.doc.querySelectorAll('.bulk-sheet'); return s.length ? s[s.length - 1].innerHTML : ''; };
    t.includes(last(), 'This backup belongs to another account', 'the file from B: refused on A’s phone');
    t.excludes(last(), 'confirm-sheet-yes', '…with no way to go ahead');
    ownF.doc.body.children.slice().forEach(c => c.remove && /bulk-sheet|modal-backdrop/.test(c.className || '') && c.remove());
    await restoreFile(ownF, file({ sessions: [job, Object.assign({}, job, { id: 'ZZB2' })] }));
    t.includes(last(), 'Restore into a@example.com?', 'an old file: asked first');
    t.includes(last(), 'Restoring puts its 2 jobs into a@example.com’s account.', '…naming the account and the job count');
    ownF.doc.getElementById('confirm-sheet-yes').click();
    t.includes(last(), 'This will REPLACE all current data on this device.', '…then the usual replace question');

    const fr = freshApp({ navigator: { onLine: false } });
    await restoreFile(fr, new fr.sandbox.Blob([JSON.stringify({ sessions: [job], owner: { id: B.id, email: B.email } })], { type: 'application/json' }));
    fr.doc.getElementById('confirm-sheet-yes').click();
    await until(() => !!owner(fr), 3000);
    t.eq(owner(fr) && owner(fr).id, B.id, 'restored onto a phone with no owner: the phone is the backup’s account’s now');

    // ---- 5A: the keep list, and the levels.
    const p = freshApp({ localStorage: { [AUTH]: storedFor(A) }, navigator: { onLine: false } });
    const seed = { 'pat:sessions': 'x', 'pat:clients': 'x', 'pat:engineer': 'x', 'pat:instruments': 'x', 'pat:itempresets': 'x',
      'pat:reportsettings': 'x', 'pat:reporttemplates': 'x', 'pat:sqphistory': 'x', 'pat:undo': '1', 'pat:theme': 'dark',
      'pat:textsize': 'large', 'pat:soundfx': '1', 'pat:haptics': '1', 'pat:scanner': '1', 'pat:scannerPaired': '1', 'pat:scanSpeed': 'x',
      'pat:sort': 'x', 'pat:mapPin': '1', 'pat:reminders': 'x', 'pat:pruneagemonths': '6', 'pat:photoAgeMonths': '6', 'pat:snapshots': '0',
      'pat:onboardedV33': '1', 'pat:apostropheRepair': '1', 'pat:cloudUnlocked': '1', 'pat:phone': 'x', 'pat:plan': 'x',
      'pat:v145welcome': '1', 'pat:v144welcome': '1', 'pat:timestamps': '1', 'pat:failreasons': 'x', 'scan:engineer': 'ZZ' };
    for (const [k, v] of Object.entries(seed)) p.storage.setItem(k, v);
    p.fn('_resetWipeLocal')('handover');
    const gone = ['pat:sessions', 'pat:clients', 'pat:engineer', 'pat:instruments', 'pat:itempresets', 'pat:reportsettings',
      'pat:reporttemplates', 'pat:sqphistory', 'pat:plan', 'pat:timestamps', 'pat:failreasons', 'pat:owner'];
    for (const k of gone) t.eq(p.storage.getItem(k), null, `handover: ${k} goes (it follows the account)`);
    const kept = ['pat:theme', 'pat:textsize', 'pat:soundfx', 'pat:haptics', 'pat:scanner', 'pat:scannerPaired', 'pat:scanSpeed',
      'pat:sort', 'pat:undo', 'pat:mapPin', 'pat:reminders', 'pat:pruneagemonths', 'pat:photoAgeMonths', 'pat:snapshots',
      'pat:onboardedV33', 'pat:apostropheRepair', 'pat:cloudUnlocked', 'pat:phone', 'pat:v145welcome', 'pat:v144welcome', 'scan:engineer', AUTH];
    for (const k of kept) t.ok(p.storage.getItem(k) !== null, `handover: ${k} stays (this phone’s)`);
    t.ok(!p.fn('resetPerform') || p.run("RESET_LEVELS.indexOf('handover')") === -1, 'the handover is not a level on the Reset page');
    t.eq(p.run('(RESET_KEY_PLAN.find(r => r[0] === "OWNER_KEY") || [])[2]'), 'account', 'the owner goes only with Everything, as new');
    const w = freshApp({ localStorage: { 'pat:owner': JSON.stringify({ id: A.id, email: A.email }), 'pat:sessions': 'x' }, navigator: { onLine: false } });
    w.fn('_resetWipeLocal')('work');
    t.eq(owner(w) && owner(w).id, A.id, 'Clear my work keeps the owner — what is left can’t be adopted by someone else');
    w.fn('_resetWipeLocal')('settings');
    t.eq(owner(w) && owner(w).id, A.id, 'Clear work and settings keeps it too');
    w.fn('_resetWipeLocal')('everything');
    t.eq(owner(w), null, 'Everything, as new frees the phone');
    t.includes(read('cloud.js'), 'or save a backup, then Reset this phone (Everything, as new).', 'the refusal names that level');

    // ---- V145's release checks retired V146 (→ 85e). What lasts stays here.
    const app = freshApp();
    const core = read('render-core.js');
    t.includes(core, 'New here? Try the practice job.', 'setup offers the practice job');
    t.includes(core, 'You can do it again any time from Settings → Help → Tutorials.', '…and says where it lives');
    const help = read('render-help.js');
    t.includes(help, 'data-action="settings-page" data-arg="settingsTutorials"', 'About points at Tutorials');
    const prices = app.run('PLAN_PRICES');
    t.deepEq({ year: prices.year, month: prices.month }, { year: '£60 a year', month: '£6 a month' }, 'the prices shown match the pricing round (1B)');
    t.eq(app.run('PLAN_TRIAL_DAYS'), 30, 'PLAN_TRIAL_DAYS 30…');
    t.includes(read('supabase/schema.sql'), "ends timestamptz := now() + interval '30 days';", '…the same 30 days the server gives a new account (handle_new_user)');
    t.includes(read('styles.css'), '.plan-happy-body {', 'the welcome / thank-you sheets have their style');
    t.eq(app.run('CLOUD_SIGNOUT_SYNC_MS'), 20000, 'the last sync before a sign-out is waited for 20 seconds at most');
    t.includes(read('tour.js'), 'cloudOwnerAllows: () => true,', 'the cloud tutorials’ drawn phone is its sample account’s');

    // Stripe-hosted (V142 5A): no Stripe or Google script anywhere in the app.
    const shipped = read('index.html') + read('plan.js') + read('cloud.js') + read('billing-done.html') + read('signin-done.html');
    t.notOk(/js\.stripe\.com|<script[^>]+stripe/i.test(shipped), 'no Stripe script in the app');
    t.notOk(/accounts\.google\.com\/gsi|<script[^>]+google/i.test(shipped), 'no Google script (V140 1A)');
    t.notOk(/billing-done\.html/.test(read('sw.js')) || /billing-done\.html/.test(read('index.html')), 'billing-done.html is not in ASSETS or index.html (only opened online)');
    t.notOk(new RegExp(String.raw`\bconfirm\(|\balert\(|\bprompt\(`).test(read('plan.js') + read('cloud.js') + read('sync.js') + read('reset.js')), 'no browser dialogs');

    // The taps: wired, guarded, harmless without plan.js / cloud.js (rule 6).
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
    Object.assign(noPlan.state().cloud, { status: 'signed-in', welcome: 'due', pwOpen: false, busy: false });
    t.eq(noPlan.fn('cloudMaybeWelcome')(), false, 'no plan.js: no welcome, no error (rule 6)');
    noPlan.state().cloud.trialEndsAt = new Date(Date.now() + 9 * DAY).toISOString();
    noPlan.state().cloud.plan = 'trial';
    noPlan.state().view = 'cloudAccount';
    t.doesNotThrow(() => noPlan.fn('render')(), 'the Account page renders a trial without plan.js');
    const noSync = bootApp({ skip: ['sync.js'] });
    noSync.state = () => noSync.refresh('state').state;
    t.doesNotThrow(() => noSync.fn('planNote')({ plan: 'active' }), 'planNote without sync.js');
    t.eq(noSync.fn('planLineText')({ phase: 'paid' }), '', 'the plan line without sync.js');
    // V145: without sync.js nothing can be counted — so no takeover (the safe way).
    t.eq(noSync.fn('_cloudOwnerPending')(A.id), null, 'no sync.js: the owner’s work can’t be counted…');
    noSync.fn('cloudOwnerSet')(A.id, A.email);
    Object.assign(noSync.state().cloud, { status: 'signed-in' });
    t.eq(noSync.fn('_cloudOwnerLanding')(user(B), B.email), false, '…so another account is refused, not handed the phone');
    t.eq(noSync.state().cloud.handover, null, '…never asked');
    const noReset = bootApp({ skip: ['reset.js'] });
    noReset.state = () => noReset.refresh('state').state;
    Object.assign(noReset.state().cloud, { status: 'signed-in', handover: { id: B.id, email: B.email, from: A.email } });
    t.doesNotThrow(() => noReset.fn('cloudHandoverGo')(), 'no reset.js: Use cancels instead (the phone stays)');

    // Every cloud tap from V139, V140, V144 and V145 wired and guarded.
    const NEW = ['cloud-google', 'cloud-google-connect', 'cloud-google-cancel', 'cloud-google-off',
                 'cloud-google-keep', 'cloud-google-disconnect',
                 'cloud-password-sign-in', 'cloud-forgot', 'cloud-use-code', 'cloud-use-password',
                 'cloud-password-open', 'cloud-password-cancel', 'cloud-password-save', 'cloud-password-toggle',
                 'cloud-signup-open', 'cloud-signup-close', 'cloud-signup-send',
                 'cloud-sign-out', 'cloud-handover-go', 'cloud-handover-cancel'];
    for (const n of NEW) t.ok(new RegExp(`'${n}':\\s*\\([^)]*\\) => \\{ if \\(typeof cloud\\w+ === 'function'\\)`).test(disp), `${n} wired, typeof-guarded`);
    const bare = bootApp({ skip: ['cloud.js'] });
    bare.state = () => bare.refresh('state').state;
    const actions = bare.run('ACTIONS');
    for (const n of NEW) t.doesNotThrow(() => actions[n]('', bare.doc.createElement('button')), `${n} harmless without cloud.js`);
    bare.state().view = 'cloudAccount';
    t.doesNotThrow(() => bare.fn('render')(), 'Account page renders without cloud.js');
    t.ok(bare.fn('syncActive') && bare.fn('syncActive')() === false, 'sync without cloud.js: off, no error');
    bare.state().view = 'cloudSubscription';
    t.doesNotThrow(() => bare.fn('render')(), 'the Subscription page renders without cloud.js');

    // A form never navigates: the submit that follows Sign in / Create / Go is cancelled at #app.
    const f = bootApp({});
    f.state = () => f.refresh('state').state;
    f.sandbox.localStorage.setItem('pat:cloudUnlocked', '1');
    f.state().view = 'cloudAccount';
    f.fn('render')();
    const ev = { type: 'submit', target: f.doc.createElement('form'), defaultPrevented: false,
                 preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
    f.doc.getElementById('app').dispatchEvent(ev);
    t.ok(ev.defaultPrevented, 'a submit on the Account page is cancelled (the app does not reload)');

    // 77e's lasting checks (carried by 78e … 83e).
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
