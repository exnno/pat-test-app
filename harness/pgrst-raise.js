/* PATGo test harness — PostgREST's handling of RAISE SQLSTATE 'PGRST'
   (c) 2026 Peter Birchley. All rights reserved.

   V162 (the third GPT audit, finding 2). V161's pre-request raised its refusal
   with detail {"status":401}; the SQL self-checks caught the exception INSIDE
   Postgres and 100a fed the app a hand-written 401, so nothing ever crossed the
   boundary where PostgREST turns that exception into an HTTP answer — and that
   is where it broke (500 PGRST121). This file is that boundary, ported line for
   line from PostgREST's own source so the harness can cross it:

     src/library/PostgREST/Error.hs (main, 11 Nov 2026; the same from v12.0.0):
       instance FromJSON PgRaiseErrMessage  — "code", "message" REQUIRED; "details", "hint" optional
       instance FromJSON PgRaiseErrDetails  — "status", "headers" REQUIRED; "status_text" optional
       parseRaisePGRST                       — message, then detail present, then detail parsed
       PGRSTParseError                       — HTTP 500, code PGRST121, its message/details/hint
       pgErrorStatus "PGRST"                 — the detail's status when it parses

   And sqlJsonText(): the SQL's own `json_build_object(...)::text` expression,
   read from the .sql file and built the way Postgres builds it — so the test
   reads the SHIPPED text, not a copy. (Checked against a real Postgres, PGlite
   0.5.16, at V162: the same bytes for all three files.)

   ⚠ WHAT THIS CANNOT PROVE: the hosted PostgREST's version. Supabase runs v12+;
   the rule above is unchanged from v12.0.0 to main. The live check is the
   handoff's real-token test on the test project. */

'use strict';

// Aeson's .: on an object — present (null counts as present for Maybe, not for required).
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function parseMessage(text) {
  let m; try { m = JSON.parse(text); } catch { return null; }
  if (!isObj(m) || typeof m.code !== 'string' || typeof m.message !== 'string') return null;
  if (m.details != null && typeof m.details !== 'string') return null;
  if (m.hint != null && typeof m.hint !== 'string') return null;
  return m;
}
function parseDetail(text) {
  let d; try { d = JSON.parse(text); } catch { return null; }
  if (!isObj(d) || typeof d.status !== 'number' || !Number.isInteger(d.status)) return null;
  if (!isObj(d.headers)) return null;   // Map Text Text — required
  for (const v of Object.values(d.headers)) if (typeof v !== 'string') return null;
  if (d.status_text != null && typeof d.status_text !== 'string') return null;
  return d;
}

// What PostgREST answers for RAISE SQLSTATE 'PGRST' USING message = m, detail = d
// (d undefined/null = no DETAIL). → { status, headers, body }
function pgrstRaiseResponse(m, d) {
  const fail = (kind, raw) => ({
    status: 500,
    headers: {},
    body: {
      code: 'PGRST121',
      message: 'Could not parse JSON in the "RAISE SQLSTATE \'PGRST\'" error',
      details: kind === 'msg' ? `Invalid JSON value for MESSAGE: '${raw}'`
             : kind === 'none' ? 'DETAIL is missing in the RAISE statement'
             : `Invalid JSON value for DETAIL: '${raw}'`,
      hint: kind === 'msg'
        ? "MESSAGE must be a JSON object with obligatory keys: 'code', 'message' and optional keys: 'details', 'hint'."
        : "DETAIL must be a JSON object with obligatory keys: 'status', 'headers' and optional key: 'status_text'.",
    },
  });
  const msg = parseMessage(m);
  if (!msg) return fail('msg', m);
  if (d == null) return fail('none');
  const det = parseDetail(d);
  if (!det) return fail('det', d);
  return {
    status: det.status,
    headers: Object.assign({}, det.headers),
    body: { code: msg.code, message: msg.message, details: msg.details == null ? null : msg.details, hint: msg.hint == null ? null : msg.hint },
  };
}

// The same, as the fetch Response the browser would get.
function pgrstRaiseFetchResponse(m, d) {
  const r = pgrstRaiseResponse(m, d);
  return new Response(JSON.stringify(r.body), { status: r.status,
    headers: Object.assign({ 'content-type': 'application/json; charset=utf-8' }, r.headers) });
}

// ---- the SQL's own text -----------------------------------------------------
// A json_build_object(...)::text expression of string literals, integers and
// nested json_build_object() calls, built as Postgres's json type prints it:
// {"k" : v, "k2" : v2} — key, space-colon-space, value; ", " between pairs; {}
// for none. Anything else in the expression throws: the test must not guess.
function sqlJsonText(expr) {
  let i = 0;
  const s = String(expr).trim().replace(/::text$/, '');
  const ws = () => { while (/\s/.test(s[i])) i++; };
  const lit = () => {
    if (s[i] !== "'") throw new Error('expected a string literal at ' + s.slice(i, i + 20));
    let out = ''; i++;
    for (;;) {
      if (i >= s.length) throw new Error('unterminated literal');
      if (s[i] === "'" && s[i + 1] === "'") { out += "'"; i += 2; continue; }
      if (s[i] === "'") { i++; return out; }
      out += s[i++];
    }
  };
  const val = () => {
    ws();
    if (s.startsWith('json_build_object(', i)) return obj();
    if (s[i] === "'") return JSON.stringify(lit());
    const m = /^-?\d+/.exec(s.slice(i));
    if (m) { i += m[0].length; return m[0]; }
    throw new Error('unsupported SQL in the expression at ' + s.slice(i, i + 30));
  };
  const obj = () => {
    i += 'json_build_object('.length;
    const parts = [];
    ws();
    if (s[i] === ')') { i++; return '{}'; }
    for (;;) {
      ws(); const k = lit(); ws();
      if (s[i] !== ',') throw new Error('json_build_object needs pairs');
      i++;
      const v = val(); ws();
      parts.push(JSON.stringify(k) + ' : ' + v);
      if (s[i] === ',') { i++; continue; }
      if (s[i] === ')') { i++; break; }
      throw new Error('bad json_build_object at ' + s.slice(i, i + 20));
    }
    return '{' + parts.join(', ') + '}';
  };
  ws();
  const out = val();
  ws();
  if (i !== s.length) throw new Error('trailing SQL after the expression: ' + s.slice(i));
  return out;
}

// The message and detail of the one `raise sqlstate 'PGRST'` inside the named
// function's body in an SQL file's text (the LAST definition, as a run leaves it).
function pgrstRaiseOf(sql, fn) {
  const start = sql.lastIndexOf('create or replace function public.' + fn + '(');
  if (start < 0) throw new Error(fn + ' not found');
  const end = sql.indexOf('$$;', sql.indexOf('$$', start) + 2);
  const body = sql.slice(start, end);
  const r = /raise sqlstate 'PGRST' using\s+message\s*=\s*([\s\S]*?),\s*(?:--[^\n]*\n\s*)*detail\s*=\s*([\s\S]*?);\s*\n/.exec(body);
  if (!r) throw new Error('no RAISE PGRST in ' + fn);
  return { message: sqlJsonText(r[1]), detail: sqlJsonText(r[2]) };
}

module.exports = { pgrstRaiseResponse, pgrstRaiseFetchResponse, sqlJsonText, pgrstRaiseOf, parseDetail, parseMessage };
