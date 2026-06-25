import XCTest
@testable import DesMoinesInsider

/// Unit tests for the auth gate (IOS-AUDIT-TEST-002): Apple Sign-In nonce
/// generation + SHA-256 hashing, email validation, and password-strength
/// scoring. These cover the pure/observable logic that every authenticated
/// flow depends on, without hitting Supabase.
@MainActor
final class AuthTests: XCTestCase {

    // MARK: - SHA-256 (Apple Sign-In request.nonce)

    func testSHA256MatchesKnownVector() {
        // Canonical NIST vector for "abc".
        XCTAssertEqual(
            AuthService.sha256("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        )
    }

    func testSHA256IsDeterministicAndHexOf64Chars() {
        let a = AuthService.sha256("des-moines")
        let b = AuthService.sha256("des-moines")
        XCTAssertEqual(a, b)
        XCTAssertEqual(a.count, 64)
        XCTAssertTrue(a.allSatisfy { $0.isHexDigit })
    }

    func testSHA256DiffersForDifferentInput() {
        XCTAssertNotEqual(AuthService.sha256("nonce-1"), AuthService.sha256("nonce-2"))
    }

    // MARK: - Apple Sign-In nonce (IOS-AUDIT-SEC-015)

    /// The full URL-safe charset the nonce is allowed to draw from. Mirrors the
    /// generator; notably includes 'W', which a prior literal skipped.
    private let allowedNonceChars = Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")

    func testGeneratedNonceHasExpectedLength() {
        let nonce = AuthService.shared.generateNonce()
        XCTAssertEqual(nonce.count, 32)
    }

    func testGeneratedNonceUsesOnlyURLSafeCharset() {
        let nonce = AuthService.shared.generateNonce()
        XCTAssertTrue(
            nonce.allSatisfy { allowedNonceChars.contains($0) },
            "Nonce \(nonce) contains a character outside the URL-safe set"
        )
    }

    func testConsecutiveNoncesDiffer() {
        let a = AuthService.shared.generateNonce()
        let b = AuthService.shared.generateNonce()
        XCTAssertNotEqual(a, b, "Each Apple Sign-In attempt must get a fresh nonce")
    }

    func testNonceCharsetCoversFullUppercaseAlphabet() {
        // Guards the SEC-015 regression directly: across many draws every A–Z
        // letter (including 'W') must be reachable. 64 chars / 2000 draws makes a
        // missing letter astronomically unlikely if the charset is complete.
        var seen = Set<Character>()
        for _ in 0..<2000 { seen.formUnion(AuthService.shared.generateNonce()) }
        for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ" {
            XCTAssertTrue(seen.contains(letter), "Charset never produced '\(letter)'")
        }
    }

    // MARK: - Email validation

    func testValidEmails() {
        let vm = AuthViewModel()
        for email in ["a@b.co", "first.last@example.com", "user+tag@sub.domain.org"] {
            vm.email = email
            XCTAssertTrue(vm.isEmailValid, "\(email) should be valid")
        }
    }

    func testInvalidEmails() {
        let vm = AuthViewModel()
        for email in ["plainaddress", "missing@tld", "@no-local.com", "spaces in@email.com", "trailing@dot."] {
            vm.email = email
            XCTAssertFalse(vm.isEmailValid, "\(email) should be invalid")
        }
    }

    func testEmptyEmailIsTreatedAsValidToAvoidPrematureError() {
        let vm = AuthViewModel()
        vm.email = ""
        XCTAssertTrue(vm.isEmailValid)
    }

    // MARK: - Password strength

    func testEmptyPasswordIsNone() {
        let vm = AuthViewModel()
        vm.password = ""
        XCTAssertEqual(vm.passwordStrength, .none)
    }

    func testWeakPasswords() {
        let vm = AuthViewModel()
        vm.password = "abc"          // short, lower only -> score 1
        XCTAssertEqual(vm.passwordStrength, .weak)
        vm.password = "abcdefgh"     // len>=8 + lower -> score 2
        XCTAssertEqual(vm.passwordStrength, .weak)
    }

    func testMediumPassword() {
        let vm = AuthViewModel()
        vm.password = "Abcdefgh"      // len>=8 + upper + lower -> score 3
        XCTAssertEqual(vm.passwordStrength, .medium)
    }

    func testStrongPassword() {
        let vm = AuthViewModel()
        vm.password = "Abcd1234!xyz"  // len>=12 + upper + lower + digit + special -> score 6
        XCTAssertEqual(vm.passwordStrength, .strong)
    }

    // MARK: - Password confirmation

    func testPasswordsMatchEmptyConfirmation() {
        let vm = AuthViewModel()
        vm.password = "secret123"
        vm.confirmPassword = ""
        XCTAssertTrue(vm.passwordsMatch, "Empty confirmation should not flag a mismatch yet")
    }

    func testPasswordsMatchAndMismatch() {
        let vm = AuthViewModel()
        vm.password = "secret123"
        vm.confirmPassword = "secret123"
        XCTAssertTrue(vm.passwordsMatch)
        vm.confirmPassword = "secret124"
        XCTAssertFalse(vm.passwordsMatch)
    }
}
