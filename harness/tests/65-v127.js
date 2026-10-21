/* Standing test — V127: the plan — trial end, grace, the lock
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked (14 Oct, Peter): 0A lapse handling (R8) on the
   phone. 2A the phone decides a trial has ended (trial_ends_at passed; a
   `lapsed` from the database too). 3A seven days' grace. 4A a line from seven
   days before the end. 5B what is sold is the workflow: after the grace the
   ACCOUNT is locked — 8B no new jobs, no logging, no new certificates; 9A a job
   in progress too. 6 four touches (the line, a sheet at the end, the countdown,
   a sheet on the last day), each with Renew now. 10A Renew opens PLAN_RENEW_URL,
   or an email to hello@patgo.co.uk until payment exists. 11A on, on the test site.

     65a  the rules: every phase from the record and a time (pure).
     65b  locked: every way in to a new job, a test or a certificate is refused
          through the real action, nothing is written, and the sheet says why.
          In grace the same actions work.
     65c  locked: the records stay the engineer's — a job opens, deletes, and
          Export everything opens (from the lock sheet too).
     65d  whose lock: another account's record, signed out, or no plan.js at all
          → nothing is locked (fail open).
     65e  the Jobs list line and the Account page, per phase; Renew now.
     65g  the two sheets: once each per ending, Jobs list only.
     65h  time: the server's time wins over a phone clock wound back, and the
          phone's own clock never ratchets the record.
     65i  reading the plan: planRefresh reads its own profile by id; the sign-in
          check feeds the record too; the return-to-front hook only when signed in.
     65f  plan.js placed and started, its key kept out of backups. (The release
          checks moved to 66f at V128.)

   ⚠ Signed in = supabase-js's own stored session under the test key, exactly as
   the cloud tests seed it. Booted offline, so no library load is attempted. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, withSession, withItem, tick } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const DAY = 24 * 60 * 60 * 1000;
const UID = '11111111-1111-1111-1111-111111111111';
const AUTH = 'patgo:cloudAuth:test';

function session(email = 'renew@example.com', issuedMs = Date.now(), uid = UID) {
  return JSON.stringify({
    access_token: 'ZZACCESS', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(issuedMs / 1000) + 3600, refresh_token: 'ZZREFRESH',
    user: { id: uid, email, aud: 'authenticated', role: 'authenticated' },
  });
}

function record(o = {}) {
  return JSON.stringify(Object.assign({ uid: UID, plan: 'trial', trialEndsAt: null, lapsedSeenAt: null,
    serverAt: 0, checkedAt: Date.now(), shownEnded: '', shownLastDay: '' }, o));
}

const iso = (ms) => new Date(ms).toISOString();
const ended = (daysAgo) => ({ plan: 'trial', trialEndsAt: iso(Date.now() - daysAgo * DAY) });

/* A signed-in app on the Jobs list. plan: a record (or null), signedIn: false
   for no stored sign-in. */
function ready(o = {}) {
  const ls = {};
  if (o.signedIn !== false) ls[AUTH] = o.session || session();
  if (o.plan) ls['pat:plan'] = record(o.plan);
  const app = freshApp({ localStorage: ls, navigator: { onLine: false }, skip: o.skip });
  const st = app.state();
  st.welcomeSeen = true;
  st.onboardedV33Seen = true;
  st.migrationPrompt = { show: false, name: '', items: [] };
  st.newForm.show = false;   // an empty phone opens with the New job form showing
  closeSheets(app);
  return app;
}

