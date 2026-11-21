import { supabase } from "@/integrations/supabase/client";

/**
 * WEB-FEAT-102: closure findings on restaurant listings. Visitors report
 * through report_restaurant_closed (rate limited, never changes the listing);
 * admins read restaurant_closure_reviews (admin-only RLS) and decide through
 * resolve_closure_review. Migrations 20261121000010 and 20261121000030.
 */

export type ClosureReviewReason = "place_not_found" | "no_place_match" | "visitor_report";

export interface ClosureReview {
  id: string;
  restaurant_id: string;
  reason: ClosureReviewReason;
  source: string;
  details: Record<string, unknown> | null;
  created_at: string;
  restaurant: {
    id: string;
    name: string;
    slug: string | null;
    location: string | null;
    status: string | null;
    business_status: string | null;
    google_place_id: string | null;
    hours_checked_at: string | null;
  } | null;
}

export const CLOSURE_REVIEW_COLUMNS =
  "id, restaurant_id, reason, source, details, created_at, restaurant:restaurants(id, name, slug, location, status, business_status, google_place_id, hours_checked_at)";

/** Postgres raised 54000 (our rate limit) or 22023 (bad input): show its message. */
export class ClosureReportRefused extends Error {}

export async function reportRestaurantClosed(restaurantId: string, note: string): Promise<void> {
  const { error } = await supabase.rpc("report_restaurant_closed" as never, {
    p_restaurant_id: restaurantId,
    p_note: note.trim() || null,
  } as never);
  if (!error) return;
  if (error.code === "54000" || error.code === "22023") throw new ClosureReportRefused(error.message);
  throw new Error(error.message);
}

/** Open findings, newest first. A failed read throws; it is never an empty queue. */
export async function fetchOpenClosureReviews(): Promise<ClosureReview[]> {
  const { data, error } = await supabase
    .from("restaurant_closure_reviews" as never)
    .select(CLOSURE_REVIEW_COLUMNS)
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ClosureReview[];
}

export async function resolveClosureReview(
  reviewId: string,
  decision: "approve" | "dismiss",
  note: string,
): Promise<void> {
  const { error } = await supabase.rpc("resolve_closure_review" as never, {
    p_review_id: reviewId,
    p_decision: decision,
    p_note: note.trim() || null,
  } as never);
  if (error) throw new Error(error.message);
}

/** A Google Maps link for a finding: the stored place id when there is one, else a search. */
export function googleMapsLink(r: NonNullable<ClosureReview["restaurant"]>): string {
  const q = encodeURIComponent([r.name, r.location].filter(Boolean).join(", "));
  return r.google_place_id
    ? `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=${encodeURIComponent(r.google_place_id)}`
    : `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export const CLOSURE_REASON_LABEL: Record<ClosureReviewReason, string> = {
  place_not_found: "Google no longer has this place",
  no_place_match: "No confident Google match",
  visitor_report: "Visitor says it closed",
};
