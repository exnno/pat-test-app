/*!
 * PATGo PWA — reset.js (Reset this phone)
 * V106 (October 2026) — roadmap Stage 10 part 2
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 *
 * Three levels (decision 1A):
 *   work       — jobs, clients & sites (2A), photos, snapshots, learned history,
 *                reminders and the sync bookkeeping. Settings and sign-in stay.
 *   settings   — the above plus every setting. Sign-in stays, and so does the
 *                certificate numbering (8B: counter, prefix, padding, on/off).
 *   everything — the above plus the sign-in, the access code and the counter.
 *
 * RULES THIS FILE KEEPS
 *   • Local only. Nothing is ever deleted from the cloud. The deletion ledger
 *     (TOMBSTONES_KEY) is wiped with the jobs, so no delete can be sent up.
 *   • After a reset the phone is a FRESH PHONE at that level — sync bookkeeping
 *     goes at every level, so sync's own fresh-phone paths (V93 R21: the last 30
 *     days come back; V83 5A: a starter preset is set aside) handle what follows.
 *   • No safety copy (6A). The snapshots database is deleted at every level: it
 *     holds a copy of every job, which is the whole point of handing a phone on.
 *   • Prefix-scoped. The test host shares its origin with PATGo Scan ('scan:'
 *     keys). NEVER a blanket clear of localStorage — only 'pat:' (and 'patgo:' at the
 *     everything level) is touched.
 *
 * HOW IT RUNS — TWO PASSES, BECAUSE THE LIVE PAGE CANNOT BE TRUSTED TO STAY STILL.
 * A running page has a pending sync, a pagehide save and timers, any of which
 * can write a key back after it was removed. So:
 *   1. live page: save()/render() neutralised (boot.js's own trick), a marker
 *      written (RESET_PENDING_KEY), the keys wiped, the photo and snapshot
 *      stores cleared, then a reload;
 *   2. boot.js, BEFORE load(): resetRunPending() sees the marker, wipes again
 *      (idempotent — this catches anything written back in between), deletes
 *      both databases and removes the marker. load() then starts on a clean phone.
 * If the reload never happens (app closed mid-reset), the next open finishes it.
 *
 * ⚠ OPTIONAL SUBSYSTEM (MAP rule 6). Every call in is typeof-guarded. A missing
 * reset.js leaves no page row, no route and no boot wipe — the safe direction.
 */

const RESET_LEVELS = ['work', 'settings', 'everything'];
const RESET_CONFIRM_WORD = 'RESET';   // 7A: typed, any case
const RESET_IDB_WAIT_MS = 3000;       // the live store clears; a hang must not trap the page
const RESET_SIGNOUT_WAIT_MS = 4000;

