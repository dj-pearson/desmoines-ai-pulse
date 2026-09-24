import { Link } from 'react-router-dom';
import { ExternalLink, Navigation } from 'lucide-react';
import { getDirectionsUrl } from '@/lib/directions';
import type { OutdoorsDestination } from '@/data/outdoorsGuide';
import type { NearbyPlace } from '@/hooks/useOutdoorsNearby';

interface OutdoorsDestinationSectionProps {
  destination: OutdoorsDestination;
  /** Playgrounds within a few miles, from usePlaygroundsNearDestinations(). */
  nearbyPlaygrounds?: NearbyPlace[];
}

/**
 * "2026-08-31" -> "August 31, 2026". Read as UTC so the day can't shift by
 * one in a browser west of Greenwich, and so a prerender and a hydrate agree.
 */
function formatCheckedOn(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * One destination in the /outdoors guide (SEO-024).
 *
 * The logistics block is a description list rather than a row of tiles on
 * purpose. Parking, trailhead, dogs and winter hours are the questions the
 * keyword data says people are actually typing, so they are content, and a
 * <dl> is what content shaped like a question and an answer is.
 */
export default function OutdoorsDestinationSection({
  destination,
  nearbyPlaygrounds,
}: OutdoorsDestinationSectionProps) {
  const { logistics } = destination;

  const facts: Array<{ term: string; detail: string }> = [
    { term: 'From downtown', detail: logistics.fromDowntown },
    { term: 'Parking', detail: logistics.parking },
    { term: 'Where to start', detail: logistics.trailhead },
    { term: 'Dogs', detail: logistics.dogs },
    { term: 'In winter', detail: logistics.winter },
    { term: 'Cost', detail: logistics.cost },
  ];

  return (
    <article
      id={destination.id}
      className="scroll-mt-24 border-t border-border pt-10 first:border-t-0 first:pt-0"
    >
      <p className="text-sm text-muted-foreground">{destination.kind}</p>
      <h3 className="text-2xl md:text-3xl font-semibold mt-1 mb-3">{destination.name}</h3>
      <p className="text-lg text-foreground/90 max-w-[70ch] mb-4">{destination.headline}</p>

      <div className="max-w-[70ch] space-y-4 leading-relaxed text-muted-foreground">
        {destination.body.map((paragraph) => (
          <p key={paragraph.slice(0, 40)}>{paragraph}</p>
        ))}
      </div>

      <dl className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2 max-w-4xl">
        {facts.map((fact) => (
          <div key={fact.term}>
            <dt className="text-sm font-semibold text-foreground">{fact.term}</dt>
            <dd className="text-sm text-muted-foreground mt-0.5">{fact.detail}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        Details checked{' '}
        <time dateTime={logistics.checkedOn}>{formatCheckedOn(logistics.checkedOn)}</time>
      </p>

      <p className="mt-5 text-sm text-muted-foreground">
        {destination.address.street ? `${destination.address.street}, ` : ''}
        {destination.address.city}, {destination.address.state}{' '}
        {destination.address.zip ?? ''}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        {destination.internalPath && (
          <Link
            to={destination.internalPath}
            className="font-medium text-primary underline underline-offset-4"
          >
            {destination.name} trail details
          </Link>
        )}
        <a
          href={getDirectionsUrl(destination.geo)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4"
        >
          <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
          Directions to {destination.name}
        </a>
        <a
          href={destination.officialUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-muted-foreground underline underline-offset-4"
        >
          Official site
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>

      {nearbyPlaygrounds && nearbyPlaygrounds.length > 0 && (
        <div className="mt-5 max-w-[70ch]">
          <h4 className="text-sm font-semibold text-foreground mb-2">
            Playgrounds within a few miles
          </h4>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
            {nearbyPlaygrounds.map((place) => (
              <li key={place.path}>
                <Link to={place.path} className="text-primary underline underline-offset-4">
                  {place.name}
                </Link>
                <span className="text-muted-foreground"> {place.distanceMiles} mi</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
