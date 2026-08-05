/* PATGo test harness — app loader
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   Loads the whole app into one vm context, in the real load order, on top of the
   stub layer. Everything a test needs comes back on the returned object. */

'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');
const { makeEnvironment } = require('./stubs');

const APP_DIR = path.resolve(__dirname, '..');

/* Load order is DERIVED FROM index.html, never hardcoded.
   A hardcoded list is a second source of truth that silently rots the moment a
   file is added — and "the harness tested the old load order" is exactly the
   kind of false green this harness exists to stop. */
function scriptOrderFromIndex() {
  const html = fs.readFileSync(path.join(APP_DIR, 'index.html'), 'utf8');
  const out = [];
  const re = /<script\s+src="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    if (!/^https?:/.test(m[1])) out.push(m[1]);
  }
  return out;
}

/* The .js entries listed in the service worker's ASSETS array. */
function swAssetScripts() {
  const sw = fs.readFileSync(path.join(APP_DIR, 'sw.js'), 'utf8');
  const start = sw.indexOf('ASSETS');
  const open  = sw.indexOf('[', start);
  const close = sw.indexOf('];', open);
  const block = sw.slice(open, close);
  return [...block.matchAll(/['"]\.?\/?([A-Za-z0-9._-]+\.js)['"]/g)].map(m => m[1]);
}

/* Read a version-ish constant out of a file without executing it. */
function readConst(file, name) {
  const src = fs.readFileSync(path.join(APP_DIR, file), 'utf8');
  const m = src.match(new RegExp(`${name}\\s*=\\s*['"]([^'"]+)['"]`));
  return m ? m[1] : null;
}

/* Bridge lexically-declared top-level bindings onto the context.
   TRAP, rediscovered every release before this file existed: top-level
   `const`/`let` (state, SESSION_KEY_MAP, uid, …) are block-scoped to the vm
   *program*, so they never become properties of the context — `ctx.state` is
   undefined even though the code works perfectly. Top-level `function`
   declarations DO attach, so those need no bridging.

   The lexical environment IS shared across runInContext calls in the same
   context, so a later runInContext can see them and copy them out. */
function bridgeNames(ctx, names) {
  const src = names
    .map(n => `try { window.__b.${n} = ${n}; } catch (e) {}`)
    .join('\n');
  vm.runInContext('window.__b = window.__b || {};\n' + src, ctx);
  return ctx.window.__b;
}

/* Names worth bridging by default. Add to this list rather than re-deriving it
   in a test file. Anything missing just comes back undefined — harmless. */
const DEFAULT_BRIDGE = [
  'state',
  'uid', 'todayISO',
  'SESSION_KEY_MAP', 'ITEM_KEY_MAP', 'SESSION_KEY_MAP_REV', 'ITEM_KEY_MAP_REV',
  'STORAGE_CODEC_VERSION',
  'APP_VERSION', 'WELCOME_VERSION', 'WELCOME_KEY',
  'SETTINGS_CATEGORIES', 'SETTINGS_PAGE_META',
  'GLOSSARY_GROUPS',
  'SCANNER_KEY',
];

/* Boot the app.

   opts.localStorage  seed object for localStorage
   opts.navigator     navigator overrides ({ canShare:false } etc)
   opts.skip          array of filenames NOT to load (for integrity-guard tests)
   opts.mutate        { file, from, to } — one-shot source substitution
   opts.runBoot       load boot.js (default true)
   opts.bridge        extra names to bridge out
*/
function bootApp(opts = {}) {
  const sandbox = makeEnvironment(opts);
  const ctx = vm.createContext(sandbox);

  // window must BE the sandbox, so `window.foo` and bare `foo` are one thing.
  // Preserve the browser-only members the stub layer put on the placeholder.
  const winStub = sandbox.window;
  for (const k of Object.keys(winStub)) {
    if (!(k in sandbox) || k === 'location') sandbox[k] = winStub[k];
  }
  sandbox.window = sandbox;
  for (const k of Object.keys(winStub)) {
    if (sandbox[k] === undefined) sandbox[k] = winStub[k];
  }

  // index.html provides exactly one element: #app. Everything else is created
  // by render(). Tests that need a specific id register it themselves.
  sandbox.document.register('app');

  const order  = scriptOrderFromIndex();
  const skip   = new Set(opts.skip || []);
  const loaded = [];
  const errors = [];

  for (const file of order) {
    if (skip.has(file)) continue;
    if (file === 'boot.js' && opts.runBoot === false) continue;

    let src = fs.readFileSync(path.join(APP_DIR, file), 'utf8');

    if (opts.mutate && opts.mutate.file === file) {
      if (!src.includes(opts.mutate.from)) {
        // A mutation that fails to apply scores as a PASS and silently proves
        // nothing. V66 shipped one of these. Never downgrade this to a warning.
        throw new Error(
          `harness: mutation anchor not found in ${file}: ${JSON.stringify(opts.mutate.from)}`
        );
      }
      src = src.replace(opts.mutate.from, opts.mutate.to);
    }

    try {
      vm.runInContext(src, ctx, { filename: file });
      loaded.push(file);
    } catch (e) {
      errors.push({ file, error: e });
      if (!opts.tolerateLoadErrors) throw new Error(`harness: ${file} threw at load — ${e.message}`);
    }
  }

  const bridged = bridgeNames(ctx, DEFAULT_BRIDGE.concat(opts.bridge || []));

  return {
    ctx,
    sandbox,
    loaded,
    errors,
    order,
    /* Top-level function declarations attach to the context directly. */
    fn(name) {
      const f = ctx[name];
      if (typeof f !== 'function') {
        throw new Error(`harness: no such function "${name}" — check the name, or it may live behind a lexical const`);
      }
      return f;
    },
    /* Lexical bindings come from the bridge. */
    val(name) { return bridged[name]; },
    /* Re-read a lexical binding after app code has mutated it (state is
       REASSIGNED by load(), so a value captured earlier goes stale). */
    refresh(names) { return bridgeNames(ctx, [].concat(names)); },
    run(code) { return vm.runInContext(code, ctx); },
    get storage() { return sandbox.localStorage; },
    get doc() { return sandbox.document; },
    get nav() { return sandbox.navigator; },
  };
}

module.exports = {
  APP_DIR,
  bootApp,
  scriptOrderFromIndex,
  swAssetScripts,
  readConst,
};
