import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

/**
 * SiteLayout renders Header before <main id="main-content"> and Footer after
 * it (WEB-UX-041), so the skip link targets <main> itself: it no longer
 * contains the header, so focusing it cannot land in front of the logo.
 *
 * Header is lazy in SiteLayout (kept off the critical path), so each test
 * waits for the skip link, which lives in the header, before asserting.
 *
 * NotFound had no header, no footer and no h1 (CardTitle is an h3). The
 * header and footer now come from the layout, so it is rendered inside one.
 */

vi.mock("@/contexts/AuthContext", () => ({
  useAuthFlags: () => ({ isAuthenticated: false, isAdmin: false }),
  useAuthActions: () => ({ logout: vi.fn() }),
}));
vi.mock("@/hooks/useProfile", () => ({ useProfile: () => ({ profile: null }) }));
vi.mock("@/hooks/useUserLevel", () => ({ useUserLevel: () => ({ level: 1, xp: 0 }) }));
vi.mock("@/hooks/useAccessibility", () => ({
  useAccessibility: () => ({
    announceToScreenReader: vi.fn(),
    useFocusRestore: () => ({ saveFocus: vi.fn(), restoreFocus: vi.fn() }),
  }),
}));
vi.mock("@/hooks/use-swipe", () => ({ useSwipe: () => ({ current: null }) }));
vi.mock("@/components/OptimizedLogo", () => ({ OptimizedLogo: () => <span>logo</span> }));
vi.mock("@/components/header/DesktopNav", () => ({
  DesktopNav: () => <nav aria-label="Main"><a href="/events">Events</a></nav>,
}));
vi.mock("@/components/header/MobileNav", () => ({ MobileNav: () => null }));
vi.mock("@/components/header/UserMenu", () => ({ UserMenu: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => <footer>footer</footer> }));

import { SiteLayout } from "@/components/layout/SiteLayout";
import NotFound from "@/pages/NotFound";

function renderAt(path: string, ui: React.ReactElement) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </HelmetProvider>,
  );
}

/** A route rendered inside SiteLayout, as App.tsx does. */
function inLayout(path: string, page: React.ReactElement) {
  return renderAt(
    path,
    <Routes>
      <Route element={<SiteLayout />}>
        <Route path="*" element={page} />
      </Route>
    </Routes>,
  );
}

describe("site layout landmarks", () => {
  it("puts the header before <main> and the footer after it, neither inside", async () => {
    const { container } = inLayout("/", <a href="/events">First content link</a>);
    await screen.findByText("footer");
    await screen.findByRole("link", { name: "Skip to main content" });

    const main = container.querySelector("main#main-content")!;
    const header = container.querySelector("header")!;
    const footer = container.querySelector("footer")!;
    expect(container.querySelectorAll("header")).toHaveLength(1);
    expect(container.querySelectorAll("footer")).toHaveLength(1);
    expect(main.querySelector("header, footer")).toBeNull();
    expect(header.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(main.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("skip link", () => {
  it("moves focus to <main>, past the header", async () => {
    const { container } = inLayout("/", <a href="/events">First content link</a>);

    const skip = await screen.findByRole("link", { name: "Skip to main content" });
    expect(skip.getAttribute("href")).toBe("#main-content");

    fireEvent.click(skip);

    const focused = document.activeElement as HTMLElement;
    expect(focused.id).toBe("main-content");
    expect(container.querySelector("header")?.contains(focused)).toBe(false);
    // The marker span it used to target is gone.
    expect(container.querySelector("#main-content-start")).toBeNull();
  });
});

describe("NotFound", () => {
  it("has exactly one h1, plus the site header, footer and a search link", async () => {
    const { container } = inLayout("/this-does-not-exist", <NotFound />);
    await screen.findByText("footer");
    await screen.findByRole("link", { name: "Skip to main content" });

    const h1s = container.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toContain("Page not found");

    expect(container.querySelector("header")).not.toBeNull();
    expect(container.querySelector("footer")).not.toBeNull();
    expect(screen.getByRole("link", { name: /search the site/i }).getAttribute("href")).toBe("/search");
  });

  it("names the event in its h1 on an event path", () => {
    const { container } = renderAt("/events/gone-event", <NotFound />);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector("h1")?.textContent).toContain("Event not found");
  });
});
