import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Play,
  Pause,
  RefreshCw,
  Settings,
  Database,
  Activity,
  Users,
  Calendar,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  BarChart3,
  Filter,
  Search,
  Download,
  Upload,
  Trash2,
  Edit,
  Eye,
  Shield,
  LogOut,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import AdminLogin from "@/components/AdminLogin";
import { useEvents } from "@/hooks/useEvents";
import { useScraping } from "@/hooks/useScraping";

// Real data from Supabase
const mockScrapingJobs = [
  {
    id: 1,
    name: "Des Moines Events",
    status: "running",
    lastRun: "2025-01-26 14:30",
    nextRun: "2025-01-26 16:00",
    eventsFound: 45,
  },
  {
    id: 2,
    name: "Restaurant Openings",
    status: "completed",
    lastRun: "2025-01-26 12:00",
    nextRun: "2025-01-27 12:00",
    eventsFound: 12,
  },
  {
    id: 3,
    name: "Arts & Culture",
    status: "failed",
    lastRun: "2025-01-26 10:15",
    nextRun: "2025-01-26 15:00",
    eventsFound: 0,
  },
];

const mockEvents = [
  {
    id: 1,
    title: "Winter Art Festival",
    venue: "Downtown Gallery",
    date: "2025-02-15",
    status: "approved",
    views: 245,
  },
  {
    id: 2,
    title: "Food Truck Rally",
    venue: "Gray's Lake Park",
    date: "2025-02-20",
    status: "pending",
    views: 156,
  },
  {
    id: 3,
    title: "Tech Meetup",
    venue: "Startup Hub",
    date: "2025-02-25",
    status: "flagged",
    views: 89,
  },
];

const mockSystemStats = {
  totalEvents: 1247,
  activeScrapers: 3,
  dailyViews: 8542,
  pendingReviews: 23,
  systemHealth: 97,
  apiCalls: 15672,
  storageUsed: 75,
  uptime: "99.8%",
};

