import Foundation
import CoreLocation

struct Restaurant: Identifiable, Codable, Hashable {
    let id: String
    let name: String
    var cuisine: String?
    var location: String?
    var city: String?
    var rating: Double?
    var priceRange: String?
    var description: String?
    var phone: String?
    var website: String?
    var imageUrl: String?
    var isFeatured: Bool?
    var latitude: Double?
    var longitude: Double?
    var popularityScore: Double?
    var status: String?
    var slug: String?
    var aiWriteup: String?
    /// Structured Google hours (WEB-BE-045); see StoredHours.
    var hoursJson: StoredHours?
    /// Free-text hours. Not evaluated on iOS (fails closed to unknown).
    var opening: String?
    /// Google's OPERATIONAL / CLOSED_TEMPORARILY / CLOSED_PERMANENTLY.
    var businessStatus: String?
    var openingDate: String?
    var openingTimeframe: String?
    /// Merge bookkeeping (WEB-AUTO-005): a merged row points at its survivor.
    var isMerged: Bool?
    var mergedInto: String?
    var menuUrl: String?
    /// Google Places `reservable`: nil is unknown, not "no".
    var reservable: Bool?
    var reservationUrl: String?
    var reservationProvider: String?
    var googleMapsUri: String?
    /// The row's local guide text (IOS-DD-RESTAURANTS-11). Stripped by the
    /// rotation RPC, so only a full-row fetch carries them.
    var geoSummary: String?
    /// Optional elements: a text[] can hold NULL, and one would otherwise
    /// fail the whole page decode.
    var geoKeyFacts: [String?]?
    var createdAt: String?
    var updatedAt: String?
    /// First-party sponsored-listing flag (IOS-ADS-011). Set by the backend
    /// while a paid sponsorship is active; `sponsored_until` is informational.
    var isSponsored: Bool?
    var sponsoredUntil: String?

    enum CodingKeys: String, CodingKey {
        case id, name, cuisine, location, city, rating, description, phone, website, status, slug
        case priceRange = "price_range"
        case imageUrl = "image_url"
        case isFeatured = "is_featured"
        case latitude, longitude
        case popularityScore = "popularity_score"
        case aiWriteup = "ai_writeup"
        case hoursJson = "hours_json"
        case opening
        case businessStatus = "business_status"
        case openingDate = "opening_date"
        case openingTimeframe = "opening_timeframe"
        case isMerged = "is_merged"
        case mergedInto = "merged_into"
        case menuUrl = "menu_url"
        case reservable
        case reservationUrl = "reservation_url"
        case reservationProvider = "reservation_provider"
        case googleMapsUri = "google_maps_uri"
        case geoSummary = "geo_summary"
        case geoKeyFacts = "geo_key_facts"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case isSponsored = "is_sponsored"
        case sponsoredUntil = "sponsored_until"
    }

    /// Whether this listing currently carries an active paid sponsorship
    /// (IOS-ADS-011). Mirrors the web, which keys off the `is_sponsored` flag.
    /// Bounded by sponsored_until, same rule as Event (IOS-DD-EVENTS-13).
    var isActivelySponsored: Bool {
        Event.sponsorshipIsActive(isSponsored: isSponsored, sponsoredUntil: sponsoredUntil)
    }

    // MARK: - Open/Closed Status

    /// Open status from `hours_json` in Des Moines time (IOS-DD-RESTAURANTS-01).
    /// This decoded `business_hours`, a column only business_profiles has, so
    /// every row was "unknown" and Open Now filtered out the whole list.
    func openStatus(at date: Date = .now) -> OpenStatus {
        RestaurantHours.status(hours: hoursJson, businessStatus: businessStatus, lifecycle: status, at: date)
    }

    /// True/false when the hours say, nil when they don't. Kept for the Map
    /// and Discover callers.
    func isOpenNow(at date: Date = .now) -> Bool? {
        let status = openStatus(at: date)
        if status == .unknown { return nil }
        return status.isOpen
    }

    var openStatusText: String {
        openStatus().line ?? "Hours unknown"
    }

    // MARK: - Lifecycle (IOS-DD-RESTAURANTS-06)

