import Foundation
import SwiftUI

// MARK: - Event Category

/// The canonical event category vocabulary (WEB-BE-049, IOS-DD-EVENTS-01).
///
/// Raw values are exactly the strings `events.category` holds since migration
/// 20260919000003, in the order of
/// supabase/functions/_shared/eventCategories.json ("categories"). The filter
/// sends the raw value as an `eq`, so a raw value that is not in that list
/// returns zero rows - which is what "Food & Drink", "Art & Culture",
/// "Nightlife", "Charity", "Holiday" and "General" did. Change this only with
/// that file; EventCategoryTests pins the list.
enum EventCategory: String, CaseIterable, Identifiable, Codable {
    case music = "Music"
    case sports = "Sports"
    case art = "Arts"
    case comedy = "Comedy"
    case entertainment = "Entertainment"
    case family = "Family"
    case food = "Food"
    case markets = "Markets"
    case festival = "Festival"
    case outdoor = "Outdoor"
    case health = "Health"
    case community = "Community"
    case business = "Business"
    case education = "Education"
    case other = "Other"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .food: return "Food & Drink"
        case .art: return "Arts & Culture"
        default: return rawValue
        }
    }

    var icon: String {
        switch self {
        case .music: return "music.note"
        case .sports: return "sportscourt"
        case .art: return "paintbrush"
        case .comedy: return "theatermasks"
        case .entertainment: return "sparkles"
        case .family: return "figure.2.and.child.holdinghands"
        case .food: return "fork.knife"
        case .markets: return "basket"
        case .festival: return "party.popper"
        case .outdoor: return "leaf"
        case .health: return "heart.text.square"
        case .community: return "person.3"
        case .business: return "briefcase"
        case .education: return "graduationcap"
        case .other: return "calendar"
        }
    }

    var color: Color {
        switch self {
        case .music: return .purple
        case .sports: return .mint
        case .art: return .pink
        case .comedy: return .yellow
        case .entertainment: return .indigo
        case .family: return .cyan
        case .food: return .orange
        case .markets: return .brown
        case .festival: return .orange
        case .outdoor: return .green
        case .health: return .red
        case .community: return .blue
        case .business: return .gray
        case .education: return .teal
        case .other: return .gray
        }
    }

    /// Legacy and free-text spellings, checked in order (first hit wins) after
    /// an exact and a case-insensitive match fail. A row written before the WEB-BE-049
    /// backfill, or a cached row from an older build, still lands somewhere
    /// sensible instead of on "Other".
    private static let legacyAliases: [(needle: String, category: EventCategory)] = [
        ("food & drink", .food), ("food", .food), ("drink", .food),
        ("art & culture", .art), ("art", .art), ("culture", .art), ("theat", .art),
        ("nightlife", .entertainment),
        ("charity", .community),
        ("holiday", .festival), ("fair", .festival), ("parade", .festival),
        ("market", .markets),
        ("music", .music), ("concert", .music),
        ("sport", .sports),
        ("famil", .family), ("kid", .family),
        ("outdoor", .outdoor),
        ("comedy", .comedy),
        ("general", .other),
    ]

    /// Initialize from a database string, falling back to `.other`.
    init(from rawString: String?) {
        guard let rawString else { self = .other; return }
        if let match = EventCategory(rawValue: rawString) {
            self = match
            return
        }
        let lowered = rawString.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if let match = EventCategory.allCases.first(where: { $0.rawValue.lowercased() == lowered }) {
            self = match
            return
        }
        // Word-prefix match, as eventCategories.json's keywords are applied, so
        // "Halloween Party" is not Arts for containing "art". A needle with a
        // space is matched as a phrase.
        let words = lowered.split(whereSeparator: { !$0.isLetter && !$0.isNumber }).map(String.init)
        if let alias = Self.legacyAliases.first(where: { alias in
            alias.needle.contains(" ")
                ? lowered.contains(alias.needle)
                : words.contains(where: { $0.hasPrefix(alias.needle) })
        }) {
            self = alias.category
            return
        }
        self = .other
    }
}

// MARK: - Price Range

enum PriceRange: String, CaseIterable, Identifiable {
    case budget = "$"
    case moderate = "$$"
    case upscale = "$$$"
    case fineDining = "$$$$"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .budget: return "Budget ($)"
        case .moderate: return "Moderate ($$)"
        case .upscale: return "Upscale ($$$)"
        case .fineDining: return "Fine Dining ($$$$)"
        }
    }
}

// MARK: - Location Area

