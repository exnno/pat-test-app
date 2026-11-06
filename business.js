// ============== PATGo PWA — V150 — Moving a job to another business ===========
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
//
// V150 (Peter, 5–6 Nov — 0A 1A 2A 3A 4A):
//   • The list is read on every app start and every return to the front
//     (_bizReadOwed), not only every BUSINESS_READ_MS — an invite shows at once.
//   • Change… on Job settings (2A): move_job in the cloud. Out of a business you
//     own it moves at once; out of a team business it waits for someone ELSE to
//     approve. A job the cloud hasn't got simply changes here (nothing to move).
//   • 1A the record: my_job_moves → JOB_MOVES_KEY → the Job settings line.
//   • 3A the cloud's column is the truth: sync.js hands over each listed job's
//     org_id and businessReconcileJobs() quietly puts the job right.

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

// V151: through sync.js's gate, so a phone below the minimum app version reads
// and writes no businesses or moves (sync.js syncDataClient). business.js loads
// after sync.js; the typeof is for a copy whose sync.js failed to load.
function _bizClient() {
  return (typeof syncDataClient === 'function') ? syncDataClient() : cloudClient();
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
      const ok = !!businessFromRows(uid, res.data);
      if (ok) _bizReadOwed = false;
      // V150: the moves too — on their own, so a project without the V150 SQL
      // (or a failed read) never stops the list.
      return businessMovesRead(c, uid).then(() => ok, () => ok);
    });
}

// sync.js, on a reading run: when the stored list is another account's, older
// than BUSINESS_READ_MS, or dated in the future (a clock wound back) — or owed
// (V150: app start / back to the front — businessMaybeRead).
function businessReadDue(rec, uid, now) {
  if (!rec || rec.u !== uid) return true;
  if (!(rec.at > 0) || now < rec.at) return true;
  return now - rec.at >= BUSINESS_READ_MS;
}

// V150: owed on every app start (true at load) and every return to the front
// (businessReadOwe, from sync.js's resume listener) — whatever the 6 hours say.
let _bizReadOwed = true;

function businessReadOwe() { _bizReadOwed = true; }

function businessMaybeRead(c, uid) {
  if (!uid || (!_bizReadOwed && !businessReadDue(businessLoad(), uid, Date.now()))) return Promise.resolve(false);
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
  return _bizClient()
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
  return _bizClient()
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

// ============================================================================
// V150 — moving a job to another business (Change…)
// ============================================================================
// Locked 5–6 Nov (Peter): 1A recorded in the cloud (job_moves, never edited or
// deleted) and a line on Job settings · 2A out of a team business it waits for
// approval, the job carries on where it is, the asker can Cancel request; locked
// or certified meanwhile → the request is dropped · 3A the cloud's column wins,
// quietly · 4A the test aid approves by hand (supabase/v150-test-decide-move.sql).
// Claude's calls: needs a signal; a job the cloud hasn't got changes here only
// (the cloud answers patgo_move_gone — nothing there to move or approve);
// photos move with the job in the same database step.
//
// ⚠ businessId changes IN PLACE here and in businessReconcileJobs, usually on a
// job that is not the open one — storage.js _sessionSig carries businessId, so
// the saved copy is re-written (without it the change silently never saved).

const BUSINESS_MOVE_WORDS = { waiting: 'waiting', moved: 'moved', refused: 'refused', cancelled: 'cancelled', dropped: 'dropped' };

// ---- the stored record (JOB_MOVES_KEY) ------------------------------------------
function businessMovesLoad() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(JOB_MOVES_KEY) || 'null'); } catch (e) { raw = null; }
  const out = { u: '', at: 0, list: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  out.u = typeof raw.u === 'string' ? raw.u : '';
  out.at = (typeof raw.at === 'number' && isFinite(raw.at)) ? raw.at : 0;
  const seen = new Set();
  for (const m of (Array.isArray(raw.list) ? raw.list : [])) {
    if (!m || !businessValidId(m.id) || typeof m.job !== 'string' || !m.job || seen.has(m.job)) continue;
    if (!businessValidId(m.from) || !businessValidId(m.to) || !BUSINESS_MOVE_WORDS[m.st]) continue;
    seen.add(m.job);
    out.list.push({
      id: m.id, job: m.job, from: m.from, to: m.to, st: m.st,
      fromName: typeof m.fromName === 'string' ? m.fromName.slice(0, 80) : '',
      toName: typeof m.toName === 'string' ? m.toName.slice(0, 80) : '',
      at: typeof m.at === 'string' ? m.at : '',
    });
  }
  return out;
}

