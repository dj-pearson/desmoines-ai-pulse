import Foundation

/// ViewModel for a single Best-Of category (IOS-PARITY-005): leaderboard +
/// nominee search + the current user's vote, with optimistic casting that
/// reverts on failure.
@MainActor
@Observable
final class BestOfCategoryViewModel {
    let category: VotingCategory

    private(set) var results: [VoteResult] = []
    private(set) var userVote: Vote?
    private(set) var isLoading = true
    private(set) var errorMessage: String?
    private(set) var isVoting = false

    var searchQuery = "" {
        didSet {
            guard searchQuery != oldValue else { return }
            debounceSearch()
        }
    }
    private(set) var searchResults: [VoteNominee] = []
    private(set) var isSearching = false

    private let service = VotingService.shared
    private let auth = AuthService.shared
    private var searchTask: Task<Void, Never>?

    init(category: VotingCategory) {
        self.category = category
    }

    var isAuthenticated: Bool { auth.isAuthenticated }

    var totalVotes: Int { results.reduce(0) { $0 + $1.voteCount } }

    /// The key of the result the user currently backs (for highlighting).
    var votedKey: String? { userVote?.resultKey }

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            results = try await service.fetchResults(categoryId: category.id)
        } catch {
            errorMessage = error.localizedDescription
        }
        if let userId = auth.currentUser?.id.uuidString {
            userVote = try? await service.fetchUserVote(categoryId: category.id, userId: userId)
        }
        isLoading = false
    }

    func refresh() async { await load() }

    // MARK: - Search

    private func debounceSearch() {
        searchTask?.cancel()
        let query = searchQuery.trimmingCharacters(in: .whitespaces)
        guard query.count >= 2 else {
            searchResults = []
            isSearching = false
            return
        }
        isSearching = true
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            let nominees = await service.searchNominees(query: query)
            guard !Task.isCancelled else { return }
            searchResults = nominees
            isSearching = false
        }
    }

    // MARK: - Casting (optimistic + revert)

    /// Casts/changes the user's vote. Returns false (no-op) when signed out so the
    /// view can route to the sign-in funnel. Optimistically updates the
    /// leaderboard + the user's pick, reverting on failure.
    @discardableResult
    func castVote(entityType: String, entityId: String?, customEntry: String?, displayName: String, imageUrl: String?) async -> Bool {
        guard let userId = auth.currentUser?.id.uuidString else { return false }
        guard !isVoting else { return false }
        isVoting = true
        errorMessage = nil
        defer { isVoting = false }

        // Snapshot for revert.
        let prevResults = results
        let prevVote = userVote
        let newKey = entityId ?? customEntry ?? "unknown"

        // 1. Remove the previous vote's contribution.
        if let prev = prevVote {
            let prevKey = prev.resultKey
            if let idx = results.firstIndex(where: { $0.id == prevKey }) {
                results[idx].voteCount -= 1
                if results[idx].voteCount <= 0 { results.remove(at: idx) }
            }
        }
        // 2. Add the new vote (bump existing row or insert).
        if let idx = results.firstIndex(where: { $0.id == newKey }) {
            results[idx].voteCount += 1
        } else {
            results.append(VoteResult(
                entityType: entityType,
                entityId: entityId,
                customEntry: customEntry,
                voteCount: 1,
                name: displayName,
                imageUrl: imageUrl
            ))
        }
        results.sort { $0.voteCount > $1.voteCount }
        // 3. Optimistic user vote.
        userVote = Vote(
            id: prevVote?.id ?? "optimistic",
            categoryId: category.id,
            entityType: entityType,
            entityId: entityId,
            customEntry: customEntry,
            userId: userId,
            createdAt: nil
        )
        searchResults = []
        searchQuery = ""

        do {
            try await service.castVote(
                categoryId: category.id, userId: userId,
                entityType: entityType, entityId: entityId, customEntry: customEntry
            )
            // Refresh the winners cache so badges reflect the new tally.
            await BestOfViewModel.refreshWinners()
            return true
        } catch {
            // Revert.
            results = prevResults
            userVote = prevVote
            errorMessage = "Couldn't record your vote. Please try again."
            return false
        }
    }
}
