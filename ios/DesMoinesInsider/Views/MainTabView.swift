import SwiftUI

/// Root tab navigation. 6 tabs: Home, Dining, Search, Map (Explore), Saved, Profile.
///
/// On iPhone (compact width): standard TabView with bottom tab bar.
/// On iPad (regular width): sidebar navigation with list items for each section.
struct MainTabView: View {
    @Environment(\.horizontalSizeClass) private var sizeClass

    // Haptic on tab change lives in `.onChange(of: selectedTab)` below, not in a
    // `didSet`: SwiftUI mutates this through the `$selectedTab` binding on a real
    // tab-bar tap, which does not invoke the property observer, so a `didSet`
    // haptic only fired for programmatic switches (IOS-AUDIT-UX-004).
    @State private var selectedTab = Tab.home

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

    /// Deep-link / universal-link / notification routing (IOS-AUDIT-FEAT-002/003).
    /// DeepLinkHandler sets `pendingDestination`; we consume it here and present
    /// the resolved screen, clearing the pending value after navigation.
    @State private var deepLink = DeepLinkHandler.shared
    @State private var deepLinkPresentation: DeepLinkPresentation?

    /// Siri / Shortcuts intents (IOS-AUDIT-FEAT-025). Intents set
    /// `PulseIntentDispatcher.shared.pending` and open the app; only SearchView
    /// consumes it, so if the app opens on another tab the intent is lost. We
    /// observe here and switch to the Search tab (leaving `pending` set for
    /// SearchView to read and apply) so intents work from any launch state.
    @State private var intentDispatcher = PulseIntentDispatcher.shared

    /// Pending "Ask Pulse" Siri intent to present as the AI chat (FEAT-028).
    @State private var askPulseLaunch: AskPulseLaunch?

    /// Non-blocking toast for StoreKit transaction failures (IOS-AUDIT-FEAT-011).
    /// StoreKitService posts `.storeKitTransactionFailed` from its global
    /// `Transaction.updates` listener, which can fire at any time, so the
    /// observer lives on this always-present root rather than the paywall.
    @State private var transactionFailureToast: ToastMessage?

    struct AskPulseLaunch: Identifiable {
        let id = UUID()
        let query: String
    }

    enum DeepLinkPresentation: Identifiable {
        case event(String)
        case restaurant(String)
        case attraction(String)
        case discover(DiscoverDestination)

