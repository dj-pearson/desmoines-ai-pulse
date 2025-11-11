import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Search,
  Globe,
  Link2,
  RefreshCw,
  Download,
  Settings,
  AlertCircle,
  CheckCircle2,
  Eye,
  MousePointer,
  Activity,
  Target,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { addDays, format } from "date-fns";
import { OAuthProviderSetup } from "./SearchTrafficDashboard/OAuthProviderSetup";
import { TrafficOverview } from "./SearchTrafficDashboard/TrafficOverview";
import { SearchPerformance } from "./SearchTrafficDashboard/SearchPerformance";
import { KeywordAnalytics } from "./SearchTrafficDashboard/KeywordAnalytics";
import { SEOOpportunities } from "./SearchTrafficDashboard/SEOOpportunities";
import { SiteHealth } from "./SearchTrafficDashboard/SiteHealth";
import { ComparativeAnalysis } from "./SearchTrafficDashboard/ComparativeAnalysis";

interface ConnectedProvider {
  provider_name: string;
  property_id?: string;
  property_name?: string;
  connected_at: string;
  status: "connected" | "expired" | "error";
}

interface DateRange {
  from: Date;
  to: Date;
}

export function SearchTrafficDashboard() {
  const [loading, setLoading] = useState(true);
  const [connectedProviders, setConnectedProviders] = useState<ConnectedProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange>({
    from: addDays(new Date(), -30),
    to: new Date(),
  });
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    loadConnectedProviders();
  }, []);

  const loadConnectedProviders = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        toast.error("Please log in to view analytics");
        return;
      }

      // Get all connected OAuth providers - these tables may not exist yet
      try {
        const { data: tokens, error } = await supabase
          .from("user_oauth_tokens" as any)
          .select("provider_name, property_id, expires_at, created_at")
          .eq("user_id", user.id);

        if (error) {
          console.log("OAuth tokens table not available yet");
          setConnectedProviders([]);
          return;
        }

        // Get property details
        const { data: properties } = await supabase
          .from("analytics_properties" as any)
          .select("*")
          .eq("user_id", user.id);

        const providers: ConnectedProvider[] = (tokens || []).map((token: any) => {
          const property = properties?.find(
            (p: any) => p.provider_name === token.provider_name && p.property_id === token.property_id
          );

          const isExpired = token.expires_at ? new Date(token.expires_at) < new Date() : false;

          return {
            provider_name: token.provider_name,
            property_id: token.property_id || undefined,
            property_name: property?.property_name || token.property_id || "Default",
            connected_at: token.created_at,
            status: isExpired ? "expired" : "connected",
          };
        });

        setConnectedProviders(providers);
      } catch (err) {
        console.log("Analytics tables not available yet");
        setConnectedProviders([]);
      }
    } catch (error) {
      console.error("Error loading connected providers:", error);
      toast.error("Failed to load connected providers");
    } finally {
      setLoading(false);
    }
  };

  const handleSyncData = async () => {
    try {
      setSyncing(true);
      toast.info("Starting data synchronization...");

      // Call edge function to sync data from all providers
      const { data, error } = await supabase.functions.invoke("sync-analytics-data", {
        body: {
          providers: selectedProvider === "all"
            ? connectedProviders.map(p => p.provider_name)
            : [selectedProvider],
          start_date: format(dateRange.from, "yyyy-MM-dd"),
          end_date: format(dateRange.to, "yyyy-MM-dd"),
        },
      });

      if (error) throw error;

      toast.success("Data synchronized successfully!", {
        description: `Synced ${data.records_synced} records from ${data.providers_synced} providers`,
      });

      // Refresh the dashboard
      loadConnectedProviders();
    } catch (error: any) {
      console.error("Sync error:", error);
      toast.error("Failed to sync data", {
        description: error.message || "Please try again later",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleExportData = async () => {
    try {
      toast.info("Preparing export...");

      const { data, error } = await supabase.functions.invoke("export-analytics-data", {
        body: {
          providers: selectedProvider === "all"
            ? connectedProviders.map(p => p.provider_name)
            : [selectedProvider],
          start_date: format(dateRange.from, "yyyy-MM-dd"),
          end_date: format(dateRange.to, "yyyy-MM-dd"),
          format: "csv",
        },
      });

      if (error) throw error;

      // Download the CSV
      const blob = new Blob([data.csv], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analytics-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success("Export completed!");
    } catch (error: any) {
      console.error("Export error:", error);
      toast.error("Failed to export data", {
        description: error.message || "Please try again later",
      });
    }
  };

  const getProviderIcon = (providerName: string) => {
    switch (providerName) {
      case "google_analytics":
        return <BarChart3 className="h-4 w-4" />;
      case "google_search_console":
        return <Search className="h-4 w-4" />;
      case "bing_webmaster":
        return <Globe className="h-4 w-4" />;
      case "yandex_webmaster":
        return <Link2 className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getProviderLabel = (providerName: string) => {
    const labels: Record<string, string> = {
      google_analytics: "Google Analytics",
      google_search_console: "Google Search Console",
      bing_webmaster: "Bing Webmaster",
      yandex_webmaster: "Yandex Webmaster",
    };
    return labels[providerName] || providerName;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading analytics dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Search & Traffic Analytics</h2>
          <p className="text-muted-foreground">
            Unified dashboard for all your analytics platforms
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleSyncData}
            disabled={syncing || connectedProviders.length === 0}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync Data"}
          </Button>
          <Button
            onClick={handleExportData}
            variant="outline"
            disabled={connectedProviders.length === 0}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Connected Providers Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Connected Platforms
          </CardTitle>
          <CardDescription>
            Manage your analytics platform connections
          </CardDescription>
        </CardHeader>
        <CardContent>
          {connectedProviders.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No platforms connected yet. Connect your analytics platforms to start tracking.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {connectedProviders.map((provider, index) => (
                <Card key={index} className={provider.status === "expired" ? "border-orange-500" : "border-green-500"}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {getProviderIcon(provider.provider_name)}
                        <div>
                          <p className="font-medium text-sm">
                            {getProviderLabel(provider.provider_name)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {provider.property_name}
                          </p>
                        </div>
                      </div>
                      {provider.status === "connected" ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-orange-500" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Platform:</label>
                <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Platforms</SelectItem>
                    {connectedProviders.map((provider) => (
                      <SelectItem key={provider.provider_name} value={provider.provider_name}>
                        {getProviderLabel(provider.provider_name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Date Range:</label>
                <DatePickerWithRange
                  date={dateRange}
                  onDateChange={(range) => range && setDateRange(range)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Dashboard Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-7">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="traffic">Traffic</TabsTrigger>
          <TabsTrigger value="search">Search</TabsTrigger>
          <TabsTrigger value="keywords">Keywords</TabsTrigger>
          <TabsTrigger value="seo">SEO Insights</TabsTrigger>
          <TabsTrigger value="health">Site Health</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <TrafficOverview
            dateRange={dateRange}
            selectedProvider={selectedProvider}
          />
        </TabsContent>

        <TabsContent value="traffic" className="space-y-4">
          <SearchPerformance
            dateRange={dateRange}
            selectedProvider={selectedProvider}
          />
        </TabsContent>

        <TabsContent value="search" className="space-y-4">
          <SearchPerformance
            dateRange={dateRange}
            selectedProvider={selectedProvider}
          />
        </TabsContent>

        <TabsContent value="keywords" className="space-y-4">
          <KeywordAnalytics
            dateRange={dateRange}
            selectedProvider={selectedProvider}
          />
        </TabsContent>

        <TabsContent value="seo" className="space-y-4">
          <SEOOpportunities
            dateRange={dateRange}
            selectedProvider={selectedProvider}
          />
        </TabsContent>

        <TabsContent value="health" className="space-y-4">
          <SiteHealth
            dateRange={dateRange}
            selectedProvider={selectedProvider}
          />
        </TabsContent>

        <TabsContent value="compare" className="space-y-4">
          <ComparativeAnalysis
            dateRange={dateRange}
            connectedProviders={connectedProviders}
          />
        </TabsContent>
      </Tabs>

      {/* Setup OAuth if no providers connected */}
      {connectedProviders.length === 0 && (
        <OAuthProviderSetup onComplete={loadConnectedProviders} />
      )}
    </div>
  );
}
