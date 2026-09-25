import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense, type ReactNode, type RefObject } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { Baby, Check, DollarSign, Download, Lightbulb, Loader2, Music, Palette, Trash2, TreePine, Utensils, CalendarPlus } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { FAQSection, type FAQItem } from "@/components/FAQSection";
import { UpgradeModal } from "@/components/UpgradeModal";
import { AIDisclosureNotice } from "@/components/AIDisclosureBadge";
import { DateWindowPlanner } from "@/components/trip/DateWindowPlanner";
import { TripItineraryDays } from "@/components/trip/TripItineraryDays";
import type { MapEntity } from "@/components/map/DiscoverMapCanvas";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { ErrorState } from "@/components/ui/error-state";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useTripPlanner, type TripPlan, type TripPlanItem, type TripPreferences } from "@/hooks/useTripPlanner";
import { supabase } from "@/integrations/supabase/client";
import { getCanonicalUrl } from "@/lib/brandConfig";
import { dateOnlySpanDays, isDateOnly, parseDateOnly, tripWindowProblem } from "@/lib/dateOnly";
import { handleError } from "@/lib/errorHandler";
import { STALE_TIME } from "@/lib/queryConfig";
import { addCentralDays, centralDateOf, centralWindow } from "@/lib/timezone";
import { buildTripICS, downloadICS } from "@/lib/tripCalendar";
import {
  parseShortlistParam,
  readStoredShortlist,
  serializeShortlist,
  SHORTLIST_PARAM,
  toggleShortlist,
  writeStoredShortlist,
} from "@/lib/tripShortlist";
import { AI_PLANNER_AVAILABLE, AI_PLANNER_PAUSED_MESSAGE } from "@/lib/tripPlannerStatus";
import { TRIP_PLANNER_MONTHLY_QUOTA } from "@/lib/planBenefits";

const DiscoverMapCanvas = lazy(() => import("@/components/map/DiscoverMapCanvas"));

type Budget = NonNullable<TripPreferences["budget"]>;
type Pace = NonNullable<TripPreferences["pace"]>;
type PlannerTab = "plan" | "itinerary" | "my-trips";

const BUDGETS: readonly Budget[] = ["budget", "moderate", "splurge", "any"];
const PACES: readonly Pace[] = ["relaxed", "moderate", "packed"];

function isBudget(v: string): v is Budget {
  return (BUDGETS as readonly string[]).includes(v);
}
function isPace(v: string): v is Pace {
  return (PACES as readonly string[]).includes(v);
}

/**
 * The window shown before anyone picks dates: this weekend, Friday to Sunday
 * Central, starting no earlier than today.
 */
function defaultWindow(): { from: string; to: string } {
  const today = centralDateOf();
  const weekend = centralWindow("this-weekend");
  const from = weekend.startDay < today ? today : weekend.startDay;
  return { from, to: weekend.endDay < from ? addCentralDays(from, 2) : weekend.endDay };
}

/** "Oct 2 - Oct 4, 2026", read as calendar days (plan-stay WP1 item 1). */
function tripRangeLabel(trip: TripPlan, withYear: boolean): string {
  const a = format(parseDateOnly(trip.start_date), "MMM d");
  const b = format(parseDateOnly(trip.end_date), withYear ? "MMM d, yyyy" : "MMM d");
  return `${a} - ${b}`;
}

const PAGE_PATH = "/trip-planner";

