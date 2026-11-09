import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { findUnnamedFields } from "../../../scripts/check-field-names.mjs";

/**
 * WEB-UX-068 slice 2. The six admin/CMS files with the most unnamed fields
 * (47 between them): a <Label> with no htmlFor over the field, or a
 * placeholder-only search box / bare Select in a filter row. The scanner cases
 * keep each file at zero; the render cases check that a label actually
 * resolves to its control, which is the part a static count cannot prove.
 */
describe("admin files fixed in slice 2 have no unnamed fields", () => {
  it.each([
    "src/components/admin/PlaygroundManager.tsx",
    "src/components/admin/AdRateManager.tsx",
    "src/components/ContentEditDialog.tsx",
    "src/components/admin/DealManager.tsx",
    "src/components/admin/FeedbackInbox.tsx",
    "src/components/cms/EnhancedArticleEditor.tsx",
  ])("%s", (file) => {
    const source = readFileSync(resolve(__dirname, "../../..", file), "utf8");
    expect(findUnnamedFields(source, file)).toEqual([]);
  });
});

const rateRow = (placement_type: string, base_daily_rate: number) => ({
  id: placement_type,
  placement_type,
  base_daily_rate,
  cpm_rate: 10,
  min_days: 1,
  max_days: 30,
  min_lead_time_days: 2,
  discount_7_day: 5,
  discount_14_day: 10,
  discount_30_day: 15,
  peak_multiplier: 1.5,
  high_multiplier: 1.25,
  is_active: true,
  updated_at: "2026-11-01T00:00:00Z",
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () =>
          Promise.resolve({
            data: [rateRow("top_banner", 10), rateRow("featured_spot", 7)],
            error: null,
          }),
      }),
    }),
  },
}));

vi.mock("@/hooks/useKnownVenues", () => ({
  useVenueMatcher: () => ({
    findVenue: () => null,
    getAutoFillData: () => ({}),
    isReady: false,
  }),
}));

describe("AdRateManager", () => {
  it("ties every rate field to its own card's label", async () => {
    const { AdRateManager } = await import("@/components/admin/AdRateManager");
    render(<AdRateManager />);
    const base = await screen.findAllByLabelText("Base Daily Rate ($)");
    expect(base.map((el) => (el as HTMLInputElement).value)).toEqual(["10", "7"]);
    expect(base[0].id).not.toBe(base[1].id);
    expect(screen.getAllByLabelText("30-Day Discount (%)")).toHaveLength(2);
    expect(screen.getAllByLabelText("High Traffic Multiplier")).toHaveLength(2);
  });
});

describe("ContentEditDialog", () => {
  it("names text, number, select, list and switch fields by their label", async () => {
    const { default: ContentEditDialog } = await import("@/components/ContentEditDialog");
    render(
      <ContentEditDialog
        open
        onOpenChange={() => {}}
        contentType="playground"
        item={{ id: "p1", name: "Union Park", rating: 4.5 }}
        onSave={() => {}}
      />,
    );
    expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe("Union Park");
    expect((screen.getByLabelText("Rating") as HTMLInputElement).value).toBe("4.5");
    expect(screen.getByLabelText("Age Range").getAttribute("role")).toBe("combobox");
    expect(screen.getByLabelText("Amenities").getAttribute("placeholder")).toBe("Add new amenity");
  });

  it("names the event time input and the featured switch", async () => {
    const { default: ContentEditDialog } = await import("@/components/ContentEditDialog");
    render(
      <ContentEditDialog
        open
        onOpenChange={() => {}}
        contentType="event"
        item={{ id: "e1", title: "Jazz in July", date: "2026-07-10T19:00:00Z" }}
        onSave={() => {}}
      />,
    );
    expect(screen.getByLabelText("Date time").getAttribute("type")).toBe("time");
    expect(screen.getByLabelText("Featured").getAttribute("role")).toBe("switch");
  });
});
