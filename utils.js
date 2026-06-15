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

