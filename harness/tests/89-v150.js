/* Standing test — V150: moving a job to another business (Stage 16, Teams v1)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   Peter, 5–6 Nov — 0A (the list read on start / return + Change…; the minimum
   version moved to just before invites) 1A 2A 3A 4A; Claude's calls named in
   the handoff. What these groups pin:
     89a  business.js on its own: the stored record of moves (garbage → empty,
          one per job), the Job settings line and its names, the cloud's answer
          winning (businessReconcileJobs), the list owed on start and on return,
          and a job's business saved when it changes on a job that isn't open
          (storage.js _sessionSig).
     89b  Job settings: no Business card for someone in one business; for two,
          the card, Change…, the sheet (other businesses only), the approval
          words by role, Back; a waiting request shows Cancel request instead;
          locked / certified / no signal / signed out say why.
     89c  The move against a pretend Supabase: moved (the job follows), waiting
          (it stays), not in the cloud (it changes here only), into the default
          (it names none), the errors in plain words, Cancel request, a locked
          job's waiting request dropped on the next read, Job settings re-reads
          a waiting one.
     89d  Sync: the job list reads org:org_id; the cloud's business wins on the
          pull and the corrected job goes up; a held job is left for its
          question; back at the front the list is read again inside 6 hours.
     89e  Release: V150, What's new (one line), cache, About V150 / V149 / V148;
          state.bizMove declared; JOB_MOVES_KEY follows the account (reset,
          takeover); leaving the screen closes the sheet; no business.js.
     89f  The SQL's text: the move, the request, who decides, the record no app
          writes, the stamp's one exception; schema.sql ends with exactly the
          V150 definitions; the self-checks; isolation 21a–21h; the test aid;
          the V149 undo clears the test team's records first.

   ⚠ WHAT THIS FILE CANNOT PROVE: that the database refuses what it should.
   That is supabase/v150-business-move.sql's own checks (M1–M5) and
   isolation-test.sql 21a–21h — both run at V150 against a local Postgres 16
   stand-in (an upgraded project and a new one), with ten broken copies each
   caught. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { freshApp, withSession, tick } = require('../fixture');

const LIB  = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;
const UID = '11111111-1111-1111-1111-111111111111';
const AUTH = 'patgo:cloudAuth:test';
const OWN  = 'aaaaaaaa-0000-4000-8000-000000000001';
const TEAM = 'aaaaaaaa-0000-4000-8000-000000000002';
const MV1  = 'bbbbbbbb-0000-4000-8000-000000000001';
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const HOUR = 3600000;

const TWO = [
  { id: OWN, name: '', role: 'owner', def: true, n: 1 },
  { id: TEAM, name: 'Acme Testing Ltd', role: 'engineer', def: false, n: 3 },
];
const ONE = [{ id: OWN, name: '', role: 'owner', def: true, n: 1 }];
const stored = (list, u = UID, at = Date.now()) => JSON.stringify({ u, at, list });
const moveRec = (list, u = UID) => JSON.stringify({ u, at: Date.now(), list });

function storedSession() {
  const life = 3600;
  return JSON.stringify({
    access_token: 'ZZACCESS150', token_type: 'bearer', expires_in: life,
    expires_at: Math.floor(Date.now() / 1000) + life, refresh_token: 'ZZREFRESH',
    user: { id: UID, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' },
  });
}

// A pretend Supabase. move_job answers srv.answer ('moved' | 'waiting' | an
// error message); my_job_moves answers srv.moves; the job list answers srv.list.
function fakeServer() {
  const calls = [];
  const srv = { calls, answer: 'moved', moves: [], list: [], failMoves: false, seq: 0, rows: [
    { id: OWN, name: '', role: 'owner', is_default: true, members: 1 },
    { id: TEAM, name: 'Acme Testing Ltd', role: 'engineer', is_default: false, members: 3 },
  ] };
  srv.fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    let body = null;
    if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    calls.push({ url: u, method, body });
    if (u.endsWith('/rest/v1/rpc/my_businesses')) return json(srv.rows);
    if (u.endsWith('/rest/v1/rpc/my_job_moves')) return srv.failMoves ? json({ message: 'Could not find the function' }, 404) : json(srv.moves);
    if (u.endsWith('/rest/v1/rpc/move_job')) {
      if (srv.answer !== 'moved' && srv.answer !== 'waiting') return json({ message: srv.answer, code: 'P0001' }, 400);
      srv.moves = srv.moves.filter(m => m.session_id !== body.job).concat([{
        id: 'bbbbbbbb-0000-4000-8000-' + String(++srv.seq).padStart(12, '0'), session_id: body.job, from_org: srv.from || OWN, from_name: '', to_org: body.target,
        to_name: body.target === TEAM ? 'Acme Testing Ltd' : '', status: srv.answer,
        requested_at: '2026-11-06T09:00:00Z', decided_at: srv.answer === 'moved' ? '2026-11-06T09:00:00Z' : null }]);
      return json(srv.answer);
    }
    if (u.endsWith('/rest/v1/rpc/cancel_job_move')) {
      const m = srv.moves.find(x => x.id === body.move);
      const st = body.dropped ? 'dropped' : 'cancelled';
      if (m && m.status === 'waiting') m.status = st;
      return json(m ? m.status : st);
    }
    if (u.endsWith('/rest/v1/rpc/my_billing')) return json({ plan: 'comped', role: 'owner', can_manage: true });
    if (u.includes('/rest/v1/sessions?') && method === 'GET' && u.includes('org%3Aorg_id')) return json(srv.list);
    if (u.includes('/rest/v1/')) return method === 'GET' ? json([]) : new Response(null, { status: 201 });
    if (u.includes('/storage/v1/')) return json([]);
    return json({ message: 'unexpected ' + u }, 404);
  };
  srv.posts = (table) => calls.filter(c => c.method === 'POST' && c.url.includes('/rest/v1/' + table + '?'));
  srv.rpcs = (name) => calls.filter(c => c.url.endsWith('/rest/v1/rpc/' + name));
  return srv;
}

async function signedIn(o = {}) {
  const ls = Object.assign({ [AUTH]: storedSession(), 'pat:cloudUnlocked': '1' }, o.localStorage || {});
  const app = bootApp({ localStorage: ls, navigator: { onLine: false }, skip: o.skip, tolerateLoadErrors: !!o.skip });
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
// A tap exactly as the browser delivers it, through #app's delegation.
function tap(app, action, arg) {
  const el = app.doc.createElement('button');
  el.dataset.action = action;
  if (arg !== undefined) el.dataset.arg = String(arg);
  app.doc.getElementById('app').dispatchEvent({
    type: 'click', target: el, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
  });
}
function actionOf(h, id) {
  const m = h.match(new RegExp(`id="${id}"[^>]*data-action="([^"]+)"`));
  return m ? m[1] : null;
}
function argOf(h, id) {
  const m = h.match(new RegExp(`id="${id}"[^>]*data-arg="([^"]+)"`));
  return m ? m[1] : null;
}
// A job, open on Job settings, through the Overview's own button.
function jobOnSettings(app, o = {}) {
  const sess = withSession(app, { client: o.client || 'Client Ltd', site: o.site || 'Unit 1' });
  if (o.business) sess.businessId = o.business;
  if (o.locked) sess.locked = true;
  if (o.certNo) sess.certNo = o.certNo;
  app.fn('saveSessions')();
  app.fn('setView')('overview');
  tap(app, 'edit-session');
  return sess;
}
function storageText(app) {
  const out = [];
  for (let i = 0; i < app.storage.length; i++) out.push(app.storage.getItem(app.storage.key(i)));
  return out.join('\n');
}

module.exports = async function () {
  /* ------------------------------------------------------------------ 89a */
  await t.group('89a — business.js: the record of moves, the line, the cloud wins, owed reads, saved in place', async () => {
    const app = await signedIn({ localStorage: { 'pat:businesses': stored(TWO) } });
    // The stored record: garbage → empty; one per job; bad rows dropped.
    app.storage.setItem('pat:jobMoves', '{nope');
    t.eq(app.run('JSON.stringify(businessMovesLoad())'), JSON.stringify({ u: '', at: 0, list: [] }), 'garbage → an empty record');
    app.storage.setItem('pat:jobMoves', moveRec([
      { id: MV1, job: 'j1', from: OWN, to: TEAM, st: 'moved', fromName: '', toName: 'Acme Testing Ltd', at: '2026-11-06T09:00:00Z' },
      { id: MV1, job: 'j1', from: OWN, to: TEAM, st: 'waiting' },
      { id: 'x', job: 'j2', from: OWN, to: TEAM, st: 'moved' },
      { id: MV1, job: 'j3', from: OWN, to: TEAM, st: 'teleported' },
    ]));
    const rec = JSON.parse(app.run('JSON.stringify(businessMovesLoad())'));
    t.eq(rec.list.length, 1, 'one per job; a bad id or an unknown status dropped');
    t.eq(rec.list[0].st, 'moved', '…the first for the job kept');
    t.eq(app.run("businessMoveFor('j1') && businessMoveFor('j1').st"), 'moved', 'businessMoveFor: this account’s record');
    app.storage.setItem('pat:jobMoves', moveRec(rec.list, 'someone-else'));
    t.eq(app.run("businessMoveFor('j1')"), null, '…never another account’s');

    // From the cloud's rows.
    app.run(`businessMovesFromRows('${UID}', [
      { id: '${MV1}', session_id: 'j9', from_org: '${TEAM}', from_name: 'Acme Testing Ltd', to_org: '${OWN}', to_name: '', status: 'waiting', requested_at: '2026-11-06T09:00:00Z', decided_at: null },
      { id: 'bad', session_id: 'j8', from_org: '${OWN}', to_org: '${TEAM}', status: 'moved' }])`);
    const fr = JSON.parse(app.storage.getItem('pat:jobMoves'));
    t.ok(fr.u === UID && fr.list.length === 1 && fr.list[0].job === 'j9' && fr.list[0].st === 'waiting', 'rows from my_job_moves → the record (a bad row dropped)');

    // The line: names from the list (3A words), the record's name, else "another business".
    const line = (m) => app.run(`businessMoveLine(${JSON.stringify(m)})`);
    t.eq(line({ st: 'waiting', from: TEAM, to: OWN, toName: '' }), 'Move to Your business waiting for approval', 'waiting: “Move to … waiting for approval”');
    t.eq(line({ st: 'moved', from: OWN, to: TEAM, fromName: '', toName: 'old name', at: '2026-11-06T09:00:00Z' }),
      'Moved from Your business to Acme Testing Ltd · 06/11/2026', 'moved: from → to · the UK date (the list’s current names)');
    t.eq(line({ st: 'refused', from: TEAM, to: 'cccccccc-0000-4000-8000-000000000009', toName: 'Gone Ltd', at: '2026-11-06T09:00:00Z' }),
      'Move to Gone Ltd refused · 06/11/2026', 'refused; a business you left keeps the record’s name');
    t.eq(line({ st: 'moved', from: 'cccccccc-0000-4000-8000-000000000009', to: OWN, fromName: '', at: '' }),
      'Moved from another business to Your business', 'no name known → “another business”; no date → none');
    t.eq(line({ st: 'cancelled', from: OWN, to: TEAM }), '', 'cancelled: nothing to say');
    t.eq(line({ st: 'dropped', from: OWN, to: TEAM }), '', 'dropped: nothing to say');

    // The cloud's answer wins (3A).
    const st = app.state();
    st.sessions = [
      { id: 'r1', items: [] },                          // names none, cloud says the team
      { id: 'r2', items: [], businessId: TEAM },        // names the team, cloud says the default
      { id: 'r3', items: [], businessId: TEAM },        // agrees
      { id: 'r4', items: [], businessId: OWN },         // names the default explicitly, cloud the default
      { id: 'r5', items: [] },                          // not listed
      { id: 'r6', items: [] },                          // listed with rubbish
    ];
    const orgs = JSON.stringify({ r1: TEAM, r2: OWN, r3: TEAM, r4: OWN, r6: 'nonsense' });
    t.eq(app.run(`businessReconcileJobs(${orgs}, '${UID}')`), 2, 'two jobs put right');
    const by = (id) => app.state().sessions.find(s => s.id === id);
    t.eq(by('r1').businessId, TEAM, 'a job the cloud files under the team now names it');
    t.ok(!('businessId' in by('r2')), 'a job the cloud files under the default names none (as before V149)');
    t.eq(by('r3').businessId, TEAM, 'agreeing: untouched');
    t.eq(by('r4').businessId, OWN, 'the default named explicitly: untouched (the same business)');
    t.ok(!('businessId' in by('r5')) && !('businessId' in by('r6')), 'not listed, or rubbish: untouched');
    t.eq(app.run(`businessReconcileJobs(${JSON.stringify({ r1: OWN })}, 'someone-else')`), 0, 'another account’s list: nothing changed');
    app.storage.setItem('pat:businesses', stored([{ id: TEAM, name: 'x', role: 'engineer', def: false, n: 3 }]));
    t.eq(app.run(`businessReconcileJobs(${JSON.stringify({ r1: OWN })}, '${UID}')`), 0, 'no default known: nothing changed');
    app.storage.setItem('pat:businesses', stored(TWO));

    // Owed: on start, and again after businessReadOwe — whatever the 6 hours.
    const fresh = await signedIn({ localStorage: { 'pat:businesses': stored(TWO) } });
    const c = 'cloudClient()';
    const n0 = fresh.srv.rpcs('my_businesses').length;
    await fresh.run(`${c}.then(cl => businessMaybeRead(cl, '${UID}'))`);
    t.eq(fresh.srv.rpcs('my_businesses').length, n0 + 1, 'app start: read although the list is minutes old');
    t.ok(fresh.srv.rpcs('my_job_moves').length >= 1, '…and the moves with it');
    await fresh.run(`${c}.then(cl => businessMaybeRead(cl, '${UID}'))`);
    t.eq(fresh.srv.rpcs('my_businesses').length, n0 + 1, 'then not again inside 6 hours');
    fresh.run('businessReadOwe()');
    await fresh.run(`${c}.then(cl => businessMaybeRead(cl, '${UID}'))`);
    t.eq(fresh.srv.rpcs('my_businesses').length, n0 + 2, 'owed again (back at the front): read');
    fresh.srv.failMoves = true;
    fresh.run('businessReadOwe()');
    const ok = await fresh.run(`${c}.then(cl => businessMaybeRead(cl, '${UID}'))`);
    t.ok(ok === true, 'no V150 SQL (my_job_moves missing): the list is still read');

    // Saved in place on a job that isn't open (storage.js _sessionSig).
    const p = freshApp();
    const a = withSession(p, { client: 'Alpha', site: 'One' });
    const b = withSession(p, { client: 'Bravo', site: 'Two' });
    p.state().activeId = b.id;
    p.fn('saveSessions')();
    t.excludes(storageText(p), TEAM, 'before: no business in storage');
    p.state().sessions.find(s => s.id === a.id).businessId = TEAM;
    p.fn('saveSessions')();
    t.includes(storageText(p), TEAM, 'a business set in place on a job that isn’t open reaches storage');
  });

  /* ------------------------------------------------------------------ 89b */
  await t.group('89b — Job settings: the Business card, Change…, the sheet, the words', async () => {
    // One business: Job settings exactly as before.
    const solo = await signedIn({ localStorage: { 'pat:businesses': stored(ONE) } });
    jobOnSettings(solo);
    t.eq(solo.run('state.view'), 'editSession', 'Job settings is open');
    t.excludes(html(solo), 'id="ef-biz-card"', 'one business: no Business card');

    const app = await signedIn({ localStorage: { 'pat:businesses': stored(TWO) } });
    const own = jobOnSettings(app);
    const ownBefore = JSON.stringify(own.businessId);
    let h = html(app);
    t.includes(h, 'id="ef-biz-card"', 'two businesses: the Business card');
    t.ok(/id="ef-biz-name">Your business</.test(h), '…the job’s business by name (an unnamed own one: “Your business”)');
    t.eq(actionOf(h, 'ef-biz-change'), 'biz-move-open', '…and Change…');
    t.ok(h.indexOf('id="ef-biz-card"') > h.indexOf('id="ef-save"') && h.indexOf('id="ef-biz-card"') < h.indexOf('id="ef-dup-btn"'),
      '…below Save, above Duplicate — outside the form');

    // The sheet: the other business only, then the words for an Owner leaving.
    tap(app, 'biz-move-open');
    h = html(app);
    t.includes(h, 'aria-label="Move this job to…"', 'Change… opens the sheet');
    t.includes(h, 'Now in Your business.', '…saying where the job is now');
    t.eq(argOf(h, 'biz-move-list') === null && (h.match(/data-action="biz-move-pick"/g) || []).length, 1, '…one choice: the other business');
    t.includes(h, `data-action="biz-move-pick" data-arg="${TEAM}"`, '…the team');
    tap(app, 'biz-move-pick', TEAM);
    h = html(app);
    t.includes(h, 'aria-label="Move to Acme Testing Ltd?"', 'picking it asks first');
    t.includes(h, 'It moves straight away, with its photos. The move is recorded.', '…your own business: no approval needed');
    t.ok(/id="biz-move-go"[^>]*>Move it</.test(h), '…“Move it”');
    tap(app, 'biz-move-back');
    t.includes(html(app), 'aria-label="Move this job to…"', 'Back returns to the choice');
    tap(app, 'biz-move-close');
    t.excludes(html(app), 'biz-move-sheet', '× closes it');
    t.eq(JSON.stringify(own.businessId), ownBefore, 'looking moves nothing');

    // A team job, as its Engineer: the approval words.
    const team = jobOnSettings(app, { business: TEAM, client: 'Team Client' });
    t.ok(/id="ef-biz-name">Acme Testing Ltd</.test(html(app)), 'a team job shows the team');
    tap(app, 'biz-move-open');
    tap(app, 'biz-move-pick', OWN);
    h = html(app);
    t.includes(h, 'You’re an Engineer in Acme Testing Ltd, so someone else there — the Owner, a Team leader or the Office — has to approve it.',
      'leaving a team as its Engineer: someone else approves (2A)');
    t.includes(h, 'Until then the job stays in Acme Testing Ltd and you can carry on with it.', '…and the job carries on where it is');
    t.ok(/id="biz-move-go"[^>]*>Ask to move it</.test(h), '…“Ask to move it”');
    tap(app, 'biz-move-pick', TEAM);
    t.includes(html(app), 'aria-label="Move to Your business?"', 'picking the business it is already in does nothing');
    tap(app, 'biz-move-close');

    // A waiting request: its line and Cancel request, no Change….
    app.storage.setItem('pat:jobMoves', moveRec([{ id: MV1, job: String(team.id), from: TEAM, to: OWN, st: 'waiting', fromName: 'Acme Testing Ltd', toName: '', at: '' }]));
    app.fn('render')();
    h = html(app);
    t.includes(h, 'Move to Your business waiting for approval', 'a waiting request: its line');
    t.eq(actionOf(h, 'ef-biz-cancel'), 'biz-move-cancel', '…Cancel request');
    t.eq(argOf(h, 'ef-biz-cancel'), MV1, '…for that request');
    t.excludes(h, 'id="ef-biz-change"', '…and no Change… while it waits');

    // Why not: locked, certified, no signal, signed out.
    const why = (o) => {
      jobOnSettings(app, o.job || {});
      if (o.offline) app.run('navigator.onLine = false');
      if (o.signedOut) app.run("state.cloud.status = 'signed-out'");
      tap(app, 'biz-move-open');
      const m = (html(app).match(/id="biz-move-why">([^<]*)</) || [])[1] || '';
      app.run('navigator.onLine = true'); app.run("state.cloud.status = 'signed-in'");
      tap(app, 'biz-move-close');
      return m;
    };
    t.eq(why({ job: { locked: true } }), 'This job is locked. Unlock it in Job settings first, then change its business.', 'locked: unlock first');
    t.eq(why({ job: { certNo: 'PAT-0007' } }), 'This job has a certificate number, so it stays with the business it was certified for.', 'certified: it stays');
    t.eq(why({ offline: true }), 'You need a signal to move a job to another business.', 'no signal: says so');
    t.eq(why({ signedOut: true }), 'Sign in to move a job to another business.', 'signed out: sign in');
  });

  /* ------------------------------------------------------------------ 89c */
  await t.group('89c — the move: moved, waiting, not in the cloud, into the default, errors, cancel, dropped, re-read', async () => {
    const app = await signedIn({ localStorage: { 'pat:businesses': stored(TWO) } });
    const go = async (to) => {
      tap(app, 'biz-move-open'); tap(app, 'biz-move-pick', to); tap(app, 'biz-move-go');
      await until(() => !/biz-move-progress/.test(html(app)));
      await tick(20);
    };

    // Moved (your own → the team): the job follows; the record is read; a toast.
    const a = jobOnSettings(app, { client: 'Alpha' });
    await go(TEAM);
    const call = app.srv.rpcs('move_job').slice(-1)[0];
    t.ok(call && call.body.job === String(a.id) && call.body.target === TEAM, 'move_job is asked: this job, that business');
    t.eq(a.businessId, TEAM, 'moved: the job now names the team');
    t.includes(app.toasts, 'Moved to Acme Testing Ltd', '…“Moved to …”');
    t.excludes(html(app), 'biz-move-sheet', '…the sheet closes');
    t.includes(html(app), 'Moved from Your business to Acme Testing Ltd · 06/11/2026', '…and Job settings says so (the record read back)');
    t.includes(storageText(app), TEAM, '…saved');

    // Waiting (out of the team as its Engineer): the job stays.
    const b = jobOnSettings(app, { business: TEAM, client: 'Bravo' });
    app.srv.answer = 'waiting'; app.srv.from = TEAM;
    await go(OWN);
    t.eq(b.businessId, TEAM, 'waiting: the job stays in the team');
    t.includes(app.toasts, 'Move to Your business is waiting for approval', '…“waiting for approval”');
    t.includes(html(app), 'Move to Your business waiting for approval', '…the line');
    const waitId = app.srv.moves.find(m => m.session_id === String(b.id)).id;
    t.eq(argOf(html(app), 'ef-biz-cancel'), waitId, '…and Cancel request, for the request read back');

    // Cancel request.
    const nc = app.srv.rpcs('cancel_job_move').length;
    tap(app, 'biz-move-cancel', waitId);
    await until(() => app.srv.rpcs('cancel_job_move').length > nc);
    await tick(30);
    const cc = app.srv.rpcs('cancel_job_move').slice(-1)[0];
    t.ok(cc && cc.body.move === waitId && !cc.body.dropped, 'Cancel request: cancel_job_move for that request');
    t.includes(app.toasts, 'Request cancelled', '…“Request cancelled”');
    t.excludes(html(app), 'waiting for approval', '…the line goes');
    t.eq(actionOf(html(app), 'ef-biz-change'), 'biz-move-open', '…and Change… is back');

    // Not in the cloud: changes here only.
    const c = jobOnSettings(app, { client: 'Charlie' });
    app.srv.answer = 'patgo_move_gone: that job is not in the cloud'; app.srv.from = OWN;
    const reads = app.srv.rpcs('my_job_moves').length;
    await go(TEAM);
    t.eq(c.businessId, TEAM, 'not in the cloud yet: the job simply names the team');
    t.includes(app.toasts, 'Moved to Acme Testing Ltd', '…said as a move');
    t.eq(app.srv.rpcs('my_job_moves').length, reads, '…nothing recorded to read back');

    // Into the default: names none.
    app.srv.answer = 'moved'; app.srv.from = TEAM;
    jobOnSettings(app, { business: TEAM, client: 'Delta' });
    const d = app.fn('activeSession')();
    app.srv.rows[1].role = 'owner';   // the Owner of the team leaves freely
    app.storage.setItem('pat:businesses', stored([TWO[0], Object.assign({}, TWO[1], { role: 'owner' })]));
    await go(OWN);
    t.ok(!('businessId' in d), 'into your main business: the job names none (the default, as before)');

    // The errors, in plain words.
    const err = async (msg) => {
      jobOnSettings(app, { client: 'Echo ' + msg.slice(0, 12) });
      app.srv.answer = msg;
      await go(TEAM);
      const m = ((html(app).match(/id="biz-move-why">([^<]*)</) || [])[1] || '').replace(/&amp;/g, '&');
      tap(app, 'biz-move-close');
      return m;
    };
    t.eq(await err('patgo_move_locked: a locked or certified job stays where it is'), 'A locked or certified job stays with its business.', 'locked in the cloud');
    t.eq(await err('patgo_move_waiting: this job already has a move waiting'), 'This job already has a move waiting for approval.', 'already waiting');
    t.eq(await err('patgo_move_both: you need to belong to both businesses'), 'You need to belong to both businesses — check Settings → Account & Sync → Business.', 'not in both');
    t.eq(await err("patgo_plan_locked: this business's PATGo plan has ended"), 'That business’s PATGo plan has ended, so it can’t take jobs just now.', 'a lapsed business');
    t.eq(await err('something else'), 'The job wasn’t moved — try again with a signal.', 'anything else');

    // A waiting request whose job is now locked: dropped on the next read (2A).
    const f = jobOnSettings(app, { business: TEAM, client: 'Foxtrot' });
    app.srv.moves = [{ id: MV1, session_id: String(f.id), from_org: TEAM, from_name: 'Acme Testing Ltd', to_org: OWN, to_name: '', status: 'waiting', requested_at: '2026-11-06T09:00:00Z', decided_at: null }];
    f.locked = true; app.fn('saveSessions')();
    const nd = app.srv.rpcs('cancel_job_move').length;
    await app.run(`cloudClient().then(cl => businessMovesRead(cl, '${UID}'))`);
    const dc = app.srv.rpcs('cancel_job_move').slice(nd);
    t.ok(dc.length === 1 && dc[0].body.move === MV1 && dc[0].body.dropped === true, 'locked while waiting: the request is dropped (cancel_job_move, dropped)');
    t.eq(app.run(`businessMoveFor('${f.id}').st`), 'dropped', '…and recorded so');
    f.locked = false; app.fn('saveSessions')();

    // Job settings re-reads a waiting request (it may have been approved).
    app.srv.moves = [{ id: MV1, session_id: String(f.id), from_org: TEAM, from_name: 'Acme Testing Ltd', to_org: OWN, to_name: '', status: 'waiting', requested_at: '2026-11-06T09:00:00Z', decided_at: null }];
    await app.run(`cloudClient().then(cl => businessMovesRead(cl, '${UID}'))`);
    app.srv.moves[0].status = 'moved'; app.srv.moves[0].decided_at = '2026-11-06T10:00:00Z';
    const r0 = app.srv.rpcs('my_job_moves').length;
    app.fn('setView')('overview');
    tap(app, 'edit-session');
    await until(() => app.srv.rpcs('my_job_moves').length > r0);
    await tick(30);
    t.includes(html(app), 'Moved from Acme Testing Ltd to Your business', 'opening Job settings re-reads a waiting request: approved → “Moved …”');
  });

  /* ------------------------------------------------------------------ 89d */
  await t.group('89d — sync: the list reads org_id; the cloud wins and the job goes up; held jobs wait; read again on return', async () => {
    const app = await signedIn({ localStorage: { 'pat:businesses': stored(TWO) } });
    const x = withSession(app, { client: 'Xray' });
    const y = withSession(app, { client: 'Yankee' });
    y.businessId = TEAM;
    app.fn('saveSessions')();
    await app.run('syncPull()');   // both go up
    await until(() => app.srv.posts('sessions').length > 0);
    const listCall = app.srv.calls.find(c => c.method === 'GET' && c.url.includes('/rest/v1/sessions?') && c.url.includes('org%3Aorg_id'));
    t.ok(!!listCall, 'the job list asks for org:org_id');
    const sel = listCall ? decodeURIComponent(listCall.url).match(/select=([^&]*)/)[1] : '';
    t.ok(sel.startsWith('id,fp,deleted,updated_at,org:org_id,date:doc->>date') && !/(^|,)doc(,|$)/.test(sel), '…and still not the contents (' + sel.slice(0, 40) + '…)');

    // The cloud says: x is the team's (approved elsewhere), y is the default's.
    const now = new Date().toISOString();
    app.srv.list = [
      { id: String(x.id), fp: null, deleted: false, updated_at: now, org: TEAM },
      { id: String(y.id), fp: null, deleted: false, updated_at: now, org: OWN },
    ];
    // ⚠ fp null would fetch the doc: give the rows the phone's own fingerprint.
    for (const r of app.srv.list) r.fp = app.run(`syncHash(_syncCanonical(state.sessions.find(s => String(s.id) === '${r.id}')))`);
    const posts0 = app.srv.posts('sessions').length;
    await app.run('syncPull()');
    await tick(30);
    t.eq(x.businessId, TEAM, 'the cloud files x under the team: x now names it');
    t.ok(!('businessId' in y), 'the cloud files y under the default: y names none');
    await until(() => app.srv.posts('sessions').length > posts0);
    const sent = [].concat(...app.srv.posts('sessions').slice(posts0).map(c => Array.isArray(c.body) ? c.body : [c.body]));
    const sx = sent.find(r => r && r.id === String(x.id));
    t.ok(sx && sx.doc && sx.doc.businessId === TEAM, 'the corrected job goes up in the same run');

    // A held job is left for its question.
    const z = withSession(app, { client: 'Zulu' });
    app.fn('saveSessions')();
    const zBefore = JSON.stringify(z.businessId);
    app.run(`_syncHeldNote({ id: '${z.id}', reason: 'both-changed', name: 'Zulu', localItems: 0, cloudItems: 0 })`);
    app.srv.list = [{ id: String(z.id), fp: 'other', deleted: false, updated_at: new Date().toISOString(), org: TEAM }];
    await app.run('syncPull()');
    await tick(20);
    t.eq(JSON.stringify(z.businessId), zBefore, 'a held job: its business is not touched');

    // Back at the front: the list is read again, though it was read minutes ago.
    await app.run('syncPull()');
    const n0 = app.srv.rpcs('my_businesses').length;
    await app.run('syncPull()');
    t.eq(app.srv.rpcs('my_businesses').length, n0, 'a run inside 6 hours: not read');
    app.run("document.visibilityState = 'visible'");
    app.doc.dispatchEvent({ type: 'visibilitychange' });
    app.run('if (typeof _syncTimer !== "undefined" && _syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }');
    await app.run('syncPull()');
    t.eq(app.srv.rpcs('my_businesses').length, n0 + 1, 'back at the front (visibilitychange through document): read again');
  });

  /* ------------------------------------------------------------------ 89e */
  await t.group('89e — release: V150; the sheet in state; the record follows the account; no business.js', async () => {
    const rel = freshApp();
    t.eq(rel.run('APP_VERSION'), 'V150', 'APP_VERSION V150');
    t.eq(rel.run('WELCOME_VERSION'), 'V150', 'What’s new rolled');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v150';", 'cache key pat-v150');
    const core = read('render-core.js');
    const at = core.indexOf('<ul class="welcome-list sheet-scroll">');
    const sheetCopy = core.slice(at, core.indexOf('</ul>', at));
    t.eq((sheetCopy.match(/<li>/g) || []).length, 1, 'What’s new: one line');
    t.includes(sheetCopy, '<li><strong>Move a job to another business.</strong> For anyone who works for more than one business:', '…moving a job');
    t.includes(sheetCopy, 'Working for just one business? Nothing changes.</li>', '…and nothing changes for everyone else');
    const help = read('render-help.js');
    const x = help.indexOf('<p><strong>V150</strong>'), y = help.indexOf('<p><strong>V149</strong>'), z = help.indexOf('<p><strong>V148</strong>');
    t.ok(x > -1 && y > x && z > y, 'About: V150, V149, V148');
    t.excludes(help, '<p><strong>V147</strong>', 'V147 rolled off');
    t.includes(help, 'Move a job to another business: Job settings &rarr; Business &rarr; Change&hellip;', 'About: V150’s line');
    t.includes(help, 'Every job now knows which business it belongs to.', 'About: V149’s line still there');
    t.includes(help, 'Behind the scenes: PATGo is ready to ask for an account when it launches.', 'About: V148’s line still there');

    t.eq(rel.run('JSON.stringify(state.bizMove)'), 'null', 'state.bizMove is declared (null)');
    t.eq(rel.run('JOB_MOVES_KEY'), 'pat:jobMoves', 'JOB_MOVES_KEY');
    t.ok(rel.run("RESET_KEY_PLAN.some(k => k[0] === 'JOB_MOVES_KEY' && k[2] === 'account')"), 'Reset: the record goes with the account');
    t.notOk(rel.run("RESET_HANDOVER_KEEP.includes('JOB_MOVES_KEY')"), '…and a takeover clears it');
    rel.storage.setItem('pat:jobMoves', moveRec([{ id: MV1, job: 'j1', from: OWN, to: TEAM, st: 'moved' }]));
    t.notOk(rel.run("JSON.stringify(buildBackup()).includes('" + MV1 + "')"), 'never in a backup');

    // Leaving the screen closes the sheet.
    const app = await signedIn({ localStorage: { 'pat:businesses': stored(TWO) } });
    jobOnSettings(app);
    tap(app, 'biz-move-open');
    t.ok(app.run('!!state.bizMove'), 'the sheet is open');
    app.fn('setView')('sessions');
    t.eq(app.run('JSON.stringify(state.bizMove)'), 'null', 'leaving the screen closes it');

    // The app without business.js: Job settings as before.
    const bare = await signedIn({ skip: ['business.js'], localStorage: { 'pat:businesses': stored(TWO) } });
    let ok = true;
    try { jobOnSettings(bare); } catch (e) { ok = false; }
    t.ok(ok && bare.run('state.view') === 'editSession', 'no business.js: Job settings opens');
    t.excludes(html(bare), 'id="ef-biz-card"', '…with no Business card');
  });

  /* ------------------------------------------------------------------ 89f */
  await t.group('89f — the SQL: the move, the request, who decides, the record, the stamp; schema.sql; isolation; the test aid', () => {
    const mig = read('supabase/v150-business-move.sql');
    const body = mig.slice(mig.indexOf('-- ------------------------------------------------- the move log (1A)'),
                           mig.indexOf('\n\n\n-- ------------------------------------------------------------ self-check'));
    t.ok(body.length > 8000, `the migration's statements are read (${body.length} chars)`);
    // The stamp: the move's own mark, and still a member's business only.
    t.includes(body, "    mv := coalesce(current_setting('patgo.job_move', true), '');", 'the stamp reads the move’s mark');
    t.includes(body, "        ok := mv = new.user_id::text || '/' || new.id || '/' || new.org_id::text;", '…exactly this job going exactly there');
    t.includes(body, "      ok := ok and exists (select 1 from public.memberships m where m.org_id = new.org_id and m.user_id = new.user_id);", '…and only to a business its owner belongs to');
    t.includes(body, "    if not ok then\n      new.org_id := old.org_id;\n    end if;", 'anything else (an upload): the stamp never moves');
    t.includes(body, "  update public.photos set org_id = o_to where user_id = u and session_id = job and org_id is distinct from o_to;", 'photos move with the job');
    // The move and the request (2A).
    t.includes(body, "  if r_from = 'owner' then\n    perform public._job_move_apply(me, job, s.org_id, target);", 'out of a business you own: moved at once');
    t.includes(body, "  values (me, job, s.org_id, target, me, 'waiting');\n  return 'waiting';", '…otherwise a waiting request');
    t.includes(body, "  if r_from is null or r_to is null then\n    raise exception 'patgo_move_both", 'you belong to both');
    t.includes(body, "  if coalesce(s.doc ->> 'locked', '') = 'true' or coalesce(s.doc ->> 'certNo', '') <> '' then\n    raise exception 'patgo_move_locked", 'locked or certified: refused');
    t.includes(body, "  where x.user_id = me and x.id = job for update;", 'your own job only');
    // Who decides.
    t.includes(body, "  if decider is null or decider = m.requested_by then\n    raise exception 'patgo_move_self", 'never the person who asked');
    t.includes(body, "  if coalesce(public.member_role(m.from_org, decider) in ('owner','team_leader','office'), false) is not true then", 'only the Owner, a Team leader or the Office of the business it leaves');
    t.includes(body, "    update public.job_moves set status = 'dropped', decided_by = decider, decided_at = clock_timestamp() where id = move;", 'approved after a lock: dropped');
    t.includes(body, "  if not found or m.requested_by is distinct from auth.uid() then\n    raise exception 'patgo_move_role: only the person who asked can take it back'", 'only the asker cancels');
    // The record no app writes.
    t.includes(body, "revoke insert, update, delete, truncate, references, trigger on public.job_moves from public, anon, authenticated;", 'the record: no writes from any app');
    t.includes(body, "  using (user_id = auth.uid() or public.can_read_org(from_org) or public.can_read_org(to_org));", '…read by the job’s owner and whoever reads either business');
    t.includes(body, "create unique index if not exists job_moves_one_waiting on public.job_moves (user_id, session_id) where status = 'waiting';", 'one waiting request per job');
    t.includes(body, "  where m.user_id = auth.uid()\n  order by m.session_id, m.requested_at desc, m.id", 'my_job_moves: your own jobs only, the latest each');
    for (const f of ['member_role(uuid, uuid)', '_job_move_apply(uuid, text, uuid, uuid)', '_job_move_decide(uuid, boolean, uuid)']) {
      t.includes(body, `revoke all on function public.${f} from public, anon, authenticated;`, `${f.split('(')[0]}: closed to every app`);
    }
    for (const f of ['move_job(text, uuid)', 'cancel_job_move(uuid, boolean)', 'decide_job_move(uuid, boolean)', 'my_job_moves()']) {
      t.includes(body, `grant execute on function public.${f} to authenticated;`, `${f.split('(')[0]}: signed-in phones`);
    }
    for (const c of ['M1', 'M2', 'M3', 'M4', 'M5']) t.includes(mig, `array['${c}|`, `self-check ${c}`);
    t.includes(mig, "      raise exception 'v150-undo';", 'the self-check undoes what it tries');

    // schema.sql ENDS with exactly these definitions — the stamp a new project keeps.
    const schema = read('supabase/schema.sql');
    t.ok(schema.endsWith(body.replace(/\n*$/, '\n')), 'schema.sql ends with exactly the V150 statements');
    t.ok(schema.indexOf('============ V150') > schema.indexOf('================ V149'), '…in their own section, after V149’s');

    const iso = read('supabase/isolation-test.sql');
    for (const c of ['21a', '21b', '21c', '21d', '21e', '21f', '21g', '21h']) t.includes(iso, `array['${c}|`, `isolation ${c}`);
    t.includes(iso, "the business stamp is an older one — run supabase/v150-business-move.sql again", '21a names an older stamp (V149’s file run again)');

    const aid = read('supabase/v150-test-decide-move.sql');
    t.includes(aid, "  st := public._job_move_decide(mid, decision = 'approve', u_spare);", 'the test aid decides as the spare account (someone else)');
    t.includes(aid, "  where m.from_org = o and m.status = 'waiting'\n  order by m.requested_at desc limit 1;", '…the newest request leaving the test team');
    const undo = read('supabase/v149-test-second-business-undo.sql');
    t.ok(undo.indexOf('delete from public.job_moves x') > -1 && undo.indexOf('delete from public.job_moves x') < undo.indexOf("delete from public.organisations where name = 'PATGo Test Team';"),
      'the V149 undo clears the test team’s move records before the business');
  });
};
