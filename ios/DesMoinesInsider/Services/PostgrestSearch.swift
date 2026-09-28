import Foundation

/// Builds a PostgREST `or=` search across several columns from free text
/// (IOS-DD-GUIDES-16).
///
/// Hotels and Articles interpolated the raw text into
/// `name.ilike.%<text>%`. A comma or a parenthesis in the query split or
/// closed the logic tree (a 400, shown as an error), and `%`/`_` acted as
/// wildcards. Each clause now uses EventsService.ilikeContains, the quoted and
/// LIKE-escaped form group 1 added for exactly this.
enum PostgrestSearch {
    static let maxQueryLength = 100

    /// `col1.ilike."%q%",col2.ilike."%q%"`, or nil when the query is blank
    /// once trimmed and stripped of `*` (PostgREST reads `*` as `%`).
    static func searchOrFilter(columns: [String], query: String) -> String? {
        let cleaned = query
            .replacingOccurrences(of: "*", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let q = String(cleaned.prefix(maxQueryLength))
        guard !q.isEmpty, !columns.isEmpty else { return nil }
        let pattern = EventsService.ilikeContains(q)
        return columns.map { "\($0).ilike." + pattern }.joined(separator: ",")
    }
}
