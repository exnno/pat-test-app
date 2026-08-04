// ============== PATGo PWA — v66 — Test instruments ==============
// (c) 2026 Peter Birchley. All rights reserved.
//
// WHAT THIS FILE OWNS
// A list of PAT testers (up to INSTRUMENTS_MAX), one of them "in use", and the
// rule that decides WHICH instrument a given job's certificate should name.
//
// ---------------------------------------------------------------------------
// THE DEFECT THIS FIXES (read this before changing anything below)
// ---------------------------------------------------------------------------
// Before v66 the instrument make/model and its calibration details were FIVE
// FLAT GLOBAL FIELDS on state (testerMake, testerModel, calDate, calCertNo,
// calDue), read straight out of state at PDF render time. Nothing was recorded
// on the session. So reprinting a March certificate today, after recalibrating
// in June, printed JUNE's calibration date against MARCH's results — wrong on a
// document the engineer certifies, and getting worse the longer the app is used.
//
// The fix is that a session REMEMBERS which instrument tested it
// (`session.instrumentId`, stamped at creation). Supporting more than one
// instrument is the same piece of work, so v66 does both.
//
// ---------------------------------------------------------------------------
// ⚠ THE FLAT FIELDS STILL EXIST — THEY ARE NOW A MIRROR, NOT THE TRUTH
// ---------------------------------------------------------------------------
// `state.instruments` is the single source of truth. The five flat fields are
// kept as a live MIRROR of whichever instrument is active, refreshed by
// `syncActiveInstrumentMirror()` after every change.
//
// This was a deliberate risk decision. Ripping the flat fields out would have
// meant touching storage load/save, the legacy localStorage keys, both backup
// paths, the setup export/import, and the first-run wizard all at once, in a
// release that already changes the data model. Keeping them as a mirror means:
//   • storage.js's existing legacy-key load/save keeps working untouched
//   • old backups and old Setup files restore exactly as they always did
//   • the first-run wizard keeps writing state.calDate as it always did
// …and every one of those paths converges on the instruments list through ONE
// of the two sync functions below.
//
// ⚠ TWO DIRECTIONS, DO NOT CONFUSE THEM:
//   syncActiveInstrumentMirror()   instruments  → flat  (after any CRUD)
//   adoptMirrorIntoInstruments()   flat → active instrument (legacy writers:
//                                  the first-run wizard)
//   restoreInstrumentsFromBackup() a whole incoming payload → the list
//                                  (backup restore + Setup import)
//
// If you ever add a new code path that writes a flat field directly, it MUST
// call adoptMirrorIntoInstruments() afterwards or the write is silently lost on
// the next sync.
//
// ---------------------------------------------------------------------------
// ⚠ DELETING AN INSTRUMENT SNAPSHOTS IT ONTO THE JOBS THAT USED IT
// ---------------------------------------------------------------------------
// Deleting an instrument that jobs reference would re-create the exact defect
// v66 exists to fix: those jobs would silently fall back to whatever instrument
// is active today. So `deleteInstrument()` first writes a frozen copy of its
// details onto every referencing session (`session.instrumentSnapshot`), and
// `instrumentForSession()` reads that copy when the id no longer resolves.
// Blocking deletion instead would have trapped the user with every tester they
// have ever owned. Do not "simplify" this away.
//
// ---------------------------------------------------------------------------
// STORAGE
// ---------------------------------------------------------------------------
// Two new localStorage keys (INSTRUMENTS_KEY, ACTIVE_INSTRUMENT_KEY) and two
// additive session fields (`instrumentId`, `instrumentSnapshot`). NO
// backupVersion bump: the session codec passes unlisted fields through
// unchanged, and the backup restore is missing-field-tolerant in both
// directions. See restoreInstrumentsFromBackup().

// ---------- Shape & small helpers ----------

