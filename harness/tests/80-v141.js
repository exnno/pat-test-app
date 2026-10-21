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
     80e  release: V141 … — retired at V142; its lasting checks are 81e.

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

  // 80e retired at V142 → 81e (the release checks move with each release).
};
