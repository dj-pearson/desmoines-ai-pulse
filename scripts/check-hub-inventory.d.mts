/**
 * Types for scripts/check-hub-inventory.mjs, which src/lib/__tests__/
 * hubInventoryFilters.test.ts imports. Without this the strict ratchet reports
 * TS7016 (implicit any module) for the test. Keep in step with the script's
 * exports.
 */
export interface HubInventoryQuery {
  route: string;
  params: URLSearchParams;
}

export declare const FREE_PRICE_FILTER: string;
export declare function readLocations(): { slug: string; or: string }[];
export declare function upcomingFloor(now: Date): string;
export declare function ongoingStartFilter(from: string): string;
export declare function notOverFilter(now: Date): string;
export declare function hubQueries(now?: Date): HubInventoryQuery[];
