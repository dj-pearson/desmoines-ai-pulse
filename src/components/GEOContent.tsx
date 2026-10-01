// The home page's AI-facing prose: one dated, sourced paragraph about this
// weekend, and a short statement of how the listings are made.
//
// WHAT IS NOT HERE ANY MORE (WP5, docs/page-plans/home.md):
//   - A second "Frequently Asked Questions" block. The page had two, one of
//     them without schema. Its two informative answers, the paid-placement
//     disclosure and "if we disagree with the venue, believe the venue", moved
//     into HOME_FAQS in src/content/homeContent.ts, which FAQSection renders.
//   - A "Why Des Moines Insider?" list and a four-step how-to. The how-to
//     carried three invented percentages about personalised users,
//     filter time saved and notification users, plus a promise of
//     last-minute ticket alerts that nothing sends.
//   - Count tiles. They were a second copy of the hero's counts; the dated
//     snapshot below states the weekend in a sentence with a date on it.
//   - "Updated multiple times daily". The event crawler runs once a day
//     (.github/workflows/event-crawler.yml).
//   - "AI rankings consider review scores". There is no reviews table.
//
// Home pass-2 WP4 (docs/page-plans/home-pass2.md): every number in the
// snapshot is the number on the page it links to (useHomeSnapshot builds
// /events/this-weekend's own filter), the paid-placement sentence says what
// arrangeSponsored does, and the cadence sentence is EVENTS_UPDATE_ANSWER.
//
// scripts/__tests__/geo-content-claims.test.mjs fails if a claim of those
// shapes comes back.
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { BRAND } from "@/lib/brandConfig";
import { toJsonLd } from "@/lib/jsonLd";
import { EVENTS_UPDATE_ANSWER } from "@/content/eventsCopy";
import { HOME_PAID_PLACEMENT_ANSWER } from "@/content/homeContent";
import {
  useHomeSnapshot,
  type HomeSnapshot,
  type HomeSnapshotEvent,
} from "@/hooks/useHomeSnapshot";

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

const LINK_CLASS = "font-medium text-primary underline underline-offset-4 hover:no-underline";

/** Next up first, then the weekend's first rows, each URL once. */
function snapshotItems(snapshot: HomeSnapshot): HomeSnapshotEvent[] {
  const seen = new Set<string>();
  const out: HomeSnapshotEvent[] = [];
  for (const event of [snapshot.nextUp, ...snapshot.weekendEvents]) {
    if (!event || seen.has(event.href)) continue;
    seen.add(event.href);
    out.push({ title: event.title, href: event.href });
  }
  return out;
}

/**
 * An ItemList of the events the paragraph points at (WP4 item 6). Emitted only
 * with the paragraph, so the markup never lists events the page does not show
 * a sentence about.
 */
function SnapshotItemList({ snapshot }: { snapshot: HomeSnapshot }) {
  const items = snapshotItems(snapshot);
  if (items.length === 0) return null;
  const list = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Des Moines events, as of ${snapshot.asOfLabel}`,
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${BRAND.baseUrl}${item.href}`,
      name: item.title,
    })),
  };
  return (
    <Helmet>
      <script type="application/ld+json">{toJsonLd(list)}</script>
    </Helmet>
  );
}

function RemainingClause({ snapshot }: { snapshot: HomeSnapshot }) {
  const { remainingCount, remainingLabel } = snapshot;
  if (remainingCount == null || !remainingLabel) return null;
  return (
    <>
      ;{" "}
      {remainingCount > 0
        ? `${remainingCount.toLocaleString()} still to come ${remainingLabel}`
        : `none still to come ${remainingLabel}`}
    </>
  );
}

function SnapshotParagraph({ snapshot }: { snapshot: HomeSnapshot }) {
  const { asOfDate, asOfLabel, weekendLabel, weekendCount, weekendFreeCount, nextUp } = snapshot;

  return (
    <p className="max-w-prose text-lg leading-relaxed" data-speakable>
      As of <time dateTime={asOfDate}>{asOfLabel}</time> (Central):{" "}
      {weekendCount > 0 ? (
        <>
          <Link to="/events/this-weekend" className={LINK_CLASS}>
            {plural(weekendCount, "event", "events")} this weekend
            {weekendFreeCount > 0
              ? `, ${weekendFreeCount.toLocaleString()} of them listed as free`
              : ""}
          </Link>{" "}
          ({weekendLabel})
          <RemainingClause snapshot={snapshot} />.
        </>
      ) : (
        <>no events are listed yet for this weekend ({weekendLabel}).</>
      )}
      {nextUp && (
        <>
          {" "}Next up:{" "}
          <Link to={nextUp.href} className={LINK_CLASS}>
            {nextUp.title}
          </Link>
          {nextUp.venue ? ` at ${nextUp.venue}` : ""}
          {nextUp.dayLabel ? `, ${nextUp.dayLabel}` : ""}
          {nextUp.timeLabel ? ` at ${nextUp.timeLabel}` : ""}.
        </>
      )}{" "}
      For free events on other dates, see{" "}
      <Link to="/events/free" className={LINK_CLASS}>
        all free events
      </Link>
      .
    </p>
  );
}

export function GEOContent() {
  const { snapshot } = useHomeSnapshot();

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Nothing at all while loading or on failure, heading included: a
          dash or a zero in a sentence meant to be quoted is worse than no
          sentence, and a heading over nothing promises one. */}
      {snapshot && (
        <section aria-labelledby="home-snapshot-heading" className="mb-8">
          <h2 id="home-snapshot-heading" className="text-3xl font-bold mb-4">
            Des Moines this weekend
          </h2>
          <SnapshotParagraph snapshot={snapshot} />
          <SnapshotItemList snapshot={snapshot} />
        </section>
      )}

      <section aria-labelledby="home-listings-heading">
        <h2 id="home-listings-heading" className="text-2xl font-bold mb-3">
          How these listings are made
        </h2>
        <p className="max-w-prose leading-relaxed text-muted-foreground">
          Des Moines Insider lists events, restaurants, attractions and playgrounds across the
          Des Moines metro. {EVENTS_UPDATE_ANSWER} {HOME_PAID_PLACEMENT_ANSWER}{" "}
          <Link to="/advertise" className={LINK_CLASS}>
            Advertising options
          </Link>
          .
        </p>
      </section>
    </article>
  );
}

export default GEOContent;
