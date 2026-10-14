/* Standing test — V114: the settings look pass (Stage 7 part 3, Stage 12 opener)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked: 1A do it now; 3A page names keep their
   capitals wherever they appear, every heading / button / switch inside a page
   is sentence case; 4A Settings says "jobs", but names a screen or button
   EXACTLY as it appears on screen ("PAT Sessions", "Session settings", "New
   session", "Edit session") so instructions match what the engineer sees;
   5A Smart Quick Pick stays on Quick Pick Items; 6A page splits backlogged;
   10A no icon changes (that is V115); 11A a What's new sheet for V114.

     51a  the reworded Settings text, page by page, drawn through render().
     51b  every screen name Settings quotes still exists on that screen — if a
          later release renames "Job settings" or "Jobs", this goes red and
          Settings must follow (the instructions would be wrong). V122 (4B
          done): the names became Jobs / Job settings / New job.
     51c  sentence case: every static heading and switch title in
          render-settings.js, apart from names on an allow-list.
     51d  the Glossary: the job terms, the Barcode Scanner path, no version
          numbers in the copy.
     51e  sweep: no "session" in the visible text of ANY Settings page except
          the Glossary's one "earlier versions" line (V122 5A) and history
          (retest reminders on, so the Retest page draws its how-to).
     51f  messages Settings shows through confirm sheets (setup import, the
          certificate-number clash, reset descriptions) — source-guarded, as the
          sheets need a file or a typed clash to reach headlessly.
     (51g, V114's About entry, retired at V117 when the entry rolled off.) */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, withSession } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;
const text = (h) => h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&#x27;/g, '’').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');

function page(app, id) {
  app.fn('setView')(id);
  app.fn('render')();
  return text(html(app));
}

// V122 (4B done): no screen is called a session any more, so Settings may say
// "session" only where it explains the old word (the Glossary, 5A) or in history.
const EXPLAINS = ['called this a session', 'Sessions are now called Jobs'];   // the second is V122's About line (history; rolls off at V125)

