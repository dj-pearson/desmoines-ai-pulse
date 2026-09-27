import SwiftUI

/// Surfaces an orange "session about to expire" banner when SessionTimeoutService
/// is in the .warning state, which only admin sessions reach since
/// IOS-DD-ACCOUNT-02. Tapping "Stay signed in" calls back into the service to
/// reset the idle timer. Hidden in .active and .expired states
/// (the .expired case is handled at the app shell by signing out and showing
/// an alert).
struct SessionTimeoutBanner: View {
    let state: SessionTimeoutService.SessionState
    let onStayActive: () -> Void

    var body: some View {
        if case .warning(let minutesRemaining) = state {
            // Wraps to two lines at large text sizes instead of truncating
            // (IOS-DD-ACCOUNT-14).
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 12) {
                    icon
                    message(minutesRemaining)
                    Spacer(minLength: 8)
                    stayButton
                }
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        icon
                        message(minutesRemaining)
                    }
                    stayButton
                }
            }
            // Black on orange: white caption text on Color.orange is about
            // 2.2:1, well under the 4.5:1 AA floor.
            .foregroundStyle(.black)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.orange)
            .transition(.move(edge: .top).combined(with: .opacity))
            .accessibilityElement(children: .contain)
            .onAppear {
                AccessibilityNotification.Announcement(
                    AttributedString("Session expires in \(minutesRemaining) minutes")
                ).post()
            }
        }
    }

    private var icon: some View {
        Image(systemName: "clock.badge.exclamationmark")
            .font(.callout.weight(.semibold))
            .accessibilityHidden(true)
    }

    private func message(_ minutesRemaining: Int) -> some View {
        Text("Session expires in \(minutesRemaining) min")
            .font(.caption.weight(.medium))
    }

    private var stayButton: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            onStayActive()
        } label: {
            Text("Stay signed in")
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Color.black.opacity(0.12))
                .clipShape(Capsule())
        }
        .minHitTarget()
        .accessibilityLabel("Stay signed in. Resets your inactivity timer.")
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
