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

    // MARK: - Commit direction (IOS-DD-DISCOVER-11)

    private func direction(_ t: (CGFloat, CGFloat), _ p: (CGFloat, CGFloat)) -> SwipeCardStack.CommitDirection? {
        SwipeCardStack.commitDirection(
            translation: CGSize(width: t.0, height: t.1),
            predicted: CGSize(width: p.0, height: p.1),
            threshold: 120
        )
    }

    func testADragPastTheThresholdCommitsRight() {
        XCTAssertEqual(direction((130, 10), (130, 10)), .right)
    }

    func testAClearlyUpwardDragCommitsUp() {
        XCTAssertEqual(direction((-10, -150), (-10, -150)), .up)
    }

    func testAFlingCommitsOnPredictedTravel() {
        XCTAssertEqual(direction((40, 0), (400, 0)), .right)
        XCTAssertEqual(direction((-40, 0), (-400, 0)), .left)
    }

    func testAShortDragSpringsBack() {
        XCTAssertNil(direction((30, 20), (30, 20)))
    }
}
