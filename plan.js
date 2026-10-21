// ============== PATGo PWA — V127 — The plan: trial end, grace, the lock (V142: + paying; V143: + enforcement) ==============
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
//
// V143 — ENFORCEMENT (Peter, 21 Oct: 1A 2A 3A 4A 5A).
//   3A  A paid plan that stops counts its grace from the date the SERVER says it
//       lapsed (lapsed_at, kept on the business and copied to each profile), so
//       every phone and the server agree. Without it (a database before V143)
//       the old rule stands. ⚠ The old rule counted from the trial's end when
//       that was earlier — weeks earlier for a plan that had been paid — so a
//       cancelled subscription locked at once with no grace. lapsed_at wins.
//   4A  A phone that hasn't read its plan for PLAN_CHECK_DAYS is held as if
//       locked ("unchecked"), until it reads it once — airplane mode is not a
//       way to keep logging. Comped never. A phone that has never read a plan
//       has no record and so no hold (V127, unchanged).
//   1A/2A  The SERVER refuses a locked business's uploads from 7 days after the
//       phone lock (supabase/v143-enforcement.sql). The phone hears it from
//       sync.js (5A: its own line, no more tries until the plan changes — see
//       syncPlanChecked, called from planNote below).

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
    lapsedAt: typeof row.lapsed_at === 'string' ? row.lapsed_at : null,     // V143 (3A): the server's date
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
  // V143 (5A): a fresh read that says this business may work again lets the
  // cloud try again (sync.js stopped after the server refused). Still locked:
  // it stays stopped — trying again would only be refused again.
  try { if (typeof syncPlanChecked === 'function') syncPlanChecked(!planLocked()); } catch (e) { /* optional — rule 6 */ }
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
// V143 (4A): any phase but locked (and never comped) also carries
// unchecked: true once the plan was last read PLAN_CHECK_DAYS ago or more.
function planStatus(rec, now) {
  if (!rec || typeof rec !== 'object') return { phase: 'none' };
  const st = _planPhase(rec, now);
  if (st.phase !== 'locked' && st.phase !== 'none' && rec.plan !== 'comped') {
    const checked = Number(rec.checkedAt) || 0;
    if (checked > 0 && now >= checked + PLAN_CHECK_DAYS * PLAN_DAY_MS) st.unchecked = true;
  }
  return st;
}

