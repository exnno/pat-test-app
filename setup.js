/*!
 * PATGo PWA — setup.js (Export / Import Setup)
 * v31 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 *
 * Export/Import Setup (v31). A "setup" is a shareable bundle of CONFIGURATION
 * only — never sessions, clients/sites, learned SQP history, or backup timers.
 * Use case: make a second device (or a new employee phone) match this one.
 *
 * This deliberately overlaps the backup serialisation: each section carries the
 * same field shapes the full backup uses, and import validates them through the
 * SAME normalisers (normaliseReportSettings, normaliseMultiPickConfig, the CSV
 * column re-validation, the preset-restore logic) so there is one source of
 * truth for "what a valid X looks like". The bundle is a SEPARATE file kind
 * (SETUP_KIND) so a backup can never be imported as a setup or vice versa —
 * importing a setup never touches sessions, so the file-kind guard is the only
 * thing standing between "replace my config" and "wipe my jobs".
 *
 * Section → fields mapping lives in SETUP_SECTIONS (config.js). Add a field in
 * one place. Loads after backup.js; before render/dispatch.
 */

// ---------- Build ----------
// Build a setup bundle from the current state, including only the ticked
// sections. `label` is the user-given name; `include` is a {sectionId:bool} map
// (defaults to state.setupInclude). Returns a plain object ready to serialise.
function buildSetupBundle(label, include) {
  const inc = include || state.setupInclude || {};
  const sections = {};

  if (inc.presets) {
    sections.presets = {
      itemPresets: state.itemPresets,
      activePresetId: state.activePresetId,
      // legacy mirror so a setup imported by some hypothetical older build still
      // resolves a list, mirroring buildBackup()'s itemTypes mirror.
      itemTypes: state.itemTypes,
      failReasons: state.failReasons,
      descriptions: state.descriptions
    };
  }
  if (inc.report) {
    // v36: also share saved templates alongside the live report settings.
    sections.report = { reportSettings: state.reportSettings, reportTemplates: state.reportTemplates };
  }
  if (inc.csv) {
    sections.csv = { csvColumns: state.csvColumns };
  }
  if (inc.tester) {
    sections.tester = {
      testerMake: state.testerMake,
      testerModel: state.testerModel,
      calDate: state.calDate,
      calCertNo: state.calCertNo,
      calDue: state.calDue,
      // v66: the instruments list rides in the same 'tester' section, so an
      // existing Setup file (which has no key) still imports via the legacy
      // flat-field path below.
      instruments: state.instruments,
      activeInstrumentId: state.activeInstrumentId
    };
  }
  if (inc.prefs) {
    sections.prefs = {
      theme: state.theme,
      hapticsEnabled: state.hapticsEnabled,
      soundEnabled: state.soundEnabled,
      timestampsEnabled: state.timestampsEnabled,
      multiPick: state.multiPick,
      sqpEnabled: state.sqpEnabled
      // NOTE: deliberately NOT sqpHistory — learned history is device-specific.
    };
  }

  return {
    kind: SETUP_KIND,
    setupVersion: SETUP_BUNDLE_VERSION,
    appVersion: APP_VERSION,
    label: (typeof label === 'string' && label.trim()) ? label.trim() : 'PAT setup',
    exportedAt: new Date().toISOString(),
    sections
  };
}

// Filename for a setup file: PAT_setup_<label>_<date>.json, label sanitised.
function setupFilename(label) {
  const safe = String(label || 'setup').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'setup';
  return `PAT_setup_${safe}_${todayISO()}.json`;
}

// Count what a bundle contains, for the export confirm / import summary.
function describeSetupSections(bundle) {
  const s = (bundle && bundle.sections) || {};
  const present = SETUP_SECTIONS.filter(sec => s[sec.id]);
  return present.map(sec => sec.label);
}

// ---------- Share ----------
// Share the setup via the OS share sheet, falling back to a download. Mirrors
// shareOrDownloadReport(). Called from dispatch after the name sheet is filled.
async function shareSetup(label, include) {
  const bundle = buildSetupBundle(label, include);
  const json = JSON.stringify(bundle, null, 2);
  const filename = setupFilename(bundle.label);

  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare && typeof File === 'function') {
    try {
      const file = new File([json], filename, { type: 'application/json' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch (err) {
      if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) return;
    }
  }
  // Download fallback.
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Import ----------
// Read a setup file, validate it's a setup (not a backup), confirm with the
// user, then apply the present sections via the shared normalisers. Sessions,
// clients, and sites are NEVER touched. Mirrors restoreBackupFromFile() in
// shape but is config-only and replace-per-section.
function importSetupFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    let data;
    try {
      data = JSON.parse(e.target.result);
    } catch (err) {
      openInfoSheet({ title: 'Not a valid setup', message: 'That file couldn\u2019t be read as a setup \u2014 the data wasn\u2019t in the expected format.' });
      return;
    }
    // File-kind guard: reject anything that isn't a setup bundle. A full backup
    // (which has .sessions and no .kind) is rejected here so it can never be
    // applied as a setup.
    if (!data || data.kind !== SETUP_KIND || typeof data.sections !== 'object' || !data.sections) {
      if (data && Array.isArray(data.sessions)) {
        openInfoSheet({ title: 'That\u2019s a backup, not a setup', message: 'To restore a backup, use Restore (it replaces sessions too). Import setup only changes your configuration.' });
      } else {
        openInfoSheet({ title: 'Not a recognised setup', message: 'That file isn\u2019t a recognised PAT setup. Make sure you picked a setup file exported from this app.' });
      }
      return;
    }

    const sectionLabels = describeSetupSections(data);
    if (sectionLabels.length === 0) {
      openInfoSheet({ title: 'Nothing to import', message: 'That setup file is empty \u2014 there\u2019s nothing to import.' });
      return;
    }
    const name = (typeof data.label === 'string' && data.label.trim()) ? data.label.trim() : 'this setup';
    // v41: in-app confirm sheet (was native confirm). The apply block runs only
    // on confirm; dismissing leaves all current configuration untouched.
    openConfirmSheet({
      title: `Import \u201c${name}\u201d?`,
      message:
        `This will REPLACE the following on this device: ${sectionLabels.join(', ')}. ` +
        `Your sessions, clients and sites will NOT be changed.`,
      confirmLabel: 'Import',
      danger: false,
      onConfirm: () => {
        applySetupBundle(data);
        save();
        showToast(`Setup \u201c${name}\u201d imported`);
        state.view = 'settingsBackup';
        render();
      }
    });
  };
  reader.onerror = () => openInfoSheet({ title: 'Couldn\u2019t read that file', message: 'The file couldn\u2019t be opened. Please try again.' });
  reader.readAsText(file);
}

