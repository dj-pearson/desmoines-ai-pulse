import { CircleParking, Ticket } from "lucide-react";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import type { FactSite } from "@/lib/attractionAtAGlance";

export interface AttractionAtAGlanceProps {
  /** attractionHoursSentence(), else hours_summary. Null hides the row. */
  hours: string | null;
  /** True when `hours` is today's line and the full table is further down. */
  hasWeeklyTable: boolean;
  admission: string | null;
  parking: string | null;
  /** factSourceSites(parseFactSources(fact_sources)). */
  sources: FactSite[];
  /** calendarDateLabel(facts_verified_at). */
  checked: string | null;
}

function joinSites(sites: FactSite[], linkClass: string) {
  return sites.map((site, i) => (
    <span key={site.host}>
      {i > 0 ? (i === sites.length - 1 ? " and " : ", ") : ""}
      <a href={site.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
        {site.host}
      </a>
    </span>
  ));
}

/**
 * Hours, admission and parking directly under the attraction's name
 * (SEO-046), each as the attraction's own site states it, with the pages and
 * the date they were read. Server-rendered by the prerender. A description
 * list, so a screen reader announces each label with its value; a fact the
 * row lacks is left out rather than shown empty.
 */
export function AttractionAtAGlance({
  hours,
  hasWeeklyTable,
  admission,
  parking,
  sources,
  checked,
}: AttractionAtAGlanceProps) {
  if (!hours && !admission && !parking) return null;
  const linkClass = "font-medium text-[#2D1B69] underline-offset-2 hover:underline dark:text-violet-300";
  const iconClass = "mt-0.5 h-4 w-4 shrink-0 text-[#2D1B69] dark:text-violet-300";

  return (
    <section aria-label="Visitor facts" className="border-b bg-card px-6 py-4 md:px-10" data-attraction-facts="">
      <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
        {hours && (
          <div className="flex items-start gap-3">
            <SpriteIcon name="clock" className={iconClass} />
            <div>
              <dt className="font-semibold text-foreground">Hours</dt>
              <dd className="text-foreground">
                {hours}
                {hasWeeklyTable && (
                  <>
                    {" "}
                    <a href="#plan-visit-heading" className={linkClass}>
                      All hours
                    </a>
                  </>
                )}
              </dd>
            </div>
          </div>
        )}
        {admission && (
          <div className="flex items-start gap-3">
            <Ticket className={iconClass} aria-hidden="true" />
            <div>
              <dt className="font-semibold text-foreground">Admission</dt>
              <dd className="text-foreground">{admission}</dd>
            </div>
          </div>
        )}
        {parking && (
          <div className="flex items-start gap-3">
            <CircleParking className={iconClass} aria-hidden="true" />
            <div>
              <dt className="font-semibold text-foreground">Parking</dt>
              <dd className="text-foreground">{parking}</dd>
            </div>
          </div>
        )}
      </dl>
      {sources.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {sources.length === 1 ? "Source" : "Sources"}: {joinSites(sources, linkClass)}
          {checked ? `, checked ${checked}` : ""}
        </p>
      )}
    </section>
  );
}
