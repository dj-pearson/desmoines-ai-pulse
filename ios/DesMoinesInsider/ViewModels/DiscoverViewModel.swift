import Foundation

// MARK: - Mode

enum DiscoverMode: String, CaseIterable, Identifiable {
    case mixed
    case events
    case restaurants

    var id: String { rawValue }

    var title: String {
        switch self {
        // Was "Tonight", over a seven-day window with no hours check
        // (IOS-DD-DISCOVER-05). The rawValue stays "mixed": it is stored in
        // swipe_sessions.mode.
        case .mixed: return "This week"
        case .events: return "Events"
        case .restaurants: return "Dining"
        }
    }

    var icon: String {
        switch self {
        case .mixed: return "sparkles"
        case .events: return "calendar"
        case .restaurants: return "fork.knife"
        }
    }
}

// MARK: - Item wrapper

/// Type-erased deck item. Lets a single `SwipeCard` view render either an
/// Event or a Restaurant without the card itself knowing about either model.
enum SwipeItem: Identifiable, Hashable {
    case event(Event)
    case restaurant(Restaurant)

    var id: String {
        switch self {
        case .event(let e): return "event-\(e.id)"
        case .restaurant(let r): return "restaurant-\(r.id)"
        }
    }

    var imageUrl: String? {
        switch self {
        case .event(let e): return e.imageUrl
        case .restaurant(let r): return r.imageUrl
        }
    }

    var title: String {
        switch self {
        case .event(let e): return e.title
        case .restaurant(let r): return r.name
        }
    }

    /// Event: the Des Moines day and start time ("Sat, Sep 26, 7:30 PM", or
    /// " - Time TBA"), via the same formatter as the event cards. It used the
    /// device zone with no time, so a late show read as the next day on a phone
    /// set to Eastern (IOS-DD-DISCOVER-10). Restaurant: cuisine and price.
    var subtitle: String {
        switch self {
        case .event(let e):
            if let d = e.parsedDate {
                return e.cardDateText(d)
            }
            return e.eventCategory.displayName
        case .restaurant(let r):
            return [r.cuisine, r.priceRange].compactMap { $0 }.joined(separator: " · ")
        }
    }

    /// Short pills for the card (IOS-DD-DISCOVER-10): urgency ("Today",
    /// "Happening now") and Free for events, the open-now line for restaurants.
    /// Only facts the row carries; nothing when there is nothing honest to say.
    var badges: [String] {
        switch self {
        case .event(let e):
            var out: [String] = []
            if let urgency = e.urgencyLabel { out.append(urgency) }
            if e.isFree { out.append("Free") }
            return out
        case .restaurant(let r):
            return r.openStatus().line.map { [$0] } ?? []
        }
    }

    /// Short location label for the swipe card (city / venue only — not the
    /// full geocoded address string which can be 80+ characters long and
    /// causes the HStack subtitle row to show mid-string content).
    var locationText: String {
        switch self {
        case .event(let e):
            // Events already store a clean [venue, city] display location.
            return e.displayLocation
        case .restaurant(let r):
            // Use only the city; the raw `location` column contains the full
            // geocoded string ("1234 Main St, Des Moines, IA 50309, USA") which
            // is far too long for a one-line card label.
            return r.city ?? ""
        }
    }

    var typeIcon: String {
        switch self {
        case .event: return "calendar"
        case .restaurant: return "fork.knife"
        }
    }

    var typeLabel: String {
        switch self {
        case .event(let e): return e.eventCategory.displayName
        case .restaurant(let r): return r.cuisine ?? "Restaurant"
        }
    }

    var supabaseItemType: SwipeInteractionService.ItemType {
        switch self {
        case .event: return .event
        case .restaurant: return .restaurant
        }
    }

    var rawId: String {
        switch self {
        case .event(let e): return e.id
        case .restaurant(let r): return r.id
        }
    }
}

// MARK: - Filter context

/// Optional filter context that callers can hand to DiscoverView so the deck
/// is pre-narrowed (e.g. "Italian restaurants in East Village"). When all
/// fields are empty the deck pulls from the full catalog.
struct DiscoverFilterContext: Equatable {
    var cuisines: [String] = []
    var locations: [String] = []
    var priceRanges: [String] = []
    var minRating: Double = 0
    var openNow: Bool = false

