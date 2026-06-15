/*!
 * PAT Test PWA
 * v23 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PAT Test PWA — v23 — Render: settings ==============
// All renderSettings* screens + the earth-resistance calculator page.

// ===== Settings hub & sub-pages (v7) =====

// v32: live subtitle for a settings page row (the per-page count/status line).
// Extracted so both the category sub-list and search results can show it. Returns
// '' for pages with no dynamic status (their static blurb is used instead).
function settingsPageSubtitle(pageId) {
  switch (pageId) {
    case 'settingsUser': {
      const calSt = calibrationStatus();
      let s = state.engineer ? state.engineer : 'Engineer name';
      if (calSt && calSt.status === 'overdue') {
        s += ` · Cal overdue (${calSt.days} day${calSt.days === 1 ? '' : 's'})`;
      } else if (calSt && calSt.status === 'soon') {
        s += calSt.days === 0 ? ' · Cal due today' : ` · Cal due in ${calSt.days} day${calSt.days === 1 ? '' : 's'}`;
      }
      return s;
    }
    case 'settingsItems': {
      const activeP = activePreset();
      const itemCount = activeP ? activeP.items.length : 0;
      const presetCount = state.itemPresets.length;
      return activeP
        ? `${activeP.name} · ${itemCount} quick-pick${itemCount === 1 ? '' : 's'}${presetCount > 1 ? ` · ${presetCount} presets` : ''}`
        : 'No preset selected';
    }
    case 'settingsFails':
      return state.failReasons.length === 1 ? '1 quick-pick' : `${state.failReasons.length} quick-picks`;
    case 'settingsMultiPick': {
      const mpSlots = activeMultiPickSlots().length;
      return mpSlots === 0
        ? (state.multiPick.enabled ? 'On · none set up yet' : 'Off')
        : `${state.multiPick.enabled ? 'On' : 'Off'} · ${mpSlots} multi-pick${mpSlots === 1 ? '' : 's'}`;
    }
    case 'settingsDescriptions':
      return state.descriptions.length === 1 ? '1 description' : `${state.descriptions.length} descriptions`;
    case 'settingsDisplay': {
      const themeSummary = state.theme === 'system' ? 'System' : (state.theme === 'dark' ? 'Dark' : 'Light');
      const extras = [];
      if (state.soundEnabled) extras.push('Sound on');
      if (state.timestampsEnabled) extras.push('Times on');
      return [themeSummary, state.hapticsEnabled ? 'Haptics on' : 'Haptics off', ...extras].join(' · ');
    }
    case 'settingsCsv': {
      const visibleCsv = state.csvColumns.filter(c => c.visible).length;
      const totalCsv = state.csvColumns.length;
      const csvCustomised = state.csvColumns.some((c, i) => {
        const d = DEFAULT_CSV_COLUMNS[i];
        return !d || d.id !== c.id || d.header !== c.header || d.visible !== c.visible;
      });
      return `${visibleCsv} of ${totalCsv} column${totalCsv === 1 ? '' : 's'} visible${csvCustomised ? ' · customised' : ''}`;
    }
    case 'settingsClients': {
      const clientCount = state.clients.length;
      const siteCount = state.sites.length;
      return clientCount === 0 ? 'No clients yet'
        : `${clientCount} client${clientCount === 1 ? '' : 's'} · ${siteCount} site${siteCount === 1 ? '' : 's'}`;
    }
    case 'settingsReport': {
      const rs = state.reportSettings;
      return !rs.enabled ? 'Off' : (rs.companyName ? `On · ${rs.companyName}` : 'On · no company name set');
    }
    case 'settingsBackup':  return 'Back up and restore your data';
    case 'settingsSetup':   return 'Share your setup to another device';
    case 'settingsCalculator': return 'Earth continuity limit';
    case 'settingsAbout':   return `PAT Test ${APP_VERSION}`;
    case 'settingsContact': return 'Get in touch';
    default: return '';
  }
}

// A single settings row button (used by category sub-lists and search results).
// `context` is an optional muted suffix (e.g. the category name in search results).
function settingsPageRowHTML(pageId, context) {
  const meta = SETTINGS_PAGE_META[pageId] || { icon: '•', title: pageId };
  const sub = settingsPageSubtitle(pageId);
  const ctx = context ? `<span class="settings-row-context">${escapeHTML(context)}</span>` : '';
  return `
    <button class="settings-row" data-action="settings-page" data-arg="${pageId}" data-page="${pageId}">
      <span class="settings-row-icon">${meta.icon}</span>
      <div class="settings-row-text">
        <div class="settings-row-title">${escapeHTML(meta.title)}${ctx}</div>
        ${sub ? `<div class="settings-row-sub">${escapeHTML(sub)}</div>` : ''}
      </div>
      <span class="settings-row-chevron">›</span>
    </button>`;
}

// v32: the hub body (search results OR category list). Separated so the live
// search filter can re-render just this region, preserving focus on the search
// input (a full render() would blur it on every keystroke — the same reason
// the sessions list uses refreshSessionsListAreaOnly).
function renderSettingsHubBodyHTML() {
  const query = state.settingsSearchQuery.trim().toLowerCase();
  if (query) {
    const results = [];
    SETTINGS_CATEGORIES.forEach(cat => {
      cat.pages.forEach(pageId => {
        const meta = SETTINGS_PAGE_META[pageId];
        if (!meta) return;
        const hay = `${meta.title} ${meta.aliases || ''}`.toLowerCase();
        if (hay.includes(query)) results.push({ pageId, cat });
      });
    });
    return results.length
      ? `<div class="settings-list">${results.map(r => settingsPageRowHTML(r.pageId, r.cat.title)).join('')}</div>`
      : `<p class="muted settings-empty-search">No settings match "${escapeHTML(state.settingsSearchQuery.trim())}".</p>`;
  }
  return `<div class="settings-list">${SETTINGS_CATEGORIES.map(cat => `
      <button class="settings-row" data-action="settings-category" data-arg="${cat.id}">
        <span class="settings-row-icon">${cat.icon}</span>
        <div class="settings-row-text">
          <div class="settings-row-title">${escapeHTML(cat.title)}</div>
          <div class="settings-row-sub">${escapeHTML(cat.blurb)}</div>
        </div>
        <span class="settings-row-chevron">›</span>
      </button>`).join('')}</div>`;
}

// v32: the Settings hub — a list of CATEGORIES, with a search box that flattens
// to matching pages across all categories.
function renderSettingsHub() {
  const searchBox = `
    <div class="settings-search">
      <input type="search" id="settings-search-input" class="input settings-search-input"
        placeholder="Search settings" value="${escapeHTML(state.settingsSearchQuery)}"
        data-input-action="settings-search" autocapitalize="off" autocomplete="off" spellcheck="false">
    </div>`;

  return `
    <div class="screen">
      <header class="header-row">
        <button class="icon-btn" id="back-btn" data-action="overview-back" aria-label="Back">‹</button>
        <div class="site-name">Settings</div>
        <span style="width:40px"></span>
      </header>
      ${searchBox}
      <div id="settings-hub-body">${renderSettingsHubBodyHTML()}</div>
      <p class="settings-footer">PAT Test ${APP_VERSION} · © 2026 Peter Birchley<br>Data stored on this device only</p>
    </div>
  `;
}

// v32: a category sub-list — the pages within one category. Back returns to the
// hub. A muted blurb under the header explains the group (helper text).
function renderSettingsCategory() {
  const cat = SETTINGS_CATEGORIES.find(c => c.id === state.settingsCategory);
  if (!cat) { // defensive: unknown category → bounce to hub
    state.view = 'settings';
    return renderSettingsHub();
  }
  return `
    <div class="screen">
      <header class="header-row">
        <button class="icon-btn" id="back-to-settings-btn" data-action="back-to-settings" aria-label="Back">‹</button>
        <div class="site-name">${escapeHTML(cat.title)}</div>
        <span style="width:40px"></span>
      </header>
      <p class="settings-category-blurb">${escapeHTML(cat.blurb)}</p>
      <div class="settings-list">
        ${cat.pages.map(pageId => settingsPageRowHTML(pageId)).join('')}
      </div>
    </div>
  `;
}

function renderSettingsSubHeader(title) {
  return `
    <header class="header-row">
      <button class="icon-btn" id="back-to-settings-btn" data-action="back-to-settings" aria-label="Back">‹</button>
      <div class="site-name">${escapeHTML(title)}</div>
      <span style="width:40px"></span>
    </header>
  `;
}

function renderSettingsUser() {
  // v12: build the calibration-due chip if a due date is set and is either
  // overdue or within CAL_DUE_SOON_DAYS. Placed in the label for the "Next
  // calibration due" field so it sits visually next to the date input that
  // drives it. Empty string when there's nothing to flag (no date set, or
  // 'ok' status).
  const calSt = calibrationStatus();
  let calChip = '';
  if (calSt && calSt.status === 'overdue') {
    calChip = ` <span class="cal-chip overdue">Overdue · ${calSt.days} day${calSt.days === 1 ? '' : 's'}</span>`;
  } else if (calSt && calSt.status === 'soon') {
    // v15: "Due today" when the due date is today (days === 0).
    calChip = calSt.days === 0
      ? ` <span class="cal-chip soon">Due today</span>`
      : ` <span class="cal-chip soon">Due in ${calSt.days} day${calSt.days === 1 ? '' : 's'}</span>`;
  }

  return `
    <div class="screen">
      ${renderSettingsSubHeader('User Settings')}
      <div class="settings-section">
        <h2 class="h2">Engineer name</h2>
        <p class="muted">Used as the default for new sessions and shown on exported CSVs.</p>
        <input class="input" id="settings-engineer" value="${escapeHTML(state.engineer)}" placeholder="Your name">
      </div>

      <!-- v11: tester type + calibration info. All optional. Stored locally
           and included in JSON backups. v12 update: exports to CSV via four
           default-hidden columns under Settings → CSV Columns. v13: tester
           split into Manufacturer + Model — combined back into a single
           space-separated value at CSV export time. -->
      <div class="settings-section">
        <h2 class="h2">Test instrument</h2>
        <p class="muted">The make and model of your PAT tester, if you'd like to record it. Combined as a single value on the CSV export when the "Test Instrument" column is enabled in Settings → CSV Columns.</p>

        <label class="label">Manufacturer</label>
        <input class="input" id="settings-tester-make" value="${escapeHTML(state.testerMake)}" placeholder="e.g. Megger, Seaward, Kewtech">

        <label class="label">Model</label>
        <input class="input" id="settings-tester-model" value="${escapeHTML(state.testerModel)}" placeholder="e.g. PAT250, Apollo 600, KT77">
      </div>

      <div class="settings-section">
        <h2 class="h2">Calibration</h2>
        <p class="muted">Calibration details for your tester. All optional. v12: exports to CSV when the matching columns are enabled in Settings → CSV Columns.</p>

        <label class="label">Last calibration date</label>
        <input class="input" id="settings-cal-date" type="date" value="${escapeHTML(state.calDate)}">

        <label class="label">Certificate number</label>
        <input class="input" id="settings-cal-cert" value="${escapeHTML(state.calCertNo)}" placeholder="e.g. CAL-2026-0142">

        <label class="label">Next calibration due${calChip}</label>
        <input class="input" id="settings-cal-due" type="date" value="${escapeHTML(state.calDue)}">
      </div>

      <button class="btn-primary" id="settings-user-save" data-action="settings-user-save" style="margin-top:24px">Save</button>
    </div>
  `;
}

function renderSettingsItems() {
  const presets = state.itemPresets;
  const active = activePreset();
  const presetOptions = presets.map(p =>
    `<option value="${escapeHTML(p.id)}"${p.id === state.activePresetId ? ' selected' : ''}>${escapeHTML(p.name)}</option>`
  ).join('');
  const canDelete = presets.length > 1;
  const presetCount = presets.length;
  const presetSummary = presetCount === 1 ? '1 preset' : `${presetCount} presets`;

  // v18: a short status line describing the learned history, so the Rebuild /
  // Clear buttons have context. Counts the learned locations.
  const sqpLocCount = Object.keys(state.sqpHistory || {}).length;
  const sqpHistoryNote = sqpLocCount === 0
    ? 'No history learned yet. Turning this on builds it from your existing sessions; it then keeps learning as you log items.'
    : `Learned from ${sqpLocCount} location${sqpLocCount === 1 ? '' : 's'}. Rebuild re-scans all your sessions; Clear empties it (re-enabling rebuilds it).`;

  // v9: presets dialog (rename / new) — uses the existing bulk-sheet bottom-sheet
  // pattern so it visually matches the bulk-edit-location dialog and the fail
  // picker. One input, two buttons.
  const dialog = state.presetDialog;
  const dialogModal = (dialog.mode === 'new' || dialog.mode === 'rename') ? `
    <div class="modal-backdrop" id="preset-backdrop" data-action="preset-dialog-cancel"></div>
    <div class="bulk-sheet" role="dialog" aria-label="${dialog.mode === 'new' ? 'New preset' : 'Rename preset'}">
      <div class="bulk-sheet-handle"></div>
      <div class="bulk-sheet-header">
        <span class="fail-close-spacer"></span>
        <h3 class="bulk-sheet-title">${dialog.mode === 'new' ? 'New preset' : 'Rename preset'}</h3>
        <button class="fail-close-btn" id="preset-dialog-cancel" data-action="preset-dialog-cancel" aria-label="Cancel">×</button>
      </div>
      <label class="label">Name</label>
      <input class="input" id="preset-dialog-input" data-input-action="preset-name" value="${escapeHTML(dialog.name)}" placeholder="e.g. Workshop, Office, Site visit" autofocus>
      <button class="btn-primary" id="preset-dialog-confirm" data-action="preset-dialog-confirm" style="margin-top:14px">${dialog.mode === 'new' ? 'Create' : 'Save'}</button>
    </div>
  ` : '';

  return `
    <div class="screen">
      ${renderSettingsSubHeader('Quick Pick Items')}

      <!-- v9: Presets picker. Switching here changes which list is edited below
           and which 9 items appear on the entry screen. Selection sticks
           globally until changed again. -->
      <div class="settings-section">
        <h2 class="h2">Preset</h2>
        <p class="muted">${escapeHTML(presetSummary)}. The selected preset is what shows on the entry screen.</p>
        <select class="input" id="settings-preset-select" data-change-action="preset-switch">${presetOptions}</select>
        <div class="preset-actions-row">
          <button class="preset-action-btn" id="preset-new-btn" data-action="preset-new">＋ New</button>
          <button class="preset-action-btn" id="preset-rename-btn" data-action="preset-rename">✎ Rename</button>
          <button class="preset-action-btn preset-action-danger" id="preset-delete-btn" data-action="preset-delete"${canDelete ? '' : ' disabled'}>🗑 Delete</button>
        </div>
      </div>

      <div class="settings-section">
        <h2 class="h2">Items in "${escapeHTML(active ? active.name : '')}"</h2>
        <p class="muted">One per line. Up to 9. Appear as quick-tap buttons on the entry screen.</p>
        <textarea class="textarea" id="settings-types" style="min-height:240px">${escapeHTML((active ? active.items : []).join('\n'))}</textarea>
      </div>

      <!-- v18: Smart Quick Pick. Reorders the quick-pick buttons on the entry
           screen so the types you most often log at the current location come
           first. Off by default — when off, buttons keep their plain order. The
           toggle persists instantly (own handler, not the Save button below,
           which only commits the items textarea / preset). -->
      <div class="settings-section">
        <h2 class="h2">Smart Quick Pick</h2>
        <p class="muted">Adapt the quick-pick buttons to the current Location — swapping in the item types you've most often tested there (even ones not in your preset) so they're one tap away. Your preset list is the default row whenever a location has no match. It never changes what a tap logs. Off by default.</p>
        <div class="toggle-row">
          <div class="toggle-row-text">
            <div class="toggle-row-title">Adapt buttons to location</div>
            <div class="toggle-row-sub">${state.sqpEnabled ? 'On' : 'Off'}</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="sqp-toggle" data-change-action="sqp-toggle" ${state.sqpEnabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
        <p class="muted" style="margin-top:12px;font-size:12px">${sqpHistoryNote}</p>
        <div class="preset-actions-row" style="margin-top:8px">
          <button class="preset-action-btn" id="sqp-rebuild-btn" data-action="sqp-rebuild">↻ Rebuild from my data</button>
          <button class="preset-action-btn preset-action-danger" id="sqp-clear-btn" data-action="sqp-clear">🗑 Clear history</button>
        </div>
      </div>

      <div class="btn-row" style="margin-top:24px">
        <button class="btn-secondary" id="settings-items-reset" data-action="settings-items-reset">↺ Reset to defaults</button>
        <button class="btn-primary" id="settings-items-save" data-action="settings-items-save">Save</button>
      </div>

      ${dialogModal}
    </div>
  `;
}

function renderSettingsFails() {
  return `
    <div class="screen">
      ${renderSettingsSubHeader('Quick Pick Fail')}
      <div class="settings-section">
        <h2 class="h2">Fail reasons</h2>
        <p class="muted">One per line. Up to 6. Shown when you tap FAIL.</p>
        <textarea class="textarea" id="settings-reasons" style="min-height:200px">${escapeHTML(state.failReasons.join('\n'))}</textarea>
      </div>
      <div class="btn-row" style="margin-top:24px">
        <button class="btn-secondary" id="settings-fails-reset" data-action="settings-fails-reset">↺ Reset to defaults</button>
        <button class="btn-primary" id="settings-fails-save" data-action="settings-fails-save">Save</button>
      </div>
    </div>
  `;
}

function renderSettingsMultiPick() {
  const enabled = !!(state.multiPick && state.multiPick.enabled);
  const slots = state.multiPick.slots || [];

  // Always render MULTIPICK_MAX_SLOTS fixed rows, pre-filled from the stored
  // slots in order. Empty rows save as empty and are dropped on save. This keeps
  // the editor predictable (no add/remove buttons to fiddle with on mobile).
  const slotRows = [];
  for (let i = 0; i < MULTIPICK_MAX_SLOTS; i++) {
    const s = slots[i] || { name: '', items: [] };
    const seqValue = (s.items || []).join(', ');
    slotRows.push(`
      <div class="mp-slot">
        <div class="mp-slot-head">Multi-pick ${i + 1}</div>
        <input class="input mp-slot-name" value="${escapeHTML(s.name || '')}" placeholder="Name (optional) — e.g. Desk PC setup">
        <input class="input mp-slot-seq" value="${escapeHTML(seqValue)}" placeholder="Lead, AC Adapter, Lead, PC, Lead, Monitor">
      </div>
    `);
  }

  return `
    <div class="screen">
      ${renderSettingsSubHeader('Multi Pick')}

      <div class="settings-section">
        <h2 class="h2">Multi Pick button</h2>
        <p class="muted">Multi Pick logs a fixed list of items as PASS, in order, with a single tap — handy on jobs with lots of identical setups, and easy to leave off when you don't need it.</p>
        <div class="toggle-row">
          <div class="toggle-row-text">
            <div class="toggle-row-title">Show on entry screen</div>
            <div class="toggle-row-sub" id="multipick-enabled-sub">${enabled ? 'On' : 'Off'}</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="multipick-enabled" data-change-action="multipick-enabled" ${enabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="settings-section">
        <h2 class="h2">Your multi-picks</h2>
        <p class="muted">For each one, type the item types you want logged, <strong>separated by commas</strong>, in the order they should be added. Add a name to label the button, or leave it blank to show the list itself. Leave a multi-pick's items blank to hide it. Up to ${MULTIPICK_MAX_SLOTS}.</p>
        <div class="mp-example">Example — items <strong>Lead, AC Adapter, Lead, PC, Lead, Monitor</strong> log six passes in that order, each on whatever location is in the entry screen's Location field.</div>
        ${slotRows.join('')}
      </div>

      <button class="btn-primary" id="settings-multipick-save" data-action="settings-multipick-save" style="margin-top:24px">Save</button>
    </div>
  `;
}

function renderSettingsDescriptions() {
  return `
    <div class="screen">
      ${renderSettingsSubHeader('Item Description List')}
      <div class="settings-section">
        <h2 class="h2">Saved descriptions</h2>
        <p class="muted">Item types you've typed into the custom field. Edit to fix typos for future autocomplete (won't change items already saved). Add new lines to seed autocomplete with common items.</p>
        <textarea class="textarea" id="settings-descriptions" style="min-height:280px">${escapeHTML(state.descriptions.join('\n'))}</textarea>
      </div>
      <div class="btn-row" style="margin-top:24px">
        <button class="btn-secondary" id="settings-descriptions-reset" data-action="settings-descriptions-reset">↺ Reset to defaults</button>
        <button class="btn-primary" id="settings-descriptions-save" data-action="settings-descriptions-save">Save</button>
      </div>
    </div>
  `;
}

function renderSettingsDisplay() {
  const themes = [
    { key: 'system', label: 'System', sub: 'Match device appearance' },
    { key: 'light', label: 'Light', sub: '' },
    { key: 'dark', label: 'Dark', sub: '' }
  ];
  return `
    <div class="screen">
      ${renderSettingsSubHeader('Display Settings')}
      <div class="settings-section">
        <h2 class="h2">Theme</h2>
        <p class="muted">Choose how the app looks.</p>
        <div class="theme-options">
          ${themes.map(t => `
            <button class="theme-option" data-action="set-theme" data-arg="${t.key}" data-set-theme="${t.key}">
              <span class="theme-option-radio ${state.theme === t.key ? 'checked' : ''}"></span>
              <span class="theme-option-label">${escapeHTML(t.label)}</span>
              ${t.sub ? `<span class="theme-option-sub">${escapeHTML(t.sub)}</span>` : ''}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="settings-section">
        <h2 class="h2">Haptics</h2>
        <p class="muted">Vibration on pass, fail, and copy actions. Turn off if you find it distracting or if it's too aggressive on your device.</p>
        <p class="muted" style="margin-top:8px">Note: iPhones on iOS 26.5 or later no longer allow apps like this one to trigger vibration from the web. On those phones the on-screen flash still confirms every action, and you can switch on Sound feedback below for an audible cue.</p>
        <div class="toggle-row">
          <div class="toggle-row-text">
            <div class="toggle-row-title">Haptic feedback</div>
            <div class="toggle-row-sub">${state.hapticsEnabled ? 'On' : 'Off'}</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="haptics-toggle" data-change-action="haptics" ${state.hapticsEnabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="settings-section">
        <h2 class="h2">Sound feedback</h2>
        <p class="muted">Play a short tone on pass, fail, and copy actions — a different tone for each. Useful where vibration isn't available (newer iPhones) or when you want an audible confirmation. Off by default.</p>
        <div class="toggle-row">
          <div class="toggle-row-text">
            <div class="toggle-row-title">Sound on pass / fail / copy</div>
            <div class="toggle-row-sub">${state.soundEnabled ? 'On' : 'Off'}</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="sound-toggle" data-change-action="sound" ${state.soundEnabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="settings-section">
        <h2 class="h2">Item timestamps</h2>
        <p class="muted">Record the time each item was first logged. When on, the time shows beneath the item in a session's overview, and a Time column becomes available for CSV export (switch it on under Settings → CSV Columns). Items logged while this is off have no time recorded. Off by default.</p>
        <div class="toggle-row">
          <div class="toggle-row-text">
            <div class="toggle-row-title">Record item times</div>
            <div class="toggle-row-sub">${state.timestampsEnabled ? 'On' : 'Off'}</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="timestamps-toggle" data-change-action="timestamps" ${state.timestampsEnabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>
  `;
}

function renderSettingsBackup() {
  const stats = getStorageStats();
  const barClass = stats.pct >= 90 ? 'danger' : (stats.pct >= 70 ? 'warn' : '');
  // v14: prune suggestion — sessions exported AND older than the threshold.
  const prunable = prunableSessions();
  const ageMonths = state.pruneAgeMonths || PRUNE_AGE_DEFAULT;
  const pruneBlock = prunable.length > 0 ? `
          <div class="prune-suggestion">
            <p class="prune-suggestion-text">${prunable.length} exported session${prunable.length === 1 ? '' : 's'} older than ${ageMonths} month${ageMonths === 1 ? '' : 's'} can be cleared to free space.</p>
            <button class="backup-action-btn" id="prune-review-btn" data-action="prune-review">Review &amp; clear…</button>
          </div>
  ` : `<p class="muted" style="margin-top:10px;font-size:12px">No exported sessions older than ${ageMonths} month${ageMonths === 1 ? '' : 's'} to clear right now.</p>`;
  return `
    <div class="screen">
      ${renderSettingsSubHeader('Backup & Restore')}
      <div class="settings-section">
        <h2 class="h2">Backup</h2>
        <p class="muted">Save a complete copy of all sessions and settings as a single JSON file. Keep it somewhere safe — it's the only safety net if the browser ever clears its data.</p>
        <button class="backup-action-btn primary" id="backup-export-btn" data-action="backup-export">⬇ Export backup (.json)</button>
      </div>

      <div class="settings-section">
        <h2 class="h2">Restore</h2>
        <p class="muted">Import a previously exported backup file. <strong>This will replace all current data on this device.</strong> You'll be asked to confirm before anything is overwritten.</p>
        <input type="file" id="backup-import-file" data-change-action="backup-import-file" accept="application/json,.json" style="display:none">
        <button class="backup-action-btn danger" id="backup-import-btn" data-action="backup-import">⬆ Import backup (.json)</button>
      </div>

      <div class="settings-section">
        <h2 class="h2">Storage usage</h2>
        <div class="storage-card">
          <div class="storage-stat"><span class="storage-stat-label">Sessions</span><span class="storage-stat-value">${stats.sessions}</span></div>
          <div class="storage-stat"><span class="storage-stat-label">Items recorded</span><span class="storage-stat-value">${stats.items.toLocaleString()}</span></div>
          <div class="storage-stat"><span class="storage-stat-label">Storage used</span><span class="storage-stat-value">${formatBytes(stats.bytes)}</span></div>
          <div class="storage-stat"><span class="storage-stat-label">Approx. limit</span><span class="storage-stat-value">~5 MB</span></div>
          <div class="storage-bar-wrap"><div class="storage-bar ${barClass}" style="width:${stats.pct}%"></div></div>
          <p class="muted" style="margin-top:10px;font-size:12px">Browsers cap local data at around 5 MB. Export a backup and clear old sessions before you get close to the limit.</p>
          ${pruneBlock}
        </div>
      </div>

      <div class="settings-section">
        <h2 class="h2">Clear-old-sessions age</h2>
        <p class="muted">When a session has been exported and is older than this, it'll be offered for clearing above. Nothing is ever deleted without your confirmation.</p>
        <label class="label">Age in months</label>
        <input class="input" id="prune-age-input" type="number" inputmode="numeric" min="1" max="120" value="${ageMonths}">
        <div class="btn-row">
          <button class="btn-primary" id="prune-age-save" data-action="prune-age-save">Save</button>
        </div>
      </div>
    </div>
  `;
}

// ---------- v31: Export / Import Setup (lives on the Backup page) ----------
// Share your CONFIGURATION (presets, report settings, CSV columns, tester/cal,
// app preferences) as a small file so another device can match this one — no
// sessions are included or touched. Export uses progressive disclosure: a single
// "Share setup" button, with a collapsed "Choose what to include" list beneath
// (all on by default, so the common path is one tap). Import reads the bundle,
// confirms, and replaces only the sections it carries.
function renderSetupSection() {
  const inc = state.setupInclude || {};
  const open = !!state.setupIncludeOpen;
  const rows = SETUP_SECTIONS.map(sec => `
        <label class="setup-include-row">
          <input type="checkbox" data-change-action="setup-include-toggle" data-arg="${escapeHTML(sec.id)}" ${inc[sec.id] ? 'checked' : ''}>
          <span class="setup-include-text">
            <span class="setup-include-name">${escapeHTML(sec.label)}</span>
            <span class="setup-include-hint">${escapeHTML(sec.hint)}</span>
          </span>
        </label>`).join('');
  const errBlock = state.setupError
    ? `<p class="muted" style="color:#c0392b;margin-top:8px;font-size:13px">${escapeHTML(state.setupError)}</p>` : '';
  return `
      <div class="settings-section">
        <h2 class="h2">Share setup</h2>
        <p class="muted">Send your configuration to another phone or a new engineer so it's set up just like this one. This shares <strong>settings only</strong> — your sessions, clients and sites are never included.</p>
        <button class="backup-action-btn primary" id="setup-share-btn" data-action="setup-share">⬆ Share setup…</button>
        <button class="setup-disclose" data-action="setup-include-toggle-open" aria-expanded="${open ? 'true' : 'false'}">
          ${open ? '▾' : '▸'} Choose what to include
        </button>
        ${open ? `<div class="setup-include-list">${rows}</div>` : ''}
        ${errBlock}
      </div>

      <div class="settings-section">
        <h2 class="h2">Import setup</h2>
        <p class="muted">Load a setup file from another device. This replaces the matching settings on this phone (you'll see exactly what before it's applied). <strong>Your sessions are not touched.</strong></p>
        <input type="file" id="setup-import-file" data-change-action="setup-import-file" accept="application/json,.json" style="display:none">
        <button class="backup-action-btn" id="setup-import-btn" data-action="setup-import">⬇ Import setup (.json)</button>
      </div>
  `;
}

// v33: Export / Import Setup now has its own page in the Data category (it used
// to be appended to the Backup page). The page body is the same self-contained
// `renderSetupSection()` block, just wrapped in a screen + standard sub-header.
function renderSettingsSetup() {
  return `
    <div class="screen">
      ${renderSettingsSubHeader('Export / Import Setup')}
      <p class="muted" style="margin:0 16px 4px">Copy this device's configuration to another phone or a new engineer. <strong>Settings only</strong> — sessions, clients and sites are never shared.</p>
      ${renderSetupSection()}
    </div>
  `;
}


// Controls the column order, visibility, and header text used by buildCSV().
// Layout for each row: ↑ button, ↓ button, visibility checkbox, header text
// input, plus a "(default: X)" hint when the header has been customised. The
// up/down arrows are the primary reorder mechanism — they work reliably on
// iOS PWA where drag-and-drop is unreliable. The list re-renders on every
// arrow tap (via moveCsvColumn), which preserves user-edited but not yet
// saved header text by reading the DOM first.
//
// Save validates that at least one column is visible. Reset restores the
// defaults via resetCsvColumnsSettings().
//
// Changes here only affect exports; the in-app screens (entry, overview,
// edit) are unaffected by column hiding / renaming.
function renderSettingsCsv() {
  const cols = state.csvColumns;
  const rowsHtml = cols.map((c, i) => {
    const isFirst = i === 0;
    const isLast = i === cols.length - 1;
    const def = defaultHeaderFor(c.id);
    const hint = (c.header && c.header !== def)
      ? `<span class="csv-col-default-hint">Default: ${escapeHTML(def)}</span>`
      : '';
    return `
      <div class="csv-col-row" data-col-id="${escapeHTML(c.id)}">
        <div class="csv-col-row-top">
          <div class="csv-col-arrows">
            <button class="csv-col-arrow" data-action="csv-up" data-arg="${escapeHTML(c.id)}" data-csv-up="${escapeHTML(c.id)}" ${isFirst ? 'disabled' : ''} aria-label="Move up">▲</button>
            <button class="csv-col-arrow" data-action="csv-down" data-arg="${escapeHTML(c.id)}" data-csv-down="${escapeHTML(c.id)}" ${isLast ? 'disabled' : ''} aria-label="Move down">▼</button>
          </div>
          <label class="csv-col-vis-label">
            <input type="checkbox" class="csv-col-visible" ${c.visible ? 'checked' : ''}>
            <span>Show</span>
          </label>
        </div>
        <label class="label csv-col-header-label">Header text</label>
        <input class="input csv-col-header" value="${escapeHTML(c.header || def)}" placeholder="${escapeHTML(def)}">
        ${hint}
      </div>
    `;
  }).join('');

  return `
    <div class="screen">
      ${renderSettingsSubHeader('CSV Columns')}
      <div class="settings-section">
        <p class="muted" style="margin-top:0">Customise the columns on exported CSV files. Reorder with the arrows, untick "Show" to hide a column entirely, or edit the header text. These changes only affect the exported file — the app screens are unchanged.</p>
        <div class="csv-cols-list">${rowsHtml}</div>
      </div>

      <button class="btn-primary" id="settings-csv-save" data-action="settings-csv-save" style="margin-top:8px">Save</button>
      <button class="btn-secondary" id="settings-csv-reset" data-action="settings-csv-reset" style="margin-top:8px;width:100%">Reset to defaults</button>
    </div>
  `;
}

// ---------- v19: Clients & Sites settings page ----------
// Lists clients; tapping a client expands it to show its sites with add /
// rename / delete. Add / rename use a bottom-sheet (the same .bulk-sheet
// pattern used elsewhere) so the flow matches the rest of the app and works
// reliably on iOS PWA. Deleting confirms first (and a client delete warns about
// its sites). Nothing here changes any saved session's stored site text.
function renderSettingsClients() {
  const clients = sortedClients();

  const emptyState = clients.length === 0
    ? emptyStateHTML('🏢', 'No clients yet',
        'Add a client below, then add the sites you test at — they\'ll appear as quick picks when you start a new session.')
    : '';

  const listHtml = clients.map(c => {
    const expanded = state.clientsPage.expandedClientId === c.id;
    const sites = sitesForClient(c.id);
    const siteCount = sites.length;
    const sub = siteCount === 0 ? 'No sites' : `${siteCount} site${siteCount === 1 ? '' : 's'}`;

    const sitesBlock = expanded ? `
      <div class="client-sites">
        ${sites.length ? sites.map(s => `
          <div class="client-site-row">
            <span class="client-site-name">${escapeHTML(s.name)}</span>
            <div class="client-site-actions">
              <button class="link-btn" data-action="site-assign" data-arg="${escapeHTML(s.id)}">Move</button>
              <button class="link-btn" data-action="site-rename" data-arg="${escapeHTML(s.id)}" data-site-rename="${escapeHTML(s.id)}">Rename</button>
              <button class="link-btn danger" data-action="site-delete" data-arg="${escapeHTML(s.id)}" data-site-delete="${escapeHTML(s.id)}">Delete</button>
            </div>
          </div>
        `).join('') : `<p class="muted" style="margin:4px 0 8px">No sites for this client yet.</p>`}
        <button class="btn-secondary client-add-site-btn" data-action="site-add" data-arg="${escapeHTML(c.id)}" data-site-add="${escapeHTML(c.id)}">+ Add site</button>
      </div>
    ` : '';

    return `
      <div class="client-card${expanded ? ' expanded' : ''}">
        <button class="client-head" data-action="client-toggle" data-arg="${escapeHTML(c.id)}" data-client-toggle="${escapeHTML(c.id)}">
          <span class="client-head-text">
            <span class="client-head-name">${escapeHTML(c.name)}</span>
            <span class="client-head-sub">${escapeHTML(sub)}</span>
          </span>
          <span class="client-head-chevron">${expanded ? '⌄' : '›'}</span>
        </button>
        <div class="client-head-actions">
          <button class="link-btn" data-action="client-rename" data-arg="${escapeHTML(c.id)}" data-client-rename="${escapeHTML(c.id)}">Rename</button>
          <button class="link-btn danger" data-action="client-delete" data-arg="${escapeHTML(c.id)}" data-client-delete="${escapeHTML(c.id)}">Delete</button>
        </div>
        ${sitesBlock}
      </div>
    `;
  }).join('');

  // v26 (Q2=A / Q11=A): sites with no client, grouped under "Unassigned" at the
  // bottom. Each offers "Assign to client…" (Q3=B). Rename/Delete still apply.
  const orphans = unassignedSites();
  const unassignedHtml = orphans.length ? `
    <div class="client-card unassigned-card">
      <div class="client-head client-head-static">
        <span class="client-head-text">
          <span class="client-head-name">Unassigned</span>
          <span class="client-head-sub">${orphans.length} site${orphans.length === 1 ? '' : 's'} with no client</span>
        </span>
      </div>
      <div class="client-sites">
        ${orphans.map(s => `
          <div class="client-site-row">
            <span class="client-site-name">${escapeHTML(s.name)}</span>
            <div class="client-site-actions">
              <button class="link-btn" data-action="site-assign" data-arg="${escapeHTML(s.id)}">Assign to client…</button>
              <button class="link-btn" data-action="site-rename" data-arg="${escapeHTML(s.id)}" data-site-rename="${escapeHTML(s.id)}">Rename</button>
              <button class="link-btn danger" data-action="site-delete" data-arg="${escapeHTML(s.id)}" data-site-delete="${escapeHTML(s.id)}">Delete</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  // Bottom-sheet dialogs (one at a time). Client add/rename, then site add/rename.
  let dialog = '';
  const cd = state.clientsPage.clientDialog;
  const sd = state.clientsPage.siteDialog;
  const ad = state.clientsPage.assignDialog;
  if (cd.mode) {
    const title = cd.mode === 'add' ? 'Add client' : 'Rename client';
    dialog = `
      <div class="modal-backdrop" id="client-dialog-backdrop" data-action="client-dialog-cancel" style="z-index:300"></div>
      <div class="bulk-sheet" style="z-index:301" role="dialog" aria-label="${title}">
        <div class="bulk-sheet-handle"></div>
        <div class="bulk-sheet-header">
          <span class="fail-close-spacer"></span>
          <h3 class="bulk-sheet-title">${title}</h3>
          <button class="fail-close-btn" id="client-dialog-cancel" data-action="client-dialog-cancel" aria-label="Cancel">×</button>
        </div>
        <label class="label">Client name</label>
        <input class="input" id="client-dialog-input" data-input-action="client-name" value="${escapeHTML(cd.name)}" placeholder="e.g. Acme Ltd" autofocus>
        <button class="btn-primary" id="client-dialog-confirm" data-action="client-dialog-confirm" style="margin-top:14px">${cd.mode === 'add' ? 'Add' : 'Save'}</button>
      </div>
    `;
  } else if (sd.mode) {
    const title = sd.mode === 'add' ? 'Add site' : 'Rename site';
    const parent = sd.mode === 'add' ? clientById(sd.clientId) : (siteById(sd.editingId) ? clientById(siteById(sd.editingId).clientId) : null);
    const parentLine = parent ? `<p class="muted" style="margin:0 0 12px">Client: ${escapeHTML(parent.name)}</p>` : '';
    dialog = `
      <div class="modal-backdrop" id="site-dialog-backdrop" data-action="site-dialog-cancel" style="z-index:300"></div>
      <div class="bulk-sheet" style="z-index:301" role="dialog" aria-label="${title}">
        <div class="bulk-sheet-handle"></div>
        <div class="bulk-sheet-header">
          <span class="fail-close-spacer"></span>
          <h3 class="bulk-sheet-title">${title}</h3>
          <button class="fail-close-btn" id="site-dialog-cancel" data-action="site-dialog-cancel" aria-label="Cancel">×</button>
        </div>
        ${parentLine}
        <label class="label">Site name</label>
        <input class="input" id="site-dialog-input" data-input-action="site-name" value="${escapeHTML(sd.name)}" placeholder="e.g. Unit 4, Head Office" autofocus>
        <button class="btn-primary" id="site-dialog-confirm" data-action="site-dialog-confirm" style="margin-top:14px">${sd.mode === 'add' ? 'Add' : 'Save'}</button>
      </div>
    `;
  } else if (ad.siteId) {
    // v26 (Q3=B): assign / move a site to a client. Two stages in one sheet:
    // (1) pick/type the target client; (2) if a same-named site already exists
    // under that client, a Merge / Keep both / Cancel choice (Q14=B).
    const movingSite = siteById(ad.siteId);
    const movingName = movingSite ? movingSite.name : '';
    if (ad.clash) {
      const target = clientById(ad.clash.targetClientId);
      const keepName = movingSite ? nextFreeSiteName(ad.clash.targetClientId, movingSite.name) : '';
      dialog = `
        <div class="modal-backdrop" id="assign-dialog-backdrop" data-action="site-assign-cancel" style="z-index:300"></div>
        <div class="bulk-sheet" style="z-index:301" role="dialog" aria-label="Site name clash">
          <div class="bulk-sheet-handle"></div>
          <div class="bulk-sheet-header">
            <span class="fail-close-spacer"></span>
            <h3 class="bulk-sheet-title">Name already used</h3>
            <button class="fail-close-btn" data-action="site-assign-cancel" aria-label="Cancel">×</button>
          </div>
          <p class="muted" style="margin:0 0 14px">${escapeHTML(target ? target.name : 'That client')} already has a site called "${escapeHTML(movingName)}". What would you like to do?</p>
          <button class="btn-primary" data-action="site-assign-merge" style="margin-bottom:10px">Merge into the existing site</button>
          <button class="btn-secondary" data-action="site-assign-keepboth" style="margin-bottom:10px">Keep both — rename to "${escapeHTML(keepName)}"</button>
          <button class="link-btn" data-action="site-assign-cancel">Cancel</button>
        </div>
      `;
    } else {
      dialog = `
        <div class="modal-backdrop" id="assign-dialog-backdrop" data-action="site-assign-cancel" style="z-index:300"></div>
        <div class="bulk-sheet" style="z-index:301" role="dialog" aria-label="Assign site to client">
          <div class="bulk-sheet-handle"></div>
          <div class="bulk-sheet-header">
            <span class="fail-close-spacer"></span>
            <h3 class="bulk-sheet-title">Assign "${escapeHTML(movingName)}"</h3>
            <button class="fail-close-btn" data-action="site-assign-cancel" aria-label="Cancel">×</button>
          </div>
          <label class="label">Client</label>
          <input class="input" id="assign-dialog-input" value="${escapeHTML(ad.name)}" placeholder="Type or pick a client" list="assign-client-list" autofocus>
          <datalist id="assign-client-list">
            ${sortedClients().map(c => `<option value="${escapeHTML(c.name)}"></option>`).join('')}
          </datalist>
          <button class="btn-primary" data-action="site-assign-confirm" style="margin-top:14px">Assign</button>
        </div>
      `;
    }
  }

  // v20: rebuild-from-sessions action. Only worth showing when there are
  // sessions to scan. Non-destructive (adds missing clients/sites; never edits
  // or removes existing ones), so safe to offer alongside the manual list.
  const rebuildBlock = state.sessions.length ? `
    <div class="settings-section">
      <button class="preset-action-btn" id="clients-rebuild-btn" data-action="clients-rebuild">↻ Rebuild from my sessions</button>
      <p class="muted" style="margin:8px 0 0;font-size:12px">Scans every saved session and adds any client or site that isn't already listed. Useful after importing sessions. It only adds — it never changes or removes what's here.</p>
    </div>
  ` : '';

  return `
    <div class="screen">
      ${renderSettingsSubHeader('Clients')}
      <div class="settings-section">
        <p class="muted" style="margin-top:0">Your clients and the sites you test at. These appear as quick picks on the New Session screen. Editing or deleting here never changes sessions you've already saved.</p>
        <button class="btn-primary" id="client-add-btn" data-action="client-add" style="margin-top:4px">+ Add client</button>
      </div>
      ${emptyState}
      <div class="clients-list">${listHtml}${unassignedHtml}</div>
      ${rebuildBlock}
      ${dialog}
    </div>
  `;
}

function renderSettingsReport() {
  const rs = state.reportSettings;
  // Reusable toggle-row builder matching the SQP / Multi Pick markup. `id` is the
  // checkbox id (and its data-change-action). `on` is current state.
  const toggle = (id, title, on, sub) => `
    <div class="toggle-row">
      <div class="toggle-row-text">
        <div class="toggle-row-title">${escapeHTML(title)}</div>
        <div class="toggle-row-sub">${escapeHTML(sub || (on ? 'On' : 'Off'))}</div>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" id="${id}" data-change-action="${id}" ${on ? 'checked' : ''}>
        <span class="toggle-slider"></span>
      </label>
    </div>`;

  // Logo preview (if set) with a Remove button; otherwise a file picker.
  const logoBlock = rs.logo
    ? `<div class="report-logo-preview"><img src="${rs.logo}" alt="Company logo" style="max-width:160px;max-height:80px;display:block;margin:8px 0;border-radius:6px"></div>
       <button class="preset-action-btn preset-action-danger" id="report-logo-remove" data-action="report-logo-remove">🗑 Remove logo</button>`
    : `<button class="preset-action-btn" id="report-logo-pick-btn" data-action="report-logo-pick">⬆ Upload logo</button>`;
  const logoError = state.reportSettingsError
    ? `<p class="muted" style="color:#c0392b;margin-top:8px;font-size:12px">${escapeHTML(state.reportSettingsError)}</p>`
    : '';

  const retestMonthsVal = rs.retestMonths == null ? '' : String(rs.retestMonths);

  // v34: signature block. Preview + Replace/Remove when set; Draw + Upload
  // buttons when not. The position segmented control only shows when a signature
  // exists (no point choosing a side for nothing).
  const sigBlock = rs.signature
    ? `<div class="report-sig-preview"><img src="${rs.signature}" alt="Signature" style="max-width:200px;max-height:70px;display:block;margin:8px 0;border-radius:6px;background:#fff;padding:4px"></div>
       <div class="btn-row">
         <button class="preset-action-btn" data-action="signature-draw">✍ Draw again</button>
         <button class="preset-action-btn" data-action="signature-upload">⬆ Upload</button>
       </div>
       <button class="preset-action-btn preset-action-danger" data-action="signature-remove" style="margin-top:8px">🗑 Remove signature</button>`
    : `<div class="btn-row">
         <button class="preset-action-btn" data-action="signature-draw">✍ Draw signature</button>
         <button class="preset-action-btn" data-action="signature-upload">⬆ Upload image</button>
       </div>`;
  const sigPositionControl = rs.signature
    ? `<label class="label" style="margin-top:12px">Position on the report</label>
       <div class="sig-position-row">
         <button class="sig-position-btn ${rs.signaturePosition !== 'right' ? 'active' : ''}" data-action="signature-position" data-arg="left">Left</button>
         <button class="sig-position-btn ${rs.signaturePosition === 'right' ? 'active' : ''}" data-action="signature-position" data-arg="right">Right</button>
       </div>`
    : '';

  return `
    <div class="screen">
      ${renderSettingsSubHeader('Report Settings')}

      <div class="settings-section">
        <h2 class="h2">Reports</h2>
        <p class="muted">Turn on to produce PDF reports from your sessions. While off, the Reports button is hidden everywhere — so a freshly set-up device won't generate a report until you've configured it here and switched this on.</p>
        ${toggle('report-enabled', 'Enable reports', rs.enabled)}
      </div>

      <div class="settings-section">
        <h2 class="h2">Company details</h2>
        <p class="muted">Printed in the report header. All optional.</p>
        <label class="label">Company name</label>
        <input class="input" id="report-company-name" value="${escapeHTML(rs.companyName)}" placeholder="e.g. Birchley PAT Services">
        <label class="label">Address</label>
        <textarea class="textarea" id="report-company-address" style="min-height:80px" placeholder="Optional — printed under the company name">${escapeHTML(rs.companyAddress)}</textarea>
        <label class="label">Logo</label>
        <p class="muted" style="font-size:12px;margin-top:0">A PNG or JPEG. Large images are scaled down automatically.</p>
        ${logoBlock}
        ${logoError}
        <input type="file" id="report-logo-file" data-change-action="report-logo-file" accept="image/png,image/jpeg" style="display:none">
      </div>

      <div class="settings-section">
        <h2 class="h2">Report title</h2>
        <input class="input" id="report-title" value="${escapeHTML(rs.reportTitle)}" placeholder="Portable Appliance Test Report">
      </div>

      <div class="settings-section">
        <h2 class="h2">PDF file name</h2>
        <p class="muted">Sets the name each report file is saved with. Tap a chip to insert a detail that fills in automatically for each session. You can still rename any single report just before sharing it.</p>
        <input class="input" id="report-filename-pattern" value="${escapeHTML(rs.reportFilenamePattern || REPORT_FILENAME_DEFAULT)}" placeholder="${escapeHTML(REPORT_FILENAME_DEFAULT)}" autocapitalize="off" autocomplete="off" spellcheck="false">
        <div class="filename-token-chips">
          ${REPORT_FILENAME_TOKENS.map(t =>
            `<button type="button" class="filename-token-chip" data-action="report-filename-token" data-arg="${escapeHTML(t)}">${escapeHTML(t.replace(/[{}]/g, ''))}</button>`
          ).join('')}
        </div>
        <p class="muted" style="font-size:12px;margin-top:6px">Anything that isn't a letter or number becomes an underscore in the saved file. Leave it as <code>${escapeHTML(REPORT_FILENAME_DEFAULT)}</code> to keep the original naming.</p>
      </div>

      <div class="settings-section">
        <h2 class="h2">What to include</h2>
        ${toggle('report-show-engineer', 'Engineer name', rs.showEngineer)}
        ${toggle('report-show-instrument', 'Test instrument', rs.showInstrument)}
        ${toggle('report-show-calibration', 'Calibration details', rs.showCalibration)}
        ${toggle('report-show-fails', 'List failed items', rs.showFails, rs.showFails ? 'All items listed' : 'Passes only')}
        ${toggle('report-declaration', 'Declaration line', rs.declaration)}
      </div>

      <div class="settings-section">
        <h2 class="h2">Recommended retest</h2>
        <p class="muted">Optional. When on, the report shows a recommended retest date (test date plus the months below). This is a guidance figure for your client — the IET Code of Practice sets no fixed interval and recommends a risk-based assessment.</p>
        ${toggle('report-retest-enabled', 'Show recommended retest', rs.retestEnabled)}
        <label class="label" style="margin-top:12px">Retest period (months)</label>
        <input class="input" id="report-retest-months" type="number" inputmode="numeric" min="1" max="120" value="${escapeHTML(retestMonthsVal)}" placeholder="e.g. 12"${rs.retestEnabled ? '' : ' disabled style="opacity:.5"'}>
      </div>

      <div class="settings-section">
        <h2 class="h2">Declaration text</h2>
        <p class="muted">Printed above the signature line when the declaration is on. Edit to your own wording.</p>
        <textarea class="textarea" id="report-declaration-text" style="min-height:90px">${escapeHTML(rs.declarationText)}</textarea>
      </div>

      <div class="settings-section">
        <h2 class="h2">Signature</h2>
        <p class="muted">Optional. Add your signature and it prints on the declaration line of every report. Draw it on screen, or upload a PNG/JPEG image. The blank signing line is used if you don't add one.</p>
        ${sigBlock}
        ${sigPositionControl}
        <input type="file" id="report-signature-file" data-change-action="report-signature-file" accept="image/png,image/jpeg" style="display:none">
      </div>

      <button class="btn-primary" id="settings-report-save" data-action="settings-report-save" style="margin-top:8px">Save</button>
    </div>
  `;
}

function computeEarthLimit(csaKey, lengthM) {
  const r = CSA_RESISTANCE[csaKey];
  if (r === undefined) return null;
  const limit = 0.1 + (lengthM * r);
  return limit;
}

function formatLengthOption(m) {
  // Show whole-metre values without decimals, sub-metre with the fractional value.
  return Number.isInteger(m) ? `${m} m` : `${m} m`;
}

function renderSettingsCalculator() {
  const csaOptions = Object.keys(CSA_RESISTANCE).map(k =>
    `<option value="${k}"${state.calcCsa === k ? ' selected' : ''}>${k} mm²</option>`
  ).join('');

  const lengthOptions = CALC_LENGTHS.map(L =>
    `<option value="${L}"${Number(state.calcLength) === L ? ' selected' : ''}>${formatLengthOption(L)}</option>`
  ).join('');

  const limit = computeEarthLimit(state.calcCsa, Number(state.calcLength));
  const limitText = limit === null ? '—' : `${limit.toFixed(2)} Ω`;
  const r = CSA_RESISTANCE[state.calcCsa];
  const workings = r === undefined ? '' :
    `(0.1 + (${state.calcLength} × ${r})) Ω`;

  return `
    <div class="screen">
      ${renderSettingsSubHeader('Resistance Calculator')}

      <div class="settings-section">
        <h2 class="h2">Earth Continuity Limit</h2>
        <p class="muted">For a Class I appliance, the earth continuity limit is (0.1 + R) Ω, where R is the resistance of the protective conductor in the supply cable. Values from IET Code of Practice Table V1.1.</p>

        <label class="label">CSA (cable cross-section)</label>
        <select class="input" id="calc-csa" data-change-action="calc-csa">${csaOptions}</select>

        <label class="label">Length</label>
        <select class="input" id="calc-length" data-change-action="calc-length">${lengthOptions}</select>

        <div class="calc-result-card">
          <div class="calc-result-label">Earth limit</div>
          <div class="calc-result-value">${limitText}</div>
          <div class="calc-result-formula">${workings}</div>
        </div>
      </div>

      <div class="info-card" style="margin-top:20px">
        <p class="muted">High readings are often down to test procedure rather than the appliance — contact resistance on the plug, test-lead resistance not nulled, or fortuitous contact with unearthed metalwork. Clean the earth pin, null the leads, and use the high-current (hard) test where possible.</p>
      </div>
    </div>
  `;
}

function renderSettingsAbout() {
  return `
    <div class="screen">
      ${renderSettingsSubHeader('About')}
      <div class="info-card">
        <h2>PAT Test ${APP_VERSION}</h2>
        <p>A fast, offline-first portable appliance testing app for working PAT engineers. Built around speed of data entry — pass/fail decisions in two taps, no fighting the interface.</p>
        <p>Your data stays on your device. Nothing is uploaded, no account needed, no signal required once installed. The app is in active testing and ships refinements regularly — if something breaks or you've an idea for what's next, get in touch via the Contact page.</p>
      </div>

      <!-- v8: rolling 3-version changelog. v34: rolled forward — V34 on top, V31 dropped. -->
      <div class="info-card">
        <h3>What's new</h3>

        <p><strong>V34</strong> · June 2026</p>
        <p class="muted">Sign your reports. You can now add your signature to PDF reports — draw it on screen with a finger or stylus, or upload an image of it — under Settings → Report Settings → Signature. Once set, it prints on the declaration line of every report, and you can choose whether it sits to the left or right, or replace and remove it any time. The plain signing line still shows if you'd rather sign by hand. None of your existing data is affected.</p>

        <p><strong>V33</strong> · June 2026</p>
        <p class="muted">A guided first-time setup. Open the app on a brand-new phone and a short walkthrough helps get it ready — either by importing the settings from another device or starting clean — which makes kitting out a new engineer quick. Export / Import Setup now has its own row under Settings → Data instead of sitting at the foot of the Backup page, and you can re-run the walkthrough any time from Settings → Help. None of your existing data is affected.</p>

        <p><strong>V32</strong> · June 2026</p>
        <p class="muted">Settings has a new home. Everything is now grouped into clear sections — User &amp; Calibration, Testing Setup, Reports &amp; Output, App &amp; Display, Data and Help — with a search box at the top that jumps straight to any page. Empty screens now point you to the next step, headings and back buttons behave consistently throughout, and this About page has been tidied. Every setting works exactly as before — just easier to find — and all your data is untouched.</p>
      </div>

      <div class="info-card">
        <h3>Set up another device</h3>
        <p class="muted">Walk through the first-time setup again on this phone — useful for re-importing a setup file or refreshing your details.</p>
        <button class="backup-action-btn" id="about-restart-onboarding" data-action="restart-onboarding" style="margin-top:8px">↻ Run first-time setup again</button>
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

function renderSettingsContact() {
  return `
    <div class="screen">
      ${renderSettingsSubHeader('Contact')}
      <div class="info-card">
        <h2>Get in touch</h2>
        <p>Feedback, bug reports, and feature requests are all welcome. Tell us what you're testing, where the app slowed you down, and what would have made it faster.</p>

        <h3>Email</h3>
        <p class="muted">[contact email — to be added]</p>

        <h3>Web</h3>
        <p class="muted">[website — to be added]</p>

        <h3>Support hours</h3>
        <p class="muted">[support hours — to be added]</p>
      </div>
      <div class="info-card">
        <h3>What to include in a bug report</h3>
        <p>If something's gone wrong, the more of this you can include the better:</p>
        <p class="muted">• What you were trying to do<br>• What happened instead<br>• Your phone model and OS version<br>• The app version (currently ${APP_VERSION})<br>• Any error messages on screen</p>
      </div>
    </div>
  `;
}
