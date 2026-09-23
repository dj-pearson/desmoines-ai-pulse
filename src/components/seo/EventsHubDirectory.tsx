import { Link } from "react-router-dom";
import { useVenues } from "@/hooks/useVenues";
import { NEIGHBORHOODS } from "@/lib/neighborhoods";
import { MonthLinks } from "@/components/seo/MonthLinks";

/**
 * Every way into the events calendar, on the /events hub (SEO-009, SEO-015).
 *
 * The hub linked four of its own sub-routes and none of its suburb pages,
 * month pages or venue pages, while the competitor's events hub carries about
 * 250 links. This is not a link dump: each group is a real way somebody
 * narrows "what's on" - when, where, which building, what kind - and every
 * target is a page that exists and is prerendered.
 *
 * Venues come from the venues table, so a venue page is linked only once it
 * exists; a new row shows up here with no code change. The suburb event pages
 * are a fixed set of routes in App.tsx and are listed as such.
 */

const WHEN_AND_WHO = [
  { href: "/events/today", label: "Events today" },
  { href: "/events/this-weekend", label: "This weekend" },
  { href: "/events/free", label: "Free events" },
  { href: "/events/kids", label: "Kids and family" },
  { href: "/events/date-night", label: "Date night" },
  { href: "/events/near-me", label: "Near me" },
  { href: "/music", label: "Live music" },
  { href: "/sports", label: "Sports" },
];

/** The suburb event routes registered in App.tsx. */
const SUBURB_EVENT_PAGES = [
  { href: "/events/west-des-moines", label: "West Des Moines" },
  { href: "/events/ankeny", label: "Ankeny" },
  { href: "/events/urbandale", label: "Urbandale" },
  { href: "/events/johnston", label: "Johnston" },
  { href: "/events/clive", label: "Clive" },
  { href: "/events/altoona", label: "Altoona" },
  { href: "/events/windsor-heights", label: "Windsor Heights" },
];

const pill =
  "inline-block rounded-full border border-border px-3 py-1.5 text-sm hover:border-primary hover:text-primary";

function Group({ title, links }: { title: string; links: Array<{ href: string; label: string }> }) {
  if (links.length === 0) return null;
  return (
    <nav aria-label={title}>
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      <ul className="flex flex-wrap gap-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link to={l.href} className={pill}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function EventsHubDirectory({ className = "" }: { className?: string }) {
  const { data: venues } = useVenues();
  const venueLinks = (venues ?? []).map((v) => ({ href: `/music/venues/${v.slug}`, label: v.name }));
  const neighborhoodLinks = NEIGHBORHOODS.filter((n) => n.prerender).map((n) => ({
    href: `/neighborhoods/${n.slug}`,
    label: n.name,
  }));

  return (
    <div className={`space-y-8 ${className}`}>
      <Group title="Browse by when and who" links={WHEN_AND_WHO} />
      <MonthLinks />
      <Group title="Events by suburb" links={SUBURB_EVENT_PAGES} />
      <Group title="What's on at each venue" links={venueLinks} />
      <Group title="Neighborhood guides" links={neighborhoodLinks} />
    </div>
  );
}