function faqItems(): FAQItem[] {
  return [
    {
      question: "How does the trip planner work?",
      answer:
        "Pick the dates you're in Des Moines. The planner lists the events we have on each of those days, the hotels closest to where those events are, and how to get around. It's free and you don't need an account." +
        (AI_PLANNER_AVAILABLE
          ? " Insider and VIP members can also turn those dates into an AI-written day-by-day itinerary."
          : " AI-written itineraries are paused while we fix saving them."),
      links: [{ label: "Getting around Des Moines", to: "/getting-around" }],
    },
    {
      question: "Is the trip planner free?",
      answer:
        "The date planner is free for everyone. AI itineraries are part of the Insider and VIP plans; current prices and limits are on the pricing page, and new subscribers may be eligible for a free trial.",
      links: [{ label: "See pricing", to: "/pricing" }],
    },
    {
      question: "What is the best time to visit Des Moines?",
      answer:
        "Des Moines is good year-round. Summer brings the Iowa State Fair in August, outdoor festivals and the Downtown Farmers' Market. Fall has harvest festivals and foliage. Spring has the Drake Relays in April. Winter has holiday markets, indoor attractions and a long list of restaurants.",
    },
    {
      question: "How many days should I plan for a Des Moines trip?",
      answer:
        "Two or three days cover downtown dining, the Pappajohn Sculpture Park, the Science Center of Iowa and the East Village. Plan four or five if you want day trips such as Adventureland or the Bridges of Madison County.",
    },
    // Emitted as FAQPage schema, so it only describes the AI itinerary while
    // a visitor can actually make one (AI_PLANNER_AVAILABLE).
    ...(AI_PLANNER_AVAILABLE
      ? [
          {
            question: "Can I change an AI itinerary after it's made?",
            answer:
              "You can reorder the stops within a day, download the whole trip or a single day as a calendar file (.ics), add a stop to Google Calendar, and delete the trip. Swapping in new stops or adding your own isn't available yet.",
          },
        ]
      : []),
  ];
}

export default function TripPlanner() {
  const [searchParams, setSearchParams] = useSearchParams();
  const fallback = useMemo(defaultWindow, []);
  const today = centralDateOf();
  const urlFrom = searchParams.get("from") ?? "";
  const urlTo = searchParams.get("to") ?? "";
  const urlValid = tripWindowProblem(urlFrom, urlTo, today) === null;
  const from = urlValid ? urlFrom : fallback.from;
  const to = urlValid ? urlTo : fallback.to;
  // A stale or mangled shared link falls back to this weekend, and says so.
  const notice =
    !urlValid && (urlFrom || urlTo)
      ? isDateOnly(urlTo) && urlTo < today
        ? "Those dates have passed, so this shows this weekend instead."
        : "Those dates didn't work as a trip, so this shows this weekend instead."
      : null;

  // The free trip calendar: picks live in ?e= (shareable) and are mirrored to
  // storage so a visitor coming back without the link gets them back.
  const shortlistParam = searchParams.get(SHORTLIST_PARAM);
  const picks = useMemo(() => parseShortlistParam(shortlistParam), [shortlistParam]);
  const setPicks = useCallback(
    (ids: readonly string[]) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const value = serializeShortlist(ids);
          if (value) next.set(SHORTLIST_PARAM, value);
          else next.delete(SHORTLIST_PARAM);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const restoredPicks = useRef(false);
  useEffect(() => {
    if (!restoredPicks.current) {
      restoredPicks.current = true;
      if (picks.length === 0) {
        const stored = readStoredShortlist();
        if (stored.length > 0) {
          setPicks(stored);
          return;
        }
      }
    }
    writeStoredShortlist(picks);
  }, [picks, setPicks]);

  const applyWindow = (nextFrom: string, nextTo: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("from", nextFrom);
      next.set("to", nextTo);
      return next;
    });
  };

  const canonical = getCanonicalUrl(PAGE_PATH);

  return (
    <>
      <SEOHead
        title="Des Moines Trip Planner"
        description="Pick your dates and see what's on in Des Moines each day, the hotels closest to those events, and how to get around. Free, no account needed."
        url={canonical}
        canonicalUrl={canonical}
        keywords={["Des Moines trip planner", "Des Moines events by date", "hotels near Des Moines events", "Iowa trip planning"]}
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Trip Planner", url: PAGE_PATH },
        ]}
      />

      <div className="min-h-screen bg-background">
        <Header />

        <div className="container mx-auto max-w-4xl px-4 py-6 sm:py-8" data-page-body="trip-planner">
          <Breadcrumbs
            className="mb-3"
            items={[
              { label: "Home", href: "/" },
              { label: "Trip Planner" },
            ]}
          />

          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Plan your Des Moines trip</h1>
          <p className="mt-2 max-w-prose text-muted-foreground">
            Tell us when you're here. We'll show what's on each day and where to stay near it.
          </p>
          {!AI_PLANNER_AVAILABLE && (
            <p className="mt-2 text-sm text-muted-foreground" data-ai-planner="paused">
              {AI_PLANNER_PAUSED_MESSAGE}
            </p>
          )}

          <div className="mt-6">
            <DateWindowPlanner
              from={from}
              to={to}
              onApply={applyWindow}
              notice={notice}
              picks={picks}
              onTogglePick={(id) => setPicks(toggleShortlist(picks, id))}
              onClearPicks={() => setPicks([])}
            >
              {AI_PLANNER_AVAILABLE && <AiTripPlanner startDate={from} endDate={to} />}
            </DateWindowPlanner>
          </div>
        </div>

        <section className="bg-muted/30 py-12" aria-label="Trip planner questions">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <FAQSection
              title="Trip Planner - Frequently Asked Questions"
              description="What the planner does today, and what it doesn't."
              faqs={faqItems()}
              showSchema={true}
            />
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// AI itinerary: the upgrade on top of the date planner. Mounted only while
// AI_PLANNER_AVAILABLE, so a paused planner makes no subscription or trip
// requests at all.
// ---------------------------------------------------------------------------

