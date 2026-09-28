import Foundation

/// Whether the Trip Planner's storage is reachable (IOS-DD-TRIP-PLANNER-01).
///
/// trip_plans and trip_plan_items are missing in production (the 2026-08-24
/// snapshot has neither, although their migration is ledgered), so every
/// generate call returned 500 trip_storage_unavailable while Home promoted the
/// card, the paywall sold it and the saved list read "none yet". There is no
/// remote-config payload to switch it off, so TripPlannerService probes the
/// table and the UI reads this. It un-pauses by itself once
/// 20261014000001_trip_planner_storage_d1.sql is applied; no new binary.
enum TripPlannerAvailability: Equatable {
    /// Not probed yet, or the probe failed for a reason that says nothing
    /// about the table (offline, timeout). Treated as available.
    case unknown
    case available
    /// The table does not exist. Planning, the saved list and the upsell
    /// are all switched off.
    case paused

    static let pausedMessage = "AI itineraries are paused while we fix saving. Nothing was used from your monthly allowance."

    /// 42P01 / PGRST205: no such relation, as opposed to the database being
    /// briefly unhappy. Same test the favorites fallback uses.
    static func isMissingStorage(_ error: Error) -> Bool {
        FavoritesService.isMissingTableError(error)
    }
}
