import { logisticsDate, type OutdoorsLogistics } from '@/data/outdoorsGuide';

export interface DestinationLogisticsProps {
  logistics: OutdoorsLogistics;
  className?: string;
}

/**
 * "2026-08-31" -> "August 31, 2026". Read as UTC so the day can't shift by
 * one in a browser west of Greenwich, and so a prerender and a hydrate agree.
 */
function formatGuideDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * A guide destination's practical facts: from downtown, parking, trailhead,
 * dogs, winter and cost, then the date they are dated by (SEO-024).
 *
 * A description list rather than tiles on purpose: these are the questions
 * the keyword data says people type, so they are content shaped like a
 * question and an answer. Shared by the /outdoors guide and the trail pages
 * that are guide destinations (explore pass 2 WP5 item 8), so the two can't
 * disagree about where to park.
 *
 * The date line says "Written" unless someone has re-checked the facts and
 * set `checkedOn` (item 9). "Details checked" was a claim nobody had made.
 */
export function DestinationLogistics({ logistics, className }: DestinationLogisticsProps) {
  const facts: Array<{ term: string; detail: string }> = [
    { term: 'From downtown', detail: logistics.fromDowntown },
    { term: 'Parking', detail: logistics.parking },
    { term: 'Where to start', detail: logistics.trailhead },
    { term: 'Dogs', detail: logistics.dogs },
    { term: 'In winter', detail: logistics.winter },
    { term: 'Cost', detail: logistics.cost },
  ];
  const dated = logisticsDate(logistics);

  return (
    <div className={className} data-destination-logistics="">
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 max-w-4xl">
        {facts.map((fact) => (
          <div key={fact.term}>
            <dt className="text-sm font-semibold text-foreground">{fact.term}</dt>
            <dd className="text-sm text-muted-foreground mt-0.5">{fact.detail}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground" data-logistics-date={dated.kind.toLowerCase()}>
        {dated.kind}{' '}
        <time dateTime={dated.iso}>{formatGuideDate(dated.iso)}</time>
      </p>
    </div>
  );
}
