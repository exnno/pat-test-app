/*!
 * PATGo PWA — utils.js (pure helpers)
 * v22 (June 2026)
 * Copyright (c) 2026 Peter Birchley. All rights reserved.
 * Unauthorised use, reproduction, or distribution prohibited.
 * See LICENSE.txt for full terms.
 *
 * Stateless utility functions: HTML escaping, string case, date/time
 * formatting, asset-number splitting, CSV value escaping, byte formatting.
 * None of these read or write the global state object.
 */

const escapeHTML = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const capitalise = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

// v68 (D2): an apostrophe is a word boundary, so the old /\b\w/g turned
// "Bob's Office" into "Bob'S Office" — and because this runs on locations and
// item types it reached certificates and CSV exports, not just the screen.
//
// ⚠⚠ v68.1: THERE IS MORE THAN ONE APOSTROPHE CHARACTER, AND THE PHONE DOES NOT
// TYPE THE ONE YOU EXPECT. iOS smart punctuation silently substitutes a RIGHT
// SINGLE QUOTATION MARK (U+2019, ’) for the ASCII apostrophe (U+0027, ') as you
// type. The v68 fix only matched U+0027, so on an actual iPhone the curly
// apostrophe was not recognised as an apostrophe at all, the "s" read as a
// separate word, and the bug behaved exactly as it had in v67.
//
// The v68 harness did not catch this because every assertion was a JavaScript
// string literal in a source file, which means every one of them used U+0027 —
// the character the device never produces. Testing the function is not testing
// the path. Tests for this function MUST include U+2019 (see harness 06e2).
//
// U+02BC (ʼ, modifier letter apostrophe) is included too: some third-party and
// non-English keyboards emit it, and it costs nothing to accept here.
//
// ⚠ THE FIX MUST NOT SIMPLY IGNORE APOSTROPHES. "o'brien" → "O'Brien" is
// CORRECT and people are named that. The only thing that must be left alone is
// a SINGLE letter following an apostrophe — the English possessive. Anything
// longer is a real name fragment and still gets capitalised.
//
// The character the user typed is PRESERVED, not normalised to ASCII — what
// goes on the certificate should be what they entered.
//
// No lookbehind: Safari only gained it in 16.4 and this file has to run on
// whatever a tester is carrying.
const APOSTROPHES = "'\u2019\u02BC";   // U+0027, U+2019, U+02BC

