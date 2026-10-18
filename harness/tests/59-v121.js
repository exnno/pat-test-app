/* Standing test — V121: text size (Stage 12, part 4 — last of the accessibility pass)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked (14 Oct, Peter "1A 2A 3A 4A 5A"):
   1A  A Text size setting in the app, starting on Standard — nobody's app
       changes on update.
   2A  Standard / Large / Larger = 100% / 115% / 130%.
   3A  All text on every screen grows, and icons with it. Every font-size was
       converted px → rem at 16px = 1rem (proved byte-for-byte by converting
       back to V120), so Standard is identical. Kept fixed: the five symbols in
       fixed-size marks and the size samples (see the html rule in styles.css).
       The PDF certificate and CSV never read it.
   4A  Pinch-zoom stays blocked (index.html viewport unchanged).
   5A  Its own section on Theme & Sound; each option drawn at its real size;
       "text size" added to Settings search.

     59a  every text size scales: no px font-size anywhere a phone runs, bar
          the documented fixed ones; every rem is a whole px at Standard;
          the fixed icon sizes are rem too.
     59b  the base rule: Standard PINS 16px; Large 115%; Larger 130%; the
          fixed ones are exactly the documented list; pinch-zoom still off.
     59c  applyTextSize / normaliseTextSize: one class on <html>, the old one
          removed, Standard = no class, garbage = Standard.
     59d  a tap on the option (through #app) sets it, saves it, and a
          reloaded phone starts on it before the first screen is drawn.
     59e  the page, the Settings row, search, backup and setup files, the
          problem report.
     59f  release: V121 … — moved to 60f in V122.

   ⚠ 59a IS A SWEEP. A new font-size in px (stylesheet or a style="" in a
   script) fails it: write it in rem (px ÷ 16), or — only for a symbol in a
   fixed-size mark — add the rule to FIXED below AND to the html comment. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, scriptOrderFromIndex } = require('../load');
const { freshApp } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const stripCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

/* The rules allowed to keep a px font-size: the html scale itself, the three
   size samples, and the five symbols in fixed-size marks. */
const FIXED = [
  'html', 'html.ts-large', 'html.ts-larger',
  '.text-size-sample-standard', '.text-size-sample-large', '.text-size-sample-larger',
  '.reading-polarity-box', '.photo-thumb-remove', '.pm-group-tick', '.pm-tick', '.jm-tick',
];

function cssRules(css) {
  const out = [];
  for (const m of stripCss(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ sel: m[1].trim().split('\n').pop().trim(), body: m[2] });
  }
  return out;
}

/* Every first-party script a phone runs (vendored PDF libraries excluded). */
function appScripts() {
  return scriptOrderFromIndex().filter(f => !/pdfjs|jspdf|autotable|supabase/i.test(f));
}

