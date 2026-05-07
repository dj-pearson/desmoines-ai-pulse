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

    @Parameter(title: "Query", description: "What are you in the mood for?")
    var query: String

    static var parameterSummary: some ParameterSummary {
        Summary("Ask Pulse \(\.$query)")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        PulseIntentDispatcher.shared.pending = .askPulse(query: query)
        return .result()
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
                "What should I do tonight in \(.applicationName)",
            ],
            shortTitle: "Ask Pulse",
            systemImageName: "sparkles",
        )
        AppShortcut(
            intent: FindRestaurantsIntent(),
            phrases: [
                "Find restaurants with \(.applicationName)",
                "Find \(\.$cuisine) restaurants in \(.applicationName)",
            ],
            shortTitle: "Find Restaurants",
            systemImageName: "fork.knife",
        )
        AppShortcut(
            intent: FindEventsIntent(),
            phrases: [
                "Find events on \(.applicationName)",
                "Find \(\.$category) events on \(.applicationName)",
            ],
            shortTitle: "Find Events",
            systemImageName: "calendar",
        )
    }
}
