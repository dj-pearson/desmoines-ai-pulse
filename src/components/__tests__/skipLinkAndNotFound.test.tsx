import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

/**
 * App.tsx's <main id="main-content"> wraps every route, Header included, so a
 * skip link aimed at #main-content put focus back in front of the logo. The
 * link now targets a marker Header renders as its next sibling.
 *
 * NotFound had no header, no footer and no h1 (CardTitle is an h3).
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

import Header from "@/components/Header";
import NotFound from "@/pages/NotFound";

function renderAt(path: string, ui: React.ReactElement) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </HelmetProvider>,
  );
}

describe("skip link", () => {
  it("moves focus to the content start after the header, not into it", () => {
    const { container } = renderAt(
      "/",
      <main id="main-content" tabIndex={-1}>
        <Header />
        <a href="/first">First content link</a>
      </main>,
    );

    const skip = screen.getByRole("link", { name: "Skip to main content" });
    expect(skip.getAttribute("href")).toBe("#main-content-start");

    fireEvent.click(skip);

    const focused = document.activeElement as HTMLElement;
    expect(focused.id).toBe("main-content-start");
    expect(container.querySelector("header")?.contains(focused)).toBe(false);
    // The next tab stop in document order is page content, not the logo.
    expect(focused.nextElementSibling?.textContent).toBe("First content link");
  });
});

describe("NotFound", () => {
  it("has exactly one h1, plus the site header, footer and a search link", () => {
    const { container } = renderAt("/this-does-not-exist", <NotFound />);

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
