import SwiftUI

/// Full restaurant detail view — NavigationStack destination with hero image, info, and actions.
struct RestaurantDetailView: View {
    /// Starts on the row the list passed and swaps in the full row once
    /// fetched (IOS-DD-RESTAURANTS-09).
    @State private var viewModel: RestaurantDetailViewModel

    @State private var showShareSheet = false
    @State private var showImageViewer = false
    @State private var toast: ToastMessage?
    @State private var favorites = FavoritesService.shared
    @State private var auth = AuthService.shared

    init(restaurant: Restaurant) {
        _viewModel = State(wrappedValue: RestaurantDetailViewModel(restaurant: restaurant))
    }

    private var restaurant: Restaurant { viewModel.restaurant }

    private var isFavorited: Bool { favorites.isRestaurantFavorited(restaurant.id) }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                RestaurantDetailHeader(restaurant: restaurant, showImageViewer: $showImageViewer)

                // Closed / opening-soon status up front (IOS-DD-RESTAURANTS-06),
                // then the actions, which used to sit below the whole About
                // text (IOS-DD-RESTAURANTS-10).
                statusBanner
                RestaurantDetailActions(restaurant: restaurant, onDirections: openInMaps)
                RestaurantDetailInfo(restaurant: restaurant)
                RestaurantDetailHours(restaurant: restaurant)
                RestaurantLocalGuide(restaurant: restaurant)

                // "Promote this listing" advertiser funnel (IOS-ADS-016) — admin/
                // owner-only, opens web campaign checkout in Safari (not StoreKit).
                if auth.isAdmin {
                    PromoteListingButton(
                        listing: .restaurant(id: restaurant.id, name: restaurant.name),
                        style: .inline
                    )
                    .padding(.horizontal)
                }

                // Keyed on the id: a merge can swap in a different row.
                ReviewsSection(contentType: "restaurant", contentId: restaurant.id)
                    .id(restaurant.id)

                AdSlot(.feed)
            }
            .frame(maxWidth: .infinity)
        }
        .ignoresSafeArea(edges: .top)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                HStack(spacing: 12) {
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        showShareSheet = true
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                            .padding(6)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    .accessibilityLabel("Share restaurant")

                    Button {
                        Task { await toggleFavorite() }
                    } label: {
                        Image(systemName: isFavorited ? "heart.fill" : "heart")
                            .foregroundStyle(isFavorited ? .red : .primary)
                            .padding(6)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    .accessibilityLabel(isFavorited ? "Remove from saved" : "Save restaurant")
                    .accessibilityValue(isFavorited ? "Saved" : "Not saved")
                    .accessibilityAddTraits(isFavorited ? .isSelected : [])
                }
            }
        }
        .sheet(isPresented: $showShareSheet) {
            // Text plus the page link as its own item, so Messages builds a
            // rich preview (IOS-DD-RESTAURANTS-09).
            ShareSheet(items: [viewModel.shareText, viewModel.shareURL])
        }
        .fullScreenCover(isPresented: $showImageViewer) {
            FullScreenImageViewer(
                imageUrl: restaurant.imageUrl,
                isPresented: $showImageViewer,
                accessibilityDescription: "Photo of \(restaurant.name)",
            )
        }
        .task {
            // IOS-PARITY-007 — feed the Dashboard "Jump back in" rail.
            RecentlyViewedService.shared.record(
                type: "restaurant", id: restaurant.id, title: restaurant.name, imageUrl: restaurant.imageUrl
            )
            await viewModel.load()
        }
        .toastOverlay(message: $toast)
    }

    // MARK: - Status banner (IOS-DD-RESTAURANTS-06)

    @ViewBuilder
    private var statusBanner: some View {
        switch restaurant.lifecycle {
        case .closedPermanently:
            banner("Permanently closed", icon: "xmark.octagon.fill", tint: .red)
        case .closedTemporarily:
            banner("Temporarily closed", icon: "pause.circle.fill", tint: .orange)
        case .openingSoon:
            banner(restaurant.openingLabel ?? "Opening soon", icon: "calendar", tint: .orange)
        case .open, .newlyOpened:
            EmptyView()
        }
    }

    private func banner(_ text: String, icon: String, tint: Color) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(tint)
                .accessibilityHidden(true)
            // The tint marks the icon only; the text stays .primary for contrast.
            Text(text)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
        .padding(.top, 12)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Helpers

    /// Save or unsave and say what happened (the EventDetailView pattern).
    private func toggleFavorite() async {
        let outcome = await viewModel.toggleFavorite()
        switch outcome {
        case .success(let nowSaved):
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            toast = nowSaved
                ? ToastMessage.success("Saved!", icon: "heart.fill")
                : ToastMessage.info("Removed from saved", icon: "heart")
        case .failure(let error):
            // The favorites cap shows the upsell paywall app-wide (IOS-SUB-011).
            if FavoritesService.isLimitReached(error) { return }
            if let favoritesError = error as? FavoritesService.FavoritesError,
               case .notAuthenticated = favoritesError {
                toast = .info("Sign in to save restaurants", icon: "person.crop.circle")
            } else {
                toast = .error(error.localizedDescription, icon: "exclamationmark.triangle")
            }
        }
    }

    /// Apple Maps app when it can open, else the https link. Built by
    /// Restaurant.directionsURL, which escapes the name and falls back to the
    /// address when there are no coordinates (IOS-DD-RESTAURANTS-10).
    private func openInMaps() {
        let address = restaurant.displayLocation
        if let appURL = Restaurant.directionsURL(name: restaurant.name, coordinate: restaurant.coordinate, address: address, base: "maps://"),
           UIApplication.shared.canOpenURL(appURL) {
            UIApplication.shared.open(appURL)
        } else if let webURL = restaurant.directionsURL {
            UIApplication.shared.open(webURL)
        }
    }
}

#Preview {
    NavigationStack {
        RestaurantDetailView(restaurant: .preview)
    }
}
