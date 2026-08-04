/*!
 * PATGo PWA — config.js (constants & defaults)
 * v53 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 *
 * All app-wide constants: version label, localStorage key names, default
 * lists (item types, fail reasons, descriptions, CSV columns) and the
 * resistance-calculator lookup tables. Pure data — no functions, no state.
 * Loaded first; everything else may reference these globals.
 */

const APP_VERSION = 'V66';

const STORAGE_KEY = 'pat:sessions';
const ACTIVE_KEY = 'pat:active';
const ITEMS_KEY = 'pat:itemtypes';        // legacy (pre-v9). Read for migration.
const FAIL_REASONS_KEY = 'pat:failreasons';
const ENGINEER_KEY = 'pat:engineer';
const DESCRIPTIONS_KEY = 'pat:descriptions';
const SORT_KEY = 'pat:sort';
const THEME_KEY = 'pat:theme';            // v7: 'system' | 'light' | 'dark'
const HAPTICS_KEY = 'pat:haptics';        // v7: '1' | '0'
const ITEM_PRESETS_KEY = 'pat:itempresets';     // v9: JSON [{id,name,items:[...]}]
const ACTIVE_PRESET_KEY = 'pat:activepreset';   // v9: preset id

// v11: new persistence keys.
//   LAST_BACKUP_KEY     — ISO timestamp of last successful JSON backup export.
//                         Drives the 7-day reminder banner on the Sessions list.
//   BACKUP_SNOOZE_KEY   — ISO timestamp until which the reminder is suppressed.
//                         Set to now + 24h when the user taps "Remind me later"
//                         or dismisses the banner.
//   CSV_COLUMNS_KEY     — JSON array of {id, header, visible} configuring the
//                         CSV export. See DEFAULT_CSV_COLUMNS below.
//   TESTER_KEY, CAL_*   — Optional tester type + calibration info shown on the
//                         User Settings page. v12 update: these now also flow
//                         through to CSV exports via four new default-hidden
//                         columns. Toggle in Settings → CSV Columns.
// v12: WELCOME_KEY renamed from pat:v11welcome → pat:v12welcome. The new modal
//                  fires for everyone again. The old key (if present in storage
//                  from v11 users) is orphaned and harmless — we don't bother
//                  cleaning it up since it's a single string-valued flag.
// v13: tester split into manufacturer + model — two new keys replace
//                  TESTER_KEY. The old key is read once during migration
//                  (loadV11Settings) and its value is dumped into
//                  testerModel (since the existing field was free-form and
//                  the model name is the more specific bit users tend to
//                  recall). Old key is then cleared. WELCOME_KEY rolled
//                  forward to pat:v13welcome for the new modal.
const LAST_BACKUP_KEY = 'pat:lastbackup';
const BACKUP_SNOOZE_KEY = 'pat:backupsnooze';
const CSV_COLUMNS_KEY = 'pat:csvcolumns';
const TESTER_KEY = 'pat:tester';            // v13: legacy. Read for migration only.
const TESTER_MAKE_KEY = 'pat:testermake';   // v13
const TESTER_MODEL_KEY = 'pat:testermodel'; // v13
const CAL_DATE_KEY = 'pat:caldate';
const CAL_CERT_KEY = 'pat:calcert';
const CAL_DUE_KEY = 'pat:caldue';

// v66: multiple test instruments. The five keys above are NOT retired — they
// remain the persisted mirror of whichever instrument is ACTIVE, so the legacy
// load/save path in storage.js is untouched and old backups still restore.
// The list itself is the source of truth and lives here.
//   INSTRUMENTS_KEY        JSON array of { id, make, model, calDate,
//                          calCertNo, calDue }
//   ACTIVE_INSTRUMENT_KEY  the id of the instrument new jobs are stamped with
// ⚠ Absence of INSTRUMENTS_KEY means "pre-v66, migrate the flat fields". An
// EMPTY ARRAY means "the user deleted them all" — the two must stay
// distinguishable or emptying the list resurrects it on next launch. See
// loadInstruments() in instruments.js.
const INSTRUMENTS_KEY = 'pat:instruments';
const ACTIVE_INSTRUMENT_KEY = 'pat:activeinstrument';

// Cap on saved instruments (decision 6A). Enough for a sole trader with a spare
// and a loaner; keeps the list a list rather than a database.
const INSTRUMENTS_MAX = 5;
// ---------- Welcome-modal "seen" key (v63: DERIVED, not version-named) ----------
//
// ⚠ READ THIS BEFORE ROLLING A WELCOME MODAL. It is now a ONE-LINE edit, in this
// file only. Nothing else in the codebase ever needs to change again.
//
// THE PROBLEM V63 FIXED. Up to v62 the key was a version-NAMED identifier
// (`V62_WELCOME_KEY`), and that identifier was written into SIX files: here,
// storage.js (reads it in load()), state.js (its matching flag), dispatch.js
// (passes it to dismissWelcome), boot.js (the integrity guard) and render-core.js
// (the modal gate). All six had to roll together, every single feature release.
//
// Land them out of step — one file not committed, or one still served from a
// stale service-worker cache — and storage.js referenced an identifier config.js
// no longer declared. A bare undeclared identifier throws a ReferenceError, it
// threw INSIDE load(), and nothing caught it. That is the V61 white screen.
// v61.2 added the boot guard, which helped, but it only moved the coupling from
// five files to six: a stale boot.js checks the OLD name, passes happily, and
// load() still throws.
//
// THE FIX. The identifier names are now FIXED FOREVER — `WELCOME_KEY` here,
// `state.welcomeSeen` in state.js. Only a string VALUE changes between releases,
// and a wrong string cannot throw. The worst a mismatch can now do is show or
// suppress a "what's new" modal. It can no longer stop the app opening.
//
// WELCOME_VERSION is deliberately its own constant rather than being derived from
// APP_VERSION, because most releases roll a version WITHOUT rolling a welcome —
// hotfixes and structural releases like V63 itself. Deriving from APP_VERSION
// would re-show the last modal to everyone who had already dismissed it, every
// time. So: bump this ONLY on a release that genuinely ships a new welcome, and
// leave it alone otherwise.
//
// TO ROLL A WELCOME: change WELCOME_VERSION below to the new release, and write
// the new copy in render-core.js. That is the whole job.
//
// v64 rolls it to 'V64' — the first roll under the v63 design, and it is the ONLY
// line that changes to do it (plus the copy in render-core.js). The key becomes
// 'pat:v64welcome'; nothing else in the codebase names a version.
const WELCOME_VERSION = 'V66';
const WELCOME_KEY = 'pat:' + WELCOME_VERSION.toLowerCase() + 'welcome';

// v47: how long (ms) to hold the quick-pick grid before the preset switcher
// sheet opens. Deliberately a single named constant so the threshold can be
// tuned in one edit.
// v58: dropped 2000 → 1000 for field testing. 2000ms was a long hold for touch
// and made the gesture feel unresponsive. The two guards that stop an accidental
// open are unchanged and independent of this number: the 12px drift slop in
// events.js aborts the timer if the finger moves (so scrolling can't trigger it),
// and the capture-phase click swallow eats the tap that follows a fired
// long-press. If 1000 proves too eager in the field, ~1400 is the next step down
// in aggression; ~600 is the usual long-press sweet spot if it still feels slow.
const QUICK_PICK_LONGPRESS_MS = 1000;

// ---------------------------------------------------------------------------
// v59: lifetime stats counter (the muted line under the Settings hub footer).
//
// THE DESIGN, in one paragraph, because the "why" is the whole point:
// the figure shown = LIVE (counted from the sessions currently in the app) plus
// ARCHIVED (a small persisted bucket). Nothing is counted per-item as it's
// logged. Instead, at the two — and only two — points where a session leaves the
// app for good (deleteSession, pruneOldSessions), that session's tallies are
// added into the bucket FIRST, then the session goes. That gives a running total
// that survives pruning without any of the failure modes a per-item counter has:
// no double-counting when an item is edited, no drift when a session is edited,
// and no gap for CSV-imported sessions (they simply appear in the live half).
// There are exactly four places state.sessions is reassigned — load, restore,
// prune, delete — and the latter two are the hooks, so no path is unaccounted
// for.
//
// Bucket shape: { items: int, fails: int, types: { 'Kettle': 12, … } }.
const PAT_STATS_KEY = 'pat:archivedStats';

// Cap on how many item-type names the archived bucket keeps. Only the top N by
// count are retained on write; the tail is dropped. A dropped entry can never
// win "most common" (it's by definition rarer than 50 others), and the cap stops
// a one-off typo'd item type living in localStorage forever.
const STATS_TYPE_MAP_MAX = 50;

