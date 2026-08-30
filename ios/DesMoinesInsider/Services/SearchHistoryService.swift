import Foundation

/// Persists recent search queries in UserDefaults (last 10).
@MainActor
@Observable
final class SearchHistoryService {
    static let shared = SearchHistoryService()

    private(set) var recentSearches: [String] = []

    private let key = "recentSearchQueries"
    private let maxItems = 10

    private init() {
        recentSearches = UserDefaults.standard.stringArray(forKey: key) ?? []
    }

    /// Record a search query (moves to front if already exists).
    func record(_ query: String) {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        recentSearches.removeAll { $0.caseInsensitiveCompare(trimmed) == .orderedSame }
        recentSearches.insert(trimmed, at: 0)
        if recentSearches.count > maxItems {
            recentSearches = Array(recentSearches.prefix(maxItems))
        }
        save()
    }

    /// Remove a single entry.
    func remove(at index: Int) {
        guard recentSearches.indices.contains(index) else { return }
        recentSearches.remove(at: index)
        save()
    }

    /// Remove an entry by value. Safer than `remove(at:)` from a view, where the
    /// list can mutate between render and tap and an index would delete the wrong
    /// row. Entries are unique (case-insensitive) so this removes exactly one.
    func remove(_ query: String) {
        recentSearches.removeAll { $0.caseInsensitiveCompare(query) == .orderedSame }
        save()
    }

    /// Clear all history.
    func clearAll() {
        recentSearches = []
        save()
    }

    private func save() {
        UserDefaults.standard.set(recentSearches, forKey: key)
    }
}
