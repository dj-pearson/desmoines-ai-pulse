import { lazy, Suspense, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, Megaphone, Plus, Settings, User, X } from "lucide-react";
import Header from "@/components/Header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/loading-skeleton";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { PremiumBadge } from "@/components/PremiumBadge";
import { RecentlyViewedList } from "@/components/RecentlyViewedList";
import SavedSearchesTab from "@/components/dashboard/SavedSearchesTab";
import { YourWeek } from "@/components/account/YourWeek";
import { SubmissionsTab } from "@/components/account/SubmissionsTab";
import { AdvertiseTab } from "@/components/account/AdvertiseTab";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useTabState } from "@/hooks/useTabState";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useUserSubmittedEvents } from "@/hooks/useUserSubmittedEvents";
import { useSubscription } from "@/hooks/useSubscription";
import { useSavedCount } from "@/hooks/useSavedCount";
import { useCampaignActionCount } from "@/hooks/useCampaigns";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/errorHandler";
import { storage } from "@/lib/safeStorage";
import { INTERESTS } from "@/lib/interests";
import { formatInCentralTime } from "@/lib/timezone";
import { cn } from "@/lib/utils";

// The form is only needed on the Submit tab; the overview is what most people
// open, and it should not pay for a form bundle it never shows.
const EventSubmissionForm = lazy(() => import("@/components/EventSubmissionForm"));

const DASHBOARD_TABS = [
  "overview",
  "submit-event",
  "events",
  "saved-searches",
  "advertise",
  "settings",
] as const;

const INTERESTS_PROMPT_DISMISSED_KEY = "dmi_interests_prompt_dismissed_v1";

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return formatInCentralTime(iso, "MMM d, yyyy");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Overview pieces
// ---------------------------------------------------------------------------

interface InterestsPromptProps {
  onDone: () => void;
}

/**
 * Sign-up no longer asks for interests (WP1 item 5); this asks once, on the
 * first overview visit with none saved (WP3 item 9).
 */
