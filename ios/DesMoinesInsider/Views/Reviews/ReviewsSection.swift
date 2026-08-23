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
    @State private var showDeleteConfirmation = false
    @State private var toast: ToastMessage?
    /// Reviews rendered right now. A non-lazy VStack builds every child the
    /// moment the section appears, and this section sits at the BOTTOM of a
    /// detail screen - so on a listing with two hundred reviews the user paid
    /// to construct all two hundred rows before seeing the top of the page,
    /// having scrolled to none of them (IOS-AUDIT-PERF-031).
    @State private var visibleCount = Self.initialVisibleCount

    /// Enough to show the section is populated and worth scrolling into.
    private static let initialVisibleCount = 5

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
                ForEach(viewModel.reviews.prefix(visibleCount)) { review in
                    reviewRow(review)
                }
                if viewModel.reviews.count > visibleCount {
                    showAllButton(remaining: viewModel.reviews.count - visibleCount)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .task { await viewModel.load() }
        // A new content id is a different listing, so the cap starts over.
        // Without this, opening a restaurant with 200 reviews and then one
        // with 3 leaves the second expanded for no reason the user asked for.
        .onChange(of: contentId) { _, _ in visibleCount = Self.initialVisibleCount }
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
                    // Confirm the outcome instead of fire-and-forget (UX-023).
                    Task {
                        let ok = await viewModel.report(target)
                        toast = ok
                            ? .success("Thanks — we'll review this.")
                            : .error(viewModel.errorMessage ?? "Couldn't submit your report.")
                    }
                }
                reportTarget = nil
            }
            Button("Cancel", role: .cancel) { reportTarget = nil }
        }
        // Confirm before deleting and report the outcome (UX-023).
        .confirmationDialog("Delete your review?", isPresented: $showDeleteConfirmation,
                            titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                Task {
                    let ok = await viewModel.deleteOwnReview()
                    toast = ok
                        ? .success("Your review was deleted.")
                        : .error(viewModel.errorMessage ?? "Couldn't delete your review.")
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .toastOverlay(message: $toast)
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

    /// Reveals the rest in one step rather than paginating.
    ///
    /// Paging would mean a page size, a loading state and a "load more"
    /// nobody can reach with VoiceOver without extra work, to save building
    /// rows the user has explicitly asked to see. One tap, everything, done.
    private func showAllButton(remaining: Int) -> some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) {
                visibleCount = viewModel.reviews.count
            }
        } label: {
            Text("Show \(remaining) more review\(remaining == 1 ? "" : "s")")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.accentColor)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 4)
        }
        .buttonStyle(.plain)
    }

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
                            showDeleteConfirmation = true
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
                            // 44pt target so the required rating isn't mis-tapped
                            // (IOS-AUDIT-UX-040).
                            .minHitTarget()
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
            // Dismiss the keyboard by dragging so the Post action stays reachable
            // while the multiline field is focused (IOS-AUDIT-UX-040).
            .scrollDismissesKeyboard(.interactively)
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
