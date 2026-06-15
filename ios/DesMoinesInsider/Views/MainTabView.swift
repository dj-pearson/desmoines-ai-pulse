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

    /// Presents the unlimited-favorites paywall when any save surface hits the
    /// free cap (IOS-SUB-011). Driven by a notification so there's exactly one
    /// presenter instead of per-call-site sheets.
    @State private var showFavoritesPaywall = false

    /// Post-onboarding soft paywall (IOS-SUB-013) — engagement-triggered +
    /// frequency-capped by SoftPaywallService, presented from one place here.
    @State private var softPaywallContext: PaywallContext?

    /// Frequency-capped interstitial (IOS-ADS-012), free-tier only, evaluated at
    /// the tab-switch navigation boundary by InterstitialAdService.
    @State private var storeKit = StoreKitService.shared
    @State private var showInterstitial = false

    /// UI-test deep link target for Fastlane Snapshot (IOS-COMPLY-005). Set once
    /// on launch from `--uiTestScreen` so screenshots can land on Discover, Trip
    /// Planner, a paywall, or a content hub regardless of device/idiom.
    @State private var uiTestCover: UITestCover?

    enum UITestCover: String, Identifiable {
        case discover, tripPlanner, paywall, hub
        var id: String { rawValue }
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
            VStack(spacing: 0) {
                OfflineBanner()
                SubscriptionStatusBanner()
            }
        }
        .tint(Color.accentColor)
        .onAppear {
            Self.configureTranslucentAppearance()
            InterstitialAdService.shared.noteSessionStart()
            // Fastlane Snapshot deep link (IOS-COMPLY-005), UI-test only.
            if Config.isUITesting, let screen = Config.uiTestScreen {
                uiTestCover = UITestCover(rawValue: screen)
            }
        }
        .onChange(of: selectedTab) { _, _ in
            // Major navigation boundary. Free tier only; the service enforces the
            // session cap, the "not on first sessions" rule and the min interval.
            guard storeKit.currentTier == .free else { return }
            if InterstitialAdService.shared.shouldPresentAtBoundary() {
                InterstitialAdService.shared.markPresented()
                showInterstitial = true
            }
        }
        .fullScreenCover(isPresented: $showInterstitial) {
            InterstitialAdView()
        }
        .onReceive(NotificationCenter.default.publisher(for: .favoritesLimitReached)) { _ in
            showFavoritesPaywall = true
        }
        .sheet(isPresented: $showFavoritesPaywall) {
            PaywallView(context: .unlimitedFavorites)
        }
        .onReceive(NotificationCenter.default.publisher(for: .softPaywallTriggered)) { note in
            let id = note.userInfo?["context"] as? String ?? "unlimited_favorites"
            softPaywallContext = Self.softContext(for: id)
        }
        .sheet(item: $softPaywallContext) { ctx in
            PaywallView(context: ctx)
        }
        // Fastlane Snapshot screenshot destinations (IOS-COMPLY-005).
        .fullScreenCover(item: $uiTestCover) { cover in
            switch cover {
            case .discover: DiscoverHubView()
            case .tripPlanner: TripPlannerView(ownsNavigationStack: true)
            case .paywall: PaywallView(context: .tripPlanner)
            case .hub: ContentHubView(hub: .music)
            }
        }
    }

    /// Maps a SoftPaywallService context id to its PaywallContext preset.
    private static func softContext(for id: String) -> PaywallContext {
        switch id {
        case "trip_planner": return .tripPlanner
        default: return .unlimitedFavorites
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

    /// Sidebar selection: the 6 primary tabs PLUS the Discover-family
    /// destinations, all first-class on iPad where there's room (IOS-IA-005).
    /// Discover, Trip Planner, and Dashboard render in the detail pane rather
    /// than as a sheet, giving a proper list+detail two-pane.
    enum SidebarSelection: Hashable {
        case tab(Tab)
        case discover
        case tripPlanner
        case dashboard
    }

    @State private var sidebarSelection: SidebarSelection? = .tab(.home)

    private var iPadLayout: some View {
        NavigationSplitView {
            List(selection: $sidebarSelection) {
                Section {
                    ForEach(Tab.allCases, id: \.self) { tab in
                        Label(tab.title, systemImage: tab.icon)
                            .tag(SidebarSelection.tab(tab))
                    }
                }

                Section("Explore") {
                    Label("Discover", systemImage: "square.grid.2x2.fill")
                        .tag(SidebarSelection.discover)
                    Label("Trip Planner", systemImage: "map.fill")
                        .tag(SidebarSelection.tripPlanner)
                    Label("Dashboard", systemImage: "rectangle.stack.person.crop")
                        .tag(SidebarSelection.dashboard)
                }
            }
            .navigationTitle("DSM Insider")
            .listStyle(.sidebar)
        } detail: {
            detailPane
        }
        // Keep the sidebar and `selectedTab` (used by deep links + the
        // interstitial boundary) in sync, without feedback loops.
        .onChange(of: sidebarSelection) { _, newValue in
            if let newValue, case .tab(let tab) = newValue, tab != selectedTab { selectedTab = tab }
        }
        .onChange(of: selectedTab) { _, newTab in
            if sidebarSelection != .tab(newTab) { sidebarSelection = .tab(newTab) }
        }
    }

    @ViewBuilder
    private var detailPane: some View {
        switch sidebarSelection ?? .tab(.home) {
        case .tab(let tab): tabContent(for: tab)
        case .discover: DiscoverHubView()
        case .tripPlanner: TripPlannerView(ownsNavigationStack: true)
        case .dashboard: DashboardView(ownsNavigationStack: true)
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

#Preview {
    MainTabView()
}
