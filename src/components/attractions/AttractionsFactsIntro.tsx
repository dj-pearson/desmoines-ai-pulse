import { Link } from "react-router-dom";
import { useAttractionFacts } from "@/hooks/useAttractionFacts";
import { hubFactsSummary } from "@/lib/attractionAtAGlance";
import { createSlug } from "@/lib/slug";

interface AttractionsFactsIntroProps {
  /** Active attractions in the whole catalogue. */
  total: number;
}

/**
 * The /attractions intro and its free-admission list (SEO-046). Every count
 * and name comes from the verified columns: a row is "checked" only when its
 * fact_sources name the page, and "free" only when that page said so. Renders
 * nothing until there is something checked to say.
 */
export function AttractionsFactsIntro({ total }: AttractionsFactsIntroProps) {
  const { data } = useAttractionFacts();
  if (!data || data.length === 0) return null;
  const { checkedCount, free, checkedLabel } = hubFactsSummary(data);
  if (checkedCount === 0) return null;

  const linkClass = "font-medium text-[#2D1B69] underline-offset-2 hover:underline dark:text-violet-300";

  return (
    <section aria-labelledby="attraction-facts-heading" className="mb-8 max-w-prose">
      <h2 id="attraction-facts-heading" className="sr-only">
        About this guide
      </h2>
      <p className="text-foreground/90 leading-relaxed">
        {total > 0 ? `${total} attractions across the Des Moines metro. ` : ""}
        For {checkedCount} of them, the hours, admission or parking on their page come from a source
        named on that page, usually the attraction's own website
        {checkedLabel ? `, last checked ${checkedLabel}` : ""}. Where a source didn't say, the page
        leaves it out.
      </p>
      {free.length > 0 && (
        <div className="mt-4">
          <h3 className="text-base font-semibold text-foreground">Free admission</h3>
          <p className="mt-1 text-foreground/90 leading-relaxed">
            {free.map((row, i) => (
              <span key={row.name}>
                {i > 0 ? (i === free.length - 1 ? " and " : ", ") : ""}
                <Link to={`/attractions/${createSlug(row.name)}`} className={linkClass}>
                  {row.name}
                </Link>
              </span>
            ))}
            , according to the source on each page.
          </p>
        </div>
      )}
    </section>
  );
}