module.exports = async function () {

  /* ------------------------------------------------------------------ 59a */
  await t.group('59a — every text size scales: rem everywhere a phone runs (3A)', () => {
    const rules = cssRules(read('styles.css'));
    const pxRules = rules.filter(r => /font-size:\s*[\d.]+px/.test(r.body)).map(r => r.sel);
    const stray = pxRules.filter(s => !FIXED.includes(s));
    t.deepEq(stray, [], `no stylesheet text size in px outside the fixed list${stray.length ? ' — found: ' + stray.slice(0, 5).join(' | ') : ''}`);

    const rems = [...stripCss(read('styles.css')).matchAll(/font-size:\s*([\d.]+)rem/g)].map(m => Number(m[1]));
    // V134: the picture tour's 24 sizes went with it (7A) — was 290.
    t.ok(rems.length >= 270, `the stylesheet's text sizes are rem (${rems.length})`);
    const odd = rems.filter(v => v * 16 !== Math.round(v * 16));
    t.deepEq(odd, [], 'every rem is a whole px at Standard (converted, not re-chosen)');

    const inline = [];
    for (const f of appScripts()) {
      for (const m of read(f).matchAll(/font-size:\s*[\d.]+px/g)) inline.push(f + ': ' + m[0]);
    }
    t.deepEq(inline, [], `no text size in px written by a script${inline.length ? ' — ' + inline.slice(0, 5).join(' | ') : ''}`);
    t.includes(read('render-help.js'), '<p class="muted" id="sync-last" style="font-size:0.8125rem">', 'a known inline size reads rem (0.8125rem = 13px)');

    // The fixed icon sizes grow with the text (3A: icons too).
    const css = stripCss(read('styles.css'));
    const icons = css.slice(css.indexOf('.ic {'), css.indexOf('.icon-btn .share-icon'));
    t.notOk(/(?:width|height):\s*\d+px/.test(icons), 'no icon width/height in px');
    t.ok(/\.wizard-icon \.ic \{ width: 3rem; height: 3rem;/.test(css), 'the wizard icon is 3rem (48px at Standard)');
    t.ok(/\.pass-btn \.icon \.ic, \.fail-btn \.icon \.ic \{ width: 1\.875rem; height: 1\.875rem;/.test(css), 'the PASS/FAIL icons are 1.875rem (30px)');
    t.ok(/\.share-icon \{\s*width: 1\.125rem;\s*height: 1\.125rem;/.test(css), 'the share icon is 1.125rem (18px)');
  });

  /* ------------------------------------------------------------------ 59b */
  await t.group('59b — the scale: Standard pins 16px; Large 115%; Larger 130%; the fixed list (2A, 4A)', () => {
    const rules = cssRules(read('styles.css'));
    const size = (sel) => {
      const r = rules.find(x => x.sel === sel && /font-size/.test(x.body));
      const m = r && r.body.match(/font-size:\s*([\d.]+)px/);
      return m ? Number(m[1]) : null;
    };
    t.eq(size('html'), 16, 'Standard is pinned at 16px — the size every rem was converted from');
    t.eq(size('html.ts-large'), 18.4, 'Large = 115% (18.4px)');
    t.eq(size('html.ts-larger'), 20.8, 'Larger = 130% (20.8px)');
    t.eq(size('.text-size-sample-standard'), 16, 'sample: Standard drawn at 16px');
    t.eq(size('.text-size-sample-large'), 18.4, 'sample: Large drawn at 18.4px');
    t.eq(size('.text-size-sample-larger'), 20.8, 'sample: Larger drawn at 20.8px');

    const pxSel = rules.filter(r => /font-size:\s*[\d.]+px/.test(r.body)).map(r => r.sel).sort();
    t.deepEq(pxSel, FIXED.slice().sort(), 'exactly the documented rules keep px');
    const raw = read('styles.css');
    for (const s of ['.reading-polarity-box', '.photo-thumb-remove', '.pm-group-tick', '.pm-tick', '.jm-tick']) {
      t.includes(raw.slice(raw.indexOf('/* V121 text size'), raw.indexOf('html { font-size: 16px; }')), s, `the html comment names ${s} as fixed`);
    }
    t.ok(/<meta name="viewport" content="[^"]*user-scalable=no/.test(read('index.html')), '4A: pinch-zoom stays blocked');
  });

  /* ------------------------------------------------------------------ 59c */
  await t.group('59c — applyTextSize: one class on <html>; Standard = none; garbage = Standard', () => {
    const app = freshApp();
    const html = app.doc.documentElement;
    const apply = app.fn('applyTextSize');
    const norm = app.fn('normaliseTextSize');
    t.eq(norm('large'), 'large', 'large is a size');
    t.eq(norm('larger'), 'larger', 'larger is a size');
    t.eq(norm('huge'), 'standard', 'an unknown value reads as Standard');
    t.eq(norm(null), 'standard', 'nothing stored reads as Standard');
    t.eq(norm('__proto__'), 'standard', 'nor does a sneaky key');

    apply('larger');
    t.ok(html.classList.contains('ts-larger'), 'Larger puts ts-larger on <html>');
    apply('large');
    t.ok(html.classList.contains('ts-large'), 'Large puts ts-large on <html>');
    t.notOk(html.classList.contains('ts-larger'), '…and takes ts-larger off');
    apply('standard');
    t.notOk(html.classList.contains('ts-large') || html.classList.contains('ts-larger'), 'Standard leaves no size class');
    apply('larger'); apply('huge');
    t.notOk(html.classList.contains('ts-larger'), 'garbage goes back to Standard, not left on the last size');
  });

  /* ------------------------------------------------------------------ 59d */
  await t.group('59d — a tap sets it and saves it; a reopened phone starts on it', () => {
    const app = freshApp();
    // The tap exactly as the browser delivers it: a click on #app.
    const el = app.doc.createElement('button');
    el.dataset.action = 'set-text-size';
    el.dataset.arg = 'larger';
    app.doc.getElementById('app').dispatchEvent({
      type: 'click', target: el, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
    });
    t.eq(app.state().textSize, 'larger', 'the tap set Larger');
    t.ok(app.doc.documentElement.classList.contains('ts-larger'), 'and the screen grew');
    t.eq(app.sandbox.localStorage.getItem('pat:textsize'), 'larger', 'saved on this phone (pat:textsize)');

    // A phone opened with Larger saved: boot applies it.
    const again = freshApp({ localStorage: { 'pat:textsize': 'larger' } });
    t.eq(again.state().textSize, 'larger', 'load() reads it back');
    t.ok(again.doc.documentElement.classList.contains('ts-larger'), 'boot puts it on <html>');
    const boot = read('boot.js');
    const a = boot.indexOf('applyTheme(state.theme);\napplyTextSize(state.textSize);');
    // The first plain render() after the boot gate opens is the first screen.
    const gate = boot.indexOf('if (_bootLoadOK) {');
    const first = boot.slice(gate).search(/\n\s*render\(\);/);
    t.ok(a > -1, 'boot applies it beside the theme');
    t.ok(a > gate && gate > -1 && first > -1 && a < gate + first, 'before the first screen is drawn');

    const junk = freshApp({ localStorage: { 'pat:textsize': 'enormous' } });
    t.eq(junk.state().textSize, 'standard', 'garbage stored → Standard');
    t.notOk(junk.doc.documentElement.classList.contains('ts-enormous'), 'and no made-up class');
  });

  /* ------------------------------------------------------------------ 59e */
  await t.group('59e — the page, the Settings row, search, backup, setup, problem report (5A)', () => {
    const app = freshApp();
    const st = app.state();
    st.textSize = 'large';
    const page = app.fn('renderSettingsDisplay')();
    const opts = [...page.matchAll(/data-action="set-text-size" data-arg="(\w+)"[^>]*aria-pressed="(\w+)"/g)].map(m => m[1] + ':' + m[2]);
    t.deepEq(opts, ['standard:false', 'large:true', 'larger:false'], 'three options; the chosen one is pressed');
    t.ok(/<h2 class="h2">Text size<\/h2>/.test(page), 'its own section, headed Text size');
    t.ok(page.indexOf('Text size</h2>') < page.indexOf('Haptics</h2>') && page.indexOf('Theme</h2>') < page.indexOf('Text size</h2>'), 'between Theme and Haptics');
    t.eq((page.match(/class="theme-option-label text-size-sample-(standard|large|larger)"/g) || []).length, 3, 'each label is drawn at its own size');
    t.ok(/<span class="theme-option-radio checked"><\/span>\s*<span class="theme-option-label text-size-sample-large">/.test(page), 'the chosen size shows the filled circle');

    // The Theme & Sound row's live line (category list and search results).
    const sub = app.fn('settingsPageSubtitle');
    t.includes(sub('settingsDisplay'), 'Large text', 'the Settings row says Large text when it is on');
    st.textSize = 'larger';
    t.includes(sub('settingsDisplay'), 'Larger text', '…Larger text for Larger');
    st.textSize = 'standard';
    t.notOk(/Large/.test(sub('settingsDisplay')), '…and nothing at Standard');

    t.ok(/settingsDisplay:[^\n]*aliases: '[^']*text size[^']*'/.test(read('data.js')), 'Settings search finds "text size"');

    // Backup: carried, restored, older backups and garbage left alone.
    st.textSize = 'larger';
    const bk = app.fn('buildBackup')();
    t.eq(bk.textSize, 'larger', 'the backup carries the size');
    const apply = app.fn('applyBackupData');
    st.textSize = 'standard';
    apply(Object.assign({}, bk, { textSize: 'larger' }), { quiet: true });
    t.eq(app.state().textSize, 'larger', 'restoring brings it back');
    t.ok(app.doc.documentElement.classList.contains('ts-larger'), 'and applies it');
    const old = Object.assign({}, bk); delete old.textSize;
    apply(old, { quiet: true });
    t.eq(app.state().textSize, 'larger', 'an older backup (no size) leaves it alone');
    apply(Object.assign({}, bk, { textSize: 'gigantic' }), { quiet: true });
    t.eq(app.state().textSize, 'larger', 'a garbage size in a backup is ignored');

    // Setup file (Settings → Export setup → app preferences).
    app.state().textSize = 'large';
    const bundle = app.fn('buildSetupBundle')('Test', { prefs: true });
    t.eq(bundle.sections.prefs.textSize, 'large', 'a setup file carries it');
    app.state().textSize = 'standard';
    app.fn('applySetupBundle')(bundle);
    t.eq(app.state().textSize, 'large', 'importing a setup sets it');

    t.includes(app.fn('diagnosticsText')(), 'text=large', 'the problem report says which size');
  });

  // 59f (release: V121) moved to 60f in V122 — the release lines follow the newest release.
};
