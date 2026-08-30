import Foundation
import CoreLocation
import SwiftUI

/// A hotel / accommodation listing. Decodes the same `hotels` table the web
/// `/stay` surface reads (see src/hooks/useHotels.ts), so web + iOS show
/// identical inventory. The `affiliate_url` is the revenue path — booking opens
/// the partner in an in-app Safari sheet (outside Apple IAP).
struct Hotel: Identifiable, Codable, Hashable {
    let id: String
    let name: String
    let slug: String
    var description: String?
    var shortDescription: String?
    var address: String?
    var city: String?
    var state: String?
    var area: String?
    var phone: String?
    var website: String?
    var affiliateUrl: String?
    var affiliateProvider: String?
    var imageUrl: String?
    var galleryUrls: [String]?
    var starRating: Double?
    var priceRange: String?
    var avgNightlyRate: Double?
    var amenities: [String]?
    var hotelType: String?
    var chainName: String?
    var latitude: Double?
    var longitude: Double?
    var isFeatured: Bool?
    var isActive: Bool?

    enum CodingKeys: String, CodingKey {
        case id, name, slug, description, address, city, state, area, phone, website, amenities, latitude, longitude
        case shortDescription = "short_description"
        case affiliateUrl = "affiliate_url"
        case affiliateProvider = "affiliate_provider"
        case imageUrl = "image_url"
        case galleryUrls = "gallery_urls"
        case starRating = "star_rating"
        case priceRange = "price_range"
        case avgNightlyRate = "avg_nightly_rate"
        case hotelType = "hotel_type"
        case chainName = "chain_name"
        case isFeatured = "is_featured"
        case isActive = "is_active"
    }

    // MARK: - Computed Properties

    var coordinate: CLLocationCoordinate2D? {
        guard let lat = latitude, let lng = longitude, lat != 0, lng != 0 else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    /// Neighborhood/area, falling back to city.
    var displayArea: String {
        let a = (area ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !a.isEmpty { return a }
        return (city ?? "Des Moines").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Full street address line for the detail view.
    var fullAddress: String {
        [address, city, state].compactMap { $0?.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .joined(separator: ", ")
    }

    var hasAffiliate: Bool {
        guard let url = affiliateUrl?.trimmingCharacters(in: .whitespaces) else { return false }
        return !url.isEmpty
    }

    /// Where the "Book" CTA goes: the affiliate URL when present (revenue),
    /// otherwise the hotel's own website. `nil` when neither exists.
    var bookURL: URL? {
        if let affiliate = affiliateUrl, let url = normalizedURL(affiliate) { return url }
        if let site = website, let url = normalizedURL(site) { return url }
        return nil
    }

    /// Safe http/https website URL only (IOS-AUDIT-SEC-002) — an unsafe scheme
    /// in the content row yields nil so no button renders.
    var websiteURL: URL? {
        website.flatMap { $0.safeWebURL }
    }

    /// Partner label for analytics + CTA copy ("Book on Hilton", etc.).
    var bookProviderName: String {
        if let provider = affiliateProvider?.trimmingCharacters(in: .whitespaces), !provider.isEmpty {
            return provider
        }
        if let chain = chainName?.trimmingCharacters(in: .whitespaces), !chain.isEmpty {
            return chain
        }
        return "partner site"
    }

    /// Analytics partner key (lowercased, no spaces) for affiliate clickout tracking.
    var affiliatePartnerKey: String {
        let base = (affiliateProvider ?? chainName ?? name)
        return base
            .lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: "_")
    }

    var priceText: String? {
        if let range = priceRange?.trimmingCharacters(in: .whitespaces), !range.isEmpty {
            return range
        }
        if let rate = avgNightlyRate, rate > 0 {
            return "$\(Int(rate.rounded()))/night"
        }
        return nil
    }

    var starText: String? {
        guard let stars = starRating else { return nil }
        return String(format: "%.1f", stars)
    }

    var amenitiesList: [String] {
        (amenities ?? []).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
    }

    /// Hero + gallery image URLs, deduped, hero first.
    var galleryImageURLs: [String] {
        var urls: [String] = []
        if let hero = imageUrl, !hero.isEmpty { urls.append(hero) }
        for url in galleryUrls ?? [] where !url.isEmpty && !urls.contains(url) {
            urls.append(url)
        }
        return urls
    }

    var webURL: URL {
        Config.siteURL.appendingPathComponent("stay").appendingPathComponent(slug)
    }

    var cardAccessibilityLabel: String {
        var parts: [String] = [name]
        if let hotelType, !hotelType.isEmpty { parts.append(hotelType) }
        parts.append(displayArea)
        if let starText { parts.append("\(starText) stars") }
        if let priceText { parts.append(priceText) }
        if isFeatured == true { parts.append("Featured") }
        return parts.joined(separator: ". ")
    }

    // MARK: - Hashable / Equatable

    func hash(into hasher: inout Hasher) { hasher.combine(id) }
    static func == (lhs: Hotel, rhs: Hotel) -> Bool { lhs.id == rhs.id }

    // MARK: - Helpers

    private func normalizedURL(_ raw: String) -> URL? {
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return nil }
        if trimmed.hasPrefix("http") { return URL(string: trimmed) }
        return URL(string: "https://\(trimmed)")
    }
}

// MARK: - Unified content-card adapter (IOS-IA-003)

extension Hotel {
    var cardData: ContentCardData {
        var pills: [CardPill] = []
        if let starText {
            pills.append(CardPill(icon: "star.fill", text: starText, tint: .yellow, filled: false))
        }
        if let priceText {
            pills.append(CardPill(icon: nil, text: priceText, tint: .green, filled: false))
        }

        var data = ContentCardData(
            id: id,
            title: name,
            imageUrl: imageUrl,
            placeholderIcon: "bed.double.fill",
            placeholderTint: .purple,
            pills: pills,
            isFeatured: isFeatured == true,
            accessibilityLabel: cardAccessibilityLabel
        )
        let typeLabel = (hotelType?.isEmpty == false) ? hotelType! : "Hotel"
        data.metaPrimary = CardMetaLine(icon: "bed.double", text: typeLabel)
        data.metaSecondary = CardMetaLine(icon: "mappin", text: displayArea)
        return data
    }
}

// MARK: - Preview fixture

extension Hotel {
    static let preview = Hotel(
        id: "preview-hotel-1",
        name: "Surety Hotel",
        slug: "surety-hotel",
        description: "A restored 1913 landmark in the heart of downtown Des Moines, blending historic architecture with modern luxury, a rooftop bar, and a celebrated restaurant.",
        shortDescription: "Historic downtown luxury with a rooftop bar.",
        address: "206 6th Ave",
        city: "Des Moines",
        state: "IA",
        area: "Downtown",
        phone: "(515) 619-8403",
        website: "https://suretyhotel.com",
        affiliateUrl: "https://partner.example.com/surety?aff=dsm",
        affiliateProvider: "Hilton",
        imageUrl: nil,
        galleryUrls: nil,
        starRating: 4.6,
        priceRange: "$$$",
        avgNightlyRate: 229,
        amenities: ["Free WiFi", "Rooftop Bar", "Fitness Center", "Restaurant", "Pet Friendly"],
        hotelType: "Boutique",
        chainName: "Hilton Curio",
        latitude: 41.5871,
        longitude: -93.6259,
        isFeatured: true,
        isActive: true
    )
}
