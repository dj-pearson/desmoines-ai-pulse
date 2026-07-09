import { GitBranch, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLifecycleSummary, useLifecycleTransitions } from "@/hooks/useLifecycle";
import { cn } from "@/lib/utils";

const STAGE_TONE: Record<string, string> = {
  new: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  onboarding: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  active: "bg-green-500/15 text-green-700 dark:text-green-300",
  reactivated: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  at_risk: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  dormant: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  churned: "bg-red-500/15 text-red-700 dark:text-red-300",
  unclassified: "bg-muted text-muted-foreground",
};

export default function LifecyclePanel() {
  const { data: summary, isLoading, isError } = useLifecycleSummary();
  const { data: transitions, isLoading: tLoading } = useLifecycleTransitions(50);
  const total = (summary ?? []).reduce((s, r) => s + r.users, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" aria-hidden="true" /> User lifecycle stages
          </CardTitle>
          <CardDescription>Computed daily from activity signals. Segmentation input for nurture agents.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : isError ? (
            <p className="text-sm text-muted-foreground">Couldn't load lifecycle summary.</p>
          ) : !summary || summary.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users classified yet. The classifier runs daily.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {summary.map((s) => (
                <div key={s.stage} className={cn("rounded-lg border p-3", STAGE_TONE[s.stage] ?? "")}>
                  <p className="text-xs font-medium capitalize">{s.stage.replace("_", " ")}</p>
                  <p className="text-2xl font-semibold tabular-nums">{s.users.toLocaleString()}</p>
                  {total > 0 && <p className="text-xs opacity-70">{Math.round((s.users / total) * 100)}%</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitBranch className="h-4 w-4" aria-hidden="true" /> Recent transitions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : !transitions || transitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transitions recorded yet.</p>
          ) : (
            <div className="space-y-1">
              {transitions.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    {t.from_stage && <Badge variant="outline">{t.from_stage}</Badge>}
                    <span aria-hidden="true">→</span>
                    <Badge className={STAGE_TONE[t.to_stage] ?? ""}>{t.to_stage}</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
