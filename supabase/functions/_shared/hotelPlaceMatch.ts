/**
 * Decide whether a Places Text Search result IS one of our hotels.
 *
 * WHY THIS IS STRICT. bulk-update-restaurants takes the first result whose name
 * contains the first word of ours, and falls back to the first result outright.
 * For hotels that rule is wrong most of the time: the corpus is chains, and
 * "Hampton Inn" matches the Hampton Inn in Ankeny, Urbandale, Waukee and West
 * Des Moines equally. A wrong match is not a cosmetic miss here. The place id
 * is stored indefinitely, and the photo, the attribution and every later
 * refresh follow it, so a guessed id shows another property's building on
 * this hotel's page until someone notices.
 *
 * THE RULE. The street address decides, the name confirms:
 *   high    street number equal, a street-name word in common, the name
 *           agrees, and Places calls it lodging
 *   medium  our row has no street number, the name agrees strongly, and the
 *           ZIP or city agrees (written only when the caller allows medium)
 *   low     anything else, with the reasons. Never written.
 * Two different places that both score high is "ambiguous", also never written.
 *
 * Pure: no fetch, no Deno globals, so the test reaches all of it.
 */

import { isPlacesMediaUrl, photoProvenance, type PlacesPhotoLike } from "./placesPhoto.ts";

export type MatchConfidence = "high" | "medium" | "low";

export interface HotelForMatch {
  name: string;
  address: string | null;
  city: string | null;
  state?: string | null;
  zip?: string | null;
}

export interface PlaceCandidate {
  id: string;
  displayName?: { text?: string } | null;
  formattedAddress?: string | null;
  types?: string[] | null;
  businessStatus?: string | null;
}

export interface CandidateVerdict {
  placeId: string;
  placeName: string;
  formattedAddress: string;
  confidence: MatchConfidence;
  /** 0..1, share of the shorter name's significant words found in the other. */
  nameScore: number;
  address: "match" | "mismatch" | "unknown";
  reasons: string[];
}

/** Name agreement needed alongside a matching street address. */
export const NAME_SCORE_WITH_ADDRESS = 0.5;
/** Name agreement needed when our row has no street number to check. */
export const NAME_SCORE_WITHOUT_ADDRESS = 0.8;

/** Words that say "hotel" rather than WHICH hotel. */
const GENERIC_NAME_WORDS = new Set([
  "the", "a", "an", "and", "by", "at", "of", "hotel", "hotels", "motel", "resort",
]);

const STREET_ABBREVIATIONS: Record<string, string> = {
  street: "st", avenue: "ave", av: "ave", road: "rd", drive: "dr", parkway: "pkwy",
  boulevard: "blvd", lane: "ln", court: "ct", place: "pl", highway: "hwy",
  circle: "cir", terrace: "ter", trail: "trl", way: "way", square: "sq",
  north: "n", south: "s", east: "e", west: "w",
  northwest: "nw", northeast: "ne", southwest: "sw", southeast: "se",
};

/** Words that do not identify a street on their own. */
const STREET_NOISE = new Set([
  "st", "ave", "rd", "dr", "pkwy", "blvd", "ln", "ct", "pl", "hwy", "cir", "ter", "trl", "way", "sq",
  "n", "s", "e", "w", "nw", "ne", "sw", "se", "suite", "ste", "unit",
]);

