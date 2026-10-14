// ============== PATGo PWA — V127 — The plan: trial end, grace, the lock ==============
// (c) 2026 Peter Birchley. All rights reserved.
//
// WHAT THIS FILE OWNS. What the signed-in account's plan means on this phone:
// when the free trial ends, the 7 days' grace after it (3A), the lock after that,
// the four nudges towards paying (6) and Renew now (10A). Optional subsystem
// (MAP rule 6): every caller is typeof-guarded and everything here fails OPEN —
// a broken plan.js must never stop an engineer logging. The lock is not the
// thing protecting anyone's data, so when in doubt it lets the work through.
//
// THE RULES (locked 14 Oct, Peter):
//   2A  a trial counts as ended once trial_ends_at has passed — the phone
//       decides, because no server job sets `lapsed` yet. A `lapsed` from the
//       database is honoured too (Stage 13's billing will set it).
//   3A  PLAN_GRACE_DAYS after the end, everything still works.
//   4A  from PLAN_WARN_DAYS before the end, a line on the Jobs list.
//   5B  what is sold is the workflow, not the cloud: after the grace the
//       account is LOCKED on this phone — no new jobs, no logging, no new
//       certificates (8B), a job in progress included (9A).
//   6   four touches, each with Renew now: the line before the end, one sheet
//       when it ends, the countdown line, one more sheet on the last day.
//   10A Renew now opens PLAN_RENEW_URL, or an email until there is one.
//
// ⚠ WHAT THE LOCK IS NOT. Never a lock on the engineer's own records: every job
// still opens to view, and Export everything, the backup, CSV export, deleting
// and the cloud all keep working (8B, and V125 exists so a customer can always
// leave with everything). The sync keeps running too (Claude's call in the V127
// spec): nothing new can be logged anyway, and the cloud copy staying current is
// the customer-first side of the 7-year promise.
//
// ⚠ WHAT THE LOCK DOES NOT STOP YET. It belongs to the signed-in account, so a
// phone signed out has no plan and no lock — and today anyone can use PATGo
// without an account. Peter's launch plan closes that: the product site needs
// an account and a plan, and the free site goes (roadmap). Until then this is
// the mechanism, built and tested, not yet the fence.
//
// TIME. "Now" is the later of the phone's clock and the latest SERVER time this
// phone has seen (the issue time of the stored sign-in, kept in the record), so
// winding the phone's clock back does not move the end. The phone's own clock
// never ratchets the record forward: a phone whose clock was once wrong in the
// future must not stay locked after it is put right.

const PLAN_DAY_MS = 24 * 60 * 60 * 1000;
let _planRefreshing = false;
let _planHooked = false;

// ---- the record ------------------------------------------------------------
function _planRead() {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw);
    return (r && typeof r === 'object' && typeof r.uid === 'string' && r.uid) ? r : null;
  } catch (e) { return null; }
}

function _planWrite(rec) {
  try { localStorage.setItem(PLAN_KEY, JSON.stringify(rec)); } catch (e) { /* private mode: read again next start */ }
}

// The signed-in account's id, '' when nobody is (or cloud.js is missing).
function _planUid() {
  try { return (typeof cloudUserId === 'function') ? (cloudUserId() || '') : ''; } catch (e) { return ''; }
}

// The record for the account signed in now — another login's is ignored.
function planRecord() {
  const uid = _planUid();
  if (!uid) return null;
  const r = _planRead();
  return (r && r.uid === uid) ? r : null;
}

// The server's time as last seen: the stored sign-in's issue time (cloud.js).
function _planServerSeen() {
  try {
    const s = (typeof _cloudReadStoredSession === 'function') ? _cloudReadStoredSession() : null;
    const t = s ? Number(s.issuedAt) : 0;
    return isFinite(t) && t > 0 ? t : 0;
  } catch (e) { return 0; }
}

function planNow(rec) {
  const seen = Math.max(Number(rec && rec.serverAt) || 0, _planServerSeen());
  return Math.max(Date.now(), seen);
}

