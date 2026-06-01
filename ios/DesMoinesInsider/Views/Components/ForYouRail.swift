import SwiftUI

/// Horizontal rail of personalized event picks shown above the Featured
/// carousel on Home. When the user has fewer than 5 swipes the rail falls
/// back to "Trending now" with the same card shape.
///
/// IOS-DISCOVER-2026-002.
struct ForYouRail: View {
    @State private var service = ForYouService.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(headerTitle)
                    .font(.headline)
                Spacer()
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    Task { await service.refresh() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.subheadline)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Refresh recommendations")
                .disabled(service.isLoading)
            }
            .padding(.horizontal)

            if service.recommendations.isEmpty {
                if service.isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding()
                } else {
                    EmptyView()
                }
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(service.recommendations) { rec in
                            // Card-style row. Navigation lives in the
                            // .navigationDestination on the parent — we
                            // deep-link via the rec.id when available so
                            // the EventDetailView fetches by id.
                            ForYouCard(rec: rec)
                        }
                    }
                    .padding(.horizontal)
                }
            }
        }
        .task { await service.refresh() }
    }

    private var headerTitle: String {
        switch service.source {
        case .forYou: return "For You"
        case .trending: return "Trending now"
        }
    }
}

private struct ForYouCard: View {
    let rec: ForYouService.Recommendation

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ZStack {
                if let urlString = rec.imageUrl, URL(string: urlString) != nil {
                    CachedAsyncImage(url: urlString)
                        .scaledToFill()
                } else {
                    Color.secondary.opacity(0.15)
                }
            }
            .frame(width: 200, height: 120)
            .clipShape(RoundedRectangle(cornerRadius: 10))

            Text(rec.title ?? "Untitled")
                .font(.subheadline.weight(.semibold))
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .foregroundStyle(.primary)

            if let reason = rec.recommendationReason {
                Text(reason)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .frame(width: 200, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(rec.title ?? "Event"). \(rec.recommendationReason ?? "")")
    }
}

#Preview {
    NavigationStack {
        ForYouRail()
    }
}
