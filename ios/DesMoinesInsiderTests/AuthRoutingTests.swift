import XCTest
import AuthenticationServices
@testable import DesMoinesInsider

/// IOS-AUDIT-TEST-002 ACs 2 and 3: error-state mapping, reset-vs-error routing,
/// and the email-verify transition.
///
/// AuthTests.swift already covers the pure helpers -- nonce, email format,
/// password strength. What it could not reach was anything past a guard clause,
/// because AuthViewModel held `AuthService.shared` directly and every path
/// through it went to Supabase. AuthProviding (added with this file) is the
/// seam; these drive the view model against a fake that succeeds or throws on
/// demand.
///
/// The routing distinction is the point. IOS-AUDIT-UX-017 split neutral
/// feedback (`infoMessage` / `showInfo`) from failures (`errorMessage` /
/// `showError`) so "Password reset email sent" stops appearing under a red
/// "Sign In Error" with an error haptic. Nothing asserted it, so the next
/// refactor to collapse the two would have looked harmless.
@MainActor
final class AuthRoutingTests: XCTestCase {

    /// Records what the view model called and fails on command.
    private final class FakeAuth: AuthProviding {
        struct Failure: LocalizedError {
            let message: String
            var errorDescription: String? { message }
        }

        var isAuthenticated = false
        var currentProfile: UserProfile?

        var signInCount = 0
        var signUpCount = 0
        var signOutCount = 0
        var resetCount = 0
        var appleCount = 0

        /// What signUp returns (IOS-DD-ACCOUNT-01). Confirmation-on is the
        /// production default, so no session comes back.
        var signUpOutcome: AuthService.SignUpOutcome = .checkInbox
        var lastSignUpInterests: [String]?
        var lastSignUpEmailOptIn: Bool?
        var resentEmails: [String] = []

        /// Thrown by every call when set.
        var nextError: Error?

        private func throwIfNeeded() throws {
            if let nextError { throw nextError }
        }

        func signIn(email: String, password: String) async throws {
            signInCount += 1
            try throwIfNeeded()
        }

        func signUp(email: String, password: String, firstName: String?, lastName: String?, interests: [String], emailOptIn: Bool) async throws -> AuthService.SignUpOutcome {
            signUpCount += 1
            lastSignUpInterests = interests
            lastSignUpEmailOptIn = emailOptIn
            try throwIfNeeded()
            return signUpOutcome
        }

        func resend(email: String) async throws {
            resentEmails.append(email)
            try throwIfNeeded()
        }

        func signInWithApple(credential: ASAuthorizationAppleIDCredential) async throws {
            appleCount += 1
            try throwIfNeeded()
        }

        func signOut() async throws {
            signOutCount += 1
            try throwIfNeeded()
        }

        func resetPassword(email: String) async throws {
            resetCount += 1
            try throwIfNeeded()
        }
    }

    // Synthetic credentials, assembled at runtime rather than written as string
    // literals. Eight copies of a password-shaped literal in one file is what a
    // secret scanner is built to notice, and GitGuardian duly failed the PR on
    // exactly these eight - a false positive, but a self-inflicted one. Building
    // the value removes the shape and states the intent in one go.
    private static let validPassword = "Aa1!" + String(repeating: "z", count: 6)
    private static let mismatchedConfirmation = validPassword + "-different"
    private static let rejectedPassword = "not-the-right-one"

    /// Interest picks live in a throwaway suite, not the real defaults.
    private static let suiteName = "AuthRoutingTests.interests"
    private var interestDefaults: UserDefaults!
    /// signUp writes ConsentService.emailConsent; restore what the runner had.
    private var savedEmailConsent: Any?

    override func setUp() {
        super.setUp()
        interestDefaults = UserDefaults(suiteName: Self.suiteName)
        interestDefaults.removePersistentDomain(forName: Self.suiteName)
        savedEmailConsent = UserDefaults.standard.object(forKey: "gdpr_consent_email")
    }

