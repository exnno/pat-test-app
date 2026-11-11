/* Standing test — V155: invites, roles and the people in a business (Teams v1)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   Peter, 11 Nov — 0A (V155 = invites, roles, people; Approve screen V156;
   leaving V157) 1A 2A 3A 4A 5A 6A 7C 8A; names typed at invite; "a paid seat
   anywhere means you're never locked". What these groups pin:
     94a  business.js on its own: invites to me and the page's rows (bad rows
          dropped, the account's own only), who may offer what (2A), the
          database's refusals in plain words, the Share message.
     94b  On screen: the Business page — People (addresses only when the cloud
          sends them, 6A), Invite someone for Owner / Team leader / Office only,
          invites with Share / Cancel, Change role for the Owner, your own name,
          Make main; invites to me with Join / Decline; the Jobs list line.
     94c  Against a pretend Supabase: inviting (the role choice for an Owner,
          Engineer only for others; name, then address — lowercased, checked);
          a refusal said in words, nothing changed; Join asks "main business?"
          and sends the answer (4A); Decline; Cancel; Change role; your name;
          Make main; my invites read on every start / return, a project without
          the V155 SQL leaving the list alone.
     94d  A paid seat anywhere: the plan record takes my_billing's cover; 8A —
          someone whose main business is another person's sees the owner line
          and Check now, never Renew now, and no Renew sheets; the Sync page's
          paused words likewise.
     94e  Release: V155; cache pat-v155; What's new rolled (two lines); About
          V155 / V154 / V153.
     94f  The SQL's text: schema.sql carries v155-invites.sql's block byte for
          byte; the database offers what the app offers; the confirmed address;
          both phone checks; the cover never pushed up; isolation 23a–23h.

   ⚠ WHAT THIS FILE CANNOT PROVE: that the database refuses what it should.
   That is supabase/v155-invites.sql's own checks (V1–V5) and isolation-test.sql
   23a–23h — run at V155 against a local Postgres 16 stand-in (an upgraded
   project and a new one), plus a 54-step scenario run, with broken copies of
   the SQL each caught. */

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
const DAVE = '22222222-2222-4222-8222-222222222222';
const AUTH = 'patgo:cloudAuth:test';
const OWN  = 'aaaaaaaa-0000-4000-8000-000000000001';
const TEAM = 'aaaaaaaa-0000-4000-8000-000000000002';
const INV1 = 'cccccccc-0000-4000-8000-000000000001';
const INV2 = 'cccccccc-0000-4000-8000-000000000002';
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const stored = (list, u = UID, at = Date.now()) => JSON.stringify({ u, at, list });

const OWNER_ONLY = [{ id: OWN, name: 'Birchley Testing', role: 'owner', def: true, n: 2 }];