// The profile row just read (cloud.js's check, or planRefresh) becomes the
// record. Keeps which nudges were shown, so a re-read never repeats one.
function planNote(row) {
  const uid = _planUid();
  if (!uid || !row || typeof row !== 'object') return null;
  const old = planRecord() || {};
  const plan = typeof row.plan === 'string' ? row.plan : null;
  const rec = {
    uid,
    plan,
    trialEndsAt: typeof row.trial_ends_at === 'string' ? row.trial_ends_at : null,
    lapsedSeenAt: null,
    serverAt: Math.max(Number(old.serverAt) || 0, _planServerSeen()),
    checkedAt: Date.now(),
    shownEnded: old.shownEnded || '',
    shownLastDay: old.shownLastDay || '',
  };
  // A `lapsed` with no trial end behind it (a paid plan that stopped) counts its
  // grace from the first time this phone heard about it. Back to anything else
  // and that is forgotten.
  if (plan === 'lapsed') rec.lapsedSeenAt = Number(old.lapsedSeenAt) || planNow(rec);
  _planWrite(rec);
  _planHook();
  return rec;
}

// ---- the rules -------------------------------------------------------------
// The database sends microseconds ("2026-10-14T09:00:00.123456+00:00"). V8 reads
// that; older Safari / WebKit has refused fractions longer than milliseconds,
// and a refused date reads as "no end" — a trial that never ends. Cut to three.
function _planIsoForSafari(s) {
  return String(s || '').replace(/(\.\d{3})\d+/, '$1');
}
function _planTime(s) {
  return Date.parse(_planIsoForSafari(s));
}

// Pure: the record and a time in, the phase out.
//   none    no account, no record, or a plan this version does not know (open)
//   paid    active or comped
//   trial   a trial, more than PLAN_WARN_DAYS from its end (or no end at all)
//   ending  a trial within PLAN_WARN_DAYS of its end              (4A)
//   grace   ended, inside PLAN_GRACE_DAYS — everything still works (3A)
//   locked  after the grace                                         (5B)
function planStatus(rec, now) {
  if (!rec || typeof rec !== 'object') return { phase: 'none' };
  const p = rec.plan;
  if (p === 'active' || p === 'comped') return { phase: 'paid' };
  const lapsed = p === 'lapsed';
  let start;
  if (p === 'trial') {
    start = _planTime(rec.trialEndsAt);
    if (!isFinite(start)) return { phase: 'trial' };          // no end date: never ends
  } else if (lapsed) {
    const te = _planTime(rec.trialEndsAt);
    const seen = Number(rec.lapsedSeenAt) || now;
    start = (isFinite(te) && te <= seen) ? te : seen;
  } else {
    return { phase: 'none' };                                 // unknown: fail open
  }
  const lockAt = start + PLAN_GRACE_DAYS * PLAN_DAY_MS;
  const base = { endsAt: start, lockAt, lapsed };
  if (!lapsed && now < start) {
    return Object.assign({ phase: now >= start - PLAN_WARN_DAYS * PLAN_DAY_MS ? 'ending' : 'trial' }, base);
  }
  if (now < lockAt) {
    return Object.assign({ phase: 'grace', daysLeft: Math.max(1, Math.ceil((lockAt - now) / PLAN_DAY_MS)) }, base);
  }
  return Object.assign({ phase: 'locked' }, base);
}

function planCurrent() {
  try {
    const rec = planRecord();
    return planStatus(rec, planNow(rec));
  } catch (e) { return { phase: 'none' }; }
}

function planLocked() {
  return planCurrent().phase === 'locked';
}

// The one gate. Every place that starts a job, logs a test or makes a
// certificate asks this first: true = carry on; false = locked, and the Renew
// sheet is already up. Fails open.
function planGate() {
  let locked = false;
  try { locked = planLocked(); } catch (e) { locked = false; }
  if (!locked) return true;
  try { planShowLocked(); } catch (e) { /* the refusal stands without its sheet */ }
  return false;
}

// ---- words -----------------------------------------------------------------
function _planDate(ms) {
  const d = new Date(ms);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return (typeof formatDate === 'function') ? formatDate(iso) : iso;
}

function _planEndedWords(st) {
  return st.lapsed ? 'Your PATGo plan has ended.' : 'Your free trial has ended.';
}

function _planCountdownWords(st) {
  return st.daysLeft > 1
    ? `Logging locks in ${st.daysLeft} days, on ${_planDate(st.lockAt)}.`
    : 'Logging locks within a day.';
}

