/* Standing test — V170: the business's certificate — the tester frozen at lock, who
   makes certificates, numbers from the cloud, the business's settings.
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   Round R81 (18 Nov, Peter — "0B 1A 2B 3 4A 5C 6A", then "7 … 8A"): every certificate
   setting is the business's (1A); Owner and Office change them (2B); the cloud gives
   out each number when the Owner, a Team leader or Office makes the certificate — a
   connection needed (3); the business counter starts from the Owner's (4A); only
   Owner / Team leader / Office make certificates in a business (5C); the tester's
   details copied into the job at lock (6A); a business of one keeps the phone's own
   counter, offline (8A).

     111a  6A: locking copies the tester; a recalibration since doesn't change the
           certificate; unlocked = the live tester; a re-lock copies again (and reaches
           the disk — the signature); a job locked before V170 gets a copy at boot.
     111b  5C 3 8A: an Engineer in a team is told the office makes it (nothing asked of
           the cloud); Owner / Team leader / Office: the business's settings and the
           cloud's number, formatted with the business's prefix — offline, refused or
           failed: no certificate and no number; a numbered job takes no new one; a
           business of one: the phone's counter, offline, and the cloud told after.
     111c  1A 2B 4A: the read — an Owner's / Office's unsent edit goes FIRST (without the
           counter; a hand-typed counter once); an Engineer takes the business's
           settings and the team's next number; nothing taken over an unsent edit or
           an open form; applying never owes it back; an empty business row is filled
           from the Owner's; a business of one reports its counter. The settings
           screen: an Engineer / Team leader in a team sees why, and no form.
     111d  1A: the certificate is built from the business's copy; a chip changes this
           certificate only; no "Edit report settings" on a business's certificate;
           closing the preview drops the copy.
     111e  the SQL: schema.sql's last section in step; the rules; F1–F5; isolation 35a–35c.
     111f  V170's About line; the key (V171: the release checks → 112g). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { freshApp, withInstrument, withSession, tick } = require('../fixture');
const H = require('./109-v169.js').helpers;
const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');

const BIZ = { id: H.OWN, name: 'Birchley Testing', role: 'owner', def: true, n: 3 };
const BIZ_SETTINGS = { enabled: true, certEnabled: true, certPrefix: 'BT-{year}-', certPadding: 3,
  companyName: 'Birchley Testing', showFails: true, certNextNumber: 999 };

// The four certificate calls, on top of 109's pretend cloud.
function certCloud(app, o = {}) {
  const base = app.sandbox.fetch;
  const c = { calls: [], settings: o.settings || BIZ_SETTINGS, next: o.next || 41, at: o.at || '2026-11-18T10:00:00+00:00',
    canMake: o.canMake !== false, refuse: false, fail: false, taken: 0 };
  app.sandbox.fetch = async (u, i = {}) => {
    const url = String(u);
    const m = /\/rest\/v1\/rpc\/(business_cert|cert_take|cert_settings_save|cert_seen)$/.exec(url);
    if (!m) return base(u, i);
    let body = null; try { body = JSON.parse(i.body); } catch (e) { body = null; }
    c.calls.push({ fn: m[1], body });
    if (c.fail) return H.json({ message: 'boom' }, 500);
    if (c.refuse) return H.json({ code: '42501', message: 'patgo_cert_not_allowed' }, 403);
    if (m[1] === 'business_cert') return H.json([{ settings: c.settings, next_no: c.next, updated_at: c.at, can_edit: true, can_make: c.canMake, solo: false }]);
    if (m[1] === 'cert_take') { c.taken++; return H.json(c.next++); }
    if (m[1] === 'cert_settings_save') { c.at = '2026-11-18T11:0' + c.calls.length + ':00+00:00'; return H.json(c.at); }
    if (m[1] === 'cert_seen') return H.json(Math.max(c.next, body.n));
    return H.json(null);
  };
  c.fns = () => c.calls.map(x => x.fn);
  return c;
}

// Making a certificate, with the PDF engine and preview stood in for.
function stubReport(app) {
  const r = { built: [], opened: 0 };
  const sb = app.sandbox;
  sb.planGate = () => true;
  sb.reportEngineReady = () => true;
  sb.buildReportDoc = () => { r.built.push(JSON.parse(JSON.stringify(app.fn('reportRs')()))); return {}; };
  sb.openReportPreview = () => { r.opened++; };
  return r;
}

async function teamApp(role, n = 3) {
  const app = await H.signedIn();
  H.setBiz(app, [Object.assign({}, BIZ, { role, n })]);
  const st = app.state();
  st.reportSettings = Object.assign({}, st.reportSettings, { enabled: true, certEnabled: true, certPrefix: 'P-', certNextNumber: 7, certPadding: 4 });
  const sess = withSession(app);
  st.view = 'sessions';
  return { app, sess };
}

module.exports = async function () {
  /* ------------------------------------------------------------------ 111a */
  await t.group('111a — 6A: the tester copied at lock; a recalibration since doesn’t change the certificate; re-lock; boot', () => {
    const app = freshApp();
    withInstrument(app, { calDate: '2026-01-01', calCertNo: 'CAL-77', calDue: '2027-01-01' });
    const sess = withSession(app);
    const st = app.state();
    t.ok(!!sess.instrumentId, 'the job points at its tester');
    st.exportWarnSessionId = sess.id;
    app.fn('lockFromReopenWarning')();
    t.ok(sess.locked && sess.tester && typeof sess.tester === 'object', 'Lock job: the tester is copied into the job');
    t.eq(sess.tester.calDate, '2026-01-01', '…its calibration date as it was');
    t.eq(sess.tester.at, sess.lockedAt, '…dated with the lock');
    // Recalibrated afterwards.
    const inst = app.fn('instrumentList')()[0];
    inst.calDate = '2026-11-01'; inst.calCertNo = 'CAL-99';
    t.eq(app.fn('instrumentForSession')(sess).calDate, '2026-01-01', 'recalibrated since: the locked job prints the date it was tested with');
    t.eq(app.fn('instrumentForSession')(sess).calCertNo, 'CAL-77', '…and its certificate');
    // Unlocked: the live tester again; locked again: copied again — and it reaches the disk.
    const sig = app.fn('_sessionSig');
    sess.locked = false;
    t.eq(app.fn('instrumentForSession')(sess).calDate, '2026-11-01', 'unlocked: the tester as it is now');
    const before = sig(sess);
    sess.lockedAt = undefined;
    st.exportWarnSessionId = sess.id;
    app.fn('lockFromReopenWarning')();
    t.eq(sess.tester.calDate, '2026-11-01', 're-locked: the copy taken again (6A)');
    t.ok(sig(sess) !== before, '…and the job’s signature changed, so the new copy is written');
    sess.tester.at = '2026-01-02T00:00:00.000Z';
    const s1 = sig(sess);
    sess.tester.at = '2026-01-03T00:00:00.000Z';
    t.ok(sig(sess) !== s1, 'the signature follows the copy’s time, not just its presence');
    // Job settings' lock path copies too, AFTER a tester change in the same save.
    t.includes(read('session.js'), "  if (sess.locked && !wasLocked && typeof testerFreeze === 'function') testerFreeze(sess, sess.lockedAt);\n  state.view = 'overview';",
      'Job settings: copied on the change to locked, after the tester stamp is settled');
    t.includes(read('business.js'), "s.locked = true; s.lockedAt = now; if (typeof testerFreeze === 'function') testerFreeze(s, now);",
      'a job locked on leaving a business is copied too');
    // A job locked before V170: the copy at boot, from the tester as it is then.
    delete sess.tester;
    app.fn('save')();
    const KEY = app.run('STORAGE_KEY');
    const storedBefore = app.storage.getItem(KEY);
    const app2 = bootApp({ localStorage: app.storage._snapshot() });
    t.ok(app2.storage.getItem(KEY) !== storedBefore, 'the boot copy is written to the phone at boot (not left in memory)');
    const st2 = app2.refresh('state').state;
    const s2 = st2.sessions.find(x => x.id === sess.id);
    t.ok(s2 && s2.locked && s2.tester && s2.tester.calDate === '2026-11-01', 'a job locked before V170 gets its copy when the phone opens');
    t.eq(app2.fn('testerFreezeLocked')(), 0, '…once (a job with a copy is never touched again)');
    const app3 = bootApp({ localStorage: app2.storage._snapshot() });
    const s3 = app3.refresh('state').state.sessions.find(x => x.id === sess.id);
    t.ok(s3 && s3.tester && s3.tester.calDate === '2026-11-01', '…and it was saved');
  });

  /* ------------------------------------------------------------------ 111b */
  await t.group('111b — 5C 3 8A: who makes it; the business’s number from the cloud; a business of one offline', async () => {
    // An Engineer in a team.
    let { app, sess } = await teamApp('engineer');
    let c = certCloud(app); let r = stubReport(app);
    t.eq(app.fn('businessCertMode')(sess).kind, 'refuse', 'an Engineer in a team: refused');
    await app.fn('produceReport')(sess.id);
    t.eq(app.sheets.length && app.sheets[0].title, 'The office makes certificates', 'told the office makes it (5C)');
    t.includes(app.sheets[0].message, 'In Birchley Testing, certificates are made by the Owner, a Team leader or Office', '…naming the business');
    t.eq(c.calls.length + r.built.length, 0, '…nothing asked of the cloud, nothing built');
    t.notOk(sess.certNo, '…no number');

    // A Team leader — online.
    ({ app, sess } = await teamApp('team_leader'));
    c = certCloud(app); r = stubReport(app);
    t.eq(app.fn('businessCertMode')(sess).kind, 'cloud', 'a Team leader: the cloud');
    await app.fn('produceReport')(sess.id);
    const year = String(sess.date).slice(0, 4);
    t.eq(c.fns().join(','), 'business_cert,cert_take', 'the business’s settings, then its next number');
    t.eq(sess.certNo, `BT-${year}-041`, 'the number formatted with the BUSINESS’s prefix and padding');
    t.eq(r.built.length && r.built[0].companyName, 'Birchley Testing', 'built from the business’s settings');
    t.eq(app.state().reportSettings.certNextNumber, 7, 'the phone’s own counter untouched');
    // Made again: no new number.
    await app.fn('produceReport')(sess.id);
    t.eq(c.taken, 1, 'made again: the job keeps its number (no second take)');
    // Offline: nothing.
    ({ app, sess } = await teamApp('office'));
    c = certCloud(app); r = stubReport(app);
    app.run('navigator.onLine = false');
    await app.fn('produceReport')(sess.id);
    t.eq(app.sheets[0] && app.sheets[0].title, 'Needs a connection', 'Office offline: needs a connection (3)');
    t.eq(c.calls.length + r.built.length, 0, '…nothing asked, nothing built');
    app.run('navigator.onLine = true');
    // Refused by the cloud (no longer allowed), and a failure.
    c.refuse = true; app.sheets = [];
    await app.fn('produceReport')(sess.id);
    t.eq(app.sheets[0] && app.sheets[0].title, 'The office makes certificates', 'the cloud refuses: told, nothing built');
    c.refuse = false; c.canMake = false; app.sheets = [];
    await app.fn('produceReport')(sess.id);
    t.eq(app.sheets[0] && app.sheets[0].title, 'The office makes certificates', 'the cloud says this role can’t make one: told');
    c.canMake = true; c.fail = true; app.sheets = [];
    await app.fn('produceReport')(sess.id);
    t.eq(app.sheets[0] && app.sheets[0].title, 'Couldn’t reach the cloud', 'a failure: said, and nothing used up');
    t.eq(r.built.length, 0, '…nothing built');
    t.notOk(sess.certNo, '…no number on the job');
    // The take fails after the settings came back: still no certificate.
    c.fail = false;
    const realFetch = app.sandbox.fetch;
    app.sandbox.fetch = async (u, i) => String(u).endsWith('/rpc/cert_take') ? H.json({ message: 'boom' }, 500) : realFetch(u, i);
    app.sheets = [];
    await app.fn('produceReport')(sess.id);
    t.eq(r.built.length, 0, 'the number couldn’t be taken: no certificate (no number, no certificate)');
    t.eq(app.fn('reportRs')(), app.state().reportSettings, '…and the business’s copy dropped');
    app.sandbox.fetch = realFetch;
    // Certificates switched off for the business.
    c.settings = Object.assign({}, BIZ_SETTINGS, { enabled: false }); app.sheets = [];
    await app.fn('produceReport')(sess.id);
    t.eq(app.sheets[0] && app.sheets[0].title, 'Certificates are switched off', 'the business has certificates off: said');

    // A business of one (8A): offline, the phone's counter, the cloud told afterwards.
    ({ app, sess } = await teamApp('owner', 1));
    c = certCloud(app); r = stubReport(app);
    t.eq(app.fn('businessCertMode')(sess).kind, 'solo', 'the Owner alone: the phone');
    app.run('navigator.onLine = false');
    await app.fn('produceReport')(sess.id);
    t.eq(sess.certNo, 'P-0007', 'offline: numbered from the phone’s own counter, as before');
    t.eq(r.built.length, 1, '…and built');
    t.eq(c.calls.length, 0, '…without asking the cloud');
    t.ok(app.run('_bizCertTimer !== null'), '…the cloud to be told how far the counter got');
    app.run('clearTimeout(_bizCertTimer); _bizCertTimer = null');
    // Not signed in / no business known: as before.
    H.setBiz(app, []);
    t.eq(app.fn('businessCertMode')(sess).kind, 'phone', 'no business known here: the phone, as before');
  });

  /* ------------------------------------------------------------------ 111c */
  await t.group('111c — 1A 2B 4A: send the edit first, take the business’s, never owe it back; the settings screen', async () => {
    // The Owner of a team edits: owed, then sent BEFORE the read, without the counter.
    let { app } = await teamApp('owner');
    let c = certCloud(app);
    const st = () => app.state();
    st().reportSettings.companyName = 'Mine';
    app.fn('saveReportSettings')();
    t.eq(JSON.parse(app.storage.getItem('pat:certBiz')).owe, true, 'an Owner’s edit is owed to the business');
    app.run('clearTimeout(_bizCertTimer); _bizCertTimer = null');
    const client = await app.run('_bizClient()');
    await app.fn('businessCertRead')(client, H.UID);
    t.eq(c.fns().join(','), 'cert_settings_save,business_cert', 'sent FIRST, then read');
    const sent = c.calls[0].body;
    t.eq(sent.s.companyName, 'Mine', '…the edit');
    t.ok(!('certNextNumber' in sent.s) && !('certSetAt' in sent.s), '…without the phone’s counter');
    t.eq(sent.n, null, '…and no number (none typed in)');
    t.eq(JSON.parse(app.storage.getItem('pat:certBiz')).owe, false, 'nothing owed after');
    // With the businesses: the business list's read ends with the certificate's.
    c.calls.length = 0;
    await app.fn('businessRead')(client, H.UID);
    t.ok(c.fns().includes('business_cert'), 'read with the businesses (app start, every return, the Business page)');
    t.eq(st().reportSettings.certNextNumber, 41, 'a team’s next number is the business’s (the settings screen shows it)');
    t.ok(app.run('_bizCertTimer === null'), '…applied without owing it back (nothing scheduled to send)');
    // A counter typed in by hand: sent once (4A).
    st().reportSettings.certNextNumber = 500; st().reportSettings.certSetAt = '2026-11-18T12:00:00.000Z';
    app.fn('saveReportSettings')(); app.run('clearTimeout(_bizCertTimer); _bizCertTimer = null');
    c.calls.length = 0;
    await app.fn('businessCertRead')(client, H.UID);
    t.eq(c.calls[0].body.n, 500, 'a counter typed in by the Owner: the business’s next number (4A)');
    st().reportSettings.companyName = 'Mine 2';
    app.fn('saveReportSettings')(); app.run('clearTimeout(_bizCertTimer); _bizCertTimer = null');
    c.calls.length = 0;
    await app.fn('businessCertRead')(client, H.UID);
    t.eq(c.calls[0].body.n, null, '…once (a later edit doesn’t send it again)');

    // An Engineer in the team: takes the business's settings; edits owe nothing.
    ({ app } = await teamApp('engineer'));
    c = certCloud(app);
    const cl2 = await app.run('_bizClient()');
    app.fn('saveReportSettings')();
    t.eq(app.storage.getItem('pat:certBiz'), null, 'an Engineer’s save owes nothing');
    t.eq(await app.fn('businessCertRead')(cl2, H.UID), true, 'the business’s settings taken');
    t.eq(app.state().reportSettings.companyName, 'Birchley Testing', '…the business’s name on this phone');
    t.eq(app.state().reportSettings.certNextNumber, 41, '…the team’s next number');
    t.eq(c.fns().join(','), 'business_cert', '…nothing sent');
    t.eq(JSON.parse(app.storage.getItem('pat:certBiz')).owe, false, 'applying never owes it back');
    app.state().reportSettings.companyName = 'Local';
    await app.fn('businessCertRead')(cl2, H.UID);
    t.eq(app.state().reportSettings.companyName, 'Local', 'unchanged in the cloud: not taken again');
    c.at = '2026-11-19T09:00:00+00:00';
    app.state().view = 'settingsReport';
    await app.fn('businessCertRead')(cl2, H.UID);
    t.eq(app.state().reportSettings.companyName, 'Local', 'a settings form open: not taken under it (MAP rule 3)');
    app.state().view = 'sessions';
    await app.fn('businessCertRead')(cl2, H.UID);
    t.eq(app.state().reportSettings.companyName, 'Birchley Testing', '…taken once it’s closed');
    // Over an unsent edit (an Office whose edit failed to go): never taken.
    ({ app } = await teamApp('office'));
    c = certCloud(app);
    const cl3 = await app.run('_bizClient()');
    app.state().reportSettings.companyName = 'Office edit';
    app.fn('saveReportSettings')(); app.run('clearTimeout(_bizCertTimer); _bizCertTimer = null');
    const base = app.sandbox.fetch;
    app.sandbox.fetch = async (u, i) => String(u).endsWith('/rpc/cert_settings_save') ? H.json({ message: 'boom' }, 500) : base(u, i);
    await app.fn('businessCertRead')(cl3, H.UID);
    t.eq(app.state().reportSettings.companyName, 'Office edit', 'an edit not yet sent is never overwritten by the cloud’s');
    t.eq(JSON.parse(app.storage.getItem('pat:certBiz')).owe, true, '…still owed');
    app.sandbox.fetch = async (u, i) => String(u).endsWith('/rpc/cert_settings_save') ? H.json({ code: '42501', message: 'patgo_cert_not_allowed' }, 403) : base(u, i);
    await app.fn('businessCertRead')(cl3, H.UID);
    t.eq(JSON.parse(app.storage.getItem('pat:certBiz')).owe, false, 'refused (no longer Owner / Office): not owed for ever');
    app.sandbox.fetch = base;
    // An empty business row: the Owner's settings become the business's.
    ({ app } = await teamApp('owner'));
    c = certCloud(app, { settings: {} });
    const cl4 = await app.run('_bizClient()');
    app.state().reportSettings.companyName = 'Peter’s';
    await app.fn('businessCertRead')(cl4, H.UID);
    t.eq(app.state().reportSettings.companyName, 'Peter’s', 'an empty business row doesn’t blank the Owner’s settings');
    t.eq(JSON.parse(app.storage.getItem('pat:certBiz')).owe, true, '…they are owed to it instead');
    app.run('clearTimeout(_bizCertTimer); _bizCertTimer = null');
    // A business of one tells the cloud its counter (8A).
    ({ app } = await teamApp('owner', 1));
    c = certCloud(app);
    await app.fn('businessCertRead')(await app.run('_bizClient()'), H.UID);
    const seen = c.calls.find(x => x.fn === 'cert_seen');
    t.eq(seen && seen.body.n, 7, 'a business of one: the cloud told how far the phone’s counter got (8A)');
    t.eq(app.state().reportSettings.certNextNumber, 7, '…and its counter stays the phone’s');

    // The settings screen.
    const screen = async (role, n) => { const x = await teamApp(role, n); return x.app.fn('renderSettingsReport')(); };
    const eng = await screen('engineer', 3);
    t.includes(eng, 'id="cert-biz-ro"', 'an Engineer in a team: why');
    t.includes(eng, 'Certificates for Birchley Testing are set by its Owner or Office', '…in words');
    t.excludes(eng, 'id="report-company-name"', '…and no form');
    t.excludes(await screen('team_leader', 3), 'id="report-company-name"', 'a Team leader: no form (2B)');
    t.includes(await screen('office', 3), 'id="report-company-name"', 'Office: the form (2B)');
    t.includes(await screen('owner', 3), 'id="report-company-name"', 'the Owner: the form');
    t.includes(await screen('engineer', 1), 'id="report-company-name"', 'a business of one: the form as before');
  });

  /* ------------------------------------------------------------------ 111d */
  await t.group('111d — 1A: built from the business’s copy; a chip changes this certificate only; no Edit settings', async () => {
    const app = freshApp();
    const st = app.state();
    st.reportSettings.companyName = 'Phone';
    app.run("_reportRsUse = Object.assign({}, state.reportSettings, { companyName: 'Business', showFails: true })");
    t.eq(app.fn('reportRs')().companyName, 'Business', 'a business’s certificate reads the business’s copy');
    const rep = read('report.js');
    t.includes(rep, '    const q = reportRs();\n', 'the chips flip the certificate’s own settings');
    t.includes(rep, '    if (!_reportRsUse) saveReportSettings();', '…saved only when they are the phone’s');
    t.includes(rep, "${(_reportRsUse || _reportCloud) ? '' : `<button class=\"btn-secondary report-edit-settings-btn\" id=\"report-edit-settings\">", 'no Edit report settings on a business’s certificate (V171: nor a cloud job’s)');
    t.includes(rep, "    _reportRsUse = null;   // V170: the business's copy was for this certificate only", 'closing the preview drops the copy');
    t.eq((rep.match(/state\.reportSettings/g) || []).length, 5, 'report.js reads the phone’s settings only where meant (the reopen, the phone’s counter, the gate)');
    app.run('_reportRsUse = null');
    t.eq(app.fn('reportRs')(), st.reportSettings, 'no business copy: the phone’s settings');
  });

  /* ------------------------------------------------------------------ 111e */
  await t.group('111e — the SQL: schema.sql in step; one take = one number; roles; F1–F5; isolation 35a–35c', () => {
    const mig = read('supabase/v170-certificates.sql');
    const end = '-- ================================================================ end V170\n';
    const block = mig.slice(mig.indexOf('-- ================================================================ V170\n'), mig.indexOf(end) + end.length);
    t.ok(block.length > 4000, 'the migration has its definitions');
    t.ok(read('supabase/schema.sql').includes(block), 'a new project gets them byte for byte, as a section of schema.sql (V171: no longer the last)');
    t.includes(block, 'revoke all on public.cert_settings from anon, authenticated;', 'the table closed to the app');
    t.includes(block, "  update public.cert_settings set next_no = next_no + 1 where org_id = o\n  returning next_no - 1 into got;", 'a number: one UPDATE … RETURNING (never the same twice)');
    t.includes(block, "if auth.uid() is null or coalesce(public.my_role(o), '') not in ('owner','team_leader','office') then", 'Owner / Team leader / Office take numbers (5C)');
    t.includes(block, "if auth.uid() is null or coalesce(public.my_role(o), '') not in ('owner','office') then", 'Owner / Office save the settings (2B)');
    t.includes(block, "if auth.uid() is null or public.my_role(o) is distinct from 'owner' then", 'the Owner reports a business of one’s counter (8A)');
    t.includes(block, '  update public.cert_settings set next_no = greatest(next_no, n) where org_id = o', '…only ever forward');
    t.includes(block, "where x.user_id = own and x.kind = 'settings' and x.id = 'settings_certcounter' and not x.deleted;", 'the first row follows the Owner’s counter (4A)');
    t.includes(block, "values (o, s - 'certNextNumber' - 'certSetAt', coalesce(n, 1), own)", '…and the Owner’s settings, without the counter');
    t.includes(block, "set settings = s - 'certNextNumber' - 'certSetAt',", 'a save never stores a counter in the settings');
    t.includes(block, 'octet_length(s::text) > 1500000', 'the settings capped (the logo)');
    t.includes(block, 'revoke all on function public._cert_row(uuid) from public, anon, authenticated;', 'the row-maker closed');
    t.includes(read('config.js'), "const SYNC_REPORT_ID = 'settings_report';", 'the Owner’s settings row is the one sync writes');
    t.includes(read('config.js'), "const SYNC_CERT_ID = 'settings_certcounter';", '…and the counter row');
    for (let n = 1; n <= 5; n++) t.ok(new RegExp('^select ' + n + ", '", 'm').test(mig), `self-check F${n}`);
    const iso = read('supabase/isolation-test.sql');
    for (const k of ['35a', '35b', '35c']) t.includes(iso, `['${k}|`, `isolation ${k}`);
    t.includes(iso, '      if had170 then update public.cert_settings set settings = s170, next_no = nx170 where org_id = own_a;', '…A’s settings and counter put back');
  });

  /* ------------------------------------------------------------------ 111f */
  // V171: the release checks moved to 112g; this keeps V170's own lines.
  await t.group('111f — V170’s About line; the key', () => {
    const help = read('render-help.js');
    t.includes(help, 'The business&rsquo;s certificate: in a business with more than one person', 'About: V170’s line');
    t.includes(read('reset.js'), "  ['CERT_BIZ_KEY', CERT_BIZ_KEY, 'account'],", 'the new key follows the account (Reset, takeover)');
    t.excludes(read('backup.js'), 'CERT_BIZ_KEY', '…never in a backup');
  });
};