// The starting bucket for a user who has never had one — also the shape the
// validator falls back to when stored data is missing or garbage. A factory, not
// a shared object, so callers can't mutate the default (same pattern as
// makeDefaultReportSettings).
function makeEmptyArchivedStats() {
  return { items: 0, fails: 0, types: {} };
}
// ---------------------------------------------------------------------------
// v60: one-tap bug report (Settings → Contact).
//
// WHY mailto AND NOT A NETWORK POST: the app is offline-first and engineers are
// usually in a plant room, a riser cupboard or a basement when something breaks
// — i.e. exactly where an HTTP POST would fail. A mailto: hands the composed
// message to the device's own mail client, which queues it in the outbox and
// sends it when signal returns. The bug report therefore cannot be lost by
// being offline, which is the whole point.
const BUG_REPORT_EMAIL = 'hello@patgo.co.uk';

// The three report types. `tag` is what lands in the SUBJECT line, so the inbox
// can be sorted/filtered by type without opening anything.
const BUG_REPORT_TYPES = [
  { id: 'bug',      label: 'Bug',      tag: 'BUG' },
  { id: 'idea',     label: 'Idea',     tag: 'IDEA' },
  { id: 'feedback', label: 'Feedback', tag: 'FEEDBACK' }
];
const BUG_REPORT_TYPE_DEFAULT = 'bug';

// Severity — BUG reports only. Deliberately plain language on screen (no P1/P2
// jargon in front of an engineer); the short code is what goes in the subject
// line for triage.
const BUG_REPORT_SEVERITIES = [
  { id: 'p1', code: 'P1', label: "The app won't work — I can't carry on testing" },
  { id: 'p2', code: 'P2', label: "It works, but something's wrong or annoying" },
  { id: 'p3', code: 'P3', label: 'Small thing — looks wrong, not urgent' }
];
const BUG_REPORT_SEVERITY_DEFAULT = 'p2';

// "Can you make it happen again?" — one tap, and the single most useful triage
// signal there is: "every time" and "happened once" are different problems.
const BUG_REPORT_REPRO = [
  { id: 'yes',   label: 'Every time',   text: 'Yes — happens every time' },
  { id: 'no',    label: 'Just once',    text: 'No — only happened once' },
  { id: 'unsure', label: "Haven't tried", text: "Not tried to repeat it" }
];
const BUG_REPORT_REPRO_DEFAULT = 'unsure';

// Minimum characters in the description before Send unlocks. Stops a stray tap
// firing an empty report; low enough not to nag.
const BUG_REPORT_MIN_CHARS = 10;

// How many recent runtime errors the in-memory catcher keeps (v60, decision
// 10A). IN MEMORY ONLY — never written to localStorage, so it cannot grow, cannot
// corrupt a save, and is gone on reload. Three is enough to show the original
// throw plus the fallout it caused.
const BUG_ERROR_BUFFER_MAX = 3;

// Hard cap on the assembled mailto: body. Mail clients vary in what length of
// mailto they'll accept; keeping the payload well under any of them matters more
// than carrying a long essay. The description is truncated, never the
// diagnostics, because the diagnostics are the part the user can't retype.
const BUG_REPORT_MAX_BODY = 4000;

// The empty report draft. A factory rather than a shared object (same reason as
// makeEmptyArchivedStats / makeDefaultReportSettings — callers mutate it freely,
// so they must each get their own). Lives HERE and not in bugreport.js because
// state.js seeds state.bugDraft from it at load time, and state.js runs long
// before bugreport.js is parsed; config.js is loaded first, so this is the only
// safe home for it.
function makeEmptyBugDraft() {
  return {
    type: BUG_REPORT_TYPE_DEFAULT,
    severity: BUG_REPORT_SEVERITY_DEFAULT,
    repro: BUG_REPORT_REPRO_DEFAULT,
    description: '',
    context: '',
    cacheName: ''
  };
}

// ---------------------------------------------------------------------------
// v60: leading zeros in asset numbers (decisions 6B / 7 / 8A).
//
// Cap on the digit width the auto-increment will pad to. Guards against a
// pathological stored value (e.g. a hand-edited backup claiming a width of
// 5000) turning every asset number into a wall of zeros. Real jobs use 3–4.
const ASSET_PAD_MAX = 12;

// ---------------------------------------------------------------------------
// v61: cross-session asset history (decisions Q2A / Q3A / Q4A / Q5C).
//
// How many DIFFERENT jobs must contain the same asset number before the
// Sessions search offers the consolidated history view. Two is the point at
// which "open the job" stops being good enough — one job you can just open; two
// or more is when piecing the history together by hand starts to hurt.
const ASSET_HISTORY_MIN_JOBS = 2;

// Cap on how many past instances the history sheet renders. A pathological case
// (the same asset number typed onto hundreds of items) must not build a wall of
// DOM inside a bottom sheet on a phone. The sheet says so plainly when it trims.
const ASSET_HISTORY_MAX_ROWS = 60;

// ---------------------------------------------------------------------------
// v61: testing time (decisions Q7A / Q8A / Q9A / Q10 / Q11B).
//
// ⚠ THE CAPTURE/EXPOSURE SPLIT — READ THIS BEFORE TOUCHING item.ts.
//
// Before v61, the "Item Timestamps" setting (TIMESTAMPS_KEY) gated BOTH capture
// and display: with it off, no `ts` was ever written and the stored item shape
// was byte-for-byte what it had been before timestamps existed. That guarantee
// is deliberately GONE as of v61.
//
// From v61: `ts` is stamped on EVERY item's first log, always, regardless of the
// setting. The setting now gates EXPOSURE ONLY — whether the Time column appears
// in the CSV. Nothing else about it changed.
//
// WHY: testing time is computed from `ts`, and a derived figure nobody can see
// unless they found and enabled an unrelated setting years ago is not a feature.
// Capture is cheap (`ts` is codec-mapped to a single character in storage.js, so
// roughly 30 bytes an item — a thousand items is ~30 KB of a 5 MB budget) and it
// compounds: every day capture is on is another day of history to compute from.
//
// CONSEQUENCE worth knowing: someone who has always had Item Timestamps off and
// later switches it on will find the CSV Time column populated for everything
// logged since v61, not just from the moment they flipped it. That is an
// improvement, but it looks like the setting acted retrospectively — so it is
// called out in the v61 welcome copy and the handoff rather than left to
// surprise someone.

// A session whose first and last stamps fall on different calendar days doesn't
// have a meaningful elapsed time — a job reopened two days later would read
// "26h 14m", which is worse than useless. Past this many distinct days we label
// the span instead of timing it (decision Q9A).
const DURATION_MULTIDAY_MIN_DAYS = 2;

// Below this, elapsed time is noise rather than information (two items logged
// forty seconds apart). Shown as "under a minute" rather than "0m".
const DURATION_MIN_MS = 60 * 1000;
// v42: the opt-in demo session created on the FRESH onboarding path (decision
// 9A). Tagged with this flag on the session object so the app can label it as an
// example and the user knows it is safe to delete. It is a perfectly ordinary
// session in every other respect (rides through the codec, CSV, reports and
// backups unchanged — the flag is just an extra passthrough field).
const DEMO_SESSION_FLAG = 'isExample';
// v43: cloud/authentication prep. Stores {userId, authToken, loginTime} for
// mock OAuth flow. Survives backup/restore. Not persisted between sessions yet
// (will be in cloud phase) but structured for future cloud sync.
const PAT_AUTH_KEY = 'pat:authUser';
// v33: First-run wizard "seen" flag. Set once the wizard is completed OR skipped,
// so it never reappears. Distinct from the welcome modal key: a genuinely-new
// install gets the WIZARD (gated by this key + an empty-install test); an
// upgrading user fails the empty-install test and gets the V33 welcome modal
// instead. The two are mutually exclusive — never both. "Run first-time setup
// again" (Help) simply clears this key and re-renders.
const ONBOARD_KEY = 'pat:onboardedV33';

// v30: PDF Reports. A single object under REPORT_SETTINGS_KEY holds every
// report-configuration field plus the optional company logo (base64). Stored as
// one readable JSON blob (one read, one write — matches the storage principle;
// the logo is the only sizeable part and it's capped on upload). Included in
// JSON backups. Old backups without it restore with REPORT_SETTINGS_DEFAULTS.
//
// MASTER SWITCH: `enabled` gates BOTH report entry points (the top-level Reports
// hub control on the Sessions screen, and the "Produce Report" button on the
// session Overview). Default OFF for EVERYONE — including upgrading users — so a
// freshly set-up employee phone can't generate an unbranded/half-configured
// report before the lead has been into Report Settings, configured branding, and
// deliberately switched reporting on. Nothing about reports is visible until then.
//
// RETEST: there is NO default retest period (the IET 5th Edition deliberately
// removed fixed intervals in favour of risk assessment). When retestEnabled is
// on, retestMonths must be set by the user; the report prints
// "Recommended retest by <test date + retestMonths>" with a note that it is a
// guidance figure, not a legal requirement.
//
// DECLARATION: free text the tester is comfortable certifying. Seeded with a
// sensible default the user can overwrite with their own wording.
const REPORT_SETTINGS_KEY = 'pat:reportsettings';
// v36: saved report templates — named full snapshots of reportSettings the user
// can apply/switch between. Stored as its own key (array). Additive; round-trips
// through backup + setup. Applying a template overwrites the live reportSettings
// (including logo/signature/colours/cert prefix — C1=B: a template is a complete
// report identity), so the UI confirms before applying.
const REPORT_TEMPLATES_KEY = 'pat:reporttemplates';

