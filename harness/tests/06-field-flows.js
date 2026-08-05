/* Standing test — core field flows
   (c) 2026 Peter Birchley. All rights reserved.

   Broad coverage of the paths an engineer actually uses on a job, so that a
   release which touches something unrelated still finds out if it broke them.
   Nothing here existed before: previous releases only tested what they changed. */

'use strict';

const t = require('../assert');
const { CANARY, freshApp, withInstrument, addInstrument, withSession, withItem, populated, confirmSheet } = require('../fixture');

module.exports = function run() {

  t.group('06a — a job needs a client or a site, not neither', () => {
    const app = freshApp();
    const before = app.state().sessions.length;
    withSession(app, { client: '', site: '' });
    t.eq(app.state().sessions.length, before, 'no job created with both blank');
    t.ok(app.state().newFormError, 'an inline message explains why');

    withSession(app, { client: 'Client Only', site: '' });
    t.eq(app.state().sessions.length, before + 1, 'client alone is enough');

    withSession(app, { client: '', site: 'Site Only' });
    t.eq(app.state().sessions.length, before + 2, 'site alone is enough (orphan site)');
  });

  t.group('06b — clients and sites auto-learn from a new job', () => {
    const app = freshApp();
    withSession(app, { client: 'Learned Client', site: 'Learned Site' });
    t.ok(app.state().clients.some(c => c.name === 'Learned Client'), 'the client was created');
    const client = app.state().clients.find(c => c.name === 'Learned Client');
    t.ok(app.state().sites.some(s => s.name === 'Learned Site' && s.clientId === client.id),
      'the site was created under that client');

    withSession(app, { client: 'Learned Client', site: 'Learned Site' });
    t.eq(app.state().clients.filter(c => c.name === 'Learned Client').length, 1,
      'a repeat job does not duplicate the client');
    t.eq(app.state().sites.filter(s => s.name === 'Learned Site').length, 1,
      'a repeat job does not duplicate the site');
  });

  t.group('06c — asset numbers advance and duplicates are detected', () => {
    const app = freshApp();
    withSession(app, { prefix: '', startNo: '1' });
    withItem(app, { assetNo: '1' });
    const sess = app.fn('activeSession')();
    t.eq(app.fn('nextAssetNo')(sess), '2', 'the next asset number advances');
    withItem(app, { assetNo: '2' });
    t.eq(app.fn('nextAssetNo')(sess), '3', 'and again');

    t.ok(app.fn('findDuplicateAssetIndex')(sess, '1', -1) >= 0, 'an existing asset number is flagged');
    t.eq(app.fn('findDuplicateAssetIndex')(sess, '99', -1), -1, 'an unused one is not');
  });

  t.group('06d — pass and fail both record a result', () => {
    const app = freshApp();
    withSession(app);
    const pass = withItem(app, { assetNo: 'P1', result: 'pass' });
    const fail = withItem(app, { assetNo: 'F1', result: 'fail' });
    t.eq(pass.result, 'pass', 'a pass is recorded');
    t.eq(fail.result, 'fail', 'a fail is recorded');
    const sess = app.fn('activeSession')();
    t.eq(sess.items.length, 2, 'both items are on the job');
    t.eq(sess.items.filter(i => i.result === 'fail').length, 1, 'one failure counted');
  });

  t.group('06e — item fields survive exactly as entered', () => {
    const app = freshApp();
    withSession(app);
    const item = withItem(app, {
      assetNo: 'A/123-4', location: "Bob's Office", itemType: 'Kettle & Urn',
      notes: 'Frayed, "borderline" — recheck', result: 'pass',
    });
    t.eq(item.assetNo, 'A/123-4', 'slashes and dashes survive');
    t.known(item.location === "Bob'S Office",
      "titleCase() capitalises the letter after an apostrophe: \"Bob's Office\" becomes \"Bob'S Office\"",
      'utils.js titleCase uses /\\b\\w/g and an apostrophe is a word boundary. Reaches locations, and so reaches certificates and CSV exports. Note it is CORRECT for names like O\'Brien, so the fix must skip only a trailing single letter (the possessive), not all apostrophes.');
    t.eq(item.itemType, 'Kettle & Urn', 'ampersands survive');
    t.eq(item.notes, 'Frayed, "borderline" — recheck', 'commas, quotes and em dashes survive');
  });

  t.group('06f — stats tally correctly', () => {
    const app = populated();
    const stats = app.fn('computeAppStats')();
    t.ok(stats, 'computeAppStats returns something');
    t.eq(stats.items, 3, 'three items counted');
    t.eq(stats.fails, 1, 'one failure counted');
  });

  t.group('06g — deleting a job archives its stats so the counter never drops', () => {
    // The V59 archive-bucket rule: Peter prunes jobs regularly, and a live-only
    // counter would go backwards on cleanup.
    const app = populated();
    const before = app.fn('computeAppStats')();
    const sess = app.fn('activeSession')();
    app.fn('deleteSession')(sess.id);
    confirmSheet(app, 'yes');
    const after = app.fn('computeAppStats')();
    t.eq(after.items, before.items, 'lifetime item count did not drop after deleting a job');
    t.eq(after.fails, before.fails, 'lifetime failure count did not drop either');
    t.eq(app.state().sessions.length, 0, 'the job really was deleted');
  });

  t.group('06h — CSV export has a header and one row per item', () => {
    const app = populated();
    const sess = app.fn('activeSession')();
    const csv = app.fn('buildCSV')(sess);
    const lines = csv.trim().split('\n');
    t.eq(lines.length, sess.items.length + 1, 'header plus one row per item');
    t.includes(lines[0], 'Asset ID', 'header names the asset column');
    t.includes(lines[0], 'Result', 'header names the result column');
    t.includes(csv, CANARY.asset, 'the asset number is exported');
    t.includes(csv, CANARY.location, 'the location is exported');
  });

  t.group('06i — CSV quotes fields that contain commas and quotes', () => {
    // Malformed quoting silently corrupts a customer's spreadsheet, and the
    // engineer finds out from the customer.
    const app = freshApp();
    withSession(app);
    withItem(app, { assetNo: '1', notes: 'Frayed, worn', location: 'Room "B"' });
    const csv = app.fn('buildCSV')(app.fn('activeSession')());
    t.includes(csv, '"Frayed, worn"', 'a comma-bearing field is quoted');
    t.includes(csv, '""B""', 'an embedded quote is doubled');

    const rows = app.fn('parseCSV')(csv);
    const header = rows[0];
    const row = rows[1];
    t.eq(row[header.indexOf('Notes')], 'Frayed, worn', 'it parses back to the original text');
  });

  t.group('06j — CSV resolves the instrument from the job, not the global', () => {
    // The same defect as 04b, at the export boundary where it actually reached
    // the customer.
    const app = freshApp();
    const st = app.state();
    // ⚠ The column flag is `visible`, not `enabled`, and the tester column ships
    // visible:false by default. Enabling the wrong property makes this whole
    // group assert against a CSV that never contained an instrument column —
    // green, and testing nothing.
    st.csvColumns = (st.csvColumns || []).map(c => ({ ...c, visible: true }));
    withInstrument(app, { make: 'Instrument ONE', calCertNo: 'CERT-1' });
    withSession(app, { site: 'Job A' });
    withItem(app, { assetNo: '1' });
    const sessA = app.fn('activeSession')();

    const second = addInstrument(app, { make: 'Instrument TWO', calCertNo: 'CERT-2' });
    app.fn('setActiveInstrument')(second.id);

    const csv = app.fn('buildCSV')(sessA);
    t.includes(csv, 'Instrument ONE', 'the exporting job carries its own instrument');
    t.excludes(csv, 'Instrument TWO', "today's instrument did not leak into an old job's export");
    t.excludes(csv, 'CERT-2', "today's calibration certificate did not leak either");
  });

  t.group('06k — export then import round-trips', () => {
    const app = populated();
    const sess = app.fn('activeSession')();
    const csv = app.fn('buildCSV')(sess);
    const parsed = app.fn('parseImportCSV')(csv);
    t.ok(parsed, 'parseImportCSV returned something');
    const incoming = parsed.session || parsed;
    const items = incoming.items || [];
    t.eq(items.length, sess.items.length, 'every item survives the round-trip');
    t.eq(items[0].assetNo, sess.items[0].assetNo, 'asset numbers survive');
    t.eq(items[0].location, sess.items[0].location, 'locations survive');
    t.eq(items[0].result, sess.items[0].result, 'results survive');
  });

  t.group('06l — a locked job is not silently editable', () => {
    const app = populated();
    const sess = app.fn('activeSession')();
    sess.locked = true;
    const before = sess.items.length;
    app.fn('saveItem')('pass', null);
    t.eq(app.fn('activeSession')().items.length, before, 'no item was added to a locked job');
  });

  t.group('06m — search and filtering find a job by client and by site', () => {
    const app = freshApp();
    withSession(app, { client: 'Findable Client', site: 'Findable Site' });
    withSession(app, { client: 'Other Client', site: 'Other Site' });
    const sorted = app.fn('sortedSessions')();
    t.eq(sorted.length, 2, 'both jobs are listed');
    t.eq(app.fn('filteredSessions')(sorted, 'Findable Client').length, 1, 'search by client name');
    t.eq(app.fn('filteredSessions')(sorted, 'Findable Site').length, 1, 'search by site name');
    t.eq(app.fn('filteredSessions')(sorted, 'ZZNOTHINGMATCHES').length, 0, 'a miss returns nothing');
  });
};
