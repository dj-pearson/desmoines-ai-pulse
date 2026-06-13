#!/usr/bin/env node
/**
 * Ralph - Autonomous AI Agent Loop (Node.js / cross-platform)
 *
 * Pure Node.js rewrite of ralph.sh so it runs on Windows without WSL
 * or opening an interactive terminal window.
 *
 * Usage:
 *   node scripts/ralph/ralph.mjs [--tool claude|amp] [--max <n>] [--resume] [--prd <file>] [--instructions <file>]
 *
 * Examples:
 *   node scripts/ralph/ralph.mjs --tool claude
 *   node scripts/ralph/ralph.mjs --tool claude --max 20
 *   node scripts/ralph/ralph.mjs --tool claude --resume
 *   node scripts/ralph/ralph.mjs --tool claude --prd prd-android.json --instructions scripts/ralph/CLAUDE-android.md
 *
 * Prerequisites:
 *   - Claude Code installed:  npm install -g @anthropic-ai/claude-code
 *   - OR Amp CLI installed:   (see ampcode.com)
 *   - prd.json created in scripts/ralph/
 */

import { execSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Config ────────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
let TOOL = 'claude';
let MAX_ITERATIONS = 10;
let RESUME = false;
let PRD_OVERRIDE = null;
let INSTRUCTIONS_OVERRIDE = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--tool' && args[i + 1]) { TOOL = args[++i]; }
  else if (args[i].startsWith('--tool=')) { TOOL = args[i].split('=')[1]; }
  else if (args[i] === '--max' && args[i + 1]) { MAX_ITERATIONS = parseInt(args[++i], 10); }
  else if (args[i].startsWith('--max=')) { MAX_ITERATIONS = parseInt(args[i].split('=')[1], 10); }
  else if (args[i] === '--resume') { RESUME = true; }
  else if (args[i] === '--prd' && args[i + 1]) { PRD_OVERRIDE = args[++i]; }
  else if (args[i].startsWith('--prd=')) { PRD_OVERRIDE = args[i].split('=')[1]; }
  else if (args[i] === '--instructions' && args[i + 1]) { INSTRUCTIONS_OVERRIDE = args[++i]; }
  else if (args[i].startsWith('--instructions=')) { INSTRUCTIONS_OVERRIDE = args[i].split('=')[1]; }
  else if (/^\d+$/.test(args[i])) { MAX_ITERATIONS = parseInt(args[i], 10); }
}

if (TOOL !== 'claude' && TOOL !== 'amp') {
  console.error(`Error: Invalid tool "${TOOL}". Must be "claude" or "amp".`);
  process.exit(1);
}

// ── Paths ─────────────────────────────────────────────────────────────────────
// Project root = two levels up from scripts/ralph/
const PROJECT_ROOT = join(__dirname, '..', '..');

// prd.json: --prd flag > project root > scripts/ralph/prd.json
const PRD_FILE = PRD_OVERRIDE
  ? (existsSync(join(PROJECT_ROOT, PRD_OVERRIDE)) ? join(PROJECT_ROOT, PRD_OVERRIDE) : PRD_OVERRIDE)
  : (existsSync(join(PROJECT_ROOT, 'prd.json'))
      ? join(PROJECT_ROOT, 'prd.json')
      : join(__dirname, 'prd.json'));

const PROGRESS_FILE = join(__dirname, 'progress.txt');
const ARCHIVE_DIR   = join(__dirname, 'archive');
const LAST_BRANCH   = join(__dirname, '.last-branch');
// --instructions flag > scripts/ralph/CLAUDE.md
const CLAUDE_MD     = INSTRUCTIONS_OVERRIDE
  ? (existsSync(join(PROJECT_ROOT, INSTRUCTIONS_OVERRIDE)) ? join(PROJECT_ROOT, INSTRUCTIONS_OVERRIDE) : INSTRUCTIONS_OVERRIDE)
  : join(__dirname, 'CLAUDE.md');
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
      '---',
      '',
    ].join('\n'));
  }
}