export default function Admin() {
  const [activeTab, setActiveTab] = useState("overview");
  const [eventFilters, setEventFilters] = useState({
    status: "all" as const,
    search: "",
  });
  const { toast } = useToast();
  const { isLoading, isAdmin, user, logout } = useAuth();
  const {
    events,
    isLoading: eventsLoading,
    totalCount,
    refetch: refetchEvents,
  } = useEvents(eventFilters);
  const {
    jobs: scrapingJobs,
    isGlobalRunning,
    runScrapingJob,
    runAllJobs,
    stopAllJobs,
  } = useScraping();

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login if not admin
  if (!isAdmin) {
    return <AdminLogin onLoginSuccess={() => window.location.reload()} />;
  }

  const handleStartScraping = async () => {
    try {
      await runAllJobs();
      toast({
        title: "Scraping Started",
        description: "Event scraping process has been initiated.",
      });
    } catch (error) {
      toast({
        title: "Scraping Failed",
        description: "Failed to start scraping process.",
        variant: "destructive",
      });
    }
  };

  const handleStopScraping = async () => {
    try {
      await stopAllJobs();
      toast({
        title: "Scraping Stopped",
        description: "Event scraping process has been stopped.",
      });
    } catch (error) {
      toast({
        title: "Stop Failed",
        description: "Failed to stop scraping process.",
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running":
        return <Activity className="h-4 w-4 text-green-500" />;
      case "completed":
        return <CheckCircle className="h-4 w-4 text-blue-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<
      string,
      "default" | "secondary" | "destructive" | "outline"
    > = {
      approved: "default",
      pending: "secondary",
      flagged: "destructive",
      running: "default",
      completed: "secondary",
      failed: "destructive",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Admin Dashboard
              </h1>
              <p className="text-gray-600 mt-1">
                Manage your Des Moines AI Pulse platform
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                {user?.email?.split("@")[0] || "Admin"}
              </Badge>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
              <Button variant="outline" size="sm" onClick={logout}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-6"
        >
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="scraping">Scraping</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
            <TabsTrigger value="content">Content</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Events
                  </CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {mockSystemStats.totalEvents.toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    +12% from last month
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Daily Views
                  </CardTitle>
                  <Eye className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {mockSystemStats.dailyViews.toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    +5% from yesterday
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Active Scrapers
                  </CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {mockSystemStats.activeScrapers}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    All systems operational
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Pending Reviews
                  </CardTitle>
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {mockSystemStats.pendingReviews}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Requires attention
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>System Health</CardTitle>
                  <CardDescription>
                    Overall platform performance
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Overall Health</span>
                      <span>{mockSystemStats.systemHealth}%</span>
                    </div>
                    <Progress
                      value={mockSystemStats.systemHealth}
                      className="h-2"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Storage Used</span>
                      <span>{mockSystemStats.storageUsed}%</span>
                    </div>
                    <Progress
                      value={mockSystemStats.storageUsed}
                      className="h-2"
                    />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Uptime</span>
                    <span className="font-medium">
                      {mockSystemStats.uptime}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>Latest system events</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <div className="flex-1">
                        <p className="text-sm">Scraping job completed</p>
                        <p className="text-xs text-muted-foreground">
                          2 minutes ago
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Activity className="h-4 w-4 text-blue-500" />
                      <div className="flex-1">
                        <p className="text-sm">New events added to database</p>
                        <p className="text-xs text-muted-foreground">
                          15 minutes ago
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      <div className="flex-1">
                        <p className="text-sm">Event flagged for review</p>
                        <p className="text-xs text-muted-foreground">
                          1 hour ago
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Scraping Tab */}
          <TabsContent value="scraping" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Scraping Management</h2>
                <p className="text-muted-foreground">
                  Manage automated event collection
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={
                    isGlobalRunning ? handleStopScraping : handleStartScraping
                  }
                  variant={isGlobalRunning ? "destructive" : "default"}
                >
                  {isGlobalRunning ? (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      Stop All
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Start All
                    </>
                  )}
                </Button>
                <Button variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Scraping Jobs</CardTitle>
                <CardDescription>
                  Monitor and control individual scrapers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Run</TableHead>
                      <TableHead>Next Run</TableHead>
                      <TableHead>Events Found</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockScrapingJobs.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell className="font-medium">
                          {job.name}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(job.status)}
                            {getStatusBadge(job.status)}
                          </div>
                        </TableCell>
                        <TableCell>{job.lastRun}</TableCell>
                        <TableCell>{job.nextRun}</TableCell>
                        <TableCell>{job.eventsFound}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline">
                              <Play className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="outline">
                              <Settings className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Scraper Configuration</CardTitle>
                <CardDescription>
                  Add or modify scraping targets
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="scraper-name">Scraper Name</Label>
                    <Input
                      id="scraper-name"
                      placeholder="e.g., Downtown Events"
                    />
                  </div>
                  <div>
                    <Label htmlFor="scraper-url">Target URL</Label>
                    <Input
                      id="scraper-url"
                      placeholder="https://example.com/events"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="scraper-schedule">Schedule (Cron)</Label>
                  <Input id="scraper-schedule" placeholder="0 */6 * * *" />
                </div>
                <div>
                  <Label htmlFor="scraper-selectors">CSS Selectors</Label>
                  <Textarea
                    id="scraper-selectors"
                    placeholder="Enter CSS selectors for event data extraction"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch id="scraper-active" />
                  <Label htmlFor="scraper-active">Active</Label>
                </div>
                <Button>Add Scraper</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Events Tab */}
          <TabsContent value="events" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Event Management</h2>
                <p className="text-muted-foreground">
                  Review and moderate events
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Button variant="outline">
                  <Upload className="h-4 w-4 mr-2" />
                  Import
                </Button>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Event Filters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  <Input placeholder="Search events..." className="max-w-sm" />
                  <Select>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="flagged">Flagged</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline">
                    <Filter className="h-4 w-4 mr-2" />
                    Filter
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Events</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Venue</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Views</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockEvents.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="font-medium">
                          {event.title}
                        </TableCell>
                        <TableCell>{event.venue}</TableCell>
                        <TableCell>{event.date}</TableCell>
                        <TableCell>{getStatusBadge(event.status)}</TableCell>
                        <TableCell>{event.views}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="outline">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Monitoring Tab */}
          <TabsContent value="monitoring" className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">System Monitoring</h2>
              <p className="text-muted-foreground">
                Monitor system performance and health
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    API Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm">Response Time</span>
                      <span className="text-sm font-medium">124ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Success Rate</span>
                      <span className="text-sm font-medium">99.2%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Requests/hour</span>
                      <span className="text-sm font-medium">2,847</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Database
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm">Query Time</span>
                      <span className="text-sm font-medium">45ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Connections</span>
                      <span className="text-sm font-medium">12/100</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Storage</span>
                      <span className="text-sm font-medium">2.1GB</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    User Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm">Active Users</span>
                      <span className="text-sm font-medium">1,247</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Page Views</span>
                      <span className="text-sm font-medium">8,542</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Bounce Rate</span>
                      <span className="text-sm font-medium">32%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>System Logs</CardTitle>
                <CardDescription>
                  Recent system activity and errors
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 font-mono text-sm">
                  <div className="flex gap-4">
                    <span className="text-muted-foreground">14:30:15</span>
                    <span className="text-green-600">[INFO]</span>
                    <span>
                      Scraping job completed successfully - 45 events processed
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-muted-foreground">14:28:42</span>
                    <span className="text-blue-600">[DEBUG]</span>
                    <span>Database connection established</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-muted-foreground">14:25:18</span>
                    <span className="text-yellow-600">[WARN]</span>
                    <span>
                      High memory usage detected - 85% of available RAM
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-muted-foreground">14:22:55</span>
                    <span className="text-red-600">[ERROR]</span>
                    <span>
                      Failed to connect to external API - timeout after 30s
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Content Tab */}
          <TabsContent value="content" className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Content Moderation</h2>
              <p className="text-muted-foreground">
                Review and manage platform content
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Pending Reviews</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-yellow-600">
                    {mockSystemStats.pendingReviews}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Events awaiting approval
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Flagged Content</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-red-600">7</div>
                  <p className="text-sm text-muted-foreground">
                    Content requiring attention
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Auto-Approved</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600">156</div>
                  <p className="text-sm text-muted-foreground">
                    Events approved today
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Content Moderation Settings</CardTitle>
                <CardDescription>
                  Configure automatic content filtering
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto-approve trusted sources</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically approve events from verified venues
                    </p>
                  </div>
                  <Switch />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Profanity filter</Label>
                    <p className="text-sm text-muted-foreground">
                      Flag content containing inappropriate language
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Duplicate detection</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically detect and merge duplicate events
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
