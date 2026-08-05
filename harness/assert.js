/* PATGo test harness — assertions
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   Deliberately tiny. The value is in the assertions themselves, not the runner.

   ⚠ The one rule that matters: BEFORE ADDING AN ASSERTION, ASK WHETHER IT COULD
   PASS ON BROKEN CODE. V65 shipped two that could. V66 shipped four. Every one
   looked green. `npm run mutate` equivalent is `node harness/mutate.js` — run it. */

'use strict';

const groups = [];
let current  = null;
let passed   = 0;
const failures = [];

/* ⚠ group() MUST be awaited when its body is async.
   A synchronous group() with an async body returns immediately: `current` is
   cleared, the awaited assertions land in "(ungrouped)" or nowhere, and the
   group reports "0 assertions" while still printing a tick. That is a
   false-green factory, and it bit this harness on its first run.

   Two defences: the body's promise is awaited here, and reportEmptyGroups()
   fails the run outright if any group finishes with zero assertions. */
function group(name, fn) {
  const g = { name, tests: [] };
  groups.push(g);
  const prev = current;
  current = g;

  let result;
  try {
    result = fn();
  } catch (e) {
    failures.push({ group: name, test: '(group threw)', message: e.stack || e.message });
    current = prev;
    return;
  }

  if (result && typeof result.then === 'function') {
    return result
      .catch(e => { failures.push({ group: name, test: '(group threw)', message: e.stack || e.message }); })
      .then(() => { current = prev; });
  }
  current = prev;
}

function record(ok, label, message) {
  const g = current ? current.name : '(ungrouped)';
  if (current) current.tests.push({ label, ok });
  if (ok) passed++;
  else failures.push({ group: g, test: label, message });
}

function ok(value, label) {
  record(!!value, label, `expected truthy, got ${fmt(value)}`);
}

function notOk(value, label) {
  record(!value, label, `expected falsy, got ${fmt(value)}`);
}

function eq(actual, expected, label) {
  record(Object.is(actual, expected), label, `expected ${fmt(expected)}, got ${fmt(actual)}`);
}

function notEq(actual, expected, label) {
  record(!Object.is(actual, expected), label, `expected NOT ${fmt(expected)}`);
}

function deepEq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  record(a === b, label, `expected ${b}, got ${a}`);
}

function includes(haystack, needle, label) {
  const has = haystack != null && String(haystack).includes(needle);
  record(has, label, `expected to contain ${fmt(needle)}`);
}

function excludes(haystack, needle, label) {
  const has = haystack != null && String(haystack).includes(needle);
  record(!has, label, `expected NOT to contain ${fmt(needle)}`);
}

function throws(fn, label) {
  let threw = false;
  try { fn(); } catch (e) { threw = true; }
  record(threw, label, 'expected a throw, none happened');
}

function doesNotThrow(fn, label) {
  try { fn(); record(true, label, ''); }
  catch (e) { record(false, label, `threw: ${e.message}`); }
}

/* A defect that is real, understood, and not being fixed in THIS release.

   Neither of the obvious options is acceptable: deleting the assertion hides a
   known bug, and leaving it as a hard failure makes a permanently red baseline
   that everyone learns to ignore. known() records it, prints it under KNOWN
   DEFECTS, and does not fail the run — and when the fix lands it reports
   "appears fixed" so it gets promoted to a hard assertion and deleted from here. */
const knownDefects = [];
function known(condition, label, note) {
  knownDefects.push({ label, note, holds: !!condition });
  if (current) current.tests.push({ label: `(known defect) ${label}`, ok: true });
  passed++;
}

function fmt(v) {
  if (typeof v === 'string') return JSON.stringify(v.length > 120 ? v.slice(0, 120) + '…' : v);
  if (v === undefined) return 'undefined';
  try { return JSON.stringify(v); } catch { return String(v); }
}

function report() {
  // A group with no assertions ran nothing. Almost always an un-awaited async
  // body. Treated as a FAILURE, never a warning — an empty group that prints a
  // tick is worse than no test at all.
  for (const g of groups) {
    if (g.tests.length === 0) {
      failures.push({
        group: g.name,
        test: '(empty group)',
        message: 'ran zero assertions — if the body is async, the group must be awaited',
      });
    }
  }

  const failed = failures.length;
  const lines = [];
  lines.push('');
  for (const g of groups) {
    const bad = g.tests.filter(t => !t.ok).length;
    lines.push(`${bad ? '✗' : '✓'} ${g.name}  (${g.tests.length} assertions${bad ? `, ${bad} failed` : ''})`);
  }
  if (failed) {
    lines.push('');
    lines.push('FAILURES');
    for (const f of failures) {
      lines.push(`  ✗ [${f.group}] ${f.test}`);
      lines.push(`      ${f.message}`);
    }
  }
  if (knownDefects.length) {
    lines.push('');
    lines.push('KNOWN DEFECTS (recorded, not failing this run)');
    for (const d of knownDefects) {
      if (d.holds) {
        lines.push(`  ! ${d.label}`);
        if (d.note) lines.push(`      ${d.note}`);
      } else {
        lines.push(`  ✓ APPEARS FIXED — promote to a hard assertion and delete the known() call:`);
        lines.push(`      ${d.label}`);
      }
    }
  }

  lines.push('');
  /* The summary string is machine-read by mutate.js.
     ⚠ V66's mutation runner matched the substring "0 failed", so a run reporting
     "10 failed" scored as a pass. The format below is fixed and the matcher
     anchors on the whole phrase — do not reword it casually. */
  lines.push(`${passed} passed, ${failed} failed`);
  console.log(lines.join('\n'));
  return failed;
}

module.exports = {
  group, ok, notOk, eq, notEq, deepEq, includes, excludes, throws, doesNotThrow, known,
  report,
  get passed() { return passed; },
  get failures() { return failures; },
};
