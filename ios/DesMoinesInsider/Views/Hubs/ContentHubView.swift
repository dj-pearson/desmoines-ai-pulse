import SwiftUI

/// Generic curated hub for Music / Sports / Outdoors (IOS-PARITY-006). Mixes a
/// hero + editorial blurb, upcoming themed events, themed attractions, and
/// featured dining — reusing the unified cards + rails. Each hub gets its own
/// in-feed ad slot.
struct ContentHubView: View {
    let hub: ContentHub
    var ownsNavigationStack: Bool = true

    @State private var viewModel: ContentHubViewModel
    @State private var toast: ToastMessage?

    init(hub: ContentHub, ownsNavigationStack: Bool = true) {
        self.hub = hub
        self.ownsNavigationStack = ownsNavigationStack
        _viewModel = State(wrappedValue: ContentHubViewModel(hub: hub))
    }

    var body: some View {
        if ownsNavigationStack {
            NavigationStack { content }
        } else {
            content
        }
    }

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                hero

                if let error = viewModel.errorMessage, viewModel.isEmpty {
                    errorBanner(error)
                } else if viewModel.isLoading && viewModel.isEmpty {
                    loadingState
                } else if viewModel.isEmpty {
                    EmptyStateView(
                        icon: hub.systemImage,
                        title: "Nothing here yet",
                        message: "We're still curating this hub. Check back soon!"
                    )
                    .padding(.top, 20)
                } else {
                    if !viewModel.events.isEmpty { eventsSection }

                    AdSlot(.feed)

                    if !viewModel.attractions.isEmpty {
                        rail(title: hub.attractionsSectionTitle, systemImage: "mappin.and.ellipse") {
                            ForEach(viewModel.attractions) { attraction in
                                NavigationLink(value: attraction) {
                                    ContentCard(attraction.cardData, variant: .compact, decorative: true)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    if !viewModel.dining.isEmpty {
                        rail(title: hub.diningSectionTitle, systemImage: "fork.knife") {
                            ForEach(viewModel.dining) { restaurant in
                                NavigationLink(value: restaurant) {
                                    ContentCard(restaurant.cardData, variant: .compact, decorative: true)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
            .padding(.vertical, 8)
        }
        .navigationTitle(hub.title)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await viewModel.refresh() }
        .navigationDestination(for: Event.self) { EventDetailView(event: $0) }
        .navigationDestination(for: Restaurant.self) { RestaurantDetailView(restaurant: $0) }
        .navigationDestination(for: Attraction.self) { AttractionDetailView(attraction: $0) }
        .toastOverlay(message: $toast)
        .task { await viewModel.loadInitialData() }
    }

    // MARK: - Hero

    private var hero: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 14)
                        .fill(LinearGradient(colors: hub.gradient, startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 52, height: 52)
                    Image(systemName: hub.systemImage)
                        .font(.title2)
                        .foregroundStyle(.white)
                }
                .accessibilityHidden(true)
                Text(hub.title)
                    .font(.title.bold())
            }
            Text(hub.blurb)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Events section (vertical)

    private var eventsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(hub.eventsSectionTitle, systemImage: "calendar")
                .font(.title3.bold())
                .padding(.horizontal)
                .accessibilityAddTraits(.isHeader)

            LazyVStack(spacing: 12) {
                ForEach(viewModel.events) { event in
                    NavigationLink(value: event) {
                        ContentCard(event.cardData, variant: .standard, toast: $toast)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)
        }
    }

    // MARK: - Rail

    private func rail<C: View>(title: String, systemImage: String, @ViewBuilder content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(title, systemImage: systemImage)
                .font(.title3.bold())
                .padding(.horizontal)
                .accessibilityAddTraits(.isHeader)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) { content() }
                    .padding(.horizontal)
            }
        }
    }

    // MARK: - States

    private var loadingState: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(0..<3, id: \.self) { _ in
                ContentCardSkeleton(.standard).padding(.horizontal)
            }
        }
    }

    private func errorBanner(_ error: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.yellow)
            Text(error).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            Spacer()
            Button { Task { await viewModel.refresh() } } label: {
                Text("Retry").font(.caption.bold()).foregroundStyle(Color.accentColor)
            }
        }
        .padding(12)
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 10))
        .padding(.horizontal)
    }
}

#Preview {
    ContentHubView(hub: .music)
}
