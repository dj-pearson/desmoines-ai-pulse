// The home page's AI-facing prose: one dated, sourced paragraph about this
// week, and a short statement of how the listings are made.
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
//     snapshot below states the week in a sentence with a date on it.
//   - "Updated multiple times daily". The event crawler runs once a day
//     (.github/workflows/event-crawler.yml).
//   - "AI rankings consider review scores". There is no reviews table.
//
// scripts/__tests__/geo-content-claims.test.mjs fails if a claim of those
// shapes comes back.
import { Link } from "react-router-dom";
import { useHomeSnapshot, type HomeSnapshot } from "@/hooks/useHomeSnapshot";

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

const LINK_CLASS = "font-medium text-primary underline underline-offset-4 hover:no-underline";

function SnapshotParagraph({ snapshot }: { snapshot: HomeSnapshot }) {
  const { asOfDate, asOfLabel, weekendLabel, weekendCount, weekendFreeCount, nextUp } = snapshot;

  return (
    <p className="text-lg leading-relaxed" data-speakable>
      As of <time dateTime={asOfDate}>{asOfLabel}</time> (Central):{" "}
      {weekendCount > 0 ? (
        <>
          <Link to="/events/this-weekend" className={LINK_CLASS}>
            {plural(weekendCount, "event", "events")} this weekend
          </Link>{" "}
          ({weekendLabel})
          {weekendFreeCount > 0 ? (
            <>
              ,{" "}
              <Link to="/events/free" className={LINK_CLASS}>
                {weekendFreeCount.toLocaleString()} listed as free
              </Link>
              .
            </>
          ) : (
            "."
          )}
        </>
      ) : (
        <>
          no events are listed yet for this weekend ({weekendLabel}).
        </>
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
      )}
    </p>
  );
}

export function GEOContent() {
  const { snapshot } = useHomeSnapshot();

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
      <h2 className="text-3xl font-bold mb-4">Des Moines this week</h2>

      {/* Nothing at all while loading or on failure: a dash or a zero in a
          sentence meant to be quoted is worse than no sentence. */}
      {snapshot && <SnapshotParagraph snapshot={snapshot} />}

      <p className="mt-4 max-w-prose leading-relaxed text-muted-foreground">
        Des Moines Insider lists events, restaurants, attractions and playgrounds across the
        Des Moines metro. Event listings are refreshed daily from venue and organiser sources,
        and every event time is shown in Central Time. Listing is free; sponsored placements are
        paid and labelled where they appear.
      </p>
    </article>
  );
}

export default GEOContent;
