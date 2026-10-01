import XCTest
@testable import DesMoinesInsider

/// IOS-DD-RESTAURANTS-06 / 11 / 12: lifecycle status, the local guide's
/// content rules, and the card's VoiceOver label.
final class RestaurantLifecycleTests: XCTestCase {

    private func row(status: String? = nil, business: String? = nil) -> Restaurant {
        var r = Restaurant(id: "r1", name: "Name")
        r.status = status
        r.businessStatus = business
        return r
    }

    // MARK: - Lifecycle

    func testStatusStringsMap() {
        XCTAssertEqual(row(status: "open").lifecycle, .open)
        XCTAssertEqual(row(status: "newly_opened").lifecycle, .newlyOpened)
        XCTAssertEqual(row(status: "opening_soon").lifecycle, .openingSoon)
        XCTAssertEqual(row(status: "announced").lifecycle, .openingSoon)
        XCTAssertEqual(row(status: "coming_soon").lifecycle, .openingSoon)
        XCTAssertEqual(row(status: "closed").lifecycle, .closedPermanently)
        XCTAssertEqual(row(status: "permanently_closed").lifecycle, .closedPermanently)
        XCTAssertEqual(row(status: "closed_permanently").lifecycle, .closedPermanently)
        XCTAssertEqual(row(status: "temporarily_closed").lifecycle, .closedTemporarily)
        XCTAssertEqual(row(status: "closed_temporarily").lifecycle, .closedTemporarily)
    }

    func testNilStatusIsOpen() {
        XCTAssertEqual(row().lifecycle, .open)
    }

    func testBusinessStatusBeatsStatus() {
        XCTAssertEqual(row(status: "newly_opened", business: "CLOSED_PERMANENTLY").lifecycle, .closedPermanently)
        XCTAssertEqual(row(status: "open", business: "CLOSED_TEMPORARILY").lifecycle, .closedTemporarily)
    }

    func testOpeningLabel() {
        var r = row(status: "opening_soon")
        r.openingDate = "2026-10-12"
        XCTAssertEqual(r.openingLabel, "Opens Oct 12")

        r.openingDate = nil
        r.openingTimeframe = "Late fall"
        XCTAssertEqual(r.openingLabel, "Late fall")

        r.openingTimeframe = nil
        XCTAssertEqual(r.openingLabel, "Opening soon")
    }

    // MARK: - Local guide

    func testLocalGuideFactsAreTrimmedAndCapped() {
        var r = row()
        r.geoKeyFacts = ["  One ", "", nil, "Two", "3", "4", "5", "6", "7"]
        XCTAssertEqual(RestaurantLocalGuide.facts(for: r), ["One", "Two", "3", "4", "5", "6"])
    }

    func testLocalGuideHasContent() {
        XCTAssertFalse(RestaurantLocalGuide.hasContent(row()))
        var r = row()
        r.geoSummary = "A burger bar."
        XCTAssertTrue(RestaurantLocalGuide.hasContent(r))
        r.geoSummary = "   "
        XCTAssertFalse(RestaurantLocalGuide.hasContent(r))
    }

    // MARK: - Card label

    func testUnratedRowLabelHasNoNoRating() {
        var r = row()
        r.city = "Des Moines"
        XCTAssertEqual(r.cardAccessibilityLabel, "Name, Des Moines")
    }

    func testRatedModerateRowLabel() {
        var r = row()
        r.city = "Des Moines"
        r.cuisine = "American"
        r.priceRange = "$$"
        r.rating = 4.5
        let label = r.cardAccessibilityLabel
        XCTAssertTrue(label.contains("moderate"))
        XCTAssertTrue(label.contains("rated 4.5"))
        XCTAssertEqual(label, "Name, American, moderate, rated 4.5, Des Moines")
    }

    func testClosedRowLabelSaysSo() {
        var r = row(business: "CLOSED_PERMANENTLY")
        r.city = "Ankeny"
        XCTAssertEqual(r.cardAccessibilityLabel, "Name, Permanently closed, Ankeny")
    }
}
