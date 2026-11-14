/* Standing test — V166: how much is stored — the Cloud tab's line, a business's Cloud Storage (round 1A 2A 3A 4A 5A 6A)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

     105a  THE LINE, YOUR JOBS (1A). Not read at start; read with the cloud list
           (rpc my_storage); then the link reads "N jobs · N photos · about X",
           painted in place, its VoiceOver label too, opening your own page. No
           V166 SQL: the plain link. A failed read keeps the last figures; another
           account's are never shown. The page's own read updates the line; a
           Cloud Storage page for a business never reaches Settings' summary.
     105b  THE LINE, A BUSINESS (1A 2A 5A). Picking the business reads its totals
           (business_storage, by its id — totals only: no names, no biggest
           jobs); the line shows them and opens THAT business's page. Back on Your
           jobs: your own again. An answer for a business no longer picked is dropped.
     105c  A BUSINESS'S PAGE (2A 3A 4A). Its total; a line per person, biggest
           first — You, a member by name, a leaver by the job they logged, "· left";
           its biggest jobs with the person on each; a tap opens the job look-only,
           read by that person and id (Show photos there too). Look only: no
           Select, no Delete, no Manage Photos, and the guards hold even if called.
           Nothing stored, nothing sent.
     105d  WHEN IT CAN'T: no V166 SQL (the page says which update); no signal; the
           business no longer one this account may read whole (5A — said, no retry,
           nothing shown); Back to the Cloud tab.
     105e  the SQL: schema.sql ends with v166-storage.sql's block byte for byte;
           the reader's own rights; who it answers for; K1–K4; isolation 31a–31c.
     105f  V166's About line; sync.js names V166 (V167: the release checks → 106f).

   ⚠ WHAT THIS FILE CANNOT PROVE: what the database adds up and for whom. The
   stand-in answers as the functions are written; the functions themselves were
   proved in a real Postgres (PGlite + a Supabase stand-in, the whole schema.sql:
   every role, a leaver, deleted rows, the limit, signed out; eight broken copies
   each caught). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { tick, freshApp } = require('../fixture');
const K = require('./103-v164.js').kit;
const { O, ED, LEE, BIG, TWO, ONE, tap, pick, openCloud, openBig, until, json, storageSnap, html } = K;

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const J = JSON.stringify;
const XAN = '99999999-0000-4000-8000-000000000099';

// 103's team, plus the three V166 functions, answering as written: counts and
// sizes of what the caller may read (the stand-in's own read rule), a business's
// only for one the caller may read whole.
const size = (r) => J(r.doc).length;
function cloud(opts) {
  const srv = K.cloud();
  K.seedBig(srv);
  srv.photos.forEach((p, i) => { p.bytes = 1000 * (i + 1); });
  const base = srv.fetchImpl;
  srv.noSql = !!(opts && opts.noSql);   // a project without the V166 SQL
  srv.failMine = false;
  srv.slowBiz = null;
  const canReadWhole = (o) => srv.readable({ user_id: XAN, org_id: o });
  const jobOf = (p) => srv.sessions.find(s => s.user_id === p.user_id && s.id === p.session_id);
  const live = () => srv.sessions.filter(s => !s.deleted && srv.readable(s));
  srv.expect = {
    mine() {
      const jobs = live().filter(s => s.user_id === O.id);
      const ph = srv.photos.filter(p => p.user_id === O.id && jobOf(p) && srv.readable(jobOf(p)));
      return { jobs: jobs.length, jobBytes: jobs.reduce((n, s) => n + size(s), 0), photos: ph.length, photoBytes: ph.reduce((n, p) => n + p.bytes, 0) };
    },
    biz(o) {
      const m = new Map();
      for (const s of live().filter(s => s.org_id === o)) {
        const e = m.get(s.user_id) || { user_id: s.user_id, jobs: 0, job_bytes: 0, photos: 0, photo_bytes: 0, engineer: null };
        e.jobs++; e.job_bytes += size(s); if (s.doc.engineer) e.engineer = s.doc.engineer;
        m.set(s.user_id, e);
      }
      for (const p of srv.photos) {
        const j = jobOf(p);
        if (!j || j.org_id !== o || !srv.readable(j)) continue;
        const e = m.get(p.user_id) || { user_id: p.user_id, jobs: 0, job_bytes: 0, photos: 0, photo_bytes: 0, engineer: null };
        e.photos++; e.photo_bytes += p.bytes; m.set(p.user_id, e);
      }
      return Array.from(m.values()).sort((a, b) => a.user_id < b.user_id ? -1 : 1);
    },
    top(o, lim) {
      return live().filter(s => s.org_id === o).map((s) => {
        const ph = srv.photos.filter(p => p.user_id === s.user_id && p.session_id === s.id);
        const items = Array.isArray(s.doc.items) ? s.doc.items : [];
        return { user_id: s.user_id, id: s.id, job_bytes: size(s), photos: ph.length, photo_bytes: ph.reduce((n, p) => n + p.bytes, 0),
          site: s.doc.site || null, name: s.doc.name || null, date: s.doc.date || null, client_id: s.doc.clientId || null,
          engineer: s.doc.engineer || null, locked: s.doc.locked ? 'true' : null, cert_no: s.doc.certNo || null,
          items: items.length, fails: items.filter(i => i.result === 'fail').length };
      }).sort((a, b) => (b.job_bytes + b.photo_bytes) - (a.job_bytes + a.photo_bytes) || (a.user_id < b.user_id ? -1 : 1))
        .slice(0, Math.min(Math.max(lim || 10, 1), 50));
    },
  };
  const missing = (fn) => json({ code: 'PGRST202', message: 'Could not find the function public.' + fn, details: null, hint: null }, 404);
  srv.fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const p = u.split('?')[0].replace(/^https:\/\/[^/]+/, '');
    let body = null;
    try { body = init.body ? JSON.parse(init.body) : null; } catch { body = null; }
    const note = () => srv.calls.push({ path: p, qs: '', method: init.method || 'GET', body });
    if (p === '/rest/v1/rpc/my_storage') {
      note();
      if (srv.noSql) return missing('my_storage');
      if (srv.failMine) return json({ code: 'XX000', message: 'boom', details: null, hint: null }, 500);
      const e = srv.expect.mine();
      return json([{ jobs: e.jobs, job_bytes: e.jobBytes, photos: e.photos, photo_bytes: e.photoBytes }]);
    }
    if (p === '/rest/v1/rpc/business_storage') {
      note();
      if (srv.noSql) return missing('business_storage');
      if (srv.slowBiz) await srv.slowBiz;
      return json(body && canReadWhole(body.o) ? srv.expect.biz(body.o) : []);
    }
    if (p === '/rest/v1/rpc/business_biggest_jobs') {
      note();
      if (srv.noSql) return missing('business_biggest_jobs');
      return json(body && canReadWhole(body.o) ? srv.expect.top(body.o, body.lim) : []);
    }
    return base(url, init);
  };
  srv.rpcs = (name) => srv.calls.filter(c => c.path === '/rest/v1/rpc/' + name);
  return srv;
}
const phone = (srv, list) => K.phone(srv, list);
const lineEl = (app) => app.doc.getElementById('cloud-storage-line');
const bytes = (app, n) => app.fn('cloudBytesText')(n);
const pl = (n, w) => `${n.toLocaleString('en-GB')} ${w}${n === 1 ? '' : 's'}`;
// The line's figures as drawn: each kept whole (a nowrap part).
const part = (x) => `<span class="cs-part">${x}</span>`;
const fig = (app, jobs, photos, b) => `${part(pl(jobs, 'job'))} · ${part(pl(photos, 'photo'))} · ${part('about ' + bytes(app, b))}`;
async function lineLands(app) { await until(() => { const cj = app.state().cloudJobs; return cj && !cj.storeAsk && (!cj.biz || !cj.biz.storeAsk); }); }
async function openStore(app, arg) {
  tap(app, 'cs-open', arg);
  await until(() => { const cs = app.state().cloudStore; return !!(cs && !cs.loading && (cs.ok || cs.error)); });
}

module.exports = async function () {
  /* ------------------------------------------------------------------ 105a */
  await t.group('105a — the line, Your jobs: read with the list, the figures in place, the plain link without the SQL (1A)', async () => {
    const srv = cloud();
    const app = phone(srv);
    app.run('state.view = "sessions"; render();');
    t.eq(srv.rpcs('my_storage').length, 0, 'not read at start');
    await openCloud(app);
    await lineLands(app);
    t.eq(srv.rpcs('my_storage').length, 1, 'read once, with the cloud list');
    const e = srv.expect.mine();
    t.ok(e.jobs === 3 && e.photos === 1, 'set-up: three jobs of Olive’s, one photo');
    const words = fig(app, e.jobs, e.photos, e.jobBytes + e.photoBytes);
    app.run('render()');
    t.includes(html(app), words, 'the line: ' + words);
    t.includes(html(app), `aria-label="Cloud Storage: ${pl(e.jobs, 'job')}, ${pl(e.photos, 'photo')}, about ${bytes(app, e.jobBytes + e.photoBytes)}"`, '…and its VoiceOver label');
    t.includes(html(app), 'data-action="cs-open" data-arg="mine"', 'it opens your own page');
    // In place: the line paints itself when the read lands, without a render
    // (the search box may have the keyboard — MAP rule 3).
    lineEl(app).innerHTML = 'ZZSTALE';
    app.run('state.cloudJobs.store = null');
    const htmlBefore = html(app);
    app.fn('_cloudLineLoad')(app.state().cloudJobs, '');
    await lineLands(app);
    t.includes(lineEl(app).innerHTML, words, 'repainted in place when the read lands');
    t.eq(lineEl(app).getAttribute('aria-label'), `Cloud Storage: ${pl(e.jobs, 'job')}, ${pl(e.photos, 'photo')}, about ${bytes(app, e.jobBytes + e.photoBytes)}`, '…its label too');
    t.eq(html(app), htmlBefore, '…without a render (the search box keeps the keyboard)');
    // A failed read keeps what was known.
    srv.failMine = true;
    app.fn('_cloudLineLoad')(app.state().cloudJobs, '');
    await lineLands(app);
    t.includes(lineEl(app).innerHTML, words, 'a failed read keeps the last figures');
    srv.failMine = false;
    // Never another account's.
    app.run(`state.cloudJobs.store.uid = ${J(XAN)}`);
    t.eq(app.fn('cloudStorageLine')(), null, 'figures read for another account are never shown');
    app.run('render()');
    t.excludes(html(app), 'cloud-storage-figures', '…the plain link instead');
    // Without the V166 SQL: the plain link, and the list still works.
    const s2 = cloud({ noSql: true });
    const a2 = phone(s2);
    await openCloud(a2);
    await lineLands(a2);
    t.ok(a2.state().cloudJobs.ok, 'no V166 SQL: the list is read as before');
    t.eq(a2.fn('cloudStorageLine')(), null, '…no figures');
    a2.run('render()');
    t.includes(html(a2), 'aria-label="Cloud Storage">', '…the plain link');
    t.excludes(html(a2), 'cloud-storage-figures', '…with no figures in it');
    // The page's own read is the newest word: the line takes it.
    await openStore(app, 'mine');
    t.ok(app.state().cloudStore.ok && !app.state().cloudStore.org, 'set-up: your own page read');
    app.run('state.cloudJobs.store = null');
    app.run('cloudStoreLoad()');
    await until(() => !app.state().cloudStore.loading);
    t.ok(app.state().cloudJobs.store && app.state().cloudJobs.store.uid === O.id, 'the page’s read updates the line');
  });

  /* ------------------------------------------------------------------ 105b */
  await t.group('105b — the line, a business: its totals by its id, opening its page; Your jobs again your own (1A 2A 5A)', async () => {
    const srv = cloud();
    const app = phone(srv);
    await openCloud(app);
    await lineLands(app);
    await openBig(app);
    await lineLands(app);
    const calls = srv.rpcs('business_storage');
    t.eq(calls.length, 1, 'the business’s totals read when it is picked');
    t.eq(calls[0].body && calls[0].body.o, BIG, '…by its id');
    t.eq(srv.rpcs('business_biggest_jobs').length, 0, 'the line reads totals only — not the biggest jobs');
    const rows = srv.expect.biz(BIG);
    const n = rows.reduce((a, r) => a + r.jobs, 0), ph = rows.reduce((a, r) => a + r.photos, 0);
    const b = rows.reduce((a, r) => a + r.job_bytes + r.photo_bytes, 0);
    t.ok(n === 5 && ph === 5, 'set-up: five jobs and five photos in Big Co');
    const words = fig(app, n, ph, b);
    app.run('render()');
    t.includes(html(app), words, 'the line shows the business’s: ' + words);
    t.includes(html(app), 'data-action="cs-open" data-arg="' + BIG + '"', '…and opens Big Co’s page');
    pick(app, 'mine');
    await tick(10);
    const e = srv.expect.mine();
    t.includes(html(app), `${part(pl(e.jobs, 'job'))} · ${part(pl(e.photos, 'photo'))} · `, 'back on Your jobs: your own figures');
    t.includes(html(app), 'data-arg="mine"', '…opening your own page');
    // An answer for a business no longer picked is dropped.
    let go; srv.slowBiz = new Promise((r) => { go = r; });
    pick(app, BIG);
    app.run('cloudJobsLoad(true)');
    await tick(10);
    const held = app.state().cloudJobs.biz;
    pick(app, 'mine');
    go(); srv.slowBiz = null;
    await tick(40);
    t.ok(held.org === BIG, 'set-up: the business’s read was under way');
    const f = app.fn('cloudStorageLine')();
    t.ok(f && f.scope === 'mine' && f.jobs === e.jobs, 'an answer for a business no longer picked is never shown — the line is your own');
    // An Engineer (no picker): only ever their own line.
    const a2 = phone(cloud(), [{ id: BIG, name: 'Big Co', role: 'engineer', def: true, n: 3 }]);
    await openCloud(a2);
    await lineLands(a2);
    t.eq(a2.srv.rpcs('business_storage').length, 0, 'an Engineer: no business figures are asked for');
    t.includes(html(a2), 'data-arg="mine"', '…the line is their own');
  });

  /* ------------------------------------------------------------------ 105c */
  await t.group('105c — a business’s page: total, a line per person, biggest jobs by person, each opening look-only; look only (2A 3A 4A)', async () => {
    const srv = cloud();
    const app = phone(srv);
    await app.fn('syncPull')({ manual: true }); app.stop(); await tick(10);
    await openCloud(app);
    await openBig(app);
    await lineLands(app);
    await tick(40); app.stop();
    const c0 = srv.calls.length;
    await openStore(app, BIG);
    app.stop();
    // Opening the page reads three answers and nothing else — no table, no write.
    t.deepEq(srv.calls.slice(c0, c0 + 3).map(c => c.path), ['/rest/v1/rpc/business_storage', '/rest/v1/rpc/business_people', '/rest/v1/rpc/business_biggest_jobs'],
      'the page reads business_storage, the names and the biggest jobs — nothing else');
    await tick(60); app.stop();
    const before = { storage: storageSnap(app), w: srv.writes().length };
    const cs = app.state().cloudStore;
    t.eq(app.state().view, 'cloudStorage', 'the page opens');
    t.eq(cs.org, BIG, '…for Big Co');
    t.ok(cs.ok, '…and reads');
    t.ok(srv.rpcs('business_biggest_jobs').some(c => c.body && c.body.o === BIG && c.body.lim === 10), 'its biggest jobs read, ten');
    t.ok(srv.rpcs('business_people').length > 0, 'its people’s names read');
    const h = html(app);
    t.includes(h, 'Big Co · everyone', 'the business named under the title');
    const rows = srv.expect.biz(BIG);
    const total = rows.reduce((a, r) => a + r.job_bytes + r.photo_bytes, 0);
    t.includes(h, `<strong>about ${bytes(app, total)}</strong>`, 'its total');
    // People: biggest first, You / a name / a leaver.
    const m = app.fn('cloudStoreModel')();
    t.deepEq(m.people.map(p => p.user), rows.slice().sort((a, b) => (b.job_bytes + b.photo_bytes) - (a.job_bytes + a.photo_bytes)).map(r => r.user_id), 'a line per person, biggest first');
    t.includes(h, '<span class="cs-person-name">You</span>', 'you');
    t.includes(h, '<span class="cs-person-name">Eddie</span>', 'a member by name');
    t.includes(h, '<span class="cs-person-name">Lee Smith · left</span>', 'a leaver by the job they logged, marked left');
    const ed = rows.find(r => r.user_id === ED);
    t.includes(h, `${pl(ed.jobs, 'job')} · ${pl(ed.photos, 'photo')}`, 'each with their jobs and photos');
    // Biggest jobs, by person.
    const top = srv.expect.top(BIG, 10);
    t.deepEq(m.rows.map(r => r.key), top.map(j => j.user_id + '|' + j.id), 'biggest jobs, biggest first, keyed by person and id');
    t.includes(h, 'data-action="cs-look" data-arg="' + ED + '|ZZSAME"', 'Eddie’s job of the same id as yours is his own row');
    t.includes(h, 'data-action="cs-look" data-arg="' + O.id + '|ZZSAME"', '…and yours is yours');
    t.includes(h, '>Lee Smith · left</span>', 'the leaver’s job named');
    t.excludes(h, 'ZZ Eddie Private', 'never a job of another business');
    // Look only.
    t.excludes(h, 'data-action="cs-select-toggle"', 'no Select');
    t.excludes(h, 'data-action="cs-delete"', 'no Delete');
    t.excludes(h, 'data-action="cs-photos"', 'no Manage Photos (that is this phone’s own)');
    app.run('cloudStoreToggleSelecting()');
    t.notOk(app.state().cloudStore.selecting, 'Select can’t be switched on even if called');
    app.run(`state.cloudStore.selecting = true; state.cloudStore.selected = { ${J('ZZSAME')}: true }; cloudStoreDeleteSelected();`);
    t.eq(srv.writes().length, before.w, 'Delete does nothing even if called');
    app.run('state.cloudStore.selecting = false; state.cloudStore.selected = {};');
    // A tap opens the job look-only, read by its person.
    tap(app, 'cs-look', ED + '|ZZSAME');
    await until(() => app.state().cloudLook && !app.state().cloudLook.loading);
    const look = app.state().cloudLook;
    t.eq(look.user, ED, 'the look reads Eddie’s job — by his id');
    t.eq(look.org, BIG, '…in Big Co');
    t.eq(look.from, 'store', '…opened from Cloud Storage');
    t.ok(look.doc && look.doc.site === 'ZZ Eddie Same', 'his job, not yours of the same id');
    const body = app.doc.getElementById('cloud-look-body').innerHTML;
    t.includes(body, 'Show photos (4)', 'Show photos is there');
    t.includes(body, 'By <strong>Eddie</strong>', 'named');
    t.eq(app.doc.getElementById('cloud-look-bring'), null, 'not yours: nothing to bring onto this phone');
    app.doc.getElementById('cloud-look-close').click();
    tap(app, 'cs-look', O.id + '|ZZO1');
    await until(() => app.state().cloudLook && !app.state().cloudLook.loading);
    t.ok(app.doc.getElementById('cloud-look-bring'), 'your own: Bring onto this phone is there');
    app.doc.getElementById('cloud-look-close').click();
    tap(app, 'cs-look', 'nobody|nothing');
    t.eq(app.state().cloudLook, null, 'a key not on the page opens nothing');
    // Only a look.
    { const a = JSON.parse(before.storage), b = JSON.parse(storageSnap(app));
      const diff = Object.keys(Object.assign({}, a, b)).filter(k => a[k] !== b[k]);
      t.deepEq(diff, [], 'nothing stored — every key byte for byte'); }
    t.eq(srv.writes().length, before.w, 'nothing sent');
    // Settings' summary is the account's own, never a business's.
    t.includes(read('render-settings.js'), 'if (cs && cs.ok && !cs.org && typeof cloudBytesText', 'Settings → Data shows your own figures only');
    // Back to the Cloud tab.
    tap(app, 'cs-back');
    t.eq(app.state().view, 'sessions', 'Back: the Jobs screen');
    t.eq(app.state().jobsTab, 'cloud', '…on the Cloud tab');
  });

  /* ------------------------------------------------------------------ 105d */
  await t.group('105d — when it can’t: no SQL (named), no signal, no longer allowed (5A), and Back', async () => {
    const srv = cloud({ noSql: true });
    const app = phone(srv);
    await openCloud(app);
    await openBig(app);
    await openStore(app, BIG);
    let h = html(app);
    t.includes(h, 'The cloud needs a small update before it can show a business’s sizes.', 'no V166 SQL: said');
    t.includes(h, '(the V166 database update)', '…naming the update');
    t.includes(h, 'data-action="cs-refresh"', '…and it can be tried again');
    // No signal.
    srv.noSql = false;
    app.run('navigator.onLine = false');
    app.run('cloudStoreLoad()');
    t.includes(html(app), 'No signal', 'no signal: said');
    app.run('navigator.onLine = true');
    app.run('cloudStoreLoad()');
    await until(() => !app.state().cloudStore.loading);
    t.ok(app.state().cloudStore.ok, 'connected again: read');
    // Changed to an Engineer: the business's figures go at once, and aren't read.
    const before = srv.rpcs('business_storage').length;
    app.run(`localStorage.setItem('pat:businesses', ${J(J({ u: O.id, at: Date.now(), list: [{ id: BIG, name: 'Big Co', role: 'engineer', def: true, n: 3 }] }))})`);
    app.run('cloudStoreLoad()');
    h = html(app);
    t.includes(h, 'You can’t see this business’s figures any more.', 'no longer allowed: said');
    t.excludes(h, 'cs-people', '…nothing of the business shown');
    t.excludes(h, 'data-action="cs-refresh"', '…and no Try again');
    t.eq(srv.rpcs('business_storage').length, before, '…and nothing read');
    app.run(`state.cloudStore.ok = true`);
    tap(app, 'cs-look', ED + '|ZZSAME');
    t.notOk(app.state().cloudLook, 'no look from a business no longer allowed');
    // The page can't be opened for a business not offered: it is your own.
    const a2 = phone(cloud());
    a2.run('state.view = "sessions"; render();');
    tap(a2, 'cs-open', TWO);
    t.eq(a2.state().cloudStore.org, '', 'a business you are an Engineer in: your own page instead');
    tap(a2, 'cs-back');
    tap(a2, 'cs-open', ONE);
    t.eq(a2.state().cloudStore.org, '', 'a business of one: your own page');
    tap(a2, 'cs-back');
    t.eq(a2.state().view, 'sessions', 'Back');
  });

  /* ------------------------------------------------------------------ 105e */
  await t.group('105e — the SQL: schema.sql in step; the reader’s own rights; who it answers for; K1–K4; isolation 31a–31c', () => {
    const mig = read('supabase/v166-storage.sql');
    const end = '-- ================================================================ end V166\n';
    const block = mig.slice(mig.indexOf('-- ================================================================ V166\n'), mig.indexOf(end) + end.length);
    t.ok(block.length > 3000, 'the migration has its definitions');
    // V167: no longer the LAST section (V167's follows — 106e); still whole, and
    // nothing after it redefines the three.
    const sch = read('supabase/schema.sql');
    t.ok(sch.includes(block), 'a new project gets them byte for byte');
    const after = sch.slice(sch.indexOf(block) + block.length);
    for (const f of ['my_storage', 'business_storage', 'business_biggest_jobs']) t.excludes(after, 'function public.' + f + '(', '…and no later section redefines ' + f);
    t.eq((block.match(/language sql stable security invoker set search_path = '' as \$\$/g) || []).length, 3, 'all three run with the reader’s own rights, a pinned search path');
    t.excludes(block, 'security definer', '…none with more');
    t.includes(block, "  where public.can_read_org(o)\n  order by 1", 'a business’s lines only for one the caller may read whole');
    t.includes(block, "where s.org_id = o and s.deleted = false and public.can_read_org(o)", '…and its biggest jobs');
    t.includes(block, "  where (select auth.uid()) is not null\n$$;", 'your own: nothing when signed out');
    t.includes(block, 'limit least(greatest(coalesce(lim, 10), 1), 50)', 'at most fifty');
    t.includes(block, "where ph.org_id = o and ph.deleted = false", 'a business’s photos by the business, live only');
    for (const f of ['my_storage()', 'business_storage(uuid)', 'business_biggest_jobs(uuid, integer)']) {
      t.includes(block, `revoke all on function public.${f} from public, anon;`, f + ': nobody signed out');
    }
    for (const n of ['1', '2', '3', '4']) t.includes(mig, `select ${n}, '`, 'self-check K' + n);
    const iso = read('supabase/isolation-test.sql');
    for (const g of ['31a', '31b', '31c']) t.includes(iso, `res := res || array['${g}|`, 'isolation ' + g);
    t.includes(iso, "31a|A sees what A''s business stores, B''s line and job included|FAIL|run supabase/v166-storage.sql first", '…31a names the file when it hasn’t been run');
  });

  /* ------------------------------------------------------------------ 105f */
  // V167: the release checks moved to 106f; this keeps V166's own About line.
  await t.group('105f — V166’s About line; sync.js names V166', () => {
    t.includes(read('render-help.js'), 'How much is in the cloud, at a glance: the cloud tab shows your jobs', 'About: V166’s line');
    t.includes(read('sync.js'), 'V166 (1A 2A 3A 5A): how much is stored', 'sync.js names V166');
  });
};
