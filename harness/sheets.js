/* PATGo harness — find every bottom sheet in the app's source (V110)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Used by harness/tests/47-sheet-guard.js, which checks each sheet
   found here either marks a `.sheet-scroll` body or is named in
   harness/sheet-register.js with a reason.

   A sheet is found in one of three shapes:
     markup   — `<div class="... bulk-sheet ...">` / `fail-sheet` in a template.
                Its extent runs to the matching `</div>` (a <div / </div> count
                over the raw text, so markup inside ${...} branches counts too —
                each branch is balanced on its own).
     element  — `x.className = 'bulk-sheet'` (a sheet built with createElement).
     opener   — a call to `_openSheet(` (feedback.js), the shared builder.
                The helper itself is not a sheet; each caller is.
   For element and opener sheets the extent is the whole top-level function
   that builds it — its innerHTML is written there.

   KEY (spec 6A): `file · label` where label is the aria-label as written, when
   that is a plain literal. A templated or variable label — and a sheet with no
   label — is keyed by its top-level function instead: `file · fnName()`. A key
   that would repeat gets ` #2`, ` #3` in source order. Moving a sheet within its
   file never changes its key; renaming its label or its function does, and the
   run then names both the new sheet and the stale register entry. */

'use strict';

const fs = require('fs');
const path = require('path');

const APP_DIR = path.resolve(__dirname, '..');
// Vendored libraries and the service worker carry no sheets.
const SKIP = /\.min\.js$|^supabase\.umd\.js$|^sw\.js$/;

