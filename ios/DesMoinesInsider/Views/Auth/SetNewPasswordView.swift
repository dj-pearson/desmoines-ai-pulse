import SwiftUI

/// Shown after the user opens a password-reset link (IOS-DD-ACCOUNT-07).
///
/// Before this screen existed the link signed the user in and nothing else:
/// no password was ever set, and the app had no change-password UI, so a
/// forgotten password stayed forgotten. The recovery session is a full
/// session, so "Not now" simply carries on into the app.
struct SetNewPasswordView: View {
    @State private var auth = AuthService.shared
    @State private var password = ""
    @State private var confirmation = ""
    @State private var showPassword = false
    @State private var isSaving = false
    @State private var errorMessage: String?

    private var strength: AuthViewModel.PasswordStrength {
        AuthViewModel.strength(of: password)
    }

    /// Same rules as sign-up (AuthViewModel.signUp). nil when saveable.
    static func validationMessage(password: String, confirmation: String) -> String? {
        if password.count < 8 { return "Use at least 8 characters." }
        if AuthViewModel.strength(of: password) == .weak {
            return "Too weak. Mix uppercase, lowercase and numbers."
        }
        if password != confirmation { return "Passwords do not match." }
        return nil
    }

    private var canSave: Bool {
        !isSaving && Self.validationMessage(password: password, confirmation: confirmation) == nil
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Choose a new password")
                        .font(.title2.bold())
                    Text(auth.currentUser?.email.map { "For \($0)" } ?? "For your account")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    Group {
                        if showPassword {
                            TextField("New password", text: $password)
                        } else {
                            SecureField("New password", text: $password)
                        }
                    }
                    .textContentType(.newPassword)
                    .textFieldStyle(.glassInput)
                    .accessibilityLabel("New password")

                    if !password.isEmpty {
                        PasswordStrengthBar(strength: strength)
                    }

                    SecureField("Confirm new password", text: $confirmation)
                        .textContentType(.newPassword)
                        .textFieldStyle(.glassInput)
                        .accessibilityLabel("Confirm new password")

                    Toggle("Show password", isOn: $showPassword)
                        .font(.subheadline)

                    if !password.isEmpty, !confirmation.isEmpty,
                       let message = Self.validationMessage(password: password, confirmation: confirmation) {
                        Text(message)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }

                    Button {
                        Task { await save() }
                    } label: {
                        Text("Save Password")
                    }
                    .buttonStyle(.brandPrimary)
                    .brandLoading(isSaving)
                    .disabled(!canSave)

                    Button("Not now") {
                        auth.dismissPasswordReset()
                    }
                    .font(.subheadline)
                    .frame(maxWidth: .infinity)
                    .minHitTarget()
                }
                .padding()
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationBarTitleDisplayMode(.inline)
            .alert("Couldn't Save Password", isPresented: .init(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    private func save() async {
        guard canSave else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            try await auth.updatePassword(password)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            // This view goes away as soon as the flag clears, so the toast is
            // shown by MainTabView.
            AppToastCenter.shared.show(.success("Password updated"))
        } catch {
            errorMessage = AuthErrorMapper.message(for: AuthErrorMapper.classify(error), mode: .reset)
        }
    }
}

#Preview {
    SetNewPasswordView()
}
