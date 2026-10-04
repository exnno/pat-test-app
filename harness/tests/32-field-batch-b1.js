/* Standing test — V95 field batch B, part 1 (roadmap Stage 6; spec 1A 2B 3A
   4A 5B 6A 6C 7A): the fail → PASS notes sheet, fixing a description's
   spelling, the remedial actions section.
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID.
   • (1A, 2B) A FAIL with notes changed to PASS asks first. The fail reason is
     written INTO the notes by pickFailReason(), so a corrected mistake printed
     as a PASS saying "Damaged plug". Big button = remove it.
   • (3A, 4A) Settings → Item Description List is a tappable list; a fix can
     carry into items in UNLOCKED jobs and matching Quick Pick buttons.
   • (5B, 6A, 6C, 7A) Report settings → Remedial actions: an end section, every
     fail once — a list of those without a printed photo, then each with one.
     With photos on it replaces the photo pages. Optional action line.

   ⚠ buildReportDoc cannot run headlessly (see 04). The section is drawn onto a
   recording fake doc; the branch in buildReportDoc is source-guarded. */

'use strict';

const fs = require('fs');
const path = require('path');
const t = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, withSession, withItem, tick } = require('../fixture');

const byId = (app, id) => app.doc.getElementById(id);
const click = (app, id) => { const b = byId(app, id); if (!b) return false; b.click(); return true; };

// A job whose first item is a FAIL with the given notes, cursor on it.
function failOnForm(notes, o = {}) {
  const app = freshApp();
  const st = app.state();
  withSession(app, { site: 'ZZV95SITE' });
  withItem(app, { assetNo: 'ZZF1', itemType: 'Kettle', result: 'fail', notes });
  st.view = 'entry';
  st.cursor = 0;
  app.fn('loadFormForCursor')();
  app.__sheets = [];
  const realChoice = app.sandbox.openChoiceSheet;
  app.sandbox.openChoiceSheet = (opts) => { app.__sheets.push(opts); return realChoice(opts); };
  if (o.photos) {
    app.sandbox.photoCountForItemAll = () => o.photos;
    app.__swept = [];
    app.sandbox.photosDeleteForItem = (id) => { app.__swept.push(id); return Promise.resolve(); };
  }
  return app;
}
const item0 = (app) => app.fn('activeSession')().items[0];

// A jsPDF stand-in that records what is drawn.
function fakeDoc() {
  const d = {
    pages: 1, page: 1, texts: [], tables: [], images: 0, lastAutoTable: null,
    internal: { pageSize: { getWidth: () => 595, getHeight: () => 842 }, getNumberOfPages: () => d.pages },
    addPage() { d.pages++; d.page = d.pages; }, setPage(p) { d.page = p; },
    setFontSize() {}, setFont() {}, setTextColor() {}, setFillColor() {}, setDrawColor() {}, setLineWidth() {},
    rect() {}, addImage() { d.images++; },
    text(x) { d.texts.push([].concat(x).join(' ')); },
    splitTextToSize(s) { return [String(s)]; },
    autoTable(o) { d.tables.push(o); d.lastAutoTable = { finalY: 200 }; },
  };
  return d;
}