// A small JS scanner — enough to know, for every character, whether it is code,
// a string, template text, a comment or a regex, and the bracket depth. The
// sheet finder needs it for two things a grep cannot do: which template a
// sheet's markup sits in, and where a `const body = ...;` statement ends.
// 47a checks it balances on every app file (a scanner that loses its place
// would quietly misplace every sheet after that point).
function scan(src) {
  const n = src.length;
  const ctx = new Uint8Array(n);   // 0 code, 1 string, 2 template text, 3 comment, 4 regex
  const bd = new Int32Array(n);
  const templates = [];            // {start, end}
  const stack = [];                // frames: {t:'tpl', start, idx} or {t:'expr', depth}
  let depth = 0, i = 0, lastSig = '';
  const regexAllowed = () => !lastSig || /[(,=:[!&|?{};+\-*%<>~^]$/.test(lastSig) || /\b(return|typeof|case|in|of|new|delete|void|throw)$/.test(lastSig);
  function templateText() {
    // at src[i] inside template text
    while (i < n) {
      const c = src[i];
      if (c === '\\') { ctx[i] = ctx[i + 1] = 2; bd[i] = bd[i + 1] = depth; i += 2; continue; }
      if (c === '`') { ctx[i] = 2; bd[i] = depth; const f = stack.pop(); templates.push({ start: f.start, end: i + 1 }); i++; lastSig = '`'; return; }
      if (c === '$' && src[i + 1] === '{') { ctx[i] = ctx[i + 1] = 2; bd[i] = bd[i + 1] = depth; i += 2; stack.push({ t: 'expr', depth }); depth++; lastSig = '{'; return 'expr'; }
      ctx[i] = 2; bd[i] = depth; i++;
    }
  }
  while (i < n) {
    const top = stack[stack.length - 1];
    if (top && top.t === 'tpl') { templateText(); continue; }
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') { ctx[i] = 3; bd[i] = depth; i++; } continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2; for (; i < end; i++) { ctx[i] = 3; bd[i] = depth; } continue; }
    if (c === '"' || c === "'") { const q = c; ctx[i] = 1; bd[i] = depth; i++; while (i < n && src[i] !== q && src[i] !== '\n') { if (src[i] === '\\') { ctx[i] = 1; bd[i] = depth; i++; } ctx[i] = 1; bd[i] = depth; i++; } if (i < n) { ctx[i] = 1; bd[i] = depth; i++; } lastSig = 'x'; continue; }
    if (c === '`') { ctx[i] = 2; bd[i] = depth; stack.push({ t: 'tpl', start: i }); i++; continue; }
    if (c === '/' && regexAllowed()) { let inCls = false; ctx[i] = 4; bd[i] = depth; i++; while (i < n && src[i] !== '\n') { const d = src[i]; ctx[i] = 4; bd[i] = depth; if (d === '\\') { i++; ctx[i] = 4; bd[i] = depth; } else if (d === '[') inCls = true; else if (d === ']') inCls = false; else if (d === '/' && !inCls) { i++; break; } i++; } while (i < n && /[a-z]/.test(src[i])) { ctx[i] = 4; bd[i] = depth; i++; } lastSig = 'x'; continue; }
    if (c === '{' || c === '(' || c === '[') { ctx[i] = 0; bd[i] = depth; depth++; i++; lastSig = c; continue; }
    if (c === '}' || c === ')' || c === ']') {
      depth--; ctx[i] = 0; bd[i] = depth;
      if (c === '}' && top && top.t === 'expr' && top.depth === depth) { stack.pop(); ctx[i] = 2; i++; continue; }
      i++; lastSig = 'x'; continue;
    }
    ctx[i] = 0; bd[i] = depth;
    if (!/\s/.test(c)) { if (/[\w$]/.test(c)) { let j = i; while (j < n && /[\w$]/.test(src[j])) { ctx[j] = 0; bd[j] = depth; j++; } lastSig = src.slice(i, j); if (/^\d/.test(lastSig)) lastSig = 'x'; else if (!/^(return|typeof|case|in|of|new|delete|void|throw)$/.test(lastSig)) lastSig = 'x'; i = j; continue; } lastSig = c; }
    i++;
  }
  return { ctx, bd, templates, finalDepth: depth, open: stack.length };
}

const CODE = 0, TEXT = 2;

function topFunctions(src) {
  const re = /^(?:async )?function ([A-Za-z_$][\w$]*)/gm;
  const out = [];
  let m;
  while ((m = re.exec(src))) out.push({ name: m[1], start: m.index });
  out.forEach((f, k) => { f.end = k + 1 < out.length ? out[k + 1].start : src.length; });
  return out;
}

function fnAt(fns, idx) {
  let f = null;
  for (const x of fns) if (x.start <= idx) f = x; else break;
  return f || { name: null, start: 0, end: Infinity };
}

function literal(s) {
  const m = /^\s*(['"])((?:\\.|(?!\1).)*)\1\s*$/.exec(s);
  return m ? m[2].replace(/\\u([0-9a-fA-F]{4})/g, (x, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\(.)/g, '$1') : null;
}

// Only the code that would actually run: comments blanked (offsets kept).
function codeOnly(src, sc) {
  let out = '';
  for (let i = 0; i < src.length; i++) out += sc.ctx[i] === 3 && src[i] !== '\n' ? ' ' : src[i];
  return out;
}

const ROOT = /<div\b[^>]*\bclass="([^"]*)"[^>]*>/g;
const isRoot = cls => /(?:^|\s)(?:bulk-sheet|fail-sheet)(?:\s|$)/.test(cls);
const SCROLLS = /class="(?:[^"]*\s)?sheet-scroll[\s"]/;

function parseFile(file) {
  const src = fs.readFileSync(path.join(APP_DIR, file), 'utf8');
  const sc = scan(src);
  const code = codeOnly(src, sc);
  return { file, src, sc, code, fns: topFunctions(code) };
}

// Text of a sheet plus everything it pulls in through ${...}: a const/let
// declared in the same top-level function (to the end of its statement), or a
// top-level function of the app. A function that builds a sheet of its own is
// never followed — its scroller belongs to that sheet, not this one.
function pulledIn(P, all, text, fn, seen, depth) {
  let out = text;
  if (depth > 3) return out;
  const ids = new Set();
  for (const m of text.matchAll(/\$\{([^`]*?)\}/g)) for (const id of m[1].match(/[A-Za-z_$][\w$]*/g) || []) ids.add(id);
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    // Every statement that gives it a value: the declaration, and any later
    // `x = ...` / `x += ...` (a `let body = ''` filled in per branch).
    const body = P.code.slice(fn.start, fn.end);
    const asg = new RegExp('(?:\\b(?:const|let)\\s+)?(?<![\\w$.])' + id.replace(/\$/g, '\\$') + '\\s*\\+?=(?![=>])', 'g');
    let hit = false, d;
    while ((d = asg.exec(body))) {
      const from = fn.start + d.index;
      if (P.sc.ctx[from] !== CODE) continue;
      hit = true;
      let j = from;
      while (j < P.code.length && !(P.code[j] === ';' && P.sc.ctx[j] === CODE && P.sc.bd[j] === P.sc.bd[from])) j++;
      out += pulledIn(P, all, P.code.slice(from, j), fn, seen, depth + 1);
    }
    if (hit) continue;
    for (const Q of all) {
      const f = Q.fns.find(x => x.name === id);
      if (!f) continue;
      const t = Q.code.slice(f.start, f.end);
      if (!/\b_openSheet\(|\.className\s*=\s*['"](?:bulk|fail)-sheet['"]/.test(t) && ![...t.matchAll(ROOT)].some(m => isRoot(m[1])))
        out += pulledIn(Q, all, t, f, seen, depth + 1);
      break;
    }
  }
  return out;
}

function findSheetsIn(P, all) {
  const { file, src, sc, code, fns } = P;
  const found = [];
  let m;

  ROOT.lastIndex = 0;
  while ((m = ROOT.exec(code))) {
    if (!isRoot(m[1]) || sc.ctx[m.index] !== TEXT) continue;
    const fn = fnAt(fns, m.index);
    const tpl = sc.templates.filter(t => t.start < m.index && m.index < t.end).sort((a, b) => b.start - a.start)[0];
    // Count <div / </div> to the end of the template the sheet opens in. If it
    // closes there, that is its extent. If not, the sheet is assembled from
    // pieces (a `head()` plus a body per step) and its extent is the whole
    // top-level function — 47a then insists it is the only sheet there.
    const re = /<div\b|<\/div>/g;
    re.lastIndex = m.index;
    let depthDiv = 0, end = -1, d;
    while ((d = re.exec(code)) && d.index < tpl.end) {
      depthDiv += d[0] === '</div>' ? -1 : 1;
      if (depthDiv === 0) { end = re.lastIndex; break; }
    }
    const lab = /\baria-label="([^"]*)"/.exec(m[0]);
    found.push({ shape: 'markup', at: m.index, start: end < 0 ? fn.start : m.index, end: end < 0 ? fn.end : end,
      pieces: end < 0, label: lab && !lab[1].includes('${') ? lab[1] : null, fn });
  }

  const element = /\.className\s*=\s*['"](?:bulk-sheet|fail-sheet)['"]/g;
  while ((m = element.exec(code))) {
    if (sc.ctx[m.index] !== CODE) continue;
    const fn = fnAt(fns, m.index);
    if (fn.name === '_openSheet') continue;
    const lab = /setAttribute\(\s*'aria-label'\s*,\s*([^)]*)\)/.exec(code.slice(fn.start, fn.end));
    found.push({ shape: 'element', at: m.index, start: fn.start, end: fn.end, pieces: true,
      label: lab ? literal(lab[1]) : null, fn });
  }

  const opener = /\b_openSheet\(([^)]*)\)/g;
  while ((m = opener.exec(code))) {
    if (sc.ctx[m.index] !== CODE) continue;
    const fn = fnAt(fns, m.index);
    if (fn.name === '_openSheet') continue;
    found.push({ shape: 'opener', at: m.index, start: fn.start, end: fn.end, pieces: true,
      label: literal(m[1]), fn });
  }

  found.sort((a, b) => a.at - b.at);
  const seen = {};
  for (const s of found) {
    let key = `${file} · ${s.label != null ? s.label : (s.fn.name || '(top level)') + '()'}`;
    seen[key] = (seen[key] || 0) + 1;
    if (seen[key] > 1) key += ` #${seen[key]}`;
    s.key = key;
    s.file = file;
    s.fnName = s.fn.name;
    s.line = src.slice(0, s.at).split('\n').length;
    s.text = code.slice(s.start, s.end);
    s.scrolls = SCROLLS.test(pulledIn(P, all, s.text, s.fn, new Set(), 0));
    delete s.fn;
  }
  return found;
}

function appFiles() {
  return fs.readdirSync(APP_DIR).filter(f => f.endsWith('.js') && !SKIP.test(f)).sort();
}

function parsedApp() {
  return appFiles().map(parseFile);
}

function allSheets() {
  const all = parsedApp();
  return all.flatMap(P => findSheetsIn(P, all));
}

module.exports = { allSheets, parsedApp, appFiles, scan, isRoot, ROOT, APP_DIR };
