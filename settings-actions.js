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
    rs.certNextNumber = (Number.isFinite(nx) && nx >= 1) ? nx : rs.certNextNumber;
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
      state.reportSettings = normaliseReportSettings(tpl.settings);
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
      id: 'tpl_' + Math.random().toString(36).slice(2, 9),
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
  state.reportTemplates = state.reportTemplates.filter(t => t.id !== templateId);
  saveReportTemplates();
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
  try { inp.focus(); inp.setSelectionRange(pos, pos); } catch (e) {}
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
  if (nameInput) { try { nameInput.focus(); nameInput.select(); } catch (e) {} }
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
