/* Standing test — V119.1 hotfix: the CSV Site column and long certificate details
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS HOTFIX DID. Locked (13 Oct, Peter "1B 2B 3A 4B"):
   Two bugs Peter found on V119, shipped as hotfix V119.1 (4B) — cache key only;
   APP_VERSION, WELCOME_VERSION and the About changelog stay V119's.
   1B  The CSV Site column is always just the site. With the Client column
       hidden (its default) it used to carry "Client — Site". The Client column
       is left as each user has it: hidden means no client in the export.
   2B  The PDF file name's {site} is unchanged (still client and site).
   3A  On the certificate, a long detail value wraps inside its own column.
       It used to run into the right-hand label, or off the page.

     57a  CSV: Site is only the site, Client hidden or shown, and a site-only job.
     57b  certificate: every detail value stays inside its column, rows grow to
          fit, and the totals line sits below a wrapped last row — measured with
          the REAL vendored jsPDF, not a stub.
     57c  certificate: ordinary-length details are drawn exactly as before.
     57d  release: hotfix cache key, version and What's new unchanged.

   ⚠ 57b/57c load the vendored jsPDF + autoTable into the sandbox. The stub
   environment deliberately has no PDF engine (see 04), so these two groups put
   one in themselves. A stub that "measures" text would let a wrong width pass;
   the real engine's getTextWidth is what the certificate actually uses. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, withSession, withItem } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');

/* ---- CSV helpers ---- */
function csvRows(app, sess) {
  const rows = app.fn('parseCSV')(app.fn('buildCSV')(sess));
  const header = rows[0];
  return { header, row: rows[1], col: (name) => rows[1][header.indexOf(name)] };
}
function setClientColumn(app, visible) {
  const st = app.state();
  st.csvColumns = st.csvColumns.map(c => c.id === 'client' ? { ...c, visible } : c);
}

/* ---- the real PDF engine, recording every text call ---- */
let ENGINE = null;
function engine() {
  if (ENGINE) return ENGINE;
  // jsPDF's UMD build reads atob/btoa off the global; node 22 has both.
  const ns = require(path.join(APP_DIR, 'jspdf.umd.min.js'));
  const prevWin = global.window;
  global.window = globalThis;
  global.window.jspdf = ns;
  require(path.join(APP_DIR, 'jspdf.plugin.autotable.min.js'));
  if (prevWin === undefined) delete global.window; else global.window = prevWin;
  ENGINE = ns;
  return ns;
}
function recordingNs(rec) {
  const ns = engine();
  const Real = ns.jsPDF;
  function Wrapped(...args) {
    const d = new Real(...args);
    rec.doc = d;
    const orig = d.text.bind(d);
    d.text = (txt, x, y, o) => {
      rec.calls.push({ lines: [].concat(txt).map(String), x, y, o: o || {}, size: d.getFontSize() });
      return orig(txt, x, y, o);
    };
    return d;
  }
  return Object.assign({}, ns, { jsPDF: Wrapped });
}
/* Build a certificate for a fresh job and return what was drawn. */
function certificate({ client, site, engineer, certNo }) {
  const app = freshApp();
  const st = app.state();
  const rec = { calls: [], doc: null };
  app.sandbox.jspdf = recordingNs(rec);
  withSession(app, { client, site, engineer });
  withItem(app, { assetNo: '0001', itemType: 'Kettle', location: 'Kitchen', notes: '' });
  const sess = app.fn('activeSession')();
  if (certNo) { st.reportSettings.certEnabled = true; sess.certNo = certNo; }
  app.fn('buildReportDoc')(sess, null);
  const d = rec.doc;
  const pageW = d.internal.pageSize.getWidth();
  const margin = 40;
  const colGap = (pageW - margin * 2) / 2;
  // The details block: a bold "Label:" followed by its value, until the totals.
  const iTotals = rec.calls.findIndex(c => c.lines[0].startsWith('Items tested:'));
  const block = rec.calls.slice(0, iTotals);
  const details = [];
  for (let i = 0; i < block.length - 1; i++) {
    const lab = block[i];
    if (lab.lines.length === 1 && /^[A-Z][A-Za-z ]+:$/.test(lab.lines[0]) && (lab.x === margin || Math.abs(lab.x - (margin + colGap)) < 0.01)) {
      const val = block[i + 1];
      const col = lab.x === margin ? 0 : 1;
      details.push({ label: lab.lines[0], col, x: val.x, y: val.y, lines: val.lines,
        colEnd: col === 0 ? margin + colGap : pageW - margin, size: val.size });
      i++;
    }
  }
  const width = (s, size) => { d.setFontSize(size); d.setFont(undefined, 'normal'); return d.getTextWidth(s); };
  return { app, details, totals: rec.calls[iTotals], width, labels: block.filter(c => /:$/.test(c.lines[0])) };
}

const LONG_CLIENT = 'The Very Long Named Client Holdings Group Limited Partnership';
const LONG_SITE   = 'Unit 14B Riverside Industrial Estate, West Bridgford Distribution Centre North Wing';
const LONG_ENG    = 'Peter Birchley on behalf of Northern Regional Electrical Safety Services';

