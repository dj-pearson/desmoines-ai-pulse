import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Users,
  Eye,
  Search,
  TrendingUp,
  Clock,
  MousePointer,
  Smartphone,
  Monitor,
  Tablet,
  Calendar,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface AnalyticsData {
  totalSessions: number;
  totalUsers: number;
  totalPageViews: number;
  totalSearches: number;
  avgSessionDuration: number;
  bounceRate: number;
  deviceBreakdown: { device: string; count: number; percentage: number }[];
  topSearches: { query: string; count: number }[];
  contentPopularity: { content_type: string; views: number }[];
  hourlyActivity: { hour: number; sessions: number; searches: number }[];
}

export default function AnalyticsDashboard() {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState("7d"); // 1d, 7d, 30d

  // Fetch analytics data
  useEffect(() => {
    const fetchAnalytics = async () => {
      setIsLoading(true);
      try {
        const days = dateRange === "1d" ? 1 : dateRange === "7d" ? 7 : 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // Get session analytics
        const { data: sessionData } = await supabase
          .from("user_analytics")
          .select("session_id, user_id, event_type, device_type, created_at")
          .gte("created_at", startDate.toISOString());

        // Get search analytics
        const { data: searchData } = await supabase
          .from("search_analytics")
          .select("query, category, created_at")
          .gte("created_at", startDate.toISOString());

        // Process the data
        const processedData = processAnalyticsData(
          sessionData || [],
          searchData || []
        );
        setAnalyticsData(processedData);
      } catch (error) {
        console.error("Error fetching analytics:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnalytics();
  }, [dateRange]);

  // Process raw analytics data
  const processAnalyticsData = (
    sessionData: Array<{
      session_id: string;
      user_id: string;
      event_type: string;
      created_at: string;
      device_type?: string;
    }>,
    searchData: Array<{
      query: string;
      category?: string;
      created_at: string;
    }>
  ): AnalyticsData => {
    // Calculate sessions and users
    const uniqueSessions = new Set(sessionData.map((d) => d.session_id));
    const uniqueUsers = new Set(
      sessionData.filter((d) => d.user_id).map((d) => d.user_id)
    );

    // Calculate page views
    const pageViews = sessionData.filter((d) => d.event_type === "view");

    // Device breakdown
    const deviceCounts = sessionData.reduce((acc, d) => {
      acc[d.device_type] = (acc[d.device_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const totalDeviceEvents = Object.values(deviceCounts).reduce(
      (sum, count) => sum + (count as number),
      0
    );
    const deviceBreakdown = Object.entries(deviceCounts).map(
      ([device, count]) => ({
        device,
        count: count as number,
        percentage: Math.round(((count as number) / totalDeviceEvents) * 100),
      })
    );

    // Top searches
    const searchCounts = searchData.reduce((acc, d) => {
      if (d.query && d.query.trim()) {
        acc[d.query.toLowerCase()] = (acc[d.query.toLowerCase()] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    const topSearches = Object.entries(searchCounts)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 10)
      .map(([query, count]) => ({ query, count: count as number }));

    // Content popularity (from view events - using event_type as proxy)
    const contentViews = sessionData
      .filter((d) => d.event_type === "view")
      .reduce((acc, d) => {
        acc[d.event_type] = (acc[d.event_type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    const contentPopularity = Object.entries(contentViews).map(
      ([content_type, views]) => ({
        content_type,
        views: views as number,
      })
    );

    // Hourly activity
    const hourlyData = Array.from({ length: 24 }, (_, hour) => {
      const hourSessions = sessionData.filter((d) => {
        const eventHour = new Date(d.created_at).getHours();
        return eventHour === hour;
      });

      const hourSearches = searchData.filter((d) => {
        const searchHour = new Date(d.created_at).getHours();
        return searchHour === hour;
      });

      return {
        hour,
        sessions: new Set(hourSessions.map((d) => d.session_id)).size,
        searches: hourSearches.length,
      };
    });

    return {
      totalSessions: uniqueSessions.size,
      totalUsers: uniqueUsers.size,
      totalPageViews: pageViews.length,
      totalSearches: searchData.length,
      avgSessionDuration: 0, // Would need session end times to calculate properly
      bounceRate: 0, // Would need to define bounce criteria
      deviceBreakdown,
      topSearches,
      contentPopularity,
      hourlyActivity: hourlyData,
    };
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 rounded w-3/4"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No analytics data available</p>
      </div>
    );
  }

  const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
        <div className="flex gap-2">
          {["1d", "7d", "30d"].map((period) => (
            <button
              key={period}
              onClick={() => setDateRange(period)}
              className={`px-3 py-1 rounded text-sm ${
                dateRange === period
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary hover:bg-secondary/80"
              }`}
            >
              {period === "1d"
                ? "Today"
                : period === "7d"
                ? "7 Days"
                : "30 Days"}
            </button>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Sessions
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analyticsData.totalSessions.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique Users</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analyticsData.totalUsers.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Page Views</CardTitle>
            <MousePointer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analyticsData.totalPageViews.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Searches</CardTitle>
            <Search className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analyticsData.totalSearches.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="activity" className="space-y-4">
        <TabsList>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="devices">Devices</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="searches">Searches</TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Hourly Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={analyticsData.hourlyActivity}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="sessions"
                    stroke="#8884d8"
                    name="Sessions"
                  />
                  <Line
                    type="monotone"
                    dataKey="searches"
                    stroke="#82ca9d"
                    name="Searches"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="devices" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Device Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={analyticsData.deviceBreakdown}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ device, percentage }) =>
                        `${device} ${percentage}%`
                      }
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {analyticsData.deviceBreakdown.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Device Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {analyticsData.deviceBreakdown.map((device, index) => (
                  <div
                    key={device.device}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      {device.device === "mobile" && (
                        <Smartphone className="h-4 w-4" />
                      )}
                      {device.device === "desktop" && (
                        <Monitor className="h-4 w-4" />
                      )}
                      {device.device === "tablet" && (
                        <Tablet className="h-4 w-4" />
                      )}
                      <span className="capitalize">{device.device}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{device.count}</Badge>
                      <span className="text-sm text-muted-foreground">
                        {device.percentage}%
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="content" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Content Popularity</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analyticsData.contentPopularity}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="content_type" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="views" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="searches" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Search Queries</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {analyticsData.topSearches.map((search, index) => (
                  <div
                    key={search.query}
                    className="flex items-center justify-between p-2 rounded hover:bg-muted"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{index + 1}</Badge>
                      <span>{search.query}</span>
                    </div>
                    <Badge>{search.count} searches</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
