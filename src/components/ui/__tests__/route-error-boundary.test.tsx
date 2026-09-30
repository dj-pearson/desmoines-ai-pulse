import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, Link } from "react-router-dom";

/**
 * The route boundary catches every page render error before the global one.
 * It used to report nothing outside DEV, and its error card stayed up after
 * navigating away, so one crash broke every link in the header and bottom nav.
 */

const captured: unknown[] = [];
vi.mock("@/lib/errorHandler", () => ({
  captureHandledError: (error: unknown) => captured.push(error),
}));

import { RouteErrorBoundary } from "@/components/ui/route-error-boundary";
import { isChunkLoadError } from "@/lib/chunkLoadError";

function Boom(): JSX.Element {
  throw new Error("page exploded");
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Link to="/fine">go to fine</Link>
      <RouteErrorBoundary>
        <Routes>
          <Route path="/broken" element={<Boom />} />
          <Route path="/fine" element={<p>fine page</p>} />
        </Routes>
      </RouteErrorBoundary>
    </MemoryRouter>,
  );
}

describe("RouteErrorBoundary", () => {
  beforeEach(() => {
    captured.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("reports the error so it reaches Sentry in production", () => {
    renderAt("/broken");
    expect(screen.getByText("This page encountered an error")).toBeTruthy();
    expect(captured).toHaveLength(1);
    expect((captured[0] as Error).message).toBe("page exploded");
  });

  it("clears the error when the route changes", () => {
    renderAt("/broken");
    fireEvent.click(screen.getByText("go to fine"));
    expect(screen.queryByText("This page encountered an error")).toBeNull();
    expect(screen.getByText("fine page")).toBeTruthy();
  });
});

describe("isChunkLoadError", () => {
  it("recognises the browsers' stale-chunk messages", () => {
    expect(isChunkLoadError(new Error("Failed to fetch dynamically imported module: https://x/a.js"))).toBe(true);
    expect(isChunkLoadError(new Error("error loading dynamically imported module"))).toBe(true);
    expect(isChunkLoadError(new Error("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new Error("Loading chunk 42 failed."))).toBe(true);
  });

  it("does not treat an ordinary render error as one", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});
