/*!
 * PAT Test PWA
 * v4 (May 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PAT Test PWA — v4 ==============
// Storage uses localStorage — works fully offline, persists across launches.

const APP_VERSION = 'V4';

const STORAGE_KEY = 'pat:sessions';
const ACTIVE_KEY = 'pat:active';
const ITEMS_KEY = 'pat:itemtypes';
const FAIL_REASONS_KEY = 'pat:failreasons';
const ENGINEER_KEY = 'pat:engineer';
const DESCRIPTIONS_KEY = 'pat:descriptions';
const SORT_KEY = 'pat:sort';

const DEFAULT_ITEM_TYPES = ['Lead', 'AC adapter', 'Monitor', 'PC', 'Hub', 'Dock'];
const DEFAULT_FAIL_REASONS = [
  'Damaged plug',
  'Frayed cable',
  'Cord grip loose',
  'Earth fail',
  'Insulation fail',
  'Visual fail'
];

// ---------- State ----------
let state = {
  sessions: [],
  activeId: null,
  itemTypes: DEFAULT_ITEM_TYPES.slice(),
  failReasons: DEFAULT_FAIL_REASONS.slice(),
  engineer: '',
  descriptions: [],
  sort: 'date_desc',
  view: 'sessions',
  cursor: 0,
  form: { assetNo: '', location: '', itemType: '', notes: '', showNotes: false },
  newForm: { name: '', site: '', engineer: '', prefix: '', startNo: '1', show: false },
  editForm: { name: '', site: '', engineer: '', prefix: '', date: '' },
  suggestions: [],
  showSuggestions: false,
  failModalOpen: false,
  showFailsOnly: false
};

// ---------- Persistence ----------
function load() {
  try {
    state.sessions = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { state.sessions = []; }
  state.activeId = localStorage.getItem(ACTIVE_KEY) || null;

  try {
    state.itemTypes = JSON.parse(localStorage.getItem(ITEMS_KEY) || 'null') || DEFAULT_ITEM_TYPES.slice();
  } catch { state.itemTypes = DEFAULT_ITEM_TYPES.slice(); }

  try {
    state.failReasons = JSON.parse(localStorage.getItem(FAIL_REASONS_KEY) || 'null') || DEFAULT_FAIL_REASONS.slice();
  } catch { state.failReasons = DEFAULT_FAIL_REASONS.slice(); }

  state.engineer = localStorage.getItem(ENGINEER_KEY) || '';
  state.sort = localStorage.getItem(SORT_KEY) || 'date_desc';

  // Migration: ensure all sessions have new fields
  state.sessions.forEach(s => {
    if (s.engineer === undefined) s.engineer = '';
    if (s.prefix === undefined) s.prefix = '';
  });

  // Descriptions list — initialise from existing item history on first v4 launch
  let storedDesc = null;
  try {
    storedDesc = JSON.parse(localStorage.getItem(DESCRIPTIONS_KEY) || 'null');
  } catch {}
  if (Array.isArray(storedDesc)) {
    state.descriptions = storedDesc;
  } else {
    state.descriptions = computeHistoryFromItems();
    localStorage.setItem(DESCRIPTIONS_KEY, JSON.stringify(state.descriptions));
  }

  if (state.activeId && state.sessions.find(s => s.id === state.activeId)) {
    state.view = 'entry';
    const sess = activeSession();
    state.cursor = sess.items.length;
  } else {
    state.activeId = null;
    state.view = 'sessions';
    state.newForm.show = state.sessions.length === 0;
  }

  // Default engineer for any new-session form shown
  if (!state.newForm.engineer && state.engineer) {
    state.newForm.engineer = state.engineer;
  }
}

function computeHistoryFromItems() {
  const set = new Set();
  state.sessions.forEach(s => s.items.forEach(it => {
    if (it.itemType) set.add(it.itemType);
  }));
  return Array.from(set);
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.sessions));
  localStorage.setItem(ACTIVE_KEY, state.activeId || '');
  localStorage.setItem(ITEMS_KEY, JSON.stringify(state.itemTypes));
  localStorage.setItem(FAIL_REASONS_KEY, JSON.stringify(state.failReasons));
  localStorage.setItem(ENGINEER_KEY, state.engineer);
  localStorage.setItem(DESCRIPTIONS_KEY, JSON.stringify(state.descriptions));
  localStorage.setItem(SORT_KEY, state.sort);
}

// ---------- Helpers ----------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayISO = () => new Date().toISOString().slice(0, 10);
const escapeHTML = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function activeSession() { return state.sessions.find(s => s.id === state.activeId); }
const capitalise = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

// Title case for location and free-typed item types — capitalises the first letter of each word.
// "main office" -> "Main Office"; preserves existing capitals like "USB" or "iPhone".
function titleCase(s) {
  return String(s || '').replace(/\b\w/g, c => c.toUpperCase());
}

// For item type: preserves quick-pick casing exactly; otherwise title-cases.
function normaliseItemType(s) {
  const trimmed = String(s || '').trim();
  if (!trimmed) return '';
  const match = state.itemTypes.find(t => t.toLowerCase() === trimmed.toLowerCase());
  if (match) return match;
  return titleCase(trimmed);
}

function normaliseLocation(s) {
  return titleCase(String(s || '').trim());
}

// Date formatting: ISO -> DD/MM/YYYY
function formatDate(iso) {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// Asset number split & next
function splitAssetNo(s) {
  if (!s) return { prefix: '', number: null };
  const m = String(s).match(/^(.*?)(\d+)$/);
  if (!m) return { prefix: String(s), number: null };
  return { prefix: m[1], number: parseInt(m[2], 10) };
}
function nextAssetNo(session) {
  if (!session.items.length) {
    return (session.prefix || '') + (session.startNumber || 1);
  }
  const last = session.items[session.items.length - 1];
  const split = splitAssetNo(last.assetNo);
  if (split.number == null) {
    return (session.prefix || '') + (session.startNumber + session.items.length);
  }
  return split.prefix + (split.number + 1);
}

// Autocomplete — pulls from the user-managed descriptions list, excludes quick-picks.
function computeSuggestions(query) {
  if (!query || query.length < 1) return [];
  const q = query.toLowerCase();
  const quickLower = state.itemTypes.map(t => t.toLowerCase());
  const all = state.descriptions.filter(t => !quickLower.includes(t.toLowerCase()));
  const starts = all.filter(t => t.toLowerCase().startsWith(q) && t.toLowerCase() !== q);
  const contains = all.filter(t => !t.toLowerCase().startsWith(q) && t.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, 5);
}

// Add a description to the saved list if not already there (case-insensitive).
function addDescriptionIfNew(desc) {
  const trimmed = String(desc || '').trim();
  if (!trimmed) return;
  const lower = trimmed.toLowerCase();
  const exists = state.descriptions.some(d => d.toLowerCase() === lower);
  if (!exists) state.descriptions.push(trimmed);
}

// Sorted view of sessions for display.
function sortedSessions() {
  const arr = state.sessions.slice();
  switch (state.sort) {
    case 'date_asc':
      arr.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      break;
    case 'name_asc':
      arr.sort((a, b) => (a.site || a.name || '').localeCompare(b.site || b.name || '', undefined, { sensitivity: 'base' }));
      break;
    case 'name_desc':
      arr.sort((a, b) => (b.site || b.name || '').localeCompare(a.site || a.name || '', undefined, { sensitivity: 'base' }));
      break;
    case 'date_desc':
    default:
      arr.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      break;
  }
  return arr;
}

// ---------- Haptics ----------
// Triggers haptic feedback. iOS 17.4–26.4: uses the <input type="checkbox" switch> toggle trick.
// iOS 26.5+: Apple patched it — silently no-op there. Android: navigator.vibrate.
// Counts: 1 = pass, 2 = copy, 3 = fail.
function haptic(count) {
  // Android (and any browser that supports vibrate)
  if (navigator.vibrate) {
    if (count === 1) navigator.vibrate(25);
    else if (count === 2) navigator.vibrate([25, 70, 25]);
    else if (count === 3) navigator.vibrate([25, 70, 25, 70, 25]);
  }
  // iOS via switch input toggle
  let remaining = count;
  function fire() {
    if (remaining <= 0) return;
    const sw = document.createElement('input');
    sw.type = 'checkbox';
    sw.setAttribute('switch', '');
    sw.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none;';
    document.body.appendChild(sw);
    requestAnimationFrame(() => {
      try { sw.click(); } catch {}
      setTimeout(() => sw.remove(), 30);
    });
    remaining--;
    if (remaining > 0) setTimeout(fire, 90);
  }
  fire();
}

// ---------- CSV ----------
function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function buildCSV(session) {
  const header = ['Site', 'Date', 'Engineer', 'Asset No', 'Location', 'Item Type', 'Result', 'Notes'];
  const rows = session.items.map(it => [
    session.site,
    formatDate(session.date),
    session.engineer || '',
    it.assetNo,
    it.location,
    it.itemType,
    capitalise(it.result || ''),
    it.notes
  ].map(csvEscape).join(','));
  return [header.join(','), ...rows].join('\n');
}
function downloadCSV(session) {
  // UTF-8 BOM so Excel on Windows opens £, accents, etc. correctly
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + buildCSV(session)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safe = (session.site || session.name || 'session').replace(/[^a-z0-9]+/gi, '_');
  a.href = url; a.download = `PAT_${safe}_${session.date}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- Form helpers ----------
function loadFormForCursor() {
  const sess = activeSession();
  if (!sess) return;
  const isExisting = state.cursor < sess.items.length;
  if (isExisting) {
    const it = sess.items[state.cursor];
    state.form = {
      assetNo: it.assetNo, location: it.location, itemType: it.itemType,
      notes: it.notes, showNotes: !!it.notes
    };
  } else {
    state.form = {
      assetNo: nextAssetNo(sess),
      location: sess.lastLocation || '',
      itemType: '',
      notes: '',
      showNotes: false
    };
  }
  state.suggestions = [];
  state.showSuggestions = false;
  state.failModalOpen = false;
}

// ---------- Actions ----------
function createSession() {
  const { name, site, engineer, prefix, startNo } = state.newForm;
  if (!site.trim()) return;
  const s = {
    id: uid(),
    name: name.trim() || `Session ${state.sessions.length + 1}`,
    site: site.trim(),
    engineer: engineer.trim(),
    prefix: prefix.trim(),
    date: todayISO(),
    startNumber: parseInt(startNo, 10) || 1,
    lastLocation: '',
    items: []
  };
  state.sessions.unshift(s);
  state.activeId = s.id;
  state.cursor = 0;
  state.view = 'entry';
  // Reset new form but keep engineer default for next time
  state.newForm = { name: '', site: '', engineer: state.engineer, prefix: '', startNo: '1', show: false };
  loadFormForCursor();
  save(); render();
}

function openSession(id) {
  state.activeId = id;
  const s = activeSession();
  state.cursor = s.items.length;
  state.view = 'entry';
  state.showFailsOnly = false;
  loadFormForCursor();
  save(); render();
}

function deleteSession(id) {
  state.sessions = state.sessions.filter(s => s.id !== id);
  if (id === state.activeId) {
    state.activeId = null;
    state.view = 'sessions';
  }
  save(); render();
}

function saveItem(result) {
  const sess = activeSession();
  if (!sess) return;
  if (!state.form.itemType.trim()) {
    alert('Please choose or enter an item type.');
    return;
  }
  const cleanLocation = normaliseLocation(state.form.location);
  const cleanType = normaliseItemType(state.form.itemType);
  const item = {
    assetNo: state.form.assetNo.trim() || nextAssetNo(sess),
    location: cleanLocation,
    itemType: cleanType,
    notes: state.form.notes.trim(),
    result
  };
  if (state.cursor < sess.items.length) {
    sess.items[state.cursor] = { ...sess.items[state.cursor], ...item };
  } else {
    sess.items.push({ id: uid(), ...item });
  }
  if (item.location) sess.lastLocation = item.location;
  // Track new descriptions for autocomplete
  addDescriptionIfNew(cleanType);
  state.cursor++;
  loadFormForCursor();
  save(); render();
}

function passClicked() {
  haptic(1);
  saveItem('pass');
}

function failClicked() {
  // Validate item type before opening modal so we don't get stuck
  if (!state.form.itemType.trim()) {
    alert('Please choose or enter an item type.');
    return;
  }
  haptic(3);
  state.failModalOpen = true;
  render();
}

function pickFailReason(reasonOrNull) {
  if (reasonOrNull) {
    state.form.notes = state.form.notes
      ? state.form.notes + ' — ' + reasonOrNull
      : reasonOrNull;
  }
  state.failModalOpen = false;
  saveItem('fail');
}

function cancelFailModal() {
  state.failModalOpen = false;
  render();
}

// Copy last result — type + result from the most recently saved item.
function copyLastResult() {
  const sess = activeSession();
  if (!sess || sess.items.length === 0) return;
  haptic(2);
  const last = sess.items[sess.items.length - 1];
  const item = {
    assetNo: state.form.assetNo.trim() || nextAssetNo(sess),
    location: normaliseLocation(state.form.location),
    itemType: last.itemType,
    notes: '',
    result: last.result
  };
  if (state.cursor < sess.items.length) {
    sess.items[state.cursor] = { ...sess.items[state.cursor], ...item };
  } else {
    sess.items.push({ id: uid(), ...item });
  }
  if (item.location) sess.lastLocation = item.location;
  state.cursor++;
  loadFormForCursor();
  save(); render();
}

function deleteItem(idx) {
  const sess = activeSession();
  if (!sess) return;
  sess.items.splice(idx, 1);
  state.cursor = Math.min(state.cursor, sess.items.length);
  loadFormForCursor();
  save(); render();
}

function moveCursor(delta) {
  const sess = activeSession();
  if (!sess) return;
  const next = state.cursor + delta;
  if (next < 0 || next > sess.items.length) return;
  state.cursor = next;
  loadFormForCursor();
  render();
}

function jumpTo(idx) {
  state.cursor = idx;
  state.view = 'entry';
  loadFormForCursor();
  render();
}

function setView(v) {
  state.failModalOpen = false;
  state.view = v;
  render();
}

// Edit-session flow
function startEditSession() {
  const sess = activeSession();
  if (!sess) return;
  state.editForm = {
    name: sess.name || '',
    site: sess.site || '',
    engineer: sess.engineer || '',
    prefix: sess.prefix || '',
    date: sess.date || ''
  };
  state.view = 'editSession';
  render();
}

function saveSessionEdits() {
  const sess = activeSession();
  if (!sess) return;
  const { name, site, engineer, prefix, date } = state.editForm;
  if (!String(site).trim()) {
    alert('Site is required.');
    return;
  }
  sess.name = String(name).trim() || sess.name;
  sess.site = String(site).trim();
  sess.engineer = String(engineer).trim();
  sess.prefix = String(prefix).trim();
  sess.date = date || sess.date;
  state.view = 'overview';
  save(); render();
}

// ---------- Settings save ----------
function saveSettings() {
  const types = document.getElementById('settings-types').value
    .split('\n').map(s => s.trim()).filter(Boolean).slice(0, 9);
  state.itemTypes = types.length ? types : DEFAULT_ITEM_TYPES.slice();

  const reasons = document.getElementById('settings-reasons').value
    .split('\n').map(s => s.trim()).filter(Boolean).slice(0, 6);
  state.failReasons = reasons.length ? reasons : DEFAULT_FAIL_REASONS.slice();

  state.engineer = document.getElementById('settings-engineer').value.trim();

  // Descriptions: dedupe case-insensitively, preserve first-occurrence casing
  const rawDescs = document.getElementById('settings-descriptions').value
    .split('\n').map(s => s.trim()).filter(Boolean);
  const seen = new Set();
  state.descriptions = rawDescs.filter(d => {
    const l = d.toLowerCase();
    if (seen.has(l)) return false;
    seen.add(l);
    return true;
  });

  // Refresh new-session-form engineer default to match the new setting
  state.newForm.engineer = state.engineer;

  save();
  setView(state.activeId ? 'entry' : 'sessions');
}

// ---------- Rendering ----------
const app = document.getElementById('app');

function render() {
  const v = state.view;
  let html = '';
  if (v === 'sessions') html = renderSessions();
  else if (v === 'entry') html = renderEntry();
  else if (v === 'overview') html = renderOverview();
  else if (v === 'editSession') html = renderEditSession();
  else if (v === 'settings') html = renderSettings();
  app.innerHTML = html;
  bindEvents();
}

function renderSessions() {
  const newForm = state.newForm.show ? `
    <div class="card">
      <h2 class="h2">New session</h2>
      <label class="label">Site / client</label>
      <input class="input" id="nf-site" value="${escapeHTML(state.newForm.site)}" placeholder="e.g. Acme Ltd – Unit 4" autofocus>
      <label class="label">Engineer</label>
      <input class="input" id="nf-engineer" value="${escapeHTML(state.newForm.engineer || state.engineer)}" placeholder="Your name">
      <label class="label">Session name <span class="hint">(optional)</span></label>
      <input class="input" id="nf-name" value="${escapeHTML(state.newForm.name)}" placeholder="e.g. Annual test 2026">
      <label class="label">Asset number prefix <span class="hint">(optional, e.g. BT)</span></label>
      <input class="input" id="nf-prefix" value="${escapeHTML(state.newForm.prefix)}" placeholder="Leave blank for none">
      <label class="label">Starting asset number</label>
      <input class="input" id="nf-start" type="number" inputmode="numeric" value="${escapeHTML(state.newForm.startNo)}">
      <div class="btn-row">
        <button class="btn-secondary" id="nf-cancel">Cancel</button>
        <button class="btn-primary" id="nf-submit">Start</button>
      </div>
    </div>
  ` : `
    <button class="btn-primary" id="new-session-btn" style="margin-bottom:16px">+ New session</button>
  `;

  const sortControl = state.sessions.length > 1 ? `
    <div class="sort-row">
      <span class="sort-label">Sort by</span>
      <select id="sort-select" class="sort-select">
        <option value="date_desc"${state.sort === 'date_desc' ? ' selected' : ''}>Date (newest)</option>
        <option value="date_asc"${state.sort === 'date_asc' ? ' selected' : ''}>Date (oldest)</option>
        <option value="name_asc"${state.sort === 'name_asc' ? ' selected' : ''}>Name (A–Z)</option>
        <option value="name_desc"${state.sort === 'name_desc' ? ' selected' : ''}>Name (Z–A)</option>
      </select>
    </div>
  ` : '';

  const sortedList = sortedSessions();
  const list = sortedList.length === 0 && !state.newForm.show
    ? `<p class="muted">No sessions yet. Create one to start testing.</p>`
    : sortedList.map(s => {
        const passes = s.items.filter(i => i.result === 'pass').length;
        const fails = s.items.filter(i => i.result === 'fail').length;
        return `
          <div class="session-card">
            <div class="session-info" data-open="${s.id}">
              <div class="session-title">${escapeHTML(s.site || s.name)}</div>
              <div class="session-meta">${formatDate(s.date)} · ${s.items.length} items · <span class="pass-text">${passes} pass</span> · <span class="fail-text">${fails} fail</span></div>
            </div>
            <button class="icon-btn-sm" data-export="${s.id}" aria-label="Export CSV">⬇</button>
            <button class="icon-btn-sm" data-delete-session="${s.id}" aria-label="Delete">🗑</button>
          </div>
        `;
      }).join('');

  return `
    <div class="screen">
      <header class="header">
        <h1 class="h1">PAT Sessions</h1>
        <button class="icon-btn" id="settings-btn" aria-label="Settings">⚙</button>
      </header>
      ${newForm}
      ${sortControl}
      <div>${list}</div>
    </div>
  `;
}

function renderEntry() {
  const sess = activeSession();
  if (!sess) { state.view = 'sessions'; return renderSessions(); }
  const isExisting = state.cursor < sess.items.length;
  const existing = isExisting ? sess.items[state.cursor] : null;
  const hasLast = sess.items.length > 0;

  const quickButtons = state.itemTypes.map(t => `
    <button class="quick-btn ${state.form.itemType === t ? 'active' : ''}" data-type="${escapeHTML(t)}">${escapeHTML(t)}</button>
  `).join('');

  const notesBlock = state.form.showNotes
    ? `<label class="label">Notes</label>
       <textarea class="textarea" id="f-notes" rows="2" placeholder="Optional">${escapeHTML(state.form.notes)}</textarea>`
    : `<button class="notes-toggle" id="show-notes-btn">✎ Add note</button>`;

  const resultBadge = isExisting && existing.result
    ? `<span style="margin-left:8px;color:${existing.result === 'pass' ? '#16a34a' : '#dc2626'};font-weight:700">· ${capitalise(existing.result).toUpperCase()}</span>`
    : '';

  const suggestionsBlock = (state.showSuggestions && state.suggestions.length > 0)
    ? `<div class="suggestions">
        ${state.suggestions.map(s => `<button class="suggestion-item" data-suggest="${escapeHTML(s)}">${escapeHTML(s)}</button>`).join('')}
      </div>`
    : '';

  const lastInfo = hasLast
    ? ` (${escapeHTML(sess.items[sess.items.length - 1].itemType)} · ${capitalise(sess.items[sess.items.length - 1].result)})`
    : '';

  const failModal = state.failModalOpen ? `
    <div class="modal-backdrop" id="fail-backdrop"></div>
    <div class="fail-sheet" role="dialog" aria-label="Why did it fail?">
      <div class="fail-sheet-handle"></div>
      <div class="fail-sheet-header">
        <span class="fail-close-spacer"></span>
        <h3 class="fail-sheet-title">Why did it fail?</h3>
        <button class="fail-close-btn" id="fail-close" aria-label="Cancel">×</button>
      </div>
      <div class="fail-reasons-grid">
        ${state.failReasons.map(r => `
          <button class="fail-reason-btn" data-reason="${escapeHTML(r)}">${escapeHTML(r)}</button>
        `).join('')}
      </div>
      <button class="fail-skip-btn" id="fail-skip">Skip — save fail with no reason</button>
    </div>
  ` : '';

  return `
    <div class="screen">
      <header class="header-row">
        <button class="icon-btn" id="sessions-btn" aria-label="Sessions">📁</button>
        <div class="site-name">${escapeHTML(sess.site || sess.name)}</div>
        <button class="icon-btn" id="overview-btn" aria-label="Overview">▦</button>
      </header>

      <div class="progress">Item ${state.cursor + 1} ${isExisting ? `of ${sess.items.length}` : '(new)'}${resultBadge}</div>

      <label class="label">Asset number</label>
      <input class="input-big" id="f-asset" value="${escapeHTML(state.form.assetNo)}">

      <label class="label">Location ${!isExisting && sess.lastLocation ? '<span class="hint">(carried from last)</span>' : ''}</label>
      <input class="input-big" id="f-location" value="${escapeHTML(state.form.location)}" placeholder="e.g. Office 1">

      <label class="label">Item type</label>
      <div class="quick-grid">${quickButtons}</div>
      <div class="custom-type-wrap">
        <input class="input" id="f-type" value="${escapeHTML(state.form.itemType)}" placeholder="…or type custom" autocomplete="off" style="margin-top:8px">
        ${suggestionsBlock}
      </div>

      ${notesBlock}

      <div class="pass-fail-row">
        <button class="pass-btn" id="pass-btn"><span class="icon">✓</span>PASS</button>
        <button class="fail-btn" id="fail-btn"><span class="icon">✗</span>FAIL</button>
      </div>

      <button class="copy-last-btn" id="copy-last-btn" ${hasLast ? '' : 'disabled'}>
        ⎘ Copy last result${lastInfo}
      </button>

      <div class="nav-row">
        <button class="nav-btn" id="prev-btn" ${state.cursor === 0 ? 'disabled' : ''}>‹ Prev</button>
        ${isExisting ? `<button class="delete-btn" id="del-item-btn">🗑 Delete</button>` : '<span></span>'}
        <button class="nav-btn" id="next-btn" ${state.cursor >= sess.items.length ? 'disabled' : ''}>Next ›</button>
      </div>

      ${failModal}
    </div>
  `;
}

function renderOverview() {
  const sess = activeSession();
  if (!sess) { state.view = 'sessions'; return renderSessions(); }
  const passes = sess.items.filter(i => i.result === 'pass').length;
  const fails = sess.items.filter(i => i.result === 'fail').length;

  // Build view list preserving original indices for jump/delete
  const visibleItems = sess.items
    .map((it, i) => ({ it, i }))
    .filter(x => state.showFailsOnly ? x.it.result === 'fail' : true);

  const filterToggle = sess.items.length > 0 ? `
    <div class="filter-row">
      <label class="filter-toggle">
        <input type="checkbox" id="fails-only-toggle" ${state.showFailsOnly ? 'checked' : ''}>
        <span>Show fails only</span>
      </label>
    </div>
  ` : '';

  const body = visibleItems.length === 0
    ? `<p class="muted">${state.showFailsOnly ? 'No fails in this session.' : 'No items recorded yet.'}</p>`
    : `<div class="table-wrap">
        <table class="table">
          <thead><tr>
            <th class="th">#</th><th class="th">Location</th><th class="th">Item</th><th class="th">Result</th><th class="th"></th>
          </tr></thead>
          <tbody>
            ${visibleItems.map(({ it, i }) => `
              <tr class="tr" data-jump="${i}">
                <td class="td">${escapeHTML(it.assetNo)}</td>
                <td class="td">${escapeHTML(it.location)}</td>
                <td class="td">${escapeHTML(it.itemType)}</td>
                <td class="td td-result" style="color:${it.result === 'pass' ? '#16a34a' : '#dc2626'}">${capitalise(it.result || '')}</td>
                <td class="td td-action" data-del-item="${i}">🗑</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;

  return `
    <div class="screen">
      <header class="header-row">
        <button class="icon-btn" id="back-btn" aria-label="Back">‹</button>
        <div class="site-name">Overview</div>
        <div class="header-actions">
          <button class="icon-btn" id="edit-session-btn" aria-label="Edit session">✎</button>
          <button class="icon-btn" id="export-btn" aria-label="Export CSV">⬇</button>
        </div>
      </header>
      <div class="progress">${sess.items.length} items · <span class="pass-text">${passes} pass</span> · <span class="fail-text">${fails} fail</span>${sess.engineer ? ' · ' + escapeHTML(sess.engineer) : ''}</div>
      ${filterToggle}
      ${body}
    </div>
  `;
}

function renderEditSession() {
  return `
    <div class="screen">
      <header class="header-row">
        <button class="icon-btn" id="cancel-edit-btn" aria-label="Cancel">‹</button>
        <div class="site-name">Edit session</div>
        <span style="width:40px"></span>
      </header>
      <div class="card">
        <label class="label">Site / client</label>
        <input class="input" id="ef-site" value="${escapeHTML(state.editForm.site)}">
        <label class="label">Engineer</label>
        <input class="input" id="ef-engineer" value="${escapeHTML(state.editForm.engineer)}">
        <label class="label">Session name</label>
        <input class="input" id="ef-name" value="${escapeHTML(state.editForm.name)}">
        <label class="label">Date</label>
        <input class="input" id="ef-date" type="date" value="${escapeHTML(state.editForm.date)}">
        <label class="label">Asset number prefix</label>
        <input class="input" id="ef-prefix" value="${escapeHTML(state.editForm.prefix)}">
        <div class="btn-row">
          <button class="btn-secondary" id="ef-cancel">Cancel</button>
          <button class="btn-primary" id="ef-save">Save</button>
        </div>
      </div>
    </div>
  `;
}

function renderSettings() {
  return `
    <div class="screen">
      <header class="header-row">
        <button class="icon-btn" id="back-btn" aria-label="Back">‹</button>
        <div class="site-name">Settings</div>
        <span style="width:40px"></span>
      </header>

      <div class="settings-section">
        <h2 class="h2">Engineer name</h2>
        <p class="muted">Used as the default for new sessions.</p>
        <input class="input" id="settings-engineer" value="${escapeHTML(state.engineer)}" placeholder="Your name">
      </div>

      <div class="settings-section">
        <h2 class="h2">Quick-pick item types</h2>
        <p class="muted">One per line. Up to 9. Appear as quick-tap buttons on the entry screen.</p>
        <textarea class="textarea" id="settings-types" style="min-height:180px">${escapeHTML(state.itemTypes.join('\n'))}</textarea>
      </div>

      <div class="settings-section">
        <h2 class="h2">Quick-pick fail reasons</h2>
        <p class="muted">One per line. Up to 6. Shown when you tap FAIL.</p>
        <textarea class="textarea" id="settings-reasons" style="min-height:140px">${escapeHTML(state.failReasons.join('\n'))}</textarea>
      </div>

      <div class="settings-section">
        <h2 class="h2">Saved descriptions</h2>
        <p class="muted">Item types you've typed into the custom field. Edit to fix typos for future autocomplete (won't change items already saved). Add new lines to seed autocomplete with common items.</p>
        <textarea class="textarea" id="settings-descriptions" style="min-height:200px">${escapeHTML(state.descriptions.join('\n'))}</textarea>
      </div>

      <button class="btn-primary" id="settings-save" style="margin-top:20px">Save</button>
      <p class="muted" style="margin-top:24px;font-size:12px">PAT Test ${APP_VERSION} · © 2026 Peter Birchley · Data stored on this device only</p>
    </div>
  `;
}

// ---------- Event binding ----------
function bindEvents() {
  const $ = id => document.getElementById(id);

  // Sessions screen
  if ($('settings-btn')) $('settings-btn').onclick = () => setView('settings');
  if ($('new-session-btn')) $('new-session-btn').onclick = () => {
    state.newForm.show = true;
    if (!state.newForm.engineer && state.engineer) state.newForm.engineer = state.engineer;
    render();
  };
  if ($('nf-cancel')) $('nf-cancel').onclick = () => { state.newForm.show = false; render(); };
  if ($('nf-submit')) $('nf-submit').onclick = () => {
    state.newForm.site = $('nf-site').value;
    state.newForm.engineer = $('nf-engineer').value;
    state.newForm.name = $('nf-name').value;
    state.newForm.prefix = $('nf-prefix').value;
    state.newForm.startNo = $('nf-start').value;
    createSession();
  };
  if ($('nf-site')) $('nf-site').oninput = e => state.newForm.site = e.target.value;
  if ($('nf-engineer')) $('nf-engineer').oninput = e => state.newForm.engineer = e.target.value;
  if ($('nf-name')) $('nf-name').oninput = e => state.newForm.name = e.target.value;
  if ($('nf-prefix')) $('nf-prefix').oninput = e => state.newForm.prefix = e.target.value;
  if ($('nf-start')) $('nf-start').oninput = e => state.newForm.startNo = e.target.value;

  // Sort selector
  if ($('sort-select')) $('sort-select').onchange = e => {
    state.sort = e.target.value;
    save();
    render();
  };

  document.querySelectorAll('[data-open]').forEach(el => {
    el.onclick = () => openSession(el.dataset.open);
  });
  document.querySelectorAll('[data-export]').forEach(el => {
    el.onclick = (e) => { e.stopPropagation(); const s = state.sessions.find(x => x.id === el.dataset.export); if (s) downloadCSV(s); };
  });
  document.querySelectorAll('[data-delete-session]').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      const s = state.sessions.find(x => x.id === el.dataset.deleteSession);
      if (s && confirm(`Delete "${s.site || s.name}"? This cannot be undone.`)) deleteSession(el.dataset.deleteSession);
    };
  });

  // Entry screen
  if ($('sessions-btn')) $('sessions-btn').onclick = () => setView('sessions');
  if ($('overview-btn')) $('overview-btn').onclick = () => setView('overview');
  if ($('f-asset')) $('f-asset').oninput = e => state.form.assetNo = e.target.value;

  // Location: tap-to-clear, restore on empty blur, title-case on commit
  if ($('f-location')) {
    $('f-location').oninput = e => state.form.location = e.target.value;
    $('f-location').onfocus = e => {
      e.target.dataset.original = e.target.value;
      e.target.value = '';
    };
    $('f-location').onblur = e => {
      const v = e.target.value.trim();
      if (v === '') {
        const orig = e.target.dataset.original || '';
        e.target.value = orig;
        state.form.location = orig;
      } else {
        const cased = titleCase(v);
        e.target.value = cased;
        state.form.location = cased;
      }
    };
  }

  // Item type: autocomplete + title-case on blur (preserving quick-pick casing)
  if ($('f-type')) {
    $('f-type').oninput = e => {
      const val = e.target.value;
      state.form.itemType = val;
      document.querySelectorAll('.quick-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.type === val);
      });
      state.suggestions = computeSuggestions(val);
      state.showSuggestions = state.suggestions.length > 0;
      renderSuggestionsOnly();
    };
    $('f-type').onfocus = e => {
      if (e.target.value) {
        state.suggestions = computeSuggestions(e.target.value);
        state.showSuggestions = state.suggestions.length > 0;
        renderSuggestionsOnly();
      }
    };
    $('f-type').onblur = e => {
      const v = String(e.target.value || '').trim();
      if (v) {
        const cased = normaliseItemType(v);
        e.target.value = cased;
        state.form.itemType = cased;
      }
      // Delay hide so suggestion clicks can register
      setTimeout(() => { state.showSuggestions = false; renderSuggestionsOnly(); }, 150);
    };
  }

  document.querySelectorAll('.quick-btn').forEach(b => {
    b.onclick = () => {
      state.form.itemType = b.dataset.type;
      const inp = document.getElementById('f-type');
      if (inp) inp.value = b.dataset.type;
      document.querySelectorAll('.quick-btn').forEach(x => x.classList.toggle('active', x === b));
      state.showSuggestions = false;
      renderSuggestionsOnly();
    };
  });

  if ($('f-notes')) $('f-notes').oninput = e => state.form.notes = e.target.value;
  if ($('show-notes-btn')) $('show-notes-btn').onclick = () => { state.form.showNotes = true; render(); document.getElementById('f-notes')?.focus(); };

  if ($('pass-btn')) $('pass-btn').onclick = () => passClicked();
  if ($('fail-btn')) $('fail-btn').onclick = () => failClicked();
  if ($('copy-last-btn')) $('copy-last-btn').onclick = () => copyLastResult();
  if ($('prev-btn')) $('prev-btn').onclick = () => moveCursor(-1);
  if ($('next-btn')) $('next-btn').onclick = () => moveCursor(1);
  if ($('del-item-btn')) $('del-item-btn').onclick = () => { if (confirm('Delete this item?')) deleteItem(state.cursor); };

  // Fail modal
  document.querySelectorAll('[data-reason]').forEach(el => {
    el.onclick = () => pickFailReason(el.dataset.reason);
  });
  if ($('fail-skip')) $('fail-skip').onclick = () => pickFailReason(null);
  if ($('fail-close')) $('fail-close').onclick = () => cancelFailModal();
  if ($('fail-backdrop')) $('fail-backdrop').onclick = () => cancelFailModal();

  // Overview screen
  if ($('back-btn')) $('back-btn').onclick = () => setView(state.activeId ? 'entry' : 'sessions');
  if ($('export-btn')) $('export-btn').onclick = () => { const s = activeSession(); if (s) downloadCSV(s); };
  if ($('edit-session-btn')) $('edit-session-btn').onclick = () => startEditSession();
  if ($('fails-only-toggle')) $('fails-only-toggle').onchange = e => {
    state.showFailsOnly = e.target.checked;
    render();
  };
  document.querySelectorAll('[data-jump]').forEach(el => {
    el.onclick = () => jumpTo(parseInt(el.dataset.jump, 10));
  });
  document.querySelectorAll('[data-del-item]').forEach(el => {
    el.onclick = (e) => { e.stopPropagation(); if (confirm('Delete this item?')) deleteItem(parseInt(el.dataset.delItem, 10)); };
  });

  // Edit-session screen
  if ($('cancel-edit-btn')) $('cancel-edit-btn').onclick = () => setView('overview');
  if ($('ef-cancel')) $('ef-cancel').onclick = () => setView('overview');
  if ($('ef-save')) $('ef-save').onclick = () => {
    state.editForm.site = $('ef-site').value;
    state.editForm.engineer = $('ef-engineer').value;
    state.editForm.name = $('ef-name').value;
    state.editForm.date = $('ef-date').value;
    state.editForm.prefix = $('ef-prefix').value;
    saveSessionEdits();
  };
  if ($('ef-site')) $('ef-site').oninput = e => state.editForm.site = e.target.value;
  if ($('ef-engineer')) $('ef-engineer').oninput = e => state.editForm.engineer = e.target.value;
  if ($('ef-name')) $('ef-name').oninput = e => state.editForm.name = e.target.value;
  if ($('ef-date')) $('ef-date').oninput = e => state.editForm.date = e.target.value;
  if ($('ef-prefix')) $('ef-prefix').oninput = e => state.editForm.prefix = e.target.value;

  // Settings screen
  if ($('settings-save')) $('settings-save').onclick = () => saveSettings();
}

// Light re-render of just the suggestions dropdown so we don't lose input focus
function renderSuggestionsOnly() {
  const wrap = document.querySelector('.custom-type-wrap');
  if (!wrap) return;
  const existing = wrap.querySelector('.suggestions');
  if (existing) existing.remove();
  if (state.showSuggestions && state.suggestions.length > 0) {
    const div = document.createElement('div');
    div.className = 'suggestions';
    div.innerHTML = state.suggestions.map(s => `<button class="suggestion-item" data-suggest="${escapeHTML(s)}">${escapeHTML(s)}</button>`).join('');
    wrap.appendChild(div);
    div.querySelectorAll('[data-suggest]').forEach(el => {
      el.onmousedown = (e) => { e.preventDefault(); };
      el.onclick = () => {
        state.form.itemType = el.dataset.suggest;
        const inp = document.getElementById('f-type');
        if (inp) inp.value = el.dataset.suggest;
        state.showSuggestions = false;
        renderSuggestionsOnly();
      };
    });
  }
}

// ---------- Boot ----------
load();
loadFormForCursor();
render();