function fold(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameWords(name: string): string[] {
  return fold(name).split(" ").filter((w) => w && !GENERIC_NAME_WORDS.has(w));
}

/**
 * Share of the SHORTER name's words present in the longer one. Containment
 * rather than Jaccard because Places appends the parent brand ("Hampton Inn &
 * Suites Des Moines Downtown" vs "... by Hilton"): extra words on one side are
 * normal, missing words on the shorter side are not.
 */
export function nameScore(ours: string, theirs: string): number {
  const a = new Set(nameWords(ours));
  const b = new Set(nameWords(theirs));
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let hit = 0;
  for (const w of small) if (large.has(w)) hit++;
  return hit / small.size;
}

interface StreetParts {
  number: string | null;
  words: string[];
}

/** The street line: the part before the first comma, number split off. */
export function streetParts(address: string | null | undefined): StreetParts {
  if (!address) return { number: null, words: [] };
  const line = fold(address.split(",")[0] ?? "");
  const m = line.match(/^(\d+[a-z]?)\s+(.*)$/);
  const rest = m ? m[2] : line;
  const words = rest
    .split(" ")
    .map((w) => STREET_ABBREVIATIONS[w] ?? w)
    .map((w) => w.replace(/^(\d+)(st|nd|rd|th)$/, "$1"))
    .filter(Boolean);
  return { number: m ? m[1] : null, words };
}

function zipOf(s: string | null | undefined): string | null {
  return s?.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1] ?? null;
}

export function judgeCandidate(hotel: HotelForMatch, place: PlaceCandidate): CandidateVerdict {
  const placeName = place.displayName?.text ?? "";
  const formatted = place.formattedAddress ?? "";
  const reasons: string[] = [];

  const score = nameScore(hotel.name, placeName);
  const ours = streetParts(hotel.address);
  const theirs = streetParts(formatted);

  let address: CandidateVerdict["address"];
  if (!ours.number) {
    address = "unknown";
    reasons.push("our address has no street number to check");
  } else if (!theirs.number) {
    address = "unknown";
    reasons.push("Places address has no street number");
  } else if (ours.number !== theirs.number) {
    address = "mismatch";
    reasons.push(`street number ${ours.number} vs ${theirs.number}`);
  } else {
    const ourStreet = new Set(ours.words.filter((w) => !STREET_NOISE.has(w)));
    const shared = theirs.words.filter((w) => !STREET_NOISE.has(w) && ourStreet.has(w));
    // A number with no identifying street word on our side ("100 E Ave") is
    // taken on the number alone; one with words that share nothing is a
    // different street with the same number.
    if (ourStreet.size === 0 || shared.length > 0) {
      address = "match";
    } else {
      address = "mismatch";
      reasons.push(`same number, different street ("${ours.words.join(" ")}" vs "${theirs.words.join(" ")}")`);
    }
  }

  const isLodging = (place.types ?? []).includes("lodging");
  if (!isLodging) reasons.push(`Places does not type it as lodging (${(place.types ?? []).join(", ") || "no types"})`);
  if (place.businessStatus === "CLOSED_PERMANENTLY") reasons.push("Places says it is permanently closed");

  const ourZip = zipOf(hotel.zip) ?? zipOf(hotel.address);
  const theirZip = zipOf(formatted);
  const zipAgrees = !!ourZip && ourZip === theirZip;
  const cityAgrees = !!hotel.city && fold(formatted).includes(fold(hotel.city));

  let confidence: MatchConfidence = "low";
  const closed = place.businessStatus === "CLOSED_PERMANENTLY";
  if (!closed && isLodging) {
    if (address === "match" && score >= NAME_SCORE_WITH_ADDRESS) {
      confidence = "high";
    } else if (address === "unknown" && score >= NAME_SCORE_WITHOUT_ADDRESS && (zipAgrees || cityAgrees)) {
      confidence = "medium";
    }
  }
  if (confidence === "low") {
    if (address === "match" && score < NAME_SCORE_WITH_ADDRESS) {
      reasons.push(`name agreement ${score.toFixed(2)} is under ${NAME_SCORE_WITH_ADDRESS}`);
    }
    if (address === "unknown" && score < NAME_SCORE_WITHOUT_ADDRESS) {
      reasons.push(`name agreement ${score.toFixed(2)} is under ${NAME_SCORE_WITHOUT_ADDRESS} with no address to confirm it`);
    }
    if (address === "unknown" && !zipAgrees && !cityAgrees) reasons.push("neither ZIP nor city agrees");
  }

  return {
    placeId: place.id,
    placeName,
    formattedAddress: formatted,
    confidence,
    nameScore: Math.round(score * 100) / 100,
    address,
    reasons,
  };
}

