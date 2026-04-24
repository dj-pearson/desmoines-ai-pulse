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

/// Recent searches list with a Clear All action.
struct RecentSearchesList: View {
    let items: [String]
    let onSelect: (String) -> Void
    let onClearAll: () -> Void

    var body: some View {
        if items.isEmpty {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    HStack(spacing: 6) {
                        Image(systemName: "clock.arrow.circlepath")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text("Recent")
                            .font(.subheadline.weight(.semibold))
                    }
                    Spacer()
                    Button("Clear all", action: onClearAll)
                        .font(.subheadline)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 6)

                ForEach(items.prefix(5), id: \.self) { item in
                    Button {
                        onSelect(item)
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "clock.arrow.circlepath")
                                .font(.body)
                                .foregroundStyle(.secondary)
                            Text(item)
                                .font(.body)
                            Spacer()
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Recent search: \(item)")
                }
            }
        }
    }
}

private struct SuggestionChip: View {
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
    VStack(alignment: .leading, spacing: 20) {
        TrendingChipsRow(
            items: ["Live music", "Kid-friendly", "Brunch", "Free", "This weekend"],
            onSelect: { _ in }
        )
        RecentSearchesList(
            items: ["jazz in july", "ramen"],
            onSelect: { _ in },
            onClearAll: {}
        )
    }
}
