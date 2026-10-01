import Foundation

/// ViewModel for the "Best Of" category list (IOS-PARITY-005). Loads active
/// voting categories and refreshes the app-wide winners cache so award badges
/// surface on listing cards.
@MainActor
@Observable
final class BestOfViewModel {
    private(set) var categories: [VotingCategory] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?
    /// Categories the signed-in user has voted in (IOS-DD-GUIDES-10).
    private(set) var votedCategoryIds: Set<String> = []

    private let service = VotingService.shared
    private let cache = QueryCache.shared
    private static let cacheKey = "bestof-categories"

    func loadInitialData() async {
        guard categories.isEmpty else { return }
        await refresh()
    }

    func refresh() async {
        isLoading = true
        errorMessage = nil

        let isOffline = !NetworkMonitor.shared.isConnected

        // Offline cold start: serve cached voting categories (IOS-COMPLY-004).
        if categories.isEmpty,
           let cached: [VotingCategory] = await cache.get(Self.cacheKey, allowStale: isOffline) {
            categories = cached
            isLoading = false
        }
        if isOffline && !categories.isEmpty {
            isLoading = false
            await Self.refreshWinners()
            return
        }

        do {
            categories = try await service.fetchCategories()
            await cache.set(Self.cacheKey, value: categories)
        } catch {
            // Keep cached categories on failure; only error on a true blank.
            if categories.isEmpty {
                errorMessage = error.localizedDescription
            }
        }
        isLoading = false
        await refreshVoted()
        // Keep the award-badge cache fresh (fail-soft inside the service).
        await Self.refreshWinners()
    }

    /// Re-reads which categories the user has voted in. Cheap; called on
    /// appear so a vote cast inside a category shows on return.
    func refreshVoted() async {
        guard let userId = AuthService.shared.currentUser?.id.uuidString else {
            votedCategoryIds = []
            return
        }
        votedCategoryIds = await service.fetchVotedCategoryIds(userId: userId)
    }

    var isSignedIn: Bool { AuthService.shared.currentUser != nil }

    /// Ballot progress over the rounds that are open right now.
    var ballotProgress: (voted: Int, total: Int) {
        Self.progress(categories: categories, voted: votedCategoryIds, now: Date())
    }

    nonisolated static func progress(
        categories: [VotingCategory], voted: Set<String>, now: Date
    ) -> (voted: Int, total: Int) {
        let open = categories.filter { $0.isVotingOpen(at: now) }
        return (open.filter { voted.contains($0.id) }.count, open.count)
    }

    /// Loads the winner→category map into the shared cache. Safe to call from
    /// anywhere (e.g. Home on launch) so cards badge winners app-wide.
    static func refreshWinners() async {
        let winners = await VotingService.shared.fetchWinners()
        BestOfWinners.shared.update(winners)
    }
}
