/* Standing test — module split integrity (added V70)
   (c) 2026 Peter Birchley. All rights reserved.

   V70 moved 807 lines out of session.js into settings-actions.js and
   onboarding.js. The mechanical hazards of an extraction are already covered
   elsewhere: 01a proves every file parses, 01b/01c prove index.html and sw.js
   ASSETS agree, 01e catches a duplicated const and 01f a shadowed function.

   What NONE of those catch is the extraction going MISSING. A function deleted
   from session.js and never pasted into the new file leaves a build where every
   file parses, the load order is intact, nothing is duplicated — and the button
   that calls it throws ReferenceError on tap. That is the failure this file is
   for, and it is written to hold for the render-core/render-settings and
   config.js splits still to come, not just for V70.

   V71 extended it for the config.js -> data.js split. That extraction has a
   hazard V70's did not: data.js declares NO FUNCTIONS, so every generic guard
   in this file that works by looking a function up is structurally blind to it.
   Its assertions therefore go through constants, through load POSITION (which
   is load-bearing here, not cosmetic), and through the one observable proof
   that the ordering actually works — state.js seeding itself from the moved
   tables at load time.

   V72 extended it for the render-core.js -> render-review.js split. Its hazard
   is different again from both: the moved screens are reached through render(),
   NOT through the delegated ACTIONS table, so 09d — the generic guard that has
   covered every extraction so far — is structurally blind to losing any of them.
   A lost renderOverview leaves a build where every file parses, every action
   resolves, the boot guard passes, and opening a session's Overview throws on a
   phone. The V72 assertions therefore drive render() itself for each moved view
   rather than looking the functions up, per the listener-wiring rule: go through
   the surface the app actually uses. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t = require('../assert');
const { APP_DIR, bootApp, scriptOrderFromIndex, swAssetScripts } = require('../load');
const { populated } = require('../fixture');

/* The V70 extraction manifest. Every name here was defined in session.js in
   V69 and must still be reachable after a full load. Names, not line counts —
   a later release is free to move any of these again, and this list keeps
   working as long as they remain defined SOMEWHERE in the load chain. */
const MOVED_TO_SETTINGS_ACTIONS = [
  'saveUserSettings', 'captureReportTextInputs', 'saveReportSettingsForm',
  'handleReportLogoFile', 'storeSignatureFromSource', 'handleReportSignatureFile',
  'removeReportSignature', 'setSignaturePosition', 'openSignaturePad',
  'closeSignaturePad', 'saveDrawnSignature', 'saveCsvColumnsSettings',
  'resetCsvColumnsSettings', 'moveCsvColumn', 'saveSessionNotes',
  'setSessionCertNo', 'applyReportTemplate', 'saveCurrentAsTemplate',
  'renameReportTemplate', 'deleteReportTemplate', 'toggleSetupIncludeOpen',
  'setSetupInclude', 'insertReportFilenameToken', 'startShareSetup',
  'saveItemTypesSettings', 'saveFailReasonsSettings', 'saveDescriptionsSettings',
  'resetItemsToDefaults', 'resetFailReasonsToDefaults', 'resetDescriptionsToDefaults',
  'setTheme', 'setHaptics', 'setSound', 'setTimestamps',
];

const MOVED_TO_ONBOARDING = [
  'captureWizardStep', 'finishOnboarding', 'skipOnboarding', 'wizardChoosePath',
  'wizardNextStep', 'wizardBack', 'wizardToggleDemo', 'wizardPickTheme',
  'wizardFinishFresh', 'onboardSetupImport', 'restartOnboarding', 'seedDemoSession',
];

const MOVED_TO_RENDER_CORE = ['dismissWelcome'];

/* The V72 extraction manifest: every function that left render-core.js for
   render-review.js. Paired with the render() view that reaches it, where there
   is one — the view is what makes the assertion go through render() rather than
   through a lookup. `view: null` marks the two shared photo-markup helpers,
   which no view reaches directly: renderEntry() (still in render-core.js) and
   renderOverview() (now here) each emit one of them, so they are checked by
   declaration site and through the entry render instead. */
