import SwiftUI
import MapKit

/// Native hotel detail (IOS-PARITY-003): photo gallery, star/price/area,
/// amenities, map, description, and the affiliate "Book" CTA that opens the
/// partner in an in-app Safari sheet (revenue, outside Apple IAP).
struct HotelDetailView: View {
    let hotel: Hotel

    @State private var bookTarget: AdTarget?
    @State private var showShareSheet = false
    @State private var showImageViewer = false
    @State private var selectedImageURL: String?

    private var gallery: [String] { hotel.galleryImageURLs }

    var body: some View {
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 18) {
                galleryHeader
                VStack(alignment: .leading, spacing: 18) {
                    titleBlock
                    bookButton
                    if !hotel.amenitiesList.isEmpty { amenitiesSection }
                    if hotel.coordinate != nil { mapSection }
                    if let description = hotel.description, !description.isEmpty {
                        descriptionSection(description)
                    }
                    // Free-tier ad slot (IOS-ADS-010/012) — renders nothing for subscribers.
                    AdSlot(.detail)
                }
                .padding(.horizontal)
            }
            .padding(.bottom, 32)
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    showShareSheet = true
                } label: {
                    Image(systemName: "square.and.arrow.up")
                }
                .accessibilityLabel("Share hotel")
            }
        }
        .sheet(isPresented: $showShareSheet) {
            ShareSheet(items: [shareText, hotel.webURL])
        }
        .sheet(item: $bookTarget) { target in
            SafariView(url: target.url).ignoresSafeArea()
        }
        .fullScreenCover(isPresented: $showImageViewer) {
            FullScreenImageViewer(imageUrl: selectedImageURL, isPresented: $showImageViewer)
        }
        .task {
            RecentlyViewedService.shared.record(
                type: "hotel", id: hotel.id, title: hotel.name, imageUrl: hotel.imageUrl
            )
            await SpotlightService.shared.indexHotels([hotel])
        }
    }

    // MARK: - Gallery

    @ViewBuilder
    private var galleryHeader: some View {
        if gallery.isEmpty {
            ZStack {
                Rectangle().fill(Color.purple.opacity(0.12))
                Image(systemName: "bed.double.fill")
                    .font(.system(size: 56))
                    .foregroundStyle(.purple.opacity(0.3))
            }
            .frame(maxWidth: .infinity, minHeight: 260, maxHeight: 260)
            .accessibilityHidden(true)
        } else {
            TabView {
                ForEach(gallery, id: \.self) { url in
                    Button {
                        selectedImageURL = url
                        showImageViewer = true
                    } label: {
                        CachedAsyncImage(url: url) {
                            Rectangle().fill(Color.purple.opacity(0.12))
                        }
                        .frame(maxWidth: .infinity, minHeight: 280, maxHeight: 280)
                        .clipped()
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Photo of \(hotel.name). Tap to view full screen.")
                }
            }
            .frame(height: 280)
            .tabViewStyle(.page)
            .indexViewStyle(.page(backgroundDisplayMode: .always))
        }
    }

    // MARK: - Title block

    private var titleBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            if hotel.isFeatured == true {
                Label("Featured stay", systemImage: "sparkles")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
            }

            Text(hotel.name)
                .font(.title.bold())
                .frame(maxWidth: .infinity, alignment: .leading)

            HStack(spacing: 12) {
                if let starText = hotel.starText {
                    Label(starText, systemImage: "star.fill")
                        .foregroundStyle(.yellow)
                }
                if let priceText = hotel.priceText {
                    Label(priceText, systemImage: "dollarsign.circle")
                        .foregroundStyle(.green)
                }
                Label(hotel.displayArea, systemImage: "mappin")
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .font(.subheadline.weight(.medium))

            if let type = hotel.hotelType, !type.isEmpty {
                Text(type)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: - Book CTA (affiliate clickout)

    @ViewBuilder
    private var bookButton: some View {
        if let url = hotel.bookURL {
            VStack(spacing: 6) {
                Button {
                    book(url: url)
                } label: {
                    Label(hotel.hasAffiliate ? "Book on \(hotel.bookProviderName)" : "Visit Website",
                          systemImage: hotel.hasAffiliate ? "bed.double.fill" : "safari")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 14))
                        .foregroundStyle(.white)
                }
                .accessibilityLabel(hotel.hasAffiliate ? "Book \(hotel.name) on \(hotel.bookProviderName)" : "Visit \(hotel.name) website")
                .accessibilityHint("Opens the booking site")

                if hotel.hasAffiliate {
                    // FTC-style disclosure, matching the affiliate ad labeling.
                    Text("We may earn a commission from bookings, at no cost to you.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
            }
        }
    }

    // MARK: - Amenities

    private var amenitiesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Amenities").font(.title3.bold())
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), alignment: .leading)],
                      alignment: .leading, spacing: 8) {
                ForEach(hotel.amenitiesList, id: \.self) { amenity in
                    Label(amenity, systemImage: amenityIcon(amenity))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Map

    @ViewBuilder
    private var mapSection: some View {
        if let coordinate = hotel.coordinate {
            VStack(alignment: .leading, spacing: 10) {
                Text("Location").font(.title3.bold())
                Map(initialPosition: .region(MKCoordinateRegion(
                    center: coordinate,
                    span: MKCoordinateSpan(latitudeDelta: 0.02, longitudeDelta: 0.02)
                ))) {
                    Marker(hotel.name, coordinate: coordinate)
                }
                .frame(height: 180)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .allowsHitTesting(false)
                .accessibilityLabel("Map showing \(hotel.name) in \(hotel.displayArea)")

                if !hotel.fullAddress.isEmpty {
                    Button {
                        openInMaps(coordinate)
                    } label: {
                        Label(hotel.fullAddress, systemImage: "arrow.triangle.turn.up.right.circle.fill")
                            .font(.subheadline)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .accessibilityLabel("Get directions to \(hotel.name)")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // MARK: - Description

    private func descriptionSection(_ description: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("About").font(.title3.bold())
            Text(description)
                .font(.body)
                .foregroundStyle(.secondary)
                .lineSpacing(4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Actions

    private func book(url: URL) {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        // Affiliate clickout tracking (IOS-PARITY-003 / IOS-ADS-014). Sponsored/
        // affiliate revenue happens on the partner, outside Apple IAP.
        if hotel.hasAffiliate {
            AdTrackingService.shared.logAffiliateClick(partner: hotel.affiliatePartnerKey, placement: "hotel_detail")
        }
        AnalyticsService.shared.trackEvent("hotel_book_click", parameters: [
            "hotel_id": hotel.id,
            "partner": hotel.affiliatePartnerKey,
            "has_affiliate": hotel.hasAffiliate,
        ])
        bookTarget = AdTarget(url: url)
    }

    private func openInMaps(_ coordinate: CLLocationCoordinate2D) {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        let name = hotel.name.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        let query = "daddr=\(coordinate.latitude),\(coordinate.longitude)&q=\(name)"
        // Prefer the Apple Maps app, but fall back to the universal https link so
        // tapping Directions still works when Apple Maps is unavailable.
        if let appURL = URL(string: "maps://?\(query)"), UIApplication.shared.canOpenURL(appURL) {
            UIApplication.shared.open(appURL)
        } else if let webURL = URL(string: "https://maps.apple.com/?\(query)") {
            UIApplication.shared.open(webURL)
        }
    }

    private var shareText: String {
        var text = hotel.name
        if let priceText = hotel.priceText { text += " (\(priceText))" }
        text += " — \(hotel.displayArea), Des Moines"
        text += "\n\nFound on Des Moines Insider"
        return text
    }

    private func amenityIcon(_ amenity: String) -> String {
        let a = amenity.lowercased()
        if a.contains("wifi") || a.contains("internet") { return "wifi" }
        if a.contains("parking") { return "car.fill" }
        if a.contains("pool") { return "figure.pool.swim" }
        if a.contains("gym") || a.contains("fitness") { return "dumbbell.fill" }
        if a.contains("restaurant") || a.contains("dining") { return "fork.knife" }
        if a.contains("bar") || a.contains("lounge") { return "wineglass.fill" }
        if a.contains("pet") { return "pawprint.fill" }
        if a.contains("breakfast") { return "cup.and.saucer.fill" }
        if a.contains("spa") { return "sparkles" }
        if a.contains("business") || a.contains("meeting") { return "briefcase.fill" }
        if a.contains("shuttle") || a.contains("airport") { return "airplane" }
        if a.contains("accessible") || a.contains("ada") { return "figure.roll" }
        return "checkmark.circle.fill"
    }
}

#Preview {
    NavigationStack {
        HotelDetailView(hotel: .preview)
    }
}
