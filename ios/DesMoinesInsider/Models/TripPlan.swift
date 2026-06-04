import Foundation

// MARK: - IOS-PARITY-001 · Native AI Trip Planner models
//
// Mirrors the web `useTripPlanner` types (src/hooks/useTripPlanner.ts) and the
// `generate-itinerary` edge function / `get_trip_itinerary` RPC shapes so iOS
// reads the SAME backend the web does. Decodable from both:
//   • trip_plans rows (snake_case columns), and
//   • the generate-itinerary response `tripPlan` (row + items + tips + packingList).

struct TripPlan: Identifiable, Decodable, Hashable {
    let id: String
    let title: String
    let description: String?
    let startDate: String
    let endDate: String
    let status: String?
    let isPublic: Bool?
    let shareCode: String?
    let aiGenerated: Bool?
    let totalEstimatedCost: String?
    let createdAt: String?
    // Present only on the generate response / fetchTripDetails; nil in list rows.
    var items: [TripPlanItem]?
    var tips: [String]?
    var packingList: [String]?

    enum CodingKeys: String, CodingKey {
        case id, title, description, status, items, tips
        case startDate = "start_date"
        case endDate = "end_date"
        case isPublic = "is_public"
        case shareCode = "share_code"
        case aiGenerated = "ai_generated"
        case totalEstimatedCost = "total_estimated_cost"
        case createdAt = "created_at"
        case packingList
    }

    /// "Jun 6 – Jun 8" style range for list/detail headers.
    var dateRangeDisplay: String {
        let inFmt = DateFormatter()
        inFmt.calendar = Calendar(identifier: .gregorian)
        inFmt.locale = Locale(identifier: "en_US_POSIX")
        inFmt.dateFormat = "yyyy-MM-dd"
        let outFmt = DateFormatter()
        outFmt.dateFormat = "MMM d"
        guard let s = inFmt.date(from: String(startDate.prefix(10))),
              let e = inFmt.date(from: String(endDate.prefix(10))) else {
            return "\(startDate) – \(endDate)"
        }
        return "\(outFmt.string(from: s)) – \(outFmt.string(from: e))"
    }
}

struct TripPlanItem: Identifiable, Decodable, Hashable {
    let itemId: String
    let dayNumber: Int
    let orderIndex: Int
    let itemType: String
    let title: String?
    let description: String?
    let location: String?
    let startTime: String?
    let endTime: String?
    let durationMinutes: Int?
    let notes: String?
    let estimatedCost: String?
    let bookingUrl: String?
    let isConfirmed: Bool?
    let aiSuggested: Bool?
    let aiReason: String?
    let contentDetails: TripContentDetails?

    var id: String { itemId }

    enum CodingKeys: String, CodingKey {
        case itemId = "item_id"
        case dayNumber = "day_number"
        case orderIndex = "order_index"
        case itemType = "item_type"
        case title, description, location, notes
        case startTime = "start_time"
        case endTime = "end_time"
        case durationMinutes = "duration_minutes"
        case estimatedCost = "estimated_cost"
        case bookingUrl = "booking_url"
        case isConfirmed = "is_confirmed"
        case aiSuggested = "ai_suggested"
        case aiReason = "ai_reason"
        case contentDetails = "content_details"
    }

    /// "2:30 PM" from a Postgres TIME ("14:30:00"), or nil.
    var startTimeDisplay: String? {
        guard let startTime else { return nil }
        let inFmt = DateFormatter()
        inFmt.dateFormat = "HH:mm:ss"
        inFmt.locale = Locale(identifier: "en_US_POSIX")
        let alt = DateFormatter()
        alt.dateFormat = "HH:mm"
        alt.locale = Locale(identifier: "en_US_POSIX")
        let date = inFmt.date(from: startTime) ?? alt.date(from: startTime)
        guard let date else { return startTime }
        let out = DateFormatter()
        out.dateFormat = "h:mm a"
        return out.string(from: date)
    }

    var systemImage: String {
        switch itemType {
        case "event": return "calendar"
        case "restaurant": return "fork.knife"
        case "attraction": return "mountain.2.fill"
        case "transport": return "car.fill"
        case "break": return "cup.and.saucer.fill"
        default: return "mappin.and.ellipse"
        }
    }
}

/// The `content_details` JSONB payload from `get_trip_itinerary`.
struct TripContentDetails: Decodable, Hashable {
    let type: String?
    let id: String?
    let imageUrl: String?

    enum CodingKeys: String, CodingKey {
        case type, id
        case imageUrl = "image_url"
    }
}

/// Preferences sent to `generate-itinerary`. Keys are camelCase to match the
/// edge function's `preferences.*` reads exactly.
struct TripPreferences: Encodable {
    var interests: [String]?
    var budget: String?
    var pace: String?
    var groupSize: Int?
    var hasChildren: Bool?
    /// Neighborhood focus is folded into `mustSee` (a key the backend reads) so
    /// it actually influences generation without a backend change.
    var mustSee: [String]?
}

// MARK: - Form option catalogs (mirror web TRIP_INTERESTS / BUDGET / PACE)

enum TripPlannerOptions {
    static let interests: [(value: String, label: String)] = [
        ("music", "Live Music"),
        ("food", "Food & Dining"),
        ("outdoors", "Outdoors"),
        ("arts", "Arts & Culture"),
        ("sports", "Sports"),
        ("nightlife", "Nightlife"),
        ("shopping", "Shopping"),
        ("history", "History"),
        ("family", "Family"),
        ("wellness", "Wellness"),
    ]

    static let budgets: [(value: String, label: String)] = [
        ("budget", "Budget"),
        ("moderate", "Moderate"),
        ("splurge", "Splurge"),
        ("any", "No Preference"),
    ]

    static let paces: [(value: String, label: String)] = [
        ("relaxed", "Relaxed"),
        ("moderate", "Moderate"),
        ("packed", "Packed"),
    ]

    static let neighborhoods: [String] = [
        "Downtown", "East Village", "Beaverdale", "Sherman Hill",
        "West Des Moines", "Valley Junction", "Drake", "Ingersoll",
    ]
}
