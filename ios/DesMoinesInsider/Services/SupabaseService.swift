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

        client = SupabaseClient(
            supabaseURL: url,
            supabaseKey: key,
            options: SupabaseClientOptions(
                auth: SupabaseClientOptions.AuthOptions(
                    flowType: .pkce,
                    redirectToURL: URL(string: "\(Config.appBundleId)://auth-callback")
                ),
                global: SupabaseClientOptions.GlobalOptions(
                    headers: ["X-Client-Info": "desmoines-insider-ios"]
                )
            )
        )
        configurationError = nil
    }
}
