import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
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
  Users,
  Eye,
  MousePointer,
  Activity,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Smartphone,
  Monitor,
  Tablet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

interface TrafficOverviewProps {
  dateRange: { from: Date; to: Date };
  selectedProvider: string;
}

interface MetricCard {
  title: string;
  value: string;
  change: number;
  trend: "up" | "down";
  icon: React.ReactNode;
}

interface ChartDataPoint {
  date: string;
  sessions: number;
  users: number;
  pageviews: number;
  bounceRate: number;
}

const COLORS = {
  primary: "#0ea5e9",
  secondary: "#8b5cf6",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
};

const DEVICE_COLORS = ["#0ea5e9", "#8b5cf6", "#10b981"];

export function TrafficOverview({ dateRange, selectedProvider }: TrafficOverviewProps) {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<MetricCard[]>([]);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [deviceData, setDeviceData] = useState<any[]>([]);
  const [countryData, setCountryData] = useState<any[]>([]);

  useEffect(() => {
    loadTrafficData();
  }, [dateRange, selectedProvider]);

  const loadTrafficData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get traffic summary
      const { data: summaryData, error: summaryError } = await supabase
        .rpc("get_traffic_summary", {
          p_user_id: user.id,
          p_start_date: format(dateRange.from, "yyyy-MM-dd"),
          p_end_date: format(dateRange.to, "yyyy-MM-dd"),
        });

      if (summaryError) throw summaryError;

      // Get previous period data for comparison
      const daysDiff = Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24));
      const prevStart = new Date(dateRange.from);
      prevStart.setDate(prevStart.getDate() - daysDiff);
      const prevEnd = new Date(dateRange.from);
      prevEnd.setDate(prevEnd.getDate() - 1);

      const { data: prevData } = await supabase
        .rpc("get_traffic_summary", {
          p_user_id: user.id,
          p_start_date: format(prevStart, "yyyy-MM-dd"),
          p_end_date: format(prevEnd, "yyyy-MM-dd"),
        });

      // Calculate totals and changes
      const currentTotals = calculateTotals(summaryData || []);
      const previousTotals = calculateTotals(prevData || []);
      const changes = calculateChanges(currentTotals, previousTotals);

      // Set metric cards
      setMetrics([
        {
          title: "Total Sessions",
          value: formatNumber(currentTotals.sessions),
          change: changes.sessions,
          trend: changes.sessions >= 0 ? "up" : "down",
          icon: <Activity className="h-4 w-4" />,
        },
        {
          title: "Unique Users",
          value: formatNumber(currentTotals.users),
          change: changes.users,
          trend: changes.users >= 0 ? "up" : "down",
          icon: <Users className="h-4 w-4" />,
        },
        {
          title: "Page Views",
          value: formatNumber(currentTotals.pageviews),
          change: changes.pageviews,
          trend: changes.pageviews >= 0 ? "up" : "down",
          icon: <Eye className="h-4 w-4" />,
        },
        {
          title: "Avg. Bounce Rate",
          value: `${currentTotals.bounceRate.toFixed(1)}%`,
          change: changes.bounceRate,
          trend: changes.bounceRate <= 0 ? "up" : "down", // Lower is better for bounce rate
          icon: <MousePointer className="h-4 w-4" />,
        },
      ]);

      // Format chart data
      const formattedChartData: ChartDataPoint[] = (summaryData || []).map((item: any) => ({
        date: format(new Date(item.metric_date), "MMM dd"),
        sessions: item.total_sessions || 0,
        users: item.total_users || 0,
        pageviews: item.total_pageviews || 0,
        bounceRate: item.avg_bounce_rate || 0,
      }));

      setChartData(formattedChartData);

      // Load device breakdown
      const { data: deviceBreakdown } = await supabase
        .from("traffic_metrics")
        .select("device_category, sessions, users")
        .eq("user_id", user.id)
        .gte("metric_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("metric_date", format(dateRange.to, "yyyy-MM-dd"));

      if (deviceBreakdown) {
        const deviceAgg = aggregateByField(deviceBreakdown, "device_category");
        setDeviceData(deviceAgg);
      }

      // Load country breakdown
      const { data: countryBreakdown } = await supabase
        .from("traffic_metrics")
        .select("country, sessions, users")
        .eq("user_id", user.id)
        .gte("metric_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("metric_date", format(dateRange.to, "yyyy-MM-dd"))
        .not("country", "is", null)
        .order("sessions", { ascending: false })
        .limit(10);

      if (countryBreakdown) {
        setCountryData(countryBreakdown);
      }
    } catch (error) {
      console.error("Error loading traffic data:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateTotals = (data: any[]) => {
    return data.reduce(
      (acc, item) => ({
        sessions: acc.sessions + (item.total_sessions || 0),
        users: acc.users + (item.total_users || 0),
        pageviews: acc.pageviews + (item.total_pageviews || 0),
        bounceRate: acc.bounceRate + (item.avg_bounce_rate || 0),
        count: acc.count + 1,
      }),
      { sessions: 0, users: 0, pageviews: 0, bounceRate: 0, count: 0 }
    );
  };

  const calculateChanges = (current: any, previous: any) => {
    const calcChange = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return ((curr - prev) / prev) * 100;
    };

    return {
      sessions: calcChange(current.sessions, previous.sessions),
      users: calcChange(current.users, previous.users),
      pageviews: calcChange(current.pageviews, previous.pageviews),
      bounceRate: calcChange(
        current.bounceRate / (current.count || 1),
        previous.bounceRate / (previous.count || 1)
      ),
    };
  };

  const aggregateByField = (data: any[], field: string) => {
    const agg = data.reduce((acc, item) => {
      const key = item[field] || "Unknown";
      if (!acc[key]) {
        acc[key] = { name: key, value: 0, sessions: 0 };
      }
      acc[key].value += item.sessions || 0;
      acc[key].sessions += item.sessions || 0;
      return acc;
    }, {} as Record<string, any>);

    return Object.values(agg).sort((a: any, b: any) => b.value - a.value);
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getDeviceIcon = (device: string) => {
    const deviceLower = device.toLowerCase();
    if (deviceLower.includes("mobile")) return <Smartphone className="h-4 w-4" />;
    if (deviceLower.includes("tablet")) return <Tablet className="h-4 w-4" />;
    return <Monitor className="h-4 w-4" />;
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-muted rounded w-24"></div>
                <div className="h-8 bg-muted rounded w-32"></div>
                <div className="h-3 bg-muted rounded w-20"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{metric.title}</CardTitle>
              {metric.icon}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metric.value}</div>
              <div className="flex items-center text-xs text-muted-foreground mt-1">
                {metric.trend === "up" ? (
                  <ArrowUpRight className="h-3 w-3 text-green-500 mr-1" />
                ) : (
                  <ArrowDownRight className="h-3 w-3 text-red-500 mr-1" />
                )}
                <span className={metric.trend === "up" ? "text-green-500" : "text-red-500"}>
                  {Math.abs(metric.change).toFixed(1)}%
                </span>
                <span className="ml-1">vs previous period</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Traffic Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Traffic Trend</CardTitle>
          <CardDescription>Daily sessions, users, and pageviews over time</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
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
                dataKey="sessions"
                stroke={COLORS.primary}
                fillOpacity={1}
                fill="url(#colorSessions)"
                name="Sessions"
              />
              <Area
                type="monotone"
                dataKey="users"
                stroke={COLORS.secondary}
                fillOpacity={1}
                fill="url(#colorUsers)"
                name="Users"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Device & Country Breakdown */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Device Breakdown</CardTitle>
            <CardDescription>Sessions by device type</CardDescription>
          </CardHeader>
          <CardContent>
            {deviceData.length > 0 ? (
              <div className="space-y-4">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={deviceData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {deviceData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={DEVICE_COLORS[index % DEVICE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {deviceData.map((device, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getDeviceIcon(device.name)}
                        <span className="text-sm">{device.name}</span>
                      </div>
                      <Badge variant="secondary">{formatNumber(device.sessions)}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No device data available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Countries</CardTitle>
            <CardDescription>Sessions by country</CardDescription>
          </CardHeader>
          <CardContent>
            {countryData.length > 0 ? (
              <div className="space-y-3">
                {countryData.slice(0, 5).map((country, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">#{index + 1}</span>
                      <span className="text-sm">{country.country}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{formatNumber(country.users)} users</Badge>
                      <Badge>{formatNumber(country.sessions)} sessions</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No country data available</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
