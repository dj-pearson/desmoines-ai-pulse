#!/usr/bin/env python3
"""Offline checks for how far the crawl walks the listing (WEB-BE-051).

    python crawlers/test_crawl_horizon.py

Five pages of twelve was about 60 events, a few days of the calendar, so a show
months out was only ingested when it was close and the month pages had nothing
to list. The walk now goes further and stops on its own: at the end of the
listing, or when the time budget is spent.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = open(os.path.join(HERE, "catchdesmoines_crawler.py"), encoding="utf-8").read()


def load_helper():
    start = SOURCE.index("def page_adds_new_events(")
    end = SOURCE.index("\nclass CatchDesMoinesCrawler")
    ns = {}
    exec(SOURCE[start:end], ns)  # noqa: S102
    return ns["page_adds_new_events"]


def constant(name):
    m = re.search(rf"^{name} = ([0-9.]+)", SOURCE, re.M)
    return float(m.group(1)) if m else None


def main():
    failures = []

    def check(name, cond, detail=""):
        print(f"  {'ok  ' if cond else 'FAIL'}  {name} {detail if not cond else ''}")
        if not cond:
            failures.append(name)

    page_adds_new_events = load_helper()
    seen = set()
    p1 = [{"detail_url": "/event/a/1/"}, {"detail_url": "/event/b/2/"}]
    check("first page is new", page_adds_new_events(p1, seen))
    check("the same page again is the end", not page_adds_new_events(p1, seen))
    check("trailing slash and case do not make a link new",
          not page_adds_new_events([{"detail_url": "/EVENT/A/1"}], seen))
    check("one new link is enough", page_adds_new_events(p1 + [{"detail_url": "/event/c/3/"}], seen))
    check("an event with no link is not proof of the end", page_adds_new_events([{"title": "x"}], seen))
    check("an empty page adds nothing", not page_adds_new_events([], seen))

    check("default horizon is well past 5 pages", (constant("DEFAULT_MAX_PAGES") or 0) >= 15)
    check("a time budget exists", (constant("DEFAULT_TIME_BUDGET_MINUTES") or 0) > 0)
    workflow = open(os.path.join(HERE, "..", ".github", "workflows", "event-crawler.yml"), encoding="utf-8").read()
    budget = re.search(r"--time-budget-minutes (\d+)", workflow)
    timeout = re.search(r"timeout-minutes: (\d+)", workflow)
    check("the workflow passes a budget", budget is not None)
    check(
        "the job timeout leaves room for setup after the budget",
        budget and timeout and int(timeout.group(1)) >= int(budget.group(1)) + 10,
        f"budget={budget and budget.group(1)} timeout={timeout and timeout.group(1)}",
    )

    if failures:
        print(f"\n{len(failures)} check(s) failed")
        sys.exit(1)
    print("\nall checks passed")


if __name__ == "__main__":
    main()