    var eventCategory: EventCategory? = nil
    var datePreset: DateFilterPreset? = nil
    var freeOnly: Bool = false

    var isEmpty: Bool {
        cuisines.isEmpty && locations.isEmpty && priceRanges.isEmpty &&
        minRating == 0 && !openNow &&
        eventCategory == nil && datePreset == nil && !freeOnly
    }

    /// JSON snapshot stored alongside each swipe to preserve the user's
    /// filter context at the time of the gesture.
    func toSourceContext() -> [String: [String]]? {
        var ctx: [String: [String]] = [:]
        if !cuisines.isEmpty { ctx["cuisines"] = cuisines }
        if !locations.isEmpty { ctx["locations"] = locations }
        if !priceRanges.isEmpty { ctx["priceRanges"] = priceRanges }
        if let cat = eventCategory { ctx["category"] = [cat.rawValue] }
        if let preset = datePreset { ctx["datePreset"] = [preset.rawValue] }
        if openNow { ctx["openNow"] = ["true"] }
        if freeOnly { ctx["freeOnly"] = ["true"] }
        if minRating > 0 { ctx["minRating"] = [String(minRating)] }
        return ctx.isEmpty ? nil : ctx
    }
}

// MARK: - Filter constraints

/// One removable piece of the deck's filter, as a chip shows it
/// (IOS-DD-DISCOVER-06).
enum FilterConstraint: Hashable {
    case cuisine(String)
    case location(String)
    case price(String)
    case eventCategory
    case datePreset
    case openNow
    case freeOnly
}

/// A filter chip: what it says, whether "More like this" put it there, and
/// whether the user may take it off.
struct ActiveConstraint: Identifiable, Hashable {
    let constraint: FilterConstraint
    let text: String
    let icon: String
    let isBoosted: Bool
    let isRemovable: Bool

    var id: FilterConstraint { constraint }
}

// MARK: - ViewModel

@MainActor
@Observable
final class DiscoverViewModel {
    var mode: DiscoverMode {
        didSet { if oldValue != mode { Task { await reload() } } }
    }
    private(set) var filter: DiscoverFilterContext
    private(set) var deck: [SwipeItem] = []

    /// A liked card could not be saved for a reason that is not the free-tier
    /// cap. The cap has its own app-level paywall, so surfacing it here too
    /// would double up (IOS-AUDIT-UX-057).
    private(set) var favoriteSaveFailed = false

    func acknowledgeFavoriteFailure() {
        favoriteSaveFailed = false
    }
    private(set) var isLoading = false

    /// True when the last batch fetch threw (IOS-AUDIT-UX-051 AC3).
    ///
    /// Both batch fetchers used to swallow their error and set hasMore... = false,
    /// so a network failure produced an empty deck and the "You've seen
    /// everything" screen. That tells the user they have exhausted the content
    /// when in fact nothing loaded - and the only affordance offered was a Reset
    /// that would fail the same way, silently.
    private(set) var lastLoadFailed = false
    private(set) var totalSwipes = 0
    private(set) var likedItems: [SwipeItem] = []

    // MARK: Guest likes (IOS-DD-DISCOVER-08)

    /// Why a liked card was not saved.
    enum SaveFailure: Equatable { case limit, signIn, other }

    /// Right swipes a guest made. Favorites need an account, so these were
    /// each answered with "Check your connection" while the Saved count went
    /// up anyway. They are held here and saved after sign-in.
    private(set) var guestLikes: [SwipeItem] = []

    /// Set once, the first time a guest's like could not be saved, so the view
    /// can say why exactly once per session.
    private(set) var needsSignInForLikes = false

    // MARK: Undo (IOS-DD-DISCOVER-07)

    struct SwipeUndo {
        enum Action { case like, skip }
        let token: UUID
        let item: SwipeItem
        let action: Action
        var clientEventId: String?
        var createdFavorite: Bool
    }

    /// The last few swipes, newest last. A swipe used to be final: the key
    /// was persisted and the favorite written with no way back.
    private(set) var undoStack: [SwipeUndo] = []
    nonisolated static let maxUndo = 5

    /// Tokens already undone, so a record or save that finishes after the undo
    /// is taken back too.
    private var undoneTokens: Set<UUID> = []

