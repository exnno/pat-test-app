// ============== PAT Test PWA ==============
// Storage uses localStorage — works fully offline, persists across launches.

const STORAGE_KEY = 'pat:sessions';
const ACTIVE_KEY = 'pat:active';
const ITEMS_KEY = 'pat:itemtypes';
const DEFAULT_ITEM_TYPES = ['Lead', 'AC adapter', 'Monitor', 'PC', 'Hub', 'Dock'];

// ---------- State ----------
let state = {
  sessions: [],
  activeId: null,
  itemTypes: DEFAULT_ITEM_TYPES.slice(),
  view: 'sessions',
  cursor: 0,
  // form fields for current entry
  form: { assetNo: '', location: '', itemType: '', notes: '', showNotes: false },
  // creation form
  newForm: { name: '', site: '', startNo: '1', show: false }
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

  if (state.activeId && state.sessions.find(s => s.id === state.activeId)) {
    state.view = 'entry';
    const sess = activeSession();
    state.cursor = sess.items.length;
  } else {
    state.activeId = null;
    state.view = 'sessions';
    state.newForm.show = state.sessions.length === 0;
  }
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.sessions));
  localStorage.setItem(ACTIVE_KEY, state.activeId || '');
  localStorage.setItem(ITEMS_KEY, JSON.stringify(state.itemTypes));
}

// ---------- Helpers ----------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayISO = () => new Date().toISOString().slice(0, 10);
const escapeHTML = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function activeSession() { return state.sessions.find(s => s.id === state.activeId); }

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function buildCSV(session) {
  const header = ['Session', 'Site', 'Date', 'Asset No', 'Location', 'Item Type', 'Result', 'Notes'];
  const rows = session.items.map(it => [
    session.name, session.site, session.date,
    it.assetNo, it.location, it.itemType, it.result, it.notes
  ].map(csvEscape).join(','));
  return [header.join(','), ...rows].join('\n');
}
function downloadCSV(session) {
  const blob = new Blob([buildCSV(session)], { type: 'text/csv;charset=utf-8' });
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
      assetNo: String(sess.startNumber + sess.items.length),
      location: sess.lastLocation || '',
      itemType: '',
      notes: '',
      showNotes: false
    };
  }
}

// ---------- Actions ----------
function createSession() {
  const { name, site, startNo } = state.newForm;
  if (!site.trim()) return;
  const s = {
    id: uid(),
    name: name.trim() || `Session ${state.sessions.length + 1}`,
    site: site.trim(),
    date: todayISO(),
    startNumber: parseInt(startNo, 10) || 1,
    lastLocation: '',
    items: []
  };
  state.sessions.unshift(s);
  state.activeId = s.id;
  state.cursor = 0;
  state.view = 'entry';
  state.newForm = { name: '', site: '', startNo: '1', show: false };
  loadFormForCursor();
  save(); render();
}