// EVERY storage key, classified. A new key in config.js fails harness 43a until
// it is added here — the factory reset list stops being a thing to remember.
//   work     goes at every level
//   settings goes at the settings and everything levels
//   account  goes at the everything level only
// The settings and everything levels also sweep any other 'pat:' key (old
// per-version welcome keys), so this table decides the WORK level exactly and
// documents the rest.
const RESET_KEY_PLAN = [
  // ---- work: the engineer's jobs and everything learned from them ----
  ['STORAGE_KEY', STORAGE_KEY, 'work'],
  ['ACTIVE_KEY', ACTIVE_KEY, 'work'],
  ['CLIENTS_KEY', CLIENTS_KEY, 'work'],               // 2A: customers' details go with the work
  ['SITES_KEY', SITES_KEY, 'work'],
  ['TOMBSTONES_KEY', TOMBSTONES_KEY, 'work'],         // ⚠ or a delete could be sent up
  ['PAT_STATS_KEY', PAT_STATS_KEY, 'work'],
  ['SQP_HISTORY_KEY', SQP_HISTORY_KEY, 'work'],
  ['SQP_RESET_KEY', SQP_RESET_KEY, 'work'],           // a new stamp would clear other phones — removed, never re-stamped
  ['SYNC_STATE_KEY', SYNC_STATE_KEY, 'work'],
  ['SYNC_PRUNED_KEY', SYNC_PRUNED_KEY, 'work'],
  ['SYNC_HELD_KEY', SYNC_HELD_KEY, 'work'],
  ['LAST_BACKUP_KEY', LAST_BACKUP_KEY, 'work'],
  ['BACKUP_SNOOZE_KEY', BACKUP_SNOOZE_KEY, 'work'],
  ['STORAGE_BANNER_KEY', STORAGE_BANNER_KEY, 'work'],
  ['TIDY_OFFER_KEY', TIDY_OFFER_KEY, 'work'],
  ['MAP_PIN_OPEN_KEY', MAP_PIN_OPEN_KEY, 'work'],
  ['REMINDER_QUIET_KEY', REMINDER_QUIET_KEY, 'work'],
  ['SNAPSHOT_FAIL_KEY', SNAPSHOT_FAIL_KEY, 'work'],
  ['REPAIR_UNDO_KEY', REPAIR_UNDO_KEY, 'work'],       // old item text from the V69 repair
  ['SESSION_FILTER_KEY', SESSION_FILTER_KEY, 'work'],
  ['LOCK_FILTER_KEY', LOCK_FILTER_KEY, 'work'],
  ['PAT_AUTH_KEY', PAT_AUTH_KEY, 'work'],             // retired mock sign-in; load() deletes it anyway
  // ---- settings ----
  ['ITEMS_KEY', ITEMS_KEY, 'settings'],
  ['FAIL_REASONS_KEY', FAIL_REASONS_KEY, 'settings'],
  ['FAIL_REASON_TAGS_KEY', FAIL_REASON_TAGS_KEY, 'settings'],
  ['ENGINEER_KEY', ENGINEER_KEY, 'settings'],
  ['DESCRIPTIONS_KEY', DESCRIPTIONS_KEY, 'settings'],
  ['SORT_KEY', SORT_KEY, 'settings'],
  ['THEME_KEY', THEME_KEY, 'settings'],
  ['HAPTICS_KEY', HAPTICS_KEY, 'settings'],
  ['ITEM_PRESETS_KEY', ITEM_PRESETS_KEY, 'settings'],
  ['ACTIVE_PRESET_KEY', ACTIVE_PRESET_KEY, 'settings'],
  ['CSV_COLUMNS_KEY', CSV_COLUMNS_KEY, 'settings'],
  ['TESTER_KEY', TESTER_KEY, 'settings'],
  ['TESTER_MAKE_KEY', TESTER_MAKE_KEY, 'settings'],
  ['TESTER_MODEL_KEY', TESTER_MODEL_KEY, 'settings'],
  ['CAL_DATE_KEY', CAL_DATE_KEY, 'settings'],
  ['CAL_CERT_KEY', CAL_CERT_KEY, 'settings'],
  ['CAL_DUE_KEY', CAL_DUE_KEY, 'settings'],
  ['INSTRUMENTS_KEY', INSTRUMENTS_KEY, 'settings'],
  ['ACTIVE_INSTRUMENT_KEY', ACTIVE_INSTRUMENT_KEY, 'settings'],
  ['WELCOME_KEY', WELCOME_KEY, 'settings'],
  ['ONBOARD_KEY', ONBOARD_KEY, 'settings'],           // → the first-run setup shows, as a new install
  ['REPORT_SETTINGS_KEY', REPORT_SETTINGS_KEY, 'settings'],   // certificate numbering written back (8B)
  ['REPORT_TEMPLATES_KEY', REPORT_TEMPLATES_KEY, 'settings'],
  ['SQP_ENABLED_KEY', SQP_ENABLED_KEY, 'settings'],
  ['READINGS_KEY', READINGS_KEY, 'settings'],
  ['READINGS_CHECK_KEY', READINGS_CHECK_KEY, 'settings'],
  ['READINGS_EARTH_LIMIT_KEY', READINGS_EARTH_LIMIT_KEY, 'settings'],
  ['SCANNER_KEY', SCANNER_KEY, 'settings'],
  ['SCANNER_PAIRED_KEY', SCANNER_PAIRED_KEY, 'settings'],
  ['SCAN_SPEED_KEY', SCAN_SPEED_KEY, 'settings'],
  ['REPAIR_DONE_KEY', REPAIR_DONE_KEY, 'settings'],
  ['SOUNDFX_KEY', SOUNDFX_KEY, 'settings'],
  ['TIMESTAMPS_KEY', TIMESTAMPS_KEY, 'settings'],
  ['UNDO_KEY', UNDO_KEY, 'settings'],
  ['MAP_PIN_KEY', MAP_PIN_KEY, 'settings'],
  ['REMINDERS_KEY', REMINDERS_KEY, 'settings'],
  ['MULTIPICK_KEY', MULTIPICK_KEY, 'settings'],
  ['PRUNE_AGE_KEY', PRUNE_AGE_KEY, 'settings'],
  ['SNAPSHOTS_KEY', SNAPSHOTS_KEY, 'settings'],
  ['PHOTO_AGE_KEY', PHOTO_AGE_KEY, 'settings'],
  ['RETEST_REMINDERS_KEY', RETEST_REMINDERS_KEY, 'settings'],
  // ---- account: only the everything level ----
  // CLOUD_UNLOCK_KEY is the access-code curtain. It stays while you stay signed
  // in: closing it would hide the Account page after a later sign-out.
  ['CLOUD_UNLOCK_KEY', CLOUD_UNLOCK_KEY, 'account'],
  ['CLOUD_AUTH_STORAGE_KEY', CLOUD_AUTH_STORAGE_KEY, 'account'],   // a PREFIX: supabase-js keeps several keys under it
];

