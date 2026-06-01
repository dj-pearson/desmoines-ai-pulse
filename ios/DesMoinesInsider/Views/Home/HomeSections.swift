import SwiftUI

/// Home feed building blocks extracted from `HomeView` (IOS-IA-001).
///
/// The Home tab is now content-first: a compact "Ways to explore" row replaces
/// the four full-width CTA cards that used to push real content below the fold,
/// and the discovery rails are rendered from a data-driven `[HomeRail]` order so
/// IOS-IA-006 can personalize the sequence without another refactor.

// MARK: - Rail model

/// The ordered, reorderable content rails on Home. The order is data-driven
/// (see `HomeRailsView.order`) so personalization (IOS-IA-006) only has to
/// supply a different array — no layout changes required.
///
/// `fromBlog` is intentionally omitted from `allCases` until the native
/// Articles hub lands (IOS-PARITY-002); adding it there will surface the rail.
enum HomeRail: String, CaseIterable, Identifiable {
    case forYou
    case featured
    case popularRestaurants
    case trendingAttractions
    case thisWeekend

    var id: String { rawValue }
}

// MARK: - Ways to explore (consolidated discovery entry points)

/// Single compact, horizontally-scrolling row that replaces the four stacked
/// full-width CTA cards (Ask Pulse, Swipe, Surprise Me, Explore Attractions).
/// Keeping these as small tiles is what lets the first real event cards reach
/// above the fold on an iPhone 13/15.
struct WaysToExploreRow: View {
    let onAskPulse: () -> Void
    let onSwipe: () -> Void
    let onSurprise: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Ways to explore")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 4)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    tile(
                        title: "Ask Pulse",
                        systemImage: "sparkles",
                        colors: [Color(red: 0.55, green: 0.36, blue: 0.96), Color(red: 0.66, green: 0.33, blue: 0.97)],
                        action: onAskPulse,
                        hint: "Describe what you're looking for and get curated picks"
                    )
                    tile(
                        title: "Swipe",
                        systemImage: "rectangle.stack.fill",
                        colors: [Color(red: 0.24, green: 0.51, blue: 0.96), Color(red: 0.02, green: 0.71, blue: 0.83)],
                        action: onSwipe,
                        hint: "Swipe through hand-picked events and dining"
                    )
                    tile(
                        title: "Surprise Me",
                        systemImage: "die.face.5.fill",
                        colors: [.purple, .indigo],
                        action: onSurprise,
                        hint: "One committed recommendation, no browsing"
                    )
                    // Discover hub + Attractions are real navigation pushes, so
                    // they're NavigationLinks resolving against HomeView's
                    // navigationDestination(for: HomeDestination.self).
                    NavigationLink(value: HomeDestination.discoverHub) {
                        tileLabel(
                            title: "Discover",
                            systemImage: "square.grid.2x2.fill",
                            colors: [Color(red: 0.31, green: 0.27, blue: 0.90), Color(red: 0.23, green: 0.51, blue: 0.96)]
                        )
                    }
                    .buttonStyle(.plain)
                    .simultaneousGesture(TapGesture().onEnded {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    })
                    .accessibilityLabel("Discover")
                    .accessibilityHint("Trip planner, guides, hotels, deals and more")

                    NavigationLink(value: HomeDestination.attractions) {
                        tileLabel(
                            title: "Attractions",
                            systemImage: "star.circle.fill",
                            colors: [Color.purple.opacity(0.85), Color.pink.opacity(0.7)]
                        )
                    }
                    .buttonStyle(.plain)
                    .simultaneousGesture(TapGesture().onEnded {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    })
                    .accessibilityLabel("Explore attractions")
                    .accessibilityHint("Museums, parks, and must-see places")
                }
                .padding(.horizontal, 4)
                .padding(.vertical, 2)
            }
        }
        .padding(.horizontal)
    }

    private func tile(
        title: String,
        systemImage: String,
        colors: [Color],
        action: @escaping () -> Void,
        hint: String
    ) -> some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            action()
        } label: {
            tileLabel(title: title, systemImage: systemImage, colors: colors)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityHint(hint)
    }

    private func tileLabel(title: String, systemImage: String, colors: [Color]) -> some View {
        VStack(spacing: 8) {
            ZStack {
                RoundedRectangle(cornerRadius: 14)
                    .fill(LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 56, height: 56)
                Image(systemName: systemImage)
                    .font(.title3)
                    .foregroundStyle(.white)
                    .accessibilityHidden(true)
            }
            Text(title)
                .font(.caption.weight(.medium))
                .foregroundStyle(.primary)
                .lineLimit(1)
        }
        .frame(width: 76)
    }
}

