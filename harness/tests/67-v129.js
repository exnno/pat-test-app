/* Standing test — V129: VoiceOver's leftovers from V123
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked (15 Oct, Peter "1A 2A 3A 4A"):
   1A  + New job: the button goes when its form opens, so focus fell to the
       Jobs title. It now lands on the form's own "New job" heading (#nf-title).
       The form's Cancel puts the button back, and focus lands on it
       (feedback.js FOCUS_STAND_INS — Claude's call within 1A).
   2A  The certificate preview's quick-adjust chips: the preview rebuilds in
       place (report.js rebuild, outside render()), so VoiceOver lost its place.
       Focus goes back on the chip tapped, and each chip says on/off
       (aria-pressed). The chips are wired by their ids (qa-chip-<action>).
   3A  Six pick-one groups that showed their choice by colour only now carry
       aria-pressed, like Text size: Theme, the preset switcher, Class I/II,
       signature Left/Right, the certificate colour themes, and the problem
       report's type / severity / "can you make it happen again" — the last
       three in place too (_applyBugSheetDOM: the bug sheet never redraws).
   4A  A VoiceOver run-through on a real iPhone is Peter's (the checklist).

     67a  1A through the real dispatcher and render(): + New job → the form's
          heading; Cancel → + New job; never a text field.
     67b  2A through the real preview: chips drawn pressed / not; a tap on a
          chip flips it, rebuilds, and focus is back on that chip.
     67c  3A: every group drawn with exactly one pressed; the bug sheet's three
          groups repainted in place.
     67d  wiring (source): rebuild(action); chips wired from the markup; the
          severity dot hidden from VoiceOver.
     67f  release: V129, What's new, cache, changelog. (66f → 67f.) */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, withSession, withItem, tick } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;

function ready(opts) {
  const app = freshApp(opts);
  const st = app.state();
  st.welcomeSeen = true;
  st.onboardedV33Seen = true;
  st.migrationPrompt = { show: false, name: '', items: [] };
  app.run('_focusTap = null; _focusBefore = null; _focusOpener = null; _focusSheetWasOpen = false; _focusLastView = null; _focusLogged = false;');
  return app;
}

/* A button in the (real, appended) body tree. */
function btn(app, attrs) {
  const el = app.doc.createElement(attrs.tag || 'button');
  for (const k of Object.keys(attrs)) if (k !== 'tag') el.setAttribute(k, attrs[k]);
  app.doc.body.appendChild(el);
  return el;
}
/* A tapped control its own redraw takes away: held only by the tap, in no tree
   and not registered, so nothing can find it again — gone, as on a phone. */
function goneBtn(app, attrs) {
  const el = app.doc.createElement('button');
  for (const k of Object.keys(attrs)) el.setAttribute(k, attrs[k]);
  if (attrs.id) app.doc._byId.delete(attrs.id);
  return el;
}

/* [arg, pressed] for every button of one action in a piece of markup. */
function pressed(markup, action) {
  const out = [];
  for (const m of markup.matchAll(/<button\b([^>]*)>/g)) {
    const a = m[1];
    if (a.indexOf(`data-action="${action}"`) === -1) continue;
    const arg = (a.match(/data-arg="([^"]*)"/) || [])[1];
    const p = (a.match(/aria-pressed="(\w+)"/) || [])[1];
    out.push(arg + ':' + p);
  }
  return out;
}
const onePressed = (list) => list.length > 1 && list.filter(x => x.endsWith(':true')).length === 1 && list.every(x => /:(true|false)$/.test(x));

