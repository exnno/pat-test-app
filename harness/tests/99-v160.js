/* Standing test — V160: Join rechecks the business's phones (the second GPT audit, finding 4)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

     99a  the real Join taps (an Engineer invite, an Office invite): the
          database refuses for the business's phones → "Not joined yet" naming
          the business only (2A) — no device list read, no device or person
          named, no Sign out, no "joined" toast; the invite is still listed;
          once the phone is updated, Join goes through.
     99b  the other refusals untouched: the joiner's own phones still get V156's
          sheet with their devices (1A's first answer); an invite's refusal
          still names the business's devices; the three codes never mistaken for
          each other; the words with no invite to hand; a business name is
          escaped on the sheet.
     99e  the SQL's text: schema.sql carries v160-join.sql's block byte for byte
          as its last section; the order (own phones, then the business's, then
          the membership); every role; the already-member Join untouched;
          self-checks J1–J2; isolation 27a–27c.
     99f  V160's About line; business.js header (V161: the release checks → 100f).

   ⚠ WHAT THIS FILE CANNOT PROVE: that the database refuses. That is
   supabase/v160-join.sql's own checks (J1–J2) and isolation-test.sql 27a–27c —
   run at V160 against a local Postgres 16 stand-in (an upgraded project and a
   new one), plus a 15-step scenario with five people (9 of its steps fail on
   V159), with nine broken copies of the SQL each caught. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { freshApp, tick } = require('../fixture');

const LIB  = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const UID  = '11111111-1111-1111-1111-111111111111';
const AUTH = 'patgo:cloudAuth:test';
const OWN  = 'aaaaaaaa-0000-4000-8000-000000000001';
const TEAM = 'aaaaaaaa-0000-4000-8000-000000000002';
const OFF  = 'aaaaaaaa-0000-4000-8000-000000000003';
const INV_ENG = 'cccccccc-0000-4000-8000-000000000011';
const INV_OFF = 'cccccccc-0000-4000-8000-000000000012';
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const stored = (list, u = UID, at = Date.now()) => JSON.stringify({ u, at, list });
const MINE_ROWS = () => ([
  { id: INV_ENG, business_id: TEAM, business_name: 'Acme Testing Ltd', role: 'engineer', invited_by_name: 'Al', expires_at: '2026-11-26T09:00:00Z' },
  { id: INV_OFF, business_id: OFF, business_name: 'Smith Electrical', role: 'office', invited_by_name: 'Jo', expires_at: '2026-11-26T09:00:00Z' },
]);
const DEVICES = [
  { session_id: 'dddddddd-0000-4000-8000-000000000001', kind: 'iPhone', app_version: 'V150', last_used: '2026-11-06T09:00:00Z', reported: true, behind: true, this_device: false },
  { session_id: 'dddddddd-0000-4000-8000-000000000002', kind: 'iPhone', app_version: 'V160', last_used: '2026-11-12T09:00:00Z', reported: true, behind: false, this_device: true },
];

function storedSession() {
  const life = 3600;
  return JSON.stringify({
    access_token: 'ZZACCESS160', token_type: 'bearer', expires_in: life,
    expires_at: Math.floor(Date.now() / 1000) + life, refresh_token: 'ZZREFRESH',
    user: { id: UID, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' },
  });
}

// A pretend Supabase: my business, my invites, refusals on demand.
function fakeServer() {
  const calls = [];
  const srv = {
    calls, refuse: '', refuseWith: '',
    rows: [{ id: OWN, name: 'Birchley Testing', role: 'owner', is_default: true, members: 1 }],
    mine: MINE_ROWS(),
  };
  srv.fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    let body = null;
    if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    calls.push({ url: u, method, body });
    const rpc = (u.match(/\/rest\/v1\/rpc\/([a-z_]+)$/) || [])[1];
    if (rpc && rpc === srv.refuse) return json({ message: srv.refuseWith, code: 'P0001' }, 400);
    if (rpc === 'my_businesses') return json(srv.rows);
    if (rpc === 'my_job_moves') return json([]);
    if (rpc === 'business_waiting_moves') return json([]);
    if (rpc === 'my_invites') return json(srv.mine);
    if (rpc === 'business_people') return json([]);
    if (rpc === 'business_invites') return json([]);
    if (rpc === 'my_devices') return json(DEVICES);
    if (rpc === 'business_devices_behind') return json([]);
    if (rpc === 'accept_invite') {
      const v = srv.mine.find(x => x.id === body.i);
      srv.mine = srv.mine.filter(x => x.id !== body.i);
      if (v) srv.rows.push({ id: v.business_id, name: v.business_name, role: v.role, is_default: false, members: 2 });
      return json('joined');
    }
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
    'pat:businesses': stored([{ id: OWN, name: 'Birchley Testing', role: 'owner', def: true, n: 1 }]) }, o.localStorage || {});
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
const sheets = (app) => app.doc.body.children.filter(c => /bulk-sheet/.test(c.className || ''));
const topSheet = (app) => { const s = sheets(app); return s.length ? s[s.length - 1].innerHTML : ''; };
const inviteIds = (app) => JSON.parse(app.run('JSON.stringify(businessMyInvites().map(v => v.id))'));
const WORDS = (org) => `A phone in ${org} has an older PATGo, so you can’t join just yet. Ask them to open PATGo with a signal so it updates, then tap Join again. Your invite is still waiting.`;

module.exports = async function () {
  /* ------------------------------------------------------------------ 99a */
  await t.group('99a — Join refused for the business’s phones: the business named, nothing else (2A); the invite waits; Join again works', async () => {
    const app = await signedIn();
    app.fn('setView')('cloudBusiness');
    await until(() => app.srv.rpcs('my_invites').length > 0 && inviteIds(app).length === 2);
    t.deepEq(inviteIds(app), [INV_ENG, INV_OFF], 'two invites waiting');

    // An Engineer invite, "No — keep my own as main" (the real taps).
    app.srv.refuse = 'accept_invite'; app.srv.refuseWith = 'patgo_team_phones_behind';
    t.eq(app.run(`businessJoinStart('${INV_ENG}')`), true, 'Join: asked about main');
    app.doc.getElementById('choice-sheet-1').click();
    await until(() => app.srv.rpcs('accept_invite').length > 0 && /Not joined yet/.test(topSheet(app)));
    t.deepEq(app.srv.rpcs('accept_invite')[0].body, { i: INV_ENG, make_main: false }, 'accept_invite sent as asked');
    let sh = topSheet(app);
    t.includes(sh, '>Not joined yet</h3>', 'title: Not joined yet');
    t.includes(sh, WORDS('Acme Testing Ltd'), '2A: the business named, what to do, the invite still waiting');
    t.excludes(sh, '<li>', '…no device listed');
    t.excludes(sh, 'Sign out', '…no Sign out');
    t.eq(app.srv.rpcs('my_devices').length + app.srv.rpcs('business_devices_behind').length, 0, 'no device list read');
    t.ok(!app.toasts.some(m => /joined/.test(m)), 'no "joined" toast');
    t.deepEq(inviteIds(app), [INV_ENG, INV_OFF], 'the invite is still listed');
    app.doc.getElementById('info-sheet-ok').click();

    // An Office invite (4A): the same, named.
    t.eq(app.run(`businessJoinStart('${INV_OFF}')`), true, 'Office Join: asked');
    app.doc.getElementById('confirm-sheet-yes').click();
    await until(() => app.srv.rpcs('accept_invite').length > 1 && /Smith Electrical has an older/.test(topSheet(app)));
    t.includes(topSheet(app), WORDS('Smith Electrical'), 'Office: the same words, its business named');
    app.doc.getElementById('info-sheet-ok').click();

    // The phone updated: Join again goes through.
    app.srv.refuse = '';
    t.eq(app.run(`businessJoinStart('${INV_ENG}')`), true, 'Join again: asked');
    app.doc.getElementById('choice-sheet-1').click();
    await until(() => app.toasts.some(m => /joined/.test(m)));
    t.ok(app.toasts.includes('You’ve joined Acme Testing Ltd'), 'joined');
    await until(() => inviteIds(app).length === 1);
    t.deepEq(inviteIds(app), [INV_OFF], '…and that invite has gone from the list');
  });

  /* ------------------------------------------------------------------ 99b */
  await t.group('99b — the other refusals untouched; the codes kept apart; no invite to hand; names escaped', async () => {
    // 1A's first answer: the joiner's own phones → V156's sheet, their devices.
    const j = await signedIn();
    j.srv.refuse = 'accept_invite'; j.srv.refuseWith = 'patgo_your_phones_behind';
    await j.run(`_bizCall('accept_invite', { i: '${INV_ENG}', make_main: false })`);
    t.ok(j.srv.rpcs('my_devices').length > 0, 'own phones behind: my devices read (V156)');
    t.includes(topSheet(j), 'Not joined yet: a device signed in to your account has an older PATGo', '…V156’s words');
    t.includes(topSheet(j), '<li>Your iPhone · V150 · last used 06/11/2026</li>', '…the old iPhone named');
    t.excludes(topSheet(j), 'A phone in Acme Testing Ltd', '…not the business’s words');

    // An invite's refusal still names the business's devices (V156).
    const i = await signedIn();
    i.srv.refuse = 'invite_member'; i.srv.refuseWith = 'patgo_phones_behind';
    await i.run(`businessInviteSend('${OWN}', 'engineer', 'Al', 'al@example.com')`);
    t.ok(i.srv.rpcs('business_devices_behind').length > 0, 'an invite refused: the business’s devices read (V156)');

    // The codes never mistaken for one another.
    const h = (m) => j.fn('_bizHeldUp')({ message: m });
    const b = (m) => j.fn('_bizTeamBehind')({ message: m });
    t.eq(b('patgo_team_phones_behind'), true, '_bizTeamBehind: the new code');
    t.eq(b('patgo_phones_behind') || b('patgo_your_phones_behind'), false, '…not the invite’s or the joiner’s');
    t.eq(h('patgo_team_phones_behind'), false, '_bizHeldUp: not the new code (no device sheet)');
    t.eq(h('patgo_phones_behind') && h('patgo_your_phones_behind'), true, '…still the other two');
    t.eq(j.fn('businessTeamError')({ message: 'patgo_team_phones_behind' }),
      'A phone in that business has an older PATGo, so you can’t join just yet. Ask them to open PATGo with a signal so it updates, then tap Join again. Your invite is still waiting.',
      'businessTeamError: the words, if it ever lands there');
    t.includes(j.fn('businessTeamError')({ message: 'patgo_phones_behind' }), 'A phone in this business has an older PATGo.', '…the invite’s words unchanged');

    // No invite to hand (gone from the list meanwhile): "that business".
    t.eq(j.fn('businessJoinTeamBehindWords')('nope'), WORDS('that business'), 'no invite: “that business”');

    // A business name is text, never markup.
    const srv = fakeServer();
    srv.mine = [Object.assign(MINE_ROWS()[0], { business_name: '<img src=x onerror=alert(1)>' })];
    const x = await signedIn({ srv });
    x.fn('setView')('cloudBusiness');
    await until(() => inviteIds(x).length === 1);
    x.srv.refuse = 'accept_invite'; x.srv.refuseWith = 'patgo_team_phones_behind';
    await x.run(`_bizCall('accept_invite', { i: '${INV_ENG}', make_main: false })`);
    t.includes(topSheet(x), 'A phone in &lt;img src=x onerror=alert(1)&gt; has an older PATGo', 'the name escaped');
    t.excludes(topSheet(x), '<img', '…no markup');
  });

  /* ------------------------------------------------------------------ 99e */
  await t.group('99e — the SQL: schema.sql in step; own phones, then the business’s, then the membership; every role; J1–J2; isolation 27a–27c', () => {
    const mig = read('supabase/v160-join.sql');
    const block = mig.slice(mig.indexOf('-- ================================================================ V160'),
      mig.indexOf('-- ================================================================ self-checks')).trimEnd();
    t.ok(block.length > 1500, 'the migration has its definition');
    t.includes(read('supabase/schema.sql'), block, 'a new project gets it byte for byte (schema.sql)');
    const sch = read('supabase/schema.sql');   // V161: no longer the last section — V161's follows (100e)
    t.ok(sch.indexOf(block) > sch.indexOf('-- ================================================================ V159') && sch.indexOf(block) < sch.indexOf('-- ================================================================ V161'), '…after V159’s (it overrides V159’s Join), before V161’s');
    const own = "  if public._user_phones_behind(me) > 0 then raise exception 'patgo_your_phones_behind'; end if;\n";
    const team = "  if public.org_phones_behind(v.org_id) > 0 then raise exception 'patgo_team_phones_behind'; end if;\n";
    const member = "    return 'joined';\n  end if;\n";
    const ins = '  insert into public.memberships (org_id, user_id, role, is_default, name)\n';
    t.includes(block, team, 'the business’s phones, the invite’s own business');
    t.ok(block.indexOf(member) > -1 && block.indexOf(member) < block.indexOf(own), 'an existing member is marked joined before any check');
    t.ok(block.indexOf(own) < block.indexOf(team), '1A: the joiner’s own phones first');
    t.ok(block.indexOf(team) < block.indexOf(ins), '…then the business’s, before the membership');
    t.excludes(team, 'role', '4A: every role');
    t.includes(block, "  if coalesce(make_main, false) and v.role <> 'office' then", 'V159 kept: Join as Office never makes it main');
    t.includes(block, 'grant execute on function public.accept_invite(uuid, boolean) to authenticated;', 'a signed-in phone may Join');
    t.includes(mig, 'v155-invites.sql or v159-office.sql puts their older', 'the migration says which re-runs undo it');
    for (const c of ['J1', 'J2']) t.includes(mig, `'${c}|`, `self-check ${c}`);
    const iso = read('supabase/isolation-test.sql');
    for (const c of ['27a', '27b', '27c']) t.includes(iso, `'${c}|`, `isolation ${c}`);
    t.includes(iso, '-- V160: CHECKS 27a–27c NEED supabase/v160-join.sql RUN FIRST', 'isolation: the note at the top');
    t.includes(iso, "delete from auth.sessions where user_agent = 'patgo-iso-test-160';\n    delete from public.memberships where org_id = org_a and user_id = b;", 'isolation: the pretend sign-in removed (27c)');
  });

  /* ------------------------------------------------------------------ 99f */
  // V161: the release checks moved to 100f; this keeps V160's own About line.
  await t.group('99f — V160’s About line; business.js header', () => {
    const help = read('render-help.js');
    t.excludes(help, 'Joining a business checks its phones again', 'About: V160’s line rolled off at V163');
    t.includes(read('business.js'), "// ============== PATGo PWA — V160 — Join rechecks the business's phones ===", 'business.js header names V160');
  });
};
