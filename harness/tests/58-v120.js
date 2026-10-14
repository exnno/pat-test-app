/* Standing test — V120: screen-reader announcements and labels (Stage 12, part 3)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked (13 Oct, Peter "1A 2A 3A 4A 5A"):
   Everything is for VoiceOver users only — with VoiceOver off nothing on screen
   changes (Peter asked; confirmed in the round).
   1A  One permanent, invisible announcer (#sr-announcer, index.html, outside
       #app). Every pop-up message is spoken through it. The toast itself is
       hidden from VoiceOver so a phone that caught it is not told twice.
   2A  Logging or overwriting ONE item (saveItem, Copy last) speaks
       "Logged: Kettle, pass. Item 14." / "Updated: …". Spoken only.
       Batches already pop up "Added N items", which 1A now speaks.
   3A  Every field has a spoken name; the job-select ticks say Selected /
       Not selected (they were hidden from VoiceOver); the tour's example
       screens read as one picture.
   4A  Where VoiceOver lands after a redraw: backlogged (own release).
   5A  <html lang="en-GB">.

     58a  the announcer: in index.html, outside #app, polite + atomic, and
          hidden the way VoiceOver still reads (never display:none).
     58b  announce(): clears then speaks, so a repeat is spoken again; the
          newest wins; empty is ignored; builds the region if it is missing.
     58c  pop-ups are spoken through the announcer; the toast is aria-hidden.
     58d  logging one item speaks its line — saveItem append and edit, Copy
          last — through the REAL paths, plus the wording itself.
     58e  every field in every screen has a spoken name (sweep, comments
          stripped), the reminder selects carry their headings when drawn,
          the ticks and tour, and en-GB.
     58f  release: V120, What's new rolled, cache, changelog. (55e → 56e → 58f.)

   ⚠ 58e IS A SWEEP, LIKE 52c. A new <input>/<select>/<textarea> without a
   spoken name fails it: give it aria-label (what the visible label says), or
   aria-labelledby, or a <label for="its id">, or wrap it in its <label>. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR, scriptOrderFromIndex } = require('../load');
const { freshApp, withSession, withItem, tick } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const SPEAK_MS = 120;   // announce() sets its text 60ms after clearing

const spoken = (app) => {
  const el = app.doc.getElementById('sr-announcer');
  return el ? String(el.textContent || '') : null;
};

/* Every first-party file a phone runs, plus index.html. */
function appFiles() {
  return scriptOrderFromIndex()
    .filter(f => !/pdfjs|jspdf|autotable/i.test(f))
    .concat(['index.html']);
}

/* The 3A sweep. Returns the form fields with no spoken name. A field is named
   by aria-label / aria-labelledby, a <label for="its id"> anywhere in the app,
   or an open <label> wrapping it. Comment lines are skipped (the sources talk
   ABOUT "<select>"s). The tour's example inputs are covered by 58e's role=img
   check instead — they are part of a picture, not fields. */
