import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { AFFILIATE_BASE, ticketmasterPatch, toAffiliateLink } from "./links.ts";

const TM = "https://www.ticketmaster.com/some-show-waukee-iowa-10-12-2026/event/0600632DE1A4";

Deno.test("toAffiliateLink strips tracking params and wraps the page", () => {
  const link = toAffiliateLink(`${TM}?utm_source=x&_ga=1&_gl=2`);
  assertEquals(link, AFFILIATE_BASE + encodeURIComponent(TM));
  assertEquals(new URL(link).searchParams.get("u"), TM);
});

Deno.test("ticketmasterPatch never writes the redirect into source_url", () => {
  const show = { ticketmasterUrl: TM, affiliateUrl: toAffiliateLink(TM) };

  // A real page another scraper found is kept.
  assertEquals(ticketmasterPatch(show, "https://www.vibrantmusichall.com/shows/x"), {
    affiliate_url: show.affiliateUrl,
  });

  // Empty, or a redirect left by an earlier run: restored to the real page.
  assertEquals(ticketmasterPatch(show, null), { affiliate_url: show.affiliateUrl, source_url: TM });
  assertEquals(ticketmasterPatch(show, show.affiliateUrl), {
    affiliate_url: show.affiliateUrl,
    source_url: TM,
  });
});
