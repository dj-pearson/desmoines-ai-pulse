import Foundation

/// ViewModel for the profile/settings screen.
@MainActor
@Observable
final class ProfileViewModel {
    var firstName = ""
    var lastName = ""
    var email = ""
    var phone = ""
    var location = ""
    var selectedInterests: Set<String> = []

    private(set) var isSaving = false
    private(set) var isDeleting = false
    private(set) var errorMessage: String?

    /// True when the CURRENT errorMessage came from a failed deletion.
    ///
    /// ProfileView shows one shared "Error" alert for profile saves and for
    /// deletion, so a bare Retry button there would offer to retry the wrong
    /// thing (IOS-AUDIT-BUG-018 AC3).
    private(set) var deletionFailed = false
    var showSaveSuccess = false
    var showDeleteConfirmation = false

    private let auth = AuthService.shared

    var isAuthenticated: Bool { auth.isAuthenticated }
    var profile: UserProfile? { auth.currentProfile }
    var displayName: String { profile?.displayName ?? "Guest" }
    var initials: String { profile?.initials ?? "?" }

    // MARK: - Load Profile Data

    func loadProfile() {
        guard let profile = auth.currentProfile else { return }
        firstName = profile.firstName ?? ""
        lastName = profile.lastName ?? ""
        email = profile.email ?? ""
        phone = profile.phone ?? ""
        location = profile.location ?? ""
        selectedInterests = Set(profile.interests ?? [])
    }

    // MARK: - Save Profile

    func saveProfile() async {
        isSaving = true
        errorMessage = nil

        do {
            try await auth.updateProfile(
                firstName: firstName.isEmpty ? nil : firstName,
                lastName: lastName.isEmpty ? nil : lastName,
                phone: phone.isEmpty ? nil : phone,
                location: location.isEmpty ? nil : location,
                interests: selectedInterests.isEmpty ? nil : Array(selectedInterests)
            )
            showSaveSuccess = true
        } catch {
            errorMessage = error.localizedDescription
        }

        isSaving = false
    }

    // MARK: - Clear Error

    func clearError() {
        errorMessage = nil
        deletionFailed = false
    }

    // MARK: - Delete Account

    func deleteAccount() async {
        isDeleting = true
        errorMessage = nil
        deletionFailed = false

        do {
            // XPLAT-001: this used to POST an empty body, which the edge
            // function has rejected with a 400 since the two-step token flow
            // landed. AccountDeletionService speaks the current contract and is
            // shared with SettingsView.
            // IOS-AUDIT-BUG-018 AC2: the sign-out is inside the service and is
            // best effort, so a failing sign-out after a SUCCESSFUL delete is no
            // longer reported to the user as a failed deletion.
            try await AccountDeletionService.shared.deleteAccountAndSignOut()
        } catch {
            errorMessage = error.localizedDescription
            deletionFailed = true
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
