import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PlaceCrossLinks } from "@/components/PlaceCrossLinks";
import { NEIGHBORHOODS } from "@/lib/neighborhoods";
import { SUBURBS } from "@/lib/suburbs";

/**
 * WEB-SEO-036 AC5.
 *
 * The cross-family link is conditional because the two inventories do not
 * match, and getting that wrong points a prerendered, sitemapped page at a 404:
 * App.tsx mounts the seven /events/<suburb> paths one at a time with no
 * catch-all behind them.
 */
afterEach(cleanup);

const renderAt = (slug: string, from: "neighborhood" | "events") =>
  render(
    <MemoryRouter>
      <PlaceCrossLinks slug={slug} from={from} />
    </MemoryRouter>,
  );

const href = (name: RegExp) =>
  (screen.queryByRole("link", { name }) as HTMLAnchorElement | null)?.getAttribute("href") ?? null;

describe("PlaceCrossLinks", () => {
  it("links a guide to its events page when both exist", () => {
    renderAt("ankeny", "neighborhood");
    expect(href(/Upcoming events in Ankeny/i)).toBe("/events/ankeny");
  });

  it("links an events page back to its guide", () => {
    renderAt("ankeny", "events");
    expect(href(/Ankeny neighborhood guide/i)).toBe("/neighborhoods/ankeny");
  });

  it("offers no events link for a guide with no events page", () => {
    // east-village has a guide and no /events/<slug> route.
    renderAt("east-village", "neighborhood");
    expect(screen.queryByRole("link", { name: /Upcoming events in/i })).toBeNull();
  });

  it("links Waukee's guide to its events page", () => {
    // /events/waukee was added with the events plan (WP7).
    renderAt("waukee", "neighborhood");
    expect(href(/Upcoming events in Waukee/i)).toBe("/events/waukee");
  });

  it("offers no guide link for an events page with no guide", () => {
    renderAt("windsor-heights", "events");
    expect(screen.queryByRole("link", { name: /neighborhood guide/i })).toBeNull();
  });

  it("never points at a route App.tsx does not mount", () => {
    // The assertion that actually protects the reader: every events link this
    // component can emit has to be one of the mounted suburb paths.
    const mounted = new Set(Object.keys(SUBURBS).map((s) => `/events/${s}`));
    for (const n of NEIGHBORHOODS) {
      renderAt(n.slug, "neighborhood");
      const link = screen.queryByRole("link", { name: /Upcoming events in/i });
      if (link) expect(mounted.has(link.getAttribute("href") as string)).toBe(true);
      cleanup();
    }
  });

  it("lists every sibling guide and not itself", () => {
    renderAt("ankeny", "neighborhood");
    for (const n of NEIGHBORHOODS) {
      const found = href(new RegExp(`^${n.name}$`, "i"));
      if (n.slug === "ankeny") expect(found).toBeNull();
      else expect(found).toBe(`/neighborhoods/${n.slug}`);
    }
  });

  it("is a labelled nav so it is skippable", () => {
    renderAt("ankeny", "neighborhood");
    expect(screen.getByRole("navigation", { name: /related places/i })).toBeTruthy();
  });
});
