// ============== PATGo PWA — V160 — Join rechecks the business's phones ===
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
//
// V159 (the second audit, finding 2 — R68 3A, R69; round 1A–4A): Office never
// HOLDS a job. New job's For:, Change…'s list and Make main skip a business where
// you're Office (businessHoldable); a job made from a job there goes to your main
// (businessForCopy, 2A); its card says where your jobs go (3A); Join as Office
// asks nothing about main; changing someone to Office says what happens (4A). The
// database enforces all of it (supabase/v159-office.sql). A job already in an
// Office business (started before the change) carries on as before (R68 3A).

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
      oj: b.oj === true,   // V165: the business holds someone else's jobs (businessOthersApply)
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

// V159 (R68 3A, R69): Office never HOLDS a job. The businesses a job of yours can
// be in — every one but those where you're Office — and the New job choice, only
// when there are two or more of them. (The database files a new job named for an
// Office business in your main one anyway: supabase/v159-office.sql org_stamp.)
function businessHoldable() { return businessList().filter(b => b.role !== 'office'); }
function businessIsOffice(id) { return businessValidId(id) && businessList().some(b => b.id === id && b.role === 'office'); }
function businessNewJobChoices() {
  const list = businessHoldable();
  return list.length >= 2 ? list : [];
}

// A job made from a job (a retest copy, items moved to a new job) is the same
// business's — unless that's one where you're Office: then your main (2A).
function businessForCopy(id) {
  if (!businessValidId(id)) return '';
  return businessIsOffice(id) ? '' : id;
}

function businessLastUsed() {
  try { const v = localStorage.getItem(LAST_BUSINESS_KEY); return businessValidId(v) ? v : ''; } catch (e) { return ''; }
}

// The business the form starts on: the last used on this phone if still one of
// yours, else the default, else the first.
function businessForInitial() {
  const list = businessNewJobChoices();
  if (!list.length) return '';
  const last = businessLastUsed();
  if (last && list.some(b => b.id === last)) return last;
  const d = list.find(b => b.def);
  return d ? d.id : list[0].id;
}

function businessForHTML() {
  const list = businessNewJobChoices();
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
  const list = businessNewJobChoices();
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
  const old = businessLoad();
  const was = new Map(old.u === uid ? old.list.map(b => [b.id, b.oj]) : []);   // never another account's
  for (const r of rows) {
    if (!r || !businessValidId(r.id)) continue;
    list.push({ id: r.id, name: typeof r.name === 'string' ? r.name : '', role: r.role, def: r.is_default === true, n: r.members,
      oj: was.get(r.id) === true });   // V165: kept until the cloud says otherwise
  }
  businessSave({ u: uid, at: Date.now(), list });
  return businessLoad();
}

// V165 (1A): which of my businesses hold someone else's jobs — the cloud's yes
// or no per business I may read whole (rpc business_others_jobs; an Engineer
// gets no row). The Cloud tab offers such a business even with one member left
// (settings-actions.js cloudScopeChoices). A business with no row is a no. A
// project without the V165 SQL, or a failed read, changes nothing.
function businessOthersApply(uid, rows) {
  if (!Array.isArray(rows)) return false;
  const rec = businessLoad();
  if (!uid || rec.u !== uid) return false;
  const yes = new Set(rows.filter(r => r && businessValidId(r.business_id) && r.others === true).map(r => r.business_id));
  let changed = false;
  for (const b of rec.list) {
    const v = yes.has(b.id);
    if (b.oj !== v) { b.oj = v; changed = true; }
  }
  if (changed) businessSave(rec);
  return changed;
}

function businessOthersRead(c, uid) {
  return Promise.resolve(c.rpc('business_others_jobs')).then((res) => {
    if (!res || res.error) return false;
    const changed = businessOthersApply(uid, res.data);
    if (changed && state.view === 'sessions' && state.jobsTab === 'cloud' && typeof render === 'function') render();
    return changed;
  });
}

function businessRead(c, uid) {
  return Promise.resolve()
    // V163: the businesses left FIRST — while the stored list still names the
    // old main business, whose unmarked jobs were that business's.
    .then(() => (typeof businessDeparturesRead === 'function' ? businessDeparturesRead(c, uid).catch(() => false) : false))
    .then(() => c.rpc('my_businesses'))
    .then((res) => {
      if (!res || res.error) throw (res && res.error) || new Error('no answer');
      const ok = !!businessFromRows(uid, res.data);
      if (ok) _bizReadOwed = false;
      // V150: the moves too — on their own, so a project without the V150 SQL
      // (or a failed read) never stops the list. V155: and the invites to me.
      return businessMovesRead(c, uid).then(() => ok, () => ok)
        .then(() => businessMyInvitesRead(c, uid).then(() => ok, () => ok))
        .then(() => businessWaitingRead(c, uid).then(() => ok, () => ok))   // V157 (1A): moves for me to decide
        .then(() => businessOthersRead(c, uid).then(() => ok, () => ok));    // V165 (1A): others' jobs held
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

function businessReadOwe() { _bizReadOwed = true; _bizDepOwed = true; }   // V163: the departures too

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
    .then((c) => businessRead(c, uid)
      .then((ok) => businessTeamRead(c, uid).then(() => ok, () => ok)))   // V155: the people and invites
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

// V159 (3A of the round): what someone who's Office in a business is told on its card.
function businessOfficeLine() {
  const d = businessHoldable().find(b => b.def) || businessHoldable().find(b => b.role === 'owner');
  return `As Office you see and approve here. Jobs you test go to ${d ? businessLabel(d) : 'your own business'}.`;
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
        ${x.role === 'office' ? `<p class="muted" id="biz-office-${i}">${escapeHTML(businessOfficeLine())}</p>` : ''}
        ${!x.def && x.role !== 'office' ? `<button class="backup-action-btn" id="biz-main-${i}" data-action="biz-main" data-arg="${escapeHTML(x.id)}" style="margin-top:8px">Make this my main business</button>` : ''}
        ${businessWaitingHTML(x, i)}
        ${businessPeopleHTML(x, i)}
        ${x.role !== 'owner' ? `<button class="link-btn biz-leave" id="biz-leave-${i}" data-action="biz-leave" data-arg="${escapeHTML(x.id)}" style="margin-top:10px">Leave ${escapeHTML(businessLabel(x))}</button>` : ''}
      </div>`;
    }).join('');
    body = `
      ${status ? `<p class="muted cloud-msg" id="biz-status" role="status">${escapeHTML(status)}</p>` : ''}
      ${businessMyInvitesHTML()}
      ${cards || (b.reading ? '' : '<div class="info-card"><p class="muted" id="biz-none">Nothing read yet.</p></div>')}
      <button class="backup-action-btn" id="biz-refresh" data-action="biz-refresh" ${b.reading ? 'disabled' : ''} style="margin-top:4px">Check again</button>`;
  }
  return `
    <div class="screen" id="cloud-business-page">
      ${renderSettingsSubHeader('Business')}
      <div class="info-card">
        <p class="muted" id="biz-intro">Every job belongs to a business. Most people have one — their own. Invite people to work in yours; if you work for more than one, New job asks which business each job is for.</p>
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
      by: typeof m.by === 'string' ? m.by.slice(0, 60) : '',                          // V157 (4A): who decided
      tell: m.tell === true && (m.st === 'moved' || m.st === 'refused'),             // V157 (4A): not yet told
    });
  }
  return out;
}

function businessMovesSave(rec) {
  try { localStorage.setItem(JOB_MOVES_KEY, JSON.stringify(rec)); return true; } catch (e) { return false; }
}

