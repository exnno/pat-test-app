/* Standing test — V131: certificates count as exported (the stragglers round, part 2)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked (16 Oct, Peter "1A 2A 3A 4A 5A" then
   "6B 7A 8A 9A"):
   1A  The Jobs list counts a job as done on a clean CSV export OR a
       certificate made after the job was locked — the not-exported
       reminder's own rule (jobPaperworkDone). jobDoneStatus() names it.
   2A  Tapping "N jobs not yet exported" shows those jobs (filter 'notdone',
       not saved) instead of bulk-exporting CSVs; bulkExportUnexported retired.
   3A  Badges: ✓ Exported (CSV) and ✓ Certificate.
   4A  A certificate, then the job reopened → ✓✎ Reopened since certificate;
       counts as not done and under "Modified since".
   5A  What's new rolled (two lines).
   6B  "Mark as not exported" on the "Already exported" pop-up only.
   7A  It clears the CSV mark only — a counting certificate stays.
   8A  No confirm; a "Marked as not exported" message.
   9A  Copy still counts as an export.
   Claude's calls: pruning and the "Already exported" pop-up stay CSV-only
   (exportStatus) — a PDF can't be imported back; the nudge hides while its
   own list is showing; "Still to export" is the filter's name in the select.

     69a  1A 4A: jobDoneStatus's five answers and their order.
     69b  1A 3A 4A: the Jobs list — badges and the nudge's count.
     69c  2A: tapping the nudge (real dispatcher) — the list it shows, the
          select, the nudge gone; a reload goes back to a saved filter.
     69d  6B 7A 8A: Mark as not exported — clears the CSV mark, keeps the
          certificate, says so, opens the job; next open asks nothing.
     69e  what stays CSV-only: pruning, the pop-up, Copy (9A).
     69f  release: V131, cache, What's new V131 (two lines), changelog. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, withSession, withItem } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;

function ready() {
  const app = freshApp();
  const st = app.state();
  st.welcomeSeen = true;
  st.onboardedV33Seen = true;
  st.migrationPrompt = { show: false, name: '', items: [] };
  return app;
}
function fire(app, type, el) {
  app.doc.getElementById('app').dispatchEvent({
    type, target: el, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
  });
}
function tap(app, action, arg) {
  const el = app.doc.createElement('button');
  el.dataset.action = action;
  if (arg !== undefined) el.dataset.arg = String(arg);
  fire(app, 'click', el);
}
// A job with one item; locked through the real Session settings path when asked.
function job(app, site, lock) {
  withSession(app, { site });
  withItem(app, { assetNo: site + '-1', result: 'pass', notes: '' });
  if (lock) {
    app.fn('startEditSession')();
    app.state().editForm.locked = true;
    app.fn('saveSessionEdits')();
  }
  return app.fn('activeSession')();
}
const after = (iso, ms) => new Date(Date.parse(iso) + ms).toISOString();
// The Jobs list card for one job (its title to the end of its card).
function card(page, site) {
  const i = page.indexOf(site);
  const j = page.indexOf('class="session-card', i);
  return page.slice(i, j === -1 ? undefined : j);
}

module.exports = async function () {

  /* ------------------------------------------------------------------ 69a */
  await t.group('69a — jobDoneStatus: CSV or a certificate after locking (1A 4A)', () => {
    const app = ready();
    const st = app.fn('jobDoneStatus');
    const s = job(app, 'ZZDONE', true);
    t.eq(st(s), 'none', 'locked, nothing made: none');
    s.reportAt = after(s.lockedAt, 1000);
    t.eq(st(s), 'certificate', 'a certificate made after locking: certificate');
    t.ok(app.fn('jobIsDone')(s), '… and that is done');
    s.reportAt = after(s.lockedAt, -1000);
    t.eq(st(s), 'reopened', 'a certificate made BEFORE this lock (locked again since): reopened');
    t.notOk(app.fn('jobIsDone')(s), '… not done');
    s.reportAt = after(s.lockedAt, 1000);
    app.fn('markSessionExported')(s);
    t.eq(st(s), 'exported', 'a clean CSV wins over a certificate');
    s.exportDirty = true;
    t.eq(st(s), 'certificate', 'an edited CSV + a counting certificate: certificate (the later paperwork)');
    s.reportAt = after(s.lockedAt, -1000);
    t.eq(st(s), 'modified', 'an edited CSV + a stale certificate: modified (one badge, the CSV’s)');
    delete s.exportedAt; s.exportDirty = false;
    // Unlocking through the real path drops lockedAt — the certificate stops counting.
    s.reportAt = after(s.lockedAt, 1000);
    app.fn('startEditSession')();
    app.state().editForm.locked = false;
    app.fn('saveSessionEdits')();
    const u = app.fn('activeSession')();
    t.ok(!u.locked && !u.lockedAt, 'unlocked: no lock time');
    t.eq(st(u), 'reopened', 'a certificate, then unlocked: reopened (4A)');
    delete u.reportAt;
    t.eq(st(u), 'none', 'unlocked, nothing made: none');
  });

  /* ------------------------------------------------------------------ 69b */
  await t.group('69b — the Jobs list: ✓ Certificate, Reopened, and the nudge counts certificates', () => {
    const app = ready();
    const cert = job(app, 'ZZCERTJOB', true);
    cert.reportAt = after(cert.lockedAt, 1000);
    const csv = job(app, 'ZZCSVJOB', false);
    app.fn('markSessionExported')(csv);
    const reo = job(app, 'ZZREOJOB', true);
    reo.reportAt = after(reo.lockedAt, -1000);
    const mod = job(app, 'ZZMODJOB', false);
    app.fn('markSessionExported')(mod); mod.exportDirty = true;
    job(app, 'ZZNONEJOB', false);
    app.fn('setView')('sessions');
    app.fn('render')();
    const p = html(app);
    t.includes(card(p, 'ZZCERTJOB'), ' Certificate</span>', 'a certificate after locking: ✓ Certificate (3A)');
    t.excludes(card(p, 'ZZCERTJOB'), ' Exported</span>', '… not "Exported"');
    t.includes(card(p, 'ZZCSVJOB'), ' Exported</span>', 'a clean CSV: ✓ Exported');
    t.includes(card(p, 'ZZREOJOB'), ' Reopened since certificate</span>', 'a stale certificate: Reopened since certificate (4A)');
    t.includes(card(p, 'ZZMODJOB'), ' Modified since export</span>', 'an edited CSV: Modified since export');
    t.excludes(card(p, 'ZZNONEJOB'), 'export-badge', 'nothing made: no badge');
    t.eq(app.fn('unexportedSessionCount')(), 3, 'not done: reopened, modified, none — the certificate job is done (1A)');
    t.includes(p, '3 jobs not yet exported', 'the nudge says 3');
    t.includes(p, 'data-action="review-unexported"', 'tapping it shows them (2A)');
    t.excludes(p, 'bulk-export-unexported', 'the bulk CSV export is not wired');
    t.excludes(p, 'Export all</span>', '… nor offered');
  });

  /* ------------------------------------------------------------------ 69c */
  await t.group('69c — tapping the nudge shows the jobs still to export (2A)', () => {
    const app = ready();
    const cert = job(app, 'ZZCERTJOB', true);
    cert.reportAt = after(cert.lockedAt, 1000);
    const reo = job(app, 'ZZREOJOB', true);
    reo.reportAt = after(reo.lockedAt, -1000);
    const none = job(app, 'ZZNONEJOB', false);
    const csv = job(app, 'ZZCSVJOB', false);
    app.fn('markSessionExported')(csv);
    const m = app.fn('sessionMatchesControlFilters');
    app.fn('setView')('sessions');
    app.state().lockFilter = 'locked';
    app.state().sessionsSearchQuery = 'ZZ';
    tap(app, 'review-unexported');
    const st = app.state();
    t.eq(st.sessionFilter, 'notdone', 'the list is filtered');
    t.eq(st.lockFilter, 'all', '… on both axes (the lock filter cleared)');
    t.eq(st.sessionsSearchQuery, '', '… and the search cleared');
    t.ok(m(reo) && m(none), 'it shows the reopened job and the one with nothing');
    t.ok(!m(cert) && !m(csv), '… not the certificate job nor the CSV one');
    const p = html(app);
    t.includes(p, '<option value="notdone" selected>Still to export</option>', 'the Status filter says what it is showing');
    t.excludes(p, 'data-action="review-unexported"', 'the nudge steps aside while its own list is showing');
    t.ok(p.indexOf('ZZREOJOB') > -1 && p.indexOf('ZZNONEJOB') > -1, 'the two jobs are drawn');
    t.eq(p.indexOf('ZZCERTJOB'), -1, 'the certificate job is not');
    // The saved filters follow the same rule (1A 4A).
    st.sessionFilter = 'exported';
    t.ok(m(cert) && m(csv) && !m(reo), '"Exported": the CSV job and the certificate job');
    st.sessionFilter = 'modified';
    t.ok(m(reo) && !m(cert) && !m(none), '"Modified since": the reopened job too');
    st.sessionFilter = 'unexported';
    t.ok(m(none) && !m(reo), '"Not exported": nothing made at all');
    st.sessionFilter = 'notdone';
    app.fn('save')();
    const reloaded = freshApp({ localStorage: app.storage._snapshot() });
    t.eq(reloaded.state().sessionFilter, 'all', 'a reload goes back to All — never this one');
  });

  /* ------------------------------------------------------------------ 69d */
  await t.group('69d — Mark as not exported: clears the CSV mark, keeps the certificate (6B 7A 8A)', () => {
    const app = ready();
    const toasts = [];
    app.sandbox.showToast = (msg) => toasts.push(String(msg));
    const s = job(app, 'ZZOOPS', false);
    app.fn('markSessionExported')(s);    // a stray Copy
    s.reportAt = new Date().toISOString();
    const id = s.id;
    app.fn('setView')('sessions');
    tap(app, 'open-session', id);
    t.eq(app.state().exportWarnSessionId, id, 'opening it asks "Already exported"');
    const pop = html(app);
    const a = pop.indexOf('aria-label="Already exported"');
    const b = pop.indexOf('id="reopen-warn-unmark"', a);
    t.ok(a > -1 && b > a, 'the pop-up has the button (6B)');
    t.includes(pop, 'data-action="reopen-unmark">Mark as not exported</button>', '… worded plainly');
    tap(app, 'reopen-unmark');
    const now = app.state().sessions.find(x => x.id === id);
    t.ok(!now.exportedAt && !now.exportDirty, 'the CSV mark is gone');
    t.ok(typeof now.reportAt === 'string', 'the certificate time is kept (7A)');
    t.eq(app.state().exportWarnSessionId, null, 'the pop-up is closed');
    t.eq(app.fn('activeSession')() && app.fn('activeSession')().id, id, 'and the job is open (8A: no second question)');
    t.includes(toasts.join('|'), 'Marked as not exported', 'it says so');
    const stored = freshApp({ localStorage: app.storage._snapshot() });
    const back = stored.state().sessions.find(x => x.id === id);
    t.ok(back && !back.exportedAt, 'a reload: still not exported (it was saved)');
    app.fn('setView')('sessions');
    tap(app, 'open-session', id);
    t.eq(app.state().exportWarnSessionId, null, 'opening it again asks nothing');
    // Nothing to clear: the button does no harm.
    const fn = app.fn('markSessionNotExported');
    t.eq(fn(now), false, 'already clear: nothing changed');
    t.eq(fn(null), false, 'no job: nothing');
  });

  /* ------------------------------------------------------------------ 69e */
  await t.group('69e — what stays CSV-only: pruning, the pop-up, Copy (Claude’s calls, 9A)', async () => {
    const app = ready();
    const cert = job(app, 'ZZOLDCERT', true);
    cert.reportAt = after(cert.lockedAt, 1000);
    cert.date = '2019-01-01';
    const csv = job(app, 'ZZOLDCSV', false);
    app.fn('markSessionExported')(csv);
    csv.date = '2019-01-01';
    const prune = app.fn('prunableSessions')().map(s => s.id);
    t.ok(prune.includes(csv.id), 'an old CSV-exported job can be pruned');
    t.notOk(prune.includes(cert.id), 'an old certificate-only job cannot (a PDF can’t be imported back)');
    // The "Already exported" pop-up is about a CSV only.
    const un = job(app, 'ZZUNCERT', false);
    un.reportAt = new Date().toISOString();
    app.fn('setView')('sessions');
    tap(app, 'open-session', un.id);
    t.eq(app.state().exportWarnSessionId, null, 'a certificate alone opens with no pop-up');
    t.includes(read('csv.js'), "    showToast('CSV copied to clipboard');\n    markSessionExported(session);", 'Copy still counts as an export (9A)');
  });

  /* ------------------------------------------------------------------ 69f */
  // (68f → 69f: V130's release checks are V131's now.)
  await t.group('69f — release: V131, cache, What’s new V131, changelog', () => {
    const app = freshApp();
    t.eq(app.run('APP_VERSION'), 'V131', 'APP_VERSION V131');
    t.eq(app.run('WELCOME_VERSION'), 'V131', 'What’s new rolled (5A)');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v131';", 'cache key pat-v131');
    const core = read('render-core.js');
    const open = core.indexOf('<ul class="welcome-list sheet-scroll">');
    const sheet = core.slice(open, core.indexOf('</ul>', open));
    t.eq((sheet.match(/<li>/g) || []).length, 2, 'two lines');
    t.includes(sheet, '<li><strong>Certificates count as exported.</strong>', 'line 1: certificates');
    t.includes(sheet, '<li><strong>Exported by mistake?</strong>', 'line 2: the undo');
    t.excludes(sheet, 'Easier with VoiceOver', 'V129’s copy gone');
    const help = read('render-help.js');
    const a = help.indexOf('<p><strong>V131</strong>'), b = help.indexOf('<p><strong>V130</strong>'), c = help.indexOf('<p><strong>V129</strong>');
    t.ok(a > -1 && b > a && c > b, 'About: V131, V130, V129');
    t.excludes(help, '<p><strong>V128</strong>', 'V128 rolled off');
    t.excludes(help, 'Safer after a long time away: a phone that hasn', 'V128’s line gone with it');
    t.includes(help, 'Certificates count as exported: a job whose certificate was made after locking', 'About: V131’s line');
    t.includes(help, 'Tidying up behind the scenes, and the Privacy note brought up to date.', 'About: V130’s line still there');
    t.includes(help, 'Easier with VoiceOver: + New job lands on the new job form', 'About: V129’s line still there');
  });
};
