import Foundation

// MARK: - IOS-ADS-010 · First-party campaign ad serving
//
// Fetches active, approved campaign creatives from the shared campaigns /
// campaign_creatives tables via the `get_active_ads(p_placement_type)` RPC —
// the same source the web uses (see src/hooks/useActiveAds.ts) — so advertisers
// who bought a campaign on the web actually render in the app.
//
// First-party only: this hits our own Supabase RPC for our own creatives. No
// IDFA, no third-party ad SDK, so ATT is never triggered (IOS-BASE-COMPLY-002).
@MainActor
@Observable
final class CampaignAdService {
    static let shared = CampaignAdService()
    private init() {}

    /// Placement keys understood by `get_active_ads`. The app's feed slot maps
    /// to `below_fold` (the web's in-feed/sidebar slot); detail uses
    /// `featured_spot`. `sponsoredListing` is the seam for IOS-ADS-011.
    enum Placement: String {
        case topBanner = "top_banner"
        case featuredSpot = "featured_spot"
        case belowFold = "below_fold"
        case sponsoredListing = "sponsored_listing"
    }

    struct CampaignCreative: Identifiable, Equatable {
        let campaignId: String
        let creativeId: String
        let title: String?
        let description: String?
        let imageUrl: String?
        let linkUrl: String?
        let ctaText: String?
        var id: String { creativeId }

        var targetURL: URL? {
            guard let linkUrl, !linkUrl.isEmpty,
                  let url = URL(string: linkUrl),
                  // Only open web links. The link_url is backend-controlled, so
                  // reject anything that isn't http/https (e.g. javascript:,
                  // file:, custom schemes) before it reaches the in-app browser.
                  let scheme = url.scheme?.lowercased(),
                  scheme == "http" || scheme == "https" else { return nil }
            return url
        }
    }

    private let supabase = SupabaseService.shared.client

    /// Short-lived per-placement cache so scrolling a feed doesn't re-hit the
    /// RPC for every ad slot. Each call still rotates server-side (RPC does
    /// `ORDER BY random()`), just not on every redraw.
    private var cache: [String: (creative: CampaignCreative?, at: Date)] = [:]
    private let ttl: TimeInterval = 5 * 60

    /// Returns the active campaign creative for a placement, or nil when there
    /// is no live campaign (callers fall back to affiliate / house ads).
    func creative(for placement: Placement) async -> CampaignCreative? {
        let key = placement.rawValue
        if let hit = cache[key], Date().timeIntervalSince(hit.at) < ttl {
            return hit.creative
        }

        guard let client = supabase, !Config.isUITesting else { return nil }

        struct Params: Encodable { let p_placement_type: String }
        struct Row: Decodable {
            let campaign_id: String?
            let creative_id: String?
            let title: String?
            let description: String?
            let image_url: String?
            let link_url: String?
            let cta_text: String?
        }

        do {
            let rows: [Row] = try await client
                .rpc("get_active_ads", params: Params(p_placement_type: key))
                .execute()
                .value

            let creative: CampaignCreative? = rows.first.flatMap { row in
                guard let cid = row.campaign_id, let crid = row.creative_id else { return nil }
                return CampaignCreative(
                    campaignId: cid,
                    creativeId: crid,
                    title: row.title,
                    description: row.description,
                    imageUrl: row.image_url,
                    linkUrl: row.link_url,
                    ctaText: row.cta_text
                )
            }
            cache[key] = (creative, Date())
            return creative
        } catch {
            #if DEBUG
            AppLogger.network.warning("CampaignAdService fetch failed for \(key): \(error.localizedDescription)")
            #endif
            return nil
        }
    }
}
