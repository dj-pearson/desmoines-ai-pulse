import Foundation
import Supabase

/// Singleton Supabase client shared across the app.
/// Mirrors the web app's client setup from src/integrations/supabase/client.ts
final class SupabaseService {
    static let shared = SupabaseService()

    let client: SupabaseClient

    private init() {
        client = SupabaseClient(
            supabaseURL: Config.supabaseURL,
            supabaseKey: Config.supabaseAnonKey,
            options: SupabaseClientOptions(
                auth: SupabaseClientOptions.AuthOptions(
                    flowType: .pkce
                ),
                global: SupabaseClientOptions.GlobalOptions(
                    headers: ["X-Client-Info": "desmoines-insider-ios"]
                )
            )
        )
    }
}
