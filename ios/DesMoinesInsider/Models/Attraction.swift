import Foundation
import CoreLocation

struct Attraction: Identifiable, Codable, Hashable {
    let id: String
    let name: String
    let type: String
    var location: String?
    var description: String?
    var rating: Double?
    var website: String?
    var imageUrl: String?
    var isFeatured: Bool?
    var latitude: Double?
    var longitude: Double?
    var createdAt: String?
    var updatedAt: String?

    // Columns from 20260520000004 (admin fields), 20260620000003
    // (sponsorship) and 20260919000008 (slug). All optional: a row from an
    // older backend, or a cached row from an older build, has none of them
    // (IOS-DD-BROWSE-09).
    var address: String?
    var hoursSummary: String?
    /// jsonb; a shape other than `{ mon: {open, close}, ... }` decodes as nil.
    var hours: AttractionHours.Week?
    var isIndoor: Bool?
    var isKidFriendly: Bool?
    var isFree: Bool?
    var isActive: Bool?
    var accessibilityNotes: String?
    var geoSummary: String?
    var slug: String?
    var isSponsored: Bool?
    var sponsoredUntil: String?

    enum CodingKeys: String, CodingKey {
        case id, name, type, location, description, rating, website, latitude, longitude
        case imageUrl = "image_url"
        case isFeatured = "is_featured"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case address
        case hoursSummary = "hours_summary"
        case hours
        case isIndoor = "is_indoor"
        case isKidFriendly = "is_kid_friendly"
        case isFree = "is_free"
        case isActive = "is_active"
        case accessibilityNotes = "accessibility_notes"
        case geoSummary = "geo_summary"
        case slug
        case isSponsored = "is_sponsored"
        case sponsoredUntil = "sponsored_until"
    }

    // MARK: - Computed Properties

    var attractionType: AttractionType {
        AttractionType(rawValue: type) ?? .other
    }

    var coordinate: CLLocationCoordinate2D? {
        // A missing coordinate is null in the DB (Double? == nil); a literal 0.0
        // is a valid location and must not be masked (IOS-AUDIT-BUG-016).
        guard let lat = latitude, let lng = longitude else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    /// Safe http/https website URL only (IOS-AUDIT-SEC-002) — an unsafe scheme
    /// in the content row yields nil so no button renders.
    var websiteURL: URL? {
        website.flatMap { $0.safeWebURL }
    }

    var ratingText: String {
        guard let rating else { return "No rating" }
        return String(format: "%.1f", rating)
    }

    /// A live paid placement: the flag, honouring `sponsored_until` the way
    /// Event and Restaurant do (IOS-DD-BROWSE-09).
    var isActivelySponsored: Bool {
        Event.sponsorshipIsActive(isSponsored: isSponsored, sponsoredUntil: sponsoredUntil)
    }

    /// Today's open status from the structured hours (IOS-DD-BROWSE-10).
    func openStatus(at date: Date = Date()) -> OpenStatus {
        AttractionHours.status(week: hours, at: date)
    }

    /// The street address when entered, else the free-text location.
    var displayAddress: String? {
        [address, location]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty }
    }

    /// Apple Maps directions: coordinates when known, else the address, nil
    /// when there is neither (IOS-DD-BROWSE-11). Built by the shared
    /// `Restaurant.directionsURL`, which escapes `& = + ? #` so a name such as
    /// "Science Center of Iowa & Blank IMAX" cannot split the query.
    var directionsURL: URL? {
        Restaurant.directionsURL(name: name, coordinate: coordinate, address: displayAddress ?? "", base: MapPopupModel.mapsBase)
    }

    /// The web's canonical page, /attractions/<slug>. Nil without a slug: the
    /// web route resolves by slug only, so a UUID link would 404.
    var shareURL: URL? {
        slug.flatMap { $0.isEmpty ? nil : Config.siteURL.appendingPathComponent("attractions").appendingPathComponent($0) }
    }

    /// Full VoiceOver label for a compact card button (name, type, rating).
    /// Mirrors `Restaurant.compactCardAccessibilityLabel` so the home rails
    /// read consistently (IOS-IA-001).
    var compactCardAccessibilityLabel: String {
        var parts: [String] = [name, attractionType.displayName]
        if rating != nil { parts.append("Rated \(ratingText)") }
        if isFree == true { parts.append("Free admission") }
        if let line = openStatus().line { parts.append(line) }
        return parts.joined(separator: ". ")
    }

    /// Label for a rail NavigationLink wrapping a decorative card
    /// (IOS-DD-BROWSE-07), led by "Sponsored. " for a live paid placement.
    var railAccessibilityLabel: String {
        isActivelySponsored ? "Sponsored. \(compactCardAccessibilityLabel)" : compactCardAccessibilityLabel
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: Attraction, rhs: Attraction) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - Tolerant decoding (IOS-DD-BROWSE-09)

extension Attraction {
    /// Every column past the original thirteen is decodeIfPresent, and
    /// `hours` is decoded with try? so a malformed jsonb gives nil instead of
    /// failing the row (and with it the page). In an extension so the
    /// memberwise initialiser `.preview` uses survives; encoding stays
    /// synthesized.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        type = try c.decodeIfPresent(String.self, forKey: .type) ?? AttractionType.other.rawValue
        location = try c.decodeIfPresent(String.self, forKey: .location)
        description = try c.decodeIfPresent(String.self, forKey: .description)
        rating = try c.decodeIfPresent(Double.self, forKey: .rating)
        website = try c.decodeIfPresent(String.self, forKey: .website)
        imageUrl = try c.decodeIfPresent(String.self, forKey: .imageUrl)
        isFeatured = try c.decodeIfPresent(Bool.self, forKey: .isFeatured)
        latitude = try c.decodeIfPresent(Double.self, forKey: .latitude)
        longitude = try c.decodeIfPresent(Double.self, forKey: .longitude)
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt)
        updatedAt = try c.decodeIfPresent(String.self, forKey: .updatedAt)
        address = try c.decodeIfPresent(String.self, forKey: .address)
        hoursSummary = try c.decodeIfPresent(String.self, forKey: .hoursSummary)
        hours = (try? c.decodeIfPresent(AttractionHours.Week.self, forKey: .hours)) ?? nil
        isIndoor = try c.decodeIfPresent(Bool.self, forKey: .isIndoor)
        isKidFriendly = try c.decodeIfPresent(Bool.self, forKey: .isKidFriendly)
        isFree = try c.decodeIfPresent(Bool.self, forKey: .isFree)
        isActive = try c.decodeIfPresent(Bool.self, forKey: .isActive)
        accessibilityNotes = try c.decodeIfPresent(String.self, forKey: .accessibilityNotes)
        geoSummary = try c.decodeIfPresent(String.self, forKey: .geoSummary)
        slug = try c.decodeIfPresent(String.self, forKey: .slug)
        isSponsored = try c.decodeIfPresent(Bool.self, forKey: .isSponsored)
        sponsoredUntil = try c.decodeIfPresent(String.self, forKey: .sponsoredUntil)
    }
}

extension Attraction {
    static let preview = Attraction(
        id: "preview-1",
        name: "Pappajohn Sculpture Park",
        type: "Park",
        location: "1330 Grand Ave, Des Moines",
        description: "A 4.4-acre park featuring 30+ world-renowned sculptures by internationally acclaimed artists.",
        rating: 4.8,
        website: "https://desmoinesartcenter.org",
        isFeatured: true,
        latitude: 41.5862,
        longitude: -93.6354
    )
}
