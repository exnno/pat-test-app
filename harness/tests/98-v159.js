/* Standing test — V159: Office never holds a job (the second GPT audit, finding 2)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

     98a  the lists: businessHoldable / businessIsOffice; New job's For: never
          offers an Office business — not drawn, not the starting choice (even
          when last used or the stale main), not taken from the form (the real
          New job taps); someone in their own + one Office business sees no For:.
     98b  a job made from a job (2A): a duplicate or a split of a job in an Office
          business goes to the main business; a team job's copy stays the team's;
          a job already in an Office business still takes new items (R68 3A).
     98c  the Business page and Job settings: the Office card says where your
          jobs go (3A) and has no Make main; Make main refuses one; Change… lists
          no Office business, picking one is refused, and Change… isn't drawn
          when there's nowhere to move; a job in an Office business can still
          be moved out.
     98d  Join as Office asks nothing about main (make_main false); an Engineer
          invite still asks; Change role to Office is asked first with 4A's
          words (Cancel sends nothing), other roles straight away; the
          database's two new refusals in words.
     98e  the SQL's text: schema.sql carries v159-office.sql's block byte for
          byte; the six rules; the fix-up; isolation 26a–26e.
     98f  V159's About line (V160 moved the release checks to 99f).

   ⚠ WHAT THIS FILE CANNOT PROVE: that the database files, refuses and drops
   what it should. That is supabase/v159-office.sql's own checks (O1–O4) and
   isolation-test.sql 26a–26e — run at V159 against a local Postgres 16
   stand-in (an upgraded project and a new one), plus a 14-step scenario with
   four people, with eight broken copies of the SQL each caught. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { freshApp, withItem, tick } = require('../fixture');

const LIB  = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;
const UID  = '11111111-1111-1111-1111-111111111111';
const DAVE = '22222222-2222-4222-8222-222222222222';
const AUTH = 'patgo:cloudAuth:test';
const OWN  = 'aaaaaaaa-0000-4000-8000-000000000001';   // mine (Owner)
const TEAM = 'aaaaaaaa-0000-4000-8000-000000000002';   // Engineer
const OFF  = 'aaaaaaaa-0000-4000-8000-000000000003';   // Office
const INV1 = 'cccccccc-0000-4000-8000-000000000001';
const INV2 = 'cccccccc-0000-4000-8000-000000000002';
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const stored = (list, u = UID, at = Date.now()) => JSON.stringify({ u, at, list });

const THREE = [
  { id: OWN, name: 'Birchley Testing', role: 'owner', def: true, n: 1 },
  { id: TEAM, name: 'Acme Testing Ltd', role: 'engineer', def: false, n: 3 },
  { id: OFF, name: 'Smith Electrical', role: 'office', def: false, n: 4 },
];
const OWN_OFF = [THREE[0], THREE[2]];
// A phone that hasn't re-read since the fix-up: the Office business still main.
const STALE = [Object.assign({}, THREE[0], { def: false }), THREE[1], Object.assign({}, THREE[2], { def: true })];

function storedSession() {
  const life = 3600;
  return JSON.stringify({
    access_token: 'ZZACCESS159', token_type: 'bearer', expires_in: life,
    expires_at: Math.floor(Date.now() / 1000) + life, refresh_token: 'ZZREFRESH',
    user: { id: UID, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' },
  });
}

// A pretend Supabase (94's, cut down): the businesses, the people, invites to me.
function fakeServer() {
  const calls = [];
  const srv = {
    calls,
    rows: THREE.map(b => ({ id: b.id, name: b.name, role: b.role, is_default: b.def, members: b.n })),
    mine: [],
    people: [
      { business_id: OWN, user_id: UID, name: '', role: 'owner', is_you: true, email: 'peter@example.com' },
      { business_id: OWN, user_id: DAVE, name: 'Dave Smith', role: 'engineer', is_you: false, email: 'dave@example.com' },
    ],
    invites: [],
  };
  srv.fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    let body = null;
    if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    calls.push({ url: u, method, body });
    const rpc = (u.match(/\/rest\/v1\/rpc\/([a-z_]+)$/) || [])[1];
    if (rpc === 'my_businesses') return json(srv.rows);
    if (rpc === 'my_job_moves') return json([]);
    if (rpc === 'business_waiting_moves') return json([]);
    if (rpc === 'my_invites') return json(srv.mine);
    if (rpc === 'business_people') return json(srv.people);
    if (rpc === 'business_invites') return json(srv.invites);
    if (rpc === 'accept_invite') { srv.mine = srv.mine.filter(v => v.id !== body.i); return json('joined'); }
    if (rpc === 'set_member_role') return json(body.r);
    if (rpc === 'set_main_business') return json(true);
    if (rpc === 'my_billing') return json({ plan: 'comped', role: 'owner', can_manage: true });
    if (u.includes('/rest/v1/')) return method === 'GET' ? json([]) : new Response(null, { status: 201 });
    if (u.includes('/storage/v1/')) return json([]);
    return json({ message: 'unexpected ' + u }, 404);
  };
  srv.rpcs = (name) => calls.filter(c => c.url.endsWith('/rest/v1/rpc/' + name));
  return srv;
}

async function signedIn(o = {}) {
  const ls = Object.assign({ [AUTH]: storedSession(), 'pat:cloudUnlocked': '1', 'pat:businesses': stored(THREE) }, o.localStorage || {});
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
const sheets = (app) => app.doc.body.children.filter(c => /bulk-sheet/.test(c.className || ''));
const topSheet = (app) => { const s = sheets(app); return s.length ? s[s.length - 1].innerHTML : ''; };

// The real New job taps (88's helper).
function newJob(app, o = {}) {
  app.fn('setView')('sessions');
  tap(app, 'new-session');
  const d = app.doc;
  const set = (id, v) => { const el = d.getElementById(id); if (el) el.value = v; };
  set('nf-client', o.client || 'Client Ltd'); set('nf-site', o.site || 'Unit 1');
  set('nf-engineer', 'Pat'); set('nf-name', ''); set('nf-prefix', ''); set('nf-start', '1');
  if (o.business !== undefined) set('nf-business', o.business);
  tap(app, 'nf-submit');
  return app.fn('activeSession')();
}
const formHTML = (app) => { app.fn('setView')('sessions'); tap(app, 'new-session'); return html(app); };

module.exports = async function () {
  /* ------------------------------------------------------------------ 98a */
  await t.group('98a — the lists: For: never offers an Office business (drawn, starting choice, the real taps)', () => {
    const app = freshApp({ localStorage: { 'pat:businesses': stored(THREE) } });
    app.state().welcomeSeen = true;
    const ids = (expr) => JSON.parse(app.run(`JSON.stringify((${expr}).map(b => b.id))`));
    t.deepEq(ids('businessHoldable()'), [OWN, TEAM], 'businessHoldable: every business but the Office one');
    t.eq(app.run(`businessIsOffice('${OFF}')`), true, 'businessIsOffice: the Office one');
    t.eq(app.run(`businessIsOffice('${TEAM}')`), false, '…not an Engineer one');
    t.eq(app.run(`businessIsOffice('nope')`), false, '…not a bad id');
    t.deepEq(ids('businessNewJobChoices()'), [OWN, TEAM], 'For: offers the two you can hold');
    t.eq(app.run('businessChoices().length'), 3, 'the Job settings card still knows all three');

    let h = formHTML(app);
    t.includes(h, '<label class="label" for="nf-business">For</label>', 'For: drawn');
    t.includes(h, `value="${TEAM}"`, '…with the Engineer business');
    t.excludes(h, `value="${OFF}"`, '…never the Office one');
    t.excludes(h, 'Smith Electrical', '…not even by name');

    // Last used / stale main: never the starting choice.
    app.storage.setItem('pat:lastBusiness', OFF);
    t.eq(app.run('businessForInitial()'), OWN, 'last used was the Office one: starts on the main instead');
    app.storage.setItem('pat:businesses', stored(STALE));
    t.eq(app.run('businessForInitial()'), OWN, 'a stale list with the Office one as main: starts on a business you hold');
    t.eq(app.run(`businessNewJobPick('${OFF}')`), OWN, 'picking the Office id: refused, the starting choice instead');
    t.eq(app.storage.getItem('pat:lastBusiness'), OWN, '…and the Office id is never remembered');

    // The real taps: a form forced to the Office id.
    app.storage.setItem('pat:businesses', stored(THREE));
    const j = newJob(app, { business: OFF, client: 'Forced' });
    t.ok(j && /Forced/.test(String(j.site)), 'the job was made');
    t.ok(j && j.businessId !== OFF, '…never for the Office business');
    const j2 = newJob(app, { business: TEAM, client: 'Team job' });
    t.eq(j2 && j2.businessId, TEAM, 'an Engineer business is still chosen as before');

    // Own + one Office business: nothing to choose.
    const two = freshApp({ localStorage: { 'pat:businesses': stored(OWN_OFF) } });
    two.state().welcomeSeen = true;
    t.eq(two.run('businessNewJobChoices().length'), 0, 'your own + an Office business: no choice');
    t.excludes(formHTML(two), 'id="nf-business"', '…and no For: drawn');
    const k = newJob(two, { client: 'Mine' });
    t.ok(k && !k.businessId, '…the job goes to your main business');
  });

  /* ------------------------------------------------------------------ 98b */
  await t.group('98b — a job made from a job (2A): out of an Office business → the main; a team job’s stays; 3A logging', () => {
    const app = freshApp({ localStorage: { 'pat:businesses': stored(THREE) } });
    app.state().welcomeSeen = true;
    t.eq(app.run(`businessForCopy('${OFF}')`), '', 'businessForCopy: an Office business → none (the main)');
    t.eq(app.run(`businessForCopy('${TEAM}')`), TEAM, '…a team business → itself');
    t.eq(app.run(`businessForCopy('')`), '', '…none → none');

    // A job started in the Office business before the change (R68 3A).
    const started = newJob(app, { client: 'Started' });
    started.businessId = OFF;
    withItem(app, { assetNo: 'S1' }); withItem(app, { assetNo: 'S2' });
    t.eq(started.items.length, 2, '3A: a job already in an Office business still takes new items');

    const m = (s) => ({ client: s.client, client0: s.client, site: '', site0: '', date: s.date, engineer: 'Pat', name: '', prefix: '', instrumentId: '' });
    const copy = app.fn('_dupJobBuild')(m(started), JSON.parse(JSON.stringify(started)), 'dup-off', []);
    t.ok(!('businessId' in copy), 'duplicate of a job in the Office business: the main business (no businessId)');
    const team = newJob(app, { business: TEAM, client: 'Team' });
    const tcopy = app.fn('_dupJobBuild')(m(team), JSON.parse(JSON.stringify(team)), 'dup-team', []);
    t.eq(tcopy.businessId, TEAM, 'duplicate of a team job: still the team’s');

    // Split: items moved out into a new job.
    app.state().activeId = started.id;
    const id1 = started.items[1].id;
    app.state().moveJob = { step: 'confirm', ids: [id1], from: started.id, client: 'Started', site: 'B', date: started.date, engineer: 'Pat', name: '', prefix: '', instrumentId: '' };
    app.fn('moveItemsToNewJob')();
    const made = app.state().sessions.find(s => s.id !== started.id && s.items && s.items.some(i => i.id === id1));
    t.ok(made, 'split: a new job was made');
    t.ok(made && !made.businessId, 'split out of the Office business: the new job is the main business’s');
  });

  /* ------------------------------------------------------------------ 98c */
  await t.group('98c — the Business page and Job settings: the Office line, no Make main, Change… never into Office', async () => {
    const app = await signedIn();
    app.fn('setView')('cloudBusiness');
    await until(() => app.srv.rpcs('my_businesses').length > 0 && !app.run('state.business && state.business.reading'));
    app.fn('render')();
    let h = html(app);
    const off = h.slice(h.indexOf('id="biz-card-2"'));
    t.includes(off, 'Smith Electrical', 'the Office business has its card');
    t.includes(off, 'id="biz-office-2"', '3A: the Office line is drawn');
    t.includes(off, 'As Office you see and approve here. Jobs you test go to Birchley Testing.', '…naming where your jobs go');
    t.excludes(off, 'id="biz-main-2"', 'no Make main on the Office card');
    t.includes(h, 'id="biz-main-1"', 'Make main still on the Engineer card');
    t.excludes(h, 'id="biz-office-0"', '…and no Office line on the others');
    t.excludes(h, 'id="biz-office-1"', '…(the Engineer one)');
    t.eq(app.run(`businessMakeMain('${OFF}')`), false, 'Make main on the Office business: refused');
    t.eq(app.srv.rpcs('set_main_business').length, 0, '…nothing sent');
    t.eq(app.run(`businessMakeMain('${TEAM}')`), true, 'Make main on the Engineer business: asked as before');
    app.doc.getElementById('confirm-sheet-no') && app.doc.getElementById('confirm-sheet-no').click();

    // Job settings.
    const fresh = freshApp({ localStorage: { 'pat:businesses': stored(THREE) } });
    fresh.state().welcomeSeen = true;
    const mine = newJob(fresh, { business: OWN, client: 'Mine' });
    let card = fresh.fn('businessJobCardHTML')(mine);
    t.includes(card, 'id="ef-biz-change"', 'a job of yours: Change… (the Engineer business is somewhere to go)');
    fresh.state().bizMove = { job: String(mine.id), step: 'pick' };
    const sheet = fresh.fn('renderBusinessMoveSheet')(mine);
    t.includes(sheet, `data-arg="${TEAM}"`, 'the list: the Engineer business');
    t.excludes(sheet, `data-arg="${OFF}"`, '…never the Office one');
    t.eq(fresh.fn('businessMovePick')(OFF), false, 'picking the Office business: refused');
    t.eq(fresh.state().bizMove.step, 'pick', '…still choosing');
    t.eq(fresh.fn('businessMovePick')(TEAM), true, 'picking the Engineer business: on to the question');

    const two = freshApp({ localStorage: { 'pat:businesses': stored(OWN_OFF) } });
    two.state().welcomeSeen = true;
    const only = newJob(two, { client: 'Only' });
    card = two.fn('businessJobCardHTML')(only);
    t.includes(card, 'id="ef-biz-name"', 'your own + an Office business: the card still names the business');
    t.excludes(card, 'id="ef-biz-change"', '…but no Change… — there’s nowhere it could go');

    const started = newJob(two, { client: 'Started' });
    started.businessId = OFF;
    card = two.fn('businessJobCardHTML')(started);
    t.includes(card, 'id="ef-biz-change"', 'a job already in the Office business: Change… to move it out');
    t.deepEq(JSON.parse(two.run(`JSON.stringify(businessMoveTargets('${OFF}').map(b => b.id))`)), [OWN], '…to your own business');
  });

  /* ------------------------------------------------------------------ 98d */
  await t.group('98d — Join as Office asks nothing about main; Change role to Office asked first (4A); the refusals in words', async () => {
    const srv = fakeServer();
    srv.rows = [{ id: OWN, name: 'Birchley Testing', role: 'owner', is_default: true, members: 2 }];
    srv.mine = [
      { id: INV1, business_id: OFF, business_name: 'Smith Electrical', role: 'office', invited_by_name: 'Jo', expires_at: '2026-11-26T09:00:00Z' },
      { id: INV2, business_id: TEAM, business_name: 'Acme Testing Ltd', role: 'engineer', invited_by_name: 'Al', expires_at: '2026-11-26T09:00:00Z' },
    ];
    const app = await signedIn({ srv, localStorage: { 'pat:businesses': stored([THREE[0]]) } });
    app.fn('setView')('cloudBusiness');
    await until(() => app.srv.rpcs('my_invites').length > 0 && !app.run('state.business && state.business.reading'));

    t.eq(app.run(`businessJoinStart('${INV1}')`), true, 'Join an Office invite: asked');
    let sh = topSheet(app);
    t.includes(sh, 'You’ll join as Office: you see and approve their jobs. Your own jobs and your main business stay as they are.', '…in plain words');
    t.excludes(sh, 'make it my main business', '…nothing about main');
    app.doc.getElementById('confirm-sheet-yes').click();
    await until(() => app.srv.rpcs('accept_invite').length > 0);
    t.deepEq(app.srv.rpcs('accept_invite')[0].body, { i: INV1, make_main: false }, 'accept_invite: make_main false');

    t.eq(app.run(`businessJoinStart('${INV2}')`), true, 'an Engineer invite: asked');
    t.includes(topSheet(app), 'Yes — make it my main business', '…still about main');
    app.doc.getElementById('choice-sheet-cancel').click();

    // Change role (the Owner, on Dave).
    await until(() => app.srv.rpcs('business_people').length > 0);
    app.fn('render')();
    tap(app, 'biz-role', OWN + ':' + DAVE);
    sh = topSheet(app);
    t.includes(sh, 'Office — sees the whole team’s jobs, doesn’t log', 'Change role offers Office');
    app.doc.getElementById('choice-sheet-1').click();   // office (team_leader, office)
    sh = topSheet(app);
    t.includes(sh, 'Make Dave Smith Office?', '4A: asked first');
    t.includes(sh, 'They can finish jobs they’ve already started here. New jobs go to their own business.', '…with what happens');
    app.doc.getElementById('confirm-sheet-no').click();
    await tick(20);
    t.eq(app.srv.rpcs('set_member_role').length, 0, 'Cancel: nothing sent');
    tap(app, 'biz-role', OWN + ':' + DAVE);
    app.doc.getElementById('choice-sheet-1').click();
    app.doc.getElementById('confirm-sheet-yes').click();
    await until(() => app.srv.rpcs('set_member_role').length > 0);
    t.deepEq(app.srv.rpcs('set_member_role')[0].body, { o: OWN, u: DAVE, r: 'office' }, 'Make Office: set_member_role');
    tap(app, 'biz-role', OWN + ':' + DAVE);
    app.doc.getElementById('choice-sheet-0').click();   // team_leader: no question
    await until(() => app.srv.rpcs('set_member_role').length > 1);
    t.deepEq(app.srv.rpcs('set_member_role')[1].body, { o: OWN, u: DAVE, r: 'team_leader' }, 'Team leader: sent straight away');

    t.eq(app.fn('businessMoveError')({ message: 'patgo_move_office: as Office you don\'t hold jobs there' }),
      'You’re Office in that business, so your jobs can’t go there.', 'the move refusal in words');
    t.eq(app.fn('businessTeamError')({ message: 'patgo_main_office' }),
      'You’re Office in that business, so it can’t be your main one — your jobs go to a business you test for.', 'the Make main refusal in words');
  });

  /* ------------------------------------------------------------------ 98e */
  await t.group('98e — the SQL: schema.sql in step; uploads, moves, approvals, Join, Change role, Make main; the fix-up; isolation 26a–26e', () => {
    const mig = read('supabase/v159-office.sql');
    const block = mig.slice(mig.indexOf('-- ================================================================ V159'),
      mig.indexOf('-- ================================================================ self-checks')).trimEnd();
    t.ok(block.length > 3000, 'the migration has its definitions');
    t.includes(read('supabase/schema.sql'), block, 'a new project gets them byte for byte (schema.sql)');
    const sch = read('supabase/schema.sql');
    t.ok(sch.indexOf(block) < sch.indexOf('-- ================================================================ V160'), '…after the earlier sections, before V160’s (which redefines only Join)');
    t.includes(block, "    if new.org_id is not null and tg_table_name in ('sessions', 'photos')\n       and public.member_role(new.org_id, new.user_id) = 'office' then\n      new.org_id := null;", '1A: a new job or photo naming an Office business is filed as naming none');
    t.ok(block.indexOf("= 'office' then\n      new.org_id := null;") < block.indexOf("if new.org_id is null and tg_table_name = 'photos' then"), '…before a photo looks up its job');
    t.includes(block, "  if r_to = 'office' then\n    raise exception 'patgo_move_office:", 'move_job: never into an Office business');
    t.includes(block, "     or public.member_role(m.to_org, m.user_id) = 'office' then\n    update public.job_moves set status = 'dropped'", 'an approval drops a request whose asker is now Office there');
    t.includes(block, "  if coalesce(make_main, false) and v.role <> 'office' then", 'Join as Office never makes it main');
    t.includes(block, "  if r = 'office' then perform public._main_off_office(u); end if;", 'changed to Office: their own business main again');
    t.includes(block, "  if public.my_role(o) = 'office' then raise exception 'patgo_main_office'; end if;", 'Make main refuses an Office business');
    t.includes(block, "  order by (m.role = 'owner') desc, m.created_at, m.org_id limit 1;", 'the main goes back to the business they own first');
    t.includes(block, "revoke all on function public._main_off_office(uuid) from public, anon, authenticated;", 'the helper is closed to phones');
    t.includes(block, "  for u in select m.user_id from public.memberships m where m.is_default and m.role = 'office' loop", 'the one-off fix-up');
    for (const c of ['O1', 'O2', 'O3', 'O4']) t.includes(mig, `'${c}|`, `self-check ${c}`);
    const iso = read('supabase/isolation-test.sql');
    for (const c of ['26a', '26b', '26c', '26d', '26e']) t.includes(iso, `'${c}|`, `isolation ${c}`);
    t.includes(iso, '-- V159: CHECKS 26a–26e NEED supabase/v159-office.sql RUN FIRST', 'isolation: the note at the top');
  });

  /* ------------------------------------------------------------------ 98f */
  // V160: the release checks moved to 99f; V159's About line stays pinned here.
  // V162: V159's About line rolled off (101f checks it's gone); this keeps the check that it went cleanly.
  await t.group('98f — V159’s About line (rolled off at V162)', () => {
    t.excludes(read('render-help.js'), 'Office sees and approves but never holds a job', 'About: V159’s line rolled off');
  });
};
