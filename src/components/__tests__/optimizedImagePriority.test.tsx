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
 * The one that WAS easy to lose, and is now structural: the component used to
 * gate the img element's EXISTENCE on an IntersectionObserver, so without
 * `priority` there was no img in the DOM until something scrolled. A prerender
 * pass snapshots the DOM rather than scrolling it, so every card past the
 * observer's reach shipped as an empty box. That gate is gone - the element is
 * always rendered and `loading="lazy"` defers the fetch - and the cases below
 * pin both halves: priority still means eager + high, and the absence of
 * priority no longer means the absence of an image.
 *
 * The observer is still stubbed to never fire, and the point of the stub has
 * inverted: it used to reproduce the trap, and now it proves nothing depends
 * on an observer any more. That is also the state jsdom, a crawler and a
 * first paint are all in.
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

  it("renders the img WITHOUT it too, and defers only the fetch", () => {
    // The whole point of removing the observer gate. A card grid without
    // `priority` must still put every one of its images into the DOM the
    // prerenderer snapshots; `loading="lazy"` is what keeps them off the wire
    // until the reader scrolls.
    render(<OptimizedImage src={SRC} alt="Lazy" />);
    const img = screen.getByAltText("Lazy");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("src")).toBe(SRC);
  });

  it("reveals an image that was already complete when React attached", () => {
    // onLoad drives the opacity fade and React does not replay a load event
    // that fired before hydration. Without the complete check, a prerendered
    // page's images stay at opacity-0 with no way back.
    Object.defineProperty(HTMLImageElement.prototype, "complete", {
      configurable: true,
      get: () => true,
    });
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
      configurable: true,
      get: () => 800,
    });
    try {
      render(<OptimizedImage src={SRC} alt="Hydrated" />);
      expect(screen.getByAltText("Hydrated").className).toContain("opacity-100");
    } finally {
      delete (HTMLImageElement.prototype as unknown as Record<string, unknown>).complete;
      delete (HTMLImageElement.prototype as unknown as Record<string, unknown>).naturalWidth;
    }
  });

  it("does not reveal an image whose request failed", () => {
    // complete is true for a FAILED request as well, which is why the guard
    // reads naturalWidth. Revealing here would fade in a broken image over the
    // error panel.
    Object.defineProperty(HTMLImageElement.prototype, "complete", {
      configurable: true,
      get: () => true,
    });
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
      configurable: true,
      get: () => 0,
    });
    try {
      render(<OptimizedImage src={SRC} alt="Broken" />);
      expect(screen.getByAltText("Broken").className).toContain("opacity-0");
    } finally {
      delete (HTMLImageElement.prototype as unknown as Record<string, unknown>).complete;
      delete (HTMLImageElement.prototype as unknown as Record<string, unknown>).naturalWidth;
    }
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
