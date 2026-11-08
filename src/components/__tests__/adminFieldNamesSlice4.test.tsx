import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { findUnnamedFields } from "../../../scripts/check-field-names.mjs";

/**
 * WEB-UX-068 slice 4. Twelve admin/CMS files with 40 unnamed fields between
 * them: Labels with no htmlFor (or, in ContentEditor, an htmlFor naming an id
 * no control carried), and filter-row searches and Selects named only by a
 * placeholder. The scanner cases keep each file at zero; the render cases
 * check the names a screen reader actually gets.
 */
describe("admin files fixed in slice 4 have no unnamed fields", () => {
  it.each([
    "src/components/ContentEditor.tsx",
    "src/components/CompetitorAnalysis.tsx",
    "src/components/ArticleEditor.tsx",
    "src/components/AIArticleGenerator.tsx",
    "src/components/admin/VenuesManager.tsx",
    "src/components/admin/RestaurantMenuManager.tsx",
    "src/components/admin/NewsletterSubscribersManager.tsx",
    "src/components/admin/MenuScrapePanel.tsx",
    "src/components/admin/MediaLibrary.tsx",
    "src/components/SEOTools.tsx",
    "src/components/ContentQueue.tsx",
    "src/components/AIConfigurationManager.tsx",
  ])("%s", (file) => {
    const source = readFileSync(resolve(__dirname, "../../..", file), "utf8");
    expect(findUnnamedFields(source, file)).toEqual([]);
  });
});

vi.mock("@/integrations/supabase/client", () => {
  // The subscriber query never settles: the filter row renders while
  // loading, and that is all this test reads.
  const pending = new Promise(() => {});
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "ilike", "eq", "order", "range", "limit", "in"]) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    pending.then(resolve, reject);
  return { supabase: { from: () => chain } };
});
vi.mock("@/lib/adminAudit", () => ({ recordAdminAudit: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

describe("NewsletterSubscribersManager filter row", () => {
  it("names the search box and both selects", async () => {
    const { default: NewsletterSubscribersManager } = await import(
      "@/components/admin/NewsletterSubscribersManager"
    );
    render(<NewsletterSubscribersManager />);
    expect(screen.getByRole("textbox", { name: "Search subscribers by email" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Filter by status" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Filter by source" })).toBeTruthy();
  });
});

describe("ContentEditor field labels", () => {
  it("ties each visible Label to its control", async () => {
    const { default: ContentEditor } = await import("@/components/ContentEditor");
    render(
      <ContentEditor
        type="event"
        item={{ title: "Jazz in July", original_description: "", category: "Music", date: "" }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // The required marker is part of the label text, so match by prefix.
    expect((screen.getByLabelText(/^Event Title/) as HTMLInputElement).value).toBe("Jazz in July");
    expect(screen.getByLabelText("Description").tagName).toBe("TEXTAREA");
    expect(screen.getByLabelText("Category").getAttribute("role")).toBe("combobox");
  });
});