/// Where an event is, as a filter (IOS-DD-EVENTS-07). Mirrors EVENT_AREAS in
/// src/lib/eventAreas.ts, in the same order: a CITY area matches
/// `events.city` whole (case aside), a suburb also matches a null-city row
/// whose location ends in ", <City>", and a BBOX area is a district inside Des
/// Moines that no column names, so it matches on coordinates.
///
/// The old "Downtown Des Moines" was substring-matched against city and
/// location, which hold "Des Moines" and street addresses, so it matched
/// almost nothing.
enum LocationArea: String, CaseIterable, Identifiable {
    case desMoines = "Des Moines"
    case westDesMoines = "West Des Moines"
    case ankeny = "Ankeny"
    case urbandale = "Urbandale"
    case clive = "Clive"
    case johnston = "Johnston"
    case altoona = "Altoona"
    case windsorHeights = "Windsor Heights"
    case waukee = "Waukee"
    case downtown = "Downtown / Court Ave"
    case eastVillage = "East Village"
    case valleyJunction = "Valley Junction"
    case ingersoll = "Ingersoll"

    var id: String { rawValue }
    var displayName: String { rawValue }

    /// The district's box, copied from eventAreas.ts. Nil for a city area.
    var bbox: (south: Double, west: Double, north: Double, east: Double)? {
        switch self {
        case .downtown: return (41.579, -93.6425, 41.596, -93.617)
        case .eastVillage: return (41.583, -93.617, 41.596, -93.6)
        case .valleyJunction: return (41.568, -93.718, 41.576, -93.704)
        case .ingersoll: return (41.579, -93.673, 41.5875, -93.645)
        case .desMoines, .westDesMoines, .ankeny, .urbandale, .clive,
             .johnston, .altoona, .windsorHeights, .waukee:
            return nil
        }
    }

    /// One PostgREST `or` clause for this area. The caller joins several with
    /// "," into a single or-group. Same strings as eventAreaOrFilter /
    /// applyEventArea on the web.
    var filterClause: String {
        if let b = bbox {
            return "and(latitude.gte.\(Self.coord(b.south)),latitude.lte.\(Self.coord(b.north)),"
                + "longitude.gte.\(Self.coord(b.west)),longitude.lte.\(Self.coord(b.east)))"
        }
        let city = rawValue
        if self == .desMoines {
            return "city.ilike.\(city)"
        }
        let locations = ["%, \(city)", "%, \(city), IA%", "%, \(city), Iowa%"]
            .map { "location.ilike.\"\($0)\"" }
            .joined(separator: ",")
        return "city.ilike.\(city),and(city.is.null,or(\(locations)))"
    }

    /// A coordinate as the web prints it: no trailing zeros, no exponent.
    private static func coord(_ value: Double) -> String {
        var s = String(format: "%.6f", value)
        while s.hasSuffix("0") { s.removeLast() }
        if s.hasSuffix(".") { s.removeLast() }
        return s
    }
}

// MARK: - Attraction Type

enum AttractionType: String, CaseIterable, Identifiable {
    case museum = "Museum"
    case park = "Park"
    case historicSite = "Historic Site"
    case entertainment = "Entertainment"
    case zoo = "Zoo"
    case garden = "Garden"
    case sports = "Sports Venue"
    case shopping = "Shopping"
    case other = "Other"

    var id: String { rawValue }
    var displayName: String { rawValue }

    var icon: String {
        switch self {
        case .museum: return "building.columns"
        case .park: return "tree"
        case .historicSite: return "building.2"
        case .entertainment: return "theatermasks"
        case .zoo: return "pawprint"
        case .garden: return "leaf"
        case .sports: return "sportscourt"
        case .shopping: return "bag"
        case .other: return "mappin"
        }
    }
}

// MARK: - Content Type

enum ContentType: String, Codable {
    case event
    case restaurant
    case attraction
    case playground

    /// Decode tolerantly. The backing DB enum can gain values additively per
    /// CLAUDE.md's backward-compat rules; an unrecognized value falls back to
    /// `.event` instead of throwing and failing the whole response decode.
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = ContentType(rawValue: raw) ?? .event
    }
}

// MARK: - User Role

enum UserRole: String, Codable {
    case user
    case moderator
    case admin
    case rootAdmin = "root_admin"

    /// Decode tolerantly, defaulting an unknown role to the least-privileged
    /// `.user` — both to honor additive enum growth and to fail safe (an
    /// unrecognized role must never be treated as elevated).
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = UserRole(rawValue: raw) ?? .user
    }
}

// MARK: - Sort Option

enum RestaurantSortOption: String, CaseIterable, Identifiable {
    case popularity = "Popular"
    case rating = "Rating"
    case newest = "Newest"
    case alphabetical = "A-Z"
    case priceLow = "Price: Low"
    case priceHigh = "Price: High"

    var id: String { rawValue }
}

// MARK: - Date Filter Preset

enum DateFilterPreset: String, CaseIterable, Identifiable {
    /// From three hours ago (a show that started at 7 is still on at 9) to
    /// 3am, so a late set counts as tonight (IOS-DD-EVENTS-18).
    case tonight = "Tonight"
    case today = "Today"
    case tomorrow = "Tomorrow"
    case thisWeekend = "This Weekend"
    case thisWeek = "This Week"
    case nextWeek = "Next Week"
    case thisMonth = "This Month"

