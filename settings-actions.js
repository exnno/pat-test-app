/*!
 * PATGo PWA
 * v70 (August 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PATGo PWA — v70 — Settings actions ==============
// Extracted from session.js in V70. Every top-level function here is BYTE
// IDENTICAL to its V69 form — the release is a move, not a rewrite.
//
// What lives here: the save/reset handlers behind the Settings screens.
// Per-page saves, Report Settings (text, logo, signature, cert filename tokens),
// CSV column ordering, the Export/Import Setup UI handlers, the editable list
// settings (item types, fail reasons, descriptions) and the appearance/feedback
// toggles (theme, haptics, sound, timestamps). Job notes, certificate-number
// override and report templates sit here too: they are saved from the same
// screens and share the same shape.
//
// What does NOT live here: how those screens are DRAWN (render-settings.js),
// what the defaults ARE (config.js), and the session/item lifecycle the values
// are eventually applied to (session.js). This file is the write half only.
//
// Load position: immediately after session.js. Cross-file calls resolve at call
// time, so the position is readability, not a constraint — but keeping it
// adjacent to its parent file is the point of the split.

// ---------- Settings: per-page saves (v7) ----------
function saveUserSettings() {
  state.engineer = document.getElementById('settings-engineer').value.trim();
  state.newForm.engineer = state.engineer;
  // v66: the tester make/model and calibration inputs are GONE from this page —
  // they moved to the per-instrument editor (renderSettingsInstrument in
  // instruments.js), which saves itself. The five flat state fields are now a
  // mirror of the active instrument and must never be written from here, or the
  // next syncActiveInstrumentMirror() would overwrite the write anyway.
  save();
  setView('settings');
}

// ---------- v30: Report Settings ----------

// Read the report-settings text inputs currently in the DOM into state. Used
// before any toggle-driven re-render so unsaved text isn't lost, and as the
// first half of the Save handler. Guards each lookup so it's safe to call when
// some fields aren't present.
function captureReportTextInputs() {
  const rs = state.reportSettings;
  const name = document.getElementById('report-company-name');
  const addr = document.getElementById('report-company-address');
  const title = document.getElementById('report-title');
  const decl = document.getElementById('report-declaration-text');
  const months = document.getElementById('report-retest-months');
  const fnpat = document.getElementById('report-filename-pattern');
  const certPrefix = document.getElementById('report-cert-prefix');
  const certPad = document.getElementById('report-cert-padding');
  const certNext = document.getElementById('report-cert-next');
  if (name) rs.companyName = name.value.trim();
  if (addr) rs.companyAddress = addr.value.replace(/\s+$/, '');
  if (title) rs.reportTitle = title.value.trim() || 'Portable Appliance Test Report';
  if (decl) rs.declarationText = decl.value.trim();
  if (fnpat) rs.reportFilenamePattern = fnpat.value.trim() || REPORT_FILENAME_DEFAULT;
  // v36: certificate-number fields.
  if (certPrefix) rs.certPrefix = certPrefix.value;
  if (certPad) {
    const p = parseInt(certPad.value, 10);
    rs.certPadding = (Number.isFinite(p) && p >= 0 && p <= 10) ? p : rs.certPadding;
  }
  if (certNext) {
    const nx = parseInt(certNext.value, 10);
    const was = rs.certNextNumber;
    rs.certNextNumber = (Number.isFinite(nx) && nx >= 1) ? nx : rs.certNextNumber;
    // v84: a number typed in by hand is deliberate — it beats "highest wins"
    // on your other devices (Q2A). Only a real change stamps it: this runs
    // before every toggle re-render too, and those must not count as a set.
    if (rs.certNextNumber !== was) rs.certSetAt = new Date().toISOString();
  }
  if (months) {
    const m = parseInt(months.value, 10);
    rs.retestMonths = (Number.isFinite(m) && m >= 1 && m <= 120) ? m : null;
  }
}

// Save handler for the Report Settings page. Captures the text inputs (toggles
// are already live in state) and persists. If retest is on but no valid month
// value was entered, we turn retest off rather than print a meaningless date.
function saveReportSettingsForm() {
  captureReportTextInputs();
  const rs = state.reportSettings;
  if (rs.retestEnabled && rs.retestMonths == null) {
    rs.retestEnabled = false;
    showToast('Retest needs a period in months (1–120) — left off for now');
  }
  saveReportSettings();
  // v35: if we came from the report preview's "Edit settings" deep-link, Save
  // returns straight to a freshly-rebuilt preview instead of the settings hub.
  if (state.reportPreviewReturnSessionId) {
    const sid = state.reportPreviewReturnSessionId;
    state.reportPreviewReturnSessionId = null;
    setView('reports');
    reopenReportPreview(sid);
    return;
  }
  setView('settings');
}

// Logo upload: read the chosen image, downscale its longest edge to
// REPORT_LOGO_MAX_PX via a canvas, and store the result as a base64 data URL on
// reportSettings.logo. Runs entirely in the browser (no network). Errors surface
// inline via state.reportSettingsError. Capture text inputs first so an in-
// progress edit survives the post-load re-render.
function handleReportLogoFile(file) {
  state.reportSettingsError = '';
  if (!file) return;
  if (!/^image\/(png|jpeg)$/.test(file.type)) {
    state.reportSettingsError = 'Please choose a PNG or JPEG image.';
    render();
    return;
  }
  captureReportTextInputs();
  // v42: if the logo is being added during first-run onboarding, also capture the
  // wizard's own company-name field so it survives this handler's render().
  if (!state.onboardedV33Seen && typeof captureWizardStep === 'function') captureWizardStep();
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxPx = (typeof REPORT_LOGO_MAX_PX === 'number') ? REPORT_LOGO_MAX_PX : 600;
        let { width, height } = img;
        if (width > maxPx || height > maxPx) {
          const scale = maxPx / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const cx = canvas.getContext('2d');
        cx.drawImage(img, 0, 0, width, height);
        // PNG preserves logo transparency; JPEG sources still export fine as PNG.
        state.reportSettings.logo = canvas.toDataURL('image/png');
        state.reportSettingsError = '';
        saveReportSettings();
      } catch (err) {
        state.reportSettingsError = 'Could not process that image. Try a different file.';
      }
      render();
    };
    img.onerror = () => { state.reportSettingsError = 'Could not read that image.'; render(); };
    img.src = e.target.result;
  };
  reader.onerror = () => { state.reportSettingsError = 'Could not read that file.'; render(); };
  reader.readAsDataURL(file);
}

// ---------- v34: report signature (draw OR upload) ----------
// Shared store path. Takes a source <img> or <canvas>, downscales the longest
// edge to REPORT_SIGNATURE_MAX_PX, and stores a PNG data URL on
// reportSettings.signature. Both the upload handler and the draw-pad save call
// this so a drawn and an uploaded signature obey the same size cap and end up
// as the identical string shape (which is what makes backup/setup round-trip
// "for free"). Returns true on success.
function storeSignatureFromSource(src, srcW, srcH) {
  try {
    const maxPx = (typeof REPORT_SIGNATURE_MAX_PX === 'number') ? REPORT_SIGNATURE_MAX_PX : 400;
    let width = srcW, height = srcH;
    if (width > maxPx || height > maxPx) {
      const scale = maxPx / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const cx = canvas.getContext('2d');
    cx.drawImage(src, 0, 0, width, height);
    state.reportSettings.signature = canvas.toDataURL('image/png');
    state.reportSettingsError = '';
    saveReportSettings();
    return true;
  } catch (err) {
    state.reportSettingsError = 'Could not process that signature. Try again.';
    return false;
  }
}

// Upload path — mirrors handleReportLogoFile exactly.
function handleReportSignatureFile(file) {
  state.reportSettingsError = '';
  if (!file) return;
  if (!/^image\/(png|jpeg)$/.test(file.type)) {
    state.reportSettingsError = 'Please choose a PNG or JPEG image.';
    render();
    return;
  }
  captureReportTextInputs();
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => { storeSignatureFromSource(img, img.width, img.height); render(); };
    img.onerror = () => { state.reportSettingsError = 'Could not read that image.'; render(); };
    img.src = e.target.result;
  };
  reader.onerror = () => { state.reportSettingsError = 'Could not read that file.'; render(); };
  reader.readAsDataURL(file);
}

// Remove the stored signature.
function removeReportSignature() {
  captureReportTextInputs();
  state.reportSettings.signature = '';
  saveReportSettings();
  render();
}

// Position toggle ('left' | 'right').
function setSignaturePosition(pos) {
  captureReportTextInputs();
  state.reportSettings.signaturePosition = (pos === 'right') ? 'right' : 'left';
  saveReportSettings();
  render();
}

// ----- Draw pad -----
// Open/close the bottom-sheet pad. Opening captures any in-progress text edits
// first (the pad triggers a re-render) and resets the ink flag.
function openSignaturePad() {
  captureReportTextInputs();
  state.signaturePadOpen = true;
  state.signaturePadHasInk = false;
  render();
}
function closeSignaturePad() {
  state.signaturePadOpen = false;
  state.signaturePadHasInk = false;
  render();
}

// Save whatever has been drawn. Reads the live pad canvas, trims nothing (keeps
// it simple + reliable), stores via the shared path, then closes the sheet.
// Guarded by signaturePadHasInk in the UI so this is only reachable with strokes.
function saveDrawnSignature() {
  const canvas = document.getElementById('sig-pad-canvas');
  if (!canvas) { closeSignaturePad(); return; }
  // The canvas backing store may be DPR-scaled; storeSignatureFromSource copies
  // it through its own downscale so the saved PNG respects REPORT_SIGNATURE_MAX_PX.
  const ok = storeSignatureFromSource(canvas, canvas.width, canvas.height);
  state.signaturePadOpen = false;
  state.signaturePadHasInk = false;
  if (!ok) { render(); return; }
  render();
}
// user's ordering, visibility checks, and renamed headers are all picked up
// in one pass.
//
// Validation:
//   • At least one column must be visible. Otherwise we'd produce CSVs with
//     just a blank line, which is useless.
//   • Empty / whitespace-only header text falls back to the default header
//     for that column id rather than erroring out — a one-character typo
//     shouldn't block the save.
function saveCsvColumnsSettings() {
  const rows = document.querySelectorAll('.csv-col-row');
  if (!rows.length) { setView('settings'); return; }
  const next = [];
  rows.forEach(row => {
    const id = row.dataset.colId;
    if (!id) return;
    const visEl = row.querySelector('.csv-col-visible');
    const hdrEl = row.querySelector('.csv-col-header');
    const visible = visEl ? !!visEl.checked : true;
    let header = hdrEl ? String(hdrEl.value || '').trim() : '';
    if (!header) header = defaultHeaderFor(id);
    next.push({ id, header, visible });
  });
  if (!next.some(c => c.visible)) {
    showToast('Tick at least one column before saving');
    return;
  }
  state.csvColumns = next;
  ensureAllCsvColumns();
  save();
  setView('settings');
}

function resetCsvColumnsSettings() {
  openConfirmSheet({
    title: 'Reset CSV columns?',
    message: 'This restores the original 8-column order, default header names, and shows all columns. Cannot be undone.',
    confirmLabel: 'Reset',
    onConfirm: () => {
      state.csvColumns = DEFAULT_CSV_COLUMNS.map(c => ({ ...c }));
      save();
      render();
      showToast('CSV columns reset');
    }
  });
}

// v11: move a CSV column up or down in the list and re-render the settings
// page. We re-read the live DOM values first so any unsaved edits to header
// text or visibility don't get clobbered by the re-render.
function moveCsvColumn(id, delta) {
  // Snapshot pending edits from the DOM before mutating state, otherwise the
  // re-render below would revert anything the user has typed but not saved.
  const rows = document.querySelectorAll('.csv-col-row');
  if (rows.length) {
    const pending = [];
    rows.forEach(row => {
      const rid = row.dataset.colId;
      if (!rid) return;
      const visEl = row.querySelector('.csv-col-visible');
      const hdrEl = row.querySelector('.csv-col-header');
      pending.push({
        id: rid,
        header: hdrEl ? String(hdrEl.value || '') : '',
        visible: visEl ? !!visEl.checked : true
      });
    });
    if (pending.length === state.csvColumns.length) {
      state.csvColumns = pending;
    }
  }
  const idx = state.csvColumns.findIndex(c => c.id === id);
  if (idx === -1) return;
  const newIdx = idx + delta;
  if (newIdx < 0 || newIdx >= state.csvColumns.length) return;
  const arr = state.csvColumns;
  [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
  render();
}

// ---------- v36: job notes, certificate override, report templates ----------

// Save the per-session job note (from the Overview text area). Persists and
// re-renders. Empty is fine (clears the note).
function saveSessionNotes(sessionId, text) {
  const s = state.sessions.find(x => x.id === sessionId);
  if (!s) return;
  s.notes = String(text || '').trim();
  save();
}

// Manual certificate-number override (A3). Sets the session's certNo to a
// user-supplied value; warns (but allows) if it duplicates another session's.
// Empty clears it (so the next report re-stamps from the counter).
function setSessionCertNo(sessionId, value) {
  const s = state.sessions.find(x => x.id === sessionId);
  if (!s) return;
  const v = String(value || '').trim();
  const commit = () => { s.certNo = v; save(); render(); };
  if (v) {
    const dupe = state.sessions.some(x => x.id !== sessionId && x.certNo === v);
    if (dupe) {
      openConfirmSheet({
        title: 'Duplicate certificate number',
        message: `Certificate number "${v}" is already used by another session. Use it anyway?`,
        confirmLabel: 'Use it',
        danger: false,
        onConfirm: commit
      });
      return;
    }
  }
  commit();
}

// Apply a saved template (C1=B: a full reportSettings snapshot). Overwrites the
// live reportSettings — including branding — so we confirm first, naming the
// template. The applied snapshot is re-normalised defensively.
function applyReportTemplate(templateId) {
  const tpl = (state.reportTemplates || []).find(t => t.id === templateId);
  if (!tpl) return;
  openConfirmSheet({
    title: 'Apply template?',
    message: `Apply the "${tpl.name}" template? This replaces your current report settings (including logo, signature and colours).`,
    confirmLabel: 'Apply',
    danger: false,
    onConfirm: () => {
      // v84 (Q3A): a template never carries the certificate counter. Before
      // V84 applying one rewound the counter to wherever it stood when the
      // template was saved ("Standard": to 1), so the next certificates reused
      // numbers already issued. The live counter and its set-time stay put.
      const keep = normaliseReportSettings(state.reportSettings);
      state.reportSettings = normaliseReportSettings(tpl.settings);
      state.reportSettings.certNextNumber = keep.certNextNumber;
      state.reportSettings.certSetAt = keep.certSetAt;
      saveReportSettings();
      render();
      showToast(`Applied "${tpl.name}"`);
    }
  });
}

// Save the CURRENT live reportSettings as a new named template, or overwrite an
// existing one of the same name. Prompts for a name via a bottom-sheet-free
// simple prompt fallback is avoided — name is passed in from the UI handler.
function saveCurrentAsTemplate(name) {
  const nm = String(name || '').trim();
  if (!nm) return;
  const snapshot = normaliseReportSettings(state.reportSettings);
  const existing = (state.reportTemplates || []).find(t => t.name.toLowerCase() === nm.toLowerCase());
  if (existing) {
    existing.settings = snapshot;
  } else {
    state.reportTemplates.push({
      id: 'tpl_' + newId(),     // v84: synced, so a real id (was Math.random)
      name: nm,
      settings: snapshot
    });
  }
  saveReportTemplates();
  render();
  showToast(existing ? `Updated "${nm}"` : `Saved "${nm}"`);
}

function renameReportTemplate(templateId, name) {
  const tpl = (state.reportTemplates || []).find(t => t.id === templateId);
  const nm = String(name || '').trim();
  if (!tpl || !nm) return;
  tpl.name = nm;
  saveReportTemplates();
  render();
  showToast('Template renamed');
}

// v40: delete the template (no native confirm here — the confirm sheet in
// dispatch.js gates this; this is the data operation only).
function deleteReportTemplate(templateId) {
  const tpl = (state.reportTemplates || []).find(t => t.id === templateId);
  if (!tpl) return;
  // v84: ledger first (MAP rule 5), so the delete travels to your other devices.
  recordTombstone('template', templateId);
  state.reportTemplates = state.reportTemplates.filter(t => t.id !== templateId);
  saveReportTemplates();
  save();                  // v84: the ledger is written by save() (rule 1), which also reaches the sync trigger
  render();
  showToast('Template deleted');
}

// ---------- v31: Export/Import Setup UI handlers ----------

// Toggle the "Choose what to include" disclosure on the Backup page.
function toggleSetupIncludeOpen() {
  state.setupIncludeOpen = !state.setupIncludeOpen;
  state.setupError = '';
  render();
}

// Tick/untick one include section. `on` comes from the checkbox.
function setSetupInclude(sectionId, on) {
  if (!state.setupInclude) state.setupInclude = {};
  state.setupInclude[sectionId] = !!on;
  state.setupError = '';
  // No full re-render needed (the checkbox reflects itself), but keep state and
  // the disclosure open. A light re-render keeps the markup authoritative.
}

// Insert a filename token into the report filename pattern field at the caret
// (falls back to appending). Updates state so a subsequent render keeps it.
function insertReportFilenameToken(token) {
  const inp = document.getElementById('report-filename-pattern');
  if (!inp) return;
  const start = (typeof inp.selectionStart === 'number') ? inp.selectionStart : inp.value.length;
  const end = (typeof inp.selectionEnd === 'number') ? inp.selectionEnd : inp.value.length;
  const v = inp.value;
  inp.value = v.slice(0, start) + token + v.slice(end);
  // Keep the field's settings in step so Save (which reads the DOM) is correct.
  state.reportSettings.reportFilenamePattern = inp.value.trim() || REPORT_FILENAME_DEFAULT;
  // Restore caret just after the inserted token.
  const pos = start + token.length;
  // v75: focus without the document scroll; the caret restore stays separate so
  // a browser that rejects the focus options object still gets its selection set.
  focusInSheet(inp);
  try { inp.setSelectionRange(pos, pos); } catch (e) {}
}

// Share setup. Builds a default name from the company name (if set) and opens a
// small bottom sheet to confirm/edit it, then shares. At least one section must
// be ticked. Built directly in the DOM (like the report preview) so it overlays
// without a view change and works reliably in the iOS PWA.
function startShareSetup() {
  const inc = state.setupInclude || {};
  const anyOn = SETUP_SECTIONS.some(s => inc[s.id]);
  if (!anyOn) {
    state.setupError = 'Pick at least one thing to include before sharing.';
    state.setupIncludeOpen = true;
    render();
    return;
  }
  state.setupError = '';
  const company = (state.reportSettings && state.reportSettings.companyName || '').trim();
  const defaultName = company ? `${company} setup` : 'PAT setup';

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.style.zIndex = '300';
  const sheet = document.createElement('div');
  sheet.className = 'bulk-sheet';
  sheet.style.zIndex = '301';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Name this setup');
  const included = SETUP_SECTIONS.filter(s => inc[s.id]).map(s => s.label);
  sheet.innerHTML = `
    <div class="bulk-sheet-handle"></div>
    <div class="bulk-sheet-header">
      <span class="fail-close-spacer"></span>
      <h3 class="bulk-sheet-title">Name this setup</h3>
      <button class="fail-close-btn" id="setup-name-cancel" aria-label="Cancel">×</button>
    </div>
    <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:var(--text-muted)">Give this setup a name so it's easy to recognise when importing it later.</p>
    <input class="input" id="setup-name-input" value="${escapeHTML(defaultName)}" autocapitalize="on" autocomplete="off" maxlength="60">
    <p style="margin:12px 0 4px;font-size:12px;color:var(--text-muted)">Includes: ${escapeHTML(included.join(', '))}</p>
    <button class="btn-primary" id="setup-name-share" style="margin-top:12px">Share</button>
  `;

  function cleanup() { backdrop.remove(); sheet.remove(); }
  backdrop.addEventListener('click', cleanup);
  document.getElementById && document.body.appendChild(backdrop);
  document.body.appendChild(sheet);
  const cancelBtn = document.getElementById('setup-name-cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', cleanup);
  const shareBtn = document.getElementById('setup-name-share');
  if (shareBtn) shareBtn.addEventListener('click', async () => {
    const inp = document.getElementById('setup-name-input');
    const label = inp ? inp.value.trim() : defaultName;
    cleanup();
    await shareSetup(label || defaultName, state.setupInclude);
  });
  const nameInput = document.getElementById('setup-name-input');
  if (nameInput) { focusInSheet(nameInput); try { nameInput.select(); } catch (e) {} }
}

function saveItemTypesSettings() {
  const types = document.getElementById('settings-types').value
    .split('\n').map(s => s.trim()).filter(Boolean).slice(0, 9);
  // v9: writes to the currently active preset, not a global itemTypes array.
  const p = activePreset();
  if (p) {
    p.items = types.length ? types : DEFAULT_ITEM_TYPES.slice();
    syncItemTypesFromActivePreset();
  }
  save();
  setView('settings');
}

function saveFailReasonsSettings() {
  const reasons = document.getElementById('settings-reasons').value
    .split('\n').map(s => s.trim()).filter(Boolean).slice(0, 6);
  state.failReasons = reasons.length ? reasons : DEFAULT_FAIL_REASONS.slice();
  save();
  setView('settings');
}

function saveDescriptionsSettings() {
  const rawDescs = document.getElementById('settings-descriptions').value
    .split('\n').map(s => s.trim()).filter(Boolean);
  const seen = new Set();
  state.descriptions = rawDescs.filter(d => {
    const l = d.toLowerCase();
    if (seen.has(l)) return false;
    seen.add(l);
    return true;
  });
  save();
  setView('settings');
}

// v9: Reset-to-defaults helpers — overwrite the current list with the built-in
// defaults. Each prompts to confirm because they're destructive.
// Items: resets the *current preset* only, not all presets.
function resetItemsToDefaults() {
  const p = activePreset();
  if (!p) return;
  openConfirmSheet({
    title: 'Reset preset?',
    message: `Reset preset "${p.name}" to default items? This replaces the current list with the 9 built-in defaults. Other presets are not affected.`,
    confirmLabel: 'Reset',
    onConfirm: () => {
      p.items = DEFAULT_ITEM_TYPES.slice();
      syncItemTypesFromActivePreset();
      save();
      render();
      showToast('Preset reset to defaults');
    }
  });
}

function resetFailReasonsToDefaults() {
  openConfirmSheet({
    title: 'Reset fail reasons?',
    message: 'Reset Quick Pick Fail to the built-in default reasons? This replaces the current list.',
    confirmLabel: 'Reset',
    onConfirm: () => {
      state.failReasons = DEFAULT_FAIL_REASONS.slice();
      save();
      render();
      showToast('Fail reasons reset');
    }
  });
}

function resetDescriptionsToDefaults() {
  openConfirmSheet({
    title: 'Reset descriptions?',
    message: 'Reset the Item Description List to the built-in defaults? This replaces the current list. Items already saved in past sessions are unaffected.',
    confirmLabel: 'Reset',
    onConfirm: () => {
      state.descriptions = DEFAULT_DESCRIPTIONS.slice();
      save();
      render();
      showToast('Descriptions reset');
    }
  });
}

function setTheme(theme) {
  state.theme = theme;
  applyTheme(theme);
  save();
  render();   // re-render to update radio button highlights
}

function setHaptics(enabled) {
  state.hapticsEnabled = !!enabled;
  save();
  // No re-render needed — toggle visual handled by checkbox state
}

// v17: opt-in sound feedback. Flipping it on plays a sample pass tone so the
// user immediately hears what they've enabled (and it doubles as the first
// user-gesture that unlocks the AudioContext on iOS). Flipping off is silent.
function setSound(enabled) {
  state.soundEnabled = !!enabled;
  save();
  if (state.soundEnabled) playSound('pass');
}

// v17: item timestamps on/off.
// v61: this NO LONGER GATES CAPTURE. `ts` is now stamped on every item's first
// log regardless of this flag (see saveItem and the note in config.js); the flag
// gates EXPOSURE only — the Time line under an item in the Overview, and the
// Time column in the CSV. Existing items are untouched either way: turning it on
// doesn't backfill anything, turning it off doesn't strip stamps already
// recorded. Nothing here needed to change for v61 — this comment did, because
// the old one now describes behaviour the app no longer has.
function setTimestamps(enabled) {
  state.timestampsEnabled = !!enabled;
  save();
}

// ============== V90 (R18) — the photo manager ==============
// Settings → Backup → Manage photos. See what's on this phone and what's in the
// cloud, and decide what stays where — iMessage "review attachments" style.
// Markup: renderPhotoManager() in render-review.js. State: state.photoMgr
// (state.js), all transient. Actions: pm-* in dispatch.js.
//
// It READS only what the phone already knows (state.photoMeta — this phone's
// photos; state.photoCloud — photos known in the cloud, V89) until the engineer
// taps "Look in the cloud" (3A), which reads rows only (sync.js syncPhotoBrowse)
// and keeps them in memory. Every action goes through a path that already
// existed:
//   remove from phone = photosRemoveQuiet (known-in-cloud only, notes nothing)
//   download          = syncPhotoDownload (cloud-only photos of jobs HERE — 4A)
//   delete            = photoDelete / photoDeleteCloudOnly (the V89 ledger path);
//                       a photo found by the look is made known first
//                       (syncPhotoKnowForDelete), then the same ledger path.
// ⚠ 8A: nothing on a LOCKED job is deleted here, signed in or out. Removing it
// from the phone is fine — the cloud keeps it.
//
// The screen has no text inputs (two selects only), so it may render() freely;
// previews arriving are painted in place, not by a render.

function _pmVisible() {
  return typeof _photoCloudVisible === 'function' && _photoCloudVisible();
}

function _pmReset(keepView) {
  const old = state.photoMgr || {};
  state.photoMgr = {
    filter: keepView ? (old.filter || 'all') : 'all',
    sort: keepView ? (old.sort || 'newest') : 'newest',
    selecting: false,
    selected: {},
    shown: 0,
    busy: '',
    cloud: null,
    preview: null,
    thumbGen: (old.thumbGen || 0) + 1,   // stops a preview round still going
  };
}

function photoMgrOpen() {
  _pmReset(false);
  setView('photoManager');
  photoMgrLoadThumbs();
}

// Called by setView() on every navigation away. Cheap when there is nothing to do.
function photoMgrLeave() {
  const pm = state.photoMgr;
  if (!pm) return;
  if (pm.preview && pm.preview.own && typeof photoReleaseObjectUrls === 'function') photoReleaseObjectUrls();
  // A fresh object: anything still running for the old screen sees it has gone
  // (state.photoMgr !== pm) and stops. The cloud look is not kept (3A: re-read).
  _pmReset(false);
}

function _pmJobInfo(e, sessById, pm) {
  const sess = sessById.get(e.s);
  if (sess) {
    return {
      onPhone: true, locked: !!sess.locked, orphan: false,
      title: sess.site || sess.name || 'Untitled job',
      client: (typeof clientNameForSession === 'function') ? clientNameForSession(sess) : '',
      date: sess.date || '',
    };
  }
  const cl = pm.cloud;
  const j = (cl && cl.ok && cl.jobs) ? cl.jobs[e.s] : null;
  // No job (5A) only when the look ASKED about it and the cloud had none, or a
  // deleted one. A job never asked about (a capped look) is just unnamed.
  const asked = !!(cl && cl.ok && Array.isArray(cl.asked) && cl.asked.indexOf(e.s) !== -1);
  if (asked && (!j || j.deleted)) {
    return { onPhone: false, locked: false, orphan: true, title: 'Photos with no job', client: '', date: '' };
  }
  if (j) {
    const c = (j.clientId && typeof clientById === 'function') ? clientById(j.clientId) : null;
    return { onPhone: false, locked: !!j.locked, orphan: false,
      title: j.site || j.name || 'Untitled job', client: c ? c.name : '', date: j.date || '' };
  }
  return { onPhone: false, locked: false, orphan: false, title: 'A job not on this phone', client: '', date: '' };
}

// Everything the manager knows, as one list, plus the groups on screen.
// Synchronous — render() calls it (MAP rule 2).
function photoMgrModel() {
  if (!state.photoMgr) _pmReset(false);
  const pm = state.photoMgr;
  const vis = _pmVisible();
  const meta = state.photoMeta || {};
  const known = vis ? (state.photoCloud || {}) : {};
  const gone = new Set();
  for (const t of (state.tombstones || [])) if (t && t.kind === 'photo') gone.add(String(t.id));
  const sessById = new Map();
  for (const s of (state.sessions || [])) if (s && s.id != null) sessById.set(String(s.id), s);

  const all = [];
  for (const id of Object.keys(meta)) {
    const m = meta[id] || {};
    all.push({ id, s: String(m.s || ''), i: String(m.i || ''), b: m.b || 0, a: m.at || '',
      local: true, cloud: !!known[id], src: 'phone', t: !!(known[id] && known[id].t) });
  }
  if (vis) {
    for (const id of Object.keys(known)) {
      if (meta[id] || gone.has(id)) continue;
      const e = known[id];
      if (!e || !e.s || !e.i) continue;
      all.push({ id, s: e.s, i: e.i, b: e.b || 0, a: e.a || '', local: false, cloud: true, src: 'known', t: !!e.t });
    }
    const cl = pm.cloud;
    if (cl && cl.ok && Array.isArray(cl.rows)) {
      for (const r of cl.rows) {
        if (meta[r.id] || known[r.id] || gone.has(r.id)) continue;
        // A job on this phone learns its own rows through the pull (rule 24).
        if (sessById.has(r.s)) continue;
        all.push({ id: r.id, s: r.s, i: r.i, b: r.b || 0, a: r.a || '', local: false, cloud: true, src: 'browse', t: !!r.t });
      }
    }
  }
  const byId = new Map();
  for (const e of all) { Object.assign(e, _pmJobInfo(e, sessById, pm)); byId.set(e.id, e); }

  // Totals (6A). The cloud line says what it covers: before a look, only what
  // this phone knows; after, everything the account holds.
  const totals = { phoneN: 0, phoneB: 0, cloudN: 0, cloudB: 0, cloudAll: false };
  for (const e of all) if (e.local) { totals.phoneN++; totals.phoneB += e.b || 0; }
  if (vis) {
    const cl = pm.cloud;
    if (cl && cl.ok && Array.isArray(cl.rows)) {
      totals.cloudAll = !cl.capped;
      for (const r of cl.rows) if (!gone.has(r.id)) { totals.cloudN++; totals.cloudB += r.b || 0; }
    } else {
      for (const id of Object.keys(known)) if (!gone.has(id)) { totals.cloudN++; totals.cloudB += (known[id] && known[id].b) || 0; }
    }
  }

  const f = vis ? (pm.filter || 'all') : 'all';
  const keep = (e) => f === 'all' || (f === 'phone' && e.local) || (f === 'cloud' && !e.local)
    || (f === 'notup' && e.local && !e.cloud);

  const groups = new Map();
  for (const e of all) {
    if (!keep(e)) continue;
    const key = e.orphan ? '~orphan' : e.s;
    let g = groups.get(key);
    if (!g) {
      g = { key, title: e.title, client: e.client, date: e.date, onPhone: e.onPhone, locked: e.locked,
            orphan: e.orphan, photos: [], bytes: 0, last: '' };
      groups.set(key, g);
    }
    g.photos.push(e);
    g.bytes += e.b || 0;
    if (String(e.a) > g.last) g.last = String(e.a);
  }
  const list = Array.from(groups.values());
  list.forEach((g) => g.photos.sort((a, b) => String(a.a).localeCompare(String(b.a)) || a.id.localeCompare(b.id)));
  const when = (g) => g.date || String(g.last).slice(0, 10);
  const sort = pm.sort || 'newest';
  list.sort((a, b) => {
    if (a.orphan !== b.orphan) return a.orphan ? 1 : -1;          // no job: always last
    if (sort === 'space' && a.bytes !== b.bytes) return b.bytes - a.bytes;
    const d = when(a).localeCompare(when(b));
    if (d) return sort === 'oldest' ? d : -d;
    return String(a.title).localeCompare(String(b.title)) || a.key.localeCompare(b.key);
  });

  // One page at a time (11A): a grid of hundreds never builds at once.
  const page = (typeof PHOTO_MGR_PAGE === 'number') ? PHOTO_MGR_PAGE : 48;
  const limit = pm.shown > 0 ? pm.shown : page;
  let total = 0;
  for (const g of list) total += g.photos.length;
  let left = limit;
  const shownGroups = [];
  for (const g of list) {
    if (left <= 0) break;
    const take = g.photos.slice(0, left);
    left -= take.length;
    shownGroups.push(Object.assign({}, g, { shown: take }));
  }
  return { vis, filter: f, groups: shownGroups, allGroups: list, total,
    more: Math.max(0, total - limit), byId, totals };
}

function _pmSelected(ids) {
  const model = photoMgrModel();
  const want = Array.isArray(ids) ? ids : Object.keys(state.photoMgr.selected || {});
  return want.map((id) => model.byId.get(String(id))).filter(Boolean);
}

function _pmPaint(thumbs) {
  render();
  if (thumbs) photoMgrLoadThumbs();
}

// ---- previews (11A) ----
// Tiles show small previews: a cloud photo's comes down (about 10 KB, only for
// tiles on screen); this phone's own is made here from the photo (a full
// 1280px picture per tile would fill a phone's memory). Kept for the session
// (photos.js), so scrolling back or reopening costs nothing. One at a time.
function _pmWithin(p, ms) {
  let timer = null;
  return Promise.race([p, new Promise((res) => { timer = setTimeout(() => res(null), ms); })])
    .then((v) => { if (timer) clearTimeout(timer); return v; });
}

function _pmThumbFor(e) {
  if (e.local) {
    if (typeof photoThumbBlob !== 'function') return Promise.resolve(null);
    return photoBlob(e.id).then((b) => b ? _pmWithin(photoThumbBlob(b), 8000) : null);
  }
  if (!e.t || typeof syncPhotoThumb !== 'function') return Promise.resolve(null);
  return syncPhotoThumb(e.id, e.src === 'browse' ? { t: 1 } : undefined);
}

function _pmPaintThumb(id, url) {
  try {
    const el = document.getElementById('pm-t-' + id);
    if (el && url) el.innerHTML = `<img src="${escapeHTML(url)}" alt="" loading="lazy">`;
  } catch { /* the next render shows it */ }
}

