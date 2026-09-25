import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromUnknownTable } from "@/integrations/supabase/unknownTable";
import { useAuth } from "@/hooks/useAuth";
import { createSlug } from "@/lib/slug";
import { ErrorSeverity, handleError } from "@/lib/errorHandler";
import type { ClaimStatus, ListingType } from "@/hooks/useBusinessClaim";

/**
 * The signed-in user's own listing claims, for the /business workspace
 * (business plan WP3 item 3).
 *
 * business_claims and update_claimed_listing arrive with 20260920000005, which
 * postdates the 2026-08-24 schema snapshot. Until it is applied the table read
 * answers 42P01 (or PGRST205 from the schema cache) and this returns [], the
 * way useBusinessClaim does, so the page shows its empty state instead of an
 * error. Any other failure is thrown, so the section can say it failed.
 */

/** PostgREST / Postgres codes that mean "the claims migration isn't applied". */
const TABLE_MISSING_CODES = new Set(["42P01", "PGRST205"]);

interface PostgrestLikeError {
  code?: string;
  message?: string;
}

function errorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as PostgrestLikeError).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/** True when an RPC call failed because the function isn't deployed (PGRST202). */
export function isRpcMissing(error: unknown): boolean {
  if (errorCode(error) === "PGRST202") return true;
  const message = error instanceof Error ? error.message : (error as PostgrestLikeError | null)?.message;
  return typeof message === "string" && /could not find the function/i.test(message);
}

/**
 * The columns an owner may change, per listing type. This mirrors the
 * whitelist inside update_claimed_listing (20260920000005:317-326), which is
 * what actually enforces it; the form only avoids sending a key the function
 * would refuse.
 *
 * One deliberate difference: the function lists `phone` for attractions, but
 * attractions has no phone column in the 2026-08-24 snapshot and no migration
 * adds one, so sending it would fail every attraction edit with 42703. It stays
 * off the form until that column exists.
 */
export const OWNER_EDITABLE_FIELDS = {
  restaurant: ["description", "website", "phone", "image_url", "menu_url"],
  attraction: ["description", "website", "image_url"],
  venue: ["website", "phone"],
} as const satisfies Record<ListingType, readonly string[]>;

export type OwnerEditableField = (typeof OWNER_EDITABLE_FIELDS)[ListingType][number];

/** What a claim points at: the listing's name, link and current editable values. */
export interface ClaimedListing {
  name: string;
  /** Site path of the public page, or null for a venue (no public page). */
  href: string | null;
  values: Partial<Record<OwnerEditableField, string | null>>;
}

export interface MyBusinessClaim {
  id: string;
  listing_type: ListingType;
  listing_id: string;
  status: ClaimStatus;
  method: string | null;
  verified_at: string | null;
  created_at: string;
  /** Null when the listing row couldn't be read (deleted, or the read failed). */
  listing: ClaimedListing | null;
}

type ClaimRow = Omit<MyBusinessClaim, "listing">;

interface RestaurantRow {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  website: string | null;
  phone: string | null;
  image_url: string | null;
  menu_url: string | null;
}

interface AttractionRow {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  image_url: string | null;
}

interface VenueRow {
  id: string;
  name: string;
  website: string | null;
  phone: string | null;
}

async function loadListings(claims: ClaimRow[]): Promise<Map<string, ClaimedListing>> {
  const ids = (type: ListingType) =>
    claims.filter((c) => c.listing_type === type).map((c) => c.listing_id);
  const out = new Map<string, ClaimedListing>();

  const restaurantIds = ids("restaurant");
  const attractionIds = ids("attraction");
  const venueIds = ids("venue");

  const [restaurants, attractions, venues] = await Promise.all([
    restaurantIds.length
      ? supabase
          .from("restaurants")
          .select("id, name, slug, description, website, phone, image_url, menu_url")
          .in("id", restaurantIds)
      : Promise.resolve({ data: [] as RestaurantRow[], error: null }),
    attractionIds.length
      ? supabase
          .from("attractions")
          .select("id, name, description, website, image_url")
          .in("id", attractionIds)
      : Promise.resolve({ data: [] as AttractionRow[], error: null }),
    venueIds.length
      ? supabase.from("known_venues").select("id, name, website, phone").in("id", venueIds)
      : Promise.resolve({ data: [] as VenueRow[], error: null }),
  ]);

  // A failed name lookup degrades one row to "listing unavailable"; it must
  // not take the claims themselves down with it.
  if (!restaurants.error) {
    for (const r of (restaurants.data ?? []) as RestaurantRow[]) {
      out.set(`restaurant:${r.id}`, {
        name: r.name,
        href: `/restaurants/${r.slug || r.id}`,
        values: {
          description: r.description,
          website: r.website,
          phone: r.phone,
          image_url: r.image_url,
          menu_url: r.menu_url,
        },
      });
    }
  } else {
    handleError(restaurants.error, { component: "useMyBusinessClaims", action: "load restaurants" }, ErrorSeverity.WARNING);
  }

  if (!attractions.error) {
    for (const a of (attractions.data ?? []) as AttractionRow[]) {
      out.set(`attraction:${a.id}`, {
        name: a.name,
        href: `/attractions/${createSlug(a.name)}`,
        values: { description: a.description, website: a.website, image_url: a.image_url },
      });
    }
  } else {
    handleError(attractions.error, { component: "useMyBusinessClaims", action: "load attractions" }, ErrorSeverity.WARNING);
  }

  if (!venues.error) {
    for (const v of (venues.data ?? []) as VenueRow[]) {
      out.set(`venue:${v.id}`, {
        name: v.name,
        href: null,
        values: { website: v.website, phone: v.phone },
      });
    }
  } else {
    handleError(venues.error, { component: "useMyBusinessClaims", action: "load venues" }, ErrorSeverity.WARNING);
  }

  return out;
}