function titleCase(s) {
  return String(s || '').replace(/(['\u2019\u02BC]?)(\w+)/g, (m, apo, word) =>
    (apo && word.length === 1)
      ? m
      : apo + word.charAt(0).toUpperCase() + word.slice(1)
  );
}

// v69 (D5): repair a string that was title-cased by a PRE-V68.1 build.
//
// titleCase() only ever uppercases, so re-running it cannot undo its own old
// mistake — `Bob'S Office` stays `Bob'S Office` forever. This is the inverse
// operation, and it is the only function in the app that lowercases a letter
// the user might have typed deliberately. That makes the guard below the whole
// design, not a detail.
//
// THE TRAP: `BOB'S OFFICE` is deliberate shouting, not the bug. Lowercasing
// blindly turns it into `BOB's OFFICE`, which is a NEW defect introduced by the
// repair — strictly worse than the one being fixed, because the user typed that
// string on purpose and we would be overruling them.
//
// The rule (Q2 = A): only lowercase a lone capital after an apostrophe when the
// word BEFORE the apostrophe is not itself all-caps. `Bob'S` is mixed case, so
// the trailing capital can only have come from titleCase() — repair it. `BOB'S`
// is all-caps throughout, so the capital is consistent with what was typed —
// leave it alone. A user who genuinely wants `Bob'S` loses; that string has no
// legitimate meaning in English and the alternative loses real data.
//
// Only a SINGLE letter followed by a non-letter qualifies (Q3 = A), which is the
// same test titleCase() uses to decide what to skip. `O'Brien` and `D'Angelo`
// have multi-letter suffixes and are never touched, in either direction.
//
// All three apostrophe characters are handled, because iOS types U+2019 and a
// paste can carry U+02BC. The character itself is PRESERVED, never normalised —
// same principle as titleCase(): what goes on the certificate is what was typed.
//
// No lookbehind (Safari 16.4), so the word before the apostrophe is captured and
// re-emitted rather than asserted.
function repairApostropheCase(s) {
  return String(s || '').replace(
    /([A-Za-z]+)(['\u2019\u02BC])([A-Z])(?![A-Za-z])/g,
    (m, word, apo, letter) =>
      word === word.toUpperCase()
        ? m                                    // BOB'S — deliberate caps, untouched
        : word + apo + letter.toLowerCase()    // Bob'S → Bob's
  );
}

function formatDate(iso) {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// v17: format an item timestamp (full ISO) as HH:MM in the device's local
// time, for the Overview row. Returns '' for missing/invalid input so callers
// can omit the line entirely.
function formatTimeShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// v17: format an item timestamp for CSV — full local date + time, e.g.
// "09/06/2026 14:32". The Date column is date-only, so the Time column carries
// the more precise stamp. Local time matches what the engineer saw on screen.
function formatTimestampCSV(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mo}/${yy} ${hh}:${mm}`;
}

// v61: plain-language elapsed time for the testing-time figure. Takes
// milliseconds, returns e.g. "3h 12m", "47m", "under a minute". Deliberately
// never shows seconds — nobody testing appliances cares, and a figure like
// "0h 3m 41s" reads like a stopwatch rather than a working day.
//
// PURE: takes a number, returns a string, touches no state. The DECISION about
// whether there is a duration at all (multi-day spans, too few timestamps) is
// made by sessionDuration() in session.js — this only formats a number it has
// already been told is worth showing.
function formatDurationShort(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < DURATION_MIN_MS) return 'under a minute';
  const totalMins = Math.round(n / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

// v60: now also reports the WIDTH of the trailing digit run, so leading zeros
// survive auto-increment. Before v60 this returned only {prefix, number} and the
// parseInt threw the zeros away — type 001 and the next item came out as 2.
//
// `width` is the character count of the digit run as typed ('001' → 3), so
// nextAssetNo can pad the incremented value back to the same width. It is
// reported for EVERY asset number, not just zero-padded ones: '12' → width 2,
// which pads to a no-op. That keeps the rule uniform ("pad to the previous
// width") instead of needing a separate "did it have leading zeros?" branch.
function splitAssetNo(s) {
  if (!s) return { prefix: '', number: null, width: 0 };
  const m = String(s).match(/^(.*?)(\d+)$/);
  if (!m) return { prefix: String(s), number: null, width: 0 };
  return { prefix: m[1], number: parseInt(m[2], 10), width: m[2].length };
}

// v60: pad a number back to a digit width, NEVER truncating (decision 7).
// 99 at width 3 → '099'; 100 at width 2 → '100', not '00'. Width only ever
// grows, so a job can roll past its padding without the numbers going wrong —
// the alternative (wrapping or clipping) would silently produce duplicate asset
// numbers on a real job, which is the one outcome worth designing against.
// v60: read a pad width off what the engineer typed into the New Session start
// number box. Returns 0 unless the value BEGINS with a zero — i.e. padding is
// opt-in by deliberate act (decision 8A: "if you've included leading zeros you
// clearly want that; the default is without"). '001' → 3, '1' → 0, '10' → 0.
// A lone '0' is not padding, so it returns 0 too.
function assetPadFromInput(v) {
  const s = String(v == null ? '' : v).trim();
  if (!/^\d+$/.test(s)) return 0;
  if (s.length < 2 || s[0] !== '0') return 0;
  return Math.min(s.length, ASSET_PAD_MAX);
}

function padAssetNumber(n, width) {
  const s = String(n);
  const w = (typeof width === 'number' && isFinite(width) && width > 0)
    ? Math.min(Math.floor(width), ASSET_PAD_MAX)
    : 0;
  return s.length >= w ? s : s.padStart(w, '0');
}

// ---------- CSV ----------
function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// v11: result-cell wording for CSV exports only. Maps internal 'pass'/'fail'
// strings (which the app state uses everywhere — entry screen, overview,
// fail-reason notes) to the longer 'Passed'/'Failed' labels Peter prefers in
// CSVs sent to clients. The in-app UI is unchanged; this transformation is
// applied ONLY in buildCSV's value resolver below.
//
// Import recognises both spellings (pass/passed and fail/failed,
// case-insensitive), so old CSVs exported by v10 or earlier still round-trip.
function csvResultLabel(internal) {
  const v = String(internal || '').toLowerCase();
  if (v === 'pass') return 'Passed';
  if (v === 'fail') return 'Failed';
  return '';
}

function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

// v35: parse a #rgb or #rrggbb hex string to an [r,g,b] array (0–255) for jsPDF
// colour calls. Returns the provided fallback (default mid-grey) on anything
// unparseable, so a garbage colour can never throw inside the report builder.
function hexToRgb(hex, fallback) {
  const fb = fallback || [40, 40, 40];
  if (typeof hex !== 'string') return fb;
  const had = hex.trim().charAt(0) === '#';
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3 && had) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return fb;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// v35: pick black or white for text drawn on top of the given [r,g,b] fill, by
// perceived luminance (so a light header band gets dark text and vice versa).
function contrastColor(rgb) {
  const [r, g, b] = Array.isArray(rgb) ? rgb : [40, 40, 40];
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? [0, 0, 0] : [255, 255, 255];
}

// v35: validate a hex colour string for storage. Returns a normalised
// '#rrggbb' (lowercased) or the fallback if invalid. Used by
// normaliseReportSettings so stored/backed-up/imported colours are always safe.
// 3-char shorthand is only honoured when explicitly '#'-prefixed, so a bare word
// that happens to be hex-ish (e.g. 'bad' → b,a,d) can't masquerade as a colour
// on the import path.
function safeHexColor(hex, fallback) {
  if (typeof hex !== 'string') return fallback;
  const had = hex.trim().charAt(0) === '#';
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3 && had) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return fallback;
  return '#' + h.toLowerCase();
}

// v43: reusable long-press detector. Attaches to an element and calls onLongPress()
// if the pointer stays down for durationMs (default 2000 ms). Tracks via pointer events
// so it works on both touch and mouse. Multiple calls on different elements are safe.
// Returns a cleanup function to remove the listener.
function setupLongPress(element, durationMs, onLongPress) {
  if (!element) return () => {};
  const duration = durationMs || 2000;
  let timerId = null;
  let isLongPress = false;

  const onPointerDown = () => {
    isLongPress = false;
    timerId = setTimeout(() => {
      isLongPress = true;
      onLongPress();
    }, duration);
  };

  const onPointerUp = () => {
    if (timerId) clearTimeout(timerId);
    timerId = null;
  };

  const onPointerCancel = () => {
    if (timerId) clearTimeout(timerId);
    timerId = null;
  };

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointerup', onPointerUp);
  element.addEventListener('pointercancel', onPointerCancel);

  // Return cleanup function
  return () => {
    if (timerId) clearTimeout(timerId);
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointerup', onPointerUp);
    element.removeEventListener('pointercancel', onPointerCancel);
  };
}


// v53: Test Readings — validate/normalise an item's readings object. Used at
// every boundary where a readings object enters from outside trusted code: on
// backup RESTORE (a hand-edited or corrupt file) and, in the future, on cloud
// SYNC (data from the server). Returns a clean object with only known fields, or
// null if there's nothing worth keeping — and a null/dropped result means the
// item simply has no readings (reads as "feature was off for this item"), which
// is always safe. This is the "garbage collapses to a safe default" rule applied
// to the one structured field test readings adds.
//
//   • class      — kept only if it's one of READING_CLASSES; else dropped.
//   • earth/insulation/leakage — kept as trimmed STRINGS (stored as-typed); any
//     non-string coerces to '' (then drops if empty). No numeric parsing — the
//     stored value is exactly what the engineer typed ('<0.1', '≥19.99', etc.).
//   • A field that doesn't apply to the class is NOT forced out here — we keep
//     any non-empty measurement the file carried rather than silently discarding
//     data, but the entry sheet only ever WRITES applicable fields. Defensive,
//     not destructive.
//   • If, after cleaning, the object has no class AND no measurements, return
//     null so the item carries no empty readings husk.
function normaliseItemReadings(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const out = {};
  if (typeof r.class === 'string' && READING_CLASSES.indexOf(r.class) !== -1) {
    out.class = r.class;
  }
  ['earth', 'insulation', 'leakage'].forEach(k => {
    const v = (typeof r[k] === 'string') ? r[k].trim() : '';
    if (v) out[k] = v;
  });
  // v54: polarity — a Class I-only boolean tick. Carried through only when true
  // AND the (normalised) class supports it, so a stale tick from a since-changed
  // class can't survive, and false/absent never writes a key (keeps the object
  // byte-identical to the v53 shape when unused). This runs on BOTH save and
  // restore, so additive old backups (no polarity) round-trip untouched.
  if (r.polarity === true && ('class' in out) && READING_POLARITY_CLASSES.indexOf(out.class) !== -1) {
    out.polarity = true;
  }
  const hasMeasurement = ('earth' in out) || ('insulation' in out) || ('leakage' in out) || (out.polarity === true);
  if (!('class' in out) && !hasMeasurement) return null;
  return out;
}

// v75: the ONE way anything inside a bottom sheet takes focus.
//
// A bare `.focus()` on a field inside a `position: fixed` sheet makes iOS scroll
// the document to "reveal" it — which drags the fixed overlay around the screen
// while the sheet's own scroller is also moving. That document scroll is the
// jumping, and it is never wanted here: the sheet is already fully visible, and
// v75's CSS keeps it that way above the keyboard.
//
// ⚠ scanner.js's focusAssetForScan() has carried this guard, with its reasoning,
// since v67 — and the sheets never inherited it. That gap is the whole reason
// this helper exists: the knowledge was in the codebase, in a comment, in one
// file, where nothing made the other five call sites pick it up.
//
// `preventScroll` is not universally supported and older WebKit throws on the
// options object rather than ignoring it, so the fallback is a bare focus() —
// which is precisely v74's behaviour. Failing back to the old bug beats failing
// to focus at all: a field that never takes focus is a dead form.
function focusInSheet(el) {
  if (!el) return;
  try {
    el.focus({ preventScroll: true });
  } catch (e) {
    try { el.focus(); } catch (e2) {}
  }
}
