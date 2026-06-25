import SwiftUI

/// Full attraction detail view — NavigationStack destination with hero image, info, and actions.
struct AttractionDetailView: View {
    let attraction: Attraction

    @State private var showShareSheet = false

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                heroImage
                infoSection
                actionButtons
                descriptionSection
                ReviewsSection(contentType: "attraction", contentId: attraction.id)
            }
            .frame(maxWidth: .infinity)
        }
        .ignoresSafeArea(edges: .top)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
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
            ShareSheet(items: [shareText])
        }
        .task {
            // IOS-PARITY-007 — feed the Dashboard "Jump back in" rail.
            RecentlyViewedService.shared.record(
                type: "attraction", id: attraction.id, title: attraction.name, imageUrl: attraction.imageUrl
            )
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
                    Text(attraction.type)
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
            // Rating
            if let rating = attraction.rating {
                HStack(spacing: 6) {
                    HStack(spacing: 2) {
                        ForEach(1...5, id: \.self) { star in
                            Image(systemName: Double(star) <= rating ? "star.fill" : (Double(star) - 0.5 <= rating ? "star.leadinghalf.filled" : "star"))
                                .font(.system(size: 14))
                                .foregroundStyle(Double(star) <= rating ? .yellow : .gray.opacity(0.3))
                                .accessibilityHidden(true)
                        }
                    }
                    Text(String(format: "%.1f", rating))
                        .appText(.bodyEmphasized)

                    Spacer()

                    if attraction.isFeatured == true {
                        Label("Featured", systemImage: "star.fill")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.orange)
                    }
                }
                // Combine the star row + numeric value into one VoiceOver element
                // (IOS-AUDIT-UX-013) so it announces the rating once instead of
                // reading five individual star images.
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(
                    "Rating: \(String(format: "%.1f", rating)) out of 5 stars"
                    + (attraction.isFeatured == true ? ". Featured" : "")
                )
            }

            Divider()

            // Location
            if let location = attraction.location, !location.isEmpty {
                HStack(spacing: 10) {
                    Image(systemName: "mappin.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.red)
                        .frame(width: 28)

                    Text(location)
                        .appText(.bodySmall)
                        .foregroundStyle(.secondary)

                    Spacer()

                    if attraction.coordinate != nil {
                        Button {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            openInMaps()
                        } label: {
                            Image(systemName: "arrow.triangle.turn.up.right.circle.fill")
                                .font(.title2)
                                .foregroundStyle(.blue)
                        }
                        .accessibilityLabel("Get directions")
                    }
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

            // Website
            if let url = attraction.websiteURL {
                Divider()
                HStack(spacing: 10) {
                    Image(systemName: "safari")
                        .font(.title3)
                        .foregroundStyle(Color.accentColor)
                        .frame(width: 28)

                    Link("Visit Website", destination: url)
                        .appText(.bodySmall)
                }
            }
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

            if attraction.coordinate != nil {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    openInMaps()
                } label: {
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

    private func openInMaps() {
        guard let coord = attraction.coordinate else { return }
        let name = attraction.name.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        let query = "daddr=\(coord.latitude),\(coord.longitude)&q=\(name)"
        // Prefer the Apple Maps app, but fall back to the universal https link so
        // we never force-unwrap and never silently no-op if Maps is unavailable.
        if let appURL = URL(string: "maps://?\(query)"), UIApplication.shared.canOpenURL(appURL) {
            UIApplication.shared.open(appURL)
        } else if let webURL = URL(string: "https://maps.apple.com/?\(query)") {
            UIApplication.shared.open(webURL)
        }
    }

    private var shareText: String {
        var text = "\(attraction.name) (\(attraction.type))"
        if let location = attraction.location {
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