function openSession(id) {
  state.activeId = id;
  const s = activeSession();
  state.cursor = s.items.length;
  state.view = 'entry';
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
  const item = {
    assetNo: state.form.assetNo.trim() || String(sess.startNumber + sess.items.length),
    location: state.form.location.trim(),
    itemType: state.form.itemType.trim(),
    notes: state.form.notes.trim(),
    result
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

function setView(v) { state.view = v; render(); }

function setItemTypes(text) {
  const arr = text.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 8);
  state.itemTypes = arr.length ? arr : DEFAULT_ITEM_TYPES.slice();
  save();
}

// ---------- Rendering ----------
const app = document.getElementById('app');

function render() {
  const v = state.view;
  let html = '';
  if (v === 'sessions') html = renderSessions();
  else if (v === 'entry') html = renderEntry();
  else if (v === 'overview') html = renderOverview();
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
      <label class="label">Session name (optional)</label>
      <input class="input" id="nf-name" value="${escapeHTML(state.newForm.name)}" placeholder="e.g. Annual test 2026">
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

  const list = state.sessions.length === 0 && !state.newForm.show
    ? `<p class="muted">No sessions yet. Create one to start testing.</p>`
    : state.sessions.map(s => {
        const passes = s.items.filter(i => i.result === 'pass').length;
        const fails = s.items.filter(i => i.result === 'fail').length;
        return `
          <div class="session-card">
            <div class="session-info" data-open="${s.id}">
              <div class="session-title">${escapeHTML(s.site || s.name)}</div>
              <div class="session-meta">${s.date} · ${s.items.length} items · <span class="pass-text">${passes} pass</span> · <span class="fail-text">${fails} fail</span></div>
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
      <div>${list}</div>
    </div>
  `;
}

function renderEntry() {
  const sess = activeSession();
  if (!sess) { state.view = 'sessions'; return renderSessions(); }
  const isExisting = state.cursor < sess.items.length;
  const existing = isExisting ? sess.items[state.cursor] : null;

  const quickButtons = state.itemTypes.map(t => `
    <button class="quick-btn ${state.form.itemType === t ? 'active' : ''}" data-type="${escapeHTML(t)}">${escapeHTML(t)}</button>
  `).join('');

  const notesBlock = state.form.showNotes
    ? `<label class="label">Notes</label>
       <textarea class="textarea" id="f-notes" rows="2" placeholder="Optional">${escapeHTML(state.form.notes)}</textarea>`
    : `<button class="notes-toggle" id="show-notes-btn">✎ Add note</button>`;

  const resultBadge = isExisting && existing.result
    ? `<span style="margin-left:8px;color:${existing.result === 'pass' ? '#16a34a' : '#dc2626'};font-weight:700">· ${existing.result.toUpperCase()}</span>`
    : '';

  return `
    <div class="screen">
      <header class="header-row">
        <button class="icon-btn" id="sessions-btn" aria-label="Sessions">📁</button>
        <div class="site-name">${escapeHTML(sess.site || sess.name)}</div>
        <button class="icon-btn" id="overview-btn" aria-label="Overview">▦</button>
      </header>

      <div class="progress">Item ${state.cursor + 1} ${isExisting ? `of ${sess.items.length}` : '(new)'}${resultBadge}</div>

      <label class="label">Asset number</label>
      <input class="input-big" id="f-asset" value="${escapeHTML(state.form.assetNo)}" inputmode="numeric">

      <label class="label">Location ${!isExisting && sess.lastLocation ? '<span class="hint">(carried from last)</span>' : ''}</label>
      <input class="input-big" id="f-location" value="${escapeHTML(state.form.location)}" placeholder="e.g. Office 1">

      <label class="label">Item type</label>
      <div class="quick-grid">${quickButtons}</div>
      <input class="input" id="f-type" value="${escapeHTML(state.form.itemType)}" placeholder="…or type custom" style="margin-top:8px">

      ${notesBlock}

      <div class="pass-fail-row">
        <button class="pass-btn" id="pass-btn"><span class="icon">✓</span>PASS</button>
        <button class="fail-btn" id="fail-btn"><span class="icon">✗</span>FAIL</button>
      </div>

      <div class="nav-row">
        <button class="nav-btn" id="prev-btn" ${state.cursor === 0 ? 'disabled' : ''}>‹ Prev</button>
        ${isExisting ? `<button class="delete-btn" id="del-item-btn">🗑 Delete</button>` : '<span></span>'}
        <button class="nav-btn" id="next-btn" ${state.cursor >= sess.items.length ? 'disabled' : ''}>Next ›</button>
      </div>
    </div>
  `;
}

function renderOverview() {
  const sess = activeSession();
  if (!sess) { state.view = 'sessions'; return renderSessions(); }
  const passes = sess.items.filter(i => i.result === 'pass').length;
  const fails = sess.items.filter(i => i.result === 'fail').length;

  const body = sess.items.length === 0
    ? `<p class="muted">No items recorded yet.</p>`
    : `<div class="table-wrap">
        <table class="table">
          <thead><tr>
            <th class="th">#</th><th class="th">Location</th><th class="th">Item</th><th class="th">Result</th><th class="th"></th>
          </tr></thead>
          <tbody>
            ${sess.items.map((it, i) => `
              <tr class="tr" data-jump="${i}">
                <td class="td">${escapeHTML(it.assetNo)}</td>
                <td class="td">${escapeHTML(it.location)}</td>
                <td class="td">${escapeHTML(it.itemType)}</td>
                <td class="td td-result" style="color:${it.result === 'pass' ? '#16a34a' : '#dc2626'}">${(it.result || '').toUpperCase()}</td>
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
        <button class="icon-btn" id="export-btn" aria-label="Export CSV">⬇</button>
      </header>
      <div class="progress">${sess.items.length} items · <span class="pass-text">${passes} pass</span> · <span class="fail-text">${fails} fail</span></div>
      ${body}
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
      <h2 class="h2">Quick-pick item types</h2>
      <p class="muted">One per line. Up to 8. These appear as quick-tap buttons on the entry screen.</p>
      <textarea class="textarea" id="settings-types" style="min-height:200px">${escapeHTML(state.itemTypes.join('\n'))}</textarea>
      <button class="btn-primary" id="settings-save" style="margin-top:16px">Save</button>
      <p class="muted" style="margin-top:24px;font-size:12px">PAT Test · Offline PWA · Data stored on this device only</p>
    </div>
  `;
}

// ---------- Event binding ----------
function bindEvents() {
  // Sessions view
  const $ = id => document.getElementById(id);
  if ($('settings-btn')) $('settings-btn').onclick = () => setView('settings');
  if ($('new-session-btn')) $('new-session-btn').onclick = () => { state.newForm.show = true; render(); };
  if ($('nf-cancel')) $('nf-cancel').onclick = () => { state.newForm.show = false; render(); };
  if ($('nf-submit')) $('nf-submit').onclick = () => {
    state.newForm.site = $('nf-site').value;
    state.newForm.name = $('nf-name').value;
    state.newForm.startNo = $('nf-start').value;
    createSession();
  };
  if ($('nf-site')) $('nf-site').oninput = e => state.newForm.site = e.target.value;
  if ($('nf-name')) $('nf-name').oninput = e => state.newForm.name = e.target.value;
  if ($('nf-start')) $('nf-start').oninput = e => state.newForm.startNo = e.target.value;

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

  // Entry view
  if ($('sessions-btn')) $('sessions-btn').onclick = () => setView('sessions');
  if ($('overview-btn')) $('overview-btn').onclick = () => setView('overview');
  if ($('f-asset')) $('f-asset').oninput = e => state.form.assetNo = e.target.value;
  if ($('f-location')) $('f-location').oninput = e => state.form.location = e.target.value;
  if ($('f-type')) $('f-type').oninput = e => {
    state.form.itemType = e.target.value;
    document.querySelectorAll('.quick-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.type === e.target.value);
    });
  };
  if ($('f-notes')) $('f-notes').oninput = e => state.form.notes = e.target.value;
  if ($('show-notes-btn')) $('show-notes-btn').onclick = () => { state.form.showNotes = true; render(); document.getElementById('f-notes')?.focus(); };

  document.querySelectorAll('.quick-btn').forEach(b => {
    b.onclick = () => {
      state.form.itemType = b.dataset.type;
      const inp = document.getElementById('f-type');
      if (inp) inp.value = b.dataset.type;
      document.querySelectorAll('.quick-btn').forEach(x => x.classList.toggle('active', x === b));
    };
  });

  if ($('pass-btn')) $('pass-btn').onclick = () => saveItem('pass');
  if ($('fail-btn')) $('fail-btn').onclick = () => saveItem('fail');
  if ($('prev-btn')) $('prev-btn').onclick = () => moveCursor(-1);
  if ($('next-btn')) $('next-btn').onclick = () => moveCursor(1);
  if ($('del-item-btn')) $('del-item-btn').onclick = () => { if (confirm('Delete this item?')) deleteItem(state.cursor); };

  // Overview
  if ($('back-btn')) $('back-btn').onclick = () => setView(state.activeId ? 'entry' : 'sessions');
  if ($('export-btn')) $('export-btn').onclick = () => { const s = activeSession(); if (s) downloadCSV(s); };
  document.querySelectorAll('[data-jump]').forEach(el => {
    el.onclick = () => jumpTo(parseInt(el.dataset.jump, 10));
  });
  document.querySelectorAll('[data-del-item]').forEach(el => {
    el.onclick = (e) => { e.stopPropagation(); if (confirm('Delete this item?')) deleteItem(parseInt(el.dataset.delItem, 10)); };
  });

  // Settings
  if ($('settings-save')) $('settings-save').onclick = () => {
    setItemTypes($('settings-types').value);
    setView(state.activeId ? 'entry' : 'sessions');
  };
}

// ---------- Boot ----------
load();
loadFormForCursor();
render();
