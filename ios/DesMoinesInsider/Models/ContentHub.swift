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
            return "Your guide to the Des Moines music scene: tonight's shows and upcoming concerts in one place."
        case .sports:
            return "Des Moines is one of the best minor-league sports markets in America. From Iowa Cubs baseball to Iowa Wild hockey, find your next gameday."
        case .outdoors:
            return "Explore the metro's parks and 800+ miles of trails, from the High Trestle Trail Bridge to quiet urban loops."
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

    /// The PostgREST or-group selecting this hub's events (IOS-DD-BROWSE-22).
    ///
    /// Since 20260919000003 events.category holds exactly the canonical
    /// EventCategory values, so the old ilike terms ("Concert", "Game",
    /// "Hike", "Trail"...) could never match. Outdoors takes Festival and
    /// Markets too, minus the ones known to be indoors (a holiday market in
    /// a hall); `not.is.true` keeps the rows whose is_indoor is unknown.
    var eventOrGroup: String {
        switch self {
        case .music: return "category.eq.\(EventCategory.music.rawValue)"
        case .sports: return "category.eq.\(EventCategory.sports.rawValue)"
        case .outdoors:
            return "category.eq.\(EventCategory.outdoor.rawValue),"
                + "and(category.in.(\(EventCategory.festival.rawValue),\(EventCategory.markets.rawValue)),is_indoor.not.is.true)"
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

    /// The or-group without `events.is_indoor`, for a backend where
    /// 20260908000001 has not run yet (the 2026-08-24 snapshot has no such
    /// column, and the web treats it as optional too). Nil when the main
    /// group does not use the column.
    var eventOrGroupWithoutIndoorFlag: String? {
        switch self {
        case .music, .sports: return nil
        case .outdoors:
            return "category.in.(\(EventCategory.outdoor.rawValue),\(EventCategory.festival.rawValue),\(EventCategory.markets.rawValue))"
        }
    }

    /// Featured-dining rail title. Every hub shows the same featured list,
    /// so the title says that instead of promising a themed pairing the query
    /// does not make (IOS-DD-BROWSE-21).
    var diningSectionTitle: String { "Featured dining" }

    // MARK: - Time shape (IOS-DD-BROWSE-23)

    /// Splits upcoming events into Tonight, This weekend and Later, in
    /// Central time. Tonight is `DateFilterPreset.tonight`'s window or
    /// anything on right now; This weekend is the rest of the Fri-Sun window;
    /// Later is everything else. Finished rows are dropped and the input
    /// order is kept within each bucket.
    static func partition(
        _ events: [Event],
        now: Date,
        calendar: Calendar = DesMoinesTime.calendar
    ) -> (tonight: [Event], weekend: [Event], later: [Event]) {
        let tonightRange = DateFilterPreset.tonight.range(now: now, calendar: calendar)
        let weekend = WeekendWindow.current(now: now, calendar: calendar)
        var out: (tonight: [Event], weekend: [Event], later: [Event]) = ([], [], [])
        for event in events where !event.isOver(at: now, calendar: calendar) {
            let start = event.parsedDate
            if event.happeningNow(at: now) || start.map({ $0 >= tonightRange.start && $0 < tonightRange.end }) == true {
                out.tonight.append(event)
            } else if let start, start >= weekend.fridayStart, start < weekend.mondayStart {
                out.weekend.append(event)
            } else {
                out.later.append(event)
            }
        }
        return out
    }
}
