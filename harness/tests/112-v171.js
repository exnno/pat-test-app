/* Standing test — V171: Office makes the certificate from the cloud; an Engineer in a
   team finishes and locks; what's waiting, for the office.
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   Round R82 (19 Nov, Peter — "1A 2A 3A 4A 5A 6B 7B", then "8 A B C"): the Owner, a
   Team leader or the Office make a job's certificate from the cloud — someone
   else's, or their own held only there (1A); locked jobs only (2A); the business's
   signature (3A); photos downloaded for that certificate only (4A); the engineer's
   phone says who made it (5A); "Needs certificate" in the business view (6B); no
   Produce report for an Engineer in a team (7B) — Finish & lock in its place (8A),
   the unlocked reminder always on (8B), "Not locked yet" for the office (8C).

     112a  THE BUTTON (1A 2A). Olive (Owner) looking at Eddie's locked job: Make
           certificate; a numbered one: Make the certificate again. An open job: no
           button, and cloudLookCert does nothing even if called. A job of Olive's
           that is on this phone too: made from the phone's copy, as always.
     112b  MAKING IT. The business's settings, its next number, the number written
           onto Eddie's job (cert_stamp, made false) — all BEFORE the build; built
           from the cloud's copy with the tester frozen at lock (never this phone's
           instruments), the business's prefix; nothing of the job kept here (jobs,
           storage). A job already numbered: no take, no stamp. Two at once: the
           cloud's number is the one printed. A business of one: the phone's counter.
     112c  WHEN IT CAN'T. No tester copy yet; the business not on this phone; no
           signal; the cloud refuses the role; certificates switched off; Eddie
           unlocked it since (cert_stamp says unlocked); the cloud without V171's SQL.
           Each said; nothing built.
     112d  MADE (5A 4A). Download / Share calls cert_stamp made true; the look shows
           the cloud's answer; a failure is said. The engineer's Overview line (not
           for your own); readings print on a cloud job whatever this phone's switch;
           the photos come from the cloud — never this phone's photo store; the Edit
           report settings button gone; closing the preview drops the cloud job.
     112e  AN ENGINEER IN A TEAM (7B 8A 8B). No Produce report on the job, the job off
           the Reports list, no Reports button when every business is a team where
           they're an Engineer; Finish & lock (a confirm, then locked the Job settings
           way — lockedAt, the tester copied, saved); the locked line; no "not
           exported" reminder for those jobs; "jobs still unlocked" at 5pm when left
           Off — for the team's jobs only; the settings page offers no Off. A solo
           engineer: nothing changes.
     112f  THE OFFICE'S CHIPS (6B 8C). In a business's view: Needs certificate (locked
           and no number, or corrected since) and Not locked yet — one at a time, a
           second tap off; the note about a lock made with no signal; Your jobs has
           neither.
     112g  the SQL in step (schema.sql's last section; G1–G5; isolation 36a–36c);
           release: V171; cache pat-v171; What's new one line; About V171 / V170 /
           V169 (V168 rolled off).

   ⚠ WHAT THIS FILE CANNOT PROVE: what the database lets through. The stand-in's
   cert_stamp follows the SQL; the SQL itself was proved in a real Postgres (PGlite +
   a Supabase stand-in, the whole schema.sql: 29 checks, every role, signed out,
   anon; eight broken copies each caught; isolation 36a–36c run there too). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { tick, freshApp, withSession, withItem, withInstrument } = require('../fixture');
const K = require('./103-v164.js').kit;
const H = require('./109-v169.js').helpers;
const { O, ED, BIG, ONE, tap, openCloud, openBig, until, json } = K;

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const J = JSON.stringify;
const TESTER = { make: 'Seaward', model: 'Apollo 600', serial: 'SN-ED', calDate: '2026-02-02', calCertNo: 'CAL-ED', calDue: '2027-02-02', at: '2026-11-09T10:00:00.000Z' };
const BIZ_RS = { enabled: true, certEnabled: true, certPrefix: 'BC-{year}-', certPadding: 3, companyName: 'Big Co', showFails: true, showPhotos: false };

// 103's team, Eddie's jobs for certificates, and the three certificate calls.
function cloud() {
  const srv = K.cloud();
  K.seedBig(srv);
  srv.add(ED, BIG, 'ZZC1', { site: 'ZZ Cert Site', date: '2026-11-11', engineer: 'Ed W', locked: true,
    lockedAt: '2026-11-09T10:00:00.000Z', tester: TESTER, instrumentId: 'inst-ed', items: [
      { id: 'c1', assetNo: 'E-1', itemType: 'Kettle', location: 'Kitchen', result: 'fail', notes: 'Cracked', readings: { class: 'I', earth: '0.12' } },
      { id: 'c2', assetNo: 'E-2', itemType: 'Lamp', location: 'Office', result: 'pass' }] });
  srv.add(ED, BIG, 'ZZC2', { site: 'ZZ Numbered', date: '2026-11-10', locked: true, tester: TESTER, certNo: 'BC-2026-007', items: [{ id: 'n1', result: 'pass' }] });
  srv.add(ED, BIG, 'ZZC3', { site: 'ZZ Still Open', date: '2026-11-12', locked: false, items: [{ id: 'o1', result: 'pass' }] });
  srv.add(ED, BIG, 'ZZC4', { site: 'ZZ Old Lock', date: '2026-10-01', locked: true, items: [{ id: 'q1', result: 'pass' }] });
  srv.add(ED, BIG, 'ZZC5', { site: 'ZZ Redo', date: '2026-10-02', locked: true, tester: TESTER, certNo: 'BC-2026-003',
    reportAt: '2026-10-03T10:00:00.000Z', correctedAt: '2026-10-04T10:00:00.000Z', items: [{ id: 'r1', result: 'pass' }] });
  srv.add(O.id, ONE, 'ZZONEC', { site: 'ZZ One Cert', date: '2026-11-01', locked: true, tester: TESTER, items: [{ id: 'w1', result: 'pass' }] });
  srv.rs = Object.assign({}, BIZ_RS);
  srv.next = 41; srv.canMake = true; srv.certCalls = []; srv.refuseCert = false; srv.noV171 = false; srv.raceNo = '';
  const base = srv.fetchImpl;
  const no = (code) => json({ code: 'P0001', message: 'patgo_certstamp_' + code, details: null, hint: null }, 400);
  srv.stamp = (b) => {
    const row = srv.sessions.find(s => s.user_id === b.holder && s.id === b.job);
    if (!row || row.deleted) return no('gone');
    if (b.org && row.org_id !== b.org) return no('moved');
    if (![BIG, ONE].includes(row.org_id)) return no('not_allowed');
    if (row.doc.locked !== true) return no('unlocked');
    if (srv.raceNo && !row.doc.certNo) row.doc.certNo = srv.raceNo;   // someone else's certificate landed first
    const d = JSON.parse(J(row.doc));
    if (!d.certNo && b.cert) d.certNo = b.cert;
    let at = null;
    if (b.made) { at = '2026-11-19T15:00:00.000Z'; d.reportAt = at; d.certMade = { at, by: O.id, name: 'Olive', role: 'owner', no: d.certNo || null }; }
    row.doc = d;
    return json({ certNo: d.certNo || null, at, doc: d });
  };
  srv.fetchImpl = async (url, init = {}) => {
    const p = String(url).split('?')[0].replace(/^https:\/\/[^/]+/, '');
    const m = /^\/rest\/v1\/rpc\/(business_cert|cert_take|cert_stamp|cert_settings_save|cert_seen)$/.exec(p);
    if (m) {
      let b = null; try { b = JSON.parse(init.body); } catch { b = null; }
      srv.certCalls.push({ fn: m[1], body: b });
      srv.calls.push({ path: p, qs: '', method: 'POST', body: b });
      if (m[1] === 'cert_stamp') {
        if (srv.noV171) return json({ code: 'PGRST202', message: 'Could not find the function public.cert_stamp(cert, holder, job, made, org) in the schema cache', details: null, hint: null }, 404);
        return srv.stamp(b);
      }
      if (srv.refuseCert) return json({ code: '42501', message: 'patgo_cert_not_allowed', details: null, hint: null }, 403);
      if (m[1] === 'business_cert') return json([{ settings: srv.rs, next_no: srv.next, updated_at: '2026-11-18T10:00:00+00:00', can_edit: true, can_make: srv.canMake, solo: false }]);
      if (m[1] === 'cert_take') return json(srv.next++);
      if (m[1] === 'cert_seen') return json(b.n);
      return json(null);
    }
    return base(url, init);
  };
  srv.fns = () => srv.certCalls.map(c => c.fn).join(',');
  return srv;
}
// The report engine and preview stood in for; the sheets recorded.
function stubs(app) {
  const r = { built: [], opened: [], sheets: [] };
  const sb = app.sandbox;
  sb.planGate = () => true;
  sb.reportEngineReady = () => true;
  sb.buildReportDoc = (session, ph) => {
    r.built.push({ session: JSON.parse(J(session)), rs: JSON.parse(J(app.fn('reportRs')())), ph,
      cloud: app.run('_reportCloud ? JSON.stringify(_reportCloud) : ""'), tester: J(app.fn('instrumentForSession')(session)) });
    return {};
  };
  sb.openReportPreview = (doc, session) => { r.opened.push(session); };
  for (const k of ['openInfoSheet', 'openConfirmSheet']) sb[k] = (o) => { r.sheets.push(Object.assign({ kind: k }, o)); };
  return r;
}
const body = (app) => app.doc.getElementById('cloud-look-body');
async function lookAt(app, key) {
  tap(app, 'cloud-tap', key);
  await until(() => app.state().cloudLook && !app.state().cloudLook.loading);
}
async function ready(list) {
  const srv = cloud();
  const app = K.phone(srv, list);
  await openCloud(app);
  await openBig(app);
  return { app, srv };
}
const storageSnap = (app) => { const o = {}; for (let i = 0; i < app.storage.length; i++) { const k = app.storage.key(i); o[k] = app.storage.getItem(k); } return J(o); };

// An Engineer's phone (111's way): one business, the role chosen.
async function teamApp(role, n = 3) {
  const app = await H.signedIn();
  H.setBiz(app, [{ id: H.OWN, name: 'Birchley Testing', role, def: true, n }]);
  const st = app.state();
  st.reportSettings = Object.assign({}, st.reportSettings, { enabled: true, certEnabled: true });
  withInstrument(app);
  const sess = withSession(app);
  withItem(app, { assetNo: 'T-1', result: 'pass' });
  return { app, sess };
}
const html = (app) => app.doc.getElementById('app').innerHTML;
function overview(app, sess) {
  app.run(`state.activeId = ${J(sess.id)}; state.view = 'overview'; state.selectionMode = false; render();`);
  return html(app);
}

module.exports = async function () {
  /* ------------------------------------------------------------------ 112a */
  await t.group('112a — the button: the people who may correct, on a locked job; open jobs none; your own job on this phone from its copy (1A 2A)', async () => {
    const { app, srv } = await ready();
    await lookAt(app, ED + '|ZZC1');
    let b = body(app).innerHTML;
    t.includes(b, 'id="cloud-cert-btn" data-look="cert"', 'Make certificate on Eddie’s locked job');
    t.includes(b, 'Make certificate</button>', '…worded for a first certificate');
    app.doc.getElementById('cloud-look-close').click();
    await lookAt(app, ED + '|ZZC2');
    t.includes(body(app).innerHTML, 'Make the certificate again</button>', 'a numbered job: Make the certificate again');
    app.doc.getElementById('cloud-look-close').click();
    await lookAt(app, ED + '|ZZC3');
    b = body(app).innerHTML;
    t.excludes(b, 'cloud-cert-btn', 'an open job: no button (2A)');
    const r = stubs(app);
    await app.fn('cloudLookCert')();
    t.eq(r.built.length + srv.certCalls.length, 0, '…and cloudLookCert does nothing even if called');
    await app.fn('produceCloudReport')(app.state().cloudLook);
    t.eq(r.sheets[0] && r.sheets[0].title, 'Not locked yet', '…and the certificate itself refuses an open job: said (2A)');
    t.includes(r.sheets[0].message, 'Eddie needs to lock this job', '…by name');
    t.eq(r.built.length + srv.certCalls.length, 0, '…nothing asked, nothing built');
    r.sheets.length = 0;
    app.doc.getElementById('cloud-look-close').click();
    // Through the sheet's own listener (the body's click), as the phone does it.
    await lookAt(app, ED + '|ZZC1');
    const el = app.doc.createElement('button'); el.dataset.look = 'cert';
    body(app).dispatchEvent({ type: 'click', target: el, defaultPrevented: false, preventDefault() {}, stopPropagation() {} });
    await until(() => r.opened.length === 1);
    t.eq(r.opened.length, 1, 'the button reaches the certificate (the sheet’s listener)');
    // A locked job of a business Olive is only an Engineer in: not hers to certify —
    // cloudLookCert does nothing at all (not even the refusal).
    const other = { key: 'ZZOTHER', id: 'ZZOTHER', user: ED, scope: K.TWO, org: K.TWO, loading: false,
      row: { mine: false, onPhone: false, who: { name: 'Eddie' } }, doc: { id: 'ZZOTHER', locked: true, tester: TESTER, items: [] } };
    app.run(`state.cloudLook = ${J(other)}`);
    const before = r.sheets.length + r.built.length + srv.certCalls.length;
    await app.fn('cloudLookCert')();
    t.eq(r.sheets.length + r.built.length + srv.certCalls.length, before, 'not one you may correct: cloudLookCert does nothing');
    // Olive's own job, on this phone too: the phone's copy, as always.
    const sb = app.sandbox; let viaPhone = '';
    sb.produceReport = async (id) => { viaPhone = id; };
    const fake = { key: 'ZZPH', id: 'ZZPH', user: O.id, scope: 'mine', org: '', jobOrg: BIG, loading: false,
      row: { mine: true, onPhone: true }, doc: { id: 'ZZPH', locked: true, items: [] } };
    app.run(`state.sessions.push({ id: 'ZZPH', items: [], locked: true, site: 'x', date: '2026-11-01' }); state.cloudLook = ${J(fake)};`);
    await app.fn('cloudLookCert')();
    t.eq(viaPhone, 'ZZPH', 'your own job on this phone: made from the phone’s copy (produceReport)');
  });

  /* ------------------------------------------------------------------ 112b */
  await t.group('112b — making it: settings, number, the number on the job, then the build — from the cloud’s copy and its tester; nothing kept', async () => {
    let { app, srv } = await ready();
    withInstrument(app, { make: 'OFFICE OWN METER', serial: 'SN-OFFICE' });   // this phone's own — must never print
    await lookAt(app, ED + '|ZZC1');
    let r = stubs(app);
    const before = J(app.state().sessions.map(s => s.id));
    const store = storageSnap(app);
    await app.fn('cloudLookCert')();
    const year = '2026';
    t.eq(srv.fns(), 'business_cert,cert_take,cert_stamp', 'the business’s settings, its next number, the number onto the job — in that order');
    const st = srv.certCalls[2].body;
    t.eq(st.holder, ED, 'cert_stamp: Eddie’s job');
    t.eq(st.job, 'ZZC1', '…by its id');
    t.eq(st.org, BIG, '…in Big Co');
    t.eq(st.cert, `BC-${year}-041`, '…the number formatted with the business’s prefix and padding');
    t.eq(st.made, false, '…not yet made');
    t.eq(r.built.length, 1, 'built once');
    t.eq(r.built[0].session.certNo, `BC-${year}-041`, 'the certificate carries the number');
    t.eq(r.built[0].rs.companyName, 'Big Co', 'built from the business’s settings (3A: its signature with them)');
    t.includes(r.built[0].tester, '"serial":"SN-ED"', 'the tester as Eddie locked it');
    t.excludes(r.built[0].tester, 'OFFICE OWN METER', '…never this phone’s own instrument');
    t.eq(r.built[0].session.items.length, 2, 'the cloud’s copy of the job, every item');
    t.includes(r.built[0].cloud, '"holder":"' + ED + '"', 'the preview knows it’s a cloud job');
    t.eq(srv.sessions.find(s => s.id === 'ZZC1').doc.certNo, `BC-${year}-041`, 'the number is on Eddie’s job in the cloud');
    t.eq(J(app.state().sessions.map(s => s.id)), before, 'no job added to this phone');
    t.eq(storageSnap(app), store, 'nothing written to this phone’s storage');
    t.eq(srv.writes().length, 0, 'no table written (only the functions)');

    // A job already numbered: no take, no stamp before the build.
    app.doc.getElementById('cloud-look-close').click();
    srv.certCalls = [];
    await lookAt(app, ED + '|ZZC2');
    r = stubs(app);
    await app.fn('cloudLookCert')();
    t.eq(srv.fns(), 'business_cert', 'numbered already: the settings only (assign-once)');
    t.eq(r.built[0].session.certNo, 'BC-2026-007', '…its own number printed');

    // Two at once: the cloud already had a number for the job — it is the one printed.
    ({ app, srv } = await ready());
    srv.raceNo = 'BC-2026-040';
    await lookAt(app, ED + '|ZZC1');
    r = stubs(app);
    await app.fn('cloudLookCert')();
    t.eq(r.built[0].session.certNo, 'BC-2026-040', 'someone else numbered it first: their number is printed (never two numbers on one job)');

    // A business of one (V170 8A): the phone's own counter, written onto the job.
    ({ app, srv } = await ready());
    app.run("state.reportSettings = Object.assign({}, state.reportSettings, { enabled: true, certEnabled: true, certPrefix: 'P-', certNextNumber: 9, certPadding: 4 })");
    app.run(`state.cloudJobs.scope = 'mine'`);
    const fake = { key: 'ZZONEC', id: 'ZZONEC', user: O.id, scope: 'mine', org: '', jobOrg: ONE, loading: false,
      row: { mine: true, onPhone: false }, doc: srv.sessions.find(s => s.id === 'ZZONEC').doc };
    app.run(`state.cloudLook = ${J(fake)}`);
    r = stubs(app);
    srv.certCalls = [];
    await app.fn('cloudLookCert')();
    t.eq(srv.certCalls.filter(c => c.fn === 'cert_take' || c.fn === 'business_cert').length, 0, 'a business of one: no cloud number, no business settings');
    t.eq(r.built[0] && r.built[0].session.certNo, 'P-0009', '…numbered from this phone’s counter');
    t.eq(app.state().reportSettings.certNextNumber, 10, '…the counter moved on');
    t.eq(srv.sessions.find(s => s.id === 'ZZONEC').doc.certNo, 'P-0009', '…and the number written onto the job');
  });

  /* ------------------------------------------------------------------ 112c */
  await t.group('112c — when it can’t: no tester copy, unknown business, no signal, refused, switched off, unlocked since, no V171 SQL', async () => {
    let { app, srv } = await ready();
    await lookAt(app, ED + '|ZZC4');
    let r = stubs(app);
    await app.fn('cloudLookCert')();
    t.eq(r.sheets[0] && r.sheets[0].title, 'The tester’s details aren’t in the cloud yet', 'locked before V170, no copy: said');
    t.includes(r.sheets[0].message, 'Ask Eddie to open PATGo', '…by name');
    t.eq(srv.certCalls.length + r.built.length, 0, '…nothing asked, nothing built');
    // An older job with the instrument snapshot: that is the tester.
    srv.sessions.find(s => s.id === 'ZZC4').doc.instrumentSnapshot = { make: 'Snap', serial: 'SN-SNAP' };
    app.doc.getElementById('cloud-look-close').click();
    await lookAt(app, ED + '|ZZC4');
    r = stubs(app);
    await app.fn('cloudLookCert')();
    t.includes(r.built[0] && r.built[0].tester, 'SN-SNAP', 'the job’s own instrument snapshot stands in for the copy');
    app.doc.getElementById('cloud-look-close').click();

    // No signal.
    await lookAt(app, ED + '|ZZC1');
    r = stubs(app); srv.certCalls = [];
    app.run('navigator.onLine = false');
    await app.fn('cloudLookCert')();
    t.eq(r.sheets[0] && r.sheets[0].title, 'Needs a connection', 'no signal: needs a connection');
    t.eq(srv.certCalls.length + r.built.length, 0, '…nothing asked, nothing built');
    app.run('navigator.onLine = true');
    // Refused by the cloud.
    srv.refuseCert = true; r = stubs(app);
    await app.fn('cloudLookCert')();
    t.eq(r.sheets[0] && r.sheets[0].title, 'The office makes certificates', 'the cloud refuses the role: said');
    srv.refuseCert = false; srv.canMake = false; r = stubs(app);
    await app.fn('cloudLookCert')();
    t.eq(r.sheets[0] && r.sheets[0].title, 'The office makes certificates', 'the cloud says this role can’t: said');
    srv.canMake = true;
    // Switched off.
    srv.rs = Object.assign({}, BIZ_RS, { enabled: false }); r = stubs(app);
    await app.fn('cloudLookCert')();
    t.eq(r.sheets[0] && r.sheets[0].title, 'Certificates are switched off', 'switched off for the business: said');
    t.eq(r.built.length, 0, '…nothing built');
    srv.rs = Object.assign({}, BIZ_RS);
    // Eddie unlocked it since it was read: the stamp is refused, nothing built, the copy dropped.
    srv.sessions.find(s => s.id === 'ZZC1').doc.locked = false;
    r = stubs(app); srv.certCalls = [];
    await app.fn('cloudLookCert')();
    t.eq(srv.fns(), 'business_cert,cert_take,cert_stamp', 'the stamp was asked');
    t.eq(r.sheets[0] && r.sheets[0].title, 'Certificate not made', 'unlocked since: said');
    t.includes(r.sheets[0].message, 'Eddie unlocked this job since it was read', '…by name');
    t.eq(r.built.length, 0, '…nothing built (no number on the job, no certificate)');
    t.eq(app.fn('reportRs')(), app.state().reportSettings, '…the business’s copy dropped');
    t.eq(app.run('_reportCloud'), null, '…and the cloud job');
    srv.sessions.find(s => s.id === 'ZZC1').doc.locked = true;
    // A cloud without V171's SQL.
    srv.noV171 = true; r = stubs(app);
    await app.fn('cloudLookCert')();
    t.eq(r.sheets[0] && r.sheets[0].title, 'The cloud needs updating', 'no V171 SQL: names the update');
    t.includes(r.sheets[0].message, 'supabase/v171-office-certs.sql', '…the file');
    t.eq(r.built.length, 0, '…nothing built');
    srv.noV171 = false;
    // The business not on this phone.
    ({ app, srv } = await ready());
    await lookAt(app, ED + '|ZZC1');
    app.run(`localStorage.setItem('pat:businesses', JSON.stringify({ u: ${J(O.id)}, at: Date.now(), list: [{ id: ${J(ONE)}, name: 'One Ltd', role: 'owner', def: true, n: 1 }] }))`);
    app.run(`state.cloudLook.row.mine = true; state.cloudLook.jobOrg = ${J(BIG)};`);
    app.run(`localStorage.setItem('pat:businesses', JSON.stringify({ u: ${J(O.id)}, at: Date.now(), list: [{ id: ${J(BIG)}, name: 'Big Co', role: 'owner', def: true, n: 3 }] }))`);
    const look = app.state().cloudLook;
    app.run(`localStorage.setItem('pat:businesses', JSON.stringify({ u: ${J(O.id)}, at: Date.now(), list: [] }))`);
    r = stubs(app);
    await app.fn('produceCloudReport')(look);
    t.eq(r.sheets[0] && r.sheets[0].title, 'Business not found', 'the job’s business not on this phone: said');
    t.eq(r.built.length, 0, '…nothing built');
  });

  /* ------------------------------------------------------------------ 112d */
  await t.group('112d — made (5A): written onto the job with who; the engineer’s line; readings; photos from the cloud (4A); the preview’s close', async () => {
    const { app, srv } = await ready();
    await lookAt(app, ED + '|ZZC1');
    stubs(app);
    await app.fn('cloudLookCert')();
    const cloudJob = JSON.parse(app.run('JSON.stringify(_reportCloud)'));
    srv.certCalls = [];
    const ok = await app.fn('_reportCloudMade')(cloudJob, { certNo: 'BC-2026-041' });
    t.ok(ok, 'made: the cloud took it');
    t.eq(srv.fns(), 'cert_stamp', 'one call');
    t.eq(srv.certCalls[0].body.made, true, '…made');
    t.eq(srv.certCalls[0].body.cert, 'BC-2026-041', '…with the number');
    const d = srv.sessions.find(s => s.id === 'ZZC1').doc;
    t.eq(d.certMade && d.certMade.name, 'Olive', 'the job says who made it');
    t.eq(d.reportAt, '2026-11-19T15:00:00.000Z', '…and when (reportAt — clears "make it again")');
    t.includes(app.doc.getElementById('cloud-look-body').innerHTML, 'Certificate BC-2026-041 made by Olive (Owner)', 'the look shows the cloud’s answer');
    // A failure is said.
    app.run('navigator.onLine = false');
    app.toasts = [];
    t.eq(await app.fn('_reportCloudMade')(cloudJob, { certNo: 'BC-2026-041' }), false, 'no signal: not marked');
    t.includes(app.toasts.join('|'), 'the job doesn’t show the certificate as made yet', '…and said');
    app.run('navigator.onLine = true');

    // The engineer's phone: a line on the job's Overview (5A) — never for your own.
    const line = app.fn('certMadeLineText');
    const doc = { certMade: { at: '2026-11-19T15:00:00.000Z', by: O.id, name: 'Cath', role: 'office', no: 'BC-2026-041' } };
    t.includes(line(doc, ED), 'Certificate BC-2026-041 made by Cath (Office), 19 Nov 2026', 'the engineer sees who made it, and when');
    t.eq(line(doc, O.id), '', '…the person who made it doesn’t');
    t.eq(line({ certMade: { name: '<b>x</b>', role: 'boss', at: 'nope' } }, ED), 'Certificate made by <b>x</b>', 'plain text, a role PATGo hasn’t left out (the caller escapes)');
    t.eq(line({}, ED), '', 'none: nothing');
    const eng = freshApp();
    const s = withSession(eng);
    eng.run(`(() => { const s = state.sessions[0]; s.locked = true; s.certNo = 'BC-2026-041'; s.certMade = ${J({ at: '2026-11-19T15:00:00.000Z', by: O.id, name: '<i>Cath</i>', role: 'office', no: 'BC-2026-041' })}; })()`);
    const ov = overview(eng, s);
    t.includes(ov, 'id="cert-made-line"', 'on the Overview');
    t.includes(ov, 'made by &lt;i&gt;Cath&lt;/i&gt; (Office)', '…escaped');

    // Readings print on a cloud job whatever this phone's switch says.
    t.includes(read('report.js'), "  const readingsOn = (!!state.readingsEnabled || !!(_reportCloud && _reportCloud.id === session.id)) && rs.showReadings !== false;", 'readings: a cloud job’s print whatever this phone’s switch');

    // Photos (4A): from the cloud, for this certificate only — never this phone's photo store.
    const sb = app.sandbox; const asked = [];
    sb.photosForSession = async () => { asked.push('local'); return []; };
    sb.photosSupported = () => true;
    sb.syncCloudJobPhotos = async (u, id) => { asked.push('list ' + u + ' ' + id); return { ok: true, photos: [{ id: 'p1', item: 'c1', thumb: true }, { id: 'p2', item: 'c2', thumb: true }] }; };
    sb.syncCloudLookPhoto = async (u, id, full) => { asked.push((full ? 'full ' : 'thumb ') + id); return (id === 'p2' && full) ? null : { blob: id }; };
    sb.photoPrintDataUrl = async (blob) => ({ dataUrl: 'data:' + blob.blob, w: 1, h: 1 });
    app.run(`_reportCloud = { holder: ${J(ED)}, id: 'ZZC1', org: ${J(BIG)} }`);
    const ph = await app.fn('collectReportPhotos')({ id: 'ZZC1', items: [{ id: 'c1' }, { id: 'c2' }] });
    t.eq(asked.join(','), `list ${ED} ZZC1,full p1,full p2,thumb p2`, 'the job’s photos from the cloud, full size (its preview when that’s all there is)');
    t.eq(ph.printed, 2, '…both on the certificate');
    t.excludes(asked.join(','), 'local', '…never this phone’s photo store');
    app.run('_reportCloud = null');
    asked.length = 0;
    await app.fn('collectReportPhotos')({ id: 'ZZC1', items: [{ id: 'c1' }] });
    t.eq(asked.join(','), 'local', 'a job of this phone’s own: its photo store, as before');

    // The preview: no Edit report settings, the cloud job dropped on close, made through the cloud.
    const rep = read('report.js');
    t.includes(rep, "    _reportCloud = null;   // V171: so was the cloud job\n", 'closing the preview drops the cloud job');
    t.includes(rep, "      if (cloudJob) { _reportCloudMade(cloudJob, session); return; }", 'Download / Share: made in the cloud, not on this phone');
    t.includes(rep, "  const cloudJob = (_reportCloud && _reportCloud.id === session.id) ? _reportCloud : null;", '…the cloud job the preview was opened for');
  });

  /* ------------------------------------------------------------------ 112e */
  await t.group('112e — an Engineer in a team: no Produce report, Finish & lock, the reminders (7B 8A 8B); solo unchanged', async () => {
    let { app, sess } = await teamApp('engineer');
    let ov = overview(app, sess);
    t.excludes(ov, 'id="produce-report-btn"', 'no Produce report on the job (7B)');
    t.includes(ov, 'id="finish-lock-btn" data-action="finish-lock"', 'Finish & lock in its place (8A)');
    t.ok(app.fn('businessReportsHidden')(), 'every business a team where they’re an Engineer: no Reports');
    app.run("state.view = 'sessions'; render();");
    t.excludes(html(app), 'id="reports-btn"', '…no Reports button on the Jobs screen');
    app.run("state.view = 'reports'; render();");
    t.includes(html(app), 'The office makes the certificates for your business', 'the Reports list (if reached) lists none of the team’s jobs');
    // Finish & lock: a confirm, then locked the Job settings way.
    const sheets = [];
    app.sandbox.openConfirmSheet = (o) => sheets.push(o);
    overview(app, sess);
    K.tap(app, 'finish-lock', sess.id);
    t.eq(sheets.length && sheets[0].title, 'Finish and lock this job?', 'a confirm first');
    t.includes(sheets[0].message, 'Locking tells Birchley Testing the job is finished', '…naming the business');
    t.notOk(app.state().sessions.find(s => s.id === sess.id).locked, '…nothing locked yet');
    let saves = 0; const realSave = app.sandbox.save;
    app.sandbox.save = (...a) => { saves++; return realSave(...a); };
    sheets[0].onConfirm();
    app.sandbox.save = realSave;
    const s1 = app.state().sessions.find(s => s.id === sess.id);
    t.ok(s1.locked, 'locked');
    t.ok(typeof s1.lockedAt === 'string' && s1.lockedAt, '…the lock time');
    t.ok(s1.tester && s1.tester.calCertNo === 'CAL-77', '…the tester copied in (V170 6A)');
    t.eq(saves, 1, '…and saved (which syncs it)');
    ov = overview(app, s1);
    t.includes(ov, 'id="cert-office-line"', 'locked: the office makes its certificate');
    t.excludes(ov, 'finish-lock-btn', '…no Finish & lock');
    t.eq(app.fn('lockJobFinish')(sess.id), false, 'locking a locked job: nothing');
    // The not-exported reminder isn't theirs.
    app.run("state.reminders = { exportAfter: '1h', unlockedAt: 'off', backupDays: '7' }");
    t.notOk(app.fn('isExportReminderJob')(s1, Date.parse(s1.lockedAt) + 2 * 3600e3), 'no "not exported" reminder for the team’s job (7B)');
    // Jobs still unlocked: on at 5pm when left Off — for the team's jobs.
    const s2 = withSession(app); withItem(app, { assetNo: 'T-2' });
    const at = (h) => new Date(2026, 10, 19, h, 30).getTime();
    t.eq(app.fn('unlockedReminderDue')(at(16)).length, 0, 'before 5pm: nothing');
    t.eq(app.fn('unlockedReminderDue')(at(17)).map(s => s.id).join(), s2.id, 'from 5pm, Off or not: the team’s unlocked job (8B)');
    // A job of another business (their own, solo) isn't nagged by the forced reminder.
    app.run(`state.sessions.find(s => s.id === ${J(s2.id)}).businessId = 'b9b9b9b9-0000-4000-8000-000000000009'`);
    H.setBiz(app, [{ id: H.OWN, name: 'Birchley Testing', role: 'engineer', def: true, n: 3 },
      { id: 'b9b9b9b9-0000-4000-8000-000000000009', name: 'Own Ltd', role: 'owner', def: false, n: 1 }]);
    t.eq(app.fn('unlockedReminderDue')(at(18)).length, 0, '…their own business’s jobs follow their own choice (Off)');
    t.notOk(app.fn('businessReportsHidden')(), 'with a business of their own: Reports stays');
    app.run("state.reminders = { exportAfter: 'off', unlockedAt: '19', backupDays: '7' }");
    t.eq(app.fn('unlockedReminderDue')(at(19)).length, 1, 'their own time chosen: every unlocked job, as before');
    // The settings page: no Off.
    app.run("state.reminders = { exportAfter: 'off', unlockedAt: 'off', backupDays: '7' }");
    app.run("state.view = 'settingsReminders'; render();");
    const page = html(app);
    t.includes(page, 'id="remind-unlocked-team"', 'the settings page says why');
    t.includes(page, 'Always on in Birchley Testing', '…naming the team');
    const sel = page.slice(page.indexOf('id="remind-unlocked"'), page.indexOf('</select>', page.indexOf('id="remind-unlocked"')));
    t.excludes(sel, '<option value="off"', '…no Off');
    t.includes(sel, '<option value="17" selected>', '…5pm shown while left Off');
    t.includes(app.fn('reminderSettingsSummary')(), 'Unlocked jobs', 'the summary says it’s on');

    // A Team leader in the same team, and a solo engineer: as before.
    ({ app, sess } = await teamApp('team_leader'));
    ov = overview(app, sess);
    t.includes(ov, 'id="produce-report-btn"', 'a Team leader: Produce report');
    t.excludes(ov, 'finish-lock-btn', '…no Finish & lock');
    ({ app, sess } = await teamApp('owner', 1));
    ov = overview(app, sess);
    t.includes(ov, 'id="produce-report-btn"', 'solo: Produce report');
    t.excludes(ov, 'finish-lock-btn', '…nothing new');
    t.eq(app.fn('unlockedReminderDue')(at(18)).length, 0, '…the unlocked reminder still theirs to turn on');
  });

  /* ------------------------------------------------------------------ 112f */
  await t.group('112f — the office’s chips: Needs certificate, Not locked yet — a business’s view only (6B 8C)', async () => {
    const { app } = await ready();
    let h = html(app);
    t.includes(h, 'id="cloud-lockf-cert" data-action="cloud-lockf" data-arg="cert"', 'Needs certificate');
    t.includes(h, 'id="cloud-lockf-open" data-action="cloud-lockf" data-arg="open"', 'Not locked yet');
    const titles = () => app.fn('cloudJobsModel')().groups.flatMap(g => g.rows.map(r => r.id)).sort().join(',');
    K.tap(app, 'cloud-lockf', 'cert');
    t.eq(titles(), 'ZZC1,ZZC4,ZZC5', 'locked with no number, or corrected since (V167)');
    t.includes(html(app), 'aria-pressed="true">Needs certificate', '…the chip on');
    K.tap(app, 'cloud-lockf', 'open');
    t.ok(titles().split(',').includes('ZZC3') && !titles().split(',').includes('ZZC1'), 'Not locked yet: the open jobs only — one chip at a time');
    t.includes(html(app), 'id="cloud-lockf-note"', '…the note about a lock made with no signal');
    K.tap(app, 'cloud-lockf', 'open');
    t.ok(titles().split(',').includes('ZZC1') && titles().split(',').includes('ZZC3'), 'a second tap: off');
    K.tap(app, 'cloud-lockf', 'cert');
    app.run("state.cloudJobs.scope = 'mine'; render();");
    h = html(app);
    t.excludes(h, 'cloud-lockf', 'Your jobs: neither chip');
    t.eq(app.fn('cloudJobsModel')().lockf, '', '…and no filter in force there');
  });

  /* ------------------------------------------------------------------ 112g */
  await t.group('112g — the SQL in step; G1–G5; isolation 36a–36c; release V171', () => {
    const mig = read('supabase/v171-office-certs.sql');
    const end = '-- ================================================================ end V171\n';
    const block = mig.slice(mig.indexOf('-- ================================================================ V171\n'), mig.indexOf(end) + end.length);
    t.ok(block.length > 3000, 'the migration has its definitions');
    t.ok(read('supabase/schema.sql').trimEnd().endsWith(block.trimEnd()), 'a new project gets them byte for byte, as schema.sql’s last section');
    t.includes(block, "  if s.org_id is null or coalesce(public.my_role(s.org_id), '') not in ('owner','team_leader','office') then", 'Owner / Team leader / Office of the JOB’s business');
    t.includes(block, "  if jsonb_typeof(d) is distinct from 'object' or (d -> 'locked') is distinct from 'true'::jsonb then\n    raise exception 'patgo_certstamp_unlocked';", 'locked only (2A)');
    t.includes(block, '  if have is null and no is not null then', 'a job that has a number keeps it');
    t.includes(block, "  select x.* into s from public.sessions x where x.user_id = holder and x.id = job for update;", 'the job row locked while it is written');
    t.includes(block, 'revoke all on function public.cert_stamp(uuid, text, uuid, text, boolean) from public, anon;', 'nobody signed out');
    t.includes(block, 'returns jsonb language plpgsql volatile security definer set search_path = \'\' as $$', 'its own rights, a pinned search path');
    for (let n = 1; n <= 5; n++) t.ok(new RegExp('^select ' + n + ", '", 'm').test(mig), `self-check G${n}`);
    const iso = read('supabase/isolation-test.sql');
    for (const k of ['36a', '36b', '36c']) t.includes(iso, `['${k}|`, `isolation ${k}`);
    t.includes(read('sync.js'), "    .then((c) => c.rpc('cert_stamp', { holder: u, job: sid, org: o, cert: no || null, made: made === true }))", 'the app calls it with exactly its arguments');

    const rel = freshApp();
    t.eq(rel.run('APP_VERSION'), 'V171', 'APP_VERSION V171');
    t.eq(rel.run('WELCOME_VERSION'), 'V171', 'What’s new rolled (a feature release)');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v171';", 'cache key pat-v171');
    const core = read('render-core.js');
    const at = core.indexOf('<ul class="welcome-list sheet-scroll">');
    const sheetCopy = core.slice(at, core.indexOf('</ul>', at));
    t.eq((sheetCopy.match(/<li>/g) || []).length, 1, 'What’s new: one line');
    t.includes(sheetCopy, '<li><strong>Certificates from the office.</strong>', '…certificates from the office');
    const help = read('render-help.js');
    const x = help.indexOf('<p><strong>V171</strong>'), y = help.indexOf('<p><strong>V170</strong>'), z = help.indexOf('<p><strong>V169</strong>');
    t.ok(x > -1 && y > x && z > y, 'About: V171, V170, V169');
    t.excludes(help, '<p><strong>V168</strong>', 'V168 rolled off');
    t.includes(help, 'Certificates from the office: the Owner, a Team leader or the Office', 'About: V171’s line');
    t.includes(help, 'Team seats: each Engineer or Team leader is &pound;3 a month', 'About: V169’s line, the oldest');
  });
};
