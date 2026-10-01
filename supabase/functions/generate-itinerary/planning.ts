// Pure helpers for generate-itinerary (IOS-DD-TRIP-PLANNER-06 / -08).
//
// Kept out of index.ts so they can be tested offline: the request is
// validated and clamped before anything is counted or billed, the event
// window is Des Moines days rather than UTC days, the model's items are
// forced into what trip_plan_items accepts, and the monthly quota uses the
// Central-time month the iOS meter and get_trip_planner_usage() use.

import { centralWallClockFromUtc, centralWallClockToUtc } from "../_shared/centralTime.ts";

export const MAX_TRIP_DAYS = 14;

const BUDGETS = ["budget", "moderate", "splurge", "any"] as const;
const PACES = ["relaxed", "moderate", "packed"] as const;
const ITEM_TYPES = ["event", "restaurant", "attraction", "custom", "transport", "break"] as const;

export type Budget = typeof BUDGETS[number];
export type Pace = typeof PACES[number];
export type ItemType = typeof ITEM_TYPES[number];

export interface TripPreferencesInput {
  interests?: string[];
  budget?: Budget;
  pace?: Pace;
  groupSize?: number;
  hasChildren?: boolean;
  childAges?: number[];
  accessibilityNeeds?: string[];
  dietaryRestrictions?: string[];
  mustSee?: string[];
  avoidCategories?: string[];
  neighborhood?: string;
}

export interface ValidTripRequest {
  startDate: string;
  endDate: string;
  numDays: number;
  preferences: TripPreferencesInput;
}

