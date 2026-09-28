import SwiftUI

/// Profile view with user info, settings, and sign out.
struct ProfileView: View {
    @State private var viewModel = ProfileViewModel()
    @State private var storeKit = StoreKitService.shared
    @State private var showSettings = false
    @Environment(\.openURL) private var openURL

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
            // On the Group, not the signed-in List: it is shown after the
            // deletion has signed the user out (IOS-DD-ACCOUNT-08).
            .alert("Account Deleted", isPresented: .init(
                get: { viewModel.postDeletionNotice != nil },
                set: { if !$0 { viewModel.postDeletionNotice = nil } }
            )) {
                Button("Manage Subscription") {
                    Task { await storeKit.showManageSubscriptions() }
                }
                Button("OK", role: .cancel) {}
            } message: {
                Text(viewModel.postDeletionNotice ?? "")
            }
        }
        // The view model outlives a sign-out, so the form is reloaded (and
        // emptied) whenever the account changes, as FavoritesViewModel.clear()
        // does for Saved (IOS-DD-ACCOUNT-09).
        .onChange(of: viewModel.isAuthenticated) { _, _ in
            viewModel.loadProfile()
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

            // Interests first: they are what For You is ranked by, so they are
            // the part of the profile worth filling in (IOS-DD-ACCOUNT-09).
            // Ids from InterestCatalog, plus a chip for any id this build does
            // not know so a save never drops it (IOS-DD-ACCOUNT-03).
            Section {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 8)], spacing: 8) {
                    ForEach(InterestCatalog.all) { option in
                        interestChip(id: option.id, label: option.label, icon: option.icon)
                    }
                    ForEach(viewModel.unknownInterestIds, id: \.self) { id in
                        interestChip(id: id, label: InterestCatalog.label(for: id), icon: "tag")
                    }
                }
                .padding(.vertical, 4)
            } header: {
                Text("Interests")
            } footer: {
                Text("Picks shape For You on Home.")
            }

            // Edit Profile
            Section("Personal Info") {
                TextField("First Name", text: $viewModel.firstName)
                TextField("Last Name", text: $viewModel.lastName)
                TextField("Phone", text: $viewModel.phone)
                    .keyboardType(.phonePad)
                TextField("Location", text: $viewModel.location)
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
                .disabled(viewModel.isSaving || !viewModel.isDirty)
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
        .toastOverlay(message: $viewModel.toast)
        .alert("Delete Account?", isPresented: $viewModel.showDeleteConfirmation) {
            Button("Delete", role: .destructive) {
                Task { await viewModel.deleteAccount() }
            }
            if storeKit.hasAppStoreSubscription {
                Button("Manage Subscription") {
                    Task { await storeKit.showManageSubscriptions() }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(AccountDeletionService.confirmationMessage(hasAppStoreSubscription: storeKit.hasAppStoreSubscription))
        }
        // IOS-AUDIT-BUG-018 AC3: a failed deletion gets a retry. Gated on
        // deletionFailed because this alert is shared with profile-save errors,
        // so an unconditional Retry would offer to delete the account after a
        // failed save.
        .alert(
            viewModel.deletionFailed ? "Couldn't Delete Account" : "Error",
            isPresented: .init(
                get: { viewModel.errorMessage != nil },
                set: { if !$0 { viewModel.clearError() } }
            )
        ) {
            if viewModel.lastDeletionError?.offersManageSubscription == true {
                // The server refused because a subscription is still live;
                // retrying cannot help until it is dealt with.
                Button("Manage Subscription") {
                    openURL(Config.siteURL.appendingPathComponent("subscription"))
                }
            } else if viewModel.deletionFailed {
                Button("Try Again") {
                    Task { await viewModel.deleteAccount() }
                }
            }
            Button(viewModel.deletionFailed ? "Cancel" : "OK", role: .cancel) {}
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
        .task {
            viewModel.loadProfile()
        }
        .onChange(of: viewModel.profile?.userId) { _, _ in
            viewModel.loadProfile()
        }
        // Same account, new interests: the onboarding-interest sync at
        // sign-in refetches after the form has already loaded. Keyed on the
        // interests, not updated_at, because profiles has no updated_at
        // trigger.
        .onChange(of: viewModel.profile?.interests) { _, _ in
            viewModel.profileRefreshed()
        }
    }

    private func interestChip(id: String, label: String, icon: String) -> some View {
        let isSelected = viewModel.selectedInterests.contains(id)
        return Button {
            viewModel.toggleInterest(id)
        } label: {
            Label(label, systemImage: icon)
                .font(.caption.weight(.medium))
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(isSelected ? Color.accentColor.opacity(0.15) : Color(.systemGray6))
                .foregroundStyle(isSelected ? Color.accentColor : .primary)
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .minHitTarget()
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityLabel(label)
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
