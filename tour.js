// tour.js — V134 tutorials: the practice job (V134.1: photos, presets, a still
// screen, a clean finish and free practice). V135: the Settings tutorials.
// V136: your jobs & the cloud — the Jobs list, the "In the cloud" tab, Sync.
// (c) 2026 Peter Birchley. All rights reserved.
//
// The practice job walks a new engineer through a job on the REAL screens:
// the Jobs list, the New job form, the testing screen, the fail sheet, the
// preset sheet and the Overview are drawn by the app's own render functions
// (renderSessions, renderEntry, renderOverview), so what they practise on is
// the screen they will use — identical by construction, never a hand-made copy
// that drifts (Peter, V134 2A: "it has to be identical to our current testing
// screen"). A blue box glides from control to control (3B); a card at the far
// end says what to look at or what to tap (4A). After the last step the
// engineer can carry on alone in free practice (V134.1 4A).
//
// ⚠ HOW THE PRACTICE STAYS APART FROM REAL WORK. Those render functions read
// the global `state`. _tutDraw() swaps the practice's own state into `state`,
// calls the render function, and puts every real value back in a `finally` —
// all in one synchronous run, so no timer, sync, save or tap can run in
// between and see the practice (JavaScript runs one thing at a time). While
// swapped, storage writes are refused (counted in _tutRefused), so even a
// render function that records something can't write it to the phone. The
// practice's own taps never reach the app's actions: in the practice markup
// every data-action becomes data-tut-action, and during the guided steps the
// only control that can be touched is the highlighted one (.tut-live;
// everything else has no pointer events). Logging in the practice is done
// here, on the practice state only — never by the real saveItem(), which
// saves, syncs, learns and stamps photos. Nothing from the practice is kept: no
// job, no item, no client, no learning, no photo, no certificate number (the
// sample certificate is built without stamping).
//
// V135: the same engine runs five SETTINGS tutorials (TUTORIALS below) on the
// real Settings pages — renderSettingsHub, renderSettingsUser, the instrument
// editor, Company & Branding, Certificate Content, Quick Pick Items, Backup &
// Restore — drawn from a practice that starts as a new phone (4A). There is
// no typing: tapping a box fills in an example (4A); the logo and signature
// pickers open for real and the picture stays in the practice (5A); Backup &
// Restore is look-only — a practice backup file could one day be restored by
// mistake over real work (6A). Every Save is the practice's: it never calls
// the page's real save handler (those write storage and sync — R37). Each one
// ends on what the change does — the testing screen's new buttons, or the
// sample certificate (7A) — then Finish or the next tutorial (8A).
//
// The old five picture slides (V42) are retired (7A); `openTour()` and
// state.tourOpen / state.tourStep keep their names — setup, the update's safe
// moment (boot.js) and the plan prompt (plan.js) all ask "is the tutorial open?"

// ---------- the practice state ----------

// A new phone's state, taken when this file loads — before boot's load() puts
// this phone's data in. The practice starts from it every time, so every
// engineer sees the same screens with the app's starting settings (Smart Quick
// Pick, readings, Undo, Multi Pick and map pins all off). The VALUES are
// copied, never shared.
const TUT_FRESH = (() => { try { return JSON.stringify(state); } catch (e) { return '{}'; } })();

// Taken from THIS phone instead: who you are and how your certificate looks, so
// the sample certificate is your own (rule 7: the instrument comes from the
// list, not the mirror — both are copied so either reads the same).
const TUT_FROM_PHONE = ['engineer', 'reportSettings', 'instruments', 'activeInstrumentId',
  'testerMake', 'testerModel', 'testerSerial', 'calDate', 'calCertNo', 'calDue'];

const TUT_CLIENT = 'Practice Ltd';
const TUT_SITE = 'Head Office';
const TUT_LOCATION = 'Office';

// V134.1 (2A): three example presets, so holding the item buttons has something
// to switch to. Office is the app's starting list (the steps tap Monitor and
// Lead on it). The ids say what they are; none ever reaches the phone's presets.
const TUT_PRESETS = [
  { id: 'tutorial-office', name: 'Office', items: null },   // null → DEFAULT_ITEM_TYPES
  { id: 'tutorial-kitchen', name: 'Kitchen', items: ['Kettle', 'Toaster', 'Microwave', 'Fridge', 'Dishwasher', 'Coffee Machine', 'Mixer', 'Extension', 'Lead'] },
  { id: 'tutorial-workshop', name: 'Workshop', items: ['Drill', 'Grinder', 'Saw', 'Sander', 'Charger', 'Heater', 'Fan', 'Extension', 'Lead'] }
];

// The box's glide, and the pause after a log before it moves on (so the
// button's flash is seen inside the box). The glide matches styles.css #tut-ring.
const TUT_GLIDE_MS = 350;
const TUT_PAUSE_MS = 650;

// _tut while open: { id, st, from, cert, certNodes, said, sheet, screen, free, photoUrls }
let _tut = null;
let _tutRefused = 0;      // storage writes refused during a practice draw (harness reads it)
let _tutScrolling = 0;    // a smooth scroll in flight — the ring is already heading there
let _tutTimer = null;     // the short pause after a log, so the flash is seen

function _tutCopy(v) { return (v === undefined) ? undefined : JSON.parse(JSON.stringify(v)); }

function _tutNewState() {
  let st;
  try { st = JSON.parse(TUT_FRESH); } catch (e) { st = {}; }
  TUT_FROM_PHONE.forEach((k) => { if (k in state) st[k] = _tutCopy(state[k]); });
  // The practice always offers the certificate, whatever this phone's switch
  // says — making one is the last thing a job does. Only the practice's copy.
  st.reportSettings = Object.assign({}, st.reportSettings || {}, { enabled: true });
  st.itemPresets = TUT_PRESETS.map((p) => ({ id: p.id, name: p.name, items: (p.items || DEFAULT_ITEM_TYPES).slice() }));
  st.activePresetId = TUT_PRESETS[0].id;
  st.itemTypes = st.itemPresets[0].items.slice();
  st.sessions = [];
  st.activeId = null;
  st.cursor = 0;
  st.view = 'sessions';
  st.welcomeSeen = true;
  st.onboardedV33Seen = true;
  st.tourOpen = false;
  st.pendingPhotos = [];
  st.newForm = Object.assign({}, st.newForm || {}, { show: false, clientId: '', site: '', name: '', prefix: '', startNo: '1', engineer: st.engineer || '' });
  return st;
}

// V135 (4A): a Settings tutorial starts as a NEW phone — blank name, no
// instruments, no company, the starting Quick Pick list — so the examples it
// fills in are the only values on the page, and every engineer sees the same.
// Nothing is copied from this phone. `init` (per tutorial) adds what that
// tutorial's result needs and isn't its subject (a company name on the sample
// certificate of the Engineer tutorial, say).
function _tutSettingsState(def) {
  let st;
  try { st = JSON.parse(TUT_FRESH); } catch (e) { st = {}; }
  st.sessions = [];
  st.activeId = null;
  st.cursor = 0;
  st.view = 'settings';
  st.settingsCategory = null;
  st.settingsSearchQuery = '';
  st.welcomeSeen = true;
  st.onboardedV33Seen = true;
  st.tourOpen = false;
  st.pendingPhotos = [];
  st.instruments = [];
  st.activeInstrumentId = '';
  st.instrumentEditorId = '';
  st.presetDialog = { mode: null, name: '', editingId: null };
  st.reportSettingsError = '';
  st.reportPreviewReturnSessionId = null;
  // A new phone's one starting preset — load() makes it on a real phone, and
  // the state taken before load() has none (found in the browser check: the
  // Quick Pick page showed an empty preset box and 'Items in ""').
  st.itemPresets = [{ id: 'tutorial-default', name: 'Default', items: DEFAULT_ITEM_TYPES.slice() }];
  st.activePresetId = 'tutorial-default';
  st.itemTypes = DEFAULT_ITEM_TYPES.slice();
  if (def && typeof def.init === 'function') def.init(st);
  return st;
}

function _tutBlank(from, id) {
  const def = _tutDef(id);
  const st = (def && def.cloud) ? _tutCloudState(def)   // V136
    : ((def && def.settings) ? _tutSettingsState(def) : _tutNewState());
  return { id: def ? def.id : 'practice', st, from: from || 'sessions', cert: null, certNodes: null, said: null, sheet: '', screen: '', free: false, photoUrls: [],
    sync: (def && def.cloud) ? _tutSyncBlank() : null, held: [] };
}

// Where storage writes are refused: the object that really holds setItem — the
// page's Storage prototype on a phone (assigning to localStorage itself would
// STORE an item called "setItem"), the stand-in's own methods in the harness.
function _tutStorageHolder() {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return null;
    if (Object.prototype.hasOwnProperty.call(localStorage, 'setItem')) return localStorage;
    return Object.getPrototypeOf(localStorage);
  } catch (e) { return null; }
}

// Run fn with the practice's state in place of this phone's. Synchronous only.
function _tutDraw(fn) {
  if (!_tut) return '';
  const real = {};
  const realKeys = Object.keys(state);
  realKeys.forEach((k) => { real[k] = state[k]; });
  const holder = _tutStorageHolder();
  const kept = holder ? { setItem: holder.setItem, removeItem: holder.removeItem, clear: holder.clear } : null;
  if (holder) {
    holder.setItem = function () { _tutRefused++; };
    holder.removeItem = function () { _tutRefused++; };
    holder.clear = function () { _tutRefused++; };
  }
  let out;
  // V136: the cloud tutorials' stand-ins for what the phone's own sync records
  // say (TUT_CLOUD_STUBS). [name, was it there, the real one].
  const swapped = [];
  try {
    const stubs = _tutStubs();
    if (stubs) {
      Object.keys(stubs).forEach((n) => {
        swapped.push([n, Object.prototype.hasOwnProperty.call(globalThis, n), globalThis[n]]);
        globalThis[n] = stubs[n];
      });
    }
    realKeys.forEach((k) => { if (!(k in _tut.st)) delete state[k]; });
    Object.keys(_tut.st).forEach((k) => { state[k] = _tut.st[k]; });
    out = fn();
  } finally {
    // Put back even when the render throws (72c) — a half-drawn practice
    // screen must never leave the practice's data standing in for real work.
    // Whatever the render changed belongs to the practice — keep it there.
    Object.keys(state).forEach((k) => { _tut.st[k] = state[k]; });
    Object.keys(state).forEach((k) => { if (!(k in real)) delete state[k]; });
    realKeys.forEach((k) => { state[k] = real[k]; });
    if (holder && kept) {
      holder.setItem = kept.setItem;
      holder.removeItem = kept.removeItem;
      holder.clear = kept.clear;
    }
    swapped.forEach(([n, had, fn]) => { if (had) globalThis[n] = fn; else delete globalThis[n]; });
  }
  return out;
}

