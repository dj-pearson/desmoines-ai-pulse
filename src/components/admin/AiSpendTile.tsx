import { Bot, PauseCircle, Power } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAiSpendToday } from "@/hooks/useAiSpendToday";
import { formatUsd, type AiProviderSpend } from "@/lib/aiSpend";
import { cn } from "@/lib/utils";

const FEATURE_LABELS: Record<string, string> = {
  "nlp-search": "Search",
  "discover-chat": "Ask Pulse",
  "support-chat": "Support chat",
  itinerary: "Trip planner",
  "personalized-recs": "Recommendations",
};

function StateBadge({ state }: { state: AiProviderSpend["state"] }) {
  if (state === "kill_switch") {
    return (
      <Badge variant="destructive" className="gap-1">
        <Power className="h-3 w-3" aria-hidden="true" /> kill switch
      </Badge>
    );
  }
  if (state === "paused") {
    return (
      <Badge variant="destructive" className="gap-1">
        <PauseCircle className="h-3 w-3" aria-hidden="true" /> paused (monthly)
      </Badge>
    );
  }
  if (state === "over_budget") return <Badge variant="destructive">daily ceiling hit</Badge>;
  return null;
}

function ProviderRow({ p }: { p: AiProviderSpend }) {
  const barPct = p.ratio != null ? Math.min(100, Math.round(p.ratio * 100)) : 0;
  const stopped = p.state !== "ok";
  return (
    <div className="rounded-md border p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium capitalize">{p.provider}</span>
          <StateBadge state={p.state} />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {p.dailyUsd > 0
            ? `${formatUsd(p.spentUsd)} / $${p.dailyUsd.toFixed(0)} today`
            : `${formatUsd(p.spentUsd)} today, no ceiling`}
        </span>
      </div>
      {p.dailyUsd > 0 && (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div
            className={cn(
              "h-full rounded-full",
              stopped ? "bg-destructive" : barPct >= 80 ? "bg-amber-500" : "bg-primary",
            )}
            style={{ width: `${barPct}%` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Today's AI spend by feature and each provider's daily ceiling (WP1 of
 * docs/plans/NON_CORE_REVIEW_2026-09.md). Sits next to ProviderCostTile, which
 * shows the month; this shows the day, which is what consume_ai_quota checks.
 */
export default function AiSpendTile() {
  const { data, isLoading, isError } = useAiSpendToday();
  const stopped = (data?.providers ?? []).filter((p) => p.state !== "ok");

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4" aria-hidden="true" /> AI spend today
            </CardTitle>
            <CardDescription>
              User-facing AI calls by feature, against each provider's daily ceiling. Resets at midnight Central.
            </CardDescription>
          </div>
          {data && (
            <p
              className={cn("text-sm font-semibold", stopped.length > 0 ? "text-destructive" : "text-muted-foreground")}
            >
              {stopped.length > 0
                ? `${stopped.map((p) => p.provider).join(", ")} stopped`
                : `${formatUsd(data.totalUsd)}, ${data.totalCalls} calls`}
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground">
            Unable to load AI usage. If migration 20261001000001 has not been applied yet, ai_usage_daily does not
            exist.
          </p>
        ) : !data ? null : (
          <div className="space-y-4">
            <div className="space-y-2">
              {data.providers.map((p) => (
                <ProviderRow key={p.provider} p={p} />
              ))}
            </div>
            {data.features.length === 0 ? (
              <p className="text-sm text-muted-foreground">No AI calls yet today.</p>
            ) : (
              <table className="w-full text-sm">
                <caption className="sr-only">AI calls and cost by feature today</caption>
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="pb-1 font-medium">Feature</th>
                    <th scope="col" className="pb-1 font-medium">Provider</th>
                    <th scope="col" className="pb-1 text-right font-medium">Calls</th>
                    <th scope="col" className="pb-1 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.features.map((f) => (
                    <tr key={`${f.provider}:${f.feature}`} className="border-t">
                      <td className="py-1.5">{FEATURE_LABELS[f.feature] ?? f.feature}</td>
                      <td className="py-1.5 capitalize text-muted-foreground">{f.provider}</td>
                      <td className="py-1.5 text-right tabular-nums">{f.calls}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatUsd(f.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
