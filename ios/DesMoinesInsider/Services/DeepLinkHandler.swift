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
        /// A Discover-hub parity surface (IOS-IA-002), e.g. trip planner, deals.
        case discover(DiscoverDestination)
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

    // MARK: - Notifications (IOS-AUDIT-FEAT-003)

    /// Routes a notification payload to a destination. Event-reminder local
    /// notifications carry `eventId`; push payloads may carry a deep-link `url`
    /// or a typed `type`/`id` pair. Returns true if a destination was set.
    @discardableResult
    func handleNotification(userInfo: [AnyHashable: Any]) -> Bool {
        if let eventId = userInfo["eventId"] as? String,
           let id = validatedId(eventId, source: "notification") {
            pendingDestination = .event(id: id)
            return true
        }
        if let urlString = userInfo["url"] as? String, let url = URL(string: urlString) {
            return handle(url)
        }
        if let type = userInfo["type"] as? String, let rawId = userInfo["id"] as? String {
            return routeTyped(type: type, rawId: rawId)
        }
        return false
    }

    // MARK: - Spotlight (IOS-AUDIT-FEAT-027)

    /// Routes a Spotlight result tap. CoreSpotlight delivers the indexed item's
    /// `uniqueIdentifier` (e.g. "event-<uuid>") via CSSearchableItemActivityIdentifier.
    /// Parses the "<type>-<id>" form SpotlightService writes and routes the three
    /// content types that have detail destinations. Returns true if handled.
    @discardableResult
    func handleSpotlightIdentifier(_ identifier: String) -> Bool {
        guard let dash = identifier.firstIndex(of: "-") else { return false }
        let type = String(identifier[..<dash])
        let rawId = String(identifier[identifier.index(after: dash)...])
        switch type {
        case "event", "restaurant", "attraction":
            return routeTyped(type: type, rawId: rawId)
        default:
            // article/hotel are indexed but have no detail destination yet —
            // open the app without crashing rather than route to the wrong place.
            AppLogger.nav.warning("Unrouted Spotlight identifier type: \(type)")
            return false
        }
    }

    private func routeTyped(type: String, rawId: String) -> Bool {
        switch type {
        case "event":
            guard let id = validatedId(rawId, source: "notification") else { return false }
            pendingDestination = .event(id: id)
        case "restaurant":
            guard let id = validatedId(rawId, source: "notification") else { return false }
            pendingDestination = .restaurant(id: id)
        case "attraction":
            guard let id = validatedId(rawId, source: "notification") else { return false }
            pendingDestination = .attraction(id: id)
        default:
            return false
        }
        return true
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
            // Single-segment Discover parity surfaces, e.g. /trip-planner.
            if let slug = path.first, let discover = DiscoverDestination(slug: slug) {
                return .discover(discover)
            }
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
        default:
            // Discover-hub parity surfaces (IOS-IA-002): the path's first
            // component is itself the slug, e.g. /trip-planner, /deals.
            if let discover = DiscoverDestination(slug: type) {
                return .discover(discover)
            }
            return nil
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
        case "discover":
            // com.desmoines.aipulse://discover/<slug> (IOS-IA-002). Bare
            // //discover opens the hub's first tile's surface is not assumed;
            // require an explicit slug.
            if let discover = DiscoverDestination(slug: rawId) { return .discover(discover) }
            return nil
        default: return nil
        }
    }
}
