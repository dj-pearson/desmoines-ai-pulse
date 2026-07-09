#!/usr/bin/env node
/**
 * AOS-DEV-006 — automated PR code-review (deterministic CLAUDE.md compliance).
 *
 * Reads the PR diff on stdin (git diff), applies high-confidence backward-compat
 * / convention rules, emits GitHub inline annotations, and exits 1 only on a
 * HIGH-confidence violation (blocks / requests changes). Style nits are advisory
 * (warnings, never block). Fails OPEN: any internal error prints a note and
 * exits 0 so the agent's own bug never hard-fails a PR.
 *
 * Usage: git diff origin/<base>...HEAD | node scripts/pr-review.mjs
 */

function readStdin() {
  return new Promise((resolve) => {
    let s = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => (s += d));
    process.stdin.on('end', () => resolve(s));
    if (process.stdin.isTTY) resolve('');
  });
}

// Each rule: id, severity ('high'|'advisory'), test(file, line) => message|null.
const RULES = [
  {
    id: 'destructive-migration',
    severity: 'high',
    appliesTo: (f) => /^supabase\/migrations\/.*\.sql$/.test(f),
    test: (line) => {
      const re = /\b(DROP\s+COLUMN|DROP\s+TABLE|DROP\s+TYPE|RENAME\s+COLUMN|RENAME\s+TABLE)\b/i;
      return re.test(line)
        ? 'Destructive migration in a single release (CLAUDE.md Backward Compatibility). Split across releases via the deprecation flow.'
        : null;
    },
  },
  {
    id: 'direct-localstorage',
    severity: 'high',
    appliesTo: (f) => /^src\/.*\.(ts|tsx)$/.test(f) && !/safeStorage/.test(f),
    test: (line) =>
      /\blocalStorage\.(get|set|remove)Item\b|\blocalStorage\[/.test(line)
        ? 'Direct localStorage usage — use `@/lib/safeStorage` (crashes in private mode). CLAUDE.md.'
        : null,
  },
  {
    id: 'process-env',
    severity: 'high',
    appliesTo: (f) => /^src\/.*\.(ts|tsx)$/.test(f),
    test: (line) =>
      /\bprocess\.env\./.test(line)
        ? 'Use `import.meta.env.*` (Vite), not `process.env.*`, in web code. CLAUDE.md.'
        : null,
  },
  {
    id: 'unwrapped-console',
    severity: 'advisory',
    appliesTo: (f) => /^src\/.*\.(ts|tsx)$/.test(f),
    test: (line, ctx) =>
      /\bconsole\.(log|info|debug)\b/.test(line) && !ctx.devWrapped
        ? 'console.* in web code — wrap dev logs in `if (import.meta.env.DEV)`. CLAUDE.md.'
        : null,
  },
  {
    id: 'explicit-any',
    severity: 'advisory',
    appliesTo: (f) => /^src\/.*\.(ts|tsx)$/.test(f),
    test: (line) =>
      /:\s*any\b|<any>|\bas\s+any\b/.test(line) ? 'Avoid `any` — use generated Supabase types. CLAUDE.md.' : null,
  },
];

async function main() {
  const diff = await readStdin();
  if (!diff.trim()) {
    console.log('No diff on stdin — nothing to review.');
    return 0;
  }

  let file = null;
  let newLine = 0;
  let high = 0;
  let advisory = 0;
  const findings = [];

  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ b/')) { file = raw.slice(6).trim(); continue; }
    if (raw.startsWith('diff --git')) { file = null; continue; }
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) { newLine = parseInt(hunk[1], 10); continue; }
    if (!file) continue;

    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      const content = raw.slice(1);
      const devWrapped = /import\.meta\.env\.DEV/.test(content);
      for (const rule of RULES) {
        if (!rule.appliesTo(file)) continue;
        const msg = rule.test(content, { devWrapped });
        if (msg) {
          findings.push({ file, line: newLine, severity: rule.severity, id: rule.id, msg });
          if (rule.severity === 'high') high++; else advisory++;
        }
      }
      newLine++;
    } else if (!raw.startsWith('-')) {
      // context line advances the new-file counter
      newLine++;
    }
    // removed lines ('-') don't advance the new-file counter
  }

  for (const f of findings) {
    const level = f.severity === 'high' ? 'error' : 'warning';
    console.log(`::${level} file=${f.file},line=${f.line}::[${f.id}] ${f.msg}`);
  }

  console.log(`\nPR review: ${high} blocking violation(s), ${advisory} advisory nit(s).`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const fs = await import('node:fs');
    const md = [`## AOS PR review`, ``, `- Blocking: **${high}**`, `- Advisory: ${advisory}`, ``, ...findings.map((f) => `- ${f.severity === 'high' ? '⛔' : '💡'} \`${f.file}:${f.line}\` [${f.id}] ${f.msg}`)].join('\n');
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  }
  return high > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    // Fail open — never hard-fail a PR on the reviewer's own error.
    console.log(`::notice::PR review agent errored (failing open): ${err?.message ?? err}`);
    process.exit(0);
  });
