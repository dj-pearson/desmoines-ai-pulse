import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw,
  Play,
  Pause,
  BellRing,
  CreditCard,
  ArrowDownCircle,
  Heart,
  CheckCircle2,
} from "lucide-react";

/**
 * WEB-AUTO-013 — Subscription lifecycle panel.
 * Shows the recent subscription_events trail + 30-day rollups (MRR/churn
 * signal) and lets an admin run-now / pause the automation. subscription_events
 * and system_settings aren't in generated types — accessed via casts.
 */

interface SubscriptionEvent {
  id: string;
  user_id: string | null;
  stripe_subscription_id: string | null;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  amount: number | null;
  currency: string | null;
  created_at: string;
}

const EVENT_META: Record<string, { label: string; icon: typeof BellRing; className: string }> = {
  renewal_reminder_sent: { label: "Renewal reminder", icon: BellRing, className: "bg-blue-600 hover:bg-blue-600" },
  payment_failed: { label: "Payment failed", icon: CreditCard, className: "bg-amber-500 hover:bg-amber-500" },
  dunning_email_sent: { label: "Dunning email", icon: CreditCard, className: "bg-amber-600 hover:bg-amber-600" },
  payment_recovered: { label: "Recovered", icon: CheckCircle2, className: "bg-green-600 hover:bg-green-600" },
  downgraded: { label: "Downgraded", icon: ArrowDownCircle, className: "bg-red-600 hover:bg-red-600" },
  canceled: { label: "Canceled", icon: ArrowDownCircle, className: "bg-muted-foreground" },
  winback_sent: { label: "Win-back", icon: Heart, className: "bg-purple-600 hover:bg-purple-600" },
};

function eventBadge(type: string) {
  const meta = EVENT_META[type];
  if (!meta) return <Badge variant="secondary">{type}</Badge>;
  const Icon = meta.icon;
  return (
    <Badge className={meta.className}>
      <Icon className="h-3 w-3 mr-1" />
      {meta.label}
    </Badge>
  );
}

export default function SubscriptionLifecyclePanel() {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [pausing, setPausing] = useState(false);

  const { data: events, isLoading, refetch } = useQuery({
    queryKey: ["subscription-events"],
    queryFn: async (): Promise<SubscriptionEvent[]> => {
      const { data, error } = await supabase
        .from("subscription_events" as never)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as SubscriptionEvent[];
    },
    refetchInterval: 60_000,
  });

  const { data: paused, refetch: refetchPause } = useQuery({
    queryKey: ["subscription-lifecycle-pause"],
    queryFn: async (): Promise<boolean> => {
      const { data } = await supabase
        .from("system_settings")
        .select("settings")
        .eq("setting_type", "subscription_lifecycle")
        .maybeSingle();
      return (data as { settings?: { paused?: boolean } } | null)?.settings?.paused === true;
    },
  });

  // 30-day rollups by event type (MRR/churn signal).
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = (events ?? []).filter((e) => new Date(e.created_at).getTime() >= cutoff);
  const tally = (type: string) => recent.filter((e) => e.event_type === type).length;

  const runNow = async () => {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke("subscription-lifecycle", { body: { manual: true } });
      if (error) throw error;
      toast({ title: "Lifecycle job triggered", description: "Subscription lifecycle run started." });
      setTimeout(() => refetch(), 2500);
    } catch (e) {
      toast({
        title: "Failed to run job",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  const togglePause = async () => {
    setPausing(true);
    try {
      const next = !paused;
      const { error } = await supabase
        .from("system_settings")
        .update({ settings: { paused: next } })
        .eq("setting_type", "subscription_lifecycle");
      if (error) throw error;
      toast({ title: next ? "Automation paused" : "Automation resumed" });
      refetchPause();
    } catch (e) {
      toast({
        title: "Failed to update",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setPausing(false);
    }
  };

  const KPI = ({ label, value }: { label: string; value: number }) => (
    <div className="rounded-lg border p-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Subscription Lifecycle</h2>
          <p className="text-sm text-muted-foreground">
            Automated renewal reminders, dunning, downgrades, and win-backs (web subscriptions only).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {paused && <Badge variant="destructive">Paused</Badge>}
          <Button variant="outline" size="sm" onClick={togglePause} disabled={pausing}>
            {paused ? <Play className="h-4 w-4 mr-1" /> : <Pause className="h-4 w-4 mr-1" />}
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button variant="outline" size="sm" onClick={runNow} disabled={running}>
            <Play className={`h-4 w-4 mr-1 ${running ? "animate-pulse" : ""}`} />
            Run now
          </Button>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="text-sm font-medium mb-3">Last 30 days</div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <KPI label="Renewal reminders" value={tally("renewal_reminder_sent")} />
          <KPI label="Payment failures" value={tally("payment_failed")} />
          <KPI label="Dunning emails" value={tally("dunning_email_sent")} />
          <KPI label="Recovered" value={tally("payment_recovered")} />
          <KPI label="Downgrades" value={tally("downgraded")} />
          <KPI label="Win-backs" value={tally("winback_sent")} />
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-sm font-medium mb-3">Recent lifecycle events</div>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !events || events.length === 0 ? (
          <div className="text-sm text-muted-foreground">No subscription lifecycle events yet.</div>
        ) : (
          <div className="space-y-2">
            {events.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 border-b pb-2 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  {eventBadge(e.event_type)}
                  <span className="text-xs text-muted-foreground truncate">
                    {e.stripe_subscription_id ?? e.user_id ?? "—"}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {e.amount != null && (
                    <span className="text-xs font-medium">
                      ${e.amount.toFixed(2)} {(e.currency ?? "usd").toUpperCase()}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
