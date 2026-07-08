#!/usr/bin/env node
/**
 * TabletopRPG environment pre-check script.
 *
 * Runs before `vite` to detect and auto-fix missing dependencies:
 *   1. Node.js version  (>= 22.12 required by Vite 8)
 *   2. npm availability
 *   3. node_modules integrity  (auto: npm install)
 *   4. Native bindings         (auto: npm rebuild)
 *   5. .env.local AI config    (warn only)
 *
 * Performance: caches results to .precheck-cache.json. On subsequent
 * runs where no tracked files have changed, completes in <50ms.
 *
 * Pure built-in modules only — must run even when node_modules is empty.
 *
 * Usage:
 *   node scripts/precheck.mjs          # check + auto-fix, exit 0/1
 *   node scripts/precheck.mjs --quiet  # suppress OK lines
 *   node scripts/precheck.mjs --no-cache  # skip cache, always full check
 */

import { existsSync, readFileSync, statSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ── paths ──────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

// ── cache ──────────────────────────────────────────────
const CACHE_FILE = join(ROOT, '.precheck-cache.json');
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

// ── ANSI ───────────────────────────────────────────────
const isTTY = process.stdout.isTTY;
const c = isTTY
  ? {
      reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
      green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
      cyan: '\x1b[36m', gray: '\x1b[90m',
    }
  : {
      reset: '', bold: '', dim: '',
      green: '', yellow: '', red: '', cyan: '', gray: '',
    };

const OK_TAG = `${c.green}OK${c.reset}`;
const FIX_TAG = `${c.yellow}FIX${c.reset}`;
const ERR_TAG = `${c.red}ERR${c.reset}`;
const WARN_TAG = `${c.yellow}WARN${c.reset}`;
const INFO_TAG = `${c.cyan}..${c.reset}`;

const quiet = process.argv.includes('--quiet') || process.argv.includes('-q');
const noCache = process.argv.includes('--no-cache');

let errorCount = 0;
let warnCount = 0;
let fixCount = 0;

function line(tag, msg) {
  if (quiet && tag === OK_TAG) return;
  const pad = msg ? ' ' : '';
  console.log(`  ${tag}${pad}${msg}`);
}
function section(title) {
  console.log(`\n${c.bold}${c.cyan}-- ${title}${c.reset}`);
}

// ── semver helpers ─────────────────────────────────────
function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v);
  return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
}
function cmpVersion(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

// ── shell helper ───────────────────────────────────────
function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, stdio: opts.silent ? 'pipe' : 'inherit', encoding: 'utf8', ...opts });
}
function runCapture(cmd) {
  try {
    return run(cmd, { silent: true }).trim();
  } catch {
    return null;
  }
}