// Dates come from <input type="date"> so they are always ISO or empty. Anything
// else is garbage from a hand-edited backup and collapses to empty rather than
// reaching formatDate().
function normaliseInstrumentDate(v) {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

// The one place an instrument object is built. Every entry point (migration,
// backup restore, Setup import, the Add button) goes through here, so a
// malformed record can never reach the rest of the app.
function makeInstrument(fields) {
  const f = fields || {};
  const id = (typeof f.id === 'string' && f.id) ? f.id : _instrumentUid();
  return {
    id: id,
    make: typeof f.make === 'string' ? f.make.trim() : '',
    model: typeof f.model === 'string' ? f.model.trim() : '',
    calDate: normaliseInstrumentDate(f.calDate),
    calCertNo: typeof f.calCertNo === 'string' ? f.calCertNo.trim() : '',
    calDue: normaliseInstrumentDate(f.calDue)
  };
}

// `uid` is a const arrow in session.js, which loads AFTER this file. It resolves
// fine at call time (nothing here runs before boot), but the guard costs
// nothing and keeps this file usable in isolation — same defensive shape as
// photos.js uses for the identical reason.
function _instrumentUid() {
  return (typeof uid === 'function')
    ? uid()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function instrumentHasData(inst) {
  if (!inst) return false;
  return !!(inst.make || inst.model || inst.calDate || inst.calCertNo || inst.calDue);
}

function instrumentDisplayName(inst) {
  if (!inst) return '';
  const n = [inst.make, inst.model].filter(Boolean).join(' ').trim();
  return n || 'Unnamed instrument';
}

function instrumentList() {
  return Array.isArray(state.instruments) ? state.instruments : [];
}

function findInstrument(id) {
  if (!id) return null;
  return instrumentList().find(i => i.id === id) || null;
}

// Falls back to the first entry when activeInstrumentId is stale (an id that no
// longer exists — possible after a partial restore). Never returns undefined.
function activeInstrument() {
  const list = instrumentList();
  if (!list.length) return null;
  return list.find(i => i.id === state.activeInstrumentId) || list[0];
}

function instrumentUseCount(id) {
  if (!id) return 0;
  return (state.sessions || []).filter(s => s && s.instrumentId === id).length;
}

// ⚠ THE RESOLUTION RULE — the single helper report.js, csv.js and the UI all
// call, so "which instrument does this job show" is decided in exactly one
// place. Three tiers, in order:
//   1. the stamped instrument, if it still exists
//   2. the frozen snapshot left behind when it was deleted
//   3. the active instrument (which is what EVERY pre-v66 session gets, so old
//      certificates print exactly as they did before — decision 3A)
function instrumentForSession(sess) {
  if (sess && sess.instrumentId) {
    const stamped = findInstrument(sess.instrumentId);
    if (stamped) return stamped;
    const snap = sess.instrumentSnapshot;
    if (snap && typeof snap === 'object') return snap;
  }
  return activeInstrument();
}

// Convenience for the two report/CSV call sites: the combined make+model string.
function instrumentNameForSession(sess) {
  const inst = instrumentForSession(sess);
  if (!inst) return '';
  return [inst.make, inst.model].filter(Boolean).join(' ').trim();
}

// ---------- Calibration status ----------

// v12 logic, moved here from session.js in v66 and parameterised. The old
// zero-argument `calibrationStatus()` survives below as a thin wrapper over the
// ACTIVE instrument so existing callers read the same.
// ⚠ Both dates are floored to midnight before subtracting — without that, a due
// date "today" reads as -1 day (overdue) for most of the day.
function calibrationStatusFor(inst) {
  if (!inst || !inst.calDue) return null;
  const parts = String(inst.calDue).split('-');
  if (parts.length !== 3) return null;
  const yyyy = parseInt(parts[0], 10);
  const mm   = parseInt(parts[1], 10);
  const dd   = parseInt(parts[2], 10);
  if (!yyyy || !mm || !dd) return null;
  const due = new Date(yyyy, mm - 1, dd);
  if (isNaN(due.getTime())) return null;
  due.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - now.getTime()) / 86400000);
  if (days < 0) return { status: 'overdue', days: -days };
  if (days <= CAL_DUE_SOON_DAYS) return { status: 'soon', days };
  return { status: 'ok', days };
}

function calibrationStatus() {
  return calibrationStatusFor(activeInstrument());
}

// Sort key for the banner: overdue always beats due-soon; within overdue the
// MOST overdue wins; within due-soon the SOONEST wins.
function _calFlagSortKey(f) {
  return f.st.status === 'overdue' ? (-1000000 - f.st.days) : f.st.days;
}

