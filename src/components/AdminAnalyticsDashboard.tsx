import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from '@/lib/logger';
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
import { Eye, MousePointer, Globe, Smartphone, Monitor, RefreshCw, Download } from "lucide-react";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

interface AnalyticsData {
  pageViews: { name: string; value: number }[];
  userSessions: { date: string; sessions: number; users: number }[];
  contentPerformance: { type: string; views: number; engagement: number }[];
  deviceBreakdown: { name: string; value: number; color: string }[];
  topPages: { page: string; views: number; avgTime: string }[];
  realTimeMetrics: {
    activeUsers: number;
    pageViews24h: number;
    bounceRate: number;
    avgSessionDuration: string;
  };
}

const log = createLogger('AdminAnalyticsDashboard');

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function AdminAnalyticsDashboard() {
  const { toast } = useToast();
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>({
    pageViews: [],
    userSessions: [],
    contentPerformance: [],
    deviceBreakdown: [],
    topPages: [],
    realTimeMetrics: {
      activeUsers: 0,
      pageViews24h: 0,
      bounceRate: 0,
      avgSessionDuration: "0m 0s",
    },
  });
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTimeRange, setSelectedTimeRange] = useState("7d");

  useEffect(() => {
    loadAnalyticsData();
  }, [selectedTimeRange]);

  const loadAnalyticsData = async () => {
    setIsLoading(true);
    try {
      // Calculate date range based on selected time range
      const now = new Date();
      const daysBack = selectedTimeRange === "7d" ? 7 : selectedTimeRange === "30d" ? 30 : 90;
      const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

      // Get page views from user_analytics
      const { data: pageViewsData, error: pageViewsError } = await supabase
        .from('user_analytics')
        .select('created_at, page_url')
        .eq('event_type', 'page_view')
        .gte('created_at', startDate.toISOString());

      if (pageViewsError) throw pageViewsError;

      // Get user sessions data (include device_type for device breakdown)
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('user_analytics')
        .select('created_at, session_id, user_id, device_type')
        .gte('created_at', startDate.toISOString());

      if (sessionsError) throw sessionsError;

      // Get content performance from content_metrics
      const { data: contentData, error: contentError } = await supabase
        .from('content_metrics')
        .select('content_type, metric_type, metric_value')
        .gte('created_at', startDate.toISOString());

      if (contentError) throw contentError;

      // Process page views by day
      const pageViewsByDay = (pageViewsData || []).reduce((acc: any, item) => {
        const day = new Date(item.created_at).toLocaleDateString('en', { weekday: 'short' });
        acc[day] = (acc[day] || 0) + 1;
        return acc;
      }, {});

      const pageViews = Object.entries(pageViewsByDay).map(([name, value]) => ({ name, value: Number(value) }));

      // Process user sessions by date
      const sessionsByDate = (sessionsData || []).reduce((acc: any, item) => {
        const date = new Date(item.created_at).toISOString().split('T')[0];
        if (!acc[date]) {
          acc[date] = { sessions: new Set(), users: new Set() };
        }
        acc[date].sessions.add(item.session_id);
        if (item.user_id) acc[date].users.add(item.user_id);
        return acc;
      }, {});

      const userSessions = Object.entries(sessionsByDate).map(([date, data]: [string, any]) => ({
        date,
        sessions: data.sessions.size,
        users: data.users.size,
      }));

      // Process content performance
      const contentPerformance = (contentData || []).reduce((acc: any, item) => {
        const type = item.content_type.charAt(0).toUpperCase() + item.content_type.slice(1);
        if (!acc[type]) {
          acc[type] = { views: 0, engagement: 0 };
        }
        if (item.metric_type === 'view') {
          acc[type].views += item.metric_value || 1;
        } else if (item.metric_type === 'click') {
          acc[type].engagement += item.metric_value || 1;
        }
        return acc;
      }, {});

      const contentPerformanceArray = Object.entries(contentPerformance).map(([type, data]: [string, any]) => ({
        type,
        views: data.views,
        engagement: Math.min(100, (data.engagement / Math.max(1, data.views)) * 100), // Convert to percentage
      }));

      // Calculate top pages with per-page session duration
      const topPages = (pageViewsData || []).reduce((acc: any, item) => {
        const url = new URL(item.page_url || '', window.location.origin);
        const path = url.pathname;
        if (!acc[path]) acc[path] = { count: 0, timestamps: [] };
        acc[path].count += 1;
        acc[path].timestamps.push(new Date(item.created_at).getTime());
        return acc;
      }, {});

      const topPagesArray = Object.entries(topPages)
        .map(([page, data]: [string, any]) => {
          // Estimate avg time on page from timestamps within the same page
          const sorted = data.timestamps.sort((a: number, b: number) => a - b);
          let avgMs = 0;
          if (sorted.length >= 2) {
            const diffs: number[] = [];
            for (let i = 1; i < sorted.length; i++) {
              const diff = sorted[i] - sorted[i - 1];
              // Only count gaps under 30 minutes (reasonable session gap)
              if (diff < 30 * 60 * 1000) diffs.push(diff);
            }
            avgMs = diffs.length > 0 ? diffs.reduce((s: number, d: number) => s + d, 0) / diffs.length : 0;
          }
          const mins = Math.floor(avgMs / 60000);
          const secs = Math.floor((avgMs % 60000) / 1000);
          return {
            page,
            views: data.count,
            avgTime: avgMs > 0 ? `${mins}m ${secs}s` : '-',
          };
        })
        .sort((a, b) => b.views - a.views)
        .slice(0, 5);

      // Compute bounce rate: sessions with only 1 page view / total sessions
      const sessionPageCounts = (sessionsData || []).reduce((acc: Record<string, number>, item) => {
        acc[item.session_id] = (acc[item.session_id] || 0) + 1;
        return acc;
      }, {});
      const totalSessions = Object.keys(sessionPageCounts).length;
      const bouncedSessions = Object.values(sessionPageCounts).filter((c) => c === 1).length;
      const bounceRate = totalSessions >= 10
        ? Math.round((bouncedSessions / totalSessions) * 1000) / 10
        : 0;

      // Compute avg session duration from first/last event per session
      const sessionTimestamps = (sessionsData || []).reduce((acc: Record<string, number[]>, item) => {
        if (!acc[item.session_id]) acc[item.session_id] = [];
        acc[item.session_id].push(new Date(item.created_at).getTime());
        return acc;
      }, {});
      const durations = Object.values(sessionTimestamps)
        .map((ts) => {
          if (ts.length < 2) return 0;
          return Math.max(...ts) - Math.min(...ts);
        })
        .filter((d) => d > 0);
      const avgDurationMs = durations.length > 0
        ? durations.reduce((s, d) => s + d, 0) / durations.length
        : 0;
      const avgMins = Math.floor(avgDurationMs / 60000);
      const avgSecs = Math.floor((avgDurationMs % 60000) / 1000);
      const avgSessionDuration = totalSessions >= 10
        ? `${avgMins}m ${avgSecs}s`
        : 'Insufficient data';

      // Compute device breakdown from device_type field
      const deviceCounts = (sessionsData || []).reduce((acc: Record<string, number>, item) => {
        const device = item.device_type || 'Unknown';
        const normalized = device.charAt(0).toUpperCase() + device.slice(1).toLowerCase();
        acc[normalized] = (acc[normalized] || 0) + 1;
        return acc;
      }, {});
      const deviceColorMap: Record<string, string> = {
        Mobile: '#0088FE',
        Desktop: '#00C49F',
        Tablet: '#FFBB28',
        Unknown: '#FF8042',
      };
      const deviceBreakdownArray = Object.entries(deviceCounts)
        .map(([name, value]) => ({
          name,
          value,
          color: deviceColorMap[name] || '#8884D8',
        }))
        .sort((a, b) => b.value - a.value);

      // Real-time metrics (last 24 hours)
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const recent24hData = (pageViewsData || []).filter(item =>
        new Date(item.created_at) >= last24h
      );

      const realTimeMetrics = {
        activeUsers: new Set(sessionsData?.filter(s =>
          new Date(s.created_at) >= new Date(now.getTime() - 60 * 60 * 1000)
        )?.map(s => s.session_id)).size || 0,
        pageViews24h: recent24hData.length,
        bounceRate: totalSessions >= 10 ? bounceRate : 0,
        avgSessionDuration: totalSessions >= 10 ? avgSessionDuration : 'Insufficient data',
      };

      setAnalyticsData({
        pageViews: pageViews.length ? pageViews : [{ name: "No data", value: 0 }],
        userSessions: userSessions.length ? userSessions : [],
        contentPerformance: contentPerformanceArray.length ? contentPerformanceArray : [],
        deviceBreakdown: deviceBreakdownArray.length ? deviceBreakdownArray : [
          { name: "No data", value: 1, color: "#ccc" },
        ],
        topPages: topPagesArray.length ? topPagesArray : [],
        realTimeMetrics,
      });

    } catch (error) {
      log.error('loadAnalytics', 'Failed to load analytics data', { data: error });
      toast({
        title: "Error",
        description: "Failed to load analytics data.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const exportAnalytics = async () => {
    try {
      // In real implementation, generate and download analytics report
      const reportData = JSON.stringify(analyticsData, null, 2);
      const blob = new Blob([reportData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-report-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Export Complete",
        description: "Analytics report has been downloaded.",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export analytics data.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <SpriteIcon name="trending-up" className="h-6 w-6 text-blue-500" />
            Advanced Analytics
          </h2>
          <p className="text-muted-foreground">
            Comprehensive site performance and user behavior analytics
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={loadAnalyticsData}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={exportAnalytics}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Real-time Metrics */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <SpriteIcon name="users" className="h-4 w-4" />
              Active Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {analyticsData.realTimeMetrics.activeUsers}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              Real-time
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Page Views (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analyticsData.realTimeMetrics.pageViews24h.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">+12% vs yesterday</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MousePointer className="h-4 w-4" />
              Bounce Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analyticsData.realTimeMetrics.bounceRate > 0
                ? `${analyticsData.realTimeMetrics.bounceRate}%`
                : 'Insufficient data'}
            </div>
            <p className="text-xs text-muted-foreground">Single-page sessions / total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <SpriteIcon name="clock" className="h-4 w-4" />
              Avg Session
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analyticsData.realTimeMetrics.avgSessionDuration}
            </div>
            <p className="text-xs text-muted-foreground">First to last event per session</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList className="grid w-full max-w-md grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="audience">Audience</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>
          
          <div className="flex gap-2">
            {["7d", "30d", "90d"].map((range) => (
              <Button
                key={range}
                variant={selectedTimeRange === range ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedTimeRange(range)}
              >
                {range}
              </Button>
            ))}
          </div>
        </div>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Page Views Trend</CardTitle>
                <CardDescription>Daily page views over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={analyticsData.pageViews}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#0088FE" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>User Sessions</CardTitle>
                <CardDescription>Sessions vs unique users</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analyticsData.userSessions}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="sessions" stroke="#0088FE" strokeWidth={2} />
                    <Line type="monotone" dataKey="users" stroke="#00C49F" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Top Pages</CardTitle>
              <CardDescription>Most visited pages and average time spent</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analyticsData.topPages.map((page, index) => (
                  <div key={page.page} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{index + 1}</Badge>
                      <div>
                        <p className="font-medium">{page.page}</p>
                        <p className="text-sm text-muted-foreground">
                          Avg. time: {page.avgTime}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{page.views.toLocaleString()}</p>
                      <p className="text-sm text-muted-foreground">views</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="content" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Content Performance</CardTitle>
              <CardDescription>Views and engagement by content type</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={analyticsData.contentPerformance}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="type" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="views" fill="#0088FE" />
                  <Bar dataKey="engagement" fill="#00C49F" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audience" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Device Breakdown</CardTitle>
                <CardDescription>User device preferences</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={analyticsData.deviceBreakdown}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {analyticsData.deviceBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Device Details</CardTitle>
                <CardDescription>Detailed device statistics</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {analyticsData.deviceBreakdown.map((device) => (
                  <div key={device.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      {device.name === 'Mobile' && <Smartphone className="h-5 w-5" />}
                      {device.name === 'Desktop' && <Monitor className="h-5 w-5" />}
                      {device.name === 'Tablet' && <Globe className="h-5 w-5" />}
                      <span className="font-medium">{device.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: device.color }}
                      ></div>
                      <span className="font-bold">{device.value}%</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Site Performance Metrics</CardTitle>
                <CardDescription>Key performance indicators</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>Page Load Time</span>
                  <Badge variant="secondary">2.3s</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>First Contentful Paint</span>
                  <Badge variant="secondary">1.2s</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Largest Contentful Paint</span>
                  <Badge variant="secondary">2.8s</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Cumulative Layout Shift</span>
                  <Badge variant="secondary">0.05</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Time to Interactive</span>
                  <Badge variant="secondary">3.1s</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Performance Score</CardTitle>
                <CardDescription>Overall site performance rating</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-center">
                <div className="text-center">
                  <div className="text-6xl font-bold text-green-500 mb-2">87</div>
                  <p className="text-muted-foreground">Performance Score</p>
                  <Badge variant="secondary" className="mt-2">Good</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}