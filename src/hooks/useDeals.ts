import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { handleError } from '@/lib/errorHandler';
import { createSlug } from '@/lib/slug';

export interface Deal {
  id: string;
  title: string;
  description: string | null;
  business_name: string;
  entity_type: string;
  entity_id: string | null;
  deal_type: string;
  discount_value: string | null;
  code: string | null;
  terms: string | null;
  start_date: string;
  end_date: string | null;
  image_url: string | null;
  is_featured: boolean;
  created_at: string;
  /**
   * Recurrence (migration 20260520000015). Subset of mon..sun; null or empty
   * means every day. Times are Postgres TIME ("16:00:00"), Des Moines wall
   * time, and are set as a pair or not at all (deals_recurrence_times_paired).
   */
  days_of_week?: string[] | null;
  start_time?: string | null;
  end_time?: string | null;
}

/**
 * The columns the card, the page and its JSON-LD read. `select('*')` also
 * shipped created_by (an admin's user id) and redemption_count to every
 * visitor. `code` stays in the list response until plan D6 moves it behind
 * the reveal.
 */
const DEAL_LIST_COLUMNS =
  'id, title, description, business_name, entity_type, entity_id, deal_type, discount_value, code, terms, start_date, end_date, image_url, is_featured, created_at, days_of_week, start_time, end_time';

/** Deals are listed and scheduled in Des Moines time, whatever the browser's zone. */
const DEALS_TIME_ZONE = 'America/Chicago';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const DAY_LABELS: Record<string, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};
/** Display order: the week starts on Monday for a happy-hour line. */
const WEEK_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The public read policy only returns deals inside their date window, but the
 * admin FOR ALL policy returns every row, so an admin browsing /deals saw
 * expired and scheduled deals the public never does. Saying the window in the
 * query makes the page list the same set for everyone.
 */
function activeWindowFilter(nowIso: string): { start: string; endOr: string } {
  return { start: nowIso, endOr: `end_date.is.null,end_date.gte.${nowIso}` };
}