// ⚠ Decision 5B — warn about ANY instrument, not just the active one. Returns
// the single worst offender plus a count of the others, because two stacked
// banners on the Sessions screen would be worse than the problem. Null when
// nothing is due or overdue, so a healthy list adds nothing to the screen.
function worstCalibrationStatus() {
  const flagged = [];
  instrumentList().forEach(inst => {
    const st = calibrationStatusFor(inst);
    if (st && (st.status === 'overdue' || st.status === 'soon')) flagged.push({ inst, st });
  });
  if (!flagged.length) return null;
  flagged.sort((a, b) => _calFlagSortKey(a) - _calFlagSortKey(b));
  const top = flagged[0];
  return {
    inst: top.inst,
    name: instrumentDisplayName(top.inst),
    status: top.st.status,
    days: top.st.days,
    others: flagged.length - 1
  };
}

// ---------- The two sync directions ----------

// instruments → flat mirror. Call after ANY change to the list or to which
// instrument is active.
function syncActiveInstrumentMirror() {
  const inst = activeInstrument();
  state.testerMake  = inst ? inst.make : '';
  state.testerModel = inst ? inst.model : '';
  state.calDate     = inst ? inst.calDate : '';
  state.calCertNo   = inst ? inst.calCertNo : '';
  state.calDue      = inst ? inst.calDue : '';
}

// flat mirror → the active instrument. For legacy writers that still set the
// flat fields directly (the first-run wizard). Updates the active instrument IN
// PLACE so its id — which sessions reference — survives.
function adoptMirrorIntoInstruments() {
  const incoming = makeInstrument({
    make: state.testerMake,
    model: state.testerModel,
    calDate: state.calDate,
    calCertNo: state.calCertNo,
    calDue: state.calDue
  });
  const inst = activeInstrument();
  if (inst) {
    inst.make = incoming.make;
    inst.model = incoming.model;
    inst.calDate = incoming.calDate;
    inst.calCertNo = incoming.calCertNo;
    inst.calDue = incoming.calDue;
  } else if (instrumentHasData(incoming)) {
    state.instruments = [incoming];
    state.activeInstrumentId = incoming.id;
  }
  syncActiveInstrumentMirror();
}

// ---------- Persistence ----------

// ⚠ `raw === null` (the key has NEVER been written) is what distinguishes a
// pre-v66 install that needs migrating from a v66 user who deleted every
// instrument. Without that check, emptying the list would silently resurrect
// the old flat fields as "Instrument 1" on the next launch.
function loadInstruments() {
  let raw = null;
  try { raw = localStorage.getItem(INSTRUMENTS_KEY); } catch (e) { raw = null; }

  let list = [];
  if (typeof raw === 'string' && raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed.map(makeInstrument).slice(0, INSTRUMENTS_MAX);
    } catch (e) {
      list = [];
    }
  } else if (raw === null) {
    // v66 migration (decision 10A): the existing single instrument becomes the
    // first entry and stays active, so the user opens Settings and nothing has
    // moved — there is just now an Add button. An install with no instrument
    // details at all migrates to an EMPTY list, which prints nothing, exactly
    // as blank fields did before.
    const migrated = makeInstrument({
      make: state.testerMake,
      model: state.testerModel,
      calDate: state.calDate,
      calCertNo: state.calCertNo,
      calDue: state.calDue
    });
    if (instrumentHasData(migrated)) list = [migrated];
  }

  state.instruments = list;

  let activeId = '';
  try { activeId = localStorage.getItem(ACTIVE_INSTRUMENT_KEY) || ''; } catch (e) { activeId = ''; }
  state.activeInstrumentId = list.some(i => i.id === activeId)
    ? activeId
    : (list.length ? list[0].id : '');

  syncActiveInstrumentMirror();
}

// ⚠ Pruning here (and not in the editor) is what stops a half-finished "Add"
// reaching storage: tapping Add creates a blank record immediately so the
// editor has something to bind to, and it is only ever persisted if it gained
// data. Skipped while the editor is open, or the record would vanish under the
// user mid-edit.
function saveInstruments() {
  if (!state.instrumentEditorId) pruneBlankInstruments();
  try {
    localStorage.setItem(INSTRUMENTS_KEY, JSON.stringify(instrumentList()));
    localStorage.setItem(ACTIVE_INSTRUMENT_KEY, state.activeInstrumentId || '');
  } catch (e) { /* quota / private mode — same soft-fail as every other key */ }
}

