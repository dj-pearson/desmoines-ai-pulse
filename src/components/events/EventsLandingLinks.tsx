import { Link } from "react-router-dom";
import { DIRECTORY_PILL } from "@/components/seo/MonthLinks";
import { WHEN_AND_WHO } from "@/components/seo/EventsHubDirectory";
import { SUBURB_EVENT_PAGES } from "@/lib/suburbs";

/**
 * The other ways into the calendar, for the foot of every date, audience,
 * month and suburb landing (events-pass2 WP3 item 9, WP5 item 7).
 *
 * The lists are EventsHubDirectory's own arrays, so the hub and the landings
 * can't drift: a landing added there shows up here with no second edit. The
 * page the reader is on is left out. Pills are 44px tall (DIRECTORY_PILL).
 */
export interface EventsLandingLinksProps {
  /** The current path, e.g. "/events/today". Left out of both lists. */
  current: string;
  className?: string;
}

interface PillLink {
  href: string;
  label: string;
}

function PillGroup({ id, title, links }: { id: string; title: string; links: PillLink[] }) {
  if (links.length === 0) return null;
  return (
    <section aria-labelledby={id}>
      <h3 id={id} className="text-base font-semibold mb-3">
        {title}
      </h3>
      <ul className="flex flex-wrap gap-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link to={link.href} className={DIRECTORY_PILL}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EventsLandingLinks({ current, className = "" }: EventsLandingLinksProps) {
  const here = current.replace(/\/+$/, "").toLowerCase();
  const whenAndWho = WHEN_AND_WHO.filter((link) => link.href.toLowerCase() !== here);
  const suburbs = SUBURB_EVENT_PAGES.filter((s) => s.href.toLowerCase() !== here).map((s) => ({
    href: s.href,
    label: s.name,
  }));

  return (
    <nav aria-label="More Des Moines events" className={className}>
      <h2 className="text-xl font-semibold mb-4">More Des Moines events</h2>
      <div className="space-y-6">
        <PillGroup id="landing-links-when" title="By when and who" links={whenAndWho} />
        <PillGroup id="landing-links-where" title="By suburb" links={suburbs} />
      </div>
    </nav>
  );
}

export default EventsLandingLinks;
