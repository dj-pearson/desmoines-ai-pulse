#!/usr/bin/env python3
"""Offline checks for the crawler's category normalization (WEB-BE-049).

Run with plain python, no pytest and no crawler dependencies:

    python crawlers/test_categories.py

WHY IT EXISTS. This crawler is the fourth runtime that has to agree on what an
event category is, and it is the one nobody remembers: it writes to `events`
directly with a service-role key, so nothing in the edge functions sees its
rows. Its prompt used to ask for a six-word vocabulary that differed from the
shared prompt's six-word vocabulary, and the shared prompt's own example then
used "Concert", a word in neither list. That is how "Concert" got into the
table and why src/pseo/listingFilters.ts has to match categories with regexes.

The point of these checks is not that normalize_category has the right opinion
about any one label - it is that the crawler and the edge functions read THE
SAME FILE and therefore cannot drift apart again.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CRAWLER = os.path.join(HERE, "catchdesmoines_crawler.py")
SHARED_JSON = os.path.join(HERE, "..", "supabase", "functions", "_shared", "eventCategories.json")

PRELUDE = """
import json, logging, os, re
from datetime import datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo
from urllib.robotparser import RobotFileParser
from urllib.parse import urlsplit
from urllib.request import urlopen
logger = logging.getLogger("test")

class _Unavailable:
    def __getattr__(self, name):
        raise AssertionError("the test reached an unstubbed dependency")

date_parser = _Unavailable()
Client = object

class anthropic:
    Anthropic = object

def create_client(*args, **kwargs):
    raise AssertionError("the test opened a Supabase client")
"""


def load_module():
    with open(CRAWLER, encoding="utf-8") as fh:
        source = fh.read()
    start = source.index("CATCHDESMOINES_BASE_URL = ")
    end = source.index("\nasync def main(")
    namespace = {}
    exec(PRELUDE + source[start:end], namespace)  # noqa: S102
    return namespace


def main():
    # cwd-independent: the resolver has to find the JSON from the repo root too.
    os.chdir(os.path.join(HERE, ".."))
    mod = load_module()
    normalize = mod["normalize_category"]
    categories = mod["EVENT_CATEGORIES"]
    failures = []

    def check(name, condition, detail=""):
        if condition:
            print(f"  ok    {name}")
        else:
            print(f"  FAIL  {name} {detail}")
            failures.append(name)

    with open(SHARED_JSON, encoding="utf-8") as fh:
        shared = json.load(fh)

    print("one vocabulary, read from one file")
    check(
        "the crawler loaded the shared list rather than the degraded fallback",
        categories == shared["categories"],
        f"got {categories}",
    )
    check("the fallback matches too", mod["FALLBACK_CATEGORY"] == shared["fallback"])
    check(
        "the prompt advertises the same vocabulary it will be held to",
        mod["CATEGORY_VOCABULARY"] == "/".join(shared["categories"]),
    )

    print("\nnormalization")
    check("a canonical value is returned unchanged", normalize("Music") == "Music")
    check("case and padding do not matter", normalize("  sports ") == "Sports")
    check("the word that started this maps somewhere real", normalize("Concert") == "Music")
    check("a submission-form label folds in", normalize("Family & Kids") == "Family")
    check("so does the one with an ampersand and two words", normalize("Food & Dining") == "Food")
    check(
        "'General' - three writers' default - is not preserved",
        normalize("General") == shared["fallback"],
    )
    check("an unknown label becomes the fallback", normalize("Sale-A-Bration") == shared["fallback"])

    print("\nword prefixes, not substrings")
    # A plain `in` filed all of these under Arts because they contain "art".
    check("'Block Party' is not an arts event", normalize("Block Party") == shared["fallback"])
    check("'Startup Expo' is a business event", normalize("Startup Expo") == "Business")
    check("'Artist Showcase' still is an arts event", normalize("Artist Showcase") == "Arts")
    check("'Job Fair' beats the festival group on order", normalize("Job Fair") == "Business")
    # A keyword that is not plain letters is matched whole; the token split
    # would have torn "stand-up" in half and left it dead.
    check("'Stand-Up Night' reaches the comedy group", normalize("Stand-Up Night") == "Comedy")
    check("'Trade Show' is business, not a show", normalize("Trade Show") == "Business")
    check("'Farmers Market' is its own category", normalize("Farmers Market") == "Markets")

    print("\ntotality: no input escapes the vocabulary")
    for value in ["", "   ", None, 42, [], {}, "Music", "nonsense", "Live Music"]:
        result = normalize(value)
        check(f"{value!r} -> {result!r}", result in shared["categories"])

    print(f"\n{len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
