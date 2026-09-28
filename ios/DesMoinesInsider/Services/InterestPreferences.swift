import Foundation

/// The interests picked on this device before (or without) signing in
/// (IOS-DD-ACCOUNT-04).
///
/// Onboarding asks "What are you into?" before there is an account, so the
/// answer has to live somewhere that is not `profiles`. On the next sign-in,
/// AuthService copies it to an empty profile; until then it drives the For You
/// rerank on its own.
@MainActor
final class InterestPreferences {
    static let shared = InterestPreferences()

    private static let key = "onboarding_interests_v1"
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    /// Normalized interest ids (see InterestCatalog.normalize).
    var local: [String] {
        get { InterestCatalog.normalize(defaults.stringArray(forKey: Self.key)) }
        set { defaults.set(InterestCatalog.normalize(newValue), forKey: Self.key) }
    }

    /// The profile's interests when it has any (they are the user's latest
    /// word, possibly edited on the web), otherwise the device picks.
    func effectiveInterests(profile: UserProfile?) -> [String] {
        let fromProfile = InterestCatalog.normalize(profile?.interests)
        return fromProfile.isEmpty ? local : fromProfile
    }
}
