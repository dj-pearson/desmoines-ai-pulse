import SwiftUI
import AuthenticationServices

/// Authentication view with sign in, sign up tabs, and Apple Sign-In.
struct AuthView: View {
    @State private var viewModel = AuthViewModel()
    @State private var isSignUpMode = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Logo / Header
                VStack(spacing: 10) {
                    Image(systemName: "building.2.crop.circle.fill")
                        .font(.system(size: 56))
                        .foregroundStyle(Color.accentColor)

                    Text("Des Moines Insider")
                        .font(.title2.bold())

                    Text(isSignUpMode ? "Create your account" : "Welcome back")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 20)

                // Toggle
                Picker("", selection: $isSignUpMode) {
                    Text("Sign In").tag(false)
                    Text("Sign Up").tag(true)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)

                // Form
                VStack(spacing: 14) {
                    if isSignUpMode {
                        HStack(spacing: 12) {
                            TextField("First Name", text: $viewModel.firstName)
                                .textContentType(.givenName)
                                .textFieldStyle(.roundedInput)
                            TextField("Last Name", text: $viewModel.lastName)
                                .textContentType(.familyName)
                                .textFieldStyle(.roundedInput)
                        }
                    }

                    TextField("Email", text: $viewModel.email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                        .textFieldStyle(.roundedInput)

                    SecureField("Password", text: $viewModel.password)
                        .textContentType(isSignUpMode ? .newPassword : .password)
                        .textFieldStyle(.roundedInput)

                    if isSignUpMode {
                        interestsSection
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
                    HStack {
                        if viewModel.isSigningIn || viewModel.isSigningUp {
                            ProgressView()
                                .tint(.white)
                        }
                        Text(isSignUpMode ? "Create Account" : "Sign In")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 12))
                    .foregroundStyle(.white)
                }
                .disabled(viewModel.isSigningIn || viewModel.isSigningUp)
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
        .navigationBarTitleDisplayMode(.inline)
        .alert("Notice", isPresented: $viewModel.showError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
        .alert("Check Your Email", isPresented: $viewModel.showVerificationAlert) {
            Button("OK", role: .cancel) { dismiss() }
        } message: {
            Text("We've sent a verification link to your email. Please verify your account to continue.")
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

#Preview {
    NavigationStack {
        AuthView()
    }
}
