/* Standing test — V149: every job knows its business (Stage 16, Teams v1)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   Peter, 2 and 5 Nov — 0A (the move is V150) 1A 3A 4A; Claude's calls named
   in the handoff. What these groups pin:
     88a  business.js on its own: the stored list (garbage → empty), the names
          an unnamed business is shown by (3A), the key two jobs compare by (the
          default and "none" are one business), "For:" only for 2+, starting on
          the last used, and when a sync run re-reads the list.
     88b  New job: no "For:" for someone in one business (and their job is
          exactly as before — no businessId); for two, the choice is drawn, kept
          through a repaint (a change event through #app, as the browser sends
          it), recorded on the job and remembered; a stale value falls back.
     88c  Sync, against a pretend Supabase: the job row carries the business on
          upload — only when the job names a well-formed one; never a record or
          photo row; a reading run reads my_businesses, at most every 6 hours,
          and a failed read never fails the run.
     88d  1A: split and duplicate keep the business; Move to another job lists
          only the same business's jobs, says why when none, and re-checks at
          the moment of moving.
     88e  3A: the Business page — signed out, the cards, roles, the default
          line, Rename only for the Owner, the name sheet pre-filled from
          Company & Branding, the save through set_business_name; the Settings
          row; reset and takeover; the app without business.js. (V150: its
          release checks moved to 89e.)
     88f  the SQL's text: the stamp keeps only a member's business, photos
          follow their job, the Owner-only name, the grants; schema.sql carries
          every V149 line (last); isolation 20a–20h; the test aid and its undo.

   ⚠ WHAT THIS FILE CANNOT PROVE: that the database keeps a member's business
   and refuses a stranger's. That is supabase/v149-business-per-job.sql's own
   checks (B1–B5) and isolation-test.sql 20a–20h — both run at V149 against a
   local Postgres 16 stand-in (an upgraded project and a new one), with six
   broken copies each caught. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { freshApp, withSession, withItem, tick } = require('../fixture');

const LIB  = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;
const UID = '11111111-1111-1111-1111-111111111111';
const AUTH = 'patgo:cloudAuth:test';
const OWN  = 'aaaaaaaa-0000-4000-8000-000000000001';
const TEAM = 'aaaaaaaa-0000-4000-8000-000000000002';
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const HOUR = 3600000;

const TWO = [
  { id: OWN, name: '', role: 'owner', def: true, n: 1 },
  { id: TEAM, name: 'Acme Testing Ltd', role: 'engineer', def: false, n: 3 },
];
const stored = (list, u = UID, at = Date.now()) => JSON.stringify({ u, at, list });

function storedSession() {
  const life = 3600;
  return JSON.stringify({
    access_token: 'ZZACCESS149', token_type: 'bearer', expires_in: life,
    expires_at: Math.floor(Date.now() / 1000) + life, refresh_token: 'ZZREFRESH',
    user: { id: UID, email: 'peter@example.com', aud: 'authenticated', role: 'authenticated' },
  });
}

// A pretend Supabase: my_businesses answers srv.rows; set_business_name keeps
// the name; every write is recorded.
function fakeServer() {
  const calls = [];
  const srv = { calls, rows: [
    { id: OWN, name: '', role: 'owner', is_default: true, members: 1 },
    { id: TEAM, name: 'Acme Testing Ltd', role: 'engineer', is_default: false, members: 3 },
  ], failBiz: false };
  srv.fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    let body = null;
    if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    calls.push({ url: u, method, body });
    if (u.endsWith('/rest/v1/rpc/my_businesses')) return srv.failBiz ? json({ message: 'nope' }, 500) : json(srv.rows);
    if (u.endsWith('/rest/v1/rpc/set_business_name')) {
      const r = srv.rows.find(x => x.id === body.o);
      if (r) r.name = String(body.n).trim();
      return json(String(body.n).trim());
    }
    if (u.endsWith('/rest/v1/rpc/my_billing')) return json({ plan: 'comped', role: 'owner', can_manage: true });
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
  closeSheets(app);
  return app;
}
function closeSheets(app) {
  app.doc.body.children.slice().forEach(c => { if (c && /bulk-sheet|modal-backdrop/.test(c.className || '')) c.remove(); });
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
// A select changed, exactly as the browser delivers it.
function choose(app, action, value) {
  const el = app.doc.createElement('select');
  el.dataset.changeAction = action;
  el.value = value;
  app.doc.getElementById('app').dispatchEvent({ type: 'change', target: el, preventDefault() {}, stopPropagation() {} });
}
// The action on the rendered element with this id — read off the screen.
function actionOf(h, id) {
  const m = h.match(new RegExp(`id="${id}"[^>]*data-action="([^"]+)"`));
  return m ? m[1] : null;
}
function argOf(h, id) {
  const m = h.match(new RegExp(`id="${id}"[^>]*data-arg="([^"]+)"`));
  return m ? m[1] : null;
}
// New job, filled in and started through its own button.
function newJob(app, o = {}) {
  app.fn('setView')('sessions');   // the form lives on the Jobs list
  tap(app, 'new-session');
  const d = app.doc;
  const set = (id, v) => { const el = d.getElementById(id); if (el) el.value = v; };
  set('nf-client', o.client || 'Client Ltd'); set('nf-site', o.site || 'Unit 1');
  set('nf-engineer', 'Pat'); set('nf-name', ''); set('nf-prefix', ''); set('nf-start', '1');
  if (o.business !== undefined) set('nf-business', o.business);
  tap(app, 'nf-submit');
  return app.fn('activeSession')();
}

module.exports = async function () {
  /* ------------------------------------------------------------------ 88a */
  await t.group('88a — business.js: the stored list, names, the compare key, For:, when to read', () => {
    const app = freshApp();
    const ls = app.storage;
    const load = () => JSON.parse(app.run('JSON.stringify(businessLoad())'));
    ls.setItem('pat:businesses', '{bad');
    t.deepEq(load().list, [], 'garbage → an empty list');
    ls.setItem('pat:businesses', '[1,2]');
    t.deepEq(load().list, [], 'an array → an empty list');
    ls.setItem('pat:businesses', JSON.stringify({ u: UID, at: 5, list: [
      { id: 'not-an-id', name: 'x', role: 'owner', def: true },
      { id: OWN, name: 'A'.repeat(90), role: 'wizard', def: 'yes', n: -2 },
      { id: OWN, name: 'dup', role: 'owner', def: true },
    ] }));
    const l = load().list;
    t.eq(l.length, 1, 'a bad id and a repeat are dropped');
    t.eq(l[0].name.length, 80, 'a name is kept to 80 characters');
    t.eq(l[0].role, 'engineer', 'an unknown role reads as the least: Engineer');
    t.eq(l[0].def, false, 'only true is the default');
    t.eq(l[0].n, 1, 'people: at least 1');

    ls.setItem('pat:businesses', stored(TWO));
    const label = (b) => app.run(`businessLabel(${JSON.stringify(b)})`);
    t.eq(label(TWO[0]), 'Your business', '3A: an unnamed business you own is "Your business"');
    t.eq(label({ id: TEAM, name: '', role: 'engineer' }), 'Unnamed business', '…anyone else’s unnamed one is "Unnamed business"');
    t.eq(label(TWO[1]), 'Acme Testing Ltd', '…a named one, its name');

    const key = (s) => app.run(`jobBusinessKey(${JSON.stringify(s)})`);
    t.eq(key({}), '', 'a job naming none = the default');
    t.eq(key({ businessId: OWN }), '', 'a job naming the default = the same key');
    t.eq(key({ businessId: TEAM }), TEAM, 'a job for the team = the team');
    t.eq(key({ businessId: 'junk' }), '', 'a malformed id = the default');

    t.eq(app.run('businessChoices().length'), 2, 'For: offered for two businesses');
    t.eq(app.run('businessForInitial()'), OWN, '…starting on the default when nothing was used');
    ls.setItem('pat:lastBusiness', TEAM);
    t.eq(app.run('businessForInitial()'), TEAM, '…on the last used');
    ls.setItem('pat:lastBusiness', 'aaaaaaaa-0000-4000-8000-000000000009');
    t.eq(app.run('businessForInitial()'), OWN, '…unless it is no longer one of yours');
    ls.setItem('pat:businesses', stored([TWO[0]]));
    t.eq(app.run('businessChoices().length'), 0, 'one business: no choice at all');

    const due = (rec, now) => app.run(`businessReadDue(${JSON.stringify(rec)}, ${JSON.stringify(UID)}, ${now})`);
    const now = Date.now();
    t.ok(due({ u: 'someone-else', at: now, list: [] }, now), 'read: another account’s list');
    t.notOk(due({ u: UID, at: now - HOUR, list: [] }, now), 'not read: an hour old');
    t.ok(due({ u: UID, at: now - 7 * HOUR, list: [] }, now), 'read: older than 6 hours');
    t.ok(due({ u: UID, at: now + HOUR, list: [] }, now), 'read: dated in the future (a clock wound back)');
    t.ok(due({ u: UID, at: 0, list: [] }, now), 'read: never read');
  });

  /* ------------------------------------------------------------------ 88b */
  await t.group('88b — New job: For: only for two or more; recorded, remembered, kept (1A)', () => {
    // One business: nothing drawn, and the job is exactly as before.
    const one = freshApp({ localStorage: { 'pat:businesses': stored([TWO[0]]) } });
    one.state().welcomeSeen = true;
    tap(one, 'new-session');
    t.excludes(html(one), 'id="nf-business"', 'one business: no For:');
    const j1 = newJob(one);
    t.ok(j1 && !('businessId' in j1), 'one business: the job names none (the default, as before)');
    t.eq(one.storage.getItem('pat:lastBusiness'), null, '…and nothing is remembered');

    // Two: the choice, starting on the default.
    const app = freshApp({ localStorage: { 'pat:businesses': stored(TWO) } });
    app.state().welcomeSeen = true;
    tap(app, 'new-session');
    const h = html(app);
    t.includes(h, '<label class="label" for="nf-business">For</label>', 'two businesses: For: is drawn');
    t.includes(h, 'data-change-action="nf-business"', '…wired as a change, no repaint');
    t.includes(h, `<option value="${OWN}" selected>Your business</option>`, '…starting on your own (unnamed, yours: "Your business")');
    t.includes(h, `<option value="${TEAM}">Acme Testing Ltd (Engineer)</option>`, '…the team with your role in it');
    t.ok(h.indexOf('id="nf-business"') < h.indexOf('id="nf-client"'), '…above Client');

    // A change, as the browser sends it, survives a repaint.
    choose(app, 'nf-business', TEAM);
    app.fn('render')();
    t.includes(html(app), `<option value="${TEAM}" selected>`, 'the choice survives a repaint');
    const j2 = newJob(app, { business: TEAM });
    t.eq(j2.businessId, TEAM, 'Start records the business on the job');
    t.eq(app.storage.getItem('pat:lastBusiness'), TEAM, '…and remembers it as the last used');
    t.ok(JSON.stringify(JSON.parse(app.storage.getItem('pat:sessions') || '[]')).includes(TEAM) ||
         String(app.storage.getItem('pat:sessions') || '').includes(TEAM), 'the business is saved with the job');

    // Next New job starts on the last used.
    app.fn('setView')('sessions');
    tap(app, 'new-session');
    t.includes(html(app), `<option value="${TEAM}" selected>`, 'the next New job starts on the last used');
    tap(app, 'nf-cancel');

    // A value that isn't one of yours (a stale form) → the starting choice.
    const j3 = newJob(app, { business: 'aaaaaaaa-0000-4000-8000-00000000dead' });
    t.eq(j3.businessId, TEAM, 'a business that isn’t yours is never recorded — the starting choice is');
    const j4 = newJob(app, { business: OWN });
    t.eq(j4.businessId, OWN, 'choosing your own records it explicitly');
  });

  /* ------------------------------------------------------------------ 88c */
  await t.group('88c — sync: the job row names its business; never records or photos; the list is read', async () => {
    const app = await signedIn({ localStorage: { 'pat:businesses': stored(TWO) } });
    t.eq(app.run("(state.cloud && state.cloud.status) || ''"), 'signed-in', 'signed in against the pretend server');
    const team = newJob(app, { business: TEAM, client: 'Team Client' });
    const own = newJob(app, { business: OWN, client: 'Own Client' });
    const plain = newJob(app, { client: 'Plain Client' });
    delete plain.businessId;
    const bad = newJob(app, { client: 'Bad Client' });
    bad.businessId = 'not-a-business';
    app.fn('save')();
    // Make the list due so the run reads it.
    app.storage.setItem('pat:businesses', stored(TWO, UID, Date.now() - 7 * HOUR));
    const before = app.srv.rpcs('my_businesses').length;
    await app.run('syncPull()');
    await until(() => app.srv.posts('sessions').length > 0);
    const rows = [].concat(...app.srv.posts('sessions').map(c => Array.isArray(c.body) ? c.body : [c.body]));
    const row = (id) => rows.find(r => r && r.id === String(id));
    t.ok(rows.length >= 4, `the jobs went up (${rows.length} rows)`);
    t.eq(row(team.id) && row(team.id).org_id, TEAM, 'a team job’s row names the team');
    t.eq(row(own.id) && row(own.id).org_id, OWN, 'a job for your own names it');
    t.ok(row(plain.id) && !('org_id' in row(plain.id)), 'a job naming none sends none (the default, as before)');
    t.ok(row(bad.id) && !('org_id' in row(bad.id)), 'a malformed business is never sent (it would fail the batch)');
    const otherRows = [].concat(...app.srv.calls.filter(c => c.method === 'POST' && /\/rest\/v1\/(records|photos)\?/.test(c.url))
      .map(c => Array.isArray(c.body) ? c.body : [c.body]));
    t.ok(otherRows.every(r => !r || !('org_id' in r)), `no record or photo row names a business (${otherRows.length} checked)`);
    t.eq(app.srv.rpcs('my_businesses').length, before + 1, 'a reading run reads the list when it is due');
    const rec = JSON.parse(app.storage.getItem('pat:businesses'));
    t.ok(rec.u === UID && Date.now() - rec.at < 60000, '…and stores it, stamped now, for this account');
    t.eq(rec.list.length, 2, '…both businesses');

    // Not due → not read again.
    await app.run('syncPull()');
    t.eq(app.srv.rpcs('my_businesses').length, before + 1, 'read at most every 6 hours');

    // A failed read never fails the run.
    app.srv.failBiz = true;
    app.storage.setItem('pat:businesses', stored(TWO, UID, Date.now() - 7 * HOUR));
    const ok = await app.run('syncPull()');
    t.ok(ok !== false, 'a failed list read: the run still succeeds');
    t.eq(JSON.parse(app.storage.getItem('pat:businesses')).list.length, 2, '…and the list on the phone is kept');
  });

  /* ------------------------------------------------------------------ 88d */
  await t.group('88d — split, duplicate and Move to another job stay in one business (1A)', async () => {
    const app = freshApp({ localStorage: { 'pat:businesses': stored(TWO) } });
    app.state().welcomeSeen = true;
    const mine = newJob(app, { business: OWN, client: 'Mine' });
    withItem(app, { assetNo: 'M1' });
    const plain = newJob(app, { client: 'Plain' });
    delete plain.businessId;
    const team = newJob(app, { business: TEAM, client: 'Team' });
    withItem(app, { assetNo: 'T1' }); withItem(app, { assetNo: 'T2' });
    const team2 = newJob(app, { business: TEAM, client: 'Team two' });

    const targets = (s) => JSON.parse(app.run(`JSON.stringify(moveToTargets(state.sessions.find(x => x.id === ${JSON.stringify(s.id)})).map(x => x.id))`));
    t.deepEq(targets(team).sort(), [team2.id], 'a team job: only the team’s other jobs');
    t.deepEq(targets(mine).sort(), [plain.id], 'your own: your other jobs, named or not (the same business)');

    // Nothing else for that business → it says why.
    const solo = newJob(app, { business: TEAM, client: 'Solo' });
    app.state().sessions = app.state().sessions.filter(s => s.id !== team.id && s.id !== team2.id);
    t.eq(app.run(`moveToBlockReason(state.sessions.find(x => x.id === ${JSON.stringify(solo.id)}), ['x'])`),
      'There are no other jobs for this business on this phone. Use “Move to a new job” instead.', 'none for this business: says so');
    app.state().sessions.push(team, team2);

    // Re-checked at the moment of moving: a target that became another business's.
    app.state().activeId = team.id;
    const ids = team.items.map(i => i.id);
    app.state().moveTo = { step: 'confirm', from: team.id, to: team2.id, ids: [ids[0]], clashes: [], choices: {} };
    team2.businessId = OWN;
    app.fn('moveItemsToExistingJob')();
    t.eq(app.state().moveTo && app.state().moveTo.step, 'blocked', 'a target that changed business: stopped at the moment of moving');
    t.includes(app.state().moveTo.why, 'is for a different business', '…saying why');
    t.eq(team.items.length, 2, '…and nothing moved');
    team2.businessId = TEAM;

    // Split: the new job is the team's.
    app.state().activeId = team.id;
    app.state().moveJob = { step: 'confirm', ids: [ids[1]], from: team.id, client: 'Team', site: 'B', date: team.date, engineer: 'Pat', name: '', prefix: '', instrumentId: '' };
    app.fn('moveItemsToNewJob')();
    const made = app.state().sessions.find(s => s.items && s.items.some(i => i.id === ids[1]) && s.id !== team.id);
    t.ok(made, 'split: a new job was made');
    t.eq(made && made.businessId, TEAM, 'split: the new job is the team’s');

    // Duplicate: the copy is the team's.
    const src = read('session.js');
    const dup = src.slice(src.indexOf('function _dupJobBuild('), src.indexOf('normaliseSessionRetest(job);', src.indexOf('function _dupJobBuild(')));
    t.includes(dup, 'if (src.businessId) job.businessId = src.businessId;', 'duplicate: the copy keeps the business');
    const copy = app.fn('_dupJobBuild')({ client: 'Team', client0: 'Team', site: '', site0: '', date: team.date, engineer: 'Pat', name: '', prefix: '', instrumentId: '' },
      JSON.parse(JSON.stringify(team)), 'dup-1', []);
    t.eq(copy.businessId, TEAM, 'duplicate: built for the same business');
    const plainCopy = app.fn('_dupJobBuild')({ client: 'Plain', client0: 'Plain', site: '', site0: '', date: plain.date, engineer: 'Pat', name: '', prefix: '', instrumentId: '' },
      JSON.parse(JSON.stringify(plain)), 'dup-2', []);
    t.ok(!('businessId' in plainCopy), 'a job naming none → a copy naming none');
  });

  /* ------------------------------------------------------------------ 88e */
  await t.group('88e — the Business page, the row, reset and takeover; without business.js; wiring', async () => {
    const app = await signedIn({ localStorage: { 'pat:businesses': stored(TWO) } });
    app.state().reportSettings.companyName = 'Birchley PAT Services';
    // V150: a reading run at start reads the list too (owed) — let any settle and
    // clear the debt, so the read counted below is the page's own (M1686).
    await tick(50);
    app.run('if (typeof _bizReadOwed !== "undefined") _bizReadOwed = false');
    const nOpen = app.srv.rpcs('my_businesses').length;
    tap(app, 'settings-page', 'cloudBusiness');
    t.eq(app.state().view, 'cloudBusiness', 'the page opens from its row');
    await until(() => app.srv.rpcs('my_businesses').length > nOpen);
    await until(() => !app.run('state.business && state.business.reading'));
    t.ok(app.srv.rpcs('my_businesses').length > nOpen, 'opening reads the list (every open)');
    let h = html(app);
    t.includes(h, '<h3 id="biz-name-0">Your business</h3>', 'card 1: your own, unnamed');
    t.includes(h, 'id="biz-role-0">You: Owner · Just you</p>', '…Owner, just you');
    t.includes(h, 'id="biz-default-0">Your main business', '…the default line');
    t.includes(h, '<h3 id="biz-name-1">Acme Testing Ltd</h3>', 'card 2: the team');
    t.includes(h, 'id="biz-role-1">You: Engineer · 3 people</p>', '…Engineer, 3 people');
    t.excludes(h, 'id="biz-default-1"', '…not the default');
    t.eq(actionOf(h, 'biz-rename-0'), 'biz-rename', 'the Owner can name it');
    t.excludes(h, 'id="biz-rename-1"', 'an Engineer cannot');
    t.eq(actionOf(h, 'biz-refresh'), 'biz-refresh', 'Check again is wired');
    t.includes(h, 'Name your business</button>', 'unnamed: "Name your business"');

    // Rename: the sheet, pre-filled from Company & Branding; saved through the server.
    tap(app, 'biz-rename', argOf(h, 'biz-rename-0'));
    const inp = app.doc.getElementById('name-sheet-input');
    t.ok(inp, 'the name sheet opens');
    const sheetHtml = app.doc.body.children.filter(c => /bulk-sheet/.test(c.className || '')).map(c => c.innerHTML).join('');
    t.includes(sheetHtml, 'value="Birchley PAT Services"', '…pre-filled from Company & Branding (3A)');
    t.includes(sheetHtml, 'maxlength="80"', '…80 characters at most');
    inp.value = '  Birchley PAT  ';
    app.doc.getElementById('name-sheet-save').click();
    await until(() => app.srv.rpcs('set_business_name').length > 0);
    const call = app.srv.rpcs('set_business_name')[0];
    t.deepEq(call && call.body, { o: OWN, n: 'Birchley PAT' }, 'saved through set_business_name, trimmed');
    await until(() => JSON.parse(app.storage.getItem('pat:businesses')).list[0].name === 'Birchley PAT');
    t.eq(JSON.parse(app.storage.getItem('pat:businesses')).list[0].name, 'Birchley PAT', 'the phone keeps the new name');
    t.ok(app.toasts.includes('Business name saved'), 'says so');
    app.fn('render')();
    t.includes(html(app), '<h3 id="biz-name-0">Birchley PAT</h3>', 'the card shows it');
    t.includes(html(app), 'id="biz-rename-0" data-action="biz-rename"', 'the button…');
    t.includes(html(app), '>Rename</button>', '…now says Rename');
    // The save trims on its own too — not only because the sheet hands it trimmed.
    await app.run(`businessSaveName(${JSON.stringify(OWN)}, '   Birchley PAT  ')`);
    const last = app.srv.rpcs('set_business_name').slice(-1)[0];
    t.deepEq(last && last.body, { o: OWN, n: 'Birchley PAT' }, 'businessSaveName trims what it sends, whoever calls it');
    // Renaming someone else's business is refused on the phone too.
    t.eq(app.run(`businessRename(${JSON.stringify(TEAM)})`), false, 'an Engineer’s business: no name sheet');

    // The Settings row.
    app.state().view = 'settingsCategory'; app.state().settingsCategory = 'catCloud';
    const cat = JSON.parse(app.run("JSON.stringify(settingsCategoryPages(SETTINGS_CATEGORIES.find(c => c.id === 'catCloud')))"));
    t.deepEq(cat, ['cloudAccount', 'cloudBusiness', 'cloudSync', 'cloudSubscription'], 'Account & Sync: Account, Business, Sync, Subscription');
    t.eq(app.run("settingsPageSubtitle('cloudBusiness')"), 'Birchley PAT + 1 more', 'the row says which');

    // Signed out: no list, a way to the Account page.
    app.state().cloud.status = 'signed-out';
    app.state().view = 'cloudBusiness';
    app.fn('render')();
    h = html(app);
    t.includes(h, 'Sign in to see your business.', 'signed out: says so');
    t.eq(actionOf(h, 'biz-account'), 'settings-page', '…with the Account page one tap away');
    t.eq(app.run("settingsPageSubtitle('cloudBusiness')"), 'Sign in first', 'the row: Sign in first');

    // Reset and takeover.
    const plan = app.run("JSON.stringify(RESET_KEY_PLAN.filter(r => r[0] === 'BUSINESSES_KEY' || r[0] === 'LAST_BUSINESS_KEY'))");
    t.eq(plan, JSON.stringify([['BUSINESSES_KEY', 'pat:businesses', 'account'], ['LAST_BUSINESS_KEY', 'pat:lastBusiness', 'account']]), 'both keys: Everything, as new');
    t.ok(app.run("RESET_HANDOVER_KEEP.indexOf('BUSINESSES_KEY') === -1 && RESET_HANDOVER_KEEP.indexOf('LAST_BUSINESS_KEY') === -1"), '…and a takeover clears both (they are the account’s)');
    t.excludes(read('backup.js'), 'BUSINESSES_KEY', 'never in a backup');

    // Without business.js the app runs: New job has no For:, the job names none.
    const bare = freshApp({ skip: ['business.js'], tolerateLoadErrors: true, localStorage: { 'pat:businesses': stored(TWO) } });
    bare.state().welcomeSeen = true;
    let okBare = true; let jb = null;
    try { jb = newJob(bare); } catch (e) { okBare = false; }
    t.ok(okBare && jb && !('businessId' in jb), 'no business.js: New job works, the job names none');
    t.excludes(html(bare), 'id="nf-business"', '…and no For:');
    t.notOk(bare.run("settingsPageVisible('cloudBusiness')"), '…and no Business row');

    // ---- wiring (V150: the release checks moved to 89e).
    t.includes(read('sw.js'), "  './business.js',       // V149\n", 'business.js is precached');
    t.includes(read('index.html'), '<script src="business.js"></script>', '…and loaded');
  });

  /* ------------------------------------------------------------------ 88f */
  // The SQL's TEXT (whether it works: B1–B5 and isolation 20a–20h, in Postgres).
  await t.group('88f — the SQL: the stamp, the two functions, schema.sql in step, the isolation checks, the test aid', () => {
    const mig = read('supabase/v149-business-per-job.sql');
    const body = mig.slice(mig.indexOf('-- ------------------------------------------------- the stamp (new jobs)'),
                           mig.indexOf('-- ------------------------------------------------------------ self-check'));
    t.ok(body.length > 1500, `the migration's statements are read (${body.length} chars)`);
    t.includes(body, "    if new.org_id is not null and not exists (\n      select 1 from public.memberships m where m.org_id = new.org_id and m.user_id = new.user_id\n    ) then\n      new.org_id := null;",
      'a named business is kept only if the writer belongs to it');
    t.includes(body, "    if new.org_id is null and tg_table_name = 'photos' then\n      select s.org_id into new.org_id from public.sessions s\n      where s.user_id = new.user_id and s.id = new.session_id;",
      'a photo takes its job’s business');
    t.includes(body, "      new.org_id := public.default_org(new.user_id);", '…anything left: the default');
    t.includes(body, "  elsif old.org_id is not null then\n    new.org_id := old.org_id;\n", 'an update never moves the stamp (the move is V150)');
    t.includes(body, "  where m.user_id = auth.uid()\n", 'my_businesses: only your own memberships');
    t.includes(body, "  if public.my_role(o) is distinct from 'owner' then", 'set_business_name: the Owner only');
    t.includes(body, "  if length(v) < 1 or length(v) > 80 then", '…1 to 80 characters');
    t.includes(body, "revoke all on function public.my_businesses() from public, anon;", 'my_businesses closed to the signed-out');
    t.includes(body, "revoke all on function public.set_business_name(uuid, text) from public, anon;", 'set_business_name closed to the signed-out');
    for (const c of ['B1', 'B2', 'B3', 'B4', 'B5']) t.includes(mig, `array['${c}|`, `self-check ${c}`);
    t.includes(mig, "      raise exception 'v149-undo';", 'the self-check undoes what it tries');

    // schema.sql carries every V149 statement line, AFTER V113's stamp.
    const schema = read('supabase/schema.sql');
    const want = body.split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.trim() && !/^\s*--/.test(l));
    const missing = want.filter(l => !schema.includes(l));
    t.eq(missing.length, 0, 'every V149 line is in schema.sql' + (missing.length ? ' — first missing: ' + missing[0].trim() : ''));
    t.ok(schema.indexOf('================ V149') > schema.lastIndexOf('================ V143'), '…in its own section, last');
    t.ok(schema.lastIndexOf('create or replace function public.org_stamp()') > schema.indexOf('================ V149'),
      '…so V149’s stamp is the one a new project ends with');

    const iso = read('supabase/isolation-test.sql');
    for (const c of ['20a', '20b', '20c', '20d', '20e', '20f', '20g', '20h']) t.includes(iso, `array['${c}|`, `isolation ${c}`);
    t.includes(iso, "PASS|filed under B''s own (V149)", '9b: landing in B’s own business is a PASS');
    t.includes(iso, "    update public.organisations set name = coalesce(msg, '') where id = org_b;", '20h: B’s business name put back');
    // Check 5 fixed (Peter, 6 Nov: B comped by hand → FAIL though B was refused).
    t.includes(iso, "  plan_try := case when plan_before = 'comped' then 'active' else 'comped' end;",
      '5: B tries a plan DIFFERENT from its own');
    t.includes(iso, "                || case when ok and plan_before is not null and plan_after is not distinct from plan_before\n",
      '5: PASS = refused AND the plan unchanged from before (not “not comped”)');

    const aid = read('supabase/v149-test-second-business.sql');
    t.includes(aid, "insert into public.organisations (name, plan) values ('PATGo Test Team', 'comped')", 'the test aid: a comped test business');
    t.includes(aid, "values (o, u_main, 'engineer', false)", '…your main account an Engineer, NOT its default');
    const undo = read('supabase/v149-test-second-business-undo.sql');
    t.ok(undo.indexOf('begin;') < undo.indexOf('disable trigger org_stamp') && undo.indexOf('enable trigger org_stamp') < undo.indexOf('commit;'),
      'the undo switches the stamp off and back on inside one transaction');
    t.includes(undo, 'update public.sessions x set org_id = public.default_org(x.user_id)', '…moving jobs home, never deleting them');
  });
};
