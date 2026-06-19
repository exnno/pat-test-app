/*!
 * PAT Test PWA
 * v22 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PAT Test PWA — v22 — Render: core screens ==============
// render() dispatcher + Sessions / Entry / Overview / Edit-session screens
// and their partial refreshes. Owns: const app = #app.

// ---------- Rendering ----------
const app = document.getElementById('app');

// v24 (E4): the orphaned-backdrop sweep below used to run on EVERY render. It's a
// defensive guard against the old "taps do nothing" bug, where a modal backdrop
// left sitting as a direct child of <body> (z-index 90+) silently swallows every
// tap. In the current architecture modals are only ever emitted as HTML strings
// inside #app (never appended to <body> directly), and an innerHTML rewrite of
// #app removes all of its old children — so an orphan can only ever arise from a
// render that ACTUALLY emitted a modal/sheet. We therefore track whether the
// previous render contained any modal/sheet markup and run the (whole-document)
// querySelectorAll sweep only then. On the overwhelmingly common modal-free
// renders (entry logging, sessions list, settings pages) the sweep is skipped
// entirely. The safety net is unchanged for every render that could need it.
let _lastRenderHadModal = false;

function render() {
  if (_lastRenderHadModal) {
    document.querySelectorAll(
      'body > .modal-backdrop, body > .fail-sheet, body > .bulk-sheet'
    ).forEach(el => el.remove());
  }

  const v = state.view;

  // v43: the cloud-pages secret menu (revealed by long-pressing the About title)
  // must close as soon as you leave the About page. We keep it open only while on
  // About itself or on one of the three cloud pages (so tapping in and back out
  // doesn't lose it), and clear it on any other view.
  if (state.cloudPagesRevealed &&
      v !== 'settingsAbout' && v !== 'cloudAccount' &&
      v !== 'cloudSync' && v !== 'cloudSubscription') {
    state.cloudPagesRevealed = false;
  }

  // v42: the feature walkthrough is a full-screen view that owns #app entirely —
  // no banner, no stacked modals. Short-circuit before the normal screen build.
  if (v === 'tour' && state.tourOpen) {
    app.innerHTML = renderTour();
    _lastRenderHadModal = false;
    return;
  }

  let html = '';
  if (v === 'sessions') html = renderSessions();
  else if (v === 'entry') html = renderEntry();
  else if (v === 'overview') html = renderOverview();
  else if (v === 'editSession') html = renderEditSession();
  else if (v === 'settings') html = renderSettingsHub();
  else if (v === 'settingsCategory') html = renderSettingsCategory();   // v32
  else if (v === 'settingsUser') html = renderSettingsUser();
  else if (v === 'settingsItems') html = renderSettingsItems();
  else if (v === 'settingsFails') html = renderSettingsFails();
  else if (v === 'settingsMultiPick') html = renderSettingsMultiPick();   // v16
  else if (v === 'settingsDescriptions') html = renderSettingsDescriptions();
  else if (v === 'settingsDisplay') html = renderSettingsDisplay();
  else if (v === 'settingsBackup') html = renderSettingsBackup();
  else if (v === 'settingsSetup') html = renderSettingsSetup();   // v33
  else if (v === 'settingsCsv') html = renderSettingsCsv();   // v11
  else if (v === 'settingsClients') html = renderSettingsClients();   // v19
  else if (v === 'settingsReport') html = renderSettingsReport();   // v30
  else if (v === 'reports') html = renderReports();   // v30
  else if (v === 'settingsCalculator') html = renderSettingsCalculator();
  else if (v === 'settingsAbout') html = renderSettingsAbout();
  else if (v === 'settingsContact') html = renderSettingsContact();
  // v43: cloud prep pages (not wired into nav yet, revealed via long-press on About)
  else if (v === 'cloudAccount') html = renderCloudAccount();
  else if (v === 'cloudSync') html = renderCloudSync();
  else if (v === 'cloudSubscription') html = renderCloudSubscription();

  // Update banner sits above the screen
  const banner = state.updateAvailable ? `
    <div class="update-banner" role="status">
      <span class="update-banner-text">⟳ Update available</span>
      <div class="update-banner-actions">
        <button class="update-refresh-btn" id="update-refresh" data-action="update-refresh">Refresh</button>
        <button class="update-dismiss-btn" id="update-dismiss" data-action="update-dismiss" aria-label="Dismiss">×</button>
      </div>
    </div>
  ` : '';

  // v9: first-launch migration prompt — shown above everything when the user is
  // upgrading from v8 (or earlier) with a non-empty itemTypes list. Asks them to
  // name the preset their existing list will become. Uses the bulk-sheet pattern
  // (bottom sheet) like other dialogs. No close button — user must commit.
  const migrationModal = state.migrationPrompt.show ? `
    <div class="modal-backdrop" style="z-index:300"></div>
    <div class="bulk-sheet" style="z-index:301" role="dialog" aria-label="Welcome to V9">
      <div class="bulk-sheet-handle"></div>
      <div class="bulk-sheet-header">
        <span class="fail-close-spacer"></span>
        <h3 class="bulk-sheet-title">Welcome to V9</h3>
        <span class="fail-close-spacer"></span>
      </div>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:var(--text)">
        You can now save multiple Quick Pick lists as <strong>presets</strong> and switch between them.
      </p>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:var(--text)">
        Your current Quick Pick items have become your first preset. What would you like to call it?
      </p>
      <label class="label">Preset name</label>
      <input class="input" id="migration-prompt-input" data-input-action="migration-name" value="${escapeHTML(state.migrationPrompt.name)}" placeholder="e.g. Default, My items, Office" autofocus>
      <p class="muted" style="margin:8px 0 14px;font-size:12px">You can rename or add more presets later in Settings → Quick Pick Items.</p>
      <button class="btn-primary" id="migration-prompt-confirm" data-action="migration-confirm">Continue</button>
    </div>
  ` : '';

  // v12: one-time "what's new" modal on first launch after an update.
  // Suppressed if the v9 migration prompt is currently showing (that one
  // takes priority because it requires a name commit) or if the user has
  // already dismissed this modal.
  // v45: rolled forward to V45 and — importantly — RE-WIRED. V43 and V44 never
  // rolled a modal, and the V42 modal had drifted (gate + id + dismiss all keyed
  // off v42). This release ties the gate (v45WelcomeSeen), the dismiss button id
  // (v45-welcome-dismiss) and the copy all to V45, clearing that debt. Still
  // suppressed while the first-run wizard or the v9 migration prompt is up — so an
  // UPGRADING user sees this modal and a genuinely-new install sees the wizard.
  const wizardShowing = !state.onboardedV33Seen && !state.migrationPrompt.show;
  const welcomeModal = (state.v45WelcomeSeen || state.migrationPrompt.show || wizardShowing) ? '' : `
    <div class="modal-backdrop" style="z-index:300"></div>
    <div class="bulk-sheet" style="z-index:301" role="dialog" aria-label="What's new in V45">
      <div class="bulk-sheet-handle"></div>
      <div class="bulk-sheet-header">
        <span class="fail-close-spacer"></span>
        <h3 class="bulk-sheet-title">What's new in V45</h3>
        <span class="fail-close-spacer"></span>
      </div>
      <ul class="welcome-list">
        <li><strong>A smarter first-time setup.</strong> Setting up a new phone now feels properly guided — clearer steps, your report branding, and an optional example job — so a fresh device is ready in a couple of minutes.</li>
        <li><strong>Setting up another phone?</strong> You can run that guided setup any time from <em>Settings → Help → About → “Set up another device”.</em></li>
        <li><strong>A tidier guided tour.</strong> The quick walkthrough of the basics has had a polish too — replay it from <em>About → “Show me around the app again”.</em></li>
      </ul>
      <button class="btn-primary" id="v45-welcome-dismiss" data-action="welcome-dismiss">Continue</button>
    </div>
  `;

  // v33: first-run wizard — replaces the welcome modal for a genuinely-new
  // install. v42: rebuilt as a guided commercial setup. Fresh path steps:
  //   1 intro → 2 choose path → 3 details → 4 branding → 5 example session?
  //   → 6 all set (offer the walkthrough). Skippable throughout. Built on the
  //   bottom-sheet pattern (the reliable iOS PWA modal). Step state is transient
  //   (wizardStep / wizardPath / wizardSeedDemo). The step counter shows "of 6"
  //   only on the fresh path (steps 3+); steps 1–2 are shared with import and
  //   read as "Step N".
  let wizardModal = '';
  if (wizardShowing) {
    const step = state.wizardStep || 1;
    const rs = state.reportSettings || {};
    const skipBtn = `<button class="wizard-skip" data-action="wizard-skip">Skip for now</button>`;
    const backBtn = `<button class="wizard-back" data-action="wizard-back">‹ Back</button>`;
    let bodyHTML = '';
    let footHTML = '';

    // v45: the step indicator. Steps 1–2 are shared with the import path so they
    // read as a simple "Step N"; the fresh path (steps 3–6) shows progress DOTS
    // (decision 1A/8A). The dots are non-interactive — setup is forward-only so a
    // tap can't skip past a step that still needs to capture input. They reuse the
    // tour's dot styling (.wizard-dot / -on) for a consistent, finished feel.
    let stepIndicator;
    if (step >= 3) {
      const FRESH_STEPS = 4; // steps 3,4,5,6 → four dots
      const dotIndex = step - 3; // 0-based within the fresh path
      const dots = Array.from({ length: FRESH_STEPS }, (_, i) =>
        `<span class="wizard-dot${i === dotIndex ? ' wizard-dot-on' : ''}"></span>`
      ).join('');
      stepIndicator = `<div class="wizard-dots" aria-label="Step ${dotIndex + 1} of ${FRESH_STEPS}">${dots}</div>`;
    } else {
      stepIndicator = `<div class="wizard-steps">Step ${step}</div>`;
    }

    if (step === 1) {
      bodyHTML = `
        <div class="wizard-icon">👋</div>
        <h3 class="bulk-sheet-title">Welcome to PAT Test</h3>
        <p class="wizard-lead">A fast, fully-offline way to log portable appliance tests on site. Everything stays on this phone — no account, no signal needed.</p>
        <p class="wizard-lead">Let's get this device ready. It takes a couple of minutes, and nothing here is final — you can change any of it later.</p>
      `;
      footHTML = `
        <button class="btn-primary" data-action="wizard-next">Get started</button>
        ${skipBtn}
      `;
    } else if (step === 2) {
      bodyHTML = `
        <div class="wizard-icon">📲</div>
        <h3 class="bulk-sheet-title">Set up this device</h3>
        <p class="wizard-lead">Already got another phone set up how you like it? Bring its settings straight across. Starting from scratch? We'll walk you through it.</p>
        <input type="file" id="wizard-import-file" data-change-action="wizard-import-file" accept="application/json,.json" style="display:none">
      `;
      footHTML = `
        <button class="btn-primary" data-action="wizard-import">⬇ Import a setup file</button>
        <button class="btn-secondary" data-action="wizard-fresh">Start fresh</button>
        ${backBtn}
        ${skipBtn}
      `;
    } else if (step === 3) {
      bodyHTML = `
        <div class="wizard-icon">👤</div>
        <h3 class="bulk-sheet-title">Your details</h3>
        <p class="wizard-lead">These show up on your reports. Both are optional, and you can add or change them any time in Settings.</p>
        <label class="label">Your name (the engineer)</label>
        <input class="input" id="wizard-engineer" type="text" value="${escapeHTML(state.engineer || '')}" placeholder="e.g. Sam Taylor" autocomplete="name">
        <label class="label" style="margin-top:12px">Calibration date of your tester</label>
        <input class="input" id="wizard-caldate" type="date" value="${escapeHTML(state.calDate || '')}">
      `;
      footHTML = `
        <button class="btn-primary" data-action="wizard-next">Continue</button>
        ${backBtn}
        ${skipBtn}
      `;
    } else if (step === 4) {
      const logoPreview = rs.logo
        ? `<img class="wizard-logo-preview" src="${rs.logo}" alt="Company logo">
           <button class="btn-secondary" data-action="report-logo-remove">Remove logo</button>`
        : `<button class="btn-secondary" data-action="report-logo-pick">⬆ Add a logo (optional)</button>`;
      const themes = (typeof REPORT_COLOR_THEMES !== 'undefined' ? REPORT_COLOR_THEMES : [])
        .map(t => {
          const on = (rs.headerColor === t.header && rs.accentColor === t.accent) ? ' is-on' : '';
          return `<button class="wizard-theme${on}" data-action="wizard-theme" data-arg="${t.id}">
                    <span class="wizard-theme-swatch" style="background:${t.header}"></span>${escapeHTML(t.label)}
                  </button>`;
        }).join('');
      bodyHTML = `
        <div class="wizard-icon">🎨</div>
        <h3 class="bulk-sheet-title">Your report branding</h3>
        <p class="wizard-lead">This is what your clients see on every PDF report. All optional — leave it for now and set it up later if you'd rather.</p>
        <label class="label">Company name</label>
        <input class="input" id="wizard-company" type="text" value="${escapeHTML(rs.companyName || '')}" placeholder="e.g. Birchley PAT Services">
        <input type="file" id="report-logo-file" data-change-action="report-logo-file" accept="image/png,image/jpeg" style="display:none">
        <label class="label" style="margin-top:12px">Logo</label>
        ${logoPreview}
        <label class="label" style="margin-top:12px">Report colour</label>
        <div class="wizard-theme-row">${themes}</div>
      `;
      footHTML = `
        <button class="btn-primary" data-action="wizard-next">Continue</button>
        ${backBtn}
        ${skipBtn}
      `;
    } else if (step === 5) {
      const checked = state.wizardSeedDemo ? 'checked' : '';
      bodyHTML = `
        <div class="wizard-icon">📋</div>
        <h3 class="bulk-sheet-title">Add an example job?</h3>
        <p class="wizard-lead">Want to see how it all hangs together first? We can drop in one example session with a few test results, so you can explore Sessions, the Overview and a report straight away. It's clearly labelled, and you can delete it whenever you like.</p>
        <label class="label" style="display:flex;align-items:center;gap:10px;text-transform:none;font-size:15px;font-weight:600">
          <input type="checkbox" id="wizard-seed-demo" data-change-action="wizard-seed-demo" ${checked} style="width:auto">
          Add an example job
        </label>
      `;
      footHTML = `
        <button class="btn-primary" data-action="wizard-next">Continue</button>
        ${backBtn}
        ${skipBtn}
      `;
    } else {
      // v45: finish step restyled (decision 9A+B). The walkthrough is the clear
      // primary action with a one-line "what you'll see", "Go to the app" is a
      // clean secondary, and a muted line reassures you can replay it later.
      bodyHTML = `
        <div class="wizard-icon">🎉</div>
        <h3 class="bulk-sheet-title">You're all set</h3>
        <p class="wizard-lead">Your phone's ready to go. Start a new session whenever you're on a job — pick a location, tap an item type, then tap PASS or FAIL.</p>
        <div class="wizard-finish-tour">
          <p class="wizard-finish-tour-title">New here? Take the 30-second tour.</p>
          <p class="wizard-finish-tour-sub">A quick look at Sessions, logging, the Overview, reports and backups.</p>
          <button class="btn-primary" data-action="wizard-finish-tour">Show me around</button>
        </div>
      `;
      footHTML = `
        <button class="btn-secondary" data-action="wizard-finish">Go straight to the app</button>
        <p class="wizard-replay-note">You can run this tour again any time from Settings → About.</p>
        ${backBtn}
      `;
    }
    wizardModal = `
      <div class="modal-backdrop wizard-backdrop" style="z-index:300"></div>
      <div class="bulk-sheet wizard-sheet" style="z-index:301" role="dialog" aria-label="First-time setup">
        <div class="bulk-sheet-handle"></div>
        ${stepIndicator}
        <div class="wizard-body">${bodyHTML}</div>
        <div class="wizard-foot">${footHTML}</div>
      </div>
    `;
  }

  // v14: reopen warning modal — shown when the user taps an exported (clean or
  // modified) unlocked session on the Sessions list. Warns that editing means
  // re-exporting. Continue proceeds to open; Cancel stays on the list.
  let reopenWarnModal = '';
  if (state.exportWarnSessionId) {
    const ws = state.sessions.find(x => x.id === state.exportWarnSessionId);
    if (ws) {
      const wasModified = exportStatus(ws) === 'modified';
      const line = wasModified
        ? "You've already exported this session, and it's been edited since. If you make further changes you'll need to export it again."
        : "You've already exported this session. If you make changes you'll need to export it again.";
      reopenWarnModal = `
        <div class="modal-backdrop" style="z-index:300"></div>
        <div class="bulk-sheet" style="z-index:301" role="dialog" aria-label="Already exported">
          <div class="bulk-sheet-handle"></div>
          <div class="bulk-sheet-header">
            <span class="fail-close-spacer"></span>
            <h3 class="bulk-sheet-title">Already exported</h3>
            <button class="fail-close-btn" id="reopen-warn-cancel" data-action="reopen-cancel" aria-label="Cancel">×</button>
          </div>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:var(--text)">${escapeHTML(line)}</p>
          <div class="btn-row">
            <button class="btn-secondary" id="reopen-warn-cancel2" data-action="reopen-cancel">Cancel</button>
            <button class="btn-primary" id="reopen-warn-continue" data-action="reopen-continue">Open anyway</button>
          </div>
        </div>
      `;
    }
  }

  // v34: signature draw-pad bottom-sheet. Shown when state.signaturePadOpen.
  // The canvas pointer wiring is attached after innerHTML is set (see below) —
  // the markup just lays out the pad, a Clear and a Save (Save disabled until a
  // stroke is made), and a Cancel.
  let signaturePadModal = '';
  if (state.signaturePadOpen) {
    const saveDisabled = state.signaturePadHasInk ? '' : 'disabled';
    signaturePadModal = `
      <div class="modal-backdrop" style="z-index:300"></div>
      <div class="bulk-sheet" style="z-index:301" role="dialog" aria-label="Draw signature">
        <div class="bulk-sheet-handle"></div>
        <div class="bulk-sheet-header">
          <span class="fail-close-spacer"></span>
          <h3 class="bulk-sheet-title">Draw your signature</h3>
          <button class="fail-close-btn" data-action="signature-pad-cancel" aria-label="Cancel">×</button>
        </div>
        <p style="margin:0 0 10px;font-size:13px;color:var(--neutral-text)">Sign in the box below with your finger or a stylus.</p>
        <div class="sig-pad-wrap">
          <canvas id="sig-pad-canvas" class="sig-pad-canvas"></canvas>
          <span class="sig-pad-baseline"></span>
        </div>
        <div class="btn-row" style="margin-top:14px">
          <button class="btn-secondary" data-action="signature-pad-clear">Clear</button>
          <button class="btn-primary" data-action="signature-pad-save" ${saveDisabled}>Save signature</button>
        </div>
      </div>
    `;
  }

  const finalHTML = banner + html + migrationModal + welcomeModal + wizardModal + signaturePadModal + reopenWarnModal;
  app.innerHTML = finalHTML;
  // v24 (E4): record whether THIS render put any modal/sheet into the DOM, so the
  // next render knows whether the orphan-sweep above could find anything. Cheap
  // substring checks against the same classes the sweep targets — far cheaper
  // than a whole-document querySelectorAll, and only the screen HTML (`html`) plus
  // the three top-level modal strings can contain these.
  _lastRenderHadModal =
    finalHTML.indexOf('modal-backdrop') !== -1 ||
    finalHTML.indexOf('fail-sheet') !== -1 ||
    finalHTML.indexOf('bulk-sheet') !== -1;
  // Toggle body class for selection bar spacing
  if (state.view === 'overview' && state.selectionMode) {
    document.body.classList.add('has-selection-bar');
  } else {
    document.body.classList.remove('has-selection-bar');
  }
  // v12: previously toggled body.view-entry here for no-scroll layout.
  // v12.1: rolled back — the 100dvh + overflow:hidden approach caused issues
  // on some devices (notes textarea + keyboard pushing the PASS/FAIL row
  // off-screen, plus inconsistent dvh support). Defensive cleanup: strip the
  // class if it lingered from a previous v12 render, in case a hot-swap
  // mid-session leaves a stale body class.
  document.body.classList.remove('view-entry');
  bindFocusFields();
  if (state.signaturePadOpen) initSignaturePad();   // v34
  // v43: set up long-press on About title for cloud pages reveal
  if (state.view === 'settingsAbout') {
    const aboutTitle = document.getElementById('about-title');
    if (aboutTitle) {
      setupLongPress(aboutTitle, 2000, () => {
        state.cloudPagesRevealed = true;
        render();
      });
    }
  }
}

// v34: attach pointer drawing to the live signature-pad canvas. Created fresh on
// every render the pad is open, so this rebinds each time. Uses Pointer Events
// (one path for finger/stylus/mouse) and touch-action:none (set in CSS) so
// signing never scrolls the page — the key iOS PWA gotchas. Backing store is
// sized to the element's CSS box × devicePixelRatio (capped) for a crisp line;
// the exported PNG is downscaled again by storeSignatureFromSource.
function initSignaturePad() {
  const canvas = document.getElementById('sig-pad-canvas');
  if (!canvas || typeof canvas.getContext !== 'function') return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);   // cap at 2 to keep PNG small
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height || 160));
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const cx = canvas.getContext('2d');
  cx.scale(dpr, dpr);
  cx.lineWidth = 2.2;
  cx.lineCap = 'round';
  cx.lineJoin = 'round';
  cx.strokeStyle = '#111';

  let drawing = false;
  let lastX = 0, lastY = 0;
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = (e) => {
    e.preventDefault();
    drawing = true;
    const p = pos(e);
    lastX = p.x; lastY = p.y;
    // dot for a tap
    cx.beginPath();
    cx.arc(lastX, lastY, 1.1, 0, Math.PI * 2);
    cx.fillStyle = '#111';
    cx.fill();
    if (!state.signaturePadHasInk) {
      state.signaturePadHasInk = true;
      // enable the Save button without a full re-render (which would wipe the canvas)
      const saveBtn = document.querySelector('[data-action="signature-pad-save"]');
      if (saveBtn) saveBtn.removeAttribute('disabled');
    }
  };
  const move = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = pos(e);
    cx.beginPath();
    cx.moveTo(lastX, lastY);
    cx.lineTo(p.x, p.y);
    cx.stroke();
    lastX = p.x; lastY = p.y;
  };
  const end = (e) => { if (drawing) { e.preventDefault(); drawing = false; } };

  canvas.addEventListener('pointerdown', start);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', end);
}

// v34: clear the pad canvas in place (no re-render, so the bound handlers + sized
// backing store survive). Resets the ink flag and re-disables Save.
function clearSignaturePad() {
  const canvas = document.getElementById('sig-pad-canvas');
  if (canvas && typeof canvas.getContext === 'function') {
    const cx = canvas.getContext('2d');
    cx.clearRect(0, 0, canvas.width, canvas.height);
  }
  state.signaturePadHasInk = false;
  const saveBtn = document.querySelector('[data-action="signature-pad-save"]');
  if (saveBtn) saveBtn.setAttribute('disabled', '');
}

// v19 (efficiency item 4): fast path for logging on the entry screen.
//
// After a PASS or a Copy-last, the cursor advances to a fresh "new" item and the
// form is reset — but we're still on the entry screen, the header is unchanged,
// and crucially NO modal is open (neither saveItem nor copyLastResult opens one;
// only the FAIL flow does, and that still calls full render()). So instead of
// the full render() — which rebuilds five modal strings that are always empty
// here, runs a whole-document querySelectorAll body-sweep, and re-evaluates the
// update banner — we rebuild ONLY the entry screen's HTML into #app and rebind.
//
// This is behaviour-identical to render() for this specific transition:
//   • The flash overlay lives on <body> (position:fixed), untouched by replacing
//     #app's contents, so visual feedback is unaffected.
//   • renderEntry() already recomputes the progress row, asset/location/type
//     fields, quick-pick grid (incl. Smart Quick Pick ordering), notes block,
//     copy-last label + disabled state, and nav-row disabled states — i.e. every
//     part of the screen that changes after a log.
//   • bindFocusFields() is the same binding pass render() uses.
// If we are NOT on the entry screen for any reason, fall back to a full render()
// so there is never a path where this does something unexpected.
function refreshEntryAfterLog() {
  if (state.view !== 'entry') { render(); return; }
  const sess = activeSession();
  if (!sess) { render(); return; }
  // Defensive: keep the same body-class hygiene render() guarantees, minus the
  // overview selection bar (never relevant on the entry screen).
  document.body.classList.remove('has-selection-bar');
  document.body.classList.remove('view-entry');
  app.innerHTML = renderEntry();
  // v24 (E4): the entry screen never contains a modal/sheet, so a subsequent
  // render() has nothing to sweep. Keep the flag accurate.
  _lastRenderHadModal = false;
  bindFocusFields();
}
// v20: New Session Client / Site autocomplete. These replace the v19 native
// <datalist> pickers, which were unreliable in iOS PWA mode (frequently showed
// no options at all). They mirror the entry-screen location autocomplete: a
// tappable .suggestions list, filtered live by the typed text.
//
// Client suggestions: all saved client names, optionally filtered by the typed
// substring. An empty field shows the full list (so a tap reveals everything).
// Case-insensitive sort and filter. Capped at 6 to keep the list compact.
function computeNfClientSuggestions(query) {
  const q = String(query || '').trim().toLowerCase();
  const names = sortedClients().map(c => c.name);
  const matches = q ? names.filter(n => n.toLowerCase().includes(q)) : names;
  return matches.slice(0, 6);
}

// Site suggestions: if the typed Client matches a saved client, only that
// client's sites; otherwise every site (so the picker stays useful before a
// client is chosen — the v19 quirk, kept deliberately). De-duped by visible
// name, then filtered by the typed Site substring. Case-insensitive throughout.
function computeNfSiteSuggestions(query) {
  const typedClient = String(state.newForm.clientId || '').trim();
  const match = findClientByName(typedClient);
  const list = match ? sitesForClient(match.id) : state.sites.slice();
  const seen = new Set();
  const names = [];
  list.forEach(s => {
    const key = s.name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    names.push(s.name);
  });
  names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const q = String(query || '').trim().toLowerCase();
  const matches = q ? names.filter(n => n.toLowerCase().includes(q)) : names;
  return matches.slice(0, 6);
}

// v20: the suggestions list HTML for the New Session form. `field` is 'client'
// or 'site'; only renders when that field is the active one and has matches.
// Uses field-specific data-* attributes so the two click handlers never collide.
function nfSuggestionsHTML(field) {
  if (state.nfActiveField !== field || !state.showNfSuggestions) return '';
  if (!state.nfSuggestions.length) return '';
  const attr = field === 'client' ? 'data-nf-client-suggest' : 'data-nf-site-suggest';
  return `<div class="suggestions" id="nf-${field}-suggestions">
    ${state.nfSuggestions.map(s => `<button class="suggestion-item" ${attr}="${escapeHTML(s)}">${escapeHTML(s)}</button>`).join('')}
  </div>`;
}

// v32: shared empty-state block — a centred icon, a bold line, a muted line, and
// an optional primary action button. Used on the Sessions list, Overview,
// Clients and Reports screens so "nothing here yet" always looks intentional and
// points to the next step rather than showing a bare line of text.
function emptyStateHTML(icon, title, body, actionLabel, actionName) {
  const btn = (actionLabel && actionName)
    ? `<button class="btn-primary empty-state-action" data-action="${actionName}">+ ${escapeHTML(actionLabel)}</button>`
    : '';
  return `
    <div class="empty-state">
      <div class="empty-state-icon" aria-hidden="true">${icon}</div>
      <div class="empty-state-title">${escapeHTML(title)}</div>
      <p class="empty-state-body">${escapeHTML(body)}</p>
      ${btn}
    </div>`;
}

// v43: calibration warning banner for the Sessions screen. Shows ONLY when the
// engineer's tester calibration falls due within CAL_DUE_SOON_DAYS (30 days) or
// is already overdue. Otherwise returns '' (no banner) so a healthy cal date adds
// nothing to the screen. Tappable to jump to Settings → User to update the date.
function renderCalWarningBanner() {
  if (!state.calDue) return '';
  const dueDate = new Date(state.calDue);
  if (isNaN(dueDate.getTime())) return '';
  const today = new Date();
  const daysUntil = Math.ceil((dueDate - today) / (1000 * 3600 * 24));
  // Only warn within the 30-day window or when overdue. Healthy = no banner.
  if (daysUntil > CAL_DUE_SOON_DAYS) return '';

  let cls, label;
  if (daysUntil < 0) {
    cls = 'cal-overdue';
    label = `⚠ Tester calibration overdue (${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? '' : 's'} ago)`;
  } else {
    cls = 'cal-due-soon';
    label = `⚠ Tester calibration due in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`;
  }
  return `
    <div class="cal-banner ${cls}" role="status">
      <span class="cal-banner-text">${escapeHTML(label)}</span>
      <button class="cal-banner-action" data-action="edit-cal-date">Update</button>
    </div>
  `;
}

function renderSessions() {
  const nfError = state.newFormError ? `
      <p class="nf-error" role="alert">${escapeHTML(state.newFormError)}</p>
  ` : '';
  const newForm = state.newForm.show ? `
    <div class="card">
      <h2 class="h2">New session</h2>
      <label class="label">Client <span class="hint">(optional)</span></label>
      <div class="nf-input-wrap" id="nf-client-wrap">
        <input class="input" id="nf-client" value="${escapeHTML(state.newForm.clientId)}" placeholder="e.g. Acme Ltd" autocomplete="off">
        ${nfSuggestionsHTML('client')}
      </div>
      <label class="label">Site <span class="hint">(optional)</span></label>
      <div class="nf-input-wrap" id="nf-site-wrap">
        <input class="input" id="nf-site" value="${escapeHTML(state.newForm.site)}" placeholder="e.g. Unit 4, Head Office" autocomplete="off">
        ${nfSuggestionsHTML('site')}
      </div>
      <p class="muted nf-hint">Enter a client, a site, or both — at least one. Type new ones to save them for next time, or pick from your saved list. Manage them under Settings → Clients.</p>
      ${nfError}
      <label class="label">Engineer</label>
      <input class="input" id="nf-engineer" value="${escapeHTML(state.newForm.engineer || state.engineer)}" placeholder="Your name">
      <label class="label">Session name <span class="hint">(optional)</span></label>
      <input class="input" id="nf-name" data-input-action="nf-name" value="${escapeHTML(state.newForm.name)}" placeholder="e.g. Annual test 2026">
      <label class="label">Asset number prefix <span class="hint">(optional, e.g. BT)</span></label>
      <input class="input" id="nf-prefix" data-input-action="nf-prefix" value="${escapeHTML(state.newForm.prefix)}" placeholder="Leave blank for none">
      <label class="label">Starting asset number</label>
      <input class="input" id="nf-start" data-input-action="nf-start" type="number" inputmode="numeric" value="${escapeHTML(state.newForm.startNo)}">
      <div class="btn-row">
        <button class="btn-secondary" id="nf-cancel" data-action="nf-cancel">Cancel</button>
        <button class="btn-primary" id="nf-submit" data-action="nf-submit">Start</button>
      </div>
    </div>
  ` : `
    <div class="sessions-actions-row">
      <button class="btn-primary" id="new-session-btn" data-action="new-session">+ New session</button>
      <button class="btn-secondary" id="import-session-btn" data-action="import-session">⬆ Import (.csv)</button>
    </div>
    <input type="file" id="import-session-file" data-change-action="import-file" accept=".csv,text/csv" style="display:none">
  `;

  // v10: search bar above the sort row. Hidden when there are no sessions OR
  // when the new-session form is open (which dominates the screen anyway).
  // The result-count subtitle gives the user feedback when their query thins
  // out the list — important because the empty-state message otherwise looks
  // like a bug if you don't realise the search is filtering. The dynamic
  // portion (count + sort + list) is wrapped in #sessions-list-area so we can
  // refresh it on every keystroke without re-rendering the input itself,
  // which would lose focus on iOS mid-typing.
  const hasSessions = state.sessions.length > 0;
  const showSearch = hasSessions && !state.newForm.show;
  const searchRow = showSearch ? `
    <div class="sessions-search-row">
      <input type="search" class="search-input" id="sessions-search" data-input-action="sessions-search" placeholder="Search sessions and items…" value="${escapeHTML(state.sessionsSearchQuery)}" autocomplete="off">
    </div>
  ` : '';
  const sessionsListArea = `<div id="sessions-list-area">${renderSessionsListAreaHTML()}</div>`;

  // v10: Import conflict dialog — shown when the user picks a CSV whose
  // Site+Date matches an existing session. Three options stacked vertically
  // because the consequences of each differ enough that horizontal grouping
  // would invite mis-tap.
  const importConflict = state.importDialog.conflictOpen ? renderImportConflictModal() : '';
  // v10: Import summary dialog — shown after commit, lists skipped rows (if any)
  // and confirms what happened.
  const importSummary = state.importDialog.summaryOpen ? renderImportSummaryModal() : '';

  // v11: backup reminder banner — sits inline at the top of the Sessions screen
  // when no JSON backup has been exported in the last BACKUP_REMINDER_DAYS
  // days. Two actions: "Export now" runs downloadBackup() (which also stamps
  // lastBackupAt so the banner clears), and "Remind me later" snoozes for 24h.
  // The × control is equivalent to the snooze. Hidden when the new-session
  // form is open or the sessions list is empty.
  const backupBanner = shouldShowBackupReminder() ? renderBackupReminderBanner() : '';

  // v43: tester calibration warning — only present when due within 30 days or overdue.
  const calWarning = renderCalWarningBanner();

  return `
    <div class="screen">
      <header class="header">
        <h1 class="h1">PAT Sessions</h1>
        ${state.reportSettings.enabled ? '<button class="icon-btn" id="reports-btn" data-action="open-reports" aria-label="Reports">📄</button>' : ''}
        <button class="icon-btn" id="settings-btn" data-action="open-settings" aria-label="Settings">⚙</button>
      </header>
      ${calWarning}
      ${backupBanner}
      ${newForm}
      ${searchRow}
      ${sessionsListArea}
      ${importConflict}
      ${importSummary}
    </div>
  `;
}

// v11: the backup-reminder banner body. Shown by renderSessions() above when
// shouldShowBackupReminder() returns true. The message adapts based on
// whether the user has ever backed up:
//   • Never → "You haven't backed up yet. Export a copy to keep your data safe."
//   • Stale → "It's been N days since your last backup."
function renderBackupReminderBanner() {
  let msg;
  if (!state.lastBackupAt) {
    msg = "You haven't exported a backup yet.";
  } else {
    const lastMs = Date.parse(state.lastBackupAt);
    const days = Math.floor((Date.now() - lastMs) / (1000 * 3600 * 24));
    msg = `It's been ${days} day${days === 1 ? '' : 's'} since your last backup.`;
  }
  return `
    <div class="backup-banner" role="status">
      <div class="backup-banner-body">
        <div class="backup-banner-text">${escapeHTML(msg)}</div>
        <div class="backup-banner-actions">
          <button class="backup-banner-action primary" id="backup-banner-export" data-action="backup-banner-export">Export now</button>
          <button class="backup-banner-action" id="backup-banner-later" data-action="backup-banner-later">Remind me later</button>
        </div>
      </div>
      <button class="backup-banner-dismiss" id="backup-banner-dismiss" data-action="backup-banner-dismiss" aria-label="Dismiss">×</button>
    </div>
  `;
}

// v10: The dynamic portion of the Sessions screen — count + sort + list. Built
// as a separate function so we can refresh just this region on every keystroke
// in the search input without re-rendering the input itself (which would lose
// focus + keyboard on iOS).
function renderSessionsListAreaHTML() {
  const sortedAll = sortedSessions();
  const queryTrimmed = state.sessionsSearchQuery.trim();

  // v15: control filters (Status + Lock) apply ONLY when not searching — an
  // active search dominates the list, and the sort/filter controls are hidden
  // in that mode anyway. When searching, the search runs over the full set.
  const filtersActive = !queryTrimmed && (state.sessionFilter !== 'all' || state.lockFilter !== 'all');
  const controlFiltered = queryTrimmed
    ? sortedAll
    : sortedAll.filter(sessionMatchesControlFilters);
  const filtered = filteredSessions(controlFiltered, state.sessionsSearchQuery);

  const countHTML = queryTrimmed
    ? `<span class="sessions-search-count">${filtered.length} of ${sortedAll.length} session${sortedAll.length === 1 ? '' : 's'} match</span>`
    : '';

  // v15: when a control filter is narrowing the list (and we're not searching),
  // show an "X of Y shown" line so a filtered list never looks like data loss.
  const filterCountHTML = (filtersActive && sortedAll.length > 0)
    ? `<span class="sessions-search-count">${controlFiltered.length} of ${sortedAll.length} session${sortedAll.length === 1 ? '' : 's'} shown</span>`
    : '';

  // v14/v15: "N sessions not yet exported" nudge — now a tappable control that
  // bulk-exports every not-yet-cleanly-exported session (status 'none' or
  // 'modified') in one action. Count is global (independent of the active
  // filter view). Hidden when there are none, the list is empty, or while
  // searching (the search count takes the slot).
  const unexported = unexportedSessionCount();
  const nudgeHTML = (!queryTrimmed && sortedAll.length > 0 && unexported > 0)
    ? `<button type="button" class="export-nudge" id="bulk-export-btn" data-action="bulk-export-unexported" aria-label="Export ${unexported} not-yet-exported session${unexported === 1 ? '' : 's'}">
        <span class="export-nudge-text">${unexported} session${unexported === 1 ? '' : 's'} not yet exported</span>
        <span class="export-nudge-cta">${SHARE_ICON_SVG} Export all</span>
      </button>`
    : '';

  // Sort + filters: only show when there's >1 session AND no active search
  // (the search-result subtitle becomes the more useful contextual cue there).
  const controls = sortedAll.length > 1 && !queryTrimmed ? `
    <div class="list-controls">
      <label class="control-field">
        <span class="control-label">Sort</span>
        <select id="sort-select" class="sort-select" data-change-action="sessions-sort">
          <option value="date_desc"${state.sort === 'date_desc' ? ' selected' : ''}>Date (newest)</option>
          <option value="date_asc"${state.sort === 'date_asc' ? ' selected' : ''}>Date (oldest)</option>
          <option value="name_asc"${state.sort === 'name_asc' ? ' selected' : ''}>Name (A–Z)</option>
          <option value="name_desc"${state.sort === 'name_desc' ? ' selected' : ''}>Name (Z–A)</option>
        </select>
      </label>
      <label class="control-field">
        <span class="control-label">Status</span>
        <select id="status-filter" class="sort-select" data-change-action="status-filter">
          <option value="all"${state.sessionFilter === 'all' ? ' selected' : ''}>All</option>
          <option value="unexported"${state.sessionFilter === 'unexported' ? ' selected' : ''}>Not exported</option>
          <option value="exported"${state.sessionFilter === 'exported' ? ' selected' : ''}>Exported</option>
          <option value="modified"${state.sessionFilter === 'modified' ? ' selected' : ''}>Modified since</option>
        </select>
      </label>
      <label class="control-field">
        <span class="control-label">Lock</span>
        <select id="lock-filter" class="sort-select" data-change-action="lock-filter">
          <option value="all"${state.lockFilter === 'all' ? ' selected' : ''}>All</option>
          <option value="unlocked"${state.lockFilter === 'unlocked' ? ' selected' : ''}>Unlocked</option>
          <option value="locked"${state.lockFilter === 'locked' ? ' selected' : ''}>Locked</option>
        </select>
      </label>
    </div>
  ` : '';

  let list;
  if (sortedAll.length === 0 && !state.newForm.show) {
    list = emptyStateHTML('📋', 'No sessions yet',
      'Start logging appliance tests and they\'ll appear here.',
      'Start your first session', 'new-session');
  } else if (queryTrimmed && filtered.length === 0) {
    list = `<p class="muted">No sessions or items match "${escapeHTML(queryTrimmed)}".</p>`;
  } else if (!queryTrimmed && sortedAll.length > 0 && filtered.length === 0) {
    // v15: there ARE sessions, but the active filters hid them all.
    list = `<p class="muted">No sessions match the current filters.</p>
      <button type="button" class="btn-tertiary" id="clear-filters-btn" data-action="clear-session-filters">Show all sessions</button>`;
  } else {
    list = filtered.map(({ session: s, matchedItemIndex, itemMatchCount }) => {
      const passes = s.items.filter(i => i.result === 'pass').length;
      const fails = s.items.filter(i => i.result === 'fail').length;
      // v8: subtle 🔒 prefix on locked sessions so they're easy to spot in the list.
      const lockMark = s.locked ? '<span class="session-lock" title="Locked">🔒</span>' : '';
      // v14: export-status badge in the meta row. 'exported' → ✓ Exported;
      // 'modified' → ✓✎ Modified since export; 'none' → no badge.
      const xStatus = exportStatus(s);
      const exportBadge = xStatus === 'exported'
        ? '<span class="export-badge exported" title="Exported">✓ Exported</span>'
        : (xStatus === 'modified'
            ? '<span class="export-badge modified" title="Edited since last export">✓✎ Modified since export</span>'
            : '');
      // v10: when the query only hit item-level fields, show how many items matched
      // and (via data-open-at) jump straight to the first match.
      const itemBadge = matchedItemIndex !== -1
        ? `<div><span class="session-match-badge">${itemMatchCount} match${itemMatchCount === 1 ? '' : 'es'} in items</span></div>`
        : '';
      const openAttr = matchedItemIndex !== -1
        ? `data-action="open-session" data-arg="${s.id}" data-open="${s.id}" data-open-at="${matchedItemIndex}"`
        : `data-action="open-session" data-arg="${s.id}" data-open="${s.id}"`;
      return `
        <div class="session-card${s.locked ? ' locked' : ''}">
          <div class="session-info" ${openAttr}>
            <div class="session-title">${lockMark}${escapeHTML(s.site || s.name)}</div>
            <div class="session-meta">${formatDate(s.date)} · ${s.items.length} items · <span class="pass-text">${passes} pass</span> · <span class="fail-text">${fails} fail</span></div>
            ${exportBadge ? `<div class="session-export-row">${exportBadge}</div>` : ''}
            ${itemBadge}
          </div>
          <button class="icon-btn-sm" data-action="copy-session" data-arg="${s.id}" aria-label="Copy CSV" title="Copy CSV">📋</button>
          <button class="icon-btn-sm" data-action="export-session" data-arg="${s.id}" data-export="${s.id}" aria-label="Share CSV">${SHARE_ICON_SVG}</button>
          <button class="icon-btn-sm" data-action="delete-session" data-arg="${s.id}" data-delete-session="${s.id}" aria-label="Delete">🗑</button>
        </div>
      `;
    }).join('');
  }

  return `${nudgeHTML}${countHTML}${filterCountHTML}${controls}<div>${list}</div>`;
}

// v10: Partial refresh used by the sessions-search oninput. Replaces only
// #sessions-list-area, leaves the search input intact. v29: row/select events are
// fully delegated (dispatch.js) so there is nothing to rebind after the swap.
function refreshSessionsListAreaOnly() {
  const wrap = document.getElementById('sessions-list-area');
  if (!wrap) return;
  wrap.innerHTML = renderSessionsListAreaHTML();
}

// v32: re-render only the settings hub body (search results / category list) so
// the search box keeps focus while typing.
function refreshSettingsHubBodyOnly() {
  const wrap = document.getElementById('settings-hub-body');
  if (!wrap) return;
  wrap.innerHTML = renderSettingsHubBodyHTML();
}

// v10: Conflict dialog body. Sits above the sessions list in a bulk-sheet.
function renderImportConflictModal() {
  const incoming = state.importDialog.pendingSession;
  if (!incoming) return '';
  const existing = state.sessions.find(s => s.id === state.importDialog.conflictExistingId);
  const existingItemCount = existing && Array.isArray(existing.items) ? existing.items.length : 0;
  return `
    <div class="modal-backdrop" id="import-conflict-backdrop" data-action="import-conflict-cancel" style="z-index:300"></div>
    <div class="bulk-sheet" style="z-index:301" role="dialog" aria-label="Session already exists">
      <div class="bulk-sheet-handle"></div>
      <div class="bulk-sheet-header">
        <span class="fail-close-spacer"></span>
        <h3 class="bulk-sheet-title">Session already exists</h3>
        <button class="fail-close-btn" id="import-conflict-cancel" data-action="import-conflict-cancel" aria-label="Cancel">×</button>
      </div>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:var(--text)">
        A session for <strong>${escapeHTML(incoming.site)}</strong> on <strong>${escapeHTML(formatDate(incoming.date))}</strong> already exists with ${existingItemCount} item${existingItemCount === 1 ? '' : 's'}.
      </p>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:var(--text)">
        The imported file has ${incoming.items.length} item${incoming.items.length === 1 ? '' : 's'}. How would you like to import them?
      </p>
      <div class="import-conflict-actions">
        <button class="btn-primary" id="import-conflict-duplicate" data-action="import-conflict-duplicate">Import as duplicate (new session)</button>
        <button class="btn-secondary" id="import-conflict-merge" data-action="import-conflict-merge">Merge into existing session</button>
        <button class="btn-tertiary" id="import-conflict-cancel2" data-action="import-conflict-cancel">Cancel import</button>
      </div>
    </div>
  `;
}

// v10: Summary dialog body. Confirms what was imported and lists any rows that
// were skipped due to validation errors. Doubles as the success confirmation
// when nothing was skipped (skipped.length === 0).
function renderImportSummaryModal() {
  const sum = state.importDialog.summary;
  if (!sum) return '';
  const modeText = sum.mode === 'merge'
    ? `Merged ${sum.itemCount} item${sum.itemCount === 1 ? '' : 's'} into <strong>${escapeHTML(sum.sessionName)}</strong>.`
    : (sum.mode === 'duplicate'
        ? `Imported ${sum.itemCount} item${sum.itemCount === 1 ? '' : 's'} as a new duplicate of <strong>${escapeHTML(sum.sessionName)}</strong>.`
        : `Imported ${sum.itemCount} item${sum.itemCount === 1 ? '' : 's'} into new session <strong>${escapeHTML(sum.sessionName)}</strong>.`);
  const skippedBlock = (sum.skipped && sum.skipped.length > 0) ? `
    <p style="margin:12px 0 4px;font-size:14px;font-weight:600;color:var(--text)">
      ${sum.skipped.length} row${sum.skipped.length === 1 ? '' : 's'} skipped:
    </p>
    <div class="import-summary-list">
      <ul>
        ${sum.skipped.map(s => `<li>Row ${s.row}: ${escapeHTML(s.reason)}</li>`).join('')}
      </ul>
    </div>
  ` : '';
  return `
    <div class="modal-backdrop" id="import-summary-backdrop" data-action="import-summary-done" style="z-index:300"></div>
    <div class="bulk-sheet" style="z-index:301" role="dialog" aria-label="Import summary">
      <div class="bulk-sheet-handle"></div>
      <div class="bulk-sheet-header">
        <span class="fail-close-spacer"></span>
        <h3 class="bulk-sheet-title">Import complete</h3>
        <button class="fail-close-btn" id="import-summary-close" data-action="import-summary-done" aria-label="Close">×</button>
      </div>
      <p style="margin:0;font-size:14px;line-height:1.5;color:var(--text)">${modeText}</p>
      ${skippedBlock}
      <button class="btn-primary" id="import-summary-done" data-action="import-summary-done" style="margin-top:14px">Done</button>
    </div>
  `;
}

function renderEntry() {
  const sess = activeSession();
  if (!sess) { state.view = 'sessions'; return renderSessions(); }
  const isExisting = state.cursor < sess.items.length;
  const existing = isExisting ? sess.items[state.cursor] : null;
  const hasLast = sess.items.length > 0;

  // v12: capture and immediately clear the search-jump cursor. The CSS
  // keyframe animation runs once on mount, so we only want to emit the
  // data-search-jump attribute on this single render — subsequent renders
  // (typing, prev/next, etc.) must not re-trigger the flash. Clearing in
  // render rather than bindEvents keeps the timing tight: the attribute
  // is present in the very HTML the browser paints, the animation fires,
  // and state is already cleared by the time the user can interact.
  const flashSearchJump = (state.searchJumpCursor !== null && state.searchJumpCursor === state.cursor);
  state.searchJumpCursor = null;

  // v18: Smart Quick Pick reorders the buttons so the types most often logged at
  // the current Location come first. When the feature is off (default), the
  // location is blank, or nothing matches, this returns state.itemTypes
  // unchanged — same buttons, same order, same count as before. It only ever
  // permutes; it never adds, removes, or hides a button.
  // v20: read the FROZEN row (cached per location). It only recomputes when the
  // confirmed location changes — logging a PASS no longer reshuffles buttons.
  const orderedTypes = sqpRowForLocation(state.itemTypes, state.form.location);
  const quickButtons = orderedTypes.map(t => `
    <button class="quick-btn ${state.form.itemType === t ? 'active' : ''}" data-action="quick-pick" data-arg="${escapeHTML(t)}" data-type="${escapeHTML(t)}">${escapeHTML(t)}</button>
  `).join('');

  const notesBlock = state.form.showNotes
    ? `<label class="label">Notes</label>
       <textarea class="textarea" id="f-notes" data-input-action="f-notes" rows="2" placeholder="Optional">${escapeHTML(state.form.notes)}</textarea>`
    : `<button class="notes-toggle" id="show-notes-btn" data-action="show-notes">✎ Add note</button>`;

  const resultBadge = isExisting && existing.result
    ? `<span class="result-badge ${existing.result}">· ${capitalise(existing.result).toUpperCase()}</span>`
    : '';

  const suggestionsBlock = (state.showSuggestions && state.suggestions.length > 0)
    ? `<div class="suggestions">
        ${state.suggestions.map(s => `<button class="suggestion-item" data-suggest="${escapeHTML(s)}">${escapeHTML(s)}</button>`).join('')}
      </div>`
    : '';

  // v10: location autocomplete — same .suggestions block as item-type, but the
  // entries come from the current session's existing item locations only and
  // use a distinct data-* attribute so the click handler doesn't collide with
  // the item-type one.
  const locationSuggestionsBlock = (state.showLocationSuggestions && state.locationSuggestions.length > 0)
    ? `<div class="suggestions" id="location-suggestions">
        ${state.locationSuggestions.map(s => `<button class="suggestion-item" data-loc-suggest="${escapeHTML(s)}">${escapeHTML(s)}</button>`).join('')}
      </div>`
    : '';

  const lastInfo = hasLast
    ? ` (${escapeHTML(sess.items[sess.items.length - 1].itemType)} · ${capitalise(sess.items[sess.items.length - 1].result)})`
    : '';

  let failSheetInner = '';
  if (state.failModalStage === 'reasons') {
    failSheetInner = `
      <div class="fail-reasons-grid">
        ${state.failReasons.map(r => `
          <button class="fail-reason-btn" data-action="fail-reason" data-arg="${escapeHTML(r)}" data-reason="${escapeHTML(r)}">${escapeHTML(r)}</button>
        `).join('')}
      </div>
      <button class="fail-other-btn" id="fail-other-btn" data-action="fail-other">Other…</button>
    `;
  } else {
    failSheetInner = `
      <button class="fail-other-back" id="fail-other-back" data-action="fail-other-back">‹ Back to reasons</button>
      <textarea class="fail-other-input" id="fail-other-input" data-input-action="fail-other" placeholder="Type reason…" rows="3">${escapeHTML(state.failOtherText)}</textarea>
      <button class="fail-other-save" id="fail-other-save" data-action="fail-other-save">Save fail</button>
    `;
  }

  const failModal = state.failModalOpen ? `
    <div class="modal-backdrop" id="fail-backdrop" data-action="fail-cancel"></div>
    <div class="fail-sheet" role="dialog" aria-label="Why did it fail?">
      <div class="fail-sheet-handle"></div>
      <div class="fail-sheet-header">
        <span class="fail-close-spacer"></span>
        <h3 class="fail-sheet-title">Why did it fail?</h3>
        <button class="fail-close-btn" id="fail-close" data-action="fail-cancel" aria-label="Cancel">×</button>
      </div>
      ${failSheetInner}
    </div>
  ` : '';

  const carriedHint = (!isExisting && state.form.location)
    ? '<span class="hint">(carried from last)</span>'
    : '';

  const progressRow = `
    <div class="progress-row"${flashSearchJump ? ' data-search-jump="1"' : ''}>
      <div class="progress">Item ${state.cursor + 1} ${isExisting ? `of ${sess.items.length}` : '(new)'}${resultBadge}</div>
      ${isExisting ? `<button class="del-icon-top" id="del-item-btn" data-action="delete-current-item" aria-label="Delete item" title="Delete item">🗑</button>` : ''}
    </div>
  `;

  // v8: lock banner sits between the header and the form. When locked, save actions
  // (Pass / Fail / Copy last) are disabled. Editing existing items via the overview
  // is still possible — the lock is a soft guard against accidental new entries.
  const isLocked = !!sess.locked;
  const lockBanner = isLocked ? `
    <div class="lock-banner" role="status">
      <span class="lock-banner-text">🔒 Session locked — no new entries</span>
      <button class="lock-banner-action" id="lock-unlock-btn" data-action="unlock-session">Unlock</button>
    </div>
  ` : '';

  const passFailDisabled = isLocked ? 'disabled' : '';
  const copyDisabled = (!hasLast || isLocked) ? 'disabled' : '';

  // v16: Multi Pick. Full-width button at the very bottom of the entry screen,
  // shown only when the feature is enabled in Settings. Disabled (like Pass/Fail)
  // when the session is locked. Tapping opens a bottom sheet listing the
  // configured multi-picks; each logs its sequence as PASS in one go.
  // NOTE: must be built AFTER `isLocked` is declared above — the enabled branch
  // references it, and a `const` read before its declaration is a TDZ error.
  const mpEnabled = !!(state.multiPick && state.multiPick.enabled);
  const multiPickButton = mpEnabled ? `
    <button class="multipick-btn" id="multipick-btn" data-action="multipick-open" ${isLocked ? 'disabled' : ''}>
      ＋ Multi Pick
    </button>
  ` : '';

  let multiPickSheet = '';
  if (state.multiPickSheetOpen) {
    const slots = activeMultiPickSlots();
    const body = slots.length ? `
      <div class="multipick-list">
        ${slots.map((s, i) => {
          const seqText = s.items.join(' · ');
          const hasName = !!s.name;
          const main = hasName ? s.name : seqText;
          const sub = hasName ? seqText : `${s.items.length} item${s.items.length === 1 ? '' : 's'}`;
          return `
            <button class="multipick-option" data-action="multipick-fire" data-arg="${i}" data-mp-index="${i}">
              <span class="multipick-option-name">${escapeHTML(main)}</span>
              <span class="multipick-option-seq">${escapeHTML(sub)}</span>
            </button>
          `;
        }).join('')}
      </div>
    ` : `
      <p class="multipick-empty">No multi-picks set up yet. Add them in Settings → Multi Pick.</p>
    `;
    multiPickSheet = `
      <div class="modal-backdrop" id="multipick-backdrop" data-action="multipick-close"></div>
      <div class="fail-sheet multipick-sheet" role="dialog" aria-label="Multi Pick">
        <div class="fail-sheet-handle"></div>
        <div class="fail-sheet-header">
          <span class="fail-close-spacer"></span>
          <h3 class="fail-sheet-title">Multi Pick</h3>
          <button class="fail-close-btn" id="multipick-close" data-action="multipick-close" aria-label="Cancel">×</button>
        </div>
        <p class="multipick-sheet-hint">Each adds its items as a PASS, in order, using the current location.</p>
        ${body}
      </div>
    `;
  }

  return `
    <div class="screen">
      <header class="header-row">
        <button class="icon-btn" id="sessions-btn" data-action="go-sessions" aria-label="Back to sessions">‹</button>
        <div class="site-name">${escapeHTML(sess.site || sess.name)}</div>
        <button class="icon-btn" id="overview-btn" data-action="go-overview" aria-label="Overview">▦</button>
      </header>

      ${lockBanner}
      ${progressRow}

      <label class="label">Asset number</label>
      <input class="input-big" id="f-asset" data-input-action="f-asset" value="${escapeHTML(state.form.assetNo)}">

      <label class="label">Location ${carriedHint}</label>
      <div class="location-input-wrap">
        <input class="input-big" id="f-location" value="${escapeHTML(state.form.location)}" placeholder="e.g. Office 1">
        ${locationSuggestionsBlock}
      </div>

      <label class="label">Item type</label>
      <div class="quick-grid">${quickButtons}</div>
      <div class="custom-type-wrap">
        <input class="input" id="f-type" value="${escapeHTML(state.form.itemType)}" placeholder="…or type custom" autocomplete="off" style="margin-top:8px">
        ${suggestionsBlock}
      </div>

      ${notesBlock}

      <div class="pass-fail-row">
        <button class="pass-btn" id="pass-btn" data-action="log-pass" ${passFailDisabled}><span class="icon">✓</span>PASS</button>
        <button class="fail-btn" id="fail-btn" data-action="log-fail" ${passFailDisabled}><span class="icon">✗</span>FAIL</button>
      </div>

      <button class="copy-last-btn" id="copy-last-btn" data-action="copy-last" ${copyDisabled}>
        ⎘ Copy last result${lastInfo}
      </button>

      <div class="nav-row">
        <button class="nav-btn" id="prev-btn" data-action="cursor-prev" ${state.cursor === 0 ? 'disabled' : ''}>‹ Prev</button>
        <button class="nav-btn" id="skip-new-btn" data-action="skip-new" ${!isExisting ? 'disabled' : ''}>⏭ New</button>
        <button class="nav-btn" id="next-btn" data-action="cursor-next" ${state.cursor >= sess.items.length ? 'disabled' : ''}>Next ›</button>
      </div>

      ${multiPickButton}

      ${failModal}
      ${multiPickSheet}
    </div>
  `;
}

function computeVisibleOverviewItems(sess) {
  const q = state.searchQuery.trim().toLowerCase();
  return sess.items
    .map((it, i) => ({ it, i }))
    .filter(x => state.showFailsOnly ? x.it.result === 'fail' : true)
    .filter(x => {
      if (!q) return true;
      const it = x.it;
      return (it.assetNo || '').toLowerCase().includes(q)
          || (it.location || '').toLowerCase().includes(q)
          || (it.itemType || '').toLowerCase().includes(q)
          || (it.notes || '').toLowerCase().includes(q);
    });
}

function renderOverviewBodyHTML(sess) {
  const visible = computeVisibleOverviewItems(sess);
  if (visible.length === 0) {
    if (state.searchQuery.trim()) return `<p class="muted">No items match your search.</p>`;
    if (state.showFailsOnly) return `<p class="muted">No fails in this session.</p>`;
    // Genuinely empty session → rich empty state. No action button: the entry
    // controls to log the first item are right there on the screen.
    return emptyStateHTML('⚡', 'No items logged yet',
      'Use the item buttons to log your first test for this session.');
  }
  const sel = state.selectionMode;
  const checkColHead = sel ? `<th class="th"></th>` : '';
  return `<div class="table-wrap">
    <table class="table">
      <thead><tr>
        ${checkColHead}
        <th class="th">#</th><th class="th">Location</th><th class="th">Item</th><th class="th">Result</th><th class="th"></th>
      </tr></thead>
      <tbody>
        ${visible.map(({ it, i }) => {
          const checked = sel && state.selectedIndices.includes(i);
          const checkCol = sel
            ? `<td class="td td-check"><input type="checkbox" data-change-action="row-select" data-arg="${i}" ${checked ? 'checked' : ''}></td>`
            : '';
          const actionCol = sel
            ? `<td class="td td-action"></td>`
            : `<td class="td td-action" data-action="delete-item" data-arg="${i}" data-del-item="${i}">🗑</td>`;
          const rowAttr = sel ? `data-action="row-toggle" data-arg="${i}" data-row-toggle="${i}"` : `data-action="jump-to-item" data-arg="${i}" data-jump="${i}"`;
          const rowClass = sel && checked ? 'tr selected' : 'tr';
          // v17: when timestamps are on, show HH:MM subtly beneath the item
          // type. Items logged before the feature have no ts → no line, so the
          // column doesn't get a stray blank gap.
          const timeLine = (state.timestampsEnabled && it.ts)
            ? `<div class="item-time">${escapeHTML(formatTimeShort(it.ts))}</div>`
            : '';
          return `
            <tr class="${rowClass}" ${rowAttr}>
              ${checkCol}
              <td class="td">${escapeHTML(it.assetNo)}</td>
              <td class="td">${escapeHTML(it.location)}</td>
              <td class="td">${escapeHTML(it.itemType)}${timeLine}</td>
              <td class="td td-result ${it.result || ''}">${capitalise(it.result || '')}</td>
              ${actionCol}
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

function renderOverview() {
  const sess = activeSession();
  if (!sess) { state.view = 'sessions'; return renderSessions(); }
  const passes = sess.items.filter(i => i.result === 'pass').length;
  const fails = sess.items.filter(i => i.result === 'fail').length;

  const filterRow = sess.items.length > 0 ? `
    <div class="overview-filters">
      <input type="search" class="search-input" id="overview-search" data-input-action="overview-search" placeholder="Search asset, location, item, notes…" value="${escapeHTML(state.searchQuery)}" autocomplete="off">
      <label class="filter-toggle">
        <input type="checkbox" id="fails-only-toggle" data-change-action="fails-only" ${state.showFailsOnly ? 'checked' : ''}>
        <span>Show fails only</span>
      </label>
    </div>
  ` : '';

  // Header changes in selection mode
  let header;
  if (state.selectionMode) {
    const n = state.selectedIndices.length;
    header = `
      <header class="header-row">
        <button class="icon-btn" id="cancel-selection-btn" data-action="cancel-selection" aria-label="Cancel selection">✕</button>
        <div class="site-name">${n} selected</div>
        <span style="width:40px"></span>
      </header>
    `;
  } else {
    header = `
      <header class="header-row">
        <button class="icon-btn" id="back-btn" data-action="overview-back" aria-label="Back">‹</button>
        <div class="site-name">Overview</div>
        <div class="header-actions">
          ${state.reportSettings.enabled ? `<button class="icon-btn" id="produce-report-btn" data-action="produce-report" data-arg="${sess.id}" aria-label="Produce report" title="Produce report">📄</button>` : ''}
          <button class="icon-btn" id="copy-btn" data-action="copy-current" aria-label="Copy CSV" title="Copy CSV">📋</button>
          <button class="icon-btn" id="export-btn" data-action="export-current" aria-label="Share CSV">${SHARE_ICON_SVG}</button>
        </div>
      </header>
    `;
  }

  // v37: Select items + Session settings moved out of the cramped header icon
  // cluster into two clear text buttons side by side beneath it (the ☑ and ✎
  // icons were too similar and confused people). Hidden in selection mode and on
  // a session with no items (nothing to select / the screen is empty).
  const actionRow = (!state.selectionMode) ? `
    <div class="overview-action-row">
      ${sess.items.length > 0 ? `<button class="overview-action-btn" id="select-mode-btn" data-action="enter-selection">Select items</button>` : ''}
      <button class="overview-action-btn" id="edit-session-btn" data-action="edit-session">Session settings</button>
    </div>
  ` : '';

  const selectAllRow = state.selectionMode ? `
    <div class="select-all-row">
      <button id="select-all-visible-btn" data-action="select-all-visible">Select all visible</button>
      <button id="clear-selection-btn" data-action="clear-selection">Clear</button>
    </div>
  ` : '';

  // v11: selection bar now shows "Edit selected ▾" instead of "Change location"
  // directly. Tapping it opens the bulk-edit menu sheet with four options:
  // Location, Type, Notes, Delete. The location flow still uses the existing
  // v10 bulkLocationDialogOpen path so we don't regress that codepath; the
  // other three are new and live entirely in state.bulkEdit.
  const selectionBar = state.selectionMode ? `
    <div class="selection-bar">
      <span class="selection-bar-count">${state.selectedIndices.length} selected</span>
      <button class="selection-bar-action" id="bulk-edit-menu-btn" data-action="bulk-menu-open" ${state.selectedIndices.length === 0 ? 'disabled' : ''}>Edit selected ▾</button>
    </div>
  ` : '';

  // v11: bulk-edit menu sheet. Four options stacked vertically. Delete is
  // styled as a destructive action (red) and sits at the bottom to put more
  // distance between it and the safer edits above it.
  const bulkMenu = state.bulkEdit.menuOpen ? `
    <div class="modal-backdrop" id="bulk-menu-backdrop" data-action="bulk-menu-close"></div>
    <div class="bulk-sheet" role="dialog" aria-label="Edit selected items">
      <div class="bulk-sheet-handle"></div>
      <div class="bulk-sheet-header">
        <span class="fail-close-spacer"></span>
        <h3 class="bulk-sheet-title">Edit ${state.selectedIndices.length} item${state.selectedIndices.length === 1 ? '' : 's'}</h3>
        <button class="fail-close-btn" id="bulk-menu-close" data-action="bulk-menu-close" aria-label="Cancel">×</button>
      </div>
      <div class="bulk-menu-actions">
        <button class="bulk-menu-btn" data-action="bulk-edit-mode" data-arg="location" data-bulk-edit="location">Change location</button>
        <button class="bulk-menu-btn" data-action="bulk-edit-mode" data-arg="type" data-bulk-edit="type">Change type</button>
        <button class="bulk-menu-btn" data-action="bulk-edit-mode" data-arg="notes" data-bulk-edit="notes">Change notes</button>
        <button class="bulk-menu-btn danger" data-action="bulk-edit-mode" data-arg="delete" data-bulk-edit="delete">Delete selected</button>
      </div>
    </div>
  ` : '';

  // v10/v11: location dialog — reuses the v10 path. Opened via the bulk-edit
  // menu (mode === 'location' OR legacy bulkLocationDialogOpen).
  const bulkDialog = state.bulkLocationDialogOpen ? `
    <div class="modal-backdrop" id="bulk-backdrop" data-action="bulk-cancel"></div>
    <div class="bulk-sheet" role="dialog" aria-label="Change location">
      <div class="bulk-sheet-handle"></div>
      <div class="bulk-sheet-header">
        <span class="fail-close-spacer"></span>
        <h3 class="bulk-sheet-title">Change location for ${state.selectedIndices.length} item${state.selectedIndices.length === 1 ? '' : 's'}</h3>
        <button class="fail-close-btn" id="bulk-cancel-btn" data-action="bulk-cancel" aria-label="Cancel">×</button>
      </div>
      <input class="input-big" id="bulk-location-input" data-input-action="bulk-location" value="${escapeHTML(state.bulkLocationValue)}" placeholder="New location" autofocus style="margin-bottom:14px">
      <button class="btn-primary" id="bulk-apply-btn" data-action="bulk-location-apply">Apply to ${state.selectedIndices.length} item${state.selectedIndices.length === 1 ? '' : 's'}</button>
    </div>
  ` : '';

  // v11: bulk-edit Type dialog. Shows the active preset's quick-picks above a
  // free-text input — same pattern as the entry screen but laid out for a
  // bottom sheet. Tapping a quick-pick fills the input.
  const typeQuickButtons = (state.itemTypes || []).map(t =>
    `<button class="quick-btn" data-action="bulk-type-quick" data-arg="${escapeHTML(t)}" data-bulk-type-quick="${escapeHTML(t)}">${escapeHTML(t)}</button>`
  ).join('');
  const bulkTypeDialog = state.bulkEdit.mode === 'type' ? `
    <div class="modal-backdrop" id="bulk-type-backdrop" data-action="bulk-cancel"></div>
    <div class="bulk-sheet" role="dialog" aria-label="Change item type">
      <div class="bulk-sheet-handle"></div>
      <div class="bulk-sheet-header">
        <span class="fail-close-spacer"></span>
        <h3 class="bulk-sheet-title">Change type for ${state.selectedIndices.length} item${state.selectedIndices.length === 1 ? '' : 's'}</h3>
        <button class="fail-close-btn" id="bulk-type-cancel" data-action="bulk-cancel" aria-label="Cancel">×</button>
      </div>
      <div class="quick-grid" style="margin-bottom:10px">${typeQuickButtons}</div>
      <input class="input-big" id="bulk-type-input" data-input-action="bulk-type" value="${escapeHTML(state.bulkEdit.typeValue)}" placeholder="…or type custom" autocomplete="off" style="margin-bottom:14px">
      <button class="btn-primary" id="bulk-type-apply" data-action="bulk-type-apply">Apply to ${state.selectedIndices.length} item${state.selectedIndices.length === 1 ? '' : 's'}</button>
    </div>
  ` : '';

  // v11: bulk-edit Notes dialog. Two-mode (radio): Replace overwrites all
  // selected items' notes; Append concatenates the new text after a "; "
  // separator. Empty text is allowed only in Replace mode (clears notes).
  const bulkNotesDialog = state.bulkEdit.mode === 'notes' ? `
    <div class="modal-backdrop" id="bulk-notes-backdrop" data-action="bulk-cancel"></div>
    <div class="bulk-sheet" role="dialog" aria-label="Change notes">
      <div class="bulk-sheet-handle"></div>
      <div class="bulk-sheet-header">
        <span class="fail-close-spacer"></span>
        <h3 class="bulk-sheet-title">Change notes for ${state.selectedIndices.length} item${state.selectedIndices.length === 1 ? '' : 's'}</h3>
        <button class="fail-close-btn" id="bulk-notes-cancel" data-action="bulk-cancel" aria-label="Cancel">×</button>
      </div>
      <div class="bulk-notes-mode">
        <label class="bulk-notes-mode-opt">
          <input type="radio" name="bulk-notes-mode" value="replace" data-change-action="bulk-notes-mode" ${state.bulkEdit.notesMode !== 'append' ? 'checked' : ''}>
          <span><strong>Replace</strong> — overwrite existing notes</span>
        </label>
        <label class="bulk-notes-mode-opt">
          <input type="radio" name="bulk-notes-mode" value="append" data-change-action="bulk-notes-mode" ${state.bulkEdit.notesMode === 'append' ? 'checked' : ''}>
          <span><strong>Append</strong> — add to existing notes (separated by " ; ")</span>
        </label>
      </div>
      <textarea class="input" id="bulk-notes-input" data-input-action="bulk-notes" rows="3" placeholder="${state.bulkEdit.notesMode === 'append' ? 'Text to append' : 'New notes (leave empty to clear)'}" style="margin-bottom:14px">${escapeHTML(state.bulkEdit.notesValue)}</textarea>
      <button class="btn-primary" id="bulk-notes-apply" data-action="bulk-notes-apply">Apply to ${state.selectedIndices.length} item${state.selectedIndices.length === 1 ? '' : 's'}</button>
    </div>
  ` : '';

  const stats = `<div class="progress">${sess.items.length} items · <span class="pass-text">${passes} pass</span> · <span class="fail-text">${fails} fail</span>${sess.engineer ? ' · ' + escapeHTML(sess.engineer) : ''}</div>`;

  // v36: job notes + (when enabled) the certificate number, editable from the
  // overview. Hidden in selection mode to keep that flow uncluttered. Notes save
  // on blur (data-blur-action); the cert field saves on blur too and warns on a
  // duplicate. Only shown when the session isn't locked.
  const jobDetails = (state.selectionMode || sess.locked) ? '' : `
    <div class="overview-jobdetails">
      ${state.reportSettings.certEnabled ? `
        <label class="label" for="session-cert-no">Certificate number</label>
        <input class="input" id="session-cert-no" data-change-action="session-cert-no" data-arg="${sess.id}" value="${escapeHTML(sess.certNo || '')}" placeholder="Assigned when you produce the report" autocapitalize="characters" autocomplete="off" spellcheck="false">
      ` : ''}
      <label class="label" for="session-notes" style="margin-top:10px">Job notes</label>
      <textarea class="textarea" id="session-notes" data-change-action="session-notes" data-arg="${sess.id}" placeholder="Optional notes that print on the report (e.g. access issues, items removed from service)" style="min-height:64px">${escapeHTML(sess.notes || '')}</textarea>
    </div>
  `;

  return `
    <div class="screen">
      ${header}
      ${stats}
      ${actionRow}
      ${jobDetails}
      ${state.selectionMode ? '' : filterRow}
      ${selectAllRow}
      <div class="overview-body">${renderOverviewBodyHTML(sess)}</div>
      ${selectionBar}
      ${bulkMenu}
      ${bulkDialog}
      ${bulkTypeDialog}
      ${bulkNotesDialog}
    </div>
  `;
}

function refreshOverviewBody() {
  const sess = activeSession();
  if (!sess) return;
  const wrap = document.querySelector('.overview-body');
  if (!wrap) return;
  wrap.innerHTML = renderOverviewBodyHTML(sess);
}

// v24 (E7): selecting/deselecting a row in selection mode used to call full
// render(). The only things that change are all confined to the overview screen:
//   • the item rows (selected styling)           — inside .overview-body
//   • the header "N selected" count              — outside .overview-body
//   • the selection-bar count + its button's     — outside .overview-body
//     disabled state
// selectionMode itself does NOT change here (the body.has-selection-bar class is
// therefore stable), and no modal opens or closes — so a full render is overkill.
// This helper rebuilds the body (reusing refreshOverviewBody) and patches the two
// out-of-body counts in place via textContent / a disabled toggle. If any of the
// expected nodes is missing (e.g. we're somehow not in selection mode), it falls
// back to a full render() so there is never a path that leaves the screen stale.
function refreshOverviewSelection() {
  if (state.view !== 'overview' || !state.selectionMode) { render(); return; }
  const body = document.querySelector('.overview-body');
  if (!body) { render(); return; }
  refreshOverviewBody();
  const n = state.selectedIndices.length;
  // Header "N selected"
  const headerCount = document.querySelector('.header-row .site-name');
  if (headerCount) headerCount.textContent = `${n} selected`;
  // Selection-bar count + Edit-selected button disabled state
  const barCount = document.querySelector('.selection-bar-count');
  if (barCount) barCount.textContent = `${n} selected`;
  const editBtn = document.getElementById('bulk-edit-menu-btn');
  if (editBtn) editBtn.disabled = (n === 0);
}

function renderEditSession() {
  const lockChecked = state.editForm.locked ? 'checked' : '';
  return `
    <div class="screen">
      <header class="header-row">
        <button class="icon-btn" id="cancel-edit-btn" data-action="edit-cancel" aria-label="Cancel">‹</button>
        <div class="site-name">Edit session</div>
        <span style="width:40px"></span>
      </header>
      <div class="card">
        <label class="label">Site</label>
        <input class="input" id="ef-site" data-input-action="ef-site" value="${escapeHTML(state.editForm.site)}">
        <p class="muted" style="margin:6px 0 0;font-size:12px">This is the site name saved on the session. Editing it here changes only this session, not your Clients list.</p>
        <label class="label">Engineer</label>
        <input class="input" id="ef-engineer" data-input-action="ef-engineer" value="${escapeHTML(state.editForm.engineer)}">
        <label class="label">Session name</label>
        <input class="input" id="ef-name" data-input-action="ef-name" value="${escapeHTML(state.editForm.name)}">
        <label class="label">Date</label>
        <input class="input input-date" id="ef-date" data-input-action="ef-date" type="date" value="${escapeHTML(state.editForm.date)}">
        <label class="label">Asset number prefix</label>
        <input class="input" id="ef-prefix" data-input-action="ef-prefix" value="${escapeHTML(state.editForm.prefix)}">

        <!-- v8: lock toggle. When on, Pass/Fail/Copy on the entry screen are disabled.
             Bulk edit and item delete from the overview still work, so mistakes can be
             corrected without unlocking the whole session. -->
        <div class="lock-toggle-row">
          <div class="lock-toggle-text">
            <div class="lock-toggle-title">🔒 Lock session</div>
            <div class="lock-toggle-sub">Prevents new entries from the test screen. Edits via the overview still work.</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="ef-locked" data-change-action="ef-locked" ${lockChecked}>
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="btn-row">
          <button class="btn-secondary" id="ef-cancel" data-action="edit-cancel">Cancel</button>
          <button class="btn-primary" id="ef-save" data-action="edit-save">Save</button>
        </div>
      </div>
    </div>
  `;
}

// ============== PAT Test PWA — v30 — Reports hub ==============
// Top-level Reports area: pick a session to turn into a PDF report. Reached from
// the Sessions screen header (only when reportSettings.enabled) and linked to
// Report Settings. Reuses the session-card visual style from the sessions list.
// Gated entirely by the master switch: setView('reports') falls back to sessions
// if reporting is off (defence-in-depth — the entry buttons are already hidden).
function renderReports() {
  const rs = state.reportSettings;
  // Newest-first, same ordering basis as the sessions list default.
  const sorted = state.sessions.slice().sort((a, b) => {
    const da = Date.parse(a.date) || 0, db = Date.parse(b.date) || 0;
    return db - da;
  });

  const needsCompany = !rs.companyName
    ? `<div class="info-card" style="margin:0 0 12px"><p class="muted" style="margin:0">Tip: add your company name and logo in Report Settings so your reports are branded.</p></div>`
    : '';

  let list;
  if (sorted.length === 0) {
    list = emptyStateHTML('📄', 'Nothing to report yet',
      'Once you\'ve logged a session, you can turn it into a PDF report here.');
  } else {
    list = sorted.map(s => {
      const passes = s.items.filter(i => i.result === 'pass').length;
      const fails = s.items.filter(i => i.result === 'fail').length;
      const lockMark = s.locked ? '<span class="session-lock" title="Locked">🔒</span>' : '';
      return `
        <div class="session-card">
          <div class="session-info" data-action="produce-report" data-arg="${s.id}">
            <div class="session-title">${lockMark}${escapeHTML(s.site || s.name)}</div>
            <div class="session-meta">${formatDate(s.date)} · ${s.items.length} items · <span class="pass-text">${passes} pass</span> · <span class="fail-text">${fails} fail</span></div>
          </div>
          <button class="icon-btn-sm" data-action="produce-report" data-arg="${s.id}" aria-label="Produce report">📄</button>
        </div>
      `;
    }).join('');
  }

  return `
    <div class="screen">
      <header class="header-row">
        <button class="icon-btn" id="reports-back-btn" data-action="go-sessions" aria-label="Back">‹</button>
        <div class="site-name">Reports</div>
        <button class="icon-btn" id="reports-settings-btn" data-action="settings-page" data-arg="settingsReport" data-page="settingsReport" aria-label="Report Settings">⚙</button>
      </header>
      <div class="settings-section" style="margin-top:4px">
        <p class="muted" style="margin-top:0">Choose a session to produce a PDF Portable Appliance Test Report. You can preview it before sharing or saving.</p>
      </div>
      ${needsCompany}
      <div class="sessions-list">${list}</div>
    </div>
  `;
}
