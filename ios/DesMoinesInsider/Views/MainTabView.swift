import SwiftUI

/// Root tab navigation. 5 tabs: Home, Search, Map, Favorites, Profile.
struct MainTabView: View {
    @State private var selectedTab = Tab.home

    enum Tab: String, CaseIterable {
        case home, search, map, favorites, profile

        var title: String {
            switch self {
            case .home: return "Home"
            case .search: return "Search"
            case .map: return "Map"
            case .favorites: return "Saved"
            case .profile: return "Profile"
            }
        }

        var icon: String {
            switch self {
            case .home: return "house.fill"
            case .search: return "magnifyingglass"
            case .map: return "map.fill"
            case .favorites: return "heart.fill"
            case .profile: return "person.fill"
            }
        }
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            HomeView()
                .tabItem {
                    Label(Tab.home.title, systemImage: Tab.home.icon)
                }
                .tag(Tab.home)

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
        .tint(Color.accentColor)
    }
}

#Preview {
    MainTabView()
}
