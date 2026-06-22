/*!
 * PAT Test PWA — utils.js (pure helpers)
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

function titleCase(s) {
  return String(s || '').replace(/\b\w/g, c => c.toUpperCase());
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

function splitAssetNo(s) {
  if (!s) return { prefix: '', number: null };
  const m = String(s).match(/^(.*?)(\d+)$/);
  if (!m) return { prefix: String(s), number: null };
  return { prefix: m[1], number: parseInt(m[2], 10) };
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
  const hasMeasurement = ('earth' in out) || ('insulation' in out) || ('leakage' in out);
  if (!('class' in out) && !hasMeasurement) return null;
  return out;
}
