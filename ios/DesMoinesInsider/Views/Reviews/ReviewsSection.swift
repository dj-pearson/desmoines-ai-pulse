import SwiftUI

/// Reusable reviews & ratings section (IOS-PARITY-009) embedded at the bottom of
/// Event / Restaurant / Attraction detail screens. Reading is free; writing is
/// gated to Insider+ via the contextual paywall. Users can edit/delete their own
/// review and report others.
struct ReviewsSection: View {
    let contentType: String
    let contentId: String

    @State private var viewModel: ReviewsViewModel
    @State private var showComposer = false
    @State private var showPaywall = false
    @State private var reportTarget: UserRating?

    init(contentType: String, contentId: String) {
        self.contentType = contentType
        self.contentId = contentId
        _viewModel = State(wrappedValue: ReviewsViewModel(contentType: contentType, contentId: contentId))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header
            writeButton

            if viewModel.isLoading && viewModel.reviews.isEmpty {
                ProgressView().frame(maxWidth: .infinity).padding(.vertical, 8)
            } else if let error = viewModel.errorMessage, viewModel.reviews.isEmpty {
                // Retryable error state (IOS-COMPLY-004) — never a dead end.
                errorRetry(error)
            } else if viewModel.reviews.isEmpty {
                Text("No reviews yet. Be the first to share your take!")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(viewModel.reviews) { review in
                    reviewRow(review)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .task { await viewModel.load() }
        .sheet(isPresented: $showComposer) {
            ReviewComposer(
                existing: viewModel.userReview,
                isSubmitting: viewModel.isSubmitting
            ) { rating, text in
                let ok = await viewModel.submit(rating: rating, reviewText: text)
                if ok { showComposer = false }
                return ok
            }
        }
        .sheet(isPresented: $showPaywall) {
            PaywallView(context: .writeReviews)
        }
        .confirmationDialog("Report this review?", isPresented: Binding(
            get: { reportTarget != nil }, set: { if !$0 { reportTarget = nil } }
        ), titleVisibility: .visible) {
            Button("Report as inappropriate", role: .destructive) {
                if let target = reportTarget {
                    Task { await viewModel.report(target) }
                }
                reportTarget = nil
            }
            Button("Cancel", role: .cancel) { reportTarget = nil }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Reviews").font(.title3.bold())
            Spacer()
            if let avg = viewModel.averageRating {
                HStack(spacing: 4) {
                    Image(systemName: "star.fill").font(.caption).foregroundStyle(.yellow)
                    Text(String(format: "%.1f", avg)).font(.subheadline.weight(.semibold))
                    Text("(\(viewModel.reviewCount))").font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }

    // MARK: - Write button (gated)

    @ViewBuilder
    private var writeButton: some View {
        Button {
            if !viewModel.isAuthenticated || !viewModel.canWriteReviews {
                showPaywall = true
            } else {
                showComposer = true
            }
        } label: {
            Label(viewModel.userReview == nil ? "Write a review" : "Edit your review",
                  systemImage: "square.and.pencil")
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 11)
                .background(Color.accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                .foregroundStyle(Color.accentColor)
        }
        .accessibilityHint(viewModel.canWriteReviews ? "" : "Insider feature")
    }

    // MARK: - Error / retry

    private func errorRetry(_ error: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.yellow)
            Text("Couldn't load reviews.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(2)
            Spacer()
            Button {
                Task { await viewModel.load() }
            } label: {
                Text("Retry").font(.subheadline.bold()).foregroundStyle(Color.accentColor)
            }
            .accessibilityLabel("Retry loading reviews")
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Couldn't load reviews. \(error)")
    }

    // MARK: - Review row

    private func reviewRow(_ review: UserRating) -> some View {
        let isOwn = review.userId == viewModel.currentUserId
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                stars(review.ratingValue)
                Spacer()
                Menu {
                    if isOwn {
                        Button("Edit", systemImage: "pencil") { showComposer = true }
                        Button("Delete", systemImage: "trash", role: .destructive) {
                            Task { await viewModel.deleteOwnReview() }
                        }
                    } else {
                        Button("Report", systemImage: "flag") { reportTarget = review }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .foregroundStyle(.secondary)
                        // IOS-COMPLY-003: guarantee a 44×44 hit target (was 28×24).
                        .minHitTarget()
                }
                .accessibilityLabel("Review options")
            }

            if let text = review.reviewText, !text.isEmpty {
                Text(text).font(.subheadline).foregroundStyle(.primary)
            }

            HStack(spacing: 6) {
                Text(isOwn ? "You" : review.authorName)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                if let date = review.formattedDate {
                    Text("· \(date)").font(.caption).foregroundStyle(.secondary)
                }
                if review.isVerified == true {
                    Label("Verified", systemImage: "checkmark.seal.fill")
                        .font(.caption2).foregroundStyle(.green)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(review.ratingValue) star review by \(isOwn ? "you" : review.authorName). \(review.reviewText ?? "")")
    }

    private func stars(_ value: Int) -> some View {
        HStack(spacing: 2) {
            ForEach(1...5, id: \.self) { i in
                Image(systemName: i <= value ? "star.fill" : "star")
                    .font(.caption)
                    .foregroundStyle(i <= value ? .yellow : .gray.opacity(0.3))
            }
        }
        .accessibilityHidden(true)
    }
}

// MARK: - Composer

private struct ReviewComposer: View {
    let existing: UserRating?
    let isSubmitting: Bool
    let onSubmit: (Int, String) async -> Bool

    @Environment(\.dismiss) private var dismiss
    @State private var rating: Int
    @State private var text: String

    init(existing: UserRating?, isSubmitting: Bool, onSubmit: @escaping (Int, String) async -> Bool) {
        self.existing = existing
        self.isSubmitting = isSubmitting
        self.onSubmit = onSubmit
        _rating = State(initialValue: existing?.ratingValue ?? 0)
        _text = State(initialValue: existing?.reviewText ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Your rating") {
                    HStack(spacing: 8) {
                        ForEach(1...5, id: \.self) { i in
                            Button {
                                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                rating = i
                            } label: {
                                Image(systemName: i <= rating ? "star.fill" : "star")
                                    .font(.title2)
                                    .foregroundStyle(i <= rating ? .yellow : .gray.opacity(0.4))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("\(i) star\(i == 1 ? "" : "s")")
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
                Section("Your review (optional)") {
                    TextField("Share what you thought…", text: $text, axis: .vertical)
                        .lineLimit(4...10)
                }
            }
            .navigationTitle(existing == nil ? "Write a Review" : "Edit Review")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Post") {
                        Task { _ = await onSubmit(rating, text.trimmingCharacters(in: .whitespacesAndNewlines)) }
                    }
                    .disabled(rating == 0 || isSubmitting)
                }
            }
        }
    }
}

#Preview {
    ScrollView { ReviewsSection(contentType: "restaurant", contentId: "preview") }
}
