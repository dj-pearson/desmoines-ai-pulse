import XCTest
@testable import DesMoinesInsider

/// IOS-AUDIT-BUG-010 AC1: a one-shot UI command needs an identity, or a repeat
/// of the same instruction is invisible to onChange.
///
/// SwipeCardStack.Command used to be a bare enum, so two taps of Skip produced
/// the same value and SwiftUI had no change to observe. That was papered over by
/// writing `command = nil` after handling, which only works if the nil is
/// observed before the next tap -- and state changes coalesce within an update
/// cycle, so a fast double tap could go .skip -> .skip with the nil never seen.
final class SwipeCommandTests: XCTestCase {

    func testTwoCommandsOfTheSameActionAreNotEqual() {
        // The whole defect in one assertion: without this, onChange sees nothing
        // when a user taps Skip twice.
        XCTAssertNotEqual(SwipeCardStack.Command.skip(), SwipeCardStack.Command.skip())
    }

    func testCommandsOfDifferentActionsAreNotEqual() {
        XCTAssertNotEqual(SwipeCardStack.Command.skip(), SwipeCardStack.Command.like())
    }

    func testACommandEqualsItself() {
        // Equatable must still be reflexive -- SwiftUI compares the stored value
        // against itself on re-evaluation, and an always-unequal value would
        // re-fire the handler on every render.
        let command = SwipeCardStack.Command.boost()
        XCTAssertEqual(command, command)
    }

    func testActionSurvivesTheTokenWrapper() {
        XCTAssertEqual(SwipeCardStack.Command.skip().action, .skip)
        XCTAssertEqual(SwipeCardStack.Command.like().action, .like)
        XCTAssertEqual(SwipeCardStack.Command.boost().action, .boost)
    }
}
