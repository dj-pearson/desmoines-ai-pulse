"""Fields read from a Catch Des Moines event detail page.

The crawler already fetches every detail page (for the "Visit Website" link)
and then threw the rest of it away. The page carries a schema.org Event in
ld+json with the image, the end date and the venue's geo pair, which is what
the rows it inserted were missing: no image_url (every one fell back to
og-default.png, including in Event JSON-LD), no coordinates, no end_date.

A port of the relevant parts of
supabase/functions/_shared/domain-adapters/catchdesmoinesParse.ts. Stdlib only,
so test_event_detail.py runs before the dependency install in CI.
"""
import json
import re
from datetime import datetime, time, timezone
from typing import Optional
from zoneinfo import ZoneInfo

CENTRAL_TZ = ZoneInfo("America/Chicago")

# Iowa, generously. A pair outside it is a Simpleview default or a typo.
IOWA_BOUNDS = {"min_lat": 40.3, "max_lat": 43.6, "min_lng": -96.7, "max_lng": -90.1}

_LD_JSON_RE = re.compile(
    r"""<script[^>]+type=["']application/ld\+json["'][^>]*>([\s\S]+?)</script>""", re.IGNORECASE
)
_OG_IMAGE_RES = (
    re.compile(r"""<meta[^>]+(?:property|name)=["']og:image(?::url)?["'][^>]*content=["']([^"']+)["']""", re.I),
    re.compile(r"""<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image(?::url)?["']""", re.I),
)
_HTTP_RE = re.compile(r"^https?://", re.IGNORECASE)


def _is_event_type(t) -> bool:
    if isinstance(t, list):
        return any(_is_event_type(x) for x in t)
    if not isinstance(t, str):
        return False
    return t in ("Event", "Festival", "Hackathon") or t.endswith("Event")


def _find_event(node, depth: int = 0) -> Optional[dict]:
    if depth > 4 or not node:
        return None
    if isinstance(node, list):
        for n in node:
            found = _find_event(n, depth + 1)
            if found:
                return found
        return None
    if not isinstance(node, dict):
        return None
    if _is_event_type(node.get("@type")):
        return node
    if node.get("@graph"):
        return _find_event(node["@graph"], depth + 1)
    return None


def parse_ld_json_event(html: str) -> Optional[dict]:
    """The first schema.org Event on the page, looking inside arrays and @graph."""
    for m in _LD_JSON_RE.finditer(html or ""):
        try:
            parsed = json.loads(m.group(1))
        except (ValueError, TypeError):
            continue
        found = _find_event(parsed)
        if found:
            return found
    return None


def extract_image(image) -> Optional[str]:
    """First http(s) URL from a schema.org image: a string, an object or a list."""
    for im in image if isinstance(image, list) else [image]:
        url = im if isinstance(im, str) else (im.get("url") or im.get("contentUrl")) if isinstance(im, dict) else None
        if isinstance(url, str) and _HTTP_RE.match(url.strip()):
            return url.strip()
    return None


def extract_og_image(html: str) -> Optional[str]:
    for pattern in _OG_IMAGE_RES:
        m = pattern.search(html or "")
        if m and _HTTP_RE.match(m.group(1).strip()):
            return m.group(1).strip()
    return None


def _first_place(location) -> Optional[dict]:
    for loc in location if isinstance(location, list) else [location]:
        if isinstance(loc, dict):
            return loc
    return None


def place_coordinates(place: Optional[dict]) -> dict:
    """The page's geo pair, or {} when missing, half-filled or outside Iowa."""
    geo = (place or {}).get("geo") or {}
    try:
        lat = float(geo["latitude"])
        lng = float(geo["longitude"])
    except (KeyError, TypeError, ValueError):
        return {}
    b = IOWA_BOUNDS
    if not (b["min_lat"] <= lat <= b["max_lat"] and b["min_lng"] <= lng <= b["max_lng"]):
        return {}
    return {"latitude": lat, "longitude": lng}


def parse_end_date(raw, start_utc: datetime) -> Optional[str]:
    """endDate as a UTC ISO string, or None.

    A bare date means the event runs through that day in Des Moines, so it
    ends at 23:59:59 Central. A value with no offset is Central time. Anything
    at or before the start is dropped: an end_date equal to the start says
    nothing, and one before it is wrong.
    """
    if not isinstance(raw, str) or not raw.strip():
        return None
    raw = raw.strip()
    try:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
            end = datetime.combine(datetime.strptime(raw, "%Y-%m-%d").date(), time(23, 59, 59), CENTRAL_TZ)
        else:
            end = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            if end.tzinfo is None:
                end = end.replace(tzinfo=CENTRAL_TZ)
    except ValueError:
        return None
    end_utc = end.astimezone(timezone.utc)
    if end_utc <= start_utc:
        return None
    return end_utc.isoformat()


def detail_fields(html: str) -> dict:
    """What the detail page adds to a row: image_url, the raw endDate, the
    venue name the page states, and the page's own geo pair."""
    ev = parse_ld_json_event(html) or {}
    place = _first_place(ev.get("location"))
    out = {}
    image = extract_image(ev.get("image")) or extract_og_image(html)
    if image:
        out["image_url"] = image
    if isinstance(ev.get("endDate"), str):
        out["end_date_raw"] = ev["endDate"]
    if place and isinstance(place.get("name"), str) and place["name"].strip():
        out["place_name"] = place["name"].strip()
    coords = place_coordinates(place)
    if coords:
        out["source_coordinates"] = coords
    return out