function businessMovesSave(rec) {
  try { localStorage.setItem(JOB_MOVES_KEY, JSON.stringify(rec)); return true; } catch (e) { return false; }
}

// Rows from my_job_moves (one per job, the latest) → the stored shape.
function businessMovesFromRows(uid, rows) {
  if (!Array.isArray(rows)) return null;
  const list = [];
  for (const r of rows) {
    if (!r || !businessValidId(r.id) || typeof r.session_id !== 'string') continue;
    list.push({ id: r.id, job: r.session_id, from: r.from_org, to: r.to_org, st: r.status,
      fromName: typeof r.from_name === 'string' ? r.from_name : '',
      toName: typeof r.to_name === 'string' ? r.to_name : '',
      at: typeof (r.decided_at || r.requested_at) === 'string' ? (r.decided_at || r.requested_at) : '' });
  }
  businessMovesSave({ u: uid, at: Date.now(), list });
  return businessMovesLoad();
}

// The latest move or request for a job — this account's record only.
function businessMoveFor(jobId) {
  const rec = businessMovesLoad();
  const uid = typeof cloudUserId === 'function' ? cloudUserId() : '';
  if (!uid || rec.u !== uid) return null;
  return rec.list.find(m => m.job === String(jobId)) || null;
}

function businessMovesRead(c, uid) {
  return Promise.resolve()
    .then(() => c.rpc('my_job_moves'))
    .then((res) => {
      if (!res || res.error) throw (res && res.error) || new Error('no answer');
      if (!businessMovesFromRows(uid, res.data)) return false;
      return businessMovesSweep(c).then(() => true, () => true);
    })
    .catch((e) => { console.error('Business: moves not read this time (non-fatal).', e); return false; });
}

// 2A: a request whose job has since been locked or certified here is dropped
// (the database drops it too if it is approved after the lock reaches the cloud).
function businessMovesSweep(c) {
  const rec = businessMovesLoad();
  const jobs = new Map((state.sessions || []).map(s => [String(s && s.id), s]));
  let chain = Promise.resolve();
  for (const m of rec.list) {
    if (m.st !== 'waiting') continue;
    const s = jobs.get(m.job);
    if (!s || !(s.locked || (typeof s.certNo === 'string' && s.certNo.trim()))) continue;
    chain = chain.then(() => c.rpc('cancel_job_move', { move: m.id, dropped: true }))
      .then((res) => {
        if (!res || res.error) return;
        const now = businessMovesLoad();
        const e = now.list.find(x => x.id === m.id);
        if (e) { e.st = BUSINESS_MOVE_WORDS[res.data] ? res.data : 'dropped'; businessMovesSave(now); }
      }, () => { /* next read tries again */ });
  }
  return chain;
}

// ---- the cloud's answer wins (3A) -------------------------------------------------
// sync.js (the pull) hands over { jobId: org_id } for the job rows it listed.
// A job whose business says otherwise is put right — quietly. Only with this
// account's list read (the default must be known: a job filed under the default
// names none, exactly as before). Returns how many changed.
function businessReconcileJobs(orgs, uid) {
  if (!orgs || typeof orgs !== 'object') return 0;
  const rec = businessLoad();
  if (!uid || rec.u !== uid) return 0;
  const d = rec.list.find(b => b.def);
  if (!d) return 0;
  let n = 0;
  for (const s of (state.sessions || [])) {
    if (!s || !Object.prototype.hasOwnProperty.call(orgs, String(s.id))) continue;
    const org = orgs[String(s.id)];
    if (!businessValidId(org)) continue;
    const want = org === d.id ? '' : org;
    const have = (businessValidId(s.businessId) && s.businessId !== d.id) ? s.businessId : '';
    if (want === have) continue;
    if (want) s.businessId = want; else delete s.businessId;
    n++;
  }
  return n;
}