const PLAN_LOCKED_WORDS = 'logging tests, starting jobs and making certificates';
const PLAN_SAFE_WORDS = 'Nothing is deleted: your jobs stay safe on this phone and in the cloud, and you can export everything at any time.';

// The line itself, or '' — shared by the Jobs list and the Account page.
function planLineText(st) {
  if (!st) return '';
  if (st.phase === 'ending') return `Your free trial ends on ${_planDate(st.endsAt)}.`;
  if (st.phase === 'grace') return `${_planEndedWords(st)} ${_planCountdownWords(st)}`;
  if (st.phase === 'locked') return `Your account is locked. Renew to carry on ${PLAN_LOCKED_WORDS}.`;
  return '';
}

// The Jobs list line (4A, 6b). Not dismissible — it is the countdown.
function planBannerHTML() {
  const st = planCurrent();
  const text = planLineText(st);
  if (!text) return '';
  const cls = st.phase === 'locked' ? ' plan-banner-locked' : '';
  return `
    <div class="backup-banner plan-banner${cls}" id="plan-banner">
      <div class="backup-banner-body">
        <div class="backup-banner-text" id="plan-banner-text">${escapeHTML(text)}</div>
        <div class="backup-banner-actions">
          <button class="backup-banner-action primary" id="plan-banner-renew" data-action="plan-renew">Renew now</button>
        </div>
      </div>
    </div>
  `;
}

// The Account page (Settings → Cloud): the same line and button.
function planAccountHTML() {
  const st = planCurrent();
  const text = planLineText(st);
  if (!text) return '';
  return `
        <p class="muted" id="cloud-plan-status">${escapeHTML(text)}</p>
        <button class="btn-primary" id="cloud-plan-renew" data-action="plan-renew" style="margin-top:6px">Renew now</button>`;
}

// ---- Renew now (10A) -------------------------------------------------------
function planRenewHref() {
  const email = (state.cloud && state.cloud.email) || '';
  if (PLAN_RENEW_URL) {
    return PLAN_RENEW_URL + (PLAN_RENEW_URL.indexOf('?') === -1 ? '?' : '&') + 'email=' + encodeURIComponent(email);
  }
  const subject = encodeURIComponent('Renew my PATGo account');
  const body = encodeURIComponent(`Please renew my PATGo account.\n\nAccount: ${email || '(not shown)'}`);
  return `mailto:${PLAN_RENEW_EMAIL}?subject=${subject}&body=${body}`;
}

function planRenew() {
  const href = planRenewHref();
  try {
    if (PLAN_RENEW_URL) {
      const w = window.open(href, '_blank', 'noopener');
      if (!w) window.location.href = href;
    } else {
      window.location.href = href;
      showToast('Opening your email app');
    }
  } catch (e) {
    showToast('Couldn’t open that. Email ' + PLAN_RENEW_EMAIL + ' to renew.');
  }
  return href;
}

// ---- the sheets ------------------------------------------------------------
function _planChoices() {
  const out = [{ label: 'Renew now', style: 'primary', onPick: () => planRenew() }];
  if (typeof exportAllOpen === 'function') out.push({ label: 'Export everything', style: 'secondary', onPick: () => exportAllOpen() });
  return out;
}

// The refusal (planGate). 9A: the same for a job in progress.
function planShowLocked() {
  openChoiceSheet({
    title: 'Renew to carry on',
    message: `Your PATGo account is locked, so ${PLAN_LOCKED_WORDS} are paused until you renew. ${PLAN_SAFE_WORDS}`,
    choices: _planChoices(),
    cancelLabel: 'Close',
  });
}

function _planShowEnded(st) {
  openChoiceSheet({
    title: st.lapsed ? 'Your plan has ended' : 'Your free trial has ended',
    message: `Everything keeps working for ${PLAN_GRACE_DAYS} more days, until ${_planDate(st.lockAt)}. After that, ${PLAN_LOCKED_WORDS} are locked until you renew. ${PLAN_SAFE_WORDS}`,
    choices: _planChoices(),
    cancelLabel: 'Not now',
  });
}

function _planShowLastDay() {
  openChoiceSheet({
    title: 'Last day before the lock',
    message: `Within a day, ${PLAN_LOCKED_WORDS} lock until you renew. ${PLAN_SAFE_WORDS}`,
    choices: _planChoices(),
    cancelLabel: 'Not now',
  });
}

