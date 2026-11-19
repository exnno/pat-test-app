/* Standing test — V171.1 (hotfix): the tester for a job locked before V170 that is only
   in the cloud.
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   Peter's live test (19 Nov): such a job said "let their phone connect", and nothing
   changed when it did — V170 copies the tester at start-up only for jobs ON that
   phone. He doesn't want to bring the job down for it. So the cloud makes the copy
   (cert_tester) from the engineer's own saved instruments, as their phone would have.

     113a  THE COPY. A cloud-only job with no tester: cert_tester asked first, its copy
           (the instrument the job names; else the one in use) is the one printed —
           never this phone's own; the look keeps the cloud's answer; then the
           settings, number and stamp as V171.
     113b  WHEN IT CAN'T. Nothing saved to copy: said by name, nothing built; no
           signal; the cloud without the V171.1 SQL (names the file); refused.
     113c  the SQL in step (schema.sql's last section; H1–H5); release: cache
           pat-v171-1, APP_VERSION stays V171 (a hotfix).

   ⚠ The stand-in's cert_tester follows the SQL; the SQL itself was proved in PGlite
   with the whole schema.sql (22 checks; nine broken copies each caught). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, withInstrument } = require('../fixture');
const K = require('./103-v164.js').kit;
const V = require('./112-v171.js').kit;
const { ED } = K;

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');

module.exports = async function () {
  /* ------------------------------------------------------------------ 113a */
  await t.group('113a — a cloud-only job locked before V170: the cloud makes the tester copy, then the certificate', async () => {
    const { app, srv } = await V.ready();
    withInstrument(app, { make: 'OFFICE OWN METER' });
    srv.instr[ED] = { list: [{ id: 'e1', make: 'Kewtech', model: 'KT77', calDate: '2026-03-03', calCertNo: 'KEW-1', calDue: '2027-03-03' },
      { id: 'e2', make: 'Megger', model: 'PAT420', calDate: '2026-04-04', calCertNo: 'MEG-2', calDue: '2027-04-04' }], inUse: 'e2' };
    const row = srv.sessions.find(s => s.id === 'ZZC4');
    row.doc.instrumentId = 'e1';
    await V.lookAt(app, ED + '|ZZC4');
    const r = V.stubs(app);
    await app.fn('cloudLookCert')();
    t.eq(srv.fns(), 'cert_tester,business_cert,cert_take,cert_stamp', 'the tester copy first, then as V171');
    t.eq(srv.certCalls[0].body.holder, ED, 'cert_tester: Eddie’s job');
    t.eq(srv.certCalls[0].body.job, 'ZZC4', '…by its id');
    t.eq(r.built.length, 1, 'built');
    t.includes(r.built[0].tester, '"calCertNo":"KEW-1"', 'the instrument the job names, from Eddie’s saved instruments');
    t.excludes(r.built[0].tester, 'OFFICE OWN METER', '…never this phone’s own');
    t.eq(row.doc.tester && row.doc.tester.make, 'Kewtech', 'the copy is on Eddie’s job in the cloud (no need to bring it down)');
    t.eq(app.state().cloudLook.doc.tester && app.state().cloudLook.doc.tester.make, 'Kewtech', 'the look holds the cloud’s answer');
    t.notOk(app.state().sessions.some(s => s.id === 'ZZC4'), 'nothing brought onto this phone');
    // Made again: the copy is there now — the cloud isn't asked again.
    app.doc.getElementById('cloud-look-close').click();
    srv.certCalls = [];
    await V.lookAt(app, ED + '|ZZC4');
    V.stubs(app);
    await app.fn('cloudLookCert')();
    t.excludes(srv.fns(), 'cert_tester', 'again: the job’s own copy, the cloud not asked');
    // A numbered job with no copy (no stamp to follow): the look keeps the cloud's copy,
    // so making it again doesn't ask the cloud again.
    srv.sessions.find(s => s.id === 'ZZC2').doc.tester = undefined;
    delete srv.sessions.find(s => s.id === 'ZZC2').doc.tester;
    app.doc.getElementById('cloud-look-close').click();
    await V.lookAt(app, ED + '|ZZC2');
    srv.certCalls = []; V.stubs(app);
    await app.fn('cloudLookCert')();
    t.eq(srv.fns(), 'cert_tester,business_cert', 'numbered, no copy: the tester, the settings — no number, no stamp');
    srv.certCalls = []; V.stubs(app);
    await app.fn('cloudLookCert')();
    t.eq(srv.fns(), 'business_cert', '…made again from the same look: the copy it was given, the cloud not asked again');
    // No instrument named: the one in use.
    const { app: a2, srv: s2 } = await V.ready();
    s2.instr[ED] = srv.instr[ED];
    await V.lookAt(a2, ED + '|ZZC4');
    const r2 = V.stubs(a2);
    await a2.fn('cloudLookCert')();
    t.includes(r2.built[0] && r2.built[0].tester, '"calCertNo":"MEG-2"', 'no instrument named: the tester Eddie has in use');
  });

  /* ------------------------------------------------------------------ 113b */
  await t.group('113b — when the cloud can’t: nothing saved, no signal, no V171.1 SQL, refused', async () => {
    const { app, srv } = await V.ready();
    await V.lookAt(app, ED + '|ZZC4');
    let r = V.stubs(app);
    await app.fn('cloudLookCert')();
    t.eq(r.sheets[0] && r.sheets[0].title, 'No tester to put on this job', 'nothing saved to copy: said');
    t.includes(r.sheets[0].message, 'Ask Eddie to add it in Settings › Instruments', '…by name, and where');
    t.eq(r.built.length, 0, '…nothing built');
    app.run('navigator.onLine = false');
    r = V.stubs(app); srv.certCalls = [];
    await app.fn('cloudLookCert')();
    t.eq(r.sheets[0] && r.sheets[0].title, 'Needs a connection', 'no signal: needs a connection');
    t.eq(srv.certCalls.length + r.built.length, 0, '…nothing asked');
    app.run('navigator.onLine = true');
    srv.noV1711 = true; r = V.stubs(app);
    await app.fn('cloudLookCert')();
    t.eq(r.sheets[0] && r.sheets[0].title, 'The cloud needs updating', 'no V171.1 SQL: said');
    t.includes(r.sheets[0].message, 'supabase/v171-1-tester.sql', '…the file named');
    srv.noV1711 = false;
    srv.sessions.find(s => s.id === 'ZZC4').doc.locked = false;
    r = V.stubs(app);
    await app.fn('cloudLookCert')();
    t.eq(r.sheets[0] && r.sheets[0].title, 'Certificate not made', 'unlocked since: said');
    t.eq(r.built.length, 0, '…nothing built');
  });

  /* ------------------------------------------------------------------ 113c */
  await t.group('113c — the SQL in step; H1–H5; release pat-v171-1', () => {
    const mig = read('supabase/v171-1-tester.sql');
    const end = '-- ================================================================ end V171.1\n';
    const block = mig.slice(mig.indexOf('-- ================================================================ V171.1\n'), mig.indexOf(end) + end.length);
    t.ok(block.length > 2500, 'the migration has its definition');
    t.ok(read('supabase/schema.sql').trimEnd().endsWith(block.trimEnd()), 'a new project gets it byte for byte, as schema.sql’s last section');
    t.includes(block, "  if s.org_id is null or coalesce(public.my_role(s.org_id), '') not in ('owner','team_leader','office') then", 'Owner / Team leader / Office of the JOB’s business');
    t.includes(block, "      where r.user_id = holder and r.kind = 'instrument' and r.id = iid and not r.deleted;", 'the HOLDER’s own instruments');
    t.includes(block, "  if jsonb_typeof(d -> 'tester') = 'object' then\n    return jsonb_build_object('doc', d, 'from', 'job');", 'a job with its copy: never changed');
    for (let n = 1; n <= 5; n++) t.ok(new RegExp('^select ' + n + ", '", 'm').test(mig), `self-check H${n}`);
    t.includes(read('sync.js'), "    .then((c) => c.rpc('cert_tester', { holder: u, job: sid, org: o }))", 'the app calls it with exactly its arguments');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v171-1';", 'cache key pat-v171-1');
    t.eq(freshApp().run('APP_VERSION'), 'V171', 'APP_VERSION stays V171 (a hotfix)');
  });
};
