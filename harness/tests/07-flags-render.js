/* Standing test — flag polarity and render smoke
   (c) 2026 Peter Birchley. All rights reserved.

   MAP rule 9: default-ON flags read `!== false`; default-OFF flags read
   `=== true`. Copying the wrong neighbour silently switches a feature on for
   every existing user, which is invisible in review and obvious in the field. */

'use strict';

const fs = require('fs');
const path = require('path');
const t = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { freshApp, populated } = require('../fixture');

module.exports = function run() {

  t.group('07a — a fresh install gets the intended defaults', () => {
    // Empty localStorage: exactly what a new user has.
    const app = freshApp();
    const st = app.state();
    t.eq(st.hapticsEnabled, true,  'haptics default ON');
    t.eq(st.scannerEnabled, true,  'scanner default ON (the only default-ON storage flag)');
    t.eq(st.sqpEnabled,    false,  'Smart Quick Pick default OFF');
    t.eq(st.readingsEnabled, false, 'test readings default OFF');
    t.eq(st.timestampsEnabled, false, 'timestamps default OFF');
    t.eq(st.soundEnabled,  false,  'sound default OFF');
  });

  t.group('07b — an existing user is not opted in by an upgrade', () => {
    // The failure this catches: a user upgrading from an older version has no
    // key for a new flag, and a `!== false` read turns it on for everybody.
    const app = freshApp({ localStorage: { 'pat:engineer': 'Pete', 'pat:sessions': '[]' } });
    const st = app.state();
    t.eq(st.sqpEnabled, false, 'SQP stays off for an upgrading user');
    t.eq(st.readingsEnabled, false, 'readings stay off for an upgrading user');
    t.eq(st.soundEnabled, false, 'sound stays off for an upgrading user');
  });

  t.group('07c — the default-ON flags honour an explicit off', () => {
    const app = freshApp({ localStorage: { 'pat:haptics': '0', 'pat:scanner': '0' } });
    const st = app.state();
    t.eq(st.hapticsEnabled, false, 'haptics respect an explicit 0');
    t.eq(st.scannerEnabled, false, 'scanner respects an explicit 0');
  });

  t.group('07d — SCANNER_KEY is the only flag read as !== \'0\'', () => {
    // Stated in MAP rule 9. If a second flag adopts this shape the rule needs
    // rewriting, so surface it rather than let the map quietly go stale.
    const src = fs.readFileSync(path.join(APP_DIR, 'storage.js'), 'utf8');
    const hits = [...src.matchAll(/getItem\(([A-Z_]+)\)\s*!==\s*'0'/g)].map(m => m[1]);
    t.deepEq(hits, ['SCANNER_KEY'], `only SCANNER_KEY uses the !== '0' shape (found ${JSON.stringify(hits)})`);
  });

  t.group('07e — report settings polarity is preserved', () => {
    // showDuration and showPhotos are `=== true` on purpose while their
    // neighbours are `!== false`. A settings blob saved before those releases has
    // no such key, and flipping them on retrospectively changes every existing
    // user's certificates.
    const app = bootApp();
    const norm = app.fn('normaliseReportSettings');
    const fromOld = norm({});   // a pre-v61 blob
    t.eq(fromOld.showDuration, false, 'showDuration stays off for an old settings blob');
    t.eq(fromOld.showPhotos,   false, 'showPhotos stays off for an old settings blob');
    t.eq(fromOld.showEngineer, true,  'showEngineer stays on for an old settings blob');
    t.eq(fromOld.showCalibration, true, 'showCalibration stays on for an old settings blob');
    t.eq(norm({ showDuration: true }).showDuration, true, 'an explicit opt-in is honoured');
  });

  t.group('07f — garbage settings collapse to safe defaults', () => {
    const app = bootApp();
    const norm = app.fn('normaliseReportSettings');
    for (const junk of [null, undefined, 'nonsense', 42, [], { showEngineer: 'yes' }]) {
      t.doesNotThrow(() => norm(junk), `normaliseReportSettings survives ${JSON.stringify(junk) ?? 'undefined'}`);
      const out = norm(junk);
      t.eq(typeof out.showEngineer, 'boolean', 'flags come back as real booleans');
    }
  });

  t.group('07g — render() does not throw on any view', () => {
    // render() rebuilds #app.innerHTML wholesale and is synchronous (MAP rule 2).
    // A throw here is a blank screen on a phone, and the v16 entry-screen TDZ bug
    // is exactly this failure. Cheap, broad, and it has caught real bugs before.
    const app = populated();
    const views = app.val('SETTINGS_PAGE_META')
      ? Object.keys(app.val('SETTINGS_PAGE_META'))
      : [];
    const core = ['sessions', 'entry', 'session', 'settings', 'newSession'];
    for (const view of core.concat(views)) {
      t.doesNotThrow(() => { app.fn('setView')(view); app.fn('render')(); }, `render() survives view "${view}"`);
    }
  });

  t.group('07h — render() produces markup, not an empty shell', () => {
    // A render smoke test that passes on an empty string proves nothing.
    const app = populated();
    app.fn('setView')('sessions');
    app.fn('render')();
    const html = app.doc.getElementById('app').innerHTML;
    t.ok(html.length > 200, 'the sessions view painted something substantial');
    t.includes(html, 'data-action', 'the delegated-action wiring is present');
  });

  t.group('07i — a post-boot render throw is caught by the delegated handler (D4)', () => {
    // FIXED V69. The v16.1 net wraps the FIRST render at startup only; every
    // render after that happens inside an action dispatched from
    // handleDelegatedClick, which used to call the action bare.
    //
    // ⚠ THE ASSERTION HAS TO GO THROUGH THE HANDLER, not through render().
    // render() still throws — that is correct and unchanged, it is not its job
    // to catch its own bugs. What V69 added is the catch at the CALL SITE, so a
    // test that calls render() directly would go green on the old code too and
    // prove nothing. This is the same shape of mistake as V67's scanner tests,
    // which called the handler directly and missed a listener that was never
    // bound for three releases.
    const app = populated();
    app.fn('setView')('sessions');
    app.fn('render')();
    t.ok(app.doc.getElementById('app').innerHTML.length > 200, 'a healthy view painted first');

    // render() itself is still expected to propagate. Characterised, not fixed.
    app.run('var ORIGINAL_RENDER_SESSIONS = renderSessions;');
    app.run('renderSessions = function () { throw new Error("deliberate render failure"); };');
    let threwDirect = false;
    try { app.fn('render')(); } catch { threwDirect = true; }
    t.ok(threwDirect, 'render() itself still throws — the fix is at the call site, not here');

    // Now the real path: an action that throws, dispatched the way a tap does.
    app.run('renderSessions = ORIGINAL_RENDER_SESSIONS;');
    app.run('ACTIONS["harness-throw"] = function () { state.view = "overview"; throw new Error("deliberate action failure"); };');

    const el = app.doc.createElement('button');
    el.dataset.action = 'harness-throw';
    let escaped = false;
    try {
      app.fn('handleDelegatedClick')({ target: el });
    } catch { escaped = true; }

    t.notOk(escaped, 'the throw does NOT escape the delegated click handler');
    t.eq(app.state().view, 'sessions',
      'and state is recovered to the Sessions list, so state and screen agree again');
    t.ok(app.doc.getElementById('app').innerHTML.length > 200,
      'a usable screen is painted rather than leaving a dead one');
  });
};
