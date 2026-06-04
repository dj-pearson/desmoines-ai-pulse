import SwiftUI

/// Articles & Guides hub (IOS-PARITY-002). Lists the same published content the
/// web `/articles` surface shows, with search, category filter chips, an
/// in-feed ad slot, and navigation into the native reader.
///
/// Like `DiscoverHubView`/`TripPlannerView`, it renders its own
/// `NavigationStack` when standalone (`ownsNavigationStack`) and inherits the
/// ambient stack when pushed from the Discover hub.
struct ArticlesView: View {
    var ownsNavigationStack: Bool = true

    @State private var viewModel = ArticlesViewModel()
    @State private var favorites = FavoritesService.shared
    @State private var favoriteToast: String?

    var body: some View {
        if ownsNavigationStack {
            NavigationStack { content }
        } else {
            content
        }
    }

    private var content: some View {
        ScrollView {
            VStack(spacing: 14) {
                if let error = viewModel.errorMessage {
                    errorBanner(error)
                }

                if viewModel.isLoading && viewModel.articles.isEmpty {
                    ForEach(0..<5, id: \.self) { _ in ContentCardSkeleton(.listRow) }
                } else if viewModel.articles.isEmpty {
                    EmptyStateView(
                        icon: "doc.richtext",
                        title: "No Guides Found",
                        message: viewModel.activeFilterCount > 0
                            ? "Try a different category or search."
                            : "Check back soon for local guides and stories.",
                        actionTitle: viewModel.activeFilterCount > 0 ? "Clear Filters" : nil,
                        action: viewModel.activeFilterCount > 0 ? { viewModel.clearFilters() } : nil
                    )
                    .padding(.top, 40)
                } else {
                    LazyVStack(spacing: 12) {
                        ForEach(Array(viewModel.articles.enumerated()), id: \.element.id) { index, article in
                            NavigationLink(value: article) {
                                articleCard(article)
                            }
                            .buttonStyle(.plain)
                            .task { await viewModel.loadMoreIfNeeded(currentItem: article) }

                            // In-feed free-tier ad after the first few cards
                            // (IOS-ADS-010/012); renders nothing for subscribers.
                            if index == AdConfig.inFeedFirstSlot - 1 {
                                AdSlot(.feed)
                            }
                        }

                        if viewModel.isLoadingMore {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                                .padding()
                        }
                    }
                }
            }
            .padding(.horizontal)
        }
        // Sticky category chips under the title (IOS-IA-004).
        .safeAreaInset(edge: .top, spacing: 0) {
            if !viewModel.categories.isEmpty {
                StickyFilterBar {
                    categoryChips.padding(.horizontal, 14)
                }
            }
        }
        .refreshable {
            await viewModel.refresh()
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        }
        .navigationTitle("Articles & Guides")
        .navigationBarTitleDisplayMode(.large)
        .searchable(
            text: $viewModel.searchText,
            placement: .navigationBarDrawer(displayMode: .always),
            prompt: "Search guides…"
        )
        .navigationDestination(for: Article.self) { ArticleDetailView(article: $0) }
        .task { await viewModel.loadInitialData() }
        .overlay(alignment: .bottom) {
            if let favoriteToast {
                Text(favoriteToast)
                    .font(.footnote.weight(.semibold))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(.bottom, 24)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
    }

    // MARK: - Card

    private func articleCard(_ article: Article) -> some View {
        var data = article.cardData
        data.favorite = .external(
            isFavorited: favorites.isArticleFavorited(article.id),
            name: article.title,
            onToggle: { toggleSave(article) }
        )
        return ContentCard(data, variant: .listRow)
    }

    // MARK: - Category chips

    private var categoryChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip(title: "All", selected: viewModel.selectedCategory == nil) {
                    viewModel.selectedCategory = nil
                }
                ForEach(viewModel.categories, id: \.self) { category in
                    chip(title: category, selected: viewModel.selectedCategory == category) {
                        viewModel.selectedCategory =
                            viewModel.selectedCategory == category ? nil : category
                    }
                }
            }
        }
    }

    private func chip(title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            action()
        } label: {
            Text(title)
                .font(.caption.weight(.medium))
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .foregroundStyle(selected ? .white : .primary)
                .background(selected ? Color.accentColor : Color(.systemGray6), in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(title) category \(selected ? "selected" : "")")
    }

    // MARK: - Error banner

    private func errorBanner(_ error: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.yellow)
            Text(error)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
            Spacer()
            Button {
                Task { await viewModel.refresh() }
            } label: {
                Text("Retry")
                    .font(.caption.bold())
                    .foregroundStyle(Color.accentColor)
            }
        }
        .padding(12)
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Favorites

    private func toggleSave(_ article: Article) {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        let wasSaved = favorites.isArticleFavorited(article.id)
        Task {
            do {
                _ = try await favorites.toggleFavoriteArticle(articleId: article.id)
                showToast(wasSaved ? "Removed from saved" : "Saved to your guides")
            } catch {
                showToast("Couldn't update saved")
            }
        }
    }

    private func showToast(_ message: String) {
        withAnimation { favoriteToast = message }
        Task {
            try? await Task.sleep(for: .seconds(2))
            withAnimation { favoriteToast = nil }
        }
    }
}

#Preview {
    ArticlesView()
}
