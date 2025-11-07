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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrendingUp, TrendingDown, Minus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface KeywordAnalyticsProps {
  dateRange: { from: Date; to: Date };
  selectedProvider: string;
}

export function KeywordAnalytics({ dateRange, selectedProvider }: KeywordAnalyticsProps) {
  const [loading, setLoading] = useState(true);
  const [keywords, setKeywords] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadKeywordData();
  }, [dateRange, selectedProvider]);

  const loadKeywordData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Call the function to get top keywords
      const { data, error } = await supabase.rpc("get_top_keywords", {
        p_user_id: user.id,
        p_start_date: format(dateRange.from, "yyyy-MM-dd"),
        p_end_date: format(dateRange.to, "yyyy-MM-dd"),
        p_limit: 100,
      });

      if (error) throw error;

      // Get keyword rankings for trend data
      const { data: rankings } = await supabase
        .from("keyword_rankings")
        .select("*")
        .eq("user_id", user.id)
        .gte("tracked_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("tracked_date", format(dateRange.to, "yyyy-MM-dd"));

      // Merge data
      const enrichedKeywords = (data || []).map((kw: any) => {
        const rankingData = rankings?.find((r) => r.keyword.toLowerCase() === kw.query.toLowerCase());
        return {
          ...kw,
          trend: rankingData?.trend || "stable",
          position_change: rankingData?.position || null,
        };
      });

      setKeywords(enrichedKeywords);
    } catch (error) {
      console.error("Error loading keyword data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "up":
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case "down":
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  const getTrendBadge = (trend: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      up: "default",
      stable: "secondary",
      down: "destructive",
    };
    return variants[trend] || "secondary";
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
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
              <div key={i} className="h-12 bg-muted rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Keyword Performance</CardTitle>
              <CardDescription>Track your top-performing keywords and their trends</CardDescription>
            </div>
            <div className="w-64">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search keywords..."
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
                      <Badge variant="secondary">{Number(keyword.avg_ctr).toFixed(2)}%</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">{Number(keyword.avg_position).toFixed(1)}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        {getTrendIcon(keyword.trend)}
                        <Badge variant={getTrendBadge(keyword.trend)} className="capitalize">
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
                {searchTerm ? "No keywords match your search" : "No keyword data available"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
