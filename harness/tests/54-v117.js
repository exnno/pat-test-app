/* Standing test — V117: Report Settings split into two pages
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked (12 Oct, Peter "1A 2A 3A 4B 5B"): 1A the long
   Report Settings page becomes Company & Branding ('settingsReport', kept) and
   Certificate Content ('settingsReportContent', new); 2A Quick Pick Items left
   alone; 3A the preview's "Edit report settings" still opens the first page and
   Back still returns to the preview; 4B a short What's new anyway; 5B the
   Logging group stays as it is. Structural: every section moved byte-for-byte.

     54a  the two pages: where they sit, which sections each draws (each of the
          11 exactly once across the two), both have Save, search finds them.
     54b  sync holds off on both halves (the behaviour is pinned in 21r; this
          pins the list the repaint check reads).
     54c  one Save, one object: saving either half keeps the other half's
          settings exactly as saved.
     54d  words that pointed at "Report Settings" now name the right half; the
          Certificate Content row's summary line.
     (54e, V117's release lines, moved on to 55e at V118.) */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;
function draw(app, v) { app.fn('setView')(v); app.fn('render')(); return html(app); }

const BRAND   = ['Reports', 'Company details', 'Report title', 'Colours', 'Signature'];
const CONTENT = ['What to include', 'Recommended retest', 'Declaration text', 'PDF file name', 'Certificate numbers', 'Templates'];
const heads = (h) => [...h.matchAll(/<h2 class="h2">([^<]+)<\/h2>/g)].map(m => m[1]);

