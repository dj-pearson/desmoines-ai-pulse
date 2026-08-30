import { useEffect, useState } from "react";
import { CalendarClock, Eye, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/errorHandler";
import { SecurityUtils } from "@/lib/securityUtils";
import { toast } from "sonner";

const FLAG_KEY = "weekly_digest_enabled";

interface PreviewResult {
  subject: string;
  body_html: string;
  recipient_count: number;
  counts: { events: number; restaurants: number; article: number };
}

/**
 * WEB-AUTO-008 — admin controls for the auto-assembled weekly digest.
 * Pause the recurrence with one toggle (feature_flags.weekly_digest_enabled)
 * and preview next Tuesday's digest without sending anything.
 */
export default function WeeklyDigestControls() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  async function loadFlag() {
    try {
      const { data, error } = await supabase
        .from("feature_flags")
        .select("enabled")
        .eq("flag_key", FLAG_KEY)
        .maybeSingle();
      if (error) throw error;
      setEnabled(data?.enabled ?? false);
    } catch (err) {
      handleError(err, { component: "WeeklyDigestControls", action: "loadFlag" });
      setEnabled(false);
    }
  }

  useEffect(() => {
    loadFlag();
  }, []);

  async function toggle(next: boolean) {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("feature_flags")
        .update({ enabled: next })
        .eq("flag_key", FLAG_KEY);
      if (error) throw error;
      setEnabled(next);
      toast.success(next ? "Weekly digest resumed" : "Weekly digest paused");
    } catch (err) {
      handleError(err, { component: "WeeklyDigestControls", action: "toggle" });
      toast.error("Failed to update setting");
    } finally {
      setSaving(false);
    }
  }

  async function runPreview() {
    setPreviewing(true);
    try {
      const { data, error } = await supabase.functions.invoke<
        PreviewResult & { ok: boolean }
      >("assemble-weekly-digest", { body: { action: "preview" } });
      if (error) throw error;
      if (!data?.ok) throw new Error("Preview failed");
      setPreview(data);
    } catch (err) {
      handleError(err, { component: "WeeklyDigestControls", action: "runPreview" });
      toast.error("Failed to build preview");
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5" />
              Weekly digest (automated)
            </CardTitle>
            <CardDescription className="flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" />
              Assembles and sends every Tuesday ~9:00 AM Central. No manual touch
              required.
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={
              enabled
                ? "border-green-500 text-green-600"
                : "border-amber-500 text-amber-600"
            }
          >
            {enabled === null ? "…" : enabled ? "Active" : "Paused"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
          <span className="text-sm">
            <span className="font-medium">Auto-send weekly digest</span>
            <span className="block text-xs text-muted-foreground">
              Turn off to pause the recurrence. Already-scheduled sends still go
              out.
            </span>
          </span>
          <Switch
            checked={enabled ?? false}
            disabled={enabled === null || saving}
            onCheckedChange={toggle}
          />
        </label>

        <Button
          variant="outline"
          size="sm"
          onClick={runPreview}
          disabled={previewing}
        >
          {previewing ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Eye className="h-4 w-4 mr-1" />
          )}
          Preview next week's digest
        </Button>
      </CardContent>

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Weekly digest preview</DialogTitle>
            <DialogDescription>
              {preview
                ? `${preview.counts.events} events · ${preview.counts.restaurants} restaurants · ${preview.counts.article} article · ${preview.recipient_count.toLocaleString()} recipients`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="rounded-md border p-4 bg-background">
              <div className="text-xs text-muted-foreground mb-1">Subject</div>
              <div className="font-semibold mb-3">{preview.subject}</div>
              <div
                className="prose prose-sm dark:prose-invert max-w-none border-t pt-3"
                // Sanitize before rendering — defense in depth even for our own
                // generated HTML (matches NewsletterCampaignsManager).
                dangerouslySetInnerHTML={{
                  __html: SecurityUtils.sanitizeRichHTML(preview.body_html),
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
