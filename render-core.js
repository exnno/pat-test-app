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
  let html = '';
  if (v === 'sessions') html = renderSessions();
  else if (v === 'entry') html = renderEntry();
  else if (v === 'overview') html = renderOverview();
  else if (v === 'editSession') html = renderEditSession();
  else if (v === 'settings') html = renderSettingsHub();
  else if (v === 'settingsUser') html = renderSettingsUser();
  else if (v === 'settingsItems') html = renderSettingsItems();
  else if (v === 'settingsFails') html = renderSettingsFails();
  else if (v === 'settingsMultiPick') html = renderSettingsMultiPick();   // v16
  else if (v === 'settingsDescriptions') html = renderSettingsDescriptions();
  else if (v === 'settingsDisplay') html = renderSettingsDisplay();
  else if (v === 'settingsBackup') html = renderSettingsBackup();
  else if (v === 'settingsCsv') html = renderSettingsCsv();   // v11
  else if (v === 'settingsClients') html = renderSettingsClients();   // v19
  else if (v === 'settingsCalculator') html = renderSettingsCalculator();
  else if (v === 'settingsAbout') html = renderSettingsAbout();
  else if (v === 'settingsContact') html = renderSettingsContact();

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
      <input class="input" id="migration-prompt-input" value="${escapeHTML(state.migrationPrompt.name)}" placeholder="e.g. Default, My items, Office" autofocus>
      <p class="muted" style="margin:8px 0 14px;font-size:12px">You can rename or add more presets later in Settings → Quick Pick Items.</p>
      <button class="btn-primary" id="migration-prompt-confirm" data-action="migration-confirm">Continue</button>
    </div>
  ` : '';

  // v12: one-time "what's new" modal on first launch after an update.
  // Suppressed if the v9 migration prompt is currently showing (that one
  // takes priority because it requires a name commit) or if the user has
  // already dismissed this modal.
  // v27: rolled forward — content covers the Smart Quick Pick ordering
  // improvements. Key bumped to pat:v27welcome (gate uses v27WelcomeSeen) so
  // users see it once on update to V27.
  const welcomeModal = (state.v27WelcomeSeen || state.migrationPrompt.show) ? '' : `
    <div class="modal-backdrop" style="z-index:300"></div>
    <div class="bulk-sheet" style="z-index:301" role="dialog" aria-label="What's new in V27">
      <div class="bulk-sheet-handle"></div>
      <div class="bulk-sheet-header">
        <span class="fail-close-spacer"></span>
        <h3 class="bulk-sheet-title">What's new in V27</h3>
        <span class="fail-close-spacer"></span>
      </div>
      <ul class="welcome-list">
        <li><strong>Smarter Quick Pick ordering.</strong> If you use Smart Quick Pick, the buttons now match your location more precisely — a location only borrows from another if they actually share a word, so a short name like "Office" no longer picks up unrelated places.</li>
        <li><strong>Your regulars stay put.</strong> The item types you test most at a location are protected — a one-off item you logged there once will no longer push your everyday buttons out of the row.</li>
        <li><strong>Nothing to set up.</strong> This applies to your existing history automatically. If you'd ever like to refresh it, the "Rebuild from my data" button under Settings → Smart Quick Pick is still there.</li>
      </ul>
      <button class="btn-primary" id="v27-welcome-dismiss" data-action="welcome-dismiss">Continue</button>
    </div>
  `;

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

  const finalHTML = banner + html + migrationModal + welcomeModal + reopenWarnModal;
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
  bindEvents();
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
//   • bindEvents() is the same binding pass render() uses.
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
  bindEvents();
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

function renderSessions() {
  const nfError = state.newFormError ? `
      <p class="nf-error" role="alert">${escapeHTML(state.newFormError)}</p>
  ` : '';
  const newForm = state.newForm.show ? `
    <div class="card">
      <h2 class="h2">New session</h2>
      <label class="label">Client <span class="hint">(optional)</span></label>
      <div class="nf-input-wrap" id="nf-client-wrap">
        <input class="input" id="nf-client" value="${escapeHTML(state.newForm.clientId)}" placeholder="e.g. Acme Ltd" autocomplete="off" autofocus>
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
      <input class="input" id="nf-name" value="${escapeHTML(state.newForm.name)}" placeholder="e.g. Annual test 2026">
      <label class="label">Asset number prefix <span class="hint">(optional, e.g. BT)</span></label>
      <input class="input" id="nf-prefix" value="${escapeHTML(state.newForm.prefix)}" placeholder="Leave blank for none">
      <label class="label">Starting asset number</label>
      <input class="input" id="nf-start" type="number" inputmode="numeric" value="${escapeHTML(state.newForm.startNo)}">
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
    <input type="file" id="import-session-file" accept=".csv,text/csv" style="display:none">
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
      <input type="search" class="search-input" id="sessions-search" placeholder="Search sessions and items…" value="${escapeHTML(state.sessionsSearchQuery)}" autocomplete="off">
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

  return `
    <div class="screen">
      <header class="header">
        <h1 class="h1">PAT Sessions</h1>
        <button class="icon-btn" id="settings-btn" data-action="open-settings" aria-label="Settings">⚙</button>
      </header>
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
        <select id="sort-select" class="sort-select">
          <option value="date_desc"${state.sort === 'date_desc' ? ' selected' : ''}>Date (newest)</option>
          <option value="date_asc"${state.sort === 'date_asc' ? ' selected' : ''}>Date (oldest)</option>
          <option value="name_asc"${state.sort === 'name_asc' ? ' selected' : ''}>Name (A–Z)</option>
          <option value="name_desc"${state.sort === 'name_desc' ? ' selected' : ''}>Name (Z–A)</option>
        </select>
      </label>
      <label class="control-field">
        <span class="control-label">Status</span>
        <select id="status-filter" class="sort-select">
          <option value="all"${state.sessionFilter === 'all' ? ' selected' : ''}>All</option>
          <option value="unexported"${state.sessionFilter === 'unexported' ? ' selected' : ''}>Not exported</option>
          <option value="exported"${state.sessionFilter === 'exported' ? ' selected' : ''}>Exported</option>
          <option value="modified"${state.sessionFilter === 'modified' ? ' selected' : ''}>Modified since</option>
        </select>
      </label>
      <label class="control-field">
        <span class="control-label">Lock</span>
        <select id="lock-filter" class="sort-select">
          <option value="all"${state.lockFilter === 'all' ? ' selected' : ''}>All</option>
          <option value="unlocked"${state.lockFilter === 'unlocked' ? ' selected' : ''}>Unlocked</option>
          <option value="locked"${state.lockFilter === 'locked' ? ' selected' : ''}>Locked</option>
        </select>
      </label>
    </div>
  ` : '';

  let list;
  if (sortedAll.length === 0 && !state.newForm.show) {
    list = `<p class="muted">No sessions yet. Create one to start testing.</p>`;
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
          <button class="icon-btn-sm" data-action="export-session" data-arg="${s.id}" data-export="${s.id}" aria-label="Share CSV">${SHARE_ICON_SVG}</button>
          <button class="icon-btn-sm" data-action="delete-session" data-arg="${s.id}" data-delete-session="${s.id}" aria-label="Delete">🗑</button>
        </div>
      `;
    }).join('');
  }

  return `${nudgeHTML}${countHTML}${filterCountHTML}${controls}<div>${list}</div>`;
}

// v10: Partial refresh used by the sessions-search oninput. Replaces only
// #sessions-list-area, leaves the search input intact, and rebinds row events.
function refreshSessionsListAreaOnly() {
  const wrap = document.getElementById('sessions-list-area');
  if (!wrap) return;
  wrap.innerHTML = renderSessionsListAreaHTML();
  bindSessionsListAreaEvents();
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
       <textarea class="textarea" id="f-notes" rows="2" placeholder="Optional">${escapeHTML(state.form.notes)}</textarea>`
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
      <textarea class="fail-other-input" id="fail-other-input" placeholder="Type reason…" rows="3">${escapeHTML(state.failOtherText)}</textarea>
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
        <button class="icon-btn" id="sessions-btn" data-action="go-sessions" aria-label="Sessions">📁</button>
        <div class="site-name">${escapeHTML(sess.site || sess.name)}</div>
        <button class="icon-btn" id="overview-btn" data-action="go-overview" aria-label="Overview">▦</button>
      </header>

      ${lockBanner}
      ${progressRow}

      <label class="label">Asset number</label>
      <input class="input-big" id="f-asset" value="${escapeHTML(state.form.assetNo)}">

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
    let msg;
    if (state.searchQuery.trim()) msg = 'No items match your search.';
    else if (state.showFailsOnly) msg = 'No fails in this session.';
    else msg = 'No items recorded yet.';
    return `<p class="muted">${msg}</p>`;
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
            ? `<td class="td td-check"><input type="checkbox" data-select="${i}" ${checked ? 'checked' : ''}></td>`
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
      <input type="search" class="search-input" id="overview-search" placeholder="Search asset, location, item, notes…" value="${escapeHTML(state.searchQuery)}" autocomplete="off">
      <label class="filter-toggle">
        <input type="checkbox" id="fails-only-toggle" ${state.showFailsOnly ? 'checked' : ''}>
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
    const showSelectBtn = sess.items.length > 0;
    header = `
      <header class="header-row">
        <button class="icon-btn" id="back-btn" data-action="overview-back" aria-label="Back">‹</button>
        <div class="site-name">Overview</div>
        <div class="header-actions">
          ${showSelectBtn ? `<button class="icon-btn" id="select-mode-btn" data-action="enter-selection" aria-label="Select items" title="Select items">☑</button>` : ''}
          <button class="icon-btn" id="edit-session-btn" data-action="edit-session" aria-label="Edit session">✎</button>
          <button class="icon-btn" id="export-btn" data-action="export-current" aria-label="Share CSV">${SHARE_ICON_SVG}</button>
        </div>
      </header>
    `;
  }

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
      <input class="input-big" id="bulk-location-input" value="${escapeHTML(state.bulkLocationValue)}" placeholder="New location" autofocus style="margin-bottom:14px">
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
      <input class="input-big" id="bulk-type-input" value="${escapeHTML(state.bulkEdit.typeValue)}" placeholder="…or type custom" autocomplete="off" style="margin-bottom:14px">
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
          <input type="radio" name="bulk-notes-mode" value="replace" ${state.bulkEdit.notesMode !== 'append' ? 'checked' : ''}>
          <span><strong>Replace</strong> — overwrite existing notes</span>
        </label>
        <label class="bulk-notes-mode-opt">
          <input type="radio" name="bulk-notes-mode" value="append" ${state.bulkEdit.notesMode === 'append' ? 'checked' : ''}>
          <span><strong>Append</strong> — add to existing notes (separated by " ; ")</span>
        </label>
      </div>
      <textarea class="input" id="bulk-notes-input" rows="3" placeholder="${state.bulkEdit.notesMode === 'append' ? 'Text to append' : 'New notes (leave empty to clear)'}" style="margin-bottom:14px">${escapeHTML(state.bulkEdit.notesValue)}</textarea>
      <button class="btn-primary" id="bulk-notes-apply" data-action="bulk-notes-apply">Apply to ${state.selectedIndices.length} item${state.selectedIndices.length === 1 ? '' : 's'}</button>
    </div>
  ` : '';

  const stats = `<div class="progress">${sess.items.length} items · <span class="pass-text">${passes} pass</span> · <span class="fail-text">${fails} fail</span>${sess.engineer ? ' · ' + escapeHTML(sess.engineer) : ''}</div>`;

  return `
    <div class="screen">
      ${header}
      ${stats}
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
  bindOverviewBodyEvents();
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

