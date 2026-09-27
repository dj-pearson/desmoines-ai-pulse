import Foundation
import Supabase

/// The four things a user can save. The raw value is also the prefix of the
/// in-flight and pending-removal keys ("event:<id>").
enum FavoriteKind: String, CaseIterable {
    case event, restaurant, attraction, article
}

/// One row of `content_favorites`. Internal so a test can check the JSON the
/// insert sends (IOS-DD-SAVED-03).
struct ContentFavoriteRow: Encodable, Equatable {
    let user_id: String
    let content_type: String
    let content_id: String
}

/// Manages user favorites for events, restaurants, attractions and articles.
///
/// - Events: `user_event_interactions` (interaction_type = 'favorite').
/// - Restaurants and attractions: `content_favorites`, the table the web reads
///   and writes (IOS-DD-SAVED-03). Restaurant loads also read the legacy
///   `user_restaurant_interactions` favorites for one release, so saves made by
///   older binaries stay visible; nothing writes that table or
///   `user_attraction_interactions` any more (the latter never existed in
///   production, so attraction saves used to live on the device only).
/// - Articles: `user_article_interactions` when it exists, else on-device.
///
/// A save only falls back to the device when the table is missing (42P01 /
/// PGRST205). Any other failure, offline included, is thrown so the caller can
/// say so; faking success lost or resurrected saves (IOS-DD-SAVED-02).
@MainActor
@Observable
final class FavoritesService {
    static let shared = FavoritesService()

    // MARK: - State

    private(set) var favoriteEventIds: Set<String> = []
    private(set) var favoriteRestaurantIds: Set<String> = []
    private(set) var favoriteAttractionIds: Set<String> = []
    /// Saved articles/guides (IOS-PARITY-002). Intentionally kept OUT of the
    /// premium favorites cap below — saving editorial content is always free
    /// and shouldn't consume the "3 favorites" gate that covers
    /// events/restaurants/attractions.
    private(set) var favoriteArticleIds: Set<String> = []
    private(set) var isLoading = false

    /// True when the last `loadFavorites()` could not read one of the tables
    /// for a reason other than cancellation or a missing table. The sets keep
    /// their previous contents in that case (IOS-DD-SAVED-01).
    private(set) var lastLoadFailed = false

    /// "<kind>:<id>" keys with a network write in flight. A second tap on the
    /// same heart is ignored until the first settles (IOS-DD-SAVED-05).
    private(set) var inFlightIds: Set<String> = []

    /// Adds awaiting the network, counted against the cap so fast taps on
    /// several hearts cannot all pass the check before any lands.
    private var pendingAddCount = 0

    /// "<kind>:<id>" keys the Saved tab has removed optimistically and not yet
    /// committed (undo window). Every read below treats them as not saved, so
    /// hearts elsewhere and the counts agree at once (IOS-DD-SAVED-08).
    private(set) var pendingRemovalIds: Set<String> = []

    /// Saved events that are over, as last arranged by the Saved tab. Lets the
    /// cap prompt offer "clear past events" (IOS-DD-SAVED-17).
    var pastEventFavoriteCount = 0

    private let supabase: SupabaseClient? = SupabaseService.shared.client
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    private func db() throws -> SupabaseClient {
        guard let supabase else { throw FavoritesError.notConfigured }
        return supabase
    }

    private var currentUserId: String? {
        AuthService.shared.currentUser?.id.uuidString
    }

    /// Restaurants and attractions in `content_favorites`. Internal only so
    /// the row test can name the content types.
    enum ContentKind: String {
        case restaurant, attraction
    }

    nonisolated static func key(_ kind: FavoriteKind, _ id: String) -> String {
        "\(kind.rawValue):\(id)"
    }

    // MARK: - Error classification

    /// A PostgREST error code, read structurally like
    /// RestaurantsService.isMissingFunctionError so a test can throw a local
    /// struct with a `code`.
    nonisolated static func errorCode(_ error: Error) -> String? {
        if let postgrest = error as? PostgrestError { return postgrest.code }
        return Mirror(reflecting: error).children.first { $0.label == "code" }?.value as? String
    }

