/* Standing test — the boot integrity guard
   (c) 2026 Peter Birchley. All rights reserved.

   This is the guard that stands between a partial deploy and data loss: it
   refuses to run load()/save() on a half-loaded build. A test that only proves
   it returns true on a healthy build proves almost nothing — the whole value is
   in it returning FALSE when a file is missing. Both directions are asserted. */

'use strict';

const t = require('../assert');
const { bootApp } = require('../load');

module.exports = function run() {
  t.group('02a — guard passes on a healthy build', () => {
    const app = bootApp();
    t.eq(app.loaded.length, app.order.length, 'all scripts loaded');
    t.eq(app.fn('bootIntegrityOK')(), true, 'bootIntegrityOK() is true');
  });

  t.group('02b — guard fails when a required function file is missing', () => {
    // Each of these files owns at least one name on the guard's required list.
    // Dropping the file is exactly the partial-deploy scenario.
    const cases = [
      ['storage.js',  'load/save'],
      ['render-core.js', 'render'],
      ['dispatch.js', 'initDelegation'],
      ['clients.js',  'loadClients/composeSiteSnapshot'],
      ['multipick.js', 'loadMultiPickConfig'],
    ];
    for (const [file, owns] of cases) {
      const app = bootApp({ skip: [file], tolerateLoadErrors: true });
      let result;
      try { result = app.fn('bootIntegrityOK')(); } catch { result = 'threw'; }
      t.eq(result, false, `missing ${file} (${owns}) → guard returns false`);
    }
  });

  t.group('02c — ⚠ config.js missing: the guard THROWS instead of returning false', () => {
    // FOUND BY THIS HARNESS ON ITS FIRST RUN. A real, reachable white screen.
    //
    // Chain: config.js missing or stale (partial deploy) → state.js throws while
    // evaluating `let state = {…}` because DEFAULT_ITEM_TYPES is undefined → the
    // `state` binding is left permanently in the TEMPORAL DEAD ZONE.
    //
    // bootIntegrityOK() then reaches `typeof state === 'undefined'` — a line
    // written specifically to be safe — and THROWS. `typeof` is safe on an
    // UNDECLARED identifier, but `state` is not undeclared here; it is declared
    // and uninitialised, and typeof on a TDZ binding throws ReferenceError.
    // The comment in boot.js asserts the opposite, which is why this survived.
    //
    // Because `if (!bootIntegrityOK())` at boot.js:155 is not wrapped, the throw
    // escapes, boot.js dies, and the "Update needed" recovery screen — the whole
    // point of the guard — never paints. Blank white screen, no message, no
    // crash-report link. Exactly the V61 failure class, through a different door.
    //
    // FIXED IN V68. The guard CALL is now wrapped and a throw is treated as a
    // failed check, so the recovery screen paints either way. The two halves are
    // asserted separately on purpose: the function may still throw (that is a
    // language fact about TDZ, not something boot.js can prevent) — what must
    // never happen again is that throw escaping to the top level.
    const app = bootApp({ skip: ['config.js'], tolerateLoadErrors: true });
    let result;
    try { result = app.fn('bootIntegrityOK')(); } catch { result = 'threw'; }
    t.notEq(result, true, 'missing config.js is never reported as a healthy build');

    // THE ONE THAT MATTERS: the source must not call the guard bare. Asserted
    // against the source rather than by running boot, because the headless
    // harness cannot reproduce a real top-level script abort — a runtime-only
    // check here would be one of the documented false-confidence shapes.
    const fs = require('fs');
    const path = require('path');
    const { APP_DIR } = require('../load');
    const bootSrc = fs.readFileSync(path.join(APP_DIR, 'boot.js'), 'utf8');
    t.excludes(bootSrc, 'if (!bootIntegrityOK())',
      'the guard is not called bare in an if — a throw would escape (D1)');
    t.ok(/try\s*\{[^}]*bootIntegrityOK\(\)/.test(bootSrc),
      'the guard call sits inside a try block');

    const appEl = app.doc.getElementById('app');
    const recovered = String((appEl && appEl.innerHTML) || '');

    // THE BEHAVIOURAL HALF, and the one that actually earns its keep. The two
    // source checks above BOTH stay true if the catch branch sets the flag to
    // TRUE instead of false — a mutation proved exactly that (M35 survived the
    // first version of this group, which is the "right result via the wrong
    // mechanism" shape from the harness README). What cannot be faked is the
    // outcome: with config.js missing, the recovery screen must be on the page.
    t.includes(recovered, 'Update needed', 'the recovery screen actually paints');
    t.includes(recovered, 'location.reload()', 'with a working Reload button');
    t.includes(recovered, 'mailto:', 'and a route to report it');

    // ⚠ AND IT MUST BE THE *GUARD'S* SCREEN, NOT THE LOAD-FAILURE ONE. This is
    // the assertion that catches M35, and the distinction is subtle enough to
    // be worth spelling out: if a throw were treated as a PASSED check, boot
    // would fall through to load(), load() would throw, and the v61.2 net would
    // paint its own near-identical "Update needed" screen. Same title, same
    // button, same mailto — all three assertions above would still pass while
    // the guard was doing the opposite of its job.
    //
    // The two screens differ in one place only: their explanatory sentence.
    // "didn't load completely" is the guard's; "didn't finish updating" is the
    // load-failure net's. Asserting the guard's wording proves boot STOPPED at
    // the guard rather than being rescued downstream by a different mechanism.
    // If this copy is ever reworded, update it here — do not delete it.
    t.includes(recovered, "load completely",
      'and it is the integrity guard that stopped boot, not the load() net downstream');

    // This half is a HARD assertion and must never be softened: whatever the
    // guard does internally, a partial build must not reach the app.
    t.notOk(/data-action|sessions-list-area/.test(recovered),
      'a partial build never paints a usable app');
  });

  t.group('02d — the guard names WELCOME_KEY, not a version-specific constant', () => {
    // V61 white screen: the guard checked a version-named constant and had to be
    // rolled every release. If it is ever re-versioned, this fails.
    const fs = require('fs');
    const path = require('path');
    const { APP_DIR } = require('../load');
    const src = fs.readFileSync(path.join(APP_DIR, 'boot.js'), 'utf8');
    t.includes(src, "typeof WELCOME_KEY === 'undefined'", 'guard probes WELCOME_KEY');
    t.notOk(/typeof\s+V\d+_WELCOME/.test(src), 'guard contains no version-named welcome constant');
  });

  t.group('02e — WELCOME_KEY is derived, never hand-written', () => {
    // MAP rule 8: rolling a welcome = change WELCOME_VERSION + write the copy.
    // Nothing else, ever. That only holds while the key is derived.
    const fs = require('fs');
    const path = require('path');
    const { APP_DIR } = require('../load');
    const src = fs.readFileSync(path.join(APP_DIR, 'config.js'), 'utf8');
    t.ok(/const WELCOME_KEY\s*=\s*'pat:'\s*\+\s*WELCOME_VERSION/.test(src),
      'WELCOME_KEY is derived from WELCOME_VERSION');

    const app = bootApp();
    const key = app.val('WELCOME_KEY');
    const ver = app.val('WELCOME_VERSION');
    t.eq(key, 'pat:' + String(ver).toLowerCase() + 'welcome', `key derives correctly (${key})`);
  });
};
