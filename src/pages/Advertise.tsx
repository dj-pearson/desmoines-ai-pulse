import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ListingPicker, fetchListingById } from "@/components/advertising/ListingPicker";
import type { LinkedListing, SponsorableListingType } from "@/components/advertising/ListingPicker";
import { PlatformMetrics } from "@/components/advertising/PlatformMetrics";
import { PlacementRow } from "@/components/advertising/PlacementRow";
import { AdvertiseSummaryBar } from "@/components/advertising/AdvertiseSummaryBar";
import type { SummaryQuoteState } from "@/components/advertising/AdvertiseSummaryBar";
import { useCampaigns, useRateCard, lowestDailyRate } from "@/hooks/useCampaigns";
import { useCampaignQuote } from "@/hooks/useCampaignQuote";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { handleError } from "@/lib/errorHandler";
import { PLACEMENT_SPECS } from "@/lib/placementSpecs";
import type { PlacementType } from "@/lib/placementSpecs";
import { campaignDays, formatCampaignDate, formatUSD } from "@/lib/campaignDisplay";
import { readCheckoutFailure } from "@/lib/campaignCheckout";
import {
  BUSINESS_CONTACT_EMAIL,
  BUSINESS_CONTACT_HREF,
  CREATIVE_REVIEW_COPY,
  MIN_LEAD_TIME_DAYS,
} from "@/lib/businessCopy";
import { getCanonicalUrl, BRAND } from "@/lib/brandConfig";
import { parseDateOnly } from "@/lib/dateOnly";
import { addCentralDays, centralDateOf } from "@/lib/timezone";
import {
  clearAdvertiseDraft,
  readAdvertiseDraft,
  saveAdvertiseDraft,
} from "@/lib/advertiseDraft";
import type { AdvertiseDraftListing } from "@/lib/advertiseDraft";

const PLACEMENTS = Object.values(PLACEMENT_SPECS);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The listing a deep link asks for. Both spellings are live: the app sends
 *  camelCase (IOS-ADS-016), ClaimListingCta sends snake_case. */
function deepLinkListing(params: URLSearchParams): { type: string; id: string } | null {
  const type = params.get("listingType") ?? params.get("listing_type");
  const id = params.get("listingId") ?? params.get("listing_id");
  if (!type || !id || !UUID_RE.test(id)) return null;
  return { type, id };
}

function isSponsorable(type: string): type is SponsorableListingType {
  return type === "event" || type === "restaurant";
}

