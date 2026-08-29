import { Link } from "react-router-dom";

/**
 * SEO-008 / SEO-015: the site's navigational directory, rendered in the footer
 * on every page.
 *
 * WHY. Measured 2026-08-28 against the competitor we are trying to beat:
 *
 *   catchdesmoines.com/events/         250 internal links
 *   catchdesmoines.com/things-to-do/   255
 *   catchdesmoines.com/restaurants/    242
 *
 *   desmoinesinsider.com/               54
 *   desmoinesinsider.com/events         72
 *   desmoinesinsider.com/restaurants    77
 *   desmoinesinsider.com/things-to-do   79
 *   desmoinesinsider.com/attractions    63
 *
 * We publish 1,109 URLs and the hubs link to almost none of them. That is a
 * large part of why the entity pages rank on page one while the hubs that
 * should be the front door sit on page three to six: link equity arrives at the
 * hub and stops there.
 *
 * WHY THE FOOTER. It is the one place that lifts EVERY page at once, including
 * the ~1,070 entity pages, rather than each hub separately. A previous attempt
 * at this exists - FooterSEOLinks in InternalLinks.tsx - and it is exported,
 * complete, and imported by nothing, which is this repo's recurring
 * written-but-never-wired pattern. It also only carried 16 links.
 *
 * WHAT THIS IS NOT. It is not a link dump. Every entry is a real destination a
 * visitor might want, grouped the way somebody actually plans a day out, and
 * the sections mirror the demand the keyword research actually shows: suburb
 * event pages, cuisine and occasion dining, family, outdoors, planning.
 *
 * EVERY HREF MUST RESOLVE TO A ROUTE IN App.tsx. A directory that links to
 * pages which do not exist manufactures soft 404s at the scale of the whole
 * site, which is worse than linking to nothing.
 * scripts/__tests__/site-directory-routes.test.mjs checks that in both
 * directions and is the reason this list can be trusted.
 */

export interface DirectoryLink {
  title: string;
  href: string;
}

export interface DirectorySection {
  title: string;
  links: DirectoryLink[];
}

/**
 * Exported so the route test can read the same array the component renders.
 * A test that re-declared the list would pass while the component linked
 * somewhere else.
 */
export const DIRECTORY_SECTIONS: DirectorySection[] = [
  {
    title: "Events",
    links: [
      { title: "All Des Moines events", href: "/events" },
      { title: "Events today", href: "/events/today" },
      { title: "This weekend", href: "/events/this-weekend" },
      { title: "Free events", href: "/events/free" },
      { title: "Kids and family events", href: "/events/kids" },
      { title: "Date night", href: "/events/date-night" },
      { title: "Events near me", href: "/events/near-me" },
      { title: "Event calendar", href: "/calendar" },
      { title: "Concerts and live music", href: "/music" },
      { title: "Sports", href: "/sports" },
      { title: "Iowa State Fair", href: "/iowa-state-fair" },
      { title: "Submit an event", href: "/submit-event" },
    ],
  },
  {
    title: "Events by suburb",
    links: [
      { title: "West Des Moines events", href: "/events/west-des-moines" },
      { title: "Ankeny events", href: "/events/ankeny" },
      { title: "Urbandale events", href: "/events/urbandale" },
      { title: "Johnston events", href: "/events/johnston" },
      { title: "Altoona events", href: "/events/altoona" },
      { title: "Clive events", href: "/events/clive" },
      { title: "Windsor Heights events", href: "/events/windsor-heights" },
    ],
  },
  {
    title: "Restaurants",
    links: [
      { title: "Des Moines restaurant guide", href: "/restaurants" },
      { title: "Open now", href: "/restaurants/open-now" },
      { title: "Dietary options", href: "/restaurants/dietary" },
      { title: "Breweries", href: "/breweries" },
      { title: "Best of Des Moines", href: "/best-of" },
      { title: "Deals", href: "/deals" },
    ],
  },
  {
    title: "Things to do",
    links: [
      { title: "Things to do in Des Moines", href: "/things-to-do" },
      { title: "Attractions", href: "/attractions" },
      { title: "Playgrounds", href: "/playgrounds" },
      { title: "Outdoors and parks", href: "/outdoors" },
      { title: "Festivals", href: "/things-to-do/festivals" },
      { title: "On a budget", href: "/things-to-do/budget" },
      { title: "Explore the map", href: "/map" },
    ],
  },
  {
    title: "Neighborhoods",
    links: [
      { title: "All neighborhoods", href: "/neighborhoods" },
      { title: "Downtown", href: "/neighborhoods/downtown" },
      { title: "East Village", href: "/neighborhoods/east-village" },
      { title: "Beaverdale", href: "/neighborhoods/beaverdale" },
      { title: "Highland Park", href: "/neighborhoods/highland-park" },
    ],
  },
  {
    title: "Plan a visit",
    links: [
      { title: "Visitors guide", href: "/visitors-guide" },
      { title: "Trip planner", href: "/trip-planner" },
      { title: "Itineraries", href: "/itineraries" },
      { title: "Guides", href: "/guides" },
      { title: "Where to stay", href: "/stay" },
      { title: "Getting around", href: "/getting-around" },
      { title: "Group travel", href: "/group-travel" },
      { title: "Articles", href: "/articles" },
    ],
  },
];

/** Every href the directory renders, for tests and for coverage reporting. */
export const DIRECTORY_HREFS: string[] = DIRECTORY_SECTIONS.flatMap((s) =>
  s.links.map((l) => l.href),
);

export function SiteDirectory({ className = "" }: { className?: string }) {
  return (
    <div
      className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-8 ${className}`}
    >
      {DIRECTORY_SECTIONS.map((section) => (
        <nav key={section.title} aria-label={section.title}>
          <h3 className="font-semibold text-sm mb-3">{section.title}</h3>
          <ul className="space-y-2">
            {section.links.map((link) => (
              <li key={link.href}>
                <Link
                  to={link.href}
                  className="text-sm text-muted-foreground hover:text-primary hover:underline"
                >
                  {link.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ))}
    </div>
  );
}

export default SiteDirectory;
