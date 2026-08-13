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
   config.js splits still to come, not just for V70. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t = require('../assert');
const { APP_DIR, bootApp, scriptOrderFromIndex } = require('../load');

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
};
