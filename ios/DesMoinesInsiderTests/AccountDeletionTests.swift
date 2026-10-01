import XCTest
@testable import DesMoinesInsider

/// IOS-DD-ACCOUNT-08: the server's refusal reason and the store-subscription
/// warning reach the user.
@MainActor
final class AccountDeletionTests: XCTestCase {

    func testBillingRefusalCarriesTheServerMessage() {
        let body = #"{"error":"Card processor down","code":"BILLING_TEARDOWN_FAILED"}"#.data(using: .utf8)!
        let error = AccountDeletionService.decodeFailure(status: 409, data: body)

        XCTAssertEqual(error.errorDescription, "Card processor down")
        XCTAssertTrue(error.offersManageSubscription)
    }

    /// A failed lookup is transient and its message says "try again", so it
    /// keeps Try Again rather than sending the user to billing.
    func testSubscriptionLookupRefusalKeepsTryAgain() {
        let body = #"{"error":"We could not read your subscription","code":"SUBSCRIPTION_LOOKUP_FAILED"}"#.data(using: .utf8)!
        let error = AccountDeletionService.decodeFailure(status: 503, data: body)
        XCTAssertEqual(error.errorDescription, "We could not read your subscription")
        XCTAssertFalse(error.offersManageSubscription)
    }

    func testOtherRefusalDoesNotOfferManageSubscription() {
        let body = #"{"error":"Invalid or expired confirmation token","code":"BAD_TOKEN"}"#.data(using: .utf8)!
        XCTAssertFalse(AccountDeletionService.decodeFailure(status: 403, data: body).offersManageSubscription)
    }

    func testUndecodableBodyFallsBackToGenericCopy() {
        let error = AccountDeletionService.decodeFailure(status: 500, data: Data("<html>".utf8))
        XCTAssertEqual(
            error.errorDescription,
            AccountDeletionService.DeletionError.notConfirmed.errorDescription
        )
        XCTAssertFalse(error.offersManageSubscription)
    }

    func testConfirmResponseDecodesStoreSubscriptions() throws {
        let json = #"{"success":true,"complete":true,"store_subscriptions_still_active":[{"platform":"ios","manageUrl":"x"}]}"#
        let response = try JSONDecoder().decode(
            AccountDeletionService.ConfirmResponse.self,
            from: Data(json.utf8)
        )
        XCTAssertEqual(response.success, true)
        XCTAssertEqual(response.storeSubscriptionsStillActive?.count, 1)
        XCTAssertEqual(response.storeSubscriptionsStillActive?.first?.platform, "ios")
        XCTAssertEqual(response.storeSubscriptionsStillActive?.first?.manageUrl, "x")
    }

    func testNoticeOnlyWhenSomethingIsStillBilling() {
        XCTAssertNil(AccountDeletionService.notice(for: []))
        XCTAssertEqual(
            AccountDeletionService.notice(for: [.init(platform: "ios", manageUrl: nil)]),
            AccountDeletionService.storeSubscriptionNotice
        )
    }
}
