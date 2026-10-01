import Foundation
import UIKit

/// ViewModel for the profile/settings screen.
@MainActor
@Observable
final class ProfileViewModel {
    var firstName = ""
    var lastName = ""
    var email = ""
    var phone = ""
    var location = ""
    /// Interest ids (InterestCatalog), never display strings.
    var selectedInterests: Set<String> = []

    /// What the form held when it was last loaded from the profile. Save is
    /// only enabled when something differs (IOS-DD-ACCOUNT-09).
    struct Snapshot: Equatable {
        var firstName = ""
        var lastName = ""
        var phone = ""
        var location = ""
        var interests: Set<String> = []
    }
    private(set) var savedSnapshot = Snapshot()

    var isDirty: Bool { currentSnapshot != savedSnapshot }

    private var currentSnapshot: Snapshot {
        Snapshot(
            firstName: firstName,
            lastName: lastName,
            phone: phone,
            location: location,
            interests: selectedInterests
        )
    }

    /// Ids still on the profile that this build has no chip for (written by a
    /// newer client or the web). Shown as extra chips so they are never
    /// silently dropped on save.
    var unknownInterestIds: [String] {
        selectedInterests
            .filter { InterestCatalog.option(for: $0) == nil }
            .sorted()
    }

    private(set) var isSaving = false
    private(set) var isDeleting = false
    private(set) var errorMessage: String?

    /// True when the CURRENT errorMessage came from a failed deletion.
    ///
    /// ProfileView shows one shared "Error" alert for profile saves and for
    /// deletion, so a bare Retry button there would offer to retry the wrong
    /// thing (IOS-AUDIT-BUG-018 AC3).
    private(set) var deletionFailed = false

    /// The typed deletion failure, so the alert can offer Manage
    /// Subscription for the billing refusals (IOS-DD-ACCOUNT-08).
    private(set) var lastDeletionError: AccountDeletionService.DeletionError?
    /// "Profile saved" toast after a successful save.
    var toast: ToastMessage?
    var showDeleteConfirmation = false
    /// Set after a deletion whose server reply listed store subscriptions it
    /// could not cancel (IOS-DD-ACCOUNT-08). The view shows it once.
    var postDeletionNotice: String?

    private let auth = AuthService.shared

    var isAuthenticated: Bool { auth.isAuthenticated }
    var profile: UserProfile? { auth.currentProfile }
    var displayName: String { profile?.displayName ?? "Guest" }
    var initials: String { profile?.initials ?? "?" }

    // MARK: - Load Profile Data

    /// Loads the form from the current profile. With no profile (signed out,
    /// or the next account's fetch has not landed) the form is EMPTIED: it
    /// used to keep the previous account's name and phone, and a Save would
    /// write them onto the new account (IOS-DD-ACCOUNT-09).
    func loadProfile() {
        guard let profile = auth.currentProfile else {
            firstName = ""
            lastName = ""
            email = ""
            phone = ""
            location = ""
            selectedInterests = []
            savedSnapshot = currentSnapshot
            return
        }
        firstName = profile.firstName ?? ""
        lastName = profile.lastName ?? ""
        email = profile.email ?? ""
        phone = profile.phone ?? ""
        location = profile.location ?? ""
        selectedInterests = Set(InterestCatalog.normalize(profile.interests))
        savedSnapshot = currentSnapshot
    }

    /// The same account's profile was refetched (e.g. the sign-in copy of
    /// onboarding interests landed after the form loaded). Reload only when
    /// the user has no unsaved edits: a Save from a stale form would write
    /// the old, empty interests back over the synced ones.
    func profileRefreshed() {
        guard !isDirty else { return }
        loadProfile()
    }

    func toggleInterest(_ id: String) {
        if selectedInterests.contains(id) {
            selectedInterests.remove(id)
        } else {
            selectedInterests.insert(id)
        }
    }

    // MARK: - Save Profile

    func saveProfile() async {
        isSaving = true
        errorMessage = nil

        do {
            // Empty fields go as null now, so clearing a field clears it on
            // the server (ProfileUpdate encodes every key).
            try await auth.updateProfile(
                firstName: Self.nilIfBlank(firstName),
                lastName: Self.nilIfBlank(lastName),
                phone: Self.nilIfBlank(phone),
                location: Self.nilIfBlank(location),
                interests: InterestCatalog.normalize(Array(selectedInterests)).sorted()
            )
            loadProfile()
            toast = .success("Profile saved")
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } catch {
            errorMessage = error.localizedDescription
        }

        isSaving = false
    }

    static func nilIfBlank(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    // MARK: - Clear Error

    func clearError() {
        errorMessage = nil
        deletionFailed = false
        lastDeletionError = nil
    }

    // MARK: - Delete Account

    func deleteAccount() async {
        // Re-authenticate first (IOS-DD-ACCOUNT-08). A cancel is the user
        // changing their mind, not an error.
        guard await AccountDeletionService.confirmIdentity() else { return }

        isDeleting = true
        errorMessage = nil
        deletionFailed = false
        lastDeletionError = nil

        do {
            // XPLAT-001: this used to POST an empty body, which the edge
            // function has rejected with a 400 since the two-step token flow
            // landed. AccountDeletionService speaks the current contract and is
            // shared with SettingsView.
            let result = try await AccountDeletionService.shared.deleteAccount()
            // A store subscription keeps billing after the account is gone.
            // ProfileView shows this after the sign-out (it outlives it).
            postDeletionNotice = AccountDeletionService.notice(for: result.storeSubscriptionsStillActive)
            // IOS-AUDIT-BUG-018 AC2: best effort, so a failing sign-out after a
            // SUCCESSFUL delete is not reported as a failed deletion. signOut
            // purges local state in a defer either way.
            try? await auth.signOut()
        } catch {
            errorMessage = error.localizedDescription
            deletionFailed = true
            lastDeletionError = error as? AccountDeletionService.DeletionError
        }

        isDeleting = false
    }

    // MARK: - Sign Out

    func signOut() async {
        do {
            try await auth.signOut()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
