import XCTest
@testable import DesMoinesInsider

/// IOS-AUDIT-TEST-004 AC2 -- the consent state every telemetry gate reads.
///
/// AdTrackingService.logImpression, logClick and flushPendingEvents, and every
/// AnalyticsService track* helper, all gate on exactly one expression:
/// `ConsentService.shared.analyticsConsent`. These tests pin that value's
/// behaviour, which is the input those guards branch on.
///
/// WHAT THIS DOES NOT COVER, stated rather than implied: it does not assert that
/// a tracking CALL is suppressed. Those call sites reach SupabaseService.shared
/// and NetworkMonitor.shared directly and return nil or void on every path in a
/// unit test, so an assertion on their return value would pass whether or not
/// the gate exists. Proving suppression needs those two behind protocols, which
/// is a larger change than this story and belongs with IOS-AUDIT-TEST-005.
@MainActor
final class ConsentServiceTests: XCTestCase {

    private let keys = [
        "gdpr_consent_completed",
        "gdpr_consent_location",
        "gdpr_consent_email",
        "gdpr_consent_analytics",
    ]

    private var saved: [String: Any?] = [:]

    override func setUp() {
        super.setUp()
        // The service reads UserDefaults.standard with hardcoded keys, so these
        // tests mutate real defaults. Snapshot and restore rather than removing,
        // so a value the runner already held is not destroyed.
        for key in keys { saved[key] = UserDefaults.standard.object(forKey: key) }
        for key in keys { UserDefaults.standard.removeObject(forKey: key) }
    }

    override func tearDown() {
        for key in keys {
            if let value = saved[key] ?? nil {
                UserDefaults.standard.set(value, forKey: key)
            } else {
                UserDefaults.standard.removeObject(forKey: key)
            }
        }
        super.tearDown()
    }

    private var service: ConsentService { ConsentService.shared }

    // MARK: - Persistence

    func testEachConsentRoundTripsThroughDefaults() {
        service.locationConsent = true
        service.emailConsent = true
        service.analyticsConsent = true

        XCTAssertTrue(UserDefaults.standard.bool(forKey: "gdpr_consent_location"))
        XCTAssertTrue(UserDefaults.standard.bool(forKey: "gdpr_consent_email"))
        XCTAssertTrue(UserDefaults.standard.bool(forKey: "gdpr_consent_analytics"))

        XCTAssertTrue(service.locationConsent)
        XCTAssertTrue(service.emailConsent)
        XCTAssertTrue(service.analyticsConsent)
    }

    func testAcceptAllGrantsEverythingAndCompletesTheFlow() {
        service.acceptAll()
        XCTAssertTrue(service.locationConsent)
        XCTAssertTrue(service.emailConsent)
        XCTAssertTrue(service.analyticsConsent)
        XCTAssertTrue(service.hasCompletedConsent)
    }

    // MARK: - Revocation

    func testRevokeAllClearsEveryConsent() {
        service.acceptAll()
        service.revokeAll()
        XCTAssertFalse(service.locationConsent)
        XCTAssertFalse(service.emailConsent)
        XCTAssertFalse(service.analyticsConsent)
    }

    func testRevokeAllDoesNotReopenTheConsentPrompt() {
        // hasCompletedConsent is deliberately left alone by revokeAll. If it were
        // cleared, an EU user who revoked in Settings would be re-prompted on the
        // next launch, and the obvious way to dismiss that prompt is to accept.
        service.acceptAll()
        service.revokeAll()
        XCTAssertTrue(service.hasCompletedConsent)
    }

    func testRevokingAnalyticsIsWhatEveryTelemetryGateReads() {
        // The single expression AdTrackingService and AnalyticsService branch on.
        service.acceptAll()
        XCTAssertTrue(service.analyticsConsent)
        service.revokeAll()
        XCTAssertFalse(service.analyticsConsent)
    }

    // MARK: - Absence

    func testAbsentConsentIsNotGrantedConsent() {
        // With nothing written, bool(forKey:) returns false. Location and email
        // must never default to granted; the analytics default is region-
        // dependent and is covered separately below.
        XCTAssertFalse(service.locationConsent)
        XCTAssertFalse(service.emailConsent)
        XCTAssertFalse(service.hasCompletedConsent)
    }

    func testAnExplicitAnalyticsOptOutSurvivesTheNonEuDefault() {
        // ConsentService's init calls register(defaults:) for non-EU regions so
        // analytics is opt-out there. register() only supplies a value when none
        // was written, so an explicit false must still win - otherwise a Settings
        // opt-out would be undone on the next launch.
        service.analyticsConsent = false
        UserDefaults.standard.register(defaults: ["gdpr_consent_analytics": true])
        XCTAssertFalse(service.analyticsConsent)
    }

    // MARK: - Prompt gating

    func testCompletingTheFlowStopsThePrompt() {
        // needsConsentPrompt is isLikelyEU && !hasCompletedConsent. isLikelyEU
        // depends on the simulator's region, so the assertion is on the half this
        // service controls: once completed, the prompt is off in either region.
        service.acceptAll()
        XCTAssertFalse(service.needsConsentPrompt)
    }

    func testAPromptIsOnlyEverShownToEuRegions() {
        // Nothing completed. If this device is not EU, the prompt must be off
        // regardless; if it is EU, it must be on.
        XCTAssertEqual(service.needsConsentPrompt, service.isLikelyEU)
    }
}
