/* Standing test — the bug report privacy rule
   (c) 2026 Peter Birchley. All rights reserved.

   bugreport.js states the rule: diagnostics carry COUNTS AND FLAGS ONLY. No
   client names, site names, asset numbers, locations, item types, notes or
   certificate numbers. A support email must never be a route for one customer's
   data to leave an engineer's phone.

   The method is a canary sweep: fill the app with strings that could not occur
   by coincidence, generate every outbound text, and assert none of them appear.
   This is deliberately BLIND to which field leaked — it catches a field added in
   a future release that nobody thought to test. */

'use strict';

const t = require('../assert');
const { CANARY, populated, freshApp, withInstrument, withSession, withItem } = require('../fixture');

/* Every string the rule forbids. state.engineer is NOT here — the engineer's own
   name is their own data, is already in the diagnostics by design, and is not a
   customer's information. */
const FORBIDDEN = [
  CANARY.client, CANARY.site, CANARY.location,
  CANARY.itemType, CANARY.notes, CANARY.asset, CANARY.certNo,
];

module.exports = function run() {

  t.group('05a — diagnostics leak no customer data', () => {
    const app = populated();
    const sess = app.fn('activeSession')();
    sess.certNo = CANARY.certNo;
    sess.notes  = CANARY.notes;

    const text = app.fn('diagnosticsText')();
    t.ok(text.length > 0, 'diagnostics produced some text');
    for (const bad of FORBIDDEN) {
      t.excludes(text, bad, `diagnostics omit ${bad}`);
    }
  });

  t.group('05b — the email body leaks no customer data', () => {
    const app = populated();
    const sess = app.fn('activeSession')();
    sess.certNo = CANARY.certNo;
    const st = app.state();
    // Whatever the user typed about the app itself is theirs to send.
    st.bugDraft.description = 'The pass button did nothing on the entry screen';

    const body = app.fn('bugBodyText')();
    const subject = app.fn('bugSubjectLine')();
    for (const bad of FORBIDDEN) {
      t.excludes(body, bad, `email body omits ${bad}`);
      t.excludes(subject, bad, `subject line omits ${bad}`);
    }
    t.includes(body, 'The pass button did nothing', "the user's own description IS included");
  });

  t.group('05c — diagnostics carry counts, so they still say something useful', () => {
    // A privacy test that passes because the output is empty is worthless. This
    // pins that the diagnostics remain diagnostic.
    const app = populated();
    const rows = app.fn('collectDiagnostics')();
    const keys = rows.map(r => r[0]);
    for (const k of ['APP', 'JOBS', 'ITEMS', 'STORAGE', 'FEATURES', 'LISTS', 'ERRORS']) {
      t.ok(keys.includes(k), `diagnostics include the ${k} row`);
    }
    const jobs = rows.find(r => r[0] === 'JOBS')[1];
    const items = rows.find(r => r[0] === 'ITEMS')[1];
    t.includes(jobs, '1', 'JOBS reports a count');
    t.includes(items, '3', 'ITEMS reports the real item count');
    t.includes(items, '1 failed', 'ITEMS reports the failure count');
  });

  t.group('05d — the LISTS row reports sizes, not contents', () => {
    // The subtle one: "types=12" is fine, "types=Kettle,Drill,…" is a leak. An
    // active preset NAME is deliberately included and is the engineer's own.
    const app = populated();
    const st = app.state();
    st.itemTypes = [CANARY.itemType, 'Kettle', 'Drill'];
    st.failReasons = [CANARY.notes, 'Damaged plug'];
    const rows = app.fn('collectDiagnostics')();
    const lists = rows.find(r => r[0] === 'LISTS')[1];
    t.includes(lists, 'types=3', 'list sizes are reported');
    t.excludes(lists, CANARY.itemType, 'item type names are not reported');
    t.excludes(lists, CANARY.notes, 'fail reason text is not reported');
  });

  t.group('05e — captured errors are never persisted', () => {
    // In-memory only, by design: the error path must never touch the storage
    // path, and must never reach a backup.
    const app = populated();
    app.fn('recordBugError')('error', 'Something broke in render', 'render-core.js', 42);
    t.includes(app.fn('bugErrorSummary')(), 'Something broke', 'the error was captured in memory');
    app.fn('save')();
    const dump = JSON.stringify(app.storage._snapshot());
    t.excludes(dump, 'Something broke in render', 'the error text is not in localStorage');
    const backup = JSON.stringify(app.fn('buildBackup')());
    t.excludes(backup, 'Something broke in render', 'the error text is not in a backup');
  });

  t.group('05f — an error message containing customer data still does not leak', () => {
    // A thrown error can quote a value. The summary must not carry it into an
    // email verbatim without the rule applying to it too.
    const app = populated();
    app.fn('recordBugError')('error', `Cannot read site ${CANARY.site}`, 'session.js', 1);
    const body = app.fn('bugBodyText')();
    t.excludes(body, CANARY.site, 'the site name is scrubbed out of the error text (D3)');
    t.includes(body, '[removed]', 'and is visibly marked as removed rather than silently dropped');
    t.includes(body, 'Cannot read site', 'while the diagnostic part of the message survives');
  });

  t.group('05g — the scrub covers every customer-data field, not just sites', () => {
    const app = populated();
    app.fn('recordBugError')('error', `failed on ${CANARY.client}`, 'clients.js', 1);
    t.excludes(app.fn('bugBodyText')(), CANARY.client, 'client names are scrubbed too');
  });

  t.group('05h — the scrub fails CLOSED, never open', () => {
    // If the scrub itself throws, the raw text must NOT be used as a fallback.
    // Losing a diagnostic string is survivable; leaking a client list is not.
    const app = populated();
    app.fn('recordBugError')('error', `broke on ${CANARY.site}`, 'session.js', 1);
    const st = app.state();
    Object.defineProperty(st, 'clients', { get() { throw new Error('boom'); } });
    let out;
    try { out = app.fn('bugErrorSummary')(); } catch (e) { out = 'THREW: ' + e.message; }
    t.excludes(out, CANARY.site, 'a broken scrub still does not emit the raw message');
  });
};
