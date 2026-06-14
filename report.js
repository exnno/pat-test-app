/*!
 * PAT Test PWA — report.js (PDF reports)
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

  const doc = new JsPDF({ unit: 'pt', format: 'a4', compress: true });
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
  doc.setDrawColor(200); doc.line(margin, y, pageW - margin, y);
  y += 18;

  // ----- Job details (client / site / date / engineer) -----
  const parts = splitSiteSnapshot(session.site);
  const client = parts.client;
  const site = parts.site || session.site || session.name || '';
  doc.setFontSize(10); doc.setFont(undefined, 'normal');

  const detailPairs = [];
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
  doc.setFont(undefined, 'bold'); doc.setFontSize(11);
  doc.text(`Items tested: ${tested}    Passed: ${passed}    Failed: ${failed}`, margin, y);
  y += 8;

  // ----- Appliance register table -----
  // Column model (architected for V31): each col = { header, value(item) }.
  // Adding earth/insulation/class later = push more entries here + widen.
  const columns = [
    { header: 'Asset ID',    value: it => it.assetNo || '' },
    { header: 'Description',  value: it => it.itemType || '' },
    { header: 'Location',     value: it => it.location || '' },
    { header: 'Result',       value: it => csvResultLabel(it.result) }
  ];
  // Optional notes column — included when any item has notes, so a clean job
  // doesn't carry an empty column but a job with defect notes shows them.
  const anyNotes = session.items.some(it => (it.notes || '').trim());
  if (anyNotes) columns.push({ header: 'Notes', value: it => it.notes || '' });

  const rows = rs.showFails ? session.items : session.items.filter(i => i.result !== 'fail');
  const body = rows.map(it => columns.map(c => c.value(it)));

  runAutoTable(doc, {
    startY: y + 6,
    head: [columns.map(c => c.header)],
    body: body.length ? body : [columns.map(() => '')],
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [40, 40, 40], textColor: 255 },
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
    doc.text(`Generated ${genStamp} · PAT Test ${APP_VERSION}`, margin, pageH - 20);
    doc.setTextColor(0);
  }

  // Declaration + signature on the LAST page, above the footer.
  if (rs.declaration) {
    doc.setPage(pageCount);
    const pageH = doc.internal.pageSize.getHeight();
    let dy = (doc.lastAutoTable ? doc.lastAutoTable.finalY : y) + 30;
    // If too close to the footer, push to a fresh page.
    if (dy > pageH - 110) { doc.addPage(); dy = margin + 10; }
    doc.setFontSize(9); doc.setFont(undefined, 'italic'); doc.setTextColor(80);
    const declText = String(rs.declarationText || '');
    const wrapped = doc.splitTextToSize(declText, pageW - margin * 2);
    doc.text(wrapped, margin, dy);
    dy += wrapped.length * 12 + 24;
    doc.setTextColor(0); doc.setFont(undefined, 'normal'); doc.setFontSize(10);
    const engineerLine = (rs.showEngineer && session.engineer) ? session.engineer : '';
    doc.text('Signed: ____________________________', margin, dy);
    if (engineerLine) doc.text(engineerLine, margin, dy + 16);
    doc.text('Date: ______________', pageW - margin - 150, dy);
  }

  return doc;
}

// Safe filename mirroring the CSV convention.
function reportFilename(session) {
  const safe = (session.site || session.name || 'session').replace(/[^a-z0-9]+/gi, '_');
  return `PAT_Report_${safe}_${session.date}.pdf`;
}

// Entry point from dispatch. Builds the doc and opens the preview modal.
function produceReport(sessionId) {
  if (!state.reportSettings.enabled) { setView('settings'); return; }
  const session = state.sessions.find(s => s.id === sessionId);
  if (!session) { alert('Could not find that session.'); return; }
  if (!getJsPDF()) {
    alert('The PDF engine has not finished loading yet. If you are offline on first use, reconnect once so it can cache, then try again.');
    return;
  }
  let doc;
  try {
    doc = buildReportDoc(session);
  } catch (e) {
    alert('Could not build the report. Please try again.');
    return;
  }
  openReportPreview(doc, session);
}

// Preview modal (Q5=C): show the PDF in an iframe with Share + Download +
// Close. Uses a blob URL; revoked on close. Built directly in the DOM rather
// than through render() so it overlays the current screen without a view change.
function openReportPreview(doc, session) {
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const filename = reportFilename(session);

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'report-preview-backdrop';
  backdrop.style.zIndex = '400';

  const sheet = document.createElement('div');
  sheet.className = 'report-preview-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Report preview');
  sheet.innerHTML = `
    <div class="report-preview-bar">
      <button class="btn-secondary" id="report-preview-close">Close</button>
      <span class="report-preview-title">Report preview</span>
      <button class="btn-primary" id="report-preview-share">Share / Save</button>
    </div>
    <iframe class="report-preview-frame" src="${url}" title="Report preview"></iframe>
    <div class="report-preview-fallback">
      <button class="btn-secondary" id="report-preview-download">Download PDF</button>
    </div>
  `;

  function cleanup() {
    URL.revokeObjectURL(url);
    backdrop.remove();
    sheet.remove();
  }
  backdrop.addEventListener('click', cleanup);
  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);

  document.getElementById('report-preview-close').addEventListener('click', cleanup);
  document.getElementById('report-preview-download').addEventListener('click', () => {
    triggerDownload(blob, filename);
  });
  document.getElementById('report-preview-share').addEventListener('click', async () => {
    await shareOrDownloadReport(blob, filename);
  });
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
