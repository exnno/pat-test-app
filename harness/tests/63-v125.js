/* Standing test — V125: Export everything (Stage 12)
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   WHAT THIS RELEASE DID. Locked (14 Oct, Peter "0A 1A 2A 3A 4A 5A 6A"):
   One zip file of everything on THIS phone (exportall.js): the backup, a CSV
   per job with items, the certificates already made, the photo file (a tick,
   on by default) and a Read me. Settings → Backup & Restore, top.
   1A  one zip, every file inside one folder named like the zip. Our own
       STORE-only writer.
   2A  "Include photos", ticked by default; the photo file is Export photos'.
   3A  certificates only for jobs that already had one (certNo or reportAt);
       nothing new is issued — stampCertNumber is never called.
   4A  this phone only, said plainly first; cloud-only jobs never fetched; the
       cloud line shows only when signed in.
   5A  not "exported": no job is marked. (The zip IS a backup, so a completed
       save resets the backup reminder — Claude's call.)
   6A  Settings → Backup & Restore, top; progress sheet with Cancel.

     63a  the zip writer, read back by an independent reader in this file: CRC
          against Node's zlib, headers, UTF-8 names, offsets, the end record,
          DOS date; unique names; the real clock is back after group 08.
     63b  what goes in (3A 4A 5A): backup, a CSV per job with items (BOM),
          certificates only where one existed, the one folder, no number
          issued, the counter unmoved, no job marked exported.
     63c  photos (2A): ticked → Export photos' file; unticked → none; no photos
          → no tick.
     63d  the sheets (4A 6A): Settings section first on the page; the tap opens
          the sheet; "From this phone only"; the cloud line only when signed
          in; tick default on; the tick read on Make the file.
     63e  the run (iOS): nothing shared until the Save or share TAP; the File;
          backup reminder reset, no job exported; a cancelled share keeps the
          sheet; Cancel mid-build builds nothing more.
     63f  release: V125, What’s new rolled, cache, changelog. (62f → 63f.)

   ⚠ buildReportDoc cannot run headlessly (jsPDF is injected on demand). The
   certificate builder is replaced in the vm with a spy that returns a few PDF
   bytes; the real PDFs were checked in headless Chromium (see the handoff). */

'use strict';

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');
const t    = require('../assert');
const { APP_DIR } = require('../load');
const { freshApp, withSession, withItem, tick } = require('../fixture');

