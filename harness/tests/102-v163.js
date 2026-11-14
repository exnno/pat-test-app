/* Standing test — V163: leaving and removing a member (R5; locked 1A 2A 3B 4C 5B 6A)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

     102a  REMOVED, WITH THE LAST DELIVERY (6A). Eddie's phone: Big Co is his main
           business; one job already safe in the cloud, one never sent (no
           businessId — it was the main one's), one for his own business. Big Co
           removes him. His next sync reads the departure BEFORE sending, sends
           the unsent Big Co job INTO Big Co (never his own business), tells the
           cloud it's finished, takes both Big Co jobs off the phone (3B), keeps
           syncing his own, and says so on a sheet (5B). Nothing more goes to Big Co.
     102b  CUT OFF NOW. The unsent Big Co job can't be sent: it stays on the phone,
           locked and read-only (Job settings and unlock refuse), never sent —
           not even its delete — and his own business's jobs still sync (the
           batch that would have failed every run). The sheet says what stayed.
           Invited back: the job is his to change and send again.
     102c  REMOVED WHILE PATGO WAS OPEN. The next upload is refused by the row
           rules; that refusal makes the run after it read the departure first,
           and from then on the phone syncs cleanly.
     102d  THE BUSINESS PAGE (1A 2A 4C). Remove where your role may invite theirs;
           Leave for all but the Owner; the remove sheet lists the person's
           devices and when each was used, with the two choices — and each
           choice sends its own deliver flag; Leave asks first, then leaves.
     102e  the SQL: schema.sql carries v163-leaving.sql's block byte for byte as
           its last section; the pieces the rules rest on; self-checks L1–L5.
     102f  V163's About line (V164: the release checks → 103f). Was: release: V163; cache pat-v163; What's new rolled (two lines); About
           V163 / V162 / V161.

   ⚠ WHAT THIS FILE CANNOT PROVE: the database's rules. The stand-in server here
   refuses what supabase/v163-leaving.sql refuses (a row of a business you're
   not in, outside the delivery; a delete during it) and files a new row the way
   its org_stamp does — but the rules themselves were proved in a real Postgres
   (PGlite + a Supabase stand-in, the whole schema.sql: 47 checks, new and
   upgraded projects, run twice). Photos are proved there too, not here. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { tick, freshApp, withSession, withItem } = require('../fixture');

const LIB  = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const AUTH = 'patgo:cloudAuth:test';
const E   = { id: '33333333-3333-4333-8333-333333333333', email: 'eddie@example.com' };
const BIG = 'b1b1b1b1-0000-4000-8000-000000000001';
const OWN = 'e0e0e0e0-0000-4000-8000-000000000002';
const T0  = '2026-11-13T10:00:00.000Z';

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const jwt = () => b64u({ alg: 'HS256', typ: 'JWT' }) + '.' +
  b64u({ sub: E.id, email: E.email, session_id: 'ses-e', exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated', role: 'authenticated' }) + '.ZZSIGN';
const login = () => JSON.stringify({ access_token: jwt(), token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'ZZREFRESH',
  user: { id: E.id, email: E.email, aud: 'authenticated', role: 'authenticated' } });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const RLS = () => json({ code: '42501', message: 'new row violates row-level security policy for table "sessions"', details: null, hint: null }, 403);

// The stand-in: Eddie in Big Co (main) and his own; Big Co may remove him.
function cloud() {
  const srv = {
    calls: [], sessions: [], member: new Set([BIG, OWN]), main: BIG,
    departed: null,   // { org, kind, by, deliverUntil (ms|0) }
  };
  const delivering = (org) => !!(srv.departed && srv.departed.org === org && !srv.member.has(org) && srv.departed.deliverUntil > Date.now());
  const mayHold = (org) => srv.member.has(org) || delivering(org);
  srv.remove = (deliver) => {
    srv.member.delete(BIG); srv.main = OWN;
    srv.departed = { org: BIG, kind: 'removed', by: 'Olive', deliverUntil: deliver ? Date.now() + 7 * 86400000 : 0 };
  };
  srv.rejoin = () => { srv.member.add(BIG); srv.departed = null; };
  srv.inBig = () => srv.sessions.filter(r => r.org_id === BIG).map(r => String(r.id)).sort();
  srv.fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const p = u.split('?')[0].replace(/^https:\/\/[^/]+/, '');
    const method = init.method || 'GET';
    let body = null;
    try { body = init.body ? JSON.parse(init.body) : null; } catch { body = init.body; }
    srv.calls.push({ path: p, method, body });
    if (p === '/auth/v1/user') return json({ id: E.id, email: E.email });
    if (p === '/auth/v1/token') return json(JSON.parse(login()));
    if (p.startsWith('/rest/v1/profiles')) return json([{ plan: 'active', trial_ends_at: null, lapsed_at: null }]);
    if (p === '/rest/v1/rpc/my_businesses') {
      return json([OWN, BIG].filter(o => srv.member.has(o)).map(o => ({ id: o, name: o === BIG ? 'Big Co' : '', role: o === BIG ? 'engineer' : 'owner', is_default: srv.main === o, members: o === BIG ? 4 : 1 })));
    }
    if (p === '/rest/v1/rpc/my_departures') {
      const d = srv.departed;
      if (!d || srv.member.has(d.org)) return json([]);
      return json([{ business_id: d.org, business_name: 'Big Co', kind: d.kind, at: T0, by_name: d.by,
        deliver: d.deliverUntil > Date.now(), deliver_until: d.deliverUntil ? new Date(d.deliverUntil).toISOString() : null,
        jobs: srv.sessions.filter(r => r.org_id === d.org).map(r => String(r.id)).sort() }]);
    }
    if (p === '/rest/v1/rpc/finish_delivery') { if (srv.departed) srv.departed.deliverUntil = 0; return json(true); }
    if (p === '/rest/v1/sessions') {
      if (method === 'GET') {
        const q = new URLSearchParams(u.split('?')[1] || '');
        let rows = srv.sessions.filter(r => mayHold(r.org_id));
        const id = q.get('id');
        if (id && id.startsWith('in.(')) { const set = id.slice(4, -1).split(',').map(s => s.replace(/^"|"$/g, '')); rows = rows.filter(r => set.includes(String(r.id))); }
        if (id && id.startsWith('eq.')) rows = rows.filter(r => String(r.id) === id.slice(3));
        if (id && id.startsWith('gt.')) rows = rows.filter(r => String(r.id) > id.slice(3));   // the full listing's pages
        if (q.get('order') === 'id.asc') rows = rows.slice().sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1));
        const lim = parseInt(q.get('limit') || '0', 10);
        if (lim > 0) rows = rows.slice(0, lim);
        return json(rows.map(r => Object.assign({ org: r.org_id }, r)));
      }
      // One refused row fails the whole statement, as in Postgres.
      const out = [];
      for (const row of (Array.isArray(body) ? body : [])) {
        const had = srv.sessions.find(r => String(r.id) === String(row.id));
        // org_stamp (V163): naming a business you've left, outside the delivery → refused
        if (!had && row.org_id && !mayHold(row.org_id) && srv.departed && srv.departed.org === row.org_id) {
          return json({ code: '42501', message: 'patgo_left_business: you are no longer in this business', details: null, hint: null }, 403);
        }
        let org = had ? had.org_id : (row.org_id && mayHold(row.org_id) ? row.org_id : srv.main);
        if (!mayHold(org)) return RLS();
        if (!srv.member.has(org) && row.deleted) return RLS();   // delivering: never a delete
        out.push(Object.assign({}, row, { user_id: E.id, org_id: org, updated_at: T0 }));
      }
      for (const r of out) {
        const i = srv.sessions.findIndex(x => String(x.id) === String(r.id));
        if (i === -1) srv.sessions.push(r); else srv.sessions[i] = r;
      }
      return new Response(null, { status: 201 });
    }
    if (p.startsWith('/rest/v1/rpc/')) return json([]);
    if (p.startsWith('/rest/v1/') || p.startsWith('/storage/v1/')) return method === 'GET' ? json([]) : new Response(null, { status: 201 });
    return json({ message: 'unexpected ' + u }, 404);
  };
  srv.posts = () => srv.calls.filter(c => c.path === '/rest/v1/sessions' && c.method === 'POST');
  srv.sentIds = () => srv.posts().flatMap(c => (Array.isArray(c.body) ? c.body : []).map(r => String(r.id)));
  srv.rpc = (name) => srv.calls.filter(c => c.path === '/rest/v1/rpc/' + name);
  return srv;
}

// Eddie's phone, signed in, offline at boot, then the library and online.
function phone(srv) {
  const ls = {
    [AUTH]: login(), 'pat:cloudUnlocked': '1',
    'pat:owner': JSON.stringify({ id: E.id, email: E.email, at: 1 }),
    'pat:businesses': JSON.stringify({ u: E.id, at: Date.now(), list: [
      { id: BIG, name: 'Big Co', role: 'engineer', def: true, n: 4 }, { id: OWN, name: '', role: 'owner', def: false, n: 1 }] }),
  };
  const app = bootApp({ localStorage: ls, navigator: { onLine: false } });
  app.state = () => app.refresh('state').state;
  const sb = app.sandbox;
  for (const k of ['Headers', 'Request', 'Response', 'AbortController', 'TextEncoder',
                   'TextDecoder', 'URLSearchParams', 'URL', 'atob', 'btoa', 'Blob']) sb[k] = globalThis[k];
  if (!sb.crypto) sb.crypto = globalThis.crypto;
  sb.WebSocket = class {};
  sb.fetch = srv.fetchImpl;
  app.run(LIB);
  app.stop = () => app.run('if (typeof _syncTimer !== "undefined" && _syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }');
  app.stop();
  const st = app.state();
  st.welcomeSeen = true;
  st.migrationPrompt = { show: false, name: '', items: [] };
  app.run('navigator.onLine = true');
  app.run('state.photoMetaReady = true');
  app.srv = srv;
  app.sheets = [];
  sb.openInfoSheet = (o) => { app.sheets.push(o); };
  return app;
}
function job(app, site, biz) {
  withSession(app, { site });
  withItem(app, { assetNo: 'ZZ-' + site });
  app.stop();
  const s = app.fn('activeSession')();
  app.run(`(() => { const s = state.sessions.find(x => x.id === ${JSON.stringify(s.id)}); ${biz ? `s.businessId = ${JSON.stringify(biz)};` : 'delete s.businessId;'} state.activeId = null; save(); })()`);
  return String(s.id);
}
const sync = async (app) => { const r = await app.fn('syncPull')({ manual: true }); app.stop(); await tick(5); return r; };
const has = (app, id) => app.state().sessions.some(s => String(s.id) === id);
const jobOf = (app, id) => app.state().sessions.find(s => String(s.id) === id);
const dep = (app) => JSON.parse(app.storage.getItem('pat:departed') || 'null');

module.exports = async function () {
  /* ------------------------------------------------------------------ 102a */
  await t.group('102a — removed with the last delivery: the unsent job goes INTO Big Co, then Big Co’s jobs come off; told on a sheet', async () => {
    const srv = cloud();
    const app = phone(srv);
    const safe = job(app, 'ZZSAFE');               // Big Co's (the main), sent below
    await sync(app);
    t.deepEq(srv.inBig(), [safe], 'before: the safe job is in Big Co');
    const unsent = job(app, 'ZZUNSENT');           // Big Co's, never sent
    const mine = job(app, 'ZZMINE', OWN);          // his own business's
    srv.remove(true);
    app.fn('businessReadOwe')();                   // PATGo opened again (the resume listener)
    // He opens the Business page first: the list is read again and his main is
    // now his own — the departures were read BEFORE it, while the stored list
    // still said Big Co was main, so the unmarked job is known to be Big Co's.
    await app.fn('businessRefresh')();
    t.eq(app.fn('businessDefault')().id, OWN, 'the list read again: his own business is main now');
    t.eq(app.fn('businessJobLeft')(jobOf(app, unsent)) && app.fn('businessJobLeft')(jobOf(app, unsent)).id, BIG, '…and the unmarked job is known to be Big Co’s');
    t.eq(jobOf(app, unsent).businessId, BIG, '…named so (the cloud never had it)');
    t.notOk('businessId' in jobOf(app, safe) && jobOf(app, safe).businessId === BIG, 'the job the cloud has is left as it is (its shield kept)');
    app.state().view = 'sessions';                 // on the Jobs list
    t.ok(await sync(app), 'the sync after removal succeeds');
    const order = srv.calls.map(c => c.path);
    t.ok(order.indexOf('/rest/v1/rpc/my_departures') > -1 &&
      order.indexOf('/rest/v1/rpc/my_departures') < order.lastIndexOf('/rest/v1/sessions'), 'the departure was read before anything was sent');
    t.deepEq(srv.inBig(), [safe, unsent].sort(), 'the never-sent job landed IN Big Co (6A) — not his own business');
    t.eq((srv.sessions.find(r => String(r.id) === mine) || {}).org_id, OWN, 'his own job went to his own business');
    t.eq(srv.rpc('finish_delivery').length, 1, 'the cloud was told the delivery is finished');
    t.notOk(has(app, safe), 'the safe Big Co job is off the phone (3B)');
    t.notOk(has(app, unsent), '…and the one just delivered');
    t.ok(has(app, mine), 'his own job stays');
    const d = dep(app);
    t.eq(d && d.list[0] && d.list[0].phase, 'done', 'the departure is settled');
    t.eq(d && d.list[0] && d.list[0].removed, 2, '…two jobs taken off');
    const afterDelivery = srv.sentIds().length;
    t.eq(app.sheets.length, 1, '5B: a sheet');
    t.includes(app.sheets[0] && app.sheets[0].message, 'You’ve been removed from Big Co by Olive.', '…who and where');
    t.includes(app.sheets[0] && app.sheets[0].message, 'All your work for Big Co was sent and has been taken off this phone (2 jobs).', '…what happened');
    app.sheets[0].onClose();
    t.eq(dep(app).list[0].told, true, 'told once');
    // After: nothing more for Big Co, ever, and no refusal.
    const n = srv.posts().length;
    job(app, 'ZZLATER', OWN);
    t.ok(await sync(app), 'a later sync succeeds');
    t.notOk(srv.sentIds().slice(afterDelivery).some(id => id === safe || id === unsent), 'nothing of Big Co’s was sent after the delivery finished');
    t.ok(srv.posts().length > n, 'his own work still goes');
    t.deepEq(srv.inBig(), [safe, unsent].sort(), 'nothing new in Big Co');
  });

  /* ------------------------------------------------------------------ 102b */
  await t.group('102b — cut off now: the unsent job stays read-only and is never sent; his own business keeps syncing; invited back', async () => {
    const srv = cloud();
    const app = phone(srv);
    const safe = job(app, 'ZZSAFE2');
    const edited = job(app, 'ZZEDITED');
    await sync(app);
    app.run(`state.activeId = ${JSON.stringify(edited)}`);
    withItem(app, { assetNo: 'ZZ-EDIT2' });       // sent once, then changed here
    app.stop();
    app.run('state.activeId = null');
    const unsent = job(app, 'ZZUNSENT2');
    srv.remove(false);
    app.fn('businessReadOwe')();
    app.state().view = 'overview';                 // busy in a job, not on the Jobs list
    const mine = job(app, 'ZZMINE2', OWN);
    t.ok(await sync(app), 'the sync succeeds — the Big Co job doesn’t stop the batch');
    t.eq((srv.sessions.find(r => String(r.id) === mine) || {}).org_id, OWN, 'his own job was sent');
    t.notOk(srv.sentIds().includes(unsent), 'the unsent Big Co job was never sent');
    t.eq(srv.rpc('finish_delivery').length, 0, 'no delivery to finish');
    t.notOk(has(app, safe), 'the safe job is off the phone');
    t.ok(has(app, unsent), 'the unsent one stays');
    t.eq(jobOf(app, unsent).locked, true, '…locked');
    t.eq(app.fn('businessJobLeftLine')(jobOf(app, unsent)), 'No longer in Big Co — this job stays with the business. It can’t be changed on this phone.', '…and says why');
    app.run(`state.activeId = ${JSON.stringify(unsent)}`);
    app.fn('unlockActiveSession')();
    t.eq(jobOf(app, unsent).locked, true, 'unlock refuses it');
    app.run(`state.editForm = { name: 'x', engineer: '', prefix: '', date: '2026-11-13', locked: false, instrumentId: '', site: 'ZZCHANGED', client: '' }`);
    app.fn('saveSessionEdits')();
    t.notOk(String(jobOf(app, unsent).site).includes('ZZCHANGED'), 'Job settings refuses a change');
    t.eq(jobOf(app, unsent).locked, true, '…and the lock stays');
    t.includes(app.fn('businessMoveBlockReason')(jobOf(app, unsent)), 'No longer in Big Co', 'Change… is refused with the same words');
    t.ok(has(app, edited) && jobOf(app, edited).locked, 'a job sent once but changed since stays too, read-only');
    t.eq(app.sheets.length, 0, 'not on the Jobs list: no sheet over his work');
    app.state().view = 'sessions';
    app.fn('render')();
    t.includes(app.doc.getElementById('app').innerHTML, 'id="biz-left-line"', 'the Jobs list draws the line');
    app.state().view = 'overview';
    t.includes(app.run('businessDepartedBannerHTML()'), 'You’ve been removed from Big Co.', '…the Jobs list line waits instead');
    app.fn('setView')('sessions');
    t.includes(app.sheets[0] && app.sheets[0].message, '2 jobs couldn’t be sent to Big Co, so they stay on this phone, read-only.', '5B: back on the Jobs list, the sheet — saying what stayed');
    app.sheets[0].onClose();
    t.eq(app.run('businessDepartedBannerHTML()'), '', 'told: the line goes');
    t.ok(app.fn('syncStatusSummary')().waiting === 0, 'it isn’t counted as waiting to send');
    // Its delete never goes either — the job's, or a photo's.
    app.run(`state.tombstones = (state.tombstones || []).concat([{ kind: 'session', id: ${JSON.stringify(safe)}, at: new Date().toISOString() }, { kind: 'photo', id: 'ZZPHOTO1', at: new Date().toISOString() }])`);
    const stx = JSON.parse(app.storage.getItem('pat:syncState'));
    stx.ph = stx.ph || { sent: {}, mv: {} }; stx.ph.sent = stx.ph.sent || {};
    stx.ph.sent.ZZPHOTO1 = { s: safe, i: 'ZZITEM1' };   // the shape _syncLoad keeps (job, item)
    // …and a phone that hasn't seen the whole cloud for ten months lists it all first.
    const old = new Date(Date.now() - 300 * 86400000).toISOString();
    stx.pulledAt = old; stx.seenAllAt = old;
    app.storage.setItem('pat:syncState', JSON.stringify(stx));
    const p0 = srv.posts().length, c0 = srv.calls.length;
    job(app, 'ZZMINE3', OWN);
    const okFull = await sync(app);
    if (!okFull) console.log('      (sync said: ' + app.state().sync.message + ')');
    t.ok(okFull, 'a sync with Big Co deletes pending, after the full listing, still succeeds');
    t.notOk(srv.posts().slice(p0).some(c => c.body.some(r => String(r.id) === safe && r.deleted)), 'the delete of a Big Co job is never sent');
    t.notOk(srv.calls.slice(c0).some(c => c.path === '/rest/v1/photos' && c.method === 'PATCH'), '…nor of its photo');
    t.ok(has(app, edited) && has(app, unsent), 'the full listing didn’t take the kept jobs for deleted elsewhere');
    t.notOk(app.run('JSON.stringify(_syncHeldLoad())').includes(edited), '…nor ask about them');
    // Invited back: it's his again.
    srv.rejoin();
    app.fn('businessReadOwe')();
    t.ok(await sync(app), 'after being invited back');
    t.eq(dep(app), null, 'the departure is gone');
    app.run(`state.activeId = ${JSON.stringify(unsent)}`);
    app.fn('unlockActiveSession')();
    t.eq(jobOf(app, unsent).locked, false, 'the job can be unlocked again');
    t.ok(await sync(app), 'and synced');
    t.ok(srv.inBig().includes(unsent), 'it reaches Big Co');
  });

  /* ------------------------------------------------------------------ 102c */
  await t.group('102c — removed while PATGo was open: the refused upload makes the next run read the departure first', async () => {
    const srv = cloud();
    const app = phone(srv);
    await sync(app);                                 // departures read at the start: none
    const big = job(app, 'ZZBIG');
    srv.remove(false);
    const before = srv.rpc('my_departures').length;
    t.notOk(await sync(app), 'the upload is refused (it names Big Co — never filed in his own)');
    t.notOk(srv.sessions.some(r => String(r.id) === big), '…so nothing of Big Co’s landed anywhere');
    t.ok(srv.rpc('my_departures').length === before, 'that run had no reason to ask');
    const mine = job(app, 'ZZMINE4', OWN);
    t.ok(await sync(app), 'the next run succeeds');
    t.ok(srv.rpc('my_departures').length > before, '…because it read the departure first');
    t.eq((srv.sessions.find(r => String(r.id) === mine) || {}).org_id, OWN, 'his own job went');
    t.ok(has(app, big) && jobOf(app, big).locked, 'the Big Co job stays, read-only');
  });

  /* ------------------------------------------------------------------ 102d */
  await t.group('102d — the Business page: Remove (1A), Leave (2A), the remove sheet (4C), each choice its own flag', async () => {
    const app = freshApp();
    app.run(`cloudUserId = () => 'me';`);
    const OWNR = '44444444-4444-4444-8444-444444444444', TL = '55555555-5555-4555-8555-555555555555', OF = '66666666-6666-4666-8666-666666666666';
    const team = (myRole) => app.run(`(() => {
      _bizTeam = { u: 'me', people: [
        { org: ${JSON.stringify(BIG)}, user: 'me', name: 'Me', role: ${JSON.stringify(myRole)}, you: true, email: '' },
        { org: ${JSON.stringify(BIG)}, user: ${JSON.stringify(OWNR)}, name: 'Olive', role: 'owner', you: false, email: '' },
        { org: ${JSON.stringify(BIG)}, user: ${JSON.stringify(TL)}, name: 'Tom', role: 'team_leader', you: false, email: '' },
        { org: ${JSON.stringify(BIG)}, user: ${JSON.stringify(E.id)}, name: 'Eddie', role: 'engineer', you: false, email: '' },
        { org: ${JSON.stringify(BIG)}, user: ${JSON.stringify(OF)}, name: 'Fran', role: 'office', you: false, email: '' }], invites: [] };
      return businessPeopleHTML({ id: ${JSON.stringify(BIG)}, role: ${JSON.stringify(myRole)}, name: 'Big Co' }, 0);
    })()`);
    const removable = (h) => (h.match(/data-action="biz-remove" data-arg="[^"]+:([^"]+)"/g) || []).map(x => x.split(':').pop().replace('"', '')).sort();
    t.deepEq(removable(team('owner')), [E.id, OF, TL].sort(), 'the Owner may remove everyone but the Owner');
    t.deepEq(removable(team('team_leader')), [E.id], 'a Team leader: Engineers only');
    t.deepEq(removable(team('office')), [E.id], 'Office: Engineers only');
    t.deepEq(removable(team('engineer')), [], 'an Engineer: nobody');
    // Leave: every card but one you own.
    app.run(`businessSave({ u: 'me', at: Date.now(), list: [{ id: ${JSON.stringify(OWN)}, name: '', role: 'owner', def: true, n: 1 }, { id: ${JSON.stringify(BIG)}, name: 'Big Co', role: 'engineer', def: false, n: 4 }] })`);
    app.run(`state.cloud = Object.assign(state.cloud || {}, { status: 'signed-in' }); cloudUserId = () => 'me';`);
    const page = app.run('renderCloudBusiness()');
    t.includes(page, `data-action="biz-leave" data-arg="${BIG}"`, 'Leave Big Co offered');
    t.excludes(page, `data-action="biz-leave" data-arg="${OWN}"`, 'never for the business you own');
    // 4C: the remove sheet — devices, then the two choices.
    const calls = [];
    let sheet = null;
    app.sandbox.openChoiceSheet = (o) => { sheet = o; };
    app.sandbox._bizCall = (name, args) => { calls.push({ name, args }); return Promise.resolve(name === 'member_devices'
      ? [{ kind: 'iPhone', app_version: 'V163', last_used: '2026-11-13T14:02:00.000Z' }, { kind: 'Device', app_version: 'V150', last_used: null }] : true); };
    app.sandbox.businessAfterChange = () => Promise.resolve(true);
    app.run(`businessSave({ u: 'me', at: Date.now(), list: [{ id: ${JSON.stringify(BIG)}, name: 'Big Co', role: 'owner', def: true, n: 4 }] })`);
    team('owner');
    t.ok(app.fn('businessRemoveStart')(`${BIG}:${E.id}`), 'Remove Eddie');
    await tick(5);
    t.eq(calls[0] && calls[0].name, 'member_devices', 'his devices read first');
    t.includes(sheet && sheet.title, 'Remove Eddie from Big Co?', 'the sheet');
    t.eq(sheet && sheet.lines.length, 2, '…one line per device');
    t.includes(sheet && sheet.lines[0], 'iPhone · V163 · last used 13/11/2026', '…named, versioned, when used');
    t.eq(sheet && sheet.lines[1], 'Device · V150 · not used yet', '…a device never used says so');
    t.includes(sheet && sheet.message, 'ask them to Sync first', '…the warning (4C), never a block');
    t.includes(sheet && sheet.choices[0].label, 'let their phone send what it’s still holding (up to 7 days)', 'the default: the last delivery (6A)');
    t.eq(sheet && sheet.choices[1].label, 'Remove — cut off now', 'the other: cut off now');
    sheet.choices[1].onPick();
    await tick(5);
    t.deepEq(calls[1], { name: 'remove_member', args: { o: BIG, u: E.id, deliver: false } }, 'cut off now sends deliver: false');
    sheet.choices[0].onPick();
    await tick(5);
    t.deepEq(calls[2], { name: 'remove_member', args: { o: BIG, u: E.id, deliver: true } }, 'the default sends deliver: true');
    t.notOk(app.fn('businessRemoveStart')(`${BIG}:${OWNR}`), 'the Owner is never offered');
    // 2A: Leave asks first.
    app.run(`businessSave({ u: 'me', at: Date.now(), list: [{ id: ${JSON.stringify(OWN)}, name: '', role: 'owner', def: true, n: 1 }, { id: ${JSON.stringify(BIG)}, name: 'Big Co', role: 'engineer', def: false, n: 4 }] })`);
    let confirm = null;
    app.sandbox.openConfirmSheet = (o) => { confirm = o; };
    t.ok(app.fn('businessLeaveStart')(BIG), 'Leave Big Co');
    t.includes(confirm && confirm.message, 'This phone first sends anything you haven’t sent yet', 'asked first, saying what happens');
    confirm.onConfirm();
    await tick(5);
    t.deepEq(calls[3], { name: 'leave_business', args: { o: BIG } }, '…then leaves');
    t.notOk(app.fn('businessLeaveStart')(OWN), 'never your own business');
    t.eq(app.fn('businessTeamError')({ message: 'patgo_owner_leave' }), 'You own this business, so you can’t leave it.', 'the Owner’s refusal in words');
  });

  /* ------------------------------------------------------------------ 102e */
  await t.group('102e — the SQL: schema.sql in step; the rules; L1–L5', () => {
    const mig = read('supabase/v163-leaving.sql');
    const block = mig.slice(mig.indexOf('-- ================================================================ V163\n'),
      mig.indexOf('-- ================================================================ end V163\n') + '-- ================================================================ end V163\n'.length);
    t.ok(block.length > 6000, 'the migration has its definition');
    // V165: no longer the LAST section (V165's follows — 104e); still whole, and
    // nothing after it redefines what it defines.
    const sch = read('supabase/schema.sql');
    t.ok(sch.includes(block), 'a new project gets it byte for byte');
    t.excludes(sch.slice(sch.indexOf(block) + block.length), 'function public.org_stamp', '…and no later section redefines org_stamp');
    t.includes(block, "using ((user_id = (select auth.uid()) and public.may_hold(org_id))", 'jobs and photos: readable during the delivery');
    t.includes(block, "(public.my_role(org_id) is not null or (public.may_hold(org_id) and not deleted))", '…writable, never marked deleted');
    t.includes(block, "and d.deliver_until > now())", 'the window ends by itself');
    t.includes(block, "as restrictive for all to authenticated", 'the photo-file rule is restrictive');
    t.includes(block, "if m.role = 'owner' then raise exception 'patgo_not_allowed'; end if;", 'the Owner can’t be made to leave');
    t.includes(block, "if not public._may_offer(o, r) then raise exception 'patgo_not_allowed'; end if;", '1A: who may invite them may remove them');
    t.includes(block, "if r = 'owner' then raise exception 'patgo_owner_leave'; end if;", '2A: the Owner can’t leave');
    t.includes(block, "update public.job_moves set status = 'dropped'", 'their waiting moves are dropped');
    t.includes(block, "case when deliver then now() + interval '7 days' end", '6A: seven days at most');
    t.includes(block, "and not (tg_table_name in ('sessions', 'photos') and public._delivering_for(new.org_id, new.user_id)) then", 'a delivered job stays in the business it was made for');
    t.includes(block, "update public.records set org_id = tgt where user_id = u and org_id = o;", 'their lists follow them');
    for (const n of ['1', '2', '3', '4', '5']) t.includes(mig, `select ${n}, '`, 'self-check L' + n);
    t.eq(read('business.js').match(/const BUSINESS_DELIVER_DAYS = (\d+);/)[1], '7', 'the app says the same 7 days');
    const iso = read('supabase/isolation-test.sql');
    for (const g of ['29a', '29b', '29c', '29d', '29e']) t.includes(iso, `res := res || array['${g}|`, 'isolation ' + g);
    t.includes(iso, "29a|A removes B from A''s business|FAIL|run supabase/v163-leaving.sql first", '…29a names the file when it hasn’t been run');
  });

  /* ------------------------------------------------------------------ 102f */
  // V164: the release checks moved to 103f; this keeps V163's own About line.
  await t.group('102f — V163’s About line; business.js names V163', () => {
    t.includes(read('render-help.js'), 'Leaving and removing: someone can be removed from a business', 'About: V163’s line');
    t.includes(read('business.js'), 'V163 — leaving and removing a member', 'business.js names V163');
  });
};