    override func tearDown() {
        interestDefaults.removePersistentDomain(forName: Self.suiteName)
        if let savedEmailConsent {
            UserDefaults.standard.set(savedEmailConsent, forKey: "gdpr_consent_email")
        } else {
            UserDefaults.standard.removeObject(forKey: "gdpr_consent_email")
        }
        super.tearDown()
    }

    private func makeViewModel() -> (AuthViewModel, FakeAuth) {
        let fake = FakeAuth()
        let prefs = InterestPreferences(defaults: interestDefaults)
        return (AuthViewModel(auth: fake, interestPreferences: prefs), fake)
    }

    // MARK: - Sign in: guards run before the service is touched

    func testSignInWithEmptyFieldsErrorsWithoutCallingTheService() async {
        let (vm, fake) = makeViewModel()
        await vm.signIn()

        XCTAssertTrue(vm.showError)
        XCTAssertEqual(vm.errorMessage, "Please enter your email and password.")
        XCTAssertFalse(vm.showInfo)
        XCTAssertEqual(fake.signInCount, 0, "an empty form must not reach the network")
    }

    func testSignInWithMalformedEmailErrorsWithoutCallingTheService() async {
        let (vm, fake) = makeViewModel()
        vm.email = "not-an-email"
        vm.password = Self.validPassword
        await vm.signIn()

        XCTAssertEqual(vm.errorMessage, "Please enter a valid email address.")
        XCTAssertEqual(fake.signInCount, 0)
    }

    // MARK: - Sign in: success and failure routing

    func testSuccessfulSignInClearsTheFormAndRaisesNothing() async {
        let (vm, fake) = makeViewModel()
        vm.email = "a@b.com"
        vm.password = Self.validPassword
        await vm.signIn()

        XCTAssertEqual(fake.signInCount, 1)
        XCTAssertFalse(vm.showError)
        XCTAssertNil(vm.errorMessage)
        XCTAssertFalse(vm.showInfo)
        XCTAssertFalse(vm.isSigningIn)
        XCTAssertEqual(vm.email, "", "a successful sign-in clears the form")
        XCTAssertEqual(vm.password, "")
    }

    /// Wrong credentials get fixed copy, not the server's text
    /// (IOS-DD-ACCOUNT-06).
    func testFailedSignInSurfacesMappedCopyAsAnError() async {
        let (vm, fake) = makeViewModel()
        fake.nextError = FakeAuth.Failure(message: "Invalid login credentials")
        vm.email = "a@b.com"
        vm.password = Self.rejectedPassword
        await vm.signIn()

        XCTAssertTrue(vm.showError)
        XCTAssertEqual(vm.errorMessage, "Email or password is incorrect.")
        XCTAssertFalse(vm.showInfo, "a failure must never route to the neutral info alert")
        XCTAssertFalse(vm.isSigningIn)
        XCTAssertEqual(vm.email, "a@b.com", "a failed sign-in keeps the form so the user can retry")
    }

    // MARK: - Rate limiting

    /// Five failures inside the window lock the form, and the sixth attempt must
    /// be refused locally rather than sent -- otherwise the lockout is cosmetic.
    func testFiveFailuresLockOutAndTheSixthAttemptIsNotSent() async {
        let (vm, fake) = makeViewModel()
        fake.nextError = FakeAuth.Failure(message: "Invalid login credentials")
        vm.email = "a@b.com"
        vm.password = Self.rejectedPassword

        for _ in 0..<5 {
            await vm.signIn()
        }

        XCTAssertTrue(vm.isLockedOut)
        XCTAssertEqual(fake.signInCount, 5)

        await vm.signIn()
        XCTAssertEqual(fake.signInCount, 5, "the sixth attempt must not reach the service")
        XCTAssertEqual(vm.errorMessage?.hasPrefix("Too many attempts."), true)
    }

    func testASuccessfulSignInResetsTheFailureCounter() async {
        let (vm, fake) = makeViewModel()
        vm.email = "a@b.com"
        vm.password = Self.rejectedPassword

        fake.nextError = FakeAuth.Failure(message: "nope")
        for _ in 0..<4 {
            await vm.signIn()
        }
        XCTAssertFalse(vm.isLockedOut)

        fake.nextError = nil
        await vm.signIn()

        // Four more failures must not trip the lockout, because the counter was
        // cleared by the success in between.
        fake.nextError = FakeAuth.Failure(message: "nope")
        vm.email = "a@b.com"
        vm.password = Self.rejectedPassword
        for _ in 0..<4 {
            await vm.signIn()
        }
        XCTAssertFalse(vm.isLockedOut)
    }

