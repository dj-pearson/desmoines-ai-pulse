import { DollarSign, PauseCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useProviderCosts, type ProviderCost } from "@/hooks/useProviderCosts";
import { cn } from "@/lib/utils";

function ProviderRow({ p }: { p: ProviderCost }) {
  const pct = p.ratio != null ? Math.round(p.ratio * 100) : null;
  const over = p.ratio != null && p.ratio >= p.hardPct;
  const near = p.ratio != null && p.ratio >= p.softPct;
  const barPct = p.ratio != null ? Math.min(100, Math.round(p.ratio * 100)) : 0;
  return (
    <div className="rounded-md border p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium capitalize">{p.provider}</span>
          {p.paused && (
            <Badge variant="destructive" className="gap-1">
              <PauseCircle className="h-3 w-3" aria-hidden="true" /> paused
            </Badge>
          )}
          {!p.paused && p.throttled && <Badge variant="outline">throttled</Badge>}
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {p.monthlyBudgetUsd > 0
            ? `$${p.spendMtd.toFixed(2)} / $${p.monthlyBudgetUsd.toFixed(0)}${pct != null ? ` (${pct}%)` : ""}`
            : `$${p.spendMtd.toFixed(2)} · unmonitored`}
        </span>
      </div>
      {p.monthlyBudgetUsd > 0 && (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div
            className={cn("h-full rounded-full", over ? "bg-destructive" : near ? "bg-amber-500" : "bg-primary")}
            style={{ width: `${barPct}%` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Per-provider external-API spend vs budget month-to-date (AOS-MAINT-006).
 */
export default function ProviderCostTile() {
  const { data, isLoading, isError } = useProviderCosts();
  const overCount = (data ?? []).filter((p) => p.ratio != null && p.ratio >= p.hardPct).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-4 w-4" aria-hidden="true" /> External API cost
            </CardTitle>
            <CardDescription>Per-provider spend vs budget, month-to-date.</CardDescription>
          </div>
          {data && (
            <p className={cn("text-sm font-semibold", overCount > 0 ? "text-destructive" : "text-muted-foreground")}>
              {overCount > 0 ? `${overCount} over budget` : "within budget"}
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground">Unable to load provider costs.</p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No provider budgets configured.</p>
        ) : (
          <div className="space-y-2">
            {data.map((p) => (
              <ProviderRow key={p.provider} p={p} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
