import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { createLogger } from '@/lib/logger';

const log = createLogger('SearchTrafficDashboard');

interface ConnectedProvider {
  id: string;           // gsc_properties.id UUID — used as propertyId for child components
  property_url: string;
  property_name: string;
  provider_name: string;
  connected_at: string;
  last_sync_at: string | null;
  status: "connected" | "expired" | "error";
}

interface DateRange {
  from: Date;
  to: Date;
}

export function SearchTrafficDashboard() {
  const [loading, setLoading] = useState(true);
  const [connectedProviders, setConnectedProviders] = useState<ConnectedProvider[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("all");
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

      // Load GSC properties (split into two queries to avoid PostgREST join 400 errors)
      const { data: properties, error } = await supabase
        .from("gsc_properties" as any)
        .select("id, property_url, property_type, status, last_sync_at, created_at, oauth_credential_id")
        .order("created_at", { ascending: false });

      if (error) {
        log.debug('loadProviders', 'gsc_properties not available yet', { data: error });
      }

      const propRows = (properties || []) as any[];

      // Separately fetch credential status for all credential IDs
      const credIds = propRows.map((p: any) => p.oauth_credential_id).filter(Boolean);
      const credMap: Record<string, { id: string; is_active: boolean; expires_at: string }> = {};

      if (credIds.length > 0) {
        const { data: creds } = await supabase
          .from("gsc_oauth_credentials" as any)
          .select("id, is_active, expires_at")
          .in("id", credIds);

        for (const cred of (creds || []) as any[]) {
          credMap[cred.id] = cred;
        }
      }

      const providers: ConnectedProvider[] = propRows.map((prop: any) => {
        const cred = credMap[prop.oauth_credential_id];
        const isExpired = cred?.expires_at ? new Date(cred.expires_at) < new Date() : false;
        const isActive = cred?.is_active === true;

        let connStatus: ConnectedProvider["status"] = "error";
        if (isActive && !isExpired) connStatus = "connected";
        else if (isExpired) connStatus = "expired";

        const displayName = prop.property_url.startsWith("sc-domain:")
          ? prop.property_url.replace("sc-domain:", "")
          : prop.property_url;

        return {
          id: prop.id,
          property_url: prop.property_url,
          property_name: displayName,
          provider_name: "google_search_console",
          connected_at: prop.created_at,
          last_sync_at: prop.last_sync_at || null,
          status: connStatus,
        };
      });

      // If no properties exist yet but we have active credentials, show a
      // synthetic "connected" entry so the user knows the OAuth worked and
      // can click Sync Data to pull their properties.
      if (providers.length === 0) {
        const { data: activeCreds } = await supabase
          .from("gsc_oauth_credentials" as any)
          .select("id, is_active, expires_at, created_at")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1);

        const latestCred = ((activeCreds || []) as any[])[0];
        if (latestCred) {
          const isExpired = latestCred.expires_at
            ? new Date(latestCred.expires_at) < new Date()
            : false;
          providers.push({
            id: latestCred.id,
            property_url: "pending",
            property_name: "Google Search Console (click Sync Data to load properties)",
            provider_name: "google_search_console",
            connected_at: latestCred.created_at,
            last_sync_at: null,
            status: isExpired ? "expired" : "connected",
          });
        }
      }

      setConnectedProviders(providers);
    } catch (error) {
      log.error('loadProviders', 'Error loading connected providers', { data: error });
      toast.error("Failed to load connected providers");
    } finally {
      setLoading(false);
    }
  };

  const handleSyncData = async () => {
    try {
      setSyncing(true);
      toast.info("Starting data synchronization…");

      // Check if we only have a synthetic credential-only entry (no real properties yet)
      const syntheticEntry = connectedProviders.find(p => p.property_url === "pending");
      if (syntheticEntry) {
        // Re-run fetch-properties to pull real properties from GSC API
        toast.info("Fetching your Search Console properties…");
        const { data: session } = await supabase.auth.getSession();
        const propRes = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gsc-fetch-properties`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.session?.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ credentialId: syntheticEntry.id }),
          }
        );
        const propJson = await propRes.json().catch(() => ({}));
        if (propJson.warning) {
          toast.warning("GSC API issue", { description: propJson.warning });
        }
        await loadConnectedProviders();
        setSyncing(false);
        return;
      }

      // Determine which real properties to sync
      const propertiesToSync = selectedPropertyId === "all"
        ? connectedProviders.filter(p => p.status === "connected" && p.property_url !== "pending").map(p => p.id)
        : connectedProviders.filter(p => p.id === selectedPropertyId && p.status === "connected" && p.property_url !== "pending").map(p => p.id);

      if (propertiesToSync.length === 0) {
        toast.warning("No connected properties to sync. Check your Search Console connection.");
        return;
      }

      let totalKeywords = 0;
      let totalPages = 0;

      for (const propertyId of propertiesToSync) {
        const { data, error } = await supabase.functions.invoke("gsc-sync-data", {
          body: { propertyId, dateRange: 28 },
        });

        if (error) {
          log.error('syncData', 'Sync error for property', { data: { propertyId, error } });
        } else {
          totalKeywords += data?.summary?.keywordsSynced ?? 0;
          totalPages += data?.summary?.pagesSynced ?? 0;
        }
      }

      toast.success("Sync complete!", {
        description: `${totalKeywords} keywords and ${totalPages} pages updated.`,
      });

      loadConnectedProviders();
    } catch (error: any) {
      log.error('syncData', 'Sync error', { data: error });
      toast.error("Failed to sync data", { description: error.message || "Please try again later" });
    } finally {
      setSyncing(false);
    }
  };

  const handleExportData = async () => {
    try {
      toast.info("Preparing export...");

      const { data, error } = await supabase.functions.invoke("export-analytics-data", {
        body: {
          providers: selectedPropertyId === "all"
            ? connectedProviders.map(p => p.provider_name)
            : connectedProviders.filter(p => p.id === selectedPropertyId).map(p => p.provider_name),
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
      log.error('exportData', 'Export error', { data: error });
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
            disabled={syncing || connectedProviders.filter(p => p.status === "connected").length === 0}
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
              {connectedProviders.map((provider) => (
                <Card key={provider.id} className={provider.status === "expired" ? "border-orange-500" : provider.status === "connected" ? "border-green-500" : "border-destructive"}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {getProviderIcon(provider.provider_name)}
                        <div>
                          <p className="font-medium text-sm">
                            {getProviderLabel(provider.provider_name)}
                          </p>
                          <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                            {provider.property_name}
                          </p>
                          {provider.last_sync_at && (
                            <p className="text-xs text-muted-foreground">
                              Synced {format(new Date(provider.last_sync_at), "MMM d, h:mm a")}
                            </p>
                          )}
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
                <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                  <SelectTrigger className="w-[240px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Properties</SelectItem>
                    {connectedProviders.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.property_name}
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
            propertyId={selectedPropertyId}
            connectedProviders={connectedProviders}
          />
        </TabsContent>

        <TabsContent value="traffic" className="space-y-4">
          <SearchPerformance
            dateRange={dateRange}
            propertyId={selectedPropertyId}
            connectedProviders={connectedProviders}
          />
        </TabsContent>

        <TabsContent value="search" className="space-y-4">
          <SearchPerformance
            dateRange={dateRange}
            propertyId={selectedPropertyId}
            connectedProviders={connectedProviders}
          />
        </TabsContent>

        <TabsContent value="keywords" className="space-y-4">
          <KeywordAnalytics
            dateRange={dateRange}
            propertyId={selectedPropertyId}
            connectedProviders={connectedProviders}
          />
        </TabsContent>

        <TabsContent value="seo" className="space-y-4">
          <SEOOpportunities
            dateRange={dateRange}
            propertyId={selectedPropertyId}
            connectedProviders={connectedProviders}
          />
        </TabsContent>

        <TabsContent value="health" className="space-y-4">
          <SiteHealth
            dateRange={dateRange}
            propertyId={selectedPropertyId}
            connectedProviders={connectedProviders}
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
