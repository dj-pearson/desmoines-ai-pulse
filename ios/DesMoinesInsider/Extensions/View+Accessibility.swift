import SwiftUI

/// Accessibility helpers for the Mobile UI/UX polish audit.
///
/// Mirrors Android `AccessibilityModifiers.kt`. Prefer these helpers over
/// ad-hoc `.accessibilityLabel(...)` / `.frame(...)` calls so our a11y
/// conventions stay consistent across screens.

extension View {
    /// Guarantee a minimum 44x44 pt touch target as required by
    /// Apple's HIG and WCAG 2.5.5. Apply to any icon-only Button.
    func minHitTarget() -> some View {
        self.frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
    }

    /// Aggregate a card's children into a single accessibility element with
    /// the given label, preventing VoiceOver from reading every sub-view of
    /// a card individually.
    ///
    /// ```swift
    /// CardContent()
    ///     .aggregatedCard(label: event.accessibilityLabel)
    /// ```
    func aggregatedCard(label: String) -> some View {
        self
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(label)
            .accessibilityAddTraits(.isButton)
    }
}

/// Build a compound accessibility label from parts, dropping nil / empty.
/// Example: `a11yLabel("Jazz in July", "Friday 7 PM", nil, "free")`
/// → "Jazz in July. Friday 7 PM. free".
func a11yLabel(_ parts: String?...) -> String {
    parts
        .compactMap { $0 }
        .filter { !$0.isEmpty }
        .joined(separator: ". ")
}
