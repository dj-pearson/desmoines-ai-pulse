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

        /// Thrown by every call when set.
        var nextError: Error?

        private func throwIfNeeded() throws {
            if let nextError { throw nextError }
        }

        func signIn(email: String, password: String) async throws {
            signInCount += 1
            try throwIfNeeded()
        }

        func signUp(email: String, password: String, firstName: String?, lastName: String?, interests: [String]?) async throws {
            signUpCount += 1
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

    private func makeViewModel() -> (AuthViewModel, FakeAuth) {
        let fake = FakeAuth()
        return (AuthViewModel(auth: fake), fake)
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
        vm.password = "Passw0rd!"
        await vm.signIn()

        XCTAssertEqual(vm.errorMessage, "Please enter a valid email address.")
        XCTAssertEqual(fake.signInCount, 0)
    }

    // MARK: - Sign in: success and failure routing

    func testSuccessfulSignInClearsTheFormAndRaisesNothing() async {
        let (vm, fake) = makeViewModel()
        vm.email = "a@b.com"
        vm.password = "Passw0rd!"
        await vm.signIn()

        XCTAssertEqual(fake.signInCount, 1)
        XCTAssertFalse(vm.showError)
        XCTAssertNil(vm.errorMessage)
        XCTAssertFalse(vm.showInfo)
        XCTAssertFalse(vm.isSigningIn)
        XCTAssertEqual(vm.email, "", "a successful sign-in clears the form")
        XCTAssertEqual(vm.password, "")
    }

    func testFailedSignInSurfacesTheServiceMessageAsAnError() async {
        let (vm, fake) = makeViewModel()
        fake.nextError = FakeAuth.Failure(message: "Invalid login credentials")
        vm.email = "a@b.com"
        vm.password = "wrong"
        await vm.signIn()

        XCTAssertTrue(vm.showError)
        XCTAssertEqual(vm.errorMessage, "Invalid login credentials")
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
        vm.password = "wrong"

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
        vm.password = "wrong"

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
        vm.password = "wrong"
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
        vm.password = "Passw0rd!"
        vm.confirmPassword = "Passw0rd?"
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
        vm.password = "Passw0rd!"
        vm.confirmPassword = "Passw0rd!"
        vm.firstName = "Ada"
        vm.selectedInterests = ["Food"]
        await vm.signUp()

        XCTAssertEqual(fake.signUpCount, 1)
        XCTAssertTrue(vm.showVerificationAlert)
        XCTAssertFalse(vm.showError)
        XCTAssertNil(vm.errorMessage)
        XCTAssertFalse(vm.isSigningUp)
        XCTAssertEqual(vm.email, "")
        XCTAssertEqual(vm.firstName, "")
        XCTAssertTrue(vm.selectedInterests.isEmpty)
    }

    func testFailedSignUpDoesNotRaiseTheVerificationAlert() async {
        let (vm, fake) = makeViewModel()
        fake.nextError = FakeAuth.Failure(message: "Email already registered")
        vm.email = "a@b.com"
        vm.password = "Passw0rd!"
        vm.confirmPassword = "Passw0rd!"
        await vm.signUp()

        XCTAssertFalse(vm.showVerificationAlert, "a failed sign-up must not tell the user to check their inbox")
        XCTAssertTrue(vm.showError)
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
        XCTAssertEqual(vm.infoMessage, "Password reset email sent. Check your inbox.")
        XCTAssertFalse(vm.showError)
        XCTAssertNil(vm.errorMessage)
    }

    func testFailedResetRoutesToErrorNotInfo() async {
        let (vm, fake) = makeViewModel()
        fake.nextError = FakeAuth.Failure(message: "Rate limit exceeded")
        vm.email = "a@b.com"
        await vm.resetPassword()

        XCTAssertTrue(vm.showError)
        XCTAssertEqual(vm.errorMessage, "Rate limit exceeded")
        XCTAssertFalse(vm.showInfo)
        XCTAssertNil(vm.infoMessage)
    }

    func testResetWithNoEmailErrorsWithoutCallingTheService() async {
        let (vm, fake) = makeViewModel()
        await vm.resetPassword()

        XCTAssertTrue(vm.showError)
        XCTAssertEqual(vm.errorMessage, "Please enter your email address.")
        XCTAssertFalse(vm.showInfo)
        XCTAssertEqual(fake.resetCount, 0)
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
}
