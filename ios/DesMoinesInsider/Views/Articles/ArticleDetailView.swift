import SwiftUI

/// Native article/guide reader (IOS-PARITY-002). Renders the same markdown the
/// web `/articles/:slug` page does, with a hero image, byline meta, save +
/// share, a free-tier ad slot, in-app browser for links, and a related rail.
struct ArticleDetailView: View {
    let article: Article

    @State private var favorites = FavoritesService.shared
    @State private var related: [Article] = []
    @State private var browseTarget: AdTarget?
    @State private var showShareSheet = false
    @State private var toast: String?

    private let service = ArticlesService.shared

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if let url = article.featuredImageUrl, !url.isEmpty {
                    heroImage(url)
                }

                VStack(alignment: .leading, spacing: 18) {
                    header
                    Divider()

                    // Body — interactive links open the in-app browser.
                    // IOS-AUDIT-BUG-005: an article with no body used to render an
                    // empty VStack, so the screen looked broken rather than
                    // explaining itself. Offer the web version instead.
                    if article.hasContent {
                        ArticleMarkdownView(markdown: article.content)
                            .environment(\.openURL, OpenURLAction { url in
                                openLink(url)
                                return .handled
                            })
                    } else {
                        emptyBodyFallback
                    }

                    // Free-tier ad slot inside the reader (IOS-ADS-010/012).
                    // AdSlot renders nothing for subscribers.
                    AdSlot(.detail)

                    if !related.isEmpty {
                        relatedRail
                    }
                }
                .padding(.horizontal)
            }
            .padding(.bottom, 32)
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { saveButton }
            ToolbarItem(placement: .topBarTrailing) { shareButton }
        }
        .sheet(item: $browseTarget) { target in
            NavigationStack {
                WebViewPage(title: article.displayCategory, url: target.url)
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button("Done") { browseTarget = nil }
                        }
                    }
            }
        }
        .sheet(isPresented: $showShareSheet) {
            ShareSheet(items: [shareText, article.webURL])
        }
        .overlay(alignment: .bottom) {
            if let toast {
                Text(toast)
                    .font(.footnote.weight(.semibold))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(.bottom, 24)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
        .navigationDestination(for: Article.self) { ArticleDetailView(article: $0) }
        .task {
            // Jump-back-in (Dashboard), Spotlight indexing, view count + related.
            RecentlyViewedService.shared.record(
                type: "article", id: article.id, title: article.title, imageUrl: article.featuredImageUrl
            )
            await SpotlightService.shared.indexArticles([article])
            await service.incrementViewCount(id: article.id, current: article.viewCount)
            related = await service.fetchRelated(category: article.category, excludingId: article.id)
        }
    }

    // MARK: - Hero

    private func heroImage(_ url: String) -> some View {
        CachedAsyncImage(url: url) {
            ZStack {
                Rectangle().fill(Color.blue.opacity(0.12))
                Image(systemName: "doc.richtext")
                    .font(.system(size: 56))
                    .foregroundStyle(.blue.opacity(0.3))
            }
        }
        .frame(maxWidth: .infinity, minHeight: 240, maxHeight: 240)
        .clipped()
        .accessibilityHidden(true)
    }

    // MARK: - Header (title + meta)

    /// Shown when an article has no body (IOS-AUDIT-BUG-005).
    ///
    /// The article still has a title, an image and a category, so the screen is
    /// not empty -- what is missing is the text. Saying so and offering the web
    /// version is better than a blank column that reads as a loading failure the
    /// user could retry out of.
    private var emptyBodyFallback: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("This article does not have a readable version yet.")
                .font(.body)
                .foregroundStyle(.secondary)

            // Article.webURL already builds this and is covered by a test, so
            // there is no second place for the /articles/<slug> shape to drift.
            Button {
                openLink(article.webURL)
            } label: {
                Label("Read on the web", systemImage: "safari")
            }
            .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 8)
    }


    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(article.displayCategory, systemImage: "tag")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.accentColor)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(Color.accentColor.opacity(0.12), in: Capsule())

            Text(article.title)
                .font(.largeTitle.bold())
                .frame(maxWidth: .infinity, alignment: .leading)

            HStack(spacing: 12) {
                if let formattedDate = article.formattedDate {
                    Label(formattedDate, systemImage: "calendar")
                }
                Label(article.readingTimeText, systemImage: "clock")
            }
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: - Toolbar buttons

    private var saveButton: some View {
        Button {
            toggleSave()
        } label: {
            Image(systemName: favorites.isArticleFavorited(article.id) ? "bookmark.fill" : "bookmark")
        }
        .accessibilityLabel(favorites.isArticleFavorited(article.id) ? "Remove from saved" : "Save article")
    }

    private var shareButton: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            showShareSheet = true
        } label: {
            Image(systemName: "square.and.arrow.up")
        }
        .accessibilityLabel("Share article")
    }

    // MARK: - Related rail

    private var relatedRail: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("More \(article.displayCategory) guides")
                .font(.title3.bold())

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    ForEach(related) { item in
                        NavigationLink(value: item) {
                            ContentCard(item.cardData, variant: .compact, decorative: true)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.vertical, 2)
            }
        }
        .padding(.top, 4)
    }

    // MARK: - Actions

    private func openLink(_ url: URL) {
        // Article body links are content-supplied — only open safe web schemes
        // in the in-app browser; drop and log anything else (IOS-AUDIT-SEC-002).
        guard url.isSafeWebLink else {
            AppLogger.nav.warning("Dropped unsafe article link (scheme: \(url.scheme ?? "nil"))")
            return
        }
        browseTarget = AdTarget(url: url)
    }

    private func toggleSave() {
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
        withAnimation { toast = message }
        Task {
            try? await Task.sleep(for: .seconds(2))
            withAnimation { toast = nil }
        }
    }

    private var shareText: String {
        "\(article.title)\n\n\(article.displaySummary)\n\nRead on Des Moines Insider"
    }
}

#Preview {
    NavigationStack {
        ArticleDetailView(article: .preview)
    }
}
