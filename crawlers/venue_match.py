"""Known-venue matching for the Python crawler (WEB-BE-050, WEB-BE-039).

A port of supabase/functions/_shared/venueMatch.ts and the coordinate helpers
in _shared/knownVenues.ts. CLAUDE.md requires every ingestion path to match a
known venue and take its coordinates at ingest; the two edge scrapers did, and
this crawler - the one path that actually runs daily - wrote no coordinates at
all, so every event it inserted was missing from the map until a nightly
backfill (itself failing) caught up.

Keep it in step with venueMatch.ts. The rules are strict on purpose: a match
overwrites a pin on a map, and a wrong pin is worse than none. Stdlib only, so
test_venue_match.py runs in the no-dependency block of event-crawler.yml.
"""
import math
import re
from typing import Iterable, Optional

MIN_PARTIAL_LENGTH = 5
MIN_COVERAGE = 0.5

_ALNUM = re.compile(r"[a-z0-9]")


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").lower().strip())


def _contains_word(haystack: str, needle: str) -> bool:
    if not needle:
        return False
    i = haystack.find(needle)
    if i == -1:
        return False
    before = " " if i == 0 else haystack[i - 1]
    after_idx = i + len(needle)
    after = " " if after_idx >= len(haystack) else haystack[after_idx]
    return not _ALNUM.match(before) and not _ALNUM.match(after)


def _partial_matches(search_text: str, candidate: str) -> bool:
    if len(search_text) < MIN_PARTIAL_LENGTH:
        return False
    if _contains_word(candidate, search_text):
        return len(search_text) / len(candidate) >= MIN_COVERAGE
    if _contains_word(search_text, candidate):
        return len(candidate) / len(search_text) >= MIN_COVERAGE
    return False


def match_known_venue(venue_name: str, venues: Iterable[dict]) -> Optional[dict]:
    """The first venue that matches: exact name, exact alias, then a partial
    that earns it. None rather than a best guess."""
    search_text = _norm(venue_name)
    if not search_text:
        return None
    venues = list(venues)

    for venue in venues:
        if _norm(venue.get("name", "")) == search_text:
            return venue
    for venue in venues:
        for alias in venue.get("aliases") or []:
            if _norm(alias) == search_text:
                return venue
    for venue in venues:
        if _partial_matches(search_text, _norm(venue.get("name", ""))):
            return venue
        for alias in venue.get("aliases") or []:
            if _partial_matches(search_text, _norm(alias)):
                return venue
    return None


def _number(value) -> Optional[float]:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str) and value.strip():
        try:
            return float(value)
        except ValueError:
            return None
    return None


def venue_coordinates(pair: Optional[dict]) -> dict:
    """{latitude, longitude} to spread into a row, or {}. Both or neither, and
    never (0, 0), which is what a coerced null looks like."""
    if not pair:
        return {}
    lat = _number(pair.get("latitude"))
    lng = _number(pair.get("longitude"))
    if lat is None or lng is None or not math.isfinite(lat) or not math.isfinite(lng):
        return {}
    if lat == 0 and lng == 0:
        return {}
    return {"latitude": lat, "longitude": lng}


def ingest_coordinates(venue: Optional[dict], source: Optional[dict]) -> dict:
    """The known venue's curated pair, else the pair the page published, else {}."""
    from_venue = venue_coordinates(venue)
    if from_venue:
        return from_venue
    return venue_coordinates(source)
