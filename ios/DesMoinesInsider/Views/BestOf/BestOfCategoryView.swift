import SwiftUI

/// A single Best-Of category: voting booth + live leaderboard (IOS-PARITY-005).
/// Voting requires auth; signed-out users get a sign-in prompt (a soft funnel to
/// account creation). Votes are optimistic and revert on failure.
struct BestOfCategoryView: View {
    @State private var viewModel: BestOfCategoryViewModel
    /// Leaderboard shows the top 10 until the user asks for more.
    @State private var showAll = false
    /// A tapped leaderboard row, opened in place (the SponsoredPickCard pattern).
    @State private var resolverTarget: MainTabView.DeepLinkPresentation?

    init(category: VotingCategory) {
        _viewModel = State(wrappedValue: BestOfCategoryViewModel(category: category))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header
                votingBooth
                leaderboard
            }
            .padding(.horizontal)
            .padding(.bottom, 28)
        }
        // The voting booth holds a nominee search field and a write-in field, and
        // the leaderboard sits below both - so with the keyboard up the thing the
        // user is typing about was unreachable and there was no gesture to put the
        // keyboard away short of finding a Done button (IOS-AUDIT-UX-056).
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle(viewModel.category.name)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await viewModel.refresh() }
        .task { await viewModel.load() }
        .sheet(item: $resolverTarget) { DeepLinkResolverView(presentation: $0) }
    }

    private var category: VotingCategory { viewModel.category }

    /// The page on the web for this category, shared from results and picks.
    private var shareURL: URL {
        Config.siteURL.appendingPathComponent("best-of").appendingPathComponent(category.slug)
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(viewModel.category.name).font(.title.bold())
            if let description = viewModel.category.description, !description.isEmpty {
                Text(description).font(.subheadline).foregroundStyle(.secondary)
            }
            HStack(spacing: 8) {
                Text("\(viewModel.totalVotes) total vote\(viewModel.totalVotes == 1 ? "" : "s")")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                if category.isVotingOpen, let closes = category.closesAt {
                    Text("Voting closes \(closes.formatted(.dateTime.month(.abbreviated).day()))")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color.accentColor.opacity(0.12), in: Capsule())
                        .foregroundStyle(Color.accentColor)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 4)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Voting booth

    /// Closed round: final results. Open round: the booth, or once the user
    /// has voted and changes aren't possible, just their pick
    /// (IOS-DD-GUIDES-07/09).
    @ViewBuilder
    private var votingBooth: some View {
        if !category.isVotingOpen {
            finalResultsCard
        } else {
            VStack(alignment: .leading, spacing: 12) {
                if !viewModel.isAuthenticated {
                    signInPrompt
                } else if let vote = viewModel.userVote, !VotingService.voteChangeAvailable {
                    votedFinal(vote)
                } else {
                    openBooth
                }
            }
            .padding(16)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
        }
    }

    private func pickName(for vote: Vote) -> String? {
        viewModel.results.first { $0.id == vote.resultKey }?.displayName ?? vote.customEntry
    }

    @ViewBuilder
    private func votedFinal(_ vote: Vote) -> some View {
        let name = viewModel.justVotedFor ?? pickName(for: vote)
        Label(name.map { "You voted for \($0). Votes are final for this round." }
                ?? "You've voted. Votes are final for this round.",
              systemImage: "checkmark.seal.fill")
            .font(.footnote.weight(.medium))
            .foregroundStyle(.green)
        if viewModel.justVotedWriteIn {
            Text("Write-ins appear on the board once 3 people pick them.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        if let name {
            sharePickLink(name)
        }
    }

    private func sharePickLink(_ pick: String) -> some View {
        ShareLink(
            item: shareURL,
            message: Text("I voted \(pick) for \(category.name) in Des Moines")
        ) {
            Label("Share my pick", systemImage: "square.and.arrow.up")
                .font(.subheadline.weight(.semibold))
        }
    }

    @ViewBuilder
    private var openBooth: some View {
        if let vote = viewModel.userVote {
            // Name the current pick so the user knows what they voted for,
            // and how to change it (IOS-AUDIT-UX-031). Only reached when vote
            // changes are available (VotingService.voteChangeAvailable).
            Label(pickName(for: vote).map { "You voted for \($0) — search or write in to change." }
                    ?? "You've voted — search or write in to change your pick.",
                  systemImage: "checkmark.seal.fill")
                .font(.footnote.weight(.medium))
                .foregroundStyle(.green)
            if let just = viewModel.justVotedFor {
                sharePickLink(just)
            }
        }

        if let error = viewModel.errorMessage {
            Label(error, systemImage: "exclamationmark.triangle.fill")
                .font(.footnote)
                .foregroundStyle(.red)
        }

        searchField
        if viewModel.isSearching {
            ProgressView().frame(maxWidth: .infinity).padding(.vertical, 4)
        }
        ForEach(viewModel.searchResults) { nominee in
            Button {
                Task {
                    await vote(entityType: nominee.type, entityId: nominee.id, customEntry: nil,
                               displayName: nominee.name, imageUrl: nominee.imageUrl)
                }
            } label: {
                nomineeRow(nominee)
            }
            .buttonStyle(.plain)
            .disabled(viewModel.isVoting)
        }

        writeInRow
    }

    /// Casts through the view model and confirms with a haptic.
    @discardableResult
    private func vote(entityType: String, entityId: String?, customEntry: String?,
                      displayName: String, imageUrl: String?) async -> Bool {
        let ok = await viewModel.castVote(
            entityType: entityType, entityId: entityId, customEntry: customEntry,
            displayName: displayName, imageUrl: imageUrl
        )
        UINotificationFeedbackGenerator().notificationOccurred(ok ? .success : .error)
        return ok
    }

    // MARK: - Final results (closed round)

    private var finalResultsCard: some View {
        let winner = viewModel.results.first?.displayName
        return VStack(alignment: .leading, spacing: 10) {
            Label("Voting closed", systemImage: "trophy.fill")
                .font(.headline)
                .foregroundStyle(Color(red: 0.96, green: 0.76, blue: 0.20))
            Text("Final results")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            if viewModel.isLoading && viewModel.results.isEmpty {
                ProgressView()
            } else {
                Text(winner ?? (viewModel.loadError != nil ? "Results unavailable" : "No winner this round"))
                    .font(.title2.bold())
                    .fixedSize(horizontal: false, vertical: true)
                if let winner {
                    ShareLink(
                        item: shareURL,
                        message: Text("\(winner) won \(category.name) in Des Moines")
                    ) {
                        Label("Share the winner", systemImage: "square.and.arrow.up")
                            .font(.subheadline.weight(.semibold))
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .contain)
    }

    private var signInPrompt: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Sign in to vote", systemImage: "person.crop.circle.badge.plus")
                .font(.headline)
            Text("Create a free account to cast your pick and help decide the best of Des Moines.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            NavigationLink {
                AuthView()
            } label: {
                Text("Sign In or Create Account")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 12))
                    .foregroundStyle(.white)
            }
        }
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            TextField("Search for a place to vote for…", text: $viewModel.searchQuery)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
            if !viewModel.searchQuery.isEmpty {
                Button { viewModel.searchQuery = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                }
                .accessibilityLabel("Clear search")
            }
        }
        .padding(10)
        .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 10))
    }

    private func nomineeRow(_ nominee: VoteNominee) -> some View {
        HStack(spacing: 12) {
            CachedAsyncImage(url: nominee.imageUrl) {
                ZStack {
                    Rectangle().fill(Color.secondary.opacity(0.15))
                    Image(systemName: nominee.type == "restaurant" ? "fork.knife" : "mountain.2.fill")
                        .foregroundStyle(.secondary)
                }
            }
            .frame(width: 40, height: 40)
            .clipShape(RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 2) {
                Text(nominee.name).font(.subheadline.weight(.medium)).lineLimit(1)
                Text(nominee.type.capitalized).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "checkmark.circle").foregroundStyle(Color.accentColor)
        }
        .padding(.vertical, 4)
        .accessibilityLabel("Vote for \(nominee.name), \(nominee.type)")
    }

    @State private var writeIn = ""
    @State private var showWriteIn = false

    @ViewBuilder
    private var writeInRow: some View {
        Divider()
        if showWriteIn {
            HStack(spacing: 8) {
                TextField("Enter a place name…", text: $writeIn)
                    .textInputAutocapitalization(.words)
                    // votes_guard keeps 80 characters; stop typing there
                    // rather than silently truncating (IOS-DD-GUIDES-06).
                    .onChange(of: writeIn) { _, value in
                        if value.count > 80 { writeIn = String(value.prefix(80)) }
                    }
                    .padding(10)
                    .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 10))
                Button("Vote") {
                    let entry = writeIn.trimmingCharacters(in: .whitespaces)
                    guard !entry.isEmpty else { return }
                    Task {
                        let ok = await vote(
                            entityType: "custom", entityId: nil, customEntry: entry,
                            displayName: entry, imageUrl: nil
                        )
                        if ok { writeIn = ""; showWriteIn = false }
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(writeIn.trimmingCharacters(in: .whitespaces).isEmpty || viewModel.isVoting)
            }
        } else {
            Button {
                showWriteIn = true
            } label: {
                Label("Can't find it? Write in your pick", systemImage: "square.and.pencil")
                    .font(.footnote.weight(.medium))
            }
        }
    }

    // MARK: - Leaderboard

    @ViewBuilder
    private var leaderboard: some View {
        if viewModel.isLoading && viewModel.results.isEmpty {
            ProgressView().frame(maxWidth: .infinity).padding()
        } else {
            VStack(alignment: .leading, spacing: 12) {
                Label(category.isVotingOpen ? "Current Rankings" : "Final Rankings", systemImage: "trophy.fill")
                    .font(.title3.bold())
                    .foregroundStyle(.primary)
                    .accessibilityAddTraits(.isHeader)
                leaderboardRows
            }
        }
    }

    @ViewBuilder
    private var leaderboardRows: some View {
        if viewModel.loadError != nil && viewModel.results.isEmpty {
            leaderboardError
        } else if viewModel.results.isEmpty {
            Text("No votes yet - be the first to pick the best \(category.subjectName).")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        } else {
            let visible = VoteResult.visible(viewModel.results, showAll: showAll)
            ForEach(Array(visible.enumerated()), id: \.element.id) { index, result in
                leaderboardEntry(result, rank: index)
            }
            if !showAll && viewModel.results.count > visible.count {
                Button("Show all \(viewModel.results.count)") { showAll = true }
                    .font(.subheadline.weight(.semibold))
            }
        }
    }

    private var leaderboardError: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.yellow)
            Text("Couldn't load the rankings.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
            Button("Retry") { Task { await viewModel.refresh() } }
                .font(.subheadline.bold())
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    /// Restaurant and attraction rows open the listing; write-ins and events
    /// stay plain rows.
    @ViewBuilder
    private func leaderboardEntry(_ result: VoteResult, rank: Int) -> some View {
        if let target = Self.presentation(for: result) {
            Button { resolverTarget = target } label: { leaderboardRow(result, rank: rank) }
                .buttonStyle(.plain)
                .accessibilityHint("Opens the listing")
        } else {
            leaderboardRow(result, rank: rank)
        }
    }

    nonisolated static func presentation(for result: VoteResult) -> MainTabView.DeepLinkPresentation? {
        guard let id = result.entityId else { return nil }
        switch result.entityType {
        case "restaurant": return .restaurant(id)
        case "attraction": return .attraction(id)
        default: return nil
        }
    }

    private func leaderboardRow(_ result: VoteResult, rank: Int) -> some View {
        let total = max(viewModel.totalVotes, 1)
        let pct = Int((Double(result.voteCount) / Double(total) * 100).rounded())
        let isMyPick = viewModel.votedKey == result.id

        return HStack(spacing: 12) {
            rankBadge(rank)

            CachedAsyncImage(url: result.imageUrl) {
                ZStack {
                    Rectangle().fill(Color.secondary.opacity(0.15))
                    Text(result.placeholderEmoji).font(.title3)
                }
            }
            .frame(width: 44, height: 44)
            .clipShape(RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    Text(result.displayName).font(.subheadline.weight(.semibold)).lineLimit(2)
                    if isMyPick {
                        Text("Your pick")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(Color.accentColor)
                    }
                }
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color(.systemGray5)).frame(height: 6)
                        Capsule().fill(Color.accentColor)
                            // Clamp to [0,1]: guards divide-by-zero (total == 0 →
                            // NaN width) and optimistic voteCount > stale total
                            // overflowing the track.
                            .frame(width: geo.size.width * CGFloat(total > 0 ? min(1, Double(result.voteCount) / Double(total)) : 0), height: 6)
                    }
                }
                .frame(height: 6)
            }

            Text("\(pct)%")
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
                .fixedSize()
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(isMyPick ? Color.accentColor.opacity(0.6) : .clear, lineWidth: 1.5)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Rank \(rank + 1), \(result.displayName), \(result.voteCount) vote\(result.voteCount == 1 ? "" : "s"), \(pct) percent\(isMyPick ? ", your pick" : "")")
    }

    @ViewBuilder
    private func rankBadge(_ rank: Int) -> some View {
        let medalColors: [Color] = [Color(red: 0.96, green: 0.76, blue: 0.20), Color(.systemGray2), Color(red: 0.72, green: 0.45, blue: 0.20)]
        if rank < 3 {
            Image(systemName: "medal.fill")
                .font(.title3)
                .foregroundStyle(medalColors[rank])
                .frame(width: 28)
        } else {
            Text("\(rank + 1)")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.secondary)
                .frame(width: 28)
        }
    }
}

#Preview {
    NavigationStack {
        BestOfCategoryView(category: VotingCategory(
            id: "c1", name: "Best Pizza", slug: "best-pizza",
            description: "Vote for the best pizza in Des Moines", icon: "pizza",
            isActive: true, votingStart: nil, votingEnd: nil, createdAt: nil
        ))
    }
}