// Used by BOTH backup restore and Setup import. Replaces the list wholesale, so
// restoring describes the backup exactly rather than merging with what was
// already there — consistent with how restore treats everything else.
//
// ⚠ The else-branch depends on the caller having ALREADY restored the five flat
// fields, which both callers do immediately above their call. A pre-v66 backup
// therefore restores to a single instrument built from its own tester details.
function restoreInstrumentsFromBackup(data) {
  if (data && Array.isArray(data.instruments)) {
    state.instruments = data.instruments.map(makeInstrument).slice(0, INSTRUMENTS_MAX);
    const wanted = typeof data.activeInstrumentId === 'string' ? data.activeInstrumentId : '';
    state.activeInstrumentId = state.instruments.some(i => i.id === wanted)
      ? wanted
      : (state.instruments.length ? state.instruments[0].id : '');
  } else {
    const fromMirror = makeInstrument({
      make: state.testerMake,
      model: state.testerModel,
      calDate: state.calDate,
      calCertNo: state.calCertNo,
      calDue: state.calDue
    });
    state.instruments = instrumentHasData(fromMirror) ? [fromMirror] : [];
    state.activeInstrumentId = state.instruments.length ? state.instruments[0].id : '';
  }
  syncActiveInstrumentMirror();
}

function pruneBlankInstruments() {
  const list = instrumentList();
  const kept = list.filter(i => instrumentHasData(i) || instrumentUseCount(i.id) > 0);
  if (kept.length === list.length) return;
  state.instruments = kept;
  if (!kept.some(i => i.id === state.activeInstrumentId)) {
    state.activeInstrumentId = kept.length ? kept[0].id : '';
  }
  syncActiveInstrumentMirror();
}

// ---------- CRUD ----------

function addInstrument() {
  if (!Array.isArray(state.instruments)) state.instruments = [];
  if (state.instruments.length >= INSTRUMENTS_MAX) {
    showToast(`You can save up to ${INSTRUMENTS_MAX} instruments`);
    return;
  }
  const inst = makeInstrument({});
  state.instruments.push(inst);
  if (!state.activeInstrumentId) state.activeInstrumentId = inst.id;
  state.instrumentEditorId = inst.id;
  setView('settingsInstrument');
}

function openInstrumentEditor(id) {
  if (!findInstrument(id)) return;
  state.instrumentEditorId = id;
  setView('settingsInstrument');
}

// Leaving without saving. Anything the Add button created and the user never
// filled in is dropped here.
function closeInstrumentEditor() {
  state.instrumentEditorId = '';
  pruneBlankInstruments();
  save();
  setView('settingsUser');
}

function saveInstrumentFromEditor() {
  const inst = findInstrument(state.instrumentEditorId);
  if (!inst) { state.instrumentEditorId = ''; setView('settingsUser'); return; }
  const g = id => document.getElementById(id);
  const $make = g('inst-make');
  const $model = g('inst-model');
  const $cd = g('inst-cal-date');
  const $cc = g('inst-cal-cert');
  const $cdu = g('inst-cal-due');

  const make = $make ? $make.value.trim() : inst.make;
  const model = $model ? $model.value.trim() : inst.model;
  // An instrument with no name at all would show as "Unnamed instrument"
  // forever, so require one identifying field rather than silently deleting the
  // record out from under the Save tap.
  if (!make && !model) {
    showToast('Add a manufacturer or model first');
    return;
  }
  inst.make = make;
  inst.model = model;
  // ⚠ Empty strings are written deliberately — that is what makes a calibration
  // date CLEARABLE (see the Clear links in the editor). Before v66 the fields
  // were <input type="date"> with no clear affordance, so a date entered once
  // could never be removed.
  if ($cd) inst.calDate = normaliseInstrumentDate($cd.value);
  if ($cc) inst.calCertNo = $cc.value.trim();
  if ($cdu) inst.calDue = normaliseInstrumentDate($cdu.value);

  syncActiveInstrumentMirror();
  state.instrumentEditorId = '';
  save();
  setView('settingsUser');
}

function setActiveInstrument(id) {
  if (!findInstrument(id)) return;
  state.activeInstrumentId = id;
  syncActiveInstrumentMirror();
  save();
  render();
}

