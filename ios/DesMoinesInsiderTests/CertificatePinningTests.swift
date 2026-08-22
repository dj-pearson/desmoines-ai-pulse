import XCTest
import Security
@testable import DesMoinesInsider

/// IOS-AUDIT-SEC-001 ACs 2 and 3, minus the TLS handshake.
///
/// Both criteria are written against a MITM proxy on a device: a non-pinned but
/// OS-trusted certificate must be REJECTED in Release and ALLOWED WITH A LOG in
/// DEBUG. That needs hardware, a proxy and a Release build, which is why they
/// sat unverified while the wiring itself shipped in June.
///
/// `CertificatePinningService.decide(host:certificateChain:reportOnly:)` is the
/// same decision the delegate makes with the handshake removed, so both
/// outcomes can be asserted on every CI run instead.
///
/// WHAT THIS STILL DOES NOT COVER, and the proxy remains the only way to check:
/// that the delegate is installed on the URLSession the Supabase client actually
/// uses, and that `SecTrustEvaluateWithError` runs before any of this. A green
/// run here means the decision is right, not that it is reached.
///
/// Both certificates are real DER, embedded rather than fetched. A test that
/// opened a TLS connection would fail on an offline runner and would assert
/// against whatever the CA happened to serve that morning.
final class CertificatePinningTests: XCTestCase {

    /// GTS Root R4 (EC-384), the root of the live Supabase chain and one of the
    /// three pinned SPKI hashes. Valid until 2028-01-28. Captured from
    /// wtkhfqpmcegzcbngroui.supabase.co on 2026-08-22, where all three pins in
    /// the service still matched the live chain; `scripts/verify-cert-pins.sh`
    /// reproduces it.
    private static let gtsRootR4DER =
        "MIIDejCCAmKgAwIBAgIQf+UwvzMTQ77dghYQST2KGzANBgkqhkiG9w0BAQsFADBXMQswCQYD" +
        "VQQGEwJCRTEZMBcGA1UEChMQR2xvYmFsU2lnbiBudi1zYTEQMA4GA1UECxMHUm9vdCBDQTEb" +
        "MBkGA1UEAxMSR2xvYmFsU2lnbiBSb290IENBMB4XDTIzMTExNTAzNDMyMVoXDTI4MDEyODAw" +
        "MDA0MlowRzELMAkGA1UEBhMCVVMxIjAgBgNVBAoTGUdvb2dsZSBUcnVzdCBTZXJ2aWNlcyBM" +
        "TEMxFDASBgNVBAMTC0dUUyBSb290IFI0MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAE83Rzp2iL" +
        "YK5DuDXFgTB7S0md+8FhzubeRr1r1WEYNa5A3XP3iZEwWus87oV8okB2O6nGuEfYKueSkWpz" +
        "6bFyOZ8pn6KY019eWIZlD6GEZQbR3IvJx3PIjGov5cSr0R2Ko4H/MIH8MA4GA1UdDwEB/wQE" +
        "AwIBhjAdBgNVHSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIwDwYDVR0TAQH/BAUwAwEB/zAd" +
        "BgNVHQ4EFgQUgEzW63T/STaj1dj8tT7FavCUHYwwHwYDVR0jBBgwFoAUYHtmGkUNl8qJUC99" +
        "BM00qP/8/UswNgYIKwYBBQUHAQEEKjAoMCYGCCsGAQUFBzAChhpodHRwOi8vaS5wa2kuZ29v" +
        "Zy9nc3IxLmNydDAtBgNVHR8EJjAkMCKgIKAehhxodHRwOi8vYy5wa2kuZ29vZy9yL2dzcjEu" +
        "Y3JsMBMGA1UdIAQMMAowCAYGZ4EMAQIBMA0GCSqGSIb3DQEBCwUAA4IBAQAYQrsPBtYDh5bj" +
        "P2OBDwmkoWhIDDkic574y04tfzHpn+cJodI2D4SseesQ6bDrarZ7C30ddLibZatoKiws3UL9" +
        "xnELz4ct92vID24FfVbiI1hY+SW6FoVHkNeWIP0GCbaM4C6uVdF5dTUsMVs/ZbzNnIdCp5Gx" +
        "mx5ejvEau8otR/CskGN+hr/W5GvT1tMBjgWKZ1i4//emhA1JG1BbPzoLJQvyEotc03lXjTaC" +
        "zv8mEbep8RqZ7a2CPsgRbuvTPBwcOMBBmuFeU88+FSBX6+7iP0il8b4Z0QFqIwwMHfs/L6K1" +
        "vepuoxtGzi4CZ68zJpiq1UvSqTbFJjtbD4seiMHl"