// Rows from my_job_moves (one per job, the latest) → the stored shape.
// V157 (4A): a request this phone last knew as WAITING that comes back moved or
// refused is to be told once on the Jobs list (tell) — carried until OK. Only
// this account's previous record counts (another account's waits say nothing).
function businessMovesFromRows(uid, rows) {
  if (!Array.isArray(rows)) return null;
  const prev = businessMovesLoad();
  const was = new Map(prev.u === uid ? prev.list.map(m => [m.id, m]) : []);
  const list = [];
  for (const r of rows) {
    if (!r || !businessValidId(r.id) || typeof r.session_id !== 'string') continue;
    const before = was.get(r.id);
    const decided = r.status === 'moved' || r.status === 'refused';
    list.push({ id: r.id, job: r.session_id, from: r.from_org, to: r.to_org, st: r.status,
      fromName: typeof r.from_name === 'string' ? r.from_name : '',
      toName: typeof r.to_name === 'string' ? r.to_name : '',
      at: typeof (r.decided_at || r.requested_at) === 'string' ? (r.decided_at || r.requested_at) : '',
      by: typeof r.decided_name === 'string' ? r.decided_name : '',
      tell: !!(decided && before && (before.st === 'waiting' || (before.tell && before.st === r.status))) });
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
  const by = m.by ? ` by ${m.by}` : '';   // V157 (4A): who decided, when someone else did
  if (m.st === 'moved') return `Moved from ${_bizNameFor(m.from, m.fromName)} to ${_bizNameFor(m.to, m.toName)}${m.by ? ' · approved' + by : ''}${day ? ' · ' + day : ''}`;
  if (m.st === 'refused') return `Move to ${_bizNameFor(m.to, m.toName)} refused${by}${day ? ' · ' + day : ''}`;
  return '';   // cancelled / dropped: nothing to tell
}

// Shown for someone in two or more businesses, or for a job with a move on
// record. Nothing at all for everyone else (solo users: Job settings as before).
function businessJobCardHTML(sess) {
  if (!sess) return '';
  // V163: a job of a business you've left — said, and nothing offered.
  const left = (typeof businessJobLeftLine === 'function') ? businessJobLeftLine(sess) : '';
  if (left) {
    return `
      <div class="card biz-job-card" id="ef-biz-card">
        <label class="label">Business</label>
        <p class="muted biz-job-line" id="ef-biz-left">${escapeHTML(left)}</p>
      </div>`;
  }
  const several = businessChoices().length >= 2;
  const m = businessMoveFor(sess.id);
  if (!several && !m) return '';
  const cur = businessOfJob(sess);
  const canMove = businessMoveTargets(cur).length > 0;   // V159: never into an Office business
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
          : (several && canMove ? `<button class="btn-secondary" id="ef-biz-change" data-action="biz-move-open">Change…</button>` : '')}
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
  if (typeof businessJobLeftLine === 'function' && businessJobLeftLine(sess)) return businessJobLeftLine(sess);   // V163
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

// V159: where a job can be moved — your businesses but the one it's in and any
// where you're Office (the database refuses those: patgo_move_office).
function businessMoveTargets(curId) { return businessHoldable().filter(b => b.id !== curId); }

function businessMovePick(id) {
  const m = state.bizMove;
  const sess = _bizMoveJob();
  if (!m || !sess || m.step !== 'pick') return false;
  if (!businessMoveTargets(businessOfJob(sess)).some(b => b.id === id)) return false;
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
  if (msg.indexOf('patgo_move_office') !== -1) return 'You’re Office in that business, so your jobs can’t go there.';   // V159
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
  const rows = businessMoveTargets(curId).map((b) => `
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

// ============================================================================
// V155 — invites, roles and the people in a business
// ============================================================================
// Locked 11 Nov (Peter): 1A an invite goes to an email address and waits there
// until that address signs in; Share sends a ready-written message · 2A Owner
// offers Team leader / Engineer / Office, Team leader and Office offer Engineer
// only, only the Owner changes a role · 3A refused while a phone in the business
// (or one of the joiner's) is below the minimum app version — the database
// decides, the phone puts it into words · 4A joining moves nothing; "make it my
// main business?" is asked at Join, Make main later · 5A 14 days, one waiting
// per address · 6A everyone sees names and roles, only Owner / Team leader /
// Office see addresses and invites · names typed at invite, each person changes
// their own. supabase/v155-invites.sql holds every rule.
//
// Nothing here is stored on the phone: invites and people are read on every
// start / return (my invites — the Jobs list line) and on every open of the
// Business page (people and the business's invites). Each read is the
// signed-in account's (u), so a sign-out or a takeover shows nothing stale.
// ⚠ A project without the V155 SQL answers "no such function": every read here
// fails soft and the page shows what it did before V155.

const BUSINESS_OFFER = { owner: ['engineer', 'team_leader', 'office'], team_leader: ['engineer'], office: ['engineer'] };
const BUSINESS_ROLE_ABOUT = {
  engineer: 'Engineer — logs their own jobs',
  team_leader: 'Team leader — logs jobs and sees the whole team’s',
  office: 'Office — sees the whole team’s jobs, doesn’t log',
};
const BUSINESS_INVITE_WORDS = { waiting: 'Waiting', joined: 'Joined', declined: 'Declined', cancelled: 'Cancelled', expired: 'Expired' };
const _BIZ_EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const BUSINESS_INVITE_DAYS = 14;   // supabase/v155-invites.sql: expires_at default — said in the words

let _bizMine = { u: '', list: [] };                // invites to me
let _bizTeam = { u: '', people: [], invites: [] }; // the Business page

function _bizUid() { return typeof cloudUserId === 'function' ? (cloudUserId() || '') : ''; }
function _bizStr(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }

// Rows from my_invites → the list. A bad row is dropped.
function businessMyInvitesFromRows(uid, rows) {
  const list = [];
  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (!r || !businessValidId(r.id) || !businessValidId(r.business_id) || !BUSINESS_OFFER.owner.includes(r.role)) continue;
    list.push({ id: r.id, org: r.business_id, orgName: _bizStr(r.business_name, 80), role: r.role, by: _bizStr(r.invited_by_name, 60), until: _bizStr(r.expires_at, 40) });
  }
  _bizMine = { u: uid, list };
  return list;
}

function businessMyInvites() {
  const uid = _bizUid();
  return uid && _bizMine.u === uid ? _bizMine.list : [];
}

function businessMyInvitesRead(c, uid) {
  return Promise.resolve()
    .then(() => c.rpc('my_invites'))
    .then((res) => {
      if (!res || res.error) throw (res && res.error) || new Error('no answer');
      const was = businessMyInvites().map(v => v.id).join(',');
      businessMyInvitesFromRows(uid, res.data);
      if (businessMyInvites().map(v => v.id).join(',') !== was) _bizJobsRepaint();
      return true;
    });
}

// The Jobs list line appears (or goes) when the read finishes — never under a
// sheet or the cursor (MAP rules 2/3; the new job form has boxes).
function _bizJobsRepaint() {
  if (state.view !== 'sessions') return;
  try {
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return;
    if (document.querySelector('body > .bulk-sheet, body > .fail-sheet, body > .modal-backdrop')) return;
  } catch (e) { /* no DOM to inspect */ }
  render();
}

// Rows from business_people / business_invites → the page's record.
function businessTeamFromRows(uid, people, invites) {
  const p = [], v = [];
  for (const r of (Array.isArray(people) ? people : [])) {
    if (!r || !businessValidId(r.business_id) || !businessValidId(r.user_id) || !BUSINESS_ROLE_WORDS[r.role]) continue;
    p.push({ org: r.business_id, user: r.user_id, name: _bizStr(r.name, 60), role: r.role, you: r.is_you === true, email: _bizStr(r.email, 254) });
  }
  for (const r of (Array.isArray(invites) ? invites : [])) {
    if (!r || !businessValidId(r.id) || !businessValidId(r.business_id) || !BUSINESS_OFFER.owner.includes(r.role) || !BUSINESS_INVITE_WORDS[r.status]) continue;
    v.push({ id: r.id, org: r.business_id, email: _bizStr(r.email, 254), name: _bizStr(r.name, 60), role: r.role, st: r.status,
      until: _bizStr(r.expires_at, 40), at: _bizStr(r.decided_at, 40), cancel: r.can_cancel === true });
  }
  _bizTeam = { u: uid, people: p, invites: v };
  return _bizTeam;
}

function businessTeam() {
  const uid = _bizUid();
  return uid && _bizTeam.u === uid ? _bizTeam : { u: '', people: [], invites: [] };
}

// Both reads on their own: an Engineer's business_invites is simply empty, and
// a project without the V155 SQL leaves the page as V154 drew it.
function businessTeamRead(c, uid) {
  const one = (name) => Promise.resolve().then(() => c.rpc(name))
    .then((res) => (res && !res.error && Array.isArray(res.data)) ? res.data : null, () => null);
  return Promise.all([one('business_people'), one('business_invites')]).then(([people, invites]) => {
    if (people === null && invites === null) return false;
    businessTeamFromRows(uid, people || [], invites || []);
    return true;
  });
}

function businessMayInvite(b) { return !!(b && BUSINESS_OFFER[b.role]); }

function _bizOrg(id) { return businessList().find(x => x.id === id) || null; }

// The cloud's refusals in plain words.
function businessTeamError(err) {
  const t = [err && err.message, err && err.hint, err && err.details].map(x => String(x || '')).join(' ');
  if (/patgo_signed_out/.test(t)) return CLOUD_SIGNED_OUT_ELSEWHERE_WORDS;   // V161: cloud.js signs this phone out
  if (/patgo_phones_behind/.test(t)) return 'A phone in this business has an older PATGo. Everyone in the business needs to open PATGo with a signal so it updates — then try again.';
  if (/patgo_team_phones_behind/.test(t)) return 'A phone in that business has an older PATGo, so you can’t join just yet. Ask them to open PATGo with a signal so it updates, then tap Join again. Your invite is still waiting.';   // V160
  if (/patgo_your_phones_behind/.test(t)) return 'A phone you’ve signed in on has an older PATGo, or hasn’t synced since you signed in. Open PATGo on each of your phones with a signal so it updates, wait a minute, then tap Join again.';
  if (/patgo_invite_member/.test(t)) return 'They’re already in this business.';
  if (/patgo_invite_waiting/.test(t)) return 'They already have an invite waiting — share it again, or cancel it first.';
  if (/patgo_invite_many/.test(t)) return 'This business has 50 invites waiting — cancel some first.';
  if (/patgo_invite_email/.test(t)) return 'That doesn’t look like an email address.';
  if (/patgo_invite_name/.test(t)) return 'Add a name — up to 60 letters.';
  if (/patgo_invite_gone/.test(t)) return 'This invite has ended — it was cancelled, answered or is more than 14 days old. Ask for a new one.';
  if (/patgo_main_office/.test(t)) return 'You’re Office in that business, so it can’t be your main one — your jobs go to a business you test for.';   // V159
  if (/patgo_member_gone/.test(t)) return 'They’re not in this business any more.';                      // V163
  if (/patgo_owner_leave/.test(t)) return 'You own this business, so you can’t leave it.';                   // V163
  if (/patgo_not_allowed/.test(t)) return 'That isn’t something your role in this business can do.';
  if (/patgo_move_stale/.test(t)) return businessStaleWords(err);                                  // V157
  if (/patgo_move_self/.test(t)) return 'You asked for this move — someone else in the business has to decide it.';
  if (/patgo_move_role/.test(t)) return 'Only the Owner, a Team leader or the Office can decide this.';
  return 'That didn’t go through — try again with a signal.';
}

// One cloud step from a tap: signal and sign-in first, then the rpc, then the
// page read again. Resolves the rpc's data, or null (already said why).
function _bizCall(name, args, needSignal) {
  if (_bizOffline()) { showToast(needSignal || 'You need a signal for that.'); return Promise.resolve(null); }
  const uid = _bizUid();
  if (!uid) { showToast('Sign in first.'); return Promise.resolve(null); }
  return _bizClient()
    .then((c) => c.rpc(name, args).then((res) => {
      if (!res || res.error) throw (res && res.error) || new Error('no answer');
      return res.data === undefined ? true : (res.data === null ? true : res.data);
    }))
    .catch((e) => {
      // V160 (2A): Join refused for the business's phones — the business named,
      // never its devices or people (the joiner isn't in it yet). Invite waits.
      if (name === 'accept_invite' && _bizTeamBehind(e)) {
        openInfoSheet({ title: 'Not joined yet', message: businessJoinTeamBehindWords(args && args.i) });
        return null;
      }
      // V156 (2A): an older device holding it up — name it, with Sign it out.
      if (_bizHeldUp(e) && typeof businessHeldUp === 'function') {
        return businessHeldUp(e, name === 'invite_member' && args ? args.o : '').then(() => null, () => null);
      }
      openInfoSheet({ title: 'Not done', message: businessTeamError(e) });
      return null;
    });
}

// After a change: the businesses, my invites and the page, read again.
function businessAfterChange() {
  const uid = _bizUid();
  if (!uid) return Promise.resolve(false);
  return _bizClient()
    .then((c) => businessRead(c, uid).catch(() => false)
      .then(() => businessTeamRead(c, uid)))
    .catch(() => false)
    .then((ok) => { _bizRepaint(); try { if (state.view === 'sessions') render(); } catch (e) { /* next paint */ } return ok; });
}

// ---- inviting (1A 2A 5A) ------------------------------------------------------
function businessInviteStart(orgId) {
  const b = _bizOrg(orgId);
  if (!businessMayInvite(b)) return false;
  const roles = BUSINESS_OFFER[b.role];
  if (roles.length === 1) { _bizInviteName(orgId, roles[0], ''); return true; }
  openChoiceSheet({
    title: 'Invite someone',
    message: `What will they do in ${businessLabel(b)}?`,
    choices: roles.map((r) => ({ label: BUSINESS_ROLE_ABOUT[r], style: r === 'engineer' ? 'primary' : 'secondary', onPick: () => _bizInviteName(orgId, r, '') })),
  });
  return true;
}

function _bizInviteName(orgId, role, value) {
  openNameSheet({
    title: 'Their name',
    blurb: `Shown to everyone in the business. Invited as ${BUSINESS_ROLE_WORDS[role]}.`,
    value, placeholder: 'e.g. Dave Smith', confirmLabel: 'Next', maxlength: 60,
    onConfirm: (v) => _bizInviteEmail(orgId, role, v, ''),
  });
}

function _bizInviteEmail(orgId, role, name, value) {
  openNameSheet({
    title: 'Their email address',
    blurb: `${name} joins by signing in to PATGo with this exact address. The invite waits ${BUSINESS_INVITE_DAYS} days.`,
    value, placeholder: 'name@example.co.uk', confirmLabel: 'Send invite', maxlength: 254, inputType: 'email',
    onConfirm: (v) => {
      const e = String(v).trim().toLowerCase();
      if (!_BIZ_EMAIL_RE.test(e)) { showToast('That doesn’t look like an email address.'); _bizInviteEmail(orgId, role, name, v); return; }
      businessInviteSend(orgId, role, name, e);
    },
  });
}

function businessInviteSend(orgId, role, name, email) {
  return _bizCall('invite_member', { o: orgId, e: email, n: name, r: role }, 'You need a signal to send an invite.')
    .then((id) => {
      if (id === null) return false;
      const b = _bizOrg(orgId);
      openChoiceSheet({
        title: 'Invite sent',
        message: `${name} can join ${businessLabel(b)} by signing in to PATGo with ${email}. Let them know — the invite waits ${BUSINESS_INVITE_DAYS} days.`,
        choices: [{ label: 'Share the invite', style: 'primary', onPick: () => businessInviteShare({ org: orgId, email, role }) }],
        cancelLabel: 'Done',
      });
      businessAfterChange();
      return true;
    });
}

// The message Share sends (1A): who, as what, where to go, which address.
function businessInviteText(inv) {
  const b = _bizOrg(inv.org);
  let url = '';
  try { url = String(location.href).split('#')[0].split('?')[0]; } catch (e) { url = ''; }
  return `${b ? businessLabel(b) : 'A business'} has invited you to join them on PATGo as ${BUSINESS_ROLE_WORDS[inv.role] || 'a member'}. `
    + `Open PATGo${url ? ' (' + url + ')' : ''} and sign in with ${inv.email} — the invite waits on the Business page for ${BUSINESS_INVITE_DAYS} days.`;
}

function businessInviteShare(inv) {
  if (!inv) return false;
  const text = businessInviteText(inv);
  try {
    if (navigator.share) {
      navigator.share({ title: 'PATGo invite', text }).catch(() => { /* closed — nothing to say */ });
      return true;
    }
  } catch (e) { /* fall through to copying */ }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => showToast('Invite copied — paste it into a message.'),
        () => openInfoSheet({ title: 'Send them this', message: text }));
      return true;
    }
  } catch (e) { /* the sheet below */ }
  openInfoSheet({ title: 'Send them this', message: text });
  return true;
}

function businessInviteShareId(id) {
  return businessInviteShare(businessTeam().invites.find(v => v.id === id) || null);
}

function businessInviteCancel(id) {
  const v = businessTeam().invites.find(x => x.id === id);
  if (!v || !v.cancel) return false;
  openConfirmSheet({
    title: 'Cancel this invite?',
    message: `${v.name} (${v.email}) won’t be able to join with it. You can invite them again later.`,
    confirmLabel: 'Cancel invite', cancelLabel: 'Keep it',
    onConfirm: () => { _bizCall('cancel_invite', { i: id }).then((r) => { if (r !== null) { showToast('Invite cancelled'); businessAfterChange(); } }); },
  });
  return true;
}

// ---- answering (1A 3A 4A) -----------------------------------------------------
function _bizInviteOrgLabel(v) { return v.orgName ? v.orgName : 'A PATGo business'; }

function businessJoinStart(id) {
  const v = businessMyInvites().find(x => x.id === id);
  if (!v) return false;
  const org = _bizInviteOrgLabel(v);
  if (v.role === 'office') {
    // V159: Office never holds a job, so there's no "make it main" to ask.
    openConfirmSheet({
      title: `Join ${org}?`,
      message: `You’ll join as Office: you see and approve their jobs. Your own jobs and your main business stay as they are.`,
      confirmLabel: 'Join', cancelLabel: 'Not now', danger: false,
      onConfirm: () => { businessJoin(id, false); },
    });
    return true;
  }
  openChoiceSheet({
    title: `Join ${org}?`,
    message: `Make ${org} your main business? Choose Yes if you work for them: new jobs go to ${org} unless you choose another. `
      + `Choose No if you run your own PATGo business and only do some work for them. Your own jobs stay where they are either way, and you can change this later.`,
    choices: [
      { label: 'Yes — make it my main business', style: 'primary', onPick: () => businessJoin(id, true) },
      { label: 'No — keep my own as main', style: 'secondary', onPick: () => businessJoin(id, false) },
    ],
  });
  return true;
}

// V160 (1A 2A): the database checks the joiner's own phones first (the V156
// sheet), then every phone in the business — this refusal. Said with the
// business's name only; the invite stays waiting, so Join can be tapped again.
function _bizTeamBehind(err) {
  const t = [err && err.message, err && err.hint, err && err.details].map(x => String(x || '')).join(' ');
  return /patgo_team_phones_behind/.test(t);
}

function businessJoinTeamBehindWords(id) {
  const v = businessMyInvites().find(x => x.id === id);
  const org = v && v.orgName ? v.orgName : 'that business';
  return `A phone in ${org} has an older PATGo, so you can’t join just yet. `
    + 'Ask them to open PATGo with a signal so it updates, then tap Join again. Your invite is still waiting.';
}

function businessJoin(id, main) {
  const v = businessMyInvites().find(x => x.id === id);
  return _bizCall('accept_invite', { i: id, make_main: main === true }, 'You need a signal to join.')
    .then((r) => {
      if (r === null) return false;
      showToast(`You’ve joined ${v ? _bizInviteOrgLabel(v) : 'the business'}`);
      return businessAfterChange().then(() => true);
    });
}

function businessDecline(id) {
  const v = businessMyInvites().find(x => x.id === id);
  if (!v) return false;
  openConfirmSheet({
    title: 'Decline this invite?',
    message: `You won’t join ${_bizInviteOrgLabel(v)}. They can invite you again if you change your mind.`,
    confirmLabel: 'Decline', cancelLabel: 'Not now',
    onConfirm: () => { _bizCall('decline_invite', { i: id }).then((r) => { if (r !== null) { showToast('Invite declined'); businessAfterChange(); } }); },
  });
  return true;
}

// ---- roles, names, main (2A, names, 4A) ---------------------------------------
function businessRoleStart(arg) {
  const [orgId, user] = String(arg || '').split(':');
  const b = _bizOrg(orgId);
  const p = businessTeam().people.find(x => x.org === orgId && x.user === user);
  if (!b || b.role !== 'owner' || !p || p.you || p.role === 'owner') return false;
  openChoiceSheet({
    title: `${p.name || 'Their'} role`,
    message: `Now: ${BUSINESS_ROLE_WORDS[p.role]}. Choose their new role in ${businessLabel(b)}.`,
    choices: BUSINESS_OFFER.owner.filter(r => r !== p.role).map((r) => ({ label: BUSINESS_ROLE_ABOUT[r], style: 'secondary',
      onPick: () => (r === 'office' ? businessRoleOfficeAsk(orgId, user, p.name) : businessRoleSet(orgId, user, r)) })),
  });
  return true;
}

function businessRoleSet(orgId, user, r) {
  return _bizCall('set_member_role', { o: orgId, u: user, r }).then((x) => { if (x !== null) { showToast('Role changed'); businessAfterChange(); } });
}

// V159 (4A): Office never holds a job — said before the change.
function businessRoleOfficeAsk(orgId, user, name) {
  openConfirmSheet({
    title: `Make ${name || 'them'} Office?`,
    message: 'They can finish jobs they’ve already started here. New jobs go to their own business.',
    confirmLabel: 'Make Office', cancelLabel: 'Cancel', danger: false,
    onConfirm: () => { businessRoleSet(orgId, user, 'office'); },
  });
  return true;
}

function businessMyNameStart(orgId) {
  const p = businessTeam().people.find(x => x.org === orgId && x.you);
  if (!p) return false;
  openNameSheet({
    title: 'Your name', blurb: 'How everyone in this business sees you.', value: p.name, placeholder: 'e.g. Peter Birchley',
    confirmLabel: 'Save', maxlength: 60,
    onConfirm: (v) => { _bizCall('set_my_member_name', { o: orgId, n: v }).then((x) => { if (x !== null) { showToast('Name saved'); businessAfterChange(); } }); },
  });
  return true;
}

function businessMakeMain(orgId) {
  const b = _bizOrg(orgId);
  if (!b || b.def || b.role === 'office') return false;   // V159: never an Office business
  openConfirmSheet({
    title: `Make ${businessLabel(b)} your main business?`,
    message: 'New jobs go there unless you choose another on New job. Nothing already made moves.',
    confirmLabel: 'Make main', cancelLabel: 'Cancel', danger: false,
    onConfirm: () => { _bizCall('set_main_business', { o: orgId }).then((x) => { if (x !== null) { showToast('Main business changed'); businessAfterChange(); } }); },
  });
  return true;
}

// ---- on screen ----------------------------------------------------------------
function _bizUntil(iso) { const ms = Date.parse(String(iso || '').replace(/(\.\d{3})\d+/, '$1')); return isFinite(ms) ? _bizDay(ms) : ''; }

// The Jobs list line (1A): an invite waiting for me.
function businessInviteBannerHTML() {
  const list = businessMyInvites();
  if (!list.length) return '';
  const text = list.length === 1
    ? `${_bizInviteOrgLabel(list[0])} has invited you to join them on PATGo as ${BUSINESS_ROLE_WORDS[list[0].role]}.`
    : `You have ${list.length} invites to join a business on PATGo.`;
  return `
    <div class="backup-banner plan-banner" id="invite-banner" role="status">
      <div class="backup-banner-body">
        <div class="backup-banner-text" id="invite-banner-text">${escapeHTML(text)}</div>
        <div class="backup-banner-actions">
          <button class="backup-banner-action primary" id="invite-banner-open" data-action="settings-page" data-arg="cloudBusiness">See invite</button>
        </div>
      </div>
    </div>
  `;
}

// The Business page's invites to me.
function businessMyInvitesHTML() {
  return businessMyInvites().map((v, i) => `
      <div class="info-card biz-invite" id="biz-invite-${i}">
        <h3 id="biz-invite-title-${i}">${escapeHTML(_bizInviteOrgLabel(v))} has invited you</h3>
        <p class="muted" id="biz-invite-role-${i}">To join as ${escapeHTML(BUSINESS_ROLE_WORDS[v.role])}${v.by ? ' · from ' + escapeHTML(v.by) : ''}${_bizUntil(v.until) ? ' · until ' + escapeHTML(_bizUntil(v.until)) : ''}</p>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn-primary" id="biz-join-${i}" data-action="biz-join" data-arg="${escapeHTML(v.id)}" style="flex:1">Join</button>
          <button class="btn-secondary" id="biz-decline-${i}" data-action="biz-decline" data-arg="${escapeHTML(v.id)}" style="flex:1">Decline</button>
        </div>
      </div>`).join('');
}

// One business's people and invites (6A), inside its card.
function businessPeopleHTML(b, i) {
  const team = businessTeam();
  const people = team.people.filter(p => p.org === b.id);
  const invites = team.invites.filter(v => v.org === b.id);
  const invite = businessMayInvite(b);
  if (!people.length && !invite) return '';
  const rows = people.map((p, k) => {
    const nm = p.name || (p.you ? 'You — add your name' : 'No name yet');
    const btn = p.you
      ? `<button class="link-btn" id="biz-myname-${i}" data-action="biz-myname" data-arg="${escapeHTML(b.id)}">${p.name ? 'Change your name' : 'Add your name'}</button>`
      : (b.role === 'owner' && p.role !== 'owner'
        ? `<button class="link-btn" id="biz-role-${i}-${k}" data-action="biz-role" data-arg="${escapeHTML(b.id + ':' + p.user)}">Change role</button>` : '')
        // V163 (1A): whoever may invite their role may remove them.
        + (typeof businessMayRemove === 'function' && businessMayRemove(b, p)
          ? ` <button class="link-btn" id="biz-remove-${i}-${k}" data-action="biz-remove" data-arg="${escapeHTML(b.id + ':' + p.user)}">Remove</button>` : '');
    return `
          <li class="biz-person" id="biz-person-${i}-${k}">
            <span class="biz-person-name">${escapeHTML(nm)}${p.you && p.name ? ' (you)' : ''}</span>
            <span class="muted"> · ${escapeHTML(BUSINESS_ROLE_WORDS[p.role])}</span>
            ${p.email ? `<div class="muted biz-person-email">${escapeHTML(p.email)}</div>` : ''}
            ${btn}
          </li>`;
  }).join('');
  const inv = invites.map((v, k) => {
    const when = v.st === 'waiting' ? (_bizUntil(v.until) ? ' until ' + _bizUntil(v.until) : '') : (_bizUntil(v.at) ? ' · ' + _bizUntil(v.at) : '');
    const acts = v.st === 'waiting' && v.cancel ? `
            <button class="link-btn" id="biz-inv-share-${i}-${k}" data-action="biz-invite-share" data-arg="${escapeHTML(v.id)}">Share</button>
            <button class="link-btn" id="biz-inv-cancel-${i}-${k}" data-action="biz-invite-cancel" data-arg="${escapeHTML(v.id)}">Cancel invite</button>` : '';
    return `
          <li class="biz-person" id="biz-inv-${i}-${k}">
            <span class="biz-person-name">${escapeHTML(v.name)}</span><span class="muted"> · ${escapeHTML(BUSINESS_ROLE_WORDS[v.role])}</span>
            <div class="muted biz-person-email">${escapeHTML(v.email)} · ${escapeHTML(BUSINESS_INVITE_WORDS[v.st] + when)}</div>
            ${acts}
          </li>`;
  }).join('');
  return `
        <h4 class="biz-sub" id="biz-people-head-${i}">People</h4>
        ${rows ? `<ul class="biz-people" id="biz-people-${i}">${rows}</ul>` : ''}
        ${inv ? `<h4 class="biz-sub" id="biz-invites-head-${i}">Invites</h4><ul class="biz-people" id="biz-invites-${i}">${inv}</ul>` : ''}
        ${invite ? `<button class="backup-action-btn" id="biz-invite-${i}" data-action="biz-invite" data-arg="${escapeHTML(b.id)}" style="margin-top:8px">Invite someone</button>` : ''}`;
}

// ============================================================================
// V156 — devices that hold up invites (Teams v1)
// ============================================================================
// Locked 11 Nov (Peter, "defaults"; found running v155-invites.sql: his own
// second device, last used 6 Nov on V150 and still signed in, blocked every
// invite): 1A only devices STILL SIGNED IN count (the database's own list,
// supabase/v156-devices.sql _signed_in_devices) · 2A a refused invite or Join
// names the devices holding it up — your own with Sign it out, a teammate's
// named only · 3A Account → Your devices: every device signed in, Sign it out.
// Signing out only ever on a tap, never the device you're using (that's the
// Account page's own Sign out). Nothing stored on the phone: memory only, read
// on every open of Your devices and at each refusal.
//
// ⚠ Your devices reads with cloudClient(), NOT _bizClient(): it is account-level
// like signing in, so a phone below the minimum version can still sign an old
// device out (R61: sign-in, the plan and paying still work below the minimum).

const BUSINESS_DEVICE_KINDS = {   // supabase/v156-devices.sql _device_kind — same words
  iPhone: 'iPhone', iPad: 'iPad', 'Android phone': 'Android phone', Mac: 'Mac',
  'Windows computer': 'Windows computer', Computer: 'computer', Device: 'device',
};
const _BIZ_VERSION_RE = /^V\d{1,6}(\.\d{1,3})?$/;

let _bizDev = { u: '', list: [], reading: false, error: '' };

// At the start of a line: "Computer", "Device" — but "iPhone", "iPad" as they are.
function _bizKindHead(kind) { return /^(computer|device)$/.test(kind) ? kind.charAt(0).toUpperCase() + kind.slice(1) : kind; }

function _bizDevClient() { return cloudClient(); }

// Rows from my_devices / business_devices_behind → one shape. A bad row is dropped.
function businessDevicesFromRows(rows) {
  const out = [];
  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (!r || typeof r !== 'object') continue;
    const sid = businessValidId(r.session_id) ? r.session_id : '';
    out.push({
      session: sid,
      kind: Object.prototype.hasOwnProperty.call(BUSINESS_DEVICE_KINDS, r.kind) ? r.kind : 'Device',
      version: typeof r.app_version === 'string' && _BIZ_VERSION_RE.test(r.app_version) ? r.app_version : '',
      used: _bizStr(r.last_used, 40),
      reported: r.reported === true,
      behind: r.behind === true,
      here: r.this_device === true,
      you: r.is_you !== false,           // my_devices has no is_you: all mine
      who: _bizStr(r.name, 254),
    });
  }
  return out;
}

function businessDevices() {
  const uid = _bizUid();
  return uid && _bizDev.u === uid ? _bizDev.list : [];
}

// "iPhone · V150 · last used 6 Nov" — the device in words. who: '' (mine, no
// owner words), 'your' or a teammate's name.
function businessDeviceWords(d, who) {
  const kind = BUSINESS_DEVICE_KINDS[d.kind] || 'device';
  const head = who === 'your' ? `Your ${kind}` : who ? `${who}’s ${kind}` : _bizKindHead(kind);
  const ver = d.reported ? (d.version || 'an older PATGo') : 'signed in, never synced';
  const day = _bizUntil(d.used);
  return `${head} · ${ver}${day ? ' · last used ' + day : ''}`;
}

// ---- Your devices (3A) ----------------------------------------------------------
function businessDevicesRefresh() {
  const uid = _bizUid();
  if (!uid || _bizDev.reading) return Promise.resolve(false);
  if (_bizDev.u !== uid) _bizDev = { u: uid, list: [], reading: false, error: '' };
  if (_bizOffline()) { _bizDev.error = 'offline'; _bizDevRepaint(); return Promise.resolve(false); }
  _bizDev.reading = true; _bizDev.error = '';
  _bizDevRepaint();
  return _bizDevClient()
    .then((c) => c.rpc('my_devices'))
    .then((res) => {
      if (!res || res.error || !Array.isArray(res.data)) throw (res && res.error) || new Error('no answer');
      if (_bizUid() === uid) _bizDev.list = businessDevicesFromRows(res.data);
      return true;
    })
    .catch(() => { _bizDev.error = 'read'; return false; })
    .then((ok) => { _bizDev.reading = false; _bizDevRepaint(); return ok; });
}

function _bizDevRepaint() {
  if (state.view !== 'cloudDevices') return;
  try { if (document.querySelector('body > .bulk-sheet, body > .modal-backdrop')) return; } catch (e) { /* no DOM */ }
  render();
}

// Sign it out (2A, 3A): asked first; never this device (the button isn't there,
// and the database refuses it anyway — patgo_this_device).
function businessDeviceSignOut(sessionId) {
  const d = businessDevices().find(x => x.session === sessionId) || _bizHeldMine.find(x => x.session === sessionId);
  if (!d || d.here || !businessValidId(sessionId)) return false;
  const kind = BUSINESS_DEVICE_KINDS[d.kind] || 'device';
  openConfirmSheet({
    title: `Sign out this ${kind}?`,
    message: `${businessDeviceWords(d, 'your')}. It’s signed out within the hour, and asks you to sign in next time it’s used. `
      + 'Everything on it stays on it — any jobs it hasn’t sent wait there until you sign in on it again.',
    confirmLabel: 'Sign it out', cancelLabel: 'Keep it',
    onConfirm: () => { businessDeviceSignOutGo(sessionId); },
  });
  return true;
}

function businessDeviceSignOutGo(sessionId) {
  if (_bizOffline()) { showToast('You need a signal to sign a device out.'); return Promise.resolve(false); }
  if (!_bizUid()) { showToast('Sign in first.'); return Promise.resolve(false); }
  return _bizDevClient()
    .then((c) => c.rpc('sign_out_device', { s: sessionId }))
    .then((res) => {
      if (!res || res.error) throw (res && res.error) || new Error('no answer');
      _bizHeldMine = _bizHeldMine.filter(x => x.session !== sessionId);
      showToast(res.data === false ? 'That device was already signed out' : 'Signed out — it no longer holds anything up');
      return true;
    })
    .catch((e) => {
      const t = [e && e.message, e && e.details].map(x => String(x || '')).join(' ');
      openInfoSheet({ title: 'Not done', message: /patgo_this_device/.test(t)
        ? 'That’s the device you’re using — sign out from the Account page instead.'
        : 'That didn’t go through — try again with a signal.' });
      return false;
    })
    .then((ok) => { if (state.view === 'cloudDevices') businessDevicesRefresh(); return ok; });
}

function renderCloudDevices() {
  const signedIn = !!(state.cloud && state.cloud.status === 'signed-in');
  let body;
  if (!signedIn) {
    body = `
      <div class="info-card">
        <p class="muted">Sign in to see your devices.</p>
        <button class="backup-action-btn" id="dev-account" data-action="settings-page" data-arg="cloudAccount" style="margin-top:8px">Account ›</button>
      </div>`;
  } else {
    const list = businessDevices();
    const status = _bizDev.reading ? 'Checking your devices…'
      : _bizDev.error === 'offline' ? 'No signal — connect to see your devices.'
      : _bizDev.error ? 'Couldn’t check just now — try again with a signal.' : '';
    const rows = list.map((d, i) => {
      const kind = BUSINESS_DEVICE_KINDS[d.kind] || 'device';
      const name = d.here ? `This ${kind} (the one you’re using)` : _bizKindHead(kind);
      const ver = d.reported ? (d.version ? `PATGo ${d.version}` : 'PATGo') : 'Signed in, never synced';
      const day = _bizUntil(d.used);
      const old = d.behind ? `<div class="dev-old" id="dev-old-${i}">${d.reported
        ? 'An older PATGo — holds up invites until it updates or is signed out.'
        : 'Hasn’t synced since it signed in — holds up invites until it does or is signed out.'}</div>` : '';
      const btn = d.here ? '' : `<button class="link-btn" id="dev-signout-${i}" data-action="dev-signout" data-arg="${escapeHTML(d.session)}">Sign it out</button>`;
      return `
          <li class="dev-row" id="dev-row-${i}">
            <div class="dev-name" id="dev-name-${i}">${escapeHTML(name)}</div>
            <div class="muted" id="dev-detail-${i}">${escapeHTML(ver)}${day ? ' · last used ' + escapeHTML(day) : ''}</div>
            ${old}
            ${btn}
          </li>`;
    }).join('');
    body = `
      ${status ? `<p class="muted cloud-msg" id="dev-status" role="status">${escapeHTML(status)}</p>` : ''}
      ${rows ? `<div class="info-card"><ul class="dev-list" id="dev-list">${rows}</ul></div>` : ''}
      <button class="backup-action-btn" id="dev-refresh" data-action="dev-refresh" ${_bizDev.reading ? 'disabled' : ''} style="margin-top:4px">Check again</button>`;
  }
  return `
    <div class="screen" id="cloud-devices-page">
      <header class="header-row">
        <button class="icon-btn" id="dev-back" data-action="settings-page" data-arg="cloudAccount" aria-label="Back">${icon('chevron-left')}</button>
        <div class="site-name" id="screen-title" role="heading" aria-level="1" tabindex="-1">Your devices</div>
        <span style="width:40px"></span>
      </header>
      <div class="info-card">
        <p class="muted" id="dev-intro">Every phone, tablet or computer signed in to your PATGo account. Sign out one you don’t use any more — an old one left signed in can hold up inviting people to a business.</p>
      </div>
      ${body}
    </div>
  `;
}

// ---- the refusal, naming the devices (2A) --------------------------------------
// _bizCall hands a phones-behind refusal here. orgId: the business an invite was
// for ('' = Join: my own devices). If the list can't be read, the V155 words.
let _bizHeldMine = [];   // my devices named on the open refusal sheet (Sign it out)

function _bizHeldUp(err) {
  const t = [err && err.message, err && err.hint, err && err.details].map(x => String(x || '')).join(' ');
  return /patgo_(your_)?phones_behind/.test(t);
}

function businessHeldUp(err, orgId) {
  const plain = () => openInfoSheet({ title: 'Not done', message: businessTeamError(err) });
  const read = orgId
    ? _bizClient().then((c) => c.rpc('business_devices_behind', { o: orgId }))
    : _bizDevClient().then((c) => c.rpc('my_devices'));
  return read
    .then((res) => {
      if (!res || res.error || !Array.isArray(res.data)) throw new Error('no list');
      const list = businessDevicesFromRows(res.data).filter(d => orgId ? true : d.behind);
      if (!list.length) { plain(); return false; }
      _bizHeldMine = list.filter(d => d.you && d.session && !d.here);
      const mineCount = list.filter(d => d.you).length;
      const theirs = list.length - mineCount;
      const message = orgId
        ? `Not sent yet: ${list.length === 1 ? 'a device' : list.length + ' devices'} in this business ${list.length === 1 ? 'has' : 'have'} an older PATGo signed in. `
          + (mineCount ? 'Open PATGo on yours with a signal so it updates, or sign it out if you don’t use it any more. ' : '')
          + (theirs ? 'Ask the others to open PATGo with a signal, or sign out a device they don’t use (Account → Your devices). ' : '')
          + 'Then try again.'
        : `Not joined yet: ${list.length === 1 ? 'a device' : list.length + ' devices'} signed in to your account ${list.length === 1 ? 'has' : 'have'} an older PATGo, or ${list.length === 1 ? 'hasn’t' : 'haven’t'} synced since signing in. `
          + 'Open PATGo on it with a signal so it updates, or sign it out if you don’t use it any more. Then tap Join again.';
      openChoiceSheet({
        title: 'Not done',
        message,
        lines: list.map(d => businessDeviceWords(d, d.you ? 'your' : (d.who || 'A teammate'))),
        choices: _bizHeldMine.slice(0, 4).map((d) => ({
          label: `Sign out your ${BUSINESS_DEVICE_KINDS[d.kind] || 'device'} (${d.reported ? (d.version || 'older') : 'never synced'})`,
          style: 'secondary',
          onPick: () => businessDeviceSignOut(d.session),
        })),
        cancelLabel: 'Close',
      });
      return true;
    })
    .catch(() => { plain(); return false; });
}

// ============================================================================
// V157 — the Approve / Refuse screen (Teams v1)
// ============================================================================
// Locked 11 Nov (Peter, R67 — 1A 2A 3A 4A 5A, the defaults):
//   1A the Business page: each business card where I'm Owner / Team leader /
//      Office has "Waiting for your approval"; the Jobs list says how many wait,
//      with See. Read on every start / return with the businesses (businessRead).
//   2A each request: who asked, the job (site / name), items, from → to, the day
//      asked; Approve / Refuse. No look inside the job (a later Teams release).
//   3A Refuse: asked first, no reason.
//   4A the asker: Job settings names who decided (businessMoveLine), and the
//      Jobs list says once that a waiting request was decided (tell, OK).
//   5A nothing expires.
// Claude's calls: every approver sees the same list and the first decision wins
// — a later tap hears how it ended and who (supabase/v157-approvals.sql gives it
// in the error's detail) and the list is read again; never your own request
// (the database lists none and refuses it); approval answered 'dropped' → "the
// job was finished first"; deciding needs a signal and goes through _bizClient
// (the V151 / V153 minimum-version gate), like every other cloud action.
// Memory only (_bizWait): the list is the cloud's, read again each start.

let _bizWait = { u: '', list: [] };

// Rows from business_waiting_moves → the phone's shape; bad values made safe.
function businessWaitingFromRows(uid, rows) {
  const list = [];
  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (!r || !businessValidId(r.id) || !businessValidId(r.business_id) || !businessValidId(r.to_org)) continue;
    const items = Number(r.items);
    list.push({ id: r.id, org: r.business_id, to: r.to_org,
      fromName: _bizStr(r.from_name, 80), toName: _bizStr(r.to_name, 80),
      who: _bizStr(r.asker, 60), job: _bizStr(r.job, 120),
      items: Number.isInteger(items) && items >= 0 && items < 100000 ? items : 0,
      at: _bizStr(r.requested_at, 40) });
  }
  _bizWait = { u: uid, list };
  return _bizWait;
}

function businessWaiting() {
  const uid = _bizUid();
  return uid && _bizWait.u === uid ? _bizWait.list : [];
}

// A failed read keeps what was known (a project without the V157 SQL: nothing).
function businessWaitingRead(c, uid) {
  return Promise.resolve()
    .then(() => c.rpc('business_waiting_moves'))
    .then((res) => {
      if (!res || res.error || !Array.isArray(res.data)) throw (res && res.error) || new Error('no answer');
      const was = businessWaiting().map(w => w.id).join(',');
      businessWaitingFromRows(uid, res.data);
      if (businessWaiting().map(w => w.id).join(',') !== was) { _bizJobsRepaint(); _bizRepaint(); }
      return true;
    });
}

function _bizWaitDay(iso) { const ms = Date.parse(String(iso || '').replace(/(\.\d{3})\d+/, '$1')); return isFinite(ms) ? _bizDay(ms) : ''; }
function _bizWaitJob(w) { return w.job ? `“${w.job}”` : 'a job'; }

// What a request says (2A): "Dave Smith wants to move “Tesco – Lincoln” to Smith Electrical".
function businessWaitingWords(w) {
  return `${w.who || 'Someone'} wants to move ${_bizWaitJob(w)} to ${_bizNameFor(w.to, w.toName)}`;
}
function businessWaitingDetail(w) {
  const day = _bizWaitDay(w.at);
  return `${w.items === 1 ? '1 item' : w.items + ' items'}${day ? ' · asked ' + day : ''}`;
}

// The section inside a business's card (1A) — approvers only, and only when waiting.
function businessWaitingHTML(b, i) {
  if (!b || !/^(owner|team_leader|office)$/.test(b.role)) return '';
  const list = businessWaiting().filter(w => w.org === b.id);
  if (!list.length) return '';
  return `
        <div class="biz-wait" id="biz-wait-${i}">
          <h4 class="biz-wait-title" id="biz-wait-title-${i}">Waiting for your approval</h4>
          ${list.map((w, k) => `
          <div class="biz-wait-row" id="biz-wait-${i}-${k}">
            <p class="biz-wait-words" id="biz-wait-words-${i}-${k}">${escapeHTML(businessWaitingWords(w))}</p>
            <p class="muted biz-wait-detail" id="biz-wait-detail-${i}-${k}">${escapeHTML(businessWaitingDetail(w))}</p>
            <div style="display:flex;gap:8px;margin-top:6px">
              <button class="btn-primary" id="biz-approve-${i}-${k}" data-action="biz-approve" data-arg="${escapeHTML(w.id)}" style="flex:1">Approve</button>
              <button class="btn-secondary" id="biz-refuse-${i}-${k}" data-action="biz-refuse" data-arg="${escapeHTML(w.id)}" style="flex:1">Refuse</button>
            </div>
          </div>`).join('')}
        </div>`;
}

// The Jobs list line for an approver (1A).
function businessWaitingBannerHTML() {
  const n = businessWaiting().length;
  if (!n) return '';
  const text = n === 1 ? 'A job move is waiting for your approval.' : `${n} job moves are waiting for your approval.`;
  return `
    <div class="backup-banner plan-banner" id="wait-banner" role="status">
      <div class="backup-banner-body">
        <div class="backup-banner-text" id="wait-banner-text">${escapeHTML(text)}</div>
        <div class="backup-banner-actions">
          <button class="backup-banner-action primary" id="wait-banner-open" data-action="settings-page" data-arg="cloudBusiness">See</button>
        </div>
      </div>
    </div>
  `;
}

// Approve / Refuse: asked first (3A for Refuse; Approve too — a job leaves the business).
function businessDecideStart(id, approve) {
  const w = businessWaiting().find(x => x.id === id);
  if (!w || !businessValidId(id)) return false;
  const from = _bizNameFor(w.org, w.fromName), to = _bizNameFor(w.to, w.toName);
  const who = w.who || 'The person who asked';
  openConfirmSheet(approve ? {
    title: 'Approve this move?',
    message: `${_bizWaitJob(w).replace(/^a /, 'A ')} moves from ${from} to ${to}, with its photos. ${who} carries on with it there.`,
    confirmLabel: 'Approve', cancelLabel: 'Not now', danger: false,
    onConfirm: () => { businessDecideGo(id, true); },
  } : {
    title: 'Refuse this move?',
    message: `${_bizWaitJob(w).replace(/^a /, 'A ')} stays in ${from}. ${who} sees that it was refused.`,
    confirmLabel: 'Refuse', cancelLabel: 'Not now',
    onConfirm: () => { businessDecideGo(id, false); },
  });
  return true;
}

function businessDecideGo(id, approve) {
  const w = businessWaiting().find(x => x.id === id) || null;
  return _bizCall('decide_job_move', { move: id, approve: !!approve }, 'You need a signal to decide a move.')
    .then((out) => {
      if (out === 'moved') showToast(`Approved — the job has moved to ${w ? _bizNameFor(w.to, w.toName) : 'the other business'}`);
      else if (out === 'refused') showToast('Refused — the job stays where it is');
      else if (out === 'dropped') openInfoSheet({ title: 'Not moved', message: 'The job was finished first, so it stays put. Nothing more to do.' });
      return out;
    })
    .then((out) => businessWaitingRefresh().then(() => out, () => out));
}

// The list read again (after a decision, or a refusal that it was already decided).
function businessWaitingRefresh() {
  const uid = _bizUid();
  if (!uid || _bizOffline()) return Promise.resolve(false);
  return _bizClient()
    .then((c) => businessWaitingRead(c, uid))
    .catch(() => false)
    .then((ok) => { _bizRepaint(); return ok; });
}

// A second approver (Claude's call): "Already refused by Sarah" — the detail is
// 'status|name|you' (supabase/v157-approvals.sql); two at once: no detail.
function businessStaleWords(err) {
  const d = String((err && err.details) || '').split('|');
  const st = d[0], name = (d[1] || '').trim(), you = d[2] === 'you';
  const by = you ? ' by you' : (name ? ` by ${name}` : '');
  if (st === 'moved') return `Already approved${by} — the job has moved.`;
  if (st === 'refused') return `Already refused${by}.`;
  if (st === 'cancelled') return `${name || 'The person who asked'} took the request back.`;
  if (st === 'dropped') return 'The job was finished first, so it stays put.';
  return 'Someone has already decided this one.';
}

// The asker's line, once (4A): a waiting request of mine was decided.
function businessDecidedBannerHTML() {
  const uid = _bizUid();
  const rec = businessMovesLoad();
  if (!uid || rec.u !== uid) return '';
  const list = rec.list.filter(m => m.tell);
  if (!list.length) return '';
  let text;
  if (list.length === 1) {
    const m = list[0];
    const s = (state.sessions || []).find(x => x && String(x.id) === m.job);
    const title = s ? String(s.site || s.name || '').trim() : '';
    const what = title ? `Your move of “${title}”` : 'Your job move';
    text = m.st === 'moved'
      ? `${what} to ${_bizNameFor(m.to, m.toName)} was approved${m.by ? ' by ' + m.by : ''}.`
      : `${what} to ${_bizNameFor(m.to, m.toName)} was refused${m.by ? ' by ' + m.by : ''} — it stays in ${_bizNameFor(m.from, m.fromName)}.`;
  } else {
    text = `${list.length} of your job moves have been decided — Job settings on each job says how.`;
  }
  return `
    <div class="backup-banner plan-banner" id="decided-banner" role="status">
      <div class="backup-banner-body">
        <div class="backup-banner-text" id="decided-banner-text">${escapeHTML(text)}</div>
        <div class="backup-banner-actions">
          <button class="backup-banner-action primary" id="decided-banner-ok" data-action="biz-told">OK</button>
        </div>
      </div>
    </div>
  `;
}

function businessMovesTold() {
  const rec = businessMovesLoad();
  let any = false;
  for (const m of rec.list) if (m.tell) { m.tell = false; any = true; }
  if (any) businessMovesSave(rec);
  render();
  return any;
}

// ============================================================================
// V163 — leaving and removing a member (R5; locked 13 Nov: 1A 2A 3B 4C 5B 6A)
// ============================================================================
// 1A who removes whom = who may invite whom (BUSINESS_OFFER / the SQL's
// _may_offer) · 2A anyone but the Owner may leave · 3B the leaver's phone takes
// off the business's jobs the cloud holds in full (the shield), keeps unsent
// ones read-only · 4C the remover sees the person's devices and when each was
// last used — warned, never blocked · 5B the leaver is told on a sheet · 6A the
// last delivery: their phone sends its own unsent jobs and photos for that
// business first, then tells the cloud it's finished (7 days at most); "Cut off
// now" skips it. The database: supabase/v163-leaving.sql.
//
// DEPARTED_KEY {u, list:[{id, name, kind, by, at, until, deliver, phase, jobs,
// removed, kept, told}]} — the businesses this phone's account has left. phase:
// 'deliver' (sending its last work) → 'settle' (to be cleared) → 'done'. jobs:
// the job ids that were the business's — the cloud's own list (my_departures)
// plus this phone's (businessId, or the main business before it changed).
// ⚠ sync.js leaves a job out of _syncSessions while it's held (businessDepartedHeldIds:
// every phase but an open delivery) — the cloud refuses it, and one refused row
// fails its whole batch. Its deletes are never sent (businessDepartedAnyIds).

const BUSINESS_DELIVER_DAYS = 7;   // supabase/v163-leaving.sql: the last delivery's limit — said in the words
const _BIZ_DEP_PHASES = ['deliver', 'settle', 'done'];
let _bizDepMemo = null;            // held first (a full phone still knows), then stored
let _bizDepOwed = true;            // a start owes a read; so does a refusal by the row rules

function _bizDepNorm(raw) {
  const out = { u: '', list: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  out.u = typeof raw.u === 'string' ? raw.u : '';
  const seen = new Set();
  for (const d of (Array.isArray(raw.list) ? raw.list : [])) {
    if (!d || !businessValidId(d.id) || seen.has(d.id)) continue;
    seen.add(d.id);
    const jobs = Array.from(new Set((Array.isArray(d.jobs) ? d.jobs : []).map(String)
      .filter(j => typeof safeId !== 'function' || safeId(j))));
    out.list.push({
      id: d.id,
      name: _bizStr(d.name, 80),
      kind: d.kind === 'left' ? 'left' : 'removed',
      by: _bizStr(d.by, 60),
      at: _bizStr(d.at, 40),
      until: _bizStr(d.until, 40),
      deliver: d.deliver === true,
      phase: _BIZ_DEP_PHASES.indexOf(d.phase) !== -1 ? d.phase : 'settle',
      jobs,
      removed: Number.isInteger(d.removed) && d.removed > 0 ? d.removed : 0,
      kept: Number.isInteger(d.kept) && d.kept > 0 ? d.kept : 0,
      told: d.told === true,
    });
  }
  return out;
}

function businessDeparturesLoad() {
  if (_bizDepMemo) return _bizDepMemo;
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(DEPARTED_KEY) || 'null'); } catch (e) { raw = null; }
  _bizDepMemo = _bizDepNorm(raw);
  return _bizDepMemo;
}

function businessDeparturesSave(rec) {
  _bizDepMemo = _bizDepNorm(rec);
  try {
    if (_bizDepMemo.list.length) localStorage.setItem(DEPARTED_KEY, JSON.stringify(_bizDepMemo));
    else localStorage.removeItem(DEPARTED_KEY);
    return true;
  } catch (e) { return false; }   // a full phone: held in memory; the cloud says it again next start
}

// Reset / a takeover cleared the key: forget the copy held in memory too.
function businessDeparturesForget() { _bizDepMemo = null; }

function businessDepartures() { return businessDeparturesLoad().list; }

// The delivery's own limit, by this phone's clock — past it the cloud refuses.
function _bizDepExpired(d) {
  const ms = Date.parse(String(d && d.until || '').replace(/(\.\d{3})\d+/, '$1'));
  return !isFinite(ms) || ms <= Date.now();
}

// sync.js: never sent — every job of a business left, but during an open delivery.
function businessDepartedHeldIds() {
  const out = new Set();
  for (const d of businessDepartures()) {
    if (d.phase === 'deliver' && !_bizDepExpired(d)) continue;
    for (const j of d.jobs) out.add(j);
  }
  return out;
}

// sync.js: no delete is ever sent for these (a leaver delivers, never wipes).
function businessDepartedAnyIds() {
  const out = new Set();
  for (const d of businessDepartures()) for (const j of d.jobs) out.add(j);
  return out;
}

// The departure a job belongs to, or null — the job is then read-only here.
function businessJobLeft(sess) {
  if (!sess || sess.id == null) return null;
  const id = String(sess.id);
  return businessDepartures().find(d => d.jobs.indexOf(id) !== -1) || null;
}

function businessDepartedName(d) { return (d && d.name) ? d.name : 'that business'; }

function businessDeparturesOwe() { _bizDepOwed = true; }

// Rows from my_departures → the stored record. `def` is the main business as
// this phone knew it BEFORE the list is read again: a job with no businessId was
// the main one's, so if that's the business left, those jobs were its.
function businessDeparturesFromRows(uid, rows) {
  if (!uid || !Array.isArray(rows)) return null;
  const rec = businessDeparturesLoad();
  const prev = rec.u === uid ? rec.list : [];
  const def = businessDefault();
  const flag = (typeof DEMO_SESSION_FLAG !== 'undefined') ? DEMO_SESSION_FLAG : 'isExample';
  const out = [];
  let stamped = 0;
  for (const r of rows) {
    if (!r || !businessValidId(r.business_id)) continue;
    const id = r.business_id;
    const was = prev.find(d => d.id === id) || null;
    const jobs = new Set(was ? was.jobs : []);
    for (const j of (Array.isArray(r.jobs) ? r.jobs : [])) jobs.add(String(j));
    if (!was) {
      for (const s of (state.sessions || [])) {
        if (!s || s.id == null || s[flag]) continue;
        const b = businessValidId(s.businessId) ? s.businessId : '';
        if (b === id || (!b && def && def.id === id)) jobs.add(String(s.id));
      }
    }
    // A job the cloud never had now names the business it was made for, so its
    // last delivery lands there, never in the leaver's own. One the cloud has is
    // left as it is: the cloud knows its business, and changing it here would
    // change its fingerprint and lose its shield (3B).
    const inCloud = new Set((Array.isArray(r.jobs) ? r.jobs : []).map(String));
    for (const s of (state.sessions || [])) {
      if (s && s.id != null && !s[flag] && jobs.has(String(s.id)) && !inCloud.has(String(s.id)) && s.businessId !== id) { s.businessId = id; stamped++; }
    }
    const deliver = r.deliver === true;
    out.push({
      id, name: _bizStr(r.business_name, 80), kind: r.kind === 'left' ? 'left' : 'removed', by: _bizStr(r.by_name, 60),
      at: _bizStr(r.at, 40), until: _bizStr(r.deliver_until, 40), deliver, jobs: Array.from(jobs),
      phase: (was && was.phase === 'done') ? 'done' : (deliver ? 'deliver' : 'settle'),
      removed: was ? was.removed : 0, kept: was ? was.kept : 0, told: was ? was.told : false,
    });
  }
  // A business that isn't in the answer any more: invited back. Its jobs are
  // this account's to change and send again (a kept one stays locked until unlocked).
  businessDeparturesSave({ u: uid, list: out });
  if (stamped && typeof save === 'function') save();
  return out;
}

function businessDeparturesRead(c, uid) {
  return Promise.resolve()
    .then(() => c.rpc('my_departures'))
    .then((res) => {
      if (!res || res.error) throw (res && res.error) || new Error('no answer');
      const out = businessDeparturesFromRows(uid, res.data);
      if (out) _bizDepOwed = false;
      _bizJobsRepaint();
      return !!out;
    });
}

// sync.js, BEFORE anything is read or sent: on every start and return to the
// front (owed), after a refusal by the row rules (owed), while a departure is
// still being settled, and otherwise with the business list (BUSINESS_READ_MS).
// Never rejects; a project without the V163 SQL simply has none.
function businessDeparturesMaybeRead(c, uid) {
  if (!uid) return Promise.resolve(false);
  const rec = businessDeparturesLoad();
  const open = rec.u === uid && rec.list.some(d => d.phase !== 'done');
  if (!_bizDepOwed && !open && !businessReadDue(businessLoad(), uid, Date.now())) return Promise.resolve(false);
  return businessDeparturesRead(c, uid).catch((e) => {
    console.error('Business: departures not read this time (non-fatal).', e);
    return false;
  });
}

// 3B: take off the jobs the cloud holds in full; keep the rest here, read-only
// (locked — kept off the cloud, so the lock never goes up). `safety` is
// sync.js's shield judged over just these jobs.
function _bizDepSettle(d, safety) {
  const here = (state.sessions || []).filter(s => s && d.jobs.indexOf(String(s.id)) !== -1);
  const safe = here.filter(s => { const r = safety && safety.map.get(String(s.id)); return !!(r && r.safe); }).map(s => s.id);
  const n = (safe.length && typeof removeJobsFromPhone === 'function') ? removeJobsFromPhone(safe) : 0;
  const kept = (state.sessions || []).filter(s => s && d.jobs.indexOf(String(s.id)) !== -1);
  const now = new Date().toISOString();
  for (const s of kept) {
    if (!s.locked) { s.locked = true; s.lockedAt = now; if (typeof _invalidateSessionEncoding === 'function') _invalidateSessionEncoding(s); }
  }
  d.phase = 'done'; d.removed = (d.removed || 0) + n; d.kept = kept.length; d.told = false;
  if (kept.length || n) save();
}

// sync.js, after a run's photos: a delivery with nothing left to send is
// finished (the cloud told), and every departure not yet settled is settled.
// An open delivery waits while any of its jobs could still go — unsent, photos
// to send, or not yet read back — until its 7 days are up. Never rejects.
function businessDeliveryFinish(c, uid) {
  const rec = businessDeparturesLoad();
  if (!uid || rec.u !== uid || !rec.list.some(d => d.phase !== 'done')) return Promise.resolve(false);
  if (!state.photoMetaReady || typeof syncJobsSafety !== 'function') return Promise.resolve(false);
  let chain = Promise.resolve();
  let changed = false;
  for (const d of rec.list) {
    if (d.phase === 'done') continue;
    const here = (state.sessions || []).filter(s => s && d.jobs.indexOf(String(s.id)) !== -1);
    const safety = syncJobsSafety(true, here);
    if (!safety) continue;
    if (d.phase === 'deliver') {
      const going = here.some((s) => {
        const r = safety.map.get(String(s.id));
        return r && !r.safe && r.why !== 'held' && (typeof jobIdsSafe !== 'function' || jobIdsSafe(s));
      });
      if (going && !_bizDepExpired(d)) continue;
      chain = chain.then(() => c.rpc('finish_delivery', { o: d.id }).then(() => {}, () => {}));   // best effort: the 7 days close it anyway
    }
    chain = chain.then(() => { _bizDepSettle(d, safety); changed = true; });
  }
  return chain.then(() => {
    if (!changed) return false;
    businessDeparturesSave(rec);
    _bizDepTellSoon();
    _bizJobsRepaint();
    return true;
  }).catch((e) => { console.error('Business: last delivery not finished this time (non-fatal).', e); return false; });
}

// ---- 5B: telling the person ---------------------------------------------------
function businessDepartedWords(d) {
  const nm = businessDepartedName(d);
  const head = d.kind === 'left' ? `You’ve left ${nm}.` : `You’ve been removed from ${nm}${d.by ? ' by ' + d.by : ''}.`;
  const jobs = (n) => `${n} ${n === 1 ? 'job' : 'jobs'}`;
  let body;
  if (!d.removed && !d.kept) body = ' None of its jobs were on this phone.';
  else if (!d.kept) body = ` All your work for ${nm} was sent and has been taken off this phone (${jobs(d.removed)}). It’s safe with the business.`;
  else {
    body = (d.removed ? ` ${jobs(d.removed)} ${d.removed === 1 ? 'was' : 'were'} safe in the cloud and ${d.removed === 1 ? 'has' : 'have'} been taken off this phone.` : '') +
      ` ${jobs(d.kept)} couldn’t be sent to ${nm}, so ${d.kept === 1 ? 'it stays' : 'they stay'} on this phone, read-only. You can still make a certificate or CSV from ${d.kept === 1 ? 'it' : 'them'}, or remove ${d.kept === 1 ? 'it' : 'them'} from this phone.`;
  }
  return head + body + ' Your sign-in and your own business are unchanged.';
}

function _bizDepUntold() { return businessDepartures().filter(d => d.phase === 'done' && !d.told); }

function businessDepartedTold(id) {
  const rec = businessDeparturesLoad();
  let n = 0;
  for (const d of rec.list) if (d.phase === 'done' && !d.told && (!id || d.id === id)) { d.told = true; n++; }
  if (n) businessDeparturesSave(rec);
  return n;
}

function businessDepartedSee(id) {
  const d = _bizDepUntold().find(x => !id || x.id === id) || businessDepartures().find(x => x.id === id);
  if (!d) return false;
  openInfoSheet({
    title: d.kind === 'left' ? `Left ${businessDepartedName(d)}` : `Removed from ${businessDepartedName(d)}`,
    message: businessDepartedWords(d),
    onClose: () => { businessDepartedTold(d.id); try { render(); } catch (e) { /* next paint */ } },
  });
  return true;
}

// 5B: the sheet opens itself on the Jobs list at a calm moment (no sheet open,
// nothing being typed); otherwise the Jobs list line (below) waits with See.
function _bizDepTellSoon() {
  try {
    if (!_bizDepUntold().length || state.view !== 'sessions') return;
    if (typeof _syncSafeToRepaint === 'function' && !_syncSafeToRepaint()) return;
    businessDepartedSee('');
  } catch (e) { /* the line says it instead */ }
}

// The Jobs list: while delivering, and until told.
function businessDepartedBannerHTML() {
  const list = businessDepartures();
  const sending = list.find(d => d.phase === 'deliver' && !_bizDepExpired(d));
  const untold = list.find(d => d.phase === 'done' && !d.told);
  if (untold) {
    return `
      <div class="info-card biz-left-line" id="biz-left-line" role="status">
        <p>${escapeHTML(untold.kind === 'left' ? `You’ve left ${businessDepartedName(untold)}.` : `You’ve been removed from ${businessDepartedName(untold)}.`)}</p>
        <button class="backup-action-btn" id="biz-left-see" data-action="biz-left-see" data-arg="${escapeHTML(untold.id)}">See what happened</button>
      </div>`;
  }
  if (sending) {
    return `
      <div class="info-card biz-left-line" id="biz-left-sending" role="status">
        <p>${escapeHTML(`You’re no longer in ${businessDepartedName(sending)} — sending your last work for them…`)}</p>
      </div>`;
  }
  return '';
}

// Job settings: the line, and the reason Change… isn't offered.
function businessJobLeftLine(sess) {
  const d = businessJobLeft(sess);
  if (!d) return '';
  return `No longer in ${businessDepartedName(d)} — this job stays with the business. It can’t be changed on this phone.`;
}

// ---- removing someone (1A, 4C, 6A) --------------------------------------------
function businessMayRemove(b, p) {
  return !!(b && p && !p.you && p.role !== 'owner' && (BUSINESS_OFFER[b.role] || []).indexOf(p.role) !== -1);
}

function _bizDevLine(d) {
  const kind = _bizKindHead(BUSINESS_DEVICE_KINDS[d.kind] || 'device');
  const v = _BIZ_VERSION_RE.test(String(d.app_version || '')) ? d.app_version : '';
  const ms = Date.parse(String(d.last_used || '').replace(/(\.\d{3})\d+/, '$1'));
  let when = 'not used yet';
  if (isFinite(ms)) {
    const t = new Date(ms);
    const p = (k) => String(k).padStart(2, '0');
    when = 'last used ' + _bizDay(ms) + ' ' + p(t.getHours()) + ':' + p(t.getMinutes());
  }
  return [kind, v, when].filter(Boolean).join(' · ');
}

function businessRemoveStart(arg) {
  const [orgId, user] = String(arg || '').split(':');
  const b = _bizOrg(orgId);
  const p = businessTeam().people.find(x => x.org === orgId && x.user === user);
  if (!businessMayRemove(b, p)) return false;
  const who = p.name || 'this person';
  const biz = businessLabel(b);
  _bizCall('member_devices', { o: orgId, u: user }, 'You need a signal to remove someone.').then((rows) => {
    if (rows === null) return;
    const devs = (Array.isArray(rows) ? rows : []).slice(0, 6).map(_bizDevLine);
    openChoiceSheet({
      title: `Remove ${who} from ${biz}?`,
      message: `${who} loses access to ${biz}’s jobs straight away. Their jobs stay with ${biz}; their sign-in and own business don’t change. ` +
        (devs.length
          ? `Anything not yet sent from ${devs.length === 1 ? 'this device' : 'these devices'} won’t reach ${biz} unless their phone can send it — ask them to Sync first if you can:`
          : `They have no devices signed in, so nothing more can come from them.`),
      lines: devs,
      choices: [
        { label: `Remove — let their phone send what it’s still holding (up to ${BUSINESS_DELIVER_DAYS} days)`, style: 'primary',
          onPick: () => businessRemoveGo(orgId, user, true, who) },
        { label: 'Remove — cut off now', style: 'danger',
          onPick: () => businessRemoveGo(orgId, user, false, who) },
      ],
    });
  });
  return true;
}

function businessRemoveGo(orgId, user, deliver, who) {
  return _bizCall('remove_member', { o: orgId, u: user, deliver: !!deliver }).then((x) => {
    if (x === null) return false;
    showToast(`${who || 'They'} removed`);
    businessAfterChange();
    return true;
  });
}

// ---- leaving (2A) ---------------------------------------------------------------
function businessLeaveStart(orgId) {
  const b = _bizOrg(orgId);
  if (!b || b.role === 'owner') return false;
  const biz = businessLabel(b);
  openConfirmSheet({
    title: `Leave ${biz}?`,
    message: `Your jobs for ${biz} stay with the business. This phone first sends anything you haven’t sent yet, then takes ${biz}’s jobs off. ` +
      `To come back, someone in ${biz} would have to invite you again.`,
    confirmLabel: 'Leave', cancelLabel: 'Cancel', danger: true,
    onConfirm: () => {
      _bizCall('leave_business', { o: orgId }).then((x) => {
        if (x === null) return;
        showToast(`You’ve left ${biz}`);
        businessDeparturesOwe();
        businessAfterChange().then(() => {
          // the last delivery starts now, not at the next sync
          if (typeof syncPull === 'function') syncPull({ manual: false }).catch(() => false);
        });
      });
    },
  });
  return true;
}
