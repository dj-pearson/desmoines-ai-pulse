import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { findUnnamedFields } from "../../../scripts/check-field-names.mjs";

/**
 * WEB-UX-068 slice 3. Eight admin/CMS files with 34 unnamed fields between
 * them: filter-row searches and Selects named only by a placeholder that
 * vanishes once a value is picked, and dialog Labels with no htmlFor. The
 * scanner cases keep each file at zero; the render case checks the names a
 * screen reader actually gets.
 */
describe("admin files fixed in slice 3 have no unnamed fields", () => {
  it.each([
    "src/components/cms/CategoryTagManager.tsx",
    "src/components/admin/PartnershipsManager.tsx",
    "src/pages/AdminCampaigns.tsx",
    "src/components/admin/SupportTicketsConsole.tsx",
    "src/components/admin/SupportConsole.tsx",
    "src/components/admin/HotelManager.tsx",
    "src/components/admin/AttractionManager.tsx",
    "src/components/ActivityLogViewer.tsx",
  ])("%s", (file) => {
    const source = readFileSync(resolve(__dirname, "../../..", file), "utf8");
    expect(findUnnamedFields(source, file)).toEqual([]);
  });
});

vi.mock("@/integrations/supabase/client", () => {
  // The log query never settles: the filter row renders while loading, and
  // that is all this test reads.
  const pending = new Promise(() => {});
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "gte", "order", "in"]) chain[m] = () => chain;
  chain.limit = () => pending;
  return { supabase: { from: () => chain } };
});

vi.mock("@/hooks/useDataExport", () => ({
  useDataExport: () => ({ isExporting: false, exportData: vi.fn() }),
}));

describe("ActivityLogViewer filter row", () => {
  it("names the search box and all three selects", async () => {
    const { ActivityLogViewer } = await import("@/components/ActivityLogViewer");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ActivityLogViewer />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("textbox", { name: "Search activity logs" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Filter by action" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Filter by resource" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Date range" })).toBeTruthy();
  });
});
