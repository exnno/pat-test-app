/* Standing test — build integrity (static source checks, no execution)
   (c) 2026 Peter Birchley. All rights reserved.

   These replace the ad-hoc grep steps that used to be run by hand every release:
   node --check, the duplicate-declaration scan, and the load-order verification. */

'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');
const t = require('../assert');
const { APP_DIR, scriptOrderFromIndex, swAssetScripts, readConst } = require('../load');

module.exports = function run() {
  const order = scriptOrderFromIndex();
  const sw    = swAssetScripts();

  t.group('01a — every script parses (node --check equivalent)', () => {
    for (const f of order.concat(['sw.js'])) {
      const src = fs.readFileSync(path.join(APP_DIR, f), 'utf8');
      t.doesNotThrow(() => new vm.Script(src, { filename: f }), `${f} parses`);
    }
  });

  t.group('01b — load order', () => {
    t.eq(order[order.length - 1], 'boot.js', 'boot.js is last in index.html');
    t.eq(new Set(order).size, order.length, 'no duplicate <script> tags');
    t.ok(order.indexOf('config.js') === 0, 'config.js is first (state.js seeds from its factories)');
    t.ok(order.indexOf('state.js') < order.indexOf('storage.js'), 'state.js precedes storage.js');
  });

  t.group('01c — sw.js ASSETS matches index.html', () => {
    // ASSETS carries the 24 first-party scripts PLUS the lazily-injected jsPDF
    // pair, which are precached but are not <script> tags. PDF.js is vendored
    // but deliberately NOT precached.
    const missing = order.filter(f => !sw.includes(f));
    t.deepEq(missing, [], 'every index.html script is precached by sw.js');
    const extra = sw.filter(f => !order.includes(f));
    t.ok(extra.every(f => /jspdf/i.test(f)),
      `sw-only entries are jsPDF lazies only (got ${JSON.stringify(extra)})`);
    t.eq(sw.length, order.length + extra.length, 'no duplicate ASSETS entries');
  });

  t.group('01d — version constants agree', () => {
    const app = readConst('config.js', 'APP_VERSION');
    const cache = readConst('sw.js', 'CACHE_VERSION');
    const welcome = readConst('config.js', 'WELCOME_VERSION');
    t.ok(/^V\d+(\.\d+)?$/.test(app), `APP_VERSION looks like a version (${app})`);
    t.ok(cache && cache.startsWith('pat-'), `CACHE_VERSION is namespaced (${cache})`);
    // The cache key must move with the app version, or a shipped build keeps
    // serving from cache. Hotfixes append -1/-2 to the same base.
    const base = 'pat-' + String(app).toLowerCase();
    t.ok(cache === base || cache.startsWith(base + '-'),
      `CACHE_VERSION ${cache} matches APP_VERSION ${app}`);
    t.ok(/^V\d+/.test(welcome), `WELCOME_VERSION looks like a version (${welcome})`);
  });

  t.group('01e — no duplicate top-level const/let across files', () => {
    // MAP rule 1. A duplicate top-level `const` of the same name in two loaded
    // files is a fatal SyntaxError that kills a whole file — this caused real
    // user data loss during the V21 refactor.
    const seen = new Map();
    const dupes = [];
    for (const f of order) {
      const src = fs.readFileSync(path.join(APP_DIR, f), 'utf8');
      for (const m of src.matchAll(/^(?:const|let)\s+([A-Za-z_$][\w$]*)/gm)) {
        const name = m[1];
        if (seen.has(name) && seen.get(name) !== f) dupes.push(`${name} (${seen.get(name)} + ${f})`);
        else seen.set(name, f);
      }
    }
    t.deepEq(dupes, [], 'no duplicate top-level lexical declarations');
  });

  t.group('01f — duplicate top-level function names (legal but silent)', () => {
    // Duplicate top-level `function` declarations are legal JS and silent —
    // last loaded wins. Nothing in the app catches this; the boot guard does not.
    // It is reported rather than asserted-zero because a deliberate override is
    // conceivable, but any hit needs a human decision.
    const seen = new Map();
    const dupes = [];
    for (const f of order) {
      const src = fs.readFileSync(path.join(APP_DIR, f), 'utf8');
      for (const m of src.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) {
        const name = m[1];
        if (seen.has(name) && seen.get(name) !== f) dupes.push(`${name} (${seen.get(name)} then ${f})`);
        else seen.set(name, f);
      }
    }
    t.deepEq(dupes, [], 'no shadowed function declarations across files');
  });

  t.group('01g — copyright headers intact', () => {
    for (const f of order.concat(['sw.js'])) {
      const head = fs.readFileSync(path.join(APP_DIR, f), 'utf8').slice(0, 1200);
      t.includes(head, 'Peter Birchley', `${f} carries the copyright line`);
    }
  });

  t.group('01h — banned native dialogs absent from source', () => {
    // MAP rule 11: prompt()/confirm()/alert() are unreliable in iOS PWAs.
    // boot.js is exempt — its crash screens run when nothing else has parsed.
    for (const f of order) {
      if (f === 'boot.js') continue;
      const src = fs.readFileSync(path.join(APP_DIR, f), 'utf8')
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      t.notOk(/(?<![.\w])(alert|confirm|prompt)\s*\(/.test(src), `${f} calls no native dialog`);
    }
  });
};
