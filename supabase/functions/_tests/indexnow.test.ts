/**
 * IndexNow payload construction (WEB-SEO-011).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/indexnow.test.ts
 *
 * The submission itself is a single POST and not worth mocking. What IS worth
 * asserting is the filtering, because IndexNow rejects the WHOLE batch with 422
 * if any single URL is not on the declared host. regenerate-sitemaps feeds this
 * whatever canonical URLs the change queue resolved to, so one absolute URL
 * pointing at a partner domain would cost us every other URL in that run —
 * silently, since the job only records a status code.
 */

import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildIndexNowPayload,
  describeIndexNowStatus,
  INDEXNOW_KEY,
  INDEXNOW_KEY_FILE,
  INDEXNOW_MAX_URLS,
} from "../_shared/indexNow.ts";

const SITE = "https://desmoinesinsider.com";

Deno.test("builds a spec-shaped payload for same-host URLs", () => {
  const { payload, dropped, truncated } = buildIndexNowPayload(SITE, [
    `${SITE}/events/farmers-market-2026-08-11`,
    `${SITE}/restaurants/centro`,
  ]);

  assert(payload);
  assertEquals(payload.host, "desmoinesinsider.com");
  assertEquals(payload.key, INDEXNOW_KEY);
  assertEquals(payload.keyLocation, `${SITE}/${INDEXNOW_KEY_FILE}`);
  assertEquals(payload.urlList.length, 2);
  assertEquals(dropped.length, 0);
  assertEquals(truncated, 0);
});

Deno.test("drops off-host URLs instead of letting them 422 the whole batch", () => {
  const { payload, dropped } = buildIndexNowPayload(SITE, [
    `${SITE}/events/ok`,
    "https://catchdesmoines.com/events/theirs",
    "https://www.desmoinesinsider.com/events/wrong-subdomain",
  ]);

  assert(payload);
  assertEquals(payload.urlList, [`${SITE}/events/ok`]);
  assertEquals(dropped.length, 2);
});

Deno.test("drops unparseable and non-HTTP URLs", () => {
  const { payload, dropped } = buildIndexNowPayload(SITE, [
    `${SITE}/events/ok`,
    "not a url",
    "ftp://desmoinesinsider.com/events/nope",
    "javascript:alert(1)",
  ]);

  assert(payload);
  assertEquals(payload.urlList.length, 1);
  assertEquals(dropped.length, 3);
});

Deno.test("deduplicates so a queue with repeat rows submits each URL once", () => {
  const url = `${SITE}/events/repeated`;
  const { payload } = buildIndexNowPayload(SITE, [url, url, url]);

  assert(payload);
  assertEquals(payload.urlList, [url]);
});

Deno.test("returns no payload rather than an empty submission", () => {
  const empty = buildIndexNowPayload(SITE, []);
  assertEquals(empty.payload, null);
  assertEquals(empty.reason, "no_urls");

  // Every URL filtered out is the same situation: nothing legitimate to send.
  const allDropped = buildIndexNowPayload(SITE, ["https://elsewhere.example/x"]);
  assertEquals(allDropped.payload, null);
  assertEquals(allDropped.reason, "no_urls");
  assertEquals(allDropped.dropped.length, 1);
});

Deno.test("a bad SITE_URL is reported, not turned into a bogus host", () => {
  const { payload, reason } = buildIndexNowPayload("desmoinesinsider.com", [
    "https://desmoinesinsider.com/events/x",
  ]);
  assertEquals(payload, null);
  assertEquals(reason, "bad_site_url");
});

Deno.test("caps at the protocol limit and reports the overflow", () => {
  const urls = Array.from({ length: INDEXNOW_MAX_URLS + 5 }, (_, i) => `${SITE}/events/e-${i}`);
  const { payload, truncated } = buildIndexNowPayload(SITE, urls);

  assert(payload);
  assertEquals(payload.urlList.length, INDEXNOW_MAX_URLS);
  assertEquals(truncated, 5);
});

Deno.test("status descriptions name the actual failure, not just the number", () => {
  // 403 and 422 are the two that will actually happen, and both mean the key
  // file is wrong or missing. A bare number in job metadata does not say that.
  assert(describeIndexNowStatus(403).includes(INDEXNOW_KEY_FILE));
  assert(describeIndexNowStatus(422).toLowerCase().includes("host"));
  assertEquals(describeIndexNowStatus(200), "accepted");
  assert(describeIndexNowStatus(999).includes("999"));
});

Deno.test("the key file exists at the host root with exactly the key as its contents", async () => {
  // The key is only valid if https://<host>/<key>.txt serves it verbatim.
  // Anything else here — a rename, a trailing newline added by an editor, a
  // formatter — turns every submission into a 403 that nothing surfaces.
  const url = new URL(`../../../public/${INDEXNOW_KEY_FILE}`, import.meta.url);
  const contents = await Deno.readTextFile(url);
  assertEquals(contents, INDEXNOW_KEY);
});