    nonisolated private static func errorHint(_ error: Error) -> String? {
        if let postgrest = error as? PostgrestError { return postgrest.hint }
        return Mirror(reflecting: error).children.first { $0.label == "hint" }?.value as? String
    }

    /// A cancelled task or request. Leaving a screen cancels its `.task`, and
    /// that used to empty the favorite sets app-wide (IOS-DD-SAVED-01).
    nonisolated static func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if let urlError = error as? URLError, urlError.code == .cancelled { return true }
        let ns = error as NSError
        return ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled
    }

    /// The table is not there (Postgres 42P01, or PostgREST's schema-cache
    /// PGRST205). The only case where the device is the right store.
    nonisolated static func isMissingTableError(_ error: Error) -> Bool {
        let code = errorCode(error)
        return code == "42P01" || code == "PGRST205"
    }

    /// enforce_favorites_limit refused the insert: ERRCODE PT402 with HINT
    /// upgrade_required (20260918000001). The hint survives a proxy that
    /// rewrites the status, so either one counts (IOS-DD-SAVED-04).
    nonisolated static func isServerCapError(_ error: Error) -> Bool {
        errorCode(error) == "PT402" || errorHint(error) == "upgrade_required"
    }

    nonisolated private static func isDuplicate(_ error: Error) -> Bool {
        errorCode(error) == "23505"
    }

    /// Turns a server cap refusal into the same error and paywall the client
    /// cap produces.
    private func mapCapError(_ error: Error) -> Error {
        guard Self.isServerCapError(error) else { return error }
        NotificationCenter.default.post(name: .favoritesLimitReached, object: nil)
        let limit = favoritesLimit
        return FavoritesError.limitReached(max: limit > 0 ? limit : 3)
    }

    // MARK: - Favorites Cap (IOS-SUB-011)

    /// Total saved items across events, restaurants and attractions. The free
    /// cap (`SubscriptionTier.free.maxFavorites` = 3) is a TOTAL, matching the
    /// web "Save up to 3 favorites". Items pending removal are not counted.
    var totalFavoritesCount: Int {
        visibleCount(.event) + visibleCount(.restaurant) + visibleCount(.attraction)
    }

    /// The current user's favorites limit (`-1` = unlimited). Resolved from the
    /// user's ACTUAL tier (StoreKit + backend), not hardcoded to free — so
    /// Insider/VIP get unlimited saves.
    private var favoritesLimit: Int {
        StoreKitService.shared.currentTier.maxFavorites
    }

    /// Whether one more save would pass the cap. A limit of 0 or below means
    /// no cap, as `guard limit > 0` always did.
    nonisolated static func wouldExceedCap(current: Int, pending: Int, limit: Int) -> Bool {
        guard limit > 0 else { return false }
        return current + pending >= limit
    }

    /// Throws (and broadcasts) when adding one more favorite would exceed the
    /// free cap. The notification drives the single app-level upsell paywall
    /// (see MainTabView), so every save surface gets the soft gate for free.
    private func enforceFavoritesCap() throws {
        let limit = favoritesLimit
        guard Self.wouldExceedCap(current: totalFavoritesCount, pending: pendingAddCount, limit: limit) else { return }
        NotificationCenter.default.post(name: .favoritesLimitReached, object: nil)
        throw FavoritesError.limitReached(max: limit)
    }

    /// Whether an error thrown by a toggle was the favorites cap, so callers can
    /// suppress a redundant error toast (the global paywall already shows).
    static func isLimitReached(_ error: Error) -> Bool {
        if case FavoritesError.limitReached = error { return true }
        return false
    }

    // MARK: - Generic state

    private func storedIds(_ kind: FavoriteKind) -> Set<String> {
        switch kind {
        case .event: return favoriteEventIds
        case .restaurant: return favoriteRestaurantIds
        case .attraction: return favoriteAttractionIds
        case .article: return favoriteArticleIds
        }
    }

    private func setIds(_ kind: FavoriteKind, _ ids: Set<String>) {
        switch kind {
        case .event: favoriteEventIds = ids
        case .restaurant: favoriteRestaurantIds = ids
        case .attraction: favoriteAttractionIds = ids
        case .article: favoriteArticleIds = ids
        }
    }

    private func insertId(_ kind: FavoriteKind, _ id: String) {
        var ids = storedIds(kind)
        ids.insert(id)
        setIds(kind, ids)
    }

    private func removeId(_ kind: FavoriteKind, _ id: String) {
        var ids = storedIds(kind)
        ids.remove(id)
        setIds(kind, ids)
    }

    private func visibleCount(_ kind: FavoriteKind) -> Int {
        let ids = storedIds(kind)
        let prefix = kind.rawValue + ":"
        let pending = pendingRemovalIds.reduce(0) { count, key in
            guard key.hasPrefix(prefix) else { return count }
            return ids.contains(String(key.dropFirst(prefix.count))) ? count + 1 : count
        }
        return ids.count - pending
    }

    /// Saved ids of one kind, without those pending removal.
    func visibleIds(_ kind: FavoriteKind) -> Set<String> {
        storedIds(kind).filter { !pendingRemovalIds.contains(Self.key(kind, $0)) }
    }

    func isFavorited(kind: FavoriteKind, id: String) -> Bool {
        storedIds(kind).contains(id) && !pendingRemovalIds.contains(Self.key(kind, id))
    }

    func isInFlight(kind: FavoriteKind, id: String) -> Bool {
        inFlightIds.contains(Self.key(kind, id))
    }

    // MARK: - Pending removal (undo window)

    func markPendingRemoval(kind: FavoriteKind, id: String) {
        pendingRemovalIds.insert(Self.key(kind, id))
    }

    func clearPendingRemoval(kind: FavoriteKind, id: String) {
        pendingRemovalIds.remove(Self.key(kind, id))
    }

    func isPendingRemoval(kind: FavoriteKind, id: String) -> Bool {
        pendingRemovalIds.contains(Self.key(kind, id))
    }

    // MARK: - Load

    func loadFavorites() async {
        isLoading = true
        lastLoadFailed = false
        if let userId = currentUserId {
            migrateLegacyLocalFavorites(userId: userId)
        }
        async let events: () = loadEventFavorites()
        async let restaurants: () = loadContentFavorites(.restaurant)
        async let attractions: () = loadContentFavorites(.attraction)
        async let articles: () = loadArticleFavorites()
        _ = await (events, restaurants, attractions, articles)
        isLoading = false
    }

    private func loadEventFavorites() async {
        guard let userId = currentUserId else {
            favoriteEventIds = []
            return
        }

        do {
            let client = try db()
            struct FavoriteRow: Decodable {
                let event_id: String
            }
            let rows: [FavoriteRow] = try await client
                .from("user_event_interactions")
                .select("event_id")
                .eq("user_id", value: userId)
                .eq("interaction_type", value: "favorite")
                .execute()
                .value

            favoriteEventIds = Set(rows.map(\.event_id))
        } catch {
            // Keep what we had: an empty set here hid every heart and let the
            // client cap read 0 (IOS-DD-SAVED-01).
            if !Self.isCancellation(error) { lastLoadFailed = true }
        }
    }

    /// Restaurants or attractions from `content_favorites`, plus (restaurants
    /// only) the legacy table, plus anything saved on the device while the
    /// table was missing. Device-only ids are uploaded once the table answers.
    private func loadContentFavorites(_ kind: ContentKind) async {
        let favoriteKind: FavoriteKind = kind == .restaurant ? .restaurant : .attraction
        guard let userId = currentUserId else {
            setIds(favoriteKind, [])
            return
        }
        let base = Self.localBase(favoriteKind)
        let local = localIds(base, userId: userId)

        let client: SupabaseClient
        var ids: Set<String>
        do {
            client = try db()
            struct Row: Decodable { let content_id: String }
            let rows: [Row] = try await client
                .from("content_favorites")
                .select("content_id")
                .eq("user_id", value: userId)
                .eq("content_type", value: kind.rawValue)
                .execute()
                .value
            ids = Set(rows.map(\.content_id))
        } catch {
            if Self.isCancellation(error) { return }
            if Self.isMissingTableError(error) {
                setIds(favoriteKind, local)
            } else {
                lastLoadFailed = true
            }
            return
        }

        if kind == .restaurant {
            // Saves written by older binaries (one release of dual-read). A
            // failure here does not fail the load.
            struct LegacyRow: Decodable { let restaurant_id: String }
            if let legacy: [LegacyRow] = try? await client
                .from("user_restaurant_interactions")
                .select("restaurant_id")
                .eq("user_id", value: userId)
                .eq("interaction_type", value: "favorite")
                .execute()
                .value {
                ids.formUnion(legacy.map(\.restaurant_id))
            }
        }

        let localOnly = local.subtracting(ids)
        setIds(favoriteKind, ids.union(localOnly))
        guard !localOnly.isEmpty else { return }

        // Upload device-only saves. They stay visible and counted until the
        // server has them.
        var remaining = local
        for id in localOnly.sorted() {
            do {
                try await client
                    .from("content_favorites")
                    .insert(ContentFavoriteRow(user_id: userId, content_type: kind.rawValue, content_id: id))
                    .execute()
                remaining.remove(id)
            } catch {
                if Self.isDuplicate(error) {
                    remaining.remove(id)
                } else if Self.isServerCapError(error) || Self.isCancellation(error) {
                    break
                }
                // Anything else: keep it on the device and try next load.
            }
        }
        // Ids that are on the server now can leave the device copy.
        remaining.subtract(ids)
        setLocal(base, userId: userId, remaining)
    }

    // MARK: - Add / remove (idempotent)

    /// Saves. An id already in the set (hidden by a pending removal) only
    /// has its mark cleared; anything else is inserted. The toggles call this.
    func addFavorite(kind: FavoriteKind, id: String) async throws {
        let key = Self.key(kind, id)
        // Still stored and only hidden by a pending removal (the Saved tab's
        // undo window): the row was never deleted, so clearing the mark is the
        // whole re-save. An insert here would hit the server cap at 3 of 3 and
        // show the paywall for an item the user already has.
        if storedIds(kind).contains(id) {
            pendingRemovalIds.remove(key)
            return
        }

        inFlightIds.insert(key)
        defer { inFlightIds.remove(key) }

        switch kind {
        case .article:
            try await addArticleFavorite(articleId: id)
        case .event, .restaurant, .attraction:
            guard let userId = currentUserId else { throw FavoritesError.notAuthenticated }
            try enforceFavoritesCap()
            pendingAddCount += 1
            defer { pendingAddCount -= 1 }
            let client = try db()
            if kind == .event {
                struct InsertRow: Encodable {
                    let user_id: String
                    let event_id: String
                    let interaction_type: String
                }
                do {
                    try await client
                        .from("user_event_interactions")
                        .insert(InsertRow(user_id: userId, event_id: id, interaction_type: "favorite"))
                        .execute()
                } catch let error where Self.isDuplicate(error) {
                    // Saved from another device already.
                } catch {
                    throw mapCapError(error)
                }
            } else {
                let contentKind: ContentKind = kind == .restaurant ? .restaurant : .attraction
                do {
                    try await client
                        .from("content_favorites")
                        .insert(ContentFavoriteRow(user_id: userId, content_type: contentKind.rawValue, content_id: id))
                        .execute()
                } catch let error where Self.isDuplicate(error) {
                    // Already saved (web or another device).
                } catch let error where Self.isMissingTableError(error) {
                    updateLocal(Self.localBase(kind), userId: userId, id: id, add: true)
                } catch {
                    throw mapCapError(error)
                }
            }
        }

        insertId(kind, id)
        pendingRemovalIds.remove(key)
        if kind != .article {
            SoftPaywallService.shared.considerAfterFavorite(totalFavorites: totalFavoritesCount)
        }
    }

    /// Removes without consulting the in-memory set. The toggles call this.
    func removeFavorite(kind: FavoriteKind, id: String) async throws {
        let key = Self.key(kind, id)
        inFlightIds.insert(key)
        defer { inFlightIds.remove(key) }

        switch kind {
        case .article:
            try await removeArticleFavorite(articleId: id)
        case .event:
            guard let userId = currentUserId else { throw FavoritesError.notAuthenticated }
            let client = try db()
            try await client
                .from("user_event_interactions")
                .delete()
                .eq("user_id", value: userId)
                .eq("event_id", value: id)
                .eq("interaction_type", value: "favorite")
                .execute()
        case .restaurant, .attraction:
            guard let userId = currentUserId else { throw FavoritesError.notAuthenticated }
            let client = try db()
            let contentKind: ContentKind = kind == .restaurant ? .restaurant : .attraction
            do {
                try await client
                    .from("content_favorites")
                    .delete()
                    .eq("user_id", value: userId)
                    .eq("content_type", value: contentKind.rawValue)
                    .eq("content_id", value: id)
                    .execute()
            } catch let error where Self.isMissingTableError(error) {
                // Device-only store; handled below.
            }
            if kind == .restaurant {
                // Legacy row from an older binary. Best effort only.
                _ = try? await client
                    .from("user_restaurant_interactions")
                    .delete()
                    .eq("user_id", value: userId)
                    .eq("restaurant_id", value: id)
                    .eq("interaction_type", value: "favorite")
                    .execute()
            }
            updateLocal(Self.localBase(kind), userId: userId, id: id, add: false)
        }

        removeId(kind, id)
        pendingRemovalIds.remove(key)
    }

    /// Adds or removes depending on the visible state. A tap while the same
    /// item is in flight returns the current state without a network call.
    private func toggle(_ kind: FavoriteKind, id: String) async throws -> Bool {
        if kind != .article, currentUserId == nil {
            throw FavoritesError.notAuthenticated
        }
        if isInFlight(kind: kind, id: id) {
            return isFavorited(kind: kind, id: id)
        }
        if isFavorited(kind: kind, id: id) {
            try await removeFavorite(kind: kind, id: id)
            return false
        } else {
            try await addFavorite(kind: kind, id: id)
            return true
        }
    }

    // ================================================================
    // MARK: - Event Favorites
    // ================================================================

    /// Toggle an event favorite. Returns `true` if now favorited, `false` if removed.
    @discardableResult
    func toggleFavorite(eventId: String) async throws -> Bool {
        try await toggle(.event, id: eventId)
    }

    /// Removes several event favorites at once, e.g. "Clear past events"
    /// (IOS-DD-SAVED-17). Chunked so the `in` filter stays short.
    func removeEventFavorites(ids: [String]) async throws {
        guard let userId = currentUserId else { throw FavoritesError.notAuthenticated }
        let client = try db()
        for chunk in Self.chunks(ids, size: 100) {
            try await client
                .from("user_event_interactions")
                .delete()
                .eq("user_id", value: userId)
                .eq("interaction_type", value: "favorite")
                .in("event_id", values: chunk)
                .execute()
            favoriteEventIds.subtract(chunk)
            for id in chunk { pendingRemovalIds.remove(Self.key(.event, id)) }
        }
    }

    /// Ids per `in` request, and the most of one kind the Saved tab fetches.
    static let fetchChunkSize = 100
    static let maxFetchIds = 500

    /// Splits `ids` into runs of `size`, order kept.
    nonisolated static func chunks(_ ids: [String], size: Int) -> [[String]] {
        guard !ids.isEmpty else { return [] }
        guard size > 0 else { return [ids] }
        return stride(from: 0, to: ids.count, by: size).map {
            Array(ids[$0..<min($0 + size, ids.count)])
        }
    }

    /// Every visible favorite Event for `ids`, fetched in chunks of 100
    /// (IOS-DD-SAVED-09). Merged, hidden and archived rows are left out, as
    /// every EventsService read does (IOS-DD-SAVED-22), and one bad row cannot
    /// blank the section.
    func fetchFavoriteEvents(ids: [String]) async throws -> [Event] {
        var collected: [Event] = []
        for chunk in Self.chunks(Array(ids.prefix(Self.maxFetchIds)), size: Self.fetchChunkSize) {
            let events: [Event] = try await withRetry {
                let client = try self.db()
                let response = try await client
                    .from("events")
                    .select()
                    .in("id", values: chunk)
                    .neq("is_merged", value: true)
                    .neq("is_hidden", value: true)
                    .is("archived_at", value: nil)
                    .execute()
                return try JSONDecoder().decode(LossyEventArray.self, from: response.data).events
            }
            collected.append(contentsOf: events)
        }
        return collected
    }

    func isEventFavorited(_ eventId: String) -> Bool {
        isFavorited(kind: .event, id: eventId)
    }

    // For backwards compatibility
    func isFavorited(_ eventId: String) -> Bool {
        isEventFavorited(eventId)
    }

    // ================================================================
    // MARK: - Restaurant Favorites
    // ================================================================

    /// Toggle a restaurant favorite. Returns `true` if now favorited, `false` if removed.
    @discardableResult
    func toggleRestaurantFavorite(restaurantId: String) async throws -> Bool {
        try await toggle(.restaurant, id: restaurantId)
    }

    /// Every visible favorite Restaurant for `ids`, chunked. Merged rows are
    /// left out (IOS-DD-SAVED-22).
    func fetchFavoriteRestaurants(ids: [String]) async throws -> [Restaurant] {
        var collected: [Restaurant] = []
        for chunk in Self.chunks(Array(ids.prefix(Self.maxFetchIds)), size: Self.fetchChunkSize) {
            let rows: [Restaurant] = try await withRetry {
                let client = try self.db()
                return try await client
                    .from("restaurants")
                    .select()
                    .in("id", values: chunk)
                    .neq("is_merged", value: true)
                    .order("name", ascending: true)
                    .execute()
                    .value
            }
            collected.append(contentsOf: rows)
        }
        return collected
    }

    func isRestaurantFavorited(_ restaurantId: String) -> Bool {
        isFavorited(kind: .restaurant, id: restaurantId)
    }

    // ================================================================
    // MARK: - Attraction Favorites
    // ================================================================

    /// Toggle an attraction favorite. Returns `true` if now favorited, `false` if removed.
    @discardableResult
    func toggleFavoriteAttraction(attractionId: String) async throws -> Bool {
        try await toggle(.attraction, id: attractionId)
    }

    /// Every favorite Attraction for `ids`, chunked. The attractions table has
    /// no merged or hidden flag.
    func fetchFavoriteAttractions(ids: [String]) async throws -> [Attraction] {
        var collected: [Attraction] = []
        for chunk in Self.chunks(Array(ids.prefix(Self.maxFetchIds)), size: Self.fetchChunkSize) {
            let rows: [Attraction] = try await withRetry {
                let client = try self.db()
                return try await client
                    .from("attractions")
                    .select()
                    .in("id", values: chunk)
                    .order("name", ascending: true)
                    .execute()
                    .value
            }
            collected.append(contentsOf: rows)
        }
        return collected
    }

    func isAttractionFavorited(_ attractionId: String) -> Bool {
        isFavorited(kind: .attraction, id: attractionId)
    }

    // ================================================================
    // MARK: - Article Favorites (IOS-PARITY-002)
    // ================================================================
    //
    // Saved guides/blog posts. Uses `user_article_interactions` when present,
    // falling back to on-device UserDefaults only while that table is missing
    // (it is not in production yet). These are NOT cap-enforced: editorial
    // saves are always free.

    private func loadArticleFavorites() async {
        let base = Self.localBase(.article)
        guard let userId = currentUserId else {
            favoriteArticleIds = localIds(base, userId: nil)
            return
        }
        let local = localIds(base, userId: userId)

        do {
            let client = try db()
            struct FavoriteRow: Decodable {
                let article_id: String
            }
            let rows: [FavoriteRow] = try await client
                .from("user_article_interactions")
                .select("article_id")
                .eq("user_id", value: userId)
                .eq("interaction_type", value: "favorite")
                .execute()
                .value

            favoriteArticleIds = Set(rows.map(\.article_id)).union(local)
        } catch {
            if Self.isCancellation(error) { return }
            if Self.isMissingTableError(error) {
                favoriteArticleIds = local
            } else {
                lastLoadFailed = true
            }
        }
    }

    /// Toggle an article favorite. Returns `true` if now saved, `false` if removed.
    @discardableResult
    func toggleFavoriteArticle(articleId: String) async throws -> Bool {
        try await toggle(.article, id: articleId)
    }

    private func addArticleFavorite(articleId: String) async throws {
        let base = Self.localBase(.article)
        guard let userId = currentUserId else {
            // Signed-out reading still allows saving locally (the guest key,
            // merged into the account on sign-in).
            updateLocal(base, userId: nil, id: articleId, add: true)
            return
        }
        struct InsertRow: Encodable {
            let user_id: String
            let article_id: String
            let interaction_type: String
        }
        do {
            let client = try db()
            try await client
                .from("user_article_interactions")
                .insert(InsertRow(user_id: userId, article_id: articleId, interaction_type: "favorite"))
                .execute()
        } catch let error where Self.isMissingTableError(error) {
            updateLocal(base, userId: userId, id: articleId, add: true)
        } catch let error where Self.isDuplicate(error) {
            // Already saved.
        }
    }

    private func removeArticleFavorite(articleId: String) async throws {
        let base = Self.localBase(.article)
        guard let userId = currentUserId else {
            updateLocal(base, userId: nil, id: articleId, add: false)
            return
        }
        do {
            let client = try db()
            try await client
                .from("user_article_interactions")
                .delete()
                .eq("user_id", value: userId)
                .eq("article_id", value: articleId)
                .eq("interaction_type", value: "favorite")
                .execute()
        } catch let error where Self.isMissingTableError(error) {
            // Device-only store; handled below.
        }
        updateLocal(base, userId: userId, id: articleId, add: false)
    }

    func isArticleFavorited(_ articleId: String) -> Bool {
        isFavorited(kind: .article, id: articleId)
    }

    /// Fetch the full saved Article rows (Saved tab Guides section).
    func fetchFavoriteArticles() async throws -> [Article] {
        let ids = Array(favoriteArticleIds.sorted().prefix(Self.maxFetchIds))
        guard !ids.isEmpty else { return [] }
        var collected: [Article] = []
        for chunk in Self.chunks(ids, size: Self.fetchChunkSize) {
            let rows: [Article] = try await withRetry {
                let client = try self.db()
                return try await client
                    .from("articles")
                    .select()
                    .in("id", values: chunk)
                    .order("published_at", ascending: false, nullsFirst: false)
                    .execute()
                    .value
            }
            collected.append(contentsOf: rows)
        }
        return collected
    }

    // ================================================================
    // MARK: - Sign-Out Cleanup
    // ================================================================

    /// Clear the in-memory favorites and the guest (unscoped) device store.
    /// Per-user device stores are kept: for articles they are the only copy
    /// while `user_article_interactions` is missing, and they are keyed by
    /// user id, so the next account cannot see them (IOS-DD-SAVED-20).
    func reset() {
        favoriteEventIds = []
        favoriteRestaurantIds = []
        favoriteAttractionIds = []
        favoriteArticleIds = []
        pendingRemovalIds = []
        inFlightIds = []
        pastEventFavoriteCount = 0
        lastLoadFailed = false
        for kind in [FavoriteKind.restaurant, .attraction, .article] {
            defaults.removeObject(forKey: Self.localBase(kind))
        }
    }

    // ================================================================
    // MARK: - Local Storage Fallback
    // ================================================================

    private static let localRestaurantKey = "localRestaurantFavorites"
    private static let localAttractionKey = "localAttractionFavorites"
    private static let localArticleKey = "localArticleFavorites"

    private static func localBase(_ kind: FavoriteKind) -> String {
        switch kind {
        case .restaurant: return localRestaurantKey
        case .attraction: return localAttractionKey
        case .article: return localArticleKey
        // Events never had a device store; the key is unused.
        case .event: return "localEventFavorites"
        }
    }

    /// "<base>.<userId>" when signed in, else the unscoped base, which is the
    /// guest store (IOS-DD-SAVED-20).
    nonisolated static func localKey(base: String, userId: String?) -> String {
        guard let userId, !userId.isEmpty else { return base }
        return "\(base).\(userId)"
    }

    private func localIds(_ base: String, userId: String?) -> Set<String> {
        Set(defaults.stringArray(forKey: Self.localKey(base: base, userId: userId)) ?? [])
    }

    private func setLocal(_ base: String, userId: String?, _ ids: Set<String>) {
        let key = Self.localKey(base: base, userId: userId)
        if ids.isEmpty {
            defaults.removeObject(forKey: key)
        } else {
            defaults.set(ids.sorted(), forKey: key)
        }
    }

    private func updateLocal(_ base: String, userId: String?, id: String, add: Bool) {
        var ids = localIds(base, userId: userId)
        if add { ids.insert(id) } else { ids.remove(id) }
        setLocal(base, userId: userId, ids)
    }

    /// Moves anything in the unscoped keys into this user's keys once and
    /// removes the unscoped keys (migrate-on-read). Carries guest article saves
    /// into the account that signs in.
    func migrateLegacyLocalFavorites(userId: String) {
        for kind in [FavoriteKind.restaurant, .attraction, .article] {
            let base = Self.localBase(kind)
            let legacy = localIds(base, userId: nil)
            guard !legacy.isEmpty else { continue }
            setLocal(base, userId: userId, localIds(base, userId: userId).union(legacy))
            defaults.removeObject(forKey: base)
        }
    }

    /// Device-store ids for one kind (tests and diagnostics).
    func localFavoriteIds(_ kind: FavoriteKind, userId: String?) -> Set<String> {
        localIds(Self.localBase(kind), userId: userId)
    }

    #if DEBUG
    /// Seeds the in-memory sets for unit tests.
    func _testSeed(eventIds: Set<String> = [], restaurantIds: Set<String> = [], attractionIds: Set<String> = []) {
        favoriteEventIds = eventIds
        favoriteRestaurantIds = restaurantIds
        favoriteAttractionIds = attractionIds
    }
    #endif

    // ================================================================
    // MARK: - Error Types
    // ================================================================

    enum FavoritesError: LocalizedError {
        case notAuthenticated
        case limitReached(max: Int)
        case notConfigured

        var errorDescription: String? {
            switch self {
            case .notAuthenticated:
                return "Please sign in to save favorites."
            case .limitReached(let max):
                return "You've reached the limit of \(max) favorites. Upgrade to Insider for unlimited saves."
            case .notConfigured:
                return "Supabase is not configured."
            }
        }
    }
}

extension Notification.Name {
    /// Posted when a free user tries to save past the favorites cap. A single
    /// app-level listener (MainTabView) presents the unlimited-favorites paywall
    /// so every save surface gets the soft gate without per-call-site code.
    static let favoritesLimitReached = Notification.Name("favoritesLimitReached")

    /// Posted when a guest taps a heart. MainTabView presents sign-in
    /// (IOS-DD-SAVED-15).
    static let favoritesSignInRequired = Notification.Name("favoritesSignInRequired")
}
