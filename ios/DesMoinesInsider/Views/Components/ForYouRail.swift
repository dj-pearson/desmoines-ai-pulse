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
                            // Tapping resolves the recommendation (a partial
                            // event) to its full Event and opens the detail
                            // (IOS-AUDIT-FEAT-014). The destination is registered
                            // below so the rail works in any enclosing stack.
                            NavigationLink(value: rec) {
                                ForYouCard(rec: rec)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal)
                }
            }
        }
        .navigationDestination(for: ForYouService.Recommendation.self) { rec in
            ForYouRecommendationDetailView(recommendation: rec)
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

/// Resolves a For You recommendation (which carries only a partial event) to a
/// full `Event` and shows its detail screen. Mirrors the deep-link resolver's
/// loading/failed phases so a tapped card never dead-ends (IOS-AUDIT-FEAT-014).
private struct ForYouRecommendationDetailView: View {
    let recommendation: ForYouService.Recommendation

    @State private var phase: Phase = .loading

    private enum Phase {
        case loading
        case failed
        case loaded(Event)
    }

    var body: some View {
        Group {
            switch phase {
            case .loading:
                ProgressView("Loading…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed:
                EmptyStateView(
                    icon: "exclamationmark.triangle",
                    title: "Couldn't Load",
                    message: "This recommendation couldn't be opened. It may have been removed or you're offline.",
                    actionTitle: "Try Again",
                    action: { Task { await load() } }
                )
            case .loaded(let event):
                EventDetailView(event: event)
            }
        }
        .navigationTitle(recommendation.title ?? "Event")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        phase = .loading
        do {
            let event = try await EventsService.shared.fetchEvent(id: recommendation.id.uuidString)
            phase = .loaded(event)
        } catch {
            phase = .failed
        }
    }
}

#Preview {
    NavigationStack {
        ForYouRail()
    }
}
