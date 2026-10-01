import Foundation
import os

/// Parses deep links and universal links into app navigation destinations.
///
/// Supported URL patterns:
/// - `desmoinesinsider.com/events/:id-or-slug` → Event detail
/// - `desmoinesinsider.com/search?q=` → Search tab with the query
/// - `desmoinesinsider.com/restaurants/:id-or-slug` → Restaurant detail
/// - `desmoinesinsider.com/attractions/:id-or-slug` → Attraction detail
/// - `desmoinesinsider.com/stay/:id-or-slug` → Hotel detail
/// - `desmoinesinsider.com/articles/:id-or-slug` → Article reader
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
        /// A UUID or a lowercase slug (IOS-DD-GUIDES-22).
        case hotel(id: String)
        /// A UUID or a lowercase slug (IOS-DD-GUIDES-22).
        case article(id: String)
        case tab(MainTabView.Tab)
        /// A Discover-hub parity surface (IOS-IA-002), e.g. trip planner, deals.
        case discover(DiscoverDestination)
        /// The Search tab with this text (IOS-DD-PLATFORM-02).
        case search(query: String)
        /// A first-party page with no native screen, shown in SafariView so a
        /// claimed link never opens the app to nothing (IOS-DD-PLATFORM-02).
        /// Only ever a URL that passed isFirstPartyWebURL.
        case web(URL)
    }

    private init() {}

    // MARK: - Parse URL

    /// Attempts to parse a URL into a navigation destination.
    /// Returns `true` if the URL was handled, `false` if it should be passed to Supabase.
    @discardableResult
    func handle(_ url: URL) -> Bool {
        // Skip auth callbacks - let Supabase handle those. Scheme and host,
        // not a substring: /articles/auth-callback-explained is an article
        // (IOS-DD-PLATFORM-10).
        if url.scheme == Config.appBundleId && url.host == "auth-callback" {
            return false
        }

        if let destination = self.destination(for: url) {
            pendingDestination = destination
            return true
        }

        return false
    }

    /// Where a URL leads, without routing there. The article reader uses it to
    /// open a site link natively in its own sheet (IOS-DD-GUIDES-21), which
    /// must not also trigger the root presenter via pendingDestination.
    func destination(for url: URL) -> Destination? {
        parseUniversalLink(url) ?? parseCustomScheme(url)
    }

    /// In-app routing through the same path a link takes, e.g. Home's
    /// "Popular Restaurants > See all" switching to the Dining tab
    /// (IOS-DD-EVENTS-11). MainTabView observes pendingDestination.
    func open(_ destination: Destination) {
        pendingDestination = destination
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
        case "event", "restaurant", "attraction", "hotel", "article":
            // SpotlightService indexes hotel-<id> and article-<id> too; those
            // used to open the app to nothing (IOS-DD-GUIDES-22).
            return routeTyped(type: type, rawId: rawId)
        default:
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
        case "hotel":
            guard let id = validatedId(rawId, source: "notification") else { return false }
            pendingDestination = .hotel(id: id)
        case "article":
            guard let id = validatedId(rawId, source: "notification") else { return false }
            pendingDestination = .article(id: id)
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

    /// Path segments under /restaurants/ that are landing pages on the web.
    static let reservedRestaurantSegments: Set<String> = ["open-now", "new", "dietary"]

    /// A UUID, or a lowercase slug of at most 120 characters that is not a
    /// reserved landing page. Universal links only; the custom scheme stays
    /// UUID-only.
    static func restaurantLinkId(_ raw: String) -> String? {
        if UUID(uuidString: raw) != nil { return raw }
        guard raw.count <= 120,
              !reservedRestaurantSegments.contains(raw),
              raw.range(of: "^[a-z0-9]+(?:-[a-z0-9]+)*$", options: .regularExpression) != nil else { return nil }
        return raw
    }

    /// A UUID, or a lowercase slug of at most 120 characters: the web's
    /// canonical attraction URL is /attractions/<slug> (IOS-DD-BROWSE-12).
    /// Universal links only; the custom scheme stays UUID-only.
    static func attractionLinkId(_ raw: String) -> String? {
        if UUID(uuidString: raw) != nil { return raw }
        guard raw.count <= 120,
              raw.range(of: "^[a-z0-9]+(?:-[a-z0-9]+)*$", options: .regularExpression) != nil else { return nil }
        return raw
    }

    /// A UUID, or a lowercase slug of at most 120 characters, for /stay/ and
    /// /articles/ links (the same rule as attractionLinkId).
    static func slugOrUUID(_ raw: String) -> String? {
        attractionLinkId(raw)
    }

    /// Validates and returns the ID, or nil if invalid (logging the rejection).
    private func validatedId(_ id: String, source: String) -> String? {
        if isValidId(id) { return id }
        AppLogger.nav.warning("Rejected invalid deep link ID from \(source): \(id.prefix(50))")
        return nil
    }

    // MARK: - Parse Helpers

    /// https on desmoinesinsider.com or www. only. `host.contains` accepted
    /// desmoinesinsider.com.attacker.net and plain http (IOS-DD-PLATFORM-10).
    static func isFirstPartyWebURL(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "https", let host = url.host?.lowercased() else { return false }
        return host == "desmoinesinsider.com" || host == "www.desmoinesinsider.com"
    }

    /// Longest search text a link may carry.
    static let maxLinkQueryLength = 120

    /// The trimmed, capped `q` of a /search link, or nil when empty.
    static func searchQuery(from url: URL) -> String? {
        let q = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?.first(where: { $0.name == "q" })?.value ?? ""
        let trimmed = String(q.trimmingCharacters(in: .whitespacesAndNewlines).prefix(maxLinkQueryLength))
        return trimmed.isEmpty ? nil : trimmed
    }

    /// /events/<segment>: a landing page, an event id or slug, or Home
    /// (IOS-DD-PLATFORM-01). The web builds every event URL as
    /// <title>-<yyyy-mm-dd>, so a UUID-only check sent all of them to Home.
    static func eventDestination(_ raw: String) -> Destination {
        switch raw {
        case "this-weekend": return .discover(.weekend)
        case "today": return .search(query: "today")
        case "free": return .search(query: "free events")
        case "kids": return .search(query: "kids events")
        case "west-des-moines", "ankeny", "urbandale", "johnston", "altoona", "clive", "windsor-heights", "waukee":
            return .search(query: "events in " + raw.replacingOccurrences(of: "-", with: " "))
        default: break
        }
        if EventSlug.landingSegments.contains(raw) || EventSlug.isMonthPage(raw) { return .tab(.home) }
        if let id = EventSlug.linkId(raw) { return .event(id: id) }
        AppLogger.nav.warning("Rejected invalid event link: \(raw.prefix(50))")
        return .tab(.home)
    }

    private func parseUniversalLink(_ url: URL) -> Destination? {
        guard Self.isFirstPartyWebURL(url) else { return nil }

        let path = url.pathComponents.filter { $0 != "/" }

        // /search, /search?q=, /search/advanced (IOS-DD-PLATFORM-02).
        if path.first == "search" {
            if let q = Self.searchQuery(from: url) { return .search(query: q) }
            return .tab(.search)
        }

        guard path.count >= 2 else {
            // Root path — navigate to appropriate tab
            guard let first = path.first else { return .tab(.home) }
            if first == "events" { return .tab(.home) }
            if first == "restaurants" { return .tab(.restaurants) }
            // Single-segment Discover parity surfaces, e.g. /trip-planner.
            if let discover = DiscoverDestination(slug: first) {
                return .discover(discover)
            }
            // /attractions has no native list surface, and any other page
            // the app has no screen for opens on the web (IOS-DD-PLATFORM-02).
            return .web(url)
        }

        let type = path[0]
        let rawId = path[1]

        switch type {
        case "events":
            return Self.eventDestination(rawId)
        case "restaurants":
            // The web's canonical restaurant URL is /restaurants/:slug, so a
            // shared link is usually a slug (IOS-DD-RESTAURANTS-09). Landing
            // pages such as /restaurants/open-now are not restaurants.
            if let id = Self.restaurantLinkId(rawId) { return .restaurant(id: id) }
            AppLogger.nav.warning("Rejected invalid restaurant link: \(rawId.prefix(50))")
            return .tab(.restaurants)
        case "attractions":
            // A shared attraction link is a slug (IOS-DD-BROWSE-12); it used
            // to fail the UUID check and land on Home.
            if let id = Self.attractionLinkId(rawId) { return .attraction(id: id) }
            AppLogger.nav.warning("Rejected invalid attraction link: \(rawId.prefix(50))")
            return .tab(.home)
        case "stay":
            // /stay/<slug> is the web's hotel page (IOS-DD-GUIDES-22).
            if let id = Self.slugOrUUID(rawId) { return .hotel(id: id) }
            AppLogger.nav.warning("Rejected invalid hotel link: \(rawId.prefix(50))")
            return .discover(.stay)
        case "articles":
            if let id = Self.slugOrUUID(rawId) { return .article(id: id) }
            AppLogger.nav.warning("Rejected invalid article link: \(rawId.prefix(50))")
            return .discover(.articles)
        default:
            // Discover-hub parity surfaces (IOS-IA-002): the path's first
            // component is itself the slug, e.g. /trip-planner, /deals.
            if let discover = DiscoverDestination(slug: type) {
                return .discover(discover)
            }
            return .web(url)
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