function unnamedFields() {
  const src = {};
  for (const f of appFiles()) src[f] = read(f);
  const all = Object.values(src).join('\n');
  const fors = new Set([...all.matchAll(/for="([^"]+)"/g)].map(m => m[1]));
  const out = [];
  for (const [f, s] of Object.entries(src)) {
    for (const m of s.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
      const tag = m[0];
      const lineStart = s.lastIndexOf('\n', m.index) + 1;
      const before = s.slice(lineStart, m.index).trim();
      if (before.startsWith('//') || before.startsWith('*') || before.startsWith('/*')) continue;
      if (/type="(hidden|file|button|submit)"/.test(tag)) continue;
      if (/\baria-label="[^"]+"|\baria-labelledby="[^"]+"/.test(tag)) continue;
      if (/class="tour-input/.test(tag)) continue;
      const id = (tag.match(/\bid="([^"]+)"/) || [])[1];
      if (id && fors.has(id)) continue;
      const pre = s.slice(Math.max(0, m.index - 300), m.index);
      if (pre.lastIndexOf('<label') > pre.lastIndexOf('</label>')) continue;
      out.push(`${f}:${s.slice(0, m.index).split('\n').length} ${tag.slice(0, 70)}`);
    }
  }
  return out;
}

module.exports = async function run() {

  /* ------------------------------------------------------------------ 58a */
  await t.group('58a — the announcer: one live region, outside #app, read by VoiceOver', () => {
    const html = read('index.html');
    const tag = (html.match(/<div id="sr-announcer"[^>]*>/) || [''])[0];
    t.ok(tag, 'index.html has #sr-announcer');
    t.includes(tag, 'aria-live="polite"', 'polite: it waits for VoiceOver to finish');
    t.includes(tag, 'aria-atomic="true"', 'atomic: the whole line is read, not the changed bit');
    t.includes(tag, 'class="sr-only"', 'hidden visually (.sr-only)');
    // Outside #app — render() rebuilds #app wholesale (MAP rule 2), and a live
    // region only speaks reliably if it exists BEFORE its text changes.
    const appAt = html.indexOf('<div id="app"></div>');
    t.ok(appAt > -1 && html.indexOf('<div id="sr-announcer"') > appAt + '<div id="app"></div>'.length,
      'the announcer sits after #app closes, not inside it');
    const css = read('styles.css');
    const rule = (css.match(/\n\.sr-only \{([^}]*)\}/) || ['', ''])[1];
    t.ok(rule, '.sr-only rule exists');
    t.ok(/position:\s*absolute/.test(rule) && /clip/.test(rule), '.sr-only takes no space and draws nothing');
    t.ok(!/display:\s*none|visibility:\s*hidden/.test(rule), '.sr-only never display:none / visibility:hidden (VoiceOver skips those)');
  });

  /* ------------------------------------------------------------------ 58b */
  await t.group('58b — announce(): clears then speaks; repeats are spoken; newest wins', async () => {
    const app = freshApp();
    const announce = app.fn('announce');
    announce('Saved');
    t.eq(spoken(app), '', 'cleared at once (the text lands a moment later)');
    await tick(SPEAK_MS);
    t.eq(spoken(app), 'Saved', 'then the message');
    announce('Saved');
    t.eq(spoken(app), '', 'the same message again is cleared first…');
    await tick(SPEAK_MS);
    t.eq(spoken(app), 'Saved', '…so VoiceOver hears it again');
    announce('First');
    announce('Second');
    await tick(SPEAK_MS);
    t.eq(spoken(app), 'Second', 'two at once: the newest is spoken');
    announce('   ');
    announce(null);
    await tick(SPEAK_MS);
    t.eq(spoken(app), 'Second', 'nothing to say leaves the last line alone');

    // An old cached index.html without the announcer: built on the spot.
    const app2 = freshApp();
    app2.doc._byId.delete('sr-announcer');
    app2.fn('announce')('Logged');
    const made = app2.doc.body.children.find(c => c.id === 'sr-announcer');
    t.ok(made, 'missing announcer is built on body');
    t.eq(made && made.getAttribute('aria-live'), 'polite', 'built polite');
    t.eq(made && made.className, 'sr-only', 'built hidden');
    await tick(SPEAK_MS);
    t.eq(made && made.textContent, 'Logged', 'and it speaks');
  });

  /* ------------------------------------------------------------------ 58c */
  await t.group('58c — pop-ups are spoken through the announcer; the toast is hidden from VoiceOver', async () => {
    const app = freshApp();
    app.fn('showToast')('Up to 4 photos per item');
    const toast = app.doc.body.children.find(c => c.className && String(c.className).includes('toast'));
    t.ok(toast, 'the visible pop-up still appears');
    t.eq(toast && toast.textContent, 'Up to 4 photos per item', 'with its words');
    t.eq(toast && toast.getAttribute('aria-hidden'), 'true', 'the pop-up is aria-hidden (no double reading)');
    t.notOk(toast && toast.getAttribute('role'), 'and is no longer its own role="status"');
    await tick(SPEAK_MS);
    t.eq(spoken(app), 'Up to 4 photos per item', 'the announcer speaks it');
  });

  /* ------------------------------------------------------------------ 58d */
  await t.group('58d — logging one item says so (2A), through the real paths', async () => {
    const lo = freshApp().fn('loggedAnnouncement');
    t.eq(lo({ itemType: 'Kettle', result: 'pass' }, 14, false), 'Logged: Kettle, pass. Item 14.', 'the locked wording');
    t.eq(lo({ itemType: 'Kettle', result: 'fail' }, 3, true), 'Updated: Kettle, fail. Item 3.', 'an edit says Updated');
    t.eq(lo({ itemType: '', result: 'pass' }, 2, false), 'Logged: pass. Item 2.', 'no type: just the result');
    t.eq(lo({ itemType: 'Lead' }, 5, false), 'Logged: Lead. Item 5.', 'no result: just the type');

    const app = freshApp();
    withSession(app);
    withItem(app, { itemType: 'Kettle', result: 'pass' });
    await tick(SPEAK_MS);
    t.eq(spoken(app), 'Logged: Kettle, pass. Item 1.', 'PASS → spoken line, item 1');
    withItem(app, { itemType: 'Toaster', result: 'fail', assetNo: 'ZZ-2' });
    await tick(SPEAK_MS);
    t.eq(spoken(app), 'Logged: Toaster, fail. Item 2.', 'FAIL → spoken line, item 2');

    // Edit: put the cursor back on item 1 and save over it.
    app.state().cursor = 0;
    app.fn('loadFormForCursor')();
    withItem(app, { itemType: 'Kettle', result: 'fail', assetNo: 'ZZCANARY-0001' });
    await tick(SPEAK_MS);
    t.eq(spoken(app), 'Updated: Kettle, fail. Item 1.', 'an overwrite says Updated and its own number');

    // Copy last: a fresh item at the end, copying the last one's type and result.
    const st = app.state();
    st.cursor = app.fn('activeSession')().items.length;
    app.fn('loadFormForCursor')();
    st.form.location = 'Kitchen';
    st.form.assetNo = 'ZZ-3';
    app.fn('copyLastResult')();
    await tick(SPEAK_MS);
    t.eq(spoken(app), 'Logged: Toaster, fail. Item 3.', 'Copy last says what it logged');
  });

  /* ------------------------------------------------------------------ 58e */
  await t.group('58e — every field has a spoken name; ticks, tour and language (3A, 5A)', () => {
    const bad = unnamedFields();
    t.eq(bad.length, 0, `every input/select/textarea has a spoken name${bad.length ? ' — missing: ' + bad.slice(0, 5).join(' | ') : ''}`);
    // The sweep can see one: the asset box is the busiest field in the app.
    t.ok(/<input aria-label="Asset number" class="input-big" id="f-asset"/.test(read('render-core.js')), 'the asset box is named');

    // The reminder selects are named by the heading above them — drawn, so a
    // caller that forgets to pass it shows up empty.
    const app = freshApp();
    const html = app.fn('renderSettingsReminders')();
    const names = [...html.matchAll(/<select [^>]*aria-label="([^"]*)"/g)].map(m => m[1]);
    t.deepEq(names, ['Locked but not exported', 'Jobs still unlocked', 'Backup reminder'], 'the three reminder selects say their headings');

    // Selection ticks: the only sign of selection, so they are read.
    const rev = read('render-review.js');
    t.notOk(/class="jm-tick[^"]*"[^>]*aria-hidden="true"/.test(rev), 'no job-select tick is hidden from VoiceOver');
    t.eq((rev.match(/class="jm-tick[^`]*role="img" aria-label="\$\{(sel|on) \? 'Selected'/g) || []).length, 3, 'all three tick sites say Selected / Not selected');

    // The tour's example screens are pictures, not fields.
    t.includes(read('tour.js'), '<div class="tour-mock" role="img" aria-label="Example screen: ${escapeHTML(slide.title)}">', 'tour example screen reads as one picture');

    t.ok(/^<html lang="en-GB">$/m.test(read('index.html')), 'language is en-GB (British voice, UK dates)');
  });

  /* ------------------------------------------------------------------ 58f */
  await t.group('58f — release: V120, What’s new rolled, cache, changelog', () => {
    const app = freshApp();
    t.eq(app.run('APP_VERSION'), 'V120', 'APP_VERSION V120');
    t.eq(app.run('WELCOME_VERSION'), 'V120', 'What’s new rolled to V120');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v120';", 'cache key pat-v120');
    const core = read('render-core.js');
    t.includes(core, '<li><strong>PATGo works better with VoiceOver.</strong>', 'V120’s What’s new: VoiceOver line');
    t.includes(core, '<li><strong>Nothing changes on screen.</strong>', 'V120’s What’s new: nothing visible changes');
    t.excludes(core, 'Report Settings is now two pages', 'V117’s sheet copy gone');
    const help = read('render-help.js');
    const a = help.indexOf('<p><strong>V120</strong>'), b = help.indexOf('<p><strong>V119</strong>'), c = help.indexOf('<p><strong>V118</strong>');
    t.ok(a > -1 && b > a && c > b, 'About: V120, V119, V118');
    t.excludes(help, '<p><strong>V117</strong>', 'V117 rolled off');
    t.includes(help, 'Works better with VoiceOver: it says when', 'About: V120’s line');
    t.includes(help, 'Coloured words are easier to read', 'About: V119’s line still there');
    t.includes(help, 'Grey text is easier to read: hints', 'About: V118’s line still there');
  });
};
