/* Standing test — V118: grey text that passes the contrast standard (S15 part 1)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked (13 Oct, Peter "1A 2A 3A 4C 5A 6A", then "A"):
   the accessibility pass in three releases, contrast first (1A 2A); both grey
   text colours pass 4.5:1 in both themes (3A); the PASS button is left as it is
   (4C); no What's new (5A); a test that measures the colours (6A — this file).
   The coloured words (green PASS text, red FAIL text, blue links) that also fall
   short are V119's, listed below as known defects so they stay visible (A).

   Everything is measured from the LIVE stylesheet: change a colour and these
   groups re-check it. WCAG 2 contrast, sRGB relative luminance.

     55a  the two dark blocks agree (phone setting / chosen in Settings).
     55b  both greys pass 4.5:1 on every text surface, in both themes.
     55c  the normal grey stays clearly stronger than the hint grey.
     55d  every other text colour passes on the page and the card — the known
          V119 shortfalls reported, not failed.
     55e  release: V118, no What's new, cache, changelog. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');

/* The token block that opens with `opener`, as { '--name': '#rrggbb' }. Only
   plain hex values — rgba() tokens are rings and shadows, never text. */
function block(css, opener) {
  const i = css.indexOf(opener);
  if (i < 0) return null;
  const body = css.slice(i + opener.length, css.indexOf('}', i));
  const out = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\s*;/g)) out[m[1]] = m[2].toLowerCase();
  return out;
}
function themes() {
  const css = read('styles.css');
  return {
    light:     block(css, ':root, .theme-force-light {'),
    darkMedia: block(css, ':root:not(.theme-force-light) {'),
    darkForce: block(css, '.theme-force-dark {'),
  };
}