// ---- Job settings: the Business card ----------------------------------------------
// A business's name as this phone knows it: from the list if you're still in it
// (its current name, 3A's words for an unnamed one), else the name the record
// carried, else "another business".
function _bizNameFor(id, carried) {
  const b = businessList().find(x => x.id === id);
  if (b) return businessLabel(b);
  const n = String(carried || '').trim();
  return n || 'another business';
}

function _bizDay(ts) {
  const d = new Date(ts);
  if (!ts || isNaN(d.getTime())) return '';
  const p = (k) => String(k).padStart(2, '0');
  return formatDate(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
}

// The business a job is in, as this phone knows it ('' = not known yet).
function businessOfJob(sess) {
  const k = jobBusinessKey(sess);
  if (k) return k;
  const d = businessDefault();
  return d ? d.id : '';
}

// What the record says under the business name — '' for nothing to say.
function businessMoveLine(m) {
  if (!m) return '';
  if (m.st === 'waiting') return `Move to ${_bizNameFor(m.to, m.toName)} waiting for approval`;
  const day = _bizDay(m.at);
  if (m.st === 'moved') return `Moved from ${_bizNameFor(m.from, m.fromName)} to ${_bizNameFor(m.to, m.toName)}${day ? ' · ' + day : ''}`;
  if (m.st === 'refused') return `Move to ${_bizNameFor(m.to, m.toName)} refused${day ? ' · ' + day : ''}`;
  return '';   // cancelled / dropped: nothing to tell
}

// Shown for someone in two or more businesses, or for a job with a move on
// record. Nothing at all for everyone else (solo users: Job settings as before).
function businessJobCardHTML(sess) {
  if (!sess) return '';
  const several = businessChoices().length >= 2;
  const m = businessMoveFor(sess.id);
  if (!several && !m) return '';
  const cur = businessOfJob(sess);
  const name = cur ? _bizNameFor(cur, '') : 'Your business';
  const line = businessMoveLine(m);
  const waiting = !!(m && m.st === 'waiting');
  return `
      <div class="card biz-job-card" id="ef-biz-card">
        <label class="label">Business</label>
        <p class="biz-job-name" id="ef-biz-name">${escapeHTML(name)}</p>
        ${line ? `<p class="muted biz-job-line" id="ef-biz-line">${escapeHTML(line)}</p>` : ''}
        ${waiting
          ? `<button class="btn-secondary" id="ef-biz-cancel" data-action="biz-move-cancel" data-arg="${escapeHTML(m.id)}">Cancel request</button>`
          : (several ? `<button class="btn-secondary" id="ef-biz-change" data-action="biz-move-open">Change…</button>` : '')}
      </div>`;
}

// Opening Job settings: a waiting request is re-read so its line is current.
function businessJobSettingsOpened() {
  const sess = (state.sessions || []).find(s => s && String(s.id) === String(state.activeId));
  const m = sess ? businessMoveFor(sess.id) : null;
  if (!m || m.st !== 'waiting' || _bizOffline()) return Promise.resolve(false);
  const uid = typeof cloudUserId === 'function' ? cloudUserId() : '';
  if (!uid || typeof cloudClient !== 'function') return Promise.resolve(false);
  return _bizClient()
    .then((c) => businessMovesRead(c, uid))
    .then((ok) => { if (ok) _bizMoveRepaint(); return ok; }, () => false);
}

// ---- the sheet -------------------------------------------------------------------
// state.bizMove = { job, step: 'pick' | 'confirm' | 'working' | 'blocked', to, why }.
// Buttons only (no typing), so it may repaint itself (MAP rule 3).
function _bizMoveJob() {
  const m = state.bizMove;
  if (!m) return null;
  return (state.sessions || []).find(s => s && String(s.id) === String(m.job)) || null;
}

function _bizMoveRepaint() {
  if (state.view !== 'editSession') return;
  if (typeof _syncRepaintApp === 'function') _syncRepaintApp(); else render();
}

// Why this job can't be moved now ('' = it can).
function businessMoveBlockReason(sess) {
  if (!sess) return 'This job isn’t here any more.';
  if (!(state.cloud && state.cloud.status === 'signed-in') || (typeof syncActive === 'function' && !syncActive())) {
    return 'Sign in to move a job to another business.';
  }
  if (sess.locked) return 'This job is locked. Unlock it in Job settings first, then change its business.';
  if (typeof sess.certNo === 'string' && sess.certNo.trim()) {
    return 'This job has a certificate number, so it stays with the business it was certified for.';
  }
  if (_bizOffline()) return 'You need a signal to move a job to another business.';
  return '';
}

function businessMoveOpen() {
  const sess = (state.sessions || []).find(s => s && String(s.id) === String(state.activeId));
  if (!sess) return false;
  const why = businessMoveBlockReason(sess);
  state.bizMove = why ? { job: String(sess.id), step: 'blocked', why } : { job: String(sess.id), step: 'pick' };
  render();
  return true;
}

function businessMoveClose() {
  if (state.bizMove && state.bizMove.step === 'working') return false;
  state.bizMove = null;
  render();
  return true;
}

function businessMovePick(id) {
  const m = state.bizMove;
  const sess = _bizMoveJob();
  if (!m || !sess || m.step !== 'pick') return false;
  if (!businessChoices().some(b => b.id === id) || id === businessOfJob(sess)) return false;
  m.to = id; m.step = 'confirm';
  render();
  return true;
}

function businessMoveBack() {
  if (!state.bizMove || state.bizMove.step !== 'confirm') return false;
  state.bizMove.step = 'pick'; state.bizMove.to = '';
  render();
  return true;
}

// Does leaving this job's business need someone else's approval? (2A — the
// Owner of the business it is leaving moves freely.) The database decides; this
// is only what the sheet says beforehand.
function businessMoveNeedsApproval(sess) {
  const cur = businessList().find(b => b.id === businessOfJob(sess));
  return !!(cur && cur.role !== 'owner');
}

// The job's business on the phone: the default is "none" (as since V149).
function businessSetJob(sess, id) {
  const d = businessDefault();
  if (!businessValidId(id) || (d && d.id === id)) delete sess.businessId; else sess.businessId = id;
  saveSessions();
}

function businessMoveError(e) {
  const msg = String((e && (e.message || e.msg)) || '');
  if (msg.indexOf('patgo_move_locked') !== -1) return 'A locked or certified job stays with its business.';
  if (msg.indexOf('patgo_move_waiting') !== -1) return 'This job already has a move waiting for approval.';
  if (msg.indexOf('patgo_move_both') !== -1) return 'You need to belong to both businesses — check Settings → Account & Sync → Business.';
  if (msg.indexOf('patgo_move_same') !== -1) return 'The job is already in that business.';
  if (msg.indexOf('patgo_plan_locked') !== -1) return 'That business’s PATGo plan has ended, so it can’t take jobs just now.';
  return 'The job wasn’t moved — try again with a signal.';
}

function businessMoveGo() {
  const m = state.bizMove;
  const sess = _bizMoveJob();
  if (!m || !sess || m.step !== 'confirm' || !businessValidId(m.to)) return Promise.resolve(false);
  const why = businessMoveBlockReason(sess);
  if (why) { state.bizMove = { job: m.job, step: 'blocked', why }; render(); return Promise.resolve(false); }
  const uid = typeof cloudUserId === 'function' ? cloudUserId() : '';
  const to = m.to;
  const toName = _bizNameFor(to, '');
  m.step = 'working';
  render();
  let client = null;
  return _bizClient()
    .then((c) => { client = c; return c.rpc('move_job', { job: String(sess.id), target: to }); })
    .then((res) => {
      const err = res && res.error;
      // Not in the cloud (never uploaded, or deleted there): nothing to move or
      // approve — the job simply starts life in the new business when it goes up.
      if (err && String(err.message || '').indexOf('patgo_move_gone') !== -1) {
        businessSetJob(sess, to);
        return 'local';
      }
      if (!res || err) throw err || new Error('no answer');
      if (res.data === 'moved') businessSetJob(sess, to);
      return res.data === 'moved' ? 'moved' : 'waiting';
    })
    .then((out) => (out === 'local' ? out
      : businessMovesRead(client, uid).then(() => out, () => out)))
    .then((out) => {
      state.bizMove = null;
      showToast(out === 'waiting' ? `Move to ${toName} is waiting for approval` : `Moved to ${toName}`);
      if (typeof syncPushSoon === 'function' && out !== 'waiting') syncPushSoon(0);
      render();
      return out;
    })
    .catch((e) => {
      state.bizMove = { job: m.job, step: 'blocked', why: businessMoveError(e) };
      render();
      return false;
    });
}

function businessMoveCancel(id) {
  if (!businessValidId(id)) return Promise.resolve(false);
  if (_bizOffline()) { showToast('You need a signal to cancel the request.'); return Promise.resolve(false); }
  const uid = typeof cloudUserId === 'function' ? cloudUserId() : '';
  if (!uid) { showToast('Sign in first.'); return Promise.resolve(false); }
  let client = null;
  return _bizClient()
    .then((c) => { client = c; return c.rpc('cancel_job_move', { move: id }); })
    .then((res) => {
      if (!res || res.error) throw (res && res.error) || new Error('no answer');
      return businessMovesRead(client, uid).then(() => res.data, () => res.data);
    })
    .then((st) => {
      showToast(st === 'cancelled' ? 'Request cancelled' : st === 'moved' ? 'Already approved — the job has moved' : 'That request had already been decided');
      _bizMoveRepaint();
      return true;
    })
    .catch(() => { showToast('The request wasn’t cancelled — try again with a signal.'); return false; });
}

function renderBusinessMoveSheet(sess) {
  const m = state.bizMove;
  if (!m || !sess || String(m.job) !== String(sess.id)) return '';
  const working = m.step === 'working';
  const head = (title) => `
      <div class="modal-backdrop" id="biz-move-backdrop" ${working ? '' : 'data-action="biz-move-close"'}></div>
      <div class="bulk-sheet move-job-sheet biz-move-sheet" role="dialog" aria-label="${escapeHTML(title)}">
        <div class="bulk-sheet-handle"></div>
        <div class="bulk-sheet-header">
          <span class="fail-close-spacer"></span>
          <h3 class="bulk-sheet-title">${escapeHTML(title)}</h3>
          ${working ? '<span class="fail-close-spacer"></span>' : '<button class="fail-close-btn" id="biz-move-close" data-action="biz-move-close" aria-label="Cancel">×</button>'}
        </div>`;
  if (m.step === 'blocked') {
    return head('Can’t move this job') + `
        <p class="move-job-why" id="biz-move-why">${escapeHTML(m.why || '')}</p>
        <button class="btn-primary" id="biz-move-ok" data-action="biz-move-close">OK</button>
      </div>`;
  }
  if (working) {
    return head('Moving…') + `
        <p class="move-job-msg" id="biz-move-progress" role="status">Moving the job…</p>
      </div>`;
  }
  const curId = businessOfJob(sess);
  const curName = _bizNameFor(curId, '');
  if (m.step === 'confirm') {
    const toName = _bizNameFor(m.to, '');
    const ask = businessMoveNeedsApproval(sess);
    const cur = businessList().find(b => b.id === curId);
    const role = cur ? (BUSINESS_ROLE_WORDS[cur.role] || 'member') : 'member';
    const say = ask
      ? `You’re ${/^[aeiou]/i.test(role) ? 'an' : 'a'} ${role} in ${curName}, so someone else there — the Owner, a Team leader or the Office — has to approve it. Until then the job stays in ${curName} and you can carry on with it.`
      : `It moves straight away, with its photos. The move is recorded.`;
    return head(`Move to ${toName}?`) + `
        <p class="move-job-msg" id="biz-move-say">${escapeHTML(say)}</p>
        <button class="btn-primary" id="biz-move-go" data-action="biz-move-go">${ask ? 'Ask to move it' : 'Move it'}</button>
        <button class="btn-secondary move-job-back" id="biz-move-back" data-action="biz-move-back">Back</button>
      </div>`;
  }
  const rows = businessChoices().filter(b => b.id !== curId).map((b) => `
          <li class="move-to-job">
            <button type="button" class="move-to-job-btn" data-action="biz-move-pick" data-arg="${escapeHTML(b.id)}">
              <span class="move-to-job-title">${escapeHTML(businessLabel(b))}</span>
              <span class="muted move-to-job-sub">You: ${escapeHTML(BUSINESS_ROLE_WORDS[b.role] || 'Member')}</span>
            </button></li>`).join('');
  return head('Move this job to…') + `
        <p class="muted move-job-note" id="biz-move-from">Now in ${escapeHTML(curName)}.</p>
        <div class="sheet-scroll move-job-scroll">
          <ul class="move-to-list" id="biz-move-list">${rows}</ul>
        </div>
      </div>`;
}
