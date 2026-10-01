import { Link } from 'react-router-dom';
import { ExternalLink, Navigation } from 'lucide-react';
import { getDirectionsUrl } from '@/lib/directions';
import type { OutdoorsDestination } from '@/data/outdoorsGuide';
import { DestinationLogistics } from '@/components/outdoors/DestinationLogistics';
import type { NearbyPlace } from '@/hooks/useOutdoorsNearby';

interface OutdoorsDestinationSectionProps {
  destination: OutdoorsDestination;
  /** Playgrounds within a few miles, from usePlaygroundsNearDestinations(). */
  nearbyPlaygrounds?: NearbyPlace[];
}

/**
 * One destination in the /outdoors guide (SEO-024). The logistics list is
 * DestinationLogistics, shared with the trail pages (explore pass 2 WP5
 * item 8).
 */
export default function OutdoorsDestinationSection({
  destination,
  nearbyPlaygrounds,
}: OutdoorsDestinationSectionProps) {
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

      <DestinationLogistics logistics={destination.logistics} className="mt-6" />

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
            Playgrounds within a few miles (straight line)
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
