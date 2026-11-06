// ============== PATGo PWA — V149 — Every job knows its business ==============
// (c) 2026 Peter Birchley. All rights reserved.
//
// business.js (Stage 16 / Teams v1).
//
// OPTIONAL subsystem (MAP rule 6): every caller is typeof-guarded and this file
// never stops the app starting. Without it a job simply names no business and the
// database files it under the person's default — exactly as V148 did.
//
// What it does (Peter, 2 and 5 Nov — 1A 3A 4A; 0A split the move into V150):
//   • Knows the signed-in person's businesses (the cloud's my_businesses), kept
//     on the phone (BUSINESSES_KEY) so New job's choice works with no signal.
//     Read on a reading sync run at most every BUSINESS_READ_MS, and on every
//     open of the Business page.
//   • 1A "For: [business]" on New job — ONLY for someone in two or more,
//     starting on the last one used on this phone (LAST_BUSINESS_KEY), else the
//     default. The job records `businessId`; sync.js sends it as the row's
//     business on the FIRST upload. The database keeps it only if the person
//     belongs to that business (supabase/v149-business-per-job.sql).
//   • 3A the Business page (Settings → Account & Sync → Business): each
//     business, your role, which is the default; the Owner names it, the box
//     pre-filled from Company & Branding's company name.
//   • 1A (Claude's rule, from the round): a job made FROM a job (split,
//     duplicate) keeps that job's business, and items only move between jobs of
//     the SAME business — jobBusinessKey() is what session.js compares.
//
// ⚠ A job with no businessId is the DEFAULT business's (every job before V149,
// every job of someone in one business). jobBusinessKey() folds the default's id
// and "none" into one key, so a job that names the default and one that names
// nothing compare equal.
// ⚠ The list is the phone OWNER's: sync only runs as the owner (V145), and a
// takeover clears BUSINESSES_KEY (reset.js) — so it is read whatever the sign-in.

const BUSINESS_ROLE_WORDS = { owner: 'Owner', team_leader: 'Team leader', engineer: 'Engineer', office: 'Office' };
const _BUSINESS_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function businessValidId(id) { return typeof id === 'string' && _BUSINESS_ID_RE.test(id); }

// ---- the stored list ----------------------------------------------------------
// Garbage collapses to an empty list (never a throw).
function businessLoad() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(BUSINESSES_KEY) || 'null'); } catch (e) { raw = null; }
  const out = { u: '', at: 0, list: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  out.u = typeof raw.u === 'string' ? raw.u : '';
  out.at = (typeof raw.at === 'number' && isFinite(raw.at)) ? raw.at : 0;
  const seen = new Set();
  for (const b of (Array.isArray(raw.list) ? raw.list : [])) {
    if (!b || !businessValidId(b.id) || seen.has(b.id)) continue;
    seen.add(b.id);
    out.list.push({
      id: b.id,
      name: typeof b.name === 'string' ? b.name.slice(0, 80) : '',
      role: BUSINESS_ROLE_WORDS[b.role] ? b.role : 'engineer',
      def: b.def === true,
      n: (typeof b.n === 'number' && b.n > 0) ? Math.floor(b.n) : 1,
    });
  }
  return out;
}

function businessSave(rec) {
  try { localStorage.setItem(BUSINESSES_KEY, JSON.stringify(rec)); return true; } catch (e) { return false; }
}

function businessList() { return businessLoad().list; }

function businessDefault() {
  const list = businessList();
  return list.find(b => b.def) || null;
}

// What a business is called on screen (3A): its name; an unnamed one you own is
// "Your business", anyone else's "Unnamed business".
function businessLabel(b) {
  if (!b) return '';
  const n = String(b.name || '').trim();
  if (n) return n;
  return b.role === 'owner' ? 'Your business' : 'Unnamed business';
}

// The key two jobs are compared by (1A). '' = the default business.
function jobBusinessKey(sess) {
  const id = sess && businessValidId(sess.businessId) ? sess.businessId : '';
  if (!id) return '';
  const d = businessDefault();
  return (d && d.id === id) ? '' : id;
}

// ---- New job: "For:" (1A) -----------------------------------------------------
// Shown only for someone in two or more businesses.
function businessChoices() {
  const list = businessList();
  return list.length >= 2 ? list : [];
}

function businessLastUsed() {
  try { const v = localStorage.getItem(LAST_BUSINESS_KEY); return businessValidId(v) ? v : ''; } catch (e) { return ''; }
}