module.exports = async function run() {

  /* ------------------------------------------------------------------ 67a */
  await t.group('67a — + New job lands on its form; Cancel lands back on + New job (1A)', () => {
    const app = ready();
    withSession(app);
    const st = app.state();
    st.view = 'sessions';
    st.newForm.show = false;
    app.fn('focusAfterRender')();                  // seeds the last view: Jobs

    // The tap goes through the real click dispatcher; the action redraws.
    const nb = goneBtn(app, { id: 'new-session-btn', 'data-action': 'new-session' });
    app.fn('handleDelegatedClick')({ target: nb });
    t.ok(st.newForm.show, 'the form opened');
    t.includes(html(app), '<h2 class="h2" id="nf-title" tabindex="-1">New job</h2>', 'its heading is focusable by script only');
    t.eq(app.doc.activeElement, app.doc.getElementById('nf-title'), '+ New job: the form’s “New job” heading has focus');
    t.notEq(app.doc.activeElement, app.doc.getElementById('screen-title'), '… not the Jobs title');

    // Cancel: the form goes, + New job comes back — focus on it.
    const cancel = goneBtn(app, { id: 'nf-cancel', 'data-action': 'nf-cancel' });
    app.fn('handleDelegatedClick')({ target: cancel });
    t.notOk(st.newForm.show, 'Cancel closed the form');
    t.eq(app.doc.activeElement, app.doc.getElementById('new-session-btn'), 'Cancel: back on + New job');

    // The decision itself: a stand-in is used only when the control has gone.
    const F = (n) => app.fn(n);
    app.doc.register('nf-title', 'h2');
    const still = app.doc.register('x-still', 'button');
    still.setAttribute('data-action', 'new-session');
    F('focusNoteTap')(still);
    t.eq(F('focusAfterRender')(), 'control', 'the tapped control is still there: it wins over a stand-in');
    t.eq(app.doc.activeElement, still, '… focus on it');
    app.doc._byId.delete('x-still');

    // Never a text field, even if a stand-in pointed at one (keyboard).
    app.run("FOCUS_STAND_INS['x-swap'] = 'x-box'");
    app.doc.register('x-box', 'input').setAttribute('type', 'text');
    F('focusNoteTap')(goneBtn(app, { 'data-action': 'x-swap' }));
    t.eq(F('focusAfterRender')(), 'heading', 'a stand-in that is a text box: the heading instead');
    t.notEq(app.doc.activeElement && app.doc.activeElement.id, 'x-box', '… the box is NOT focused');
    app.run("delete FOCUS_STAND_INS['x-swap']");
    t.deepEq(app.run('JSON.parse(JSON.stringify(FOCUS_STAND_INS))'), { 'new-session': 'nf-title', 'nf-cancel': 'new-session-btn' }, 'the two stand-ins');
  });

  /* ------------------------------------------------------------------ 67b */
  await t.group('67b — certificate preview: a chip says on/off and keeps VoiceOver’s place (2A)', async () => {
    const app = ready();
    withSession(app);
    withItem(app);
    const st = app.state();
    st.reportSettings.showFails = false;
    st.reportSettings.showCalibration = true;
    // The PDF engine is not here: the preview takes its fallback, and the
    // object URL is a stand-in. Everything the chips do is the real code.
    app.run("URL.createObjectURL = () => 'blob:x'; URL.revokeObjectURL = () => {}; renderPdfPagesToContainer = null; buildReportDoc = () => ({ output() { return { size: 1 }; }, internal: { getNumberOfPages() { return 1; } } });");
    const sess = app.fn('activeSession')();
    app.fn('openReportPreview')(app.run('buildReportDoc()'), sess);
    const sheet = () => app.doc.querySelector('.report-preview-sheet');
    t.ok(sheet(), 'the preview is up');
    t.includes(sheet().innerHTML, 'id="qa-chip-fails" aria-pressed="false" data-qa="fails"', 'List all items: drawn not pressed');
    t.includes(sheet().innerHTML, 'id="qa-chip-calibration" aria-pressed="true" data-qa="calibration"', 'Calibration: drawn pressed');

    // Tap List all items, as the phone does.
    app.doc.activeElement = null;
    app.doc.getElementById('qa-chip-fails').click();
    await tick(5);
    t.ok(st.reportSettings.showFails, 'the tap flipped the setting');
    t.includes(sheet().innerHTML, 'id="qa-chip-fails" aria-pressed="true" data-qa="fails"', '… and the rebuilt chip says pressed');
    t.eq(app.doc.activeElement, app.doc.getElementById('qa-chip-fails'), 'focus is back on List all items after the rebuild');

    // And again on another chip: it follows the chip tapped.
    app.doc.getElementById('qa-chip-calibration').click();
    await tick(5);
    t.notOk(st.reportSettings.showCalibration, 'Calibration flipped off');
    t.includes(sheet().innerHTML, 'id="qa-chip-calibration" aria-pressed="false"', '… drawn not pressed');
    t.eq(app.doc.activeElement, app.doc.getElementById('qa-chip-calibration'), 'focus on Calibration this time');
    const closeBtn = app.doc.getElementById('report-preview-close');
    if (closeBtn) closeBtn.click();
  });

  /* ------------------------------------------------------------------ 67c */
  await t.group('67c — every pick-one group says which is chosen (3A)', () => {
    const app = ready();
    withSession(app);
    const st = app.state();
    const F = (n) => app.fn(n);

    // Theme.
    st.theme = 'dark';
    const theme = pressed(F('renderSettingsDisplay')(), 'set-theme');
    t.ok(onePressed(theme), `Theme: one pressed (${theme.join(' ')})`);
    t.ok(theme.indexOf('dark:true') > -1, '… Dark');

    // The preset switcher sheet: two presets, the second in use.
    const firstPreset = st.itemPresets[0].id;
    F('createPreset')('Second');                   // the real path; makes it the one in use
    st.view = 'entry';
    st.presetSheetOpen = true;
    F('render')();
    const presets = pressed(html(app), 'preset-sheet-pick');
    t.ok(onePressed(presets), `Presets: one pressed (${presets.join(' ')})`);
    t.ok(presets.indexOf(st.activePresetId + ':true') > -1, '… the one in use');
    t.ok(presets.indexOf(firstPreset + ':false') > -1, '… the other not');
    st.presetSheetOpen = false;

    // Class I / II in the readings sheet.
    st.readingsSheetOpen = true;
    st.readingsSheetMode = 'pass';
    st.readingsDraft = { class: 'II', earth: '', insulation: '', leakage: '', polarity: false };
    F('render')();
    const cls = pressed(html(app), 'readings-set-class');
    t.ok(onePressed(cls), `Class: one pressed (${cls.join(' ')})`);
    t.ok(cls.indexOf('II:true') > -1, '… Class II');
    st.readingsSheetOpen = false;

    // Signature Left / Right, and the certificate colour themes.
    st.reportSettings.signature = 'data:image/png;base64,AAAA';
    st.reportSettings.signaturePosition = 'right';
    const page = F('renderSettingsReport')();
    const sig = pressed(page, 'signature-position');
    t.deepEq(sig, ['left:false', 'right:true'], 'Signature: Right pressed');
    st.reportSettings.signaturePosition = 'left';
    t.deepEq(pressed(F('renderSettingsReport')(), 'signature-position'), ['left:true', 'right:false'], '… and Left when Left');
    const themes = app.run('REPORT_COLOR_THEMES');
    st.reportSettings.headerColor = themes[1].header;
    st.reportSettings.accentColor = themes[1].accent;
    const chips = pressed(F('renderSettingsReport')(), 'report-theme');
    t.ok(onePressed(chips), `Colour themes: one pressed (${chips.join(' ')})`);
    t.ok(chips.indexOf(themes[1].id + ':true') > -1, '… the one matching the colours');
    st.reportSettings.headerColor = '#123456';
    const custom = pressed(F('renderSettingsReport')(), 'report-theme');
    t.ok(custom.length > 1 && custom.every(x => x.endsWith(':false')), 'own colours: none pressed');

    // The problem report: drawn…
    F('openBugSheet') && F('openBugSheet')();
    st.bugSheetOpen = true;
    const d = st.bugDraft;
    const bug = F('renderBugSheet')();
    for (const a of ['bug-set-type', 'bug-set-severity', 'bug-set-repro']) {
      const g = pressed(bug, a);
      t.ok(onePressed(g), `${a}: one pressed (${g.join(' ')})`);
    }
    t.ok(pressed(bug, 'bug-set-type').indexOf(d.type + ':true') > -1, '… the draft’s type');
    t.ok(/<span class="bug-option-dot" aria-hidden="true">/.test(bug), 'the ● / ○ glyph is hidden from VoiceOver (aria-pressed says it)');
    // …and repainted in place (the sheet never redraws — MAP rule 3).
    const types = app.run('BUG_REPORT_TYPES').map(x => x.id);
    const sevs = app.run('BUG_REPORT_SEVERITIES').map(x => x.id);
    const reps = app.run('BUG_REPORT_REPRO').map(x => x.id);
    const tb = types.map(id => btn(app, { 'data-action': 'bug-set-type', 'data-arg': id, 'aria-pressed': 'false' }));
    const sb = sevs.map(id => btn(app, { 'data-action': 'bug-set-severity', 'data-arg': id, 'aria-pressed': 'false' }));
    const rb = reps.map(id => btn(app, { 'data-action': 'bug-set-repro', 'data-arg': id, 'aria-pressed': 'false' }));
    F('setBugType')(types[types.length - 1]);
    t.deepEq(tb.map(b => b.getAttribute('aria-pressed')), types.map((x, i) => i === types.length - 1 ? 'true' : 'false'), 'type tapped: only it pressed, in place');
    F('setBugSeverity')(sevs[0]);
    t.deepEq(sb.map(b => b.getAttribute('aria-pressed')), sevs.map((x, i) => i === 0 ? 'true' : 'false'), 'severity tapped: only it pressed');
    F('setBugRepro')(reps[reps.length - 1]);
    t.deepEq(rb.map(b => b.getAttribute('aria-pressed')), reps.map((x, i) => i === reps.length - 1 ? 'true' : 'false'), '“make it happen again” tapped: only it pressed');
    tb.concat(sb, rb).forEach(b => b.remove());
  });

  /* ------------------------------------------------------------------ 67d */
  await t.group('67d — wiring (source)', () => {
    const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const rep = strip(read('report.js'));
    t.includes(rep, '    rebuild(action);\n  }', 'onQuickAdjust rebuilds naming the chip tapped');
    const rb = rep.slice(rep.indexOf('function rebuild(qaAction)'), rep.indexOf('async function onQuickAdjust'));
    t.ok(rb.indexOf('focusControl(') > rb.indexOf('renderPreviewView()'), 'rebuild: focus goes back AFTER the sheet is redrawn and wired');
    t.includes(rep, 'String(sheet.innerHTML).matchAll(/id="qa-chip-([a-z]+)"/g)', 'chips wired from the ids the markup drew');
    t.excludes(rep, "sheet.querySelectorAll('[data-qa]')", 'the old wiring is gone (no chip wired twice)');
    const fb = strip(read('feedback.js'));
    const si = fb.slice(fb.indexOf('function focusStandIn'), fb.indexOf('function focusControl'));
    t.includes(si, 'if (!el || _focusIsTextField(el)) return null;', 'focusStandIn refuses a text field');
  });

  /* ------------------------------------------------------------------ 67f */
  await t.group('67f — release: V129, What’s new, cache, changelog', () => {
    const app = freshApp();
    t.eq(app.run('APP_VERSION'), 'V129', 'APP_VERSION V129');
    t.eq(app.run('WELCOME_VERSION'), 'V129', 'What’s new rolled to V129');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v129';", 'cache key pat-v129');
    const core = read('render-core.js');
    t.includes(core, '<li><strong>Easier with VoiceOver.</strong>', 'V129’s What’s new');
    const sheet = core.slice(core.indexOf('<ul class="welcome-list sheet-scroll">'), core.indexOf('</ul>', core.indexOf('<ul class="welcome-list sheet-scroll">')));
    t.eq((sheet.match(/<li>/g) || []).length, 1, '… one line');
    t.excludes(core, '<li><strong>Safer after a long time away.</strong>', 'V128’s sheet copy gone');
    const help = read('render-help.js');
    const a = help.indexOf('<p><strong>V129</strong>'), b = help.indexOf('<p><strong>V128</strong>'), c = help.indexOf('<p><strong>V127</strong>');
    t.ok(a > -1 && b > a && c > b, 'About: V129, V128, V127');
    t.excludes(help, '<p><strong>V126</strong>', 'V126 rolled off');
    t.excludes(help, 'A smoother first start: on a new phone PATGo no longer reloads', 'V126’s line gone with it');
    t.includes(help, 'Easier with VoiceOver: + New job lands on the new job form', 'About: V129’s line');
    t.includes(help, 'Safer after a long time away: a phone that hasn', 'About: V128’s line still there');
    t.includes(help, 'Your plan, clearly: a signed-in cloud account sees', 'About: V127’s line still there');
  });
};
