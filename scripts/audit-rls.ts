/**
 * WEB-SEC-005 — RLS / policy audit.
 *
 * Statically extracts, from supabase/migrations/*.sql (chronological, last-wins):
 *   - CREATE POLICY definitions (table, command, roles, USING / WITH CHECK)
 *   - ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY
 *   - SECURITY DEFINER functions and whether they pin SET search_path
 *
 * Then flags risky patterns and writes docs/RLS_AUDIT.md. This is a static
 * analysis of the migration history, not live introspection — good enough to
 * diff future audits against and to catch USING(true) writes / anon writes /
 * unpinned definers. Run: `tsx scripts/audit-rls.ts`.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const OUT = join(process.cwd(), 'docs', 'RLS_AUDIT.md');

type Command = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';

interface Policy {
  name: string;
  table: string;
  command: Command;
  roles: string;
  using: string | null;
  withCheck: string | null;
  sourceFile: string;
}

interface FnDef {
  name: string;
  securityDefiner: boolean;
  pinsSearchPath: boolean;
  sourceFile: string;
}

function listMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/** Read a balanced (...) group starting at `open` (index of '('). Returns inner text + index after ')'. */
function readBalanced(src: string, open: number): { inner: string; end: number } {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return { inner: src.slice(open + 1, i), end: i + 1 };
    }
  }
  return { inner: src.slice(open + 1), end: src.length };
}

