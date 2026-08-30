import SwiftUI

/// A curated content hub (IOS-PARITY-006). Music / Sports / Outdoors each map to
/// a `ContentHub` config that drives one generic `ContentHubView` — mixing
/// upcoming relevant events, themed attractions, and featured dining, parity
/// with the web /music, /sports, /outdoors hubs.
enum ContentHub: String, CaseIterable, Identifiable {
    case music
    case sports
    case outdoors

    var id: String { rawValue }

    /// Maps from the Discover-hub destination so deep links route here.
    init?(destination: DiscoverDestination) {
        switch destination {
        case .music: self = .music
        case .sports: self = .sports
        case .outdoors: self = .outdoors
        default: return nil
        }
    }

    var title: String {
        switch self {
        case .music: return "Live Music"
        case .sports: return "Sports"
        case .outdoors: return "Trails & Outdoors"
        }
    }

    /// Editorial blurb shown in the hero (parity with the web hub intros).
    var blurb: String {
        switch self {
        case .music:
            return "Your guide to the Des Moines music scene — tonight's shows, venue guides, and upcoming concerts all in one place."
        case .sports:
            return "Des Moines is one of the best minor-league sports markets in America. From Iowa Cubs baseball to Iowa Wild hockey, find your next gameday."
        case .outdoors:
            return "Explore the metro's incredible parks and 800+ miles of trails — from the High Trestle Trail Bridge to peaceful urban loops."
        }
    }

    var systemImage: String {
        switch self {
        case .music: return "music.note"
        case .sports: return "sportscourt.fill"
        case .outdoors: return "leaf.fill"
        }
    }

    var gradient: [Color] {
        switch self {
        case .music: return [Color(red: 0.55, green: 0.36, blue: 0.96), Color(red: 0.66, green: 0.33, blue: 0.97)]
        case .sports: return [Color(red: 0.06, green: 0.72, blue: 0.51), Color(red: 0.08, green: 0.57, blue: 0.47)]
        case .outdoors: return [Color(red: 0.13, green: 0.77, blue: 0.37), Color(red: 0.09, green: 0.64, blue: 0.29)]
        }
    }

    /// Event `category` ilike terms (OR-matched), mirroring the web hub queries.
    var eventTerms: [String] {
        switch self {
        case .music: return ["Music", "Concert", "Live Music"]
        case .sports: return ["Sport", "Game", "Baseball", "Hockey", "Basketball", "Football", "Soccer"]
        case .outdoors: return ["Outdoor", "Festival", "Nature", "Park", "Hike", "Trail", "Market"]
        }
    }

    var eventsSectionTitle: String {
        switch self {
        case .music: return "Upcoming shows"
        case .sports: return "Upcoming games"
        case .outdoors: return "Outdoor events"
        }
    }

    /// Attraction `type` raw values for this hub's "places" rail (empty → no rail).
    var attractionTypes: [AttractionType] {
        switch self {
        case .music: return [.entertainment]
        case .sports: return [.sports]
        case .outdoors: return [.park, .garden, .zoo]
        }
    }

    var attractionsSectionTitle: String {
        switch self {
        case .music: return "Venues & entertainment"
        case .sports: return "Venues & arenas"
        case .outdoors: return "Parks & nature"
        }
    }

    /// Featured-dining rail title (all hubs include a dining cross-sell).
    var diningSectionTitle: String {
        switch self {
        case .music: return "Dinner before the show"
        case .sports: return "Gameday eats"
        case .outdoors: return "Patios & local bites"
        }
    }
}
