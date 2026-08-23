import XCTest
@testable import DesMoinesInsider

/// IOS-AUDIT-TEST-004 AC2 - ad telemetry is actually suppressed when analytics
/// consent is absent or revoked, not merely gated in source.
///
/// WHY THIS TESTS THE QUEUE AND NOT logImpression. logImpression and logClick
/// return nil and void on every path once `supabase` is nil, which it is in a
/// unit test, so an assertion on their return value passes whether or not the
/// consent guard exists. The offline queue is the one effect of the gate that a
/// test can observe without a Supabase client: flushPendingEvents empties it
/// when consent is missing and leaves it alone when consent is granted. Delete
/// the guard and the first test below fails.
@MainActor
final class AdTrackingConsentTests: XCTestCase {

    private var suite: UserDefaults!
    private var suiteName: String!
    private var savedConsent: Any?

    override func setUp() {
        super.setUp()
        suiteName = "AdTrackingConsentTests.\(UUID().uuidString)"
        suite = UserDefaults(suiteName: suiteName)

        // ConsentService reads UserDefaults.standard with a hardcoded key, so
        // snapshot the runner's value rather than destroying it.
        savedConsent = UserDefaults.standard.object(forKey: "gdpr_consent_analytics")
    }

    override func tearDown() {
        suite.removePersistentDomain(forName: suiteName)
        if let savedConsent {
            UserDefaults.standard.set(savedConsent, forKey: "gdpr_consent_analytics")
        } else {
            UserDefaults.standard.removeObject(forKey: "gdpr_consent_analytics")
        }
        super.tearDown()
    }

    private func makeService() -> AdTrackingService {
        AdTrackingService(testDefaults: suite)
    }

    func testRevokedConsentDropsQueuedTelemetryOnFlush() async {
        ConsentService.shared.analyticsConsent = true
        let service = makeService()
        service.seedPendingImpressionForTesting()
        XCTAssertEqual(service.pendingEventCountForTesting, 1)

        // The user revokes in Settings while the events are still queued.
        ConsentService.shared.analyticsConsent = false
        await service.flushPendingEvents()

        XCTAssertEqual(
            service.pendingEventCountForTesting, 0,
            "Telemetry the user refused must be dropped, not held for the next reconnect."
        )
    }

    func testAbsentConsentDropsQueuedTelemetryOnFlush() async {
        // Never answered is not consent.
        UserDefaults.standard.removeObject(forKey: "gdpr_consent_analytics")
        let service = makeService()
        service.seedPendingImpressionForTesting()

        await service.flushPendingEvents()

        XCTAssertEqual(service.pendingEventCountForTesting, 0)
    }

    func testGrantedConsentKeepsQueuedTelemetryWhenItCannotBeSent() async throws {
        // Only meaningful with no client to send through. CI injects no secrets
        // so this runs there; a local build with real credentials skips it
        // rather than posting test rows at the production database.
        try XCTSkipUnless(SupabaseService.shared.client == nil, "Requires an unconfigured Supabase client.")

        ConsentService.shared.analyticsConsent = true
        let service = makeService()
        service.seedPendingImpressionForTesting()

        // The flush cannot send, so the queue must survive - dropping it here
        // would lose real impressions on any launch that starts offline.
        await service.flushPendingEvents()

        XCTAssertEqual(service.pendingEventCountForTesting, 1)
    }

    func testDroppedQueueIsPersisted() async {
        ConsentService.shared.analyticsConsent = true
        let service = makeService()
        service.seedPendingImpressionForTesting()
        ConsentService.shared.analyticsConsent = false
        await service.flushPendingEvents()

        // A fresh instance reads the queue back from disk. If the drop were
        // in-memory only, the events would return on the next launch.
        let reloaded = AdTrackingService(testDefaults: suite)
        XCTAssertEqual(reloaded.pendingEventCountForTesting, 0)
    }

    func testQueueSurvivesAcrossInstancesWhenConsentIsGranted() {
        ConsentService.shared.analyticsConsent = true
        let service = makeService()
        service.seedPendingImpressionForTesting()
        service.seedPendingImpressionForTesting(campaignId: "c2", creativeId: "cr2")

        let reloaded = AdTrackingService(testDefaults: suite)
        XCTAssertEqual(reloaded.pendingEventCountForTesting, 2)
    }

    func testTheTestSuiteIsIsolatedFromStandardDefaults() {
        let before = UserDefaults.standard.data(forKey: "ad_pending_events_v1")

        ConsentService.shared.analyticsConsent = true
        let service = makeService()
        service.seedPendingImpressionForTesting()

        // The queue must land in the injected suite, not the runner's real
        // defaults - otherwise these tests would overwrite the app's own queue.
        XCTAssertEqual(UserDefaults.standard.data(forKey: "ad_pending_events_v1"), before)
        XCTAssertNotNil(suite.data(forKey: "ad_pending_events_v1"))
    }
}
