/* PATGo harness — the sheet register (V110, spec 5A)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Read by harness/tests/47-sheet-guard.js.

   Every bottom sheet in the app either marks the part of it that can grow with
   `.sheet-scroll`, or is named here with the reason it does not need one. A new
   sheet with neither fails the test run until someone decides which it is.

   The test for "needs a scroller" is MAP rule 14: does anything in the sheet grow
   from DATA — a list, or text the user or a caller supplies with no limit? Fixed
   wording, a fixed set of buttons, a box with a fixed number of rows (its text
   scrolls inside the box) and a single short name do not grow.

   Keys are written by harness/sheets.js: `file · aria-label` when the label is
   plain text, otherwise `file · functionName()`; a repeat gets ` #2` (6A).
   An entry whose sheet no longer exists, or that now has a scroller, fails the
   run too (7A) — so this list can only ever describe the app as it is.

   ⚠ A reason is a claim about the data. If you change what a listed sheet shows
   — add a list, show a user's notes — re-read its reason before the run passes. */

'use strict';

module.exports = {
  // render-core.js
  'render-core.js · Welcome to V9':
    'the one-off V9 presets prompt: fixed wording, one name box and Continue',
  'render-core.js · Already exported':
    'one of two fixed sentences and two buttons',
  'render-core.js · Draw signature':
    'one fixed line, a fixed-size signature box and two buttons',
  'render-core.js · Job already exists':
    'two sentences whose only data is one site name, a date and two counts; three buttons',
  'render-core.js · Import summary':
    'a one-line result; the skipped-rows list scrolls inside its own 160 px box (.import-summary-list)',
  'render-core.js · Reading outside the usual limit':
    'one row per reading over its limit, and there are only three readings (data.js READING_FIELD_META); two buttons',
  'render-core.js · Test readings':
    'the class buttons, at most three reading boxes and the polarity tick, then OK — a fixed set',
  'render-core.js · Map pin':
    'fixed wording (the item label is one short line), one input, Save, and an optional fixed what3words note',

  // render-review.js
  'render-review.js · Edit selected items':
    'six fixed menu buttons',
  'render-review.js · Change location':
    'one input and Apply',
  'render-review.js · Change notes':
    'two fixed choices, a 3-row text box (its text scrolls inside it) and Apply',
  'render-review.js · Site notes':
    'one line naming the site, an 8-row text box (its text scrolls inside it) and Save',
  'render-review.js · Retest reminder action':
    'a title naming the job, one fixed sentence and three buttons',

  // render-settings.js
  'render-settings.js · renderSettingsItems()':
    'the new / rename preset box: one name input and a button',
  'render-settings.js · renderSettingsClients()':
    'the add / rename client box: one name input and a button',
  'render-settings.js · renderSettingsClients() #2':
    'the add / edit site box: one line naming the client, a name input, a 4-row notes box (its text scrolls inside it) and a button',
  'render-settings.js · Site name clash':
    'one sentence naming two sites and three buttons',
  'render-settings.js · Assign site to client':
    'one input (its client list is a native picker, not part of the sheet) and Assign',

  // settings-actions.js
  'settings-actions.js · Name this setup':
    'fixed wording, one name input, a line listing what is included (at most five sections, data.js SETUP_SECTIONS) and Share',
};