// The certificate numbering kept at the settings level (8B). The number alone
// would restart someone's numbers without their prefix — "0042" not "BPS-0042".
const RESET_CERT_FIELDS = ['certEnabled', 'certNextNumber', 'certPrefix', 'certPadding'];

let _resetRunning = false;

function _resetValidLevel(level) { return RESET_LEVELS.indexOf(level) !== -1; }

// ---- the wipe itself (synchronous; runs in the live page AND at boot) ----------
// Returns the keys it removed, for the harness. Removing never needs space, so
// this works on a full phone.
function _resetWipeLocal(level, cert) {
  if (!_resetValidLevel(level)) return [];
  const all = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k) all.push(k); } } catch (e) { return []; }
  const doomed = [];
  if (level === 'work') {
    const work = new Set(RESET_KEY_PLAN.filter(r => r[2] === 'work').map(r => r[1]));
    for (const k of all) if (work.has(k)) doomed.push(k);
  } else {
    const keepAccount = (level === 'settings')
      ? RESET_KEY_PLAN.filter(r => r[2] === 'account').map(r => r[1]) : [];
    for (const k of all) {
      if (k === RESET_PENDING_KEY) continue;                 // removed last, by the caller
      const ours = k.indexOf('pat:') === 0 || (level === 'everything' && k.indexOf('patgo:') === 0);
      if (!ours) continue;                                   // ⚠ never another app's keys
      if (keepAccount.some(p => k === p || k.indexOf(p) === 0)) continue;
      doomed.push(k);
    }
  }
  for (const k of doomed) { try { localStorage.removeItem(k); } catch (e) { /* next pass */ } }
  // 8B: the certificate numbering survives the settings level. Written as a bare
  // object; normaliseReportSettings() fills every other field with its default.
  if (level === 'settings' && cert && typeof cert === 'object') {
    const keep = {};
    for (const f of RESET_CERT_FIELDS) if (cert[f] !== undefined) keep[f] = cert[f];
    if (Object.keys(keep).length) {
      try { localStorage.setItem(REPORT_SETTINGS_KEY, JSON.stringify(keep)); } catch (e) { /* defaults, then */ }
    }
  }
  return doomed;
}

function _resetCertKeep() {
  const rs = (state && state.reportSettings) || {};
  const out = {};
  for (const f of RESET_CERT_FIELDS) if (rs[f] !== undefined) out[f] = rs[f];
  return out;
}

// ---- boot: finish a reset the live page started ---------------------------------
// Called by boot.js BEFORE load(). Returns the level it finished, or null.
function resetRunPending() {
  let raw = null;
  try { raw = localStorage.getItem(RESET_PENDING_KEY); } catch (e) { return null; }
  if (raw === null) return null;
  let m = null;
  try { m = JSON.parse(raw); } catch (e) { m = null; }
  if (!m || !_resetValidLevel(m.level)) {
    // A marker nobody can read is not a request to delete anything.
    try { localStorage.removeItem(RESET_PENDING_KEY); } catch (e) {}
    return null;
  }
  _resetWipeLocal(m.level, m.cert);
  _resetDeleteDatabases();
  try { localStorage.removeItem(RESET_PENDING_KEY); } catch (e) {}
  setTimeout(() => {
    try { if (typeof showToast === 'function') showToast('This phone has been reset'); } catch (e) {}
  }, 800);
  return m.level;
}

