import Foundation

/// A local deal (IOS-PARITY-010), decoding the same `deals` table the web
/// useDeals hook reads — including the recurring fields (DEAL-RECURRING-001:
/// days_of_week / start_time / end_time) rendered as a readable schedule.
struct Deal: Identifiable, Codable, Hashable {
    let id: String
    let title: String
    var description: String?
    let businessName: String
    let entityType: String
    var entityId: String?
    let dealType: String
    var discountValue: String?
    var code: String?
    var terms: String?
    var startDate: String?
    var endDate: String?
    var imageUrl: String?
    var isVerified: Bool?
    var isFeatured: Bool?
    var redemptionCount: Int?
    var daysOfWeek: [String]?
    var startTime: String?
    var endTime: String?

    enum CodingKeys: String, CodingKey {
        case id, title, description, code, terms
        case businessName = "business_name"
        case entityType = "entity_type"
        case entityId = "entity_id"
        case dealType = "deal_type"
        case discountValue = "discount_value"
        case startDate = "start_date"
        case endDate = "end_date"
        case imageUrl = "image_url"
        case isVerified = "is_verified"
        case isFeatured = "is_featured"
        case redemptionCount = "redemption_count"
        case daysOfWeek = "days_of_week"
        case startTime = "start_time"
        case endTime = "end_time"
    }

    func hash(into hasher: inout Hasher) { hasher.combine(id) }
    static func == (lhs: Deal, rhs: Deal) -> Bool { lhs.id == rhs.id }

    // MARK: - Display

    /// Mirrors the web getDealTypeLabel.
    var dealTypeLabel: String {
        switch dealType {
        case "percentage": return "% Off"
        case "dollar_off": return "$ Off"
        case "bogo": return "BOGO"
        case "free_item": return "Free Item"
        case "package": return "Package"
        default: return "Deal"
        }
    }

    /// Headline value, e.g. "20% Off" or just the type label.
    var valueLabel: String {
        if let value = discountValue, !value.isEmpty {
            switch dealType {
            case "percentage": return "\(value) Off"
            case "dollar_off": return "\(value) Off"
            default: return value
            }
        }
        return dealTypeLabel
    }

    var isRecurring: Bool { !(daysOfWeek ?? []).isEmpty }

    var isFeaturedDeal: Bool { isFeatured == true }

    /// Featured deals are the natural sponsored surface (IOS-ADS-011).
    var isSponsored: Bool { isFeatured == true }

    // MARK: - Recurrence schedule

    private static let dayOrder = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    private static let dayName = ["mon": "Mon", "tue": "Tue", "wed": "Wed", "thu": "Thu",
                                  "fri": "Fri", "sat": "Sat", "sun": "Sun"]

    /// Human-readable recurring schedule, e.g. "Mon–Fri · 3:00–6:00 PM", or nil
    /// for non-recurring deals.
    var scheduleText: String? {
        guard isRecurring else { return nil }
        let days = (daysOfWeek ?? [])
            .map { $0.lowercased() }
            .filter { Deal.dayName[$0] != nil }
            .sorted { (Deal.dayOrder.firstIndex(of: $0) ?? 0) < (Deal.dayOrder.firstIndex(of: $1) ?? 0) }
        guard !days.isEmpty else { return nil }

        let daysLabel: String
        if days.count == 7 {
            daysLabel = "Daily"
        } else if Deal.isConsecutive(days) {
            daysLabel = "\(Deal.dayName[days.first!]!)–\(Deal.dayName[days.last!]!)"
        } else {
            daysLabel = days.compactMap { Deal.dayName[$0] }.joined(separator: ", ")
        }

        if let start = startTime, let end = endTime,
           let startLabel = Deal.timeLabel(start), let endLabel = Deal.timeLabel(end) {
            return "\(daysLabel) · \(startLabel)–\(endLabel)"
        }
        return daysLabel
    }

    /// Whether the deal is live right now (within date window and, if recurring,
    /// today + current time match the schedule).
    func isActiveNow(_ now: Date = Date(), calendar: Calendar = .current) -> Bool {
        if let startStr = startDate, let start = Article.parseTimestamp(startStr), now < start { return false }
        if let endStr = endDate, let end = Article.parseTimestamp(endStr), now > end { return false }
        guard isRecurring else { return true }

        let weekdayIndex = calendar.component(.weekday, from: now) // 1=Sun…7=Sat
        let token = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][weekdayIndex - 1]
        guard (daysOfWeek ?? []).map({ $0.lowercased() }).contains(token) else { return false }

        if let start = startTime, let end = endTime,
           let startMin = Deal.minutesOfDay(start), let endMin = Deal.minutesOfDay(end) {
            let nowMin = calendar.component(.hour, from: now) * 60 + calendar.component(.minute, from: now)
            return nowMin >= startMin && nowMin <= endMin
        }
        return true
    }

    // MARK: - Helpers

    private static func isConsecutive(_ days: [String]) -> Bool {
        let indices = days.compactMap { dayOrder.firstIndex(of: $0) }
        guard indices.count == days.count, indices.count > 1 else { return days.count == 1 }
        return zip(indices, indices.dropFirst()).allSatisfy { $1 == $0 + 1 }
    }

    /// "15:00:00" → "3:00 PM".
    static func timeLabel(_ time: String) -> String? {
        guard let minutes = minutesOfDay(time) else { return nil }
        let hour24 = minutes / 60
        let minute = minutes % 60
        let period = hour24 >= 12 ? "PM" : "AM"
        var hour12 = hour24 % 12
        if hour12 == 0 { hour12 = 12 }
        return String(format: "%d:%02d %@", hour12, minute, period)
    }

    static func minutesOfDay(_ time: String) -> Int? {
        let parts = time.split(separator: ":")
        guard parts.count >= 2, let h = Int(parts[0]), let m = Int(parts[1]) else { return nil }
        return h * 60 + m
    }
}

extension Deal {
    static let preview = Deal(
        id: "deal-1",
        title: "Half-Off Happy Hour",
        description: "All draft beers and well drinks half price during happy hour.",
        businessName: "El Bait Shop",
        entityType: "restaurant",
        entityId: nil,
        dealType: "percentage",
        discountValue: "50%",
        code: nil,
        terms: "Dine-in only. Not valid on holidays.",
        startDate: "2026-01-01T00:00:00Z",
        endDate: "2026-12-31T00:00:00Z",
        imageUrl: nil,
        isVerified: true,
        isFeatured: true,
        redemptionCount: 42,
        daysOfWeek: ["mon", "tue", "wed", "thu", "fri"],
        startTime: "15:00:00",
        endTime: "18:00:00"
    )
}
