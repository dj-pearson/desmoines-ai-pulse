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
    ns = {"re": re}
    exec(SOURCE[start:end], ns)  # noqa: S102
    return ns


def constant(name):
    m = re.search(rf"^{name} = ([0-9.]+)", SOURCE, re.M)
    return float(m.group(1)) if m else None


def main():
    failures = []

    def check(name, cond, detail=""):
        print(f"  {'ok  ' if cond else 'FAIL'}  {name} {detail if not cond else ''}")
        if not cond:
            failures.append(name)

    helpers = load_helper()
    page_adds_new_events = helpers["page_adds_new_events"]
    listed_days = helpers["listed_days"]
    page_starts_past_horizon = helpers["page_starts_past_horizon"]
    seen = set()
    p1 = [{"detail_url": "/event/a/1/"}, {"detail_url": "/event/b/2/"}]
    check("first page is new", page_adds_new_events(p1, seen))
    check("the same page again is the end", not page_adds_new_events(p1, seen))
    check("trailing slash and case do not make a link new",
          not page_adds_new_events([{"detail_url": "/EVENT/A/1"}], seen))
    check("one new link is enough", page_adds_new_events(p1 + [{"detail_url": "/event/c/3/"}], seen))
    check("an event with no link is not proof of the end", page_adds_new_events([{"title": "x"}], seen))
    check("an empty page adds nothing", not page_adds_new_events([], seen))

    # The 90-day horizon (WEB-BE-051 AC2). Days are Central 'YYYY-MM-DD'.
    horizon = "2027-02-13"
    check("timed and date-only dates both give the day",
          listed_days([{"date": "2027-01-05 19:30:00"}, {"date": "2027-01-02"}]) == ["2027-01-02", "2027-01-05"])
    check("a missing or unreadable date is left out, not guessed",
          listed_days([{"date": None}, {}, {"date": "Jan 5"}, {"date": "2027-01-03"}]) == ["2027-01-03"])
    check("a page inside the horizon goes on",
          not page_starts_past_horizon([{"date": "2027-01-10"}, {"date": "2027-02-13 20:00:00"}], horizon))
    check("a page on the horizon day itself goes on",
          not page_starts_past_horizon([{"date": "2027-02-13"}], horizon))
    check("a page that starts after the horizon stops the walk",
          page_starts_past_horizon([{"date": "2027-02-14"}, {"date": "2027-03-01"}], horizon))
    check("one stray far-future card does not end a page that is still inside",
          not page_starts_past_horizon([{"date": "2028-06-01"}, {"date": "2027-01-20"}], horizon))
    check("a page with no readable date is not past the horizon",
          not page_starts_past_horizon([{"date": ""}, {"title": "x"}], horizon))
    check("an empty page is not past the horizon", not page_starts_past_horizon([], horizon))
    check("the horizon is 90 days", constant("HORIZON_DAYS") == 90)
    check("run() stops the walk on the horizon",
          "page_starts_past_horizon(events, self.horizon_day)" in SOURCE)
    check("the ledger records how far the walk got and why it stopped",
          all(k in SOURCE for k in ('"latestListedDay"', '"horizonDay"', '"listingStop"', '"pagesRead"')))

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
