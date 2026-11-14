/* Standing test — V167.1 hotfix: correcting your OWN job in the cloud (Peter, 14 Nov — 1A 2A 3A 4A)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   Peter's live test of V167: "I can correct someone else's job but not my own that
   exists in the cloud." V167 had left your own jobs to your phone — no good for a
   job only in the cloud, or for the office on a computer. A hotfix (4A): the cache
   key only; APP_VERSION, What's new and About stay V167's.

     107a  WHO (1A). Your own LOCKED job: Correct, in the business view AND Your jobs
           (2A), for the Owner / Team leader / Office of the business the cloud says
           it's in — a solo owner's too (a business of one is never a picker choice).
           An Engineer's own job (Other Co): no Correct. Open: lock it first.
     107b  SAVING YOUR OWN. One rpc naming you and the job's own business; the trail;
           the toast; on this phone (3A) a sync is started so it lands; Your jobs'
           row follows. The same rules (a reason for a result).
     107c  A cloud still on V167's function (refuses `own`): said in the sheet, naming
           the database update to run again.
     107d  the SQL: no own refusal; C3 checks it's in; schema.sql in step; the cache
           key pat-v167-1 (V167.1), APP_VERSION still V167.

   ⚠ The database rule itself was proved in a real Postgres (PGlite + the stand-in,
   the whole schema.sql: 68 checks incl. the Owner's own, a solo owner's own, an
   Engineer's own refused, your own named in the wrong business; twelve broken copies
   each caught). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { tick, freshApp } = require('../fixture');
const K3 = require('./103-v164.js').kit;
const K = require('./106-v167.js').kit;
const { O, BIG, TWO, ONE, tap, pick, openCloud, openBig, until } = K3;
const { body, lookTap, lookAt, ready, fill, fillFrom, save, sheetErr } = K;
const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');

async function mine(opts, list) {
  const app = await ready(opts, list);
  pick(app, 'mine');
  await until(() => app.state().cloudJobs && app.state().cloudJobs.ok);
  await tick(10);
  return app;
}

module.exports = async function () {
  /* ------------------------------------------------------------------ 107a */
  await t.group('107a — your own locked job: Correct in the business view and Your jobs; a solo owner too; an Engineer’s own not (1A 2A)', async () => {
    const app = await ready();
    await lookAt(app, O.id + '|ZZOWN');
    t.includes(body(app).innerHTML, 'data-look="fix" data-arg="w1"', 'the business view: your own job has Correct');
    t.eq(app.state().cloudLook.jobOrg, BIG, '…the cloud named its business');
    t.includes(app.doc.getElementById('cloud-look-note').innerHTML, 'You can correct this job', '…said');
    app.doc.getElementById('cloud-look-close').click();
    const a = await mine();
    await lookAt(a, 'ZZOWN');
    t.includes(body(a).innerHTML, 'data-look="fix" data-arg="w1"', 'Your jobs: Correct too (2A)');
    t.includes(body(a).innerHTML, 'data-look="fix-job"', '…and the site / name');
    a.doc.getElementById('cloud-look-close').click();
    await lookAt(a, 'ZZONELOCK');
    t.includes(body(a).innerHTML, 'data-look="fix" data-arg="n1"', 'a business of one (a solo owner): Correct');
    a.doc.getElementById('cloud-look-close').click();
    await lookAt(a, 'ZZTWOOWN');
    t.excludes(body(a).innerHTML, 'data-look="fix', 'your own job where you are an Engineer: no Correct (the office corrects it)');
    t.includes(a.doc.getElementById('cloud-look-note').innerHTML, 'Look only', '…look only');
    a.fn('cloudFixOpen')('t1');
    t.notOk(a.state().cloudFix, '…and nothing opens even if called');
    a.doc.getElementById('cloud-look-close').click();
    await lookAt(a, 'ZZOWNOPEN');
    t.includes(body(a).innerHTML, 'Lock this job before correcting it here — or change it on the phone that has it.', 'your own open job: lock it first');
    t.excludes(body(a).innerHTML, 'data-look="fix"', '…no Correct');
    // Inside a tutorial: never.
    a.run('_tut = { practice: true }');
    t.eq(a.fn('cloudFixOwnOk')(BIG), false, 'never inside a tutorial');
    a.run('_tut = null');
    // An Engineer of the only business: no Correct on their own job either.
    const e = await mine({}, [{ id: BIG, name: 'Big Co', role: 'engineer', def: true, n: 3 }]);
    await lookAt(e, 'ZZOWN');
    t.excludes(body(e).innerHTML, 'data-look="fix', 'an Engineer’s own job in a team: no Correct');
  });

  /* ------------------------------------------------------------------ 107b */
  await t.group('107b — saving your own: one rpc naming you and the job’s business; the trail; this phone syncs; the row follows (3A)', async () => {
    const app = await mine();
    await lookAt(app, 'ZZONELOCK');
    lookTap(app, 'fix', 'n1');
    t.includes(app.doc.body.children.find(c => c.id === 'cloud-fix-sheet').innerHTML, 'Your own job. The change is kept in the job with your name', 'the sheet says it’s yours');
    fillFrom(app);
    fill(app, { location: 'Hall' });
    await save(app, '');
    t.deepEq(app.srv.fixes.at(-1), { holder: O.id, job: 'ZZONELOCK', org: ONE, changes: [{ field: 'location', from: 'Hal', to: 'Hall', item: 'n1' }], reason: null },
      'you, the job, and the business the cloud said it is in');
    t.eq(app.state().cloudLook.doc.items[0].location, 'Hall', 'shown');
    t.includes(body(app).innerHTML, '<strong>Olive</strong> (Owner)', 'the trail names you');
    t.ok(app.toasts.includes('Corrected in the cloud.'), 'a cloud-only job: “Corrected in the cloud.”');
    // A result still needs a reason.
    lookTap(app, 'fix', 'n1');
    fillFrom(app);
    fill(app, { result: 'fail', notes: 'Cracked' });
    const n = app.srv.fixes.length;
    await save(app, '');
    t.eq(sheetErr(app), 'Add a reason — a result or a reading can only be changed with one.', 'the same rules: a result needs a reason');
    t.eq(app.srv.fixes.length, n, '…nothing sent');
    app.doc.getElementById('cloud-fix-cancel').click();
    app.doc.getElementById('cloud-look-close').click();
    // On this phone too (3A): a sync is started so it lands here.
    const b = await mine();
    b.run(`state.sessions.unshift({ id: 'ZZOWN', site: 'ZZ Own Locked', date: '2026-11-08', locked: true, items: [{ id: 'w1', assetNo: 'W-1', result: 'pass' }] }); save();`);
    b.stop();
    b.run('cloudJobsLoad(true)');
    await until(() => b.state().cloudJobs && b.state().cloudJobs.ok && !b.state().cloudJobs.busy);
    await tick(10);
    await lookAt(b, 'ZZOWN');
    t.ok(b.state().cloudLook.row.onPhone, 'set-up: the job is on this phone too');
    t.includes(body(b).innerHTML, 'data-look="fix" data-arg="w1"', 'on this phone too: Correct (3A)');
    b.run('_zzPush = 0; const _zzOld = syncPushSoon; syncPushSoon = function (ms, o) { _zzPush++; _zzPushPull = !!(o && o.pull); };');
    lookTap(b, 'fix', 'w1');
    fillFrom(b);
    fill(b, { location: 'Office' });
    await save(b, '');
    t.eq(b.run('_zzPush'), 1, 'a sync is started, so this phone takes it');
    t.eq(b.run('_zzPushPull'), true, '…one that reads');
    t.ok(b.toasts.includes('Corrected. This phone takes it at its next sync.'), '…and said');
    const row = b.state().cloudJobs.jobs.find(j => j.id === 'ZZOWN');
    t.ok(row && row.redo === true, 'Your jobs’ row follows (corrected after its certificate)');
  });

  /* ------------------------------------------------------------------ 107c */
  await t.group('107c — a cloud still on V167’s function: said in the sheet, naming the update', async () => {
    const app = await mine();
    app.srv.oldOwn = true;
    await lookAt(app, 'ZZONELOCK');
    lookTap(app, 'fix', 'n1');
    fillFrom(app);
    fill(app, { location: 'Hall' });
    await save(app, '');
    t.eq(sheetErr(app), 'The cloud needs a small update before you can correct your own jobs (run the V167 database update again).', 'said, naming the update');
    t.ok(app.state().cloudFix, '…the sheet stays, the typing kept');
  });

  /* ------------------------------------------------------------------ 107d */
  await t.group('107d — the SQL: no own refusal, C3 checks it’s in, schema.sql in step; release: pat-v167-1, still V167', () => {
    const mig = read('supabase/v167-corrections.sql');
    const end = '-- ================================================================ end V167\n';
    const block = mig.slice(mig.indexOf('-- ================================================================ V167\n'), mig.indexOf(end) + end.length);
    t.excludes(block, "raise exception 'patgo_correct_own'", 'your own job is no longer refused');
    t.includes(block, "if not public.can_read_org(s.org_id) then raise exception 'patgo_correct_not_allowed'; end if;", '…the role still decides — an Engineer’s own refused');
    t.includes(mig, "not like '%patgo_correct_own%'", 'C3 checks the V167.1 function is in');
    t.includes(mig, 'V167.1 (14 Nov): run it AGAIN after the V167.1 files', 'the file says to run it again');
    t.ok(read('supabase/schema.sql').trimEnd().endsWith(block.trimEnd()), 'schema.sql in step');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v167-1';", 'cache key pat-v167-1');
    const rel = freshApp();
    t.eq(rel.run('APP_VERSION'), 'V167', 'a hotfix: APP_VERSION stays V167');
    t.eq(rel.run('WELCOME_VERSION'), 'V167', '…What’s new too');
    t.includes(read('sync.js'), "V167.1: + org — the job's business as the cloud says", 'sync.js names V167.1');
  });
};