function photoMgrLoadThumbs() {
  const pm = state.photoMgr;
  if (!pm || state.view !== 'photoManager') return Promise.resolve();
  const gen = pm.thumbGen = (pm.thumbGen || 0) + 1;
  const model = photoMgrModel();
  const want = [];
  for (const g of model.groups) for (const e of g.shown) if (!photoThumbCached(e.id)) want.push(e);
  return want.reduce((chain, e) => chain.then(() => {
    // A newer round (or leaving the screen) stops this one starting more…
    if (state.photoMgr !== pm || pm.thumbGen !== gen || state.view !== 'photoManager') return null;
    return _pmThumbFor(e).then((blob) => {
      // …but a preview already on its way is kept: it was paid for.
      if (!blob) return;
      const url = photoThumbRemember(e.id, blob);
      if (state.view === 'photoManager') _pmPaintThumb(e.id, url);
      if (pm.preview && pm.preview.id === e.id && !pm.preview.url) { pm.preview.url = url; pm.preview.loading = false; render(); }
    }, () => null);
  }), Promise.resolve()).catch(() => { /* a missing preview stays a placeholder */ });
}

// ---- controls ----
function photoMgrSetFilter(v) {
  const ok = ['all', 'phone', 'cloud', 'notup'];
  state.photoMgr.filter = ok.indexOf(v) === -1 ? 'all' : v;
  state.photoMgr.shown = 0;
  _pmPaint(true);
}

