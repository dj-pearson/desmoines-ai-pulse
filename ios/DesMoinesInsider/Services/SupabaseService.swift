import Foundation
import Supabase

/// Singleton Supabase client shared across the app.
/// Mirrors the web app's client setup from src/integrations/supabase/client.ts
///
/// When Supabase credentials are missing (e.g. secrets not injected at build time),
/// `client` is `nil` and the app shows a configuration error instead of crashing.
final class SupabaseService {
    static let shared = SupabaseService()

    /// The Supabase client, or `nil` if credentials were not configured at build time.
    let client: SupabaseClient?

    /// A human-readable reason why the client could not be created.
    let configurationError: String?

    private init() {
        guard let url = Config.supabaseURL else {
            client = nil
            configurationError = "SUPABASE_URL is missing or invalid. Ensure secrets are injected at build time."
            return
        }
        guard let key = Config.supabaseAnonKey else {
            client = nil
            configurationError = "SUPABASE_ANON_KEY is missing or empty. Ensure secrets are injected at build time."
            return
        }

        // Install certificate pinning on the URLSession the Supabase client uses
        // (IOS-AUDIT-SEC-001). Previously the pinning delegate existed but was
        // never wired, so no app traffic was pinned. Enforcement is gated by
        // Config.certificatePinningEnforced (report-only until verified).
        let pinnedSession = URLSession(
            configuration: .default,
            delegate: CertificatePinningService.shared,
            delegateQueue: nil
        )
        AppLogger.network.info(
            "Supabase client using pinned URLSession (enforced: \(!CertificatePinningService.shared.reportOnly))"
        )

        client = SupabaseClient(
            supabaseURL: url,
            supabaseKey: key,
            options: SupabaseClientOptions(
                auth: SupabaseClientOptions.AuthOptions(
                    redirectToURL: URL(string: "\(Config.appBundleId)://auth-callback"),
                    flowType: .pkce
                ),
                global: SupabaseClientOptions.GlobalOptions(
                    headers: ["X-Client-Info": "desmoines-insider-ios"],
                    session: pinnedSession
                )
            )
        )
        configurationError = nil
    }
}
