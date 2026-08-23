import Foundation
import os
import CryptoKit

/// Validates server certificates for Supabase API connections using public key pinning.
///
/// Instead of pinning a specific certificate (which rotates), we pin the
/// Subject Public Key Info (SPKI) hash of the Supabase domain's TLS certificate.
/// This approach survives certificate renewals as long as the same key pair is used.
///
/// Usage:
///     let delegate = CertificatePinningService.shared
///     let session = URLSession(configuration: .default, delegate: delegate, delegateQueue: nil)
final class CertificatePinningService: NSObject, URLSessionDelegate {
    static let shared = CertificatePinningService()

    /// Domains that require certificate pinning. Only Supabase API calls are pinned.
    private let pinnedDomains: Set<String> = ["supabase.co"]

    /// SHA-256 hashes of the Subject Public Key Info (SPKI) for pinned certificates.
    /// These cover the Supabase infrastructure CA chain.
    ///
    /// To update: run `openssl s_client -connect <host>:443 | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64`
    ///
    /// We pin multiple hashes to support certificate rotation:
    /// - Current Supabase leaf certificate SPKI
    /// - Let's Encrypt R3 intermediate SPKI (backup)
    /// - ISRG Root X1 SPKI (backup)
    ///
    /// VERIFIED AGAINST THE LIVE HOST 2026-07-18 (IOS-AUDIT-SEC-001).
    /// Re-run `scripts/verify-cert-pins.sh` to reproduce; it prints the SPKI hash
    /// of every cert in the live chain so these can be diffed.
    ///
    /// Live chain for wtkhfqpmcegzcbngroui.supabase.co on that date:
    ///   leaf  CN=supabase.co                    ZcJbApTb7wyllleAjHw2vYAskqdT+DhMY9aPDFwAtf4=
    ///   int.  Google Trust Services, CN=WE1     kIdp6NNEd8wsugYyyIYFsi1ylMCED3hZbSR8ZFsa/A4=
    ///   root  GTS Root R4                      mEflZT5enoR1FuXLgYYGqnVEoZvmf9c2bVBpiOjYQ0c=
    ///
    /// Removed 2026-07-18: Let's Encrypt R3, ISRG Root X1, and DigiCert Global
    /// Root G2. None of them appear anywhere in Supabase's live chain, so they
    /// could never satisfy a legitimate connection — but because
    /// `urlSession(_:didReceive:)` accepts if *any* chain cert matches *any* pin,
    /// their presence meant a cert from any of those very widely-used CAs would
    /// pass pinning. They only ever widened the accept set. Removing them is a
    /// strict tightening with no rotation cost.
    ///
    /// STILL BROADER THAN IDEAL: `GTS Root R4` is a public root, so any
    /// Google-Trust-Services-issued certificate satisfies the pin. It is kept
    /// deliberately as the rotation backup — Supabase's leaf and intermediate
    /// both chain to it, so it is the one pin that survives a leaf or
    /// intermediate reissue. Narrowing to leaf+intermediate only would be
    /// stronger but would brick clients on the next rotation with no fallback.
    ///
    /// The leaf pin rotates (GTS issues short-lived certs, ~90 days), so it must
    /// NOT be the only pin — it is here to tighten the common case, while WE1
    /// carries continuity across leaf reissues.
    ///
    /// RE-VERIFIED 2026-08-23: all three pins still present in the live chain.
    /// `scripts/verify-cert-pins.sh` now checks this rather than only printing
    /// it, and runs in iOS CI, so drift fails a build instead of waiting to be
    /// noticed. Rotation procedure: docs/CERT_PIN_ROTATION.md.
    ///
    /// BEFORE FLIPPING `Config.certificatePinningEnforced` (IOS-AUDIT-SEC-013):
    /// re-run the verify script, confirm the leaf hash below still matches or
    /// update it, and confirm at least two pins in this set are present in the
    /// live chain so a single rotation cannot lock every client out.
    private let pinnedSPKIHashes: Set<String> = [
        // Supabase leaf, CN=supabase.co — verified live 2026-07-18. Rotates ~90d.
        "ZcJbApTb7wyllleAjHw2vYAskqdT+DhMY9aPDFwAtf4=",
        // Google Trust Services WE1 intermediate (current Supabase issuer) — verified live 2026-07-18.
        "kIdp6NNEd8wsugYyyIYFsi1ylMCED3hZbSR8ZFsa/A4=",
        // GTS Root R4 (current Supabase root) — verified live 2026-07-18. Rotation backup; see note above.
        "mEflZT5enoR1FuXLgYYGqnVEoZvmf9c2bVBpiOjYQ0c=",
    ]

    /// When `true`, pinning failures are logged but connections are NOT blocked.
    /// DEBUG is always report-only; Release enforces only once the pinned SPKI
    /// hashes have been verified against the live host and
    /// `Config.certificatePinningEnforced` is flipped on (IOS-AUDIT-SEC-001).
    /// This prevents stale hashes from bricking API connectivity on ship.
    var reportOnly: Bool {
        #if DEBUG
        return true
        #else
        return !Config.certificatePinningEnforced
        #endif
    }

