/* Standing test — V110: the sheet guard (spec 5A, 6A, 6A key, 7A) + release
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS GUARDS. Every bottom sheet (.bulk-sheet / .fail-sheet) is a flex
   column capped at 85dvh — less with the keyboard up — with `overflow: hidden`.
   Anything that grows past the cap is clipped, and what gets clipped is the
   button at the bottom. So each sheet either marks its growing part
   `.sheet-scroll`, or is named in harness/sheet-register.js with the reason
   nothing in it grows. A NEW sheet with neither fails 47b until someone decides.
   That is the half 12d cannot see: 12d inspects CSS rules, and a sheet whose
   growing body was never marked has no rule to inspect.

   harness/sheets.js finds the sheets. 47a checks the finder itself, because a
   finder that misses sheets makes 47b green while proving nothing — the hollow
   shape this harness exists to stop. It checks the scanner keeps its place in
   every file, that each finding shape is counted independently, and that a
   sheet assembled from pieces is the only sheet in its function (otherwise its
   scroller could be credited to the wrong sheet).

   ⚠ WHAT THIS FILE CANNOT PROVE. Whether a register REASON is true. "One input
   and a button" is a person's reading of the markup; the guard only makes sure
   someone has read it. And "has a .sheet-scroll" is not "scrolls well": 12a–12d
   and the phone checklist cover how a scroller behaves. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, withSession, withItem } = require('../fixture');
const S = require('../sheets');
const REGISTER = require('../sheet-register');

module.exports = async function () {
  const all = S.parsedApp();
  const sheets = S.allSheets();
  const byKey = Object.fromEntries(sheets.map(s => [s.key, s]));

  await t.group('47a — the sheet finder: scanner balanced, every shape counted, no shared extents', () => {
    for (const P of all) {
      t.ok(P.sc.finalDepth === 0 && P.sc.open === 0,
        `${P.file}: the scanner ends at depth 0 with no template open (depth ${P.sc.finalDepth}, open ${P.sc.open})`);
    }
    // Independent counts: plain regexes over the comment-free code, so a finder
    // that stops looking for one shape (or one class) comes up short here.
    let markup = 0, element = 0, opener = 0;
    for (const P of all) {
      // Its own class test — not sheets.js's isRoot, or a finder that stopped
      // matching fail-sheet would agree with itself here.
      for (const m of P.code.matchAll(/<div\b[^>]*\bclass="([^"]*)"/g)) if (m[1].split(/\s+/).some(c => c === 'bulk-sheet' || c === 'fail-sheet')) markup++;
      element += (P.code.match(/\.className\s*=\s*['"](?:bulk-sheet|fail-sheet)['"]/g) || []).length;
      opener += (P.code.match(/\b_openSheet\(/g) || []).length;
    }
    element -= 1;  // _openSheet's own className line (feedback.js) — the helper, not a sheet
    opener -= 1;   // `function _openSheet(` itself
    const count = sh => sheets.filter(s => s.shape === sh).length;
    t.eq(count('markup'), markup, `markup sheets: the finder has ${count('markup')}, a plain count ${markup}`);
    t.eq(count('element'), element, `createElement sheets: the finder has ${count('element')}, a plain count ${element}`);
    t.eq(count('opener'), opener, `_openSheet callers: the finder has ${count('opener')}, a plain count ${opener}`);
    t.ok(count('markup') >= 30 && count('element') >= 1 && count('opener') >= 6,
      `all three shapes are present (markup ${count('markup')}, element ${count('element')}, opener ${count('opener')})`);
    t.eq(new Set(sheets.map(s => s.key)).size, sheets.length, 'every sheet has its own key');
    const pieces = sheets.filter(s => s.pieces);
    for (const s of pieces) {
      const others = sheets.filter(o => o !== s && o.file === s.file && o.fnName === s.fnName);
      t.deepEq(others.map(o => o.key), [], `${s.key}: built across its function, and the only sheet in ${s.fnName}()`);
    }
    t.ok(pieces.some(s => s.shape === 'markup'), 'a markup sheet assembled from pieces is found (the move sheets)');
  });

  await t.group('47b — every sheet scrolls its growing part, or is in the register', () => {
    const missing = sheets.filter(s => !s.scrolls && !(s.key in REGISTER)).map(s => `${s.key} (line ${s.line})`);
    t.deepEq(missing, [],
      'no .sheet-scroll and not in harness/sheet-register.js — mark the part that grows, or register it with a reason');
    t.ok(sheets.filter(s => s.scrolls).length >= 20, `${sheets.filter(s => s.scrolls).length} sheets carry a scroller`);
  });

  await t.group('47c — the register describes the app as it is (7A)', () => {
    const gone = Object.keys(REGISTER).filter(k => !(k in byKey));
    t.deepEq(gone, [], 'every register entry names a sheet that exists (a renamed label or function shows here AND in 47b)');
    const scrolling = Object.keys(REGISTER).filter(k => byKey[k] && byKey[k].scrolls);
    t.deepEq(scrolling, [], 'no register entry is for a sheet that already has a scroller — take it off the list');
  });

  await t.group('47d — every register reason says something', () => {
    for (const [k, why] of Object.entries(REGISTER)) {
      t.ok(typeof why === 'string' && why.trim().length >= 15 && !/\b(todo|tbc|fixme)\b/i.test(why),
        `${k}: a reason, not a placeholder`);
    }
  });

  await t.group('47e — V110 6A: Log again scrolls its notes preview; the controls under it are pinned', async () => {
    const app = freshApp();
    withSession(app);
    withItem(app, { result: 'fail', notes: 'ZZNOTE ' + 'a long engineer note '.repeat(60) });
    app.state().repeatSheetOpen = true;
    app.fn('render')();
    const html = app.doc.getElementById('app').innerHTML;
    t.includes(html, 'aria-label="Log again"', 'the Log again sheet is on screen');
    t.includes(html, '<p class="repeat-preview-notes sheet-scroll">Notes copied too: “ZZNOTE', 'the notes preview is the scroller');
    t.includes(html, '<div class="repeat-count-grid sheet-pin">', 'the +N buttons are pinned');
    t.includes(html, '<label class="label sheet-pin" for="repeat-custom">', 'the number label is pinned');
    t.includes(html, '<div class="repeat-custom-row sheet-pin">', 'the number box and Add are pinned');
    t.ok(byKey['render-core.js · Log again'] && byKey['render-core.js · Log again'].scrolls,
      'and the finder sees it (it left the register)');
  });

  await t.group('47f — release: V110, cache, welcome copy, changelog', () => {
    const app = freshApp();
    t.eq(app.run('APP_VERSION'), 'V110', 'APP_VERSION V110');
    t.eq(app.run('WELCOME_VERSION'), 'V110', 'welcome rolled');
    const sw = fs.readFileSync(path.join(APP_DIR, 'sw.js'), 'utf8');
    t.includes(sw, "const CACHE_VERSION = 'pat-v110';", 'cache key pat-v110');
    const core = fs.readFileSync(path.join(APP_DIR, 'render-core.js'), 'utf8');
    t.includes(core, '<strong>Long notes in Log again.</strong>', 'the welcome copy is this release’s');
    const help = fs.readFileSync(path.join(APP_DIR, 'render-help.js'), 'utf8');
    const a = help.indexOf('<p><strong>V110</strong>'), b = help.indexOf('<p><strong>V109</strong>'), c = help.indexOf('<p><strong>V108</strong>');
    t.ok(a > -1 && b > a && c > b, 'About: V110, V109, V108');
    t.excludes(help, '<p><strong>V107</strong>', 'V107 rolled off');
  });
};
