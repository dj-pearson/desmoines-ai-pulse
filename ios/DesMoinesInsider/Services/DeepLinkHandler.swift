import Foundation
import os

/// Parses deep links and universal links into app navigation destinations.
///
/// Supported URL patterns:
/// - `desmoinesinsider.com/events/:id-or-slug` → Event detail
/// - `desmoinesinsider.com/search?q=` → Search tab with the query
/// - `desmoinesinsider.com/events?q=&category=&location=&price=&preset=` →
///   Search tab on Events with those filters; bare `/events` → Home
/// - `desmoinesinsider.com/restaurants/:id-or-slug` → Restaurant detail
/// - `desmoinesinsider.com/restaurants/open-now`, `/new`, `/dietary/:diet` →
///   the Dining tab with that filter set
/// - `desmoinesinsider.com/attractions/:id-or-slug` → Attraction detail
/// - `desmoinesinsider.com/stay/:id-or-slug` → Hotel detail
/// - `desmoinesinsider.com/articles/:id-or-slug` → Article reader
/// - `desmoinesinsider.com/neighborhoods/:slug` → Neighborhood guide, or the
///   Neighborhoods hub for a slug the app has no guide for
/// - `desmoinesinsider.com/best-of/:slug` → That Best Of category, or the
///   Best Of hub for a malformed slug
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
        /// One curated neighborhood guide, by its `Neighborhood.slug`
        /// (IOS-AUDIT-FEAT-038). Only ever a slug `Neighborhood.bySlug` knows.
        case neighborhood(slug: String)
        /// One Best Of voting category, by its `voting_categories.slug`
        /// (IOS-AUDIT-FEAT-040). Only ever a well-formed lowercase slug; whether
        /// an active category has it is answered when the link opens.
        case bestOfCategory(slug: String)
        /// The Dining tab narrowed the way a web restaurant landing page is:
        /// /restaurants/open-now, /new, /dietary/<diet> (IOS-AUDIT-FEAT-043).
        case restaurantLanding(RestaurantLinkFilter)
        /// The Search tab with this text (IOS-DD-PLATFORM-02).
        case search(query: String)
        /// The Search tab on Events with these words and filters: a filtered
        /// /events?... link, e.g. the saved-search alert email's "see all"
        /// or the web hub's /events?preset=this-weekend&price=free
        /// (IOS-AUDIT-FEAT-041). Never both empty.
        case eventSearch(query: String, filters: SearchFilters)
        /// A first-party page with no native screen, shown in SafariView so a
        /// claimed link never opens the app to nothing (IOS-DD-PLATFORM-02).
        /// Only ever a URL that passed isFirstPartyWebURL.
        case web(URL)
    }

    /// A restaurant landing link waiting for the Dining list to apply it.
    /// MainTabView stages it and switches tabs; RestaurantsView consumes it,
    /// so a link that arrives before the tab has ever been shown still lands
    /// (IOS-AUDIT-FEAT-043).
    private(set) var pendingRestaurantLink: RestaurantLinkFilter?

    private init() {}

    func stageRestaurantLink(_ link: RestaurantLinkFilter) {
        pendingRestaurantLink = link
    }

    func consumeRestaurantLink() -> RestaurantLinkFilter? {
        defer { pendingRestaurantLink = nil }
        return pendingRestaurantLink
    }

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

    /// /restaurants/open-now, /restaurants/new and /restaurants/dietary[/<diet>]
    /// (IOS-AUDIT-FEAT-043). These used to open the Dining tab unfiltered, so
    /// a shared "open now" or "vegan" page showed every restaurant. The
    /// open-now page also reads `?diet=`, and the dietary index the legacy
    /// `?diet=` form, as the web does (OpenNowRestaurants.tsx,
    /// DietaryRestaurants.tsx). An unknown diet, and the bare index, open
    /// the tab unfiltered; kosher has a key since IOS-AUDIT-FEAT-044. Nil for any
    /// other segment: that is a restaurant, not a landing page.
    static func restaurantLandingDestination(_ path: [String], url: URL) -> Destination? {
        guard path.count >= 2, reservedRestaurantSegments.contains(path[1]) else { return nil }
        let queryDiet = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?.first(where: { $0.name == "diet" })?.value
        switch path[1] {
        case "open-now":
            return .restaurantLanding(RestaurantLinkFilter(openNow: true, diet: RestaurantLinkFilter.diet(queryDiet)))
        case "new":
            return .restaurantLanding(RestaurantLinkFilter(newOpenings: true))
        default:
            let raw = path.count >= 3 ? path[2] : queryDiet
            guard let diet = RestaurantLinkFilter.diet(raw) else { return .tab(.restaurants) }
            return .restaurantLanding(RestaurantLinkFilter(diet: diet))
        }
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

    /// Bare /events with the hub's filter keys (IOS-AUDIT-FEAT-041). The web
    /// writes every filter into the URL (EventsPage.tsx), the saved-search
    /// alert email links there with them (savedSearchMatch.ts deepLink), and
    /// the hub's own tiles link /events?category=Festival. All of these used
    /// to open Home with the filters dropped. `q` wins over `search`, the
    /// alias the old WebSite SearchAction used, as it does on the web.
    /// `from`/`to`, `sort`, `near`, `view`, `page` and utm keys have no
    /// Search equivalent and are ignored. No filter at all is still Home.
    static func eventsHubDestination(_ url: URL) -> Destination {
        var keys: [String: String] = [:]
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        for item in items where keys[item.name] == nil {
            if let value = item.value { keys[item.name] = value }
        }
        let words = [keys["q"], keys["search"]]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty } ?? ""
        let query = String(words.prefix(maxLinkQueryLength))
            .trimmingCharacters(in: .whitespacesAndNewlines)
        var filters = SearchFilters(webEventKeys: keys, query: query)
        if query.isEmpty && filters.isEmpty { return .tab(.home) }
        filters.tabHint = .events
        return .eventSearch(query: query, filters: filters)
    }

    /// /neighborhoods/<slug> (IOS-AUDIT-FEAT-038). Every slug the web builds
    /// (src/lib/neighborhoods.ts) is in Neighborhood.all, so a shared guide
    /// opens that guide; it used to open the hub and leave the user to find
    /// it again. A slug the app has no guide for still lands on the hub, never
    /// on nothing. Exact match against the curated list is the validation.
    static func neighborhoodDestination(_ raw: String) -> Destination {
        if let match = Neighborhood.bySlug(raw) { return .neighborhood(slug: match.slug) }
        return .discover(.neighborhoods)
    }

    /// /best-of/<slug> (IOS-AUDIT-FEAT-040). Categories live in the database,
    /// so the shape is checked here and the row when the link opens. The
    /// category screen shares this URL, and it used to open the hub, leaving
    /// the person sent "Best Pizza" to find it again. A malformed slug lands
    /// on the hub, never on nothing.
    static func bestOfDestination(_ raw: String) -> Destination {
        guard UUID(uuidString: raw) == nil, let slug = slugOrUUID(raw) else {
            AppLogger.nav.warning("Rejected invalid best-of link: \(raw.prefix(50))")
            return .discover(.bestOf)
        }
        return .bestOfCategory(slug: slug)
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
            if first == "events" { return Self.eventsHubDestination(url) }
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
            // pages such as /restaurants/open-now are not restaurants; they
            // narrow the list instead (IOS-AUDIT-FEAT-043).
            if let landing = Self.restaurantLandingDestination(path, url: url) { return landing }
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
        case "neighborhoods":
            return Self.neighborhoodDestination(rawId)
        case "best-of":
            return Self.bestOfDestination(rawId)
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

/// What a web restaurant landing page narrows the Dining list to
/// (IOS-AUDIT-FEAT-043). Built only by `DeepLinkHandler`, so `diet` is always
/// a key of `RestaurantsService.dietaryKeywords`.
struct RestaurantLinkFilter: Equatable {
    var openNow = false
    var newOpenings = false
    var diet: String?

    /// The diet a URL value names, if the Dining filter has it: trimmed and
    /// lowercased like the web's dietFromParam, then an exact key match, so
    /// a stray value can never reach the server's keyword or-group.
    static func diet(_ raw: String?) -> String? {
        guard let raw else { return nil }
        let slug = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return RestaurantsService.dietaryKeywords[slug] == nil ? nil : slug
    }

    /// The preset chip this link is exactly, so it shows lit; nil when a
    /// diet is added on top, since no preset describes that.
    var preset: RestaurantPreset? {
        guard diet == nil else { return nil }
        if openNow && !newOpenings { return .openNow }
        if newOpenings && !openNow { return .newOpenings }
        return nil
    }
}
