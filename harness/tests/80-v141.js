/* Standing test — V141: About → Privacy from the privacy policy
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Stage 12's C (Peter 21 Oct: 0A 1A 2A 3A 4A). Claude
   drafted the full privacy policy; it lives on the WEBSITE (patgo.co.uk,
   DreamHost) as privacy.html — one page for the website form and the cloud
   app (2A), the address Google's Branding page needs to publish Google
   sign-in. It is not in this repo. The app's About → Privacy now gives a
   short summary of it and opens the whole thing in the browser (3A). Also:
   Contact's Report-a-problem note dropped "Your job data stays on your phone"
   (untrue for anyone signed in), and Settings search finds About by
   "privacy". 1A (sole trader trading as PATGo) and 4A (close an account by
   email, hello@ or peter@, deleted within 30 days) are the policy's own words.

     80a  About → Privacy as drawn: the summary (phone, the London cloud copy,
          what else the cloud knows, nothing sold, no tracking, the update
          check, backups); the link — the policy's address, a new browser
          window, no opener; a tap on it is left to the browser.
     80b  PRIVACY_URL: one address, https, on patgo.co.uk, named in config.js
          only and escaped where it is drawn; the link wears the button look
          without an underline.
     80c  Contact no longer says job data stays on the phone; Settings search
          finds About by "privacy".
     80e  release: V141, cache, What's new (one line), About V141 / V140 /
          V139; plus 79e's lasting checks (79e retired).

   How it LOOKS — the link as a button, light and dark — was checked in
   Chromium at 390×844 dark and 375×667 light (Playwright, not committed). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { freshApp } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;
const POLICY = 'https://www.patgo.co.uk/privacy.html';

function ready() {
  const app = freshApp();
  const st = app.state();
  st.welcomeSeen = true;
  st.onboardedV33Seen = true;
  st.migrationPrompt = { show: false, name: '', items: [] };
  return app;
}
function draw(app, v) { app.fn('setView')(v); app.fn('render')(); return html(app); }
function privacyCard(page) {
  const at = page.indexOf('<h3>Privacy</h3>');
  return at < 0 ? '' : page.slice(at, page.indexOf('<div class="info-card">', at));
}
function boot(opts = {}) {
  const app = bootApp(opts);
  app.state = () => app.refresh('state').state;
  return app;
}
function account(app) {
  app.state().view = 'cloudAccount';
  app.fn('render')();
}

module.exports = async function () {

  /* ------------------------------------------------------------------ 80a */
  await t.group('80a — About → Privacy: the policy summed up, and a link to the whole of it (3A)', () => {
    const app = ready();
    const card = privacyCard(draw(app, 'settingsAbout'));
    t.ok(card.length > 0, 'About has its Privacy card');
    t.includes(card, 'Your jobs, photos and settings are kept on this phone.', 'records: on this phone');
    t.includes(card, "If you sign in, a copy is kept in PATGo's cloud, in London, so you can get it back on another phone", 'the cloud copy — and where it is');
    t.includes(card, 'along with your email address, your plan, and which version of the app each of your phones runs.', 'what else the cloud knows (the version report too)');
    t.includes(card, 'Nothing is sold or shared, and there are no adverts or tracking.', 'nothing sold, no tracking');
    t.includes(card, 'The app goes online to check for updates.', 'the update check, still said');
    t.includes(card, 'Backups are saved only where you choose to save them.', 'backups: where you choose');
    t.excludes(card, 'Your test records, settings and saved descriptions', 'V130’s stopgap wording is gone');
    t.excludes(card, 'makes no network calls', 'the old "no network calls" claim stays gone');

    const link = (card.match(/<a [^>]*id="about-privacy-link"[^>]*>[\s\S]*?<\/a>/) || [''])[0];
    t.ok(link.length > 0, 'the card has the policy link');
    t.includes(link, `href="${POLICY}"`, '…to the policy on the website');
    t.includes(link, 'target="_blank"', '…opening in the browser, not in place of the app');
    t.includes(link, 'rel="noopener noreferrer"', '…with no way back into the app’s window');
    t.includes(link, 'Read the full privacy policy</a>', '…and says what it opens');
    t.excludes(link, 'data-action', '…a plain link, not an app action');

    // Through the surface the browser uses: a tap on the drawn link reaches the
    // app's own click handling, which must leave it to the browser. The stub DOM
    // does not build elements from innerHTML (an element fetched by id carries
    // no attributes, so any tap on it would pass), so the link is rebuilt from
    // the DRAWN tag's own attributes — a data-action written on it is seen.
    const el = app.doc.createElement('a');
    for (const m of link.slice(0, link.indexOf('>')).matchAll(/([a-z-]+)="([^"]*)"/g)) el.setAttribute(m[1], m[2]);
    t.eq(el.getAttribute('href'), POLICY, 'the drawn link, rebuilt: the policy’s address');
    app.doc.getElementById('app').appendChild(el);
    const ev = { type: 'click', target: el, defaultPrevented: false,
                 preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
    app.doc.getElementById('app').dispatchEvent(ev);
    t.eq(ev.defaultPrevented, false, 'a tap on it is not cancelled — the browser opens it');
    t.eq(app.state().view, 'settingsAbout', '…and the app stays where it was');
  });

  /* ------------------------------------------------------------------ 80b */
  await t.group('80b — PRIVACY_URL: one address, on patgo.co.uk, named once', () => {
    const app = freshApp();
    const url = app.run('PRIVACY_URL');
    t.eq(url, POLICY, 'PRIVACY_URL is the policy’s address');
    t.ok(/^https:\/\/(www\.)?patgo\.co\.uk\/privacy\.html$/.test(url), '…https, on patgo.co.uk — the domain Google’s Branding page names');
    // Change it in config.js and nothing else needs touching: no other app file
    // writes the address out.
    const files = fs.readdirSync(APP_DIR).filter(f => /\.(js|html)$/.test(f) && !/\.min\.js$|^supabase\.umd\.js$/.test(f));
    const naming = files.filter(f => read(f).includes('privacy.html'));
    t.deepEq(naming, ['config.js'], 'only config.js names privacy.html');
    t.includes(read('render-help.js'), 'href="${escapeHTML(PRIVACY_URL)}"', 'About draws it from PRIVACY_URL, escaped');
    t.includes(read('styles.css'), 'a.backup-action-btn { text-decoration: none; }', 'the link wears the button look without an underline');
  });

  /* ------------------------------------------------------------------ 80c */
  await t.group('80c — Contact stops saying job data stays on the phone; search finds Privacy', () => {
    const app = ready();
    const contact = draw(app, 'settingsContact');
    t.excludes(contact, 'Your job data stays on your phone.', 'Report a problem no longer says job data stays on the phone');
    t.includes(contact, 'Reports carry counts and settings only — never client names, sites or asset numbers.', '…and still says what a report carries');
    app.state().view = 'settings';
    app.state().settingsSearchQuery = 'privacy';
    t.includes(app.fn('renderSettingsHubBodyHTML')(), 'data-page="settingsAbout"', 'Settings search: "privacy" finds About');
    app.state().settingsSearchQuery = 'glossary';
    t.includes(app.fn('renderSettingsHubBodyHTML')(), 'data-page="settingsGlossary"', 'search itself still works (control)');
    app.state().settingsSearchQuery = '';
  });

  /* ------------------------------------------------------------------ 80e */
  await t.group('80e — release: V141, cache, What’s new, About; wiring; Tutorials (79e’s lasting checks)', async () => {
    const app = freshApp();
    t.eq(app.run('APP_VERSION'), 'V141', 'APP_VERSION V141');
    t.eq(app.run('WELCOME_VERSION'), 'V141', 'What’s new rolled');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v141';", 'cache key pat-v141');
    const core = read('render-core.js');
    const at = core.indexOf('<ul class="welcome-list sheet-scroll">');
    const sheetCopy = core.slice(at, core.indexOf('</ul>', at));
    t.eq((sheetCopy.match(/<li>/g) || []).length, 1, 'What’s new: one line');
    t.includes(sheetCopy, '<li><strong>Privacy policy.</strong>', '…Privacy policy');
    t.includes(sheetCopy, 'Settings &rarr; Help &rarr; About sums it up, with a link to read it all.', '…and says where to find it');
    t.includes(core, 'New here? Try the practice job.', 'setup offers the practice job');
    t.includes(core, 'You can do it again any time from Settings → Help → Tutorials.', '…and says where it lives');
    const help = read('render-help.js');
    const a = help.indexOf('<p><strong>V141</strong>'), b = help.indexOf('<p><strong>V140</strong>'), c = help.indexOf('<p><strong>V139</strong>');
    t.ok(a > -1 && b > a && c > b, 'About: V141, V140, V139');
    t.excludes(help, '<p><strong>V138</strong>', 'V138 rolled off');
    t.includes(help, 'PATGo has a full privacy policy. About now sums up', 'About: V141’s line');
    t.includes(help, 'Cloud accounts can sign in with Google. Connect your Google account once', 'About: V140’s line still there');
    t.includes(help, 'Cloud accounts can sign in with an email and password, set or change it on the Account page', 'About: V139’s line still there');
    t.includes(help, 'data-action="settings-page" data-arg="settingsTutorials"', 'About points at Tutorials');
    t.notOk(/accounts\.google\.com\/gsi|<script[^>]+google/i.test(read('index.html') + read('cloud.js') + read('signin-done.html')),
      'V140 1A: no Google script anywhere in the app');
    t.notOk(new RegExp(String.raw`\bconfirm\(|\balert\(|\bprompt\(`).test(read('cloud.js')), 'Disconnect asks in place — no browser dialogs');

    // Every cloud tap from V139 and V140 is wired, guarded, and harmless with
    // cloud.js missing (rule 6).
    const NEW = ['cloud-google', 'cloud-google-connect', 'cloud-google-cancel', 'cloud-google-off',
                 'cloud-google-keep', 'cloud-google-disconnect',
                 'cloud-password-sign-in', 'cloud-forgot', 'cloud-use-code', 'cloud-use-password',
                 'cloud-password-open', 'cloud-password-cancel', 'cloud-password-save', 'cloud-password-toggle'];
    const disp = read('dispatch.js');
    for (const n of NEW) t.ok(new RegExp(`'${n}':\\s*\\([^)]*\\) => \\{ if \\(typeof cloud\\w+ === 'function'\\)`).test(disp), `${n} wired, typeof-guarded`);
    const bare = boot({ skip: ['cloud.js'] });
    const actions = bare.run('ACTIONS');
    for (const n of NEW) t.doesNotThrow(() => actions[n]('', bare.doc.createElement('button')), `${n} harmless without cloud.js`);
    bare.state().view = 'cloudAccount';
    t.doesNotThrow(() => bare.fn('render')(), 'Account page renders without cloud.js');

    // A form never navigates: the submit that follows Sign in / Go is cancelled at #app.
    const f = boot();
    account(f);
    const ev = { type: 'submit', target: f.doc.createElement('form'), defaultPrevented: false,
                 preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
    f.doc.getElementById('app').dispatchEvent(ev);
    t.ok(ev.defaultPrevented, 'a submit on the Account page is cancelled (the app does not reload)');
    t.eq(f.state().cloud.busy, false, '…and runs nothing itself (the click did)');

    // 77e's lasting checks (carried by 78e, 79e).
    t.eq(app.run("SETTINGS_CATEGORIES.find(c => c.id === 'catHelp').pages[0]"), 'settingsTutorials', 'Tutorials heads the Help group');
    const al = ' ' + app.run('SETTINGS_PAGE_META.settingsTutorials.aliases') + ' ';
    t.ok(/ tutorial /.test(al) && / practice /.test(al), 'search finds it by tutorial or practice');
    t.ok(/ settings /.test(al) && / instrument /.test(al) && / backup /.test(al), '…and by settings, instrument or backup (V135)');
    app.fn('setView')('settingsTutorials');
    const page = html(app);
    t.includes(page, 'data-action="open-practice"', 'the page starts the practice job');
    t.includes(page, 'Nothing you do in it is saved', '…and says nothing is kept');
    const rows = [...page.slice(0, page.indexOf('id="tutorials-cloud-list"')).matchAll(/data-action="open-tutorial" data-arg="([^"]+)"/g)].map(m => m[1]);
    t.deepEq(rows, ['engineer', 'branding', 'content', 'items', 'backup'], 'the page lists the five Settings tutorials under Setting up');
    t.includes(page, 'Nothing you do in them is saved', '…and says nothing is kept');
    t.excludes(page, 'data-action="tut-show-me-how"', 'the Tutorials page itself has no Show me how');
    t.eq(app.run('typeof TOUR_SLIDES'), 'undefined', 'the five picture slides stay retired');
    t.eq(app.run('TUT_STEPS.length'), 21, 'the practice job: 21 steps (V134.1, unchanged)');
    t.includes(read('styles.css'), '.tut-howto-row {', 'the Show me how line has its own style (V137)');
    t.includes(disp, "'tut-show-me-how': (arg) => tutShowMeHow(arg),", 'the tap is wired (V137)');
    t.includes(read('tour.js'), "const TUT_WALK_KEYS = ['group', 'page'];", 'a page tutorial skips the walk (V138)');
  });
};
