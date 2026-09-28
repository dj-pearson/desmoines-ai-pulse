import Foundation

/// One interest a profile can carry.
///
/// `id` is what lands in `profiles.interests`, so it is a schema shared with
/// the web (src/lib/interests.ts): renaming one orphans every row that holds
/// it. `categories` is how an interest is matched against an event's category
/// when the For You rail is reranked (IOS-DD-ACCOUNT-04).
struct InterestOption: Identifiable, Hashable {
    let id: String
    let label: String
    let icon: String
    let categories: [EventCategory]

    /// First word of the label ("Music" for "Music & Concerts"), for short copy
    /// such as "Because you like Music".
    var shortLabel: String {
        label.split(separator: " ").first.map(String.init) ?? label
    }
}

/// The interest vocabulary, mirroring INTERESTS in src/lib/interests.ts
/// (IOS-DD-ACCOUNT-03).
///
/// iOS used to store display strings ("Food", "Business") while the web stores
/// lowercase ids ("food", "networking"), so a web user's interests showed no
/// chips here and a save from iOS wrote mixed casing. Ids only, from now on;
/// `normalize` repairs what older builds wrote.
enum InterestCatalog {
    static let all: [InterestOption] = [
        InterestOption(id: "food", label: "Food & Dining", icon: "fork.knife", categories: [.food, .markets]),
        InterestOption(id: "music", label: "Music & Concerts", icon: "music.note", categories: [.music]),
        InterestOption(id: "sports", label: "Sports & Recreation", icon: "sportscourt", categories: [.sports]),
        InterestOption(id: "arts", label: "Arts & Culture", icon: "paintbrush", categories: [.art]),
        InterestOption(id: "nightlife", label: "Nightlife & Entertainment", icon: "sparkles", categories: [.entertainment, .comedy]),
        InterestOption(id: "outdoor", label: "Outdoor Activities", icon: "leaf", categories: [.outdoor]),
        InterestOption(id: "family", label: "Family Events", icon: "figure.2.and.child.holdinghands", categories: [.family]),
        InterestOption(id: "networking", label: "Business & Networking", icon: "briefcase", categories: [.business, .community]),
    ]

    private static let byId: [String: InterestOption] = Dictionary(
        uniqueKeysWithValues: all.map { ($0.id, $0) }
    )

    /// Older iOS builds wrote "Business" for what the web calls networking.
    private static let aliases: [String: String] = ["business": "networking"]

    /// Trims and lowercases, maps legacy spellings to web ids, drops blanks and
    /// duplicates (first occurrence wins) and KEEPS ids this build does not
    /// know, so an interest written by a newer client is never silently lost.
    static func normalize(_ raw: [String]?) -> [String] {
        guard let raw else { return [] }
        var seen = Set<String>()
        var result: [String] = []
        for value in raw {
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            guard !trimmed.isEmpty else { continue }
            let id = aliases[trimmed] ?? trimmed
            if seen.insert(id).inserted {
                result.append(id)
            }
        }
        return result
    }

    static func option(for id: String) -> InterestOption? {
        byId[id]
    }

    /// The label for an id; an unknown id comes back as itself.
    static func label(for id: String) -> String {
        byId[id]?.label ?? id
    }

    /// Moves recommendations whose category belongs to one of the picked
    /// interests to the front. A stable partition: order inside each group is
    /// the server's (trending) order. A matched row with no reason of its own
    /// gets "Because you like <Interest>"; an existing reason is kept.
    ///
    /// This is the cold-start half of personalization (IOS-DD-ACCOUNT-04): the
    /// personalized RPC only runs after 5 swipes or 3 saves, so until then the
    /// interests picked in onboarding are the only signal we have.
    static func rerank(
        _ rows: [ForYouService.Recommendation],
        interestIds: [String]
    ) -> [ForYouService.Recommendation] {
        let picked = normalize(interestIds).compactMap { byId[$0] }
        guard !picked.isEmpty else { return rows }

        var matched: [ForYouService.Recommendation] = []
        var rest: [ForYouService.Recommendation] = []
        for row in rows {
            let category = EventCategory(from: row.category)
            if let interest = picked.first(where: { $0.categories.contains(category) }) {
                var copy = row
                if copy.recommendationReason == nil {
                    copy.recommendationReason = "Because you like \(interest.shortLabel)"
                }
                matched.append(copy)
            } else {
                rest.append(row)
            }
        }
        return matched + rest
    }
}
