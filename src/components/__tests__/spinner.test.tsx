import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Spinner, LoadingSpinner } from "@/components/ui/loading-skeleton";

/**
 * Twelve screens had pasted the same hand-rolled spinner - a spin animation on
 * a rounded box with one thick bottom border, which is impeccable's
 * border-accent-on-rounded rule and was the largest group in its report
 * (WEB-UX-034). These pin the two things the replacement has to get right: the
 * ring is a full ring, and the ARIA does not double up.
 */
describe("Spinner", () => {
  it("draws a full ring with a tinted top, not a single edge", () => {
    const { container } = render(<Spinner />);
    const ring = container.firstElementChild as HTMLElement;

    expect(ring.className).toContain("border-2");
    expect(ring.className).toContain("border-t-primary");
    // The shape the detector flags, and the reason: a bottom-only border on a
    // rounded box reads as a stray edge until it moves.
    expect(ring.className).not.toContain("border-b-2");
  });

  it("is invisible to screen readers on its own", () => {
    // It has to be, or PageLoadingOverlay - which is itself role="status" -
    // would announce twice.
    const { container } = render(<Spinner />);
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("honours prefers-reduced-motion", () => {
    const { container } = render(<Spinner />);
    expect((container.firstElementChild as HTMLElement).className).toContain(
      "motion-reduce:animate-pulse",
    );
  });

  it("sizes from the shared map, including the xl the old 12x12 spinner used", () => {
    for (const [size, cls] of [
      ["sm", "h-4 w-4"],
      ["default", "h-6 w-6"],
      ["lg", "h-8 w-8"],
      ["xl", "h-12 w-12"],
    ] as const) {
      const { container } = render(<Spinner size={size} />);
      expect((container.firstElementChild as HTMLElement).className).toContain(cls);
    }
  });

  it("inherits the surrounding text colour when asked", () => {
    // For spinners inside buttons, where `primary` would be wrong against the
    // button's own background.
    const { container } = render(<Spinner tone="current" />);
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).toContain("border-current");
    expect(cls).not.toContain("border-t-primary");
  });
});

describe("LoadingSpinner", () => {
  it("is the status region, and announces the label", () => {
    render(<LoadingSpinner label="Loading articles" />);
    const status = screen.getByRole("status");
    expect(status).toBeTruthy();
    expect(status.textContent).toContain("Loading articles");
  });

  it("carries exactly one status region", () => {
    render(<LoadingSpinner />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});