// The business the form starts on: the last used on this phone if still one of
// yours, else the default, else the first.
function businessForInitial() {
  const list = businessChoices();
  if (!list.length) return '';
  const last = businessLastUsed();
  if (last && list.some(b => b.id === last)) return last;
  const d = list.find(b => b.def);
  return d ? d.id : list[0].id;
}

function businessForHTML() {
  const list = businessChoices();
  if (!list.length) return '';
  const pick = (state.newForm && businessValidId(state.newForm.businessId) && list.some(b => b.id === state.newForm.businessId))
    ? state.newForm.businessId : businessForInitial();
  return `
      <label class="label" for="nf-business">For</label>
      <select class="input" id="nf-business" data-change-action="nf-business" aria-label="Which business this job is for">
        ${list.map(b => `<option value="${escapeHTML(b.id)}"${b.id === pick ? ' selected' : ''}>${escapeHTML(businessLabel(b))}${b.role !== 'owner' ? ` (${escapeHTML(BUSINESS_ROLE_WORDS[b.role])})` : ''}</option>`).join('')}
      </select>`;
}

// On Start: the business picked (or '' when there was no choice). Remembered as
// the last used. An id that isn't one of yours is never recorded.
function businessNewJobPick(value) {
  const list = businessChoices();
  if (!list.length) return '';
  const v = businessValidId(value) && list.some(b => b.id === value) ? value : businessForInitial();
  if (v) { try { localStorage.setItem(LAST_BUSINESS_KEY, v); } catch (e) { /* the choice still stands */ } }
  return v;
}

// ---- reading the cloud --------------------------------------------------------
function _biz() {
  if (!state.business || typeof state.business !== 'object') state.business = { reading: false, error: '' };
  return state.business;
}

function _bizOffline() {
  try { return navigator.onLine === false; } catch (e) { return false; }
}

// Rows from my_businesses → the stored shape. Returns the record, or null.
function businessFromRows(uid, rows) {
  if (!Array.isArray(rows)) return null;
  const list = [];
  for (const r of rows) {
    if (!r || !businessValidId(r.id)) continue;
    list.push({ id: r.id, name: typeof r.name === 'string' ? r.name : '', role: r.role, def: r.is_default === true, n: r.members });
  }
  businessSave({ u: uid, at: Date.now(), list });
  return businessLoad();
}

function businessRead(c, uid) {
  return Promise.resolve()
    .then(() => c.rpc('my_businesses'))
    .then((res) => {
      if (!res || res.error) throw (res && res.error) || new Error('no answer');
      return !!businessFromRows(uid, res.data);
    });
}

// sync.js, on a reading run: only when the stored list is another account's,
// older than BUSINESS_READ_MS, or dated in the future (a clock wound back).
function businessReadDue(rec, uid, now) {
  if (!rec || rec.u !== uid) return true;
  if (!(rec.at > 0) || now < rec.at) return true;
  return now - rec.at >= BUSINESS_READ_MS;
}

function businessMaybeRead(c, uid) {
  if (!uid || !businessReadDue(businessLoad(), uid, Date.now())) return Promise.resolve(false);
  return businessRead(c, uid).catch((e) => {
    console.error('Business: list not read this time (non-fatal).', e);
    return false;
  });
}

function _bizRepaint() {
  if (state.view !== 'cloudBusiness') return;
  if (document.getElementById('name-sheet-input')) return;   // the name sheet is open: never under it
  render();
}

// The Business page, on every open and on Check again.
function businessRefresh() {
  const b = _biz();
  const uid = typeof cloudUserId === 'function' ? cloudUserId() : '';
  if (!uid || b.reading) return Promise.resolve(false);
  if (_bizOffline()) { b.error = 'offline'; _bizRepaint(); return Promise.resolve(false); }
  b.reading = true; b.error = '';
  _bizRepaint();
  return cloudClient()
    .then((c) => businessRead(c, uid))
    .then((ok) => { if (!ok) b.error = 'read'; return ok; })
    .catch(() => { b.error = 'read'; return false; })
    .then((ok) => { b.reading = false; _bizRepaint(); return ok; });
}

