#!/usr/bin/env node
/**
 * CatWorld MUD boot test script
 *
 * Attempts to boot the CatWorld mudlib using lpc-js driver.
 * Reports step-by-step success/failure for each boot phase.
 */

import fs from 'node:fs';
import path from 'node:path';
import { Driver } from './src/runtime/driver.mjs';

const MUDLIB_DIR = '/Users/jrealm/Documents/cat/mudlib';

// Build a FluffOS-style config
const config = {
  'mudlib directory': MUDLIB_DIR,
  'name': 'CatWorld',
  'master file': '/adm/obj/master',
  'simul efun file': '/adm/obj/simul_efun',
  'include directories': MUDLIB_DIR + '/include',
  'global include file': '<globals.h>',
  'log directory': '/log',
  'max eval cost': '10000000',
  'max call outs': '5000',
  'time to reset': '1800',
  'time to clean up': '900',
  'max heart beat errors': '10',
};

function readFile(lpcPath) {
  // If it's already an absolute path (from preprocessor include resolution), try directly
  if (lpcPath.startsWith(MUDLIB_DIR)) {
    try { return fs.readFileSync(lpcPath, 'utf8'); } catch {}
    // Try with .h extension
    if (!lpcPath.endsWith('.h') && !lpcPath.endsWith('.c')) {
      try { return fs.readFileSync(lpcPath + '.h', 'utf8'); } catch {}
      try { return fs.readFileSync(lpcPath + '.c', 'utf8'); } catch {}
    }
    return null;
  }

  // LPC relative path — resolve against MUDLIB_DIR
  let p = lpcPath;
  if (!p.endsWith('.c') && !p.endsWith('.h')) p += '.c';
  if (p.startsWith('/')) p = p.slice(1);

  const fullPath = path.join(MUDLIB_DIR, p);
  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch {
    // Try without .c
    if (p.endsWith('.c')) {
      try { return fs.readFileSync(path.join(MUDLIB_DIR, p.slice(0, -2)), 'utf8'); } catch {}
      // Try .h
      try { return fs.readFileSync(path.join(MUDLIB_DIR, p.slice(0, -2) + '.h'), 'utf8'); } catch {}
    }
    return null;
  }
}

// Phase tracking
let phase = 0;
function step(name) {
  phase++;
  process.stdout.write(`[${phase}] ${name}... `);
}
function ok(detail) {
  console.log(`✅${detail ? ' ' + detail : ''}`);
}
function fail(err) {
  console.log(`❌`);
  console.error(`    Error: ${err.message ?? err}`);
  if (err.stack) {
    const lines = err.stack.split('\n').slice(1, 6);
    for (const line of lines) console.error(`    ${line.trim()}`);
  }
}

console.log('╔══════════════════════════════════════════════╗');
console.log('║  CatWorld × lpc-js Boot Test                ║');
console.log('╠══════════════════════════════════════════════╣');
console.log(`║  Mudlib: ${MUDLIB_DIR}`);
console.log('╚══════════════════════════════════════════════╝');
console.log('');

// Phase 1: Create Driver
step('Creating Driver');
let driver;
try {
  driver = new Driver(config, { readFile });
  ok();
} catch (e) {
  fail(e);
  process.exit(1);
}

// Phase 2: Compile master.c
step('Compiling master.c');
try {
  const masterFile = config['master file'];
  const masterSource = readFile(masterFile);
  if (!masterSource) throw new Error('master.c not found');
  ok(`(${masterSource.length} bytes)`);
} catch (e) {
  fail(e);
  process.exit(1);
}

// Phase 3: Load master
step('Loading master object');
try {
  const masterFile = config['master file'];
  driver.master = driver.objects.load(masterFile.endsWith('.c') ? masterFile : masterFile + '.c');
  ok(`${driver.master.objectId} — ${driver.master.program.functions.length} functions`);
} catch (e) {
  fail(e);
  process.exit(1);
}

// Phase 4: Load simul_efun
step('Loading simul_efun');
try {
  driver.loadSimulEfun();
  const count = driver.simulEfunNames.size;
  ok(`${count} simul_efuns registered`);
} catch (e) {
  fail(e);
  console.log('    (continuing without simul_efun)');
}

// Phase 5: Call epilog
step('Calling master->epilog()');
let preloadList = [];
try {
  const { apply } = await import('./src/runtime/apply.mjs');
  const { mkInt } = await import('./src/vm/svalue.mjs');
  const result = apply('epilog', driver.master, [mkInt(0)]);
  if (result?.type === 3) { // T_ARRAY
    preloadList = result.value.map(sv => sv.value).filter(Boolean);
    ok(`${preloadList.length} files to preload`);
  } else {
    ok('(no preload list returned)');
  }
} catch (e) {
  fail(e);
}

// Phase 6: Preload each daemon
if (preloadList.length > 0) {
  console.log('');
  console.log('Preloading daemons:');
  let loaded = 0, failed = 0;
  for (const filePath of preloadList) {
    process.stdout.write(`  [${loaded + failed + 1}/${preloadList.length}] ${filePath}... `);
    try {
      const { apply } = await import('./src/runtime/apply.mjs');
      const { mkString } = await import('./src/vm/svalue.mjs');
      apply('preload', driver.master, [mkString(filePath)]);
      console.log('✅');
      loaded++;
    } catch (e) {
      console.log('❌');
      console.error(`    ${e.message}`);
      if (e.stack) {
        const lines = e.stack.split('\n').slice(1, 4);
        for (const line of lines) console.error(`      ${line.trim()}`);
      }
      failed++;
    }
  }
  console.log('');
  console.log(`Preload complete: ${loaded} loaded, ${failed} failed`);
}

// Summary
console.log('');
console.log('╔══════════════════════════════════════════════╗');
console.log('║  Boot Summary                               ║');
console.log('╠══════════════════════════════════════════════╣');
console.log(`║  Objects loaded: ${driver.objects.objects.size}`);
console.log(`║  Efuns registered: ${driver.efuns.registry.size}`);
console.log(`║  Simul_efuns: ${driver.simulEfunNames.size}`);
console.log(`║  Heart beats: ${driver.heartBeatList.size}`);
console.log(`║  Call outs: ${driver.callOuts.getAll().length}`);
console.log('╚══════════════════════════════════════════════╝');
