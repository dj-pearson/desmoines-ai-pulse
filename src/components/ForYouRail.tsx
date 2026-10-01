import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SponsoredBadge } from "@/components/SponsoredBadge";
import { useForYouRail, type ForYouRecommendation } from "@/hooks/useForYouRail";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useAuth } from "@/hooks/useAuth";
import { useSponsoredImpression } from "@/hooks/useSponsoredImpression";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { OptimizedImage } from "@/components/OptimizedImage";
import { createEventSlugWithCentralTime, formatEventDateShort } from "@/lib/timezone";
import { storage } from "@/lib/safeStorage";
import { handleError } from "@/lib/errorHandler";
import { isSponsoredActive, logSponsoredClick } from "@/lib/sponsored";
import {
  TASTE_CHIPS,
  displayReason,
  forYouHeading,
  togglePick,
  unmatchedLine,
  type Reranked,
} from "@/lib/forYouRerank";
import { PREFS_PROMPT_DISMISSED_KEY } from "@/lib/userPreferencesStore";
import { cn } from "@/lib/utils";

const PreferencesOnboarding = lazy(() =>
  import("@/components/PreferencesOnboarding").then((m) => ({ default: m.PreferencesOnboarding })),
);


/**
 * The card strip's height, shared by skeleton, cards and the empty state so
 * none of the three can change the rail's height when it replaces another
 * (WP2 item 6). 126px image + the when/where line + two title lines + two
 * reason lines + gaps.
 */
const STRIP_MIN_HEIGHT = "min-h-[15rem]";

/**
 * The home For You rail.
 *
 * Web parity for the iOS HomeView rail (IOS-DISCOVER-2026-002), plus, from
 * the Home plans (pass 1 WP2, pass 2 WP3):
 *   - taste chips a guest can use: picks re-order the rows in the browser and
 *     each moved card says why ("Because you picked Free");
 *   - a heading that claims only what the rows support: "For you" when a pick
 *     matched or the rows are personal, "Trending" when enough rows carry a
 *     measured trending_score, "Coming up" otherwise;
 *   - "Sponsored" on every active sponsored row, with the impression and click
 *     logged the way EventCard logs them;
 *   - each card says when and where before what;
 *   - an inline "Tune your picks" prompt in place of the modal that used to
 *     open itself a second after load;
 *   - a fixed-height layout: the rail no longer collapses to nothing when the
 *     read is empty. The weather line moved to the Tonight rail, whose order
 *     it explains.
 */