const REPORT_DECLARATION_DEFAULT =
  'Tested in accordance with the IET Code of Practice for In-Service Inspection ' +
  'and Testing of Electrical Equipment.';

// v31: PDF report filename pattern. The default reproduces the exact pre-v31
// filename (PAT_Report_<site>_<date>) so upgrading users see no change unless
// they opt in by editing it. Tokens are substituted then the whole string is
// sanitised to a safe filename by reportFilename() in report.js.
const REPORT_FILENAME_DEFAULT = 'PAT_Report_{site}_{date}';

// The insertable tokens offered as tappable chips on the Report Settings page.
const REPORT_FILENAME_TOKENS = ['{site}', '{client}', '{date}', '{engineer}'];

// v32: two-level Settings. The hub shows these CATEGORIES; each opens a sub-list
// of the existing setting pages (by their view id). Single source of truth for
// the structure — the hub, the category sub-list, search (which flattens this),
// and back-navigation all read it. `pages` are view ids handled in render().
// `aliases` are extra search keywords so plain-language terms find a page.
// Grouping rationale: split by "whose data is this" — User (the engineer) vs the
// job (clients/reports/CSV) vs the app vs data-movement vs help. Clients sits in
// Reports & Output because it feeds the report header and CSV, not identity.
const SETTINGS_CATEGORIES = [
  { id: 'catUser',    icon: '👤', title: 'User & Calibration', blurb: 'Your engineer details and calibration',
    pages: ['settingsUser'] },
  { id: 'catTesting', icon: '⚡', title: 'Testing Setup', blurb: 'How Quick Pick, Multi Pick and descriptions behave',
    pages: ['settingsItems', 'settingsFails', 'settingsReadings', 'settingsMultiPick', 'settingsDescriptions', 'settingsScanner'] },
  { id: 'catReports', icon: '📄', title: 'Reports & Output', blurb: 'PDF reports, CSV export and your clients',
    pages: ['settingsReport', 'settingsCsv', 'settingsClients', 'settingsRetest'] },
  { id: 'catApp',     icon: '🎨', title: 'App & Display', blurb: 'Appearance and the resistance calculator',
    pages: ['settingsDisplay', 'settingsCalculator'] },
  { id: 'catData',    icon: '💾', title: 'Data', blurb: 'Back up, restore and share your setup',
    pages: ['settingsBackup', 'settingsSetup'] },
  { id: 'catHelp',    icon: 'ℹ️', title: 'Help', blurb: 'About this app, what the terms mean, and how to get in touch',
    pages: ['settingsAbout', 'settingsGlossary', 'settingsContact'] }
];

// Per-page metadata for the category sub-lists and for search. icon/title shown
// on the row; `aliases` widen search matching. Subtitles are computed live in
// renderSettingsCategory (counts/status), so they're not stored here.
const SETTINGS_PAGE_META = {
  settingsUser:        { icon: '👤', title: 'User Settings',         aliases: 'engineer name calibration cal due instrument tester testers multiple megger seaward kewtech' },
  settingsItems:       { icon: '⚡', title: 'Quick Pick Items',      aliases: 'item types presets quick pick buttons' },
  settingsFails:       { icon: '⚠️', title: 'Quick Pick Fail',       aliases: 'fail reasons failure quick pick' },
  settingsReadings:    { icon: '🔬', title: 'Test Readings',          aliases: 'test readings ohms megohms leakage insulation earth continuity class measurements' },
  settingsMultiPick:   { icon: '🧰', title: 'Multi Pick',            aliases: 'multi pick bulk multiple slots' },
  settingsDescriptions:{ icon: '📝', title: 'Item Description List', aliases: 'descriptions notes labels' },
  settingsScanner:     { icon: '🏷️', title: 'Barcode Scanner',      aliases: 'barcode scanner scan wedge hid bluetooth label qr code reader asset number' },
  settingsReport:      { icon: '📄', title: 'Report Settings',       aliases: 'pdf report logo branding company certificate filename declaration signature sign colour color theme header accent cert number template preset notes' },
  settingsCsv:         { icon: '📊', title: 'CSV Columns',           aliases: 'csv columns spreadsheet export headers excel' },
  settingsClients:     { icon: '🏢', title: 'Clients',               aliases: 'clients sites customers addresses' },
  settingsRetest:      { icon: '🔔', title: 'Retest Reminders',       aliases: 'retest reminders rebook chase due overdue recall renewal commercial repeat business follow up contact customer' },
  settingsDisplay:     { icon: '🎨', title: 'Display Settings',      aliases: 'theme dark light haptics sound timestamps appearance' },
  settingsCalculator:  { icon: '🧮', title: 'Resistance Calculator', aliases: 'earth continuity resistance limit ohms calculator csa' },
  settingsBackup:      { icon: '💾', title: 'Backup & Restore',      aliases: 'backup restore export import data save json' },
  settingsSetup:       { icon: '🔁', title: 'Export / Import Setup', aliases: 'setup share configuration new device employee copy presets transfer' },
  settingsAbout:       { icon: 'ℹ️', title: 'About',                 aliases: 'about version changelog whats new' },
  settingsGlossary:    { icon: '📖', title: 'Glossary',              aliases: 'glossary terms jargon what does mean definitions help explain quick pick smart multi pick preset asset session client site overview readings class earth insulation leakage polarity fail reason tag retest certificate template csv backup setup calibration pruning' },
  settingsContact:     { icon: '✉️', title: 'Contact',              aliases: 'contact support email help feedback website' }
};

// v35: report colour defaults reproduce the exact pre-v35 look — dark grey
// header band, mid-grey dividers. Stored as hex strings on reportSettings.
const REPORT_DEFAULT_HEADER_COLOR = '#282828';   // was the hardcoded [40,40,40]
const REPORT_DEFAULT_ACCENT_COLOR = '#c8c8c8';   // was the hardcoded line draw 200

// Preset colour themes offered on the Report Settings page (plus a free hex
// picker for each colour). 'Classic' = the historic default look. Each theme
// sets both the header band and the accent. id is stable; label is shown.
const REPORT_COLOR_THEMES = [
  { id: 'classic',  label: 'Classic grey', header: '#282828', accent: '#c8c8c8' },
  { id: 'navy',     label: 'Navy',         header: '#1f3a5f', accent: '#3d6ea5' },
  { id: 'forest',   label: 'Forest green', header: '#1f4d2e', accent: '#4a8c63' },
  { id: 'burgundy', label: 'Burgundy',     header: '#5e1f2e', accent: '#a5546a' },
  { id: 'teal',     label: 'Teal',         header: '#14504f', accent: '#3f9c9a' }
];

