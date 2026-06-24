import SwiftUI

/// "This Weekend" guide (IOS-PARITY-004). Groups the weekend's events by
/// Fri/Sat/Sun and surfaces featured dining + attractions — the same cross-type
/// curation as web /weekend. Refreshes its window by the current week.
///
/// Reachable from the Home "This Weekend" rail's See-all, the Discover hub tile,
/// and the `/weekend` deep link. Standalone it owns a NavigationStack; pushed
/// (Home/Discover) it inherits the ambient one.
struct WeekendView: View {
    var ownsNavigationStack: Bool = true

    @State private var viewModel = WeekendViewModel()
    @State private var toast: ToastMessage?

    var body: some View {
        if ownsNavigationStack {
            NavigationStack { content }
        } else {
            content
        }
    }

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header

                if let error = viewModel.errorMessage, viewModel.isEmpty {
                    errorBanner(error)
                } else if viewModel.isLoading && viewModel.isEmpty {
                    loadingState
                } else if viewModel.isEmpty {
                    EmptyStateView(
                        icon: "calendar",
                        title: "Nothing scheduled yet",
                        message: "We're still gathering this weekend's plans. Check back soon!"
                    )
                    .padding(.top, 30)
                } else {
                    // Events fetch can fail while featured rails still load — in
                    // that case isEmpty is false, so surface the error inline
                    // instead of showing zero events with no explanation
                    // (IOS-AUDIT-UX-016).
                    if let error = viewModel.errorMessage, viewModel.populatedDays.isEmpty {
                        errorBanner(error)
                    }

                    ForEach(viewModel.populatedDays) { day in
                        daySection(day)
                    }

                    AdSlot(.feed)

                    if !viewModel.featuredRestaurants.isEmpty {
                        featuredRestaurantsRail
                    }
                    if !viewModel.featuredAttractions.isEmpty {
                        featuredAttractionsRail
                    }
                }
            }
            .padding(.vertical, 8)
        }
        .navigationTitle("This Weekend")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { shareButton }
        }
        .refreshable {
            await viewModel.refresh()
            // Reflect the real outcome instead of always firing success (UX-015).
            UINotificationFeedbackGenerator()
                .notificationOccurred(viewModel.errorMessage == nil ? .success : .error)
        }
        .navigationDestination(for: Event.self) { EventDetailView(event: $0) }
        .navigationDestination(for: Restaurant.self) { RestaurantDetailView(restaurant: $0) }
        .navigationDestination(for: Attraction.self) { AttractionDetailView(attraction: $0) }
        .toastOverlay(message: $toast)
        .task { await viewModel.loadInitialData() }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(viewModel.window.rangeLabel, systemImage: "calendar")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.accentColor)
            Text("Your weekend in Des Moines")
                .font(.title2.bold())
            if viewModel.totalEvents > 0 {
                Text("\(viewModel.totalEvents) events across the weekend, plus featured picks.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Day section

    private func daySection(_ day: WeekendWindow.Day) -> some View {
        let events = viewModel.eventsByDay[day] ?? []
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: day.systemImage)
                    .foregroundStyle(Color.accentColor)
                Text(day.title)
                    .font(.title3.bold())
                Spacer()
                Text("\(events.count)")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(day.title), \(events.count) events")

            LazyVStack(spacing: 12) {
                ForEach(events) { event in
                    NavigationLink(value: event) {
                        ContentCard(event.cardData, variant: .standard, toast: $toast)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)
        }
    }

    // MARK: - Featured rails

    private var featuredRestaurantsRail: some View {
        railSection(title: "Featured dining", systemImage: "fork.knife") {
            ForEach(viewModel.featuredRestaurants) { restaurant in
                NavigationLink(value: restaurant) {
                    ContentCard(restaurant.cardData, variant: .compact, decorative: true)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var featuredAttractionsRail: some View {
        railSection(title: "Featured attractions", systemImage: "mountain.2.fill") {
            ForEach(viewModel.featuredAttractions) { attraction in
                NavigationLink(value: attraction) {
                    ContentCard(attraction.cardData, variant: .compact, decorative: true)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func railSection<Content: View>(
        title: String,
        systemImage: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(title, systemImage: systemImage)
                .font(.title3.bold())
                .padding(.horizontal)
                .accessibilityAddTraits(.isHeader)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    content()
                }
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

    // MARK: - Share

    private var shareButton: some View {
        let url = Config.siteURL.appendingPathComponent("weekend")
        let text = "This weekend in Des Moines (\(viewModel.window.rangeLabel)) — events, dining & more on Des Moines Insider"
        return ShareLink(item: url, subject: Text("This Weekend in Des Moines"), message: Text(text)) {
            Image(systemName: "square.and.arrow.up")
        }
        .accessibilityLabel("Share this weekend's guide")
    }
}

#Preview {
    WeekendView()
}
