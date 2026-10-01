import StoreKit
import XCTest
@testable import DesMoinesInsider

/// Unit tests for the revenue-critical StoreKit logic (IOS-AUDIT-TEST-001):
/// tier resolution, server-revocation handling, receipt-validation retry
/// classification, and the `validate-ios-receipt` response decode. These cover
/// the pure helpers that the purchase / entitlement-sync paths depend on,
/// without needing live StoreKit transactions or network calls.
@MainActor
final class StoreKitTests: XCTestCase {

    // MARK: - Tier resolution from entitled product IDs

    func testVIPProductResolvesToVIP() {
        let tier = StoreKitService.tier(forEntitledProductIDs: [StoreKitService.vipMonthlyID])
        XCTAssertEqual(tier, .vip)
    }

    func testInsiderProductResolvesToInsider() {
        let tier = StoreKitService.tier(forEntitledProductIDs: [StoreKitService.insiderAnnualID])
        XCTAssertEqual(tier, .insider)
    }

    func testVIPOutranksInsiderWhenBothHeld() {
        let tier = StoreKitService.tier(forEntitledProductIDs: [
            StoreKitService.insiderMonthlyID,
            StoreKitService.vipMonthlyID,
        ])
        XCTAssertEqual(tier, .vip, "Holding both entitlements should resolve to the higher tier")
    }

    func testLegacyProductIDSubstringFallback() {
        XCTAssertEqual(StoreKitService.tier(forEntitledProductIDs: ["legacy_vip_2021"]), .vip)
        XCTAssertEqual(StoreKitService.tier(forEntitledProductIDs: ["old_insider_plan"]), .insider)
    }

    func testEmptyEntitlementsResolveToFree() {
        XCTAssertEqual(StoreKitService.tier(forEntitledProductIDs: []), .free)
    }

    func testUnknownProductResolvesToFree() {
        XCTAssertEqual(StoreKitService.tier(forEntitledProductIDs: ["com.example.unrelated"]), .free)
    }

    /// IOS-AUDIT-SEC-011: a server-revoked product must not keep premium. The
    /// caller subtracts the revoked set before resolving, so an effective set
    /// that excludes the revoked id resolves to free.
    func testRevokedProductSubtractedResolvesToFree() {
        let purchased: Set<String> = [StoreKitService.vipMonthlyID]
        let revoked: Set<String> = [StoreKitService.vipMonthlyID]
        let effective = purchased.subtracting(revoked)
        XCTAssertEqual(StoreKitService.tier(forEntitledProductIDs: effective), .free)
    }

    func testRevokingOneOfTwoEntitlementsKeepsRemainingTier() {
        let purchased: Set<String> = [StoreKitService.vipMonthlyID, StoreKitService.insiderMonthlyID]
        let revoked: Set<String> = [StoreKitService.vipMonthlyID]
        let effective = purchased.subtracting(revoked)
        XCTAssertEqual(StoreKitService.tier(forEntitledProductIDs: effective), .insider)
    }

    // MARK: - Tier resolution from backend plan name (IOS-AUDIT-BUG-003)

    func testPlanNameAnnualVariantsResolveCorrectly() {
        XCTAssertEqual(StoreKitService.tier(forPlanName: "VIP Annual"), .vip)
        XCTAssertEqual(StoreKitService.tier(forPlanName: "Insider Monthly"), .insider)
    }

    func testPlanNameExactAndCaseInsensitive() {
        XCTAssertEqual(StoreKitService.tier(forPlanName: "vip"), .vip)
        XCTAssertEqual(StoreKitService.tier(forPlanName: "INSIDER"), .insider)
    }

    func testPlanNameNilOrUnknownResolvesToFree() {
        XCTAssertEqual(StoreKitService.tier(forPlanName: nil), .free)
        XCTAssertEqual(StoreKitService.tier(forPlanName: "free"), .free)
        XCTAssertEqual(StoreKitService.tier(forPlanName: "Premium Plus"), .free)
    }

    // MARK: - Transient-error classification (retry vs revoke)

    func testNetworkTimeoutIsTransient() {
        let err = NSError(domain: NSURLErrorDomain, code: NSURLErrorTimedOut)
        XCTAssertTrue(StoreKitService.isTransientError(err))
    }

