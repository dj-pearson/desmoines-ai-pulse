#!/usr/bin/env python3
"""Offline checks for the crawler's LIKE-pattern escaping and its
duplicate-check failure policy (WEB-BE-048).

Run with plain python, no pytest and no crawler dependencies:

    python crawlers/test_like_escape.py

WHY IT EXISTS. _check_duplicate passes a scraped title and venue to .ilike(),
where they are PATTERNS, not values. One stored title already carries a literal
percent ("Monday Pop Up Hours and 10% Bourbon"), and in an ilike that percent
matches anything - so the check can report a duplicate that is not one. It
gates the insert, so a false match silently drops a real event.

The second half is the opposite failure. `except: return False` meant "not a
duplicate", so one PostgREST hiccup re-inserted every event in the batch. This
check is the only thing between a re-crawl and a duplicate row.

The escaping has to stay in step with sanitizeLikeInput in
supabase/functions/_shared/validation.ts, because the same titles pass through
both paths - so the cases below are asserted against that file's rules, not
just against themselves.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CRAWLER = os.path.join(HERE, "catchdesmoines_crawler.py")
TS_VALIDATION = os.path.join(
    HERE, "..", "supabase", "functions", "_shared", "validation.ts"
)


def load_sanitizer():
    """Exec just the helper, so no crawler dependency is needed."""
    with open(CRAWLER, encoding="utf-8") as fh:
        src = fh.read()
    start = src.index("def sanitize_like")
    end = src.index("def normalize_category")
    namespace = {}
    exec(src[start:end], namespace)  # noqa: S102
    return namespace["sanitize_like"], src


def main():
    sanitize, crawler_src = load_sanitizer()
    failures = []

    def check(name, condition, detail=""):
        if condition:
            print(f"  ok    {name}")
        else:
            print(f"  FAIL  {name} {detail}")
            failures.append(name)

    print("wildcards are escaped")
    check("a literal percent stops being a wildcard",
          sanitize("10% Bourbon") == "10\\% Bourbon")
    check("an underscore stops being a single-character wildcard",
          sanitize("a_b") == "a\\_b")
    check("a backslash is escaped FIRST, or it escapes the escapes",
          sanitize("back\\slash") == "back\\\\slash")
    check("a percent after a backslash survives both passes",
          sanitize("50\\%") == "50\\\\\\%")

    print("\nwhat is deliberately NOT stripped")
    # Measured against production: venue ilike with the apostrophe returns 44
    # rows, the stripped form returns 0.
    check("an apostrophe is kept", sanitize("Chef George's") == "Chef George's")
    check("a semicolon still goes", sanitize("semi;colon") == "semicolon")

    print("\ntotality")
    for value in [None, 42, [], "", "   "]:
        check(f"{value!r} -> ''", sanitize(value) == "")
    check("the length cap is applied", len(sanitize("x" * 900)) == 500)

    print("\nit stays in step with the TypeScript helper")
    with open(TS_VALIDATION, encoding="utf-8") as fh:
        ts = fh.read()
    body = ts[ts.index("export function sanitizeLikeInput"):]
    body = body[: body.index("\n}")]
    for token, label in [
        (r"replace\(/\\\\/g", "backslash"),
        (r"replace\(/%/g", "percent"),
        (r"replace\(/_/g", "underscore"),
        (r"replace\(/;/g", "semicolon"),
    ]:
        check(
            f"sanitizeLikeInput still handles the {label}",
            re.search(token, body) is not None,
            "- if it stopped, this port is now wrong",
        )
    check(
        "sanitizeLikeInput still keeps apostrophes",
        "APOSTROPHES ARE KEPT" in body,
    )

    print("\nthe duplicate check is used as a pattern, and escaped")
    check(
        "the title pattern is sanitized",
        'sanitize_like(self._record_title(event))' in crawler_src,
    )
    check(
        "the venue pattern is sanitized",
        'sanitize_like(self._record_venue(event))' in crawler_src,
    )

    print("\na failed duplicate check skips rather than inserts")
    # `except: return False` meant "not a duplicate", so one PostgREST hiccup
    # re-inserted the whole batch.
    tail = crawler_src[crawler_src.index("async def _check_duplicate"):]
    tail = tail[: tail.index("async def _insert_event")]
    check(
        "the except branch returns True (skip), not False (insert)",
        re.search(r"except Exception as e:[\s\S]*?return True", tail) is not None,
    )
    check(
        "and it is counted as an error rather than a duplicate",
        "self.duplicate_check_errors += 1" in tail,
    )
    check(
        "the counter is reported in the run summary",
        '"duplicate_check_errors": self.duplicate_check_errors' in crawler_src,
    )

    print(f"\n{len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
