import Foundation
import Supabase

/// Reviews & ratings backend (IOS-PARITY-009), reading/writing the same
/// `user_ratings` table the web useRatings hook uses (RLS: public read,
/// authenticated write of your own row). One row per user/content.
actor RatingsService {
    static let shared = RatingsService()

    private let supabase: SupabaseClient? = SupabaseService.shared.client

    enum ServiceError: LocalizedError {
        case notConfigured
        var errorDescription: String? { "Supabase is not configured." }
    }

    private func db() throws -> SupabaseClient {
        guard let supabase else { throw ServiceError.notConfigured }
        return supabase
    }

    // MARK: - Read

    /// The columns the list reads. Explicit rather than `*`, and no
    /// `profiles:user_id (...)` embed: user_ratings has no FK to profiles, so
    /// PostgREST answered that embed with PGRST200 and failed the whole list
    /// (WEB-QA-034 on the web; IOS-DD-GUIDES-02 here). `is_verified` is not
    /// requested because no migration creates it.
    static let ratingColumns =
        "id, content_type, content_id, user_id, rating, review_text, moderation_status, created_at, updated_at"

    /// Reviews for a piece of content, newest first, with short author names.
    ///
    /// Approved reviews only, plus the signed-in user's own in any state so
    /// they can see (and edit) what they wrote while it waits for moderation
    /// (IOS-DD-EVENTS-16, WEB-AUTO-009). The web filters the same way.
    func fetchRatings(contentType: String, contentId: String, currentUserId: String? = nil) async throws -> [UserRating] {
        var ratings: [UserRating] = try await withRetry { [self] in
            let client = try db()
            var visibility = "moderation_status.eq.approved"
            if let currentUserId, UUID(uuidString: currentUserId) != nil {
                visibility += ",user_id.eq.\(currentUserId)"
            }
            let ratings: [UserRating] = try await client
                .from("user_ratings")
                .select(Self.ratingColumns)
                .eq("content_type", value: contentType)
                .eq("content_id", value: contentId)
                .or(visibility)
                .order("created_at", ascending: false)
                .execute()
                .value
            return ratings
        }
        let names = await authorNames(for: ratings.map(\.userId))
        for i in ratings.indices {
            ratings[i].authorDisplayName = names[ratings[i].userId]
        }
        return ratings
    }

    /// Best-effort short names ("Dana M.") from review_author_names(). A
    /// failure leaves every row as "Local reviewer"; it never fails the list.
    private func authorNames(for userIds: [String]) async -> [String: String] {
        var seen = Set<String>()
        let ids = userIds.filter { UUID(uuidString: $0) != nil && seen.insert($0).inserted }
        guard !ids.isEmpty, let client = try? db() else { return [:] }
        struct NameRow: Decodable {
            let user_id: String
            let display_name: String?
        }
        let rows: [NameRow]? = try? await client
            .rpc("review_author_names", params: ["p_user_ids": Array(ids.prefix(100))])
            .execute()
            .value
        var names: [String: String] = [:]
        for row in rows ?? [] {
            if let name = row.display_name, !name.isEmpty { names[row.user_id] = name }
        }
        return names
    }

    func fetchAggregate(contentType: String, contentId: String) async -> ContentRatingAggregate? {
        guard let client = try? db() else { return nil }
        let rows: [ContentRatingAggregate]? = try? await client
            .from("content_rating_aggregates")
            .select("average_rating, total_ratings")
            .eq("content_type", value: contentType)
            .eq("content_id", value: contentId)
            .limit(1)
            .execute()
            .value
        return rows?.first
    }

    // MARK: - Write (auth required)

    /// The moderation state a new or edited review is written with, as the web
    /// sends it (src/hooks/useRatings.ts): a review with text waits for the
    /// moderate-content job; a bare star rating is approved. The column
    /// defaults to 'approved', so leaving it out published every review
    /// immediately (IOS-DD-EVENTS-16). The server trigger in
    /// 20261007000001 enforces the same rule whatever a client sends.
    static func moderationStatus(for reviewText: String?) -> String {
        let text = reviewText?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return text.isEmpty ? "approved" : "pending"
    }

    /// Insert or update the user's review (upsert on the unique key, matching
    /// the web onConflict "user_id,content_type,content_id").
    func submitRating(contentType: String, contentId: String, userId: String, rating: Int, reviewText: String?) async throws {
        let client = try db()
        struct Row: Encodable {
            let user_id: String
            let content_type: String
            let content_id: String
            let rating: String
            let review_text: String?
            let moderation_status: String
        }
        let row = Row(
            user_id: userId,
            content_type: contentType,
            content_id: contentId,
            rating: String(max(1, min(5, rating))),
            review_text: reviewText?.isEmpty == true ? nil : reviewText,
            moderation_status: Self.moderationStatus(for: reviewText)
        )
        try await client
            .from("user_ratings")
            .upsert(row, onConflict: "user_id,content_type,content_id")
            .execute()
    }

    func deleteRating(id: String) async throws {
        let client = try db()
        try await client.from("user_ratings").delete().eq("id", value: id).execute()
    }

    // MARK: - Moderation

    /// The shared report path the web (useRatings.ts) and Android use. It
    /// flags the review in content_moderation for an admin. The old insert
    /// into rating_abuse_reports went to a table no migration creates and no
    /// moderator reads (IOS-DD-GUIDES-03).
    static let reportRPCName = "report_review"
    static let reportRPCParam = "p_rating_id"

    /// Report a review. Throws so the UI can confirm success. The RPC raises
    /// 28000 when signed out and 'review_not_found' for a stale id.
    func reportRating(ratingId: String) async throws {
        let client = try db()
        try await client
            .rpc(Self.reportRPCName, params: [Self.reportRPCParam: ratingId])
            .execute()
    }
}
