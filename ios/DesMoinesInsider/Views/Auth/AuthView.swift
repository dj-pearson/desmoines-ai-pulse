import SwiftUI
import AuthenticationServices

/// Authentication view with sign in, sign up tabs, and Apple Sign-In.
struct AuthView: View {
    @State private var viewModel = AuthViewModel()
    @State private var isSignUpMode = false
    @State private var showPassword = false
    @State private var showConfirmPassword = false
    @Environment(\.dismiss) private var dismiss

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

                // Form
                VStack(spacing: 14) {
                    if isSignUpMode {
                        HStack(spacing: 12) {
                            TextField("First Name", text: $viewModel.firstName)
                                .textContentType(.givenName)
                                .textFieldStyle(.glassInput)
                            TextField("Last Name", text: $viewModel.lastName)
                                .textContentType(.familyName)
                                .textFieldStyle(.glassInput)
                        }
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        TextField("Email", text: $viewModel.email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .autocapitalization(.none)
                            .textFieldStyle(.glassInput)

                        if !viewModel.email.isEmpty && !viewModel.isEmailValid {
                            Text("Please enter a valid email address")
                                .font(.caption)
                                .foregroundStyle(.red)
                                .accessibilityLabel("Email validation error: invalid email format")
                        }
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        passwordField(
                            title: "Password",
                            text: $viewModel.password,
                            isVisible: $showPassword,
                            contentType: isSignUpMode ? .newPassword : .password
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
                                contentType: .newPassword
                            )

                            if !viewModel.confirmPassword.isEmpty && !viewModel.passwordsMatch {
                                Text("Passwords do not match")
                                    .font(.caption)
                                    .foregroundStyle(.red)
                                    .accessibilityLabel("Password validation error: passwords do not match")
                            }
                        }

                        interestsSection
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
                        Task { await viewModel.resetPassword() }
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
                .signInWithAppleButtonStyle(.black)
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
        .alert("Sign In Error", isPresented: $viewModel.showError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.errorMessage ?? "Something went wrong.")
        }
        .alert("Check Your Email", isPresented: $viewModel.showVerificationAlert) {
            Button("OK", role: .cancel) { dismiss() }
        } message: {
            Text("We've sent a verification link to your email. Please verify your account to continue.")
        }
        .alert("Email Sent", isPresented: $viewModel.showInfo) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.infoMessage ?? "")
        }
    }

    // MARK: - Password field with show/hide toggle (IOS-AUDIT-UX-008)

    @ViewBuilder
    private func passwordField(
        title: String,
        text: Binding<String>,
        isVisible: Binding<Bool>,
        contentType: UITextContentType
    ) -> some View {
        Group {
            if isVisible.wrappedValue {
                TextField(title, text: text)
            } else {
                SecureField(title, text: text)
            }
        }
        .textContentType(contentType)
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

    // MARK: - Interests Section

    private var interestsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("What interests you?")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 80), spacing: 8)], spacing: 8) {
                ForEach(AuthViewModel.availableInterests, id: \.self) { interest in
                    Button {
                        if viewModel.selectedInterests.contains(interest) {
                            viewModel.selectedInterests.remove(interest)
                        } else {
                            viewModel.selectedInterests.insert(interest)
                        }
                    } label: {
                        Text(interest)
                            .font(.caption.weight(.medium))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .frame(maxWidth: .infinity)
                            .background(
                                viewModel.selectedInterests.contains(interest)
                                    ? Color.accentColor.opacity(0.15)
                                    : Color(.systemGray6)
                            )
                            .foregroundStyle(
                                viewModel.selectedInterests.contains(interest)
                                    ? Color.accentColor
                                    : Color.primary
                            )
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(viewModel.selectedInterests.contains(interest) ? .isSelected : [])
                    .accessibilityLabel(interest)
                }
            }
        }
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

private struct PasswordStrengthBar: View {
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
