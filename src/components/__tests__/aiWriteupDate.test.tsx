import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AIWriteup } from "@/components/AIWriteup";

/**
 * The "Written" date on event and restaurant pages is a Central calendar day.
 * It used toLocaleDateString with no timeZone, so the prerenderer (UTC) and a
 * Central browser disagreed: 02:00Z on the 25th is 9 PM CDT on the 24th, and
 * the prerendered HTML said "September 25" while hydration said "24".
 *
 * These assertions hold whatever TZ the test process runs in.
 */
describe("AIWriteup written date", () => {
  it("renders an evening-Central instant as the Central day, not the UTC day", () => {
    render(<AIWriteup writeup="Good tacos." generatedAt="2026-09-25T02:00:00Z" />);
    expect(screen.getByText("Written September 24, 2026")).toBeTruthy();
  });

  it("keeps a midday instant on its own day", () => {
    render(<AIWriteup writeup="Good tacos." generatedAt="2026-09-25T17:00:00Z" />);
    expect(screen.getByText("Written September 25, 2026")).toBeTruthy();
  });

  it("drops the line for an unparseable value instead of printing Invalid Date", () => {
    const { container } = render(<AIWriteup writeup="Good tacos." generatedAt="not a date" />);
    expect(container.textContent).not.toContain("Written");
  });
});
