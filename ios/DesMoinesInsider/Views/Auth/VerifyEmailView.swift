import SwiftUI

/// Interstitial shown after sign-up (and on every subsequent launch) until
/// the user has confirmed their email via the Supabase verification link.
/// Apple Sign-In users skip this screen entirely — their email is pre-verified
/// by Apple.
struct VerifyEmailView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var auth = AuthService.shared
    @State private var isResending = false
    @State private var isChecking = false
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
                        Task { await handleManualCheck() }
                    } label: {
                        HStack {
                            if isChecking { ProgressView().tint(.white) }
                            Label("I've verified — refresh", systemImage: "arrow.clockwise")
                                .font(.subheadline.weight(.medium))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .foregroundStyle(.white)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.white.opacity(0.25), lineWidth: 1)
                        )
                    }
                    .disabled(isChecking)
                    .accessibilityLabel("I've verified my email — check now")

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
        // Poll for verification while the screen is shown AND the app is in the
        // foreground; the app shell routes away automatically once
        // needsEmailVerification flips false. Keying the task on scenePhase
        // suspends polling while backgrounded so we don't fire a refresh every 5s
        // off-screen (IOS-AUDIT-PERF-017); it also makes the "refreshes
        // automatically" copy true when verified on another device (FEAT-020).
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await pollForVerification()
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                Task { await auth.refreshUser() }
            }
        }
        .onDisappear {
            resendTimer?.cancel()
        }
    }

    private func pollForVerification() async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled else { return }
            _ = await auth.refreshUser()
        }
    }

    private func handleManualCheck() async {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        isChecking = true
        defer { isChecking = false }
        let verified = await auth.refreshUser()
        // When verified, the app shell navigates away on its own; otherwise
        // tell the user we're still waiting.
        if !verified {
            showToast("Still waiting — tap the link in your email.")
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
        // Handle the failure path so the button never silently no-ops on a
        // device with no Mail-capable app installed (IOS-AUDIT-UX-046).
        UIApplication.shared.open(url) { success in
            if !success {
                showToast("No mail app found. Check your email in your browser to verify.")
            }
        }
    }
}

#Preview {
    VerifyEmailView()
}
