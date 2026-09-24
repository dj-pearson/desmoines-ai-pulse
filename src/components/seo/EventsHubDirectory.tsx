import { Link } from "react-router-dom";
import { useVenueLinks } from "@/hooks/useVenues";
import { NEIGHBORHOODS } from "@/lib/neighborhoods";
import { SUBURB_EVENT_PAGES, hasNeighborhoodGuide, hasSuburbPage } from "@/lib/suburbs";
import { DIRECTORY_PILL, MonthLinks } from "@/components/seo/MonthLinks";

/**
 * Every way into the events calendar, on the /events hub (SEO-009, SEO-015).
 *
 * The hub linked four of its own sub-routes and none of its suburb pages,
 * month pages or venue pages, while the competitor's events hub carries about
 * 250 links. This is not a link dump: each group is a real way somebody
 * narrows "what's on" - when, where, which building, what kind - and every
 * target is a page that exists and is prerendered.
 *
 * ONE LANDMARK (events plan WP7). This used to be five or six <nav>s, each
 * with its own h2, so a screen reader's landmark list read like a sitemap.
 * It is one <nav> now with h3 sections.
 *
 * The suburb list comes from SUBURBS (src/lib/suburbs.ts), which
 * check-neighborhood-inventory.mjs keeps in step with App.tsx's routes, so a
 * suburb added there shows up here with no second edit. Each suburb carries
 * its neighborhood guide when one exists. Venues come from the venues table.
 */

interface DirectoryLink {
  href: string;
  label: string;
}

const WHEN_AND_WHO: DirectoryLink[] = [
  { href: "/events/today", label: "Events today" },
  { href: "/events/this-weekend", label: "This weekend" },
  { href: "/events/free", label: "Free events" },
  { href: "/events/kids", label: "Kids and family" },
  { href: "/events/date-night", label: "Date night" },
  { href: "/events/near-me", label: "Near me" },
  { href: "/music", label: "Live music" },
  { href: "/sports", label: "Sports" },
];

/** Off the events vertical: what somebody needs around an event. */
const PLAN_AROUND_IT: DirectoryLink[] = [
  { href: "/restaurants/open-now", label: "Restaurants open now" },
  { href: "/things-to-do", label: "Things to do" },
  { href: "/attractions", label: "Attractions" },
  { href: "/playgrounds", label: "Playgrounds" },
  { href: "/stay", label: "Where to stay" },
];

function PillList({ links }: { links: DirectoryLink[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {links.map((l) => (
        <li key={l.href}>
          <Link to={l.href} className={DIRECTORY_PILL}>
            {l.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, links }: { title: string; links: DirectoryLink[] }) {
  if (links.length === 0) return null;
  return (
    <section>
      <h3 className="text-base font-semibold mb-3">{title}</h3>
      <PillList links={links} />
    </section>
  );
}

const pairLink =
  "inline-flex min-h-11 items-center px-4 text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Suburb event pages, each joined to its neighborhood guide when the guide
 * exists, then the guides that have no events page (East Village).
 */
function PlacesSection() {
  const guidesWithoutEvents = NEIGHBORHOODS.filter((n) => n.prerender && !hasSuburbPage(n.slug));

  return (
    <section>
      <h3 className="text-base font-semibold mb-3">Suburbs and neighborhoods</h3>
      <ul className="flex flex-wrap gap-2">
        {SUBURB_EVENT_PAGES.map((s) =>
          hasNeighborhoodGuide(s.slug) ? (
            <li
              key={s.slug}
              className="inline-flex items-stretch divide-x divide-border rounded-full border border-border"
            >
              <Link to={s.href} className={`${pairLink} rounded-l-full`}>
                {s.name}
              </Link>
              <Link
                to={`/neighborhoods/${s.slug}`}
                className={`${pairLink} rounded-r-full text-muted-foreground`}
                aria-label={`${s.name} neighborhood guide`}
              >
                Guide
              </Link>
            </li>
          ) : (
            <li key={s.slug}>
              <Link to={s.href} className={DIRECTORY_PILL}>
                {s.name}
              </Link>
            </li>
          )
        )}
        {guidesWithoutEvents.map((n) => (
          <li key={n.slug}>
            <Link to={`/neighborhoods/${n.slug}`} className={DIRECTORY_PILL}>
              {n.name} guide
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EventsHubDirectory({ className = "" }: { className?: string }) {
  const { data: venues } = useVenueLinks();
  const venueLinks = (venues ?? []).map((v) => ({ href: `/music/venues/${v.slug}`, label: v.name }));

  return (
    <nav aria-label="Browse Des Moines events" className={className}>
      <h2 className="text-lg font-semibold mb-6">Browse Des Moines events</h2>
      <div className="space-y-8">
        <Section title="By when and who" links={WHEN_AND_WHO} />
        <MonthLinks embedded />
        <PlacesSection />
        <Section title="What's on at each venue" links={venueLinks} />
        <Section title="Plan around it" links={PLAN_AROUND_IT} />
      </div>
    </nav>
  );
}