// MARK: - Rails container

/// Renders the data-driven content rails in `order`, with deterministic ad
/// slots interleaved between them. Each rail owns its own loading/empty state
/// so a slow source never blocks the rest of the feed.
struct HomeRailsView: View {
    let eventsVM: EventsViewModel
    let restaurantsVM: RestaurantsViewModel
    let attractionsVM: AttractionsViewModel
    let weekendVM: EventsViewModel
    let onSeeAll: (HomeRail) -> Void
    var order: [HomeRail] = HomeRail.allCases

    var body: some View {
        ForEach(Array(order.enumerated()), id: \.element.id) { index, rail in
            railView(rail)

            // Deterministic ad slots between rails. AdSlot renders nothing for
            // subscribers (ad-free). IOS-ADS-012 swaps these for native in-feed
            // ad cards; the placement indices stay stable so density is tunable.
            if index == 1 || index == 3 {
                AdSlot(.feed)
            }
        }
    }

    @ViewBuilder
    private func railView(_ rail: HomeRail) -> some View {
        switch rail {
        case .forYou:
            // ForYouRail renders its own header + refresh affordance.
            ForYouRail()

        case .featured:
            HomeEventRail(
                title: "Featured",
                systemImage: "star.fill",
                tint: .orange,
                events: eventsVM.featuredEvents,
                isLoading: eventsVM.isLoading,
                seeAll: { onSeeAll(.featured) }
            )

        case .popularRestaurants:
            HomeRestaurantRail(
                restaurants: restaurantsVM.restaurants,
                isLoading: restaurantsVM.isLoading,
                seeAll: { onSeeAll(.popularRestaurants) }
            )

        case .trendingAttractions:
            HomeAttractionRail(
                attractions: attractionsVM.attractions,
                isLoading: attractionsVM.isLoading,
                seeAll: { onSeeAll(.trendingAttractions) }
            )

        case .thisWeekend:
            HomeEventRail(
                title: "This Weekend",
                systemImage: "calendar",
                tint: .blue,
                events: weekendVM.events,
                isLoading: weekendVM.isLoading,
                seeAll: { onSeeAll(.thisWeekend) }
            )
        }
    }
}

// MARK: - Rail header

/// Shared "Title …………… See all >" header for content rails.
struct HomeRailHeader: View {
    let title: String
    let systemImage: String
    var tint: Color = .orange
    var seeAll: (() -> Void)?

    var body: some View {
        HStack {
            Label(title, systemImage: systemImage)
                .font(.headline)
                .foregroundStyle(tint)
            Spacer()
            if let seeAll {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    seeAll()
                } label: {
                    HStack(spacing: 2) {
                        Text("See all").font(.subheadline.weight(.semibold))
                        Image(systemName: "chevron.right").font(.caption2.weight(.bold))
                    }
                }
                .buttonStyle(.plain)
                .foregroundStyle(.tint)
                .accessibilityLabel("See all \(title)")
            }
        }
        .padding(.horizontal)
    }
}

// MARK: - Event rail (Featured + This Weekend)

struct HomeEventRail: View {
    let title: String
    let systemImage: String
    var tint: Color
    let events: [Event]
    let isLoading: Bool
    let seeAll: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HomeRailHeader(title: title, systemImage: systemImage, tint: tint,
                           seeAll: events.isEmpty ? nil : seeAll)

            if isLoading && events.isEmpty {
                HomeRailSkeleton(width: 260, height: 150)
            } else if events.isEmpty {
                HomeRailEmpty(message: "Nothing here right now.")
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 14) {
                        ForEach(events.prefix(10)) { event in
                            NavigationLink(value: event) {
                                FeaturedEventCard(event: event)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(event.featuredCardAccessibilityLabel)
                            .accessibilityHint("Double-tap to view event details")
                        }
                    }
                    .padding(.horizontal)
                }
            }
        }
        .padding(.vertical, 8)
    }
}

// MARK: - Restaurant rail

