import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

/** One run of restaurant-verification-health as automation_job_runs stores it. */
interface VerificationRun {
  status: string;
  started_at: string;
  error: string | null;
  metadata: {
    counts?: {
      total: number;
      verifiedWithin30Days: number;
      unverifiedOver45Days: number;
      neverChecked: number;
      openReviewsOver14Days: number;
    };
    maxUnverifiedShare?: number;
    alerts?: string[];
  } | null;
}

export async function fetchLatestVerificationRun(): Promise<VerificationRun | null> {
  const { data, error } = await supabase
    .from("automation_job_runs" as never)
    .select("status, started_at, error, metadata")
    .eq("job_name", "restaurant-verification-health")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as VerificationRun | null) ?? null;
}

const DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Chicago",
});

/**
 * WEB-AUTO-019. The nightly closure-detection numbers, with the time they were
 * computed. A failed read or a failed run says so; neither is shown as zeros.
 */
export function RestaurantVerificationHealthPanel() {
  const { data: run, isLoading, error } = useQuery({
    queryKey: ["restaurant-verification-health"],
    queryFn: fetchLatestVerificationRun,
    staleTime: 5 * 60 * 1000,
  });

  const counts = run?.metadata?.counts;
  const rows: Array<[string, number | undefined]> = [
    ["Restaurants (live listings)", counts?.total],
    ["Checked by Google in the last 30 days", counts?.verifiedWithin30Days],
    ["Last check over 45 days ago", counts?.unverifiedOver45Days],
    ["Never checked", counts?.neverChecked],
    ["Closure reviews open over 14 days", counts?.openReviewsOver14Days],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Listing verification</CardTitle>
        <CardDescription>
          {run ? `Computed ${DATE.format(new Date(run.started_at))} Central` : "Nightly counts from restaurant-verification-health"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className="h-28 w-full" />}
        {!isLoading && error && (
          <p role="alert" className="text-sm text-destructive">
            Could not read the latest run: {error instanceof Error ? error.message : String(error)}
          </p>
        )}
        {!isLoading && !error && !run && (
          <p className="text-sm text-muted-foreground">Unavailable: the nightly check has not run yet.</p>
        )}
        {!isLoading && !error && run && run.status !== "success" && (
          <p role="alert" className="text-sm text-destructive">
            The last run {run.status}: {run.error ?? "no error recorded"}. These numbers are unknown, not zero.
          </p>
        )}
        {!isLoading && !error && run?.status === "success" && counts && (
          <>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              {rows.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-semibold tabular-nums">{value ?? "Unavailable"}</dd>
                </div>
              ))}
            </dl>
            {(run.metadata?.alerts ?? []).length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-destructive">
                {(run.metadata?.alerts ?? []).map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
