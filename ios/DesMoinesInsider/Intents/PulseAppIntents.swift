import AppIntents
import Foundation

/// App Intents donation + handlers for Siri / Shortcuts integration.
/// IOS-DISCOVER-2026-007.
///
/// Wiring strategy: each intent posts a `PulseIntentDispatcher` notification
/// the App layer subscribes to, so the navigation logic stays in the existing
/// SwiftUI views instead of being duplicated in IntentResult bodies.

// MARK: - Cross-process dispatcher

/// Light cross-cutting state object the app subscribes to. Intents fire
/// payloads here; SearchView / DiscoverView / AskPulseView observe and
/// pre-apply parameters when the user is brought back into the app.
@MainActor
@Observable
final class PulseIntentDispatcher {
    static let shared = PulseIntentDispatcher()

    enum Pending: Equatable {
        case findRestaurants(cuisine: String?, area: String?, openNow: Bool)
        case findEvents(category: String?, datePreset: String?)
        case askPulse(query: String)
        /// Free text from a /search?q= link or an /events/<landing> page
        /// (IOS-DD-PLATFORM-02).
        case searchText(String)
    }

    var pending: Pending?

    private init() {}

    func consume() -> Pending? {
        defer { pending = nil }
        return pending
    }
}

// MARK: - FindRestaurantsIntent

struct FindRestaurantsIntent: AppIntent {
    static var title: LocalizedStringResource = "Find Restaurants"
    static var description = IntentDescription(
        "Find Des Moines restaurants by cuisine, area, or open now status.",
    )
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Cuisine", description: "Italian, Mexican, sushi…")
    var cuisine: String?

    @Parameter(title: "Area", description: "Downtown, East Village, Drake…")
    var area: String?

    @Parameter(title: "Open Now", default: false)
    var openNow: Bool

    static var parameterSummary: some ParameterSummary {
        Summary("Find \(\.$cuisine) restaurants in \(\.$area)") {
            \.$openNow
        }
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        PulseIntentDispatcher.shared.pending = .findRestaurants(
            cuisine: cuisine,
            area: area,
            openNow: openNow,
        )
        return .result()
    }
}

// MARK: - FindEventsIntent

struct FindEventsIntent: AppIntent {
    static var title: LocalizedStringResource = "Find Events"
    static var description = IntentDescription(
        "Find Des Moines events by category and date.",
    )
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Category", description: "Music, family, sports…")
    var category: String?

    @Parameter(title: "When", description: "tonight, tomorrow, this weekend…")
    var datePreset: String?

    static var parameterSummary: some ParameterSummary {
        Summary("Find \(\.$category) events \(\.$datePreset)")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        PulseIntentDispatcher.shared.pending = .findEvents(
            category: category,
            datePreset: datePreset,
        )
        return .result()
    }
}

// MARK: - AskPulseIntent

struct AskPulseIntent: AppIntent {
    static var title: LocalizedStringResource = "Ask Pulse"
    static var description = IntentDescription(
        "Ask Pulse, your local Des Moines AI, what to do — natural language in, curated picks out.",
    )
    static var openAppWhenRun: Bool = true

    /// Optional since IOS-DD-SEARCH-14. Neither App Shortcut phrase supplies
    /// it, so as a required String Siri stopped to ask "What's the query?".
    /// Making a parameter optional is additive: a Shortcut a user already
    /// built with a query keeps sending it.
    @Parameter(title: "Query", description: "What are you in the mood for?")
    var query: String?

    static let defaultPrompt = "What's good to do in Des Moines tonight?"
    static let maxQueryLength = 300

    static var parameterSummary: some ParameterSummary {
        Summary("Ask Pulse \(\.$query)")
    }

    /// The trimmed query, capped, or the default prompt when there is none.
    static func resolvedQuery(_ query: String?) -> String {
        let trimmed = (query ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let capped = String(trimmed.prefix(maxQueryLength))
        return capped.isEmpty ? defaultPrompt : capped
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        PulseIntentDispatcher.shared.pending = .askPulse(query: Self.resolvedQuery(query))
        return .result()
    }
}

// MARK: - TonightIntent

/// "What should I do tonight" opens Search with the Tonight filter
/// (IOS-DD-SEARCH-14). It used to be an Ask Pulse phrase with no query.
struct TonightIntent: AppIntent {
    static var title: LocalizedStringResource = "What's on Tonight"
    static var description = IntentDescription(
        "See Des Moines events happening tonight.",
    )
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        PulseIntentDispatcher.shared.pending = .findEvents(category: nil, datePreset: "tonight")
        return .result()
    }
}

// MARK: - Search routing (IOS-DD-SEARCH-06)

extension PulseIntentDispatcher.Pending {
    /// Longest free-text value an intent passes into search.
    static let maxParameterLength = 100

    /// What a Find intent does to the Search tab: explicit filters, the text
    /// for the search field, and the tab to show. Nil for Ask Pulse, which
    /// opens the chat instead.
    ///
    /// SearchView used to join the fields into one sentence ("Italian
    /// restaurants in East Village open now") and search that as text, on
    /// the Events tab.
    var searchRoute: (filters: SearchFilters, text: String, tab: SearchViewModel.SearchTab)? {
        switch self {
        case .findRestaurants(let cuisine, let area, let openNow):
            var filters = SearchFilters(openNow: openNow, tabHint: .restaurants)
            var words: [String] = []
            if let cuisine = Self.clean(cuisine) { words.append(cuisine) }
            if let area = Self.clean(area) {
                let areas = SearchQueryParser.parse(area).filters.areas
                if areas.isEmpty {
                    // Not a known area: search it as a word instead.
                    words.append(area)
                } else {
                    filters.areas = areas
                }
            }
            return (filters, words.joined(separator: " "), .restaurants)

        case .findEvents(let category, let datePreset):
            var filters = SearchFilters(tabHint: .events)
            var text = ""
            if let category = Self.clean(category) {
                let mapped = EventCategory(from: category)
                if mapped != .other || category.lowercased() == "other" {
                    filters.category = mapped
                } else {
                    text = category
                }
            }
            if let datePreset = Self.clean(datePreset) {
                filters.datePreset = SearchQueryParser.parse(datePreset).filters.datePreset
            }
            return (filters, text, .events)

        case .searchText(let text):
            return (SearchFilters(), Self.clean(text) ?? "", .events)

        case .askPulse:
            return nil
        }
    }

    private static func clean(_ value: String?) -> String? {
        let trimmed = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : String(trimmed.prefix(maxParameterLength))
    }
}

// MARK: - Shortcuts pack

/// Suggested phrases shown in the Shortcuts app and on the lock-screen
/// "Suggested Shortcuts" surface.
struct PulseShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AskPulseIntent(),
            phrases: [
                "Ask \(.applicationName) what's good",
            ],
            shortTitle: "Ask Pulse",
            systemImageName: "sparkles",
        )
        AppShortcut(
            intent: TonightIntent(),
            phrases: [
                "What should I do tonight in \(.applicationName)",
            ],
            shortTitle: "Tonight",
            systemImageName: "moon.stars",
        )
        AppShortcut(
            intent: FindRestaurantsIntent(),
            phrases: [
                "Find restaurants with \(.applicationName)",
                "Find restaurants in \(.applicationName)",
            ],
            shortTitle: "Find Restaurants",
            systemImageName: "fork.knife",
        )
        AppShortcut(
            intent: FindEventsIntent(),
            phrases: [
                "Find events on \(.applicationName)",
                "Find something to do on \(.applicationName)",
            ],
            shortTitle: "Find Events",
            systemImageName: "calendar",
        )
    }
}
