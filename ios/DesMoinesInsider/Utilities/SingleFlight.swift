import Foundation

/// Coalesces concurrent calls into one execution (IOS-AUDIT-PERF-030).
///
/// The pattern this replaces is `guard !isLoading else { return }`, which looks
/// like deduplication and is not. It DROPS the second caller: that call returns
/// immediately, having done nothing and waited for nothing, so anything written
/// after `await refresh()` runs against whatever state happened to be there. It
/// is only safe when the caller ignores the result entirely, which is a property
/// of today's call sites rather than of the method.
///
/// Here the second caller joins the first and returns when the shared work does,
/// so `await` means the same thing to every caller. One execution either way.
///
/// MainActor-isolated deliberately. The guard it replaces was safe only because
/// ForYouService is @MainActor - two concurrent callers on different threads can
/// both read `isLoading == false` before either writes it, and the bug that
/// produces is a duplicate network round-trip that appears under load and never
/// in testing. Keeping the isolation makes that property explicit instead of
/// inherited.
///
/// NOT a cache. A call that arrives after the previous one finished runs again;
/// this only merges overlap. A freshness window would also stop the second fetch
/// from ForYouRail's `.task` re-firing, and is deliberately not here: it would
/// silently turn the rail's manual refresh button into a no-op.
@MainActor
final class SingleFlight {
    private var inFlight: Task<Void, Never>?

    init() {}

    /// True while an execution is in progress. For tests and diagnostics.
    var isRunning: Bool { inFlight != nil }

    /// Run `work`, or join the run already in progress.
    func run(_ work: @escaping @Sendable () async -> Void) async {
        if let existing = inFlight {
            await existing.value
            return
        }

        // Unstructured on purpose: an unstructured Task does not inherit
        // cancellation, so the caller whose view disappears mid-fetch does not
        // cancel the fetch that other callers have joined.
        let task = Task { await work() }
        inFlight = task
        await task.value
        // No await between the resume above and this line, so a caller arriving
        // in between cannot observe a finished task as in-flight.
        inFlight = nil
    }
}
