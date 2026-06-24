import SwiftUI

/// A single Best-Of category: voting booth + live leaderboard (IOS-PARITY-005).
/// Voting requires auth; signed-out users get a sign-in prompt (a soft funnel to
/// account creation). Votes are optimistic and revert on failure.
struct BestOfCategoryView: View {
    @State private var viewModel: BestOfCategoryViewModel

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
        .navigationTitle(viewModel.category.name)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await viewModel.refresh() }
        .task { await viewModel.load() }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(viewModel.category.name).font(.title.bold())
            if let description = viewModel.category.description, !description.isEmpty {
                Text(description).font(.subheadline).foregroundStyle(.secondary)
            }
            Text("\(viewModel.totalVotes) total vote\(viewModel.totalVotes == 1 ? "" : "s")")
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 4)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Voting booth

    @ViewBuilder
    private var votingBooth: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !viewModel.isAuthenticated {
                signInPrompt
            } else {
                if let vote = viewModel.userVote {
                    // Name the current pick so the user knows what they voted for,
                    // and how to change it (IOS-AUDIT-UX-031).
                    Label("You voted for \(vote.displayName) — search or write in to change.",
                          systemImage: "checkmark.seal.fill")
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(.green)
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
                            await viewModel.castVote(
                                entityType: nominee.type, entityId: nominee.id, customEntry: nil,
                                displayName: nominee.name, imageUrl: nominee.imageUrl
                            )
                        }
                    } label: {
                        nomineeRow(nominee)
                    }
                    .buttonStyle(.plain)
                    .disabled(viewModel.isVoting)
                }

                writeInRow
            }
        }
        .padding(16)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
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
                    .padding(10)
                    .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 10))
                Button("Vote") {
                    let entry = writeIn.trimmingCharacters(in: .whitespaces)
                    guard !entry.isEmpty else { return }
                    Task {
                        let ok = await viewModel.castVote(
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
        } else if !viewModel.results.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Label("Current Rankings", systemImage: "trophy.fill")
                    .font(.title3.bold())
                    .foregroundStyle(.primary)
                    .accessibilityAddTraits(.isHeader)

                ForEach(Array(viewModel.results.enumerated()), id: \.element.id) { index, result in
                    leaderboardRow(result, rank: index)
                }
            }
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
                    Text(result.displayName).font(.subheadline.weight(.semibold)).lineLimit(1)
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
                            .frame(width: geo.size.width * CGFloat(result.voteCount) / CGFloat(total), height: 6)
                    }
                }
                .frame(height: 6)
            }

            Text("\(pct)%")
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
                .frame(width: 38, alignment: .trailing)
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(isMyPick ? Color.accentColor.opacity(0.6) : .clear, lineWidth: 1.5)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Rank \(rank + 1), \(result.displayName), \(result.voteCount) votes, \(pct) percent\(isMyPick ? ", your pick" : "")")
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