interface AiTripPlannerProps {
  startDate: string;
  endDate: string;
}

function AiTripPlanner({ startDate, endDate }: AiTripPlannerProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const planner = useTripPlanner();
  const { selectedTrip, setSelectedTrip, fetchTripDetails, generateItinerary, isGenerating } = planner;
  const { tier, hasFeature, isLoading: subscriptionLoading } = useSubscription();
  const canUseTripPlanner = hasFeature("trip_planner");
  const [showPaywall, setShowPaywall] = useState(false);
  const [tab, setTab] = useState<PlannerTab>("plan");
  const [focusItinerary, setFocusItinerary] = useState(false);
  const itineraryHeadingRef = useRef<HTMLHeadingElement>(null);

  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [budget, setBudget] = useState<Budget>("moderate");
  const [pace, setPace] = useState<Pace>("moderate");
  const [groupSize, setGroupSize] = useState(2);
  const [hasChildren, setHasChildren] = useState(false);
  const [childAges, setChildAges] = useState("");

  const numDays = dateOnlySpanDays(startDate, endDate);

  // Move focus to the itinerary heading once its tab has rendered.
  useEffect(() => {
    if (focusItinerary && tab === "itinerary") {
      itineraryHeadingRef.current?.focus();
      setFocusItinerary(false);
    }
  }, [focusItinerary, tab, selectedTrip]);

  const showItinerary = () => {
    setTab("itinerary");
    setFocusItinerary(true);
  };

  const handleGenerate = async () => {
    // Until the subscription settles, hasFeature reads as free and a paying
    // member would see the paywall. The button is disabled meanwhile too.
    if (subscriptionLoading) return;
    if (!user) {
      navigate(`/auth?redirect=${encodeURIComponent(`${PAGE_PATH}?from=${startDate}&to=${endDate}`)}`);
      return;
    }
    // Free users get the contextual paywall instead of a failed request
    // (WEB-FEAT-011 / WEB-FEAT-001). The server enforces the tier regardless.
    if (!canUseTripPlanner) {
      setShowPaywall(true);
      return;
    }
    const preferences: TripPreferences = {
      interests: selectedInterests,
      budget,
      pace,
      groupSize,
      hasChildren,
      childAges: hasChildren && childAges
        ? childAges.split(",").map((a) => parseInt(a.trim(), 10)).filter((a) => !Number.isNaN(a))
        : [],
    };
    try {
      await generateItinerary({ startDate, endDate, preferences });
      showItinerary();
    } catch (error) {
      handleError(error, { component: "TripPlanner", action: "generateItinerary" });
      const code = (error as { code?: string })?.code;
      // The mutation no longer toasts, so this is the one report of a failure.
      if (code === "quota_exceeded" || code === "upgrade_required") setShowPaywall(true);
      else toast.error("We couldn't generate that itinerary. Please try again.");
    }
  };

  const handleViewTrip = async (trip: TripPlan) => {
    try {
      const fullTrip = await fetchTripDetails(trip.id);
      if (fullTrip) {
        setSelectedTrip(fullTrip);
        showItinerary();
      } else {
        toast.error("Couldn't open that trip. Please try again.");
      }
    } catch (error) {
      handleError(error, { component: "TripPlanner", action: "viewTrip" });
      toast.error("Couldn't load that trip's stops. Please try again.");
    }
  };

  const toggleInterest = (value: string) =>
    setSelectedInterests((prev) => (prev.includes(value) ? prev.filter((i) => i !== value) : [...prev, value]));

  return (
    <section aria-labelledby="ai-trip-heading" className="space-y-4 border-t pt-8">
      <div>
        <h2 id="ai-trip-heading" className="text-xl font-semibold">
          Turn this into an itinerary
        </h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          An AI-written plan for these {numDays} day{numDays === 1 ? "" : "s"}, built from the same listings. Part of the Insider and VIP plans.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as PlannerTab)} className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="plan">Preferences</TabsTrigger>
          <TabsTrigger value="itinerary" disabled={!selectedTrip}>
            Itinerary
          </TabsTrigger>
          <TabsTrigger value="my-trips">My Trips</TabsTrigger>
        </TabsList>

        <TabsContent value="plan" className="space-y-6">
          <PreferencesForm
            groupSize={groupSize}
            setGroupSize={setGroupSize}
            hasChildren={hasChildren}
            setHasChildren={setHasChildren}
            childAges={childAges}
            setChildAges={setChildAges}
            selectedInterests={selectedInterests}
            toggleInterest={toggleInterest}
            budget={budget}
            setBudget={setBudget}
            pace={pace}
            setPace={setPace}
            interests={planner.interests}
            budgetOptions={planner.budgetOptions}
            paceOptions={planner.paceOptions}
          />

          <div className="space-y-4 rounded-xl border p-4 sm:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold">Ready for the itinerary?</p>
                <p className="text-sm text-muted-foreground">
                  {subscriptionLoading
                    ? "Checking your plan..."
                    : tier === "vip"
                      ? quotaSentence("VIP", TRIP_PLANNER_MONTHLY_QUOTA.vip)
                      : tier === "insider"
                        ? quotaSentence("Insider", TRIP_PLANNER_MONTHLY_QUOTA.insider)
                        : "AI itineraries are an Insider feature."}
                </p>
              </div>
              <Button size="lg" onClick={handleGenerate} disabled={isGenerating || subscriptionLoading || numDays < 1} className="min-h-11 gap-2">
                {isGenerating ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                    Generating...
                  </>
                ) : (
                  "Generate itinerary"
                )}
              </Button>
            </div>
            {/* AI transparency notice (EU AI Act Art. 50, Colorado AI Act, CA AB 2013) */}
            <AIDisclosureNotice title="How your itinerary is generated">
              <p className="leading-snug text-muted-foreground">
                Your itinerary is generated by an AI model using public information about Des Moines events,
                restaurants and attractions plus the preferences you share above. AI output may be inaccurate or
                incomplete, so confirm hours, prices and reservations with each venue before you go. Nothing here
                is a paid endorsement unless clearly labeled as such.
              </p>
            </AIDisclosureNotice>
          </div>
        </TabsContent>

        <TabsContent value="itinerary">
          {selectedTrip ? (
            <ItineraryView trip={selectedTrip} headingRef={itineraryHeadingRef} planner={planner} />
          ) : (
            <EmptyPanel
              title="No itinerary selected"
              body="Generate a new itinerary or open one from My Trips."
              action={<Button onClick={() => setTab("plan")}>Plan a trip</Button>}
            />
          )}
        </TabsContent>

        <TabsContent value="my-trips">
          {!user ? (
            <EmptyPanel
              title="Sign in to see your trips"
              body="Your saved itineraries live with your account."
              action={
                <Button asChild>
                  <Link to={`/auth?redirect=${encodeURIComponent(PAGE_PATH)}`}>Sign in</Link>
                </Button>
              }
            />
          ) : (
            <MyTrips planner={planner} onPlan={() => setTab("plan")} onOpen={handleViewTrip} />
          )}
        </TabsContent>
      </Tabs>

      <UpgradeModal open={showPaywall} onOpenChange={setShowPaywall} feature="trip_planner" />
    </section>
  );
}

