import Foundation
import CoreLocation
import Supabase

/// Fetches events from Supabase, matching the web app's useEvents hook patterns.
/// Supports full-text search, category filtering, date ranges, and pagination.
actor EventsService {
    static let shared = EventsService()

    private let supabase: SupabaseClient?  = SupabaseService.shared.client

    enum ServiceError: LocalizedError {
        case notConfigured
        var errorDescription: String? { "Supabase is not configured." }
    }

    /// Unwrap the optional client or throw.
    private func db() throws -> SupabaseClient {
        guard let supabase else { throw ServiceError.notConfigured }
        return supabase
    }

    // MARK: - Fetch Events

    struct EventsQuery {
        var searchText: String?
        var category: String?
        var cities: [String]?
        var freeOnly: Bool = false
        var dateStart: Date?
        var dateEnd: Date?
        var isFeatured: Bool?
        var sortBy: EventSortOption = .soonest
        var limit: Int = Config.defaultPageSize
        var offset: Int = 0
    }

    struct EventsResponse {
        let events: [Event]
        let totalCount: Int
        let hasMore: Bool
    }

    func fetchEvents(query: EventsQuery = EventsQuery()) async throws -> EventsResponse {
        try await withRetry { [self] in try await _fetchEvents(query: query) }
    }

    private func _fetchEvents(query: EventsQuery) async throws -> EventsResponse {
        let client = try db()

        // Visibility first, then the filters (IOS-DD-EVENTS-02). The old floor
        // was `date >= local start of today`, which listed events that ended
        // this morning and hid a festival in its second day; notOverFilter is
        // the web's rule and goes into the or-groups below.
        var request = client
            .from("events")
            .select("*", head: false, count: .exact)
            .neq("is_merged", value: true)
            .neq("is_hidden", value: true)
            .is("archived_at", value: nil)

        // Full-text search
        if let search = query.searchText, !search.isEmpty {
            request = request.textSearch("search_vector", query: search, config: "english", type: .websearch)
        }

        // Category filter
        if let category = query.category, !category.isEmpty {
            request = request.eq("category", value: category)
        }

        // Date range
        if let start = query.dateStart {
            let startStr = DateParser.toISO( start)
            request = request.gte("date", value: startStr)
        }
        if let end = query.dateEnd {
            let endStr = DateParser.toISO( end)
            request = request.lt("date", value: endStr)
        }

        // Featured only
        if query.isFeatured == true {
            request = request.eq("is_featured", value: true)
        }

        // Every or-group goes out as ONE `or=` param. Two separate `or=` params
        // (cities, then free) is what this used to send; combineOrGroups nests
        // them the way the web does (eventsHubQuery.ts).
        var orGroups = [Self.notOverFilter(now: Date())]

        // Area filter (IOS-DD-EVENTS-07): the web's exact city / bbox clauses.
        // A value that is not a known area (an older saved filter) keeps the old
        // substring match, quoted so a comma or paren cannot break the tree.
        if let cities = query.cities, !cities.isEmpty {
            let clauses = cities.sorted().map { value -> String in
                if let area = LocationArea(rawValue: value) { return area.filterClause }
                let pattern = Self.ilikeContains(value)
                return "city.ilike.\(pattern),location.ilike.\(pattern)"
            }
            orGroups.append(clauses.joined(separator: ","))
        }

        // Free events only - the web's definition (IOS-DD-EVENTS-06). A null
        // price is "not listed", not free.
        if query.freeOnly {
            orGroups.append(Self.freePriceFilter)
        }

        if let combined = Self.combineOrGroups(orGroups) {
            request = request.or(combined)
        }

        // Sort + Paginate + Execute (transforms must come after all filters).
        // Per-case fully-typed chain mirrors RestaurantsService.fetchRestaurants
        // — Supabase's PostgrestTransformBuilder doesn't expose a stable public
        // type name to declare a `var sorted:` of, so we duplicate the
        // pagination/execute block per case.
        //
        // Every case ends on `id` so offset paging over equal dates is stable;
        // without it a tie could land on two pages, or none (IOS-DD-EVENTS-03).
        let data: Data
        let count: Int?
        switch query.sortBy {
        case .soonest:
            let r = try await request
                .order("date", ascending: true)
                .order("id", ascending: true)
                .range(from: query.offset, to: query.offset + query.limit - 1)
                .execute()
            data = r.data; count = r.count
        case .featured:
            let r = try await request
                .order("is_featured", ascending: false)
                .order("date", ascending: true)
                .order("id", ascending: true)
                .range(from: query.offset, to: query.offset + query.limit - 1)
                .execute()
            data = r.data; count = r.count
        case .popularity:
            // trending_score is what calculate_trending_scores maintains and what
            // the web's For You rail ranks by; popularity_score is only
            // recomputed by an UPDATE trigger (IOS-DD-EVENTS-22).
            let r = try await request
                .order("trending_score", ascending: false, nullsFirst: false)
                .order("date", ascending: true)
                .order("id", ascending: true)
                .range(from: query.offset, to: query.offset + query.limit - 1)
                .execute()
            data = r.data; count = r.count
        }
        // One bad row no longer fails the page (IOS-DD-EVENTS-23).
        let events = try JSONDecoder().decode(LossyEventArray.self, from: data).events
        let total = count ?? events.count

        return EventsResponse(
            events: events,
            totalCount: total,
            hasMore: query.offset + query.limit < total
        )
    }

    // MARK: - Filter strings (IOS-DD-EVENTS-02 / 06 / 07)

    /// A timed event that started this long ago may still be on.
    static let recentStartGrace: TimeInterval = 2 * 3600

    /// Mirrors src/lib/eventPrice.ts FREE_PRICE_FILTER byte for byte: says
    /// "free" and names no non-zero dollar amount, or is exactly $0 / 0.
    static let freePriceFilter = "and(price.ilike.%free%,price.not.match.[$] *[1-9]),price.eq.$0,price.eq.0"

    /// "Not over yet", three arms, as notOverFilter in
    /// src/components/events/eventsHubQuery.ts: started in the last two hours
    /// or later; a run whose end_date is still ahead; or today's untimed
    /// marker (19:31:58 Central), matched exactly so an untimed row stays
    /// listed all day.
    static func notOverFilter(now: Date) -> String {
        let since = DateParser.toISO(now.addingTimeInterval(-recentStartGrace))
        return "date.gte.\(since),end_date.gte.\(DateParser.toISO(now)),date.eq.\(DateParser.toISO(untimedMarkerToday(now: now)))"
    }

    /// Today's Central date at 19:31:58 Central, as an instant.
    static func untimedMarkerToday(now: Date) -> Date {
        let calendar = DesMoinesTime.calendar
        var parts = calendar.dateComponents([.year, .month, .day], from: now)
        parts.hour = 19
        parts.minute = 31
        parts.second = 58
        return calendar.date(from: parts) ?? now
    }

    /// Several or-groups as one `or=` value. PostgREST reads a second `or=`
    /// param as a second filter on the same key, which is not what anyone
    /// meant; this is the web's `and(or(a),or(b))` nesting.
    static func combineOrGroups(_ groups: [String]) -> String? {
        switch groups.count {
        case 0: return nil
        case 1: return groups[0]
        default: return "and(" + groups.map { "or(\($0))" }.joined(separator: ",") + ")"
        }
    }

    /// A value for a PostgREST logic tree, double-quoted so a comma, paren or
    /// dot in it cannot end the clause. Inside quotes PostgREST reads `\X` as
    /// a literal X (QueryParams.hs pQuotedValue), so backslash and double
    /// quote are escaped once here. For an eq-style comparison; an ilike
    /// pattern goes through `ilikeContains`.
    static func postgrestQuoted(_ s: String) -> String {
        "\"" + quoteEscaped(s) + "\""
    }

    /// `"%<s>%"`: a quoted ilike "contains" pattern, the wildcards outside the
    /// escaping. The text is LIKE-escaped first (`%` -> `\%`, `_` -> `\_`,
    /// `\` -> `\\`) and then quote-escaped, because PostgREST strips one
    /// level of backslashes from a quoted value before Postgres sees the
    /// pattern. Escaping only once, as this first did, reached Postgres as a
    /// bare `%` wildcard.
    static func ilikeContains(_ s: String) -> String {
        "\"%" + quoteEscaped(likeEscaped(s)) + "%\""
    }

    /// `%<s>%` for a plain `.ilike(column, pattern:)` filter, LIKE-escaped
    /// and NOT quoted (IOS-DD-BROWSE-13). Outside a logic tree PostgREST
    /// passes the value to Postgres as is, so one level of escaping is right
    /// here; the quoted `ilikeContains` form is for `or=`/`and=` trees only.
    static func likeContainsPattern(_ s: String) -> String {
        "%" + likeEscaped(s) + "%"
    }

    /// LIKE's own escaping, default escape character `\`.
    private static func likeEscaped(_ s: String) -> String {
        s.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "%", with: "\\%")
            .replacingOccurrences(of: "_", with: "\\_")
    }

    /// Escaping for a PostgREST double-quoted value.
    private static func quoteEscaped(_ s: String) -> String {
        s.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
    }

    // MARK: - Weekend events (IOS-PARITY-004, IOS-DD-BROWSE-04)

    /// Every visible event that is on at some point this weekend: it starts
    /// in `[Friday, Monday)`, or it started earlier and its end_date reaches
    /// Friday (a festival or an exhibit still running). Unlike `fetchEvents`
    /// this does NOT floor at "now": the guide shows the whole Fri-Sun window
    /// even mid-weekend, matching the web `/weekend` curation.
    ///
    /// The old range query took `date` in the window only, so a three-day
    /// festival that opened Thursday vanished from its own weekend; it cut at
    /// 100 rows with no way for the screen to say so; it had no id tiebreak;
    /// and one undecodable row failed the whole weekend. `truncated` is true
    /// when the limit was reached.
    func fetchWeekendEvents(window: WeekendWindow, limit: Int = 250) async throws -> (events: [Event], truncated: Bool) {
        try await withRetry { [self] in
            let client = try db()
            let response = try await client
                .from("events")
                .select()
                .neq("is_merged", value: true)
                .neq("is_hidden", value: true)
                .is("archived_at", value: nil)
                .lt("date", value: DateParser.toISO(window.mondayStart))
                .or(Self.weekendOverlapFilter(window))
                .order("date", ascending: true)
                .order("id", ascending: true)
                .limit(limit)
                .execute()
            // Truncation counts the rows the server sent, dropped ones
            // included: a page that hit the limit is cut however many decoded.
            let page = try JSONDecoder().decode(LossyEventArray.self, from: response.data)
            return (events: page.events, truncated: page.events.count + page.droppedCount >= limit)
        }
    }

    /// Starts on or after Friday 00:00 Central, or ends on or after it.
    /// Together with `date < Monday` that is "on at some point this weekend".
    /// Unquoted, like `notOverFilter`: the values are ISO timestamps.
    static func weekendOverlapFilter(_ w: WeekendWindow) -> String {
        let friday = DateParser.toISO(w.fridayStart)
        return "date.gte.\(friday),end_date.gte.\(friday)"
    }

    // MARK: - Fetch Single Event

    func fetchEvent(id: String) async throws -> Event {
        try await withRetry { [self] in
            let client = try db()
            // Visible only (IOS-DD-EVENTS-02): a merged, hidden or archived row
            // answers PGRST116, which the detail screen reports as "no longer
            // available" instead of showing it as live.
            let event: Event = try await client
                .from("events")
                .select()
                .eq("id", value: id)
                .neq("is_merged", value: true)
                .neq("is_hidden", value: true)
                .is("archived_at", value: nil)
                .single()
                .execute()
                .value
            return event
        }
    }

    /// Shaped like PostgREST's "0 rows" answer so EventDetailViewModel.isNotFound
    /// (which reads a `code` child) treats an unresolvable slug the same way.
    struct SlugNotFound: Error {
        let code: String? = "PGRST116"
    }

    /// Resolves a web event slug, /events/<title>-<yyyy-mm-dd> (IOS-DD-PLATFORM-01).
    /// Fetches the visible rows in the slug's Central day window and picks one
    /// the way the web's pickSlugCandidate does; throws SlugNotFound otherwise.
    func fetchEvent(slug: String) async throws -> Event {
        guard let date = EventSlug.parseDate(slug), let window = EventSlug.dayWindow(date) else {
            throw SlugNotFound()
        }
        struct Row: Decodable {
            let id: String
            let title: String?
            let date: String?
            let eventStartUtc: String?
            enum CodingKeys: String, CodingKey {
                case id, title, date
                case eventStartUtc = "event_start_utc"
            }
        }
        let rows: [Row] = try await withRetry { [self] in
            let client = try db()
            let found: [Row] = try await client
                .from("events")
                .select("id,title,date,event_start_utc")
                .neq("is_merged", value: true)
                .neq("is_hidden", value: true)
                .is("archived_at", value: nil)
                .gte("date", value: DateParser.toISO(window.from))
                .lt("date", value: DateParser.toISO(window.to))
                .limit(50)
                .execute()
                .value
            return found
        }
        let candidates = rows.map {
            EventSlug.Candidate(id: $0.id, title: $0.title, start: DateParser.parse($0.eventStartUtc ?? $0.date))
        }
        guard let match = EventSlug.pick(slug, from: candidates) else { throw SlugNotFound() }
        return try await fetchEvent(id: match.id)
    }

    /// The row a merged duplicate now points at, read without the visibility
    /// filters, or nil (IOS-DD-PLATFORM-03). A link to a merged event follows
    /// this instead of reporting "no longer available".
    func fetchMergedSurvivorId(id: String) async -> String? {
        struct Row: Decodable {
            let id: String
            let isMerged: Bool?
            let mergedInto: String?
            let isHidden: Bool?
            enum CodingKeys: String, CodingKey {
                case id
                case isMerged = "is_merged"
                case mergedInto = "merged_into"
                case isHidden = "is_hidden"
            }
        }
        guard let client = try? db() else { return nil }
        let rows: [Row]? = try? await client
            .from("events")
            .select("id,is_merged,merged_into,is_hidden")
            .eq("id", value: id)
            .limit(1)
            .execute()
            .value
        guard let row = rows?.first, row.isMerged == true, row.isHidden != true,
              let survivor = row.mergedInto, survivor != id else { return nil }
        return survivor
    }

    // MARK: - Fetch by or-group (IOS-PARITY-006 content hubs, IOS-DD-BROWSE-22)

    /// Upcoming visible events matching a hub's or-group (`ContentHub.eventOrGroup`),
    /// soonest first, with `id` as the tiebreak. `until` caps the start date
    /// (exclusive) so a hub can ask for the next two weeks rather than the
    /// next N rows on any date (IOS-DD-BROWSE-23).
    ///
    /// Replaces the category-terms ilike version: since 20260919000003
    /// events.category holds exactly the canonical EventCategory values, so
    /// most of those terms could never match.
    func fetchEventsByOrGroup(_ group: String, limit: Int = 20, until: Date? = nil) async throws -> [Event] {
        guard !group.isEmpty else { return [] }
        return try await withRetry { [self] in
            let client = try db()
            let orClause = Self.combineOrGroups([Self.notOverFilter(now: Date()), group]) ?? group
            var request = client
                .from("events")
                .select()
                .neq("is_merged", value: true)
                .neq("is_hidden", value: true)
                .is("archived_at", value: nil)
                .or(orClause)
            if let until {
                request = request.lt("date", value: DateParser.toISO(until))
            }
            let response = try await request
                .order("date", ascending: true)
                .order("id", ascending: true)
                .limit(limit)
                .execute()
            return try JSONDecoder().decode(LossyEventArray.self, from: response.data).events
        }
    }

    // MARK: - Search Events (Fuzzy Fallback)

    func fuzzySearchEvents(query: String, limit: Int = 20) async throws -> [Event] {
        struct FuzzyParams: Encodable {
            let search_query: String
            let search_limit: Int
        }

        let client = try db()
        let events: [Event] = try await client
            .rpc("fuzzy_search_events", params: FuzzyParams(search_query: query, search_limit: limit))
            .execute()
            .value
        return events
    }

    // MARK: - Nearby Events

    /// `until` caps the start date (IOS-DD-MAP-01), so the map can ask for
    /// the nearest events of the next two weeks rather than the nearest 50 on
    /// any date. The RPC takes it as the optional `p_until`; a backend without
    /// migration 20261013000001 rejects the extra argument, and the table
    /// path below applies it instead.
    func fetchNearbyEvents(latitude: Double, longitude: Double, radiusMiles: Double = 30, limit: Int = 50, until: Date? = nil) async throws -> [Event] {
        // Try PostGIS RPC first for optimal performance
        if let rpcResults = try? await fetchNearbyEventsViaRPC(latitude: latitude, longitude: longitude, radiusMiles: radiusMiles, limit: limit, until: until),
           !rpcResults.isEmpty {
            return rpcResults
        }
        // Fallback: direct table query with client-side distance filtering
        return try await fetchNearbyEventsViaTable(latitude: latitude, longitude: longitude, radiusMiles: radiusMiles, limit: limit, until: until)
    }

    private func fetchNearbyEventsViaRPC(latitude: Double, longitude: Double, radiusMiles: Double, limit: Int, until: Date? = nil) async throws -> [Event] {
        struct NearbyParams: Encodable {
            let user_lat: Double
            let user_lon: Double
            let radius_meters: Int
            let search_limit: Int
            /// Omitted when nil (synthesized Encodable uses encodeIfPresent),
            /// so the four-argument call older backends know is unchanged.
            let p_until: String?
        }

        let client = try db()
        let events: [Event] = try await client
            .rpc("search_events_near_location", params: NearbyParams(
                user_lat: latitude,
                user_lon: longitude,
                radius_meters: Int(radiusMiles * 1609.34),
                search_limit: limit,
                p_until: until.map { DateParser.toISO($0) }
            ))
            .execute()
            .value
        return events
    }

    private func fetchNearbyEventsViaTable(latitude: Double, longitude: Double, radiusMiles: Double, limit: Int, until: Date? = nil) async throws -> [Event] {
        let client = try db()

        // IOS-AUDIT-PERF-027: the bounding box goes BEFORE the limit. Without it
        // this took the next `limit` events by date across all 1,246 rows and then
        // filtered by distance, so a user near a quiet part of the metro could get
        // an empty list while events in radius sat past the cutoff.
        let box = GeoBoundingBox(centerLat: latitude, centerLng: longitude, radiusMiles: radiusMiles)

        var query = client
            .from("events")
            .select()
            .neq("is_merged", value: true)
            .neq("is_hidden", value: true)
            .is("archived_at", value: nil)
            .or(Self.notOverFilter(now: Date()))
            .gte("latitude", value: box.minLat)
            .lte("latitude", value: box.maxLat)
            .gte("longitude", value: box.minLng)
            .lte("longitude", value: box.maxLng)
        if let until {
            query = query.lte("date", value: DateParser.toISO(until))
        }
        let events: [Event] = try await query
            .order("date", ascending: true)
            .limit(limit)
            .execute()
            .value

        let center = CLLocation(latitude: latitude, longitude: longitude)
        let radiusMeters = radiusMiles * 1609.34
        return events.filter { event in
            guard let coord = event.coordinate else { return false }
            let loc = CLLocation(latitude: coord.latitude, longitude: coord.longitude)
            return center.distance(from: loc) <= radiusMeters
        }
    }

    // MARK: - Featured Events

    func fetchFeaturedEvents(limit: Int = 10) async throws -> [Event] {
        let client = try db()

        let events: [Event] = try await client
            .from("events")
            .select()
            .eq("is_featured", value: true)
            .neq("is_merged", value: true)
            .neq("is_hidden", value: true)
            .is("archived_at", value: nil)
            .or(Self.notOverFilter(now: Date()))
            .order("date", ascending: true)
            .limit(limit)
            .execute()
            .value
        return events
    }

    // MARK: - Related Events

    func fetchRelatedEvents(eventId: String, category: String, limit: Int = 6) async throws -> [Event] {
        let client = try db()

        let events: [Event] = try await client
            .from("events")
            .select()
            .eq("category", value: category)
            .neq("id", value: eventId)
            .neq("is_merged", value: true)
            .neq("is_hidden", value: true)
            .is("archived_at", value: nil)
            .or(Self.notOverFilter(now: Date()))
            .order("date", ascending: true)
            .limit(limit)
            .execute()
            .value
        return events
    }

    // MARK: - View counting (IOS-DD-EVENTS-22)

    /// Ids already counted this app session.
    private var recordedViewIds: Set<String> = []

    /// Whether a view of `eventId` should be sent: true the first time per
    /// session, false after. Split out so the dedupe is testable offline.
    func shouldRecord(_ eventId: String) -> Bool {
        recordedViewIds.insert(eventId).inserted
    }

    /// Counts one view of an event through the same RPC the web's
    /// useViewTracking calls, so iOS traffic feeds view_count and the trending
    /// score. Fire-and-forget: a failure is not the user's problem.
    func recordView(eventId: String) async {
        guard shouldRecord(eventId), let client = try? db() else { return }
        struct Params: Encodable { let event_id: String }
        _ = try? await client.rpc("increment_event_view", params: Params(event_id: eventId)).execute()
    }
}

