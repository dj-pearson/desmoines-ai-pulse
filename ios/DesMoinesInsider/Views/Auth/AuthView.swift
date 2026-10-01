import SwiftUI
import AuthenticationServices

/// Authentication view with sign in, sign up tabs, and Apple Sign-In.
struct AuthView: View {
    /// True when presented in a sheet (MainTabView), which has no back button,
    /// so the view adds its own Cancel (IOS-DD-ACCOUNT-15).
    var isModal = false

    @State private var viewModel = AuthViewModel()
    @State private var isSignUpMode = false
    @State private var showPassword = false
    @State private var showConfirmPassword = false
    @FocusState private var emailFocused: Bool
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.openURL) private var openURL

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Logo / Header
                VStack(spacing: 10) {
                    Image("AppLogo")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 180)

                    Text(isSignUpMode ? "Create your account" : "Welcome back")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 20)

                // Toggle
                Picker("Authentication mode", selection: $isSignUpMode) {
                    Text("Sign In").tag(false)
                    Text("Sign Up").tag(true)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .accessibilityLabel("Choose sign in or sign up")

                if let pending = viewModel.pendingVerificationEmail {
                    checkInboxPanel(email: pending)
                        .padding(.horizontal)
                }

                // Form
                VStack(spacing: 14) {
                    if isSignUpMode {
                        HStack(spacing: 12) {
                            TextField("First Name", text: $viewModel.firstName)
                                .textContentType(.givenName)
                                .submitLabel(.next)
                                .textFieldStyle(.glassInput)
                            TextField("Last Name", text: $viewModel.lastName)
                                .textContentType(.familyName)
                                .submitLabel(.next)
                                .textFieldStyle(.glassInput)
                        }
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        TextField("Email", text: $viewModel.email)
                            .textContentType(.emailAddress)
                            .submitLabel(.next)
                            .keyboardType(.emailAddress)
                            .autocapitalization(.none)
                            .textFieldStyle(.glassInput)
                            .focused($emailFocused)

                        if !viewModel.email.isEmpty && !viewModel.isEmailValid {
                            Text("Please enter a valid email address")
                                .font(.caption)
                                .foregroundStyle(.red)
                                .accessibilityLabel("Email validation error: invalid email format")
                        } else if let hint = viewModel.emailFieldHint {
                            Text(hint)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        passwordField(
                            title: "Password",
                            text: $viewModel.password,
                            isVisible: $showPassword,
                            contentType: isSignUpMode ? .newPassword : .password,
                            // Sign-in ends here; sign-up still has Confirm below.
                            isFinalField: !isSignUpMode
                        )
                        .accessibilityHint(isSignUpMode ? "Must be at least 8 characters with uppercase, lowercase, and a number" : "")

                        if isSignUpMode && !viewModel.password.isEmpty {
                            PasswordStrengthBar(strength: viewModel.passwordStrength)
                        }
                    }

                    if isSignUpMode {
                        VStack(alignment: .leading, spacing: 4) {
                            passwordField(
                                title: "Confirm Password",
                                text: $viewModel.confirmPassword,
                                isVisible: $showConfirmPassword,
                                contentType: .newPassword,
                                isFinalField: true
                            )

                            if !viewModel.confirmPassword.isEmpty && !viewModel.passwordsMatch {
                                Text("Passwords do not match")
                                    .font(.caption)
                                    .foregroundStyle(.red)
                                    .accessibilityLabel("Password validation error: passwords do not match")
                            }
                        }

                        // Interests are asked in onboarding now; the form only
                        // asks for the marketing opt-in (IOS-DD-ACCOUNT-01).
                        Toggle("Email me weekly Des Moines picks", isOn: $viewModel.emailOptIn)
                            .font(.subheadline)
                            .tint(Color.accentColor)
                    }

                    // Lockout warning
                    if viewModel.isLockedOut {
                        HStack(spacing: 6) {
                            Image(systemName: "lock.fill")
                                .foregroundStyle(.red)
                            Text("Too many attempts. Try again in \(viewModel.lockoutSecondsRemaining)s")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.red)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityElement(children: .combine)
                    }
                }
                .padding(.horizontal)

                // Primary action
                Button {
                    submit()
                } label: {
                    Text(isSignUpMode ? "Create Account" : "Sign In")
                }
                .buttonStyle(.brandPrimary)
                // Announces "Loading", dims, and disables while submitting (UX-008).
                .brandLoading(viewModel.isSigningIn || viewModel.isSigningUp)
                .disabled(viewModel.isLockedOut)
                .padding(.horizontal)

                // Forgot password
                if !isSignUpMode {
                    Button {
                        Task {
                            await viewModel.resetPassword()
                            if viewModel.emailFieldHint != nil {
                                emailFocused = true
                            }
                        }
                    } label: {
                        Text("Forgot Password?")
                            .font(.subheadline)
                            .foregroundStyle(Color.accentColor)
                    }
                }

                // Divider
                HStack {
                    Rectangle().fill(Color(.separator)).frame(height: 1)
                    Text("or")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Rectangle().fill(Color(.separator)).frame(height: 1)
                }
                .padding(.horizontal)

                // Apple Sign-In
                SignInWithAppleButton(.signIn) { request in
                    request.requestedScopes = [.fullName, .email]
                    // Generate nonce and set its SHA-256 hash on the request.
                    // Supabase requires the raw nonce + hashed nonce in id_token to match.
                    let nonce = AuthService.shared.generateNonce()
                    request.nonce = AuthService.sha256(nonce)
                } onCompletion: { result in
                    Task {
                        await viewModel.handleAppleSignIn(result: result)
                        if viewModel.isAuthenticated {
                            dismiss()
                        }
                    }
                }
                // Black on a dark background disappeared (IOS-DD-ACCOUNT-15).
                // The button does not restyle in place, so `.id` rebuilds it.
                .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                .id(colorScheme)
                .frame(height: 50)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal)
            }
            .padding(.bottom, 40)
        }
        // Let the user dismiss the keyboard by dragging; in sign-up mode the
        // lower fields + Create Account button sit below it (IOS-AUDIT-UX-045).
        .scrollDismissesKeyboard(.interactively)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if isModal {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .alert(isSignUpMode ? "Couldn't Create Account" : "Couldn't Sign In", isPresented: $viewModel.showError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.errorMessage ?? "Something went wrong.")
        }
        .alert("Check Your Email", isPresented: $viewModel.showVerificationAlert) {
            // With an address pending, stay: the inline panel carries Resend
            // and Open Mail. Dismissing used to drop the address entirely.
            Button("OK", role: .cancel) {
                if viewModel.pendingVerificationEmail == nil { dismiss() }
            }
        } message: {
            Text("If that address can be used for a new account, a confirmation link is on its way. Open it on this iPhone to finish signing up.")
        }
        .alert("Email Sent", isPresented: $viewModel.showInfo) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.infoMessage ?? "")
        }
    }

    // MARK: - Password field with show/hide toggle (IOS-AUDIT-UX-008)

    /// The form's primary action, shared by the button and by the keyboard's
    /// submit key (IOS-AUDIT-UX-045 AC3).
    ///
    /// Extracted rather than duplicated: a `.go` submit label that does nothing
    /// when pressed is worse than no label at all, because the keyboard now
    /// advertises an action the form does not perform. Both paths run the same
    /// code, so they cannot drift.
    private func submit() {
        Task {
            if isSignUpMode {
                await viewModel.signUp()
            } else {
                await viewModel.signIn()
            }
            if viewModel.isAuthenticated {
                dismiss()
            }
        }
    }

    @ViewBuilder
    private func passwordField(
        title: String,
        text: Binding<String>,
        isVisible: Binding<Bool>,
        contentType: UITextContentType,
        isFinalField: Bool
    ) -> some View {
        Group {
            if isVisible.wrappedValue {
                TextField(title, text: text)
            } else {
                SecureField(title, text: text)
            }
        }
        .textContentType(contentType)
        // The last field a user fills submits; earlier ones advance. In sign-up
        // the confirm field follows the password, so only confirm is final.
        //
        // A Bool rather than passing a SubmitLabel and comparing it: SwiftUI's
        // SubmitLabel is not Equatable, so `submitLabel == .go` does not compile.
        .submitLabel(isFinalField ? .go : .next)
        .onSubmit { if isFinalField { submit() } }
        .textFieldStyle(.glassInput)
        // Persistent label independent of the placeholder.
        .accessibilityLabel(title)
        .overlay(alignment: .trailing) {
            Button {
                isVisible.wrappedValue.toggle()
            } label: {
                Image(systemName: isVisible.wrappedValue ? "eye.slash.fill" : "eye.fill")
                    .foregroundStyle(.secondary)
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .padding(.trailing, 4)
            .accessibilityLabel(isVisible.wrappedValue ? "Hide \(title.lowercased())" : "Show \(title.lowercased())")
        }
    }

    // MARK: - Check your inbox (IOS-DD-ACCOUNT-06)

    private func checkInboxPanel(email: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Check your inbox", systemImage: "envelope.badge")
                .font(.headline)
            Text("Confirm \(email) with the link we sent, then sign in.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 12) { checkInboxButtons }
                VStack(alignment: .leading, spacing: 8) { checkInboxButtons }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private var checkInboxButtons: some View {
        Button {
            Task { await viewModel.resendVerification() }
        } label: {
            Text(viewModel.resendCooldownRemaining > 0
                 ? "Resend in \(viewModel.resendCooldownRemaining)s"
                 : "Resend link")
                .font(.subheadline.weight(.semibold))
        }
        .disabled(viewModel.resendCooldownRemaining > 0 || viewModel.isResending)
        .minHitTarget()

        Button {
            if let url = URL(string: "message://") { openURL(url) }
        } label: {
            Text("Open Mail").font(.subheadline.weight(.semibold))
        }
        .minHitTarget()

        Button {
            viewModel.clearPendingVerification()
            emailFocused = true
        } label: {
            Text("Use a different email").font(.subheadline)
        }
        .minHitTarget()
    }
}

// MARK: - Rounded Input TextField Style

struct RoundedInputStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 10))
    }
}

extension TextFieldStyle where Self == RoundedInputStyle {
    static var roundedInput: RoundedInputStyle { RoundedInputStyle() }
}

// MARK: - Password Strength Bar

struct PasswordStrengthBar: View {
    let strength: AuthViewModel.PasswordStrength

    private var progress: Double {
        switch strength {
        case .none: return 0
        case .weak: return 0.33
        case .medium: return 0.66
        case .strong: return 1.0
        }
    }

    private var color: Color {
        switch strength {
        case .none: return .gray
        case .weak: return .red
        case .medium: return .orange
        case .strong: return .green
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color(.systemGray5))
                        .frame(height: 4)

                    RoundedRectangle(cornerRadius: 2)
                        .fill(color)
                        .frame(width: geometry.size.width * progress, height: 4)
                        .animation(.easeInOut(duration: 0.2), value: progress)
                }
            }
            .frame(height: 4)

            Text(strength == .none ? "" : strength.rawValue.capitalized)
                .font(.caption2.weight(.medium))
                .foregroundStyle(color)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Password strength: \(strength.rawValue)")
    }
}

#Preview {
    NavigationStack {
        AuthView()
    }
}