function photoMgrSetSort(v) {
  const ok = ['newest', 'oldest', 'space'];
  state.photoMgr.sort = ok.indexOf(v) === -1 ? 'newest' : v;
  state.photoMgr.shown = 0;
  _pmPaint(true);
}

function photoMgrShowMore() {
  const page = (typeof PHOTO_MGR_PAGE === 'number') ? PHOTO_MGR_PAGE : 48;
  const pm = state.photoMgr;
  pm.shown = (pm.shown > 0 ? pm.shown : page) + page;
  _pmPaint(true);
}

// 7A: Select → tap tiles; a job heading's tick takes the whole job.
function photoMgrToggleSelecting() {
  const pm = state.photoMgr;
  if (pm.busy) return;
  pm.selecting = !pm.selecting;
  if (!pm.selecting) pm.selected = {};
  _pmPaint(false);
}

function photoMgrTile(id) {
  const pm = state.photoMgr;
  if (!id || pm.busy) return;
  if (!pm.selecting) { photoMgrPreview(id); return; }
  if (pm.selected[id]) delete pm.selected[id]; else pm.selected[id] = true;
  _pmPaint(false);
}

function photoMgrSelectJob(key) {
  const pm = state.photoMgr;
  if (!pm.selecting || pm.busy) return;
  const g = photoMgrModel().allGroups.find((x) => x.key === key);
  if (!g) return;
  const all = g.photos.every((e) => pm.selected[e.id]);
  g.photos.forEach((e) => { if (all) delete pm.selected[e.id]; else pm.selected[e.id] = true; });
  _pmPaint(false);
}

