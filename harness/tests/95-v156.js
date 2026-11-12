/* Standing test — V156: devices that hold up invites (Teams v1)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   Peter, 11 Nov — "defaults" (R66): 1A only devices still signed in count
   toward the old-phone check · 2A a refused invite or Join names the devices
   holding it up, your own with Sign it out, a teammate's named only · 3A
   Account → Your devices, every signed-in device with Sign it out. Signing out
   only ever on a tap. What these groups pin:
     95a  business.js on its own: device rows from the cloud (bad values made
          safe), the device in words, the kinds the database names.
     95b  On screen: Account → Your devices ›; the page (this device first, no
          Sign it out on it; an older one says it holds up invites; a sign-in
          that never synced says so); Back to Account; signed out, Sign in.
     95c  Sign it out against a pretend Supabase: asked first, sign_out_device
          with that sign-in, said, the page read again; no signal → nothing
          sent; the database's "that's this device" in words; reads with
          cloudClient (works below the minimum version).
     95d  The refusal names the devices (2A): an invite reads
          business_devices_behind for that business — yours with Sign out, a
          teammate's named only; a Join reads my_devices and lists only those
          behind; a list that can't be read falls back to V155's words.
     95e  Carried: the update banner reads pat-v156 (release checks → 96e).
     95f  The SQL's text: schema.sql carries v156-devices.sql's block byte for
          byte; only signed-in devices; never another's sign-in or this one;
          the kinds as the app has them; isolation 24a–24e.

   ⚠ WHAT THIS FILE CANNOT PROVE: that the database counts and refuses what it
   should. That is supabase/v156-devices.sql's own checks (V1–V4) and
   isolation-test.sql 24a–24e — run at V156 against a local Postgres 16
   stand-in (an upgraded project and a new one), plus an 18-step scenario with
   Peter's real case (a V150 phone still signed in), with broken copies of the
   SQL each caught. */

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
const OWN  = 'aaaaaaaa-0000-4000-8000-000000000001';
const S_HERE = 'eeeeeeee-0000-4000-8000-000000000001';
const S_OLD  = 'eeeeeeee-0000-4000-8000-000000000002';
const S_MAC  = 'eeeeeeee-0000-4000-8000-000000000003';
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const stored = (list, u = UID, at = Date.now()) => JSON.stringify({ u, at, list });

function storedSession() {
  const life = 3600;
  return JSON.stringify({
    access_token: 'ZZACCESS156', token_type: 'bearer', expires_in: life,
    expires_at: Math.floor(Date.now() / 1000) + life, refresh_token: 'ZZREFRESH',
    user: { id: UID, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' },
  });
}

const MINE = () => [
  { session_id: S_HERE, kind: 'iPhone', app_version: 'V156', last_used: '2026-11-11T21:00:00Z', reported: true, behind: false, this_device: true },
  { session_id: S_OLD, kind: 'iPhone', app_version: 'V150', last_used: '2026-11-06T09:00:00Z', reported: true, behind: true, this_device: false },
  { session_id: S_MAC, kind: 'Mac', app_version: null, last_used: '2026-10-15T09:00:00Z', reported: false, behind: true, this_device: false },
];

// A pretend Supabase for the V156 rpcs (plus what start-up reads).
function fakeServer() {
  const calls = [];
  const srv = {
    calls, refuse: '', refuseWith: '', mine: MINE(), noList: false,
    held: [
      { user_id: UID, name: 'Peter', is_you: true, session_id: S_OLD, kind: 'iPhone', app_version: 'V150', last_used: '2026-11-06T09:00:00Z', reported: true },
      { user_id: '22222222-2222-4222-8222-222222222222', name: 'Dave Smith', is_you: false, session_id: null, kind: 'Android phone', app_version: 'V147', last_used: '2026-11-04T09:00:00Z', reported: true },
    ],
  };
  srv.fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    let body = null;
    if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    calls.push({ url: u, method, body });
    const rpc = (u.match(/\/rest\/v1\/rpc\/([a-z_]+)$/) || [])[1];
    if (rpc && rpc === srv.refuse) return json({ message: srv.refuseWith, code: 'P0001' }, 400);
    if (srv.noList && (rpc === 'my_devices' || rpc === 'business_devices_behind')) return json({ message: 'Could not find the function' }, 404);
    if (rpc === 'my_devices') return json(srv.mine);
    if (rpc === 'business_devices_behind') return json(srv.held);
    if (rpc === 'sign_out_device') { const had = srv.mine.some(d => d.session_id === body.s); srv.mine = srv.mine.filter(d => d.session_id !== body.s); return json(had); }
    if (rpc === 'my_businesses') return json([{ id: OWN, name: 'Birchley Testing', role: 'owner', is_default: true, members: 2 }]);
    if (rpc === 'my_job_moves' || rpc === 'my_invites' || rpc === 'business_people' || rpc === 'business_invites') return json([]);
    if (rpc === 'invite_member' || rpc === 'accept_invite') return json('ok');
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
    'pat:businesses': stored([{ id: OWN, name: 'Birchley Testing', role: 'owner', def: true, n: 2 }]) }, o.localStorage || {});
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
async function openDevices(app) {
  app.fn('setView')('cloudDevices');
  await until(() => app.srv.rpcs('my_devices').length > 0 && !app.run('_bizDev.reading'));
  app.fn('render')();
  return html(app);
}

