import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

/**
 * Non-core review WP5. /admin/system showed Math.random() as CPU, memory, disk
 * and connection counts, offered to restart a web server and refresh a CDN
 * through functions that do not exist, and had two settings screens that saved
 * to the admin's own localStorage and were read by nothing. They were removed
 * rather than implemented; this keeps them removed.
 */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(?<!:)\/\/.*$/, ""))
    .join("\n");
}

const HOOK = code("src/hooks/useSystemMonitoring.ts");
const CONTROLS = code("src/components/AdminSystemControls.tsx");
const PAGE = code("src/pages/AdminSystem.tsx");

describe("System Controls claims only what it measures", () => {
  it("shows no random metrics", () => {
    expect(HOOK).not.toContain("Math.random");
    expect(CONTROLS).not.toMatch(/memoryUsage|diskUsage|systemLoad|activeConnections/);
  });

  it("offers no action that cannot succeed", () => {
    for (const src of [HOOK, CONTROLS]) {
      expect(src).not.toMatch(/restart-web-server|refresh-cdn-cache/);
      expect(src).not.toContain("system-backup");
      expect(src).not.toContain("optimize_database_performance");
    }
  });

  it("saves no settings to the browser", () => {
    expect(HOOK).not.toMatch(/storage\.set|localStorage/);
    expect(CONTROLS).not.toMatch(/storage\.set|localStorage|Save Settings/);
  });

  it("the local-only Application Settings screen is gone", () => {
    expect(existsSync("src/components/AdminApplicationSettings.tsx")).toBe(false);
    expect(PAGE).not.toContain("AdminApplicationSettings");
  });
});
