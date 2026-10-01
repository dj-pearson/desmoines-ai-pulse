import XCTest
@testable import DesMoinesInsider

/// IOS-DD-SEARCH-13: a recognition callback from an older dictation session
/// must not act on the current one. The recognizer itself cannot be driven in
/// XCTest, so the guard is tested as the pure rule it applies.
@MainActor
final class SpeechDictationGenerationTests: XCTestCase {

    func testStaleCallbackIsIgnored() {
        XCTAssertFalse(SpeechDictationService.shouldApply(callbackGeneration: 1, current: 2))
    }

    func testCurrentCallbackApplies() {
        XCTAssertTrue(SpeechDictationService.shouldApply(callbackGeneration: 2, current: 2))
    }

    func testVocabularyNamesAreasAndVenues() {
        let words = SpeechDictationService.vocabulary
        XCTAssertTrue(words.contains("East Village"))
        XCTAssertTrue(words.contains("Blank Park Zoo"))
        XCTAssertTrue(words.contains(EventCategory.music.displayName))
    }
}
