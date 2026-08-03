/*!
 * PATGo PWA
 * v62 (August 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PATGo PWA — v62 — Photo evidence store ==============
//
// The app's FIRST use of any persistence mechanism other than localStorage.
// Everything that touches IndexedDB lives in this file and nowhere else, so the
// async surface is one contained boundary rather than something smeared across
// session.js and the render files.
//
// WHY INDEXEDDB AND NOT localStorage
// localStorage is a ~5MB synchronous string store. A single 1280px JPEG is
// ~200KB, and base64 inflates that by a third. Three photos on twenty fails
// would exhaust the entire budget the sessions blob already lives in — and
// would take the sessions blob down with it. IndexedDB stores Blobs natively
// (no base64 tax), has a far larger quota, and is off the main thread.
//
// ⚠ THE SYNCHRONOUS-RENDER PROBLEM — read this before changing anything here.
// render() is synchronous. The Overview draws a 📷 count on fail rows and cannot
// await a database. So this file keeps an IN-MEMORY COUNT INDEX
// (state.photoIndex: { [itemId]: count }) built once at boot and updated on
// every add and delete. Renders read that index synchronously; only the actual
// image data is ever loaded async, and only when the strip is opened by a
// deliberate tap. If you add a render path that needs photo data, add it to the
// index — do NOT make render() async.
//
// RECORD SHAPE
//   { id, itemId, sessionId, blob, w, h, bytes, at }
// `sessionId` is denormalised onto every record deliberately: deleting a job
// must delete its photos in ONE indexed sweep, without first walking the
// session's items (which by then may already be gone).
//
// FAILURE POSTURE
// Photos are evidence, not core data. Every function here fails SOFT — if
// IndexedDB is unavailable, blocked (private browsing on some engines), or
// throws, the app must carry on logging items exactly as it does today. Nothing
// in this file is allowed to break the fail flow. Callers get null/0/empty and
// the photo UI simply doesn't appear.

const PHOTO_DB_NAME = 'patgo-photos';
const PHOTO_DB_VERSION = 1;
const PHOTO_STORE_NAME = 'photos';

// Memoised open promise. Null until the first call; never re-opened on success.
let _photoDbPromise = null;
// Set true once an open has failed. Stops every later call retrying a database
// that isn't coming back, which would otherwise stall the fail flow on a device
// with IndexedDB disabled.
let _photoDbBroken = false;

// ---------- availability ----------

// Cheap synchronous guard, safe to call from render(). False on any engine
// without IndexedDB and after a failed open.
function photosSupported() {
  if (_photoDbBroken) return false;
  try {
    return typeof indexedDB !== 'undefined' && !!indexedDB;
  } catch {
    return false;
  }
}

// ---------- database ----------

// Open (creating on first use). Resolves to a database or null — NEVER rejects,
// because every caller is on a path that must survive a photo store failure.
function openPhotoDb() {
  if (!photosSupported()) return Promise.resolve(null);
  if (_photoDbPromise) return _photoDbPromise;

  _photoDbPromise = new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(PHOTO_DB_NAME, PHOTO_DB_VERSION);
    } catch {
      _photoDbBroken = true;
      resolve(null);
      return;
    }

    req.onupgradeneeded = () => {
      try {
        const db = req.result;
        if (!db.objectStoreNames.contains(PHOTO_STORE_NAME)) {
          const store = db.createObjectStore(PHOTO_STORE_NAME, { keyPath: 'id' });
          // Both indexes are non-unique: an item has up to PHOTO_MAX_PER_ITEM
          // photos, a session has many.
          store.createIndex('itemId', 'itemId', { unique: false });
          store.createIndex('sessionId', 'sessionId', { unique: false });
        }
      } catch (e) {
        console.error('Photo store upgrade failed', e);
      }
    };

    req.onsuccess = () => {
      const db = req.result;
      // A later version of the app in another tab wants to upgrade; close so it
      // isn't blocked. Next call re-opens.
      db.onversionchange = () => { try { db.close(); } catch {} _photoDbPromise = null; };
      resolve(db);
    };

    req.onerror = () => { _photoDbBroken = true; resolve(null); };
    // Fires when another tab holds an older version open. Don't hang forever.
    req.onblocked = () => { _photoDbBroken = true; resolve(null); };
  });

  return _photoDbPromise;
}

// Shared transaction helper. `mode` is 'readonly' or 'readwrite'. `fn` receives
// the object store and MAY return an IDBRequest whose result is wanted; a batch
// that issues several requests returns nothing.
//
// ⚠ ALWAYS RESOLVES `{ ok, result }` — never a bare value, and never rejects.
// The distinction matters and was originally got wrong: an earlier version
// returned the request result and a `fallback` on failure, which made "the
// transaction failed" and "this batch had no single result to report"
// indistinguishable. Every multi-delete (per-item, per-session, bulk) issues
// several requests and returns nothing, so all of them read as failures and
// silently skipped their in-memory index update. The photos were deleted from
// IndexedDB, but the on-screen counts stayed stale until the app restarted.
// Caught by the smoke harness; keep the two signals separate.
function _photoTx(mode, fn) {
  return openPhotoDb().then((db) => {
    if (!db) return { ok: false, result: undefined };
    return new Promise((resolve) => {
      let tx;
      try {
        tx = db.transaction(PHOTO_STORE_NAME, mode);
      } catch {
        resolve({ ok: false, result: undefined });
        return;
      }
      let result;
      try {
        const req = fn(tx.objectStore(PHOTO_STORE_NAME));
        if (req) req.onsuccess = () => { result = req.result; };
      } catch {
        resolve({ ok: false, result: undefined });
        return;
      }
      // oncomplete is the ONLY success signal — a transaction that completes
      // has durably written everything it was asked to, whether that was one
      // request or forty.
      tx.oncomplete = () => resolve({ ok: true, result });
      tx.onerror = () => resolve({ ok: false, result: undefined });
      tx.onabort = () => resolve({ ok: false, result: undefined });
    });
  }).catch(() => ({ ok: false, result: undefined }));
}

// ---------- the in-memory count index ----------

// Rebuild state.photoIndex from the store. Called ONCE from boot.js after
// load(), then re-renders so the counts appear. Until it resolves, counts read
// as 0 and the UI simply shows no chips — never a wrong number.
function photoIndexLoad() {
  if (!photosSupported()) return Promise.resolve(false);
  return _photoTx('readonly', (store) => store.getAll()).then(({ result }) => {
    const records = result || [];
    const index = {};
    let bytes = 0;
    records.forEach((r) => {
      if (!r || !r.itemId) return;
      index[r.itemId] = (index[r.itemId] || 0) + 1;
      bytes += (typeof r.bytes === 'number' && r.bytes > 0) ? r.bytes : 0;
    });
    state.photoIndex = index;
    state.photoBytes = bytes;
    return true;
  }).catch(() => false);
}

// Synchronous count for an item — the ONLY thing render() may call.
function photoCountForItem(itemId) {
  if (!itemId || !state.photoIndex) return 0;
  return state.photoIndex[itemId] || 0;
}

// Synchronous totals for the Settings → Storage line. Derived from the same
// index, so it can never disagree with the chips.
function photoStatsSync() {
  const index = state.photoIndex || {};
  let count = 0;
  for (const key in index) count += index[key] || 0;
  return { count, bytes: state.photoBytes || 0 };
}

function _photoIndexAdd(itemId, bytes) {
  if (!state.photoIndex) state.photoIndex = {};
  state.photoIndex[itemId] = (state.photoIndex[itemId] || 0) + 1;
  state.photoBytes = (state.photoBytes || 0) + (bytes || 0);
}

function _photoIndexRemove(itemId, bytes) {
  if (!state.photoIndex) return;
  const next = (state.photoIndex[itemId] || 0) - 1;
  if (next > 0) state.photoIndex[itemId] = next;
  else delete state.photoIndex[itemId];
  state.photoBytes = Math.max(0, (state.photoBytes || 0) - (bytes || 0));
}

// ---------- image processing ----------

// Downscale and re-encode a chosen file. Mirrors handleReportLogoFile /
// storeSignatureFromSource (session.js) — the same FileReader → <img> → canvas
// recipe that has been proven on iOS since v34 — with two deliberate
// differences: output is JPEG, not PNG (a photo has no transparency to preserve
// and JPEG is several times smaller), and the cap is PHOTO_MAX_PX rather than
// the much smaller logo cap.
//
// Resolves to { blob, w, h, bytes } or null. Never rejects.
function processPhotoFile(file) {
  return new Promise((resolve) => {
    if (!file || !/^image\//.test(file.type || '')) { resolve(null); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const maxPx = (typeof PHOTO_MAX_PX === 'number') ? PHOTO_MAX_PX : 1280;
          const quality = (typeof PHOTO_JPEG_QUALITY === 'number') ? PHOTO_JPEG_QUALITY : 0.7;
          let { width, height } = img;
          if (!width || !height) { resolve(null); return; }
          if (width > maxPx || height > maxPx) {
            const scale = maxPx / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          const cx = canvas.getContext('2d');
          // White base: a transparent PNG source would otherwise flatten to
          // black under JPEG, which looks like a broken photo.
          cx.fillStyle = '#ffffff';
          cx.fillRect(0, 0, width, height);
          cx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (!blob) { resolve(null); return; }
            resolve({ blob, w: width, h: height, bytes: blob.size });
          }, 'image/jpeg', quality);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

// ---------- writes ----------

// Store one processed photo against an item. Resolves to the record id, or null
// on any failure (including the per-item cap being full, which is checked here
// as well as in the UI so the cap can't be bypassed by a double-tap).
function photoAdd(sessionId, itemId, processed) {
  if (!itemId || !processed || !processed.blob) return Promise.resolve(null);
  const cap = (typeof PHOTO_MAX_PER_ITEM === 'number') ? PHOTO_MAX_PER_ITEM : 3;
  if (photoCountForItem(itemId) >= cap) return Promise.resolve(null);

  const record = {
    id: (typeof uid === 'function') ? uid() : String(Date.now()) + Math.random().toString(36).slice(2),
    itemId,
    sessionId: sessionId || '',
    blob: processed.blob,
    w: processed.w,
    h: processed.h,
    bytes: processed.bytes || processed.blob.size || 0,
    at: new Date().toISOString()
  };

  return _photoTx('readwrite', (store) => store.put(record)).then(({ ok }) => {
    if (!ok) return null;
    _photoIndexAdd(itemId, record.bytes);
    return record.id;
  });
}

// ---------- reads ----------

// Every photo for one item, oldest first. Returns [] on failure.
function photosForItem(itemId) {
  if (!itemId) return Promise.resolve([]);
  return _photoTx('readonly', (store) => store.index('itemId').getAll(itemId))
    .then(({ result }) => {
      const list = (result || []).slice();
      list.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
      return list;
    })
    .catch(() => []);
}

// ---------- deletes ----------

// Delete one photo by id. Resolves true if it went.
function photoDelete(photoId) {
  if (!photoId) return Promise.resolve(false);
  return _photoTx('readonly', (store) => store.get(photoId)).then(({ result: record }) => {
    if (!record) return false;
    return _photoTx('readwrite', (store) => store.delete(photoId)).then(({ ok }) => {
      if (!ok) return false;
      _photoIndexRemove(record.itemId, record.bytes);
      return true;
    });
  });
}

// Delete every photo attached to one item. Used by the item-delete path and by
// the v62 decision 14B confirm (a fail edited to a pass gives up its photos).
function photosDeleteForItem(itemId) {
  if (!itemId) return Promise.resolve(0);
  return photosForItem(itemId).then((records) => {
    if (!records.length) return 0;
    return _photoTx('readwrite', (store) => {
      records.forEach((r) => { try { store.delete(r.id); } catch {} });
    }).then(({ ok }) => {
      if (!ok) return 0;
      records.forEach((r) => _photoIndexRemove(r.itemId, r.bytes));
      return records.length;
    });
  });
}

// Delete every photo attached to any of several items — the bulk-delete path.
// Sequential rather than parallel on purpose: a bulk delete of forty items
// would otherwise open forty concurrent transactions on a phone.
function photosDeleteForItems(itemIds) {
  const ids = (itemIds || []).filter(Boolean);
  if (!ids.length) return Promise.resolve(0);
  return ids.reduce(
    (chain, itemId) => chain.then((total) =>
      photosDeleteForItem(itemId).then((n) => total + n)),
    Promise.resolve(0)
  );
}

// Delete every photo belonging to one or more sessions. This is why sessionId is
// denormalised onto the record: deleting or pruning a job sweeps its photos with
// one index lookup per job, and does NOT need the session's items — which the
// caller may have already removed.
//
// ⚠ Call this BEFORE the sessions are filtered out of state.sessions, the same
// ordering rule archiveSessionStats() follows in v59.
function photosDeleteForSessions(sessionIds) {
  const ids = (sessionIds || []).filter(Boolean);
  if (!ids.length) return Promise.resolve(0);
  return ids.reduce((chain, sessionId) => chain.then((total) => {
    return _photoTx('readonly', (store) => store.index('sessionId').getAll(sessionId))
      .then(({ result }) => {
        const records = result || [];
        if (!records.length) return total;
        return _photoTx('readwrite', (store) => {
          records.forEach((r) => { try { store.delete(r.id); } catch {} });
        }).then(({ ok }) => {
          if (!ok) return total;
          records.forEach((r) => _photoIndexRemove(r.itemId, r.bytes));
          return total + records.length;
        });
      });
  }), Promise.resolve(0));
}

// Wipe the entire store — the Settings escape hatch (decision 9A). Resolves to
// the number removed.
function photosDeleteAll() {
  const before = photoStatsSync().count;
  return _photoTx('readwrite', (store) => store.clear()).then(({ ok }) => {
    if (!ok) return 0;
    state.photoIndex = {};
    state.photoBytes = 0;
    return before;
  });
}

// ---------- object URL lifecycle ----------
//
// Blobs are shown via URL.createObjectURL, which leaks until revoked. Every URL
// handed to the UI is tracked here and released when the strip closes or a
// staged photo is discarded. Nothing else in the app should call
// createObjectURL on a photo blob.

let _photoObjectUrls = [];

function photoObjectUrl(blob) {
  try {
    const url = URL.createObjectURL(blob);
    _photoObjectUrls.push(url);
    return url;
  } catch {
    return '';
  }
}

function photoReleaseObjectUrls() {
  _photoObjectUrls.forEach((url) => { try { URL.revokeObjectURL(url); } catch {} });
  _photoObjectUrls = [];
}

// ---------- storage persistence ----------
//
// (decision 9A) Ask the browser to mark this origin's storage persistent, which
// is what stops photos being evicted under storage pressure. On an installed iOS
// home-screen PWA this is normally granted without a prompt. Called once, on the
// first photo ever added — not at boot, because asking before the user has shown
// any intent is the kind of thing that produces a prompt on desktop for no
// reason. Fails silently everywhere it isn't supported.
function photoRequestPersistence() {
  try {
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      return navigator.storage.persist().catch(() => false);
    }
  } catch {}
  return Promise.resolve(false);
}

// ---------- v62 (decision 7A): the separate photo export/import file ----------
//
// WHY PHOTOS DO NOT RIDE THE NORMAL BACKUP
// The JSON backup is deliberately human-readable and is the safety net for
// everything else in the app. Embedding photos as base64 would inflate a
// typical backup from tens of KB to tens of MB, make it slow to write and
// awkward to email, and — the part that actually matters — risk the write
// failing on a phone, taking the sessions backup down with it. A photo problem
// would have become a total-data-loss problem.
//
// WHY THE MAIN BACKUP NEEDS NO CHANGES AT ALL
// Photo records key off item.id, and item ids already ride inside the sessions
// blob in every backup. So restoring a backup and then importing a photo file
// re-links them with no extra bookkeeping: the photos find their items because
// the items kept their identity. Nothing in the backup format has to know
// photos exist. The only addition is an informational `photoCount`.
//
// THE COST, STATED PLAINLY: two files instead of one. The Backup screen says so
// and the welcome modal says so, because a user who thinks their photos are in
// their backup has a nasty surprise waiting.

// Read one Blob as a base64 payload (no data-URL prefix).
function _photoBlobToBase64(blob) {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : '');
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    } catch {
      resolve('');
    }
  });
}

// Turn a base64 payload back into a Blob without fetch() — this must work with
// no network and inside a service-worker-cached page.
function _photoBase64ToBlob(b64, type) {
  try {
    const binary = atob(b64 || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: type || 'image/jpeg' });
  } catch {
    return null;
  }
}

// Build the export bundle. Sequential encoding, not parallel: forty photos read
// at once on a phone is a memory spike for no speed gain.
function buildPhotoBundle() {
  return _photoTx('readonly', (store) => store.getAll()).then(({ result }) => {
    const list = (result || []).filter((r) => r && r.blob && r.itemId);
    if (!list.length) return null;
    return list.reduce((chain, r) => chain.then((acc) => {
      return _photoBlobToBase64(r.blob).then((data) => {
        // A photo that won't encode is skipped rather than written as an empty
        // husk that would import as a broken image.
        if (data) {
          acc.push({
            id: r.id,
            itemId: r.itemId,
            sessionId: r.sessionId || '',
            w: r.w || 0,
            h: r.h || 0,
            bytes: r.bytes || 0,
            at: r.at || '',
            type: (r.blob && r.blob.type) || 'image/jpeg',
            data
          });
        }
        return acc;
      });
    }), Promise.resolve([])).then((photos) => {
      if (!photos.length) return null;
      return {
        kind: PHOTO_BUNDLE_KIND,
        photoVersion: PHOTO_BUNDLE_VERSION,
        appVersion: (typeof APP_VERSION !== 'undefined') ? APP_VERSION : '',
        exportedAt: new Date().toISOString(),
        count: photos.length,
        photos
      };
    });
  });
}

// Export flow, including the size warning before the encode rather than after.
function downloadPhotoBundle() {
  const stats = photoStatsSync();
  if (!stats.count) { showToast('No photos to export'); return; }

  const proceed = () => {
    showToast('Preparing photos…');
    buildPhotoBundle().then((bundle) => {
      if (!bundle) { showToast('Could not read the photos'); return; }
      try {
        const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `PATGo_photos_${todayISO()}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`Exported ${bundle.count} photo${bundle.count === 1 ? '' : 's'}`);
      } catch {
        showToast('Could not save the photo file');
      }
    });
  };

  // base64 costs about a third on top of the stored bytes — warn on the real
  // file size, not the stored size.
  const approx = Math.round(stats.bytes * 1.37);
  if (approx > PHOTO_EXPORT_WARN_BYTES) {
    openConfirmSheet({
      title: 'Large photo file',
      message:
        `${stats.count} photos will make a file of roughly ${formatBytes(approx)}. ` +
        `That may be too big to email — you may need to save it to Files or a cloud drive. Continue?`,
      confirmLabel: 'Export anyway',
      onConfirm: proceed
    });
    return;
  }
  proceed();
}

// Import a photo file. Rejects a backup or setup bundle imported here by
// mistake, exactly as setup.js's file-kind guard does for its own format.
function importPhotosFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    let data;
    try {
      data = JSON.parse(e.target.result);
    } catch {
      openInfoSheet({ title: "Couldn't read that file", message: 'That file isn\'t valid JSON. Choose the photo file you exported from PATGo.' });
      return;
    }
    if (!data || data.kind !== PHOTO_BUNDLE_KIND || !Array.isArray(data.photos)) {
      openInfoSheet({
        title: 'Wrong kind of file',
        message: 'That doesn\'t look like a PATGo photo file. Your normal backup goes in Restore backup — photos are a separate file.'
      });
      return;
    }
    if (!photosSupported()) {
      openInfoSheet({ title: 'Photos unavailable', message: 'This device can\'t store photos, so they can\'t be imported.' });
      return;
    }

    const valid = data.photos.filter((p) => p && p.id && p.itemId && p.data);
    if (!valid.length) { showToast('No photos in that file'); return; }

    openConfirmSheet({
      title: 'Import photos?',
      message:
        `Import ${valid.length} photo${valid.length === 1 ? '' : 's'}? ` +
        `Photos already on this device are kept — any with the same id are replaced.`,
      confirmLabel: 'Import',
      onConfirm: () => {
        showToast('Importing photos…');
        valid.reduce((chain, p) => chain.then((n) => {
          const blob = _photoBase64ToBlob(p.data, p.type);
          if (!blob) return n;
          const record = {
            id: p.id,
            itemId: p.itemId,
            sessionId: p.sessionId || '',
            blob,
            w: p.w || 0,
            h: p.h || 0,
            bytes: (typeof p.bytes === 'number' && p.bytes > 0) ? p.bytes : blob.size,
            at: p.at || new Date().toISOString()
          };
          return _photoTx('readwrite', (store) => store.put(record))
            .then(({ ok }) => ok ? n + 1 : n);
        }), Promise.resolve(0)).then((n) => {
          // Rebuild the whole index from the store rather than incrementing as
          // we go: a put() over an existing id REPLACES rather than adds, so
          // counting the writes would over-report on any re-import.
          return photoIndexLoad().then(() => {
            render();
            showToast(`Imported ${n} photo${n === 1 ? '' : 's'}`);
          });
        });
      }
    });
  };
  reader.onerror = () => {
    openInfoSheet({ title: "Couldn't read that file", message: 'The file could not be opened. Try again.' });
  };
  reader.readAsText(file);
}