    var canUndo: Bool { !undoStack.isEmpty }

    // MARK: More like this (IOS-DD-DISCOVER-06)

    enum BoostField: Hashable { case eventCategory, cuisine }

    /// Filter fields a boost wrote, so the chip can say "More: Music" and the
    /// user can take it off. The boost used to overwrite the filter for good.
    private(set) var boostedFields: Set<BoostField> = []

    /// Set when a boost found nothing and the deck went back to what it was.
    private(set) var boostFellBack = false

    func acknowledgeBoostFallback() {
        boostFellBack = false
    }

    /// The filter and boosted fields from just before the latest boost.
    private var boostRevert: (filter: DiscoverFilterContext, fields: Set<BoostField>)?

    /// What removing a constraint returns to: the entry filter when the lane is
    /// locked (a typed list sent the user here), else nothing.
    private let baseFilter: DiscoverFilterContext
    private let lockMode: Bool

    /// Number of cards remaining when we trigger a background prefetch.
    private let prefetchThreshold = 4
    private let pageSize = 20

    /// Most pages one lane fetches in a row when every card on them was
    /// already swiped (IOS-DD-DISCOVER-03). A page of seen cards appended
    /// nothing, and since only a swipe triggers a prefetch, the deck stalled on
    /// "You've seen everything" with more pages waiting.
    nonisolated static let maxEmptyPages = 5

    private var eventOffset = 0
    private var restaurantOffset = 0
    private var hasMoreEvents = true
    private var hasMoreRestaurants = true
    private(set) var isPrefetching = false

    /// Bumped whenever the deck is reset (reload / boost). A fetch captures the
    /// generation when it runs and discards its results if the generation has
    /// since changed — so an in-flight pre-reset fetch can't append stale,
    /// wrong-filter cards into the freshly-reset deck.
    private var fetchGeneration = 0
    /// The most recently enqueued fetch. New fetches chain after it so a reset's
    /// refetch is never skipped by the `isPrefetching` guard while an older
    /// fetch is still draining.
    private var fetchTask: Task<Void, Never>?

    private let eventsService: EventPageProviding
    private let restaurantsService: RestaurantPageProviding
    private let swipeService = SwipeInteractionService.shared
    private let hasSwiped: @MainActor (SwipeInteractionService.ItemType, String) -> Bool
    private let saveFavorite: @MainActor (SwipeItem) async throws -> Bool
    private let removeFavorite: @MainActor (SwipeItem) async -> Void

    /// Providers default to the shared services, so no call site changes. They
    /// exist so a test can hold a fetch open and bump the deck generation while
    /// it is in flight - the only way the discard behaviour this view model
    /// depends on can be observed (IOS-AUDIT-TEST-006).
    ///
    /// `hasSwiped`, `saveFavorite` and `removeFavorite` are the same kind of
    /// seam (IOS-DD-DISCOVER-03/07/08): the swipe history and the favorites
    /// store are app-wide singletons a test must not depend on. `saveFavorite`
    /// returns true only when it turned a favorite on, which is what an undo
    /// may turn off again.
    init(
        mode: DiscoverMode = .mixed,
        filter: DiscoverFilterContext = .init(),
        lockMode: Bool = false,
        eventsService: EventPageProviding = EventsService.shared,
        restaurantsService: RestaurantPageProviding = RestaurantsService.shared,
        hasSwiped: @escaping @MainActor (SwipeInteractionService.ItemType, String) -> Bool = {
            SwipeInteractionService.shared.hasSwiped(itemType: $0, itemId: $1)
        },
        saveFavorite: @escaping @MainActor (SwipeItem) async throws -> Bool = {
            try await DiscoverViewModel.liveSaveFavorite($0)
        },
        removeFavorite: @escaping @MainActor (SwipeItem) async -> Void = {
            await DiscoverViewModel.liveRemoveFavorite($0)
        }
    ) {
        self.mode = mode
        self.filter = filter
        self.lockMode = lockMode
        self.baseFilter = lockMode ? filter : .init()
        self.eventsService = eventsService
        self.restaurantsService = restaurantsService
        self.hasSwiped = hasSwiped
        self.saveFavorite = saveFavorite
        self.removeFavorite = removeFavorite
    }

