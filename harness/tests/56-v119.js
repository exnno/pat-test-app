/* Standing test — V119: coloured words that pass the contrast standard (S15 part 2)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked (13 Oct, Peter "1A 2A 3A 4A 5A 6A 7A"):
   V119 is the coloured words only — screen reader V120, text size V121 (1A).
   Words get their own shades (--pass-word / --fail-word / --accent-word); the
   PASS / FAIL buttons, icons and borders keep PATGo's colours (2A, V118's 4C).
   Icons stay PATGo blue — they need 3:1 and pass (3A). Shades: the nearest that
   reaches 4.5:1 on every text surface (4A; in dark, in-between shades, as V118's
   greys). The three words set in the scripts and the two undefined var(--muted)
   lines are fixed too (5A). No What's new (6A). This file (7A).

   Everything is measured from the LIVE stylesheet. WCAG 2 contrast.

     56a  the word shades exist in all three theme blocks.
     56b  every word shade passes 4.5:1 on every text surface, both themes, and
          on the two tinted asset-history badges.
     56c  no word uses a button colour: every rule coloured --pass / --fail /
          --accent / --pass-shadow is an icon or large display text; the
          scripts' coloured words use the word shades; no var(--muted).
     56d  the buttons and icons keep PATGo's colours (4C, 3A).
     56e  release: V119, no What's new, cache, changelog. (Moved on to 58f
          at V120, as 55e moved on to 56e.) */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');

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
const THEMES = (th) => [['light', th.light], ['dark', th.darkMedia], ['dark (chosen)', th.darkForce]];

function rgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
function lum(hex) {
  const ch = rgb(hex).map(c => c / 255)
    .map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function ratio(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
// A see-through tint laid over a solid colour, as the screen draws it.
function over(r, g, b, a, hex) {
  const base = rgb(hex);
  return '#' + [r, g, b].map((c, i) => Math.round(c * a + base[i] * (1 - a)).toString(16).padStart(2, '0')).join('');
}
const r2 = (n) => n.toFixed(2);

const SURFACES = ['--bg', '--card-bg', '--input-bg', '--neutral-bg', '--row-active',
                  '--quick-bg', '--accent-soft', '--fail-soft-bg', '--warn-soft-bg'];
const WORD_SHADES = ['--pass-word', '--fail-word', '--accent-word'];
const AA = 4.5;

// The rules that may keep a brand colour as their text colour: icons (3:1, 3A)
// and large display text (26px+ heavy — 3:1 for large text). Anything else
// coloured --pass / --fail / --accent / --pass-shadow is a word on a button
// colour: the V118 shortfall coming back.
const BRAND_KEPT = {
  '.preset-switch-tick': 'accent',   // the tick icon on the active preset
  '.del-icon-top':       'fail',     // the bin icon on the entry screen
  '.settings-row-icon':  'accent',   // Settings list icons (13A)
  '.wizard-icon':        'accent',   // setup wizard icons
  '.bug-option-dot':     'accent',   // ● / ○ radio dot
  '.party-100':          'accent',   // the big 100 (44px, decorative)
  '.egg-sticker':        'pass',     // Easter-egg PASS sticker (26px heavy)
  '.egg-cert-big':       'accent',   // Easter-egg big number (40px heavy)
};

// Every rule as { sel, body } — selector is the last line before the brace.
function rules(css) {
  const out = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ sel: m[1].trim().split('\n').pop().trim(), body: m[2] });
  }
  return out;
}
const BRAND_TEXT = /(?<![-\w])color:\s*var\(--(pass|fail|accent|pass-shadow)\)/;