module.exports = async function () {

  /* ------------------------------------------------------------------ 51a */
  await t.group('51a — Settings says jobs (4A)', () => {
    const app = freshApp();
    withSession(app);                       // the Clients rebuild block needs a job
    app.state().retestRemindersEnabled = true;
    const user = page(app, 'settingsUser');
    t.includes(user, 'Used as the default for new jobs', 'Engineer & Tester: new jobs');
    const clients = page(app, 'settingsClients');
    t.includes(clients, 'Rebuild from my jobs', 'Clients: the rebuild button says jobs');
    t.includes(clients, 'Scans every saved job', 'Clients: what rebuild does');
    t.includes(clients, 'never changes jobs you\'ve already saved', 'Clients: editing never changes saved jobs');
    const setup = page(app, 'settingsSetup');
    t.includes(setup, 'jobs, clients and sites are never shared', 'Setup: jobs are never shared');
    t.includes(setup, 'Your jobs are not touched.', 'Setup: import leaves jobs alone');
    const retest = page(app, 'settingsRetest');
    t.includes(retest, 'Open any job, tap Job settings', 'Retest Reminders: open a job, tap the button by its real name');
    t.includes(retest, 'on your Jobs screen', 'Retest Reminders: the list by its real name');
    const logging = page(app, 'settingsLogging');
    t.includes(logging, 'in a job\'s Overview', 'Logging Options: a job\'s Overview');
    t.includes(logging, 'Settings → Reports & Exports → CSV Columns', 'Logging Options: the full path to CSV Columns');
    const about = page(app, 'settingsAbout');
    t.includes(about, 'Your jobs and settings are not affected', 'About: reload leaves jobs alone');
    t.includes(about, 'the basics — jobs, Quick Pick', 'About: the tour covers jobs');
  });

  /* ------------------------------------------------------------------ 51b */
  await t.group('51b — every screen Settings names still exists by that name', () => {
    const core = read('render-core.js'), review = read('render-review.js');
    t.includes(core, '<h1 class="h1" id="screen-title" tabindex="-1">Jobs</h1>', '"Jobs" is the main list’s title');
    t.includes(review, 'data-action="edit-session">Job settings</button>', '"Job settings" is the button on a job');
    t.includes(core, '<h2 class="h2">New job</h2>', '"New job" is the new-job screen’s title');
    t.includes(review, '<div class="site-name" id="screen-title" role="heading" aria-level="1" tabindex="-1">Job settings</div>', '"Job settings" is also that screen’s title (V122 3A)');
    // And Settings quotes them in exactly that spelling.
    const settings = read('render-settings.js');
    t.includes(settings, 'tap <strong>Job settings</strong>', 'Retest Reminders quotes the button exactly');
    t.includes(settings, 'on the New job screen', 'Clients quotes the screen exactly');
  });

  /* ------------------------------------------------------------------ 51c */
  await t.group('51c — headings and switches are sentence case (3A)', () => {
    const src = read('render-settings.js');
    const app = freshApp();
    const pages = Object.values(app.val('SETTINGS_PAGE_META')).map(m => m.title);
    // Names that keep capitals wherever they appear: page names, features named
    // after them, the button the Undo switch is about, and abbreviations.
    const ALLOW = pages.concat(['Quick Pick', 'Smart Quick Pick', 'Multi Pick', 'Undo', 'PDF', 'CSV', 'IET', 'Bluetooth', 'HID']);
    const heads = [];
    const re = /<(h2|h3) class="(?:h2|bulk-sheet-title)">([^<$]+)<\/\1>|class="toggle-row-title">([^<$]+)</g;
    let m;
    while ((m = re.exec(src))) heads.push((m[2] || m[3]).trim());
    t.ok(heads.length >= 50, `found the page headings and switch titles (${heads.length})`);
    const longestFirst = ALLOW.slice().sort((x, y) => y.length - x.length);
    const bad = heads.filter(h => {
      let rest = h;
      for (const a of longestFirst) rest = rest.split(a).join('x');
      // The first word may be capitalised; no word after it may be (allowed names
      // were swapped for a lower-case placeholder above).
      return rest.split(/[\s/&—-]+/).filter(Boolean).slice(1).some(w => /^[A-Z][a-z]/.test(w));
    });
    t.eq(bad.join(' | '), '', 'no Title Case heading or switch title');
    t.includes(src, '<h2 class="h2">Earth continuity limit</h2>', 'the calculator heading, the one V114 changed');
  });

  /* ------------------------------------------------------------------ 51d */
  await t.group('51d — the Glossary matches the screen', () => {
    const g = page(freshApp(), 'settingsGlossary');
    t.includes(g, 'Job One visit to one site.', 'Job is the term, not Session');
    t.includes(g, 'Locked job A finished job.', 'Locked job');
    t.includes(g, 'Setup file A file containing only your configuration', 'Setup file');
    t.includes(g, 'Clearing old jobs Deleting jobs older than an age you choose', 'Clearing old jobs, the words Phone Storage uses');
    t.includes(g, 'See Settings → Logging → Barcode Scanner.', 'the scanner lives under Logging');
    t.excludes(g, 'Testing Setup', 'not the group name from before V96');
    t.excludes(g, 'From V66', 'no version numbers in the Glossary');
    t.excludes(g, 'Pruning', 'not the old word');
  });

  /* ------------------------------------------------------------------ 51e */
  await t.group('51e — no "session" on any Settings page except screen names', () => {
    const app = freshApp();
    withSession(app);
    app.state().retestRemindersEnabled = true;
    const ids = Object.keys(app.val('SETTINGS_PAGE_META'));
    const stray = [];
    for (const id of ids) {
      let s = page(app, id);
      for (const ok of EXPLAINS) s = s.split(ok).join('');
      s.replace(/.{0,30}session.{0,30}/gi, (hit) => { stray.push(`${id}: ${hit}`); return hit; });
    }
    t.ok(ids.length >= 25, `drew every Settings page (${ids.length})`);
    t.eq(stray.join(' || '), '', 'no stray "session" in what the engineer reads');
  });

  /* ------------------------------------------------------------------ 51f */
  await t.group('51f — Settings messages say jobs', () => {
    t.includes(read('setup.js'), '`Your jobs, clients and sites will NOT be changed.`', 'importing a setup: jobs not changed');
    t.includes(read('settings-actions.js'), 'is already used by another job. Use it anyway?', 'certificate number clash');
    t.includes(read('settings-actions.js'), 'Items already saved in past jobs are unaffected.', 'reset descriptions');
    t.includes(read('render-settings.js'), 'builds it from your existing jobs;', 'Smart Quick Pick: built from jobs');
    t.includes(read('render-settings.js'), 'Rebuild re-scans all your jobs;', 'Smart Quick Pick: rebuild re-scans jobs');
  });
};
