import Foundation

// MARK: - IOS-IA-006 · Personalized Home rail ordering
//
// Centralizes the [HomeRail] sequence so Home can lead with what a returning
// user cares about, WITHOUT touching layout (HomeRailsView already takes an
// `order:`). The strategy is:
//   • Deterministic — same signals always yield the same order (testable, no flake).
//   • Default-safe — guests / no-consent / no-signal get the canonical order
//     (HomeRail.allCases), so nothing regresses for new users.
//   • Consent-gated & first-party — only on-device signals (favorites, recently
//     viewed, swipe engagement) via ConsentService.analyticsConsent. No tracking.
//   • A/B-friendly — one `Strategy` switch so an experiment can swap the policy
//     in a single place.
enum HomeRailOrdering {

    enum Strategy: String {
        case canonical          // baseline: HomeRail.allCases
        case affinityWeighted   // lead with the user's most-engaged content type
    }

    /// The live strategy. Flip (or remote-config) this for an experiment.
    static let activeStrategy: Strategy = .affinityWeighted

    /// First-party, on-device inputs to the ordering decision.
    struct Signals: Equatable {
        var consentGranted: Bool
        var engaged: Bool                  // ForYou personalization active (5+ swipes)
        var favoriteEvents: Int
        var favoriteRestaurants: Int
        var favoriteAttractions: Int
        var recentEvents: Int
        var recentRestaurants: Int
        var recentAttractions: Int

        var hasAffinity: Bool {
            favoriteEvents + favoriteRestaurants + favoriteAttractions
                + recentEvents + recentRestaurants + recentAttractions > 0
        }
    }

    private enum ContentType: CaseIterable { case event, restaurant, attraction }

    /// Computes the personalized rail order for the given signals.
    static func order(for signals: Signals, strategy: Strategy = activeStrategy) -> [HomeRail] {
        let canonical = HomeRail.allCases
        guard strategy == .affinityWeighted, signals.consentGranted, signals.hasAffinity else {
            return canonical
        }

        // Affinity per content type: a save is a stronger signal than a view.
        let score: [ContentType: Int] = [
            .event: signals.favoriteEvents * 2 + signals.recentEvents,
            .restaurant: signals.favoriteRestaurants * 2 + signals.recentRestaurants,
            .attraction: signals.favoriteAttractions * 2 + signals.recentAttractions,
        ]

        // Rank types by score desc, stable tie-break by canonical type order.
        let ranked = ContentType.allCases.enumerated().sorted { lhs, rhs in
            let s0 = score[lhs.element] ?? 0, s1 = score[rhs.element] ?? 0
            return s0 != s1 ? s0 > s1 : lhs.offset < rhs.offset
        }.map(\.element)

        var typeRank: [ContentType: Int] = [:]
        for (i, t) in ranked.enumerated() { typeRank[t] = (i + 1) * 10 }

        // The For-You rail leads when personalization is active; otherwise it
        // slots just after the single highest-affinity content type (type ranks
        // are 10/20/30, so 15 falls between the 1st and 2nd type).
        let forYouRank = signals.engaged ? -10 : 15

        return canonical.sorted { a, b in
            let ra = rank(a, typeRank: typeRank, forYouRank: forYouRank)
            let rb = rank(b, typeRank: typeRank, forYouRank: forYouRank)
            if ra != rb { return ra < rb }
            return canonicalIndex(a) < canonicalIndex(b) // stable within a tier
        }
    }

    /// Reads the live on-device signals and returns the order. Call from Home.
    @MainActor
    static func current() -> [HomeRail] {
        let favorites = FavoritesService.shared
        let recents = RecentlyViewedService.shared.recent
        let signals = Signals(
            consentGranted: ConsentService.shared.analyticsConsent,
            engaged: ForYouService.shared.source == .forYou,
            favoriteEvents: favorites.favoriteEventIds.count,
            favoriteRestaurants: favorites.favoriteRestaurantIds.count,
            favoriteAttractions: favorites.favoriteAttractionIds.count,
            recentEvents: recents.filter { $0.type == "event" }.count,
            recentRestaurants: recents.filter { $0.type == "restaurant" }.count,
            recentAttractions: recents.filter { $0.type == "attraction" }.count
        )
        return order(for: signals)
    }

    // MARK: - Helpers

    private static func contentType(of rail: HomeRail) -> ContentType? {
        switch rail {
        case .forYou: return nil
        case .featured, .thisWeekend: return .event
        case .popularRestaurants: return .restaurant
        case .trendingAttractions: return .attraction
        }
    }

    private static func rank(_ rail: HomeRail, typeRank: [ContentType: Int], forYouRank: Int) -> Int {
        guard let type = contentType(of: rail) else { return forYouRank }
        return typeRank[type] ?? 0
    }

    private static func canonicalIndex(_ rail: HomeRail) -> Int {
        HomeRail.allCases.firstIndex(of: rail) ?? 0
    }
}
