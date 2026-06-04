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

    /// Fraction of the view's area currently inside the device screen bounds.
    private func visibleFraction(of frame: CGRect) -> CGFloat {
        guard frame.width > 0, frame.height > 0 else { return 0 }
        let screen = UIScreen.main.bounds
        let intersection = frame.intersection(screen)
        guard !intersection.isNull else { return 0 }
        let visibleArea = intersection.width * intersection.height
        let totalArea = frame.width * frame.height
        return totalArea > 0 ? visibleArea / totalArea : 0
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
