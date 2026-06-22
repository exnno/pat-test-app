/*!
 * PATGo PWA — config.js (constants & defaults)
 * v51 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 *
 * All app-wide constants: version label, localStorage key names, default
 * lists (item types, fail reasons, descriptions, CSV columns) and the
 * resistance-calculator lookup tables. Pure data — no functions, no state.
 * Loaded first; everything else may reference these globals.
 */

const APP_VERSION = 'V51';

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
// Welcome-modal "seen" key. v50: only the CURRENT welcome key is kept. The 28
// historical keys (V12…V48) were removed — each was a one-release marker that
// nothing referenced after its version shipped. The keys still sit harmlessly in
// existing users' localStorage; storage.js detects them by prefix for the
// first-run-wizard gate, so nothing about upgrade behaviour changes. When a future
// feature release rolls a new welcome, replace the line below with the new key
// (e.g. V51_WELCOME_KEY) and pass it to dismissWelcome() — no new symbol pile.
const V49_WELCOME_KEY = 'pat:v49welcome';   // v49: PATGo footer logo + onboarding icon + tour long-press note

// v47: how long (ms) to hold the quick-pick grid before the preset switcher
// sheet opens. Deliberately a single named constant so the threshold can be
// tuned in one edit. NOTE: 2000ms is a long hold for touch — if it feels
// unresponsive on the phone, drop this to ~600 (the usual long-press sweet spot).
const QUICK_PICK_LONGPRESS_MS = 2000;
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
    pages: ['settingsItems', 'settingsFails', 'settingsMultiPick', 'settingsDescriptions'] },
  { id: 'catReports', icon: '📄', title: 'Reports & Output', blurb: 'PDF reports, CSV export and your clients',
    pages: ['settingsReport', 'settingsCsv', 'settingsClients'] },
  { id: 'catApp',     icon: '🎨', title: 'App & Display', blurb: 'Appearance and the resistance calculator',
    pages: ['settingsDisplay', 'settingsCalculator'] },
  { id: 'catData',    icon: '💾', title: 'Data', blurb: 'Back up, restore and share your setup',
    pages: ['settingsBackup', 'settingsSetup'] },
  { id: 'catHelp',    icon: 'ℹ️', title: 'Help', blurb: 'About this app and how to get in touch',
    pages: ['settingsAbout', 'settingsContact'] }
];

// Per-page metadata for the category sub-lists and for search. icon/title shown
// on the row; `aliases` widen search matching. Subtitles are computed live in
// renderSettingsCategory (counts/status), so they're not stored here.
const SETTINGS_PAGE_META = {
  settingsUser:        { icon: '👤', title: 'User Settings',         aliases: 'engineer name calibration cal due instrument' },
  settingsItems:       { icon: '⚡', title: 'Quick Pick Items',      aliases: 'item types presets quick pick buttons' },
  settingsFails:       { icon: '⚠️', title: 'Quick Pick Fail',       aliases: 'fail reasons failure quick pick' },
  settingsMultiPick:   { icon: '🧰', title: 'Multi Pick',            aliases: 'multi pick bulk multiple slots' },
  settingsDescriptions:{ icon: '📝', title: 'Item Description List', aliases: 'descriptions notes labels' },
  settingsReport:      { icon: '📄', title: 'Report Settings',       aliases: 'pdf report logo branding company certificate filename declaration signature sign colour color theme header accent cert number template preset notes' },
  settingsCsv:         { icon: '📊', title: 'CSV Columns',           aliases: 'csv columns spreadsheet export headers excel' },
  settingsClients:     { icon: '🏢', title: 'Clients',               aliases: 'clients sites customers addresses' },
  settingsDisplay:     { icon: '🎨', title: 'Display Settings',      aliases: 'theme dark light haptics sound timestamps appearance' },
  settingsCalculator:  { icon: '🧮', title: 'Resistance Calculator', aliases: 'earth continuity resistance limit ohms calculator csa' },
  settingsBackup:      { icon: '💾', title: 'Backup & Restore',      aliases: 'backup restore export import data save json' },
  settingsSetup:       { icon: '🔁', title: 'Export / Import Setup', aliases: 'setup share configuration new device employee copy presets transfer' },
  settingsAbout:       { icon: 'ℹ️', title: 'About',                 aliases: 'about version changelog whats new' },
  settingsContact:     { icon: '✉️', title: 'Contact',              aliases: 'contact support email help feedback' }
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
    showInstrument:   true,    // sources state.testerMake / testerModel
    showCalibration:  true,    // sources state.calDate / calCertNo / calDue
    retestEnabled:    false,
    retestMonths:     null,    // no default (Q10=B); required when retestEnabled
    showFails:        true,    // false = passes-only register
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

// v49: the PATGo footer logo, embedded as a small base64 PNG so it renders in
// the PDF with zero network access (reports must work fully offline). This is a
// 48x48 downscale of the app icon, drawn ~11pt square next to the footer credit
// text when both `showAppCredit` and `showFooterLogo` are on. First-party asset,
// not a vendored dependency. ~4.6 KB — trivial next to the user-logo data URL.
const PATGO_FOOTER_LOGO = 'data:image/png;base64,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';

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
  { id: 'tester',      header: 'Test Instrument', visible: false },
  { id: 'calDate',     header: 'Cal. Date',     visible: false },
  { id: 'calCertNo',   header: 'Cal. Cert No.', visible: false },
  { id: 'calDue',      header: 'Cal. Due',      visible: false },
  // v17: per-item timestamp (date + time the item was first logged). Sourced
  // from item.ts (ISO). Default hidden so existing users' exports don't grow a
  // column. Produces blanks when the Item Timestamps setting is OFF, or for
  // items logged before timestamps were enabled. Turn the column on via
  // Settings → CSV Columns; turn capture on via Settings → Display.
  { id: 'time',        header: 'Time',          visible: false }
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
