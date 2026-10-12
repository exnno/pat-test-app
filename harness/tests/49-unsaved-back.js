/* Standing test — V112 (browser-test fixes — spec 0A 1A 2A 3A 4A 5A 6A)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Found by testing the live app in a browser (11 Oct):
   • 1A/2A — Back on the seven Settings pages with a Save button (Engineer,
     Quick Pick items, Fail reasons, Descriptions, CSV columns, Multi Pick,
     Report) and the Edit session arrow used to throw changes away. Now it asks
     — Save / Discard changes / Keep editing — and ONLY when something changed.
     Edit session's own Cancel button stays a plain discard.
   • 3A — Save lands where Back would (the section page, the preview, or the
     entry screen), not always the Settings hub.
   • 4A — first-time setup's branding step has a "Make PDF reports" switch: ON
     for a new phone, the current setting on a re-run; applied on Continue.
   • 5A — finishing / skipping / importing setup counts as having seen this
     version's What's new.

   HOW THE PAGE IS "PAINTED" HERE. The stub registers ids from render()'s markup
   but does not parse value="…" — a registered input starts empty. A real paint
   puts the saved values in the boxes, and the guard reads them straight after.
   paint() does the same: render() (the real wiring), then fill the boxes with
   what the browser would show, then the render tail's read. 49b proves that
   render() itself takes the read, so paint() is not hiding a missing hook.

   Taps go through #app's click delegation with the action READ FROM THE
   RENDERED back button — never by naming the action — so an arrow wired to the
   wrong action fails here (the V67 lesson). */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, bootApp } = require('../load');
const { freshApp, withSession, withItem } = require('../fixture');

const html = (app) => app.doc.getElementById('app').innerHTML;

function tap(app, action, arg) {
  const el = app.doc.createElement('button');
  el.dataset.action = action;
  if (arg !== undefined) el.dataset.arg = String(arg);
  app.doc.getElementById('app').dispatchEvent({
    type: 'click', target: el, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
  });
}

// A switch flipped through #app's change delegation (the real handler).
function flip(app, action, checked) {
  const el = app.doc.createElement('input');
  el.type = 'checkbox';
  el.dataset.changeAction = action;
  el.checked = checked;
  app.doc.getElementById('app').dispatchEvent({
    type: 'change', target: el, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
  });
}

// The action on the rendered button with this id.
function actionOf(app, id) {
  const m = html(app).match(new RegExp(`id="${id}"[^>]*data-action="([^"]+)"`));
  return m ? m[1] : null;
}
const tapBack = (app) => {
  const a = actionOf(app, 'back-to-settings-btn') || actionOf(app, 'cancel-edit-btn');
  if (!a) throw new Error('no back arrow on this page');
  tap(app, a);
};

// The guard's sheet, if open (it is appended to body, so it is in the real tree).
const sheet = (app) => app.doc.body.children.find(el => el.getAttribute && el.getAttribute('aria-label') === 'Save your changes?') || null;
const pick = (app, which) => {
  const id = { save: 'choice-sheet-0', discard: 'choice-sheet-1', keep: 'choice-sheet-no' }[which];
  app.doc.getElementById(id).click();
};

// Open a page the way the hub does, then paint it with the values the browser
// would show (see header).
function open(app, view, cat) {
  const st = app.state();
  st.settingsCategory = cat === undefined ? 'catTesting' : cat;
  app.fn('setView')(view);
}
function paint(app, values) {
  app.fn('render')();
  for (const [id, v] of Object.entries(values || {})) {
    const el = app.doc.getElementById(id);
    if (el) { if (typeof v === 'boolean') { el.type = 'checkbox'; el.checked = v; } else el.value = v; }
  }
  app.fn('unsavedAfterRender')();
}
// A classed input in the real tree (the stub gives registered elements no class).
function classed(app, cls, value, extra) {
  const el = app.doc.createElement('input');
  el.classList.add(cls);
  el.value = value;
  Object.assign(el, extra || {});
  app.doc.body.appendChild(el);
  return el;
}