function _pmForget(ids) {
  const pm = state.photoMgr;
  (ids || []).forEach((id) => { delete pm.selected[id]; });
  if (pm.preview && (ids || []).indexOf(pm.preview.id) !== -1) photoMgrPreviewClose(true);
}

// ---- 3A: Look in the cloud ----
function photoMgrLook() {
  const pm = state.photoMgr;
  if (!_pmVisible() || typeof syncPhotoBrowse !== 'function') return;
  if (pm.cloud && pm.cloud.loading) return;
  if (typeof _syncOffline === 'function' && _syncOffline()) {
    showToast('No signal \u2014 try again when you\u2019re connected');
    return;
  }
  const prev = pm.cloud;
  pm.cloud = Object.assign({}, prev || {}, { loading: true, error: '' });
  _pmPaint(false);
  syncPhotoBrowse().then((res) => {
    if (state.photoMgr !== pm) return;             // left the screen meanwhile
    if (res.ok) {
      pm.cloud = { ok: true, loading: false, error: '', at: new Date().toISOString(),
        rows: res.rows, jobs: res.jobs, asked: res.asked, capped: !!res.capped };
    } else {
      pm.cloud = Object.assign({}, prev && prev.ok ? prev : { ok: false, rows: [], jobs: {}, asked: [] }, {
        loading: false,
        error: res.offline ? 'No signal \u2014 try again when you\u2019re connected.' : (res.error || 'Couldn\u2019t reach the cloud. Try again.'),
      });
    }
    pm.shown = 0;
    if (state.view === 'photoManager') _pmPaint(true);
  });
}

