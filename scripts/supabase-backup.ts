/**
 * Full PostgreSQL backup (schema + data) for a Supabase project.
 *
 * Required env (pick one; project URL is not enough — you need the DB connection URI):
 *   - SUPABASE_DB_URL  (preferred) or DATABASE_URL
 *
 * The URI is in Supabase: Project Settings → Database → Connection string → URI.
 * If direct host `db.*.supabase.co:5432` times out or is refused (corporate firewall, IPv6, etc.),
 * use the **Session pooler** URI from the same page (port 6543, user often `postgres.PROJECT_REF`).
 * Free-tier projects also **pause** when idle — restore the project in the dashboard first.
 *
 * If the password has characters like @ # % & (common), either percent-encode it in the URI
 * or set optional SUPABASE_DB_PASSWORD to the raw password and keep the user/host in the URI
 * (the script applies the password for you, avoiding encoding mistakes).
 *
 * Optional:
 *   - SUPABASE_DB_PASSWORD  raw DB password (overrides password embedded in the URI if set)
 *   - BACKUP_DIR  (default: ./backups)
 *   - USE_PG_DUMP=1  force pg_dump instead of the Supabase CLI
 *
 * Loads variables from a root `.env` file when present (does not override existing env).
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

function loadLocalEnv() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

function findCommand(name: string): string | null {
  const ext = process.platform === "win32" ? ".exe" : "";
  const paths = (process.env.PATH || "").split(process.platform === "win32" ? ";" : ":");
  for (const p of paths) {
    const candidate = join(p, name + ext);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveDbUrl(): string | null {
  const raw = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!raw) return null;
  const override = process.env.SUPABASE_DB_PASSWORD;
  if (!override) return raw;
  try {
    const u = new URL(raw);
    u.password = override;
    return u.toString();
  } catch {
    return raw;
  }
}

function printNetworkTroubleshooting() {
  console.error(`
Connection refused / timed out to the database host means the TCP connection never reached Postgres
(or the project is not accepting connections). This is not fixed by changing the anon key.
• Supabase Dashboard: ensure the project is not **paused** (free tier); open the project to resume.
• If you use direct connection (port 5432), try the **Session mode pooler** URI instead (port 6543),
  from Project Settings → Database → Connection string → Pooler / Session — same password, different host.
• Corporate or school networks often block outbound 5432; try another network or VPN.
• If issues persist only on direct host, see Supabase docs on IPv4 / connection issues for your region.
`);
}

function printAuthTroubleshooting() {
  console.error(`
"password authentication failed" means Postgres rejected the database password, not the anon key.
• Dashboard → Project Settings → Database: confirm or reset the database password, then update .env.
• If you paste the full URI, special characters in the password must be percent-encoded in the URI,
  or set SUPABASE_DB_PASSWORD to the raw password and use a URI without a password part.
• Copy the URI from the dashboard again (URI tab) so host/port/user match your plan.
`);
}

function failureKind(log: string): "network" | "auth" | "unknown" {
  const s = log.toLowerCase();
  if (
    s.includes("password authentication failed") ||
    s.includes("authentication failed for user")
  ) {
    return "auth";
  }
  if (
    s.includes("connection refused") ||
    s.includes("connection timed out") ||
    s.includes("could not connect") ||
    s.includes("econnrefused") ||
    s.includes("etimedout") ||
    s.includes("accepting tcp/ip") ||
    s.includes("10060")
  ) {
    return "network";
  }
  return "unknown";
}

function printFailureHelp(log: string) {
  const k = failureKind(log);
  if (k === "network") printNetworkTroubleshooting();
  else if (k === "auth") printAuthTroubleshooting();
  else {
    printNetworkTroubleshooting();
    printAuthTroubleshooting();
  }
}

loadLocalEnv();

const dbUrl = resolveDbUrl();
if (!dbUrl) {
  console.error(
    "Set SUPABASE_DB_URL or DATABASE_URL to your Postgres connection URI (from Supabase Dashboard → Database).",
  );
  process.exit(1);
}
if (!dbUrl.startsWith("postgres")) {
  console.error("SUPABASE_DB_URL / DATABASE_URL must be a postgresql:// or postgres:// URI.");
  process.exit(1);
}

const backupDir = resolve(process.env.BACKUP_DIR || join(process.cwd(), "backups"));
mkdirSync(backupDir, { recursive: true });

const ts = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
const outFile = join(backupDir, `supabase-backup-${ts}.sql`);
const usePgDump = process.env.USE_PG_DUMP === "1";
const pgDump = findCommand("pg_dump");

function runSupabaseDump(): { ok: boolean; log: string } {
  const args = [
    "--yes",
    "supabase@latest",
    "db",
    "dump",
    "--db-url",
    dbUrl,
    "-f",
    outFile,
  ];
  const r = spawnSync("npx", args, {
    encoding: "utf-8",
    maxBuffer: 20 * 1024 * 1024,
    stdio: ["inherit", "pipe", "pipe"],
    shell: process.platform === "win32",
    env: { ...process.env, npm_config_yes: "true" },
  });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  if (out) {
    process.stderr.write(r.stderr ?? "");
    process.stdout.write(r.stdout ?? "");
  }
  if (r.error) {
    console.error("npx supabase failed:", r.error.message);
  }
  if (r.status === 0) {
    return { ok: true, log: out };
  }
  return { ok: false, log: out + (r.error?.message ?? "") };
}

function runPgDump(): { ok: boolean; log: string } {
  if (!pgDump) {
    return { ok: false, log: "pg_dump not found in PATH." };
  }
  const r = spawnSync(
    pgDump,
    [
      "--dbname",
      dbUrl,
      "--no-owner",
      "--no-acl",
      "-F",
      "p",
      "-f",
      outFile,
    ],
    {
      encoding: "utf-8",
      maxBuffer: 20 * 1024 * 1024,
      stdio: ["inherit", "pipe", "pipe"],
    },
  );
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  if (out) {
    process.stderr.write(r.stderr ?? "");
    process.stdout.write(r.stdout ?? "");
  }
  return { ok: r.status === 0, log: out };
}

console.log("Writing backup to:", outFile);
let ok = false;
let combinedLog = "";
if (usePgDump) {
  const r = runPgDump();
  ok = r.ok;
  combinedLog = r.log;
  if (!ok && !pgDump) {
    console.error("pg_dump not found in PATH. Install PostgreSQL client tools, or run without USE_PG_DUMP=1.");
  }
} else {
  const a = runSupabaseDump();
  ok = a.ok;
  combinedLog = a.log;
  if (!ok) {
    console.log("Falling back to pg_dump…");
    const b = runPgDump();
    ok = b.ok;
    combinedLog += "\n" + b.log;
  }
}

if (!ok) {
  printFailureHelp(combinedLog);
  console.error("Backup failed. Tools: https://github.com/supabase/cli (npx) and/or PostgreSQL client (pg_dump).");
  process.exit(1);
}

try {
  const { size } = statSync(outFile);
  console.log(`Done. Size: ${(size / 1024 / 1024).toFixed(2)} MB`);
} catch {
  console.log("Done.");
}
