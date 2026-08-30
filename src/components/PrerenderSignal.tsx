import { useEffect, useRef } from 'react';
import { useIsFetching } from '@tanstack/react-query';

/**
 * Publishes "the data has arrived" to the prerenderer as
 * `<html data-queries-settled="true">`.
 *
 * WHY THE PRERENDERER NEEDS THIS. scripts/prerender.mjs had two settle signals
 * and neither answers the question it is actually asking:
 *
 *   Helmet's data-rh count exceeds the shell's   proves the page MOUNTED.
 *                                                Helmet commits on the first
 *                                                render, before any query.
 *   #root element count stops changing           proves the page STOPPED
 *                                                CHANGING - and a loading
 *                                                skeleton is static, so two
 *                                                consecutive equal samples fire
 *                                                happily while a query is still
 *                                                in flight.
 *
 * The result is a capture that ships a 200, a correct title, a correct canonical
 * and no content. Measured on consecutive builds of identical code, 2026-08-28:
 * /events/this-weekend captured 422 elements with ZERO event cards, then 2,390
 * with 40. Production has served the same shape - WEB-SEO-006 records
 * /events/today with 5 h3 where its sibling had 56.
 *
 * useIsFetching is the signal those two were standing in for: it counts queries
 * actually in flight, so it is route-agnostic without being a proxy. No
 * hand-maintained per-route content selector, which is the pattern this repo
 * keeps watching go stale.
 *
 * THE FIRST-RENDER TRAP, and it is why this is not three lines. useIsFetching()
 * is 0 before the first query starts, so writing "true" on any zero would mark
 * the shell settled instantly and change nothing. It waits until a fetch has
 * been SEEN, and only then treats zero as done.
 *
 * A ROUTE WITH NO QUERIES AT ALL still has to finish. /contact and /calendar
 * never fetch, so `seen` stays false forever; after GRACE_MS the signal is
 * published anyway rather than making every static route wait out the
 * prerenderer's cap.
 *
 * IN PRODUCTION THIS IS A DATA ATTRIBUTE ON <html> AND NOTHING ELSE. No render
 * output, no behaviour, no network. @tanstack/react-query is already in the
 * entry chunk, so it adds no import weight - which matters, because a
 * root-mounted headless component pulling in a library is exactly how
 * WEB-PERF-020's sonner and Radix regressions happened.
 */
const GRACE_MS = 1500;

export function PrerenderSignal() {
  const fetching = useIsFetching();
  const seenFetch = useRef(false);

  if (fetching > 0) seenFetch.current = true;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    if (fetching > 0) {
      root.dataset.queriesSettled = 'false';
      return;
    }

    // Zero in flight. Settle immediately if something actually fetched;
    // otherwise give the app a moment to start one before calling it done.
    if (seenFetch.current) {
      root.dataset.queriesSettled = 'true';
      return;
    }

    const timer = setTimeout(() => {
      root.dataset.queriesSettled = 'true';
    }, GRACE_MS);
    return () => clearTimeout(timer);
  }, [fetching]);

  return null;
}
