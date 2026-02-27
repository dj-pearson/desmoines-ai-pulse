import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "./use-toast";
import { createLogger } from '@/lib/logger';

const log = createLogger('useCampaignAnalytics');

export interface CampaignAnalyticsSummary {
  totalImpressions: number;
  totalClicks: number;
  avgCtr: number;
  uniqueViewers: number;
  totalCost: number;
}

export interface DailyAnalytics {
  date: string;
  impressions: number;
  clicks: number;
  ctr: number;
  cost: number;
}

export interface CreativePerformance {
  creativeId: string;
  title: string;
  imageUrl: string;
  placementType: string;
  impressions: number;
  clicks: number;
  ctr: number;
  cost: number;
}

export function useCampaignAnalytics(campaignId: string) {
  const [summary, setSummary] = useState<CampaignAnalyticsSummary | null>(null);
  const [dailyData, setDailyData] = useState<DailyAnalytics[]>([]);
  const [creativePerformance, setCreativePerformance] = useState<CreativePerformance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const fetchAnalytics = async (startDate?: string, endDate?: string) => {
    if (!campaignId) return;

    try {
      setIsLoading(true);

      // Fetch impressions
      let impressionQuery = supabase
        .from("ad_impressions")
        .select("id, campaign_id, creative_id, placement_type, session_id, date, timestamp")
        .eq("campaign_id", campaignId);

      if (startDate) {
        impressionQuery = impressionQuery.gte("date", startDate);
      }
      if (endDate) {
        impressionQuery = impressionQuery.lte("date", endDate);
      }

      // Fetch clicks separately from the ad_clicks table
      let clickQuery = supabase
        .from("ad_clicks")
        .select("id, campaign_id, creative_id, date, timestamp")
        .eq("campaign_id", campaignId);

      if (startDate) {
        clickQuery = clickQuery.gte("date", startDate);
      }
      if (endDate) {
        clickQuery = clickQuery.lte("date", endDate);
      }

      // Fetch campaign cost and creatives info
      const campaignQuery = supabase
        .from("campaigns")
        .select("total_cost")
        .eq("id", campaignId)
        .single();

      const creativesQuery = supabase
        .from("campaign_creatives")
        .select("id, title, image_url, placement_type")
        .eq("campaign_id", campaignId);

      // Execute all queries in parallel
      const [impressionResult, clickResult, campaignResult, creativesResult] = await Promise.all([
        impressionQuery,
        clickQuery,
        campaignQuery,
        creativesQuery,
      ]);

      if (impressionResult.error) throw impressionResult.error;
      if (clickResult.error) throw clickResult.error;

      const impressions = impressionResult.data || [];
      const clicks = clickResult.data || [];
      const totalCost = campaignResult.data?.total_cost || 0;
      const creatives = creativesResult.data || [];

      // Build creative lookup
      const creativeLookup: Record<string, { title: string; imageUrl: string; placementType: string }> = {};
      creatives.forEach((c) => {
        creativeLookup[c.id] = {
          title: c.title || 'Untitled',
          imageUrl: c.image_url || '',
          placementType: c.placement_type || 'unknown',
        };
      });

      // Calculate summary
      const totalImpressions = impressions.length;
      const totalClicks = clicks.length;
      const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      const uniqueViewers = new Set(impressions.map((i) => i.session_id)).size;

      setSummary({
        totalImpressions,
        totalClicks,
        avgCtr,
        uniqueViewers,
        totalCost,
      });

      // Build daily data by combining impressions and clicks
      const dailyImpressions: Record<string, number> = {};
      const dailyClicks: Record<string, number> = {};

      impressions.forEach((imp) => {
        const date = imp.date || (imp.timestamp ? new Date(imp.timestamp).toISOString().split("T")[0] : 'unknown');
        dailyImpressions[date] = (dailyImpressions[date] || 0) + 1;
      });

      clicks.forEach((click) => {
        const date = click.date || (click.timestamp ? new Date(click.timestamp).toISOString().split("T")[0] : 'unknown');
        dailyClicks[date] = (dailyClicks[date] || 0) + 1;
      });

      // Merge dates from both impressions and clicks
      const allDates = new Set([
        ...Object.keys(dailyImpressions),
        ...Object.keys(dailyClicks),
      ]);
      const numDays = allDates.size || 1;

      const dailyAnalytics: DailyAnalytics[] = Array.from(allDates).map((date) => {
        const imps = dailyImpressions[date] || 0;
        const clks = dailyClicks[date] || 0;
        return {
          date,
          impressions: imps,
          clicks: clks,
          ctr: imps > 0 ? (clks / imps) * 100 : 0,
          cost: totalCost / numDays,
        };
      });

      dailyAnalytics.sort((a, b) => a.date.localeCompare(b.date));
      setDailyData(dailyAnalytics);

      // Calculate creative performance
      const creativeImpressions: Record<string, number> = {};
      const creativeClicks: Record<string, number> = {};

      impressions.forEach((imp) => {
        if (imp.creative_id) {
          creativeImpressions[imp.creative_id] = (creativeImpressions[imp.creative_id] || 0) + 1;
        }
      });

      clicks.forEach((click) => {
        if (click.creative_id) {
          creativeClicks[click.creative_id] = (creativeClicks[click.creative_id] || 0) + 1;
        }
      });

      const creativePerf: CreativePerformance[] = Object.keys(creativeLookup).map((creativeId) => {
        const imps = creativeImpressions[creativeId] || 0;
        const clks = creativeClicks[creativeId] || 0;
        const info = creativeLookup[creativeId];
        return {
          creativeId,
          title: info.title,
          imageUrl: info.imageUrl,
          placementType: info.placementType,
          impressions: imps,
          clicks: clks,
          ctr: imps > 0 ? (clks / imps) * 100 : 0,
          cost: totalImpressions > 0 ? totalCost * (imps / totalImpressions) : 0,
        };
      });

      creativePerf.sort((a, b) => b.impressions - a.impressions);
      setCreativePerformance(creativePerf);
    } catch (err) {
      log.error('fetchAnalytics', 'Error fetching campaign analytics', { error: err });
      toast({
        variant: "destructive",
        title: "Failed to load analytics",
        description: err instanceof Error ? err.message : "An error occurred",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const exportToCSV = () => {
    if (!summary || dailyData.length === 0) {
      toast({
        variant: "destructive",
        title: "No data to export",
        description: "Please wait for analytics data to load.",
      });
      return;
    }

    try {
      const headers = ["Date", "Impressions", "Clicks", "CTR (%)", "Cost ($)"];
      const rows = dailyData.map((day) => [
        day.date,
        day.impressions,
        day.clicks,
        day.ctr.toFixed(2),
        day.cost.toFixed(2),
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map((row) => row.join(",")),
        "",
        "Summary",
        `Total Impressions,${summary.totalImpressions}`,
        `Total Clicks,${summary.totalClicks}`,
        `Average CTR,${summary.avgCtr.toFixed(2)}%`,
        `Unique Viewers,${summary.uniqueViewers}`,
        `Total Cost,$${summary.totalCost.toFixed(2)}`,
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `campaign-analytics-${campaignId}-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Export successful",
        description: "Analytics data has been exported to CSV.",
      });
    } catch (err) {
      log.error('exportCSV', 'Error exporting CSV', { error: err });
      toast({
        variant: "destructive",
        title: "Export failed",
        description: "Failed to export analytics data.",
      });
    }
  };

  return {
    summary,
    dailyData,
    creativePerformance,
    isLoading,
    fetchAnalytics,
    exportToCSV,
  };
}
