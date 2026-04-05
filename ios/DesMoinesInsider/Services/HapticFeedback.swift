import Foundation
import UIKit
import SwiftUI

/// Contextual haptic feedback service with a semantic API that mirrors
/// the Android `HapticPerformer` one-to-one.
///
/// Prefer calling semantic methods (`success()`, `premiumUnlock()`) instead
/// of raw `UIImpactFeedbackGenerator` so intent is obvious at the call site
/// and both platforms stay in sync.
///
/// Keep in sync with
/// android/app/src/main/java/com/desmoines/aipulse/util/HapticHelper.kt
@MainActor
final class HapticFeedback {
    static let shared = HapticFeedback()

    private let lightGen = UIImpactFeedbackGenerator(style: .light)
    private let mediumGen = UIImpactFeedbackGenerator(style: .medium)
    private let heavyGen = UIImpactFeedbackGenerator(style: .heavy)
    private let selectionGen = UISelectionFeedbackGenerator()
    private let notificationGen = UINotificationFeedbackGenerator()

    private init() {
        // Pre-warm generators so the first call is low-latency.
        [lightGen, mediumGen, heavyGen].forEach { $0.prepare() }
        selectionGen.prepare()
        notificationGen.prepare()
    }

    /// Whether the user has globally enabled haptic feedback.
    /// iOS does not expose a public API for this; we rely on the system
    /// honoring the user's Settings > Sounds & Haptics toggle.
    private var isEnabled: Bool { true }

    // MARK: - Impact

    func light() {
        guard isEnabled else { return }
        lightGen.impactOccurred()
    }

    func medium() {
        guard isEnabled else { return }
        mediumGen.impactOccurred()
    }

    func heavy() {
        guard isEnabled else { return }
        heavyGen.impactOccurred()
    }

    // MARK: - Notification semantics

    func success() {
        guard isEnabled else { return }
        notificationGen.notificationOccurred(.success)
    }

    func warning() {
        guard isEnabled else { return }
        notificationGen.notificationOccurred(.warning)
    }

    func error() {
        guard isEnabled else { return }
        notificationGen.notificationOccurred(.error)
    }

    // MARK: - Selection

    func selection() {
        guard isEnabled else { return }
        selectionGen.selectionChanged()
    }

    // MARK: - Toggle

    func toggleOn() {
        guard isEnabled else { return }
        mediumGen.impactOccurred(intensity: 0.85)
    }

    func toggleOff() {
        guard isEnabled else { return }
        lightGen.impactOccurred(intensity: 0.6)
    }

    // MARK: - Premium

    /// Celebratory double-tap for premium unlock moments.
    /// Matches Android HapticPerformer.premiumUnlock().
    func premiumUnlock() {
        guard isEnabled else { return }
        mediumGen.impactOccurred(intensity: 0.7)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.06) { [weak self] in
            self?.heavyGen.impactOccurred(intensity: 0.9)
        }
    }
}

// MARK: - SwiftUI convenience

extension View {
    /// Fires the given semantic haptic when the closure's trigger changes.
    /// Useful in onChange / onTapGesture sites to keep the call local.
    func haptic(_ action: @escaping (HapticFeedback) -> Void) -> some View {
        self.onAppear { /* generator pre-warm happens in the singleton init */ }
            .simultaneousGesture(TapGesture().onEnded {
                action(HapticFeedback.shared)
            })
    }
}
