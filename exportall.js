/*!
 * PATGo PWA
 * V125 (October 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PATGo PWA — V125 — Export everything (Stage 12) ==============
// One zip file holding everything on THIS phone: the backup file, a spreadsheet
// (CSV) for each job with items, every certificate already made, optionally the
// photo file, and a short "Read me". The base for lapse handling (R8), and
// useful to everyone before then. Settings → Backup & Restore.
//
// Locked (14 Oct, Peter "0A 1A 2A 3A 4A 5A 6A"):
//   1A one zip file, "PATGo everything 14-10-2026.zip"; every file inside one
//      folder of the same name, so the Files app expands it the same way every
//      time. Our own zip writer (STORE — no compression): PDFs, JPEGs and the
//      photo file's base64 barely shrink, and a store-only writer is short
//      enough to read and test whole. No outside library.
//   2A "Include photos" tick, ticked by default. The photo file is the SAME
//      file as Export photos (photos.js buildPhotoBundle), so Import photos
//      restores it unchanged.
//   3A certificates ONLY for jobs that already have one (certNo or reportAt),
//      rebuilt from today's data with their own number. stampCertNumber is never
//      called here — nothing new is issued and the counter never moves.
//   4A jobs on this phone only, and the sheet says so plainly (Peter: "make it
//      clear it's just this phone"). Cloud-only jobs and photos are never
//      fetched (the cloud download principle).
//   5A does NOT count as exported: markSessionExported is never called here, so
//      the not-exported reminder stays. (The BACKUP reminder is different: the
//      zip holds a full backup, so a completed save stamps markBackupExported —
//      Claude's call within the spec.)
//   6A Settings → Backup & Restore, top. A progress sheet with Cancel.
//
// ⚠ iOS: navigator.share needs a fresh tap. Building can take many seconds, and
// by then the tap that started it has expired — share would throw
// NotAllowedError. So the build ends on a "ready" sheet, and its Save or share
// button is the tap the share rides on. Cancelling the share sheet leaves the
// ready sheet open to try again; nothing is rebuilt.
//
// Memory: one job at a time. Each certificate is turned into bytes and its doc
// dropped before the next is built; the zip is a list of parts handed to one
// Blob at the end (no single giant copy).
//
// Optional subsystem (MAP rule 6): every caller is typeof-guarded.

const EXPORTALL_CSV_DIR = 'Job spreadsheets';
const EXPORTALL_CERT_DIR = 'Certificates';

// ---------- the zip writer (STORE only) ----------

let _exportAllCrcTable = null;
function exportAllCrc32(bytes) {
  if (!_exportAllCrcTable) {
    _exportAllCrcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      _exportAllCrcTable[n] = c >>> 0;
    }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = _exportAllCrcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// MS-DOS time and date, local time (what Files and Finder show).
function exportAllDosTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time: time & 0xFFFF, date: date & 0xFFFF };
}

// entries: [{ name: 'Folder/file.ext', data: Uint8Array }]. Returns { parts,
// size } — parts are Uint8Arrays to hand to one Blob. Names are UTF-8 (general
// purpose flag bit 11), so "Bob's Café" survives. Zip64 is not written: refuses
// past 4 GB or 65,535 files rather than writing a broken file.
function exportAllZip(entries, when) {
  const enc = new TextEncoder();
  const dt = exportAllDosTime(when || new Date());
  const parts = [];
  const central = [];
  let offset = 0;
  if (entries.length > 0xFFFF) throw new Error('Too many files for one zip');
  for (const e of entries) {
    const name = enc.encode(e.name);
    const data = e.data;
    const crc = exportAllCrc32(data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);   // local file header
    lv.setUint16(4, 20, true);           // version needed: 2.0
    lv.setUint16(6, 0x0800, true);       // UTF-8 names
    lv.setUint16(8, 0, true);            // method 0: stored
    lv.setUint16(10, dt.time, true);
    lv.setUint16(12, dt.date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true); // compressed size = size (stored)
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);           // no extra field
    local.set(name, 30);
    parts.push(local, data);

    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);   // central directory header
    cv.setUint16(4, 20, true);           // made by: 2.0
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dt.time, true);
    cv.setUint16(14, dt.date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    // 30 extra, 32 comment, 34 disk, 36 internal attr, 38 external attr: all 0
    cv.setUint32(42, offset, true);      // where its local header starts
    cd.set(name, 46);
    central.push(cd);

    offset += local.length + data.length;
    if (offset > 0xFFFFFFFF) throw new Error('Too big for one zip');
  }
  const cdStart = offset;
  let cdSize = 0;
  for (const c of central) { parts.push(c); cdSize += c.length; }
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);     // end of central directory
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdStart, true);
  parts.push(end);
  return { parts, size: cdStart + cdSize + 22 };
}

// Two jobs at the same site on the same day make the same file name; the
// second becomes "… (2).csv". Case-insensitive, because the Files app is.
function exportAllUniqueName(used, path) {
  let candidate = path;
  const dot = path.lastIndexOf('.');
  const stem = dot > path.lastIndexOf('/') ? path.slice(0, dot) : path;
  const ext = dot > path.lastIndexOf('/') ? path.slice(dot) : '';
  for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

// ---------- what goes in ----------

// What this phone holds, read synchronously from state. Jobs with no items have
// nothing to put in a spreadsheet and never had a certificate; they are still
// in the backup.
function exportAllPlan() {
  const sessions = (state.sessions || []).filter(s => s && Array.isArray(s.items));
  const withItems = sessions.filter(s => s.items.length > 0);
  const certJobs = withItems.filter(s => !!(s.certNo || s.reportAt));   // 3A
  const ph = (typeof photoStatsSync === 'function') ? photoStatsSync() : { count: 0, bytes: 0 };
  return {
    jobs: sessions.length,
    csvJobs: withItems,
    certJobs,
    photoCount: ph.count || 0,
    photoBytes: ph.bytes || 0
  };
}

function exportAllBaseName() {
  return `PATGo everything ${fileDateUK(todayISO())}`;
}

function _exportAllPlural(n, one, many) { return `${n} ${n === 1 ? one : (many || one + 's')}`; }

function exportAllReadMe(counts, withPhotos) {
  const lines = [
    `PATGo \u2014 everything from one phone`,
    `Made ${fileDateUK(todayISO())} by PATGo ${typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''}.`,
    ``,
    `This is everything that was on the phone that made it. Jobs and photos kept only in the cloud are not in it.`,
    ``,
    `PAT backup (.json) \u2014 every job and all your settings. To put them back: PATGo, Settings, Backup & Restore, Import backup.`,
    `${EXPORTALL_CSV_DIR} \u2014 one spreadsheet for each job (${_exportAllPlural(counts.csv, 'job')}). They open in Excel or Numbers, and each can be imported back into PATGo on its own.`,
    `${EXPORTALL_CERT_DIR} \u2014 ${counts.certs ? _exportAllPlural(counts.certs, 'certificate') + ', one for each job that had one, keeping any number it already had (no new numbers), made from the job as it is now.' : 'no job on this phone had a certificate.'}`
  ];
  if (withPhotos) {
    lines.push(counts.photos
      ? `PATGo photos (.json) \u2014 ${_exportAllPlural(counts.photos, 'photo')}. To put them back: PATGo, Settings, Backup & Restore, Import photos.`
      : `Photos \u2014 none could be read from the phone.`);
  } else {
    lines.push(`Photos were left out of this file.`);
  }
  return lines.join('\r\n') + '\r\n';
}

// ---------- the sheets ----------

let _exportAllRunning = false;

// 4A: the first sheet. Says "this phone only" before anything else, then what
// goes in, then the photo tick (2A). Nothing is built until Make the file.
function exportAllOpen() {
  if (_exportAllRunning) return;
  const plan = exportAllPlan();
  const signedIn = (typeof syncActive === 'function') && syncActive();
  const title = 'Export everything';
  const { sheet, backdrop, cleanup } = _openSheet(title);
  const photoRow = plan.photoCount > 0 ? `
      <div class="toggle-row" style="margin-top:12px">
        <div class="toggle-row-text">
          <div class="toggle-row-title">Include photos</div>
          <div class="toggle-row-sub">${escapeHTML(_exportAllPlural(plan.photoCount, 'photo'))}, about ${escapeHTML(formatBytes(Math.round(plan.photoBytes * 1.37)))}</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="export-all-photos" aria-label="Include photos" checked>
          <span class="toggle-slider"></span>
        </label>
      </div>` : '';
  sheet.innerHTML = `
    <div class="bulk-sheet-handle"></div>
    <div class="bulk-sheet-header">
      <span class="fail-close-spacer"></span>
      <h3 class="bulk-sheet-title">${escapeHTML(title)}</h3>
      <button class="fail-close-btn" id="export-all-x" aria-label="Cancel">&times;</button>
    </div>
    <div class="sheet-scroll" style="font-size:0.875rem;line-height:1.5;color:var(--text-muted)">
      <p id="export-all-scope" style="margin:0 0 8px;color:var(--text)"><strong>From this phone only.</strong> One zip file of everything on this phone:</p>
      <ul style="margin:0 0 8px;padding-left:20px">
        <li>a backup of all your jobs and settings</li>
        <li>a spreadsheet for each job (${escapeHTML(_exportAllPlural(plan.csvJobs.length, 'job'))})</li>
        <li>${plan.certJobs.length
          ? `the ${escapeHTML(_exportAllPlural(plan.certJobs.length, 'certificate'))} already made, with the same numbers &mdash; no new numbers are used`
          : 'no certificates &mdash; none have been made on this phone yet'}</li>
      </ul>
      ${signedIn ? '<p id="export-all-cloud" style="margin:0 0 8px">Jobs and photos kept only in the cloud are <strong>not</strong> included.</p>' : ''}
      <p style="margin:0">It doesn&rsquo;t count as exporting a job &mdash; the &ldquo;not exported&rdquo; reminders stay as they are.</p>
      ${photoRow}
    </div>
    <div class="sheet-pin" style="display:flex;gap:10px;margin-top:16px">
      <button class="btn-secondary" id="export-all-no">Cancel</button>
      <button class="btn-primary" id="export-all-go" style="flex:1">Make the file</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);
  const x = document.getElementById('export-all-x');
  const no = document.getElementById('export-all-no');
  const go = document.getElementById('export-all-go');
  if (x) x.addEventListener('click', cleanup);
  if (no) no.addEventListener('click', cleanup);
  if (go) go.addEventListener('click', () => {
    // Read the tick BEFORE cleanup removes it (MAP rule 4).
    const box = document.getElementById('export-all-photos');
    const withPhotos = !!(box && box.checked);
    cleanup();
    exportAllRun(withPhotos);
  });
  focusSheetOpened(sheet);   // V123 (3A)
}

// The progress sheet: fixed wording, one line that changes in place (MAP rule 3
// — no render() while a sheet is up). Returns { set(text), cancelled(), close() }.
function _exportAllProgress() {
  const title = 'Making your file';
  const { sheet, backdrop, cleanup } = _openSheet(title);
  let cancelled = false;
  const stop = () => { cancelled = true; cleanup(); };
  // A stray tap on the backdrop must not leave the build running unseen.
  backdrop.addEventListener('click', () => { cancelled = true; });
  sheet.innerHTML = `
    <div class="bulk-sheet-handle"></div>
    <div class="bulk-sheet-header">
      <span class="fail-close-spacer"></span>
      <h3 class="bulk-sheet-title">${escapeHTML(title)}</h3>
      <button class="fail-close-btn" id="export-all-stop-x" aria-label="Cancel">&times;</button>
    </div>
    <p id="export-all-step" role="status" style="margin:0 0 16px;font-size:0.875rem;line-height:1.5;color:var(--text-muted)">Starting&hellip;</p>
    <button class="btn-secondary sheet-pin" id="export-all-stop">Cancel</button>
  `;
  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);
  const sx = document.getElementById('export-all-stop-x');
  const sb = document.getElementById('export-all-stop');
  if (sx) sx.addEventListener('click', stop);
  if (sb) sb.addEventListener('click', stop);
  focusSheetOpened(sheet);
  return {
    set(text) { const p = document.getElementById('export-all-step'); if (p) p.textContent = text; },
    cancelled() { return cancelled; },
    close() { cleanup(); }
  };
}

// Let the step line paint and a Cancel tap land between jobs.
function _exportAllYield() { return new Promise(r => setTimeout(r, 0)); }

// Build every entry, one job at a time. Resolves { entries, counts, notes } or
// null when cancelled. Never stamps a number, never marks a job exported.
async function exportAllBuild(withPhotos, progress) {
  const plan = exportAllPlan();
  const base = exportAllBaseName();
  const enc = new TextEncoder();
  const used = new Set();
  const entries = [];
  const notes = [];
  const counts = { csv: 0, certs: 0, photos: 0 };
  const add = (path, data) => entries.push({ name: exportAllUniqueName(used, `${base}/${path}`), data });
  const stopped = () => progress && progress.cancelled();
  const say = (t) => { if (progress) progress.set(t); };

  // The backup — the heart of it. If this fails, nothing is worth handing over.
  say('Backup');
  add(`PAT backup ${fileDateUK(todayISO())}.json`, enc.encode(JSON.stringify(buildBackup(), null, 2)));

  // A spreadsheet per job, BOM first like every other CSV export (Excel).
  let csvFailed = 0;
  for (let i = 0; i < plan.csvJobs.length; i++) {
    if (stopped()) return null;
    say(`Spreadsheet ${i + 1} of ${plan.csvJobs.length}`);
    try {
      add(`${EXPORTALL_CSV_DIR}/${csvFilename(plan.csvJobs[i])}`, enc.encode('\uFEFF' + buildCSV(plan.csvJobs[i])));
      counts.csv++;
    } catch (e) { csvFailed++; }
    if (i % 20 === 19) await _exportAllYield();
  }
  if (csvFailed) notes.push(`${_exportAllPlural(csvFailed, 'spreadsheet')} couldn\u2019t be made.`);

  // Certificates (3A): only jobs that already had one; no stampCertNumber.
  if (plan.certJobs.length) {
    let engine = true;
    if (typeof reportEngineReady === 'function' && !reportEngineReady()) {
      say('Preparing certificates\u2026');
      try { await loadReportEngine(); } catch (e) { engine = false; }
    }
    if (!engine || typeof buildReportDoc !== 'function') {
      notes.push('The certificates couldn\u2019t be made this time (the PDF engine didn\u2019t load). Everything else is in the file.');
    } else {
      let certFailed = 0;
      const rs = state.reportSettings || {};
      for (let i = 0; i < plan.certJobs.length; i++) {
        say(`Certificate ${i + 1} of ${plan.certJobs.length}`);
        await _exportAllYield();
        // Checked AFTER the pause: a Cancel tap lands during it.
        if (stopped()) return null;
        const s = plan.certJobs[i];
        try {
          // Photos only from this phone (4A); cloud-only ones are never fetched.
          let photoData = _emptyPhotoData(s.id);
          if (rs.showPhotos === true) {
            try { photoData = await collectReportPhotos(s); } catch (e) { /* photos never cost the certificate */ }
          }
          let doc = buildReportDoc(s, photoData);
          const bytes = new Uint8Array(doc.output('arraybuffer'));
          doc = null; photoData = null;   // drop before the next job
          add(`${EXPORTALL_CERT_DIR}/${reportFilename(s)}`, bytes);
          counts.certs++;
        } catch (e) { certFailed++; }
      }
      if (certFailed) notes.push(`${_exportAllPlural(certFailed, 'certificate')} couldn\u2019t be made.`);
    }
  }

  // The photo file (2A) — the same file Export photos makes.
  if (withPhotos && plan.photoCount > 0 && typeof buildPhotoBundle === 'function') {
    if (stopped()) return null;
    say('Photos');
    await _exportAllYield();
    let bundle = null;
    try { bundle = await buildPhotoBundle(); } catch (e) { bundle = null; }
    if (bundle) {
      add(`PATGo photos ${fileDateUK(todayISO())}.json`, enc.encode(JSON.stringify(bundle)));
      counts.photos = bundle.count || 0;
    } else {
      notes.push('The photos couldn\u2019t be read from the phone.');
    }
  }

  if (stopped()) return null;
  add('Read me.txt', enc.encode(exportAllReadMe(counts, withPhotos)));
  return { entries, counts, notes };
}

