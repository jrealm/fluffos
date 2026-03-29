#!/usr/bin/env node
/**
 * CatWorld MUD — lpc-js Driver
 *
 * Usage:
 *   node boot-catworld.mjs              # Boot on default port 5555
 *   node boot-catworld.mjs 4000         # Boot on custom port
 *   node boot-catworld.mjs --test       # Boot test only (no network)
 *
 * Connect:
 *   telnet localhost 5555
 */

import fs from 'node:fs';
import path from 'node:path';
import { Driver } from './src/runtime/driver.mjs';
import { apply } from './src/runtime/apply.mjs';
import { mkInt, mkString } from './src/vm/svalue.mjs';

const PORT = parseInt(process.argv[2], 10) || 5555;
const TEST_ONLY = process.argv.includes('--test');
const MUDLIB_DIR = '/Users/jrealm/Documents/cat/mudlib';

const config = {
  'mudlib directory': MUDLIB_DIR,
  'name': 'CatWorld',
  'port number': String(PORT),
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
  'websocket port number': '6660',
};

function readFile(lpcPath) {
  if (lpcPath.startsWith(MUDLIB_DIR)) {
    try { return fs.readFileSync(lpcPath, 'utf8'); } catch {}
    if (!lpcPath.endsWith('.h') && !lpcPath.endsWith('.c')) {
      try { return fs.readFileSync(lpcPath + '.h', 'utf8'); } catch {}
      try { return fs.readFileSync(lpcPath + '.c', 'utf8'); } catch {}
    }
    return null;
  }
  let p = lpcPath;
  if (!p.endsWith('.c') && !p.endsWith('.h')) p += '.c';
  if (p.startsWith('/')) p = p.slice(1);
  const fullPath = path.join(MUDLIB_DIR, p);
  try { return fs.readFileSync(fullPath, 'utf8'); } catch {}
  if (p.endsWith('.c')) {
    try { return fs.readFileSync(path.join(MUDLIB_DIR, p.slice(0, -2)), 'utf8'); } catch {}
    try { return fs.readFileSync(path.join(MUDLIB_DIR, p.slice(0, -2) + '.h'), 'utf8'); } catch {}
  }
  return null;
}

// ── Logging helpers ──
let phase = 0;
function step(name) { phase++; process.stdout.write(`[${phase}] ${name}... `); }
function ok(detail) { console.log(`\u2705${detail ? ' ' + detail : ''}`); }
function fail(err) {
  console.log(`\u274C`);
  console.error(`    Error: ${err.message ?? err}`);
  if (err.stack) err.stack.split('\n').slice(1, 5).forEach(l => console.error(`    ${l.trim()}`));
}

// ══════════════════════════════════════════════
//  BOOT SEQUENCE
// ══════════════════════════════════════════════

console.log('');
console.log(`  CatWorld \u00d7 lpc-js Driver`);
console.log(`  Mudlib: ${MUDLIB_DIR}`);
console.log(`  Port:   ${TEST_ONLY ? '(test only)' : PORT}`);
console.log('');

// 1. Create Driver
step('Creating Driver');
let driver;
try {
  driver = new Driver(config, { readFile });
  ok();
} catch (e) { fail(e); process.exit(1); }

// 2. Load master
step('Loading master object');
try {
  const masterFile = config['master file'];
  driver.master = driver.objects.load(masterFile.endsWith('.c') ? masterFile : masterFile + '.c');
  ok(`${driver.master.program.functions.length} functions`);
} catch (e) { fail(e); process.exit(1); }

// 3. Load simul_efun
step('Loading simul_efun');
try {
  driver.loadSimulEfun();
  ok(`${driver.simulEfunNames.size} simul_efuns`);
} catch (e) {
  fail(e);
  console.log('    (continuing without simul_efun)');
}

// 4. Epilog + preload
step('Calling epilog()');
let preloadList = [];
try {
  const result = apply('epilog', driver.master, [mkInt(0)]);
  if (result?.type === 3) {
    preloadList = result.value.map(sv => sv.value).filter(Boolean);
    ok(`${preloadList.length} files`);
  } else { ok('(none)'); }
} catch (e) { fail(e); }

if (preloadList.length > 0) {
  let loaded = 0, failed = 0;
  for (const filePath of preloadList) {
    process.stdout.write(`  [${loaded + failed + 1}/${preloadList.length}] ${filePath}... `);
    try {
      apply('preload', driver.master, [mkString(filePath)]);
      console.log('\u2705');
      loaded++;
    } catch (e) {
      console.log('\u274C');
      console.error(`    ${e.message}`);
      failed++;
    }
  }
  console.log(`  Preload: ${loaded} ok, ${failed} failed`);
}

// ── Summary ──
console.log('');
console.log(`  Objects: ${driver.objects.objects.size}  Efuns: ${driver.efuns.registry.size}  Simul: ${driver.simulEfunNames.size}`);
console.log('');

if (TEST_ONLY) {
  console.log('  --test mode: boot complete, exiting.');
  process.exit(0);
}

// ══════════════════════════════════════════════
//  NETWORK + MAIN LOOP
// ══════════════════════════════════════════════

step('Starting network server');
try {
  await driver.startServer(PORT);
  ok(`listening on port ${PORT}`);
} catch (e) { fail(e); process.exit(1); }

console.log('');
console.log(`  \u2501\u2501\u2501 CatWorld is running \u2501\u2501\u2501`);
console.log(`  Telnet:    telnet localhost ${PORT}`);
console.log(`  Press Ctrl+C to stop.`);
console.log('');

// Main loop — heartbeat, call_out, reset, clean_up
const TICK_MS = 1000; // 1 second ticks
const loopTimer = setInterval(() => {
  try {
    driver.mainLoop();
  } catch (e) {
    console.error(`Main loop error: ${e.message}`);
  }
}, TICK_MS);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n  Shutting down...');
  clearInterval(loopTimer);
  driver.stopServer();
  console.log('  Goodbye.');
  process.exit(0);
});

process.on('uncaughtException', (e) => {
  console.error(`Uncaught: ${e.message}`);
  console.error(e.stack?.split('\n').slice(0, 5).join('\n'));
});
