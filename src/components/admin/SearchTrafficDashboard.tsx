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
  Trash2,
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
import { getErrorMessage } from "@/lib/errorHandler";

const log = createLogger('SearchTrafficDashboard');

interface ConnectedProvider {
  id: string;                    // gsc_properties.id UUID — used as propertyId for child components
  oauth_credential_id: string;   // gsc_oauth_credentials.id — needed to call gsc-fetch-properties
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
        .from("gsc_properties")
        .select("id, property_url, property_type, status, last_sync_at, created_at, oauth_credential_id")
        .order("created_at", { ascending: false });

      if (error) {
        log.debug('loadProviders', 'gsc_properties not available yet', { data: error });
      }

      const propRows = properties || [];

      // Separately fetch credential status for all credential IDs
      const credIds = propRows.map((p) => p.oauth_credential_id).filter(Boolean);
      const credMap: Record<string, { id: string; is_active: boolean; expires_at: string }> = {};

      if (credIds.length > 0) {
        const { data: creds, error: credsError } = await supabase
          .from("gsc_oauth_credentials")
          .select("id, is_active, expires_at")
          .in("id", credIds);

        // An unread credential is not a healthy credential. This error was
        // discarded, so a failed read left credMap empty and every property
        // rendered with cred undefined - which makes isExpired false and shows
        // the token as fine when we simply could not look.
        if (credsError) {
          log.error('loadProviders', 'could not read gsc_oauth_credentials', { data: credsError });
          toast.error("Could not read credential status", { description: getErrorMessage(credsError) });
        }

        for (const cred of creds || []) {
          credMap[cred.id] = cred;
        }
      }

      const providers: ConnectedProvider[] = propRows.map((prop) => {
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
          oauth_credential_id: prop.oauth_credential_id,
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
        const { data: activeCreds, error: activeCredsError } = await supabase
          .from("gsc_oauth_credentials")
          .select("id, is_active, expires_at, created_at")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1);

        // This branch exists to tell the user their OAuth worked even before any
        // property is stored. A discarded error made a failed read look exactly
        // like "no credentials", so a connected account was shown as
        // disconnected and the fix on offer was to reconnect - which is the
        // wrong advice for a read failure.
        if (activeCredsError) {
          log.error('loadProviders', 'could not read active gsc credentials', { data: activeCredsError });
        }

        const latestCred = (activeCreds || [])[0];
        if (latestCred) {
          const isExpired = latestCred.expires_at
            ? new Date(latestCred.expires_at) < new Date()
            : false;
          providers.push({
            id: latestCred.id,
            oauth_credential_id: latestCred.id,
            property_url: "pending",
            property_name: "Google Search Console (click Sync Data to load properties)",
            provider_name: "google_search_console",
            connected_at: latestCred.created_at,
            last_sync_at: null,
            status: isExpired ? "expired" : "connected",
          });
        }
      }

      // Client-side domain filter: only show properties that match the target site.
      // This removes any leftover properties from other GSC-verified sites until
      // the user re-authenticates and the backend cleanup runs.
      const rawSiteUrl = import.meta.env.VITE_SITE_URL || "";
      const targetDomain = rawSiteUrl
        .replace(/^https?:\/\/(www\.)?/, "")
        .replace(/\/$/, "")
        .toLowerCase();

      const filteredProviders = targetDomain
        ? providers.filter(
            (p) =>
              p.property_url === "pending" ||
              p.property_url.toLowerCase().includes(targetDomain)
          )
        : providers;

      // Auto-select the desmoinesinsider property if nothing selected yet
      if (filteredProviders.length === 1 && selectedPropertyId === "all") {
        setSelectedPropertyId(filteredProviders[0].id);
      }

      setConnectedProviders(filteredProviders);
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

      // If we have more than one real property, run a fetch-properties cleanup first
      // so the domain filter removes other sites before we sync
      const realProps = connectedProviders.filter(p => p.property_url !== "pending");
      if (realProps.length > 1) {
        toast.info("Cleaning up properties before sync…");
        await handleRefreshProperties();
        setSyncing(true); // handleRefreshProperties may reset syncing state
      }

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

