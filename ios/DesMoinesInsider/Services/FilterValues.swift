import Foundation
import Supabase

/// Distinct filter-chip values, fetched server-side (IOS-AUDIT-PERF-025).
///
/// Three services each selected one column with no limit and de-duplicated into
/// a Swift Set: restaurant cuisines, restaurant locations, article categories
/// and hotel areas. Opening a filter sheet downloaded one row per table record
/// to end up with a few dozen strings.
///
/// The tables are small today - 478 restaurants, 63 hotels, 25 articles - so the
/// saving is a few hundred rows, not a few hundred thousand. It is worth doing
/// because the cost is proportional to the table and the result never is: the
/// payload grows with every restaurant added while the chip list stays at about
/// a dozen cuisines.
///
/// One helper rather than four copies of the same three lines, and one place to
/// change if the RPC's shape ever does.
enum FilterValues {
    /// Sources the `filter_values` RPC recognises. An unknown source returns
    /// zero rows rather than an error, so a typo shows an empty filter sheet
    /// instead of breaking the screen - which is the better failure, and also
    /// the quieter one, hence naming them here rather than passing strings.
    enum Source: String {
        case restaurantCuisine = "restaurant_cuisine"
        case restaurantLocation = "restaurant_location"
        case articleCategory = "article_category"
        case hotelArea = "hotel_area"
    }

    private struct Params: Encodable { let p_source: String }
    private struct Row: Decodable { let value: String }

    /// Values for one source, already trimmed, de-duplicated and sorted in SQL.
    static func fetch(source: Source, client: SupabaseClient) async throws -> [String] {
        let rows: [Row] = try await client
            .rpc("filter_values", params: Params(p_source: source.rawValue))
            .execute()
            .value
        return rows.map(\.value)
    }
}
