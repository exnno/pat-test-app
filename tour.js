// tour.js — V134 tutorials: the practice job
// (c) 2026 Peter Birchley. All rights reserved.
//
// The practice job walks a new engineer through a job on the REAL screens:
// the Jobs list, the New job form, the testing screen, the fail sheet and the
// Overview are drawn by the app's own render functions (renderSessions,
// renderEntry, renderOverview), so what they practise on is the screen they
// will use — identical by construction, never a hand-made copy that drifts
// (Peter, V134 2A: "it has to be identical to our current testing screen").
// A blue box glides from control to control (3B); a card at the far end says
// what to look at or what to tap (4A).
//
// ⚠ HOW THE PRACTICE STAYS APART FROM REAL WORK. Those render functions read
// the global `state`. _tutDraw() swaps the practice's own state into `state`,
// calls the render function, and puts every real value back in a `finally` —
// all in one synchronous run, so no timer, sync, save or tap can run in
// between and see the practice (JavaScript runs one thing at a time). While
// swapped, storage writes are refused (counted in _tutRefused), so even a
// render function that records something can't write it to the phone. The
// practice's own taps never reach the app's actions: in the practice markup
// every data-action becomes data-tut-action, and the only control that can be
// touched is the highlighted one (.tut-live; everything else has no pointer
// events). Logging in the practice is done here, on the practice state only —
// never by the real saveItem(), which saves, syncs, learns and stamps photos.
// Nothing from the practice is kept: no job, no item, no client, no learning,
// no certificate number (the sample certificate is built without stamping).
//
// The old five picture slides (V42) are retired (7A); `openTour()` and
// state.tourOpen / state.tourStep keep their names — setup, the update's safe
// moment (boot.js) and the plan prompt (plan.js) all ask "is the tutorial open?"

// ---------- the practice state ----------

// A new phone's state, taken when this file loads — before boot's load() puts
// this phone's data in. The practice starts from it every time, so every
// engineer sees the same screens with the app's starting settings (Smart Quick
// Pick, readings, Undo, Multi Pick and map pins all off; the starting Quick
// Pick items). The VALUES are copied, never shared.
const TUT_FRESH = (() => { try { return JSON.stringify(state); } catch (e) { return '{}'; } })();

// Taken from THIS phone instead: who you are and how your certificate looks, so
// the sample certificate is your own (rule 7: the instrument comes from the
// list, not the mirror — both are copied so either reads the same).
const TUT_FROM_PHONE = ['engineer', 'reportSettings', 'instruments', 'activeInstrumentId',
  'testerMake', 'testerModel', 'testerSerial', 'calDate', 'calCertNo', 'calDue'];

const TUT_CLIENT = 'Practice Ltd';
const TUT_SITE = 'Head Office';
const TUT_LOCATION = 'Office';

// The box's glide, and the pause after a log before it moves on (so the
// button's flash is seen inside the box). The glide matches styles.css #tut-ring.
const TUT_GLIDE_MS = 350;
const TUT_PAUSE_MS = 650;

let _tut = null;          // { st, from, cert, certNodes, said } — while open
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
  st.sessions = [];
  st.activeId = null;
  st.cursor = 0;
  st.view = 'sessions';
  st.welcomeSeen = true;
  st.onboardedV33Seen = true;
  st.tourOpen = false;
  st.newForm = Object.assign({}, st.newForm || {}, { show: false, clientId: '', site: '', name: '', prefix: '', startNo: '1', engineer: st.engineer || '' });
  return st;
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
  try {
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
    .replace(/\sautofocus\b/g, '')
    .replace(/<(input|textarea|select)\b/g, '<$1 readonly tabindex="-1"')
    .replace(/<button\b/g, '<button tabindex="-1"');
}

