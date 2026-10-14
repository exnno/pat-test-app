/* Standing test — V122: Sessions are now called Jobs (the V114 4B rename)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked (14 Oct, Peter "1A 2A 3A 4A 5A"):
   1A  Every word the engineer can read says job — screens, buttons, pop-ups,
       toasts, the tour, help text, the Glossary. Code names, storage keys,
       data-action names and element ids are NOT renamed (saved data depends
       on them); neither is the PDF or CSV (they never said session).
   2A  The main list is titled "Jobs".
   3A  The button and the screen it opens are both "Job settings".
   4A  A job started with no name is "Job N". Jobs already saved keep their
       name — "Session 3" stays "Session 3"; that is the engineer's data.
   5A  "session" stays a hidden Settings search word, and the Glossary's Job
       entry says "Earlier versions called this a session."

     60a  SWEEP (source): no "session" in any prose a phone can show — string
          literals, markup text and attribute text in every shipped script and
          index.html. Skips comments, console messages, hidden search aliases,
          class/id/data-* values and ${…}. Allowed: the Glossary's one line and
          the V122 "Sessions are now called Jobs" history lines.
     60b  SWEEP (rendered): the screens drawn through render() — empty list,
          New job form, the Jobs list, Overview, Job settings, a locked job's
          test screen, Reports, Retest Reminders, every tour slide — say job
          and never session.
     60c  4A: a nameless job is "Job N"; a saved "Session 3" is still
          "Session 3" after the phone reloads.
     60d  5A: the Glossary line and section title; Settings search "session"
          still finds the Glossary and Phone Storage.
     60e  the CSV file name with no site or name says job.
     60f  release: V122, What's new rolled, cache, changelog. (59f → 60f.)

   ⚠ 60a IS A SWEEP. New visible text that says "session" fails it: write job.
   If a line genuinely must say session (history), add its exact phrase to
   ALLOW below — with a reason. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, scriptOrderFromIndex } = require('../load');
const { freshApp, withSession, withItem } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;
const text = (h) => h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&#x27;/g, '’').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');

/* Phrases allowed to say session: the Glossary's explanation (5A) and the two
   V122 history lines (the What's new sheet and the About changelog). */
const ALLOW = ['called this a session', 'Sessions are now called Jobs'];
const WORD = /\bsessions?\b/i;

function appScripts() {
  return scriptOrderFromIndex().filter(f => !/pdfjs|jspdf|autotable|supabase/i.test(f));
}

/* Prose a phone can show that says session, line by line. Deliberately simple:
   a string literal, or text between > and <, that has the word AND reads as
   words (two in a row) — so code names like 'sessions' never match. */
