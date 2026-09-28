import Foundation
import Supabase

/// Drives the reviews section on a detail screen (IOS-PARITY-009). Loads the
/// review list + aggregate + the current user's own review, and handles
/// submit / delete / report. Writing is gated to Insider+ (the view shows the
/// paywall); reading is free.
@MainActor
@Observable
final class ReviewsViewModel {
    let contentType: String
    let contentId: String

    private(set) var reviews: [UserRating] = []
    private(set) var aggregate: ContentRatingAggregate?
    private(set) var isLoading = true
    private(set) var isSubmitting = false
    /// Set only by loading the list; drives the section's retry state.
    private(set) var loadError: String?
    /// Set by submit / delete / report and cleared when the next one starts.
    /// Kept apart from loadError so a failed post on a listing with no
    /// reviews is not shown as "Couldn't load reviews" (IOS-DD-GUIDES-04).
    private(set) var actionError: String?

    enum ReportOutcome: Equatable {
        case sent
        case needsSignIn
        case failed(String)
    }

    private let service = RatingsService.shared
    private let auth = AuthService.shared
    private let storeKit = StoreKitService.shared

    init(contentType: String, contentId: String) {
        self.contentType = contentType
        self.contentId = contentId
    }

    var isAuthenticated: Bool { auth.isAuthenticated }

    /// Whether the signed-in user may write reviews (Insider+).
    var canWriteReviews: Bool { storeKit.hasFeature(.writeReviews) }

    var currentUserId: String? { auth.currentUser?.id.uuidString }

    /// The current user's existing review, if any.
    var userReview: UserRating? {
        guard let uid = currentUserId else { return nil }
        return reviews.first { $0.userId == uid }
    }

    var reviewCount: Int { Self.summary(reviews: reviews, aggregate: aggregate).count }

    /// Average rating: the server aggregate when it has one, else the
    /// approved reviews loaded here.
    var averageRating: Double? { Self.summary(reviews: reviews, aggregate: aggregate).average }

    /// Reviews anyone can see. The viewer's own pending or rejected row is
    /// listed (so they can edit it) but never counted.
    nonisolated static func approved(_ reviews: [UserRating]) -> [UserRating] {
        reviews.filter { ($0.moderationStatus ?? "approved") == "approved" }
    }

    /// The header's average and count, from one source so they agree: the
    /// aggregate's pair when it has ratings, otherwise the approved rows
    /// (IOS-DD-GUIDES-04).
    nonisolated static func summary(
        reviews: [UserRating], aggregate: ContentRatingAggregate?
    ) -> (average: Double?, count: Int) {
        if let avg = aggregate?.averageRating, let total = aggregate?.totalRatings, total > 0 {
            return (avg, total)
        }
        let rows = Self.approved(reviews)
        guard !rows.isEmpty else { return (nil, 0) }
        let sum = rows.reduce(0) { $0 + $1.ratingValue }
        return (Double(sum) / Double(rows.count), rows.count)
    }

    func load() async {
        isLoading = true
        loadError = nil
        async let list = loadReviews()
        async let agg: Void = loadAggregate()
        _ = await (list, agg)
        isLoading = false
    }

    private func loadReviews() async {
        do {
            reviews = try await service.fetchRatings(
                contentType: contentType, contentId: contentId, currentUserId: currentUserId
            )
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func loadAggregate() async {
        aggregate = await service.fetchAggregate(contentType: contentType, contentId: contentId)
    }

    /// Submit/update the user's review. Returns true on success.
    @discardableResult
    func submit(rating: Int, reviewText: String) async -> Bool {
        guard let userId = currentUserId else { return false }
        isSubmitting = true
        actionError = nil
        defer { isSubmitting = false }
        do {
            try await service.submitRating(
                contentType: contentType, contentId: contentId,
                userId: userId, rating: rating, reviewText: reviewText
            )
            await load()
            return true
        } catch {
            actionError = "Couldn't save your review. Please try again."
            return false
        }
    }

    /// Delete the user's own review. Returns true on success so the view can
    /// confirm (IOS-AUDIT-UX-023).
    @discardableResult
    func deleteOwnReview() async -> Bool {
        guard let review = userReview else { return false }
        actionError = nil
        do {
            try await service.deleteRating(id: review.id)
            await load()
            return true
        } catch {
            actionError = "Couldn't delete your review."
            return false
        }
    }

    /// Report a review through report_review(). Signed out is a sign-in
    /// prompt, not a failed request (IOS-DD-GUIDES-03/04).
    func report(_ review: UserRating) async -> ReportOutcome {
        guard currentUserId != nil else { return .needsSignIn }
        actionError = nil
        do {
            try await service.reportRating(ratingId: review.id)
            return .sent
        } catch {
            let message = Self.reportFailureMessage((error as? PostgrestError)?.message)
            actionError = message
            return .failed(message)
        }
    }

    nonisolated static func reportFailureMessage(_ serverMessage: String?) -> String {
        if serverMessage?.contains("review_not_found") == true {
            return "This review is no longer available."
        }
        return "Couldn't submit your report. Please try again."
    }
}
