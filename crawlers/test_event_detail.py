#!/usr/bin/env python3
"""Offline checks for what the crawler reads off a detail page and writes (WEB-BE-050).

    python crawlers/test_event_detail.py

The crawler inserted rows with no image_url, no coordinates and no end_date,
though it fetched every detail page and the page carries all three in its
ld+json. Stdlib only, like the other checks in the no-dependency CI block.
"""
import os
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from event_detail import detail_fields, parse_end_date  # noqa: E402
from venue_match import ingest_coordinates, match_known_venue, venue_coordinates  # noqa: E402

VENUES = [
    {"name": "Hoyt Sherman Place", "aliases": ["Hoyt Sherman Theater"], "latitude": 41.5886, "longitude": -93.6437},
    {"name": "Principal Park", "aliases": [], "latitude": 41.5791, "longitude": -93.6166},
    {"name": "Iowa Events Center", "aliases": [], "latitude": 41.5913, "longitude": -93.6219},
    {"name": "Nowhere Hall", "aliases": [], "latitude": None, "longitude": None},
]

DETAIL_HTML = """
<html><head>
<meta property="og:image" content="https://cdn.example.com/og.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
  {"@type":"WebPage","name":"x"},
  {"@type":"MusicEvent","name":"Jazz Night","startDate":"2026-10-03T19:00:00-05:00",
   "endDate":"2026-10-05","image":[{"url":"https://cdn.example.com/jazz.jpg"}],
   "location":{"@type":"Place","name":"Hoyt Sherman Place",
     "geo":{"latitude":"41.5887","longitude":"-93.6438"}}}]}</script>
</head><body></body></html>
"""

START = datetime(2026, 10, 4, 0, 0, tzinfo=timezone.utc)  # 7pm Central on Oct 3


def load_enricher():
    """The crawler's _detail_record_fields, without its third-party imports."""
    import re
    source = open(os.path.join(HERE, "catchdesmoines_crawler.py"), encoding="utf-8").read()
    start = source.index("CATCHDESMOINES_BASE_URL = ")
    end = source.index("\nasync def main(")
    prelude = (
        "import json, logging, os, re\n"
        "from datetime import datetime\nfrom typing import Optional\nfrom zoneinfo import ZoneInfo\n"
        "from urllib.robotparser import RobotFileParser\nfrom urllib.parse import urlsplit\n"
        "from urllib.request import urlopen\n"
        "from event_detail import detail_fields, parse_end_date\n"
        "from venue_match import ingest_coordinates, match_known_venue\n"
        "logger = logging.getLogger('test')\ndate_parser = None\nClient = object\n"
        "class anthropic:\n    Anthropic = object\n"
        "def create_client(*a, **k):\n    raise AssertionError('opened a Supabase client')\n"
    )
    ns = {}
    exec(prelude + source[start:end], ns)  # noqa: S102
    return ns["CatchDesMoinesCrawler"]


def main():
    failures = []

    def check(name, cond, detail=""):
        print(f"  {'ok  ' if cond else 'FAIL'}  {name} {detail if not cond else ''}")
        if not cond:
            failures.append(name)

    print("venue matching (mirrors venueMatch.ts)")
    check("exact name", match_known_venue("hoyt sherman place", VENUES) is VENUES[0])
    check("alias", match_known_venue("Hoyt Sherman Theater", VENUES) is VENUES[0])
    check("partial with coverage", match_known_venue("Hoyt Sherman", VENUES) is VENUES[0])
    check("longer text containing the venue", match_known_venue("Principal Park, Des Moines", VENUES) is VENUES[1])
    check("a common noun is refused", match_known_venue("Park", VENUES) is None)
    check("low coverage is refused", match_known_venue("Center", VENUES) is None)
    check("no word boundary is refused", match_known_venue("Hall", [{"name": "Marshalltown Arena"}]) is None)
    check("empty text", match_known_venue("  ", VENUES) is None)

    print("coordinates")
    check("both or neither", venue_coordinates({"latitude": 41.5, "longitude": None}) == {})
    check("(0, 0) refused", venue_coordinates({"latitude": 0, "longitude": 0}) == {})
    check("venue wins over source", ingest_coordinates(VENUES[1], {"latitude": 41.6, "longitude": -93.6})["latitude"] == 41.5791)
    check("source when the venue has none", ingest_coordinates(VENUES[3], {"latitude": 41.6, "longitude": -93.6}) == {"latitude": 41.6, "longitude": -93.6})
    check("source when nothing matched", ingest_coordinates(None, {"latitude": "41.6", "longitude": "-93.6"}) == {"latitude": 41.6, "longitude": -93.6})

    print("detail page")
    d = detail_fields(DETAIL_HTML)
    check("ld+json image beats og:image", d.get("image_url") == "https://cdn.example.com/jazz.jpg", str(d))
    check("finds the Event inside @graph", d.get("end_date_raw") == "2026-10-05", str(d))
    check("place name", d.get("place_name") == "Hoyt Sherman Place")
    check("geo pair", d.get("source_coordinates") == {"latitude": 41.5887, "longitude": -93.6438})
    og_only = detail_fields('<meta content="https://cdn.example.com/og.jpg" property="og:image">')
    check("og:image fallback", og_only.get("image_url") == "https://cdn.example.com/og.jpg", str(og_only))
    outside = detail_fields('<script type="application/ld+json">{"@type":"Event","location":{"geo":{"latitude":0,"longitude":0}}}</script>')
    check("a pair outside Iowa is dropped", "source_coordinates" not in outside)
    check("malformed ld+json is skipped", detail_fields('<script type="application/ld+json">{nope</script>') == {})

    print("end date")
    check("bare date runs through the day in Central", parse_end_date("2026-10-05", START) == "2026-10-06T04:59:59+00:00")
    check("offset honoured", parse_end_date("2026-10-03T22:00:00-05:00", START) == "2026-10-04T03:00:00+00:00")
    check("naive time is Central", parse_end_date("2026-10-03T22:00:00", START) == "2026-10-04T03:00:00+00:00")
    check("end before start dropped", parse_end_date("2026-10-02", START) is None)
    check("end equal to start dropped", parse_end_date("2026-10-04T00:00:00Z", START) is None)
    check("garbage dropped", parse_end_date("next Tuesday", START) is None)

    print("the row")
    Crawler = load_enricher()
    c = Crawler(dry_run=True)
    c.known_venues = VENUES
    fields = c._detail_record_fields({"venue": "Hoyt Sherman", "_detail": d}, START)
    check("image_url written", fields.get("image_url") == "https://cdn.example.com/jazz.jpg")
    check("end_date written", fields.get("end_date") == "2026-10-06T04:59:59+00:00")
    check("known venue's curated pair written", fields.get("latitude") == 41.5886 and fields.get("longitude") == -93.6437, str(fields))
    fields = c._detail_record_fields({"venue": "Someplace New", "_detail": d}, START)
    check("falls back to the page's place name", fields.get("latitude") == 41.5886, str(fields))
    fields = c._detail_record_fields({"venue": "Someplace New"}, START)
    check("no detail, no match: nothing invented", fields == {}, str(fields))

    if failures:
        print(f"\n{len(failures)} check(s) failed")
        sys.exit(1)
    print("\nall checks passed")


if __name__ == "__main__":
    main()
