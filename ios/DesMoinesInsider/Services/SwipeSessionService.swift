import Foundation
import Supabase

/// Whether Group Session is offered (IOS-DD-DISCOVER-01). Hosting and joining
/// work, but nothing ties the swipe deck to a session yet: swipes are never
/// written with a session_id and no screen reads matches, so a group would
/// swipe and never see one. Flip this when that ships (D7-DEF-01).
enum GroupSessionFeature {
    static let isEnabled = false
}

/// Manages shared swipe sessions for group decision mode.
/// IOS-DISCOVER-2026-006.
///
/// Hosting requires authentication; joining is allowed anonymously via a
/// device-scoped anon_id stored in the keychain.
@MainActor
@Observable
final class SwipeSessionService {
    static let shared = SwipeSessionService()

    struct Session: Decodable, Hashable {
        let id: UUID
        let code: String
        let mode: String
        let status: String
        let expiresAt: String?
        let endedAt: String?
        /// Optional so a select that leaves it out still decodes.
        var hostUserId: UUID? = nil

        enum CodingKeys: String, CodingKey {
            case id, code, mode, status
            case expiresAt = "expires_at"
            case endedAt = "ended_at"
            case hostUserId = "host_user_id"
        }
    }

    struct Participant: Decodable, Hashable, Identifiable {
        let id: UUID
        let userId: UUID?
        let anonId: String?
        let displayName: String?
        let joinedAt: String?

        enum CodingKeys: String, CodingKey {
            case id
            case userId = "user_id"
            case anonId = "anon_id"
            case displayName = "display_name"
            case joinedAt = "joined_at"
        }
    }

    struct Match: Decodable, Hashable {
        let itemType: String
        let itemId: UUID
        let matchCount: Int

        enum CodingKeys: String, CodingKey {
            case itemType = "item_type"
            case itemId = "item_id"
            case matchCount = "match_count"
        }
    }

    private(set) var activeSession: Session?
    private(set) var participants: [Participant] = []
    private(set) var matches: [Match] = []

    private let supabase = SupabaseService.shared.client
    private let anonIdKey = "swipe_session.anon_id"

    private init() {}

    // MARK: - Anon identity

    /// Stable per-device identifier for users who join without signing in.
    /// Stored in UserDefaults — Keychain would survive reinstall, which we
    /// explicitly DON'T want here (a fresh install should look like a new
    /// participant).
    var deviceAnonId: String {
        if let existing = UserDefaults.standard.string(forKey: anonIdKey) {
            return existing
        }
        let new = UUID().uuidString
        UserDefaults.standard.set(new, forKey: anonIdKey)
        return new
    }

    // MARK: - Decoding

    private struct CodeRow: Decodable { let code: String }

    /// The generated code from the RPC body: a bare JSON string (what a
    /// scalar function returns), or a `[{"code": ...}]` row set as a fallback.
    nonisolated static func decodeSessionCode(_ data: Data) throws -> String {
        let decoder = JSONDecoder()
        if let code = try? decoder.decode(String.self, from: data), isValidCode(code) {
            return code
        }
        if let rows = try? decoder.decode([CodeRow].self, from: data),
           let code = rows.first?.code, isValidCode(code) {
            return code
        }
        throw SessionError.codeGenerationFailed
    }

    nonisolated static func isValidCode(_ code: String) -> Bool {
        code.range(of: "^DSM-[A-Z0-9]{4}$", options: .regularExpression) != nil
    }

    /// The participant row already exists (unique index on session and
    /// identity): joining twice is fine. FavoritesService.errorCode reads the
    /// code structurally, so a test can throw a stub.
    nonisolated static func isAlreadyJoined(_ error: Error) -> Bool {
        FavoritesService.errorCode(error) == "23505"
    }

    // MARK: - Host

    /// Create a new session as the host (must be signed in).
    func startSession(mode: String) async throws -> Session {
        guard let client = supabase else {
            throw SessionError.notConfigured
        }

        let session = try await client.auth.session
        let userId = session.user.id

        // Generate a code via RPC so collisions are checked server-side. The
        // function RETURNS TEXT, which PostgREST sends as a bare JSON string;
        // decoding it as [CodeRow] threw on every call, so Host never worked
        // (IOS-DD-DISCOVER-01).
        let data = try await client
            .rpc("generate_swipe_session_code")
            .execute()
            .data
        let code = try Self.decodeSessionCode(data)

        struct InsertRow: Encodable {
            let code: String
            let host_user_id: UUID
            let mode: String
        }
        let inserted: [Session] = try await client
            .from("swipe_sessions")
            .insert(InsertRow(code: code, host_user_id: userId, mode: mode))
            .select()
            .execute()
            .value
        guard let created = inserted.first else { throw SessionError.insertFailed }

        // Auto-join the host as the first participant.
        try await join(session: created, displayName: "Host")

        activeSession = created
        return created
    }

