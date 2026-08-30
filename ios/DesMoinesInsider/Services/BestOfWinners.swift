import Foundation

/// In-memory cache of current Best-Of winners (top vote-getter per category),
/// keyed by entity id → category name. Lets the unified content cards surface a
/// "Best Pizza" style award badge anywhere a winning restaurant/attraction
/// appears (IOS-PARITY-005).
///
/// Deliberately NOT @MainActor: `ContentCardData` adapters (`Restaurant.cardData`,
/// `Attraction.cardData`) read it synchronously and those run both in SwiftUI
/// view bodies (main actor) and in unit tests (nonisolated). It's `@Observable`
/// so cards re-render when winners load. Writes happen from a @MainActor
/// view-model after the Best-Of data loads.
@Observable
final class BestOfWinners {
    static let shared = BestOfWinners()

    private(set) var winnersByEntityId: [String: String] = [:]

    private init() {}

    /// The category name this entity currently wins, if any (e.g. "Best Pizza").
    func winnerLabel(forEntityId id: String) -> String? {
        winnersByEntityId[id]
    }

    /// Replace the winners map (entityId → category name).
    func update(_ map: [String: String]) {
        winnersByEntityId = map
    }
}