    var id: String { rawValue }

    /// The window for right now, in Des Moines time. Kept as a property so the
    /// existing call sites compile unchanged.
    var dateRange: (start: Date, end: Date) {
        range(now: Date())
    }

    /// The window for `now`, with day boundaries in `calendar` (Central by
    /// default, IOS-DD-EVENTS-05: a phone in another zone used to move every
    /// boundary by its offset). Named differently from `dateRange` so an
    /// unapplied reference to either can never be ambiguous.
    func range(now: Date, calendar: Calendar = DesMoinesTime.calendar) -> (start: Date, end: Date) {
        let startOfToday = calendar.startOfDay(for: now)
        func day(_ offset: Int) -> Date {
            calendar.date(byAdding: .day, value: offset, to: startOfToday) ?? startOfToday
        }

        switch self {
        case .tonight:
            let start = max(now.addingTimeInterval(-3 * 3600), startOfToday)
            let end = calendar.date(byAdding: .hour, value: 3, to: day(1)) ?? day(1)
            return (start, end)
        case .today:
            return (startOfToday, day(1))
        case .tomorrow:
            return (day(1), day(2))
        case .thisWeekend:
            // Friday to Monday, the same window WeekendView and its "See all"
            // use. The old Saturday math returned NEXT Saturday on a Sunday
            // and never included Friday (IOS-DD-EVENTS-04).
            let w = WeekendWindow.current(now: now, calendar: calendar)
            return (w.fridayStart, w.mondayStart)
        case .thisWeek:
            return (startOfToday, day(7))
        case .nextWeek:
            return (day(7), day(14))
        case .thisMonth:
            let end = calendar.date(byAdding: .month, value: 1, to: startOfToday) ?? day(30)
            return (startOfToday, end)
        }
    }
}

// MARK: - Event Sort Option

/// Sort options for the events list. Mirrors RestaurantSortOption so the
/// Events tab matches the Restaurants tab UX. IOS-DISCOVER-2026-003.
enum EventSortOption: String, CaseIterable, Identifiable {
    case soonest = "Soonest"
    case featured = "Featured"
    case popularity = "Popularity"

    var id: String { rawValue }
}

// MARK: - Subscription Tier

enum SubscriptionTier: String, Codable {
    case free
    case insider
    case vip

    /// Decode tolerantly, defaulting an unknown tier to `.free` — fail safe so a
    /// backend value this binary doesn't recognize never unlocks premium and
    /// never crashes the response decode (additive-enum backward-compat rule).
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = SubscriptionTier(rawValue: raw) ?? .free
    }

    var displayName: String {
        switch self {
        case .free: return "Free"
        case .insider: return "Insider"
        case .vip: return "VIP"
        }
    }

    var maxFavorites: Int {
        switch self {
        case .free: return 3
        case .insider, .vip: return -1  // unlimited
        }
    }

    /// Per-tier count limits for the other quota-gated features (IOS-SUB-011),
    /// mirroring the web `SubscriptionLimits`. `-1` means unlimited. Saved
    /// searches / alerts (IOS-PARITY-008) and the AI Trip Planner quota
    /// (IOS-PARITY-001) read these once those screens land.
    var maxSavedSearches: Int {
        switch self {
        case .free: return 0
        case .insider: return 10
        case .vip: return -1
        }
    }

    var maxAlerts: Int {
        switch self {
        case .free: return 0
        case .insider: return 10
        case .vip: return -1
        }
    }

    /// AI Trip Planner: Insider 5 trips/month, VIP unlimited (per the PRD).
    var maxTripPlansPerMonth: Int {
        switch self {
        case .free: return 0
        case .insider: return 5
        case .vip: return -1
        }
    }

    /// Features included in this tier (for display in subscription UI).
    var features: [String] {
        switch self {
        case .free:
            return [
                "Browse events & restaurants",
                "Save up to 3 favorites",
                "Basic text search",
                "View ratings & reviews",
                "Weekly email digest",
            ]
        // Only what iOS delivers (IOS-DD-MONETIZATION-11). The XP
        // multipliers, early access, advanced filters and the five VIP lines
        // had no implementation on iOS; WEB-FEAT-016 removed the same lines
        // on web. VIP keeps the two differences that are real: the trip
        // quota in TripPlannerView and the saved-search cap enforced by
        // entitled_plan_limit.
        case .insider:
            return [
                "Everything in Free, plus:",
                "AI Trip Planner (5 itineraries/month)",
                "Unlimited favorites",
                "Write reviews & ratings",
                "Saved searches & event alerts (up to 10)",
                "Ad-free experience",
            ]
        case .vip:
            return [
                "Everything in Insider, plus:",
                "Unlimited AI Trip Planner",
                "Unlimited saved searches & alerts",
            ]
        }
    }
}