/** "Insider: 5 AI trips a month." from the quota the edge function enforces. */
function quotaSentence(plan: string, quota: number): string {
  return quota === -1 ? `${plan}: unlimited AI trips.` : `${plan}: ${quota} AI trips a month.`;
}

function EmptyPanel({ title, body, action }: { title: string; body: string; action: ReactNode }) {
  return (
    <div className="rounded-xl border px-4 py-10 text-center">
      <h3 className="mb-2 text-lg font-medium">{title}</h3>
      <p className="mb-4 text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------

const INTEREST_ICONS: Record<string, ReactNode> = {
  music: <Music className="h-4 w-4" aria-hidden="true" />,
  food: <Utensils className="h-4 w-4" aria-hidden="true" />,
  outdoors: <TreePine className="h-4 w-4" aria-hidden="true" />,
  arts: <Palette className="h-4 w-4" aria-hidden="true" />,
  family: <Baby className="h-4 w-4" aria-hidden="true" />,
};

interface OptionRow {
  value: string;
  label: string;
  description?: string;
}

interface PreferencesFormProps {
  groupSize: number;
  setGroupSize: (n: number) => void;
  hasChildren: boolean;
  setHasChildren: (b: boolean) => void;
  childAges: string;
  setChildAges: (s: string) => void;
  selectedInterests: string[];
  toggleInterest: (v: string) => void;
  budget: Budget;
  setBudget: (b: Budget) => void;
  pace: Pace;
  setPace: (p: Pace) => void;
  interests: OptionRow[];
  budgetOptions: OptionRow[];
  paceOptions: OptionRow[];
}

function OptionRadios({
  name,
  legend,
  value,
  options,
  onChange,
}: {
  name: string;
  legend: string;
  value: string;
  options: OptionRow[];
  onChange: (v: string) => void;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-3 font-semibold">{legend}</legend>
      <RadioGroup value={value} onValueChange={onChange} className="gap-2">
        {options.map((option) => {
          const id = `${name}-${option.value}`;
          return (
            <Label
              key={option.value}
              htmlFor={id}
              className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal ${
                value === option.value ? "border-primary bg-primary/5" : "hover:border-primary/50"
              }`}
            >
              <RadioGroupItem id={id} value={option.value} className="mt-0.5" />
              <span>
                <span className="block font-medium">{option.label}</span>
                {option.description && <span className="block text-sm text-muted-foreground">{option.description}</span>}
              </span>
            </Label>
          );
        })}
      </RadioGroup>
    </fieldset>
  );
}

function PreferencesForm(props: PreferencesFormProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <fieldset className="space-y-4 rounded-xl border p-4">
        <legend className="px-1 font-semibold">Who's going?</legend>
        <div className="space-y-2">
          <Label htmlFor="group-size">Group size</Label>
          <Select value={props.groupSize.toString()} onValueChange={(v) => props.setGroupSize(parseInt(v, 10))}>
            <SelectTrigger id="group-size" className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5, 6, 7, 8, 10, 15, 20].map((n) => (
                <SelectItem key={n} value={n.toString()}>
                  {n} {n === 1 ? "person" : "people"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-h-11 items-center space-x-2">
          <Checkbox
            id="has-children"
            checked={props.hasChildren}
            onCheckedChange={(checked) => props.setHasChildren(checked === true)}
          />
          <Label htmlFor="has-children">Traveling with children</Label>
        </div>
        {props.hasChildren && (
          <div className="space-y-2">
            <Label htmlFor="child-ages">Children's ages (comma-separated)</Label>
            <Input
              id="child-ages"
              placeholder="e.g., 5, 8, 12"
              value={props.childAges}
              onChange={(e) => props.setChildAges(e.target.value)}
            />
          </div>
        )}
      </fieldset>

      <fieldset className="rounded-xl border p-4">
        <legend className="px-1 font-semibold">Your interests</legend>
        <div className="flex flex-wrap gap-2">
          {props.interests.map((interest) => {
            const on = props.selectedInterests.includes(interest.value);
            return (
              <Button
                key={interest.value}
                type="button"
                variant={on ? "default" : "outline"}
                size="sm"
                aria-pressed={on}
                onClick={() => props.toggleInterest(interest.value)}
                className="min-h-11 gap-2"
              >
                {INTEREST_ICONS[interest.value] ?? null}
                {interest.label}
              </Button>
            );
          })}
        </div>
      </fieldset>

      <div className="rounded-xl border p-4">
        <OptionRadios
          name="budget"
          legend="Budget"
          value={props.budget}
          options={props.budgetOptions}
          onChange={(v) => {
            if (isBudget(v)) props.setBudget(v);
          }}
        />
      </div>
      <div className="rounded-xl border p-4">
        <OptionRadios
          name="pace"
          legend="Trip pace"
          value={props.pace}
          options={props.paceOptions}
          onChange={(v) => {
            if (isPace(v)) props.setPace(v);
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type Planner = ReturnType<typeof useTripPlanner>;

/**
 * Batch-fetch lat/lng for content-linked stops (WEB-FEAT-011): trip items
 * don't carry coordinates.
 */
function useTripStops(trip: TripPlan) {
  return useQuery({
    queryKey: ["trip-stops", trip.id],
    enabled: !!trip.items?.length,
    staleTime: STALE_TIME.CONTENT_DETAIL,
    queryFn: async (): Promise<MapEntity[]> => {
      const items = (trip.items || []).filter((i) => i.content_details);
      const titleById = new Map<string, string>();
      const idsByType: Record<string, string[]> = {};
      for (const i of items) {
        const cd = i.content_details!;
        (idsByType[cd.type] ||= []).push(cd.id);
        titleById.set(cd.id, i.title);
      }
      const tables: Record<string, string> = { event: "events", restaurant: "restaurants", attraction: "attractions" };
      const out: MapEntity[] = [];
      await Promise.all(
        Object.entries(idsByType).map(async ([type, ids]) => {
          const { data } = await supabase
            .from(tables[type] as never)
            .select("id, latitude, longitude")
            .in("id", ids);
          (data as Array<{ id: string; latitude: number | null; longitude: number | null }> | null)?.forEach((r) => {
            if (r.latitude != null && r.longitude != null) {
              out.push({
                id: r.id,
                name: titleById.get(r.id) || "Stop",
                type: type as MapEntity["type"],
                latitude: Number(r.latitude),
                longitude: Number(r.longitude),
              });
            }
          });
        }),
      );
      return out;
    },
  });
}

function ItineraryView({
  trip,
  headingRef,
  planner,
}: {
  trip: TripPlan;
  headingRef: RefObject<HTMLHeadingElement>;
  planner: Planner;
}) {
  const { deleteTrip, setSelectedTrip, shareTrip, reorderItems } = planner;
  const { data: tripStops = [] } = useTripStops(trip);
  const items = trip.items ?? [];

  const handleMoveItem = (dayItems: TripPlanItem[], idx: number, dir: -1 | 1) => {
    const a = dayItems[idx];
    const b = dayItems[idx + dir];
    if (!a || !b) return;
    void reorderItems([
      { id: a.item_id, order_index: b.order_index },
      { id: b.item_id, order_index: a.order_index },
    ]);
  };

  const handleAddToCalendar = () => {
    if (items.length === 0) return;
    downloadICS(`${trip.title || "des-moines-trip"}.ics`, buildTripICS(trip, items));
    toast.success("Calendar file (.ics) downloaded");
  };

  const handleAddDayToCalendar = (dayItems: TripPlanItem[], dayNum: number) => {
    if (dayItems.length === 0) return;
    downloadICS(`${trip.title || "trip"}-day-${dayNum}.ics`, buildTripICS(trip, dayItems));
    toast.success(`Day ${dayNum} downloaded (.ics)`);
  };

  const handleShare = async () => {
    try {
      const code = await shareTrip(trip.id);
      if (code && typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({
            title: trip.title || "My Des Moines trip",
            url: `${window.location.origin}/trips/shared/${code}`,
          });
        } catch {
          // Dismissed share sheet: the link is already copied or shown.
        }
      }
    } catch (error) {
      handleError(error, { component: "TripPlanner", action: "shareTrip" });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteTrip(trip.id);
      setSelectedTrip(null);
    } catch (error) {
      handleError(error, { component: "TripPlanner", action: "deleteTrip" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border p-4 sm:p-6 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold outline-none">
            {trip.title}
          </h3>
          {trip.description && <p className="mt-2 text-muted-foreground">{trip.description}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="outline">{tripRangeLabel(trip, true)}</Badge>
            {trip.total_estimated_cost && (
              <Badge variant="outline">
                <DollarSign className="mr-1 h-3 w-3" aria-hidden="true" />
                AI estimate: {trip.total_estimated_cost}
              </Badge>
            )}
            {trip.ai_generated && <Badge>AI generated</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Share publishes to /trips/shared/:code, which doesn't exist yet
              (plan-stay D10), and trip storage is itself behind D1. */}
          {AI_PLANNER_AVAILABLE && (
            <Button variant="outline" className="min-h-11" onClick={() => void handleShare()}>
              <SpriteIcon name="share-2" className="mr-1 h-4 w-4" />
              Share
            </Button>
          )}
          <Button variant="outline" className="min-h-11" onClick={handleAddToCalendar} disabled={items.length === 0}>
            <CalendarPlus className="mr-1 h-4 w-4" aria-hidden="true" />
            Add to calendar
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="min-h-11">
                <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this trip?</AlertDialogTitle>
                <AlertDialogDescription>
                  "{trip.title}" and all its stops will be removed. This can't be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction onClick={() => void handleDelete()}>Delete trip</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {tripStops.length > 0 && (
        <div className="relative h-72 overflow-hidden rounded-xl border">
          <Suspense fallback={<div className="absolute inset-0 animate-pulse bg-muted" />}>
            <DiscoverMapCanvas
              entities={tripStops}
              selectedId={null}
              onSelect={() => {}}
              onBoundsChange={() => {}}
              flyTo={null}
            />
          </Suspense>
        </div>
      )}

      {items.length > 0 ? (
        <TripItineraryDays
          trip={trip}
          items={items}
          onMoveItem={handleMoveItem}
          onAddDayToCalendar={handleAddDayToCalendar}
        />
      ) : (
        <p className="rounded-xl border p-4 text-sm text-muted-foreground">
          This trip has no stops. Try generating a new itinerary.
        </p>
      )}

      {(trip.tips?.length || trip.packingList?.length) ? (
        <div className="grid gap-6 md:grid-cols-2">
          {trip.tips && trip.tips.length > 0 && (
            <section className="rounded-xl border p-4">
              <h4 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                <Lightbulb className="h-5 w-5" aria-hidden="true" />
                Trip tips
              </h4>
              <ul className="space-y-2">
                {trip.tips.map((tip, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    {tip}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {trip.packingList && trip.packingList.length > 0 && (
            <section className="rounded-xl border p-4">
              <h4 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                <Download className="h-5 w-5" aria-hidden="true" />
                Packing list
              </h4>
              <ul className="space-y-2">
                {trip.packingList.map((entry, idx) => (
                  <li key={idx} className="flex min-h-11 items-center gap-2 text-sm">
                    <Checkbox id={`pack-${idx}`} />
                    <label htmlFor={`pack-${idx}`}>{entry}</label>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MyTrips({
  planner,
  onPlan,
  onOpen,
}: {
  planner: Planner;
  onPlan: () => void;
  onOpen: (trip: TripPlan) => void;
}) {
  const { tripPlans, isLoadingTrips, tripsError, refetchTrips } = planner;

  if (isLoadingTrips) {
    return (
      <div className="space-y-4" aria-busy="true">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border p-6">
            <Skeleton className="mb-2 h-6 w-48" />
            <Skeleton className="mb-4 h-4 w-full" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
    );
  }
  if (tripsError) {
    // WEB-QA-031: a failed load is not "No trips yet".
    return <ErrorState error={tripsError} onRetry={() => void refetchTrips()} />;
  }
  if (tripPlans.length === 0) {
    return (
      <EmptyPanel
        title="No trips yet"
        body="Your AI itineraries will be saved here."
        action={<Button onClick={onPlan}>Plan your first trip</Button>}
      />
    );
  }
  return (
    <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {tripPlans.map((trip) => (
        <li key={trip.id}>
          <button
            type="button"
            onClick={() => onOpen(trip)}
            className="flex h-full w-full flex-col gap-2 rounded-xl border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="line-clamp-1 text-lg font-semibold">{trip.title}</span>
            {trip.description && (
              <span className="line-clamp-2 text-sm text-muted-foreground">{trip.description}</span>
            )}
            <span className="text-sm text-muted-foreground">{tripRangeLabel(trip, false)}</span>
            <span className="mt-auto flex items-center justify-between pt-2">
              <Badge variant="secondary">{trip.status}</Badge>
              <span className="text-sm font-medium text-primary">View</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
