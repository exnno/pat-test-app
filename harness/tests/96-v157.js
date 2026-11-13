/* Standing test — V157: the Approve / Refuse screen (Teams v1)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   Peter, 11 Nov — R67, 1A 2A 3A 4A 5A (the defaults): 1A the Business page
   lists the moves waiting for an approver, the Jobs list says how many · 2A
   who, the job, items, from → to, the day asked; Approve / Refuse · 3A Refuse
   asked first, no reason · 4A the asker is told once on the Jobs list and Job
   settings names who decided · 5A nothing expires. What these groups pin:
     96a  business.js on its own: waiting rows from the cloud (bad values made
          safe), the words, a second approver's words, the decided line with
          who, the asker's "tell" (only a request this phone knew as waiting).
     96b  On screen: the Business page section — in the right business's card,
          approvers only; the Jobs list line with See; nothing waiting, nothing.
     96c  Deciding against a pretend Supabase: asked first, decide_job_move,
          said, the list read again; Refuse the same; the job finished first;
          already decided by someone else; no signal; read with the businesses.
     96d  The asker: the Jobs list line once (approved / refused by whom), OK
          clears it for good; several at once; Job settings names who decided.
     96e  Release: V157; cache pat-v157; What's new rolled (two lines); About
          V157 / V156 / V155.
     96f  The SQL's text: schema.sql carries v157-approvals.sql's block byte for
          byte; never the asker's own; approvers only; who decided; the second
          approver's detail; isolation 25a–25e.

   ⚠ WHAT THIS FILE CANNOT PROVE: that the database lists and decides what it
   should. That is supabase/v157-approvals.sql's own checks (W1–W3) and
   isolation-test.sql 25a–25e — run at V157 against a local Postgres 16
   stand-in (an upgraded project and a new one), plus a 20-step scenario with
   five people (Owner, Office, two Engineers, an outsider). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { freshApp, tick } = require('../fixture');

const LIB  = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;
const UID  = '11111111-1111-1111-1111-111111111111';
const AUTH = 'patgo:cloudAuth:test';
const OWN  = 'aaaaaaaa-0000-4000-8000-000000000001';   // my business (Owner)
const TEAM = 'aaaaaaaa-0000-4000-8000-000000000002';   // a business I'm an Engineer in
const DAVE = 'aaaaaaaa-0000-4000-8000-000000000003';   // Dave's own business (not mine)
const MV1  = 'cccccccc-0000-4000-8000-000000000001';
const MV2  = 'cccccccc-0000-4000-8000-000000000002';
const MV3  = 'cccccccc-0000-4000-8000-000000000003';
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const stored = (list, u = UID, at = Date.now()) => JSON.stringify({ u, at, list });

function storedSession() {
  const life = 3600;
  return JSON.stringify({
    access_token: 'ZZACCESS157', token_type: 'bearer', expires_in: life,
    expires_at: Math.floor(Date.now() / 1000) + life, refresh_token: 'ZZREFRESH',
    user: { id: UID, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' },
  });
}

const WAITING = () => [
  { id: MV1, business_id: OWN, from_name: 'Birchley Testing', to_org: DAVE, to_name: 'Smith Electrical',
    asker: 'Dave Smith', job: 'Tesco – Lincoln', items: 42, job_date: '2026-11-10', requested_at: '2026-11-10T09:00:00.123456+00:00' },
  { id: MV2, business_id: OWN, from_name: 'Birchley Testing', to_org: DAVE, to_name: 'Smith Electrical',
    asker: '', job: '', items: 1, job_date: '', requested_at: '2026-11-11T09:00:00Z' },
];
const BIZ = () => [
  { id: OWN, name: 'Birchley Testing', role: 'owner', is_default: true, members: 3 },
  { id: TEAM, name: 'Big Co', role: 'engineer', is_default: false, members: 5 },
];

// A pretend Supabase for the V157 rpcs (plus what start-up reads).
function fakeServer() {
  const calls = [];
  const srv = { calls, refuse: '', refuseWith: '', details: '', waiting: WAITING(), decide: 'moved', moves: [], biz: BIZ(), noList: false };
  srv.fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    let body = null;
    if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    calls.push({ url: u, method, body });
    const rpc = (u.match(/\/rest\/v1\/rpc\/([a-z_]+)$/) || [])[1];
    if (rpc && rpc === srv.refuse) return json({ message: srv.refuseWith, code: 'P0002', details: srv.details || null }, 400);
    if (rpc === 'business_waiting_moves') return srv.noList ? json({ message: 'Could not find the function' }, 404) : json(srv.waiting);
    if (rpc === 'decide_job_move') { srv.waiting = srv.waiting.filter(w => w.id !== body.move); return json(srv.decide); }
    if (rpc === 'my_job_moves') return json(srv.moves);
    if (rpc === 'my_businesses') return json(srv.biz);
    if (rpc === 'my_invites' || rpc === 'business_people' || rpc === 'business_invites') return json([]);
    if (rpc === 'my_billing') return json({ plan: 'comped', role: 'owner', can_manage: true });
    if (u.includes('/rest/v1/')) return method === 'GET' ? json([]) : new Response(null, { status: 201 });
    if (u.includes('/storage/v1/')) return json([]);
    return json({ message: 'unexpected ' + u }, 404);
  };
  srv.rpcs = (name) => calls.filter(c => c.url.endsWith('/rest/v1/rpc/' + name));
  return srv;
}

async function signedIn(o = {}) {
  const ls = Object.assign({ [AUTH]: storedSession(), 'pat:cloudUnlocked': '1',
    'pat:businesses': stored([{ id: OWN, name: 'Birchley Testing', role: 'owner', def: true, n: 3 },
                              { id: TEAM, name: 'Big Co', role: 'engineer', def: false, n: 5 }]) }, o.localStorage || {});
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
  app.toasts = [];
  sb.showToast = (m) => app.toasts.push(String(m));
  app.run('if (typeof _syncTimer !== "undefined" && _syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }');
  for (let k = 0; k < 100 && app.run("(state.cloud && state.cloud.status) || ''") !== 'signed-in'; k++) await tick(10);
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
function tap(app, action, arg) {
  const el = app.doc.createElement('button');
  el.dataset.action = action;
  if (arg !== undefined) el.dataset.arg = String(arg);
  app.doc.getElementById('app').dispatchEvent({
    type: 'click', target: el, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
  });
}
function attrOf(h, id, attr) {
  const m = h.match(new RegExp(`id="${id}"[^>]*${attr}="([^"]+)"`));
  return m ? m[1] : null;
}
const sheets = (app) => app.doc.body.children.filter(c => /bulk-sheet/.test(c.className || ''));
const topSheet = (app) => { const s = sheets(app); return s.length ? s[s.length - 1].innerHTML : ''; };
// The waiting list read the way start-up reads it (with the businesses).
async function readAll(app) {
  await app.run(`_bizClient().then((c) => businessRead(c, '${UID}'))`);
}
async function openBusiness(app) {
  app.fn('setView')('cloudBusiness');
  await until(() => app.srv.rpcs('business_waiting_moves').length > 0 && !app.run('_biz().reading'));
  app.fn('render')();
  return html(app);
}
function jobsList(app) {
  app.state().view = 'sessions';
  app.fn('render')();
  return html(app);
}

module.exports = async function () {
  /* ------------------------------------------------------------------ 96a */
  await t.group('96a — business.js: waiting rows made safe, the words, a second approver, who decided, tell', async () => {
    const app = freshApp();
    const rows = JSON.parse(app.run(`JSON.stringify(businessWaitingFromRows('${UID}', [
      ${JSON.stringify(WAITING()[0])},
      { id: 'not-an-id', business_id: '${OWN}', to_org: '${DAVE}' },
      { id: '${MV3}', business_id: '${OWN}', to_org: '${DAVE}', asker: 'x'.repeat(200), job: 'y'.repeat(300), items: -4 },
      { id: '${MV2}', business_id: '${OWN}', to_org: '${DAVE}', items: '7.5' },
      null, 'junk']).list)`));
    t.eq(rows.length, 3, 'three rows; a bad id, null and a string dropped');
    t.deepEq(rows[0], { id: MV1, org: OWN, to: DAVE, fromName: 'Birchley Testing', toName: 'Smith Electrical',
      who: 'Dave Smith', job: 'Tesco – Lincoln', items: 42, at: '2026-11-10T09:00:00.123456+00:00' }, 'a good row in the phone’s shape');
    t.ok(rows[1].who.length === 60 && rows[1].job.length === 120 && rows[1].items === 0, 'long words cut; a negative count is 0');
    t.eq(rows[2].items, 0, 'a count that isn’t a whole number is 0');
    const w = (row) => app.run(`businessWaitingWords(businessWaitingFromRows('${UID}', [${JSON.stringify(row)}]).list[0])`);
    const d = (row) => app.run(`businessWaitingDetail(businessWaitingFromRows('${UID}', [${JSON.stringify(row)}]).list[0])`);
    t.eq(w(WAITING()[0]), 'Dave Smith wants to move “Tesco – Lincoln” to Smith Electrical', '2A: who, the job, where to');
    t.eq(d(WAITING()[0]), '42 items · asked 10/11/2026', '…how many items, the day asked (UK, microseconds read)');
    t.eq(w(WAITING()[1]), 'Someone wants to move a job to Smith Electrical', 'no name, no job: still words');
    t.eq(d(WAITING()[1]), '1 item · asked 11/11/2026', '…one item');
    // a second approver (detail 'status|name|you')
    const stale = (details) => app.run(`businessStaleWords(${JSON.stringify({ message: 'patgo_move_stale', details })})`);
    t.eq(stale('refused|Sarah|'), 'Already refused by Sarah.', 'already refused by Sarah');
    t.eq(stale('moved|Peter|'), 'Already approved by Peter — the job has moved.', 'already approved by Peter');
    t.eq(stale('refused|Peter|you'), 'Already refused by you.', '…by you');
    t.eq(stale('cancelled|Dave Smith|'), 'Dave Smith took the request back.', 'the asker took it back');
    t.eq(stale('dropped||'), 'The job was finished first, so it stays put.', 'dropped');
    t.eq(stale(null), 'Someone has already decided this one.', 'two at once: no detail, no name');
    t.eq(app.run(`businessTeamError({ message: 'patgo_move_stale: no longer waiting', details: 'refused|Sarah|' })`), 'Already refused by Sarah.', 'the cloud’s refusal goes to those words');
    t.eq(app.run(`businessTeamError({ message: 'patgo_move_self' })`), 'You asked for this move — someone else in the business has to decide it.', 'your own: said');
    // who decided, on Job settings (4A)
    const line = (m) => app.run(`businessMoveLine(${JSON.stringify(m)})`);
    const base = { from: OWN, to: DAVE, fromName: 'Birchley Testing', toName: 'Smith Electrical', at: '2026-11-11T09:00:00Z' };
    t.eq(line(Object.assign({ st: 'refused', by: 'Sarah' }, base)), 'Move to Smith Electrical refused by Sarah · 11/11/2026', '4A: refused by Sarah');
    t.eq(line(Object.assign({ st: 'moved', by: 'Peter' }, base)), 'Moved from Birchley Testing to Smith Electrical · approved by Peter · 11/11/2026', '…approved by Peter');
    t.eq(line(Object.assign({ st: 'moved', by: '' }, base)), 'Moved from Birchley Testing to Smith Electrical · 11/11/2026', 'a move of your own: no name');
    // tell: only a request this phone last knew as waiting
    app.run(`cloudUserId = () => '${UID}'`);
    const row = (st, name = 'Sarah') => ({ id: MV1, session_id: 'job-1', from_org: OWN, to_org: DAVE, from_name: 'A', to_name: 'B', status: st, decided_name: name, requested_at: '2026-11-10T09:00:00Z' });
    const tellOf = () => JSON.parse(app.run(`JSON.stringify(businessMovesLoad().list.map(m => [m.st, m.tell, m.by]))`));
    app.run(`businessMovesFromRows('${UID}', [${JSON.stringify(row('refused'))}])`);
    t.deepEq(tellOf(), [['refused', false, 'Sarah']], 'first read, already refused: kept, not told (it never waited here)');
    app.run(`localStorage.removeItem(JOB_MOVES_KEY)`);
    app.run(`businessMovesFromRows('${UID}', [${JSON.stringify(row('waiting', ''))}])`);
    app.run(`businessMovesFromRows('${UID}', [${JSON.stringify(row('refused'))}])`);
    t.deepEq(tellOf(), [['refused', true, 'Sarah']], 'waiting here, then refused: told');
    app.run(`businessMovesFromRows('${UID}', [${JSON.stringify(row('refused'))}])`);
    t.deepEq(tellOf(), [['refused', true, 'Sarah']], '…carried on the next read until OK');
    app.run(`localStorage.removeItem(JOB_MOVES_KEY)`);
    app.run(`businessMovesFromRows('${UID}', [${JSON.stringify(row('waiting', ''))}])`);
    app.run(`businessMovesFromRows('${UID}', [${JSON.stringify(row('cancelled', ''))}])`);
    t.deepEq(tellOf(), [['cancelled', false, '']], 'cancelled: nothing to tell');
    app.run(`localStorage.setItem(JOB_MOVES_KEY, ${JSON.stringify(stored([{ id: MV1, job: 'job-1', from: OWN, to: DAVE, st: 'waiting' }], '99999999-9999-4999-8999-999999999999'))})`);
    app.run(`businessMovesFromRows('${UID}', [${JSON.stringify(row('moved', 'Peter'))}])`);
    t.deepEq(tellOf(), [['moved', false, 'Peter']], 'another account’s waiting request says nothing');
    app.run(`localStorage.setItem(JOB_MOVES_KEY, ${JSON.stringify(stored([{ id: MV1, job: 'job-1', from: OWN, to: DAVE, st: 'waiting', tell: true, by: 'x'.repeat(100) }]))})`);
    t.deepEq(tellOf(), [['waiting', false, 'x'.repeat(60)]], 'stored: tell only on a decided one; a long name cut');
  });

  /* ------------------------------------------------------------------ 96b */
  await t.group('96b — on screen: the Business page section, approvers only; the Jobs list line; nothing waiting', async () => {
    const app = await signedIn();
    const h = await openBusiness(app);
    t.ok(app.srv.rpcs('business_waiting_moves').length >= 1, '1A: read with the businesses');
    t.includes(h, 'id="biz-wait-title-0">Waiting for your approval</h4>', 'my business’s card: Waiting for your approval');
    t.includes(h, 'id="biz-wait-words-0-0">Dave Smith wants to move “Tesco – Lincoln” to Smith Electrical</p>', '2A: who, the job, where to');
    t.includes(h, 'id="biz-wait-detail-0-0">42 items · asked 10/11/2026</p>', '…items, the day asked');
    t.eq(attrOf(h, 'biz-approve-0-0', 'data-arg'), MV1, 'Approve names that request');
    t.eq(attrOf(h, 'biz-refuse-0-0', 'data-arg'), MV1, 'Refuse names that request');
    t.includes(h, 'id="biz-wait-words-0-1">Someone wants to move a job to Smith Electrical</p>', 'the second request');
    t.excludes(h, 'id="biz-wait-1"', 'the business I’m an Engineer in: no section');
    const c0 = h.indexOf('id="biz-card-0"'), c1 = h.indexOf('id="biz-card-1"'), w0 = h.indexOf('id="biz-wait-0"');
    t.ok(c0 > -1 && c1 > c0 && w0 > c0 && w0 < c1, 'the section sits inside my business’s card');
    // a second business I'm the Office of: its request in its own card only
    const OFF = 'aaaaaaaa-0000-4000-8000-000000000004';
    app.run(`businessSave({ u: '${UID}', at: Date.now(), list: businessLoad().list.concat([{ id: '${OFF}', name: 'Office Co', role: 'office', def: false, n: 2 }]) })`);
    app.run(`_bizWait.list = _bizWait.list.concat([Object.assign({}, _bizWait.list[0], { id: '${MV3}', org: '${OFF}', who: 'Al' })])`);
    app.state().view = 'cloudBusiness';
    app.fn('render')();
    const h3 = html(app);
    t.includes(h3, 'id="biz-wait-words-2-0">Al wants to move', 'another business I approve for: its request in its own card');
    t.excludes(h3.slice(h3.indexOf('id="biz-card-0"'), h3.indexOf('id="biz-card-1"')), 'Al wants', '…never in my business’s card');
    app.run(`_bizWait.list = _bizWait.list.filter(w => w.id !== '${MV3}')`);
    // the Jobs list line
    let j = jobsList(app);
    t.includes(j, 'id="wait-banner-text">2 job moves are waiting for your approval.</div>', 'the Jobs list: how many');
    t.eq(attrOf(j, 'wait-banner-open', 'data-arg'), 'cloudBusiness', '…See opens the Business page');
    app.run(`_bizWait.list = _bizWait.list.slice(0, 1)`);
    t.includes(jobsList(app), 'id="wait-banner-text">A job move is waiting for your approval.</div>', '…one: said so');
    // a request for a business where I'm only an Engineer is never shown (the database
    // lists none; the phone checks the role too)
    app.run(`_bizWait.list = [Object.assign({}, _bizWait.list[0], { org: '${TEAM}' })]`);
    app.fn('setView')('cloudBusiness');
    app.fn('render')();
    t.excludes(html(app), 'id="biz-wait-1"', 'an Engineer’s card never shows the section');
    // nothing waiting: nothing at all
    const none = await signedIn();
    none.srv.waiting = [];
    await openBusiness(none);
    t.excludes(html(none), 'Waiting for your approval', 'nothing waiting: no section');
    t.excludes(jobsList(none), 'wait-banner', '…and no Jobs list line');
    // another account's list is never shown
    const other = await signedIn();
    await readAll(other);
    other.run(`_bizWait.u = '99999999-9999-4999-8999-999999999999'`);
    t.excludes(jobsList(other), 'wait-banner', 'another account’s list: nothing');
    // a project without the V157 SQL: the page as V156 drew it
    const old = await signedIn();
    old.srv.noList = true;
    const oh = await openBusiness(old);
    t.excludes(oh, 'Waiting for your approval', 'no V157 SQL: no section');
    t.includes(oh, 'id="biz-name-0">Birchley Testing</h3>', '…the page as before');
  });

  /* ------------------------------------------------------------------ 96c */
  await t.group('96c — deciding: asked first, decide_job_move, said, read again; Refuse; finished first; already decided; no signal', async () => {
    const app = await signedIn();
    await openBusiness(app);
    const reads = app.srv.rpcs('business_waiting_moves').length;
    tap(app, 'biz-approve', MV1);
    let sh = topSheet(app);
    t.includes(sh, 'Approve this move?', 'Approve: asked first');
    t.includes(sh, '“Tesco – Lincoln” moves from Birchley Testing to Smith Electrical, with its photos. Dave Smith carries on with it there.', '…what happens');
    t.eq(app.srv.rpcs('decide_job_move').length, 0, '…nothing sent yet');
    app.doc.getElementById('confirm-sheet-yes').click();
    await until(() => app.srv.rpcs('decide_job_move').length > 0);
    t.deepEq(app.srv.rpcs('decide_job_move')[0].body, { move: MV1, approve: true }, 'decide_job_move: that request, approve');
    await until(() => app.toasts.length > 0);
    t.ok(app.toasts.includes('Approved — the job has moved to Smith Electrical'), 'said');
    await until(() => app.srv.rpcs('business_waiting_moves').length > reads);
    app.fn('render')();
    t.excludes(html(app), MV1, 'the list read again: gone');
    // Refuse (3A): asked first, no reason
    app.srv.decide = 'refused';
    tap(app, 'biz-refuse', MV2);
    sh = topSheet(app);
    t.includes(sh, 'Refuse this move?', 'Refuse: asked first');
    t.includes(sh, 'A job stays in Birchley Testing. The person who asked sees that it was refused.', '…what happens');
    t.excludes(sh, '<input', '…no reason asked for (3A)');
    t.excludes(sh, '<textarea', '…none');
    app.doc.getElementById('confirm-sheet-yes').click();
    await until(() => app.srv.rpcs('decide_job_move').length > 1);
    t.deepEq(app.srv.rpcs('decide_job_move')[1].body, { move: MV2, approve: false }, 'decide_job_move: refuse');
    await until(() => app.toasts.includes('Refused — the job stays where it is'));
    t.ok(app.toasts.includes('Refused — the job stays where it is'), 'said');
    // the job was finished first
    const f = await signedIn();
    await openBusiness(f);
    f.srv.decide = 'dropped';
    await f.run(`businessDecideGo('${MV1}', true)`);
    t.includes(topSheet(f), 'The job was finished first, so it stays put.', 'dropped: said plainly');
    // already decided by someone else (Claude's call)
    const s = await signedIn();
    await openBusiness(s);
    s.srv.refuse = 'decide_job_move'; s.srv.refuseWith = 'patgo_move_stale: that request is no longer waiting'; s.srv.details = 'refused|Sarah|';
    const before = s.srv.rpcs('business_waiting_moves').length;
    await s.run(`businessDecideGo('${MV1}', true)`);
    t.includes(topSheet(s), 'Already refused by Sarah.', 'a second approver: who decided');
    t.ok(s.srv.rpcs('business_waiting_moves').length > before, '…and the list read again');
    // no signal: nothing sent
    const n = await signedIn();
    await openBusiness(n);
    n.run('navigator.onLine = false');
    await n.run(`businessDecideGo('${MV1}', true)`);
    t.ok(n.toasts.includes('You need a signal to decide a move.'), 'no signal: said');
    t.eq(n.srv.rpcs('decide_job_move').length, 0, '…nothing sent');
    n.run('navigator.onLine = true');
    // a request the list doesn't hold: nothing to ask
    t.eq(n.run(`businessDecideStart('${MV3}', true)`), false, 'a request not on the list: nothing asked');
    // through the minimum-version gate, like every cloud action
    t.includes(read('business.js'), "return _bizCall('decide_job_move', { move: id, approve: !!approve }, 'You need a signal to decide a move.')", 'deciding goes through _bizCall (_bizClient: the minimum version)');
    // read on start / return: with the businesses
    const st = await signedIn();
    await readAll(st);
    t.ok(st.srv.rpcs('business_waiting_moves').length >= 1, '1A: read with the businesses on start / return');
    t.eq(st.run('businessWaiting().length'), 2, '…held for this account');
  });

  /* ------------------------------------------------------------------ 96d */
  await t.group('96d — the asker: the Jobs list line once, OK clears it; several; Job settings names who', async () => {
    const app = await signedIn({ localStorage: {
      'pat:jobMoves': stored([{ id: MV1, job: 'job-1', from: TEAM, to: OWN, st: 'waiting', fromName: 'Big Co', toName: 'Birchley Testing' }]) } });
    app.state().sessions.push({ id: 'job-1', name: 'Job 1', site: 'Big Co – Unit 4', date: '2026-11-10', items: [], businessId: TEAM });
    app.srv.waiting = [];
    app.srv.moves = [{ id: MV1, session_id: 'job-1', from_org: TEAM, from_name: 'Big Co', to_org: OWN, to_name: 'Birchley Testing',
      status: 'refused', requested_at: '2026-11-10T09:00:00Z', decided_at: '2026-11-11T09:00:00Z', decided_name: 'Sarah' }];
    await readAll(app);
    let j = jobsList(app);
    t.includes(j, 'id="decided-banner-text">Your move of “Big Co – Unit 4” to Birchley Testing was refused by Sarah — it stays in Big Co.</div>', '4A: told on the Jobs list — refused, by whom');
    t.eq(attrOf(j, 'decided-banner-ok', 'data-action'), 'biz-told', '…OK');
    tap(app, 'biz-told');
    t.excludes(jobsList(app), 'decided-banner', 'OK: gone');
    await readAll(app);
    t.excludes(jobsList(app), 'decided-banner', '…and stays gone after the next read');
    // Job settings names who decided
    t.eq(app.run(`businessMoveLine(businessMoveFor('job-1'))`), 'Move to Birchley Testing refused by Sarah · 11/11/2026', 'Job settings: refused by Sarah');
    // approved
    const ok = await signedIn({ localStorage: {
      'pat:jobMoves': stored([{ id: MV1, job: 'job-1', from: TEAM, to: OWN, st: 'waiting' }]) } });
    ok.srv.waiting = [];
    ok.srv.moves = [Object.assign({}, app.srv.moves[0], { status: 'moved', decided_name: 'Peter' })];
    await readAll(ok);
    t.includes(jobsList(ok), 'id="decided-banner-text">Your job move to Birchley Testing was approved by Peter.</div>', 'approved by Peter (a job not on this phone: “Your job move”)');
    // several at once
    const many = await signedIn({ localStorage: {
      'pat:jobMoves': stored([{ id: MV1, job: 'job-1', from: TEAM, to: OWN, st: 'waiting' }, { id: MV2, job: 'job-2', from: TEAM, to: OWN, st: 'waiting' }]) } });
    many.srv.waiting = [];
    many.srv.moves = [Object.assign({}, app.srv.moves[0]), Object.assign({}, app.srv.moves[0], { id: MV2, session_id: 'job-2', status: 'moved', decided_name: 'Peter' })];
    await readAll(many);
    t.includes(jobsList(many), 'id="decided-banner-text">2 of your job moves have been decided — Job settings on each job says how.</div>', 'several: one line');
    // nothing decided: nothing said
    const quiet = await signedIn();
    quiet.srv.waiting = [];
    await readAll(quiet);
    t.excludes(jobsList(quiet), 'decided-banner', 'nothing decided: nothing');
  });

  /* ------------------------------------------------------------------ 96e */
  await t.group('96e — V157’s What’s new and About lines (its release checks → 97e at V158)', () => {
    const rel = freshApp();
    t.eq(rel.fn('updateVersionLabel')('pat-v157'), 'V157', 'the update banner reads the key as V157');
    // V163: V157's What's new rolled off with V163's welcome (102f checks the new one).
    t.excludes(read('render-core.js'), '<li><strong>Approve or refuse job moves.</strong>', 'V157’s What’s new rolled off at V163');
    // V160: V157's About line rolled off (99f checks it's gone).
  });

  /* ------------------------------------------------------------------ 96f */
  await t.group('96f — the SQL: schema.sql in step; never the asker’s own; approvers only; who decided; the second approver; isolation 25a–25e', () => {
    const mig = read('supabase/v157-approvals.sql');
    const block = mig.slice(mig.indexOf('-- ================================================================ V157'),
      mig.indexOf('-- ================================================================ self-checks')).trimEnd();
    t.ok(block.length > 3000, 'the migration has its definitions');
    t.includes(read('supabase/schema.sql'), block, 'a new project gets them byte for byte (schema.sql)');
    t.includes(block, "    and m.requested_by is distinct from auth.uid()\n    and m.user_id is distinct from auth.uid()", 'never the asker’s own (nor their job’s)');
    t.includes(block, "    and coalesce(public.member_role(m.from_org, auth.uid()) in ('owner','team_leader','office'), false)", 'approvers of the business it leaves only');
    t.includes(block, "  where m.status = 'waiting'", 'waiting ones only');
    t.includes(block, "         case when m.status in ('moved','refused') and m.decided_by is distinct from m.requested_by", '4A: who decided — someone else, moved or refused');
    t.includes(block, "  left join public.memberships dm on dm.org_id = m.from_org and dm.user_id = m.decided_by", '…their name in the business it left');
    t.includes(block, "     and coalesce(public.member_role(m.from_org, me) in ('owner','team_leader','office'), false) then", 'the second approver’s detail: approvers only');
    t.includes(block, "  return public._job_move_decide(move, approve, me);", 'deciding is still V150’s');
    t.includes(block, "revoke all on function public.business_waiting_moves() from public, anon;", 'signed out: nothing');
    t.includes(block, "drop function if exists public.my_job_moves();", 'my_job_moves made again (its shape grew)');
    t.includes(block, "grant execute on function public.my_job_moves() to authenticated;", '…and granted again');
    const iso = read('supabase/isolation-test.sql');
    for (const c of ['25a', '25b', '25c', '25d', '25e']) t.includes(iso, `'${c}|`, `isolation ${c}`);
    t.includes(iso, '-- V157: CHECKS 25a–25e NEED supabase/v157-approvals.sql RUN FIRST', 'isolation: the note at the top');
  });
};
