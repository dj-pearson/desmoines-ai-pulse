import SwiftUI

/// Surfaces a yellow "session about to expire" banner when SessionTimeoutService
/// is in the .warning state. Tapping "Stay signed in" calls back into the
/// service to reset the idle timer. Hidden in .active and .expired states
/// (the .expired case is handled at the app shell by signing out and showing
/// an alert).
struct SessionTimeoutBanner: View {
    let state: SessionTimeoutService.SessionState
    let onStayActive: () -> Void

    var body: some View {
        if case .warning(let minutesRemaining) = state {
            HStack(spacing: 12) {
                Image(systemName: "clock.badge.exclamationmark")
                    .font(.callout.weight(.semibold))
                    .accessibilityHidden(true)

                Text("Session expires in \(minutesRemaining) min")
                    .font(.caption.weight(.medium))
                    .lineLimit(1)

                Spacer(minLength: 8)

                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    onStayActive()
                } label: {
                    Text("Stay signed in")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.white.opacity(0.2))
                        .clipShape(Capsule())
                }
                .minHitTarget()
                .accessibilityLabel("Stay signed in. Resets your inactivity timer.")
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity)
            .background(Color.orange)
            .transition(.move(edge: .top).combined(with: .opacity))
            .accessibilityElement(children: .contain)
        }
    }
}

#Preview("Warning") {
    VStack {
        SessionTimeoutBanner(
            state: .warning(minutesRemaining: 3),
            onStayActive: {}
        )
        Spacer()
    }
}
