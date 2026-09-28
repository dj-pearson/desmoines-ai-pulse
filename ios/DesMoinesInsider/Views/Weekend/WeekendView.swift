import SwiftUI

/// "This Weekend" guide (IOS-PARITY-004). Groups the weekend's events by
/// Fri/Sat/Sun and surfaces featured dining + attractions — the same cross-type
/// curation as web /weekend. Refreshes its window by the current week.
///
/// Laid out as a plan rather than three lists (IOS-DD-BROWSE-06): a day-jump
/// chip row, our picks, free and family rails, the runs that last all weekend,
/// then the days still ahead, with the days already gone folded away at the
/// bottom. Everything is derived from the rows in hand by `WeekendGuide`.
///
/// Reachable from the Home "This Weekend" rail's See-all, the Discover hub tile,
/// and the `/weekend` deep link. Standalone it owns a NavigationStack; pushed
/// (Home/Discover) it inherits the ambient one.
struct WeekendView: View {
    var ownsNavigationStack: Bool = true

    @Environment(\.scenePhase) private var scenePhase
    @State private var viewModel = WeekendViewModel()
    @State private var toast: ToastMessage?
    /// Days whose full list is showing (each is capped at `dayCap` otherwise).
    @State private var expandedDays: Set<WeekendWindow.Day> = []
    @State private var showPastDays = false

    private let dayCap = 10

    var body: some View {
        if ownsNavigationStack {
            NavigationStack { content }
        } else {
            content
        }
    }