async function exportAllRun(withPhotos) {
  if (_exportAllRunning) return;
  _exportAllRunning = true;
  const progress = _exportAllProgress();
  let built = null;
  let blob = null;
  try {
    built = await exportAllBuild(withPhotos, progress);
    if (built) {
      progress.set('Packing the file');
      await _exportAllYield();
      if (!progress.cancelled()) {
        const zip = exportAllZip(built.entries, new Date());
        built.entries = null;   // the parts hold the bytes now
        blob = new Blob(zip.parts, { type: 'application/zip' });
      }
    }
  } catch (e) {
    console.error('Export everything failed.', e);
    progress.close();
    _exportAllRunning = false;
    openInfoSheet({ title: 'Couldn\u2019t make the file', message: 'Something went wrong making the file. Nothing on the phone has changed. Please try again.' });
    return;
  }
  progress.close();
  _exportAllRunning = false;
  if (!built || !blob || progress.cancelled()) return;   // cancelled: nothing kept
  _exportAllReady(blob, built.counts, built.notes);
}

// The ready sheet: its button is the fresh tap the share needs (see top).
function _exportAllReady(blob, counts, notes) {
  const filename = `${exportAllBaseName()}.zip`;
  const title = 'Your file is ready';
  const { sheet, backdrop, cleanup } = _openSheet(title);
  const what = [
    _exportAllPlural(counts.csv, 'job spreadsheet'),
    _exportAllPlural(counts.certs, 'certificate'),
    counts.photos ? _exportAllPlural(counts.photos, 'photo') : null
  ].filter(Boolean).join(', ');
  sheet.innerHTML = `
    <div class="bulk-sheet-handle"></div>
    <div class="bulk-sheet-header">
      <span class="fail-close-spacer"></span>
      <h3 class="bulk-sheet-title">${escapeHTML(title)}</h3>
      <button class="fail-close-btn" id="export-all-done-x" aria-label="Close">&times;</button>
    </div>
    <div class="sheet-scroll" style="font-size:0.875rem;line-height:1.5;color:var(--text-muted)">
      <p style="margin:0 0 8px;color:var(--text)"><strong>${escapeHTML(filename)}</strong> &middot; ${escapeHTML(formatBytes(blob.size))}</p>
      <p style="margin:0 0 8px">From this phone only: the backup, ${escapeHTML(what)}.</p>
      ${(notes || []).map(n => `<p style="margin:0 0 8px;color:var(--warn-soft-text)">${escapeHTML(n)}</p>`).join('')}
      <p style="margin:0">Save it to Files or a cloud drive. A big file may be too large to email.</p>
    </div>
    <div class="sheet-pin" style="display:flex;gap:10px;margin-top:16px">
      <button class="btn-secondary" id="export-all-done-no">Close</button>
      <button class="btn-primary" id="export-all-save" style="flex:1">Save or share</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);
  const x = document.getElementById('export-all-done-x');
  const no = document.getElementById('export-all-done-no');
  const save = document.getElementById('export-all-save');
  if (x) x.addEventListener('click', cleanup);
  if (no) no.addEventListener('click', cleanup);
  if (save) save.addEventListener('click', async () => {
    const ok = await exportAllShare(blob, filename);
    if (!ok) return;   // share sheet cancelled: stay open, try again
    // The zip holds a complete backup — reset the backup reminder (Claude's
    // call). Jobs are NOT marked exported (5A).
    if (typeof markBackupExported === 'function') markBackupExported();
    cleanup();
    showToast('Saved');
  });
  focusSheetOpened(sheet);
}

// Share the zip through the share sheet; download where files can't be shared.
// true = shared or downloaded; false = the person backed out.
async function exportAllShare(blob, filename) {
  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare && typeof File === 'function') {
    try {
      const file = new File([blob], filename, { type: 'application/zip' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return true;
      }
    } catch (err) {
      if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) return false;
    }
  }
  triggerDownload(blob, filename);
  return true;
}
