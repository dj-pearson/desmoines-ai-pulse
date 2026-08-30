import SwiftUI

// MARK: - IOS-ADS-014 · Viewability gate
//
// Fires `onViewable` exactly once, the first time the modified view has been at
// least `threshold` (0–1) on-screen for `minDuration` seconds. This is the
// SwiftUI equivalent of the web's IntersectionObserver rule in
// `src/lib/tracking.ts` (50% visible for 1s) so in-app ad impressions count on
// the SAME viewability bar as the web — a slot that merely renders off-screen,
// or scrolls past faster than the dwell time, is never counted.
struct AdViewabilityModifier: ViewModifier {
    var threshold: CGFloat = 0.5
    var minDuration: TimeInterval = 1.0
    let onViewable: () -> Void

    @State private var dwellTask: Task<Void, Never>?
    @State private var hasFired = false

    func body(content: Content) -> some View {
        content.background(
            GeometryReader { proxy in
                Color.clear
                    .onAppear { evaluate(proxy.frame(in: .global)) }
                    .onChange(of: proxy.frame(in: .global)) { _, frame in
                        evaluate(frame)
                    }
                    .onDisappear { cancelDwell() }
            }
        )
    }

    private func evaluate(_ frame: CGRect) {
        guard !hasFired else { return }
        if visibleFraction(of: frame) >= threshold {
            startDwellIfNeeded()
        } else {
            cancelDwell()
        }
    }

    /// Fraction of the view's area currently inside the visible window. Uses the
    /// app's own window bounds rather than the deprecated, multi-scene-unsafe
    /// UIScreen.main, so viewability (and billed impressions) is correct under
    /// iPad Split View / Stage Manager (IOS-AUDIT-PERF-015). `.global` frames are
    /// already in this window's coordinate space.
    private func visibleFraction(of frame: CGRect) -> CGFloat {
        guard frame.width > 0, frame.height > 0 else { return 0 }
        let container = Self.activeWindowBounds()
        let intersection = frame.intersection(container)
        guard !intersection.isNull else { return 0 }
        let visibleArea = intersection.width * intersection.height
        let totalArea = frame.width * frame.height
        return totalArea > 0 ? visibleArea / totalArea : 0
    }

    /// The bounds of the foreground-active key window (falls back to any window,
    /// then the scene). Reflects the app's actual visible region in multi-window
    /// layouts, unlike UIScreen.main.
    private static func activeWindowBounds() -> CGRect {
        ActiveWindowBounds.current
    }

    private func startDwellIfNeeded() {
        guard dwellTask == nil, !hasFired else { return }
        dwellTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(minDuration))
            guard !Task.isCancelled, !hasFired else { return }
            hasFired = true
            dwellTask = nil
            onViewable()
        }
    }

    private func cancelDwell() {
        dwellTask?.cancel()
        dwellTask = nil
    }
}

/// Caches the window the app is drawing into, so viewability does not walk the
/// scene graph on every scroll frame (IOS-AUDIT-PERF-028).
///
/// THE WINDOW IS CACHED, NOT ITS BOUNDS, and that distinction is the whole
/// design. Caching a CGRect would be faster still and would quietly break
/// accuracy: a window resized by iPad Split View or Stage Manager posts no
/// notification anyone can subscribe to reliably, so a cached rect would stay
/// wrong until something else invalidated it - and viewability decides which
/// impressions are billed. Reading `bounds` off a cached window is a property
/// access that is always current; walking connectedScenes to find that window
/// is the part that was happening once per ad slot per frame.
///
/// The reference is weak and revalidated against `windowScene`, so a window
/// that is torn down or detached is resolved again rather than returning stale
/// bounds or keeping a dead window alive.
/// Deliberately NOT marked @MainActor: the code that calls it - the modifier's
/// own helpers - is not isolated either, and it already reads
/// UIApplication.shared from the same place. Adding isolation here alone would
/// be a compile error at every call site rather than a safety improvement.
/// All of it runs from SwiftUI layout callbacks, which are on the main actor.
enum ActiveWindowBounds {
    nonisolated(unsafe) private static weak var cached: UIWindow?

    static var current: CGRect {
        if let window = cached, window.windowScene != nil {
            return window.bounds
        }
        let window = resolve()
        cached = window
        return window?.bounds ?? fallbackBounds()
    }

    /// Drops the cached window. For tests, and for any caller that knows the
    /// scene graph changed under it.
    static func invalidate() {
        cached = nil
    }

    private static func resolve() -> UIWindow? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let active = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
        return active?.windows.first { $0.isKeyWindow } ?? active?.windows.first
    }

    private static func fallbackBounds() -> CGRect {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let active = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
        return active?.coordinateSpace.bounds ?? .zero
    }
}

extension View {
    /// Counts an ad impression only once the ad meets the web's viewability bar
    /// (default ≥50% on-screen for ≥1s). See `AdViewabilityModifier` (IOS-ADS-014).
    func trackAdViewability(
        threshold: CGFloat = 0.5,
        minDuration: TimeInterval = 1.0,
        onViewable: @escaping () -> Void
    ) -> some View {
        modifier(AdViewabilityModifier(threshold: threshold, minDuration: minDuration, onViewable: onViewable))
    }
}