export type ValidationResult =
  | { ok: true; value: ValidTripRequest }
  | { ok: false; code: string; error: string };

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Days between two YYYY-MM-DD strings, as calendar days (no DST involved). */
function dayNumber(ymd: string): number | null {
  if (!YMD.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  // Rejects 2026-02-30 and friends, which Date.UTC rolls forward silently.
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return Math.round(t / 86_400_000);
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function strings(value: unknown, maxCount: number, maxLength: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().slice(0, maxLength))
    .filter((v) => v.length > 0)
    .slice(0, maxCount);
  return out.length > 0 ? out : undefined;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : undefined;
}

/**
 * Validates the dates (rejecting) and clamps the preference fields (never
 * rejecting, so an older client sending a long list still gets a plan).
 * `todayCentral` is today's YYYY-MM-DD in Des Moines.
 */
export function validateTripRequest(body: unknown, todayCentral: string): ValidationResult {
  const b = (body && typeof body === "object") ? body as Record<string, unknown> : {};
  const startDate = typeof b.startDate === "string" ? b.startDate : "";
  const endDate = typeof b.endDate === "string" ? b.endDate : "";

  const start = dayNumber(startDate);
  const end = dayNumber(endDate);
  const today = dayNumber(todayCentral);
  if (start === null || end === null) {
    return { ok: false, code: "invalid_dates", error: "Dates must be YYYY-MM-DD." };
  }
  if (end < start) {
    return { ok: false, code: "invalid_dates", error: "The trip has to end on or after its first day." };
  }
  const numDays = end - start + 1;
  if (numDays > MAX_TRIP_DAYS) {
    return { ok: false, code: "trip_too_long", error: "Trips can be up to 14 days." };
  }
  if (today !== null && start < today - 1) {
    return { ok: false, code: "start_in_past", error: "Pick a start date from today on." };
  }
  if (today !== null && start > today + 365) {
    return { ok: false, code: "start_too_far", error: "Trips can start up to a year from today." };
  }

  const p = (b.preferences && typeof b.preferences === "object")
    ? b.preferences as Record<string, unknown>
    : {};

  const preferences: TripPreferencesInput = {};
  const interests = strings(p.interests, 10, 40);
  if (interests) preferences.interests = interests;
  const avoid = strings(p.avoidCategories, 10, 40);
  if (avoid) preferences.avoidCategories = avoid;
  const mustSee = strings(p.mustSee, 5, 100);
  if (mustSee) preferences.mustSee = mustSee;
  const access = strings(p.accessibilityNeeds, 10, 50);
  if (access) preferences.accessibilityNeeds = access;
  const diet = strings(p.dietaryRestrictions, 10, 50);
  if (diet) preferences.dietaryRestrictions = diet;

  if (typeof p.groupSize === "number" && Number.isFinite(p.groupSize)) {
    preferences.groupSize = Math.min(20, Math.max(1, Math.round(p.groupSize)));
  }
  if (typeof p.hasChildren === "boolean") preferences.hasChildren = p.hasChildren;
  if (Array.isArray(p.childAges)) {
    const ages = p.childAges
      .filter((a): a is number => typeof a === "number" && Number.isFinite(a))
      .map((a) => Math.min(17, Math.max(0, Math.round(a))))
      .slice(0, 10);
    if (ages.length > 0) preferences.childAges = ages;
  }
  const budget = oneOf(p.budget, BUDGETS);
  if (budget) preferences.budget = budget;
  const pace = oneOf(p.pace, PACES);
  if (pace) preferences.pace = pace;
  if (typeof p.neighborhood === "string") {
    const n = p.neighborhood.trim().slice(0, 60);
    if (n.length > 0) preferences.neighborhood = n;
  }

  return { ok: true, value: { startDate, endDate, numDays, preferences } };
}

/** Today's date in Des Moines, YYYY-MM-DD. */
export function centralToday(now: Date): string {
  return centralWallClockFromUtc(now).slice(0, 10);
}

/**
 * The UTC instants bounding the trip's Des Moines days: start 00:00 Central
 * to the day after the end, 00:00 Central (exclusive). events.date is a
 * timestamptz, so comparing it with bare dates ran the window in UTC and
 * dropped a Friday 7pm show from a Friday-only trip.
 */
export function centralEventWindow(startDate: string, endDate: string): { fromIso: string; toIso: string } {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = addDays(endDate, 1).split("-").map(Number);
  const from = centralWallClockToUtc(sy, sm, sd, 0, 0);
  const to = centralWallClockToUtc(ey, em, ed, 0, 0);
  if (!from || !to) throw new Error("centralEventWindow: invalid date");
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

/** 00:00 on the 1st of the current Central-time month, as a UTC instant. */
export function centralMonthStartUtc(now: Date): Date {
  const [y, m] = centralToday(now).split("-").map(Number);
  const start = centralWallClockToUtc(y, m, 1, 0, 0);
  if (!start) throw new Error("centralMonthStartUtc: invalid date");
  return start;
}

export interface ModelItem {
  dayNumber?: unknown;
  orderIndex?: unknown;
  itemType?: unknown;
  contentId?: unknown;
  contentType?: unknown;
  customTitle?: unknown;
  customDescription?: unknown;
  customLocation?: unknown;
  title?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  durationMinutes?: unknown;
  notes?: unknown;
  estimatedCost?: unknown;
  aiReason?: unknown;
}

export interface SanitizedItem {
  dayNumber: number;
  orderIndex: number;
  itemType: ItemType;
  contentType: "event" | "restaurant" | "attraction" | null;
  contentId: string | null;
  customTitle: string | null;
  customDescription: string | null;
  customLocation: string | null;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  notes: string | null;
  estimatedCost: string | null;
  aiReason: string | null;
}

export interface KnownIds {
  event: Set<string>;
  restaurant: Set<string>;
  attraction: Set<string>;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null);
const TIME = /^\d{1,2}:\d{2}(:\d{2})?$/;

/**
 * Forces the model's items into what trip_plan_items accepts. A hallucinated
 * id used to fail the FK and roll back a plan that had already been billed;
 * now that stop becomes a custom one with its title kept. Items with no title
 * anywhere are dropped, since the row would render as "Stop".
 */
export function sanitizeItems(items: unknown, ids: KnownIds, numDays: number): SanitizedItem[] {
  if (!Array.isArray(items)) return [];
  const out: SanitizedItem[] = [];
  for (const raw of items as ModelItem[]) {
    if (!raw || typeof raw !== "object") continue;

    let itemType: ItemType = oneOf(raw.itemType, ITEM_TYPES) ?? "custom";
    const declaredType = oneOf(raw.contentType, ["event", "restaurant", "attraction"] as const) ?? null;
    const id = str(raw.contentId);
    const linked = declaredType !== null && id !== null && ids[declaredType].has(id);

    let customTitle = str(raw.customTitle);
    if (!linked && (declaredType !== null || id !== null || itemType === "event" || itemType === "restaurant" || itemType === "attraction")) {
      // Unknown or missing listing: keep the stop, as a custom one.
      itemType = "custom";
      customTitle = customTitle ?? str(raw.title);
    }
    if (!linked && !customTitle) {
      customTitle = str(raw.title);
    }
    if (!linked && !customTitle) continue;

    const day = typeof raw.dayNumber === "number" && Number.isFinite(raw.dayNumber)
      ? Math.min(numDays, Math.max(1, Math.round(raw.dayNumber)))
      : 1;
    const order = typeof raw.orderIndex === "number" && Number.isFinite(raw.orderIndex)
      ? Math.round(raw.orderIndex)
      : out.length;
    const minutes = typeof raw.durationMinutes === "number" && Number.isFinite(raw.durationMinutes)
      ? Math.min(24 * 60, Math.max(0, Math.round(raw.durationMinutes)))
      : null;
    const startTime = str(raw.startTime);
    const endTime = str(raw.endTime);

    out.push({
      dayNumber: day,
      orderIndex: order,
      itemType,
      contentType: linked ? declaredType : null,
      contentId: linked ? id : null,
      customTitle: linked ? str(raw.customTitle) : customTitle,
      customDescription: str(raw.customDescription),
      customLocation: str(raw.customLocation),
      startTime: startTime && TIME.test(startTime) ? startTime : null,
      endTime: endTime && TIME.test(endTime) ? endTime : null,
      durationMinutes: minutes,
      notes: str(raw.notes),
      estimatedCost: str(raw.estimatedCost),
      aiReason: str(raw.aiReason),
    });
  }
  return out;
}

/** Keeps only string entries; tips and packing_list are stored as jsonb arrays. */
export function stringList(value: unknown, max = 20): string[] | null {
  const list = strings(value, max, 300);
  return list ?? null;
}
