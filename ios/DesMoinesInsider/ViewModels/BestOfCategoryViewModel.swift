import Foundation
import Supabase

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
    /// A failed leaderboard load. Separate from errorMessage, which is for
    /// vote actions, so an outage shows a retry instead of an empty board
    /// with "0 total votes" (IOS-DD-GUIDES-09).
    private(set) var loadError: String?
    /// A failed vote, shown in the booth.
    private(set) var errorMessage: String?
    private(set) var isVoting = false
    /// The name of the pick just recorded this visit, for "Share my pick".
    private(set) var justVotedFor: String?
    /// Whether that pick was a write-in (it only reaches the board at 3 votes).
    private(set) var justVotedWriteIn = false

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
        loadError = nil
        do {
            results = try await service.fetchResults(categoryId: category.id)
        } catch {
            if !Self.isCancellation(error) {
                loadError = error.localizedDescription
            }
        }
        if let userId = auth.currentUser?.id.uuidString {
            userVote = try? await service.fetchUserVote(categoryId: category.id, userId: userId)
        }
        isLoading = false
    }

    func refresh() async { await load() }

    private static func isCancellation(_ error: Error) -> Bool {
        error is CancellationError || (error as? URLError)?.code == .cancelled
    }

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
        // Re-tapping the current pick is not a change; don't send an upsert
        // the server would refuse (IOS-DD-GUIDES-07).
        if let current = userVote?.resultKey, current == (entityId ?? customEntry) {
            return true
        }
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
            justVotedFor = displayName
            justVotedWriteIn = entityType == "custom"
            // Refresh the winners cache so badges reflect the new tally.
            await BestOfViewModel.refreshWinners()
            return true
        } catch {
            // Revert.
            results = prevResults
            userVote = prevVote
            let postgrest = error as? PostgrestError
            errorMessage = Self.failureMessage(
                for: postgrest?.message, code: postgrest?.code, hadEarlierVote: prevVote != nil
            )
            return false
        }
    }

    /// What a failed vote tells the user. 42501 is RLS refusing a change
    /// (the UPDATE policy in 20260930000003 is not applied); the three
    /// messages come from votes_guard in 20261015000002
    /// (IOS-DD-GUIDES-06/07).
    nonisolated static func failureMessage(for message: String?, code: String?, hadEarlierVote: Bool) -> String {
        if code == "42501" {
            return hadEarlierVote
                ? "We couldn't change your vote. Your earlier vote still counts."
                : "We couldn't save your vote. Please try again later."
        }
        let text = message ?? ""
        if text.contains("voting_closed") { return "Voting in this category has closed." }
        if text.contains("invalid_write_in") {
            return "That write-in can't be used. Try searching for the place instead."
        }
        if text.contains("unknown_entity") { return "That place is no longer listed." }
        return "Couldn't record your vote. Please try again."
    }
}