    // MARK: - Load

    func loadInitial() async {
        guard deck.isEmpty else { return }
        await reload()
    }

    func reload() async {
        isLoading = true
        lastLoadFailed = false
        deck = []
        eventOffset = 0
        restaurantOffset = 0
        hasMoreEvents = true
        hasMoreRestaurants = true
        // A reset deck has nothing to rewind into.
        undoStack = []
        // Invalidate in-flight fetches and run the fresh fetch after they drain
        // (so the isPrefetching guard can't skip it).
        fetchGeneration += 1
        let generation = fetchGeneration
        await enqueueFetch().value
        // Only the newest reload may clear the spinner. An older one finishing
        // (its results already discarded) used to turn it off while the
        // current fetch was still running (IOS-DD-DISCOVER-04).
        if generation == fetchGeneration { isLoading = false }
    }

    func updateFilter(_ newFilter: DiscoverFilterContext) async {
        guard newFilter != filter else { return }
        filter = newFilter
        await reload()
    }

    /// Every lane the current mode draws from has no more pages. "You've seen
    /// everything" is only true then (IOS-DD-DISCOVER-03).
    var isExhausted: Bool {
        switch mode {
        case .events: return !hasMoreEvents
        case .restaurants: return !hasMoreRestaurants
        case .mixed: return !hasMoreEvents && !hasMoreRestaurants
        }
    }

    /// Fetches the next pages when the deck is empty and a lane has more. The
    /// empty state calls this instead of claiming the deck is done.
    func loadMoreIfNeeded() {
        guard deck.isEmpty, !isExhausted, !isPrefetching, !lastLoadFailed else { return }
        enqueueFetch()
    }

    /// Forgets which cards this mode's lanes have shown and reloads, so an
    /// exhausted deck can be swiped again. Reset used to reload with the
    /// history intact and land on the same empty screen (IOS-DD-DISCOVER-03).
    func startOver() async {
        swipeService.forgetSeen(itemTypes: Self.itemTypes(for: mode))
        await reload()
    }

    nonisolated static func itemTypes(for mode: DiscoverMode) -> Set<SwipeInteractionService.ItemType> {
        switch mode {
        case .events: return [.event]
        case .restaurants: return [.restaurant]
        case .mixed: return [.event, .restaurant]
        }
    }

    // MARK: - Swipe handling
    //
    // Deck mutation runs synchronously so SwiftUI sees the model update in
    // the same render frame the swipe gesture commits — otherwise the
    // newly-promoted top card briefly inherits the off-screen drag offset
    // and flickers. Persistence + signal recording are dispatched as
    // fire-and-forget Tasks.

    /// Right swipe → like. Records the signal and adds to favorites.
    func like(_ item: SwipeItem) {
        likedItems.append(item)
        advance(removing: item)
        let token = pushUndo(item: item, action: .like)
        Task {
            let id = await self.record(.like, item: item)
            await self.noteRecorded(token: token, item: item, clientEventId: id)
        }
        Task {
            let created = await self.persistFavorite(item)
            await self.noteFavorite(token: token, item: item, created: created)
        }
    }

    /// Left swipe → skip. Pure negative signal.
    func skip(_ item: SwipeItem) {
        advance(removing: item)
        let token = pushUndo(item: item, action: .skip)
        Task {
            let id = await self.record(.skip, item: item)
            await self.noteRecorded(token: token, item: item, clientEventId: id)
        }
    }

    /// Takes back the most recent like or skip: the card returns to the top,
    /// the swipe row is withdrawn, and a favorite the like created is removed.
    func undo() {
        guard let entry = undoStack.popLast() else { return }
        undoneTokens.insert(entry.token)
        if !deck.contains(where: { $0.id == entry.item.id }) {
            deck.insert(entry.item, at: 0)
        }
        totalSwipes = max(0, totalSwipes - 1)
        if entry.action == .like {
            likedItems.removeAll { $0.id == entry.item.id }
            guestLikes.removeAll { $0.id == entry.item.id }
        }
        Task {
            await self.unrecord(entry.item, clientEventId: entry.clientEventId)
            if entry.createdFavorite { await self.removeFavorite(entry.item) }
        }
    }