// A sheet only on the Jobs list with nothing else going on — the same quiet
// moment the self-update waits for, minus the idle wait (boot.js helpers).
function _planCanPrompt() {
  if (state.view !== 'sessions') return false;
  try { if (document.visibilityState === 'hidden') return false; } catch (e) { /* showing */ }
  if (state.newForm && state.newForm.show) return false;
  if (state.tourOpen) return false;
  if (state.saveFailure && !state.saveFailureDismissed) return false;
  if (typeof _updateSheetOpen === 'function' && _updateSheetOpen()) return false;
  if (typeof _updateFieldHeld === 'function' && _updateFieldHeld()) return false;
  try { if (document.querySelector('.modal-backdrop, .bulk-sheet, .fail-sheet, .wizard-sheet')) return false; } catch (e) { /* no DOM */ }
  return true;
}

// 6a and the last-day sheet: each once per ending (keyed by the lock time, so
// a new trial or a later lapse asks again). Returns which sheet it showed.
function planMaybePrompt() {
  try {
    const rec = planRecord();
    const st = planStatus(rec, planNow(rec));
    if (st.phase !== 'grace' || !_planCanPrompt()) return '';
    const key = String(st.lockAt);
    if (rec.shownEnded !== key) {
      rec.shownEnded = key;
      if (st.daysLeft <= 1) rec.shownLastDay = key;   // heard about it on the last day: one sheet, not two
      _planWrite(rec);
      if (st.daysLeft <= 1) { _planShowLastDay(); return 'last'; }
      _planShowEnded(st);
      return 'ended';
    }
    if (st.daysLeft <= 1 && rec.shownLastDay !== key) {
      rec.shownLastDay = key;
      _planWrite(rec);
      _planShowLastDay();
      return 'last';
    }
  } catch (e) { /* fail open */ }
  return '';
}

// ---- reading the plan ------------------------------------------------------
// Redraw the Jobs list or the Account page with the new line — never under a
// sheet or the cursor (MAP rules 2/3, as _cloudRepaint).
function _planRepaint() {
  if (state.view !== 'sessions' && state.view !== 'cloudAccount') return;
  try {
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return;
    if (document.querySelector('body > .bulk-sheet, body > .fail-sheet, body > .modal-backdrop')) return;
  } catch (e) { /* no DOM to inspect */ }
  render();
}

// Quietly read this account's profile row (its own, by id) and keep it.
// Signed in and online only; one at a time; never rejects.
function planRefresh() {
  const uid = _planUid();
  if (!uid || _planRefreshing || typeof cloudClient !== 'function') return Promise.resolve(false);
  try { if (navigator.onLine === false) return Promise.resolve(false); } catch (e) { /* assume online */ }
  _planRefreshing = true;
  return cloudClient()
    .then((c) => c.from('profiles').select('plan, trial_ends_at').eq('id', uid).maybeSingle())
    .then((res) => {
      const row = res && !res.error ? res.data : null;
      if (!row || _planUid() !== uid) return false;   // signed out (or switched) meanwhile
      planNote(row);
      return true;
    })
    .catch(() => false)
    .then((ok) => {
      _planRefreshing = false;
      if (ok) { _planRepaint(); planMaybePrompt(); }
      return ok;
    });
}

function _planOnVisible() {
  try { if (document.visibilityState !== 'visible') return; } catch (e) { return; }
  const rec = planRecord();
  if (rec && Date.now() - (Number(rec.checkedAt) || 0) < PLAN_REFRESH_MS) {
    _planRepaint();          // the countdown may have moved a day
    planMaybePrompt();
    return;
  }
  planRefresh().then((ok) => { if (!ok) { _planRepaint(); planMaybePrompt(); } });
}

// Boot entry point (boot.js, after the first render, good load only). What the
// phone already knows applies at once, offline included; then a fresh read.
function _planHook() {
  if (!_planHooked && typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
    _planHooked = true;
    document.addEventListener('visibilitychange', _planOnVisible);
  }
}

// Nobody signed in = nothing to do, not even a listener (16a counts them).
// A later sign-in hooks it through planNote().
function planBoot() {
  if (!_planUid()) return Promise.resolve(false);
  _planHook();
  planMaybePrompt();
  return planRefresh();
}

// (c) 2026 Peter Birchley. All rights reserved.
