/*!
 * PAT Test PWA
 * v22 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PAT Test PWA — v22 — Backup / Restore ==============
// Backup build/restore, export-state markers... NOTE only buildBackup/restore here.

// ---------- Backup / Restore (v7) ----------
// Full app state -> downloadable .json file. Restore replaces all current data.
// v9: now includes itemPresets + activePresetId. Backups missing these fields
// fall back to converting the legacy itemTypes array into a single 'Default'
// preset, so old backups still restore cleanly.
// v11: bumped to backupVersion: 3. Added csvColumns, tester, calDate,
// calCertNo, calDue, and lastBackupAt. Old backups still restore — missing
// fields use defaults.
function buildBackup() {
  return {
    appVersion: APP_VERSION,
    backupVersion: 5,                         // v26 bumped 4 → 5 (orphan sites: clientId may be empty)
    exportedAt: new Date().toISOString(),
    sessions: state.sessions,
    itemPresets: state.itemPresets,           // v9
    activePresetId: state.activePresetId,     // v9
    itemTypes: state.itemTypes,               // legacy mirror for backward compat
    failReasons: state.failReasons,
    descriptions: state.descriptions,
    engineer: state.engineer,
    sort: state.sort,
    theme: state.theme,
    hapticsEnabled: state.hapticsEnabled,
    // v11
    csvColumns: state.csvColumns,
    // v13: tester now split. Old backups (with .tester) load via the
    // legacy fallback in restoreBackupFromFile().
    testerMake: state.testerMake,
    testerModel: state.testerModel,
    calDate: state.calDate,
    calCertNo: state.calCertNo,
    calDue: state.calDue,
    // v16: Multi Pick config.
    multiPick: state.multiPick,
    // v17: feedback + timestamp settings.
    soundEnabled: state.soundEnabled,
    timestampsEnabled: state.timestampsEnabled,
    // v18: Smart Quick Pick flag + learned history (readable long-key form).
    sqpEnabled: state.sqpEnabled,
    sqpHistory: state.sqpHistory,
    // v19: Clients & Sites (readable long-key arrays).
    clients: state.clients,
    sites: state.sites,
    // v30: PDF report settings (single object incl. logo). Additive — old
    // backups without it restore via makeDefaultReportSettings(). No
    // backupVersion bump needed (purely additive, missing-field-tolerant).
    reportSettings: state.reportSettings,
    // v36: saved report templates (array of full reportSettings snapshots).
    // Additive — old backups without it restore with the seeded starters. No
    // backupVersion bump (the new session fields notes/certNo are also additive
    // and ride along inside `sessions`).
    reportTemplates: state.reportTemplates,
    lastBackupAt: state.lastBackupAt,
    // v43: cloud prep. Auth state (userId, authToken, loginTime). Passthrough
    // for now; will persist server-side in cloud phase. Old backups without it
    // restore with null (logged-out). Additive — no backupVersion bump.
    authUser: state.userId ? { userId: state.userId, authToken: state.authToken, loginTime: new Date().toISOString() } : null
  };
}

function downloadBackup() {
  const payload = buildBackup();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `PAT_backup_${todayISO()}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  // v11: stamp the successful export so the 7-day reminder timer resets.
  markBackupExported();
}

// v11: stamp the current time as the "last successful export" and clear any
// active snooze. Called from downloadBackup() and from restoreBackupFromFile()
// (since restoring a backup is itself a sign the user is on top of their
// backups — no need to nag them immediately afterwards).
function markBackupExported() {
  state.lastBackupAt = new Date().toISOString();
  state.backupSnoozedUntil = null;
  localStorage.setItem(LAST_BACKUP_KEY, state.lastBackupAt);
  localStorage.removeItem(BACKUP_SNOOZE_KEY);
}

// v11: snooze the reminder for 24 hours. Called from the "Remind me later"
// button and the × dismiss control on the banner.
function snoozeBackupReminder() {
  const until = new Date(Date.now() + BACKUP_SNOOZE_HOURS * 3600 * 1000).toISOString();
  state.backupSnoozedUntil = until;
  localStorage.setItem(BACKUP_SNOOZE_KEY, until);
}

// v11: should the banner show on the Sessions list right now?
// Conditions:
//   • current view is 'sessions' AND no new-session form is open (would crowd
//     the screen);
//   • lastBackupAt is missing OR was more than BACKUP_REMINDER_DAYS ago;
//   • backupSnoozedUntil is missing or already passed.
function shouldShowBackupReminder() {
  if (state.view !== 'sessions') return false;
  if (state.newForm.show) return false;
  // Don't show on a totally empty install — nothing to back up yet.
  if (state.sessions.length === 0) return false;
  const now = Date.now();
  if (state.backupSnoozedUntil) {
    const snoozeMs = Date.parse(state.backupSnoozedUntil);
    if (!isNaN(snoozeMs) && snoozeMs > now) return false;
  }
  if (!state.lastBackupAt) return true; // never backed up
  const lastMs = Date.parse(state.lastBackupAt);
  if (isNaN(lastMs)) return true;
  const ageDays = (now - lastMs) / (1000 * 3600 * 24);
  return ageDays >= BACKUP_REMINDER_DAYS;
}

function restoreBackupFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    let data;
    try {
      data = JSON.parse(e.target.result);
    } catch (err) {
      openInfoSheet({ title: 'Not a valid backup', message: 'That file couldn\u2019t be read as a backup \u2014 the data wasn\u2019t in the expected format.' });
      return;
    }
    if (!data || !Array.isArray(data.sessions)) {
      openInfoSheet({ title: 'Not a recognised backup', message: 'That file isn\u2019t a recognised PAT Test backup. Make sure you picked a file exported from this app.' });
      return;
    }
    const itemCount = data.sessions.reduce((n, s) => n + (Array.isArray(s.items) ? s.items.length : 0), 0);
    // v40: in-app confirm sheet (was native confirm). The apply block runs only
    // when the user confirms; dismissing leaves all current data untouched.
    openConfirmSheet({
      title: 'Restore from backup?',
      message:
        `This file contains ${data.sessions.length} session${data.sessions.length === 1 ? '' : 's'} ` +
        `and ${itemCount} item${itemCount === 1 ? '' : 's'} in total` +
        (data.exportedAt ? `, exported ${new Date(data.exportedAt).toLocaleString()}` : '') +
        `. This will REPLACE all current data on this device and cannot be undone.`,
      confirmLabel: 'Replace & restore',
      onConfirm: () => {
    // Apply
    state.sessions = data.sessions;
    // v9: preset restoration. Three cases:
    //   New backup with presets → use directly.
    //   Old backup with itemTypes only → convert to a single 'Default' preset.
    //   Neither → fall back to defaults.
    if (Array.isArray(data.itemPresets) && data.itemPresets.length) {
      state.itemPresets = data.itemPresets;
      state.activePresetId = (typeof data.activePresetId === 'string'
        && data.itemPresets.find(p => p.id === data.activePresetId))
        ? data.activePresetId
        : data.itemPresets[0].id;
    } else if (Array.isArray(data.itemTypes) && data.itemTypes.length) {
      const p = { id: 'preset_' + uid(), name: 'Default', items: data.itemTypes };
      state.itemPresets = [p];
      state.activePresetId = p.id;
    } else {
      const p = { id: 'preset_' + uid(), name: 'Default', items: DEFAULT_ITEM_TYPES.slice() };
      state.itemPresets = [p];
      state.activePresetId = p.id;
    }
    syncItemTypesFromActivePreset();
    state.failReasons = Array.isArray(data.failReasons) && data.failReasons.length ? data.failReasons : DEFAULT_FAIL_REASONS.slice();
    state.descriptions = Array.isArray(data.descriptions) ? data.descriptions : [];
    state.engineer = typeof data.engineer === 'string' ? data.engineer : '';
    state.sort = typeof data.sort === 'string' ? data.sort : 'date_desc';
    if (data.theme === 'light' || data.theme === 'dark' || data.theme === 'system') {
      state.theme = data.theme;
      applyTheme(state.theme);
    }
    if (typeof data.hapticsEnabled === 'boolean') {
      state.hapticsEnabled = data.hapticsEnabled;
    }

    // v11: restore the new fields if present, otherwise leave defaults intact.
    if (Array.isArray(data.csvColumns) && data.csvColumns.length) {
      // Re-validate the same way loadV11Settings does — drop unknown ids,
      // coerce types, then backfill missing defaults.
      state.csvColumns = data.csvColumns
        .map(c => ({
          id: String(c && c.id || ''),
          header: String(c && c.header || ''),
          visible: !!(c && c.visible)
        }))
        .filter(c => c.id && DEFAULT_CSV_COLUMNS.some(d => d.id === c.id));
      ensureAllCsvColumns();
    } else {
      state.csvColumns = DEFAULT_CSV_COLUMNS.map(c => ({ ...c }));
    }
    // v13: split tester restore. New backups carry testerMake / testerModel;
    // older v11 / v12 backups carry the single .tester field — we dump that
    // into testerModel for the same reason as the localStorage migration.
    if (typeof data.testerMake === 'string' || typeof data.testerModel === 'string') {
      state.testerMake = typeof data.testerMake === 'string' ? data.testerMake : '';
      state.testerModel = typeof data.testerModel === 'string' ? data.testerModel : '';
    } else if (typeof data.tester === 'string') {
      state.testerMake = '';
      state.testerModel = data.tester;
    } else {
      state.testerMake = '';
      state.testerModel = '';
    }
    state.calDate = typeof data.calDate === 'string' ? data.calDate : '';
    state.calCertNo = typeof data.calCertNo === 'string' ? data.calCertNo : '';
    state.calDue = typeof data.calDue === 'string' ? data.calDue : '';

    // v16: Multi Pick config — validate through the same normaliser used on
    // load. Missing/old backups collapse to { enabled:false, slots:[] }.
    state.multiPick = normaliseMultiPickConfig(data.multiPick);

    // v17: feedback + timestamp settings. Booleans only; older backups without
    // these keys leave the defaults (both off) intact.
    if (typeof data.soundEnabled === 'boolean') {
      state.soundEnabled = data.soundEnabled;
    }
    if (typeof data.timestampsEnabled === 'boolean') {
      state.timestampsEnabled = data.timestampsEnabled;
    }

    // v18: Smart Quick Pick. Flag is a boolean (older backups without it leave
    // the default off); history is validated through the same normaliser used on
    // load, so a missing/garbage value collapses to {}.
    if (typeof data.sqpEnabled === 'boolean') {
      state.sqpEnabled = data.sqpEnabled;
    }
    state.sqpHistory = normaliseSqpHistory(data.sqpHistory);

    // v19: Clients & Sites. Validate to the same shape the loaders enforce; any
    // missing/garbage value collapses to an empty list. Pre-v19 backups simply
    // restore with no clients/sites — the lists then re-seed from the restored
    // sessions on the next load() (which calls loadV11Settings → seed). To keep
    // restore self-consistent right now, we seed immediately if both are empty
    // and there are sessions, so the pickers aren't blank until a reload.
    state.clients = Array.isArray(data.clients)
      ? data.clients
          .map(c => ({ id: String(c && c.id || ''), name: String(c && c.name || '').trim() }))
          .filter(c => c.id && c.name)
      : [];
    state.sites = Array.isArray(data.sites)
      ? data.sites
          .map(s => ({
            id: String(s && s.id || ''),
            clientId: String(s && s.clientId || ''),
            name: String(s && s.name || '').trim()
          }))
          .filter(s => s.id && s.name)   // v26: clientId no longer required (orphan sites)
      : [];
    if (state.clients.length === 0 && state.sites.length === 0) {
      seedClientsSitesFromSessions();
    }

    // v30: PDF report settings. Validate through the same normaliser the loader
    // uses, so a missing key (any pre-v30 backup) restores clean defaults — which
    // means `enabled:false`, i.e. reporting stays OFF after restoring an older
    // backup until the user turns it on. A present-but-partial object backfills
    // missing fields. Logo (if present) rides along inside the object.
    state.reportSettings = normaliseReportSettings(data.reportSettings);

    // v36: report templates. If present, validate each through
    // normaliseReportSettings (inside loadReportTemplates' shape). If absent (any
    // pre-v36 backup), keep whatever is already loaded (seeded starters) rather
    // than wiping them. Additive — no backupVersion change.
    if (Array.isArray(data.reportTemplates)) {
      state.reportTemplates = data.reportTemplates
        .filter(t => t && typeof t === 'object')
        .map(t => ({
          id: (typeof t.id === 'string' && t.id) ? t.id : ('tpl_' + Math.random().toString(36).slice(2, 9)),
          name: (typeof t.name === 'string' && t.name.trim()) ? t.name.trim() : 'Untitled template',
          settings: normaliseReportSettings(t.settings)
        }));
    }

    // v43: cloud prep. Auth state (userId, authToken). If present in backup, restore;
    // if absent (any pre-v43 backup), leave auth unchanged (the user stays in their
    // current login state — we don't reset it on restore). Additive.
    if (data.authUser && typeof data.authUser === 'object' && data.authUser.userId) {
      state.userId = data.authUser.userId;
      state.authToken = data.authUser.authToken || null;
      state.authStatus = 'logged-in';
    }

    state.activeId = null;
    state.view = 'sessions';
    state.cursor = 0;
    state.newForm.show = false;
    save();
    // v11: stamp the restore as a fresh backup checkpoint so we don't nag the
    // user the moment they restore from a known-good file.
    markBackupExported();
    render();
    showToast(`Restored ${data.sessions.length} session${data.sessions.length === 1 ? '' : 's'} (${itemCount} item${itemCount === 1 ? '' : 's'})`);
      }
    });
  };
  reader.onerror = () => openInfoSheet({ title: 'Couldn\u2019t read that file', message: 'The file couldn\u2019t be opened. Please try again.' });
  reader.readAsText(file);
}
