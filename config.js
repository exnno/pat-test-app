/*!
 * PAT Test PWA — config.js (constants & defaults)
 * v24 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 *
 * All app-wide constants: version label, localStorage key names, default
 * lists (item types, fail reasons, descriptions, CSV columns) and the
 * resistance-calculator lookup tables. Pure data — no functions, no state.
 * Loaded first; everything else may reference these globals.
 */

const APP_VERSION = 'V32';

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
const V12_WELCOME_KEY = 'pat:v12welcome';   // v13: legacy. Not referenced; left documented.
const V13_WELCOME_KEY = 'pat:v13welcome';   // v14: legacy. Orphaned, harmless.
const V14_WELCOME_KEY = 'pat:v14welcome';   // v15: legacy. Orphaned, harmless.
const V15_WELCOME_KEY = 'pat:v15welcome';   // v16: legacy. Orphaned, harmless.
const V16_WELCOME_KEY = 'pat:v16welcome';   // v16
const V17_WELCOME_KEY = 'pat:v17welcome';   // v17: legacy. Orphaned, harmless.
const V18_WELCOME_KEY = 'pat:v18welcome';   // v18
const V19_WELCOME_KEY = 'pat:v19welcome';   // v19
const V20_WELCOME_KEY = 'pat:v20welcome';   // v20
const V26_WELCOME_KEY = 'pat:v26welcome';   // v26: Clients & Sites flexibility + split CSV
const V27_WELCOME_KEY = 'pat:v27welcome';   // v27: Smart Quick Pick ordering quality
const V30_WELCOME_KEY = 'pat:v30welcome';   // v30: PDF Reports
const V31_WELCOME_KEY = 'pat:v31welcome';   // v31: Export/Import Setup + named PDF files
const V32_WELCOME_KEY = 'pat:v32welcome';   // v32: settings restructure + search

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
    pages: ['settingsBackup'] },
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
  settingsReport:      { icon: '📄', title: 'Report Settings',       aliases: 'pdf report logo branding company certificate filename declaration' },
  settingsCsv:         { icon: '📊', title: 'CSV Columns',           aliases: 'csv columns spreadsheet export headers excel' },
  settingsClients:     { icon: '🏢', title: 'Clients',               aliases: 'clients sites customers addresses' },
  settingsDisplay:     { icon: '🎨', title: 'Display Settings',      aliases: 'theme dark light haptics sound timestamps appearance' },
  settingsCalculator:  { icon: '🧮', title: 'Resistance Calculator', aliases: 'earth continuity resistance limit ohms calculator csa' },
  settingsBackup:      { icon: '💾', title: 'Backup & Restore',      aliases: 'backup restore export import data setup share' },
  settingsAbout:       { icon: 'ℹ️', title: 'About',                 aliases: 'about version changelog whats new' },
  settingsContact:     { icon: '✉️', title: 'Contact',              aliases: 'contact support email help feedback' }
};

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
    declaration:      true,    // print the declaration/signature line
    declarationText:  REPORT_DECLARATION_DEFAULT,
    // v31: PDF filename pattern. Tokens {site} {client} {date} {engineer} plus
    // free text; substituted + sanitised by reportFilename(). Seeded to the exact
    // pre-v31 behaviour so nothing changes unless the user edits it.
    reportFilenamePattern: REPORT_FILENAME_DEFAULT
  };
}

// v30: logo upload constraint — longest edge downscaled to this many px before
// base64 storage, to keep localStorage and JSON backups sane.
const REPORT_LOGO_MAX_PX = 600;

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
