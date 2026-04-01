import Foundation
import os

/// Parses deep links and universal links into app navigation destinations.
///
/// Supported URL patterns:
/// - `desmoinesinsider.com/events/:id` → Event detail
/// - `desmoinesinsider.com/restaurants/:id` → Restaurant detail
/// - `desmoinesinsider.com/attractions/:id` → Attraction detail
/// - `com.desmoines.aipulse://event/:id` → Event detail (custom scheme)
/// - `com.desmoines.aipulse://restaurant/:id` → Restaurant detail (custom scheme)
/// - `com.desmoines.aipulse://auth-callback` → Auth callback (handled by Supabase)
@MainActor
@Observable
final class DeepLinkHandler {
    static let shared = DeepLinkHandler()

    private(set) var pendingDestination: Destination?

    enum Destination: Equatable {
        case event(id: String)
        case restaurant(id: String)
        case attraction(id: String)
        case tab(MainTabView.Tab)
    }

    private init() {}

    // MARK: - Parse URL

    /// Attempts to parse a URL into a navigation destination.
    /// Returns `true` if the URL was handled, `false` if it should be passed to Supabase.
    @discardableResult
    func handle(_ url: URL) -> Bool {
        // Skip auth callbacks — let Supabase handle those
        if url.absoluteString.contains("auth-callback") {
            return false
        }

        if let destination = parseUniversalLink(url) ?? parseCustomScheme(url) {
            pendingDestination = destination
            return true
        }

        return false
    }

    func consumeDestination() -> Destination? {
        defer { pendingDestination = nil }
        return pendingDestination
    }

    // MARK: - ID Validation

    /// Validates that an ID looks like a UUID (8-4-4-4-12 hex format).
    /// Rejects malformed IDs that could cause unexpected behavior.
    private func isValidId(_ id: String) -> Bool {
        // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
        UUID(uuidString: id) != nil
    }

    /// Validates and returns the ID, or nil if invalid (logging the rejection).
    private func validatedId(_ id: String, source: String) -> String? {
        if isValidId(id) { return id }
        AppLogger.nav.warning("Rejected invalid deep link ID from \(source): \(id.prefix(50))")
        return nil
    }

    // MARK: - Parse Helpers

    private func parseUniversalLink(_ url: URL) -> Destination? {
        guard let host = url.host,
              host.contains("desmoinesinsider.com") else { return nil }

        let path = url.pathComponents.filter { $0 != "/" }

        guard path.count >= 2 else {
            // Root path — navigate to appropriate tab
            if path.first == "events" { return .tab(.home) }
            if path.first == "restaurants" { return .tab(.restaurants) }
            return nil
        }

        let type = path[0]
        let rawId = path[1]

        switch type {
        case "events":
            guard let id = validatedId(rawId, source: "universal-link") else { return .tab(.home) }
            return .event(id: id)
        case "restaurants":
            guard let id = validatedId(rawId, source: "universal-link") else { return .tab(.restaurants) }
            return .restaurant(id: id)
        case "attractions":
            guard let id = validatedId(rawId, source: "universal-link") else { return .tab(.home) }
            return .attraction(id: id)
        default: return nil
        }
    }

    private func parseCustomScheme(_ url: URL) -> Destination? {
        guard url.scheme == Config.appBundleId else { return nil }

        let host = url.host ?? ""
        let path = url.pathComponents.filter { $0 != "/" }
        let rawId = path.first ?? ""

        switch host {
        case "event" where !rawId.isEmpty:
            guard let id = validatedId(rawId, source: "custom-scheme") else { return .tab(.home) }
            return .event(id: id)
        case "restaurant" where !rawId.isEmpty:
            guard let id = validatedId(rawId, source: "custom-scheme") else { return .tab(.restaurants) }
            return .restaurant(id: id)
        case "attraction" where !rawId.isEmpty:
            guard let id = validatedId(rawId, source: "custom-scheme") else { return .tab(.home) }
            return .attraction(id: id)
        case "home": return .tab(.home)
        case "search": return .tab(.search)
        case "favorites": return .tab(.favorites)
        case "profile": return .tab(.profile)
        default: return nil
        }
    }
}
