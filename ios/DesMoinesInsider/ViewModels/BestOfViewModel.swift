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

    private let service = VotingService.shared

    func loadInitialData() async {
        guard categories.isEmpty else { return }
        await refresh()
    }

    func refresh() async {
        isLoading = true
        errorMessage = nil
        do {
            categories = try await service.fetchCategories()
        } catch {
            errorMessage = error.localizedDescription
            categories = []
        }
        isLoading = false
        // Keep the award-badge cache fresh (fail-soft inside the service).
        await Self.refreshWinners()
    }

    /// Loads the winner→category map into the shared cache. Safe to call from
    /// anywhere (e.g. Home on launch) so cards badge winners app-wide.
    static func refreshWinners() async {
        let winners = await VotingService.shared.fetchWinners()
        BestOfWinners.shared.update(winners)
    }
}