/// What EventDetailViewModel needs from EventsService, and nothing else
/// (IOS-AUDIT-TEST-006).
///
/// A ROLE interface, deliberately. EventsService has around forty methods; a
/// protocol mirroring it would be unwritable and unmaintainable, and every
/// caller would have to stub methods it never calls. This declares the two the
/// event detail screen actually uses, so a fake in a test is a dozen lines.
///
/// Same shape as `AuthProviding` (IOS-AUDIT-TEST-002): a protocol beside the
/// service, a retroactive conformance, and an initialiser defaulting to
/// `.shared` so no existing call site changes.
protocol EventDetailProviding: Sendable {
    func fetchEvent(id: String) async throws -> Event
    func fetchRelatedEvents(eventId: String, category: String, limit: Int) async throws -> [Event]
}

extension EventDetailProviding {
    /// The service's own default limit, kept in one place rather than repeated
    /// at the call site - a protocol requirement cannot carry a default.
    func fetchRelatedEvents(eventId: String, category: String) async throws -> [Event] {
        try await fetchRelatedEvents(eventId: eventId, category: category, limit: 6)
    }
}

extension EventsService: EventDetailProviding {}

/// What SearchViewModel needs from EventsService (IOS-AUDIT-TEST-006).
///
/// Separate from `EventDetailProviding` on purpose: two screens, two roles, two
/// small protocols. Merging them would give each fake methods it never uses,
/// which is how role interfaces turn back into a mirror of the service.
/// One page of events for a query. The narrowest useful role, and the only thing
/// DiscoverViewModel needs.
protocol EventPageProviding: Sendable {
    func fetchEvents(query: EventsService.EventsQuery) async throws -> EventsService.EventsResponse
}

/// Search additionally needs the fuzzy fallback. Inherits rather than repeating
/// the page method, so a Discover fake stubs one method and a Search fake stubs
/// two - neither stubs anything it does not use (IOS-AUDIT-TEST-006 AC4).
protocol EventSearchProviding: EventPageProviding {
    func fuzzySearchEvents(query: String, limit: Int) async throws -> [Event]
}

extension EventSearchProviding {
    func fuzzySearchEvents(query: String) async throws -> [Event] {
        try await fuzzySearchEvents(query: query, limit: 20)
    }
}

extension EventsService: EventSearchProviding {}

/// What the Home feed's EventsViewModel needs (IOS-DD-EVENTS-03): a page, the
/// fuzzy fallback for a search with no hits (IOS-DD-EVENTS-19), and the
/// featured rail. Inherits the search role rather than widening
/// EventPageProviding, so the Discover and Search fakes stay as they are.
protocol EventFeedProviding: EventSearchProviding {
    func fetchFeaturedEvents(limit: Int) async throws -> [Event]
}

extension EventsService: EventFeedProviding {}
