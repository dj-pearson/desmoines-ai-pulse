import Foundation

/// Static registry and brand-rotation service for affiliate display ads.
/// Mirrors the web `affiliateAds.ts` configuration and `useAffiliateAd` session logic.
@MainActor
@Observable
final class AffiliateAdService {
    static let shared = AffiliateAdService()

    // MARK: - Types

    struct AffiliatePartner: Identifiable {
        let id: String
        let name: String
        let affiliateUrl: URL
        /// Image URLs keyed by size string ("728x90", "300x250", "160x600")
        let assets: [String: URL]
        var isActive: Bool
    }

    enum Placement: String {
        case banner   // 300x250 — used in feed / between content
        case compact  // 728x90  — horizontal strip
    }

    // MARK: - Configuration

    /// Base URL for affiliate creative assets hosted on the production site.
    private static let assetBaseURL = "https://desmoinesinsider.com/ads/affiliates"

    /// Partners must match the web registry in `src/lib/affiliateAds.ts`.
    private(set) var partners: [AffiliatePartner] = [
        AffiliatePartner(
            id: "hyatt",
            name: "Hyatt",
            affiliateUrl: URL(string: "https://hyatt.jewn.net/DWyqGG")!,
            assets: [
                "728x90":  URL(string: "\(assetBaseURL)/hyatt/728x90.jpeg")!,
                "300x250": URL(string: "\(assetBaseURL)/hyatt/300x250.jpeg")!,
                "160x600": URL(string: "\(assetBaseURL)/hyatt/160x600.jpeg")!,
            ],
            isActive: true
        ),
        AffiliatePartner(
            id: "ihg",
            name: "IHG",
            affiliateUrl: URL(string: "https://ihg.hmxg.net/5kaEq9")!,
            assets: [
                "728x90":  URL(string: "\(assetBaseURL)/ihg/728x90.jpeg")!,
                "300x250": URL(string: "\(assetBaseURL)/ihg/300x250.jpeg")!,
                "160x600": URL(string: "\(assetBaseURL)/ihg/160x600.jpeg")!,
            ],
            isActive: true
        ),
        AffiliatePartner(
            id: "marriott",
            name: "Marriott",
            affiliateUrl: URL(string: "https://marriott.pxf.io/en1QGZ")!,
            assets: [
                "728x90":  URL(string: "\(assetBaseURL)/marriott/728x90.jpeg")!,
                "300x250": URL(string: "\(assetBaseURL)/marriott/300x250.jpeg")!,
                "160x600": URL(string: "\(assetBaseURL)/marriott/160x600.jpeg")!,
            ],
            isActive: true
        ),
    ]

    // MARK: - Session State

    private static let sessionKey = "affiliate_brand_session"
    private static let sessionDuration: TimeInterval = 30 * 60 // 30 minutes

    private struct BrandSession: Codable {
        let index: Int
        let timestamp: TimeInterval
    }

    // MARK: - Public API

    /// Returns the current session's affiliate partner (consistent across all placements).
    var currentPartner: AffiliatePartner? {
        let active = partners.filter(\.isActive)
        guard !active.isEmpty else { return nil }

        let now = Date().timeIntervalSince1970
        let session = loadSession()

        let index: Int
        if let session, now - session.timestamp < Self.sessionDuration {
            index = session.index % active.count
        } else {
            index = session.map { ($0.index + 1) % active.count } ?? 0
            saveSession(BrandSession(index: index, timestamp: now))
        }

        return active[index]
    }

    /// Returns the image URL for the given placement from the current session partner.
    func imageURL(for placement: Placement) -> URL? {
        guard let partner = currentPartner else { return nil }
        let sizeKey: String
        switch placement {
        case .banner:  sizeKey = "300x250"
        case .compact: sizeKey = "728x90"
        }
        return partner.assets[sizeKey]
    }

    /// Returns the affiliate tracking URL for the current session partner.
    var affiliateURL: URL? {
        currentPartner?.affiliateUrl
    }

    // MARK: - Persistence

    private func loadSession() -> BrandSession? {
        guard let data = UserDefaults.standard.data(forKey: Self.sessionKey) else { return nil }
        return try? JSONDecoder().decode(BrandSession.self, from: data)
    }

    private func saveSession(_ session: BrandSession) {
        if let data = try? JSONEncoder().encode(session) {
            UserDefaults.standard.set(data, forKey: Self.sessionKey)
        }
    }

    private init() {}
}