    private override init() {
        super.init()
    }

    // MARK: - URLSessionDelegate

    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let serverTrust = challenge.protectionSpace.serverTrust else {
            completionHandler(.performDefaultHandling, nil)
            return
        }

        let host = challenge.protectionSpace.host

        // Only pin connections to Supabase domains
        guard pinnedDomains.contains(where: { host.hasSuffix($0) }) else {
            completionHandler(.performDefaultHandling, nil)
            return
        }

        // Evaluate the server trust chain
        var error: CFError?
        guard SecTrustEvaluateWithError(serverTrust, &error) else {
            AppLogger.network.error("Certificate trust evaluation failed for \(host): \(error?.localizedDescription ?? "unknown")")
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        let certificateChain = SecTrustCopyCertificateChain(serverTrust) as? [SecCertificate] ?? []

        switch decide(host: host, certificateChain: certificateChain, reportOnly: reportOnly) {
        case .notAPinnedHost:
            // Unreachable: the pinnedDomains guard above already returned. Kept
            // exhaustive so adding a case is a compile error, not a silent allow.
            completionHandler(.performDefaultHandling, nil)
        case .pinMatched:
            completionHandler(.useCredential, URLCredential(trust: serverTrust))
        case .mismatchAllowedReportOnly:
            AppLogger.network.warning("Certificate pinning mismatch for \(host) (report-only mode, connection allowed)")
            noteMismatch(host: host, blocked: false)
            completionHandler(.useCredential, URLCredential(trust: serverTrust))
        case .mismatchBlocked:
            AppLogger.network.error("Certificate pinning failed for \(host) - connection blocked")
            noteMismatch(host: host, blocked: true)
            completionHandler(.cancelAuthenticationChallenge, nil)
        }
    }

    // MARK: - Decision (testable seam)

    /// The outcome of the pin check for one connection.
    ///
    /// Split out of `urlSession(_:didReceive:completionHandler:)` because that
    /// method cannot be driven from a unit test: `URLAuthenticationChallenge`
    /// needs a `URLProtectionSpace` carrying a `SecTrust`, and no public
    /// initializer attaches one. Without this seam, ACs 2 and 3 of
    /// IOS-AUDIT-SEC-001 - reject a non-pinned cert when enforcing, allow and
    /// log it when report-only - can only be checked by pointing a real device
    /// at a MITM proxy, which is why they sat unverified.
    enum PinDecision: Equatable {
        case notAPinnedHost
        case pinMatched
        case mismatchAllowedReportOnly
        case mismatchBlocked
    }

    /// True when this service pins connections to `host`.
    func pins(host: String) -> Bool {
        pinnedDomains.contains(where: { host.hasSuffix($0) })
    }

    /// The pin decision for an already trust-validated certificate chain.
    ///
    /// `reportOnly` is a parameter rather than a read of the `reportOnly`
    /// property so a test can exercise both modes without a Release build.
    func decide(host: String, certificateChain: [SecCertificate], reportOnly: Bool) -> PinDecision {
        guard pins(host: host) else { return .notAPinnedHost }

        for certificate in certificateChain {
            if let spkiHash = spkiSHA256Hash(of: certificate), pinnedSPKIHashes.contains(spkiHash) {
                return .pinMatched
            }
        }

        return reportOnly ? .mismatchAllowedReportOnly : .mismatchBlocked
    }

    // MARK: - Mismatch telemetry (IOS-AUDIT-SEC-013 AC4)

    /// Hosts already reported this process run.
    ///
    /// A mismatch does not happen once. It happens on every request for as long
    /// as the bad chain is presented, which on a busy screen is dozens per
    /// minute -- and `log-error` is rate-limited to 60/minute per IP, so an
    /// unthrottled reporter would spend the whole budget on one device and
    /// starve the crash uploads sharing it. One report per host per run is
    /// enough to answer the only question the report-only window asks: is any
    /// real user seeing a chain we do not pin.
    private let mismatchLock = NSLock()
    private var reportedMismatchHosts: Set<String> = []

    /// Send one pin mismatch to the backend error sink.
    ///
    /// This is the AC4 requirement, and it is what makes flipping enforcement
    /// (AC2) a decision with evidence rather than a guess: while report-only,
    /// every mismatch a real device sees lands in `error_events` under
    /// component `ios-cert-pin`. A window with zero of them is the argument for
    /// enforcing; a window with any is the reason not to, and names the host.
    ///
    /// Deliberately carries no certificate material. The host and whether the
    /// connection was blocked are what a decision needs; a chain dump would be
    /// unique per connection, which would give every report its own cluster
    /// signature and make the count unreadable.
    func noteMismatch(host: String, blocked: Bool) {
        mismatchLock.lock()
        let isFirst = reportedMismatchHosts.insert(host).inserted
        mismatchLock.unlock()
        guard isFirst else { return }

        Task.detached {
            _ = await ErrorSink.send(
                message: "Certificate pin mismatch for \(host)",
                component: "ios-cert-pin",
                action: blocked ? "blocked" : "report_only",
                route: "ios/\(Config.appVersion)",
                severity: blocked ? "critical" : "warning"
            )
        }
    }