      // Determine which real properties to sync.
      // Allow "expired" status too — gsc-sync-data auto-refreshes the token.
      // Only exclude "error" status (no credential at all).
      const propertiesToSync = selectedPropertyId === "all"
        ? connectedProviders.filter(p => p.status !== "error" && p.property_url !== "pending").map(p => p.id)
        : connectedProviders.filter(p => p.id === selectedPropertyId && p.status !== "error" && p.property_url !== "pending").map(p => p.id);

      if (propertiesToSync.length === 0) {
        toast.warning("No properties to sync. Please reconnect Google Search Console.");
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
    } catch (error) {
      log.error('syncData', 'Sync error', { data: error });
      toast.error("Failed to sync data", { description: getErrorMessage(error, "Please try again later") });
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
    } catch (error) {
      log.error('exportData', 'Export error', { data: error });
      toast.error("Failed to export data", {
        description: getErrorMessage(error, "Please try again later"),
      });
    }
  };

  const handleDisconnectAll = async () => {
    if (!confirm("Disconnect all Google Search Console properties? You'll need to reconnect.")) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // EVERY STEP OF A DISCONNECT IS CHECKED, because the failure mode here is
      // telling someone their account is disconnected when it is not.
      //
      // The read below discarded its error, so a failure gave credIds = [], both
      // writes were skipped, and the code fell through to setConnectedProviders([])
      // and a "Disconnected" toast. The UI showed no connection while the OAuth
      // credential stayed active and every property row remained. The two writes
      // discarded their errors too, so the same false confirmation appeared even
      // when the read had worked.
      const { data: creds, error: credsError } = await supabase
        .from("gsc_oauth_credentials")
        .select("id")
        .eq("user_id", user.id);

      if (credsError) {
        toast.error("Could not disconnect — nothing was changed", {
          description: getErrorMessage(credsError),
        });
        return;
      }

      const credIds = (creds || []).map((c) => c.id);

      if (credIds.length > 0) {
        const { error: propsError } = await supabase
          .from("gsc_properties")
          .delete()
          .in("oauth_credential_id", credIds);

        if (propsError) {
          toast.error("Could not remove properties — still connected", {
            description: getErrorMessage(propsError),
          });
          return;
        }

        const { error: deactivateError } = await supabase
          .from("gsc_oauth_credentials")
          .update({ is_active: false })
          .in("id", credIds);

        if (deactivateError) {
          // The properties are gone but the credential is still live, which is
          // the state most worth naming rather than reporting as success.
          toast.error("Properties removed but the credential is still active", {
            description: getErrorMessage(deactivateError),
          });
          return;
        }
      }

      setConnectedProviders([]);
      setSelectedPropertyId("all");
      toast.success("Disconnected", {
        description: "All GSC connections removed. Connect again to start fresh.",
      });
    } catch (error) {
      log.error('disconnect', 'Disconnect failed', { data: error });
      toast.error("Failed to disconnect", { description: getErrorMessage(error) });
    }
  };

  const handleRefreshProperties = async () => {
    try {
      // Find the active credential — use oauth_credential_id (not gsc_properties.id)
      const activeProvider = connectedProviders.find((p) => p.status === "connected");
      if (!activeProvider) {
        toast.warning("No active connection to refresh.");
        return;
      }
      const credentialId = activeProvider.oauth_credential_id;

      toast.info("Refreshing properties…");

      // Refresh the session to get a valid access token
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr || !session?.access_token) {
        // Session expired — fall back to direct DB cleanup
        await handleDirectCleanup();
        return;
      }

      const propRes = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gsc-fetch-properties`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ credentialId }),
        }
      );

      if (!propRes.ok) {
        log.error('refreshProps', `gsc-fetch-properties returned ${propRes.status}`, {});
        // Fall back to direct DB cleanup when the edge function is unavailable
        await handleDirectCleanup();
        return;
      }

      const propJson = await propRes.json().catch(() => ({}));

      if (propJson.warning) {
        toast.warning("GSC API issue", { description: propJson.warning });
      } else {
        toast.success(`Properties refreshed: ${propJson.count ?? 0} found`);
      }
      await loadConnectedProviders();
    } catch (error) {
      log.error('refreshProps', 'Refresh failed', { data: error });
      toast.error("Failed to refresh properties");
    }
  };

  // Direct DB cleanup: removes gsc_properties rows that don't belong to this site.
  // Used as fallback when the edge function call fails.
  const handleDirectCleanup = async () => {
    try {
      toast.info("Cleaning up non-site properties directly…");

      const siteUrl = import.meta.env.VITE_SITE_URL || "";
      const domain = siteUrl
        .replace(/^https?:\/\/(www\.)?/, "")
        .replace(/\/$/, "")
        .toLowerCase();

      if (!domain) {
        toast.error("VITE_SITE_URL not configured — cannot filter automatically. Use Disconnect and reconnect.");
        return;
      }

      // Fetch all properties, then delete those that don't match the domain
      const { data: allProps, error: allPropsError } = await supabase
        .from("gsc_properties")
        .select("id, property_url");

      // THIS READ DECIDES WHAT GETS DELETED, so a failure must stop the action
      // rather than narrow it. The error was discarded, so a failed read gave
      // allProps null, `toDelete` came out empty, and the branch below reported
      // "Already showing only your site's properties" with a SUCCESS toast. The
      // delete direction was safe - nothing was removed - but the user was told
      // a cleanup had happened when nothing had been read at all.
      if (allPropsError) {
        toast.error("Could not read properties — nothing was changed", {
          description: getErrorMessage(allPropsError),
        });
        return;
      }

      const toDelete = (allProps || [])
        .filter((p) => !p.property_url.toLowerCase().includes(domain))
        .map((p) => p.id);

      if (toDelete.length === 0) {
        toast.success("Already showing only your site's properties.");
        await loadConnectedProviders();
        return;
      }

      const { error } = await supabase
        .from("gsc_properties")
        .delete()
        .in("id", toDelete);

      if (error) {
        toast.error("Could not remove extra properties", { description: getErrorMessage(error) });
        return;
      }

      toast.success(`Removed ${toDelete.length} extra properties. Now showing ${domain} only.`);
      await loadConnectedProviders();
    } catch (err) {
      log.error('directCleanup', 'Cleanup failed', { data: err });
      toast.error("Cleanup failed — use Disconnect and reconnect instead.");
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
            disabled={syncing || connectedProviders.filter(p => p.status !== "error" && p.property_url !== "pending").length === 0}
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
            <div className="space-y-3">
              {/* Group by provider type — show one card per Google account, not one per property */}
              {(() => {
                const groups: Record<string, ConnectedProvider[]> = {};
                for (const p of connectedProviders) {
                  if (!groups[p.provider_name]) groups[p.provider_name] = [];
                  groups[p.provider_name].push(p);
                }
                return Object.entries(groups).map(([providerName, props]) => {
                  const activeCount = props.filter(p => p.status === "connected").length;
                  const latestSync = props
                    .filter(p => p.last_sync_at)
                    .sort((a, b) => new Date(b.last_sync_at!).getTime() - new Date(a.last_sync_at!).getTime())[0]
                    ?.last_sync_at;
                  const overallStatus = activeCount > 0 ? "connected" : "error";

                  return (
                    <Card
                      key={providerName}
                      className={overallStatus === "connected" ? "border-green-500" : "border-destructive"}
                    >
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-center justify-between flex-wrap gap-3">
                          <div className="flex items-center gap-3">
                            {getProviderIcon(providerName)}
                            <div>
                              <p className="font-medium text-sm">{getProviderLabel(providerName)}</p>
                              <p className="text-xs text-muted-foreground">
                                {props.length === 1
                                  ? props[0].property_name
                                  : `${props.length} properties connected`}
                              </p>
                              {latestSync && (
                                <p className="text-xs text-muted-foreground">
                                  Last synced {format(new Date(latestSync), "MMM d, h:mm a")}
                                </p>
                              )}
                              {props.length > 1 && (
                                <p className="text-xs text-amber-400 mt-1">
                                  ⚠ Multiple sites detected — click "Refresh Properties" to filter to {import.meta.env.VITE_SITE_URL || "your site"} only, then reconnect.
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {overallStatus === "connected" && (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 text-xs"
                              onClick={handleRefreshProperties}
                            >
                              <RefreshCw className="h-3 w-3" />
                              Refresh Properties
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="gap-1 text-xs"
                              onClick={handleDisconnectAll}
                            >
                              <Trash2 className="h-3 w-3" />
                              Disconnect
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                });
              })()}
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
