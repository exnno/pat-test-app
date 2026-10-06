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
          // v89 (3A): photos only in the cloud count too, with a ☁ when any are
          // not on this phone. Signed out, it is this phone's photos, as before.
          const photoN = (it.result === 'fail' && it.id)
            ? ((typeof photoCountForItemAll === 'function') ? photoCountForItemAll(it.id) : photoCountForItem(it.id)) : 0;
          const photoCloudN = (photoN && typeof photoCloudOnlyCountForItem === 'function') ? photoCloudOnlyCountForItem(it.id) : 0;
          const photoMark = photoCloudN ? ' ☁' : '';
          const photoChip = !photoN ? ''
            : (sel
              ? `<span class="photo-chip is-static">📷 ${photoN}${photoMark}</span>`
              : `<button class="photo-chip" data-action="photo-strip-open" data-arg="${escapeHTML(it.id)}" aria-label="View ${photoN} photo${photoN === 1 ? '' : 's'}${photoCloudN ? `, ${photoCloudN} in the cloud only` : ''}">📷 ${photoN}${photoMark}</button>`);
          // V99 (6A, 9A): 📍 on any item with a map pin, switch on or off. Static —
          // tapping the row opens the item, where the pin is.
          const itPin = (typeof mapPinOf === 'function') ? mapPinOf(it) : '';
          const pinChip = itPin ? `<span class="pin-chip" title="${escapeHTML('///' + itPin)}" aria-label="Map pin ${escapeHTML(itPin)}">📍</span>` : '';
          return `
            <tr class="${rowClass}" ${rowAttr}>
              ${checkCol}
              <td class="td">${escapeHTML(it.assetNo)}</td>
              <td class="td">${escapeHTML(it.location)}</td>
              <td class="td">${escapeHTML(it.itemType)}${timeLine}</td>
              <td class="td td-result ${it.result || ''}">${capitalise(it.result || '')}${photoChip}${pinChip}</td>
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
      <header class="header-row header-sticky">
        <button class="icon-btn" id="cancel-selection-btn" data-action="cancel-selection" aria-label="Cancel selection">✕</button>
        <div class="site-name">${n} selected</div>
        <span style="width:40px"></span>
      </header>
    `;
  } else {
    header = `
      <header class="header-row header-sticky">
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
        <button class="bulk-menu-btn bulk-menu-move" id="bulk-move-btn" data-action="move-job-open">Move to a new job\u2026</button>
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
  //
  // v76: the grid scrolls; the input and Apply button are pinned. ⚠ THIS IS THE
  // WORST OF THE THREE growth cases, for two reasons that compound. The grid is
  // EVERY item type in the active preset — the entry screen shows nine, a preset
  // can hold far more — and this sheet also puts the keyboard up, so it is
  // fighting the reduced --sheet-max at the same time. The pins go on the markup
  // and not on .input-big or .btn-primary, which are used all over the app.
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
      <div class="quick-grid sheet-scroll" style="margin-bottom:10px">${typeQuickButtons}</div>
      <input class="input-big sheet-pin" id="bulk-type-input" data-input-action="bulk-type" value="${escapeHTML(state.bulkEdit.typeValue)}" placeholder="…or type custom" autocomplete="off" style="margin-bottom:14px">
      <button class="btn-primary sheet-pin" id="bulk-type-apply" data-action="bulk-type-apply">Apply to ${state.selectedIndices.length} item${state.selectedIndices.length === 1 ? '' : 's'}</button>
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

  // V98 (2A, 3A): the site's notes, at the top of the job — door codes and the
  // like, read on arrival. They belong to the SITE (never copied into the job,
  // never printed — 4A), so they show and can be edited on a locked job too.
  // Hidden while selecting items, like the job details.
  const notesSite = state.selectionMode ? null : siteForSession(sess);
  const notesText = siteNotesOf(notesSite);
  const siteNotes = !notesSite ? '' : (notesText ? `
      <button type="button" class="site-notes-card" id="site-notes-card" data-action="site-notes-open">
        <span class="site-notes-head">📝 Site notes &middot; ${escapeHTML(notesSite.name)}</span>
        <span class="site-notes-text">${escapeHTML(notesText)}</span>
        <span class="site-notes-more">Tap to read all or edit</span>
      </button>` : `
      <button type="button" class="link-btn site-notes-add" id="site-notes-add" data-action="site-notes-open">+ Add site notes</button>`);
  const sn = state.siteNotesSheet;
  const snSite = sn ? siteById(sn.siteId) : null;
  const siteNotesSheet = sn ? `
      <div class="modal-backdrop" id="site-notes-backdrop" data-action="site-notes-cancel" style="z-index:300"></div>
      <div class="bulk-sheet" style="z-index:301" role="dialog" aria-label="Site notes">
        <div class="bulk-sheet-handle"></div>
        <div class="bulk-sheet-header">
          <span class="fail-close-spacer"></span>
          <h3 class="bulk-sheet-title">Site notes</h3>
          <button class="fail-close-btn" id="site-notes-cancel" data-action="site-notes-cancel" aria-label="Cancel">×</button>
        </div>
        <p class="muted" style="margin:0 0 10px">${escapeHTML(snSite ? snSite.name : 'This site')} &middot; shown in every job here. Only for you &mdash; never printed on a report.</p>
        <textarea class="textarea site-notes-input" id="site-notes-input" data-input-action="site-notes-text" maxlength="${SITE_NOTES_MAX}" rows="8" placeholder="e.g. Door code 1234. Keys from reception. Server room on the 2nd floor &mdash; ask for Dave.">${escapeHTML(sn.text || '')}</textarea>
        <button class="btn-primary" id="site-notes-save" data-action="site-notes-save" style="margin-top:12px">Save</button>
      </div>` : '';

  return `
    <div class="screen">
      ${header}
      ${stats}
      ${siteNotes}
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
      ${siteNotesSheet}
      ${renderMoveJobSheet(sess)}
    </div>
  `;
}

// V101 (Stage 9, split): Move to a new job. Three steps in one sheet slot —
// 'form' (what is moving, then client + site, More details), 'confirm' (the
// "Are you sure?" — buttons only, so a repaint is allowed) and 'blocked' (why
// not). The form's fields write state on input (data-input-action) and the sheet
// never renders itself while open (MAP rule 3). Logic: session.js.
function renderMoveJobSheet(sess) {
  const m = state.moveJob;
  if (!m || !sess || String(m.from) !== String(sess.id)) return '';
  const head = (title) => `
      <div class="modal-backdrop" id="move-job-backdrop" data-action="move-job-close"></div>
      <div class="bulk-sheet move-job-sheet" role="dialog" aria-label="${escapeHTML(title)}">
        <div class="bulk-sheet-handle"></div>
        <div class="bulk-sheet-header">
          <span class="fail-close-spacer"></span>
          <h3 class="bulk-sheet-title">${escapeHTML(title)}</h3>
          <button class="fail-close-btn" id="move-job-close" data-action="move-job-close" aria-label="Cancel">\u00d7</button>
        </div>`;
  if (m.step === 'blocked') {
    return head('Can\u2019t move these items') + `
        <p class="move-job-why">${escapeHTML(m.why || '')}</p>
        <button class="btn-primary" id="move-job-ok" data-action="move-job-close">OK</button>
      </div>`;
  }
  const sum = moveJobSummary(sess, m.ids);
  const n = sum.n;
  const plural = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`;
  if (m.step === 'confirm') {
    const from = sess.site || sess.name || 'this job';
    const to = moveJobTitle(m.client, m.site);
    const bits = [plural(n, 'item')];
    if (sum.fails) bits.push(plural(sum.fails, 'fail'));
    if (sum.photos) bits.push(plural(sum.photos, 'photo'));
    const cert = (sess.certNo || sess.reportAt) ? `
        <p class="move-job-warn">\u26a0 A certificate has already been made for this job${sess.certNo ? ' (No. ' + escapeHTML(sess.certNo) + ')' : ''}. It lists these items \u2014 make it again after moving. This job keeps its certificate number; the new job gets its own.</p>` : '';
    const goes = (sum.photos || sum.pins) ? `
        <p class="muted move-job-note">Their ${[sum.photos ? 'photos' : '', sum.pins ? 'map pins' : ''].filter(Boolean).join(' and ')} go with them.</p>` : '';
    return head('Are you sure?') + `
        <p class="move-job-msg">Move ${escapeHTML(bits.join(' \u00b7 '))} from <strong>${escapeHTML(from)}</strong> to a new job for <strong>${escapeHTML(to)}</strong>?</p>${cert}${goes}
        <button class="btn-primary" id="move-job-go" data-action="move-job-go">Move ${plural(n, 'item')}</button>
        <button class="btn-secondary move-job-back" id="move-job-back" data-action="move-job-back">Back</button>
      </div>`;
  }
  // 'form'
  const rows = sum.items.map((it) => {
    const res = it.result === 'fail' ? '<span class="fail-text">FAIL</span>' : (it.result === 'pass' ? '<span class="pass-text">PASS</span>' : '');
    const ph = (typeof photoCountForItemAll === 'function') ? photoCountForItemAll(it.id) : 0;
    const bits = [it.assetNo, it.itemType, it.location].filter(x => x != null && String(x).trim() !== '').map(x => escapeHTML(String(x)));
    return `<li class="move-job-item"><span>${bits.join(' \u00b7 ') || '(no details)'}</span> ${res}${ph ? ' \ud83d\udcf7' + ph : ''}${mapPinOf(it) ? ' \ud83d\udccd' : ''}</li>`;
  }).join('');
  const clientOpts = Array.from(new Set((state.clients || []).map(c => c && c.name).filter(Boolean)))
    .map(x => `<option value="${escapeHTML(x)}"></option>`).join('');
  const siteOpts = Array.from(new Set((state.sites || []).map(x => x && x.name).filter(Boolean)))
    .map(x => `<option value="${escapeHTML(x)}"></option>`).join('');
  const insts = (typeof instrumentList === 'function') ? instrumentList() : [];
  const tester = insts.length ? `
            <label class="label" for="move-job-tester">Tester</label>
            <select class="input" id="move-job-tester" data-change-action="move-job-field" data-arg="instrumentId">
              <option value=""${m.instrumentId ? '' : ' selected'}>The tester in use</option>
              ${insts.map(i => `<option value="${escapeHTML(String(i.id))}"${String(i.id) === String(m.instrumentId) ? ' selected' : ''}>${escapeHTML(instrumentDisplayName(i))}</option>`).join('')}
            </select>` : '';
  const field = (id, key, label, extra) => `
            <label class="label" for="${id}">${label}</label>
            <input class="input" id="${id}" data-input-action="move-job-field" data-arg="${key}" value="${escapeHTML(m[key] || '')}" ${extra || ''}>`;
  return head(`Move ${plural(n, 'item')} to a new job`) + `
        <div class="sheet-scroll move-job-scroll">
          <p class="muted move-job-note">Moving:</p>
          <ul class="move-job-list">${rows}</ul>
          <label class="label" for="move-job-client">New job\u2019s client</label>
          <input class="input" id="move-job-client" data-input-action="move-job-field" data-arg="client" value="${escapeHTML(m.client || '')}" list="move-job-clients" autocomplete="off" placeholder="Client">
          <datalist id="move-job-clients">${clientOpts}</datalist>
          <label class="label" for="move-job-site">New job\u2019s site</label>
          <input class="input" id="move-job-site" data-input-action="move-job-field" data-arg="site" value="${escapeHTML(m.site || '')}" list="move-job-sites" autocomplete="off" placeholder="Site">
          <datalist id="move-job-sites">${siteOpts}</datalist>
          <details class="move-job-more">
            <summary>More details</summary>
            ${field('move-job-name', 'name', 'Job name', 'autocomplete="off"')}
            ${field('move-job-date', 'date', 'Date', 'type="date"')}
            ${field('move-job-engineer', 'engineer', 'Engineer', 'autocomplete="off"')}
            ${tester}
            ${field('move-job-prefix', 'prefix', 'Asset prefix', 'autocomplete="off" autocapitalize="characters"')}
            <p class="muted move-job-note">Copied from this job. Job notes, the certificate number and the lock stay here.</p>
          </details>
        </div>
        <p class="move-job-error" id="move-job-error" role="alert">${escapeHTML(m.error || '')}</p>
        <button class="btn-primary sheet-pin" id="move-job-continue" data-action="move-job-continue">Continue</button>
      </div>`;
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
      const dueStr = retestMonthLabel(sess.date, months);   // V87: "September 2027"
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
            <div class="lock-toggle-sub">Due ${dueStr ? '<strong>' + escapeHTML(dueStr) + '</strong>' : '—'} (the month of this test + the interval below — a retest is due for the whole month). This job is on your chase list.</div>
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
      const dueStr = retestDueLabel(s);   // V87: the due MONTH, e.g. "September 2027"
      const chipCls = st === 'overdue' ? 'retest-chip-overdue'
        : (st === 'duesoon' ? 'retest-chip-soon' : 'retest-chip-upcoming');
      const chipLabel = retestChipLabel(st);
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
    // v89 (2A): a photo only in the cloud is a tile with a ☁ — its preview once
    // fetched, a plain cloud until then. Tapping it downloads it.
    const tile = (p, i) => {
      if (!p.cloud) return `<img src="${p.url}" alt="Photo ${i + 1}" loading="lazy">`;
      const inner = p.url
        ? `<img src="${p.url}" alt="Photo ${i + 1}, in the cloud" loading="lazy">`
        : `<span class="photo-cloud-blank" aria-hidden="true">☁</span>`;
      return `<button class="photo-cloud-tile${p.busy ? ' is-busy' : ''}" data-action="photo-download" data-arg="${escapeHTML(p.id)}" aria-label="Download photo ${i + 1}" ${p.busy ? 'disabled' : ''}>
              ${inner}
              <span class="photo-cloud-badge">${p.busy ? 'Downloading…' : '☁ Tap to download'}</span>
            </button>`;
    };
    body = `
      <div class="photo-strip-grid">
        ${photos.map((p, i) => `
          <figure class="photo-strip-item${p.cloud ? ' is-cloud' : ''}">
            ${tile(p, i)}
            <figcaption>
              <span class="photo-strip-size">${escapeHTML(formatBytes(p.bytes || 0))}${p.cloud ? ' · cloud' : ''}</span>
              <button class="photo-strip-delete" data-action="photo-delete" data-arg="${escapeHTML(p.id)}" aria-label="Delete photo ${i + 1}">Delete</button>
            </figcaption>
          </figure>
        `).join('')}
      </div>
    `;
  }
  const cloudTiles = photos.filter((p) => p.cloud);
  const cloudBytes = cloudTiles.reduce((n, p) => n + (p.bytes || 0), 0);
  const anyBusy = cloudTiles.some((p) => p.busy);
  const downloadAll = cloudTiles.length >= 2
    ? `<button class="photo-add-btn wide photo-download-all" data-action="photo-download-all" ${anyBusy ? 'disabled' : ''}>☁ Download all (${cloudTiles.length} · ${escapeHTML(formatBytes(cloudBytes))})</button>`
    : '';

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
      ${downloadAll}
      ${addControl}
      <input type="file" id="photo-strip-file" data-change-action="photo-strip-file" accept="image/*" style="display:none">
    </div>
  `;
}

// ============== V90 (R18) — the photo manager screen ==============
// Settings → Backup → Manage photos. Markup only; the logic is in
// settings-actions.js (photoMgrModel and the photoMgr* actions). Read-only apart
// from two selects, so it may render freely (MAP rule 3). Previews are painted
// into #pm-t-<id> in place as they arrive; a render simply shows the cached one.
function _pmWhenUK(iso) {
  const d = new Date(iso);
  if (!iso || isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function _pmItemLabel(e) {
  const sess = (state.sessions || []).find((s) => s && String(s.id) === e.s);
  const it = sess && Array.isArray(sess.items) ? sess.items.find((x) => x && String(x.id) === e.i) : null;
  if (!it) return 'Photo';
  const bits = [it.assetNo, it.itemType, it.location].map((x) => String(x || '').trim()).filter(Boolean);
  return bits.length ? bits.join(' \u00b7 ') : 'Photo';
}

function _pmTile(e, pm, vis) {
  const sel = !!pm.selected[e.id];
  const url = photoThumbCached(e.id);
  const inner = url
    ? `<img src="${escapeHTML(url)}" alt="" loading="lazy">`
    : `<span class="pm-thumb-blank" aria-hidden="true">${e.local ? '\ud83d\udcf7' : '\u2601'}</span>`;
  const badge = !vis ? '' : (!e.local ? '\u2601 Cloud only' : (!e.cloud ? 'Not uploaded' : ''));
  const label = `${e.local ? 'Photo on this phone' : 'Photo in the cloud'}${sel ? ', selected' : ''}`;
  return `<button class="pm-tile${sel ? ' is-selected' : ''}${e.local ? '' : ' is-cloud'}" data-action="pm-tile" data-arg="${escapeHTML(e.id)}" aria-label="${label}">
      <span class="pm-thumb" id="pm-t-${escapeHTML(e.id)}">${inner}</span>
      ${badge ? `<span class="pm-badge">${badge}</span>` : ''}
      ${pm.selecting ? `<span class="pm-tick" aria-hidden="true">${sel ? '\u2713' : ''}</span>` : ''}
    </button>`;
}

function _pmPreviewSheet(m, pm) {
  const p = pm.preview;
  if (!p) return '';
  const e = m.byId.get(p.id);
  if (!e) return '';
  const vis = m.vis;
  const img = p.url
    ? `<img src="${escapeHTML(p.url)}" alt="Photo">`
    : `<span class="pm-thumb-blank">${p.loading ? 'Loading\u2026' : '\u2601 No preview yet'}</span>`;
  const where = !vis ? 'On this phone'
    : (!e.local ? 'Only in the cloud' : (e.cloud ? 'On this phone and in the cloud' : 'On this phone \u00b7 not uploaded yet'));
  const job = [e.client, e.title, formatDate(e.date)].filter(Boolean).join(' \u00b7 ');
  const taken = _pmWhenUK(e.a);
  const lines = [
    job,
    [taken ? `Taken ${taken}` : '', e.b ? formatBytes(e.b) : ''].filter(Boolean).join(' \u00b7 '),
    where + (e.local ? '' : (e.onPhone ? '' : ' \u00b7 its job isn\u2019t on this phone')),
  ].filter(Boolean);
  const btns = [];
  if (vis && !e.local && e.src === 'known' && e.onPhone) btns.push(`<button class="btn-primary" data-action="pm-download" data-arg="${escapeHTML(e.id)}">\u2601 Download</button>`);
  if (vis && e.local && e.cloud) btns.push(`<button class="btn-secondary" data-action="pm-remove" data-arg="${escapeHTML(e.id)}">Remove from phone</button>`);
  if (e.locked) btns.push(`<p class="muted pm-note">\ud83d\udd12 This job is locked. Unlock it to delete its photos.</p>`);
  else if (e.local || vis) btns.push(`<button class="btn-danger" data-action="pm-delete" data-arg="${escapeHTML(e.id)}">${vis ? 'Delete everywhere' : 'Delete'}</button>`);
  return `
    <div class="modal-backdrop" data-action="pm-preview-close"></div>
    <div class="bulk-sheet" role="dialog" aria-label="Photo">
      <div class="bulk-sheet-handle"></div>
      <div class="bulk-sheet-header">
        <span class="fail-close-spacer"></span>
        <h3 class="bulk-sheet-title">${escapeHTML(e.onPhone ? _pmItemLabel(e) : 'Photo')}</h3>
        <button class="fail-close-btn" data-action="pm-preview-close" aria-label="Close">&times;</button>
      </div>
      <div class="sheet-scroll">
        <div class="pm-preview-img">${img}</div>
        ${lines.map((l) => `<p class="muted pm-preview-line">${escapeHTML(l)}</p>`).join('')}
      </div>
      <div class="sheet-pin pm-preview-actions">${btns.join('')}</div>
    </div>
  `;
}

function renderPhotoManager() {
  const pm = state.photoMgr;
  const m = photoMgrModel();
  const vis = m.vis;
  const t = m.totals;
  const nSel = Object.keys(pm.selected || {}).filter((id) => m.byId.has(id)).length;
  const anything = m.byId.size > 0;
  const plural = (n) => `${n} photo${n === 1 ? '' : 's'}`;

  const header = `
    <header class="header-row">
      <button class="icon-btn" data-action="pm-back" aria-label="Back">\u2039</button>
      <div class="site-name">Manage Photos</div>
      ${anything ? `<button class="pm-select-btn" data-action="pm-select-toggle" ${pm.busy ? 'disabled' : ''}>${pm.selecting ? 'Done' : 'Select'}</button>` : '<span style="width:40px"></span>'}
    </header>`;

  // 3A: the cloud read is a tap, never automatic.
  const cl = pm.cloud;
  let look = '';
  if (vis) {
    if (cl && cl.loading) {
      look = `<p class="muted pm-note">Looking in the cloud\u2026</p>`;
    } else {
      // V90.1 (Peter): a small secondary link, not a big button — it is not a
      // sync, and each look reads the whole photo list. After a look, one line
      // says what it found beyond this phone's jobs.
      if (cl && cl.ok && cl.at) {
        const when = escapeHTML(new Date(cl.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
        const parts = [];
        if (t.awayN) parts.push(`${plural(t.awayN)} from ${t.awayJobs} job${t.awayJobs === 1 ? '' : 's'} not on this phone`);
        if (t.orphanN) parts.push(`${plural(t.orphanN)} with no job`);
        const found = parts.length
          ? 'Found ' + parts.join(' \u00b7 ')
          : 'Nothing extra \u2014 every cloud photo belongs to a job on this phone.';
        look = `
        <p class="pm-note pm-found" role="status">${found}</p>
        <p class="muted pm-note">Checked at ${when}${cl.capped ? ' \u00b7 very large account: the first 20,000 photos are shown' : ''} \u00b7 <button class="pm-look-link" data-action="pm-look">Look again</button></p>
