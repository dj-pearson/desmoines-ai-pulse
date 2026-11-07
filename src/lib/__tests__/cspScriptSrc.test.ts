import { describe, it, expect, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * script-src in public/_headers listed https://unpkg.com and
 * https://cdn.jsdelivr.net with nothing loading script from either. Both serve
 * any npm package at any version, so one HTML injection could load arbitrary
 * code past the hash pins. scripts/check-csp-hashes.mjs now refuses a public
 * package CDN or a scheme-only/bare-* source in script-src; these cases run it
 * against fixtures so the check itself cannot rot into a no-op.
 */
const REPO = resolve(__dirname, "../../..");
const CHECK = join(REPO, "scripts/check-csp-hashes.mjs");
const HTML = "<!doctype html><html><head></head><body></body></html>";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function runWith(scriptSrc: string) {
  const dir = mkdtempSync(join(tmpdir(), "csp-check-"));
  dirs.push(dir);
  mkdirSync(join(dir, "public"));
  writeFileSync(join(dir, "index.html"), HTML);
  writeFileSync(
    join(dir, "public/_headers"),
    `/*\n  Content-Security-Policy: default-src 'self'; script-src ${scriptSrc}; object-src 'none'\n`
  );
  return spawnSync(process.execPath, [CHECK], { cwd: dir, encoding: "utf8" });
}

function liveScriptSrc(): string {
  const line = readFileSync(join(REPO, "public/_headers"), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("Content-Security-Policy:"));
  return line?.match(/script-src ([^;]*)/)?.[1] ?? "";
}

describe("CSP script-src has no public package CDN", () => {
  it("the shipped policy passes the check", () => {
    const r = spawnSync(process.execPath, [CHECK], { cwd: REPO, encoding: "utf8" });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  });

  it("the shipped script-src names neither unpkg nor jsdelivr", () => {
    const src = liveScriptSrc();
    expect(src).not.toBe("");
    expect(src).not.toMatch(/unpkg\.com|jsdelivr\.net/);
  });

  it("the shipped connect-src does not allow the browser to call OpenAI", () => {
    const headers = readFileSync(join(REPO, "public/_headers"), "utf8");
    expect(headers).not.toMatch(/connect-src[^;]*api\.openai\.com/);
  });

  it("accepts first-party and named third-party script hosts", () => {
    const r = runWith("'self' https://js.stripe.com https://challenges.cloudflare.com");
    expect(r.status).toBe(0);
  });

  it.each([
    "https://unpkg.com",
    "https://cdn.jsdelivr.net",
    "https://cdnjs.cloudflare.com",
    "https://esm.sh",
    "*.jsdelivr.net",
    "https://unpkg.com/leaflet@1.9.4/",
  ])("rejects %s", (cdn) => {
    const r = runWith(`'self' https://js.stripe.com ${cdn}`);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(cdn);
  });

  it.each(["https:", "*", "data:"])("rejects the wildcard source %s", (wild) => {
    const r = runWith(`'self' ${wild}`);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(wild);
  });
});
