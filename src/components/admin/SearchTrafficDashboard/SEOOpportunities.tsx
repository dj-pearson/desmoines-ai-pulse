// @ts-nocheck - Temporarily disabled pending database migrations
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Lightbulb,
  TrendingDown,
  Target,
  Zap,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface SEOOpportunitiesProps {
  dateRange: { from: Date; to: Date };
  selectedProvider: string;
}

export function SEOOpportunities({ dateRange, selectedProvider }: SEOOpportunitiesProps) {
  const [loading, setLoading] = useState(true);
  const [opportunities, setOpportunities] = useState<any[]>([]);

  useEffect(() => {
    loadOpportunities();
  }, [dateRange, selectedProvider]);

  const loadOpportunities = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const daysDiff = Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24));

      const { data, error } = await supabase.rpc("get_seo_opportunities", {
        p_user_id: user.id,
        p_days_back: daysDiff,
      });

      if (error) throw error;
      setOpportunities(data || []);
    } catch (error) {
      console.error("Error loading opportunities:", error);
    } finally {
      setLoading(false);
    }
  };

  const getOpportunityIcon = (type: string) => {
    switch (type) {
      case "Low CTR":
        return <Target className="h-5 w-5 text-orange-500" />;
      case "Near First Page":
        return <TrendingDown className="h-5 w-5 text-blue-500" />;
      case "Declining Keyword":
        return <Zap className="h-5 w-5 text-red-500" />;
      default:
        return <Lightbulb className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getImpactColor = (impact: string) => {
    const colors: Record<string, string> = {
      High: "destructive",
      Medium: "default",
      Low: "secondary",
    };
    return colors[impact] || "secondary";
  };

  const formatNumber = (num: number | null) => {
    if (!num) return "N/A";
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="animate-pulse space-y-3">
                <div className="h-6 bg-muted rounded w-48"></div>
                <div className="h-4 bg-muted rounded w-full"></div>
                <div className="h-4 bg-muted rounded w-3/4"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (opportunities.length === 0) {
    return (
      <Alert>
        <Lightbulb className="h-4 w-4" />
        <AlertDescription>
          No SEO opportunities found for the selected period. This could mean your SEO is already optimized!
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
            SEO Opportunities
          </CardTitle>
          <CardDescription>
            Actionable insights to improve your search performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {opportunities.map((opp, index) => (
              <Card key={index} className="border-l-4" style={{
                borderLeftColor: opp.potential_impact === "High" ? "#ef4444" : opp.potential_impact === "Medium" ? "#0ea5e9" : "#6b7280"
              }}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {getOpportunityIcon(opp.opportunity_type)}
                      <div>
                        <CardTitle className="text-base">{opp.opportunity_type}</CardTitle>
                        <CardDescription className="text-xs mt-1">
                          <span className="font-mono text-xs">{opp.query || "Multiple keywords"}</span>
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant={getImpactColor(opp.potential_impact) as any}>
                      {opp.potential_impact} Impact
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {opp.page && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">Page: </span>
                      <span className="font-mono">{opp.page}</span>
                    </div>
                  )}

                  {(opp.impressions || opp.clicks) && (
                    <div className="flex gap-4 text-sm">
                      {opp.impressions && (
                        <div>
                          <span className="text-muted-foreground">Impressions: </span>
                          <span className="font-medium">{formatNumber(opp.impressions)}</span>
                        </div>
                      )}
                      {opp.clicks && (
                        <div>
                          <span className="text-muted-foreground">Clicks: </span>
                          <span className="font-medium">{formatNumber(opp.clicks)}</span>
                        </div>
                      )}
                      {opp.ctr && (
                        <div>
                          <span className="text-muted-foreground">CTR: </span>
                          <span className="font-medium">{Number(opp.ctr).toFixed(2)}%</span>
                        </div>
                      )}
                      {opp.position && (
                        <div>
                          <span className="text-muted-foreground">Position: </span>
                          <span className="font-medium">{Number(opp.position).toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <Alert className="bg-muted/50 border-0">
                    <ArrowRight className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      <strong>Recommendation:</strong> {opp.recommendation}
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
