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
    private let pinnedSPKIHashes: Set<String> = [
        // Google Trust Services WE1 intermediate (current Supabase issuer)
        "kIdp6NNEd8wsugYyyIYFsi1ylMCED3hZbSR8ZFsa/A4=",
        // GTS Root R4 (current Supabase root)
        "mEflZT5enoR1FuXLgYYGqnVEoZvmf9c2bVBpiOjYQ0c=",
        // Let's Encrypt R3 intermediate (fallback)
        "jQJTbIh0grw0/1TkHSumWb+Fs0Ggogr621gT3PvPKG0=",
        // ISRG Root X1 (fallback)
        "C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=",
        // DigiCert Global Root G2 (fallback)
        "i7WTqTvh0OioIruIfFR4kMPnBqrS2rdiVPl/s2uC/CY=",
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

        // Check if any certificate in the chain matches our pinned SPKI hashes
        var matched = false

        let certificateChain = SecTrustCopyCertificateChain(serverTrust) as? [SecCertificate] ?? []
        for certificate in certificateChain {

            if let spkiHash = spkiSHA256Hash(of: certificate) {
                if pinnedSPKIHashes.contains(spkiHash) {
                    matched = true
                    break
                }
            }
        }

        if matched {
            completionHandler(.useCredential, URLCredential(trust: serverTrust))
        } else if reportOnly {
            // In debug mode, log the mismatch but allow the connection
            AppLogger.network.warning("Certificate pinning mismatch for \(host) (report-only mode, connection allowed)")
            completionHandler(.useCredential, URLCredential(trust: serverTrust))
        } else {
            // In production, block the connection
            AppLogger.network.error("Certificate pinning failed for \(host) — connection blocked")
            completionHandler(.cancelAuthenticationChallenge, nil)
        }
    }

    // MARK: - SPKI Hash Extraction

    /// Extracts the SHA-256 hash of the Subject Public Key Info from a certificate.
    private func spkiSHA256Hash(of certificate: SecCertificate) -> String? {
        guard let publicKey = SecCertificateCopyKey(certificate) else { return nil }

        var error: Unmanaged<CFError>?
        guard let publicKeyData = SecKeyCopyExternalRepresentation(publicKey, &error) as Data? else {
            return nil
        }

        // Hash the raw public key data with SHA-256
        let hash = SHA256.hash(data: publicKeyData)
        return Data(hash).base64EncodedString()
    }
}