`;
      } else {
        look = `
        <p class="muted pm-note">Photos of jobs not on this phone? <button class="pm-look-link" data-action="pm-look">Look in the cloud</button></p>
`;
      }
      look += `        ${cl && cl.error ? `<p class="pm-note pm-error">${escapeHTML(cl.error)}</p>` : ''}`;
    }
  }

  const totals = `
    <div class="settings-section pm-totals">
      <div class="pm-total-row"><span>\ud83d\udcf1 On this phone</span><strong>${plural(t.phoneN)} \u00b7 ${escapeHTML(formatBytes(t.phoneB))}</strong></div>
      ${vis ? `<div class="pm-total-row"><span>\u2601 In the cloud${t.cloudAll ? '' : ' <span class="muted">(jobs on this phone)</span>'}</span><strong>${plural(t.cloudN)} \u00b7 ${escapeHTML(formatBytes(t.cloudB))}</strong></div>` : ''}
      ${look}
    </div>`;

  const opt = (v, cur, label) => `<option value="${v}"${cur === v ? ' selected' : ''}>${label}</option>`;
  const controls = anything ? `
    <div class="list-controls">
      ${vis ? `<label class="control-field">
        <span class="control-label">Show</span>
        <select class="sort-select" data-change-action="pm-filter">
          ${opt('all', m.filter, 'All')}${opt('phone', m.filter, 'On this phone')}${opt('cloud', m.filter, 'Cloud only')}${opt('notup', m.filter, 'Not uploaded yet')}
        </select>
      </label>` : ''}
      <label class="control-field">
        <span class="control-label">Sort jobs</span>
        <select class="sort-select" data-change-action="pm-sort">
          ${opt('newest', pm.sort, 'Newest')}${opt('oldest', pm.sort, 'Oldest')}${opt('space', pm.sort, 'Most space')}
        </select>
      </label>
    </div>` : '';

  const busy = pm.busy ? `<p class="pm-busy" id="pm-busy" role="status">${escapeHTML(pm.busy)}</p>` : '';

  let body;
  if (!m.total) {
    body = !anything
      ? emptyStateHTML('\ud83d\udcf7', 'No photos yet', 'Photos are added from the FAIL screen. They\u2019ll appear here, grouped by job.')
      : `<p class="muted pm-note">No photos match this filter.</p>`;
  } else {
    body = m.groups.map((g) => {
      const allSel = g.photos.every((e) => pm.selected[e.id]);
      const sub = g.orphan
        ? [`Their job was deleted, or never reached the cloud`, `${plural(g.photos.length)} \u00b7 ${formatBytes(g.bytes)}`]
        : [g.client, formatDate(g.date), `${plural(g.photos.length)} \u00b7 ${formatBytes(g.bytes)}`, g.onPhone ? '' : 'not on this phone'];
      return `
        <section class="pm-group">
          <div class="pm-group-head">
            ${pm.selecting ? `<button class="pm-group-tick${allSel ? ' is-on' : ''}" data-action="pm-select-job" data-arg="${escapeHTML(g.key)}" aria-label="${allSel ? 'Deselect' : 'Select'} every photo in this job">${allSel ? '\u2713' : ''}</button>` : ''}
            <div class="pm-group-text">
              <div class="pm-group-title">${g.locked ? '<span class="session-lock" title="Locked">\ud83d\udd12</span>' : ''}${escapeHTML(g.title)}</div>
              <div class="pm-group-sub">${escapeHTML(sub.filter(Boolean).join(' \u00b7 '))}</div>
            </div>
          </div>
          <div class="pm-grid">${g.shown.map((e) => _pmTile(e, pm, vis)).join('')}</div>
        </section>`;
    }).join('');
    if (m.more) body += `<button class="backup-action-btn pm-more" data-action="pm-more">Show more (${m.more} more)</button>`;
  }

  let bar = '';
  if (pm.selecting) {
    const sel = Object.keys(pm.selected || {}).map((id) => m.byId.get(id)).filter(Boolean);
    const bytes = sel.reduce((n, e) => n + (e.b || 0), 0);
    const canRemove = sel.some((e) => e.local && e.cloud);
    const canDown = sel.some((e) => !e.local && e.src === 'known' && e.onPhone);
    const canDel = sel.some((e) => !e.locked && (e.local || vis));
    const off = (ok) => (ok && !pm.busy) ? '' : 'disabled';
    bar = `
      <div class="selection-bar pm-bar">
        <span class="selection-bar-count">${nSel} selected${nSel ? ` \u00b7 ${escapeHTML(formatBytes(bytes))}` : ''}</span>
        ${vis ? `<button class="selection-bar-action pm-bar-btn" data-action="pm-remove" ${off(canRemove)}>Remove from phone</button>
        <button class="selection-bar-action pm-bar-btn" data-action="pm-download" ${off(canDown)}>Download</button>` : ''}
        <button class="selection-bar-action pm-bar-btn is-danger" data-action="pm-delete" ${off(canDel)}>${vis ? 'Delete everywhere' : 'Delete'}</button>
      </div>`;
  }

  return `
    <div class="screen pm-screen">
      ${header}
      ${totals}
      ${controls}
      ${busy}
      ${body}
    </div>
    ${bar}
    ${_pmPreviewSheet(m, pm)}
  `;
}

// ============== V91 (roadmap Stage 4) — Jobs on this phone ==============
// Settings → Backup → Jobs on this phone (5A). Logic in settings-actions.js
// (jobMgr*, tidy*). Signed in only — signed out it is never linked; a stray
// visit shows a line saying so. 🛡 = on this phone AND safe in the cloud;
// ☁ stays "only in the cloud" (Peter, V91 4A — Stage 5 relies on it).

// The tidy-up block (8A/9A) — the offer's two actions, also shown at the top of
// this screen. '' when there is nothing to tidy.
function renderTidyBlock(m, cls) {
  if (!m || !m.active || (!m.jobs.length && !m.photos.length)) return '';
  const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const lines = [];
  if (m.jobs.length) {
    lines.push(`
        <div class="tidy-row">
          <span class="tidy-text">${pl(m.jobs.length, 'job')} older than ${pl(m.jobAge, 'month')} (${pl(m.jobItems, 'item')})</span>
          <button class="backup-action-btn tidy-btn" data-action="tidy-jobs">Remove from phone</button>
        </div>`);
  }
  if (m.photos.length) {
    lines.push(`
        <div class="tidy-row">
          <span class="tidy-text">${pl(m.photos.length, 'photo')} older than ${pl(m.photoAge, 'month')} (${escapeHTML(formatBytes(m.photoBytes))})</span>
          <button class="backup-action-btn tidy-btn" data-action="tidy-photos">Remove from phone</button>
        </div>`);
  }
  return `
      <div class="tidy-block ${cls || ''}">
        <p class="tidy-lead">Safe in the cloud and can come off this phone:</p>
        ${lines.join('')}
      </div>`;
}

function renderJobManager() {
  const jm = state.jobMgr || {};
  const m = jobMgrModel();
  const header = `
    <header class="header-row">
      <button class="icon-btn" data-action="jm-back" aria-label="Back">\u2039</button>
      <div class="site-name">Jobs on This Phone</div>
      ${m.active && m.counts.all ? `<button class="pm-select-btn" data-action="jm-select-toggle" ${jm.busy ? 'disabled' : ''}>${jm.selecting ? 'Done' : 'Select'}</button>` : '<span style="width:40px"></span>'}
    </header>`;
  if (!m.active) {
    return `
    <div class="screen jm-screen">
      ${header}
      <p class="muted pm-note">Sign in to the cloud to see which jobs are safe there.</p>
    </div>`;
  }

  const summary = `
    <div class="settings-section pm-totals">
      <div class="pm-total-row"><span>\ud83d\udee1 Safe in the cloud</span><strong>${m.counts.safe} of ${m.counts.all}</strong></div>
      <p class="muted pm-note">A job can come off this phone once the cloud copy matches it and all its photos are uploaded. It stays in the cloud and on your other phones, and you can bring it back.</p>
    </div>`;

  const tidy = renderTidyBlock(tidyModel(false), 'jm-tidy');

  const opt = (v, label) => `<option value="${v}"${m.filter === v ? ' selected' : ''}>${label}</option>`;
  const controls = m.counts.all ? `
    <div class="list-controls">
      <label class="control-field">
        <span class="control-label">Show</span>
        <select class="sort-select" data-change-action="jm-filter">
          ${opt('all', 'All')}${opt('safe', 'Safe in the cloud')}${opt('notyet', 'Not safe yet')}
        </select>
      </label>
    </div>` : '';

  const busy = jm.busy ? `<p class="pm-busy" id="jm-busy" role="status">${escapeHTML(jm.busy)}</p>` : '';

  let body;
  if (!m.counts.all) {
    body = `<p class="muted pm-note">No jobs on this phone.</p>`;
  } else if (!m.rows.length) {
    body = `<p class="muted pm-note">No jobs match this filter.</p>`;
  } else {
    body = m.rows.map((x) => {
      const sel = !!(jm.selected || {})[x.id];
      const meta = [x.client, formatDate(x.date), `${x.items} item${x.items === 1 ? '' : 's'}`, x.photos ? `\ud83d\udcf7 ${x.photos}` : ''].filter(Boolean).join(' \u00b7 ');
      const status = x.r.safe
        ? `<span class="jm-status is-safe">\ud83d\udee1 ${escapeHTML(syncSafetyText(x.r))}</span>`
        : `<span class="jm-status">${escapeHTML(syncSafetyText(x.r))}</span>`;
      const tick = jm.selecting
        ? `<span class="jm-tick${sel ? ' is-on' : ''}${x.removable ? '' : ' is-off'}" aria-hidden="true">${sel ? '\u2713' : ''}</span>`
        : '';
      return `
        <div class="jm-row${sel ? ' is-selected' : ''}${jm.selecting && !x.removable ? ' is-dim' : ''}" data-action="jm-tap" data-arg="${escapeHTML(x.id)}">
          ${tick}
          <div class="jm-text">
            <div class="pm-group-title">${x.locked ? '<span class="session-lock" title="Locked">\ud83d\udd12</span>' : ''}${escapeHTML(x.title)}</div>
            <div class="pm-group-sub">${escapeHTML(meta)}</div>
            <div class="jm-status-row">${status}</div>
          </div>
        </div>`;
    }).join('');
  }

  // V93 (7A): cleared jobs live with every other cloud job — on the Jobs
  // screen's cloud tab. One path, not two.
  const cleared = `<p class="muted pm-note">Jobs you remove from this phone stay in the cloud, with every older job. <button class="pm-look-link" data-action="jm-cloud-link">See them in \u2601 In the cloud</button> on the Jobs screen \u2014 tap one to bring it back.</p>`;

  let bar = '';
  if (jm.selecting) {
    const n = Object.keys(jm.selected || {}).filter((id) => m.byId.has(id)).length;
    bar = `
      <div class="selection-bar pm-bar">
        <span class="selection-bar-count">${n} selected</span>
        <button class="selection-bar-action pm-bar-btn" data-action="jm-remove" ${n && !jm.busy ? '' : 'disabled'}>Remove from phone</button>
      </div>`;
  }

  return `
    <div class="screen jm-screen">
      ${header}
      ${summary}
      ${tidy}
      ${controls}
      ${busy}
      ${body}
      <div class="settings-section jm-cleared">
        <h2 class="h2">Cleared from this phone</h2>
        ${cleared}
      </div>
    </div>
    ${bar}
  `;
}

// ============== V93 (roadmap Stage 5 part 2) — the "In the cloud" tab ==============
// Drawn by renderSessions() (render-core.js) when the cloud tab is chosen. Logic
// and model in settings-actions.js (cloudJobsModel). Every job here is ☁ — only
// in the cloud (R19). The search box sits OUTSIDE #cloud-list-area so typing
// refreshes the list without rebuilding the input (MAP rule 3).
function renderCloudJobsHTML() {
  const cj = state.cloudJobs || {};
  const busy = cj.busy ? `<p class="pm-busy" id="cloud-busy" role="status">${escapeHTML(cj.busy)}</p>` : '';
  if (!cj.ok) {
    let msg;
    if (cj.loading) msg = `<p class="muted pm-note" role="status">Reading the cloud\u2026</p>`;
    else if (cj.error) msg = `<p class="pm-note pm-error">${escapeHTML(cj.error)}</p><button class="btn-secondary cloud-retry" data-action="cloud-refresh">Try again</button>`;
    else msg = `<p class="muted pm-note">Jobs that aren't on this phone stay in the cloud. <button class="pm-look-link" data-action="cloud-refresh">Show them</button></p>`;
    return `<div class="cloud-tab">${msg}</div>`;
  }
  const m = cloudJobsModel();
  const search = m.total ? `
    <div class="sessions-search-row">
      <input type="search" class="search-input" id="cloud-search" data-input-action="cloud-search" placeholder="Search client, site or certificate\u2026" value="${escapeHTML(cj.q || '')}" autocomplete="off">
    </div>` : '';
  const selectBtn = m.total ? `<button class="pm-select-btn cloud-select-btn" data-action="cloud-select-toggle" ${cj.busy ? 'disabled' : ''}>${cj.selecting ? 'Done' : 'Select'}</button>` : '';
  let bar = '';
  if (cj.selecting) {
    const n = Object.keys(cj.selected || {}).filter((id) => m.byId.has(id)).length;
    bar = `
      <div class="selection-bar pm-bar">
        <span class="selection-bar-count">${n} selected</span>
        <button class="selection-bar-action pm-bar-btn" data-action="cloud-bring" ${n && !cj.busy ? '' : 'disabled'}>Bring onto this phone</button>
      </div>`;
  }
  return `
    <div class="cloud-tab">
      <div class="cloud-head">${selectBtn}</div>
      ${search}
      ${busy}
      <div id="cloud-list-area">${renderCloudListAreaHTML(m)}</div>
    </div>
    ${bar}`;
}