module.exports = async function () {
  /* ------------------------------------------------------------------ 95a */
  await t.group('95a — business.js: device rows made safe, the device in words, the kinds', async () => {
    const app = freshApp();
    const rows = JSON.parse(app.run(`JSON.stringify(businessDevicesFromRows([
      { session_id: '${S_OLD}', kind: 'iPhone', app_version: 'V150', last_used: '2026-11-06T09:00:00Z', reported: true, behind: true, this_device: false },
      { session_id: 'not-an-id', kind: '<b>Toaster</b>', app_version: '<img src=x>', reported: 'yes', behind: 1 },
      null, 'junk',
      { session_id: null, kind: 'Android phone', app_version: 'V147', name: 'Dave Smith', is_you: false, reported: true }]))`));
    t.eq(rows.length, 3, 'three rows; null and a string dropped');
    t.deepEq(rows[0], { session: S_OLD, kind: 'iPhone', version: 'V150', used: '2026-11-06T09:00:00Z', reported: true, behind: true, here: false, you: true, who: '' }, 'a good row in the phone’s shape (mine by default)');
    t.eq(rows[1].session, '', 'a session that isn’t an id: none (no Sign it out)');
    t.eq(rows[1].kind, 'Device', 'an unknown kind: Device');
    t.eq(rows[1].version, '', 'a version PATGo never had: none');
    t.ok(rows[1].reported === false && rows[1].behind === false, 'only true is true');
    t.ok(rows[2].you === false && rows[2].who === 'Dave Smith' && rows[2].session === '', 'a teammate’s: named, no sign-in');
    const w = (row, who) => app.run(`businessDeviceWords(businessDevicesFromRows([${JSON.stringify(row)}])[0], ${JSON.stringify(who)})`);
    t.eq(w({ kind: 'iPhone', app_version: 'V150', last_used: '2026-11-06T09:00:00Z', reported: true }, 'your'), 'Your iPhone · V150 · last used 06/11/2026', '2A: “Your iPhone · V150 · last used 06/11/2026” (the phone’s date setting)');
    t.eq(w({ kind: 'Android phone', app_version: 'V147', last_used: '2026-11-04T09:00:00Z', reported: true }, 'Dave Smith'), 'Dave Smith’s Android phone · V147 · last used 04/11/2026', '…a teammate’s');
    t.eq(w({ kind: 'Mac', last_used: '2026-10-15T09:00:00Z', reported: false }, 'your'), 'Your Mac · signed in, never synced · last used 15/10/2026', '…a sign-in that never synced');
    t.eq(w({ kind: 'Device', reported: true }, ''), 'Device · an older PATGo', '…no day, no version: still words');
    t.deepEq(JSON.parse(app.run('JSON.stringify(Object.keys(BUSINESS_DEVICE_KINDS))')),
      ['iPhone', 'iPad', 'Android phone', 'Mac', 'Windows computer', 'Computer', 'Device'], 'the kinds the database names (95f checks it there)');
  });

  /* ------------------------------------------------------------------ 95b */
  await t.group('95b — on screen: Account → Your devices; the page; Back; signed out', async () => {
    const app = await signedIn();
    app.fn('setView')('cloudAccount');
    let h = html(app);
    t.includes(h, 'id="cloud-devices-open"', 'the Account page: Your devices ›');
    t.eq(attrOf(h, 'cloud-devices-open', 'data-arg'), 'cloudDevices', '…opens the page');
    tap(app, 'settings-page', 'cloudDevices');
    t.eq(app.state().view, 'cloudDevices', '…through the tap');
    h = await openDevices(app);
    t.ok(app.srv.rpcs('my_devices').length >= 1, '3A: read on open (my_devices)');
    t.includes(h, '>Your devices</div>', 'the title');
    t.includes(h, 'id="dev-name-0">This iPhone (the one you’re using)</div>', 'this device first, said so');
    t.excludes(h, 'id="dev-signout-0"', '…with no Sign it out (the Account page’s Sign out is for this one)');
    t.includes(h, 'id="dev-detail-0">PATGo V156 · last used 11/11/2026</div>', '…its version and last used');
    t.includes(h, 'id="dev-name-1">iPhone</div>', 'the old iPhone listed (“iPhone”, never “IPhone”)');
    t.includes(h, 'id="dev-detail-1">PATGo V150 · last used 06/11/2026</div>', '…V150, 6 Nov');
    t.includes(h, 'id="dev-old-1">An older PATGo — holds up invites until it updates or is signed out.</div>', '…says it holds up invites');
    t.eq(attrOf(h, 'dev-signout-1', 'data-arg'), S_OLD, '…Sign it out names that sign-in');
    t.includes(h, 'id="dev-detail-2">Signed in, never synced · last used 15/10/2026</div>', 'a sign-in that never synced');
    t.includes(h, 'id="dev-old-2">Hasn’t synced since it signed in — holds up invites until it does or is signed out.</div>', '…says so');
    t.excludes(h, 'id="dev-old-0"', 'this one isn’t behind: no warning');
    t.eq(attrOf(h, 'dev-back', 'data-arg'), 'cloudAccount', 'Back goes to Account');
    tap(app, 'settings-page', 'cloudAccount');
    t.eq(app.state().view, 'cloudAccount', '…through the tap');
    // a stale view on a locked phone: the code box, never the page
    const locked = await signedIn();
    locked.run("cloudPagesUnlocked = () => false");
    locked.state().view = 'cloudDevices';
    locked.fn('render')();
    t.excludes(html(locked), 'cloud-devices-page', 'locked: never painted');
    // signed out
    const out = await signedIn();
    out.run("state.cloud.status = 'signed-out'");
    out.state().view = 'cloudDevices';
    out.fn('render')();
    t.includes(html(out), 'Sign in to see your devices.', 'signed out: Sign in');
    t.ok(!!freshApp().run("typeof renderCloudDevices === 'function'"), 'the page lives in business.js');
  });

  /* ------------------------------------------------------------------ 95c */
  await t.group('95c — Sign it out: asked first, the rpc, said, read again; no signal; this device; below the minimum', async () => {
    const app = await signedIn();
    await openDevices(app);
    const reads = app.srv.rpcs('my_devices').length;
    tap(app, 'dev-signout', S_OLD);
    let sh = topSheet(app);
    t.includes(sh, 'Sign out this iPhone?', 'asked first');
    t.includes(sh, 'Your iPhone · V150 · last used 06/11/2026.', '…which one');
    t.includes(sh, 'Everything on it stays on it — any jobs it hasn’t sent wait there until you sign in on it again.', '…nothing on it is lost');
    t.eq(app.srv.rpcs('sign_out_device').length, 0, '…nothing sent yet');
    const yes = app.doc.getElementById('confirm-sheet-yes');
    t.ok(!!yes, 'the Sign it out button');
    yes.click();
    await until(() => app.srv.rpcs('sign_out_device').length > 0);
    t.deepEq(app.srv.rpcs('sign_out_device')[0].body, { s: S_OLD }, 'sign_out_device with that sign-in');
    await until(() => app.toasts.length > 0);
    t.ok(app.toasts.includes('Signed out — it no longer holds anything up'), 'said');
    await until(() => app.srv.rpcs('my_devices').length > reads && !app.run('_bizDev.reading'));
    app.fn('render')();
    t.excludes(html(app), S_OLD, 'the page read again: gone');
    // this device: no button, and the confirm never starts
    t.eq(app.run(`businessDeviceSignOut('${S_HERE}')`), false, 'this device: nothing to ask');
    // already gone
    await app.run(`businessDeviceSignOutGo('${S_OLD}')`);
    t.ok(app.toasts.includes('That device was already signed out'), 'already gone: said');
    // the database's "this device"
    app.srv.refuse = 'sign_out_device'; app.srv.refuseWith = 'patgo_this_device';
    await app.run(`businessDeviceSignOutGo('${S_MAC}')`);
    t.includes(topSheet(app), 'That’s the device you’re using — sign out from the Account page instead.', 'patgo_this_device in words');
    app.srv.refuse = '';
    // no signal
    const sent = app.srv.rpcs('sign_out_device').length;
    app.run('navigator.onLine = false');
    await app.run(`businessDeviceSignOutGo('${S_MAC}')`);
    t.ok(app.toasts.includes('You need a signal to sign a device out.'), 'no signal: said');
    t.eq(app.srv.rpcs('sign_out_device').length, sent, '…nothing sent');
    app.run('navigator.onLine = true');
    // Account-level: reads with cloudClient, not the minimum-version gate
    t.includes(read('business.js'), 'function _bizDevClient() { return cloudClient(); }', 'below the minimum version it still works (cloudClient)');
  });

  /* ------------------------------------------------------------------ 95d */
  await t.group('95d — the refusal names the devices (2A): invite, Join, a list that can’t be read', async () => {
    const app = await signedIn();
    app.srv.refuse = 'invite_member'; app.srv.refuseWith = 'patgo_phones_behind';
    await app.run(`businessInviteSend('${OWN}', 'engineer', 'Al', 'al@example.com')`);
    t.deepEq(app.srv.rpcs('business_devices_behind').slice(-1)[0].body, { o: OWN }, 'invite: business_devices_behind for that business');
    let sh = topSheet(app);
    t.includes(sh, 'Not sent yet: 2 devices in this business have an older PATGo signed in.', 'says why');
    t.includes(sh, '<li>Your iPhone · V150 · last used 06/11/2026</li>', '…names yours');
    t.includes(sh, '<li>Dave Smith’s Android phone · V147 · last used 04/11/2026</li>', '…names a teammate’s');
    t.includes(sh, 'Ask the others to open PATGo with a signal', '…what the others do');
    t.includes(sh, '>Sign out your iPhone (V150)</button>', 'Sign out for yours — short enough for one line');
    t.excludes(sh, 'Sign out Dave', '…never a teammate’s');
    t.excludes(sh, 'id="choice-sheet-1"', '…one Sign out only: yours (a teammate’s device has no button at all)');
    t.includes(sh, '>Close</button>', 'Close');
    app.doc.getElementById('choice-sheet-0').click();
    t.includes(topSheet(app), 'Sign out this iPhone?', 'picking it asks first');
    app.srv.refuse = '';
    // Join: my own, only those behind
    const j = await signedIn();
    j.srv.refuse = 'accept_invite'; j.srv.refuseWith = 'patgo_your_phones_behind';
    await j.run(`_bizCall('accept_invite', { i: 'x', make_main: false })`);
    t.ok(j.srv.rpcs('my_devices').length > 0, 'Join: my_devices');
    sh = topSheet(j);
    t.includes(sh, 'Not joined yet: 2 devices signed in to your account', 'says why');
    t.includes(sh, '<li>Your iPhone · V150 · last used 06/11/2026</li>', '…the old iPhone');
    t.includes(sh, '<li>Your Mac · signed in, never synced · last used 15/10/2026</li>', '…the never-synced Mac');
    t.excludes(sh, 'V156', '…not this one (not behind)');
    t.includes(sh, 'Then tap Join again.', '…what next');
    j.srv.refuse = '';
    // the list can't be read: V155's words
    const n = await signedIn();
    n.srv.noList = true; n.srv.refuse = 'invite_member'; n.srv.refuseWith = 'patgo_phones_behind';
    await n.run(`businessInviteSend('${OWN}', 'engineer', 'Al', 'al@example.com')`);
    t.includes(topSheet(n), 'A phone in this business has an older PATGo.', 'no list: the V155 words');
    // other refusals untouched
    n.srv.refuse = 'invite_member'; n.srv.refuseWith = 'patgo_invite_waiting';
    const lists = n.srv.rpcs('business_devices_behind').length;
    await n.run(`businessInviteSend('${OWN}', 'engineer', 'Al', 'al@example.com')`);
    t.includes(topSheet(n), 'They already have an invite waiting', 'another refusal: its own words');
    t.eq(n.srv.rpcs('business_devices_behind').length, lists, '…no device read');
  });

  /* ------------------------------------------------------------------ 95e */
  await t.group('95e — V156 carried (release checks → 96e)', () => {
    const rel = freshApp();
    t.eq(rel.fn('updateVersionLabel')('pat-v156'), 'V156', 'the update banner reads pat-v156 as V156');
    t.eq(rel.fn('updateVersionLabel')('pat-v156-1'), 'V156.1', '…and a hotfix key as V156.1');
  });

  /* ------------------------------------------------------------------ 95f */
  await t.group('95f — the SQL: schema.sql in step; only signed-in devices; never another’s or this one; isolation 24a–24e', () => {
    const mig = read('supabase/v156-devices.sql');
    const block = mig.slice(mig.indexOf('-- ================================================================ V156'),
      mig.indexOf('-- ================================================================ self-checks')).trimEnd();
    t.ok(block.length > 4000, 'the migration has its definitions');
    t.includes(read('supabase/schema.sql'), block, 'a new project gets them byte for byte (schema.sql)');
    t.includes(block, "      where ph.user_id = ses.user_id and ph.auth_session = ses.id", '1A: a phone’s report counts only on the sign-in it came on');
    t.includes(block, '    from auth.sessions ses', '…and only sign-ins still there');
    t.includes(block, "      and (ses.not_after is null or ses.not_after > now())", '…not past their end');
    t.includes(block, "  where mm.org_id = o and d.behind", 'the business’s check reads the one list');
    t.includes(block, "select count(*)::integer from public._signed_in_devices(u) d where d.behind", 'the joiner’s check reads the one list');
    t.includes(block, "  delete from auth.sessions x where x.id = s and x.user_id = me;", 'Sign it out: my own sign-ins only');
    t.includes(block, "  if s = public._my_session() then raise exception 'patgo_this_device'; end if;", '…never the one asking');
    t.includes(block, "  if me is null or not public.can_read_org(o) then", '2A: the devices of a business — Owner / Team leader / Office only');
    t.includes(block, "           case when mm.user_id = me then d.session_id end as session_id,", '…a teammate’s sign-in never handed out');
    const kinds = [...block.matchAll(/then '([A-Za-z ]+)'\n/g)].map(m => m[1]).concat(['Device']);
    t.deepEq(kinds, JSON.parse(freshApp().run('JSON.stringify(Object.keys(BUSINESS_DEVICE_KINDS))')), 'the kinds the database names are the app’s');
    t.includes(mig, 'if either is ever run again, run this file again straight after it.', 'the note: v151 / v155 put the old checks back');
    const iso = read('supabase/isolation-test.sql');
    for (const c of ['24a', '24b', '24c', '24d', '24e']) t.includes(iso, `'${c}|`, `isolation ${c}`);
    t.includes(iso, '-- V156: CHECKS 24a–24e NEED supabase/v156-devices.sql RUN FIRST', 'isolation: the note at the top');
  });
};
