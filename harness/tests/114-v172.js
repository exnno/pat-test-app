/* Standing test — V172: Recently deleted; the Owner deletes a business's job.
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   Round R83 (19 Nov, Peter — "1A 2C 3B 4A 5A 6A+B 7A", then "0 defaults, 8A 9B 10A
   11A 12 both"): a job deleted from the cloud waits in Recently deleted for 30 days
   (6B) — the Owner puts it back (10A) or deletes it for good sooner (11A) — then it
   is gone with its photos (5A). Every delete from the Cloud tab and Cloud Storage
   goes this way, solo too (8A); a phone's own Delete job is unchanged (9B). The
   Owner deletes any job in the business from the look-only job (2C 7A — a Team
   leader's or the Office's request is V173), locked or not (3B — a stronger
   warning); the engineer's phone takes it off at its next sync (4A), says who
   (O-e), and sends any unsent work into the kept copy first (O-d); a restore
   brings it back like any job from the cloud (O-g). The way in: the Cloud tab and
   Cloud Storage (12 — both).

     114a  THE PULL (4A O-e). A clean copy of a job deleted into Recently deleted
           comes off the phone with no session tombstone and no "gone" mark (which
           would delete its photo files), nothing asked; the phone says who; the
           Sync line says so. An ordinary delete is unchanged (tombstone, gone).
     114b  UNSENT WORK (O-d). A copy with work the cloud hasn't got: no question;
           the push sends it (into the kept copy — the stand-in's bin_catch), the
           row stays deleted, the next run takes it off. Open on screen: it waits.
     114c  PUT BACK (O-g). The restored row comes back onto the phone like any job
           from the cloud — no "deleted here" question; an old job stays in the
           cloud (the V93 window).
     114d  THE OWNER'S DELETE (2C 3B 6A 7A). Olive (Owner) on Eddie's job: Delete this
           job…; the sheet names it, Eddie, items, photos, the certificate (word
           needed), Recently deleted for 30 days; an unlocked job warns; bin_job with
           exactly holder / job / org; it leaves the lists; a toast. Office / Team
           leader / an Engineer: no button and the action does nothing. Your own job
           only in the cloud: Delete through syncCloudDelete; on this phone: none.
           Each refusal said; no V172 SQL said.
     114e  RECENTLY DELETED (6B 10A 11A 12). From the Cloud tab (only when something
           is in it, with the count) and Cloud Storage (always); the page lists
           each job — who deleted it, when, days left; Put back → bin_restore; Delete
           now → asked → bin_forget; refusals said; no V172 SQL hides the links;
           Back returns where it came from; nothing stored.
     114f  SAFETY. syncBinJob refuses bad ids before the cloud; odd list rows left
           out; names and sites escaped.
     114g  bin-files (the Edge Function): what is due, deleted in batches, marked
           done; a failed delete waits for the next call; POST only.
     114h  the SQL in step (schema.sql's last section; K1–K6; isolation 37a–37c);
           the app calls each function with exactly its arguments.
     114j  release: V172; cache pat-v172; What's new one line; About V172 / V171 /
           V170 (V169 rolled off).

   ⚠ WHAT THIS FILE CANNOT PROVE: the database's rules. The stand-ins here follow
   the SQL; the SQL itself was proved in a real Postgres (PGlite + a Supabase
   stand-in, the whole schema.sql and the migration on the V171 schema, twice:
   64 checks, every role, signed out, anon; eleven broken copies each caught;
   isolation 37a–37c there too). The Edge Function's real Storage call is the
   handoff's live test. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { tick, freshApp } = require('../fixture');
const D = require('./44-cloud-delete.js').kit;
const K = require('./103-v164.js').kit;
const { O, ED, BIG, ONE, TWO, tap, openCloud, openBig, until, json } = K;

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const J = JSON.stringify;
const ymd = (d) => d.toISOString().slice(0, 10);
const recent = () => ymd(new Date(Date.now() - 3 * 86400000));

// ---- 44's stand-in (one account, its own jobs): the pull ----------------------------
// The marker bin_job leaves (V172 SQL): deleted, the doc only who deleted it.
function binRow(app, id, by, role) {
  const r = app.srv.row(id);
  app.srv.bins.push({ n: app.srv.bins.length + 1, user_id: r.user_id, id: String(id), doc: r.doc, fp: r.fp, photos: [] });
  Object.assign(r, { deleted: true, fp: null, doc: { binnedAt: '2026-11-19T10:00:00.000Z', binnedBy: by, binnedRole: role }, updated_at: app.srv.stamp() });
}
// bin_restore, as the SQL: the kept doc and fp back, live.
function restoreRow(app, id) {
  const b = app.srv.bin(id);
  b.restored = true;
  Object.assign(app.srv.row(id), { deleted: false, doc: b.doc, fp: b.fp, updated_at: app.srv.stamp() });
}
const held = (app) => app.fn('_syncHeldLoad')();
const jobCalls = (srv) => srv.binCalls.filter(c => c.fn === 'bin_job');
const pushedFor = (app, id) => app.srv.calls.filter(c => c.method === 'POST' && c.url.includes('/rest/v1/sessions')
  && Array.isArray(c.body) && c.body.some(r => String(r.id) === String(id)));

// ---- 103's stand-in (Olive, Owner of Big Co) + the bin functions ---------------------
function cloud() {
  const srv = K.cloud();
  K.seedBig(srv);
  srv.add(ED, BIG, 'ZZBL', { site: 'ZZ Locked Site', date: '2026-11-15', engineer: 'Ed W', locked: true, certNo: 'BC-2026-009',
    items: [{ id: 'l1', result: 'pass' }, { id: 'l2', result: 'fail' }] });
  srv.photos.push({ user_id: ED, session_id: 'ZZBL' }, { user_id: ED, session_id: 'ZZBL' });
  srv.binCalls = [];
  srv.binRows = [];
  srv.refuse = '';   // a patgo_bin_ code to answer with
  srv.noV172 = false;
  const base = srv.fetchImpl;
  const no = (code) => json({ code: 'P0001', message: 'patgo_bin_' + code, details: null, hint: null }, 400);
  srv.fetchImpl = async (url, init = {}) => {
    const p = String(url).split('?')[0].replace(/^https:\/\/[^/]+/, '');
    const m = /^\/rest\/v1\/rpc\/(bin_job|bin_list|bin_restore|bin_forget)$/.exec(p);
    if (!m) return base(url, init);
    let b = null; try { b = init.body ? JSON.parse(init.body) : null; } catch { b = null; }
    srv.binCalls.push({ fn: m[1], body: b });
    srv.calls.push({ path: p, qs: '', method: 'POST', body: b });
    if (srv.noV172) return json({ code: 'PGRST202', message: `Could not find the function public.${m[1]} in the schema cache`, details: null, hint: null }, 404);
    if (srv.refuse) return no(srv.refuse);
    if (m[1] === 'bin_job') {
      const row = srv.sessions.find(s => s.user_id === b.holder && s.id === b.job);
      if (!row || row.deleted) return no('gone');
      if (b.org && row.org_id !== b.org) return no('moved');
      row.deleted = true;
      return json({ photos: srv.photos.filter(x => x.user_id === b.holder && x.session_id === b.job).length, at: '2026-11-19T10:00:00.000Z' });
    }
    if (m[1] === 'bin_list') return json(srv.binRows);
    if (m[1] === 'bin_restore' || m[1] === 'bin_forget') {
      const i = srv.binRows.findIndex(r => r.n === b.entry);
      if (i === -1) return no('gone');
      srv.binRows.splice(i, 1);
      return json(m[1] === 'bin_forget' ? { photos: 1 } : { user: ED, id: 'x' });
    }
    return json(null);
  };
  return srv;
}
const binEntry = (n, o) => Object.assign({ n, user_id: ED, id: 'ZZB' + n, org_id: BIG, org_name: 'Big Co', site: 'ZZ Binned ' + n,
  name: '', job_date: '2026-11-0' + (n % 9 + 1), engineer: 'Eddie', items: 3, fails: 1, photos: 2, cert_no: null, locked: true,
  binned_at: '2026-11-18T10:00:00+00:00', binned_name: 'Olive', binned_role: 'owner', by_you: true,
  purge_at: new Date(Date.now() + 12 * 86400000 - 3600000).toISOString() }, o || {});
async function lookAt(app, key) {
  tap(app, 'cloud-tap', key);
  await until(() => app.state().cloudLook && !app.state().cloudLook.loading);
}
const lookBody = (app) => (app.doc.getElementById('cloud-look-body') || { innerHTML: '' }).innerHTML;
function clickLook(app, what) {
  const el = app.doc.createElement('button'); el.dataset.look = what;
  app.doc.getElementById('cloud-look-body').dispatchEvent({ type: 'click', target: el, defaultPrevented: false, preventDefault() {}, stopPropagation() {} });
}
const sheetHTML = (app) => { const s = app.doc.querySelectorAll('.bulk-sheet'); return s.length ? s[s.length - 1].innerHTML : ''; };
function typeWord(app, word) {
  const inp = app.doc.getElementById('cloud-del-input');
  inp.value = word;
  inp.dispatchEvent({ type: 'input', target: inp, preventDefault() {}, stopPropagation() {} });
}
const html = (app) => app.doc.getElementById('app').innerHTML;
const storageSnap = (app) => { const o = {}; for (let i = 0; i < app.storage.length; i++) { const k = app.storage.key(i); o[k] = app.storage.getItem(k); } return J(o); };

module.exports = async function () {
  /* ------------------------------------------------------------------ 114a */
  await t.group('114a — the pull: a clean copy deleted into Recently deleted comes off, no tombstone, no gone mark, nothing asked; the phone says who (4A O-e)', async () => {
    const app = await D.signedIn();
    const id = D.plainJob(app, 'ZZBINNED'); D.away(app);
    const other = D.plainJob(app, 'ZZPLAIN'); D.away(app);
    await D.run(app);
    t.ok(!!D.syncState(app).sent[id], 'set-up: sent');
    binRow(app, id, 'Olive', 'owner');
    // An ordinary delete (another phone's tombstone) beside it — unchanged.
    Object.assign(app.srv.row(other), { deleted: true, doc: {}, fp: null, updated_at: app.srv.stamp() });
    app.toasts.length = 0;
    const res = await D.run(app);
    t.notOk(D.onPhone(app, id), 'the binned job is off the phone');
    t.notOk(D.tombs(app, 'session').includes(id), '…with no session tombstone (a restore must come back as new)');
    t.notOk(!!D.syncState(app).gone[id], '…and no gone mark (the photo half would delete its files)');
    t.notOk(!!D.syncState(app).sent[id], '…and forgotten as sent');
    t.eq(held(app).length, 0, 'nothing asked');
    t.ok(app.toasts.some(x => /“.*ZZBINNED.*” removed from this phone — deleted from the cloud by Olive \(Owner\)/.test(x)), 'the phone says who deleted it (O-e)');
    t.notOk(D.onPhone(app, other), 'control: the ordinary delete comes off too');
    t.ok(D.tombs(app, 'session').includes(other) && !!D.syncState(app).gone[other], 'control: …with its tombstone and gone mark, as before');
    t.ok(res, 'the run went');
    const line = String(app.state().sync.message || '');
    t.eq(line, 'Removed 1 job deleted on your other device, removed 1 job deleted from the cloud by Olive (Owner).', 'the Sync line: the ordinary one, then the binned one and who');
    t.eq(app.fn('syncBinByText')([{ by: 'Olive', role: 'owner' }, { by: 'Cath', role: 'office' }, { by: 'Olive', role: 'owner' }]),
      'deleted from the cloud by Olive (Owner) and Cath (Office)', 'two people named once each');
  });

  /* ------------------------------------------------------------------ 114b */
  await t.group('114b — unsent work: no question, it is sent into the kept copy, the row stays deleted, the next run takes the job off (O-d)', async () => {
    const app = await D.signedIn();
    const id = D.plainJob(app, 'ZZLATE'); D.away(app);
    await D.run(app);
    binRow(app, id, 'Olive', 'owner');
    app.run(`(() => { const s = state.sessions.find(x => x.id === ${J(id)});
      s.items = s.items.concat([Object.assign({}, s.items[0], { id: 'ZZLATE2', assetNo: 'ZZLATE2' })]); state.sessions = state.sessions.slice(); })()`);
    const before = pushedFor(app, id).length;
    await D.run(app);
    t.eq(held(app).length, 0, 'nothing asked');
    t.ok(pushedFor(app, id).length > before, 'the push sent it');
    t.eq(app.srv.bin(id).doc.items.length, 2, 'the kept copy has the late item');
    t.eq(app.srv.row(id).deleted, true, 'the row stays deleted');
    t.ok(D.onPhone(app, id), 'still here after that run');
    await D.run(app);
    t.notOk(D.onPhone(app, id), 'the next run takes it off — nothing lost');
    t.notOk(D.tombs(app, 'session').includes(id), '…with no tombstone');

    // Open on screen: the delete waits for the engineer to leave the job.
    const open = D.plainJob(app, 'ZZOPEN');
    app.run(`state.activeId = ${J(open)}; state.view = 'entry';`);
    await D.run(app);
    binRow(app, open, 'Olive', 'owner');
    await D.run(app);
    t.ok(D.onPhone(app, open), 'on screen: it stays while the engineer is on it');
    D.away(app);
    await D.run(app);
    t.notOk(D.onPhone(app, open), 'left: it goes');
  });

  /* ------------------------------------------------------------------ 114c */
  await t.group('114c — put back: the job comes back onto the phone like any job from the cloud, nothing asked; an old one stays in the cloud (O-g)', async () => {
    const app = await D.signedIn();
    const id = D.plainJob(app, 'ZZBACK'); D.away(app);
    app.run(`state.sessions.find(x => x.id === ${J(id)}).date = ${J(recent())}`);
    await D.run(app);
    binRow(app, id, 'Olive', 'owner');
    await D.run(app);
    t.notOk(D.onPhone(app, id), 'set-up: taken off');
    restoreRow(app, id);
    await D.run(app);
    t.ok(D.onPhone(app, id), 'restored: back on the phone');
    t.eq(held(app).length, 0, 'nothing asked (no "deleted here")');
    t.eq(app.state().sessions.find(s => s.id === id).site, 'ZZCANARYCLIENT — ZZBACK', 'the job as it was');
    // An old job (outside the window) restored stays in the cloud.
    D.seed(app, 'ZZOLDB');
    await D.run(app);
    binRow(app, 'ZZOLDB', 'Olive', 'owner');
    await D.run(app);
    restoreRow(app, 'ZZOLDB');
    await D.run(app);
    t.notOk(D.onPhone(app, 'ZZOLDB'), 'an old job restored stays in the cloud (V93 window)');
    t.eq(held(app).length, 0, '…nothing asked');
  });

  /* ------------------------------------------------------------------ 114d */
  await t.group('114d — the Owner deletes a business job from the look-only job: the sheet, the call, the lists; nobody else can (2C 3B 6A 7A)', async () => {
    const srv = cloud();
    const app = K.phone(srv);
    await openCloud(app);
    await openBig(app);
    // A locked job with a certificate and photos.
    await lookAt(app, ED + '|ZZBL');
    t.includes(lookBody(app), 'id="cloud-bin-btn"', 'Delete this job… at the foot of the look');
    t.includes(lookBody(app), 'Recently deleted for 30 days', '…saying where it goes');
    clickLook(app, 'bin');
    let sh = sheetHTML(app);
    t.includes(sh, 'ZZ Locked Site', 'the sheet names the job');
    t.includes(sh, 'Engineer: Eddie', '…the engineer');
    t.includes(sh, '2 items', '…its items');
    t.includes(sh, '2 photos', '…its photos');
    t.includes(sh, 'Certificate BC-2026-009', '…its certificate');
    t.includes(sh, 'Recently deleted for 30 days', '…where it goes');
    t.excludes(sh, 'cloud-del-open', 'locked: no "still being worked on" warning');
    t.includes(sh, 'cloud-del-input', 'a certificate: the word is needed');
    app.doc.getElementById('cloud-del-yes').click();
    await tick(10);
    t.eq(jobCalls(srv).length, 0, 'no word, nothing sent');
    typeWord(app, 'DELETE');
    app.doc.getElementById('cloud-del-yes').click();
    await until(() => jobCalls(srv).length && !app.state().cloudLook);
    t.eq(J(jobCalls(srv).map(c => c.body)), J([{ holder: ED, job: 'ZZBL', org: BIG }]), 'bin_job with exactly holder, job and business');
    t.eq(app.state().cloudLook, null, 'the look closes');
    t.notOk(app.state().cloudJobs.biz.jobs.some(j => j.id === 'ZZBL'), 'it leaves the business list');
    t.ok(app.toasts.some(x => /in Recently deleted for 30 days/.test(x)), 'a toast says where it went');

    // An unlocked job: the stronger warning (3B), no word for a plain job.
    await lookAt(app, ED + '|ZZE1');
    clickLook(app, 'bin');
    sh = sheetHTML(app);
    t.includes(sh, 'id="cloud-del-open"', 'unlocked: the warning');
    t.includes(sh, 'Eddie may still be working on it', '…naming who');
    t.includes(sh, 'kept with the deleted job', '…and that unsent work is kept');
    t.excludes(sh, 'cloud-del-input', 'no word for an unlocked job with no certificate');
    srv.refuse = 'not_allowed';
    app.doc.getElementById('cloud-del-yes').click();
    await until(() => app.toasts.some(x => /Only the business owner/.test(x)));
    t.ok(app.toasts.some(x => /Only the business owner can delete this job/.test(x)), 'a refusal is said');
    t.ok(app.state().cloudJobs.biz.jobs.some(j => j.id === 'ZZE1'), '…and the job stays listed');
    srv.refuse = '';
    srv.noV172 = true;
    clickLook(app, 'bin');
    app.doc.getElementById('cloud-del-yes').click();
    await until(() => app.toasts.some(x => /V172 database update/.test(x)));
    t.ok(app.toasts.some(x => /The cloud needs updating before jobs can go to Recently deleted/.test(x)), 'no V172 SQL: said, nothing deleted');
    srv.noV172 = false;
    app.run('cloudLookClose()');

    // Your own job held only in the cloud: through syncCloudDelete (this phone's bookkeeping too).
    tap(app, 'cloud-scope', 'mine');
    K.pick(app, 'mine');
    await until(() => app.state().cloudJobs.ok);
    await lookAt(app, 'ZZO1');
    await until(() => app.state().cloudLook && app.state().cloudLook.jobOrg);
    t.includes(lookBody(app), 'id="cloud-bin-btn"', 'your own cloud-only job: Delete too');
    clickLook(app, 'bin');
    srv.binCalls.length = 0;
    app.doc.getElementById('cloud-del-yes').click();
    await until(() => jobCalls(srv).length);
    await until(() => !app.run('_syncRunning'));
    t.eq(J(jobCalls(srv).map(c => c.body)), J([{ holder: O.id, job: 'ZZO1', org: null }]), '…as your own (holder you, through syncCloudDelete)');

    // Not the Owner: no button, and the action does nothing.
    for (const role of ['office', 'team_leader', 'engineer']) {
      const s2 = cloud();
      const a2 = K.phone(s2, [{ id: BIG, name: 'Big Co', role, def: true, n: 3 }, { id: ONE, name: 'One Ltd', role: 'owner', def: false, n: 1 }]);
      a2.run('cloudLookOpen = cloudLookOpen');
      await openCloud(a2);
      if (role !== 'engineer') {
        await openBig(a2);
        await lookAt(a2, ED + '|ZZBL');
        t.excludes(lookBody(a2), 'cloud-bin-btn', `${role}: no Delete on someone else’s job (V173: a request)`);
        a2.run('cloudLookDelete()');
        await tick(20);
        t.excludes(sheetHTML(a2), 'cloud-del-yes', `${role}: the action opens nothing`);
        const yes = a2.doc.getElementById('cloud-del-yes');
        if (yes) { yes.click(); await tick(30); }
        t.eq(jobCalls(s2).length, 0, `${role}: the action does nothing`);
      } else {
        await lookAt(a2, 'ZZO1');
        await until(() => a2.state().cloudLook && a2.state().cloudLook.jobOrg);
        t.eq(J(a2.fn('cloudLookBinState')(a2.state().cloudLook)), J({ show: false, can: false, own: false, why: '' }), 'an Engineer in a team: not even their own team job');
      }
    }
    // A business of one: your own job there.
    const s3 = cloud();
    const a3 = K.phone(s3);
    await openCloud(a3);
    await lookAt(a3, 'ZZONE');
    await until(() => a3.state().cloudLook && a3.state().cloudLook.jobOrg);
    t.ok(a3.fn('cloudLookBinState')(a3.state().cloudLook).can, 'a business of one: your own job, yes');
    // On this phone: not from here.
    const look = { row: { mine: true, onPhone: true }, doc: { items: [] }, jobOrg: BIG };
    t.eq(a3.fn('cloudLookBinState')(look).can, false, 'a job on this phone: not from the look (the phone tab deletes it)');
  });

  /* ------------------------------------------------------------------ 114e */
  await t.group('114e — Recently deleted: the way in, the page, Put back, Delete now; refusals; no V172 SQL hides it (6B 10A 11A 12)', async () => {
    const srv = cloud();
    const app = K.phone(srv);
    await openCloud(app);
    await until(() => app.state().binCount && app.state().binCount.ok);
    t.excludes(html(app), 'data-action="bin-open"', 'Cloud tab, nothing in it: no line (no clutter)');
    srv.binRows = [binEntry(1), binEntry(2, { user_id: O.id, by_you: false, binned_name: 'Cath', binned_role: 'office', cert_no: 'BC-1',
      site: 'Acme Ltd — <b>ZZ Esc</b>', purge_at: new Date(Date.now() + 3600000).toISOString() })];
    tap(app, 'cloud-refresh');
    await until(() => app.state().binCount.n === 2);
    app.run('render()');
    t.includes(html(app), 'data-action="bin-open"', 'with something in it: the line');
    t.includes(html(app), '<span class="bin-count">2</span>', '…with the count');
    tap(app, 'bin-open');
    await until(() => app.state().binList && app.state().binList.ok);
    t.eq(app.state().view, 'recentlyDeleted', 'the page opens');
    let h = html(app);
    t.includes(h, 'ZZ Binned 1', 'each job');
    t.includes(h, 'Eddie', 'whose job (not yours)');
    t.includes(h, 'Deleted by you', 'deleted by you');
    t.includes(h, 'Deleted by Cath (Office)', 'deleted by someone else, with the role');
    t.includes(h, '12 days left', 'days left');
    t.includes(h, 'goes for good within a day', 'the last day said');
    t.includes(h, '&lt;b&gt;ZZ Esc&lt;/b&gt;', 'names escaped');
    t.includes(h, 'Certificate BC-1', 'its certificate');
    const snap = storageSnap(app);
    t.notOk(/ZZ Binned|ZZB1|binList|binCount|bin_list/.test(snap), 'nothing of it stored on this phone (memory only)');
    let pushes = 0;
    const realPush = app.sandbox.syncPush;
    app.sandbox.syncPush = (o) => { if (o && o.pull) pushes++; return Promise.resolve(true); };
    tap(app, 'bin-restore', '1');
    await until(() => srv.binCalls.some(c => c.fn === 'bin_restore'));
    await until(() => !html(app).includes('ZZ Binned 1'));
    t.eq(J(srv.binCalls.filter(c => c.fn === 'bin_restore').map(c => c.body)), J([{ entry: 1 }]), 'Put back: bin_restore with exactly the entry');
    t.ok(app.toasts.some(x => /Put back — it’s in the cloud again\. Eddie’s phone takes it back/.test(x)), '…said, naming whose phone');
    t.eq(pushes, 1, '…and a reading run asked for, so a job of your own comes back here at once');
    app.sandbox.syncPush = realPush;
    // Delete now: asked first.
    const asked = [];
    app.sandbox.openConfirmSheet = (o) => asked.push(o);
    tap(app, 'bin-forget', '2');
    await tick(40);
    t.eq(asked.length, 1, 'Delete now asks first');
    t.includes(asked[0].message, 'deleted for good now, with its photos', '…saying what goes');
    t.eq(srv.binCalls.filter(c => c.fn === 'bin_forget').length, 0, '…nothing sent before yes');
    asked[0].onConfirm();
    await until(() => srv.binCalls.some(c => c.fn === 'bin_forget'));
    await until(() => html(app).includes('Nothing here'));
    t.eq(J(srv.binCalls.filter(c => c.fn === 'bin_forget').map(c => c.body)), J([{ entry: 2 }]), 'bin_forget with exactly the entry');
    t.ok(app.toasts.some(x => x === 'Deleted for good'), '…said');
    // Refusals.
    srv.binRows = [binEntry(3)];
    tap(app, 'bin-refresh');
    await until(() => html(app).includes('ZZ Binned 3'));
    srv.refuse = 'not_allowed';
    tap(app, 'bin-restore', '3');
    await until(() => app.toasts.some(x => /Only the business owner can put it back/.test(x)));
    t.includes(html(app), 'ZZ Binned 3', 'a refusal leaves it listed');
    srv.refuse = 'gone';
    tap(app, 'bin-restore', '3');
    await until(() => !html(app).includes('ZZ Binned 3'));
    t.ok(app.toasts.some(x => /isn’t in Recently deleted any more/.test(x)), 'gone: said…');
    t.excludes(html(app), 'ZZ Binned 3', '…and it leaves the list');
    srv.refuse = '';
    // Back returns to the Cloud tab.
    tap(app, 'bin-back');
    t.eq(app.state().view, 'sessions', 'Back: the Jobs screen it came from');
    // Cloud Storage: always there.
    tap(app, 'cs-open', 'mine');
    await tick(20);
    app.run('state.cloudStore.ok = true; render()');
    t.includes(html(app), 'id="bin-line" data-where="store"', 'Cloud Storage: the line, even with nothing in it');
    tap(app, 'bin-open');
    t.eq(app.state().binList.ret, 'cloudStorage', 'from Cloud Storage…');
    tap(app, 'bin-back');
    t.eq(app.state().view, 'cloudStorage', '…Back returns there');
    // No V172 SQL: the links hide, the page says why.
    srv.noV172 = true;
    app.run('binCountLoad(true)');
    await until(() => app.state().binCount.missing);
    app.run('render()');
    t.excludes(html(app), 'bin-line', 'no V172 SQL: no link');
    tap(app, 'bin-open');
    await until(() => app.state().binList && !app.state().binList.loading);
    t.includes(html(app), 'The cloud needs updating before jobs can go to Recently deleted', 'the page says why');
  });

  /* ------------------------------------------------------------------ 114f */
  await t.group('114f — safety: bad ids never reach the cloud; odd list rows left out', async () => {
    const srv = cloud();
    const app = K.phone(srv);
    for (const [h, id] of [['nope', 'ZZ1'], [ED, '../x'], [ED, '']]) {
      const r = await app.fn('syncBinJob')(h, id, BIG);
      t.eq(r.code, 'bad', `refused before the cloud: ${J([h, id])}`);
    }
    t.eq((await app.fn('syncBinJob')(ED, 'ZZBL', 'not-a-uuid')).code, 'bad', 'a bad business id too');
    t.eq((await app.fn('syncBinRestore')('x')).code, 'bad', 'restore: a bad entry');
    t.eq((await app.fn('syncBinForget')(-1)).code, 'bad', 'forget: a bad entry');
    t.eq(jobCalls(srv).length + srv.binCalls.filter(c => c.fn !== 'bin_job' && c.fn !== 'bin_list').length, 0, 'nothing sent');
    srv.binRows = [binEntry(1), binEntry(2, { user_id: 'bad' }), binEntry(3, { id: '../../x' }), binEntry(4, { n: 'x' }), null, 7];
    const r = await app.fn('syncBinList')();
    t.ok(r.ok, 'the list reads');
    t.eq(J(r.rows.map(x => x.n)), J([1]), 'only the well-formed row');
    t.eq(app.fn('binDaysLeft')(new Date(Date.now() - 5000).toISOString()), 0, 'days left never below 0');
    // Your own Cloud tab / Cloud Storage delete, on a cloud without the V172 SQL:
    // nothing deleted — never the old way — and said.
    srv.noV172 = true;
    const before = srv.calls.length;
    const cd = await app.fn('syncCloudDelete')(['ZZO1']);
    t.ok(cd.needsUpdate && !cd.deleted && !cd.ok, 'syncCloudDelete without V172: needsUpdate, nothing deleted');
    t.includes(cd.error, 'The cloud needs updating before jobs can go to Recently deleted', '…in words');
    t.eq(srv.calls.slice(before).filter(c => c.method === 'PATCH').length, 0, '…and no old-style update sent');
    srv.noV172 = false;
    t.eq(app.fn('binDaysLeft')('nonsense'), null, 'an unreadable date: no days');
  });

  /* ------------------------------------------------------------------ 114g */
  await t.group('114g — bin-files: what is due, deleted in batches, marked done; a failure waits; POST only', async () => {
    const mod = await import(path.join(APP_DIR, 'supabase', 'functions', 'bin-files', 'index.js'));
    const calls = [];
    let failOn = '';
    const due = [{ n: 7, paths: Array.from({ length: 150 }, (_, i) => 'u/p' + i + '.jpg') }, { n: 8, paths: ['u/bad.jpg'] }];
    const deps = {
      env: (k) => ({ SUPABASE_URL: 'https://abc.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'eyJzzz' })[k] || '',
      fetch: async (url, init) => {
        const body = init.body ? JSON.parse(init.body) : null;
        calls.push({ url, method: init.method, body, auth: init.headers.authorization });
        if (url.endsWith('/rpc/bin_files_due')) return new Response(JSON.stringify(due), { status: 200 });
        if (url.endsWith('/rpc/bin_files_done')) return new Response('1', { status: 200 });
        if (url.endsWith('/storage/v1/object/photos')) {
          if (failOn && body.prefixes.includes(failOn)) return new Response('no', { status: 500 });
          return new Response('[]', { status: 200 });
        }
        return new Response('?', { status: 404 });
      },
    };
    failOn = 'u/bad.jpg';
    const out = await mod.binFilesRun(deps);
    t.eq(J(out), J({ done: 1, failed: 1 }), 'one done, one waits');
    const dels = calls.filter(c => c.url.endsWith('/storage/v1/object/photos'));
    t.eq(J(dels.map(c => [c.method, c.body.prefixes.length])), J([['DELETE', 100], ['DELETE', 50], ['DELETE', 1]]), 'deleted in batches of 100, with Storage’s own call');
    t.eq(J(calls.find(c => c.url.endsWith('/rpc/bin_files_done')).body), J({ entries: [7] }), 'only the done one is marked');
    t.ok(calls.every(c => c.auth === 'Bearer eyJzzz'), 'the service key on every call');
    t.eq(calls[0].url, 'https://abc.supabase.co/rest/v1/rpc/bin_files_due', 'asks the database what is due first');
    const h = mod.makeBinFiles(deps);
    t.eq((await h(new Request('https://x/', { method: 'GET' }))).status, 405, 'POST only');
    const src = read('supabase/functions/bin-files/index.js');
    t.notOk(/^import /m.test(src), 'one file, no imports (pasted as it is)');
    t.includes(src, '(c) 2026 Peter Birchley. All rights reserved.', 'copyright');
  });

  /* ------------------------------------------------------------------ 114h */
  await t.group('114h — the SQL in step; K1–K6; isolation 37a–37c; the calls', () => {
    const mig = read('supabase/v172-recently-deleted.sql');
    const end = '-- ================================================================ end V172\n';
    const block = mig.slice(mig.indexOf('-- ================================================================ V172\n'), mig.indexOf(end) + end.length);
    t.ok(block.length > 8000, 'the migration has its definitions');
    t.ok(read('supabase/schema.sql').trimEnd().endsWith(block.trimEnd()), 'a new project gets them byte for byte, as schema.sql’s last section');
    t.includes(block, "  elsif s.org_id is null or coalesce(public.my_role(s.org_id), '') <> 'owner' then", 'someone else’s job: the Owner only (V172)');
    t.includes(block, "    if not public.can_wipe(s.org_id) then raise exception 'patgo_bin_not_allowed'; end if;", 'your own: the cloud’s delete rule');
    t.includes(block, "  select coalesce(public.my_role(o) = 'owner', false)", 'restore and delete for good: the Owner (10A 11A)');
    t.includes(block, '  if old.deleted and not new.deleted and public._bin_live(old.user_id, old.id) then', 'a push can’t bring it back (O-d)');
    t.includes(block, "  using (bucket_id <> 'photos' or not (select public.photo_file_binned(name)));", 'its files can’t be deleted while it waits');
    t.includes(block, "select cron.schedule('patgo-bin', '23 * * * *', 'select public.bin_purge()');", 'gone by itself after 30 days, checked hourly');
    t.includes(block, "  purge_at       timestamptz not null default now() + interval '30 days',", '30 days');
    t.includes(block, 'grant execute on function public.bin_files_due() to service_role;', 'the Edge Function’s calls: the service key only');
    for (let n = 1; n <= 6; n++) t.ok(new RegExp('^select ' + n + ", '", 'm').test(mig), `self-check K${n}`);
    const iso = read('supabase/isolation-test.sql');
    for (const k of ['37a', '37b', '37c']) t.includes(iso, `['${k}|`, `isolation ${k}`);
    const sync = read('sync.js');
    t.includes(sync, "    .then((c) => c.rpc('bin_job', { holder: u, job: sid, org: o || null }))", 'the app calls bin_job with exactly its arguments');
    t.includes(sync, "        return c.rpc('bin_job', { holder: uid, job: id, org: null }).then((r) => {", '…and for your own (the Cloud tab and Cloud Storage delete)');
    t.includes(sync, "    .then((c) => c.rpc(fn, { entry: k }))", 'bin_restore / bin_forget with exactly the entry');
    t.includes(sync, "const _SYNC_JOB_BIN_PICKS = 'binBy:doc->>binnedBy,binRole:doc->>binnedRole';", 'the pull reads who from the marker’s doc (no new column)');
    t.notOk(/\.from\('job_bin'\)/.test(sync), 'the app never reads the table itself');
  });

  /* ------------------------------------------------------------------ 114j */
  await t.group('114j — release: V172, cache pat-v172, What’s new one line, About V172 / V171 / V170', () => {
    const rel = freshApp();
    t.eq(rel.run('APP_VERSION'), 'V172', 'APP_VERSION V172');
    t.eq(rel.run('WELCOME_VERSION'), 'V172', 'What’s new rolled (a feature release)');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v172';", 'cache key pat-v172');
    const core = read('render-core.js');
    const at = core.indexOf('<ul class="welcome-list sheet-scroll">');
    const sheetCopy = core.slice(at, core.indexOf('</ul>', at));
    t.eq((sheetCopy.match(/<li>/g) || []).length, 1, 'What’s new: one line');
    t.includes(sheetCopy, '<li><strong>Recently deleted.</strong>', '…Recently deleted');
    const help = read('render-help.js');
    const x = help.indexOf('<p><strong>V172</strong>'), y = help.indexOf('<p><strong>V171</strong>'), z = help.indexOf('<p><strong>V170</strong>');
    t.ok(x > -1 && y > x && z > y, 'About: V172, V171, V170');
    t.eq((help.match(/<p><strong>V\d+<\/strong> &middot;/g) || []).length, 3, 'About: three versions');
    t.excludes(help, '<p><strong>V169</strong>', 'V169 rolled off');
    t.includes(help, 'Recently deleted: a job deleted from the cloud waits there for 30 days', 'About: V172’s line');
    t.includes(help, 'The business&rsquo;s certificate: in a business with more than one person', 'About: V170’s line, the oldest');
  });
};
