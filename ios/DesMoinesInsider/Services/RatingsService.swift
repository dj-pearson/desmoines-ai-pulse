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

    /// All reviews for a piece of content, newest first, with author profile.
    func fetchRatings(contentType: String, contentId: String) async throws -> [UserRating] {
        try await withRetry { [self] in
            let client = try db()
            let ratings: [UserRating] = try await client
                .from("user_ratings")
                .select("*, profiles:user_id (first_name, last_name)")
                .eq("content_type", value: contentType)
                .eq("content_id", value: contentId)
                .order("created_at", ascending: false)
                .execute()
                .value
            return ratings
        }
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
        }
        let row = Row(
            user_id: userId,
            content_type: contentType,
            content_id: contentId,
            rating: String(max(1, min(5, rating))),
            review_text: reviewText?.isEmpty == true ? nil : reviewText
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

    /// Report a review for abuse (rating_abuse_reports). Fail-soft is up to the
    /// caller; we throw so the UI can confirm success.
    func reportRating(ratingId: String, reportedBy: String, reason: String) async throws {
        let client = try db()
        struct Row: Encodable {
            let rating_id: String
            let reported_by: String
            let reason: String
        }
        try await client
            .from("rating_abuse_reports")
            .insert(Row(rating_id: ratingId, reported_by: reportedBy, reason: reason))
            .execute()
    }
}
