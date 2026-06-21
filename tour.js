// tour.js — V42 guided feature walkthrough
// (c) 2026 Peter Birchley. All rights reserved.
//
// A SELF-CONTAINED, full-screen tour (decision 6-i). It does NOT sit on top of
// the live, scrolling, re-rendering app and it does NOT try to measure or point
// at real on-screen elements (the fragile iOS-PWA coachmark path we deliberately
// avoided). Instead each slide renders a small, static HTML/CSS MOCK of the
// screen it is teaching, with the key control highlighted right there in the
// mock, plus a caption. The user taps the arrow to advance.
//
// Because every highlighted thing is a mock we control — not the live DOM — the
// tour never mis-measures, never has to navigate the real app mid-tour, and
// never drifts when a real screen is later redesigned. The mocks reuse the app's
// own colour variables (via .tour-* CSS) so they read as "the app" for free.
//
// State: state.tourOpen (bool) + state.tourStep (0-based index into TOUR_SLIDES).
// Both transient — never persisted, never in backups. The tour keeps no data.
//
// Entry points:
//   • End of first-run setup — the wizard's final step offers "Show me around".
//   • Replay any time — About page → "Show me around the app again".
// Leaving the tour (finish, or the × / Skip) just closes it and drops the user
// on the Sessions screen via setView('sessions').

// ---------- Slide content (decision 8A: 5 slides) ----------
// Each slide: { key, title, caption, mock } where mock is an HTML string built
// from the .tour-* mock classes. Keeping the copy here (not in config) because
// it is tour-only presentation text, tightly coupled to its mock.
const TOUR_SLIDES = [
  {
    key: 'sessions',
    title: 'Sessions',
    caption: 'Every job is a “session”. Tap <strong>New session</strong> to start one — give it a client or a site and you’re testing.',
    mock: () => `
      <div class="tour-screen">
        <div class="tour-bar">PATGo</div>
        <button class="tour-cta tour-hl">+ New session</button>
        <div class="tour-row">
          <div>
            <div class="tour-row-title">Riverside Café</div>
            <div class="tour-row-sub">12 items · today</div>
          </div>
          <span class="tour-chip tour-chip-ok">All pass</span>
        </div>
        <div class="tour-row">
          <div>
            <div class="tour-row-title">Unit 4, Mill Road</div>
            <div class="tour-row-sub">8 items · yesterday</div>
          </div>
          <span class="tour-chip tour-chip-warn">1 fail</span>
        </div>
      </div>`
  },
  {
    key: 'quickpick',
    title: 'Quick Pick & logging',
    caption: 'Type the location once, pick an item type, then tap the big <strong>PASS</strong> (or FAIL) button. The item types reorder to put your usual ones first.',
    mock: () => `
      <div class="tour-screen">
        <div class="tour-bar">Riverside Café</div>
        <div class="tour-field-label">ASSET NUMBER</div>
        <input class="tour-input" value="26" readonly>
        <div class="tour-field-label">LOCATION <span class="tour-field-hint">(carried from last)</span></div>
        <input class="tour-input tour-input-strong" value="Kitchen" readonly>
        <div class="tour-field-label">ITEM TYPE</div>
        <div class="tour-qp-grid">
          <button class="tour-qp">Kettle</button>
          <button class="tour-qp">Toaster</button>
          <button class="tour-qp">Microwave</button>
          <button class="tour-qp">Fridge</button>
          <button class="tour-qp">Mixer</button>
          <button class="tour-qp">Lamp</button>
        </div>
        <div class="tour-passfail">
          <button class="tour-pf tour-pf-pass tour-hl">✓ PASS</button>
          <button class="tour-pf tour-pf-fail">✕ FAIL</button>
        </div>
      </div>`
  },
  {
    key: 'overview',
    title: 'Overview',
    caption: 'See everything you’ve tested in this job at a glance, with a running pass/fail count. Failed items are flagged in red so nothing slips through.',
    mock: () => `
      <div class="tour-screen">
        <div class="tour-bar">Overview</div>
        <div class="tour-ov-summary">25 items · <span class="tour-ov-pass">21 pass</span> · <span class="tour-ov-fail">4 fail</span> · Riverside Café</div>
        <div class="tour-ov-btnrow">
          <button class="tour-ov-btn">Select items</button>
          <button class="tour-ov-btn">Session settings</button>
        </div>
        <input class="tour-input" value="" placeholder="Search asset, location, item…" readonly>
        <div class="tour-ov-table tour-hl">
          <div class="tour-ov-head"><span>#</span><span>ITEM</span><span>RESULT</span></div>
          <div class="tour-ov-trow"><span>1</span><span>Kettle</span><span class="tour-ov-rpass">Pass</span></div>
          <div class="tour-ov-trow"><span>2</span><span>Toaster</span><span class="tour-ov-rpass">Pass</span></div>
          <div class="tour-ov-trow"><span>3</span><span>Extension lead</span><span class="tour-ov-rfail">Fail</span></div>
          <div class="tour-ov-trow"><span>4</span><span>Desk lamp</span><span class="tour-ov-rpass">Pass</span></div>
        </div>
      </div>`
  },
  {
    key: 'reports',
    title: 'Reports',
    caption: 'Turn a finished job into a branded PDF report — your logo, your colours — ready to hand to the client.',
    mock: () => `
      <div class="tour-screen">
        <div class="tour-bar">Riverside Café</div>
        <div class="tour-doc">
          <div class="tour-doc-head">Your Company Ltd</div>
          <div class="tour-doc-title">Portable Appliance Test Report</div>
          <div class="tour-doc-line"></div>
          <div class="tour-doc-line short"></div>
          <div class="tour-doc-line"></div>
        </div>
        <button class="tour-cta tour-hl">📄 Produce report</button>
      </div>`
  },
  {
    key: 'backup',
    title: 'Back up your data',
    caption: 'Everything lives on <strong>this phone</strong> — there’s no cloud. Take a backup now and then so your work is safe.',
    mock: () => `
      <div class="tour-screen">
        <div class="tour-bar">Backup &amp; Restore</div>
        <button class="tour-cta tour-hl">⬇ Back up now</button>
        <button class="tour-cta tour-cta-ghost">⬆ Restore from a backup</button>
        <div class="tour-note">Your last backup: never — take one today.</div>
      </div>`
  }
];

