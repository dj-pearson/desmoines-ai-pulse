import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lightbulb, TrendingDown, Target, Zap, AlertCircle, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { createLogger } from "@/lib/logger";

const log = createLogger("SEOOpportunities");

interface SEOOpportunitiesProps {
  dateRange: { from: Date; to: Date };
  propertyId: string;
  connectedProviders: { id: string }[];
}

interface Opportunity {
  type: "Near First Page" | "Low CTR" | "High Impressions No Clicks";
  query: string;
  page: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
  impact: "High" | "Medium" | "Low";
  suggestion: string;
}

export function SEOOpportunities({ dateRange, propertyId, connectedProviders }: SEOOpportunitiesProps) {
  const [loading, setLoading] = useState(true);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);

  useEffect(() => {
    loadOpportunities();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, propertyId]);

  const loadOpportunities = async () => {
    try {
      setLoading(true);

      // Pull keyword performance data and derive opportunities client-side
      let query = supabase
        .from("gsc_keyword_performance")
        .select("query, page_url, impressions, clicks, ctr, position")
        .gte("date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("date", format(dateRange.to, "yyyy-MM-dd"));

      if (propertyId !== "all") {
        query = query.eq("property_id", propertyId);
      } else if (connectedProviders.length > 0) {
        query = query.in("property_id", connectedProviders.map((p) => p.id));
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data || []) as any[];

      // Aggregate by query+page
      const agg: Record<string, { query: string; page: string; impressions: number; clicks: number; ctr: number; position: number; count: number }> = {};

      for (const row of rows) {
        const key = `${row.query}||${row.page_url}`;
        if (!agg[key]) {
          agg[key] = { query: row.query, page: row.page_url, impressions: 0, clicks: 0, ctr: 0, position: 0, count: 0 };
        }
        agg[key].impressions += row.impressions ?? 0;
        agg[key].clicks += row.clicks ?? 0;
        agg[key].ctr += row.ctr ?? 0;
        agg[key].position += row.position ?? 0;
        agg[key].count += 1;
      }

      const derived: Opportunity[] = [];

      for (const d of Object.values(agg)) {
        const avgPos = d.count > 0 ? d.position / d.count : 0;
        const avgCTR = d.count > 0 ? d.ctr / d.count : 0;

        // Near First Page: position 4–20 with decent impressions
        if (avgPos >= 4 && avgPos <= 20 && d.impressions >= 50) {
          derived.push({
            type: "Near First Page",
            query: d.query,
            page: d.page,
            impressions: d.impressions,
            clicks: d.clicks,
            ctr: avgCTR,
            position: avgPos,
            impact: avgPos <= 10 ? "High" : "Medium",
            suggestion: `Improve content and internal links to push "${d.query}" from position ${avgPos.toFixed(1)} into the top 3.`,
          });
        }

        // Low CTR: high impressions, below-average CTR (< 2%)
        if (d.impressions >= 100 && avgCTR < 2 && avgPos <= 15) {
          derived.push({
            type: "Low CTR",
            query: d.query,
            page: d.page,
            impressions: d.impressions,
            clicks: d.clicks,
            ctr: avgCTR,
            position: avgPos,
            impact: d.impressions >= 500 ? "High" : "Medium",
            suggestion: `Rewrite the title tag and meta description for "${d.query}" to increase click-through rate.`,
          });
        }

        // High impressions, zero clicks
        if (d.impressions >= 200 && d.clicks === 0) {
          derived.push({
            type: "High Impressions No Clicks",
            query: d.query,
            page: d.page,
            impressions: d.impressions,
            clicks: 0,
            ctr: 0,
            position: avgPos,
            impact: "High",
            suggestion: `"${d.query}" gets impressions but zero clicks. Add a compelling meta description and review your snippet.`,
          });
        }
      }

      // Deduplicate by query+type and sort by impact + impressions
      const seen = new Set<string>();
      const unique = derived.filter((o) => {
        const key = `${o.type}||${o.query}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      unique.sort((a, b) => {
        const impactOrder = { High: 0, Medium: 1, Low: 2 };
        const diff = impactOrder[a.impact] - impactOrder[b.impact];
        return diff !== 0 ? diff : b.impressions - a.impressions;
      });

      setOpportunities(unique.slice(0, 20));
    } catch (error) {
      log.error("loadData", "Error loading SEO opportunities", { data: error });
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (type: string) => {
    if (type === "Low CTR") return <Target className="h-5 w-5 text-orange-500" />;
    if (type === "Near First Page") return <TrendingDown className="h-5 w-5 text-blue-500" />;
    if (type === "High Impressions No Clicks") return <Zap className="h-5 w-5 text-red-500" />;
    return <Lightbulb className="h-5 w-5 text-yellow-500" />;
  };

  const impactColor = (impact: string) => {
    if (impact === "High") return "#ef4444";
    if (impact === "Medium") return "#0ea5e9";
    return "#6b7280";
  };

  const impactVariant = (impact: string): "destructive" | "default" | "secondary" => {
    if (impact === "High") return "destructive";
    if (impact === "Medium") return "default";
    return "secondary";
  };

  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toLocaleString());

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="animate-pulse space-y-3">
                <div className="h-6 bg-muted rounded w-48" />
                <div className="h-4 bg-muted rounded w-full" />
                <div className="h-4 bg-muted rounded w-3/4" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (connectedProviders.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Connect Google Search Console to see SEO opportunities.
        </AlertDescription>
      </Alert>
    );
  }

  if (opportunities.length === 0) {
    return (
      <Alert>
        <Lightbulb className="h-4 w-4" />
        <AlertDescription>
          No SEO opportunities detected in this period. Either your SEO is already optimized or you need to sync more data first.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            SEO Opportunities ({opportunities.length})
          </CardTitle>
          <CardDescription>
            Actionable insights derived from your Search Console data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {opportunities.map((opp, index) => (
              <Card
                key={index}
                className="border-l-4"
                style={{ borderLeftColor: impactColor(opp.impact) }}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {getIcon(opp.type)}
                      <div>
                        <CardTitle className="text-base">{opp.type}</CardTitle>
                        <CardDescription className="font-mono text-xs mt-1 truncate max-w-xs">
                          {opp.query}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant={impactVariant(opp.impact)}>{opp.impact} Impact</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-xs text-muted-foreground truncate">
                    Page: <span className="font-mono">{opp.page}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Impressions</p>
                      <p className="font-semibold">{fmt(opp.impressions)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Clicks</p>
                      <p className="font-semibold">{fmt(opp.clicks)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Position</p>
                      <p className="font-semibold">{opp.position.toFixed(1)}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 bg-muted/50 rounded p-3 text-sm">
                    <ArrowRight className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                    <p className="text-muted-foreground">{opp.suggestion}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
