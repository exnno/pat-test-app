/*!
 * PATGo PWA
 * v22 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PATGo PWA — v22 — Backup / Restore ==============
// Backup build/restore, export-state markers... NOTE only buildBackup/restore here.
// V105: the restore is applyBackupData(), shared by a file and a snapshot
// (snapshots.js); restoreWithSafetyCopy() keeps a copy before either.

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
    // v66: the full instruments list + which one is active. The five flat fields
    // above are kept as the ACTIVE instrument's mirror so a v66 backup still
    // restores meaningfully into anything that only understands them. Additive
    // and missing-field-tolerant both ways, so NO backupVersion bump — a pre-v66
    // backup has no key and rebuilds a single instrument from its flat fields
    // (see restoreInstrumentsFromBackup in instruments.js).
    instruments: state.instruments,
    activeInstrumentId: state.activeInstrumentId,
    // v16: Multi Pick config.
    multiPick: state.multiPick,
    // v17: feedback + timestamp settings.
    soundEnabled: state.soundEnabled,
    timestampsEnabled: state.timestampsEnabled,
    undoEnabled: state.undoEnabled,   // V94: per phone; absent in older backups
    mapPinEnabled: state.mapPinEnabled,   // V99: per phone; absent in older backups
    reminders: normaliseReminders(state.reminders),   // V100: per phone; absent in older backups
    // v18: Smart Quick Pick flag + learned history (readable long-key form).
    sqpEnabled: state.sqpEnabled,
    sqpHistory: state.sqpHistory,
    // v53: Test Readings on/off flag + fail-reason tag map. The readings DATA
    // itself rides along inside `sessions` (per-item item.readings) — additive,
    // no backupVersion bump, and validated per item on restore. Old backups
    // without these keys restore with the feature OFF and the default tags.
    readingsEnabled: state.readingsEnabled,
    failReasonTags: state.failReasonTags,
    // V104 (S10): the readings check switch + earth ceiling. Additive — no
    // backupVersion bump; an older backup restores with the defaults.
    readingsCheckEnabled: state.readingsCheckEnabled,
    readingsEarthLimit: state.readingsEarthLimit,
    // V105 (S14): the daily-snapshots switch. Additive — no backupVersion bump;
    // an older backup restores with this phone's own setting.
    snapshotsEnabled: state.snapshotsEnabled !== false,
    // v65: barcode scanner on/off. Additive and missing-field-tolerant, so NO
    // backupVersion bump — a pre-v65 backup simply has no key and restores with
    // the default (ON), which is also what a fresh install gets.
    scannerEnabled: state.scannerEnabled,
    // v67: paired mode and the burst speed preset. Same posture as the line
    // above — additive, missing-field-tolerant, NO backupVersion bump. A
    // pre-v67 backup has neither key and restores with the loaded defaults
    // (paired OFF, speed 'normal'), which is what a fresh install gets.
    scannerPaired: state.scannerPaired,
    scanSpeed: state.scanSpeed,
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
    // v59: archived half of the lifetime stats counter. Additive — old backups
    // without it restore to an empty bucket, which is correct: the total then
    // reflects exactly the sessions in that backup. No backupVersion bump.
    // Deliberately NOT part of the Export Setup bundle — Export Setup is
    // config-only and this is derived from job data.
    archivedStats: state.archivedStats,
    // v78: the deletion ledger. Carried so a restore onto a second device does
    // not resurrect everything that device's owner deleted — without it, a
    // backup taken before a delete is a backup that undoes the delete. Additive
    // and missing-field-tolerant (an old backup restores to an empty ledger,
    // which is correct: it predates the mechanism), so **backupVersion stays 5**.
    tombstones: (typeof normaliseTombstones === 'function')
      ? normaliseTombstones(state.tombstones)
      : (state.tombstones || []),
    // v80: ids of jobs cleared from this phone that the cloud still keeps
    // (sync.js), so a restore does not let the pull bring them back. Absent —
    // not an empty array — on any phone that never synced, so those backups
    // are unchanged. Additive: **backupVersion stays 5**. The sync FINGERPRINTS
    // are deliberately NOT here (see SYNC_STATE_KEY in config.js).
    syncPruned: (typeof syncPrunedList === 'function') ? syncPrunedList() : undefined,
    // v79: NO sign-in details in a backup, ever. V43 wrote a mock `authUser`
    // {userId, authToken} here; with real cloud sign-in that would put a live
    // credential in a file people email to each other. The field is simply
    // gone — restore ignores it in old backups (see restoreBackupFromFile).
    // v62: INFORMATIONAL ONLY — how many photos existed when this backup was
    // taken. Photos themselves are a SEPARATE export file (decision 7A); see
    // the reasoning at the top of the export section in photos.js. This number
    // exists so a restore can tell the user their photos are elsewhere rather
    // than let them assume the backup carried everything.
    //
    // Nothing reads it as data. Photo records key off item.id, and item ids
    // already ride inside `sessions`, so the photo file re-links itself with no
    // help from here. Additive and missing-field-tolerant on old backups →
    // **backupVersion stays 5**.
    photoCount: (typeof photoStatsSync === 'function') ? photoStatsSync().count : 0
  };
}

function downloadBackup() {
  const payload = buildBackup();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `PAT backup ${fileDateUK(todayISO())}.json`;   // V87: UK date, no underscores
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
  if (!backupReminderDays()) return false;   // V100 (5A): switched off
  if (!state.lastBackupAt) return true; // never backed up
  const lastMs = Date.parse(state.lastBackupAt);
  if (isNaN(lastMs)) return true;
  const ageDays = (now - lastMs) / (1000 * 3600 * 24);
  // V100 (5A): the interval is a per-phone choice; 'off' never reminds. A phone
  // that never chose gets 7 — BACKUP_REMINDER_DAYS, what it always did.
  const days = backupReminderDays();
  if (!days) return false;
  return ageDays >= days;
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
      openInfoSheet({ title: 'Not a recognised backup', message: 'That file isn\u2019t a recognised PATGo backup. Make sure you picked a file exported from this app.' });
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
        (data.exportedAt ? `, exported ${new Date(data.exportedAt).toLocaleString('en-GB')}` : '') +
        `. This will REPLACE all current data on this device. A copy of what's here now is kept first, so you can undo it from Daily snapshots on the Backup page.`,
      confirmLabel: 'Replace & restore',
      onConfirm: () => restoreWithSafetyCopy(() => applyBackupData(data, { markExported: true })),
    });
  };
  reader.onerror = () => openInfoSheet({ title: 'Couldn\u2019t read that file', message: 'The file couldn\u2019t be opened. Please try again.' });
  reader.readAsText(file);
}

// V105: the restore itself, lifted out of restoreBackupFromFile so a snapshot
// (snapshots.js) restores through EXACTLY the same validators and steps as a
// file. The body below is the pre-V105 apply block, moved unchanged apart from
// the two marked V105 lines. `data` must already have passed the sessions-array
// check. opts.markExported: true for a file, false for a snapshot.
function applyBackupData(data, opts) {
    opts = opts || {};
    const itemCount = data.sessions.reduce((n, s) => n + (Array.isArray(s.items) ? s.items.length : 0), 0);
    // Apply
    state.sessions = data.sessions;
    // v53: Test Readings — validate each item's readings object defensively on
    // restore. Items ride through wholesale (additive, no backupVersion bump),
    // but `readings` is a STRUCTURED field other code reads, so a hand-edited or
    // corrupt backup could carry garbage. normaliseItemReadings returns a clean
    // {class, earth, insulation, leakage} or null; we delete the key entirely
    // when null so no empty husk remains. Items with no readings (any pre-v53
    // backup) are untouched. This is also the boundary the future cloud-sync
    // path will reuse for server data.
    state.sessions.forEach(s => {
      if (s && Array.isArray(s.items)) {
        s.items.forEach(it => {
          if (it && 'readings' in it) {
            const clean = normaliseItemReadings(it.readings);
            if (clean) it.readings = clean; else delete it.readings;
          }
        });
      }
      // v56: retest reminder fields are additive and ride through restore, but
      // they're structured fields the chase-list code reads, so coerce/strip
      // any garbage from a hand-edited or corrupt backup. Untouched for any
      // session that was never flagged (every pre-v56 backup).
      normaliseSessionRetest(s);
    });
    // v59: archived stats bucket. Restore means restore — the counter goes back
    // to exactly what it was when this backup was taken, so live + archived
    // stays self-consistent rather than desyncing. Routed through the SAME
    // validator as load, so a hand-edited or corrupt backup can't poison it; a
    // pre-v59 backup has no such key and correctly yields an empty bucket.
    state.archivedStats = normaliseArchivedStats(data.archivedStats);
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

    // v66: instruments. ⚠ MUST run AFTER the five flat fields above — the
    // pre-v66 branch inside builds its single instrument from exactly those
    // just-restored values. Replaces the list wholesale rather than merging, so a
    // restore describes the backup exactly, like everything else here.
    if (typeof restoreInstrumentsFromBackup === 'function') restoreInstrumentsFromBackup(data);

    // v16: Multi Pick config — validate through the same normaliser used on
    // load. Missing/old backups collapse to { enabled:false, slots:[] }.
    state.multiPick = normaliseMultiPickConfig(data.multiPick);

    // v17: feedback + timestamp settings. Booleans only; older backups without
    // these keys leave the defaults (both off) intact.
    if (typeof data.soundEnabled === 'boolean') {
      state.soundEnabled = data.soundEnabled;
    }
    // V94: Undo button. Boolean only; an older backup leaves this phone's own.
    if (typeof data.undoEnabled === 'boolean') {
      state.undoEnabled = data.undoEnabled;
    }
    // V99: map pins switch. Boolean only; an older backup leaves this phone's own.
    if (typeof data.mapPinEnabled === 'boolean') {
      state.mapPinEnabled = data.mapPinEnabled;
    }
    // V100: reminder timings. An object only; anything odd in it falls back per
    // field. An older backup has none and leaves this phone's own.
    if (data.reminders && typeof data.reminders === 'object' && !Array.isArray(data.reminders)) {
      state.reminders = normaliseReminders(data.reminders);
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

    // v53: Test Readings. Flag is a boolean (older backups without it leave the
    // default OFF). The fail-reason tag map restores through the same validation
    // loadFailReasonTags applies: drop unknown tags, backfill shipped defaults —
    // so a pre-v53 backup restores with just the default tags, and a v53 backup
    // restores the user's custom tagging. The readings DATA itself already came
    // back inside `sessions` above (validated per item).
    if (typeof data.readingsEnabled === 'boolean') {
      state.readingsEnabled = data.readingsEnabled;
    }
    // V104 (S10): only a real boolean / a number is taken; the limit goes through
    // normaliseEarthLimit, so an out-of-range value restores as the default.
    if (typeof data.readingsCheckEnabled === 'boolean') {
      state.readingsCheckEnabled = data.readingsCheckEnabled;
    }
    if (typeof data.readingsEarthLimit === 'number') {
      state.readingsEarthLimit = normaliseEarthLimit(data.readingsEarthLimit);
    }
    // V105 (S14): the daily-snapshots switch. Boolean only; an older backup
    // leaves this phone's own.
    if (typeof data.snapshotsEnabled === 'boolean') {
      state.snapshotsEnabled = data.snapshotsEnabled;
    }

    // v65: barcode scanner flag. Restored only when the backup actually carries
    // a boolean — an older backup leaves the loaded default (ON) alone, which
    // is correct: the absence of the key says nothing about the engineer's
    // preference, so it must not be read as "off".
    if (typeof data.scannerEnabled === 'boolean') {
      state.scannerEnabled = data.scannerEnabled;
    }

    // v67: same rule — restore only what the backup actually carries, and
    // validate the preset against the whitelist rather than trusting the file.
    // A backup is an untrusted input: an unrecognised preset name would resolve
    // to an undefined threshold and quietly kill every scan.
    if (typeof data.scannerPaired === 'boolean') {
      state.scannerPaired = data.scannerPaired;
    }
    if (Object.prototype.hasOwnProperty.call(SCAN_GAP_PRESETS, data.scanSpeed)) {
      state.scanSpeed = data.scanSpeed;
    }
    {
      let incoming = {};
      if (data.failReasonTags && typeof data.failReasonTags === 'object' && !Array.isArray(data.failReasonTags)) {
        incoming = data.failReasonTags;
      }
      const merged = {};
      Object.keys(DEFAULT_FAIL_REASON_TAGS).forEach(r => { merged[r] = DEFAULT_FAIL_REASON_TAGS[r]; });
      Object.keys(incoming).forEach(r => {
        const tag = incoming[r];
        if (typeof tag === 'string' && READING_FAIL_TAGS.indexOf(tag) !== -1) merged[r] = tag;
      });
      state.failReasonTags = merged;
    }

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
          .map(s => withSiteNotes({   // V98: notes ride along (additive — no backupVersion bump)
            id: String(s && s.id || ''),
            clientId: String(s && s.clientId || ''),
            name: String(s && s.name || '').trim()
          }, s && s.notes))
          .filter(s => s.id && s.name)   // v26: clientId no longer required (orphan sites)
      : [];
    // v78: restore the deletion ledger, purged on the way in on the same rule as
    // load() — a backup restored a year later must not reinstate tombstones that
    // have long since outlived their window. Absent key → empty list.
    state.tombstones = (typeof purgeTombstones === 'function')
      ? purgeTombstones(data.tombstones)
      : (Array.isArray(data.tombstones) ? data.tombstones : []);
    // v80: MERGED into this phone's list, never replacing it — see sync.js.
    // Garbage or absent → nothing added. Wrapped: sync is optional (rule 6).
    if (typeof syncPrunedMerge === 'function') {
      try { syncPrunedMerge(data.syncPruned); } catch (e) { console.error('Cleared-jobs list not restored (non-fatal).', e); }
    }
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

    // v79: an older backup may carry a V43 mock `authUser` block. It is IGNORED
    // deliberately — restoring a file must never sign anyone in. Sign-in state
    // is untouched by restore: whoever is signed in on this phone stays so.

    state.activeId = null;
    state.view = 'sessions';
    state.cursor = 0;
    state.newForm.show = false;
    save();
    // v11: stamp the restore as a fresh backup checkpoint so we don't nag the
    // user the moment they restore from a known-good file.
    // V105: a FILE only. A snapshot lives on this phone, so restoring one says
    // nothing about whether a copy exists anywhere else.
    if (opts.markExported !== false) markBackupExported();
    render();
    showToast(`Restored ${data.sessions.length} session${data.sessions.length === 1 ? '' : 's'} (${itemCount} item${itemCount === 1 ? '' : 's'})`);
    // v62: if this backup was taken on a device that had photos, say so — the
    // photos are NOT in this file and the user needs to import them separately.
    // Only shown when the photos aren't already here, so a same-device restore
    // doesn't nag about something that never left.
    const backedUpPhotos = (typeof data.photoCount === 'number') ? data.photoCount : 0;
    const photosHere = (typeof photoStatsSync === 'function') ? photoStatsSync().count : 0;
    if (backedUpPhotos > 0 && photosHere === 0) {
      openInfoSheet({
        title: 'Photos are in a separate file',
        message:
          `This backup was taken when you had ${backedUpPhotos} photo${backedUpPhotos === 1 ? '' : 's'}. ` +
          `Photos aren't stored in the backup file — they're too large. ` +
          `If you exported them, use Import photos on the Backup screen to bring them back. ` +
          `Your jobs and items have all restored normally.`
      });
    }
}

// V105 (6A): before ANY restore replaces what is on this phone, keep a copy of
// it (snapshots.js, the "Before your last restore" row), so a wrong restore can
// be undone. If that copy is refused — usually a full phone — ask rather than
// either restoring unprotected without saying so or blocking a restore the
// engineer has already confirmed. With no snapshots file, no database, or no
// real job to protect, the restore simply goes ahead as it always did.
function restoreWithSafetyCopy(apply) {
  if (typeof snapshotBeforeRestore !== 'function') { apply(); return; }
  let p;
  try { p = snapshotBeforeRestore(); } catch (e) { p = Promise.reject(e); }
  Promise.resolve(p).then(() => apply(), (err) => {
    console.error('Safety copy before restore not saved.', err);
    openConfirmSheet({
      title: 'Couldn\u2019t keep a safety copy',
      message: 'Before restoring, PATGo keeps a copy of what\u2019s on this phone now, so the restore can be undone. That copy couldn\u2019t be saved \u2014 the phone may be short of space. Restore anyway?',
      confirmLabel: 'Restore anyway',
      onConfirm: apply,
    });
  });
}
