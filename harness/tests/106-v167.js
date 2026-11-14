/* Standing test — V167: Office corrections (round 1A 2C 3A 4A 5A 6A 7A 8A)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

     106a  WHO MAY (1A 3A). The Owner (Team leader, Office) looking at a teammate's
           LOCKED job in their business: a Correct on every item and on the job,
           the sheet's note says so. Open: "Still being worked on — Eddie needs to
           lock it". A leaver's locked job: correctable. Your own job, Your jobs, an
           Engineer's business: none — and cloudFixOpen does nothing even if called.
     106b  A CORRECTION (2C 5A 6A). The sheet starts from the job's values; Save
           sends ONE rpc — holder, job, business, only the fields that differ, each
           with what it was; the look repaints with the cloud's answer, the trail
           names Olive (Owner), old → new; the sheet closes; a toast names Eddie.
           No render while the sheet is open (it has inputs — MAP rule 3), nothing
           stored on this phone, no table written. The site / job name the same way.
     106c  THE RULES BEFORE SAVE (7A). A result or reading needs a reason; a fail
           its notes; a class leaves out the readings it hasn't; nothing changed;
           too long — each said in the sheet, nothing sent.
     106d  WHEN THE CLOUD SAYS NO. Changed since (sheet closes, the job read again,
           said); unlocked; no signal (said in the sheet, nothing sent); no V167 SQL
           (names the update); a lapsed business.
     106e  THE CERTIFICATE AND THE HOLDER'S PHONE (4A 8A). jobCorrectedSinceCertificate;
           the Jobs list badge "Corrected since certificate", Modified since lists
           it, paperwork not done; the Overview card and the trail sheet (escaped);
           the cloud row "Corrected — certificate to make again" from the two picks;
           a pulled job is taken whole (its trail with it).
     106f  the SQL in step (schema.sql's last section, C1–C5, isolation 32a–32c);
           release: V167; cache pat-v167; What's new one line; About V167 / V166 /
           V165 (V164 rolled off).

   ⚠ WHAT THIS FILE CANNOT PROVE: what the database lets through. The stand-in's
   correct_job follows the SQL; the SQL itself was proved in a real Postgres
   (PGlite + a Supabase stand-in, the whole schema.sql: 64 checks, every role, a
   leaver, a lapsed business, signed out; thirteen broken copies each caught). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { tick, freshApp, withSession, withItem } = require('../fixture');
const K = require('./103-v164.js').kit;
const { O, ED, LEE, BIG, TWO, tap, pick, openCloud, openBig, until, json, storageSnap, html } = K;

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const J = JSON.stringify;
const REP = '2026-11-10T10:00:00.000Z';

// 103's team, plus Eddie's locked job with a certificate, an open one, a
// leaver's locked one — and correct_job, answering as the SQL is written.
function cloud(opts) {
  const srv = K.cloud();
  K.seedBig(srv);
  srv.add(ED, BIG, 'ZZFIX', { site: 'ZZ Fix Site', name: '', date: '2026-11-11', engineer: 'Ed W', locked: true,
    lockedAt: '2026-11-09T10:00:00.000Z', reportAt: REP, certNo: 'C-101', items: [
      { id: 'k1', assetNo: 'E-1', itemType: 'Kettle', location: 'Kitchn', result: 'fail', notes: 'Cracked plug',
        readings: { class: 'I', earth: '0.12', polarity: true } },
      { id: 'k2', assetNo: 7, itemType: 'Lamp', location: 'Office', result: 'pass' }] });
  srv.add(ED, BIG, 'ZZOPEN', { site: 'ZZ Open Site', date: '2026-11-12', locked: false, items: [{ id: 'o1', assetNo: 'E-9', result: 'pass' }] });
  srv.add(LEE, BIG, 'ZZLFIX', { site: 'ZZ Leaver Fix', date: '2026-08-16', engineer: 'Lee Smith', locked: true,
    items: [{ id: 'l1', assetNo: 'L-1', location: 'Hal', result: 'pass' }] });
  srv.add(O.id, BIG, 'ZZOWN', { site: 'ZZ Own Locked', date: '2026-11-08', locked: true, reportAt: REP, items: [{ id: 'w1', assetNo: 'W-1', result: 'pass' }] });
  // V167.1: Olive's own jobs elsewhere — an Engineer in Other Co; the Owner of One Ltd (a business of one).
  srv.add(O.id, TWO, 'ZZTWOOWN', { site: 'ZZ Other Co Own', date: '2026-11-07', locked: true, items: [{ id: 't1', assetNo: 'T-1', result: 'pass' }] });
  srv.add(O.id, K.ONE, 'ZZONELOCK', { site: 'ZZ One Ltd Locked', date: '2026-11-06', locked: true, items: [{ id: 'n1', assetNo: 'N-1', location: 'Hal', result: 'pass' }] });
  srv.add(O.id, BIG, 'ZZOWNOPEN', { site: 'ZZ Own Open', date: '2026-11-05', locked: false, items: [{ id: 'q1', assetNo: 'Q-1', result: 'pass' }] });
  srv.noSql = !!(opts && opts.noSql);
  srv.lapsed = false;
  srv.fixes = [];
  const base = srv.fetchImpl;
  const no = (code) => json({ code: 'P0001', message: 'patgo_correct_' + code, details: null, hint: null }, 400);
  const ITEM = ['assetNo', 'location', 'itemType', 'result', 'notes'];
  const RD = ['readings.class', 'readings.earth', 'readings.insulation', 'readings.leakage', 'readings.polarity'];
  srv.correct = (b) => {
    const row = srv.sessions.find(s => s.user_id === b.holder && s.id === b.job);
    if (!row || row.deleted) return no('gone');
    if (b.org && row.org_id !== b.org) return no('moved');
    if (b.holder === O.id && srv.oldOwn) return no('own');   // a cloud still on V167's function
    if (!srv.readable({ user_id: 'someone-else', org_id: row.org_id })) return no('not_allowed');
    if (row.doc.locked !== true) return no('unlocked');
    if (srv.lapsed) return json({ code: '42501', message: 'patgo_plan_locked: this business\'s PATGo plan has ended, so the cloud is not taking changes', details: null, hint: null }, 403);
    const d = JSON.parse(J(row.doc));
    const done = [];
    let needs = false;
    for (const c of b.changes) {
      const f = c.field;
      let tgt, k = null, it = null;
      if (c.item == null) { if (!['name', 'site'].includes(f)) return no('field'); tgt = d; }
      else {
        if (!ITEM.includes(f) && !RD.includes(f)) return no('field');
        it = d.items.find(x => String(x.id) === String(c.item));
        if (!it) return no('changed');
        if (RD.includes(f)) { k = f.slice(9); it.readings = it.readings || {}; tgt = it.readings; } else tgt = it;
      }
      const key = k || f;
      if (k === 'polarity') {
        if ((tgt.polarity === true) !== (c.from === true)) return no('changed');
        if ((tgt.polarity === true) === c.to) continue;
        if (c.to) tgt.polarity = true; else delete tgt.polarity;
      } else {
        const cur = (typeof tgt[key] === 'string' || typeof tgt[key] === 'number') ? String(tgt[key]) : '';
        if (cur !== (c.from == null ? '' : String(c.from))) return no('changed');
        if (typeof c.to !== 'string') return no('bad');
        if (c.to === cur) continue;
        if (k && c.to === '') delete tgt[key]; else tgt[key] = c.to;
      }
      if (k || f === 'result') needs = true;
      done.push(Object.assign({ field: f, from: c.from, to: c.to }, c.item == null ? {} : { item: c.item, asset: it.assetNo }));
    }
    if (!done.length) return no('nothing');
    if (needs && !(b.reason && String(b.reason).trim())) return no('reason');
    const at = '2026-11-14T15:00:00.000Z';
    d.correctedAt = at;
    d.corrections = (d.corrections || []).concat([Object.assign({ at, by: O.id, name: 'Olive', role: 'owner', changes: done }, b.reason ? { reason: b.reason } : {})]);
    if (d.exportedAt) d.exportDirty = true;
    row.doc = d;
    return json({ at, doc: d });
  };
  srv.fetchImpl = async (url, init = {}) => {
    const p = String(url).split('?')[0].replace(/^https:\/\/[^/]+/, '');
    if (p === '/rest/v1/rpc/correct_job') {
      let b = null; try { b = JSON.parse(init.body); } catch { b = null; }
      srv.fixes.push(b);
      srv.calls.push({ path: p, qs: '', method: 'POST', body: b });
      if (srv.noSql) return json({ code: 'PGRST202', message: 'Could not find the function public.correct_job(changes, holder, job, org, reason) in the schema cache', details: null, hint: null }, 404);
      return srv.correct(b);
    }
    return base(url, init);
  };
  return srv;
}
const phone = (srv, list) => K.phone(srv, list);
const body = (app) => app.doc.getElementById('cloud-look-body');
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
async function ready(opts, list) {
  const srv = cloud(opts);
  const app = phone(srv, list);
  await openCloud(app);
  await openBig(app);
  return app;
}
// The sheet's boxes (synthetic in the harness: set each as a person would type).
const ITEM_F = ['assetNo', 'itemType', 'location', 'result', 'notes', 'readings.class', 'readings.earth', 'readings.insulation', 'readings.leakage'];
function fill(app, v) {
  const id = (f) => 'cfx-' + f.replace('.', '-');
  for (const [f, x] of Object.entries(v)) {
    const el = app.doc.getElementById(id(f));
    if (!el) throw new Error('no box ' + f);
    if (f === 'readings.polarity') el.checked = !!x; else el.value = x;
  }
}
function fillFrom(app) {
  const fix = app.state().cloudFix;
  const v = {};
  for (const [f, x] of Object.entries(fix.from)) v[f] = x;
  fill(app, v);
}
async function save(app, reason) {
  const r = app.doc.getElementById('cfx-reason');
  r.value = reason || '';
  app.doc.getElementById('cloud-fix-save').click();
  await tick(5);
  await until(() => !app.state().cloudFix || !app.state().cloudFix.busy);
  await tick(5);
}
// A sheet on the page body (drawn outside #app), by its id.
const sheetOf = (app, id) => app.doc.body.children.find(c => c.id === id) || null;
const sheetErr = (app) => { const e = app.doc.getElementById('cloud-fix-error'); return e && !e.hidden ? e.textContent : ''; };

module.exports = async function () {
  /* ------------------------------------------------------------------ 106a */
  await t.group('106a — who may correct: a teammate’s locked job in your business; open, own, Your jobs and Engineers not (1A 3A)', async () => {
    const app = await ready();
    await lookAt(app, ED + '|ZZFIX');
    let b = body(app).innerHTML;
    t.includes(b, 'data-look="fix" data-arg="k1"', 'Correct on the first item');
    t.includes(b, 'data-look="fix" data-arg="k2"', '…and the second');
    t.includes(b, 'data-look="fix-job"', 'and on the job (site, name)');
    t.includes(app.doc.getElementById('cloud-look-note').innerHTML, 'You can correct this job', 'the sheet says so');
    t.eq(app.fn('cloudLookFixState')(app.state().cloudLook).can, true, 'the Owner may');
    app.doc.getElementById('cloud-look-close').click();
    // Open: said, nothing to tap.
    await lookAt(app, ED + '|ZZOPEN');
    b = body(app).innerHTML;
    t.includes(b, 'Still being worked on — Eddie needs to lock it before it can be corrected.', 'an open job: lock it first, by name (3A)');
    t.excludes(b, 'data-look="fix"', '…no Correct');
    app.fn('cloudFixOpen')('o1');
    t.notOk(app.state().cloudFix, '…and cloudFixOpen does nothing even if called');
    app.doc.getElementById('cloud-look-close').click();
    // A leaver's locked job, held by the business.
    await lookAt(app, LEE + '|ZZLFIX');
    t.includes(body(app).innerHTML, 'data-look="fix" data-arg="l1"', 'a leaver’s locked job: correctable');
    app.doc.getElementById('cloud-look-close').click();
    // V167.1: your own job is correctable too — 107a has it (an Engineer's own isn't).
    // Office and Team leader may too; an Engineer has no business view at all.
    for (const role of ['office', 'team_leader']) {
      const a = await ready({}, [{ id: BIG, name: 'Big Co', role, def: true, n: 3 }]);
      await lookAt(a, ED + '|ZZFIX');
      t.includes(body(a).innerHTML, 'data-look="fix" data-arg="k1"', role + ': may correct');
    }
    // Changed to Engineer while the look is open: gone at once.
    const a2 = await ready();
    await lookAt(a2, ED + '|ZZFIX');
    a2.run(`localStorage.setItem('pat:businesses', ${J(J({ u: O.id, at: Date.now(), list: [{ id: BIG, name: 'Big Co', role: 'engineer', def: true, n: 3 }] }))})`);
    t.eq(a2.fn('cloudLookFixState')(a2.state().cloudLook).can, false, 'changed to Engineer: no longer');
    a2.fn('cloudFixOpen')('k1');
    t.notOk(a2.state().cloudFix, '…and nothing opens');
  });

  /* ------------------------------------------------------------------ 106b */
  await t.group('106b — a correction: one rpc, only what changed with what it was; the trail; nothing kept here (2C 5A 6A)', async () => {
    const app = await ready();
    await lookAt(app, ED + '|ZZFIX');
    app.stop();
    const before = { storage: storageSnap(app), w: app.srv.writes().length, html: html(app) };
    lookTap(app, 'fix', 'k1');
    const fix = app.state().cloudFix;
    t.ok(fix && fix.item === 'k1', 'the sheet opens for the item');
    const fixSheet = sheetOf(app, 'cloud-fix-sheet');
    t.ok(fixSheet, '…drawn');
    t.eq(Object.keys(fix).includes('_sheet'), false, '…its sheet kept off the copyable state');
    t.deepEq(fix.from, { assetNo: 'E-1', itemType: 'Kettle', location: 'Kitchn', result: 'fail', notes: 'Cracked plug',
      'readings.class': 'I', 'readings.earth': '0.12', 'readings.insulation': '', 'readings.leakage': '', 'readings.polarity': true },
      'starting from the job’s values');
    const sh = fixSheet.innerHTML;
    t.includes(sh, 'value="Kitchn"', 'the location in its box');
    t.includes(sh, '<option value="fail" selected>Fail</option>', 'the result chosen');
    t.includes(sh, '<option value="I" selected>Class I</option>', 'the class chosen');
    t.includes(sh, 'id="cfx-readings-polarity" checked', 'polarity ticked');
    t.includes(sh, 'class="sheet-scroll cloud-fix-body"', 'the form scrolls (a long one on a small phone)');
    fillFrom(app);
    fill(app, { location: '  Kitchen ' });
    await save(app, '');
    t.eq(app.srv.fixes.length, 1, 'one rpc');
    t.deepEq(app.srv.fixes[0], { holder: ED, job: 'ZZFIX', org: BIG, changes: [{ field: 'location', from: 'Kitchn', to: 'Kitchen', item: 'k1' }], reason: null },
      'Eddie’s job in Big Co: only the location, trimmed, with what it was; no reason');
    t.eq(app.state().cloudFix, null, 'the sheet closes');
    t.eq(sheetOf(app, 'cloud-fix-sheet'), null, '…and is gone');
    const look = app.state().cloudLook;
    t.eq(look.doc.items[0].location, 'Kitchen', 'the look shows the cloud’s answer');
    const b = body(app).innerHTML;
    t.includes(b, 'Kitchen', '…repainted');
    t.includes(b, '<strong>Olive</strong> (Owner)', 'the trail names who');
    t.includes(b, 'Item E-1 · Location: ‘Kitchn’ → ‘Kitchen’', '…old → new, by asset number');
    t.includes(b, 'Corrected since its certificate &mdash; make the certificate again', 'made after the certificate: said (4A)');
    t.ok(app.toasts.some(m => m === 'Corrected. Eddie’s phone gets it the next time it syncs.'), 'a toast names Eddie');
    t.eq(html(app), before.html, 'no render while the sheet was open (MAP rule 3)');
    t.eq(app.srv.writes().length, before.w, 'no table written — only the rpc');
    { const a = JSON.parse(before.storage), c = JSON.parse(storageSnap(app));
      t.deepEq(Object.keys(Object.assign({}, a, c)).filter(k => a[k] !== c[k]), [], 'nothing stored on this phone'); }
    // The list row follows (a fail gone, the certificate to make again).
    const raw = app.state().cloudJobs.biz.jobs.find(j => j.user === ED && j.id === 'ZZFIX');
    t.ok(raw.redo === true, 'the list’s row: certificate to make again');
    // The site and job name.
    lookTap(app, 'fix-job');
    t.deepEq(app.state().cloudFix.from, { site: 'ZZ Fix Site', name: '' }, 'the job sheet: site and name');
    fill(app, { site: 'ZZ Fix Site Ltd', name: 'Annual' });
    await save(app, '');
    t.deepEq(app.srv.fixes[1].changes, [{ field: 'site', from: 'ZZ Fix Site', to: 'ZZ Fix Site Ltd' }, { field: 'name', from: '', to: 'Annual' }],
      'site and name, no item');
    t.eq(app.state().cloudLook.doc.site, 'ZZ Fix Site Ltd', 'shown');
    // A number asset is sent as its digits.
    lookTap(app, 'fix', 'k2');
    t.eq(app.state().cloudFix.from.assetNo, '7', 'a number asset number reads as its digits');
    app.doc.getElementById('cloud-fix-cancel').click();
    t.eq(app.state().cloudFix, null, 'Cancel closes, nothing sent');
    t.eq(app.srv.fixes.length, 2, '…still two');
    // Closing the look closes a sheet left open.
    lookTap(app, 'fix', 'k2');
    app.doc.getElementById('cloud-look-close').click();
    t.eq(app.state().cloudFix, null, 'closing the job closes the correction too');
  });

  /* ------------------------------------------------------------------ 106c */
  await t.group('106c — the rules before Save: a reason for a result or reading, a fail’s notes, the class, nothing, too long (7A)', async () => {
    const app = await ready();
    await lookAt(app, ED + '|ZZFIX');
    lookTap(app, 'fix', 'k1');
    fillFrom(app);
    fill(app, { result: 'pass' });
    await save(app, '');
    t.eq(sheetErr(app), 'Add a reason — a result or a reading can only be changed with one.', 'a result with no reason: said');
    t.eq(app.srv.fixes.length, 0, '…nothing sent');
    fill(app, { result: 'fail', 'readings.earth': '0.21' });
    await save(app, '   ');
    t.eq(sheetErr(app), 'Add a reason — a result or a reading can only be changed with one.', 'a reading, blank reason: said');
    fill(app, { 'readings.earth': '0.12', notes: '' });
    await save(app, '');
    t.eq(sheetErr(app), 'A fail needs its reason — add it in Notes.', 'a fail with its notes emptied: said');
    fill(app, { notes: 'Cracked plug' });
    await save(app, '');
    t.eq(sheetErr(app), 'Nothing has changed yet.', 'nothing changed: said');
    fill(app, { location: 'x'.repeat(201) });
    await save(app, '');
    t.eq(sheetErr(app), 'Location is too long — 200 characters at most.', 'too long: said');
    t.eq(app.srv.fixes.length, 0, 'none of those sent');
    // Class I → II: the earth reading and polarity go (Class II has neither).
    fill(app, { location: 'Kitchn', 'readings.class': 'II', 'readings.insulation': '>299' });
    app.doc.getElementById('cfx-readings-polarity').checked = true;
    await save(app, 'Class II really');
    t.eq(app.srv.fixes.length, 1, 'with a reason: sent');
    t.deepEq(app.srv.fixes[0].changes, [
      { field: 'readings.class', from: 'I', to: 'II', item: 'k1' },
      { field: 'readings.earth', from: '0.12', to: '', item: 'k1' },
      { field: 'readings.insulation', from: '', to: '>299', item: 'k1' },
      { field: 'readings.polarity', from: true, to: false, item: 'k1' }], 'the class leaves out what it hasn’t — earth emptied, polarity un-ticked');
    t.eq(app.srv.fixes[0].reason, 'Class II really', '…with the reason');
    t.includes(body(app).innerHTML, 'Reason: Class II really', 'the reason in the trail');
    t.includes(body(app).innerHTML, 'Polarity: ticked → not ticked', 'a tick in words');
    // Fail → pass with a reason.
    lookTap(app, 'fix', 'k1');
    fillFrom(app);
    fill(app, { result: 'pass' });
    await save(app, 'Tapped Fail by mistake');
    t.eq(app.state().cloudLook.doc.items[0].result, 'pass', 'a result corrected, with its reason');
    t.includes(body(app).innerHTML, 'Result: Fail → Pass', '…in the trail');
    // The pure rules.
    const chk = app.fn('cloudFixCheck');
    t.eq(chk([{ field: 'location', from: 'a', to: 'b' }], { location: 'b' }, '', ''), '', 'a text change needs no reason');
    t.eq(chk([{ field: 'notes', from: '', to: 'x'.repeat(1001) }], { notes: 'x'.repeat(1001) }, '', 'k'), 'Notes is too long — 1000 characters at most.', 'notes to 1000');
    t.eq(chk([{ field: 'result', from: 'pass', to: 'fail' }], { result: 'fail', notes: 'x' }, 'y'.repeat(301), 'k'), 'The reason is too long — 300 characters at most.', 'a reason to 300');
  });

  /* ------------------------------------------------------------------ 106d */
  await t.group('106d — when the cloud says no: changed since, unlocked, no signal, no V167 SQL, a lapsed business', async () => {
    const app = await ready();
    await lookAt(app, ED + '|ZZFIX');
    lookTap(app, 'fix', 'k1');
    fillFrom(app);
    fill(app, { location: 'Kitchen' });
    // Eddie's phone changed it meanwhile.
    app.srv.sessions.find(s => s.id === 'ZZFIX' && s.user_id === ED).doc.items[0].location = 'Kit';
    await save(app, '');
    t.eq(app.state().cloudFix, null, 'changed since: the sheet closes');
    t.ok(app.toasts.includes('Someone changed this job since you opened it — it’s been read again. Check it and try once more.'), '…said');
    await until(() => !app.state().cloudLook.loading);
    t.eq(app.state().cloudLook.doc.items[0].location, 'Kit', '…and the job read again');
    // Unlocked meanwhile.
    lookTap(app, 'fix', 'k1');
    fillFrom(app);
    fill(app, { location: 'Kitchen' });
    app.srv.sessions.find(s => s.id === 'ZZFIX' && s.user_id === ED).doc.locked = false;
    await save(app, '');
    t.ok(app.toasts.includes('This job has been unlocked since you opened it, so it can’t be corrected now.'), 'unlocked since: said');
    await until(() => !app.state().cloudLook.loading);
    t.includes(body(app).innerHTML, 'Still being worked on — Eddie needs to lock it', '…and read again: lock it first');
    app.srv.sessions.find(s => s.id === 'ZZFIX' && s.user_id === ED).doc.locked = true;
    app.doc.getElementById('cloud-look-close').click();
    // No signal.
    await lookAt(app, ED + '|ZZFIX');
    lookTap(app, 'fix', 'k1');
    fillFrom(app);
    fill(app, { location: 'Kitchen' });
    const n = app.srv.fixes.length;
    app.run('navigator.onLine = false');
    await save(app, '');
    t.eq(sheetErr(app), 'No signal — a correction needs a connection.', 'no signal: said in the sheet');
    t.eq(app.srv.fixes.length, n, '…nothing sent');
    t.ok(app.state().cloudFix, '…the sheet stays, the typing kept');
    app.run('navigator.onLine = true');
    // A lapsed business.
    app.srv.lapsed = true;
    await save(app, '');
    t.eq(sheetErr(app), 'This business’s PATGo plan has ended, so the cloud isn’t taking changes.', 'a lapsed business: said');
    app.srv.lapsed = false;
    t.eq(app.doc.getElementById('cloud-fix-save').disabled, false, 'Save usable again');
    // No V167 SQL.
    const a2 = await ready({ noSql: true });
    await lookAt(a2, ED + '|ZZFIX');
    lookTap(a2, 'fix', 'k1');
    fillFrom(a2);
    fill(a2, { location: 'Kitchen' });
    await save(a2, '');
    t.eq(sheetErr(a2), 'The cloud needs a small update before jobs can be corrected (the V167 database update).', 'no V167 SQL: names the update');
    // The pure reading of the cloud's refusals.
    const code = a2.fn('_syncFixCode');
    t.eq(code({ message: 'patgo_correct_not_allowed' }), 'not_allowed', 'patgo_correct_not_allowed');
    t.eq(code({ message: 'patgo_correct_whatever' }), '', 'an unknown code is not trusted');
    t.eq(a2.fn('_syncFixNeedsUpdate')({ code: 'PGRST202', message: 'Could not find the function public.correct_job' }), true, 'PGRST202: the update');
    t.eq(a2.fn('_syncFixNeedsUpdate')({ code: 'P0001', message: 'patgo_correct_bad' }), false, 'a refusal is not the update');
  });

  /* ------------------------------------------------------------------ 106e */
  await t.group('106e — the certificate and the holder’s phone: the badge, Modified since, the Overview card, the trail (escaped), the cloud row (4A 8A)', async () => {
    const app = freshApp();
    const f = app.fn('jobCorrectedSinceCertificate');
    t.eq(f({ reportAt: REP, correctedAt: '2026-11-14T15:00:00.000Z' }), true, 'corrected after the certificate: make it again');
    t.eq(f({ reportAt: REP, correctedAt: '2026-11-01T15:00:00.000Z' }), false, 'corrected before it: the certificate is newer');
    t.eq(f({ correctedAt: '2026-11-14T15:00:00.000Z' }), false, 'no certificate: nothing to make again');
    t.eq(f({ reportAt: REP, correctedAt: 'garbage' }), false, 'an unreadable time: no');
    t.eq(f({ reportAt: REP }), false, 'never corrected: no');
    // A job on the holder's phone, as the pull brings it.
    withSession(app, { site: 'ZZ Holder Site' });
    withItem(app, { assetNo: 'E-1', location: 'Kitchen', result: 'pass' });
    const id = app.fn('activeSession')().id;
    app.run(`(() => { const s = state.sessions.find(x => x.id === ${J(id)});
      s.locked = true; s.lockedAt = '2026-11-09T10:00:00.000Z'; s.reportAt = ${J(REP)};
      s.correctedAt = '2026-11-14T15:00:00.000Z';
      s.corrections = [{ at: '2026-11-14T15:00:00.000Z', by: 'x', name: '<img src=x onerror=1>Olive', role: 'owner',
        reason: '<b>typo</b>', changes: [{ item: 'a', asset: '<i>E-1</i>', field: 'location', from: 'Kitchn', to: 'Kitchen' },
          { item: 'a', asset: 'E-1', field: 'readings.polarity', from: true, to: false }, { bad: 1 }] }, 'junk'];
      save(); })()`);
    const sess = app.fn('activeSession')();
    t.eq(app.fn('jobDoneStatus')(sess), 'corrected', 'the job’s status: corrected');
    t.eq(app.fn('jobPaperworkDone')(sess), false, 'its paperwork is not done');
    app.run('state.view = "sessions"; state.sessionFilter = "all"; render();');
    t.includes(html(app), 'Corrected since certificate</span>', 'the Jobs list badge');
    app.run('state.sessionFilter = "modified"');
    t.ok(app.fn('sessionMatchesControlFilters')(sess), 'Modified since lists it');
    app.run('state.sessionFilter = "all"');
    // The Overview card and the trail sheet.
    app.run(`state.activeId = ${J(id)}; state.view = "overview"; render();`);
    const h = html(app);
    t.includes(h, 'data-action="corrections-open"', 'the Overview card');
    t.includes(h, 'Corrected by &lt;img src=x onerror=1&gt;Olive (Owner)', '…the name escaped, the role');
    t.includes(h, 'Corrected since its certificate &mdash; make the certificate again.', '…make the certificate again');
    t.excludes(h, '<img src=x', 'nothing from the cloud as markup');
    tap(app, 'corrections-open');
    const sheet = sheetOf(app, 'corrections-sheet');
    t.ok(sheet, 'the trail opens');
    t.includes(sheet.innerHTML, 'Reason: &lt;b&gt;typo&lt;/b&gt;', 'the reason escaped');
    t.includes(sheet.innerHTML, 'Item &lt;i&gt;E-1&lt;/i&gt; · Location: ‘Kitchn’ → ‘Kitchen’', 'the asset escaped');
    t.includes(sheet.innerHTML, 'Polarity: ticked → not ticked', 'a tick in words');
    t.includes(sheet.innerHTML, 'Corrections (1)', 'a malformed entry skipped');
    app.doc.getElementById('corrections-close').click();
    // Certificate made again: done.
    app.run(`(() => { const s = state.sessions.find(x => x.id === ${J(id)}); s.reportAt = '2026-11-14T16:00:00.000Z'; })()`);
    t.eq(app.fn('jobDoneStatus')(app.fn('activeSession')()), 'certificate', 'certificate made again: done');
    app.run('render()');
    t.includes(html(app), 'Corrected by', 'the card stays (the trail is kept)');
    t.excludes(html(app), 'make the certificate again.', '…without the make-again line');
    // The cloud row, from its two picks.
    const r = app.fn('_syncRedo');
    t.eq(r({ rep: REP, cor: '2026-11-14T15:00:00.000Z' }), true, 'the row’s picks: make it again');
    t.eq(r({ rep: null, cor: '2026-11-14T15:00:00.000Z' }), false, '…no certificate: no');
    t.eq(r({ rep: REP, cor: null }), false, '…never corrected: no');
    t.includes(read('sync.js'), "n_items,n_fails,rep:doc->>reportAt,cor:doc->>correctedAt';", 'the list reads the two picks');
    const s = cloud();
    const a = phone(s);
    s.sessions.find(x => x.id === 'ZZFIX').doc.correctedAt = '2026-11-14T15:00:00.000Z';
    await openCloud(a);
    await openBig(a);
    t.includes(html(a), 'Corrected &mdash; certificate to make again', 'the cloud row says so');
    t.eq((html(a).match(/certificate to make again/g) || []).length, 1, '…on that job only');
    // The pull takes a job whole — its trail and correctedAt with it.
    t.includes(read('sync.js'), '  state.sessions[i] = doc;\n  return true;', 'a pulled job replaces the phone’s copy whole (the trail comes with it)');
  });

  /* ------------------------------------------------------------------ 106f */
  await t.group('106f — the SQL in step (C1–C5, isolation 32a–32c); release: V167; cache pat-v167; What’s new one line; About V167 / V166 / V165', () => {
    const mig = read('supabase/v167-corrections.sql');
    const end = '-- ================================================================ end V167\n';
    const block = mig.slice(mig.indexOf('-- ================================================================ V167\n'), mig.indexOf(end) + end.length);
    t.ok(block.length > 4000, 'the migration has its definition');
    t.ok(read('supabase/schema.sql').trimEnd().endsWith(block.trimEnd()), 'a new project gets it byte for byte, as schema.sql’s last section');
    t.includes(block, "returns jsonb language plpgsql volatile security definer set search_path = '' as $$", 'its own rights, a pinned search path');
    t.includes(block, "if not public.can_read_org(s.org_id) then raise exception 'patgo_correct_not_allowed'; end if;", 'only Owner / Team leader / Office of the JOB’s business');
    t.excludes(block, "patgo_correct_own", 'V167.1: your own job too — no own refusal (107d)');
    t.includes(block, "(d -> 'locked') is distinct from 'true'::jsonb then", 'locked only');
    t.includes(block, "raise exception 'patgo_correct_changed';", 'what it was must still be so');
    t.includes(block, "if (needs and why is null) or length(coalesce(why, '')) > 300 then raise exception 'patgo_correct_reason'; end if;", 'a reason for a result or reading');
    t.includes(block, "select x.* into s from public.sessions x where x.user_id = holder and x.id = job for update;", 'the row held while it is changed');
    t.includes(block, "revoke all on function public.correct_job(uuid, text, uuid, jsonb, text) from public, anon;", 'nobody signed out');
    for (const n of ['1', '2', '3', '4', '5']) t.includes(mig, `select ${n}, '`, 'self-check C' + n);
    const iso = read('supabase/isolation-test.sql');
    for (const g of ['32a', '32b', '32c']) t.includes(iso, `res := res || array['${g}|`, 'isolation ' + g);
    t.includes(iso, "32a|A corrects B''s locked job in A''s business, the change kept with A''s name|FAIL|run supabase/v167-corrections.sql first", '…32a names the file');
    // Release.
    const rel = freshApp();
    t.eq(rel.run('APP_VERSION'), 'V167', 'APP_VERSION V167');
    t.eq(rel.run('WELCOME_VERSION'), 'V167', 'What’s new rolled (a feature release)');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v167-1';", 'cache key pat-v167-1 (V167.1 hotfix — the key only; 107d)');
    t.eq(rel.fn('updateVersionLabel')('pat-v167-1'), 'V167.1', 'the update banner reads the key as V167.1');
    const core = read('render-core.js');
    const at = core.indexOf('<ul class="welcome-list sheet-scroll">');
    const sheetCopy = core.slice(at, core.indexOf('</ul>', at));
    t.eq((sheetCopy.match(/<li>/g) || []).length, 1, 'What’s new: one line');
    t.includes(sheetCopy, '<li><strong>Mistakes can be corrected by the office.</strong>', '…corrections');
    t.includes(sheetCopy, 'picks it up on its next sync.</li>', '…and the engineer’s phone');
    const help = read('render-help.js');
    const x = help.indexOf('<p><strong>V167</strong>'), y = help.indexOf('<p><strong>V166</strong>'), z = help.indexOf('<p><strong>V165</strong>');
    t.ok(x > -1 && y > x && z > y, 'About: V167, V166, V165');
    t.excludes(help, '<p><strong>V164</strong>', 'V164 rolled off');
    t.excludes(help, 'One place for your jobs in the cloud: every job is listed', '…with its line');
    t.includes(help, 'Photos when you look at a cloud job: tap Show photos', 'About: V165’s line, the oldest');
    t.includes(help, 'Corrections: Owners, Team leaders and the Office can fix a mistake', 'About: V167’s line');
    t.includes(read('sync.js'), "V167 (1A 2C 3A 5A 7A): correcting someone else's job", 'sync.js names V167');
  });
};

// V167.1: the stand-in and helpers, for 107-v167-1.js.
module.exports.kit = { cloud, phone, body, lookTap, lookAt, ready, fill, fillFrom, save, sheetErr, sheetOf };