export const MY_BUSINESS_CLAIMS_KEY = "my-business-claims";

export function useMyBusinessClaims() {
  const { user } = useAuth();

  return useQuery({
    queryKey: [MY_BUSINESS_CLAIMS_KEY, user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<MyBusinessClaim[]> => {
      if (!user) return [];
      const { data, error } = await fromUnknownTable("business_claims")
        .select("id, listing_type, listing_id, status, method, verified_at, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        if (TABLE_MISSING_CODES.has(errorCode(error) ?? "")) return [];
        throw error;
      }

      const claims = (data ?? []) as ClaimRow[];
      if (claims.length === 0) return [];

      const listings = await loadListings(claims);
      return claims.map((claim) => ({
        ...claim,
        listing: listings.get(`${claim.listing_type}:${claim.listing_id}`) ?? null,
      }));
    },
  });
}

export interface UpdateClaimedListingInput {
  listingType: ListingType;
  listingId: string;
  /** Only keys from OWNER_EDITABLE_FIELDS[listingType]; anything else is dropped here. */
  patch: Partial<Record<OwnerEditableField, string | null>>;
}

/**
 * Owner edit through update_claimed_listing. The patch is filtered to the
 * type's whitelist before it leaves the browser; the function refuses any
 * other key anyway, so this only keeps a stray field from failing the save.
 */
export function useUpdateClaimedListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ listingType, listingId, patch }: UpdateClaimedListingInput) => {
      const allowed: readonly string[] = OWNER_EDITABLE_FIELDS[listingType];
      const clean: Record<string, string | null> = {};
      for (const [key, value] of Object.entries(patch)) {
        if (allowed.includes(key) && value !== undefined) clean[key] = value;
      }

      const { data, error } = await supabase.rpc("update_claimed_listing" as never, {
        p_listing_type: listingType,
        p_listing_id: listingId,
        p_patch: clean,
      } as never);
      if (error) throw error;
      return data as unknown as boolean;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [MY_BUSINESS_CLAIMS_KEY] });
    },
  });
}

export interface ListingSearchResult {
  type: "restaurant" | "attraction";
  id: string;
  name: string;
  href: string;
}

/**
 * Find a restaurant or attraction by name, so an owner can reach its page and
 * the "Own this business?" claim button on it. Names only, five of each.
 */
export function useListingSearch(term: string) {
  const trimmed = term.trim().replace(/[%_\\]/g, "");

  return useQuery({
    queryKey: ["business-listing-search", trimmed],
    enabled: trimmed.length >= 2,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<ListingSearchResult[]> => {
      const pattern = `%${trimmed}%`;
      const [restaurants, attractions] = await Promise.all([
        supabase.from("restaurants").select("id, name, slug").ilike("name", pattern).limit(5),
        supabase.from("attractions").select("id, name").ilike("name", pattern).limit(5),
      ]);
      if (restaurants.error && attractions.error) throw restaurants.error;

      const results: ListingSearchResult[] = [];
      for (const r of restaurants.data ?? []) {
        results.push({
          type: "restaurant",
          id: r.id,
          name: r.name,
          href: `/restaurants/${r.slug || r.id}`,
        });
      }
      for (const a of attractions.data ?? []) {
        results.push({
          type: "attraction",
          id: a.id,
          name: a.name,
          href: `/attractions/${createSlug(a.name)}`,
        });
      }
      return results;
    },
  });
}
