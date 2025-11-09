// @ts-nocheck - Temporarily disabled pending database migrations
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { BarChart3, TrendingUp, Activity } from "lucide-react";

interface ComparativeAnalysisProps {
  dateRange: { from: Date; to: Date };
  connectedProviders: any[];
}

const PROVIDER_COLORS: Record<string, string> = {
  google_analytics: "#0ea5e9",
  google_search_console: "#8b5cf6",
  bing_webmaster: "#10b981",
  yandex_webmaster: "#f59e0b",
};

export function ComparativeAnalysis({ dateRange, connectedProviders }: ComparativeAnalysisProps) {
  const [loading, setLoading] = useState(true);
  const [comparisonData, setComparisonData] = useState<any[]>([]);
  const [radarData, setRadarData] = useState<any[]>([]);

  useEffect(() => {
    loadComparativeData();
  }, [dateRange, connectedProviders]);

  const loadComparativeData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get traffic data for all providers
      const providerPromises = connectedProviders.map(async (provider) => {
        const { data } = await supabase
          .rpc("get_traffic_summary", {
            p_user_id: user.id,
            p_start_date: format(dateRange.from, "yyyy-MM-dd"),
            p_end_date: format(dateRange.to, "yyyy-MM-dd"),
          });

        const totals = (data || []).reduce(
          (acc: any, item: any) => ({
            sessions: acc.sessions + (item.total_sessions || 0),
            users: acc.users + (item.total_users || 0),
            pageviews: acc.pageviews + (item.total_pageviews || 0),
          }),
          { sessions: 0, users: 0, pageviews: 0 }
        );

        return {
          provider: getProviderLabel(provider.provider_name),
          ...totals,
        };
      });

      const results = await Promise.all(providerPromises);
      setComparisonData(results);

      // Create radar chart data (normalized to 0-100 scale)
      const maxValues = results.reduce(
        (max, item) => ({
          sessions: Math.max(max.sessions, item.sessions),
          users: Math.max(max.users, item.users),
          pageviews: Math.max(max.pageviews, item.pageviews),
        }),
        { sessions: 0, users: 0, pageviews: 0 }
      );

      const radar = results.map((item) => ({
        provider: item.provider,
        Sessions: maxValues.sessions > 0 ? (item.sessions / maxValues.sessions) * 100 : 0,
        Users: maxValues.users > 0 ? (item.users / maxValues.users) * 100 : 0,
        Pageviews: maxValues.pageviews > 0 ? (item.pageviews / maxValues.pageviews) * 100 : 0,
      }));

      setRadarData(radar);
    } catch (error) {
      console.error("Error loading comparative data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getProviderLabel = (providerName: string) => {
    const labels: Record<string, string> = {
      google_analytics: "Google Analytics",
      google_search_console: "Search Console",
      bing_webmaster: "Bing",
      yandex_webmaster: "Yandex",
    };
    return labels[providerName] || providerName;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-6">
            <div className="animate-pulse space-y-3">
              <div className="h-64 bg-muted rounded"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (connectedProviders.length < 2) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
            <p className="text-muted-foreground">
              Connect at least 2 platforms to compare analytics
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Platform Comparison Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Platform Comparison</CardTitle>
          <CardDescription>Compare traffic metrics across platforms</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={comparisonData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="provider" />
              <YAxis />
              <Tooltip formatter={(value: number) => formatNumber(value)} />
              <Legend />
              <Bar dataKey="sessions" fill="#0ea5e9" name="Sessions" />
              <Bar dataKey="users" fill="#8b5cf6" name="Users" />
              <Bar dataKey="pageviews" fill="#10b981" name="Pageviews" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Radar Chart for Relative Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Relative Performance</CardTitle>
          <CardDescription>Normalized comparison across all metrics (0-100 scale)</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="provider" />
              <PolarRadiusAxis angle={90} domain={[0, 100]} />
              <Radar
                name="Sessions"
                dataKey="Sessions"
                stroke="#0ea5e9"
                fill="#0ea5e9"
                fillOpacity={0.3}
              />
              <Radar
                name="Users"
                dataKey="Users"
                stroke="#8b5cf6"
                fill="#8b5cf6"
                fillOpacity={0.3}
              />
              <Radar
                name="Pageviews"
                dataKey="Pageviews"
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.3}
              />
              <Legend />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Detailed Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Metrics</CardTitle>
          <CardDescription>Side-by-side comparison of all platforms</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {comparisonData.map((platform, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    {platform.provider}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Sessions:</span>
                    <Badge variant="secondary">{formatNumber(platform.sessions)}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Users:</span>
                    <Badge variant="secondary">{formatNumber(platform.users)}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Pageviews:</span>
                    <Badge variant="secondary">{formatNumber(platform.pageviews)}</Badge>
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