module.exports = async function run() {

  t.group('32a — the fail reason is found in the notes and taken out (1A)', () => {
    const app = freshApp();
    const strip = app.fn('stripFailReasons');
    const reason = app.state().failReasons[0];
    let r = strip(`By the sink — ${reason}`);
    t.ok(r.found, 'a reason after a note is recognised');
    t.eq(r.text, 'By the sink', 'and only the note is left');
    r = strip(reason.toUpperCase());
    t.ok(r.found && r.text === '', 'the reason alone, any case, leaves nothing');
    r = strip('Typed through Other');
    t.ok(!r.found && r.text === 'Typed through Other', 'text that is not a reason is left alone');
  });

  t.group('32b — FAIL with a reason → PASS asks; the big button removes it (1A)', () => {
    const reason = freshApp().state().failReasons[0];
    const app = failOnForm(reason);
    app.fn('passClicked')();
    t.eq(item0(app).result, 'fail', 'nothing is saved before the answer');
    const sh = app.__sheets[0];
    t.ok(sh && byId(app, 'choice-sheet-0') && sh.choices[0].style === 'primary', 'a sheet opens, first button primary');
    t.includes(sh ? sh.choices[0].label : '', 'Remove the fail reason', 'and it removes the fail reason');
    click(app, 'choice-sheet-0');
    t.eq(item0(app).result, 'pass', 'the item is now a PASS');
    t.eq(item0(app).notes, '', 'with the reason gone from its notes');
  });

  t.group('32c — Keep keeps the notes; Cancel changes nothing (1A)', () => {
    const reason = freshApp().state().failReasons[0];
    let app = failOnForm(`New plug fitted — ${reason}`);
    app.fn('passClicked')();
    click(app, 'choice-sheet-1');
    t.eq(item0(app).result, 'pass', 'Keep still makes it a PASS');
    t.eq(item0(app).notes, `New plug fitted — ${reason}`, 'with every word of the notes');
    app = failOnForm(reason);
    app.fn('passClicked')();
    click(app, 'choice-sheet-no');
    t.eq(item0(app).result, 'fail', 'Cancel leaves it a FAIL');
    t.eq(item0(app).notes, reason, 'and its notes as they were');
  });

  t.group('32d — notes that are not a reason still ask, offering to clear them (2B)', () => {
    const app = failOnForm('Cable chewed');
    app.fn('passClicked')();
    const sh = app.__sheets[0];
    t.ok(sh && sh.choices[0].label === 'Clear the notes' && sh.choices[0].style === 'primary', 'the big button clears them');
    click(app, 'choice-sheet-0');
    t.eq(item0(app).notes, '', 'cleared');
    t.eq(item0(app).result, 'pass', 'and passed');
  });

  t.group('32e — no notes, or notes already cleared on the form: no question (1A)', () => {
    let app = failOnForm('');
    app.fn('passClicked')();
    t.eq(item0(app).result, 'pass', 'a fail with no notes passes in one tap');
    app = failOnForm('Cable chewed');
    app.state().form.notes = '';
    app.fn('passClicked')();
    t.eq(item0(app).result, 'pass', 'the engineer cleared the box first: passes in one tap');
    t.eq(item0(app).notes, '', 'with the notes they left');
  });

  await t.group('32f — notes and photos: ONE sheet, and the photos still go (1A)', async () => {
    const reason = freshApp().state().failReasons[0];
    const app = failOnForm(reason, { photos: 2 });
    app.fn('passClicked')();
    t.ok(!byId(app, 'confirm-sheet-yes'), 'not the old photo-only confirm');
    t.eq(app.__sheets.length, 1, 'the notes sheet, once');
    t.includes(app.__sheets[0].message, '2 photos', 'naming the photos');
    click(app, 'choice-sheet-0');
    await tick();
    t.eq(app.__swept.length, 1, 'the photos are deleted once');
    t.eq(item0(app).result, 'pass', 'then the PASS is saved');
  });

  t.group('32g — fixing a spelling changes unlocked jobs and Quick Pick, not locked ones (3A, 4A)', () => {
    const app = freshApp();
    const st = app.state();
    withSession(app, { site: 'ZZLOCKED' });
    withItem(app, { assetNo: 'L1', itemType: 'Ketle', result: 'pass' });
    const locked = app.fn('activeSession')();
    locked.locked = true;
    withSession(app, { site: 'ZZOPENA' });
    withItem(app, { assetNo: 'A1', itemType: 'Ketle', result: 'pass' });
    withItem(app, { assetNo: 'A2', itemType: 'ketle', result: 'fail' });
    const a = app.fn('activeSession')();
    withSession(app, { site: 'ZZOPENB' });            // A is no longer the open job
    withItem(app, { assetNo: 'B1', itemType: 'Lead', result: 'pass' });
    app.fn('save')();
    st.itemPresets[0].items.push('Ketle');
    if (!st.descriptions.includes('Ketle')) st.descriptions.push('Ketle');
    const m = app.fn('descMatches')('Ketle');
    t.eq(m.items, 2, 'two items in unlocked jobs');
    t.eq(m.jobs, 1, 'in one job');
    t.eq(m.locked, 1, 'one in a locked job, counted apart');
    t.ok(m.buttons >= 1, 'and the Quick Pick button');
    app.fn('descRenameApply')('Ketle', 'Kettle', true);
    t.ok(a.items.every(i => i.itemType === 'Kettle'), 'the unlocked job is fixed');
    t.eq(locked.items[0].itemType, 'Ketle', 'the locked job is not');
    t.ok(!st.itemPresets[0].items.includes('Ketle'), 'the Quick Pick button is fixed');
    t.ok(!st.descriptions.some(d => d === 'Ketle'), 'and the list');
    const again = freshApp({ localStorage: app.storage._snapshot() });
    const back = again.state().sessions.find(s => String(s.site).endsWith('ZZOPENA'));
    t.ok(back && back.items.every(i => i.itemType === 'Kettle'), 'a job that was not open keeps the fix after a reopen (encoding cache)');
  });

  t.group('32h — "Only fix the list" leaves items alone; a fix onto an existing spelling merges (3A)', () => {
    const app = freshApp();
    const st = app.state();
    withSession(app, { site: 'ZZONLY' });
    withItem(app, { assetNo: 'O1', itemType: 'Ketle', result: 'pass' });
    st.descriptions = ['Ketle', 'Kettle', 'Lead'];
    app.fn('descRenameApply')('Ketle', 'Kettle', false);
    t.eq(app.fn('activeSession')().items[0].itemType, 'Ketle', 'the item keeps its spelling');
    t.deepEq(st.descriptions, ['Kettle', 'Lead'], 'no duplicate in the list');
  });

  t.group('32i — the list page: tap a row → the fix sheet → the question (3A)', () => {
    const app = freshApp();
    const st = app.state();
    withSession(app, { site: 'ZZROWS' });
    withItem(app, { assetNo: 'R1', itemType: 'Ketle', result: 'pass' });
    st.descriptions = ['Ketle'];
    st.view = 'settingsDescriptions';
    app.fn('render')();
    const h = app.doc.getElementById('app').innerHTML;
    t.includes(h, 'data-action="desc-edit"', 'rows are tappable');
    t.includes(h, 'data-action="desc-text-mode"', 'Edit as text is offered');
    app.fn('descEditOpen')('0');
    const inp = byId(app, 'name-sheet-input');
    t.ok(inp, 'the fix sheet opens');
    inp.value = 'Kettle';
    click(app, 'name-sheet-save');
    t.ok(byId(app, 'choice-sheet-0'), 'used on an item: it asks');
    click(app, 'choice-sheet-0');
    t.eq(app.fn('activeSession')().items[0].itemType, 'Kettle', 'Change them too fixes the item');
    st.descTextMode = true;
    app.fn('render')();
    t.includes(app.doc.getElementById('app').innerHTML, 'id="settings-descriptions"', 'text mode is the old box');
  });

  t.group('32j — remedial settings: off, action line on, and invisible to sync until used (5B, rule 36)', () => {
    const app = freshApp();
    const norm = app.fn('normaliseReportSettings');
    const DEF = app.run('REPORT_REMEDIAL_ACTION_DEFAULT');
    const n = norm({});
    t.eq(n.showRemedial, false, 'off by default');
    t.eq(n.remedialActionOn, true, 'the action line on by default');
    t.eq(n.remedialActionText, DEF, 'with the default wording');
    t.eq(norm({ remedialActionText: '   ' }).remedialActionText, DEF, 'blank wording falls back');
    t.eq(norm({ showRemedial: 'yes' }).showRemedial, false, 'only a real true switches it on');
    const proj = app.fn('_syncReportProjection');
    const hash = (x) => app.fn('syncHash')(app.fn('_syncCanonical')(x));
    // What a V94 phone hashes is its own projection, which never had these keys
    // — so the property is that an untouched V95 projection carries none of them.
    // (Comparing two V95 projections would be hollow: the projection normalises,
    // which puts the defaults straight back. M506 survived that version.)
    const p0 = proj(norm({}));
    t.ok(!('showRemedial' in p0) && !('remedialActionOn' in p0) && !('remedialActionText' in p0),
      'an untouched V95 report row carries none of the new fields — it hashes as on V94');
    t.eq(hash(proj(norm({ remedialActionText: app.run('REPORT_REMEDIAL_ACTION_DEFAULT') }))), hash(p0), 'nor does one holding the default wording');
    t.ok(app.fn('_syncIsDefaultReport')(norm({})), 'and still counts as nothing made');
    t.eq(proj(norm({ showRemedial: true })).showRemedial, true, 'switched on, it travels');
    t.eq(proj(norm({ remedialActionOn: false })).remedialActionOn, false, 'the line switched off travels');
  });

  t.group('32k — the section: list first, then photographed fails, each once (6A, 6C)', () => {
    const app = freshApp();
    const st = app.state();
    const DEF = app.run('REPORT_REMEDIAL_ACTION_DEFAULT');
    const sess = { id: 'ZZREM', items: [
      { id: 'i1', assetNo: 'P1', itemType: 'Kettle', location: 'Office', result: 'pass', notes: '' },
      { id: 'i2', assetNo: 'F1', itemType: 'Drill', location: 'Store', result: 'fail', notes: 'Damaged plug' },
      { id: 'i3', assetNo: 'F2', itemType: 'Lead', location: 'Store', result: 'fail', notes: 'Cut cable' },
    ] };
    st.reportSettings = app.fn('normaliseReportSettings')({ showRemedial: true });
    t.ok(app.fn('_remedialWanted')(sess), 'a job with fails gets the section');
    t.ok(!app.fn('_remedialWanted')({ items: [sess.items[0]] }), 'a job with none does not');
    const photo = { dataUrl: 'data:image/jpeg;base64,AA', w: 10, h: 10 };
    const data = { sessionId: 'ZZREM', groups: [{ item: sess.items[2], photos: [photo, photo] }], total: 2, printed: 2, omitted: 0, hitCap: false };
    let d = fakeDoc();
    app.fn('_appendRemedialPages')(d, sess, data, 40, [0, 0, 0]);
    t.ok(d.texts.includes('Remedial actions'), 'headed Remedial actions');
    t.ok(d.texts.some(x => x.includes('2 items failed testing.') && x.includes(DEF)), 'the count and the action line');
    t.eq(d.tables.length, 1, 'one list');
    const rows = d.tables[0].body;
    t.eq(rows.length, 1, 'holding only the fail with no photo');
    t.deepEq(rows[0], ['F1', 'Drill', 'Store', 'Damaged plug'], 'asset, description, location, reason');
    t.eq(d.images, 2, 'then the photographed fail with both photos');
    t.ok(!d.texts.includes('Photographic evidence'), 'and no separate photo pages');
    st.reportSettings.remedialActionOn = false;
    d = fakeDoc();
    app.fn('_appendRemedialPages')(d, sess, null, 40, [0, 0, 0]);
    t.ok(!d.texts.some(x => x.includes(DEF)), 'the action line can be switched off');
    t.eq(d.tables[0].body.length, 2, 'photos off: every fail is in the list');
    t.eq(d.images, 0, 'and no photos print');
  });

  t.group('32l — the report wiring (source guard) and the preview switch (7A)', () => {
    const src = fs.readFileSync(path.join(APP_DIR, 'report.js'), 'utf8');
    const build = src.slice(src.indexOf('function buildReportDoc'));
    const rem = build.indexOf('if (_remedialWanted(session))');
    const pho = build.indexOf('} else if (_photoAppendixWanted(_photos))');
    t.ok(rem !== -1 && pho > rem, 'the remedial section replaces the photo pages when wanted, else they print as before');
    t.includes(build, "_appendRemedialPages(doc, session, _photoAppendixWanted(_photos) ? _photos : null", 'photos ride along only when Photos is on');
    t.includes(src, "chip('remedial', rs.showRemedial === true, 'Remedial actions')", 'a preview switch');
    t.includes(src, "action === 'remedial'", 'that flips the setting');
  });

  t.group('32m — V95.1: the fix sheet deletes from the list, after a confirm; items keep it', () => {
    const app = freshApp();
    const st = app.state();
    withSession(app, { site: 'ZZDEL' });
    withItem(app, { assetNo: 'D1', itemType: 'Ketle', result: 'pass' });
    st.descriptions = ['Ketle', 'Lead'];
    st.view = 'settingsDescriptions';
    app.fn('render')();
    app.fn('descEditOpen')('0');
    t.ok(byId(app, 'name-sheet-delete'), 'the fix sheet has a Delete button');
    click(app, 'name-sheet-delete');
    t.deepEq(st.descriptions, ['Ketle', 'Lead'], 'nothing is deleted before the confirm');
    t.ok(click(app, 'confirm-sheet-yes'), 'it asks first');
    t.deepEq(st.descriptions, ['Lead'], 'confirmed: off the list');
    t.eq(app.fn('activeSession')().items[0].itemType, 'Ketle', 'the logged item keeps its description');
  });
};
