import Foundation
import Supabase

/// Client for the discover-chat (Ask Pulse) edge function.
/// Implements IOS-DISCOVER-2026-001.
@MainActor
@Observable
final class AskPulseService {
    static let shared = AskPulseService()

    /// Longest message the composer accepts (IOS-DD-DISCOVER-16). The server
    /// clamps each message to 2000 characters; a question is never that long.
    nonisolated static let maxInputLength = 500

    /// Turns sent with each request. The server keeps the last 20 anyway.
    nonisolated static let maxHistory = 10

    struct ChatMessage: Identifiable, Hashable {
        let id = UUID()
        let role: Role
        let content: String
        /// The picks this assistant turn returned, shown under its bubble
        /// (IOS-DD-DISCOVER-16). Earlier cards used to vanish on each send.
        var picks: [Pick] = []
        /// What the model is sent for this turn, when it differs from what
        /// the user sees. An assistant turn's bubble says "Here are 3 ideas";
        /// the model needs the names and ids to answer a follow-up.
        var modelContent: String? = nil

        enum Role: String { case user, assistant }
    }

    struct Pick: Identifiable, Hashable, Decodable {
        var id: String { "\(itemType)-\(itemId)" }
        let itemType: ItemType
        let itemId: String
        let reason: String
        // Filled by the server from the row the model picked
        // (IOS-DD-DISCOVER-15). Optional: older servers send none of them.
        let title: String?
        let imageUrl: String?
        let startsAt: String?
        let endDate: String?
        let venue: String?
        let cuisine: String?
        let priceRange: String?

        enum ItemType: String, Decodable {
            case event, restaurant, attraction
        }

        enum CodingKeys: String, CodingKey {
            case itemType, itemId, reason, title, imageUrl, startsAt, endDate, venue, cuisine, priceRange
        }

        init(
            itemType: ItemType,
            itemId: String,
            reason: String,
            title: String? = nil,
            imageUrl: String? = nil,
            startsAt: String? = nil,
            endDate: String? = nil,
            venue: String? = nil,
            cuisine: String? = nil,
            priceRange: String? = nil
        ) {
            self.itemType = itemType
            self.itemId = itemId
            self.reason = reason
            self.title = title
            self.imageUrl = imageUrl
            self.startsAt = startsAt
            self.endDate = endDate
            self.venue = venue
            self.cuisine = cuisine
            self.priceRange = priceRange
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            itemType = try c.decode(ItemType.self, forKey: .itemType)
            itemId = try c.decode(String.self, forKey: .itemId)
            reason = try c.decode(String.self, forKey: .reason)
            title = try c.decodeIfPresent(String.self, forKey: .title)
            imageUrl = try c.decodeIfPresent(String.self, forKey: .imageUrl)
            startsAt = try c.decodeIfPresent(String.self, forKey: .startsAt)
            endDate = try c.decodeIfPresent(String.self, forKey: .endDate)
            venue = try c.decodeIfPresent(String.self, forKey: .venue)
            cuisine = try c.decodeIfPresent(String.self, forKey: .cuisine)
            priceRange = try c.decodeIfPresent(String.self, forKey: .priceRange)
        }
    }

    /// A crisis support line, as discover-chat sends it
    /// (supabase/functions/_shared/crisisSupport.ts). `contact` is prose
    /// ("Call or text 988"), not a number to dial.
    struct CrisisResource: Decodable, Hashable {
        let name: String
        let contact: String
        let description: String?
    }

    struct Response: Decodable {
        let picks: [Pick]
        let followUpSuggestions: [String]
        let usage: Usage?
        /// Set when the server detected distress in the conversation and
        /// answered with support resources instead of picks
        /// (IOS-DD-DISCOVER-13). The client used to decode only picks, find
        /// none, and reply "Want to try a different vibe?".
        let crisis: Bool?
        let message: String?
        let resources: [CrisisResource]?

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

        enum CodingKeys: String, CodingKey {
            case picks, followUpSuggestions, usage, crisis, message, resources
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            picks = try c.decodeIfPresent([Pick].self, forKey: .picks) ?? []
            // Lenient: a missing or malformed list is no suggestions, not a
            // failed response.
            followUpSuggestions = (try? c.decodeIfPresent([String].self, forKey: .followUpSuggestions)) ?? []
            usage = try? c.decodeIfPresent(Usage.self, forKey: .usage)
            crisis = try? c.decodeIfPresent(Bool.self, forKey: .crisis)
            message = try? c.decodeIfPresent(String.self, forKey: .message)
            resources = try? c.decodeIfPresent([CrisisResource].self, forKey: .resources)
        }
    }