// ---- the preview (tap a tile outside Select) ----
function photoMgrPreview(id) {
  const pm = state.photoMgr;
  const e = photoMgrModel().byId.get(String(id));
  if (!e) return;
  pm.preview = { id: e.id, url: photoThumbCached(e.id) || '', loading: true, own: false };
  _pmPaint(false);
  if (e.local) {
    photoBlob(e.id).then((blob) => {
      if (state.photoMgr !== pm || !pm.preview || pm.preview.id !== e.id) return;
      const url = blob ? photoObjectUrl(blob) : '';
      if (url) { pm.preview.url = url; pm.preview.own = true; }
      pm.preview.loading = false;
      render();
    });
    return;
  }
  if (pm.preview.url || !e.t) { pm.preview.loading = false; render(); return; }
  _pmThumbFor(e).then((blob) => {
    if (state.photoMgr !== pm || !pm.preview || pm.preview.id !== e.id) return;
    if (blob) pm.preview.url = photoThumbRemember(e.id, blob);
    pm.preview.loading = false;
    render();
  });
}

function photoMgrPreviewClose(quiet) {
  const pm = state.photoMgr;
  if (pm.preview && pm.preview.own && typeof photoReleaseObjectUrls === 'function') photoReleaseObjectUrls();
  pm.preview = null;
  if (!quiet) _pmPaint(false);
}

