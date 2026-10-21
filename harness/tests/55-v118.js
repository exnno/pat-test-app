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
     55d  every other text colour passes on the page and the card.
     (55e, V118's release lines, moved on to 56e at V119. 55d's six known
      shortfalls were fixed by V119: words moved off the button colours onto
      --pass-word / --fail-word / --accent-word, measured by 56b.) */

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
// V119: --pass, --pass-shadow, --fail and --accent are no longer text colours —
// they are the buttons', icons' and borders' (4C, 3A). The words use the
// *-word shades, which 56b measures on all 9 surfaces; 56c keeps the words off
// the button colours.
const WORDS = ['--text', '--accent-text', '--neutral-text', '--quick-text',
               '--fail-soft-text', '--warn-soft-text'];

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
    for (const [name, T] of [['light', th.light], ['dark', th.darkMedia]]) {
      for (const w of WORDS) {
        for (const s of ['--bg', '--card-bg']) {
          const key = `${name} ${w} on ${s}`;
          if (!(T[w] && T[s])) { t.ok(false, `${key}: colour missing`); continue; }
          const r = ratio(T[w], T[s]);
          t.ok(r >= AA, `${key}: ${T[w]} on ${T[s]} = ${r2(r)}:1 (needs ${AA})`);
        }
      }
    }
  });

  // 55e (V118's release lines) moved on to 56e at V119.
};