const read = (f) => fs.readFileSync(path.join(APP_DIR, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function ready() {
  const app = freshApp();
  const st = app.state();
  st.welcomeSeen = true;
  st.onboardedV33Seen = true;
  st.migrationPrompt = { show: false, name: '', items: [] };
  return app;
}

/* The certificate engine, faked: records which jobs were built. */
function fakeEngine(app) {
  app.run(`globalThis.__built = [];
    reportEngineReady = function () { return true; };
    buildReportDoc = function (s) {
      __built.push(s.id);
      return { output: function (k) { return k === 'arraybuffer' ? new Uint8Array([37, 80, 68, 70, 45, 49]).buffer : ''; } };
    };`);
}

/* Four jobs: A certificate number, B none, C certificate made with numbering
   off (reportAt only), D empty. A and B share a site and date. */
function fourJobs(app) {
  const st = app.state();
  const A = withSession(app, { site: 'Office Block' }); withItem(app, { assetNo: 'A1' });
  const B = withSession(app, { site: 'Office Block' }); withItem(app, { assetNo: 'B1' });
  const C = withSession(app, { site: 'Warehouse' });    withItem(app, { assetNo: 'C1' });
  const D = withSession(app, { site: 'Empty Unit' });
  A.certNo = 'PAT-0007';
  C.reportAt = '2026-10-01T09:00:00.000Z';
  st.reportSettings.certEnabled = true;
  st.reportSettings.certNextNumber = 8;
  st.reportSettings.showPhotos = false;
  return { A, B, C, D };
}

/* An independent zip reader. Throws on anything malformed. */
function unzip(buf) {
  const e = buf.length - 22;
  if (buf.readUInt32LE(e) !== 0x06054b50) throw new Error('no end record');
  const n = buf.readUInt16LE(e + 10);
  if (buf.readUInt16LE(e + 8) !== n) throw new Error('end record counts disagree');
  const cdSize = buf.readUInt32LE(e + 12), cdOff = buf.readUInt32LE(e + 16);
  const out = [];
  let p = cdOff;
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central header ' + i);
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10);
    const time = buf.readUInt16LE(p + 12), date = buf.readUInt16LE(p + 14);
    const crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), size = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    if (buf.readUInt32LE(off) !== 0x04034b50) throw new Error('offset of ' + name + ' is not a local header');
    const lflags = buf.readUInt16LE(off + 6), lmethod = buf.readUInt16LE(off + 8);
    const lcrc = buf.readUInt32LE(off + 14), lsize = buf.readUInt32LE(off + 22);
    const lnlen = buf.readUInt16LE(off + 26), lelen = buf.readUInt16LE(off + 28);
    const lname = buf.slice(off + 30, off + 30 + lnlen).toString('utf8');
    const data = buf.slice(off + 30 + lnlen + lelen, off + 30 + lnlen + lelen + csize);
    out.push({ name, lname, flags, lflags, method, lmethod, time, date, crc, lcrc, csize, size, lsize, data });
    p += 46 + nlen + elen + clen;
  }
  if (p !== cdOff + cdSize) throw new Error('central directory size wrong');
  return out;
}
const toBuf = (parts) => Buffer.concat(parts.map(u => Buffer.from(u.buffer, u.byteOffset, u.byteLength)));

function bodyText(app) { return (app.doc.body.children || []).map(c => c.innerHTML || '').join('\n'); }
function sheetOpen(app, text) { return (app.doc.body.children || []).some(c => (c.innerHTML || '').includes(text)); }