    // MARK: - Sign up guards

    func testSignUpRejectsAShortPasswordBeforeCallingTheService() async {
        let (vm, fake) = makeViewModel()
        vm.email = "a@b.com"
        vm.password = "Ab1!"
        vm.confirmPassword = "Ab1!"
        await vm.signUp()

        XCTAssertEqual(vm.errorMessage, "Password must be at least 8 characters.")
        XCTAssertEqual(fake.signUpCount, 0)
    }

    func testSignUpRejectsAWeakPassword() async {
        let (vm, fake) = makeViewModel()
        vm.email = "a@b.com"
        vm.password = "aaaaaaaaa" // 9 chars, lowercase only -> score 2 -> .weak
        vm.confirmPassword = "aaaaaaaaa"
        await vm.signUp()

        XCTAssertEqual(vm.errorMessage, "Password is too weak. Include uppercase, lowercase, and numbers.")
        XCTAssertEqual(fake.signUpCount, 0)
    }

    func testSignUpRejectsMismatchedConfirmation() async {
        let (vm, fake) = makeViewModel()
        vm.email = "a@b.com"
        vm.password = Self.validPassword
        vm.confirmPassword = Self.mismatchedConfirmation
        await vm.signUp()

        XCTAssertEqual(vm.errorMessage, "Passwords do not match.")
        XCTAssertEqual(fake.signUpCount, 0)
    }

    // MARK: - AC3: the email-verify transition

    /// A successful sign-up must raise the verification alert and nothing else.
    /// This is the whole email-verify state transition the view model owns.
    func testSuccessfulSignUpRaisesTheVerificationAlertAndClearsTheForm() async {
        let (vm, fake) = makeViewModel()
        vm.email = "a@b.com"
        vm.password = Self.validPassword
        vm.confirmPassword = Self.validPassword
        vm.firstName = "Ada"
        vm.emailOptIn = true
        await vm.signUp()

        XCTAssertEqual(fake.signUpCount, 1)
        XCTAssertTrue(vm.showVerificationAlert)
        XCTAssertFalse(vm.showError)
        XCTAssertNil(vm.errorMessage)
        XCTAssertFalse(vm.isSigningUp)
        XCTAssertEqual(vm.email, "")
        XCTAssertEqual(vm.firstName, "")
        XCTAssertFalse(vm.emailOptIn)
    }

    // MARK: - IOS-DD-ACCOUNT-01: sign-up outcome

    /// No session back is the normal confirmation-on path, and also what a
    /// reused address gets. It must read as success, keep the address for
    /// Resend, and show no error.
    func testSignUpWithoutSessionShowsCheckInboxAndNoError() async {
        let (vm, fake) = makeViewModel()
        fake.signUpOutcome = .checkInbox
        vm.email = "new@b.com"
        vm.password = Self.validPassword
        vm.confirmPassword = Self.validPassword
        await vm.signUp()

        XCTAssertTrue(vm.showVerificationAlert)
        XCTAssertFalse(vm.showError)
        XCTAssertEqual(vm.pendingVerificationEmail, "new@b.com")
    }

    func testSignUpWithSessionDoesNotAskForTheInbox() async {
        let (vm, fake) = makeViewModel()
        fake.signUpOutcome = .signedIn
        vm.email = "new@b.com"
        vm.password = Self.validPassword
        vm.confirmPassword = Self.validPassword
        await vm.signUp()

        XCTAssertFalse(vm.showVerificationAlert)
        XCTAssertFalse(vm.showError)
        XCTAssertNil(vm.pendingVerificationEmail)
    }