function _pmIdsOrSelected(arg) {
  return arg ? [String(arg)] : Object.keys(state.photoMgr.selected || {});
}

const _pmPlural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---- remove from phone (known in the cloud only) ----
function photoMgrRemove(arg) {
  const pm = state.photoMgr;
  if (pm.busy || typeof syncPhotosUploadedIds !== 'function') return;
  const sel = _pmSelected(_pmIdsOrSelected(arg));
  const up = syncPhotosUploadedIds();
  const go = sel.filter((e) => e.local && up.has(e.id));
  const kept = sel.filter((e) => e.local && !up.has(e.id)).length;
  if (!go.length) {
    showToast(kept
      ? 'Those photos haven\u2019t reached the cloud yet, so they stay on this phone'
      : 'Those photos aren\u2019t on this phone');
    return;
  }
  const bytes = go.reduce((n, e) => n + (e.b || 0), 0);
  openConfirmSheet({
    title: `Remove ${_pmPlural(go.length, 'photo')} from this phone?`,
    message: `This frees about ${formatBytes(bytes)} on this phone. Your cloud copy keeps them, and you can download them again at any time. ` +
      (kept ? `${_pmPlural(kept, 'photo')} not in the cloud yet ${kept === 1 ? 'is' : 'are'} kept. ` : '') +
      'Your jobs and results are not affected.',
    confirmLabel: 'Remove',
    danger: false,
    onConfirm: () => {
      // Ask again at the moment of removing: only what is known in the cloud NOW.
      const now = syncPhotosUploadedIds();
      const ids = go.map((e) => e.id).filter((id) => now.has(id));
      pm.busy = 'Removing\u2026';
      _pmPaint(false);
      photosRemoveQuiet(ids, true).then((n) => {
        pm.busy = '';
        if (n < 0) { showToast('Couldn\u2019t remove the photos. Try again.'); _pmPaint(false); return; }
        _pmForget(ids);
        showToast(`Removed ${_pmPlural(n, 'photo')} from this phone`);
        _pmPaint(true);
      });
    },
  });
}