module.exports = async function run() {

  /* ------------------------------------------------------------------ 63a */
  await t.group('63a — the zip writer, read back independently (1A)', () => {
    const app = ready();
    const crc = app.fn('exportAllCrc32');
    const enc = new TextEncoder();
    t.eq(crc(enc.encode('123456789')), 0xCBF43926, 'CRC-32 of "123456789" is the standard check value');
    t.eq(crc(new Uint8Array(0)), 0, 'CRC-32 of nothing is 0');
    const big = new Uint8Array(70000).map((_, i) => (i * 31) & 0xFF);
    t.eq(crc(big), zlib.crc32(Buffer.from(big)), 'agrees with Node’s zlib on 70 KB');

    const when = new Date(2026, 9, 14, 10, 30, 44);   // 14 Oct 2026 10:30:44 local
    const dt = app.fn('exportAllDosTime')(when);
    t.eq(dt.date, ((2026 - 1980) << 9) | (10 << 5) | 14, 'DOS date: 14 Oct 2026 (month 10, not 9)');
    t.eq(dt.time, (10 << 11) | (30 << 5) | 22, 'DOS time: 10:30:44');

    const files = [
      { name: 'Root/Bob’s Café.csv', data: enc.encode('a,b\r\n1,2\r\n') },
      { name: 'Root/Certificates/x.pdf', data: big },
      { name: 'Root/empty.txt', data: new Uint8Array(0) },
    ];
    const zip = app.fn('exportAllZip')(files, when);
    const buf = toBuf(zip.parts);
    t.eq(zip.size, buf.length, 'the size it reports is the bytes it made');
    let got = [];
    t.doesNotThrow(() => { got = unzip(buf); }, 'an independent reader opens it');
    t.deepEq(got.map(g => g.name), files.map(f => f.name), 'every file, in order, names intact (UTF-8)');
    t.ok(got.every(g => g.lname === g.name), 'local and central names agree');
    t.ok(got.every(g => g.flags === 0x0800 && g.lflags === 0x0800), 'UTF-8 flag on both headers');
    t.ok(got.every(g => g.method === 0 && g.lmethod === 0), 'stored, not compressed');
    t.ok(got.every((g, i) => g.data.equals(Buffer.from(files[i].data))), 'every file’s bytes come back exactly');
    t.ok(got.every((g, i) => g.crc === zlib.crc32(Buffer.from(files[i].data)) && g.lcrc === g.crc), 'every CRC matches zlib, local and central');
    t.ok(got.every((g, i) => g.size === files[i].data.length && g.lsize === g.size && g.csize === g.size), 'sizes right');
    t.ok(got.every(g => g.date === dt.date && g.time === dt.time), 'stamped with the time given');

    const used = new Set();
    const uniq = app.fn('exportAllUniqueName');
    t.eq(uniq(used, 'R/PAT Office 14-10-2026.csv'), 'R/PAT Office 14-10-2026.csv', 'first name kept');
    t.eq(uniq(used, 'R/PAT Office 14-10-2026.csv'), 'R/PAT Office 14-10-2026 (2).csv', 'a repeat becomes (2)');
    t.eq(uniq(used, 'R/pat office 14-10-2026.CSV'), 'R/pat office 14-10-2026 (3).CSV', 'case does not make it different (Files ignores case)');
    t.eq(uniq(used, 'R/Read me'), 'R/Read me', 'no extension');
    t.eq(uniq(used, 'R/Read me'), 'R/Read me (2)', 'no extension, repeated');

    // V125 harness fix: group 08 used to leave Date.now faked for every later group.
    t.ok(Date.now() > 1.7e12, 'the real clock is back after group 08');
  });

  /* ------------------------------------------------------------------ 63b */
  await t.group('63b — what goes in: this phone, certificates only where made (3A 4A 5A)', async () => {
    const app = ready();
    fakeEngine(app);
    const { A, B, C, D } = fourJobs(app);
    const st = app.state();
    const before = JSON.stringify(st.sessions.map(s => [s.id, s.exportedAt || null, s.exportDirty || false]));
    const built = await app.fn('exportAllBuild')(false, null);
    const base = app.fn('exportAllBaseName')();
    t.ok(/^PATGo everything \d\d-\d\d-\d{4}$/.test(base), 'named "PATGo everything dd-mm-yyyy" — UK date, no underscores');
    const names = built.entries.map(e => e.name);
    t.ok(names.every(n => n.startsWith(base + '/')), 'every file inside one folder named like the zip');

    const backup = built.entries.find(e => /\/PAT backup \d\d-\d\d-\d{4}\.json$/.test(e.name));
    t.ok(!!backup, 'the backup is in');
    const payload = backup ? JSON.parse(Buffer.from(backup.data).toString('utf8')) : {};
    t.eq((payload.sessions || []).length, 4, 'the backup holds every job, the empty one too');

    const csvs = built.entries.filter(e => e.name.startsWith(base + '/Job spreadsheets/'));
    t.eq(csvs.length, 3, 'a spreadsheet for each job with items (not the empty one)');
    t.ok(csvs.every(e => e.data[0] === 0xEF && e.data[1] === 0xBB && e.data[2] === 0xBF), 'each starts with the BOM, like every CSV export (Excel)');
    t.ok(csvs.some(e => Buffer.from(e.data).toString('utf8').includes('B1')), 'job B’s items are in its spreadsheet');
    t.eq(new Set(csvs.map(e => e.name.toLowerCase())).size, 3, 'two jobs at the same site and date get two files');

    const certs = built.entries.filter(e => e.name.startsWith(base + '/Certificates/'));
    t.eq(certs.length, 2, 'two certificates: the numbered job and the one made with numbering off');
    t.deepEq(JSON.parse(app.run('JSON.stringify(__built)')).sort(), [A.id, C.id].sort(), 'built for A and C only — never B, never the empty one');
    t.ok(certs.every(e => e.name.endsWith('.pdf') && Buffer.from(e.data).toString('latin1').startsWith('%PDF')), 'PDF bytes from the doc');

    t.ok(!B.certNo, 'B was not given a number');
    t.ok(!C.certNo, 'C (made with numbering off) was not given one either');
    t.eq(A.certNo, 'PAT-0007', 'A keeps its own');
    t.eq(st.reportSettings.certNextNumber, 8, 'the counter has not moved');
    t.eq(JSON.stringify(st.sessions.map(s => [s.id, s.exportedAt || null, s.exportDirty || false])), before, 'no job marked exported (5A)');
    t.ok(names.some(n => n === base + '/Read me.txt'), 'a Read me');
    const readme = Buffer.from(built.entries.find(e => e.name.endsWith('/Read me.txt')).data).toString('utf8');
    t.includes(readme, 'only in the cloud are not in it', 'the Read me says this phone only (4A)');
    t.ok(!!D, 'the empty job exists');
  });

  /* ------------------------------------------------------------------ 63c */
  await t.group('63c — photos: the tick decides, Export photos’ own file (2A)', async () => {
    const app = ready();
    fakeEngine(app);
    fourJobs(app);
    const st = app.state();
    st.photoIndex = { x1: 2 }; st.photoBytes = 300000;
    app.run(`globalThis.__bundles = 0; buildPhotoBundle = function () { __bundles++; return Promise.resolve({ kind: PHOTO_BUNDLE_KIND, photoVersion: PHOTO_BUNDLE_VERSION, count: 2, photos: [{ id: 'p1' }, { id: 'p2' }] }); };`);
    const yes = await app.fn('exportAllBuild')(true, null);
    const ph = yes.entries.find(e => /\/PATGo photos \d\d-\d\d-\d{4}\.json$/.test(e.name));
    t.ok(!!ph, 'ticked: the photo file is in');
    const parsed = ph ? JSON.parse(Buffer.from(ph.data).toString('utf8')) : {};
    t.eq(parsed.kind, app.run('PHOTO_BUNDLE_KIND'), 'it is Export photos’ file (Import photos takes it)');
    t.eq(yes.counts.photos, 2, 'counted');
    // The photo index is refreshed from the (empty) stub database while the
    // build above awaited — set it again, or "unticked" would be tested on a
    // phone with no photos and could not fail (M1046).
    st.photoIndex = { x1: 2 }; st.photoBytes = 300000;
    t.eq(app.fn('exportAllPlan')().photoCount, 2, 'the phone still has photos for the unticked run');
    const no = await app.fn('exportAllBuild')(false, null);
    t.ok(!no.entries.some(e => /PATGo photos/.test(e.name)), 'unticked: no photo file');
    t.eq(app.run('__bundles'), 1, 'unticked: the photos are not even read');
    t.includes(Buffer.from(no.entries.find(e => e.name.endsWith('/Read me.txt')).data).toString('utf8'), 'Photos were left out', 'the Read me says so');

    // Set again: the photo index is refreshed from the (empty) stub database
    // while the builds above were awaiting.
    st.photoIndex = { x1: 2 }; st.photoBytes = 300000;
    app.fn('exportAllOpen')();
    t.includes(bodyText(app), 'id="export-all-photos" aria-label="Include photos" checked>', 'the tick is on by default');
    t.includes(bodyText(app), '2 photos, about', 'with how many and how big');
    app.doc.getElementById('export-all-x').click();

    const none = ready();
    fourJobs(none);
    none.fn('exportAllOpen')();
    t.excludes(bodyText(none), 'export-all-photos', 'no photos on the phone: no tick');
  });

  /* ------------------------------------------------------------------ 63d */
  await t.group('63d — the sheets: this phone first, the tick read on Make the file (4A 6A)', async () => {
    const app = ready();
    fourJobs(app);
    const page = app.fn('renderSettingsBackup')();
    const at = page.indexOf('data-action="export-all"');
    t.ok(at > -1, 'Backup & Restore has the button');
    t.ok(at < page.indexOf('<h2 class="h2">Backup</h2>'), '… at the top, above Backup (6A)');
    t.includes(page, 'everything on <strong>this phone</strong>', 'the page says this phone too');

    const el = app.doc.createElement('button');
    el.dataset.action = 'export-all';
    app.fn('handleDelegatedClick')({ target: el });
    t.ok(sheetOpen(app, 'Export everything'), 'the tap opens the sheet (through dispatch)');
    const txt = bodyText(app);
    t.includes(txt, '<strong>From this phone only.</strong>', 'it opens with "From this phone only" (4A)');
    t.ok(txt.indexOf('From this phone only') < txt.indexOf('a backup of all your jobs'), '… before what goes in');
    t.includes(txt, '2 certificates already made, with the same numbers', 'certificates counted, same numbers (3A)');
    t.includes(txt, 'a spreadsheet for each job (3 jobs)', 'spreadsheets counted');
    t.includes(txt, 'doesn&rsquo;t count as exporting a job', 'says it is not "exported" (5A)');
    t.excludes(txt, 'export-all-cloud', 'not signed in: no cloud line');
    app.doc.getElementById('export-all-x').click();

    app.run('syncActive = function () { return true; };');
    app.fn('exportAllOpen')();
    t.includes(bodyText(app), 'kept only in the cloud are <strong>not</strong> included', 'signed in: cloud-only jobs named as left out');

    app.state().photoIndex = { x: 1 }; app.state().photoBytes = 1000;
    app.doc.getElementById('export-all-x').click();
    app.run('globalThis.__runs = []; exportAllRun = function (p) { __runs.push(p); };');
    app.fn('exportAllOpen')();
    app.doc.getElementById('export-all-photos').checked = false;
    app.doc.getElementById('export-all-go').click();
    t.deepEq(JSON.parse(app.run('JSON.stringify(__runs)')), [false], 'unticked → run without photos');
    app.fn('exportAllOpen')();
    app.doc.getElementById('export-all-photos').checked = true;
    app.doc.getElementById('export-all-go').click();
    t.deepEq(JSON.parse(app.run('JSON.stringify(__runs)')), [false, true], 'ticked → run with photos');
  });

  /* ------------------------------------------------------------------ 63e */
  await t.group('63e — the run: nothing shared until the tap, backup reminder reset, Cancel stops (iOS)', async () => {
    const app = ready();
    fakeEngine(app);
    const { A } = fourJobs(app);
    const st = app.state();
    st.lastBackupAt = null;
    app.run(`globalThis.__shared = []; globalThis.__shareMode = 'ok';
      navigator.canShare = function () { return true; };
      navigator.share = async function (d) { __shared.push(d); if (__shareMode === 'abort') { const e = new Error('x'); e.name = 'AbortError'; throw e; } };`);
    await app.fn('exportAllRun')(false);
    t.eq(app.run('__shared.length'), 0, 'nothing shared while building — the share needs a fresh tap');
    t.ok(sheetOpen(app, 'Your file is ready'), 'it ends on the ready sheet');
    t.ok(!sheetOpen(app, 'Making your file'), 'the progress sheet has gone');

    app.run("__shareMode = 'abort';");
    app.doc.getElementById('export-all-save').click();
    await tick(); await tick();
    t.ok(sheetOpen(app, 'Your file is ready'), 'a cancelled share sheet: the ready sheet stays, to try again');
    t.eq(st.lastBackupAt, null, '… and the backup reminder is not reset');

    app.run("__shareMode = 'ok';");
    app.doc.getElementById('export-all-save').click();
    await tick(); await tick();
    const shared = app.run('__shared[__shared.length - 1]');
    const file = shared && shared.files && shared.files[0];
    t.ok(!!file && /^PATGo everything \d\d-\d\d-\d{4}\.zip$/.test(file.name), 'one file: PATGo everything dd-mm-yyyy.zip');
    t.eq(file && file.type, 'application/zip', 'a zip');
    let got = [];
    t.doesNotThrow(() => { got = unzip(toBuf(file._parts[0]._parts)); }, 'the shared file opens');
    t.ok(got.some(g => g.name.endsWith('/Read me.txt')), '… with everything in it');
    t.ok(!!st.lastBackupAt, 'saved: the backup reminder is reset (the zip holds a backup)');
    t.ok(!st.sessions.some(s => s.exportedAt), 'no job marked exported (5A)');
    t.eq(A.certNo, 'PAT-0007', 'numbers untouched');
    t.ok(!sheetOpen(app, 'Your file is ready'), 'the ready sheet closes after a save');

    // Cancel during the build: nothing more is built, no ready sheet.
    const b = ready();
    fakeEngine(b);
    fourJobs(b);
    const p = b.fn('exportAllRun')(false);
    t.ok(sheetOpen(b, 'Making your file'), 'the progress sheet shows');
    b.doc.getElementById('export-all-stop').click();
    await p;
    t.eq(b.run('__built.length'), 0, 'Cancel: no certificate built after it');
    t.ok(!sheetOpen(b, 'Your file is ready'), 'Cancel: no ready sheet');
    t.ok(!sheetOpen(b, 'Making your file'), 'Cancel: the progress sheet closed');
    let again = false;
    b.run('exportAllOpen = (function (o) { return function () { globalThis.__again = true; return o(); }; })(exportAllOpen);');
    b.fn('exportAllOpen')(); again = b.run('!!globalThis.__again') && sheetOpen(b, 'Export everything');
    t.ok(again, 'and it can be started again');

    const src = strip(read('exportall.js'));
    t.excludes(src, 'stampCertNumber(', 'exportall.js never issues a number (3A)');
    t.excludes(src, 'markSessionExported(', 'exportall.js never marks a job exported (5A)');
    t.excludes(src, 'syncPhotoDownload', 'never fetches from the cloud (4A)');
  });

  /* ------------------------------------------------------------------ 63f */
  await t.group('63f — release: V125, What’s new rolled, cache, changelog', () => {
    const app = freshApp();
    t.eq(app.run('APP_VERSION'), 'V125', 'APP_VERSION V125');
    t.eq(app.run('WELCOME_VERSION'), 'V125', 'What’s new rolled to V125');
    t.includes(read('sw.js'), "const CACHE_VERSION = 'pat-v125';", 'cache key pat-v125');
    t.includes(read('sw.js'), "  './exportall.js',", 'exportall.js precached');
    const idx = read('index.html');
    t.ok(idx.indexOf('src="pdfpreview.js"') < idx.indexOf('src="exportall.js"') && idx.indexOf('src="exportall.js"') < idx.indexOf('src="render-core.js"'), 'exportall.js loads after the report files, before the screens');
    t.eq(typeof app.fn('exportAllOpen'), 'function', 'and loads');
    const core = read('render-core.js');
    t.includes(core, '<li><strong>Export everything.</strong>', 'V125’s What’s new: the file');
    t.includes(core, '<li><strong>No new certificate numbers.</strong>', 'V125’s What’s new: numbers');
    t.includes(core, '<li><strong>Just this phone.</strong>', 'V125’s What’s new: this phone');
    t.excludes(core, '<li><strong>Updates find you.</strong>', 'V124’s sheet copy gone');
    const help = read('render-help.js');
    const a = help.indexOf('<p><strong>V125</strong>'), b = help.indexOf('<p><strong>V124</strong>'), c = help.indexOf('<p><strong>V123</strong>');
    t.ok(a > -1 && b > a && c > b, 'About: V125, V124, V123');
    t.excludes(help, '<p><strong>V122</strong>', 'V122 rolled off');
    t.excludes(help, 'Sessions are now called Jobs everywhere in the app', 'V122’s line gone with it');
    t.includes(help, 'Export everything: one zip file of everything on this phone', 'About: V125’s line');
    t.includes(help, 'Updates without the fuss: PATGo checks', 'About: V124’s line still there');
    t.includes(help, 'VoiceOver keeps your place: after a tap', 'About: V123’s line still there');
  });
};