// Factory (not a shared object) so callers always get an independent copy —
// mirrors the DEFAULT_CSV_COLUMNS.map(...) deep-copy pattern used elsewhere.
function makeDefaultReportSettings() {
  return {
    enabled:          false,   // master switch — OFF for everyone (see note above)
    companyName:      '',
    companyAddress:   '',
    logo:             '',      // base64 data URL, downscaled <=600px on upload
    reportTitle:      'Portable Appliance Test Report',
    showEngineer:     true,
    showInstrument:   true,    // v66: sources instrumentForSession(session)
    showCalibration:  true,    // v66: sources instrumentForSession(session)
    retestEnabled:    false,
    retestMonths:     null,    // no default (Q10=B); required when retestEnabled
    showFails:        true,    // false = passes-only register
    // v54: print the test-reading columns (earth Ω / insulation MΩ / leakage mA /
    // class, plus the Class I polarity tick) on the appliance register. Default
    // true — but it only has any effect when the Test Readings feature itself is
    // ON (state.readingsEnabled) AND at least one item actually carries that
    // reading, so for anyone not using readings nothing changes. Rides the
    // reportSettings blob — additive, no backupVersion bump.
    showReadings:     true,
    // v48: print the "· PATGo {version}" app credit in the PDF footer. Default
    // true = the footer reads exactly as before the rename (now with the new
    // name). false = the footer shows just the generated date/time. Rides
    // through backup + setup as part of the reportSettings blob — additive, no
    // backupVersion bump.
    showAppCredit:    true,
    // v49: print the small PATGo logo mark next to the footer app-credit text.
    // Default true = on for everyone (decision Q1). It is SUBORDINATE to
    // showAppCredit (decision Q2): the logo only draws when showAppCredit is
    // also on, so the credit toggle is the single off-switch for all PATGo
    // footer branding. Additive, rides the reportSettings blob, no backupVersion
    // bump.
    showFooterLogo:   true,
    // v61: print the testing time (first item logged → last item logged) in the
    // job-details block. Default FALSE — deliberately the opposite of the other
    // "show" flags here (decision Q11=B). The certificate is client-facing, and
    // "this job took 3h 12m" tells a customer how fast you worked; adding that to
    // everyone's existing certificate without asking would be a silent change to
    // their output. Opt in from Report settings → What to include. Read with
    // `=== true` (storage.js) rather than `!== false`, so a saved settings blob
    // from before v61 backfills to OFF, not ON.
    showDuration:     false,
    // v64: print the photographic evidence appendix after the declaration.
    // Default FALSE — opt-in, the same posture as showDuration and for the same
    // reason (decision Q6A). Anyone who has been taking photos since V62 has a
    // certificate they are already sending to clients; quietly adding four pages
    // of photographs to it would be a silent change to their output. The V64
    // welcome modal tells them the switch exists. Read with `=== true`
    // (storage.js) so a pre-v64 settings blob backfills to OFF, not ON.
    showPhotos:       false,
    declaration:      true,    // print the declaration/signature line
    declarationText:  REPORT_DECLARATION_DEFAULT,
    // v34: optional signature image (base64 PNG data URL, downscaled <=400px on
    // capture — drawn on-screen OR uploaded; both end up as the same data URL).
    // Prints on the declaration line when `declaration` is on AND a signature
    // exists; otherwise the blank ruled "Signed:" line shows exactly as before.
    // signaturePosition: which side of the declaration block the signature sits
    // ('left' | 'right'; default 'left', above the existing rule). Round-trips
    // through backup + setup for free as part of the reportSettings blob.
    signature:        '',
    signaturePosition:'left',
    // v35: report colours. headerColor = the register table's header band fill
    // (hex). accentColor = title underline rule, section dividers, and the totals
    // line (hex). Header TEXT colour is auto-chosen (white/black) for contrast at
    // render time — not stored. Defaults reproduce the exact pre-v35 look (dark
    // grey header, grey dividers). Additive strings on the blob → round-trip
    // through backup + setup for free; validated in normaliseReportSettings.
    headerColor:      REPORT_DEFAULT_HEADER_COLOR,
    accentColor:      REPORT_DEFAULT_ACCENT_COLOR,
    // v36: certificate numbers. OFF by default (opt-in) — when off, nothing
    // about the report changes and no numbers are assigned to sessions. When on,
    // the first time a report is produced for a session it's stamped with a
    // number built from certPrefix + a zero-padded counter (certNextNumber,
    // certPadding), optionally including {year}. The stamped value lives on the
    // SESSION (session.certNo) so re-previewing reuses it — see report.js.
    certEnabled:      false,
    certPrefix:       '',      // e.g. 'BPS-' or 'BPS-{year}-'
    certNextNumber:   1,       // the next counter value to assign
    certPadding:      4,       // zero-pad width, e.g. 4 → 0001
    // v31: PDF filename pattern. Tokens {site} {client} {date} {engineer} plus
    // free text; substituted + sanitised by reportFilename(). Seeded to the exact
    // pre-v31 behaviour so nothing changes unless the user edits it.
    reportFilenamePattern: REPORT_FILENAME_DEFAULT
  };
}

// v36: starter report templates (C4=yes). Each is a full reportSettings snapshot
// (C1=B) under a friendly name. Seeded on first run when the user has no
// templates yet. "Standard" reproduces the defaults; "Client summary" is a
// passes-only, lighter variant. Branding fields (logo/signature) start empty —
// the user's saved templates will carry their own once they save from live
// settings. Returns fresh independent copies (deep via the defaults factory).
function makeStarterReportTemplates() {
  const standard = makeDefaultReportSettings();
  standard.enabled = true;
  const summary = makeDefaultReportSettings();
  summary.enabled = true;
  summary.reportTitle = 'PATGo Summary';
  summary.showFails = false;        // passes-only register
  summary.showInstrument = false;   // lighter client-facing copy
  return [
    { id: 'tpl_standard', name: 'Standard', settings: standard },
    { id: 'tpl_summary',  name: 'Client summary', settings: summary }
  ];
}

// v30: logo upload constraint — longest edge downscaled to this many px before
// base64 storage, to keep localStorage and JSON backups sane.
const REPORT_LOGO_MAX_PX = 600;

// v34: signature downscale constraint — longest edge capped to this many px
// before base64 storage (drawn or uploaded). Signatures are smaller than logos,
// so a tighter cap keeps localStorage + JSON backups lean.
const REPORT_SIGNATURE_MAX_PX = 400;

// ---------- v62: photo evidence (fails only) ----------
// Photos are stored in IndexedDB (see photos.js), NOT localStorage, so these
// caps protect the device's disk and the photo export file size — not the ~5MB
// localStorage budget the rest of the app lives in.

// How many photos one item may carry. Three covers the real evidence case for a
// fail — the plug, the rating label, the damage — without letting one item
// become a photo album. Enforced in the UI *and* in photoAdd(), so a double-tap
// on a slow device can't push a fourth in behind the check.
const PHOTO_MAX_PER_ITEM = 3;

// Longest edge, in pixels, after downscaling. 1280 is enough to read a rating
// plate or show a scorched plug clearly, and lands around 150-250KB per photo at
// the quality below. Twenty fails with three photos each is roughly 12MB — fine
// for IndexedDB, and a photo export file that still moves over email.
const PHOTO_MAX_PX = 1280;

// JPEG quality. 0.7 is the point where artefacts stop being visible on a phone
// screen for photographic content. Note JPEG, not PNG: the logo and signature
// paths use PNG to preserve transparency, which a photo has none of, and PNG
// would be several times larger here.
const PHOTO_JPEG_QUALITY = 0.7;

// Photo export/import bundle marker + version. Deliberately a DIFFERENT kind
// string from the backup ('pat-backup') and the setup bundle ('pat-setup') so
// the file-kind guard can reject a photo file imported as a backup and vice
// versa, exactly as setup.js already does for its own bundle.
const PHOTO_BUNDLE_KIND = 'pat-photos';
const PHOTO_BUNDLE_VERSION = 1;

// Soft warning threshold for the photo export. Past this, the export confirm
// warns about the file size before building it, because a 60MB attachment is a
// surprise worth having in advance rather than after a two-minute encode.
const PHOTO_EXPORT_WARN_BYTES = 25 * 1024 * 1024;

// ---------------------------------------------------------------------------
// v64: photographic evidence appendix on the PDF certificate.
//
// Photos are STORED at PHOTO_MAX_PX (1280px) because the on-screen strip and any
// future upload want the detail. The certificate does not: three photos across a
// portrait A4 page is a printed slot about 165pt wide, so anything past ~500px is
// resolution nobody will ever see. They are therefore RE-ENCODED at build time,
// smaller, and the size is chosen from how many the job has (decision Q8A).
//
// WHY A LADDER AND NOT A FIXED SIZE + A HARD CAP: a hard cap silently drops a big
// job's evidence, which is the one thing a photo appendix must not do. Shrinking
// instead of dropping means every photo still prints; a fifty-fail job just gets
// smaller pictures. Even the bottom rung is over 170dpi at the printed size, which
// is fine for "this plug top is cracked".
const REPORT_PHOTO_TIERS = [
  { upTo: 24,       maxPx: 640, quality: 0.65 },   // ~45KB each  → ~1.1MB
  { upTo: 60,       maxPx: 512, quality: 0.60 },   // ~30KB each  → ~1.8MB
  { upTo: Infinity, maxPx: 400, quality: 0.55 }    // ~18KB each  → ~2.7MB at the ceiling
];

// The absolute ceiling (decision Q9A). 150 photos is fifty failed items carrying
// three shots each — a very large job. A ceiling has to exist somewhere: past it
// the PDF stops being something an iOS share sheet will handle, and a certificate
// that cannot be sent has failed at the only job it has. When it bites, the report
// says so LOUDLY — a boxed notice on the FIRST appendix page (not buried on page
// fifty) and a second line at the end. See _appendPhotoPages in report.js.
const REPORT_PHOTO_HARD_MAX = 150;

// Photos across one row of the appendix. Three fits the per-item cap exactly, so
// one item's evidence is always one row.
const REPORT_PHOTO_COLS = 3;

// Pick the encode tier for a given photo count.
function reportPhotoTierFor(count) {
  const n = Number(count) || 0;
  for (let i = 0; i < REPORT_PHOTO_TIERS.length; i++) {
    if (n <= REPORT_PHOTO_TIERS[i].upTo) return REPORT_PHOTO_TIERS[i];
  }
  return REPORT_PHOTO_TIERS[REPORT_PHOTO_TIERS.length - 1];
}

