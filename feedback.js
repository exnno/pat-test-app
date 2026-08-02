/*!
 * PATGo PWA
 * v22 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PATGo PWA — v22 — Feedback ==============
// Toast + haptic / visual flash / sound feedback. Self-contained.

let _toastTimer = null;
function showToast(message) {
  document.querySelectorAll('body > .toast').forEach(el => el.remove());
  if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.appendChild(el);
  // Force a reflow so the transition runs, then reveal.
  void el.offsetWidth;
  el.classList.add('toast-show');
  _toastTimer = setTimeout(() => {
    el.classList.remove('toast-show');
    setTimeout(() => el.remove(), 250);   // wait out the fade-out transition
    _toastTimer = null;
  }, 1900);
}

// v40: in-app bottom-sheet dialogs replacing native prompt()/confirm() — those
// are unreliable in iOS PWAs (can fail to show, appear behind the app, or be
// suppressed), and on a destructive confirm a silent failure is a data-loss
// risk. These reuse the proven .bulk-sheet pattern ("Name this setup" was the
// template): a backdrop + bottom sheet, focus on open, backdrop/× to dismiss.
// Self-contained, no state, no re-render — purely transient overlay UI.

// Shared low-level builder. Returns { sheet, backdrop, cleanup }.
function _openSheet(ariaLabel) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.style.zIndex = '300';
  const sheet = document.createElement('div');
  sheet.className = 'bulk-sheet';
  sheet.style.zIndex = '301';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', ariaLabel || 'Dialog');
  let done = false;
  function cleanup() {
    if (done) return;
    done = true;
    backdrop.remove();
    sheet.remove();
  }
  backdrop.addEventListener('click', cleanup);
  return { sheet, backdrop, cleanup };
}

// A destructive/confirm dialog. opts: { title, message, confirmLabel='Delete',
// cancelLabel='Cancel', danger=true, onConfirm }. onConfirm runs only on the
// confirm tap; dismissing (× / backdrop / Cancel) just closes and does nothing.
function openConfirmSheet(opts) {
  opts = opts || {};
  const title = opts.title || 'Are you sure?';
  const message = opts.message || '';
  const confirmLabel = opts.confirmLabel || 'Delete';
  const cancelLabel = opts.cancelLabel || 'Cancel';
  const danger = opts.danger !== false;
  const { sheet, backdrop, cleanup } = _openSheet(title);
  sheet.innerHTML = `
    <div class="bulk-sheet-handle"></div>
    <div class="bulk-sheet-header">
      <span class="fail-close-spacer"></span>
      <h3 class="bulk-sheet-title">${escapeHTML(title)}</h3>
      <button class="fail-close-btn" id="confirm-sheet-cancel" aria-label="Cancel">&times;</button>
    </div>
    ${message ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:var(--text-muted)">${escapeHTML(message)}</p>` : ''}
    <div style="display:flex;gap:10px;margin-top:4px">
      <button class="btn-secondary" id="confirm-sheet-no">${escapeHTML(cancelLabel)}</button>
      <button class="${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-sheet-yes" style="flex:1">${escapeHTML(confirmLabel)}</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);
  const xBtn = document.getElementById('confirm-sheet-cancel');
  const noBtn = document.getElementById('confirm-sheet-no');
  const yesBtn = document.getElementById('confirm-sheet-yes');
  if (xBtn) xBtn.addEventListener('click', cleanup);
  if (noBtn) noBtn.addEventListener('click', cleanup);
  if (yesBtn) yesBtn.addEventListener('click', () => {
    cleanup();
    if (typeof opts.onConfirm === 'function') opts.onConfirm();
  });
}

// A single-line name/text input dialog. opts: { title, blurb, value='',
// placeholder='', confirmLabel='Save', maxlength=60, onConfirm(value) }.
// onConfirm receives the trimmed value and is only called on the confirm tap
// (or Enter) with a non-empty value; an empty value shakes/keeps the sheet open.
function openNameSheet(opts) {
  opts = opts || {};
  const title = opts.title || 'Name';
  const blurb = opts.blurb || '';
  const value = opts.value || '';
  const placeholder = opts.placeholder || '';
  const confirmLabel = opts.confirmLabel || 'Save';
  const maxlength = opts.maxlength || 60;
  const { sheet, backdrop, cleanup } = _openSheet(title);
  sheet.innerHTML = `
    <div class="bulk-sheet-handle"></div>
    <div class="bulk-sheet-header">
      <span class="fail-close-spacer"></span>
      <h3 class="bulk-sheet-title">${escapeHTML(title)}</h3>
      <button class="fail-close-btn" id="name-sheet-cancel" aria-label="Cancel">&times;</button>
    </div>
    ${blurb ? `<p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:var(--text-muted)">${escapeHTML(blurb)}</p>` : ''}
    <input class="input" id="name-sheet-input" value="${escapeHTML(value)}" placeholder="${escapeHTML(placeholder)}" autocapitalize="on" autocomplete="off" maxlength="${maxlength}">
    <button class="btn-primary" id="name-sheet-save" style="margin-top:12px">${escapeHTML(confirmLabel)}</button>
  `;
  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);
  const cancelBtn = document.getElementById('name-sheet-cancel');
  const saveBtn = document.getElementById('name-sheet-save');
  const inp = document.getElementById('name-sheet-input');
  if (cancelBtn) cancelBtn.addEventListener('click', cleanup);
  function commit() {
    const v = inp ? inp.value.trim() : '';
    if (!v) { if (inp) { try { inp.focus(); } catch (e) {} } return; }
    cleanup();
    if (typeof opts.onConfirm === 'function') opts.onConfirm(v);
  }
  if (saveBtn) saveBtn.addEventListener('click', commit);
  if (inp) {
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
    try { inp.focus(); inp.select(); } catch (e) {}
  }
}

// v41: a stays-until-tapped info/error sheet, replacing the last native alert()s
// (import / restore / report errors). Unlike showToast (auto-fades in ~2s), an
// error MUST stay on screen until the user acknowledges it — so this is a sheet
// with a single button and NO timer. opts: { title, message, buttonLabel='OK',
// onClose }. Dismissing (button / × / backdrop) closes; onClose (if given) runs
// once on any dismissal.
function openInfoSheet(opts) {
  opts = opts || {};
  const title = opts.title || 'Notice';
  const message = opts.message || '';
  const buttonLabel = opts.buttonLabel || 'OK';
  const { sheet, backdrop, cleanup } = _openSheet(title);
  function close() {
    cleanup();
    if (typeof opts.onClose === 'function') opts.onClose();
  }
  // Backdrop tap should also fire onClose — _openSheet wired cleanup only, so
  // override it here for this sheet.
  backdrop.addEventListener('click', () => { if (typeof opts.onClose === 'function') opts.onClose(); });
  sheet.innerHTML = `
    <div class="bulk-sheet-handle"></div>
    <div class="bulk-sheet-header">
      <span class="fail-close-spacer"></span>
      <h3 class="bulk-sheet-title">${escapeHTML(title)}</h3>
      <button class="fail-close-btn" id="info-sheet-close" aria-label="Close">&times;</button>
    </div>
    ${message ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:var(--text-muted)">${escapeHTML(message)}</p>` : ''}
    <button class="btn-primary" id="info-sheet-ok">${escapeHTML(buttonLabel)}</button>
  `;
  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);
  const xBtn = document.getElementById('info-sheet-close');
  const okBtn = document.getElementById('info-sheet-ok');
  if (xBtn) xBtn.addEventListener('click', close);
  if (okBtn) okBtn.addEventListener('click', close);
}

// v9: confirm the migration prompt — sets the chosen name on the interim preset
// created during load(). If name is blank we keep the placeholder 'My items'.
function confirmMigrationPrompt() {
  const name = (state.migrationPrompt.name || '').trim();
  if (name) {
    const p = activePreset();
    if (p) p.name = name;
  }
  state.migrationPrompt = { show: false, name: '', items: [] };
  save();
  render();
}
// ---------- Feedback: haptics + visual flash + sound (v17) ----------
//
// Background: the app's only way to fire a haptic in an iOS PWA was the
// <input type="checkbox" switch> trick below (programmatically clicking a
// hidden switch's label, which WebKit rewarded with a selection haptic). iOS
// 26.5 patched that exact behaviour — a programmatic label click no longer
// produces a haptic; only a real user tap on the switch does. WebKit has never
// exposed navigator.vibrate, so on iOS 26.5+ there is NO programmatic haptic
// path left, and there's no version-sniff that would bring one back.
//
// v17's answer is to confirm actions through THREE channels instead of one:
//   1. Haptic — unchanged. navigator.vibrate on Android; the switch trick on
//      iOS (still works ≤26.4, a harmless no-op on 26.5+). Gated by the
//      existing Haptics setting.
//   2. Visual flash — ALWAYS on, every device. A brief colour pulse on the
//      button that was tapped (green for pass, neutral for copy/multi-pick;
//      fail keeps its own modal flow). This is the real replacement for the
//      lost iOS buzz — it needs no API, no permission, no sound.
//   3. Sound — OPT-IN, default off. A short Web Audio tone, a different one per
//      action (pass / fail / copy) so they're distinguishable on a noisy site.
//
// Call sites use feedback(kind, elId): kind is 'pass' | 'fail' | 'copy', elId
// is the id of the button to flash (optional). The old haptic(count) is kept as
// a thin shim so nothing else has to change, mapping 1→pass, 2→copy, 3→fail.

function _hapticOnce() {
  try {
    const labelEl = document.createElement('label');
    labelEl.setAttribute('aria-hidden', 'true');
    labelEl.style.display = 'none';
    const inputEl = document.createElement('input');
    inputEl.type = 'checkbox';
    inputEl.setAttribute('switch', '');
    labelEl.appendChild(inputEl);
    document.head.appendChild(labelEl);
    labelEl.click();
    document.head.removeChild(labelEl);
  } catch {}
}

// Channel 1: haptic. Unchanged behaviour, still gated by the Haptics setting.
// count: 1 = single, 2 = double, 3 = triple.
function haptic(count) {
  if (!state.hapticsEnabled) return;        // v7: respect user setting
  if (navigator.vibrate) {
    if (count === 1) navigator.vibrate(50);
    else if (count === 2) navigator.vibrate([50, 70, 50]);
    else if (count === 3) navigator.vibrate([50, 70, 50, 70, 50]);
    return;
  }
  // iOS path: works ≤26.4; a harmless no-op on 26.5+ (Apple patched it).
  _hapticOnce();
  if (count >= 2) setTimeout(_hapticOnce, 120);
  if (count >= 3) setTimeout(_hapticOnce, 240);
}

// Channel 2: visual flash. v17.1 spawned a body-level overlay (so the #app
// re-render can't destroy it — see below), but on iOS Safari the animation
// often didn't start: (a) an animation declared on a freshly-inserted node
// doesn't reliably fire without a forced reflow, and (b) relying on a CSS
// custom property resolving inside the keyframe is fragile. v17.1b fixes both:
//   - the tint colour is baked in as an inline background (no var() timing risk)
//   - the element is inserted, layout is flushed (reflow), THEN the animating
//     class is added on the next frame, which guarantees the keyframe runs
//   - the animation is a simple opacity + scale fade of a solid tinted box,
//     which WebKit renders reliably on a freshly inserted fixed element (far
//     more dependable than animating box-shadow spread).
// Still mirrors the toast pattern: appended to <body>, outside #app, so the
// immediate re-render (saveItem/render) leaves it alone.
const FLASH_MS = 340;
// Solid tint colours, baked inline so there's no CSS-variable resolution timing
// to depend on. Pass = green, everything else = neutral grey.
const FLASH_TINT = {
  pass:    'rgba(22, 163, 74, 0.55)',
  neutral: 'rgba(107, 114, 128, 0.45)'
};
function flashEl(elId, kind) {
  if (!elId) return;
  const el = document.getElementById(elId);
  if (!el) return;
  let rect;
  try { rect = el.getBoundingClientRect(); } catch { return; }
  if (!rect || rect.width < 1 || rect.height < 1) return;

  // Corner radius to trace the button shape.
  let radius = '12px';
  try {
    const cs = window.getComputedStyle(el);
    if (cs && cs.borderTopLeftRadius) radius = cs.borderTopLeftRadius;
  } catch {}

  const overlay = document.createElement('div');
  overlay.className = 'flash-overlay';
  const tint = (kind === 'pass') ? FLASH_TINT.pass : FLASH_TINT.neutral;
  // All positioning + colour inline so nothing depends on the stylesheet having
  // loaded a variable or a keyframe colour. The .flash-overlay class only needs
  // to provide position:fixed, pointer-events:none, and the animation hook.
  overlay.style.cssText =
    'position:fixed;' +
    'left:' + rect.left + 'px;' +
    'top:' + rect.top + 'px;' +
    'width:' + rect.width + 'px;' +
    'height:' + rect.height + 'px;' +
    'border-radius:' + radius + ';' +
    'background:' + tint + ';' +
    'z-index:400;' +
    'pointer-events:none;' +
    'opacity:1;' +
    'transform:scale(1);' +
    'transition:opacity 0.34s ease-out, transform 0.34s ease-out;' +
    'will-change:opacity,transform;';
  document.body.appendChild(overlay);

  // Force a reflow so iOS Safari registers the element's initial (opacity:1)
  // state, THEN flip to the end state on the next frame so the transition runs.
  // We drive opacity/transform via INLINE styles (not a class) because the
  // initial state above is also inline — an inline value beats a class rule, so
  // a class-based end state would be ignored and nothing would animate.
  void overlay.offsetWidth;
  const runFade = () => {
    overlay.style.opacity = '0';
    overlay.style.transform = 'scale(1.06)';
  };
  // rAF gives the cleanest next-frame flip; fall back to a short timeout in any
  // environment where it's unavailable.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(runFade);
  } else {
    setTimeout(runFade, 16);
  }

  setTimeout(() => { overlay.remove(); }, FLASH_MS + 120);
}

// Channel 3: sound. A short Web Audio tone, opt-in (state.soundEnabled). One
// shared AudioContext, created lazily on first use (and resumed if the browser
// suspended it — common on iOS until the first user gesture, which a Pass/Fail
// tap satisfies). Distinct tone per action:
//   pass — a single bright, short, pleasant tick (high, quick decay)
//   copy — a mid double-tick (echoes the double-buzz of copy/multi-pick)
//   fail — a lower, longer, buzzier tone (clearly "not a pass")
// Tones are deliberately tiny (≤120ms total) so they never get in the way of
// fast entry. All wrapped in try/catch — audio must never break logging.
let _audioCtx = null;
function _getAudioCtx() {
  try {
    if (!_audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      _audioCtx = new AC();
    }
    if (_audioCtx.state === 'suspended' && _audioCtx.resume) {
      _audioCtx.resume();
    }
    return _audioCtx;
  } catch {
    return null;
  }
}

// Play one beep: frequency (Hz), duration (s), type, and peak gain.
function _beep(ctx, startAt, freq, dur, type, peak) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);
  // Quick attack, exponential decay — gives a clean "tick" rather than a click.
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + dur + 0.02);
}

function playSound(kind) {
  if (!state.soundEnabled) return;
  try {
    const ctx = _getAudioCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (kind === 'pass') {
      // Single bright tick.
      _beep(ctx, t, 880, 0.09, 'sine', 0.18);
    } else if (kind === 'copy') {
      // Mid double-tick.
      _beep(ctx, t,         660, 0.06, 'sine', 0.16);
      _beep(ctx, t + 0.085, 660, 0.06, 'sine', 0.16);
    } else if (kind === 'fail') {
      // Lower, longer, buzzier tone.
      _beep(ctx, t, 220, 0.18, 'sawtooth', 0.14);
    }
  } catch {}
}

// Unified entry point: fire all three channels for an action. kind is
// 'pass' | 'fail' | 'copy'; elId (optional) is the button to flash.
const FEEDBACK_HAPTIC_COUNT = { pass: 1, copy: 2, fail: 3 };
function feedback(kind, elId) {
  haptic(FEEDBACK_HAPTIC_COUNT[kind] || 1);   // channel 1 (respects Haptics setting)
  flashEl(elId, kind);                         // channel 2 (always on)
  playSound(kind);                             // channel 3 (opt-in)
}



// v11: resolve the value for a single CSV cell, given the column id, the
// session, and the item. Kept as a flat switch so adding new columns later
// (e.g. tester type, calibration cert) is a single-place edit.
// v12: tester / calDate / calCertNo / calDue cases added. These read from
// state.* (current engineer-global values at export time) rather than from
// the session, so the values that appear in the CSV always reflect what's
// configured in User Settings right now — same engineer, same calibration
// cert, whichever session they're exporting. If the user wants per-session
// snapshots we'd need to start stamping these onto each session at creation
// time; deferring that until there's a real need.
