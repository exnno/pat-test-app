/*!
 * PATGo PWA — render-review.js (review & manage screens)
 * v72 (August 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PATGo PWA — v72 — Render: review screens ==============
// Overview (+ its body/refresh helpers), Edit Session, Retest Reminders, the
// Reports hub, and the shared photo-evidence markup. Extracted from
// render-core.js in V72. Every block below is BYTE IDENTICAL to its V71 form —
// the release is a move, not a rewrite. Proved by reassembly: the stripped
// render-core.js plus this block, joined at the original offset, hashes equal to
// the V71 render-core.js.
//
// The seam: render-core.js keeps `const app`, the render() dispatcher and the
// two screens an engineer lives in while working (Sessions, Entry). This file
// takes the screens you reach to review or manage work already logged. render()
// itself was not touched by the split.
//
// ⚠ This file declares NO top-level const/let, deliberately. Everything here is
// a function, so cross-file calls resolve at call time and the load position is
// a readability choice, not a correctness constraint (unlike data.js → state.js).
//
// ⚠ Cross-file coupling, both directions:
//   • renderEntry() (render-core.js) calls renderFailPhotoStripInner() and
//     renderPhotoStripSheet() from here — the photo markup is shared between the
//     entry screen's fail sheet and the Overview, which is why it stayed with
//     the Overview rather than being duplicated.
//   • dispatch.js calls refreshOverviewBody() and refreshOverviewSelection().
//   • session.js calls computeVisibleOverviewItems() and
//     renderFailPhotoStripInner().
// Boot probe for this file: `renderOverview` in requiredFns (boot.js).

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
