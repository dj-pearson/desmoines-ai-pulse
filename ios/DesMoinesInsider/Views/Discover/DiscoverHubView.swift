import SwiftUI

/// The "Discover" hub (IOS-IA-002) — the single home for the breadth of
/// content surfaces the web product has, without overflowing the 6-item iPhone
/// tab bar.
///
/// IA decision (recorded here as the source of truth):
/// - The primary tab bar stays lean and unchanged: Home, Dining, Search, Map,
///   Saved, Profile. We deliberately did NOT drop Search or Map for a Discover
///   tab — both are high-use, and Apple's HIG caps comfortable iPhone tabs at
///   ~5. Instead, Discover is reached from Home (the "Explore" tile in
///   WaysToExploreRow pushes here) and is a top-level item in the iPad sidebar.
/// - Every parity feature gets a tile here. Features that also deserve presence
///   elsewhere (Trip Planner as a Home entry, Weekend as a Home rail) are
///   cross-linked, not duplicated in implementation.
/// - Destinations that don't have native screens yet route to ComingSoonView
///   with a web fallback, so nothing is unreachable while the IOS-PARITY-*
///   stories land.
struct DiscoverHubView: View {
    /// When true the hub renders its own NavigationStack (used as an iPad
    /// sidebar destination / standalone). When false it assumes an ambient
    /// NavigationStack supplied by the presenter (e.g. pushed from Home).
    var ownsNavigationStack: Bool = true

    /// Optional surface to open directly on appear (deep links, IOS-AUDIT-FEAT-005).
    /// Only honored when this view owns its NavigationStack.
    var initialDestination: DiscoverDestination? = nil

    @State private var path = NavigationPath()

    var body: some View {
        if ownsNavigationStack {
            NavigationStack(path: $path) {
                content
            }
            .task {
                if let initialDestination, path.isEmpty {
                    path.append(initialDestination)
                }
            }
        } else {
            content
        }
    }

    private var content: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 14),
                                GridItem(.flexible(), spacing: 14)],
                      spacing: 14) {
                ForEach(DiscoverDestination.allCases) { dest in
                    NavigationLink(value: dest) {
                        DiscoverTile(destination: dest)
                    }
                    .buttonStyle(.plain)
                    .simultaneousGesture(TapGesture().onEnded {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    })
                }
            }
            .padding(16)
        }
        .navigationTitle("Discover")
        .navigationDestination(for: DiscoverDestination.self) { dest in
            dest.destinationView
        }
        // Content-type destinations so tiles that lead into list screens (and
        // any links inside ComingSoon web sheets) resolve within this stack.
        .navigationDestination(for: Event.self) { EventDetailView(event: $0) }
        .navigationDestination(for: Restaurant.self) { RestaurantDetailView(restaurant: $0) }
        .navigationDestination(for: Attraction.self) { AttractionDetailView(attraction: $0) }
    }
}

// MARK: - Destinations

/// Every parity surface reachable from the Discover hub. The `destinationView`
/// for each is currently a ComingSoonView placeholder; the corresponding
/// IOS-PARITY-* story swaps in the real native screen.
enum DiscoverDestination: String, CaseIterable, Identifiable {
    case tripPlanner
    case articles
    case stay
    case weekend
    case bestOf
    case music
    case sports
    case outdoors
    case neighborhoods
    case deals

    var id: String { rawValue }

    var title: String {
        switch self {
        case .tripPlanner:   return "Trip Planner"
        case .articles:      return "Articles & Guides"
        case .stay:          return "Where to Stay"
        case .weekend:       return "This Weekend"
        case .bestOf:        return "Best Of"
        case .music:         return "Music"
        case .sports:        return "Sports"
        case .outdoors:      return "Outdoors"
        case .neighborhoods: return "Neighborhoods"
        case .deals:         return "Deals"
        }
    }

    var subtitle: String {
        switch self {
        case .tripPlanner:   return "AI itinerary, built for you"
        case .articles:      return "Local guides & stories"
        case .stay:          return "Hotels & places to stay"
        case .weekend:       return "Plans for Fri–Sun"
        case .bestOf:        return "Vote & see winners"
        case .music:         return "Concerts & live shows"
        case .sports:        return "Games & venues"
        case .outdoors:      return "Parks, trails & nature"
        case .neighborhoods: return "Explore by area"
        case .deals:         return "Local deals & happy hours"
        }
    }

