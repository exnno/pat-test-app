/* V154 (audit finding 3). Finds every ${…} inside a template literal that
   builds page markup, and reports the ones that put a stored value into the
   page without escapeHTML(). Used by harness group 93a.
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   What counts as "a stored value": a field PATGo saves and that a backup file
   or the cloud can carry — read off a record (s.id, it.result, rs.logo …,
   the FIELDS list below) — or a value passed through formatDate() /
   capitalise(), which hand anything that isn't a date / a word back as it was.
   Safe without escaping, and so not reported:
     • the whole value inside escapeHTML(…) (or icon(…), fixed SVG)
     • a field only TESTED: `s.locked ? ' locked' : ''`, `x === y ? 'a' : 'b'`
     • a count: `s.items.length`
   ⚠ WHAT THIS CANNOT SEE: a stored value copied into a plain local first and
   that local put in raw (`const t = s.title; … ${t}`), or built with '+'. The
   sweep that wrote V154 traced every one of those by hand (none raw); the scan
   keeps the direct form — by far the common one — from coming back. */

'use strict';

const FIELDS = ['id', 'result', 'date', 'logo', 'signature', 'url', 'name', 'site', 'client',
  'location', 'itemType', 'assetNo', 'notes', 'title', 'email', 'certNo', 'engineer', 'label',
  'address', 'companyName', 'companyAddress', 'reportTitle', 'make', 'model', 'serial',
  'calCertNo', 'calDate', 'calDue', 'reason', 'description', 'pin', 'mapPin', 'sessionId',
  'itemId', 'jobId', 'businessId', 'role', 'org', 'text', 'value', 'qp', 'header', 'accent'];
const FIELD_RE = new RegExp('(?:^|[^\\w$.])([A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*|\\[[^\\]]*\\])*)\\.(' + FIELDS.join('|') + ')\\b(?!\\s*\\()', 'g');

