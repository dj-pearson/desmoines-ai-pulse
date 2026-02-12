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

      // Build query for ad impressions
      let query = supabase
        .from("ad_impressions")
        .select(`
          *,
          campaign_creatives (
            id,
            title,
            image_url,
            campaign_placements (
              placement_type
            )
          )
        `)
        .eq("campaign_id", campaignId);

      if (startDate) {
        query = query.gte("viewed_at", startDate);
      }
      if (endDate) {
        query = query.lte("viewed_at", endDate);
      }

      const { data: impressions, error: impressionsError } = await query;

      if (impressionsError) throw impressionsError;

      // Calculate summary metrics
      const totalImpressions = impressions?.length || 0;
      const totalClicks = impressions?.filter((i) => i.clicked).length || 0;
      const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      const uniqueViewers = new Set(impressions?.map((i) => i.viewer_ip)).size;

      // Get campaign cost
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("total_cost")
        .eq("id", campaignId)
        .single();

      const totalCost = campaign?.total_cost || 0;

      setSummary({
        totalImpressions,
        totalClicks,
        avgCtr,
        uniqueViewers,
        totalCost,
      });

      // Calculate daily data
      const dailyMap: Record<string, { impressions: number; clicks: number }> = {};

      impressions?.forEach((impression) => {
        const date = new Date(impression.viewed_at).toISOString().split("T")[0];
        if (!dailyMap[date]) {
          dailyMap[date] = { impressions: 0, clicks: 0 };
        }
        dailyMap[date].impressions++;
        if (impression.clicked) {
          dailyMap[date].clicks++;
        }
      });

      const dailyAnalytics: DailyAnalytics[] = Object.entries(dailyMap).map(([date, data]) => ({
        date,
        impressions: data.impressions,
        clicks: data.clicks,
        ctr: data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0,
        cost: totalCost / Object.keys(dailyMap).length, // Distribute cost evenly
      }));

      dailyAnalytics.sort((a, b) => a.date.localeCompare(b.date));
      setDailyData(dailyAnalytics);

      // Calculate creative performance
      const creativeMap: Record<string, {
        title: string;
        imageUrl: string;
        placementType: string;
        impressions: number;
        clicks: number;
      }> = {};

      impressions?.forEach((impression) => {
        const creative = impression.campaign_creatives;
        if (creative) {
          const creativeId = creative.id;
          if (!creativeMap[creativeId]) {
            creativeMap[creativeId] = {
              title: creative.title,
              imageUrl: creative.image_url || "",
              placementType: creative.campaign_placements?.[0]?.placement_type || "unknown",
              impressions: 0,
              clicks: 0,
            };
          }
          creativeMap[creativeId].impressions++;
          if (impression.clicked) {
            creativeMap[creativeId].clicks++;
          }
        }
      });

      const creativePerf: CreativePerformance[] = Object.entries(creativeMap).map(([creativeId, data]) => ({
        creativeId,
        title: data.title,
        imageUrl: data.imageUrl,
        placementType: data.placementType,
        impressions: data.impressions,
        clicks: data.clicks,
        ctr: data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0,
        cost: totalCost * (data.impressions / totalImpressions), // Proportional cost
      }));

      creativePerf.sort((a, b) => b.impressions - a.impressions);
      setCreativePerformance(creativePerf);
    } catch (err) {
      log.error("Error fetching campaign analytics", { action: 'fetchAnalytics', metadata: { error: err } });
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
      // Create CSV content
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

      // Create and download file
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
      log.error("Error exporting CSV", { action: 'exportToCSV', metadata: { error: err } });
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
