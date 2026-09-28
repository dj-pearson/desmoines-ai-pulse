import SwiftUI

/// This swiping run's likes, to open or share (IOS-DD-DISCOVER-20). "Saved N"
/// was static text, so a run left nothing to come back to.
struct SwipeRecapView: View {
    let items: [SwipeItem]
    var onOpen: (SwipeItem) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List(items) { item in
                Button {
                    onOpen(item)
                } label: {
                    SwipeRecapRow(item: item)
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opens details")
            }
            .listStyle(.plain)
            .navigationTitle(items.count == 1 ? "1 pick" : "\(items.count) picks")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: SwipeRecap.shareText(items)) {
                        Image(systemName: "square.and.arrow.up")
                    }
                    .accessibilityLabel("Share your picks")
                    .disabled(items.isEmpty)
                }
            }
        }
    }
}

private struct SwipeRecapRow: View {
    let item: SwipeItem

    var body: some View {
        HStack(spacing: 12) {
            CachedAsyncImage(url: item.imageUrl) {
                Color(.systemGray5)
                    .overlay(
                        Image(systemName: item.typeIcon)
                            .foregroundStyle(.secondary)
                    )
            }
            .frame(width: 56, height: 56)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                Text(item.subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                if !item.badges.isEmpty {
                    Text(item.badges.joined(separator: " - "))
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.tertiary)
                .accessibilityHidden(true)
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// Share text for a recap: one line per pick with its web link, at most
/// `maxItems`.
enum SwipeRecap {
    static let maxItems = 10

    static func shareText(_ items: [SwipeItem]) -> String {
        let lines = items.prefix(maxItems).map { "- \($0.title) \(url(for: $0).absoluteString)" }
        return (["My Des Moines picks:"] + lines).joined(separator: "\n")
    }

    static func url(for item: SwipeItem) -> URL {
        switch item {
        case .event(let e):
            return Config.siteURL.appendingPathComponent("events").appendingPathComponent(e.id)
        case .restaurant(let r):
            // The web's canonical /restaurants/:slug, as the detail share uses.
            let key = (r.slug?.isEmpty == false ? r.slug : nil) ?? r.id
            return Config.siteURL.appendingPathComponent("restaurants").appendingPathComponent(key)
        }
    }
}
