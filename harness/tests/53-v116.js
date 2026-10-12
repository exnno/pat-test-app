/* Standing test — V116: the Classic emoji switch is retired
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked (12 Oct, Peter "1A 2A 3A"): 1A remove the
   temporary V115 "Classic emoji icons" switch; 2A delete its stored choice at
   startup; 3A its own small release (the Settings page split follows).

     53a  the switch is gone: not on Theme & Sound, not in its summary or the
          search words, not wired; icon() always draws a line icon, even when
          something sets the old flag.
     53b  2A: a phone that had the switch on or off keeps nothing behind after
          startup; the factory reset still classifies the name (43a rule).
     53c  backups: a new backup has no iconsClassic; a V115 backup that carries
          it still restores, and the value is ignored.
     53d  release: V116, What's new, cache, changelog. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const html = (app) => app.doc.getElementById('app').innerHTML;

function fire(app, type, el) {
  app.doc.getElementById('app').dispatchEvent({
    type, target: el, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
  });
}
function draw(app, v) { app.fn('setView')(v); app.fn('render')(); return html(app); }

module.exports = async function () {

  /* ------------------------------------------------------------------ 53a */
  await t.group('53a — the Classic emoji switch is gone; icon() always draws a line icon', () => {
    const app = freshApp();
    const p = draw(app, 'settingsDisplay');
    t.excludes(p, 'Classic emoji', 'Theme & Sound has no Classic emoji switch or note');
    t.excludes(p, 'icons-classic', '…and nothing wired to the old action');
    t.includes(p, 'Sound on pass / fail / copy', 'the rest of the page still draws');
    const hub = draw(app, 'settings');
    t.excludes(hub, 'Classic emoji', 'the Theme & Sound summary never says Classic emoji');
    const aliases = (read('data.js').match(/settingsDisplay:[^\n]*aliases: '([^']*)'/) || [])[1] || '';
    t.ok(aliases.length > 0 && !/classic|emoji/.test(aliases), 'search words no longer offer classic / emoji');
    // Through #app, the way the browser would: the old action does nothing.
    const el = app.doc.createElement('input');
    el.type = 'checkbox'; el.dataset.changeAction = 'icons-classic'; el.checked = true;
    let threw = null;
    try { fire(app, 'change', el); } catch (e) { threw = e; }
    t.eq(threw, null, 'the old switch action, if it ever arrived, is harmless');
    t.eq(app.storage.getItem('pat:iconsclassic'), null, '…and stores nothing');
    // Even with the old flag forced on, icon() draws the line icon.
    app.state().iconsClassic = true;
    const ic = app.fn('icon')('trash-2');
    t.ok(ic.startsWith('<svg class="ic ic-trash-2"'), 'icon() ignores any leftover flag — always a line icon');
    t.excludes(draw(app, 'settingsBackup'), 'ic-emoji', 'no emoji span on a screen with the flag forced on');
  });

  /* ------------------------------------------------------------------ 53b */
  await t.group('53b — 2A: the old stored choice is deleted at startup', () => {
    for (const v of ['1', '0', 'garbage']) {
      const app = freshApp({ localStorage: { 'pat:iconsclassic': v } });
      t.eq(app.storage.getItem('pat:iconsclassic'), null, `a phone that had '${v}' keeps nothing after startup`);
    }
    const app = freshApp({ localStorage: { 'pat:iconsclassic': '1' } });
    app.fn('save')();
    t.eq(app.storage.getItem('pat:iconsclassic'), null, 'and a save does not write it back');
    t.includes(read('reset.js'), "['ICONS_CLASSIC_KEY', ICONS_CLASSIC_KEY, 'settings'],", 'the factory reset still classifies the name (43a)');
  });

  /* ------------------------------------------------------------------ 53c */
  await t.group('53c — backups: none carry the switch; a V115 backup with it still restores', () => {
    const app = freshApp();
    const raw = app.fn('buildBackup')();
    t.notOk(Object.prototype.hasOwnProperty.call(raw, 'iconsClassic'), 'a new backup has no iconsClassic field');
    const b = JSON.parse(JSON.stringify(raw));
    b.iconsClassic = true;   // as a V115 phone with the switch on wrote it
    b.soundEnabled = true;   // a neighbouring setting, to prove the restore really ran
    let threw = null;
    try { app.fn('applyBackupData')(b); } catch (e) { threw = e; }
    t.eq(threw, null, 'the V115 backup restores without complaint');
    t.eq(app.state().soundEnabled, true, '…its other settings come across');
    t.eq(app.state().iconsClassic, undefined, '…and the retired switch is ignored');
    app.fn('save')();
    t.eq(app.storage.getItem('pat:iconsclassic'), null, 'nothing about it reaches this phone’s storage');
  });

  /* ------------------------------------------------------------------ 53d */
  await t.group('53d — release: V116, What’s new, cache, changelog', () => {
    const app = freshApp();
    t.eq(app.run('APP_VERSION'), 'V116', 'APP_VERSION V116');
    t.eq(app.run('WELCOME_VERSION'), 'V116', 'What’s new rolls for V116');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v116';", 'cache key pat-v116');
    const core = read('render-core.js');
    t.includes(core, '<li><strong>Line icons are here to stay.</strong>', 'What’s new: the switch has gone');
    t.includes(core, '<li><strong>Nothing else changes.</strong>', 'What’s new: nothing else changes');
    t.excludes(core, '<li><strong>Prefer the old look?</strong>', 'V115’s copy is gone');
    const help = read('render-help.js');
    const a = help.indexOf('<p><strong>V116</strong>'), b = help.indexOf('<p><strong>V115</strong>'), c = help.indexOf('<p><strong>V114</strong>');
    t.ok(a > -1 && b > a && c > b, 'About: V116, V115, V114');
    t.excludes(help, '<p><strong>V113</strong>', 'V113 rolled off');
  });
};
