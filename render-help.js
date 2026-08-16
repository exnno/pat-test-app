/*!
 * PATGo PWA
 * v73 (August 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PATGo PWA — v73 — Render: help, about & cloud-prep ==============
// Split out of render-settings.js in v73. Byte identical to the v72 source at
// extraction time, proved by reassembly; the only deliberate content change made
// after that proof was rolling the About changelog forward to V73.
//
// What lives here: the About page (and its rolling changelog), the Glossary
// (page + GLOSSARY_GROUPS data), the Contact page, the bug-report sheet markup,
// and the three cloud-prep stub pages behind the long-press on the About title.
//
// WHY THIS SEAM. These are the read-only reference and help screens: they show
// text, they own no settings, and none of them writes anything. That is what
// makes them separable from the rest of Settings, where every page is bound to a
// write handler in settings-actions.js.
//
// COUPLING TO KNOW ABOUT — reads BOTH ways across the split:
//   - every page here calls renderSettingsSubHeader(), which STAYED in
//     render-settings.js (same one-way shape as v72's photo helpers);
//   - the Settings hub in render-settings.js links to these pages through
//     SETTINGS_PAGE_META (data.js), not through direct calls.
//
// ⚠ Reached only through render()'s dispatcher in render-core.js — NOT through
// the dispatch.js ACTIONS table. The harness's generic action guard (09d) is
// therefore blind to a page lost from here; 09r–09v drive render() per view and
// look for a marker string instead. Never smoke-test one of these with a
// `html.length` check: the first-run wizard paints ~1.5 KB over the top of any
// screen, so a length check goes green on a view that never rendered.
//
// Declares ONE top-level binding, `GLOSSARY_GROUPS`, read only inside a function
// body — so this file's load position is free. It sits after render-settings.js
// purely for readability.

function renderSettingsAbout() {
  // v43: cloud pages reveal via long-press on the title. This section only shows
  // if cloudPagesRevealed is true (a transient per-session flag set by long-press).
  const cloudPagesMenu = state.cloudPagesRevealed ? `
    <div class="info-card cloud-pages-menu">
      <h3>Cloud Pages (dev)</h3>
      <p class="muted" style="font-size:11px">These pages are under development and not yet connected to the cloud.</p>
      <button class="backup-action-btn" id="cloud-account-btn" data-action="open-cloud-page" data-arg="account" style="margin-top:8px">👤 Account</button>
      <button class="backup-action-btn" id="cloud-sync-btn" data-action="open-cloud-page" data-arg="sync" style="margin-top:6px">☁ Sync</button>
      <button class="backup-action-btn" id="cloud-subscription-btn" data-action="open-cloud-page" data-arg="subscription" style="margin-top:6px">💳 Subscription</button>
    </div>
  ` : '';

  return `
    <div class="screen">
      ${renderSettingsSubHeader('About')}
      <div class="info-card">
        <h2 id="about-title" style="cursor:pointer;-webkit-user-select:none;user-select:none">PATGo ${APP_VERSION}</h2>
        <p>A fast, offline-first portable appliance testing app for working PAT engineers. Built around speed of data entry — pass/fail decisions in two taps, no fighting the interface.</p>
        <p>Your data stays on your device. Nothing is uploaded, no account needed, no signal required once installed. The app is in active testing and ships refinements regularly — if something breaks or you've an idea for what's next, get in touch via the Contact page.</p>
      </div>

      ${cloudPagesMenu}

      <!-- v8: rolling 3-version changelog. v73: rolled forward — V73 on top, V70 dropped. -->
      <div class="info-card">
        <h3>What's new</h3>

        <p><strong>V74</strong> &middot; August 2026</p>
        <p class="muted">Two barcode scanner fixes, both found in the field. Scanners that send their characters slightly slowly were being ignored altogether &mdash; the trigger would do nothing at all &mdash; so the speeds the app accepts have been widened on every setting, with no change needed at your end. And if a scan was interrupted part way through, the remainder could arrive on its own and be written into the asset box as a short but believable number; the app now waits for the scanner to finish and fall silent before it will accept anything. Nothing outside the scanner has changed.</p>

        <p><strong>V73</strong> &middot; August 2026</p>
        <p class="muted">Housekeeping only &mdash; nothing has changed in how the app works or looks. The reference pages you're reading right now &mdash; About, the Glossary, Contact and the report-a-problem form &mdash; have been moved into a file of their own behind the scenes, away from the pages that actually change a setting. That completes a run of four tidy-up releases that between them have taken the app's four biggest files apart into smaller, single-purpose ones. Every line that moved was checked to be identical to the last version before this was released.</p>

        <p><strong>V72</strong> &middot; August 2026</p>
        <p class="muted">Housekeeping only &mdash; nothing has changed in how the app works or looks. The screens you use to look back over a job &mdash; the Overview, editing a job's details, retest reminders and the Reports page &mdash; have been moved into a file of their own behind the scenes. That makes the main screen file a third smaller and future changes to it quicker and safer. Every line that moved was checked to be identical to the last version before this was released.</p>

              </div>

      <div class="info-card">
        <h3>Set up another device</h3>
        <p class="muted">Walk through the first-time setup again on this phone — useful for re-importing a setup file or refreshing your details.</p>
        <button class="backup-action-btn" id="about-restart-onboarding" data-action="restart-onboarding" style="margin-top:8px">↻ Run first-time setup again</button>
      </div>

      <div class="info-card">
        <h3>Show me around</h3>
        <p class="muted">A quick guided tour of the basics — Sessions, Quick Pick, the Overview, reports and backups. Handy if you're getting started or showing someone else the ropes.</p>
        <button class="backup-action-btn" id="about-open-tour" data-action="open-tour" style="margin-top:8px">🧭 Show me around the app again</button>
      </div>

      <div class="info-card">
        <h3>Privacy</h3>
        <p class="muted">All test records, settings, and saved descriptions live in your phone or browser's local storage. The app makes no network calls after the initial install. Backups are stored only where you choose to save them.</p>
      </div>

      <!-- v8: emergency reload — for the rare case where the app stops responding to
           taps. A reload clears any in-memory weirdness without losing data. Kept
           near the bottom (a maintenance utility, not a primary action). -->
      <div class="info-card">
        <h3>If the app stops responding</h3>
        <p class="muted">If taps stop registering anywhere in the app, tap Reload below. Your sessions and settings are not affected — only the app itself reloads.</p>
        <button class="backup-action-btn" id="about-reload-btn" data-action="about-reload" style="margin-top:8px">⟳ Reload app</button>
      </div>

      <div class="info-card">
        <p class="muted">© 2026 Peter Birchley. All rights reserved.</p>
      </div>
    </div>
  `;
}

// v58: Glossary. A static, read-only reference page — no state, no actions, no
// storage. Grouped by area rather than A–Z because you look a term up in the
// context you met it in ("what's that thing on the test screen?"), not by letter.
// Terms are DATA (GLOSSARY_GROUPS below) rather than hand-written HTML so adding
// one is a single line and the markup can never drift between entries.
//
// Definitions are deliberately plain-language per the app-wide copy rule: no
// jargon explained with more jargon. Where a term has a regulatory meaning
// (Class I/II, the readings) the wording describes what the APP does with it and
// avoids stating anything that could read as a compliance instruction.
const GLOSSARY_GROUPS = [
  {
    title: 'Testing',
    terms: [
      ['Quick Pick', 'The row of buttons on the test screen that fill in the item type with one tap, so you rarely have to type it. What sits on those buttons is your active preset.'],
      ['Smart Quick Pick', 'An option that reorders the Quick Pick buttons based on the location you are in. If you usually test extension leads in the office, they drift to the front when you type that location. Turn it off and the order stays exactly as you set it.'],
      ['Preset', 'A named set of Quick Pick buttons. You might have one for offices, one for a workshop, one for a kitchen. Press and hold the Quick Pick row to switch between them.'],
      ['Multi Pick', 'Logs several identical items in one go — five identical monitors, say — instead of tapping through them one at a time.'],
      ['Item type', 'What the appliance is: kettle, extension lead, monitor. Either tap a Quick Pick button or type it, and the app suggests item types you have used before.'],
      ['Location', 'Where in the building the item is. It sticks between items, so you set it once per room and it carries down the list.'],
      ['Asset number', 'The number identifying the item. The app fills in the next one automatically, and you can set a prefix so they come out as OFF-001, OFF-002 and so on.'],
      ['Copy last', 'Repeats the item you just logged — same type, same location — so a run of identical items is one tap each.'],
      ['Barcode scanner', 'A Bluetooth scanner that pairs with your phone as a keyboard — often sold as a "wedge" or HID scanner. Scan an asset label on the test screen and the number goes into the asset box without you touching the phone; scan on the Sessions list and it searches for that asset. There is no button to press: it works because the scanner types. See Settings → Testing Setup → Barcode Scanner.'],
      ['Fail reason', 'The reason an item failed, chosen from your own list when you tap FAIL.'],
      ['Fail tag', 'Only relevant when Test Readings is on. Each fail reason is tagged with the kind of test it relates to, so failing an item shows you the one measurement box that matters instead of all of them.']
    ]
  },
  {
    title: 'Test Readings',
    terms: [
      ['Test Readings', 'An optional feature, off by default. Turn it on to record the actual measured values against each item as well as the pass or fail.'],
      ['Class', 'How the appliance is protected — Class I, II or III. Which measurement boxes you see depends on which one you pick.'],
      ['Earth continuity', 'A measured resistance value, in ohms (Ω).'],
      ['Insulation resistance', 'A measured resistance value, in megohms (MΩ).'],
      ['Leakage', 'A measured current value, in milliamps (mA).'],
      ['Polarity', 'A yes/no tick, shown for Class I items only.']
    ]
  },
  {
    title: 'Jobs & sessions',
    terms: [
      ['Session', 'One job — one visit to one site. Everything you test on that visit sits inside it. A session is the thing you export, report on and back up.'],
      ['Client', 'The company you are working for. One client can have several sites.'],
      ['Site', 'The building or address you are testing at. A site can sit under a client, or stand on its own if you have not assigned it to one.'],
      ['Overview', 'The list of everything logged in the current session, where you can review, edit, select and bulk-edit items.'],
      ['Locked session', 'A finished session. It is read-only so you cannot change it by accident. Unlock it if you genuinely need to edit it.'],
      ['Retest reminder', 'An optional feature, off by default. Flags a session for a retest a set number of months out, and lists the ones coming due so you can chase the repeat work.'],
      ['Calibration', 'Your tester\'s calibration due date. Set it and the app warns you when it is close or overdue. From V66 the warning covers every instrument you have saved, and names the one that is due.'],
      ['Test instrument', 'The PAT tester itself. You can save up to five under Settings → User Settings, each with its own calibration details, and mark one as In use. Every job you start is recorded against the instrument in use at that moment, so its certificate keeps naming that tester even after you recalibrate or switch to another one. Change it for a single job under Session settings.']
    ]
  },
  {
    title: 'Output',
    terms: [
      ['Report', 'The PDF certificate for a session — your details, the client\'s, and the full list of items tested. Preview it before you send it.'],
      ['Report template', 'A saved set of report settings — logo, colours, declaration wording — so you can switch between looks without setting it all up again.'],
      ['Certificate number', 'An optional reference stamped onto a session the first time you produce its report. Once assigned it does not change.'],
      ['CSV export', 'A spreadsheet file of a session, for sending on or opening in Excel. You choose which columns it contains.'],
      ['Exported', 'Marks whether a session has been sent out yet. If you change a session after exporting it, it goes back to needing export, so nothing quietly goes stale.']
    ]
  },
  {
    title: 'Data',
    terms: [
      ['Backup', 'A file containing everything — all sessions, clients, sites and settings. This is the one to keep safe. Restoring it puts the app back exactly as it was.'],
      ['Export Setup', 'A file containing only your configuration — presets, lists, report settings, columns. No job data. Use it to set up a second phone or hand your setup to someone else.'],
      ['Pruning', 'Deleting sessions older than an age you choose, to keep the app tidy. It will not prune anything you have not exported yet.'],
      ['Offline', 'The app runs entirely on this phone and needs no signal. Your data is stored on the device, not on a server — which is exactly why backups matter.']
    ]
  }
];

function renderSettingsGlossary() {
  const groups = GLOSSARY_GROUPS.map(g => `
      <div class="info-card glossary-group">
        <h3>${escapeHTML(g.title)}</h3>
        <dl class="glossary-list">
          ${g.terms.map(([term, def]) => `
            <dt>${escapeHTML(term)}</dt>
            <dd>${escapeHTML(def)}</dd>`).join('')}
        </dl>
      </div>`).join('');

  return `
    <div class="screen">
      ${renderSettingsSubHeader('Glossary')}
      <div class="info-card">
        <h2>What the terms mean</h2>
        <p class="muted">Plain-English explanations of the words used around the app.</p>
      </div>
      ${groups}
    </div>
  `;
}

function renderSettingsContact() {
  return `
    <div class="screen">
      ${renderSettingsSubHeader('Contact')}
      <div class="info-card">
        <h2>Get in touch</h2>
        <p>Feedback, bug reports, and feature requests are all welcome. Tell us what you're testing, where the app slowed you down, and what would have made it faster.</p>

        <h3>Email</h3>
        <p><a class="contact-link" href="mailto:hello@patgo.co.uk">hello@patgo.co.uk</a></p>

        <h3>Web</h3>
        <p><a class="contact-link" href="https://www.patgo.co.uk" target="_blank" rel="noopener noreferrer">patgo.co.uk</a></p>
      </div>
      <div class="info-card">
        <h3>Report a problem</h3>
        <p>Found a bug, or got an idea? Tap below. The app fills in your version, phone and settings automatically — you just describe what happened.</p>
        <button class="bug-report-btn" id="bug-open" data-action="bug-open">🐞 Report a problem</button>
        <p class="muted" style="font-size:12px;margin-top:10px">Your job data stays on your phone. Reports carry counts and settings only — never client names, sites or asset numbers.</p>
      </div>
      ${renderBugSheet()}
    </div>
  `;
}

// v60: the report sheet. Markup lives here (render files own markup); all the
// logic — diagnostics, composing, sending — lives in bugreport.js.
//
// v60.1 — THE RULE FOR THIS SHEET: once it is open, NOTHING inside it triggers a
// re-render. This function paints the sheet ONCE when it opens; every subsequent
// change (chip taps, showing/hiding the bug-only blocks, rewording the two
// questions, enabling Send) is applied straight to the DOM by _applyBugSheetDOM()
// in bugreport.js. That is why the severity and repeatable blocks are ALWAYS
// rendered here and merely hidden with `.bug-hidden` rather than being left out
// of the markup — there is then nothing to rebuild, so a tap can never tear down
// a focused textarea and drop the keyboard. Adding a control? Wire it the same
// way. Do not reintroduce render() into this sheet.
function renderBugSheet() {
  if (!state.bugSheetOpen) return '';
  const d = state.bugDraft || makeEmptyBugDraft();
  const isBug = d.type === 'bug';

  const typeRow = BUG_REPORT_TYPES.map(t => `
    <button class="bug-chip ${t.id === d.type ? 'active' : ''}" data-action="bug-set-type" data-arg="${t.id}">${escapeHTML(t.label)}</button>
  `).join('');

  const severityRows = BUG_REPORT_SEVERITIES.map(s => `
    <button class="bug-option ${s.id === d.severity ? 'active' : ''}" data-action="bug-set-severity" data-arg="${s.id}">
      <span class="bug-option-dot">${s.id === d.severity ? '●' : '○'}</span>
      <span class="bug-option-label">${escapeHTML(s.label)}</span>
    </button>
  `).join('');

  const reproRow = `
    <div id="bug-repro-block" class="${isBug ? '' : 'bug-hidden'}">
      <label class="label">Can you make it happen again?</label>
      <div class="bug-chip-row">
        ${BUG_REPORT_REPRO.map(r => `
          <button class="bug-chip ${r.id === d.repro ? 'active' : ''}" data-action="bug-set-repro" data-arg="${r.id}">${escapeHTML(r.label)}</button>
        `).join('')}
      </div>
    </div>
  `;

  const severityBlock = `
    <div id="bug-severity-block" class="${isBug ? '' : 'bug-hidden'}">
      <label class="label">How bad is it?</label>
      <div class="bug-option-list">${severityRows}</div>
    </div>
  `;

  const q1 = isBug ? 'What went wrong?' : 'What would you like?';
  const q2 = isBug ? 'What were you doing at the time?' : 'Why would that help?';
  const ready = bugDescriptionReady();

  return `
    <div class="modal-backdrop" id="bug-backdrop" data-action="bug-close"></div>
    <div class="fail-sheet bug-sheet" role="dialog" aria-label="Report a problem">
      <div class="fail-sheet-handle"></div>
      <div class="fail-sheet-header">
        <button class="fail-close-btn" id="bug-cancel" data-action="bug-close" aria-label="Cancel">‹</button>
        <h3 class="fail-sheet-title">Report a problem</h3>
        <span class="fail-close-spacer"></span>
      </div>

      <div class="bug-sheet-body">
        <label class="label">What kind of report is this?</label>
        <div class="bug-chip-row">${typeRow}</div>

        ${severityBlock}
        ${reproRow}

        <label class="label"><span id="bug-q1">${q1}</span></label>
        <textarea class="input bug-textarea" id="bug-desc" data-input-action="bug-desc" rows="3" placeholder="Describe it in your own words">${escapeHTML(d.description)}</textarea>

        <label class="label"><span id="bug-q2">${q2}</span> <span class="hint">(optional)</span></label>
        <textarea class="input bug-textarea" id="bug-context" data-input-action="bug-context" rows="2" placeholder="e.g. logging item 14 on a big job">${escapeHTML(d.context)}</textarea>

        <details class="bug-diag">
          <summary>What gets sent with this (tap to check)</summary>
          <pre class="bug-diag-pre">${escapeHTML(diagnosticsText())}</pre>
          <p class="muted" style="font-size:12px">Counts and settings only. No client names, sites, locations, asset numbers or notes.</p>
        </details>
      </div>

      <button class="bug-send-btn" id="bug-send" data-action="bug-send" ${ready ? '' : 'disabled'}>Send report</button>
      <button class="bug-copy-btn" id="bug-copy" data-action="bug-copy">Copy instead</button>
      <p class="muted bug-offline-note">No signal? Send it anyway — your email app will hold it and send when you're back online.</p>
    </div>
  `;
}

// v43: cloud prep pages. Not yet wired into the main Settings nav — revealed via
// long-press on the About title. Mock data for now; will persist to cloud in the
// cloud phase.

function renderCloudAccount() {
  const email = state.userId ? `${state.userId}@example.com` : 'Not logged in';
  const loginTime = state.userId ? new Date().toLocaleDateString() : '—';

  return `
    <div class="screen">
      ${renderSettingsSubHeader('Account')}
      <div class="info-card">
        <h2>Cloud Account</h2>
        <p class="muted" style="font-size:12px">Cloud features are coming soon. This page shows your account status.</p>
      </div>

      <div class="info-card">
        <h3>Logged in as</h3>
        <p class="muted">${escapeHTML(email)}</p>
      </div>

      <div class="info-card">
        <h3>Account created</h3>
        <p class="muted">${escapeHTML(loginTime)}</p>
      </div>

      <div class="info-card">
        <button class="backup-action-btn" id="cloud-sign-out" data-action="cloud-sign-out" style="margin-top:8px">Sign out</button>
      </div>
    </div>
  `;
}

function renderCloudSync() {
  const lastSync = state.lastBackupAt ? new Date(state.lastBackupAt).toLocaleString() : 'Never';
  const syncStatus = state.authStatus === 'logged-in' ? 'Ready to sync' : 'Not logged in';

  return `
    <div class="screen">
      ${renderSettingsSubHeader('Sync')}
      <div class="info-card">
        <h2>Cloud Sync</h2>
        <p class="muted" style="font-size:12px">Sync your data to the cloud. This feature is under development.</p>
      </div>

      <div class="info-card">
        <h3>Sync status</h3>
        <p class="muted">${escapeHTML(syncStatus)}</p>
      </div>

      <div class="info-card">
        <h3>Last synced</h3>
        <p class="muted">${escapeHTML(lastSync)}</p>
      </div>

      <div class="info-card">
        <button class="backup-action-btn" id="cloud-sync-now" data-action="cloud-sync-now" style="margin-top:8px">⟳ Sync now</button>
      </div>
    </div>
  `;
}

function renderCloudSubscription() {
  const sessionCount = state.sessions.length;

  return `
    <div class="screen">
      ${renderSettingsSubHeader('Subscription')}
      <div class="info-card">
        <h2>Plan & Usage</h2>
        <p class="muted" style="font-size:12px">Cloud subscription plans are coming soon. Track your usage here.</p>
      </div>

      <div class="info-card">
        <h3>Current plan</h3>
        <p><strong>Free</strong></p>
      </div>

      <div class="info-card">
        <h3>Sessions on this device</h3>
        <p class="muted">${sessionCount} session${sessionCount === 1 ? '' : 's'}</p>
      </div>

      <div class="info-card">
        <button class="backup-action-btn" id="cloud-upgrade" data-action="cloud-upgrade" style="margin-top:8px">Upgrade to Pro</button>
      </div>
    </div>
  `;
}

