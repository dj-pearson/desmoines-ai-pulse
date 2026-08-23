#!/usr/bin/env python3
"""Offline checks for clean_html_for_extraction (WEB-SEO-017).

Run with plain python, no pytest and no crawler dependencies:

    python crawlers/test_clean_html.py

WHY IT EXISTS. The crawler ran green for six months and ingested nothing. The
API call succeeded, Claude returned an empty array, and the run logged
"Extraction errors: 0" - because the crawler had handed the model the first
50,000 characters of a 430,862-character page, ending 144,134 characters before
the first event link. Nothing failed. Nothing was extracted.

That is not a failure any end-to-end run can catch cheaply: it needs a live
page, a model call and a database. It IS catchable here, because the defect is
entirely in one pure function over a string.

The fixture is synthetic and its shape is copied from the measured page rather
than the page itself: a large attribute-heavy preamble carrying no events, then
the event cards. Committing 430 KB of someone else's HTML to assert one
property would be the expensive way to make the same point.
"""
import os
import re
import sys

CRAWLER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "catchdesmoines_crawler.py")


# The module-level region between these two markers is pure logic - regexes,
# the HTML cleaner, the robots helpers - and none of it needs crawl4ai,
# anthropic or supabase. Exec'ing just that region is what lets these tests run
# on a bare python with no install step, which is the only reason they can sit
# in front of the five-minute dependency setup in CI.
PRELUDE = """
import logging, re
from typing import Optional
from urllib.robotparser import RobotFileParser
from urllib.parse import urlsplit
from urllib.request import urlopen
logger = logging.getLogger("test")
"""


def load_cleaner():
    """Import the pure helpers without importing crawl4ai/anthropic/supabase."""
    with open(CRAWLER, encoding="utf-8") as fh:
        source = fh.read()
    start = source.index("EVENT_LINK_RE = re.compile")
    end = source.index("class CatchDesMoinesCrawler:")
    namespace = {}
    exec(PRELUDE + source[start:end], namespace)  # noqa: S102
    return namespace


def build_fixture():
    """A page shaped like the real listing: heavy preamble, then event cards."""
    # ~200 KB of navigation carrying no events - class lists, srcset, data
    # attributes, inline svg. On the real page this is 194,134 characters
    # holding 13,900 characters of visible text.
    nav_item = (
        '<li class="nav__item nav__item--primary" data-track="nav" data-id="{i}">'
        '<a class="nav__link" href="/things-to-do/category-{i}/" '
        'data-analytics=\'{{"module":"nav","position":{i}}}\'>'
        '<svg viewBox="0 0 24 24" class="icon icon--chevron" aria-hidden="true">'
        '<path d="M9 18l6-6-6-6"/></svg><span class="nav__label">Category {i}</span></a></li>'
    )
    preamble = "".join(nav_item.format(i=i) for i in range(800))

    card = (
        '<article class="event-card" data-event-id="{id}">'
        '<img class="event-card__img" src="/x{id}.jpg" srcset="/x{id}-320.jpg 320w, /x{id}-640.jpg 640w">'
        '<h3 class="event-card__title"><a href="/event/example-event-{i}/{id}/">Example Event {i}</a></h3>'
        '<p class="event-card__date">Aug {day}, 2026</p>'
        '<p class="event-card__venue">Venue {i}</p>'
        "</article>"
    )
    cards = "".join(card.format(i=i, id=50000 + i, day=1 + (i % 28)) for i in range(12))

    return (
        "<html><head><title>Events</title>"
        '<style>.a{color:red}</style><script>window.x=1</script></head>'
        f'<body><nav class="nav">{preamble}</nav>'
        f'<main><section class="results">{cards}</section></main>'
        "</body></html>"
    )


def old_strategy(html):
    """What the crawler did before: strip script/style, take the first 50k."""
    cleaned = re.sub(r"<script[^>]*>[\s\S]*?</script>", "", html, flags=re.IGNORECASE)
    cleaned = re.sub(r"<style[^>]*>[\s\S]*?</style>", "", cleaned, flags=re.IGNORECASE)
    return cleaned[:50000]


def main():
    ns = load_cleaner()
    clean = ns["clean_html_for_extraction"]
    link_re = ns["EVENT_LINK_RE"]
    max_chars = ns["MAX_EXTRACTION_CHARS"]

    html = build_fixture()
    failures = []

    def check(name, condition, detail=""):
        if condition:
            print(f"  ok    {name}")
        else:
            print(f"  FAIL  {name} {detail}")
            failures.append(name)

    print(f"fixture: {len(html)} chars")

    # The control. If this ever starts passing, the fixture stopped reproducing
    # the shape of the page and the rest of the file proves nothing.
    old_links = link_re.findall(old_strategy(html))
    check(
        "the old first-50k window sees no events at all",
        len(old_links) == 0,
        f"(saw {len(old_links)})",
    )

    cleaned = clean(html)
    links = link_re.findall(cleaned)
    check("the cleaner surfaces every event card", len(set(links)) == 12, f"(saw {len(set(links))})")
    check("cleaning shrinks the page by more than half", len(cleaned) < len(html) / 2,
          f"({len(html)} -> {len(cleaned)})")
    check("output fits the extraction budget", len(cleaned) <= max_chars,
          f"({len(cleaned)} > {max_chars})")
    check("href survives, because detail_url lives nowhere else",
          '/event/example-event-0/50000/' in cleaned)
    check("titles survive", "Example Event 11" in cleaned)
    check("class attributes are gone", 'class="event-card"' not in cleaned)
    check("inline svg is gone", "<svg" not in cleaned and "viewBox" not in cleaned)
    check("scripts and styles are gone", "window.x" not in cleaned and "color:red" not in cleaned)

    # An oversized page must keep the events, not the head of the document.
    padded = html.replace("<main>", "<main>" + ("<div class='pad'>x</div>" * 40000), 1)
    windowed = clean(padded)
    check(
        "an oversized page is windowed onto the events, not the preamble",
        len(link_re.findall(windowed)) > 0,
        "(window landed before the first event link)",
    )

    # --- robots.txt ---------------------------------------------------------
    # WEB-SEC-024 covers supabase/functions/_shared/scraper.ts. This crawler is
    # the one ingestion path that does not go through it, so it needed its own
    # check - and WEB-LEGAL-008's disclosure has to be true of every path.
    parse_robots = ns["parse_robots"]

    allow_all = parse_robots("User-agent: *\nAllow: /\nCrawl-delay: 2\n")
    deny_all = parse_robots("User-agent: *\nDisallow: /\n")
    deny_events = parse_robots("User-agent: *\nDisallow: /events/\n")

    check(
        "an explicit Disallow blocks",
        not deny_all.can_fetch("*", "https://example.com/events/"),
    )
    check(
        "a path-scoped Disallow blocks only that path",
        not deny_events.can_fetch("*", "https://example.com/events/")
        and deny_events.can_fetch("*", "https://example.com/about"),
    )
    check("Allow: / permits", allow_all.can_fetch("*", "https://example.com/events/"))
    check("the declared Crawl-delay is read", allow_all.crawl_delay("*") == 2)

    # The load-bearing direction. An unparseable or absent file must ALLOW: the
    # opposite turns one flaky fetch into a silent ingestion halt, and this
    # pipeline reports "0 events" the same way whether it was blocked or broken.
    junk = parse_robots("<html>404 not found</html>")
    check("an unparseable robots.txt does not block", junk.can_fetch("*", "https://example.com/events/"))
    check("an empty robots.txt does not block", parse_robots("").can_fetch("*", "https://example.com/x"))

    print(f"\n{len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
