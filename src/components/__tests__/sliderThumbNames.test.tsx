import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { Slider } from "@/components/ui/slider";
import { findUnnamedFields } from "../../../scripts/check-field-names.mjs";

/**
 * WEB-UX-074. Radix puts role="slider" on the Thumb, and the shadcn Slider
 * wrapper gave callers no way to reach it, so every slider in the app was
 * announced as an unnamed slider. RestaurantInlineFilters worked around it by
 * poking aria-label into the DOM from a ref; the others had nothing.
 */

beforeAll(() => {
  // Radix Slider measures its thumb with ResizeObserver, which jsdom lacks.
  if (!("ResizeObserver" in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

vi.mock("@/integrations/supabase/client", () => {
  const result = { data: null, error: null };
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) chain[m] = () => chain;
  chain.maybeSingle = () => Promise.resolve(result);
  chain.then = (resolve: (v: typeof result) => unknown) => Promise.resolve(result).then(resolve);
  return { supabase: { from: () => chain, auth: { getUser: vi.fn() } } };
});
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("Slider wrapper", () => {
  it("puts thumbLabel and thumbValueText on the element with role slider", () => {
    render(<Slider thumbLabel="Search radius" thumbValueText="5 miles" value={[5]} max={10} />);
    const thumb = screen.getByRole("slider", { name: "Search radius" });
    expect(thumb).toHaveAttribute("aria-valuetext", "5 miles");
    expect(thumb).toHaveAttribute("aria-valuenow", "5");
  });

  it("names the thumb from a visible label via thumbLabelledBy", () => {
    render(
      <>
        <span id="vol">Volume</span>
        <Slider thumbLabelledBy="vol" value={[1]} max={2} />
      </>,
    );
    expect(screen.getByRole("slider", { name: "Volume" })).toBeInTheDocument();
  });

  it("still renders with no thumb props, for callers that pass none", () => {
    render(<Slider value={[1]} max={2} />);
    const thumb = screen.getByRole("slider");
    expect(thumb).not.toHaveAttribute("aria-label");
    expect(thumb).not.toHaveAttribute("aria-valuetext");
  });
});

describe("TrendingTuner", () => {
  it("names each weight slider after its weight label", async () => {
    const { default: TrendingTuner } = await import("@/components/admin/TrendingTuner");
    render(<TrendingTuner />);
    const names = [
      "View weight",
      "Favorite weight",
      "Share weight",
      "Click weight",
      "Recency half-life (hours)",
      "Minimum age (hours)",
      "Featured boost",
    ];
    for (const name of names) {
      expect(await screen.findByRole("slider", { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("slider")).toHaveLength(names.length);
  });
});

describe("check-field-names flags a Slider with no thumb name", () => {
  it("counts an aria-label on Slider as unnamed, since it lands on the Root", () => {
    expect(findUnnamedFields(`<Slider aria-label="Rating" value={[1]} />`)).toEqual([1]);
    expect(findUnnamedFields(`<Label>Rating<Slider value={[1]} /></Label>`)).toEqual([1]);
    expect(findUnnamedFields(`<Slider thumbLabel="Rating" value={[1]} />`)).toEqual([]);
    expect(findUnnamedFields(`<Slider {...props} />`)).toEqual([]);
  });

  it.each([
    "src/components/admin/TrendingTuner.tsx",
    "src/components/RestaurantInlineFilters.tsx",
    "src/components/event-promotion-planner/WizardForm.tsx",
    "src/components/media/VideoPlayer.tsx",
  ])("%s has no unnamed slider", (file) => {
    const source = readFileSync(resolve(__dirname, "../../..", file), "utf8");
    expect(findUnnamedFields(source, file)).toEqual([]);
  });
});