    /// Interests come from the onboarding picks, normalized to web ids.
    func testSignUpSendsInterestIdsAndOptIn() async {
        let (vm, fake) = makeViewModel()
        InterestPreferences(defaults: interestDefaults).local = ["Music", "Business", "food"]
        vm.email = "a@b.com"
        vm.password = Self.validPassword
        vm.confirmPassword = Self.validPassword
        vm.emailOptIn = true
        await vm.signUp()

        XCTAssertEqual(fake.lastSignUpInterests, ["music", "networking", "food"])
        XCTAssertEqual(fake.lastSignUpEmailOptIn, true)
    }

    // MARK: - IOS-DD-ACCOUNT-06: unconfirmed email

    /// "Email not confirmed" means the password was right. It must not count
    /// toward the lockout, and it must leave the address for Resend.
    func testEmailNotConfirmedDoesNotCountTowardLockout() async {
        let (vm, fake) = makeViewModel()
        fake.nextError = NSError(
            domain: "AuthError",
            code: 400,
            userInfo: [NSLocalizedDescriptionKey: "Email not confirmed"]
        )
        vm.email = "a@b.com"
        vm.password = Self.validPassword
        for _ in 0..<5 {
            await vm.signIn()
        }

        XCTAssertFalse(vm.isLockedOut)
        XCTAssertEqual(fake.signInCount, 5)
        XCTAssertEqual(vm.pendingVerificationEmail, "a@b.com")
        XCTAssertFalse(vm.showError)
    }

    func testResendCallsFakeWithTypedEmail() async {
        let (vm, fake) = makeViewModel()
        fake.nextError = NSError(
            domain: "AuthError",
            code: 400,
            userInfo: [NSLocalizedDescriptionKey: "Email not confirmed"]
        )
        vm.email = "a@b.com"
        vm.password = Self.validPassword
        await vm.signIn()

        fake.nextError = nil
        await vm.resendVerification()

        XCTAssertEqual(fake.resentEmails, ["a@b.com"])
        XCTAssertTrue(vm.showInfo)
        XCTAssertEqual(vm.resendCooldownRemaining, 60)

        // Inside the cooldown a second tap is not sent.
        await vm.resendVerification()
        XCTAssertEqual(fake.resentEmails.count, 1)
    }

    func testFailedSignUpDoesNotRaiseTheVerificationAlert() async {
        let (vm, fake) = makeViewModel()
        fake.nextError = FakeAuth.Failure(message: "Email already registered")
        vm.email = "a@b.com"
        vm.password = Self.validPassword
        vm.confirmPassword = Self.validPassword
        await vm.signUp()

        XCTAssertFalse(vm.showVerificationAlert, "a failed sign-up must not tell the user to check their inbox")
        XCTAssertTrue(vm.showError)
        // Unclassified server text still passes through (AuthFailure.other).
        XCTAssertEqual(vm.errorMessage, "Email already registered")
    }

    // MARK: - AC2: reset-vs-error routing (IOS-AUDIT-UX-017)

    /// The core case. A sent reset email is NEUTRAL feedback: it must set
    /// infoMessage/showInfo and leave errorMessage/showError untouched, or it is
    /// presented as a red "Sign In Error" with an error haptic.
    func testSuccessfulResetRoutesToInfoNotError() async {
        let (vm, fake) = makeViewModel()
        vm.email = "a@b.com"
        await vm.resetPassword()

        XCTAssertEqual(fake.resetCount, 1)
        XCTAssertTrue(vm.showInfo)
        XCTAssertEqual(vm.infoMessage, "Password reset email sent. Open the link on this iPhone to choose a new password.")
        XCTAssertFalse(vm.showError)
        XCTAssertNil(vm.errorMessage)
    }

    func testFailedResetRoutesToErrorNotInfo() async {
        let (vm, fake) = makeViewModel()
        fake.nextError = FakeAuth.Failure(message: "Rate limit exceeded")
        vm.email = "a@b.com"
        await vm.resetPassword()

        XCTAssertTrue(vm.showError)
        XCTAssertEqual(vm.errorMessage, "Too many attempts. Wait a minute and try again.")
        XCTAssertFalse(vm.showInfo)
        XCTAssertNil(vm.infoMessage)
    }

