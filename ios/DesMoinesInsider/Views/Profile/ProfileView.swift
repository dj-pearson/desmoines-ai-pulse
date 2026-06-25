import SwiftUI

/// Profile view with user info, settings, and sign out.
struct ProfileView: View {
    @State private var viewModel = ProfileViewModel()
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isAuthenticated {
                    authenticatedContent
                } else {
                    guestContent
                }
            }
            .navigationTitle("Profile")
            .sheet(isPresented: $showSettings) {
                SettingsView()
            }
        }
    }

    // MARK: - Authenticated Content

    private var authenticatedContent: some View {
        List {
            // Profile Header
            Section {
                HStack(spacing: 16) {
                    // Avatar
                    ZStack {
                        Circle()
                            .fill(Color.accentColor.gradient)
                            .frame(width: 64, height: 64)
                        Text(viewModel.initials)
                            .font(.title2.bold())
                            .foregroundStyle(.white)
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text(viewModel.displayName)
                            .font(.headline)
                        if let email = viewModel.profile?.email {
                            Text(email)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(.vertical, 4)
            }

            // Dashboard — the signed-in home base (IOS-PARITY-007).
            Section {
                NavigationLink {
                    DashboardView(ownsNavigationStack: false)
                } label: {
                    Label("Dashboard", systemImage: "rectangle.stack.person.crop")
                }
            }

            // Subscription Status — prominent upgrade CTA for free users
            Section {
                SubscriptionBanner(style: .full)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            }

            // Edit Profile
            Section("Personal Info") {
                TextField("First Name", text: $viewModel.firstName)
                TextField("Last Name", text: $viewModel.lastName)
                TextField("Phone", text: $viewModel.phone)
                    .keyboardType(.phonePad)
                TextField("Location", text: $viewModel.location)
            }

            // Interests
            Section("Interests") {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 90), spacing: 8)], spacing: 8) {
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
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .frame(maxWidth: .infinity)
                                .background(
                                    viewModel.selectedInterests.contains(interest)
                                        ? Color.accentColor.opacity(0.15)
                                        : Color(.systemGray6)
                                )
                                .foregroundStyle(
                                    viewModel.selectedInterests.contains(interest)
                                        ? Color.accentColor
                                        : .primary
                                )
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    .accessibilityAddTraits(viewModel.selectedInterests.contains(interest) ? .isSelected : [])
                    .accessibilityLabel(interest)
                    }
                }
                .padding(.vertical, 4)
            }

            // Save
            Section {
                Button {
                    Task { await viewModel.saveProfile() }
                } label: {
                    HStack {
                        if viewModel.isSaving {
                            ProgressView().tint(.white)
                        }
                        Text(viewModel.isSaving ? "Saving..." : "Save Changes")
                    }
                }
                .buttonStyle(.brandPrimary)
                .listRowInsets(EdgeInsets(top: 6, leading: 8, bottom: 6, trailing: 8))
                .listRowBackground(Color.clear)
                .disabled(viewModel.isSaving)
            }

            // For Businesses — advertiser-acquisition funnel (IOS-ADS-016).
            // Opens the web advertiser portal in Safari (not StoreKit) because
            // this is advertising for a real-world business, not an in-app good.
            Section("For Businesses") {
                PromoteListingButton(listing: nil, style: .row)
            }

            // App Section
            Section {
                Button {
                    showSettings = true
                } label: {
                    Label("Settings", systemImage: "gearshape")
                }

                Link(destination: Config.siteURL) {
                    Label("Visit Full Website", systemImage: "safari")
                }

                Button(role: .destructive) {
                    Task { await viewModel.signOut() }
                } label: {
                    Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                        .foregroundStyle(.red)
                }
                // Don't let Sign Out race an in-flight delete/save, which both
                // call auth.signOut() (IOS-AUDIT-UX-029).
                .disabled(viewModel.isDeleting || viewModel.isSaving)

                Button(role: .destructive) {
                    viewModel.showDeleteConfirmation = true
                } label: {
                    Label {
                        if viewModel.isDeleting {
                            Text("Deleting Account...")
                        } else {
                            Text("Delete Account")
                        }
                    } icon: {
                        if viewModel.isDeleting {
                            ProgressView()
                        } else {
                            Image(systemName: "trash")
                        }
                    }
                    .foregroundStyle(.red)
                }
                .disabled(viewModel.isDeleting)
                .accessibilityLabel("Delete your account")
            }
        }
        // The phone field uses .phonePad (no return key); without this the user
        // can be stranded with the keyboard covering Save (IOS-AUDIT-UX-039).
        .scrollDismissesKeyboard(.interactively)
        .alert("Profile Updated", isPresented: $viewModel.showSaveSuccess) {
            Button("OK", role: .cancel) {}
        }
        .alert("Delete Account?", isPresented: $viewModel.showDeleteConfirmation) {
            Button("Delete", role: .destructive) {
                Task { await viewModel.deleteAccount() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will permanently delete your account, favorites, and all associated data. This action cannot be undone.")
        }
        .alert("Error", isPresented: .init(
            get: { viewModel.errorMessage != nil },
            set: { if !$0 { viewModel.clearError() } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
        .task {
            viewModel.loadProfile()
        }
        .onChange(of: viewModel.profile?.userId) { _, _ in
            viewModel.loadProfile()
        }
    }

    // MARK: - Guest Content

    private var guestContent: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "person.circle")
                .font(.system(size: 72))
                .foregroundStyle(Color.accentColor.opacity(0.5))

            Text("Welcome to Des Moines Insider")
                .font(.title3.bold())

            Text("Sign in to save favorites, customize your experience, and get personalized recommendations.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            NavigationLink {
                AuthView()
            } label: {
                Text("Sign In or Create Account")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(PremiumTokens.brandGradient)
                    .glassBar(cornerRadius: PremiumTokens.cornerLg, material: .ultraThinMaterial, elevation: PremiumTokens.elevation8)
                    .padding(.horizontal, 40)
            }
            .buttonStyle(.pressableCard)

            // Premium teaser for guests
            SubscriptionBanner(style: .compact)
                .padding(.horizontal, 24)

            Button {
                showSettings = true
            } label: {
                Label("Settings", systemImage: "gearshape")
                    .font(.subheadline)
            }

            Spacer()
        }
    }
}

#Preview {
    ProfileView()
}