// Fire and forget: the live page already emptied both stores, so this is tidying.
// Queued before anything at boot opens either database, so those opens wait on it.
function _resetDeleteDatabases() {
  const names = [
    (typeof PHOTO_DB_NAME === 'string') ? PHOTO_DB_NAME : 'patgo-photos',
    (typeof SNAPSHOT_DB_NAME === 'string') ? SNAPSHOT_DB_NAME : 'patgo-snapshots',
  ];
  try {
    if (typeof indexedDB === 'undefined' || !indexedDB || typeof indexedDB.deleteDatabase !== 'function') return;
  } catch (e) { return; }
  for (const n of names) {
    try {
      const req = indexedDB.deleteDatabase(n);
      if (req) req.onblocked = () => console.warn('Reset: ' + n + ' is still open somewhere; it will be removed once closed.');
    } catch (e) { console.error('Reset: could not delete ' + n + ' (non-fatal — its contents were already cleared).', e); }
  }
}

// ---- the live page --------------------------------------------------------------
function _resetWithin(p, ms) {
  return Promise.race([
    Promise.resolve(p).catch(() => null),
    new Promise(res => setTimeout(res, ms)),
  ]);
}

function _resetClearStores() {
  const jobs = [];
  try { if (typeof photosDeleteAll === 'function') jobs.push(photosDeleteAll()); } catch (e) {}
  try {
    if (typeof _snapTx === 'function') {
      jobs.push(_snapTx('readwrite', (s) => s.clear()).then(() => { try { _snapCache = []; } catch (e) {} }));
    }
  } catch (e) {}
  return _resetWithin(Promise.all(jobs.map(j => Promise.resolve(j).catch(() => null))), RESET_IDB_WAIT_MS);
}

function _resetSignedIn() {
  return !!(state && state.cloud && state.cloud.status === 'signed-in');
}

// The page's own reload, kept in one place so nothing else in here calls it.
function _resetReload() {
  try { location.reload(); } catch (e) { /* the user can close and reopen */ }
}

function resetPerform(level) {
  if (!_resetValidLevel(level) || _resetRunning) return Promise.resolve(false);
  _resetRunning = true;
  const cert = (level === 'settings') ? _resetCertKeep() : null;
  const signOut = (level === 'everything' && _resetSignedIn() && typeof cloudSignOut === 'function')
    ? _resetWithin(cloudSignOut(), RESET_SIGNOUT_WAIT_MS) : Promise.resolve();
  return signOut.then(() => {
    // From here on nothing in memory may be written back or painted over.
    try { save = function () {}; } catch (e) {}
    try { saveSessions = function () {}; } catch (e) {}
    try { saveSettings = function () {}; } catch (e) {}
    try {
      const el = document.getElementById('app');
      if (el) el.innerHTML = '<div class="screen reset-busy"><p>Resetting this phone&hellip;</p></div>';
    } catch (e) {}
    try { render = function () {}; } catch (e) {}
    const marker = JSON.stringify({ level, cert, at: new Date().toISOString() });
    let marked = false;
    try { localStorage.setItem(RESET_PENDING_KEY, marker); marked = true; } catch (e) { /* full: wipe first */ }
    _resetWipeLocal(level, cert);
    if (!marked) { try { localStorage.setItem(RESET_PENDING_KEY, marker); } catch (e) {} }
    return _resetClearStores();
  }).then(() => { _resetReload(); return true; });
}

// ---- what each level does, in plain words (the confirm's overview) -------------
function _resetPlural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

function _resetCertLabel(rs) {
  rs = rs || {};
  const n = Number.isFinite(parseInt(rs.certNextNumber, 10)) ? parseInt(rs.certNextNumber, 10) : 1;
  const pad = Number.isFinite(parseInt(rs.certPadding, 10)) ? parseInt(rs.certPadding, 10) : 4;
  const prefix = String(rs.certPrefix || '').replace(/\{year\}/gi, String(new Date().getFullYear()));
  return prefix + String(n).padStart(pad, '0');
}

