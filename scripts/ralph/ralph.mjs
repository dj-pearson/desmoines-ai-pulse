#!/usr/bin/env node
/**
 * Ralph - Autonomous AI Agent Loop (Node.js / cross-platform)
 *
 * Pure Node.js rewrite of ralph.sh so it runs on Windows without WSL
 * or opening an interactive terminal window.
 *
 * Usage:
 *   node scripts/ralph/ralph.mjs [--tool claude|amp] [--max <n>] [--resume]
 *
 * Examples:
 *   node scripts/ralph/ralph.mjs --tool claude
 *   node scripts/ralph/ralph.mjs --tool claude --max 20
 *   node scripts/ralph/ralph.mjs --tool claude --resume
 *
 * Prerequisites:
 *   - Claude Code installed:  npm install -g @anthropic-ai/claude-code
 */

import { spawn } from 'node:child_process';
import {
  readFileSync, writeFileSync, existsSync,
  mkdirSync, copyFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Args ──────────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
let TOOL = 'claude';
let MAX_ITERATIONS = 10;
let RESUME = false;

for (let i = 0; i < args.length; i++) {
  if      (args[i] === '--tool' && args[i+1])    { TOOL = args[++i]; }
  else if (args[i].startsWith('--tool='))         { TOOL = args[i].split('=')[1]; }
  else if (args[i] === '--max' && args[i+1])      { MAX_ITERATIONS = parseInt(args[++i], 10); }
  else if (args[i].startsWith('--max='))          { MAX_ITERATIONS = parseInt(args[i].split('=')[1], 10); }
  else if (args[i] === '--resume')                { RESUME = true; }
  else if (/^\d+$/.test(args[i]))                 { MAX_ITERATIONS = parseInt(args[i], 10); }
}

if (TOOL !== 'claude' && TOOL !== 'amp') {
  console.error(`Error: Invalid tool "${TOOL}". Must be "claude" or "amp".`);
  process.exit(1);
}

// ── Paths ─────────────────────────────────────────────────────────────────────
const PROJECT_ROOT = join(__dirname, '..', '..');

// prd.json: prefer project root, fall back to scripts/ralph/
const PRD_FILE = existsSync(join(PROJECT_ROOT, 'prd.json'))
  ? join(PROJECT_ROOT, 'prd.json')
  : join(__dirname, 'prd.json');

const PROGRESS_FILE = join(__dirname, 'progress.txt');
const ARCHIVE_DIR   = join(__dirname, 'archive');
const LAST_BRANCH   = join(__dirname, '.last-branch');
const CLAUDE_MD     = join(__dirname, 'CLAUDE.md');
const PROMPT_MD     = join(__dirname, 'prompt.md');

// ── Helpers ───────────────────────────────────────────────────────────────────
function log(msg) { process.stdout.write(msg + '\n'); }

function separator(label) {
  const line = '═'.repeat(60);
  log('\n' + line);
  log(`  ${label}`);
  log(line);
}

function readJSON(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { return null; }
}

function initProgress() {
  if (!existsSync(PROGRESS_FILE)) {
    writeFileSync(PROGRESS_FILE, [
      '# Ralph Progress Log',
      `Started: ${new Date().toISOString()}`,
      '---', '',
    ].join('\n'));
  }
}

function archivePreviousRun(prd) {
  if (!existsSync(LAST_BRANCH)) return;
  const lastBranch    = readFileSync(LAST_BRANCH, 'utf8').trim();
  const currentBranch = prd?.branchName ?? '';
  if (!currentBranch || !lastBranch || currentBranch === lastBranch) return;

  const date         = new Date().toISOString().slice(0, 10);
  const folderName   = lastBranch.replace(/^ralph\//, '');
  const archiveFolder = join(ARCHIVE_DIR, `${date}-${folderName}`);

  log(`Archiving previous run: ${lastBranch} → ${archiveFolder}`);
  mkdirSync(archiveFolder, { recursive: true });
  if (existsSync(PRD_FILE))      copyFileSync(PRD_FILE,      join(archiveFolder, 'prd.json'));
  if (existsSync(PROGRESS_FILE)) copyFileSync(PROGRESS_FILE, join(archiveFolder, 'progress.txt'));

  writeFileSync(PROGRESS_FILE, [
    '# Ralph Progress Log',
    `Started: ${new Date().toISOString()}`,
    '---', '',
  ].join('\n'));
}

function trackBranch(prd) {
  const branch = prd?.branchName ?? '';
  if (branch) writeFileSync(LAST_BRANCH, branch);
}

function countRemaining(prd) {
  if (!prd?.userStories) return 0;
  return prd.userStories.filter(s => !s.passes).length;
}

/** Run one Claude / Amp iteration, streaming output live. */
async function runIteration() {
  return new Promise((resolve, reject) => {
    let cmdBin, cmdArgs, input;

    if (TOOL === 'claude') {
      cmdBin  = 'claude';
      cmdArgs = ['--dangerously-skip-permissions', '--print'];
      input   = existsSync(CLAUDE_MD) ? readFileSync(CLAUDE_MD, 'utf8') : '';
    } else {
      cmdBin  = 'amp';
      cmdArgs = ['--dangerously-allow-all'];
      input   = existsSync(PROMPT_MD) ? readFileSync(PROMPT_MD, 'utf8') : '';
    }

    // On Windows, npm global CLIs are .cmd wrappers that need the shell to
    // resolve.  shell:true uses cmd.exe for PATH lookup only — it does NOT
    // open a new terminal window because all stdio is piped.
    const isWindows = process.platform === 'win32';
    const child = spawn(cmdBin, cmdArgs, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: isWindows,
    });

    let output = '';

    child.stdout.on('data', chunk => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', chunk => {
      process.stderr.write(chunk);
    });

    child.on('error', err => {
      if (err.code === 'ENOENT') {
        reject(new Error(
          `"${cmdBin}" not found. Install it:\n` +
          (TOOL === 'claude'
            ? '  npm install -g @anthropic-ai/claude-code'
            : '  See https://ampcode.com for Amp installation')
        ));
      } else {
        reject(err);
      }
    });

    // Feed the prompt on stdin then close it
    if (input) child.stdin.write(input, 'utf8');
    child.stdin.end();

    child.on('close', code => {
      if (code !== 0 && code !== null) {
        log(`\n[ralph] ${TOOL} exited with code ${code} — continuing anyway.`);
      }
      resolve(output);
    });
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!existsSync(PRD_FILE)) {
    log('Error: prd.json not found (checked project root and scripts/ralph/).');
    log('Create one based on scripts/ralph/prd.json.example first.');
    process.exit(1);
  }
  if (TOOL === 'claude' && !existsSync(CLAUDE_MD)) {
    log('Error: scripts/ralph/CLAUDE.md not found.');
    process.exit(1);
  }
  if (TOOL === 'amp' && !existsSync(PROMPT_MD)) {
    log('Error: scripts/ralph/prompt.md not found.');
    process.exit(1);
  }

  const prd = readJSON(PRD_FILE);

  if (!RESUME) archivePreviousRun(prd);
  trackBranch(prd);
  initProgress();

  log(`\nStarting Ralph`);
  log(`  Tool:           ${TOOL}`);
  log(`  Max iterations: ${MAX_ITERATIONS}`);
  log(`  PRD file:       ${PRD_FILE}`);
  log(`  Project:        ${prd?.project ?? '(unknown)'}`);
  log(`  Branch:         ${prd?.branchName ?? '(none)'}`);
  log(`  Stories left:   ${countRemaining(prd)}`);

  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    separator(`Ralph Iteration ${i} of ${MAX_ITERATIONS} (${TOOL})`);

    const currentPrd  = readJSON(PRD_FILE);
    const remaining   = countRemaining(currentPrd);

    if (remaining === 0) {
      log('\n✅ All stories already complete. Nothing left to do!');
      log('   COMPLETE ');
      process.exit(0);
    }

    log(`\n[ralph] ${remaining} story/stories still pending. Running ${TOOL}...\n`);

    let output;
    try {
      output = await runIteration();
    } catch (err) {
      log(`\n[ralph] Fatal error: ${err.message}`);
      process.exit(1);
    }

    if (output.includes(' COMPLETE ') || output.includes('✅ COMPLETE ✅')) {
      log('\n');
      log('╔══════════════════════════════════════════════════════════╗');
      log('║   ✅  Ralph completed all tasks!                         ║');
      log(`║   Finished at iteration ${String(i).padEnd(3)} of ${MAX_ITERATIONS}                     ║`);
      log('╚══════════════════════════════════════════════════════════╝');
      process.exit(0);
    }

    log(`\n[ralph] Iteration ${i} complete. Pausing 3s before next...\n`);
    await new Promise(r => setTimeout(r, 3000));
  }

  log('');
  log(`[ralph] Reached max iterations (${MAX_ITERATIONS}) without completing all tasks.`);
  log(`        Check scripts/ralph/progress.txt for status.`);
  log(`        Run again with --resume to continue:`);
  log(`        node scripts/ralph/ralph.mjs --tool ${TOOL} --resume`);
  process.exit(1);
}

main().catch(err => {
  console.error('[ralph] Unexpected error:', err);
  process.exit(1);
});
