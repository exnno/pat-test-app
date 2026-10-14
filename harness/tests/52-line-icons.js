/* Standing test — V115: line icons app-wide (Stage 12)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked: 8A line icons replace emoji used as icons,
   whole app; 9A/12A Lucide (ISC); 13A Settings-list icons in --accent;
   14B a temporary "Classic emoji icons" switch (Theme & Sound) for V115 only;
   1A an icon at the start of a banner or note, outside the escaped words;
   2A empty states large and soft grey; 3A wizard icons large in PATGo blue;
   4A the switch's wording. One file (icons.js), one helper (icon(name)).

     52a  icons.js: every icon() call in the app and every name in the Settings
          tables resolves; an unknown name draws nothing; licence notices kept.
     52b  what icon() draws: an SVG that takes the text colour, hidden from
          screen readers, named by class so a test can find it.
     52c  sweep: no old emoji icon on ANY screen (every view and Settings page,
          drawn through render()), and the sweep CAN see one (V116: icon()
          swapped for an emoji-drawing stand-in — the Classic switch is gone).
     52d  Settings rows: the page's icon in the accent colour (13A).
     52e  the button rule: export/share = upload, import = download, a page
          opener ends in a chevron, the template save is plain words, + New.
     52f  1A 2A 3A: banners put the icon outside the escaped text (a name with
          markup in it is still escaped); empty states and wizard icons.
     52g  RETIRED V116 with the Classic emoji switch (1A) — see group 53.
     52h  icons.js loaded and probed. (V116: the V115 release lines moved
          out — group 53 pins the current release.) */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, withSession, withItem, withInstrument } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');

// The old emoji used as icons. ● ○ → Ω × stay as text by design (BACKLOG V115).
const OLD = /[\u{1F300}-\u{1FAFF}☀-⛿✀-➿⬆⬇↶↺↻＋⎘⏰⏱⏭▾▸▲▼⌄▦‹›⟳ℹ]/u;

// A job with a fail and a pass, and the optional features on, so the screens
// draw their buttons. Retest reminders on so the Retest page draws its how-to.
function busyApp(opts) {
  const app = freshApp(opts);
  const st = app.state();
  st.retestRemindersEnabled = true; st.multiPick.enabled = true;
  st.undoEnabled = true; st.mapPinEnabled = true;
  withSession(app);
  withItem(app, { assetNo: 'ZZI1', result: 'fail' });
  withItem(app, { assetNo: 'ZZI2', result: 'pass' });
  return app;
}
const VIEWS = (app) => ['sessions', 'entry', 'overview', 'editSession', 'settings', 'retestReminders', 'reports']
  .concat(Object.keys(app.val('SETTINGS_PAGE_META')));
function draw(app, v) { app.fn('setView')(v); app.fn('render')(); return html(app); }

