import Foundation

/// The Saved tab's filter (IOS-DD-SAVED-19).
enum SavedSegment: String, CaseIterable, Identifiable {
    case all, events, dining, places, guides

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all: return "All"
        case .events: return "Events"
        case .dining: return "Dining"
        case .places: return "Places"
        case .guides: return "Guides"
        }
    }

    static func showsEvents(_ segment: SavedSegment) -> Bool { segment == .all || segment == .events }
    static func showsDining(_ segment: SavedSegment) -> Bool { segment == .all || segment == .dining }
    static func showsPlaces(_ segment: SavedSegment) -> Bool { segment == .all || segment == .places }
    static func showsGuides(_ segment: SavedSegment) -> Bool { segment == .all || segment == .guides }
}

/// Holds the Saved tab's segment so the Dashboard tiles can open Saved on the
/// right one.
@MainActor
@Observable
final class SavedTabRouter {
    static let shared = SavedTabRouter()

    var segment: SavedSegment = .all

    private init() {}
}
