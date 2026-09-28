import SwiftUI

/// Horizontal rail of personalized event picks shown above the Featured
/// carousel on Home. When the user has fewer than 5 swipes the rail falls
/// back to "Trending now" with the same card shape.
///
/// IOS-DISCOVER-2026-002.
struct ForYouRail: View {
    @State private var service = ForYouService.shared

    /// The first refresh has finished, so an empty list means "nothing to
    /// show" rather than "not asked yet".
    @State private var hasLoaded = false

    var body: some View {
        Group {
            // Nothing to recommend: no header over an empty space
            // (IOS-DD-EVENTS-20). A zero-height view rather than EmptyView so
            // the `.task` below still has something on screen to run from.
            if hasLoaded && service.recommendations.isEmpty && !service.isLoading {
                Color.clear.frame(height: 0)
            } else {
                rail
            }
        }
        .navigationDestination(for: ForYouService.Recommendation.self) { rec in
            ForYouRecommendationDetailView(recommendation: rec)
        }
        .task {
            await service.refresh()
            hasLoaded = true
        }
    }

    private var rail: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(headerTitle)
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)
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
                ProgressView()
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding()
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
    }

    private var headerTitle: String {
        switch service.source {
        case .forYou: return "For You"
        case .trending: return "Trending now"
        }
    }
}

struct ForYouCard: View {
    let rec: ForYouService.Recommendation

    /// "Sat, Oct 4, 7:00 PM - Wooly's": when and where, which the card never
    /// showed although the RPC returns both (IOS-DD-EVENTS-20). Des Moines
    /// time.
    nonisolated static func secondaryLine(date: String?, venue: String?) -> String? {
        var parts: [String] = []
        if let parsed = DateParser.parse(date) {
            parts.append(parsed.formatted(DesMoinesTime.style(
                .dateTime.weekday(.abbreviated).month(.abbreviated).day().hour().minute()
            )))
        }
        if let venue = venue?.trimmingCharacters(in: .whitespacesAndNewlines), !venue.isEmpty {
            parts.append(venue)
        }
        return parts.isEmpty ? nil : parts.joined(separator: " - ")
    }

    /// The reason, unless it only repeats the rail's own "Trending now"
    /// header.
    nonisolated static func visibleReason(_ reason: String?) -> String? {
        guard let reason = reason?.trimmingCharacters(in: .whitespacesAndNewlines),
              !reason.isEmpty,
              reason.caseInsensitiveCompare("Trending now") != .orderedSame
        else { return nil }
        return reason
    }

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

            if let line = Self.secondaryLine(date: rec.date, venue: rec.venue) {
                Text(line)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            if let reason = Self.visibleReason(rec.recommendationReason) {
                Text(reason)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .frame(width: 200, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            [rec.title ?? "Event", Self.secondaryLine(date: rec.date, venue: rec.venue), Self.visibleReason(rec.recommendationReason)]
                .compactMap { $0 }
                .joined(separator: ". ")
        )
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
