import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Link, Route, Routes } from "react-router-dom";

import { ROUTER_FUTURE } from "@/lib/routerFuture";

// WEB-QUAL-017 slice 1: the app runs Router 6.30 with the v7 behaviours on, so
// the bump to 7 is a version change and not also a behaviour change.

function SplatPage() {
  return <Link to="next">Next</Link>;
}

function renderSplat(future?: typeof ROUTER_FUTURE) {
  return render(
    <MemoryRouter initialEntries={["/guide/a"]} future={future}>
      <Routes>
        <Route path="guide/*" element={<SplatPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const futureFlagWarnings = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("React Router Future Flag Warning"));

describe("router v7 future flags (WEB-QUAL-017)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // Order matters: react-router warns once per message per module load, so the
  // flagged render must come before the unflagged one below.
  it("prints no future-flag warning when the app's flags are passed", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderSplat(ROUTER_FUTURE);
    expect(futureFlagWarnings(warn)).toEqual([]);
  });

  it("would print both warnings without them, so the test above can fail", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderSplat();
    const messages = futureFlagWarnings(warn).join("\n");
    expect(messages).toContain("v7_startTransition");
    expect(messages).toContain("v7_relativeSplatPath");
  });

  it("resolves a relative link inside a splat route against the full URL, as Router 7 does", () => {
    renderSplat(ROUTER_FUTURE);
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute("href", "/guide/a/next");
    cleanup();
    renderSplat();
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute("href", "/guide/next");
  });

  it("is what App.tsx hands its BrowserRouter", () => {
    const app = readFileSync(resolve(__dirname, "../../App.tsx"), "utf8");
    const routers = app.match(/<BrowserRouter\b[^>]*>/g) ?? [];
    expect(routers).toEqual(["<BrowserRouter future={ROUTER_FUTURE}>"]);
    expect(app).toMatch(/import \{ ROUTER_FUTURE \} from "@\/lib\/routerFuture";/);
  });
});
