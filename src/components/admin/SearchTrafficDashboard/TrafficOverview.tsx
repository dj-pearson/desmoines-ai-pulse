import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Eye,
  MousePointer,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Smartphone,
  Monitor,
  Tablet,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createLogger } from "@/lib/logger";

const log = createLogger("TrafficOverview");

interface TrafficOverviewProps {
  dateRange: { from: Date; to: Date };
  propertyId: string;
  connectedProviders: { id: string }[];
}

const COLORS = {
  primary: "#0ea5e9",
  secondary: "#8b5cf6",
  success: "#10b981",
  warning: "#f59e0b",
};
const DEVICE_COLORS = ["#0ea5e9", "#8b5cf6", "#10b981"];

export function TrafficOverview({ dateRange, propertyId, connectedProviders }: TrafficOverviewProps) {
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<any[]>([]);
  const [deviceData, setDeviceData] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalImpressions: 0,
    totalClicks: 0,
    avgCTR: 0,
    avgPosition: 0,
    impressionsChange: 0,
    clicksChange: 0,
  });

  useEffect(() => {
    loadTrafficData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, propertyId]);

  const loadTrafficData = async () => {
    try {
      setLoading(true);

      const fromStr = format(dateRange.from, "yyyy-MM-dd");
      const toStr = format(dateRange.to, "yyyy-MM-dd");

      // Previous period for comparison
      const daysDiff = Math.ceil(
        (dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24)
      );
      const prevFrom = format(subDays(dateRange.from, daysDiff), "yyyy-MM-dd");
      const prevTo = format(subDays(dateRange.from, 1), "yyyy-MM-dd");

      const buildQuery = (from: string, to: string) => {
        let q = supabase
          .from("gsc_page_performance" as any)
          .select("date, impressions, clicks, ctr, position, impressions_mobile, impressions_desktop, impressions_tablet")
          .gte("date", from)
          .lte("date", to);

        if (propertyId !== "all") {
          q = q.eq("property_id", propertyId);
        } else if (connectedProviders.length > 0) {
          q = q.in("property_id", connectedProviders.map((p) => p.id));
        }
        return q;
      };

      const [{ data: current }, { data: previous }] = await Promise.all([
        buildQuery(fromStr, toStr),
        buildQuery(prevFrom, prevTo),
      ]);

      const currentRows = (current || []) as any[];
      const previousRows = (previous || []) as any[];

      // Aggregate current period by date
      const dateAgg: Record<string, { date: string; impressions: number; clicks: number; count: number; position: number }> = {};
      for (const row of currentRows) {
        const key = format(new Date(row.date), "MMM dd");
        if (!dateAgg[key]) dateAgg[key] = { date: key, impressions: 0, clicks: 0, count: 0, position: 0 };
        dateAgg[key].impressions += row.impressions ?? 0;
        dateAgg[key].clicks += row.clicks ?? 0;
        dateAgg[key].position += row.position ?? 0;
        dateAgg[key].count += 1;
      }
      setChartData(Object.values(dateAgg));

      // Device breakdown (aggregate across all rows for current period)
      const mobile = currentRows.reduce((s, r) => s + (r.impressions_mobile ?? 0), 0);
      const desktop = currentRows.reduce((s, r) => s + (r.impressions_desktop ?? 0), 0);
      const tablet = currentRows.reduce((s, r) => s + (r.impressions_tablet ?? 0), 0);
      const deviceTotal = mobile + desktop + tablet;

      if (deviceTotal > 0) {
        setDeviceData([
          { name: "Desktop", value: desktop },
          { name: "Mobile", value: mobile },
          { name: "Tablet", value: tablet },
        ].filter((d) => d.value > 0));
      }

      // Summary stats
      const totalImpressions = currentRows.reduce((s, r) => s + (r.impressions ?? 0), 0);
      const totalClicks = currentRows.reduce((s, r) => s + (r.clicks ?? 0), 0);
      const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      const avgPosition = currentRows.length > 0
        ? currentRows.reduce((s, r) => s + (r.position ?? 0), 0) / currentRows.length
        : 0;

      const prevImpressions = previousRows.reduce((s, r) => s + (r.impressions ?? 0), 0);
      const prevClicks = previousRows.reduce((s, r) => s + (r.clicks ?? 0), 0);

      const pctChange = (curr: number, prev: number) =>
        prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100;

      setStats({
        totalImpressions,
        totalClicks,
        avgCTR,
        avgPosition,
        impressionsChange: pctChange(totalImpressions, prevImpressions),
        clicksChange: pctChange(totalClicks, prevClicks),
      });
    } catch (error) {
      log.error("loadData", "Error loading traffic overview", { data: error });
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toString();
  };

  const getDeviceIcon = (name: string) => {
    if (name === "Mobile") return <Smartphone className="h-4 w-4" />;
    if (name === "Tablet") return <Tablet className="h-4 w-4" />;
    return <Monitor className="h-4 w-4" />;
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-muted rounded w-24" />
                <div className="h-8 bg-muted rounded w-32" />
                <div className="h-3 bg-muted rounded w-20" />
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
          Connect Google Search Console to see traffic data. Use the <strong>Connect</strong> button in the setup panel below.
        </AlertDescription>
      </Alert>
    );
  }

  const metricCards = [
    {
      title: "Total Impressions",
      value: formatNumber(stats.totalImpressions),
      change: stats.impressionsChange,
      icon: <Eye className="h-4 w-4" />,
    },
    {
      title: "Total Clicks",
      value: formatNumber(stats.totalClicks),
      change: stats.clicksChange,
      icon: <MousePointer className="h-4 w-4" />,
    },
    {
      title: "Avg CTR",
      value: `${stats.avgCTR.toFixed(2)}%`,
      change: null,
      icon: <ArrowUpRight className="h-4 w-4" />,
    },
    {
      title: "Avg Position",
      value: stats.avgPosition.toFixed(1),
      change: null,
      icon: <Search className="h-4 w-4" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metricCards.map((m, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{m.title}</CardTitle>
              {m.icon}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{m.value}</div>
              {m.change !== null && (
                <div className="flex items-center text-xs text-muted-foreground mt-1">
                  {m.change >= 0 ? (
                    <ArrowUpRight className="h-3 w-3 text-green-500 mr-1" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 text-red-500 mr-1" />
                  )}
                  <span className={m.change >= 0 ? "text-green-500" : "text-red-500"}>
                    {Math.abs(m.change).toFixed(1)}%
                  </span>
                  <span className="ml-1">vs prev period</span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Impressions &amp; Clicks Trend</CardTitle>
          <CardDescription>Daily organic search performance</CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorImpressions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.secondary} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.secondary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="impressions"
                  stroke={COLORS.primary}
                  fillOpacity={1}
                  fill="url(#colorImpressions)"
                  name="Impressions"
                />
                <Area
                  type="monotone"
                  dataKey="clicks"
                  stroke={COLORS.secondary}
                  fillOpacity={1}
                  fill="url(#colorClicks)"
                  name="Clicks"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No data yet — click <strong>Sync Data</strong> to pull from Search Console.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Device Breakdown */}
      {deviceData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Device Breakdown</CardTitle>
            <CardDescription>Impressions by device type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2 items-center">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={deviceData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    dataKey="value"
                  >
                    {deviceData.map((_, index) => (
                      <Cell key={index} fill={DEVICE_COLORS[index % DEVICE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatNumber(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {deviceData.map((device, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getDeviceIcon(device.name)}
                      <span className="text-sm">{device.name}</span>
                    </div>
                    <Badge variant="secondary">{formatNumber(device.value)}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
