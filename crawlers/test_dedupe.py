#!/usr/bin/env python3
"""Offline checks for the crawler's duplicate detection (WEB-SEO-017).

Run with plain python, no pytest and no crawler dependencies:

    python crawlers/test_dedupe.py

WHY IT EXISTS. The 2026-08-23 scheduled run inserted "Chef George's Steak Bar"
three times and logged "Duplicates skipped: 0". Two defects stacked:

  1. _check_duplicate compared event["venue"] raw while _insert_event wrote
     event["venue"] or event["location"] or "TBD". Every extraction carrying no
     venue was therefore checked against "", which matches no stored row - so it
     was never a duplicate however many times it was crawled.
  2. The check only ever asked the database. Two extractions of one event inside
     ONE batch both passed on any run where the first insert had not landed or
     did not match, because the check and the write disagreed about the key.

Both are pure logic over dicts, so both are catchable here rather than needing a
live page, a model call and a database. The parse paths exercised below are the
two stdlib strptime branches; date_parser is deliberately left unbound so a test
that drifted onto the dateutil branch fails loudly instead of silently
depending on a package that is not installed yet at this point in CI.
"""
import asyncio
import os
import sys

CRAWLER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "catchdesmoines_crawler.py")

PRELUDE = """
import logging, re
from datetime import datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo
from urllib.robotparser import RobotFileParser
from urllib.parse import urlsplit
from urllib.request import urlopen
logger = logging.getLogger("test")

class _Unavailable:
    def __getattr__(self, name):
        raise AssertionError(
            "the test reached dateutil; use an ISO date string so the stdlib "
            "branch of _parse_event_datetime runs instead"
        )

date_parser = _Unavailable()
Client = object

class anthropic:
    Anthropic = object

def create_client(*args, **kwargs):
    raise AssertionError("the test opened a Supabase client")
"""


def load_crawler_class():
    """Import the crawler class without crawl4ai/anthropic/supabase installed."""
    with open(CRAWLER, encoding="utf-8") as fh:
        source = fh.read()
    start = source.index("CATCHDESMOINES_BASE_URL = ")
    end = source.index("\nasync def main(")
    if end == -1:
        end = len(source)
    namespace = {}
    exec(PRELUDE + source[start:end], namespace)  # noqa: S102
    return namespace["CatchDesMoinesCrawler"]


def main():
    Crawler = load_crawler_class()
    failures = []

    def check(name, condition, detail=""):
        if condition:
            print(f"  ok    {name}")
        else:
            print(f"  FAIL  {name} {detail}")
            failures.append(name)

    def event(title, date, venue=None, location="Des Moines, IA"):
        e = {"title": title, "date": date, "location": location}
        if venue is not None:
            e["venue"] = venue
        return e

    print("derivation is shared with the insert")
    check(
        "a missing venue falls back to location",
        Crawler._record_venue(event("X", "2026-09-01")) == "Des Moines, IA",
    )
    check(
        "an EMPTY venue falls back too - the case that produced the triple insert",
        Crawler._record_venue(event("X", "2026-09-01", venue="")) == "Des Moines, IA",
    )
    check(
        "a real venue wins",
        Crawler._record_venue(event("X", "2026-09-01", venue="Wooly's")) == "Wooly's",
    )
    check(
        "an empty title gets the same placeholder the insert writes",
        Crawler._record_title({"title": ""}) == "Untitled Event",
    )
    check("both fields are truncated as the columns are",
          len(Crawler._record_venue({"venue": "v" * 300})) == 100
          and len(Crawler._record_title({"title": "t" * 300})) == 200)

    print("\nthe key")
    c = Crawler(dry_run=True)
    dt = c._parse_event_datetime("2026-09-01 19:00:00")
    # Guard first. _parse_event_datetime swallows its own exceptions and returns
    # None, and every key comparison below is trivially equal on two Nones - so
    # a broken harness makes this whole section pass green.
    check("the harness can actually parse a date", dt is not None, f"got {dt!r}")
    check("an unparseable date has no key, and is left to the insert to drop",
          c._dedupe_key(event("X", "nonsense"), None) is None)
    check(
        "case and surrounding space do not make a new event",
        c._dedupe_key(event("  Chef George's  ", "2026-09-01 19:00:00", "Wooly's"), dt)
        == c._dedupe_key(event("chef george's", "2026-09-01 19:00:00", "wooly's"), dt),
    )
    check(
        "the calendar date is part of the key",
        c._dedupe_key(event("Trivia", "2026-09-01 19:00:00", "Wooly's"), dt)
        != c._dedupe_key(
            event("Trivia", "2026-09-08 19:00:00", "Wooly's"),
            c._parse_event_datetime("2026-09-08 19:00:00"),
        ),
    )

    print("\nin-batch, the regression itself")

    async def batch(events):
        """One run of the ingest loop's check-then-insert, offline."""
        crawler = Crawler(dry_run=True)
        inserted = 0
        for e in events:
            if await crawler._check_duplicate(e):
                crawler.duplicates_skipped += 1
                continue
            if await crawler._insert_event(e):
                inserted += 1
        return inserted, crawler.duplicates_skipped

    # The exact 2026-08-23 shape: one venue, no venue field, three extractions.
    triple = [event("Chef George's Steak Bar", "2026-09-01 19:00:00") for _ in range(3)]
    inserted, skipped = asyncio.run(batch(triple))
    check("three extractions of one venueless event insert once",
          (inserted, skipped) == (1, 2), f"got {inserted} inserted / {skipped} skipped")

    dupes = [event("Trivia", "2026-09-01 19:00:00", "Wooly's")] * 2
    inserted, skipped = asyncio.run(batch(dupes))
    check("a repeated event WITH a venue is caught in-batch",
          (inserted, skipped) == (1, 1), f"got {inserted} inserted / {skipped} skipped")

    # The direction that matters more: a weekly night is many real events, and
    # a dedupe that collapses them silently deletes content.
    weekly = [
        event("Trivia", "2026-09-01 19:00:00", "Wooly's"),
        event("Trivia", "2026-09-08 19:00:00", "Wooly's"),
        event("Trivia", "2026-09-15 19:00:00", "Wooly's"),
    ]
    inserted, skipped = asyncio.run(batch(weekly))
    check("the same title at the same venue on three dates stays three events",
          (inserted, skipped) == (3, 0), f"got {inserted} inserted / {skipped} skipped")

    distinct = [
        event("Trivia", "2026-09-01 19:00:00", "Wooly's"),
        event("Trivia", "2026-09-01 19:00:00", "Lefty's"),
    ]
    inserted, skipped = asyncio.run(batch(distinct))
    check("two venues on one night stay two events",
          (inserted, skipped) == (2, 0), f"got {inserted} inserted / {skipped} skipped")

    # The date-only branch defaults to 7 PM; it must still key by day.
    dateonly = [event("Fair", "2026-09-01"), event("Fair", "2026-09-01 19:00:00")]
    inserted, skipped = asyncio.run(batch(dateonly))
    check("the date-only and datetime forms of one event agree",
          (inserted, skipped) == (1, 1), f"got {inserted} inserted / {skipped} skipped")

    print(f"\n{len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
