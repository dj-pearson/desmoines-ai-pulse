import SwiftUI

/// Inline error banner with a Retry action, shown above a list when a fetch
/// fails (there may still be cached content beneath it).
///
/// Consolidates the previously-duplicated `errorBanner(_:)` helpers in
/// HomeView / RestaurantsView / AttractionsView (IOS-AUDIT-UX-005) into a single
/// source of truth, and adds VoiceOver-friendly framing (combined element with a
/// clear label + retry hint, decorative icon hidden, 44pt retry target).
struct ErrorBannerView: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.yellow)
                .accessibilityHidden(true)
            Text(message)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
            Spacer()
            Button {
                HapticFeedback.shared.light()
                onRetry()
            } label: {
                Text("Retry")
                    .font(.caption.bold())
                    .foregroundStyle(Color.accentColor)
            }
            .minHitTarget()
        }
        .padding(12)
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 10))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Couldn't load. \(message)")
        .accessibilityHint("Double tap to retry")
    }
}

#Preview {
    ErrorBannerView(message: "The internet connection appears to be offline.") {}
        .padding()
}