struct HomeRestaurantRail: View {
    let restaurants: [Restaurant]
    let isLoading: Bool
    let seeAll: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HomeRailHeader(title: "Popular Restaurants", systemImage: "fork.knife",
                           tint: .orange, seeAll: restaurants.isEmpty ? nil : seeAll)

            if isLoading && restaurants.isEmpty {
                HomeRailSkeleton(width: 180, height: 110)
            } else if restaurants.isEmpty {
                HomeRailEmpty(message: "Nothing here right now.")
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 14) {
                        ForEach(restaurants.prefix(10)) { restaurant in
                            NavigationLink(value: restaurant) {
                                CompactRestaurantCard(restaurant: restaurant)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(restaurant.compactCardAccessibilityLabel)
                            .accessibilityHint("Double-tap to view restaurant details")
                        }
                    }
                    .padding(.horizontal)
                }
            }
        }
        .padding(.vertical, 8)
    }
}

// MARK: - Attraction rail

struct HomeAttractionRail: View {
    let attractions: [Attraction]
    let isLoading: Bool
    let seeAll: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HomeRailHeader(title: "Top Attractions", systemImage: "star.circle.fill",
                           tint: .purple, seeAll: attractions.isEmpty ? nil : seeAll)

            if isLoading && attractions.isEmpty {
                HomeRailSkeleton(width: 180, height: 110)
            } else if attractions.isEmpty {
                HomeRailEmpty(message: "Nothing here right now.")
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 14) {
                        ForEach(attractions.prefix(10)) { attraction in
                            NavigationLink(value: attraction) {
                                CompactAttractionCard(attraction: attraction)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(attraction.compactCardAccessibilityLabel)
                            .accessibilityHint("Double-tap to view attraction details")
                        }
                    }
                    .padding(.horizontal)
                }
            }
        }
        .padding(.vertical, 8)
    }
}

// MARK: - Rail loading + empty states (non-collapsing)

/// Horizontal skeleton that mirrors a card rail's shape so loading never
/// collapses the layout or jumps when content arrives.
struct HomeRailSkeleton: View {
    var width: CGFloat = 200
    var height: CGFloat = 120

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 14) {
                ForEach(0..<3, id: \.self) { _ in
                    VStack(alignment: .leading, spacing: 8) {
                        Skeleton.block(height: height).frame(width: width)
                        Skeleton.bar(width: width * 0.7)
                        Skeleton.bar(width: width * 0.45, height: 12)
                    }
                    .frame(width: width)
                }
            }
            .padding(.horizontal)
        }
        .accessibilityHidden(true)
    }
}

/// Slim inline empty state that keeps the titled section visible rather than
/// collapsing it away when a rail has no items.
struct HomeRailEmpty: View {
    let message: String

    var body: some View {
        Text(message)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal)
    }
}

// MARK: - Cards (moved out of HomeView for reuse across rails)

/// Compact restaurant card for the home feed horizontal scroll.
struct CompactRestaurantCard: View {
    let restaurant: Restaurant

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            CachedAsyncImage(url: restaurant.imageUrl) {
                ZStack {
                    Rectangle().fill(Color.orange.opacity(0.15).gradient)
                    Image(systemName: "fork.knife")
                        .font(.title2)
                        .foregroundStyle(.orange.opacity(0.3))
                }
            }
            .frame(width: 180, height: 110)
            .clipShape(RoundedRectangle(cornerRadius: 12))

            Text(restaurant.name)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)

            HStack(spacing: 6) {
                if let cuisine = restaurant.cuisine {
                    Text(cuisine)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let price = restaurant.priceRange {
                    Text(price)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.green)
                }

                Spacer()

                if let rating = restaurant.rating {
                    HStack(spacing: 2) {
                        Image(systemName: "star.fill")
                            .font(.caption2)
                            .foregroundStyle(.yellow)
                        Text(String(format: "%.1f", rating))
                            .font(.caption2.weight(.medium))
                    }
                }
            }
        }
        .frame(width: 180)
        // Suppress redundant child reads — full label set on the link wrapper.
        .accessibilityElement(children: .ignore)
        .accessibilityHidden(true)
    }
}

