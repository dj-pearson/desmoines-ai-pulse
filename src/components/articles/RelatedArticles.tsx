import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useArticleHubListings } from "@/hooks/useArticles";
import { STALE_TIME } from "@/lib/queryConfig";
import { ARTICLE_HUBS, primaryHubForArticle, relatedArticles, type ScoredArticle } from "@/lib/articleHubs";

/**
 * The same 40-row window, key and projection HubArticles uses
 * (src/components/seo/HubArticles.tsx, owned by Eat & Drink). Kept identical so
 * a visit that has already loaded a hub rail reads this from cache instead of
 * asking again; if one side changes, change both.
 */
const HUB_RAIL_ROWS = 40;

interface RailArticle extends ScoredArticle {
  published_at: string | null;
}

interface RelatedArticlesProps {
  article: {
    id: string;
    title: string;
    category?: string | null;
    tags?: string[] | null;
  };
  className?: string;
}

/**
 * "Related reading" and "On now" for an article page (Plan & Stay WP4 item 7).
 *
 * Related: the three recent published articles sharing the most tags, then the
 * same category. On now: three or four current listings from the article's
 * primary hub, as plain links, so a piece about patios ends at restaurants you
 * can go to tonight. Each half renders nothing without a match, and the whole
 * block renders nothing when both are empty.
 */
export function RelatedArticles({ article, className = "" }: RelatedArticlesProps) {
  const { data: rail } = useQuery({
    queryKey: ["articles", "hub-rail", HUB_RAIL_ROWS],
    staleTime: STALE_TIME.REFERENCE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("articles")
        .select("id, slug, title, category, tags, published_at")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(HUB_RAIL_ROWS);
      if (error) throw error;
      return data ?? [];
    },
  });

  const hub = primaryHubForArticle(article);
  const { data: listings } = useArticleHubListings(hub);

  const related = relatedArticles(article, (rail ?? []) as RailArticle[]);
  const live = listings ?? [];

  if (related.length === 0 && live.length === 0) return null;

  return (
    <div className={`space-y-8 ${className}`}>
      {related.length > 0 && (
        <nav aria-label="Related reading">
          <h2 className="text-lg font-semibold mb-3">Related reading</h2>
          <ul>
            {related.map((a) => (
              <li key={a.id}>
                <Link
                  to={`/articles/${a.slug}`}
                  className="inline-flex min-h-11 items-center text-primary hover:underline"
                >
                  {a.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {hub && live.length > 0 && (
        <nav aria-label={`Current ${ARTICLE_HUBS[hub].title}`}>
          <h2 className="text-lg font-semibold mb-3">On now: {ARTICLE_HUBS[hub].title}</h2>
          <ul>
            {live.map((item) => (
              <li key={item.id}>
                <Link to={item.href} className="inline-flex min-h-11 flex-wrap items-center gap-x-2 text-primary hover:underline">
                  <span>{item.label}</span>
                  {item.meta && <span className="text-sm text-muted-foreground">{item.meta}</span>}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            to={ARTICLE_HUBS[hub].href}
            className="mt-2 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-primary"
          >
            All {ARTICLE_HUBS[hub].title}
          </Link>
        </nav>
      )}
    </div>
  );
}
