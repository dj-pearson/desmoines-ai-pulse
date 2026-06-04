import SwiftUI

/// IOS-PARITY-007 · User Dashboard — the signed-in "home base".
///
/// Aggregates the user's stuff in one place (parity with web /dashboard):
/// subscription status, saved Trip Planner itineraries, favorites overview,
/// saved searches/alerts (IOS-PARITY-008), recently viewed, and For-You
/// recommendations. Guests get a sign-in prompt — never a dead end.
struct DashboardView: View {
    /// Profile pushes this into its own stack (false); standalone owns one (true).
    var ownsNavigationStack: Bool = true

    @State private var auth = AuthService.shared
    @State private var favorites = FavoritesService.shared
    @State private var recents = RecentlyViewedService.shared
    @State private var tripService = TripPlannerService.shared

    @State private var trips: [TripPlan] = []
    @State private var isLoading = true
    @State private var detailTarget: DetailTarget?
    @State private var showTripPlanner = false

    enum DetailTarget: Identifiable, Hashable {
        case event(Event)
        case restaurant(Restaurant)
        case attraction(Attraction)
        case article(Article)
        case hotel(Hotel)
        case trip(TripPlan)

        var id: String {
            switch self {
            case .event(let e): return "event-\(e.id)"
            case .restaurant(let r): return "restaurant-\(r.id)"
            case .attraction(let a): return "attraction-\(a.id)"
            case .article(let a): return "article-\(a.id)"
            case .hotel(let h): return "hotel-\(h.id)"
            case .trip(let t): return "trip-\(t.id)"
            }
        }
    }

    var body: some View {
        if ownsNavigationStack {
            NavigationStack { content.navigationTitle("Dashboard") }
        } else {
            content.navigationTitle("Dashboard")
        }
    }

