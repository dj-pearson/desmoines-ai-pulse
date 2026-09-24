import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIME } from "@/lib/queryConfig";
import { articleMatchesHub, type HubKey } from "@/lib/articleHubs";

const HUB_RAIL_ROWS = 40;

interface HubArticlesProps {
  hub: HubKey;
  title?: string;
  limit?: number;
  className?: string;
}

/**
 * The hub half of "every article links into its hub and the hub links back"
 * (SEO-015, SEO-019). Published articles whose title, category or tags match
 * this hub, newest first. Renders nothing when none match, so a hub never
 * ships an empty "guides" block.
 */
export function HubArticles({ hub, title = "Guides from Des Moines Insider", limit = 4, className = "" }: HubArticlesProps) {
  // 40 newest published articles, matched client-side by articleMatchesHub.
  // It was 100 rows to show at most four links below the fold; 40 still covers
  // several months of publishing for every hub (events plan WP7 item 4). The
  // key is shared, so every hub on a visit reuses one fetch.
  const { data } = useQuery({
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

  const matches = (data ?? []).filter((a) => a.slug && articleMatchesHub(a, hub)).slice(0, limit);
  if (matches.length === 0) return null;

  return (
    <nav aria-label={title} className={className}>
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      <ul>
        {matches.map((a) => (
          <li key={a.id}>
            <Link to={`/articles/${a.slug}`} className="inline-flex min-h-11 items-center text-primary hover:underline">
              {a.title}
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/articles" className="mt-3 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-primary">
        All articles
      </Link>
    </nav>
  );
}
