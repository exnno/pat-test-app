/* Standing test — V116: the Classic emoji switch is retired
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked (12 Oct, Peter "1A 2A 3A"): 1A remove the
   temporary V115 "Classic emoji icons" switch; 2A delete its stored choice at
   startup; 3A its own small release (the Settings page split follows).

     53a  the switch is gone: not on Theme & Sound, not in its summary or the
          search words, not wired; icon() always draws a line icon, even when
          something sets the old flag.
     53b  the key is retired (V130 2A — was: deleted at startup, V116 2A): no
          app file names it, a save never writes it, a leftover changes nothing.
     53c  backups: a new backup has no iconsClassic; a V115 backup that carries
          it still restores, and the value is ignored.
     (53d, V116's release lines, moved on to 54e at V117.) */

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
  // V130 (2A): the start-up clean-up (V116 2A) and the key's name are retired.
  // What lasts: nothing in the app names it, nothing writes it, and a leftover
  // changes nothing (icon() still draws line icons — 53a).
  await t.group('53b — the retired switch key: named nowhere, never written', () => {
    const named = fs.readdirSync(APP_DIR).filter(f => f.endsWith('.js') || f === 'index.html')
      .filter(f => { const s = read(f); return s.includes('pat:iconsclassic') || s.includes('ICONS_CLASSIC_KEY'); });
    t.deepEq(named, [], 'no app file names the retired key');
    const app = freshApp();
    app.fn('save')();
    t.eq(app.storage.getItem('pat:iconsclassic'), null, 'a save never writes it');
    const old = freshApp({ localStorage: { 'pat:iconsclassic': '1' } });
    t.ok(old.fn('icon')('trash-2').startsWith('<svg class="ic ic-trash-2"'), 'a leftover from V115 changes nothing — line icons');
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
};