function storedSession() {
  const life = 3600;
  return JSON.stringify({
    access_token: 'ZZACCESS155', token_type: 'bearer', expires_in: life,
    expires_at: Math.floor(Date.now() / 1000) + life, refresh_token: 'ZZREFRESH',
    user: { id: UID, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' },
  });
}

// A pretend Supabase. Every V155 rpc answers from srv; srv.refuse names an
// rpc to answer with srv.refuseWith; srv.noV155 makes every V155 rpc missing.
function fakeServer() {
  const calls = [];
  const srv = {
    calls, refuse: '', refuseWith: '', noV155: false, billing: { plan: 'comped', role: 'owner', can_manage: true },
    rows: [{ id: OWN, name: 'Birchley Testing', role: 'owner', is_default: true, members: 2 }],
    mine: [],
    people: [
      { business_id: OWN, user_id: UID, name: '', role: 'owner', is_you: true, email: 'peter@example.com' },
      { business_id: OWN, user_id: DAVE, name: 'Dave Smith', role: 'engineer', is_you: false, email: 'dave@example.com' },
    ],
    invites: [
      { id: INV1, business_id: OWN, email: 'sue@example.com', name: 'Sue Jones', role: 'office', status: 'waiting',
        created_at: '2026-11-11T09:00:00Z', expires_at: '2026-11-25T09:00:00Z', decided_at: null, can_cancel: true },
      { id: INV2, business_id: OWN, email: 'old@example.com', name: 'Old Hand', role: 'engineer', status: 'declined',
        created_at: '2026-11-01T09:00:00Z', expires_at: '2026-11-15T09:00:00Z', decided_at: '2026-11-02T09:00:00Z', can_cancel: false },
    ],
  };
  const V155 = ['my_invites', 'business_people', 'business_invites', 'invite_member', 'cancel_invite', 'accept_invite',
    'decline_invite', 'set_member_role', 'set_my_member_name', 'set_main_business'];
  srv.fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    let body = null;
    if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    calls.push({ url: u, method, body });
    const rpc = (u.match(/\/rest\/v1\/rpc\/([a-z_]+)$/) || [])[1];
    if (rpc && V155.includes(rpc) && srv.noV155) return json({ message: 'Could not find the function public.' + rpc }, 404);
    if (rpc && rpc === srv.refuse) return json({ message: srv.refuseWith, code: 'P0001' }, 400);
    if (rpc === 'my_businesses') return json(srv.rows);
    if (rpc === 'my_job_moves') return json([]);
    if (rpc === 'my_invites') return json(srv.mine);
    if (rpc === 'business_people') return json(srv.people);
    if (rpc === 'business_invites') return json(srv.invites);
    if (rpc === 'invite_member') return json('dddddddd-0000-4000-8000-000000000001');
    if (rpc === 'cancel_invite') return json('cancelled');
    if (rpc === 'decline_invite') { srv.mine = []; return json('declined'); }
    if (rpc === 'accept_invite') {
      srv.mine = [];
      srv.rows = srv.rows.map(r => Object.assign({}, r, { is_default: body.make_main ? false : r.is_default }))
        .concat([{ id: TEAM, name: 'Acme Testing Ltd', role: 'engineer', is_default: !!body.make_main, members: 4 }]);
      return json('joined');
    }
    if (rpc === 'set_member_role') return json(body.r);
    if (rpc === 'set_my_member_name') return json(String(body.n).trim());
    if (rpc === 'set_main_business') return json(true);
    if (rpc === 'my_billing') return json(srv.billing);
    if (u.includes('/rest/v1/')) return method === 'GET' ? json([]) : new Response(null, { status: 201 });
    if (u.includes('/storage/v1/')) return json([]);
    return json({ message: 'unexpected ' + u }, 404);
  };
  srv.rpcs = (name) => calls.filter(c => c.url.endsWith('/rest/v1/rpc/' + name));
  return srv;
}