function _planPhase(rec, now) {
  const p = rec.plan;
  if (p === 'active' || p === 'comped') return { phase: 'paid' };
  const lapsed = p === 'lapsed';
  let start;
  if (p === 'trial') {
    start = _planTime(rec.trialEndsAt);
    if (!isFinite(start)) return { phase: 'trial' };          // no end date: never ends
  } else if (lapsed) {
    const la = _planTime(rec.lapsedAt);
    if (isFinite(la)) {
      start = la;                                             // V143 (3A): the server's date
    } else {
      const te = _planTime(rec.trialEndsAt);
      const seen = Number(rec.lapsedSeenAt) || now;
      start = (isFinite(te) && te <= seen) ? te : seen;
    }
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

// V143 (4A): held until the plan is checked counts as locked for every gate.
function planLocked() {
  const st = planCurrent();
  return st.phase === 'locked' || !!st.unchecked;
}

// The one gate. Every place that starts a job, logs a test or makes a
// certificate asks this first: true = carry on; false = locked, and the Renew
// (or V143: Check now) sheet is already up. Fails open.
function planGate() {
  let st = null;
  try { st = planCurrent(); } catch (e) { st = null; }
  if (!st || (st.phase !== 'locked' && !st.unchecked)) return true;
  try { if (st.phase === 'locked') planShowLocked(); else planShowUnchecked(); } catch (e) { /* the refusal stands without its sheet */ }
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

// V143 (5A): the cloud has refused this business's changes (sync.js).
function _planCloudPaused() {
  try { return typeof syncPlanRefused === 'function' && syncPlanRefused(); } catch (e) { return false; }
}

// The line itself, or '' — shared by the Jobs list and the Account page.
function planLineText(st) {
  if (!st) return '';
  const paused = _planCloudPaused();
  if (st.phase === 'locked') {
    return paused
      ? `Your account is locked and cloud syncing is paused. Renew to carry on ${PLAN_LOCKED_WORDS}.`
      : `Your account is locked. Renew to carry on ${PLAN_LOCKED_WORDS}.`;
  }
  if (st.unchecked) return `PATGo hasn’t been able to confirm your plan for ${PLAN_CHECK_DAYS} days. Connect to the internet to carry on ${PLAN_LOCKED_WORDS}.`;
  if (paused) return 'Cloud syncing is paused because your PATGo subscription has ended. Renew to resume — your work remains safe on this phone.';
  if (st.phase === 'ending') return `Your free trial ends on ${_planDate(st.endsAt)}.`;
  if (st.phase === 'grace') return `${_planEndedWords(st)} ${_planCountdownWords(st)}`;
  return '';
}

// V143 (4A): the button beside the line — Check now while held, else Renew now.
function _planLineButton(st, id) {
  return (st && st.unchecked && st.phase !== 'locked')
    ? `<button class="backup-banner-action primary" id="${id}" data-action="plan-check">Check now</button>`
    : `<button class="backup-banner-action primary" id="${id}" data-action="plan-renew">Renew now</button>`;
}

// The Jobs list line (4A, 6b). Not dismissible — it is the countdown.
function planBannerHTML() {
  const st = planCurrent();
  const text = planLineText(st);
  if (!text) return '';
  const cls = (st.phase === 'locked' || st.unchecked) ? ' plan-banner-locked' : '';
  return `
    <div class="backup-banner plan-banner${cls}" id="plan-banner">
      <div class="backup-banner-body">
        <div class="backup-banner-text" id="plan-banner-text">${escapeHTML(text)}</div>
        <div class="backup-banner-actions">
          ${_planLineButton(st, 'plan-banner-renew')}
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
  const check = st.unchecked && st.phase !== 'locked';
  return `
        <p class="muted" id="cloud-plan-status">${escapeHTML(text)}</p>
        <button class="btn-primary" id="cloud-plan-renew" data-action="${check ? 'plan-check' : 'plan-renew'}" style="margin-top:6px">${check ? 'Check now' : 'Renew now'}</button>`;
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
  // V142 (2A): with paying on, Renew now is the same choice as Subscribe — or
  // the billing page when there is a plan to look after (a card to update).
  if (typeof billingAvailable === 'function' && billingAvailable()) {
    const b = _bill();
    if (b.info && b.info.has_subscription && ['trialing', 'active', 'past_due'].indexOf(b.info.status) !== -1) {
      return billingManage(b.info.status === 'past_due' ? 'card' : '');
    }
    return billingSubscribe();
  }
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

// V143 (4A): held because the plan hasn't been read for PLAN_CHECK_DAYS.
function planShowUnchecked() {
  const out = [{ label: 'Check now', style: 'primary', onPick: () => planCheckNow() }];
  if (typeof exportAllOpen === 'function') out.push({ label: 'Export everything', style: 'secondary', onPick: () => exportAllOpen() });
  openChoiceSheet({
    title: 'Plan check needed',
    message: `This phone hasn’t been able to confirm your PATGo plan for ${PLAN_CHECK_DAYS} days, so ${PLAN_LOCKED_WORDS} are paused. Connect to the internet and tap Check now — it only takes a moment. ${PLAN_SAFE_WORDS}`,
    choices: out,
    cancelLabel: 'Close',
  });
}

// V143 (4A): Check now — read the plan, and say what came of it.
function planCheckNow() {
  try { if (navigator.onLine === false) { showToast('No internet connection. Connect and try again.'); return Promise.resolve(false); } } catch (e) { /* assume online */ }
  if (!_planUid()) { showToast('Sign in to check your plan.'); return Promise.resolve(false); }
  showToast('Checking your plan…');
  return planRefresh().then((ok) => {
    if (!ok) { showToast('Couldn’t reach PATGo. Check your connection and try again.'); return false; }
    showToast(planLocked() ? 'Plan checked — your account needs renewing.' : 'Plan confirmed. You can carry on.');
    return true;
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
  if (state.view !== 'sessions' && state.view !== 'cloudAccount' && state.view !== 'cloudSubscription') return;   // V142: + Subscription
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
    .then((c) => c.from('profiles').select('*').eq('id', uid).maybeSingle())   // V143: * — lapsed_at when the database has it, nothing breaks when it doesn't
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
  // V142: back from Stripe's window without word from it (closed by hand, or the
  // message lost) — stop waiting and read the plan as it now stands.
  try {
    if (state.billing && state.billing.pending && (!_billWindow || _billWindow.closed)) billingCancelWait();
  } catch (e) { /* nothing waiting */ }
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

// ============================================================================
// V142 — paying (Stage 13). Locked 21 Oct (Peter): 1A the app's own small
// choice — £60 a year first, or £6 a month — then STRIPE'S page (5A, round 5:
// Stripe-hosted, no card code in the app); 2A the Subscription page (Settings →
// Account & Sync) always shows the plan, and Renew now opens the same choice;
// 3A paying during the trial keeps the rest of it (the server sets Stripe's
// trial end); 4A a failed payment: "Update card", the plan stays while Stripe
// retries; 5A monthly ↔ yearly on Stripe's billing page; 6A Stripe test mode
// on the test site first; 7A the server functions in supabase/functions.
//
// HOW IT FLOWS. A tap opens a window AT ONCE (iOS only allows a window inside
// the tap — the V140 rule), then asks our server function for a Stripe page and
// points the window at it. Stripe comes back to billing-done.html in that
// window, which tells the app (postMessage + BroadcastChannel) and closes. The
// app then re-reads the plan until Stripe's message has reached the database
// (the webhook — usually a second or two). The PLAN is never taken from the
// window: only the database, written by the server after Stripe, says paid.
//
// ⚠ Nothing here holds a card, a Stripe id or a key. The server functions
// refuse anyone but the business's owner, and refuse to send Stripe back to
// anything but this copy's own billing-done.html.

// In memory only, for the account signed in now (another login starts afresh).
function _bill() {
  const uid = _planUid();
  if (!state.billing || state.billing.uid !== uid) {
    state.billing = { uid, info: null, reading: false, readAt: 0, error: '', message: '',
                      pending: '', confirming: false };
  }
  return state.billing;
}

function billingAvailable() {
  try {
    return typeof cloudAvailable === 'function' && cloudAvailable()
      && !!state.cloud && state.cloud.status === 'signed-in' && !!_planUid();
  } catch (e) { return false; }
}

function billingReturnUrl() {
  try { return location.origin + location.pathname.replace(/[^/]*$/, '') + BILLING_RETURN_PAGE; }
  catch (e) { return ''; }
}

function _billOffline() {
  try { return navigator.onLine === false; } catch (e) { return false; }
}

function _billRepaint() {
  if (state.view === 'cloudSubscription' || state.view === 'cloudAccount' || state.view === 'sessions') _planRepaint();
}

// Read the business's plan (my_billing — the signed-in person's own default
// business). Also refreshes the plan record, so paying lifts a lock at once.
function billingRead() {
  if (!billingAvailable()) return Promise.resolve(false);
  const b = _bill();
  if (b.reading) return Promise.resolve(false);
  if (_billOffline()) { b.error = 'offline'; _billRepaint(); return Promise.resolve(false); }
  const uid = b.uid;
  b.reading = true; b.error = '';
  _billRepaint();
  return cloudClient()
    .then((c) => c.rpc('my_billing'))
    .then((res) => {
      if (_planUid() !== uid) return false;          // signed out (or switched) meanwhile
      const info = res && !res.error ? res.data : null;
      if (!info || typeof info !== 'object') { b.error = 'read'; return false; }
      b.info = info; b.readAt = Date.now();
      try { planNote({ plan: info.plan, trial_ends_at: info.trial_ends_at, lapsed_at: info.lapsed_at }); } catch (e) { /* record only */ }
      if (state.cloud) { state.cloud.plan = info.plan || null; state.cloud.trialEndsAt = info.trial_ends_at || null; }
      return true;
    })
    .catch(() => { b.error = 'read'; return false; })
    .then((ok) => { b.reading = false; _billRepaint(); return ok; });
}

// 1A: the choice. £60 a year first (two months free), then £6 a month.
function billingSubscribe() {
  if (!billingAvailable()) return false;
  if (_billOffline()) { showToast('You need a signal to subscribe.'); return false; }
  // 3A: still in the trial → the first payment is the day it ends. The
  // business's own record if read (the page), else this phone's plan record.
  const b = _bill();
  let endMs = NaN;
  if (b.info) {
    if (b.info.plan === 'trial') endMs = _planTime(b.info.trial_ends_at);
  } else {
    const st = planCurrent();
    if (st.phase === 'trial' || st.phase === 'ending') endMs = Number(st.endsAt);
  }
  const first = isFinite(endMs) && endMs > planNow(planRecord()) ? _planDate(endMs) : '';
  openChoiceSheet({
    title: 'Choose your plan',
    message: (first
      ? `Your free trial carries on — the first payment is taken on ${first}. `
      : '')
      + 'Payments are handled by Stripe; PATGo never sees your card. Cancel any time.',
    choices: [
      { label: PLAN_PRICES.year + ' — two months free', style: 'primary', onPick: () => billingCheckout('year') },
      { label: PLAN_PRICES.month, style: 'secondary', onPick: () => billingCheckout('month') },
    ],
    cancelLabel: 'Not now',
  });
  return true;
}

function _billOpenWindow() {
  let w = null;
  try { w = window.open('about:blank', '_blank'); } catch (e) { w = null; }
  if (w) {
    try {
      w.document.title = 'PATGo';
      w.document.body.innerHTML = '<p style="font:16px -apple-system,system-ui,sans-serif;padding:24px">Opening Stripe…</p>';
    } catch (e) { /* not ours to write to — fine */ }
  }
  return w;
}

let _billWindow = null;
let _billListening = false;

function _billCloseWindow() {
  const w = _billWindow;
  _billWindow = null;
  try { if (w && !w.closed) w.close(); } catch (e) { /* gone */ }
}

function _billFinish(message) {
  const b = _bill();
  _billCloseWindow();
  b.pending = '';
  b.message = message || '';
  _billRepaint();
}

// What the server function said when it refused: { error, manage }.
function _billRefusal(err) {
  try {
    const ctx = err && err.context;
    if (ctx && typeof ctx.json === 'function') return ctx.json().catch(() => ({}));
  } catch (e) { /* fall through */ }
  return Promise.resolve({});
}

// Ask a server function for a Stripe page, in the window opened by the tap.
function _billGo(fn, body, w) {
  const b = _bill();
  return cloudClient()
    .then((c) => c.functions.invoke(fn, { body }))
    .then((res) => {
      if (res && res.error) {
        return _billRefusal(res.error).then((said) => {
          // Already subscribed (another phone, or a tap that just landed): the
          // billing page instead, in the same window.
          if (said && said.manage && fn !== 'billing-portal') {
            return _billGo('billing-portal', { returnTo: billingReturnUrl() }, w);
          }
          _billFinish((said && said.error) || 'Couldn’t reach Stripe. Try again in a moment.');
          return false;
        });
      }
      const url = res && res.data && res.data.url;
      if (!url || !/^https:\/\/(checkout|billing)\.stripe\.com\//.test(url)) {
        _billFinish('Couldn’t reach Stripe. Try again in a moment.');
        return false;
      }
      if (!b.pending) return false;                 // Cancelled while we waited
      w.location.href = url;
      return true;
    })
    .catch(() => { _billFinish('Couldn’t reach Stripe. Try again in a moment.'); return false; });
}

function _billStart(kind, fn, body) {
  if (!billingAvailable()) return Promise.resolve(false);
  const b = _bill();
  if (b.pending) return Promise.resolve(false);
  if (_billOffline()) { b.message = 'You need a signal for this.'; _billRepaint(); return Promise.resolve(false); }
  const w = _billOpenWindow();   // ⚠ synchronously, inside the tap
  if (!w) {
    b.message = 'Your phone blocked the Stripe window. Try again.';
    _billRepaint();
    return Promise.resolve(false);
  }
  _billWindow = w;
  _billListen();
  b.pending = kind; b.message = '';
  _billRepaint();
  return _billGo(fn, body, w);
}

function billingCheckout(every) {
  return _billStart('checkout', 'billing-checkout', { every: every === 'month' ? 'month' : 'year', returnTo: billingReturnUrl() });
}

// Manage billing; flow 'card' opens Stripe's card form directly (4A).
function billingManage(flow) {
  const body = { returnTo: billingReturnUrl() };
  if (flow === 'card') body.flow = 'card';
  return _billStart('portal', 'billing-portal', body);
}

function billingCancelWait() {
  _billFinish('');
  return billingRead();
}

function _billListen() {
  if (_billListening) return;
  _billListening = true;
  try { window.addEventListener('message', _billOnMessage); } catch (e) { /* no window */ }
  try {
    if (typeof BroadcastChannel === 'function') {
      const ch = new BroadcastChannel(BILLING_MSG);
      ch.onmessage = (e) => _billOnMessage({ data: e && e.data, origin: location.origin });
    }
  } catch (e) { /* the window message is enough */ }
}

function _billOnMessage(e) {
  if (!e || !e.data || e.data.type !== BILLING_MSG) return;
  try { if (e.origin !== location.origin) return; } catch (x) { return; }
  billingReturned(e.data.result);
}

// billing-done.html said how it went. Only a waiting tap takes it, once.
function billingReturned(result) {
  const b = _bill();
  if (!b.pending) return false;
  const kind = b.pending;
  _billCloseWindow();
  b.pending = '';
  if (result === 'paid' && kind === 'checkout') {
    b.message = 'Payment done — confirming with Stripe…';
    b.confirming = true;
    _billRepaint();
    _billConfirm(0);
    return true;
  }
  b.message = result === 'cancelled' ? 'No payment was taken.' : '';
  _billRepaint();
  billingRead();
  return true;
}

// Stripe tells our server a moment after it sends the person back. Read until
// the business shows as paid, then say so; after the last try, say it's on its way.
function _billConfirm(i) {
  const b = _bill();
  billingRead().then(() => {
    if (!b.confirming) return;
    const paid = b.info && (b.info.plan === 'active' || b.info.plan === 'comped');
    if (paid) {
      b.confirming = false;
      b.message = 'You’re subscribed. Thank you!';
      _billRepaint();
      return;
    }
    if (i + 1 >= BILLING_CONFIRM_DELAYS.length) {
      b.confirming = false;
      b.message = 'Stripe has your payment; it can take a minute to show here. Pull down or reopen this page to check.';
      _billRepaint();
      return;
    }
    setTimeout(() => _billConfirm(i + 1), BILLING_CONFIRM_DELAYS[i + 1]);
  });
}

// ---- the Subscription page's words (markup: render-help.js) -----------------
// Pure: what the page says for an account and its billing record.
//   kind: off | signedOut | checking | comped | member | subscribed | trial | ended
function billingView() {
  const out = { kind: 'off', title: '', lines: [], actions: [], note: '' };
  try {
    if (!(typeof cloudAvailable === 'function' && cloudAvailable())) return out;
    if (!billingAvailable()) { out.kind = 'signedOut'; return out; }
    const b = _bill();
    const st = planCurrent();
    const info = b.info;
    if (!info) {
      out.kind = 'checking';
      out.title = 'Your plan';
      out.lines.push(b.error === 'offline' ? 'No signal right now — your plan will show when you’re back online.'
        : b.error ? 'Couldn’t check your plan just now.' : 'Checking your plan…');
      const line = planLineText(st);
      if (line) out.lines.push(line);
      return out;
    }
    const date = (iso) => { const ms = _planTime(iso); return isFinite(ms) ? _planDate(ms) : ''; };
    if (info.plan === 'comped') {
      out.kind = 'comped';
      out.title = 'Free';
      out.lines.push('Your account doesn’t need a plan — nothing is charged.');
      return out;
    }
    if (!info.can_manage) {
      out.kind = 'member';
      out.title = info.plan === 'active' ? 'Paid' : info.plan === 'trial' ? 'Free trial' : 'Plan ended';
      out.lines.push('Your business’s owner looks after its plan.');
      return out;
    }
    const live = info.has_subscription && ['trialing', 'active', 'past_due'].indexOf(info.status) !== -1;
    if (live) {
      out.kind = 'subscribed';
      out.title = info.interval === 'month' ? 'Monthly — ' + PLAN_PRICES.month : 'Yearly — ' + PLAN_PRICES.year;
      const end = date(info.period_end);
      if (info.status === 'past_due') {
        out.lines.push('Your last payment didn’t go through. Stripe will try again over the next few days — update your card to keep things running.');
        out.actions.push('card');
      } else if (info.cancel_at_period_end) {
        out.lines.push(end ? `Cancelled — your plan runs until ${end}.` : 'Cancelled — your plan runs to the end of what you’ve paid for.');
      } else if (info.status === 'trialing') {
        out.lines.push(end ? `Free until ${end}, when the first payment is taken.` : 'Your free trial carries on until it ends, then the first payment is taken.');
      } else if (end) {
        out.lines.push(`Renews on ${end}.`);
      }
      out.actions.push('manage');
      return out;
    }
    if (info.plan === 'trial') {
      out.kind = 'trial';
      out.title = 'Free trial';
      const end = date(info.trial_ends_at);
      if (st.phase === 'grace' || st.phase === 'locked') out.lines.push(planLineText(st));
      else if (end) out.lines.push(`Your free trial ends on ${end}. Subscribe now and you keep the rest of your free days.`);
      out.actions.push('subscribe');
      return out;
    }
    out.kind = 'ended';
    out.title = 'Plan ended';
    const line = planLineText(st);
    out.lines.push(line || 'Your PATGo plan has ended. Subscribe to carry on.');
    out.actions.push('subscribe');
    if (info.has_customer) out.actions.push('manage');   // past invoices
    return out;
  } catch (e) { return out; }
}

// The Settings list's line for the Subscription row.
function billingRowStatus() {
  try {
    if (!billingAvailable()) return '';
    const st = planCurrent();
    const b = _bill();
    if (st.phase === 'locked') return 'Locked — renew';
    if (st.unchecked) return 'Check needed';     // V143 (4A)
    if (st.phase === 'grace') return 'Ended — renew';
    const rec = planRecord();
    if (rec && rec.plan === 'comped') return 'Free';
    if (st.phase === 'paid') return b.info && b.info.interval === 'month' ? 'Monthly' : b.info && b.info.interval === 'year' ? 'Yearly' : 'Paid';
    if (st.phase === 'trial' || st.phase === 'ending') return 'Free trial';
  } catch (e) { /* nothing */ }
  return '';
}

// (c) 2026 Peter Birchley. All rights reserved.