export interface MatchDecision {
  /** The candidate to write, or null when nothing may be written. */
  accepted: CandidateVerdict | null;
  /** The best candidate considered, for the report, accepted or not. */
  best: CandidateVerdict | null;
  status: "matched" | "refused" | "ambiguous" | "no_candidates";
  reasons: string[];
  candidates: CandidateVerdict[];
}

const RANK: Record<MatchConfidence, number> = { high: 2, medium: 1, low: 0 };

/**
 * Pick at most one place for a hotel. `allowMedium` lets a medium match be
 * written; a low one never is, and neither is a tie between two places.
 */
export function decideHotelMatch(
  hotel: HotelForMatch,
  places: PlaceCandidate[],
  { allowMedium = false }: { allowMedium?: boolean } = {},
): MatchDecision {
  const candidates = places.filter((p) => p?.id).map((p) => judgeCandidate(hotel, p));
  if (candidates.length === 0) {
    return { accepted: null, best: null, status: "no_candidates", reasons: ["Places returned no candidates"], candidates };
  }
  const sorted = [...candidates].sort(
    (a, b) => RANK[b.confidence] - RANK[a.confidence] || b.nameScore - a.nameScore,
  );
  const best = sorted[0];
  const acceptable = (c: CandidateVerdict) => c.confidence === "high" || (allowMedium && c.confidence === "medium");

  if (!acceptable(best)) {
    const reasons = best.confidence === "medium"
      ? ["medium confidence; pass allowMedium to write it", ...best.reasons]
      : best.reasons.length ? best.reasons : ["low confidence"];
    return { accepted: null, best, status: "refused", reasons, candidates: sorted };
  }

  const rivals = sorted.filter((c) => c !== best && c.placeId !== best.placeId && RANK[c.confidence] === RANK[best.confidence]);
  if (rivals.length > 0) {
    return {
      accepted: null,
      best,
      status: "ambiguous",
      reasons: [`${rivals.length + 1} different places score ${best.confidence}: ${[best, ...rivals].map((c) => c.placeId).join(", ")}`],
      candidates: sorted,
    };
  }
  return { accepted: best, best, status: "matched", reasons: best.reasons, candidates: sorted };
}

// ---------------------------------------------------------------------------
// The write for an accepted match (enrich-hotels-places)
// ---------------------------------------------------------------------------

/** The hotel columns the enricher reads. */
export interface HotelPlaceRow extends HotelForMatch {
  id: string;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
}

/** A Text Search place with the fields SEARCH_FIELD_MASK asks for. */
export interface SearchPlace extends PlaceCandidate {
  location?: { latitude?: number; longitude?: number };
  nationalPhoneNumber?: string;
  websiteUri?: string;
  photos?: PlacesPhotoLike[];
}

const empty = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/**
 * The update for an accepted match. Exported shape, pure, so the test can pin
 * "only empty fields are filled" without a network.
 */
export function buildHotelPlaceUpdate(
  hotel: HotelPlaceRow,
  place: SearchPlace,
  nowIso: string,
): Record<string, unknown> {
  const update: Record<string, unknown> = { google_place_id: place.id };

  const provenance = photoProvenance(place.photos, nowIso);
  if (provenance) Object.assign(update, provenance);

  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  if (hotel.latitude == null && hotel.longitude == null && Number.isFinite(lat) && Number.isFinite(lng)) {
    update.latitude = lat;
    update.longitude = lng;
  }
  if (empty(hotel.phone) && place.nationalPhoneNumber) update.phone = place.nationalPhoneNumber;
  if (empty(hotel.website) && place.websiteUri && /^https?:\/\//i.test(place.websiteUri)) {
    update.website = place.websiteUri;
  }

  // Last-line guard, as in bulk-update-restaurants: no Places media URL leaves
  // this function in any column.
  for (const [k, v] of Object.entries(update)) {
    if (isPlacesMediaUrl(v)) delete update[k];
  }
  return update;
}

