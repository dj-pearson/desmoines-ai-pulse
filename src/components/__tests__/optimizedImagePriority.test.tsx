import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { OptimizedImage } from "@/components/OptimizedImage";

/**
 * WEB-PERF-041 AC4. `priority` on OptimizedImage does two jobs and only one of
 * them is about network priority.
 *
 * The obvious one: loading="eager" plus fetchpriority="high", so the browser
 * starts the hero's request before layout instead of after it.
 *
 * The one that is easy to lose: WITHOUT `priority` the component renders no
 * <img> element at all until its IntersectionObserver fires. jsdom has no
 * IntersectionObserver and neither does a prerender pass that snapshots the
 * DOM, so a hero converted to OptimizedImage and left without the flag ships
 * HTML with no hero image in it - to crawlers that do not run JavaScript, an
 * empty box. scripts/check-lcp-priority.mjs fails on that case; this asserts
 * the behaviour that check is asserting the source of.
 *
 * The observer is deliberately stubbed to NEVER fire, which is the state both
 * a crawler and a first paint are in.
 */
class NeverFiringObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: ReadonlyArray<number> = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

beforeAll(() => {
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    NeverFiringObserver;
});

afterEach(cleanup);

const SRC = "https://abc.supabase.co/storage/v1/object/public/images/hero.jpg";

describe("OptimizedImage priority", () => {
  it("renders the img before any observer fires", () => {
    render(<OptimizedImage src={SRC} alt="Hero" priority />);
    expect(screen.getByAltText("Hero")).toBeTruthy();
  });

  it("carries both hints the LCP needs", () => {
    render(<OptimizedImage src={SRC} alt="Hero" priority />);
    const img = screen.getByAltText("Hero");
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("high");
  });

  it("renders NO img without it, which is the prerender trap", () => {
    render(<OptimizedImage src={SRC} alt="Lazy" />);
    expect(screen.queryByAltText("Lazy")).toBeNull();
  });

  it("lets containerClassName replace the wrapper's own positioning", () => {
    // The three detail-page heroes pass `absolute inset-0` to fill a sized
    // parent. The component's own class list starts with `relative`, and the
    // two are the same Tailwind group - if cn() stopped resolving that, the
    // hero would size itself instead of filling the box above it.
    const { container } = render(
      <OptimizedImage src={SRC} alt="Hero" priority containerClassName="absolute inset-0" />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("absolute");
    expect(wrapper.className).not.toContain("relative");
    expect(wrapper.className).toContain("inset-0");
  });

  it("sets no aspect-ratio when it was given no width and height", () => {
    // An aspect-ratio on the wrapper would fight the parent's fixed h-72/h-96.
    const { container } = render(
      <OptimizedImage src={SRC} alt="Hero" priority containerClassName="absolute inset-0" />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.aspectRatio).toBe("");
  });
});
