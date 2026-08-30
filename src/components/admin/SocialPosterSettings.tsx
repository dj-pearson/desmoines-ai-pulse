import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface PosterConfig {
  enabled: boolean;
  pause_events: boolean;
  pause_restaurants: boolean;
}

const DEFAULT_CONFIG: PosterConfig = {
  enabled: true,
  pause_events: false,
  pause_restaurants: false,
};

const SETTING_TYPE = "social_daily_poster";

/**
 * Admin controls for the daily social auto-poster (WEB-AUTO-012). Persists to the
 * `social_daily_poster` row in system_settings, which the social-daily-poster
 * edge function reads each run to decide what (if anything) to post.
 */
export default function SocialPosterSettings() {
  const { toast } = useToast();
  const [config, setConfig] = useState<PosterConfig>(DEFAULT_CONFIG);
  const [rowId, setRowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("id, settings")
        .eq("setting_type", SETTING_TYPE)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!active) return;
      if (error) {
        toast({
          title: "Couldn't load posting settings",
          description: error.message,
          variant: "destructive",
        });
      } else if (data) {
        setRowId(data.id);
        const s = (data.settings ?? {}) as Partial<PosterConfig>;
        setConfig({
          enabled: s.enabled !== false,
          pause_events: s.pause_events === true,
          pause_restaurants: s.pause_restaurants === true,
        });
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [toast]);

  const handleSave = async () => {
    setSaving(true);
    const payload = { setting_type: SETTING_TYPE, settings: config, updated_at: new Date().toISOString() };
    const query = rowId
      ? supabase.from("system_settings").update(payload).eq("id", rowId)
      : supabase.from("system_settings").insert(payload);
    const { error } = await query;
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Posting settings saved" });
  };

  const set = (key: keyof PosterConfig, value: boolean) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily auto-posting</CardTitle>
        <CardDescription>
          Controls the zero-touch daily social poster. It picks the highest-signal
          upcoming event and a featured restaurant (not posted in the last 30 days)
          and publishes via your connected webhooks each morning.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="poster-enabled" className="text-sm font-medium">
                  Auto-posting enabled
                </Label>
                <p className="text-xs text-muted-foreground">
                  Master switch. When off, no daily posts are generated.
                </p>
              </div>
              <Switch
                id="poster-enabled"
                checked={config.enabled}
                onCheckedChange={(v) => set("enabled", v)}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="poster-pause-events" className="text-sm font-medium">
                  Pause event posts
                </Label>
                <p className="text-xs text-muted-foreground">
                  Skip the daily “event of the day” post.
                </p>
              </div>
              <Switch
                id="poster-pause-events"
                checked={config.pause_events}
                onCheckedChange={(v) => set("pause_events", v)}
                disabled={!config.enabled}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="poster-pause-restaurants" className="text-sm font-medium">
                  Pause restaurant posts
                </Label>
                <p className="text-xs text-muted-foreground">
                  Skip the daily “restaurant of the day” post.
                </p>
              </div>
              <Switch
                id="poster-pause-restaurants"
                checked={config.pause_restaurants}
                onCheckedChange={(v) => set("pause_restaurants", v)}
                disabled={!config.enabled}
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save settings
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              To pause an individual platform, disable its webhook under{" "}
              <span className="font-medium">Accounts</span>. Posting history is in
              the <span className="font-medium">Post queue</span> tab.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
