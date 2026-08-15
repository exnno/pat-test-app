/*!
 * PATGo PWA — data.js (data tables)
 * v71 (August 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 */

// ============== PATGo PWA — v71 — Data tables ==============
// Extracted from config.js in V71. Every block below is BYTE IDENTICAL to its
// V70 form — the release is a move, not a rewrite. Proved by reassembly: the
// stripped config.js plus these blocks, put back at their original offsets,
// hashes the same as V70's config.js.
//
// WHY THIS FILE EXISTS: config.js had grown to 1,086 lines / 71 KB, and the
// long lists made up a third of it. Looking up one tuning number — a timeout,
// a cap, a storage key — meant dragging the whole item-description list and the
// calculator tables along with it. Reading is the cost this split is aimed at,
// not runtime. config.js now holds constants and factories; the lists live here.
//
// WHAT BELONGS HERE: static tables and lists. Things with no logic in them that
// are read, mapped over or copied from. If it is a value you would tune, it
// belongs in config.js; if it is a list you would edit an entry of, it belongs
// here.
//
// WHAT DOES NOT: storage key names (config.js — they are identity, not data),
// caps and timeouts (config.js), and anything with a function body. There are
// no functions in this file at all, deliberately.
//
// ⚠ LOAD POSITION IS NOT FREE CHOICE. This file must load immediately after
// config.js and BEFORE state.js. state.js seeds itemTypes/failReasons from
// DEFAULT_ITEM_TYPES / DEFAULT_FAIL_REASONS in its top-level initialiser, which
// runs at load. Put data.js after state.js and that initialiser throws,
// `state` is left in the temporal dead zone, and the boot integrity guard trips
// on the `state` check. The app recovers to the crash screen rather than
// white-screening, but it does not start.
//
// ⚠ config.js runs BEFORE this file and does reference three names from it:
// makeEmptyBugDraft() reads BUG_REPORT_TYPE_DEFAULT, BUG_REPORT_SEVERITY_DEFAULT
// and BUG_REPORT_REPRO_DEFAULT. That is safe ONLY because they are read inside a
// function body, at call time, long after both files have loaded. Do not move
// any of those reads to config.js top level, and do not add a top-level config.js
// const that is initialised from anything in here.
//
// ⚠ The boot integrity probe for this file is a CONSTANT probe, not a function
// probe. Top-level `const` does not attach to `window`, and this file declares
// no functions, so the `requiredFns` loop in boot.js is structurally blind to it.
// See the constants section of bootIntegrityOK().


// ---------- Bug report option lists ----------
// The three report types, the severity ladder and the
// "can you make it happen again?" options. Read by bugreport.js to build the
// pickers, and by makeEmptyBugDraft() in config.js for the defaults.

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


// ---------- Settings hub structure ----------
// v32 two-level Settings. The single source of truth
// for the hub, the category sub-lists, settings search and back-navigation.
// Adding a settings page means adding it in both tables here and nowhere else.

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


// ---------- PATGo footer logo (base64 PNG) ----------
// The single biggest value in the old
// config.js at 5 KB on one line, and the clearest reason this file exists.

// v49: the PATGo footer logo, embedded as a small base64 PNG so it renders in
// the PDF with zero network access (reports must work fully offline). This is a
// 48x48 downscale of the app icon, drawn ~11pt square next to the footer credit
// text when both `showAppCredit` and `showFooterLogo` are on. First-party asset,
// not a vendored dependency. ~4.6 KB — trivial next to the user-logo data URL.
const PATGO_FOOTER_LOGO = 'data:image/png;base64,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';


// ---------- Setup bundle sections ----------
// SETUP_KIND and SETUP_BUNDLE_VERSION stay in
// config.js — they are format identity, not data. The section table is here.

// SETUP_SECTIONS is the single source of truth mapping the five user-facing
// groups to the state fields each carries. The export include-list, the bundle
// builder, and the importer all read this — add a field in one place only.
const SETUP_SECTIONS = [
  { id: 'presets',     label: 'Quick Pick presets & lists',  hint: 'Item presets, fail reasons, descriptions' },
  { id: 'report',      label: 'Report settings',             hint: 'Branding, logo, filename, declaration' },
  { id: 'csv',         label: 'CSV columns',                 hint: 'Column order, visibility, headers' },
  { id: 'tester',      label: 'Tester & calibration details', hint: 'Instrument make/model, calibration info' },
  { id: 'prefs',       label: 'App preferences',             hint: 'Theme, haptics, sound, timestamps, Multi Pick, Smart Quick Pick on/off' }
];


// ---------- Equipment classes and reading fields ----------
// v53. Which reading rows appear for
// which class, their labels, units, placeholders and validation bands.

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


// ---------- Fail reason tags ----------
// v53. The tag vocabulary and the built-in tags for the
// shipped default fail reasons. FAIL_REASON_TAGS_KEY stays in config.js.

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


// ---------- Built-in defaults and calculator tables ----------
// The lists a fresh install starts
// with and the "Reset to defaults" targets, plus the IET resistance lookup.

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
