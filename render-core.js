/*!
 * PATGo PWA
 * v22 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PATGo PWA — v22 — Render: core screens ==============
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
// v46: the view drawn by the previous render() call, used to detect genuine
// page changes for scroll-on-navigation (see render()). null until first render.
let _lastRenderedView = null;

// v70: MOVED HERE FROM session.js, byte identical. MAP rule 8 says rolling a
// welcome touches config.js (WELCOME_VERSION) and render-core.js (the copy) and
// nothing else. That was true of the modal but not of its dismiss handler, which
// sat 2,400 lines into session.js between the CSV-column reordering and the job
// notes — findable only by grep, and nowhere near anything it related to. It now
// sits beside the markup whose button calls it.
// v50: ONE parameterised welcome-dismiss, replacing the 17 near-identical
// dismissVNNWelcome functions that had accumulated since v12. Sets the seen
// flag in state and persists the matching key so the modal never reappears,
// then re-renders to clear it from view. Feature releases pass their own
// (flag, key) pair and reuse this function.
// v71: this comment used to name a specific version ("the current welcome is
// V49"), which went stale within one release and stayed stale for twenty-two.
// The live answer is WELCOME_VERSION in config.js — a derived, self-rolling
// name since v63. Do not write a version number back into this comment.
function dismissWelcome(seenFlag, key) {
  state[seenFlag] = true;
  localStorage.setItem(key, '1');
  render();
}

function render() {
  if (_lastRenderHadModal) {
    document.querySelectorAll(
      'body > .modal-backdrop, body > .fail-sheet, body > .bulk-sheet'
    ).forEach(el => el.remove());
  }

  const v = state.view;

  // v46 (fix): scroll-on-navigation lives HERE, not in setView. The app changes
  // state.view from ~14 places (setView is only one — openSession/createSession/
  // jumpTo/editSession/etc. set it directly), but every one of them ends by
  // calling render(). So render() is the only reliable funnel. We compare the
  // view about to be drawn (v) against the one drawn last render
  // (_lastRenderedView):
  //   • leaving Sessions → entry: remember the live list offset (read NOW, before
  //     app.innerHTML is overwritten below, while the old list is still scrolled)
  //     so returning can restore it. (decision 2A: Sessions only.)
  //   • returning entry → Sessions: flag a restore, applied after the new HTML is
  //     in the DOM (the scroll target must exist first).
  //   • any other genuine view change: scroll to top.
  //   • same view (an in-place re-render: logging an item, toggling a setting,
  //     opening a dialog, paging the wizard/tour): do nothing — keep scroll pos.
  // _pendingScrollTop is the deferred action for this render, applied at the end.
  let _pendingScrollTop = 'none';   // 'none' | 'top' | 'restore'
  // The "inside a session" views you reach from the Sessions list and return
  // from. Treating them as a group means a detour (list → entry → overview →
  // back to list) still restores your place, and only a move to a genuinely
  // different area (Settings, Reports, the tour) tops out.
  const inSession = (vw) => vw === 'entry' || vw === 'overview' || vw === 'editSession';
  if (v !== _lastRenderedView) {
    if (_lastRenderedView === 'sessions' && inSession(v)) {
      const sc = document.scrollingElement || document.documentElement;
      state.sessionsScrollTop = sc ? sc.scrollTop : 0;
      // The view we're opening (entry/overview) is a fresh page — start it at the
      // top, same as any other navigation. (Capturing the list offset above is
      // only so we can restore it when the user comes BACK to the list.)
      _pendingScrollTop = 'top';
    } else if (v === 'sessions' && inSession(_lastRenderedView)) {
      _pendingScrollTop = 'restore';
    } else {
      if (v === 'sessions') state.sessionsScrollTop = 0;
      _pendingScrollTop = 'top';
    }
  }

  // v43: the cloud-pages secret menu (revealed by long-pressing the About title)
  // must close as soon as you leave the About page. We keep it open only while on
  // About itself or on one of the three cloud pages (so tapping in and back out
  // doesn't lose it), and clear it on any other view.
  if (state.cloudPagesRevealed &&
      v !== 'settingsAbout' && v !== 'cloudAccount' &&
      v !== 'cloudSync' && v !== 'cloudSubscription') {
    state.cloudPagesRevealed = false;
  }

  // v56: the retest action sheet is bound to the reminders view only — clear its
  // transient target on any other view so it can't resurface elsewhere.
  if (state.retestActionSessionId && v !== 'retestReminders') {
    state.retestActionSessionId = null;
  }

  // v42: the feature walkthrough is a full-screen view that owns #app entirely —
  // no banner, no stacked modals. Short-circuit before the normal screen build.
  if (v === 'tour' && state.tourOpen) {
    app.innerHTML = renderTour();
    _lastRenderHadModal = false;
    _lastRenderedView = v;   // v46: keep the view tracker honest across the early return
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
  else if (v === 'settingsInstrument') html = renderSettingsInstrument();   // v66
  else if (v === 'settingsItems') html = renderSettingsItems();
  else if (v === 'settingsFails') html = renderSettingsFails();
  else if (v === 'settingsReadings') html = renderSettingsReadings();   // v53
  else if (v === 'settingsScanner') html = renderSettingsScanner();   // v65
  else if (v === 'settingsMultiPick') html = renderSettingsMultiPick();   // v16
  else if (v === 'settingsDescriptions') html = renderSettingsDescriptions();
  else if (v === 'settingsDisplay') html = renderSettingsDisplay();
  else if (v === 'settingsBackup') html = renderSettingsBackup();
  else if (v === 'settingsSetup') html = renderSettingsSetup();   // v33
  else if (v === 'settingsCsv') html = renderSettingsCsv();   // v11
  else if (v === 'settingsClients') html = renderSettingsClients();   // v19
  else if (v === 'settingsRetest') html = renderSettingsRetest();   // v56
  else if (v === 'settingsReport') html = renderSettingsReport();   // v30
  else if (v === 'reports') html = renderReports();   // v30
  else if (v === 'retestReminders') html = renderRetestReminders();   // v56
  else if (v === 'settingsCalculator') html = renderSettingsCalculator();
  else if (v === 'settingsAbout') html = renderSettingsAbout();
  else if (v === 'settingsGlossary') html = renderSettingsGlossary();   // v58
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

  // One-time "what's new" modal, shown once after an update until dismissed.
  // Suppressed while the v9 migration prompt is up (it needs a name commit first)
  // or while the first-run wizard is showing — so an UPGRADING user sees this
  // modal and a genuinely-new install sees the wizard instead. Dismissed via the
  // shared dismissWelcome() (v50), wired in dispatch.js.
  //
  // v63: gates on the FIXED flag `state.welcomeSeen`, and the heading derives from
  // WELCOME_VERSION (config.js). This file was the sixth — and quietest — member
  // of the old version-named coupling: it read `state.v62WelcomeSeen`, so a stale
  // copy never crashed, it just read undefined, which is falsy, and showed the
  // modal on every render forever. Silent failures are why it was never counted
  // among the coupled files. Neither the flag name nor the heading needs editing
  // when a welcome is rolled now — only WELCOME_VERSION and the copy below.
  const wizardShowing = !state.onboardedV33Seen && !state.migrationPrompt.show;
  // Escape the INTERPOLATED value only — the static English is ours, and running
  // it through escapeHTML would turn the apostrophe in "What's" into &#39;.
  // Renders the same either way, but there is no reason to mangle our own copy.
  const welcomeTitle = `What's new in ${escapeHTML(typeof WELCOME_VERSION === 'string' ? WELCOME_VERSION : '')}`.trim();
  const welcomeModal = (state.welcomeSeen || state.migrationPrompt.show || wizardShowing) ? '' : `
    <div class="modal-backdrop" data-action="welcome-dismiss" style="z-index:300"></div>
    <div class="bulk-sheet" style="z-index:301" role="dialog" aria-label="${welcomeTitle}">
      <div class="bulk-sheet-handle"></div>
      <div class="welcome-logo-wrap"><img class="welcome-logo" src="icon-192.png" alt="PATGo" width="64" height="64"></div>
      <div class="bulk-sheet-header">
        <span class="fail-close-spacer"></span>
        <h3 class="bulk-sheet-title">${welcomeTitle}</h3>
        <span class="fail-close-spacer"></span>
      </div>
      <ul class="welcome-list">
        <li><strong>Your saved locations have been corrected.</strong> The last update stopped the app putting a stray capital after an apostrophe &mdash; "Bob's Office" being saved as "Bob'S Office" &mdash; but only for things typed from that point on. Everything already in your jobs stayed wrong, printed wrong on certificates, and kept being offered back by the suggestions list. This update has gone through your saved jobs and item type presets once and corrected them.</li>
        <li><strong>Names in full capitals are left alone.</strong> "BOB'S OFFICE" is how you typed it, so it stays that way. Names like O'Brien are untouched too.</li>
        <li><strong>You can put it back.</strong> If you'd rather have the old spellings, there's an <strong>Undo the correction</strong> button under Settings &rarr; Back up and restore. It's worth exporting a backup while you're on that page.</li>
        <li><strong>A tap that hits an error no longer leaves you stranded.</strong> If a screen fails to draw, the app now returns you to your jobs list with a short message instead of doing nothing while quietly losing track of which screen you're on.</li>
      </ul>
      <button class="btn-primary" data-action="welcome-dismiss">Continue</button>
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
        <div class="wizard-logo-wrap"><img class="wizard-logo" src="icon-192.png" alt="PATGo" width="72" height="72"></div>
        <h3 class="bulk-sheet-title">Welcome to PATGo</h3>
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
        <div class="modal-backdrop" data-action="reopen-cancel" style="z-index:300"></div>
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
      <div class="modal-backdrop" data-action="signature-pad-cancel" style="z-index:300"></div>
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
  // v46 (fix): apply the scroll decision made at the top of render(), now that
  // the new view's HTML is in #app (so a restore target exists). Use state.view
  // (not the captured v) because a guard at 935/1216 may have bounced the view
  // to 'sessions' during the build — in that case we want top-of-list, which the
  // 'top'/'restore' handling below still does correctly.
  if (_pendingScrollTop === 'restore' && state.view === 'sessions') {
    const top = state.sessionsScrollTop || 0;
    const sc = document.scrollingElement || document.documentElement;
    if (sc) sc.scrollTop = top;
    window.scrollTo(0, top);
  } else if (_pendingScrollTop === 'top') {
    const sc = document.scrollingElement || document.documentElement;
    if (sc) sc.scrollTop = 0;
    window.scrollTo(0, 0);
  }
  // Record the view actually committed this render, for next render's comparison.
  _lastRenderedView = state.view;
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
  // v67: paired mode puts the cursor in the asset box so a scan lands with no
  // tap. Last in the render tail on purpose — it must run after the scroll
  // restore above, or focusing would fight it. The function itself bails on
  // every view but 'entry', and on every state where a scan would be refused
  // anyway. typeof-guarded (rule 6).
  if (typeof focusAssetForScan === 'function') { try { focusAssetForScan(); } catch (e) {} }
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
  // v24 (E4): the entry screen used to contain no modal/sheet at all, so this
  // was hard-coded false. v62 put the photo strip sheet on this screen, so the
  // flag must now tell the truth or a subsequent render() won't sweep it.
  _lastRenderHadModal = !!state.photoStripOpen;
  bindFocusFields();
  // v67: this innerHTML rewrite is what dropped the cursor after every PASS or
  // FAIL, which presented as "the next scan goes nowhere". Paired mode puts it
  // back. typeof-guarded — scanner.js is an optional subsystem (rule 6) and a
  // missing one must never break logging an item.
  if (typeof focusAssetForScan === 'function') { try { focusAssetForScan(); } catch (e) {} }
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

// v43: calibration warning banner for the Sessions screen. Shows ONLY when a
// tester calibration falls due within CAL_DUE_SOON_DAYS (30 days) or is already
// overdue. Otherwise returns '' (no banner) so a healthy cal date adds nothing
// to the screen. Tappable to jump to Settings -> User to update the date.
//
// v66 (decision 5B): checks EVERY saved instrument, not just the one in use, and
// names the offender. ⚠ ONE banner only — worst first, with "+N more" when
// several are due. Two stacked banners on the Sessions screen would be worse than
// the problem they warn about. The ranking lives in worstCalibrationStatus()
// (instruments.js): overdue always beats due-soon, most-overdue first.
function renderCalWarningBanner() {
  const worst = (typeof worstCalibrationStatus === 'function') ? worstCalibrationStatus() : null;
  if (!worst) return '';

  const more = worst.others > 0 ? ` (+${worst.others} more)` : '';
  let cls, label;
  if (worst.status === 'overdue') {
    cls = 'cal-overdue';
    label = `⚠ ${worst.name} calibration overdue (${worst.days} day${worst.days === 1 ? '' : 's'} ago)${more}`;
  } else if (worst.days === 0) {
    cls = 'cal-due-soon';
    label = `⚠ ${worst.name} calibration due today${more}`;
  } else {
    cls = 'cal-due-soon';
    label = `⚠ ${worst.name} calibration due in ${worst.days} day${worst.days === 1 ? '' : 's'}${more}`;
  }
  return `
    <div class="cal-banner ${cls}" role="status">
      <span class="cal-banner-text">${escapeHTML(label)}</span>
      <button class="cal-banner-action" data-action="edit-cal-date">Update</button>
    </div>
  `;
}

// v56: retest-reminders banner for the Sessions screen. Shows ONLY when the
// feature is on AND at least one tracked job is on the active chase list (overdue
// / due-soon / upcoming, unresolved). Otherwise returns '' so the daily testing
// flow stays clean. Tapping "View" opens the dedicated reminders view. Mirrors
// the calibration banner styling/pattern. The count separates overdue from the
// rest so the urgency reads at a glance.
function renderRetestBanner() {
  if (!state.retestRemindersEnabled) return '';
  const due = activeRetestReminders();
  if (due.length === 0) return '';
  const overdue = due.filter(s => retestStatus(s) === 'overdue').length;
  const cls = overdue > 0 ? 'cal-overdue' : 'cal-due-soon';
  let label;
  if (overdue > 0) {
    label = `🔔 ${overdue} retest${overdue === 1 ? '' : 's'} overdue` +
      (due.length > overdue ? ` · ${due.length - overdue} due soon` : '');
  } else {
    label = `🔔 ${due.length} client${due.length === 1 ? '' : 's'} due for retest`;
  }
  return `
    <div class="cal-banner ${cls}" role="status">
      <span class="cal-banner-text">${escapeHTML(label)}</span>
      <button class="cal-banner-action" data-action="open-retest-reminders">View</button>
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
      <label class="label">Starting asset number <span class="hint">(type 001 to keep leading zeros)</span></label>
      <!-- v60: type="number" REMOVED. A numeric input normalises its own value,
           so '001' was silently rewritten to '1' before the app ever saw it —
           leading zeros could not survive no matter what the code did with them.
           text + inputmode="numeric" keeps the numeric keypad on mobile while
           leaving the typed string intact; pattern="[0-9]*" keeps it numeric. -->
      <input class="input" id="nf-start" data-input-action="nf-start" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="${escapeHTML(state.newForm.startNo)}">
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

  // v56: retest reminders chase banner — only present when the feature is on and
  // a tracked job is due. Sits below the calibration warning.
  const retestBanner = renderRetestBanner();

  return `
    <div class="screen">
      <header class="header">
        <h1 class="h1">PAT Sessions</h1>
        ${state.reportSettings.enabled ? '<button class="icon-btn" id="reports-btn" data-action="open-reports" aria-label="Reports">📄</button>' : ''}
        <button class="icon-btn" id="settings-btn" data-action="open-settings" aria-label="Settings">⚙</button>
      </header>
      ${calWarning}
      ${retestBanner}
      ${backupBanner}
      ${newForm}
      ${searchRow}
      ${sessionsListArea}
      ${renderAssetHistorySheet()}
      ${importConflict}
      ${importSummary}
    </div>
  `;
}

// ============== PATGo PWA — v61 — Asset history sheet ==============
// Every job one asset number has appeared in, newest first, in one place.
// Read-only: no inputs, no typing, nothing focusable — so unlike the v60.1 bug
// sheet it is safe for this to be built by a normal render(). There is no caret
// and no keyboard for a re-render to drop.
//
// Rows are tappable and jump to that exact item in that job (decision Q5C).
function renderAssetHistorySheet() {
  if (!state.assetHistorySheetOpen || !state.assetHistoryAsset) return '';
  const asset = state.assetHistoryAsset;
  const { rows, total } = assetHistoryFor(asset);

  // Defensive: the sheet can only be opened from a card that found 2+ jobs, but
  // a session deleted underneath it would leave nothing to show.
  const body = rows.length ? rows.map(r => {
    const it = r.item;
    const isFail = it.result === 'fail';
    const resultChip = `<span class="asset-history-result ${isFail ? 'fail' : 'pass'}">${isFail ? '✗ FAIL' : '✓ PASS'}</span>`;
    // A fail reason is stored in the item's notes (that's where pickFailReason
    // puts it), so notes carry it for free — no special case needed.
    const metaBits = [];
    if (it.location) metaBits.push(escapeHTML(it.location));
    if (it.itemType) metaBits.push(escapeHTML(it.itemType));
    const metaLine = metaBits.length
      ? `<div class="asset-history-meta">${metaBits.join(' · ')}</div>` : '';

    // Readings, gated exactly as the CSV and PDF gate them: only when the
    // feature is on AND this item actually carries them. A user who has never
    // touched readings sees a sheet with no trace of the feature.
    let readingsLine = '';
    if (state.readingsEnabled && it.readings) {
      const rd = it.readings;
      const bits = [];
      if (rd.class) bits.push(`Class ${escapeHTML(String(rd.class))}`);
      if (rd.earth) bits.push(`${escapeHTML(String(rd.earth))} Ω`);
      if (rd.insulation) bits.push(`${escapeHTML(String(rd.insulation))} MΩ`);
      if (rd.leakage) bits.push(`${escapeHTML(String(rd.leakage))} mA`);
      if (rd.polarity) bits.push('Polarity ✓');
      if (bits.length) {
        readingsLine = `<div class="asset-history-readings">${bits.join(' · ')}</div>`;
      }
    }
    const notesLine = it.notes
      ? `<div class="asset-history-notes">${escapeHTML(it.notes)}</div>` : '';

    return `
      <button type="button" class="asset-history-row" data-action="asset-history-row" data-arg="${escapeHTML(r.sessionId)}|${r.index}">
        <div class="asset-history-row-top">
          <span class="asset-history-date">${escapeHTML(r.date ? formatDate(r.date) : 'No date')}</span>
          ${resultChip}
        </div>
        <div class="asset-history-job">${escapeHTML(r.sessionTitle)}</div>
        ${metaLine}
        ${readingsLine}
        ${notesLine}
      </button>
    `;
  }).join('') : `<p class="multipick-empty">Nothing recorded for this asset number.</p>`;

  const trimmedNote = total > rows.length
    ? `<p class="asset-history-trimmed">Showing the ${rows.length} most recent of ${total} records.</p>`
    : '';

  return `
    <div class="modal-backdrop" id="asset-history-backdrop" data-action="asset-history-close"></div>
    <div class="fail-sheet asset-history-sheet" role="dialog" aria-label="Asset history">
      <div class="fail-sheet-handle"></div>
      <div class="fail-sheet-header">
        <span class="fail-close-spacer"></span>
        <h3 class="fail-sheet-title">Asset ${escapeHTML(asset)}</h3>
        <button class="fail-close-btn" id="asset-history-close" data-action="asset-history-close" aria-label="Close">×</button>
      </div>
      <p class="multipick-sheet-hint">Every time this asset number has been tested. Tap one to open that job.</p>
      ${trimmedNote}
      <div class="asset-history-list sheet-scroll">${body}</div>
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

  // v61: cross-session asset history offer. Appears ONLY when what was typed is
  // an exact asset number found in two or more different jobs (decision Q3A) —
  // so searching "kettle" or "Office 1" never offers a "history", because those
  // aren't assets. Sits directly under the match count, above the list, so it
  // reads as an answer to the search rather than as another result.
  const historyOffer = queryTrimmed ? assetHistoryCandidate(queryTrimmed) : null;
  const historyCardHTML = historyOffer ? `
    <button type="button" class="asset-history-card" data-action="asset-history-open" data-arg="${escapeHTML(historyOffer.assetNo)}">
      <span class="asset-history-card-text">
        <span class="asset-history-card-title">🕘 Asset ${escapeHTML(historyOffer.assetNo)}</span>
        <span class="asset-history-card-sub">Tested in ${historyOffer.jobCount} jobs — see the full history</span>
      </span>
      <span class="asset-history-card-cta">View →</span>
    </button>` : '';

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
          ${state.retestRemindersEnabled ? `<option value="retestdue"${state.sessionFilter === 'retestdue' ? ' selected' : ''}>Retest due</option>` : ''}
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
      // v56: retest chase chip — only when the feature is on and this session is
      // on the active chase list. Quiet for everything else so it never clutters.
      const rStatus = state.retestRemindersEnabled ? retestStatus(s) : null;
      let retestChip = '';
      if (rStatus === 'overdue' || rStatus === 'duesoon' || rStatus === 'upcoming') {
        const days = retestDaysUntil(s);
        let rCls, rLabel;
        if (rStatus === 'overdue') {
          rCls = 'retest-chip-overdue';
          rLabel = `🔔 Retest overdue (${Math.abs(days)}d)`;
        } else if (rStatus === 'duesoon') {
          rCls = 'retest-chip-soon';
          rLabel = `🔔 Retest due in ${days}d`;
        } else {
          rCls = 'retest-chip-upcoming';
          rLabel = `🔔 Retest in ${days}d`;
        }
        retestChip = `<div class="session-export-row"><span class="retest-chip ${rCls}">${escapeHTML(rLabel)}</span></div>`;
      }
      const openAttr = matchedItemIndex !== -1
        ? `data-action="open-session" data-arg="${s.id}" data-open="${s.id}" data-open-at="${matchedItemIndex}"`
        : `data-action="open-session" data-arg="${s.id}" data-open="${s.id}"`;
      return `
        <div class="session-card${s.locked ? ' locked' : ''}">
          <div class="session-info" ${openAttr}>
            <div class="session-title">${lockMark}${escapeHTML(s.site || s.name)}</div>
            <div class="session-meta">${formatDate(s.date)} · ${s.items.length} items · <span class="pass-text">${passes} pass</span> · <span class="fail-text">${fails} fail</span></div>
            ${exportBadge ? `<div class="session-export-row">${exportBadge}</div>` : ''}
            ${retestChip}
            ${itemBadge}
          </div>
          <button class="icon-btn-sm" data-action="copy-session" data-arg="${s.id}" aria-label="Copy CSV" title="Copy CSV">📋</button>
          <button class="icon-btn-sm" data-action="export-session" data-arg="${s.id}" data-export="${s.id}" aria-label="Share CSV">${SHARE_ICON_SVG}</button>
          <button class="icon-btn-sm" data-action="delete-session" data-arg="${s.id}" data-delete-session="${s.id}" aria-label="Delete">🗑</button>
        </div>
      `;
    }).join('');
  }

  return `${nudgeHTML}${countHTML}${historyCardHTML}${filterCountHTML}${controls}<div>${list}</div>`;
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

// v67: the asset box, extracted from renderEntry() because paired mode gives it
// three moving parts instead of one.
//
// inputmode="none" tells the browser this field is filled by something other
// than the on-screen keyboard. It is what lets paired mode focus the box without
// a keyboard sliding up over the PASS/FAIL buttons — and it works on a phone
// with no scanner attached too, which is what makes the setting safe to leave on
// if the scanner's battery dies mid-job.
//
// v68: THE ⌨ ESCAPE-HATCH BUTTON WAS REMOVED, and the reasoning matters because
// the obvious instinct is to add it back. It removed our own suppression so the
// phone's keyboard could appear — but iOS hides the on-screen keyboard
// system-wide whenever a hardware keyboard is paired, and no web API overrides
// that, so in the case people actually hit (scanner connected, want to type) the
// button could not work and never did. It only helped when the scanner was off
// or out of range, and there is already a better answer for that: turn "Scanner
// paired" off in Settings, which clears the suppression at its source.
//
// The two real answers, both documented on the settings page:
//   scanner connected    → double-click the scanner's own trigger (NETUM C750)
//   scanner off/no signal → Settings → Testing Setup → Barcode Scanner → paired off
//
// ⚠ Do not reintroduce a per-item keyboard toggle without new evidence that iOS
// has changed. `state.scanKeyboardOn` was removed with the button; a toggle that
// cannot work in its main case is worse than no toggle, because it teaches the
// engineer the app is broken rather than the platform is.
function assetFieldHTML() {
  const paired = !!(state.scannerEnabled && state.scannerPaired);
  return `<input class="input-big" id="f-asset" data-input-action="f-asset"` +
    ` value="${escapeHTML(state.form.assetNo)}"` +
    `${state.scannerEnabled ? ' placeholder="Scan or type"' : ''}` +
    `${paired ? ' inputmode="none"' : ''}>`;
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

  // v62.1: decision 13A said photos must be reachable from the entry form when
  // you tap back into an existing fail. v62.0 shipped the strip sheet on this
  // screen but never gave it a trigger, so there was no way in — the photos were
  // there and unreachable. This is that trigger.
  //
  // Shown ONLY on an existing item whose result is a fail (decision 15A). It
  // also appears at a count of zero, so tapping back into a fail you logged
  // without a photo still lets you add one — the strip's own Add button handles
  // it from there.
  const entryItem = isExisting ? sess.items[state.cursor] : null;
  const entryPhotoCount = (entryItem && entryItem.result === 'fail' && entryItem.id)
    ? photoCountForItem(entryItem.id) : 0;
  const showEntryPhotoRow = !!(entryItem && entryItem.result === 'fail' && entryItem.id
    && (typeof photosSupported !== 'function' || photosSupported()));
  const entryPhotoRow = showEntryPhotoRow ? `
      <button class="entry-photo-btn" id="entry-photo-btn" data-action="photo-strip-open" data-arg="${escapeHTML(entryItem.id)}">
        📷 ${entryPhotoCount ? `Photos (${entryPhotoCount})` : 'Add a photo'}
      </button>
  ` : '';

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

  // v62: the photo row sits BELOW the reason controls and is present on BOTH
  // stages — an "Other…" fail is exactly the unusual kind worth photographing,
  // so losing the button on that stage would be the wrong trade. The strip's
  // container id is what session.js's refreshFailPhotoStrip() targets for its
  // DOM-only update, which is what keeps the "Other…" textarea and its keyboard
  // alive when a photo lands (the v60.1 rule).
  const failPhotoRow = `
    <div class="fail-photo-row">
      <div class="fail-photo-strip" id="fail-photo-strip">${renderFailPhotoStripInner()}</div>
      <input type="file" id="fail-photo-file" data-change-action="fail-photo-file" accept="image/*" style="display:none">
    </div>
  `;

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
      ${failPhotoRow}
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

  // v47: quick-pick preset switcher. Opened by a long-press on the quick-pick
  // grid (gesture bound in events.js). Lists every item-type preset; tapping one
  // switches the active preset (which 9 buttons show) and closes. Switch only —
  // it never logs. The current preset is ticked. A shortcut at the foot jumps to
  // the Settings preset page to add/edit presets. Built on the same bottom-sheet
  // pattern as Multi Pick.
  let presetSheet = '';
  if (state.presetSheetOpen) {
    const presets = state.itemPresets || [];
    const presetBody = presets.length ? `
      <div class="preset-switch-list sheet-scroll">
        ${presets.map(p => {
          const isActive = p.id === state.activePresetId;
          const items = Array.isArray(p.items) ? p.items : [];
          const preview = items.slice(0, 4).join(' · ');
          const more = items.length > 4 ? ` +${items.length - 4} more` : '';
          const sub = items.length
            ? `${preview}${more}`
            : 'No items yet';
          return `
            <button class="preset-switch-option${isActive ? ' active' : ''}" data-action="preset-sheet-pick" data-arg="${escapeHTML(p.id)}">
              <span class="preset-switch-tick">${isActive ? '✓' : ''}</span>
              <span class="preset-switch-text">
                <span class="preset-switch-name">${escapeHTML(p.name || 'Untitled preset')}</span>
                <span class="preset-switch-sub">${escapeHTML(sub)}</span>
              </span>
            </button>
          `;
        }).join('')}
      </div>
      <button class="preset-switch-edit" data-action="preset-sheet-edit">⚙ Edit presets</button>
    ` : `
      <p class="multipick-empty">No presets set up yet. Add them in Settings.</p>
    `;
    presetSheet = `
      <div class="modal-backdrop" id="preset-sheet-backdrop" data-action="preset-sheet-close"></div>
      <div class="fail-sheet preset-switch-sheet" role="dialog" aria-label="Switch preset">
        <div class="fail-sheet-handle"></div>
        <div class="fail-sheet-header">
          <span class="fail-close-spacer"></span>
          <h3 class="fail-sheet-title">Switch preset</h3>
          <button class="fail-close-btn" id="preset-sheet-close" data-action="preset-sheet-close" aria-label="Cancel">×</button>
        </div>
        <p class="multipick-sheet-hint">Changes which quick-pick buttons show. It won’t log anything.</p>
        ${presetBody}
      </div>
    `;
  }

  // v53: Test Readings sheet. Shown (when the feature is on) after PASS or after
  // a fail reason is picked — see openReadingsSheet(). Class selector at the top
  // drives which measurement rows render. PASS mode shows every applicable field
  // pre-filled (greyed editable placeholders via the value); FAIL mode shows only
  // the box the chosen reason's tag points at (blank), or none for a visual/Other
  // reason. Reuses the .fail-sheet bottom-sheet pattern (reliable on iOS PWA).
  let readingsSheet = '';
  if (state.readingsSheetOpen) {
    const draft = state.readingsDraft || { class: READING_CLASS_DEFAULT, earth: '', insulation: '', leakage: '' };
    const cls = (READING_CLASSES.indexOf(draft.class) !== -1) ? draft.class : READING_CLASS_DEFAULT;
    const mode = state.readingsSheetMode === 'fail' ? 'fail' : 'pass';

    // Which fields to show:
    //   pass → all fields applicable to the class.
    //   fail → only the field the reason's tag points at, IF it's applicable to
    //          the class; a visual/Other reason (tag 'visual') shows none.
    let fields;
    if (mode === 'pass') {
      fields = READING_FIELDS_BY_CLASS[cls] || [];
    } else {
      const tag = readingTagForReason(state.readingsPendingFailReason);
      const applicable = READING_FIELDS_BY_CLASS[cls] || [];
      fields = (tag !== 'visual' && applicable.indexOf(tag) !== -1) ? [tag] : [];
    }

    const classButtons = READING_CLASSES.map(c => `
      <button class="reading-class-btn ${c === cls ? 'active' : ''}" data-action="readings-set-class" data-arg="${c}">Class ${c}</button>
    `).join('');

    const fieldRows = fields.map(k => {
      const meta = READING_FIELD_META[k];
      if (!meta) return '';
      const val = (typeof draft[k] === 'string') ? draft[k] : '';
      return `
        <label class="reading-field-label">${escapeHTML(meta.label)} <span class="reading-unit">(${escapeHTML(meta.unit)})</span></label>
        <input class="input reading-input" id="f-reading-${k}" data-input-action="f-reading-${k}" value="${escapeHTML(val)}" inputmode="text" autocomplete="off" placeholder="${escapeHTML(meta.passPlaceholder)}">
      `;
    }).join('');

    const noFieldsNote = (fields.length === 0)
      ? `<p class="multipick-sheet-hint">No electrical reading needed for this — just confirm the class and tap ${mode === 'fail' ? 'Save fail' : 'OK'}.</p>`
      : '';

    // v54: polarity checkbox — Class I only (READING_POLARITY_CLASSES). A simple
    // pass/fail tick (correct line/neutral/earth wiring), not a typed value.
    // Toggled via data-action (a tap, full re-render — no input focus to lose).
    // Rendered as a tappable row so the whole label is the hit target on mobile.
    const polarityOn = draft.polarity === true;
    const polarityRow = (READING_POLARITY_CLASSES.indexOf(cls) !== -1)
      ? `<button class="reading-polarity-row${polarityOn ? ' checked' : ''}" data-action="readings-toggle-polarity" role="checkbox" aria-checked="${polarityOn ? 'true' : 'false'}">
          <span class="reading-polarity-box">${polarityOn ? '✓' : ''}</span>
          <span class="reading-polarity-label">Polarity correct</span>
        </button>`
      : '';

    const title = mode === 'fail' ? 'Fail readings' : 'Readings';
    const okLabel = mode === 'fail' ? 'Save fail' : 'OK';
    const hint = mode === 'pass'
      ? 'Pre-filled with typical pass values — edit if needed, or just tap OK.'
      : 'Record the reading for this failure, then save.';

    readingsSheet = `
      <div class="modal-backdrop" id="readings-backdrop" data-action="readings-cancel"></div>
      <div class="fail-sheet readings-sheet" role="dialog" aria-label="Test readings">
        <div class="fail-sheet-handle"></div>
        <div class="fail-sheet-header">
          <button class="fail-close-btn" id="readings-cancel" data-action="readings-cancel" aria-label="Cancel">‹</button>
          <h3 class="fail-sheet-title">${title}</h3>
          <span class="fail-close-spacer"></span>
        </div>
        <p class="multipick-sheet-hint">${hint}</p>
        <label class="reading-field-label">Equipment class</label>
        <div class="reading-class-row">${classButtons}</div>
        ${fieldRows}
        ${polarityRow}
        ${noFieldsNote}
        <button class="reading-ok-btn" id="readings-ok" data-action="readings-commit">${okLabel}</button>
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
      ${assetFieldHTML()}

      <label class="label">Location ${carriedHint}</label>
      <div class="location-input-wrap">
        <input class="input-big" id="f-location" value="${escapeHTML(state.form.location)}" placeholder="e.g. Office 1">
        ${locationSuggestionsBlock}
      </div>

      <label class="label">Item type</label>
      <div class="quick-grid" id="quick-grid">${quickButtons}</div>
      <div class="custom-type-wrap">
        <input class="input" id="f-type" value="${escapeHTML(state.form.itemType)}" placeholder="…or type custom" autocomplete="off" style="margin-top:8px">
        ${suggestionsBlock}
      </div>

      ${notesBlock}

      <div class="pass-fail-row">
        <button class="pass-btn" id="pass-btn" data-action="log-pass" ${passFailDisabled}><span class="icon">✓</span>PASS</button>
        <button class="fail-btn" id="fail-btn" data-action="log-fail" ${passFailDisabled}><span class="icon">✗</span>FAIL</button>
      </div>

      ${entryPhotoRow}

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
      ${presetSheet}
      ${readingsSheet}
      ${renderPhotoStripSheet()}
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
          // v62: photo count on fail rows. Read SYNCHRONOUSLY from the in-memory
          // index (state.photoIndex) — render() cannot await IndexedDB. Before
          // the index has loaded, and for anyone with no photos, this is 0 and
          // the markup is empty, so the table is untouched for existing users.
          // In selection mode it renders as an inert span: tapping a row there
          // must toggle the selection, not open a sheet.
          const photoN = (it.result === 'fail' && it.id) ? photoCountForItem(it.id) : 0;
          const photoChip = !photoN ? ''
            : (sel
              ? `<span class="photo-chip is-static">📷 ${photoN}</span>`
              : `<button class="photo-chip" data-action="photo-strip-open" data-arg="${escapeHTML(it.id)}" aria-label="View ${photoN} photo${photoN === 1 ? '' : 's'}">📷 ${photoN}</button>`);
          return `
            <tr class="${rowClass}" ${rowAttr}>
              ${checkCol}
              <td class="td">${escapeHTML(it.assetNo)}</td>
              <td class="td">${escapeHTML(it.location)}</td>
              <td class="td">${escapeHTML(it.itemType)}${timeLine}</td>
              <td class="td td-result ${it.result || ''}">${capitalise(it.result || '')}${photoChip}</td>
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
      ${renderPhotoStripSheet()}
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
  const sess = activeSession();
  // v56: per-session retest reminder control. Only shown when the feature is on.
  // Instant-apply (not part of the editForm draft) — flagging/unflagging and the
  // interval persist immediately via their own helpers, like the other toggles
  // that act directly on the session. The due date shown uses the session's
  // CURRENTLY-SAVED date; if the user is also editing the date above, the new due
  // date appears once they Save (the chip/banner recompute on the next render).
  // v61: testing time. ALWAYS shown when it can be computed — deliberately NOT
  // gated on the Item Timestamps setting (decision Q8A), because a derived
  // figure nobody can see unless they enabled an unrelated setting is not a
  // feature. The setting now gates the CSV Time column only.
  //
  // sessionDuration() returns null when there's nothing worth showing (fewer
  // than two timestamped items — e.g. any job logged before v61 with the setting
  // off), and this block then renders nothing at all rather than "0m". Same
  // omit-the-line pattern as the v59 stats footer.
  let durationBlock = '';
  const dur = sess ? sessionDuration(sess) : null;
  if (dur) {
    const sub = dur.multiDay
      ? 'This job was logged over more than one day, so there is no single elapsed time to show.'
      : 'From the first item logged to the last. It includes any breaks, so it is not time on tools.';
    durationBlock = `
      <div class="session-duration-row">
        <div class="session-duration-label">⏱ Testing time</div>
        <div class="session-duration-value">${escapeHTML(dur.text)}</div>
        <div class="session-duration-sub">${sub}</div>
      </div>
    `;
  }

  let retestBlock = '';
  if (state.retestRemindersEnabled && sess) {
    const tracked = !!sess.retestTrack;
    if (!tracked) {
      retestBlock = `
        <div class="lock-toggle-row">
          <div class="lock-toggle-text">
            <div class="lock-toggle-title">🔔 Remind me to chase this for retest</div>
            <div class="lock-toggle-sub">Adds this job to your retest chase list so you're reminded to contact the customer and rebook when it's due. Use it for clients you want to win repeat work from.</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="ef-retest" data-change-action="ef-retest-toggle">
            <span class="toggle-slider"></span>
          </label>
        </div>
      `;
    } else {
      const months = Number(sess.retestMonths) || defaultRetestMonths();
      const dueStr = addMonthsFormatted(sess.date, months);
      const contact = sess.retestContact;
      let contactLine = '';
      if (contact && contact.status === 'booked') {
        contactLine = `<div class="lock-toggle-sub" style="margin-top:6px;color:var(--pass)">✓ Marked as rebooked${contact.at ? ' on ' + escapeHTML(formatDate(contact.at.slice(0, 10))) : ''}. Clear it below to chase again.</div>`;
      } else if (contact && contact.status === 'declined') {
        contactLine = `<div class="lock-toggle-sub" style="margin-top:6px;color:var(--muted)">Marked as declined${contact.at ? ' on ' + escapeHTML(formatDate(contact.at.slice(0, 10))) : ''} (lost the job). Clear it below to chase again.</div>`;
      }
      retestBlock = `
        <div class="lock-toggle-row">
          <div class="lock-toggle-text">
            <div class="lock-toggle-title">🔔 Retest reminder on</div>
            <div class="lock-toggle-sub">Due ${dueStr ? '<strong>' + escapeHTML(dueStr) + '</strong>' : '—'} (this test date + the interval below). This job is on your chase list.</div>
            ${contactLine}
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="ef-retest" data-change-action="ef-retest-toggle" checked>
            <span class="toggle-slider"></span>
          </label>
        </div>
        <label class="label">Retest interval (months)</label>
        <input class="input" id="ef-retest-months" data-input-action="ef-retest-months" type="number" inputmode="numeric" min="1" max="120" value="${escapeHTML(String(months))}">
        <p class="muted" style="margin:6px 0 0;font-size:12px">Captured from your default when you switched this on; change it here for this job only.</p>
      `;
    }
  }
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
        ${typeof renderEditSessionInstrumentBlock === 'function' ? renderEditSessionInstrumentBlock() : ''}
        ${retestBlock}
        ${durationBlock}

        <div class="btn-row">
          <button class="btn-secondary" id="ef-cancel" data-action="edit-cancel">Cancel</button>
          <button class="btn-primary" id="ef-save" data-action="edit-save">Save</button>
        </div>
      </div>
    </div>
  `;
}

// ============== PATGo PWA — v56 — Retest reminders ==============
// The commercial chase list: tracked jobs that are due (or overdue) for retest,
// most-urgent first, each with the customer to ring and one-tap resolution. This
// is the "sales headspace" screen — deliberately separate from the Sessions list
// (the testing workspace). Reached from the Sessions banner and from Settings →
// Retest Reminders. Gated by the master switch: if the feature is off we bounce
// to Sessions (defence-in-depth — the entry points are already hidden).
function renderRetestReminders() {
  if (!state.retestRemindersEnabled) { state.view = 'sessions'; return renderSessions(); }
  const due = activeRetestReminders();

  // The contacted-action sheet (Booked / Declined / clear) for one row.
  let actionSheet = '';
  if (state.retestActionSessionId) {
    const s = state.sessions.find(x => x.id === state.retestActionSessionId);
    if (s) {
      const name = s.site || s.name || 'this job';
      actionSheet = `
        <div class="modal-backdrop" id="retest-action-backdrop" data-action="retest-action-close" style="z-index:300"></div>
        <div class="bulk-sheet" style="z-index:301" role="dialog" aria-label="Retest reminder action">
          <div class="bulk-sheet-handle"></div>
          <div class="bulk-sheet-header">
            <span class="fail-close-spacer"></span>
            <h3 class="bulk-sheet-title">${escapeHTML(name)}</h3>
            <button class="fail-close-btn" id="retest-action-close" data-action="retest-action-close" aria-label="Close">×</button>
          </div>
          <p style="margin:0 0 14px;font-size:14px;line-height:1.5;color:var(--text)">Once you've contacted the customer, mark the outcome to clear this from your chase list.</p>
          <button class="btn-primary" style="margin-bottom:8px" data-action="retest-mark-booked" data-arg="${s.id}">✓ Rebooked — job won</button>
          <button class="btn-secondary" style="margin-bottom:8px" data-action="retest-mark-declined" data-arg="${s.id}">Declined — lost the job</button>
          <button class="btn-tertiary" data-action="retest-untrack" data-arg="${s.id}">Stop reminding me about this job</button>
        </div>
      `;
    }
  }

  let list;
  if (due.length === 0) {
    list = emptyStateHTML('🔔', 'No retests due',
      'When a job you\'ve flagged comes due, it\'ll appear here so you can ring the customer and rebook. Flag a job under its Session settings.');
  } else {
    list = due.map(s => {
      const st = retestStatus(s);
      const days = retestDaysUntil(s);
      const months = Number(s.retestMonths) || defaultRetestMonths();
      const dueStr = addMonthsFormatted(s.date, months);
      let chipCls, chipLabel;
      if (st === 'overdue') {
        chipCls = 'retest-chip-overdue';
        chipLabel = `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`;
      } else if (st === 'duesoon') {
        chipCls = 'retest-chip-soon';
        chipLabel = `Due in ${days} day${days === 1 ? '' : 's'}`;
      } else {
        chipCls = 'retest-chip-upcoming';
        chipLabel = `Due in ${days} day${days === 1 ? '' : 's'}`;
      }
      const client = clientNameForSession(s);
      const titleLine = escapeHTML(s.site || s.name || 'Untitled session');
      const clientLine = (client && client !== (s.site || s.name)) ? `<div class="retest-row-client">${escapeHTML(client)}</div>` : '';
      const itemCount = Array.isArray(s.items) ? s.items.length : 0;
      return `
        <div class="session-card">
          <div class="session-info" data-action="open-session" data-arg="${s.id}" data-open="${s.id}">
            <div class="session-title">${titleLine}</div>
            ${clientLine}
            <div class="session-meta">Last tested ${formatDate(s.date)} · ${itemCount} item${itemCount === 1 ? '' : 's'} · due ${dueStr || '—'}</div>
            <div class="session-export-row"><span class="retest-chip ${chipCls}">🔔 ${escapeHTML(chipLabel)}</span></div>
          </div>
          <button class="icon-btn-sm" data-action="retest-action-open" data-arg="${s.id}" aria-label="Mark contacted" title="Mark contacted">✓</button>
        </div>
      `;
    }).join('');
  }

  return `
    <div class="screen">
      <header class="header-row">
        <button class="icon-btn" id="retest-back-btn" data-action="go-sessions" aria-label="Back">‹</button>
        <div class="site-name">Retest reminders</div>
        <button class="icon-btn" id="retest-settings-btn" data-action="settings-page" data-arg="settingsRetest" data-page="settingsRetest" aria-label="Retest settings">⚙</button>
      </header>
      <div class="settings-section" style="margin-top:4px">
        <p class="muted" style="margin-top:0">Jobs you've flagged that are coming due for retest, most urgent first. Ring the customer to rebook, then mark each one done.</p>
      </div>
      <div class="sessions-list">${list}</div>
      ${actionSheet}
    </div>
  `;
}


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

// ---------- v62: photo evidence markup ----------

// The contents of the fail sheet's photo row: thumbnails of anything staged so
// far, plus the Add button (or a "3 max" note once full).
//
// ⚠ This is rendered BOTH by the fail sheet's full render AND, on its own, by
// session.js's refreshFailPhotoStrip() writing straight into #fail-photo-strip.
// That is deliberate: it lets a photo appear while the "Other…" textarea is
// focused without a render() tearing the field down (the v60.1 rule). Keep it
// self-contained — it must produce valid markup with no surrounding context.
function renderFailPhotoStripInner() {
  // No IndexedDB (or the store failed to open) → no photo UI at all, rather
  // than a button that silently does nothing.
  if (typeof photosSupported === 'function' && !photosSupported()) return '';

  const photos = state.pendingPhotos || [];
  const cap = (typeof PHOTO_MAX_PER_ITEM === 'number') ? PHOTO_MAX_PER_ITEM : 3;

  const thumbs = photos.map((p, i) => `
    <span class="photo-thumb">
      <img src="${p.url}" alt="Photo ${i + 1}">
      <button class="photo-thumb-remove" data-action="fail-photo-remove" data-arg="${i}" aria-label="Remove photo ${i + 1}">×</button>
    </span>
  `).join('');

  const addControl = (photos.length >= cap)
    ? `<span class="photo-add-full">${cap} photo maximum</span>`
    : `<button class="photo-add-btn" id="fail-photo-pick-btn" data-action="fail-photo-pick">📷 ${photos.length ? 'Add another' : 'Add photo'}</button>`;

  return thumbs + addControl;
}

// The photo strip sheet — viewing and managing the photos on an item that has
// already been logged. Reached from the 📷 chip in the Overview.
//
// Buttons only, no inputs, nothing focusable — so like the v61 asset-history
// sheet this one MAY be rebuilt by render(). The v60.1 no-render rule applies to
// sheets containing fields, which this is not.
function renderPhotoStripSheet() {
  if (!state.photoStripOpen) return '';

  const cap = (typeof PHOTO_MAX_PER_ITEM === 'number') ? PHOTO_MAX_PER_ITEM : 3;
  const photos = state.photoStripPhotos || [];
  const count = photos.length;

  let body;
  if (state.photoStripLoading && !count) {
    body = `<p class="muted photo-strip-loading">Loading photos…</p>`;
  } else if (!count) {
    body = `<p class="muted photo-strip-loading">No photos on this item.</p>`;
  } else {
    body = `
      <div class="photo-strip-grid">
        ${photos.map((p, i) => `
          <figure class="photo-strip-item">
            <img src="${p.url}" alt="Photo ${i + 1}" loading="lazy">
            <figcaption>
              <span class="photo-strip-size">${escapeHTML(formatBytes(p.bytes || 0))}</span>
              <button class="photo-strip-delete" data-action="photo-delete" data-arg="${escapeHTML(p.id)}" aria-label="Delete photo ${i + 1}">Delete</button>
            </figcaption>
          </figure>
        `).join('')}
      </div>
    `;
  }

  const addControl = (count >= cap)
    ? `<p class="muted photo-strip-note">${cap} photo maximum reached.</p>`
    : `<button class="photo-add-btn wide" id="photo-strip-add-btn" data-action="photo-strip-add" ${state.photoStripLoading ? 'disabled' : ''}>📷 Add another photo</button>`;

  return `
    <div class="modal-backdrop" id="photo-strip-backdrop" data-action="photo-strip-close"></div>
    <div class="bulk-sheet sheet-scroll" role="dialog" aria-label="Photos on this item">
      <div class="bulk-sheet-handle"></div>
      <div class="bulk-sheet-header">
        <span class="fail-close-spacer"></span>
        <h3 class="bulk-sheet-title">Photos${count ? ` (${count})` : ''}</h3>
        <button class="fail-close-btn" id="photo-strip-close" data-action="photo-strip-close" aria-label="Close">×</button>
      </div>
      ${body}
      ${addControl}
      <input type="file" id="photo-strip-file" data-change-action="photo-strip-file" accept="image/*" style="display:none">
    </div>
  `;
}
