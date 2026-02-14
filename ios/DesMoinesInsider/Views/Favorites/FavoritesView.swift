import SwiftUI

/// Shows the user's saved/favorited events.
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
                } else if viewModel.favoriteEvents.isEmpty {
                    EmptyStateView(
                        icon: "heart",
                        title: "No Saved Events",
                        message: "Events you save will appear here. Tap the heart icon on any event to save it.",
                        actionTitle: nil,
                        action: nil
                    )
                } else {
                    eventsList
                }
            }
            .navigationTitle("Saved")
            .refreshable {
                await viewModel.refresh()
            }
            .navigationDestination(for: Event.self) { event in
                EventDetailView(event: event)
            }
            .task {
                await viewModel.loadFavorites()
            }
        }
    }

    // MARK: - Events List

    private var eventsList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                HStack {
                    Text("\(viewModel.favoriteCount) saved event\(viewModel.favoriteCount == 1 ? "" : "s")")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Spacer()
                }
                .padding(.horizontal)

                ForEach(viewModel.favoriteEvents) { event in
                    Button {
                        navigationPath.append(event)
                    } label: {
                        FavoriteEventRow(event: event) {
                            Task { await viewModel.removeFavorite(eventId: event.id) }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)
        }
    }

    // MARK: - Sign In Prompt

    private var signInPrompt: some View {
        VStack(spacing: 20) {
            Image(systemName: "heart.circle")
                .font(.system(size: 64))
                .foregroundStyle(.accent.opacity(0.6))

            Text("Sign In to Save Events")
                .font(.title3.bold())

            Text("Create an account to save your favorite events and access them from any device.")
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
        }
    }

    // MARK: - Loading

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
            Text("Loading saved events...")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - Favorite Event Row

private struct FavoriteEventRow: View {
    let event: Event
    let onRemove: () -> Void

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

            VStack(alignment: .leading, spacing: 4) {
                Text(event.title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(2)

                if let date = event.parsedDate {
                    Label(date.formatted(.dateTime.month(.abbreviated).day().hour().minute()), systemImage: "calendar")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Label(event.displayLocation, systemImage: "mappin")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
            }

            Spacer()

            Button {
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                withAnimation { onRemove() }
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
