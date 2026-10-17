/* Standing test — V132: a long company name / address on the certificate wraps
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked (16 Oct, Peter "1A 2A"). Item C, the V119.1
   residual: checked first — it did overflow. With a wide logo a company name
   past ~53 characters ran into the logo; with no logo, past ~72 it ran off the
   left of the page (portrait).
   1A  A name or address line too long for the room beside the logo wraps onto
       further right-aligned lines; the title moves down to make room.
   2A  The room is measured against the logo actually drawn — a square logo is
       narrower than a wide one, so the text gets more room before it wraps.
   What's new rolled (one line).

     70a  no logo: a very long name and address line stay on the page, wrap,
          lose no words, step down evenly, and the title sits below them.
     70b  a wide logo: every header line clears the logo (1A); a name that fits
          beside a square logo but not a wide one wraps only beside the wide
          one (2A).
     70c  an ordinary header is drawn exactly as before — one call per line,
          same x, same y, same text — with a logo and without.
     70d  one over-long word (a web address) is broken, not left running off.
     70f  release: V132, cache, What's new V132 (one line), changelog.

   ⚠ Like 57b/57c, 70a–70d load the REAL vendored jsPDF into the sandbox. A
   stub that "measures" text would let a wrong width pass. */

'use strict';

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, withSession, withItem } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');

/* ---- the real PDF engine, recording every text and image call ---- */
let ENGINE = null;
function engine() {
  if (ENGINE) return ENGINE;
  const ns = require(path.join(APP_DIR, 'jspdf.umd.min.js'));
  const prevWin = global.window;
  global.window = globalThis;
  global.window.jspdf = ns;
  require(path.join(APP_DIR, 'jspdf.plugin.autotable.min.js'));
  if (prevWin === undefined) delete global.window; else global.window = prevWin;
  ENGINE = ns;
  return ns;
}
function recordingNs(rec) {
  const ns = engine();
  const Real = ns.jsPDF;
  function Wrapped(...args) {
    const d = new Real(...args);
    rec.doc = d;
    const orig = d.text.bind(d);
    d.text = (txt, x, y, o) => {
      rec.calls.push({ lines: [].concat(txt).map(String), x, y, o: o || {},
        size: d.getFontSize(), font: d.getFont().fontStyle });
      return orig(txt, x, y, o);
    };
    const origImg = d.addImage.bind(d);
    d.addImage = (img, fmt, x, y, w, h, ...rest) => {
      rec.images.push({ x, y, w, h });
      return origImg(img, fmt, x, y, w, h, ...rest);
    };
    return d;
  }
  return Object.assign({}, ns, { jsPDF: Wrapped });
}

/* A real PNG, w×h pixels, solid blue — so jsPDF's own measurement decides the
   drawn size, exactly as for a user's logo. */
function png(w, h) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0)]);
  for (let i = 0; i < w; i++) { row[1 + i * 3] = 37; row[2 + i * 3] = 99; row[3 + i * 3] = 235; }
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const buf = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
  return 'data:image/png;base64,' + buf.toString('base64');
}
const WIDE_LOGO   = png(80, 20);   // ratio 4 → drawn 120×30
const SQUARE_LOGO = png(20, 20);   // ratio 1 → drawn 60×60

/* Build a certificate and return its header: every text call before the title. */
function header({ name, address, logo }) {
  const app = freshApp();
  const st = app.state();
  const rec = { calls: [], images: [], doc: null };
  app.sandbox.jspdf = recordingNs(rec);
  withSession(app, { site: 'ZZ Site' });
  withItem(app, { assetNo: '0001', itemType: 'Kettle', location: 'Kitchen', notes: '' });
  st.reportSettings.companyName = name || '';
  st.reportSettings.companyAddress = address || '';
  st.reportSettings.logo = logo || '';
  app.fn('buildReportDoc')(app.fn('activeSession')(), null);
  const d = rec.doc;
  const iTitle = rec.calls.findIndex(c => c.size === 17);
  const calls = rec.calls.slice(0, iTitle);
  const width = (c) => { d.setFontSize(c.size); d.setFont(undefined, c.font); return Math.max(...c.lines.map(l => d.getTextWidth(l))); };
  // The header logo is the image at the top-left margin; the certificate also
  // draws the PATGo footer logo (v49), so there can be two images.
  return { calls, title: rec.calls[iTitle], images: rec.images.filter(im => im.x === 40 && im.y === 40), width,
    pageW: d.internal.pageSize.getWidth(), name: calls.filter(c => c.size === 13), addr: calls.filter(c => c.size === 9) };
}
const words = (s) => s.split(/\s+/).filter(Boolean).join(' ');