function bindOverviewBodyEvents() {
  // v25 (E3): row open (jump-to-item), per-row delete (delete-item) and
  // row-toggle are delegated via data-action in dispatch.js — no rebinding
  // needed when the body is rebuilt. The checkbox's onCHANGE (the actual
  // selection toggle) is a change event, out of v25 scope, so it stays here and
  // is rebound on every body refresh.
  document.querySelectorAll('[data-select]').forEach(el => {
    el.onchange = () => {
      toggleSelected(parseInt(el.dataset.select, 10));
      refreshOverviewSelection();   // v24 (E7)
    };
  });
}

// v10: Bind events for everything inside #sessions-list-area. Called both from
// bindEvents() on initial render and from refreshSessionsListAreaOnly() after
// each keystroke in the sessions search input.
function bindSessionsListAreaEvents() {
  const $ = id => document.getElementById(id);
  if ($('sort-select')) $('sort-select').onchange = e => {
    state.sort = e.target.value;
    save();
    refreshSessionsListAreaOnly();
  };
  // v15: Status + Lock filters. Both persist and re-render just the list area.
  if ($('status-filter')) $('status-filter').onchange = e => {
    state.sessionFilter = e.target.value;
    save();
    refreshSessionsListAreaOnly();
  };
  if ($('lock-filter')) $('lock-filter').onchange = e => {
    state.lockFilter = e.target.value;
    save();
    refreshSessionsListAreaOnly();
  };
  // v25 (E3): the click controls in this area — #clear-filters-btn
  // (clear-session-filters), #bulk-export-btn (bulk-export-unexported), and the
  // per-card [data-open]/[data-export]/[data-delete-session] rows — are now
  // delegated via data-action in dispatch.js. Only the sort/status/lock <select>
  // onchange handlers (change events, out of v25 scope) remain here.
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
        <input class="input" id="ef-site" value="${escapeHTML(state.editForm.site)}">
        <p class="muted" style="margin:6px 0 0;font-size:12px">This is the site name saved on the session. Editing it here changes only this session, not your Clients list.</p>
        <label class="label">Engineer</label>
        <input class="input" id="ef-engineer" value="${escapeHTML(state.editForm.engineer)}">
        <label class="label">Session name</label>
        <input class="input" id="ef-name" value="${escapeHTML(state.editForm.name)}">
        <label class="label">Date</label>
        <input class="input input-date" id="ef-date" type="date" value="${escapeHTML(state.editForm.date)}">
        <label class="label">Asset number prefix</label>
        <input class="input" id="ef-prefix" value="${escapeHTML(state.editForm.prefix)}">

        <!-- v8: lock toggle. When on, Pass/Fail/Copy on the entry screen are disabled.
             Bulk edit and item delete from the overview still work, so mistakes can be
             corrected without unlocking the whole session. -->
        <div class="lock-toggle-row">
          <div class="lock-toggle-text">
            <div class="lock-toggle-title">🔒 Lock session</div>
            <div class="lock-toggle-sub">Prevents new entries from the test screen. Edits via the overview still work.</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="ef-locked" ${lockChecked}>
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
