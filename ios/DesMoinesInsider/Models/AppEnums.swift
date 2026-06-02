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
        case .insider:
            return [
                "Everything in Free, plus:",
                "AI Trip Planner (5 trips/month)",
                "Unlimited favorites",
                "Advanced filters (distance, price, rating)",
                "Write reviews & ratings",
                "Saved searches & event alerts",
                "Ad-free experience",
                "Early access to events",
                "2x XP earning rate",
            ]
        case .vip:
            return [
                "Everything in Insider, plus:",
                "Unlimited AI Trip Planner",
                "VIP-exclusive events",
                "Restaurant reservation help",
                "SMS alerts",
                "Monthly local business perks",
                "Concierge support",
                "3x XP earning rate",
            ]
        }
    }
}
