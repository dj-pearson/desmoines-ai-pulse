import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard } from "lucide-react";

/**
 * Subscription lifecycle log (WEB-AUTO-013). Recent dunning/retention
 * transitions + 30-day counts so MRR/churn impact is visible. Reads the
 * subscription_events table (admin-RLS).
 */
interface EventRow {
  id: string;
  event_type: string;
  platform: string | null;
  created_at: string;
}

const LABELS: Record<string, string> = {
  renewal_reminder: "Renewal reminders",
  payment_failed: "Payment-failed nudges",
  downgraded: "Auto-downgrades",
  winback: "Win-back offers",
};

export default function SubscriptionEventsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["subscription-events"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("subscription_events")
        .select("id, event_type, platform, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as EventRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return null;

  const rows = data || [];
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.event_type] = (counts[r.event_type] || 0) + 1;

  return (
    <Card className="p-4 space-y-3">
      <h3 className="font-semibold flex items-center gap-2">
        <CreditCard className="h-4 w-4" /> Subscription lifecycle (30d)
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No lifecycle events yet. The daily job records renewal reminders,
          dunning nudges, downgrades, and win-backs here.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {Object.entries(LABELS).map(([key, label]) => (
              <Badge key={key} variant="secondary">
                {label}: {counts[key] || 0}
              </Badge>
            ))}
          </div>
          <ul className="text-xs text-muted-foreground space-y-1 max-h-48 overflow-y-auto">
            {rows.slice(0, 20).map((r) => (
              <li key={r.id} className="flex justify-between gap-2">
                <span>{LABELS[r.event_type] || r.event_type}</span>
                <span>{new Date(r.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