const MOVED_TO_RENDER_REVIEW = [
  { name: 'computeVisibleOverviewItems',  view: null,              marker: null                 },
  { name: 'renderOverviewBodyHTML',       view: null,              marker: null                 },
  { name: 'renderOverview',               view: 'overview',        marker: 'id="edit-session-btn"' },
  { name: 'refreshOverviewBody',          view: null,              marker: null                 },
  { name: 'refreshOverviewSelection',     view: null,              marker: null                 },
  { name: 'renderEditSession',            view: 'editSession',     marker: 'data-action="edit-save"' },
  { name: 'renderRetestReminders',        view: 'retestReminders', marker: 'id="retest-back-btn"' },
  { name: 'renderReports',                view: 'reports',         marker: 'id="reports-back-btn"' },
  { name: 'renderFailPhotoStripInner',    view: null,              marker: null                 },
  { name: 'renderPhotoStripSheet',        view: null,              marker: null                 },
];

/* The V71 extraction manifest: every top-level const that left config.js for
   data.js. Paired with a sample value where an empty-but-present binding would
   otherwise pass — a name existing proves the const survived, it does NOT prove
   the table came with it. `sample` is a member that must still be in the list,
   `size` a floor on its length. */
const MOVED_TO_DATA = [
  { name: 'DEFAULT_ITEM_TYPES',        sample: 'Extension',            size: 9  },
  { name: 'DEFAULT_FAIL_REASONS',      sample: 'Damaged Plug',         size: 6  },
  { name: 'DEFAULT_DESCRIPTIONS',      sample: 'Kettle',               size: 40 },
  { name: 'DEFAULT_CSV_COLUMNS',       sample: null,                   size: 10 },
  { name: 'CALC_LENGTHS',              sample: 0.25,                   size: 20 },
  { name: 'READING_CLASSES',           sample: 'II',                   size: 3  },
  { name: 'READING_FAIL_TAGS',         sample: 'insulation',           size: 4  },
  { name: 'SETTINGS_CATEGORIES',       sample: null,                   size: 6  },
  { name: 'SETUP_SECTIONS',            sample: null,                   size: 5  },
  { name: 'BUG_REPORT_TYPES',          sample: null,                   size: 3  },
  { name: 'BUG_REPORT_SEVERITIES',     sample: null,                   size: 3  },
  { name: 'BUG_REPORT_REPRO',          sample: null,                   size: 3  },
];

/* Objects, not arrays — checked by key rather than by length. */
const MOVED_TO_DATA_MAPS = [
  { name: 'READING_FIELDS_BY_CLASS',   key: 'I'                     },
  { name: 'READING_FIELD_META',        key: null                    },
  { name: 'DEFAULT_FAIL_REASON_TAGS',  key: 'Earth Continuity'      },
  { name: 'SETTINGS_PAGE_META',        key: 'settingsGlossary'      },
  { name: 'CSA_RESISTANCE',            key: '1.5'                   },
];

const MOVED_TO_DATA_SCALARS = [
  'READING_CLASS_DEFAULT', 'READING_FAIL_TAG_DEFAULT', 'READING_POLARITY_CLASSES',
  'BUG_REPORT_TYPE_DEFAULT', 'BUG_REPORT_SEVERITY_DEFAULT', 'BUG_REPORT_REPRO_DEFAULT',
  'PATGO_FOOTER_LOGO',
];

/* Pull the identifiers the delegated ACTIONS table actually calls. The table is
   `'action-name': (arg) => someFunction(...)`, so the callee of each arrow is
   the thing that has to exist. Deliberately source-parsed rather than executed:
   invoking every action would need a live DOM per entry, and the question here
   is only "is this name defined", which the source can answer.

   A block-bodied handler (`=> { if (…) … }`) puts a KEYWORD where the callee
   would be, so keywords are filtered out rather than reported as missing
   functions — the first run of this test failed on exactly that, and it was the
   test's fault, not the app's. Those handlers are simply not covered here; the
   single-expression ones, which are the overwhelming majority, are. */
const NOT_A_CALLEE = new Set(['if', 'for', 'while', 'switch', 'return', 'typeof',
  'try', 'do', 'const', 'let', 'var', 'new', 'delete', 'await', 'throw']);