    /// ISRG Root X2 (EC-384), a widely trusted public root that is deliberately
    /// NOT pinned. Valid until 2032-09-02.
    ///
    /// It stands in for the MITM proxy's certificate: something the OS trusts
    /// completely, presented for a Supabase host, with no pin match anywhere.
    /// Note this is X2, a different key from the ISRG Root X1 that was wrongly
    /// in the pin set until 2026-07-18 -- so it is a clean negative, not a
    /// regression test for that removal.
    private static let isrgRootX2DER =
        "MIIEcDCCAligAwIBAgIQbI8dxyfHEX97r4U6yYD5zTANBgkqhkiG9w0BAQsFADBPMQswCQYD" +
        "VQQGEwJVUzEpMCcGA1UEChMgSW50ZXJuZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTAT" +
        "BgNVBAMTDElTUkcgUm9vdCBYMTAeFw0yNjA1MTMwMDAwMDBaFw0zMjA5MDIyMzU5NTlaME8x" +
        "CzAJBgNVBAYTAlVTMSkwJwYDVQQKEyBJbnRlcm5ldCBTZWN1cml0eSBSZXNlYXJjaCBHcm91" +
        "cDEVMBMGA1UEAxMMSVNSRyBSb290IFgyMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAEzZvVn4CD" +
        "CuwJSvMWSj5cz3es3mcFDR0HttwW+1qLFNvicWDEukWVEYmO6gbf9yoWHKS5xcUy4APgHoIY" +
        "OIvXRdgKam7mAHf7AlF9ItgKbppbd9/w+kHsOdx1ymgHDB/qo4H1MIHyMA4GA1UdDwEB/wQE" +
        "AwIBBjAdBgNVHSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIwDwYDVR0TAQH/BAUwAwEB/zAd" +
        "BgNVHQ4EFgQUfEKWrt5LSDv6kviejM9ti6lyN5UwHwYDVR0jBBgwFoAUebRZ5nu25eQBc4AI" +
        "iMgaWPbpm24wMgYIKwYBBQUHAQEEJjAkMCIGCCsGAQUFBzAChhZodHRwOi8veDEuaS5sZW5j" +
        "ci5vcmcvMBMGA1UdIAQMMAowCAYGZ4EMAQIBMCcGA1UdHwQgMB4wHKAaoBiGFmh0dHA6Ly94" +
        "MS5jLmxlbmNyLm9yZy8wDQYJKoZIhvcNAQELBQADggIBAD2/e9frmMxNpCV03qUHegg+MV2w" +
        "z9644YoXdqtH8RyWYcBO7xfjjGEXdU1e/o0OkEFiynUCOSIk/vLLo7ttz6CPAeNlWfC0XNko" +
        "GeWgK6jjXvozBaGuGH5n0UfoshMeWTuURqNN5G00sSXDTBrpp2+mgvdZQjb8K11TYMA25QA+" +
        "YHNfbIEL0BniAhKS2gsnJjSzrdZLI+EZ7SEyqdR2rkjd1KutLDU+n3TFyxjniZVGur4YlhMP" +
        "3mY/dV95IruAkkjOZier6hGBdEgZXXvaCz9u9iVEadsIE75pAGL8oHV5vxdARDiotRpul1IN" +
        "/UZwzAbrfUFcw1HkAcYD/mlZfnQ2ieCF2MS7j3Vhv7JPDKp45fmykmzYNSrumRW0upFFKDBO" +
        "oF7hsOb7oLyHS+Uft6jOUfOrogj8YUx38hKb2K20r42OgsSdDdxdeYWcMS3Sb6mwJeSZEYxJ" +
        "2gaXnDSPaKhhrNkYwljyVQyr4Nq+MEJytXNTnHqaAcrNwZlVpcJL1KBnMrMjP7eanvUwL3FY" +
        "j3cF17jtboLt7gLoi4+2rWZFvn+w54jmd/FIuhhZcEaU/wvU6BUNMtcVquVGHp7itQeDth5j" +
        "+XL3j4WJ2SABwzUl6OeYdgpIt/ITZa+pTT0mQ/r5XyA4MEAiabn7XJjvCERlF2dcn2wqJw+C" +
        "reTkkQ2R"

    private let service = CertificatePinningService.shared

    private func certificate(
        fromBase64 der: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) throws -> SecCertificate {
        let data = try XCTUnwrap(Data(base64Encoded: der), "fixture is not valid base64", file: file, line: line)
        return try XCTUnwrap(
            SecCertificateCreateWithData(nil, data as CFData),
            "fixture is not a DER certificate",
            file: file,
            line: line
        )
    }

    // MARK: - The SPKI hash itself