// ---- download (cloud-only photos of jobs on this phone — 4A) ----
function _pmPaintBusy() {
  try {
    const el = document.getElementById('pm-busy');
    if (el) el.textContent = state.photoMgr.busy || '';
  } catch { /* shown on the next render */ }
}

function photoMgrDownload(arg) {
  const pm = state.photoMgr;
  if (pm.busy || typeof syncPhotoDownload !== 'function') return;
  const sel = _pmSelected(_pmIdsOrSelected(arg));
  const go = sel.filter((e) => !e.local && e.src === 'known' && e.onPhone);
  const away = sel.filter((e) => !e.local && !(e.src === 'known' && e.onPhone)).length;
  if (!go.length) {
    showToast(away
      ? 'Those photos\u2019 jobs aren\u2019t on this phone. You can see and delete them here, but not download them yet'
      : 'Those photos are already on this phone');
    return;
  }
  const ids = go.map((e) => e.id);
  pm.busy = `Downloading 0 of ${ids.length}\u2026`;
  _pmPaint(false);
  syncPhotoDownload(ids, (done, total) => { pm.busy = `Downloading ${done} of ${total}\u2026`; _pmPaintBusy(); }).then((res) => {
    pm.busy = '';
    if (res.offline) showToast('No signal \u2014 the photos are safe in the cloud. Try again when you\u2019re connected.');
    else if (res.notReady) showToast('Photos are still loading \u2014 try again in a moment');
    else if (res.failed) showToast(`Downloaded ${res.got}. Couldn\u2019t download ${res.failed} \u2014 try again later.`);
    else showToast(`Downloaded ${_pmPlural(res.got, 'photo')}` + (away ? ` \u00b7 ${away} left: their jobs aren\u2019t on this phone` : ''));
    const here = ids.filter((id) => state.photoMeta && state.photoMeta[id]);
    here.forEach((id) => { delete pm.selected[id]; });
    if (state.photoMgr === pm && state.view === 'photoManager') _pmPaint(true);
  });
}

