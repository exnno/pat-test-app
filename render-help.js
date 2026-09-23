/*!
 * PATGo PWA
 * v82 (September 2026)
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
  // v79 (decision 1A): and only on a host that HAS a cloud — on any other host
  // the long-press reveals nothing at all.
  const cloudOn = state.cloud && state.cloud.status !== 'off';
  const cloudPagesMenu = (state.cloudPagesRevealed && cloudOn) ? `
    <div class="info-card cloud-pages-menu">
      <h3>Cloud (test)</h3>
      <p class="muted" style="font-size:11px">Sign-in only for now. Nothing from your jobs is sent anywhere.</p>
      <button class="backup-action-btn" id="cloud-account-btn" data-action="open-cloud-page" data-arg="account" style="margin-top:8px">👤 Account</button>
      <button class="backup-action-btn" id="cloud-sync-btn" data-action="open-cloud-page" data-arg="sync" style="margin-top:6px">☁ Sync</button>
      <button class="backup-action-btn" id="cloud-subscription-btn" data-action="open-cloud-page" data-arg="subscription" style="margin-top:6px">💳 Subscription</button>
    </div>
  ` : '';

  return `
    <div class="screen">
      ${renderSettingsSubHeader('About')}
      <div class="info-card">
        <h2 id="about-title" style="cursor:pointer;-webkit-user-select:none;user-select:none">PATGo ${APP_VERSION}${typeof cloudVersionTag === 'function' ? cloudVersionTag() : ''}</h2>
        <p>A fast, offline-first portable appliance testing app for working PAT engineers. Built around speed of data entry — pass/fail decisions in two taps, no fighting the interface.</p>
        <p>Your data stays on your device. Nothing is uploaded, no account needed, no signal required once installed. The app is in active testing and ships refinements regularly — if something breaks or you've an idea for what's next, get in touch via the Contact page.</p>
      </div>

      ${cloudPagesMenu}

      <!-- v8: rolling 3-version changelog. v82: rolled forward — V82 on top, V81.2 dropped. -->
      <div class="info-card">
        <h3>What's new</h3>

        <p><strong>V82</strong> &middot; September 2026</p>
        <p class="muted">For the invite-only cloud test only. Your clients and sites now travel between your devices as well as your jobs. When the app can't decide which copy of something to keep, the Sync page now shows you what's actually different, and each button says exactly what it will do.</p>
        <p><strong>V81.4</strong> &middot; September 2026</p>
        <p class="muted">For the invite-only cloud test only. When changes from your other device are waiting for the job you're in, there's now an Update now button, so you don't have to leave the job and come back.</p>
        <p><strong>V81.3</strong> &middot; September 2026</p>
        <p class="muted">For the invite-only cloud test only. When a change from your other device is waiting for the job you're in, it now applies as soon as you leave that job, instead of only after you'd opened a different one.</p>
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

      <div class="bug-sheet-body sheet-scroll">
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

// v43: cloud pages, revealed via long-press on the About title (never in the
// main Settings nav). v79: the Account page is REAL — email-code sign-in via
// cloud.js. v80: so is Sync (push only, sync.js). Subscription is still an
// honest placeholder.
//
// ⚠ This page has inputs. Async results reach it only through _cloudRepaint()
// (cloud.js), which will not render while a field is focused — MAP rule 3.

function renderCloudAccount() {
  const c = state.cloud || {};
  const busy = !!c.busy;
  const dis = busy ? 'disabled' : '';
  const msg = c.message ? `<p class="muted cloud-msg" id="cloud-msg" role="status">${escapeHTML(c.message)}</p>` : '';
  let body = '';

  if (c.status === 'off') {
    body = `
      <div class="info-card">
        <p class="muted">Cloud isn't available on this copy of the app.</p>
      </div>`;
  } else if (c.status === 'signed-in') {
    const plan = c.plan
      ? `<p class="muted" id="cloud-plan">Plan: <strong>${escapeHTML(c.plan)}</strong>${c.trialEndsAt ? ` &middot; trial ends ${escapeHTML(new Date(c.trialEndsAt).toLocaleDateString())}` : ''}</p>`
      : '';
    body = `
      <div class="info-card">
        <h3>Signed in as</h3>
        <p id="cloud-signed-in-email"><strong>${escapeHTML(c.email || '(unknown)')}</strong></p>
        ${plan}
        ${msg}
        <button class="backup-action-btn" id="cloud-check" data-action="cloud-check" ${dis} style="margin-top:8px">${busy ? 'Checking…' : 'Check connection'}</button>
        <button class="backup-action-btn" id="cloud-sign-out" data-action="cloud-sign-out" ${dis} style="margin-top:6px">Sign out</button>
      </div>`;
  } else if (c.status === 'code-sent') {
    body = `
      <div class="info-card">
        <h3>Enter your code</h3>
        <p class="muted" style="font-size:13px">We emailed a code to <strong>${escapeHTML(c.email)}</strong>.</p>
        <label class="label" for="cloud-code">Code</label>
        <input class="input cloud-code-input" id="cloud-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456" ${dis}>
        ${msg}
        <button class="btn-primary" id="cloud-verify-code" data-action="cloud-verify-code" ${dis} style="margin-top:10px">${busy ? 'Checking…' : 'Sign in'}</button>
        <button class="backup-action-btn" id="cloud-resend" data-action="cloud-send-code" ${dis} style="margin-top:8px">Send a new code</button>
        <button class="backup-action-btn" id="cloud-change-email" data-action="cloud-change-email" ${dis} style="margin-top:6px">Use a different email</button>
      </div>`;
  } else {
    body = `
      <div class="info-card">
        <h3>Sign in</h3>
        <p class="muted" style="font-size:13px">We'll email you a code. No password.</p>
        <label class="label" for="cloud-email">Email</label>
        <input class="input" id="cloud-email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" value="${escapeHTML(c.email || '')}" placeholder="you@example.com" ${dis}>
        ${msg}
        <button class="btn-primary" id="cloud-send-code" data-action="cloud-send-code" ${dis} style="margin-top:10px">${busy ? 'Sending…' : 'Email me a code'}</button>
      </div>`;
  }

  return `
    <div class="screen" id="cloud-account-page">
      ${renderSettingsSubHeader('Account')}
      <div class="info-card">
        <h2>Cloud account (test)</h2>
        <p class="muted" style="font-size:12px">While you're signed in, your jobs are copied to the cloud test (see Sync). Clients, sites and settings stay on this phone for now, and the app works exactly the same signed in or not, signal or not.</p>
      </div>
      ${body}
    </div>
  `;
}

// v80: REAL — the push half of sync (sync.js). Read-only page (no inputs), so
// async results may repaint it; they still go through _syncRepaint(), which
// checks it is the page on screen. Hashing every job to count them is only
// affordable here, on a page nobody logs from.
function renderCloudSync() {
  const c = state.cloud || {};
  const sy = state.sync || {};
  let body = '';
  if (c.status === 'off') {
    body = `
      <div class="info-card">
        <p class="muted">Cloud isn't available on this copy of the app.</p>
      </div>`;
  } else if (typeof syncStatusSummary !== 'function') {
    body = `
      <div class="info-card">
        <p class="muted">Sync didn't load on this phone. Your jobs are safe here as always &mdash; fully close the app and reopen it to pick up the update.</p>
      </div>`;
  } else if (c.status !== 'signed-in') {
    body = `
      <div class="info-card">
        <p class="muted" id="sync-signed-out">Sign in on the Account page first. Until you do, nothing leaves this phone.</p>
        <button class="backup-action-btn" id="sync-go-account" data-action="open-cloud-page" data-arg="account" style="margin-top:8px">👤 Account</button>
      </div>`;
  } else {
    const sum = syncStatusSummary();
    const busy = !!sy.busy;
    const dis = busy ? 'disabled' : '';
    const stamp = (v) => v
      ? escapeHTML(new Date(v).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))
      : 'never';
    const msg = sy.message ? `<p class="muted cloud-msg" id="sync-msg" role="status">${escapeHTML(sy.message)}</p>` : '';
    body = `
      <div class="info-card">
        <h3>Jobs</h3>
        <p id="sync-counts"><strong>${sum.upToDate}</strong> of ${sum.total} job${sum.total === 1 ? '' : 's'} in the cloud and up to date${sum.waiting ? ` &middot; <strong>${sum.waiting}</strong> waiting to send` : ''}</p>
        ${sum.recTotal ? `<p id="sync-rec-counts" style="font-size:14px">Clients &amp; sites: <strong>${sum.recUpToDate}</strong> of ${sum.recTotal} up to date</p>` : ''}
        <p class="muted" id="sync-last" style="font-size:13px">Last sent: ${stamp(sum.lastPushAt)}</p>
        <p class="muted" id="sync-last-pull" style="font-size:13px">Last checked: ${stamp(sum.lastPullAt)}</p>
        ${msg}
        <button class="btn-primary" id="sync-push" data-action="sync-push" ${dis} style="margin-top:10px">${busy ? 'Working…' : 'Push now'}</button>
        <button class="backup-action-btn" id="sync-pull" data-action="sync-pull" ${dis} style="margin-top:8px">↓ Check for updates</button>
        <button class="link-btn" id="sync-resend-all" data-action="sync-resend-all" ${dis} style="margin-top:8px">Re-send all jobs</button>
      </div>
      ${renderSyncHeld(sy)}`;
  }
  return `
    <div class="screen" id="cloud-sync-page">
      ${renderSettingsSubHeader('Sync')}
      <div class="info-card">
        <h2>Sync (test)</h2>
        <p class="muted" style="font-size:12px">Jobs, and your client and site lists, are copied both ways between this phone and the cloud: sent a few seconds after you stop logging, and checked for whenever you sign in, reopen the app or get signal back. The example job is never sent. Deleting a job, client or site deletes it on your other device too; clearing old jobs only removes them from this phone, and the cloud keeps them. Photos don't travel yet, so a job that arrives from another device will show its photos as missing. This phone is still the master copy &mdash; keep making backups as normal.</p>
      </div>
      ${body}
    </div>
  `;
}

// v81 decision 2A. The jobs the app would not decide on its own. This card is
// the whole reason a held job is safe: nothing was overwritten, and the question
// is asked in terms an engineer can actually answer. Plain language throughout;
// "fingerprint", "conflict" and "cursor" are our words, not his.
//
// v82 (Peter, after V81: "make it clear what's different rather than just
// saying it's different"). Three changes:
//   • every button says what it DOES for that situation — "Keep it deleted",
//     "Bring it back" — rather than the same two labels for five questions;
//   • a job that exists on both sides gets "What's different?", which fetches
//     the cloud copy and opens a read-only comparison (decision 6A);
//   • clients and sites are asked about here too, grouped under their own
//     heading, with both names right on the card (decision 7A).
function renderSyncHeld(sy) {
  if (typeof syncHeldList !== 'function') return '';
  const held = syncHeldList();
  if (!held.length) return '';
  const resolving = (sy && sy.resolving) || null;
  const diffing = (sy && sy.diffing) || null;
  const n = (v, one, many) => `${v} ${v === 1 ? one : many}`;
  const keyOf = (h) => (typeof syncHeldKey === 'function') ? syncHeldKey(h) : String(h.id);
  const btns = (key, dis, phone, cloud) => `
        <button class="backup-action-btn" data-action="sync-keep-phone" data-arg="${escapeHTML(key)}" ${dis} style="margin-top:8px">📱 ${phone}</button>
        ${cloud ? `<button class="link-btn" data-action="sync-keep-cloud" data-arg="${escapeHTML(key)}" ${dis} style="margin-top:8px">☁ ${cloud}</button>` : ''}`;

  const jobRow = (h) => {
    const key = keyOf(h);
    const name = h.name ? escapeHTML(h.name) : 'Untitled job';
    const dis = resolving === key ? 'disabled' : '';
    const here = h.localItems == null ? '' : n(h.localItems, 'item', 'items');
    const there = h.cloudItems == null ? '' : n(h.cloudItems, 'item', 'items');
    let what, phone = 'Keep this phone\u2019s copy', cloud = 'Use the cloud copy', compare = false;
    if (h.reason === 'deleted-elsewhere') {
      what = `Deleted on your other device, but this phone has changes that were never sent${here ? ` (${here} here)` : ''}.`;
      phone = 'Keep this job'; cloud = 'Delete it here too';
    } else if (h.reason === 'deleted-here') {
      what = `You deleted this job on this phone, and it\u2019s back in the cloud${there ? ` with ${there}` : ''}.`;
      phone = 'Keep it deleted'; cloud = 'Bring it back';
    } else if (h.reason === 'fewer-items') {
      what = `The cloud copy has fewer items than this phone (${h.cloudItems} against ${h.localItems}). Using it would remove items from this phone.`;
      compare = true;
    } else if (h.reason === 'unreadable') {
      what = `The cloud copy of this job can\u2019t be read. Nothing on this phone has been touched.`;
      phone = 'Replace the cloud copy with this phone\u2019s'; cloud = '';
    } else {
      what = `Changed on this phone and on your other device since it was last sent. This phone: ${here} &middot; cloud: ${there}.`;
      compare = true;
    }
    const busyDiff = diffing === String(h.id);
    const cmp = compare
      ? `<button class="backup-action-btn" data-action="sync-held-diff" data-arg="${escapeHTML(String(h.id))}" ${busyDiff || dis ? 'disabled' : ''} style="margin-top:8px">${busyDiff ? 'Checking\u2026' : '🔍 What\u2019s different?'}</button>`
      : '';
    return `
      <div class="info-card sync-held-row" data-held-id="${escapeHTML(key)}" style="margin-top:8px">
        <p><strong>${name}</strong></p>
        <p class="muted" style="font-size:13px">${what}</p>
        ${cmp}${btns(key, dis, phone, cloud)}
      </div>`;
  };

  // '' is Unassigned; null is a client this phone doesn't have.
  const parent = (p) => p === '' ? 'Unassigned' : (p == null ? 'a client not on this phone' : escapeHTML(p));
  const recRow = (h) => {
    const key = keyOf(h);
    const isSite = h.kind === 'site';
    const tag = isSite ? 'Site' : 'Client';
    const title = h.name ? escapeHTML(h.name) : (isSite ? 'Unnamed site' : 'Unnamed client');
    const dis = resolving === key ? 'disabled' : '';
    const nm = (v) => `<strong>${escapeHTML(v || '')}</strong>`;
    const under = (p) => isSite ? ` under ${parent(p)}` : '';
    let lines = [], phone = 'Keep this phone\u2019s', cloud = 'Use the cloud\u2019s';
    if (h.reason === 'deleted-elsewhere') {
      lines.push(`Deleted on your other device, but changed on this phone first. This phone has it as ${nm(h.localName)}${under(h.localParent)}.`);
      phone = 'Keep it'; cloud = 'Delete it here too';
    } else if (h.reason === 'deleted-here') {
      lines.push(`You deleted this on this phone, but your other device still has it as ${nm(h.cloudName)}${under(h.cloudParent)}.`);
      phone = 'Keep it deleted'; cloud = 'Bring it back';
    } else if (h.reason === 'unreadable') {
      lines.push(`The cloud copy can\u2019t be read. Nothing on this phone has been touched.`);
      phone = 'Replace the cloud copy with this phone\u2019s'; cloud = '';
    } else {
      lines.push('Changed on this phone and on your other device.');
      if ((h.localName || '') !== (h.cloudName || '')) {
        lines.push(`Name &mdash; this phone: ${nm(h.localName)} &middot; cloud: ${nm(h.cloudName)}`);
      }
      if (isSite && h.localParent !== h.cloudParent) {
        lines.push(`Client &mdash; this phone: <strong>${parent(h.localParent)}</strong> &middot; cloud: <strong>${parent(h.cloudParent)}</strong>`);
      }
    }
    return `
      <div class="info-card sync-held-row" data-held-id="${escapeHTML(key)}" style="margin-top:8px">
        <p><span class="muted" style="font-size:12px">${tag}</span><br><strong>${title}</strong></p>
        ${lines.map(l => `<p class="muted" style="font-size:13px">${l}</p>`).join('')}
        ${btns(key, dis, phone, cloud)}
      </div>`;
  };

  const jobs = held.filter(h => !h.kind || h.kind === 'session');
  const recs = held.filter(h => h.kind && h.kind !== 'session');
  const sub = (id, text) => `<h4 id="${id}" style="margin:14px 0 0;font-size:14px">${text}</h4>`;
  return `
    <div class="info-card" id="sync-held" style="margin-top:12px">
      <h3>Needs a decision</h3>
      <p class="muted" style="font-size:13px">Nothing has been changed on this phone. ${held.length === 1 ? 'This one' : 'These'} couldn\u2019t be settled automatically without the risk of losing work, so choose which copy to keep.</p>
    </div>
    ${jobs.length && recs.length ? sub('sync-held-jobs', 'Jobs') : ''}
    ${jobs.map(jobRow).join('')}
    ${recs.length ? sub('sync-held-records', 'Clients &amp; sites') : ''}
    ${recs.map(recRow).join('')}`;
}

// v82 (decision 6A): the read-only comparison for one held job. Built from the
// display text syncJobDiff() returns; nothing here reads the cloud or state.
// A read-only sheet — no inputs — so the page may render under it (MAP rule 3),
// though _syncSafeToRepaint() holds sync's own repaints until it closes.
function openSyncDiffSheet(entry, diff) {
  if (typeof _openSheet !== 'function' || !diff) return;
  const max = (typeof SYNC_DIFF_LIST_MAX === 'number') ? SYNC_DIFF_LIST_MAX : 20;
  const n = (v, one, many) => `${v} ${v === 1 ? one : many}`;
  const val = (v) => v == null ? '' : `<strong>${escapeHTML(v)}</strong>`;
  const pair = (f) => (f.here == null && f.cloud == null)
    ? `${escapeHTML(f.label)} is different`
    : `${escapeHTML(f.label)} &mdash; this phone: ${val(f.here)} &middot; cloud: ${val(f.cloud)}`;
  const row = (inner) => `<div style="padding:6px 0;border-top:1px solid var(--border);font-size:13px;line-height:1.45">${inner}</div>`;
  const more = (total) => total > max ? `<p class="muted" style="font-size:12px;margin:6px 0 0">and ${total - max} more</p>` : '';
  const section = (id, title, list, render) => list.length ? `
      <h4 id="${id}" style="margin:14px 0 4px;font-size:14px">${title}</h4>
      ${list.slice(0, max).map(x => row(render(x))).join('')}${more(list.length)}` : '';

  const summary = [];
  if (diff.onlyHere.length) summary.push(`${n(diff.onlyHere.length, 'item', 'items')} only on this phone`);
  if (diff.onlyCloud.length) summary.push(`${n(diff.onlyCloud.length, 'item', 'items')} only in the cloud`);
  if (diff.changed.length) summary.push(`${n(diff.changed.length, 'item', 'items')} changed`);
  if (diff.unchanged) summary.push(`${n(diff.unchanged, 'item', 'items')} the same`);

  // What each answer would actually do, in the terms of THIS comparison.
  const effects = [];
  if (diff.onlyHere.length) effects.push(`Using the cloud copy would remove the ${n(diff.onlyHere.length, 'item', 'items')} only on this phone.`);
  if (diff.onlyCloud.length) effects.push(`Keeping this phone\u2019s copy would remove the ${n(diff.onlyCloud.length, 'item', 'items')} only in the cloud.`);
  if (diff.changed.length || diff.details.length) effects.push('Anything changed takes the version from whichever copy you keep.');

  const name = entry && entry.name ? escapeHTML(entry.name) : 'Untitled job';
  const body = diff.none
    ? `<p class="muted" id="sync-diff-none" style="font-size:13px">No differences found: the two copies hold the same details and items. Either answer leaves you with the same job.</p>`
    : `
      <p class="muted" id="sync-diff-summary" style="font-size:13px;margin:0 0 6px">${summary.join(' &middot; ')}</p>
      ${effects.map(e => `<p class="muted" style="font-size:13px;margin:0 0 6px">${e}</p>`).join('')}
      ${section('sync-diff-details', 'Job details', diff.details, pair)}
      ${section('sync-diff-here', 'Only on this phone', diff.onlyHere, (l) => escapeHTML(l))}
      ${section('sync-diff-cloud', 'Only in the cloud', diff.onlyCloud, (l) => escapeHTML(l))}
      ${section('sync-diff-changed', 'Changed', diff.changed, (c) =>
        `<strong>${escapeHTML(c.label)}</strong>${c.fields.map(f => `<br>${pair(f)}`).join('')}`)}`;

  const { sheet, backdrop, cleanup } = _openSheet('What\u2019s different');
  sheet.id = 'sync-diff-sheet';
  sheet.innerHTML = `
    <div class="bulk-sheet-handle"></div>
    <div class="bulk-sheet-header">
      <span class="fail-close-spacer"></span>
      <h3 class="bulk-sheet-title">What\u2019s different</h3>
      <button class="fail-close-btn" id="sync-diff-x" aria-label="Close">&times;</button>
    </div>
    <div class="sheet-scroll" style="margin:0 0 12px">
      <p style="margin:0 0 6px"><strong>${name}</strong> &middot; this phone ${n(diff.hereCount, 'item', 'items')}, cloud ${n(diff.cloudCount, 'item', 'items')}</p>
      ${body}
    </div>
    <button class="btn-primary sheet-pin" id="sync-diff-close">Close</button>
  `;
  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);
  const x = document.getElementById('sync-diff-x');
  const ok = document.getElementById('sync-diff-close');
  if (x) x.addEventListener('click', cleanup);
  if (ok) ok.addEventListener('click', cleanup);
}

function renderCloudSubscription() {
  return `
    <div class="screen" id="cloud-subscription-placeholder">
      ${renderSettingsSubHeader('Subscription')}
      <div class="info-card">
        <h2>Subscription</h2>
        <p class="muted">Not built yet. Nothing is charged and there is nothing to sign up to.</p>
      </div>
    </div>
  `;
}

