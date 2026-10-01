import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  isArchivedMonth,
  leadWindowMonths,
  monthSummary,
  parseMonthSlug,
  seasonalPicks,
  selectSitemapMonths,
  shiftMonth,
  SEASONAL_GUIDES,
  type MonthTally,
} from "@/lib/monthPages";
import { MonthSeasonalBlock } from "@/components/seo/MonthSeasonalBlock";

// SEO-033. The day the story was implemented: 2026-09-30, local noon.
const NOW = new Date(2026, 8, 30, 12);

describe("sitemap month rule", () => {
  it("publishes December 2026 and January 2027 on 2026-09-30 with no events", () => {
    const perMonth = new Map<string, MonthTally>([
      ["september-2026", { count: 725, lastmod: "2026-09-29" }],
      ["october-2026", { count: 219, lastmod: "2026-09-29" }],
      ["november-2026", { count: 78, lastmod: "2026-09-28" }],
    ]);
    const out = selectSitemapMonths(perMonth, NOW, { minEvents: 3, today: "2026-09-30" });
    const slugs = out.map((m) => m.slug);
    expect(slugs).toContain("december-2026");
    expect(slugs).toContain("january-2027");
    const january = out.find((m) => m.slug === "january-2027");
    expect(january).toEqual({ slug: "january-2027", lastmod: "2026-09-30", forced: true });
  });

  it("still applies the floor beyond the lead window", () => {
    const perMonth = new Map<string, MonthTally>([
      ["february-2027", { count: 4, lastmod: "2026-09-01" }],
      ["march-2027", { count: 2, lastmod: "2026-09-01" }],
      ["july-2027", { count: 1, lastmod: "2026-09-01" }],
    ]);
    const slugs = selectSitemapMonths(perMonth, NOW, { minEvents: 3, today: "2026-09-30" }).map((m) => m.slug);
    expect(slugs).toContain("february-2027");
    expect(slugs).not.toContain("march-2027");
    expect(slugs).not.toContain("july-2027");
  });

  it("never lists an archived month, even one with events", () => {
    const perMonth = new Map<string, MonthTally>([["june-2026", { count: 40, lastmod: "2026-06-30" }]]);
    const slugs = selectSitemapMonths(perMonth, NOW, { minEvents: 3, today: "2026-09-30" }).map((m) => m.slug);
    expect(slugs).not.toContain("june-2026");
  });

  it("lead window starts at the current month and rolls over the year", () => {
    expect(leadWindowMonths(NOW)).toEqual(["september-2026", "october-2026", "november-2026", "december-2026", "january-2027"]);
    // Early in a month the window is shorter: on 1 September, January is 122 days out.
    expect(leadWindowMonths(new Date(2026, 8, 1, 12))).not.toContain("january-2027");
  });
});

describe("archive policy", () => {
  it("noindexes months more than two calendar months back", () => {
    expect(isArchivedMonth(parseMonthSlug("july-2026")!, NOW)).toBe(false);
    expect(isArchivedMonth(parseMonthSlug("june-2026")!, NOW)).toBe(true);
    expect(isArchivedMonth(parseMonthSlug("october-2026")!, NOW)).toBe(false);
    // Across a year boundary: from February 2027, November 2026 is 3 back.
    expect(isArchivedMonth(parseMonthSlug("november-2026")!, new Date(2027, 1, 10))).toBe(true);
    expect(isArchivedMonth(parseMonthSlug("december-2026")!, new Date(2027, 1, 10))).toBe(false);
  });

  it("shifts months across years in both directions", () => {
    expect(shiftMonth({ year: 2026, monthIndex: 11 }, 1)).toEqual({ year: 2027, monthIndex: 0 });
    expect(shiftMonth({ year: 2027, monthIndex: 0 }, -1)).toEqual({ year: 2026, monthIndex: 11 });
  });
});

describe("seasonal copy is derived, not invented", () => {
  it("summarises only the rows it is given", () => {
    const events = [
      { title: "A", category: "Music" },
      { title: "B", category: "Music" },
      { title: "C", category: "Sports" },
      { title: "D", category: "Other" },
    ];
    expect(monthSummary(events, "October 2026")).toBe(
      "We list 4 events in Des Moines and the suburbs for October 2026 so far. The busiest categories are music and sports.",
    );
    expect(monthSummary([], "January 2027")).toMatch(/^No January 2027 events are listed yet\./);
    expect(monthSummary(events, "June 2026", true)).toMatch(/^We listed 4 events .* for June 2026\. /);
    // One event is not a category pattern.
    expect(monthSummary([{ title: "X", category: "Music" }], "January 2027")).toBe(
      "We list 1 event in Des Moines and the suburbs for January 2027 so far.",
    );
  });

  it("picks seasonal events by title for themed months only", () => {
    const events = [
      { title: "Spooky Science", category: "Family" },
      { title: "Iowa Wild vs Charlotte", category: "Sports" },
      { title: "Trick or Trees", category: "Community" },
    ];
    expect(seasonalPicks(events, 9).map((e) => e.title)).toEqual(["Spooky Science", "Trick or Trees"]);
    expect(seasonalPicks(events, 0)).toEqual([]);
  });
});

describe("MonthSeasonalBlock", () => {
  const renderBlock = (slug: string, events: Array<{ id: string; title: string; category: string; date: string }>) =>
    render(
      <MemoryRouter>
        <MonthSeasonalBlock month={parseMonthSlug(slug)!} events={events} />
      </MemoryRouter>,
    );

  it("uses the searched H2 phrasing and keeps the SEO-032 October article links", () => {
    renderBlock("october-2026", [
      { id: "1", title: "Spooky Science", category: "Family", date: "2026-10-31T23:00:00Z" },
    ]);
    expect(screen.getByRole("heading", { level: 2, name: "Things to do in Des Moines in October 2026" })).toBeInTheDocument();
    for (const guide of SEASONAL_GUIDES["october-2026"]) {
      expect(screen.getByRole("link", { name: guide.label })).toHaveAttribute("href", guide.href);
    }
    expect(screen.getByRole("link", { name: "Spooky Science" }).getAttribute("href")).toMatch(/^\/events\/spooky-science-/);
  });

  it("renders an honest block for a month with no events and no articles", () => {
    renderBlock("january-2027", []);
    expect(screen.getByRole("heading", { level: 2, name: "Things to do in Des Moines in January 2027" })).toBeInTheDocument();
    expect(screen.getByText(/No January 2027 events are listed yet/)).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("links only to articles listed for the month", () => {
    renderBlock("december-2026", [
      { id: "2", title: "A Drag Queen Christmas", category: "Entertainment", date: "2026-12-02T01:30:00Z" },
    ]);
    expect(screen.queryAllByRole("link").every((a) => a.getAttribute("href")!.startsWith("/events/"))).toBe(true);
  });
});
