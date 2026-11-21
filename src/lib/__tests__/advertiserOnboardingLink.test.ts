import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { advertiserOnboardingLink, listingFromBusinessRef } from "@/lib/advertiserOnboardingLink";
import { BRAND } from "@/lib/brandConfig";

/**
 * AOS-PROSPECT-007 AC3: a won CRM deal goes into the self-serve funnel by a
 * link, with the account's listing preselected from crm_accounts.business_ref.
 */

const ID = "0b7f3c1e-2a4d-4e5f-8a9b-1c2d3e4f5a6b";

describe("listingFromBusinessRef", () => {
  it("maps each source table agent-lead-sourcing writes to the deep-link type", () => {
    expect(listingFromBusinessRef(`restaurants:${ID}`)).toEqual({ type: "restaurant", id: ID });
    expect(listingFromBusinessRef(`events:${ID}`)).toEqual({ type: "event", id: ID });
    expect(listingFromBusinessRef(`attractions:${ID}`)).toEqual({ type: "attraction", id: ID });
  });

  it("refuses anything that is not <known table>:<uuid>", () => {
    expect(listingFromBusinessRef(null)).toBeNull();
    expect(listingFromBusinessRef(undefined)).toBeNull();
    expect(listingFromBusinessRef("")).toBeNull();
    expect(listingFromBusinessRef(ID)).toBeNull();
    expect(listingFromBusinessRef(`hotels:${ID}`)).toBeNull();
    expect(listingFromBusinessRef("restaurants:42")).toBeNull();
    expect(listingFromBusinessRef(`restaurants:${ID}&utm_source=x`)).toBeNull();
  });
});

describe("advertiserOnboardingLink", () => {
  it("is an absolute /advertise URL with the listing preselected and sales UTM tags", () => {
    const url = new URL(advertiserOnboardingLink({ business_ref: `restaurants:${ID}` }));
    expect(`${url.origin}`).toBe(new URL(BRAND.baseUrl).origin);
    expect(url.pathname).toBe("/advertise");
    expect(url.searchParams.get("listing_type")).toBe("restaurant");
    expect(url.searchParams.get("listing_id")).toBe(ID);
    expect(url.searchParams.get("utm_source")).toBe("crm");
    expect(url.searchParams.get("utm_medium")).toBe("sales");
    expect(url.searchParams.get("utm_campaign")).toBe("won_deal");
  });

  it("still links to the funnel when the account has no usable listing", () => {
    for (const business_ref of [null, undefined, "manual-entry"]) {
      const url = new URL(advertiserOnboardingLink({ business_ref }));
      expect(url.pathname).toBe("/advertise");
      expect(url.searchParams.has("listing_type")).toBe(false);
      expect(url.searchParams.has("listing_id")).toBe(false);
      expect(url.searchParams.get("utm_source")).toBe("crm");
    }
  });

  it("carries no price: the page asks the server for the total", () => {
    const url = new URL(advertiserOnboardingLink({ business_ref: `events:${ID}` }));
    const keys = [...url.searchParams.keys()];
    expect(keys.some((k) => /price|total|amount|rate|cost/i.test(k))).toBe(false);
  });

  it("uses the parameter names /advertise's deep link reads", () => {
    // The link and the page are separate files; if the page stops reading
    // these names, every copied link silently loses its listing.
    const page = readFileSync(resolve(__dirname, "../../pages/Advertise.tsx"), "utf8");
    expect(page).toContain('params.get("listing_type")');
    expect(page).toContain('params.get("listing_id")');
  });

  it("gets business_ref from crm-console's board, or every link loses its listing", () => {
    const fn = readFileSync(resolve(__dirname, "../../../supabase/functions/crm-console/index.ts"), "utf8");
    const accountsSelect = fn.match(/from\("crm_accounts"\)\.select\("([^"]+)"\)/)?.[1] ?? "";
    expect(accountsSelect.split(",").map((c) => c.trim())).toContain("business_ref");
  });
});