module.exports = async function () {

  /* ------------------------------------------------------------------ 56a */
  await t.group('56a — the word shades exist in all three theme blocks', () => {
    const th = themes();
    for (const [name, T] of THEMES(th)) {
      t.ok(!!T, `${name}: theme block found`);
      if (!T) continue;
      for (const w of WORD_SHADES) t.ok(!!T[w], `${name}: ${w} defined`);
    }
  });

  /* ------------------------------------------------------------------ 56b */
  await t.group('56b — every word shade passes 4.5:1 on every text surface, both themes', () => {
    const th = themes();
    for (const [name, T] of THEMES(th)) {
      if (!T) continue;
      for (const w of WORD_SHADES) {
        for (const s of SURFACES) {
          if (!(T[w] && T[s])) { t.ok(false, `${name}: ${w} on ${s} — colour missing`); continue; }
          const r = ratio(T[w], T[s]);
          t.ok(r >= AA, `${name}: ${w} ${T[w]} on ${s} ${T[s]} = ${r2(r)}:1 (needs ${AA})`);
        }
      }
    }
    // The asset-history PASS / FAIL badges sit on a see-through tint over the card.
    // Read the tint from the live rule, lay it over each theme's card, measure.
    const css = read('styles.css');
    for (const [kind, word] of [['pass', '--pass-word'], ['fail', '--fail-word']]) {
      const rule = rules(css).find(r => r.sel === `.asset-history-result.${kind}`);
      t.ok(!!rule, `.asset-history-result.${kind} rule found`);
      if (!rule) continue;
      t.ok(rule.body.includes(`color: var(${word})`), `.asset-history-result.${kind} uses ${word}`);
      const m = rule.body.match(/background:\s*rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/);
      t.ok(!!m, `.asset-history-result.${kind} tint read`);
      if (!m) continue;
      for (const [name, T] of THEMES(th)) {
        if (!(T && T[word] && T['--card-bg'])) continue;
        const tint = over(+m[1], +m[2], +m[3], +m[4], T['--card-bg']);
        const r = ratio(T[word], tint);
        t.ok(r >= AA, `${name}: ${word} on the ${kind} badge tint ${tint} = ${r2(r)}:1 (needs ${AA})`);
      }
    }
  });

  /* ------------------------------------------------------------------ 56c */
  await t.group('56c — no word uses a button colour', () => {
    const css = read('styles.css');
    const offenders = rules(css).filter(r => BRAND_TEXT.test(r.body) && !BRAND_KEPT[r.sel]).map(r => r.sel);
    t.deepEq(offenders, [], 'every rule coloured with a button colour is an icon or large display text');
    // Spot checks: the words the V118 shortfalls named.
    // A selector can have several rules (layout in one, colour in another): read them all.
    const body = (sel) => rules(css).filter(r => r.sel === sel).map(r => r.body).join('\n');
    t.includes(body('.pass-text'), 'color: var(--pass-word)', '.pass-text: green PASS words');
    t.includes(body('.fail-text'), 'color: var(--fail-word)', '.fail-text: red FAIL words');
    t.includes(body('.td-result.pass'), 'color: var(--pass-word)', '.td-result.pass: PASS in lists');
    t.includes(body('.btn-tertiary'), 'color: var(--accent-word)', '.btn-tertiary: blue words on cards');
    // .tour-ov-pass retired V134 (7A): the picture tour's styles went with it.
    // 5A: the three words written into the scripts.
    t.includes(read('feedback.js'), 'id="name-sheet-delete" style="margin-top:10px;color:var(--fail-word)"', 'name sheet Delete: red word shade');
    const rv = read('render-review.js');
    t.includes(rv, 'style="margin-top:6px;color:var(--pass-word)">${icon(\'check\')} Marked as rebooked', 'Marked as rebooked: green word shade');
    t.includes(rv, 'style="margin-top:6px;color:var(--text-muted)">Marked as declined', 'Marked as declined: grey, not undefined');
    t.includes(read('render-settings.js'), '<strong style="color:var(--pass-word)">${icon(\'check\')} Protected.', 'Protected.: green word shade');
    // var(--muted) was never defined: those lines fell back to full text colour.
    const app = fs.readdirSync(APP_DIR).filter(f => /\.(js|css)$/.test(f) && !/pdf|jspdf|autotable/i.test(f));
    t.deepEq(app.filter(f => read(f).includes('var(--muted)')), [], 'no file uses the undefined var(--muted)');
  });

  /* ------------------------------------------------------------------ 56d */
  await t.group('56d — buttons and icons keep PATGo’s colours (4C, 3A)', () => {
    const th = themes();
    const BRAND = {
      light: { '--pass': '#16a34a', '--fail': '#dc2626', '--accent': '#2563eb' },
      dark:  { '--pass': '#22c55e', '--fail': '#ef4444', '--accent': '#3b82f6' },
    };
    for (const [name, T] of THEMES(th)) {
      if (!T) continue;
      const want = BRAND[name === 'light' ? 'light' : 'dark'];
      for (const k of Object.keys(want)) t.eq(T[k], want[k], `${name}: ${k} still ${want[k]}`);
    }
    const css = read('styles.css');
    // A selector can have several rules (layout in one, colour in another): read them all.
    const body = (sel) => rules(css).filter(r => r.sel === sel).map(r => r.body).join('\n');
    t.includes(body('.pass-btn'), 'background: var(--pass);', 'PASS button: PATGo green (4C)');
    t.includes(body('.fail-btn'), 'background: var(--fail);', 'FAIL button: PATGo red');
    for (const [sel, c] of Object.entries(BRAND_KEPT)) {
      t.ok(BRAND_TEXT.test(body(sel)) && body(sel).includes(`color: var(--${c})`), `${sel} keeps --${c} (icon / large text)`);
    }
  });

  // 56e (V119's release lines) moved on to 58f at V120.
};
