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

            // Vote counts per category, aggregated server-side
            // (IOS-AUDIT-PERF-026). This used to SELECT every row of `votes` and
            // count them here, so the read grew with total votes cast app-wide -
            // and it pulled ballots the app has no use for.
            struct TallyRow: Decodable { let category_id: String; let vote_count: Int }
            let tallies: [TallyRow] = (try? await client
                .rpc("voting_category_tallies")
                .execute()
                .value) ?? []
            let counts = Dictionary(uniqueKeysWithValues: tallies.map { ($0.category_id, $0.vote_count) })

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

        // Aggregated server-side (IOS-AUDIT-PERF-026). The RPC groups by
        // entity_id, falling back to custom_entry, which is exactly what
        // VoteResult.aggregate does. That helper is no longer called from
        // here - it is kept for its tests, which pin the grouping rule the
        // SQL now has to match.
        struct ResultRow: Decodable {
            let entity_type: String
            let entity_id: String?
            let custom_entry: String?
            let vote_count: Int
        }
        struct ResultsParams: Encodable { let p_category_id: String }

        // The raw-table fallback that used to sit here has been REMOVED
        // (WEB-SEC-025 step 2). It was there for a project without the RPC
        // deployed; both RPCs are deployed and verified against production.
        //
        // Keeping it would have defeated the point. Step 3 replaces the
        // "Public read votes" USING (true) policy, and it can only run once
        // no shipped binary reads the raw table - a fallback is a read path
        // that survives the policy change and starts failing then, on a
        // release nobody connects to this one.
        //
        // An RPC failure now yields an empty leaderboard rather than raw
        // ballots, which is the correct direction to fail.
        let rows: [ResultRow] = (try? await client
            .rpc("voting_results", params: ResultsParams(p_category_id: categoryId))
            .execute()
            .value) ?? []
        var results: [VoteResult] = rows.map {
            VoteResult(
                entityType: $0.entity_type,
                entityId: $0.entity_id,
                customEntry: $0.custom_entry,
                voteCount: $0.vote_count
            )
        }

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
    /// Server-side since WEB-SEC-025 step 2.
    ///
    /// This was the widest read of the ballot table in the app: unlike the
    /// leaderboard it was not scoped to a category, so it pulled every vote
    /// ever cast, each carrying user_id, to compute one map of at most a few
    /// dozen entries. It also fetched the category list purely to resolve
    /// names, which the RPC now joins.
    ///
    /// Ties resolve by entity_id in SQL. Dictionary.max(by:) resolved them by
    /// whatever order the hash table yielded, which was not stable between
    /// launches.
    func fetchWinners() async -> [String: String] {
        guard let client = try? db() else { return [:] }

        struct WinnerRow: Decodable {
            let category_name: String
            let entity_id: String
        }
        let rows: [WinnerRow] = (try? await client
            .rpc("voting_winners")
            .execute()
            .value) ?? []

        var winners: [String: String] = [:]
        for row in rows {
            // Last write wins if an entity tops multiple categories - rare,
            // and acceptable for a badge.
            winners[row.entity_id] = row.category_name
        }
        return winners
    }
}