    /// Up swipe → boost. Strong positive signal *and* re-shapes the deck so
    /// the next batch leans toward the same category / cuisine. This is the
    /// "show me more like this" lever — the reason the up-swipe exists.
    func boost(_ item: SwipeItem) {
        let before = (filter: filter, fields: boostedFields)
        let narrowed = applyBoostFilter(from: item)
        Task { await self.record(.boost, item: item) }

        // Nothing to narrow by: an "Other" event (a null or unknown category,
        // which would query category = 'Other' and empty the deck), a
        // restaurant with no cuisine, or the lane it already leans to. Count
        // the boost and move on instead of resetting the deck.
        guard narrowed else {
            advance(removing: item)
            return
        }

        boostRevert = before
        // Boost resets the deck, so there is nothing to rewind into.
        undoStack = []
        // Drop everything currently in the deck — the user just told us
        // they want a different slice — and refetch with the narrowed
        // filter on a background task.
        deck = []
        eventOffset = 0
        restaurantOffset = 0
        hasMoreEvents = true
        hasMoreRestaurants = true
        totalSwipes += 1
        // Invalidate any in-flight (pre-boost) fetch so its results are dropped
        // instead of mixed into the narrowed deck.
        fetchGeneration += 1
        let generation = fetchGeneration
        // Show the loading state while the narrowed batch loads instead of
        // flashing the "you've seen everything" empty state, which the deck-
        // empty branch would otherwise render mid-boost (IOS-AUDIT-UX-019).
        isLoading = true
        let task = enqueueFetch()
        Task {
            await task.value
            guard generation == self.fetchGeneration else { return }
            self.isLoading = false
            await self.fallBackIfBoostFoundNothing()
        }
    }

    /// Tap → opened detail view. Logged as a positive but weaker signal.
    func recordDetailTap(_ item: SwipeItem) {
        Task { await self.record(.detail, item: item) }
    }

    /// Saves the likes a guest made, after they sign in.
    func replayGuestLikes() async {
        let pending = guestLikes
        guestLikes = []
        for item in pending {
            likedItems.append(item)
            _ = await persistFavorite(item)
            // A guest's swipe was never queued (IOS-DD-DISCOVER-09), so the
            // like would otherwise never reach For You.
            await record(.like, item: item)
        }
    }

    // MARK: - Filter chips (IOS-DD-DISCOVER-06)

    /// The filter as chips, in display order.
    var activeConstraints: [ActiveConstraint] {
        var out: [ActiveConstraint] = []
        func add(_ c: FilterConstraint, _ text: String, _ icon: String, boosted: Bool = false) {
            out.append(ActiveConstraint(
                constraint: c,
                text: boosted ? "More: \(text)" : text,
                icon: icon,
                isBoosted: boosted,
                isRemovable: canRemove(c)
            ))
        }
        let cuisineBoosted = boostedFields.contains(.cuisine)
        for c in filter.cuisines { add(.cuisine(c), c, "fork.knife", boosted: cuisineBoosted) }
        for l in filter.locations { add(.location(l), l, "mappin.and.ellipse") }
        for p in filter.priceRanges { add(.price(p), p, "dollarsign.circle") }
        if let cat = filter.eventCategory {
            add(.eventCategory, cat.displayName, cat.icon, boosted: boostedFields.contains(.eventCategory))
        }
        if let preset = filter.datePreset { add(.datePreset, preset.rawValue, "calendar") }
        if filter.openNow { add(.openNow, "Open Now", "clock.fill") }
        if filter.freeOnly { add(.freeOnly, "Free", "ticket") }
        return out
    }

    /// False for a constraint the entry filter set when the lane is locked:
    /// the user came from a typed list and chose that slice.
    func canRemove(_ c: FilterConstraint) -> Bool {
        switch c {
        case .cuisine(let v): return !baseFilter.cuisines.contains(v)
        case .location(let v): return !baseFilter.locations.contains(v)
        case .price(let v): return !baseFilter.priceRanges.contains(v)
        case .eventCategory: return filter.eventCategory != baseFilter.eventCategory
        case .datePreset: return filter.datePreset != baseFilter.datePreset
        case .openNow: return filter.openNow != baseFilter.openNow
        case .freeOnly: return filter.freeOnly != baseFilter.freeOnly
        }
    }

