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

    /// Sponsored listings already logged this app session, keyed by
    /// type+id, so a listing scrolling in and out of view (or reappearing
    /// across feeds) is counted at most once per session (IOS-AUDIT-PERF-006).
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

    /// The live session, so a read does not have to go to disk.
    private var cachedSession: AdSession?

    /// How stale the PERSISTED timestamp is allowed to get before the window
    /// extension is written again.
    ///
    /// The session lasts 30 minutes; persisting the extension to the nearest
    /// minute cannot change whether a session is live except within one minute
    /// of expiry, and only if the app is killed in that minute. That is the
    /// entire cost, and it buys removing a JSON decode, a JSON encode and a
    /// UserDefaults write from EVERY read of sessionId - which is every
    /// impression, every click and every frequency-cap check.
    private static let sessionPersistInterval: TimeInterval = 60

    private var sessionId: String {
        let now = Date().timeIntervalSince1970

        // In-memory first. Falls back to disk once per launch, or after the
        // window lapses.
        let existing = cachedSession ?? loadSession()
        if let existing, now - existing.timestamp < Self.sessionDuration {
            // Extend in memory always; persist only when the stored timestamp
            // has fallen behind, so termination cannot lose more than
            // sessionPersistInterval of the window.
            cachedSession = AdSession(id: existing.id, timestamp: now)
            if now - persistedAt >= Self.sessionPersistInterval {
                save(AdSession(id: existing.id, timestamp: now))
            }
            return existing.id
        }

        let fresh = AdSession(id: "session_\(Int(now * 1000))_\(UUID().uuidString.prefix(6))", timestamp: now)
        cachedSession = fresh
        save(fresh)
        return fresh.id
    }

    /// Timestamp last written to disk. A new id always writes, so this starts
    /// accurate and stays accurate.
    private var persistedAt: TimeInterval = 0

    private func loadSession() -> AdSession? {
        guard let data = UserDefaults.standard.data(forKey: Self.sessionKey),
              let session = try? JSONDecoder().decode(AdSession.self, from: data) else {
            return nil
        }
        cachedSession = session
        persistedAt = session.timestamp
        return session
    }

    private func save(_ session: AdSession) {
        if let data = try? JSONEncoder().encode(session) {
            UserDefaults.standard.set(data, forKey: Self.sessionKey)
            persistedAt = session.timestamp
        }
    }

    /// Built once. DateFormatter construction is one of the more expensive
    /// things in Foundation, and this ran on every impression and every click
    /// purely to produce today's date. Same class of defect as the session
    /// write above, found in the same file.
    nonisolated(unsafe) private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private var todayString: String {
        Self.dayFormatter.string(from: Date())
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
        // Ad-interaction telemetry is tied to user_id, so it must respect the
        // analytics consent choice — same gate AnalyticsService applies
        // (IOS-AUDIT-SEC-008). Without this, ad_impressions wrote for all users.
        guard ConsentService.shared.analyticsConsent else { return nil }
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
            date: todayString,
            // Minted at queue time, not send time - a key generated per
            // attempt is a different key on the retry (IOS-AUDIT-BUG-017).
            client_event_id: UUID().uuidString
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
        // Respect analytics consent (IOS-AUDIT-SEC-008).
        guard ConsentService.shared.analyticsConsent else { return }
        let row = ClickRow(
            campaign_id: campaignId,
            creative_id: creativeId,
            impression_id: impressionId,
            date: todayString,
            client_event_id: UUID().uuidString
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
        // De-dupe per app session so a listing scrolling in/out of view — or
        // appearing in more than one feed — logs at most one impression
        // (IOS-AUDIT-PERF-006), mirroring the campaign-creative dedupe above.
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
        /// Idempotency key, minted when the row is queued (IOS-AUDIT-BUG-017).
        /// Optional so a queue written by an earlier build still decodes; the
        /// queue in UserDefaults is a stored schema and a required field would
        /// make every existing entry fail to decode and disappear.
        var client_event_id: String?
    }

    private struct ClickRow: Codable {
        let campaign_id: String
        let creative_id: String
        let impression_id: String?
        let date: String
        /// See ImpressionRow.client_event_id.
        var client_event_id: String?
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
        // If the user revoked analytics consent while offline, drop the queued
        // ad telemetry instead of sending it on reconnect (IOS-AUDIT-SEC-008).
        guard ConsentService.shared.analyticsConsent else {
            if !pending.isEmpty {
                pending = PendingQueue()
                persistQueue()
            }
            return
        }
        guard NetworkMonitor.shared.isConnected, !pending.isEmpty else { return }

        // Upsert on the queued idempotency key, not insert (IOS-AUDIT-BUG-017).
        // A lost response is indistinguishable from a lost request here, so a
        // requeued row used to be counted twice - inflating exactly the numbers
        // advertisers are billed against.
        var remainingImpressions: [ImpressionRow] = []
        for row in pending.impressions {
            do {
                try await client
                    .from("ad_impressions")
                    .upsert(row, onConflict: "client_event_id", ignoreDuplicates: true)
                    .execute()
            } catch {
                remainingImpressions.append(row)
            }
        }

        var remainingClicks: [ClickRow] = []
        for row in pending.clicks {
            do {
                try await client
                    .from("ad_clicks")
                    .upsert(row, onConflict: "client_event_id", ignoreDuplicates: true)
                    .execute()
            } catch {
                remainingClicks.append(row)
            }
        }

        pending.impressions = remainingImpressions
        pending.clicks = remainingClicks
        persistQueue()
    }
}