// Pure apart from reading state and the optional subsystems. Each entry is a
// plain-text sentence (an email address can be in one) — the sheet escapes them.
function resetOverview(level) {
  const sessions = Array.isArray(state.sessions) ? state.sessions : [];
  const clients = Array.isArray(state.clients) ? state.clients.length : 0;
  const sites = Array.isArray(state.sites) ? state.sites.length : 0;
  let photos = 0;
  try { if (typeof photoStatsSync === 'function') photos = photoStatsSync().count || 0; } catch (e) {}
  const snaps = Array.isArray(state.snapList) ? state.snapList.length : 0;
  const signedIn = _resetSignedIn();
  const email = signedIn && state.cloud.email ? state.cloud.email : '';
  const rs = state.reportSettings || {};

  const gone = [
    sessions.length ? `All ${_resetPlural(sessions.length, 'job', 'jobs')} on this phone, with every item, result and reading in them` : 'Jobs on this phone (there are none right now)',
    (clients || sites) ? `${_resetPlural(clients, 'client', 'clients')} and ${_resetPlural(sites, 'site', 'sites')}` : 'Clients and sites (there are none right now)',
    photos ? `${_resetPlural(photos, 'photo', 'photos')}` : 'Photos (there are none right now)',
    snaps ? `All ${_resetPlural(snaps, 'daily snapshot', 'daily snapshots')} \u2014 no copy is kept` : 'Daily snapshots \u2014 no copy is kept',
    'What Smart Quick Pick has learned, and the lifetime item count',
    'Backup, storage and other reminders start again from scratch',
  ];
  const kept = [];
  const notes = [];

  const settingsLine = 'Your settings: engineer name, test instruments, Quick Pick presets, fail reasons, descriptions, report and certificate setup (logo, signature, templates), CSV columns, theme, sound and every switch';
  if (level === 'work') {
    kept.push(settingsLine);
  } else {
    gone.push(settingsLine.replace(/^Your settings: /, 'All your settings: '));
  }

  if (level === 'settings') {
    kept.push(rs.certEnabled
      ? `Certificate numbering \u2014 your next certificate is still ${_resetCertLabel(rs)}`
      : 'The certificate number counter, so numbers never repeat');
  } else if (level === 'everything') {
    gone.push('The certificate number counter \u2014 numbering starts again at 1');
  }

  if (level === 'everything') {
    if (signedIn) gone.push(email ? `Your sign-in on this phone (${email})` : 'Your sign-in on this phone');
    gone.push('The access code for the cloud pages');
    kept.push('Nothing on this phone. PATGo will be exactly as it was when first installed.');
  } else if (signedIn) {
    kept.push(email ? `You stay signed in as ${email}` : 'You stay signed in');
  }

  if (signedIn || level === 'everything') {
    notes.push('Nothing is deleted from your cloud account. Everything already in the cloud stays there.');
  }
  if (signedIn && level !== 'everything') {
    notes.push(level === 'work'
      ? 'On the next sync, jobs from the last 30 days (and any retests being chased) come back to this phone, with your clients and sites. Older jobs stay in the cloud until you open them.'
      : 'On the next sync, jobs from the last 30 days (and retests being chased) come back, with your clients, sites, presets, instruments and report setup.');
  }
  if (level !== 'work') notes.push('PATGo will then start with the first-time setup, like a new install.');

  // 4A: warn, with the count, and carry on if they choose to.
  let unsafe = 0;
  if (signedIn && typeof syncJobsSafety === 'function') {
    try { const s = syncJobsSafety(true); if (s) unsafe = s.total - s.safe; } catch (e) {}
  }
  const warn = unsafe > 0
    ? `${_resetPlural(unsafe, 'job has', 'jobs have')} changes or photos that aren't confirmed in the cloud yet. Those will be lost.`
    : '';

  // 6A, said plainly.
  const final = 'This can\u2019t be undone. No copy is kept \u2014 the daily snapshots go too. Only a backup file you have saved can bring this back.';
  return { gone, kept, notes, warn, final, unsafe };
}

const RESET_LEVEL_TEXT = {
  work:       { title: 'Clear my work',             sheet: 'Clear your work from this phone?',
                blurb: 'Jobs, clients and sites, photos and snapshots. Your settings stay.' },
  settings:   { title: 'Clear work and settings',   sheet: 'Clear work and settings?',
                blurb: 'Everything above, plus all your settings. You stay signed in.' },
  everything: { title: 'Everything, as new',        sheet: 'Reset this phone completely?',
                blurb: 'Everything, including your sign-in. For handing the phone to someone else.' },
};

// ---- the confirm sheet -----------------------------------------------------------
// Inputs live in this sheet, which sits on <body>, outside #app: a repaint of the
// page underneath (a sync finishing) leaves it alone. The input is NOT focused on
// open — the keyboard would cover the overview the engineer needs to read first.
function resetConfirmMatches(v) {
  return String(v == null ? '' : v).trim().toUpperCase() === RESET_CONFIRM_WORD;
}