// Report Settings inputs, as the browser shows them (captureReportTextInputs reads these).
function reportValues(st) {
  const rs = st.reportSettings;
  return {
    'report-company-name': rs.companyName, 'report-company-address': rs.companyAddress,
    'report-title': rs.reportTitle, 'report-declaration-text': rs.declarationText,
    'report-filename-pattern': rs.reportFilenamePattern, 'report-cert-prefix': rs.certPrefix,
    'report-cert-padding': String(rs.certPadding), 'report-cert-next': String(rs.certNextNumber),
    'report-remedial-text': rs.remedialActionText,
    'report-retest-months': rs.retestMonths == null ? '' : String(rs.retestMonths),
  };
}
const savedReport = (app) => JSON.parse(app.storage.getItem('pat:reportsettings') || '{}');   // {} not null: a missing save fails an assertion, not the group

module.exports = async function () {
  /* ------------------------------------------------------------------ 49a */
  await t.group('49a — the guard covers exactly the eight pages; every Back on them goes through it', () => {
    const app = bootApp();
    const pages = Object.keys(app.run('UNSAVED_PAGES')).sort();
    t.deepEq(pages, ['editSession', 'settingsCsv', 'settingsDescriptions', 'settingsFails', 'settingsItems',
      'settingsMultiPick', 'settingsReport', 'settingsUser'], 'guarded pages (2A)');
    const d = fs.readFileSync(path.join(APP_DIR, 'dispatch.js'), 'utf8');
    t.includes(d, "'back-to-settings': () => unsavedLeave(settingsBackNav),", 'Settings Back goes through the guard');
    t.includes(d, "'edit-back': () => unsavedLeave(() => setView('overview')),", 'the Edit session arrow goes through the guard');
    t.includes(d, "'edit-cancel': () => setView('overview'),", 'the Cancel button stays a plain discard');
    const sa = fs.readFileSync(path.join(APP_DIR, 'settings-actions.js'), 'utf8');
    const body = sa.slice(sa.indexOf('function unsavedLeave('), sa.indexOf('function settingsBackNav('));
    t.excludes(body, 'render()', 'the question never repaints the page underneath (rule 3)');
    t.includes(body, 'openChoiceSheet(', 'it is the choice sheet');
    // Every Settings page that has a Save button is guarded (a new one must be added).
    const rs = fs.readFileSync(path.join(APP_DIR, 'render-settings.js'), 'utf8');
    const saves = [...rs.matchAll(/data-action="(settings-[a-z]+-save)"/g)].map(m => m[1]).sort();
    t.deepEq(saves, ['settings-csv-save', 'settings-descriptions-save', 'settings-fails-save', 'settings-items-save',
      'settings-multipick-save', 'settings-report-save', 'settings-user-save'], 'the seven Save pages are the seven guarded');
  });

  /* ------------------------------------------------------------------ 49b */
  await t.group('49b — an untouched page leaves exactly as before: no question, same place', () => {
    const app = freshApp();
    withSession(app);
    // render() itself takes the paint-time read (not only paint()).
    open(app, 'settingsUser', 'catUser');
    app.fn('render')();
    t.eq(app.run('_unsaved && _unsaved.view'), 'settingsUser', 'render() records the page on screen');
    tapBack(app);
    t.eq(sheet(app), null, 'Engineer: no question');
    t.eq(app.state().view, 'settingsCategory', 'Engineer: back to its section');
    for (const v of ['settingsItems', 'settingsFails', 'settingsDescriptions', 'settingsMultiPick', 'settingsCsv']) {
      open(app, v); paint(app);
      tapBack(app);
      t.eq(sheet(app), null, `${v}: no question`);
      t.eq(app.state().view, 'settingsCategory', `${v}: back to its section`);
    }
    open(app, 'settingsReport', 'catReports'); paint(app, reportValues(app.state()));
    tapBack(app);
    t.eq(sheet(app), null, 'Report: no question');
    t.eq(app.state().view, 'settingsCategory', 'Report: back to its section');
    app.fn('setView')('overview');
    app.fn('startEditSession')();
    const st = app.state(), f = st.editForm;
    paint(app, { 'ef-site': f.site, 'ef-engineer': f.engineer, 'ef-name': f.name, 'ef-date': f.date, 'ef-prefix': f.prefix, 'ef-locked': false });
    tapBack(app);
    t.eq(sheet(app), null, 'Edit session: no question');
    t.eq(app.state().view, 'overview', 'Edit session: back to the Overview');
  });

  /* ------------------------------------------------------------------ 49c */
  await t.group('49c — a change asks; Save keeps it and lands where Back would (3A)', () => {
    const app = freshApp();
    app.state().engineer = 'Old Name';
    open(app, 'settingsUser', 'catUser'); paint(app, { 'settings-engineer': 'Old Name' });
    app.doc.getElementById('settings-engineer').value = 'New Name';
    tapBack(app);
    t.ok(sheet(app), 'the question is up');
    t.eq(app.state().view, 'settingsUser', 'still on the page while it asks');
    t.eq(app.state().engineer, 'Old Name', 'nothing saved yet');
    pick(app, 'save');
    t.eq(sheet(app), null, 'the sheet closes');
    t.eq(app.state().engineer, 'New Name', 'Save keeps the change');
    t.includes(app.storage.getItem('pat:engineer') || JSON.stringify(app.storage.getItem('pat:state') || ''), 'New Name', 'and it is on disk');
    t.eq(app.state().view, 'settingsCategory', 'Save lands on the section, as Back does');
    // The page's own Save button lands there too (3A).
    open(app, 'settingsFails'); paint(app, { 'settings-reasons': 'A\nB' });
    tap(app, 'settings-fails-save');
    t.eq(app.state().view, 'settingsCategory', 'Fail reasons Save → its section, not the hub');
    // Quick Pick Items reached from the entry screen: Save returns there.
    withSession(app);
    app.state().presetEditReturnView = 'entry';
    app.fn('setView')('settingsItems');
    app.state().presetEditReturnView = 'entry';
    paint(app, { 'settings-types': 'Kettle' });
    tap(app, 'settings-items-save');
    t.eq(app.state().view, 'entry', 'Items Save from the entry screen goes back to it');
  });

  /* ------------------------------------------------------------------ 49d */
  await t.group('49d — Discard leaves without saving; Keep editing stays with the typing intact', () => {
    const app = freshApp();
    app.state().engineer = 'Old Name';
    app.fn('save')();
    open(app, 'settingsUser', 'catUser'); paint(app, { 'settings-engineer': 'Old Name' });
    app.doc.getElementById('settings-engineer').value = 'Typo';
    tapBack(app);
    pick(app, 'keep');
    t.eq(sheet(app), null, 'Keep editing closes the question');
    t.eq(app.state().view, 'settingsUser', 'and stays on the page');
    t.eq(app.doc.getElementById('settings-engineer').value, 'Typo', 'with the typing still there');
    tapBack(app);
    t.ok(sheet(app), 'asks again — still changed');
    pick(app, 'discard');
    t.eq(app.state().engineer, 'Old Name', 'Discard saves nothing');
    t.eq(app.state().view, 'settingsCategory', 'and leaves the way Back does');
    // Multi Pick: the On switch alone counts (it waits for Save — 16).
    open(app, 'settingsMultiPick');
    const seq = classed(app, 'mp-slot-seq', '');
    paint(app, { 'multipick-enabled': false });
    app.doc.getElementById('multipick-enabled').checked = true;
    tapBack(app);
    t.ok(sheet(app), 'Multi Pick: switching it on is a change');
    pick(app, 'discard');
    t.eq(app.state().multiPick.enabled, false, 'Discard: still off');
    open(app, 'settingsMultiPick'); paint(app, { 'multipick-enabled': false });
    seq.value = 'Lead, PC';
    tapBack(app);
    t.ok(sheet(app), 'Multi Pick: typing a list is a change');
    pick(app, 'discard');
    seq.remove();
    // Descriptions in "Edit as text": Discard leaves text mode, as Save does.
    app.state().descTextMode = true;
    open(app, 'settingsDescriptions'); paint(app, { 'settings-descriptions': 'Kettle' });
    app.doc.getElementById('settings-descriptions').value = 'Kettle\nToaster';
    tapBack(app);
    pick(app, 'discard');
    t.eq(app.state().descTextMode, false, 'Descriptions: Discard leaves text mode, as Save does');
  });

  /* ------------------------------------------------------------------ 49e */
  await t.group('49e — CSV columns: a move lives in memory before Save; it asks, and Discard puts the order back', () => {
    const app = freshApp();
    const before = app.state().csvColumns.map(c => c.id);
    open(app, 'settingsCsv', 'catReports'); paint(app);
    tap(app, 'csv-down', before[0]);   // repaints from state
    app.fn('unsavedAfterRender')();    // (the render tail already ran; harmless repeat)
    t.notEq(app.state().csvColumns.map(c => c.id).join(), before.join(), 'the move changed memory');
    tapBack(app);
    t.ok(sheet(app), 'a moved column is a change, even after the repaint');
    pick(app, 'discard');
    t.eq(app.state().csvColumns.map(c => c.id).join(), before.join(), 'Discard: the original order is back');
    t.eq(app.state().view, 'settingsCategory', 'and Back went to its section');
    // Move, leave by Save, come back: the starting point is taken AGAIN on the
    // new visit (the stub has no column rows, so Save here only navigates — the
    // moved order is what memory holds when the page reopens).
    open(app, 'settingsCsv', 'catReports'); paint(app);
    tap(app, 'csv-down', before[0]);
    app.fn('saveCsvColumnsSettings')();
    open(app, 'settingsCsv', 'catReports'); paint(app);
    tapBack(app);
    t.eq(sheet(app), null, 'reopened: a fresh starting point, so untouched → no question');
  });

  /* ------------------------------------------------------------------ 49f */
  await t.group('49f — Report Settings: switches and typing ask; instant saves do not; Discard re-reads what is saved', () => {
    const app = freshApp();
    const st = app.state();
    open(app, 'settingsReport', 'catReports'); paint(app, reportValues(st));
    // Instant: Enable reports saves itself — leaving afterwards asks nothing.
    flip(app, 'report-enabled', true);   // its handler saves and repaints
    for (const [id, v] of Object.entries(reportValues(app.state()))) { const el = app.doc.getElementById(id); if (el) el.value = v; }
    tapBack(app);
    t.eq(sheet(app), null, 'an instant save (Enable reports) is not "unsaved"');
    t.eq(savedReport(app).enabled, true, 'and it stays saved');
    // A display switch waits for Save: it asks, and Discard puts it back.
    open(app, 'settingsReport', 'catReports'); paint(app, reportValues(app.state()));
    const was = app.state().reportSettings.showFails;
    flip(app, 'report-show-fails', !was);   // waits for Save; repaints
    for (const [id, v] of Object.entries(reportValues(app.state()))) { const el = app.doc.getElementById(id); if (el) el.value = v; }
    t.eq(app.state().reportSettings.showFails, !was, 'the switch changed memory');
    tapBack(app);
    t.ok(sheet(app), 'a flipped display switch asks');
    pick(app, 'discard');
    t.eq(app.state().reportSettings.showFails, was, 'Discard: the switch is back in memory too');
    t.eq(app.state().reportSettings.enabled, true, 'and the instant save survives Discard');
    // Typing a company name asks; Save keeps it.
    open(app, 'settingsReport', 'catReports'); paint(app, reportValues(app.state()));
    app.doc.getElementById('report-company-name').value = 'Test PAT Co';
    tapBack(app);
    t.ok(sheet(app), 'a typed company name asks (the browser-test loss)');
    pick(app, 'save');
    t.eq(savedReport(app).companyName, 'Test PAT Co', 'Save keeps it on disk');
    t.eq(app.state().view, 'settingsCategory', 'and lands on its section');
  });

  /* ------------------------------------------------------------------ 49g */
  await t.group('49g — Edit session: the arrow asks after a change; Cancel never asks; Discard changes nothing', () => {
    const app = freshApp();
    const s = withSession(app, { name: 'Job A' });
    app.fn('setView')('overview');
    app.fn('startEditSession')();
    const f = () => app.state().editForm;
    const vals = () => ({ 'ef-site': f().site, 'ef-engineer': f().engineer, 'ef-name': f().name, 'ef-date': f().date, 'ef-prefix': f().prefix, 'ef-locked': false });
    paint(app, vals());
    t.eq(actionOf(app, 'cancel-edit-btn'), 'edit-back', 'the header arrow is the guarded Back');
    app.doc.getElementById('ef-name').value = 'Job B';
    tapBack(app);
    t.ok(sheet(app), 'a renamed job asks');
    pick(app, 'discard');
    t.eq(app.fn('activeSession')().name, 'Job A', 'Discard: the job keeps its name');
    t.eq(app.state().view, 'overview', 'back on the Overview');
    // Cancel button: plain discard, never a question.
    app.fn('startEditSession')(); paint(app, vals());
    app.doc.getElementById('ef-name').value = 'Job C';
    tap(app, 'edit-cancel');
    t.eq(sheet(app), null, 'Cancel does what it says — no question');
    t.eq(app.fn('activeSession')().name, 'Job A', 'and nothing saved');
    // Save from the question.
    app.fn('startEditSession')(); paint(app, vals());
    app.doc.getElementById('ef-name').value = 'Job D';
    tapBack(app);
    pick(app, 'save');
    t.eq(app.fn('activeSession')().name, 'Job D', 'Save from the question renames the job');
    t.eq(app.state().view, 'overview', 'and returns to the Overview');
    t.eq(s.id, app.fn('activeSession')().id, 'same job');
  });

  /* ------------------------------------------------------------------ 49h */
  await t.group('49h — if the check cannot run, it asks rather than throw the typing away', () => {
    const app = freshApp();
    open(app, 'settingsUser', 'catUser'); paint(app, { 'settings-engineer': '' });
    app.run('_unsaved = null');   // the paint-time read went missing
    tapBack(app);
    t.ok(sheet(app), 'no baseline on a guarded page → ask');
    pick(app, 'keep');
    open(app, 'settingsReport', 'catReports'); paint(app, reportValues(app.state()));
    app.run('var __cr = captureReportTextInputs; captureReportTextInputs = function () { throw new Error("boom"); };');
    tapBack(app);
    t.ok(sheet(app), 'a check that throws → ask');
    app.run('captureReportTextInputs = __cr;');
  });

  /* ------------------------------------------------------------------ 49i */
  await t.group('49i — setup: "Make PDF reports" on the branding step (4A)', () => {
    const fresh = () => {
      const app = freshApp();
      const st = app.state();
      st.onboardedV33Seen = false; st.wizardPath = 'fresh'; st.wizardStep = 4;
      paintWizard(app);
      return app;
    };
    // The stub does not read `checked` from markup (header): set the box the way
    // the browser's paint would, from what render() actually wrote.
    function paintWizard(app) {
      app.fn('render')();
      const on = /id="wizard-reports"[^>]*\bchecked\b/.test(html(app));
      const el = app.doc.getElementById('wizard-reports');
      el.type = 'checkbox'; el.checked = on;
    }
    let app = fresh();
    t.includes(html(app), 'id="wizard-reports" data-change-action="wizard-reports" checked', 'a new phone: the switch starts ON');
    t.eq(app.state().reportSettings.enabled, false, 'reports are off until Continue');
    tap(app, 'wizard-next');
    t.eq(app.state().reportSettings.enabled, true, 'Continue switches reports on');
    t.eq(savedReport(app).enabled, true, 'and saves it there and then');
    tap(app, 'wizard-skip');
    t.eq(savedReport(app).enabled, true, 'a later Skip keeps it');
    // Switched off on the step.
    app = fresh();
    const sw = app.doc.getElementById('wizard-reports');   // the real switch on the page
    sw.checked = false;
    sw.dataset.changeAction = 'wizard-reports';
    app.doc.getElementById('app').dispatchEvent({ type: 'change', target: sw, defaultPrevented: false, preventDefault() {}, stopPropagation() {} });
    t.eq(app.state().wizardReportsOn, false, 'the switch\'s handler records it');
    tap(app, 'wizard-next');
    t.eq(app.state().reportSettings.enabled, false, 'switched off: stays off');
    // Skip ON the branding step: as before, reports stay off.
    app = fresh();
    tap(app, 'wizard-skip');
    t.eq(app.state().reportSettings.enabled, false, 'Skip on the branding step: reports stay off');
    // Re-run from About: the switch starts at the current setting.
    app = freshApp();
    app.state().onboardedV33Seen = true;
    app.fn('restartOnboarding')();
    let st = app.state(); st.wizardPath = 'fresh'; st.wizardStep = 4; paintWizard(app);
    t.excludes(html(app), 'data-change-action="wizard-reports" checked', 're-run with reports off: the switch starts off');
    tap(app, 'wizard-next');
    t.eq(app.state().reportSettings.enabled, false, 'and Continue leaves them off');
    app = freshApp();
    app.state().reportSettings.enabled = true; app.fn('saveReportSettings')();
    app.fn('restartOnboarding')();
    st = app.state(); st.wizardPath = 'fresh'; st.wizardStep = 4; paintWizard(app);
    t.includes(html(app), 'data-change-action="wizard-reports" checked', 're-run with reports on: the switch starts on');
    tap(app, 'wizard-next');
    t.eq(app.state().reportSettings.enabled, true, 'and Continue leaves them on');
  });

  /* ------------------------------------------------------------------ 49j */
  await t.group('49j — setup counts as having seen What\'s new (5A)', () => {
    const KEY = 'pat:' + 'V112'.toLowerCase() + 'welcome';
    for (const [label, finish] of [
      ['finished', (app) => tap(app, 'wizard-finish')],
      ['skipped', (app) => tap(app, 'wizard-skip')],
    ]) {
      const app = freshApp();
      const st = app.state();
      st.onboardedV33Seen = false; st.welcomeSeen = false; st.wizardPath = 'fresh'; st.wizardStep = 6;
      app.fn('render')();
      finish(app);
      t.eq(app.state().welcomeSeen, true, `${label}: seen`);
      t.eq(app.storage.getItem(KEY), '1', `${label}: remembered on disk`);
      t.excludes(html(app), "What's new in", `${label}: no What's new sheet after setup`);
    }
    const app = freshApp();
    app.state().onboardedV33Seen = false; app.state().welcomeSeen = false;
    app.fn('onboardSetupImport')({ name: 'x.json', type: 'application/json', text: async () => '{}' });
    t.eq(app.state().welcomeSeen, true, 'importing a setup: seen');
    // An existing phone that updates still gets it.
    const up = freshApp({ localStorage: { 'pat:onboardedV33': '1' } });
    up.fn('render')();
    t.includes(html(up), "What's new in V112", 'an updating phone still sees What\'s new');
  });

  /* ------------------------------------------------------------------ 49k */
  // V113: the release pins (version, cache, changelog) moved to 50e; V113 rolls
  // no welcome (11B), so V112's copy is still the one shown.
  await t.group('49k — V112\'s welcome copy is still the current one', () => {
    const core = fs.readFileSync(path.join(APP_DIR, 'render-core.js'), 'utf8');
    t.includes(core, 'No more lost settings.', 'the welcome copy is V112\'s');
  });
};