/** yyyy-MM-dd for a Calendar pick. The picker hands back local midnight. */
function dayOf(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

type CheckoutProblem =
  | { kind: "save" }
  | { kind: "link" }
  | { kind: "verify_email" }
  | { kind: "price_changed"; campaignId: string; currentTotal: number };

interface SavedCampaign {
  id: string;
  signature: string;
}

export default function Advertise() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, resendVerification } = useAuth();
  // The list isn't shown here; only the mutations are used (WP1 item 10).
  const { createCampaign, createCheckoutSession, cancelCampaign } = useCampaigns({ enabled: false });
  const { data: rateCard = [] } = useRateCard();

  // Restored once, synchronously, so a returning buyer never sees an empty
  // form flash before their choices come back.
  const [initialDraft] = useState(() => readAdvertiseDraft());
  const [campaignName, setCampaignName] = useState(initialDraft?.name ?? "");
  const [startDay, setStartDay] = useState<string | null>(initialDraft?.startDate ?? null);
  const [endDay, setEndDay] = useState<string | null>(initialDraft?.endDate ?? null);
  const [placements, setPlacements] = useState<PlacementType[]>(initialDraft?.placements ?? []);
  // What's saved is the reference; the name shown is always re-read.
  const [listingRef, setListingRef] = useState<AdvertiseDraftListing | null>(initialDraft?.listing ?? null);
  const [linkedListing, setLinkedListing] = useState<LinkedListing | null>(null);
  const [listingNotice, setListingNotice] = useState<string | null>(null);
  const [endCapNotice, setEndCapNotice] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [savedCampaign, setSavedCampaign] = useState<SavedCampaign | null>(null);
  const [problem, setProblem] = useState<CheckoutProblem | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  const hasSponsoredListing = placements.includes("sponsored_listing");
  const fromRate = lowestDailyRate(rateCard);

  // ---- Deep link and draft listing -------------------------------------------------
  useEffect(() => {
    const link = deepLinkListing(searchParams);
    let cancelled = false;

    if (link && !isSponsorable(link.type)) {
      setListingNotice(
        `Sponsored listings cover events and restaurants for now, so this ${link.type === "venue" ? "venue" : "attraction"} can't be sponsored yet. A banner placement works for any business.`,
      );
      return;
    }

    const target = link && isSponsorable(link.type) ? { type: link.type, id: link.id } : listingRef;
    if (!target) return;

    if (link) {
      setListingRef(target);
      setPlacements((current) => (current.includes("sponsored_listing") ? current : [...current, "sponsored_listing"]));
    }

    fetchListingById(target.type, target.id).then((listing) => {
      if (cancelled) return;
      if (listing) {
        setLinkedListing(listing);
        setListingNotice(null);
      } else {
        setListingRef(null);
        setListingNotice("We couldn't find that listing. Search for it below.");
      }
    });
    return () => {
      cancelled = true;
    };
    // Resolve once per deep link; listingRef changes from the picker don't refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ---- Save the draft on every change ----------------------------------------------
  useEffect(() => {
    saveAdvertiseDraft({
      name: campaignName,
      startDate: startDay,
      endDate: endDay,
      placements,
      listing: listingRef,
    });
  }, [campaignName, startDay, endDay, placements, listingRef]);

  // ---- Dates -----------------------------------------------------------------------
  // Central calendar days. The old check compared against `new Date()` with
  // its time of day, so the earliest selectable day was today+4 while the
  // hint said today+3.
  const earliestStartDay = addCentralDays(centralDateOf(), MIN_LEAD_TIME_DAYS);
  const earliestStart = parseDateOnly(earliestStartDay);
  const eventEndDay = hasSponsoredListing && linkedListing?.type === "event" ? linkedListing.endsOn ?? null : null;

  // Cap the end at the sponsored event's last day: a sponsorship can't
  // outlive its event.
  useEffect(() => {
    if (!eventEndDay || !linkedListing) {
      setEndCapNotice(null);
      return;
    }
    if (endDay && endDay > eventEndDay) {
      setEndDay(eventEndDay);
    }
    setEndCapNotice(
      `Ends by ${formatCampaignDate(eventEndDay)} at the latest, because ${linkedListing.name} ends then.`,
    );
  }, [eventEndDay, endDay, linkedListing]);

  const dateProblem = useMemo(() => {
    if (eventEndDay && eventEndDay < earliestStartDay) {
      return "This event ends before the earliest start date, so it can't be sponsored.";
    }
    if (startDay && startDay < earliestStartDay) {
      return `Campaigns start ${MIN_LEAD_TIME_DAYS} days out at the soonest. Pick ${formatCampaignDate(earliestStartDay)} or later.`;
    }
    if (startDay && endDay && endDay < startDay) {
      return "The end date is before the start date.";
    }
    return null;
  }, [startDay, endDay, earliestStartDay, eventEndDay]);

  const days = dateProblem ? null : campaignDays(startDay, endDay);

  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  const handleStartSelect = (date: Date | undefined) => {
    if (!date) return;
    const day = dayOf(date);
    setStartDay(day);
    // A start past the end clears the end rather than leaving a backwards range.
    if (endDay && endDay < day) setEndDay(null);
    setStartOpen(false);
  };

  const handleEndSelect = (date: Date | undefined) => {
    if (!date) return;
    setEndDay(dayOf(date));
    setEndOpen(false);
  };

  // ---- Price -----------------------------------------------------------------------
  const quote = useCampaignQuote(placements, days);

  const quoteState: SummaryQuoteState = useMemo(() => {
    if (placements.length === 0) return { status: "no_placements" };
    if (!days) return { status: "no_dates", fromRate };
    if (quote.isError) return { status: "error" };
    if (!quote.data) return { status: "loading" };
    return { status: "ready", total: quote.data.total, days: quote.data.days };
  }, [placements.length, days, fromRate, quote.isError, quote.data]);

  const lineTotals = useMemo(() => {
    const map = new Map<PlacementType, number>();
    for (const line of quote.data?.lines ?? []) map.set(line.placement_type, line.total_price);
    return map;
  }, [quote.data]);

  const togglePlacement = (type: PlacementType, checked: boolean) => {
    setProblem(null);
    setPlacements((current) =>
      checked ? (current.includes(type) ? current : [...current, type]) : current.filter((p) => p !== type),
    );
  };

  const handlePickListing = (listing: LinkedListing | null) => {
    setLinkedListing(listing);
    setListingRef(listing ? { type: listing.type, id: listing.id } : null);
    setListingNotice(null);
  };

  // ---- Checkout --------------------------------------------------------------------
  const signature = JSON.stringify({
    name: campaignName.trim(),
    startDay,
    endDay,
    placements: [...placements].sort(),
    listing: hasSponsoredListing ? linkedListing?.id ?? null : null,
  });

  const release = useCallback(() => {
    submittingRef.current = false;
    setSubmitting(false);
  }, []);

  const startCheckout = useCallback(
    async (campaignId: string, retried = false) => {
      try {
        const checkoutUrl = await createCheckoutSession(campaignId);
        // The campaign is on the server now; the local copy has done its job.
        clearAdvertiseDraft();
        window.location.href = checkoutUrl;
        // Stay busy until the browser leaves, so a second click can't start
        // a second session.
      } catch (error) {
        handleError(error, { component: "Advertise", action: "checkout" });
        const failure = await readCheckoutFailure(error);
        if (failure.kind === "verify_email") {
          setProblem({ kind: "verify_email" });
        } else if (failure.kind === "price_changed" && !retried) {
          await queryClient.invalidateQueries({ queryKey: ["campaign-quote"] });
          setProblem({ kind: "price_changed", campaignId, currentTotal: failure.currentTotal });
        } else {
          clearAdvertiseDraft();
          toast({
            title: "Your campaign is saved; payment didn't start",
            description: "You can pay for it from the campaign page.",
          });
          navigate(`/campaigns/${campaignId}`);
        }
        release();
      }
    },
    [createCheckoutSession, navigate, queryClient, release, toast],
  );

  /**
   * Save the campaign (unless the saved draft still matches) and open checkout.
   *
   * `replaceCampaignId` is the price-changed path. create-campaign-checkout
   * answers 409 when the stored placement totals disagree with the rate card,
   * and nothing on the server rewrites those totals afterwards, so retrying
   * checkout on the same campaign would get the same 409 forever. A fresh
   * campaign is priced by the placement trigger at today's rate card, which is
   * the total the 409 reported. The old draft is cancelled, best effort.
   */
  const submitCampaign = async (replaceCampaignId: string | null) => {
    if (submittingRef.current) return;

    if (!user) {
      // The draft is already saved; bring the whole query string back so a
      // deep-linked listing survives the trip too.
      const back = `${location.pathname}${location.search}`;
      navigate(`/auth?redirect=${encodeURIComponent(back)}`);
      return;
    }

    if (!campaignName.trim() || placements.length === 0 || !startDay || !endDay) {
      toast({
        title: "A few things are missing",
        description: "Name the campaign, pick dates and choose at least one placement.",
        variant: "destructive",
      });
      return;
    }
    if (dateProblem || !days) return;
    if (hasSponsoredListing && !linkedListing) {
      toast({
        title: "Pick the listing to sponsor",
        description: "Choose the event or restaurant under Listing to sponsor.",
        variant: "destructive",
      });
      return;
    }
    if (!quote.data) return;

    submittingRef.current = true;
    setSubmitting(true);
    setProblem(null);

    let campaignId = !replaceCampaignId && savedCampaign?.signature === signature ? savedCampaign.id : null;

    if (!campaignId) {
      const staleId = replaceCampaignId ?? savedCampaign?.id ?? null;
      if (staleId) {
        // The buyer changed their choices after an unpaid draft was saved, or
        // the saved draft was priced before a rate-card change. Cancel it
        // rather than leave it lying around; best effort.
        cancelCampaign(staleId).catch((error) =>
          handleError(error, { component: "Advertise", action: "cancelStaleDraft" }),
        );
        setSavedCampaign(null);
      }

      try {
        const campaign = await createCampaign({
          name: campaignName.trim(),
          // One length for every placement, from the dates: the pricing
          // trigger and create-campaign-checkout both count it this way.
          placements: placements.map((placement_type) => ({ placement_type, days_count: days })),
          start_date: startDay,
          end_date: endDay,
        });
        campaignId = campaign.id as string;
      } catch (error) {
        handleError(error, { component: "Advertise", action: "createCampaign" });
        setProblem({ kind: "save" });
        release();
        return;
      }

      if (hasSponsoredListing && linkedListing) {
        const { error: linkError } = await supabase.from("sponsored_listing_links").insert({
          campaign_id: campaignId,
          listing_type: linkedListing.type,
          listing_id: linkedListing.id,
        });
        if (linkError) {
          // A paid sponsored campaign with no link never activates, so stop
          // here and take the draft back out.
          handleError(linkError, { component: "Advertise", action: "linkSponsoredListing" });
          try {
            await cancelCampaign(campaignId);
          } catch (error) {
            handleError(error, { component: "Advertise", action: "cancelUnlinkedDraft" });
          }
          setProblem({ kind: "link" });
          release();
          return;
        }
      }

      setSavedCampaign({ id: campaignId, signature });
    }

    // A replacement that 409s too is not offered a third try: it goes to the
    // campaign page like any other checkout failure.
    await startCheckout(campaignId, replaceCampaignId !== null);
  };

  const handleCreateCampaign = () => {
    void submitCampaign(null);
  };

  const handlePayChangedPrice = (campaignId: string) => {
    void submitCampaign(campaignId);
  };

  const handleResend = async () => {
    if (!user?.email) return;
    setResendState("sending");
    const result = await resendVerification(user.email);
    setResendState(result.success ? "sent" : "failed");
  };

  const ctaLabel = !user
    ? "Sign in to continue"
    : savedCampaign?.signature === signature
      ? "Go to payment"
      : "Continue to payment";

  const ctaDisabled =
    submitting ||
    placements.length === 0 ||
    (!!user && (quoteState.status !== "ready" || (hasSponsoredListing && !linkedListing)));

  const summaryNote = !user
    ? "Sign in or create a free account to pay. Your choices are kept."
    : hasSponsoredListing && !linkedListing
      ? "Pick the listing to sponsor first."
      : null;

  const startLabel = startDay ? formatCampaignDate(startDay) : "not set";
  const endLabel = endDay ? formatCampaignDate(endDay) : "not set";

  return (
    <BusinessLayout footerClearanceClassName="h-40 lg:hidden">
      <SEOHead
        title="Advertise on Des Moines Insider"
        description="Buy a banner or a sponsored listing on Des Moines Insider's event, restaurant and attraction pages. Pick your dates, see the exact total, pay by card."
        canonicalUrl={getCanonicalUrl("/advertise")}
        url={getCanonicalUrl("/advertise")}
        imageUrl={getCanonicalUrl(BRAND.ogImage)}
      />

      <div className="pb-48 lg:pb-16">
        <header className="border-b">
          <div className="container mx-auto max-w-5xl px-4 py-8 lg:py-12">
            <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Advertise on Des Moines Insider
            </h1>
            <p className="mt-3 max-w-prose text-lg text-muted-foreground">
              Put your business in front of people planning what to do in Des Moines. You see the
              exact total before you pay.
            </p>
            {fromRate !== null && (
              <p className="mt-2 font-medium tabular-nums">From {formatUSD(fromRate)}/day</p>
            )}
          </div>
        </header>

        <div className="container mx-auto max-w-5xl px-4">
          <div className="py-6 empty:hidden">
            <PlatformMetrics />
          </div>

          <div className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-10">
              <section aria-labelledby="dates-heading" className="space-y-4">
                <h2 id="dates-heading" className="text-xl font-semibold">
                  Dates
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label id="start-date-label">Start date</Label>
                    <Popover open={startOpen} onOpenChange={setStartOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          aria-label={`Start date, ${startLabel}`}
                          className={cn("w-full justify-start text-left font-normal", !startDay && "text-muted-foreground")}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                          {startDay ? formatCampaignDate(startDay, "MMM d, yyyy") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={startDay ? parseDateOnly(startDay) : undefined}
                          defaultMonth={startDay ? parseDateOnly(startDay) : earliestStart}
                          onSelect={handleStartSelect}
                          disabled={(date) =>
                            date < earliestStart || (!!eventEndDay && dayOf(date) > eventEndDay)
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-1.5">
                    <Label id="end-date-label">End date</Label>
                    <Popover open={endOpen} onOpenChange={setEndOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          aria-label={`End date, ${endLabel}`}
                          className={cn("w-full justify-start text-left font-normal", !endDay && "text-muted-foreground")}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                          {endDay ? formatCampaignDate(endDay, "MMM d, yyyy") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={endDay ? parseDateOnly(endDay) : undefined}
                          defaultMonth={
                            endDay ? parseDateOnly(endDay) : startDay ? parseDateOnly(startDay) : earliestStart
                          }
                          onSelect={handleEndSelect}
                          disabled={(date) => {
                            const day = dayOf(date);
                            if (day < (startDay ?? earliestStartDay)) return true;
                            return !!eventEndDay && day > eventEndDay;
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">
                  Earliest start is {formatCampaignDate(earliestStartDay, "MMM d")}. {MIN_LEAD_TIME_DAYS} days
                  leaves time to upload your creative and have it reviewed.
                </p>
                {endCapNotice && <p className="text-sm">{endCapNotice}</p>}
                {dateProblem && (
                  <p role="alert" className="text-sm font-medium text-destructive">
                    {dateProblem}
                  </p>
                )}
                {days && startDay && !placements.every((p) => PLACEMENT_SPECS[p].noCreativeRequired) && (
                  <p className="text-sm">
                    {days} {days === 1 ? "day" : "days"}. Upload your creative by{" "}
                    {formatCampaignDate(addCentralDays(startDay, -1), "MMM d")} so review can finish before it starts.
                  </p>
                )}
              </section>

              <section aria-labelledby="placements-heading" className="space-y-4">
                <div>
                  <h2 id="placements-heading" className="text-xl font-semibold">
                    Placements
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Where each one shows on the site. Longer runs cost less per day.
                  </p>
                </div>
                <ul className="space-y-3">
                  {PLACEMENTS.map((spec) => {
                    const rate = rateCard.find((r) => r.placement_type === spec.type);
                    return (
                      <PlacementRow
                        key={spec.type}
                        spec={spec}
                        dailyRate={rate ? Number(rate.base_daily_rate) : null}
                        checked={placements.includes(spec.type)}
                        onCheckedChange={(checked) => togglePlacement(spec.type, checked)}
                        lineTotal={lineTotals.get(spec.type) ?? null}
                        days={quote.data?.days ?? null}
                      />
                    );
                  })}
                </ul>
                {listingNotice && !hasSponsoredListing && (
                  <p className="text-sm" role="status">
                    {listingNotice}
                  </p>
                )}
              </section>

              {hasSponsoredListing && (
                <section aria-labelledby="listing-heading" className="space-y-4">
                  <div>
                    <h2 id="listing-heading" className="text-xl font-semibold">
                      Listing to sponsor
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      The event or restaurant that moves up, labelled Sponsored.
                    </p>
                  </div>
                  {listingNotice && (
                    <p className="text-sm" role="status">
                      {listingNotice}
                    </p>
                  )}
                  <ListingPicker value={linkedListing} onChange={handlePickListing} />
                </section>
              )}

              <section aria-labelledby="name-heading" className="space-y-2">
                <h2 id="name-heading" className="text-xl font-semibold">
                  Campaign name
                </h2>
                <Label htmlFor="campaign-name" className="text-sm text-muted-foreground">
                  Only you and our reviewers see it.
                </Label>
                <Input
                  id="campaign-name"
                  value={campaignName}
                  maxLength={200}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="Fall patio season"
                />
              </section>

              {problem && (
                <CheckoutProblemNotice
                  problem={problem}
                  email={user?.email ?? null}
                  resendState={resendState}
                  onResend={handleResend}
                  onPay={handlePayChangedPrice}
                  busy={submitting}
                />
              )}
            </div>

            <aside className="lg:sticky lg:top-24 lg:self-start">
              <AdvertiseSummaryBar
                quote={quoteState}
                ctaLabel={ctaLabel}
                onSubmit={handleCreateCampaign}
                disabled={ctaDisabled}
                busy={submitting}
                onRetryQuote={() => quote.refetch()}
                note={summaryNote}
              />
            </aside>
          </div>

          <div className="max-w-prose space-y-10 border-t py-10">
            <section aria-labelledby="after-heading">
              <h2 id="after-heading" className="text-xl font-semibold">
                After you pay
              </h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5">
                <li>
                  Stripe takes the payment. Your campaign then shows under{" "}
                  <Link to="/campaigns" className="underline underline-offset-4">
                    Campaigns
                  </Link>
                  .
                </li>
                <li>
                  Upload a creative for each banner placement. A sponsored listing uses your listing as it
                  is.
                </li>
                <li>{CREATIVE_REVIEW_COPY} Approved campaigns start on your start date.</li>
              </ol>
            </section>

            <section aria-labelledby="report-heading">
              <h2 id="report-heading" className="text-xl font-semibold">
                What you can track
              </h2>
              <p className="mt-3">
                Your campaign&apos;s analytics page shows impressions (times your ad was on screen), clicks and
                click-through rate.
              </p>
            </section>

            <section aria-labelledby="rules-heading">
              <h2 id="rules-heading" className="text-xl font-semibold">
                Creative rules
              </h2>
              <ul className="mt-3 list-disc space-y-1 pl-5">
                <li>RGB color, at the exact pixel size listed for the placement. DPI is ignored on screen.</li>
                <li>Text readable at the size it&apos;s shown.</li>
                <li>Family-friendly, honest claims, and a working landing page.</li>
                <li>Des Moines area businesses first.</li>
              </ul>
            </section>

            <section aria-labelledby="contact-heading">
              <h2 id="contact-heading" className="text-xl font-semibold">
                Questions
              </h2>
              <p className="mt-3">
                Email{" "}
                <a href={BUSINESS_CONTACT_HREF} className="underline underline-offset-4">
                  {BUSINESS_CONTACT_EMAIL}
                </a>
                . That&apos;s also the place to ask about something the builder doesn&apos;t cover, like a
                multi-month run or an event sponsorship.
              </p>
            </section>
          </div>
        </div>
      </div>
    </BusinessLayout>
  );
}

interface CheckoutProblemNoticeProps {
  problem: CheckoutProblem;
  email: string | null;
  resendState: "idle" | "sending" | "sent" | "failed";
  onResend: () => void;
  onPay: (campaignId: string) => void;
  busy: boolean;
}

function CheckoutProblemNotice({ problem, email, resendState, onResend, onPay, busy }: CheckoutProblemNoticeProps) {
  return (
    <div role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm">
      {problem.kind === "save" && (
        <p>We couldn&apos;t save your campaign. Nothing was charged. Try again in a minute.</p>
      )}
      {problem.kind === "link" && (
        <p>
          We couldn&apos;t attach your listing, so we took the draft back out. Nothing was charged. Try again,
          or email{" "}
          <a href={BUSINESS_CONTACT_HREF} className="underline underline-offset-4">
            {BUSINESS_CONTACT_EMAIL}
          </a>
          .
        </p>
      )}
      {problem.kind === "verify_email" && (
        <div className="space-y-2">
          <p>
            Confirm your email address before paying. The link is in the email we sent
            {email ? ` to ${email}` : ""}. Your campaign is saved; come back here and continue once you&apos;ve
            confirmed.
          </p>
          <Button variant="outline" size="sm" onClick={onResend} disabled={resendState === "sending" || !email}>
            {resendState === "sending" ? "Sending..." : "Send the email again"}
          </Button>
          {resendState === "sent" && <p>Sent. Check your inbox.</p>}
          {resendState === "failed" && <p>That didn&apos;t send. Try again in a minute.</p>}
        </div>
      )}
      {problem.kind === "price_changed" && (
        <div className="space-y-2">
          <p>
            The price changed since you started: it&apos;s now{" "}
            <strong className="tabular-nums" id="changed-total">
              {formatUSD(problem.currentTotal)}
            </strong>
            . Your campaign is saved.
          </p>
          <Button size="sm" onClick={() => onPay(problem.campaignId)} disabled={busy} aria-busy={busy}>
            Pay {formatUSD(problem.currentTotal)}
          </Button>
        </div>
      )}
    </div>
  );
}