function InterestsPrompt({ onDone }: InterestsPromptProps) {
  const { updateProfile } = useProfile();
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const toggle = (id: string) =>
    setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  const dismiss = () => {
    storage.set(INTERESTS_PROMPT_DISMISSED_KEY, true);
    onDone();
  };

  const save = async () => {
    setSaving(true);
    setSaveFailed(false);
    try {
      await updateProfile({ interests: picked });
      storage.set(INTERESTS_PROMPT_DISMISSED_KEY, true);
      onDone();
    } catch (error) {
      handleError(error, { component: "UserDashboard", action: "saveInterests" });
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="interests-heading" className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="interests-heading" className="font-semibold">
            What are you into?
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Pick a few. We use them to choose events for your emails.</p>
        </div>
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={dismiss} aria-label="Not now">
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {INTERESTS.map((interest) => {
          const on = picked.includes(interest.id);
          return (
            <button
              key={interest.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(interest.id)}
              className={cn(
                "min-h-[44px] rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
              )}
            >
              {interest.label}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={picked.length === 0 || saving} className="min-h-[44px]">
          {saving ? "Saving..." : "Save"}
        </Button>
        {saveFailed && (
          <p role="alert" className="text-sm text-destructive">
            That didn't save. Try again.
          </p>
        )}
      </div>
    </section>
  );
}

interface ActionNeededProps {
  onOpenTab: (tab: (typeof DASHBOARD_TABS)[number]) => void;
}

/** Shown only when something is waiting on this person (WP3 item 3). */
function ActionNeeded({ onOpenTab }: ActionNeededProps) {
  const { data: submissions } = useUserSubmittedEvents();
  const campaigns = useCampaignActionCount();

  const revisions = (submissions ?? []).filter((s) => s.status === "needs_revision").length;
  const campaignCount = campaigns.isError ? 0 : campaigns.count;

  if (revisions === 0 && campaignCount === 0) return null;

  return (
    <section aria-labelledby="action-needed-heading" className="rounded-xl border bg-card p-4 sm:p-5">
      <h2 id="action-needed-heading" className="font-semibold">
        Action needed
      </h2>
      <ul className="mt-2 space-y-1">
        {revisions > 0 && (
          <li>
            <Button variant="link" className="h-auto min-h-[44px] px-0" onClick={() => onOpenTab("events")}>
              {revisions === 1 ? "1 submission needs changes" : `${revisions} submissions need changes`}
            </Button>
          </li>
        )}
        {campaignCount > 0 && (
          <li>
            <Button variant="link" className="h-auto min-h-[44px] px-0" onClick={() => onOpenTab("advertise")}>
              {campaignCount === 1
                ? "1 campaign is waiting on creative or payment"
                : `${campaignCount} campaigns are waiting on creative or payment`}
            </Button>
          </li>
        )}
      </ul>
    </section>
  );
}

/** "3 saved", counted the way the server caps it (WP3 item 5). */
function SavedCard() {
  const saved = useSavedCount();
  const { limits, isLoading: planLoading } = useSubscription();
  const limit = limits.favorites;

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">Saved</p>
      {saved.isLoading ? (
        <Skeleton className="mt-2 h-7 w-24 bg-muted" />
      ) : saved.isError || saved.count === null ? (
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xl font-semibold" aria-label="Saved count unavailable">
            -
          </span>
          <Button variant="link" size="sm" className="h-auto min-h-[44px] px-0" onClick={saved.refetch}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          <Link
            to="/my-events?tab=saved"
            className="mt-1 inline-flex min-h-[44px] items-center text-xl font-semibold hover:underline"
          >
            {saved.count} saved
          </Link>
          {!planLoading && (
            <p className="text-sm text-muted-foreground">
              {limit === -1 ? "No limit on your plan" : `Your plan holds ${limit}`}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Plan status without the "Free Plan" flash for paying members (WP3 item 4). */
function PlanCard() {
  const {
    isLoading,
    isPremium,
    tier,
    subscription,
    cancelAtPeriodEnd,
    isPastDue,
    gracePeriodEndsAt,
  } = useSubscription();

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-4" aria-busy="true">
        <Skeleton className="h-4 w-16 bg-muted" />
        <Skeleton className="mt-2 h-7 w-32 bg-muted" />
        <Skeleton className="mt-2 h-4 w-40 bg-muted" />
      </div>
    );
  }

  const periodEnd = formatDate(subscription?.current_period_end);
  const graceEnd = formatDate(gracePeriodEndsAt);
  const name = isPremium ? (tier === "vip" ? "VIP" : "Insider") : "Free";

  let sentence: ReactNode = null;
  if (isPastDue) {
    sentence = (
      <>
        Payment failed{graceEnd ? `, access until ${graceEnd}` : ""}.{" "}
        <Link to="/subscription" className="font-medium text-primary hover:underline">
          Update payment
        </Link>
      </>
    );
  } else if (isPremium && cancelAtPeriodEnd && periodEnd) {
    sentence = `Ends ${periodEnd}`;
  } else if (isPremium && periodEnd) {
    sentence = `Renews ${periodEnd}`;
  } else if (!isPremium) {
    sentence = (
      <Link to="/pricing" className="font-medium text-primary hover:underline">
        See Insider and VIP
      </Link>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">Plan</p>
      <p className="mt-1 text-xl font-semibold">{name}</p>
      {sentence && <p className="mt-1 text-sm text-muted-foreground">{sentence}</p>}
    </div>
  );
}

interface SubmissionsSummaryProps {
  onOpen: () => void;
}

/**
 * "Your submissions: N, M live" - only for people who have submitted. Live
 * means a published listing exists (`live_event_id`), not that a status column
 * says approved; pending includes submissions sent back for changes.
 */
function SubmissionsSummary({ onOpen }: SubmissionsSummaryProps) {
  const { data: submissions, isError } = useUserSubmittedEvents();
  if (isError || !submissions || submissions.length === 0) return null;

  const total = submissions.length;
  const live = submissions.filter((s) => !!s.live_event_id).length;
  const pending = submissions.filter((s) => s.status === "pending" || s.status === "needs_revision").length;

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">Your submissions</p>
      <Button variant="link" className="h-auto min-h-[44px] px-0 text-xl font-semibold" onClick={onOpen}>
        {total}, {live} live
      </Button>
      {pending > 0 && <p className="text-sm text-muted-foreground">{pending} pending</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings summary
// ---------------------------------------------------------------------------

/** Two lines and a link: the one settings page is /profile?tab=settings (WP3 item 8). */
function SettingsSummary() {
  const { user } = useAuth();
  const factors = useQuery({
    queryKey: ["mfa-factors", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      return (data?.totp ?? []).filter((factor) => factor.status === "verified").length;
    },
  });

  const emailLine = user?.email_confirmed_at
    ? `${user.email ?? "Your email"} is verified.`
    : `${user?.email ?? "Your email"} isn't verified yet.`;

  let twoStepLine: string;
  if (factors.isLoading) twoStepLine = "Checking two-step sign-in...";
  else if (factors.isError) twoStepLine = "We couldn't check two-step sign-in.";
  else twoStepLine = (factors.data ?? 0) > 0 ? "Two-step sign-in is on." : "Two-step sign-in is off.";

  return (
    <section aria-labelledby="settings-summary-heading" className="max-w-xl rounded-xl border bg-card p-4 sm:p-5">
      <h2 id="settings-summary-heading" className="font-semibold">
        Settings
      </h2>
      <p className="mt-2 text-sm">{emailLine}</p>
      <p className="mt-1 text-sm">{twoStepLine}</p>
      <Button asChild className="mt-4 min-h-[44px]">
        <Link to="/profile?tab=settings">
          <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
          Open settings
        </Link>
      </Button>
      <p className="mt-2 text-sm text-muted-foreground">Password, two-step sign-in, emails and privacy all live there.</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function UserDashboard() {
  // Tab lives in the URL so it survives a reload, a back-navigation, or any
  // remount.
  const [activeTab, setActiveTab] = useTabState("overview", {
    validTabs: DASHBOARD_TABS,
  });
  useDocumentTitle("My Dashboard");
  const { profile, isLoading: profileLoading, error: profileError } = useProfile();
  const { refetch: refetchSubmissions } = useUserSubmittedEvents();

  const [interestsDismissed, setInterestsDismissed] = useState<boolean>(
    () => storage.get<boolean>(INTERESTS_PROMPT_DISMISSED_KEY, false) === true,
  );
  const showInterestsPrompt =
    !interestsDismissed &&
    !profileLoading &&
    !profileError &&
    !!profile &&
    (!profile.interests || profile.interests.length === 0);

  const handleEventSubmitted = () => {
    // EventSubmissionForm toasts on its own; a second toast here said the same
    // thing and promised a review time nobody measures.
    void refetchSubmissions();
    setActiveTab("events");
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto mobile-padding py-4 md:py-6">
        <div className="mb-3 flex items-center gap-2">
          <User className="h-5 w-5 text-primary" aria-hidden="true" />
          <h1 className="text-xl font-bold">Your account</h1>
          <PremiumBadge showTier={true} size="sm" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="-mx-4 mb-4 overflow-x-auto px-4 md:mx-0 md:px-0">
            <TabsList className="inline-flex w-max gap-1 p-1">
              <TabsTrigger value="overview" className="min-h-[44px] gap-2">
                <User className="h-4 w-4" aria-hidden="true" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="submit-event" className="min-h-[44px] gap-2">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Submit event
              </TabsTrigger>
              <TabsTrigger value="events" className="min-h-[44px] gap-2">
                <SpriteIcon name="calendar" className="h-4 w-4" aria-hidden="true" />
                Submissions
              </TabsTrigger>
              <TabsTrigger value="saved-searches" className="min-h-[44px] gap-2">
                <Bell className="h-4 w-4" aria-hidden="true" />
                Saved searches
              </TabsTrigger>
              <TabsTrigger value="advertise" className="min-h-[44px] gap-2">
                <Megaphone className="h-4 w-4" aria-hidden="true" />
                Advertise
              </TabsTrigger>
              <TabsTrigger value="settings" className="min-h-[44px] gap-2">
                <Settings className="h-4 w-4" aria-hidden="true" />
                Settings
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-4">
            <YourWeek />
            {showInterestsPrompt && <InterestsPrompt onDone={() => setInterestsDismissed(true)} />}
            <ActionNeeded onOpenTab={setActiveTab} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <SavedCard />
              <PlanCard />
              <SubmissionsSummary onOpen={() => setActiveTab("events")} />
            </div>
            <RecentlyViewedList />
          </TabsContent>

          <TabsContent value="submit-event">
            <section aria-labelledby="submit-heading" className="rounded-xl border bg-card p-4 sm:p-6">
              <h2 id="submit-heading" className="text-lg font-semibold">
                Submit an event
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                An automatic check runs as soon as you send it; some submissions also go to a person.
              </p>
              <div className="mt-4">
                <Suspense
                  fallback={
                    <div className="py-8 text-center">
                      <Spinner size="lg" className="mx-auto" />
                    </div>
                  }
                >
                  <EventSubmissionForm onSuccess={handleEventSubmitted} />
                </Suspense>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="events">
            <SubmissionsTab />
          </TabsContent>

          <TabsContent value="saved-searches">
            <SavedSearchesTab />
          </TabsContent>

          <TabsContent value="advertise">
            <AdvertiseTab />
          </TabsContent>

          <TabsContent value="settings">
            <SettingsSummary />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