// One screen of the practice, drawn by the app's own render function.
function _tutScreenHTML() {
  return _tutDraw(() => {
    const v = state.view;
    if (v === 'entry') return renderEntry();
    if (v === 'overview') return renderOverview();
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

// Log the form as saveItem() would build the item (session.js) — the item, the
// cursor, the next asset number and the carried location — and nothing else.
function _tutLog(result, typeOverride) {
  _tutDraw(() => {
    const sess = activeSession();
    if (!sess) return;
    const item = {
      id: 'tutorial-' + newId(),
      assetNo: String(state.form.assetNo || '').trim() || nextAssetNo(sess),
      location: normaliseLocation(state.form.location),
      itemType: typeOverride || normaliseItemType(state.form.itemType),
      notes: String(state.form.notes || '').trim(),
      result,
      ts: new Date().toISOString()
    };
    sess.items.push(item);
    state.cursor = sess.items.length;
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
// the whole screen dims); `go` — a "do" step (4A): only the target works and
// Skip does it; `run` — what the tap or Skip does; `pause` — wait a moment
// after a log so the flash is seen before the box moves on; `when` — a step
// that shows only if its target is on the screen (a phone that can't take
// photos has no photo row).
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
  { key: 'photo', target: '.fail-photo-row', when: true,
    text: 'On a fail you can add photos of the damage here. They can go on the certificate.' },
  { key: 'reason', target: '.fail-reason-btn[data-reason="Damaged Plug"]', go: true, pause: true, flash: ['fail', ''],
    text: 'Say why it failed. Tap <strong>Damaged Plug</strong>.',
    run: () => _tutFailReason('Damaged Plug') },
  { key: 'presets', target: '#quick-grid',
    text: 'Tip: press and hold these buttons to switch to another set of items — a preset for offices, kitchens or workshops.' },
  { key: 'overview', target: '#overview-btn', go: true,
    text: 'Tap the <strong>Overview</strong> button to see the whole job.',
    run: () => _tutGoOverview() },
  { key: 'list', target: '.table-wrap',
    text: 'Every item in the job, fails picked out in red. Tap any item to go back and change it.' },
  { key: 'report', target: '#produce-report-btn', go: true,
    text: 'Job done? Make the certificate. Tap the <strong>report</strong> button.',
    run: () => _tutMakeCert() },
  { key: 'cert', target: '.tut-cert',
    text: () => (_tut && _tut.cert === 'failed')
      ? 'The sample certificate couldn’t be drawn just now — it needs the report files, which come down the first time the app is online. Your real certificates aren’t affected.'
      : 'Your certificate, with your company details. On a real job you share or save it from here. This is only a sample — no certificate number was used.' },
  { key: 'done', target: '',
    text: 'That’s the practice job. Nothing from it was saved. You’ll find it again in <strong>Settings → Help → Tutorials</strong>.' }
];

function _tutStepText(s) { return (typeof s.text === 'function') ? s.text() : s.text; }

// ---------- control ----------

// Open the practice job. `from` is the screen Quit and Finish return to.
function openPractice(from) {
  if (_tutTimer) { clearTimeout(_tutTimer); _tutTimer = null; }
  _tut = { st: _tutNewState(), from: from || 'sessions', cert: null, certNodes: null };
  state.tourOpen = true;
  state.tourStep = 0;
  state.view = 'tour';
  render();
}

// Kept for setup's "Show me around" hand-off (onboarding.js) and any old link.
function openTour() { openPractice('sessions'); }

// The step as shown: a `when` step whose target isn't on this screen is passed.
function _tutAdvance() {
  if (!_tut) return;
  if (_tutTimer) { clearTimeout(_tutTimer); _tutTimer = null; }
  if (state.tourStep >= TUT_STEPS.length - 1) { closeTour(); return; }
  state.tourStep += 1;
  render();
}

// Do the current step (its tap, or Skip). A log pauses first so its flash is
// seen in the box; then the box moves on.
function _tutDo() {
  if (!_tut || _tutTimer) return;
  const s = TUT_STEPS[state.tourStep];
  if (!s) return;
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
  if (!state.tourOpen || !_tut) return;
  const s = TUT_STEPS[state.tourStep];
  if (s && s.go) return;   // a "do" step moves on only by its tap or Skip
  if (s && typeof s.run === 'function') s.run();
  _tutAdvance();
}

function tourSkip() {   // Skip on a "do" step: does it for you
  if (!state.tourOpen || !_tut) return;
  const s = TUT_STEPS[state.tourStep];
  if (s && s.go) _tutDo();
}

// A tap inside the practice screen. Only the highlighted control of a "do"
// step counts; anything else is ignored (it can't be reached anyway — .tut-live).
function tutTap(arg, el, e) {
  if (!state.tourOpen || !_tut) return;
  const s = TUT_STEPS[state.tourStep];
  if (!s || !s.go || !s.target) return;
  const hit = e && e.target && typeof e.target.closest === 'function' ? e.target : null;
  const root = document.getElementById('tut-practice');
  const want = root ? root.querySelector(s.target) : null;
  if (!hit || !want || !(want === hit || want.contains(hit))) return;
  _tutDo();
}

// Quit, Finish, or the last step's button. Back to where it was opened from.
function closeTour() {
  if (_tutTimer) { clearTimeout(_tutTimer); _tutTimer = null; }
  const from = (_tut && _tut.from) || 'sessions';
  _tut = null;
  state.tourOpen = false;
  state.tourStep = 0;
  _tutRingRemove();
  setView(from);
}

// ---------- render ----------
// render() hands the whole of #app to this while state.tourOpen (render-core.js).

function renderTour() {
  if (!_tut) _tut = { st: _tutNewState(), from: 'sessions', cert: null, certNodes: null };
  const total = TUT_STEPS.length;
  let step = state.tourStep || 0;
  if (step < 0) step = 0;
  if (step > total - 1) step = total - 1;
  const s = TUT_STEPS[step];
  const isLast = step === total - 1;
  const cert = (s.key === 'cert')
    ? `<div class="tut-cert" role="img" aria-label="Sample certificate">
         <div class="tut-cert-title">Sample certificate</div>
         <div class="tut-cert-box" id="tut-cert-box">${_tut.cert === 'failed'
           ? `<p class="muted">Couldn’t draw the sample here.</p>`
           : (_tut.cert === 'ready' ? '' : `<p class="muted">Making the sample…</p>`)}</div>
       </div>` : '';
  // The fail sheet slides up when it opens — once. A later step redraws the
  // same open sheet, and it must not slide in again under the box.
  const still = !!(_tut.sheetUp && _tut.st.failModalOpen);
  _tut.sheetUp = !!_tut.st.failModalOpen;
  const btn = s.go
    ? `<button class="btn-primary tut-go" data-action="tut-skip">Skip</button>`
    : `<button class="btn-primary tut-go" data-action="tut-next">${isLast ? 'Finish' : 'Next'}</button>`;
  return `
    <div class="tut-wrap" role="dialog" aria-label="Practice job">
      <div class="tut-practice${still ? ' tut-still' : ''}" id="tut-practice" data-action="tut-tap" aria-hidden="true">
        ${_tutInert(_tutScreenHTML())}
        ${cert}
      </div>
      <div class="tut-card tut-card-bottom" id="tut-card">
        <div class="tut-count">Step ${step + 1} of ${total}</div>
        <h2 class="tut-text" id="screen-title" tabindex="-1">${_tutStepText(s)}</h2>
        <div class="tut-btns">
          ${isLast ? '' : `<button class="btn-secondary tut-quit" data-action="tut-quit">Quit</button>`}
          ${btn}
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
  try { return root.querySelector(s.target); } catch (e) { return null; }
}

// Put the box round the target, the card at the other end, and the target in
// view between them. snap = no glide (a scroll, a resize, the first placing).
function tutPlace(snap) {
  if (!state.tourOpen) return;
  const ring = _tutRing();
  const card = document.getElementById('tut-card');
  const s = TUT_STEPS[state.tourStep];
  const root = document.getElementById('tut-practice');
  if (root) root.querySelectorAll('.tut-live').forEach((x) => x.classList.remove('tut-live'));
  const el = _tutTarget(s);
  const vw = window.innerWidth || 390, vh = window.innerHeight || 844;
  if (!el) {
    ring.style.top = Math.round(vh / 2) + 'px'; ring.style.left = Math.round(vw / 2) + 'px';
    ring.style.width = '0px'; ring.style.height = '0px';
    ring.classList.add('tut-ring-none');
    if (card) { card.classList.remove('tut-card-top'); card.classList.add('tut-card-bottom'); }
    return;
  }
  ring.classList.remove('tut-ring-none');
  el.classList.add('tut-live');
  // A control in a bottom sheet (the fail sheet, the sample certificate) can't
  // scroll up past the card, so the card goes to the top instead.
  const sheet = el.closest('.fail-sheet, .tut-cert');
  const inSheet = !!sheet;
  if (card) { card.classList.toggle('tut-card-top', inSheet); card.classList.toggle('tut-card-bottom', !inSheet); }
  // A sheet slides up as it opens: measured now, its controls are still below
  // the screen (found in the browser check). Wait for it to arrive, then glide.
  const moving = (sheet && typeof sheet.getAnimations === 'function')
    ? sheet.getAnimations().filter((a) => a.playState === 'running') : [];
  if (moving.length) {
    const at = state.tourStep;
    Promise.all(moving.map((a) => a.finished.catch(() => null)))
      .then(() => { if (state.tourOpen && state.tourStep === at) tutPlace(false); });
    return;
  }
  const cr = card ? card.getBoundingClientRect() : { top: vh, bottom: 0 };
  const bandTop = inSheet ? cr.bottom + 12 : 12;
  const bandBot = inSheet ? vh - 12 : cr.top - 12;
  let r = el.getBoundingClientRect();
  let dy = 0;
  if (!inSheet && (r.top < bandTop || r.bottom > bandBot)) {
    const room = bandBot - bandTop;
    dy = (r.height < room) ? r.top - (bandTop + (room - r.height) / 2) : r.top - bandTop;
    const smooth = !snap && !_tutReducedMotion();
    try { window.scrollBy({ top: dy, behavior: smooth ? 'smooth' : 'auto' }); } catch (e) { window.scrollBy(0, dy); }
    if (smooth) {
      _tutScrolling++;
      setTimeout(() => { _tutScrolling = Math.max(0, _tutScrolling - 1); tutPlace(true); }, TUT_GLIDE_MS + 120);
      r = { top: r.top - dy, left: r.left, width: r.width, height: r.height };   // where it will be
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

// After every tutorial render: pass a `when` step that has nothing to show, put
// the sample certificate's pages back (render replaced the box they sat in),
// place the ring, and hand VoiceOver the card's words.
function tutAfterRender() {
  if (!state.tourOpen || !_tut) return;
  const s = TUT_STEPS[state.tourStep];
  if (s && s.when && !_tutTarget(s)) { state.tourStep += 1; render(); return; }
  const box = document.getElementById('tut-cert-box');
  if (box && _tut.certNodes && _tut.certNodes.parentNode !== box) { box.innerHTML = ''; box.appendChild(_tut.certNodes); }
  const first = !document.getElementById('tut-ring');
  try { tutPlace(first); } catch (e) { console.error('Tutorial box not placed (non-fatal).', e); }
  if (first) {
    const ring = document.getElementById('tut-ring');
    const lift = () => { if (ring) ring.classList.remove('tut-ring-snap'); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(lift)); else setTimeout(lift, 32);
  }
  // The card's words, once per step (a log's pause repaints the same step).
  if (_tut.said !== state.tourStep) {
    _tut.said = state.tourStep;
    const h = document.getElementById('screen-title');
    if (h && typeof h.focus === 'function') { try { h.focus({ preventScroll: true }); } catch (e) {} }
  }
}