    func testNotConnectedIsTransient() {
        let err = NSError(domain: NSURLErrorDomain, code: NSURLErrorNotConnectedToInternet)
        XCTAssertTrue(StoreKitService.isTransientError(err))
    }

    func testCancelledIsNotTransient() {
        let err = NSError(domain: NSURLErrorDomain, code: NSURLErrorCancelled)
        XCTAssertFalse(StoreKitService.isTransientError(err), "User-cancelled should not be retried")
    }

    func testServer5xxDescriptionIsTransient() {
        let err = NSError(
            domain: "FunctionsError",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "Edge function returned 503 Service Unavailable"]
        )
        XCTAssertTrue(StoreKitService.isTransientError(err))
    }

    func testDefinitiveRejectionIsNotTransient() {
        // A clean validation rejection (e.g. refunded) must NOT be classified as
        // transient — otherwise revocation would be retried away.
        let err = NSError(
            domain: "FunctionsError",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "receipt refunded"]
        )
        XCTAssertFalse(StoreKitService.isTransientError(err))
    }

    // MARK: - validate-ios-receipt response contract (IOS-AUDIT-TEST-003)

    func testValidReceiptDecodesWithEntitlement() throws {
        let json = """
        { "valid": true, "reason": null,
          "entitlement": { "tier": "vip", "expiresAt": "2027-01-01T00:00:00Z" } }
        """.data(using: .utf8)!
        let resp = try JSONDecoder().decode(ValidationResponse.self, from: json)
        XCTAssertTrue(resp.valid)
        XCTAssertEqual(resp.entitlement?.tier, "vip")
        XCTAssertEqual(resp.entitlement?.expiresAt, "2027-01-01T00:00:00Z")
    }

    func testRefundedReceiptDecodesAsInvalidWithReason() throws {
        let json = """
        { "valid": false, "reason": "refunded", "entitlement": null }
        """.data(using: .utf8)!
        let resp = try JSONDecoder().decode(ValidationResponse.self, from: json)
        XCTAssertFalse(resp.valid)
        XCTAssertEqual(resp.reason, "refunded")
        XCTAssertNil(resp.entitlement)
    }

    func testResponseDecodesWithMissingOptionalKeys() throws {
        // Older/leaner edge-function responses omit reason and entitlement.
        let json = """
        { "valid": true }
        """.data(using: .utf8)!
        let resp = try JSONDecoder().decode(ValidationResponse.self, from: json)
        XCTAssertTrue(resp.valid)
        XCTAssertNil(resp.reason)
        XCTAssertNil(resp.entitlement)
    }

    // MARK: - Product ID set integrity

    func testInsiderAndVIPProductSetsAreDisjoint() {
        XCTAssertTrue(
            StoreKitService.insiderProductIDs.isDisjoint(with: StoreKitService.vipProductIDs),
            "A product must not be both Insider and VIP"
        )
    }

    func testProductIDsContainAllTierProducts() {
        XCTAssertTrue(StoreKitService.productIDs.isSuperset(of: StoreKitService.insiderProductIDs))
        XCTAssertTrue(StoreKitService.productIDs.isSuperset(of: StoreKitService.vipProductIDs))
    }
    // MARK: - IOS-DD-MONETIZATION-02: purchases carry the account

    func testPurchaseOptionsCarryAppAccountTokenWhenSignedIn() {
        let uid = UUID()
        let options = StoreKitService.purchaseOptions(for: uid)
        XCTAssertTrue(options.contains(.appAccountToken(uid)))
        XCTAssertEqual(options.count, 1)
        XCTAssertTrue(StoreKitService.purchaseOptions(for: nil).isEmpty,
                      "Signed out there is no account to bind to")
    }

    // MARK: - IOS-DD-MONETIZATION-03: 4xx rejections are classified

    private func body(_ json: String) -> Data { Data(json.utf8) }

    func testRevoked403IsDefinitive() {
        let result = StoreKitService.classifyValidationFailure(
            statusCode: 403,
            body: body(#"{"valid":false,"reason":"Transaction has been revoked"}"#)
        )
        XCTAssertEqual(result, .definitive(reason: "Transaction has been revoked"))
    }

    func testOwnedByAnotherAccountIsAccountMismatch() {
        let result = StoreKitService.classifyValidationFailure(
            statusCode: 409,
            body: body(#"{"valid":false,"reason":"owned_by_another_account"}"#)
        )
        XCTAssertEqual(result, .accountMismatch)
    }

    func testNotFound404KeepsGrace() {
        let result = StoreKitService.classifyValidationFailure(
            statusCode: 404,
            body: body(#"{"valid":false,"reason":"Transaction not found with Apple"}"#)
        )
        XCTAssertEqual(result, .grace, "404 is also a sandbox/production race; it must not revoke")
    }

    func testServerErrorIsTransient() {
        XCTAssertEqual(StoreKitService.classifyValidationFailure(statusCode: 503, body: nil), .transient)
        XCTAssertEqual(StoreKitService.classifyValidationFailure(statusCode: 429, body: nil), .transient)
    }

    func testUnauthorizedKeepsGrace() {
        XCTAssertEqual(StoreKitService.classifyValidationFailure(statusCode: 401, body: nil), .grace)
    }

    func testUserMismatch403KeepsGrace() {
        let result = StoreKitService.classifyValidationFailure(
            statusCode: 403,
            body: body(#"{"valid":false,"reason":"userId does not match authenticated user"}"#)
        )
        XCTAssertEqual(result, .grace, "A session problem is not a bad receipt")
    }

    // MARK: - IOS-DD-MONETIZATION-04: sync after sign-in, once

    func testSyncAfterSignInGating() {
        XCTAssertTrue(StoreKitService.shouldSyncAfterSignIn(
            userId: "u1", alreadySynced: [], hasAppStoreSubscription: true))
        XCTAssertFalse(StoreKitService.shouldSyncAfterSignIn(
            userId: "u1", alreadySynced: ["u1"], hasAppStoreSubscription: true),
            "Once per user per launch")
        XCTAssertFalse(StoreKitService.shouldSyncAfterSignIn(
            userId: "u1", alreadySynced: [], hasAppStoreSubscription: false),
            "Nothing to sync without an App Store subscription")
    }

    // MARK: - IOS-DD-MONETIZATION-06: row entitlement mirrors the server

    private let periodEnd = Date(timeIntervalSince1970: 1_790_000_000)

    private func days(_ n: Int, after date: Date) -> Date {
        Calendar(identifier: .gregorian).date(byAdding: .day, value: n, to: date)!
    }

    func testActiveWithoutDateIsEntitled() {
        XCTAssertTrue(StoreKitService.isRowEntitled(status: "active", currentPeriodEnd: nil))
    }

    func testTrialingIsEntitled() {
        XCTAssertTrue(StoreKitService.isRowEntitled(status: "trialing", currentPeriodEnd: nil))
    }

    func testPastDueInsideGraceIsEntitled() {
        XCTAssertTrue(StoreKitService.isRowEntitled(
            status: "past_due", currentPeriodEnd: periodEnd, now: days(13, after: periodEnd)))
    }

    func testPastDueAfterGraceIsNotEntitled() {
        XCTAssertFalse(StoreKitService.isRowEntitled(
            status: "past_due", currentPeriodEnd: periodEnd, now: days(15, after: periodEnd)))
    }

    func testPastDueWithoutEndIsNotEntitled() {
        XCTAssertFalse(StoreKitService.isRowEntitled(status: "past_due", currentPeriodEnd: nil))
    }

    func testCanceledAndExpiredAreNotEntitled() {
        XCTAssertFalse(StoreKitService.isRowEntitled(status: "canceled", currentPeriodEnd: periodEnd))
        XCTAssertFalse(StoreKitService.isRowEntitled(status: "expired", currentPeriodEnd: periodEnd))
    }

    func testTimestampParsesWithAndWithoutFraction() {
        XCTAssertNotNil(StoreKitService.parseTimestamp("2026-09-30T12:00:00.123456+00:00"))
        XCTAssertNotNil(StoreKitService.parseTimestamp("2026-09-30T12:00:00+00:00"))
        XCTAssertNil(StoreKitService.parseTimestamp(""))
    }
}
