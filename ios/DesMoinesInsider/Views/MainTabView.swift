import SwiftUI

/// Root tab navigation. 6 tabs: Home, Dining, Search, Map (Explore), Saved, Profile.
///
/// On iPhone (compact width): standard TabView with bottom tab bar.
/// On iPad (regular width): sidebar navigation with list items for each section.
struct MainTabView: View {
    @Environment(\.horizontalSizeClass) private var sizeClass

    @State private var selectedTab = Tab.home {
        didSet {
            if oldValue != selectedTab {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
        }
    }

    // MARK: - Deep Linking (IOS-AUDIT-FEAT-002)

    @State private var deepLink = DeepLinkHandler.shared
    /// Content detail presented modally from a deep link / notification tap.
    @State private var deepLinkDetail: DeepLinkDetail?
    /// Discover surface opened directly from a deep link.
    @State private var discoverRoute: DiscoverDestination?
    /// True while a deep-linked id is being fetched into a full model.
    @State private var isResolvingDeepLink = false

    enum Tab: String, CaseIterable {
        case home, restaurants, search, map, favorites, profile

        var title: String {
            switch self {
            case .home: return "Home"
            case .restaurants: return "Dining"
            case .search: return "Search"
            case .map: return "Map"
            case .favorites: return "Saved"
            case .profile: return "Profile"
            }
        }

        var icon: String {
            switch self {
            case .home: return "house.fill"
            case .restaurants: return "fork.knife"
            case .search: return "magnifyingglass"
            case .map: return "map.fill"
            case .favorites: return "heart.fill"
            case .profile: return "person.fill"
            }
        }
    }

    var body: some View {
        Group {
            if sizeClass == .regular {
                iPadLayout
            } else {
                iPhoneLayout
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            OfflineBanner()
        }
        .tint(Color.accentColor)
        .onAppear {
            Self.configureTranslucentAppearance()
        }
        // Resolve any pending deep link both on first appearance (cold launch from
        // a link/notification) and whenever a new one arrives while running.
        .onChange(of: deepLink.pendingDestination, initial: true) { _, _ in
            resolvePendingDestination()
        }
        .sheet(item: $deepLinkDetail) { detail in
            NavigationStack {
                Group {
                    switch detail {
                    case .event(let event): EventDetailView(event: event)
                    case .restaurant(let restaurant): RestaurantDetailView(restaurant: restaurant)
                    case .attraction(let attraction): AttractionDetailView(attraction: attraction)
                    }
                }
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Done") { deepLinkDetail = nil }
                    }
                }
            }
        }
        .sheet(item: $discoverRoute) { destination in
            DiscoverHubView(initialDestination: destination)
        }
        .overlay {
            if isResolvingDeepLink {
                ZStack {
                    Color.black.opacity(0.15).ignoresSafeArea()
                    ProgressView()
                        .padding(20)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
                }
                .accessibilityLabel("Opening link")
            }
        }
    }

    // MARK: - Deep Link Resolution

    /// Consumes the pending destination and routes to it: tab switch, Discover
    /// surface, or a fetched content detail (events/restaurants/attractions are
    /// deep-linked by id, so the full model is fetched before presenting).
    private func resolvePendingDestination() {
        guard let destination = deepLink.consumeDestination() else { return }
        switch destination {
        case .tab(let tab):
            selectedTab = tab
        case .discover(let surface):
            discoverRoute = surface
        case .event(let id):
            resolveDetail(fallback: .home) { .event(try await EventsService.shared.fetchEvent(id: id)) }
        case .restaurant(let id):
            resolveDetail(fallback: .restaurants) { .restaurant(try await RestaurantsService.shared.fetchRestaurant(id: id)) }
        case .attraction(let id):
            resolveDetail(fallback: .home) { .attraction(try await AttractionsService.shared.fetchAttraction(id: id)) }
        }
    }

    private func resolveDetail(
        fallback: Tab,
        _ fetch: @escaping () async throws -> DeepLinkDetail
    ) {
        Task {
            isResolvingDeepLink = true
            defer { isResolvingDeepLink = false }
            do {
                deepLinkDetail = try await fetch()
            } catch {
                // Couldn't load the linked item — land on a sensible tab instead
                // of leaving the user staring at a spinner.
                AppLogger.nav.warning("Deep link detail fetch failed: \(error.localizedDescription)")
                selectedTab = fallback
            }
        }
    }