/// Compact attraction card for the home feed horizontal scroll. Mirrors
/// `CompactRestaurantCard` so the two rails read consistently.
struct CompactAttractionCard: View {
    let attraction: Attraction

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            CachedAsyncImage(url: attraction.imageUrl) {
                ZStack {
                    Rectangle().fill(Color.purple.opacity(0.15).gradient)
                    Image(systemName: attraction.attractionType.icon)
                        .font(.title2)
                        .foregroundStyle(.purple.opacity(0.3))
                }
            }
            .frame(width: 180, height: 110)
            .clipShape(RoundedRectangle(cornerRadius: 12))

            Text(attraction.name)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)

            HStack(spacing: 6) {
                Text(attraction.attractionType.displayName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                Spacer()

                if let rating = attraction.rating {
                    HStack(spacing: 2) {
                        Image(systemName: "star.fill")
                            .font(.caption2)
                            .foregroundStyle(.yellow)
                        Text(String(format: "%.1f", rating))
                            .font(.caption2.weight(.medium))
                    }
                }
            }
        }
        .frame(width: 180)
        .accessibilityElement(children: .ignore)
        .accessibilityHidden(true)
    }
}

/// Featured event card for the home feed horizontal scroll.
struct FeaturedEventCard: View {
    let event: Event

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Image with scrim for legibility
            ZStack(alignment: .bottomLeading) {
                CachedAsyncImage(url: event.imageUrl) {
                    Rectangle()
                        .fill(event.eventCategory.color.gradient)
                }
                .frame(width: 260, height: 150)
                .overlay(PremiumTokens.imageScrim)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .glassCard(cornerRadius: 14, material: .regularMaterial, elevation: PremiumTokens.elevation4)

                // Category badge
                CategoryBadge(category: event.eventCategory)
                    .padding(10)
            }

            // Title
            Text(event.title)
                .font(.subheadline.weight(.semibold))
                .lineLimit(2)
                .multilineTextAlignment(.leading)

            // Date & Location
            HStack(spacing: 4) {
                if let date = event.parsedDate {
                    Image(systemName: "calendar")
                        .font(.caption2)
                    Text(date.formatted(.dateTime.month(.abbreviated).day()))
                        .font(.caption)
                }

                Spacer()

                if event.isFree {
                    // Uses icon + text so colour alone is not the only differentiator
                    Label("FREE", systemImage: "ticket")
                        .font(.caption2.bold())
                        .foregroundStyle(.green)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.green.opacity(0.15), in: Capsule())
                }
            }
            .foregroundStyle(.secondary)
        }
        .frame(width: 260)
        // Suppress redundant child reads — full label set on the link wrapper.
        .accessibilityElement(children: .ignore)
        .accessibilityHidden(true)
    }
}

/// Event card skeleton matching `EventCardView` layout, used by the main
/// events list while loading.
struct EventCardSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Image area with overlays
            ZStack(alignment: .topTrailing) {
                RoundedRectangle(cornerRadius: 0)
                    .fill(Color(.systemGray5))
                    .frame(height: 180)

                VStack(alignment: .trailing, spacing: 6) {
                    // Favorite button placeholder
                    Circle()
                        .fill(Color(.systemGray4))
                        .frame(width: 36, height: 36)

                    Spacer()

                    // Date badge placeholder
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color(.systemGray4))
                        .frame(width: 48, height: 52)
                }
                .padding(10)

                // Category badge placeholder
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color(.systemGray4))
                    .frame(width: 70, height: 22)
                    .position(x: 60, y: 14)
            }

            // Content area
            VStack(alignment: .leading, spacing: 8) {
                // Title
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(.systemGray5))
                    .frame(height: 18)
                    .padding(.trailing, 40)

                // Time row
                HStack(spacing: 6) {
                    Circle()
                        .fill(Color(.systemGray6))
                        .frame(width: 12, height: 12)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemGray6))
                        .frame(width: 160, height: 12)
                }

                // Location row
                HStack(spacing: 6) {
                    Circle()
                        .fill(Color(.systemGray6))
                        .frame(width: 12, height: 12)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemGray6))
                        .frame(width: 120, height: 12)
                }

                // Price badge
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color(.systemGray6))
                    .frame(width: 60, height: 22)
            }
            .padding(14)
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.08), radius: 8, x: 0, y: 2)
        .redacted(reason: .placeholder)
        .shimmer()
    }
}

#Preview {
    NavigationStack {
        ScrollView {
            VStack(spacing: 0) {
                WaysToExploreRow(onAskPulse: {}, onSwipe: {}, onSurprise: {})
                HomeRailSkeleton()
            }
        }
    }
}