function sessionProse(src) {
  const hits = [];
  src.split('\n').forEach((raw, i) => {
    const tr = raw.trim();
    if (/^(\/\/|\*|\/\*|<!--)/.test(tr)) return;
    if (/console\.(error|warn|log|info)\(/.test(raw)) return;   // never on screen
    if (/\baliases:/.test(raw)) return;                         // hidden search words (5A)
    let l = raw.replace(/<!--.*?-->/g, '').replace(/\s\/\/\s.*$/, '')
      .replace(/\b(class|id|for|name|type|data-[\w-]+)="[^"]*"/g, '');
    for (let k = 0; k < 4; k++) l = l.replace(/\$\{[^{}]*\}/g, '');
    const segs = l.match(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`[^`]*`|>[^<>]*</g) || [];
    for (const s of segs) {
      if (!WORD.test(s) || !/[A-Za-z]+ [A-Za-z]+/.test(s)) continue;
      if (ALLOW.some(a => s.includes(a))) continue;
      hits.push(`${i + 1}: ${s.slice(0, 80)}`);
    }
  });
  return hits;
}

function strayIn(label, h) {
  let s = text(h);
  for (const a of ALLOW) s = s.split(a).join('');
  const out = [];
  s.replace(/.{0,30}\bsessions?\b.{0,30}/gi, (hit) => { out.push(`${label}: ${hit}`); return hit; });
  return out;
}

function draw(app, view) {
  app.fn('setView')(view);
  app.fn('render')();
  return html(app);
}

function search(app, q) {
  app.state().settingsSearchQuery = q;
  const h = app.fn('renderSettingsHubBodyHTML')();
  app.state().settingsSearchQuery = '';
  return h;
}

function storageSeed(app) {
  const ls = app.storage, out = {};
  for (let i = 0; i < ls.length; i++) { const k = ls.key(i); out[k] = ls.getItem(k); }
  return out;
}

module.exports = async function () {

  /* ------------------------------------------------------------------ 60a */
  await t.group('60a — no "session" in any prose a phone can show (1A)', () => {
    const files = appScripts().concat(['index.html']);
    t.ok(files.length >= 30, `swept every shipped script and index.html (${files.length})`);
    const stray = [];
    for (const f of files) for (const h of sessionProse(read(f))) stray.push(`${f}:${h}`);
    t.eq(stray.slice(0, 6).join(' || '), '', `no visible "session" (${stray.length} found)`);
    // The sweep can see: a sanity check on text it MUST flag, so a broken
    // sweep cannot pass by finding nothing anywhere.
    t.eq(sessionProse("  title: 'Delete session?',\n  aria-label=\"Back to sessions\"").length, 2,
      'the sweep flags a title and an aria-label that say session');
    t.eq(sessionProse("  state.view = 'sessions';\n  // the session list\n  console.error('Sessions list failed.');").length, 0,
      'and ignores code names, comments and console messages');
  });

  /* ------------------------------------------------------------------ 60b */
  await t.group('60b — every screen drawn says job, never session (1A, 2A, 3A)', () => {
    const stray = [];
    const app = freshApp();
    app.state().welcomeSeen = true;

    const empty = draw(app, 'sessions');
    t.includes(empty, 'No jobs yet', 'empty list: No jobs yet');
    t.includes(empty, 'Start your first job', 'empty list: Start your first job');
    stray.push(...strayIn('empty list', empty));

    app.fn('setView')('sessions');          // setView closes the form, so open it after
    app.state().newForm.show = true;
    app.fn('render')();
    const form = html(app);
    t.includes(form, '<h2 class="h2">New job</h2>', 'the New job form');
    t.includes(form, 'Job name <span class="hint">(optional)</span>', '… with Job name');
    stray.push(...strayIn('new form', form));
    app.state().newForm.show = false;

    withSession(app);
    withItem(app);
    const list = draw(app, 'sessions');
    t.includes(list, '<h1 class="h1">Jobs</h1>', 'the main list is titled Jobs (2A)');
    t.includes(list, '+ New job</button>', '+ New job');
    t.includes(list, 'placeholder="Search jobs and items…', 'search says jobs');
    stray.push(...strayIn('jobs list', list));

    const ov = draw(app, 'overview');
    t.includes(ov, 'data-action="edit-session">Job settings</button>', 'Overview: the Job settings button (3A)');
    stray.push(...strayIn('overview', ov));

    app.fn('startEditSession')();
    app.fn('render')();
    const edit = html(app);
    t.includes(edit, '<div class="site-name">Job settings</div>', 'the screen it opens is Job settings too (3A)');
    t.includes(edit, '<label class="label">Job name</label>', '… with Job name');
    t.includes(edit, 'Lock job</div>', '… and Lock job');
    stray.push(...strayIn('job settings', edit));

    app.fn('activeSession')().locked = true;
    const entry = draw(app, 'entry');
    t.includes(entry, 'Job locked — no new entries', 'a locked job says Job locked');
    t.includes(entry, 'aria-label="Back to jobs"', 'the back button says jobs');
    stray.push(...strayIn('locked entry', entry));

    stray.push(...strayIn('reports', draw(app, 'reports')));
    app.state().retestRemindersEnabled = true;
    stray.push(...strayIn('retest', draw(app, 'retestReminders')));

    app.fn('setView')('sessions');
    const slideCount = app.run('TOUR_SLIDES.length');
    app.fn('openTour')();
    let tour = '';
    for (let i = 0; i < slideCount; i++) {
      app.fn('tourGoTo')(i);
      app.fn('render')();
      tour += html(app);
    }
    t.includes(tour, '+ New job</button>', 'the tour shows + New job');
    t.includes(tour, 'Job settings</button>', 'the tour shows Job settings');
    stray.push(...strayIn('tour', tour));

    t.eq(stray.join(' || '), '', 'no "session" on any of those screens');
  });

  /* ------------------------------------------------------------------ 60c */
  await t.group('60c — a nameless job is Job N; saved names are left alone (4A)', () => {
    const app = freshApp();
    const a = withSession(app, { name: '' });
    const b = withSession(app, { name: '' });
    t.eq(a.name, 'Job 1', 'the first nameless job is Job 1');
    t.eq(b.name, 'Job 2', 'the next is Job 2');

    const old = freshApp();
    withSession(old, { name: 'Session 3' });
    old.fn('save')();
    const again = freshApp({ localStorage: storageSeed(old) });
    const names = again.state().sessions.map(s => s.name);
    t.deepEq(names, ['Session 3'], 'a job saved as "Session 3" is still "Session 3" after a reload');
  });

  /* ------------------------------------------------------------------ 60d */
  await t.group('60d — the old word still finds its way (5A)', () => {
    const app = freshApp();
    const g = text(draw(app, 'settingsGlossary'));
    t.includes(g, 'Earlier versions called this a session.', 'the Glossary’s Job entry explains the old word');
    t.includes(g, 'Jobs, clients & sites', 'its section is Jobs, clients & sites');
    t.excludes(g, 'Some screens still call it a session', 'the old apology is gone');

    const hit = search(app, 'session');
    t.includes(hit, 'Glossary', 'searching "session" finds the Glossary');
    t.includes(hit, 'Phone Storage', '… and Phone Storage, where old jobs are cleared');
    t.excludes(search(app, 'zzqqxx'), 'Glossary', '(a search that matches nothing finds no Glossary)');
  });

  /* ------------------------------------------------------------------ 60e */
  await t.group('60e — a CSV with no site or name is named for a job', () => {
    const app = freshApp();
    const name = app.fn('csvFilename')({ site: '', name: '', date: '' });
    t.eq(name, 'PAT job.csv', 'the fallback file name says job');
  });

  /* ------------------------------------------------------------------ 60f */
  await t.group('60f — release: V122, What’s new rolled, cache, changelog', () => {
    const app = freshApp();
    t.eq(app.run('APP_VERSION'), 'V122', 'APP_VERSION V122');
    t.eq(app.run('WELCOME_VERSION'), 'V122', 'What’s new rolled to V122');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v122';", 'cache key pat-v122');
    const core = read('render-core.js');
    t.includes(core, '<li><strong>Sessions are now called Jobs.</strong>', 'V122’s What’s new: the rename');
    t.includes(core, '<li><strong>Nothing else has changed.</strong>', 'V122’s What’s new: data untouched');
    t.excludes(core, 'Bigger text if you want it.</strong>', 'V121’s sheet copy gone');
    const help = read('render-help.js');
    const a = help.indexOf('<p><strong>V122</strong>'), b = help.indexOf('<p><strong>V121</strong>'), c = help.indexOf('<p><strong>V120</strong>');
    t.ok(a > -1 && b > a && c > b, 'About: V122, V121, V120');
    t.excludes(help, '<p><strong>V119</strong>', 'V119 rolled off');
    t.includes(help, 'Sessions are now called Jobs everywhere in the app', 'About: V122’s line');
    t.includes(help, 'Bigger text if you want it: Settings', 'About: V121’s line still there');
    t.includes(help, 'Works better with VoiceOver: it says when', 'About: V120’s line still there');
  });
};
