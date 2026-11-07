import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * /tools/event-promotion-planner is a public lead-magnet page. It used to
 * import jsPDF (via pdf-generator) and Recharts (via ChartsView) statically,
 * which put about 145 KB gz in the page chunk plus a 96 KB gz Recharts chunk
 * on first paint, for a PDF nobody had asked for and a tab nobody had opened.
 *
 * SOURCE ASSERTIONS: what is pinned is the shape of the imports, which is what
 * decides the chunk graph. A rendered test would pass either way.
 */
const PAGE = "src/pages/EventPromotionPlanner.tsx";

function codeOnly(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const src = codeOnly(PAGE);
const staticImports = src.match(/^import[\s\S]*?from\s+['"][^'"]+['"];?/gm) ?? [];

describe("EventPromotionPlanner keeps jsPDF and Recharts off first paint", () => {
  it.each([
    ["pdf-generator", /@\/lib\/pdf-generator/],
    ["jspdf", /['"]jspdf['"]/],
    ["recharts", /['"]recharts['"]/],
    ["ChartsView", /event-promotion-planner\/ChartsView/],
  ])("has no static import of %s", (_name, pattern) => {
    expect(staticImports.filter((line) => pattern.test(line))).toEqual([]);
  });

  it("loads the pdf generator on demand", () => {
    expect(src).toMatch(/await import\(\s*['"]@\/lib\/pdf-generator['"]\s*\)/);
  });

  it("lazy-loads ChartsView behind Suspense", () => {
    expect(src).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(\s*['"]@\/components\/event-promotion-planner\/ChartsView['"]/);
    expect(src).toMatch(/<Suspense fallback=\{<ChartsFallback \/>\}>\s*<ChartsView/);
  });

  it("downloads the full playbook after email capture, not the stale-closure preview", () => {
    const capture = src.slice(
      src.indexOf("const handleEmailCapture"),
      src.indexOf("const downloadPDF"),
    );
    expect(capture).not.toMatch(/handleDownloadPDF\(/);
    expect(capture).toMatch(/downloadPDF\(unlockedTimeline, true\)/);
  });
});