    @ViewBuilder
    private var content: some View {
        Group {
            if !auth.isAuthenticated {
                guestState
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        SubscriptionBanner(style: .full)
                            .padding(.horizontal)
                            .padding(.top, 8)

                        itinerariesSection
                        favoritesSection
                        alertsSection
                        recentlyViewedSection

                        ForYouRail()
                    }
                    .padding(.vertical, 8)
                }
            }
        }
        .navigationDestination(item: $detailTarget) { target in
            switch target {
            case .event(let e): EventDetailView(event: e)
            case .restaurant(let r): RestaurantDetailView(restaurant: r)
            case .attraction(let a): AttractionDetailView(attraction: a)
            case .article(let a): ArticleDetailView(article: a)
            case .hotel(let h): HotelDetailView(hotel: h)
            case .trip(let t): ItineraryDetailView(trip: t)
            }
        }
        .navigationDestination(for: SavedSearch.self) { SavedSearchResultsView(savedSearch: $0) }
        .sheet(isPresented: $showTripPlanner, onDismiss: { Task { await loadTrips() } }) {
            TripPlannerView(showsCloseButton: true)
        }
        .task { await load() }
        .refreshable { await load() }
    }

    // MARK: - Sections

    private var itinerariesSection: some View {
        SectionContainer(title: "Your itineraries", systemImage: "map.fill") {
            if isLoading {
                ProgressView().padding(.horizontal)
            } else if trips.isEmpty {
                EmptyHint(
                    text: "Plan an AI itinerary for your next Des Moines outing.",
                    actionTitle: "Plan a trip"
                ) { showTripPlanner = true }
            } else {
                VStack(spacing: 8) {
                    ForEach(trips.prefix(3)) { trip in
                        Button { detailTarget = .trip(trip) } label: {
                            rowCard(title: trip.title, subtitle: trip.dateRangeDisplay, systemImage: "map")
                        }
                        .buttonStyle(.plain)
                    }
                    Button { showTripPlanner = true } label: {
                        Label("Plan another trip", systemImage: "plus.circle")
                            .font(.subheadline.weight(.medium))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.horizontal)
                    .padding(.top, 2)
                }
            }
        }
    }

    private var favoritesSection: some View {
        SectionContainer(title: "Saved", systemImage: "heart.fill") {
            HStack(spacing: 10) {
                favStat("Events", favorites.favoriteEventIds.count, "calendar")
                favStat("Dining", favorites.favoriteRestaurantIds.count, "fork.knife")
                favStat("Places", favorites.favoriteAttractionIds.count, "mountain.2.fill")
                favStat("Guides", favorites.favoriteArticleIds.count, "doc.richtext")
            }
            .padding(.horizontal)
            if favorites.totalFavoritesCount == 0 && favorites.favoriteArticleIds.isEmpty {
                EmptyHint(text: "Tap the heart on any listing to save it here.", actionTitle: nil, action: nil)
            }
        }
    }

    private var alertsSection: some View {
        SectionContainer(title: "Saved searches & alerts", systemImage: "bell.fill") {
            // IOS-PARITY-008 — manage saved searches + alerts inline.
            SavedSearchesList()
        }
    }

    @ViewBuilder
    private var recentlyViewedSection: some View {
        if !recents.recent.isEmpty {
            SectionContainer(title: "Jump back in", systemImage: "clock.arrow.circlepath") {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(recents.recent) { item in
                            Button { openRecent(item) } label: {
                                recentCard(item)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal)
                }
            }
        }
    }

    private var guestState: some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "rectangle.stack.person.crop")
                .font(.system(size: 64))
                .foregroundStyle(Color.accentColor.opacity(0.5))
            Text("Your Dashboard")
                .font(.title3.bold())
            Text("Sign in to see your saved itineraries, favorites, alerts, and personalized picks all in one place.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 36)
            NavigationLink { AuthView() } label: {
                Text("Sign In or Create Account")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal, 36)
            }
            SubscriptionBanner(style: .compact)
                .padding(.horizontal, 24)
            Spacer()
        }
    }

    // MARK: - Pieces

    private func favStat(_ label: String, _ count: Int, _ icon: String) -> some View {
        VStack(spacing: 4) {
            Image(systemName: icon).font(.title3).foregroundStyle(Color.accentColor)
            Text("\(count)").font(.title3.bold())
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(count) saved \(label)")
    }

    private func rowCard(title: String, subtitle: String, systemImage: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .foregroundStyle(Color.accentColor)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold)).lineLimit(1).foregroundStyle(.primary)
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
    }

    private func recentCard(_ item: RecentlyViewedService.RecentItem) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            ZStack {
                if let url = item.imageUrl, !url.isEmpty {
                    CachedAsyncImage(url: url) { Color.secondary.opacity(0.15) }
                        .scaledToFill()
                } else {
                    Color.secondary.opacity(0.15)
                    Image(systemName: item.systemImage).foregroundStyle(.tint)
                }
            }
            .frame(width: 150, height: 96)
            .clipShape(RoundedRectangle(cornerRadius: 10))

            Text(item.title)
                .font(.caption.weight(.medium))
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .foregroundStyle(.primary)
        }
        .frame(width: 150, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(item.title)
    }

    // MARK: - Data

    private func load() async {
        async let _ = favorites.loadFavorites()
        await loadTrips()
    }

    private func loadTrips() async {
        isLoading = true
        trips = await tripService.fetchTrips()
        isLoading = false
    }

    private func openRecent(_ item: RecentlyViewedService.RecentItem) {
        Task {
            do {
                switch item.type {
                case "event":
                    detailTarget = .event(try await EventsService.shared.fetchEvent(id: item.itemId))
                case "restaurant":
                    detailTarget = .restaurant(try await RestaurantsService.shared.fetchRestaurant(id: item.itemId))
                case "attraction":
                    detailTarget = .attraction(try await AttractionsService.shared.fetchAttraction(id: item.itemId))
                case "article":
                    detailTarget = .article(try await ArticlesService.shared.fetchArticle(id: item.itemId))
                case "hotel":
                    detailTarget = .hotel(try await HotelsService.shared.fetchHotel(id: item.itemId))
                default:
                    break
                }
            } catch {
                #if DEBUG
                AppLogger.network.warning("Dashboard openRecent failed: \(error.localizedDescription)")
                #endif
            }
        }
    }
}

// MARK: - Reusable section container

private struct SectionContainer<Content: View>: View {
    let title: String
    let systemImage: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(title, systemImage: systemImage)
                .font(.headline)
                .padding(.horizontal)
                .accessibilityAddTraits(.isHeader)
            content
        }
    }
}

private struct EmptyHint: View {
    let text: String
    let actionTitle: String?
    let action: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(text)
                .font(.footnote)
                .foregroundStyle(.secondary)
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .font(.subheadline.weight(.semibold))
                    .buttonStyle(.bordered)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal)
    }
}

#Preview {
    DashboardView()
}
