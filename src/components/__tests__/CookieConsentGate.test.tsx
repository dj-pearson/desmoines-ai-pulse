import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

vi.mock("@/lib/consentLog", () => ({ logCookieConsent: vi.fn(async () => undefined) }));

import { CookieConsentGate } from "@/components/CookieConsentGate";
import {
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  getStoredConsent,
  needsConsentPrompt,
  reopenConsentBanner,
} from "@/lib/cookieConsent";
import { storage } from "@/lib/safeStorage";

function storeChoice(analytics: boolean) {
  storage.set(CONSENT_STORAGE_KEY, {
    version: CONSENT_VERSION,
    timestamp: new Date().toISOString(),
    essential: true,
    preferences: analytics,
    analytics,
    advertising: false,
  });
}

function setGPC(on: boolean) {
  Object.defineProperty(navigator, "globalPrivacyControl", { configurable: true, get: () => on });
}

function renderGate() {
  return render(
    <MemoryRouter>
      <CookieConsentGate />
    </MemoryRouter>,
  );
}

describe("CookieConsentGate (WEB-PERF-059)", () => {
  beforeEach(() => {
    storage.remove(CONSENT_STORAGE_KEY);
    setGPC(false);
  });
  afterEach(() => setGPC(false));

  it("asks a visitor with no stored choice", async () => {
    renderGate();
    expect(await screen.findByRole("dialog", { name: "We value your privacy" })).toBeTruthy();
  });

  it("renders nothing for a visitor whose choice is stored", async () => {
    storeChoice(false);
    renderGate();
    // Give a lazy import every chance to resolve; it must not be asked for.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("records a rejection for a GPC visitor without prompting", async () => {
    setGPC(true);
    renderGate();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    const record = getStoredConsent();
    expect(record?.gpc).toBe(true);
    expect(record?.analytics).toBe(false);
    expect(record?.advertising).toBe(false);
  });

  it("loads the banner on reopen, open on the categories and pre-filled", async () => {
    storeChoice(true);
    renderGate();
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => reopenConsentBanner());
    expect(await screen.findByRole("dialog", { name: "We value your privacy" })).toBeTruthy();
    // The reopen event fired before the banner existed; it must still open on
    // the Customize panel with the stored choices, not on the short prompt.
    const analytics = await screen.findByRole("checkbox", { name: "Analytics" });
    expect(analytics.getAttribute("data-state")).toBe("checked");
    expect(screen.getByRole("checkbox", { name: /Advertising/ }).getAttribute("data-state")).toBe(
      "unchecked",
    );
  });
});

describe("needsConsentPrompt", () => {
  beforeEach(() => {
    storage.remove(CONSENT_STORAGE_KEY);
    setGPC(false);
  });

  it("is true with no record, false with one", () => {
    expect(needsConsentPrompt()).toBe(true);
    storeChoice(false);
    expect(needsConsentPrompt()).toBe(false);
  });

  it("treats a record from an older consent version as no record", () => {
    storage.set(CONSENT_STORAGE_KEY, {
      version: "2020-01-01",
      timestamp: new Date().toISOString(),
      essential: true,
      preferences: true,
      analytics: true,
      advertising: true,
    });
    expect(needsConsentPrompt()).toBe(true);
  });
});

describe("the banner stays out of the entry chunk", () => {
  // Any static import of the component module, from anywhere the entry chunk
  // reaches, puts it back on every page view. That is how it got there: four
  // analytics hooks imported hasConsent() from the component file.
  it("is imported only by CookieConsentGate, dynamically", () => {
    const srcDir = resolve(__dirname, "../..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name !== "__tests__") walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(name)) continue;
        const rel = relative(srcDir, full);
        if (rel === join("components", "CookieConsentBanner.tsx")) continue;
        const text = readFileSync(full, "utf8");
        const staticImport = /(?:^|\n)\s*(?:import|export)[^;]*?from\s*["'](?:@\/components|\.{1,2}(?:\/[\w.-]+)*)\/CookieConsentBanner["']/;
        const dynamicImport = /import\(\s*["'][^"']*CookieConsentBanner["']\s*\)/;
        if (staticImport.test(text)) offenders.push(`${rel} (static)`);
        else if (dynamicImport.test(text) && rel !== join("components", "CookieConsentGate.tsx")) {
          offenders.push(`${rel} (dynamic)`);
        }
      }
    };
    walk(srcDir);
    expect(offenders).toEqual([]);
  });
});
