import SwiftUI

/// Shows the user's saved/favorited events and restaurants with sections.
struct FavoritesView: View {
    @State private var viewModel = FavoritesViewModel()
    @State private var navigationPath = NavigationPath()

    var body: some View {
        NavigationStack(path: $navigationPath) {
            Group {
                if !viewModel.isAuthenticated {
                    signInPrompt
                } else if viewModel.isLoading {
                    loadingView
                } else if !viewModel.hasAnyFavorites && !NetworkMonitor.shared.isConnected {
                    EmptyStateView(
                        icon: "wifi.slash",
                        title: "You're Offline",
                        message: "Your saved items couldn't be loaded. Check your internet connection and try again.",
                        actionTitle: "Retry",
                        action: { Task { await viewModel.refresh() } }
                    )
                } else if !viewModel.hasAnyFavorites {
                    EmptyStateView(
                        icon: "heart",
                        title: "No Saved Items",
                        message: "Events and restaurants you save will appear here. Tap the heart icon on any item to save it.",
                        actionTitle: nil,
                        action: nil
                    )
                } else {
                    savedContent
                }
            }
            .navigationTitle("Saved")
            .refreshable {
                await viewModel.refresh()
            }
            .navigationDestination(for: Event.self) { event in
                EventDetailView(event: event)
            }
            .navigationDestination(for: Restaurant.self) { restaurant in
                RestaurantDetailView(restaurant: restaurant)
            }
            .task {
                await viewModel.loadFavorites()
            }
        }
    }

    // MARK: - Saved Content (Sections)

    private var savedContent: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Header count
                HStack {
                    Text("\(viewModel.totalFavoriteCount) saved item\(viewModel.totalFavoriteCount == 1 ? "" : "s")")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Spacer()
                }
                .padding(.horizontal)

                // Upcoming Events Section
                if !viewModel.upcomingEvents.isEmpty {
                    savedSection(
                        title: "Upcoming Events",
                        icon: "calendar",
                        count: viewModel.upcomingEvents.count
                    ) {
                        ForEach(viewModel.upcomingEvents) { event in
                            Button {
                                navigationPath.append(event)
                            } label: {
                                FavoriteEventRow(event: event, isPast: false) {
                                    Task { await viewModel.removeEventFavorite(eventId: event.id) }
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                // Restaurants Section
                if !viewModel.favoriteRestaurants.isEmpty {
                    savedSection(
                        title: "Restaurants",
                        icon: "fork.knife",
                        count: viewModel.favoriteRestaurants.count
                    ) {
                        ForEach(viewModel.favoriteRestaurants) { restaurant in
                            Button {
                                navigationPath.append(restaurant)
                            } label: {
                                FavoriteRestaurantRow(restaurant: restaurant) {
                                    Task { await viewModel.removeRestaurantFavorite(restaurantId: restaurant.id) }
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                // Past Events Section
                if !viewModel.pastEvents.isEmpty {
                    savedSection(
                        title: "Past Events",
                        icon: "clock.arrow.circlepath",
                        count: viewModel.pastEvents.count
                    ) {
                        ForEach(viewModel.pastEvents) { event in
                            Button {
                                navigationPath.append(event)
                            } label: {
                                FavoriteEventRow(event: event, isPast: true) {
                                    Task { await viewModel.removeEventFavorite(eventId: event.id) }
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(.vertical)
        }
    }

    // MARK: - Section Builder

    private func savedSection<Content: View>(
        title: String,
        icon: String,
        count: Int,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.accentColor)
                Text(title)
                    .font(.subheadline.weight(.semibold))
                Text("(\(count))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
            }
            .padding(.horizontal)

            LazyVStack(spacing: 10) {
                content()
            }
            .padding(.horizontal)
        }
    }

    // MARK: - Sign In Prompt

    private var signInPrompt: some View {
        VStack(spacing: 20) {
            Spacer()

            Image(systemName: "heart.circle")
                .font(.system(size: 64))
                .foregroundStyle(Color.accentColor.opacity(0.6))
                .accessibilityHidden(true)

            Text("Sign In to Save Items")
                .font(.title3.bold())

            Text("Create an account to save your favorite events and restaurants, and access them from any device.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            NavigationLink {
                AuthView()
            } label: {
                Text("Sign In")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 12))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 40)
            }

            Spacer()
        }
        .accessibilityElement(children: .contain)
    }

    // MARK: - Loading

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
            Text("Loading saved items...")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - Favorite Event Row

private struct FavoriteEventRow: View {
    let event: Event
    let isPast: Bool
    let onRemove: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: 14) {
            CachedAsyncImage(url: event.imageUrl) {
                ZStack {
                    Rectangle().fill(event.eventCategory.color.opacity(0.15))
                    Image(systemName: event.eventCategory.icon)
                        .foregroundStyle(event.eventCategory.color.opacity(0.4))
                }
            }
            .frame(width: 80, height: 80)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .opacity(isPast ? 0.6 : 1.0)

            VStack(alignment: .leading, spacing: 4) {
                Text(event.title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(2)
                    .foregroundStyle(isPast ? .secondary : .primary)

                if let date = event.parsedDate {
                    Label(date.formatted(.dateTime.month(.abbreviated).day().hour().minute()), systemImage: "calendar")
                        .font(.caption)
                        .foregroundStyle(isPast ? .tertiary : .secondary)
                }

                Label(event.displayLocation, systemImage: "mappin")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)

                if isPast {
                    Text("Past event")
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.orange)
                }
            }

            Spacer()

            Button {
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                if reduceMotion { onRemove() } else { withAnimation { onRemove() } }
            } label: {
                Image(systemName: "heart.fill")
                    .foregroundStyle(.red)
                    .font(.title3)
            }
            .accessibilityLabel("Remove from saved")
        }
        .padding(10)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.05), radius: 4, x: 0, y: 2)
    }
}

// MARK: - Favorite Restaurant Row

private struct FavoriteRestaurantRow: View {
    let restaurant: Restaurant
    let onRemove: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: 14) {
            CachedAsyncImage(url: restaurant.imageUrl) {
                ZStack {
                    Rectangle().fill(Color.orange.opacity(0.1))
                    Image(systemName: "fork.knife")
                        .foregroundStyle(.orange.opacity(0.4))
                }
            }
            .frame(width: 80, height: 80)
            .clipShape(RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 4) {
                Text(restaurant.name)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(2)

                if let cuisine = restaurant.cuisine {
                    HStack(spacing: 6) {
                        Text(cuisine)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if let price = restaurant.priceRange {
                            Text(price)
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.green)
                        }
                    }
                }

                if let rating = restaurant.rating {
                    HStack(spacing: 3) {
                        Image(systemName: "star.fill")
                            .font(.system(size: 10))
                            .foregroundStyle(.yellow)
                        Text(String(format: "%.1f", rating))
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(.secondary)
                    }
                }

                if !restaurant.displayLocation.isEmpty {
                    Label(restaurant.displayLocation, systemImage: "mappin")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                }
            }

            Spacer()

            Button {
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                if reduceMotion { onRemove() } else { withAnimation { onRemove() } }
            } label: {
                Image(systemName: "heart.fill")
                    .foregroundStyle(.red)
                    .font(.title3)
            }
            .accessibilityLabel("Remove from saved")
        }
        .padding(10)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.05), radius: 4, x: 0, y: 2)
    }
}

#Preview {
    FavoritesView()
}