function resetOpen(level) {
  if (!_resetValidLevel(level) || _resetRunning) return;
  if (typeof _openSheet !== 'function') return;
  const t = RESET_LEVEL_TEXT[level];
  const o = resetOverview(level);
  const li = (arr) => arr.map(s => `<li>${escapeHTML(s)}</li>`).join('');
  const { sheet, backdrop, cleanup } = _openSheet(t.sheet);
  sheet.classList.add('reset-sheet');
  sheet.innerHTML = `
    <div class="bulk-sheet-handle"></div>
    <div class="bulk-sheet-header">
      <span class="fail-close-spacer"></span>
      <h3 class="bulk-sheet-title">${escapeHTML(t.sheet)}</h3>
      <button class="fail-close-btn" id="reset-sheet-cancel" aria-label="Cancel">&times;</button>
    </div>
    <div class="sheet-scroll reset-overview">
      ${o.warn ? `<p class="reset-warn" id="reset-sheet-warn">&#9888; ${escapeHTML(o.warn)}</p>` : ''}
      <h4 class="reset-h reset-h-gone">Deleted from this phone</h4>
      <ul class="reset-list reset-list-gone" id="reset-sheet-gone">${li(o.gone)}</ul>
      <h4 class="reset-h reset-h-kept">Kept</h4>
      <ul class="reset-list reset-list-kept" id="reset-sheet-kept">${o.kept.length ? li(o.kept) : '<li>Nothing</li>'}</ul>
      ${o.notes.map(n => `<p class="reset-note">${escapeHTML(n)}</p>`).join('')}
      <p class="reset-final" id="reset-sheet-final">${escapeHTML(o.final)}</p>
    </div>
    <div class="sheet-pin">
      <label class="label" for="reset-sheet-input">Type ${RESET_CONFIRM_WORD} to confirm</label>
      <input class="input" id="reset-sheet-input" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="12" placeholder="${RESET_CONFIRM_WORD}">
      <div style="display:flex;gap:10px;margin-top:12px">
        <button class="btn-secondary" id="reset-sheet-no">Cancel</button>
        <button class="btn-danger" id="reset-sheet-yes" style="flex:1" disabled>Reset</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);
  const inp = document.getElementById('reset-sheet-input');
  const yes = document.getElementById('reset-sheet-yes');
  const x = document.getElementById('reset-sheet-cancel');
  const no = document.getElementById('reset-sheet-no');
  if (x) x.addEventListener('click', cleanup);
  if (no) no.addEventListener('click', cleanup);
  // In place, never render() — this sheet has an input (MAP rule 3).
  const sync = () => { if (yes) yes.disabled = !resetConfirmMatches(inp ? inp.value : ''); };
  if (inp) { inp.addEventListener('input', sync); inp.addEventListener('keyup', sync); }
  if (yes) yes.addEventListener('click', () => {
    // Checked again here: a disabled attribute is a hint, not a guard.
    if (!resetConfirmMatches(inp ? inp.value : '')) { sync(); return; }
    cleanup();
    resetPerform(level);
  });
}

// ---- Settings → Data → Reset This Phone ------------------------------------------
function renderSettingsReset() {
  let photos = 0;
  try { if (typeof photoStatsSync === 'function') photos = photoStatsSync().count || 0; } catch (e) {}
  const header = (typeof renderSettingsSubHeader === 'function') ? renderSettingsSubHeader('Reset This Phone') : '';
  const level = (lv) => `
        <button class="reset-level" id="reset-level-${lv}" data-action="reset-open" data-arg="${lv}">
          <span class="reset-level-title">${escapeHTML(RESET_LEVEL_TEXT[lv].title)}</span>
          <span class="reset-level-blurb">${escapeHTML(RESET_LEVEL_TEXT[lv].blurb)}</span>
        </button>`;
  return `
    <div class="screen">
      ${header}
      <div class="settings-section">
        <h2 class="h2">Before you start</h2>
        <p class="muted">Resetting deletes things from this phone for good. No copy is kept &mdash; not even a daily snapshot. If there is anything you might want back, save a backup file first and keep it somewhere off this phone.</p>
        <button class="backup-action-btn primary" id="reset-backup-btn" data-action="backup-export">&#11015; Save a backup file first</button>
        ${photos ? `<p class="muted" style="font-size:13px">Photos aren't in the backup file. To keep your ${_resetPlural(photos, 'photo', 'photos')}, save them from Backup &amp; Restore first.</p>
        <button class="backup-action-btn" id="reset-photos-btn" data-action="settings-page" data-arg="settingsBackup">Go to Backup &amp; Restore</button>` : ''}
      </div>
      <div class="settings-section">
        <h2 class="h2">Choose what to reset</h2>
        <p class="muted">You'll see exactly what is deleted and what is kept before anything happens.</p>
        ${level('work')}
        ${level('settings')}
        ${level('everything')}
      </div>
    </div>
  `;
}