// Template literals with their ${…} parts, nested ones included (each nested
// template is reported on its own).
function templates(src) {
  const out = []; const n = src.length; let i = 0;
  const skipStr = (k, q) => { k++; while (k < n && src[k] !== q) { if (src[k] === '\\') k++; k++; } return k + 1; };
  const skipRegex = (k) => { k++; let cls = false; while (k < n) { const ch = src[k]; if (ch === '\\') { k += 2; continue; } if (ch === '[') cls = true; else if (ch === ']') cls = false; else if (ch === '/' && !cls) break; else if (ch === '\n') return k; k++; } return k + 1; };
  const regexOk = (k) => { let j = k - 1; while (j >= 0 && /\s/.test(src[j])) j--; return j < 0 || /[(,=:[!&|?{};+\-*%<>~^]/.test(src[j]) || /\b(return|typeof|case|in|of)$/.test(src.slice(Math.max(0, j - 6), j + 1)); };
  function tpl(k) {
    const start = k; k++; const parts = []; let buf = '';
    while (k < n) {
      const ch = src[k];
      if (ch === '\\') { buf += src.slice(k, k + 2); k += 2; continue; }
      if (ch === '`') { parts.push({ lit: buf }); out.push({ line: src.slice(0, start).split('\n').length, parts }); return k + 1; }
      if (ch === '$' && src[k + 1] === '{') {
        parts.push({ lit: buf }); buf = '';
        let j = k + 2, depth = 1; const es = j;
        while (j < n && depth) {
          const d = src[j];
          if (d === '\'' || d === '"') { j = skipStr(j, d); continue; }
          if (d === '`') { j = tpl(j); continue; }
          if (d === '/' && src[j + 1] === '/') { j = src.indexOf('\n', j); continue; }
          if (d === '/' && src[j + 1] === '*') { j = src.indexOf('*/', j) + 2; continue; }
          if (d === '{') depth++; else if (d === '}') depth--;
          j++;
        }
        parts.push({ expr: src.slice(es, j - 1), line: src.slice(0, es).split('\n').length });
        k = j; continue;
      }
      buf += ch; k++;
    }
    return k;
  }
  while (i < n) {
    const ch = src[i];
    if (ch === '\'' || ch === '"') { i = skipStr(i, ch); continue; }
    if (ch === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    if (ch === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 2; continue; }
    if (ch === '/' && regexOk(i)) { i = skipRegex(i); continue; }
    if (ch === '`') { i = tpl(i); continue; }
    i++;
  }
  return out;
}

// Removes string literals, nested templates and whole escapeHTML(…) / icon(…)
// calls, leaving only what could reach the page as written. Then calls:
//   • a pass-through — String(), formatDate(), capitalise() — is unwrapped, so a
//     field inside it is still seen (each hands a non-date / non-word back as is)
//   • a method that keeps its receiver's text — .trim(), .toUpperCase(), .slice()…
//     — is dropped, the receiver kept
//   • any other call (a composer such as clearBtn(…), a .map(…) whose templates
//     are scanned on their own, a test such as .includes(…)) becomes C.
const PASS = ['String', 'formatDate', 'capitalise'];
const KEEPS = ['trim', 'trimStart', 'trimEnd', 'toUpperCase', 'toLowerCase', 'slice', 'substring', 'substr', 'replace', 'replaceAll', 'padStart', 'padEnd', 'concat', 'toString'];
function callEnd(s, open) {
  let k = open + 1, depth = 1;
  while (k < s.length && depth) { if (s[k] === '(') depth++; else if (s[k] === ')') depth--; k++; }
  return k;   // just past the ')'
}
function strip(e) {
  let s = e.replace(/'(?:[^'\\\n]|\\.)*'/g, 'S').replace(/"(?:[^"\\\n]|\\.)*"/g, 'S');
  let prev;
  do { prev = s; s = s.replace(/`[^`]*`/g, 'T'); } while (s !== prev);
  for (const fn of ['escapeHTML', 'icon']) {
    let at;
    while ((at = s.search(new RegExp('(^|[^\\w$.])' + fn + '\\('))) !== -1) {
      const st = s.indexOf(fn, at), open = s.indexOf('(', st);
      s = s.slice(0, st) + 'E' + s.slice(callEnd(s, open));
    }
  }
  // innermost calls first, so nested ones resolve before their callers
  // A bare ( … ) — grouping, or an arrow's parameters — keeps its content in
  // view, as ⟨ … ⟩, so the call around it can still be found.
  for (let guard = 0; guard < 400; guard++) {
    const m = /([A-Za-z_$][\w$.]*\.)?([A-Za-z_$][\w$]*)\(([^()]*)\)|(^|[^\w$])\(([^()]*)\)/.exec(s);
    if (!m) break;
    let rep, at = m.index, len = m[0].length;
    if (m[2] === undefined) { rep = m[4] + '\u27e8' + m[5] + '\u27e9'; }
    else {
      const recv = m[1] || '', name = m[2], args = m[3];
      if (!recv && PASS.includes(name)) rep = '\u27e8' + args + '\u27e9';
      else if (recv && KEEPS.includes(name)) rep = recv.slice(0, -1);      // the receiver's text stays
      else rep = 'C';                                                       // its value isn't the receiver's
    }
    s = s.slice(0, at) + rep + s.slice(at + len);
  }
  return s;
}

// The part of an expression whose VALUE is what lands in the page: for a
// conditional, its two branches (recursively); for a || / ?? chain, every operand.
function landing(s) {
  // top-level ? and :
  let depth = 0, q = -1;
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    if ('([{\u27e8'.includes(ch)) depth++; else if (')]}\u27e9'.includes(ch)) depth--;
    else if (ch === '?' && depth === 0 && s[k + 1] !== '?' && s[k + 1] !== '.' && s[k - 1] !== '?') { q = k; break; }
  }
  if (q === -1) return [s];
  depth = 0; let nest = 0;
  for (let k = q + 1; k < s.length; k++) {
    const ch = s[k];
    if ('([{\u27e8'.includes(ch)) depth++; else if (')]}\u27e9'.includes(ch)) depth--;
    else if (depth === 0 && ch === '?' && s[k + 1] !== '?' && s[k + 1] !== '.' && s[k - 1] !== '?') nest++;
    else if (depth === 0 && ch === ':') { if (nest) { nest--; continue; } return landing(s.slice(q + 1, k)).concat(landing(s.slice(k + 1))); }
  }
  return [s];
}

function rawStored(expr) {
  const s = strip(expr);
  const hits = [];
  for (const part of landing(s)) {
    FIELD_RE.lastIndex = 0;
    let m;
    while ((m = FIELD_RE.exec(part))) {
      const after = part.slice(m.index + m[0].length);
      if (/^\s*(\.length\b|===|!==|==|!=|<|>|\))/.test(after) && !/^\s*\)/.test(after)) continue;   // a count / a test
      hits.push(m[1] + '.' + m[2]);
    }
  }
  return hits;
}

// Every interpolation in a markup template that puts a stored value in raw.
// A template builds markup when it has a tag, an attribute (name="…), or an
// entity in it. `all` (the render files): every template — a fragment such as
// ` (${…})` is pasted into markup by its caller.
const MARKUP_RE = /<[a-zA-Z/!]|[\w-]="|&[a-z]+;|&#\d+;/;
function scan(file, src, all) {
  const out = [];
  for (const t of templates(src)) {
    const lits = t.parts.filter(p => 'lit' in p).map(p => p.lit).join('');
    if (!(all || MARKUP_RE.test(lits))) continue;
    for (const p of t.parts) {
      if (!('expr' in p)) continue;
      const hits = rawStored(p.expr);
      if (hits.length) out.push({ file, line: p.line, expr: p.expr.trim().replace(/\s+/g, ' ').slice(0, 160), hits });
    }
  }
  return out;
}

module.exports = { scan, templates, rawStored, strip, landing };
