import Foundation
import SwiftUI

// MARK: - Event Category

enum EventCategory: String, CaseIterable, Identifiable, Codable {
    case general = "General"
    case music = "Music"
    case food = "Food & Drink"
    case art = "Art & Culture"
    case outdoor = "Outdoor"
    case family = "Family"
    case sports = "Sports"
    case nightlife = "Nightlife"
    case business = "Business"
    case education = "Education"
    case charity = "Charity"
    case holiday = "Holiday"

    var id: String { rawValue }

    var displayName: String { rawValue }

    var icon: String {
        switch self {
        case .general: return "calendar"
        case .music: return "music.note"
        case .food: return "fork.knife"
        case .art: return "paintbrush"
        case .outdoor: return "leaf"
        case .family: return "figure.2.and.child.holdinghands"
        case .sports: return "sportscourt"
        case .nightlife: return "moon.stars"
        case .business: return "briefcase"
        case .education: return "graduationcap"
        case .charity: return "heart.circle"
        case .holiday: return "gift"
        }
    }

    var color: Color {
        switch self {
        case .general: return .blue
        case .music: return .purple
        case .food: return .orange
        case .art: return .pink
        case .outdoor: return .green
        case .family: return .cyan
        case .sports: return .mint
        case .nightlife: return .indigo
        case .business: return .gray
        case .education: return .teal
        case .charity: return .red
        case .holiday: return .yellow
        }
    }

    /// Initialize from a database string, falling back to .general
    init(from rawString: String?) {
        guard let rawString else { self = .general; return }
        // Try exact match first
        if let match = EventCategory(rawValue: rawString) {
            self = match
            return
        }
        // Try case-insensitive match
        let lowered = rawString.lowercased()
        self = EventCategory.allCases.first {
            $0.rawValue.lowercased() == lowered || lowered.contains($0.rawValue.lowercased())
        } ?? .general
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

enum LocationArea: String, CaseIterable, Identifiable {
    case downtown = "Downtown Des Moines"
    case westDesMoines = "West Des Moines"
    case ankeny = "Ankeny"
    case urbandale = "Urbandale"
    case clive = "Clive"
    case johnston = "Johnston"
    case altoona = "Altoona"
    case windsorHeights = "Windsor Heights"
    case waukee = "Waukee"
    case pleasant_hill = "Pleasant Hill"

    var id: String { rawValue }
    var displayName: String { rawValue }
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
}

// MARK: - User Role

enum UserRole: String, Codable {
    case user
    case moderator
    case admin
    case rootAdmin = "root_admin"
}

// MARK: - Sort Option

enum EventSortOption: String, CaseIterable, Identifiable {
    case date = "Date"
    case distance = "Distance"
    case popularity = "Popularity"

    var id: String { rawValue }
}

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
    case today = "Today"
    case tomorrow = "Tomorrow"
    case thisWeekend = "This Weekend"
    case thisWeek = "This Week"
    case nextWeek = "Next Week"
    case thisMonth = "This Month"

    var id: String { rawValue }

    var dateRange: (start: Date, end: Date) {
        let calendar = Calendar.current
        let now = Date()
        let startOfToday = calendar.startOfDay(for: now)

        switch self {
        case .today:
            let end = calendar.date(byAdding: .day, value: 1, to: startOfToday)!
            return (startOfToday, end)
        case .tomorrow:
            let start = calendar.date(byAdding: .day, value: 1, to: startOfToday)!
            let end = calendar.date(byAdding: .day, value: 2, to: startOfToday)!
            return (start, end)
        case .thisWeekend:
            let weekday = calendar.component(.weekday, from: now)
            let daysUntilSaturday = (7 - weekday) % 7
            let saturday = calendar.date(byAdding: .day, value: daysUntilSaturday == 0 ? 0 : daysUntilSaturday, to: startOfToday)!
            let monday = calendar.date(byAdding: .day, value: 2, to: saturday)!
            return (saturday, monday)
        case .thisWeek:
            let end = calendar.date(byAdding: .day, value: 7, to: startOfToday)!
            return (startOfToday, end)
        case .nextWeek:
            let start = calendar.date(byAdding: .day, value: 7, to: startOfToday)!
            let end = calendar.date(byAdding: .day, value: 14, to: startOfToday)!
            return (start, end)
        case .thisMonth:
            let end = calendar.date(byAdding: .month, value: 1, to: startOfToday)!
            return (startOfToday, end)
        }
    }
}

// MARK: - Subscription Tier

enum SubscriptionTier: String, Codable {
    case free
    case insider
    case vip

    var displayName: String {
        switch self {
        case .free: return "Free"
        case .insider: return "Insider"
        case .vip: return "VIP"
        }
    }

    var maxFavorites: Int {
        switch self {
        case .free: return 5
        case .insider, .vip: return -1  // unlimited
        }
    }
}