const sheets = (app) => app.doc.body.children.filter(c => c && /bulk-sheet/.test(c.className || ''));
const lockSheets = (app) => sheets(app).filter(s => /Renew to carry on/.test(s.innerHTML));
function closeSheets(app) {
  app.doc.body.children.slice().forEach(c => { if (c && /bulk-sheet|modal-backdrop/.test(c.className || '')) c.remove(); });
}
function rearm(app) {
  const r = JSON.parse(app.storage.getItem('pat:plan'));
  r.shownEnded = ''; r.shownLastDay = '';
  app.storage.setItem('pat:plan', JSON.stringify(r));
}
const lockNow = (app) => app.storage.setItem('pat:plan', record(ended(10)));
const graceNow = (app) => app.storage.setItem('pat:plan', record(ended(2)));
const act = (app, name, arg) => app.run(`ACTIONS[${JSON.stringify(name)}](${arg === undefined ? '' : JSON.stringify(arg)})`);
function fillForm(app, asset) {
  const st = app.state();
  st.form.assetNo = asset; st.form.location = 'Office'; st.form.itemType = 'Kettle'; st.form.notes = '';
}
const ukDate = (ms) => { const d = new Date(ms); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };

module.exports = async function run() {

  /* ------------------------------------------------------------------ 65a */
  await t.group('65a — the rules: trial, ending, grace, locked, paid (pure)', () => {
    const app = ready();
    const S = app.fn('planStatus');
    const now = Date.now();
    const at = (o) => S(JSON.parse(record(o)), now);
    const ended = (d) => ({ plan: 'trial', trialEndsAt: iso(now - d * DAY) });   // against THIS now
    t.eq(S(null, now).phase, 'none', 'no record: nothing');
    t.eq(at({ plan: 'active' }).phase, 'paid', 'active: paid');
    t.eq(at({ plan: 'comped' }).phase, 'paid', 'comped: paid');
    t.eq(at({ plan: 'trial', trialEndsAt: null }).phase, 'trial', 'a trial with no end never ends');
    t.eq(at({ plan: 'trial', trialEndsAt: iso(now + 30 * DAY) }).phase, 'trial', '30 days to go: just a trial');
    const ending = at({ plan: 'trial', trialEndsAt: iso(now + 3 * DAY) });
    t.eq(ending.phase, 'ending', '3 days to go: ending (4A)');
    t.eq(at({ plan: 'trial', trialEndsAt: iso(now + 7 * DAY) }).phase, 'ending', 'exactly 7 days out: ending');
    t.eq(at({ plan: 'trial', trialEndsAt: iso(now + 7 * DAY + 1000) }).phase, 'trial', 'just over 7 days: not yet');
    const g = at(ended(2));
    t.eq(g.phase, 'grace', 'ended 2 days ago: grace (3A)');
    t.eq(g.daysLeft, 5, '… 5 days left');
    t.eq(g.lockAt - g.endsAt, 7 * DAY, 'the lock is 7 days after the end');
    t.eq(at(ended(6.5)).daysLeft, 1, 'half a day left counts as 1');
    t.eq(at(ended(10)).phase, 'locked', 'ended 10 days ago: locked (5B)');
    const end = now - 7 * DAY;
    t.eq(S(JSON.parse(record({ plan: 'trial', trialEndsAt: iso(end) })), end + 7 * DAY).phase, 'locked', 'locked at the moment the grace runs out');
    t.eq(S(JSON.parse(record({ plan: 'trial', trialEndsAt: iso(end) })), end + 7 * DAY - 1).phase, 'grace', '… not a moment before');
    t.eq(at({ plan: 'lapsed', trialEndsAt: iso(now - 30 * DAY), lapsedSeenAt: now }).phase, 'locked', 'lapsed after a trial long gone: counted from the trial end');
    const lap = at({ plan: 'lapsed', trialEndsAt: null, lapsedSeenAt: now - 3 * DAY });
    t.eq(lap.phase, 'grace', 'lapsed with no trial behind it: grace from when this phone heard (2A)');
    t.eq(lap.daysLeft, 4, '… 4 days left');
    t.ok(lap.lapsed, '… and it says plan, not trial');
    t.eq(at({ plan: 'lapsed', trialEndsAt: iso(now + 10 * DAY), lapsedSeenAt: now - 1 * DAY }).phase, 'grace', 'a lapsed plan is never a trial still running');
    t.eq(at({ plan: 'something-new' }).phase, 'none', 'a plan this version does not know: fails open');
    t.eq(at({ plan: 'trial', trialEndsAt: 'not a date' }).phase, 'trial', 'an unreadable end date: fails open');
    // The database's own format, microseconds and all — cut to milliseconds for Safari.
    t.eq(app.fn('_planIsoForSafari')('2026-10-14T09:00:00.123456+00:00'), '2026-10-14T09:00:00.123+00:00', 'microseconds cut to milliseconds (WebKit reads that)');
    t.eq(app.fn('_planIsoForSafari')('2026-10-14T09:00:00+00:00'), '2026-10-14T09:00:00+00:00', '… a date without a fraction left alone');
    const dbEnd = new Date(now - 10 * DAY).toISOString().replace('Z', '').replace(/\.(\d{3})$/, '.$1456+00:00');
    t.eq(at({ plan: 'trial', trialEndsAt: dbEnd }).phase, 'locked', 'a database-format end date locks on time');
  });

  /* ------------------------------------------------------------------ 65b */
  await t.group('65b — locked: no new job, no test, no certificate — through the real actions (5B 8B 9A)', () => {
    const app = ready();
    const sess = withSession(app);
    withItem(app, { assetNo: 'L1', result: 'pass' });
    withItem(app, { assetNo: 'F1', result: 'fail', notes: 'Damaged plug' });
    t.eq(sess.items.length, 2, 'before the lock, logging works');
    lockNow(app);
    t.ok(app.fn('planLocked')(), 'the record now says locked');
    const st = app.state();
    const jobs = st.sessions.length;
    const tries = [
      ['log-pass', () => { fillForm(app, 'L2'); act(app, 'log-pass'); }],
      ['log-fail', () => { fillForm(app, 'L3'); act(app, 'log-fail'); }],
      ['copy-last', () => { fillForm(app, 'L4'); act(app, 'copy-last'); }],
      ['multipick-fire', () => { act(app, 'multipick-fire', '0'); }],
      ['Log again ×3', () => { app.fn('repeatLastResult')(3); }],
      ['saveItem (every other path ends here)', () => { fillForm(app, 'L5'); app.fn('saveItem')('pass'); }],
      ['a Quick Pick tile', () => { app.fn('qpTileFire')({ type: 'Kettle' }); }],
    ];
    tries.forEach(([what, run]) => {
      closeSheets(app);
      run();
      t.eq(sess.items.length, 2, `${what}: nothing logged (9A — the job in progress too)`);
      t.eq(lockSheets(app).length, 1, `${what}: the Renew sheet says why`);
    });
    t.eq(st.failModalOpen ? 'open' : 'shut', 'shut', 'FAIL never opened its sheet (refused before it)');

    // Changing an old FAIL to PASS asks a question first (V95) — refused before
    // the question, not after the engineer has answered it.
    closeSheets(app);
    st.cursor = 1; app.fn('loadFormForCursor')();
    act(app, 'log-pass');
    t.eq(sess.items[1].result, 'fail', 'an old FAIL is not changed');
    t.eq(sheets(app).length, 1, 'one sheet only …');
    t.eq(lockSheets(app).length, 1, '… the Renew sheet, not "Change to PASS?"');
    st.cursor = sess.items.length; app.fn('loadFormForCursor')();

    closeSheets(app);
    act(app, 'new-session');
    t.notOk(st.newForm.show, 'New job: the form does not open (refused before the typing, not after)');
    t.eq(lockSheets(app).length, 1, '… the Renew sheet instead');
    closeSheets(app);
    st.newForm.site = 'Somewhere'; app.fn('createSession')();
    t.eq(st.sessions.length, jobs, 'createSession itself refuses (backstop)');
    closeSheets(app);
    act(app, 'dup-job-open');
    t.ok(!st.dupJob, 'Duplicate job: refused before its sheet');
    t.eq(lockSheets(app).length, 1, '… with the Renew sheet');
    closeSheets(app);
    st.moveJob = { step: 'confirm', from: sess.id, ids: [] };
    app.fn('moveItemsToNewJob')();
    t.eq(st.sessions.length, jobs, 'Move items to a new job: refused');
    t.eq(lockSheets(app).length, 1, '… with the Renew sheet');
    closeSheets(app);
    st.reportSettings.enabled = true;
    const certBefore = sess.certNo;
    act(app, 'produce-report', sess.id);
    t.eq(lockSheets(app).length, 1, 'Certificate: refused with the Renew sheet (8B)');
    t.eq(sess.certNo, certBefore, '… and no certificate number spent');
    closeSheets(app);
    app.fn('reopenReportPreview')(sess.id);
    t.eq(lockSheets(app).length, 1, 'the preview rebuilt from Report settings: refused too');

    // In grace, the same actions go through.
    closeSheets(app);
    graceNow(app);
    t.notOk(app.fn('planLocked')(), 'grace: not locked');
    fillForm(app, 'G1'); act(app, 'log-pass');
    t.eq(sess.items.length, 3, 'grace: PASS logs (3A)');
    t.eq(lockSheets(app).length, 0, '… and no Renew sheet');
    act(app, 'new-session');
    t.ok(st.newForm.show, 'grace: New job opens its form');
  });

  /* ------------------------------------------------------------------ 65c */
  await t.group('65c — locked: the records stay theirs — view, delete, Export everything', () => {
    const app = ready();
    const a = withSession(app, { site: 'Site A' });
    withItem(app, { assetNo: 'A1' });
    const b = withSession(app, { site: 'Site B' });
    lockNow(app);
    const st = app.state();
    st.view = 'sessions';
    app.fn('openSession')(a.id);
    t.eq(st.view, 'entry', 'a job still opens');
    t.eq(app.fn('activeSession')().items[0].assetNo, 'A1', '… showing what was logged');
    app.fn('deleteSession')(b.id);
    t.ok(!st.sessions.some(s => s.id === b.id), 'a job can still be deleted');
    closeSheets(app);
    act(app, 'export-all');
    t.ok(sheets(app).length >= 1 && lockSheets(app).length === 0, 'Export everything opens, unrefused');
    closeSheets(app);
    act(app, 'log-pass');
    t.eq(lockSheets(app).length, 1, 'the lock sheet');
    t.ok(lockSheets(app)[0].innerHTML.indexOf('Export everything') > -1, '… offers Export everything');
    t.includes(lockSheets(app)[0].innerHTML, 'Nothing is deleted', '… and says nothing is lost');
    app.doc.getElementById('choice-sheet-1').click();
    t.eq(lockSheets(app).length, 0, 'tapping it closes the lock sheet');
    t.ok(sheets(app).length >= 1, '… and opens Export everything');
    t.ok(typeof app.run('buildBackup()') === 'object' || typeof app.run('buildBackup()') === 'string', 'a backup still builds');
  });

  /* ------------------------------------------------------------------ 65d */
  await t.group('65d — whose lock: another account, signed out, or no plan.js → nothing locked', () => {
    const other = ready({ plan: Object.assign({ uid: '22222222-2222-2222-2222-222222222222' }, ended(10)) });
    t.notOk(other.fn('planLocked')(), "another login's record is ignored");
    t.eq(other.fn('planRecord')(), null, '… planRecord gives nothing');

    const out = ready({ signedIn: false, plan: ended(10) });
    t.notOk(out.fn('planLocked')(), 'signed out: no account, no lock (until launch needs an account)');
    const s1 = withSession(out);
    withItem(out, { assetNo: 'S1' });
    t.eq(s1.items.length, 1, '… and logging works');

    const none = ready({ plan: ended(10), skip: ['plan.js'] });
    t.eq(none.run('typeof planGate'), 'undefined', 'plan.js missing');
    const s2 = withSession(none);
    withItem(none, { assetNo: 'N1' });
    t.eq(s2.items.length, 1, '… the app still boots and logs (fails open — MAP rule 6)');
    none.state().view = 'sessions';
    t.doesNotThrow(() => none.fn('render')(), '… and draws the Jobs list');
  });

  /* ------------------------------------------------------------------ 65e */
  await t.group('65e — the Jobs list line and the Account page, per phase (4A, 6b)', () => {
    const html = (app) => { app.state().view = 'sessions'; app.fn('render')(); return app.doc.getElementById('app').innerHTML; };
    const endAt = Date.now() + 3 * DAY;
    const ending = ready({ plan: { plan: 'trial', trialEndsAt: iso(endAt) } });
    const h1 = html(ending);
    t.includes(h1, `Your free trial ends on ${ukDate(endAt)}.`, 'ending: the end date, UK style (4A)');
    t.includes(h1, 'data-action="plan-renew"', '… with Renew now');
    t.ok(h1.indexOf('id="plan-banner"') > h1.indexOf('id="screen-title"'), '… under the title');

    const grace = ready({ plan: ended(2) });
    const g = grace.fn('planCurrent')();
    t.includes(html(grace), `Your free trial has ended. Logging locks in 5 days, on ${ukDate(g.lockAt)}.`, 'grace: the countdown');
    const last = ready({ plan: ended(6.5) });
    t.includes(html(last), 'Logging locks within a day.', 'the last day says so');
    const lapsed = ready({ plan: { plan: 'lapsed', trialEndsAt: null, lapsedSeenAt: Date.now() - DAY } });
    t.includes(html(lapsed), 'Your PATGo plan has ended.', 'a lapsed plan says plan, not trial');
    const locked = ready({ plan: ended(10) });
    t.includes(html(locked), 'Your account is locked. Renew to carry on logging tests, starting jobs and making certificates.', 'locked: says so');
    t.excludes(html(locked), 'plan-banner-dismiss', '… and is not dismissible');

    t.excludes(html(ready({ plan: { plan: 'comped' } })), 'id="plan-banner"', 'comped: no line');
    t.excludes(html(ready({ plan: { plan: 'trial', trialEndsAt: iso(Date.now() + 30 * DAY) } })), 'id="plan-banner"', '30 days left: no line yet');
    t.excludes(html(ready({ signedIn: false, plan: ended(10) })), 'id="plan-banner"', 'signed out: no line');

    const acc = ready({ plan: ended(2) });
    const st = acc.state();
    st.view = 'cloudAccount';
    acc.fn('render')();
    const a = acc.doc.getElementById('app').innerHTML;
    t.includes(a, 'id="cloud-plan-status"', 'Account page: the same line');
    t.includes(a, 'id="cloud-plan-renew"', '… and Renew now');

    // Renew now (10A). V142: with paying on (signed in, a cloud) it is the
    // Subscribe choice — 81b. Where paying isn't on, still an email to us.
    acc.run('billingAvailable = function () { return false; }');
    const before = acc.sandbox.location.href;
    act(acc, 'plan-renew');
    const href = acc.sandbox.location.href;
    t.ok(href !== before && href.indexOf('mailto:hello@patgo.co.uk?subject=') === 0, 'Renew now opens an email to hello@patgo.co.uk');
    t.includes(href, encodeURIComponent('renew@example.com'), '… naming the account');
    t.eq(acc.run('PLAN_RENEW_URL'), '', 'no payment address in config.js — paying is Stripe\u2019s pages (V142)');
    const src = read('plan.js');
    t.includes(src, "PLAN_RENEW_URL + (PLAN_RENEW_URL.indexOf('?') === -1 ? '?' : '&') + 'email='", 'with one, Renew opens it with the email (the swap is one line in config.js)');
  });

  /* ------------------------------------------------------------------ 65g */
  await t.group('65g — the two sheets: once each per ending, Jobs list only (6a, last day)', () => {
    const app = ready({ plan: ended(2) });
    const st = app.state();
    st.view = 'sessions';
    rearm(app);
    closeSheets(app);
    const P = app.fn('planMaybePrompt');
    t.eq(P(), 'ended', 'grace begins: the ended sheet');
    const sh = sheets(app)[0];
    t.ok(sh && /Your free trial has ended/.test(sh.innerHTML), '… titled so');
    t.includes(sh.innerHTML, 'Renew now', '… with Renew now');
    t.includes(sh.innerHTML, `until ${ukDate(app.fn('planCurrent')().lockAt)}`, '… and the lock date');
    t.eq(P(), '', 'not twice while it is open');
    closeSheets(app);
    t.eq(P(), '', 'nor after it is closed');

    // The last day: one more.
    const rec = JSON.parse(app.storage.getItem('pat:plan'));
    rec.trialEndsAt = iso(Date.now() - 6.5 * DAY);
    const g = app.fn('planStatus')(rec, Date.now());
    rec.shownEnded = String(g.lockAt);
    app.storage.setItem('pat:plan', JSON.stringify(rec));
    t.eq(P(), 'last', 'the last day: its sheet');
    t.ok(/Last day before the lock/.test(sheets(app)[0].innerHTML), '… titled so');
    closeSheets(app);
    t.eq(P(), '', 'once');

    // Heard about it first on the last day: one sheet, not two.
    const late = ready({ plan: ended(6.5) });
    late.state().view = 'sessions';
    rearm(late);
    closeSheets(late);
    t.eq(late.fn('planMaybePrompt')(), 'last', 'first heard on the last day: the last-day sheet');
    closeSheets(late);
    t.eq(late.fn('planMaybePrompt')(), '', '… and not the ended one after it');

    // Only the Jobs list, nothing open.
    const busy = ready({ plan: ended(2) });
    busy.state().view = 'entry';
    rearm(busy);
    closeSheets(busy);
    t.eq(busy.fn('planMaybePrompt')(), '', 'never on the logging screen (nothing interrupts a job)');
    busy.state().view = 'sessions';
    busy.state().newForm.show = true;
    t.eq(busy.fn('planMaybePrompt')(), '', 'never over a New job being typed');
    busy.state().newForm.show = false;
    t.eq(busy.fn('planMaybePrompt')(), 'ended', 'then, on the quiet Jobs list, it shows');

    // At start-up (planBoot, as boot.js calls it): shows on its own, offline.
    const fresh = ready({ plan: ended(2) });
    rearm(fresh);
    closeSheets(fresh);
    fresh.state().view = 'sessions';
    fresh.fn('planBoot')();
    t.ok(fresh.doc.body.children.some(c => /Your free trial has ended/.test(c.innerHTML || '')), 'start-up on the Jobs list: the sheet appears by itself');
    t.ok(JSON.parse(fresh.storage.getItem('pat:plan')).shownEnded, '… and is noted, so the next start does not repeat it');

    t.eq(ready({ plan: ended(10) }).fn('planMaybePrompt')(), '', 'locked: no nag sheets — the line and the refusal say it');
  });

  /* ------------------------------------------------------------------ 65h */
  await t.group('65h — time: the server wins over a clock wound back; the phone never ratchets', () => {
    const now = Date.now();
    // The real time is 20 days later than this phone says: the sign-in was issued then.
    const app = ready({ session: session('renew@example.com', now + 20 * DAY), plan: { plan: 'trial', trialEndsAt: iso(now + 5 * DAY) } });
    t.ok(app.fn('planNow')(app.fn('planRecord')()) >= now + 20 * DAY - 1000, 'now = the server time seen (to the second)');
    t.eq(app.fn('planCurrent')().phase, 'locked', 'a clock wound back 20 days does not buy the trial back');
    app.fn('planNote')({ plan: 'trial', trial_ends_at: iso(now + 5 * DAY) });
    const kept = JSON.parse(app.storage.getItem('pat:plan')).serverAt;
    t.eq(kept, (Math.floor((now + 20 * DAY) / 1000) + 3600 - 3600) * 1000, 'the record keeps the server time — exactly the sign-in’s issue time');
    app.storage.setItem(AUTH, session('renew@example.com', now - DAY));
    t.eq(app.fn('planCurrent')().phase, 'locked', '… so an older sign-in later does not undo it');

    // A phone clock that runs ahead is not written into the record.
    const ahead = ready({ session: session('renew@example.com', now - 2 * DAY) });
    ahead.fn('planNote')({ plan: 'trial', trial_ends_at: iso(now + 30 * DAY) });
    t.eq(JSON.parse(ahead.storage.getItem('pat:plan')).serverAt, (Math.floor((now - 2 * DAY) / 1000)) * 1000, 'serverAt is the server’s time, never the phone’s');
  });

  /* ------------------------------------------------------------------ 65i */
  await t.group('65i — reading the plan: its own profile by id; sign-in feeds it; the hook when signed in', async () => {
    const app = ready({ plan: ended(10) });
    t.ok(app.fn('planLocked')(), 'locked before the read');
    const calls = [];
    const q = {
      select(c) { calls.push(['select', c]); return q; },
      eq(k, v) { calls.push(['eq', k, v]); return q; },
      maybeSingle() { calls.push(['maybeSingle']); return Promise.resolve({ data: { plan: 'comped', trial_ends_at: null }, error: null }); },
    };
    app.run('cloudClient = () => Promise.resolve(globalThis.__fakeClient)');
    app.sandbox.__fakeClient = { from(t2) { calls.push(['from', t2]); return q; } };
    app.nav.onLine = true;
    const ok = await app.fn('planRefresh')();
    t.ok(ok, 'the read lands');
    t.deepEq(calls[0], ['from', 'profiles'], 'from profiles');
    t.ok(calls.some(c => c[0] === 'eq' && c[1] === 'id' && c[2] === UID), '… its own row, by id (an Owner may read others — rule 18 spirit)');
    t.eq(JSON.parse(app.storage.getItem('pat:plan')).plan, 'comped', 'the record now says comped');
    t.notOk(app.fn('planLocked')(), '… and the lock lifts (renewed = carry on, nothing else to do)');

    // The sign-in / Check connection read (cloud.js) feeds the same record.
    const c2 = ready({ plan: { plan: 'trial', trialEndsAt: iso(Date.now() + 30 * DAY) } });
    c2.run('cloudClient = () => Promise.resolve(globalThis.__fakeClient)');
    c2.sandbox.__fakeClient = { from() { return { select() { return this; }, eq() { return this; }, maybeSingle() { return Promise.resolve({ data: { plan: 'trial', trial_ends_at: iso(Date.now() - 10 * DAY) }, error: null }); } }; } };
    c2.nav.onLine = true;
    c2.state().cloud.busy = false;
    await c2.fn('cloudCheckConnection')();
    t.eq(c2.fn('planCurrent')().phase, 'locked', 'Check connection: the plan it read is the record');

    const listens = (a) => (a.doc._listeners.visibilitychange || []).filter(f => f === a.run('_planOnVisible')).length;
    t.eq(listens(ready({ plan: ended(2) })), 1, 'signed in: the app coming back to the front is hooked, once');
    t.eq(listens(ready({ signedIn: false })), 0, 'signed out: not even a listener (16a)');
    await tick(0);
  });

  /* ------------------------------------------------------------------ 65f */
  // V128: the release checks (version, What's new, cache, About) moved to 66f;
  // what stays here is V127's lasting placement and the backup rule.
  await t.group('65f — plan.js placed, started after the first render, kept out of backups', () => {
    const idx = read('index.html');
    t.ok(idx.indexOf('src="sync.js"') < idx.indexOf('src="plan.js"') && idx.indexOf('src="plan.js"') < idx.indexOf('src="scanner.js"'), 'plan.js loads after sync.js (which stays straight after cloud.js), before scanner.js');
    t.includes(read('sw.js'), "  './plan.js',", 'and is precached');
    const boot = read('boot.js');
    t.ok(boot.indexOf('planBoot()') > boot.indexOf('snapshotsBoot()') && boot.indexOf('planBoot()') < boot.indexOf('}   // end if (_bootLoadOK)'), 'planBoot runs after the first render, on a good load only');
    t.includes(read('reset.js'), "['PLAN_KEY', PLAN_KEY, 'account']", 'Reset this phone: the plan goes with the sign-in');
    // Never in a backup: one account's plan must not travel to another phone.
    const ls = { [AUTH]: session(), 'pat:plan': record(ended(2)) };
    const app2 = freshApp({ localStorage: ls, navigator: { onLine: false } });
    const backup = JSON.stringify(app2.run('buildBackup()'));
    t.excludes(backup, 'shownEnded', 'the plan record is not in a backup');
    t.excludes(backup, 'pat:plan', '… nor its key');
  });
};