    var systemImage: String {
        switch self {
        case .tripPlanner:   return "map.fill"
        case .articles:      return "doc.richtext"
        case .stay:          return "bed.double.fill"
        case .weekend:       return "calendar"
        case .bestOf:        return "trophy.fill"
        case .music:         return "music.note"
        case .sports:        return "sportscourt.fill"
        case .outdoors:      return "leaf.fill"
        case .neighborhoods: return "building.2.fill"
        case .deals:         return "tag.fill"
        }
    }

    var gradient: [Color] {
        switch self {
        case .tripPlanner:   return [Color(red: 0.31, green: 0.27, blue: 0.90), Color(red: 0.23, green: 0.51, blue: 0.96)]
        case .articles:      return [Color(red: 0.24, green: 0.51, blue: 0.96), Color(red: 0.02, green: 0.71, blue: 0.83)]
        case .stay:          return [Color(red: 0.55, green: 0.36, blue: 0.96), Color(red: 0.66, green: 0.33, blue: 0.97)]
        case .weekend:       return [Color(red: 0.98, green: 0.75, blue: 0.14), Color(red: 0.96, green: 0.55, blue: 0.11)]
        case .bestOf:        return [Color(red: 0.95, green: 0.27, blue: 0.45), Color(red: 0.86, green: 0.14, blue: 0.47)]
        case .music:         return [Color(red: 0.55, green: 0.36, blue: 0.96), Color(red: 0.66, green: 0.33, blue: 0.97)]
        case .sports:        return [Color(red: 0.06, green: 0.72, blue: 0.51), Color(red: 0.08, green: 0.57, blue: 0.47)]
        case .outdoors:      return [Color(red: 0.13, green: 0.77, blue: 0.37), Color(red: 0.09, green: 0.64, blue: 0.29)]
        case .neighborhoods: return [Color(red: 1.00, green: 0.60, blue: 0.18), Color(red: 0.94, green: 0.27, blue: 0.27)]
        case .deals:         return [Color(red: 0.95, green: 0.27, blue: 0.45), Color(red: 0.86, green: 0.14, blue: 0.47)]
        }
    }

    /// URL/deep-link slug for this destination. Stable route identifier used by
    /// both the web fallback path and DeepLinkHandler (IOS-IA-002).
    var slug: String {
        switch self {
        case .tripPlanner:   return "trip-planner"
        case .articles:      return "articles"
        case .stay:          return "stay"
        case .weekend:       return "weekend"
        case .bestOf:        return "best-of"
        case .music:         return "music"
        case .sports:        return "sports"
        case .outdoors:      return "outdoors"
        case .neighborhoods: return "neighborhoods"
        case .deals:         return "deals"
        }
    }

    init?(slug: String) {
        guard let match = Self.allCases.first(where: { $0.slug == slug }) else { return nil }
        self = match
    }

    /// Web fallback so the content is reachable today via ComingSoonView,
    /// before the native screen exists.
    var webURL: URL? {
        URL(string: "https://desmoinesinsider.com/\(slug)")
    }

    @ViewBuilder
    var destinationView: some View {
        // Each IOS-PARITY-* story replaces its case here with the native screen.
        ComingSoonView(title: title, systemImage: systemImage, webURL: webURL)
    }
}

// MARK: - Tile

private struct DiscoverTile: View {
    let destination: DiscoverDestination

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 12)
                    .fill(LinearGradient(colors: destination.gradient,
                                         startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 48, height: 48)
                Image(systemName: destination.systemImage)
                    .font(.title3)
                    .foregroundStyle(.white)
                    .accessibilityHidden(true)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(destination.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Text(destination.subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 120, alignment: .leading)
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(Color(.separator).opacity(0.4), lineWidth: 0.5)
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(destination.title). \(destination.subtitle)")
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("Opens \(destination.title)")
    }
}

#Preview {
    DiscoverHubView()
}
