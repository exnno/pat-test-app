/* Standing test — V165: a business holding someone else's jobs; photos inside the look (round 1A 2A 3A)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

     104a  THE PICKER RULE (1A). A business you may read whole is offered when it
           has two or more members OR the cloud says it holds someone else's jobs
           (found in Peter's live test of V164: the only other person removed, their
           jobs kept, no picker). The answer is read with the businesses (rpc
           business_others_jobs), kept between reads, cleared when the cloud says
           no, untouched when the rpc isn't there (a project without the SQL), and
           never carried from another account. An Engineer is never offered one.
     104b  END TO END: Olive, alone in Big Co since Lee left, opens the Cloud tab —
           the picker is there and Lee's job is listed, marked left. And the delete
           review leaves out a ticked job that has since landed on this phone.
     104c  PHOTOS IN THE LOOK (2A). Nothing is read until "Show photos" is tapped
           (through the sheet's own listener). Then: the rows, by the job's person
           and id; previews one at a time, only where the cloud has one; a tile per
           photo named by its item; a photo id PATGo never made is never asked for.
           A tap opens the full photo; Back returns. And it is only a look: storage
           (every key), the phone's photo list and the cloud photo list are
           unchanged, nothing is sent, and closing the sheet lets every picture go.
     104d  WHEN IT CAN'T: no signal, a failed read, a photo the cloud refuses — each
           said; the sheet closed mid-download paints nothing and keeps nothing.
     104e  the SQL: schema.sql ends with v165-business-jobs.sql's block byte for
           byte; who it answers for; self-checks J1–J3; isolation 30a–30c.
     104f  V165's About line; sync.js names V165 (V166: the release checks → 105f).

   ⚠ WHAT THIS FILE CANNOT PROVE: the database's rules — who may read a photo row
   or file, and what business_others_jobs answers. The stand-in applies them as
   written (a photo is readable when its job is); the function and the reads were
   proved in a real Postgres (PGlite + a Supabase stand-in, the whole schema.sql). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { tick, freshApp } = require('../fixture');
const K = require('./103-v164.js').kit;
const { O, ED, LEE, BIG, ONE, EDOWN, tap, pick, openCloud, openBig, until, json, query, storageSnap, html } = K;

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const J = JSON.stringify;
const XAN = '99999999-0000-4000-8000-000000000099';

// 103's team, plus: the businesses and the others-jobs answer are set per test;
// the photos table and photo files.
function cloud(opts) {
  const srv = K.cloud();
  const base = srv.fetchImpl;
  srv.businesses = (opts && opts.businesses) || [{ id: BIG, name: 'Big Co', role: 'owner', is_default: true, members: 1 }];
  srv.others = (opts && 'others' in opts) ? opts.others : [{ business_id: BIG, others: true }];   // null = no such function
  srv.prows = [];          // { id, user_id, session_id, item_id, thumb, deleted }
  srv.files = [];          // paths asked for
  srv.failPhotos = false;  // the photos table answers 500
  srv.refuseFull = false;  // full photos refused
  srv.slow = null;         // a promise a file download waits on
  const jobOf = (p) => srv.sessions.find(s => s.user_id === p.user_id && s.id === p.session_id);
  srv.fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const p = u.split('?')[0].replace(/^https:\/\/[^/]+/, '');
    const qs = u.split('?')[1] || '';
    const method = init.method || 'GET';
    const note = () => srv.calls.push({ path: p, qs: decodeURIComponent(qs), method, body: null });
    if (p === '/rest/v1/rpc/my_businesses') { note(); return json(srv.businesses); }
    if (p === '/rest/v1/rpc/business_others_jobs') {
      note();
      if (srv.others === null) return json({ code: 'PGRST202', message: 'Could not find the function public.business_others_jobs', details: null, hint: null }, 404);
      return json(srv.others);
    }
    if (p === '/rest/v1/photos' && method === 'GET') {
      note();
      if (srv.failPhotos) return json({ code: 'XX000', message: 'boom', details: null, hint: null }, 500);
      const r = query(srv.prows.filter(x => { const j = jobOf(x); return j && srv.readable(j); }), qs);
      if (r.bad) return json({ code: 'PGRST100', message: 'bad', details: r.bad, hint: null }, 400);
      return json(r.rows);
    }
    if (p.startsWith('/storage/v1/object/photos/') && method === 'GET') {
      note();
      const name = decodeURIComponent(p.slice('/storage/v1/object/photos/'.length));
      srv.files.push(name);
      if (srv.slow) await srv.slow;
      const full = !/_t\.jpg$/.test(name);
      const row = srv.prows.find(x => x.user_id + '/' + x.id + (full ? '.jpg' : '_t.jpg') === name);
      const j = row && jobOf(row);
      if (!row || !j || !srv.readable(j) || (full && srv.refuseFull) || (!full && !row.thumb)) {
        return json({ statusCode: '404', error: 'not_found', message: 'Object not found' }, 400);
      }
      return new Response(Buffer.from('ZZJPEG ' + name), { status: 200, headers: { 'content-type': 'image/jpeg' } });
    }
    return base(url, init);
  };
  return srv;
}

function phone(srv, list) {
  const app = K.phone(srv, list || [{ id: BIG, name: 'Big Co', role: 'owner', def: true, n: 1 }]);
  // Object URLs the test can count: made and let go.
  app.urls = { made: [], gone: [] };
  const Host = globalThis.URL;
  let n = 0;
  app.sandbox.URL = class extends Host {
    static createObjectURL(b) { const u = 'blob:zz-' + (++n); app.urls.made.push(u); return u; }
    static revokeObjectURL(u) { app.urls.gone.push(String(u)); }
  };
  return app;
}
const setList = (app, list) => app.run(`localStorage.setItem('pat:businesses', ${J(J({ u: O.id, at: Date.now(), list }))})`);
const stored = (app) => JSON.parse(app.storage.getItem('pat:businesses'));
const choices = (app) => app.fn('cloudScopeChoices')().map(c => c.id);
async function sync(app) { await app.fn('syncPull')({ manual: true }); app.stop(); await tick(10); }
const body = (app) => app.doc.getElementById('cloud-look-body');
// A tap inside the look sheet, through the sheet's own listener.
function lookTap(app, action, arg) {
  const el = app.doc.createElement('button');
  el.dataset.look = action;
  if (arg !== undefined) el.dataset.arg = String(arg);
  body(app).dispatchEvent({ type: 'click', target: el, defaultPrevented: false, preventDefault() {}, stopPropagation() {} });
}
async function lookAt(app, key) {
  tap(app, 'cloud-tap', key);
  await until(() => app.state().cloudLook && !app.state().cloudLook.loading);
}
const ph = (app) => app.state().cloudLook && app.state().cloudLook.ph;
function seedPhotos(srv) {
  srv.prows.push(
    { id: 'p1', user_id: ED, session_id: 'ZZSAME', item_id: 'x1', thumb: true, deleted: false },
    { id: 'p2', user_id: ED, session_id: 'ZZSAME', item_id: 'x2', thumb: true, deleted: false },
    { id: 'p3', user_id: ED, session_id: 'ZZSAME', item_id: 'x1', thumb: false, deleted: false },
    { id: 'bad/../id', user_id: ED, session_id: 'ZZSAME', item_id: 'x1', thumb: true, deleted: false },
    { id: 'pgone', user_id: ED, session_id: 'ZZSAME', item_id: 'x1', thumb: true, deleted: true },
    { id: 'pother', user_id: ED, session_id: 'ZZE1', item_id: 'a', thumb: true, deleted: false },
    { id: 'p1', user_id: O.id, session_id: 'ZZSAME', item_id: 'a', thumb: true, deleted: false });   // Olive's own, same ids
}

module.exports = async function () {
  /* ------------------------------------------------------------------ 104a */
  await t.group('104a — the picker rule: two or more members, or someone else’s jobs held; the cloud’s answer read, kept, cleared (1A)', async () => {
    const app = phone(cloud());
    const own = (o) => Object.assign({ id: BIG, name: 'Big Co', role: 'owner', def: true, n: 1 }, o);
    setList(app, [own({})]);
    t.deepEq(choices(app), [], 'one member, nobody else’s jobs: no picker');
    setList(app, [own({ oj: true })]);
    t.deepEq(choices(app), [BIG], 'one member but someone else’s jobs held: offered');
    setList(app, [own({ n: 2 })]);
    t.deepEq(choices(app), [BIG], 'two members: offered, as V164');
    setList(app, [own({ role: 'engineer', oj: true })]);
    t.deepEq(choices(app), [], 'an Engineer is never offered it, whatever is stored');
    setList(app, [own({ oj: 'yes' })]);
    t.deepEq(choices(app), [], 'only a real true counts (garbage is a no)');
    // Read with the businesses: the cloud says yes.
    setList(app, [own({})]);
    await sync(app);
    t.ok(app.srv.calls.some(c => c.path === '/rest/v1/rpc/business_others_jobs'), 'business_others_jobs is read with the businesses');
    t.eq(stored(app).list[0].oj, true, 'the yes is stored with the business');
    t.deepEq(choices(app), [BIG], '…and the picker is offered');
    // The next read of the list keeps it (no flicker while the answer is on its way)…
    app.srv.others = null;   // a project without the V165 SQL
    app.run('businessReadOwe()');
    await sync(app);
    t.eq(stored(app).list.length, 1, 'no such function: the list is still read');
    t.eq(stored(app).list[0].oj, true, '…and what was known is kept');
    // …until the cloud says no.
    app.srv.others = [{ business_id: BIG, others: false }];
    app.run('businessReadOwe()');
    await sync(app);
    t.eq(stored(app).list[0].oj, false, 'the cloud says no: cleared');
    t.deepEq(choices(app), [], '…and no picker');
    // A business with no row is a no; a row for a business not on the list is ignored.
    app.srv.others = [{ business_id: EDOWN, others: true }];
    setList(app, [own({ oj: true })]);
    app.run('businessReadOwe()');
    await sync(app);
    t.eq(stored(app).list[0].oj, false, 'no row for it: a no');
    t.eq(stored(app).list.length, 1, 'a row for a business that isn’t yours adds nothing');
    // Never carried from another account's stored list.
    app.run(`localStorage.setItem('pat:businesses', ${J(J({ u: XAN, at: Date.now(), list: [own({ oj: true })] }))})`);
    app.fn('businessFromRows')(O.id, [{ id: BIG, name: 'Big Co', role: 'owner', is_default: true, members: 1 }]);
    t.eq(stored(app).list[0].oj, false, 'another account’s answer is never carried over');
    t.notOk(app.fn('businessOthersApply')(XAN, [{ business_id: BIG, others: true }]), '…nor applied to a list that isn’t that account’s');
    t.eq(stored(app).list[0].oj, false, '…unchanged');
  });

  /* ------------------------------------------------------------------ 104b */
  await t.group('104b — alone in the business since someone left: the picker is there and their jobs are listed; the delete review leaves out a job now on this phone', async () => {
    const srv = cloud(); K.seedBig(srv);
    srv.people = srv.people.filter(p => p.user_id === O.id);   // only Olive is a member now
    srv.sessions = srv.sessions.filter(s => s.user_id !== ED || s.org_id !== BIG);   // Eddie never was; Lee left
    const app = phone(srv);
    await openCloud(app);
    t.excludes(html(app), 'id="cloud-scope"', 'before the businesses are read: no picker (one member)');
    await sync(app);
    t.notOk(/Couldn/.test((app.state().sync && app.state().sync.message) || ''), 'set-up: the sync run went through');
    app.run('render()');
    t.includes(html(app), 'id="cloud-scope"', 'after: the picker is offered');
    await openBig(app);
    const h = html(app);
    t.includes(h, 'ZZ Leaver Site', 'the leaver’s job is listed');
    t.includes(h, 'Lee Smith · left', '…marked left');
    // The delete review: a ticked job that has since landed on this phone.
    pick(app, 'mine');
    await tick(10);
    const cloudOnly = [].concat(...app.fn('cloudJobsModel')().groups.map(g => g.rows)).filter(r => !r.onPhone).map(r => r.id);
    t.ok(cloudOnly.length >= 2, 'set-up: at least two cloud-only jobs');
    const [a, b] = cloudOnly;
    t.eq(app.fn('cloudDeleteOverview')([a, b]).n, 2, 'set-up: two cloud-only jobs ticked');
    K.localJob(app, a, 'ZZ landed since');
    const o = app.fn('cloudDeleteOverview')([a, b]);
    t.deepEq(o.ids, [b], 'the one now on this phone is left out of the review');
    t.eq(app.fn('cloudDeleteOverview')([a]).n, 0, '…and alone, there is nothing to review');
  });

  /* ------------------------------------------------------------------ 104c */
  await t.group('104c — photos in the look: nothing until Show photos; rows by person and id; previews; the full photo; only a look (2A)', async () => {
    const srv = cloud({ businesses: [{ id: BIG, name: 'Big Co', role: 'owner', is_default: true, members: 3 }] });
    K.seedBig(srv); seedPhotos(srv);
    const app = phone(srv, [{ id: BIG, name: 'Big Co', role: 'owner', def: true, n: 3 }]);
    await sync(app);
    await openCloud(app);
    await openBig(app);
    await lookAt(app, ED + '|ZZSAME');
    const before = { storage: storageSnap(app), meta: J(app.state().photoMeta || null), pc: J(app.state().photoCloud || null), w: srv.writes().length };
    const photoGets = () => srv.calls.filter(c => c.path === '/rest/v1/photos' && /session_id=eq\.ZZSAME/.test(c.qs));
    await tick(40);   // long enough for anything that would start by itself
    t.includes(body(app).innerHTML, 'data-look="photos"', 'Show photos is offered');
    t.includes(body(app).innerHTML, 'Show photos (4)', '…with the count');
    t.eq(photoGets().length, 0, 'nothing read before the tap');
    t.eq(srv.files.length, 0, '…and no picture downloaded');
    lookTap(app, 'photos');
    await until(() => ph(app) && !ph(app).loading && ph(app).list.every(p => p.tried));
    t.eq(photoGets().length, 1, 'one read of the photo rows');
    t.ok(photoGets()[0].qs.includes('user_id=eq.' + ED) && photoGets()[0].qs.includes('deleted=eq.false'), '…by the job’s own person (rule 45), live rows only');
    t.deepEq(ph(app).list.map(p => p.id), ['p1', 'p2', 'p3'], 'Eddie’s three for that job — not the deleted one, not another job’s, not a bad id');
    t.deepEq(srv.files.slice().sort(), [ED + '/p1_t.jpg', ED + '/p2_t.jpg'], 'previews fetched only where the cloud has one, from Eddie’s folder');
    t.notOk(srv.files.some(f => f.includes('..') || f.includes('bad')), 'a photo id PATGo never made is never asked for');
    const g = body(app).innerHTML;
    t.eq((g.match(/class="cloud-look-tile"/g) || []).length, 3, 'three tiles');
    t.eq((g.match(/<img src="blob:zz-/g) || []).length, 2, 'two with their previews');
    t.includes(g, '<span class="cloud-look-tile-cap">E-77</span>', 'a tile is named by its item’s asset number');
    t.includes(g, 'aria-label="Photo of item E-78"', '…for VoiceOver too');
    t.includes(g, 'id="cloud-look-items"', 'the items are still there under the photos');
    // Open one full size, through the sheet's listener.
    lookTap(app, 'photo', 'p3');
    await until(() => ph(app).open && !ph(app).open.loading);
    t.ok(srv.files.includes(ED + '/p3.jpg'), 'the full photo is fetched on the tap (one with no preview still opens)');
    t.includes(body(app).innerHTML, 'id="cloud-look-full"', 'shown full size');
    t.excludes(body(app).innerHTML, 'id="cloud-look-items"', '…in place of the job');
    lookTap(app, 'photo-back');
    t.eq(ph(app).open, null, 'Back');
    t.includes(body(app).innerHTML, 'class="cloud-look-grid"', '…to the job and its photos');
    t.notOk(srv.files.includes(O.id + '/p1_t.jpg') || srv.files.includes(O.id + '/p1.jpg'), 'never Olive’s own photo of the same id');
    // Only a look.
    t.eq(storageSnap(app), before.storage, 'nothing stored — every key byte for byte');
    t.eq(J(app.state().photoMeta || null), before.meta, 'the phone’s photo list is unchanged');
    t.eq(J(app.state().photoCloud || null), before.pc, 'the cloud photo list the sync keeps is unchanged');
    t.eq(srv.writes().length, before.w, 'nothing sent');
    // Closing lets every picture go.
    const made = app.urls.made.slice();
    t.eq(made.length, 3, 'set-up: three pictures were made (two previews, one full)');
    app.doc.getElementById('cloud-look-close').click();
    t.eq(app.state().cloudLook, null, 'closed');
    t.deepEq(app.urls.gone.slice().sort(), made.slice().sort(), 'every picture is let go on closing');
    // Your own job, in Your jobs: the same, from your own folder.
    pick(app, 'mine');
    await tick(10);
    await lookAt(app, 'ZZSAME');
    lookTap(app, 'photos');
    await until(() => ph(app) && !ph(app).loading && ph(app).list.every(p => p.tried));
    t.deepEq(ph(app).list.map(p => p.id), ['p1'], 'your own job: your own photo');
    t.ok(srv.files.includes(O.id + '/p1_t.jpg'), '…from your own folder');
    t.eq(storageSnap(app), before.storage, '…and still nothing stored');
  });

  /* ------------------------------------------------------------------ 104d */
  await t.group('104d — when it can’t: no signal, a failed read, a refused photo — each said; closed mid-download keeps nothing', async () => {
    const srv = cloud({ businesses: [{ id: BIG, name: 'Big Co', role: 'owner', is_default: true, members: 3 }] });
    K.seedBig(srv); seedPhotos(srv);
    const app = phone(srv, [{ id: BIG, name: 'Big Co', role: 'owner', def: true, n: 3 }]);
    await openCloud(app);
    await openBig(app);
    await lookAt(app, ED + '|ZZSAME');
    app.run('navigator.onLine = false');
    lookTap(app, 'photos');
    t.includes(body(app).innerHTML, 'photos need a connection', 'no signal: said');
    t.includes(body(app).innerHTML, 'data-look="photos"', '…and Show photos is still there to try again');
    app.run('navigator.onLine = true');
    srv.failPhotos = true;
    lookTap(app, 'photos');
    await until(() => !ph(app) && !!app.state().cloudLook.phError);
    t.ok(app.state().cloudLook.phError.length > 0, 'a failed read: said');
    t.includes(body(app).innerHTML, 'data-look="photos"', '…and it can be tried again');
    srv.failPhotos = false;
    lookTap(app, 'photos');
    await until(() => ph(app) && !ph(app).loading && ph(app).list.every(p => p.tried));
    t.excludes(body(app).innerHTML, 'pm-error', 'the retry clears the message');
    srv.refuseFull = true;
    lookTap(app, 'photo', 'p1');
    await until(() => ph(app).open && !ph(app).open.loading);
    t.includes(body(app).innerHTML, 'Couldn’t open this photo', 'a photo the cloud won’t give: said');
    lookTap(app, 'photo', 'zz-not-in-this-job');
    t.eq(ph(app).open.id, 'p1', 'a photo not on the list can’t be asked for');
    lookTap(app, 'photo-back');
    // Closed while a full photo is on its way: nothing painted, nothing kept.
    srv.refuseFull = false;
    let let_go; srv.slow = new Promise((r) => { let_go = r; });
    lookTap(app, 'photo', 'p2');
    const madeBefore = app.urls.made.length;
    app.doc.getElementById('cloud-look-close').click();
    let_go(); srv.slow = null;
    await tick(60);
    t.eq(app.state().cloudLook, null, 'closed mid-download');
    const late = app.urls.made.slice(madeBefore);
    t.ok(late.every(u => app.urls.gone.includes(u)), 'a picture that lands after closing is let go at once');
    t.deepEq(app.urls.made.filter(u => !app.urls.gone.includes(u)), [], '…nothing is kept');
  });

  /* ------------------------------------------------------------------ 104e */
  await t.group('104e — the SQL: schema.sql in step; who it answers for; J1–J3; isolation 30a–30c', () => {
    const mig = read('supabase/v165-business-jobs.sql');
    const end = '-- ================================================================ end V165\n';
    const block = mig.slice(mig.indexOf('-- ================================================================ V165\n'), mig.indexOf(end) + end.length);
    t.ok(block.length > 900, 'the migration has its definition');
    // V166: no longer the LAST section (V166's follows — 105e); still whole, and
    // nothing after it redefines business_others_jobs.
    const sch = read('supabase/schema.sql');
    t.ok(sch.includes(block), 'a new project gets it byte for byte');
    t.excludes(sch.slice(sch.indexOf(block) + block.length), 'function public.business_others_jobs', '…and no later section redefines it');
    t.includes(block, "and m.role in ('owner', 'team_leader', 'office')", 'only for a business the caller may read whole');
    t.includes(block, 'where m.user_id = (select auth.uid())', '…and is in');
    t.includes(block, 'and s.user_id <> (select auth.uid())', 'someone ELSE’s job');
    t.includes(block, 'and s.deleted = false)', '…that still exists');
    t.includes(block, 'returns table (business_id uuid, others boolean)', 'a yes or no only — no job, no person, no count');
    t.includes(block, 'revoke all on function public.business_others_jobs() from public, anon;', 'nobody signed out');
    t.includes(block, "security definer set search_path = ''", 'a pinned search path');
    for (const n of ['1', '2', '3']) t.includes(mig, `select ${n}, '`, 'self-check J' + n);
    const iso = read('supabase/isolation-test.sql');
    for (const g of ['30a', '30b', '30c']) t.includes(iso, `res := res || array['${g}|`, 'isolation ' + g);
    t.includes(iso, "30a|A is told A''s business holds someone else''s job|FAIL|run supabase/v165-business-jobs.sql first", '…30a names the file when it hasn’t been run');
  });

  /* ------------------------------------------------------------------ 104f */
  // V166: the release checks moved to 105f; this keeps V165's own About line.
  await t.group('104f — V165’s About line; sync.js names V165', () => {
    t.includes(read('render-help.js'), 'Photos when you look at a cloud job: tap Show photos', 'About: V165’s line');
    t.includes(read('sync.js'), 'V165 (2A): the photos of a job being LOOKED at', 'sync.js names V165');
  });
};