function deleteInstrument(id) {
  const inst = findInstrument(id);
  if (!inst) return;
  const used = instrumentUseCount(id);
  const name = instrumentDisplayName(inst);
  openConfirmSheet({
    title: 'Delete this instrument?',
    message: used
      ? `${name} is recorded on ${used} job${used === 1 ? '' : 's'}. Those jobs keep their own copy of its details, so their certificates stay correct. It will be removed from your list.`
      : `${name} will be removed from your list.`,
    confirmLabel: 'Delete',
    onConfirm: () => {
      // ⚠ Freeze a copy onto every job that used it BEFORE removing it, or those
      // certificates silently fall back to today's instrument — the exact defect
      // v66 exists to fix.
      const snap = {
        make: inst.make,
        model: inst.model,
        calDate: inst.calDate,
        calCertNo: inst.calCertNo,
        calDue: inst.calDue
      };
      (state.sessions || []).forEach(s => {
        if (s && s.instrumentId === id && !s.instrumentSnapshot) {
          s.instrumentSnapshot = { ...snap };
        }
      });
      state.instruments = instrumentList().filter(i => i.id !== id);
      if (state.activeInstrumentId === id) {
        state.activeInstrumentId = state.instruments.length ? state.instruments[0].id : '';
      }
      syncActiveInstrumentMirror();
      state.instrumentEditorId = '';
      save();
      setView('settingsUser');
    }
  });
}

// ⚠ Decision 9A — a targeted DOM write, NOT a render. Re-rendering here would
// throw away every other unsaved field in the editor (the v60.1 rule).
function clearInstrumentDateField(which) {
  const el = document.getElementById(which === 'due' ? 'inst-cal-due' : 'inst-cal-date');
  if (el) el.value = '';
  const btn = document.querySelector(
    '[data-action="instrument-clear-date"][data-arg="' + (which === 'due' ? 'due' : 'date') + '"]'
  );
  if (btn) btn.style.display = 'none';
}

// ---------- Render ----------

function _calChipHTML(st) {
  if (!st) return '';
  if (st.status === 'overdue') {
    return ` <span class="cal-chip overdue">Overdue · ${st.days} day${st.days === 1 ? '' : 's'}</span>`;
  }
  if (st.status === 'soon') {
    return st.days === 0
      ? ` <span class="cal-chip soon">Due today</span>`
      : ` <span class="cal-chip soon">Due in ${st.days} day${st.days === 1 ? '' : 's'}</span>`;
  }
  return '';
}

// The list block embedded in User Settings.
function renderInstrumentListHTML() {
  const list = instrumentList();
  if (!list.length) {
    return `
      <p class="muted" style="margin:4px 0 12px">No instruments saved yet. Add the PAT tester you use and it will appear on your certificates and CSV exports.</p>
      <button class="btn-secondary" data-action="instrument-add">+ Add instrument</button>
    `;
  }
  const rows = list.map(inst => {
    const isActive = inst.id === state.activeInstrumentId;
    const chip = _calChipHTML(calibrationStatusFor(inst));
    const sub = inst.calDue
      ? `Calibration due ${escapeHTML(formatDate(inst.calDue))}`
      : 'No calibration date saved';
    const used = instrumentUseCount(inst.id);
    const usedLine = used ? ` · on ${used} job${used === 1 ? '' : 's'}` : '';
    return `
      <div class="instrument-card${isActive ? ' active' : ''}">
        <button class="instrument-head" data-action="instrument-open" data-arg="${escapeHTML(inst.id)}">
          <span class="instrument-head-text">
            <span class="instrument-head-name">${escapeHTML(instrumentDisplayName(inst))}${isActive ? ' <span class="instrument-badge">In use</span>' : ''}</span>
            <span class="instrument-head-sub">${sub}${usedLine}${chip}</span>
          </span>
          <span class="instrument-head-chevron">›</span>
        </button>
        ${isActive ? '' : `
        <div class="instrument-head-actions">
          <button class="link-btn" data-action="instrument-make-active" data-arg="${escapeHTML(inst.id)}">Use this one</button>
        </div>`}
      </div>
    `;
  }).join('');

  const footer = list.length >= INSTRUMENTS_MAX
    ? `<p class="muted" style="margin:10px 0 0;font-size:12px">That's the limit of ${INSTRUMENTS_MAX} instruments. Delete one to add another.</p>`
    : `<button class="btn-secondary" data-action="instrument-add" style="margin-top:10px">+ Add instrument</button>`;

  return rows + footer;
}