    /// Whether `host` has already been reported this run. Exposed for tests --
    /// the throttle is the part that silently stops reporting if it is wrong.
    func hasReportedMismatch(host: String) -> Bool {
        mismatchLock.lock()
        defer { mismatchLock.unlock() }
        return reportedMismatchHosts.contains(host)
    }

    /// Clear the throttle. Tests only.
    func resetMismatchThrottle() {
        mismatchLock.lock()
        reportedMismatchHosts.removeAll()
        mismatchLock.unlock()
    }

    // MARK: - SPKI Hash Extraction

    /// ASN.1 SubjectPublicKeyInfo headers by (key algorithm, key size in bits).
    ///
    /// `SecKeyCopyExternalRepresentation` returns only the *raw* key material
    /// (PKCS#1 `RSAPublicKey` for RSA, the X9.63 EC point for elliptic curves),
    /// NOT the DER-encoded SubjectPublicKeyInfo. The pinned hashes are SPKI
    /// hashes (generated via `openssl … pkey -pubin -outform der | dgst -sha256`),
    /// which cover the full SPKI structure including the AlgorithmIdentifier.
    /// To reproduce that hash we must prepend the matching algorithm-identifier
    /// header to the raw key bytes before hashing. These header constants are the
    /// canonical values used by TrustKit / OWASP pinning implementations.
    private static let spkiHeaders: [String: [UInt8]] = [
        "RSA-2048": [
            0x30, 0x82, 0x01, 0x22, 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86,
            0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00, 0x03, 0x82, 0x01, 0x0f, 0x00,
        ],
        "RSA-4096": [
            0x30, 0x82, 0x02, 0x22, 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86,
            0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00, 0x03, 0x82, 0x02, 0x0f, 0x00,
        ],
        "EC-256": [
            0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02,
            0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03,
            0x42, 0x00,
        ],
        "EC-384": [
            0x30, 0x76, 0x30, 0x10, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02,
            0x01, 0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x22, 0x03, 0x62, 0x00,
        ],
    ]

    /// Resolves the SPKI header for a public key from its algorithm + size.
    private func spkiHeader(for publicKey: SecKey) -> [UInt8]? {
        guard let attrs = SecKeyCopyAttributes(publicKey) as? [CFString: Any],
              let keyType = attrs[kSecAttrKeyType] as? String,
              let keySize = attrs[kSecAttrKeySizeInBits] as? Int else { return nil }

        // The CFString algorithm constants can't be referenced directly inside a
        // `case` pattern: `kSecAttrKeyTypeRSA as String` is parsed as an `as` cast
        // pattern (CFString can't match a String value), and a bare local constant
        // would bind rather than match. Compare against the bridged Strings via a
        // `where` clause instead.
        let rsaKeyType = kSecAttrKeyTypeRSA as String
        let ecKeyType = kSecAttrKeyTypeECSECPrimeRandom as String

        switch (keyType, keySize) {
        case (let type, 2048) where type == rsaKeyType: return Self.spkiHeaders["RSA-2048"]
        case (let type, 4096) where type == rsaKeyType: return Self.spkiHeaders["RSA-4096"]
        case (let type, 256) where type == ecKeyType: return Self.spkiHeaders["EC-256"]
        case (let type, 384) where type == ecKeyType: return Self.spkiHeaders["EC-384"]
        default: return nil
        }
    }

    /// Computes the base64 SHA-256 of a certificate's DER-encoded SubjectPublicKeyInfo.
    /// Internal rather than private so CertificatePinningTests can assert the
    /// header reconstruction below against real certificates. It is the part
    /// most likely to be silently wrong, and a wrong hash matches nothing.
    func spkiSHA256Hash(of certificate: SecCertificate) -> String? {
        guard let publicKey = SecCertificateCopyKey(certificate) else { return nil }

        var error: Unmanaged<CFError>?
        guard let publicKeyData = SecKeyCopyExternalRepresentation(publicKey, &error) as Data? else {
            return nil
        }

        guard let header = spkiHeader(for: publicKey) else {
            // Unsupported key type/size — can't construct a comparable SPKI hash.
            // Returning nil means this cert simply won't match a pin (fine in
            // report-only; would need a new header constant before enforcing).
            AppLogger.network.error("SPKI pinning: unsupported public key type/size; skipping cert")
            return nil
        }

        // Reconstruct the full SPKI (header ‖ raw key) and hash that.
        var spki = Data(header)
        spki.append(publicKeyData)
        let hash = SHA256.hash(data: spki)
        return Data(hash).base64EncodedString()
    }
}
