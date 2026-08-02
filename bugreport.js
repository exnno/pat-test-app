/*!
 * PATGo PWA
 * v60 (August 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PATGo PWA — v60 — Bug report ==============
//
// One-tap problem reporting from Settings → Contact. Three concerns live here:
//
//   1. ERROR CAPTURE — an in-memory ring of the last few runtime errors, so a
//      report can carry the actual throw instead of "it went blank".
//   2. DIAGNOSTICS — what the app knows about itself, collected automatically so
//      the engineer never has to find their iOS version or remember which app
//      version they're on.
//   3. THE REPORT — draft state, the fixed-format email body, and handing it to
//      the device's mail client.
//
// THE PRIVACY RULE, which is not negotiable and is the reason this file reads
// the way it does: diagnostics carry COUNTS AND FLAGS ONLY. No client names, no
// site names, no asset numbers, no locations, no item types, no notes, no
// certificate numbers. A support email must never be a route for one customer's
// data to leave an engineer's phone. Every field below is either a number, a
// boolean, a fixed enum, or something the user typed about the app itself.
// If you add a field here, check it against that rule first.

// ---------- 1. Error capture (v60, in memory only) ----------
//
// NEVER persisted. This array lives and dies with the page: it cannot grow
// without bound, cannot corrupt a save, and cannot leak into a backup. That is a
// deliberate trade — a crash that reloads the app loses its own error text — but
// the alternative (writing errors to localStorage) puts the error path on the
// storage path, and the storage path is the one thing in this app that must
// never break.
let _bugErrors = [];

// Record one error. Defensive throughout: this runs from a global error handler,
// so a throw in here would be an error inside the error handler.
function recordBugError(kind, message, source, line) {
  try {
    const entry = {
      kind: String(kind || 'error'),
      message: String(message == null ? '' : message).slice(0, 200),
      where: (source ? String(source).split('/').pop() : '') + (line ? ':' + line : ''),
      at: new Date().toISOString()
    };
    _bugErrors.push(entry);
    // Keep the OLDEST as well as the newest: when one bug causes a cascade, the
    // first throw is usually the real one and the rest are fallout. shift() from
    // the front only once we're over the cap.
    while (_bugErrors.length > BUG_ERROR_BUFFER_MAX) _bugErrors.shift();
  } catch (e) {
    /* an error inside the error recorder must never surface */
  }
}

// Attach the global handlers. Called ONCE from boot.js, wrapped there in its own
// try/catch so that if this ever throws it cannot stop the app starting.
//
// KNOWN LIMIT, stated rather than hidden: boot.js is the LAST script to load, so
// a parse-time failure in an earlier file happens before these handlers exist
// and is not captured here. That class of failure is already covered — the boot
// integrity guard detects it and shows its own screen, which in v60 carries its
// own self-contained report link.
function initErrorCapture() {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (ev) => {
    recordBugError('error', ev && ev.message, ev && ev.filename, ev && ev.lineno);
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev && ev.reason;
    recordBugError('promise', (r && r.message) ? r.message : r, '', 0);
  });
}

// Human-readable summary for the report body, or a clear "nothing to see".
function bugErrorSummary() {
  if (!_bugErrors.length) return 'none recorded';
  return _bugErrors
    .map(e => `${e.kind}: ${e.message}${e.where ? ' (' + e.where + ')' : ''}`)
    .join(' | ');
}

// ---------- 2. Diagnostics ----------

// Rough localStorage footprint in KB. Walks our own keys only. Wrapped because
// localStorage access can throw outright in private-browsing modes.
function _bugStorageKB() {
  try {
    let bytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const v = localStorage.getItem(k) || '';
      bytes += k.length + v.length;
    }
    return Math.round(bytes / 1024) + ' KB';
  } catch (e) {
    return 'unavailable';
  }
}

// Is this the installed PWA or a browser tab? A surprising number of "it doesn't
// work" reports are someone running the site in Safari rather than the installed
// app, where a different set of rules applies.
function _bugDisplayMode() {
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return 'Installed app';
    if (navigator.standalone === true) return 'Installed app (iOS)';
    return 'Browser tab';
  } catch (e) {
    return 'unknown';
  }
}