// v49: the PATGo footer logo, embedded as a small base64 PNG so it renders in
// the PDF with zero network access (reports must work fully offline). This is a
// 48x48 downscale of the app icon, drawn ~11pt square next to the footer credit
// text when both `showAppCredit` and `showFooterLogo` are on. First-party asset,
// not a vendored dependency. ~4.6 KB — trivial next to the user-logo data URL.
const PATGO_FOOTER_LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAANeklEQVR42sVZa6xc1XX+1tp7n8fMnRlfXz8xfmCMTXjVEFBJIFC3TRophbYCQlOiNKSJFImKJm1SSiKlVH0FSFGqpIkaohK1apNCE0BUqOkDteCgoPAwhoDBD4xtjI19fR9zZ+acs/deqz/O9dx7zSNQCbo0mpmz9zlnr73XXmt9+1skIpgnqioiIkLHpW4cfs8XIho21v/nt9SNeJWoqqoyMzOfMAQR0XyFRCTGSET1rSe88TUVqttPGHi+lq+pTT2uiNRqDe+cU2i4MMaY15zW2yQxRgDGGAC1ZjzsEBHn3DupDQBrLRHVatXCtaVExFr7aqO83aKq9fLUOgBgVQ0h1K3/X8LMMcZ6Obh2qLeoEL3q8q0aeu6R2uOG+4lDCPU1QFAGAIXQ/FhACoYSKQAFhBBIlRQEJQVpIA0KlfoaqL2fVAkKyPHPvHCA+hFRmtXJWlubzAIgJlUlVaFKiW1II6DHn1dEQUlwog4gQwyKhEhgQVR1kZkURkgAByb4yBzBnpTBbkFcmv0tSIwSkxoBgZUwDEhWVWn2RmJx3hIS72aXdPgqO3xZDKG0homMVpYcsTgVsAIBMEVIwCaFJ5NYDaBYz/kEQzfUgzOgEM2FiYaTV7XH/ZyUomrl0PjR0we/9l+BWssgCpASBSajvVWN4rLzRrdslCwWiC22ODzR+6t/n9rZbRExi7/ygvyqc6JK0Ufyhe+9uHN6eZtEUCkUIJDUA7OyJ3YUvnx1sqYtImpghpO3cw5IFOEM8MTLevfusdF2HmMQiEGAuOg6Gpvff3Tqpt/Mrz2/4WNUSv78B3u+teOkzHbUl5Q2Hnpx5qSl9pJVjZlu+ege2T5IW9yvkJIYlujUeCsECIfIkouWfctNKBQ0Z1WeC/PKSgTgFZ8vyk0zC42WGRszzSVpe0nSzPqtlH2j/ZUf+v1TahPasb97/+7ljU7n/FWTHzrPL0t8qdldPxYQ95kCmoa8kktVU1voIm8b4keqJAYiyr1JVYNBZBHSYSpU1bkVAogggE53RdgdG+CjFxWf35L5KjjI/q678bvHdvaXHu7K1gPFRzrZXY/PTOoS7fUvfW/zk+fPvPfmuNiO3P88/X6vvzq3X79mtE9eJWsaeeTZ3p89lHkyZ7T9n16dWxLSoJSsaw84pDALQsa86KzEJEA12QWxcSGubJs1ue8l4oTWdMzFp8ZnHukHi8mYVGXxrz+lkdRNDYJB0kYAibrO1NTgvm24/qLqglPy425hXjo4CJIHF09qui2nWEABBVxUjUIGrJA6sc7lMoCUBDAisdsr1HA0xerRCKRN00icK6tix97AaWYEG8fc1qd6eyYbksIm9Nyu/jce9opOYN+Cu+exrBvzEKisqCxENL4wzQp4+LzpRL0vEEISfBQYYsxu+Xn+fBx7UCC1vdLPlB5EuY1PbJ8pXpqsNERjHt8RH59oRlusGrE/t0w+c29h7BgC8sT954v2nv2yyLEGW7Wrp1+pfrIn2XKa1aAMxzQ4MmgkaqLPm82KKRVXMbnZbbIQsRCRnddGltGr9FjRNOTZpd95ZkQqVShTzBwiuTDdv/HK/OWjR7buS7jJrpxEaMd2ORbyKrIJ3TSaI7H5j4+Xv3iaKBklApKpfiHGsIbOiNYDgWiBOvPz2rwEwYBOlabrO2TFFjYPIU+qJBtkNhqxq1u47Zr8I2fizoenpgaLNiwv7/5sftV5caZQH2hZe/r7v9f41Psqo72te8JzE5wYDSYCNDFI1FgjZTvn2XV5fVRhT0iZU71qEI1Gk4z4my6zSxNbIE+BVoZNK3mZDb2Z/gN7O8hNw2Otm2hZaBxTF5tBT8nKJWa6E0cnZpKte6tNo1aVIMWgVxBlkbA8lZ+Zi+08KwKgst+r4EzIR0fjFWfmTVSAAA5QiEZByVoWeSOvdh8zP/9VGwJ3EjEqe4rme/56mmNbF+fFhCYegDWkPlTVwFvEaNKTm/p6ugzRMM9rFEAm+yGqieRbOVjFh1hE+CAhagQQeLRBl23mYxPc7fGhft7XRioa2BjWqalFR3rtA11/2mL/vk1W1RummSKZCASDhNFsOiDQG2IVuzATm+kZFSQM6jSynIJna0iN1skIINbAN7yfl4yVz+8PSHjrznJ/dySjqjR+y4WNNVqlTn/jwmxtJ2jwxrrewHZVyVAKzVIFPIsDv67V5nsZA7J/3PYL0ihNy0AUsQkMkSiBlMRED5eqXndhjgstoN96uPinbf2WCyut+8oVoQ0BRgAJwZE4qBytyqnJRi8TTWwjU4CEmV9/V89PHey1l47l52+w0dJZp6iKQ9TKCDAECEZJKwZ7Vg3W0umLzWI52Kd0VadhZUkvOidKRGSiGDVKlQtnn5pPNczqtFqWZCoJCARR8Gtvpl6vl2VZHR4oFtGmBWuKAmIdE5C8CpcDBBUUVGVip3rdj9++e/vhDXdcl1y6Npt3wIGXwCAxpXDmEAWWRQVsRECqC483RFRVlXNuTiEhjUpWEeBTSkE42D1yaOrQIETwrLuSIBhfotzYOmXNyKoKMbX84I6Zpwu/efkBLTQ4nwQ11q4cXb26uUxCqUSAjVADBbORKICS4YXBaKiQHe5oBRSCoGma7D+y/6u77/qBf7IoXxEhAUFVoE6MWEz4mdvO/uzvdk5OyT5zYPd3p+99tP/jl16ejOS8KbKYG8ra1Pzw2ktuOO23WBospRoPbVDUwGo5UYWP3hGELC1MInZoB6OAiEmTRw5tv3bbzfvMIYbYzEpi02CgSirecDNQnrU3dFYS0UPPPvjJXd/Ym70SjLabTSYy1Crg++j3uXvLC3cQuy+e9jFfsZHcUwCVQe03t3378o2/sKmxYRBjQlpjaH0tLwMZOzk1/gdPfO25zq6VWPHbJ1/+gUXnsWlYGkYqAQVocm667qdHXvjUrr/Z1zm4Pln36TVXbG6vN8xGyWu17dCuLx+8FyMTd770H7+z9ldWJSsAOJh6Rz4bj/7dY3/yw3f/5ZrGyaUvE7ZKID0RwiIqOfDtu+7+idu7Nqy8ZfPnrmxfDAUqwMzb0bMSvvn8nXub46uTDd/efONF6ca5uBJxyYZzi7K69cDfvzgyuVMmMI4fHX2MFDPUb0vWCNjb3/f+J790zxl/9K7OxhAjQ4dZ1dbnDxFxxvSK7l39R4TKLUs/dGX74hj12em9n3/0VsdUmOh8Ioyi6r17+QWf2/hrD09vK5vyiZO3XJRtnIihRSQgJUStUk0ubqy6TchCDcg4N51hWrrj2g1RtuuBJTY7WO379Sdu/uezb9i8eGOQyMeDwOypQ6EgHCwPTxWTnWDP7awbiOTMO4/t/rf4dOqSEjEhg4YJ4dim0XOOdsf3mWOLfXZWY0NUaakwWQZIUSgb8GPV4fE0rnPL1puxo1Pji3rslZeGhljfhJtBYwnRHrP3qm1f3HrR3y5LF6vKHITV4zC2RzIw1CfqldM5c+n13GVn3de61VkiMTH0v/T8HdvcYFNz7TEZBK5A6YyKIS40Wpg6P2cuqSan7nz5f6wUm9tnrXJLD7TGFRxi0gcOV9PPdw82s2qyKk5yY58+58OddERVhhYfuj1BcbJbupjyqZS/t++BS9rvfs+iM9e1VqxrrajvmZ4cr3qltsym9KQVcUVT2t28+M7eu96TvWtdc2y47V88tu+Pn7pjR9iVpa3PrL58+4Fd28af9tQf1zLAJzqwTAer3nkjZ9xy1vUXNU+XqCAlpQUgn4lilCXZ6AeXnP+Vw//ycnL0mif/4oLW+o5JPAwUYPPyYHw8nx5DayUvXd9ceXpr4yPFE0/G569+5IYzO+vJsAB9X+w6su+pxksZVzeuu/a9zVOfrF5cRSsL+FHEzCS377hzJ+3/xOorvrDh4+t1cRW8YUM1sVADoDpSE+Chqpippj69/ev39R5W9lX0UEVtXVK4BIgbkvUPXPC1VWg/OrP9usdve1YP9G1PvQKmRl7G2OWNFX+45qPXL78sRrXzTjkHJw598NGbPnb2Bz634ldRWSEKLhhlUiKisiyTJJlLHUqKAKNm2hb3H3rgwe4zg6qMRAJxKiACoSf+l1dd8qnFv9QTjCgdqI78w+H/fqa/R6WyUAIlqVs7cspVo5eelq4otHRgUqMqospsdk7tO8xHL110fvAamMggDUGJa3MVRZHnOfV6vTRNiYmESMmbygnBuNdhvAAIKvXGSJTU8AIMPIfzMKDKEFvQMImSCBsLaBUqYiusRkHKpLP2qqoqz3PLzN77NE1rPscoRyIv0SyAdnQcmlOESQwRCRJ4DRRVwCCdhTiqAEeDVJnURAapzmZKIgkSGMTW1rQRSGg2s4YQZkeqqqosy0ajcQK/pW+CA9O33vV6vYPBwDmXJElNFHNZlgso6TfDV/6ful7dS0Te+yH7ycycJIn3vqoqZn6H6c7aWGVZpmk6d1AkojRNi6IoiuKd5KmZOYQwGAzSNB3WDmadpKbMB4NBjDHP8/n1h7djVeqX9/v9EEKapjV9PltdGJYWahkMBjWJ7px7zYrHCdzAz+TFX12siTGGEEIIRJRl2fwSzILiy/DhGKP3fshkv5mB37wMCy7Oubp2MNRmVqE3tsvbYbU3nt7/AjlL0zYPu3ejAAAAAElFTkSuQmCC';

