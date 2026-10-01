import SwiftUI
import Combine

/// Horizontal row of trending category chips shown in the empty search state.
/// Mirrors Android `TrendingChipsRow.kt`.
struct TrendingChipsRow: View {
    let items: [String]
    let onSelect: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: "chart.line.uptrend.xyaxis")
                    .font(.caption.bold())
                    .foregroundStyle(Color.accentColor)
                Text("Trending")
                    .font(.subheadline.weight(.semibold))
            }
            .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(items, id: \.self) { item in
                        SuggestionChip(text: item) {
                            HapticFeedback.shared.selection()
                            onSelect(item)
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }
}

/// A capsule chip. Internal so the Search screen's quick filters use the same
/// look as the trending row (IOS-DD-SEARCH-08).
struct SuggestionChip: View {
    let text: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(text)
                .font(.subheadline)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(Color(.systemBackground))
                .overlay(
                    Capsule().stroke(Color(.separator), lineWidth: 1)
                )
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .minHitTarget()
        .accessibilityLabel(text)
    }
}

/// Debounces a text binding by the given interval. Use in a SearchViewModel
/// to avoid triggering network requests on every keystroke.
///
/// ```swift
/// @Published var query: String = ""
/// private var cancellable: AnyCancellable?
/// init() {
///     cancellable = $query
///         .debounce(for: .milliseconds(250), scheduler: DispatchQueue.main)
///         .removeDuplicates()
///         .sink { [weak self] in self?.performSearch(query: $0) }
/// }
/// ```
enum SearchDebounce {
    static let defaultInterval: DispatchQueue.SchedulerTimeType.Stride = .milliseconds(250)
}

#Preview {
    TrendingChipsRow(
        items: ["Live music", "Kid-friendly", "Brunch", "Free", "This weekend"],
        onSelect: { _ in }
    )
}
