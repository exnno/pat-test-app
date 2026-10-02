/*!
 * PATGo PWA
 * v23 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PATGo PWA — v23 — Multi Pick ==============
// Multi Pick: config validation, load, active-slots, fire, settings save.

// ---------- v16: Multi Pick helpers ----------
// Validate an arbitrary value (from localStorage or a restored backup) into a
// safe config object. Anything unexpected collapses to { enabled:false,
// slots:[] }. Slot names are trimmed and capped; item entries are trimmed and
// blanks dropped; slots with no items are discarded. Slot count is capped at
// MULTIPICK_MAX_SLOTS.
function normaliseMultiPickConfig(raw) {
  const out = { enabled: false, slots: [] };
  if (!raw || typeof raw !== 'object') return out;
  out.enabled = !!raw.enabled;
  if (Array.isArray(raw.slots)) {
    raw.slots.forEach(s => {
      if (out.slots.length >= MULTIPICK_MAX_SLOTS) return;
      const name = (s && typeof s.name === 'string') ? s.name.trim().slice(0, 40) : '';
      const items = (s && Array.isArray(s.items))
        ? s.items.map(x => String(x || '').trim()).filter(Boolean)
        : [];
      if (!items.length) return;
      const slot = { name, items };
      // V94: the Quick Pick tile number, kept only when valid and not already
      // taken (first wins — the settings page clears a clash before it saves,
      // this is the guard for a hand-edited backup or a synced row). Absent
      // when unassigned, so an untouched config keeps V93's exact shape.
      const qp = s ? Number(s.qp) : NaN;
      if (Number.isInteger(qp) && qp >= 1 && qp <= QP_TILE_SLOTS
          && !out.slots.some(o => o.qp === qp)) slot.qp = qp;
      out.slots.push(slot);
    });
  }
  return out;
}

// V94 (7): the multi-picks assigned to the Quick Pick grid, as
// [{ qp, slot }] sorted by qp. Empty when none — the grid is then exactly V93's.
function qpTiles() {
  const slots = (state.multiPick && state.multiPick.slots) || [];
  return slots
    .filter(s => s && s.items && s.items.length && Number.isInteger(s.qp)
      && s.qp >= 1 && s.qp <= QP_TILE_SLOTS)
    .map(s => ({ qp: s.qp, slot: s }))
    .sort((a, b) => a.qp - b.qp);
}

function qpTileSlot(qp) {
  const hit = qpTiles().find(t => t.qp === Number(qp));
  return hit ? hit.slot : null;
}

// The tile's label: the multi-pick's name, else its list.
function qpTileLabel(slot) {
  return (slot && (slot.name || (slot.items || []).join(' · '))) || '';
}

function loadMultiPickConfig() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(MULTIPICK_KEY) || 'null'); } catch {}
  return normaliseMultiPickConfig(raw);
}

// Slots that are actually usable (have at least one item). Belt-and-braces: the
// stored config is already filtered, but a hand-edited backup could carry
// empties, so we filter again at the point of use.
function activeMultiPickSlots() {
  return (state.multiPick.slots || []).filter(s => s.items && s.items.length);
}

// Fire a multi-pick: append every item in the chosen slot as a PASS, in order,
// to the END of the active session (never overwriting the item on screen),
// auto-numbering each off the previous one and using the current Location field
// for all of them. Notes are left blank. Lands the cursor on a fresh new item
// afterwards, buzzes the copy-last haptic, and shows an "Added N items" toast.
function multiPickFire(idx) {
  const sess = activeSession();
  if (!sess) return;
  if (sess.locked) return;                       // belt-and-braces; button is disabled too
  const slot = activeMultiPickSlots()[idx];
  if (!slot || !slot.items.length) return;

  // Location is mandatory per item (v13). Multi Pick supplies the item types
  // itself, so we only need a location — applied to every inserted item. If it's
  // missing, close the sheet first so the alert clears to the entry screen with
  // the Location field in view, rather than leaving the sheet covering it.
  const cleanLocation = normaliseLocation(state.form.location);
  if (!cleanLocation) {
    state.multiPickSheetOpen = false;
    render();
    showToast('Enter a location first — Multi Pick applies it to every item');
    return;
  }

  const added = [];   // V94: for Undo
  slot.items.forEach(typeRaw => {
    const cleanType = normaliseItemType(typeRaw);
    const item = {
      id: newId(),   // V94: was uid() — V78 meant every new record to use newId()
      assetNo: nextAssetNo(sess),   // recomputed each push off the growing list
      location: cleanLocation,
      itemType: cleanType,
      notes: '',
      result: 'pass'
    };
    // v77: stamp each item on creation, unconditionally. This line used to read
    // `if (state.timestampsEnabled)`, which was the v17 rule and was missed when
    // v61 changed it: from v61, `ts` is captured on EVERY item's first log and
    // the setting gates EXPOSURE only (the CSV column and the Overview line).
    // saveItem and copyLastResult were both converted; this one was not, so any
    // item added through Multi Pick with the setting off carried no timestamp at
    // all and could never be shown or exported even after the user turned it on.
    // Capture-only change: nothing displays a ts that the setting doesn't already
    // gate, so no existing user sees anything new because of this.
    item.ts = new Date().toISOString();
    sess.items.push(item);
    added.push(item);
    addDescriptionIfNew(cleanType);
    // v18: learn each (location, type) pairing in the batch.
    recordSqpUsage(cleanLocation, cleanType);
  });

  const n = slot.items.length;
  noteLastLog(sess, added, slot.name || slot.items.join(', '));   // V94: one Undo for the batch
  markSessionDirty(sess);            // v14: new entries invalidate a prior export
  state.multiPickSheetOpen = false;
  state.cursor = sess.items.length;  // drop onto a fresh new item after the batch
  // v65 (decision 6B): Multi Pick computes every asset number itself from
  // nextAssetNo() and never looks at the form, so the counter is authoritative
  // again after a batch. Clear the scan carry-forward or the next box would be
  // left blank on the strength of a scan that happened before the batch.
  state.lastLogWasScanned = false;
  state.lastScanSessionId = '';
  loadFormForCursor();
  // v17: copy-style feedback (double-buzz / copy tone), matching its existing
  // haptic. The sheet has just closed, so flash the entry-screen Multi Pick
  // button as the visual cue.
  feedback('copy', 'multipick-btn');
  // v23 (E2): hot path — a batch append touches the sessions blob plus the two
  // cold keys it can change (descriptions, learned SQP history). Skips the rest.
  saveSessions(); saveSqpHistory(); saveDescriptions();
  render();
  showToast(`Added ${n} item${n === 1 ? '' : 's'}`);
}

// ============== V94 — Multi Pick tiles in Quick Pick (7, 12A) ==============
// A multi-pick assigned a Quick Pick slot (`qp`) shows as a tile on the grid's
// bottom row. It behaves EXACTLY like an item type (12A): a tap selects it
// (highlighted), PASS logs the whole sequence. While one is selected FAIL is
// greyed — a multi-pick is passes only. Tapping a type or typing in the custom
// box swaps to that. state.form.qpTile holds the selected slot number; it is
// not part of the form loadFormForCursor() builds, so logging, moving the
// cursor or opening a job clears it the same way it clears the item type.
//
// ⚠ The selection changes the DOM IN PLACE (classes, the FAIL button), never a
// render(): the quick-pick action works the same way, because a render here
// would rebuild #app under a tap and drop the keyboard if a field is open.

function qpTileSyncDom() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.qp-tile').forEach(b =>
    b.classList.toggle('active', Number(b.dataset.arg) === state.form.qpTile));
  const fb = document.getElementById('fail-btn');
  const sess = activeSession();
  if (fb) fb.disabled = !!(sess && sess.locked) || !!state.form.qpTile;
}

function qpTileSelect(qp) {
  const sess = activeSession();
  if (!sess || sess.locked) return;
  if (state.cursor < sess.items.length) return;   // a sequence can't replace one item
  const n = Number(qp);
  if (!qpTileSlot(n)) return;
  state.form.qpTile = n;
  state.form.itemType = '';
  const inp = document.getElementById('f-type');
  if (inp) inp.value = '';
  document.querySelectorAll('.quick-btn').forEach(b => b.classList.remove('active'));
  state.showSuggestions = false;
  if (typeof renderSuggestionsOnly === 'function') renderSuggestionsOnly();
  qpTileSyncDom();
}

// Called when an item type is chosen another way (a type button, typing, a
// suggestion): the tile gives way, and FAIL comes back.
function qpTileClear() {
  if (!state.form.qpTile) return;
  state.form.qpTile = null;
  qpTileSyncDom();
}

// PASS with a tile selected. Modelled on multiPickFire(), and differs from it
// in the three ways that make it "exactly like an item":
//   • the FIRST item takes the Asset box's number (a scanned label included),
//     with the usual duplicate check; the rest number on from it;
//   • a note typed on the form goes on the FIRST item (Multi Pick's sheet has
//     no form to type into, so it leaves notes blank);
//   • it lands like a single PASS — PASS feedback, the scan carry-forward
//     honoured, the lightweight entry refresh.
// Location is mandatory, as for every item. No readings sheet: a multi-pick
// is a run of passes, exactly as the Multi Pick button logs them.
function qpTileFire(qp) {
  const sess = activeSession();
  if (!sess || sess.locked) return;
  if (state.cursor < sess.items.length) return;
  const slot = qpTileSlot(qp);
  if (!slot || !slot.items.length) { qpTileClear(); return; }
  const err = validateBeforeSave({ skipItemType: true });
  if (err) { showToast(err); return; }

  const cleanLocation = normaliseLocation(state.form.location);
  const firstAsset = state.form.assetNo.trim();
  const notes = state.form.notes.trim();
  const added = [];
  slot.items.forEach((typeRaw, i) => {
    const cleanType = normaliseItemType(typeRaw);
    const item = {
      id: newId(),
      assetNo: (i === 0 && firstAsset) ? firstAsset : nextAssetNo(sess),
      location: cleanLocation,
      itemType: cleanType,
      notes: i === 0 ? notes : '',
      result: 'pass'
    };
    item.ts = new Date().toISOString();   // v61: every item stamped on first log
    sess.items.push(item);
    added.push(item);
    addDescriptionIfNew(cleanType);
    recordSqpUsage(cleanLocation, cleanType);
  });

  markSessionDirty(sess);
  state.cursor = sess.items.length;
  // Same rule as saveItem: a scanned number means the next box is left blank
  // rather than offering arithmetic on someone else's label.
  state.lastLogWasScanned = !!state.scanFilledAsset;
  state.lastScanSessionId = state.lastLogWasScanned ? sess.id : '';
  const label = qpTileLabel(slot);
  noteLastLog(sess, added, label);
  loadFormForCursor();                 // clears qpTile with the rest of the form
  feedback('pass', 'pass-btn');
  saveSessions(); saveSqpHistory(); saveDescriptions();
  refreshEntryAfterLog();
  const n = added.length;
  showToast(`Added ${n} item${n === 1 ? '' : 's'} — ${label}`);
}

// Settings: picking a slot for one multi-pick takes it from any other, in the
// page itself, so what is on screen is what saves.
function mpQpPicked(el) {
  if (!el || !el.value) return;
  document.querySelectorAll('.mp-slot-qp').forEach(o => {
    if (o !== el && o.value === el.value) o.value = '';
  });
}

// v16: save the Multi Pick settings page. Reads the show/hide toggle and all 6
// slot rows from the live DOM in one pass. Each row's sequence input is split on
// commas; blanks dropped. Slots with no items are not stored. Matches the
// "Save = commit" model of the other settings sub-pages (the toggle persists on
// Save too, not instantly).
function saveMultiPickSettings() {
  const enabledEl = document.getElementById('multipick-enabled');
  const enabled = enabledEl ? !!enabledEl.checked : !!state.multiPick.enabled;
  const slots = [];
  document.querySelectorAll('.mp-slot').forEach(row => {
    const nameEl = row.querySelector('.mp-slot-name');
    const seqEl  = row.querySelector('.mp-slot-seq');
    const name = nameEl ? String(nameEl.value || '').trim().slice(0, 40) : '';
    const items = seqEl
      ? String(seqEl.value || '').split(',').map(s => s.trim()).filter(Boolean)
      : [];
    // V94: the Quick Pick tile slot, if one is chosen.
    const qpEl = row.querySelector('.mp-slot-qp');
    const qp = qpEl ? parseInt(qpEl.value, 10) : NaN;
    if (items.length) slots.push(Number.isInteger(qp) ? { name, items, qp } : { name, items });
  });
  // Through the normaliser, so a clash or a stray value can't be stored.
  state.multiPick = normaliseMultiPickConfig({ enabled, slots: slots.slice(0, MULTIPICK_MAX_SLOTS) });
  save();
  setView('settings');
}