async function signedIn(o = {}) {
  const ls = Object.assign({ [AUTH]: storedSession(), 'pat:cloudUnlocked': '1', 'pat:businesses': stored(OWNER_ONLY) }, o.localStorage || {});
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
async function openPage(app) {
  app.fn('setView')('cloudBusiness');
  await until(() => app.srv.rpcs('business_invites').length > 0 && !app.run('state.business && state.business.reading'));
  app.fn('render')();
  return html(app);
}

module.exports = async function () {
  /* ------------------------------------------------------------------ 94a */
  await t.group('94a — business.js: invites to me, the page’s rows, who offers what, words, the Share message', async () => {
    const app = await signedIn();
    // Invites to me: a bad row dropped, the account's own only.
    const mine = JSON.parse(app.run(`JSON.stringify(businessMyInvitesFromRows('${UID}', [
      { id: '${INV1}', business_id: '${TEAM}', business_name: 'Acme Testing Ltd', role: 'engineer', invited_by_name: 'Jo', expires_at: '2026-11-25T09:00:00Z' },
      { id: 'nope', business_id: '${TEAM}', role: 'engineer' },
      { id: '${INV2}', business_id: '${TEAM}', role: 'owner' }]))`));
    t.eq(mine.length, 1, 'one good invite; a bad id or an Owner offer dropped');
    t.deepEq(mine[0], { id: INV1, org: TEAM, orgName: 'Acme Testing Ltd', role: 'engineer', by: 'Jo', until: '2026-11-25T09:00:00Z' }, '…in the phone’s shape');
    t.eq(app.run('businessMyInvites().length'), 1, 'shown for this account');
    app.run(`businessMyInvitesFromRows('someone-else', [{ id: '${INV1}', business_id: '${TEAM}', role: 'engineer' }])`);
    t.eq(app.run('businessMyInvites().length'), 0, '…never another account’s');
    // The page's rows.
    const team = JSON.parse(app.run(`JSON.stringify(businessTeamFromRows('${UID}', [
      { business_id: '${OWN}', user_id: '${UID}', name: 'Peter', role: 'owner', is_you: true, email: 'p@x.co' },
      { business_id: '${OWN}', user_id: 'x', role: 'engineer' },
      { business_id: '${OWN}', user_id: '${DAVE}', name: 'Dave', role: 'boss' }], [
      { id: '${INV1}', business_id: '${OWN}', email: 's@x.co', name: 'Sue', role: 'office', status: 'waiting', can_cancel: true },
      { id: '${INV2}', business_id: '${OWN}', email: 's@x.co', name: 'Sue', role: 'office', status: 'teleported' }]))`));
    t.eq(team.people.length, 1, 'people: a bad id or an unknown role dropped');
    t.eq(team.invites.length, 1, 'invites: an unknown status dropped');
    t.ok(team.invites[0].cancel === true && team.invites[0].st === 'waiting', '…can_cancel and status kept');
    // 2A: who offers what — the database's own table (94f checks it there).
    t.eq(app.run('JSON.stringify(BUSINESS_OFFER)'), JSON.stringify({ owner: ['engineer', 'team_leader', 'office'], team_leader: ['engineer'], office: ['engineer'] }), '2A: Owner any but Owner; Team leader and Office Engineer only');
    t.eq(app.run(`businessMayInvite({ role: 'engineer' })`), false, 'an Engineer invites nobody');
    t.eq(app.run(`businessMayInvite({ role: 'office' })`), true, 'Office invites (R58)');
    // The refusals in words.
    const w = (m) => app.run(`businessTeamError({ message: ${JSON.stringify(m)} })`);
    t.includes(w('patgo_phones_behind'), 'A phone in this business has an older PATGo', '3A: the business’s phones');
    t.includes(w('patgo_your_phones_behind'), 'A phone you’ve signed in on has an older PATGo', '3A: the joiner’s own');
    t.eq(w('patgo_invite_member'), 'They’re already in this business.', 'already a member');
    t.includes(w('patgo_invite_waiting'), 'already have an invite waiting', '5A: one waiting');
    t.includes(w('patgo_invite_gone'), 'more than 14 days old', '5A: ended');
    t.includes(w('patgo_not_allowed'), 'isn’t something your role', 'not allowed');
    t.includes(w('Failed to fetch'), 'try again with a signal', 'anything else');
    // The Share message.
    const msg = app.run(`businessInviteText({ org: '${OWN}', email: 'dave@example.com', role: 'team_leader' })`);
    t.includes(msg, 'Birchley Testing has invited you to join them on PATGo as Team leader.', 'Share: who and as what');
    t.includes(msg, 'sign in with dave@example.com', '…the exact address (1A)');
    t.includes(msg, 'for 14 days', '…and how long it waits (5A)');
  });

  /* ------------------------------------------------------------------ 94b */
  await t.group('94b — on screen: People, Invite someone, invites, Change role, your name, Make main; invites to me; the Jobs line', async () => {
    const app = await signedIn();
    let h = await openPage(app);
    t.includes(h, 'id="biz-people-head-0">People</h4>', 'Owner: People');
    t.includes(h, 'You — add your name</span>', 'your own row, unnamed');
    t.eq(attrOf(h, 'biz-myname-0', 'data-action'), 'biz-myname', '…Add your name wired');
    t.includes(h, 'Dave Smith</span>', 'Dave by name');
    t.includes(h, '<span class="muted"> · Engineer</span>', '…and role');
    t.includes(h, 'biz-person-email">dave@example.com</div>', '…and address (the cloud sent it — 6A)');
    t.eq(attrOf(h, 'biz-role-0-1', 'data-action'), 'biz-role', 'the Owner: Change role on Dave');
    t.eq(attrOf(h, 'biz-role-0-1', 'data-arg'), OWN + ':' + DAVE, '…naming the business and the person');
    t.excludes(h, 'id="biz-role-0-0"', '…never on the Owner’s own row');
    t.eq(attrOf(h, 'biz-invite-0', 'data-action'), 'biz-invite', 'Invite someone');
    t.includes(h, 'sue@example.com · Waiting until 25/11/2026', 'a waiting invite, until a UK date');
    t.eq(attrOf(h, 'biz-inv-share-0-0', 'data-arg'), INV1, '…with Share');
    t.eq(attrOf(h, 'biz-inv-cancel-0-0', 'data-action'), 'biz-invite-cancel', '…and Cancel invite');
    t.includes(h, 'old@example.com · Declined · 02/11/2026', 'an answered one, with its date');
    t.excludes(h, 'id="biz-inv-cancel-0-1"', '…nothing to cancel');
    t.excludes(h, 'id="biz-main-0"', 'the main business: no Make main');

    // An Engineer in a team, with an invite of their own waiting.
    const e = await signedIn({ localStorage: { 'pat:businesses': stored([
      { id: OWN, name: '', role: 'owner', def: true, n: 1 }, { id: TEAM, name: 'Acme Testing Ltd', role: 'engineer', def: false, n: 3 }]) } });
    e.srv.rows = [{ id: OWN, name: '', role: 'owner', is_default: true, members: 1 }, { id: TEAM, name: 'Acme Testing Ltd', role: 'engineer', is_default: false, members: 3 }];
    e.srv.people = [
      { business_id: OWN, user_id: UID, name: 'Peter', role: 'owner', is_you: true, email: 'peter@example.com' },
      { business_id: TEAM, user_id: DAVE, name: 'Dave Smith', role: 'owner', is_you: false, email: null },
      { business_id: TEAM, user_id: UID, name: 'Peter B', role: 'engineer', is_you: true, email: null }];
    e.srv.invites = [];
    e.srv.mine = [{ id: INV1, business_id: 'aaaaaaaa-0000-4000-8000-000000000003', business_name: 'Sparks & Co', role: 'office', invited_by_name: 'Jo', expires_at: '2026-11-25T09:00:00Z' }];
    h = await openPage(e);
    t.includes(h, 'Sparks &amp; Co has invited you</h3>', 'an invite to me, its name escaped');
    t.includes(h, 'To join as Office · from Jo · until 25/11/2026', '…role, who, until when');
    t.eq(attrOf(h, 'biz-join-0', 'data-arg'), INV1, 'Join');
    t.eq(attrOf(h, 'biz-decline-0', 'data-action'), 'biz-decline', 'Decline');
    t.includes(h, 'Peter B (you)</span>', 'the team card: you, by your name there');
    t.excludes(h, 'id="biz-invite-1"', 'an Engineer: no Invite someone');
    t.excludes(h, 'id="biz-role-1-', '…and no Change role');
    const teamRows = h.slice(h.indexOf('id="biz-people-1"'), h.indexOf('</ul>', h.indexOf('id="biz-people-1"')));
    t.ok(teamRows.length > 50 && !/biz-person-email/.test(teamRows), 'the team’s people: no addresses (none sent — 6A)');
    t.eq(attrOf(h, 'biz-main-1', 'data-action'), 'biz-main', 'Make this my main business — on the team');
    // The Jobs list line.
    e.fn('setView')('sessions');
    e.fn('render')();
    h = html(e);
    t.includes(h, 'id="invite-banner-text">Sparks &amp; Co has invited you to join them on PATGo as Office.</div>', 'the Jobs list says so');
    t.eq(attrOf(h, 'invite-banner-open', 'data-arg'), 'cloudBusiness', '…See invite opens the Business page');
    tap(e, 'settings-page', 'cloudBusiness');
    t.eq(e.state().view, 'cloudBusiness', '…through the tap');
    e.srv.mine = e.srv.mine.concat([{ id: INV2, business_id: TEAM, business_name: '', role: 'engineer', expires_at: '2026-11-25T09:00:00Z' }]);
    e.fn('setView')('sessions'); e.fn('render')();
    e.run('document.querySelector = () => null; document.activeElement = null');   // nothing open, no cursor
    await e.run(`cloudClient().then(c => businessMyInvitesRead(c, '${UID}'))`);
    t.includes(html(e), 'You have 2 invites to join a business on PATGo.', 'a new invite read: the Jobs list repaints by itself (found in the browser check)');
    // No invites: no line.
    app.fn('setView')('sessions'); app.fn('render')();
    t.excludes(html(app), 'id="invite-banner"', 'none waiting: no line');
  });

  /* ------------------------------------------------------------------ 94c */
  await t.group('94c — the cloud steps: invite, refusal, Join (main?), Decline, Cancel, role, name, Make main, reads', async () => {
    const app = await signedIn();
    await openPage(app);
    // Owner: the role first.
    tap(app, 'biz-invite', OWN);
    let sh = topSheet(app);
    t.includes(sh, 'What will they do in Birchley Testing?', 'Owner: what will they do?');
    t.includes(sh, 'Engineer — logs their own jobs', '…Engineer');
    t.includes(sh, 'Team leader — logs jobs and sees the whole team’s', '…Team leader');
    t.includes(sh, 'Office — sees the whole team’s jobs, doesn’t log', '…Office');
    t.excludes(sh, 'Owner —', '…never Owner');
    app.doc.getElementById('choice-sheet-1').click();   // Team leader
    let inp = app.doc.getElementById('name-sheet-input');
    t.includes(topSheet(app), 'Invited as Team leader.', 'then their name');
    inp.value = '  Jo Bloggs ';
    app.doc.getElementById('name-sheet-save').click();
    inp = app.doc.getElementById('name-sheet-input');
    sh = topSheet(app);
    t.includes(sh, 'Jo Bloggs joins by signing in to PATGo with this exact address. The invite waits 14 days.', 'then the address');
    t.includes(sh, 'type="email" inputmode="email" autocapitalize="off"', '…the email keyboard');
    inp.value = 'not an address';
    app.doc.getElementById('name-sheet-save').click();
    t.ok(app.toasts.includes('That doesn’t look like an email address.'), 'a bad address: said…');
    t.eq(app.srv.rpcs('invite_member').length, 0, '…nothing sent');
    inp = app.doc.getElementById('name-sheet-input');
    t.ok(!!inp && /value="not an address"/.test(topSheet(app)), '…and the box comes back with it');
    inp.value = ' Jo@Example.COM ';
    app.doc.getElementById('name-sheet-save').click();
    await until(() => app.srv.rpcs('invite_member').length > 0);
    t.deepEq(app.srv.rpcs('invite_member')[0].body, { o: OWN, e: 'jo@example.com', n: 'Jo Bloggs', r: 'team_leader' }, 'invite_member: the business, the address lowercased, the name, the role');
    await until(() => /Invite sent/.test(topSheet(app)));
    sh = topSheet(app);
    t.includes(sh, 'Jo Bloggs can join Birchley Testing by signing in to PATGo with jo@example.com.', 'Invite sent: what happens next');
    t.includes(sh, '>Share the invite</button>', '…Share the invite');
    t.includes(sh, '>Done</button>', '…or Done');
    let shared = null;
    app.run('navigator.share = (o) => { globalThis.__shared = o; return Promise.resolve(); }');
    app.doc.getElementById('choice-sheet-0').click();
    shared = app.run('globalThis.__shared');
    t.ok(!!shared && /as Team leader/.test(shared.text) && /jo@example\.com/.test(shared.text), 'Share: the iPhone share sheet, with the message');

    // A refusal: words, nothing changed.
    app.srv.refuse = 'invite_member'; app.srv.refuseWith = 'patgo_phones_behind';
    const before = app.srv.rpcs('invite_member').length;
    await app.run(`businessInviteSend('${OWN}', 'engineer', 'Al', 'al@example.com')`);
    t.eq(app.srv.rpcs('invite_member').length, before + 1, 'asked');
    t.includes(topSheet(app), 'A phone in this business has an older PATGo.', '3A refused: in words, on a sheet that stays');
    app.srv.refuse = '';

    // Cancel.
    tap(app, 'biz-invite-cancel', INV1);
    t.includes(topSheet(app), 'Sue Jones (sue@example.com) won’t be able to join with it.', 'Cancel: asks first');
    app.doc.getElementById('confirm-sheet-yes').click();
    await until(() => app.srv.rpcs('cancel_invite').length > 0);
    t.deepEq(app.srv.rpcs('cancel_invite')[0].body, { i: INV1 }, 'cancel_invite');
    t.eq(app.run(`businessInviteCancel('${INV2}')`), false, 'an answered invite: nothing to cancel');
    // Change role.
    tap(app, 'biz-role', OWN + ':' + DAVE);
    sh = topSheet(app);
    t.includes(sh, 'Now: Engineer.', 'Change role: says the role now');
    t.excludes(sh, '>Engineer — logs', '…offers the others');
    app.doc.getElementById('choice-sheet-1').click();   // office (team_leader, office)
    await until(() => app.srv.rpcs('set_member_role').length > 0);
    t.deepEq(app.srv.rpcs('set_member_role')[0].body, { o: OWN, u: DAVE, r: 'office' }, 'set_member_role');
    t.eq(app.run(`businessRoleStart('${OWN}:${UID}')`), false, 'never your own');
    // Your name.
    tap(app, 'biz-myname', OWN);
    app.doc.getElementById('name-sheet-input').value = ' Peter ';
    app.doc.getElementById('name-sheet-save').click();
    await until(() => app.srv.rpcs('set_my_member_name').length > 0);
    t.deepEq(app.srv.rpcs('set_my_member_name')[0].body, { o: OWN, n: 'Peter' }, 'set_my_member_name');

    // Join (4A): asked, then the answer sent; the list read again.
    const j = await signedIn();
    j.srv.mine = [{ id: INV1, business_id: TEAM, business_name: 'Acme Testing Ltd', role: 'engineer', invited_by_name: '', expires_at: '2026-11-25T09:00:00Z' }];
    await openPage(j);
    tap(j, 'biz-join', INV1);
    sh = topSheet(j);
    t.includes(sh, 'Make Acme Testing Ltd your main business?', 'Join asks: main business?');
    t.includes(sh, 'Your own jobs stay where they are either way', '…and says nothing moves');
    t.includes(sh, '>Yes — make it my main business</button>', 'Yes');
    t.includes(sh, '>No — keep my own as main</button>', 'No');
    const nB = j.srv.rpcs('my_businesses').length;
    j.doc.getElementById('choice-sheet-0').click();
    await until(() => j.srv.rpcs('accept_invite').length > 0);
    t.deepEq(j.srv.rpcs('accept_invite')[0].body, { i: INV1, make_main: true }, 'accept_invite: Yes → make_main true');
    await until(() => j.srv.rpcs('my_businesses').length > nB);
    await until(() => j.run('businessList().length') === 2);
    t.ok(j.toasts.includes('You’ve joined Acme Testing Ltd'), 'says so');
    t.eq(j.run('businessDefault().id'), TEAM, 'the list read again: the team is main');
    j.srv.mine = [{ id: INV2, business_id: TEAM, business_name: 'Acme Testing Ltd', role: 'engineer', expires_at: '2026-11-25T09:00:00Z' }];
    await j.run(`cloudClient().then(c => businessMyInvitesRead(c, '${UID}'))`);
    await j.run(`businessJoin('${INV2}', false)`);
    t.deepEq(j.srv.rpcs('accept_invite')[1].body, { i: INV2, make_main: false }, 'No → make_main false');
    // A refused Join (3A): in words.
    j.srv.mine = [{ id: INV2, business_id: TEAM, business_name: 'Acme', role: 'engineer', expires_at: '2026-11-25T09:00:00Z' }];
    await j.run(`cloudClient().then(c => businessMyInvitesRead(c, '${UID}'))`);
    j.srv.refuse = 'accept_invite'; j.srv.refuseWith = 'patgo_your_phones_behind';
    await j.run(`businessJoin('${INV2}', true)`);
    t.includes(topSheet(j), 'A phone you’ve signed in on has an older PATGo', 'refused: the joiner’s phones, in words');
    j.srv.refuse = '';
    // Decline.
    tap(j, 'biz-decline', INV2);
    t.includes(topSheet(j), 'You won’t join Acme.', 'Decline asks first');
    j.doc.getElementById('confirm-sheet-yes').click();
    await until(() => j.srv.rpcs('decline_invite').length > 0);
    t.deepEq(j.srv.rpcs('decline_invite')[0].body, { i: INV2 }, 'decline_invite');
    // Make main.
    tap(j, 'biz-main', OWN);
    j.doc.getElementById('confirm-sheet-yes').click();
    await until(() => j.srv.rpcs('set_main_business').length > 0);
    t.deepEq(j.srv.rpcs('set_main_business')[0].body, { o: OWN }, 'set_main_business');

    // Team leader: Engineer only — straight to the name.
    const tl = await signedIn({ localStorage: { 'pat:businesses': stored([{ id: OWN, name: 'X', role: 'team_leader', def: true, n: 3 }]) } });
    tap(tl, 'biz-invite', OWN);
    t.includes(topSheet(tl), 'Invited as Engineer.', 'Team leader: no choice — Engineer (2A)');
    const eng = await signedIn({ localStorage: { 'pat:businesses': stored([{ id: OWN, name: 'X', role: 'engineer', def: true, n: 3 }]) } });
    t.eq(tl.run(`businessRoleStart('${OWN}:${DAVE}')`), false, 'only the Owner changes a role');
    t.eq(eng.run(`businessInviteStart('${OWN}')`), false, 'Engineer: nothing opens');

    // Reads: my invites on every start / return, with the list.
    const r = await signedIn();
    const n0 = r.srv.rpcs('my_invites').length;
    await r.run(`cloudClient().then(c => businessMaybeRead(c, '${UID}'))`);
    t.eq(r.srv.rpcs('my_invites').length, n0 + 1, 'start: my invites read with the list');
    r.run('businessReadOwe()');
    await r.run(`cloudClient().then(c => businessMaybeRead(c, '${UID}'))`);
    t.eq(r.srv.rpcs('my_invites').length, n0 + 2, 'back at the front: read again');
    r.srv.noV155 = true;
    r.run('businessReadOwe()');
    const ok = await r.run(`cloudClient().then(c => businessMaybeRead(c, '${UID}'))`);
    t.ok(ok === true, 'no V155 SQL: the list is still read');
    const h = await (async () => { r.fn('setView')('cloudBusiness'); await until(() => !r.run('state.business && state.business.reading')); await tick(30); r.fn('render')(); return html(r); })();
    t.includes(h, 'id="biz-name-0">Birchley Testing</h3>', 'no V155 SQL: the page as before');
  });

  /* ------------------------------------------------------------------ 94d */
  await t.group('94d — a paid seat anywhere (the cover); 8A the member’s line, Check now, no Renew sheets', async () => {
    const app = await signedIn();
    app.srv.billing = { plan: 'lapsed', lapsed_at: '2026-09-01T00:00:00Z', role: 'owner', can_manage: true,
      cover: { plan: 'active', trial_ends_at: null, lapsed_at: null } };
    await app.run('billingRead()');
    t.eq(JSON.parse(app.storage.getItem('pat:plan')).plan, 'active', 'the plan record takes the cover — never locked while any business pays');
    t.eq(app.run('state.billing.info.plan'), 'lapsed', '…the Subscription page still shows the main business’s');
    app.srv.billing = { plan: 'trial', trial_ends_at: '2030-01-01T00:00:00Z', role: 'owner', can_manage: true };
    await app.run('billingRead()');
    t.eq(JSON.parse(app.storage.getItem('pat:plan')).plan, 'trial', 'no cover sent (a project without V155): as before');

    // 8A: main business someone else's.
    const m = await signedIn({ localStorage: { 'pat:businesses': stored([
      { id: OWN, name: '', role: 'owner', def: false, n: 1 }, { id: TEAM, name: 'Acme', role: 'engineer', def: true, n: 3 }]) } });
    t.eq(m.run('planIsMember()'), true, 'main business someone else’s: a member');
    const st = (o) => JSON.stringify(Object.assign({ endsAt: Date.parse('2026-11-01'), lockAt: Date.parse('2026-11-20'), daysLeft: 5, lapsed: true }, o));
    t.eq(m.run(`planLineText(${st({ phase: 'grace' })})`), 'Your business’s plan has ended — the business owner looks after it. Logging locks in 5 days, on 20/11/2026.', 'grace: the owner looks after it, with the countdown');
    t.includes(m.run(`planLineText(${st({ phase: 'locked' })})`), 'Your business’s plan has ended, so logging tests, starting jobs and making certificates are locked — the business owner looks after it.', 'locked');
    t.includes(m.run(`planLineText(${st({ phase: 'ending' })})`), 'Your business’s free trial ends on 01/11/2026 — the business owner looks after it.', 'trial ending');
    t.includes(m.run(`_planLineButton(${st({ phase: 'locked' })}, 'x')`), 'data-action="plan-check">Check now', 'Check now, never Renew now');
    // The Renew sheets: an Owner in the same state gets one (so the check below can fail).
    const rec = `_planWrite({ uid: '${UID}', plan: 'lapsed', lapsedAt: new Date(Date.now() - 3 * 86400000).toISOString(), checkedAt: Date.now() })`;
    for (const x of [m, app]) {
      x.fn('setView')('sessions'); x.fn('render')();
      x.run('document.querySelector = () => null');   // no sheet open (the stub keeps closed ones)
      x.run(rec);
    }
    t.eq(app.run('planMaybePrompt()'), 'ended', 'control: an Owner gets the Renew sheet');
    t.eq(m.run('planMaybePrompt()'), '', 'no Renew sheets for a member');
    t.includes(m.run('syncPlanPausedWords()'), 'the business owner looks after it', 'the Sync page’s paused words too');
    t.eq(app.run('planIsMember()'), false, 'an Owner: not a member');
    t.includes(app.run('syncPlanPausedWords()'), 'once you renew', '…keeps “once you renew”');
    t.includes(app.run(`_planLineButton(${st({ phase: 'locked' })}, 'x')`), 'data-action="plan-renew">Renew now', '…and Renew now');
  });

  /* ------------------------------------------------------------------ 94e */
  await t.group('94e — release: V155; cache pat-v155; What’s new rolled; About V155 / V154 / V153', () => {
    const rel = freshApp();
    t.eq(rel.run('APP_VERSION'), 'V155', 'APP_VERSION V155');
    t.eq(rel.run('WELCOME_VERSION'), 'V155', 'What’s new rolled (a feature release)');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v155';", 'cache key pat-v155');
    t.eq(rel.fn('updateVersionLabel')('pat-v155'), 'V155', 'the update banner reads the key as V155');
    const core = read('render-core.js');
    const at = core.indexOf('<ul class="welcome-list sheet-scroll">');
    const sheetCopy = core.slice(at, core.indexOf('</ul>', at));
    t.eq((sheetCopy.match(/<li>/g) || []).length, 2, 'What’s new: two lines');
    t.includes(sheetCopy, '<li><strong>Invite people to your business.</strong>', '…inviting');
    t.includes(sheetCopy, '<li><strong>Been invited?</strong>', '…being invited');
    t.includes(sheetCopy, 'Your own jobs stay where they are.</li>', '…nothing of yours moves');
    const help = read('render-help.js');
    const x = help.indexOf('<p><strong>V155</strong>'), y = help.indexOf('<p><strong>V154</strong>'), z = help.indexOf('<p><strong>V153</strong>');
    t.ok(x > -1 && y > x && z > y, 'About: V155, V154, V153');
    t.excludes(help, '<p><strong>V152</strong>', 'V152 rolled off');
    t.includes(help, 'Invite people to your business by email address, see who&rsquo;s in it', 'About: V155’s line');
    t.includes(help, 'Behind the scenes: PATGo now checks what comes in from a backup file', 'About: V154’s line still there');
    t.includes(help, 'Behind the scenes: a phone that&rsquo;s too old to sync now stops reliably', 'About: V153’s line still there');
  });

  /* ------------------------------------------------------------------ 94f */
  await t.group('94f — the SQL: schema.sql in step; the database offers what the app does; the checks; isolation 23a–23h', () => {
    const mig = read('supabase/v155-invites.sql');
    const block = mig.slice(mig.indexOf('-- ================================================================ V155'),
      mig.indexOf('-- ================================================================ self-checks')).trimEnd();
    t.ok(block.length > 10000, 'the migration has its definitions');
    t.includes(read('supabase/schema.sql'), block, 'a new project gets them byte for byte (schema.sql)');
    t.includes(block, "when 'owner' then r in ('team_leader','engineer','office')\n    when 'team_leader' then r = 'engineer'\n    when 'office' then r = 'engineer'\n    else false end", '2A: the database offers what BUSINESS_OFFER does');
    t.includes(block, 'where u.id = auth.uid() and u.email_confirmed_at is not null', '1A: accepted only from the confirmed address');
    t.includes(block, "  if public.org_phones_behind(o) > 0 then raise exception 'patgo_phones_behind'; end if;", '3A: the business’s phones');
    t.includes(block, "  if public._user_phones_behind(me) > 0 then raise exception 'patgo_your_phones_behind'; end if;", '3A: the joiner’s own');
    t.includes(block, "  insert into public.memberships (org_id, user_id, role, is_default, name)\n  values (v.org_id, me, v.role, false, v.name);", '4A: joining never changes main by itself');
    t.includes(block, "expires_at  timestamptz not null default now() + interval '14 days'", '5A: 14 days…');
    t.eq(String(freshApp().run('BUSINESS_INVITE_DAYS')), '14', '…as the app says');
    t.includes(block, "create unique index if not exists invites_one_waiting on public.invites (org_id, email) where status = 'waiting';", '5A: one waiting per address');
    t.includes(block, "         case when public.can_read_org(m.org_id) then u.email end", '6A: addresses for Owner / Team leader / Office only');
    t.includes(block, "  if coalesce(current_setting('patgo.plan_copy', true), '') = 'on' then return null; end if;", 'the cover is never pushed into the person’s own business');
    t.includes(block, "revoke all on public.invites from public, anon, authenticated;", 'no phone reads or writes invites directly');
    t.includes(block, "'cover', (select to_jsonb(c) from public.plan_cover(auth.uid()) c))", 'my_billing carries the cover');
    const iso = read('supabase/isolation-test.sql');
    for (const c of ['23a', '23b', '23c', '23d', '23e', '23f', '23g', '23h']) t.includes(iso, `'${c}|`, `isolation ${c}`);
    t.includes(iso, "-- V155: CHECKS 23a–23h NEED supabase/v155-invites.sql RUN FIRST", 'isolation: the note at the top');
  });
};