// The single-instrument editor screen. Reached only from User Settings, so it is
// deliberately NOT in SETTINGS_CATEGORIES or SETTINGS_PAGE_META and has its own
// back action rather than sharing `back-to-settings`.
function renderSettingsInstrument() {
  const inst = findInstrument(state.instrumentEditorId);
  if (!inst) { state.view = 'settingsUser'; return renderSettingsUser(); }

  const isActive = inst.id === state.activeInstrumentId;
  const used = instrumentUseCount(inst.id);
  const chip = _calChipHTML(calibrationStatusFor(inst));

  const clearBtn = (which, has) => has
    ? `<button class="link-btn instrument-clear" data-action="instrument-clear-date" data-arg="${which}">Clear</button>`
    : '';

  return `
    <div class="screen">
      <header class="header-row">
        <button class="icon-btn" data-action="instrument-editor-close" aria-label="Back">‹</button>
        <div class="site-name">Test instrument</div>
        <span style="width:40px"></span>
      </header>

      <div class="settings-section">
        <h2 class="h2">Instrument</h2>
        <p class="muted">The make and model of this PAT tester. Shown on certificates and on the CSV export when the "Test Instrument" column is switched on.</p>

        <label class="label">Manufacturer</label>
        <input class="input" id="inst-make" value="${escapeHTML(inst.make)}" placeholder="e.g. Megger, Seaward, Kewtech">

        <label class="label">Model</label>
        <input class="input" id="inst-model" value="${escapeHTML(inst.model)}" placeholder="e.g. PAT250, Apollo 600, KT77">
      </div>

      <div class="settings-section">
        <h2 class="h2">Calibration</h2>
        <p class="muted">All optional. Tap Clear to empty a date you no longer want recorded.</p>

        <label class="label">Last calibration date ${clearBtn('date', !!inst.calDate)}</label>
        <input class="input input-date" id="inst-cal-date" type="date" value="${escapeHTML(inst.calDate)}">

        <label class="label">Certificate number</label>
        <input class="input" id="inst-cal-cert" value="${escapeHTML(inst.calCertNo)}" placeholder="e.g. CAL-2026-0142">

        <label class="label">Next calibration due ${clearBtn('due', !!inst.calDue)}${chip}</label>
        <input class="input input-date" id="inst-cal-due" type="date" value="${escapeHTML(inst.calDue)}">
      </div>

      ${isActive ? `
      <p class="muted" style="margin:0 0 8px;font-size:13px">✓ This is the instrument new jobs are recorded against.</p>
      ` : `
      <button class="btn-secondary" data-action="instrument-make-active" data-arg="${escapeHTML(inst.id)}" style="margin-bottom:8px">Use this instrument for new jobs</button>
      `}

      ${used ? `<p class="muted" style="margin:0 0 8px;font-size:12px">Recorded on ${used} job${used === 1 ? '' : 's'}. Editing it here updates what those certificates show.</p>` : ''}

      <button class="btn-primary" data-action="instrument-save" style="margin-top:8px">Save</button>
      <button class="btn-danger" data-action="instrument-delete" data-arg="${escapeHTML(inst.id)}" style="margin-top:10px;width:100%">Delete instrument</button>
    </div>
  `;
}

// The per-session picker on the Edit Session screen (decision 2A — stamped at
// creation, changeable afterwards). Renders nothing at all when the user has no
// instruments, so it never appears for someone who doesn't record one.
function renderEditSessionInstrumentBlock() {
  const list = instrumentList();
  if (!list.length) return '';
  const sess = activeSession();
  if (!sess) return '';

  const current = String(state.editForm.instrumentId || '');
  let opts = `<option value=""${current ? '' : ' selected'}>Whichever I'm using now</option>`;
  opts += list.map(inst =>
    `<option value="${escapeHTML(inst.id)}"${inst.id === current ? ' selected' : ''}>${escapeHTML(instrumentDisplayName(inst))}</option>`
  ).join('');

  // A job stamped with an instrument that has since been deleted keeps its
  // frozen snapshot. Offer it as a selectable option so simply saving the screen
  // can't silently discard the record.
  if (current && !findInstrument(current)) {
    const snap = sess.instrumentSnapshot;
    const label = snap ? instrumentDisplayName(snap) : 'Previous instrument';
    opts += `<option value="${escapeHTML(current)}" selected>${escapeHTML(label)} (removed)</option>`;
  }

  return `
    <label class="label">Test instrument</label>
    <select class="input" id="ef-instrument" data-change-action="ef-instrument">${opts}</select>
    <p class="muted" style="margin:6px 0 0;font-size:12px">Recorded on this job, so its certificate always names the tester you actually used — even after you recalibrate or change instrument.</p>
  `;
}