// v31: Export/Import Setup. A "setup" is a shareable bundle of CONFIGURATION
// only — no sessions, no clients/sites, no learned SQP history, no backup
// timers. The use case is "make a second device (or a new employee phone) match
// this one's setup". It deliberately overlaps the backup serialisation (same
// per-field shapes, validated through the same normalisers on import) but is a
// SEPARATE file kind so a backup can never be imported as a setup, or vice
// versa (which would silently wipe sessions). The file carries:
//   kind:        "pat-setup"   — identity marker, checked on import
//   setupVersion: 1            — bundle schema version
//   label:        "<name>"     — user-given name, shown in the import confirm
//   sections:     { ... }      — only the ticked groups (progressive-disclosure)
// SETUP_SECTIONS is the single source of truth mapping the five user-facing
// groups to the state fields each carries. The export include-list, the bundle
// builder, and the importer all read this — add a field in one place only.
const SETUP_KIND = 'pat-setup';
const SETUP_BUNDLE_VERSION = 1;
const SETUP_SECTIONS = [
  { id: 'presets',     label: 'Quick Pick presets & lists',  hint: 'Item presets, fail reasons, descriptions' },
  { id: 'report',      label: 'Report settings',             hint: 'Branding, logo, filename, declaration' },
  { id: 'csv',         label: 'CSV columns',                 hint: 'Column order, visibility, headers' },
  { id: 'tester',      label: 'Tester & calibration details', hint: 'Instrument make/model, calibration info' },
  { id: 'prefs',       label: 'App preferences',             hint: 'Theme, haptics, sound, timestamps, Multi Pick, Smart Quick Pick on/off' }
];


// v19: Clients & Sites. A two-level model so one client can have several sites.
//   CLIENTS_KEY — JSON array [{ id, name }].
//   SITES_KEY   — JSON array [{ id, clientId, name }]; each site belongs to
//                 exactly one client (clientId references CLIENTS_KEY).
// Both stored readable/long-key (small next to item data, and human-readable in
// backups, matching the backup principle). On first V19 load the lists are
// SEEDED from existing sessions' plain `site` strings — each distinct site
// string becomes a client with one same-named site — so returning users aren't
// faced with empty pickers. These lists drive the New Session form's Client and
// Site pickers and the Settings → Clients management page. They are convenience
// data only: a session always stores its own `site` TEXT snapshot, so editing or
// deleting a client/site never alters any saved session, CSV, or import.
const CLIENTS_KEY = 'pat:clients';          // v19: JSON [{id,name}]
const SITES_KEY = 'pat:sites';              // v19: JSON [{id,clientId,name}]

// v18: Smart Quick Pick. An OPT-IN feature (default OFF) that reorders the
// entry-screen quick-pick buttons so the item types you've most often logged at
// the current Location float to the front. It NEVER adds, removes, or hides
// buttons and never changes what a tap logs — it only changes their order. When
// off (the default), the grid renders in its plain preset order exactly as
// before, so existing users see no change until they turn it on.
//
//   SQP_ENABLED_KEY — '1' | '0', default '0'. Gates the whole feature.
//   SQP_HISTORY_KEY — JSON object mapping a normalised location string to a
//                     { itemType: count } tally:
//                       { "server room": { "PC": 4, "Monitor": 3 }, ... }
//                     Built once from all existing sessions when first enabled
//                     (or via the Rebuild button), then incremented on every new
//                     item logged. Stored readable/long-key (not codec-shortened)
//                     — it's small next to item data and benefits from being
//                     human-readable in backups, matching the backup principle.
const SQP_ENABLED_KEY = 'pat:sqpenabled';   // v18: '1' | '0', default '0'
const SQP_HISTORY_KEY = 'pat:sqphistory';   // v18: JSON { loc: { type: count } }

// v53: Test Readings. A single on/off flag gating the WHOLE feature. Default
// OFF — when off, the entry screen, the item data shape, the CSV and the backup
// are byte-for-byte identical to V52: no readings sheet, no `readings` key ever
// written to an item. Only an explicit '1' turns it on; absent/'0'/garbage all
// read as off (same convention as SQP/timestamps). The readings DATA lives on
// each item under item.readings (see normaliseItemReadings in utils.js) and
// rides through backup/restore inside `sessions` — additive, NO backupVersion
// bump (an old backup simply has items without the key; a new backup's readings
// are ignored wholesale by an older app). The cloud schema (future) will mirror
// item.readings, which is why it's a clean self-contained object of as-typed
// text values, not parsed numbers.
const READINGS_KEY = 'pat:readingsenabled';   // v53: '1' | '0', default '0'

// ---------------------------------------------------------------------------
// v65: HID barcode scanner ("keyboard wedge").
//
// ⚠ NOTE THE DEFAULT IS **ON**, and note that it is read differently from every
// other flag here. The others are `=== '1'` (opt-in). This one is `!== '0'`, so
// an absent key means ON. That is deliberate: with no scanner paired the
// feature is entirely inert — nothing on any screen changes, and the only code
// that runs is a keydown listener that discards everything a human types. There
// is nothing to opt in to. Defaulting it off would instead mean the one
// engineer who does own a scanner has to find a setting they have no reason to
// look for. The toggle exists to switch it OFF if it ever misbehaves, and to
// give the test box somewhere to live.
const SCANNER_KEY = 'pat:scanner';       // v65: '1' | '0', DEFAULT ON (absent = on)

// The speed test, which is the whole safety mechanism (see scanner.js header).
// A wedge scanner emits characters ~5–20ms apart; a fast human typist is
// ~80–150ms. 40ms sits comfortably between the two — slack enough for a sluggish
// Bluetooth link, still far quicker than any thumb. If a real scanner ever turns
// out to be slower than this, THIS is the number to raise, and raising it toward
// ~70 is still safe. Above that it starts to overlap fast typing.
const SCAN_MAX_CHAR_GAP_MS = 40;

// How long a silence ends a burst. Doubles as the fallback terminator for a
// scanner configured to send no suffix at all.
const SCAN_END_MS = 120;

// Length bounds. The minimum stops a stray double-keypress being read as a
// scan; the maximum only rejects a runaway (a stuck key), not long barcodes —
// 64 characters is far beyond any asset label.
const SCAN_MIN_LENGTH = 3;
const SCAN_MAX_LENGTH = 64;

// How many recent scans the settings test box shows.
const SCANNER_TEST_LOG_MAX = 5;

// v53: Equipment classes. The readings sheet shows a class selector at the top;
// the chosen class decides which reading rows appear (Class II has no earth path
// so no earth-continuity box; Class III is low-voltage so insulation only).
// `default` is the class pre-selected on a fresh sheet before the user has
// picked one in this session (we then remember their last pick in
// state.lastReadingsClass). Stored on the item as item.readings.class.
const READING_CLASSES = ['I', 'II', 'III'];
const READING_CLASS_DEFAULT = 'I';

