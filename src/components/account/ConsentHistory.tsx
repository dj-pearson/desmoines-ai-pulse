import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { formatInCentralTime } from "@/lib/timezone";

interface ConsentRow {
  id: number | string;
  consent_type: string;
  granted: boolean;
  policy_version: string | null;
  recorded_at: string;
  source: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  terms: "Terms of service",
  marketing_email: "Account and activity emails",
  marketing_sms: "Text messages",
  personalization_ai: "Personalized suggestions",
  cookies_analytics: "Analytics cookies",
  cookies_advertising: "Advertising cookies",
  newsletter: "Newsletter",
  data_sale_opt_out: "Do not sell or share",
};

const SOURCE_LABELS: Record<string, string> = {
  signup: "at sign-up",
  profile_settings: "in settings",
  cookie_banner: "from the cookie banner",
  newsletter_form: "from the newsletter form",
  unsubscribe_page: "from an unsubscribe link",
  event_promotion_planner: "in the event promotion planner",
};

const HISTORY_LIMIT = 50;

/**
 * What you agreed to, and when (account plan bet 5, WP5 item 6).
 *
 * consent_records is append-only and has an own-row SELECT policy ("Users read
 * their own consent records", docs/RLS_AUDIT.md:228), so the page can show the
 * record we would show a regulator. Newest first.
 */
export function ConsentHistory() {
  const { user } = useAuth();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["consent-history", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<ConsentRow[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("consent_records")
        .select("id, consent_type, granted, policy_version, recorded_at, source")
        .eq("user_id", user.id)
        .order("recorded_at", { ascending: false })
        .limit(HISTORY_LIMIT);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <section aria-labelledby="consent-history-heading" className="space-y-3">
      <div className="space-y-1">
        <h3 id="consent-history-heading" className="text-base font-medium">
          Your consent history
        </h3>
        <p className="text-sm text-muted-foreground">
          Every time you said yes or no to something, with the date and the policy version.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : isError ? (
        <ErrorState
          compact
          error={error}
          title="Couldn't load your consent history"
          onRetry={() => void refetch()}
        />
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No choices recorded for this account yet.</p>
      ) : (
        <ol className="divide-y rounded-lg border">
          {data.map((row) => (
            <li key={row.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between">
              <p className="text-sm">
                <span className="font-medium">{TYPE_LABELS[row.consent_type] ?? row.consent_type}</span>
                {": "}
                {row.granted ? "yes" : "no"}
                {row.source && SOURCE_LABELS[row.source] ? ` ${SOURCE_LABELS[row.source]}` : ""}
                {row.policy_version ? (
                  <span className="text-muted-foreground"> (policy {row.policy_version})</span>
                ) : null}
              </p>
              <time dateTime={row.recorded_at} className="text-sm text-muted-foreground sm:shrink-0">
                {formatInCentralTime(row.recorded_at, "MMM d, yyyy, h:mm a")}
              </time>
            </li>
          ))}
        </ol>
      )}
      {data && data.length === HISTORY_LIMIT && (
        <p className="text-sm text-muted-foreground">
          Showing your latest {HISTORY_LIMIT}. Download your data below for the full record.
        </p>
      )}
    </section>
  );
}