module.exports = async function () {

  /* ------------------------------------------------------------------ 52a */
  await t.group('52a — every icon the app asks for exists; unknown draws nothing; licences kept', () => {
    const app = freshApp();
    const names = Object.keys(app.val('ICON_PATHS'));
    t.ok(names.length >= 50, `the icons file holds the set (${names.length})`);
    const asked = new Set();
    for (const f of fs.readdirSync(APP_DIR).filter(n => n.endsWith('.js') && !/\.min\.js$|umd|^icons\.js$/.test(n))) {
      for (const m of strip(read(f)).matchAll(/\bicon\('([a-z0-9-]+)'/g)) asked.add(m[1]);
      for (const m of strip(read(f)).matchAll(/\bicon\([a-zA-Z.]+ \? '([a-z0-9-]+)' : '([a-z0-9-]+)'\)/g)) { asked.add(m[1]); asked.add(m[2]); }
    }
    for (const tbl of ['SETTINGS_CATEGORIES', 'SETTINGS_PAGE_META']) {
      const v = app.val(tbl);
      for (const r of (Array.isArray(v) ? v : Object.values(v))) asked.add(r.icon);
    }
    t.ok(asked.size >= 50, `the scan found the app's icon calls (${asked.size})`);
    const missing = [...asked].filter(n => !names.includes(n));
    t.eq(missing.join(','), '', 'every name the app uses is in icons.js');
    for (const n of asked) t.ok(app.fn('icon')(n).startsWith('<svg'), `icon('${n}') draws`);
    t.eq(app.fn('icon')('no-such-icon'), '', 'an unknown name draws nothing (never a stray word)');
    const src = read('icons.js');
    t.includes(src, 'Lucide', 'the source is named');
    t.includes(src, 'Permission to use, copy, modify, and/or distribute this software', 'the ISC notice is in the icons file (9A)');
    t.includes(read('THIRD-PARTY-LICENSES.txt'), 'Lucide', 'and in the third-party licences');
    t.includes(src, '(c) 2026 Peter Birchley. All rights reserved.', 'our own copyright line too');
  });

  /* ------------------------------------------------------------------ 52b */
  await t.group('52b — icon() draws a line icon in the text colour, hidden from screen readers', () => {
    const app = freshApp();
    const s = app.fn('icon')('trash-2');
    t.ok(/^<svg class="ic ic-trash-2"/.test(s), 'an svg, classed by name');
    t.includes(s, 'aria-hidden="true"', 'hidden from screen readers — the words carry the meaning');
    t.includes(s, 'stroke="currentColor"', 'drawn in the colour of the text around it');
    t.includes(s, 'fill="none"', 'a line, not a filled shape');
    t.includes(s, 'viewBox="0 0 24 24"', 'Lucide’s grid');
    t.includes(app.fn('icon')('share', 'share-icon'), 'class="ic ic-share share-icon"', 'an extra class rides along (the old share glyph’s sizes)');
    t.excludes(read('csv.js'), 'const SHARE_ICON_SVG', 'the old share glyph is folded in, not kept twice');
  });

  /* ------------------------------------------------------------------ 52c */
  await t.group('52c — no old emoji icon on any screen; the sweep can see one when there is', () => {
    const app = busyApp();
    const views = VIEWS(app);
    const bad = [];
    let svgs = 0;
    for (const v of views) {
      const h = draw(app, v);
      svgs += (h.match(/class="ic ic-/g) || []).length;
      const m = h.replace(/<svg[\s\S]*?<\/svg>/g, '').match(OLD);
      if (m) bad.push(`${v}: ${m[0]}`);
    }
    t.ok(views.length >= 30, `every view and Settings page drawn (${views.length})`);
    t.ok(svgs > 100, `…with line icons on them (${svgs})`);
    t.eq(bad.join(' | '), '', 'no emoji used as an icon anywhere');
    // Prove the sweep is not blind: the same screens with icon() replaced by a
    // stand-in that draws an emoji (V116 — the Classic switch that did this is
    // gone). If OLD or the svg-stripping ever stops seeing emoji, this fails.
    const old = busyApp();
    old.run("icon = function () { return '<span>\u{1F5D1}</span>'; }");
    let seen = 0;
    for (const v of VIEWS(old)) if (OLD.test(draw(old, v).replace(/<svg[\s\S]*?<\/svg>/g, ''))) seen++;
    t.ok(seen >= 25, `with an emoji-drawing icon(), the sweep finds emoji on ${seen} screens`);
    // The text-only places keep their characters (they can't hold an svg).
    t.includes(read('report.js'), "polarity === true) ? '✓'", 'the PDF polarity column is untouched');
  });

  /* ------------------------------------------------------------------ 52d */
  await t.group('52d — Settings rows draw the page’s icon, in the accent colour (13A)', () => {
    const app = freshApp();
    const h = draw(app, 'settings');
    for (const c of app.val('SETTINGS_CATEGORIES')) {
      if (!h.includes(`data-arg="${c.id}"`)) continue;   // a group this phone hides (cloud, signed out)
      const row = h.split(`data-arg="${c.id}"`)[1].split('</button>')[0];
      t.includes(row, `<span class="settings-row-icon"><svg class="ic ic-${c.icon}"`, `${c.title}: its ${c.icon} icon`);
    }
    app.state().settingsCategory = 'catData';
    const cat = draw(app, 'settingsCategory');
    t.includes(cat, '<span class="settings-row-icon"><svg class="ic ic-save"', 'Backup & Restore: save (💾 was the Data group’s too — now database)');
    const css = strip(read('styles.css'));
    t.ok(/\.settings-row-icon \{ color: var\(--accent\); \}/.test(css), 'Settings-list icons take --accent');
    t.ok(/--accent: #2563eb;/.test(css) && /--accent: #3b82f6;/.test(css), '…#2563eb light, #3b82f6 dark');
  });

  /* ------------------------------------------------------------------ 52e */
  await t.group('52e — the button rule: export up, import down, page openers end in ›, plain where it helps nothing', () => {
    const app = busyApp();
    const I = app.fn('icon');
    const btn = (h, action) => (h.split(`data-action="${action}"`)[1] || '').split('</button>')[0];
    let h = draw(app, 'settingsBackup');
    t.ok(btn(h, 'backup-export').includes(I('upload') + ' Export backup'), 'Export backup: upload');
    t.ok(btn(h, 'backup-import').includes(I('download') + ' Import backup'), 'Import backup: download');
    h = draw(app, 'settingsStorage');
    t.ok(btn(h, 'pm-open').includes(I('images') + ' Manage Photos ' + I('chevron-right', 'ic-trail')), 'Manage Photos: its icon and ›');
    h = draw(app, 'settingsSetup');
    t.ok(btn(h, 'setup-share').includes(I('upload') + ' Share setup'), 'Share setup: upload');
    t.ok(btn(h, 'setup-import').includes(I('download') + ' Import setup'), 'Import setup: download');
    h = draw(app, 'settingsItems');
    t.ok(btn(h, 'preset-new').startsWith('>+ New'), '+ New is plain');
    t.ok(btn(h, 'preset-rename').startsWith('>Rename'), 'Rename is plain');
    t.ok(btn(h, 'settings-items-reset').includes(I('rotate-ccw') + ' Reset to defaults'), 'reset: rotate-ccw');
    h = draw(app, 'settingsCsv');
    t.ok(btn(h, 'settings-csv-reset').includes(I('rotate-ccw') + ' Reset to defaults'), 'CSV Columns reset gains its icon');
    app.state().reportSettings.enabled = true;
    h = draw(app, 'settingsReportContent');   // V117: templates moved to Certificate Content
    t.ok(/data-action="report-template-save-new"[^>]*>Save current settings/.test(h), 'the template save is plain words (💾 is Backup’s)');
    const rs = read('render-settings.js');
    // Signed in only (needs the cloud), so source-guarded like Account below.
    t.includes(rs, `data-action="jm-open" style="margin-top:10px">\${icon('shield-check')} Jobs on This Phone \${icon('chevron-right', 'ic-trail')}</button>`, 'Jobs on This Phone opens a page: its icon and \u203a');
    t.includes(rs, `data-arg="settingsRetest">\${icon('bell')} Retest reminders \${icon('chevron-right', 'ic-trail')}</button>`, 'Retest reminders opens a page: ›');
    t.includes(read('render-help.js'), `>\${icon('user')} Account \${icon('chevron-right', 'ic-trail')}</button>`, 'Account opens a page: ›');
    t.ok(/data-client-delete="\$\{escapeHTML\(c\.id\)\}">\$\{icon\('trash-2'\)\} Delete<\/button>/.test(rs), 'Clients: Delete gains trash');
  });

  /* ------------------------------------------------------------------ 52f */
  await t.group('52f — banners and notes: icon outside the escaped words (1A); empty states (2A); wizard (3A)', () => {
    const app = freshApp();
    const I = app.fn('icon');
    withInstrument(app, { make: 'ZZ<b>Apollo</b>', calDue: '2020-01-01' });
    const h = draw(app, 'sessions');
    const banner = (h.split('class="cal-banner-text">')[1] || '').split('</span>')[0] + '</span>';
    t.ok(banner.startsWith(I('triangle-alert') + ' '), 'the calibration banner starts with the warning icon');
    t.includes(banner, 'ZZ&lt;b&gt;Apollo&lt;/b&gt;', '…and the instrument name is still escaped');
    t.excludes(banner, '&lt;svg', 'the icon itself is never escaped');
    app.run('exportReminderDue = () => [{ id: 1 }, { id: 2 }];');
    const rem = app.fn('renderReminderBanners')();
    t.includes(rem, '<div class="backup-banner-text">' + I('alarm-clock') + ' 2 locked jobs have', 'the reminder banner: alarm clock, then the words');
    // Empty states: a fresh phone's Jobs list.
    const fresh = freshApp();
    const e = draw(fresh, 'sessions');
    t.includes(e, '<div class="empty-state-icon" aria-hidden="true">' + I('clipboard-list') + '</div>', 'empty state: a line icon, not a name or an emoji');
    // The wizard, every step.
    const wz = freshApp();
    wz.state().onboardedV33Seen = false;
    const seen = []; let boxes = 0;
    for (let s = 1; s <= 6; s++) {
      wz.state().wizardStep = s; wz.fn('render')();
      const h = html(wz);
      boxes += (h.match(/<div class="wizard-icon">/g) || []).length;
      for (const m of h.matchAll(/<div class="wizard-icon"><svg class="ic ic-([a-z0-9-]+)"/g)) seen.push(m[1]);
    }
    t.ok(boxes >= 4, `the wizard draws its big icons (${boxes} across the steps)`);
    t.eq(seen.length, boxes, `every one is a line icon (${seen.join(', ')})`);
    t.ok(seen.includes('smartphone'), '…including the first step\u2019s phone');
    const css = strip(read('styles.css'));
    t.ok(/\.empty-state-icon \{ color: var\(--text-hint\); \}/.test(css), '2A: empty states soft grey');
    t.ok(/\.wizard-icon \{ color: var\(--accent\); \}/.test(css), '3A: wizard icons PATGo blue');
    // V121: icon sizes are rem now (44px = 2.75rem, 48px = 3rem at Standard).
    t.ok(/\.empty-state-icon \.ic \{ width: 2\.75rem; height: 2\.75rem;/.test(css) && /\.wizard-icon \.ic \{ width: 3rem; height: 3rem;/.test(css), '…both large');
  });

  /* 52g — RETIRED V116 (1A): the Classic emoji switch it tested is gone. Its
     replacement checks (the switch is absent, the old choice is deleted, a V115
     backup carrying it still restores) are group 53. */

  /* ------------------------------------------------------------------ 52h */
  await t.group('52h — icons.js loaded and probed', () => {
    const idx = read('index.html');
    t.ok(idx.indexOf('src="utils.js"') < idx.indexOf('src="icons.js"') && idx.indexOf('src="icons.js"') < idx.indexOf('src="storage.js"'), 'icons.js loads after utils.js, before anything that draws');
    t.includes(read('sw.js'), "  './icons.js',", 'and is precached');
    t.includes(read('boot.js'), "    'icon'\n  ];", 'the boot guard probes for it');
    const scripts = (idx.match(/<script src="[^"]+\.js"><\/script>/g) || []).filter(s => !/min\.js|umd/.test(s)).length;
    t.eq(scripts, 35, 'first-party scripts: 35 (33 + icons.js, V125 + exportall.js)');
  });
};