        var id: String {
            switch self {
            case .event(let id): return "event-\(id)"
            case .restaurant(let id): return "restaurant-\(id)"
            case .attraction(let id): return "attraction-\(id)"
            case .discover(let d): return "discover-\(d.rawValue)"
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
            // Consume any deep link that arrived before this view appeared
            // (cold launch from a link or notification).
            routeDeepLink()
            // Same for a Siri/Shortcuts intent fired on cold launch.
            routeIntent(intentDispatcher.pending)
        }
        .onChange(of: deepLink.pendingDestination) { _, _ in
            routeDeepLink()
        }
        .onChange(of: intentDispatcher.pending) { _, pending in
            routeIntent(pending)
        }
        .sheet(item: $deepLinkPresentation) { presentation in
            DeepLinkResolverView(presentation: presentation)
        }
        .onChange(of: selectedTab) { oldTab, newTab in
            // Light haptic on every tab change (fires for real tab-bar taps too,
            // which a `didSet` on the @State would miss).
            if oldTab != newTab {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
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
        .sheet(item: $askPulseLaunch) { launch in
            AskPulseView(initialQuery: launch.query)
        }
        // Surface StoreKit transaction failures as a non-blocking toast with a
        // short support reference (the transaction id) (IOS-AUDIT-FEAT-011).
        .onReceive(NotificationCenter.default.publisher(for: .storeKitTransactionFailed)) { note in
            let txId = note.userInfo?["transactionId"] as? String
            let reference = txId.map { " (ref \($0))" } ?? ""
            transactionFailureToast = .error(
                "There was a problem with your purchase. Please try again or contact support\(reference)."
            )
        }
        .toastOverlay(message: $transactionFailureToast)
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

    /// Consumes a pending deep-link destination and routes it: tab destinations
    /// switch the active tab in place; content/discover destinations present a
    /// resolver sheet (IOS-AUDIT-FEAT-002/003).
    private func routeDeepLink() {
        guard let destination = deepLink.consumeDestination() else { return }
        switch destination {
        case .event(let id): deepLinkPresentation = .event(id)
        case .restaurant(let id): deepLinkPresentation = .restaurant(id)
        case .attraction(let id): deepLinkPresentation = .attraction(id)
        case .discover(let d): deepLinkPresentation = .discover(d)
        case .tab(let tab): selectedTab = tab
        }
    }

    /// Routes a pending Siri/Shortcuts intent. Ask Pulse opens the AI chat
    /// surface here (FEAT-028); Find Restaurants/Events route to the Search tab,
    /// which reads and clears the payload once it appears (FEAT-025). The iPad
    /// sidebar stays in sync via the existing selectedTab ↔ sidebarSelection
    /// observers.
    private func routeIntent(_ pending: PulseIntentDispatcher.Pending?) {
        guard let pending else { return }
        switch pending {
        case .askPulse(let query):
            // Own this payload — consume so SearchView doesn't also see it.
            _ = intentDispatcher.consume()
            askPulseLaunch = AskPulseLaunch(query: query)
        case .findRestaurants, .findEvents:
            if selectedTab != .search { selectedTab = .search }
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

// MARK: - Deep Link Resolver (IOS-AUDIT-FEAT-002/003)

/// Resolves a deep-linked id to its model and presents the matching detail
/// screen inside a dismissable NavigationStack. Discover destinations render
/// their native surface directly. Falls back to an error+retry state if the
/// content can't be fetched (e.g. offline or deleted), never crashing.
private struct DeepLinkResolverView: View {
    let presentation: MainTabView.DeepLinkPresentation

    @Environment(\.dismiss) private var dismiss
    @State private var phase: Phase = .loading

    private enum Phase {
        case loading
        case failed
        case event(Event)
        case restaurant(Restaurant)
        case attraction(Attraction)
    }

    var body: some View {
        NavigationStack {
            content
                // Discover surfaces render with ownsNavigationStack:false and
                // push typed values, so the parent stack registers the routes.
                .navigationDestination(for: Event.self) { EventDetailView(event: $0) }
                .navigationDestination(for: Restaurant.self) { RestaurantDetailView(restaurant: $0) }
                .navigationDestination(for: Attraction.self) { AttractionDetailView(attraction: $0) }
                .navigationDestination(for: Article.self) { ArticleDetailView(article: $0) }
                .navigationDestination(for: Hotel.self) { HotelDetailView(hotel: $0) }
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Close") { dismiss() }
                    }
                }
        }
        .task { await resolve() }
    }

    @ViewBuilder
    private var content: some View {
        switch presentation {
        case .discover(let destination):
            destination.destinationView
        case .event, .restaurant, .attraction:
            switch phase {
            case .loading:
                ProgressView("Loading…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed:
                ContentUnavailableView {
                    Label("Couldn’t open this link", systemImage: "wifi.exclamationmark")
                } description: {
                    Text("The content may have moved or you’re offline.")
                } actions: {
                    Button("Try Again") { Task { await resolve() } }
                }
            case .event(let event):
                EventDetailView(event: event)
            case .restaurant(let restaurant):
                RestaurantDetailView(restaurant: restaurant)
            case .attraction(let attraction):
                AttractionDetailView(attraction: attraction)
            }
        }
    }

    private func resolve() async {
        switch presentation {
        case .discover:
            return // rendered directly
        case .event(let id):
            phase = .loading
            do { phase = .event(try await EventsService.shared.fetchEvent(id: id)) }
            catch { phase = .failed }
        case .restaurant(let id):
            phase = .loading
            do { phase = .restaurant(try await RestaurantsService.shared.fetchRestaurant(id: id)) }
            catch { phase = .failed }
        case .attraction(let id):
            phase = .loading
            do { phase = .attraction(try await AttractionsService.shared.fetchAttraction(id: id)) }
            catch { phase = .failed }
        }
    }
}

#Preview {
    MainTabView()
}