// v53: which reading fields apply to each class, in display order. The PASS
// sheet shows every applicable field for the chosen class, pre-filled with the
// class-appropriate placeholder below. This map is the single source of truth
// for "which boxes show" — the entry sheet, the validator, and the CSV all read
// it, so changing a class's field set is a one-line edit here.
//   earth      — earth continuity, ohms (Class I only — earthed appliances)
//   insulation — insulation resistance, megohms (all classes)
//   leakage    — leakage current, milliamps (Class I & II — mains-side)
const READING_FIELDS_BY_CLASS = {
  'I':   ['earth', 'insulation', 'leakage'],
  'II':  ['insulation', 'leakage'],
  'III': ['insulation']
};

// v53: per-field metadata — label, unit, and the typical-PASS placeholder shown
// as greyed editable text on the PASS sheet (decision: pre-fill, editable). On a
// FAIL the relevant box shows BLANK instead (you're recording the actual
// out-of-spec measurement, so a placeholder would mislead). Values are stored
// EXACTLY as typed (free text incl. the </>/≥ shorthand) — no parsing, straight
// into the item and the CSV cell. Placeholder figures are Peter's conventions.
const READING_FIELD_META = {
  earth:      { key: 'earth',      label: 'Earth continuity', unit: 'Ω',  passPlaceholder: '<0.1'   },
  insulation: { key: 'insulation', label: 'Insulation',       unit: 'MΩ', passPlaceholder: '≥19.99' },
  leakage:    { key: 'leakage',    label: 'Leakage',          unit: 'mA', passPlaceholder: '<5'      }
};

// v54: Polarity check. Unlike the three numeric readings above, polarity is a
// pass/fail observation (correct line/neutral/earth wiring), so it's a simple
// CHECKBOX, not a typed value. It applies to CLASS I ONLY (earthed mains items
// — the wiring-orientation check is meaningful there; Class II/III don't get
// it). Stored as item.readings.polarity === true when ticked; the field is
// absent/false otherwise. Default UNCHECKED (false). Purely additive on the
// readings object — old items/backups without it read as false, so NO
// backupVersion bump. The entry-sheet control shows only for Class I; the PDF
// "Polarity" column emits only when some Class I item in the session has it
// ticked (emit-only-if-used, mirroring the numeric reading columns).
const READING_POLARITY_CLASSES = ['I'];

// v53: fail-reason → reading-field "type tag". On a FAIL the chosen reason's tag
// decides which single reading box the sheet shows:
//   'earth' | 'insulation' | 'leakage' → that one box, blank
//   'visual'                           → no electrical box (the reason IS the record)
// The DEFAULT reasons are pre-tagged here so the feature works out of the box
// with zero setup. CUSTOM reasons the user adds default to 'visual' (we don't
// know what they evidence) and can be re-tagged on Settings → Fails. Tags live
// in their own parallel store (FAIL_REASON_TAGS_KEY) keyed by the reason TEXT,
// so the existing failReasons array (a plain string list) is unchanged and old
// backups/setups keep restoring exactly as before.
const FAIL_REASON_TAGS_KEY = 'pat:failreasontags';   // v53: JSON { "<reason>": "earth|insulation|leakage|visual" }
const READING_FAIL_TAGS = ['visual', 'earth', 'insulation', 'leakage'];
const READING_FAIL_TAG_DEFAULT = 'visual';
// Built-in tags for the shipped DEFAULT_FAIL_REASONS (keyed by exact text). Any
// reason not listed here — including every custom reason — defaults to 'visual'.
const DEFAULT_FAIL_REASON_TAGS = {
  'Damaged Plug':                 'visual',
  'Damaged Lead':                 'visual',
  'Damaged Casing':               'visual',
  'Earth Continuity':             'earth',
  'Insulation Resistance':        'insulation',
  'Does Not Conform To BS 1363':  'visual'
};

// v27: Smart Quick Pick ordering-quality tuning. These shape how the learned
// history is matched and scored against a typed location — no storage change,
// they only affect how the existing history is read.
//   SQP_PARTIAL_WEIGHT — a learned bucket whose key only shares a WORD with the
//     typed location (not an exact match) contributes at this fraction of its
//     tally, so the location you actually typed dominates over neighbours that
//     merely share a word. Exact bucket matches always count full (weight 1).
//   SQP_SWAP_IN_MIN — a learned type must have at least this combined score at
//     the location to be eligible to "swap in" (displace a preset button). Stops
//     a one-off oddity from shoving a preset staple out of the row.
//   SQP_STAPLE_DEFENCE — a preset button with at least this learned score at the
//     location is a proven staple and is NEVER displaced by a swap-in.
const SQP_PARTIAL_WEIGHT = 0.5;   // v27: half weight for word-overlap (non-exact) matches
const SQP_SWAP_IN_MIN = 2;        // v27: min score here for a non-preset type to swap in
const SQP_STAPLE_DEFENCE = 2;     // v27: preset button at/above this score is protected

// v17: Sound feedback (opt-in audio confirmation). Stored as '1'|'0', default
// OFF ('0'). Distinct from haptics — this plays a short Web Audio tone on
// pass/fail/copy. Added because iOS 26.5 patched the <input switch> haptic
// trick the app relied on, leaving newer iPhones with no in-app vibration.
// Sound (plus the always-on visual flash) is the replacement confirmation
// channel for those devices, but it's off until the user turns it on.
const SOUNDFX_KEY = 'pat:soundfx';          // v17: '1' | '0', default '0'

// v17: Item timestamps. Stored as '1'|'0', default OFF ('0'). When ON, each
// item gets a `ts` (ISO string) stamped the moment it's first saved, shown in
// the Overview (HH:MM beneath the item type) and available as a CSV column.
// When OFF, no new stamps are written and existing ones are hidden everywhere.
// Timestamps were deliberately dropped back in v15; this is an opt-in revival,
// so existing users see no change unless they enable it.
const TIMESTAMPS_KEY = 'pat:timestamps';    // v17: '1' | '0', default '0'

// v16: Multi Pick. A single GLOBAL set of up to 6 named, ordered item-type
// sequences, plus a show/hide toggle for the entry-screen button. Stored as one
// JSON object under MULTIPICK_KEY:
//   { enabled: bool, slots: [ { name: string, items: [string, ...] }, ... ] }
// "enabled" gates the full-width Multi Pick button on the entry screen (default
// off — the feature is niche, only worth it on certain jobs). Each slot, when
// tapped, logs its items as PASS in order, auto-numbered, using the current
// Location field. Not tied to the item presets — one set shared everywhere.
// Slots with no items are dropped on save and never shown in the sheet.
const MULTIPICK_KEY = 'pat:multipick';
const MULTIPICK_MAX_SLOTS = 6;

// v15: Sessions-list filter persistence. Two independent filters that combine
// (AND) and sit beside the Sort control. Both default to 'all'.
//   SESSION_FILTER_KEY — export-state filter:
//       'all' | 'unexported' | 'exported' | 'modified'
//       ('unexported' here means status === 'none' — never exported; 'modified'
//        is its own option, distinct from 'unexported'.)
//   LOCK_FILTER_KEY    — lock-state filter: 'all' | 'unlocked' | 'locked'
const SESSION_FILTER_KEY = 'pat:sessionfilter';
const LOCK_FILTER_KEY = 'pat:lockfilter';

// v14: prune-age setting (months). Sessions that are BOTH exported AND older
// than this many months are surfaced as a prune suggestion inside the storage
// indicator on the Backup & Restore page. User-editable there. Default 12.
const PRUNE_AGE_KEY = 'pat:pruneagemonths';
const PRUNE_AGE_DEFAULT = 12;

// v12: calibration status thresholds for the User Settings chip + hub subtitle.
// CAL_DUE_SOON_DAYS — when the next-due date is within this many days from
//                     today, show an amber "Due in N days" chip.
// Anything past the due date is shown as red "Overdue · N days" regardless.
const CAL_DUE_SOON_DAYS = 30;

const BACKUP_REMINDER_DAYS = 7;
const BACKUP_SNOOZE_HOURS = 24;

// v56: Retest reminders — the commercial "chase the customer to rebook" tool.
// This is NOT a compliance due-date display; it's a business-development worklist
// for solo/commercial engineers who own the client relationship. It is gated TWICE
// so it never becomes noise:
//   1. RETEST_REMINDERS_KEY — master feature switch, OFF by default. While off,
//      nothing about reminders appears anywhere (no banner, no per-session control,
//      no view). Subcontract-only and non-commercial users never see it.
//   2. Per-session opt-in (session.retestTrack) — a reminder exists ONLY because the
//      engineer flagged THAT job as worth chasing. Defaults off per session. This is
//      what makes the list trustworthy: lost jobs, one-offs and subcontract work are
//      simply never flagged (or flagged then resolved). See session.js retest helpers.
// Urgency windows (days from today to the computed due date):
//   • Overdue   — due date is in the past.
//   • Due soon  — within RETEST_DUE_SOON_DAYS (the active "ring them now" band).
//   • Upcoming  — within RETEST_UPCOMING_DAYS (shown, but quiet — lead time to plan).
// Longer windows than calibration's 30 days because winning repeat work needs notice.
const RETEST_REMINDERS_KEY = 'pat:retestReminders';   // '1' = feature on; absent/anything else = off
const RETEST_DUE_SOON_DAYS = 60;
const RETEST_UPCOMING_DAYS = 90;