    private var content: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    header
                    dayChips(proxy)
                    stateContent
                }
                .padding(.vertical, 8)
            }
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
        .reloadOnReconnect(if: viewModel.totalEvents == 0) { await viewModel.refresh() }
        .navigationDestination(for: Event.self) { EventDetailView(event: $0) }
        .navigationDestination(for: Restaurant.self) { RestaurantDetailView(restaurant: $0) }
        .navigationDestination(for: Attraction.self) { AttractionDetailView(attraction: $0) }
        .toastOverlay(message: $toast)
        .task { await viewModel.loadInitialData() }
        // Back from the background on a new weekend: loadInitialData reloads
        // only when the window moved on (IOS-DD-BROWSE-02).
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await viewModel.loadInitialData() } }
        }
    }

    /// Error, loading and empty are judged on events alone
    /// (IOS-DD-BROWSE-05): the featured rails load on their own and used to
    /// hide the skeleton, or stand in for an explanation, as soon as they came
    /// back.
    @ViewBuilder
    private var stateContent: some View {
        if let error = viewModel.errorMessage, viewModel.totalEvents == 0 {
            errorBanner(error)
            featuredRails
        } else if viewModel.isLoading && viewModel.totalEvents == 0 {
            loadingState
            featuredRails
        } else if viewModel.totalEvents == 0 {
            noEventsCard
            featuredRails
        } else {
            guideSections
        }
    }

    @ViewBuilder
    private var guideSections: some View {
        picksRail
        eventRail(title: "Free this weekend", systemImage: "gift", events: viewModel.freeEvents)
        eventRail(title: "With the kids", systemImage: "figure.and.child.holdinghands", events: viewModel.familyEvents)
        allWeekendSection
        ForEach(viewModel.dayOrder.upcoming) { day in
            daySection(day)
        }
        AdSlot(.feed)
        featuredRails
        pastDaysSection
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
                Text(Self.countLine(viewModel.totalEvents, truncated: viewModel.isTruncated))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal)
        .accessibilityElement(children: .combine)
    }

    /// "1 event", "40 events", or "250+ events" when the fetch hit its limit
    /// and the number is a floor (IOS-DD-BROWSE-04).
    nonisolated static func countLine(_ n: Int, truncated: Bool) -> String {
        let count = truncated ? "\(n)+ events" : (n == 1 ? "1 event" : "\(n) events")
        return "\(count) across the weekend, plus featured picks."
    }

    // MARK: - Day chips

    /// "Fri 12", "Sat 20", "Sun 9": jump to a day. A past day opens the
    /// folded section first.
    @ViewBuilder
    private func dayChips(_ proxy: ScrollViewProxy) -> some View {
        let days = viewModel.populatedDays
        if days.count > 1 {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(days) { day in
                        dayChip(day, proxy: proxy)
                    }
                }
                .padding(.horizontal)
            }
        }
    }

    private func dayChip(_ day: WeekendWindow.Day, proxy: ScrollViewProxy) -> some View {
        let count = viewModel.eventsByDay[day]?.count ?? 0
        return Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            if viewModel.dayOrder.past.contains(day) { showPastDays = true }
            withAnimation { proxy.scrollTo(day, anchor: .top) }
        } label: {
            Text("\(String(day.title.prefix(3))) \(count)")
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(Color(.systemGray6), in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .minHitTarget()
        .accessibilityLabel("Jump to \(day.title), \(Self.eventCount(count))")
    }

    nonisolated static func eventCount(_ n: Int) -> String {
        n == 1 ? "1 event" : "\(n) events"
    }

    // MARK: - Picks & themed rails

    @ViewBuilder
    private var picksRail: some View {
        let picks = viewModel.picks
        if !picks.isEmpty {
            railSection(title: "Our picks", systemImage: "star.fill") {
                ForEach(picks) { event in
                    NavigationLink(value: event) {
                        ContentCard(event.cardData, variant: .featured, decorative: true)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(event.railAccessibilityLabel)
                }
            }
        }
    }

    /// A compact event rail, hidden below two rows: one card is not a theme.
    @ViewBuilder
    private func eventRail(title: String, systemImage: String, events: [Event]) -> some View {
        if events.count >= 2 {
            railSection(title: title, systemImage: systemImage) {
                ForEach(events) { event in
                    NavigationLink(value: event) {
                        ContentCard(event.cardData, variant: .compact, decorative: true)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(event.railAccessibilityLabel)
                }
            }
        }
    }

    // MARK: - All weekend (IOS-DD-BROWSE-04)

    @ViewBuilder
    private var allWeekendSection: some View {
        let events = viewModel.allWeekend
        if !events.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                sectionHeader(title: "All weekend", systemImage: "calendar.badge.clock", count: events.count)
                Text("Festivals and exhibits still running.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)
                eventList(Array(events.prefix(6)))
            }
        }
    }

    // MARK: - Day section

    private func daySection(_ day: WeekendWindow.Day) -> some View {
        let events = viewModel.dayEvents(day)
        let expanded = expandedDays.contains(day)
        return VStack(alignment: .leading, spacing: 12) {
            sectionHeader(title: day.title, systemImage: day.systemImage, count: events.count)
            eventList(expanded ? events : Array(events.prefix(dayCap)))
            if events.count > dayCap && !expanded {
                Button("Show all \(events.count)") {
                    expandedDays.insert(day)
                }
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity)
                .minHitTarget()
            }
        }
        .id(day)
    }

    private func sectionHeader(title: String, systemImage: String, count: Int) -> some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage)
                .foregroundStyle(Color.accentColor)
            Text(title)
                .font(.title3.bold())
            Spacer()
            Text("\(count)")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title), \(Self.eventCount(count))")
        .accessibilityAddTraits(.isHeader)
    }

    private func eventList(_ events: [Event]) -> some View {
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

    /// The days already gone, folded so Saturday morning opens on Saturday
    /// (IOS-DD-BROWSE-06).
    @ViewBuilder
    private var pastDaysSection: some View {
        let past = viewModel.dayOrder.past
        if !past.isEmpty {
            DisclosureGroup(isExpanded: $showPastDays) {
                VStack(alignment: .leading, spacing: 22) {
                    ForEach(past) { day in
                        daySection(day)
                    }
                }
                .padding(.top, 12)
            } label: {
                Text("Earlier this weekend")
                    .font(.headline)
            }
            .padding(.horizontal)
        }
    }

    // MARK: - Featured rails

    @ViewBuilder
    private var featuredRails: some View {
        if !viewModel.featuredRestaurants.isEmpty {
            featuredRestaurantsRail
        }
        if !viewModel.featuredAttractions.isEmpty {
            featuredAttractionsRail
        }
    }

    private var featuredRestaurantsRail: some View {
        railSection(title: "Before the show", systemImage: "fork.knife") {
            ForEach(viewModel.featuredRestaurants) { restaurant in
                NavigationLink(value: restaurant) {
                    ContentCard(restaurant.cardData, variant: .compact, decorative: true)
                }
                .buttonStyle(.plain)
                // The card is hidden from VoiceOver; the link carries its
                // words (IOS-DD-BROWSE-07).
                .accessibilityLabel(restaurant.railAccessibilityLabel)
            }
        }
    }

    private var featuredAttractionsRail: some View {
        railSection(title: "Daytime ideas", systemImage: "mountain.2.fill") {
            ForEach(viewModel.featuredAttractions) { attraction in
                NavigationLink(value: attraction) {
                    ContentCard(attraction.cardData, variant: .compact, decorative: true)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(attraction.railAccessibilityLabel)
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

    /// An events-empty weekend says so and offers a next step
    /// (IOS-DD-BROWSE-05). It used to show the header, an ad and two generic
    /// rails with no word about events.
    private var noEventsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("No events listed for \(viewModel.window.rangeLabel) yet")
                .font(.headline)
            Text("New listings land through the week. Meanwhile:")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Button {
                DeepLinkHandler.shared.open(.tab(.search))
            } label: {
                Label("Search upcoming events", systemImage: "magnifyingglass")
            }
            .minHitTarget()
            Button {
                DeepLinkHandler.shared.open(.discover(.tripPlanner))
            } label: {
                Label("Plan with the Trip Planner", systemImage: "map")
            }
            .minHitTarget()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 14))
        .padding(.horizontal)
    }

    private func errorBanner(_ error: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.yellow)
            Text(error).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            Spacer()
            Button { Task { await viewModel.refresh() } } label: {
                Text("Retry").font(.caption.bold()).foregroundStyle(Color.accentColor)
            }
            .minHitTarget()
        }
        .padding(12)
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 10))
        .padding(.horizontal)
    }

    // MARK: - Share

    private var shareButton: some View {
        let url = Config.siteURL.appendingPathComponent("weekend")
        let text = "This weekend in Des Moines (\(viewModel.window.rangeLabel)) - events, dining & more on Des Moines Insider"
        return ShareLink(item: url, subject: Text("This Weekend in Des Moines"), message: Text(text)) {
            Image(systemName: "square.and.arrow.up")
        }
        .accessibilityLabel("Share this weekend's guide")
    }
}

#Preview {
    WeekendView()
}