function lum(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const ch = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function ratio(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const r2 = (n) => n.toFixed(2);

// Every background small text is drawn on (grey text sits on all of them:
// settings rows on cards, notes on --neutral-bg, hints inside tinted cards).
const SURFACES = ['--bg', '--card-bg', '--input-bg', '--neutral-bg', '--row-active',
                  '--quick-bg', '--accent-soft', '--fail-soft-bg', '--warn-soft-bg'];
const GREYS = ['--text-muted', '--text-hint'];
const AA = 4.5;

// Text colours other than the greys, checked on the page and the card.
const WORDS = ['--text', '--accent', '--accent-text', '--neutral-text', '--quick-text',
               '--pass', '--pass-shadow', '--fail', '--fail-soft-text', '--warn-soft-text'];
// V119's (Peter, V118 round "A"). Each entry reports under KNOWN DEFECTS and says
// "appears fixed" once it passes — then delete it here and it becomes a hard check.
const KNOWN_V119 = {
  'light --pass on --bg': 'green PASS words in lists',
  'light --pass on --card-bg': 'green PASS words in lists',
  'light --fail on --bg': 'red FAIL words on the page background',
  'dark --accent on --card-bg': 'blue links and words on cards',
  'dark --fail on --card-bg': 'red FAIL words on cards',
  'dark --pass-shadow on --card-bg': 'darker green words on cards',
};

module.exports = async function () {

  /* ------------------------------------------------------------------ 55a */
  await t.group('55a — the two dark blocks agree', () => {
    const th = themes();
    t.ok(th.light && th.darkMedia && th.darkForce, 'all three theme blocks found');
    if (!(th.light && th.darkMedia && th.darkForce)) return;
    t.ok(Object.keys(th.light).length >= 30, 'the light block reads as a token block (' + Object.keys(th.light).length + ' colours)');
    // Dark by phone setting and dark chosen in Settings must be the same theme:
    // a value fixed in one and not the other passes on one phone and fails on the next.
    const names = new Set([...Object.keys(th.darkMedia), ...Object.keys(th.darkForce)]);
    const differ = [...names].filter(n => th.darkMedia[n] !== th.darkForce[n]);
    t.deepEq(differ, [], 'every dark colour is the same in both dark blocks');
  });

  /* ------------------------------------------------------------------ 55b */
  await t.group('55b — both greys pass 4.5:1 on every text surface, both themes', () => {
    const th = themes();
    for (const [name, T] of [['light', th.light], ['dark', th.darkMedia], ['dark (chosen)', th.darkForce]]) {
      for (const g of GREYS) {
        for (const s of SURFACES) {
          t.ok(T[g] && T[s], `${name}: ${g} and ${s} defined`);
          if (!(T[g] && T[s])) continue;
          const r = ratio(T[g], T[s]);
          t.ok(r >= AA, `${name}: ${g} ${T[g]} on ${s} ${T[s]} = ${r2(r)}:1 (needs ${AA})`);
        }
      }
    }
  });

  /* ------------------------------------------------------------------ 55c */
  await t.group('55c — the normal grey stays clearly stronger than the hint grey', () => {
    // 3A said the hint grey moves closer to the normal one. Closer, not the same:
    // on every surface the normal grey must keep at least 1.2× the hint's contrast,
    // or the two stop meaning different things.
    const th = themes();
    for (const [name, T] of [['light', th.light], ['dark', th.darkMedia], ['dark (chosen)', th.darkForce]]) {
      const m = T['--text-muted'], h = T['--text-hint'];
      t.notEq(m, h, `${name}: the two greys are different colours`);
      for (const s of SURFACES) {
        const rm = ratio(m, T[s]), rh = ratio(h, T[s]);
        t.ok(rm >= rh * 1.2, `${name}: on ${s}, normal ${r2(rm)} vs hint ${r2(rh)}`);
      }
    }
  });

  /* ------------------------------------------------------------------ 55d */
  await t.group('55d — the other text colours pass on the page and the card', () => {
    const th = themes();
    const seen = new Set();
    for (const [name, T] of [['light', th.light], ['dark', th.darkMedia]]) {
      for (const w of WORDS) {
        for (const s of ['--bg', '--card-bg']) {
          const key = `${name} ${w} on ${s}`;
          if (!(T[w] && T[s])) { t.ok(false, `${key}: colour missing`); continue; }
          const r = ratio(T[w], T[s]);
          if (KNOWN_V119[key]) {
            seen.add(key);
            // known(condition) = "the defect is still there"; once V119 fixes a pair
            // it prints APPEARS FIXED instead.
            t.known(r < AA, `${key} = ${r2(r)}:1 (needs ${AA})`, 'V119 (Peter, V118 round A): ' + KNOWN_V119[key]);
          } else {
            t.ok(r >= AA, `${key}: ${T[w]} on ${T[s]} = ${r2(r)}:1 (needs ${AA})`);
          }
        }
      }
    }
    // A stale entry (renamed token, removed surface) would sit here forever unread.
    t.deepEq(Object.keys(KNOWN_V119).filter(k => !seen.has(k)), [], 'every known shortfall still names a real pair');
  });

  /* ------------------------------------------------------------------ 55e */
  await t.group('55e — release: V118, no What’s new, cache, changelog', () => {
    const app = freshApp();
    t.eq(app.run('APP_VERSION'), 'V118', 'APP_VERSION V118');
    // 5A: no welcome. The sheet stays V117's, so a phone that saw it sees nothing new.
    t.eq(app.run('WELCOME_VERSION'), 'V117', 'What’s new not rolled for V118 (5A)');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v118';", 'cache key pat-v118');
    const core = read('render-core.js');
    t.includes(core, '<li><strong>Report Settings is now two pages.</strong>', 'V117’s What’s new still in place');
    const help = read('render-help.js');
    const a = help.indexOf('<p><strong>V118</strong>'), b = help.indexOf('<p><strong>V117</strong>'), c = help.indexOf('<p><strong>V116</strong>');
    t.ok(a > -1 && b > a && c > b, 'About: V118, V117, V116');
    t.excludes(help, '<p><strong>V115</strong>', 'V115 rolled off');
    t.includes(help, 'Grey text is easier to read', 'About: V118’s line');
  });
};