// Read the live service-worker cache name off the device.
//
// WHY THIS IS THE MOST VALUABLE LINE IN THE WHOLE REPORT: this app is cache-first,
// so a user can be running a build several versions old while the About page
// happily reports whatever version their cached config.js says. This line comes
// from the browser's actual cache store, so it exposes a stale install
// immediately — before anyone spends an evening chasing a bug that was fixed two
// releases ago. Async, hence resolved when the sheet opens rather than inline.
function refreshBugCacheName() {
  try {
    if (typeof caches === 'undefined' || !caches.keys) return;
    caches.keys().then(names => {
      const ours = (names || []).filter(n => String(n).indexOf('pat-v') === 0);
      state.bugDraft.cacheName = ours.length ? ours.join(', ') : 'none found';
    }).catch(() => { /* leave the default */ });
  } catch (e) {
    /* leave the default */
  }
}

// The whole diagnostic payload, as ordered [KEY, value] pairs.
// Fixed uppercase keys, one per line — rigid on purpose so the inbox side can
// parse it without guessing.
function collectDiagnostics() {
  const sessions = Array.isArray(state.sessions) ? state.sessions : [];
  let items = 0, fails = 0, open = 0, locked = 0;
  sessions.forEach(s => {
    const list = (s && Array.isArray(s.items)) ? s.items : [];
    items += list.length;
    list.forEach(it => { if (it && it.result === 'fail') fails++; });
    if (s && s.locked) locked++; else open++;
  });

  const preset = (state.itemPresets || []).find(p => p && p.id === state.activePresetId);
  const scr = (typeof screen !== 'undefined' && screen)
    ? `${screen.width}x${screen.height} @${window.devicePixelRatio || 1}x`
    : 'unknown';

  const flags = [
    'readings=' + (state.readingsEnabled ? 'on' : 'off'),
    'retest=' + (state.retestRemindersEnabled ? 'on' : 'off'),
    'timestamps=' + (state.timestampsEnabled ? 'on' : 'off'),
    'multipick=' + (state.multiPick && state.multiPick.enabled ? 'on' : 'off'),
    'haptics=' + (state.hapticsEnabled ? 'on' : 'off'),
    'theme=' + (state.theme || 'system')
  ].join(' ');

  const lists = [
    'types=' + (state.itemTypes || []).length,
    'reasons=' + (state.failReasons || []).length,
    'presets=' + (state.itemPresets || []).length,
    'clients=' + (state.clients || []).length
  ].join(' ') + (preset && preset.name ? ` (active preset: ${preset.name})` : '');

  return [
    ['APP', typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'unknown'],
    ['CACHE', state.bugDraft.cacheName || 'checking…'],
    ['SENT', formatTimestampCSV(new Date().toISOString())],
    ['MODE', _bugDisplayMode()],
    ['NETWORK', (typeof navigator !== 'undefined' && navigator.onLine === false) ? 'Offline' : 'Online'],
    ['SCREEN', scr],
    ['DEVICE', (typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown')],
    ['ENGINEER', state.engineer || 'not set'],
    ['JOBS', `${sessions.length} (${open} open, ${locked} locked)`],
    ['ITEMS', `${items} (${fails} failed)`],
    ['STORAGE', _bugStorageKB()],
    ['FEATURES', flags],
    ['LISTS', lists],
    ['ERRORS', bugErrorSummary()]
  ];
}

function diagnosticsText() {
  return collectDiagnostics().map(([k, v]) => `${k}: ${v}`).join('\n');
}

// ---------- 3. The report sheet ----------

// NOTE: makeEmptyBugDraft() lives in config.js, NOT here. state.js seeds
// state.bugDraft from it at load time, and state.js executes before this file is
// even parsed — a factory defined here would be a fatal ReferenceError on boot.
// Default factories belong in config.js for exactly that reason.

function openBugSheet() {
  state.bugDraft = makeEmptyBugDraft();
  state.bugSheetOpen = true;
  refreshBugCacheName();   // async; fills in before they finish typing
  render();
}

function closeBugSheet() {
  state.bugSheetOpen = false;
  state.bugDraft = makeEmptyBugDraft();
  render();
}

// Tap handlers.
//
// v60.1 FIX — these used to call render(). That tore down and rebuilt the whole
// screen, which meant tapping a chip AFTER typing dropped the keyboard, lost the
// caret, and visually reloaded the form. The original reasoning ("a tap has no
// caret to lose") was simply wrong: the tap has no caret, but the TEXTAREA ABOVE
// IT does, and a full render destroys it.
//
// Same class of bug as the V57 dropdown work — the rule for this sheet is now
// blunt: NOTHING inside an open bug sheet calls render(). Open and close do
// (they add/remove the sheet); everything in between mutates the DOM in place via
// _applyBugSheetDOM(). If you add a control here, follow that pattern.
function setBugType(id) {
  if (!BUG_REPORT_TYPES.some(t => t.id === id)) return;
  state.bugDraft.type = id;
  _applyBugSheetDOM();
}
function setBugSeverity(id) {
  if (!BUG_REPORT_SEVERITIES.some(s => s.id === id)) return;
  state.bugDraft.severity = id;
  _applyBugSheetDOM();
}
function setBugRepro(id) {
  if (!BUG_REPORT_REPRO.some(r => r.id === id)) return;
  state.bugDraft.repro = id;
  _applyBugSheetDOM();
}

// Reflect the whole draft onto the already-rendered sheet without rebuilding it.
// Everything that can change from a tap is updated here:
//   • which chip / option row carries .active
//   • whether the severity and repeatable blocks are shown (type-dependent)
//   • the two question labels, which reword for Idea/Feedback
//   • the Send button's disabled state
// Fully defensive: if the sheet isn't on screen, every lookup misses and this is
// a no-op rather than a throw.
function _applyBugSheetDOM() {
  try {
    const d = state.bugDraft || {};
    const isBug = d.type === 'bug';

    // Active states. data-arg carries the option id, so one loop covers all three
    // groups without hard-coding the ids.
    const mark = (selector, activeId) => {
      const nodes = document.querySelectorAll(selector);
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        const on = el.getAttribute('data-arg') === activeId;
        el.classList.toggle('active', on);
        // The severity rows show a radio glyph rather than a fill.
        const dot = el.querySelector ? el.querySelector('.bug-option-dot') : null;
        if (dot) dot.textContent = on ? '●' : '○';
      }
    };
    mark('[data-action="bug-set-type"]', d.type);
    mark('[data-action="bug-set-severity"]', d.severity);
    mark('[data-action="bug-set-repro"]', d.repro);

    // Show/hide the bug-only blocks. They are always RENDERED (so there is
    // nothing to rebuild) and merely hidden with a class.
    const sevBlock = document.getElementById('bug-severity-block');
    const repBlock = document.getElementById('bug-repro-block');
    if (sevBlock) sevBlock.classList.toggle('bug-hidden', !isBug);
    if (repBlock) repBlock.classList.toggle('bug-hidden', !isBug);

    // The two questions reword between Bug and Idea/Feedback.
    const q1 = document.getElementById('bug-q1');
    const q2 = document.getElementById('bug-q2');
    if (q1) q1.textContent = isBug ? 'What went wrong?' : 'What would you like?';
    if (q2) q2.textContent = isBug ? 'What were you doing at the time?' : 'Why would that help?';

    _syncBugSendButton();
  } catch (e) {
    /* sheet not rendered — nothing to sync */
  }
}

// Typing handlers — these deliberately do NOT re-render, because re-rendering on
// every keystroke would tear down the input and lose the caret (the same reason
// the readings fields write straight to state). The Send button's enabled state
// is therefore toggled directly on the element instead of via a render pass.
function setBugField(field, value) {
  if (field !== 'description' && field !== 'context') return;
  state.bugDraft[field] = value;
  if (field === 'description') _syncBugSendButton();
}

function bugDescriptionReady() {
  return String(state.bugDraft.description || '').trim().length >= BUG_REPORT_MIN_CHARS;
}

function _syncBugSendButton() {
  try {
    const btn = document.getElementById('bug-send');
    if (btn) btn.disabled = !bugDescriptionReady();
  } catch (e) { /* not rendered */ }
}

// ---------- Composing the message ----------

// Subject: [PATGo BUG P1] V60 — first words of the description
// The bracketed tag is the whole point — it makes the inbox sortable by type and
// severity without opening a single message.
function bugSubjectLine() {
  const d = state.bugDraft;
  const type = BUG_REPORT_TYPES.find(t => t.id === d.type) || BUG_REPORT_TYPES[0];
  const sev = BUG_REPORT_SEVERITIES.find(s => s.id === d.severity);
  const sevPart = (d.type === 'bug' && sev) ? ' ' + sev.code : '';
  const ver = typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?';
  const gist = String(d.description || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  return `[PATGo ${type.tag}${sevPart}] ${ver} — ${gist}`;
}

function bugBodyText() {
  const d = state.bugDraft;
  const isBug = d.type === 'bug';
  const type = BUG_REPORT_TYPES.find(t => t.id === d.type) || BUG_REPORT_TYPES[0];
  const sev = BUG_REPORT_SEVERITIES.find(s => s.id === d.severity);
  const rep = BUG_REPORT_REPRO.find(r => r.id === d.repro);

  const q1 = isBug ? 'WHAT WENT WRONG' : 'WHAT WOULD YOU LIKE';
  const q2 = isBug ? 'WHAT WERE YOU DOING' : 'WHY WOULD THAT HELP';

  // Budget the description against the mailto cap so the diagnostics — the part
  // the user cannot retype — are never the thing that gets cut.
  const diag = diagnosticsText();
  const budget = Math.max(200, BUG_REPORT_MAX_BODY - diag.length - 400);
  const desc = String(d.description || '').trim().slice(0, budget);
  const ctx = String(d.context || '').trim().slice(0, 600);

  const lines = [
    'Sent from PATGo. Please send this as it is — the details below help fix it faster.',
    '',
    `TYPE: ${type.label}`
  ];
  if (isBug) {
    lines.push(`SEVERITY: ${sev ? sev.code + ' — ' + sev.label : 'not set'}`);
    lines.push(`REPEATABLE: ${rep ? rep.text : 'not set'}`);
  }
  lines.push('');
  lines.push(`${q1}:`);
  lines.push(desc || '(not filled in)');
  lines.push('');
  lines.push(`${q2}:`);
  lines.push(ctx || '(not filled in)');
  lines.push('');
  lines.push('--- DIAGNOSTICS (automatic) ---');
  lines.push(diag);
  lines.push('--- END ---');
  return lines.join('\n');
}

// ---------- Sending ----------

// Hand the composed message to the device's mail client. Offline-safe: the mail
// app queues it and sends when signal returns.
function sendBugReport() {
  if (!bugDescriptionReady()) {
    showToast(`Please add a few more words first`);
    return;
  }
  const to = BUG_REPORT_EMAIL;
  const subject = encodeURIComponent(bugSubjectLine());
  const body = encodeURIComponent(bugBodyText());
  const url = `mailto:${to}?subject=${subject}&body=${body}`;
  try {
    window.location.href = url;
    // Close on a short delay rather than immediately: on iOS the mail client
    // opens over the PWA, and tearing the sheet down underneath it means that if
    // the user backs out to change something, their typing has gone.
    setTimeout(() => {
      if (state.bugSheetOpen) {
        closeBugSheet();
        showToast('Report opened in your email app');
      }
    }, 1200);
  } catch (e) {
    showToast('Could not open your email app — try Copy instead');
  }
}

// Fallback for a device with no mail client configured, or anyone who would
// rather paste it somewhere else. Same clipboard technique as copyCSV — the
// textarea + execCommand path is the one that works reliably in iOS PWAs.
async function copyBugReport() {
  const text = bugSubjectLine() + '\n\n' + bugBodyText();
  let copied = false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      copied = true;
    }
  } catch (err) {
    copied = false;
  }
  if (!copied) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);   // iOS needs an explicit range
      copied = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (err2) {
      copied = false;
    }
  }
  showToast(copied ? `Report copied — paste it into an email to ${BUG_REPORT_EMAIL}` : 'Could not copy the report');
}
