/*!
 * PAT Test PWA
 * v22 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PAT Test PWA — v22 — Multi Pick ==============
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
      if (items.length) out.slots.push({ name, items });
    });
  }
  return out;
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
    alert('Please enter a location before using Multi Pick — it\'s applied to every item it adds.');
    return;
  }

  slot.items.forEach(typeRaw => {
    const cleanType = normaliseItemType(typeRaw);
    const item = {
      id: uid(),
      assetNo: nextAssetNo(sess),   // recomputed each push off the growing list
      location: cleanLocation,
      itemType: cleanType,
      notes: '',
      result: 'pass'
    };
    // v17: stamp each item on creation, only when timestamps are enabled.
    if (state.timestampsEnabled) item.ts = new Date().toISOString();
    sess.items.push(item);
    addDescriptionIfNew(cleanType);
    // v18: learn each (location, type) pairing in the batch.
    recordSqpUsage(cleanLocation, cleanType);
  });

  const n = slot.items.length;
  markSessionDirty(sess);            // v14: new entries invalidate a prior export
  state.multiPickSheetOpen = false;
  state.cursor = sess.items.length;  // drop onto a fresh new item after the batch
  loadFormForCursor();
  // v17: copy-style feedback (double-buzz / copy tone), matching its existing
  // haptic. The sheet has just closed, so flash the entry-screen Multi Pick
  // button as the visual cue.
  feedback('copy', 'multipick-btn');
  save();
  render();
  showToast(`Added ${n} item${n === 1 ? '' : 's'}`);
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
    if (items.length) slots.push({ name, items });
  });
  state.multiPick = { enabled, slots: slots.slice(0, MULTIPICK_MAX_SLOTS) };
  save();
  setView('settings');
}