// ---- naming (3A) --------------------------------------------------------------
function businessRename(id) {
  const rec = businessLoad();
  const biz = rec.list.find(x => x.id === id);
  if (!biz || biz.role !== 'owner') return false;
  const company = state.reportSettings && typeof state.reportSettings.companyName === 'string'
    ? state.reportSettings.companyName.trim() : '';
  openNameSheet({
    title: biz.name ? 'Rename your business' : 'Name your business',
    blurb: 'Shown to everyone in the business, and on New job for anyone who works for more than one.',
    value: (biz.name || company).slice(0, 80),
    placeholder: 'e.g. Birchley PAT Services',
    confirmLabel: 'Save',
    maxlength: 80,
    onConfirm: (v) => { businessSaveName(id, v); },
  });
  return true;
}

function businessSaveName(id, name) {
  const v = String(name || '').trim().slice(0, 80);
  if (!v) return Promise.resolve(false);
  if (_bizOffline()) { showToast('You need a signal to name your business.'); return Promise.resolve(false); }
  const uid = typeof cloudUserId === 'function' ? cloudUserId() : '';
  if (!uid) { showToast('Sign in first.'); return Promise.resolve(false); }
  return cloudClient()
    .then((c) => c.rpc('set_business_name', { o: id, n: v }))
    .then((res) => {
      if (!res || res.error) throw (res && res.error) || new Error('no answer');
      const rec = businessLoad();
      const biz = rec.list.find(x => x.id === id);
      if (biz) { biz.name = typeof res.data === 'string' ? res.data : v; businessSave(rec); }
      showToast('Business name saved');
      _bizRepaint();
      return true;
    })
    .catch(() => { showToast('The name wasn’t saved — try again with a signal.'); return false; });
}

// ---- the Business page (3A) ---------------------------------------------------
function businessRowStatus() {
  const d = businessDefault();
  const n = businessList().length;
  if (!d) return 'Your business';
  return n > 1 ? `${businessLabel(d)} + ${n - 1} more` : businessLabel(d);
}

function renderCloudBusiness() {
  const signedIn = !!(state.cloud && state.cloud.status === 'signed-in');
  const b = _biz();
  let body;
  if (!signedIn) {
    body = `
      <div class="info-card">
        <p class="muted">Sign in to see your business.</p>
        <button class="backup-action-btn" id="biz-account" data-action="settings-page" data-arg="cloudAccount" style="margin-top:8px">Account ›</button>
      </div>`;
  } else {
    const rec = businessLoad();
    const uid = typeof cloudUserId === 'function' ? cloudUserId() : '';
    const list = rec.u === uid ? rec.list : [];
    const status = b.reading ? 'Checking your businesses…'
      : b.error === 'offline' ? 'No signal — showing what this phone last knew.'
      : b.error ? 'Couldn’t check just now — showing what this phone last knew.' : '';
    const cards = list.map((x, i) => {
      const who = BUSINESS_ROLE_WORDS[x.role] || 'Member';
      const people = x.n > 1 ? `${x.n} people` : 'Just you';
      const btn = x.role === 'owner'
        ? `<button class="backup-action-btn" id="biz-rename-${i}" data-action="biz-rename" data-arg="${escapeHTML(x.id)}" style="margin-top:8px">${x.name ? 'Rename' : 'Name your business'}</button>` : '';
      return `
      <div class="info-card biz-card" id="biz-card-${i}">
        <h3 id="biz-name-${i}">${escapeHTML(businessLabel(x))}</h3>
        <p class="muted" id="biz-role-${i}">You: ${escapeHTML(who)} · ${escapeHTML(people)}</p>
        ${x.def ? `<p class="muted" id="biz-default-${i}">Your main business — new jobs go here unless you choose another.</p>` : ''}
        ${btn}
      </div>`;
    }).join('');
    body = `
      ${status ? `<p class="muted cloud-msg" id="biz-status" role="status">${escapeHTML(status)}</p>` : ''}
      ${cards || (b.reading ? '' : '<div class="info-card"><p class="muted" id="biz-none">Nothing read yet.</p></div>')}
      <button class="backup-action-btn" id="biz-refresh" data-action="biz-refresh" ${b.reading ? 'disabled' : ''} style="margin-top:4px">Check again</button>`;
  }
  return `
    <div class="screen" id="cloud-business-page">
      ${renderSettingsSubHeader('Business')}
      <div class="info-card">
        <p class="muted" id="biz-intro">Every job belongs to a business. Most people have one — their own. If you work for more than one, New job asks which business each job is for.</p>
      </div>
      ${body}
    </div>
  `;
}
