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
    }

    // MARK: - Delete Account

    func deleteAccount() async {
        isDeleting = true
        errorMessage = nil

        do {
            guard let client = SupabaseService.shared.client else {
                throw NSError(domain: "ProfileViewModel", code: -1,
                              userInfo: [NSLocalizedDescriptionKey: "Supabase is not configured."])
            }

            let response = try await client.functions.invoke(
                "delete-user-account",
                options: .init(method: .post)
            )

            // Verify success response
            let data = try response.decode(as: [String: Bool].self)
            guard data["success"] == true else {
                throw NSError(domain: "ProfileViewModel", code: -2,
                              userInfo: [NSLocalizedDescriptionKey: "Account deletion failed. Please try again."])
            }

            try await auth.signOut()
        } catch {
            errorMessage = error.localizedDescription
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
