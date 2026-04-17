import SwiftUI

/// Interstitial shown after sign-up (and on every subsequent launch) until
/// the user has confirmed their email via the Supabase verification link.
/// Apple Sign-In users skip this screen entirely — their email is pre-verified
/// by Apple.
struct VerifyEmailView: View {
    @State private var auth = AuthService.shared
    @State private var isResending = false
    @State private var resendCooldown = 0
    @State private var toastMessage: String?
    @State private var resendTimer: Task<Void, Never>?

    private static let resendCooldownSeconds = 60

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color.black, Color(white: 0.06)],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()

                Image(systemName: "envelope.badge.shield.half.filled")
                    .font(.system(size: 72))
                    .foregroundStyle(Color.accentColor)
                    .symbolRenderingMode(.hierarchical)
                    .accessibilityHidden(true)

                Text("Verify your email")
                    .font(.title.bold())
                    .foregroundStyle(.white)

                VStack(spacing: 6) {
                    Text("We sent a verification link to")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    Text(auth.currentUser?.email ?? "your inbox")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .accessibilityLabel("Verification sent to \(auth.currentUser?.email ?? "your inbox")")
                }

                Text("Tap the link in that email to finish creating your account. This screen will refresh automatically once verification completes.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                VStack(spacing: 12) {
                    Button {
                        Task { await handleResend() }
                    } label: {
                        HStack {
                            if isResending {
                                ProgressView()
                                    .tint(.white)
                            }
                            Text(resendButtonLabel)
                                .font(.headline)
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(resendDisabled ? Color.gray.opacity(0.4) : Color.accentColor)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .disabled(resendDisabled)
                    .accessibilityLabel(resendButtonLabel)

                    Button {
                        openMailApp()
                    } label: {
                        Label("Open Mail app", systemImage: "arrow.up.right.square")
                            .font(.subheadline.weight(.medium))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .foregroundStyle(.white)
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(Color.white.opacity(0.25), lineWidth: 1)
                            )
                    }
                }
                .padding(.horizontal, 32)

                Spacer()

                Button(role: .destructive) {
                    Task { try? await auth.signOut() }
                } label: {
                    Text("Use a different account")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                .padding(.bottom, 24)
                .accessibilityLabel("Sign out and use a different account")
            }
            .padding(.top, 48)

            if let toastMessage {
                VStack {
                    Spacer()
                    Text(toastMessage)
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(.ultraThinMaterial, in: Capsule())
                        .padding(.bottom, 80)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                }
            }
        }
        .onDisappear {
            resendTimer?.cancel()
        }
    }

    private var resendDisabled: Bool {
        isResending || resendCooldown > 0
    }

    private var resendButtonLabel: String {
        if isResending { return "Sending…" }
        if resendCooldown > 0 { return "Resend in \(resendCooldown)s" }
        return "Resend verification email"
    }

    private func handleResend() async {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        isResending = true
        defer { isResending = false }

        do {
            try await auth.resendVerificationEmail()
            showToast("Verification email sent")
            startResendCooldown()
        } catch {
            showToast("Couldn't resend — try again in a minute")
        }
    }

    private func startResendCooldown() {
        resendTimer?.cancel()
        resendCooldown = Self.resendCooldownSeconds
        resendTimer = Task {
            while resendCooldown > 0 {
                try? await Task.sleep(for: .seconds(1))
                guard !Task.isCancelled else { return }
                resendCooldown -= 1
            }
        }
    }

    private func showToast(_ message: String) {
        withAnimation { toastMessage = message }
        Task {
            try? await Task.sleep(for: .seconds(3))
            withAnimation { toastMessage = nil }
        }
    }

    private func openMailApp() {
        guard let url = URL(string: "message://") else { return }
        UIApplication.shared.open(url)
    }
}

#Preview {
    VerifyEmailView()
}