// The real screen's markup, made touch-proof for the practice: no control can
// reach the app's actions, no box can take the keyboard, and the screen's own
// title is not the page's title (the card's words are — rule 61a).
function _tutInert(html) {
  return String(html || '')
    .replace(/\sdata-action="/g, ' data-tut-action="')
    .replace(/\sdata-input-action="/g, ' data-tut-input="')
    .replace(/\sdata-change-action="/g, ' data-tut-change="')
    .replace(/\sid="screen-title"/g, ' id="tut-screen-title"')
    // V135: Backup & Restore's snapshot list is painted in later, by id, from
    // the phone's own database (snapshots.js) — with live Restore buttons. The
    // practice's copy of the box has another id, so nothing is painted into it.
    .replace(/\sid="snapshots-block"/g, ' id="tut-snapshots-block"')
    .replace(/\sautofocus\b/g, '')
    .replace(/<(input|textarea|select)\b/g, '<$1 readonly tabindex="-1"')
    .replace(/<button\b/g, '<button tabindex="-1"');
}

// V135: the Settings screens a tutorial can show, each drawn by its own real
// render function (render-core.js routes the same views to the same functions).
const TUT_SETTINGS_VIEWS = {
  settings: () => renderSettingsHub(),
  settingsCategory: () => renderSettingsCategory(),
  settingsUser: () => renderSettingsUser(),
  settingsInstrument: () => renderSettingsInstrument(),
  settingsItems: () => renderSettingsItems(),
  settingsReport: () => renderSettingsReport(),
  settingsReportContent: () => renderSettingsReportContent(),
  settingsBackup: () => renderSettingsBackup(),
  cloudSync: () => renderCloudSync()   // V136
};

// One screen of the practice, drawn by the app's own render function.
function _tutScreenHTML() {
  return _tutDraw(() => {
    const v = state.view;
    if (v === 'entry') return renderEntry();
    if (v === 'overview') return renderOverview();
    if (Object.prototype.hasOwnProperty.call(TUT_SETTINGS_VIEWS, v)) return TUT_SETTINGS_VIEWS[v]();
    return renderSessions();
  });
}

// ---------- the practice's own actions (practice state only) ----------

function _tutSession() { return _tut ? (_tut.st.sessions || [])[0] : null; }

function _tutOpenForm() {
  const nf = _tut.st.newForm;
  nf.show = true;
  nf.clientId = TUT_CLIENT;
  nf.site = TUT_SITE;
  nf.engineer = _tut.st.engineer || '';
}

// The job createSession() would make from that form (session.js) — same shape,
// so every screen reads it as a real job. Its id says what it is.
function _tutStartJob() {
  const st = _tut.st;
  const now = new Date().toISOString();
  const s = {
    id: 'tutorial-' + newId(),
    name: 'Job 1',
    site: composeSiteSnapshot(TUT_CLIENT, TUT_SITE),
    clientId: '', siteId: '',
    engineer: String(st.engineer || '').trim(),
    prefix: '',
    date: todayISO(),
    startNumber: 1,
    startPad: 0,
    instrumentId: st.activeInstrumentId || '',
    items: [],
    locked: false,
    notes: '',
    certNo: '',
    userId: null,
    lastModified: now,
    syncedAt: null
  };
  st.sessions = [s];
  st.activeId = s.id;
  st.cursor = 0;
  st.view = 'entry';
  st.newForm = Object.assign({}, st.newForm, { show: false, clientId: '', site: '' });
  _tutDraw(() => loadFormForCursor());
}

function _tutTypeLocation() { _tut.st.form.location = TUT_LOCATION; }
function _tutPick(type) { _tut.st.form.itemType = type; }

// Log the form as saveItem() would (session.js): a new item at the end, or —
// free practice, after Prev — the item on screen overwritten, keeping its id
// and first-logged time; then the cursor moves on and the form is rebuilt.
// Nothing else (no save, no sync, no learning, no photo store).
function _tutLog(result, typeOverride) {
  _tutDropPhotos();   // ⚠ BEFORE loadFormForCursor — see _tutDropPhotos
  _tutDraw(() => {
    const sess = activeSession();
    if (!sess) return;
    const item = {
      assetNo: String(state.form.assetNo || '').trim() || nextAssetNo(sess),
      location: normaliseLocation(state.form.location),
      itemType: typeOverride || normaliseItemType(state.form.itemType),
      notes: String(state.form.notes || '').trim(),
      result
    };
    if (state.cursor < sess.items.length) {
      sess.items[state.cursor] = Object.assign({}, sess.items[state.cursor], item);
      state.cursor += 1;
    } else {
      sess.items.push(Object.assign({ id: 'tutorial-' + newId() }, item, { ts: new Date().toISOString() }));
      state.cursor = sess.items.length;
    }
    loadFormForCursor();
  });
}

function _tutCopyLast() {
  const sess = _tutSession();
  const last = sess && sess.items[sess.items.length - 1];
  if (!last) return;
  _tut.st.form.notes = '';
  _tutLog(last.result, last.itemType);
}

function _tutOpenFail() {
  _tut.st.failModalOpen = true;
  _tut.st.failModalStage = 'reasons';
}

function _tutFailReason(reason) {
  const f = _tut.st.form;
  f.notes = f.notes ? f.notes + ' — ' + reason : reason;
  _tut.st.failModalOpen = false;
  _tutLog('fail');
}

function _tutGoOverview() { _tut.st.view = 'overview'; }

// ---------- practice photos (V134.1 1A) ----------
// Add photo opens the phone's camera / library as the real one does, from a
// file box of the practice's own (on <body>, so a redraw while the camera is
// open can't lose it). The picture is shown from an object URL in the fail
// sheet — the real strip, drawn from the practice's pendingPhotos — and is
// never stored: the URLs are kept in _tut.photoUrls and let go at the end.
function _tutPhotoPick() { _tutPickImage('photo'); }

// V135 (5A): the same file box serves the logo and the signature on Company &
// Branding — PNG or JPEG, as the real pickers take. Whatever is chosen goes to
// the practice only (_tutAddPhoto / _tutAddPicture).
function _tutPickImage(kind) {
  if (!_tut || typeof document === 'undefined') return;
  let inp = document.getElementById('tut-photo-file');
  if (!inp) {
    inp = document.createElement('input');
    inp.type = 'file';
    inp.id = 'tut-photo-file';
    inp.style.display = 'none';
    inp.setAttribute('aria-hidden', 'true');
    document.body.appendChild(inp);
  }
  inp.accept = (kind === 'photo') ? 'image/*' : 'image/png,image/jpeg';
  inp.value = '';
  inp.onchange = () => {
    const f = inp.files && inp.files[0];
    if (!f || !_tut || !state.tourOpen) return;
    if (kind === 'photo') _tutAddPhoto(f); else _tutAddPicture(kind, f);
  };
  inp.click();
}

// The guided step that asked for this picture moves on once it is in.
function _tutPicked(kind) {
  const s = _tutSteps()[state.tourStep];
  const wants = s ? (s.pick || (s.key === 'photo' ? 'photo' : '')) : '';
  if (!_tut.free && wants === kind && !_tutTimer) {
    _tutTimer = setTimeout(() => { _tutTimer = null; _tutAdvance(); }, TUT_PAUSE_MS);
  }
}

// V135 (5A): a logo or signature for the practice — scaled down and turned into
// a PNG data URL exactly as the real pickers do (settings-actions.js
// handleReportLogoFile, storeSignatureFromSource), because the sample
// certificate's PDF code needs a data URL, not a link. It lives only in the
// practice's reportSettings — gone with the practice; never saved.
function _tutAddPicture(kind, file) {
  if (!/^image\/(png|jpeg)$/.test(file.type || '')) {
    if (typeof showToast === 'function') showToast('Please choose a PNG or JPEG image.');
    return;
  }
  const maxPx = (kind === 'signature')
    ? ((typeof REPORT_SIGNATURE_MAX_PX === 'number') ? REPORT_SIGNATURE_MAX_PX : 400)
    : ((typeof REPORT_LOGO_MAX_PX === 'number') ? REPORT_LOGO_MAX_PX : 600);
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      if (!_tut || !state.tourOpen) return;
      try {
        let { width, height } = img;
        if (width > maxPx || height > maxPx) {
          const scale = maxPx / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        _tut.st.reportSettings[kind] = canvas.toDataURL('image/png');
      } catch (err) { if (typeof showToast === 'function') showToast('Could not use that picture.'); return; }
      render();
      _tutPicked(kind);
    };
    img.onerror = () => { if (typeof showToast === 'function') showToast('Could not read that picture.'); };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function _tutAddPhoto(file) {
  let url = '';
  try { url = URL.createObjectURL(file); } catch (e) { return; }
  _tut.photoUrls.push(url);
  const st = _tut.st;
  const cap = (typeof PHOTO_MAX_PER_ITEM === 'number') ? PHOTO_MAX_PER_ITEM : 3;
  if ((st.pendingPhotos || []).length >= cap) return;
  st.pendingPhotos = (st.pendingPhotos || []).concat([{ url, tutorial: true }]);
  render();
  // The guided photo step moves on once the photo is in, after a moment.
  _tutPicked('photo');
}

// ⚠ Empty the practice's staged photos BEFORE anything calls loadFormForCursor:
// it runs discardPendingPhotos(), which — when there are staged photos — calls
// photos.js photoReleaseObjectUrls(), and that lets go of the PHONE's own photo
// previews, not just the practice's. With nothing staged it returns early.
function _tutDropPhotos() {
  if (_tut && _tut.st) _tut.st.pendingPhotos = [];
}

function _tutLetGoPhotos(t) {
  (t && t.photoUrls || []).forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) {} });
  const inp = (typeof document !== 'undefined') ? document.getElementById('tut-photo-file') : null;
  if (inp && inp.parentNode) inp.parentNode.removeChild(inp);
}

// ---------- practice presets (V134.1 2A) ----------
function _tutOpenPresets() { _tut.st.presetSheetOpen = true; }

// switchPreset() (session.js) on the practice: the buttons follow the preset.
function _tutSwitchPreset(id) {
  const st = _tut.st;
  st.presetSheetOpen = false;
  const p = (st.itemPresets || []).find((x) => x.id === id);
  if (!p) return;
  st.activePresetId = id;
  st.itemTypes = p.items.slice();
}

// The sample certificate: the real certificate code, the practice job, this
// phone's company and branding. buildReportDoc is synchronous (report.js) and
// runs inside _tutDraw; stampCertNumber is never called, so no number is used.
function _tutMakeCert() {
  _tut.cert = 'making';
  const done = (nodes, err) => {
    if (!_tut) return;
    _tut.cert = err ? 'failed' : 'ready';
    _tut.certNodes = nodes || null;
    if (state.tourOpen) render();
  };
  const engine = (typeof loadReportEngine === 'function') ? loadReportEngine() : Promise.reject(new Error('no report engine'));
  engine.then(() => {
    const sess = _tutSession();
    const doc = _tutDraw(() => buildReportDoc(activeSession(), _emptyPhotoData(sess && sess.id)));
    const blob = doc.output('blob');
    return ((typeof loadPdfJsEngine === 'function') ? loadPdfJsEngine() : Promise.reject(new Error('no PDF viewer')))
      .then(() => {
        const box = document.createElement('div');
        box.className = 'tut-cert-pages';
        return renderPdfPagesToContainer(blob, box).then(() => box);
      });
  }).then((box) => done(box, null), (e) => { console.error('Sample certificate failed (non-fatal).', e); done(null, e); });
}

// ---------- the steps (5A) ----------
// Each: the words; `target` — a selector inside the practice screen (none =
// no box at all); `go` — a "do" step (4A): only the target works and Skip does
// it; `run` — what the tap or Skip does; `tap` — a tap that differs from Skip
// (the camera opens; the step moves on when a photo arrives); `hold` — the
// target takes a press-and-hold, not a tap; `pause` — wait a moment after a
// log so the flash is seen before the box moves on; `when` — a step that shows
// only if its target is on the screen (a phone that can't take photos has no
// photo row).
const TUT_STEPS = [
  { key: 'jobs', target: '#new-session-btn', go: true,
    text: 'This is your Jobs list. Each visit to a client or site is a job. Tap <strong>+ New job</strong>.',
    run: () => _tutOpenForm() },
  { key: 'form', target: '#nf-client-wrap',
    text: 'A job needs a client, a site or both — we’ve filled them in for you. Everything below them is optional.' },
  { key: 'start', target: '#nf-submit', go: true,
    text: 'Tap <strong>Start</strong> to begin testing.',
    run: () => _tutStartJob() },
  { key: 'screen', target: '.progress-row',
    text: 'This is the testing screen. You log one item at a time, and this line shows which item you’re on.' },
  { key: 'asset', target: '#f-asset',
    text: 'The asset number on the item’s label. It goes up by one after every item — or scan the label with a barcode scanner.',
    run: () => _tutTypeLocation() },
  { key: 'location', target: '.location-input-wrap',
    text: 'Type where you are once. It stays for the next item until you change it — we’ve typed <strong>Office</strong>.' },
  { key: 'pick', target: '.quick-btn[data-type="Monitor"]', go: true,
    text: 'Choose what the item is. Tap <strong>Monitor</strong>.',
    run: () => _tutPick('Monitor') },
  { key: 'pass', target: '#pass-btn', go: true, pause: true, flash: ['pass', 'pass-btn'],
    text: 'It passed. Tap <strong>PASS</strong> — the item is saved and the screen is ready for the next one.',
    run: () => _tutLog('pass') },
  { key: 'copy', target: '#copy-last-btn', go: true, pause: true, flash: ['copy', 'copy-last-btn'],
    text: 'Another monitor that passed? Tap <strong>Copy last result</strong> and it’s logged in one tap.',
    run: () => _tutCopyLast() },
  { key: 'pick-fail', target: '.quick-btn[data-type="Lead"]', go: true,
    text: 'Now a lead. Tap <strong>Lead</strong>.',
    run: () => _tutPick('Lead') },
  { key: 'fail', target: '#fail-btn', go: true,
    text: 'This one failed. Tap <strong>FAIL</strong>.',
    run: () => _tutOpenFail() },
  { key: 'photo', target: '#fail-photo-pick-btn', when: true, go: true,
    tap: () => _tutPhotoPick(),
    text: 'You can photograph the damage. Tap <strong>Add photo</strong> to try it — the photo stays in the practice and is thrown away at the end. Or Skip.' },
  { key: 'reason', target: '.fail-reason-btn[data-reason="Damaged Plug"]', go: true, pause: true, flash: ['fail', ''],
    text: 'Say why it failed. Tap <strong>Damaged Plug</strong>.',
    run: () => _tutFailReason('Damaged Plug') },
  { key: 'presets', target: '#quick-grid', go: true, hold: true,
    text: 'Working somewhere else? Switch to another set of items — a preset. <strong>Press and hold</strong> the item buttons for a second.',
    run: () => _tutOpenPresets() },
  { key: 'preset-pick', target: '.preset-switch-option[data-arg="tutorial-kitchen"]', go: true,
    text: 'These are your presets. Tap <strong>Kitchen</strong>.',
    run: () => _tutSwitchPreset('tutorial-kitchen') },
  { key: 'preset-done', target: '#quick-grid',
    text: 'The buttons are now the kitchen items. You make your own presets in Settings → Quick Pick Items.' },
  { key: 'overview', target: '#overview-btn', go: true,
    text: 'Tap the <strong>Overview</strong> button to see the whole job.',
    run: () => _tutGoOverview() },
  { key: 'list', target: '.table-wrap',
    text: 'Every item in the job, fails picked out in red. Tap any item to go back and change it.' },
  { key: 'report', target: '#produce-report-btn', go: true,
    text: 'Job done? Make the certificate. Tap the <strong>report</strong> button.',
    run: () => _tutMakeCert() },
  { key: 'cert', target: '.tut-cert', cert: true,
    text: () => (_tut && _tut.cert === 'failed')
      ? 'The sample certificate couldn’t be drawn just now — it needs the report files, which come down the first time the app is online. Your real certificates aren’t affected.'
      : 'Your certificate, with your company details. On a real job you share or save it from here. This is only a sample — no certificate number was used.' },
  { key: 'done', target: '',
    text: 'That’s the practice job — nothing from it was saved. Have a go on your own in <strong>free practice</strong>, or finish. It’s in Settings → Help → Tutorials any time.' }
];

// ---------- V135: the Settings tutorials ----------
// The practice's own versions of what each page's controls do — on the
// practice state only. A Save here is never the page's real save handler.

// Settings hub → a group. A group with one page opens that page straight away,
// as the real hub does (settings-actions.js settingsOpenCategory).
function _tutOpenGroup(id) {
  const st = _tut.st;
  const cat = SETTINGS_CATEGORIES.find((c) => c.id === id);
  const pages = (cat && typeof settingsCategoryPages === 'function') ? _tutDraw(() => settingsCategoryPages(cat)) : [];
  if (pages && pages.length === 1) { st.settingsCategory = null; st.view = pages[0]; return; }
  st.settingsCategory = id;
  st.view = 'settingsCategory';
}
function _tutOpenPage(id) { _tut.st.view = id; }

function _tutIsoDay(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Engineer & Tester
function _tutAddInstrument() {
  const st = _tut.st;
  const inst = makeInstrument({ id: 'tutorial-' + newId() });
  st.instruments = (st.instruments || []).concat([inst]);
  if (!st.activeInstrumentId) st.activeInstrumentId = inst.id;
  st.instrumentEditorId = inst.id;
  st.view = 'settingsInstrument';
}
function _tutInstrument() {
  const st = _tut.st;
  return (st.instruments || []).find((x) => x.id === st.instrumentEditorId) || (st.instruments || [])[0] || null;
}
function _tutFillInstrument() {
  const inst = _tutInstrument();
  if (inst) { inst.make = 'Seaward'; inst.model = 'PrimeTest 250+'; }
}
function _tutFillCalibration() {
  const inst = _tutInstrument();
  if (!inst) return;
  inst.calDate = _tutIsoDay(-30);
  inst.calDue = _tutIsoDay(335);
  inst.calCertNo = 'CAL-' + new Date().getFullYear() + '-0142';
}
function _tutCloseInstrument() {
  _tut.st.instrumentEditorId = '';
  _tut.st.view = 'settingsUser';
}

// Company & Branding / Certificate Content
function _tutRs() { return _tut.st.reportSettings; }
function _tutTheme(id) {
  const t = (typeof REPORT_COLOR_THEMES !== 'undefined' ? REPORT_COLOR_THEMES : []).find((x) => x.id === id);
  if (t) { _tutRs().headerColor = t.header; _tutRs().accentColor = t.accent; }
}
// What the page's "Next certificate will look like" line shows (render-settings.js).
function _tutCertPreview() {
  const rs = _tutRs();
  const year = String(new Date().getFullYear());
  const prefix = String(rs.certPrefix || '').replace(/\{year\}/gi, year);
  const pad = Number.isFinite(rs.certPadding) ? rs.certPadding : 4;
  const n = Number.isFinite(rs.certNextNumber) ? rs.certNextNumber : 1;
  return prefix + String(n).padStart(pad, '0');
}

// A small finished job — two passes and a fail — for the sample certificate,
// made the practice job's way (_tutStartJob). The screen stays where it was:
// the certificate slides up over the page that was just saved. The number is
// only the practice's — the phone's counter is never touched (stampCertNumber
// is never called).
function _tutSampleJob() {
  const st = _tut.st;
  const view = st.view;
  _tutStartJob();
  const sess = _tutSession();
  const ts = new Date().toISOString();
  [['1', 'Monitor', 'pass', ''], ['2', 'Kettle', 'pass', ''], ['3', 'Lead', 'fail', 'Damaged Plug']].forEach(([a, type, result, notes]) => {
    sess.items.push({ id: 'tutorial-' + newId(), assetNo: a, location: TUT_LOCATION, itemType: type, notes, result, ts });
  });
  if (st.reportSettings && st.reportSettings.certEnabled) sess.certNo = _tutCertPreview();
  st.view = view;
}
function _tutSaveToCert() { _tutSampleJob(); _tutMakeCert(); }

// Quick Pick Items — the practice's createPreset (session.js), unsaved.
function _tutNewPreset() { _tut.st.presetDialog = { mode: 'new', name: '', editingId: null }; }
function _tutCreatePreset() {
  const st = _tut.st;
  const name = String(st.presetDialog.name || '').trim() || 'Kitchen';
  const p = { id: 'tutorial-' + newId(), name, items: DEFAULT_ITEM_TYPES.slice() };
  st.itemPresets = (st.itemPresets || []).concat([p]);
  st.activePresetId = p.id;
  st.itemTypes = p.items.slice();
  st.presetDialog = { mode: null, name: '', editingId: null };
}
function _tutFillItems() {
  const st = _tut.st;
  const p = (st.itemPresets || []).find((x) => x.id === st.activePresetId);
  if (!p) return;
  p.items = TUT_PRESETS[1].items.slice();   // the Kitchen list
  st.itemTypes = p.items.slice();
}

const TUT_CERT_FAILED = 'The sample certificate couldn’t be drawn just now — it needs the report files, which come down the first time the app is online. Your real certificates aren’t affected.';
function _tutCertSays(ok) { return () => (_tut && _tut.cert === 'failed') ? TUT_CERT_FAILED : ok; }

// Each starts on the real Settings list (3A): the box goes to the group, then
// the page. Targets are simple selectors on the practice markup (data-action
// is data-tut-action there). `box: 'row'` / `'section'` puts the box round the
// target's toggle row or page section instead (a tap anywhere in it counts);
// `pick` — a step that moves on when that picture arrives (5A).
const TUT_STEPS_ENGINEER = [
  { key: 'group', target: '.settings-row[data-arg="catUser"]', go: true,
    text: 'This is Settings. Your name and your PAT testers are under <strong>Engineer &amp; Tester</strong>. Tap it.',
    run: () => _tutOpenGroup('catUser') },
  { key: 'name', target: '#settings-engineer', go: true, pause: true,
    text: 'Your name goes on every new job and certificate. Tap the box — we’ll type an example.',
    run: () => { _tut.st.engineer = 'Alex Smith'; } },
  { key: 'add', target: '[data-tut-action="instrument-add"]', go: true,
    text: 'Now your PAT tester. Tap <strong>+ Add instrument</strong>.',
    run: () => _tutAddInstrument() },
  { key: 'make', target: '#inst-make', go: true, pause: true,
    text: 'The make and model, as on its label. Tap the box — we’ll fill in an example.',
    run: () => _tutFillInstrument() },
  { key: 'calibration', target: '#inst-cal-cert', go: true, pause: true,
    text: 'From the tester’s calibration certificate: the date, the certificate number and when it’s next due. Tap the box to fill them in.',
    run: () => _tutFillCalibration() },
  { key: 'inst-save', target: '[data-tut-action="instrument-save"]', go: true,
    text: 'Tap <strong>Save</strong>.',
    run: () => _tutCloseInstrument() },
  { key: 'in-use', target: '.instrument-card',
    text: 'Your tester, marked <strong>In use</strong> — it’s recorded against every new job. PATGo warns you when its calibration is nearly due. Got more than one? Add them all and pick the one you’re using.' },
  { key: 'save', target: '#settings-user-save', go: true,
    text: 'Tap <strong>Save</strong>.',
    run: () => _tutSaveToCert() },
  { key: 'cert', target: '.tut-cert', cert: true,
    text: _tutCertSays('Your name, your tester and its calibration, on the certificate. This is only a sample — nothing was saved.') },
  { key: 'done', target: '',
    text: 'That’s Engineer &amp; Tester. To set yours for real: Settings → Engineer &amp; Tester. Next up: your company and logo.' }
];

const TUT_STEPS_BRANDING = [
  { key: 'group', target: '.settings-row[data-arg="catReports"]', go: true,
    text: 'This is Settings. How your certificate looks is under <strong>Reports &amp; Exports</strong>. Tap it.',
    run: () => _tutOpenGroup('catReports') },
  { key: 'page', target: '.settings-row[data-page="settingsReport"]', go: true,
    text: 'Tap <strong>Company &amp; Branding</strong>.',
    run: () => _tutOpenPage('settingsReport') },
  { key: 'enable', target: '#report-enabled', box: 'row', go: true, pause: true,
    text: 'Certificates are off on a new phone, so nobody makes one before it’s set up. Tap <strong>Enable reports</strong> to switch them on.',
    run: () => { _tutRs().enabled = true; } },
  { key: 'company', target: '#report-company-name', go: true, pause: true,
    text: 'Your company name and address go at the top of every certificate. Tap the box — we’ll fill in an example.',
    run: () => { _tutRs().companyName = 'Practice PAT Services'; _tutRs().companyAddress = '1 High Street\nAnytown\nAB1 2CD'; } },
  { key: 'logo', target: '#report-logo-pick-btn', go: true, pick: 'logo',
    tap: () => _tutPickImage('logo'),
    text: 'Add your logo. Tap <strong>Upload logo</strong> and choose a picture to see it on the sample — it stays in the practice. Or Skip.' },
  { key: 'colours', target: '.report-theme-chip[data-arg="navy"]', go: true, pause: true,
    text: 'The colour of the certificate’s headings. Tap <strong>Navy</strong>.',
    run: () => _tutTheme('navy') },
  { key: 'signature', target: '[data-tut-action="signature-upload"]', go: true, pick: 'signature',
    tap: () => _tutPickImage('signature'),
    text: 'Your signature prints on the declaration. On the real page you can draw it with your finger, or upload a picture. Tap <strong>Upload image</strong> to try one — or Skip.' },
  { key: 'save', target: '#settings-report-save', go: true,
    text: 'Tap <strong>Save</strong>.',
    run: () => _tutSaveToCert() },
  { key: 'cert', target: '.tut-cert', cert: true,
    text: _tutCertSays('Your company, logo, colours and signature on the certificate. This is only a sample — nothing was saved.') },
  { key: 'done', target: '',
    text: 'That’s Company &amp; Branding. To set yours for real: Settings → Reports &amp; Exports → Company &amp; Branding. Next up: what the certificate includes.' }
];

const TUT_STEPS_CONTENT = [
  { key: 'group', target: '.settings-row[data-arg="catReports"]', go: true,
    text: 'This is Settings. What goes on the certificate is under <strong>Reports &amp; Exports</strong>. Tap it.',
    run: () => _tutOpenGroup('catReports') },
  { key: 'page', target: '.settings-row[data-page="settingsReportContent"]', go: true,
    text: 'Tap <strong>Certificate Content</strong>.',
    run: () => _tutOpenPage('settingsReportContent') },
  { key: 'include', target: '#report-show-engineer', box: 'row',
    text: 'Each switch here puts a part of the certificate on or off — your name, the tester, calibration, the failed items, photos, remedial actions and more.' },
  { key: 'declaration', target: '#report-declaration-text',
    text: 'The declaration printed above the signature line. Change it to your own wording if you like.' },
  { key: 'numbers', target: '#report-cert-enabled', box: 'row', go: true, pause: true,
    text: 'Want each certificate numbered? Tap <strong>Use certificate numbers</strong>.',
    run: () => { _tutRs().certEnabled = true; } },
  { key: 'prefix', target: '#report-cert-prefix', go: true, pause: true,
    text: 'The number starts with your prefix. Tap the box — we’ll use one with the year in it.',
    run: () => { _tutRs().certPrefix = 'PAT-{year}-'; } },
  { key: 'preview', target: '#report-cert-prefix', box: 'section',
    text: 'Then a counter that goes up by one for each job. The line at the bottom shows what your next number will be.' },
  { key: 'save', target: '#settings-report-save', go: true,
    text: 'Tap <strong>Save</strong>.',
    run: () => _tutSaveToCert() },
  { key: 'cert', target: '.tut-cert', cert: true,
    text: _tutCertSays('The certificate with its number. A real number is only used when you make a real certificate — this sample used none.') },
  { key: 'done', target: '',
    text: 'That’s Certificate Content. To set yours for real: Settings → Reports &amp; Exports → Certificate Content. Next up: your Quick Pick buttons.' }
];

const TUT_STEPS_ITEMS = [
  { key: 'group', target: '.settings-row[data-arg="catTesting"]', go: true,
    text: 'This is Settings. The item buttons on the testing screen are under <strong>Logging</strong>. Tap it.',
    run: () => _tutOpenGroup('catTesting') },
  { key: 'page', target: '.settings-row[data-page="settingsItems"]', go: true,
    text: 'Tap <strong>Quick Pick Items</strong>.',
    run: () => _tutOpenPage('settingsItems') },
  { key: 'preset', target: '#settings-preset-select',
    text: 'A <strong>preset</strong> is a set of up to nine item buttons. Make one for each kind of site — office, kitchen, workshop — and switch between them on a job.' },
  { key: 'new', target: '#preset-new-btn', go: true,
    text: 'Tap <strong>+ New</strong> to make one.',
    run: () => _tutNewPreset() },
  { key: 'name', target: '#preset-dialog-input', go: true, pause: true,
    text: 'Give it a name. Tap the box — we’ll call it Kitchen.',
    run: () => { _tut.st.presetDialog.name = 'Kitchen'; } },
  { key: 'create', target: '#preset-dialog-confirm', go: true,
    text: 'Tap <strong>Create</strong>.',
    run: () => _tutCreatePreset() },
  { key: 'items', target: '#settings-types', go: true, pause: true,
    text: 'The buttons, one per line, in the order they show. Tap the box — we’ll fill in kitchen items.',
    run: () => _tutFillItems() },
  { key: 'smart', target: '#sqp-toggle', box: 'row',
    text: '<strong>Smart Quick Pick</strong> swaps in the items you most often test at each location. It’s off until you want it.' },
  { key: 'save', target: '#settings-items-save', go: true,
    text: 'Tap <strong>Save</strong>.',
    run: () => _tutStartJob() },
  { key: 'result', target: '#quick-grid',
    text: 'Your Kitchen buttons on the testing screen. On a job, press and hold the buttons to switch preset.' },
  { key: 'done', target: '',
    text: 'That’s Quick Pick Items. To make yours for real: Settings → Logging → Quick Pick Items. Next up: keeping your work safe.' }
];

// Look-only (6A): no practice backup file is ever made.
const TUT_STEPS_BACKUP = [
  { key: 'group', target: '.settings-row[data-arg="catData"]', go: true,
    text: 'This is Settings. Backups are under <strong>Data</strong>. Tap it.',
    run: () => _tutOpenGroup('catData') },
  { key: 'page', target: '.settings-row[data-page="settingsBackup"]', go: true,
    text: 'Tap <strong>Backup &amp; Restore</strong>.',
    run: () => _tutOpenPage('settingsBackup') },
  { key: 'backup', target: '#backup-export-btn',
    text: 'A backup is one file holding all your jobs and settings. On iPhone choose <strong>Save to Files</strong> and pick iCloud Drive — or email it to yourself. Make one at the end of every testing day.' },
  // V136 (1A): Export everything is taught here, with a fuller card, rather
  // than as a tutorial of its own.
  { key: 'everything', target: '#export-all-btn', when: true,
    text: '<strong>Export everything</strong> makes one zip of everything on this phone: the backup, a spreadsheet for every job, every certificate you’ve made (no new numbers used), and your photos if you tick them. Handy for keeping your records, or moving to a new phone. Jobs kept only in the cloud aren’t in it.' },
  { key: 'restore', target: '#backup-import-btn',
    text: '<strong>Restore</strong> puts a backup back — on a new phone, or if this one’s been cleared. It replaces everything on the phone, so you’re asked first.' },
  { key: 'snapshots', target: '#tut-snapshots-block', box: 'section', when: true,
    text: 'PATGo also keeps a copy on this phone each day you change something, so you can step back a day. It’s not a backup — if the phone is lost, these go with it.' },
  { key: 'done', target: '',
    text: 'That’s Backup &amp; Restore — try it for real in Settings → Data → Backup &amp; Restore. Nothing in this tutorial made a file.' }
];

// ---------- V136: your jobs & the cloud ----------
// Three tutorials on the Jobs list, the "In the cloud" tab and the Sync page
// (1A), for everyone, signed in or not (3A): the practice is a PRETEND
// signed-in phone with sample jobs on it and a few more only in the cloud
// (4A). Nothing reaches the internet and the phone's own account is never
// read or changed.
//
// ⚠ Those screens don't read everything from `state`. Whether the cloud is
// there, the Sync page's counts, the jobs waiting for an answer and the shield
// on a job card come from the PHONE's own sync records (localStorage, through
// sync.js / cloud.js / plan.js) — so the practice would show this phone's real
// numbers and real held jobs. For these three tutorials _tutDraw also swaps
// those few functions for the practice's own (TUT_CLOUD_STUBS), inside the
// same synchronous run, and puts the real ones back in its `finally`.

const TUT_ACCOUNT = 'alex@example.com';

// yyyy-mm-dd, `months` back and `days` back from today (the phone's own day).
function _tutAgo(months, days) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  if (months) d.setMonth(d.getMonth() - months);
  if (days) d.setDate(d.getDate() - days);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const TUT_SAMPLE_TYPES = ['Monitor', 'PC', 'Kettle', 'Lead', 'Extension', 'Printer', 'Laptop Charger', 'Desk Fan', 'Microwave', 'Heater'];

// `n` sample items numbered from `first`, the `fails` ones failed.
function _tutItems(first, n, fails, date) {
  const ts = date + 'T10:00:00.000Z';
  const out = [];
  for (let i = 0; i < n; i++) {
    const fail = i >= n - fails;
    out.push({ id: 'tutorial-' + newId(), assetNo: String(first + i), location: i < n / 2 ? 'Office' : 'Kitchen',
      // The type follows the asset number, so one asset is the same item every
      // year (found in the browser check: 1042's history said Kettle, then Extension).
      itemType: TUT_SAMPLE_TYPES[(first + i) % TUT_SAMPLE_TYPES.length], notes: fail ? 'Damaged Cable' : '',
      result: fail ? 'fail' : 'pass', ts });
  }
  return out;
}

// A sample job in the shape createSession() makes (as _tutStartJob).
// done: locked, with a certificate made after (it counts as done — V131).
function _tutJob(id, site, date, items, extra) {
  const at = date + 'T16:00:00.000Z';
  return Object.assign({
    id, name: '', site, clientId: '', siteId: '', engineer: 'Alex Smith', prefix: '', date,
    startNumber: 1, startPad: 0, instrumentId: '', items, locked: false, notes: '', certNo: '',
    userId: null, lastModified: at, syncedAt: null
  }, extra || {});
}
function _tutDone(certNo, date) {
  return { locked: true, lockedAt: date + 'T16:00:00.000Z', reportAt: date + 'T16:05:00.000Z', certNo };
}

// Three jobs on the phone. Asset 1042 is in two of them (the asset history);
// last year's is due for its retest this month (the retest banner); the newest
// isn't in the cloud yet (no shield — "waiting" on the Sync page).
function _tutPhoneJobs() {
  const y = (d) => d.slice(0, 4);
  const a = _tutAgo(0, 2), b = _tutAgo(0, 9), c = _tutAgo(12, 0);
  return [
    _tutJob('tutorial-job-new', 'Riverside Dental — Main Surgery', a, _tutItems(1101, 8, 1, a)),
    _tutJob('tutorial-job-office', 'Practice Ltd — Head Office', b, _tutItems(1040, 12, 1, b), _tutDone('PAT-' + y(b) + '-0057', b)),
    _tutJob('tutorial-job-last-year', 'Practice Ltd — Head Office', c, _tutItems(1038, 10, 0, c),
      Object.assign(_tutDone('PAT-' + y(c) + '-0012', c), { retestTrack: true, retestMonths: 12, retestContact: null }))
  ];
}

// Five jobs only in the cloud, newest first (as the cloud list comes), in the
// shape syncCloudList() gives the "In the cloud" tab.
function _tutCloudOnlyJobs() {
  const row = (n, site, months, items, fails, cert, photos) => {
    const date = _tutAgo(months, 0);
    return { id: 'tutorial-cloud-' + n, site, name: '', clientId: '', date, items, fails, photos: photos || 0,
      certNo: cert ? 'PAT-' + date.slice(0, 4) + '-' + cert : '', locked: !!cert };
  };
  return [
    row(1, 'Riverside Dental — Branch Surgery', 13, 18, 1, '0031'),
    row(2, 'Riverside Dental — Main Surgery', 14, 41, 2, '0024'),
    row(3, 'Oak Tree Nursery', 16, 25, 0, '0011'),
    row(4, 'Practice Ltd — Warehouse', 20, 60, 3, '0040', 4),
    row(5, 'Hilltop Café', 23, 14, 1, '')
  ];
}

// The practice phone for the three: a new phone's settings (nothing copied
// from this phone, as V135 4A), signed in to a pretend account.
function _tutCloudState(def) {
  let st;
  try { st = JSON.parse(TUT_FRESH); } catch (e) { st = {}; }
  st.sessions = _tutPhoneJobs();
  st.activeId = null;
  st.cursor = 0;
  st.view = (def && def.start) || 'sessions';
  st.settingsCategory = null;
  st.settingsSearchQuery = '';
  st.welcomeSeen = true;
  st.onboardedV33Seen = true;
  st.tourOpen = false;
  st.pendingPhotos = [];
  st.engineer = 'Alex Smith';
  st.instruments = [];
  st.activeInstrumentId = '';
  st.itemPresets = [{ id: 'tutorial-default', name: 'Default', items: DEFAULT_ITEM_TYPES.slice() }];
  st.activePresetId = 'tutorial-default';
  st.itemTypes = DEFAULT_ITEM_TYPES.slice();
  st.newForm = Object.assign({}, st.newForm || {}, { show: false, clientId: '', site: '', name: '', prefix: '', startNo: '1' });
  st.sessionsSearchQuery = '';
  st.sessionFilter = 'all';
  st.lockFilter = 'all';
  st.sort = 'date_desc';
  st.assetHistorySheetOpen = false;
  st.assetHistoryAsset = '';
  // The reminders a phone like this would show: a backup 12 days ago (the
  // starting reminder is every 7 days) and retests switched on.
  st.lastBackupAt = new Date(Date.now() - 12 * 86400000).toISOString();
  st.backupSnoozedUntil = null;
  st.reminders = { exportAfter: 'off', unlockedAt: 'off', backupDays: '7' };
  st.retestRemindersEnabled = true;
  st.cloud = { status: 'signed-in', busy: false, email: TUT_ACCOUNT, plan: null, trialEndsAt: null, checkedAt: null, message: '' };
  st.sync = { busy: false, message: '', resolving: null, waiting: null, diffing: null };
  st.jobsTab = 'phone';
  st.cloudJobs = { loading: false, ok: false, error: '', at: '', uid: 'tutorial', jobs: [], capped: false, photos: false,
    stale: false, q: '', selecting: false, selected: {}, busy: '' };
  return st;
}

// What the practice's sync records say (on _tut, never in storage).
function _tutSyncBlank() {
  const hourAgo = new Date(Date.now() - 3600000).toISOString();
  return { lastPushAt: hourAgo, lastPullAt: hourAgo, sent: { 'tutorial-job-office': true, 'tutorial-job-last-year': true } };
}

// The practice's versions of what the phone's sync records would say.
function _tutSyncSummary() {
  const sy = (_tut && _tut.sync) || _tutSyncBlank();
  const jobs = (_tut && _tut.st.sessions) || [];
  const up = jobs.filter((s) => sy.sent[String(s.id)]).length;
  return {
    total: jobs.length, upToDate: up, waiting: jobs.length - up,
    recTotal: 0, recUpToDate: 0, listTotal: 1, listUpToDate: 1, rpTotal: 1, rpUpToDate: 1, gsTotal: 0, gsUpToDate: 0,
    phReady: false, phTotal: 0, phUp: 0, phCloudOnly: 0,
    lastPushAt: sy.lastPushAt, lastPullAt: sy.lastPullAt,
    held: ((_tut && _tut.held) || []).length
  };
}
function _tutSafety() {
  const sy = (_tut && _tut.sync) || _tutSyncBlank();
  const map = new Map();
  let safe = 0;
  ((_tut && _tut.st.sessions) || []).forEach((s) => {
    const ok = !!sy.sent[String(s.id)];
    if (ok) safe++;
    map.set(String(s.id), ok ? { safe: true, why: 'safe' } : { safe: false, why: 'unsent' });
  });
  return { map, safe, total: map.size };
}

// Swapped in by _tutDraw for the cloud tutorials only (def.cloud).
const TUT_CLOUD_STUBS = {
  cloudAvailable: () => true,
  cloudPagesUnlocked: () => true,
  syncStatusSummary: () => _tutSyncSummary(),
  syncHeldList: () => ((_tut && _tut.held) || []).slice(),
  syncJobsSafety: () => _tutSafety(),
  planBannerHTML: () => ''
};
function _tutStubs() {
  const d = _tut ? _tutDef() : null;
  return (d && d.cloud) ? TUT_CLOUD_STUBS : null;
}

// The real sync's own wording for a result (sync.js _syncOutcome), or ours.
function _tutOutcome(r, fallback) {
  try { if (typeof _syncOutcome === 'function') return _syncOutcome(r) || fallback; } catch (e) {}
  return fallback;
}

// Jobs list
function _tutSearch(q) { _tut.st.sessionsSearchQuery = q; }
function _tutOpenHistory(asset) { _tut.st.assetHistorySheetOpen = true; _tut.st.assetHistoryAsset = asset; }
function _tutCloseHistory() { _tut.st.assetHistorySheetOpen = false; _tut.st.assetHistoryAsset = ''; _tut.st.sessionsSearchQuery = ''; }
function _tutJobsTab(tab) { _tut.st.jobsTab = tab; }

// In the cloud — the practice's cloudJobsLoad / select / tick / bring.
function _tutCloudShow() {
  Object.assign(_tut.st.cloudJobs, { ok: true, loading: false, error: '', at: new Date().toISOString(), jobs: _tutCloudOnlyJobs() });
}
function _tutCloudSearch(q) { _tut.st.cloudJobs.q = q; }
function _tutCloudSelect() { const cj = _tut.st.cloudJobs; cj.selecting = true; cj.selected = {}; }
function _tutCloudTickFirst() {
  const m = _tutDraw(() => cloudJobsModel());
  const first = m && m.groups && m.groups[0] && m.groups[0].rows[0];
  if (first) _tut.st.cloudJobs.selected[first.id] = true;
}
// The ticked jobs come down as whole jobs (their items made up here — the
// list only knows the counts), then the phone tab shows them (5A).
function _tutCloudBring() {
  const st = _tut.st, cj = st.cloudJobs;
  const ids = Object.keys(cj.selected || {});
  const have = new Set(st.sessions.map((s) => String(s.id)));
  ids.forEach((id) => {
    const j = (cj.jobs || []).find((x) => x.id === id);
    if (!j || have.has(id)) return;
    st.sessions.push(_tutJob(j.id, j.site, j.date, _tutItems(2001, j.items || 1, j.fails || 0, j.date),
      j.certNo ? _tutDone(j.certNo, j.date) : {}));
    if (_tut.sync) _tut.sync.sent[j.id] = true;   // it came from the cloud: safe there already
  });
  Object.assign(cj, { selecting: false, selected: {}, q: '' });
  st.jobsTab = 'phone';
}

// Sync
function _tutSyncPush() {
  const sy = _tut.sync;
  const waiting = _tut.st.sessions.filter((s) => !sy.sent[String(s.id)]);
  waiting.forEach((s) => { sy.sent[String(s.id)] = true; });
  sy.lastPushAt = new Date().toISOString();
  _tut.st.sync.message = _tutOutcome({ sent: waiting.length, pulled: { applied: 0, added: 0, removed: 0, held: 0 }, records: null },
    'Sent ' + waiting.length + ' job' + (waiting.length === 1 ? '' : 's') + '.');
}
// A check that finds a job changed on both phones — held, as the real pull
// holds one (sync.js), so the question is seen before it happens for real (6A).
function _tutSyncPull() {
  const sy = _tut.sync;
  sy.lastPullAt = new Date().toISOString();
  const job = _tut.st.sessions.find((s) => s.id === 'tutorial-job-office');
  _tut.held = job ? [{ kind: 'session', id: job.id, name: job.site, reason: 'both-changed',
    localItems: job.items.length, cloudItems: job.items.length + 1, at: sy.lastPullAt }] : [];
  _tut.st.sync.message = _tutOutcome({ pulled: { applied: 0, added: 0, removed: 0, held: _tut.held.length }, records: null },
    'One job needs your answer — see below.');
}

const TUT_STEPS_JOBS = [
  { key: 'list', target: '.session-card',
    text: 'This is your Jobs list — every job on this phone, newest first. Tap one to open it. A <strong>shield</strong> by the name means that job is safe in the cloud.' },
  { key: 'backup', target: '.backup-banner', when: true,
    text: 'Reminders sit at the top. This one says it’s time for a backup — <strong>Export now</strong> makes one. Choose how often in Settings → Phone &amp; Display → Reminders.' },
  { key: 'retests', target: '.cal-banner', when: true,
    text: 'A job done a year ago is due for its retest. <strong>View</strong> lists the clients to rebook. Switch these on in Settings → Clients &amp; Retests.' },
  { key: 'search', target: '#sessions-search', go: true, pause: true,
    text: 'Search finds jobs and items — a client, a site, an item or an asset number. Tap the box — we’ll search for asset 1042.',
    run: () => _tutSearch('1042') },
  { key: 'history', target: '.asset-history-card', go: true,
    text: 'Asset 1042 was tested in two jobs. Tap the card to see its history.',
    run: () => _tutOpenHistory('1042') },
  { key: 'history-sheet', target: '.asset-history-sheet',
    text: 'Every time that asset was tested, newest first, with its result. Tap one to open that job.',
    run: () => _tutCloseHistory() },
  { key: 'import', target: '#import-session-btn',
    text: '<strong>Import (.csv)</strong> brings in a job from a PATGo spreadsheet — one you exported earlier, or sent from another phone.' },
  { key: 'tabs', target: '.jobs-tabs',
    text: 'Signed in to your account, the Jobs list has two tabs. <strong>On this phone</strong> is what’s here now.' },
  { key: 'cloud-tab', target: '.jobs-tab[data-arg="cloud"]', go: true,
    text: 'Jobs you clear off this phone are still kept in the cloud. Tap <strong>In the cloud</strong>.',
    run: () => _tutJobsTab('cloud') },
  { key: 'done', target: '',
    text: 'That’s the Jobs list. Next up: finding a job in the cloud and bringing it back.' }
];

const TUT_STEPS_CLOUD = [
  { key: 'tab', target: '.jobs-tab[data-arg="cloud"]', go: true,
    text: 'This is your Jobs list. Every job you’ve saved is kept in the cloud too — even ones cleared off this phone. Tap <strong>In the cloud</strong>.',
    run: () => _tutJobsTab('cloud') },
  { key: 'show', target: '.cloud-tab .pm-note [data-tut-action="cloud-refresh"]', go: true,
    text: 'Old jobs aren’t downloaded until you ask, so a phone isn’t filled up with them. Tap <strong>Show them</strong>.',
    run: () => _tutCloudShow() },
  { key: 'list', target: '.cloud-card',
    text: 'The jobs only in the cloud, by month: the client and site, the date, items, fails and the certificate number. They take no space on your phone.' },
  { key: 'storage', target: '.cloud-storage-link', when: true,
    text: '<strong>Cloud Storage</strong> shows how much room your jobs and photos take in the cloud.' },
  { key: 'search', target: '#cloud-search', go: true, pause: true,
    text: 'Looking for one? Search by client, site or certificate number. Tap the box — we’ll search for Riverside.',
    run: () => _tutCloudSearch('Riverside') },
  { key: 'select', target: '.cloud-select-btn', go: true,
    text: 'To bring a job back onto this phone, tap <strong>Select</strong>.',
    run: () => _tutCloudSelect() },
  { key: 'tick', target: '.cloud-card .session-info', go: true,
    text: 'Tap the first job to tick it.',
    run: () => _tutCloudTickFirst() },
  { key: 'delete', target: '[data-tut-action="cloud-delete"]',
    text: '<strong>Delete…</strong> removes jobs from the cloud for good, from every phone. You’re shown exactly what goes and asked first — it’s not in the practice.' },
  { key: 'bring', target: '[data-tut-action="cloud-bring"]', go: true,
    text: 'Tap <strong>Bring onto this phone</strong>.',
    run: () => _tutCloudBring() },
  { key: 'arrived', target: '.session-info[data-arg="tutorial-cloud-1"]', box: 'card',
    text: 'It’s on this phone now, with its items and certificate. Open it, add to it or make its certificate again. Clear it off later in Settings → Data → Jobs on This Phone — the cloud keeps it.' },
  { key: 'done', target: '',
    text: 'That’s jobs in the cloud. Next up: how your phones keep in step.' }
];

const TUT_STEPS_SYNC = [
  { key: 'group', target: '.settings-row[data-arg="catCloud"]', go: true,
    text: 'This is Settings. Your account and syncing are under <strong>Account &amp; Sync</strong>. Tap it.',
    run: () => _tutOpenGroup('catCloud') },
  { key: 'page', target: '.settings-row[data-page="cloudSync"]', go: true,
    text: 'Tap <strong>Sync</strong>.',
    run: () => _tutOpenPage('cloudSync') },
  { key: 'counts', target: '#sync-counts',
    text: 'Sync copies your jobs, clients, testers and presets between your phones and the cloud — by itself, a few seconds after you stop logging and whenever you open the app or get signal back. This line says how many jobs are up to date.' },
  { key: 'push', target: '#sync-push', go: true, pause: true,
    text: 'One job is still waiting to go. You don’t have to wait — tap <strong>Push now</strong>.',
    run: () => _tutSyncPush() },
  { key: 'pull', target: '#sync-pull', go: true, pause: true,
    text: 'Working on two phones? <strong>Check for updates</strong> brings in what you did on the other one. Tap it.',
    run: () => _tutSyncPull() },
  { key: 'held', target: '.sync-held-row',
    text: 'Now and then the same job changes on both phones. PATGo never guesses which is right — it holds that job and asks you. Nothing is overwritten until you answer.' },
  { key: 'diff', target: '[data-tut-action="sync-held-diff"]',
    text: '<strong>What’s different?</strong> shows the two copies side by side, so you can see what changed before you choose.' },
  { key: 'answer', target: '[data-tut-action="sync-keep-phone"]',
    text: 'Then keep this phone’s copy, or use the cloud copy. Until you choose, both are kept.' },
  { key: 'done', target: '',
    text: 'That’s Sync — find it for real in Settings → Account &amp; Sync → Sync. Nothing in this tutorial was sent, checked or changed.' }
];

// The tutorials, in the order the Tutorials page lists them and "Next
// tutorial" walks them (8A). `page` — the Settings page each one teaches (its
// icon on the Tutorials page). The practice job keeps its free practice.
const TUTORIALS = [
  { id: 'practice', title: 'Practice job', steps: TUT_STEPS, free: true },
  { id: 'engineer', title: 'Engineer & Tester', page: 'settingsUser', settings: true, steps: TUT_STEPS_ENGINEER,
    blurb: 'Your name and your PAT tester',
    init: (st) => { st.reportSettings.companyName = 'Practice PAT Services'; } },
  { id: 'branding', title: 'Company & Branding', page: 'settingsReport', settings: true, steps: TUT_STEPS_BRANDING,
    blurb: 'Company, logo, colours, signature' },
  { id: 'content', title: 'Certificate Content', page: 'settingsReportContent', settings: true, steps: TUT_STEPS_CONTENT,
    blurb: 'What it shows, and its numbers',
    init: (st) => { st.reportSettings.companyName = 'Practice PAT Services'; } },
  { id: 'items', title: 'Quick Pick Items', page: 'settingsItems', settings: true, steps: TUT_STEPS_ITEMS,
    blurb: 'Your item buttons and presets' },
  { id: 'backup', title: 'Backup & Restore', page: 'settingsBackup', settings: true, steps: TUT_STEPS_BACKUP,
    blurb: 'Keeping your work safe' },
  // V136 (2A): the second heading on the Tutorials page. `cloud` — a pretend
  // signed-in phone (_tutCloudState, TUT_CLOUD_STUBS); `icon` — its row's icon.
  { id: 'jobs', title: 'Your Jobs list', group: 'cloud', cloud: true, icon: 'clipboard-list', steps: TUT_STEPS_JOBS,
    blurb: 'Tabs, search, reminders' },
  { id: 'cloud', title: 'Jobs in the cloud', group: 'cloud', cloud: true, icon: 'cloud', steps: TUT_STEPS_CLOUD,
    blurb: 'Find a job, bring it back' },
  { id: 'sync', title: 'Syncing between phones', group: 'cloud', cloud: true, icon: 'refresh-cw', start: 'settings', page: 'cloudSync', steps: TUT_STEPS_SYNC,
    blurb: 'Push, check, and jobs held for you' }
];

// Which heading a tutorial sits under on the Tutorials page (V136 2A):
// 'setup' — the Settings ones (V135); 'cloud' — your jobs & the cloud.
function _tutGroup(d) { return d ? (d.group || (d.settings ? 'setup' : '')) : ''; }

function _tutDef(id) {
  const want = id || (_tut && _tut.id) || 'practice';
  return TUTORIALS.find((d) => d.id === want) || null;
}
function _tutSteps() { const d = _tutDef(); return d ? d.steps : TUT_STEPS; }
// The next tutorial under the same heading, or null (8A) — so Backup &
// Restore, the last of "Setting up", still ends with Finish alone, and so does
// Sync, the last of "Your jobs & the cloud" (V136). The practice job has none.
function _tutNextDef() {
  if (_tut && _tut.fromPage) return null;   // V137 (4A): opened from its page — Finish only
  const i = TUTORIALS.findIndex((d) => d.id === (_tut && _tut.id));
  const next = (i >= 0) ? TUTORIALS[i + 1] : null;
  const g = _tutGroup(_tutDef());
  return (next && g && _tutGroup(next) === g) ? next : null;
}

function _tutStepText(s) { return (typeof s.text === 'function') ? s.text() : s.text; }

// ---------- control ----------

// Open a tutorial (V135: by its TUTORIALS id). `from` is the screen Quit and
// Finish return to. An unknown id opens nothing. V137: `fromPage` — opened by
// the page's own "Show me how ›", so it ends with Finish alone (4A).
function openTutorial(id, from, fromPage) {
  if (!_tutDef(id || 'practice')) return;
  if (_tutTimer) { clearTimeout(_tutTimer); _tutTimer = null; }
  if (_tut) _tutLetGoPhotos(_tut);
  _tut = _tutBlank(from, id || 'practice');
  _tut.fromPage = !!fromPage;
  state.tourOpen = true;
  state.tourStep = 0;
  state.view = 'tour';
  // A tutorial starts at the top, as a newly opened page does (found in the
  // browser check: one opened low on the Tutorials list started scrolled).
  try { window.scrollTo(0, 0); } catch (e) {}
  render();
}

// Open the practice job.
function openPractice(from) { openTutorial('practice', from); }

// The last step's "Next tutorial" (8A): straight into the next one, which
// starts fresh and still returns to where the first was opened from.
function tutNextTutorial() {
  if (!state.tourOpen || !_tut) return;
  const next = _tutNextDef();
  if (!next) { closeTour(); return; }
  _tutRingRemove();
  openTutorial(next.id, _tut.from);
}

// ---------- V137: "Show me how ›" on the pages the tutorials cover ----------
// `page` on a TUTORIALS entry is the page that tutorial teaches; that page draws
// tutShowMeHowHTML(its view) under its title (1A 2A). No switch (5A) — it does
// nothing until tapped.
function tutorialForPage(view) {
  return TUTORIALS.find((d) => d.page && d.page === view) || null;
}
// Never drawn while a tutorial is open: a tutorial draws these same pages from
// its practice copy (_tutDraw), and a link to itself inside it would only
// confuse — the one way a practice page differs from the real one (76a).
function tutShowMeHowHTML(view) {
  if (_tut || state.tourOpen) return '';
  const d = tutorialForPage(view);
  if (!d) return '';
  return `<div class="tut-howto-row"><button class="link-btn tut-howto" id="tut-howto" data-action="tut-show-me-how" data-arg="${escapeHTML(d.id)}">${icon('compass')} Show me how ${icon('chevron-right', 'ic-trail')}</button></div>`;
}
// The tap. Only from the page the tutorial covers (a stale tap elsewhere does
// nothing). Typing the page still holds goes through the same question as Back
// (3A, settings-actions.js unsavedLeave): Save then the tutorial, Discard then
// the tutorial, or Keep editing. Quit and Finish come back to this page; its
// return markers (the certificate preview, Edit presets) are left alone, so
// Back from it still goes where it did (4A).
function tutShowMeHow(id) {
  const d = _tutDef(id);
  if (!d || !id || d.page !== state.view || state.tourOpen) return;
  const from = state.view;
  const go = () => openTutorial(d.id, from, true);
  if (typeof unsavedLeave === 'function') unsavedLeave(go, go);
  else go();
}

// Kept for setup's "Show me around" hand-off (onboarding.js) and any old link.
function openTour() { openPractice('sessions'); }

function _tutAdvance() {
  if (!_tut) return;
  if (_tutTimer) { clearTimeout(_tutTimer); _tutTimer = null; }
  if (state.tourStep >= _tutSteps().length - 1) { closeTour(); return; }
  state.tourStep += 1;
  render();
}

// Do the current step — by its tap (viaSkip false) or by Skip. A step with its
// own `tap` (the camera) does only that when tapped; Skip moves on without it.
// A log pauses first so its flash is seen in the box; then the box moves on.
function _tutDo(viaSkip) {
  if (!_tut || _tutTimer) return;
  const s = _tutSteps()[state.tourStep];
  if (!s) return;
  if (!viaSkip && typeof s.tap === 'function') { s.tap(); return; }
  if (typeof s.run === 'function') s.run();
  if (s.pause) {
    render();   // the same step, its result on screen (the next asset number…)
    if (s.flash && typeof feedback === 'function') { try { feedback(s.flash[0], s.flash[1]); } catch (e) {} }
    _tutTimer = setTimeout(() => { _tutTimer = null; _tutAdvance(); }, TUT_PAUSE_MS);
    return;
  }
  _tutAdvance();
}

function tourNext() {   // Next on a "look" step
  if (!state.tourOpen || !_tut || _tut.free) return;
  const s = _tutSteps()[state.tourStep];
  if (s && s.go) return;   // a "do" step moves on only by its tap or Skip
  if (s && typeof s.run === 'function') s.run();
  _tutAdvance();
}

function tourSkip() {   // Skip on a "do" step: does it for you
  if (!state.tourOpen || !_tut || _tut.free) return;
  const s = _tutSteps()[state.tourStep];
  if (s && s.go) _tutDo(true);
}

// A tap inside the practice screen. Guided: only the highlighted control of a
// "do" step counts (anything else can't be reached anyway — .tut-live), and a
// hold step takes a hold, not a tap. Free practice: tutFreeTap.
function tutTap(arg, el, e) {
  if (!state.tourOpen || !_tut) return;
  if (_tut.free) { tutFreeTap(e); return; }
  // V135: no tap in the guided practice does what the browser would do with
  // it — a switch must not flip by itself, a box must not take the keyboard.
  // The step's own run changes the practice, and the redraw shows it.
  if (e && typeof e.preventDefault === 'function') { try { e.preventDefault(); } catch (e2) {} }
  const s = _tutSteps()[state.tourStep];
  if (!s || !s.go || !s.target || s.hold) return;
  const hit = e && e.target && typeof e.target.closest === 'function' ? e.target : null;
  const want = _tutTarget(s);
  if (!hit || !want || !(want === hit || want.contains(hit))) return;
  _tutDo(false);
}

// The hold on the item buttons (events.js attachHoldGesture — the app's own
// hold, same time, same finger-drift rule). Guided: the presets step's tap.
// Free practice: opens the preset sheet, as on a real job.
function _tutHold() {
  if (!state.tourOpen || !_tut) return;
  if (_tut.free) {
    if (_tut.st.view !== 'entry') return;
    _tutOpenPresets();
    render();
    return;
  }
  const s = _tutSteps()[state.tourStep];
  if (s && s.hold) _tutDo(false);
}

// ---------- free practice (V134.1 4A) ----------
// After the last step: the testing screen to use alone. The box and card go;
// a bar at the bottom says nothing is saved and has Finish. The practice's own
// versions of the everyday taps work — item buttons, PASS, FAIL and its
// reasons and photos, Copy last result, Prev / Next / New, hold for presets,
// Overview and back, the Jobs list and back. Anything that needs typing, or
// does more than a practice can (Other…, notes, settings, sharing) just says
// so. Every tap is the practice's — the app's actions never run.
function tutFree() {
  if (!state.tourOpen || !_tut) return;
  if (_tutTimer) { clearTimeout(_tutTimer); _tutTimer = null; }
  const st = _tut.st;
  _tut.free = true;
  _tut.cert = null;
  st.failModalOpen = false;
  st.presetSheetOpen = false;
  if (_tutSession()) {
    st.view = 'entry';
    st.cursor = _tutSession().items.length;
    _tutDropPhotos();
    _tutDraw(() => loadFormForCursor());
  } else {
    st.view = 'sessions';
  }
  render();
}

const TUT_FREE_SAY = 'Not in the practice — try the item buttons, PASS, FAIL or Copy last result.';

function _tutFreeCheck() {
  // There is no typing in the practice, so a blank location could never be
  // filled in — it carries the practice's own instead.
  if (!String(_tut.st.form.location || '').trim()) _tut.st.form.location = TUT_LOCATION;
  const err = _tutDraw(() => validateBeforeSave());
  if (err) { if (typeof showToast === 'function') showToast(err); return false; }
  return true;
}

function _tutMoveTo(cursor) {
  const st = _tut.st;
  const sess = _tutSession();
  if (!sess) return;
  st.cursor = Math.max(0, Math.min(cursor, sess.items.length));
  _tutDropPhotos();
  _tutDraw(() => loadFormForCursor());
}

function tutFreeTap(e) {
  const hit = e && e.target && typeof e.target.closest === 'function' ? e.target.closest('[data-tut-action]') : null;
  if (!hit || !_tut) return;
  const act = hit.getAttribute('data-tut-action') || '';
  const arg = hit.getAttribute('data-arg') || '';
  const st = _tut.st;
  let flash = null;
  switch (act) {
    case 'quick-pick': st.form.itemType = arg; break;
    case 'log-pass': if (!_tutFreeCheck()) return; _tutLog('pass'); flash = ['pass', 'pass-btn']; break;
    case 'log-fail': if (!_tutFreeCheck()) return; _tutOpenFail(); break;
    case 'fail-reason': _tutFailReason(arg); flash = ['fail', '']; break;
    case 'fail-cancel': st.failModalOpen = false; _tutDropPhotos(); break;
    case 'fail-photo-pick': _tutPhotoPick(); return;
    case 'fail-photo-remove': st.pendingPhotos = (st.pendingPhotos || []).filter((p, i) => i !== parseInt(arg, 10)); break;
    case 'copy-last': if (!_tutSession() || !_tutSession().items.length) return; _tutCopyLast(); flash = ['copy', 'copy-last-btn']; break;
    case 'cursor-prev': _tutMoveTo(st.cursor - 1); break;
    case 'cursor-next': _tutMoveTo(st.cursor + 1); break;
    case 'skip-new': _tutMoveTo(_tutSession() ? _tutSession().items.length : 0); break;
    case 'preset-sheet-pick':   // a drag that scrolled the list is not a pick (events.js)
      if (typeof sheetDragMoved !== 'undefined' && sheetDragMoved) return;
      _tutSwitchPreset(arg); break;
    case 'preset-sheet-close': st.presetSheetOpen = false; break;
    case 'go-overview': st.view = 'overview'; break;
    case 'overview-back': st.view = 'entry'; break;
    case 'jump-to-item': st.view = 'entry'; _tutMoveTo(parseInt(arg, 10) || 0); break;
    case 'go-sessions': st.view = 'sessions'; break;
    case 'open-session': st.view = 'entry'; _tutMoveTo(_tutSession() ? _tutSession().items.length : 0); break;
    default:
      if (typeof showToast === 'function') showToast(TUT_FREE_SAY);
      return;
  }
  render();
  if (flash && typeof feedback === 'function') { try { feedback(flash[0], flash[1]); } catch (e2) {} }
}

// Quit, Finish, or the last step's button. Back to where it was opened from.
function closeTour() {
  if (_tutTimer) { clearTimeout(_tutTimer); _tutTimer = null; }
  const from = (_tut && _tut.from) || 'sessions';
  _tutLetGoPhotos(_tut);
  _tut = null;
  state.tourOpen = false;
  state.tourStep = 0;
  _tutRingRemove();
  setView(from);
}

// ---------- render ----------
// render() hands the whole of #app to this while state.tourOpen (render-core.js).

function renderTour() {
  if (!_tut) _tut = _tutBlank('sessions');
  const total = _tutSteps().length;
  let step = state.tourStep || 0;
  if (step < 0) step = 0;
  if (step > total - 1) step = total - 1;
  const s = _tutSteps()[step];
  const isLast = step === total - 1;
  const free = !!_tut.free;
  const def = _tutDef() || TUTORIALS[0];
  const cert = (!free && s.cert)
    ? `<div class="tut-cert" role="img" aria-label="Sample certificate">
         <div class="tut-cert-title">Sample certificate</div>
         <div class="tut-cert-box" id="tut-cert-box">${_tut.cert === 'failed'
           ? `<p class="muted">Couldn’t draw the sample here.</p>`
           : (_tut.cert === 'ready' ? '' : `<p class="muted">Making the sample…</p>`)}</div>
       </div>` : '';
  // A sheet slides up when it opens — once. A later redraw of the same open
  // sheet must not slide it in again under the box.
  const pd = _tut.st.presetDialog;
  const sheet = _tut.st.failModalOpen ? 'fail' : (_tut.st.presetSheetOpen ? 'preset'
    : ((pd && (pd.mode === 'new' || pd.mode === 'rename')) ? 'preset-dialog'   // V135
      : (_tut.st.assetHistorySheetOpen ? 'history' : '')));   // V136
  const still = !!(sheet && sheet === _tut.sheet);
  _tut.sheet = sheet;
  const screen = _tutInert(_tutScreenHTML());
  if (free) {
    // Free practice: the screen is the engineer's; VoiceOver reads it too.
    return `
    <div class="tut-wrap" role="dialog" aria-label="Free practice">
      <div class="tut-practice tut-free${still ? ' tut-still' : ''}" id="tut-practice" data-action="tut-tap">
        ${screen}
      </div>
      <div class="tut-bar" id="tut-card">
        <h2 class="tut-bar-text" id="screen-title" tabindex="-1">Free practice — nothing is saved</h2>
        <button class="btn-primary tut-bar-done" data-action="tut-quit">Finish</button>
      </div>
    </div>
  `;
  }
  // The last step: the practice job offers free practice; a Settings tutorial
  // offers the next one, or Finish alone after the last (V135 8A).
  const next = isLast ? _tutNextDef() : null;
  const btns = isLast
    ? (def.free
      ? `<button class="btn-secondary tut-quit" data-action="tut-quit">Finish</button>
          <button class="btn-primary tut-go" data-action="tut-free">Free practice</button>`
      : (next
        ? `<button class="btn-secondary tut-quit" data-action="tut-quit">Finish</button>
          <button class="btn-primary tut-go" data-action="tut-next-tutorial">Next tutorial</button>`
        : `<button class="btn-primary tut-go" data-action="tut-quit">Finish</button>`))
    : `<button class="btn-secondary tut-quit" data-action="tut-quit">Quit</button>
          ${s.go
            ? `<button class="btn-primary tut-go" data-action="tut-skip">Skip</button>`
            : `<button class="btn-primary tut-go" data-action="tut-next">Next</button>`}`;
  return `
    <div class="tut-wrap" role="dialog" aria-label="${def.free ? 'Practice job' : escapeHTML(def.title + ' tutorial')}">
      <div class="tut-practice${still ? ' tut-still' : ''}" id="tut-practice" data-action="tut-tap" aria-hidden="true">
        ${screen}
        ${cert}
      </div>
      <div class="tut-card tut-card-bottom" id="tut-card">
        <div class="tut-count">Step ${step + 1} of ${total}</div>
        <h2 class="tut-text" id="screen-title" tabindex="-1">${_tutStepText(s)}</h2>
        <div class="tut-btns">
          ${btns}
        </div>
      </div>
    </div>
  `;
}

// ---------- the moving box (3B) ----------
// One element on <body>, outside #app, so it survives every redraw and its
// position can GLIDE from one control to the next (a CSS transition on a node
// that stays put — the reliable kind on iOS; see the skill's keyframes note).
// Placed after every tutorial render (render-core.js calls tutAfterRender).

function _tutRing() {
  let r = document.getElementById('tut-ring');
  if (!r) {
    r = document.createElement('div');
    r.id = 'tut-ring';
    r.className = 'tut-ring tut-ring-snap';
    r.setAttribute('aria-hidden', 'true');
    document.body.appendChild(r);
    _tutListen(true);
  }
  return r;
}

function _tutRingRemove() {
  const r = document.getElementById('tut-ring');
  if (r && r.parentNode) r.parentNode.removeChild(r);
  _tutListen(false);
}

let _tutListening = false;
function _tutOnMove() { if (!_tutScrolling) tutPlace(true); }
function _tutListen(on) {
  if (typeof window === 'undefined' || !window.addEventListener) return;
  if (on && !_tutListening) {
    window.addEventListener('scroll', _tutOnMove, { passive: true });
    window.addEventListener('resize', _tutOnMove);
    _tutListening = true;
  } else if (!on && _tutListening) {
    window.removeEventListener('scroll', _tutOnMove);
    window.removeEventListener('resize', _tutOnMove);
    _tutListening = false;
  }
}

function _tutReducedMotion() {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
}

// The step's target on screen, or null. A `when` step with no target is passed
// by the caller.
function _tutTarget(s) {
  const root = document.getElementById('tut-practice');
  if (!root || !s || !s.target) return null;
  let el = null;
  try { el = root.querySelector(s.target); } catch (e) { return null; }
  // V135: the box round a whole toggle row or page section, not just the
  // control inside it.
  if (el && s.box === 'row') el = el.closest('.toggle-row') || el;
  else if (el && s.box === 'section') el = el.closest('.settings-section') || el;
  else if (el && s.box === 'card') el = el.closest('.session-card') || el;   // V136
  return el;
}

// Which end the card goes to (V134.1 3A — the screen stays still, like the real
// testing screen; the CARD moves instead). Pure, for the harness: given the
// target's top and bottom, the card's height and the screen's height, the end
// that leaves the target clear — the end farther from it first — and how far
// the page must scroll when neither end does (0 almost always: only a target
// off the screen, or too tall to fit beside the card, moves the page).
function tutCardEnd(top, bottom, cardH, vh) {
  const gap = 12;
  const clearBottom = bottom <= vh - cardH - gap * 2 && top >= gap;
  const clearTop = top >= cardH + gap * 2 && bottom <= vh - gap;
  const centre = (top + bottom) / 2;
  const prefer = centre < vh / 2 ? 'bottom' : 'top';
  if (prefer === 'bottom' && clearBottom) return { end: 'bottom', dy: 0 };
  if (prefer === 'top' && clearTop) return { end: 'top', dy: 0 };
  if (clearBottom) return { end: 'bottom', dy: 0 };
  if (clearTop) return { end: 'top', dy: 0 };
  // Neither: card at the bottom and the page scrolled the least that clears it
  // (or, for a very tall target, brings its top to the top of the screen).
  const room = vh - cardH - gap * 3;
  const dy = (bottom - top <= room) ? bottom - (vh - cardH - gap * 2) : top - gap;
  return { end: 'bottom', dy: Math.round(dy) };
}

// Put the box round the target and the card at the end that leaves it clear.
// snap = no glide (a scroll, a resize, the first placing).
function tutPlace(snap) {
  if (!state.tourOpen || !_tut) return;
  const ring = _tutRing();
  const card = document.getElementById('tut-card');
  const root = document.getElementById('tut-practice');
  if (root) root.querySelectorAll('.tut-live').forEach((x) => x.classList.remove('tut-live'));
  const vw = window.innerWidth || 390, vh = window.innerHeight || 844;
  const s = _tutSteps()[state.tourStep];
  // Free practice and the last step: no box and no dim at all (V134.1 4A —
  // a box shrunk to nothing left a dot in the middle of the screen).
  const el = _tut.free ? null : _tutTarget(s);
  if (!el) {
    ring.classList.add('tut-ring-off');
    if (card && !_tut.free) { card.classList.remove('tut-card-top'); card.classList.add('tut-card-bottom'); }
    return;
  }
  ring.classList.remove('tut-ring-off');
  el.classList.add('tut-live');
  // A sheet slides up as it opens: measured now, its controls are still below
  // the screen (found in the browser check). Wait for it to arrive, then glide.
  const sheet = el.closest('.fail-sheet, .tut-cert, .bulk-sheet');   // V135: + the New preset sheet
  const moving = (sheet && typeof sheet.getAnimations === 'function')
    ? sheet.getAnimations().filter((a) => a.playState === 'running') : [];
  if (moving.length) {
    const at = state.tourStep;
    Promise.all(moving.map((a) => a.finished.catch(() => null)))
      .then(() => { if (state.tourOpen && state.tourStep === at) tutPlace(false); });
    return;
  }
  let r = el.getBoundingClientRect();
  const cardH = card ? card.getBoundingClientRect().height : 0;
  // A control in a bottom sheet (the fail sheet, the preset sheet, the sample
  // certificate): the card goes to the top — the sheet can't scroll from under
  // it (found in the browser check: the certificate sat behind the card).
  const pick = sheet ? { end: 'top', dy: 0 } : tutCardEnd(r.top, r.bottom, cardH, vh);
  if (card) { card.classList.toggle('tut-card-top', pick.end === 'top'); card.classList.toggle('tut-card-bottom', pick.end === 'bottom'); }
  if (pick.dy) {
    const smooth = !snap && !_tutReducedMotion();
    try { window.scrollBy({ top: pick.dy, behavior: smooth ? 'smooth' : 'auto' }); } catch (e) { window.scrollBy(0, pick.dy); }
    if (smooth) {
      _tutScrolling++;
      setTimeout(() => { _tutScrolling = Math.max(0, _tutScrolling - 1); tutPlace(true); }, TUT_GLIDE_MS + 120);
      r = { top: r.top - pick.dy, left: r.left, width: r.width, height: r.height };   // where it will be
    } else {
      r = el.getBoundingClientRect();
    }
  }
  const pad = 6;
  ring.classList.toggle('tut-ring-snap', !!snap);
  ring.style.top = Math.round(r.top - pad) + 'px';
  ring.style.left = Math.round(r.left - pad) + 'px';
  ring.style.width = Math.round(r.width + pad * 2) + 'px';
  ring.style.height = Math.round(r.height + pad * 2) + 'px';
}

// After every tutorial render: pass a `when` step that has nothing to show;
// start a new screen at the top (as the real app does); put the sample
// certificate's pages back (render replaced the box they sat in); wire the
// hold on the item buttons; place the ring; hand VoiceOver the card's words.
function tutAfterRender() {
  if (!state.tourOpen || !_tut) return;
  const s = _tutSteps()[state.tourStep];
  if (!_tut.free && s && s.when && !_tutTarget(s)) { state.tourStep += 1; render(); return; }
  const screen = _tut.st.view;
  if (_tut.screen && _tut.screen !== screen) { try { window.scrollTo(0, 0); } catch (e) {} }
  _tut.screen = screen;
  const box = document.getElementById('tut-cert-box');
  if (box && _tut.certNodes && _tut.certNodes.parentNode !== box) { box.innerHTML = ''; box.appendChild(_tut.certNodes); }
  const grid = document.getElementById('quick-grid');
  if (grid && typeof attachHoldGesture === 'function' && (_tut.free || (s && s.hold))) {
    try { attachHoldGesture(grid, QUICK_PICK_LONGPRESS_MS, _tutHold); } catch (e) {}
  }
  const first = !document.getElementById('tut-ring');
  try { tutPlace(first); } catch (e) { console.error('Tutorial box not placed (non-fatal).', e); }
  if (first) {
    const ring = document.getElementById('tut-ring');
    const lift = () => { if (ring) ring.classList.remove('tut-ring-snap'); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(lift)); else setTimeout(lift, 32);
  }
  // The card's words, once per step (a log's pause repaints the same step).
  const said = _tut.free ? 'free' : state.tourStep;
  if (_tut.said !== said) {
    _tut.said = said;
    const h = document.getElementById('screen-title');
    if (h && typeof h.focus === 'function') { try { h.focus({ preventScroll: true }); } catch (e) {} }
  }
}