export function ForYouRail() {
  const { recommendations, source, picks, isLoading, isError, refetch } = useForYouRail(12);
  const { preferences, updateInterestTags } = useUserPreferences();

  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [promptDismissed, setPromptDismissed] = useState<boolean>(
    () => storage.get<boolean>(PREFS_PROMPT_DISMISSED_KEY, false) === true,
  );
  // Logout clears the flag (clearPersonalStorage); re-read it when the account
  // changes so the next person on this browser is offered onboarding.
  const { user } = useAuth();
  const userId = user?.id;
  useEffect(() => {
    setPromptDismissed(storage.get<boolean>(PREFS_PROMPT_DISMISSED_KEY, false) === true);
  }, [userId]);

  // Null preferences (still loading) counts as "not onboarded", so the prompt
  // is present from first paint rather than inserted when the read lands.
  const showPrompt = !promptDismissed && !preferences?.onboardingCompleted;

  const dismissPrompt = () => {
    storage.set(PREFS_PROMPT_DISMISSED_KEY, true);
    setPromptDismissed(true);
  };

  const onChip = async (id: string) => {
    try {
      await updateInterestTags(togglePick(preferences?.interests?.tags, id));
    } catch (error) {
      handleError(error, { component: "ForYouRail", action: "toggleTasteChip" });
    }
  };

  const { title: headerTitle, unmatched } = forYouHeading({ source, picks, rows: recommendations });
  const pickSet = new Set(picks);
  const showSkeleton = isLoading && recommendations.length === 0;
  // A failed read is not an empty one (WEB-QA-032): "Nothing trending yet" on a
  // network failure tells the visitor there is nothing on, which is false.
  const showError = !isLoading && isError && recommendations.length === 0;
  const showEmpty = !isLoading && !isError && recommendations.length === 0;

  return (
    <section className="py-6" aria-labelledby="for-you-rail-heading">
      <div className="container mx-auto px-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2
            id="for-you-rail-heading"
            className="text-xl font-semibold flex items-center gap-2"
          >
            <SpriteIcon name="sparkles" className="h-5 w-5 text-primary" aria-hidden="true" />
            {headerTitle}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            onClick={refetch}
            disabled={isLoading}
            aria-label="Refresh recommendations"
          >
            <RefreshCw
              className={cn("h-4 w-4", isLoading && "animate-spin motion-reduce:animate-none")}
              aria-hidden="true"
            />
          </Button>
        </div>

        {showPrompt && (
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-muted px-4 py-2">
            <p className="text-sm text-foreground">
              Tell us what you like and this rail follows.
            </p>
            <div className="ml-auto flex items-center gap-1">
              <Button size="sm" className="h-11" onClick={() => setOnboardingOpen(true)}>
                Tune your picks
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11"
                onClick={dismissPrompt}
                aria-label="Not now, hide this prompt"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}

        <div
          className="mb-3 flex gap-2 overflow-x-auto pb-1 -mx-4 px-4"
          role="group"
          aria-label="Steer these picks"
        >
          {TASTE_CHIPS.map((chip) => {
            const pressed = pickSet.has(chip.id);
            return (
              <button
                key={chip.id}
                type="button"
                aria-pressed={pressed}
                onClick={() => void onChip(chip.id)}
                className={cn(
                  "shrink-0 min-h-11 rounded-full border px-4 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  pressed
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted",
                )}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {unmatched.length > 0 && (
          <p className="mb-3 text-sm text-muted-foreground" role="status">
            {unmatchedLine(unmatched)}.{" "}
            <Link
              to={unmatched[0].hub}
              className="font-medium text-foreground underline underline-offset-4"
            >
              {unmatched[0].hubLabel}
            </Link>
          </p>
        )}

        <div
          className={cn("flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory", STRIP_MIN_HEIGHT)}
          aria-busy={showSkeleton}
        >
          {showSkeleton &&
            Array.from({ length: 6 }).map((_, i) => (
              <div key={`skeleton-${i}`} className="snap-start shrink-0 w-56" aria-hidden="true">
                <div className="aspect-video w-56 rounded-lg bg-muted animate-pulse motion-reduce:animate-none" />
                <div className="mt-2 h-4 w-3/4 rounded bg-muted animate-pulse motion-reduce:animate-none" />
                <div className="mt-1 h-3 w-1/2 rounded bg-muted animate-pulse motion-reduce:animate-none" />
              </div>
            ))}

          {showError && (
            <div
              role="alert"
              className="flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-xl bg-muted px-4 text-center"
            >
              <p className="text-sm text-muted-foreground">We couldn't load picks right now.</p>
              <Button variant="outline" size="sm" className="h-11" onClick={() => refetch()}>
                Try again
              </Button>
            </div>
          )}

          {showEmpty && (
            <div className="flex w-full items-center justify-center rounded-xl bg-muted px-4 text-center">
              <p className="text-sm text-muted-foreground">
                Nothing is listed yet.{" "}
                <Link
                  to="/events/today"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  See what's on today
                </Link>
              </p>
            </div>
          )}

          {recommendations.map((rec) => (
            <ForYouCard key={rec.id} rec={rec} heading={headerTitle} />
          ))}
        </div>
      </div>

      {onboardingOpen && (
        <Suspense fallback={null}>
          <PreferencesOnboarding
            open={onboardingOpen}
            onComplete={() => setOnboardingOpen(false)}
            onDismiss={() => setOnboardingOpen(false)}
          />
        </Suspense>
      )}
    </section>
  );
}

interface ForYouCardProps {
  rec: Reranked<ForYouRecommendation>;
  heading: string;
}

/**
 * One card: when and where, then what, then why. The image is decorative
 * (alt=""): the link's name is the title text inside it.
 */
function ForYouCard({ rec, heading }: ForYouCardProps) {
  const ref = useRef<HTMLAnchorElement>(null);
  const sponsored = isSponsoredActive(rec);
  useSponsoredImpression(ref, "event", rec.id, sponsored);

  const reason = displayReason(rec, heading);
  const when = rec.date || rec.event_start_utc ? formatEventDateShort(rec) : null;
  const where = rec.venue?.trim() || rec.location?.trim() || null;
  const line = [when, where].filter(Boolean).join(" \u00b7 ");

  return (
    <Link
      ref={ref}
      to={`/events/${createEventSlugWithCentralTime(rec.title, rec)}`}
      className="snap-start shrink-0 w-56 group"
      onClick={() => {
        if (sponsored) logSponsoredClick("event", rec.id);
      }}
    >
      <div className="relative aspect-video w-56 overflow-hidden rounded-lg bg-muted">
        {rec.image_url ? (
          <OptimizedImage
            src={rec.image_url}
            alt=""
            width={224}
            height={126}
            containerClassName="h-full w-full"
            className="object-cover group-hover:scale-105 transition-transform duration-200"
            sizes="224px"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground">
            <SpriteIcon name="sparkles" className="h-8 w-8" aria-hidden="true" />
          </div>
        )}
        {sponsored && <SponsoredBadge className="absolute left-2 top-2" />}
      </div>
      {line && <p className="mt-2 text-xs font-medium text-muted-foreground line-clamp-1">{line}</p>}
      <p className={cn("font-medium text-sm line-clamp-2 group-hover:text-primary", line ? "mt-0.5" : "mt-2")}>
        {rec.title}
      </p>
      {reason && (
        <p
          className={cn(
            "mt-1 text-xs line-clamp-2",
            rec.pickReason ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {reason}
        </p>
      )}
    </Link>
  );
}
