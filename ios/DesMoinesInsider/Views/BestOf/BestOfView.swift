import SwiftUI

/// "Best Of" community voting hub (IOS-PARITY-005). Lists active voting
/// categories; tapping one opens its leaderboard + voting booth.
///
/// Standalone owns a NavigationStack; pushed from the Discover hub it inherits
/// the ambient one.
struct BestOfView: View {
    var ownsNavigationStack: Bool = true

    @State private var viewModel = BestOfViewModel()

    var body: some View {
        if ownsNavigationStack {
            NavigationStack { content }
        } else {
            content
        }
    }

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header

                if let error = viewModel.errorMessage, viewModel.categories.isEmpty {
                    errorBanner(error)
                } else if viewModel.isLoading && viewModel.categories.isEmpty {
                    ForEach(0..<6, id: \.self) { _ in categorySkeleton }
                } else if viewModel.categories.isEmpty {
                    EmptyStateView(
                        icon: "trophy",
                        title: "No Categories Yet",
                        message: "Voting categories will appear here soon. Check back!"
                    )
                    .padding(.top, 30)
                } else {
                    LazyVStack(spacing: 12) {
                        ForEach(viewModel.categories) { category in
                            NavigationLink(value: category) {
                                categoryRow(category)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    // Returning from a category re-reads the ballot so a new
                    // vote shows its check mark (IOS-DD-GUIDES-10).
                    .onAppear { Task { await viewModel.refreshVoted() } }
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 24)
        }
        .navigationTitle("Best Of DSM")
        .navigationBarTitleDisplayMode(.large)
        .refreshable { await viewModel.refresh() }
        .navigationDestination(for: VotingCategory.self) { BestOfCategoryView(category: $0) }
        .task { await viewModel.loadInitialData() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Vote for the best of Des Moines")
                .font(.title3.bold())
            Text("Cast your pick in each category and watch the leaderboard update.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            ballotProgressView
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var ballotProgressView: some View {
        let progress = viewModel.ballotProgress
        if viewModel.isSignedIn && progress.total > 0 {
            VStack(alignment: .leading, spacing: 4) {
                Text("Your ballot: \(progress.voted) of \(progress.total)")
                    .font(.caption.weight(.semibold))
                ProgressView(value: Double(progress.voted), total: Double(progress.total))
                    .tint(.green)
            }
            .padding(.top, 6)
        }
    }

    private func categoryRow(_ category: VotingCategory) -> some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 12)
                    .fill(LinearGradient(
                        colors: [Color(red: 0.98, green: 0.75, blue: 0.14), Color(red: 0.96, green: 0.55, blue: 0.11)],
                        startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 48, height: 48)
                Image(systemName: category.systemImage)
                    .font(.title3)
                    .foregroundStyle(.white)
            }
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                Text(category.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                if !category.isVotingOpen {
                    Text("Closed")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                if let description = category.description, !description.isEmpty {
                    Text(description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }

            Spacer(minLength: 0)

            if hasVoted(category) {
                Image(systemName: "checkmark.seal.fill")
                    .foregroundStyle(.green)
            }
            VStack(spacing: 2) {
                Text("\(category.voteCount)")
                    .font(.subheadline.weight(.bold))
                Text(category.voteCount == 1 ? "vote" : "votes")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(rowAccessibilityLabel(category))
        .accessibilityHint("Opens the category to vote and see rankings")
    }

    private func hasVoted(_ category: VotingCategory) -> Bool {
        viewModel.votedCategoryIds.contains(category.id)
    }

    private func rowAccessibilityLabel(_ category: VotingCategory) -> String {
        var label = "\(category.name). \(category.voteCount) \(category.voteCount == 1 ? "vote" : "votes")"
        if hasVoted(category) { label += ". You voted" }
        if !category.isVotingOpen { label += ". Closed" }
        return label
    }

    private var categorySkeleton: some View {
        HStack(spacing: 14) {
            Skeleton.block(height: 48, radius: 12).frame(width: 48)
            VStack(alignment: .leading, spacing: 6) {
                Skeleton.bar(width: 160)
                Skeleton.bar(width: 120, height: 12)
            }
            Spacer()
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
        .accessibilityHidden(true)
    }

    private func errorBanner(_ error: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.yellow)
            Text(error).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            Spacer()
            Button { Task { await viewModel.refresh() } } label: {
                Text("Retry").font(.caption.bold()).foregroundStyle(Color.accentColor)
            }
        }
        .padding(12)
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 10))
    }
}

#Preview {
    BestOfView()
}
