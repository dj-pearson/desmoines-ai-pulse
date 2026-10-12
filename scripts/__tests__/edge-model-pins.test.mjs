#!/usr/bin/env node
/**
 * Counter-test for scripts/check-edge-model-pins.mjs.
 *
 *   npx tsx scripts/__tests__/edge-model-pins.test.mjs
 *
 * A checker that passes is only evidence if it can fail. This plants a model
 * id literal in a throwaway tree and asserts the checker exits 1 and names
 * it, then asserts the allowed places (the resolver, the price table, tests,
 * comments) stay green, and finally that the real tree is clean.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CHECKER = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'check-edge-model-pins.mjs');
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

let bad = 0;
const ck = (name, ok, detail = '') => {
  if (ok) console.log(`  ok    ${name}`);
  else {
    bad++;
    console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`);
  }
};

function run(cwd) {
  const r = spawnSync(process.execPath, [CHECKER], { cwd, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

/** A tree with the given files under supabase/functions. */
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'edge-model-pins-'));
  for (const [rel, body] of Object.entries(files)) {
    const p = join(root, 'supabase', 'functions', rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, body);
  }
  return root;
}

function withTree(files, fn) {
  const root = tree(files);
  try {
    fn(run(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const clean = { 'ok/index.ts': 'import { defaultModel } from "../_shared/aiModel.ts";\nconst m = defaultModel();\n' };

console.log('a planted literal fails');
withTree({ ...clean, 'planted/index.ts': 'const body = { model: "claude-sonnet-5-5", max_tokens: 10 };\n' }, (r) => {
  ck('exit 1', r.code === 1, String(r.code));
  ck('names the file and the id', r.out.includes('planted/index.ts: claude-sonnet-5-5'), r.out);
});

console.log('\nnot only a `model:` key - a constant is the same defect');
withTree({ 'k/index.ts': "const PICK = 'claude-haiku-5-5';\nexport { PICK };\n" }, (r) => {
  ck('exit 1', r.code === 1, String(r.code));
});

console.log('\na retired id is labelled as one');
withTree({ 'r/index.ts': "const x = { model: 'claude-3-haiku-20240307' };\n" }, (r) => {
  ck('exit 1', r.code === 1, String(r.code));
  ck('says RETIRED', r.out.includes('RETIRED'), r.out);
});

console.log('\nthe allowed places stay green');
withTree(
  {
    ...clean,
    '_shared/aiModel.ts': 'export const FALLBACK_MODEL = "claude-sonnet-5-5";\n',
    '_shared/providerUsage.ts': 'const P = [["claude-haiku-5-5", 1]];\n',
    'x/handler.test.ts': 'const m = "claude-sonnet-5-5";\n',
    '_tests/y.test.ts': 'const m = "claude-opus-5-5";\n',
    'z/index.ts':
      "// was 'claude-3-haiku-20240307', which is retired\n" +
      "/* model: 'claude-sonnet-4-20250514' */\n" +
      "const h = { 'anthropic-beta': 'x' }; // replaced 'claude-3-5-sonnet-20241022'\n" +
      "const url = 'https://api.anthropic.com/v1/messages';\n",
  },
  (r) => {
    ck('exit 0', r.code === 0, r.out);
  },
);

console.log('\nthe resolver is allowed by path, not by name');
withTree({ 'other/aiModel.ts': 'const m = "claude-sonnet-5-5";\n' }, (r) => {
  ck('an aiModel.ts outside _shared still fails', r.code === 1, String(r.code));
});

console.log('\nthe real tree is clean');
{
  const r = run(REPO);
  ck('exit 0', r.code === 0, r.out);
}

console.log(`\n${bad} failure(s)`);
process.exit(bad ? 1 : 0);
