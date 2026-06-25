import Foundation
import Supabase

/// Backend for "Best Of" community voting (IOS-PARITY-005). Reads the same
/// `voting_categories` / `votes` tables the web useVoting.ts hook uses, and
/// casts votes with the one-per-category-per-user rule (delete-then-insert,
/// matching the web upsert). Public reads; votes require auth (enforced by RLS).
actor VotingService {
    static let shared = VotingService()

    private let supabase: SupabaseClient? = SupabaseService.shared.client

    enum ServiceError: LocalizedError {
        case notConfigured
        case notAuthenticated
        var errorDescription: String? {
            switch self {
            case .notConfigured: return "Supabase is not configured."
            case .notAuthenticated: return "Please sign in to vote."
            }
        }
    }

    private func db() throws -> SupabaseClient {
        guard let supabase else { throw ServiceError.notConfigured }
        return supabase
    }

    // MARK: - Categories

    /// Active categories with their total vote counts (mirrors useVotingCategories).
    func fetchCategories() async throws -> [VotingCategory] {
        try await withRetry { [self] in
            let client = try db()
            var categories: [VotingCategory] = try await client
                .from("voting_categories")
                .select()
                .eq("is_active", value: true)
                .order("name", ascending: true)
                .execute()
                .value

            // Vote counts per category (one extra read, like the web).
            struct CountRow: Decodable { let category_id: String }
            let countRows: [CountRow] = (try? await client
                .from("votes")
                .select("category_id")
                .execute()
                .value) ?? []
            var counts: [String: Int] = [:]
            for row in countRows { counts[row.category_id, default: 0] += 1 }

            for i in categories.indices {
                categories[i].voteCount = counts[categories[i].id] ?? 0
            }
            return categories
        }
    }

    // MARK: - Results (leaderboard)

    /// Aggregated, enriched, descending-by-count results for a category.
    func fetchResults(categoryId: String) async throws -> [VoteResult] {
        let client = try db()

        struct VoteRow: Decodable {
            let entity_type: String
            let entity_id: String?
            let custom_entry: String?
        }
        let votes: [VoteRow] = try await client
            .from("votes")
            .select("entity_type, entity_id, custom_entry")
            .eq("category_id", value: categoryId)
            .execute()
            .value

        // Aggregate by entity_id (or custom_entry) via the shared pure helper.
        var results = VoteResult.aggregate(votes.map {
            VoteResult.Raw(entityType: $0.entity_type, entityId: $0.entity_id, customEntry: $0.custom_entry)
        })

        await enrich(&results, client: client)
        return results
    }

    /// Fill in name + image for restaurant/attraction entities (custom entries
    /// use their text as the name). Fails soft per type.
    private func enrich(_ results: inout [VoteResult], client: SupabaseClient) async {
        struct NamedRow: Decodable { let id: String; let name: String; let image_url: String? }

        let restaurantIds = results.filter { $0.entityType == "restaurant" }.compactMap(\.entityId)
        if !restaurantIds.isEmpty,
           let rows: [NamedRow] = try? await client
            .from("restaurants").select("id, name, image_url").in("id", values: restaurantIds)
            .execute().value {
            let byId = Dictionary(uniqueKeysWithValues: rows.map { ($0.id, $0) })
            for i in results.indices where results[i].entityType == "restaurant" {
                if let id = results[i].entityId, let row = byId[id] {
                    results[i].name = row.name
                    results[i].imageUrl = row.image_url
                }
            }
        }

        let attractionIds = results.filter { $0.entityType == "attraction" }.compactMap(\.entityId)
        if !attractionIds.isEmpty,
           let rows: [NamedRow] = try? await client
            .from("attractions").select("id, name, image_url").in("id", values: attractionIds)
            .execute().value {
            let byId = Dictionary(uniqueKeysWithValues: rows.map { ($0.id, $0) })
            for i in results.indices where results[i].entityType == "attraction" {
                if let id = results[i].entityId, let row = byId[id] {
                    results[i].name = row.name
                    results[i].imageUrl = row.image_url
                }
            }
        }

        for i in results.indices where results[i].name == nil {
            results[i].name = results[i].customEntry
        }
    }

    // MARK: - User vote

    func fetchUserVote(categoryId: String, userId: String) async throws -> Vote? {
        let client = try db()
        let votes: [Vote] = try await client
            .from("votes")
            .select()
            .eq("category_id", value: categoryId)
            .eq("user_id", value: userId)
            .limit(1)
            .execute()
            .value
        return votes.first
    }

    // MARK: - Cast vote (one per category per user)

    /// Atomic upsert on the (category_id, user_id) unique key, matching the web
    /// onConflict behaviour. Replaces a delete-then-insert pair that left the
    /// user with no vote if a crash/failure landed between the two requests and
    /// let a concurrent tally read a transient zero/double count. Throws if not
    /// signed in.
    func castVote(categoryId: String, userId: String, entityType: String, entityId: String?, customEntry: String?) async throws {
        let client = try db()

        struct VoteRow: Encodable {
            let category_id: String
            let entity_type: String
            let entity_id: String?
            let custom_entry: String?
            let user_id: String
        }
        try await client
            .from("votes")
            .upsert(
                VoteRow(
                    category_id: categoryId,
                    entity_type: entityType,
                    entity_id: entityId,
                    custom_entry: customEntry,
                    user_id: userId
                ),
                onConflict: "category_id,user_id"
            )
            .execute()
    }

    // MARK: - Nominee search

    /// Search restaurants + attractions by name to vote for (mirrors VotingBooth).
    func searchNominees(query: String, limitPerType: Int = 5) async -> [VoteNominee] {
        guard query.count >= 2, let client = try? db() else { return [] }
        struct NamedRow: Decodable { let id: String; let name: String; let image_url: String? }

        var nominees: [VoteNominee] = []
        if let rows: [NamedRow] = try? await client
            .from("restaurants").select("id, name, image_url").ilike("name", pattern: "%\(query)%")
            .limit(limitPerType).execute().value {
            nominees += rows.map { VoteNominee(id: $0.id, name: $0.name, type: "restaurant", imageUrl: $0.image_url) }
        }
        if let rows: [NamedRow] = try? await client
            .from("attractions").select("id, name, image_url").ilike("name", pattern: "%\(query)%")
            .limit(limitPerType).execute().value {
            nominees += rows.map { VoteNominee(id: $0.id, name: $0.name, type: "attraction", imageUrl: $0.image_url) }
        }
        return nominees
    }

    // MARK: - Winners (for award badges, IOS-PARITY-005)

    /// Builds the entityId → category-name map for the current #1 (entity-backed)
    /// pick in each active category. Custom write-ins can't badge a listing card,
    /// so only entity_id winners are included. Fails soft to an empty map.
    func fetchWinners() async -> [String: String] {
        guard let client = try? db() else { return [:] }
        do {
            let categories: [VotingCategory] = try await client
                .from("voting_categories")
                .select()
                .eq("is_active", value: true)
                .execute()
                .value

            struct VoteRow: Decodable {
                let category_id: String
                let entity_id: String?
            }
            let votes: [VoteRow] = try await client
                .from("votes")
                .select("category_id, entity_id")
                .execute()
                .value

            // Tally entity votes per category.
            var tally: [String: [String: Int]] = [:] // categoryId -> entityId -> count
            for v in votes {
                guard let entityId = v.entity_id else { continue }
                tally[v.category_id, default: [:]][entityId, default: 0] += 1
            }

            let categoryName = Dictionary(uniqueKeysWithValues: categories.map { ($0.id, $0.name) })
            var winners: [String: String] = [:]
            for (categoryId, entityCounts) in tally {
                guard let name = categoryName[categoryId],
                      let top = entityCounts.max(by: { $0.value < $1.value }) else { continue }
                // Last write wins if an entity tops multiple categories — rare;
                // acceptable for a badge.
                winners[top.key] = name
            }
            return winners
        } catch {
            return [:]
        }
    }
}
