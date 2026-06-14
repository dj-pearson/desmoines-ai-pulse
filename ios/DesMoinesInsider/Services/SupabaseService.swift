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

    /// URLSession with certificate pinning, injected into the Supabase client so
    /// all API/Functions/Storage traffic is pinned (SEC-001). Retained for the
    /// app lifetime alongside the client.
    private let pinnedSession: URLSession

    private init() {
        // Build the pinned session up front so it's available regardless of which
        // configuration branch we take.
        pinnedSession = URLSession(
            configuration: .default,
            delegate: CertificatePinningService.shared,
            delegateQueue: nil
        )

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
