import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Search, Eye, MousePointer, ArrowUpRight, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createLogger } from "@/lib/logger";

const log = createLogger("SearchPerformance");

interface SearchPerformanceProps {
  dateRange: { from: Date; to: Date };
  propertyId: string;
  connectedProviders: { id: string }[];
}

export function SearchPerformance({ dateRange, propertyId, connectedProviders }: SearchPerformanceProps) {
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<any[]>([]);
  const [topPages, setTopPages] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalImpressions: 0,
    totalClicks: 0,
    avgCTR: 0,
    avgPosition: 0,
  });

  useEffect(() => {
    loadSearchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, propertyId]);

  const loadSearchData = async () => {
    try {
      setLoading(true);

      // Build base query against gsc_page_performance
      let query = supabase
        .from("gsc_page_performance" as any)
        .select("page_url, date, impressions, clicks, ctr, position")
        .gte("date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("date", format(dateRange.to, "yyyy-MM-dd"))
        .order("date", { ascending: true });

      if (propertyId !== "all") {
        query = query.eq("property_id", propertyId);
      } else if (connectedProviders.length > 0) {
        query = query.in("property_id", connectedProviders.map((p) => p.id));
      }

      const { data: pageData, error } = await query;
      if (error) throw error;

      const rows = (pageData || []) as any[];

      // Aggregate by date for chart
      const dateAgg: Record<string, { date: string; impressions: number; clicks: number; ctr: number; position: number; count: number }> = {};

      for (const row of rows) {
        const dateKey = format(new Date(row.date), "MMM dd");
        if (!dateAgg[dateKey]) {
          dateAgg[dateKey] = { date: dateKey, impressions: 0, clicks: 0, ctr: 0, position: 0, count: 0 };
        }
        dateAgg[dateKey].impressions += row.impressions ?? 0;
        dateAgg[dateKey].clicks += row.clicks ?? 0;
        dateAgg[dateKey].ctr += row.ctr ?? 0;
        dateAgg[dateKey].position += row.position ?? 0;
        dateAgg[dateKey].count += 1;
      }

      const chart = Object.values(dateAgg).map((d) => ({
        ...d,
        avgCTR: d.count > 0 ? Number((d.ctr / d.count).toFixed(2)) : 0,
        avgPosition: d.count > 0 ? Number((d.position / d.count).toFixed(1)) : 0,
      }));

      setChartData(chart);

      // Overall stats
      const totalImpressions = rows.reduce((s, r) => s + (r.impressions ?? 0), 0);
      const totalClicks = rows.reduce((s, r) => s + (r.clicks ?? 0), 0);
      const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      const avgPosition = rows.length > 0
        ? rows.reduce((s, r) => s + (r.position ?? 0), 0) / rows.length
        : 0;

      setStats({ totalImpressions, totalClicks, avgCTR, avgPosition });

      // Top pages aggregated by page_url
      const pageAgg: Record<string, any> = {};
      for (const row of rows) {
        const key = row.page_url;
        if (!pageAgg[key]) {
          pageAgg[key] = { page: key, impressions: 0, clicks: 0, ctr: 0, position: 0, count: 0 };
        }
        pageAgg[key].impressions += row.impressions ?? 0;
        pageAgg[key].clicks += row.clicks ?? 0;
        pageAgg[key].ctr += row.ctr ?? 0;
        pageAgg[key].position += row.position ?? 0;
        pageAgg[key].count += 1;
      }

      const pages = Object.values(pageAgg)
        .map((p: any) => ({
          ...p,
          avgCTR: p.count > 0 ? (p.ctr / p.count).toFixed(2) : "0.00",
          avgPosition: p.count > 0 ? (p.position / p.count).toFixed(1) : "0.0",
        }))
        .sort((a: any, b: any) => b.clicks - a.clicks)
        .slice(0, 10);

      setTopPages(pages);
    } catch (error) {
      log.error("loadData", "Error loading search performance data", { data: error });
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-muted rounded w-24" />
                  <div className="h-8 bg-muted rounded w-32" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (connectedProviders.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Connect Google Search Console to see page performance data.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Impressions</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(stats.totalImpressions)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clicks</CardTitle>
            <MousePointer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(stats.totalClicks)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average CTR</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgCTR.toFixed(2)}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Position</CardTitle>
            <Search className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgPosition.toFixed(1)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Impressions & Clicks Trend */}
      <Card>
        <CardHeader>
          <CardTitle>Impressions &amp; Clicks Over Time</CardTitle>
          <CardDescription>Daily search performance from Google Search Console</CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="impressions"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  name="Impressions"
                  dot={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="clicks"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  name="Clicks"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No data yet — click <strong>Sync Data</strong> to pull from Search Console.
            </p>
          )}
        </CardContent>
      </Card>

      {/* CTR & Position Trend */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>CTR &amp; Position Trend</CardTitle>
            <CardDescription>Click-through rate and average ranking position over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" reversed />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="avgCTR"
                  stroke="#10b981"
                  strokeWidth={2}
                  name="Avg CTR (%)"
                  dot={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="avgPosition"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  name="Avg Position"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Top Pages */}
      <Card>
        <CardHeader>
          <CardTitle>Top Performing Pages</CardTitle>
          <CardDescription>Pages with the most organic search clicks</CardDescription>
        </CardHeader>
        <CardContent>
          {topPages.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Page</TableHead>
                  <TableHead className="text-right">Impressions</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">Avg Position</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topPages.map((page, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-mono text-xs max-w-md truncate">{page.page}</TableCell>
                    <TableCell className="text-right">{formatNumber(page.impressions)}</TableCell>
                    <TableCell className="text-right">{formatNumber(page.clicks)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{page.avgCTR}%</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">{page.avgPosition}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No page data available yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