const LONG_NAME = 'Birchley Portable Appliance Testing and Electrical Compliance Services Holdings Group Limited';
const LONG_ADDR = 'Unit 14B, Riverside Industrial Estate, Long Lane, Ruddington Fields Business Park, West Bridgford, Nottingham NG2 5AB, United Kingdom';

module.exports = async function run() {

  /* ------------------------------------------------------------------ 70a */
  await t.group('70a — no logo: a very long name and address wrap and stay on the page (1A)', () => {
    const h = header({ name: LONG_NAME, address: LONG_ADDR + '\nTel 0115 000 0000' });
    const margin = 40, right = h.pageW - margin;
    t.ok(h.name.length >= 2, 'the name wraps onto more than one line');
    t.ok(h.addr.length >= 3, 'the long address line wraps, and the phone line follows');
    t.ok(h.calls.every(c => c.lines.length === 1), 'one line per call');
    t.ok(h.calls.every(c => c.x === right && c.o.align === 'right'), 'every line right-aligned on the margin');
    t.ok(h.calls.every(c => right - h.width(c) >= margin - 0.01), 'no line runs past the left margin');
    t.eq(words(h.name.map(c => c.lines[0]).join(' ')), words(LONG_NAME), 'no word of the name lost');
    t.eq(words(h.addr.slice(0, -1).map(c => c.lines[0]).join(' ')), words(LONG_ADDR), 'no word of the address lost');
    t.eq(h.addr[h.addr.length - 1].lines[0], 'Tel 0115 000 0000', 'the next address line comes after it');
    const ys = h.calls.map(c => c.y);
    t.ok(h.name.every((c, i) => i === 0 || c.y - h.name[i - 1].y === 16), 'name lines step down 16pt each');
    t.ok(h.addr.every((c, i) => i === 0 || c.y - h.addr[i - 1].y === 12), 'address lines step down 12pt each');
    t.eq(h.addr[0].y - h.name[h.name.length - 1].y, 16, 'the address starts below the last name line');
    t.ok(h.title.y > Math.max(...ys) + 12, 'the title sits below the whole header');
  });

  /* ------------------------------------------------------------------ 70b */
  await t.group('70b — beside a logo: text clears the logo it is measured against (1A 2A)', () => {
    const h = header({ name: LONG_NAME, address: LONG_ADDR, logo: WIDE_LOGO });
    t.eq(h.images.length, 1, 'the logo is drawn at the top left');
    t.eq(Math.round(h.images[0].w), 120, 'a wide logo is drawn 120pt wide');
    const clear = h.images[0].x + h.images[0].w + 12;
    t.ok(h.calls.every(c => c.x - h.width(c) >= clear - 0.01), 'every header line clears the wide logo (12pt gap)');
    t.ok(h.name.length >= 2 && h.addr.length >= 2, 'name and address both wrap');

    // 2A: a name between the two rooms — too long beside a wide logo, short
    // enough beside a square one.
    const MID = 'Birchley Portable Appliance Testing & Compliance Services Ltd';
    const sq = header({ name: MID, logo: SQUARE_LOGO });
    const wide = header({ name: MID, logo: WIDE_LOGO });
    t.eq(Math.round(sq.images[0].w), 60, 'a square logo is drawn 60pt wide');
    const wSq = sq.width(sq.name[0]);
    t.ok(wSq > (wide.pageW - 40) - (40 + 120 + 12) && wSq <= (sq.pageW - 40) - (40 + 60 + 12),
      'precondition: the test name fits beside a square logo but not a wide one');
    t.eq(sq.name.length, 1, 'beside a square logo it stays on one line (2A)');
    t.eq(wide.name.length, 2, 'beside a wide logo it wraps');
    t.ok(sq.name[0].x - wSq >= 40 + 60 + 12 - 0.01, 'and still clears the square logo');
  });

  /* ------------------------------------------------------------------ 70c */
  await t.group('70c — an ordinary header is drawn exactly as before', () => {
    for (const logo of ['', WIDE_LOGO]) {
      const h = header({ name: 'Birchley PAT Services', address: '12 High Street\n\n  West Bridgford  \nNottingham NG2 5AB', logo });
      const tag = logo ? ' (with a logo)' : ' (no logo)';
      const got = h.calls.map(c => [c.lines.join('|'), c.x, c.y, c.size]);
      const want = [
        ['Birchley PAT Services', 555.28, 52, 13],
        ['12 High Street',        555.28, 68, 9],
        ['West Bridgford',        555.28, 80, 9],
        ['Nottingham NG2 5AB',    555.28, 92, 9],
      ];
      t.eq(got.length, 4, 'four lines, blank address line skipped' + tag);
      t.ok(got.every((g, i) => g[0] === want[i][0] && Math.abs(g[1] - want[i][1]) < 0.01 && g[2] === want[i][2] && g[3] === want[i][3]),
        'same text, x, y and size as V131' + tag);
    }
    const sp = header({ name: 'ZZ  Double  Space Ltd' });
    t.eq(sp.name[0].lines[0], 'ZZ  Double  Space Ltd', 'a name that fits is drawn exactly as typed');
  });

  /* ------------------------------------------------------------------ 70d */
  await t.group('70d — one over-long word (a web address) is broken, not left running off', () => {
    const site = 'www.' + 'averyverylongwebsiteaddress'.repeat(5) + '.co.uk';
    const h = header({ name: 'ZZ Web Ltd', address: site, logo: WIDE_LOGO });
    t.ok(h.addr.length >= 2, 'the address is split');
    t.eq(h.addr.map(c => c.lines[0]).join(''), site, 'every character kept, in order');
    t.ok(h.addr.every(c => c.x - h.width(c) >= 40 + 120 + 12 - 0.01), 'every piece clears the logo');
  });

  /* ------------------------------------------------------------------ 70f */
  // (69f → 70f: V131's release checks are V132's now.)
  await t.group('70f — release: V132, cache, What’s new V132, changelog', () => {
    const app = freshApp();
    t.eq(app.run('APP_VERSION'), 'V132', 'APP_VERSION V132');
    t.eq(app.run('WELCOME_VERSION'), 'V132', 'What’s new rolled');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v132';", 'cache key pat-v132');
    const core = read('render-core.js');
    const open = core.indexOf('<ul class="welcome-list sheet-scroll">');
    const sheet = core.slice(open, core.indexOf('</ul>', open));
    t.eq((sheet.match(/<li>/g) || []).length, 1, 'one line');
    t.includes(sheet, '<li><strong>Long company names fit.</strong>', 'the line: long company names');
    t.excludes(sheet, 'Certificates count as exported', 'V131’s copy gone');
    const help = read('render-help.js');
    const a = help.indexOf('<p><strong>V132</strong>'), b = help.indexOf('<p><strong>V131</strong>'), c = help.indexOf('<p><strong>V130</strong>');
    t.ok(a > -1 && b > a && c > b, 'About: V132, V131, V130');
    t.excludes(help, '<p><strong>V129</strong>', 'V129 rolled off');
    t.excludes(help, 'Easier with VoiceOver: + New job lands on the new job form', 'V129’s line gone with it');
    t.includes(help, 'A long company name or address line now wraps neatly at the top of the certificate', 'About: V132’s line');
    t.includes(help, 'Certificates count as exported: a job whose certificate was made after locking', 'About: V131’s line still there');
    t.includes(help, 'Tidying up behind the scenes, and the Privacy note brought up to date.', 'About: V130’s line still there');
  });
};
