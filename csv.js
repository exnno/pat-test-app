/*!
 * PAT Test PWA
 * v22 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PAT Test PWA — v22 — CSV ==============
// CSV: cell values, build, download/share, and CSV import parse + commit.

function csvCellValue(colId, session, item) {
  switch (colId) {
    case 'assetNo':     return item.assetNo;
    case 'engineer':    return session.engineer || '';
    case 'description': return item.itemType;
    // v26 (Q4=B): Client/Site column split. The session stores ONE combined
    // `site` snapshot ("Client — Site", or just one part). We resolve the two
    // parts on the fly. To avoid changing exports for users who DON'T turn the
    // new Client column on, the 'site' column's output adapts:
    //   • Client column hidden  → 'site' emits the FULL snapshot (unchanged
    //                              from pre-v26 — "Client — Site" as before).
    //   • Client column visible  → 'site' emits only the SITE part, and the
    //                              'client' column carries the client part, so
    //                              the two columns together reconstruct it.
    case 'client':      return splitSiteSnapshot(session.site).client;
    case 'site': {
      const clientCol = state.csvColumns.find(c => c.id === 'client');
      const clientVisible = clientCol ? clientCol.visible : false;
      return clientVisible ? splitSiteSnapshot(session.site).site : session.site;
    }
    case 'location':    return item.location;
    case 'date':        return formatDate(session.date);
    case 'result':      return csvResultLabel(item.result);
    case 'notes':       return item.notes;
    // v12: tester + calibration columns (default-hidden).
    // v13: 'tester' now combines testerMake + testerModel into a single
    // space-separated string. Either field on its own is fine — empty
    // strings drop out via the trim, no leading/trailing whitespace.
    case 'tester':      return [state.testerMake, state.testerModel].filter(Boolean).join(' ').trim();
    case 'calDate':     return state.calDate ? formatDate(state.calDate) : '';
    case 'calCertNo':   return state.calCertNo || '';
    case 'calDue':      return state.calDue ? formatDate(state.calDue) : '';
    // v17: per-item timestamp. Blank when the Item Timestamps setting is OFF
    // (even if the column is visible), and blank for items logged before the
    // feature was enabled.
    case 'time':        return state.timestampsEnabled ? formatTimestampCSV(item.ts) : '';
    default:            return '';
  }
}

// v11: buildCSV is now driven by state.csvColumns. Order in that array IS the
// export order; columns with visible=false are skipped entirely. Header cells
// use the user-customised .header value (which falls back to the default on
// save if blank — see saveCsvColumnsSettings()).
//
// If for some reason every column is hidden (shouldn't happen — save validates
// at least one is visible), we fall back to the default header+order so an
// accidental empty config doesn't yield a totally blank file.
function buildCSV(session) {
  let cols = state.csvColumns.filter(c => c.visible);
  if (cols.length === 0) cols = DEFAULT_CSV_COLUMNS.map(c => ({ ...c }));
  const header = cols.map(c => csvEscape(c.header || defaultHeaderFor(c.id))).join(',');
  const rows = session.items.map(it =>
    cols.map(c => csvEscape(csvCellValue(c.id, session, it))).join(',')
  );
  return [header, ...rows].join('\n');
}

// Lookup the default header text for a column id — used as a last-resort
// fallback if the user-customised header is empty.
function defaultHeaderFor(id) {
  const d = DEFAULT_CSV_COLUMNS.find(x => x.id === id);
  return d ? d.header : '';
}
function downloadCSV(session) {
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + buildCSV(session)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safe = (session.site || session.name || 'session').replace(/[^a-z0-9]+/gi, '_');
  a.href = url; a.download = `PAT_${safe}_${session.date}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// v10: Inline iOS share-style glyph (square with arrow protruding from the top).
// Replaces the ⬇ unicode arrow on Export buttons. Uses currentColor so it
// inherits the surrounding button colour. Used both in the sessions list
// (.icon-btn-sm, muted) and in the overview header (.icon-btn, neutral).
const SHARE_ICON_SVG =
  '<svg class="share-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>' +
  '<line x1="12" y1="3" x2="12" y2="15"/>' +
  '<polyline points="7 8 12 3 17 8"/>' +
  '</svg>';

// v10: Share or download a session's CSV. Prefers the native share sheet via
// Web Share API (iOS Safari, modern Android Chrome) so the engineer can send
// the CSV to a colleague via Messages, Mail, AirDrop, WhatsApp, etc. — which
// pairs naturally with the new Import feature on the receiving end.
//
// Falls back to a direct download when:
//   • navigator.share is not present (desktop browsers, older mobile)
//   • navigator.canShare reports the file isn't shareable (some Android
//     versions support share but not files)
//   • The share API throws a non-Abort error
//
// If the user CANCELS the share sheet (AbortError), we do NOT fall back to a
// download — they explicitly dismissed the share, a sudden download would
// surprise them.
async function shareOrDownloadCSV(session) {
  const BOM = '\uFEFF';
  const csvText = BOM + buildCSV(session);
  const safe = (session.site || session.name || 'session').replace(/[^a-z0-9]+/gi, '_');
  const filename = `PAT_${safe}_${session.date}.csv`;

  // Feature detection — File constructor is also required for navigator.share({files})
  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare && typeof File === 'function') {
    try {
      const file = new File([csvText], filename, { type: 'text/csv' });
      if (navigator.canShare({ files: [file] })) {
        // v26: share ONLY the CSV file. Previously we also passed `title` and
        // `text`, which some targets (Mail/Messages) attach as a separate .txt
        // note or message body — unwanted clutter. Dropping them sends just the
        // CSV.
        await navigator.share({ files: [file] });
        // v14: share completed → mark this session exported (clears dirty).
        markSessionExported(session);
        save();
        render();
        return;
      }
    } catch (err) {
      // User dismissed the share sheet — respect that, no download, no export mark.
      if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) return;
      // Anything else (e.g. partial support, permission glitch) → fall through to download.
    }
  }
  downloadCSV(session);
  // v14: a direct download always counts as an export.
  markSessionExported(session);
  save();
  render();
}

// v37.1 (hotfix): copy the CSV text straight to the clipboard. Added because the
// v26 "share file only" change (which dropped the share payload's `text` field to
// stop Mail/Messages attaching a clutter note) also removed iOS's "Copy" option
// from the share sheet — Copy on iOS only appears when `text` is present. Rather
// than reintroduce the clutter, this gives a reliable dedicated Copy action that
// doesn't depend on the share sheet at all. Uses the async Clipboard API with a
// hidden-textarea + execCommand fallback for contexts where it's blocked. Copying
// counts as an export (clears the dirty flag), consistent with share/download.
async function copyCSV(session) {
  if (!session) return;
  const BOM = '\uFEFF';
  const csvText = BOM + buildCSV(session);
  let copied = false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(csvText);
      copied = true;
    }
  } catch (err) {
    copied = false;   // fall through to the legacy path
  }
  if (!copied) {
    try {
      const ta = document.createElement('textarea');
      ta.value = csvText;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, csvText.length);   // iOS needs an explicit range
      copied = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (err2) {
      copied = false;
    }
  }
  if (copied) {
    showToast('CSV copied to clipboard');
    markSessionExported(session);
    save();
    render();
  } else {
    showToast('Could not copy — try Share instead');
  }
}
//
// Strategy mirrors shareOrDownloadCSV but for many files:
//   • Preferred path: a single navigator.share with ALL CSVs attached as files.
//     iOS Safari and modern Android Chrome accept multi-file shares; the user
//     picks one destination (Mail, Files, AirDrop…) for the whole batch.
//   • If the platform can't share files (desktop, older mobile) or the file set
//     is rejected by canShare, fall back to sequential downloads with a small
//     stagger (some browsers collapse rapid programmatic downloads).
//
// Export-mark rule matches single export: on a COMPLETED share or the download
// fallback, every batched session is marked exported (clears the nudge). On a
// cancelled share sheet (AbortError / NotAllowedError) NOTHING is marked — the
// user backed out, so the nudge stays exactly as it was.
//
// Per-session CSVs (one file each) are used deliberately rather than one
// concatenated file: the importer refuses multi-session CSVs, so one-file-per
// keeps every export round-trippable back through Import.
async function bulkExportUnexported() {
  const targets = unexportedSessions();
  if (targets.length === 0) return;
  const BOM = '\uFEFF';

  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare && typeof File === 'function') {
    try {
      const files = targets.map(s => {
        const safe = (s.site || s.name || 'session').replace(/[^a-z0-9]+/gi, '_');
        return new File([BOM + buildCSV(s)], `PAT_${safe}_${s.date}.csv`, { type: 'text/csv' });
      });
      if (navigator.canShare({ files })) {
        // v26: share ONLY the CSV files (no `title`/`text` — see single-export
        // note above).
        await navigator.share({ files });
        // Share completed → mark all batched sessions exported.
        targets.forEach(markSessionExported);
        save();
        render();
        return;
      }
    } catch (err) {
      // Cancelled share sheet — respect it, mark nothing.
      if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) return;
      // Anything else → fall through to sequential downloads.
    }
  }

  // Fallback: download each CSV in turn, lightly staggered.
  for (const s of targets) {
    downloadCSV(s);
    await new Promise(r => setTimeout(r, 300));
  }
  targets.forEach(markSessionExported);
  save();
  render();
}

// ---------- v10: CSV Import ----------
// v11 update: header-name-based matching. Columns may appear in any order;
// the user may have renamed headers (via Settings → CSV Columns); columns
// they've hidden simply won't be present in their own exports. We accept all
// of these cases as long as we can still resolve the required fields.
//
// Default header names are ALWAYS recognised, so a CSV exported by an
// untouched install (or by another engineer using defaults) still imports
// regardless of the local CSV column config. The user's custom header names
// are recognised in addition to the defaults — never instead of them.
//
// Multi-session CSVs (someone manually concatenated two exports) are still
// refused — see PAThandoff_v10.md flag 1 and PAThandoff_v11.md backlog.

// v11: build a map from (lowercased, trimmed) header text → canonical column
// id, combining the defaults with whatever the user has configured locally.
// Used by parseImportCSV() to identify columns by name in any order.
function buildCsvHeaderLookup() {
  const map = {};
  // Defaults first so they always win on collision (the user could in theory
  // rename "Notes" to "Asset ID"; we keep the default mapping authoritative).
  DEFAULT_CSV_COLUMNS.forEach(d => {
    map[d.header.toLowerCase().trim()] = d.id;
  });
  // Then user customisations — only added if they don't collide with a default.
  state.csvColumns.forEach(c => {
    const key = String(c.header || '').toLowerCase().trim();
    if (key && !(key in map)) map[key] = c.id;
  });
  return map;
}

// Parse a CSV string into an array of row arrays. Handles double-quoted fields,
// escaped quotes (""), and embedded commas/newlines inside quoted fields.
// Returns null if the input is empty or fundamentally malformed.
function parseCSV(text) {
  if (typeof text !== 'string') return null;
  // Strip BOM if present (our own exports prepend \uFEFF)
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          // Escaped quote
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    // Not in quotes
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\n' || c === '\r') {
      row.push(field);
      field = '';
      // Skip \r\n combos
      if (c === '\r' && text[i + 1] === '\n') i++;
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // Trailing field / row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Trim trailing empty rows (last newline in a file produces an empty row)
  while (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
    rows.pop();
  }
  return rows.length ? rows : null;
}

// Convert "DD/MM/YYYY" back to "YYYY-MM-DD". Returns null if not a valid date.
function parseUkDateToIso(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dd = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const yyyy = parseInt(m[3], 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const iso = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  // Round-trip sanity — catches Feb 30 etc.
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d.getTime())) return null;
  if (d.getUTCDate() !== dd || (d.getUTCMonth() + 1) !== mm || d.getUTCFullYear() !== yyyy) return null;
  return iso;
}

// Parse and validate the CSV text into a candidate session. Returns either:
//   { ok: true, session, skipped: [{row, reason}] }
//   { ok: false, error: 'message to show user' }
//
// v11: header-name-based. The first line is parsed for header text, mapped to
// column ids via buildCsvHeaderLookup(), and the resulting positional map is
// used for all subsequent rows. Required columns: Asset ID, Description,
// Site, Date, Result. Engineer, Location, and Notes are optional. If a
// required column is absent from the header, we reject the file with a clear
// message before trying to parse rows.
function parseImportCSV(text) {
  const rows = parseCSV(text);
  if (!rows || rows.length === 0) {
    return { ok: false, error: 'The CSV file is empty.' };
  }

  // Map each header cell to a column id, dropping unknowns.
  const lookup = buildCsvHeaderLookup();
  const headerCells = rows[0].map(h => String(h || '').toLowerCase().trim());
  const colIdAt = headerCells.map(h => lookup[h] || null);

  // Build positional accessors for the required + optional fields.
  const idxOf = id => {
    const i = colIdAt.indexOf(id);
    return i === -1 ? null : i;
  };
  const iAsset  = idxOf('assetNo');
  const iEng    = idxOf('engineer');
  const iDesc   = idxOf('description');
  const iClient = idxOf('client');   // v26 (Q6=A): optional Client column
  const iSite   = idxOf('site');
  const iLoc    = idxOf('location');
  const iDate   = idxOf('date');
  const iResult = idxOf('result');
  const iNotes  = idxOf('notes');

  const missing = [];
  if (iAsset  === null) missing.push('Asset ID');
  if (iDesc   === null) missing.push('Description');
  if (iSite   === null) missing.push('Site');
  if (iDate   === null) missing.push('Date');
  if (iResult === null) missing.push('Result');
  if (missing.length) {
    return {
      ok: false,
      error:
        'This file is missing required column' + (missing.length === 1 ? '' : 's') + ': ' +
        missing.join(', ') + '.\n\n' +
        'Imports must be CSVs exported from this app. If you have hidden any of these ' +
        'columns under Settings → CSV Columns, re-enable them before exporting.'
    };
  }

  const dataRows = rows.slice(1);
  if (dataRows.length === 0) {
    return { ok: false, error: 'The CSV file has a header but no rows.' };
  }

  // First-pass scan: find canonical Site + Date from the first VALID row so a
  // single typo on row 1 doesn't reject the whole file.
  // v26 (Q6=A): if a Client column is present, the row's "site identity" is the
  // COMPOSED snapshot ("Client — Site"), matching how the app stores it — so a
  // two-column export round-trips to the same snapshot a one-column export of
  // the same session would. With no Client column, the composed value is just
  // the site text, i.e. exactly the pre-v26 behaviour.
  let canonicalSite = null;        // the composed snapshot used as session.site
  let canonicalClient = '';        // client part (for structured refs)
  let canonicalSiteOnly = '';      // site part (for structured refs)
  let canonicalIsoDate = null;
  let canonicalDateRaw = null;
  let canonicalEngineer = '';
  for (const r of dataRows) {
    const siteOnly = String(r[iSite] || '').trim();
    const clientPart = iClient !== null ? String(r[iClient] || '').trim() : '';
    const composed = composeSiteSnapshot(clientPart, siteOnly);
    const dateRaw = String(r[iDate] || '').trim();
    const iso = parseUkDateToIso(dateRaw);
    if (composed && iso) {
      canonicalSite = composed;
      canonicalClient = clientPart;
      canonicalSiteOnly = siteOnly;
      canonicalIsoDate = iso;
      canonicalDateRaw = dateRaw;
      canonicalEngineer = iEng !== null ? String(r[iEng] || '').trim() : '';
      break;
    }
  }
  if (!canonicalSite || !canonicalIsoDate) {
    return {
      ok: false,
      error: 'No rows in this file have both a Site (or Client) and a valid Date (DD/MM/YYYY). Cannot import.'
    };
  }

  // Check uniqueness — refuse multi-session CSVs.
  // v26: compare on the COMPOSED snapshot so a Client+Site pair is one identity.
  const siteLower = canonicalSite.toLowerCase();
  let multiSession = false;
  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    const siteOnly = String(r[iSite] || '').trim();
    const clientPart = iClient !== null ? String(r[iClient] || '').trim() : '';
    const composed = composeSiteSnapshot(clientPart, siteOnly);
    const dateRaw = String(r[iDate] || '').trim();
    if (!composed || !dateRaw) continue;
    if (composed.toLowerCase() !== siteLower || dateRaw !== canonicalDateRaw) {
      multiSession = true;
      break;
    }
  }
  if (multiSession) {
    return {
      ok: false,
      error:
        'This file contains rows from more than one session (different Client/Site or Date values).\n\n' +
        'Importing combined CSVs isn\'t supported yet — please export each session separately and import them one at a time.'
    };
  }

  // Build items + collect skipped row reports.
  const items = [];
  const skipped = [];
  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    const rowNum = i + 2; // +1 for header, +1 because humans count from 1
    const assetNo  = String(r[iAsset] || '').trim();
    const desc     = String(r[iDesc] || '').trim();
    const location = iLoc !== null ? String(r[iLoc] || '').trim() : '';
    const dateRaw  = String(r[iDate] || '').trim();
    const resultRawDisplay = String(r[iResult] || '').trim();
    const resultRaw = resultRawDisplay.toLowerCase();
    const notes    = iNotes !== null ? String(r[iNotes] || '').trim() : '';

    if (!assetNo) { skipped.push({ row: rowNum, reason: 'missing Asset ID' }); continue; }
    if (!desc)    { skipped.push({ row: rowNum, reason: 'missing Description' }); continue; }
    if (!dateRaw) { skipped.push({ row: rowNum, reason: 'missing Date' }); continue; }
    if (parseUkDateToIso(dateRaw) === null) {
      skipped.push({ row: rowNum, reason: 'invalid Date format (expected DD/MM/YYYY)' });
      continue;
    }
    // v11: accept both old 'Pass'/'Fail' and new 'Passed'/'Failed' wording,
    // case-insensitive. Normalise to internal 'pass'/'fail' for storage.
    let normResult = null;
    if (resultRaw === 'pass' || resultRaw === 'passed') normResult = 'pass';
    else if (resultRaw === 'fail' || resultRaw === 'failed') normResult = 'fail';
    if (!normResult) {
      skipped.push({ row: rowNum, reason: `invalid Result "${resultRawDisplay}" (expected Passed or Failed)` });
      continue;
    }
    items.push({
      id: uid(),
      assetNo,
      location,
      itemType: desc,
      notes,
      result: normResult
    });
  }
  if (items.length === 0) {
    return {
      ok: false,
      error:
        `No importable rows found in this file.\n\n` +
        `${skipped.length} row${skipped.length === 1 ? '' : 's'} could not be parsed.`
    };
  }
  const session = {
    id: uid(),
    name: `Imported: ${canonicalSite}`,
    site: canonicalSite,
    engineer: canonicalEngineer,
    prefix: '',
    date: canonicalIsoDate,
    startNumber: 1,
    items,
    locked: false
  };
  return { ok: true, session, skipped };
}

// Trigger point: user picked a file on the Sessions screen. We parse, then
// either prompt for conflict, show a summary, or alert on error.
function handleImportFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const result = parseImportCSV(String(e.target.result || ''));
    if (!result.ok) {
      openInfoSheet({ title: 'Couldn\u2019t import that file', message: result.error });
      return;
    }
    // Check for an existing session with the same Site (case-insensitive) AND
    // the same Date. If found, ask the user how to proceed.
    const incoming = result.session;
    const existing = state.sessions.find(s =>
      s && s.date === incoming.date &&
      (s.site || '').toLowerCase().trim() === (incoming.site || '').toLowerCase().trim()
    );
    if (existing) {
      state.importDialog.conflictOpen = true;
      state.importDialog.pendingSession = incoming;
      state.importDialog.conflictExistingId = existing.id;
      state.importDialog.summary = { skipped: result.skipped };  // stashed for after resolution
      render();
      return;
    }
    // No conflict — commit straight away.
    commitImportedSession(incoming, 'new', result.skipped);
  };
  reader.onerror = () => openInfoSheet({ title: 'Couldn\u2019t read that file', message: 'The file couldn\u2019t be opened. Please try again.' });
  reader.readAsText(file);
}

// Commit a parsed import into state. Mode is one of:
//   'new'       → push the parsed session as-is (no conflict)
//   'duplicate' → push as a separate session even though one already exists
//   'merge'     → append the imported items into the existing session
function commitImportedSession(incoming, mode, skipped) {
  let sessionName = incoming.site;
  let mergedInto = null;
  if (mode === 'merge' && state.importDialog.conflictExistingId) {
    const target = state.sessions.find(s => s.id === state.importDialog.conflictExistingId);
    if (target) {
      // Re-id incoming items to avoid any collision and append.
      const newItems = incoming.items.map(it => ({ ...it, id: uid() }));
      target.items = (target.items || []).concat(newItems);
      markSessionDirty(target);   // v14: merge invalidates a prior export
      mergedInto = target;
      sessionName = target.site || target.name;
    } else {
      // Existing vanished between prompt and confirm — fall through to duplicate.
      state.sessions.unshift(incoming);
    }
  } else {
    // new or duplicate — same behaviour, push to the top of the list.
    state.sessions.unshift(incoming);
  }
  state.importDialog = {
    conflictOpen: false,
    summaryOpen: true,
    pendingSession: null,
    conflictExistingId: null,
    summary: {
      mode,
      sessionName,
      itemCount: incoming.items.length,
      skipped: skipped || []
    }
  };
  // Add any new item-type descriptions to the global descriptions list so
  // autocomplete benefits from imported data immediately.
  incoming.items.forEach(it => addDescriptionIfNew(it.itemType));
  // v26: learn the imported session's Client/Site into the lists so they appear
  // as quick picks. Split the snapshot the same way the CSV split does: a
  // "Client — Site" snapshot creates the client and the site under it; a plain
  // (site-only) snapshot creates an orphan site (Q2/Q5). Idempotent — the
  // ensure* helpers return existing records, never duplicate.
  if (incoming.site) {
    const parts = splitSiteSnapshot(incoming.site);
    if (parts.client) {
      const c = ensureClient(parts.client);
      if (c && parts.site) ensureSite(c.id, parts.site);
    } else if (parts.site) {
      ensureOrphanSite(parts.site);
    }
  }
  save();
  render();
}

function cancelImportConflict() {
  state.importDialog = {
    conflictOpen: false,
    summaryOpen: false,
    pendingSession: null,
    conflictExistingId: null,
    summary: null
  };
  render();
}

function closeImportSummary() {
  state.importDialog = {
    conflictOpen: false,
    summaryOpen: false,
    pendingSession: null,
    conflictExistingId: null,
    summary: null
  };
  render();
}
