import Foundation

// MARK: - IOS-ADS-011 · Sponsored arrangement
//
// Pure, deterministic reordering used by feeds: actively-sponsored items are
// surfaced to the front (clearly labeled by the card itself via the unified
// ContentCard's ring + "Sponsored" badge), capped so they never dominate the
// first screen, with organic order otherwise preserved.
//
// Kept side-effect-free so it's trivially unit-testable (see
// SponsoredArrangerTests) and so the same logic can drive Home rails and the
// Events / Dining lists identically.
enum SponsoredArranger {
    /// Returns `items` with up to `maxFront` actively-sponsored entries pulled to
    /// the front, in their original relative order; everything else keeps its
    /// order. When nothing is sponsored the input is returned unchanged (so the
    /// organic order is never disturbed needlessly).
    static func arrange<T>(
        _ items: [T],
        isSponsored: (T) -> Bool,
        maxFront: Int = AdConfig.maxSponsoredAtFront
    ) -> [T] {
        guard maxFront > 0, items.count > 1 else { return items }

        var promoted: [T] = []
        var remainder: [T] = []
        for item in items {
            if isSponsored(item) && promoted.count < maxFront {
                promoted.append(item)
            } else {
                remainder.append(item)
            }
        }
        return promoted.isEmpty ? items : promoted + remainder
    }
}
