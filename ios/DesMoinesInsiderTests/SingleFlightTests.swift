import XCTest
@testable import DesMoinesInsider

/// IOS-AUDIT-PERF-030 -- the coalescing itself.
///
/// Worth testing directly because the failure is invisible: the `guard
/// !isLoading` this replaces looks like it deduplicates, and the difference only
/// shows up as an extra network round-trip under a race nobody reproduces by
/// hand.
@MainActor
final class SingleFlightTests: XCTestCase {

    /// A gate a test can hold open, so two calls are genuinely concurrent rather
    /// than merely written next to each other. MainActor-isolated like everything
    /// else here.
    @MainActor
    private final class Gate {
        private var continuation: CheckedContinuation<Void, Never>?
        private var opened = false

        func wait() async {
            if opened { return }
            await withCheckedContinuation { continuation = $0 }
        }

        func open() {
            opened = true
            continuation?.resume()
            continuation = nil
        }
    }

    @MainActor
    private final class Counter {
        private(set) var value = 0
        func increment() { value += 1 }
    }

    func testOverlappingCallsRunTheWorkOnce() async {
        let flight = SingleFlight()
        let gate = Gate()
        let runs = Counter()

        let first = Task { @MainActor in
            await flight.run { @MainActor in
                runs.increment()
                await gate.wait()
            }
        }
        // Yield so `first` actually starts and registers before the second call.
        await Task.yield()

        let second = Task { @MainActor in
            await flight.run { @MainActor in runs.increment() }
        }

        await Task.yield()
        gate.open()
        _ = await first.value
        _ = await second.value

        XCTAssertEqual(runs.value, 1)
    }

    func testTheJoinerWaitsForTheWorkRatherThanReturningEarly() async {
        // The behaviour the isLoading guard did NOT have: it returned
        // immediately, so `await refresh()` did not mean the data had arrived.
        let flight = SingleFlight()
        let gate = Gate()
        let finished = Counter()
        let joinerSawFinishedWork = Counter()

        let first = Task { @MainActor in
            await flight.run { @MainActor in
                await gate.wait()
                finished.increment()
            }
        }
        await Task.yield()

        let second = Task { @MainActor in
            await flight.run { @MainActor in }
            if finished.value == 1 { joinerSawFinishedWork.increment() }
        }

        await Task.yield()
        gate.open()
        _ = await first.value
        _ = await second.value

        XCTAssertEqual(joinerSawFinishedWork.value, 1)
    }

    func testACallAfterCompletionRunsAgain() async {
        // Not a cache. Only overlap is merged, which is why the rail's manual
        // refresh button still refreshes.
        let flight = SingleFlight()
        let runs = Counter()

        await flight.run { @MainActor in runs.increment() }
        await flight.run { @MainActor in runs.increment() }

        XCTAssertEqual(runs.value, 2)
        XCTAssertFalse(flight.isRunning)
    }

    func testIsRunningIsFalseOnceTheWorkCompletes() async {
        let flight = SingleFlight()
        await flight.run { @MainActor in }
        XCTAssertFalse(flight.isRunning)
    }
}
