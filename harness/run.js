#!/usr/bin/env node
/* PATGo test harness — entry point
   (c) 2026 Peter Birchley. All rights reserved.

   NOT shipped. Excluded from index.html and from sw.js ASSETS.

   Usage:
     node harness/run.js              run every standing test
     node harness/run.js 03 05        run only matching test files

   Add a release's own assertions as harness/tests/NN-name.js and they are
   picked up automatically. Do NOT delete them at the end of the release —
   the whole point of this folder is that the next release inherits them. */

'use strict';

const fs   = require('fs');
const path = require('path');
const t    = require('./assert');

const TEST_DIR = path.join(__dirname, 'tests');

async function main() {
  const filter = process.argv.slice(2);
  const files = fs.readdirSync(TEST_DIR)
    .filter(f => f.endsWith('.js'))
    .sort()
    .filter(f => !filter.length || filter.some(x => f.includes(x)));

  if (!files.length) {
    console.error('No test files matched.');
    process.exit(2);
  }

  console.log(`PATGo harness — ${files.length} test file${files.length === 1 ? '' : 's'}`);

  for (const f of files) {
    const mod = require(path.join(TEST_DIR, f));
    await mod();
  }

  const failed = t.report();
  process.exit(failed ? 1 : 0);
}

main().catch(e => {
  console.error('\nHARNESS CRASHED — this is a harness defect until proven otherwise.');
  console.error(e.stack || e.message);
  process.exit(3);
});