    /// Whether you can eat here, going by `business_status` (Google) and the
    /// curated `status` column. The column's CHECK allows open, newly_opened,
    /// opening_soon, announced and closed; the other spellings are legacy.
    enum Lifecycle: Equatable {
        case open, newlyOpened, openingSoon, closedPermanently, closedTemporarily
    }

    var lifecycle: Lifecycle {
        switch businessStatus?.uppercased() {
        case .some("CLOSED_PERMANENTLY"): return .closedPermanently
        case .some("CLOSED_TEMPORARILY"): return .closedTemporarily
        default: break
        }
        switch status?.trimmingCharacters(in: .whitespaces).lowercased() {
        case .some("closed"), .some("permanently_closed"), .some("closed_permanently"):
            return .closedPermanently
        case .some("temporarily_closed"), .some("closed_temporarily"):
            return .closedTemporarily
        case .some("opening_soon"), .some("announced"), .some("coming_soon"):
            return .openingSoon
        case .some("newly_opened"):
            return .newlyOpened
        default:
            return .open
        }
    }

    private static let openingDateParser: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = DesMoinesTime.timeZone
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static let openingDateDisplay: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = DesMoinesTime.timeZone
        f.dateFormat = "MMM d"
        return f
    }()

    /// "Opens Oct 12", else the curated timeframe, else "Opening soon".
    var openingLabel: String? {
        if let raw = openingDate?.prefix(10), let date = Self.openingDateParser.date(from: String(raw)) {
            return "Opens \(Self.openingDateDisplay.string(from: date))"
        }
        if let timeframe = openingTimeframe?.trimmingCharacters(in: .whitespacesAndNewlines), !timeframe.isEmpty {
            return timeframe
        }
        return "Opening soon"
    }

    /// Short text for the lifecycle, or nil for an ordinary open row.
    var lifecycleLabel: String? {
        switch lifecycle {
        case .open: return nil
        case .newlyOpened: return "Newly opened"
        case .openingSoon: return openingLabel
        case .closedPermanently: return "Permanently closed"
        case .closedTemporarily: return "Temporarily closed"
        }
    }

    // MARK: - Computed Properties

    var coordinate: CLLocationCoordinate2D? {
        // A missing coordinate is null in the DB (Double? == nil); a literal 0.0
        // is a valid location and must not be masked (IOS-AUDIT-BUG-016).
        guard let lat = latitude, let lng = longitude else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    var displayDescription: String {
        aiWriteup ?? description ?? ""
    }

    var displayLocation: String {
        [location, city].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
    }

    var ratingText: String {
        guard let rating else { return "No rating" }
        return String(format: "%.1f", rating)
    }

    var priceLevel: Int {
        priceRange?.filter({ $0 == "$" }).count ?? 0
    }

    /// A dialable tel: URL, or nil so the number renders as plain text
    /// (IOS-DD-RESTAURANTS-10).
    var callURL: URL? {
        phone.flatMap(Self.dialURL)
    }

    /// `tel:` for a North American number, with any extension after a pause
    /// comma. Stripping every non-digit used to fold "ext. 204" into the
    /// number and dial a different one; anything that is not 10 digits (or 11
    /// starting with 1) is refused rather than guessed at.
    static func dialURL(_ raw: String) -> URL? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        var main = trimmed
        var ext = ""
        if let marker = trimmed.range(of: "(ext|x|#)", options: [.regularExpression, .caseInsensitive]) {
            main = String(trimmed[..<marker.lowerBound])
            ext = String(trimmed[marker.upperBound...]).filter { ("0"..."9").contains($0) }
        }
        let hasPlus = main.trimmingCharacters(in: .whitespaces).hasPrefix("+")
        let digits = main.filter { ("0"..."9").contains($0) }
        guard digits.count == 10 || (digits.count == 11 && digits.hasPrefix("1")) else { return nil }
        return URL(string: "tel:" + (hasPlus ? "+" : "") + digits + (ext.isEmpty ? "" : ",\(ext)"))
    }

    /// Apple Maps directions, built with URLComponents so a name such as
    /// "A&W" (or one carrying "&daddr=") cannot add or break parameters
    /// (IOS-DD-RESTAURANTS-10). Coordinates when known, else the address;
    /// nil when there is neither.
    static func directionsURL(name: String, coordinate: CLLocationCoordinate2D?, address: String, base: String) -> URL? {
        let destination: String
        if let coordinate {
            destination = "\(coordinate.latitude),\(coordinate.longitude)"
        } else {
            let trimmed = address.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return nil }
            destination = trimmed
        }
        guard var components = URLComponents(string: base) else { return nil }
        // urlQueryAllowed keeps & = + ? #, which are exactly what would split
        // or rewrite a parameter; '+' is also read as a space by Maps.
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "&=+?#")
        func encoded(_ s: String) -> String { s.addingPercentEncoding(withAllowedCharacters: allowed) ?? "" }
        components.percentEncodedQuery = "daddr=\(encoded(destination))&q=\(encoded(name))"
        return components.url
    }

    var directionsURL: URL? {
        Self.directionsURL(name: name, coordinate: coordinate, address: displayLocation, base: "https://maps.apple.com/")
    }

    /// Safe http/https menu link only.
    var menuURL: URL? {
        menuUrl.flatMap { $0.safeWebURL }
    }

    /// The curated booking link, else the Google listing when Google says
    /// the place takes reservations (20260909000001).
    var reserveURL: URL? {
        if let url = reservationUrl.flatMap({ $0.safeWebURL }) { return url }
        guard reservable == true else { return nil }
        return googleMapsUri.flatMap { $0.safeWebURL }
    }

    var reserveLabel: String {
        guard reservationUrl.flatMap({ $0.safeWebURL }) != nil else { return "Reserve" }
        switch reservationProvider?.lowercased() {
        case .some("opentable"): return "Reserve on OpenTable"
        case .some("resy"): return "Reserve on Resy"
        case .some("tock"): return "Reserve on Tock"
        case .some("yelp"): return "Reserve on Yelp"
        case .some("sevenrooms"): return "Reserve on SevenRooms"
        default: return "Reserve"
        }
    }

    /// Safe http/https website URL only (IOS-AUDIT-SEC-002) — an unsafe scheme
    /// in the content row yields nil so no button renders.
    var websiteURL: URL? {
        website.flatMap { $0.safeWebURL }
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: Restaurant, rhs: Restaurant) -> Bool {
        lhs.id == rhs.id
    }

    // MARK: - Accessibility

    /// VoiceOver label for a list card (IOS-DD-RESTAURANTS-12), from the parts
    /// that are present. It used to read "No rating" and skip price, status
    /// and area.
    var cardAccessibilityLabel: String {
        var parts: [String] = [name]
        if let cuisine, !cuisine.isEmpty { parts.append(cuisine) }
        if let spoken = Self.spokenPrice(priceRange) { parts.append(spoken) }
        if let rating { parts.append("rated \(String(format: "%.1f", rating))") }
        if let label = lifecycleLabel {
            parts.append(label)
        } else if let line = openStatus().line {
            parts.append(line)
        }
        let area = (city?.isEmpty == false ? city : nil) ?? displayLocation
        if !area.isEmpty { parts.append(area) }
        return parts.joined(separator: ", ")
    }

    static func spokenPrice(_ price: String?) -> String? {
        switch price?.trimmingCharacters(in: .whitespaces) {
        case .some("$"): return "inexpensive"
        case .some("$$"): return "moderate"
        case .some("$$$"): return "expensive"
        case .some("$$$$"): return "very expensive"
        default: return nil
        }
    }

    /// Full VoiceOver label for a compact card button (name, cuisine, price range, rating).
    var compactCardAccessibilityLabel: String {
        var parts: [String] = [name]
        if let cuisine { parts.append(cuisine) }
        if let priceRange, !priceRange.isEmpty { parts.append(priceRange) }
        if rating != nil { parts.append("Rated \(ratingText)") }
        return parts.joined(separator: ". ")
    }
}

// MARK: - Preview Helpers

extension Restaurant {
    static let preview = Restaurant(
        id: "preview-1",
        name: "Zombie Burger + Drink Lab",
        cuisine: "American",
        location: "300 E Grand Ave",
        city: "Des Moines",
        rating: 4.5,
        priceRange: "$$",
        description: "Creative burgers with horror-themed names and craft cocktails in a fun, quirky atmosphere.",
        phone: "(515) 555-0123",
        website: "https://zombieburger.com",
        isFeatured: true,
        latitude: 41.5910,
        longitude: -93.6088
    )
}