function archivePreviousRun(prd) {
  if (!existsSync(LAST_BRANCH)) return;
  const lastBranch = readFileSync(LAST_BRANCH, 'utf8').trim();
  const currentBranch = prd?.branchName ?? '';
  if (!currentBranch || !lastBranch || currentBranch === lastBranch) return;

  const date = new Date().toISOString().slice(0, 10);
  const folderName = lastBranch.replace(/^ralph\//, '');
  const archiveFolder = join(ARCHIVE_DIR, `${date}-${folderName}`);

  log(`Archiving previous run: ${lastBranch} → ${archiveFolder}`);
  mkdirSync(archiveFolder, { recursive: true });
  if (existsSync(PRD_FILE))      copyFileSync(PRD_FILE,      join(archiveFolder, 'prd.json'));
  if (existsSync(PROGRESS_FILE)) copyFileSync(PROGRESS_FILE, join(archiveFolder, 'progress.txt'));

  // Reset progress for new run
  writeFileSync(PROGRESS_FILE, [
    '# Ralph Progress Log',
    `Started: ${new Date().toISOString()}`,
    '---',
    '',
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

/**
 * Run a single Claude Code (or Amp) iteration.
 * Returns the full stdout string.
 */
async function runIteration() {
  return new Promise((resolve, reject) => {
    let cmdBin, cmdArgs, input;

    if (TOOL === 'claude') {
      // claude --dangerously-skip-permissions --print < CLAUDE.md
      cmdBin = 'claude';
      cmdArgs = ['--dangerously-skip-permissions', '--print'];
      const instructions = existsSync(CLAUDE_MD) ? readFileSync(CLAUDE_MD, 'utf8') : '';
      // Tell the agent which PRD the runner actually resolved, so its
      // instructions don't hardcode a stale path (root vs scripts/ralph
      // vs --prd override).  Paths are relative to the agent's cwd.
      const prdRel      = relative(process.cwd(), PRD_FILE).replace(/\\/g, '/');
      const progressRel = relative(process.cwd(), PROGRESS_FILE).replace(/\\/g, '/');
      const runtimeHeader = [
        '# Ralph Runtime Paths (resolved by the runner — use THESE, ignore any hardcoded path below)',
        `- PRD file (read stories from here AND write \`passes: true\` here): \`${prdRel}\``,
        `- Progress log (append here): \`${progressRel}\``,
        '',
        '---',
        '',
      ].join('\n');
      input = runtimeHeader + instructions;
    } else {
      // amp --dangerously-allow-all < prompt.md
      cmdBin = 'amp';
      cmdArgs = ['--dangerously-allow-all'];
      input   = existsSync(PROMPT_MD) ? readFileSync(PROMPT_MD, 'utf8') : '';
    }

    // On Windows, npm global CLIs (claude, amp) are .cmd wrappers that
    // require the shell to resolve.  shell:true uses cmd.exe just for
    // PATH lookup — it does NOT open a new terminal window because we
    // keep all stdio as 'pipe'.
    const isWindows = process.platform === 'win32';
    const child = spawn(cmdBin, cmdArgs, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: isWindows,
    });

    // Stream stdout live so you can watch progress
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

    // Write the prompt on stdin and close it
    if (input) {
      child.stdin.write(input, 'utf8');
    }
    child.stdin.end();

    child.on('close', code => {
      if (code !== 0 && code !== null) {
        log(`\n[ralph] ${TOOL} exited with code ${code} — continuing anyway.`);
      }
      resolve(output);
    });
  });
}

// ── Main Loop ─────────────────────────────────────────────────────────────────
async function main() {
  // Validate required files
  if (!existsSync(PRD_FILE)) {
    log('Error: scripts/ralph/prd.json not found.');
    log('Create a prd.json based on scripts/ralph/prd.json.example first.');
    process.exit(1);
  }
  if (TOOL === 'claude' && !existsSync(CLAUDE_MD)) {
    log('Error: scripts/ralph/CLAUDE.md not found.');
    log('Copy it from: https://github.com/snarktank/ralph/blob/main/CLAUDE.md');
    process.exit(1);
  }
  if (TOOL === 'amp' && !existsSync(PROMPT_MD)) {
    log('Error: scripts/ralph/prompt.md not found.');
    log('Copy it from: https://github.com/snarktank/ralph/blob/main/prompt.md');
    process.exit(1);
  }

  const prd = readJSON(PRD_FILE);

  if (!RESUME) {
    archivePreviousRun(prd);
  }
  trackBranch(prd);
  initProgress();

  log(`\nStarting Ralph`);
  log(`  Tool:           ${TOOL}`);
  log(`  Max iterations: ${MAX_ITERATIONS}`);
  log(`  Project:        ${prd?.project ?? '(unknown)'}`);
  log(`  Branch:         ${prd?.branchName ?? '(none)'}`);
  log(`  Stories left:   ${countRemaining(prd)}`);

  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    separator(`Ralph Iteration ${i} of ${MAX_ITERATIONS} (${TOOL})`);

    // Re-read PRD each iteration (it gets updated by Claude)
    const currentPrd = readJSON(PRD_FILE);
    const remaining = countRemaining(currentPrd);

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

    // Check for completion signal from the AI
    if (output.includes(' COMPLETE ') || output.includes('🎉 COMPLETE 🎉')) {
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
  log(`        Run again with --resume to continue: node scripts/ralph/ralph.mjs --tool ${TOOL} --resume`);
  process.exit(1);
}

main().catch(err => {
  console.error('[ralph] Unexpected error:', err);
  process.exit(1);
});
