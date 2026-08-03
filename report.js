/*!
 * PATGo PWA — report.js (PDF reports)
 * v30 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 *
 * V30: builds a one-session "Portable Appliance Test Report" PDF using the
 * vendored jsPDF + jspdf-autotable (both MIT — see THIRD-PARTY-LICENSES.txt).
 * Register-tier report (Q1=A): Asset ID / Description / Location / Result per
 * item, plus header branding, totals, optional instrument/calibration/retest,
 * and a declaration line. NO measured readings yet — the table is built from a
 * COLUMN LIST so reading/class columns (V31) drop in without touching layout.
 *
 * Reuses field resolution from elsewhere so a report and a CSV of the same
 * session always agree: splitSiteSnapshot (clients.js), csvResultLabel +
 * formatDate (utils.js).
 *
 * Entry point: produceReport(sessionId) — gated by reportSettings.enabled at the
 * dispatch layer. Builds the doc, then opens a preview modal (Q5=C) from which
 * the user shares (iOS share sheet) or downloads.
 */

// ---- jsPDF accessor. In the browser UMD build, jsPDF lives at window.jspdf. ----
function getJsPDF() {
  const ns = (typeof window !== 'undefined' && window.jspdf) ? window.jspdf
           : (typeof jspdf !== 'undefined' ? jspdf : null);
  return ns && ns.jsPDF ? ns.jsPDF : null;
}

// ---- v55: WinAnsi-safe text for the PDF. jsPDF's standard Helvetica font uses
// single-byte WinAnsi encoding, which has no glyph for Ω (U+03A9), ≥ (U+2265) or
// ✓ (U+2713) — they previously rendered as ©, e and a fallback mark on the
// certificate. We don't ship a Unicode font (it would bloat the offline bundle),
// so we swap these few codepoints for plain-ASCII words/operators in the PDF
// layer ONLY. The on-screen sheet and the CSV keep the proper Unicode symbols.
function pdfSafe(v) {
  return String(v == null ? '' : v)
    .replace(/MΩ/g, 'MOhms')
    .replace(/Ω/g, 'Ohms')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/✓/g, 'Yes');
}

// ---- v51: LAZY ENGINE LOAD ------------------------------------------------
// The two vendored jsPDF files (jspdf.umd.min.js + the autotable plugin, ~350 KB)
// used to load synchronously in index.html's <script> chain on EVERY cold start,
// even though they're only needed when a PDF report is produced. v51 removed those
// two <script> tags; the files are still in sw.js's ASSETS precache (so they're
// downloaded at SW install and served from cache — reports work fully offline from
// first install, no "connect once" caveat). This loader injects them on first
// report, mirroring the proven PDF.js lazy-load in pdfpreview.js.
//
// Order matters: jspdf.umd.min.js must run first (defines window.jspdf), THEN the
// autotable plugin (self-applies onto it). One-shot shared promise so concurrent
// or repeat produce-report taps share a single load. Rejects cleanly so the caller
// can show a failure message rather than hang.
const REPORT_JSPDF_SRC = './jspdf.umd.min.js';
const REPORT_AUTOTABLE_SRC = './jspdf.plugin.autotable.min.js';
let _reportEngineLoadPromise = null;

// True once jsPDF AND its autotable plugin are live. autoTable attaches either as
// a prototype method (doc.autoTable) or onto the jspdf namespace; the surest
// parse-time signal that the plugin self-applied is jspdf.jsPDF.API.autoTable.
function reportEngineReady() {
  const ns = (typeof window !== 'undefined' && window.jspdf) ? window.jspdf
           : (typeof jspdf !== 'undefined' ? jspdf : null);
  if (!ns || !ns.jsPDF) return false;
  const proto = ns.jsPDF.API;
  return !!(proto && typeof proto.autoTable === 'function')
      || typeof ns.autoTable === 'function';
}

// Inject one <script> and resolve on load / reject on error. Won't double-add if a
// prior attempt already injected the same tag.
function _injectScriptOnce(src, marker) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-' + marker + '="1"]');
    if (existing) { resolve(true); return; }
    const s = document.createElement('script');
    s.src = src;
    s.async = false; // preserve execution order across the two files
    s.setAttribute('data-' + marker, '1');
    s.onload = () => resolve(true);
    s.onerror = () => {
      if (s.parentNode) s.parentNode.removeChild(s);
      reject(new Error('failed to load ' + src));
    };
    document.head.appendChild(s);
  });
}