    /// Takes one constraint off (back to the entry value when locked) and
    /// reloads.
    func removeConstraint(_ c: FilterConstraint) async {
        guard canRemove(c) else { return }
        var f = filter
        switch c {
        case .cuisine(let v):
            f.cuisines.removeAll { $0 == v }
            if f.cuisines.isEmpty || f.cuisines == baseFilter.cuisines { boostedFields.remove(.cuisine) }
        case .location(let v):
            f.locations.removeAll { $0 == v }
        case .price(let v):
            f.priceRanges.removeAll { $0 == v }
        case .eventCategory:
            f.eventCategory = baseFilter.eventCategory
            boostedFields.remove(.eventCategory)
        case .datePreset:
            f.datePreset = baseFilter.datePreset
        case .openNow:
            f.openNow = baseFilter.openNow
        case .freeOnly:
            f.freeOnly = baseFilter.freeOnly
        }
        boostRevert = nil
        await updateFilter(f)
    }

    /// Every removable constraint off at once.
    func clearAllConstraints() async {
        boostedFields = []
        boostRevert = nil
        await updateFilter(baseFilter)
    }

    // MARK: - Internals

    /// Removes exactly the card that was swiped. SwipeCardStack calls back
    /// about 0.28s after the gesture, and `deck.removeFirst()` dropped whatever
    /// was on top by then - after a mode switch in that window, an unseen card
    /// (IOS-DD-DISCOVER-04).
    private func advance(removing item: SwipeItem) {
        totalSwipes += 1
        if let index = deck.firstIndex(where: { $0.id == item.id }) {
            deck.remove(at: index)
        }
        // Throttle background prefetch: only enqueue when nothing is already
        // fetching, so rapid swipes don't queue N sequential page fetches.
        // (reload/boost call enqueueFetch unconditionally — they must always run.)
        if deck.count <= prefetchThreshold && !isPrefetching { enqueueFetch() }
    }

    private func pushUndo(item: SwipeItem, action: SwipeUndo.Action) -> UUID {
        let token = UUID()
        undoStack.append(SwipeUndo(token: token, item: item, action: action, clientEventId: nil, createdFavorite: false))
        if undoStack.count > Self.maxUndo {
            undoStack.removeFirst(undoStack.count - Self.maxUndo)
        }
        return token
    }

    /// The record task finished. Store its key on the undo entry, or, if the
    /// swipe was undone while it ran, take it back now.
    private func noteRecorded(token: UUID, item: SwipeItem, clientEventId: String?) async {
        if let i = undoStack.firstIndex(where: { $0.token == token }) {
            undoStack[i].clientEventId = clientEventId
        } else if undoneTokens.contains(token), clientEventId != nil {
            await unrecord(item, clientEventId: clientEventId)
        }
    }

    private func noteFavorite(token: UUID, item: SwipeItem, created: Bool) async {
        guard created else { return }
        if let i = undoStack.firstIndex(where: { $0.token == token }) {
            undoStack[i].createdFavorite = true
        } else if undoneTokens.contains(token) {
            await removeFavorite(item)
        }
    }

    @discardableResult
    private func record(_ action: SwipeInteractionService.Action, item: SwipeItem) async -> String? {
        await swipeService.record(
            action: action,
            itemType: item.supabaseItemType,
            itemId: item.rawId,
            sourceContext: filter.toSourceContext()
        )
    }

    private func unrecord(_ item: SwipeItem, clientEventId: String?) async {
        await swipeService.unrecord(
            itemType: item.supabaseItemType,
            itemId: item.rawId,
            clientEventId: clientEventId
        )
    }

    /// Sorts a failed save into the three outcomes the view treats
    /// differently (IOS-DD-DISCOVER-08).
    static func classify(_ error: Error) -> SaveFailure {
        if FavoritesService.isLimitReached(error) { return .limit }
        if case FavoritesService.FavoritesError.notAuthenticated = error { return .signIn }
        return .other
    }