function parsePolicies(sql: string, file: string): Policy[] {
  const out: Policy[] = [];
  const re = /CREATE\s+POLICY\s+(?:IF\s+NOT\s+EXISTS\s+)?("(?:[^"]+)"|[A-Za-z0-9_]+)\s+ON\s+([A-Za-z0-9_."]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const name = m[1].replace(/"/g, '');
    const table = m[2].replace(/"/g, '').replace(/^public\./, '');
    // Scan from end of match to the terminating ';' at paren depth 0.
    let i = re.lastIndex;
    let depth = 0;
    let stmtEnd = sql.length;
    for (; i < sql.length; i++) {
      const c = sql[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ';' && depth === 0) { stmtEnd = i; break; }
    }
    const body = sql.slice(re.lastIndex, stmtEnd);

    const cmd = (body.match(/\bFOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\b/i)?.[1].toUpperCase() ?? 'ALL') as Command;
    const roles = body.match(/\bTO\s+([A-Za-z0-9_,\s]+?)(?:\bUSING\b|\bWITH\b|$)/i)?.[1].trim().replace(/\s+/g, ' ') ?? 'public';

    let using: string | null = null;
    let withCheck: string | null = null;
    const usingIdx = body.search(/\bUSING\s*\(/i);
    if (usingIdx >= 0) {
      const open = body.indexOf('(', usingIdx);
      using = readBalanced(body, open).inner.trim().replace(/\s+/g, ' ');
    }
    const wcIdx = body.search(/\bWITH\s+CHECK\s*\(/i);
    if (wcIdx >= 0) {
      const open = body.indexOf('(', wcIdx);
      withCheck = readBalanced(body, open).inner.trim().replace(/\s+/g, ' ');
    }

    out.push({ name, table, command: cmd, roles, using, withCheck, sourceFile: file });
  }
  return out;
}

function parseRlsEnabled(sql: string): { enabled: Set<string>; forced: Set<string> } {
  const enabled = new Set<string>();
  const forced = new Set<string>();
  const re = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([A-Za-z0-9_."]+)\s+(ENABLE|FORCE)\s+ROW\s+LEVEL\s+SECURITY/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const table = m[1].replace(/"/g, '').replace(/^public\./, '');
    if (m[2].toUpperCase() === 'FORCE') forced.add(table);
    else enabled.add(table);
  }
  return { enabled, forced };
}

function parseFunctions(sql: string, file: string): FnDef[] {
  const out: FnDef[] = [];
  const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([A-Za-z0-9_."]+)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const name = m[1].replace(/"/g, '').replace(/^public\./, '');
    // Take a window up to the next CREATE FUNCTION or 4kb, whichever first.
    const rest = sql.slice(m.index, m.index + 4000);
    const headerEnd = rest.search(/\bAS\s*(\$|')/i);
    const header = headerEnd >= 0 ? rest.slice(0, headerEnd) : rest;
    const securityDefiner = /\bSECURITY\s+DEFINER\b/i.test(header);
    const pinsSearchPath = /\bSET\s+search_path\b/i.test(header);
    out.push({ name, securityDefiner, pinsSearchPath, sourceFile: file });
  }
  return out;
}

// ---------------------------------------------------------------------------

const files = listMigrations();
const policyMap = new Map<string, Policy>(); // key: table|name|command
const rlsEnabled = new Set<string>();
const rlsForced = new Set<string>();
const tablesWithPolicies = new Set<string>();
const fnMap = new Map<string, FnDef>();

for (const file of files) {
  const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
  for (const p of parsePolicies(sql, file)) {
    policyMap.set(`${p.table}|${p.name}|${p.command}`, p);
    tablesWithPolicies.add(p.table);
  }
  const { enabled, forced } = parseRlsEnabled(sql);
  enabled.forEach((t) => rlsEnabled.add(t));
  forced.forEach((t) => rlsForced.add(t));
  for (const f of parseFunctions(sql, file)) fnMap.set(f.name, f);
}

const policies = [...policyMap.values()];

// --- Flags ----------------------------------------------------------------
const isWrite = (c: Command) => c !== 'SELECT';
const isTrue = (cond: string | null) => cond !== null && /^true$/i.test(cond.trim());

const permissiveWrites = policies.filter(
  (p) => isWrite(p.command) && (isTrue(p.using) || isTrue(p.withCheck)),
);
const anonWrites = policies.filter(
  (p) => isWrite(p.command) && /\banon\b/i.test(p.roles),
);
const missingRls = [...tablesWithPolicies].filter((t) => !rlsEnabled.has(t) && !rlsForced.has(t)).sort();
const unpinnedDefiners = [...fnMap.values()]
  .filter((f) => f.securityDefiner && !f.pinsSearchPath)
  .sort((a, b) => a.name.localeCompare(b.name));

// --- Report ----------------------------------------------------------------
const esc = (s: string | null) => (s ? s.replace(/\|/g, '\\|') : '—');
const now = new Date().toISOString().slice(0, 10);

let md = `# RLS Policy Audit\n\n`;
md += `**Generated**: ${now} by \`scripts/audit-rls.ts\` (static analysis of \`supabase/migrations/*.sql\`, last-wins).\n`;
md += `**Re-run**: \`tsx scripts/audit-rls.ts\`. Diff this file in future audits.\n\n`;
md += `## Summary\n\n`;
md += `| Metric | Count |\n|---|---|\n`;
md += `| Migrations scanned | ${files.length} |\n`;
md += `| Distinct policies (current) | ${policies.length} |\n`;
md += `| Tables with RLS enabled | ${rlsEnabled.size} |\n`;
md += `| Tables with policies but no ENABLE RLS seen | ${missingRls.length} |\n`;
md += `| Permissive write policies USING/CHECK(true) | ${permissiveWrites.length} |\n`;
md += `| Write policies granted to \`anon\` | ${anonWrites.length} |\n`;
md += `| SECURITY DEFINER functions | ${[...fnMap.values()].filter((f) => f.securityDefiner).length} |\n`;
md += `| …of those WITHOUT pinned search_path | ${unpinnedDefiners.length} |\n\n`;

md += `## ⚠️ Findings needing attention\n\n`;

md += `### 1. Permissive write policies — USING(true) / WITH CHECK(true) on INSERT/UPDATE/DELETE/ALL\n\n`;
if (permissiveWrites.length === 0) {
  md += `None found. ✅\n\n`;
} else {
  md += `| Table | Policy | Cmd | Roles | USING | WITH CHECK | Source |\n|---|---|---|---|---|---|---|\n`;
  for (const p of permissiveWrites) {
    md += `| ${p.table} | ${esc(p.name)} | ${p.command} | ${esc(p.roles)} | ${esc(p.using)} | ${esc(p.withCheck)} | ${p.sourceFile} |\n`;
  }
  md += `\n> **Verdict**: each must be either an insert-only analytics/telemetry table (acceptable — justify inline) or tightened by an ADDITIVE migration. Do NOT tighten a policy a shipped mobile binary relies on in one release (CLAUDE.md) — flag those in §"Needs human decision".\n\n`;
}

md += `### 2. Write access granted to the \`anon\` role\n\n`;
if (anonWrites.length === 0) {
  md += `None found. ✅\n\n`;
} else {
  md += `| Table | Policy | Cmd | Roles | USING | WITH CHECK | Source |\n|---|---|---|---|---|---|---|\n`;
  for (const p of anonWrites) {
    md += `| ${p.table} | ${esc(p.name)} | ${p.command} | ${esc(p.roles)} | ${esc(p.using)} | ${esc(p.withCheck)} | ${p.sourceFile} |\n`;
  }
  md += `\n> **Verdict**: confirm each is an intentional anonymous-write surface (e.g. anonymous analytics/feedback). Otherwise restrict to \`authenticated\`.\n\n`;
}

md += `### 3. Tables with policies but no \`ENABLE ROW LEVEL SECURITY\` seen in migrations\n\n`;
md += `> NOTE: RLS may have been enabled out-of-band (Supabase dashboard) and not captured in a migration. Treat as "verify", not "confirmed hole".\n\n`;
if (missingRls.length === 0) {
  md += `None. ✅\n\n`;
} else {
  md += missingRls.map((t) => `- \`${t}\``).join('\n') + '\n\n';
}

md += `### 4. SECURITY DEFINER functions without a pinned \`search_path\`\n\n`;
md += `> A SECURITY DEFINER function without \`SET search_path\` is a privilege-escalation risk (search_path hijacking). Fix is additive + safe: \`ALTER FUNCTION ... SET search_path = ...\`.\n\n`;
if (unpinnedDefiners.length === 0) {
  md += `None. ✅\n\n`;
} else {
  md += unpinnedDefiners.map((f) => `- \`${f.name}\` (${f.sourceFile})`).join('\n') + '\n\n';
}

md += `## Full policy inventory\n\n`;
md += `| Table | Policy | Cmd | Roles | USING | WITH CHECK |\n|---|---|---|---|---|---|\n`;
for (const p of policies.sort((a, b) => a.table.localeCompare(b.table) || a.name.localeCompare(b.name))) {
  md += `| ${p.table} | ${esc(p.name)} | ${p.command} | ${esc(p.roles)} | ${esc(p.using)} | ${esc(p.withCheck)} |\n`;
}
md += `\n`;

md += `## Needs human decision\n\n`;
md += `Anything in §1/§2 that a shipped iOS/Android binary might rely on must NOT be tightened in a single release — stage it via the CLAUDE.md deprecation flow. Items confirmed safe (web-only or additive) are fixed in the accompanying migration.\n`;

writeFileSync(OUT, md);
console.log(`Wrote ${OUT}`);
console.log(`policies=${policies.length} permissiveWrites=${permissiveWrites.length} anonWrites=${anonWrites.length} missingRls=${missingRls.length} unpinnedDefiners=${unpinnedDefiners.length}`);

// AOS-SEC-006: machine-readable finding keys for the scheduled drift audit.
// `tsx scripts/audit-rls.ts --json` writes docs/rls-audit-findings.json so the
// CI drift sweep can diff against the accepted baseline.
if (process.argv.includes('--json')) {
  const findingKeys = [
    ...permissiveWrites.map((p) => `permissive_write:${p.table}:${p.name}`),
    ...anonWrites.map((p) => `anon_write:${p.table}:${p.name}`),
    ...missingRls.map((t) => `missing_rls:${t}`),
    ...unpinnedDefiners.map((f) => `unpinned_definer:${f.name}`),
  ].sort();
  const jsonOut = join(process.cwd(), 'docs', 'rls-audit-findings.json');
  writeFileSync(
    jsonOut,
    JSON.stringify(
      {
        counts: {
          policies: policies.length,
          permissiveWrites: permissiveWrites.length,
          anonWrites: anonWrites.length,
          missingRls: missingRls.length,
          unpinnedDefiners: unpinnedDefiners.length,
        },
        findingKeys,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Wrote ${jsonOut} (${findingKeys.length} finding keys)`);
}
