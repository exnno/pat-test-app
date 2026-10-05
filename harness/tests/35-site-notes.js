/* Standing test — site notes + the Overview's sticky title bar (V98, roadmap Stage 8 part 1)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked: 1A Stage 8 split (V98 site notes + sticky
   header; fail location and reminders later); 2A notes show on the New Job form
   and as a card at the top of the job's Overview; 3A edited from the site's sheet
   (Clients) and from the Overview; 4A never printed, never in a CSV; 5A a V97
   phone editing a site drops its notes — accepted; 6B the Overview's title bar
   sticks, nothing else. Claude's calls: notes live on the SITE (absent key when
   empty — sync rule 36), a held site names a notes difference without showing it,
   Session settings re-links a job to the site its new text names, a merge keeps
   both sites' notes.

   ⚠ TAPS AND TYPING GO THROUGH #app (V67 lesson), as in 22, 33 and 34. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, withSession, withItem, confirmSheet, tick, CANARY } = require('../fixture');

const NOTE = 'ZZDOORCODE 4471\nKeys from reception';

function boot(opts = {}) {
  const app = freshApp(opts);
  app.html = () => app.doc.getElementById('app').innerHTML;
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

function type(app, action, value) {
  const el = app.doc.createElement('textarea');
  el.dataset.inputAction = action;
  el.value = value;
  fire(app, 'input', el);
}

// A job at the canary site, with notes on that site.
function jobWithNotes(app, notes = NOTE) {
  const sess = withSession(app);
  const site = app.fn('siteForSession')(sess);
  if (notes) app.fn('setSiteNotes')(site.id, notes);
  app.fn('save')();
  return { sess, site };
}

function storedSites(app) {
  return JSON.parse(app.storage.getItem('pat:sites') || '[]');
}

const src = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');

module.exports = async function () {

  /* ------------------------------------------------------------------ 35a */
  t.group('35a — notes live on the site; the key is absent when empty', () => {
    const app = boot();
    const { site } = jobWithNotes(app, '  ZZA\r\nZZB  ');
    t.eq(site.notes, 'ZZA\nZZB', 'stored normalised (CRLF → LF, trimmed)');
    t.eq(storedSites(app)[0].notes, 'ZZA\nZZB', 'written to storage');

    const app2 = boot({ localStorage: { 'pat:sites': app.storage.getItem('pat:sites'), 'pat:clients': app.storage.getItem('pat:clients') } });
    t.eq(app2.state().sites[0].notes, 'ZZA\nZZB', 'a reload keeps them');

    app.fn('setSiteNotes')(site.id, '   ');
    app.fn('save')();
    t.eq('notes' in app.state().sites[0], false, 'cleared → the key is gone, not notes: ""');
    t.eq('notes' in storedSites(app)[0], false, 'and gone from storage');

    const long = 'x'.repeat(1500);
    app.fn('setSiteNotes')(site.id, long);
    t.eq(app.state().sites[0].notes.length, 1000, 'capped at 1,000 characters');
    t.includes(src('config.js'), 'const SITE_NOTES_MAX = 1000;', 'the cap is SITE_NOTES_MAX');
  });

  /* ------------------------------------------------------------------ 35b */
  t.group('35b — the synced site row: unchanged shape without notes (rule 36)', () => {
    const app = boot();
    const { site } = jobWithNotes(app, '');
    const proj = app.fn('_syncRecordDoc')('site', site);
    t.eq(JSON.stringify(Object.keys(proj).sort()), '["clientId","id","name"]', 'no notes → exactly the V97 fields');
    const v97 = { id: site.id, clientId: site.clientId, name: site.name };
    const h = (d) => app.fn('syncHash')(app.fn('_syncCanonical')(d));
    t.eq(app.fn('_syncRecordHash')('site', site), h(v97), 'and the V97 fingerprint — nothing re-sent on upgrade');

    app.fn('setSiteNotes')(site.id, NOTE);
    const p2 = app.fn('_syncRecordDoc')('site', app.state().sites[0]);
    t.eq(p2.notes, NOTE, 'with notes → they travel');
    t.ok(app.fn('_syncRecordHash')('site', app.state().sites[0]) !== h(v97), 'and change the fingerprint (an edit is sent)');

    const applied = app.fn('_syncRecordFromDoc')('site', { id: site.id, clientId: site.clientId, name: site.name, notes: 'ZZCLOUD' }, site);
    t.eq(applied.notes, 'ZZCLOUD', 'a cloud row brings its notes');
    const stripped = app.fn('_syncRecordFromDoc')('site', v97, app.state().sites[0]);
    t.eq('notes' in stripped, false, 'a cloud row without notes (a V97 edit, 5A) arrives without them');
  });

  /* ------------------------------------------------------------------ 35c */
  t.group('35c — a held site names a notes difference, never the notes (rule 7)', () => {
    const app = boot();
    const { site } = jobWithNotes(app);
    const local = app.state().sites[0];
    const cloud = { id: site.id, clientId: site.clientId, name: site.name, notes: 'ZZOTHERPHONE' };
    const e = app.fn('_syncRecordHeldEntry')('site', site.id, 'both-changed', local, cloud);
    t.ok(Array.isArray(e.diffs) && e.diffs.length === 1 && e.diffs[0].label === 'Notes', 'one Notes line');
    t.eq(e.diffs[0].here + '|' + e.diffs[0].cloud, 'Written|Different', 'described in words');
    const kept = JSON.stringify(app.fn('_syncHeldNormalise')([e]));
    t.excludes(kept, 'ZZDOORCODE', 'this phone\u2019s text is not stored in the held entry');
    t.excludes(kept, 'ZZOTHERPHONE', 'nor the cloud\u2019s');
    const same = app.fn('_syncRecordHeldEntry')('site', site.id, 'both-changed', local, Object.assign({}, cloud, { notes: NOTE, name: 'ZZRENAMED' }));
    t.eq(same.diffs, undefined, 'notes equal → no Notes line');
    const rh = src('render-help.js');
    const card = rh.slice(rh.indexOf("const isSite = h.kind === 'site';"), rh.indexOf('const listRow'));
    t.includes(card, 'h.diffs', 'the client/site card prints the diffs');
  });

  /* ------------------------------------------------------------------ 35d */
  await t.group('35d — backup → restore keeps site notes (no backupVersion bump)', async () => {
    const app = boot();
    jobWithNotes(app);
    const before = JSON.stringify(app.fn('buildBackup')());
    t.includes(before, 'ZZDOORCODE', 'the backup carries them');
    t.includes(before, '"backupVersion":5', 'backupVersion still 5');
    const st = app.state();
    st.sessions = []; st.clients = []; st.sites = [];
    app.fn('save')();
    const file = new app.sandbox.File([before], 'patgo-backup.json', { type: 'application/json' });
    app.fn('restoreBackupFromFile')(file);
    await tick(5);
    confirmSheet(app, 'yes');
    await tick(5);
    t.eq(app.state().sites[0] && app.state().sites[0].notes, NOTE, 'restored with their notes');
  });

  /* ------------------------------------------------------------------ 35e */
  t.group('35e — the Overview card and sheet (2A, 3A)', () => {
    const app = boot();
    const { sess, site } = jobWithNotes(app);
    app.fn('setView')('overview');
    let html = app.html();
    t.includes(html, 'id="site-notes-card"', 'the card is drawn');
    t.includes(html, 'ZZDOORCODE 4471', 'with the notes in it');

    tap(app, 'site-notes-open');
    t.eq(app.state().siteNotesSheet && app.state().siteNotesSheet.siteId, site.id, 'tapping it opens the sheet for this site');
    t.includes(app.html(), 'id="site-notes-input"', 'the sheet has the text box');
    type(app, 'site-notes-text', 'ZZNEWCODE 9');
    tap(app, 'site-notes-save');
    t.eq(app.state().siteNotesSheet, null, 'saving closes the sheet');
    t.eq(storedSites(app)[0].notes, 'ZZNEWCODE 9', 'saved to the SITE, in storage');
    t.excludes(JSON.stringify(app.state().sessions), 'ZZNEWCODE', 'nothing copied into the job');

    sess.locked = true;
    app.fn('render')();
    t.includes(app.html(), 'id="site-notes-card"', 'a locked job still shows them (they are the site\u2019s)');
    sess.locked = false;

    app.fn('setSiteNotes')(site.id, '');
    app.fn('render')();
    html = app.html();
    t.excludes(html, 'id="site-notes-card"', 'no notes → no card');
    t.includes(html, 'id="site-notes-add"', '… but an Add link');

    tap(app, 'site-notes-open');
    app.state().sites = [];   // a pull removed the site while the sheet was open
    let threw = false;
    try { tap(app, 'site-notes-save'); } catch { threw = true; }
    t.eq(threw, false, 'saving onto a site that has gone does not throw');
    t.eq(app.state().siteNotesSheet, null, 'and closes the sheet');

    app.fn('setView')('sessions');
    t.eq(app.state().siteNotesSheet, null, 'setView clears the sheet');
  });

  /* ------------------------------------------------------------------ 35f */
  t.group('35f — Session settings re-links the job to the site its text names', () => {
    const app = boot();
    const { sess, site } = jobWithNotes(app);
    const other = app.fn('ensureSite')(site.clientId, 'ZZOTHERSITE');
    app.fn('setSiteNotes')(other.id, 'ZZOTHERNOTES');
    app.fn('startEditSession')();
    app.state().editForm.site = CANARY.client + ' \u2014 ZZOTHERSITE';
    app.fn('saveSessionEdits')();
    t.eq(app.fn('activeSession')().siteId, other.id, 'linked to the site it now names');
    app.fn('setView')('overview');
    t.includes(app.html(), 'ZZOTHERNOTES', 'and shows that site\u2019s notes');

    app.fn('startEditSession')();
    app.state().editForm.site = 'ZZNOWHERE';
    app.fn('saveSessionEdits')();
    t.eq(app.fn('activeSession')().siteId, '', 'a site not in the list → no link (no stale notes)');

    app.fn('startEditSession')();
    app.state().editForm.name = 'ZZRENAMEDJOB';
    app.fn('saveSessionEdits')();
    t.eq(app.fn('activeSession')().siteId, '', 'an unchanged site text leaves the link alone');
    t.ok(sess, 'job exists');
  });

  /* ------------------------------------------------------------------ 35g */
  t.group('35g — jobs with no site link find their site by its text', () => {
    const app = boot();
    const { sess, site } = jobWithNotes(app);
    sess.siteId = '';
    t.eq(app.fn('siteForSession')(sess) && app.fn('siteForSession')(sess).id, site.id, '"Client — Site" text → that site');
    const orphan = app.fn('ensureOrphanSite')('ZZLONESITE');
    t.eq(app.fn('siteForSession')({ site: 'ZZLONESITE' }).id, orphan.id, 'site-only text → the Unassigned site');
    t.eq(app.fn('siteForSession')({ site: CANARY.client + ' \u2014 ZZMISSING' }), null, 'nothing matching → null, never created');
    t.eq(app.state().sites.some(s => s.name === 'ZZMISSING'), false, 'nothing was created');
  });

  /* ------------------------------------------------------------------ 35h */
  t.group('35h — the New Job form shows the picked site\u2019s notes (2A)', () => {
    const app = boot();
    jobWithNotes(app);
    const st = app.state();
    st.newForm.clientId = CANARY.client.toLowerCase();
    st.newForm.site = CANARY.site;
    t.includes(app.fn('nfSiteNotesHTML')(), 'ZZDOORCODE 4471', 'client + site typed (any case) → notes');
    st.newForm.site = 'ZZSOMEWHEREELSE';
    t.eq(app.fn('nfSiteNotesHTML')(), '', 'another site → nothing');

    app.fn('setView')('sessions');   // setView closes the form, so open it after
    st.newForm.show = true;
    st.newForm.site = CANARY.site;
    app.fn('render')();
    t.includes(app.html(), 'id="nf-site-notes"', 'the form has the notes box');
    t.includes(app.html(), 'ZZDOORCODE 4471', 'painted on render');

    const box = app.doc.register('nf-site-notes');
    st.newForm.site = 'ZZSOMEWHEREELSE';
    app.fn('refreshNfSiteNotesOnly')();
    t.eq(box.innerHTML, '', 'repainted in place when the site changes (no render)');

    const ev = src('events.js');
    const siteIn = ev.slice(ev.indexOf("$('nf-site').oninput"), ev.indexOf("$('nf-site').onfocus"));
    t.includes(siteIn, 'refreshNfSiteNotesOnly', 'typing a site repaints the notes');
    const cliIn = ev.slice(ev.indexOf("$('nf-client').oninput"), ev.indexOf("$('nf-client').onblur"));
    t.includes(cliIn, 'refreshNfSiteNotesOnly', 'typing a client repaints the notes');
    const pick = ev.slice(ev.indexOf('function renderNfSuggestionsOnly'), ev.indexOf('function renderLocationSuggestionsOnly'));
    t.includes(pick, 'refreshNfSiteNotesOnly', 'picking from the list repaints the notes');
  });

  /* ------------------------------------------------------------------ 35i */
  t.group('35i — the site sheet in Clients edits notes; a merge keeps them (3A)', () => {
    const app = boot();
    const { site } = jobWithNotes(app);
    app.fn('setView')('settingsClients');
    tap(app, 'site-rename', site.id);
    t.eq(app.state().clientsPage.siteDialog.notes, NOTE, 'Edit opens with the notes');
    t.includes(app.html(), 'id="site-dialog-notes"', 'the sheet has a notes box');
    t.includes(app.html(), 'Edit site', 'titled Edit site');
    type(app, 'site-dialog-notes', 'ZZEDITED');
    tap(app, 'site-dialog-confirm');
    t.eq(storedSites(app).find(s => s.id === site.id).notes, 'ZZEDITED', 'saved');
    tap(app, 'site-add', site.clientId);
    type(app, 'site-name', 'ZZADDED');
    type(app, 'site-dialog-notes', 'ZZADDNOTES');
    tap(app, 'site-dialog-confirm');
    const added = app.state().sites.find(s => s.name === 'ZZADDED');
    t.eq(added && added.notes, 'ZZADDNOTES', 'Add site keeps notes typed with it');
    // (Add site leaves the client expanded, so its site rows are drawn.)
    // V98.1: the name truncates with an ellipsis, so the marker must come first.
    const html = app.html();
    const at = html.indexOf('<span class="client-site-name"><span class="site-notes-mark"');
    t.ok(at !== -1, 'the 📝 is the first thing in the site name (an ellipsis can\u2019t hide it)');


    // Merge: an Unassigned same-named site with notes, moved onto the client.
    const orphan = app.fn('ensureOrphanSite')('ZZADDED');
    app.fn('setSiteNotes')(orphan.id, 'ZZORPHANNOTES');
    app.state().clientsPage.assignDialog = { siteId: orphan.id, name: CANARY.client, clash: { targetClientId: site.clientId } };
    app.fn('resolveAssignMerge')();
    const kept = app.state().sites.find(s => s.name === 'ZZADDED');
    t.includes(kept.notes, 'ZZADDNOTES', 'the standing site keeps its notes');
    t.includes(kept.notes, 'ZZORPHANNOTES', 'and gains the merged site\u2019s');
  });

  /* ------------------------------------------------------------------ 35j */
  t.group('35j — the Overview title bar sticks; nothing else does (6B)', () => {
    const app = boot();
    withSession(app);
    app.fn('setView')('overview');
    t.includes(app.html(), 'class="header-row header-sticky"', 'the title bar is sticky');
    t.excludes(app.html(), 'overview-filters header-sticky', 'search is not');
    app.fn('enterSelectionMode') && app.fn('enterSelectionMode')();
    const css = src('styles.css');
    const rule = css.slice(css.indexOf('.header-row.header-sticky {'), css.indexOf('}', css.indexOf('.header-row.header-sticky {')));
    t.includes(rule, 'position: sticky', 'position: sticky (no fixed layout)');
    const z = Number((rule.match(/z-index:\s*(\d+)/) || [])[1]);
    t.ok(z > 0 && z < 200, 'z-index under the update banner and every sheet');
    t.excludes(rule, '100dvh', 'no viewport-height trap');
  });

  /* ------------------------------------------------------------------ 35k */
  t.group('35k — never printed, never in a CSV (4A)', () => {
    const app = boot();
    const { sess } = jobWithNotes(app);
    withItem(app);
    const csv = app.fn('buildCSV')(app.fn('activeSession')());
    t.excludes(csv, 'ZZDOORCODE', 'the CSV has no site notes');
    for (const f of ['report.js', 'csv.js']) {
      t.ok(!/siteNotesOf|siteForSession|siteNotes/.test(src(f)), f + ' never reads site notes');
    }
    t.ok(sess, 'job exists');
  });
};