    /// Returns true when this call turned a favorite on.
    private func persistFavorite(_ item: SwipeItem) async -> Bool {
        do {
            return try await saveFavorite(item)
        } catch {
            switch Self.classify(error) {
            case .limit:
                // THE CAP IS ALREADY HANDLED, and not by this view.
                // enforceFavoritesCap posts .favoritesLimitReached, which
                // MainTabView turns into the app-level upsell paywall - so a
                // toast here would be a second, redundant message on top of it.
                break
            case .signIn:
                // A guest. Not a connection problem, so no error toast; keep
                // the like to save after sign-in instead (IOS-DD-DISCOVER-08).
                likedItems.removeAll { $0.id == item.id }
                if !guestLikes.contains(where: { $0.id == item.id }) {
                    guestLikes.append(item)
                }
                if !needsSignInForLikes { needsSignInForLikes = true }
            case .other:
                // A dropped connection or an expired session: the card animated
                // away as a save and nothing was saved (IOS-AUDIT-UX-057).
                favoriteSaveFailed = true
            }
            return false
        }
    }

    static func liveSaveFavorite(_ item: SwipeItem) async throws -> Bool {
        let favorites = FavoritesService.shared
        switch item {
        case .event(let e):
            guard !favorites.isEventFavorited(e.id) else { return false }
            _ = try await favorites.toggleFavorite(eventId: e.id)
            return true
        case .restaurant(let r):
            guard !favorites.isRestaurantFavorited(r.id) else { return false }
            _ = try await favorites.toggleRestaurantFavorite(restaurantId: r.id)
            return true
        }
    }

    /// Best effort: an undo that cannot remove the favorite leaves it saved,
    /// which is the lesser surprise.
    static func liveRemoveFavorite(_ item: SwipeItem) async {
        let favorites = FavoritesService.shared
        switch item {
        case .event(let e):
            guard favorites.isEventFavorited(e.id) else { return }
            _ = try? await favorites.toggleFavorite(eventId: e.id)
        case .restaurant(let r):
            guard favorites.isRestaurantFavorited(r.id) else { return }
            _ = try? await favorites.toggleRestaurantFavorite(restaurantId: r.id)
        }
    }

    /// Writes the boost into the filter. Returns false when there was nothing
    /// to narrow by, so the caller can skip the reset.
    private func applyBoostFilter(from item: SwipeItem) -> Bool {
        switch item {
        case .event(let e):
            let category = e.eventCategory
            guard category != .other, filter.eventCategory != category else { return false }
            filter.eventCategory = category
            boostedFields.insert(.eventCategory)
            return true
        case .restaurant(let r):
            guard let cuisine = r.cuisine?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !cuisine.isEmpty, filter.cuisines != [cuisine] else { return false }
            filter.cuisines = [cuisine]
            boostedFields.insert(.cuisine)
            return true
        }
    }

    /// A boost that found nothing used to leave an empty deck under a filter
    /// the user could not remove. Put the filter back and reload.
    private func fallBackIfBoostFoundNothing() async {
        guard deck.isEmpty, isExhausted, !lastLoadFailed, let revert = boostRevert else { return }
        boostRevert = nil
        filter = revert.filter
        boostedFields = revert.fields
        boostFellBack = true
        await reload()
    }

    // MARK: - Fetch

    /// Enqueue a fetch that runs after any in-flight fetch drains, so a reset
    /// (reload/boost) isn't skipped by the `isPrefetching` guard. Returns the
    /// task so callers can await completion.
    @discardableResult
    private func enqueueFetch() -> Task<Void, Never> {
        let previous = fetchTask
        let task = Task {
            await previous?.value
            await self.fetchMore()
        }
        fetchTask = task
        return task
    }

    private func fetchMore() async {
        guard !isPrefetching else { return }
        isPrefetching = true
        defer { isPrefetching = false }

        // Capture the deck generation for this run; the batch fetchers drop their
        // results if a reset bumped it while we were awaiting the network.
        let generation = fetchGeneration

        switch mode {
        case .events:
            await fetchEventLane(generation)
        case .restaurants:
            await fetchRestaurantLane(generation)
        case .mixed:
            async let events: () = fetchEventLane(generation)
            async let restaurants: () = fetchRestaurantLane(generation)
            _ = await (events, restaurants)
        }
    }