function renderCloudListAreaHTML(model) {
  const cj = state.cloudJobs || {};
  const m = model || cloudJobsModel();
  const when = cj.at ? escapeHTML(new Date(cj.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })) : '';
  const q = String(cj.q || '').trim();
  const count = q
    ? `${m.shown} of ${m.total} job${m.total === 1 ? '' : 's'} match`
    : `${m.total} job${m.total === 1 ? '' : 's'} only in the cloud`;
  const head = `<p class="muted pm-note cloud-count">${count} \u00b7 checked ${when} \u00b7 <button class="pm-look-link" data-action="cloud-refresh" aria-label="Read the cloud list again">\u27f3 Refresh</button></p>` +
    (cj.capped ? `<p class="muted pm-note">Showing the first ${SYNC_CLOUD_MAX.toLocaleString('en-GB')} jobs.</p>` : '');
  if (!m.total) return head + `<p class="muted pm-note">Every job in the cloud is on this phone.</p>`;
  if (!m.shown) return head + `<p class="muted pm-note">No cloud jobs match.</p>`;
  const sel = cj.selected || {};
  const groups = m.groups.map((g) => {
    const rows = g.rows.map((j) => {
      const on = !!sel[j.id];
      const counts = [];
      if (j.items !== null && j.items !== undefined) counts.push(`${j.items} item${j.items === 1 ? '' : 's'}`);
      if (j.fails) counts.push(`<span class="fail-text">${j.fails} fail</span>`);
      if (j.photos) counts.push(`<span class="photo-text">\ud83d\udcf7 ${j.photos}</span>`);
      const meta = [j.client ? escapeHTML(j.client) : '', escapeHTML(formatDate(j.date))].concat(counts).filter(Boolean).join(' \u00b7 ');
      const tick = cj.selecting ? `<span class="jm-tick${on ? ' is-on' : ''}" aria-hidden="true">${on ? '\u2713' : ''}</span>` : '';
      return `
        <div class="session-card cloud-card${on ? ' is-selected' : ''}${j.locked ? ' locked' : ''}">
          <div class="session-info" data-action="cloud-tap" data-arg="${escapeHTML(j.id)}">
            <div class="session-title">${tick}<span class="session-cloud" title="Only in the cloud" aria-label="Only in the cloud">\u2601</span>${j.locked ? '<span class="session-lock" title="Locked">\ud83d\udd12</span>' : ''}${escapeHTML(j.title)}</div>
            <div class="session-meta">${meta}</div>
            ${j.certNo ? `<div class="session-meta cloud-cert">Certificate ${escapeHTML(j.certNo)}</div>` : ''}
          </div>
        </div>`;
    }).join('');
    return `<h3 class="cloud-month">${escapeHTML(g.label)}</h3>${rows}`;
  }).join('');
  return head + groups;
}

// The cloud search's partial refresh — the input itself is left alone.
function refreshCloudListAreaOnly() {
  const wrap = document.getElementById('cloud-list-area');
  if (!wrap) return;
  wrap.innerHTML = renderCloudListAreaHTML();
}