// Load the report engine (jsPDF then autotable) once. Resolves true when both are
// live. Rejects if either script fails (e.g. corrupt cache) so produceReport can
// surface a clear message and allow a retry.
function loadReportEngine() {
  if (reportEngineReady()) return Promise.resolve(true);
  if (_reportEngineLoadPromise) return _reportEngineLoadPromise;

  _reportEngineLoadPromise = _injectScriptOnce(REPORT_JSPDF_SRC, 'jspdf')
    .then(() => _injectScriptOnce(REPORT_AUTOTABLE_SRC, 'jspdfat'))
    .then(() => {
      if (!reportEngineReady()) {
        throw new Error('report engine globals missing after load');
      }
      return true;
    })
    .catch((e) => {
      _reportEngineLoadPromise = null; // allow a later retry (e.g. after a reload)
      throw e;
    });
  return _reportEngineLoadPromise;
}

// Run an autotable call against a doc, tolerant of both the v5 method form
// (doc.autoTable, present after the UMD plugin self-applies) and the functional
// form autoTable(doc, opts).
function runAutoTable(doc, opts) {
  if (typeof doc.autoTable === 'function') { doc.autoTable(opts); return; }
  const ns = (typeof window !== 'undefined' && window.jspdf) ? window.jspdf : null;
  const fn = ns && (ns.autoTable || (ns.default && ns.default.autoTable));
  if (typeof fn === 'function') { fn(doc, opts); return; }
  throw new Error('autoTable unavailable');
}