    private(set) var lastUsage: Response.Usage?
    private(set) var lastError: String?

    private let supabase = SupabaseService.shared.client

    private init() {}

    /// What the model is sent for a conversation: each turn's `modelContent`
    /// when it has one, and only the last `maxHistory` turns
    /// (IOS-DD-DISCOVER-16).
    nonisolated static func requestMessages(_ messages: [ChatMessage]) -> [(role: String, content: String)] {
        messages.suffix(maxHistory).map { ($0.role.rawValue, $0.modelContent ?? $0.content) }
    }

    /// The assistant turn as the model should remember it: what it picked,
    /// with ids, so "the second one, but cheaper" means something.
    nonisolated static func modelSummary(_ picks: [Pick]) -> String {
        guard !picks.isEmpty else { return "No picks." }
        let lines = picks.enumerated().map { index, pick in
            "\(index + 1). \(pick.title ?? pick.itemType.rawValue) (\(pick.itemType.rawValue) \(pick.itemId)) - \(pick.reason)"
        }
        return "Picked: " + lines.joined(separator: "; ")
    }

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
            messages: Self.requestMessages(messages).map { .init(role: $0.role, content: $0.content) },
            userLocation: userLocation.map { .init(latitude: $0.0, longitude: $0.1) },
        )

        let response: Response
        do {
            response = try await client.functions.invoke(
                "discover-chat",
                options: .init(body: payload),
            )
        } catch {
            // The Functions client wraps non-2xx in FunctionsError.httpError.
            // Read the body the function sent instead of the generic
            // "non-2xx status code" text (IOS-DD-DISCOVER-14).
            if case let FunctionsError.httpError(code, data) = error,
               let classified = Self.classify(status: code, body: data) {
                lastError = classified.errorDescription
                throw classified
            }
            throw error
        }

        // A crisis response carries no usage; keep the last known count.
        if let usage = response.usage { lastUsage = usage }
        lastError = nil
        return response
    }

    /// Maps a discover-chat error response to what the view says
    /// (IOS-DD-DISCOVER-14). Every 429 used to be one "Upgrade for more"
    /// upsell, including the AI budget pause, which no upgrade lifts.
    ///
    /// 401: the function needs an account. 429 with code quota_exceeded: the
    /// tier's daily questions are used (upgradeHint is null on VIP). 429 with
    /// ai_budget_paused: AI is off for everyone. A 429 with no code is the
    /// per-IP burst limiter; its text is shown as it is.
    nonisolated static func classify(status: Int, body: Data) -> AskPulseError? {
        struct Body: Decodable {
            let error: String?
            let code: String?
            let upgradeHint: String?
            let retryAfter: Int?
        }
        let decoded = try? JSONDecoder().decode(Body.self, from: body)
        switch status {
        case 401:
            return .signInRequired
        case 429:
            switch decoded?.code {
            case "ai_budget_paused":
                return .paused
            case "quota_exceeded":
                return .quota(upgradeHint: decoded?.upgradeHint, retryAfter: decoded?.retryAfter)
            default:
                if let message = decoded?.error, !message.isEmpty { return .server(message: message) }
                return .quota(upgradeHint: nil, retryAfter: decoded?.retryAfter)
            }
        default:
            guard !(200..<300).contains(status),
                  let message = decoded?.error, !message.isEmpty else { return nil }
            return .server(message: message)
        }
    }

    enum AskPulseError: LocalizedError, Equatable {
        case notConfigured
        case signInRequired
        case quota(upgradeHint: String?, retryAfter: Int?)
        case paused
        case server(message: String)

        var errorDescription: String? {
            switch self {
            case .notConfigured: return "Ask Pulse is not configured."
            case .signInRequired: return "Sign in to ask Pulse."
            case .quota: return "You've used today's Ask Pulse questions. They reset at midnight."
            case .paused: return "Pulse is resting right now. Try again later."
            case .server(let message): return message
            }
        }
    }
}
