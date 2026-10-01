import XCTest
@testable import DesMoinesInsider

/// IOS-DD-EVENTS-01 (WEB-BE-049): the iOS category filter sends raw values as
/// an `eq`, so they must be exactly the database vocabulary.
final class EventCategoryTests: XCTestCase {

    /// Copied from supabase/functions/_shared/eventCategories.json
    /// ("categories"), in order. If that file changes, this list and
    /// EventCategory change with it.
    private let canonical = [
        "Music", "Sports", "Arts", "Comedy", "Entertainment", "Family", "Food",
        "Markets", "Festival", "Outdoor", "Health", "Community", "Business",
        "Education", "Other",
    ]

    func testRawValuesAreTheCanonicalVocabularyInOrder() {
        XCTAssertEqual(EventCategory.allCases.map(\.rawValue), canonical)
    }

    func testCanonicalStringsDecodeToTheirCase() {
        XCTAssertEqual(EventCategory(from: "Food"), .food)
        XCTAssertEqual(EventCategory(from: "Arts"), .art)
        XCTAssertEqual(EventCategory(from: "Comedy"), .comedy)
        XCTAssertEqual(EventCategory(from: "markets"), .markets)
    }

    func testLegacySpellingsStillLandSomewhereSensible() {
        XCTAssertEqual(EventCategory(from: "Food & Drink"), .food)
        XCTAssertEqual(EventCategory(from: "Art & Culture"), .art)
        XCTAssertEqual(EventCategory(from: "Nightlife"), .entertainment)
        XCTAssertEqual(EventCategory(from: "Charity"), .community)
        XCTAssertEqual(EventCategory(from: "Holiday"), .festival)
        XCTAssertEqual(EventCategory(from: "General"), .other)
    }

    func testWordPrefixNotSubstring() {
        // "Party" contains "art" but is not an arts event.
        XCTAssertEqual(EventCategory(from: "Halloween Party"), .other)
    }

    func testNilAndUnknownFallBackToOther() {
        XCTAssertEqual(EventCategory(from: nil), .other)
        XCTAssertEqual(EventCategory(from: "zzz"), .other)
    }

    func testDisplayNamesReadNaturally() {
        XCTAssertEqual(EventCategory.food.displayName, "Food & Drink")
        XCTAssertEqual(EventCategory.art.displayName, "Arts & Culture")
        XCTAssertEqual(EventCategory.music.displayName, "Music")
    }
}