function dispatchCallees() {
  const src = fs.readFileSync(path.join(APP_DIR, 'dispatch.js'), 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/^\s*'[a-z0-9-]+':\s*\((?:[^)]*)\)\s*=>\s*(?:\{\s*)?([A-Za-z_$][\w$]*)\s*\(/gm)) {
    if (!NOT_A_CALLEE.has(m[1])) names.add(m[1]);
  }
  return [...names];
}

module.exports = function run() {
  const app = bootApp();

  t.group('09a — every function moved out of session.js is still reachable', () => {
    for (const name of MOVED_TO_SETTINGS_ACTIONS) {
      t.doesNotThrow(() => app.fn(name), `${name} is defined after a full load`);
    }
  });

  t.group('09b — the onboarding wizard survived the move intact', () => {
    for (const name of MOVED_TO_ONBOARDING) {
      t.doesNotThrow(() => app.fn(name), `${name} is defined after a full load`);
    }
    // WIZARD_LAST_STEP is a top-level const, so it does NOT attach to the
    // context and app.fn() would never see it — exactly the blind spot that
    // caused the V61 white screen. It has to come through the bridge.
    const bridged = app.refresh(['WIZARD_LAST_STEP']);
    t.eq(bridged.WIZARD_LAST_STEP, 6, 'WIZARD_LAST_STEP moved with the wizard and still reads 6');
  });

  t.group('09c — dismissWelcome moved to render-core.js, beside the modal', () => {
    for (const name of MOVED_TO_RENDER_CORE) {
      t.doesNotThrow(() => app.fn(name), `${name} is defined after a full load`);
    }
    // MAP rule 8: rolling a welcome touches config.js and render-core.js and
    // nothing else. Asserting WHERE this one lives is the only way that rule
    // stays true rather than merely being written down.
    const rc = fs.readFileSync(path.join(APP_DIR, 'render-core.js'), 'utf8');
    t.includes(rc, 'function dismissWelcome(', 'dismissWelcome is declared in render-core.js');
    const sess = fs.readFileSync(path.join(APP_DIR, 'session.js'), 'utf8');
    t.excludes(sess, 'function dismissWelcome(', 'and no longer in session.js');
  });

  t.group('09d — every delegated action resolves to a function that exists', () => {
    // The generic guard. Any future extraction that loses a function on the way
    // out fails HERE, whatever the release, without anyone remembering to add
    // it to a manifest.
    const callees = dispatchCallees();
    t.ok(callees.length > 100, `found ${callees.length} action callees to check (sanity: the table is large)`);
    const missing = callees.filter(n => {
      try { app.fn(n); return false; } catch { return true; }
    });
    t.deepEq(missing, [], 'no delegated action calls an undefined function');
  });

  t.group('09e — the split files are wired into the build', () => {
    const order = scriptOrderFromIndex();
    t.ok(order.includes('settings-actions.js'), 'settings-actions.js is in the load chain');
    t.ok(order.includes('onboarding.js'), 'onboarding.js is in the load chain');
    t.ok(order.indexOf('settings-actions.js') > order.indexOf('session.js'),
      'settings-actions.js loads after its parent session.js');
    t.eq(order[order.length - 1], 'boot.js', 'boot.js is still last');
  });

  t.group('09f — the boot guard probes the new files', () => {
    // v70: the guard is the only thing standing between a partial deploy (a new
    // file referenced by index.html but never uploaded) and a silent failure
    // that only shows up when a user taps a settings button. One probe per file.
    const boot = fs.readFileSync(path.join(APP_DIR, 'boot.js'), 'utf8');
    const guard = boot.slice(boot.indexOf('const requiredFns'), boot.indexOf('const requiredFns') + 900);
    t.includes(guard, 'saveReportSettingsForm', 'the guard probes settings-actions.js');
    t.includes(guard, 'wizardNextStep', 'the guard probes onboarding.js');
  });

  /* ---------- V71: the config.js -> data.js split ---------- */

  t.group('09g — every table moved out of config.js survived the move', () => {
    const names = MOVED_TO_DATA.map(m => m.name)
      .concat(MOVED_TO_DATA_MAPS.map(m => m.name))
      .concat(MOVED_TO_DATA_SCALARS);
    const b = app.refresh(names);

    for (const { name, sample, size } of MOVED_TO_DATA) {
      t.ok(Array.isArray(b[name]), `${name} is defined and is an array after a full load`);
      // An emptied array still passes an Array.isArray check and still lets the
      // app boot. The length floor and the sample member are what make this
      // assertion fail on a table that arrived as `[]`.
      t.ok((b[name] || []).length >= size, `${name} still holds at least ${size} entries`);
      if (sample !== null) {
        t.ok((b[name] || []).includes(sample), `${name} still contains ${JSON.stringify(sample)}`);
      }
    }
    for (const { name, key } of MOVED_TO_DATA_MAPS) {
      const v = b[name];
      t.ok(v && typeof v === 'object', `${name} is defined and is an object`);
      t.ok(Object.keys(v || {}).length > 0, `${name} is not an empty object`);
      if (key !== null) t.ok(key in (v || {}), `${name} still has the ${key} entry`);
    }
    for (const name of MOVED_TO_DATA_SCALARS) {
      t.ok(b[name] !== undefined && b[name] !== '', `${name} is defined and non-empty`);
    }
    // The logo is the one value where "present" and "intact" are furthest apart:
    // a truncated data URL is still a non-empty string and still renders nothing.
    t.ok(String(b.PATGO_FOOTER_LOGO).startsWith('data:image/png;base64,'),
      'PATGO_FOOTER_LOGO is still a complete PNG data URL');
    t.ok(String(b.PATGO_FOOTER_LOGO).length > 4000,
      'PATGO_FOOTER_LOGO was not truncated on the way across');
  });

  t.group('09h — data.js loads between config.js and state.js, in both manifests', () => {
    // Not a tidiness assertion. state.js seeds itemTypes/failReasons from the
    // moved tables in a TOP-LEVEL initialiser, so data.js arriving one line late
    // is a boot failure, not a style problem.
    const order = scriptOrderFromIndex();
    t.ok(order.includes('data.js'), 'data.js is in the index.html load chain');
    t.eq(order.indexOf('data.js'), order.indexOf('config.js') + 1,
      'data.js loads immediately after config.js');
    t.ok(order.indexOf('data.js') < order.indexOf('state.js'),
      'data.js loads before state.js, which seeds from it at load time');

    const assets = swAssetScripts();
    t.ok(assets.includes('data.js'), 'data.js is precached by the service worker');
    t.ok(assets.indexOf('data.js') < assets.indexOf('state.js'),
      'and sits before state.js in the ASSETS list too');
  });

  t.group('09i — state.js really did seed itself from the moved tables', () => {
    // The only assertion here that exercises the ORDERING rather than asserting
    // it from a manifest. If data.js ever loads after state.js this goes red on
    // its own, without anyone remembering to update a list.
    const b = app.refresh(['DEFAULT_ITEM_TYPES', 'DEFAULT_FAIL_REASONS']);
    const st = app.val('state');
    t.deepEq(st.itemTypes, b.DEFAULT_ITEM_TYPES, 'state.itemTypes seeded from DEFAULT_ITEM_TYPES');
    t.deepEq(st.failReasons, b.DEFAULT_FAIL_REASONS, 'state.failReasons seeded from DEFAULT_FAIL_REASONS');
    // .slice() not a shared reference — editing a preset must never rewrite the
    // shipped default it was seeded from.
    t.ok(st.itemTypes !== b.DEFAULT_ITEM_TYPES, 'state.itemTypes is a copy, not the shared table');
  });

  t.group('09j — config.js still loads on its own, with no data.js present', () => {
    // The dependency has to stay ONE WAY. config.js runs first, so a top-level
    // read of any data.js name there is a ReferenceError at boot for every user.
    // Reading the source and hunting for the names cannot tell a top-level read
    // from one inside a function body; running the file alone can.
    const vm = require('vm');
    const ctx = vm.createContext({ console });
    const src = fs.readFileSync(path.join(APP_DIR, 'config.js'), 'utf8');
    t.doesNotThrow(() => vm.runInContext(src, ctx, { filename: 'config.js' }),
      'config.js evaluates with data.js absent — no top-level dependency on it');
    t.eq(ctx.APP_VERSION, undefined, 'sanity: top-level const did not leak to the context (bridge is still required)');
    // And the reverse dependency is real and must keep working in that order.
    const dataSrc = fs.readFileSync(path.join(APP_DIR, 'data.js'), 'utf8');
    t.doesNotThrow(() => vm.runInContext(dataSrc, ctx, { filename: 'data.js' }),
      'data.js evaluates cleanly once config.js has run');
  });

  t.group('09k — a missing data.js is CAUGHT, cleanly, and named', () => {
    // Driving the failure, not the success. A probe that returns the right
    // answer on a healthy build proves nothing — the case it exists for is the
    // partial deploy where data.js is referenced but never uploaded.
    const broken = bootApp({ skip: ['data.js'], tolerateLoadErrors: true });
    let result;
    try { result = broken.fn('bootIntegrityOK')(); } catch (e) { result = 'threw'; }
    t.eq(result, false, 'data.js missing → the guard returns false');
    // NOT 'threw'. If the probe ever moves back below the `state` check, this is
    // what changes: state.js dies with data.js, `state` is left in the temporal
    // dead zone, and `typeof state` throws instead (D1's mechanism). The guard
    // call site is wrapped so the user still gets the recovery screen either
    // way, but the console then blames state.js for a data.js problem.
    t.notEq(result, 'threw', 'and returns it rather than throwing on the way past state');
    // Healthy build still reads healthy — the other half of a fail-safe check.
    t.eq(app.fn('bootIntegrityOK')(), true, 'a complete build still passes the guard');
  });

  t.group('09l — the data.js probe is a CONSTANT probe, and has to be', () => {
    const boot = fs.readFileSync(path.join(APP_DIR, 'boot.js'), 'utf8');
    const start = boot.indexOf('const requiredFns');
    const fnList = boot.slice(start, boot.indexOf('];', start));
    // The trap this exists for: adding the name to requiredFns instead. It reads
    // correctly, and `typeof window['DEFAULT_ITEM_TYPES']` is never 'function',
    // so the guard would fail on every healthy boot and nobody could start the
    // app. 09k's healthy-build assertion is what would actually go red; this one
    // says why, in the place someone would be editing.
    t.excludes(fnList, 'DEFAULT_ITEM_TYPES',
      'the data.js probe is not a requiredFns entry');
    t.ok(boot.indexOf('DEFAULT_ITEM_TYPES') < boot.indexOf("typeof state === 'undefined'"),
      'the data.js probe runs BEFORE the state check');

    const data = fs.readFileSync(path.join(APP_DIR, 'data.js'), 'utf8');
    t.deepEq(data.split('\n').filter(l => /^function /.test(l)), [],
      'data.js declares no top-level functions — which is why the probe must be a constant');
    t.excludes(data, 'localStorage', 'data.js touches no storage');
  });

  /* ---------- V72: the render-core.js -> render-review.js split ---------- */

  t.group('09m — every screen moved out of render-core.js is still reachable', () => {
    for (const { name } of MOVED_TO_RENDER_REVIEW) {
      t.doesNotThrow(() => app.fn(name), `${name} is defined after a full load`);
    }
  });

  t.group('09n — render() still reaches each moved screen, THROUGH render()', () => {
    // The assertion that earns its place. 09m would pass on a build where the
    // functions exist but render()'s dispatcher lost its else-if branch on the
    // way past — the screen would then paint the previous view's markup, or the
    // sessions list, with no error anywhere. And 09d cannot help here at all:
    // none of these are delegated actions, so the generic guard never looks at
    // them.
    //
    // ⚠ TWO TRAPS, both hit while writing this, both of which made the first
    // draft green on code it could not have caught a fault in:
    //   1. `html.length > 200` passes on ANY render — the first-run wizard modal
    //      alone paints ~1.5 KB over the top of whatever screen is (or isn't)
    //      there. Hence a per-view MARKER string, taken from inside the moved
    //      function itself.
    //   2. renderRetestReminders() bounces to the sessions list when the retest
    //      feature is off, and it is off by default. The fixture therefore turns
    //      it on, and the view is re-read AFTER render() so a bounce is visible
    //      rather than silently passing on the wrong screen's markup.
    const a = populated({ localStorage: { 'pat:retestReminders': '1' } });
    for (const { name, view, marker } of MOVED_TO_RENDER_REVIEW) {
      if (!view) continue;
      t.doesNotThrow(() => { a.fn('setView')(view); a.fn('render')(); },
        `render() survives view "${view}" (${name})`);
      t.eq(a.val('state').view, view, `render() stayed on "${view}" — no bounce to another screen`);
      t.includes(a.doc.getElementById('app').innerHTML, marker,
        `"${view}" painted markup that only ${name}() emits`);
    }
  });

  t.group('09o — the shared photo markup crosses the seam in both directions', () => {
    // renderEntry() stayed in render-core.js; the two photo helpers it calls did
    // not. That is the one genuinely two-way coupling this split created, and it
    // is invisible from either file on its own.
    const rc = fs.readFileSync(path.join(APP_DIR, 'render-core.js'), 'utf8');
    const rr = fs.readFileSync(path.join(APP_DIR, 'render-review.js'), 'utf8');
    for (const name of ['renderFailPhotoStripInner', 'renderPhotoStripSheet']) {
      t.includes(rr, `function ${name}(`, `${name} is declared in render-review.js`);
      t.excludes(rc, `function ${name}(`, `and NOT left behind in render-core.js`);
      t.includes(rc, `${name}()`, `render-core.js still CALLS ${name} across the seam`);
    }
    // Drive it: the entry screen is in render-core.js and must still paint the
    // strip that now lives in the other file.
    const a = populated();
    t.doesNotThrow(() => { a.fn('setView')('entry'); a.fn('render')(); },
      'the entry screen renders with the photo markup living in another file');
  });

  t.group('09p — render() and `const app` stayed put, and render() is still sync', () => {
    // MAP rule 2 had to survive the move; the split was specced so render() was
    // not edited at all, and this is what holds that true in later releases.
    const rc = fs.readFileSync(path.join(APP_DIR, 'render-core.js'), 'utf8');
    const rr = fs.readFileSync(path.join(APP_DIR, 'render-review.js'), 'utf8');
    t.includes(rc, 'function render() {', 'render() is declared in render-core.js');
    t.excludes(rc, 'async function render(', 'render() is not async (MAP rule 2)');
    t.excludes(rr, 'function render() {', 'render() did not get duplicated into render-review.js');
    t.includes(rc, "const app = document.getElementById('app')", '`const app` stayed in render-core.js');
    // A second top-level `const app` in a loaded file is a fatal SyntaxError
    // that kills the whole file (MAP rule 1). 01e is the general scan; this is
    // the named case for the file most likely to acquire one.
    t.excludes(rr, "const app = document.getElementById", 'render-review.js does not redeclare `const app`');
    t.deepEq(rr.split('\n').filter(l => /^(const|let|var) /.test(l)), [],
      'render-review.js declares no top-level bindings at all — which is why its load position is free');
  });

  t.group('09q — render-review.js is wired in, and a missing one is CAUGHT', () => {
    const order = scriptOrderFromIndex();
    t.ok(order.includes('render-review.js'), 'render-review.js is in the index.html load chain');
    t.ok(order.indexOf('render-review.js') > order.indexOf('render-core.js'),
      'it loads after render-core.js');
    const assets = swAssetScripts();
    t.ok(assets.includes('render-review.js'), 'render-review.js is precached by the service worker');

    // The probe. Unlike data.js this file DOES declare functions, so an ordinary
    // requiredFns entry is right — and 09l's warning does not apply here.
    const boot = fs.readFileSync(path.join(APP_DIR, 'boot.js'), 'utf8');
    const fnList = boot.slice(boot.indexOf('const requiredFns'), boot.indexOf('];', boot.indexOf('const requiredFns')));
    t.includes(fnList, 'renderOverview', 'the guard probes render-review.js via requiredFns');

    // Drive the partial deploy: index.html references the file, nobody uploaded it.
    const broken = bootApp({ skip: ['render-review.js'], tolerateLoadErrors: true });
    let result;
    try { result = broken.fn('bootIntegrityOK')(); } catch (e) { result = 'threw'; }
    t.eq(result, false, 'render-review.js missing → the guard returns false');
    t.eq(app.fn('bootIntegrityOK')(), true, 'a complete build still passes the guard');
  });
};