// Add `months` calendar months to an ISO yyyy-mm-dd date; return formatted DD/MM/YYYY.
function addMonthsFormatted(iso, months) {
  if (!iso || !Number.isFinite(months)) return '';
  const parts = String(iso).split('-');
  if (parts.length !== 3) return '';
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + months);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// Build the jsPDF document for a session. Returns the doc, or throws if the
// libraries failed to load (caller surfaces a friendly message).
function buildReportDoc(session) {
  const JsPDF = getJsPDF();
  if (!JsPDF) throw new Error('PDF engine not loaded');
  const rs = state.reportSettings;

  // v54: decide which reading columns this certificate needs BEFORE creating the
  // doc, because the column count drives the page ORIENTATION (a detailed Class I
  // job with every reading + notes is too wide for portrait). Reading columns are
  // gated three ways (matching the CSV's emit rule): the feature must be ON
  // (state.readingsEnabled), the report toggle must be ON (rs.showReadings), and
  // some item must actually carry that reading — so a clean or readings-off job
  // is byte-identical to v53 and stays portrait. polarity is Class I only and
  // prints only when some Class I item has it ticked.
  const readingsOn = !!state.readingsEnabled && rs.showReadings !== false;
  const readingCols = [];
  if (readingsOn) {
    const has = (pred) => session.items.some(it => it.readings && pred(it.readings));
    if (has(r => r.class)) readingCols.push({ header: 'Class', value: it => (it.readings && it.readings.class) || '' });
    if (has(r => r.earth)) readingCols.push({ header: 'Earth Continuity (Ω)', value: it => (it.readings && it.readings.earth) || '' });
    if (has(r => r.insulation)) readingCols.push({ header: 'Insulation Resistance (MΩ)', value: it => (it.readings && it.readings.insulation) || '' });
    if (has(r => r.leakage)) readingCols.push({ header: 'Leakage (mA)', value: it => (it.readings && it.readings.leakage) || '' });
    // Polarity (Class I only): a ticked box prints '✓', otherwise blank. The
    // column appears only when at least one item actually recorded a tick.
    if (has(r => r.polarity === true)) readingCols.push({ header: 'Polarity', value: it => (it.readings && it.readings.polarity === true) ? '✓' : '' });
  }

  // Base columns are Asset/Description/Location/Result (+ Notes if any). Once the
  // reading columns push the total past a comfortable portrait count, render this
  // certificate in landscape so nothing is cramped. Threshold of 6: the 4 base +
  // Notes sit fine in portrait; any reading column beyond that tips to landscape.
  const anyNotes = session.items.some(it => (it.notes || '').trim());
  const baseColCount = 4 + (anyNotes ? 1 : 0);
  const totalColCount = baseColCount + readingCols.length;
  const orientation = (totalColCount > 6) ? 'landscape' : 'portrait';

  const doc = new JsPDF({ unit: 'pt', format: 'a4', orientation, compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  // ----- Header band: logo (left) + company (right) -----
  let headerBottom = y;
  if (rs.logo) {
    try {
      // Logo is a PNG data URL, downscaled on upload. Render at up to 120x60pt,
      // preserving aspect via jsPDF's own measurement where possible.
      const props = doc.getImageProperties ? doc.getImageProperties(rs.logo) : null;
      let w = 120, h = 60;
      if (props && props.width && props.height) {
        const ratio = props.width / props.height;
        if (ratio >= 2) { w = 120; h = 120 / ratio; }
        else { h = 60; w = 60 * ratio; }
      }
      doc.addImage(rs.logo, 'PNG', margin, y, w, h);
      headerBottom = Math.max(headerBottom, y + h);
    } catch (e) { /* a bad logo never blocks the report */ }
  }
  if (rs.companyName || rs.companyAddress) {
    doc.setFontSize(13); doc.setFont(undefined, 'bold');
    let ty = y + 12;
    if (rs.companyName) { doc.text(String(rs.companyName), pageW - margin, ty, { align: 'right' }); ty += 16; }
    doc.setFontSize(9); doc.setFont(undefined, 'normal');
    if (rs.companyAddress) {
      String(rs.companyAddress).split('\n').forEach(line => {
        if (line.trim()) { doc.text(line.trim(), pageW - margin, ty, { align: 'right' }); ty += 12; }
      });
    }
    headerBottom = Math.max(headerBottom, ty);
  }
  y = headerBottom + 14;

  // ----- Title -----
  doc.setFontSize(17); doc.setFont(undefined, 'bold');
  doc.text(String(rs.reportTitle || 'Portable Appliance Test Report'), margin, y);
  y += 22;
  // v35: title underline uses the accent colour (was hardcoded grey 200).
  const accentRgb = hexToRgb(rs.accentColor, [200, 200, 200]);
  doc.setDrawColor(accentRgb[0], accentRgb[1], accentRgb[2]);
  doc.line(margin, y, pageW - margin, y);
  y += 18;

  // ----- Job details (client / site / date / engineer) -----
  const parts = splitSiteSnapshot(session.site);
  const client = parts.client;
  const site = parts.site || session.site || session.name || '';
  doc.setFontSize(10); doc.setFont(undefined, 'normal');

  const detailPairs = [];
  // v36: certificate number (when enabled + stamped on the session). Shown first
  // for prominence/traceability.
  if (rs.certEnabled && session.certNo) detailPairs.push(['Certificate no', session.certNo]);
  if (client) detailPairs.push(['Client', client]);
  detailPairs.push(['Site', site]);
  detailPairs.push(['Test date', formatDate(session.date)]);
  if (rs.showEngineer && session.engineer) detailPairs.push(['Engineer', session.engineer]);
  if (rs.showInstrument) {
    const instr = [state.testerMake, state.testerModel].filter(Boolean).join(' ').trim();
    if (instr) detailPairs.push(['Test instrument', instr]);
  }
  if (rs.showCalibration) {
    if (state.calDate) detailPairs.push(['Tester calibrated', formatDate(state.calDate)]);
    if (state.calCertNo) detailPairs.push(['Calibration cert', state.calCertNo]);
    if (state.calDue) detailPairs.push(['Calibration due', formatDate(state.calDue)]);
  }
  if (rs.retestEnabled && rs.retestMonths) {
    const rd = addMonthsFormatted(session.date, rs.retestMonths);
    if (rd) detailPairs.push(['Recommended retest', rd]);
  }
  // v61: testing time. Gated TWO ways, and both matter:
  //   1. rs.showDuration — opt-in, default OFF (decision Q11B). The certificate
  //      is client-facing and "this job took 3h 12m" tells a customer how fast
  //      you worked, so it is never added to anyone's output without them asking.
  //   2. sessionDuration() returning non-null — a job with fewer than two
  //      timestamped items (any pre-v61 job logged with Item Timestamps off) has
  //      no figure, and the row is simply omitted rather than printing "0m".
  // So a report from a user who hasn't opted in is byte-identical to v60.
  if (rs.showDuration === true) {
    const dur = sessionDuration(session);
    if (dur) detailPairs.push(['Testing time', dur.text]);
  }

  // Two-column label/value layout. The value is placed just after the label's
  // measured width (min 96pt) so a long label like "Recommended retest" never
  // overlaps its value, while short labels keep the values aligned.
  const colGap = (pageW - margin * 2) / 2;
  detailPairs.forEach((pair, i) => {
    const col = i % 2;
    const x = margin + col * colGap;
    if (col === 0 && i > 0) y += 15;
    const label = pair[0] + ':';
    doc.setFont(undefined, 'bold');
    doc.text(label, x, y);
    const labelW = doc.getTextWidth(label);
    const valX = x + Math.max(96, labelW + 8);
    doc.setFont(undefined, 'normal');
    doc.text(String(pair[1] || ''), valX, y);
  });
  if (detailPairs.length % 2 === 1) y += 15;
  y += 22;

  // ----- Totals -----
  const tested = session.items.length;
  const failed = session.items.filter(i => i.result === 'fail').length;
  const passed = tested - failed;
  // v35: totals label uses the header colour for a tie-in with the table band
  // (kept dark/legible since it's text on white, not a fill).
  const headerRgb = hexToRgb(rs.headerColor, [40, 40, 40]);
  doc.setFont(undefined, 'bold'); doc.setFontSize(11);
  doc.setTextColor(headerRgb[0], headerRgb[1], headerRgb[2]);
  doc.text(`Items tested: ${tested}    Passed: ${passed}    Failed: ${failed}`, margin, y);
  doc.setTextColor(0);
  y += 8;

  // ----- v36: Job notes (printed only when non-empty) -----
  if (session.notes && String(session.notes).trim()) {
    y += 14;
    doc.setFont(undefined, 'bold'); doc.setFontSize(10);
    doc.text('Notes', margin, y);
    y += 14;
    doc.setFont(undefined, 'normal'); doc.setFontSize(9); doc.setTextColor(60);
    const wrapped = doc.splitTextToSize(String(session.notes).trim(), pageW - margin * 2);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 12;
    doc.setTextColor(0);
    y += 6;
  }

  // ----- Appliance register table -----
  // Column model (architected for V31): each col = { header, value(item) }.
  // v54: reading columns (Class / Earth / Insulation / Leakage / Polarity) are
  // computed at the top of buildReportDoc (they drive orientation) and spliced
  // in here, after Result and before Notes so Notes stays rightmost. Each was
  // already emit-only-if-used, so an empty column never appears.
  const columns = [
    { header: 'Asset ID',    value: it => it.assetNo || '' },
    { header: 'Description',  value: it => it.itemType || '' },
    { header: 'Location',     value: it => it.location || '' },
    { header: 'Result',       value: it => csvResultLabel(it.result) }
  ];
  readingCols.forEach(c => columns.push(c));
  // Optional notes column — included when any item has notes, so a clean job
  // doesn't carry an empty column but a job with defect notes shows them.
  // (anyNotes computed above alongside the orientation decision.)
  if (anyNotes) columns.push({ header: 'Notes', value: it => it.notes || '' });

  const rows = rs.showFails ? session.items : session.items.filter(i => i.result !== 'fail');
  const body = rows.map(it => columns.map(c => pdfSafe(c.value(it))));

  // v54: keep the reading columns compact and centred so the long headers
  // (e.g. "Insulation Resistance (MΩ)") wrap rather than steal width from
  // Description/Location. The reading columns occupy indices 4..(4+n-1); Class
  // and Polarity are the narrowest, the numeric ones a touch wider. autoTable
  // wraps the header text within these caps. Base columns are left to flex.
  const columnStyles = {};
  readingCols.forEach((c, i) => {
    const idx = 4 + i;
    const narrow = (c.header === 'Class' || c.header === 'Polarity');
    columnStyles[idx] = { halign: 'center', cellWidth: narrow ? 38 : 66 };
  });

  runAutoTable(doc, {
    startY: y + 6,
    head: [columns.map(c => pdfSafe(c.header))],
    body: body.length ? body : [columns.map(() => '')],
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles,
    // v35: header band uses the chosen header colour, with auto-contrast text
    // (white on dark, black on light) so a light theme stays legible.
    headStyles: { fillColor: headerRgb, textColor: contrastColor(headerRgb) },
    // Tint failed rows so they stand out in the register (Q11).
    didParseCell: (data) => {
      if (data.section === 'body' && rs.showFails) {
        const item = rows[data.row.index];
        if (item && item.result === 'fail') {
          data.cell.styles.fillColor = [250, 224, 224];
          data.cell.styles.textColor = [120, 20, 20];
        }
      }
    }
  });

  // ----- Footer on every page: page numbers + generated stamp + declaration -----
  const pageCount = doc.internal.getNumberOfPages();
  const genStamp = formatDate(todayISO());
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFontSize(8); doc.setFont(undefined, 'normal'); doc.setTextColor(120);
    doc.text(`Page ${p} of ${pageCount}`, pageW - margin, pageH - 20, { align: 'right' });
    // v48: app credit is optional. When off, the footer shows just the generated
    // stamp; when on (default), it reads "Generated … · PATGo {version}".
    const creditOn = !(state.reportSettings && state.reportSettings.showAppCredit === false);
    const footerLeft = creditOn
      ? `Generated ${genStamp} · PATGo ${APP_VERSION}`
      : `Generated ${genStamp}`;
    // v49: the PATGo footer logo. Subordinate to the credit toggle (Q2): it only
    // draws when the credit line is on AND showFooterLogo is on (default). Drawn
    // as a small square mark to the LEFT of the credit text, vertically centred
    // on the text baseline. A bad image never blocks the report (same guard as
    // the header/signature logos). The text then starts to the right of the mark.
    let textX = margin;
    const footerLogoOn = creditOn && !(state.reportSettings && state.reportSettings.showFooterLogo === false);
    if (footerLogoOn && typeof PATGO_FOOTER_LOGO === 'string' && PATGO_FOOTER_LOGO) {
      try {
        const sz = 11;                 // pt square — matches the 8pt text height band
        const logoY = pageH - 20 - sz + 2;  // sit it on the text baseline
        doc.addImage(PATGO_FOOTER_LOGO, 'PNG', margin, logoY, sz, sz);
        textX = margin + sz + 5;       // nudge the text clear of the mark
      } catch (e) { /* a bad footer logo never blocks the report */ }
    }
    doc.text(footerLeft, textX, pageH - 20);
    doc.setTextColor(0);
  }

  // Declaration + signature on the LAST page, above the footer.
  if (rs.declaration) {
    doc.setPage(pageCount);
    const pageH = doc.internal.pageSize.getHeight();
    // v34: does a signature image exist? If so we need extra headroom above the
    // signing rule for it.
    const sigImg = (typeof rs.signature === 'string' && rs.signature) ? rs.signature : '';
    const sigHeadroom = sigImg ? 50 : 0;   // pt reserved above the rule for the image
    let dy = (doc.lastAutoTable ? doc.lastAutoTable.finalY : y) + 30;
    // If too close to the footer, push to a fresh page (include the declaration
    // text, the signature headroom, and the signing rule in the clearance).
    if (dy > pageH - 110 - sigHeadroom) { doc.addPage(); dy = margin + 10; }
    doc.setFontSize(9); doc.setFont(undefined, 'italic'); doc.setTextColor(80);
    const declText = String(rs.declarationText || '');
    const wrapped = doc.splitTextToSize(declText, pageW - margin * 2);
    doc.text(wrapped, margin, dy);
    dy += wrapped.length * 12 + 24 + sigHeadroom;
    doc.setTextColor(0); doc.setFont(undefined, 'normal'); doc.setFontSize(10);
    const engineerLine = (rs.showEngineer && session.engineer) ? session.engineer : '';
    // v34: signature image, drawn just above the signing rule on the side given
    // by rs.signaturePosition ('left' default | 'right'). The "Signed:" label +
    // ruled line always print. A bad image never blocks the report (logo guard).
    if (sigImg) {
      try {
        const maxW = 150, maxH = 44;   // pt box for the printed signature
        const props = doc.getImageProperties ? doc.getImageProperties(sigImg) : null;
        let w = maxW, h = maxH;
        if (props && props.width && props.height) {
          const r = Math.min(maxW / props.width, maxH / props.height);
          w = props.width * r; h = props.height * r;
        }
        const sigX = (rs.signaturePosition === 'right') ? (pageW - margin - w) : margin;
        doc.addImage(sigImg, 'PNG', sigX, dy - h - 2, w, h);
      } catch (e) { /* a bad signature never blocks the report */ }
    }
    doc.text('Signed: ____________________________', margin, dy);
    if (engineerLine) doc.text(engineerLine, margin, dy + 16);
    // v35: the Date line now prints the test date (was a blank write-in rule) so
    // it matches the auto-filled signature side. Falls back to a blank rule only
    // if the session somehow has no date.
    const dateStr = session.date ? formatDate(session.date) : '';
    const dateLabel = dateStr ? `Date: ${dateStr}` : 'Date: ______________';
    doc.text(dateLabel, pageW - margin - 150, dy);
  }

  return doc;
}

// v31: build the report filename from the user's pattern (reportFilenamePattern
// in report settings), substituting {site} {client} {date} {engineer} from the
// session, then sanitising the whole thing to a safe filename. The default
// pattern is PAT_Report_{site}_{date}, which reproduces the exact pre-v31 name.
// An empty result (e.g. a pattern of only blank tokens) falls back to "PAT_Report".
function reportFilename(session, patternOverride) {
  const rs = state.reportSettings || {};
  const pattern = (typeof patternOverride === 'string' && patternOverride.trim())
    ? patternOverride
    : (typeof rs.reportFilenamePattern === 'string' && rs.reportFilenamePattern.trim())
      ? rs.reportFilenamePattern
      : 'PAT_Report_{site}_{date}';

  // Resolve tokens. Client comes from the session's site snapshot if present.
  let client = '';
  try {
    if (typeof splitSiteSnapshot === 'function') {
      const split = splitSiteSnapshot(session.site || '');
      client = (split && split.client) || '';
    }
  } catch (e) { client = ''; }

  const values = {
    '{site}': session.site || session.name || '',
    '{client}': client,
    '{date}': session.date || todayISO(),
    '{engineer}': (session.engineer != null ? session.engineer : (state.engineer || ''))
  };
  let name = pattern.replace(/\{site\}|\{client\}|\{date\}|\{engineer\}/g, m => values[m] || '');
  // Sanitise: collapse anything non-filename-safe to underscores, trim edges.
  name = name.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  if (!name) name = 'PAT_Report';
  return `${name}.pdf`;
}

// v35: reopen the preview for a session id (used by the settings deep-link
// return). Rebuilds the doc from current settings so any edits show immediately.
// Silently no-ops if the session/engine is unavailable.
function reopenReportPreview(sessionId) {
  if (!sessionId) return;
  const session = state.sessions.find(s => s.id === sessionId);
  if (!session || !getJsPDF()) return;
  let doc;
  try { doc = buildReportDoc(session); } catch (e) { return; }
  openReportPreview(doc, session);
}

// Entry point from dispatch. Builds the doc and opens the preview modal.
// v36: stamp a certificate number onto the session the FIRST time a report is
// produced for it (A2), then reuse it forever. No-op when cert numbers are off
// or the session already has one. Builds the number from certPrefix (with an
// optional {year} token) + a zero-padded counter, then increments the counter
// and persists both the session and the settings. Returns nothing.
function stampCertNumber(session) {
  const rs = state.reportSettings;
  if (!rs.certEnabled) return;
  if (session.certNo) return;            // already stamped — reuse (A2)
  const n = Number.isFinite(parseInt(rs.certNextNumber, 10)) ? parseInt(rs.certNextNumber, 10) : 1;
  const pad = Number.isFinite(parseInt(rs.certPadding, 10)) ? parseInt(rs.certPadding, 10) : 4;
  const year = (session.date && String(session.date).slice(0, 4)) || String(new Date().getFullYear());
  const prefix = String(rs.certPrefix || '').replace(/\{year\}/gi, year);
  session.certNo = prefix + String(n).padStart(pad, '0');
  rs.certNextNumber = n + 1;
  save();                  // persists the session (with certNo)
  saveReportSettings();    // persists the advanced counter
}

async function produceReport(sessionId) {
  if (!state.reportSettings.enabled) { setView('settings'); return; }
  const session = state.sessions.find(s => s.id === sessionId);
  if (!session) { openInfoSheet({ title: 'Session not found', message: 'Couldn\u2019t find that session. Please try again.' }); return; }

  // v51: the PDF engine is loaded lazily on first report rather than at startup.
  // Show a brief "preparing" toast while it loads (near-instant once it's cached,
  // which it is from first install — the files live in the SW precache). If the
  // load genuinely fails (e.g. corrupt cache), surface a clear retryable message
  // rather than silently doing nothing.
  if (!reportEngineReady()) {
    showToast('Preparing report\u2026');
    try {
      await loadReportEngine();
    } catch (e) {
      openInfoSheet({
        title: 'Couldn\u2019t load the report engine',
        message: 'The PDF engine didn\u2019t load. Close and reopen the app (reconnect once if you\u2019re offline so it can refresh), then try again.'
      });
      return;
    }
  }

  stampCertNumber(session);   // v36: assign-once cert number before building
  let doc;
  try {
    doc = buildReportDoc(session);
  } catch (e) {
    openInfoSheet({ title: 'Couldn\u2019t build the report', message: 'Something went wrong building the report. Please try again.' });
    return;
  }
  openReportPreview(doc, session);
}

// Preview modal (Q5=C): show the PDF with Share + Download + Close. Built
// directly in the DOM rather than through render() so it overlays the current
// screen without a view change.
// v35: adds a "Quick adjust" row that rebuilds the PDF in place when common
// settings are toggled, and an "Edit report settings" deep-link that returns here.
// v38: MULTI-PAGE PREVIEW. Previously an <iframe src="blob:"> that iOS only
// rendered page 1 of (hence the old "page 1 of N" note). Now, when the PDF.js
// engine can be loaded (pdfpreview.js — lazy, same-origin, SW-cached), every
// page is rendered to a stacked, scrollable column of <canvas> nodes. If the
// engine can't load (first-ever preview while offline), it falls back to the
// old single-page iframe + note, so it's never worse than before.
function openReportPreview(doc, session) {
  // Keep the live session id so the settings deep-link can rebuild this preview.
  const sessionId = session.id;

  function pageCountOf(d) {
    try { return d.internal.getNumberOfPages(); } catch (e) { return 1; }
  }

  // Build (or rebuild) all the per-doc bits: blob, url, page count.
  let blob, url, pages;
  function refreshDocState(d) {
    blob = d.output('blob');
    url = URL.createObjectURL(blob);
    pages = pageCountOf(d);
  }
  refreshDocState(doc);

  const filename = reportFilename(session);
  const baseName = filename.replace(/\.pdf$/i, '');

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'report-preview-backdrop';
  backdrop.style.zIndex = '400';

  const sheet = document.createElement('div');
  sheet.className = 'report-preview-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Report preview');

  const rs = state.reportSettings;

  // v35: quick-adjust toggle row. Each flips a reportSettings field, saves, and
  // rebuilds the PDF in place. Signature side only shown when a signature exists.
  function quickAdjustHTML() {
    const hasSig = !!(rs.signature && rs.signature);
    const chip = (action, on, label) =>
      `<button class="qa-chip ${on ? 'on' : ''}" data-qa="${action}">${on ? '✓ ' : ''}${label}</button>`;
    return `
      <div class="report-qa-row">
        ${chip('fails', rs.showFails, 'List all items')}
        ${chip('calibration', rs.showCalibration, 'Calibration')}
        ${chip('signature', rs.declaration, 'Declaration')}
        ${hasSig ? chip('sigside', rs.signaturePosition === 'right', 'Signature right') : ''}
      </div>
    `;
  }

  // v38: the page-1-only note is only relevant in the iframe FALLBACK path now.
  // When canvases render, all pages are visible and no note is shown.
  function fallbackNoteHTML() {
    return pages > 1
      ? `<div class="report-page-note">Showing page 1 of ${pages} here. Connect to the internet once to enable the full multi-page preview; meanwhile tap <strong>Share / Save</strong> to view or send the full ${pages}-page report.</div>`
      : '';
  }

  // The view area starts as a "preparing…" placeholder. After the sheet mounts
  // we try the canvas renderer; on success it fills with pages, on failure we
  // swap in the iframe fallback (renderPreviewView below).
  function viewAreaHTML() {
    return `<div class="report-preview-view" id="report-preview-view">
        <div class="report-preview-loading" id="report-preview-loading">Preparing preview…</div>
      </div>`;
  }

  function buildSheetHTML() {
    return `
      <div class="report-preview-bar">
        <button class="btn-secondary" id="report-preview-close">Close</button>
        <span class="report-preview-title">Report preview</span>
        <button class="btn-primary" id="report-preview-share">Share / Save</button>
      </div>
      ${viewAreaHTML()}
      <div class="report-preview-fallback">
        <div class="report-qa-label">Quick adjust</div>
        ${quickAdjustHTML()}
        <button class="btn-secondary report-edit-settings-btn" id="report-edit-settings">⚙ Edit report settings</button>
        <label class="label report-filename-label" for="report-filename-input">File name</label>
        <div class="report-filename-row">
          <input class="input report-filename-input" id="report-filename-input" value="${baseName.replace(/"/g, '&quot;')}" autocapitalize="off" autocomplete="off" spellcheck="false">
          <span class="report-filename-ext">.pdf</span>
        </div>
        <button class="btn-secondary" id="report-preview-download">Download PDF</button>
      </div>
    `;
  }

  // v38: render the current blob into the view area. Tries the multi-page canvas
  // path first (loading PDF.js lazily if needed); on any failure shows the
  // single-page iframe fallback. Token-guarded so a slow render that finishes
  // after a rebuild or close is discarded.
  let _renderToken = 0;
  function renderPreviewView() {
    const myToken = ++_renderToken;
    const view = document.getElementById('report-preview-view');
    if (!view) return;

    function showIframeFallback() {
      if (myToken !== _renderToken) return;
      view.innerHTML =
        `${fallbackNoteHTML()}` +
        `<iframe class="report-preview-frame" src="${url}" title="Report preview"></iframe>`;
    }

    if (typeof loadPdfJsEngine !== 'function' || typeof renderPdfPagesToContainer !== 'function') {
      showIframeFallback();
      return;
    }

    loadPdfJsEngine()
      .then(() => {
        if (myToken !== _renderToken) return;
        const pagesWrap = document.createElement('div');
        pagesWrap.className = 'report-preview-pages';
        pagesWrap.id = 'report-preview-pages';
        view.innerHTML = '';
        view.appendChild(pagesWrap);
        return renderPdfPagesToContainer(blob, pagesWrap);
      })
      .then((count) => {
        if (myToken !== _renderToken) return;
        if (typeof count === 'number') pages = count;
      })
      .catch(() => { showIframeFallback(); });
  }

  sheet.innerHTML = buildSheetHTML();

  function currentFilename() {
    const inp = document.getElementById('report-filename-input');
    let n = inp ? inp.value : baseName;
    n = String(n).replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
    if (!n) n = 'PAT_Report';
    return `${n}.pdf`;
  }

  // Preserve the typed filename across an in-place rebuild.
  function currentBaseName() {
    const inp = document.getElementById('report-filename-input');
    return inp ? inp.value : baseName;
  }

  function cleanup() {
    _renderToken++;
    URL.revokeObjectURL(url);
    backdrop.remove();
    sheet.remove();
  }

  // v35: rebuild the PDF after a quick-adjust change, keeping the modal open and
  // the typed filename. Revokes the old blob URL first to avoid leaks.
  function rebuild() {
    const keepName = currentBaseName();
    URL.revokeObjectURL(url);
    let d;
    try { d = buildReportDoc(session); }
    catch (e) { openInfoSheet({ title: 'Couldn\u2019t rebuild the report', message: 'Something went wrong rebuilding the report. Please try again.' }); return; }
    refreshDocState(d);
    sheet.innerHTML = buildSheetHTML();
    const inp = document.getElementById('report-filename-input');
    if (inp) inp.value = keepName;
    wireSheet();
    renderPreviewView();
  }

  // v35: quick-adjust handler — flip the field, persist, rebuild.
  function onQuickAdjust(action) {
    if (action === 'fails')        state.reportSettings.showFails = !state.reportSettings.showFails;
    else if (action === 'calibration') state.reportSettings.showCalibration = !state.reportSettings.showCalibration;
    else if (action === 'signature')   state.reportSettings.declaration = !state.reportSettings.declaration;
    else if (action === 'sigside')      state.reportSettings.signaturePosition = (state.reportSettings.signaturePosition === 'right') ? 'left' : 'right';
    saveReportSettings();
    rebuild();
  }

  // Wire all the sheet's controls (called on open and after each rebuild).
  function wireSheet() {
    document.getElementById('report-preview-close').addEventListener('click', cleanup);
    document.getElementById('report-preview-download').addEventListener('click', () => {
      triggerDownload(blob, currentFilename());
    });
    document.getElementById('report-preview-share').addEventListener('click', async () => {
      await shareOrDownloadReport(blob, currentFilename());
    });
    sheet.querySelectorAll('[data-qa]').forEach(btn => {
      btn.addEventListener('click', () => onQuickAdjust(btn.getAttribute('data-qa')));
    });
    // Deep-link to Report Settings, returning to a fresh preview afterwards.
    const editBtn = document.getElementById('report-edit-settings');
    if (editBtn) editBtn.addEventListener('click', () => {
      cleanup();
      state.reportPreviewReturnSessionId = sessionId;
      setView('settingsReport');
    });
  }

  backdrop.addEventListener('click', cleanup);
  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);
  wireSheet();
  renderPreviewView();
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Share via the OS share sheet (mirrors shareOrDownloadCSV); fall back to a
// direct download where file-sharing isn't supported.
async function shareOrDownloadReport(blob, filename) {
  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare && typeof File === 'function') {
    try {
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch (err) {
      if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) return;
    }
  }
  triggerDownload(blob, filename);
}