// ---------- Control ----------

// Open the tour at the first slide. Sets the dedicated 'tour' view so render()
// hands the whole screen to renderTour(). Safe to call from anywhere (setup
// finish, About replay).
function openTour() {
  state.tourOpen = true;
  state.tourStep = 0;
  state.view = 'tour';
  render();
}

// Advance / retreat. Clamped; advancing past the last slide finishes the tour.
function tourNext() {
  if (!state.tourOpen) return;
  if (state.tourStep >= TOUR_SLIDES.length - 1) { closeTour(); return; }
  state.tourStep += 1;
  render();
}

function tourPrev() {
  if (!state.tourOpen) return;
  if (state.tourStep > 0) state.tourStep -= 1;
  render();
}

// Jump straight to a slide by index (the dot indicator taps).
function tourGoTo(i) {
  if (!state.tourOpen) return;
  const n = parseInt(i, 10);
  if (Number.isFinite(n) && n >= 0 && n < TOUR_SLIDES.length) {
    state.tourStep = n;
    render();
  }
}

// Close the tour (finish, Skip, or ×) and land on the Sessions list. The tour is
// stateless, so there is nothing to persist — just drop the flags and navigate.
function closeTour() {
  state.tourOpen = false;
  state.tourStep = 0;
  setView('sessions');
}

// ---------- Render ----------
// Full-screen view (not a modal/overlay): render() routes 'tour' here and this
// owns the whole #app for the duration. One slide at a time; tap-arrow paging.
function renderTour() {
  const total = TOUR_SLIDES.length;
  let step = state.tourStep || 0;
  if (step < 0) step = 0;
  if (step > total - 1) step = total - 1;
  const slide = TOUR_SLIDES[step];
  const isLast = step === total - 1;
  const isFirst = step === 0;

  const dots = TOUR_SLIDES.map((s, i) =>
    `<button class="tour-dot${i === step ? ' tour-dot-on' : ''}" data-action="tour-goto" data-arg="${i}" aria-label="Go to ${escapeHTML(s.title)}"></button>`
  ).join('');

  return `
    <div class="tour-wrap" role="dialog" aria-label="App walkthrough">
      <div class="tour-top">
        <span class="tour-counter">${step + 1} / ${total}</span>
        <button class="tour-x" data-action="tour-skip" aria-label="Close walkthrough">✕</button>
      </div>

      <div class="tour-stage">
        <div class="tour-mock">${slide.mock()}</div>
      </div>

      <div class="tour-caption">
        <h2 class="tour-caption-title">${escapeHTML(slide.title)}</h2>
        <p class="tour-caption-text">${slide.caption}</p>
      </div>

      <div class="tour-dots">${dots}</div>

      <div class="tour-nav">
        <button class="tour-prev" data-action="tour-prev" ${isFirst ? 'style="visibility:hidden"' : ''} aria-label="Previous">‹ Back</button>
        <button class="btn-primary tour-next" data-action="tour-next">${isLast ? 'Done' : 'Next ›'}</button>
      </div>
    </div>
  `;
}
