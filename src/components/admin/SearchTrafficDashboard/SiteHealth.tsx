import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Activity,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { createLogger } from '@/lib/logger';

const log = createLogger('SiteHealth');

interface SiteHealthProps {
  dateRange: { from: Date; to: Date };
  selectedProvider: string;
}

export function SiteHealth({ dateRange, selectedProvider }: SiteHealthProps) {
  const [loading, setLoading] = useState(true);
  const [healthMetrics, setHealthMetrics] = useState<any[]>([]);
  const [summary, setSummary] = useState({
    critical: 0,
    warning: 0,
    info: 0,
  });

  useEffect(() => {
    loadHealthData();
  }, [dateRange, selectedProvider]);

  const loadHealthData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const query = supabase
        .from("site_health_metrics")
        .select("*")
        .eq("user_id", user.id)
        .gte("check_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("check_date", format(dateRange.to, "yyyy-MM-dd"))
        .order("check_date", { ascending: false });

      if (selectedProvider !== "all") {
        query.eq("provider_name", selectedProvider);
      }

      const { data, error } = await query;

      if (error) throw error;

      setHealthMetrics(data || []);

      // Calculate summary
      const critical = (data || []).filter((m) => m.severity === "critical").length;
      const warning = (data || []).filter((m) => m.severity === "warning").length;
      const info = (data || []).filter((m) => m.severity === "info").length;

      setSummary({ critical, warning, info });
    } catch (error) {
      log.error('Error loading health data', { action: 'loadHealthData', metadata: { error } });
    } finally {
      setLoading(false);
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case "warning":
        return <AlertCircle className="h-5 w-5 text-orange-500" />;
      case "info":
        return <Info className="h-5 w-5 text-blue-500" />;
      default:
        return <Activity className="h-5 w-5 text-gray-500" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    const variants: Record<string, "destructive" | "default" | "secondary"> = {
      critical: "destructive",
      warning: "default",
      info: "secondary",
    };
    return variants[severity] || "secondary";
  };

  const getSeverityBorderColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "#ef4444";
      case "warning":
        return "#f59e0b";
      case "info":
        return "#0ea5e9";
      default:
        return "#6b7280";
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="animate-pulse space-y-3">
                <div className="h-6 bg-muted rounded w-48"></div>
                <div className="h-4 bg-muted rounded w-full"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Issues</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{summary.critical}</div>
            <p className="text-xs text-muted-foreground mt-1">Require immediate attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Warnings</CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{summary.warning}</div>
            <p className="text-xs text-muted-foreground mt-1">Should be addressed soon</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Informational</CardTitle>
            <Info className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{summary.info}</div>
            <p className="text-xs text-muted-foreground mt-1">For your information</p>
          </CardContent>
        </Card>
      </div>

      {/* Health Issues */}
      <Card>
        <CardHeader>
          <CardTitle>Site Health Issues</CardTitle>
          <CardDescription>Technical SEO issues detected across platforms</CardDescription>
        </CardHeader>
        <CardContent>
          {healthMetrics.length > 0 ? (
            <div className="space-y-4">
              {healthMetrics.map((metric, index) => (
                <Card
                  key={index}
                  className="border-l-4"
                  style={{ borderLeftColor: getSeverityBorderColor(metric.severity) }}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        {getSeverityIcon(metric.severity)}
                        <div>
                          <CardTitle className="text-base capitalize">{metric.metric_type.replace(/_/g, " ")}</CardTitle>
                          <CardDescription className="text-xs mt-1">
                            {format(new Date(metric.check_date), "MMM dd, yyyy")} • {metric.provider_name}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant={getSeverityBadge(metric.severity)} className="capitalize">
                        {metric.severity}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-sm">
                      <p>{metric.issue_description}</p>
                      {metric.affected_urls > 0 && (
                        <p className="text-muted-foreground mt-1">
                          Affects <strong>{metric.affected_urls}</strong> URL{metric.affected_urls !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                    {metric.metadata && (
                      <Alert className="bg-muted/50 border-0 mt-2">
                        <AlertDescription className="text-xs">
                          <pre className="whitespace-pre-wrap">{JSON.stringify(metric.metadata, null, 2)}</pre>
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
              <p className="text-lg font-medium">All Clear!</p>
              <p className="text-sm text-muted-foreground">No health issues detected for the selected period</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
