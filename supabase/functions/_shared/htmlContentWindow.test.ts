/**
 * Unit tests for content preparation / event-density windowing.
 * Run with: `deno test --allow-none supabase/functions/_shared/htmlContentWindow.test.ts`
 *
 * The regression these pin: the old code kept the FIRST N characters of a page,
 * which on a real venue site is head/nav/hero and contains no events at all.
 */
import {
  eventSignalCount,
  prepareContentForExtraction,
  scopeToContentRegion,
  stripPageChrome,
  windowOnEventDensity,
} from "./htmlContentWindow.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

/** Filler with no event signals whatsoever — stands in for head/nav/hero copy. */
function chrome(chars: number): string {
  return "x".repeat(chars);
}

/** A block of realistic event cards. */
function eventCards(count: number): string {
  return Array.from(
    { length: count },
    (_, i) =>
      `<article><h3>Show ${i}</h3>` +
      `<time datetime="2026-09-${String((i % 28) + 1).padStart(2, "0")}T19:30">Sep ${i + 1}</time>` +
      `<a href="/event/show-${i}/">Buy Tickets</a></article>`,
  ).join("");
}

Deno.test("chrome that never carries events is stripped", () => {
  const html = `<html>
    <head><title>Venue</title><style>.a{color:red}</style>
      <script>var x = 1;</script>
      <meta property="og:image" content="https://x.com/a.jpg"></head>
    <body>
      <nav><a href="/about">About</a><a href="/contact">Contact</a></nav>
      <main><article><h3>Real Show</h3><a href="/event/real/">Tickets</a></article></main>
      <form><input name="newsletter"></form>
      <footer><a href="/privacy">Privacy</a></footer>
      <!-- a comment -->
    </body></html>`;

  const stripped = stripPageChrome(html);
  assert(!stripped.includes("<script"), "scripts gone");
  assert(!stripped.includes("<style"), "styles gone");
  assert(!stripped.includes("og:image"), "head gone");
  assert(!stripped.includes("/about"), "nav gone");
  assert(!stripped.includes("/privacy"), "footer gone");
  assert(!stripped.includes("newsletter"), "forms gone");
  assert(!stripped.includes("a comment"), "comments gone");
  assert(stripped.includes("Real Show"), "the event survives");
});

Deno.test("href / src / datetime survive attribute collapsing", () => {
  // These carry the per-event URL, the image and the exact start time — losing
  // them is how the crawl ended up with listing-page URLs and no images.
  const html =
    `<body><article class="card tribe-event" style="color:red" role="listitem" aria-label="x">` +
    `<a href="/event/show/" target="_blank" rel="noopener">Show</a>` +
    `<img src="/img/show.jpg" class="thumb">` +
    `<time datetime="2026-09-14T19:30:00">Sep 14</time></article></body>`;

  const stripped = stripPageChrome(html);
  assert(stripped.includes('href="/event/show/"'), "href kept");
  assert(stripped.includes('src="/img/show.jpg"'), "src kept");
  assert(stripped.includes('datetime="2026-09-14T19:30:00"'), "datetime kept");
  assert(!stripped.includes("tribe-event"), "class dropped");
  assert(!stripped.includes("color:red"), "style dropped");
  assert(!stripped.includes("aria-label"), "aria dropped");
  assert(!stripped.includes("noopener"), "rel dropped");
});

Deno.test("single-quoted attributes are collapsed too", () => {
  const stripped = stripPageChrome(`<body><div class='card' style='x'>hi</div></body>`);
  assert(!stripped.includes("card"), "single-quoted class dropped");
});

Deno.test("scoping prefers <main>, then article runs, then <body>", () => {
  const withMain = `<body>${chrome(2000)}<main>${eventCards(10)}</main>${chrome(2000)}</body>`;
  const scopedMain = scopeToContentRegion(withMain);
  assert(scopedMain.includes("Show 0"), "main content kept");
  assert(!scopedMain.includes("xxxx"), "surrounding filler dropped");

  const articlesOnly = `<body>${chrome(2000)}${eventCards(10)}${chrome(2000)}</body>`;
  const scopedArticles = scopeToContentRegion(articlesOnly);
  assert(scopedArticles.includes("Show 9"), "article run kept");
  assert(!scopedArticles.includes("xxxx"), "filler dropped");

  // A region smaller than the 500-char floor is treated as "not the calendar",
  // so scoping falls through rather than throwing away the rest of the page.
  const thinMain = `<body>${chrome(2000)}<main>${eventCards(1)}</main></body>`;
  assert(
    scopeToContentRegion(thinMain).includes("xxxx"),
    "a too-small region does not win; body is kept",
  );

  // Neither present: fall back to body rather than dropping content.
  const plain = `<body><div>${chrome(1000)}</div></body>`;
  assert(scopeToContentRegion(plain).length > 500, "body fallback");

  // Nothing substantial: return input unchanged, never empty.
  const tiny = `<body><main>hi</main></body>`;
  assert(scopeToContentRegion(tiny) === tiny, "tiny input unchanged");
});

Deno.test("windowing lands on the events, not the front of the page", () => {
  // The exact failure mode: 20k of chrome, then the calendar. Taking the front
  // 5k would have yielded zero event signals.
  const content = chrome(20_000) + eventCards(60);
  const windowed = windowOnEventDensity(content, 5_000);

  assert(windowed.length === 5_000, `budget respected, got ${windowed.length}`);
  assert(eventSignalCount(windowed) > 0, "the window contains events");
  assert(
    eventSignalCount(windowed) > eventSignalCount(content.substring(0, 5_000)),
    "strictly better than taking the front",
  );
  assert(
    eventSignalCount(content.substring(0, 5_000)) === 0,
    "sanity: the front really has no events",
  );
});

Deno.test("content already inside budget is returned untouched", () => {
  const small = eventCards(2);
  assert(windowOnEventDensity(small, 15_000) === small, "unchanged");
});

Deno.test("end-to-end: a realistic page yields the calendar within budget", () => {
  const page = `<html><head>${
    "<link rel='preload' href='/a.css'>".repeat(200)
  }</head><body>
    <nav>${chrome(3000)}</nav>
    <div class="hero">${chrome(8000)}</div>
    <main>${eventCards(40)}</main>
    <footer>${chrome(3000)}</footer>
  </body></html>`;

  const prepared = prepareContentForExtraction(page, { budget: 4_000 });
  assert(prepared.length <= 4_000, `budget respected, got ${prepared.length}`);
  assert(prepared.includes("/event/"), "per-event links present");
  assert(prepared.includes("datetime="), "start times present");
  assert(!prepared.includes("preload"), "head chrome gone");
});

Deno.test("markdown input skips HTML stripping but is still windowed", () => {
  const markdown = "filler ".repeat(3000) +
    "\n## Sep 14 — Some Band 7:30 pm — Buy Tickets\n".repeat(50);
  const prepared = prepareContentForExtraction(markdown, {
    budget: 2_000,
    isHtml: false,
  });
  assert(prepared.length <= 2_000, "budget respected");
  assert(prepared.includes("Buy Tickets"), "landed on the event section");
});

Deno.test("empty and tiny inputs are handled without throwing", () => {
  assert(prepareContentForExtraction("") === "", "empty string");
  assert(prepareContentForExtraction("<body>hi</body>").includes("hi"), "tiny page");
});
