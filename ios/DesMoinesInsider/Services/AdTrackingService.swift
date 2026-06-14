import Foundation
import Supabase

// MARK: - IOS-ADS-011 / IOS-ADS-013 / IOS-ADS-014 · Ad tracking
//
// Logs impressions and clicks for paid campaign CREATIVES into the shared
// `ad_impressions` / `ad_clicks` tables — the same analytics the web writes via
// `src/lib/tracking.ts` — so in-app ad performance is measurable alongside web.
//
// Four inventory classes are tracked DISTINCTLY (IOS-ADS-014) so fill-rate and
// per-class conversion are measurable:
//   • Paid campaign creatives  → `ad_impressions` / `ad_clicks` (real
//     campaign_id + creative_id, FK-backed).
//   • Affiliate creatives      → AnalyticsService events tagged `affiliate`.
//   • Sponsored listings       → AnalyticsService events keyed by listing id.
//     They have no `campaign_creatives` row (so they can't go in `ad_impressions`,
//     which requires a non-null creative_id) and `sponsored_listing_links` is not
//     readable by consumer users under RLS — campaign attribution is resolved
//     server-side from the listing id.
//   • House ads                → AnalyticsService events keyed by house variant.
//
// Every analytics event carries an `inventory_class` so the web campaign
// dashboards can tell paid revenue apart from affiliate / sponsored / house fill.
//
// Viewability (IOS-ADS-014): callers gate `logImpression` behind
// `AdViewabilityModifier` (≥50% on-screen for ≥1s), matching the web's
// IntersectionObserver, and behind `shouldShowAd` frequency capping.
//
// Offline-safe (IOS-ADS-014): when `NetworkMonitor` reports no connectivity, or
// an insert fails, the event is persisted to a durable queue and flushed the
// next time connectivity returns (NetworkMonitor calls `flushPendingEvents`).
//
// First-party only: our own Supabase tables / our own analytics. No IDFA, no
// third-party ad SDK, so ATT is never triggered (IOS-BASE-COMPLY-002).
@MainActor
final class AdTrackingService {
    static let shared = AdTrackingService()
    private init() { pending = Self.loadQueue() }

    private let supabase = SupabaseService.shared.client
    private let analytics = AnalyticsService.shared

    /// 30-minute rolling session id, mirroring the web's `ad_session_id`.
    private static let sessionKey = "ad_session_id"
    private static let sessionDuration: TimeInterval = 30 * 60

    /// Impressions already logged this app run, keyed by campaign+creative+session,
    /// so a slot scrolling in and out of view doesn't double-count.
    private var loggedImpressions: Set<String> = []

    /// Sponsored-listing impressions already logged this app run, keyed by
    /// type+id+placement, so a card scrolling in and out of view (logged from
    /// `.onAppear`) doesn't inflate counts (IOS-AUDIT-PERF-006).
    private var loggedSponsoredImpressions: Set<String> = []

    // MARK: - Inventory classes (IOS-ADS-014)

    enum AdInventoryClass: String {
        case paidCampaign = "paid_campaign"
        case affiliate
        case sponsoredListing = "sponsored_listing"
        case houseAd = "house_ad"
    }

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