// ---- delete (everywhere when signed in — 9A; never on a locked job — 8A) ----
function photoMgrDelete(arg) {
  const pm = state.photoMgr;
  if (pm.busy) return;
  const vis = _pmVisible();
  const sel = _pmSelected(_pmIdsOrSelected(arg));
  const locked = sel.filter((e) => e.locked).length;
  const go = sel.filter((e) => !e.locked && (e.local || vis));
  if (!go.length) {
    showToast(locked
      ? 'Those photos are on a locked job. Unlock the job first to delete them.'
      : 'Nothing to delete');
    return;
  }
  const n = go.length;
  const bytes = go.reduce((t, e) => t + (e.b || 0), 0);
  const lockedNote = locked
    ? ` ${_pmPlural(locked, 'photo')} on locked jobs ${locked === 1 ? 'is' : 'are'} left alone \u2014 unlock the job first to delete ${locked === 1 ? 'it' : 'them'}.`
    : '';
  openConfirmSheet({
    title: vis ? `Delete ${_pmPlural(n, 'photo')} everywhere?` : `Delete ${_pmPlural(n, 'photo')}?`,
    message: vis
      ? `This deletes ${_pmPlural(n, 'photo')} (${formatBytes(bytes)}) from this phone and from your cloud copy, so they go from every phone too. It can\u2019t be undone.${lockedNote}`
      : `This permanently deletes ${_pmPlural(n, 'photo')} (${formatBytes(bytes)}) from this phone. If you haven\u2019t exported them, they can\u2019t be recovered.${lockedNote}`,
    confirmLabel: `Delete ${_pmPlural(n, 'photo')}`,
    onConfirm: () => {
      const locals = go.filter((e) => e.local);
      const knownOnly = go.filter((e) => !e.local && e.src === 'known');
      const found = go.filter((e) => e.src === 'browse');
      pm.busy = 'Deleting\u2026';
      _pmPaint(false);
      let gone = 0;
      locals.reduce((chain, e) => chain.then(() => photoDelete(e.id).then((ok) => { if (ok) gone++; })), Promise.resolve())
        .then(() => {
          knownOnly.forEach((e) => { if (photoDeleteCloudOnly(e.id)) gone++; });
          // A photo the look found becomes known FIRST, then takes the same path.
          return (found.length && typeof syncPhotoKnowForDelete === 'function')
            ? syncPhotoKnowForDelete(found).then(() => { found.forEach((e) => { if (photoDeleteCloudOnly(e.id)) gone++; }); })
            : null;
        })
        .catch((err) => { console.error('Photo manager delete (non-fatal).', err); })
        .then(() => {
          pm.busy = '';
          locals.forEach((e) => { if (typeof photoThumbForget === 'function') photoThumbForget(e.id); });
          _pmForget(go.map((e) => e.id));
          showToast(gone === n ? `Deleted ${_pmPlural(n, 'photo')}` : `Deleted ${gone} of ${n} photos \u2014 try the rest again`);
          if (state.photoMgr === pm && state.view === 'photoManager') _pmPaint(true);
        });
    },
  });
}
