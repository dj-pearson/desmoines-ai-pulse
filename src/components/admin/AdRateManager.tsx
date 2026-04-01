import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, Save, RotateCcw } from "lucide-react";
import { createLogger } from "@/lib/logger";

const log = createLogger("AdRateManager");

interface RateCard {
  id: string;
  placement_type: string;
  base_daily_rate: number;
  cpm_rate: number;
  min_days: number;
  max_days: number;
  min_lead_time_days: number;
  discount_7_day: number;
  discount_14_day: number;
  discount_30_day: number;
  peak_multiplier: number;
  high_multiplier: number;
  is_active: boolean;
  updated_at: string;
}

const PLACEMENT_LABELS: Record<string, string> = {
  top_banner: "Top Banner",
  featured_spot: "Featured Spot",
  below_fold: "Below the Fold",
};

export function AdRateManager() {
  const { toast } = useToast();
  const [rates, setRates] = useState<RateCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editedRates, setEditedRates] = useState<Record<string, Partial<RateCard>>>({});

  useEffect(() => {
    fetchRates();
  }, []);

  const fetchRates = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("ad_rate_card")
        .select("*")
        .order("placement_type");

      if (error) throw error;
      setRates(data || []);
      setEditedRates({});
    } catch (err) {
      log.error("fetchRates", "Failed to fetch rate cards", { error: err });
      toast({
        variant: "destructive",
        title: "Failed to load rates",
        description: "Could not fetch the current ad rate cards.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFieldChange = (placementType: string, field: string, value: string) => {
    const numericValue = parseFloat(value);
    setEditedRates((prev) => ({
      ...prev,
      [placementType]: {
        ...prev[placementType],
        [field]: isNaN(numericValue) ? 0 : numericValue,
      },
    }));
  };

  const getFieldValue = (rate: RateCard, field: keyof RateCard): number => {
    const edited = editedRates[rate.placement_type];
    if (edited && field in edited) {
      return edited[field] as number;
    }
    return rate[field] as number;
  };

  const hasChanges = (placementType: string): boolean => {
    return !!editedRates[placementType] && Object.keys(editedRates[placementType]).length > 0;
  };

  const handleSave = async (rate: RateCard) => {
    const edits = editedRates[rate.placement_type];
    if (!edits || Object.keys(edits).length === 0) return;

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("ad_rate_card")
        .update({
          ...edits,
          updated_by: user?.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", rate.id);

      if (error) throw error;

      toast({
        title: "Rate updated",
        description: `${PLACEMENT_LABELS[rate.placement_type]} rates have been updated.`,
      });

      await fetchRates();
    } catch (err) {
      log.error("handleSave", "Failed to save rate card", { error: err });
      toast({
        variant: "destructive",
        title: "Save failed",
        description: "Could not update the rate card. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = (placementType: string) => {
    setEditedRates((prev) => {
      const next = { ...prev };
      delete next[placementType];
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="h-32 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <DollarSign className="h-6 w-6" />
          Ad Rate Management
        </h2>
        <p className="text-muted-foreground mt-1">
          Set base rates, volume discounts, and traffic multipliers for each ad placement.
          Changes take effect immediately for new campaigns.
        </p>
      </div>

      {rates.map((rate) => (
        <Card key={rate.id} className={hasChanges(rate.placement_type) ? "ring-2 ring-primary" : ""}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {PLACEMENT_LABELS[rate.placement_type] || rate.placement_type}
                  {rate.is_active ? (
                    <Badge className="bg-green-500">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Last updated: {new Date(rate.updated_at).toLocaleDateString()}
                </CardDescription>
              </div>
              {hasChanges(rate.placement_type) && (
                <Badge variant="outline" className="text-primary border-primary">
                  Unsaved changes
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* CPM Pricing — highlighted section */}
            <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">CPM Pricing</span>
                <span className="text-xs text-muted-foreground">
                  — shown to advertisers spending &gt;$5/day/placement as estimated impressions
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>CPM Rate ($ per 1,000 impressions)</Label>
                  <Input
                    type="number"
                    step="0.50"
                    min="1"
                    value={getFieldValue(rate, "cpm_rate")}
                    onChange={(e) => handleFieldChange(rate.placement_type, "cpm_rate", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    At ${getFieldValue(rate, "base_daily_rate")}/day →{" "}
                    ~{Math.round((getFieldValue(rate, "base_daily_rate") / (getFieldValue(rate, "cpm_rate") || 10)) * 1000).toLocaleString()} est. impressions/day
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Base Rate */}
              <div className="space-y-2">
                <Label>Base Daily Rate ($)</Label>
                <Input
                  type="number"
                  step="0.50"
                  min="0"
                  value={getFieldValue(rate, "base_daily_rate")}
                  onChange={(e) => handleFieldChange(rate.placement_type, "base_daily_rate", e.target.value)}
                />
              </div>

              {/* Min Days */}
              <div className="space-y-2">
                <Label>Minimum Days</Label>
                <Input
                  type="number"
                  min="1"
                  value={getFieldValue(rate, "min_days")}
                  onChange={(e) => handleFieldChange(rate.placement_type, "min_days", e.target.value)}
                />
              </div>

              {/* Max Days */}
              <div className="space-y-2">
                <Label>Maximum Days</Label>
                <Input
                  type="number"
                  min="1"
                  value={getFieldValue(rate, "max_days")}
                  onChange={(e) => handleFieldChange(rate.placement_type, "max_days", e.target.value)}
                />
              </div>

              {/* Min Lead Time */}
              <div className="space-y-2">
                <Label>Min Lead Time (days)</Label>
                <Input
                  type="number"
                  min="0"
                  value={getFieldValue(rate, "min_lead_time_days")}
                  onChange={(e) => handleFieldChange(rate.placement_type, "min_lead_time_days", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Days before start for creative review</p>
              </div>

              {/* Discounts */}
              <div className="space-y-2">
                <Label>7-Day Discount (%)</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={getFieldValue(rate, "discount_7_day")}
                  onChange={(e) => handleFieldChange(rate.placement_type, "discount_7_day", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>14-Day Discount (%)</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={getFieldValue(rate, "discount_14_day")}
                  onChange={(e) => handleFieldChange(rate.placement_type, "discount_14_day", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>30-Day Discount (%)</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={getFieldValue(rate, "discount_30_day")}
                  onChange={(e) => handleFieldChange(rate.placement_type, "discount_30_day", e.target.value)}
                />
              </div>

              {/* Traffic Multipliers */}
              <div className="space-y-2">
                <Label>Peak Traffic Multiplier</Label>
                <Input
                  type="number"
                  step="0.05"
                  min="1"
                  value={getFieldValue(rate, "peak_multiplier")}
                  onChange={(e) => handleFieldChange(rate.placement_type, "peak_multiplier", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">e.g., 1.5 = 50% price increase</p>
              </div>

              <div className="space-y-2">
                <Label>High Traffic Multiplier</Label>
                <Input
                  type="number"
                  step="0.05"
                  min="1"
                  value={getFieldValue(rate, "high_multiplier")}
                  onChange={(e) => handleFieldChange(rate.placement_type, "high_multiplier", e.target.value)}
                />
              </div>
            </div>

            {/* Pricing Preview */}
            <div className="mt-6 p-4 bg-muted/50 rounded-lg">
              <h4 className="font-semibold text-sm mb-2">Pricing Preview:</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">1 day:</span>{" "}
                  <span className="font-medium">${getFieldValue(rate, "base_daily_rate").toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">7 days:</span>{" "}
                  <span className="font-medium">
                    ${(getFieldValue(rate, "base_daily_rate") * 7 * (1 - getFieldValue(rate, "discount_7_day") / 100)).toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">14 days:</span>{" "}
                  <span className="font-medium">
                    ${(getFieldValue(rate, "base_daily_rate") * 14 * (1 - getFieldValue(rate, "discount_14_day") / 100)).toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">30 days:</span>{" "}
                  <span className="font-medium">
                    ${(getFieldValue(rate, "base_daily_rate") * 30 * (1 - getFieldValue(rate, "discount_30_day") / 100)).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            {hasChanges(rate.placement_type) && (
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleReset(rate.placement_type)}
                  disabled={isSaving}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Reset
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleSave(rate)}
                  disabled={isSaving}
                >
                  <Save className="h-4 w-4 mr-1" />
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
