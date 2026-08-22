/* Standing test — sheet scrollers and pins (V76)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE ACTUALLY DID. An audit of all 30 bottom-sheet render sites
   found four sheets whose body can grow from USER DATA with no scroller, one
   whose scroller was hand-rolled and broken, and three whose body text comes
   from the caller. The fix marks the growing child `.sheet-scroll`, pins what
   sits below it with the new `.sheet-pin`, and collapses three scroller
   implementations down to one.

   ⚠ WHAT THIS FILE CANNOT PROVE — SAME LIMIT AS TEST 11. There is no layout
   engine here. Nothing below demonstrates that a long list VISUALLY scrolls or
   that a button stays put; only that the markup carries the classes and the CSS
   defines them to mean what we think. The visual result proves itself on a phone.
   That is why 12d exists: it checks the SHAPE of the CSS rule rather than the
   rendering, because the V76 wizard defect was a missing property in a rule that
   looked complete, and a source guard is the only thing that can see that.

   ⚠ THE ONE-IMPLEMENTATION RULE IS THE POINT OF THIS FILE. Marking ten sites is
   the easy half and it decays: the next sheet someone writes will not know about
   the class. What does not decay is 12d — any future rule that hand-rolls a
   scroller and omits min-height:0 fails, whatever it is called and whoever wrote
   it. If a later release has to choose between keeping the per-site assertions
   and keeping 12d, keep 12d. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('../assert');
const { APP_DIR } = require('../load');

function read(f) {
  return fs.readFileSync(path.join(APP_DIR, f), 'utf8');
}

/* ⚠ COMMENTS MUST BE STRIPPED BEFORE ASSERTING ON CSS — the V75 lesson, and this
   file is more exposed to it than test 11 was. Every rule changed here carries a
   comment that NAMES the properties being discussed (`min-height: 0`,
   `overflow-y: auto`, `flex: 1 1 auto`), so a raw search finds the explanation and
   reports a rule as present when it was deleted. */
function stripCssComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

const css       = read('styles.css');
const liveCss   = stripCssComments(css);
const coreSrc   = read('render-core.js');
const reviewSrc = read('render-review.js');
const helpSrc   = read('render-help.js');
const feedSrc   = read('feedback.js');

/* Split stripped CSS into { selector, body } blocks. Deliberately simple: this
   stylesheet has no nesting and no @supports blocks wrapping the rules we care
   about, and a real parser here would be more machinery than the check deserves.
   If nesting ever arrives, 12d's own guard (it must find rules to inspect) is
   what will notice this stopped working. */
function cssRules(src) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    out.push({ selector: m[1].trim(), body: m[2] });
  }
  return out;
}

