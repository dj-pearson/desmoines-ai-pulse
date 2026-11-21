import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * WEB-UX-061: on a 375x667 phone the /events header, results bar, day header
 * and bottom nav pinned 41% of the screen. The bar now slides away while the
 * reader scrolls down past where it pins, comes back on scroll up or when
 * focus enters it, and publishes 0 for --events-bar-h while away so the day
 * header moves up under the site header. Wide screens keep it pinned.
 */
vi.mock("@/components/SaveSearchButton", () => ({ SaveSearchButton: () => null }));

import { EventsStickyBar } from "../EventsStickyBar";

let phone = true;
let sentinelTop = 400;

function setScroll(y: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
  fireEvent.scroll(window);
}

function renderBar() {
  render(
    <EventsStickyBar
      countLabel="30 of 412 events"
      chips={[]}
      onClearAll={() => {}}
      onOpenFilters={() => {}}
      activeFiltersCount={0}
      sortBy="date"
      onSortChange={() => {}}
      viewMode="list"
      onViewChange={() => {}}
    />
  );
  return screen.getByText("30 of 412 events").closest("div.sticky") as HTMLElement;
}

const barVar = () => document.documentElement.style.getPropertyValue("--events-bar-h");

beforeEach(() => {
  phone = true;
  sentinelTop = 400;
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: phone && query.includes("max-width"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  );
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const top = this.getAttribute("aria-hidden") === "true" && this.className === "h-0" ? sentinelTop : 0;
    return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) };
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 87 });
  setScroll(0);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("EventsStickyBar on a phone", () => {
  it("stays put while it is still in the flow, even scrolling down", () => {
    const bar = renderBar();
    act(() => setScroll(200));
    expect(bar.dataset.tucked).toBeUndefined();
    expect(barVar()).toBe("87px");
  });

  it("slides away scrolling down once pinned, and frees its height for the day header", () => {
    const bar = renderBar();
    sentinelTop = 10;
    act(() => setScroll(1500));
    expect(bar.dataset.tucked).toBe("true");
    expect(bar.className).toContain("-translate-y-");
    expect(barVar()).toBe("0px");
  });

  it("comes back on any scroll up", () => {
    const bar = renderBar();
    sentinelTop = 10;
    act(() => setScroll(1500));
    act(() => setScroll(1400));
    expect(bar.dataset.tucked).toBeUndefined();
    expect(barVar()).toBe("87px");
  });

  it("comes back when keyboard focus enters it", () => {
    const bar = renderBar();
    sentinelTop = 10;
    act(() => setScroll(1500));
    act(() => screen.getByRole("button", { name: /Filters/ }).focus());
    expect(bar.dataset.tucked).toBeUndefined();
  });

  it("ignores a few px of jitter", () => {
    const bar = renderBar();
    sentinelTop = 10;
    act(() => setScroll(1500));
    act(() => setScroll(1497));
    expect(bar.dataset.tucked).toBe("true");
  });
});

describe("EventsStickyBar on a wide screen", () => {
  it("never slides away", () => {
    phone = false;
    const bar = renderBar();
    sentinelTop = 10;
    act(() => setScroll(1500));
    expect(bar.dataset.tucked).toBeUndefined();
    expect(barVar()).toBe("87px");
  });
});