    private var todayString: String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }

    // MARK: - Frequency capping (IOS-ADS-014 · shouldShowAd parity)
    //
    // Mirrors the web `shouldShowAd` (src/lib/tracking.ts): at most 3 impressions
    // per campaign per session within 5 minutes, and at most 10 per campaign per
    // signed-in user per day. Errors fail OPEN (allow the ad), like the web.
    func shouldShowAd(campaignId: String) async -> Bool {
        guard let client = supabase, !Config.isUITesting else { return true }
        struct IdRow: Decodable { let id: String }

        let iso = ISO8601DateFormatter()
        let fiveMinutesAgo = iso.string(from: Date().addingTimeInterval(-5 * 60))
        let session = sessionId

        do {
            let sessionRows: [IdRow] = try await client
                .from("ad_impressions")
                .select("id")
                .eq("campaign_id", value: campaignId)
                .eq("session_id", value: session)
                .gte("timestamp", value: fiveMinutesAgo)
                .limit(3)
                .execute()
                .value
            if sessionRows.count >= 3 { return false }
        } catch {
            return true // fail open
        }

        if let userId = AuthService.shared.currentUser?.id.uuidString {
            do {
                let userRows: [IdRow] = try await client
                    .from("ad_impressions")
                    .select("id")
                    .eq("campaign_id", value: campaignId)
                    .eq("user_id", value: userId)
                    .eq("date", value: todayString)
                    .limit(10)
                    .execute()
                    .value
                if userRows.count >= 10 { return false }
            } catch {
                return true // fail open
            }
        }

        return true
    }

    // MARK: - Paid campaign creatives → ad_impressions / ad_clicks

    /// Logs one viewable impression for a campaign creative, de-duped per
    /// campaign+creative+session. Returns the impression id (for click linkage)
    /// or nil. Never throws — ad telemetry must not disrupt the feed. When
    /// offline, the row is queued and flushed on reconnect (no id returned).
    @discardableResult
    func logImpression(campaignId: String, creativeId: String, placement: String) async -> String? {
        guard let client = supabase, !Config.isUITesting else { return nil }
        let session = sessionId
        let dedupeKey = "\(campaignId)|\(creativeId)|\(session)"
        guard !loggedImpressions.contains(dedupeKey) else { return nil }
        loggedImpressions.insert(dedupeKey)

        let row = ImpressionRow(
            campaign_id: campaignId,
            creative_id: creativeId,
            placement_type: placement,
            user_id: AuthService.shared.currentUser?.id.uuidString,
            session_id: session,
            device_type: "mobile",
            browser: "ios-app",
            date: todayString
        )

        // Offline → queue and flush later (IOS-ADS-014).
        guard NetworkMonitor.shared.isConnected else {
            enqueue(impression: row)
            return nil
        }

        struct IdRow: Decodable { let id: String }
        do {
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
            AppLogger.network.warning("AdTracking impression failed; queued: \(error.localizedDescription)")
            #endif
            enqueue(impression: row)
            loggedImpressions.remove(dedupeKey) // allow a retry when the slot reappears
            return nil
        }
    }

    /// Logs a click for a campaign creative, linked to its impression when known.
    /// Offline-safe: queued and flushed on reconnect.
    func logClick(campaignId: String, creativeId: String, impressionId: String?) async {
        guard let client = supabase, !Config.isUITesting else { return }
        let row = ClickRow(
            campaign_id: campaignId,
            creative_id: creativeId,
            impression_id: impressionId,
            date: todayString
        )

        guard NetworkMonitor.shared.isConnected else {
            enqueue(click: row)
            return
        }

        do {
            try await client.from("ad_clicks").insert(row).execute()
        } catch {
            #if DEBUG
            AppLogger.network.warning("AdTracking click failed; queued: \(error.localizedDescription)")
            #endif
            enqueue(click: row)
        }
    }

    // MARK: - Affiliate creatives (distinct fill tracking) — IOS-ADS-014

    func logAffiliateImpression(partner: String, placement: String) {
        analytics.trackEvent("affiliate_ad_impression", parameters: [
            "inventory_class": AdInventoryClass.affiliate.rawValue,
            "partner": partner, "placement": placement,
        ])
    }

    func logAffiliateClick(partner: String, placement: String) {
        analytics.trackEvent("affiliate_ad_click", parameters: [
            "inventory_class": AdInventoryClass.affiliate.rawValue,
            "partner": partner, "placement": placement,
        ])
    }

    // MARK: - Sponsored listings (distinct, RLS-safe) — IOS-ADS-011 / IOS-ADS-015

    func logSponsoredImpression(listingType: String, listingId: String, placement: String = "feed") {
        let dedupeKey = "\(listingType)|\(listingId)|\(placement)"
        guard !loggedSponsoredImpressions.contains(dedupeKey) else { return }
        loggedSponsoredImpressions.insert(dedupeKey)

        analytics.trackEvent("sponsored_listing_impression", parameters: [
            "inventory_class": AdInventoryClass.sponsoredListing.rawValue,
            "listing_type": listingType, "listing_id": listingId, "placement": placement,
        ])
    }

    func logSponsoredClick(listingType: String, listingId: String, placement: String = "feed") {
        analytics.trackEvent("sponsored_listing_click", parameters: [
            "inventory_class": AdInventoryClass.sponsoredListing.rawValue,
            "listing_type": listingType, "listing_id": listingId, "placement": placement,
        ])
    }

    // MARK: - House ads (distinct fill tracking) — IOS-ADS-013

    func logHouseImpression(variant: String, placement: String) {
        analytics.trackEvent("house_ad_impression", parameters: [
            "inventory_class": AdInventoryClass.houseAd.rawValue,
            "variant": variant, "placement": placement,
        ])
    }

    func logHouseClick(variant: String, placement: String) {
        analytics.trackEvent("house_ad_click", parameters: [
            "inventory_class": AdInventoryClass.houseAd.rawValue,
            "variant": variant, "placement": placement,
        ])
    }

    // MARK: - Offline event queue (IOS-ADS-014)

    private struct ImpressionRow: Codable {
        let campaign_id: String
        let creative_id: String
        let placement_type: String
        let user_id: String?
        let session_id: String
        let device_type: String
        let browser: String
        let date: String
    }

    private struct ClickRow: Codable {
        let campaign_id: String
        let creative_id: String
        let impression_id: String?
        let date: String
    }

    private struct PendingQueue: Codable {
        var impressions: [ImpressionRow] = []
        var clicks: [ClickRow] = []
        var isEmpty: Bool { impressions.isEmpty && clicks.isEmpty }
    }

    private static let queueKey = "ad_pending_events_v1"
    /// Cap so a long offline stretch can't grow the queue without bound.
    private static let queueCap = 200

    private var pending: PendingQueue

    private static func loadQueue() -> PendingQueue {
        guard let data = UserDefaults.standard.data(forKey: queueKey),
              let queue = try? JSONDecoder().decode(PendingQueue.self, from: data) else {
            return PendingQueue()
        }
        return queue
    }

    private func persistQueue() {
        if let data = try? JSONEncoder().encode(pending) {
            UserDefaults.standard.set(data, forKey: Self.queueKey)
        }
    }

    private func enqueue(impression: ImpressionRow) {
        guard pending.impressions.count + pending.clicks.count < Self.queueCap else { return }
        pending.impressions.append(impression)
        persistQueue()
    }

    private func enqueue(click: ClickRow) {
        guard pending.impressions.count + pending.clicks.count < Self.queueCap else { return }
        pending.clicks.append(click)
        persistQueue()
    }

    /// Drains the offline queue. Called by `NetworkMonitor` on reconnect and on
    /// app launch. Best-effort: rows that still fail stay queued for next time.
    func flushPendingEvents() async {
        guard let client = supabase, !Config.isUITesting else { return }
        guard NetworkMonitor.shared.isConnected, !pending.isEmpty else { return }

        var remainingImpressions: [ImpressionRow] = []
        for row in pending.impressions {
            do {
                try await client.from("ad_impressions").insert(row).execute()
            } catch {
                remainingImpressions.append(row)
            }
        }

        var remainingClicks: [ClickRow] = []
        for row in pending.clicks {
            do {
                try await client.from("ad_clicks").insert(row).execute()
            } catch {
                remainingClicks.append(row)
            }
        }

        pending.impressions = remainingImpressions
        pending.clicks = remainingClicks
        persistQueue()
    }
}
