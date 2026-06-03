import Foundation
import Supabase

// MARK: - IOS-ADS-011 / IOS-ADS-013 / IOS-ADS-014 · Ad tracking
//
// Logs impressions and clicks for paid campaign CREATIVES into the shared
// `ad_impressions` / `ad_clicks` tables — the same analytics the web writes via
// `src/lib/tracking.ts` — so in-app ad performance is measurable alongside web.
//
// Three inventory classes are tracked DISTINCTLY so fill-rate and per-class
// conversion are measurable:
//   • Paid campaign creatives  → `ad_impressions` / `ad_clicks` (real
//     campaign_id + creative_id, FK-backed).
//   • Sponsored listings       → AnalyticsService events keyed by listing id.
//     They have no `campaign_creatives` row (so they can't go in `ad_impressions`,
//     which requires a non-null creative_id) and `sponsored_listing_links` is not
//     readable by consumer users under RLS — campaign attribution is resolved
//     server-side from the listing id.
//   • House ads                → AnalyticsService events keyed by house variant.
//
// First-party only: our own Supabase tables / our own analytics. No IDFA, no
// third-party ad SDK, so ATT is never triggered (IOS-BASE-COMPLY-002).
@MainActor
final class AdTrackingService {
    static let shared = AdTrackingService()
    private init() {}

    private let supabase = SupabaseService.shared.client
    private let analytics = AnalyticsService.shared

    /// 30-minute rolling session id, mirroring the web's `ad_session_id`.
    private static let sessionKey = "ad_session_id"
    private static let sessionDuration: TimeInterval = 30 * 60

    /// Impressions already logged this app run, keyed by campaign+creative+session,
    /// so a slot scrolling in and out of view doesn't double-count.
    private var loggedImpressions: Set<String> = []

    // MARK: - Session

    private struct AdSession: Codable { let id: String; let timestamp: TimeInterval }

    private var sessionId: String {
        let now = Date().timeIntervalSince1970
        if let data = UserDefaults.standard.data(forKey: Self.sessionKey),
           let session = try? JSONDecoder().decode(AdSession.self, from: data),
           now - session.timestamp < Self.sessionDuration {
            save(AdSession(id: session.id, timestamp: now)) // extend window on use
            return session.id
        }
        let fresh = AdSession(id: "session_\(Int(now * 1000))_\(UUID().uuidString.prefix(6))", timestamp: now)
        save(fresh)
        return fresh.id
    }

    private func save(_ session: AdSession) {
        if let data = try? JSONEncoder().encode(session) {
            UserDefaults.standard.set(data, forKey: Self.sessionKey)
        }
    }

    // MARK: - Paid campaign creatives → ad_impressions / ad_clicks

    /// Logs one viewable impression for a campaign creative, de-duped per
    /// campaign+creative+session. Returns the impression id (for click linkage)
    /// or nil. Never throws — ad telemetry must not disrupt the feed.
    @discardableResult
    func logImpression(campaignId: String, creativeId: String, placement: String) async -> String? {
        guard let client = supabase, !Config.isUITesting else { return nil }
        let session = sessionId
        let dedupeKey = "\(campaignId)|\(creativeId)|\(session)"
        guard !loggedImpressions.contains(dedupeKey) else { return nil }
        loggedImpressions.insert(dedupeKey)

        struct InsertRow: Encodable {
            let campaign_id: String
            let creative_id: String
            let placement_type: String
            let user_id: String?
            let session_id: String
            let device_type: String
            let browser: String
        }
        struct IdRow: Decodable { let id: String }

        do {
            let row = InsertRow(
                campaign_id: campaignId,
                creative_id: creativeId,
                placement_type: placement,
                user_id: AuthService.shared.currentUser?.id.uuidString,
                session_id: session,
                device_type: "mobile",
                browser: "ios-app"
            )
            let inserted: IdRow = try await client
                .from("ad_impressions")
                .insert(row)
                .select("id")
                .single()
                .execute()
                .value
            return inserted.id
        } catch {
            #if DEBUG
            AppLogger.network.warning("AdTracking impression failed: \(error.localizedDescription)")
            #endif
            loggedImpressions.remove(dedupeKey) // allow a retry when the slot reappears
            return nil
        }
    }

    /// Logs a click for a campaign creative, linked to its impression when known.
    func logClick(campaignId: String, creativeId: String, impressionId: String?) async {
        guard let client = supabase, !Config.isUITesting else { return }
        struct InsertRow: Encodable {
            let campaign_id: String
            let creative_id: String
            let impression_id: String?
        }
        do {
            try await client
                .from("ad_clicks")
                .insert(InsertRow(campaign_id: campaignId, creative_id: creativeId, impression_id: impressionId))
                .execute()
        } catch {
            #if DEBUG
            AppLogger.network.warning("AdTracking click failed: \(error.localizedDescription)")
            #endif
        }
    }

    // MARK: - Sponsored listings (distinct, RLS-safe) — IOS-ADS-011

    func logSponsoredImpression(listingType: String, listingId: String) {
        analytics.trackEvent("sponsored_listing_impression", parameters: [
            "listing_type": listingType, "listing_id": listingId,
        ])
    }

    func logSponsoredClick(listingType: String, listingId: String) {
        analytics.trackEvent("sponsored_listing_click", parameters: [
            "listing_type": listingType, "listing_id": listingId,
        ])
    }

    // MARK: - House ads (distinct fill tracking) — IOS-ADS-013

    func logHouseImpression(variant: String, placement: String) {
        analytics.trackEvent("house_ad_impression", parameters: [
            "variant": variant, "placement": placement,
        ])
    }

    func logHouseClick(variant: String, placement: String) {
        analytics.trackEvent("house_ad_click", parameters: [
            "variant": variant, "placement": placement,
        ])
    }
}