// v9: built-in defaults updated to Peter's working lists. These ship with fresh
// installs and back stop the "Reset to defaults" button on each settings sub-page.
// Existing users keep whatever they have until they tap Reset.
const DEFAULT_ITEM_TYPES = [
  'Lead', 'AC Adapter', 'Battery Charger',
  'Monitor', 'PC', 'Hub',
  'Extension', 'Fan', 'Heater'
];
const DEFAULT_FAIL_REASONS = [
  'Damaged Plug',
  'Damaged Lead',
  'Damaged Casing',
  'Earth Continuity',
  'Insulation Resistance',
  'Does Not Conform To BS 1363'
];
// v9: alphabetical Item Description list — autocomplete seed for fresh installs
// and the target of the new Reset button on the Item Description List page.
// Capitalisation tightened: AC, PC, USB, TV, CCTV, CD, PAT, NAS, UPS, VoIP,
// iMac, MacBook, Wi-Fi all rendered properly.
const DEFAULT_DESCRIPTIONS = [
  'AC Adapter', 'Air Conditioner', 'Air Fryer', 'Air Purifier', 'Amplifier',
  'Angle Grinder', 'Appliance', 'Barcode Scanner', 'Battery Charger',
  'Bench Grinder', 'Bench Power Supply', 'Blender', 'Cable', 'Camera',
  'Card Reader', 'Cash Drawer', 'CCTV Monitor', 'CD Player', 'Charging Station',
  'Chromebook', 'Circular Saw', 'Clock', 'Coffee Grinder', 'Coffee Machine',
  'Compressor', 'Computer Stand', 'Control Unit', 'Cooker', 'Curling Tongs',
  'Dehumidifier', 'Desk', 'Dishwasher', 'Display', 'Docking Station', 'Drill',
  'Electric Blanket', 'Ethernet Switch', 'Extension Lead', 'Extension Reel',
  'Extractor Fan', 'Fan', 'Fog Machine', 'Food Processor', 'Freezer', 'Fridge',
  'Glue Gun', 'Hair Dryer', 'Hair Straighteners', 'Hand Dryer', 'Hand Mixer',
  'Heat Gun', 'Heater', 'Hot Plate', 'Humidifier', 'iMac',
  'Interactive Whiteboard', 'Iron', 'Jigsaw', 'Juicer', 'Kettle', 'Kettle Base',
  'Keyboard', 'Label Printer', 'Laminator', 'Laptop', 'Lead', 'Light',
  'MacBook', 'Microscope', 'Microwave', 'Mitre Saw', 'Mixer', 'Mixer Amplifier',
  'Modem', 'Monitor', 'Mouse', 'NAS Drive', 'Network Switch', 'Oscilloscope',
  'Oven', 'Paper Cutter', 'Paper Punch', 'Patch Panel', 'PAT Tester', 'PC',
  'Phone Charger', 'Photocopier', 'Portable AC', 'Portable Heater',
  'Portable Projector', 'Portable Speaker', 'Power Supply', 'Pressure Washer',
  'Printer', 'Projector', 'Pump Controller', 'Radio', 'Receipt Printer',
  'Rice Cooker', 'Router', 'Scanner', 'Screen', 'Server', 'Sewing Machine',
  'Shredder', 'Signal Generator', 'Slow Cooker', 'Smart Board', 'Soldering Iron',
  'Soundbar', 'Speaker', 'Speaker System', 'Stage Light', 'Stapler',
  'Steam Cleaner', 'Subwoofer', 'Switch', 'Tablet', 'Test Meter', 'Thin Client',
  'Till', 'Toaster', 'Tripod', 'Tumble Dryer', 'TV', 'UPS', 'USB Charger',
  'Vacuum', 'Vending Machine', 'Visualiser', 'VoIP Phone', 'Washing Machine',
  'Water Boiler', 'Water Cooler', 'Water Pump', 'Whisk', 'Wi-Fi Access Point'
];

// v11: CSV column configuration.
//   id      — internal field key, NEVER renamed by the user. Used to look up
//             the value for each row in buildCSV() and to match incoming
//             columns in parseImportCSV().
//   header  — the column heading written to the CSV. User-customisable on
//             the new CSV Columns settings page; falls back to the default
//             value if blank on save.
//   visible — when false, the column is excluded from exports entirely.
//             Imports still recognise the column by header name when present.
//
// Column order in this list IS the export order. The user can reorder, hide,
// or rename columns via Settings → CSV Columns; the canonical defaults below
// are also what the Reset button restores.
//
// Adding a new column? Append to this list with a unique id, then add a
// matching case to the value-resolver in buildCSV() and the field-binder in
// parseImportCSV(). Old user configs missing the new column will pick it up
// automatically via ensureAllCsvColumns() on next load.
const DEFAULT_CSV_COLUMNS = [
  { id: 'assetNo',     header: 'Asset ID',      visible: true  },
  { id: 'engineer',    header: 'Engineer name', visible: true  },
  { id: 'description', header: 'Description',   visible: true  },
  // v26: Client column split out from the combined Site snapshot. The session's
  // `site` field stores a combined "Client — Site" text snapshot (back-compat);
  // for CSV we now resolve the two parts separately (see csvCellValue). Default
  // HIDDEN (Q4=B) so existing users' export width is unchanged until they opt in;
  // turn on via Settings → CSV Columns. Inserted before 'site' so, when shown,
  // Client reads left-of Site naturally. The 'site' column id/header are kept
  // exactly as before so saved column configs and renamed headers survive.
  { id: 'client',      header: 'Client',        visible: false },
  { id: 'site',        header: 'Site',          visible: true  },
  { id: 'location',    header: 'Location',      visible: true  },
  { id: 'date',        header: 'Date',          visible: true  },
  { id: 'result',      header: 'Result',        visible: true  },
  { id: 'notes',       header: 'Notes',         visible: true  },
  // v12: tester + calibration info, sourced from state.testerMake/Model +
  // state.calDate / state.calCertNo / state.calDue (NOT session-stamped —
  // these are current engineer-global values at export time). Default hidden
  // so existing users' exports don't suddenly grow new columns; turn on via
  // Settings → CSV Columns.
  // v13: 'tester' column now combines testerMake + testerModel (space-
  // separated, trimmed). Default header relabelled to "Test Instrument" to
  // match the User Settings copy; the column id stays 'tester' so existing
  // saved column configs migrate cleanly via ensureAllCsvColumns(). Existing
  // users who customised the header keep their customisation.
  // v66: resolves from the SESSION's stamped instrument (falling back to the
  // active one for pre-v66 jobs), not from the global fields.
  { id: 'tester',      header: 'Test Instrument', visible: false },
  { id: 'calDate',     header: 'Cal. Date',     visible: false },
  { id: 'calCertNo',   header: 'Cal. Cert No.', visible: false },
  { id: 'calDue',      header: 'Cal. Due',      visible: false },
  // v17: per-item timestamp (date + time the item was first logged). Sourced
  // from item.ts (ISO). Default hidden so existing users' exports don't grow a
  // column. Produces blanks when the Item Timestamps setting is OFF, or for
  // items logged before timestamps were enabled. Turn the column on via
  // Settings → CSV Columns; turn capture on via Settings → Display.
  { id: 'time',        header: 'Time',          visible: false },
  // v53: Test Readings columns. All default HIDDEN so existing users' exports
  // are unchanged until they opt in (Settings → CSV Columns), exactly like the
  // v12 tester/cal and v17 time columns. Each resolves from item.readings (see
  // csvCellValue); they emit BLANK when the Test Readings feature is OFF, when
  // the column is hidden, or for any item with no reading recorded for that
  // field — so turning a column on never invents data. 'class' carries the
  // equipment class (I/II/III); the three measurement columns carry the
  // as-typed reading text.
  { id: 'readingClass',      header: 'Class',           visible: false },
  { id: 'readingEarth',      header: 'Earth (Ω)',       visible: false },
  { id: 'readingInsulation', header: 'Insulation (MΩ)', visible: false },
  { id: 'readingLeakage',    header: 'Leakage (mA)',    visible: false },
  // v55: polarity (Class I only). 'Yes' when an item recorded a polarity tick,
  // blank otherwise — same emit-only-real-data rule as the columns above.
  { id: 'readingPolarity',   header: 'Polarity',        visible: false }
];

// v8: Resistance calculator — IET Code of Practice Table V1.1 nominal values.
// Earth continuity limit = (0.1 + R)Ω, where R = length × per-metre resistance.
// CSAs and lengths chosen to match pat-testing-training.net/articles/earth-limits.php
const CSA_RESISTANCE = {
  '0.5':  0.039,
  '0.75': 0.026,
  '1.0':  0.0195,
  '1.25': 0.0156,
  '1.5':  0.0133,
  '2.5':  0.008
};
const CALC_LENGTHS = [0.25, 0.5, 0.75, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
  31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50,
  51, 52];
