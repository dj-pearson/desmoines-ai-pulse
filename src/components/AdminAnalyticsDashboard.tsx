import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
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
  TrendingUp,
  Users,
  Eye,
  MousePointer,
  Clock,
  Globe,
  Smartphone,
  Monitor,
  RefreshCw,
  Download,
} from "lucide-react";

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
      // Mock analytics data - in real implementation, fetch from analytics tables
      const mockData: AnalyticsData = {
        pageViews: [
          { name: "Mon", value: 1240 },
          { name: "Tue", value: 1890 },
          { name: "Wed", value: 2190 },
          { name: "Thu", value: 1750 },
          { name: "Fri", value: 2450 },
          { name: "Sat", value: 3200 },
          { name: "Sun", value: 2800 },
        ],
        userSessions: [
          { date: "2024-01-01", sessions: 156, users: 124 },
          { date: "2024-01-02", sessions: 189, users: 145 },
          { date: "2024-01-03", sessions: 234, users: 178 },
          { date: "2024-01-04", sessions: 198, users: 156 },
          { date: "2024-01-05", sessions: 267, users: 201 },
          { date: "2024-01-06", sessions: 345, users: 267 },
          { date: "2024-01-07", sessions: 312, users: 234 },
        ],
        contentPerformance: [
          { type: "Events", views: 15420, engagement: 78 },
          { type: "Restaurants", views: 12890, engagement: 85 },
          { type: "Attractions", views: 8750, engagement: 62 },
          { type: "Playgrounds", views: 6230, engagement: 71 },
        ],
        deviceBreakdown: [
          { name: "Mobile", value: 68, color: "#0088FE" },
          { name: "Desktop", value: 24, color: "#00C49F" },
          { name: "Tablet", value: 8, color: "#FFBB28" },
        ],
        topPages: [
          { page: "/events", views: 8420, avgTime: "3m 24s" },
          { page: "/restaurants", views: 6890, avgTime: "2m 56s" },
          { page: "/", views: 5670, avgTime: "1m 45s" },
          { page: "/attractions", views: 4320, avgTime: "2m 12s" },
          { page: "/playgrounds", views: 3450, avgTime: "1m 58s" },
        ],
        realTimeMetrics: {
          activeUsers: 47,
          pageViews24h: 15420,
          bounceRate: 42.5,
          avgSessionDuration: "3m 28s",
        },
      };

      setAnalyticsData(mockData);
    } catch (error) {
      console.error("Failed to load analytics data:", error);
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
            <TrendingUp className="h-6 w-6 text-blue-500" />
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
              <Users className="h-4 w-4" />
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
              {analyticsData.realTimeMetrics.bounceRate}%
            </div>
            <p className="text-xs text-muted-foreground">-3% vs last week</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Avg Session
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analyticsData.realTimeMetrics.avgSessionDuration}
            </div>
            <p className="text-xs text-muted-foreground">+15% vs last week</p>
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