// ── file mtime helper ──────────────────────────────────
function mtime(filePath) {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

// ── native binding platform suffix ────────────────────
function bindingSuffix() {
  const p = process.platform;
  const a = process.arch;
  if (p === 'win32') return `${p}-${a}-msvc`;
  if (p === 'darwin') return `${p}-${a}`;
  if (p === 'linux') {
    // detect musl vs gnu — fallback to gnu
    return `${p}-${a}-gnu`;
  }
  return `${p}-${a}`;
}

// ── tracked files for cache validation ─────────────────
function trackedFiles() {
  const suffix = bindingSuffix();
  const nmDir = join(ROOT, 'node_modules');
  return [
    join(ROOT, 'package.json'),
    join(ROOT, 'package-lock.json'),
    join(ROOT, '.env.local'),
    join(nmDir, 'vite', 'package.json'),
    join(nmDir, '@rolldown', `binding-${suffix}`, `rolldown-binding.${suffix}.node`),
    join(nmDir, `lightningcss-${suffix}`, `lightningcss.${suffix}.node`),
  ];
}

// ================================================================
//  Cache: fast-path — skip full check if nothing changed
// ================================================================
function tryCache() {
  if (noCache) return false;

  let cache;
  try {
    cache = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return false;
  }

  // TTL check
  if (Date.now() - cache.timestamp > CACHE_TTL) return false;

  // Node version must match
  if (cache.nodeVersion !== process.version) return false;

  // All tracked files must have identical mtime
  const files = trackedFiles();
  if (files.length !== (cache.files || []).length) return false;

  for (const entry of cache.files) {
    const currentMtime = mtime(entry.path);
    if (currentMtime === 0) return false;       // file deleted
    if (currentMtime !== entry.mtime) return false; // file changed
  }

  // Cache hit — environment unchanged since last successful check
  console.log(`  ${OK_TAG} environment verified ${c.dim}(cached)${c.reset}`);
  return true;
}

function writeCache() {
  const files = trackedFiles()
    .map((path) => ({ path, mtime: mtime(path) }))
    .filter((f) => f.mtime > 0);

  try {
    writeFileSync(CACHE_FILE, JSON.stringify({
      timestamp: Date.now(),
      nodeVersion: process.version,
      files,
    }, null, 2));
  } catch { /* ignore write errors */ }
}

// ================================================================
//  1. Node.js version
// ================================================================
function checkNodeVersion() {
  section('Node.js');
  const current = process.version;
  const parsed = parseVersion(current);
  const required = [22, 12, 0]; // Vite 8 minimum for Node 22 branch

  if (cmpVersion(parsed, required) >= 0) {
    line(OK_TAG, `Node.js ${current}`);
    return true;
  }

  line(ERR_TAG, `Node.js ${current} -- need >= v22.12.0 (Vite 8 requirement)`);
  line('', `${c.dim}Download: https://nodejs.org/ (choose 22 LTS or newer)${c.reset}`);
  errorCount++;
  return false;
}

// ================================================================
//  2. npm availability (file-system check, no subprocess)
// ================================================================
function checkNpm() {
  section('npm');

  // npm ships with Node.js. Check its presence via file system
  // instead of spawning `npm --version` (saves ~300-500ms on Windows).
  const nodeDir = dirname(process.execPath);
  const candidates = process.platform === 'win32'
    ? [join(nodeDir, 'npm.cmd'), join(nodeDir, 'npm.ps1'), join(nodeDir, 'npm')]
    : [join(nodeDir, 'npm'), join(nodeDir, 'npm-cli.js'), join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')];

  for (const p of candidates) {
    if (existsSync(p)) {
      line(OK_TAG, `npm available ${c.dim}(${p})${c.reset}`);
      return true;
    }
  }

  // Fallback: scan PATH for npm (rare edge case)
  const PATH = (process.env.PATH || process.env.Path || '').split(process.platform === 'win32' ? ';' : ':');
  for (const dir of PATH) {
    if (!dir) continue;
    const npmInPath = join(dir, process.platform === 'win32' ? 'npm.cmd' : 'npm');
    if (existsSync(npmInPath)) {
      line(OK_TAG, `npm available ${c.dim}(PATH: ${dir})${c.reset}`);
      return true;
    }
  }

  line(ERR_TAG, 'npm not found -- reinstall Node.js from https://nodejs.org/');
  errorCount++;
  return false;
}

// ================================================================
//  3. node_modules integrity
// ================================================================
function checkNodeModules() {
  section('Dependencies');

  const nmDir = join(ROOT, 'node_modules');
  const pkgJsonPath = join(ROOT, 'package.json');
  const lockPath = join(ROOT, 'package-lock.json');
  const vitePkg = join(nmDir, 'vite', 'package.json');

  // Quick check: does node_modules exist with vite installed?
  if (existsSync(vitePkg)) {
    // Verify package.json hasn't been modified since last install
    try {
      const pkgMtime = statSync(pkgJsonPath).mtimeMs;
      const lockMtime = existsSync(lockPath) ? statSync(lockPath).mtimeMs : 0;
      if (lockMtime > 0 && pkgMtime > lockMtime) {
        line(WARN_TAG, 'package.json modified since last npm install');
        return autoInstall();
      }
    } catch { /* ignore stat errors */ }
    line(OK_TAG, 'node_modules present');
    return true;
  }

  if (!existsSync(nmDir)) {
    line(FIX_TAG, 'node_modules missing');
  } else {
    line(FIX_TAG, 'node_modules incomplete (vite not found)');
  }
  return autoInstall();
}

function autoInstall() {
  line(INFO_TAG, 'Running npm install...');
  try {
    run('npm install');
    fixCount++;
    line(OK_TAG, 'npm install completed');
    return true;
  } catch {
    line(ERR_TAG, 'npm install failed -- check network and try manually: npm install');
    errorCount++;
    return false;
  }
}

// ================================================================
//  4. Native bindings (rolldown, lightningcss)
// ================================================================
function checkNativeBindings() {
  section('Native bindings');

  const suffix = bindingSuffix();
  const nmDir = join(ROOT, 'node_modules');

  // Rolldown binding
  const rolldownBindingDir = join(nmDir, '@rolldown', `binding-${suffix}`);
  const rolldownNodeFile = join(rolldownBindingDir, `rolldown-binding.${suffix}.node`);
  let rolldownOk = existsSync(rolldownNodeFile);

  // Lightningcss binding
  const lightningcssDir = join(nmDir, `lightningcss-${suffix}`);
  const lightningcssNodeFile = join(lightningcssDir, `lightningcss.${suffix}.node`);
  let lightningcssOk = existsSync(lightningcssNodeFile);

  if (rolldownOk && lightningcssOk) {
    line(OK_TAG, `rolldown + lightningcss native modules (${suffix})`);
    return true;
  }

  if (!rolldownOk) line(FIX_TAG, `rolldown binding missing (${suffix})`);
  if (!lightningcssOk) line(FIX_TAG, `lightningcss binding missing (${suffix})`);
  return autoRebuild();
}

function autoRebuild() {
  const suffix = bindingSuffix();
  const nmDir = join(ROOT, 'node_modules');

  // Strategy 1: npm rebuild (re-runs install scripts, fastest)
  line(INFO_TAG, 'Running npm rebuild...');
  try {
    run('npm rebuild');
    fixCount++;
  } catch {
    line(WARN_TAG, 'npm rebuild had issues, trying full reinstall...');
  }

  if (bindingsExist(nmDir, suffix)) {
    line(OK_TAG, 'native bindings restored via rebuild');
    return true;
  }

  // Strategy 2: delete broken package dirs, then npm install (re-downloads)
  line(INFO_TAG, 'Rebuild did not fix it -- force re-downloading binding packages...');
  const bindingDirs = [
    join(nmDir, '@rolldown', `binding-${suffix}`),
    join(nmDir, `lightningcss-${suffix}`),
  ];
  for (const dir of bindingDirs) {
    if (existsSync(dir)) {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  try {
    run('npm install');
    fixCount++;
  } catch { /* ignore */ }

  if (bindingsExist(nmDir, suffix)) {
    line(OK_TAG, 'native bindings restored via reinstall');
    return true;
  }

  line(ERR_TAG, `native bindings still missing after reinstall`);
  line('', `${c.dim}Try: npm cache clean --force && npm install${c.reset}`);
  line('', `${c.dim}Or check if your Node.js version matches the platform (${suffix})${c.reset}`);
  errorCount++;
  return false;
}

function bindingsExist(nmDir, suffix) {
  const rolldown = join(nmDir, '@rolldown', `binding-${suffix}`, `rolldown-binding.${suffix}.node`);
  const lightningcss = join(nmDir, `lightningcss-${suffix}`, `lightningcss.${suffix}.node`);
  return existsSync(rolldown) && existsSync(lightningcss);
}

// ================================================================
//  5. .env.local AI configuration
// ================================================================
function checkEnvConfig() {
  section('AI config');

  const envPath = join(ROOT, '.env.local');
  if (!existsSync(envPath)) {
    line(WARN_TAG, '.env.local not found');
    line('', `${c.dim}The game will start -- configure AI in the in-game Settings panel.${c.reset}`);
    line('', `${c.dim}(Settings will be saved to .env.local automatically)${c.reset}`);
    warnCount++;
    return true; // non-blocking
  }

  let content;
  try {
    content = readFileSync(envPath, 'utf8');
  } catch {
    line(WARN_TAG, '.env.local exists but cannot be read');
    warnCount++;
    return true;
  }

  const requiredKeys = ['VITE_AI_API_KEY'];
  const optionalKeys = ['VITE_AI_PROVIDER', 'VITE_AI_PROTOCOL', 'VITE_AI_ENDPOINT', 'VITE_AI_MODEL'];
  const missing = requiredKeys.filter((k) => !content.includes(`${k}=`) || content.includes(`${k}=\n`) || content.includes(`${k}=\r`));

  if (missing.length) {
    line(WARN_TAG, `.env.local missing: ${missing.join(', ')}`);
    line('', `${c.dim}Configure AI in the in-game Settings panel.${c.reset}`);
    warnCount++;
    return true;
  }

  // Check for placeholder values
  const hasProvider = optionalKeys.some((k) => content.includes(`${k}=`));
  if (hasProvider) {
    line(OK_TAG, '.env.local configured');
  } else {
    line(OK_TAG, '.env.local exists (API key present)');
  }
  return true;
}

// ================================================================
//  Summary
// ================================================================
function printSummary() {
  console.log('');
  if (errorCount > 0) {
    console.log(`${c.bold}${c.red}Pre-check failed${c.reset} -- ${errorCount} error(s), ${warnCount} warning(s), ${fixCount} auto-fixed`);
    console.log(`${c.dim}Fix the errors above, then run again.${c.reset}`);
    process.exit(1);
  }

  if (fixCount > 0) {
    console.log(`${c.bold}${c.green}Pre-check passed${c.reset} -- ${fixCount} issue(s) auto-fixed, ${warnCount} warning(s)`);
  } else if (warnCount > 0) {
    console.log(`${c.bold}${c.green}Pre-check passed${c.reset} -- ${warnCount} warning(s)`);
  } else {
    console.log(`${c.bold}${c.green}Pre-check passed${c.reset} -- all checks OK`);
  }
  process.exit(0);
}

// ================================================================
//  Main
// ================================================================

// ── Fast path: try cache first ──────────────────────────
if (tryCache()) {
  process.exit(0);
}

// ── Full path: run all checks ───────────────────────────
console.log(`${c.bold}TabletopRPG environment pre-check${c.reset}`);
console.log(`${c.dim}Project: ${ROOT}${c.reset}`);

const nodeOk = checkNodeVersion();
if (!nodeOk) {
  // Can't continue — npm install etc. might fail with wrong Node version
  printSummary();
  process.exit(1);
}

const npmOk = checkNpm();
if (!npmOk) {
  printSummary();
  process.exit(1);
}

const depsOk = checkNodeModules();
if (!depsOk) {
  printSummary();
  process.exit(1);
}

// Only check native bindings if deps are present
checkNativeBindings();
checkEnvConfig();

// ── Write cache for next run ────────────────────────────
if (errorCount === 0) {
  writeCache();
}

printSummary();
