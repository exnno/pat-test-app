/*!
 * PATGo PWA
 * V105 (October 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PATGo PWA — V105 — Daily snapshots (S14) ==============
// Once a day the app quietly keeps a copy of everything a backup file holds, in
// its own IndexedDB database on this phone. Restorable through the SAME apply
// path as a backup file (backup.js applyBackupData), downloadable as a normal
// backup file, and a "before restore" safety copy is taken ahead of any restore.
//
// OPTIONAL SUBSYSTEM (MAP rule 6). Every entry point is typeof-guarded at its
// call site and nothing here may throw into the caller: a missing, blocked or
// full database means no snapshots, never a broken app. Not probed in
// bootIntegrityOK() for the same reason as photos.js.
//
// Locked decisions (V105): 1B keep 7 · 2A taken on the first open of the day ·
// 3B skipped when nothing changed since the newest · 4A no photos · 5B list +
// restore + Save as file · 6A a safety copy before any restore · 7A switch,
// default ON · 8A everyone, signed in or not.
//
// Why a separate database and not a store inside 'patgo-photos': adding a store
// there needs a version bump and an onupgradeneeded migration on a database that
// holds evidence. A second database touches nothing that already exists.

const SNAPSHOT_DB_NAME = 'patgo-snapshots';
const SNAPSHOT_DB_VERSION = 1;
// ⚠ Must differ from photos.js's store name: the harness IndexedDB stub keeps
// one namespace of store names across every database.
const SNAPSHOT_STORE = 'snapshots';
const SNAPSHOT_KEEP = 7;                       // 1B: daily copies kept
const SNAPSHOT_BEFORE_ID = 'before-restore';   // 6A: one slot, replaced each restore

let _snapDbPromise = null;
// Full records, json included, newest first. Held in memory so "Save as file"
// can build its download synchronously inside the tap — an await between the tap
// and the click risks the phone treating the download as not user-started.
let _snapCache = [];
// The day snapshotsDaily() last ran to an outcome. A cheap guard so the
// visibility hook does not open the database every time the app comes forward.
let _snapCheckedDay = null;
let _snapRunning = false;
let _snapHooked = false;

function _snapSupported() {
  try { return typeof indexedDB !== 'undefined' && !!indexedDB && typeof indexedDB.open === 'function'; }
  catch (e) { return false; }
}

function _snapOpen() {
  if (_snapDbPromise) return _snapDbPromise;
  _snapDbPromise = new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(SNAPSHOT_DB_NAME, SNAPSHOT_DB_VERSION); }
    catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('snapshot database would not open'));
  });
  // A failed open must not stick: the next call tries again.
  _snapDbPromise.catch(() => { _snapDbPromise = null; });
  return _snapDbPromise;
}

// One transaction; resolves with the last request's result once the
// transaction has COMPLETED (a write is only safe once it has committed).
function _snapTx(mode, work) {
  return _snapOpen().then(db => new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction([SNAPSHOT_STORE], mode); }
    catch (e) { reject(e); return; }
    const store = tx.objectStore(SNAPSHOT_STORE);
    let result;
    let req;
    try { req = work(store); } catch (e) { reject(e); return; }
    if (req) req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('snapshot transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('snapshot transaction aborted'));
  }));
}

// A real job — the example job does not count, same rule as the storage
// protection ask in boot.js. An empty phone has nothing worth keeping, and a
// snapshot of nothing would push a useful one out of the seven.
function _snapHasRealJob() {
  const flag = (typeof DEMO_SESSION_FLAG === 'string') ? DEMO_SESSION_FLAG : 'isExample';
  return Array.isArray(state.sessions) && state.sessions.some(s => s && !s[flag]);
}

// 32-bit FNV-1a over the string, prefixed with its length. Only ever asked "is
// this the same as the newest copy?", so a collision costs at worst one skipped
// day — never a lost or wrong restore.
function snapshotSig(text) {
  const s = String(text == null ? '' : text);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return s.length + ':' + h.toString(16);
}

// The record body. The stored json is exactly what buildBackup() writes to a
// file. The signature leaves out the two fields that change without the data
// changing (when this copy was made, when a backup was last exported), so 3B
// compares only the engineer's work and settings.
function _snapPayload() {
  const takenAt = new Date().toISOString();
  const data = buildBackup();
  data.exportedAt = takenAt;
  const json = JSON.stringify(data);
  const sig = snapshotSig(JSON.stringify(Object.assign({}, data, { exportedAt: '', lastBackupAt: '' })));
  const sessions = Array.isArray(data.sessions) ? data.sessions : [];
  const items = sessions.reduce((n, s) => n + (s && Array.isArray(s.items) ? s.items.length : 0), 0);
  return { takenAt, json, sig, sessions: sessions.length, items, bytes: json.length * 2 };
}

function _snapMeta(r) {
  return { id: r.id, kind: r.kind, day: r.day, takenAt: r.takenAt, sessions: r.sessions, items: r.items, bytes: r.bytes };
}

function _snapOrder(list) {
  // The safety copy first, then the daily copies newest first.
  return list.slice().sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'before' ? -1 : 1;
    return String(b.day || '').localeCompare(String(a.day || '')) || String(b.takenAt || '').localeCompare(String(a.takenAt || ''));
  });
}

function _snapPublish(list) {
  _snapCache = _snapOrder(list.filter(r => r && typeof r.id === 'string' && typeof r.json === 'string'));
  state.snapList = _snapCache.map(_snapMeta);
  state.snapBytes = _snapCache.reduce((n, r) => n + (Number(r.bytes) || 0), 0);
}

// Reads every snapshot into memory and publishes the list the Backup page draws
// from. Never rejects: an unavailable database publishes an empty list and sets
// state.snapUnavailable, which the page says in plain words.
async function snapshotsLoad() {
  if (!_snapSupported()) { state.snapUnavailable = true; _snapPublish([]); return state.snapList; }
  try {
    const all = await _snapTx('readonly', store => store.getAll());
    state.snapUnavailable = false;
    _snapPublish(Array.isArray(all) ? all : []);
  } catch (e) {
    console.error('Snapshots could not be read (non-fatal).', e);
    state.snapUnavailable = true;
    _snapPublish([]);
  }
  return state.snapList;
}

function _snapNoteFail(day) {
  try { localStorage.setItem(SNAPSHOT_FAIL_KEY, day); } catch (e) {}
}
function _snapNoteOk() {
  try { localStorage.removeItem(SNAPSHOT_FAIL_KEY); } catch (e) {}
}
function snapshotLastFailDay() {
  try { return localStorage.getItem(SNAPSHOT_FAIL_KEY) || ''; } catch (e) { return ''; }
}

// 2A + 3B: the day's snapshot. Runs at boot (after the first render) and when
// the app comes back to the front, because an iPhone can keep the app alive in
// the background for days and a boot-only hook would miss them. Resolves to a
// word saying what happened; never rejects.
async function snapshotsDaily() {
  if (state.snapshotsEnabled === false) return 'off';
  if (!_snapSupported()) return 'unsupported';
  const today = todayISO();
  if (_snapCheckedDay === today) return 'done';
  if (_snapRunning) return 'busy';
  _snapRunning = true;
  try {
    if (!_snapHasRealJob()) { _snapCheckedDay = today; return 'empty'; }
    const all = await _snapTx('readonly', store => store.getAll());
    const dailies = _snapOrder((Array.isArray(all) ? all : []).filter(r => r && r.kind === 'daily'));
    if (dailies.some(r => r.day === today)) { _snapCheckedDay = today; _snapPublish(all); return 'done'; }
    const p = _snapPayload();
    if (dailies.length && dailies[0].sig === p.sig) {
      _snapCheckedDay = today;
      _snapNoteOk();
      _snapPublish(all);
      return 'same';
    }
    const rec = {
      id: 'day-' + today, kind: 'daily', day: today, takenAt: p.takenAt, sig: p.sig,
      sessions: p.sessions, items: p.items, bytes: p.bytes, json: p.json,
    };
    // ⚠ WRITE FIRST, THEN PRUNE. The oldest copies are removed only once the new
    // one has committed, so a refused write (a full phone) leaves the seven that
    // were already there exactly as they were.
    await _snapTx('readwrite', store => store.put(rec));
    const gone = dailies.slice(SNAPSHOT_KEEP - 1).map(r => r.id);
    if (gone.length) {
      try { await _snapTx('readwrite', store => { let last = null; gone.forEach(id => { last = store.delete(id); }); return last; }); }
      catch (e) { console.error('Old snapshots not removed (non-fatal).', e); }
    }
    _snapCheckedDay = today;
    _snapNoteOk();
    const kept = (Array.isArray(all) ? all : []).filter(r => r && gone.indexOf(r.id) === -1 && r.id !== rec.id);
    _snapPublish(kept.concat([rec]));
    snapshotsRepaint();
    return 'taken';
  } catch (e) {
    console.error('Daily snapshot not saved (non-fatal).', e);
    // Set the day anyway so a phone that is out of space is not asked again
    // every time the app comes forward; the next day (or cold start) retries.
    _snapCheckedDay = today;
    _snapNoteFail(today);
    snapshotsRepaint();
    return 'failed';
  } finally {
    _snapRunning = false;
  }
}

// 6A: a copy of what is on the phone now, taken before a restore replaces it.
// One slot, replaced each time. REJECTS on a refused write — the caller
// (backup.js restoreWithSafetyCopy) asks before restoring without it. Resolves
// 'empty' with nothing written when there is no real job to protect, and
// 'unsupported' where there is no database at all (the restore just goes ahead,
// as it always did).
async function snapshotBeforeRestore() {
  if (!_snapSupported()) return 'unsupported';
  if (!_snapHasRealJob()) return 'empty';
  const p = _snapPayload();
  const rec = {
    id: SNAPSHOT_BEFORE_ID, kind: 'before', day: todayISO(), takenAt: p.takenAt, sig: p.sig,
    sessions: p.sessions, items: p.items, bytes: p.bytes, json: p.json,
  };
  await _snapTx('readwrite', store => store.put(rec));
  _snapPublish(_snapCache.filter(r => r.id !== SNAPSHOT_BEFORE_ID).concat([rec]));
  return 'saved';
}

function _snapFind(id) {
  return _snapCache.find(r => r.id === id) || null;
}

// "Mon 05/10/2026 · 09:14" — UK date, as everywhere the user reads one.
function snapshotLabel(meta) {
  if (!meta) return '';
  let when = (typeof formatDate === 'function') ? formatDate(meta.day) : String(meta.day || '');
  try {
    const d = new Date(meta.takenAt);
    if (!isNaN(d.getTime())) {
      const wd = d.toLocaleDateString('en-GB', { weekday: 'short' });
      const hm = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      when = `${wd} ${when} · ${hm}`;
    }
  } catch (e) {}
  return meta.kind === 'before' ? `Before your last restore · ${when}` : when;
}

// Tap on a snapshot's Restore. Parsed BEFORE the safety copy is written: when the
// row tapped is the safety copy itself, the new safety copy replaces it, and the
// restore still uses what was tapped — so restoring it twice swaps back and forth.
function snapshotRestoreAsk(id) {
  const rec = _snapFind(id);
  if (!rec) { if (typeof showToast === 'function') showToast('That snapshot is no longer on this phone'); return; }
  let data = null;
  try { data = JSON.parse(rec.json); } catch (e) { data = null; }
  if (!data || !Array.isArray(data.sessions)) {
    openInfoSheet({ title: 'That snapshot can\u2019t be read', message: 'It may have been damaged. Your current data hasn\u2019t been touched.' });
    return;
  }
  openConfirmSheet({
    title: 'Restore this snapshot?',
    message:
      `${snapshotLabel(_snapMeta(rec))}: ${rec.sessions} job${rec.sessions === 1 ? '' : 's'} and ${rec.items} item${rec.items === 1 ? '' : 's'}. ` +
      `This will REPLACE all current data on this phone. A copy of what's here now is kept first, so you can undo this from the same list.`,
    confirmLabel: 'Replace & restore',
    onConfirm: () => restoreWithSafetyCopy(() => applyBackupData(data, { markExported: false })),
  });
}

// 5B: a snapshot as an ordinary backup file. Pretty-printed like Export backup,
// so the two are indistinguishable to Import. Deliberately does NOT stamp the
// backup as exported: the file may be days old, and the reminder is about today.
function snapshotSaveFile(id) {
  const rec = _snapFind(id);
  if (!rec) { if (typeof showToast === 'function') showToast('That snapshot is no longer on this phone'); return; }
  let text = rec.json;
  try { text = JSON.stringify(JSON.parse(rec.json), null, 2); } catch (e) {}
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `PAT backup ${fileDateUK(rec.day)} snapshot.json`;   // UK date, no underscores (V87)
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 7A: the switch. Persisted through save() (storage.js) like every other flag.
// Switching it back on takes today's copy straight away if one is due.
function setSnapshotsEnabled(on) {
  state.snapshotsEnabled = !!on;
  try { localStorage.setItem(SNAPSHOTS_KEY, state.snapshotsEnabled ? '1' : '0'); } catch (e) {}
  if (state.snapshotsEnabled) { _snapCheckedDay = null; snapshotsDaily().catch(() => {}); }
}

// The Backup page's section. A PURE function of state (and the failure day), so
// it can be painted in place by snapshotsRepaint() when the database answers.
function snapshotsSectionHTML() {
  const on = state.snapshotsEnabled !== false;
  const list = Array.isArray(state.snapList) ? state.snapList : null;
  const failDay = snapshotLastFailDay();
  const failNote = failDay ? `
        <p class="snapshot-fail-note"><strong>The last daily snapshot didn't save</strong> (${escapeHTML((typeof formatDate === 'function') ? formatDate(failDay) : failDay)}). The phone may be short of space. Your older snapshots are still here.</p>` : '';
  let body;
  if (list === null) {
    body = `<p class="muted">Checking&hellip;</p>`;
  } else if (state.snapUnavailable) {
    body = `<p class="muted">This phone isn't letting PATGo keep snapshots. Export backups regularly.</p>`;
  } else if (!list.length) {
    body = `<p class="muted">No snapshots yet. ${on ? 'The first is taken the next time you open PATGo with a job saved.' : 'Switch on to start keeping them.'}</p>`;
  } else {
    body = list.map(m => `
        <div class="snapshot-row">
          <div class="snapshot-row-text">
            <div class="snapshot-row-title">${escapeHTML(snapshotLabel(m))}</div>
            <div class="snapshot-row-sub">${m.sessions} job${m.sessions === 1 ? '' : 's'} · ${Number(m.items || 0).toLocaleString()} item${m.items === 1 ? '' : 's'}</div>
          </div>
          <div class="snapshot-row-btns">
            <button class="snapshot-btn" data-action="snapshot-restore" data-arg="${escapeHTML(m.id)}">Restore</button>
            <button class="snapshot-btn" data-action="snapshot-save" data-arg="${escapeHTML(m.id)}">Save as file</button>
          </div>
        </div>`).join('') + `
        <p class="muted snapshot-total">${list.length} snapshot${list.length === 1 ? '' : 's'} · ${escapeHTML(formatBytes(state.snapBytes || 0))}</p>`;
  }
  return `
        <div class="toggle-row">
          <div class="toggle-row-text">
            <div class="toggle-row-title">Take daily snapshots</div>
            <div class="toggle-row-sub">${on ? 'On' : 'Off'}</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="snapshots-toggle" data-change-action="snapshots-toggle" ${on ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>${failNote}
        <div class="snapshot-list">${body}
        </div>`;
}

// Paint the section IN PLACE when it is on screen. Never render(): this resolves
// at an arbitrary moment, the same reasoning as checkStorageProtection().
function snapshotsRepaint() {
  try {
    const el = (typeof document !== 'undefined') ? document.getElementById('snapshots-block') : null;
    if (el) el.innerHTML = snapshotsSectionHTML();
  } catch (e) {}
}

// The app came back to the front: today's snapshot, if one is still due. A
// named function so the harness can tell it apart from sync's own listener.
function _snapOnVisible() {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') snapshotsDaily().catch(() => {});
}

// Boot entry point (boot.js, after the first render, only on a good load — so a
// failed load can never be saved as a snapshot). Takes the day's copy, loads the
// list, and hooks the app coming back to the front. Never rejects.
function snapshotsBoot() {
  if (!_snapHooked && typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
    _snapHooked = true;
    document.addEventListener('visibilitychange', _snapOnVisible);
  }
  return snapshotsDaily()
    .catch(() => 'failed')
    .then(() => snapshotsLoad())
    .then(() => { snapshotsRepaint(); })
    .catch(() => {});
}

// (c) 2026 Peter Birchley. All rights reserved.
