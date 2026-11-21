import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * WEB-UX-063: ContentTable's "Sort by:" and SearchTrafficDashboard's
 * "Platform:" / "Date Range:" were bare <label>s beside a Radix Select trigger
 * or the date-range button, with no htmlFor. A screen reader announced the
 * control by its current value alone ("Title, combobox"), never what it sorts
 * or filters (WCAG 1.3.1 / 4.1.2).
 */

// Every query resolves to an empty, error-free result, whatever the chain.
function emptyQuery(): unknown {
  const result = Promise.resolve({ data: [], error: null, count: 0 });
  return new Proxy(() => {}, {
    get(_target, prop) {
      if (prop === "then") return result.then.bind(result);
      return () => emptyQuery();
    },
    apply() {
      return emptyQuery();
    },
  });
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => emptyQuery(),
    rpc: () => emptyQuery(),
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
  },
}));

vi.mock("@/hooks/useDomainHighlights", () => ({
  useDomainHighlights: () => ({ isHighlightedDomain: () => false }),
}));
vi.mock("@/hooks/useWriteupGenerator", () => ({
  useWriteupGenerator: () => ({ generateWriteup: vi.fn(), isGeneratingId: null }),
}));
vi.mock("@/hooks/useDataExport", () => ({
  useContentExport: () => ({ isExporting: false, exportContent: vi.fn() }),
}));

// The dashboard's tab panels fetch their own data; this spec is about the
// filter bar above them.
vi.mock("@/components/admin/SearchTrafficDashboard/OAuthProviderSetup", () => ({ OAuthProviderSetup: () => null }));
vi.mock("@/components/admin/SearchTrafficDashboard/TrafficOverview", () => ({ TrafficOverview: () => null }));
vi.mock("@/components/admin/SearchTrafficDashboard/SearchPerformance", () => ({ SearchPerformance: () => null }));
vi.mock("@/components/admin/SearchTrafficDashboard/KeywordAnalytics", () => ({ KeywordAnalytics: () => null }));
vi.mock("@/components/admin/SearchTrafficDashboard/SEOOpportunities", () => ({ SEOOpportunities: () => null }));
vi.mock("@/components/admin/SearchTrafficDashboard/SiteHealth", () => ({ SiteHealth: () => null }));
vi.mock("@/components/admin/SearchTrafficDashboard/ComparativeAnalysis", () => ({ ComparativeAnalysis: () => null }));

import ContentTable from "@/components/ContentTable";
import { SearchTrafficDashboard } from "@/components/admin/SearchTrafficDashboard";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";

describe("admin filter labels (WEB-UX-063)", () => {
  it("names ContentTable's sort select by its label", () => {
    render(
      <ContentTable
        type="event"
        items={[]}
        isLoading={false}
        totalCount={0}
        onEdit={() => {}}
        onDelete={() => {}}
        onSearch={() => {}}
        onFilter={() => {}}
      />,
    );
    const sort = screen.getByLabelText("Sort by:");
    expect(sort).toHaveAttribute("role", "combobox");
  });

  it("names the dashboard's Platform select and keeps the date range in the picker's name", async () => {
    render(<SearchTrafficDashboard />);

    const platform = await screen.findByLabelText("Platform:");
    expect(platform).toHaveAttribute("role", "combobox");

    const range = screen.getByLabelText(/Date Range:/);
    expect(range.tagName).toBe("BUTTON");
    // aria-labelledby is "<label> <button>", so the chosen dates are still
    // read after the label rather than replaced by it.
    const ids = (range.getAttribute("aria-labelledby") ?? "").split(" ");
    expect(ids).toHaveLength(2);
    expect(document.getElementById(ids[0])).toHaveTextContent("Date Range:");
    expect(ids[1]).toBe(range.id);
  });

  it("gives each date-range picker its own button id", () => {
    const date = { from: new Date(2026, 10, 1), to: new Date(2026, 10, 8) };
    render(
      <>
        <DatePickerWithRange date={date} onDateChange={() => {}} />
        <DatePickerWithRange date={date} onDateChange={() => {}} />
      </>,
    );
    const [a, b] = screen.getAllByRole("button");
    expect(a.id).not.toBe("");
    expect(a.id).not.toBe(b.id);
  });
});
