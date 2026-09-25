import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Bell, CalendarCheck, Heart, History } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { FavoritesView } from "@/components/FavoritesView";
import { PlanRow } from "@/components/account/PlanRow";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { useTabState } from "@/hooks/useTabState";
import { useMyPlans, PAST_PLAN_LIMIT, type PlanSourceState } from "@/hooks/useMyPlans";

const MY_EVENTS_TABS = ["upcoming", "saved", "reminders", "past"] as const;

interface ListStateProps {
  source: PlanSourceState;
  count: number;
  emptyTitle: string;
  emptyText: string;
  emptyLink: { to: string; label: string };
  children: ReactNode;
}

/**
 * Loading, then error, then empty, then the list - in that order, so a failed
 * read can never render as "you have nothing here" (WEB-QA-031).
 */
function ListState({ source, count, emptyTitle, emptyText, emptyLink, children }: ListStateProps) {
  if (source.isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-14 w-full bg-muted" />
        <Skeleton className="h-14 w-full bg-muted" />
        <Skeleton className="h-14 w-3/4 bg-muted" />
      </div>
    );
  }
  if (source.isError) {
    return <ErrorState compact error={source.error} onRetry={source.refetch} />;
  }
  if (count === 0) {
    return (
      <div className="py-8 text-center">
        <p className="font-medium">{emptyTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{emptyText}</p>
        <Button asChild variant="outline" className="mt-4 min-h-[44px]">
          <Link to={emptyLink.to}>{emptyLink.label}</Link>
        </Button>
      </div>
    );
  }
  return <ul className="-mx-3 divide-y">{children}</ul>;
}

function CountBadge({ source, count }: { source: PlanSourceState; count: number }) {
  if (source.isLoading || source.isError || count === 0) return null;
  return (
    <Badge variant="secondary" className="ml-1">
      {count}
    </Badge>
  );
}

/**
 * /my-events: the full lists behind the dashboard's week view (account plan
 * WP3 items 1 and 2). One hook, `useMyPlans`, replaces four queries that
 * filtered on a plain embed and returned `events: null` rows.
 */
function MyEventsContent() {
  const [activeTab, setActiveTab] = useTabState("upcoming", { validTabs: MY_EVENTS_TABS });
  const plans = useMyPlans({ includePast: true, includePlaces: true });
  const { sources } = plans;

  const placeCount = plans.savedPlaces.length;
  const savedSummaryReady =
    !sources.saved.isLoading && !sources.saved.isError && !sources.places.isLoading && !sources.places.isError;

  return (
    <>
      <SEOHead
        title="My Events - Des Moines Insider"
        description="Your RSVPs, saved events and places, and reminders."
        type="website"
        noindex
      />
      <div className="min-h-screen bg-background">
        <Header />

        <main className="container mx-auto max-w-3xl px-4 py-6 md:py-8">
          <Breadcrumbs
            className="mb-4"
            items={[
              { label: "Account", href: "/dashboard" },
              { label: "My Events" },
            ]}
          />
          <div className="mb-6">
            <h1 className="text-2xl font-bold md:text-3xl">My Events</h1>
            <p className="mt-1 text-muted-foreground">What you're going to, what you saved, and what you've been to.</p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <div className="-mx-4 overflow-x-auto px-4">
              <TabsList className="inline-flex w-max gap-1 p-1">
                <TabsTrigger value="upcoming" className="min-h-[44px] gap-2">
                  <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                  Upcoming
                  <CountBadge source={sources.upcoming} count={plans.upcoming.length} />
                </TabsTrigger>
                <TabsTrigger value="saved" className="min-h-[44px] gap-2">
                  <Heart className="h-4 w-4" aria-hidden="true" />
                  Saved
                </TabsTrigger>
                <TabsTrigger value="reminders" className="min-h-[44px] gap-2">
                  <Bell className="h-4 w-4" aria-hidden="true" />
                  Reminders
                  <CountBadge source={sources.reminders} count={plans.reminders.length} />
                </TabsTrigger>
                <TabsTrigger value="past" className="min-h-[44px] gap-2">
                  <History className="h-4 w-4" aria-hidden="true" />
                  Past
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="upcoming">
              <h2 className="sr-only">Upcoming</h2>
              <ListState
                source={sources.upcoming}
                count={plans.upcoming.length}
                emptyTitle="No upcoming events"
                emptyText="Mark an event as going or interested and it shows up here."
                emptyLink={{ to: "/events", label: "Browse events" }}
              >
                {plans.upcoming.map((plan) => (
                  <li key={plan.event.id}>
                    <PlanRow event={plan.event} reasons={[plan.status]} showDate />
                  </li>
                ))}
              </ListState>
            </TabsContent>

            <TabsContent value="saved" className="space-y-4">
              <h2 className="sr-only">Saved</h2>
              {savedSummaryReady && (plans.savedEvents.length > 0 || placeCount > 0) && (
                <p className="text-sm text-muted-foreground">
                  {plans.savedEvents.length} saved {plans.savedEvents.length === 1 ? "event" : "events"} coming up,{" "}
                  {placeCount} saved {placeCount === 1 ? "place" : "places"}.
                </p>
              )}
              <FavoritesView />
            </TabsContent>

            <TabsContent value="reminders">
              <h2 className="sr-only">Reminders</h2>
              <ListState
                source={sources.reminders}
                count={plans.reminders.length}
                emptyTitle="No reminders set"
                emptyText="Set a reminder on an event page and we'll email you before it starts."
                emptyLink={{ to: "/events", label: "Find an event" }}
              >
                {plans.reminders.map((plan) => (
                  <li key={plan.event.id}>
                    <PlanRow event={plan.event} reasons={["reminder"]} reminderTypes={plan.reminderTypes} showDate />
                  </li>
                ))}
              </ListState>
            </TabsContent>

            <TabsContent value="past">
              <h2 className="sr-only">Past</h2>
              <ListState
                source={sources.past}
                count={plans.past.length}
                emptyTitle="No past events"
                emptyText="Events you marked as going or interested move here once they're over."
                emptyLink={{ to: "/events", label: "Browse events" }}
              >
                {plans.past.map((plan) => (
                  <li key={plan.event.id}>
                    <PlanRow event={plan.event} reasons={[plan.status]} showDate />
                  </li>
                ))}
              </ListState>
              {plans.past.length === PAST_PLAN_LIMIT && (
                <p className="mt-3 text-sm text-muted-foreground">Showing your {PAST_PLAN_LIMIT} most recent.</p>
              )}
            </TabsContent>
          </Tabs>
        </main>

        <Footer />
      </div>
    </>
  );
}

/**
 * Signed out, ProtectedRoute sends the visitor to /auth?redirect=/my-events.
 * The hand-rolled branch this replaces sent them to /login, which App.tsx has
 * never routed.
 */
export default function ProfilePage() {
  return (
    <ProtectedRoute>
      <MyEventsContent />
    </ProtectedRoute>
  );
}
