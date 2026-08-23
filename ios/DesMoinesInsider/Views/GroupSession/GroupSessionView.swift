import SwiftUI

/// Entry point for group decision mode. Lets the user host a new shared
/// swipe session or join an existing one by code.
///
/// IOS-DISCOVER-2026-006.
struct GroupSessionView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var service = SwipeSessionService.shared
    @State private var auth = AuthService.shared

    @State private var joinCode: String = ""
    @State private var isWorking = false
    @State private var errorMessage: String?
    @State private var hostedSession: SwipeSessionService.Session?

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                if let hostedSession {
                    hostedSessionCard(hostedSession)
                } else {
                    introBlurb
                    hostSection
                    Divider().padding(.horizontal)
                    joinSection
                }

                Spacer()

                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .padding(.horizontal)
                        .accessibilityLabel("Error: \(errorMessage)")
                }
            }
            .padding(.top, 24)
            .navigationTitle("Group Session")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }

    // MARK: - Intro

    private var introBlurb: some View {
        VStack(spacing: 8) {
            Image(systemName: "person.3.sequence.fill")
                .font(.system(size: 44))
                .foregroundStyle(Color.accentColor.gradient)
                .accessibilityHidden(true)
            Text("Decide together")
                .font(.title2.bold())
            Text("Swipe at the same time — when two of you like the same place, it's a match.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
    }

    // MARK: - Host

    private var hostSection: some View {
        VStack(spacing: 8) {
            Text("Start a new session")
                .font(.headline)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal)
            Button {
                Task { await startHosting() }
            } label: {
                Text(isWorking ? "Creating…" : "Host a session")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 12))
                    .foregroundStyle(.white)
                    .font(.headline)
            }
            .disabled(isWorking || !auth.isAuthenticated)
            .padding(.horizontal)
            if !auth.isAuthenticated {
                Text("Sign in to host. Anyone can join with a code.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Join

    private var joinSection: some View {
        VStack(spacing: 12) {
            Text("Join a session")
                .font(.headline)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal)
            TextField("DSM-AB12", text: $joinCode)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .textFieldStyle(.roundedBorder)
                .padding(.horizontal)
                .accessibilityLabel("Session code")
            // Inline shape validation so an obviously-wrong code is caught
            // before a network round-trip (IOS-AUDIT-UX-033).
            if !joinCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isJoinCodeValid {
                Text("That code doesn't look right. Codes look like DSM-AB12.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal)
            }
            Button {
                Task { await joinExisting() }
            } label: {
                // Mirrors the Host button above, which has said "Creating..."
                // since it shipped. Join was already disabled while working and
                // simply never said so (IOS-AUDIT-UX-053).
                Text(isWorking ? "Joining..." : "Join with code")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.accentColor.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                    .foregroundStyle(Color.accentColor)
                    .font(.subheadline.weight(.semibold))
            }
            .disabled(!isJoinCodeValid || isWorking)
            .padding(.horizontal)
        }
    }

    /// Normalizes the entered code: trims, uppercases, and accepts a bare
    /// 4-character suffix by adding the `DSM-` prefix.
    private var normalizedJoinCode: String {
        var code = joinCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        if code.range(of: "^[A-Z0-9]{4}$", options: .regularExpression) != nil {
            code = "DSM-" + code
        }
        return code
    }

    /// Codes are `DSM-` + 4 alphanumerics (see generate_swipe_session_code).
    private var isJoinCodeValid: Bool {
        normalizedJoinCode.range(of: "^DSM-[A-Z0-9]{4}$", options: .regularExpression) != nil
    }

    // MARK: - Hosted session lobby

    private func hostedSessionCard(_ session: SwipeSessionService.Session) -> some View {
        VStack(spacing: 16) {
            Text("Your session is live")
                .font(.title3.weight(.semibold))
            Text(session.code)
                .font(.system(size: 40, weight: .bold, design: .monospaced))
                .padding(.horizontal, 18)
                .padding(.vertical, 8)
                .background(Color.accentColor.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                .accessibilityLabel("Session code: \(session.code)")
            Text("Share this code with friends. Sessions expire after 4 hours.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            ShareLink(
                item: "Join my Des Moines swipe session — code \(session.code)",
                subject: Text("Let's swipe together"),
            ) {
                Label("Share code", systemImage: "square.and.arrow.up")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 12))
                    .foregroundStyle(.white)
                    .font(.subheadline.weight(.semibold))
            }
            .padding(.horizontal)
            Button(role: .destructive) {
                Task { await endHosting(session) }
            } label: {
                Text("End session")
                    .padding(.vertical, 8)
            }
        }
    }

    // MARK: - Actions

    private func startHosting() async {
        isWorking = true; errorMessage = nil
        defer { isWorking = false }
        do {
            let session = try await service.startSession(mode: "mixed")
            hostedSession = session
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } catch {
            errorMessage = error.localizedDescription
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        }
    }

    private func endHosting(_ session: SwipeSessionService.Session) async {
        isWorking = true
        defer { isWorking = false }
        do {
            try await service.endSession(session)
            hostedSession = nil
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func joinExisting() async {
        isWorking = true; errorMessage = nil
        defer { isWorking = false }
        do {
            let session = try await service.lookupSession(byCode: normalizedJoinCode)
            try await service.join(session: session, displayName: nil)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            dismiss() // The DiscoverView reads activeSession from the service
        } catch {
            errorMessage = error.localizedDescription
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        }
    }
}

#Preview {
    GroupSessionView()
}