    /// Keeps paging while a page adds nothing new, up to `maxEmptyPages`.
    private func fetchEventLane(_ generation: Int) async {
        var pages = 0
        var added = 0
        repeat {
            added = await fetchEventBatch(generation)
            pages += 1
        } while added == 0 && hasMoreEvents && generation == fetchGeneration
            && !lastLoadFailed && pages < Self.maxEmptyPages
    }

    private func fetchRestaurantLane(_ generation: Int) async {
        var pages = 0
        var added = 0
        repeat {
            added = await fetchRestaurantBatch(generation)
            pages += 1
        } while added == 0 && hasMoreRestaurants && generation == fetchGeneration
            && !lastLoadFailed && pages < Self.maxEmptyPages
    }

    /// Returns how many cards the page added to the deck.
    private func fetchEventBatch(_ generation: Int) async -> Int {
        guard hasMoreEvents else { return 0 }
        var query = EventsService.EventsQuery()
        query.category = filter.eventCategory?.rawValue
        query.cities = filter.locations.isEmpty ? nil : filter.locations
        query.freeOnly = filter.freeOnly
        query.limit = pageSize
        query.offset = eventOffset
        if let preset = filter.datePreset {
            let range = preset.dateRange
            query.dateStart = range.start
            query.dateEnd = range.end
        } else if mode == .mixed {
            // "This week" tab: events within the next 7 days so the deck
            // isn't empty on nights with few events, but doesn't pull events
            // from weeks/months away.
            let range = DateFilterPreset.thisWeek.dateRange
            query.dateStart = range.start
            query.dateEnd = range.end
        }

        do {
            let response = try await eventsService.fetchEvents(query: query)
            // A reload/boost reset the deck while we were awaiting — these results
            // belong to the old filter/offset; drop them rather than mixing in.
            guard generation == fetchGeneration else { return 0 }
            let fresh = response.events
                .filter { !hasSwiped(.event, $0.id) }
                .map { SwipeItem.event($0) }
            let added = appendUnique(fresh)
            eventOffset += response.events.count
            hasMoreEvents = response.hasMore
            return added
        } catch {
            guard generation == fetchGeneration else { return 0 }
            hasMoreEvents = false
            lastLoadFailed = true
            return 0
        }
    }

    /// Returns how many cards the page added to the deck.
    private func fetchRestaurantBatch(_ generation: Int) async -> Int {
        guard hasMoreRestaurants else { return 0 }
        var query = RestaurantsService.RestaurantsQuery()
        query.cuisines = filter.cuisines.isEmpty ? nil : filter.cuisines
        query.locations = filter.locations.isEmpty ? nil : filter.locations
        query.priceRanges = filter.priceRanges.isEmpty ? nil : filter.priceRanges
        query.minRating = filter.minRating > 0 ? filter.minRating : nil
        query.sortBy = .popularity
        query.limit = pageSize
        query.offset = restaurantOffset

        do {
            let response = try await restaurantsService.fetchRestaurants(query: query)
            // Drop results if a reload/boost reset the deck mid-flight.
            guard generation == fetchGeneration else { return 0 }
            // Closed places are not something to swipe right on. The service
            // only sorts them to the end of a page, so they were still dealt
            // (IOS-DD-DISCOVER-05). Opening-soon rows stay.
            var fresh = response.restaurants.filter {
                $0.lifecycle != .closedPermanently && $0.lifecycle != .closedTemporarily
            }
            if filter.openNow {
                fresh = fresh.filter { $0.isOpenNow() == true }
            }
            let mapped = fresh
                .filter { !hasSwiped(.restaurant, $0.id) }
                .map { SwipeItem.restaurant($0) }
            let added = appendUnique(mapped)
            restaurantOffset += response.restaurants.count
            hasMoreRestaurants = response.hasMore
            return added
        } catch {
            guard generation == fetchGeneration else { return 0 }
            hasMoreRestaurants = false
            lastLoadFailed = true
            return 0
        }
    }

    @discardableResult
    private func appendUnique(_ items: [SwipeItem]) -> Int {
        let existing = Set(deck.map(\.id))
        let unique = items.filter { !existing.contains($0.id) }
        // For mixed mode, shuffle the new batch so events and restaurants
        // interleave instead of arriving in two solid blocks.
        deck.append(contentsOf: mode == .mixed ? unique.shuffled() : unique)
        return unique.count
    }
}
