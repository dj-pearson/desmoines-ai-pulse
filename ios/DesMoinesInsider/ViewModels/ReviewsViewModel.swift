import Foundation

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
    private(set) var errorMessage: String?

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

    var reviewCount: Int { reviews.count }

    /// Average rating — prefers the server aggregate, falls back to the loaded set.
    var averageRating: Double? {
        if let avg = aggregate?.averageRating, (aggregate?.totalRatings ?? 0) > 0 { return avg }
        guard !reviews.isEmpty else { return nil }
        let sum = reviews.reduce(0) { $0 + $1.ratingValue }
        return Double(sum) / Double(reviews.count)
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        async let list = loadReviews()
        async let agg: Void = loadAggregate()
        _ = await (list, agg)
        isLoading = false
    }

    private func loadReviews() async {
        do {
            reviews = try await service.fetchRatings(contentType: contentType, contentId: contentId)
        } catch {
            errorMessage = error.localizedDescription
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
        errorMessage = nil
        defer { isSubmitting = false }
        do {
            try await service.submitRating(
                contentType: contentType, contentId: contentId,
                userId: userId, rating: rating, reviewText: reviewText
            )
            await load()
            return true
        } catch {
            errorMessage = "Couldn't save your review. Please try again."
            return false
        }
    }

    func deleteOwnReview() async {
        guard let review = userReview else { return }
        do {
            try await service.deleteRating(id: review.id)
            await load()
        } catch {
            errorMessage = "Couldn't delete your review."
        }
    }

    func report(_ review: UserRating, reason: String = "Inappropriate content") async {
        guard let userId = currentUserId else { return }
        try? await service.reportRating(ratingId: review.id, reportedBy: userId, reason: reason)
    }
}