module.exports = async function () {

  await t.group('12a — the shared scroller and pin both exist as live rules', () => {
    t.includes(liveCss, '.sheet-scroll {', 'the scroller class is defined');
    t.includes(liveCss, '.sheet-pin { flex-shrink: 0; }', 'the pin class is defined');

    // The scroller's four properties, asserted individually. A rule that keeps
    // the name and loses min-height:0 is precisely the V76 wizard bug relocated
    // into the shared class, where it would break every sheet at once.
    const scroller = cssRules(liveCss).find(r => r.selector === '.sheet-scroll');
    t.ok(scroller, 'the .sheet-scroll rule was found by the parser');
    t.includes(scroller.body, 'overflow-y: auto', 'it scrolls');
    t.includes(scroller.body, 'flex: 1 1 auto', 'it takes the free space');
    t.includes(scroller.body, 'min-height: 0', 'it can shrink below its content — the property the wizard omitted');
    t.includes(scroller.body, 'overscroll-behavior: contain', 'it does not chain to the page behind');
  });

  await t.group('12b — the wizard uses the shared scroller and its own is gone', () => {
    // The V76 defect: .wizard-body hand-rolled the scroller without min-height:0,
    // so it never shrank, never scrolled, and the shell clipped it. .wizard-foot
    // IS pinned, so the clipped part was the buttons — on the first screen a new
    // install shows.
    t.includes(coreSrc, 'class="wizard-body sheet-scroll"', 'the wizard body is a designated scroller');

    const wizardBody = cssRules(liveCss).find(r => r.selector === '.wizard-body');
    t.ok(!wizardBody, 'no .wizard-body rule remains to re-declare a scroller of its own');

    // The foot must stay pinned or marking the body achieves nothing.
    const wizardFoot = cssRules(liveCss).find(r => r.selector === '.wizard-foot');
    t.ok(wizardFoot, 'the .wizard-foot rule is still there');
    t.includes(wizardFoot.body, 'flex: 0 0 auto', 'the wizard foot is still pinned');
  });

  await t.group('12c — the bug sheet was converted too, leaving one implementation', () => {
    // This one was already CORRECT. It was converted only so that "did a sheet
    // opt out of the scroller" is one grep rather than three.
    t.includes(helpSrc, 'class="bug-sheet-body sheet-scroll"', 'the bug sheet body is a designated scroller');

    const bugBody = cssRules(liveCss).find(r => r.selector === '.bug-sheet-body');
    t.ok(bugBody, 'the rule survives for its padding');
    t.excludes(bugBody.body, 'overflow-y', 'it no longer declares its own overflow');
    t.excludes(bugBody.body, 'flex:', 'it no longer declares its own flex');
    t.includes(bugBody.body, 'padding-bottom', 'the padding it exists for is intact');
  });

  await t.group('12d — no rule anywhere hand-rolls a scroller without min-height:0', () => {
    // ⚠ THIS IS THE ASSERTION THAT DOES NOT DECAY. It knows nothing about which
    // sheets exist, so a sheet added in five releases' time is covered by it
    // without anyone remembering this file. The shape it looks for is exactly
    // what .wizard-body had: it scrolls, it takes the free space, and it cannot
    // shrink — so the overflow never engages and the parent clips it instead.
    const scrollers = cssRules(liveCss).filter(r =>
      /overflow-y:\s*auto/.test(r.body) && /flex:\s*1\s+1\s+auto/.test(r.body)
    );

    // Not hollow: if the parser or the stripper breaks, this set goes empty and
    // the loop below passes vacuously. Prove there is something to inspect, and
    // that the rule we know about is in it.
    t.ok(scrollers.length >= 1, 'the guard found at least one scroller rule to inspect');
    t.ok(scrollers.some(r => r.selector === '.sheet-scroll'), '.sheet-scroll is among the rules it inspected');

    const offenders = scrollers
      .filter(r => !/min-height:\s*0/.test(r.body))
      .map(r => r.selector);
    t.deepEq(offenders, [], 'every flex scroller declares min-height: 0');

    // And the count is pinned deliberately. There are exactly two at V76:
    // .sheet-scroll, and .report-preview-view — the PDF preview pane, which is
    // NOT a sheet (it is a full-screen view) and correctly carries min-height:0
    // already. A third appearing means either a new full-screen scroll region,
    // which is fine and this number should be raised, or a sheet being pointed at
    // a private copy of the rule, which is how V76's defect happened. Either way
    // it wants a human to look, which is what a failing assertion buys.
    t.eq(scrollers.length, 2, 'no third scroller implementation has appeared');
    t.ok(scrollers.some(r => r.selector === '.report-preview-view'), 'the second one is still the PDF preview pane, not a sheet');
  });

  await t.group('12e — the three data-driven sheets scroll and their siblings are pinned', () => {
    // A1 — fail reasons come from Settings, so this grid's height is the user's
    // to set. "Other…" and the photo row are BELOW it and would be squeezed out.
    t.includes(coreSrc, 'class="fail-reasons-grid sheet-scroll"', 'the fail-reason grid scrolls');
    t.includes(coreSrc, 'class="fail-other-btn sheet-pin"', 'the Other… escape hatch is pinned');
    t.includes(coreSrc, 'class="fail-photo-row sheet-pin"', 'the fail photo row is pinned');

    // A2 — one row per configured multi-pick. Nothing below it, so the symptom is
    // unreachable options rather than a lost button. Same defect, quieter.
    t.includes(coreSrc, 'class="multipick-list sheet-scroll"', 'the Multi Pick list scrolls');

    // A3 — every item type in the active preset, AND a keyboard sheet, so it runs
    // against the reduced cap at the same time.
    t.includes(reviewSrc, 'class="quick-grid sheet-scroll"', 'the bulk-type grid scrolls');
    t.includes(reviewSrc, 'class="input-big sheet-pin"', 'the bulk-type input is pinned');
    t.includes(reviewSrc, 'class="btn-primary sheet-pin" id="bulk-type-apply"', 'the bulk-type Apply button is pinned');

    // B1 — the list was already marked in v47; the button under it never was.
    t.includes(coreSrc, 'class="preset-switch-edit sheet-pin"', 'the Edit presets button is pinned');
  });

  await t.group('12f — the three caller-supplied sheets scroll their message', () => {
    // None of these overflows today. The message is passed IN, so its length is
    // not a property of feedback.js and cannot be checked there — and the info
    // sheet is the app's error reporter, where long text is the normal case.
    // Two pins per sheet where there are two things below the message.
    const scrollMarks = (feedSrc.match(/<p class="sheet-scroll"/g) || []).length;
    t.eq(scrollMarks, 3, 'all three message paragraphs are scrollers');

    t.includes(feedSrc, '<div class="sheet-pin" style="display:flex', 'the confirm button row is pinned');
    t.includes(feedSrc, 'class="input sheet-pin" id="name-sheet-input"', 'the name sheet input is pinned');
    t.includes(feedSrc, 'class="btn-primary sheet-pin" id="name-sheet-save"', 'the name sheet Save is pinned');
    t.includes(feedSrc, 'class="btn-primary sheet-pin" id="info-sheet-ok"', 'the info sheet OK is pinned');
  });

  await t.group('12g — the pin is never applied to a shared class in the stylesheet', () => {
    // ⚠ THE TRAP THIS CLOSES, and the reason .sheet-pin is a class you add per
    // site rather than a rule per element. The pinned things include
    // .btn-primary, .input-big and .quick-grid, every one of which is used all
    // over the app OUTSIDE any sheet. Giving those rules flex-shrink:0 would fix
    // the sheets and quietly change layout on screens nobody was looking at.
    for (const sel of ['.btn-primary', '.input-big', '.quick-grid']) {
      const rule = cssRules(liveCss).find(r => r.selector === sel);
      t.ok(rule, `${sel} exists as a rule to check`);
      t.excludes(rule.body, 'flex-shrink', `${sel} did not get a global flex-shrink`);
    }
  });

  await t.group('12h — every class used in the markup is defined in the stylesheet', () => {
    // Cheap, and it catches the one failure mode that would make every assertion
    // above pass while nothing works: a typo in a class name. `sheet-scoll` in
    // the markup is invisible to a grep for `sheet-scroll` and produces a sheet
    // that clips exactly as before.
    const markup = [coreSrc, reviewSrc, helpSrc, feedSrc].join('\n');
    const used = new Set((markup.match(/sheet-(?:scroll|pin)\b/g) || []));
    t.ok(used.has('sheet-scroll'), 'the scroller class appears in the markup');
    t.ok(used.has('sheet-pin'), 'the pin class appears in the markup');

    // Anything sheet-ish in the markup that is NOT one of the two known classes
    // is either a typo or a third convention starting up. Both want a look.
    const suspicious = (markup.match(/class="[^"]*sheet-s[a-z]*/g) || [])
      .filter(s => !/sheet-scroll/.test(s));
    t.deepEq(suspicious, [], 'no near-miss spellings of the scroller class');
  });
};
