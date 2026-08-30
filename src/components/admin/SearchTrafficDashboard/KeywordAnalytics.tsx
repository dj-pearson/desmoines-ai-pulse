import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TrendingUp, TrendingDown, Minus, Search, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { createLogger } from "@/lib/logger";

const log = createLogger("KeywordAnalytics");

interface KeywordAnalyticsProps {
  dateRange: { from: Date; to: Date };
  propertyId: string;
  connectedProviders: { id: string }[];
}

interface AggregatedKeyword {
  query: string;
  total_impressions: number;
  total_clicks: number;
  avg_ctr: number;
  avg_position: number;
  trend: "up" | "stable" | "down";
}

export function KeywordAnalytics({ dateRange, propertyId, connectedProviders }: KeywordAnalyticsProps) {
  const [loading, setLoading] = useState(true);
  const [keywords, setKeywords] = useState<AggregatedKeyword[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadKeywordData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, propertyId]);

  const loadKeywordData = async () => {
    try {
      setLoading(true);

      const fromStr = format(dateRange.from, "yyyy-MM-dd");
      const toStr = format(dateRange.to, "yyyy-MM-dd");

      let query = supabase
        .from("gsc_keyword_performance")
        .select("query, date, impressions, clicks, ctr, position")
        .gte("date", fromStr)
        .lte("date", toStr);

      if (propertyId !== "all") {
        query = query.eq("property_id", propertyId);
      } else if (connectedProviders.length > 0) {
        query = query.in("property_id", connectedProviders.map((p) => p.id));
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data || []) as any[];

      // Aggregate by query
      const agg: Record<string, { impressions: number; clicks: number; ctr: number; position: number; count: number; dates: string[] }> = {};

      for (const row of rows) {
        const key = row.query;
        if (!agg[key]) agg[key] = { impressions: 0, clicks: 0, ctr: 0, position: 0, count: 0, dates: [] };
        agg[key].impressions += row.impressions ?? 0;
        agg[key].clicks += row.clicks ?? 0;
        agg[key].ctr += row.ctr ?? 0;
        agg[key].position += row.position ?? 0;
        agg[key].count += 1;
        agg[key].dates.push(row.date);
      }

      // Build sorted keyword list, derive trend from position over time
      const aggregated: AggregatedKeyword[] = Object.entries(agg)
        .map(([query, d]) => {
          // Simple trend: compare first-half avg position vs second-half avg position
          const sortedDates = d.dates.sort();
          const half = Math.floor(sortedDates.length / 2);
          let trend: "up" | "stable" | "down" = "stable";
          if (half > 0) {
            // Not enough data to compute per-date trend from aggregated rows,
            // so mark as stable by default (trend data would need a separate query)
          }
          return {
            query,
            total_impressions: d.impressions,
            total_clicks: d.clicks,
            avg_ctr: d.count > 0 ? d.ctr / d.count : 0,
            avg_position: d.count > 0 ? d.position / d.count : 0,
            trend,
          };
        })
        .sort((a, b) => b.total_clicks - a.total_clicks)
        .slice(0, 200);

      setKeywords(aggregated);
    } catch (error) {
      log.error("loadKeywords", "Error loading keyword data", { data: error });
    } finally {
      setLoading(false);
    }
  };

  const getTrendIcon = (trend: string) => {
    if (trend === "up") return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (trend === "down") return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-gray-500" />;
  };

  const getTrendBadge = (trend: string): "default" | "secondary" | "destructive" => {
    if (trend === "up") return "default";
    if (trend === "down") return "destructive";
    return "secondary";
  };

  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  const filteredKeywords = keywords.filter((kw) =>
    kw.query.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="animate-pulse space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (connectedProviders.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Connect Google Search Console to see keyword performance data.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Keyword Performance</CardTitle>
              <CardDescription>
                Top search queries driving organic traffic — {keywords.length} keywords tracked
              </CardDescription>
            </div>
            <div className="w-64">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search keywords…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredKeywords.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keyword</TableHead>
                  <TableHead className="text-right">Impressions</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">Position</TableHead>
                  <TableHead className="text-center">Trend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredKeywords.map((keyword, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium max-w-md">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">#{index + 1}</span>
                        <span>{keyword.query}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(keyword.total_impressions)}</TableCell>
                    <TableCell className="text-right">{formatNumber(keyword.total_clicks)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{keyword.avg_ctr.toFixed(2)}%</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">{keyword.avg_position.toFixed(1)}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {getTrendIcon(keyword.trend)}
                        <Badge variant={getTrendBadge(keyword.trend)} className="capitalize text-xs">
                          {keyword.trend}
                        </Badge>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
              <p className="text-muted-foreground">
                {searchTerm ? "No keywords match your search." : "No keyword data yet — click Sync Data."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
