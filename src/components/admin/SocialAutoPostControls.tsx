import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PlayCircle, Radio } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/errorHandler";
import { toast } from "sonner";

interface AutoPostSettings {
  paused?: boolean;
  paused_platforms?: string[];
}

/**
 * WEB-AUTO-012 — control panel for the daily social auto-post job.
 * Lets an admin pause the whole job or individual platforms (a config flag in
 * system_settings the edge function reads), and trigger a run on demand.
 * Per the story note, the per-platform toggles only list platforms that have
 * an active webhook actually configured.
 */
export default function SocialAutoPostControls() {
  const queryClient = useQueryClient();

  const { data: setting, isLoading } = useQuery({
    queryKey: ["social-auto-post-setting"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("settings")
        .eq("setting_type", "social_auto_post")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: webhooks } = useQuery({
    queryKey: ["social-auto-post-platforms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_media_webhooks")
        .select("platform, is_active")
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const settings = (setting?.settings as AutoPostSettings | null) ?? {};
  const paused = settings.paused === true;
  const pausedPlatforms = useMemo(
    () => (Array.isArray(settings.paused_platforms) ? settings.paused_platforms : []),
    [settings.paused_platforms],
  );

  // Only offer per-platform toggles for platforms with a configured active webhook.
  const configuredPlatforms = useMemo(() => {
    const set = new Set<string>();
    (webhooks ?? []).forEach((w) => w.platform && set.add(w.platform));
    return Array.from(set).sort();
  }, [webhooks]);

  const saveMutation = useMutation({
    mutationFn: async (next: AutoPostSettings) => {
      const { error } = await supabase
        .from("system_settings")
        .update({ settings: next, updated_at: new Date().toISOString() })
        .eq("setting_type", "social_auto_post");
      if (error) throw error;
      return next;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-auto-post-setting"] });
    },
    onError: (err: Error) => {
      handleError(err, { component: "SocialAutoPostControls", action: "save" });
      toast.error("Failed to update auto-post settings");
    },
  });

  const toggleGlobal = (nextPaused: boolean) => {
    saveMutation.mutate(
      { paused: nextPaused, paused_platforms: pausedPlatforms },
      {
        onSuccess: () =>
          toast.success(nextPaused ? "Auto-posting paused" : "Auto-posting resumed"),
      },
    );
  };

  const togglePlatform = (platform: string, enabled: boolean) => {
    // enabled === true means "post to this platform" -> remove from paused list.
    const nextPaused = enabled
      ? pausedPlatforms.filter((p) => p !== platform)
      : Array.from(new Set([...pausedPlatforms, platform]));
    saveMutation.mutate(
      { paused, paused_platforms: nextPaused },
      {
        onSuccess: () =>
          toast.success(
            enabled ? `Resumed posting to ${platform}` : `Paused posting to ${platform}`,
          ),
      },
    );
  };

  const runNowMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("social-media-manager", {
        body: { action: "daily_auto_post" },
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Daily auto-post triggered"),
    onError: (err: Error) => {
      handleError(err, { component: "SocialAutoPostControls", action: "runNow" });
      toast.error("Failed to trigger auto-post");
    },
  });

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Radio className="h-5 w-5" />
              Daily auto-posting
            </CardTitle>
            <CardDescription>
              Posts the event &amp; restaurant of the day automatically (~9am
              Central). No-repeat window: 30 days.
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={runNowMutation.isPending || paused}
            onClick={() => runNowMutation.mutate()}
          >
            {runNowMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <PlayCircle className="h-3.5 w-3.5 mr-1" />
            )}
            Run now
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label htmlFor="auto-post-global" className="text-sm font-medium">
              Auto-posting {paused ? "paused" : "active"}
            </Label>
            <p className="text-xs text-muted-foreground">
              {paused
                ? "The daily job is paused and will not post."
                : "The daily job runs automatically."}
            </p>
          </div>
          <Switch
            id="auto-post-global"
            checked={!paused}
            disabled={isLoading || saveMutation.isPending}
            onCheckedChange={(checked) => toggleGlobal(!checked)}
          />
        </div>

        <div>
          <div className="text-sm font-medium mb-2">Per-platform</div>
          {configuredPlatforms.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No active webhooks configured. Add a webhook under the Accounts tab
              to enable platforms.
            </p>
          ) : (
            <div className="space-y-2">
              {configuredPlatforms.map((platform) => {
                const enabled = !pausedPlatforms.includes(platform);
                return (
                  <div
                    key={platform}
                    className="flex items-center justify-between rounded-md border p-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {platform}
                      </Badge>
                      {!enabled && (
                        <span className="text-xs text-muted-foreground">paused</span>
                      )}
                    </div>
                    <Switch
                      checked={enabled}
                      disabled={isLoading || saveMutation.isPending || paused}
                      onCheckedChange={(checked) => togglePlatform(platform, checked)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