module.exports = async function run() {

  /* ------------------------------------------------------------------ 57a */
  await t.group('57a — CSV: the Site column is just the site (1B)', () => {
    const app = freshApp();
    withSession(app, { client: 'ZZCLIENTA', site: 'ZZSITEA' });
    withItem(app, { assetNo: '1' });
    const sess = app.fn('activeSession')();
    t.includes(sess.site, 'ZZCLIENTA', 'the job’s stored site holds the client too (the snapshot)');

    // Client column hidden — the default, and where the bug was.
    const clientDefault = app.state().csvColumns.find(c => c.id === 'client');
    t.eq(clientDefault && clientDefault.visible, false, 'the Client column is still hidden by default (1B: left as it is)');
    let r = csvRows(app, sess);
    t.eq(r.col('Site'), 'ZZSITEA', 'Client hidden: Site is just the site');
    t.excludes(app.fn('buildCSV')(sess), 'ZZCLIENTA', 'and the client is not in the export at all');
    t.eq(r.header.indexOf('Client'), -1, 'no Client column');

    // Client column shown.
    setClientColumn(app, true);
    r = csvRows(app, sess);
    t.eq(r.col('Site'), 'ZZSITEA', 'Client shown: Site is still just the site');
    t.eq(r.col('Client'), 'ZZCLIENTA', 'and Client carries the client');
    const back = app.fn('parseImportCSV')(app.fn('buildCSV')(sess));
    const incoming = back && (back.session || back);
    t.eq(incoming && incoming.site, sess.site, 'with both columns, an import rebuilds "Client — Site" exactly');

    // A site-only job.
    const app2 = freshApp();
    withSession(app2, { client: '', site: 'ZZSITEONLY' });
    withItem(app2, { assetNo: '2' });
    t.eq(csvRows(app2, app2.fn('activeSession')()).col('Site'), 'ZZSITEONLY', 'a job with no client: Site is the site');
    // The Client column is untouched by an export.
    t.eq(app2.state().csvColumns.find(c => c.id === 'client').visible, false, 'exporting never switches the Client column on');
  });

  /* ------------------------------------------------------------------ 57b */
  await t.group('57b — certificate: long details wrap inside their own column (3A)', () => {
    const cases = [
      ['long client (left column)', { client: LONG_CLIENT, site: 'Depot', engineer: 'ZZENG' }],
      ['long site (right column)', { client: 'ZZC', site: LONG_SITE, engineer: 'ZZENG' }],
      ['long site, no client (left column)', { client: '', site: LONG_SITE, engineer: 'ZZENG' }],
      ['long engineer (last row)', { client: 'ZZC', site: 'ZZS', engineer: LONG_ENG }],
    ];
    for (const [name, o] of cases) {
      const c = certificate(o);
      t.ok(c.details.length >= 3, `${name}: the details block was found (${c.details.map(d => d.label).join(' ')})`);
      const wrapped = c.details.filter(d => d.lines.length > 1);
      t.ok(wrapped.length >= 1, `${name}: the long value wrapped onto more than one line`);
      // Every line of every value ends inside its column.
      const over = [];
      for (const d of c.details) for (const line of d.lines) {
        const end = d.x + c.width(line, d.size);
        if (end > d.colEnd + 0.5) over.push(`${d.label} "${line}" ends at ${end.toFixed(1)} > ${d.colEnd.toFixed(1)}`);
      }
      t.deepEq(over, [], `${name}: no value runs past its column`);
      // The next row's labels sit below the last line of a wrapped value.
      for (const d of wrapped) {
        const lastLineY = d.y + (d.lines.length - 1) * 12;
        const below = c.labels.filter(l => l.y > d.y);
        const next = below.length ? Math.min(...below.map(l => l.y)) : c.totals.y;
        t.ok(next >= lastLineY + 12, `${name}: what follows ${d.label} is below its last line (${next} ≥ ${lastLineY + 12})`);
      }
      t.ok(c.totals.y > Math.max(...c.details.map(d => d.y + (d.lines.length - 1) * 12)) + 12,
        `${name}: the totals line is below every detail line`);
    }
  });

  /* ------------------------------------------------------------------ 57c */
  await t.group('57c — certificate: ordinary details are drawn exactly as before', () => {
    const c = certificate({ client: 'Acme Ltd', site: 'Head Office', engineer: 'Peter Birchley', certNo: 'ZZ-0001' });
    t.ok(c.details.every(d => d.lines.length === 1), 'every short value is one line');
    const rows = [...new Set(c.details.map(d => d.y))].sort((a, b) => a - b);
    t.ok(rows.length >= 2, 'more than one row of details');
    const steps = rows.slice(1).map((y, i) => y - rows[i]);
    t.deepEq(steps, steps.map(() => 15), 'rows are 15pt apart, as before');
    const last = rows[rows.length - 1];
    const odd = c.details.length % 2 === 1;
    t.eq(c.totals.y, last + (odd ? 15 : 0) + 22, 'the totals line sits where it always did');
    const certVal = c.details.find(d => d.label === 'Certificate no:');
    t.ok(certVal && certVal.col === 0, 'the certificate number still comes first, left');
  });

  /* ------------------------------------------------------------------ 57d */
  await t.group('57d — release: hotfix V119.1 (cache key only)', () => {
    const app = freshApp();
    t.eq(app.run('APP_VERSION'), 'V119', 'APP_VERSION stays V119 (hotfix)');
    t.eq(app.run('WELCOME_VERSION'), 'V117', 'What’s new not rolled');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v119-1';", 'cache key pat-v119-1');
    // 2B: the file name's {site} is left alone — still the whole snapshot.
    t.includes(read('report.js'), "'{site}': session.site || session.name || '',", 'file name {site} unchanged (2B)');
  });
};