    /// The header reconstruction inside `spkiSHA256Hash` is the part most likely
    /// to be silently wrong: `SecKeyCopyExternalRepresentation` returns raw key
    /// material, not the DER SubjectPublicKeyInfo the pins were generated from,
    /// so the algorithm-identifier prefix has to be rebuilt by hand. A wrong
    /// prefix yields a plausible-looking hash that matches nothing -- and in
    /// report-only mode nothing would ever surface it.
    ///
    /// Expected values come from
    ///   openssl x509 -pubkey -noout | openssl pkey -pubin -outform der
    ///     | openssl dgst -sha256 -binary | base64
    func testSPKIHashMatchesOpenSSLForAPinnedRoot() throws {
        let cert = try certificate(fromBase64: Self.gtsRootR4DER)
        XCTAssertEqual(service.spkiSHA256Hash(of: cert), "mEflZT5enoR1FuXLgYYGqnVEoZvmf9c2bVBpiOjYQ0c=")
    }

    func testSPKIHashMatchesOpenSSLForAnUnpinnedRoot() throws {
        let cert = try certificate(fromBase64: Self.isrgRootX2DER)
        XCTAssertEqual(service.spkiSHA256Hash(of: cert), "diGVwiVYbubAI3RW4hB9xU8e/CH2GnkuvVFZE8zmgzI=")
    }

    // MARK: - Which hosts are pinned

    func testOnlySupabaseHostsArePinned() {
        XCTAssertTrue(service.pins(host: "wtkhfqpmcegzcbngroui.supabase.co"))
        XCTAssertTrue(service.pins(host: "supabase.co"))
        XCTAssertFalse(service.pins(host: "api.openweathermap.org"))
        // The match is hasSuffix, so a lookalike registered elsewhere is not
        // pinned. It is not blocked either -- it falls through to default
        // handling, which is the OS trust store.
        XCTAssertFalse(service.pins(host: "supabase.co.evil.example"))
    }

    func testUnpinnedHostIsLeftToDefaultHandling() throws {
        let cert = try certificate(fromBase64: Self.isrgRootX2DER)
        XCTAssertEqual(
            service.decide(host: "api.openweathermap.org", certificateChain: [cert], reportOnly: false),
            .notAPinnedHost
        )
    }

    // MARK: - AC2 / AC3: the enforce vs report-only split

    func testPinnedChainIsAcceptedWhenEnforcing() throws {
        let pinned = try certificate(fromBase64: Self.gtsRootR4DER)
        XCTAssertEqual(
            service.decide(host: "wtkhfqpmcegzcbngroui.supabase.co", certificateChain: [pinned], reportOnly: false),
            .pinMatched
        )
    }

    func testPinnedChainIsAcceptedWhenReportOnly() throws {
        let pinned = try certificate(fromBase64: Self.gtsRootR4DER)
        XCTAssertEqual(
            service.decide(host: "wtkhfqpmcegzcbngroui.supabase.co", certificateChain: [pinned], reportOnly: true),
            .pinMatched
        )
    }

    /// AC2. The MITM case: a certificate the OS trusts, presented for a Supabase
    /// host, with no pin match anywhere in the chain.
    func testUnpinnedChainIsBlockedWhenEnforcing() throws {
        let unpinned = try certificate(fromBase64: Self.isrgRootX2DER)
        XCTAssertEqual(
            service.decide(host: "wtkhfqpmcegzcbngroui.supabase.co", certificateChain: [unpinned], reportOnly: false),
            .mismatchBlocked
        )
    }

    /// AC3. The same chain must be allowed, not blocked, while report-only.
    /// Otherwise flipping `Config.certificatePinningEnforced` is the only way to
    /// discover a bad pin set -- which is the risk report-only exists to remove.
    func testUnpinnedChainIsAllowedWhenReportOnly() throws {
        let unpinned = try certificate(fromBase64: Self.isrgRootX2DER)
        XCTAssertEqual(
            service.decide(host: "wtkhfqpmcegzcbngroui.supabase.co", certificateChain: [unpinned], reportOnly: true),
            .mismatchAllowedReportOnly
        )
    }

    /// A pin anywhere in the chain is enough, which is what makes the root pin a
    /// usable rotation backup: a reissued leaf still chains to R4.
    func testAPinFurtherDownTheChainStillMatches() throws {
        let unpinned = try certificate(fromBase64: Self.isrgRootX2DER)
        let pinned = try certificate(fromBase64: Self.gtsRootR4DER)
        XCTAssertEqual(
            service.decide(
                host: "wtkhfqpmcegzcbngroui.supabase.co",
                certificateChain: [unpinned, pinned],
                reportOnly: false
            ),
            .pinMatched
        )
    }

    /// An empty chain must not read as "no mismatch found, therefore fine".
    func testEmptyChainIsBlockedWhenEnforcing() {
        XCTAssertEqual(
            service.decide(host: "wtkhfqpmcegzcbngroui.supabase.co", certificateChain: [], reportOnly: false),
            .mismatchBlocked
        )
    }
}
