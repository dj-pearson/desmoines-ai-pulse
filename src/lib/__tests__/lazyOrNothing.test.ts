import { describe, expect, it } from "vitest";
import type { ComponentType } from "react";
import { lazyOrNothing } from "@/lib/lazyOrNothing";

function Real(): null {
  return null;
}

describe("lazyOrNothing (WEB-PERF-061)", () => {
  it("passes a loaded module through unchanged", async () => {
    const load = lazyOrNothing(() => Promise.resolve({ default: Real as ComponentType<object> }));
    await expect(load()).resolves.toEqual({ default: Real });
  });

  it("resolves a failed chunk to a component that renders nothing", async () => {
    const load = lazyOrNothing<object>(() =>
      Promise.reject(new TypeError("Failed to fetch dynamically imported module")),
    );
    const mod = await load();
    expect(mod.default).not.toBe(Real);
    const Fallback = mod.default as (props: object) => unknown;
    expect(Fallback({})).toBeNull();
  });
});
