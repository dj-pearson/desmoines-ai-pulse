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

#Preview {
    MainTabView()
}
