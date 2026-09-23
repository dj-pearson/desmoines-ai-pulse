import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIME } from "@/lib/queryConfig";
import { articleMatchesHub, type HubKey } from "@/lib/articleHubs";

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
  const { data } = useQuery({
    queryKey: ["articles", "hub-rail"],
    staleTime: STALE_TIME.REFERENCE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("articles")
        .select("id, slug, title, category, tags, published_at")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const matches = (data ?? []).filter((a) => a.slug && articleMatchesHub(a, hub)).slice(0, limit);
  if (matches.length === 0) return null;

  return (
    <nav aria-label={title} className={className}>
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      <ul className="space-y-2">
        {matches.map((a) => (
          <li key={a.id}>
            <Link to={`/articles/${a.slug}`} className="text-primary hover:underline">
              {a.title}
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/articles" className="mt-3 inline-block text-sm text-muted-foreground hover:text-primary">
        All articles
      </Link>
    </nav>
  );
}