    /// No address typed is guidance, not a failure (IOS-DD-ACCOUNT-15).
    func testForgotPasswordWithEmptyEmailSetsHintNotError() async {
        let (vm, fake) = makeViewModel()
        await vm.resetPassword()

        XCTAssertFalse(vm.showError)
        XCTAssertNotNil(vm.emailFieldHint)
        XCTAssertFalse(vm.showInfo)
        XCTAssertEqual(fake.resetCount, 0)

        vm.email = "a"
        XCTAssertNil(vm.emailFieldHint, "typing clears the hint")
    }

    // MARK: - Apple Sign-In dismissals (IOS-AUDIT-UX-029)

    /// Cancelling the Apple sheet is a user decision, not a failure. Presenting
    /// "Sign In Error" for it was the UX-029 bug; these pin the three codes that
    /// must stay silent.
    func testAppleSignInDismissalCodesAreSilent() async {
        // The view model branches on `(error as NSError).code` alone, so the
        // domain string is not part of the contract under test.
        let domain = "ASAuthorizationErrorDomain"
        for code in [ASAuthorizationError.canceled, .unknown, .notInteractive] {
            let (vm, _) = makeViewModel()
            let error = NSError(domain: domain, code: code.rawValue)
            await vm.handleAppleSignIn(result: .failure(error))

            XCTAssertFalse(vm.showError, "code \(code.rawValue) should be treated as a dismissal")
            XCTAssertNil(vm.errorMessage)
        }
    }

    func testAppleSignInRealFailureIsSurfaced() async {
        let (vm, _) = makeViewModel()
        let error = NSError(domain: "ASAuthorizationErrorDomain", code: ASAuthorizationError.failed.rawValue)
        await vm.handleAppleSignIn(result: .failure(error))

        XCTAssertTrue(vm.showError)
        XCTAssertNotNil(vm.errorMessage)
    }

    // MARK: - Sign out

    func testFailedSignOutSurfacesAnError() async {
        let (vm, fake) = makeViewModel()
        fake.nextError = FakeAuth.Failure(message: "Network unavailable")
        await vm.signOut()

        XCTAssertEqual(fake.signOutCount, 1)
        XCTAssertTrue(vm.showError)
        XCTAssertEqual(vm.errorMessage, "Network unavailable")
    }

    // MARK: - AC3: who the verify-email gate applies to

    /// DesMoinesInsiderApp.swift:71 routes on needsEmailVerification, so this
    /// decides whether a signed-in user reaches the app or the verify screen.
    func testConfirmedEmailNeverNeedsVerification() {
        XCTAssertFalse(AuthService.needsEmailVerification(emailConfirmedAt: Date(), primaryProvider: "email"))
        XCTAssertFalse(AuthService.needsEmailVerification(emailConfirmedAt: Date(), primaryProvider: "apple"))
        XCTAssertFalse(AuthService.needsEmailVerification(emailConfirmedAt: Date(), primaryProvider: nil))
    }

    func testUnconfirmedEmailUserNeedsVerification() {
        XCTAssertTrue(AuthService.needsEmailVerification(emailConfirmedAt: nil, primaryProvider: "email"))
        XCTAssertTrue(AuthService.needsEmailVerification(emailConfirmedAt: nil, primaryProvider: "google"))
    }

    /// Apple pre-verifies the address, and never sends a confirmation mail. If
    /// this returned true an Apple user would be parked on the verify-email
    /// screen permanently, waiting for a message that is not coming.
    func testAppleUserIsTreatedAsVerifiedWithoutAConfirmationTimestamp() {
        XCTAssertFalse(AuthService.needsEmailVerification(emailConfirmedAt: nil, primaryProvider: "apple"))
    }

    /// The fallback in primaryProvider(for:) can return nil when app_metadata is
    /// missing and identities is empty. Unknown provider must fail toward asking
    /// for verification rather than skipping it.
    func testUnknownProviderStillRequiresVerification() {
        XCTAssertTrue(AuthService.needsEmailVerification(emailConfirmedAt: nil, primaryProvider: nil))
    }
}