    /// End the host session (only the host can do this).
    func endSession(_ session: Session) async throws {
        guard let client = supabase else { throw SessionError.notConfigured }
        struct UpdateRow: Encodable {
            let status: String
            let ended_at: String
        }
        try await client
            .from("swipe_sessions")
            .update(UpdateRow(status: "ended", ended_at: ISO8601DateFormatter().string(from: Date())))
            .eq("id", value: session.id.uuidString)
            .execute()
        if activeSession?.id == session.id {
            activeSession = nil
        }
    }

    // MARK: - Join

    func lookupSession(byCode code: String) async throws -> Session {
        guard let client = supabase else { throw SessionError.notConfigured }
        let normalized = code.uppercased()
        let rows: [Session] = try await client
            .from("swipe_sessions")
            .select()
            .eq("code", value: normalized)
            .eq("status", value: "active")
            // Nothing ends a session at expires_at, so an expired code still
            // matched here and the join then failed the RLS check
            // (IOS-DD-DISCOVER-01).
            .gt("expires_at", value: ISO8601DateFormatter().string(from: Date()))
            .limit(1)
            .execute()
            .value
        guard let session = rows.first else { throw SessionError.notFound }
        return session
    }

    func join(session: Session, displayName: String?) async throws {
        guard let client = supabase else { throw SessionError.notConfigured }

        struct AnonRow: Encodable {
            let session_id: UUID
            let anon_id: String
            let display_name: String?
        }
        struct AuthedRow: Encodable {
            let session_id: UUID
            let user_id: UUID
            let display_name: String?
        }

        if let authSession = try? await client.auth.session {
            let row = AuthedRow(
                session_id: session.id,
                user_id: authSession.user.id,
                display_name: displayName,
            )
            // A duplicate (already joined) is fine. Anything else is a real
            // failure: `try?` used to report RLS and network errors as a
            // successful join (IOS-DD-DISCOVER-01).
            do {
                try await client
                    .from("swipe_session_participants")
                    .insert(row)
                    .execute()
            } catch let error where Self.isAlreadyJoined(error) {}
        } else {
            let row = AnonRow(
                session_id: session.id,
                anon_id: deviceAnonId,
                display_name: displayName ?? "Guest",
            )
            do {
                try await client
                    .from("swipe_session_participants")
                    .insert(row)
                    .execute()
            } catch let error where Self.isAlreadyJoined(error) {}
        }
        activeSession = session
    }

    // MARK: - Realtime + matches

    /// Fetches the current match list for a session. Called periodically by
    /// DiscoverViewModel during a group session (every ~3 seconds during
    /// active swiping) — Realtime subscription wiring is the enhancement
    /// path; the polling fallback works on every iOS version we support.
    func fetchMatches(for session: Session) async throws -> [Match] {
        guard let client = supabase else { throw SessionError.notConfigured }
        struct Params: Encodable { let p_session_id: UUID }
        let rows: [Match] = try await client
            .rpc("get_swipe_session_matches", params: Params(p_session_id: session.id))
            .execute()
            .value
        matches = rows
        return rows
    }

    func fetchParticipants(for session: Session) async throws -> [Participant] {
        guard let client = supabase else { throw SessionError.notConfigured }
        let rows: [Participant] = try await client
            .from("swipe_session_participants")
            .select()
            .eq("session_id", value: session.id.uuidString)
            .order("joined_at", ascending: true)
            .execute()
            .value
        participants = rows
        return rows
    }

    enum SessionError: LocalizedError {
        case notConfigured
        case codeGenerationFailed
        case insertFailed
        case notFound

        var errorDescription: String? {
            switch self {
            case .notConfigured: return "Group sessions not configured."
            case .codeGenerationFailed: return "Couldn't generate a session code."
            case .insertFailed: return "Couldn't create the session."
            case .notFound: return "That session code doesn't exist or has expired."
            }
        }
    }
}
