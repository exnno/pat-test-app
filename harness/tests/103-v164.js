/* Standing test — V164: the one Cloud tab and the business view (Teams v1; round 1A 2A 3A 4A 5A)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

     103a  WHO GETS THE PICKER (1A). "Showing ▾" offers a business only to its
           Owner, Team leader or Office, and only when it has two or more people.
           Solo, or an Engineer: no picker — the tab is exactly Your jobs. A
           business that stops being one you may read falls back to Your jobs at
           once. The practice (tutorial) phone never shows the real businesses.
     103b  YOUR JOBS (2A 3A). Every job in the cloud is listed — one also on this
           phone too, marked On this phone; one row layout (site, date; client,
           counts; tags). Select is offered only when something is cloud-only, and
           a job on this phone can't be ticked for a cloud delete.
     103c  THE BUSINESS READ (rule 45's one exception). Olive (Owner of Big Co)
           picks Big Co: one rpc for the names, the jobs read BY BUSINESS and paged
           by (person, id) across a page edge — none skipped, none twice — photo
           counts per person (a teammate's job with Olive's own id keeps its own
           count), a leaver's job named as logged and marked left, a teammate's
           job in his OWN business never shown. And it is a LOOK: the phone's
           jobs, sync state and storage are byte-for-byte unchanged; nothing is
           sent. A page edge PATGo could never have made is never put in a filter.
     103d  THE LOOK-ONLY JOB (2A). A teammate's job opens in the sheet: its items,
           readings and notes — as text, never markup; no Bring button, and the
           bring path refuses it even when Olive has a job with the same id. Your
           own job has Bring onto this phone (or Open on this phone). Moved to
           another business, gone, or no signal — each said plainly.
     103e  CHIPS AND FILTERS (1A 3A), through the surfaces the browser uses: the
           picker's change event reaches the dispatcher; person chips; Fails only;
           search by the person's name.
     103f  release: V164; cache pat-v164; What's new rolled (one line); About V164 /
           V163 / V162 (V161 rolled off).

   ⚠ WHAT THIS FILE CANNOT PROVE: the database's rules. The stand-in here applies
   V113 / V163's read rule (your own rows in a business you hold, or the whole of a
   business you may read — can_read_org) and PostgREST's or / order / in grammar;
   the rule itself was proved in a real Postgres (PGlite + a Supabase stand-in,
   the whole schema.sql) for this release's exact reads. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { tick, freshApp, withSession, withItem } = require('../fixture');

const LIB  = fs.readFileSync(path.join(APP_DIR, 'supabase.umd.js'), 'utf8');
const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const AUTH = 'patgo:cloudAuth:test';
const O   = { id: '0c0c0c0c-0000-4000-8000-00000000000a', email: 'olive@example.com' };   // Owner of Big Co
const ED  = 'ed0ed0ed-0000-4000-8000-00000000000e';   // Engineer
const TOM = '70707070-0000-4000-8000-000000000007';   // Team leader (no jobs)
const LEE = '1ee1ee1e-0000-4000-8000-00000000001e';   // left Big Co
const BIG = 'b1b1b1b1-0000-4000-8000-000000000001';
const TWO = 'b2b2b2b2-0000-4000-8000-000000000002';   // Olive is an Engineer there
const ONE = 'b3b3b3b3-0000-4000-8000-000000000003';   // a business of one (Olive's)
const EDOWN = 'b4b4b4b4-0000-4000-8000-000000000004'; // Eddie's own business
const J = JSON.stringify;

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const jwt = () => b64u({ alg: 'HS256', typ: 'JWT' }) + '.' +
  b64u({ sub: O.id, email: O.email, session_id: 'ses-o', exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated', role: 'authenticated' }) + '.ZZSIGN';
const login = () => JSON.stringify({ access_token: jwt(), token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'ZZREFRESH',
  user: { id: O.id, email: O.email, aud: 'authenticated', role: 'authenticated' } });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function until(fn, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await tick(5); }
  return fn();
}

// ---- PostgREST's grammar, as much as these reads use -----------------------------
function cmp(a, b) { a = String(a); b = String(b); return a < b ? -1 : a > b ? 1 : 0; }
function fieldOf(r, k) {
  const m = k.match(/^doc->>(\w+)$/);
  if (m) { const x = r.doc ? r.doc[m[1]] : undefined; return (x === undefined || x === null) ? null : String(x); }
  return r[k];
}
function test1(r, k, v) {
  if (v.startsWith('eq.')) return String(fieldOf(r, k)) === v.slice(3);
  if (v.startsWith('gt.')) return cmp(fieldOf(r, k), v.slice(3)) > 0;
  if (v.startsWith('gte.')) return cmp(fieldOf(r, k), v.slice(4)) >= 0;   // V165: a real sync run's page read
  if (v.startsWith('in.(')) return v.slice(4, -1).split(',').map(s => s.replace(/^"|"$/g, '')).includes(String(fieldOf(r, k)));
  throw new Error('stand-in: unknown filter ' + k + '=' + v);
}
// or=(user_id.gt.U,and(user_id.eq.U,col.gt.K)) — the keyset; anything else is refused
// (so a filter the app builds wrongly fails loudly rather than reading everything).
function orFilter(v) {
  const m = /^\(user_id\.gt\.([^,()]+),and\(user_id\.eq\.([^,()]+),(\w+)\.gt\.([^,()]+)\)\)$/.exec(v);
  if (!m) return null;
  return (r) => cmp(r.user_id, m[1]) > 0 || (String(r.user_id) === m[2] && cmp(r[m[3]], m[4]) > 0);
}
function query(rows, qs) {
  const q = new URLSearchParams(qs || '');
  let out = rows.slice();
  for (const [k, v] of q) {
    if (['select', 'order', 'limit', 'or'].includes(k)) continue;
    out = out.filter(r => test1(r, k, v));
  }
  if (q.get('or')) {
    const f = orFilter(q.get('or'));
    if (!f) return { bad: q.get('or') };
    out = out.filter(f);
  }
  if (q.get('order')) {
    const cols = q.get('order').split(',').map(c => c.split('.')[0]);
    out.sort((a, b) => { for (const c of cols) { const x = cmp(a[c], b[c]); if (x) return x; } return 0; });
  }
  if (q.get('limit')) out = out.slice(0, parseInt(q.get('limit'), 10));
  const sel = q.get('select');
  if (sel && sel !== '*') {
    const cols = sel.split(',');
    out = out.map((r) => {
      const o = {};
      const items = (r.doc && Array.isArray(r.doc.items)) ? r.doc.items : [];
      for (const c of cols) {
        const m = c.match(/^(\w+):doc->>(\w+)$/);
        if (m) { const x = r.doc ? r.doc[m[2]] : undefined; o[m[1]] = (x === undefined || x === null) ? null : String(x); }
        else if (c === 'n_items') o[c] = items.length;
        else if (c === 'n_fails') o[c] = items.filter(i => i && i.result === 'fail').length;
        else o[c] = r[c];
      }
      return o;
    });
  }
  return { rows: out };
}

// ---- the stand-in: Olive, Owner of Big Co ---------------------------------------
function cloud() {
  const srv = { calls: [], sessions: [], photos: [], people: [
    { business_id: BIG, user_id: O.id, name: 'Olive', role: 'owner', is_you: true, email: O.email },
    { business_id: BIG, user_id: ED, name: 'Eddie', role: 'engineer', is_you: false, email: 'ed@example.com' },
    { business_id: BIG, user_id: TOM, name: 'Tom', role: 'team_leader', is_you: false, email: 'tom@example.com' },
    { business_id: ONE, user_id: O.id, name: 'Olive', role: 'owner', is_you: true, email: O.email },
  ], bad: [] };
  // V113 / V163's read rule, for Olive: her own rows in a business she's in, or
  // every row of a business she may read whole (Owner / Team leader / Office).
  const mine = new Set([BIG, TWO, ONE]);
  const canRead = new Set([BIG, ONE]);
  srv.readable = (r) => (r.user_id === O.id && mine.has(r.org_id)) || canRead.has(r.org_id);
  srv.add = (user, org, id, doc, extra) => {
    const row = Object.assign({ user_id: user, org_id: org, id, deleted: false, updated_at: '2026-11-14T10:00:00.000Z',
      doc: Object.assign({ id, items: [] }, doc || {}) }, extra || {});
    srv.sessions.push(row);
    return row;
  };
  srv.fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const p = u.split('?')[0].replace(/^https:\/\/[^/]+/, '');
    const qs = u.split('?')[1] || '';
    const method = init.method || 'GET';
    let body = null;
    try { body = init.body ? JSON.parse(init.body) : null; } catch { body = init.body; }
    srv.calls.push({ path: p, qs: decodeURIComponent(qs), method, body });
    if (p === '/auth/v1/user') return json({ id: O.id, email: O.email });
    if (p === '/auth/v1/token') return json(JSON.parse(login()));
    if (p.startsWith('/rest/v1/profiles')) return json([{ plan: 'active', trial_ends_at: null, lapsed_at: null }]);
    if (p === '/rest/v1/rpc/my_businesses') {
      return json([{ id: BIG, name: 'Big Co', role: 'owner', is_default: true, members: 3 },
        { id: TWO, name: 'Other Co', role: 'engineer', is_default: false, members: 5 },
        { id: ONE, name: 'One Ltd', role: 'owner', is_default: false, members: 1 }]);
    }
    if (p === '/rest/v1/rpc/business_people') return json(srv.people);
    if (p === '/rest/v1/sessions' && method === 'GET') {
      const r = query(srv.sessions.filter(srv.readable), qs);
      if (r.bad) { srv.bad.push(r.bad); return json({ code: 'PGRST100', message: 'failed to parse logic tree', details: r.bad, hint: null }, 400); }
      return json(r.rows);
    }
    if (p === '/rest/v1/session_photo_counts') {
      const m = new Map();
      for (const ph of srv.photos) {
        const job = srv.sessions.find(s => s.user_id === ph.user_id && s.id === ph.session_id);
        if (!job || !srv.readable(job)) continue;   // the view reads with the reader's rights
        const k = ph.user_id + '|' + ph.session_id;
        const e = m.get(k) || { user_id: ph.user_id, session_id: ph.session_id, n: 0 };
        e.n++; m.set(k, e);
      }
      const r = query(Array.from(m.values()), qs);
      if (r.bad) { srv.bad.push(r.bad); return json({ code: 'PGRST100', message: 'failed to parse logic tree', details: r.bad, hint: null }, 400); }
      return json(r.rows);
    }
    if (p.startsWith('/rest/v1/rpc/')) return json([]);
    if (p.startsWith('/rest/v1/') || p.startsWith('/storage/v1/')) return method === 'GET' ? json([]) : new Response(null, { status: 201 });
    return json({ message: 'unexpected ' + u }, 404);
  };
  srv.writes = () => srv.calls.filter(c => c.method !== 'GET' && c.path.startsWith('/rest/v1/') && !c.path.startsWith('/rest/v1/rpc/'));
  srv.gets = (p) => srv.calls.filter(c => c.method === 'GET' && c.path === p);
  return srv;
}

// Olive's phone, signed in. `list` overrides her stored business list.
function phone(srv, list) {
  const ls = {
    [AUTH]: login(), 'pat:cloudUnlocked': '1',
    'pat:owner': JSON.stringify({ id: O.id, email: O.email, at: 1 }),
    'pat:businesses': JSON.stringify({ u: O.id, at: Date.now(), list: list || [
      { id: BIG, name: 'Big Co', role: 'owner', def: true, n: 3 },
      { id: TWO, name: 'Other Co', role: 'engineer', def: false, n: 5 },
      { id: ONE, name: 'One Ltd', role: 'owner', def: false, n: 1 }] }),
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
  app.toasts = [];
  sb.showToast = (m) => { app.toasts.push(String(m)); };
  return app;
}
// A job on Olive's phone with a chosen id.
function localJob(app, id, site) {
  withSession(app, { site });
  withItem(app, { assetNo: 'ZZ-' + id, result: 'pass' });
  app.stop();
  const s = app.fn('activeSession')();
  app.run(`(() => { const s = state.sessions.find(x => x.id === ${J(s.id)}); s.id = ${J(id)}; state.activeId = null; save(); })()`);
  app.stop();
  return id;
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
// The picker's change event, through the #app listener the browser uses
// (dispatch.js handleDelegatedChange).
function pick(app, value) {
  const el = app.doc.createElement('select');
  el.dataset.changeAction = 'cloud-scope';
  el.value = value;
  app.doc.getElementById('app').dispatchEvent({ type: 'change', target: el, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} });
}
async function openCloud(app) {
  app.run('state.view = "sessions"; render();');
  tap(app, 'jobs-tab', 'cloud');
  await until(() => !!(app.state().cloudJobs && (app.state().cloudJobs.ok || app.state().cloudJobs.error)));
}
async function openBig(app) {
  pick(app, BIG);
  await until(() => { const b = app.state().cloudJobs.biz; return !!(b && b.org === BIG && !b.loading && (b.ok || b.error)); });
}
const html = (app) => app.doc.getElementById('app').innerHTML;
const storageSnap = (app) => { const o = {}; for (let i = 0; i < app.storage.length; i++) { const k = app.storage.key(i); o[k] = app.storage.getItem(k); } return J(o); };

// The Big Co seed most groups use.
function seedBig(srv) {
  srv.add(O.id, BIG, 'ZZO1', { site: 'Acme Ltd — ZZ Olive Works', date: '2026-11-10', items: [{ id: 'a', result: 'pass' }] });
  srv.add(O.id, BIG, 'ZZSAME', { site: 'ZZ Olive Same', date: '2026-10-02', items: [{ id: 'a', result: 'pass' }] });
  srv.add(ED, BIG, 'ZZE1', { site: 'Hall Farm — ZZ Eddie Works', date: '2026-11-12', engineer: 'Ed W',
    items: [{ id: 'a', result: 'fail' }, { id: 'b', result: 'fail' }, { id: 'c', result: 'pass' }] });
  srv.add(ED, BIG, 'ZZSAME', { site: 'ZZ Eddie Same', date: '2026-09-01', items: [
    { id: 'x1', assetNo: 'E-77', itemType: 'Kettle', location: 'Kitchen', result: 'fail',
      notes: '<img src=x onerror="window.ZZPWN=1">Cracked plug', readings: { class: 'I', earth: '0.12', insulation: '>299' } },
    { id: 'x2', assetNo: 'E-78', itemType: 'Lamp', location: 'Office', result: 'pass' }] });
  srv.add(LEE, BIG, 'ZZL1', { site: 'ZZ Leaver Site', date: '2026-08-15', engineer: 'Lee Smith', items: [{ id: 'a', result: 'pass' }] });
  srv.add(ED, EDOWN, 'ZZEPRIVATE', { site: 'ZZ Eddie Private', date: '2026-11-13', items: [] });
  srv.add(O.id, ONE, 'ZZONE', { site: 'ZZ One Ltd job', date: '2026-07-07', items: [] });
  srv.photos.push({ user_id: ED, session_id: 'ZZSAME' }, { user_id: ED, session_id: 'ZZSAME' },
    { user_id: ED, session_id: 'ZZSAME' }, { user_id: ED, session_id: 'ZZSAME' }, { user_id: O.id, session_id: 'ZZSAME' });
}

module.exports = async function () {
  /* ------------------------------------------------------------------ 103a */
  await t.group('103a — who gets the picker: Owner / Team leader / Office of a business of two or more; solo and Engineers see Your jobs only (1A)', async () => {
    const srv = cloud(); seedBig(srv);
    const app = phone(srv);
    const ch = app.fn('cloudScopeChoices')();
    t.deepEq(ch.map(c => c.id), [BIG], 'Big Co only — not Other Co (Engineer there), not One Ltd (a business of one)');
    t.eq(ch[0].label, 'Big Co', '…by its name');
    await openCloud(app);
    t.includes(html(app), 'id="cloud-scope"', 'the picker is drawn');
    t.includes(html(app), '>Big Co · everyone</option>', '…offering Big Co, everyone');
    t.includes(html(app), '<option value="mine" selected>Your jobs</option>', '…starting on Your jobs');
    // A Team leader and Office may read the whole business too.
    for (const role of ['team_leader', 'office']) {
      const a = phone(cloud(), [{ id: BIG, name: 'Big Co', role, def: true, n: 3 }]);
      t.deepEq(a.fn('cloudScopeChoices')().map(c => c.id), [BIG], `${role}: Big Co is offered`);
    }
    // Solo, and an Engineer in a team: no picker at all.
    const solo = phone(cloud(), [{ id: ONE, name: 'One Ltd', role: 'owner', def: true, n: 1 }]);
    await openCloud(solo);
    t.ok(solo.state().cloudJobs.ok, 'solo: the tab reads Your jobs');
    t.excludes(html(solo), 'id="cloud-scope"', 'solo: no picker');
    const eng = phone(cloud(), [{ id: BIG, name: 'Big Co', role: 'engineer', def: true, n: 3 }]);
    await openCloud(eng);
    t.excludes(html(eng), 'id="cloud-scope"', 'an Engineer: no picker');
    // Picked, then the role changes to Engineer: back to Your jobs at once.
    await openBig(app);
    t.eq(app.fn('cloudScope')(), BIG, 'Big Co picked');
    app.run(`localStorage.setItem('pat:businesses', ${J(J({ u: O.id, at: Date.now(), list: [{ id: BIG, name: 'Big Co', role: 'engineer', def: true, n: 3 }] }))})`);
    t.eq(app.fn('cloudScope')(), 'mine', 'no longer one she may read: Your jobs');
    app.run('render()');
    t.excludes(html(app), 'ZZ Eddie Works', '…and Eddie’s jobs are gone from the screen');
    // The practice phone never shows the phone's real businesses.
    app.run(`localStorage.setItem('pat:businesses', ${J(J({ u: O.id, at: Date.now(), list: [{ id: BIG, name: 'Big Co', role: 'owner', def: true, n: 3 }] }))})`);
    t.eq(app.fn('cloudScopeChoices')().length, 1, 'set-up: Big Co offered again');
    app.run('_tut = { st: {} }');
    t.deepEq(app.fn('cloudScopeChoices')(), [], 'inside a tutorial: no business is offered');
    app.run('_tut = null');
  });

  /* ------------------------------------------------------------------ 103b */
  await t.group('103b — Your jobs: every cloud job listed, one on this phone marked and never ticked; one row layout (2A 3A)', async () => {
    const srv = cloud(); seedBig(srv);
    const app = phone(srv);
    localJob(app, 'ZZO1', 'Acme Ltd — ZZ Olive Works');
    await openCloud(app);
    const h = html(app);
    t.includes(h, '3 jobs in the cloud', 'her three: Big Co ×2 and One Ltd (Your jobs reads her own, every business)');
    t.excludes(h, 'ZZ Eddie Works', 'nobody else’s jobs in Your jobs');
    const at = h.indexOf('data-arg="ZZO1"');
    t.ok(at > -1, 'the job on this phone is listed (2A)');
    const card = h.slice(at, h.indexOf('session-card', at) > -1 ? h.indexOf('session-card', at) : h.length);
    t.includes(card, 'On this phone', '…marked On this phone');
    t.includes(card, '>ZZ Olive Works</span>', '…titled by its site');
    t.includes(card, 'Acme Ltd', '…the client on its own line');
    t.includes(card, '10/11/2026', '…and the date (UK)');
    t.includes(h, 'November 2026 <span class="cloud-month-n">· 1 job</span>', 'months say how many');
    t.includes(h, 'data-action="cloud-select-toggle"', 'Select: there are cloud-only jobs');
    tap(app, 'cloud-select-toggle');
    tap(app, 'cloud-tap', 'ZZO1');
    t.deepEq(Object.keys(app.state().cloudJobs.selected), [], 'a job on this phone can’t be ticked');
    t.ok(app.toasts.some(m => /on this phone/.test(m)), '…and says why');
    tap(app, 'cloud-tap', 'ZZSAME');
    t.deepEq(Object.keys(app.state().cloudJobs.selected), ['ZZSAME'], 'a cloud-only job ticks');
    t.excludes(html(app).slice(html(app).indexOf('data-arg="ZZO1"') - 400, html(app).indexOf('data-arg="ZZO1"')), 'jm-tick', 'no tick box on the job on this phone');
    tap(app, 'cloud-select-toggle');
    // Nothing cloud-only: no Select.
    const one = cloud();
    one.add(O.id, BIG, 'ZZONLY', { site: 'ZZ Here', date: '2026-11-01' });
    const a2 = phone(one);
    localJob(a2, 'ZZONLY', 'ZZ Here');
    await openCloud(a2);
    t.includes(html(a2), 'On this phone', 'set-up: the one job is on this phone');
    t.excludes(html(a2), 'data-action="cloud-select-toggle"', 'nothing cloud-only: no Select');
  });

  /* ------------------------------------------------------------------ 103c */
  await t.group('103c — the business read: by business, paged by person and id, names and photo counts per person, a leaver marked — and only a look (rule 45)', async () => {
    const srv = cloud(); seedBig(srv);
    // A page edge INSIDE a person's jobs: people sort Olive (0c…), Lee (1e…),
    // Eddie (ed…); page one is Olive's two, Lee's one, then Eddie's first 997 —
    // its edge is Eddie AND ZZP0995, and page two must carry on inside Eddie.
    for (let i = 0; i < 1050; i++) srv.add(ED, BIG, 'ZZP' + String(i).padStart(4, '0'), { site: 'ZZ Page ' + i, date: '2025-01-01' });
    const app = phone(srv);
    localJob(app, 'ZZO1', 'Acme Ltd — ZZ Olive Works');
    await openCloud(app);
    const before = { sessions: J(app.state().sessions), storage: storageSnap(app) };
    const w0 = srv.writes().length;
    await openBig(app);
    const b = app.state().cloudJobs.biz;
    t.ok(b && b.ok, 'Big Co read');
    t.deepEq(srv.bad, [], 'every filter the phone built was one PostgREST reads');
    const jobsGets = srv.gets('/rest/v1/sessions').filter(c => /org_id=eq\./.test(c.qs));
    t.eq(jobsGets.length, 2, 'two pages (1,055 jobs, 1,000 a page)');
    t.ok(jobsGets.every(c => c.qs.includes('org_id=eq.' + BIG) && c.qs.includes('order=user_id.asc,id.asc')), '…read by business, ordered by person then id');
    t.includes(jobsGets[1].qs, 'or=(user_id.gt.' + ED + ',and(user_id.eq.' + ED + ',id.gt.ZZP0995))', '…the second page starts after the first page’s last person AND id');
    const keys = b.jobs.map(j => j.user + '|' + j.id);
    t.eq(keys.length, 1055, 'every Big Co job: 1,050 + Eddie’s two + Olive’s two + Lee’s one — none skipped');
    t.eq(new Set(keys).size, keys.length, '…none twice');
    t.notOk(b.jobs.some(j => j.id === 'ZZEPRIVATE'), 'Eddie’s job in his OWN business is never shown');
    t.notOk(b.jobs.some(j => j.id === 'ZZONE'), 'Olive’s One Ltd job isn’t Big Co’s');
    t.ok(srv.calls.some(c => c.path === '/rest/v1/rpc/business_people'), 'the names come from business_people');
    t.deepEq(b.people.map(p => p.name), ['Olive', 'Eddie', 'Tom'], '…Big Co’s people only');
    const same = b.jobs.filter(j => j.id === 'ZZSAME');
    t.eq(same.length, 2, 'Olive’s and Eddie’s jobs with the same id are both there');
    t.eq(same.find(j => j.user === ED).photos, 4, 'Eddie’s keeps its own photo count (4)');
    t.eq(same.find(j => j.user === O.id).photos, 1, '…and Olive’s its own (1)');
    const pc = srv.gets('/rest/v1/session_photo_counts').filter(c => c.qs.includes('user_id=in.('));
    t.ok(pc.length >= 1 && pc[0].qs.includes(ED) && pc[0].qs.includes(LEE), 'photo counts asked for the people on the list');
    const m = app.fn('cloudJobsModel')();
    const lee = m.people.find(p => p.user === LEE);
    t.ok(lee && lee.left && lee.name === 'Lee Smith', 'a leaver is named as the job was logged, and marked left');
    t.deepEq(m.people.map(p => p.name), ['Olive', 'Eddie', 'Lee Smith'], 'chips: people with jobs here, in the business’s order, then leavers (Tom has none)');
    const h = html(app);
    t.includes(h, 'Lee Smith · left', 'the leaver’s row says so');
    t.includes(h, '>You</span>', 'Olive’s own rows say You');
    t.includes(h, '>Eddie</span>', 'Eddie’s say Eddie');
    // It is only a LOOK.
    t.eq(J(app.state().sessions), before.sessions, 'the phone’s jobs are unchanged');
    t.eq(storageSnap(app), before.storage, 'nothing stored — sync state, jobs, settings byte for byte');
    t.eq(srv.writes().length, w0, 'nothing sent');
    t.eq(app.state().sessions.length, 1, 'still the one job on this phone');
    // A page edge PATGo could never have made is never put into a filter.
    const s2 = cloud();
    for (let i = 0; i < 999; i++) s2.add(ED, BIG, 'ZZQ' + String(i).padStart(4, '0'), { date: '2025-01-01' });
    s2.add(ED, BIG, 'ZZZ,user_id.gt.0', { date: '2025-01-01' });   // sorts last on page one
    s2.add('ffffffff-0000-4000-8000-0000000000ff', BIG, 'ZZAFTER', { date: '2025-01-01' });   // a person after Eddie
    const a2 = phone(s2);
    await openCloud(a2);
    await openBig(a2);
    t.deepEq(s2.bad, [], 'a bad id at the page edge is never put into a filter');
    const b2 = a2.state().cloudJobs.biz;
    t.ok(b2.ok && b2.capped, '…the read stops there and says the list is cut short' + (b2.ok ? '' : ' — ' + b2.error));
  });

  /* ------------------------------------------------------------------ 103d */
  await t.group('103d — the look-only job: a teammate’s items as text, no Bring; your own can be brought; moved, gone and no signal said (2A)', async () => {
    const srv = cloud(); seedBig(srv);
    const app = phone(srv);
    // A synced phone, as a real one is — so a bring could really happen (the
    // bring checks the sync state is this account's), and the refusal below is
    // the look's own, not a phone that has never synced.
    await app.fn('syncPull')({ manual: true }); app.stop(); await tick(5);
    await openCloud(app);
    await openBig(app);
    const w0 = srv.writes().length;
    const before = storageSnap(app);
    tap(app, 'cloud-tap', ED + '|ZZSAME');
    await until(() => app.state().cloudLook && !app.state().cloudLook.loading);
    const look = srv.gets('/rest/v1/sessions').filter(c => c.qs.includes('select=id,doc,deleted,org_id'));
    t.eq(look.length, 1, 'one read of that job');
    t.ok(look[0].qs.includes('user_id=eq.' + ED) && look[0].qs.includes('id=eq.ZZSAME'), '…named by its person and id (rule 45)');
    const body = app.doc.getElementById('cloud-look-body').innerHTML;
    t.includes(body, '>E-77<', 'Eddie’s items are shown');
    t.includes(body, 'Kettle', '…what they are');
    t.includes(body, 'Earth 0.12 Ω', '…their readings');
    t.includes(body, '&lt;img src=x onerror=', '…and notes as TEXT — markup in a teammate’s job never becomes markup');
    t.excludes(body, '<img src=x', '…never raw');
    t.includes(body, 'By <strong>Eddie</strong>', 'who logged it');
    t.includes(body, '4 photos in the cloud', 'its photo count');
    t.excludes(body, 'ZZ Olive Same', 'Olive’s job with the same id is not what opened');
    t.eq(app.doc.getElementById('cloud-look-bring'), null, 'a teammate’s job: no Bring onto this phone');
    // The bring path refuses it too — even though Olive has a job with that id.
    app.fn('cloudLookBring')();
    await tick(30);
    t.notOk(app.state().sessions.some(s => String(s.id) === 'ZZSAME'), 'nothing comes onto this phone (not Eddie’s, not Olive’s same-id job)');
    t.eq(storageSnap(app), before, 'nothing stored');
    t.eq(srv.writes().length, w0, 'nothing sent');
    app.fn('cloudLookClose')();
    // Your own job in the business view: Bring onto this phone.
    tap(app, 'cloud-tap', O.id + '|ZZO1');
    await until(() => app.state().cloudLook && !app.state().cloudLook.loading);
    t.ok(!!app.doc.getElementById('cloud-look-bring'), 'your own job: Bring onto this phone');
    app.doc.getElementById('cloud-look-bring').click();
    await until(() => app.state().sessions.some(s => String(s.id) === 'ZZO1'));
    t.ok(app.state().sessions.some(s => String(s.id) === 'ZZO1'), '…brings it');
    // Moved out of Big Co since the list was read (to One Ltd, which Olive may
    // also read — so the row still comes back, but not from Big Co).
    srv.sessions.find(r => r.user_id === ED && r.id === 'ZZE1').org_id = ONE;
    tap(app, 'cloud-tap', ED + '|ZZE1');
    await until(() => app.state().cloudLook && !app.state().cloudLook.loading);
    t.includes(app.doc.getElementById('cloud-look-body').innerHTML, 'moved to another business', 'moved since: said so');
    await until(() => !app.state().cloudJobs.biz.loading);
    // Gone (deleted in the cloud since).
    srv.sessions.find(r => r.user_id === LEE).deleted = true;
    tap(app, 'cloud-tap', LEE + '|ZZL1');
    await until(() => app.state().cloudLook && !app.state().cloudLook.loading);
    t.includes(app.doc.getElementById('cloud-look-body').innerHTML, 'isn\u2019t in the cloud any more', 'gone: said so');
    await until(() => !app.state().cloudJobs.biz.loading);
    // No signal.
    app.run('navigator.onLine = false');
    const m = app.fn('cloudJobsModel')();
    const any = m.groups[0].rows[0];
    tap(app, 'cloud-tap', any.key);
    await until(() => app.state().cloudLook && !app.state().cloudLook.loading);
    t.includes(app.doc.getElementById('cloud-look-body').innerHTML, 'needs a connection', 'no signal: said so');
    app.run('navigator.onLine = true');
  });

  /* ------------------------------------------------------------------ 103e */
  await t.group('103e — the picker’s change event, person chips, Fails only and search by name (1A 3A)', async () => {
    const srv = cloud(); seedBig(srv);
    const app = phone(srv);
    await openCloud(app);
    t.excludes(html(app), 'ZZ Eddie Works', 'Your jobs first');
    await openBig(app);   // through the document's change listener
    t.eq(app.fn('cloudScope')(), BIG, 'the picker’s change reached the dispatcher');
    let h = html(app);
    t.includes(h, 'ZZ Eddie Works', 'Big Co: Eddie’s jobs');
    t.includes(h, 'ZZ Leaver Site', '…the leaver’s');
    t.includes(h, 'ZZ Olive Works', '…and Olive’s own');
    t.includes(h, '5 jobs in the cloud', 'five Big Co jobs');
    t.includes(h, 'data-action="cloud-person" data-arg="" aria-pressed="true">Everyone', 'chips: Everyone on');
    t.includes(h, '>Eddie</button>', '…Eddie');
    t.includes(h, '>Lee Smith (left)</button>', '…the leaver');
    t.includes(h, '>Olive (you)</button>', '…and you');
    t.excludes(h, 'data-action="cloud-select-toggle"', 'no Select in a business (look only)');
    t.excludes(h, 'data-action="cs-open"', 'no Cloud Storage in a business (it’s your account’s)');
    tap(app, 'cloud-person', ED);
    h = html(app);
    t.includes(h, '2 jobs in the cloud', 'Eddie: his two');
    t.excludes(h, 'ZZ Olive Works', '…nobody else’s');
    tap(app, 'cloud-person', '');
    tap(app, 'cloud-fails');
    h = html(app);
    t.includes(h, '2 of 5 jobs match', 'Fails only: the two jobs with fails');
    t.includes(h, 'ZZ Eddie Works', '…Eddie Works');
    t.includes(h, '2 fails', '…with its fails');
    t.excludes(h, 'ZZ Olive Works', '…not a job with none');
    tap(app, 'cloud-fails');
    app.fn('cloudJobsSearch')('lee smith');
    const area = app.doc.getElementById('cloud-list-area').innerHTML;
    t.includes(area, 'ZZ Leaver Site', 'search finds by the person’s name');
    t.excludes(area, 'ZZ Eddie Works', '…and hides the rest');
    app.fn('cloudJobsSearch')('');
    pick(app, 'mine');
    await tick(10);
    t.eq(app.fn('cloudScope')(), 'mine', 'back to Your jobs');
    t.excludes(html(app), 'ZZ Eddie Works', '…only her own');
    // A value that isn't a business she may read is Your jobs.
    pick(app, TWO);
    t.eq(app.fn('cloudScope')(), 'mine', 'Other Co (Engineer there) can’t be picked by value');
  });

  /* ------------------------------------------------------------------ 103f */
  // V165: the release checks moved to 104f; this keeps V164's own About line.
  await t.group('103f — V164’s About line; sync.js names V164', () => {
    t.includes(read('render-help.js'), 'One place for your jobs in the cloud: every job is listed', 'About: V164’s line');
    t.includes(read('sync.js'), 'V164 — the business view', 'sync.js names V164');
  });
};

// V165: the stand-in and helpers, for 104-v165.js (the same team, extended there).
module.exports.kit = { cloud, phone, localJob, tap, pick, openCloud, openBig, until, seedBig, query, json, login,
  storageSnap, html, O, ED, TOM, LEE, BIG, TWO, ONE, EDOWN };