// Apply each present section to state via the same validators the loaders and
// backup-restore use. Only sections present in the bundle are touched.
function applySetupBundle(data) {
  const s = data.sections || {};

  // --- presets (item presets + fail reasons + descriptions) ---
  if (s.presets) {
    const p = s.presets;
    if (Array.isArray(p.itemPresets) && p.itemPresets.length) {
      state.itemPresets = p.itemPresets;
      state.activePresetId = (typeof p.activePresetId === 'string'
        && p.itemPresets.find(x => x.id === p.activePresetId))
        ? p.activePresetId
        : p.itemPresets[0].id;
    } else if (Array.isArray(p.itemTypes) && p.itemTypes.length) {
      const np = { id: 'preset_' + uid(), name: 'Default', items: p.itemTypes };
      state.itemPresets = [np];
      state.activePresetId = np.id;
    }
    // If neither present, leave existing presets untouched (a setup that didn't
    // carry presets shouldn't blank them).
    syncItemTypesFromActivePreset();
    if (Array.isArray(p.failReasons) && p.failReasons.length) {
      state.failReasons = p.failReasons.map(x => String(x)).filter(Boolean);
    }
    if (Array.isArray(p.descriptions)) {
      state.descriptions = p.descriptions.map(x => String(x)).filter(Boolean);
    }
  }

  // --- report settings (validated through the shared normaliser) ---
  if (s.report && s.report.reportSettings) {
    state.reportSettings = normaliseReportSettings(s.report.reportSettings);
  }
  // v36: report templates from a shared setup (validated like backup restore).
  if (s.report && Array.isArray(s.report.reportTemplates)) {
    state.reportTemplates = s.report.reportTemplates
      .filter(t => t && typeof t === 'object')
      .map(t => ({
        id: (typeof t.id === 'string' && t.id) ? t.id : ('tpl_' + Math.random().toString(36).slice(2, 9)),
        name: (typeof t.name === 'string' && t.name.trim()) ? t.name.trim() : 'Untitled template',
        settings: normaliseReportSettings(t.settings)
      }));
    saveReportTemplates();
  }

  // --- CSV columns (re-validated exactly like backup restore) ---
  if (s.csv && Array.isArray(s.csv.csvColumns) && s.csv.csvColumns.length) {
    state.csvColumns = s.csv.csvColumns
      .map(c => ({
        id: String(c && c.id || ''),
        header: String(c && c.header || ''),
        visible: !!(c && c.visible)
      }))
      .filter(c => c.id && DEFAULT_CSV_COLUMNS.some(d => d.id === c.id));
    ensureAllCsvColumns();
  }

  // --- tester & calibration ---
  if (s.tester) {
    const t = s.tester;
    if (typeof t.testerMake === 'string') state.testerMake = t.testerMake;
    if (typeof t.testerModel === 'string') state.testerModel = t.testerModel;
    if (typeof t.calDate === 'string') state.calDate = t.calDate;
    if (typeof t.calCertNo === 'string') state.calCertNo = t.calCertNo;
    if (typeof t.calDue === 'string') state.calDue = t.calDue;
    // v66: same helper as backup restore, and for the same reason it must run
    // AFTER the flat fields — an older Setup file rebuilds one instrument from
    // them.
    if (typeof restoreInstrumentsFromBackup === 'function') restoreInstrumentsFromBackup(t);
  }

  // --- app preferences ---
  if (s.prefs) {
    const pr = s.prefs;
    if (pr.theme === 'light' || pr.theme === 'dark' || pr.theme === 'system') {
      state.theme = pr.theme;
      applyTheme(state.theme);
    }
    if (typeof pr.hapticsEnabled === 'boolean') state.hapticsEnabled = pr.hapticsEnabled;
    if (typeof pr.soundEnabled === 'boolean') state.soundEnabled = pr.soundEnabled;
    if (typeof pr.timestampsEnabled === 'boolean') state.timestampsEnabled = pr.timestampsEnabled;
    state.multiPick = normaliseMultiPickConfig(pr.multiPick);
    if (typeof pr.sqpEnabled === 'boolean') state.sqpEnabled = pr.sqpEnabled;
  }
}