    /// Applies a glass-style translucent appearance to the system tab and nav
    /// bars. iOS already renders bars with a `UIBlurEffect` behind the scenes;
    /// we swap to a `.systemUltraThinMaterial` variant and soften the hairline
    /// separator so the bars feel continuous with the content above them.
    private static func configureTranslucentAppearance() {
        let tabAppearance = UITabBarAppearance()
        tabAppearance.configureWithDefaultBackground()
        tabAppearance.backgroundEffect = UIBlurEffect(style: .systemUltraThinMaterial)
        tabAppearance.backgroundColor = UIColor.systemBackground.withAlphaComponent(0.55)
        tabAppearance.shadowColor = UIColor.separator.withAlphaComponent(0.25)
        UITabBar.appearance().standardAppearance = tabAppearance
        UITabBar.appearance().scrollEdgeAppearance = tabAppearance

        let navAppearance = UINavigationBarAppearance()
        navAppearance.configureWithTransparentBackground()
        navAppearance.backgroundEffect = UIBlurEffect(style: .systemUltraThinMaterial)
        navAppearance.backgroundColor = UIColor.systemBackground.withAlphaComponent(0.5)
        navAppearance.shadowColor = .clear
        UINavigationBar.appearance().standardAppearance = navAppearance
        UINavigationBar.appearance().compactAppearance = navAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = navAppearance
    }

    // MARK: - iPhone Layout (TabView)

    private var iPhoneLayout: some View {
        TabView(selection: $selectedTab) {
            HomeView()
                .tabItem {
                    Label(Tab.home.title, systemImage: Tab.home.icon)
                }
                .tag(Tab.home)

            RestaurantsView()
                .tabItem {
                    Label(Tab.restaurants.title, systemImage: Tab.restaurants.icon)
                }
                .tag(Tab.restaurants)

            SearchView()
                .tabItem {
                    Label(Tab.search.title, systemImage: Tab.search.icon)
                }
                .tag(Tab.search)

            EventMapView()
                .tabItem {
                    Label(Tab.map.title, systemImage: Tab.map.icon)
                }
                .tag(Tab.map)

            FavoritesView()
                .tabItem {
                    Label(Tab.favorites.title, systemImage: Tab.favorites.icon)
                }
                .tag(Tab.favorites)

            ProfileView()
                .tabItem {
                    Label(Tab.profile.title, systemImage: Tab.profile.icon)
                }
                .tag(Tab.profile)
        }
    }

    // MARK: - iPad Layout (Sidebar + Detail)

    /// iOS requires Binding<SelectionValue?> (optional) for List selection.
    /// The non-optional overload is macOS-only and would fail to compile on iOS.
    private var iPadSelectionBinding: Binding<Tab?> {
        Binding(
            get: { selectedTab },
            set: { if let tab = $0 { selectedTab = tab } }
        )
    }

    /// iPad sidebar shows the 6 primary tabs plus a dedicated Discover entry
    /// (IOS-IA-002). On iPad there's room, so Discover is a first-class sidebar
    /// item rather than being tucked behind Home as it is on iPhone.
    @State private var iPadShowDiscover = false

    private var iPadLayout: some View {
        NavigationSplitView {
            List(selection: iPadSelectionBinding) {
                ForEach(Tab.allCases, id: \.self) { tab in
                    Label(tab.title, systemImage: tab.icon)
                        .tag(tab)
                }

                Section {
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        iPadShowDiscover = true
                    } label: {
                        Label("Discover", systemImage: "square.grid.2x2.fill")
                    }
                }
            }
            .navigationTitle("DSM Insider")
            .listStyle(.sidebar)
        } detail: {
            tabContent(for: selectedTab)
        }
        .sheet(isPresented: $iPadShowDiscover) {
            DiscoverHubView()
        }
    }

    @ViewBuilder
    private func tabContent(for tab: Tab) -> some View {
        switch tab {
        case .home: HomeView()
        case .restaurants: RestaurantsView()
        case .search: SearchView()
        case .map: EventMapView()
        case .favorites: FavoritesView()
        case .profile: ProfileView()
        }
    }
}

// MARK: - Deep Link Detail Route

/// A fully-resolved content model to present modally from a deep link or
/// notification tap. Identifiable so it can drive `.sheet(item:)`.
private enum DeepLinkDetail: Identifiable {
    case event(Event)
    case restaurant(Restaurant)
    case attraction(Attraction)

    var id: String {
        switch self {
        case .event(let event): return "event-\(event.id)"
        case .restaurant(let restaurant): return "restaurant-\(restaurant.id)"
        case .attraction(let attraction): return "attraction-\(attraction.id)"
        }
    }
}

#Preview {
    MainTabView()
}