module.exports = async function () {

  /* ------------------------------------------------------------------ 54a */
  await t.group('54a — two pages: where they sit, what each draws, search finds them', () => {
    const app = freshApp();
    const cats = app.run('SETTINGS_CATEGORIES');
    const rep = cats.find(c => c.id === 'catReports');
    t.deepEq(rep.pages, ['settingsReport', 'settingsReportContent', 'settingsCsv'], 'Reports & Exports: Company & Branding, Certificate Content, CSV Columns');
    const meta = app.run('SETTINGS_PAGE_META');
    t.eq(meta.settingsReport.title, 'Company & Branding', 'first half named');
    t.eq(meta.settingsReportContent.title, 'Certificate Content', 'second half named');

    app.state().reportSettings.enabled = true;
    const b = draw(app, 'settingsReport');
    t.includes(b, '<div class="site-name">Company &amp; Branding</div>', 'Company & Branding: its own title');
    t.deepEq(heads(b), BRAND, 'Company & Branding draws exactly its five sections, in order');
    t.eq((b.match(/data-action="settings-report-save"/g) || []).length, 1, '…and one Save');
    const c = draw(app, 'settingsReportContent');
    t.includes(c, '<div class="site-name">Certificate Content</div>', 'Certificate Content: its own title');
    t.excludes(c, '<div class="site-name">Company &amp; Branding</div>', '…not the first half’s');
    t.deepEq(heads(c), CONTENT, 'Certificate Content draws exactly its six sections, in order');
    t.eq((c.match(/data-action="settings-report-save"/g) || []).length, 1, '…and one Save');

    // The category list draws both rows.
    app.state().settingsCategory = 'catReports';
    const list = draw(app, 'settingsCategory');
    t.includes(list, 'data-page="settingsReport"', 'the list has Company & Branding');
    t.includes(list, 'data-page="settingsReportContent"', 'the list has Certificate Content');

    // Search: the old name finds both; each half's own words find only it.
    const search = (q) => { app.state().settingsSearchQuery = q; return app.fn('renderSettingsHubBodyHTML')(); };
    let r = search('report settings');
    t.ok(r.includes('data-page="settingsReport"') && r.includes('data-page="settingsReportContent"'), '"report settings" still finds both halves');
    r = search('declaration');
    t.ok(r.includes('data-page="settingsReportContent"') && !r.includes('data-page="settingsReport"'), '"declaration" → Certificate Content only');
    r = search('logo');
    t.ok(r.includes('data-page="settingsReport"') && !r.includes('data-page="settingsReportContent"'), '"logo" → Company & Branding only');
    app.state().settingsSearchQuery = '';
  });

  /* ------------------------------------------------------------------ 54b */
  await t.group('54b — sync waits on both halves (21r pins the behaviour)', () => {
    const app = freshApp();
    t.deepEq(app.run('REPORT_SETTINGS_VIEWS'), ['settingsReport', 'settingsReportContent'], 'both halves count as report settings open');
    const nr = app.run('SYNC_NO_REPAINT_VIEWS');
    t.ok(nr.includes('settingsReport') && nr.includes('settingsReportContent'), 'a sync repaint waits for either half to close');
    const sy = read('sync.js');
    t.excludes(sy, "state.view === 'settingsReport'", 'no sync check looks at the first half alone');
  });

  /* ------------------------------------------------------------------ 54c */
  await t.group('54c — one Save, one object: either half keeps the other half’s settings', () => {
    const app = freshApp();
    const st = app.state();
    app.run(`state.reportSettings.companyName = 'ZZ Co'; state.reportSettings.reportTitle = 'ZZ Title';
      state.reportSettings.declarationText = 'ZZ Declared'; saveReportSettings();`);
    st.settingsCategory = 'catReports';
    // Save on Certificate Content: its typing kept, the company untouched.
    // (The stub keeps ids it has seen, so "not on this half" reads the markup.)
    t.excludes(draw(app, 'settingsReportContent'), 'id="report-company-name"', 'the company box is not on this half');
    app.doc.getElementById('report-declaration-text').value = 'ZZ New wording';
    app.fn('saveReportSettingsForm')();
    let saved = app.fn('loadReportSettings')();
    t.eq(saved.declarationText, 'ZZ New wording', 'Certificate Content: its typing is saved');
    t.eq(saved.companyName, 'ZZ Co', '…and the company name on the other half is kept');
    t.eq(saved.reportTitle, 'ZZ Title', '…and the report title');
    t.eq(st.view, 'settingsCategory', 'Save lands on Reports & Exports, as Back would');
    // Save on Company & Branding: the declaration untouched.
    t.excludes(draw(app, 'settingsReport'), 'id="report-declaration-text"', 'the declaration box is not on this half');
    app.doc.getElementById('report-company-name').value = 'ZZ Renamed Co';
    app.fn('saveReportSettingsForm')();
    saved = app.fn('loadReportSettings')();
    t.eq(saved.companyName, 'ZZ Renamed Co', 'Company & Branding: its typing is saved');
    t.eq(saved.declarationText, 'ZZ New wording', '…and the declaration on the other half is kept');
  });

  /* ------------------------------------------------------------------ 54d */
  await t.group('54d — words point at the right half; Certificate Content’s summary line', () => {
    const rs = read('render-settings.js');
    t.includes(rs, 'switch them on or off under Certificate Content → What to include.', 'Test Readings points at Certificate Content');
    t.includes(rs, 'The interval is taken from your Certificate Content default', 'Retest Reminders points at Certificate Content');
    t.includes(rs, 'replaces all your report settings on both pages — including the logo, signature and colours on Company &amp; Branding.', 'Templates: a template covers both pages');
    t.excludes(rs, 'under Report Settings →', 'no page still sends people to Report Settings');
    const rv = read('render-review.js');
    t.includes(rv, 'add your company name and logo in Company &amp; Branding', 'the Reports tip names Company & Branding');
    t.excludes(rv, 'logo in Report Settings', '…not the old page');

    const app = freshApp();
    const sub = app.fn('settingsPageSubtitle');
    app.run(`state.reportSettings.certEnabled = false; state.reportTemplates = [];`);
    t.eq(sub('settingsReportContent'), 'Certificate numbers off · no templates', 'summary: numbers off, no templates');
    app.run(`state.reportSettings.certEnabled = true; state.reportTemplates = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];`);
    t.eq(sub('settingsReportContent'), 'Certificate numbers on · 2 templates', 'summary: numbers on, two templates');
    app.run(`state.reportTemplates = [{ id: 'a', name: 'A' }];`);
    t.eq(sub('settingsReportContent'), 'Certificate numbers on · 1 template', 'summary: one template');
  });
  // 54e (V117's release lines) moved on to 55e at V118.
};
