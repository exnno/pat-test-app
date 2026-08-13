/*!
 * PATGo PWA
 * v70 (August 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PATGo PWA — v70 — First-run onboarding ==============
// Extracted from session.js in V70. Every top-level function here is BYTE
// IDENTICAL to its V69 form — the release is a move, not a rewrite.
//
// What lives here: the first-run wizard state machine (step capture, paging,
// the fresh/import path fork, theme pick, demo toggle, finish and skip), the
// restart entry point, and the example-session seed the wizard can plant.
//
// What does NOT live here: the wizard's MARKUP (render-core.js), the setup
// bundle import it delegates to (setup.js), or the guided walkthrough it can
// hand off to at the end (tour.js).
//
// ⚠ captureWizardStep() is the last legacy writer of the instrument flat mirror
// (MAP rule 7) and must keep calling adoptMirrorIntoInstruments(). That coupling
// moved with it and is easy to lose sight of now it lives in a small file.
//
// Load position: immediately after tour.js, next to the walkthrough it launches.

// ---------- First-run wizard (v33; commercial onboarding rebuilt in v42) ----------
// Shown only on a genuinely blank install (gated in storage.load via
// state.onboardedV33Seen). v42 turns the old 3-step screen into a proper guided
// commercial setup, FRESH path:
//   1 intro → 2 choose path → 3 your details → 4 company / report branding
//   → 5 add an example session? → 6 all set (offer the walkthrough)
// The IMPORT path still jumps straight out (onboardSetupImport). Skippable at
// every step. Completing or skipping sets ONBOARD_KEY so it never returns.
// ONBOARD_KEY is unchanged (pat:onboardedV33) so an upgrading user who already
// passed the old wizard is NOT re-onboarded.
const WIZARD_LAST_STEP = 6;   // fresh-path final step (the "all set" screen)

// Capture whatever the CURRENT step's inputs hold into state, so paging back and
// forward (or finishing) never loses what was typed. Called before any step
// transition. Each lookup is guarded, so it is safe on any step.
function captureWizardStep() {
  const nameEl = document.getElementById('wizard-engineer');
  const calEl  = document.getElementById('wizard-caldate');
  const coEl   = document.getElementById('wizard-company');
  if (nameEl) {
    state.engineer = (nameEl.value || '').trim();
    state.newForm.engineer = state.engineer;
  }
  // v66: the wizard is a LEGACY WRITER of the flat mirror — it still sets
  // state.calDate directly, so it must push that into the instruments list or
  // the next sync silently discards it.
  if (calEl && calEl.value) {
    state.calDate = calEl.value;
    if (typeof adoptMirrorIntoInstruments === 'function') adoptMirrorIntoInstruments();
  }
  if (coEl && state.reportSettings) state.reportSettings.companyName = coEl.value.trim();
}

// Mark onboarding finished (completed or skipped) and drop into the app.
function finishOnboarding() {
  state.onboardedV33Seen = true;
  localStorage.setItem(ONBOARD_KEY, '1');
  state.wizardStep = 1;
  state.wizardPath = '';
  state.wizardSeedDemo = false;
  state.view = 'sessions';
  render();
}

// Skip from any step — same as finishing, no data captured beyond what the user
// already committed on earlier steps (their typed name/company survive because
// each step is captured on transition; a skip just stops asking for more).
function skipOnboarding() {
  finishOnboarding();
}

// Step 2 records the chosen path; "import" opens the picker (handled in dispatch
// via the hidden input), "fresh" advances into the guided setup at step 3.
function wizardChoosePath(path) {
  state.wizardPath = path;
  if (path === 'fresh') {
    state.wizardStep = 3;
    render();
  }
  // 'import' is handled by the file input in dispatch; nothing to render here.
}

// Forward one step on the fresh path (steps 3→4→5→6). Captures the current
// step's inputs first. Step 6 is the terminal "all set" screen — wizardNext from
// there is not wired (finish/tour buttons take over).
function wizardNextStep() {
  captureWizardStep();
  if (state.wizardStep < WIZARD_LAST_STEP) state.wizardStep += 1;
  render();
}

function wizardBack() {
  captureWizardStep();
  if (state.wizardStep <= 1) return;
  // From step 3 (first fresh step) back lands on the path chooser (step 2) and
  // clears the chosen path so the chooser shows fresh. From any later fresh step
  // just step back one.
  if (state.wizardStep === 3) {
    state.wizardStep = 2;
    state.wizardPath = '';
  } else {
    state.wizardStep -= 1;
  }
  render();
}

// Step 5 toggle: include an example session on finish (decision 9A).
function wizardToggleDemo(on) {
  state.wizardSeedDemo = !!on;
}

// Apply the branding theme chip on step 4 (reuses the report colour themes). In
// memory only here; persisted by save() at finish. Captures the company-name
// input first so it survives the re-render the chip selection triggers.
function wizardPickTheme(themeId) {
  captureWizardStep();
  const theme = (typeof REPORT_COLOR_THEMES !== 'undefined' ? REPORT_COLOR_THEMES : [])
    .find(t => t.id === themeId);
  if (theme && state.reportSettings) {
    state.reportSettings.headerColor = theme.header;
    state.reportSettings.accentColor = theme.accent;
  }
  render();
}

// Finish the FRESH guided setup. Captures the final step, persists everything,
// optionally seeds the example session, then either opens the walkthrough (7A:
// "Show me around") or drops the user on the Sessions list. `withTour` true =>
// open the tour after onboarding completes.
function wizardFinishFresh(withTour) {
  captureWizardStep();
  // Seed the example session BEFORE finishing so it exists when we land/tour.
  if (state.wizardSeedDemo) seedDemoSession();
  save();                 // persists engineer, calDate, reportSettings (branding)
  finishOnboarding();     // sets ONBOARD_KEY, resets wizard, view = sessions, renders
  if (withTour) openTour();
}

// Setup import launched from the wizard. Reuses the standard importSetupFromFile
// (validate, confirm, apply, save), but marks onboarding complete first so the
// user lands in the app rather than the wizard after import. Only called once a
// file is actually chosen (cancelling the OS picker leaves onboarding pending).
function onboardSetupImport(file) {
  if (!file) return;
  state.onboardedV33Seen = true;
  localStorage.setItem(ONBOARD_KEY, '1');
  state.wizardStep = 1;
  state.wizardPath = '';
  state.wizardSeedDemo = false;
  importSetupFromFile(file);   // handles confirm/apply/save/render itself
}

// "Run first-time setup again" (Help). Clears the flag and reopens the wizard.
function restartOnboarding() {
  state.onboardedV33Seen = false;
  localStorage.removeItem(ONBOARD_KEY);
  state.wizardStep = 1;
  state.wizardPath = '';
  state.wizardSeedDemo = false;
  render();
}

// ---------- v42: example (demo) session seed ----------
// Builds ONE clearly-labelled example session so a brand-new fresh install isn't
// empty on first open (decision 9A). It is an ordinary session in every respect
// — same shape as createSession() produces — plus the DEMO_SESSION_FLAG marker
// (a harmless passthrough field the codec/CSV/report/backup ignore) so the UI
// can label it "Example" and the user knows it is safe to delete. Items mirror
// the saveItem() shape exactly ({id, assetNo, location, itemType, notes,
// result, ts?}) so Overview, CSV and reports all render it like real data.
function seedDemoSession() {
  const eng = (state.engineer || '').trim();
  // v61: the demo items stamp unconditionally too, so the example job matches
  // the shape of real data (and so a brand-new user's first look at the Session
  // settings screen shows a testing time rather than a gap).
  const stamp = new Date().toISOString();
  const now = new Date().toISOString();
  const mk = (assetNo, location, itemType, result, notes) => {
    const it = { id: uid(), assetNo, location, itemType, notes: notes || '', result };
    if (stamp) it.ts = stamp;
    return it;
  };
  const s = {
    id: uid(),
    name: 'Example job',
    site: 'Example Client — Example Site',
    clientId: '',
    siteId: '',
    engineer: eng,
    prefix: '',
    date: todayISO(),
    startNumber: 1,
    items: [
      mk('001', 'Kitchen', 'Kettle', 'pass'),
      mk('002', 'Kitchen', 'Toaster', 'pass'),
      mk('003', 'Office', 'Monitor', 'pass'),
      mk('004', 'Office', 'Extension lead', 'fail', 'Damaged outer sheath'),
      mk('005', 'Office', 'Desk lamp', 'pass')
    ],
    locked: false,
    notes: 'This is an example session to show how the app works. Delete it any time.',
    certNo: '',
    [DEMO_SESSION_FLAG]: true,
    // v43: sync metadata for demo session
    userId: null,
    lastModified: now,
    syncedAt: null
  };
  state.sessions.unshift(s);
  // No activeId/cursor change and no nav — the user lands on the Sessions list
  // (or the tour) and can tap in when ready. saveSessions runs via save() in the
  // finish path.
}
