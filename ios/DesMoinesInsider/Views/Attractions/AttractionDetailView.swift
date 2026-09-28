import SwiftUI

/// Full attraction detail view — NavigationStack destination with hero image, info, and actions.
struct AttractionDetailView: View {
    let attraction: Attraction

    @State private var showShareSheet = false
    @State private var favorites = FavoritesService.shared
    @State private var toast: ToastMessage?

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                heroImage
                infoSection
                actionButtons
                AttractionPlanVisitSection(attraction: attraction)
                descriptionSection
                ReviewsSection(contentType: "attraction", contentId: attraction.id)
            }
            .frame(maxWidth: .infinity)
        }
        .ignoresSafeArea(edges: .top)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { saveButton }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    showShareSheet = true
                } label: {
                    Image(systemName: "square.and.arrow.up")
                }
                .accessibilityLabel("Share attraction")
            }
        }
        .sheet(isPresented: $showShareSheet) {
            // The link goes as its own item so Messages and Mail show a
            // preview; without a slug there is no web page to link
            // (IOS-DD-BROWSE-11).
            ShareSheet(items: shareItems)
        }
        .toastOverlay(message: $toast)
        .task {
            // IOS-PARITY-007 — feed the Dashboard "Jump back in" rail.
            RecentlyViewedService.shared.record(
                type: "attraction", id: attraction.id, title: attraction.name, imageUrl: attraction.imageUrl
            )
            // As ArticleDetailView does (IOS-DD-PLATFORM-08).
            await SpotlightService.shared.indexAttractions([attraction])
        }
    }

    // MARK: - Hero Image

    private var heroImage: some View {
        ZStack(alignment: .bottomLeading) {
            CachedAsyncImage(url: attraction.imageUrl) {
                ZStack {
                    Rectangle()
                        .fill(Color.teal.opacity(0.15).gradient)
                    Image(systemName: attraction.attractionType.icon)
                        .font(.system(size: 64))
                        .foregroundStyle(.teal.opacity(0.3))
                        .accessibilityHidden(true)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 300, maxHeight: 300)

            LinearGradient(
                colors: [.clear, .clear, .black.opacity(0.7)],
                startPoint: .top,
                endPoint: .bottom
            )

            VStack(alignment: .leading, spacing: 6) {
                // Type badge
                HStack(spacing: 4) {
                    Image(systemName: attraction.attractionType.icon)
                        .font(.caption2)
                        .accessibilityHidden(true)
                    Text(attraction.typeLabel)
                        .appText(.caption)
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(.ultraThinMaterial, in: Capsule())

                Text(attraction.name)
                    .appText(.headline)
                    .foregroundStyle(.white)
                    .lineLimit(3)
            }
            .padding()
        }
        .clipped()
    }

    // MARK: - Info Section

    private var infoSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Rating. The Featured/Sponsored label sits outside it, so an
            // unrated featured row still says so (IOS-DD-BROWSE-11).
            HStack(spacing: 6) {
                if let rating = attraction.rating {
                    ratingStars(rating)
                }
                Spacer()
                placementLabel
            }

            Divider()

            // Location. The address when entered; directions live in the
            // action row only (IOS-DD-BROWSE-11).
            if let location = attraction.displayAddress {
                HStack(spacing: 10) {
                    Image(systemName: "mappin.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.red)
                        .frame(width: 28)
                        .accessibilityHidden(true)

                    Text(location)
                        .appText(.bodySmall)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)

                    Spacer()
                }
            }

            // Distance
            if let coord = attraction.coordinate,
               let distance = LocationService.shared.formattedDistance(from: coord) {
                HStack(spacing: 10) {
                    Image(systemName: "location.fill")
                        .font(.title3)
                        .foregroundStyle(.blue)
                        .frame(width: 28)
                    Text(distance)
                        .appText(.bodySmall)
                        .foregroundStyle(.secondary)
                }
            }

            // The website row that used to sit here was the SECOND link to
            // the same URL on this screen - actionButtons already renders a
            // prominent "Website" button. Two controls doing the same thing
            // make a reader stop and check whether they differ
            // (IOS-AUDIT-UX-057).
        }
        .padding()
    }

    // MARK: - Action Buttons

    private var actionButtons: some View {
        HStack(spacing: 12) {
            if let websiteURL = attraction.websiteURL {
                Link(destination: websiteURL) {
                    Label("Website", systemImage: "safari")
                        .appText(.bodyEmphasized)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 12))
                        .foregroundStyle(.white)
                }
                .accessibilityLabel("Visit \(attraction.name) website")
            }

            // Coordinates or the address (IOS-DD-BROWSE-11); the old button
            // needed coordinates and built its query by hand.
            if let url = attraction.directionsURL {
                Link(destination: url) {
                    Label("Directions", systemImage: "map.fill")
                        .appText(.bodyEmphasized)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.blue, in: RoundedRectangle(cornerRadius: 12))
                        .foregroundStyle(.white)
                }
                .accessibilityLabel("Get directions to \(attraction.name)")
            }
        }
        .padding(.horizontal)
    }

    // MARK: - Description

    private var descriptionSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let summary = attraction.geoSummary?.trimmingCharacters(in: .whitespacesAndNewlines), !summary.isEmpty {
                Text(summary)
                    .appText(.bodyEmphasized)
                    .padding(.bottom, 4)
            }
            if let description = attraction.description, !description.isEmpty {
                Text("About")
                    .appText(.title)

                Text(description)
                    .appText(.body)
                    .foregroundStyle(.secondary)
                    .lineSpacing(4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
    }

    // MARK: - Helpers

    // MARK: - Rating & placement

    private func ratingStars(_ rating: Double) -> some View {
        HStack(spacing: 6) {
            HStack(spacing: 2) {
                ForEach(1...5, id: \.self) { star in
                    // A half star is yellow too (IOS-DD-BROWSE-11).
                    Image(systemName: Double(star) <= rating ? "star.fill" : (Double(star) - 0.5 <= rating ? "star.leadinghalf.filled" : "star"))
                        .font(.system(size: 14))
                        .foregroundStyle(Double(star) - 0.5 <= rating ? .yellow : .gray.opacity(0.3))
                        .accessibilityHidden(true)
                }
            }
            Text(String(format: "%.1f", rating))
                .appText(.bodyEmphasized)
        }
        // Combine the star row + numeric value into one VoiceOver element
        // (IOS-AUDIT-UX-013) so it announces the rating once instead of
        // reading five individual star images.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Rating: \(String(format: "%.1f", rating)) out of 5 stars")
    }

    /// "Sponsored" for a live paid placement, else "Featured"
    /// (IOS-DD-BROWSE-09): a paid slot is never presented as an editorial pick.
    @ViewBuilder
    private var placementLabel: some View {
        if attraction.isActivelySponsored {
            Label("Sponsored", systemImage: "megaphone.fill")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.orange)
        } else if attraction.isFeatured == true {
            Label("Featured", systemImage: "star.fill")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.orange)
        }
    }

    // MARK: - Save (IOS-DD-BROWSE-11)

    private var saveButton: some View {
        let isSaved = favorites.isAttractionFavorited(attraction.id)
        return Button {
            toggleFavorite()
        } label: {
            Image(systemName: isSaved ? "heart.fill" : "heart")
                .foregroundStyle(isSaved ? Color.red : Color.primary)
        }
        .accessibilityLabel(isSaved ? "Saved" : "Save")
        .accessibilityAddTraits(isSaved ? .isSelected : [])
    }

    private func toggleFavorite() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        Task {
            do {
                let nowSaved = try await favorites.toggleFavoriteAttraction(attractionId: attraction.id)
                toast = nowSaved ? .success("Saved \(attraction.name)") : .info("Removed from saved")
            } catch let error as FavoritesService.FavoritesError {
                // The favorites cap presents the upsell paywall app-wide
                // (IOS-SUB-011); don't double up with a toast.
                if case .limitReached = error { return }
                toast = .error(error.localizedDescription)
            } catch {
                toast = .error("Couldn't update saved")
            }
        }
    }

    private var shareItems: [Any] {
        var items: [Any] = [shareText]
        if let url = attraction.shareURL { items.append(url) }
        return items
    }

    private var shareText: String {
        var text = "\(attraction.name) (\(attraction.typeLabel))"
        if let location = attraction.displayAddress {
            text += " - \(location)"
        }
        if let rating = attraction.rating {
            text += " \u{2B50} \(String(format: "%.1f", rating))"
        }
        text += "\n\nFound on Des Moines Insider"
        return text
    }
}

#Preview {
    NavigationStack {
        AttractionDetailView(attraction: .preview)
    }
}