export function useDeals(category?: string) {
  return useQuery({
    queryKey: ['deals', category],
    queryFn: async (): Promise<Deal[]> => {
      const active = activeWindowFilter(new Date().toISOString());
      let query = supabase
        .from('deals')
        .select(DEAL_LIST_COLUMNS)
        .lte('start_date', active.start)
        .or(active.endOr)
        .order('is_featured', { ascending: false })
        .order('end_date', { ascending: true });

      if (category && category !== 'all') {
        query = query.eq('entity_type', category);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as Deal[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Records a reveal. The card reveals the code before this resolves, and the
 * count it bumps is not rendered anywhere public, so there is nothing to
 * refetch on success. A failure must not hide the code the visitor already
 * sees; it goes to handleError and nowhere else.
 */
export function useClaimDeal() {
  return useMutation({
    mutationFn: async (dealId: string) => {
      const { error } = await supabase.rpc('increment_deal_redemption', { deal_id: dealId });
      if (error) throw error;
    },
    onError: (error) => {
      handleError(error, { component: 'Deals', action: 'claimDeal' });
    },
  });
}

/**
 * Venue links for a page of deals: one batched query per entity type.
 * restaurants carry a slug (falls back to id, as RestaurantsTonightStrip
 * does); attractions have no stored slug yet (plan D2), so their route slug is
 * derived from the name the same way the attractions pages build it; hotels
 * link /stay/<slug> (hotels.slug is in the 2026-08-24 snapshot) and a hotel
 * without a slug gets no link rather than a guessed one.
 */
export function useDealVenueLinks(deals: Deal[] | undefined) {
  const restaurantIds = uniqueIds(deals, 'restaurant');
  const attractionIds = uniqueIds(deals, 'attraction');
  const hotelIds = uniqueIds(deals, 'hotel');

  return useQuery({
    queryKey: ['deals', 'venues', restaurantIds, attractionIds, hotelIds],
    enabled: restaurantIds.length > 0 || attractionIds.length > 0 || hotelIds.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const links: Record<string, string> = {};
      const [restaurants, attractions, hotels] = await Promise.all([
        restaurantIds.length
          ? supabase.from('restaurants').select('id, slug').in('id', restaurantIds)
          : Promise.resolve({ data: [], error: null }),
        attractionIds.length
          ? supabase.from('attractions').select('id, name').in('id', attractionIds)
          : Promise.resolve({ data: [], error: null }),
        hotelIds.length
          ? supabase.from('hotels').select('id, slug').in('id', hotelIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (restaurants.error) throw restaurants.error;
      if (attractions.error) throw attractions.error;
      if (hotels.error) throw hotels.error;

      for (const row of (restaurants.data ?? []) as Array<{ id: string; slug: string | null }>) {
        links[`restaurant:${row.id}`] = `/restaurants/${row.slug || row.id}`;
      }
      for (const row of (attractions.data ?? []) as Array<{ id: string; name: string | null }>) {
        if (row.name) links[`attraction:${row.id}`] = `/attractions/${createSlug(row.name)}`;
      }
      for (const row of (hotels.data ?? []) as Array<{ id: string; slug: string | null }>) {
        if (row.slug) links[`hotel:${row.id}`] = `/stay/${row.slug}`;
      }
      return links;
    },
    staleTime: 10 * 60 * 1000,
  });
}

function uniqueIds(deals: Deal[] | undefined, entityType: string): string[] {
  const ids = new Set<string>();
  for (const d of deals ?? []) {
    if (d.entity_type === entityType && d.entity_id) ids.add(d.entity_id);
  }
  return [...ids].sort();
}

/** Key into the map useDealVenueLinks returns. */
export function dealVenueKey(deal: Pick<Deal, 'entity_type' | 'entity_id'>): string | null {
  return deal.entity_id ? `${deal.entity_type}:${deal.entity_id}` : null;
}

export function getDealTypeLabel(dealType: string): string {
  const labels: Record<string, string> = {
    percentage: '% Off',
    dollar_off: '$ Off',
    bogo: 'BOGO',
    free_item: 'Free Item',
    package: 'Package',
  };
  return labels[dealType] || dealType;
}

export interface DealBadge {
  text: string;
  variant: 'destructive' | 'secondary' | 'default';
}

/**
 * Urgency first, then "New this week".
 *
 * "New" used to fire for any deal ending 14+ days out, so a months-old deal
 * with a far end date read as new forever. It now means what it says: the
 * later of start_date and created_at falls in the last 7 days, and only when
 * no urgency badge applies.
 *
 * Urgency counts Des Moines calendar days, not 24-hour blocks: a deal ending
 * at 9 AM tomorrow "Ends tomorrow", not "Last day!" because it is under 24
 * hours away.
 */
export function getDealExpiryBadge(
  deal: Pick<Deal, 'end_date' | 'start_date' | 'created_at'>,
  now: Date = new Date(),
): DealBadge | null {
  if (deal.end_date) {
    const end = new Date(deal.end_date);
    if (Number.isFinite(end.getTime())) {
      if (end.getTime() <= now.getTime()) return null;
      const days = desMoinesDaysBetween(now, end);
      if (days === 0) {
        const endMinutes = desMoinesClock(end).minutes;
        // An end stored as 23:59 CT means "through today"; don't print the minute.
        const text = endMinutes >= 23 * 60 + 59 ? 'Ends today' : `Ends today at ${clockLabel(endMinutes)}`;
        return { text, variant: 'destructive' };
      }
      if (days === 1) return { text: 'Ends tomorrow', variant: 'destructive' };
      if (days <= 3) return { text: `Ends in ${days} days`, variant: 'destructive' };
      if (days <= 7) return { text: `${days} days left`, variant: 'secondary' };
    }
  }

  const stamps = [deal.start_date, deal.created_at]
    .map((s) => (s ? new Date(s).getTime() : NaN))
    .filter((t) => Number.isFinite(t));
  if (stamps.length === 0) return null;
  const newest = Math.max(...stamps);
  const age = now.getTime() - newest;
  if (age >= 0 && age <= 7 * DAY_MS) return { text: 'New this week', variant: 'default' };
  return null;
}

// ---------------------------------------------------------------------------
// Schedule ("Tue-Thu, 4-6 PM") and "Live now"
// ---------------------------------------------------------------------------

/** Minutes past midnight from a Postgres TIME string, or null. */
function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

function dealDays(deal: Pick<Deal, 'days_of_week'>): string[] {
  return (deal.days_of_week ?? []).filter((d) => d in DAY_LABELS);
}

function formatDays(days: string[]): string | null {
  if (days.length === 0 || days.length === 7) return days.length === 7 ? 'Daily' : null;
  const idx = WEEK_ORDER.map((d, i) => (days.includes(d) ? i : -1)).filter((i) => i >= 0);
  const runs: Array<[number, number]> = [];
  for (const i of idx) {
    const last = runs[runs.length - 1];
    if (last && last[1] === i - 1) last[1] = i;
    else runs.push([i, i]);
  }
  return runs
    .map(([a, b]) => {
      const from = DAY_LABELS[WEEK_ORDER[a]];
      const to = DAY_LABELS[WEEK_ORDER[b]];
      if (a === b) return from;
      if (b === a + 1) return `${from}, ${to}`;
      return `${from}-${to}`;
    })
    .join(', ');
}

function clock(minutes: number): { text: string; meridiem: 'AM' | 'PM' } {
  const m = minutes % (24 * 60);
  const h24 = Math.floor(m / 60);
  const mins = m % 60;
  const meridiem = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { text: mins ? `${h12}:${String(mins).padStart(2, '0')}` : String(h12), meridiem };
}

/** "9 AM", "4:30 PM". */
function clockLabel(minutes: number): string {
  const c = clock(minutes);
  return `${c.text} ${c.meridiem}`;
}

function formatTimes(start: number, end: number): string {
  const a = clock(start);
  const b = clock(end);
  if (a.meridiem === b.meridiem) return `${a.text}-${b.text} ${b.meridiem}`;
  return `${a.text} ${a.meridiem}-${b.text} ${b.meridiem}`;
}

/**
 * The deal's recurring window as a short line, e.g. "Tue-Thu, 4-6 PM".
 * Null when the deal has no recurrence (it runs across its whole date range).
 */
export function formatDealSchedule(
  deal: Pick<Deal, 'days_of_week' | 'start_time' | 'end_time'>,
): string | null {
  const days = formatDays(dealDays(deal));
  const start = parseTime(deal.start_time);
  const end = parseTime(deal.end_time);
  const times = start !== null && end !== null ? formatTimes(start, end) : null;
  if (days && times) return `${days}, ${times}`;
  if (times) return `Daily, ${times}`;
  return days;
}

/** True when the deal has a day or time recurrence to evaluate. */
export function hasDealSchedule(deal: Pick<Deal, 'days_of_week' | 'start_time' | 'end_time'>): boolean {
  return dealDays(deal).length > 0 || (parseTime(deal.start_time) !== null && parseTime(deal.end_time) !== null);
}

/** Weekday key and minutes past midnight in Des Moines for an instant. */
export function desMoinesClock(now: Date): { day: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DEALS_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const day = get('weekday').slice(0, 3).toLowerCase();
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  return { day, minutes: hour * 60 + minute };
}

/** Des Moines calendar date of an instant, as YYYY-MM-DD. */
function desMoinesDate(at: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DEALS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** Whole Des Moines calendar days from `from` to `to` (0 = same date). */
function desMoinesDaysBetween(from: Date, to: Date): number {
  const a = Date.parse(`${desMoinesDate(from)}T00:00:00Z`);
  const b = Date.parse(`${desMoinesDate(to)}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

function previousDay(day: string): string {
  const i = DAY_KEYS.indexOf(day as (typeof DAY_KEYS)[number]);
  return DAY_KEYS[(i + 6) % 7];
}

function inDateRange(deal: Pick<Deal, 'start_date' | 'end_date'>, now: Date): boolean {
  const t = now.getTime();
  if (deal.start_date && new Date(deal.start_date).getTime() > t) return false;
  if (deal.end_date && new Date(deal.end_date).getTime() < t) return false;
  return true;
}

/**
 * Whether the deal is redeemable at `now`, Des Moines time. A window that
 * crosses midnight (21:00-02:00) belongs to the day it starts on. A deal with
 * no recurrence is live across its whole date range.
 */
export function isDealLiveAt(
  deal: Pick<Deal, 'days_of_week' | 'start_time' | 'end_time' | 'start_date' | 'end_date'>,
  now: Date = new Date(),
): boolean {
  if (!inDateRange(deal, now)) return false;
  const days = dealDays(deal);
  const onDay = (d: string) => days.length === 0 || days.includes(d);
  const { day, minutes } = desMoinesClock(now);
  const start = parseTime(deal.start_time);
  const end = parseTime(deal.end_time);
  if (start === null || end === null) return onDay(day);
  if (start < end) return onDay(day) && minutes >= start && minutes < end;
  // Overnight window.
  return (onDay(day) && minutes >= start) || (onDay(previousDay(day)) && minutes < end);
}

/**
 * Whether the deal runs at some point on today's Des Moines date, or is
 * running right now. The second half matters for an overnight window: a Fri
 * 9 PM-2 AM deal is live at 1 AM Saturday (isDealLiveAt says so), and it used
 * to be missing from Today at that minute because only Saturday's weekday was
 * checked.
 */
export function isDealOnToday(
  deal: Pick<Deal, 'days_of_week' | 'start_time' | 'end_time' | 'start_date' | 'end_date'>,
  now: Date = new Date(),
): boolean {
  if (!inDateRange(deal, now)) return false;
  const days = dealDays(deal);
  if (days.length === 0 || days.includes(desMoinesClock(now).day)) return true;
  return isDealLiveAt(deal, now);
}

/**
 * Where a deal with a daily time window stands at `now`, from the same clock
 * the Running now badge uses: running, starting later today, or done for
 * today. Null when the deal has no time window or doesn't run today.
 */
export type DealTodayStatus =
  | { kind: 'running' }
  | { kind: 'later'; text: string }
  | { kind: 'ended'; text: string };

export function dealTodayStatus(
  deal: Pick<Deal, 'days_of_week' | 'start_time' | 'end_time' | 'start_date' | 'end_date'>,
  now: Date = new Date(),
): DealTodayStatus | null {
  const start = parseTime(deal.start_time);
  const end = parseTime(deal.end_time);
  if (start === null || end === null) return null;
  if (!isDealOnToday(deal, now)) return null;
  if (isDealLiveAt(deal, now)) return { kind: 'running' };
  const days = dealDays(deal);
  const { day, minutes } = desMoinesClock(now);
  const runsToday = days.length === 0 || days.includes(day);
  if (!runsToday) return null;
  if (minutes < start) return { kind: 'later', text: `Starts ${clockLabel(start)}` };
  return { kind: 'ended', text: 'Ended for today' };
}

export type DealWhen = 'all' | 'now' | 'today';

export function normalizeDealWhen(value: string | null | undefined): DealWhen {
  return value === 'now' || value === 'today' ? value : 'all';
}

/**
 * Every value applies the date window, including 'all': the page re-runs this
 * each minute, and a deal that expires while the page is open should leave the
 * list then, not at the next refetch.
 */
export function filterDealsByWhen(deals: Deal[], when: DealWhen, now: Date = new Date()): Deal[] {
  if (when === 'now') return deals.filter((d) => isDealLiveAt(d, now));
  if (when === 'today') return deals.filter((d) => isDealOnToday(d, now));
  return deals.filter((d) => inDateRange(d, now));
}
