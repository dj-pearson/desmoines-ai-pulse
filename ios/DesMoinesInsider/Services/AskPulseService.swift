import Foundation
import Supabase

/// Client for the discover-chat (Ask Pulse) edge function.
/// Implements IOS-DISCOVER-2026-001.
@MainActor
@Observable
final class AskPulseService {
    static let shared = AskPulseService()

    struct ChatMessage: Identifiable, Hashable {
        let id = UUID()
        let role: Role
        let content: String

        enum Role: String { case user, assistant }
    }

    struct Pick: Identifiable, Hashable, Decodable {
        var id: String { "\(itemType)-\(itemId)" }
        let itemType: ItemType
        let itemId: String
        let reason: String

        enum ItemType: String, Decodable {
            case event, restaurant, attraction
        }
    }

    struct Response: Decodable {
        let picks: [Pick]
        let followUpSuggestions: [String]
        let usage: Usage?

        struct Usage: Decodable {
            let remaining: RemainingValue
            let tier: String
        }

        /// Backend returns either an integer or the string "unlimited".
        enum RemainingValue: Decodable {
            case unlimited
            case count(Int)

            init(from decoder: Decoder) throws {
                let c = try decoder.singleValueContainer()
                if let i = try? c.decode(Int.self) { self = .count(i); return }
                if let s = try? c.decode(String.self), s == "unlimited" {
                    self = .unlimited
                    return
                }
                self = .count(0)
            }

            var displayString: String {
                switch self {
                case .unlimited: return "unlimited"
                case .count(let n): return "\(n) left today"
                }
            }
        }
    }

    private(set) var lastUsage: Response.Usage?
    private(set) var lastError: String?

    private let supabase = SupabaseService.shared.client

    private init() {}

    /// Send a conversation to /discover-chat. Conversation history is supplied
    /// by the caller — we don't persist it server-side in v1 (per spec, no
    /// privacy-control work to ship).
    func ask(messages: [ChatMessage], userLocation: (Double, Double)?) async throws -> Response {
        guard let client = supabase else {
            throw AskPulseError.notConfigured
        }

        struct RequestMessage: Encodable {
            let role: String
            let content: String
        }
        struct LocationPayload: Encodable {
            let latitude: Double
            let longitude: Double
        }
        struct Payload: Encodable {
            let messages: [RequestMessage]
            let userLocation: LocationPayload?
        }

        let payload = Payload(
            messages: messages.map { .init(role: $0.role.rawValue, content: $0.content) },
            userLocation: userLocation.map { .init(latitude: $0.0, longitude: $0.1) },
        )

        do {
            let response: Response = try await client.functions.invoke(
                "discover-chat",
                options: .init(body: payload),
            )

            lastUsage = response.usage
            lastError = nil
            return response
        } catch {
            // The edge function returns HTTP 429 ("Daily Ask Pulse limit
            // reached") when the per-day quota is exhausted. Surface that as a
            // dedicated error so the UI can offer an upgrade path instead of a
            // raw error string. Everything else propagates unchanged.
            if Self.isQuotaExceeded(error) {
                lastError = AskPulseError.quotaExceeded.errorDescription
                throw AskPulseError.quotaExceeded
            }
            throw error
        }
    }

    /// Detects the discover-chat quota response (HTTP 429). Matches on the
    /// Supabase `FunctionsError.httpError` status when available, with a
    /// string fallback for robustness across SDK versions.
    private static func isQuotaExceeded(_ error: Error) -> Bool {
        if case let FunctionsError.httpError(code, _) = error, code == 429 {
            return true
        }
        return error.localizedDescription.contains("429")
    }

    enum AskPulseError: LocalizedError {
        case notConfigured
        case quotaExceeded

        var errorDescription: String? {
            switch self {
            case .notConfigured: return "Ask Pulse is not configured."
            case .quotaExceeded: return "You've hit today's Ask Pulse limit. Upgrade for more."
            }
        }
    }
}
